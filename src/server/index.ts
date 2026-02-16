/**
 * Web服务器核心实现
 * 设计思路：集成Express服务器到现有CLI，提供可视化仪表板和API服务
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import compression from 'compression'
import { createLogger } from '../utils/logger.js'
import type { Config } from '../types/config.js'
import projectRouter from './api/project.js'
import { WebSocketServer } from 'ws'
import { createServer as createHttpServer, type Server as HttpServer } from 'http'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'https'
import { readFileSync } from 'fs'
import { join } from 'path'

const logger = createLogger('server')

export interface ServerOptions {
  config: Config
  cwd?: string
}

export interface ServerInstance {
  app: Express
  httpServer: HttpServer | HttpsServer
  wsServer?: WebSocketServer
  start: () => Promise<void>
  stop: () => Promise<void>
  getUrl: () => string
  broadcastToSubscribers?: (eventType: string, message: any) => void
}

/**
 * 创建Web服务器实例
 * @param options 服务器选项
 * @returns 服务器实例
 */
export async function createServer(options: ServerOptions): Promise<ServerInstance> {
  const { config, cwd = process.cwd() } = options
  const serverConfig = config.server

  if (!serverConfig.enabled) {
    throw new Error('服务器配置未启用，请检查配置中的server.enabled')
  }

  logger.info('正在创建Web服务器...', {
    port: serverConfig.port,
    host: serverConfig.host
  })

  // 创建Express应用
  const app = express()

  // 应用中间件
  applyMiddleware(app, serverConfig)

  // 创建HTTP/HTTPS服务器
  const httpServer = createHttpServer(app)

  // 创建WebSocket服务器
  let wsServer: WebSocketServer | undefined
  if (serverConfig.websocket.enabled) {
    wsServer = createWebSocketServer(httpServer, serverConfig)
  }

  // 设置路由
  setupRoutes(app, serverConfig, cwd)

  // 设置错误处理
  setupErrorHandling(app)

  const instance: ServerInstance = {
    app,
    httpServer,
    wsServer,
    start: () => startServer(instance, serverConfig),
    stop: () => stopServer(instance),
    getUrl: () => `http://${serverConfig.host}:${serverConfig.port}`,
    broadcastToSubscribers: wsServer ? (eventType: string, message: any) => {
      // 通过wsServer对象上的broadcastToSubscribers方法调用
      if ((wsServer as any).broadcastToSubscribers) {
        (wsServer as any).broadcastToSubscribers(eventType, message)
      }
    } : undefined
  }

  return instance
}

/**
 * 应用中间件
 */
function applyMiddleware(app: Express, config: Config['server']): void {
  const { cors: corsConfig, compression: compressionConfig } = config

  // 基础中间件
  app.use(express.json({ limit: '10mb' }))
  app.use(express.urlencoded({ extended: true }))

  // CORS
  if (corsConfig.enabled) {
    const corsOptions = {
      origin: corsConfig.origin === '*' ? '*' : corsConfig.origin,
      methods: corsConfig.methods,
      allowedHeaders: corsConfig.allowedHeaders,
      credentials: corsConfig.credentials,
      maxAge: corsConfig.maxAge
    }
    app.use(cors(corsOptions))
  }

  // 压缩
  if (compressionConfig.enabled) {
    app.use(compression({
      threshold: compressionConfig.threshold,
      level: compressionConfig.level
    }))
  }

  // 请求日志
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    const { method, originalUrl, ip } = req

    res.on('finish', () => {
      const duration = Date.now() - start
      const { statusCode } = res
      const logLevel = statusCode >= 400 ? 'warn' : 'info'
      logger[logLevel](`${method} ${originalUrl} ${statusCode} ${duration}ms`, {
        ip,
        userAgent: req.get('user-agent'),
        contentLength: res.get('content-length')
      })
    })

    next()
  })
}

/**
 * 创建WebSocket服务器
 */
