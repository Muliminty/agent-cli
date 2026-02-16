/**
 * 项目管理API路由
 * 设计思路：提供项目创建、初始化和管理的API端点，支持可视化界面操作
 *
 * 功能特点：
 * 1. 项目初始化（基于CLI的init命令逻辑）
 * 2. 项目配置管理
 * 3. 项目状态查询和更新
 * 4. 实时进度反馈（通过WebSocket）
 *
 * 踩坑提醒：
 * 1. 路径处理要正确，支持跨平台
 * 2. 错误处理要详细，便于前端显示
 * 3. 异步操作要提供进度反馈
 * 4. 文件操作要确保权限和安全性
 */

import { Router } from 'express'
import { createLogger } from '../../utils/logger.js'
import { loadConfig, saveConfig } from '../../config/loader.js'
import { ConfigSchema, type Config } from '../../types/config.js'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { getProjectHealth, getProjectStats } from '../services/project-service.js'
import { loadFeatureList, saveFeatureList } from '../services/feature-service.js'
import { randomUUID } from 'crypto'
import type { FeatureList } from '../../types/feature.js'

const logger = createLogger('api:project-management')
const router = Router()

/**
 * 项目初始化请求体
 */
interface ProjectInitRequest {
  name: string
  path?: string
  description?: string
  template?: 'web-app' | 'api-service' | 'library' | 'cli-tool' | 'mobile-app' | 'desktop-app'
  techStack?: string[]
  version?: string
  author?: string
  repository?: string
  license?: string
  initGit?: boolean
  gitName?: string
  gitEmail?: string
  skipFeatures?: boolean
  interactive?: boolean
}

/**
 * 项目初始化响应
 */
interface ProjectInitResponse {
  success: boolean
  project?: {
    id: string
    name: string
    path: string
    configPath: string
    createdAt: string
    status: 'created' | 'initialized' | 'failed'
  }
  error?: string
  message?: string
  warnings?: string[]
  timestamp: number
}

/**
 * 初始化新项目
 * POST /api/project-management/init
 */
