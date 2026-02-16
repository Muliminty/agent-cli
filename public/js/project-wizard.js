/**
 * 项目向导逻辑
 * 设计思路：提供可视化项目创建向导，支持模板选择、配置验证、项目生成
 *
 * 功能特点：
 * 1. 模板管理 - 加载和显示可用项目模板
 * 2. 配置验证 - 实时验证用户输入
 * 3. 向导导航 - 步骤式导航和状态管理
 * 4. 项目生成 - 调用API生成项目并显示进度
 * 5. 实时反馈 - 显示生成进度和结果
 *
 * 踩坑提醒：
 * 1. 表单验证要及时反馈，避免用户困惑
 * 2. 异步操作要处理加载状态和错误
 * 3. 步骤导航要保存中间状态
 * 4. 文件路径处理要跨平台兼容
 */

class ProjectWizard {
  constructor() {
    this.currentStep = 1
    this.totalSteps = 4
    this.selectedTemplate = null
    this.wizardData = {
      template: null,
      config: {
        name: '',
        description: '',
        version: '1.0.0',
        license: 'MIT',
        author: '',
        repository: '',
        initGit: true,
        gitName: '',
        gitEmail: ''
      }
    }
    this.wizardSessionId = null
    this.generationInProgress = false

    // 绑定方法
    this.init = this.init.bind(this)
    this.nextStep = this.nextStep.bind(this)
    this.prevStep = this.prevStep.bind(this)
    this.selectTemplate = this.selectTemplate.bind(this)
    this.updateConfig = this.updateConfig.bind(this)
    this.validateStep = this.validateStep.bind(this)
    this.startGeneration = this.startGeneration.bind(this)
    this.cancelGeneration = this.cancelGeneration.bind(this)
    this.resetWizard = this.resetWizard.bind(this)
  }

  /**
   * 初始化向导
   */
  async init() {
    console.log('初始化项目向导')

    // 加载模板
    await this.loadTemplates()

    // 设置事件监听器
    this.setupEventListeners()

    // 恢复保存的状态
    this.restoreState()

    // 监听视图切换
    app.on('viewLoaded', (view) => {
      if (view === 'wizard') {
        this.onViewActivated()
      }
    })

    console.log('项目向导初始化完成')
  }

  /**
   * 加载模板
   */
  async loadTemplates() {
    try {
      const response = await fetch('/api/project-wizard/templates')
      const result = await response.json()

      if (result.success) {
        this.templates = result.data.templates
        this.renderTemplates()
      } else {
        throw new Error(result.error || '加载模板失败')
      }
    } catch (error) {
      console.error('加载模板失败:', error)
      app.addNotification({
        type: 'error',
        title: '加载失败',
        message: '无法加载项目模板，请检查网络连接'
      })

      // 显示错误状态
      const templateGrid = document.getElementById('templateGrid')
      if (templateGrid) {
        templateGrid.innerHTML = `
          <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>无法加载模板</p>
            <button class="btn btn-sm btn-outline" onclick="window.projectWizard.loadTemplates()">
              重试
            </button>
          </div>
        `
      }
    }
  }

  /**
   * 渲染模板
   */
  renderTemplates() {
    const templateGrid = document.getElementById('templateGrid')
    if (!templateGrid || !this.templates) return

    templateGrid.innerHTML = ''

    this.templates.forEach(template => {
      const templateCard = document.createElement('div')
      templateCard.className = 'template-card'
      templateCard.dataset.templateId = template.id

      // 检查是否已选中
      if (this.selectedTemplate?.id === template.id) {
        templateCard.classList.add('selected')
      }

      templateCard.innerHTML = `
        <div class="template-icon">${template.icon}</div>
        <div class="template-name">${template.name}</div>
        <div class="template-description">${template.description}</div>
        <div class="template-tags">
          ${template.tags.map(tag => `<span class="template-tag">${tag}</span>`).join('')}
        </div>
      `

      templateCard.addEventListener('click', () => this.selectTemplate(template))
      templateGrid.appendChild(templateCard)
    })
  }