function createWebSocketServer(httpServer: HttpServer | HttpsServer, config: Config['server']): WebSocketServer {
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: config.websocket.path
  })

  const connections = new Set<WebSocket>()
  // 客户端ID到WebSocket连接的映射
  const clientConnections = new Map<string, WebSocket>()
  // 客户端订阅映射：clientId -> Set<eventType>
  const subscriptions = new Map<string, Set<string>>()

  wsServer.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substring(7)
    const clientIp = req.socket.remoteAddress || 'unknown'

    logger.info('WebSocket客户端已连接', { clientId, clientIp })

    connections.add(ws)
    // 存储客户端ID到连接的映射
    clientConnections.set(clientId, ws)
    // 初始化客户端的订阅集合
    subscriptions.set(clientId, new Set())

    // 发送欢迎消息
    ws.send(JSON.stringify({
      type: 'welcome',
      data: {
        clientId,
        timestamp: Date.now(),
        message: '已连接到agent-cli服务器'
      }
    }))

    // 心跳检测
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping()
      }
    }, config.websocket.pingInterval)

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        handleWebSocketMessage(ws, message, clientId, subscriptions)
      } catch (error) {
        logger.error('WebSocket消息处理失败', { error, clientId })
      }
    })

    ws.on('close', () => {
      logger.info('WebSocket客户端已断开', { clientId })
      connections.delete(ws)
      clientConnections.delete(clientId)
      subscriptions.delete(clientId)
      clearInterval(pingInterval)
    })

    ws.on('error', (error) => {
      logger.error('WebSocket错误', { error, clientId })
    })
  })

  // 广播消息到所有客户端
  const broadcast = (message: any) => {
    const data = JSON.stringify(message)
    connections.forEach(client => {
      if (client.readyState === client.OPEN) {
        client.send(data)
      }
    })
  }

  // 广播消息到订阅特定事件的客户端
  const broadcastToSubscribers = (eventType: string, message: any) => {
    const data = JSON.stringify({
      type: eventType,
      data: message,
      timestamp: Date.now()
    })

    // 查找所有订阅了该事件的客户端
    let sentCount = 0
    subscriptions.forEach((clientEvents, clientId) => {
      if (clientEvents.has(eventType)) {
        // 通过clientId找到对应的WebSocket连接
        const clientWs = clientConnections.get(clientId)
        if (clientWs && clientWs.readyState === clientWs.OPEN) {
          clientWs.send(data)
          sentCount++
        }
      }
    })

    logger.debug(`向订阅者广播事件`, { eventType, sentCount, totalSubscriptions: subscriptions.size })
  }

  // 存储广播函数供外部使用
  ;(wsServer as any).broadcast = broadcast
  ;(wsServer as any).broadcastToSubscribers = broadcastToSubscribers

  logger.info('WebSocket服务器已启动', { path: config.websocket.path })

  return wsServer
}

/**
 * 处理WebSocket消息
 */
function handleWebSocketMessage(
  ws: WebSocket,
  message: any,
  clientId: string,
  subscriptions: Map<string, Set<string>>
): void {
  const { type, data } = message

  switch (type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', data: { timestamp: Date.now() } }))
      break
    case 'subscribe':
      logger.debug('客户端订阅事件', { clientId, events: data.events })
      // 实现事件订阅逻辑
      if (data.events && Array.isArray(data.events)) {
        const clientSubscriptions = subscriptions.get(clientId)
        if (clientSubscriptions) {
          data.events.forEach((event: string) => {
            clientSubscriptions.add(event)
          })
          ws.send(JSON.stringify({
            type: 'subscription_updated',
            data: {
              subscribed: Array.from(clientSubscriptions),
              message: '订阅成功'
            }
          }))
        }
      }
      break
    case 'unsubscribe':
      logger.debug('客户端取消订阅事件', { clientId, events: data.events })
      // 实现事件取消订阅逻辑
      if (data.events && Array.isArray(data.events)) {
        const clientSubscriptions = subscriptions.get(clientId)
        if (clientSubscriptions) {
          data.events.forEach((event: string) => {
            clientSubscriptions.delete(event)
          })
          ws.send(JSON.stringify({
            type: 'subscription_updated',
            data: {
              subscribed: Array.from(clientSubscriptions),
              message: '取消订阅成功'
            }
          }))
        }
      }
      break
    default:
      logger.warn('未知的WebSocket消息类型', { clientId, type })
  }
}

/**
 * 构建完整路径，处理basePath为'/'的情况
 */
function buildPath(basePath: string, path: string): string {
  // 规范化basePath，确保不以斜杠结尾
  const normalizedBase = basePath === '/' ? '' : basePath.replace(/\/$/, '')
  // 规范化路径，确保以斜杠开头
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return normalizedBase + normalizedPath
}

