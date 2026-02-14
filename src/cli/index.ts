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

  } catch (error) {
    console.error('❌ 加载命令模块失败:', error)
  }

  return commands
}

// 注册命令到CLI程序
function registerCommands(program: Command, commands: CommandModule[]) {
  for (const cmd of commands) {
    const command = program.command(cmd.command).description(cmd.description)

    // 注册选项
    if (cmd.options) {
      for (const option of cmd.options) {
        command.option(option.flags, option.description, option.defaultValue)
      }
    }

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