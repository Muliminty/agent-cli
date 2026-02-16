/**
 * 问答系统API路由
 * 设计思路：提供AI驱动的问答功能，支持会话管理、消息处理、文件分析
 *
 * 功能特点：
 * 1. 会话管理 - 创建、获取、删除聊天会话
 * 2. 消息处理 - 发送和接收AI回复
 * 3. 文件分析 - 上传和分析项目文件
 * 4. 历史记录 - 保存和检索聊天历史
 * 5. 实时通信 - 通过WebSocket推送消息
 *
 * 踩坑提醒：
 * 1. AI集成要处理超时和错误重试
 * 2. 文件上传要限制大小和类型
 * 3. 会话数据要定期清理，避免内存泄漏
 * 4. 消息处理要支持流式响应
 */

import { Router } from 'express'
import { createLogger } from '../../utils/logger.js'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { loadConfig } from '../../config/loader.js'
import type { Config } from '../../types/config.js'
import { createAIService, getAIService } from '../services/ai-service.js'
import type { AIMessage as AIServiceMessage } from '../../types/ai.js'

// AI服务实例（懒加载）
let aiService: ReturnType<typeof createAIService> | null = null

async function getAIServiceInstance(): Promise<ReturnType<typeof createAIService>> {
  if (!aiService) {
    try {
      const config = await loadConfig()
      aiService = createAIService(config.agent.ai)
      logger.info('AI服务已初始化')
    } catch (error) {
      logger.error('初始化AI服务失败:', error)
      throw new Error('AI服务初始化失败')
    }
  }
  return aiService
}

const logger = createLogger('api:chat')
const router = Router()

/**
 * 聊天消息定义
 */
interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  files?: Array<{
    name: string
    content: string
    language: string
    size: number
  }>
  timestamp: Date
  metadata?: Record<string, any>
}

/**
 * 聊天会话定义
 */
interface ChatSession {
  id: string
  projectId?: string
  projectPath?: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
  metadata?: {
    model?: string
    provider?: string
    temperature?: number
    contextWindow?: number
  }
}

/**
 * 发送消息请求
 */
interface SendMessageRequest {
  sessionId?: string
  projectId?: string
  projectPath?: string
  message: string
  files?: Array<{
    name: string
    content: string
    language: string
  }>
  stream?: boolean
}

/**
 * 发送消息响应
 */
interface SendMessageResponse {
  success: boolean
  session?: ChatSession
  message?: ChatMessage
  error?: string
  timestamp: number
}

/**
 * 获取会话列表响应
 */
interface GetSessionsResponse {
  success: boolean
  data: {
    sessions: ChatSession[]
    total: number
  }
  timestamp: number
}

// 内存中的会话存储（生产环境应该使用数据库）
const chatSessions = new Map<string, ChatSession>()

/**
 * 获取会话列表
 * GET /api/chat/sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const { projectId, limit = 50, offset = 0 } = req.query

    let sessions = Array.from(chatSessions.values())

    // 按项目ID过滤
    if (projectId && typeof projectId === 'string') {
      sessions = sessions.filter(session => session.projectId === projectId)
    }

    // 按更新时间排序（最新的在前）
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

    // 分页
    const paginatedSessions = sessions.slice(
      parseInt(offset as string),
      parseInt(offset as string) + parseInt(limit as string)
    )

    const response: GetSessionsResponse = {
      success: true,
      data: {
        sessions: paginatedSessions,
        total: sessions.length
      },
      timestamp: Date.now()
    }

    res.json(response)

  } catch (error) {
    logger.error('获取会话列表失败', { error })
    res.status(500).json({
      success: false,
      error: '获取会话列表失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 获取会话详情
 * GET /api/chat/sessions/:id
 */
