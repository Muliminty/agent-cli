/**
 * 任务管理器
 * 设计思路：实时跟踪和管理后台任务，提供任务列表、状态监控、进度跟踪和错误处理
 *
 * 功能特点：
 * 1. 任务列表 - 显示所有后台任务的实时状态
 * 2. 状态监控 - 实时更新任务状态（等待、运行中、完成、失败）
 * 3. 进度跟踪 - 显示任务进度条和详细进度信息
 * 4. 错误处理 - 自动捕获和显示任务错误
 * 5. 实时更新 - 通过WebSocket接收任务状态更新
 * 6. 任务操作 - 支持取消、重试、删除等操作
 *
 * 踩坑提醒：
 * 1. 任务状态更新要实时准确，避免状态不一致
 * 2. 长时间运行的任务要定期发送心跳和进度更新
 * 3. 错误信息要详细记录，便于调试
 * 4. 任务列表要支持筛选、排序和搜索
 * 5. 内存管理要及时清理已完成的任务
 */

class TaskManager {
  constructor() {
    this.tasks = new Map() // taskId -> task object
    this.currentFilter = 'all'
    this.currentSort = 'created_desc'
    this.taskStats = {
      total: 0,
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0
    }

    // 绑定方法
    this.init = this.init.bind(this)
    this.addTask = this.addTask.bind(this)
    this.updateTask = this.updateTask.bind(this)
    this.removeTask = this.removeTask.bind(this)
    this.getTask = this.getTask.bind(this)
    this.getFilteredTasks = this.getFilteredTasks.bind(this)
    this.renderTasks = this.renderTasks.bind(this)
    this.updateTaskStats = this.updateTaskStats.bind(this)
    this.setupEventListeners = this.setupEventListeners.bind(this)
    this.handleTaskOperation = this.handleTaskOperation.bind(this)
    this.showTaskDetail = this.showTaskDetail.bind(this)
    this.hideTaskDetail = this.hideTaskDetail.bind(this)
  }

  /**
   * 初始化任务管理器
   */
  async init() {
    console.log('初始化任务管理器')

    // 设置事件监听器
    this.setupEventListeners()

    // 监听应用事件
    app.on('viewLoaded', (view) => {
      if (view === 'tasks') {
        this.onViewActivated()
      }
    })

    // 监听WebSocket任务相关事件
    app.on('operation_started', (data) => {
      this.handleOperationStarted(data)
    })

    app.on('operation_completed', (data) => {
      this.handleOperationCompleted(data)
    })

    app.on('operation_failed', (data) => {
      this.handleOperationFailed(data)
    })

    app.on('project_status', (data) => {
      this.handleProjectStatus(data)
    })

    app.on('chat_response', (data) => {
      this.handleChatResponse(data)
    })

    // 初始化任务列表
    this.updateTaskStats()
    this.renderTasks()

    console.log('任务管理器初始化完成')
  }

  /**
   * 添加新任务
   */
  addTask(taskData) {
    const taskId = taskData.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const task = {
      id: taskId,
      name: taskData.name || '未命名任务',
      type: taskData.type || 'general',
      status: taskData.status || 'pending',
      progress: taskData.progress || 0,
      message: taskData.message || '',
      details: taskData.details || {},
      createdAt: taskData.createdAt || Date.now(),
      updatedAt: taskData.updatedAt || Date.now(),
      priority: taskData.priority || 0,
      error: taskData.error || null,
      metadata: taskData.metadata || {}
    }

    this.tasks.set(taskId, task)
    this.updateTaskStats()
    this.renderTasks()

    return taskId
  }

  /**
   * 更新任务状态
   */
  updateTask(taskId, updates) {
    const task = this.tasks.get(taskId)
    if (!task) return false

    const updatedTask = {
      ...task,
      ...updates,
      updatedAt: Date.now()
    }

    this.tasks.set(taskId, updatedTask)
    this.updateTaskStats()
    this.renderTasks()

    // 如果当前显示该任务的详情，更新详情面板
    const detailPanel = document.getElementById('taskDetailPanel')
    if (detailPanel && detailPanel.style.display !== 'none') {
      const currentTaskId = detailPanel.dataset.taskId
      if (currentTaskId === taskId) {
        this.showTaskDetail(updatedTask)
      }
    }

    return true
  }

  /**
   * 移除任务
   */
  removeTask(taskId) {
    const deleted = this.tasks.delete(taskId)
    if (deleted) {
      this.updateTaskStats()
      this.renderTasks()
    }
    return deleted
  }

  /**
   * 获取任务
   */
  getTask(taskId) {
    return this.tasks.get(taskId)
  }

