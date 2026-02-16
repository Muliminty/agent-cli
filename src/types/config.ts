/**
 * 配置类型定义
 * 设计思路：使用Zod schema定义配置结构，支持运行时验证和类型安全
 */

import { z } from 'zod'

// 项目类型定义
export const ProjectTypeSchema = z.enum([
  'web-app',
  'api-service',
  'cli-tool',
  'library',
  'mobile-app',
  'desktop-app'
])

export type ProjectType = z.infer<typeof ProjectTypeSchema>

// 技术栈定义
export const TechStackSchema = z.enum([
  'react',
  'vue',
  'angular',
  'svelte',
  'nextjs',
  'nuxt',
  'express',
  'nestjs',
  'fastify',
  'typescript',
  'javascript',
  'tailwind',
  'bootstrap',
  'material-ui',
  'antd',
  'jest',
  'vitest',
  'cypress',
  'puppeteer'
])

export type TechStack = z.infer<typeof TechStackSchema>

// AI提供商定义
export const AIProviderSchema = z.enum([
  'anthropic',    // Claude系列
  'openai',       // GPT系列
  'deepseek',     // DeepSeek
  'zhipu',        // 智谱AI
  'kimi',         // Kimi (月之暗面)
  'qwen',         // 通义千问
  'local',        // 本地模型
  'custom'        // 自定义API
])

export type AIProvider = z.infer<typeof AIProviderSchema>

// AI模型定义（扩展，按提供商分组）
export const AIModelSchema = z.enum([
  // Anthropic (Claude)
  'claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku', 'claude-3-5-haiku',
  // OpenAI
  'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo',
  // DeepSeek
  'deepseek-chat', 'deepseek-coder', 'deepseek-reasoner',
  // 智谱AI
  'glm-4', 'glm-4v', 'glm-3-turbo',
  // Kimi
  'kimi-1.0', 'kimi-1.5',
  // 通义千问
  'qwen-max', 'qwen-plus', 'qwen-turbo'
])

export type AIModel = z.infer<typeof AIModelSchema>

// 提供商配置（API密钥和端点）
export const AIProviderConfigSchema = z.object({
  provider: AIProviderSchema,
  apiKey: z.string().optional(),  // 支持环境变量覆盖
  baseURL: z.string().url().optional(),  // 自定义API端点
  defaultModel: AIModelSchema.optional(),
  timeout: z.number().min(1000).max(60000).default(30000),
  maxRetries: z.number().min(0).max(5).default(3),
  enabled: z.boolean().default(true)
})

export type AIProviderConfig = z.infer<typeof AIProviderConfigSchema>

// AI配置（主配置）
export const AIConfigSchema = z.object({
  defaultProvider: AIProviderSchema.default('anthropic'),
  defaultModel: AIModelSchema.default('claude-3-5-sonnet'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(100).max(100000).default(4096),
  stream: z.boolean().default(true),

  // 多提供商配置
  providers: z.record(AIProviderSchema, AIProviderConfigSchema).default({
    anthropic: { provider: 'anthropic', enabled: true },
    openai: { provider: 'openai', enabled: true },
    deepseek: { provider: 'deepseek', enabled: false },
    zhipu: { provider: 'zhipu', enabled: false },
    kimi: { provider: 'kimi', enabled: false }
  }),

  // 使用统计
  usageStats: z.object({
    enabled: z.boolean().default(true),
    trackCosts: z.boolean().default(true),
    currency: z.string().default('USD')
  }).default({})
})

export type AIConfig = z.infer<typeof AIConfigSchema>

// 初始化智能体配置
export const InitializerConfigSchema = z.object({
  promptTemplate: z.string().default('templates/init-prompt.md'),
  maxFeatures: z.number().min(50).max(500).default(200),
  featureDetailLevel: z.enum(['low', 'medium', 'high']).default('high'),
  generateTests: z.boolean().default(true),
  generateDocs: z.boolean().default(true)
})

export type InitializerConfig = z.infer<typeof InitializerConfigSchema>

// 编码智能体配置
export const CoderConfigSchema = z.object({
  promptTemplate: z.string().default('templates/coder-prompt.md'),
  incrementalMode: z.boolean().default(true),
  maxStepsPerSession: z.number().min(1).max(10).default(1),
  requireTests: z.boolean().default(true),
  autoCommit: z.boolean().default(true),
  reviewChanges: z.boolean().default(true)
})

export type CoderConfig = z.infer<typeof CoderConfigSchema>

// 测试配置
export const TestingConfigSchema = z.object({
  framework: z.enum(['puppeteer', 'playwright', 'cypress', 'jest']).default('puppeteer'),
  headless: z.boolean().default(true),
  timeout: z.number().min(1000).max(120000).default(30000),
  takeScreenshots: z.boolean().default(true),
  recordVideo: z.boolean().default(false),
  viewport: z.object({
    width: z.number().default(1280),
    height: z.number().default(720)
  }).default({ width: 1280, height: 720 })
})

export type TestingConfig = z.infer<typeof TestingConfigSchema>

// 上下文监控配置
export const ContextMonitoringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  warningThreshold: z.number().min(0.5).max(0.95).default(0.8),
  maxTokens: z.number().min(1000).max(200000).default(131072),
  autoSummarize: z.boolean().default(true),
  summaryInterval: z.number().min(1).max(100).default(10),
  modelSpecificLimits: z.record(z.string(), z.number()).default({
    'claude-3-5-sonnet': 131072,
    'claude-3-opus': 131072,
    'claude-3-haiku': 131072,
    'gpt-4': 128000,
    'gpt-4-turbo': 128000,
    'gpt-3.5-turbo': 16385
  })
})

