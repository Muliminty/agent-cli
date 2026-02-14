/**
 * 长效运行智能体CLI工具 - CLI框架入口
 * 设计思路：使用commander.js构建命令行界面，提供清晰的命令结构和帮助信息
 *
 * 功能特点：
 * 1. 模块化命令设计，支持动态加载
 * 2. 统一的错误处理和日志输出
 * 3. 彩色输出和进度指示
 * 4. 配置文件和环境变量支持
 */

import { Command } from 'commander'
import { createLogger } from '../utils/logger.js'
import { loadConfig } from '../config/loader.js'
import { CommandParser, type CommandOptionConfig, type CommandArgumentConfig } from './parser.js'
import pkg from '../../package.json' assert { type: 'json' }
const { version } = pkg

// 命令模块类型定义
interface CommandModule {
  command: string
  description: string
  options?: Array<{
    flags: string
    description: string
    defaultValue?: any
    // 新增验证相关字段（可选，向后兼容）
    validation?: any
    parser?: (value: string) => any
  }>
  action: (options: any, config: any) => Promise<void> | void
}

// 创建CLI程序实例
export function createCliProgram() {
  const program = new Command()

  // 基础信息配置
  program
    .name('agent-cli')
    .description('长效运行智能体CLI工具 - 实现双轨方案的项目管理和自动化开发')
    .version(version, '-v, --version', '显示版本信息')
    .option('-d, --debug', '启用调试模式')
    .option('-c, --config <path>', '指定配置文件路径', 'agent.config.json')
    .option('--cwd <path>', '设置工作目录', process.cwd())

  // 全局错误处理
  program.configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
    outputError: (str, write) => write(`❌ 错误: ${str}`)
  })

  return program
}

