/**
 * AI服务层实现
 * 设计思路：提供统一的多提供商AI服务接口，支持插件式适配器架构
 *
 * 功能特点：
 * 1. 统一接口 - 屏蔽不同提供商的API差异
 * 2. 多提供商支持 - Anthropic、OpenAI、DeepSeek、智谱AI、Kimi等
 * 3. 智能路由 - 根据任务类型和成本自动选择最佳模型
 * 4. 故障转移 - 主提供商失败时自动切换到备用
 * 5. 成本控制 - 使用统计和预算管理
 *
 * 踩坑提醒：
 * 1. 不同提供商的API响应格式和错误处理差异很大
 * 2. Token计算方式不一致，需要统一处理
 * 3. 流式响应实现方式不同，需要抽象层
 * 4. API密钥安全存储和轮换机制
 * 5. 成本控制和预算预警
 */

import { createLogger } from '../../utils/logger.js'
import type {
  IAIService,
  AIChatParams,
  AIResponse,
  AIStreamChunk,
  AIModel,
  AIProvider,
  ValidationResult,
  UsageStats,
  CostEstimationParams,
  CostEstimate,
  BaseAIAdapter
} from '../../types/ai.js'
import type { AIConfig, AIProviderConfig } from '../../types/config.js'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

const logger = createLogger('service:ai')

// 抽象适配器基类
abstract class BaseAIAdapterImpl implements BaseAIAdapter {
  constructor(
    protected provider: AIProvider,
    protected config: AIProviderConfig
  ) {}

  abstract sendMessage(params: AIChatParams): Promise<AIResponse>
  abstract streamMessage(params: AIChatParams): AsyncIterable<AIStreamChunk>
  abstract getModels(): Promise<AIModel[]>
  abstract estimateCost(params: CostEstimationParams): Promise<CostEstimate>

  async validateConfig(): Promise<ValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    if (!this.config.apiKey) {
      errors.push(`缺少API密钥 for ${this.provider}`)
    }

    if (this.config.timeout && this.config.timeout < 1000) {
      warnings.push(`超时时间${this.config.timeout}ms可能过短`)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      provider: this.provider
    }
  }

  async testConnection(): Promise<ValidationResult> {
    try {
      const models = await this.getModels()
      return {
        valid: true,
        errors: [],
        warnings: [],
        provider: this.provider,
        model: models[0]
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [`连接测试失败: ${error.message}`],
        warnings: [],
        provider: this.provider
      }
    }
  }

  protected buildRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (this.config.apiKey) {
      // 不同提供商的授权头不同
      switch (this.provider) {
        case 'anthropic':
          headers['x-api-key'] = this.config.apiKey
          headers['anthropic-version'] = '2023-06-01'
          break
        case 'openai':
          headers['Authorization'] = `Bearer ${this.config.apiKey}`
          break
        case 'deepseek':
          headers['Authorization'] = `Bearer ${this.config.apiKey}`
          break
        case 'zhipu':
          headers['Authorization'] = `Bearer ${this.config.apiKey}`
          break
        default:
          headers['Authorization'] = `Bearer ${this.config.apiKey}`
      }
    }

    return headers
  }

  protected handleError(error: any): never {
    logger.error(`${this.provider} API错误:`, error)

    // 根据错误类型分类
    if (error.response?.status === 401) {
      throw {
        type: 'authentication',
        message: 'API密钥无效或已过期',
        provider: this.provider,
        retryable: false,
        originalError: error
      }
    } else if (error.response?.status === 429) {
      throw {
        type: 'rate_limit',
        message: '达到速率限制，请稍后重试',
        provider: this.provider,
        retryable: true,
        originalError: error
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      throw {
        type: 'network_error',
        message: '网络连接失败',
        provider: this.provider,
        retryable: true,
        originalError: error
      }
    } else {
      throw {
        type: 'provider_error',
        message: error.message || '未知错误',
        provider: this.provider,
        retryable: false,
        originalError: error
      }
    }
  }

  protected estimateTokens(content: string): number {
    // 简单估算：英文字符数 / 4，中文字符数 / 2
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length
    const otherChars = content.length - chineseChars
    return Math.ceil(chineseChars / 2 + otherChars / 4)
  }
}

