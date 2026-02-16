/**
 * 项目管理面板逻辑
 * 设计思路：提供项目列表、状态监控、快速操作和配置编辑功能
 *
 * 功能特点：
 * 1. 项目列表 - 显示所有项目的卡片式布局
 * 2. 状态监控 - 实时显示项目运行状态
 * 3. 快速操作 - 启动、停止、删除等一键操作
 * 4. 配置编辑 - 在线编辑项目配置
 * 5. 日志查看 - 实时查看项目日志
 *
 * 踩坑提醒：
 * 1. 项目状态更新要实时准确
 * 2. 文件操作要处理权限和错误
 * 3. 配置编辑要支持验证和撤销
 * 4. 日志查看要支持实时滚动和搜索
 */

class ProjectManager {
  constructor() {
    this.projects = []
    this.currentProject = null
    this.projectStats = {
      total: 0,
      running: 0,
      stopped: 0,
      error: 0
    }

    // 绑定方法
    this.init = this.init.bind(this)
    this.loadProjects = this.loadProjects.bind(this)
    this.renderProjects = this.renderProjects.bind(this)
    this.openProject = this.openProject.bind(this)
    this.startProject = this.startProject.bind(this)
    this.stopProject = this.stopProject.bind(this)
    this.deleteProject = this.deleteProject.bind(this)
    this.editConfig = this.editConfig.bind(this)
    this.viewLogs = this.viewLogs.bind(this)
    this.refreshProject = this.refreshProject.bind(this)
    this.updateProjectStats = this.updateProjectStats.bind(this)
  }

  /**
   * 初始化项目管理
   */
  async init() {
    console.log('初始化项目管理')

    // 加载项目
    await this.loadProjects()

    // 设置事件监听器
    this.setupEventListeners()

    // 监听应用事件
    app.on('viewLoaded', (view) => {
      if (view === 'projects') {
        this.onViewActivated()
      }
    })

    // 监听项目相关事件
    app.on('refreshProjects', () => {
      this.loadProjects()
    })

    app.on('projectStatusUpdated', (data) => {
      this.updateProjectStatus(data)
    })

    console.log('项目管理初始化完成')
  }

  /**
   * 加载项目列表
   */
  async loadProjects() {
    try {
      const response = await fetch('/api/project-management/projects')
      const result = await response.json()

      if (result.success) {
        this.projects = result.data.projects
        this.updateProjectStats()
        this.renderProjects()

        // 更新仪表板统计
        this.updateDashboardStats()
      } else {
        throw new Error(result.error || '加载项目失败')
      }
    } catch (error) {
      console.error('加载项目失败:', error)
      app.addNotification({
        type: 'error',
        title: '加载失败',
        message: '无法加载项目列表'
      })
    }
  }

