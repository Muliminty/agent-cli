/**
 * 初始化命令模块
 * 设计思路：提供交互式的项目初始化流程，集成初始化智能体
 *
 * 功能特点：
 * 1. 交互式项目配置收集
 * 2. 智能体驱动的项目创建
 * 3. 实时进度反馈
 * 4. 完整的错误处理和回滚
 *
 * 踩坑提醒：
 * 1. 确保路径处理正确，支持相对路径和绝对路径
 * 2. 输入验证要全面，避免无效配置
 * 3. 错误处理要友好，提供清晰的恢复建议
 * 4. 进度反馈要及时，让用户了解当前状态
 */

import { Command } from 'commander'
import * as path from 'path'
import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { AgentRegistry } from '../../core/agent/base.js'
import { getPromptUtils } from '../../utils/prompt-utils.js'
import type { AgentContext } from '../../core/agent/base.js'
import type { Config } from '../../config/schema.js'

// 初始化命令选项
interface InitCommandOptions {
  /** 项目名称 */
  name?: string
  /** 项目路径 */
  path?: string
  /** 项目描述 */
  description?: string
  /** 项目模板 */
  template?: string
  /** 是否初始化Git仓库 */
  git?: boolean
  /** Git用户名 */
  'git-name'?: string
  /** Git用户邮箱 */
  'git-email'?: string
  /** 是否交互式模式 */
  interactive?: boolean
  /** 是否跳过功能列表创建 */
  'skip-features'?: boolean
  /** 是否非交互式（静默）模式 */
  yes?: boolean
  /** 调试模式 */
  debug?: boolean
  /** 指定配置文件 */
  config?: string
  /** 工作目录 */
  cwd?: string
}

/**
 * 创建初始化命令
 */
export function createInitCommand(): Command {
  const command = new Command('init')
    .description('初始化新项目 - 创建项目脚手架和基础配置')
    .argument('[project-name]', '项目名称（如果省略，将在交互模式中询问）')
    .option('-p, --path <path>', '项目路径（默认: 当前目录下的项目名称目录）')
    .option('-d, --description <description>', '项目描述')
    .option('-t, --template <template>', '项目模板 (web-app, api-service, library)', 'web-app')
    .option('--no-git', '不初始化Git仓库')
    .option('--git-name <name>', 'Git用户名（用于初始提交）')
    .option('--git-email <email>', 'Git用户邮箱（用于初始提交）')
    .option('-i, --interactive', '交互式模式（默认启用，除非指定-y）', true)
    .option('--skip-features', '跳过初始功能列表创建')
    .option('-y, --yes', '非交互式模式，使用默认值', false)
    .option('--debug', '启用调试模式')
    .option('-c, --config <path>', '指定配置文件路径', 'agent.config.json')
    .option('--cwd <path>', '设置工作目录', process.cwd())

    .action(async (projectName, options: InitCommandOptions) => {
      await handleInitCommand(projectName, options)
    })

  // 添加示例
  command.addHelpText('after', `
使用示例:
  $ agent-cli init my-project
  $ agent-cli init my-project --template web-app --path ./projects/
  $ agent-cli init my-project --description "一个React项目" --no-git
  $ agent-cli init my-project --yes --template api-service

可用模板:
  • web-app     - 标准Web应用 (React + TypeScript + Vite)
  • api-service - API服务 (Node.js + Express + TypeScript)
  • library     - 库项目 (TypeScript库开发)

项目结构:
  创建的项目将包含:
  • 完整的目录结构
  • 配置文件 (package.json, tsconfig.json等)
  • 进度跟踪文件 (claude-progress.txt, feature-list.json)
  • Git仓库初始化 (可选)
  • 初始功能列表 (可选)
  `)

  return command
}

/**
 * 处理初始化命令
 */
export async function handleInitCommand(projectName: string | undefined, options: InitCommandOptions): Promise<void> {
  const logger = createLogger({ debug: options.debug })

  try {
    logger.title('🚀 项目初始化')

    // 加载配置
    const config = await loadConfig(options.config, options.cwd)
    logger.debug('配置加载完成')

    // 收集项目信息
    const projectInfo = await collectProjectInfo(projectName, options, logger)

    // 验证项目路径
    await validateProjectPath(projectInfo.projectPath, logger)

    // 创建Agent上下文
    const agentContext = createAgentContext(projectInfo, config)

    // 执行初始化
    await executeInitialization(agentContext, projectInfo, logger)

    logger.success('✅ 项目初始化完成！')
  } catch (error) {
    handleInitError(error, logger)
  }
}

/**
 * 收集项目信息
 */