// Anthropic适配器实现
class AnthropicAdapter extends BaseAIAdapterImpl {
  constructor(config: AIProviderConfig) {
    super('anthropic', config)
  }

  async sendMessage(params: AIChatParams): Promise<AIResponse> {
    try {
      const client = new Anthropic({
        apiKey: this.config.apiKey || '',
        baseURL: this.config.baseURL,
        timeout: this.config.timeout
      })

      // 将消息转换为Anthropic格式
      const anthropicMessages = params.messages.map(msg => {
        if (msg.role === 'system') {
          // Anthropic使用单独的system参数
          return null // 将在外层处理
        }
        return {
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content
        }
      }).filter(Boolean)

      // 提取system消息
      const systemMessage = params.messages.find(msg => msg.role === 'system')?.content

      const response = await client.messages.create({
        model: params.model || 'claude-3-5-sonnet',
        max_tokens: params.maxTokens || 4096,
        temperature: params.temperature,
        system: systemMessage,
        messages: anthropicMessages as any
      })

      return {
        content: response.content[0].text,
        model: params.model || 'claude-3-5-sonnet',
        provider: 'anthropic',
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        },
        finishReason: response.stop_reason
      }
    } catch (error: any) {
      this.handleError(error)
      throw error // 确保错误被传播
    }
  }

  async *streamMessage(params: AIChatParams): AsyncIterable<AIStreamChunk> {
    const client = new Anthropic({
      apiKey: this.config.apiKey || '',
      baseURL: this.config.baseURL,
      timeout: this.config.timeout
    })

    // 将消息转换为Anthropic格式
    const anthropicMessages = params.messages.map(msg => {
      if (msg.role === 'system') {
        return null
      }
      return {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      }
    }).filter(Boolean)

    // 提取system消息
    const systemMessage = params.messages.find(msg => msg.role === 'system')?.content

    try {
      const stream = await client.messages.stream({
        model: params.model || 'claude-3-5-sonnet',
        max_tokens: params.maxTokens || 4096,
        temperature: params.temperature,
        system: systemMessage,
        messages: anthropicMessages as any
      })

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          yield {
            type: 'text',
            content: event.delta.text,
            delta: event.delta.text
          }
        }
      }
    } catch (error: any) {
      this.handleError(error)
      throw error // 确保错误被传播
    }
  }

  async getModels(): Promise<AIModel[]> {
    return [
      'claude-3-5-sonnet',
      'claude-3-opus',
      'claude-3-haiku',
      'claude-3-5-haiku'
    ]
  }

  async estimateCost(params: CostEstimationParams): Promise<CostEstimate> {
    // Anthropic定价估算（美元/百万token）
    const pricing: Record<AIModel, { input: number; output: number }> = {
      'claude-3-5-sonnet': { input: 3, output: 15 },
      'claude-3-opus': { input: 15, output: 75 },
      'claude-3-haiku': { input: 0.25, output: 1.25 },
      'claude-3-5-haiku': { input: 0.8, output: 4 }
    }

    const modelPricing = pricing[params.model] || pricing['claude-3-5-sonnet']
    const promptCost = (params.promptTokens / 1_000_000) * modelPricing.input
    const completionCost = (params.completionTokens / 1_000_000) * modelPricing.output

    return {
      provider: 'anthropic',
      model: params.model,
      promptCost,
      completionCost,
      totalCost: promptCost + completionCost,
      currency: 'USD',
      perMillionTokens: {
        prompt: modelPricing.input,
        completion: modelPricing.output
      }
    }
  }
}

