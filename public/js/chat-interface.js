/**
 * 问答界面逻辑
 * 设计思路：提供AI驱动的对话界面，支持消息发送、文件上传、会话管理
 *
 * 功能特点：
 * 1. 会话管理 - 创建、切换、删除聊天会话
 * 2. 消息处理 - 发送和接收消息，支持流式响应
 * 3. 文件上传 - 支持拖放和选择文件上传
 * 4. 代码高亮 - 自动高亮代码块
 * 5. 历史记录 - 保存和加载聊天历史
 *
 * 踩坑提醒：
 * 1. 消息发送要处理网络错误和重试
 * 2. 文件上传要限制大小和类型
 * 3. 流式响应要正确处理chunk
 * 4. 会话数据要定期清理，避免内存泄漏
 */

class ChatInterface {
  constructor() {
    this.currentSessionId = null
    this.sessions = []
    this.currentProjectId = null
    this.uploadedFiles = []
    this.isStreaming = false
    this.abortController = null

    // 绑定方法
    this.init = this.init.bind(this)
    this.loadSessions = this.loadSessions.bind(this)
    this.createNewSession = this.createNewSession.bind(this)
    this.switchSession = this.switchSession.bind(this)
    this.deleteSession = this.deleteSession.bind(this)
    this.sendMessage = this.sendMessage.bind(this)
    this.handleFileUpload = this.handleFileUpload.bind(this)
    this.clearFiles = this.clearFiles.bind(this)
    this.renderMessage = this.renderMessage.bind(this)
    this.scrollToBottom = this.scrollToBottom.bind(this)
    this.exportChat = this.exportChat.bind(this)
    this.clearChat = this.clearChat.bind(this)
  }

  /**
   * 初始化聊天界面
   */
  async init() {
    console.log('初始化聊天界面')

    // 加载会话
    await this.loadSessions()

    // 设置事件监听器
    this.setupEventListeners()

    // 设置拖放文件上传
    this.setupFileDrop()

    // 监听应用事件
    app.on('viewLoaded', (view) => {
      if (view === 'chat') {
        this.onViewActivated()
      }
    })

    // 监听聊天响应
    app.on('chatResponseReceived', (data) => {
      this.handleChatResponse(data)
    })

    console.log('聊天界面初始化完成')
  }

  /**
   * 加载会话列表
   */
  async loadSessions() {
    try {
      const response = await fetch('/api/chat/sessions?limit=50')
      const result = await response.json()

      if (result.success) {
        this.sessions = result.data.sessions
        this.renderSessionList()

        // 如果没有当前会话，创建新会话
        if (!this.currentSessionId && this.sessions.length > 0) {
          this.switchSession(this.sessions[0].id)
        } else if (this.sessions.length === 0) {
          await this.createNewSession()
        }
      } else {
        throw new Error(result.error || '加载会话失败')
      }
    } catch (error) {
      console.error('加载会话失败:', error)
      app.addNotification({
        type: 'error',
        title: '加载失败',
        message: '无法加载聊天会话'
      })
    }
  }

  /**
   * 渲染会话列表
   */
  renderSessionList() {
    const sessionList = document.getElementById('sessionList')
    if (!sessionList) return

    if (this.sessions.length === 0) {
      sessionList.innerHTML = `
        <div class="session-empty">
          <i class="fas fa-comments"></i>
          <p>还没有会话</p>
          <p class="font-sm text-tertiary">点击"新对话"开始聊天</p>
        </div>
      `
      return
    }

    sessionList.innerHTML = ''

    this.sessions.forEach(session => {
      const sessionItem = document.createElement('div')
      sessionItem.className = `session-item ${session.id === this.currentSessionId ? 'active' : ''}`
      sessionItem.dataset.sessionId = session.id

      // 获取最后一条消息作为预览
      const lastMessage = session.messages[session.messages.length - 1]
      const preview = lastMessage ? this.truncateText(lastMessage.content, 50) : '新对话'

      sessionItem.innerHTML = `
        <div class="session-title">${this.escapeHtml(session.title)}</div>
        <div class="session-preview">${this.escapeHtml(preview)}</div>
        <div class="session-meta">
          <span>${this.formatTime(session.updatedAt)}</span>
          <span>${session.messages.length} 条消息</span>
        </div>
      `

      sessionItem.addEventListener('click', () => this.switchSession(session.id))
      sessionList.appendChild(sessionItem)
    })
  }

