/**
 * 错误处理器
 * 设计思路：全局错误捕获和用户友好反馈系统
 *
 * 功能特点：
 * 1. 全局错误捕获 - 捕获JavaScript运行时错误、Promise拒绝和资源加载错误
 * 2. 用户友好反馈 - 将技术错误转换为用户友好的提示信息
 * 3. 错误分类 - 根据错误类型和严重程度进行分类处理
 * 4. 错误上报 - 将错误信息发送到服务器进行记录和分析
 * 5. 恢复机制 - 提供错误恢复建议和操作指引
 * 6. 错误聚合 - 避免重复显示相同的错误
 *
 * 踩坑提醒：
 * 1. 错误信息要避免暴露敏感数据
 * 2. 用户友好的提示要具体且有帮助
 * 3. 避免无限循环的错误处理
 * 4. 网络错误要特殊处理（离线、超时等）
 * 5. 错误上报要控制频率，避免对服务器造成压力
 */

class ErrorHandler {
  constructor() {
    this.errorCount = 0
    this.lastErrorTime = 0
    this.errorCooldown = 3000 // 3秒内不重复显示相同错误
    this.reportedErrors = new Set()

    // 错误类型映射
    this.errorTypes = {
      'network': '网络错误',
      'timeout': '请求超时',
      'server': '服务器错误',
      'validation': '验证错误',
      'auth': '认证错误',
      'permission': '权限错误',
      'not_found': '资源未找到',
      'rate_limit': '请求过于频繁',
      'unknown': '未知错误'
    }

    // 错误严重程度
    this.severityLevels = {
      'info': { color: 'info', icon: 'fa-info-circle' },
      'warning': { color: 'warning', icon: 'fa-exclamation-triangle' },
      'error': { color: 'danger', icon: 'fa-exclamation-circle' },
      'critical': { color: 'danger', icon: 'fa-skull-crossbones' }
    }

    // 绑定方法
    this.init = this.init.bind(this)
    this.handleError = this.handleError.bind(this)
    this.handleUnhandledRejection = this.handleUnhandledRejection.bind(this)
    this.showError = this.showError.bind(this)
    this.showUserFriendlyError = this.showUserFriendlyError.bind(this)
    this.reportError = this.reportError.bind(this)
    this.getErrorType = this.getErrorType.bind(this)
    this.getErrorSeverity = this.getErrorSeverity.bind(this)
    this.getRecoverySuggestion = this.getRecoverySuggestion.bind(this)
  }

