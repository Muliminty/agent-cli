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

// AI模型定义
export const AIModelSchema = z.enum([
  'claude-3-5-sonnet',
  'claude-3-opus',
  'claude-3-haiku',
  'gpt-4',
  'gpt-4-turbo',
  'gpt-3.5-turbo'
])

export type AIModel = z.infer<typeof AIModelSchema>

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
  model: AIModelSchema.default('claude-3-5-sonnet'),
  initializer: InitializerConfigSchema.default({}),
  coder: CoderConfigSchema.default({}),
  maxRetries: z.number().min(0).max(10).default(3),
  retryDelay: z.number().min(1000).max(60000).default(5000),
  temperature: z.number().min(0).max(2).default(0.7)
})

export type AgentConfig = z.infer<typeof AgentConfigSchema>

// 主配置schema
export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  project: ProjectConfigSchema,
  agent: AgentConfigSchema.default({}),
  testing: TestingConfigSchema.default({}),
  git: GitConfigSchema.default({}),
  paths: z.object({
    progressFile: z.string().default('claude-progress.txt'),
    featureListFile: z.string().default('feature-list.json'),
    configFile: z.string().default('agent.config.json'),
    logsDir: z.string().default('logs')
  }).default({}),
  features: z.object({
    enableProgressTracking: z.boolean().default(true),
    enableAutoTesting: z.boolean().default(true),
    enableGitIntegration: z.boolean().default(true),
    enableErrorRecovery: z.boolean().default(true)
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