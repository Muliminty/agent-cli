/**
 * 主应用逻辑
 * 设计思路：统一的状态管理和应用控制，协调各个模块的工作
 *
 * 功能特点：
 * 1. 状态管理 - 集中管理应用状态
 * 2. 路由控制 - 处理页面导航和视图切换
 * 3. 模块协调 - 协调各个功能模块的工作
 * 4. 事件总线 - 提供模块间通信机制
 * 5. 生命周期 - 管理应用初始化、挂载、卸载
 *
 * 踩坑提醒：
 * 1. 状态更新要使用不可变数据
 * 2. 事件监听要及时清理，避免内存泄漏
 * 3. 异步操作要处理加载状态和错误
 * 4. 路由变化要更新浏览器历史记录
 */

class AppState {
  constructor() {
    // 应用状态
    this.currentView = 'dashboard'
    this.currentProject = null
    this.chatSessions = new Map()
    this.projectTemplates = []
    this.activeWizard = null
    this.projects = []

    // UI状态
    this.sidebarCollapsed = false
    this.theme = localStorage.getItem('theme') || 'light'
    this.notifications = []

    // 连接状态
    this.websocket = null
    this.websocketConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5

    // 订阅管理
    this.subscriptions = new Set()

    // 绑定方法
    this.setCurrentView = this.setCurrentView.bind(this)
    this.setCurrentProject = this.setCurrentProject.bind(this)
    this.toggleSidebar = this.toggleSidebar.bind(this)
    this.toggleTheme = this.toggleTheme.bind(this)
    this.addNotification = this.addNotification.bind(this)
    this.removeNotification = this.removeNotification.bind(this)
    this.connectWebSocket = this.connectWebSocket.bind(this)
    this.disconnectWebSocket = this.disconnectWebSocket.bind(this)
    this.subscribe = this.subscribe.bind(this)
    this.unsubscribe = this.unsubscribe.bind(this)
  }

  /**
   * 设置当前视图
   */
  setCurrentView(view) {
    if (this.currentView !== view) {
      this.currentView = view
      this.emit('viewChanged', view)

      // 更新浏览器URL（不刷新页面）
      const url = new URL(window.location)
      url.searchParams.set('view', view)
      window.history.pushState({ view }, '', url)
    }
  }

  /**
   * 设置当前项目
   */
  setCurrentProject(project) {
    if (this.currentProject?.id !== project?.id) {
      this.currentProject = project
      this.emit('projectChanged', project)
    }
  }

  /**
   * 切换侧边栏状态
   */
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed
    this.emit('sidebarToggled', this.sidebarCollapsed)