  /**
   * 选择模板
   */
  selectTemplate(template) {
    console.log('选择模板:', template.name)

    // 更新选中状态
    this.selectedTemplate = template
    this.wizardData.template = template.id

    // 更新UI
    document.querySelectorAll('.template-card').forEach(card => {
      card.classList.remove('selected')
    })

    const selectedCard = document.querySelector(`[data-template-id="${template.id}"]`)
    if (selectedCard) {
      selectedCard.classList.add('selected')
    }

    // 启用下一步按钮
    const nextButton = document.getElementById('nextStep1')
    if (nextButton) {
      nextButton.disabled = false
    }

    // 更新预览
    this.updatePreview()

    // 加载模板特定配置
    this.loadTemplateSpecificConfig(template)

    app.addNotification({
      type: 'success',
      title: '模板已选择',
      message: `已选择 ${template.name} 模板`,
      duration: 3000
    })
  }

  /**
   * 加载模板特定配置
   */
  loadTemplateSpecificConfig(template) {
    const container = document.getElementById('templateSpecificConfig')
    if (!container) return

    container.innerHTML = ''

    // 根据模板类型添加特定配置
    switch (template.framework) {
      case 'react':
      case 'vue':
      case 'nextjs':
        this.addWebAppConfig(container, template)
        break
      case 'node':
        if (template.category === 'api') {
          this.addApiConfig(container, template)
        } else if (template.category === 'cli') {
          this.addCliConfig(container, template)
        }
        break
    }
  }

  /**
   * 添加Web应用配置
   */
  addWebAppConfig(container, template) {
    const section = document.createElement('div')
    section.className = 'config-section'
    section.innerHTML = `
      <h4>Web应用配置</h4>
      <div class="form-group">
        <label class="form-label" for="appPort">开发服务器端口</label>
        <input type="number" class="form-input" id="appPort" value="3000" min="1024" max="65535">
        <div class="form-hint">开发服务器的监听端口</div>
      </div>
      <div class="form-group">
        <label class="form-checkbox">
          <input type="checkbox" id="enableRouter" checked>
          <span>启用路由</span>
        </label>
      </div>
      <div class="form-group">
        <label class="form-checkbox">
          <input type="checkbox" id="enableStateManagement" checked>
          <span>启用状态管理</span>
        </label>
      </div>
    `
    container.appendChild(section)
  }

  /**
   * 添加API配置
   */
  addApiConfig(container, template) {
    const section = document.createElement('div')
    section.className = 'config-section'
    section.innerHTML = `
      <h4>API服务配置</h4>
      <div class="form-group">
        <label class="form-label" for="apiPort">服务端口</label>
        <input type="number" class="form-input" id="apiPort" value="3000" min="1024" max="65535">
        <div class="form-hint">API服务的监听端口</div>
      </div>
      <div class="form-group">
        <label class="form-checkbox">
          <input type="checkbox" id="enableCors" checked>
          <span>启用CORS</span>
        </label>
      </div>
      <div class="form-group">
        <label class="form-checkbox">
          <input type="checkbox" id="enableAuth" checked>
          <span>启用身份验证</span>
        </label>
      </div>
      <div class="form-group">
        <label class="form-checkbox">
          <input type="checkbox" id="enableDatabase" checked>
          <span>启用数据库</span>
        </label>
      </div>
    `
    container.appendChild(section)
  }

  /**
   * 添加CLI配置
   */
  addCliConfig(container, template) {
    const section = document.createElement('div')
    section.className = 'config-section'
    section.innerHTML = `
      <h4>CLI工具配置</h4>
      <div class="form-group">
        <label class="form-label" for="cliName">命令名称</label>
        <input type="text" class="form-input" id="cliName" value="${template.defaultConfig.binName || 'my-cli'}">
        <div class="form-hint">在终端中使用的命令名称</div>
      </div>
      <div class="form-group">
        <label class="form-checkbox">
          <input type="checkbox" id="enableColors" checked>
          <span>启用彩色输出</span>
        </label>
      </div>
      <div class="form-checkbox">
        <input type="checkbox" id="enableProgress" checked>
        <span>启用进度指示器</span>
      </div>
    `
    container.appendChild(section)
  }

