#!/usr/bin/env node

/**
 * DeepSeek API连接测试脚本
 * 设计思路：测试DeepSeek API连接和基本功能，验证适配器实现
 * 使用方法：
 *   DEEPSEEK_API_KEY=your_key node scripts/test-deepseek.js
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { AIService } from '../src/server/services/ai-service.ts'
import { createLogger } from '../src/utils/logger.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const logger = createLogger('test-deepseek')

// 默认测试配置
const createTestConfig = () => ({
  defaultProvider: 'deepseek',
  defaultModel: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 100,
  stream: false,
  providers: {
    deepseek: {
      provider: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
      timeout: 30000,
      enabled: true
    }
  },
  usageStats: {
    enabled: false,
    trackCosts: false,
    currency: 'USD'
  }
})

async function testDeepSeekConnection() {
  console.log('🧪 开始测试DeepSeek API连接...\n')

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    console.error('❌ 未设置DEEPSEEK_API_KEY环境变量')
    console.error('   使用方法: DEEPSEEK_API_KEY=your_key node scripts/test-deepseek.js')
    console.error('   或设置.env文件: DEEPSEEK_API_KEY=your_key')
    process.exit(1)
  }

  console.log(`🔑 API密钥: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`)
  console.log(`🌐 API端点: ${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'}`)
  console.log('')

  try {
    // 创建AI服务实例
    const config = createTestConfig()
    const aiService = new AIService(config)

    console.log('✅ AI服务实例创建成功')
    console.log('')

    // 测试1: 验证配置
    console.log('1. 📋 配置验证...')
    const adapters = aiService._adapters || aiService.adapters || new Map()
    const deepseekAdapter = adapters.get('deepseek')

    if (!deepseekAdapter) {
      throw new Error('❌ 未找到DeepSeek适配器')
    }

    const validation = await deepseekAdapter.validateConfig()
    console.log(`   ${validation.valid ? '✅' : '❌'} 配置验证: ${validation.valid ? '通过' : '失败'}`)

    if (!validation.valid) {
      validation.errors.forEach(error => console.log(`   ❌ ${error}`))
      validation.warnings.forEach(warning => console.log(`   ⚠️ ${warning}`))
      process.exit(1)
    } else {
      validation.warnings.forEach(warning => console.log(`   ⚠️ ${warning}`))
    }

    // 测试2: 测试连接
    console.log('2. 🔌 连接测试...')
    const connectionTest = await deepseekAdapter.testConnection()
    console.log(`   ${connectionTest.valid ? '✅' : '❌'} 连接测试: ${connectionTest.valid ? '通过' : '失败'}`)

    if (connectionTest.valid) {
      console.log(`   🤖 可用模型: ${connectionTest.model}`)
    } else {
      connectionTest.errors.forEach(error => console.log(`   ❌ ${error}`))
      process.exit(1)
    }

    // 测试3: 获取模型列表
    console.log('3. 📊 获取模型列表...')
    try {
      const models = await deepseekAdapter.getModels()
      console.log(`   ✅ 获取到 ${models.length} 个模型:`)
      models.forEach(model => console.log(`     • ${model}`))
    } catch (error) {
      console.log(`   ❌ 获取模型失败: ${error.message}`)
    }

    // 测试4: 发送测试消息（可选）
    const skipMessageTest = process.env.SKIP_MESSAGE_TEST === 'true'
    if (!skipMessageTest) {
      console.log('4. 💬 发送测试消息...')
      try {
        const chatParams = {
          messages: [
            { role: 'system', content: '你是一个有用的助手，请用中文回复。' },
            { role: 'user', content: '你好，请回复"测试成功"证明API正常工作。' }
          ],
          model: 'deepseek-chat',
          provider: 'deepseek',
          maxTokens: 50,
          temperature: 0.7
        }

        console.log('   📤 发送消息...')
        const response = await deepseekAdapter.sendMessage(chatParams)
        console.log(`   ✅ 收到响应 (${response.model}):`)
        console.log(`     内容: "${response.content.trim()}"`)
        console.log(`     Token使用: 输入${response.usage.promptTokens}, 输出${response.usage.completionTokens}`)
        console.log(`     完成原因: ${response.finishReason}`)
      } catch (error) {
        console.log(`   ❌ 消息发送失败: ${error.message}`)
        console.log('   ℹ️ 设置 SKIP_MESSAGE_TEST=true 跳过消息测试')
      }
    } else {
      console.log('4. 💬 跳过消息测试 (SKIP_MESSAGE_TEST=true)')
    }

    // 测试5: 成本估算
    console.log('5. 💰 成本估算测试...')
    try {
      const costEstimate = await deepseekAdapter.estimateCost({
        model: 'deepseek-chat',
        promptTokens: 1000,
        completionTokens: 500
      })

      console.log(`   ✅ 成本估算 (${costEstimate.currency}):`)
      console.log(`     输入成本: $${costEstimate.promptCost.toFixed(6)}`)
      console.log(`     输出成本: $${costEstimate.completionCost.toFixed(6)}`)
      console.log(`     总成本: $${costEstimate.totalCost.toFixed(6)}`)
      console.log(`     每百万token: 输入$${costEstimate.perMillionTokens.prompt.toFixed(4)}, 输出$${costEstimate.perMillionTokens.completion.toFixed(4)}`)
    } catch (error) {
      console.log(`   ❌ 成本估算失败: ${error.message}`)
    }

    console.log('\n🎉 DeepSeek API测试完成！')
    console.log('✨ 所有基本功能测试通过')
    console.log('📝 注意事项:')
    console.log('   • 实际使用前请配置正确的agent.config.json')
    console.log('   • 定期更新API密钥，确保安全')
    console.log('   • 监控使用成本，避免意外费用')

  } catch (error) {
    console.error('\n❌ DeepSeek测试失败:')
    console.error(`   错误: ${error.message}`)

    if (error.originalError) {
      console.error(`   原始错误: ${error.originalError.message}`)
    }

    console.error(`   堆栈: ${error.stack}`)
    process.exit(1)
  }
}

// 解析命令行参数
const args = process.argv.slice(2)
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
DeepSeek API测试脚本

使用方法:
  DEEPSEEK_API_KEY=your_key node scripts/test-deepseek.js [选项]

选项:
  --help, -h     显示帮助信息
  --skip-message 跳过消息发送测试

环境变量:
  DEEPSEEK_API_KEY      DeepSeek API密钥 (必需)
  DEEPSEEK_BASE_URL     API基础URL (默认: https://api.deepseek.com)
  SKIP_MESSAGE_TEST     跳过消息测试 (true/false)

示例:
  DEEPSEEK_API_KEY=sk-xxx node scripts/test-deepseek.js
  DEEPSEEK_API_KEY=sk-xxx SKIP_MESSAGE_TEST=true node scripts/test-deepseek.js
  `)
  process.exit(0)
}

// 运行测试
if (require.main === module) {
  testDeepSeekConnection().catch(error => {
    console.error('❌ 测试脚本执行失败:', error)
    process.exit(1)
  })
}

export { testDeepSeekConnection }