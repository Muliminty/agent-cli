/**
 * 统一API客户端
 * 设计思路：提供统一的API调用接口，处理错误、加载状态、缓存和重试
 *
 * 功能特点：
 * 1. 统一接口 - 所有API调用通过统一接口
 * 2. 错误处理 - 统一的错误处理和用户反馈
 * 3. 加载状态 - 自动管理加载状态和进度指示
 * 4. 请求缓存 - 支持请求缓存和过期策略
 * 5. 自动重试 - 网络错误时自动重试
 * 6. 进度指示 - 显示请求进度和状态
 *
 * 踩坑提醒：
 * 1. 错误处理要区分网络错误和业务错误
 * 2. 缓存策略要考虑数据新鲜度
 * 3. 重试机制要避免无限循环
 * 4. 进度指示要准确反映实际进度
 */

class ApiClient {
  constructor() {
    this.baseUrl = ''
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    this.requestQueue = new Map()
    this.cache = new Map()
    this.cacheTTL = 5 * 60 * 1000 // 5分钟缓存

    // 绑定方法
    this.get = this.get.bind(this)
    this.post = this.post.bind(this)
    this.put = this.put.bind(this)
    this.patch = this.patch.bind(this)
    this.delete = this.delete.bind(this)
    this.request = this.request.bind(this)
    this.clearCache = this.clearCache.bind(this)
    this.setAuthToken = this.setAuthToken.bind(this)
  }