  /**
   * 初始化错误处理器
   */
  init() {
    console.log('初始化错误处理器')

    // 捕获全局JavaScript错误
    window.addEventListener('error', (event) => {
      this.handleError(event.error || event)
      event.preventDefault()
    })

    // 捕获未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      this.handleUnhandledRejection(event.reason)
      event.preventDefault()
    })

    // 捕获资源加载错误
    window.addEventListener('load', () => {
      const images = document.getElementsByTagName('img')
      Array.from(images).forEach(img => {
        img.addEventListener('error', () => {
          this.handleError(new Error(`图片加载失败: ${img.src}`), 'resource')
        })
      })
    })

    // 拦截fetch请求错误
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args)

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`)
          error.response = response
          error.data = errorData
          this.handleError(error, 'http')
        }

        return response
      } catch (error) {
        this.handleError(error, 'network')
        throw error
      }
    }

    // 监听WebSocket错误
    app.on('websocketError', (error) => {
      this.handleError(error, 'websocket')
    })

    // 监听API错误
    app.on('apiError', (error) => {
      this.handleError(error, 'api')
    })

    console.log('错误处理器初始化完成')
  }

  /**
   * 处理错误
   */
  handleError(error, context = 'unknown') {
    this.errorCount++

    // 获取错误信息
    const errorType = this.getErrorType(error, context)
    const severity = this.getErrorSeverity(error, errorType)
    const friendlyMessage = this.getUserFriendlyMessage(error, errorType, context)
    const recoverySuggestion = this.getRecoverySuggestion(errorType, context)

    // 生成错误ID（用于去重）
    const errorId = this.generateErrorId(error, errorType, context)
    const now = Date.now()

    // 检查是否需要冷却
    if (this.reportedErrors.has(errorId) && now - this.lastErrorTime < this.errorCooldown) {
      return
    }

    this.reportedErrors.add(errorId)
    this.lastErrorTime = now

    // 显示错误给用户
    this.showUserFriendlyError({
      type: errorType,
      severity,
      message: friendlyMessage,
      suggestion: recoverySuggestion,
      error: error,
      context,
      timestamp: now
    })

    // 上报错误到服务器
    this.reportError({
      errorId,
      type: errorType,
      severity,
      message: error.message,
      stack: error.stack,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: now
    })

    // 记录到控制台
    console.error(`[${errorType}] ${error.message}`, error)
  }

  /**
   * 处理未处理的Promise拒绝
   */
  handleUnhandledRejection(reason) {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    this.handleError(error, 'promise')
  }

  /**
   * 显示用户友好的错误
   */
  showUserFriendlyError(errorInfo) {
    const { severity, message, suggestion } = errorInfo

    // 根据严重程度决定显示方式
    switch (severity) {
      case 'info':
      case 'warning':
        this.showToastNotification(errorInfo)
        break
      case 'error':
        this.showModalNotification(errorInfo)
        break
      case 'critical':
        this.showFullscreenError(errorInfo)
        break
    }

    // 更新错误计数器
    this.updateErrorIndicator()
  }

  /**
   * 显示Toast通知
   */
  showToastNotification(errorInfo) {
    const { severity, message, suggestion } = errorInfo
    const severityInfo = this.severityLevels[severity]

    app.addNotification({
      type: severityInfo.color,
      title: this.errorTypes[errorInfo.type] || '系统提示',
      message: suggestion ? `${message} ${suggestion}` : message,
      duration: severity === 'warning' ? 5000 : 3000
    })
  }

  /**
   * 显示模态框通知
   */
  showModalNotification(errorInfo) {
    const { severity, message, suggestion, error } = errorInfo
    const severityInfo = this.severityLevels[severity]

    // 创建错误详情（可展开）
    const errorDetails = error.stack
      ? `<details class="mt-3">
           <summary class="font-sm">技术细节</summary>
           <pre class="font-xs mt-2 p-2 bg-tertiary rounded">${this.escapeHtml(error.stack)}</pre>
         </details>`
      : ''

    const modalHtml = `
      <div class="error-modal">
        <div class="error-modal-header bg-${severityInfo.color}">
          <i class="fas ${severityInfo.icon}"></i>
          <h4>${this.errorTypes[errorInfo.type] || '系统错误'}</h4>
        </div>
        <div class="error-modal-body">
          <p>${message}</p>
          ${suggestion ? `<p class="mt-2"><strong>建议：</strong>${suggestion}</p>` : ''}
          ${errorDetails}
        </div>
        <div class="error-modal-footer">
          <button class="btn btn-outline" id="copyErrorBtn">
            <i class="fas fa-copy"></i>
            复制错误
          </button>
          <button class="btn btn-primary" id="closeErrorBtn">
            确定
          </button>
        </div>
      </div>
    `

    // 显示模态框
    this.showModal(modalHtml)

    // 添加事件监听器
    document.getElementById('copyErrorBtn')?.addEventListener('click', () => {
      const errorText = `${message}\n\n${error.stack || ''}`
      navigator.clipboard.writeText(errorText).then(() => {
        app.addNotification({
          type: 'success',
          title: '已复制',
          message: '错误信息已复制到剪贴板',
          duration: 2000
        })
      })
    })

    document.getElementById('closeErrorBtn')?.addEventListener('click', () => {
      this.hideModal()
    })
  }

  /**
   * 显示全屏错误
   */
  showFullscreenError(errorInfo) {
    const { message, suggestion } = errorInfo

    const html = `
      <div class="fullscreen-error">
        <div class="fullscreen-error-content">
          <div class="error-icon">
            <i class="fas fa-skull-crossbones"></i>
          </div>
          <h2>系统遇到严重错误</h2>
          <p class="error-message">${message}</p>
          ${suggestion ? `<p class="error-suggestion">${suggestion}</p>` : ''}
          <div class="error-actions mt-4">
            <button class="btn btn-primary" id="reloadPageBtn">
              <i class="fas fa-redo"></i>
              重新加载页面
            </button>
            <button class="btn btn-outline" id="reportErrorBtn">
              <i class="fas fa-bug"></i>
              报告错误
            </button>
          </div>
          <div class="mt-4">
            <a href="#" class="text-tertiary font-sm" id="showDetailsBtn">显示技术细节</a>
            <div id="errorDetails" style="display: none; margin-top: 1rem;">
              <pre class="font-xs p-3 bg-tertiary rounded">${this.escapeHtml(errorInfo.error.stack || '无堆栈信息')}</pre>
            </div>
          </div>
        </div>
      </div>
    `

    // 替换整个页面内容
    document.body.innerHTML = html

    // 添加事件监听器
    document.getElementById('reloadPageBtn').addEventListener('click', () => {
      window.location.reload()
    })

    document.getElementById('reportErrorBtn').addEventListener('click', () => {
      this.reportErrorToServer(errorInfo)
    })

    document.getElementById('showDetailsBtn').addEventListener('click', (e) => {
      e.preventDefault()
      const details = document.getElementById('errorDetails')
      const link = e.target

      if (details.style.display === 'none') {
        details.style.display = 'block'
        link.textContent = '隐藏技术细节'
      } else {
        details.style.display = 'none'
        link.textContent = '显示技术细节'
      }
    })
  }

  /**
   * 显示模态框
   */
  showModal(html) {
    // 移除现有模态框
    this.hideModal()

    // 创建模态框容器
    const modalContainer = document.createElement('div')
    modalContainer.id = 'errorModalContainer'
    modalContainer.className = 'modal-container'
    modalContainer.innerHTML = html

    document.body.appendChild(modalContainer)
  }

  /**
   * 隐藏模态框
   */
  hideModal() {
    const modal = document.getElementById('errorModalContainer')
    if (modal) {
      modal.remove()
    }
  }

  /**
   * 更新错误指示器
   */
  updateErrorIndicator() {
    const indicator = document.getElementById('errorIndicator')
    if (!indicator) {
      // 创建错误指示器
      const newIndicator = document.createElement('div')
      newIndicator.id = 'errorIndicator'
      newIndicator.className = 'error-indicator'
      newIndicator.innerHTML = `
        <div class="error-indicator-content">
          <i class="fas fa-exclamation-triangle"></i>
          <span class="error-count">${this.errorCount}</span>
        </div>
      `

      newIndicator.addEventListener('click', () => {
        this.showErrorHistory()
      })

      document.body.appendChild(newIndicator)
    } else {
      const countEl = indicator.querySelector('.error-count')
      if (countEl) {
        countEl.textContent = this.errorCount
      }
    }
  }

  /**
   * 显示错误历史
   */
  showErrorHistory() {
    // 这里可以显示错误历史面板
    app.addNotification({
      type: 'info',
      title: '错误历史',
      message: `共发生 ${this.errorCount} 个错误`,
      duration: 3000
    })
  }

  /**
   * 获取错误类型
   */
  getErrorType(error, context) {
    if (error.name === 'NetworkError' || error.name === 'TypeError' && error.message.includes('fetch')) {
      return 'network'
    }

    if (error.name === 'TimeoutError') {
      return 'timeout'
    }

    if (error.response) {
      const status = error.response.status
      if (status >= 500) return 'server'
      if (status === 401) return 'auth'
      if (status === 403) return 'permission'
      if (status === 404) return 'not_found'
      if (status === 429) return 'rate_limit'
      if (status === 422) return 'validation'
    }

    if (context === 'websocket') return 'network'
    if (context === 'api') return 'server'
    if (context === 'resource') return 'not_found'

    return 'unknown'
  }

  /**
   * 获取错误严重程度
   */
  getErrorSeverity(error, errorType) {
    // 根据错误类型和上下文判断严重程度
    switch (errorType) {
      case 'network':
        return navigator.onLine ? 'error' : 'warning'
      case 'timeout':
        return 'warning'
      case 'server':
        return 'error'
      case 'critical':
        return 'critical'
      case 'auth':
      case 'permission':
        return 'warning'
      default:
        return 'error'
    }
  }

  /**
   * 获取用户友好的错误消息
   */
  getUserFriendlyMessage(error, errorType, context) {
    const messages = {
      'network': '网络连接出现问题，请检查您的网络连接。',
      'timeout': '请求超时，请稍后重试。',
      'server': '服务器遇到问题，请稍后重试。',
      'validation': '输入数据有误，请检查后重试。',
      'auth': '登录状态已过期，请重新登录。',
      'permission': '您没有权限执行此操作。',
      'not_found': '请求的资源不存在。',
      'rate_limit': '请求过于频繁，请稍后重试。',
      'unknown': '系统遇到未知错误。'
    }

    // 如果有用户友好的消息，使用它
    if (error.userMessage) {
      return error.userMessage
    }

    // 否则使用默认消息
    return messages[errorType] || messages.unknown
  }

  /**
   * 获取恢复建议
   */
  getRecoverySuggestion(errorType, context) {
    const suggestions = {
      'network': '请检查网络连接，或尝试刷新页面。',
      'timeout': '可能是服务器繁忙，建议稍后重试。',
      'server': '如果问题持续存在，请联系系统管理员。',
      'validation': '请根据错误提示修正输入数据。',
      'auth': '点击此处重新登录。',
      'permission': '请联系管理员获取相应权限。',
      'not_found': '请确认URL是否正确，或资源是否已被删除。',
      'rate_limit': '请等待1分钟后重试。',
      'unknown': '请尝试刷新页面或联系技术支持。'
    }

    return suggestions[errorType] || suggestions.unknown
  }

  /**
   * 生成错误ID（用于去重）
   */
  generateErrorId(error, errorType, context) {
    // 基于错误消息、类型和上下文生成简单哈希
    const str = `${error.message}-${errorType}-${context}`
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // 转换为32位整数
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 上报错误到服务器
   */
  reportError(errorData) {
    // 避免在生产环境过度上报
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return
    }

    // 使用navigator.sendBeacon异步上报
    const data = JSON.stringify(errorData)
    navigator.sendBeacon('/api/error-report', data)
  }

  /**
   * 上报错误到服务器（详细版）
   */
  reportErrorToServer(errorInfo) {
    const reportData = {
      type: 'user_reported',
      error: {
        message: errorInfo.error.message,
        stack: errorInfo.error.stack,
        name: errorInfo.error.name
      },
      context: errorInfo.context,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href
    }

    fetch('/api/error-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData)
    }).then(() => {
      app.addNotification({
        type: 'success',
        title: '已上报',
        message: '错误信息已上报给开发团队',
        duration: 3000
      })
    }).catch(() => {
      app.addNotification({
        type: 'warning',
        title: '上报失败',
        message: '无法上报错误信息',
        duration: 3000
      })
    })
  }

  /**
   * 工具函数：转义HTML
   */
  escapeHtml(text) {
    if (text == null) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

/**
 * 创建并初始化错误处理器实例
 */
const errorHandler = new ErrorHandler()

/**
 * 导出
 */
window.errorHandler = errorHandler

/**
 * 全局错误处理工具函数
 */
window.handleError = (error, context) => {
  errorHandler.handleError(error, context)
}

window.showError = (message, type = 'unknown', severity = 'error') => {
  const error = new Error(message)
  error.userMessage = message
  errorHandler.handleError(error, 'custom')
}

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  errorHandler.init()
})