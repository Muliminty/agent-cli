/**
 * 智能体基类模块
 * 设计思路：定义所有智能体的通用接口和行为，实现错误处理、状态管理和重试机制
 *
 * 核心功能：
 * 1. 智能体生命周期管理（初始化、执行、清理）
 * 2. 统一的错误处理和重试机制
 * 3. 状态管理和进度跟踪
 * 4. 配置访问和上下文管理
 * 5. 日志记录和性能监控
 */

import { createLogger, Logger } from '../../utils/logger.js'
import type { Config } from '../../config/schema.js'
import type { ProjectState, ProgressEntry } from '../../types/project.js'
import type { Feature, FeatureList } from '../../types/feature.js'

// 智能体状态定义
export type AgentStatus =
  | 'idle'          // 空闲状态
  | 'initializing'  // 初始化中
  | 'ready'         // 准备就绪
  | 'executing'     // 执行中
  | 'paused'        // 已暂停
  | 'completed'     // 已完成
  | 'failed'        // 已失败

// 智能体执行结果
export interface AgentResult<T = any> {
  /** 执行是否成功 */
  success: boolean
  /** 结果数据 */
  data?: T
  /** 错误信息 */
  error?: string
  /** 执行时间（毫秒） */
  duration: number
  /** 重试次数 */
  retries: number
  /** 警告信息 */
  warnings?: string[]
  /** 元数据 */
  metadata?: Record<string, any>
}

// 智能体执行上下文
export interface AgentContext {
  /** 项目路径 */
  projectPath: string
  /** 配置信息 */
  config: Config
  /** 项目状态 */
  projectState?: ProjectState
  /** 功能列表 */
  featureList?: FeatureList
  /** 当前聚焦的功能ID */
  currentFeatureId?: string
  /** 用户提供的额外数据 */
  userData?: Record<string, any>
  /** 执行选项 */
  options?: Record<string, any>
}

// 智能体配置
export interface AgentConfig {
  /** 智能体名称 */
  name: string
  /** 智能体描述 */
  description: string
  /** 最大重试次数 */
  maxRetries: number
  /** 重试延迟（毫秒） */
  retryDelay: number
  /** 执行超时时间（毫秒） */
  timeout: number
  /** 是否启用详细日志 */
  verbose: boolean
  /** 是否启用性能监控 */
  enablePerformanceMonitoring: boolean
}

// 智能体事件类型
export type AgentEvent =
  | 'initialized'
  | 'started'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'retrying'
  | 'paused'
  | 'resumed'

// 智能体事件监听器
export type AgentEventListener = (event: AgentEvent, data?: any) => void

/**
 * 智能体基类 - 所有智能体的抽象基类
 */
export abstract class BaseAgent {
  // 配置和状态
  protected config: AgentConfig
  protected context: AgentContext
  protected status: AgentStatus = 'idle'
  protected logger: Logger

  // 执行状态
  private startTime: number = 0
  private retryCount: number = 0
  private eventListeners: AgentEventListener[] = []
  private abortController: AbortController | null = null