  /**
   * GET请求
   */
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options)
  }

  /**
   * POST请求
   */
  async post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, data, options)
  }

  /**
   * PUT请求
   */
  async put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, data, options)
  }

  /**
   * PATCH请求
   */
  async patch(endpoint, data, options = {}) {
    return this.request('PATCH', endpoint, data, options)
  }

  /**
   * DELETE请求
   */
  async delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options)
  }

  /**
   * 统一请求方法
   */
  async request(method, endpoint, data = null, options = {}) {
    const {
      headers = {},
      cache = false,
      cacheKey,
      retry = 3,
      retryDelay = 1000,
      timeout = 30000,
      showLoading = true,
      showError = true,
      progressCallback,
      abortSignal
    } = options

    // 生成请求ID
    const requestId = this.generateRequestId(method, endpoint, data)

    // 检查缓存
    if (cache && method === 'GET') {
      const cacheKeyToUse = cacheKey || requestId
      const cached = this.getFromCache(cacheKeyToUse)
      if (cached) {
        return cached
      }
    }

    // 检查重复请求
    if (this.requestQueue.has(requestId)) {
      return this.requestQueue.get(requestId)
    }

    // 创建请求Promise
    const requestPromise = this.executeRequest(
      method,
      endpoint,
      data,
      {
        headers,
        timeout,
        retry,
        retryDelay,
        showLoading,
        showError,
        progressCallback,
        abortSignal
      }
    )

    // 添加到请求队列
    this.requestQueue.set(requestId, requestPromise)

    try {
      const result = await requestPromise

      // 缓存结果
      if (cache && method === 'GET') {
        const cacheKeyToUse = cacheKey || requestId
        this.setCache(cacheKeyToUse, result)
      }

      return result
    } finally {
      // 从请求队列中移除
      this.requestQueue.delete(requestId)
    }
  }

  /**
   * 执行请求
   */
  async executeRequest(method, endpoint, data, options) {
    const {
      headers,
      timeout,
      retry,
      retryDelay,
      showLoading,
      showError,
      progressCallback,
      abortSignal
    } = options

    let retryCount = 0
    let lastError = null

    while (retryCount <= retry) {
      try {
        // 显示加载状态
        if (showLoading) {
          this.showLoading()
        }

        // 构建请求配置
        const config = {
          method,
          headers: { ...this.defaultHeaders, ...headers },
          signal: abortSignal,
          timeout
        }

        // 添加请求体
        if (data !== null) {
          config.body = JSON.stringify(data)
        }

        // 添加进度回调（如果支持）
        if (progressCallback && typeof progressCallback === 'function') {
          // 这里可以添加进度跟踪逻辑
        }

        // 发送请求
        const response = await this.fetchWithTimeout(endpoint, config)

        // 处理响应
        const result = await this.handleResponse(response)

        // 隐藏加载状态
        if (showLoading) {
          this.hideLoading()
        }

        return result

      } catch (error) {
        lastError = error

        // 检查是否应该重试
        if (retryCount < retry && this.shouldRetry(error)) {
          retryCount++

          // 显示重试通知
          if (showError) {
            app.addNotification({
              type: 'warning',
              title: '正在重试',
              message: `请求失败，${retryDelay * retryCount / 1000}秒后重试 (${retryCount}/${retry})`,
              duration: 3000
            })
          }

          // 等待重试延迟
          await this.delay(retryDelay * retryCount)

          continue
        }

        // 不再重试，抛出错误
        break
      } finally {
        // 确保隐藏加载状态
        if (showLoading) {
          this.hideLoading()
        }
      }
    }

    // 处理最终错误
    return this.handleError(lastError, showError)
  }

  /**
   * 带超时的fetch
   */
  async fetchWithTimeout(endpoint, config) {
    const { timeout = 30000, ...fetchConfig } = config

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(endpoint, {
        ...fetchConfig,
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      return response

    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * 处理响应
   */
  async handleResponse(response) {
    // 检查响应状态
    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`)
      error.status = response.status
      error.response = response
      throw error
    }

    // 解析响应数据
    const contentType = response.headers.get('content-type')
    let data

    if (contentType && contentType.includes('application/json')) {
      data = await response.json()
    } else if (contentType && contentType.includes('text/')) {
      data = await response.text()
    } else {
      data = await response.blob()
    }

    // 检查API响应格式
    if (typeof data === 'object' && data !== null) {
      // 检查是否有success字段
      if (data.success === false) {
        const error = new Error(data.error || 'API请求失败')
        error.data = data
        error.status = response.status
        throw error
      }
    }

    return data
  }

  /**
   * 处理错误
   */
  handleError(error, showError = true) {
    console.error('API请求失败:', error)

    // 错误信息
    let errorMessage = '请求失败'
    let errorTitle = '错误'

    if (error.name === 'AbortError') {
      errorMessage = '请求超时'
      errorTitle = '超时'
    } else if (error.status === 401) {
      errorMessage = '未授权，请重新登录'
      errorTitle = '未授权'
    } else if (error.status === 403) {
      errorMessage = '权限不足'
      errorTitle = '禁止访问'
    } else if (error.status === 404) {
      errorMessage = '资源未找到'
      errorTitle = '未找到'
    } else if (error.status >= 500) {
      errorMessage = '服务器错误，请稍后重试'
      errorTitle = '服务器错误'
    } else if (error.message) {
      errorMessage = error.message
    }

    // 显示错误通知
    if (showError) {
      app.addNotification({
        type: 'error',
        title: errorTitle,
        message: errorMessage,
        duration: 5000
      })
    }

    // 抛出错误以便调用者处理
    throw {
      ...error,
      message: errorMessage,
      title: errorTitle,
      isApiError: true
    }
  }

  /**
   * 检查是否应该重试
   */
  shouldRetry(error) {
    // 网络错误、超时、5xx错误应该重试
    return (
      error.name === 'TypeError' || // 网络错误
      error.name === 'AbortError' || // 超时
      (error.status && error.status >= 500) // 服务器错误
    )
  }

  /**
   * 延迟函数
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 显示加载状态
   */
  showLoading() {
    // 这里可以显示全局加载指示器
    // 暂时使用通知
    app.addNotification({
      type: 'info',
      title: '加载中',
      message: '正在处理请求...',
      duration: 0 // 不自动关闭
    })
  }

  /**
   * 隐藏加载状态
   */
  hideLoading() {
    // 这里可以隐藏全局加载指示器
    // 暂时什么都不做，通知会自动关闭
  }

  /**
   * 生成请求ID
   */
  generateRequestId(method, endpoint, data) {
    const dataStr = data ? JSON.stringify(data) : ''
    return `${method}:${endpoint}:${dataStr}`
  }

  /**
   * 从缓存获取
   */
  getFromCache(key) {
    const cached = this.cache.get(key)
    if (!cached) return null

    const { data, timestamp } = cached
    const now = Date.now()

    // 检查是否过期
    if (now - timestamp > this.cacheTTL) {
      this.cache.delete(key)
      return null
    }

    return data
  }

  /**
   * 设置缓存
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  /**
   * 清除缓存
   */
  clearCache(key = null) {
    if (key) {
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }

  /**
   * 设置认证令牌
   */
  setAuthToken(token) {
    if (token) {
      this.defaultHeaders['Authorization'] = `Bearer ${token}`
    } else {
      delete this.defaultHeaders['Authorization']
    }
  }

  /**
   * 项目相关API
   */

  // 获取项目列表
  async getProjects(options = {}) {
    return this.get('/api/project-management/projects', options)
  }

  // 获取项目详情
  async getProject(projectId, path, options = {}) {
    return this.get(`/api/project-management/projects/${projectId}?path=${encodeURIComponent(path)}`, options)
  }

  // 创建项目
  async createProject(data, options = {}) {
    return this.post('/api/project-management/init', data, options)
  }

  // 更新项目配置
  async updateProjectConfig(projectId, path, updates, options = {}) {
    return this.put(`/api/project-management/projects/${projectId}/config`, { path, updates }, options)
  }

  // 删除项目
  async deleteProject(projectId, path, force = false, options = {}) {
    return this.delete(`/api/project-management/projects/${projectId}`, {
      ...options,
      body: JSON.stringify({ path, force })
    })
  }

  /**
   * 项目向导相关API
   */

  // 获取模板列表
  async getTemplates(options = {}) {
    return this.get('/api/project-wizard/templates', options)
  }

  // 获取模板详情
  async getTemplate(templateId, options = {}) {
    return this.get(`/api/project-wizard/templates/${templateId}`, options)
  }

  // 开始向导会话
  async startWizardSession(templateId, options = {}) {
    return this.post('/api/project-wizard/start', { templateId }, options)
  }

  // 继续向导会话
  async continueWizardSession(sessionId, step, data, options = {}) {
    return this.post('/api/project-wizard/continue', { sessionId, step, data }, options)
  }

  // 生成项目
  async generateProject(sessionId, options = {}) {
    return this.post('/api/project-wizard/generate', { sessionId }, options)
  }

  /**
   * 聊天相关API
   */

  // 获取会话列表
  async getChatSessions(projectId = null, options = {}) {
    const url = projectId
      ? `/api/chat/sessions?projectId=${projectId}`
      : '/api/chat/sessions'
    return this.get(url, options)
  }

  // 获取会话详情
  async getChatSession(sessionId, options = {}) {
    return this.get(`/api/chat/sessions/${sessionId}`, options)
  }

  // 创建会话
  async createChatSession(data, options = {}) {
    return this.post('/api/chat/sessions', data, options)
  }

  // 发送消息
  async sendChatMessage(data, options = {}) {
    return this.post('/api/chat/messages', data, options)
  }

  // 删除会话
  async deleteChatSession(sessionId, options = {}) {
    return this.delete(`/api/chat/sessions/${sessionId}`, options)
  }

  // 分析文件
  async analyzeFiles(projectPath, filePaths = [], options = {}) {
    return this.post('/api/chat/analyze-files', { projectPath, filePaths }, options)
  }

  /**
   * 系统相关API
   */

  // 获取系统信息
  async getSystemInfo(options = {}) {
    return this.get('/api/version', options)
  }

  // 健康检查
  async healthCheck(options = {}) {
    return this.get('/health', options)
  }

  // 获取项目状态
  async getProjectStatus(path, options = {}) {
    return this.get(`/api/project/status?path=${encodeURIComponent(path)}`, options)
  }

  // 获取项目健康状态
  async getProjectHealth(path, options = {}) {
    return this.get(`/api/project/health?path=${encodeURIComponent(path)}`, options)
  }

  /**
   * 工具方法
   */

  // 上传文件
  async uploadFile(endpoint, file, options = {}) {
    const formData = new FormData()
    formData.append('file', file)

    const { onProgress, ...restOptions } = options

    return this.request('POST', endpoint, formData, {
      ...restOptions,
      headers: {
        // 不要设置Content-Type，浏览器会自动设置
      }
    })
  }

  // 流式请求
  async streamRequest(endpoint, data, options = {}) {
    const { onChunk, onComplete, ...restOptions } = options

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      throw new Error(`Stream request failed: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6)
            if (data === '[DONE]') {
              if (onComplete) onComplete()
              break
            }

            try {
              const event = JSON.parse(data)
              if (onChunk) onChunk(event)
            } catch (e) {
              console.error('Failed to parse SSE data:', e)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * 批量请求
   */
  async batchRequests(requests, options = {}) {
    const { concurrent = 5, ...restOptions } = options

    const results = []
    const errors = []

    // 分批处理请求
    for (let i = 0; i < requests.length; i += concurrent) {
      const batch = requests.slice(i, i + concurrent)
      const batchPromises = batch.map(async (request) => {
        try {
          const result = await this.request(
            request.method,
            request.endpoint,
            request.data,
            { ...restOptions, ...request.options }
          )
          return { success: true, data: result }
        } catch (error) {
          return { success: false, error }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      batchResults.forEach(result => {
        if (result.success) {
          results.push(result.data)
        } else {
          errors.push(result.error)
        }
      })
    }

    return { results, errors }
  }
}

/**
 * 创建并初始化API客户端实例
 */
const apiClient = new ApiClient()

/**
 * 导出
 */
window.apiClient = apiClient

/**
 * 工具函数：创建API错误
 */
function createApiError(message, status = 500, data = null) {
  const error = new Error(message)
  error.status = status
  error.data = data
  error.isApiError = true
  return error
}

/**
 * 工具函数：检查是否是API错误
 */
function isApiError(error) {
  return error && error.isApiError === true
}

/**
 * 工具函数：处理API响应
 */
function handleApiResponse(response, options = {}) {
  const { showError = true } = options

  if (!response.success) {
    const error = createApiError(
      response.error || '请求失败',
      response.status || 500,
      response
    )

    if (showError) {
      app.addNotification({
        type: 'error',
        title: '错误',
        message: error.message,
        duration: 5000
      })
    }

    throw error
  }

  return response.data || response
}

/**
 * 导出工具函数
 */
window.createApiError = createApiError
window.isApiError = isApiError
window.handleApiResponse = handleApiResponse

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('API客户端已初始化')
})