// 加载命令模块
async function loadCommandModules(): Promise<CommandModule[]> {
  const commands: CommandModule[] = []

  try {
    // 导入初始化智能体模块，确保智能体工厂被注册
    try {
      await import('../core/agent/initializer.js')
    } catch (importError) {
      console.warn('⚠️  导入初始化智能体模块失败:', importError)
    }

    // 静态导入命令模块（开发模式）
    // 注意：在完整实现中应该动态加载

    // 添加初始化命令
    commands.push({
      command: 'init [project-name]',
      description: '初始化新项目',
      options: [
        {
          flags: '-p, --path <path>',
          description: '项目路径'
        },
        {
          flags: '-d, --description <description>',
          description: '项目描述'
        },
        {
          flags: '-t, --template <template>',
          description: '项目模板',
          defaultValue: 'web-app'
        },
        {
          flags: '--no-git',
          description: '不初始化Git仓库'
        },
        {
          flags: '--git-name <name>',
          description: 'Git用户名'
        },
        {
          flags: '--git-email <email>',
          description: 'Git用户邮箱'
        },
        {
          flags: '-i, --interactive',
          description: '交互式模式'
        },
        {
          flags: '--skip-features',
          description: '跳过初始功能列表'
        },
        {
          flags: '-y, --yes',
          description: '非交互式模式'
        },
        {
          flags: '--debug',
          description: '调试模式'
        }
      ],
      action: async (options: any) => {
        try {
          // 动态导入处理函数以避免循环依赖
          const { handleInitCommand } = await import('./commands/init.js')
          await handleInitCommand(options.args?.[0], options)
        } catch (error) {
          console.error('❌ 执行init命令失败:', error)
          throw error
        }
      }
    })

    // 添加状态查看命令
    commands.push({
      command: 'status',
      description: '查看项目状态',
      options: [
        {
          flags: '-v, --verbose',
          description: '详细模式'
        },
        {
          flags: '-a, --all',
          description: '显示所有功能'
        },
        {
          flags: '-t, --tests',
          description: '显示测试结果'
        },
        {
          flags: '-g, --git',
          description: '显示Git状态'
        },
        {
          flags: '-H, --history',
          description: '显示进度历史'
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
      action: async (options: any) => {
        try {
          // 动态导入处理函数以避免循环依赖
          const { handleStatusCommand } = await import('./commands/status.js')
          await handleStatusCommand(options)
        } catch (error) {
          console.error('❌ 执行status命令失败:', error)
          throw error
        }
      }
    })

    // 添加上下文监控命令
    commands.push({
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
      action: async (options: any) => {
        try {
          // 动态导入处理函数以避免循环依赖
          const { handleContextCommand } = await import('./commands/context.js')
          await handleContextCommand(options)
        } catch (error) {
          console.error('❌ 执行context命令失败:', error)
          throw error
        }
      }
    })

  } catch (error) {
    console.error('❌ 加载命令模块失败:', error)
  }

  return commands
}

// 注册命令到CLI程序
function registerCommands(program: Command, commands: CommandModule[]) {
  const commandParser = new CommandParser()

  for (const cmd of commands) {
    const command = program.command(cmd.command).description(cmd.description)

    // 注册选项
    if (cmd.options) {
      for (const option of cmd.options) {
        command.option(option.flags, option.description, option.defaultValue)
      }
    }

    // 添加验证中间件
    addValidationToCommand(command, cmd, commandParser)

    // 注册动作
    command.action(async (options) => {
      const logger = createLogger({ debug: options.debug })
      const config = await loadConfig(options.config, options.cwd)

      try {
        await cmd.action(options, config)
      } catch (error) {
        logger.error(`命令执行失败: ${error instanceof Error ? error.message : String(error)}`)
        if (options.debug && error instanceof Error) {
          logger.debug(error.stack || '无堆栈信息')
        }
        process.exit(1)
      }
    })
  }
}

/**
 * 为命令添加验证
 */
function addValidationToCommand(command: Command, cmd: CommandModule, parser: CommandParser): void {
  const originalAction = command.action.bind(command)

  command.action(async (...args: any[]) => {
    try {
      // 提取参数和选项
      const options = args[args.length - 1] || {}
      const commandArgs = args.slice(0, -1)

      // 基本验证（根据选项类型）
      const validationErrors: string[] = []

      // 验证选项
      if (cmd.options) {
        for (const option of cmd.options) {
          const flagName = extractOptionName(option.flags)
          const value = options[flagName]

          // 基本类型验证（基于选项名或默认值）
          if (value !== undefined && value !== null && value !== '') {
            // 检查数字选项
            if (option.flags.includes('max-tokens') || option.flags.includes('threshold')) {
              const num = Number(value)
              if (isNaN(num)) {
                validationErrors.push(`选项 "${flagName}" 必须为数字，当前值: "${value}"`)
              } else if (option.flags.includes('threshold') && (num < 0 || num > 1)) {
                validationErrors.push(`选项 "${flagName}" 必须在 0 到 1 之间，当前值: ${num}`)
              } else if (option.flags.includes('max-tokens') && num < 1) {
                validationErrors.push(`选项 "${flagName}" 必须大于 0，当前值: ${num}`)
              }
            }

            // 检查文件路径选项
            if (option.flags.includes('input') || option.flags.includes('config')) {
              if (typeof value === 'string') {
                try {
                  const exists = await fs.pathExists(path.resolve(value))
                  if (!exists) {
                    validationErrors.push(`文件不存在: ${value}`)
                  }
                } catch {
                  validationErrors.push(`无法访问文件: ${value}`)
                }
              }
            }

            // 应用值解析器（如果提供）
            if (option.parser) {
              try {
                options[flagName] = option.parser(value)
              } catch (error) {
                validationErrors.push(`选项 "${flagName}" 解析失败: ${error}`)
              }
            }
          }
        }
      }

      // 如果有验证错误，输出并退出
      if (validationErrors.length > 0) {
        const logger = createLogger({ debug: options.debug })
        logger.error('❌ 参数验证失败:')
        for (const error of validationErrors) {
          logger.error(`  • ${error}`)
        }
        logger.info(`\n💡 获取帮助:`)
        logger.info(`  $ agent-cli ${cmd.command} --help`)
        process.exit(1)
      }

      // 调用原始动作
      return originalAction(...args)
    } catch (error) {
      const options = args[args.length - 1] || {}
      const logger = createLogger({ debug: options.debug })
      logger.error(`❌ 命令验证失败: ${error}`)
      if (options.debug && error instanceof Error) {
        logger.debug(error.stack || '无堆栈信息')
      }
      process.exit(1)
    }
  })
}

/**
 * 从选项标识中提取选项名称
 */
function extractOptionName(flags: string): string {
  // 匹配长选项名（--option-name）
  const longMatch = flags.match(/--([\w-]+)\b/)
  if (longMatch) {
    return longMatch[1]
  }

  // 匹配短选项名（-o）
  const shortMatch = flags.match(/-([a-zA-Z])\b/)
  if (shortMatch) {
    return shortMatch[1]
  }

  // 默认返回整个flags（去除空格和特殊字符）
  return flags.replace(/[^\w-]/g, '')
}

// 主函数 - CLI入口点
export async function main() {
  // 设置全局错误处理
  process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的Promise拒绝:', reason)
    process.exit(1)
  })

  try {
    const program = createCliProgram()
    const commands = await loadCommandModules()

    // 如果没有命令模块，显示警告
    if (commands.length === 0) {
      console.warn('⚠️  没有加载到任何命令模块')
    }

    registerCommands(program, commands)

    // 默认帮助命令
    program.on('--help', () => {
      console.log('\n📖 使用示例:')
      console.log('  $ agent-cli init my-project --template react')
      console.log('  $ agent-cli status')
      console.log('  $ agent-cli context --input messages.json')
      console.log('  $ agent-cli context --messages \'[{"role":"user","content":"Hello"}]\'')
      console.log('  $ agent-cli next --feature feature-001')
      console.log('  $ agent-cli test --all')
      console.log('\n📁 配置文件: agent.config.json')
      console.log('🌐 更多信息: https://github.com/your-repo/agent-cli')
    })

    // 处理未知命令
    program.on('command:*', () => {
      console.error('❌ 未知命令: %s', program.args.join(' '))
      console.error('💡 使用 --help 查看可用命令')
      process.exit(1)
    })

    // 解析命令行参数
    try {
      await program.parseAsync(process.argv)
    } catch (error) {
      console.error('❌ CLI解析错误:', error)
      process.exit(1)
    }

    // 如果没有参数，显示帮助
    if (process.argv.length === 2) {
      program.help()
    }
  } catch (error) {
    console.error('❌ CLI主函数执行失败:', error)
    process.exit(1)
  }
}

// 导出主函数
export default { main }