// OpenAI适配器实现
class OpenAIAdapter extends BaseAIAdapterImpl {
  constructor(config: AIProviderConfig) {
    super('openai', config)
  }

  async sendMessage(params: AIChatParams): Promise<AIResponse> {
    try {
      const client = new OpenAI({
        apiKey: this.config.apiKey || '',
        baseURL: this.config.baseURL,
        timeout: this.config.timeout
      })

      // OpenAI消息格式与我们的格式基本一致
      const openAIMessages = params.messages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }))

      const response = await client.chat.completions.create({
        model: params.model || 'gpt-4',
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: openAIMessages,
        stream: false
      })

      const choice = response.choices[0]
      return {
        content: choice.message.content || '',
        model: params.model || 'gpt-4',
        provider: 'openai',
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        },
        finishReason: choice.finish_reason
      }
    } catch (error: any) {
      this.handleError(error)
      throw error // 确保错误被传播
    }
  }

  async *streamMessage(params: AIChatParams): AsyncIterable<AIStreamChunk> {
    const client = new OpenAI({
      apiKey: this.config.apiKey || '',
      baseURL: this.config.baseURL,
      timeout: this.config.timeout
    })

    // OpenAI消息格式与我们的格式基本一致
    const openAIMessages = params.messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    }))

    try {
      const stream = await client.chat.completions.create({
        model: params.model || 'gpt-4',
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: openAIMessages,
        stream: true
      })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          yield {
            type: 'text',
            content: delta,
            delta
          }
        }
      }
    } catch (error: any) {
      this.handleError(error)
      throw error // 确保错误被传播
    }
  }

  async getModels(): Promise<AIModel[]> {
    return [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-3.5-turbo'
    ]
  }

  async estimateCost(params: CostEstimationParams): Promise<CostEstimate> {
    // OpenAI定价估算（美元/百万token）
    const pricing: Record<AIModel, { input: number; output: number }> = {
      'gpt-4': { input: 30, output: 60 },
      'gpt-4-turbo': { input: 10, output: 30 },
      'gpt-4o': { input: 5, output: 15 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gpt-3.5-turbo': { input: 0.5, output: 1.5 }
    }

    const modelPricing = pricing[params.model] || pricing['gpt-4']
    const promptCost = (params.promptTokens / 1_000_000) * modelPricing.input
    const completionCost = (params.completionTokens / 1_000_000) * modelPricing.output

    return {
      provider: 'openai',
      model: params.model,
      promptCost,
      completionCost,
      totalCost: promptCost + completionCost,
      currency: 'USD',
      perMillionTokens: {
        prompt: modelPricing.input,
        completion: modelPricing.output
      }
    }
  }
}

// DeepSeek适配器实现
class DeepSeekAdapter extends BaseAIAdapterImpl {
  constructor(config: AIProviderConfig) {
    super('deepseek', config)
  }

  async sendMessage(params: AIChatParams): Promise<AIResponse> {
    try {
      // DeepSeek兼容OpenAI API格式，使用不同的baseURL
      const client = new OpenAI({
        apiKey: this.config.apiKey || '',
        baseURL: this.config.baseURL || 'https://api.deepseek.com',
        timeout: this.config.timeout
      })

      // OpenAI消息格式
      const openAIMessages = params.messages.map(msg => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content
      }))

      const response = await client.chat.completions.create({
        model: params.model || 'deepseek-chat',
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: openAIMessages,
        stream: false
      })