router.post('/init', async (req, res) => {
  const startTime = Date.now()
  const requestId = randomUUID()

  try {
    const request: ProjectInitRequest = req.body
    const cwd = process.cwd()

    logger.info('收到项目初始化请求', { requestId, ...request })

    // 验证请求数据
    if (!request.name || request.name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '项目名称不能为空',
        timestamp: Date.now()
      })
    }

    // 确定项目路径
    let projectPath: string
    if (request.path) {
      // 检查是否为绝对路径
      if (request.path.startsWith('/') || request.path.match(/^[A-Za-z]:/)) {
        projectPath = request.path
      } else {
        projectPath = join(cwd, request.path)
      }
    } else {
      // 使用项目名称作为目录名
      const safeName = request.name.toLowerCase().replace(/[^a-z0-9-_]/g, '-')
      projectPath = join(cwd, safeName)
    }

    logger.info('确定项目路径', { projectPath, cwd })

    // 检查目录是否已存在
    if (existsSync(projectPath)) {
      const files = mkdirSync(projectPath, { recursive: true })
      const fileList = files ? Array.isArray(files) ? files : [files] : []
      if (fileList.length > 0) {
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

    // 创建默认配置
    const defaultConfig: Config = {
      $schema: './node_modules/agent-cli/schema.json',
      project: {
        name: request.name,
        description: request.description || `由agent-cli创建的${request.name}项目`,
        type: request.template || 'web-app',
        techStack: request.techStack || getDefaultTechStack(request.template || 'web-app'),
        version: request.version || '1.0.0',
        author: request.author,
        repository: request.repository,
        license: request.license
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
    const validatedConfig = ConfigSchema.parse(defaultConfig)

    // 保存配置文件
    const configPath = join(projectPath, 'agent.config.json')
    writeFileSync(configPath, JSON.stringify(validatedConfig, null, 2), 'utf-8')
    logger.info('配置文件已创建', { configPath })

    // 创建其他必要文件
    const progressFile = join(projectPath, validatedConfig.paths.progressFile)
    writeFileSync(progressFile, '# 项目进度跟踪\n\n', 'utf-8')

    // 创建功能列表文件（如果不跳过）
    if (!request.skipFeatures) {
      const featureListFile = join(projectPath, validatedConfig.paths.featureListFile)
      const initialFeatureList: FeatureList = {
        projectName: request.name,
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
    }

    // 创建日志目录
    const logsDir = join(projectPath, validatedConfig.paths.logsDir)
    mkdirSync(logsDir, { recursive: true })

    // 创建public目录（用于Web服务器）
    const publicDir = join(projectPath, 'public')
    mkdirSync(publicDir, { recursive: true })

    // 初始化Git仓库（如果启用）
    let gitInitialized = false
    if (request.initGit !== false) {
      try {
        const { execSync } = await import('child_process')
        execSync('git init', { cwd: projectPath })

        // 配置Git用户信息
        if (request.gitName || request.gitEmail) {
          if (request.gitName) {
            execSync(`git config user.name "${request.gitName}"`, { cwd: projectPath })
          }
          if (request.gitEmail) {
            execSync(`git config user.email "${request.gitEmail}"`, { cwd: projectPath })
          }
        }

        // 初始提交
        execSync('git add .', { cwd: projectPath })
        execSync('git commit -m "Initial commit: Project initialized by agent-cli"', { cwd: projectPath })

        gitInitialized = true
        logger.info('Git仓库已初始化', { projectPath })
      } catch (gitError) {
        logger.warn('Git初始化失败，继续项目创建', { error: gitError })
      }
    }

    const duration = Date.now() - startTime

    // 返回成功响应
    const response: ProjectInitResponse = {
      success: true,
      project: {
        id: randomUUID(),
        name: request.name,
        path: projectPath,
        configPath,
        createdAt: new Date().toISOString(),
        status: 'initialized'
      },
      message: `项目 "${request.name}" 已成功创建`,
      warnings: gitInitialized ? [] : ['Git仓库初始化失败或跳过'],
      timestamp: Date.now()
    }

    logger.info('项目初始化完成', {
      requestId,
      projectName: request.name,
      projectPath,
      duration,
      gitInitialized
    })

    res.json(response)

  } catch (error) {
    logger.error('项目初始化失败', { requestId, error })

    const errorResponse: ProjectInitResponse = {
      success: false,
      error: '项目初始化失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    }

    res.status(500).json(errorResponse)
  }
})

/**
 * 获取默认技术栈
 */
function getDefaultTechStack(template: string): string[] {
  switch (template) {
    case 'web-app':
      return ['react', 'typescript', 'tailwind', 'jest']
    case 'api-service':
      return ['typescript', 'express', 'jest'] // nodejs不在枚举中，使用typescript
    case 'library':
      return ['typescript', 'jest'] // eslint和prettier不在枚举中
    case 'cli-tool':
      return ['typescript', 'jest'] // commander和chalk不在枚举中
    case 'mobile-app':
      return ['typescript', 'jest'] // react-native和expo不在枚举中
    case 'desktop-app':
      return ['react', 'typescript'] // electron不在枚举中
    default:
      return ['typescript', 'jest']
  }
}

/**
 * 列出所有项目
 * GET /api/project-management/projects
 */
router.get('/projects', async (req, res) => {
  try {
    const cwd = process.cwd()
    const { depth = 2 } = req.query

    // 在当前目录下查找包含agent.config.json的目录
    const projects = await findProjects(cwd, parseInt(depth as string))

    res.json({
      success: true,
      data: {
        currentDir: cwd,
        projects,
        total: projects.length
      },
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('获取项目列表失败', { error })
    res.status(500).json({
      success: false,
      error: '获取项目列表失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 获取项目详情
 * GET /api/project-management/projects/:id
 */
router.get('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { path } = req.query

    if (!path || typeof path !== 'string') {
      return res.status(400).json({
        success: false,
        error: '项目路径参数缺失',
        timestamp: Date.now()
      })
    }

    // 加载项目配置
    const config = await loadConfig(undefined, path)
    const stats = await getProjectStats(path)
    const health = await getProjectHealth(path)

    // 加载功能列表
    let featureList = null
    try {
      featureList = await loadFeatureList(path)
    } catch (error) {
      logger.warn('加载功能列表失败', { path, error })
    }

    res.json({
      success: true,
      data: {
        id,
        path,
        config,
        stats,
        health,
        featureList,
        info: {
          name: config.project.name,
          description: config.project.description,
          type: config.project.type,
          version: config.project.version,
          createdAt: new Date().toISOString() // 实际应该从文件系统获取
        }
      },
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('获取项目详情失败', { error })
    res.status(500).json({
      success: false,
      error: '获取项目详情失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 更新项目配置
 * PUT /api/project-management/projects/:id/config
 */
router.put('/projects/:id/config', async (req, res) => {
  try {
    const { id } = req.params
    const { path, updates } = req.body

    if (!path || typeof path !== 'string') {
      return res.status(400).json({
        success: false,
        error: '项目路径参数缺失',
        timestamp: Date.now()
      })
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: '无效的更新数据',
        timestamp: Date.now()
      })
    }

    // 加载当前配置
    const currentConfig = await loadConfig(undefined, path)

    // 深度合并
    const deepMerge = (target: any, source: any): any => {
      const result = { ...target }

      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (target[key] && typeof target[key] === 'object') {
            result[key] = deepMerge(target[key], source[key])
          } else {
            result[key] = source[key]
          }
        } else {
          result[key] = source[key]
        }
      }

      return result
    }

    const updatedConfig = deepMerge(currentConfig, updates)

    // 验证配置
    const validatedConfig = ConfigSchema.parse(updatedConfig)

    // 保存配置
    const configPath = join(path, 'agent.config.json')
    await saveConfig(validatedConfig, configPath)

    res.json({
      success: true,
      data: {
        message: '配置更新成功',
        config: validatedConfig,
        path: configPath
      },
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('更新项目配置失败', { error })
    res.status(500).json({
      success: false,
      error: '更新项目配置失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 删除项目
 * DELETE /api/project-management/projects/:id
 */
router.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { path, force = false } = req.body

    if (!path || typeof path !== 'string') {
      return res.status(400).json({
        success: false,
        error: '项目路径参数缺失',
        timestamp: Date.now()
      })
    }

    // 安全检查：确保路径在允许范围内
    if (!isSafePath(path)) {
      return res.status(403).json({
        success: false,
        error: '路径不在允许范围内',
        timestamp: Date.now()
      })
    }

    // 检查目录是否存在
    if (!existsSync(path)) {
      return res.status(404).json({
        success: false,
        error: '项目目录不存在',
        timestamp: Date.now()
      })
    }

    // TODO: 实际删除目录（这里只返回成功，实际删除需要小心）
    logger.warn('项目删除请求（未实际执行）', { id, path, force })

    res.json({
      success: true,
      data: {
        message: '项目删除请求已接收（安全模式下未实际删除）',
        id,
        path,
        deleted: false // 安全模式下不实际删除
      },
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('删除项目失败', { error })
    res.status(500).json({
      success: false,
      error: '删除项目失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 查找项目
 */
async function findProjects(rootDir: string, maxDepth: number): Promise<any[]> {
  const { globby } = await import('globby')
  const configFiles = await globby(`**/agent.config.json`, {
    cwd: rootDir,
    deep: maxDepth,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**']
  })

  const projects = []

  for (const configFile of configFiles) {
    try {
      // 配置文件完整路径
      const configFilePath = join(rootDir, configFile)
      // 项目目录是配置文件所在目录
      const projectPath = configFilePath.replace(/\/agent\.config\.json$/, '')

      // 确保我们有一个有效的目录路径
      if (projectPath === configFilePath) {
        // 替换没有生效，可能是Windows路径或其他问题
        logger.warn('无法从配置文件路径提取项目目录', { configFilePath })
        continue
      }

      const config = await loadConfig(undefined, projectPath)
      const stats = await getProjectStats(projectPath)

      projects.push({
        id: randomUUID(),
        name: config.project.name,
        path: projectPath,
        configPath: configFilePath,
        type: config.project.type,
        version: config.project.version,
        description: config.project.description,
        stats,
        createdAt: new Date().toISOString(), // 实际应该从文件系统获取
        updatedAt: new Date().toISOString()
      })
    } catch (error) {
      logger.warn('加载项目信息失败', { configFile, error })
    }
  }

  return projects
}

/**
 * 检查路径是否安全
 */
function isSafePath(path: string): boolean {
  const cwd = process.cwd()
  const resolvedPath = join(cwd, path)

  // 确保路径在cwd内
  return resolvedPath.startsWith(cwd)
}

export default router