/**
 * 初始化智能体模块
 * 设计思路：负责项目初始化和脚手架生成，继承BaseAgent实现完整的初始化流程
 *
 * 核心功能：
 * 1. 交互式项目配置收集
 * 2. 项目目录结构生成
 * 3. 初始功能列表创建
 * 4. Git仓库初始化和配置
 * 5. 进度跟踪系统设置
 *
 * 踩坑提醒：
 * 1. 确保所有异步操作有正确的错误处理和回滚
 * 2. 文件路径处理要兼容不同操作系统
 * 3. 用户配置验证要全面，避免无效状态
 * 4. Git操作需要处理权限和网络问题
 */

import { BaseAgent, AgentResult, AgentConfig, AgentContext } from './base.js'
import { ProgressTracker } from '../progress/tracker.js'
import { GitManager } from '../git/manager.js'
import { createLogger } from '../../utils/logger.js'
import fs from 'fs-extra'
import path from 'path'
import type { Feature, FeatureList, FeatureCategory, FeaturePriority, FeatureComplexity } from '../../types/feature.js'
import type { Config } from '../../config/schema.js'
import type { ProjectState } from '../../types/project.js'

// 项目模板定义
interface ProjectTemplate {
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description: string
  /** 模板技术栈 */
  techStack: string[]
  /** 推荐功能列表 */
  suggestedFeatures: Array<{
    category: FeatureCategory
    description: string
    priority: FeaturePriority
    complexity: FeatureComplexity
    steps: string[]
    dependencies?: string[]
  }>
  /** 目录结构 */
  directoryStructure: string[]
  /** 必需的文件模板 */
  requiredFiles: Array<{
    path: string
    content: string
  }>
}

// 初始化配置选项
export interface InitializerOptions {
  /** 项目名称 */
  projectName: string
  /** 项目路径 */
  projectPath: string
  /** 项目描述 */
  description?: string
  /** 项目类型/模板 */
  template?: string
  /** 技术栈偏好 */
  techStack?: string[]
  /** 是否初始化Git仓库 */
  initGit?: boolean
  /** Git用户名 */
  gitUserName?: string
  /** Git用户邮箱 */
  gitUserEmail?: string
  /** 是否创建初始功能列表 */
  createFeatureList?: boolean
  /** 自定义功能列表 */
  customFeatures?: Array<{
    category: FeatureCategory
    description: string
    priority: FeaturePriority
    complexity: FeatureComplexity
    steps: string[]
    dependencies?: string[]
  }>
  /** 是否交互式模式 */
  interactive?: boolean
}