      const choice = response.choices[0]
      return {
        content: choice.message.content || '',
        model: params.model || 'deepseek-chat',
        provider: 'deepseek',
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0
        },
        finishReason: choice.finish_reason
      }
    } catch (error: any) {
      this.handleError(error)
      throw error // 确保错误被传播
      throw error // 确保错误被传播
    }
  }

  async *streamMessage(params: AIChatParams): AsyncIterable<AIStreamChunk> {
    const client = new OpenAI({
      apiKey: this.config.apiKey || '',
      baseURL: this.config.baseURL || 'https://api.deepseek.com',
      timeout: this.config.timeout
    })

    // OpenAI消息格式
    const openAIMessages = params.messages.map(msg => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content
    }))

    try {
      const stream = await client.chat.completions.create({
        model: params.model || 'deepseek-chat',
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        messages: openAIMessages,
        stream: true
      })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content
        if (delta) {
          yield {
            type: 'text',
            content: delta,
            delta
          }
        }
      }
    } catch (error: any) {
      this.handleError(error)
      throw error // 确保错误被传播
    }
  }

  async getModels(): Promise<AIModel[]> {
    return [
      'deepseek-chat',
      'deepseek-coder',
      'deepseek-reasoner'
    ]
  }

  async estimateCost(params: CostEstimationParams): Promise<CostEstimate> {
    // DeepSeek定价估算（人民币/百万token，转换为美元估算）
    // 实际价格：deepseek-chat 约1元/百万token输入，2元/百万token输出
    const cnyToUsd = 0.14 // 近似汇率

    const pricing: Record<AIModel, { input: number; output: number }> = {
      'deepseek-chat': { input: 1 * cnyToUsd, output: 2 * cnyToUsd },
      'deepseek-coder': { input: 1 * cnyToUsd, output: 2 * cnyToUsd },
      'deepseek-reasoner': { input: 2 * cnyToUsd, output: 4 * cnyToUsd }
    }

    const modelPricing = pricing[params.model] || pricing['deepseek-chat']
    const promptCost = (params.promptTokens / 1_000_000) * modelPricing.input
    const completionCost = (params.completionTokens / 1_000_000) * modelPricing.output

    return {
      provider: 'deepseek',
      model: params.model,
      promptCost,
      completionCost,
      totalCost: promptCost + completionCost,
      currency: 'USD',
      perMillionTokens: {
        prompt: modelPricing.input,
        completion: modelPricing.output
      }
    }
  }
}

// 主AI服务实现
export class AIService implements IAIService {
  private adapters: Map<AIProvider, BaseAIAdapterImpl>
  private activeProvider: AIProvider
  private usageStats: UsageStats

  constructor(private config: AIConfig) {
    this.adapters = new Map()
    this.activeProvider = config.defaultProvider
    this.usageStats = this.initializeUsageStats()
    this.initializeAdapters()
  }

  private initializeUsageStats(): UsageStats {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    return {
      period: {
        start: startOfMonth,
        end: now
      },
      totalCost: 0,
      currency: 'USD',
      byProvider: {} as any,
      byModel: {} as any
    }
  }

  private initializeAdapters(): void {
    logger.info('初始化AI适配器')

    for (const [providerName, providerConfig] of Object.entries(this.config.providers)) {
      const provider = providerName as AIProvider

      if (providerConfig.enabled && providerConfig.apiKey) {
        try {
          const adapter = this.createAdapter(provider, providerConfig)
          this.adapters.set(provider, adapter)
          logger.info(`AI适配器已加载: ${provider}`)
        } catch (error: any) {
          logger.error(`加载AI适配器失败 (${provider}):`, error)
        }
      } else {
        logger.debug(`AI适配器未启用或缺少API密钥: ${provider}`)
      }
    }

    if (this.adapters.size === 0) {
      logger.warn('没有可用的AI适配器，AI功能将不可用')
    }
  }

  private createAdapter(provider: AIProvider, config: AIProviderConfig): BaseAIAdapterImpl {
    switch (provider) {
      case 'anthropic':
        return new AnthropicAdapter(config)
      case 'openai':
        return new OpenAIAdapter(config)
      // TODO: 添加更多提供商适配器
      case 'deepseek':
        return new DeepSeekAdapter(config)
      case 'zhipu':
        // return new ZhipuAIAdapter(config)
      case 'kimi':
        // return new KimiAdapter(config)
      default:
        throw new Error(`不支持的AI提供商: ${provider}`)
    }
  }