    // 保存到localStorage
    localStorage.setItem('sidebarCollapsed', this.sidebarCollapsed)
  }

  /**
   * 切换主题
   */
  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', this.theme)
    localStorage.setItem('theme', this.theme)
    this.emit('themeChanged', this.theme)
  }

  /**
   * 添加通知
   */
  addNotification(notification) {
    const id = Date.now() + Math.random().toString(36).substr(2, 9)
    const fullNotification = {
      id,
      type: 'info',
      title: '',
      message: '',
      duration: 5000,
      ...notification,
      timestamp: Date.now()
    }

    this.notifications.push(fullNotification)
    this.emit('notificationAdded', fullNotification)

    // 自动移除通知
    if (fullNotification.duration > 0) {
      setTimeout(() => {
        this.removeNotification(id)
      }, fullNotification.duration)
    }

    return id
  }

  /**
   * 移除通知
   */
  removeNotification(id) {
    const index = this.notifications.findIndex(n => n.id === id)
    if (index !== -1) {
      const [removed] = this.notifications.splice(index, 1)
      this.emit('notificationRemoved', removed)
    }
  }

  /**
   * 连接WebSocket
   */
  connectWebSocket() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = protocol + '//' + window.location.host + '/ws'

    this.websocket = new WebSocket(wsUrl)
    this.websocketConnected = false

    this.websocket.onopen = () => {
      console.log('WebSocket连接已建立')
      this.websocketConnected = true
      this.reconnectAttempts = 0
      this.emit('websocketConnected')

      // 重新订阅之前的事件
      if (this.subscriptions.size > 0) {
        this.websocket.send(JSON.stringify({
          type: 'subscribe',
          data: { events: Array.from(this.subscriptions) }
        }))
      }
    }

    this.websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        this.handleWebSocketMessage(message)
      } catch (error) {
        console.error('处理WebSocket消息失败:', error)
        this.addNotification({
          type: 'error',
          title: '消息处理失败',
          message: '无法解析WebSocket消息'
        })
      }
    }

    this.websocket.onclose = () => {
      console.log('WebSocket连接已关闭')
      this.websocketConnected = false
      this.emit('websocketDisconnected')

      // 尝试重连
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        const delay = Math.min(1000 * this.reconnectAttempts, 10000)
        console.log(`${this.reconnectAttempts}秒后尝试重连...`)

        setTimeout(() => {
          this.connectWebSocket()
        }, delay)
      }
    }

    this.websocket.onerror = (error) => {
      console.error('WebSocket错误:', error)
      this.addNotification({
        type: 'error',
        title: '连接错误',
        message: 'WebSocket连接发生错误'
      })
    }
  }

  /**
   * 断开WebSocket连接
   */
  disconnectWebSocket() {
    if (this.websocket) {
      this.websocket.close()
      this.websocket = null
      this.websocketConnected = false
    }
  }

  /**
   * 处理WebSocket消息
   */
  handleWebSocketMessage(message) {
    const { type, data } = message

    // 触发对应类型的事件
    this.emit(type, data)

    // 处理特定类型的消息
    switch (type) {
      case 'welcome':
        console.log('收到欢迎消息:', data)
        break

      case 'project_created':
        this.handleProjectCreated(data)
        break

      case 'project_updated':
        this.handleProjectUpdated(data)
        break

      case 'project_deleted':
        this.handleProjectDeleted(data)
        break

      case 'project_status':
        this.handleProjectStatus(data)
        break

      case 'chat_response':
        this.handleChatResponse(data)
        break

      case 'operation_started':
        this.addNotification({
          type: 'info',
          title: '操作开始',
          message: data.operation,
          duration: 3000
        })
        break

      case 'operation_completed':
        this.addNotification({
          type: 'success',
          title: '操作完成',
          message: data.operation,
          duration: 3000
        })
        break

      case 'operation_failed':
        this.addNotification({
          type: 'error',
          title: '操作失败',
          message: data.error || '未知错误',
          duration: 5000
        })
        break

      case 'error':
        this.addNotification({
          type: 'error',
          title: '系统错误',
          message: data.message || '未知错误',
          duration: 5000
        })
        break
    }
  }

  /**
   * 处理项目创建事件
   */
  handleProjectCreated(data) {
    if (data.success) {
      this.addNotification({
        type: 'success',
        title: '项目创建成功',
        message: `项目 "${data.project?.name}" 已创建`,
        duration: 5000
      })

      // 刷新项目列表
      this.emit('refreshProjects')
    }
  }

  /**
   * 处理项目更新事件
   */
  handleProjectUpdated(data) {
    if (data.success) {
      this.addNotification({
        type: 'success',
        title: '项目更新成功',
        message: '项目配置已更新',
        duration: 3000
      })

      // 刷新项目列表
      this.emit('refreshProjects')
    }
  }

  /**
   * 处理项目删除事件
   */
  handleProjectDeleted(data) {
    if (data.success) {
      this.addNotification({
        type: 'success',
        title: '项目删除成功',
        message: '项目已删除',
        duration: 3000
      })

      // 刷新项目列表
      this.emit('refreshProjects')

      // 如果删除的是当前项目，清空当前项目
      if (this.currentProject?.id === data.projectId) {
        this.setCurrentProject(null)
      }
    }
  }

  /**
   * 处理项目状态事件
   */
  handleProjectStatus(data) {
    // 更新项目状态
    this.emit('projectStatusUpdated', data)
  }

  /**
   * 处理聊天响应事件
   */
  handleChatResponse(data) {
    // 更新聊天会话
    this.emit('chatResponseReceived', data)
  }

  /**
   * 订阅事件
   */
  subscribe(event) {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.add(event)

      // 如果WebSocket已连接，立即订阅
      if (this.websocketConnected) {
        this.websocket.send(JSON.stringify({
          type: 'subscribe',
          data: { events: [event] }
        }))
      }
    }
  }

  /**
   * 取消订阅事件
   */
  unsubscribe(event) {
    if (this.subscriptions.has(event)) {
      this.subscriptions.delete(event)

      // 如果WebSocket已连接，立即取消订阅
      if (this.websocketConnected) {
        this.websocket.send(JSON.stringify({
          type: 'unsubscribe',
          data: { events: [event] }
        }))
      }
    }
  }

  /**
   * 发送WebSocket消息
   */
  sendWebSocketMessage(type, data, id) {
    if (this.websocketConnected) {
      const message = {
        type,
        data,
        id: id || Date.now() + Math.random().toString(36).substr(2, 9)
      }

      this.websocket.send(JSON.stringify(message))
      return message.id
    } else {
      this.addNotification({
        type: 'warning',
        title: '连接未就绪',
        message: 'WebSocket连接未建立，无法发送消息',
        duration: 3000
      })
      return null
    }
  }

  /**
   * 事件系统
   */
  events = new Map()

  on(event, callback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }
    this.events.get(event).add(callback)
  }

  off(event, callback) {
    if (this.events.has(event)) {
      this.events.get(event).delete(callback)
    }
  }

  emit(event, data) {
    if (this.events.has(event)) {
      this.events.get(event).forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`事件处理错误 (${event}):`, error)
        }
      })
    }
  }
}

