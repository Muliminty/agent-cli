/**
 * Token估算器模块
 * 设计思路：基于经验规则估算文本token数量，避免调用额外API，提供上下文使用率监控
 *
 * 功能特点：
 * 1. 基于内容类型的token估算（英文、中文、代码、Markdown）
 * 2. 复杂度因子计算（JSON、长行、特殊字符额外开销）
 * 3. AI请求总token数估算（输入+输出）
 * 4. 上下文使用率计算和阈值预警
 * 5. 支持多模型上下文限制
 */

// 内容类型定义
export type ContentType = 'english' | 'chinese' | 'code' | 'markdown' | 'mixed'

// Token估算结果接口
export interface TokenEstimation {
  /** 输入token数 */
  inputTokens: number
  /** 输出token数（预计） */
  outputTokens: number
  /** 总token数（输入+输出） */
  totalTokens: number
  /** 上下文使用率（0-1） */
  utilization: number
  /** 是否超过警告阈值 */
  exceedsWarningThreshold: boolean
  /** 建议的最大输出token数 */
  recommendedMaxTokens: number
}

// AI消息接口（模拟Anthropic API格式）
export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// 模型上下文限制配置
export interface ModelContextLimits {
  [model: string]: number
}

/**
 * 基于经验规则的token估算器
 */
export class TokenCounter {
  // 经验系数：不同内容类型的字符-token比例
  private static readonly CHARS_PER_TOKEN: Record<ContentType, number> = {
    english: 4.0,    // 英文 ~4 chars/token
    chinese: 2.0,    // 中文 ~2 chars/token
    code: 5.0,       // 代码 ~5 chars/token（更多特殊字符）
    markdown: 6.0,   // Markdown ~6 chars/token（格式化字符多）
    mixed: 4.0       // 混合内容 ~4 chars/token
  }

  // 常见AI模型上下文限制（单位：tokens）
  private static readonly MODEL_CONTEXT_LIMITS: ModelContextLimits = {
    'claude-3-5-sonnet': 131072,
    'claude-3-opus': 131072,
    'claude-3-haiku': 131072,
    'gpt-4': 128000,
    'gpt-4-turbo': 128000,
    'gpt-3.5-turbo': 16385,
    'claude-2': 100000,
    'claude-instant': 100000,
    'default': 131072  // 默认使用Claude的限制
  }

  // 默认警告阈值（80%）
  private static readonly DEFAULT_WARNING_THRESHOLD = 0.8

  /**
   * 估算单段文本的token数
   * @param text 输入文本
   * @param contentType 内容类型（自动检测或手动指定）
   * @returns 估算的token数
   */
  static estimateTokens(text: string, contentType?: ContentType): number {
    if (!text || text.trim().length === 0) {
      return 0
    }

    // 检测内容类型（如果未指定）
    const detectedType = contentType || this.detectContentType(text)

    // 基础估算：字符数 / 字符-token比例
    const charCount = text.length
    const charsPerToken = this.CHARS_PER_TOKEN[detectedType]
    const baseTokens = Math.ceil(charCount / charsPerToken)

    // 计算复杂度因子
    const complexityFactor = this.calculateComplexityFactor(text, detectedType)

    // 最终token数 = 基础token数 × 复杂度因子
    const finalTokens = Math.ceil(baseTokens * complexityFactor)

    return finalTokens
  }

  /**
   * 估算AI请求的总token数
   * @param messages 消息数组
   * @param maxTokens 预期生成的最大token数
   * @param model AI模型名称（用于确定上下文限制）
   * @param warningThreshold 警告阈值（0-1）
   * @returns 完整的token估算结果
   */
  static estimateRequestTokens(
    messages: AIMessage[],
    maxTokens: number = 4096,
    model: string = 'claude-3-5-sonnet',
    warningThreshold: number = this.DEFAULT_WARNING_THRESHOLD
  ): TokenEstimation {
    // 估算输入token数
    const inputTokens = messages.reduce((total, message) => {
      return total + this.estimateTokens(message.content, this.detectContentType(message.content))
    }, 0)

    // 获取模型上下文限制
    const contextLimit = this.MODEL_CONTEXT_LIMITS[model] || this.MODEL_CONTEXT_LIMITS.default

    // 计算总token数
    const totalTokens = inputTokens + maxTokens

    // 计算使用率
    const utilization = totalTokens / contextLimit

    // 检查是否超过警告阈值
    const exceedsWarningThreshold = utilization >= warningThreshold

    // 计算推荐的最大输出token数（保持在阈值内）
    const recommendedMaxTokens = Math.max(
      1024, // 最小1024 tokens
      Math.floor((contextLimit * warningThreshold) - inputTokens)
    )

    return {
      inputTokens,
      outputTokens: maxTokens,
      totalTokens,
      utilization,
      exceedsWarningThreshold,
      recommendedMaxTokens
    }
  }