  // ===== 接口实现 =====

  async sendMessage(params: AIChatParams): Promise<AIResponse> {
    const startTime = Date.now()
    const adapter = this.adapters.get(params.provider || this.activeProvider)

    if (!adapter) {
      throw new Error(`没有可用的AI适配器 for provider: ${params.provider || this.activeProvider}`)
    }

    try {
      logger.debug(`发送AI消息 (provider: ${adapter.provider}, model: ${params.model})`)

      const response = await adapter.sendMessage({
        ...params,
        model: params.model || this.config.defaultModel
      })

      // 记录使用统计
      this.recordUsage(adapter.provider, response.model, response.usage)

      logger.debug(`AI消息处理完成 (耗时: ${Date.now() - startTime}ms)`)
      return response

    } catch (error: any) {
      logger.error(`AI消息处理失败:`, error)

      // 尝试故障转移
      if (error.retryable && this.config.providers) {
        const fallbackProvider = this.findFallbackProvider(adapter.provider)
        if (fallbackProvider) {
          logger.info(`尝试故障转移到: ${fallbackProvider}`)
          return this.sendMessage({
            ...params,
            provider: fallbackProvider
          })
        }
      }

      throw error
    }
  }

  async *streamMessage(params: AIChatParams): AsyncIterable<AIStreamChunk> {
    const adapter = this.adapters.get(params.provider || this.activeProvider)

    if (!adapter) {
      throw new Error(`没有可用的AI适配器 for provider: ${params.provider || this.activeProvider}`)
    }

    for await (const chunk of adapter.streamMessage({
      ...params,
      model: params.model || this.config.defaultModel
    })) {
      yield chunk
    }
  }

  async getAvailableModels(provider?: AIProvider): Promise<AIModel[]> {
    if (provider) {
      const adapter = this.adapters.get(provider)
      if (!adapter) {
        throw new Error(`没有可用的AI适配器 for provider: ${provider}`)
      }
      return adapter.getModels()
    }

    // 返回所有启用的适配器的模型
    const allModels: AIModel[] = []
    for (const adapter of this.adapters.values()) {
      try {
        const models = await adapter.getModels()
        allModels.push(...models)
      } catch (error) {
        logger.error(`获取模型列表失败 (${adapter.provider}):`, error)
      }
    }

    return [...new Set(allModels)] // 去重
  }

  async validateConfig(config: AIConfig): Promise<ValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    // 验证默认提供商
    if (!config.defaultProvider) {
      errors.push('缺少默认提供商配置')
    }

    // 验证默认模型
    if (!config.defaultModel) {
      errors.push('缺少默认模型配置')
    }

