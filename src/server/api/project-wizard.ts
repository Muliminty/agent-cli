/**
 * 项目向导API路由
 * 设计思路：提供可视化项目创建向导，支持模板选择、配置验证、项目生成
 *
 * 功能特点：
 * 1. 模板管理 - 获取可用项目模板
 * 2. 配置验证 - 验证项目配置的有效性
 * 3. 向导式创建 - 分步创建项目，支持实时预览
 * 4. 模板生成 - 从模板生成完整项目结构
 *
 * 踩坑提醒：
 * 1. 模板文件路径要正确，支持跨平台
 * 2. 配置验证要详细，提供清晰的错误信息
 * 3. 异步操作要提供进度反馈
 * 4. 文件操作要确保权限和安全性
 */

import { Router } from 'express'
import { createLogger } from '../../utils/logger.js'
import { loadConfig, saveConfig } from '../../config/loader.js'
import { ConfigSchema, type Config } from '../../types/config.js'
import { join, dirname, basename } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, copyFileSync } from 'fs'
import { randomUUID } from 'crypto'
import type { FeatureList } from '../../types/feature.js'

const logger = createLogger('api:project-wizard')
const router = Router()

/**
 * 向导步骤定义
 */
interface WizardStep {
  id: string
  title: string
  component: 'template-select' | 'config-form' | 'review' | 'generating'
  data?: Record<string, any>
  validation?: (data: any) => boolean
}

/**
 * 项目模板定义
 */
interface ProjectTemplate {
  id: string
  name: string
  description: string
  framework: string // 'react' | 'vue' | 'node' | 'nextjs' | 'express' | 'nestjs'
  category: 'web' | 'api' | 'cli' | 'mobile' | 'desktop' | 'library'
  icon: string
  tags: string[]
  files: TemplateFile[]
  configSchema: Record<string, any>
  defaultConfig: Record<string, any>
}

/**
 * 模板文件定义
 */
interface TemplateFile {
  path: string
  content: string
  type: 'file' | 'directory'
  description?: string
  required?: boolean
}

/**
 * 向导会话状态
 */
interface WizardSession {
  id: string
  currentStep: number
  steps: WizardStep[]
  data: Record<string, any>
  template?: ProjectTemplate
  createdAt: Date
  updatedAt: Date
}

/**
 * 向导创建请求
 */
interface WizardCreateRequest {
  sessionId?: string
  step: number
  data: Record<string, any>
}

/**
 * 向导创建响应
 */
interface WizardCreateResponse {
  success: boolean
  session?: WizardSession
  nextStep?: WizardStep
  validationErrors?: string[]
  error?: string
  message?: string
  timestamp: number
}

// 内存中的向导会话存储（生产环境应该使用数据库）
const wizardSessions = new Map<string, WizardSession>()

/**
 * 获取可用项目模板
 * GET /api/project-wizard/templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = await getAvailableTemplates()

    res.json({
      success: true,
      data: {
        templates,
        total: templates.length,
        categories: Array.from(new Set(templates.map(t => t.category)))
      },
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('获取模板列表失败', { error })
    res.status(500).json({
      success: false,
      error: '获取模板列表失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 获取模板详情
 * GET /api/project-wizard/templates/:id
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params
    const templates = await getAvailableTemplates()
    const template = templates.find(t => t.id === id)

    if (!template) {
      return res.status(404).json({
        success: false,
        error: '模板不存在',
        timestamp: Date.now()
      })
    }

    res.json({
      success: true,
      data: template,
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('获取模板详情失败', { error })
    res.status(500).json({
      success: false,
      error: '获取模板详情失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 开始新的向导会话
 * POST /api/project-wizard/start
 */