  /**
   * 创建新会话
   */
  async createNewSession(title = '新对话') {
    try {
      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          projectId: this.currentProjectId
        })
      })

      const result = await response.json()

      if (result.success) {
        const newSession = result.data
        this.sessions.unshift(newSession)
        this.currentSessionId = newSession.id
        this.renderSessionList()
        this.loadSessionMessages(newSession.id)

        app.addNotification({
          type: 'success',
          title: '会话已创建',
          message: '新对话已开始',
          duration: 3000
        })

        return newSession
      } else {
        throw new Error(result.error || '创建会话失败')
      }
    } catch (error) {
      console.error('创建会话失败:', error)
      app.addNotification({
        type: 'error',
        title: '创建失败',
        message: '无法创建新会话'
      })
      return null
    }
  }

  /**
   * 切换会话
   */
  async switchSession(sessionId) {
    if (this.currentSessionId === sessionId) return

    this.currentSessionId = sessionId
    this.renderSessionList()
    await this.loadSessionMessages(sessionId)

    // 更新聊天标题
    const session = this.sessions.find(s => s.id === sessionId)
    if (session) {
      this.updateChatTitle(session.title, session.projectId)
    }
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId) {
    if (!confirm('确定要删除这个会话吗？此操作不可撤销。')) {
      return
    }

    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (result.success) {
        // 从列表中移除
        this.sessions = this.sessions.filter(s => s.id !== sessionId)

        // 如果删除的是当前会话，切换到第一个会话或创建新会话
        if (sessionId === this.currentSessionId) {
          if (this.sessions.length > 0) {
            await this.switchSession(this.sessions[0].id)
          } else {
            await this.createNewSession()
          }
        }

        this.renderSessionList()

        app.addNotification({
          type: 'success',
          title: '已删除',
          message: '会话已删除',
          duration: 3000
        })
      } else {
        throw new Error(result.error || '删除会话失败')
      }
    } catch (error) {
      console.error('删除会话失败:', error)
      app.addNotification({
        type: 'error',
        title: '删除失败',
        message: '无法删除会话'
      })
    }
  }

  /**
   * 加载会话消息
   */
  async loadSessionMessages(sessionId) {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`)
      const result = await response.json()

      if (result.success) {
        const session = result.data
        this.renderMessages(session.messages)
      } else {
        throw new Error(result.error || '加载消息失败')
      }
    } catch (error) {
      console.error('加载消息失败:', error)
      app.addNotification({
        type: 'error',
        title: '加载失败',
        message: '无法加载聊天消息'
      })
    }
  }

  /**
   * 渲染消息
   */
  renderMessages(messages) {
    const chatMessages = document.getElementById('chatMessages')
    if (!chatMessages) return

    // 清空消息区域（保留欢迎消息）
    const welcomeMessage = chatMessages.querySelector('.welcome-message')
    chatMessages.innerHTML = ''
    if (welcomeMessage) {
      chatMessages.appendChild(welcomeMessage)
    }

    // 渲染消息
    messages.forEach(message => {
      this.renderMessage(message)
    })

    this.scrollToBottom()
  }

  /**
   * 渲染单条消息
   */
  renderMessage(message) {
    const chatMessages = document.getElementById('chatMessages')
    if (!chatMessages) return

    const messageElement = document.createElement('div')
    messageElement.className = `message message-${message.role}`
    messageElement.dataset.messageId = message.id

    const avatar = message.role === 'user' ? '👤' : '🤖'
    const sender = message.role === 'user' ? '你' : 'AI助手'
    const time = this.formatTime(message.timestamp)

    // 构建消息内容HTML
    let contentHtml = this.formatMessageContent(message.content)

    // 添加文件附件
    if (message.files && message.files.length > 0) {
      contentHtml += this.renderFileAttachments(message.files)
    }

    messageElement.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-sender">${sender}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-bubble">
          <div class="message-text">${contentHtml}</div>
        </div>
        <div class="message-actions">
          <button class="message-action-btn" title="复制" onclick="window.chatInterface.copyMessage('${message.id}')">
            <i class="fas fa-copy"></i>
          </button>
          ${message.role === 'assistant' ? `
            <button class="message-action-btn" title="重新生成" onclick="window.chatInterface.regenerateMessage('${message.id}')">
              <i class="fas fa-redo"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `

    chatMessages.appendChild(messageElement)

    // 高亮代码块
    this.highlightCodeBlocks(messageElement)

    return messageElement
  }

  /**
   * 格式化消息内容
   */
  formatMessageContent(content) {
    if (!content) return ''

    // 转义HTML
    let formatted = this.escapeHtml(content)

    // 将换行转换为<br>
    formatted = formatted.replace(/\n/g, '<br>')

    // 将代码块标记转换为pre标签
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
      const lang = language || 'text'
      return `<pre><code class="language-${lang}">${this.escapeHtml(code)}</code></pre>`
    })

    // 将行内代码标记转换为code标签
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>')

    return formatted
  }

  /**
   * 渲染文件附件
   */
  renderFileAttachments(files) {
    if (!files || files.length === 0) return ''

    let html = '<div class="message-files">'

    files.forEach(file => {
      const fileSize = this.formatFileSize(file.size)
      const language = file.language || 'text'

      html += `
        <div class="file-attachment">
          <div class="file-icon">
            <i class="fas fa-file-code"></i>
          </div>
          <div class="file-info">
            <div class="file-name">${this.escapeHtml(file.name)}</div>
            <div class="file-size">${fileSize} • ${language}</div>
          </div>
        </div>
      `

      // 如果是代码文件，显示预览
      if (file.content && file.content.length > 0) {
        html += `
          <div class="file-preview">
            <pre><code class="language-${language}">${this.escapeHtml(file.content)}</code></pre>
          </div>
        `
      }
    })

    html += '</div>'
    return html
  }

  /**
   * 高亮代码块
   */
  highlightCodeBlocks(element) {
    if (window.hljs) {
      element.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block)
      })
    }
  }

  /**
   * 发送消息
   */
  async sendMessage() {
    const input = document.getElementById('chatInput')
    const message = input.value.trim()

    if (!message && this.uploadedFiles.length === 0) {
      app.addNotification({
        type: 'warning',
        title: '消息为空',
        message: '请输入消息或选择文件',
        duration: 3000
      })
      return
    }

    // 如果没有当前会话，创建新会话
    if (!this.currentSessionId) {
      const session = await this.createNewSession(this.truncateText(message, 30))
      if (!session) return
    }

    // 创建用户消息
    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      files: this.uploadedFiles.map(file => ({
        name: file.name,
        content: file.content,
        language: file.language,
        size: file.size
      })),
      timestamp: new Date()
    }

    // 渲染用户消息
    this.renderMessage(userMessage)

    // 清空输入和文件
    input.value = ''
    this.clearFiles()

    // 显示正在输入指示器
    this.showTypingIndicator()

    // 发送消息到API
    try {
      this.isStreaming = true
      this.abortController = new AbortController()

      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: this.currentSessionId,
          message,
          files: userMessage.files,
          stream: true
        }),
        signal: this.abortController.signal
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // 处理流式响应
      await this.handleStreamResponse(response)

    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('请求已取消')
      } else {
        console.error('发送消息失败:', error)
        this.showErrorMessage('发送消息失败，请重试')
      }
    } finally {
      this.isStreaming = false
      this.abortController = null
      this.hideTypingIndicator()
    }
  }

  /**
   * 处理流式响应
   */
  async handleStreamResponse(response) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let assistantMessage = ''
    let messageElement = null

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6)
            if (data === '[DONE]') continue

            try {
              const event = JSON.parse(data)

              switch (event.type) {
                case 'session':
                  // 更新会话信息
                  break

                case 'chunk':
                  // 添加chunk到消息
                  assistantMessage += event.data

                  if (!messageElement) {
                    // 创建消息元素
                    messageElement = this.createAssistantMessageElement()
                  }

                  // 更新消息内容
                  this.updateMessageContent(messageElement, assistantMessage)
                  break

                case 'complete':
                  // 消息完成
                  const completeMessage = event.data
                  if (messageElement) {
                    messageElement.dataset.messageId = completeMessage.id
                    this.finalizeMessage(messageElement, completeMessage)
                  }
                  break
              }
            } catch (e) {
              console.error('解析SSE数据失败:', e)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * 创建助手消息元素
   */
  createAssistantMessageElement() {
    const chatMessages = document.getElementById('chatMessages')
    if (!chatMessages) return null

    this.hideTypingIndicator()

    const messageElement = document.createElement('div')
    messageElement.className = 'message message-assistant'
    messageElement.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="message-header">
          <span class="message-sender">AI助手</span>
          <span class="message-time">${this.formatTime(new Date())}</span>
        </div>
        <div class="message-bubble">
          <div class="message-text"></div>
        </div>
      </div>
    `

    chatMessages.appendChild(messageElement)
    return messageElement
  }

  /**
   * 更新消息内容
   */
  updateMessageContent(messageElement, content) {
    const textElement = messageElement.querySelector('.message-text')
    if (textElement) {
      textElement.innerHTML = this.formatMessageContent(content)
      this.highlightCodeBlocks(messageElement)
      this.scrollToBottom()
    }
  }

  /**
   * 完成消息
   */
  finalizeMessage(messageElement, messageData) {
    // 添加操作按钮
    const messageContent = messageElement.querySelector('.message-content')
    if (messageContent) {
      const actions = document.createElement('div')
      actions.className = 'message-actions'
      actions.innerHTML = `
        <button class="message-action-btn" title="复制" onclick="window.chatInterface.copyMessage('${messageData.id}')">
          <i class="fas fa-copy"></i>
        </button>
        <button class="message-action-btn" title="重新生成" onclick="window.chatInterface.regenerateMessage('${messageData.id}')">
          <i class="fas fa-redo"></i>
        </button>
      `
      messageContent.appendChild(actions)
    }

    // 更新会话列表
    this.updateSessionPreview(messageData.content)
  }

  /**
   * 显示正在输入指示器
   */
  showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages')
    if (!chatMessages) return

    const typingIndicator = document.createElement('div')
    typingIndicator.className = 'typing-indicator'
    typingIndicator.id = 'typingIndicator'
    typingIndicator.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="typing-content">
        <div class="typing-dots">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
        <div class="typing-text">AI助手正在思考...</div>
      </div>
    `

    chatMessages.appendChild(typingIndicator)
    this.scrollToBottom()
  }

  /**
   * 隐藏正在输入指示器
   */
  hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator')
    if (typingIndicator) {
      typingIndicator.remove()
    }
  }

  /**
   * 显示错误消息
   */
  showErrorMessage(errorText) {
    const chatMessages = document.getElementById('chatMessages')
    if (!chatMessages) return

    const errorMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `抱歉，出现错误：${errorText}\n\n请重试或检查网络连接。`,
      timestamp: new Date()
    }

    this.renderMessage(errorMessage)
  }

  /**
   * 处理聊天响应
   */
  handleChatResponse(data) {
    if (data.sessionId === this.currentSessionId) {
      const message = data.message
      this.renderMessage(message)
      this.updateSessionPreview(message.content)
    }
  }

  /**
   * 更新会话预览
   */
  updateSessionPreview(content) {
    const session = this.sessions.find(s => s.id === this.currentSessionId)
    if (session) {
      session.title = this.truncateText(content, 30)
      session.updatedAt = new Date()
      this.renderSessionList()
    }
  }

  /**
   * 处理文件上传
   */
  handleFileUpload(files) {
    const maxSize = 10 * 1024 * 1024 // 10MB
    const allowedTypes = [
      'text/plain',
      'text/html',
      'text/css',
      'text/javascript',
      'application/javascript',
      'application/json',
      'application/xml',
      'text/x-python',
      'text/x-java-source',
      'text/x-c++src',
      'text/x-csrc',
      'text/x-go',
      'text/x-rust',
      'text/x-typescript',
      'text/x-php',
      'text/x-ruby',
      'text/x-swift'
    ]

    for (const file of files) {
      // 检查文件大小
      if (file.size > maxSize) {
        app.addNotification({
          type: 'error',
          title: '文件太大',
          message: `文件 "${file.name}" 超过10MB限制`,
          duration: 5000
        })
        continue
      }

      // 检查文件类型
      if (!allowedTypes.some(type => file.type.includes(type.replace('text/x-', '')) || file.type === type)) {
        // 通过扩展名检查
        const extension = file.name.split('.').pop().toLowerCase()
        const allowedExtensions = [
          'txt', 'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'json',
          'xml', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 'php', 'rb', 'swift'
        ]

        if (!allowedExtensions.includes(extension)) {
          app.addNotification({
            type: 'warning',
            title: '不支持的文件类型',
            message: `文件 "${file.name}" 可能不是代码文件`,
            duration: 5000
          })
        }
      }

      // 读取文件内容
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target.result
        const language = this.detectLanguage(file.name, file.type)

        this.uploadedFiles.push({
          name: file.name,
          content: content.substring(0, 10000), // 限制内容大小
          language,
          size: file.size,
          file: file
        })

        this.renderUploadedFiles()
      }

      reader.onerror = () => {
        app.addNotification({
          type: 'error',
          title: '读取失败',
          message: `无法读取文件 "${file.name}"`,
          duration: 5000
        })
      }

      reader.readAsText(file)
    }
  }

  /**
   * 检测文件语言
   */
  detectLanguage(filename, mimeType) {
    const extension = filename.split('.').pop().toLowerCase()

    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'h': 'c',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'rb': 'ruby',
      'swift': 'swift',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'json': 'json',
      'xml': 'xml',
      'txt': 'text'
    }

    return languageMap[extension] || 'text'
  }

  /**
   * 渲染已上传文件
   */
  renderUploadedFiles() {
    const uploadedFiles = document.getElementById('uploadedFiles')
    const filesList = document.getElementById('filesList')

    if (!uploadedFiles || !filesList) return

    if (this.uploadedFiles.length === 0) {
      uploadedFiles.style.display = 'none'
      return
    }

    uploadedFiles.style.display = 'block'
    filesList.innerHTML = ''

    this.uploadedFiles.forEach((file, index) => {
      const fileTag = document.createElement('div')
      fileTag.className = 'file-tag'
      fileTag.innerHTML = `
        <span class="file-tag-name">${this.escapeHtml(file.name)}</span>
        <button class="file-tag-remove" data-index="${index}">
          <i class="fas fa-times"></i>
        </button>
      `

      fileTag.querySelector('.file-tag-remove').addEventListener('click', (e) => {
        e.stopPropagation()
        this.removeFile(index)
      })

      filesList.appendChild(fileTag)
    })
  }

  /**
   * 移除文件
   */
  removeFile(index) {
    this.uploadedFiles.splice(index, 1)
    this.renderUploadedFiles()
  }

  /**
   * 清空文件
   */
  clearFiles() {
    this.uploadedFiles = []
    this.renderUploadedFiles()
  }

  /**
   * 复制消息
   */
  copyMessage(messageId) {
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`)
    if (!messageElement) return

    const textElement = messageElement.querySelector('.message-text')
    if (!textElement) return

    const text = textElement.textContent
    copyToClipboard(text).then(success => {
      if (success) {
        app.addNotification({
          type: 'success',
          title: '已复制',
          message: '消息内容已复制到剪贴板',
          duration: 3000
        })
      }
    })
  }

  /**
   * 重新生成消息
   */
  regenerateMessage(messageId) {
    // 这里应该实现重新生成逻辑
    app.addNotification({
      type: 'info',
      title: '功能开发中',
      message: '重新生成功能即将推出',
      duration: 3000
    })
  }

  /**
   * 导出聊天
   */
  exportChat() {
    if (!this.currentSessionId) {
      app.addNotification({
        type: 'warning',
        title: '无会话',
        message: '没有可导出的聊天会话',
        duration: 3000
      })
      return
    }

    const session = this.sessions.find(s => s.id === this.currentSessionId)
    if (!session) return

    const exportData = {
      session: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      },
      messages: session.messages
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chat-${session.title}-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    app.addNotification({
      type: 'success',
      title: '导出成功',
      message: '聊天记录已导出为JSON文件',
      duration: 3000
    })
  }

  /**
   * 清空聊天
   */
  clearChat() {
    if (!confirm('确定要清空当前聊天吗？此操作不可撤销。')) {
      return
    }

    const chatMessages = document.getElementById('chatMessages')
    if (chatMessages) {
      const welcomeMessage = chatMessages.querySelector('.welcome-message')
      chatMessages.innerHTML = ''
      if (welcomeMessage) {
        chatMessages.appendChild(welcomeMessage)
      }
    }

    app.addNotification({
      type: 'success',
      title: '已清空',
      message: '当前聊天已清空',
      duration: 3000
    })
  }

  /**
   * 更新聊天标题
   */
  updateChatTitle(title, projectId) {
    const chatTitle = document.getElementById('chatTitle')
    const chatSubtitle = document.getElementById('chatSubtitle')

    if (chatTitle) {
      const titleElement = chatTitle.querySelector('h3')
      if (titleElement) {
        titleElement.textContent = title
      }
    }

    if (chatSubtitle) {
      chatSubtitle.textContent = projectId ? '关联项目' : '开始与AI助手对话'
    }
  }

  /**
   * 滚动到底部
   */
  scrollToBottom() {
    const chatMessages = document.getElementById('chatMessages')
    if (chatMessages) {
      chatMessages.scrollTop = chatMessages.scrollHeight
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 新对话按钮
    document.getElementById('newChatBtn')?.addEventListener('click', () => {
      this.createNewSession()
    })

    // 发送消息按钮
    document.getElementById('sendMessageBtn')?.addEventListener('click', this.sendMessage)

    // 输入框回车发送
    const chatInput = document.getElementById('chatInput')
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          this.sendMessage()
        }
      })

      // 输入时自动调整高度
      chatInput.addEventListener('input', function() {
        this.style.height = 'auto'
        this.style.height = Math.min(this.scrollHeight, 150) + 'px'
      })
    }

    // 附加文件按钮
    document.getElementById('attachFileBtn')?.addEventListener('click', () => {
      document.getElementById('fileInput').click()
    })

    // 文件选择
    document.getElementById('fileInput')?.addEventListener('change', (e) => {
      this.handleFileUpload(Array.from(e.target.files))
      e.target.value = '' // 重置input
    })

    // 清空文件按钮
    document.getElementById('clearFilesBtn')?.addEventListener('click', this.clearFiles)

    // 清空聊天按钮
    document.getElementById('clearChatBtn')?.addEventListener('click', this.clearChat)

    // 导出聊天按钮
    document.getElementById('exportChatBtn')?.addEventListener('click', this.exportChat)

    // 设置按钮
    document.getElementById('settingsBtn')?.addEventListener('click', () => {
      app.addNotification({
        type: 'info',
        title: '设置',
        message: '聊天设置功能即将推出',
        duration: 3000
      })
    })

    // 模型选择
    document.getElementById('modelSelect')?.addEventListener('change', (e) => {
      app.addNotification({
        type: 'info',
        title: '模型已切换',
        message: `已切换到 ${e.target.options[e.target.selectedIndex].text}`,
        duration: 3000
      })
    })

    // 项目选择
    document.getElementById('projectSelect')?.addEventListener('change', (e) => {
      this.currentProjectId = e.target.value || null
    })
  }

  /**
   * 设置文件拖放
   */
  setupFileDrop() {
    const uploadArea = document.getElementById('fileUploadArea')
    const fileInput = document.getElementById('fileInput')

    if (!uploadArea || !fileInput) return

    // 点击上传区域触发文件选择
    uploadArea.addEventListener('click', () => {
      fileInput.click()
    })

    // 拖放事件
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault()
      uploadArea.classList.add('drag-over')
    })

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('drag-over')
    })

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault()
      uploadArea.classList.remove('drag-over')

      const files = Array.from(e.dataTransfer.files)
      this.handleFileUpload(files)
    })
  }

  /**
   * 视图激活时调用
   */
  onViewActivated() {
    console.log('聊天界面已激活')
    this.scrollToBottom()
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
   * 工具函数：截断文本
   */
  truncateText(text, maxLength) {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  /**
   * 工具函数：格式化时间
   */
  formatTime(date) {
    if (!date) return ''

    const d = new Date(date)
    const now = new Date()
    const diff = now - d

    if (diff < 60000) { // 1分钟内
      return '刚刚'
    } else if (diff < 3600000) { // 1小时内
      return Math.floor(diff / 60000) + '分钟前'
    } else if (diff < 86400000) { // 1天内
      return Math.floor(diff / 3600000) + '小时前'
    } else if (diff < 604800000) { // 1周内
      return Math.floor(diff / 86400000) + '天前'
    } else {
      return d.toLocaleDateString()
    }
  }

  /**
   * 工具函数：格式化文件大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B'

    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

/**
 * 创建并初始化聊天界面实例
 */
const chatInterface = new ChatInterface()

/**
 * 导出
 */
window.chatInterface = chatInterface

/**
 * 初始化
 */
document.addEventListener('DOMContentLoaded', () => {
  // 延迟初始化，等待DOM完全加载
  setTimeout(() => {
    if (document.querySelector('[data-view="chat"]')) {
      chatInterface.init()
    }
  }, 100)
})