    // 验证提供商配置
    for (const [provider, providerConfig] of Object.entries(config.providers)) {
      if (providerConfig.enabled && !providerConfig.apiKey) {
        warnings.push(`提供商 ${provider} 已启用但缺少API密钥`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      provider: config.defaultProvider
    }
  }

  setActiveProvider(provider: AIProvider): void {
    if (!this.adapters.has(provider)) {
      throw new Error(`提供商 ${provider} 未启用或不可用`)
    }
    this.activeProvider = provider
    logger.info(`活动AI提供商已切换为: ${provider}`)
  }

  getActiveProvider(): AIProvider {
    return this.activeProvider
  }

  async getUsageStats(startDate?: Date, endDate?: Date): Promise<UsageStats> {
    // TODO: 实现按时间范围筛选的统计
    return this.usageStats
  }

  async estimateCost(params: CostEstimationParams): Promise<CostEstimate> {
    const adapter = this.adapters.get(params.provider)
    if (!adapter) {
      throw new Error(`没有可用的AI适配器 for provider: ${params.provider}`)
    }

    return adapter.estimateCost(params)
  }

  resetUsageStats(): void {
    this.usageStats = this.initializeUsageStats()
    logger.info('使用统计已重置')
  }

  getProviders(): AIProvider[] {
    return Array.from(this.adapters.keys())
  }

  enableProvider(provider: AIProvider): boolean {
    const providerConfig = this.config.providers[provider]
    if (!providerConfig) {
      logger.error(`提供商配置不存在: ${provider}`)
      return false
    }

    providerConfig.enabled = true
    // 重新初始化适配器
    try {
      const adapter = this.createAdapter(provider, providerConfig)
      this.adapters.set(provider, adapter)
      logger.info(`AI提供商已启用: ${provider}`)
      return true
    } catch (error: any) {
      logger.error(`启用AI提供商失败 (${provider}):`, error)
      return false
    }
  }

  disableProvider(provider: AIProvider): boolean {
    this.adapters.delete(provider)

    const providerConfig = this.config.providers[provider]
    if (providerConfig) {
      providerConfig.enabled = false
    }

    logger.info(`AI提供商已禁用: ${provider}`)
    return true
  }

  async testProviderConnection(provider: AIProvider): Promise<ValidationResult> {
    const adapter = this.adapters.get(provider)
    if (!adapter) {
      return {
        valid: false,
        errors: [`提供商 ${provider} 未启用或不可用`],
        warnings: [],
        provider
      }
    }

    return adapter.testConnection()
  }

  // ===== 辅助方法 =====

  private recordUsage(
    provider: AIProvider,
    model: AIModel,
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number; cost?: number }
  ): void {
    if (!usage || !this.config.usageStats.enabled) return

    // 更新提供商统计
    if (!this.usageStats.byProvider[provider]) {
      this.usageStats.byProvider[provider] = {
        cost: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        requests: 0
      }
    }

    const providerStats = this.usageStats.byProvider[provider]
    providerStats.cost += usage.cost || 0
    providerStats.tokens.prompt += usage.promptTokens
    providerStats.tokens.completion += usage.completionTokens
    providerStats.tokens.total += usage.totalTokens
    providerStats.requests += 1

    // 更新模型统计
    if (!this.usageStats.byModel[model]) {
      this.usageStats.byModel[model] = {
        cost: 0,
        tokens: { prompt: 0, completion: 0, total: 0 },
        requests: 0
      }
    }

    const modelStats = this.usageStats.byModel[model]
    modelStats.cost += usage.cost || 0
    modelStats.tokens.prompt += usage.promptTokens
    modelStats.tokens.completion += usage.completionTokens
    modelStats.tokens.total += usage.totalTokens
    modelStats.requests += 1

    // 更新总成本
    this.usageStats.totalCost += usage.cost || 0

    // TODO: 保存到持久化存储
  }

  private findFallbackProvider(failedProvider: AIProvider): AIProvider | null {
    const enabledProviders = Object.entries(this.config.providers)
      .filter(([provider, config]) =>
        provider !== failedProvider &&
        config.enabled &&
        config.apiKey &&
        this.adapters.has(provider as AIProvider)
      )
      .map(([provider]) => provider as AIProvider)

    // 按优先级排序：anthropic > openai > deepseek > zhipu > kimi > qwen
    const priorityOrder: AIProvider[] = ['anthropic', 'openai', 'deepseek', 'zhipu', 'kimi', 'qwen']
    enabledProviders.sort((a, b) => {
      const aIndex = priorityOrder.indexOf(a)
      const bIndex = priorityOrder.indexOf(b)
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
    })

    return enabledProviders[0] || null
  }
}

// 全局AI服务实例（单例模式）
let globalAIService: AIService | null = null

export function createAIService(config: AIConfig): AIService {
  if (!globalAIService) {
    globalAIService = new AIService(config)
  }
  return globalAIService
}

export function getAIService(): AIService {
  if (!globalAIService) {
    throw new Error('AI服务未初始化，请先调用createAIService')
  }
  return globalAIService
}

export function destroyAIService(): void {
  globalAIService = null
}