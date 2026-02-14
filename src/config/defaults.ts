/**
 * 默认配置常量
 * 设计思路：集中管理所有默认配置值，便于维护和修改
 *
 * 注意：此文件主要导出schema.ts中定义的默认配置，
 * 确保配置一致性，避免重复定义
 */

export { DEFAULT_CONFIG } from './schema.js'

// 项目类型默认值
export const DEFAULT_PROJECT_TYPE = 'web-app'

// 技术栈默认值
export const DEFAULT_TECH_STACK = ['react', 'typescript', 'tailwind'] as const

// AI模型默认值
export const DEFAULT_AI_MODEL = 'claude-3-5-sonnet'

// 文件路径默认值
export const DEFAULT_PATHS = {
  progressFile: 'claude-progress.txt',
  featureListFile: 'feature-list.json',
  configFile: 'agent.config.json',
  logsDir: 'logs'
} as const

// 测试配置默认值
export const DEFAULT_TESTING_CONFIG = {
  framework: 'puppeteer',
  headless: true,
  timeout: 30000,
  takeScreenshots: true,
  recordVideo: false,
  viewport: {
    width: 1280,
    height: 720
  }
} as const

// Git配置默认值
export const DEFAULT_GIT_CONFIG = {
  autoCommit: true,
  branch: 'main',
  commitTemplate: 'feat: {description}\n\n- 实现功能: {details}\n- 分类: {category}\n- 测试状态: {testStatus}\n- 相关文件: {files}',
  commitOnTestPass: true,
  tagReleases: false
} as const

// 智能体配置默认值
export const DEFAULT_AGENT_CONFIG = {
  model: DEFAULT_AI_MODEL,
  initializer: {
    promptTemplate: 'templates/init-prompt.md',
    maxFeatures: 200,
    featureDetailLevel: 'high' as const,
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
} as const

// 功能标志默认值
export const DEFAULT_FEATURES = {
  enableProgressTracking: true,
  enableAutoTesting: true,
  enableGitIntegration: true,
  enableErrorRecovery: true
} as const

/**
 * 创建项目特定默认配置
 */
export function createProjectDefaults(projectName: string, projectType = DEFAULT_PROJECT_TYPE) {
  return {
    project: {
      name: projectName,
      description: `由agent-cli创建的项目: ${projectName}`,
      type: projectType,
      techStack: [...DEFAULT_TECH_STACK],
      version: '1.0.0'
    },
    agent: DEFAULT_AGENT_CONFIG,
    testing: DEFAULT_TESTING_CONFIG,
    git: DEFAULT_GIT_CONFIG,
    paths: DEFAULT_PATHS,
    features: DEFAULT_FEATURES
  }
}

/**
 * 获取最小化默认配置（用于测试和演示）
 */
export function getMinimalDefaults() {
  return {
    project: {
      name: 'demo-project',
      description: '演示项目',
      type: DEFAULT_PROJECT_TYPE,
      techStack: ['react'],
      version: '0.1.0'
    }
  }
}

// 默认导出
export default {
  DEFAULT_CONFIG,
  DEFAULT_PROJECT_TYPE,
  DEFAULT_TECH_STACK,
  DEFAULT_AI_MODEL,
  DEFAULT_PATHS,
  DEFAULT_TESTING_CONFIG,
  DEFAULT_GIT_CONFIG,
  DEFAULT_AGENT_CONFIG,
  DEFAULT_FEATURES,
  createProjectDefaults,
  getMinimalDefaults
}