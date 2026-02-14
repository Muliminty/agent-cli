/**
 * 上下文监控智能体模块
 * 设计思路：实时监控AI对话的token使用情况，提供阈值预警和自动总结功能
 *
 * 功能特点：
 * 1. 基于TokenCounter的token使用估算
 * 2. 上下文使用率监控和阈值预警（默认80%）
 * 3. 自动会话总结生成（基于消息间隔）
 * 4. Token使用历史记录和统计分析
 * 5. 与进度跟踪系统集成
 */

import { BaseAgent, AgentContext, AgentResult, AgentConfig } from './base.js'
import { TokenCounter, type AIMessage, type TokenEstimation } from '../../utils/token-counter.js'
import { createLogger } from '../../utils/logger.js'

// 上下文监控事件类型
export type ContextMonitorEvent =
  | 'token_usage_updated'
  | 'warning_threshold_reached'
  | 'summary_generated'
  | 'context_limit_exceeded'

// Token使用记录接口
export interface TokenUsageRecord {
  timestamp: Date
  inputTokens: number
  outputTokens: number
  totalTokens: number
  utilization: number
  messageCount: number
  sessionId: string
  metadata?: Record<string, any>
}

// 上下文监控结果
export interface ContextMonitorResult {
  tokenEstimation: TokenEstimation
  tokenHistory: TokenUsageRecord[]
  warnings: string[]
  recommendations: string[]
  generatedSummary?: string
}

// 上下文监控配置
export interface ContextMonitorConfig extends Partial<AgentConfig> {
  /** 监控启用状态 */
  enabled?: boolean
  /** 警告阈值（0-1） */
  warningThreshold?: number
  /** 自动总结启用 */
  autoSummarize?: boolean
  /** 总结间隔（消息数） */
  summaryInterval?: number
  /** 最大历史记录数 */
  maxHistoryRecords?: number
  /** 模型名称 */
  model?: string
}

/**
 * 上下文监控智能体
 */
export class ContextMonitorAgent extends BaseAgent {
  private tokenHistory: TokenUsageRecord[] = []
  private warningTriggered = false
  private lastSummaryTime = 0
  private messageCount = 0
  private sessionId: string

  constructor(context: AgentContext, config: ContextMonitorConfig = {}) {
    // 合并配置
    const mergedConfig: AgentConfig = {
      name: 'ContextMonitorAgent',
      description: '上下文监控智能体，负责监控token使用和提供预警',
      maxRetries: 0, // 监控不需要重试
      retryDelay: 0,
      timeout: 30000,
      verbose: config.verbose || false,
      enablePerformanceMonitoring: true,
      ...config
    }

    super(context, mergedConfig)

    // 生成会话ID
    this.sessionId = this.generateSessionId()

    this.logger.debug(`上下文监控智能体初始化完成，会话ID: ${this.sessionId}`)
  }

  /**
   * 初始化智能体
   */
  protected async onInitialize(): Promise<void> {
    this.logger.info('上下文监控智能体初始化开始')

    // 加载历史记录（如果有）
    await this.loadTokenHistory()

    this.logger.success('上下文监控智能体初始化完成')
  }

