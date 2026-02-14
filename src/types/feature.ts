/**
 * 功能类型定义
 * 设计思路：每个功能都有明确的分类、优先级和依赖关系，便于智能体选择实现顺序
 */

export type FeatureCategory =
  | 'functional'      // 功能性需求
  | 'ui'              // 用户界面
  | 'performance'     // 性能优化
  | 'security'        // 安全性
  | 'accessibility'   // 可访问性
  | 'testing'         // 测试相关
  | 'documentation'   // 文档
  | 'infrastructure'  // 基础设施

export type FeaturePriority = 'critical' | 'high' | 'medium' | 'low'
export type FeatureComplexity = 'simple' | 'medium' | 'complex'

export interface Feature {
  /** 功能唯一标识符 */
  id: string

  /** 功能分类 */
  category: FeatureCategory

  /** 优先级 */
  priority: FeaturePriority

  /** 功能描述 */
  description: string

  /** 实现步骤列表 */
  steps: string[]

  /** 是否已通过测试 */
  passes: boolean

  /** 依赖的功能ID列表 */
  dependencies: string[]

  /** 预估复杂度 */
  estimatedComplexity: FeatureComplexity

  /** 备注信息 */
  notes: string

  /** 创建时间 */
  createdAt: Date

  /** 最后更新时间 */
  updatedAt: Date

  /** 实现状态 */
  status: 'pending' | 'in_progress' | 'completed' | 'blocked'

  /** 相关文件路径 */
  relatedFiles?: string[]

  /** 测试结果 */
  testResults?: TestResult[]
}

export interface TestResult {
  /** 测试ID */
  id: string

  /** 测试描述 */
  description: string

  /** 是否通过 */
  passed: boolean

  /** 执行时间 */
  executionTime: number

  /** 错误信息（如果有） */
  error?: string

  /** 截图路径（如果有） */
  screenshotPath?: string

  /** 执行时间戳 */
  timestamp: Date
}

export interface FeatureList {
  /** 项目名称 */
  projectName: string

  /** 功能列表 */
  features: Feature[]

  /** 创建时间 */
  createdAt: Date

  /** 最后更新时间 */
  updatedAt: Date

  /** 版本号 */
  version: string

  /** 总功能数 */
  totalCount: number

  /** 已完成功能数 */
  completedCount: number

  /** 进行中功能数 */
  inProgressCount: number

  /** 阻塞功能数 */
  blockedCount: number
}