  // 性能监控
  private performanceMetrics: {
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    totalDuration: number
    averageDuration: number
  } = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    totalDuration: 0,
    averageDuration: 0
  }

  constructor(context: AgentContext, config: Partial<AgentConfig> = {}) {
    // 设置默认配置
    this.config = {
      name: this.constructor.name,
      description: '基础智能体',
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      verbose: false,
      enablePerformanceMonitoring: true,
      ...config
    }

    // 设置上下文
    this.context = context

    // 初始化日志器
    this.logger = createLogger({
      debug: this.config.verbose,
      level: this.config.verbose ? 'debug' : 'info'
    })

    this.logger.debug(`智能体 ${this.config.name} 初始化完成`)
  }

  /**
   * 初始化智能体
   */
  async initialize(): Promise<AgentResult<void>> {
    const startTime = Date.now()

    try {
      this.emitEvent('initialized', { timestamp: new Date() })
      this.setStatus('initializing')

      this.logger.startTask(`初始化智能体: ${this.config.name}`)

      // 执行具体的初始化逻辑
      await this.onInitialize()

      this.setStatus('ready')
      this.logger.completeTask(`初始化智能体: ${this.config.name}`)

      return {
        success: true,
        duration: Date.now() - startTime,
        retries: 0
      }
    } catch (error) {
      const errorMsg = `智能体初始化失败: ${error}`
      this.logger.error(errorMsg)
      this.setStatus('failed')

      return {
        success: false,
        error: errorMsg,
        duration: Date.now() - startTime,
        retries: 0
      }
    }
  }

  /**
   * 执行智能体任务
   */
  async execute(options: Record<string, any> = {}): Promise<AgentResult> {
    const startTime = Date.now()
    this.startTime = startTime
    this.retryCount = 0

    // 更新上下文选项
    this.context.options = options

    // 创建终止控制器
    this.abortController = new AbortController()

    try {
      // 检查状态
      if (this.status !== 'ready') {
        throw new Error(`智能体状态为 ${this.status}，无法执行`)
      }

      this.setStatus('executing')
      this.emitEvent('started', { timestamp: new Date(), options })

      this.logger.startTask(`执行智能体任务: ${this.config.name}`)

      let result: AgentResult

      // 重试逻辑
      while (this.retryCount <= this.config.maxRetries) {
        try {
          // 设置超时
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error(`执行超时 (${this.config.timeout}ms)`))
            }, this.config.timeout)
          })

          // 执行具体任务
          const executionPromise = this.onExecute(options, this.abortController.signal)

          result = await Promise.race([executionPromise, timeoutPromise]) as AgentResult

          // 如果执行成功，跳出重试循环
          if (result.success) {
            break
          } else {
            throw new Error(result.error || '执行失败')
          }
        } catch (error) {
          this.retryCount++

          if (this.retryCount <= this.config.maxRetries) {
            const delay = this.config.retryDelay * this.retryCount
            this.emitEvent('retrying', {
              retryCount: this.retryCount,
              maxRetries: this.config.maxRetries,
              delay,
              error
            })

            this.logger.warn(`执行失败，${delay}ms后重试 (${this.retryCount}/${this.config.maxRetries}): ${error}`)

            await this.delay(delay)
          } else {
            // 重试次数用完，抛出错误
            throw error
          }
        }
      }

      // 更新性能指标
      this.updatePerformanceMetrics(result!, Date.now() - startTime)

      if (result!.success) {
        this.setStatus('completed')
        this.emitEvent('completed', {
          result: result!.data,
          duration: result!.duration,
          retries: this.retryCount
        })

        this.logger.completeTask(`执行智能体任务: ${this.config.name}`)
        this.logger.success(`任务执行成功，耗时 ${result!.duration}ms，重试 ${this.retryCount} 次`)
      } else {
        this.setStatus('failed')
        this.emitEvent('failed', {
          error: result!.error,
          duration: result!.duration,
          retries: this.retryCount
        })

        this.logger.error(`任务执行失败: ${result!.error}`)
      }

      return result!
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = `智能体执行失败: ${error}`

      this.setStatus('failed')
      this.emitEvent('failed', { error: errorMsg, duration, retries: this.retryCount })

      this.logger.error(errorMsg)

      // 更新性能指标
      this.performanceMetrics.failedExecutions++
      this.performanceMetrics.totalExecutions++
      this.performanceMetrics.totalDuration += duration
      this.performanceMetrics.averageDuration =
        this.performanceMetrics.totalDuration / this.performanceMetrics.totalExecutions

      return {
        success: false,
        error: errorMsg,
        duration,
        retries: this.retryCount
      }
    } finally {
      this.abortController = null
    }
  }

  /**
   * 暂停智能体
   */
  async pause(): Promise<AgentResult<void>> {
    try {
      if (this.status !== 'executing') {
        return {
          success: false,
          error: `无法暂停，当前状态为 ${this.status}`,
          duration: 0,
          retries: 0
        }
      }

      // 发送终止信号
      this.abortController?.abort()

      this.setStatus('paused')
      this.emitEvent('paused', { timestamp: new Date() })

      this.logger.info(`智能体已暂停`)

      return {
        success: true,
        duration: 0,
        retries: 0
      }
    } catch (error) {
      return {
        success: false,
        error: `暂停失败: ${error}`,
        duration: 0,
        retries: 0
      }
    }
  }

  /**
   * 恢复智能体
   */
  async resume(): Promise<AgentResult<void>> {
    try {
      if (this.status !== 'paused') {
        return {
          success: false,
          error: `无法恢复，当前状态为 ${this.status}`,
          duration: 0,
          retries: 0
        }
      }

      this.setStatus('ready')
      this.emitEvent('resumed', { timestamp: new Date() })

      this.logger.info(`智能体已恢复`)

      return {
        success: true,
        duration: 0,
        retries: 0
      }
    } catch (error) {
      return {
        success: false,
        error: `恢复失败: ${error}`,
        duration: 0,
        retries: 0
      }
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<AgentResult<void>> {
    try {
      this.logger.startTask('清理智能体资源')

      // 发送终止信号
      this.abortController?.abort()

      // 执行具体的清理逻辑
      await this.onCleanup()

      // 清理事件监听器
      this.eventListeners = []

      this.setStatus('idle')
      this.logger.completeTask('清理智能体资源')

      return {
        success: true,
        duration: 0,
        retries: 0
      }
    } catch (error) {
      return {
        success: false,
        error: `清理失败: ${error}`,
        duration: 0,
        retries: 0
      }
    }
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: AgentEventListener): void {
    this.eventListeners.push(listener)
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(listener: AgentEventListener): void {
    const index = this.eventListeners.indexOf(listener)
    if (index > -1) {
      this.eventListeners.splice(index, 1)
    }
  }

  /**
   * 获取智能体状态
   */
  getStatus(): AgentStatus {
    return this.status
  }

  /**
   * 获取性能指标
   */
  getPerformanceMetrics() {
    return { ...this.performanceMetrics }
  }

  /**
   * 获取执行时间
   */
  getExecutionTime(): number {
    if (!this.startTime) return 0
    return Date.now() - this.startTime
  }

  /**
   * 记录进度
   */
  protected recordProgress(progress: Omit<ProgressEntry, 'timestamp'>): void {
    const progressEntry: ProgressEntry = {
      ...progress,
      timestamp: new Date()
    }

    this.emitEvent('progress', progressEntry)
    this.logger.info(`进度更新: ${progress.description}`)
  }

  /**
   * 获取当前功能
   */
  protected getCurrentFeature(): Feature | undefined {
    if (!this.context.currentFeatureId || !this.context.featureList) {
      return undefined
    }

    return this.context.featureList.features.find(
      f => f.id === this.context.currentFeatureId
    )
  }

  /**
   * 更新功能状态
   */
  protected async updateFeatureStatus(
    featureId: string,
    updates: Partial<Feature>
  ): Promise<void> {
    // 这里应该调用进度跟踪器更新功能状态
    // 暂时记录日志，后续集成
    this.logger.debug(`更新功能状态: ${featureId}`, updates)
  }

  /**
   * 延迟执行
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 设置状态
   */
  private setStatus(status: AgentStatus): void {
    const oldStatus = this.status
    this.status = status

    this.logger.debug(`智能体状态变更: ${oldStatus} -> ${status}`)
  }

  /**
   * 触发事件
   */
  private emitEvent(event: AgentEvent, data?: any): void {
    this.eventListeners.forEach(listener => {
      try {
        listener(event, data)
      } catch (error) {
        this.logger.error(`事件监听器执行失败: ${error}`)
      }
    })
  }

  /**
   * 更新性能指标
   */
  private updatePerformanceMetrics(result: AgentResult, duration: number): void {
    this.performanceMetrics.totalExecutions++
    this.performanceMetrics.totalDuration += duration
    this.performanceMetrics.averageDuration =
      this.performanceMetrics.totalDuration / this.performanceMetrics.totalExecutions

    if (result.success) {
      this.performanceMetrics.successfulExecutions++
    } else {
      this.performanceMetrics.failedExecutions++
    }
  }

  // 抽象方法 - 子类必须实现

  /**
   * 初始化逻辑 - 子类实现
   */
  protected abstract onInitialize(): Promise<void>

  /**
   * 执行逻辑 - 子类实现
   * @param options 执行选项
   * @param signal 终止信号
   */
  protected abstract onExecute(
    options: Record<string, any>,
    signal: AbortSignal
  ): Promise<AgentResult>

  /**
   * 清理逻辑 - 子类实现
   */
  protected abstract onCleanup(): Promise<void>
}

/**
 * 智能体工厂接口
 */
export interface AgentFactory {
  /** 创建智能体 */
  create(context: AgentContext, config?: Partial<AgentConfig>): BaseAgent

  /** 智能体类型标识 */
  type: string

  /** 智能体描述 */
  description: string
}

/**
 * 智能体注册表
 */
export class AgentRegistry {
  private static agents: Map<string, AgentFactory> = new Map()

  /**
   * 注册智能体工厂
   */
  static register(factory: AgentFactory): void {
    if (this.agents.has(factory.type)) {
      throw new Error(`智能体类型 ${factory.type} 已注册`)
    }

    this.agents.set(factory.type, factory)
  }

  /**
   * 获取智能体工厂
   */
  static get(type: string): AgentFactory | undefined {
    return this.agents.get(type)
  }

  /**
   * 获取所有已注册的智能体类型
   */
  static getAllTypes(): string[] {
    return Array.from(this.agents.keys())
  }

  /**
   * 检查智能体类型是否已注册
   */
  static has(type: string): boolean {
    return this.agents.has(type)
  }

  /**
   * 创建智能体实例
   */
  static create(type: string, context: AgentContext, config?: Partial<AgentConfig>): BaseAgent {
    const factory = this.get(type)
    if (!factory) {
      throw new Error(`智能体类型 ${type} 未注册`)
    }

    return factory.create(context, config)
  }
}

// 默认导出
export default BaseAgent