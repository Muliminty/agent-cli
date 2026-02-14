/**
 * 上下文监控智能体模块 - 简化版本（阶段1）
 * 设计思路：分阶段实现，先实现核心监控功能，后续逐步添加高级功能
 *
 * 阶段1目标：
 * 1. 基本结构和Token估算集成
 * 2. 简单的阈值检查和预警
 * 3. 最小可行产品
 */

import { BaseAgent, AgentContext, AgentResult, AgentConfig } from './base.js'
import { TokenCounter, type AIMessage, type TokenEstimation } from '../../utils/token-counter.js'

// 上下文监控配置（简化）
export interface ContextMonitorConfig extends Partial<AgentConfig> {
  /** 警告阈值（0-1） */
  warningThreshold?: number
  /** 模型名称 */
  model?: string
}

// 上下文监控结果（简化）
export interface ContextMonitorResult {
  tokenEstimation: TokenEstimation
  safe: boolean
  warning?: string
  recommendation?: string
}

/**
 * 上下文监控智能体（简化版本）
 */
export class ContextMonitorAgent extends BaseAgent {
  private model: string
  private warningThreshold: number

  constructor(context: AgentContext, config: ContextMonitorConfig = {}) {
    // 合并配置
    const mergedConfig: AgentConfig = {
      name: 'ContextMonitorAgent',
      description: '上下文监控智能体 - 简化版本',
      maxRetries: 0,
      retryDelay: 0,
      timeout: 30000,
      verbose: config.verbose || false,
      enablePerformanceMonitoring: true,
      ...config
    }

    super(context, mergedConfig)

    // 从配置或上下文获取参数
    this.model = config.model || context.config.agent?.model || 'claude-3-5-sonnet'
    this.warningThreshold = config.warningThreshold ||
      context.config.agent?.contextMonitoring?.warningThreshold || 0.8

    this.logger.debug(`上下文监控智能体初始化: 模型=${this.model}, 阈值=${this.warningThreshold}`)
  }

  /**
   * 初始化智能体
   */
  protected async onInitialize(): Promise<void> {
    this.logger.info('上下文监控智能体（简化版）初始化完成')
  }

  /**
   * 执行上下文监控（核心功能）
   */
  protected async onExecute(options: Record<string, any>, signal: AbortSignal): Promise<AgentResult<ContextMonitorResult>> {
    const startTime = Date.now()

    try {
      // 检查终止信号
      if (signal.aborted) {
        throw new Error('监控任务被终止')
      }

      const { messages = [], maxTokens = 4096 } = options

      // 1. 估算token使用（核心功能）
      const tokenEstimation = TokenCounter.estimateRequestTokens(
        messages as AIMessage[],
        maxTokens,
        this.model,
        this.warningThreshold
      )

      // 2. 检查安全性
      const { safe, warning, recommendation } = this.checkSafety(tokenEstimation)

      // 3. 记录进度（简化）
      this.recordProgress({
        action: 'feature_started',
        description: `上下文监控: ${tokenEstimation.totalTokens} tokens (${(tokenEstimation.utilization * 100).toFixed(1)}%)`,
        details: {
          safe,
          warning,
          recommendation
        }
      })

      // 4. 输出警告（如果需要）
      if (warning) {
        this.logger.warn(warning)
        if (recommendation) {
          this.logger.info(`建议: ${recommendation}`)
        }
      }

      // 5. 返回结果
      const result: ContextMonitorResult = {
        tokenEstimation,
        safe,
        warning,
        recommendation
      }

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
        retries: 0
      }

    } catch (error) {
      this.logger.error(`上下文监控执行失败: ${error}`)

      return {
        success: false,
        error: `上下文监控失败: ${error}`,
        duration: Date.now() - startTime,
        retries: 0
      }
    }
  }

  /**
   * 清理资源
   */
  protected async onCleanup(): Promise<void> {
    this.logger.info('上下文监控智能体清理完成')
  }

  /**
   * 检查安全性并生成警告/建议
   */
  private checkSafety(estimation: TokenEstimation): {
    safe: boolean
    warning?: string
    recommendation?: string
  } {
    const safe = !estimation.exceedsWarningThreshold

    if (safe) {
      return { safe: true }
    }

    // 生成警告消息
    const modelLimit = TokenCounter.getModelContextLimit(this.model)
    const percentage = (estimation.utilization * 100).toFixed(1)
    const warning = `⚠️  上下文使用率 ${percentage}% (${estimation.totalTokens}/${modelLimit} tokens)`

    // 生成建议
    let recommendation: string | undefined

    if (estimation.utilization >= 1.0) {
      recommendation = '立即开启新会话：已超过模型限制'
    } else if (estimation.utilization >= 0.9) {
      recommendation = '强烈建议开启新会话：接近模型限制'
    } else {
      recommendation = '建议开启新会话或压缩输入内容'
    }

    // 额外建议
    if (estimation.inputTokens > 100000) {
      recommendation += '；考虑压缩代码或使用文件引用'
    }

    if (estimation.outputTokens > 8192) {
      recommendation += `；降低max_tokens参数（当前: ${estimation.outputTokens}）`
    }

    return {
      safe: false,
      warning,
      recommendation
    }
  }

  /**
   * 快速检查接口（简化使用）
   */
  public quickCheck(messages: AIMessage[], maxTokens: number = 4096): ContextMonitorResult {
    const tokenEstimation = TokenCounter.estimateRequestTokens(
      messages,
      maxTokens,
      this.model,
      this.warningThreshold
    )

    const { safe, warning, recommendation } = this.checkSafety(tokenEstimation)

    return {
      tokenEstimation,
      safe,
      warning,
      recommendation
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): { model: string; warningThreshold: number } {
    return {
      model: this.model,
      warningThreshold: this.warningThreshold
    }
  }
}

/**
 * 创建上下文监控智能体工厂（简化）
 */
export function createContextMonitorAgent(context: AgentContext, config?: ContextMonitorConfig): ContextMonitorAgent {
  return new ContextMonitorAgent(context, config)
}

// 默认导出
export default {
  ContextMonitorAgent,
  createContextMonitorAgent
}