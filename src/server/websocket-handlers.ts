/**
 * WebSocket消息处理器
 * 设计思路：扩展WebSocket功能，支持实时聊天、项目状态更新、操作反馈
 *
 * 功能特点：
 * 1. 实时聊天 - 支持WebSocket实时消息推送
 * 2. 项目状态更新 - 实时推送项目创建、更新、删除状态
 * 3. 操作反馈 - 实时反馈用户操作结果
 * 4. 事件订阅 - 客户端可以订阅特定类型的事件
 *
 * 踩坑提醒：
 * 1. 连接管理要处理断开重连
 * 2. 消息格式要统一，便于前端解析
 * 3. 广播消息要控制频率，避免性能问题
 * 4. 错误处理要完善，避免连接中断
 */

import { createLogger } from '../utils/logger.js'
import type { WebSocket } from 'ws'
import { randomUUID } from 'crypto'

const logger = createLogger('websocket:handlers')

/**
 * WebSocket消息类型
 */
export type WebSocketMessageType =
  | 'ping'
  | 'pong'
  | 'subscribe'
  | 'unsubscribe'
  | 'chat_message'
  | 'chat_response'
  | 'project_created'
  | 'project_updated'
  | 'project_deleted'
  | 'project_status'
  | 'operation_started'
  | 'operation_completed'
  | 'operation_failed'
  | 'notification'
  | 'error'

/**
 * WebSocket消息格式
 */
export interface WebSocketMessage {
  type: WebSocketMessageType
  data: any
  id?: string
  timestamp: number
}

/**
 * 客户端连接信息
 */
export interface ClientConnection {
  ws: WebSocket
  clientId: string
  clientIp: string
  subscriptions: Set<string>
  lastActivity: number
}

/**
 * WebSocket处理器配置
 */
export interface WebSocketHandlerConfig {
  pingInterval: number
  maxConnections: number
  reconnectAttempts: number
  reconnectDelay: number
}

/**
 * 创建WebSocket处理器
 */