/**
 * 设置路由
 */
function setupRoutes(app: Express, config: Config['server'], cwd: string): void {
  const { staticFiles, basePath } = config

  // 健康检查端点
  app.get(buildPath(basePath, '/health'), (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      version: process.env.npm_package_version || '1.0.0'
    })
  })

  // API版本信息
  app.get(buildPath(basePath, '/api/version'), (req: Request, res: Response) => {
    res.json({
      name: 'agent-cli',
      version: process.env.npm_package_version || '1.0.0',
      apiVersion: 'v1',
      documentation: buildPath(basePath, '/api/docs')
    })
  })

  // 项目API路由
  app.use(buildPath(basePath, '/api/project'), projectRouter)

  // 静态文件服务
  if (staticFiles.enabled) {
    const staticDir = join(cwd, staticFiles.directory)
    app.use(buildPath(basePath, '/'), express.static(staticDir, {
      maxAge: staticFiles.maxAge * 1000, // 转换为毫秒
      index: staticFiles.index ? ['index.html'] : false
    }))

    // SPA路由回退
    if (staticFiles.fallback) {
      const fallbackFile = join(staticDir, staticFiles.fallback)
      app.get(buildPath(basePath, '/*'), (req: Request, res: Response) => {
        res.sendFile(fallbackFile)
      })
    }

    logger.info('静态文件服务已启用', { directory: staticDir })
  }

  // 404处理
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `无法找到资源: ${req.method} ${req.originalUrl}`,
      timestamp: Date.now()
    })
  })
}

/**
 * 设置错误处理
 */
function setupErrorHandling(app: Express): void {
  // 错误处理中间件
  app.use((error: any, req: Request, res: Response, next: NextFunction) => {
    logger.error('服务器错误', {
      error: error.message,
      stack: error.stack,
      url: req.originalUrl,
      method: req.method
    })

    const statusCode = error.statusCode || 500
    const message = error.message || 'Internal Server Error'

    res.status(statusCode).json({
      error: message,
      timestamp: Date.now(),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    })
  })
}

/**
 * 启动服务器
 */
async function startServer(instance: ServerInstance, config: Config['server']): Promise<void> {
  const { httpServer, wsServer } = instance
  const { port, host, timeout, keepAliveTimeout, maxHeadersCount } = config

  // 配置服务器参数
  httpServer.timeout = timeout
  httpServer.keepAliveTimeout = keepAliveTimeout
  httpServer.maxHeadersCount = maxHeadersCount

  return new Promise((resolve, reject) => {
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`端口 ${port} 已被占用`, { error })
        reject(new Error(`端口 ${port} 已被占用，请使用其他端口或停止占用该端口的进程`))
      } else {
        logger.error('服务器启动失败', { error })
        reject(error)
      }
    })

    httpServer.listen(port, host, () => {
      const url = instance.getUrl()
      logger.info('Web服务器已启动', {
        url,
        port,
        host,
        websocket: !!wsServer,
        pid: process.pid
      })

      // 输出访问信息
      console.log(`
🚀 agent-cli 可视化服务器已启动！

📊 仪表板: ${url}
🔌 WebSocket: ${url}${config.websocket.path}
📈 API端点: ${url}/api/version
❤️  健康检查: ${url}/health

按 Ctrl+C 停止服务器
      `)

      resolve()
    })
  })
}

/**
 * 停止服务器
 */
async function stopServer(instance: ServerInstance): Promise<void> {
  const { httpServer, wsServer } = instance

  return new Promise((resolve) => {
    logger.info('正在停止服务器...')

    // 关闭WebSocket连接
    if (wsServer) {
      wsServer.clients.forEach(client => {
        client.close()
      })
      wsServer.close()
    }

    // 关闭HTTP服务器
    httpServer.close(() => {
      logger.info('服务器已停止')
      resolve()
    })

    // 强制超时
    setTimeout(() => {
      logger.warn('服务器强制关闭（超时）')
      httpServer.closeAllConnections()
      resolve()
    }, 5000)
  })
}

/**
 * 创建开发服务器（用于CLI命令）
 */
export async function createDevServer(config: Config, cwd?: string): Promise<ServerInstance> {
  // 在开发模式下启用服务器
  const devConfig = {
    ...config,
    server: {
      ...config.server,
      enabled: true
    }
  }

  return createServer({ config: devConfig, cwd })
}