  /**
   * 更新配置
   */
  updateConfig() {
    // 基本配置
    this.wizardData.config = {
      name: document.getElementById('projectName').value.trim(),
      description: document.getElementById('projectDescription').value.trim(),
      version: document.getElementById('projectVersion').value.trim(),
      license: document.getElementById('projectLicense').value,
      author: document.getElementById('projectAuthor').value.trim(),
      repository: document.getElementById('projectRepository').value.trim(),
      initGit: document.getElementById('initGit').checked,
      gitName: document.getElementById('gitName').value.trim(),
      gitEmail: document.getElementById('gitEmail').value.trim()
    }

    // 模板特定配置
    if (this.selectedTemplate) {
      switch (this.selectedTemplate.framework) {
        case 'react':
        case 'vue':
        case 'nextjs':
          this.wizardData.config.appPort = parseInt(document.getElementById('appPort')?.value || '3000')
          this.wizardData.config.enableRouter = document.getElementById('enableRouter')?.checked || false
          this.wizardData.config.enableStateManagement = document.getElementById('enableStateManagement')?.checked || false
          break
        case 'node':
          if (this.selectedTemplate.category === 'api') {
            this.wizardData.config.apiPort = parseInt(document.getElementById('apiPort')?.value || '3000')
            this.wizardData.config.enableCors = document.getElementById('enableCors')?.checked || false
            this.wizardData.config.enableAuth = document.getElementById('enableAuth')?.checked || false
            this.wizardData.config.enableDatabase = document.getElementById('enableDatabase')?.checked || false
          } else if (this.selectedTemplate.category === 'cli') {
            this.wizardData.config.cliName = document.getElementById('cliName')?.value || 'my-cli'
            this.wizardData.config.enableColors = document.getElementById('enableColors')?.checked || false
            this.wizardData.config.enableProgress = document.getElementById('enableProgress')?.checked || false
          }
          break
      }
    }

    // 更新预览
    this.updatePreview()

    // 验证当前步骤
    this.validateStep(this.currentStep)
  }

  /**
   * 更新预览
   */
  updatePreview() {
    // 更新项目信息预览
    document.getElementById('previewTemplate').textContent = this.selectedTemplate?.name || '-'
    document.getElementById('previewName').textContent = this.wizardData.config.name || '-'
    document.getElementById('previewDescription').textContent = this.wizardData.config.description || '-'
    document.getElementById('previewVersion').textContent = this.wizardData.config.version || '-'
    document.getElementById('previewLicense').textContent = this.wizardData.config.license || '-'
    document.getElementById('previewAuthor').textContent = this.wizardData.config.author || '-'

    // 更新依赖预览
    if (this.selectedTemplate) {
      const deps = this.getTemplateDependencies(this.selectedTemplate)
      const depsContainer = document.getElementById('previewDependencies')
      const devDepsContainer = document.getElementById('previewDevDependencies')

      if (depsContainer && deps.dependencies) {
        depsContainer.innerHTML = Object.keys(deps.dependencies)
          .map(dep => `<span class="deps-item">${dep}</span>`)
          .join('')
      }

      if (devDepsContainer && deps.devDependencies) {
        devDepsContainer.innerHTML = Object.keys(deps.devDependencies)
          .map(dep => `<span class="deps-item">${dep}</span>`)
          .join('')
      }
    }
  }

  /**
   * 获取模板依赖
   */
  getTemplateDependencies(template) {
    // 这里应该根据模板返回实际的依赖
    // 暂时返回示例数据
    switch (template.framework) {
      case 'react':
        return {
          dependencies: {
            'react': '^18.2.0',
            'react-dom': '^18.2.0'
          },
          devDependencies: {
            'typescript': '^5.0.0',
            'vite': '^4.0.0',
            '@vitejs/plugin-react': '^4.0.0'
          }
        }
      case 'vue':
        return {
          dependencies: {
            'vue': '^3.3.0'
          },
          devDependencies: {
            'typescript': '^5.0.0',
            'vite': '^4.0.0',
            '@vitejs/plugin-vue': '^4.0.0'
          }
        }
      case 'node':
        return {
          dependencies: {
            'express': '^4.18.0'
          },
          devDependencies: {
            'typescript': '^5.0.0',
            'tsup': '^7.0.0',
            '@types/express': '^4.17.0'
          }
        }
      default:
        return {
          dependencies: {},
          devDependencies: {}
        }
    }
  }