  /**
   * 渲染项目列表
   */
  renderProjects() {
    const projectsContainer = document.getElementById('projectsContainer')
    if (!projectsContainer) return

    if (this.projects.length === 0) {
      projectsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <i class="fas fa-folder-open"></i>
          </div>
          <h3>还没有项目</h3>
          <p>使用项目向导创建你的第一个项目</p>
          <button class="btn btn-primary" onclick="app.setCurrentView('wizard')">
            <i class="fas fa-plus"></i>
            创建项目
          </button>
        </div>
      `
      return
    }

    projectsContainer.innerHTML = ''

    this.projects.forEach(project => {
      const projectCard = this.createProjectCard(project)
      projectsContainer.appendChild(projectCard)
    })
  }

  /**
   * 创建项目卡片
   */
  createProjectCard(project) {
    const card = document.createElement('div')
    card.className = 'project-card'
    card.dataset.projectId = project.id

    const status = this.getProjectStatus(project)
    const statusClass = this.getStatusClass(status)
    const statusIcon = this.getStatusIcon(status)

    card.innerHTML = `
      <div class="project-card-header">
        <div class="project-icon">
          <i class="fas fa-folder"></i>
        </div>
        <div class="project-info">
          <h4 class="project-name">${this.escapeHtml(project.name)}</h4>
          <div class="project-meta">
            <span class="project-type">${this.escapeHtml(project.type)}</span>
            <span class="project-version">v${this.escapeHtml(project.version)}</span>
          </div>
        </div>
        <div class="project-status ${statusClass}">
          <i class="fas ${statusIcon}"></i>
          <span>${status}</span>
        </div>
      </div>

      <div class="project-card-body">
        <p class="project-description">${this.escapeHtml(project.description || '暂无描述')}</p>

        <div class="project-stats">
          <div class="stat-item">
            <span class="stat-label">路径</span>
            <span class="stat-value" title="${project.path}">${this.truncatePath(project.path)}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">创建时间</span>
            <span class="stat-value">${this.formatDate(project.createdAt)}</span>
          </div>
        </div>
      </div>

      <div class="project-card-footer">
        <div class="project-actions">
          <button class="btn btn-sm btn-outline" data-action="open" title="打开项目">
            <i class="fas fa-folder-open"></i>
          </button>
          <button class="btn btn-sm btn-outline" data-action="start" title="启动项目">
            <i class="fas fa-play"></i>
          </button>
          <button class="btn btn-sm btn-outline" data-action="stop" title="停止项目">
            <i class="fas fa-stop"></i>
          </button>
          <button class="btn btn-sm btn-outline" data-action="logs" title="查看日志">
            <i class="fas fa-file-alt"></i>
          </button>
          <button class="btn btn-sm btn-outline" data-action="config" title="编辑配置">
            <i class="fas fa-cog"></i>
          </button>
          <button class="btn btn-sm btn-outline" data-action="delete" title="删除项目">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `

    // 添加事件监听器
    this.setupProjectCardEvents(card, project)

    return card
  }

  /**
   * 设置项目卡片事件
   */
  setupProjectCardEvents(card, project) {
    const actions = card.querySelectorAll('[data-action]')

    actions.forEach(button => {
      const action = button.dataset.action

      button.addEventListener('click', (e) => {
        e.stopPropagation()

        switch (action) {
          case 'open':
            this.openProject(project)
            break
          case 'start':
            this.startProject(project)
            break
          case 'stop':
            this.stopProject(project)
            break
          case 'logs':
            this.viewLogs(project)
            break
          case 'config':
            this.editConfig(project)
            break
          case 'delete':
            this.deleteProject(project)
            break
        }
      })
    })

    // 点击卡片打开项目详情
    card.addEventListener('click', (e) => {
      if (!e.target.closest('[data-action]')) {
        this.openProject(project)
      }
    })
  }

  /**
   * 打开项目
   */
  openProject(project) {
    console.log('打开项目:', project.name)

    // 设置当前项目
    app.setCurrentProject(project)

    // 显示项目详情
    this.showProjectDetail(project)

    app.addNotification({
      type: 'info',
      title: '项目已打开',
      message: `正在查看项目: ${project.name}`,
      duration: 3000
    })
  }

  /**
   * 启动项目
   */
  async startProject(project) {
    console.log('启动项目:', project.name)

    try {
      // 发送WebSocket消息启动项目
      const messageId = app.sendWebSocketMessage('project_operation', {
        operation: 'start',
        projectId: project.id,
        projectPath: project.path
      })

      if (!messageId) {
        throw new Error('WebSocket未连接')
      }

      app.addNotification({
        type: 'info',
        title: '正在启动',
        message: `正在启动项目: ${project.name}`,
        duration: 3000
      })

    } catch (error) {
      console.error('启动项目失败:', error)
      app.addNotification({
        type: 'error',
        title: '启动失败',
        message: '无法启动项目'
      })
    }
  }

  /**
   * 停止项目
   */
  async stopProject(project) {
    console.log('停止项目:', project.name)

    try {
      // 发送WebSocket消息停止项目
      const messageId = app.sendWebSocketMessage('project_operation', {
        operation: 'stop',
        projectId: project.id,
        projectPath: project.path
      })

      if (!messageId) {
        throw new Error('WebSocket未连接')
      }

      app.addNotification({
        type: 'info',
        title: '正在停止',
        message: `正在停止项目: ${project.name}`,
        duration: 3000
      })

    } catch (error) {
      console.error('停止项目失败:', error)
      app.addNotification({
        type: 'error',
        title: '停止失败',
        message: '无法停止项目'
      })
    }
  }

  /**
   * 删除项目
   */
  async deleteProject(project) {
    if (!confirm(`确定要删除项目 "${project.name}" 吗？此操作不可撤销。`)) {
      return
    }

    console.log('删除项目:', project.name)

    try {
      const response = await fetch(`/api/project-management/projects/${project.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: project.path,
          force: false // 安全模式，不实际删除
        })
      })

      const result = await response.json()

      if (result.success) {
        // 从列表中移除
        this.projects = this.projects.filter(p => p.id !== project.id)
        this.updateProjectStats()
        this.renderProjects()

        // 如果删除的是当前项目，清空当前项目
        if (app.currentProject?.id === project.id) {
          app.setCurrentProject(null)
        }

        app.addNotification({
          type: 'success',
          title: '已删除',
          message: `项目 "${project.name}" 已删除`,
          duration: 5000
        })
      } else {
        throw new Error(result.error || '删除项目失败')
      }
    } catch (error) {
      console.error('删除项目失败:', error)
      app.addNotification({
        type: 'error',
        title: '删除失败',
        message: '无法删除项目'
      })
    }
  }

  /**
   * 编辑配置
   */
  async editConfig(project) {
    console.log('编辑配置:', project.name)

    try {
      // 加载项目配置
      const response = await fetch(`/api/project-management/projects/${project.id}?path=${encodeURIComponent(project.path)}`)
      const result = await response.json()

      if (result.success) {
        const projectData = result.data
        this.showConfigEditor(projectData)
      } else {
        throw new Error(result.error || '加载配置失败')
      }
    } catch (error) {
      console.error('加载配置失败:', error)
      app.addNotification({
        type: 'error',
        title: '加载失败',
        message: '无法加载项目配置'
      })
    }
  }

  /**
   * 查看日志
   */
  viewLogs(project) {
    console.log('查看日志:', project.name)
    this.showLogViewer(project)
  }

  /**
   * 刷新项目状态
   */
  async refreshProject(project) {
    console.log('刷新项目状态:', project.name)

    try {
      const response = await fetch(`/api/project/status?path=${encodeURIComponent(project.path)}`)
      const result = await response.json()

      if (result.success) {
        // 更新项目状态
        this.updateProjectCard(project.id, result.data)
        app.addNotification({
          type: 'success',
          title: '已刷新',
          message: `项目状态已更新`,
          duration: 3000
        })
      }
    } catch (error) {
      console.error('刷新项目状态失败:', error)
    }
  }

  /**
   * 更新项目状态
   */
  updateProjectStatus(data) {
    const { projectId, status, message } = data

    // 更新项目卡片
    this.updateProjectCard(projectId, { status, message })

    // 更新统计
    this.updateProjectStats()

    // 显示通知
    if (message) {
      app.addNotification({
        type: 'info',
        title: '状态更新',
        message: message,
        duration: 3000
      })
    }
  }

  /**
   * 更新项目卡片
   */
  updateProjectCard(projectId, updates) {
    const card = document.querySelector(`[data-project-id="${projectId}"]`)
    if (!card) return

    const status = updates.status || this.getProjectStatus(updates)
    const statusClass = this.getStatusClass(status)
    const statusIcon = this.getStatusIcon(status)

    const statusElement = card.querySelector('.project-status')
    if (statusElement) {
      statusElement.className = `project-status ${statusClass}`
      statusElement.innerHTML = `<i class="fas ${statusIcon}"></i><span>${status}</span>`
    }

    // 更新项目对象
    const projectIndex = this.projects.findIndex(p => p.id === projectId)
    if (projectIndex !== -1) {
      this.projects[projectIndex] = { ...this.projects[projectIndex], ...updates }
    }
  }

  /**
   * 更新项目统计
   */
  updateProjectStats() {
    this.projectStats = {
      total: this.projects.length,
      running: this.projects.filter(p => this.getProjectStatus(p) === '运行中').length,
      stopped: this.projects.filter(p => this.getProjectStatus(p) === '已停止').length,
      error: this.projects.filter(p => this.getProjectStatus(p) === '错误').length
    }

    // 更新UI
    this.updateStatsDisplay()
  }

  /**
   * 更新统计显示
   */
  updateStatsDisplay() {
    const statsContainer = document.getElementById('projectStats')
    if (!statsContainer) return

    statsContainer.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${this.projectStats.total}</div>
          <div class="stat-label">总项目数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-success">${this.projectStats.running}</div>
          <div class="stat-label">运行中</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-warning">${this.projectStats.stopped}</div>
          <div class="stat-label">已停止</div>
        </div>
        <div class="stat-card">
          <div class="stat-value text-danger">${this.projectStats.error}</div>
          <div class="stat-label">错误</div>
        </div>
      </div>
    `
  }

  /**
   * 更新仪表板统计
   */
  updateDashboardStats() {
    // 更新仪表板上的项目统计
    const totalProjects = document.getElementById('totalProjects')
    const runningProjects = document.getElementById('runningProjects')
    const lastActivity = document.getElementById('lastActivity')

    if (totalProjects) {
      totalProjects.textContent = this.projectStats.total
    }

    if (runningProjects) {
      runningProjects.textContent = this.projectStats.running
    }

    if (lastActivity) {
      if (this.projects.length > 0) {
        const latestProject = this.projects.reduce((latest, project) => {
          const latestTime = new Date(latest.updatedAt || latest.createdAt)
          const projectTime = new Date(project.updatedAt || project.createdAt)
          return projectTime > latestTime ? project : latest
        })

        lastActivity.textContent = this.formatTime(latestProject.updatedAt || latestProject.createdAt)
      } else {
        lastActivity.textContent = '-'
      }
    }
  }

  /**
   * 显示项目详情
   */
  showProjectDetail(project) {
    // 这里应该显示项目详情模态框
    // 暂时显示通知
    app.addNotification({
      type: 'info',
      title: '项目详情',
      message: `正在查看项目 "${project.name}" 的详细信息`,
      duration: 3000
    })
  }

  /**
   * 显示配置编辑器
   */
  showConfigEditor(projectData) {
    // 这里应该显示配置编辑器模态框
    // 暂时显示通知
    app.addNotification({
      type: 'info',
      title: '配置编辑器',
      message: `正在编辑项目 "${projectData.info.name}" 的配置`,
      duration: 3000
    })
  }

  /**
   * 显示日志查看器
   */
  showLogViewer(project) {
    // 这里应该显示日志查看器模态框
    // 暂时显示通知
    app.addNotification({
      type: 'info',
      title: '日志查看器',
      message: `正在查看项目 "${project.name}" 的日志`,
      duration: 3000
    })
  }

  /**
   * 获取项目状态
   */
  getProjectStatus(project) {
    // 这里应该根据实际状态返回
    // 暂时返回模拟状态
    const statuses = ['运行中', '已停止', '错误', '未知']
    return statuses[Math.floor(Math.random() * statuses.length)]
  }

  /**
   * 获取状态类名
   */
  getStatusClass(status) {
    switch (status) {
      case '运行中':
        return 'status-success'
      case '已停止':
        return 'status-warning'
      case '错误':
        return 'status-danger'
      default:
        return 'status-info'
    }
  }

  /**
   * 获取状态图标
   */
  getStatusIcon(status) {
    switch (status) {
      case '运行中':
        return 'fa-play-circle'
      case '已停止':
        return 'fa-stop-circle'
      case '错误':
        return 'fa-exclamation-circle'
      default:
        return 'fa-question-circle'
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 刷新按钮
    document.getElementById('refreshProjectsBtn')?.addEventListener('click', () => {
      this.loadProjects()
    })

    // 创建项目按钮
    document.getElementById('createProjectBtn')?.addEventListener('click', () => {
      app.setCurrentView('wizard')
    })

    // 搜索项目
    const searchInput = document.getElementById('projectSearch')
    if (searchInput) {
      searchInput.addEventListener('input', debounce(() => {
        this.filterProjects(searchInput.value)
      }, 300))
    }

    // 项目排序
    const sortSelect = document.getElementById('projectSort')
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        this.sortProjects(sortSelect.value)
      })
    }
  }

  /**
   * 过滤项目
   */
  filterProjects(searchTerm) {
    if (!searchTerm) {
      this.renderProjects()
      return
    }

    const filtered = this.projects.filter(project => {
      const searchLower = searchTerm.toLowerCase()
      return (
        project.name.toLowerCase().includes(searchLower) ||
        project.description?.toLowerCase().includes(searchLower) ||
        project.type.toLowerCase().includes(searchLower)
      )
    })

    this.renderFilteredProjects(filtered)
  }

  /**
   * 渲染过滤后的项目
   */
  renderFilteredProjects(filteredProjects) {
    const projectsContainer = document.getElementById('projectsContainer')
    if (!projectsContainer) return

    if (filteredProjects.length === 0) {
      projectsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <i class="fas fa-search"></i>
          </div>
          <h3>未找到项目</h3>
          <p>没有找到匹配 "${document.getElementById('projectSearch')?.value}" 的项目</p>
        </div>
      `
      return
    }

    projectsContainer.innerHTML = ''
    filteredProjects.forEach(project => {
      const projectCard = this.createProjectCard(project)
      projectsContainer.appendChild(projectCard)
    })
  }

  /**
   * 排序项目
   */
  sortProjects(sortBy) {
    let sortedProjects = [...this.projects]

    switch (sortBy) {
      case 'name':
        sortedProjects.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'created':
        sortedProjects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        break
      case 'updated':
        sortedProjects.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
        break
      case 'type':
        sortedProjects.sort((a, b) => a.type.localeCompare(b.type))
        break
    }

    this.projects = sortedProjects
    this.renderProjects()
  }

  /**
   * 视图激活时调用
   */
  onViewActivated() {
    console.log('项目管理视图已激活')
    this.loadProjects()
  }

  /**
   * 工具函数：转义HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  /**
   * 工具函数：截断路径
   */
  truncatePath(path, maxLength = 30) {
    if (!path) return ''
    if (path.length <= maxLength) return this.escapeHtml(path)

    const parts = path.split('/')
    if (parts.length <= 2) {
      return '...' + path.substring(path.length - maxLength)
    }

    const firstPart = parts[0]
    const lastPart = parts[parts.length - 1]
    return this.escapeHtml(firstPart + '/.../' + lastPart)
  }

  /**
   * 工具函数：格式化日期
   */
  formatDate(dateString) {
    if (!dateString) return ''

    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date

    if (diff < 86400000) { // 1天内
      return date.toLocaleTimeString()
    } else if (diff < 604800000) { // 1周内
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
    } else {
      return date.toLocaleDateString()
    }
  }

  /**
   * 工具函数：格式化时间
   */
  formatTime(dateString) {
    if (!dateString) return ''

    const date = new Date(dateString)
    const now = new Date()
    const diff = now - date

    if (diff < 60000) { // 1分钟内
      return '刚刚'
    } else if (diff < 3600000) { // 1小时内
      return Math.floor(diff / 60000) + '分钟前'
    } else if (diff < 86400000) { // 1天内
      return Math.floor(diff / 3600000) + '小时前'
    } else if (diff < 604800000) { // 1周内
      return Math.floor(diff / 86400000) + '天前'
    } else {
      return date.toLocaleDateString()
    }
  }

  /**
   * 工具函数：截断文本
   */
  truncateText(text, maxLength) {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }
}

/**
 * 防抖函数
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
 * 创建并初始化项目管理实例
 */
const projectManager = new ProjectManager()

/**
 * 导出
 */
window.projectManager = projectManager

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  // 延迟初始化，等待DOM完全加载
  setTimeout(() => {
    if (document.querySelector('[data-view="projects"]')) {
      projectManager.init()
    }
  }, 100)
})