router.get('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params

    const session = chatSessions.get(id)
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在',
        timestamp: Date.now()
      })
    }

    res.json({
      success: true,
      data: session,
      timestamp: Date.now()
    })

  } catch (error) {
    logger.error('获取会话详情失败', { error })
    res.status(500).json({
      success: false,
      error: '获取会话详情失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 创建新会话
 * POST /api/chat/sessions
 */
router.post('/sessions', async (req, res) => {
  try {
    const { projectId, projectPath, title = '新会话' } = req.body

    // 如果提供了项目路径，验证项目存在
    let config: Config | null = null
    if (projectPath && typeof projectPath === 'string') {
      try {
        config = await loadConfig(undefined, projectPath)
      } catch (error) {
        logger.warn('加载项目配置失败', { projectPath, error })
      }
    }

    const sessionId = randomUUID()
    const now = new Date()

    const session: ChatSession = {
      id: sessionId,
      projectId,
      projectPath,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
      metadata: config ? {
        model: config.agent.model,
        provider: config.agent.ai.defaultProvider,
        temperature: config.agent.temperature,
        contextWindow: config.agent.contextMonitoring.maxTokens
      } : undefined
    }

    chatSessions.set(sessionId, session)

    res.json({
      success: true,
      data: session,
      message: '会话已创建',
      timestamp: Date.now()
    })

  } catch (error) {
    logger.error('创建会话失败', { error })
    res.status(500).json({
      success: false,
      error: '创建会话失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 发送消息
 * POST /api/chat/messages
 */
router.post('/messages', async (req, res) => {
  const startTime = Date.now()
  const requestId = randomUUID()

  try {
    const { sessionId, projectId, projectPath, message, files = [], stream = false }: SendMessageRequest = req.body

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '消息内容不能为空',
        timestamp: Date.now()
      })
    }

    let session: ChatSession | undefined

    // 如果提供了sessionId，使用现有会话
    if (sessionId) {
      session = chatSessions.get(sessionId)
      if (!session) {
        return res.status(404).json({
          success: false,
          error: '会话不存在',
          timestamp: Date.now()
        })
      }
    } else {
      // 创建新会话
      const sessionTitle = message.length > 50 ? message.substring(0, 47) + '...' : message
      const newSessionId = randomUUID()
      const now = new Date()

      // 加载项目配置（如果提供了项目路径）
      let config: Config | null = null
      if (projectPath && typeof projectPath === 'string') {
        try {
          config = await loadConfig(undefined, projectPath)
        } catch (error) {
          logger.warn('加载项目配置失败', { projectPath, error })
        }
      }

      session = {
        id: newSessionId,
        projectId,
        projectPath,
        title: sessionTitle,
        messages: [],
        createdAt: now,
        updatedAt: now,
        metadata: config ? {
          model: config.agent.model,
          provider: config.agent.ai.defaultProvider,
          temperature: config.agent.temperature,
          contextWindow: config.agent.contextMonitoring.maxTokens
        } : undefined
      }

      chatSessions.set(newSessionId, session)
    }

    // 创建用户消息
    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: 'user',
      content: message,
      files: files.map(file => ({
        ...file,
        size: file.content.length
      })),
      timestamp: new Date()
    }

    // 添加到会话
    session.messages.push(userMessage)
    session.updatedAt = new Date()

    logger.info('处理用户消息', {
      requestId,
      sessionId: session.id,
      messageLength: message.length,
      fileCount: files.length
    })

    // 处理流式响应
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      // 发送初始响应
      res.write(`data: ${JSON.stringify({
        type: 'session',
        data: session
      })}\n\n`)

      // 模拟AI响应（实际应该集成AI服务）
      const aiResponse = await generateAIResponse(session, userMessage, stream)

      // 发送流式响应
      for (const chunk of aiResponse) {
        res.write(`data: ${JSON.stringify({
          type: 'chunk',
          data: chunk
        })}\n\n`)
      }

      // 发送完成消息
      const assistantMessage: ChatMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: aiResponse.join(''),
        timestamp: new Date()
      }

      session.messages.push(assistantMessage)
      session.updatedAt = new Date()

      res.write(`data: ${JSON.stringify({
        type: 'complete',
        data: assistantMessage
      })}\n\n`)

      res.end()

    } else {
      // 非流式响应
      const aiResponse = await generateAIResponse(session, userMessage, false)
      const responseContent = Array.isArray(aiResponse) ? aiResponse.join('') : aiResponse

      const assistantMessage: ChatMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: responseContent,
        timestamp: new Date()
      }

      session.messages.push(assistantMessage)
      session.updatedAt = new Date()

      const duration = Date.now() - startTime

      const response: SendMessageResponse = {
        success: true,
        session,
        message: assistantMessage,
        timestamp: Date.now()
      }

      logger.info('AI响应完成', {
        requestId,
        sessionId: session.id,
        responseLength: responseContent.length,
        duration
      })

      res.json(response)
    }

  } catch (error) {
    logger.error('发送消息失败', { requestId, error })

    res.status(500).json({
      success: false,
      error: '发送消息失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 删除会话
 * DELETE /api/chat/sessions/:id
 */
router.delete('/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params

    const deleted = chatSessions.delete(id)

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: '会话不存在',
        timestamp: Date.now()
      })
    }

    res.json({
      success: true,
      message: '会话已删除',
      timestamp: Date.now()
    })

  } catch (error) {
    logger.error('删除会话失败', { error })
    res.status(500).json({
      success: false,
      error: '删除会话失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 清除过期会话
 * POST /api/chat/cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { maxAgeHours = 24 } = req.body
    const maxAgeMs = parseInt(maxAgeHours as string) * 60 * 60 * 1000
    const now = Date.now()

    let deletedCount = 0
    const sessionsToDelete: string[] = []

    // 找出过期会话
    for (const [sessionId, session] of chatSessions.entries()) {
      const sessionAge = now - session.updatedAt.getTime()
      if (sessionAge > maxAgeMs) {
        sessionsToDelete.push(sessionId)
      }
    }

    // 删除过期会话
    for (const sessionId of sessionsToDelete) {
      chatSessions.delete(sessionId)
      deletedCount++
    }

    res.json({
      success: true,
      data: {
        deletedCount,
        remainingCount: chatSessions.size,
        message: `已清理 ${deletedCount} 个过期会话`
      },
      timestamp: Date.now()
    })

  } catch (error) {
    logger.error('清理会话失败', { error })
    res.status(500).json({
      success: false,
      error: '清理会话失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 分析项目文件
 * POST /api/chat/analyze-files
 */
router.post('/analyze-files', async (req, res) => {
  try {
    const { projectPath, filePaths = [], maxFiles = 10 } = req.body

    if (!projectPath || typeof projectPath !== 'string') {
      return res.status(400).json({
        success: false,
        error: '项目路径不能为空',
        timestamp: Date.now()
      })
    }

    // 验证项目路径存在
    if (!existsSync(projectPath)) {
      return res.status(404).json({
        success: false,
        error: '项目路径不存在',
        timestamp: Date.now()
      })
    }

    // 如果没有指定文件路径，扫描项目目录
    let filesToAnalyze = filePaths
    if (filesToAnalyze.length === 0) {
      filesToAnalyze = await scanProjectFiles(projectPath, maxFiles)
    }

    // 限制文件数量
    filesToAnalyze = filesToAnalyze.slice(0, maxFiles)

    // 读取和分析文件
    const analyzedFiles = []
    for (const filePath of filesToAnalyze) {
      try {
        const fullPath = join(projectPath, filePath)
        if (existsSync(fullPath)) {
          const content = readFileSync(fullPath, 'utf-8')
          const language = detectLanguage(filePath)
          const size = content.length

          analyzedFiles.push({
            path: filePath,
            name: filePath.split('/').pop() || filePath,
            content: content.substring(0, 10000), // 限制内容大小
            language,
            size,
            lines: content.split('\n').length
          })
        }
      } catch (error) {
        logger.warn('读取文件失败', { filePath, error })
      }
    }

    res.json({
      success: true,
      data: {
        projectPath,
        files: analyzedFiles,
        total: analyzedFiles.length,
        message: `已分析 ${analyzedFiles.length} 个文件`
      },
      timestamp: Date.now()
    })

  } catch (error) {
    logger.error('分析文件失败', { error })
    res.status(500).json({
      success: false,
      error: '分析文件失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 生成AI响应
 */
async function generateAIResponse(
  session: ChatSession,
  userMessage: ChatMessage,
  stream: boolean
): Promise<string | string[]> {
  try {
    const aiService = await getAIServiceInstance()
    const context = buildContext(session, userMessage)

    // 构建消息历史（包括系统提示）
    const messages: AIServiceMessage[] = [
      {
        role: 'system',
        content: buildPrompt(context)
      },
      // 添加最近的对话历史（最近的5条消息，排除当前用户消息）
      ...session.messages.slice(-5).map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        files: msg.files
      })),
      // 添加当前用户消息
      {
        role: 'user',
        content: userMessage.content,
        files: userMessage.files
      }
    ]

    // 获取模型和提供商配置（从会话元数据或默认配置）
    const model = session.metadata?.model as any || undefined
    const provider = session.metadata?.provider as any || undefined

    if (stream) {
      // 流式响应
      const chunks: string[] = []

      try {
        for await (const chunk of aiService.streamMessage({
          messages,
          model,
          provider,
          temperature: session.metadata?.temperature,
          maxTokens: session.metadata?.contextWindow,
          stream: true,
          projectId: session.projectId,
          sessionId: session.id
        })) {
          if (chunk.type === 'text') {
            chunks.push(chunk.delta || chunk.content)
          }
        }

        return chunks

      } catch (error: any) {
        logger.error('AI流式响应失败:', error)
        // 返回错误消息作为chunk
        return [`AI服务错误: ${error.message}`]
      }

    } else {
      // 非流式响应
      try {
        const response = await aiService.sendMessage({
          messages,
          model,
          provider,
          temperature: session.metadata?.temperature,
          maxTokens: session.metadata?.contextWindow,
          stream: false,
          projectId: session.projectId,
          sessionId: session.id
        })

        return response.content

      } catch (error: any) {
        logger.error('AI响应失败:', error)
        return `AI服务错误: ${error.message}`
      }
    }

  } catch (error: any) {
    logger.error('AI服务初始化失败，返回模拟响应:', error)

    // 降级到模拟响应（向后兼容）
    const fallbackResponse = `我已经收到你的消息：${userMessage.content}

${userMessage.files && userMessage.files.length > 0
  ? `我还分析了你上传的 ${userMessage.files.length} 个文件。`
  : ''}

基于当前会话上下文，我可以帮你：
1. 分析项目代码和架构
2. 提供技术建议和最佳实践
3. 调试代码问题
4. 生成代码片段
5. 解释技术概念

请告诉我你需要什么帮助？`

    if (stream) {
      // 将响应拆分为多个chunk
      const chunks: string[] = []
      const chunkSize = 20
      for (let i = 0; i < fallbackResponse.length; i += chunkSize) {
        chunks.push(fallbackResponse.substring(i, i + chunkSize))
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      return chunks
    } else {
      return fallbackResponse
    }
  }
}

/**
 * 构建上下文
 */
function buildContext(session: ChatSession, userMessage: ChatMessage): string {
  const contextParts: string[] = []

  // 添加项目信息
  if (session.projectPath) {
    contextParts.push(`项目路径：${session.projectPath}`)
  }

  if (session.metadata) {
    contextParts.push(`AI模型：${session.metadata.model}`)
    if (session.metadata.provider) {
      contextParts.push(`提供商：${session.metadata.provider}`)
    }
    contextParts.push(`温度：${session.metadata.temperature}`)
  }

  // 添加上下文消息（最近的5条）
  const recentMessages = session.messages.slice(-5)
  if (recentMessages.length > 0) {
    contextParts.push('最近的对话：')
    recentMessages.forEach(msg => {
      contextParts.push(`${msg.role}: ${msg.content.substring(0, 100)}...`)
    })
  }

  // 添加用户消息
  contextParts.push(`用户消息：${userMessage.content}`)

  // 添加文件信息
  if (userMessage.files && userMessage.files.length > 0) {
    contextParts.push(`上传的文件：`)
    userMessage.files.forEach(file => {
      contextParts.push(`- ${file.name} (${file.language}, ${file.size} 字符)`)
    })
  }

  return contextParts.join('\n')
}

/**
 * 构建提示词
 */
function buildPrompt(context: string): string {
  return `你是一个专业的软件开发助手，帮助用户解决编程问题、分析代码、提供技术建议。

上下文信息：
${context}

请根据以上信息提供有帮助的回复。`
}

/**
 * 扫描项目文件
 */
async function scanProjectFiles(projectPath: string, maxFiles: number): Promise<string[]> {
  const { globby } = await import('globby')

  try {
    const patterns = [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.json',
      '**/*.md',
      '**/*.yml',
      '**/*.yaml',
      '**/*.toml',
      '**/*.py',
      '**/*.java',
      '**/*.go',
      '**/*.rs',
      '**/*.cpp',
      '**/*.c',
      '**/*.h'
    ]

    const files = await globby(patterns, {
      cwd: projectPath,
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/logs/**',
        '**/*.log',
        '**/.env*'
      ],
      deep: 3 // 限制深度，避免扫描整个文件系统
    })

    // 按文件类型和大小排序，优先返回重要的文件
    return files
      .sort((a, b) => {
        // 优先配置文件
        if (a.includes('package.json') || a.includes('tsconfig.json')) return -1
        if (b.includes('package.json') || b.includes('tsconfig.json')) return 1

        // 优先源代码文件
        const aIsSource = /\.(ts|tsx|js|jsx)$/.test(a)
        const bIsSource = /\.(ts|tsx|js|jsx)$/.test(b)
        if (aIsSource && !bIsSource) return -1
        if (!aIsSource && bIsSource) return 1

        return 0
      })
      .slice(0, maxFiles)

  } catch (error) {
    logger.error('扫描项目文件失败', { projectPath, error })
    return []
  }
}

/**
 * 检测文件语言
 */
function detectLanguage(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase() || ''

  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'json': 'json',
    'md': 'markdown',
    'yml': 'yaml',
    'yaml': 'yaml',
    'toml': 'toml',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'cpp': 'cpp',
    'c': 'c',
    'h': 'c',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'less': 'less',
    'sql': 'sql',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash'
  }

  return languageMap[extension] || 'text'
}

export default router