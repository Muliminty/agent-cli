/**
 * 实时更新系统
 * 设计思路：通过WebSocket实现实时数据同步，支持事件订阅、状态同步和离线队列
 *
 * 功能特点：
 * 1. 事件订阅 - 客户端可以订阅特定类型的事件
 * 2. 状态同步 - 实时同步应用状态变化
 * 3. 离线队列 - 离线时缓存消息，上线后重发
 * 4. 自动重连 - 网络断开时自动重连
 * 5. 心跳检测 - 保持连接活跃
 *
 * 踩坑提醒：
 * 1. 连接管理要处理各种网络状态
 * 2. 消息队列要避免内存泄漏
 * 3. 重连策略要避免服务器压力
 * 4. 状态同步要处理冲突解决
 */

class RealtimeUpdater {
  constructor() {
    this.ws = null
    this.connected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
    this.reconnectDelay = 1000
    this.maxReconnectDelay = 30000

    this.subscriptions = new Set()
    this.offlineQueue = []
    this.maxQueueSize = 100
    this.heartbeatInterval = null
    this.heartbeatTimeout = null

    this.eventHandlers = new Map()

    // 绑定方法
    this.init = this.init.bind(this)
    this.connect = this.connect.bind(this)
    this.disconnect = this.disconnect.bind(this)
    this.reconnect = this.reconnect.bind(this)
    this.send = this.send.bind(this)
    this.subscribe = this.subscribe.bind(this)
    this.unsubscribe = this.unsubscribe.bind(this)
    this.on = this.on.bind(this)
    this.off = this.off.bind(this)
    this.emit = this.emit.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
    this.handleOfflineQueue = this.handleOfflineQueue.bind(this)
    this.startHeartbeat = this.startHeartbeat.bind(this)
    this.stopHeartbeat = this.stopHeartbeat.bind(this)
  }

  /**
   * 初始化实时更新系统
   */
  init() {
    console.log('初始化实时更新系统')

    // 监听网络状态
    this.setupNetworkListeners()

    // 监听应用事件
    this.setupAppListeners()

    // 连接WebSocket
    this.connect()

    console.log('实时更新系统初始化完成')
  }

  /**
   * 连接WebSocket
   */
  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('WebSocket已连接或正在连接')
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = protocol + '//' + window.location.host + '/ws'

    console.log('正在连接WebSocket:', wsUrl)