  /**
   * 检测文本内容类型
   * @param text 输入文本
   * @returns 检测到的内容类型
   */
  static detectContentType(text: string): ContentType {
    // 空文本视为英文（默认）
    if (!text || text.trim().length === 0) {
      return 'english'
    }

    const trimmedText = text.trim()

    // 检测中文内容
    const chineseCharCount = (trimmedText.match(/[\u4e00-\u9fa5]/g) || []).length
    const totalCharCount = trimmedText.length
    const chineseRatio = chineseCharCount / totalCharCount

    if (chineseRatio > 0.3) {
      return 'chinese'
    }

    // 检测代码内容
    const hasCodeBlocks = /```[\s\S]*?```/.test(trimmedText)
    const hasCodeKeywords = /\b(function|class|import|export|const|let|var|if|for|while|return|def|async|await)\b/.test(trimmedText)
    const hasCodeSyntax = /[{}();=<>[\]]/.test(trimmedText) && trimmedText.includes('\n')

    if (hasCodeBlocks || (hasCodeKeywords && hasCodeSyntax)) {
      return 'code'
    }

    // 检测Markdown内容
    const hasMarkdownHeaders = /^#+\s+.+$/m.test(trimmedText)
    const hasMarkdownLists = /^[\s]*[-*+]\s+.+$/m.test(trimmedText)
    const hasMarkdownTables = /\|.*\|/.test(trimmedText)

    if (hasMarkdownHeaders || hasMarkdownLists || hasMarkdownTables) {
      return 'markdown'
    }

    // 默认视为英文
    return 'english'
  }

  /**
   * 计算文本复杂度因子
   * @param text 输入文本
   * @param contentType 内容类型
   * @returns 复杂度因子（1.0-1.5）
   */
  private static calculateComplexityFactor(text: string, contentType: ContentType): number {
    let factor = 1.0

    // 1. JSON/结构化数据额外开销
    const jsonLikePatterns = [
      /\{.*:.*\}/,          // 简单对象
      /\[.*\]/,             // 数组
      /".*":\s*".*"/,       // 键值对
      /".*":\s*[\d.]+/,     // 数字值
      /".*":\s*(true|false|null)/ // 布尔/null值
    ]

    const jsonMatches = jsonLikePatterns.filter(pattern => pattern.test(text)).length
    if (jsonMatches > 0) {
      factor += 0.15 * (jsonMatches / 5) // 最多增加15%
    }

    // 2. 长行额外开销（超过80字符的行）
    const lines = text.split('\n')
    const longLines = lines.filter(line => line.length > 80).length
    if (longLines > 0) {
      factor += 0.1 * (longLines / lines.length) // 最多增加10%
    }

    // 3. 特殊字符额外开销
    const specialChars = (text.match(/[{}[\];(),]/g) || []).length
    if (specialChars > 0) {
      factor += 0.05 * Math.min(specialChars / 100, 1) // 最多增加5%
    }

    // 4. 高信息密度内容（代码）额外开销
    if (contentType === 'code') {
      // 代码通常更紧凑，但语法结构更复杂
      const codeKeywords = (text.match(/\b(function|class|import|export|const|let|var|if|for|while|return|def)\b/g) || []).length
      factor += 0.1 * Math.min(codeKeywords / 20, 1) // 最多增加10%
    }

    // 限制复杂度因子在1.0-1.5之间
    return Math.max(1.0, Math.min(factor, 1.5))
  }

