/**
 * 项目状态类型定义
 * 设计思路：跟踪项目整体状态，包括进度、测试结果和当前焦点
 */

import type { Feature } from './feature.js'
import type { TestResult } from './feature.js'

export interface ProjectState {
  /** 项目名称 */
  projectName: string

  /** 已完成功能列表 */
  completedFeatures: Feature[]

  /** 待完成功能列表 */
  pendingFeatures: Feature[]

  /** 进行中功能列表 */
  inProgressFeatures: Feature[]

  /** 阻塞功能列表 */
  blockedFeatures: Feature[]

  /** 最后更新时间 */
  lastUpdated: Date

  /** 当前聚焦的功能ID */
  currentFocus: string | null

  /** 测试结果历史 */
  testResults: TestResult[]

  /** 项目进度百分比 */
  progressPercentage: number

  /** 总工作时间（小时） */
  totalWorkHours: number

  /** 最后提交信息 */
  lastCommit?: {
    hash: string
    message: string
    timestamp: Date
    author: string
  }

  /** 项目健康状态 */
  health: 'healthy' | 'warning' | 'critical'

  /** 健康状态详情 */
  healthDetails: {
    /** 测试通过率 */
    testPassRate: number

    /** 代码覆盖率 */
    codeCoverage?: number

    /** 构建状态 */
    buildStatus: 'passing' | 'failing' | 'unknown'

    /** 依赖状态 */
    dependenciesStatus: 'up-to-date' | 'outdated' | 'vulnerable'

    /** 最近错误 */
    recentErrors: string[]
  }
}

export interface ProgressEntry {
  /** 时间戳 */
  timestamp: Date

  /** 操作类型 */
  action: 'feature_started' | 'feature_completed' | 'test_passed' | 'test_failed' | 'commit_created' | 'error_occurred'

  /** 相关功能ID */
  featureId?: string

  /** 描述 */
  description: string

  /** 详细信息 */
  details?: Record<string, any>

  /** 错误信息（如果有） */
  error?: string
}

export interface ProjectContext {
  /** 项目路径 */
  projectPath: string

  /** 配置 */
  config: any // 使用Config类型，这里避免循环引用

  /** 当前状态 */
  state: ProjectState

  /** 进度历史 */
  progressHistory: ProgressEntry[]

  /** Git状态 */
  gitStatus: {
    branch: string
    isClean: boolean
    lastCommit: string
    ahead: number
    behind: number
  }

  /** 文件系统状态 */
  fileSystem: {
    totalFiles: number
    totalSize: number
    lastModified: Date
  }
}