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

    // 添加测试命令
    commands.push({
      command: 'test',
      description: '执行端到端自动化测试',
      options: [
        {
          flags: '-s, --suites <pattern>',
          description: '测试套件路径（支持glob模式，如: tests/*.json）'
        },
        {
          flags: '-c, --config <path>',
          description: '测试配置文件路径'
        },
        {
          flags: '-u, --url <url>',
          description: '基础URL（覆盖配置文件）'
        },
        {
          flags: '--no-headless',
          description: '显示浏览器界面（默认无头模式）'
        },
        {
          flags: '--browser-path <path>',
          description: '指定浏览器可执行文件路径'
        },
        {
          flags: '--timeout <ms>',
          description: '默认超时时间（毫秒）',
          defaultValue: '30000'
        },
        {
          flags: '--continue-on-failure',
          description: '失败时继续执行其他测试'
        },
        {
          flags: '--screenshot-dir <dir>',
          description: '截图保存目录',
          defaultValue: './test-screenshots'
        },
        {
          flags: '--report-dir <dir>',
          description: '报告保存目录',
          defaultValue: './test-reports'
        },
        {
          flags: '--html',
          description: '生成HTML格式报告'
        },
        {
          flags: '-v, --verbose',
          description: '详细输出模式'
        },
        {
          flags: '--debug',
          description: '调试模式（输出更多信息）'
        },
        {
          flags: '--parallel <count>',
          description: '并行执行数量',
          defaultValue: '1'
        },
        {
          flags: '--retries <count>',
          description: '最大重试次数',
          defaultValue: '0'
        },
        {
          flags: '--tags <tags>',
          description: '标签过滤（逗号分隔）'
        },
        {
          flags: '--format <format>',
          description: '输出格式: json, html, both',
          defaultValue: 'both'
        },
        {
          flags: '--history',
          description: '保存测试历史记录'
        }
      ],
      action: async (options: any) => {
        try {
          // 动态导入处理函数以避免循环依赖
          const { executeTestCommand } = await import('./commands/test.js')
          await executeTestCommand(options)
        } catch (error) {
          console.error('❌ 执行test命令失败:', error)
          throw error
        }
      }
    })

    // 添加报告生成命令
    commands.push({
      command: 'report',
      description: '生成项目报告 - 进度、测试、健康状态等多维度分析',
      options: [
        {
          flags: '-t, --type <type>',
          description: '报告类型 (progress, test, health, summary, all)',
          defaultValue: 'summary'
        },
        {
          flags: '-f, --format <format>',
          description: '输出格式 (text, json, html, markdown)',
          defaultValue: 'text'
        },
        {
          flags: '-o, --output <path>',
          description: '输出文件路径（默认输出到控制台）'
        },
        {
          flags: '-v, --verbose',
          description: '详细模式'
        },
        {
          flags: '--debug',
          description: '调试模式'
        },
        {
          flags: '--cwd <path>',
          description: '设置工作目录'
        },
        {
          flags: '--title <title>',
          description: '覆盖报告标题'
        },
        {
          flags: '--time-range <range>',
          description: '时间范围 (格式: YYYY-MM-DD,YYYY-MM-DD)'
        },
        {
          flags: '--features <ids>',
          description: '包含特定功能ID（逗号分隔）'
        },
        {
          flags: '--tags <tags>',
          description: '包含特定标签（逗号分隔）'
        },
        {
          flags: '--exclude-completed',
          description: '不包含已完成的功能'
        },
        {
          flags: '--include-tests',
          description: '包含详细测试结果'
        },
        {
          flags: '--include-git',
          description: '包含Git历史'
        },
        {
          flags: '--include-recommendations',
          description: '包含建议和行动计划'
        },
        {
          flags: '--force',
          description: '强制覆盖输出文件'
        }
      ],
      action: async (options: any) => {
        try {
          // 动态导入处理函数以避免循环依赖
          const { handleReportCommand } = await import('./commands/report.js')
          await handleReportCommand(options)
        } catch (error) {
          console.error('❌ 执行report命令失败:', error)
          throw error
        }
      }
    })

    // 添加配置管理命令
    commands.push({
      command: 'config',
      description: '配置管理 - 查看、设置和验证agent-cli配置',
      options: [
        {
          flags: '-g, --get <path>',
          description: '获取配置值（配置路径，如 agent.model）'
        },
        {
          flags: '-s, --set <path=value>',
          description: '设置配置值（格式：path=value）'
        },
        {
          flags: '-r, --reset',
          description: '重置配置到默认值'
        },
        {
          flags: '-l, --list',
          description: '列出所有配置项'
        },
        {
          flags: '--validate',
          description: '验证配置'
        },
        {
          flags: '--format <format>',
          description: '输出格式 (text, json, yaml)',
          defaultValue: 'text'
        },
        {
          flags: '-v, --verbose',
          description: '详细模式'
        },
        {
          flags: '--debug',
          description: '调试模式'
        },
        {
          flags: '--global',
          description: '操作全局配置（用户级别）'
        },
        {
          flags: '-i, --interactive',
          description: '交互式模式'
        },
        {
          flags: '--dry-run',
          description: '不保存更改（仅预览）'
        }
      ],
      action: async (options: any) => {
        try {
          // 动态导入处理函数以避免循环依赖
          const { handleConfigCommand } = await import('./commands/config.js')
          await handleConfigCommand(options)
        } catch (error) {
          console.error('❌ 执行config命令失败:', error)
          throw error
        }
      }
    })

    // 添加重置命令
    commands.push({
      command: 'reset',
      description: '项目重置 - 安全地重置项目状态、进度、测试结果等',
      options: [
        {
          flags: '-t, --type <type>',
          description: '重置类型 (progress, features, tests, git, config, all)',
          defaultValue: 'progress'
        },
        {
          flags: '-f, --force',
          description: '强制重置（跳过确认）'
        },
        {
          flags: '-b, --backup',
          description: '创建备份'
        },
        {
          flags: '--backup-dir <path>',
          description: '备份目录路径',
          defaultValue: './backups'
        },
        {
          flags: '--dry-run',
          description: '预览模式（不实际执行）'
        },
        {
          flags: '-i, --interactive',
          description: '交互式模式'
        },
        {
          flags: '-v, --verbose',
          description: '详细模式'
        },
        {
          flags: '--debug',
          description: '调试模式'
        },
        {
          flags: '--cwd <path>',
          description: '设置工作目录'
        },
        {
          flags: '--keep-files <files>',
          description: '保留特定文件（逗号分隔）'
        },
        {
          flags: '--reinitialize',
          description: '重置后重新初始化'
        },
        {
          flags: '--feature-ids <ids>',
          description: '仅重置特定功能ID（逗号分隔）'
        }
      ],
      action: async (options: any) => {
        try {
          // 动态导入处理函数以避免循环依赖
          const { handleResetCommand } = await import('./commands/reset.js')
          await handleResetCommand(options)
        } catch (error) {
          console.error('❌ 执行reset命令失败:', error)
          throw error
        }
      }
    })

    // 添加模板管理命令
    commands.push({
      command: 'template <subcommand> [otherArgs...]',
      description: '模板管理 - 管理内置和用户自定义模板',
      options: [
        {
          flags: '-t, --type <type>',
          description: '模板类型 (builtin, user, project)'
        },
        {
          flags: '-q, --query <query>',
          description: '搜索查询'
        },
        {
          flags: '--tags <tags>',
          description: '标签过滤（逗号分隔）'
        },
        {
          flags: '-o, --output <path>',
          description: '输出文件路径（render命令使用）'
        },
        {
          flags: '--data-file <path>',
          description: '数据文件路径（JSON格式）'
        },
        {
          flags: '--data <json>',
          description: '数据内容（JSON字符串）'
        },
        {
          flags: '--env-prefix <prefix>',
          description: '环境变量前缀'
        },
        {
          flags: '-i, --interactive',
          description: '交互式模式'
        },
        {
          flags: '--skip-validation',
          description: '跳过变量验证'
        },
        {
          flags: '--strict',
          description: '严格模式（必需变量必须提供）'
        },
        {
          flags: '--ensure-dir',
          description: '确保输出目录存在'
        },
        {
          flags: '--extra-data <json>',
          description: '额外数据（JSON字符串）'
        },
        {
          flags: '--force',
          description: '强制操作（不确认）'
        },
        {
          flags: '--test-data <json>',
          description: '测试数据（JSON字符串，validate命令使用）'
        },
        {
          flags: '-v, --verbose',
          description: '详细模式'
        },
        {
          flags: '--debug',
          description: '调试模式'
        }
      ],
      action: async (...allArgs) => {
        try {
          console.log('DEBUG: template action allArgs:', allArgs.map(arg => typeof arg === 'string' ? `"${arg}"` : typeof arg));
          const options = allArgs[allArgs.length - 1] || {};
          const positionArgs = allArgs.slice(0, -1);

          // 将位置参数放入options.args
          options.args = positionArgs;
          console.log('DEBUG: template action positionArgs:', positionArgs, 'options.args:', options.args, 'options keys:', Object.keys(options));

          // 动态导入处理函数以避免循环依赖
          const { handleTemplateCommand } = await import('./commands/template.js')
          await handleTemplateCommand(options)
        } catch (error) {
          console.error('❌ 执行template命令失败:', error)
          throw error
        }
      }
    })

    // 添加下一步命令
    commands.push({
      command: 'next',
      description: '下一步实现 - 获取下一个推荐功能并开始实现',
      options: [
        {
          flags: '-f, --feature <id>',
          description: '指定功能ID（默认自动选择下一个）'
        },
        {
          flags: '-s, --start',
          description: '开始实现功能（将功能标记为进行中）'
        },
        {
          flags: '-i, --info',
          description: '只显示信息，不修改状态'
        },
        {
          flags: '-v, --verbose',
          description: '详细模式，显示更多信息'
        },
        {
          flags: '--debug',
          description: '调试模式'
        }
      ],
      action: async (options: any) => {
        try {
          // 动态导入处理函数以避免循环依赖
          const { handleNextCommand } = await import('./commands/next.js')
          await handleNextCommand(options)
        } catch (error) {
          console.error('❌ 执行next命令失败:', error)
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

      // 将位置参数保存到options.args
      options.args = commandArgs

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
      console.log('  $ agent-cli test --suites "tests/*.json" --url "https://example.com"')
      console.log('  $ agent-cli test --config test-config.json --html --verbose')
      console.log('  $ agent-cli test --suites "tests/login.json" --no-headless --debug')
      console.log('  $ agent-cli next')
      console.log('  $ agent-cli next --start --feature feat-123')
      console.log('  $ agent-cli report --type progress --format html --output ./report.html')
      console.log('  $ agent-cli report --type summary --format markdown')
      console.log('  $ agent-cli report --type all --include-tests --include-git')
      console.log('  $ agent-cli config --list')
      console.log('  $ agent-cli config --get agent.model')
      console.log('  $ agent-cli config --set "agent.model=claude-3-opus"')
      console.log('  $ agent-cli config --reset')
      console.log('  $ agent-cli reset --dry-run')
      console.log('  $ agent-cli reset --type features --backup')
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