/**
 * 应用实例
 */
const app = new AppState()

/**
 * 初始化应用
 */
function initApp() {
  // 设置主题
  document.documentElement.setAttribute('data-theme', app.theme)

  // 恢复侧边栏状态
  const savedSidebarState = localStorage.getItem('sidebarCollapsed')
  if (savedSidebarState !== null) {
    app.sidebarCollapsed = savedSidebarState === 'true'
  }

  // 连接WebSocket
  app.connectWebSocket()

  // 订阅常用事件
  app.subscribe('project_created')
  app.subscribe('project_updated')
  app.subscribe('project_deleted')
  app.subscribe('project_status')
  app.subscribe('chat_response')

  // 监听页面可见性变化
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !app.websocketConnected) {
      app.connectWebSocket()
    }
  })

  // 监听浏览器历史记录变化
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.view) {
      app.setCurrentView(event.state.view)
    }
  })

  // 初始化路由
  const urlParams = new URLSearchParams(window.location.search)
  const view = urlParams.get('view') || 'dashboard'
  app.setCurrentView(view)

  console.log('应用初始化完成')
}

/**
 * 工具函数：防抖
 */
function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * 工具函数：节流
 */
function throttle(func, limit) {
  let inThrottle
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * 工具函数：格式化日期
 */
function formatDate(date, format = 'yyyy-MM-dd HH:mm:ss') {
  const d = new Date(date)
  const pad = (n) => n.toString().padStart(2, '0')

  const replacements = {
    'yyyy': d.getFullYear(),
    'MM': pad(d.getMonth() + 1),
    'dd': pad(d.getDate()),
    'HH': pad(d.getHours()),
    'mm': pad(d.getMinutes()),
    'ss': pad(d.getSeconds())
  }

  return format.replace(/yyyy|MM|dd|HH|mm|ss/g, match => replacements[match])
}

/**
 * 工具函数：格式化文件大小
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 工具函数：生成唯一ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

/**
 * 工具函数：深度克隆
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  if (obj instanceof Date) return new Date(obj.getTime())
  if (obj instanceof Array) return obj.map(item => deepClone(item))
  if (typeof obj === 'object') {
    const cloned = {}
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key])
      }
    }
    return cloned
  }
}

/**
 * 工具函数：安全获取嵌套属性
 */
function get(obj, path, defaultValue) {
  const keys = path.split('.')
  let result = obj

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = result[key]
    } else {
      return defaultValue
    }
  }

  return result
}

/**
 * 工具函数：验证邮箱格式
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

/**
 * 工具函数：验证URL格式
 */
function isValidUrl(url) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * 工具函数：复制到剪贴板
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    console.error('复制失败:', err)

    // 降级方案
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.opacity = '0'
    document.body.appendChild(textArea)
    textArea.select()

    try {
      document.execCommand('copy')
      document.body.removeChild(textArea)
      return true
    } catch (err2) {
      document.body.removeChild(textArea)
      return false
    }
  }
}

/**
 * 导出
 */
window.app = app
window.initApp = initApp
window.debounce = debounce
window.throttle = throttle
window.formatDate = formatDate
window.formatFileSize = formatFileSize
window.generateId = generateId
window.deepClone = deepClone
window.get = get
window.isValidEmail = isValidEmail
window.isValidUrl = isValidUrl
window.copyToClipboard = copyToClipboard

// 自动初始化
document.addEventListener('DOMContentLoaded', initApp)