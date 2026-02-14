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
import { version } from '../../package.json' assert { type: 'json' }

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
  // 这里后期可以改为动态加载commands目录下的文件
  // 目前先返回空数组，后续实现命令时会填充
  return []
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
  const program = createCliProgram()
  const commands = await loadCommandModules()

  // 注册命令
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
}

// 导出主函数
export default { main }