export function createWebSocketHandlers(config: WebSocketHandlerConfig) {
  const connections = new Map<string, ClientConnection>()
  const clientConnections = new Map<string, WebSocket>()
  const subscriptions = new Map<string, Set<string>>()

  /**
   * 处理新连接
   */
  function handleConnection(ws: WebSocket, req: any): string {
    const clientId = randomUUID()
    const clientIp = req.socket.remoteAddress || 'unknown'

    logger.info('WebSocket客户端已连接', { clientId, clientIp })

    const connection: ClientConnection = {
      ws,
      clientId,
      clientIp,
      subscriptions: new Set(),
      lastActivity: Date.now()
    }

    connections.set(clientId, connection)
    clientConnections.set(clientId, ws)
    subscriptions.set(clientId, new Set())

    // 发送欢迎消息
    sendMessage(ws, {
      type: 'welcome',
      data: {
        clientId,
        timestamp: Date.now(),
        message: '已连接到agent-cli服务器',
        config: {
          pingInterval: config.pingInterval,
          maxConnections: config.maxConnections
        }
      }
    })

    // 设置心跳检测
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        sendMessage(ws, { type: 'ping', data: { timestamp: Date.now() } })
      }
    }, config.pingInterval)

    // 设置消息处理器
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        handleMessage(ws, message, clientId)
        connection.lastActivity = Date.now()
      } catch (error) {
        logger.error('WebSocket消息处理失败', { error, clientId })
        sendError(ws, '消息解析失败', error)
      }
    })

    // 处理连接关闭
    ws.on('close', () => {
      logger.info('WebSocket客户端已断开', { clientId })
      connections.delete(clientId)
      clientConnections.delete(clientId)
      subscriptions.delete(clientId)
      clearInterval(pingInterval)
    })

    // 处理错误
    ws.on('error', (error) => {
      logger.error('WebSocket错误', { error, clientId })
      connections.delete(clientId)
      clientConnections.delete(clientId)
      subscriptions.delete(clientId)
      clearInterval(pingInterval)
    })

    return clientId
  }

  /**
   * 处理消息
   */
  function handleMessage(ws: WebSocket, message: any, clientId: string): void {
    const { type, data, id } = message

    logger.debug('收到WebSocket消息', { clientId, type })

    switch (type) {
      case 'ping':
        sendMessage(ws, { type: 'pong', data: { timestamp: Date.now() } })
        break

      case 'subscribe':
        handleSubscribe(clientId, data)
        break

      case 'unsubscribe':
        handleUnsubscribe(clientId, data)
        break

      case 'chat_message':
        handleChatMessage(clientId, data, id)
        break

      case 'project_operation':
        handleProjectOperation(clientId, data, id)
        break

      default:
        logger.warn('未知的WebSocket消息类型', { clientId, type })
        sendError(ws, '未知的消息类型', { type })
    }
  }

  /**
   * 处理事件订阅
   */
  function handleSubscribe(clientId: string, data: any): void {
    const { events } = data

    if (!events || !Array.isArray(events)) {
      logger.warn('无效的订阅请求', { clientId, events })
      return
    }

    const clientSubscriptions = subscriptions.get(clientId)
    if (!clientSubscriptions) {
      logger.warn('客户端订阅不存在', { clientId })
      return
    }

    const addedEvents: string[] = []
    events.forEach((event: string) => {
      if (!clientSubscriptions.has(event)) {
        clientSubscriptions.add(event)
        addedEvents.push(event)
      }
    })

    logger.debug('客户端订阅事件', { clientId, addedEvents })

    const clientWs = clientConnections.get(clientId)
    if (clientWs) {
      sendMessage(clientWs, {
        type: 'subscription_updated',
        data: {
          subscribed: Array.from(clientSubscriptions),
          added: addedEvents,
          message: '订阅成功'
        }
      })
    }
  }

  /**
   * 处理事件取消订阅
   */
  function handleUnsubscribe(clientId: string, data: any): void {
    const { events } = data

    if (!events || !Array.isArray(events)) {
      logger.warn('无效的取消订阅请求', { clientId, events })
      return
    }

    const clientSubscriptions = subscriptions.get(clientId)
    if (!clientSubscriptions) {
      logger.warn('客户端订阅不存在', { clientId })
      return
    }

    const removedEvents: string[] = []
    events.forEach((event: string) => {
      if (clientSubscriptions.has(event)) {
        clientSubscriptions.delete(event)
        removedEvents.push(event)
      }
    })

    logger.debug('客户端取消订阅事件', { clientId, removedEvents })

    const clientWs = clientConnections.get(clientId)
    if (clientWs) {
      sendMessage(clientWs, {
        type: 'subscription_updated',
        data: {
          subscribed: Array.from(clientSubscriptions),
          removed: removedEvents,
          message: '取消订阅成功'
        }
      })
    }
  }

  /**
   * 处理聊天消息
   */
  function handleChatMessage(clientId: string, data: any, messageId?: string): void {
    const { sessionId, message, files } = data

    logger.info('处理聊天消息', { clientId, sessionId, messageLength: message?.length })

    // 这里应该调用聊天API处理消息
    // 暂时模拟处理

    const clientWs = clientConnections.get(clientId)
    if (!clientWs) {
      logger.warn('客户端连接不存在', { clientId })
      return
    }

    // 发送操作开始通知
    sendMessage(clientWs, {
      type: 'operation_started',
      data: {
        operation: 'chat_message',
        messageId,
        timestamp: Date.now()
      }
    })

    // 模拟AI处理延迟
    setTimeout(() => {
      // 发送AI响应
      sendMessage(clientWs, {
        type: 'chat_response',
        data: {
          sessionId,
          message: {
            id: randomUUID(),
            role: 'assistant',
            content: `我已经收到你的消息：${message}\n\n我可以帮你分析代码、提供技术建议、调试问题等。请告诉我你需要什么帮助？`,
            timestamp: new Date().toISOString()
          },
          messageId
        }
      })

      // 发送操作完成通知
      sendMessage(clientWs, {
        type: 'operation_completed',
        data: {
          operation: 'chat_message',
          messageId,
          timestamp: Date.now()
        }
      })
    }, 1000)
  }

  /**
   * 处理项目操作
   */
  function handleProjectOperation(clientId: string, data: any, messageId?: string): void {
    const { operation, projectId, ...operationData } = data

    logger.info('处理项目操作', { clientId, operation, projectId })

    const clientWs = clientConnections.get(clientId)
    if (!clientWs) {
      logger.warn('客户端连接不存在', { clientId })
      return
    }

    // 发送操作开始通知
    sendMessage(clientWs, {
      type: 'operation_started',
      data: {
        operation,
        projectId,
        messageId,
        timestamp: Date.now()
      }
    })

    // 根据操作类型处理
    switch (operation) {
      case 'create':
        handleProjectCreate(clientWs, projectId, operationData, messageId)
        break
      case 'update':
        handleProjectUpdate(clientWs, projectId, operationData, messageId)
        break
      case 'delete':
        handleProjectDelete(clientWs, projectId, operationData, messageId)
        break
      case 'start':
        handleProjectStart(clientWs, projectId, operationData, messageId)
        break
      case 'stop':
        handleProjectStop(clientWs, projectId, operationData, messageId)
        break
      default:
        sendError(clientWs, '未知的项目操作', { operation })
    }
  }

  /**
   * 处理项目创建
   */
  function handleProjectCreate(ws: WebSocket, projectId: string, data: any, messageId?: string): void {
    // 模拟项目创建过程
    const steps = [
      { step: 'validating', message: '验证项目配置...' },
      { step: 'creating_dirs', message: '创建项目目录...' },
      { step: 'generating_files', message: '生成项目文件...' },
      { step: 'installing_deps', message: '安装依赖...' },
      { step: 'initializing_git', message: '初始化Git仓库...' }
    ]

    let currentStep = 0

    const processStep = () => {
      if (currentStep >= steps.length) {
        // 项目创建完成
        sendMessage(ws, {
          type: 'project_created',
          data: {
            projectId,
            success: true,
            message: '项目创建成功',
            project: {
              id: projectId,
              name: data.name,
              path: data.path,
              createdAt: new Date().toISOString(),
              status: 'created'
            },
            messageId
          }
        })

        sendMessage(ws, {
          type: 'operation_completed',
          data: {
            operation: 'create',
            projectId,
            messageId,
            timestamp: Date.now()
          }
        })

        // 广播给所有订阅者
        broadcastToSubscribers('project_created', {
          projectId,
          name: data.name,
          timestamp: Date.now()
        })

        return
      }

      const step = steps[currentStep]

      // 发送进度更新
      sendMessage(ws, {
        type: 'project_status',
        data: {
          projectId,
          step: step.step,
          message: step.message,
          progress: Math.round((currentStep / steps.length) * 100),
          timestamp: Date.now()
        }
      })

      currentStep++

      // 模拟处理延迟
      setTimeout(processStep, 500 + Math.random() * 1000)
    }

    processStep()
  }

  /**
   * 处理项目更新
   */
  function handleProjectUpdate(ws: WebSocket, projectId: string, data: any, messageId?: string): void {
    // 模拟项目更新过程
    setTimeout(() => {
      sendMessage(ws, {
        type: 'project_updated',
        data: {
          projectId,
          success: true,
          message: '项目更新成功',
          updates: data,
          messageId
        }
      })

      sendMessage(ws, {
        type: 'operation_completed',
        data: {
          operation: 'update',
          projectId,
          messageId,
          timestamp: Date.now()
        }
      })

      // 广播给所有订阅者
      broadcastToSubscribers('project_updated', {
        projectId,
        updates: data,
        timestamp: Date.now()
      })
    }, 1000)
  }

  /**
   * 处理项目删除
   */
  function handleProjectDelete(ws: WebSocket, projectId: string, data: any, messageId?: string): void {
    // 模拟项目删除过程
    setTimeout(() => {
      sendMessage(ws, {
        type: 'project_deleted',
        data: {
          projectId,
          success: true,
          message: '项目删除成功',
          messageId
        }
      })

      sendMessage(ws, {
        type: 'operation_completed',
        data: {
          operation: 'delete',
          projectId,
          messageId,
          timestamp: Date.now()
        }
      })

      // 广播给所有订阅者
      broadcastToSubscribers('project_deleted', {
        projectId,
        timestamp: Date.now()
      })
    }, 800)
  }

  /**
   * 处理项目启动
   */
  function handleProjectStart(ws: WebSocket, projectId: string, data: any, messageId?: string): void {
    // 模拟项目启动过程
    setTimeout(() => {
      sendMessage(ws, {
        type: 'project_status',
        data: {
          projectId,
          status: 'running',
          message: '项目已启动',
          messageId
        }
      })

      sendMessage(ws, {
        type: 'operation_completed',
        data: {
          operation: 'start',
          projectId,
          messageId,
          timestamp: Date.now()
        }
      })

      // 广播给所有订阅者
      broadcastToSubscribers('project_status', {
        projectId,
        status: 'running',
        timestamp: Date.now()
      })
    }, 500)
  }

  /**
   * 处理项目停止
   */
  function handleProjectStop(ws: WebSocket, projectId: string, data: any, messageId?: string): void {
    // 模拟项目停止过程
    setTimeout(() => {
      sendMessage(ws, {
        type: 'project_status',
        data: {
          projectId,
          status: 'stopped',
          message: '项目已停止',
          messageId
        }
      })

      sendMessage(ws, {
        type: 'operation_completed',
        data: {
          operation: 'stop',
          projectId,
          messageId,
          timestamp: Date.now()
        }
      })

      // 广播给所有订阅者
      broadcastToSubscribers('project_status', {
        projectId,
        status: 'stopped',
        timestamp: Date.now()
      })
    }, 300)
  }

  /**
   * 发送消息
   */
  function sendMessage(ws: WebSocket, message: Omit<WebSocketMessage, 'timestamp'>): void {
    if (ws.readyState !== ws.OPEN) {
      logger.warn('尝试向已关闭的连接发送消息', { readyState: ws.readyState })
      return
    }

    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: Date.now()
    }

    try {
      ws.send(JSON.stringify(fullMessage))
    } catch (error) {
      logger.error('发送WebSocket消息失败', { error })
    }
  }

  /**
   * 发送错误消息
   */
  function sendError(ws: WebSocket, message: string, details?: any): void {
    sendMessage(ws, {
      type: 'error',
      data: {
        message,
        details,
        timestamp: Date.now()
      }
    })
  }

  /**
   * 广播消息到所有客户端
   */
  function broadcast(message: WebSocketMessage): void {
    let sentCount = 0
    connections.forEach((connection) => {
      if (connection.ws.readyState === connection.ws.OPEN) {
        try {
          connection.ws.send(JSON.stringify(message))
          sentCount++
        } catch (error) {
          logger.error('广播消息失败', { clientId: connection.clientId, error })
        }
      }
    })

    logger.debug('广播消息完成', { sentCount, totalConnections: connections.size })
  }

  /**
   * 广播消息到订阅特定事件的客户端
   */
  function broadcastToSubscribers(eventType: string, data: any): void {
    const message: WebSocketMessage = {
      type: eventType as WebSocketMessageType,
      data,
      timestamp: Date.now()
    }

    let sentCount = 0
    subscriptions.forEach((clientEvents, clientId) => {
      if (clientEvents.has(eventType)) {
        const clientWs = clientConnections.get(clientId)
        if (clientWs && clientWs.readyState === clientWs.OPEN) {
          try {
            clientWs.send(JSON.stringify(message))
            sentCount++
          } catch (error) {
            logger.error('向订阅者发送消息失败', { clientId, error })
          }
        }
      }
    })

    logger.debug('向订阅者广播事件', { eventType, sentCount, totalSubscriptions: subscriptions.size })
  }

  /**
   * 获取连接统计
   */
  function getConnectionStats() {
    return {
      totalConnections: connections.size,
      activeConnections: Array.from(connections.values()).filter(
        conn => conn.ws.readyState === conn.ws.OPEN
      ).length,
      subscriptionStats: Array.from(subscriptions.entries()).reduce(
        (stats, [clientId, events]) => {
          events.forEach(event => {
            stats[event] = (stats[event] || 0) + 1
          })
          return stats
        },
        {} as Record<string, number>
      )
    }
  }

  /**
   * 清理不活跃连接
   */
  function cleanupInactiveConnections(maxInactiveTime: number = 5 * 60 * 1000): number {
    const now = Date.now()
    let cleanedCount = 0

    connections.forEach((connection, clientId) => {
      const inactiveTime = now - connection.lastActivity
      if (inactiveTime > maxInactiveTime) {
        logger.info('清理不活跃连接', { clientId, inactiveTime })
        connection.ws.close()
        connections.delete(clientId)
        clientConnections.delete(clientId)
        subscriptions.delete(clientId)
        cleanedCount++
      }
    })

    return cleanedCount
  }

  return {
    handleConnection,
    handleMessage,
    broadcast,
    broadcastToSubscribers,
    getConnectionStats,
    cleanupInactiveConnections,
    sendMessage,
    sendError
  }
}

/**
 * 创建WebSocket消息
 */
export function createWebSocketMessage(type: WebSocketMessageType, data: any, id?: string): WebSocketMessage {
  return {
    type,
    data,
    id,
    timestamp: Date.now()
  }
}

/**
 * 验证WebSocket消息
 */
export function validateWebSocketMessage(message: any): message is WebSocketMessage {
  return (
    message &&
    typeof message === 'object' &&
    typeof message.type === 'string' &&
    'data' in message &&
    typeof message.timestamp === 'number'
  )
}