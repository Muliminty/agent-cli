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
import projectManagementRouter from './api/project-management.js'
import projectWizardRouter from './api/project-wizard.js'
import chatRouter from './api/chat.js'
import cliCommandsRouter from './api/cli-commands.js'
import { WebSocketServer } from 'ws'
import { createServer as createHttpServer, type Server as HttpServer } from 'http'
import { createServer as createHttpsServer, type Server as HttpsServer } from 'https'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createWebSocketHandlers } from './websocket-handlers.js'

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

  // 创建WebSocket处理器
  const handlers = createWebSocketHandlers({
    pingInterval: config.websocket.pingInterval,
    maxConnections: config.websocket.maxConnections,
    reconnectAttempts: config.websocket.reconnectAttempts,
    reconnectDelay: config.websocket.reconnectDelay
  })

  wsServer.on('connection', (ws, req) => {
    const clientId = handlers.handleConnection(ws, req)

    // 心跳检测
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping()
      }
    }, config.websocket.pingInterval)

    ws.on('close', () => {
      logger.info('WebSocket客户端已断开', { clientId })
      clearInterval(pingInterval)
    })

    ws.on('error', (error) => {
      logger.error('WebSocket错误', { error, clientId })
    })
  })

  // 存储处理器函数供外部使用
  ;(wsServer as any).broadcast = handlers.broadcast
  ;(wsServer as any).broadcastToSubscribers = handlers.broadcastToSubscribers
  ;(wsServer as any).getConnectionStats = handlers.getConnectionStats
  ;(wsServer as any).cleanupInactiveConnections = handlers.cleanupInactiveConnections

  // 定期清理不活跃连接
  const cleanupInterval = setInterval(() => {
    const cleaned = handlers.cleanupInactiveConnections(10 * 60 * 1000) // 10分钟
    if (cleaned > 0) {
      logger.debug('清理不活跃连接', { cleaned })
    }
  }, 5 * 60 * 1000) // 每5分钟检查一次

  wsServer.on('close', () => {
    clearInterval(cleanupInterval)
  })

  logger.info('WebSocket服务器已启动', { path: config.websocket.path })

  return wsServer
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

  // 项目管理API路由（创建、初始化、管理）
  app.use(buildPath(basePath, '/api/project-management'), projectManagementRouter)

  // 项目向导API路由（可视化项目创建）
  app.use(buildPath(basePath, '/api/project-wizard'), projectWizardRouter)

  // 问答系统API路由（AI聊天功能）
  app.use(buildPath(basePath, '/api/chat'), chatRouter)

  // CLI命令API路由（执行CLI命令）
  app.use(buildPath(basePath, '/api/cli'), cliCommandsRouter)

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