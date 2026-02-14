/**
 * 下一步实现命令模块
 * 设计思路：获取下一个推荐实现的功能，提供详细信息和开始实现的选项
 *
 * 功能特点：
 * 1. 智能推荐下一个功能，考虑优先级和依赖关系
 * 2. 提供功能详细信息和实现步骤
 * 3. 支持直接开始实现（标记为进行中）
 * 4. 支持指定特定功能进行处理
 * 5. 集成Git提交和工作流
 *
 * 踩坑提醒：
 * 1. 依赖关系验证要准确，避免循环依赖
 * 2. 状态更新要原子性，确保数据一致性
 * 3. 用户确认要友好，提供撤销选项
 * 4. 集成测试验证要自动执行
 */

import { Command } from 'commander'
import * as path from 'path'
import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { ProgressTracker } from '../../core/progress/tracker.js'
import type { Feature } from '../../types/feature.js'

// 下一步命令选项
interface NextCommandOptions {
  /** 指定功能ID（覆盖自动选择） */
  feature?: string
  /** 开始实现功能（标记为进行中） */
  start?: boolean
  /** 只显示信息，不修改状态 */
  info?: boolean
  /** 详细模式 */
  verbose?: boolean
  /** 调试模式 */
  debug?: boolean
  /** 指定配置文件 */
  config?: string
  /** 工作目录 */
  cwd?: string
}

/**
 * 创建下一步命令
 */
export function createNextCommand(): Command {
  const command = new Command('next')
    .description('下一步实现 - 获取下一个推荐功能并开始实现')
    .option('-f, --feature <id>', '指定功能ID（默认自动选择下一个）')
    .option('-s, --start', '开始实现功能（将功能标记为进行中）', false)
    .option('-i, --info', '只显示信息，不修改状态', false)
    .option('-v, --verbose', '详细模式，显示更多信息')
    .option('--debug', '启用调试模式')
    .option('-c, --config <path>', '指定配置文件路径', 'agent.config.json')
    .option('--cwd <path>', '设置工作目录', process.cwd())

    .action(async (options: NextCommandOptions) => {
      await handleNextCommand(options)
    })

  // 添加示例
  command.addHelpText('after', `
使用示例:
  $ agent-cli next                    # 显示下一个推荐功能
  $ agent-cli next --start            # 显示并开始实现下一个功能
  $ agent-cli next --feature feat-123 # 指定功能ID查看信息
  $ agent-cli next --info             # 只显示信息，不修改状态
  $ agent-cli next --verbose          # 显示详细信息和依赖关系
  $ agent-cli next --debug            # 调试模式，显示内部状态

工作流程:
  1. 运行 agent-cli next 查看推荐的下一个功能
  2. 运行 agent-cli next --start 开始实现
  3. 实现功能并运行测试
  4. 运行 agent-cli status 查看进度
  5. 重复直到所有功能完成
  `)

  return command
}

/**
 * 处理下一步命令
 */
export async function handleNextCommand(options: NextCommandOptions): Promise<void> {
  const logger = createLogger({ debug: options.debug })

  try {
    logger.title('🎯 下一步实现')

    // 加载配置
    const config = await loadConfig(options.config, options.cwd)
    const projectPath = options.cwd || process.cwd()

    // 检查项目是否已初始化
    const isInitialized = await checkProjectInitialization(projectPath, logger)
    if (!isInitialized) {
      logger.warn('项目未初始化或未找到进度文件')
      logger.info('💡 运行以下命令初始化项目:')
      logger.info('  $ agent-cli init <project-name>')
      return
    }

    // 加载进度跟踪器
    const progressTracker = await loadProgressTracker(projectPath, logger)

    // 获取功能（指定或自动推荐）
    const feature = await getTargetFeature(progressTracker, options, logger)
    if (!feature) {
      // 没有可用功能
      return
    }

    // 显示功能信息
    await displayFeatureInfo(feature, progressTracker, options, logger)

    // 如果需要，开始实现
    if (options.start && !options.info) {
      await startFeatureImplementation(feature, progressTracker, logger)
    }

  } catch (error) {
    handleNextError(error, logger)
  }
}

/**
 * 检查项目是否已初始化
 */
