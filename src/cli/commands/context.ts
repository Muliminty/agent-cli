/**
 * 上下文监控命令模块
 * 设计思路：提供上下文token使用情况的检查和监控功能，帮助用户管理AI对话的上下文长度
 *
 * 功能特点：
 * 1. 检查当前会话的token使用情况
 * 2. 提供预警和建议
 * 3. 支持不同模型和阈值配置
 * 4. 集成简化版和完整版监控智能体
 *
 * 踩坑提醒：
 * 1. 确保正确处理未初始化上下文的情况
 * 2. Token估算要准确，使用经验规则
 * 3. 输出格式要清晰易读
 * 4. 性能要考虑，避免重复计算
 */

import { Command } from 'commander'
import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { createContextMonitorAgent } from '../../core/agent/context-monitor-simple.js'
import type { AIMessage } from '../../utils/token-counter.js'

// 上下文命令选项
interface ContextCommandOptions {
  /** 输入消息文件路径 */
  input?: string
  /** 消息内容（JSON格式） */
  messages?: string
  /** 最大token数 */
  maxTokens?: number
  /** 模型名称 */
  model?: string
  /** 警告阈值 */
  threshold?: number
  /** 详细模式 */
  verbose?: boolean
  /** 输出格式 */
  format?: 'text' | 'json' | 'yaml'
  /** 调试模式 */
  debug?: boolean
  /** 指定配置文件 */
  config?: string
  /** 工作目录 */
  cwd?: string
}

/**
 * 创建上下文监控命令
 */
export function createContextCommand(): Command {
  const command = new Command('context')
    .description('上下文监控 - 检查token使用情况和提供预警')
    .option('-i, --input <path>', '输入消息文件路径（JSON格式）')
    .option('-m, --messages <json>', '消息内容（JSON字符串格式）')
    .option('--max-tokens <number>', '最大token数', '4096')
    .option('--model <name>', '模型名称', 'claude-3-5-sonnet')
    .option('-t, --threshold <number>', '警告阈值（0-1）', '0.8')
    .option('-v, --verbose', '详细模式，显示更多信息')
    .option('--format <format>', '输出格式 (text, json, yaml)', 'text')
    .option('--debug', '启用调试模式')
    .option('-c, --config <path>', '指定配置文件路径', 'agent.config.json')
    .option('--cwd <path>', '设置工作目录', process.cwd())

    .action(async (options: ContextCommandOptions) => {
      await handleContextCommand(options)
    })

  // 添加示例
  command.addHelpText('after', `
使用示例:
  $ agent-cli context
  $ agent-cli context --verbose
  $ agent-cli context --input messages.json
  $ agent-cli context --messages '[{"role":"user","content":"Hello"}]'
  $ agent-cli context --model claude-3-opus --threshold 0.75
  $ agent-cli context --format json
  $ agent-cli context --max-tokens 8192

输出说明:
  • Token使用: 输入/输出/总token数
  • 使用率: 相对于模型限制的百分比
  • 安全状态: ✅ 安全 ⚠️ 警告 ❌ 危险
  • 建议: 具体的操作建议
  `)

  return command
}

/**
 * 处理上下文监控命令
 */
export async function handleContextCommand(options: ContextCommandOptions): Promise<void> {
  const logger = createLogger({ debug: options.debug })

  try {
    logger.title('📊 上下文监控')

    // 加载配置
    const config = await loadConfig(options.config, options.cwd)
    const projectPath = options.cwd || process.cwd()

    // 获取消息数据
    const messages = await getMessages(options, logger)

    // 创建上下文监控智能体
    const contextMonitor = createContextMonitorAgent({
      config,
      logger,
      projectPath
    }, {
      model: options.model,
      warningThreshold: options.threshold ? parseFloat(options.threshold) : undefined
    })

    // 执行监控
    const result = contextMonitor.quickCheck(
      messages,
      parseInt(options.maxTokens || '4096')
    )

    // 根据格式输出结果
    switch (options.format) {
      case 'json':
        outputJsonResult(result, logger)
        break
      case 'yaml':
        outputYamlResult(result, logger)
        break
      default:
        outputTextResult(result, options, logger)
    }

  } catch (error) {
    handleContextError(error, logger)
  }
}

/**
 * 获取消息数据
 */
async function getMessages(options: ContextCommandOptions, logger: ReturnType<typeof createLogger>): Promise<AIMessage[]> {
  // 优先从文件读取
  if (options.input) {
    try {
      const fs = await import('fs-extra')
      const content = await fs.readFile(options.input, 'utf-8')
      return JSON.parse(content)
    } catch (error) {
      throw new Error(`读取消息文件失败: ${error}`)
    }
  }

  // 从命令行参数读取
  if (options.messages) {
    try {
      return JSON.parse(options.messages)
    } catch (error) {
      throw new Error(`解析消息JSON失败: ${error}`)
    }
  }

  // 默认返回空数组（演示用）
  logger.warn('未提供消息数据，使用示例数据')
  return [
    { role: 'user', content: '这是一个示例消息，用于演示上下文监控功能。' },
    { role: 'assistant', content: '我明白，这是一个示例响应。在实际使用中，请提供真实的消息数据。' }
  ]
}