  /**
   * 下一步
   */
  async nextStep() {
    if (this.currentStep >= this.totalSteps) return

    // 验证当前步骤
    if (!this.validateStep(this.currentStep)) {
      return
    }

    // 保存当前步骤数据
    this.saveStepData(this.currentStep)

    // 如果是步骤1，开始向导会话
    if (this.currentStep === 1 && this.selectedTemplate) {
      await this.startWizardSession()
    }

    // 如果是步骤3，开始生成项目
    if (this.currentStep === 3) {
      this.startGeneration()
      return
    }

    // 更新步骤
    this.currentStep++

    // 更新UI
    this.updateStepUI()

    // 保存状态
    this.saveState()

    console.log(`切换到步骤 ${this.currentStep}`)
  }

  /**
   * 上一步
   */
  prevStep() {
    if (this.currentStep <= 1) return

    // 更新步骤
    this.currentStep--

    // 更新UI
    this.updateStepUI()

    // 恢复步骤数据
    this.restoreStepData(this.currentStep)

    console.log(`切换到步骤 ${this.currentStep}`)
  }

  /**
   * 更新步骤UI
   */
  updateStepUI() {
    // 更新步骤指示器
    document.querySelectorAll('.wizard-step').forEach((step, index) => {
      const stepNumber = parseInt(step.dataset.step)
      step.classList.remove('active', 'completed')

      if (stepNumber < this.currentStep) {
        step.classList.add('completed')
      } else if (stepNumber === this.currentStep) {
        step.classList.add('active')
      }
    })

    // 更新步骤内容
    document.querySelectorAll('.wizard-step-content').forEach(content => {
      content.classList.remove('active')
      if (parseInt(content.dataset.step) === this.currentStep) {
        content.classList.add('active')
      }
    })

    // 更新按钮状态
    this.updateButtonStates()
  }

  /**
   * 更新按钮状态
   */
  updateButtonStates() {
    // 上一步按钮
    const prevButtons = document.querySelectorAll('[id^="prevStep"]')
    prevButtons.forEach(btn => {
      btn.disabled = this.currentStep === 1
    })

    // 下一步按钮
    const nextButtons = document.querySelectorAll('[id^="nextStep"]')
    nextButtons.forEach(btn => {
      if (this.currentStep === 1) {
        btn.disabled = !this.selectedTemplate
      } else if (this.currentStep === 2) {
        btn.disabled = !this.validateStep(2)
      } else {
        btn.disabled = false
      }
    })

    // 步骤4的特殊处理
    if (this.currentStep === 4) {
      const prevBtn = document.getElementById('prevStep4')
      const cancelBtn = document.getElementById('cancelGeneration')

      if (prevBtn) prevBtn.disabled = this.generationInProgress
      if (cancelBtn) {
        cancelBtn.style.display = this.generationInProgress ? 'inline-flex' : 'none'
      }
    }
  }

  /**
   * 验证步骤
   */
  validateStep(step) {
    switch (step) {
      case 1:
        return !!this.selectedTemplate

      case 2:
        const name = this.wizardData.config.name
        const nameError = document.getElementById('nameError')

        if (!name || name.trim().length === 0) {
          if (nameError) {
            nameError.textContent = '项目名称不能为空'
          }
          return false
        }

        if (name.length > 50) {
          if (nameError) {
            nameError.textContent = '项目名称不能超过50个字符'
          }
          return false
        }

        // 验证名称格式
        const nameRegex = /^[a-z0-9-_]+$/
        if (!nameRegex.test(name)) {
          if (nameError) {
            nameError.textContent = '只能使用小写字母、数字、连字符和下划线'
          }
          return false
        }

        if (nameError) {
          nameError.textContent = ''
        }
        return true

      case 3:
        return this.validateStep(1) && this.validateStep(2)

      default:
        return true
    }
  }