router.post('/start', async (req, res) => {
  try {
    const { templateId } = req.body

    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: '模板ID不能为空',
        timestamp: Date.now()
      })
    }

    // 获取模板
    const templates = await getAvailableTemplates()
    const template = templates.find(t => t.id === templateId)

    if (!template) {
      return res.status(404).json({
        success: false,
        error: '模板不存在',
        timestamp: Date.now()
      })
    }

    // 创建向导步骤
    const steps: WizardStep[] = [
      {
        id: 'template-select',
        title: '选择模板',
        component: 'template-select',
        data: { template }
      },
      {
        id: 'config-form',
        title: '项目配置',
        component: 'config-form',
        data: { schema: template.configSchema }
      },
      {
        id: 'review',
        title: '预览确认',
        component: 'review'
      },
      {
        id: 'generating',
        title: '生成项目',
        component: 'generating'
      }
    ]

    // 创建会话
    const sessionId = randomUUID()
    const session: WizardSession = {
      id: sessionId,
      currentStep: 0,
      steps,
      data: {
        template: template.id,
        config: template.defaultConfig
      },
      template,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    wizardSessions.set(sessionId, session)

    const response: WizardCreateResponse = {
      success: true,
      session,
      nextStep: steps[0],
      message: '向导会话已创建',
      timestamp: Date.now()
    }

    res.json(response)

  } catch (error) {
    logger.error('开始向导会话失败', { error })
    res.status(500).json({
      success: false,
      error: '开始向导会话失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 继续向导会话
 * POST /api/project-wizard/continue
 */
router.post('/continue', async (req, res) => {
  try {
    const { sessionId, step, data }: WizardCreateRequest = req.body

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: '会话ID不能为空',
        timestamp: Date.now()
      })
    }

    // 获取会话
    const session = wizardSessions.get(sessionId)
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在或已过期',
        timestamp: Date.now()
      })
    }

    // 验证步骤
    if (step < 0 || step >= session.steps.length) {
      return res.status(400).json({
        success: false,
        error: '无效的步骤',
        timestamp: Date.now()
      })
    }

    // 更新会话数据
    session.data = { ...session.data, ...data }
    session.currentStep = step
    session.updatedAt = new Date()

    // 验证当前步骤数据
    const validationErrors = validateStepData(session, step, data)
    if (validationErrors.length > 0) {
      const response: WizardCreateResponse = {
        success: false,
        session,
        validationErrors,
        message: '数据验证失败',
        timestamp: Date.now()
      }
      return res.json(response)
    }

    // 检查是否完成所有步骤
    let nextStep: WizardStep | undefined
    if (step < session.steps.length - 1) {
      nextStep = session.steps[step + 1]
    }

    const response: WizardCreateResponse = {
      success: true,
      session,
      nextStep,
      message: step === session.steps.length - 1 ? '向导已完成' : '步骤已保存',
      timestamp: Date.now()
    }

    res.json(response)

  } catch (error) {
    logger.error('继续向导会话失败', { error })
    res.status(500).json({
      success: false,
      error: '继续向导会话失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 生成项目
 * POST /api/project-wizard/generate
 */
router.post('/generate', async (req, res) => {
  const startTime = Date.now()
  const requestId = randomUUID()

  try {
    const { sessionId } = req.body

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: '会话ID不能为空',
        timestamp: Date.now()
      })
    }

    // 获取会话
    const session = wizardSessions.get(sessionId)
    if (!session) {
      return res.status(404).json({
        success: false,
        error: '会话不存在或已过期',
        timestamp: Date.now()
      })
    }

    // 验证会话数据
    const { template: templateId, config } = session.data
    if (!templateId || !config || !config.name) {
      return res.status(400).json({
        success: false,
        error: '项目配置不完整',
        timestamp: Date.now()
      })
    }

    // 获取模板
    const templates = await getAvailableTemplates()
    const template = templates.find(t => t.id === templateId)
    if (!template) {
      return res.status(404).json({
        success: false,
        error: '模板不存在',
        timestamp: Date.now()
      })
    }

    logger.info('开始生成项目', { requestId, templateId, config })

    // 确定项目路径
    const cwd = process.cwd()
    const safeName = config.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
    const projectPath = join(cwd, safeName)

    // 检查目录是否已存在
    if (existsSync(projectPath)) {
      const files = readdirSync(projectPath)
      if (files.length > 0) {
        return res.status(400).json({
          success: false,
          error: '项目目录已存在且不为空',
          details: `目录 "${projectPath}" 已存在且包含文件`,
          timestamp: Date.now()
        })
      }
    }

    // 创建项目目录
    logger.info('创建项目目录', { projectPath })
    mkdirSync(projectPath, { recursive: true })

    // 生成项目文件
    await generateProjectFromTemplate(template, config, projectPath)

    // 创建agent-cli配置文件
    const agentConfig: Config = {
      $schema: './node_modules/agent-cli/schema.json',
      project: {
        name: config.name,
        description: config.description || `由agent-cli创建的${config.name}项目`,
        type: template.framework,
        techStack: getDefaultTechStack(template.framework),
        version: config.version || '1.0.0',
        author: config.author,
        repository: config.repository,
        license: config.license || 'MIT'
      },
      agent: {
        model: 'claude-3-5-sonnet',
        contextMonitoring: {
          enabled: true,
          warningThreshold: 0.8,
          maxTokens: 131072,
          autoSummarize: true,
          summaryInterval: 10,
          modelSpecificLimits: {
            'claude-3-5-sonnet': 131072,
            'claude-3-opus': 131072,
            'claude-3-haiku': 131072,
            'gpt-4': 128000,
            'gpt-4-turbo': 128000,
            'gpt-3.5-turbo': 16385
          }
        },
        initializer: {
          promptTemplate: 'templates/init-prompt.md',
          maxFeatures: 200,
          featureDetailLevel: 'high',
          generateTests: true,
          generateDocs: true
        },
        coder: {
          promptTemplate: 'templates/coder-prompt.md',
          incrementalMode: true,
          maxStepsPerSession: 1,
          requireTests: true,
          autoCommit: true,
          reviewChanges: true
        },
        maxRetries: 3,
        retryDelay: 5000,
        temperature: 0.7
      },
      testing: {
        framework: 'puppeteer',
        headless: true,
        timeout: 30000,
        takeScreenshots: true,
        recordVideo: false,
        viewport: { width: 1280, height: 720 }
      },
      git: {
        autoCommit: true,
        branch: 'main',
        commitTemplate: 'feat: {description}\n\n- 实现功能: {details}\n- 分类: {category}\n- 测试状态: {testStatus}\n- 相关文件: {files}',
        commitOnTestPass: true,
        tagReleases: false
      },
      server: {
        enabled: false,
        port: 3000,
        host: 'localhost',
        basePath: '/',
        trustProxy: false,
        timeout: 30000,
        keepAliveTimeout: 5000,
        maxHeadersCount: 2000,
        websocket: {
          enabled: true,
          path: '/ws',
          pingInterval: 30000,
          maxConnections: 100,
          reconnectAttempts: 3,
          reconnectDelay: 2000
        },
        staticFiles: {
          enabled: true,
          directory: 'public',
          maxAge: 86400,
          index: true,
          fallback: 'index.html'
        },
        cors: {
          enabled: true,
          origin: '*',
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization'],
          credentials: false,
          maxAge: 86400
        },
        compression: {
          enabled: true,
          threshold: 1024,
          level: 6
        },
        security: {
          helmet: true,
          rateLimit: {
            enabled: true,
            windowMs: 900000,
            max: 100
          },
          xssFilter: true,
          noSniff: true,
          hidePoweredBy: true
        },
        logging: {
          enabled: true,
          level: 'info',
          format: 'combined',
          maxSize: 10485760
        }
      },
      paths: {
        progressFile: 'claude-progress.txt',
        featureListFile: 'feature-list.json',
        configFile: 'agent.config.json',
        logsDir: 'logs'
      },
      features: {
        enableProgressTracking: true,
        enableAutoTesting: true,
        enableGitIntegration: true,
        enableErrorRecovery: true
      }
    }

    // 验证配置
    const validatedConfig = ConfigSchema.parse(agentConfig)

    // 保存配置文件
    const configPath = join(projectPath, 'agent.config.json')
    writeFileSync(configPath, JSON.stringify(validatedConfig, null, 2), 'utf-8')
    logger.info('配置文件已创建', { configPath })

    // 创建其他必要文件
    const progressFile = join(projectPath, validatedConfig.paths.progressFile)
    writeFileSync(progressFile, '# 项目进度跟踪\n\n', 'utf-8')

    // 创建功能列表文件
    const featureListFile = join(projectPath, validatedConfig.paths.featureListFile)
    const initialFeatureList: FeatureList = {
      projectName: config.name,
      features: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      totalCount: 0,
      completedCount: 0,
      inProgressCount: 0,
      blockedCount: 0
    }
    writeFileSync(featureListFile, JSON.stringify(initialFeatureList, null, 2), 'utf-8')

    // 创建日志目录
    const logsDir = join(projectPath, validatedConfig.paths.logsDir)
    mkdirSync(logsDir, { recursive: true })

    const duration = Date.now() - startTime

    // 清理会话
    wizardSessions.delete(sessionId)

    res.json({
      success: true,
      data: {
        message: `项目 "${config.name}" 已成功创建`,
        project: {
          id: randomUUID(),
          name: config.name,
          path: projectPath,
          configPath,
          template: template.name,
          createdAt: new Date().toISOString(),
          status: 'created'
        }
      },
      timestamp: Date.now()
    })

    logger.info('项目生成完成', {
      requestId,
      projectName: config.name,
      projectPath,
      template: template.name,
      duration
    })

  } catch (error) {
    logger.error('项目生成失败', { requestId, error })

    res.status(500).json({
      success: false,
      error: '项目生成失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 验证步骤数据
 */
function validateStepData(session: WizardSession, step: number, data: any): string[] {
  const errors: string[] = []

  switch (step) {
    case 0: // 模板选择
      if (!data.template) {
        errors.push('请选择项目模板')
      }
      break

    case 1: // 配置表单
      if (!data.name || data.name.trim().length === 0) {
        errors.push('项目名称不能为空')
      }
      if (data.name && data.name.length > 50) {
        errors.push('项目名称不能超过50个字符')
      }
      break

    case 2: // 预览确认
      // 验证所有必需字段
      const requiredFields = ['name', 'template']
      for (const field of requiredFields) {
        if (!session.data[field]) {
          errors.push(`必需字段 "${field}" 未填写`)
        }
      }
      break
  }

  return errors
}

/**
 * 获取可用模板
 */
async function getAvailableTemplates(): Promise<ProjectTemplate[]> {
  // 这里应该从文件系统或数据库加载模板
  // 暂时返回硬编码的模板列表

  return [
    {
      id: 'react-web-app',
      name: 'React Web应用',
      description: '现代化的React单页应用，包含TypeScript、Tailwind CSS和Vite',
      framework: 'react',
      category: 'web',
      icon: '⚛️',
      tags: ['react', 'typescript', 'tailwind', 'vite'],
      files: [],
      configSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', title: '项目名称' },
          description: { type: 'string', title: '项目描述' },
          version: { type: 'string', title: '版本号', default: '1.0.0' },
          author: { type: 'string', title: '作者' },
          repository: { type: 'string', title: '仓库地址' },
          license: { type: 'string', title: '许可证', default: 'MIT' }
        },
        required: ['name']
      },
      defaultConfig: {
        name: 'my-react-app',
        description: '一个现代化的React应用',
        version: '1.0.0',
        license: 'MIT'
      }
    },
    {
      id: 'node-api-service',
      name: 'Node.js API服务',
      description: '基于Express的RESTful API服务，包含TypeScript和Jest测试',
      framework: 'node',
      category: 'api',
      icon: '🚀',
      tags: ['node', 'express', 'typescript', 'jest'],
      files: [],
      configSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', title: '项目名称' },
          description: { type: 'string', title: '项目描述' },
          version: { type: 'string', title: '版本号', default: '1.0.0' },
          author: { type: 'string', title: '作者' },
          repository: { type: 'string', title: '仓库地址' },
          license: { type: 'string', title: '许可证', default: 'MIT' },
          port: { type: 'number', title: '服务端口', default: 3000 }
        },
        required: ['name']
      },
      defaultConfig: {
        name: 'my-api-service',
        description: '一个Node.js API服务',
        version: '1.0.0',
        license: 'MIT',
        port: 3000
      }
    },
    {
      id: 'vue-web-app',
      name: 'Vue Web应用',
      description: '现代化的Vue单页应用，包含TypeScript、Vite和Pinia状态管理',
      framework: 'vue',
      category: 'web',
      icon: '🖖',
      tags: ['vue', 'typescript', 'vite', 'pinia'],
      files: [],
      configSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', title: '项目名称' },
          description: { type: 'string', title: '项目描述' },
          version: { type: 'string', title: '版本号', default: '1.0.0' },
          author: { type: 'string', title: '作者' },
          repository: { type: 'string', title: '仓库地址' },
          license: { type: 'string', title: '许可证', default: 'MIT' }
        },
        required: ['name']
      },
      defaultConfig: {
        name: 'my-vue-app',
        description: '一个现代化的Vue应用',
        version: '1.0.0',
        license: 'MIT'
      }
    },
    {
      id: 'nextjs-app',
      name: 'Next.js应用',
      description: '基于Next.js的全栈应用，支持服务端渲染和API路由',
      framework: 'nextjs',
      category: 'web',
      icon: '▲',
      tags: ['nextjs', 'react', 'typescript', 'tailwind'],
      files: [],
      configSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', title: '项目名称' },
          description: { type: 'string', title: '项目描述' },
          version: { type: 'string', title: '版本号', default: '1.0.0' },
          author: { type: 'string', title: '作者' },
          repository: { type: 'string', title: '仓库地址' },
          license: { type: 'string', title: '许可证', default: 'MIT' },
          appRouter: { type: 'boolean', title: '使用App Router', default: true }
        },
        required: ['name']
      },
      defaultConfig: {
        name: 'my-nextjs-app',
        description: '一个Next.js全栈应用',
        version: '1.0.0',
        license: 'MIT',
        appRouter: true
      }
    },
    {
      id: 'cli-tool',
      name: 'CLI工具',
      description: '基于Node.js的命令行工具，包含Commander.js和Chalk',
      framework: 'node',
      category: 'cli',
      icon: '💻',
      tags: ['node', 'cli', 'commander', 'chalk'],
      files: [],
      configSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', title: '工具名称' },
          description: { type: 'string', title: '工具描述' },
          version: { type: 'string', title: '版本号', default: '1.0.0' },
          author: { type: 'string', title: '作者' },
          repository: { type: 'string', title: '仓库地址' },
          license: { type: 'string', title: '许可证', default: 'MIT' },
          binName: { type: 'string', title: '命令名称', default: 'my-cli' }
        },
        required: ['name']
      },
      defaultConfig: {
        name: 'my-cli-tool',
        description: '一个命令行工具',
        version: '1.0.0',
        license: 'MIT',
        binName: 'my-cli'
      }
    }
  ]
}