async function checkProjectInitialization(projectPath: string, logger: ReturnType<typeof createLogger>): Promise<boolean> {
  try {
    const fs = await import('fs-extra')

    // 检查是否存在进度文件
    const progressFile = path.join(projectPath, 'claude-progress.txt')
    const featureListFile = path.join(projectPath, 'feature-list.json')

    const hasProgressFile = await fs.pathExists(progressFile)
    const hasFeatureListFile = await fs.pathExists(featureListFile)

    return hasProgressFile || hasFeatureListFile
  } catch (error) {
    logger.debug(`检查项目初始化失败: ${error}`)
    return false
  }
}

/**
 * 加载进度跟踪器
 */
async function loadProgressTracker(
  projectPath: string,
  logger: ReturnType<typeof createLogger>
): Promise<ProgressTracker> {
  try {
    const progressTracker = new ProgressTracker({
      projectPath,
      autoSave: false,
      verbose: false
    })

    await progressTracker.initialize()
    return progressTracker
  } catch (error) {
    throw new Error(`加载进度跟踪器失败: ${error}`)
  }
}

/**
 * 获取目标功能
 */
async function getTargetFeature(
  progressTracker: ProgressTracker,
  options: NextCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<Feature | null> {
  if (options.feature) {
    // 获取指定功能
    const feature = progressTracker.getFeatureList().features.find(f => f.id === options.feature)
    if (!feature) {
      logger.error(`❌ 未找到功能: ${options.feature}`)
      logger.info('💡 可用的功能ID:')
      const featureList = progressTracker.getFeatureList()
      for (const f of featureList.features.slice(0, 10)) {
        logger.info(`  • ${f.id}: ${f.description}`)
      }
      if (featureList.features.length > 10) {
        logger.info(`  ... 还有 ${featureList.features.length - 10} 个功能`)
      }
      return null
    }
    return feature
  } else {
    // 获取下一个推荐功能
    const nextFeature = progressTracker.getNextFeature()
    if (!nextFeature) {
      const featureList = progressTracker.getFeatureList()
      if (featureList.completedCount === featureList.totalCount) {
        logger.success('🎉 所有功能已完成！')
        logger.info('💡 可以考虑:')
        logger.info('  1. 运行测试: agent-cli test')
        logger.info('  2. 生成报告: agent-cli report')
        logger.info('  3. 部署项目或开始新项目')
      } else {
        logger.warn('没有可用的下一个功能')
        logger.info('可能原因:')
        logger.info('  1. 所有功能都在等待依赖')
        logger.info('  2. 有阻塞的功能需要解决')
        logger.info('  3. 需要重新评估功能优先级')

        // 显示阻塞的功能
        const blockedFeatures = featureList.features.filter(f => f.status === 'blocked')
        if (blockedFeatures.length > 0) {
          logger.info('阻塞的功能:')
          for (const f of blockedFeatures.slice(0, 5)) {
            logger.info(`  • ${f.id}: ${f.description}`)
          }
        }
      }
      return null
    }
    return nextFeature
  }
}

/**
 * 显示功能信息
 */
async function displayFeatureInfo(
  feature: Feature,
  progressTracker: ProgressTracker,
  options: NextCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  logger.divider('功能信息')

  // 基本信息
  logger.item('功能ID', feature.id)
  logger.item('描述', feature.description)
  logger.item('分类', feature.category)
  logger.item('优先级', feature.priority)
  logger.item('预估复杂度', feature.estimatedComplexity)
  logger.item('状态', getStatusDisplay(feature.status))
  logger.item('测试通过', feature.passes ? '✅ 是' : '❌ 否')

  // 依赖关系
  if (feature.dependencies.length > 0) {
    const featureList = progressTracker.getFeatureList()
    const unmetDeps = feature.dependencies.filter(depId => {
      const depFeature = featureList.features.find(f => f.id === depId)
      return !depFeature?.passes
    })

    if (unmetDeps.length > 0) {
      logger.warn('⚠️  未满足的依赖:')
      for (const depId of unmetDeps) {
        const depFeature = featureList.features.find(f => f.id === depId)
        if (depFeature) {
          const statusIcon = depFeature.passes ? '✅' : '❌'
          logger.item(`  ${depId}`, `${depFeature.description} ${statusIcon}`)
        }
      }
    } else {
      logger.info('✅ 所有依赖已满足')
    }
  }

  // 实现步骤
  if (feature.steps.length > 0 && (options.verbose || options.info)) {
    logger.divider('实现步骤')
    for (let i = 0; i < feature.steps.length; i++) {
      logger.item(`步骤 ${i + 1}`, feature.steps[i])
    }
  }

  // 相关文件
  if (feature.relatedFiles && feature.relatedFiles.length > 0 && options.verbose) {
    logger.divider('相关文件')
    for (const file of feature.relatedFiles) {
      logger.item('文件', file)
    }
  }

  // 测试结果
  if (feature.testResults && feature.testResults.length > 0 && options.verbose) {
    logger.divider('测试结果')
    const passedTests = feature.testResults.filter(t => t.passed).length
    const totalTests = feature.testResults.length
    logger.item('测试通过率', `${passedTests}/${totalTests} (${Math.round((passedTests / totalTests) * 100)}%)`)
  }

  logger.divider()

  // 下一步建议
  if (!options.feature && !options.start && !options.info) {
    logger.info('💡 运行以下命令开始实现:')
    logger.info(`  $ agent-cli next --start`)
    logger.info(`  $ agent-cli next --feature ${feature.id} --start`)
  } else if (options.feature && !options.start && !options.info) {
    logger.info('💡 运行以下命令开始实现此功能:')
    logger.info(`  $ agent-cli next --feature ${feature.id} --start`)
  }
}

/**
 * 开始功能实现
 */
async function startFeatureImplementation(
  feature: Feature,
  progressTracker: ProgressTracker,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  // 检查功能是否已经完成
  if (feature.passes) {
    logger.warn(`功能 ${feature.id} 已经完成`)
    return
  }

  // 检查依赖是否满足
  const featureList = progressTracker.getFeatureList()
  const unmetDeps = feature.dependencies.filter(depId => {
    const depFeature = featureList.features.find(f => f.id === depId)
    return !depFeature?.passes
  })

  if (unmetDeps.length > 0) {
    logger.error(`❌ 无法开始功能 ${feature.id}: 存在未满足的依赖`)
    logger.info('需要先完成以下功能:')
    for (const depId of unmetDeps) {
      const depFeature = featureList.features.find(f => f.id === depId)
      if (depFeature) {
        logger.info(`  • ${depId}: ${depFeature.description}`)
      }
    }
    return
  }

  try {
    // 更新功能状态为进行中
    await progressTracker.updateFeature(feature.id, {
      status: 'in_progress',
      notes: `开始实现于 ${new Date().toLocaleString('zh-CN')}`
    })

    logger.success(`✅ 已开始功能实现: ${feature.id}`)
    logger.info('下一步操作:')
    logger.info('  1. 按照实现步骤编写代码')
    logger.info('  2. 运行测试验证实现')
    logger.info('  3. 使用 agent-cli status 查看进度')

    // 记录进度
    await progressTracker.addProgressEntry({
      action: 'feature_started',
      featureId: feature.id,
      description: `开始实现功能: ${feature.description}`,
      details: {
        featureId: feature.id,
        priority: feature.priority
      }
    })

    // 保存进度数据
    await progressTracker.saveAllData()

  } catch (error) {
    throw new Error(`开始功能实现失败: ${error}`)
  }
}

/**
 * 处理下一步命令错误
 */
function handleNextError(error: unknown, logger: ReturnType<typeof createLogger>): void {
  logger.error('❌ 下一步命令执行失败')

  if (error instanceof Error) {
    logger.error(`错误信息: ${error.message}`)

    if (error.message.includes('未初始化')) {
      logger.info('💡 运行以下命令初始化项目:')
      logger.info('  $ agent-cli init <project-name>')
    } else if (error.message.includes('找不到文件')) {
      logger.info('💡 确保当前目录是正确的项目目录')
      logger.info('💡 或者使用 --cwd 参数指定项目路径')
    }

    if (process.env.DEBUG === 'true' || logger.isDebugEnabled()) {
      logger.debug('详细错误堆栈:', error.stack)
    }
  } else {
    logger.error(`未知错误: ${String(error)}`)
  }

  logger.info('\n💡 获取帮助:')
  logger.info('  $ agent-cli next --help')

  process.exit(1)
}

/**
 * 工具函数
 */

function getStatusDisplay(status: string): string {
  const statusMap: Record<string, string> = {
    'pending': '⏳ 待处理',
    'in_progress': '🔄 进行中',
    'completed': '✅ 已完成',
    'blocked': '⛔ 阻塞中'
  }
  return statusMap[status] || status
}

/**
 * 导出命令模块（符合CLI框架接口）
 */
export const commandModule = {
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
  action: async (cmdOptions: any) => {
    await handleNextCommand(cmdOptions)
  }
}

// 默认导出
export default { createNextCommand, commandModule }