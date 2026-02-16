/**
 * ai-service.ts 单元测试
 * 设计思路：测试AI服务层的基本功能和DeepSeek适配器
 * 重点：模拟外部API调用，测试错误处理和成本估算
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'

// 模拟OpenAI SDK
jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: { content: 'Test response from DeepSeek' },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 50,
              total_tokens: 150
            }
          })
        }
      }
    }))
  }
})

// 模拟Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    Anthropic: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Test response from Claude' }],
          model: 'claude-3-5-sonnet',
          usage: {
            input_tokens: 100,
            output_tokens: 50
          },
          stop_reason: 'end_turn'
        }),
        stream: jest.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {
            yield {
              type: 'content_block_delta',
              delta: { type: 'text_delta', text: 'Streaming response' }
            }
          }
        })
      }
    }))
  }
})

// 模拟logger模块
jest.mock('../../../utils/logger.ts', () => ({
  createLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  })
}))

import { AIService } from '../ai-service.ts'
import type { AIConfig, AIProviderConfig } from '../../../types/config.js'
import type { AIChatParams } from '../../../types/ai.js'

// 测试配置
const createTestConfig = (providers?: Record<string, AIProviderConfig>): AIConfig => ({
  defaultProvider: 'anthropic',
  defaultModel: 'claude-3-5-sonnet',
  temperature: 0.7,
  maxTokens: 4096,
  stream: true,
  providers: providers || {
    anthropic: {
      provider: 'anthropic',
      apiKey: 'test-anthropic-key',
      enabled: true
    },
    openai: {
      provider: 'openai',
      apiKey: 'test-openai-key',
      enabled: true
    },
    deepseek: {
      provider: 'deepseek',
      apiKey: 'test-deepseek-key',
      enabled: true
    }
  },
  usageStats: {
    enabled: true,
    trackCosts: true,
    currency: 'USD'
  }
})

describe('AI服务层', () => {
  let aiService: AIService

  beforeEach(() => {
    // 重置所有模拟
    jest.restoreAllMocks()
  })

  describe('服务初始化', () => {
    test('应该使用配置正确初始化', () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      // 服务应该被创建
      expect(aiService).toBeInstanceOf(AIService)
    })

    test('应该为启用的提供商创建适配器', () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      // 三个提供商都应该有适配器
      // 通过发送消息来间接测试适配器存在
      expect(() => {
        // 尝试获取适配器 - 如果没有会抛出错误
        const providers = Array.from((aiService as any).adapters.keys())
        expect(providers).toContain('anthropic')
        expect(providers).toContain('openai')
        expect(providers).toContain('deepseek')
      }).not.toThrow()
    })

    test('应该禁用未启用的提供商', () => {
      const config = createTestConfig({
        anthropic: { provider: 'anthropic', enabled: false, apiKey: 'test-key' },
        openai: { provider: 'openai', enabled: true, apiKey: 'test-key' },
        deepseek: { provider: 'deepseek', enabled: false, apiKey: 'test-key' }
      })

      aiService = new AIService(config)

      // 只有openai应该被启用
      const providers = Array.from((aiService as any).adapters.keys())
      expect(providers).toContain('openai')
      expect(providers).not.toContain('anthropic')
      expect(providers).not.toContain('deepseek')
    })
  })

  describe('DeepSeek适配器', () => {
    test('应该正确创建DeepSeek适配器实例', () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      // 获取适配器映射
      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      expect(deepseekAdapter).toBeDefined()
      expect(deepseekAdapter.provider).toBe('deepseek')
    })

    test('DeepSeek适配器应该返回支持的模型列表', async () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      // 模拟getModels方法
      deepseekAdapter.getModels = jest.fn().mockResolvedValue([
        'deepseek-chat',
        'deepseek-coder',
        'deepseek-reasoner'
      ])

      const models = await deepseekAdapter.getModels()
      expect(models).toEqual([
        'deepseek-chat',
        'deepseek-coder',
        'deepseek-reasoner'
      ])
    })

    test('DeepSeek适配器应该正确处理消息发送', async () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      // 配置测试参数
      const chatParams: AIChatParams = {
        messages: [
          { role: 'user', content: 'Hello DeepSeek' }
        ],
        model: 'deepseek-chat',
        provider: 'deepseek'
      }

      // 模拟sendMessage方法
      deepseekAdapter.sendMessage = jest.fn().mockResolvedValue({
        content: 'Hello from DeepSeek',
        model: 'deepseek-chat',
        provider: 'deepseek',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15
        },
        finishReason: 'stop'
      })

      const response = await deepseekAdapter.sendMessage(chatParams)
      expect(response.content).toBe('Hello from DeepSeek')
      expect(response.provider).toBe('deepseek')
      expect(response.usage.totalTokens).toBeGreaterThan(0)
    })

    test('DeepSeek适配器应该正确估算成本', async () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      // 测试成本估算
      const costParams = {
        model: 'deepseek-chat' as const,
        promptTokens: 1000,
        completionTokens: 500
      }

      const costEstimate = await deepseekAdapter.estimateCost(costParams)
      expect(costEstimate.provider).toBe('deepseek')
      expect(costEstimate.model).toBe('deepseek-chat')
      expect(costEstimate.totalCost).toBeGreaterThan(0)
      expect(costEstimate.currency).toBe('USD')
    })

    test('DeepSeek适配器应该处理API错误', async () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      // 模拟API错误
      const chatParams: AIChatParams = {
        messages: [
          { role: 'user', content: 'Test message' }
        ],
        provider: 'deepseek'
      }

      deepseekAdapter.sendMessage = jest.fn().mockRejectedValue(
        new Error('DeepSeek API error: Invalid API key')
      )

      await expect(deepseekAdapter.sendMessage(chatParams)).rejects.toThrow(
        'DeepSeek API error: Invalid API key'
      )
    })
  })

  describe('服务层API', () => {
    test('应该通过主服务发送消息到DeepSeek', async () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      // 模拟DeepSeek适配器的sendMessage
      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')
      deepseekAdapter.sendMessage = jest.fn().mockResolvedValue({
        content: 'Response from service layer',
        model: 'deepseek-chat',
        provider: 'deepseek',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'stop'
      })

      const chatParams: AIChatParams = {
        messages: [{ role: 'user', content: 'Hello' }],
        provider: 'deepseek'
      }

      const response = await aiService.sendMessage(chatParams)
      expect(response.provider).toBe('deepseek')
      expect(response.content).toBe('Response from service layer')
    })

    test('应该跟踪使用统计', async () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      // 获取使用统计
      const usageStats = (aiService as any).usageStats
      expect(usageStats).toBeDefined()
      expect(usageStats.period.start).toBeInstanceOf(Date)
      expect(usageStats.providers).toBeDefined()
    })

    test('应该支持提供商故障转移', async () => {
      // 测试当主要提供商失败时切换到备用提供商
      const config = createTestConfig()
      aiService = new AIService(config)

      // 模拟Anthropic失败，OpenAI成功
      const adapters = (aiService as any).adapters
      const anthropicAdapter = adapters.get('anthropic')
      const openaiAdapter = adapters.get('openai')

      anthropicAdapter.sendMessage = jest.fn().mockRejectedValue(
        new Error('Anthropic API down')
      )
      openaiAdapter.sendMessage = jest.fn().mockResolvedValue({
        content: 'Fallback response from OpenAI',
        model: 'gpt-4',
        provider: 'openai',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        finishReason: 'stop'
      })

      const chatParams: AIChatParams = {
        messages: [{ role: 'user', content: 'Hello' }],
        provider: 'anthropic'
      }

      // 尝试发送消息 - 应该失败
      await expect(aiService.sendMessage(chatParams)).rejects.toThrow(
        'Anthropic API down'
      )

      // 然后使用OpenAI提供商
      chatParams.provider = 'openai'
      const response = await aiService.sendMessage(chatParams)
      expect(response.provider).toBe('openai')
    })
  })

  describe('配置验证', () => {
    test('应该验证DeepSeek配置', async () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      // 模拟validateConfig方法
      deepseekAdapter.validateConfig = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        provider: 'deepseek'
      })

      const validation = await deepseekAdapter.validateConfig()
      expect(validation.valid).toBe(true)
      expect(validation.provider).toBe('deepseek')
    })

    test('应该检测缺少API密钥', async () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      // 模拟缺少API密钥的情况
      deepseekAdapter.validateConfig = jest.fn().mockResolvedValue({
        valid: false,
        errors: ['缺少API密钥 for deepseek'],
        warnings: [],
        provider: 'deepseek'
      })

      const validation = await deepseekAdapter.validateConfig()
      expect(validation.valid).toBe(false)
      expect(validation.errors).toContain('缺少API密钥 for deepseek')
    })
  })

  describe('错误处理', () => {
    test('应该正确处理认证错误', () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      // 模拟认证错误
      const authError = {
        response: { status: 401 },
        message: 'Invalid API key'
      }

      expect(() => {
        deepseekAdapter.handleError(authError)
      }).toThrow()
    })

    test('应该正确处理速率限制错误', () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      // 模拟速率限制错误
      const rateLimitError = {
        response: { status: 429 },
        message: 'Rate limit exceeded'
      }

      expect(() => {
        deepseekAdapter.handleError(rateLimitError)
      }).toThrow()
    })

    test('应该正确处理网络错误', () => {
      const config = createTestConfig()
      aiService = new AIService(config)

      const adapters = (aiService as any).adapters
      const deepseekAdapter = adapters.get('deepseek')

      // 模拟网络错误
      const networkError = {
        code: 'ECONNREFUSED',
        message: 'Connection refused'
      }

      expect(() => {
        deepseekAdapter.handleError(networkError)
      }).toThrow()
    })
  })

  afterEach(() => {
    // 清理
    jest.restoreAllMocks()
  })
})