/**
 * 从模板生成项目
 */
async function generateProjectFromTemplate(template: ProjectTemplate, config: any, projectPath: string): Promise<void> {
  logger.info('从模板生成项目', { template: template.name, projectPath })

  // 这里应该根据模板生成实际的文件
  // 暂时只创建基本结构

  // 创建package.json
  const packageJson = {
    name: config.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
    version: config.version || '1.0.0',
    description: config.description || `由agent-cli创建的${config.name}项目`,
    main: 'index.js',
    scripts: getTemplateScripts(template.framework),
    keywords: template.tags,
    author: config.author || '',
    license: config.license || 'MIT',
    dependencies: getTemplateDependencies(template.framework),
    devDependencies: getTemplateDevDependencies(template.framework)
  }

  writeFileSync(
    join(projectPath, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf-8'
  )

  // 创建README.md
  const readmeContent = `# ${config.name}

${config.description || `这是一个由agent-cli创建的${template.name}项目。`}

## 项目信息

- **模板**: ${template.name}
- **框架**: ${template.framework}
- **版本**: ${config.version || '1.0.0'}
- **作者**: ${config.author || '未指定'}
- **许可证**: ${config.license || 'MIT'}

## 开始使用

\`\`\`bash
# 安装依赖
npm install

# 启动开发服务器
${getStartCommand(template.framework)}
\`\`\`

## 项目结构

\`\`\`
${projectPath}/
├── package.json
├── README.md
└── ...其他文件
\`\`\`

## 使用agent-cli

这个项目已经集成了agent-cli，你可以使用以下命令：

\`\`\`bash
# 启动可视化服务器
npx agent-cli serve

# 运行测试
npx agent-cli test

# 查看项目状态
npx agent-cli status
\`\`\`
`

  writeFileSync(
    join(projectPath, 'README.md'),
    readmeContent,
    'utf-8'
  )

  // 根据模板类型创建特定文件
  switch (template.framework) {
    case 'react':
    case 'vue':
    case 'nextjs':
      // 创建public目录
      const publicDir = join(projectPath, 'public')
      mkdirSync(publicDir, { recursive: true })

      // 创建src目录
      const srcDir = join(projectPath, 'src')
      mkdirSync(srcDir, { recursive: true })
      break

    case 'node':
      // 创建src目录
      const nodeSrcDir = join(projectPath, 'src')
      mkdirSync(nodeSrcDir, { recursive: true })

      // 创建入口文件
      const entryFile = template.category === 'cli' ? 'cli.ts' : 'index.ts'
      writeFileSync(
        join(nodeSrcDir, entryFile),
        getTemplateEntryFile(template),
        'utf-8'
      )
      break
  }

  // 创建.gitignore
  const gitignoreContent = `# 依赖
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# 构建输出
dist/
build/
out/

# 环境变量
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# 日志
logs/
*.log

# 编辑器
.vscode/
.idea/
*.swp
*.swo

# 操作系统
.DS_Store
Thumbs.db

# 测试
coverage/
test-reports/

# agent-cli
claude-progress.txt
feature-list.json
agent.config.json.backup.*
`

  writeFileSync(
    join(projectPath, '.gitignore'),
    gitignoreContent,
    'utf-8'
  )
}

/**
 * 获取模板脚本
 */
function getTemplateScripts(framework: string): Record<string, string> {
  switch (framework) {
    case 'react':
    case 'vue':
      return {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
        test: 'jest',
        lint: 'eslint src --ext .ts,.tsx',
        format: 'prettier --write src'
      }
    case 'nextjs':
      return {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
        test: 'jest'
      }
    case 'node':
      return {
        start: 'node dist/index.js',
        dev: 'tsx watch src/index.ts',
        build: 'tsup src/index.ts --format cjs,esm',
        test: 'jest',
        lint: 'eslint src --ext .ts'
      }
    default:
      return {
        start: 'node index.js',
        test: 'jest'
      }
  }
}

/**
 * 获取模板依赖
 */
function getTemplateDependencies(framework: string): Record<string, string> {
  switch (framework) {
    case 'react':
      return {
        react: '^18.2.0',
        'react-dom': '^18.2.0'
      }
    case 'vue':
      return {
        vue: '^3.3.0'
      }
    case 'nextjs':
      return {
        next: '^14.0.0',
        react: '^18.2.0',
        'react-dom': '^18.2.0'
      }
    case 'node':
      return {
        express: '^4.18.0'
      }
    default:
      return {}
  }
}

/**
 * 获取模板开发依赖
 */
function getTemplateDevDependencies(framework: string): Record<string, string> {
  const commonDevDeps = {
    typescript: '^5.0.0',
    '@types/node': '^20.0.0',
    jest: '^29.0.0',
    '@types/jest': '^29.0.0',
    'ts-jest': '^29.0.0',
    eslint: '^8.0.0',
    prettier: '^3.0.0'
  }

  switch (framework) {
    case 'react':
    case 'vue':
      return {
        ...commonDevDeps,
        vite: '^4.0.0',
        '@vitejs/plugin-react': '^4.0.0',
        '@vitejs/plugin-vue': '^4.0.0',
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        '@typescript-eslint/eslint-plugin': '^6.0.0',
        '@typescript-eslint/parser': '^6.0.0',
        'eslint-plugin-react': '^7.0.0',
        'eslint-plugin-react-hooks': '^4.0.0',
        'eslint-plugin-react-refresh': '^0.4.0'
      }
    case 'nextjs':
      return {
        ...commonDevDeps,
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        'eslint-config-next': '^14.0.0'
      }
    case 'node':
      return {
        ...commonDevDeps,
        '@types/express': '^4.17.0',
        'tsup': '^7.0.0',
        'tsx': '^3.0.0',
        '@typescript-eslint/eslint-plugin': '^6.0.0',
        '@typescript-eslint/parser': '^6.0.0'
      }
    default:
      return commonDevDeps
  }
}

/**
 * 获取启动命令
 */
function getStartCommand(framework: string): string {
  switch (framework) {
    case 'react':
    case 'vue':
      return 'npm run dev'
    case 'nextjs':
      return 'npm run dev'
    case 'node':
      return 'npm run dev'
    default:
      return 'npm start'
  }
}

/**
 * 获取模板入口文件
 */
function getTemplateEntryFile(template: ProjectTemplate): string {
  if (template.category === 'cli') {
    return `#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'

const program = new Command()

program
  .name('${template.defaultConfig.binName || 'my-cli'}')
  .description('${template.description}')
  .version('${template.defaultConfig.version || '1.0.0'}')

program
  .command('hello')
  .description('Say hello')
  .action(() => {
    console.log(chalk.green('Hello from ${template.name}!'))
  })

program.parse()
`
  }

  return `import express from 'express'

const app = express()
const port = ${template.defaultConfig.port || 3000}

app.use(express.json())

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to ${template.name}',
    version: '${template.defaultConfig.version || '1.0.0'}',
    timestamp: new Date().toISOString()
  })
})

app.listen(port, () => {
  console.log(\`${template.name} server running at http://localhost:\${port}\`)
})
`
}

/**
 * 获取默认技术栈
 */
function getDefaultTechStack(framework: string): string[] {
  switch (framework) {
    case 'react':
      return ['react', 'typescript', 'tailwind', 'jest']
    case 'vue':
      return ['vue', 'typescript', 'tailwind', 'jest']
    case 'nextjs':
      return ['nextjs', 'react', 'typescript', 'tailwind', 'jest']
    case 'node':
      return ['typescript', 'express', 'jest']
    default:
      return ['typescript', 'jest']
  }
}

export default router