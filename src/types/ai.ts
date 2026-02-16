/**
 * AI服务类型定义
 * 设计思路：提供统一的AI服务接口，支持多提供商和模型切换
 */

import { AIModel, AIProvider, AIConfig } from './config.js'

// AI消息角色定义
export type AIRole = 'system' | 'user' | 'assistant'

// AI消息定义
export interface AIMessage {
  role: AIRole
  content: string
  name?: string
  files?: Array<{
    name: string
    content: string
    language: string
    size: number
  }>
}

// AI聊天参数
export interface AIChatParams {
  messages: AIMessage[]
  model?: AIModel
  provider?: AIProvider
  temperature?: number
  maxTokens?: number
  stream?: boolean
  projectId?: string
  sessionId?: string
}

// AI响应
export interface AIResponse {
  content: string
  model: AIModel
  provider: AIProvider
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost?: number
  }
  finishReason?: string
}

// 流式响应chunk
export interface AIStreamChunk {
  type: 'text' | 'function_call' | 'tool_use'
  content: string
  delta?: string
  index?: number
}

// AI错误类型
export interface AIError {
  type: 'provider_error' | 'network_error' | 'rate_limit' | 'authentication' | 'configuration'
  message: string
  provider: AIProvider
  model?: AIModel
  retryable: boolean
  originalError?: any
}

// 成本估算参数
export interface CostEstimationParams {
  provider: AIProvider
  model: AIModel
  promptTokens: number
  completionTokens: number
  stream?: boolean
}

// 成本估算结果
export interface CostEstimate {
  provider: AIProvider
  model: AIModel
  promptCost: number
  completionCost: number
  totalCost: number
  currency: string
  perMillionTokens: {
    prompt: number
    completion: number
  }
}

// 使用统计
export interface UsageStats {
  period: {
    start: Date
    end: Date
  }
  totalCost: number
  currency: string
  byProvider: Record<AIProvider, {
    cost: number
    tokens: {
      prompt: number
      completion: number
      total: number
    }
    requests: number
  }>
  byModel: Record<AIModel, {
    cost: number
    tokens: {
      prompt: number
      completion: number
      total: number
    }
    requests: number
  }>
}

// 验证结果
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  provider: AIProvider
  model?: AIModel
}

// AI服务接口
export interface IAIService {
  // 消息处理
  sendMessage(params: AIChatParams): Promise<AIResponse>
  streamMessage(params: AIChatParams): AsyncIterable<AIStreamChunk>

  // 配置管理
  getAvailableModels(provider?: AIProvider): Promise<AIModel[]>
  validateConfig(config: AIConfig): Promise<ValidationResult>
  setActiveProvider(provider: AIProvider): void
  getActiveProvider(): AIProvider

  // 使用统计
  getUsageStats(startDate?: Date, endDate?: Date): Promise<UsageStats>
  estimateCost(params: CostEstimationParams): Promise<CostEstimate>
  resetUsageStats(): void

  // 提供商管理
  getProviders(): AIProvider[]
  enableProvider(provider: AIProvider): boolean
  disableProvider(provider: AIProvider): boolean
  testProviderConnection(provider: AIProvider): Promise<ValidationResult>
}

// 提供商适配器基类接口
export interface BaseAIAdapter {
  provider: AIProvider
  sendMessage(params: AIChatParams): Promise<AIResponse>
  streamMessage(params: AIChatParams): AsyncIterable<AIStreamChunk>
  getModels(): Promise<AIModel[]>
  validateConfig(): Promise<ValidationResult>
  estimateCost(params: CostEstimationParams): Promise<CostEstimate>
  testConnection(): Promise<ValidationResult>
}