  /**
   * 执行上下文监控
   * @param options 执行选项
   * @param signal 终止信号
   */
  protected async onExecute(options: Record<string, any>, signal: AbortSignal): Promise<AgentResult<ContextMonitorResult>> {
    const startTime = Date.now()

    try {
      // 检查终止信号
      if (signal.aborted) {
        throw new Error('监控任务被终止')
      }

      const { messages = [], maxTokens = 4096, model = 'claude-3-5-sonnet' } = options

      // 1. 估算token使用
      const tokenEstimation = TokenCounter.estimateRequestTokens(
        messages as AIMessage[],
        maxTokens,
        model,
        this.getWarningThreshold()
      )

      // 2. 记录token使用
      const usageRecord = this.recordTokenUsage(tokenEstimation, messages.length, model)

      // 3. 检查警告阈值
      const warnings: string[] = []
      const recommendations: string[] = []

      if (tokenEstimation.exceedsWarningThreshold && !this.warningTriggered) {
        const warningResult = await this.handleWarningThreshold(tokenEstimation, model)
        warnings.push(...warningResult.warnings)
        recommendations.push(...warningResult.recommendations)
        this.warningTriggered = true
      }

      // 4. 检查是否需要生成总结
      let generatedSummary: string | undefined
      if (this.shouldGenerateSummary()) {
        generatedSummary = await this.generateSessionSummary()
      }

      // 5. 更新进度跟踪
      await this.updateProgressTracking(tokenEstimation, warnings)

      // 6. 准备结果
      const result: ContextMonitorResult = {
        tokenEstimation,
        tokenHistory: this.getRecentTokenHistory(20),
        warnings,
        recommendations,
        generatedSummary
      }

      this.logger.debug(`上下文监控完成，使用率: ${(tokenEstimation.utilization * 100).toFixed(1)}%`)

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
    this.logger.startTask('清理上下文监控资源')

    try {
      // 保存历史记录
      await this.saveTokenHistory()

      // 生成最终报告
      await this.generateFinalReport()

      // 清理内存
      this.tokenHistory = []
      this.warningTriggered = false
      this.messageCount = 0

      this.logger.completeTask('清理上下文监控资源')
    } catch (error) {
      this.logger.error(`清理资源失败: ${error}`)
      throw error
    }
  }

  /**
   * 记录token使用
   */
  private recordTokenUsage(estimation: TokenEstimation, messageCount: number, model: string): TokenUsageRecord {
    const record: TokenUsageRecord = {
      timestamp: new Date(),
      inputTokens: estimation.inputTokens,
      outputTokens: estimation.outputTokens,
      totalTokens: estimation.totalTokens,
      utilization: estimation.utilization,
      messageCount,
      sessionId: this.sessionId,
      metadata: {
        model,
        exceedsWarningThreshold: estimation.exceedsWarningThreshold,
        recommendedMaxTokens: estimation.recommendedMaxTokens
      }
    }

    this.tokenHistory.push(record)
    this.messageCount++

    // 限制历史记录数量
    const maxRecords = this.getConfig().maxHistoryRecords || 100
    if (this.tokenHistory.length > maxRecords) {
      this.tokenHistory = this.tokenHistory.slice(-maxRecords)
    }

    this.logger.debug(`记录token使用: ${record.totalTokens} tokens (${(record.utilization * 100).toFixed(1)}%)`)

    // 触发事件
    this.recordProgress({
      action: 'feature_started',
      description: `Token使用记录: ${record.totalTokens} tokens`,
      details: record
    })

    return record
  }

  /**
   * 处理警告阈值
   */
  private async handleWarningThreshold(estimation: TokenEstimation, model: string): Promise<{
    warnings: string[]
    recommendations: string[]
  }> {
    const warnings: string[] = []
    const recommendations: string[] = []

    const percentage = (estimation.utilization * 100).toFixed(1)
    const modelLimit = TokenCounter.getModelContextLimit(model)

    // 生成警告消息
    const warningMessage = this.formatWarningMessage(estimation, modelLimit)
    warnings.push(warningMessage)

    // 生成建议
    recommendations.push(...this.generateRecommendations(estimation, model))

    // 记录到进度文件
    await this.recordProgress({
      action: 'error_occurred',
      description: '上下文长度接近限制',
      details: {
        warning: warningMessage,
        recommendations,
        estimation,
        model
      }
    })

    // 输出警告
    this.logger.warn(warningMessage)
    this.logger.info('建议操作：')
    recommendations.forEach(rec => {
      this.logger.item('•', rec)
    })

    return { warnings, recommendations }
  }

  /**
   * 格式化警告消息
   */
  private formatWarningMessage(estimation: TokenEstimation, modelLimit: number): string {
    const percentage = (estimation.utilization * 100).toFixed(1)
    return `⚠️  上下文使用率 ${percentage}% (${estimation.totalTokens}/${modelLimit} tokens)`
  }

  /**
   * 生成建议
   */
  private generateRecommendations(estimation: TokenEstimation, model: string): string[] {
    const recommendations: string[] = []

    if (estimation.utilization >= 1.0) {
      recommendations.push('立即开启新会话：已超过模型限制')
    } else if (estimation.utilization >= 0.9) {
      recommendations.push('强烈建议开启新会话：接近模型限制')
    } else if (estimation.utilization >= this.getWarningThreshold()) {
      recommendations.push('建议开启新会话或压缩输入内容')
    }

    if (estimation.inputTokens > 100000) {
      recommendations.push('压缩代码：删除注释和空白行')
      recommendations.push('使用文件引用：替代粘贴完整代码')
    }

    if (estimation.outputTokens > 8192) {
      recommendations.push(`降低 max_tokens 参数：当前设置为 ${estimation.outputTokens}`)
    }

    // 添加通用建议
    recommendations.push(
      '让Claude总结当前进度，然后开启新会话继续',
      '考虑使用"继续开发"模式，而不是长对话'
    )

    return recommendations
  }

  /**
   * 检查是否需要生成总结
   */
  private shouldGenerateSummary(): boolean {
    const config = this.getConfig()

    if (!config.autoSummarize) {
      return false
    }

    const interval = config.summaryInterval || 10

    // 基于消息数量检查
    if (this.messageCount < interval) {
      return false
    }

    // 避免频繁总结（至少5分钟间隔）
    const now = Date.now()
    if (now - this.lastSummaryTime < 5 * 60 * 1000) {
      return false
    }

    // 检查token使用是否值得总结
    const recentRecords = this.getRecentTokenHistory(interval)
    const avgUtilization = recentRecords.reduce((sum, r) => sum + r.utilization, 0) / recentRecords.length

    return avgUtilization > 0.3 // 只有使用率超过30%才总结
  }

  /**
   * 生成会话总结
   */
  private async generateSessionSummary(): Promise<string> {
    this.logger.startTask('生成会话总结')

    try {
      const summary = {
        timestamp: new Date(),
        sessionId: this.sessionId,
        tokenStatistics: this.calculateTokenStatistics(),
        keyTopics: await this.extractKeyTopics(),
        recommendations: this.generateSummaryRecommendations()
      }

      const summaryText = JSON.stringify(summary, null, 2)

      // 记录总结
      await this.recordProgress({
        action: 'feature_completed',
        description: '自动生成会话总结',
        details: summary
      })

      this.lastSummaryTime = Date.now()
      this.messageCount = 0 // 重置消息计数

      this.logger.completeTask('生成会话总结')
      this.logger.info('📋 会话总结已生成')

      return summaryText

    } catch (error) {
      this.logger.error(`生成会话总结失败: ${error}`)
      return `总结生成失败: ${error}`
    }
  }

  /**
   * 计算token统计
   */
  private calculateTokenStatistics() {
    if (this.tokenHistory.length === 0) {
      return {
        totalTokens: 0,
        averageTokens: 0,
        peakTokens: 0,
        averageUtilization: 0
      }
    }

    const total = this.tokenHistory.reduce((sum, r) => sum + r.totalTokens, 0)
    const average = total / this.tokenHistory.length
    const peak = Math.max(...this.tokenHistory.map(r => r.totalTokens))
    const avgUtilization = this.tokenHistory.reduce((sum, r) => sum + r.utilization, 0) / this.tokenHistory.length

    return {
      totalTokens: total,
      averageTokens: Math.round(average),
      peakTokens: peak,
      averageUtilization: avgUtilization
    }
  }

  /**
   * 提取关键主题（简单实现）
   */
  private async extractKeyTopics(): Promise<string[]> {
    // 在实际实现中，这里可以分析消息内容提取主题
    // 当前返回示例主题
    const topics = new Set<string>()

    // 基于token使用模式猜测主题
    const recentRecords = this.getRecentTokenHistory(10)
    const avgInputTokens = recentRecords.reduce((sum, r) => sum + r.inputTokens, 0) / recentRecords.length

    if (avgInputTokens > 5000) {
      topics.add('代码实现')
    }

    if (recentRecords.some(r => r.utilization > 0.5)) {
      topics.add('复杂问题讨论')
    }

    return Array.from(topics)
  }

  /**
   * 生成总结建议
   */
  private generateSummaryRecommendations(): string[] {
    const stats = this.calculateTokenStatistics()
    const recommendations: string[] = []

    if (stats.averageUtilization > 0.6) {
      recommendations.push('优化token使用：考虑压缩输入内容')
    }

    if (this.tokenHistory.length > 30) {
      recommendations.push('考虑更频繁的会话切换')
    }

    if (stats.peakTokens > 100000) {
      recommendations.push('避免单个请求过大，拆分任务')
    }

    return recommendations
  }

  /**
   * 更新进度跟踪
   */
  private async updateProgressTracking(estimation: TokenEstimation, warnings: string[]): Promise<void> {
    // 这里可以集成到进度跟踪器
    // 暂时记录日志
    if (warnings.length > 0) {
      this.logger.warn(`进度跟踪：发现 ${warnings.length} 个警告`)
    }

    // 记录到智能体进度
    this.recordProgress({
      action: 'feature_started',
      description: `上下文监控更新，使用率: ${(estimation.utilization * 100).toFixed(1)}%`,
      details: {
        utilization: estimation.utilization,
        inputTokens: estimation.inputTokens,
        outputTokens: estimation.outputTokens,
        warnings: warnings.length
      }
    })
  }

  /**
   * 生成最终报告
   */
  private async generateFinalReport(): Promise<void> {
    if (this.tokenHistory.length === 0) {
      return
    }

    const stats = this.calculateTokenStatistics()
    const report = {
      sessionId: this.sessionId,
      sessionStartTime: this.tokenHistory[0].timestamp,
      sessionEndTime: new Date(),
      durationMs: Date.now() - this.tokenHistory[0].timestamp.getTime(),
      totalMessages: this.messageCount,
      tokenStatistics: stats,
      warningsTriggered: this.warningTriggered ? 1 : 0,
      summariesGenerated: this.lastSummaryTime > 0 ? 1 : 0
    }

    this.logger.title('📊 上下文监控最终报告')
    this.logger.item('会话ID', report.sessionId)
    this.logger.item('持续时间', `${report.durationMs}ms`)
    this.logger.item('消息数量', `${report.totalMessages}`)
    this.logger.item('总token使用', `${stats.totalTokens}`)
    this.logger.item('峰值使用', `${stats.peakTokens}`)
    this.logger.item('平均使用率', `${(stats.averageUtilization * 100).toFixed(1)}%`)
    this.logger.item('警告触发', `${report.warningsTriggered} 次`)
    this.logger.item('总结生成', `${report.summariesGenerated} 次`)

    // 记录到进度文件
    await this.recordProgress({
      action: 'feature_completed',
      description: '上下文监控最终报告',
      details: report
    })
  }

  /**
   * 获取最近的token历史
   */
  private getRecentTokenHistory(limit: number): TokenUsageRecord[] {
    return this.tokenHistory.slice(-limit)
  }

  /**
   * 获取配置
   */
  private getConfig(): ContextMonitorConfig {
    // 从上下文配置中获取，或使用默认值
    const contextConfig = this.context.config.agent?.contextMonitoring || {}

    return {
      enabled: contextConfig.enabled ?? true,
      warningThreshold: contextConfig.warningThreshold ?? 0.8,
      autoSummarize: contextConfig.autoSummarize ?? true,
      summaryInterval: contextConfig.summaryInterval ?? 10,
      maxHistoryRecords: 100,
      model: this.context.config.agent?.model || 'claude-3-5-sonnet',
      ...contextConfig
    }
  }

  /**
   * 获取警告阈值
   */
  private getWarningThreshold(): number {
    return this.getConfig().warningThreshold || 0.8
  }

  /**
   * 生成会话ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 加载token历史记录（占位符）
   */
  private async loadTokenHistory(): Promise<void> {
    // 在实际实现中，可以从文件或数据库加载历史记录
    this.tokenHistory = []
    this.logger.debug('Token历史记录加载完成（空）')
  }

  /**
   * 保存token历史记录（占位符）
   */
  private async saveTokenHistory(): Promise<void> {
    // 在实际实现中，可以保存到文件或数据库
    this.logger.debug(`保存Token历史记录: ${this.tokenHistory.length} 条记录`)
  }

  /**
   * 获取当前token历史
   */
  public getTokenHistory(): TokenUsageRecord[] {
    return [...this.tokenHistory]
  }

  /**
   * 获取当前会话ID
   */
  public getSessionId(): string {
    return this.sessionId
  }

  /**
   * 重置监控状态（开始新会话）
   */
  public resetMonitoring(): void {
    this.tokenHistory = []
    this.warningTriggered = false
    this.lastSummaryTime = 0
    this.messageCount = 0
    this.sessionId = this.generateSessionId()

    this.logger.info('监控状态已重置，开始新会话')
  }
}

/**
 * 创建上下文监控智能体工厂
 */
export function createContextMonitorAgent(context: AgentContext, config?: ContextMonitorConfig): ContextMonitorAgent {
  return new ContextMonitorAgent(context, config)
}

// 默认导出
export default {
  ContextMonitorAgent,
  createContextMonitorAgent
}