/**
 * 输出文本格式结果
 */
function outputTextResult(
  result: any,
  options: ContextCommandOptions,
  logger: ReturnType<typeof createLogger>
): void {
  logger.divider('监控结果')

  const estimation = result.tokenEstimation || {}

  // 基本信息
  logger.item('模型', estimation.model || options.model || '未知')
  logger.item('总token数', (estimation.totalTokens || 0).toString())
  logger.item('输入token', (estimation.inputTokens || 0).toString())
  logger.item('输出token', (estimation.outputTokens || 0).toString())

  const utilization = estimation.utilization || 0
  const percentage = (utilization * 100).toFixed(1)
  logger.item('使用率', `${percentage}%`)

  // 安全状态
  const safeIcon = result.safe ? '✅' : '⚠️'
  logger.item('安全状态', `${safeIcon} ${result.safe ? '安全' : '警告'}`)

  // 警告和建议
  if (result.warning) {
    logger.divider('警告')
    logger.warn(result.warning)
  }

  if (result.recommendation) {
    logger.divider('建议')
    logger.info(result.recommendation)
  }

  // 详细信息（如果启用详细模式）
  if (options.verbose) {
    logger.divider('详细信息')
    logger.item('模型限制', (estimation.modelContextLimit || 0).toString())
    logger.item('推荐最大token', (estimation.recommendedMaxTokens || 0).toString())
    logger.item('超过警告阈值', estimation.exceedsWarningThreshold ? '是' : '否')
  }

  logger.divider()
}

/**
 * 输出JSON格式结果
 */
function outputJsonResult(
  result: any,
  logger: ReturnType<typeof createLogger>
): void {
  const output = {
    timestamp: new Date().toISOString(),
    result: {
      tokenEstimation: result.tokenEstimation,
      safe: result.safe,
      warning: result.warning,
      recommendation: result.recommendation
    }
  }

  console.log(JSON.stringify(output, null, 2))
}

/**
 * 输出YAML格式结果
 */
function outputYamlResult(
  result: any,
  logger: ReturnType<typeof createLogger>
): void {
  // 暂时先输出JSON，YAML转换需要额外依赖
  outputJsonResult(result, logger)
  logger.warn('注意: YAML格式暂未实现，已回退到JSON格式')
}

/**
 * 处理上下文错误
 */
function handleContextError(error: unknown, logger: ReturnType<typeof createLogger>): void {
  logger.error('❌ 上下文监控失败')

  if (error instanceof Error) {
    logger.error(`错误信息: ${error.message}`)

    if (error.message.includes('JSON')) {
      logger.info('💡 确保消息数据是有效的JSON格式')
      logger.info('💡 示例: --messages \'[{"role":"user","content":"Hello"}]\'')
    } else if (error.message.includes('文件')) {
      logger.info('💡 确保文件存在且有读取权限')
      logger.info('💡 使用绝对路径或相对路径')
    }

    if (process.env.DEBUG === 'true' || logger.isDebugEnabled()) {
      logger.debug('详细错误堆栈:', error.stack)
    }
  } else {
    logger.error(`未知错误: ${String(error)}`)
  }

  logger.info('\n💡 获取帮助:')
  logger.info('  $ agent-cli context --help')

  process.exit(1)
}

/**
 * 导出命令模块（符合CLI框架接口）
 */
export const commandModule = {
  command: 'context',
  description: '上下文监控 - 检查token使用情况和提供预警',
  options: [
    {
      flags: '-i, --input <path>',
      description: '输入消息文件路径（JSON格式）'
    },
    {
      flags: '-m, --messages <json>',
      description: '消息内容（JSON字符串格式）'
    },
    {
      flags: '--max-tokens <number>',
      description: '最大token数',
      defaultValue: '4096'
    },
    {
      flags: '--model <name>',
      description: '模型名称',
      defaultValue: 'claude-3-5-sonnet'
    },
    {
      flags: '-t, --threshold <number>',
      description: '警告阈值（0-1）',
      defaultValue: '0.8'
    },
    {
      flags: '-v, --verbose',
      description: '详细模式'
    },
    {
      flags: '--format <format>',
      description: '输出格式',
      defaultValue: 'text'
    },
    {
      flags: '--debug',
      description: '调试模式'
    }
  ],
  action: async (cmdOptions: any) => {
    await handleContextCommand(cmdOptions)
  }
}

// 默认导出
export default { createContextCommand, commandModule }