export type ContextMonitoringConfig = z.infer<typeof ContextMonitoringConfigSchema>

// Git配置
export const GitConfigSchema = z.object({
  autoCommit: z.boolean().default(true),
  branch: z.string().default('main'),
  commitTemplate: z.string().default('feat: {description}\n\n- 实现功能: {details}\n- 分类: {category}\n- 测试状态: {testStatus}\n- 相关文件: {files}'),
  commitOnTestPass: z.boolean().default(true),
  tagReleases: z.boolean().default(false)
})

export type GitConfig = z.infer<typeof GitConfigSchema>

// 项目配置
export const ProjectConfigSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(10).max(1000),
  type: ProjectTypeSchema.default('web-app'),
  techStack: z.array(TechStackSchema).min(1).max(10),
  version: z.string().default('1.0.0'),
  author: z.string().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional()
})

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>

// 智能体配置
export const AgentConfigSchema = z.object({
  // 保持现有字段兼容（向后兼容）
  model: AIModelSchema.default('claude-3-5-sonnet'),
  contextMonitoring: ContextMonitoringConfigSchema.default({}),
  initializer: InitializerConfigSchema.default({}),
  coder: CoderConfigSchema.default({}),
  maxRetries: z.number().min(0).max(10).default(3),
  retryDelay: z.number().min(1000).max(60000).default(5000),
  temperature: z.number().min(0).max(2).default(0.7),

  // 新增AI配置（多提供商支持）
  ai: AIConfigSchema.default({})
})

export type AgentConfig = z.infer<typeof AgentConfigSchema>

// 服务器配置（从server-schema导入）
import { ServerConfigSchema } from '../config/server-schema.js'

// 主配置schema
export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  project: ProjectConfigSchema,
  agent: AgentConfigSchema.default({}),
  testing: TestingConfigSchema.default({}),
  git: GitConfigSchema.default({}),
  server: ServerConfigSchema.default({}),
  paths: z.object({
    progressFile: z.string().default('claude-progress.txt'),
    featureListFile: z.string().default('feature-list.json'),
    configFile: z.string().default('agent.config.json'),
    logsDir: z.string().default('logs'),
    aiConfigDir: z.string().default('.ai-config')  // AI相关配置目录
  }).default({}),
  features: z.object({
    enableProgressTracking: z.boolean().default(true),
    enableAutoTesting: z.boolean().default(true),
    enableGitIntegration: z.boolean().default(true),
    enableErrorRecovery: z.boolean().default(true),
    enableMultiAIProviders: z.boolean().default(true)  // 新增多AI提供商功能开关
  }).default({})
})

export type Config = z.infer<typeof ConfigSchema>

// 默认配置
export const DEFAULT_CONFIG: Config = {
  project: {
    name: 'unnamed-project',
    description: 'A new project created with agent-cli',
    type: 'web-app',
    techStack: ['react', 'typescript', 'tailwind'],
    version: '1.0.0'
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
    temperature: 0.7,
    ai: {
      defaultProvider: 'anthropic',
      defaultModel: 'claude-3-5-sonnet',
      temperature: 0.7,
      maxTokens: 4096,
      stream: true,
      providers: {
        anthropic: { provider: 'anthropic', enabled: true },
        openai: { provider: 'openai', enabled: true },
        deepseek: { provider: 'deepseek', enabled: false },
        zhipu: { provider: 'zhipu', enabled: false },
        kimi: { provider: 'kimi', enabled: false }
      },
      usageStats: {
        enabled: true,
        trackCosts: true,
        currency: 'USD'
      }
    }
  },
  testing: {
    framework: 'puppeteer',
    headless: true,
    timeout: 30000,
    takeScreenshots: true,
    recordVideo: false,
    viewport: {
      width: 1280,
      height: 720
    }
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
    logsDir: 'logs',
    aiConfigDir: '.ai-config'  // AI相关配置目录
  },
  features: {
    enableProgressTracking: true,
    enableAutoTesting: true,
    enableGitIntegration: true,
    enableErrorRecovery: true,
    enableMultiAIProviders: true
  }
}