  /**
   * 获取模型上下文限制
   * @param model AI模型名称
   * @returns 模型的上下文限制（tokens）
   */
  static getModelContextLimit(model: string): number {
    return this.MODEL_CONTEXT_LIMITS[model] || this.MODEL_CONTEXT_LIMITS.default
  }

  /**
   * 计算安全的最大输出token数
   * @param inputTokens 输入token数
   * @param model AI模型名称
   * @param warningThreshold 警告阈值
   * @returns 安全的最大输出token数
   */
  static calculateSafeMaxTokens(
    inputTokens: number,
    model: string = 'claude-3-5-sonnet',
    warningThreshold: number = this.DEFAULT_WARNING_THRESHOLD
  ): number {
    const contextLimit = this.getModelContextLimit(model)
    const safeLimit = Math.floor(contextLimit * warningThreshold)
    const maxOutput = Math.max(1024, safeLimit - inputTokens)

    return Math.max(0, maxOutput) // 确保非负
  }

  /**
   * 检查文本是否可能超过上下文限制
   * @param text 文本内容
   * @param maxTokens 预期生成token数
   * @param model AI模型名称
   * @param warningThreshold 警告阈值
   * @returns 检查结果和警告信息
   */
  static checkContextLimit(
    text: string,
    maxTokens: number = 4096,
    model: string = 'claude-3-5-sonnet',
    warningThreshold: number = this.DEFAULT_WARNING_THRESHOLD
  ): {
    safe: boolean
    estimatedTokens: number
    utilization: number
    warning?: string
    recommendation?: string
  } {
    const estimatedTokens = this.estimateTokens(text)
    const totalTokens = estimatedTokens + maxTokens
    const contextLimit = this.getModelContextLimit(model)
    const utilization = totalTokens / contextLimit

    const safe = utilization < warningThreshold

    let warning: string | undefined
    let recommendation: string | undefined

    if (!safe) {
      const percentage = (utilization * 100).toFixed(1)
      warning = `⚠️  估算使用率 ${percentage}% (${totalTokens}/${contextLimit} tokens)`

      if (utilization >= 1.0) {
        recommendation = '立即开启新会话：已超过模型限制'
      } else if (utilization >= 0.9) {
        recommendation = '强烈建议开启新会话：接近模型限制'
      } else if (utilization >= warningThreshold) {
        recommendation = '建议：开启新会话或压缩输入内容'
      }
    }

    return {
      safe,
      estimatedTokens,
      utilization,
      warning,
      recommendation
    }
  }

  /**
   * 快速估算工具函数（简化接口）
   * @param text 文本内容
   * @param contentType 内容类型
   * @returns 快速估算结果
   */
  static quickEstimate(text: string, contentType?: ContentType): {
    tokens: number
    type: ContentType
    charsPerToken: number
  } {
    const type = contentType || this.detectContentType(text)
    const tokens = this.estimateTokens(text, type)

    return {
      tokens,
      type,
      charsPerToken: this.CHARS_PER_TOKEN[type]
    }
  }

  /**
   * 批量估算消息token数
   * @param messages 消息数组
   * @returns 每条消息的token数和总数
   */
  static batchEstimate(messages: AIMessage[]): {
    breakdown: Array<{ role: string; content: string; tokens: number; type: ContentType }>
    totalTokens: number
    averageTokens: number
  } {
    const breakdown = messages.map(message => {
      const type = this.detectContentType(message.content)
      const tokens = this.estimateTokens(message.content, type)

      return {
        role: message.role,
        content: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
        tokens,
        type
      }
    })

    const totalTokens = breakdown.reduce((sum, item) => sum + item.tokens, 0)
    const averageTokens = messages.length > 0 ? totalTokens / messages.length : 0

    return {
      breakdown,
      totalTokens,
      averageTokens
    }
  }
}

/**
 * 创建TokenCounter实例（兼容性接口）
 */
export function createTokenCounter() {
  return TokenCounter
}

/**
 * 获取默认TokenCounter实例
 */
export function getTokenCounter() {
  return TokenCounter
}

// 默认导出
export default {
  TokenCounter,
  createTokenCounter,
  getTokenCounter
}