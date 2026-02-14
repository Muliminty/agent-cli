/**
 * 状态查看命令模块
 * 设计思路：显示项目当前状态和进度信息，提供简洁的状态概览
 *
 * 功能特点：
 * 1. 显示项目整体进度和健康状态
 * 2. 列出功能状态和测试结果
 * 3. 显示Git状态和最近活动
 * 4. 提供详细模式查看更多信息
 *
 * 踩坑提醒：
 * 1. 确保正确处理项目未初始化的情况
 * 2. 进度计算要准确，避免误导性显示
 * 3. 表格格式化要适应不同终端宽度
 * 4. 性能要考虑，避免读取大文件时的性能问题
 */

import { Command } from 'commander'
import * as path from 'path'
import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { ProgressTracker } from '../../core/progress/tracker.js'
import { GitManager } from '../../core/git/manager.js'
import type { Feature, FeatureList, ProjectState } from '../../types/index.js'
import type { GitStatus } from '../../core/git/manager.js'

// 状态命令选项
interface StatusCommandOptions {
  /** 详细模式 */
  verbose?: boolean
  /** 显示所有功能 */
  all?: boolean
  /** 显示测试结果 */
  tests?: boolean
  /** 显示Git状态 */
  git?: boolean
  /** 显示进度历史 */
  history?: boolean
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
 * 创建状态命令
 */
export function createStatusCommand(): Command {
  const command = new Command('status')
    .description('查看项目状态 - 显示进度、功能状态和Git信息')
    .option('-v, --verbose', '详细模式，显示更多信息')
    .option('-a, --all', '显示所有功能（包括已完成的功能）')
    .option('-t, --tests', '显示测试结果')
    .option('-g, --git', '显示Git状态')
    .option('-H, --history', '显示进度历史')
    .option('--format <format>', '输出格式 (text, json, yaml)', 'text')
    .option('--debug', '启用调试模式')
    .option('-c, --config <path>', '指定配置文件路径', 'agent.config.json')
    .option('--cwd <path>', '设置工作目录', process.cwd())

    .action(async (options: StatusCommandOptions) => {
      await handleStatusCommand(options)
    })

  // 添加示例
  command.addHelpText('after', `
使用示例:
  $ agent-cli status
  $ agent-cli status --verbose
  $ agent-cli status --all --git
  $ agent-cli status --format json
  $ agent-cli status --tests --history

输出说明:
  • 项目进度: 显示总体完成百分比
  • 健康状态: ✅ 良好 ⚠️ 警告 ❌ 严重
  • 功能状态: 按状态分类的功能数量
  • 下一个功能: 建议接下来实现的功能
  • Git状态: 当前分支和更改状态（如果启用）
  `)

  return command
}

/**
 * 处理状态命令
 */
export async function handleStatusCommand(options: StatusCommandOptions): Promise<void> {
  const logger = createLogger({ debug: options.debug })

  try {
    logger.title('📊 项目状态')

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

    // 根据格式输出状态
    switch (options.format) {
      case 'json':
        await outputJsonStatus(progressTracker, options, logger)
        break
      case 'yaml':
        await outputYamlStatus(progressTracker, options, logger)
        break
      default:
        await outputTextStatus(progressTracker, options, logger)
    }

  } catch (error) {
    handleStatusError(error, logger)
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
 * 输出文本格式状态
 */
async function outputTextStatus(
  progressTracker: ProgressTracker,
  options: StatusCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  // 获取项目数据
  const projectState = progressTracker.getProjectState()
  const featureList = progressTracker.getFeatureList()
  const progressEntries = progressTracker.getProgressEntries()

  // 显示项目概览
  displayProjectOverview(projectState, logger)

  // 显示功能状态
  displayFeatureStatus(featureList, options, logger)

  // 显示下一个功能
  displayNextFeature(progressTracker, logger)

  // 显示Git状态（如果启用）
  if (options.git) {
    await displayGitStatus(progressTracker.config.projectPath, logger)
  }

  // 显示测试结果（如果启用）
  if (options.tests) {
    displayTestResults(projectState, logger)
  }

  // 显示进度历史（如果启用）
  if (options.history) {
    displayProgressHistory(progressEntries, logger)
  }

  // 显示详细信息（如果启用详细模式）
  if (options.verbose) {
    displayVerboseInfo(projectState, featureList, progressEntries, logger)
  }
}

/**
 * 显示项目概览
 */
function displayProjectOverview(projectState: ProjectState, logger: ReturnType<typeof createLogger>): void {
  logger.divider('项目概览')

  // 项目基本信息
  logger.item('项目名称', projectState.projectName)
  logger.item('总体进度', `${projectState.progressPercentage}%`)

  // 健康状态
  const healthIcon = projectState.health === 'healthy' ? '✅' :
                    projectState.health === 'warning' ? '⚠️' : '❌'
  logger.item('健康状态', `${healthIcon} ${projectState.health}`)

  // 最后更新时间
  const lastUpdated = formatDate(projectState.lastUpdated)
  logger.item('最后更新', lastUpdated)

  logger.divider()
}

/**
 * 显示功能状态
 */
function displayFeatureStatus(
  featureList: FeatureList,
  options: StatusCommandOptions,
  logger: ReturnType<typeof createLogger>
): void {
  logger.divider('功能状态')

  // 统计信息
  logger.item('总功能数', featureList.totalCount.toString())
  logger.item('已完成', `${featureList.completedCount} (${calculatePercentage(featureList.completedCount, featureList.totalCount)}%)`)
  logger.item('进行中', featureList.inProgressCount.toString())
  logger.item('阻塞中', featureList.blockedCount.toString())
  logger.item('待完成', (featureList.totalCount - featureList.completedCount).toString())

  logger.divider()

  // 显示功能列表（如果启用详细模式或--all选项）
  if (options.verbose || options.all) {
    displayFeatureList(featureList, options, logger)
  } else {
    // 只显示进行中和阻塞中的功能
    const activeFeatures = featureList.features.filter(f =>
      f.status === 'in_progress' || f.status === 'blocked'
    )

    if (activeFeatures.length > 0) {
      logger.subtitle('活动功能:')
      for (const feature of activeFeatures) {
        const statusIcon = feature.status === 'in_progress' ? '🔄' : '⛔'
        const testIcon = feature.passes ? '✅' : '❌'
        logger.item(`  ${statusIcon} ${feature.id}`, `${feature.description} ${testIcon}`)
      }
    }
  }
}

/**
 * 显示功能列表
 */
function displayFeatureList(
  featureList: FeatureList,
  options: StatusCommandOptions,
  logger: ReturnType<typeof createLogger>
): void {
  const featuresToShow = options.all
    ? featureList.features
    : featureList.features.filter(f => !f.passes) // 只显示未完成的

  if (featuresToShow.length === 0) {
    logger.info('没有功能需要显示')
    return
  }

  logger.subtitle('功能列表:')

  // 按状态分组
  const groupedFeatures = {
    completed: featuresToShow.filter(f => f.passes),
    inProgress: featuresToShow.filter(f => f.status === 'in_progress' && !f.passes),
    blocked: featuresToShow.filter(f => f.status === 'blocked' && !f.passes),
    pending: featuresToShow.filter(f => f.status === 'pending' && !f.passes)
  }

  // 显示进行中的功能
  if (groupedFeatures.inProgress.length > 0) {
    logger.info('🔄 进行中:')
    for (const feature of groupedFeatures.inProgress) {
      logger.item(`  ${feature.id}`, feature.description)
      if (options.verbose) {
        logger.item('    优先级', feature.priority)
        logger.item('    复杂度', feature.estimatedComplexity)
      }
    }
  }

  // 显示阻塞中的功能
  if (groupedFeatures.blocked.length > 0) {
    logger.info('⛔ 阻塞中:')
    for (const feature of groupedFeatures.blocked) {
      logger.item(`  ${feature.id}`, feature.description)
      if (options.verbose && feature.dependencies.length > 0) {
        logger.item('    依赖', feature.dependencies.join(', '))
      }
    }
  }

  // 显示待处理的功能
  if (groupedFeatures.pending.length > 0) {
    logger.info('📝 待处理:')
    for (const feature of groupedFeatures.pending.slice(0, 5)) { // 只显示前5个
      logger.item(`  ${feature.id}`, feature.description)
    }

    if (groupedFeatures.pending.length > 5) {
      logger.info(`  ... 还有 ${groupedFeatures.pending.length - 5} 个待处理功能`)
    }
  }

  // 显示已完成的功能（如果启用--all）
  if (options.all && groupedFeatures.completed.length > 0) {
    logger.info('✅ 已完成:')
    for (const feature of groupedFeatures.completed.slice(0, 3)) { // 只显示最近3个
      const completionDate = formatDate(feature.updatedAt)
      logger.item(`  ${feature.id}`, `${feature.description} (${completionDate})`)
    }

    if (groupedFeatures.completed.length > 3) {
      logger.info(`  ... 还有 ${groupedFeatures.completed.length - 3} 个已完成功能`)
    }
  }
}

/**
 * 显示下一个功能
 */
function displayNextFeature(
  progressTracker: ProgressTracker,
  logger: ReturnType<typeof createLogger>
): void {
  const nextFeature = progressTracker.getNextFeature()

  logger.divider('下一步建议')

  if (nextFeature) {
    logger.info('🎯 建议下一个实现的功能:')
    logger.item('功能ID', nextFeature.id)
    logger.item('描述', nextFeature.description)
    logger.item('优先级', nextFeature.priority)
    logger.item('复杂度', nextFeature.estimatedComplexity)
    logger.item('状态', nextFeature.status)

    if (nextFeature.dependencies.length > 0) {
      const unmetDeps = nextFeature.dependencies.filter(depId => {
        const depFeature = progressTracker.getFeatureList().features.find(f => f.id === depId)
        return !depFeature?.passes
      })

      if (unmetDeps.length > 0) {
        logger.warn('⚠️  需要先完成以下依赖:')
        for (const depId of unmetDeps) {
          const depFeature = progressTracker.getFeatureList().features.find(f => f.id === depId)
          if (depFeature) {
            logger.item(`  ${depId}`, depFeature.description)
          }
        }
      }
    }

    logger.info('\n💡 运行以下命令开始实现:')
    logger.info(`  $ agent-cli next --feature ${nextFeature.id}`)
  } else {
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
    }
  }
}

/**
 * 显示Git状态
 */
async function displayGitStatus(
  projectPath: string,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  try {
    const gitManager = new GitManager({ projectPath })
    const gitStatus = await gitManager.getStatus()

    logger.divider('Git状态')

    logger.item('当前分支', gitStatus.branch)

    if (gitStatus.hasChanges) {
      logger.item('未提交更改', `${gitStatus.unstagedChanges} 个未暂存，${gitStatus.untrackedFiles} 个未跟踪`)
    } else {
      logger.item('工作区', '干净')
    }

    if (gitStatus.lastCommit) {
      const commitDate = formatDate(new Date(gitStatus.lastCommit.date))
      logger.item('最后提交', `${gitStatus.lastCommit.hash.substring(0, 8)} - ${gitStatus.lastCommit.message}`)
      logger.item('提交时间', commitDate)
    }

    if (gitStatus.remote) {
      logger.item('远程仓库', gitStatus.remote.upstream || '未设置')
      if (gitStatus.remote.ahead > 0) {
        logger.item('领先远程', `${gitStatus.remote.ahead} 个提交`)
      }
      if (gitStatus.remote.behind > 0) {
        logger.item('落后远程', `${gitStatus.remote.behind} 个提交`)
      }
    }

    if (gitStatus.merging) {
      logger.warn('⚠️  当前处于合并状态')
    }

  } catch (error) {
    logger.debug(`获取Git状态失败: ${error}`)
    logger.item('Git状态', '未初始化或不可用')
  }
}

/**
 * 显示测试结果
 */
function displayTestResults(
  projectState: ProjectState,
  logger: ReturnType<typeof createLogger>
): void {
  logger.divider('测试结果')

  const totalTests = projectState.testResults.length
  const passedTests = projectState.testResults.filter(t => t.passed).length
  const passRate = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0

  logger.item('测试总数', totalTests.toString())
  logger.item('通过测试', `${passedTests} (${passRate}%)`)
  logger.item('测试通过率', `${projectState.healthDetails.testPassRate}%`)

  if (projectState.healthDetails.codeCoverage !== undefined) {
    logger.item('代码覆盖率', `${projectState.healthDetails.codeCoverage}%`)
  }

  logger.item('构建状态', projectState.healthDetails.buildStatus)

  // 显示最近失败的测试（最多3个）
  const recentFailures = projectState.testResults
    .filter(t => !t.passed)
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 3)

  if (recentFailures.length > 0) {
    logger.warn('最近失败的测试:')
    for (const test of recentFailures) {
      const time = formatDate(test.timestamp)
      logger.item(`  ${test.id}`, `${test.description} (${time})`)
      if (test.error) {
        logger.item('    错误', test.error.substring(0, 100) + '...')
      }
    }
  }
}

/**
 * 显示进度历史
 */
function displayProgressHistory(
  progressEntries: any[],
  logger: ReturnType<typeof createLogger>
): void {
  logger.divider('最近活动')

  const recentEntries = progressEntries.slice(-10).reverse() // 最近10条，最新的在前

  if (recentEntries.length === 0) {
    logger.info('暂无活动记录')
    return
  }

  for (const entry of recentEntries) {
    const time = formatDate(entry.timestamp, true)
    const icon = getProgressIcon(entry.action)
    logger.info(`${icon} [${time}] ${entry.description}`)
  }
}

/**
 * 显示详细信息
 */
function displayVerboseInfo(
  projectState: ProjectState,
  featureList: FeatureList,
  progressEntries: any[],
  logger: ReturnType<typeof createLogger>
): void {
  logger.divider('详细信息')

  // 项目统计
  logger.subtitle('项目统计:')
  logger.item('总工作时间', `${projectState.totalWorkHours} 小时`)
  logger.item('当前焦点', projectState.currentFocus || '无')

  // 依赖状态
  logger.subtitle('依赖状态:')
  logger.item('依赖状态', projectState.healthDetails.dependenciesStatus)

  // 最近错误
  if (projectState.healthDetails.recentErrors.length > 0) {
    logger.subtitle('最近错误:')
    for (const error of projectState.healthDetails.recentErrors.slice(0, 3)) {
      logger.info(`  • ${error}`)
    }
  }

  // 进度跟踪
  logger.subtitle('进度跟踪:')
  logger.item('进度条目总数', progressEntries.length.toString())
  logger.item('功能列表版本', featureList.version)
  logger.item('功能列表创建时间', formatDate(featureList.createdAt))
}

/**
 * 输出JSON格式状态
 */
async function outputJsonStatus(
  progressTracker: ProgressTracker,
  options: StatusCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const projectState = progressTracker.getProjectState()
  const featureList = progressTracker.getFeatureList()
  const progressEntries = progressTracker.getProgressEntries()

  // 构建JSON对象
  const status = {
    timestamp: new Date().toISOString(),
    project: {
      name: projectState.projectName,
      progressPercentage: projectState.progressPercentage,
      health: projectState.health,
      lastUpdated: projectState.lastUpdated.toISOString()
    },
    features: {
      total: featureList.totalCount,
      completed: featureList.completedCount,
      inProgress: featureList.inProgressCount,
      blocked: featureList.blockedCount,
      list: options.all ? featureList.features.map(f => ({
        id: f.id,
        description: f.description,
        status: f.status,
        passes: f.passes,
        priority: f.priority,
        updatedAt: f.updatedAt.toISOString()
      })) : undefined
    },
    nextFeature: (() => {
      const next = progressTracker.getNextFeature()
      return next ? {
        id: next.id,
        description: next.description,
        priority: next.priority
      } : null
    })(),
    ...(options.git ? { git: await getGitStatusJson(progressTracker.config.projectPath) } : {}),
    ...(options.tests ? {
      tests: {
        total: projectState.testResults.length,
        passed: projectState.testResults.filter(t => t.passed).length,
        passRate: projectState.healthDetails.testPassRate
      }
    } : {}),
    ...(options.history ? {
      recentActivities: progressEntries.slice(-20).map(e => ({
        timestamp: e.timestamp.toISOString(),
        action: e.action,
        description: e.description
      }))
    } : {})
  }

  // 输出JSON
  console.log(JSON.stringify(status, null, 2))
}

/**
 * 输出YAML格式状态
 */
async function outputYamlStatus(
  progressTracker: ProgressTracker,
  options: StatusCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  // 暂时先输出JSON，YAML转换需要额外依赖
  await outputJsonStatus(progressTracker, options, logger)
  logger.warn('注意: YAML格式暂未实现，已回退到JSON格式')
}

/**
 * 获取Git状态JSON
 */
async function getGitStatusJson(projectPath: string): Promise<any> {
  try {
    const gitManager = new GitManager({ projectPath })
    const gitStatus = await gitManager.getStatus()

    return {
      branch: gitStatus.branch,
      hasChanges: gitStatus.hasChanges,
      unstagedChanges: gitStatus.unstagedChanges,
      untrackedFiles: gitStatus.untrackedFiles,
      merging: gitStatus.merging,
      lastCommit: gitStatus.lastCommit,
      remote: gitStatus.remote
    }
  } catch (error) {
    return { error: 'Git状态不可用' }
  }
}

/**
 * 处理状态错误
 */
function handleStatusError(error: unknown, logger: ReturnType<typeof createLogger>): void {
  logger.error('❌ 获取项目状态失败')

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
  logger.info('  $ agent-cli status --help')

  process.exit(1)
}

/**
 * 工具函数
 */

function formatDate(date: Date, short: boolean = false): string {
  if (short) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function calculatePercentage(numerator: number, denominator: number): string {
  if (denominator === 0) return '0'
  return Math.round((numerator / denominator) * 100).toString()
}

function getProgressIcon(action: string): string {
  const icons: Record<string, string> = {
    'feature_started': '🚀',
    'feature_completed': '✅',
    'test_passed': '🟢',
    'test_failed': '🔴',
    'commit_created': '📝',
    'error_occurred': '❌'
  }

  return icons[action] || '📌'
}

/**
 * 导出命令模块（符合CLI框架接口）
 */
export const commandModule = {
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
  action: async (cmdOptions: any) => {
    await handleStatusCommand(cmdOptions)
  }
}

// 默认导出
export default { createStatusCommand, commandModule }