// 默认项目模板
const DEFAULT_TEMPLATES: Record<string, ProjectTemplate> = {
  'web-app': {
    name: 'web-app',
    description: '标准Web应用项目模板',
    techStack: ['TypeScript', 'React', 'Node.js', 'Vite'],
    suggestedFeatures: [
      {
        category: 'infrastructure',
        description: '项目基础结构搭建',
        priority: 'critical',
        complexity: 'simple',
        steps: [
          '创建项目目录结构',
          '配置TypeScript编译',
          '设置构建工具配置',
          '配置开发服务器',
          '添加基础依赖'
        ]
      },
      {
        category: 'ui',
        description: '基础UI组件库',
        priority: 'high',
        complexity: 'medium',
        steps: [
          '设计组件架构',
          '实现基础组件（Button、Input等）',
          '添加样式系统',
          '实现主题支持',
          '编写组件文档'
        ]
      },
      {
        category: 'functional',
        description: '用户认证系统',
        priority: 'high',
        complexity: 'complex',
        steps: [
          '设计认证流程',
          '实现登录/注册界面',
          '集成后端API',
          '添加会话管理',
          '实现权限控制'
        ]
      }
    ],
    directoryStructure: [
      'src/',
      'src/components/',
      'src/pages/',
      'src/services/',
      'src/utils/',
      'src/types/',
      'public/',
      'tests/',
      'docs/'
    ],
    requiredFiles: [
      {
        path: 'README.md',
        content: `# {projectName}

{description}

## 项目结构

\`\`\`
项目结构说明
\`\`\`

## 快速开始

1. 安装依赖
\`\`\`bash
npm install
\`\`\`

2. 启动开发服务器
\`\`\`bash
npm run dev
\`\`\`

3. 构建生产版本
\`\`\`bash
npm run build
\`\`\`

## 开发指南

详细开发说明...
`
      },
      {
        path: 'package.json',
        content: `{
  "name": "{projectName}",
  "version": "1.0.0",
  "description": "{description}",
  "main": "dist/index.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "jest",
    "lint": "eslint src --ext .ts,.tsx",
    "format": "prettier --write \"src/**/*.{ts,tsx}\""
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "jest": "^29.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.0.0",
    "vite": "^4.0.0",
    "@vitejs/plugin-react": "^4.0.0"
  },
  "keywords": ["react", "typescript", "vite"],
  "author": "",
  "license": "MIT",
  "type": "module"
}`
      },
      {
        path: 'tsconfig.json',
        content: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}`
      }
    ]
  }
}

/**
 * 初始化智能体类
 * 负责项目初始化和脚手架生成
 */
export class InitializerAgent extends BaseAgent {
  private options: InitializerOptions
  private progressTracker: ProgressTracker | null = null
  private gitManager: GitManager | null = null
  private projectTemplate: ProjectTemplate | null = null

  constructor(context: AgentContext, options: InitializerOptions, config: Partial<AgentConfig> = {}) {
    super(context, {
      name: 'InitializerAgent',
      description: '项目初始化智能体，负责创建项目脚手架和初始化配置',
      maxRetries: 2,
      retryDelay: 500,
      timeout: 60000,
      verbose: true,
      ...config
    })

    this.options = {
      initGit: true,
      createFeatureList: true,
      interactive: false,
      ...options
    }

    // 选择项目模板
    this.projectTemplate = this.selectTemplate()
  }

  /**
   * 智能体初始化逻辑
   */
  protected async onInitialize(): Promise<void> {
    this.logger.debug('初始化智能体开始')

    // 验证选项
    await this.validateOptions()

    // 创建进度跟踪器
    this.progressTracker = new ProgressTracker({
      projectPath: this.options.projectPath,
      autoSave: true,
      verbose: this.config.verbose
    })

    // Git管理器将在需要时创建（在项目目录存在后）

    this.logger.debug('初始化智能体完成')
  }

  /**
   * 智能体执行逻辑 - 项目初始化
   */
  protected async onExecute(options: Record<string, any>, signal: AbortSignal): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      this.recordProgress({
        action: 'feature_started',
        description: '开始项目初始化',
        details: {
          projectName: this.options.projectName,
          template: this.options.template
        }
      })

      // 执行初始化流程
      await this.executeInitialization()

      // 保存进度数据
      if (this.progressTracker) {
        await this.progressTracker.saveAllData()
      }

      const duration = Date.now() - startTime

      this.recordProgress({
        action: 'feature_completed',
        description: '项目初始化完成',
        details: {
          projectName: this.options.projectName,
          duration
        }
      })

      return {
        success: true,
        data: {
          projectName: this.options.projectName,
          projectPath: this.options.projectPath,
          initialized: true,
          duration
        },
        duration,
        retries: this.retryCount
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = `项目初始化失败: ${error}`

      this.recordProgress({
        action: 'error_occurred',
        description: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        success: false,
        error: errorMsg,
        duration,
        retries: this.retryCount
      }
    }
  }

  /**
   * 智能体清理逻辑
   */
  protected async onCleanup(): Promise<void> {
    this.logger.debug('清理初始化智能体资源')

    // 清理引用
    this.progressTracker = null
    this.gitManager = null
    this.projectTemplate = null

    this.logger.debug('初始化智能体清理完成')
  }

  /**
   * 选择项目模板
   */
  private selectTemplate(): ProjectTemplate {
    const templateName = this.options.template || 'web-app'
    const template = DEFAULT_TEMPLATES[templateName]

    if (!template) {
      this.logger.warn(`模板 ${templateName} 不存在，使用默认模板`)
      return DEFAULT_TEMPLATES['web-app']
    }

    this.logger.debug(`选择项目模板: ${templateName}`)
    return template
  }

  /**
   * 验证初始化选项
   */
  private async validateOptions(): Promise<void> {
    const errors: string[] = []

    // 验证项目名称
    if (!this.options.projectName || !this.options.projectName.trim()) {
      errors.push('项目名称不能为空')
    }

    // 验证项目路径
    if (!this.options.projectPath || !this.options.projectPath.trim()) {
      errors.push('项目路径不能为空')
    } else {
      const projectPath = path.resolve(this.options.projectPath)

      // 检查路径是否存在且为空
      if (await fs.pathExists(projectPath)) {
        const files = await fs.readdir(projectPath)
        if (files.length > 0) {
          errors.push(`项目路径 ${projectPath} 不为空，请选择空目录或使用不同路径`)
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`配置验证失败:\n${errors.map(e => `  • ${e}`).join('\n')}`)
    }

    this.logger.debug('配置验证通过')
  }

  /**
   * 执行完整的初始化流程
   */
  private async executeInitialization(): Promise<void> {
    this.logger.title(`初始化项目: ${this.options.projectName}`)

    // 步骤1: 创建项目目录
    await this.createProjectStructure()

    // 步骤2: 创建配置文件
    await this.createConfigFiles()

    // 步骤3: 初始化进度跟踪器
    await this.initializeProgressTracker()

    // 步骤4: 创建初始功能列表
    if (this.options.createFeatureList) {
      await this.createInitialFeatureList()
    }

    // 步骤5: 初始化Git仓库
    if (this.options.initGit && this.gitManager) {
      await this.initializeGitRepository()
    }

    // 步骤6: 生成项目摘要
    await this.generateProjectSummary()
  }

  /**
   * 创建项目目录结构
   */
  private async createProjectStructure(): Promise<void> {
    this.logger.startTask('创建项目目录结构')

    try {
      const projectPath = path.resolve(this.options.projectPath)

      // 创建项目根目录
      await fs.ensureDir(projectPath)
      this.logger.debug(`创建项目目录: ${projectPath}`)

      // 创建模板定义的目录结构
      if (this.projectTemplate) {
        for (const dir of this.projectTemplate.directoryStructure) {
          const dirPath = path.join(projectPath, dir)
          await fs.ensureDir(dirPath)
          this.logger.debug(`创建目录: ${dirPath}`)
        }
      }

      // 创建标准目录结构（如果模板中未包含）
      const standardDirs = ['src/', 'tests/', 'docs/', 'config/']
      for (const dir of standardDirs) {
        const dirPath = path.join(projectPath, dir)
        if (!await fs.pathExists(dirPath)) {
          await fs.ensureDir(dirPath)
          this.logger.debug(`创建标准目录: ${dirPath}`)
        }
      }

      this.recordProgress({
        action: 'feature_completed',
        description: '创建项目目录结构完成',
        details: {
          projectPath
        }
      })

      this.logger.completeTask('创建项目目录结构')
    } catch (error) {
      throw new Error(`创建项目目录结构失败: ${error}`)
    }
  }

  /**
   * 创建配置文件
   */
  private async createConfigFiles(): Promise<void> {
    this.logger.startTask('创建配置文件')

    try {
      const projectPath = path.resolve(this.options.projectPath)

      if (this.projectTemplate) {
        // 创建模板定义的文件
        for (const fileTemplate of this.projectTemplate.requiredFiles) {
          const filePath = path.join(projectPath, fileTemplate.path)

          // 处理模板变量
          let content = fileTemplate.content
            .replace(/{projectName}/g, this.options.projectName)
            .replace(/{description}/g, this.options.description || 'A new project')
            .replace(/{template}/g, this.options.template || 'web-app')

          // 确保目录存在
          await fs.ensureDir(path.dirname(filePath))

          // 写入文件
          await fs.writeFile(filePath, content, 'utf-8')
          this.logger.debug(`创建文件: ${filePath}`)
        }
      }

      // 创建基础配置文件
      const baseConfigFiles = [
        {
          path: 'agent.config.json',
          content: JSON.stringify({
            projectName: this.options.projectName,
            description: this.options.description || '',
            template: this.options.template || 'web-app',
            createdAt: new Date().toISOString(),
            version: '1.0.0'
          }, null, 2)
        },
        {
          path: '.gitignore',
          content: `# 依赖
node_modules/
dist/
build/

# 环境变量
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# 日志
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# 运行时数据
.pnp/
.pnp.js

# 测试覆盖
coverage/
.nyc_output

# IDE
.vscode/
.idea/
*.swp
*.swo

# 操作系统
.DS_Store
Thumbs.db

# 临时文件
*.tmp
temp/`
        }
      ]

      for (const file of baseConfigFiles) {
        const filePath = path.join(projectPath, file.path)
        await fs.writeFile(filePath, file.content, 'utf-8')
        this.logger.debug(`创建配置文件: ${filePath}`)
      }

      this.recordProgress({
        action: 'feature_completed',
        description: '创建配置文件完成',
        details: {
          fileCount: (this.projectTemplate?.requiredFiles.length || 0) + baseConfigFiles.length
        }
      })

      this.logger.completeTask('创建配置文件')
    } catch (error) {
      throw new Error(`创建配置文件失败: ${error}`)
    }
  }

  /**
   * 初始化进度跟踪器
   */
  private async initializeProgressTracker(): Promise<void> {
    if (!this.progressTracker) {
      throw new Error('进度跟踪器未初始化')
    }

    this.logger.startTask('初始化进度跟踪器')

    try {
      await this.progressTracker.initialize()

      this.recordProgress({
        action: 'feature_completed',
        description: '初始化进度跟踪器完成'
      })

      this.logger.completeTask('初始化进度跟踪器')
    } catch (error) {
      throw new Error(`初始化进度跟踪器失败: ${error}`)
    }
  }

  /**
   * 创建初始功能列表
   */
  private async createInitialFeatureList(): Promise<void> {
    if (!this.progressTracker) {
      throw new Error('进度跟踪器未初始化')
    }

    this.logger.startTask('创建初始功能列表')

    try {
      let featuresToAdd: Array<{
        category: FeatureCategory
        description: string
        priority: FeaturePriority
        complexity: FeatureComplexity
        steps: string[]
        dependencies?: string[]
      }> = []

      // 使用自定义功能列表或模板建议的功能
      if (this.options.customFeatures && this.options.customFeatures.length > 0) {
        featuresToAdd = this.options.customFeatures
        this.logger.debug(`使用自定义功能列表: ${featuresToAdd.length} 个功能`)
      } else if (this.projectTemplate) {
        featuresToAdd = this.projectTemplate.suggestedFeatures
        this.logger.debug(`使用模板功能列表: ${featuresToAdd.length} 个功能`)
      }

      // 添加基础功能（总是添加）
      const baseFeatures = [
        {
          category: 'infrastructure' as FeatureCategory,
          description: '项目初始化完成',
          priority: 'critical' as FeaturePriority,
          complexity: 'simple' as FeatureComplexity,
          steps: ['项目目录结构创建', '配置文件生成', '进度跟踪系统设置'],
          dependencies: []
        }
      ]

      // 添加所有功能到进度跟踪器
      for (const feature of [...baseFeatures, ...featuresToAdd]) {
        await this.progressTracker.addFeature({
          category: feature.category,
          priority: feature.priority,
          description: feature.description,
          steps: feature.steps,
          dependencies: feature.dependencies || [],
          estimatedComplexity: feature.complexity,
          notes: `由初始化智能体自动创建`
        })
      }

      // 标记第一个功能为已完成
      if (featuresToAdd.length > 0) {
        const firstFeatureId = 'feature-001'
        await this.progressTracker.updateFeature(firstFeatureId, {
          status: 'completed',
          passes: true,
          notes: '项目初始化阶段完成'
        })
      }

      this.recordProgress({
        action: 'feature_completed',
        description: '创建初始功能列表完成',
        details: {
          totalFeatures: baseFeatures.length + featuresToAdd.length
        }
      })

      this.logger.completeTask('创建初始功能列表')
    } catch (error) {
      throw new Error(`创建初始功能列表失败: ${error}`)
    }
  }

  /**
   * 初始化Git仓库
   */
  private async initializeGitRepository(): Promise<void> {
    if (!this.gitManager) {
      throw new Error('Git管理器未初始化')
    }

    this.logger.startTask('初始化Git仓库')

    try {
      // 初始化Git管理器
      const result = await this.gitManager.initialize()
      if (!result.success) {
        throw new Error(result.error || 'Git初始化失败')
      }

      // 创建初始提交
      const commitResult = await this.gitManager.commitWithTemplate({
        description: '项目初始化',
        details: '创建项目基础结构和配置文件',
        category: 'infrastructure',
        testStatus: 'skipped'
      })

      if (!commitResult.success) {
        this.logger.warn(`初始提交失败: ${commitResult.error}`)
      }

      this.recordProgress({
        action: 'commit_created',
        description: 'Git仓库初始化完成并创建初始提交'
      })

      this.logger.completeTask('初始化Git仓库')
    } catch (error) {
      // Git初始化失败不是致命错误，记录警告但继续
      this.logger.warn(`Git仓库初始化失败: ${error}`)
      this.recordProgress({
        action: 'error_occurred',
        description: 'Git仓库初始化失败，但项目继续创建',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      })
    }
  }

  /**
   * 生成项目摘要
   */
  private async generateProjectSummary(): Promise<void> {
    this.logger.title('🎉 项目初始化完成')

    // 项目信息
    this.logger.item('项目名称', this.options.projectName)
    this.logger.item('项目路径', this.options.projectPath)
    if (this.options.description) {
      this.logger.item('项目描述', this.options.description)
    }
    if (this.options.template) {
      this.logger.item('使用模板', this.options.template)
    }

    this.logger.divider()

    // 创建的文件和目录
    if (this.projectTemplate) {
      this.logger.item('创建目录', `${this.projectTemplate.directoryStructure.length} 个`)
      this.logger.item('创建文件', `${this.projectTemplate.requiredFiles.length} 个`)
    }

    // 功能列表信息
    if (this.progressTracker && this.options.createFeatureList) {
      const featureList = this.progressTracker.getFeatureList()
      this.logger.item('初始功能', `${featureList.totalCount} 个`)
      this.logger.item('已完成', `${featureList.completedCount} 个`)
    }

    this.logger.divider()

    // 下一步建议
    this.logger.info('下一步操作：')
    this.logger.item('1', 'cd ' + this.options.projectName)
    this.logger.item('2', '查看项目状态: agent-cli status')
    this.logger.item('3', '开始实现功能: agent-cli next')

    this.recordProgress({
      action: 'feature_completed',
      description: '项目初始化摘要生成完成'
    })
  }
}

/**
 * 初始化智能体工厂
 */
export class InitializerAgentFactory {
  static readonly type = 'initializer'
  static readonly description = '项目初始化智能体，创建项目脚手架和配置'

  static create(context: AgentContext, config?: Partial<AgentConfig>): InitializerAgent {
    // 从上下文中提取初始化选项
    const options: InitializerOptions = {
      projectName: context.projectPath.split('/').pop() || 'untitled-project',
      projectPath: context.projectPath,
      description: context.config?.project?.description || '',
      template: context.config?.project?.template || 'web-app',
      ...(context.userData?.initializerOptions || {})
    }

    return new InitializerAgent(context, options, config)
  }
}

// 默认导出
export default InitializerAgent

// 自动注册工厂（当模块被加载时）
import { AgentRegistry } from './base.js'

try {
  AgentRegistry.register(InitializerAgentFactory)
  console.debug(`✅ 智能体工厂已注册: ${InitializerAgentFactory.type}`)
} catch (error) {
  console.warn(`⚠️  智能体工厂注册失败: ${error instanceof Error ? error.message : String(error)}`)
}