async function collectProjectInfo(
  projectName: string | undefined,
  options: InitCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<{
  projectName: string
  projectPath: string
  description?: string
  template: string
  initGit: boolean
  gitUserName?: string
  gitUserEmail?: string
  createFeatureList: boolean
}> {
  logger.startTask('收集项目信息')

  // 确定是否使用交互式模式
  const useInteractive = !options.yes && (options.interactive !== false)

  let finalProjectName = projectName
  let finalProjectPath = options.path
  let finalDescription = options.description
  let finalTemplate = options.template || 'web-app'
  let finalInitGit = options.git !== false
  let finalGitUserName = options['git-name']
  let finalGitUserEmail = options['git-email']
  let finalCreateFeatureList = !options['skip-features']

  if (useInteractive) {
    logger.info('交互式模式已启用')

    // 交互式收集项目信息
    try {
      // 项目名称
      if (!finalProjectName) {
        finalProjectName = await promptText({
          message: '项目名称',
          defaultValue: 'my-project',
          required: true,
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return '项目名称不能为空'
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
              return '项目名称只能包含字母、数字、下划线和连字符'
            }
            return true
          }
        })
      }

      // 项目路径
      if (!finalProjectPath) {
        const defaultPath = path.join(process.cwd(), finalProjectName!)
        finalProjectPath = await promptText({
          message: '项目路径',
          defaultValue: defaultPath,
          required: true,
          validate: async (value) => {
            if (!value || value.trim().length === 0) {
              return '项目路径不能为空'
            }
            const resolvedPath = path.resolve(value)
            const fs = await import('fs-extra')
            if (await fs.pathExists(resolvedPath)) {
              const files = await fs.readdir(resolvedPath)
              if (files.length > 0) {
                return `路径 ${resolvedPath} 不为空，请选择空目录或使用不同路径`
              }
            }
            return true
          }
        })
      }

      // 项目描述
      if (!finalDescription) {
        finalDescription = await promptText({
          message: '项目描述',
          defaultValue: `一个基于 ${finalTemplate} 模板的项目`,
          required: false
        })
      }

      // 项目模板
      const templateChoice = await promptSelect({
        message: '选择项目模板',
        choices: [
          { name: 'Web应用 (React + TypeScript + Vite)', value: 'web-app' },
          { name: 'API服务 (Node.js + Express + TypeScript)', value: 'api-service' },
          { name: '库项目 (TypeScript库开发)', value: 'library' }
        ],
        defaultValue: finalTemplate
      })
      finalTemplate = templateChoice

      // 是否初始化Git仓库
      if (options.git === undefined) { // 未通过命令行指定
        finalInitGit = await promptConfirm({
          message: '初始化Git仓库',
          defaultValue: true
        })
      }

      // 是否创建初始功能列表
      if (options['skip-features'] === undefined) { // 未通过命令行指定
        finalCreateFeatureList = await promptConfirm({
          message: '创建初始功能列表',
          defaultValue: true
        })
      }

      // Git配置（如果初始化Git仓库）
      if (finalInitGit) {
        if (!finalGitUserName) {
          finalGitUserName = await promptText({
            message: 'Git用户名 (用于初始提交)',
            defaultValue: '',
            required: false
          })
        }

        if (!finalGitUserEmail) {
          finalGitUserEmail = await promptText({
            message: 'Git用户邮箱 (用于初始提交)',
            defaultValue: '',
            required: false,
            validate: (value) => {
              if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                return '请输入有效的邮箱地址'
              }
              return true
            }
          })
        }
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        logger.warn('用户取消了交互式输入')
        process.exit(0)
      }
      throw error
    }
  } else {
    // 非交互式模式
    if (!finalProjectName) {
      throw new Error('非交互式模式下必须提供项目名称')
    }

    // 构建项目路径
    finalProjectPath = finalProjectPath || path.join(process.cwd(), finalProjectName)
    finalDescription = finalDescription || `一个基于 ${finalTemplate} 模板的项目`
  }

  // 验证模板
  const validTemplates = ['web-app', 'api-service', 'library']
  if (!validTemplates.includes(finalTemplate)) {
    throw new Error(`无效的模板: ${finalTemplate}。可用模板: ${validTemplates.join(', ')}`)
  }

  const projectInfo = {
    projectName: finalProjectName!,
    projectPath: finalProjectPath!,
    description: finalDescription,
    template: finalTemplate,
    initGit: finalInitGit,
    gitUserName: finalGitUserName,
    gitUserEmail: finalGitUserEmail,
    createFeatureList: finalCreateFeatureList
  }

  logger.debug('收集的项目信息:', projectInfo)
  logger.completeTask('收集项目信息')

  return projectInfo
}

/**
 * 验证项目路径
 */