    try {
      this.ws = new WebSocket(wsUrl)
      this.setupWebSocketListeners()
    } catch (error) {
      console.error('创建WebSocket连接失败:', error)
      this.handleConnectionError(error)
    }
  }

  /**
   * 断开WebSocket连接
   */
  disconnect() {
    if (this.ws) {
      console.log('断开WebSocket连接')
      this.stopHeartbeat()
      this.ws.close()
      this.ws = null
      this.connected = false
    }
  }

  /**
   * 重新连接
   */
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('已达到最大重连次数，停止重连')
      app.addNotification({
        type: 'error',
        title: '连接失败',
        message: '无法连接到服务器，请检查网络连接',
        duration: 10000
      })
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), this.maxReconnectDelay)

    console.log(`第 ${this.reconnectAttempts} 次重连，${delay}ms后重试`)

    app.addNotification({
      type: 'warning',
      title: '正在重连',
      message: `连接断开，${delay / 1000}秒后重试 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      duration: 3000
    })

    setTimeout(() => {
      this.connect()
    }, delay)
  }

  /**
   * 发送消息
   */
  send(type, data, options = {}) {
    const { queueIfOffline = true, retry = 3 } = options

    const message = {
      type,
      data,
      id: this.generateMessageId(),
      timestamp: Date.now()
    }

    // 如果已连接，直接发送
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message))
        console.log('发送WebSocket消息:', type, message.id)
        return message.id
      } catch (error) {
        console.error('发送WebSocket消息失败:', error)
        if (queueIfOffline) {
          this.addToOfflineQueue(message)
        }
        return null
      }
    }

    // 如果未连接但允许离线队列，添加到队列
    if (queueIfOffline) {
      console.log('WebSocket未连接，消息已加入离线队列:', type, message.id)
      this.addToOfflineQueue(message)
      return message.id
    }

    console.warn('WebSocket未连接，消息未发送:', type)
    return null
  }

  /**
   * 订阅事件
   */
  subscribe(event) {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.add(event)

      // 如果已连接，立即订阅
      if (this.connected) {
        this.send('subscribe', { events: [event] }, { queueIfOffline: false })
      }

      console.log('订阅事件:', event)
    }
  }

  /**
   * 取消订阅事件
   */
  unsubscribe(event) {
    if (this.subscriptions.has(event)) {
      this.subscriptions.delete(event)

      // 如果已连接，立即取消订阅
      if (this.connected) {
        this.send('unsubscribe', { events: [event] }, { queueIfOffline: false })
      }

      console.log('取消订阅事件:', event)
    }
  }

  /**
   * 监听事件
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event).add(handler)
  }

  /**
   * 取消监听事件
   */
  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).delete(handler)
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => {
        try {
          handler(data)
        } catch (error) {
          console.error(`事件处理错误 (${event}):`, error)
        }
      })
    }
  }

  /**
   * 设置WebSocket监听器
   */
  setupWebSocketListeners() {
    if (!this.ws) return

    this.ws.onopen = () => {
      console.log('WebSocket连接已建立')
      this.connected = true
      this.reconnectAttempts = 0

      // 更新连接状态
      this.updateConnectionStatus(true)

      // 开始心跳检测
      this.startHeartbeat()

      // 重新订阅之前的事件
      if (this.subscriptions.size > 0) {
        this.send('subscribe', { events: Array.from(this.subscriptions) }, { queueIfOffline: false })
      }

      // 处理离线队列
      this.handleOfflineQueue()

      // 触发连接事件
      this.emit('connected')
      app.emit('websocketConnected')
    }

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.handleMessage(message)
      } catch (error) {
        console.error('解析WebSocket消息失败:', error)
      }
    }

    this.ws.onclose = (event) => {
      console.log('WebSocket连接已关闭:', event.code, event.reason)
      this.connected = false
      this.stopHeartbeat()

      // 更新连接状态
      this.updateConnectionStatus(false)

      // 触发断开事件
      this.emit('disconnected')
      app.emit('websocketDisconnected')

      // 如果不是正常关闭，尝试重连
      if (event.code !== 1000 && event.code !== 1005) {
        this.reconnect()
      }
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket错误:', error)
      this.handleConnectionError(error)
    }
  }

  /**
   * 处理消息
   */
  handleMessage(message) {
    const { type, data, id } = message

    console.log('收到WebSocket消息:', type, id)

    // 重置心跳超时
    this.resetHeartbeat()

    // 处理特定类型的消息
    switch (type) {
      case 'welcome':
        console.log('收到欢迎消息:', data)
        this.emit('welcome', data)
        break

      case 'pong':
        // 心跳响应
        break

      case 'subscription_updated':
        console.log('订阅状态已更新:', data)
        this.emit('subscription_updated', data)
        break

      case 'ping':
        // 响应心跳
        this.send('pong', { timestamp: Date.now() }, { queueIfOffline: false })
        break

      default:
        // 触发对应类型的事件
        this.emit(type, data)

        // 同时触发到应用事件系统
        app.emit(type, data)
    }
  }

  /**
   * 处理连接错误
   */
  handleConnectionError(error) {
    console.error('WebSocket连接错误:', error)

    app.addNotification({
      type: 'error',
      title: '连接错误',
      message: '无法连接到实时更新服务器',
      duration: 5000
    })

    // 尝试重连
    this.reconnect()
  }

  /**
   * 更新连接状态
   */
  updateConnectionStatus(connected) {
    const indicator = document.getElementById('connectionIndicator')
    if (!indicator) return

    if (connected) {
      indicator.className = 'connection-status connected'
      indicator.innerHTML = '<i class="fas fa-plug"></i><span>已连接</span>'
    } else {
      indicator.className = 'connection-status disconnected'
      indicator.innerHTML = '<i class="fas fa-plug"></i><span>已断开</span>'
    }
  }

  /**
   * 添加到离线队列
   */
  addToOfflineQueue(message) {
    // 检查队列大小
    if (this.offlineQueue.length >= this.maxQueueSize) {
      console.warn('离线队列已满，丢弃最早的消息')
      this.offlineQueue.shift()
    }

    this.offlineQueue.push(message)
    console.log('消息已加入离线队列，当前队列大小:', this.offlineQueue.length)
  }

  /**
   * 处理离线队列
   */
  handleOfflineQueue() {
    if (this.offlineQueue.length === 0) return

    console.log('开始处理离线队列，消息数量:', this.offlineQueue.length)

    // 按时间排序（最早的先发送）
    this.offlineQueue.sort((a, b) => a.timestamp - b.timestamp)

    // 发送队列中的消息
    const failedMessages = []
    const sentMessages = []

    for (const message of this.offlineQueue) {
      try {
        this.ws.send(JSON.stringify(message))
        sentMessages.push(message.id)
        console.log('离线消息已发送:', message.type, message.id)
      } catch (error) {
        console.error('发送离线消息失败:', message.type, error)
        failedMessages.push(message)
      }
    }

    // 更新队列（只保留发送失败的消息）
    this.offlineQueue = failedMessages

    // 显示通知
    if (sentMessages.length > 0) {
      app.addNotification({
        type: 'success',
        title: '离线消息已同步',
        message: `已发送 ${sentMessages.length} 条离线消息`,
        duration: 3000
      })
    }

    console.log('离线队列处理完成，成功:', sentMessages.length, '失败:', failedMessages.length)
  }

  /**
   * 开始心跳检测
   */
  startHeartbeat() {
    this.stopHeartbeat()

    // 发送心跳
    this.heartbeatInterval = setInterval(() => {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send('ping', { timestamp: Date.now() }, { queueIfOffline: false })
      }
    }, 30000) // 每30秒发送一次心跳

    // 设置心跳超时
    this.resetHeartbeat()
  }

  /**
   * 停止心跳检测
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
      this.heartbeatTimeout = null
    }
  }

  /**
   * 重置心跳超时
   */
  resetHeartbeat() {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout)
    }

    // 设置心跳超时（60秒）
    this.heartbeatTimeout = setTimeout(() => {
      console.warn('心跳超时，断开连接')
      this.disconnect()
      this.reconnect()
    }, 60000)
  }

  /**
   * 设置网络监听器
   */
  setupNetworkListeners() {
    // 监听网络状态变化
    window.addEventListener('online', () => {
      console.log('网络已恢复')
      app.addNotification({
        type: 'success',
        title: '网络恢复',
        message: '网络连接已恢复',
        duration: 3000
      })

      // 如果未连接，尝试重连
      if (!this.connected) {
        this.reconnect()
      }
    })

    window.addEventListener('offline', () => {
      console.log('网络已断开')
      app.addNotification({
        type: 'warning',
        title: '网络断开',
        message: '网络连接已断开，部分功能可能受限',
        duration: 5000
      })
    })

    // 监听页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !this.connected) {
        console.log('页面变为可见，尝试重连')
        this.reconnect()
      }
    })
  }

  /**
   * 设置应用监听器
   */
  setupAppListeners() {
    // 监听应用事件
    app.on('refreshData', () => {
      this.send('refresh', { timestamp: Date.now() })
    })

    // 项目操作事件
    app.on('projectOperation', (data) => {
      this.send('project_operation', data)
    })

    // 聊天消息事件
    app.on('chatMessage', (data) => {
      this.send('chat_message', data)
    })
  }

  /**
   * 生成消息ID
   */
  generateMessageId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus() {
    return {
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      offlineQueueSize: this.offlineQueue.length,
      subscriptions: Array.from(this.subscriptions)
    }
  }

  /**
   * 清除离线队列
   */
  clearOfflineQueue() {
    const count = this.offlineQueue.length
    this.offlineQueue = []
    console.log('离线队列已清除，消息数量:', count)
    return count
  }

  /**
   * 批量订阅事件
   */
  batchSubscribe(events) {
    events.forEach(event => this.subscribe(event))
  }

  /**
   * 批量取消订阅事件
   */
  batchUnsubscribe(events) {
    events.forEach(event => this.unsubscribe(event))
  }

  /**
   * 发送带确认的消息
   */
  sendWithAck(type, data, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const messageId = this.generateMessageId()
      const ackEvent = `${type}_ack_${messageId}`

      // 设置确认超时
      const timeoutId = setTimeout(() => {
        this.off(ackEvent, ackHandler)
        reject(new Error('确认超时'))
      }, timeout)

      // 确认处理器
      const ackHandler = (ackData) => {
        clearTimeout(timeoutId)
        this.off(ackEvent, ackHandler)
        resolve(ackData)
      }

      // 监听确认事件
      this.on(ackEvent, ackHandler)

      // 发送消息
      const sent = this.send(type, { ...data, _ackId: messageId })

      if (!sent) {
        clearTimeout(timeoutId)
        this.off(ackEvent, ackHandler)
        reject(new Error('发送失败'))
      }
    })
  }

  /**
   * 发送带进度的消息
   */
  sendWithProgress(type, data, progressCallback) {
    const messageId = this.generateMessageId()
    const progressEvent = `${type}_progress_${messageId}`

    // 监听进度事件
    const progressHandler = (progressData) => {
      if (progressCallback) {
        progressCallback(progressData)
      }
    }

    this.on(progressEvent, progressHandler)

    // 发送消息
    const sent = this.send(type, { ...data, _progressId: messageId })

    if (!sent) {
      this.off(progressEvent, progressHandler)
      return null
    }

    // 返回取消函数
    return () => {
      this.off(progressEvent, progressHandler)
    }
  }
}

/**
 * 创建并初始化实时更新实例
 */
const realtimeUpdater = new RealtimeUpdater()

/**
 * 导出
 */
window.realtimeUpdater = realtimeUpdater

/**
 * 工具函数：检查网络状态
 */
function isOnline() {
  return navigator.onLine
}

/**
 * 工具函数：等待连接
 */
function waitForConnection(timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (realtimeUpdater.connected) {
      resolve()
      return
    }

    const timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error('等待连接超时'))
    }, timeout)

    const connectedHandler = () => {
      cleanup()
      resolve()
    }

    const cleanup = () => {
      clearTimeout(timeoutId)
      realtimeUpdater.off('connected', connectedHandler)
    }

    realtimeUpdater.on('connected', connectedHandler)
  })
}

/**
 * 工具函数：发送确保送达的消息
 */
async function sendGuaranteed(type, data, options = {}) {
  const { maxRetries = 3, retryDelay = 1000 } = options

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 等待连接
      if (!realtimeUpdater.connected) {
        await waitForConnection(5000)
      }

      // 发送带确认的消息
      const result = await realtimeUpdater.sendWithAck(type, data, 10000)
      return result

    } catch (error) {
      console.error(`发送消息失败 (尝试 ${attempt}/${maxRetries}):`, error)

      if (attempt === maxRetries) {
        throw error
      }

      // 等待重试
      await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
    }
  }
}

/**
 * 导出工具函数
 */
window.isOnline = isOnline
window.waitForConnection = waitForConnection
window.sendGuaranteed = sendGuaranteed

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  // 延迟初始化，等待其他组件加载
  setTimeout(() => {
    realtimeUpdater.init()

    // 订阅常用事件
    realtimeUpdater.batchSubscribe([
      'project_created',
      'project_updated',
      'project_deleted',
      'project_status',
      'chat_response',
      'operation_started',
      'operation_completed',
      'operation_failed',
      'notification'
    ])
  }, 500)
})