  /**
   * 获取筛选后的任务列表
   */
  getFilteredTasks() {
    let tasks = Array.from(this.tasks.values())

    // 应用状态筛选
    if (this.currentFilter !== 'all') {
      tasks = tasks.filter(task => task.status === this.currentFilter)
    }

    // 应用排序
    tasks.sort((a, b) => {
      switch (this.currentSort) {
        case 'created_desc':
          return b.createdAt - a.createdAt
        case 'created_asc':
          return a.createdAt - b.createdAt
        case 'updated_desc':
          return b.updatedAt - a.updatedAt
        case 'priority_desc':
          return b.priority - a.priority
        default:
          return b.createdAt - a.createdAt
      }
    })

    return tasks
  }

  /**
   * 渲染任务列表
   */
  renderTasks() {
    const tableBody = document.getElementById('tasksTableBody')
    if (!tableBody) return

    const tasks = this.getFilteredTasks()

    if (tasks.length === 0) {
      let message = '没有任务'
      if (this.currentFilter !== 'all') {
        message = `没有${this.getStatusText(this.currentFilter)}的任务`
      }

      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-tertiary">
            ${message}
          </td>
        </tr>
      `
      return
    }

    tableBody.innerHTML = ''

    tasks.forEach(task => {
      const row = this.createTaskRow(task)
      tableBody.appendChild(row)
    })
  }

  /**
   * 创建任务行
   */
  createTaskRow(task) {
    const row = document.createElement('tr')
    row.dataset.taskId = task.id
    row.className = `task-row task-status-${task.status}`

    const statusClass = this.getStatusClass(task.status)
    const statusIcon = this.getStatusIcon(task.status)
    const statusText = this.getStatusText(task.status)

    row.innerHTML = `
      <td>
        <input type="checkbox" class="task-checkbox" data-task-id="${task.id}">
      </td>
      <td>
        <div class="task-name">
          <span class="task-name-text">${this.escapeHtml(task.name)}</span>
          ${task.error ? '<i class="fas fa-exclamation-circle text-danger ml-2" title="存在错误"></i>' : ''}
        </div>
        <div class="task-message font-sm text-tertiary">
          ${this.escapeHtml(task.message || '')}
        </div>
      </td>
      <td>
        <span class="badge badge-outline">${this.escapeHtml(task.type)}</span>
      </td>
      <td>
        <div class="task-status ${statusClass}">
          <i class="fas ${statusIcon}"></i>
          <span>${statusText}</span>
        </div>
      </td>
      <td>
        <div class="task-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${task.progress}%"></div>
          </div>
          <span class="font-sm ml-2">${task.progress}%</span>
        </div>
      </td>
      <td class="font-sm">${this.formatTime(task.createdAt)}</td>
      <td class="font-sm">${this.formatTime(task.updatedAt)}</td>
      <td>
        <div class="task-actions">
          <button class="btn btn-xs btn-outline" data-action="detail" data-task-id="${task.id}" title="查看详情">
            <i class="fas fa-eye"></i>
          </button>
          ${task.status === 'running' ? `
            <button class="btn btn-xs btn-outline" data-action="cancel" data-task-id="${task.id}" title="取消任务">
              <i class="fas fa-stop"></i>
            </button>
          ` : ''}
          ${task.status === 'failed' ? `
            <button class="btn btn-xs btn-outline" data-action="retry" data-task-id="${task.id}" title="重试任务">
              <i class="fas fa-redo"></i>
            </button>
          ` : ''}
          <button class="btn btn-xs btn-outline" data-action="delete" data-task-id="${task.id}" title="删除任务">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    `

    // 添加事件监听器
    this.setupTaskRowEvents(row, task)

    return row
  }

  /**
   * 设置任务行事件
   */
  setupTaskRowEvents(row, task) {
    const actions = row.querySelectorAll('[data-action]')

    actions.forEach(button => {
      const action = button.dataset.action
      const taskId = button.dataset.taskId

      button.addEventListener('click', (e) => {
        e.stopPropagation()
        this.handleTaskOperation(taskId, action)
      })
    })

    // 点击行查看详情
    row.addEventListener('click', (e) => {
      if (!e.target.closest('[data-action]') && !e.target.closest('.task-checkbox')) {
        this.showTaskDetail(task)
      }
    })
  }

  /**
   * 处理任务操作
   */
  handleTaskOperation(taskId, action) {
    const task = this.getTask(taskId)
    if (!task) return

    switch (action) {
      case 'detail':
        this.showTaskDetail(task)
        break
      case 'cancel':
        this.cancelTask(taskId)
        break
      case 'retry':
        this.retryTask(taskId)
        break
      case 'delete':
        this.deleteTask(taskId)
        break
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId) {
    const task = this.getTask(taskId)
    if (!task) return

    if (confirm(`确定要取消任务 "${task.name}" 吗？`)) {
      // 发送WebSocket消息取消任务
      const messageId = app.sendWebSocketMessage('task_operation', {
        operation: 'cancel',
        taskId: taskId
      })

      if (messageId) {
        this.updateTask(taskId, {
          status: 'cancelling',
          message: '正在取消任务...'
        })

        app.addNotification({
          type: 'info',
          title: '正在取消',
          message: `正在取消任务: ${task.name}`,
          duration: 3000
        })
      }
    }
  }

  /**
   * 重试任务
   */
  retryTask(taskId) {
    const task = this.getTask(taskId)
    if (!task) return

    // 发送WebSocket消息重试任务
    const messageId = app.sendWebSocketMessage('task_operation', {
      operation: 'retry',
      taskId: taskId
    })

    if (messageId) {
      this.updateTask(taskId, {
        status: 'pending',
        message: '正在重试任务...',
        progress: 0,
        error: null
      })

      app.addNotification({
        type: 'info',
        title: '正在重试',
        message: `正在重试任务: ${task.name}`,
        duration: 3000
      })
    }
  }

  /**
   * 删除任务
   */
  deleteTask(taskId) {
    const task = this.getTask(taskId)
    if (!task) return

    if (confirm(`确定要删除任务 "${task.name}" 吗？此操作不可撤销。`)) {
      const deleted = this.removeTask(taskId)
      if (deleted) {
        app.addNotification({
          type: 'success',
          title: '已删除',
          message: `任务 "${task.name}" 已删除`,
          duration: 3000
        })
      }
    }
  }

  /**
   * 显示任务详情
   */
  showTaskDetail(task) {
    const panel = document.getElementById('taskDetailPanel')
    const content = document.getElementById('taskDetailContent')

    if (!panel || !content) return

    const statusClass = this.getStatusClass(task.status)
    const statusIcon = this.getStatusIcon(task.status)
    const statusText = this.getStatusText(task.status)

    content.innerHTML = `
      <div class="task-detail">
        <div class="task-detail-header">
          <div class="task-detail-title">
            <h4>${this.escapeHtml(task.name)}</h4>
            <div class="task-detail-status ${statusClass}">
              <i class="fas ${statusIcon}"></i>
              <span>${statusText}</span>
            </div>
          </div>
          <div class="task-detail-meta">
            <span class="badge badge-outline">${this.escapeHtml(task.type)}</span>
            <span class="font-sm text-tertiary">ID: ${task.id}</span>
          </div>
        </div>

        <div class="task-detail-body">
          <div class="task-progress-section mb-4">
            <div class="d-flex justify-content-between mb-2">
              <span>进度</span>
              <span>${task.progress}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${task.progress}%"></div>
            </div>
          </div>

          <div class="task-message-section mb-4">
            <h5 class="mb-2">消息</h5>
            <div class="card card-outline">
              <div class="card-body">
                <pre class="font-sm">${this.escapeHtml(task.message || '无消息')}</pre>
              </div>
            </div>
          </div>

          ${task.error ? `
            <div class="task-error-section mb-4">
              <h5 class="mb-2 text-danger">错误信息</h5>
              <div class="card card-danger">
                <div class="card-body">
                  <pre class="font-sm">${this.escapeHtml(typeof task.error === 'string' ? task.error : JSON.stringify(task.error, null, 2))}</pre>
                </div>
              </div>
            </div>
          ` : ''}

          <div class="task-details-section mb-4">
            <h5 class="mb-2">详细信息</h5>
            <div class="card card-outline">
              <div class="card-body">
                <table class="table table-sm">
                  <tr>
                    <td width="120">创建时间</td>
                    <td>${this.formatDateTime(task.createdAt)}</td>
                  </tr>
                  <tr>
                    <td>更新时间</td>
                    <td>${this.formatDateTime(task.updatedAt)}</td>
                  </tr>
                  <tr>
                    <td>优先级</td>
                    <td>${task.priority}</td>
                  </tr>
                  ${Object.entries(task.details).map(([key, value]) => `
                    <tr>
                      <td>${this.escapeHtml(key)}</td>
                      <td><pre class="font-sm">${this.escapeHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</pre></td>
                    </tr>
                  `).join('')}
                </table>
              </div>
            </div>
          </div>

          ${Object.keys(task.metadata).length > 0 ? `
            <div class="task-metadata-section">
              <h5 class="mb-2">元数据</h5>
              <div class="card card-outline">
                <div class="card-body">
                  <pre class="font-sm">${this.escapeHtml(JSON.stringify(task.metadata, null, 2))}</pre>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <div class="task-detail-footer">
          <button class="btn btn-sm btn-outline" data-action="close-detail">
            <i class="fas fa-times"></i>
            关闭
          </button>
          ${task.status === 'running' ? `
            <button class="btn btn-sm btn-outline btn-danger" data-action="cancel-detail" data-task-id="${task.id}">
              <i class="fas fa-stop"></i>
              取消任务
            </button>
          ` : ''}
          ${task.status === 'failed' ? `
            <button class="btn btn-sm btn-outline btn-warning" data-action="retry-detail" data-task-id="${task.id}">
              <i class="fas fa-redo"></i>
              重试任务
            </button>
          ` : ''}
        </div>
      </div>
    `

    // 添加事件监听器
    panel.dataset.taskId = task.id
    panel.querySelector('[data-action="close-detail"]').addEventListener('click', () => this.hideTaskDetail())

    const cancelBtn = panel.querySelector('[data-action="cancel-detail"]')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancelTask(task.id))
    }

    const retryBtn = panel.querySelector('[data-action="retry-detail"]')
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.retryTask(task.id))
    }

    panel.style.display = 'block'
  }

  /**
   * 隐藏任务详情
   */
  hideTaskDetail() {
    const panel = document.getElementById('taskDetailPanel')
    if (panel) {
      panel.style.display = 'none'
      panel.dataset.taskId = ''
    }
  }

  /**
   * 处理操作开始事件
   */
  handleOperationStarted(data) {
    const { operation, messageId, projectId, timestamp } = data

    const taskId = messageId || `op_${timestamp}_${operation}`
    const taskName = this.getOperationName(operation)

    this.addTask({
      id: taskId,
      name: taskName,
      type: 'operation',
      status: 'running',
      progress: 0,
      message: `正在执行 ${taskName}...`,
      details: {
        operation,
        projectId,
        timestamp
      },
      createdAt: timestamp,
      priority: 1
    })
  }

  /**
   * 处理操作完成事件
   */
  handleOperationCompleted(data) {
    const { operation, messageId, projectId, timestamp } = data

    const taskId = messageId || `op_${timestamp}_${operation}`

    this.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      message: `${this.getOperationName(operation)} 完成`,
      updatedAt: timestamp
    })
  }

  /**
   * 处理操作失败事件
   */
  handleOperationFailed(data) {
    const { operation, messageId, error, timestamp } = data

    const taskId = messageId || `op_${timestamp}_${operation}`

    this.updateTask(taskId, {
      status: 'failed',
      progress: 0,
      message: `${this.getOperationName(operation)} 失败`,
      error: error || '未知错误',
      updatedAt: timestamp
    })
  }

  /**
   * 处理项目状态事件
   */
  handleProjectStatus(data) {
    const { projectId, status, message, progress, timestamp } = data

    // 查找与该项目相关的任务
    const tasks = Array.from(this.tasks.values())
    const relatedTask = tasks.find(task =>
      task.details.projectId === projectId &&
      (task.status === 'running' || task.status === 'pending')
    )

    if (relatedTask) {
      this.updateTask(relatedTask.id, {
        progress: progress || relatedTask.progress,
        message: message || relatedTask.message,
        updatedAt: timestamp
      })
    }
  }

  /**
   * 处理聊天响应事件
   */
  handleChatResponse(data) {
    const { sessionId, message, messageId, timestamp } = data

    const taskId = messageId || `chat_${timestamp}_${sessionId}`
    const existingTask = this.getTask(taskId)

    if (existingTask) {
      this.updateTask(taskId, {
        status: 'completed',
        progress: 100,
        message: 'AI响应完成',
        updatedAt: timestamp
      })
    }
  }

  /**
   * 更新任务统计
   */
  updateTaskStats() {
    const tasks = Array.from(this.tasks.values())

    this.taskStats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length
    }

    // 更新UI
    this.updateStatsDisplay()
  }

  /**
   * 更新统计显示
   */
  updateStatsDisplay() {
    const totalEl = document.getElementById('totalTasks')
    const runningEl = document.getElementById('runningTasks')
    const completedEl = document.getElementById('completedTasks')
    const failedEl = document.getElementById('failedTasks')

    if (totalEl) totalEl.textContent = this.taskStats.total
    if (runningEl) runningEl.textContent = this.taskStats.running
    if (completedEl) completedEl.textContent = this.taskStats.completed
    if (failedEl) failedEl.textContent = this.taskStats.failed
  }

  /**
   * 获取操作名称
   */
  getOperationName(operation) {
    const names = {
      'create': '创建项目',
      'update': '更新项目',
      'delete': '删除项目',
      'start': '启动项目',
      'stop': '停止项目',
      'chat_message': 'AI聊天',
      'test_run': '运行测试',
      'build': '构建项目',
      'deploy': '部署项目'
    }

    return names[operation] || operation
  }

  /**
   * 获取状态类名
   */
  getStatusClass(status) {
    switch (status) {
      case 'pending': return 'status-warning'
      case 'running': return 'status-primary'
      case 'completed': return 'status-success'
      case 'failed': return 'status-danger'
      case 'cancelled': return 'status-secondary'
      case 'cancelling': return 'status-warning'
      default: return 'status-info'
    }
  }

  /**
   * 获取状态图标
   */
  getStatusIcon(status) {
    switch (status) {
      case 'pending': return 'fa-clock'
      case 'running': return 'fa-spinner fa-spin'
      case 'completed': return 'fa-check-circle'
      case 'failed': return 'fa-exclamation-circle'
      case 'cancelled': return 'fa-ban'
      case 'cancelling': return 'fa-stop-circle'
      default: return 'fa-question-circle'
    }
  }

  /**
   * 获取状态文本
   */
  getStatusText(status) {
    const texts = {
      'pending': '等待中',
      'running': '运行中',
      'completed': '已完成',
      'failed': '失败',
      'cancelled': '已取消',
      'cancelling': '取消中'
    }

    return texts[status] || status
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 刷新按钮
    document.getElementById('refreshTasksBtn')?.addEventListener('click', () => {
      this.renderTasks()
    })

    // 清理已完成任务按钮
    document.getElementById('clearCompletedTasksBtn')?.addEventListener('click', () => {
      this.clearCompletedTasks()
    })

    // 状态筛选
    const statusFilter = document.getElementById('taskStatusFilter')
    if (statusFilter) {
      statusFilter.addEventListener('change', () => {
        this.currentFilter = statusFilter.value
        this.renderTasks()
      })
    }

    // 排序
    const taskSort = document.getElementById('taskSort')
    if (taskSort) {
      taskSort.addEventListener('change', () => {
        this.currentSort = taskSort.value
        this.renderTasks()
      })
    }

    // 全选复选框
    const selectAll = document.getElementById('selectAllTasks')
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.task-checkbox')
        checkboxes.forEach(cb => {
          cb.checked = e.target.checked
        })
      })
    }

    // 关闭任务详情按钮
    document.getElementById('closeTaskDetail')?.addEventListener('click', () => {
      this.hideTaskDetail()
    })
  }

  /**
   * 清理已完成任务
   */
  clearCompletedTasks() {
    const completedTasks = Array.from(this.tasks.values())
      .filter(task => task.status === 'completed')

    if (completedTasks.length === 0) {
      app.addNotification({
        type: 'info',
        title: '无需清理',
        message: '没有已完成的任务',
        duration: 3000
      })
      return
    }

    if (confirm(`确定要清理 ${completedTasks.length} 个已完成的任务吗？`)) {
      completedTasks.forEach(task => {
        this.removeTask(task.id)
      })

      app.addNotification({
        type: 'success',
        title: '已清理',
        message: `已清理 ${completedTasks.length} 个已完成的任务`,
        duration: 3000
      })
    }
  }

  /**
   * 视图激活时调用
   */
  onViewActivated() {
    console.log('任务视图已激活')
    this.renderTasks()
    this.updateTaskStats()
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

  /**
   * 工具函数：格式化时间（相对时间）
   */
  formatTime(timestamp) {
    if (!timestamp) return ''

    const now = Date.now()
    const diff = now - timestamp

    if (diff < 60000) { // 1分钟内
      return '刚刚'
    } else if (diff < 3600000) { // 1小时内
      return Math.floor(diff / 60000) + '分钟前'
    } else if (diff < 86400000) { // 1天内
      return Math.floor(diff / 3600000) + '小时前'
    } else {
      return Math.floor(diff / 86400000) + '天前'
    }
  }

  /**
   * 工具函数：格式化日期时间
   */
  formatDateTime(timestamp) {
    if (!timestamp) return ''

    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }
}

/**
 * 创建并初始化任务管理器实例
 */
const taskManager = new TaskManager()

/**
 * 导出
 */
window.taskManager = taskManager

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  // 延迟初始化，等待DOM完全加载
  setTimeout(() => {
    if (document.querySelector('[data-view="tasks"]')) {
      taskManager.init()
    }
  }, 100)
})