async function validateProjectPath(projectPath: string, logger: ReturnType<typeof createLogger>): Promise<void> {
  logger.startTask('验证项目路径')

  const fs = await import('fs-extra')
  const resolvedPath = path.resolve(projectPath)

  // 检查路径是否存在
  if (await fs.pathExists(resolvedPath)) {
    const files = await fs.readdir(resolvedPath)
    if (files.length > 0) {
      throw new Error(`项目路径 ${resolvedPath} 不为空。请选择空目录或使用不同路径。`)
    }
  }

  // 检查是否有写权限
  try {
    await fs.ensureDir(path.dirname(resolvedPath))
  } catch (error) {
    throw new Error(`无法访问路径 ${resolvedPath}: ${error}`)
  }

  logger.completeTask('验证项目路径')
}

/**
 * 创建Agent上下文
 */
function createAgentContext(
  projectInfo: ReturnType<typeof collectProjectInfo> extends Promise<infer T> ? T : never,
  config: Config
): AgentContext {
  return {
    projectPath: projectInfo.projectPath,
    config,
    userData: {
      initializerOptions: {
        projectName: projectInfo.projectName,
        projectPath: projectInfo.projectPath,
        description: projectInfo.description,
        template: projectInfo.template,
        initGit: projectInfo.initGit,
        gitUserName: projectInfo.gitUserName,
        gitUserEmail: projectInfo.gitUserEmail,
        createFeatureList: projectInfo.createFeatureList,
        interactive: false // 已经在CLI层面处理了交互
      }
    }
  }
}

/**
 * 执行初始化
 */
async function executeInitialization(
  context: AgentContext,
  projectInfo: ReturnType<typeof collectProjectInfo> extends Promise<infer T> ? T : never,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  logger.startTask('执行项目初始化')

  try {
    // 创建初始化智能体
    const agent = AgentRegistry.create('initializer', context, {
      verbose: true,
      maxRetries: 2,
      timeout: 120000 // 2分钟超时
    })

    logger.info(`使用智能体: ${agent.constructor.name}`)

    // 初始化智能体
    const initResult = await agent.initialize()
    if (!initResult.success) {
      throw new Error(`智能体初始化失败: ${initResult.error}`)
    }

    logger.info('智能体初始化完成，开始执行初始化任务...')

    // 执行初始化任务
    const executeResult = await agent.execute({
      projectName: projectInfo.projectName,
      projectPath: projectInfo.projectPath,
      template: projectInfo.template
    })

    if (!executeResult.success) {
      throw new Error(`项目初始化失败: ${executeResult.error}`)
    }

    logger.completeTask('执行项目初始化')

    // 显示初始化结果
    if (executeResult.data) {
      logger.title('📊 初始化结果')
      logger.item('项目名称', executeResult.data.projectName)
      logger.item('项目路径', executeResult.data.projectPath)
      logger.item('耗时', `${executeResult.data.duration}ms`)
      logger.item('状态', '✅ 成功')

      if (projectInfo.initGit) {
        logger.item('Git仓库', '已初始化')
      }

      if (projectInfo.createFeatureList) {
        logger.item('功能列表', '已创建')
      }
    }

  } catch (error) {
    logger.error('项目初始化执行失败')
    throw error
  }
}

/**
 * 处理初始化错误
 */
function handleInitError(error: unknown, logger: ReturnType<typeof createLogger>): void {
  logger.error('❌ 项目初始化失败')

  if (error instanceof Error) {
    logger.error(`错误信息: ${error.message}`)

    // 提供特定错误的恢复建议
    if (error.message.includes('不为空')) {
      logger.info('💡 建议:')
      logger.info('  1. 使用不同的项目路径')
      logger.info('  2. 清空目标目录')
      logger.info('  3. 使用 --path 参数指定新路径')
    } else if (error.message.includes('权限')) {
      logger.info('💡 建议:')
      logger.info('  1. 检查目录权限')
      logger.info('  2. 尝试使用不同的项目路径')
      logger.info('  3. 以管理员身份运行（如果需要）')
    } else if (error.message.includes('模板')) {
      logger.info('💡 建议:')
      logger.info('  使用 --template 参数指定有效模板:')
      logger.info('    • web-app (默认)')
      logger.info('    • api-service')
      logger.info('    • library')
    }

    if (process.env.DEBUG === 'true' || logger.isDebugEnabled()) {
      logger.debug('详细错误堆栈:', error.stack)
    }
  } else {
    logger.error(`未知错误: ${String(error)}`)
  }

  logger.info('\n💡 获取帮助:')
  logger.info('  $ agent-cli init --help')
  logger.info('  $ agent-cli --help')

  process.exit(1)
}

/**
 * 导出命令模块（符合CLI框架接口）
 */
export const commandModule = {
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
  action: async (cmdOptions: any) => {
    const projectName = cmdOptions.args?.[0]
    await handleInitCommand(projectName, cmdOptions)
  }
}

// 默认导出
export default { createInitCommand, commandModule }