  /**
   * 保存步骤数据
   */
  saveStepData(step) {
    if (step === 2) {
      this.updateConfig()
    }
  }

  /**
   * 恢复步骤数据
   */
  restoreStepData(step) {
    if (step === 2) {
      // 恢复表单数据
      document.getElementById('projectName').value = this.wizardData.config.name
      document.getElementById('projectDescription').value = this.wizardData.config.description
      document.getElementById('projectVersion').value = this.wizardData.config.version
      document.getElementById('projectLicense').value = this.wizardData.config.license
      document.getElementById('projectAuthor').value = this.wizardData.config.author
      document.getElementById('projectRepository').value = this.wizardData.config.repository
      document.getElementById('initGit').checked = this.wizardData.config.initGit
      document.getElementById('gitName').value = this.wizardData.config.gitName
      document.getElementById('gitEmail').value = this.wizardData.config.gitEmail
    }
  }

  /**
   * 开始向导会话
   */
  async startWizardSession() {
    try {
      const response = await fetch('/api/project-wizard/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          templateId: this.selectedTemplate.id
        })
      })

      const result = await response.json()

      if (result.success && result.session) {
        this.wizardSessionId = result.session.id
        console.log('向导会话已创建:', this.wizardSessionId)
      } else {
        throw new Error(result.error || '创建向导会话失败')
      }
    } catch (error) {
      console.error('创建向导会话失败:', error)
      app.addNotification({
        type: 'error',
        title: '会话创建失败',
        message: '无法创建向导会话，请重试'
      })
    }
  }

  /**
   * 开始生成项目
   */
  async startGeneration() {
    if (this.generationInProgress) return

    this.generationInProgress = true
    this.currentStep = 4
    this.updateStepUI()

    console.log('开始生成项目')

    // 显示生成界面
    const generationContainer = document.getElementById('generationContainer')
    const generationResult = document.getElementById('generationResult')
    const generationLog = document.getElementById('generationLog')

    if (generationContainer) {
      generationContainer.style.display = 'block'
    }

    if (generationResult) {
      generationResult.style.display = 'none'
    }

    if (generationLog) {
      generationLog.innerHTML = `
        <div class="log-entry">
          <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
          <span class="log-message">开始创建项目...</span>
        </div>
      `
    }

    // 更新进度
    this.updateProgress(0, '正在初始化...')

    try {
      // 继续向导会话（步骤3）
      if (this.wizardSessionId) {
        const continueResponse = await fetch('/api/project-wizard/continue', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId: this.wizardSessionId,
            step: 2, // 配置步骤
            data: this.wizardData.config
          })
        })

        const continueResult = await continueResponse.json()

        if (!continueResult.success) {
          throw new Error(continueResult.error || '配置验证失败')
        }

        this.addLog('配置验证通过')
        this.updateProgress(25, '验证项目配置...')
      }

      // 生成项目
      const generateResponse = await fetch('/api/project-wizard/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: this.wizardSessionId
        })
      })

      const generateResult = await generateResponse.json()

      if (generateResult.success) {
        this.addLog('项目生成成功')
        this.updateProgress(100, '项目创建完成')

        // 显示成功结果
        this.showSuccessResult(generateResult.data)
      } else {
        throw new Error(generateResult.error || '项目生成失败')
      }

    } catch (error) {
      console.error('项目生成失败:', error)
      this.addLog(`错误: ${error.message}`)
      this.showErrorResult(error.message)
    } finally {
      this.generationInProgress = false
      this.updateButtonStates()
    }
  }

  /**
   * 取消生成
   */
  cancelGeneration() {
    if (!this.generationInProgress) return

    // 这里应该发送取消请求到API
    // 暂时只是更新状态
    this.generationInProgress = false
    this.addLog('生成已取消')
    this.updateProgress(0, '已取消')

    // 显示取消状态
    const errorResult = document.getElementById('errorResult')
    const errorMessage = document.getElementById('errorMessage')

    if (errorResult && errorMessage) {
      errorMessage.textContent = '项目生成已取消'
      errorResult.style.display = 'block'
    }

    this.updateButtonStates()
  }

  /**
   * 更新进度
   */
  updateProgress(percent, message) {
    const progressBar = document.getElementById('generationProgress')
    const progressText = document.getElementById('progressText')
    const progressPercent = document.getElementById('progressPercent')

    if (progressBar) {
      progressBar.style.width = percent + '%'
    }

    if (progressText) {
      progressText.textContent = message
    }

    if (progressPercent) {
      progressPercent.textContent = percent + '%'
    }
  }

  /**
   * 添加日志
   */
  addLog(message) {
    const generationLog = document.getElementById('generationLog')
    if (!generationLog) return

    const logEntry = document.createElement('div')
    logEntry.className = 'log-entry'
    logEntry.innerHTML = `
      <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
      <span class="log-message">${message}</span>
    `

    generationLog.appendChild(logEntry)
    generationLog.scrollTop = generationLog.scrollHeight
  }

  /**
   * 显示成功结果
   */
  showSuccessResult(data) {
    const generationResult = document.getElementById('generationResult')
    const resultMessage = document.getElementById('resultMessage')

    if (generationResult && resultMessage) {
      generationResult.style.display = 'block'
      resultMessage.textContent = data.message || '项目已成功创建并准备就绪。'

      // 设置结果卡片为成功状态
      const resultCard = generationResult.querySelector('.result-card')
      if (resultCard) {
        resultCard.className = 'result-card success'
      }
    }

    // 保存项目信息
    if (data.project) {
      this.createdProject = data.project
    }

    // 更新按钮状态
    this.updateButtonStates()
  }

  /**
   * 显示错误结果
   */
  showErrorResult(errorMessage) {
    const generationResult = document.getElementById('generationResult')
    const errorResult = document.getElementById('errorResult')
    const errorMsgElement = document.getElementById('errorMessage')

    if (generationResult && errorResult && errorMsgElement) {
      generationResult.style.display = 'block'
      errorResult.style.display = 'block'
      errorMsgElement.textContent = errorMessage

      // 隐藏成功结果
      const successResult = generationResult.querySelector('.result-card:not(.error)')
      if (successResult) {
        successResult.style.display = 'none'
      }
    }

    // 更新按钮状态
    this.updateButtonStates()
  }

  /**
   * 重置向导
   */
  resetWizard() {
    this.currentStep = 1
    this.selectedTemplate = null
    this.wizardSessionId = null
    this.wizardData = {
      template: null,
      config: {
        name: '',
        description: '',
        version: '1.0.0',
        license: 'MIT',
        author: '',
        repository: '',
        initGit: true,
        gitName: '',
        gitEmail: ''
      }
    }
    this.createdProject = null

    // 重置UI
    this.updateStepUI()
    this.renderTemplates()

    // 重置表单
    document.getElementById('projectName').value = ''
    document.getElementById('projectDescription').value = ''
    document.getElementById('projectVersion').value = '1.0.0'
    document.getElementById('projectLicense').value = 'MIT'
    document.getElementById('projectAuthor').value = ''
    document.getElementById('projectRepository').value = ''
    document.getElementById('initGit').checked = true
    document.getElementById('gitName').value = ''
    document.getElementById('gitEmail').value = ''

    // 清除错误信息
    const nameError = document.getElementById('nameError')
    if (nameError) {
      nameError.textContent = ''
    }

    // 清除生成结果
    const generationResult = document.getElementById('generationResult')
    if (generationResult) {
      generationResult.style.display = 'none'
    }

    // 清除日志
    const generationLog = document.getElementById('generationLog')
    if (generationLog) {
      generationLog.innerHTML = `
        <div class="log-entry">
          <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
          <span class="log-message">开始创建项目...</span>
        </div>
      `
    }

    // 清除进度
    this.updateProgress(0, '正在初始化...')

    console.log('向导已重置')
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 下一步按钮
    document.getElementById('nextStep1')?.addEventListener('click', this.nextStep)
    document.getElementById('nextStep2')?.addEventListener('click', this.nextStep)
    document.getElementById('nextStep3')?.addEventListener('click', this.nextStep)

    // 上一步按钮
    document.getElementById('prevStep2')?.addEventListener('click', this.prevStep)
    document.getElementById('prevStep3')?.addEventListener('click', this.prevStep)
    document.getElementById('prevStep4')?.addEventListener('click', this.prevStep)

    // 取消生成按钮
    document.getElementById('cancelGeneration')?.addEventListener('click', this.cancelGeneration)

    // 表单输入监听
    const formInputs = [
      'projectName',
      'projectDescription',
      'projectVersion',
      'projectLicense',
      'projectAuthor',
      'projectRepository',
      'initGit',
      'gitName',
      'gitEmail'
    ]

    formInputs.forEach(id => {
      const element = document.getElementById(id)
      if (element) {
        element.addEventListener('input', debounce(() => {
          this.updateConfig()
          this.validateStep(2)
        }, 300))

        element.addEventListener('change', () => {
          this.updateConfig()
          this.validateStep(2)
        })
      }
    })

    // Git配置切换
    const initGitCheckbox = document.getElementById('initGit')
    const gitConfigFields = document.getElementById('gitConfigFields')

    if (initGitCheckbox && gitConfigFields) {
      initGitCheckbox.addEventListener('change', () => {
        gitConfigFields.style.display = initGitCheckbox.checked ? 'grid' : 'none'
        this.updateConfig()
      })

      // 初始状态
      gitConfigFields.style.display = initGitCheckbox.checked ? 'grid' : 'none'
    }

    // 结果按钮
    document.getElementById('openProjectBtn')?.addEventListener('click', () => {
      if (this.createdProject) {
        app.addNotification({
          type: 'info',
          title: '打开项目',
          message: `准备打开项目: ${this.createdProject.name}`
        })
        // 这里应该实现打开项目的逻辑
      }
    })

    document.getElementById('createAnotherBtn')?.addEventListener('click', () => {
      this.resetWizard()
    })

    document.getElementById('retryBtn')?.addEventListener('click', () => {
      this.startGeneration()
    })

    document.getElementById('backToConfigBtn')?.addEventListener('click', () => {
      this.currentStep = 2
      this.updateStepUI()
    })
  }

  /**
   * 保存状态到localStorage
   */
  saveState() {
    try {
      const state = {
        currentStep: this.currentStep,
        selectedTemplate: this.selectedTemplate,
        wizardData: this.wizardData,
        wizardSessionId: this.wizardSessionId
      }
      localStorage.setItem('projectWizardState', JSON.stringify(state))
    } catch (error) {
      console.error('保存向导状态失败:', error)
    }
  }

  /**
   * 从localStorage恢复状态
   */
  restoreState() {
    try {
      const savedState = localStorage.getItem('projectWizardState')
      if (savedState) {
        const state = JSON.parse(savedState)

        this.currentStep = state.currentStep || 1
        this.selectedTemplate = state.selectedTemplate || null
        this.wizardData = state.wizardData || this.wizardData
        this.wizardSessionId = state.wizardSessionId || null

        // 更新UI
        this.updateStepUI()

        if (this.selectedTemplate) {
          this.renderTemplates()
          this.restoreStepData(this.currentStep)
        }

        console.log('向导状态已恢复')
      }
    } catch (error) {
      console.error('恢复向导状态失败:', error)
      localStorage.removeItem('projectWizardState')
    }
  }

  /**
   * 视图激活时调用
   */
  onViewActivated() {
    console.log('项目向导视图已激活')

    // 如果向导已完成，显示结果
    if (this.createdProject) {
      this.currentStep = 4
      this.updateStepUI()
      this.showSuccessResult({ project: this.createdProject })
    }
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
 * 创建并初始化向导实例
 */
const projectWizard = new ProjectWizard()

/**
 * 导出
 */
window.projectWizard = projectWizard

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  // 延迟初始化，等待DOM完全加载
  setTimeout(() => {
    if (document.querySelector('[data-view="wizard"]')) {
      projectWizard.init()
    }
  }, 100)
})