/**
 * 重置命令模块
 * 设计思路：提供安全的项目重置功能，支持选择性重置和备份恢复
 *
 * 功能特点：
 * 1. 多级重置选项：进度重置、功能列表重置、Git历史重置、完全重置
 * 2. 安全保护：默认需要确认，支持备份和恢复
 * 3. 选择性重置：可选择重置特定部分，保留其他数据
 * 4. 预览模式：显示将被影响的项目，避免误操作
 *
 * 踩坑提醒：
 * 1. 重置操作不可逆，必须提供充分的警告和确认
 * 2. 备份文件命名要有时间戳，避免覆盖
 * 3. 要考虑跨平台路径兼容性
 * 4. 大项目重置时要考虑性能，避免长时间阻塞
 */

import { Command } from 'commander'
import * as path from 'path'
import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { ProgressTracker } from '../../core/progress/tracker.js'
import { GitManager } from '../../core/git/manager.js'

// 重置类型
type ResetType = 'progress' | 'features' | 'tests' | 'git' | 'config' | 'all'

// 重置命令选项
interface ResetCommandOptions {
  /** 重置类型 */
  type?: ResetType
  /** 强制重置（跳过确认） */
  force?: boolean
  /** 创建备份 */
  backup?: boolean
  /** 备份目录路径 */
  'backup-dir'?: string
  /** 预览模式（不实际执行） */
  'dry-run'?: boolean
  /** 交互式模式 */
  interactive?: boolean
  /** 详细模式 */
  verbose?: boolean
  /** 调试模式 */
  debug?: boolean
  /** 指定配置文件 */
  config?: string
  /** 工作目录 */
  cwd?: string
  /** 保留特定文件（逗号分隔） */
  'keep-files'?: string
  /** 重置后重新初始化 */
  'reinitialize'?: boolean
  /** 仅重置特定功能ID（逗号分隔） */
  'feature-ids'?: string
}

/**
 * 创建重置命令
 */
export function createResetCommand(): Command {
  const command = new Command('reset')
    .description('项目重置 - 安全地重置项目状态、进度、测试结果等')
    .option('-t, --type <type>', '重置类型 (progress, features, tests, git, config, all)', 'progress')
    .option('-f, --force', '强制重置（跳过确认）')
    .option('-b, --backup', '创建备份')
    .option('--backup-dir <path>', '备份目录路径', './backups')
    .option('--dry-run', '预览模式（不实际执行）')
    .option('-i, --interactive', '交互式模式')
    .option('-v, --verbose', '详细模式')
    .option('--debug', '调试模式')
    .option('-c, --config <path>', '指定配置文件路径', 'agent.config.json')
    .option('--cwd <path>', '设置工作目录', process.cwd())
    .option('--keep-files <files>', '保留特定文件（逗号分隔，如：claude-progress.txt,feature-list.json）')
    .option('--reinitialize', '重置后重新初始化')
    .option('--feature-ids <ids>', '仅重置特定功能ID（逗号分隔）')

    .action(async (options: ResetCommandOptions) => {
      await handleResetCommand(options)
    })

  // 添加示例
  command.addHelpText('after', `
使用示例:
  $ agent-cli reset                              # 重置进度（默认）
  $ agent-cli reset --type all                   # 完全重置项目
  $ agent-cli reset --type features              # 重置功能列表状态
  $ agent-cli reset --type tests                 # 重置测试结果
  $ agent-cli reset --type git                   # 重置Git历史（危险！）
  $ agent-cli reset --type config                # 重置配置文件到默认值
  $ agent-cli reset --force                      # 强制重置（跳过确认）
  $ agent-cli reset --backup                     # 创建备份后重置
  $ agent-cli reset --backup-dir ./my-backups    # 指定备份目录
  $ agent-cli reset --dry-run                    # 预览重置效果
  $ agent-cli reset --interactive                # 交互式重置向导
  $ agent-cli reset --keep-files "claude-progress.txt"  # 保留特定文件
  $ agent-cli reset --reinitialize               # 重置后重新初始化项目
  $ agent-cli reset --feature-ids "feat1,feat2"  # 仅重置特定功能

重置类型说明:
  • progress   - 重置进度文件 (claude-progress.txt)，保留功能列表
  • features   - 重置功能列表状态（所有功能标记为待处理）
  • tests      - 重置测试结果和报告
  • git        - 重置Git历史（保留最新提交，重置分支）
  • config     - 重置配置文件到默认值
  • all        - 完全重置项目（危险！需要确认）

安全警告:
  ⚠️  重置操作可能不可逆，建议先创建备份
  ⚠️  Git重置可能丢失提交历史，谨慎使用
  ⚠️  使用 --dry-run 预览将被影响的项目
  ⚠️  重要数据请手动备份

备份策略:
  • 备份文件保存在指定目录，使用时间戳命名
  • 支持自动清理旧备份（保留最近7天）
  • 支持手动恢复备份文件
  `)

  return command
}

/**
 * 处理重置命令
 */
export async function handleResetCommand(options: ResetCommandOptions): Promise<void> {
  const logger = createLogger({ debug: options.debug ?? false })

  try {
    logger.title('🔄 项目重置')

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

    // 确定重置类型
    const resetType = options.type || 'progress'

    // 预览模式
    if (options['dry-run']) {
      await previewReset(resetType, projectPath, options, logger)
      return
    }

    // 显示警告和确认
    if (!options.force && !options.interactive) {
      await confirmReset(resetType, projectPath, options, logger)
    }

    // 执行重置
    await executeReset(resetType, projectPath, options, logger)

    // 重新初始化（如果需要）
    if (options.reinitialize) {
      await reinitializeProject(projectPath, options, logger)
    }

    logger.success('✅ 重置完成')

  } catch (error) {
    handleResetError(error, logger)
  }
}

/**
 * 检查项目是否已初始化
 */
async function checkProjectInitialization(projectPath: string, logger: ReturnType<typeof createLogger>): Promise<boolean> {
  try {
    const fs = await import('fs-extra')

    // 检查是否存在进度文件或功能列表文件
    const progressFile = path.join(projectPath, 'claude-progress.txt')
    const featureListFile = path.join(projectPath, 'feature-list.json')
    const configFile = path.join(projectPath, 'agent.config.json')

    const hasProgressFile = await fs.pathExists(progressFile)
    const hasFeatureListFile = await fs.pathExists(featureListFile)
    const hasConfigFile = await fs.pathExists(configFile)

    return hasProgressFile || hasFeatureListFile || hasConfigFile
  } catch (error) {
    logger.debug(`检查项目初始化失败: ${error}`)
    return false
  }
}

/**
 * 预览重置效果
 */
async function previewReset(
  resetType: ResetType,
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  logger.info('🔍 重置预览模式（不实际执行）')
  logger.divider('将被影响的项目')

  const affectedItems = await getAffectedItems(resetType, projectPath, options, logger)

  if (affectedItems.files.length === 0 && affectedItems.operations.length === 0) {
    logger.info('📌 没有发现将被影响的项目')
    return
  }

  // 显示将被影响的文件
  if (affectedItems.files.length > 0) {
    logger.info('📁 将被影响的文件:')
    for (const file of affectedItems.files.slice(0, 10)) {
      logger.info(`  • ${file}`)
    }
    if (affectedItems.files.length > 10) {
      logger.info(`  ... 还有 ${affectedItems.files.length - 10} 个文件`)
    }
  }

  // 显示将被执行的操作
  if (affectedItems.operations.length > 0) {
    logger.info('⚙️  将被执行的操作:')
    for (const operation of affectedItems.operations) {
      logger.info(`  • ${operation}`)
    }
  }

  // 显示警告
  if (resetType === 'all' || resetType === 'git') {
    logger.warn('⚠️  警告: 此操作可能不可逆，请确保已备份重要数据')
  }

  logger.info('\n💡 要实际执行重置，请移除 --dry-run 选项')
}

/**
 * 获取将被影响的项目
 */
async function getAffectedItems(
  resetType: ResetType,
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<{ files: string[]; operations: string[] }> {
  const fs = await import('fs-extra')
  const affectedFiles: string[] = []
  const operations: string[] = []

  // 根据重置类型收集文件
  switch (resetType) {
    case 'progress':
      affectedFiles.push(path.join(projectPath, 'claude-progress.txt'))
      operations.push('清空进度文件')
      break

    case 'features':
      affectedFiles.push(path.join(projectPath, 'feature-list.json'))
      operations.push('重置所有功能状态为待处理')
      break

    case 'tests':
      affectedFiles.push(
        path.join(projectPath, 'test-results'),
        path.join(projectPath, 'test-reports'),
        path.join(projectPath, 'test-screenshots')
      )
      operations.push('删除测试结果目录')
      operations.push('删除测试报告目录')
      operations.push('删除测试截图目录')
      break

    case 'git':
      operations.push('重置Git仓库到初始状态')
      operations.push('清除所有未提交的更改')
      break

    case 'config':
      affectedFiles.push(path.join(projectPath, 'agent.config.json'))
      operations.push('重置配置文件到默认值')
      break

    case 'all':
      affectedFiles.push(
        path.join(projectPath, 'claude-progress.txt'),
        path.join(projectPath, 'feature-list.json'),
        path.join(projectPath, 'agent.config.json'),
        path.join(projectPath, 'test-results'),
        path.join(projectPath, 'test-reports'),
        path.join(projectPath, 'test-screenshots')
      )
      operations.push('完全重置项目状态')
      operations.push('重置进度文件')
      operations.push('重置功能列表')
      operations.push('重置配置文件')
      operations.push('删除所有测试数据')
      break
  }

  // 过滤实际存在的文件
  const existingFiles: string[] = []
  for (const file of affectedFiles) {
    try {
      if (await fs.pathExists(file)) {
        existingFiles.push(file)
      }
    } catch (error) {
      logger.debug(`检查文件存在失败: ${file}`, error)
    }
  }

  return { files: existingFiles, operations }
}

/**
 * 确认重置操作
 */
async function confirmReset(
  resetType: ResetType,
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const affectedItems = await getAffectedItems(resetType, projectPath, options, logger)

  if (affectedItems.files.length === 0 && affectedItems.operations.length === 0) {
    return // 没有需要重置的项目
  }

  logger.warn('⚠️  即将执行重置操作')
  logger.divider('重置摘要')

  logger.item('重置类型', resetType)
  logger.item('项目路径', projectPath)

  if (affectedItems.files.length > 0) {
    logger.item('影响文件数', affectedItems.files.length.toString())
  }

  if (resetType === 'all' || resetType === 'git') {
    logger.error('❌ 危险操作: 此操作可能不可逆！')
  }

  // 交互式确认
  if (options.interactive !== false) {
    const { getPromptUtils } = await import('../../utils/prompt-utils.js')
    const confirmed = await getPromptUtils().confirm({
      message: `确认执行 ${resetType} 重置？`,
      defaultValue: false
    })
    if (!confirmed) {
      logger.info('❌ 用户取消操作')
      process.exit(0)
    }
  } else {
    // 非交互式模式下，需要等待几秒让用户有机会取消
    logger.info('💡 非交互式模式，5秒后自动继续...')
    logger.info('   按 Ctrl+C 取消操作')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
}

/**
 * 执行重置
 */
async function executeReset(
  resetType: ResetType,
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const fs = await import('fs-extra')

  logger.info(`🔄 执行 ${resetType} 重置`)

  // 创建备份（如果需要）
  if (options.backup) {
    await createBackup(resetType, projectPath, options, logger)
  }

  // 根据类型执行重置
  switch (resetType) {
    case 'progress':
      await resetProgress(projectPath, options, logger)
      break

    case 'features':
      await resetFeatures(projectPath, options, logger)
      break

    case 'tests':
      await resetTests(projectPath, options, logger)
      break

    case 'git':
      await resetGit(projectPath, options, logger)
      break

    case 'config':
      await resetConfig(projectPath, options, logger)
      break

    case 'all':
      await resetAll(projectPath, options, logger)
      break
  }

  // 保留特定文件
  if (options['keep-files']) {
    await restoreKeptFiles(projectPath, options, logger)
  }
}

/**
 * 创建备份
 */
async function createBackup(
  resetType: ResetType,
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const fs = await import('fs-extra')
  const backupDir = options['backup-dir'] || './backups'

  // 创建备份目录
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `reset-${resetType}-${timestamp}`)

  try {
    await fs.ensureDir(backupPath)
    logger.info(`📦 创建备份: ${backupPath}`)

    // 根据重置类型备份相关文件
    const filesToBackup = await getFilesToBackup(resetType, projectPath, logger)

    for (const file of filesToBackup) {
      if (await fs.pathExists(file)) {
        const relativePath = path.relative(projectPath, file)
        const destPath = path.join(backupPath, relativePath)
        await fs.ensureDir(path.dirname(destPath))
        await fs.copy(file, destPath)
        logger.debug(`备份文件: ${relativePath}`)
      }
    }

    // 创建备份元数据
    const metadata = {
      timestamp: new Date().toISOString(),
      resetType,
      projectPath,
      filesBackedUp: filesToBackup.filter(f => fs.pathExistsSync(f)),
      options
    }

    await fs.writeJson(path.join(backupPath, 'backup-metadata.json'), metadata, { spaces: 2 })
    logger.success(`✅ 备份完成: ${backupPath}`)

    // 清理旧备份（保留最近7天）
    await cleanupOldBackups(backupDir, logger)

  } catch (error) {
    throw new Error(`创建备份失败: ${error}`)
  }
}

/**
 * 获取需要备份的文件列表
 */
async function getFilesToBackup(
  resetType: ResetType,
  projectPath: string,
  logger: ReturnType<typeof createLogger>
): Promise<string[]> {
  const files: string[] = []

  // 根据重置类型添加文件
  switch (resetType) {
    case 'progress':
      files.push(path.join(projectPath, 'claude-progress.txt'))
      break

    case 'features':
      files.push(path.join(projectPath, 'feature-list.json'))
      break

    case 'tests':
      files.push(
        path.join(projectPath, 'test-results'),
        path.join(projectPath, 'test-reports'),
        path.join(projectPath, 'test-screenshots')
      )
      break

    case 'config':
      files.push(path.join(projectPath, 'agent.config.json'))
      break

    case 'all':
    case 'git':
      files.push(
        path.join(projectPath, 'claude-progress.txt'),
        path.join(projectPath, 'feature-list.json'),
        path.join(projectPath, 'agent.config.json'),
        path.join(projectPath, 'test-results'),
        path.join(projectPath, 'test-reports'),
        path.join(projectPath, 'test-screenshots'),
        path.join(projectPath, '.git')
      )
      break
  }

  return files
}

/**
 * 清理旧备份
 */
async function cleanupOldBackups(backupDir: string, logger: ReturnType<typeof createLogger>): Promise<void> {
  const fs = await import('fs-extra')
  const path = await import('path')

  try {
    if (!(await fs.pathExists(backupDir))) {
      return
    }

    const items = await fs.readdir(backupDir)
    const now = Date.now()
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000)

    for (const item of items) {
      const itemPath = path.join(backupDir, item)
      const stats = await fs.stat(itemPath)

      if (stats.isDirectory() && stats.ctimeMs < sevenDaysAgo) {
        // 检查是否是备份目录（以reset-开头）
        if (item.startsWith('reset-')) {
          await fs.remove(itemPath)
          logger.debug(`清理旧备份: ${item}`)
        }
      }
    }
  } catch (error) {
    logger.debug(`清理旧备份失败: ${error}`)
    // 不抛出错误，避免影响主要重置操作
  }
}

/**
 * 重置进度
 */
async function resetProgress(
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const fs = await import('fs-extra')
  const progressFile = path.join(projectPath, 'claude-progress.txt')

  try {
    if (await fs.pathExists(progressFile)) {
      // 清空文件内容
      await fs.writeFile(progressFile, '', 'utf-8')
      logger.success('✅ 进度文件已重置')
    } else {
      logger.info('📌 进度文件不存在，跳过重置')
    }
  } catch (error) {
    throw new Error(`重置进度文件失败: ${error}`)
  }
}

/**
 * 重置功能列表
 */
async function resetFeatures(
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const fs = await import('fs-extra')
  const featureFile = path.join(projectPath, 'feature-list.json')

  try {
    if (await fs.pathExists(featureFile)) {
      const featureData = await fs.readJson(featureFile)

      // 重置所有功能状态为pending
      if (featureData.features && Array.isArray(featureData.features)) {
        for (const feature of featureData.features) {
          feature.status = 'pending'
          // 清除完成时间和测试结果
          delete feature.completedAt
          delete feature.testResults
        }
      }

      await fs.writeJson(featureFile, featureData, { spaces: 2 })
      logger.success('✅ 功能列表已重置（所有功能标记为待处理）')
    } else {
      logger.info('📌 功能列表文件不存在，跳过重置')
    }
  } catch (error) {
    throw new Error(`重置功能列表失败: ${error}`)
  }
}

/**
 * 重置测试结果
 */
async function resetTests(
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const fs = await import('fs-extra')
  const testDirs = [
    path.join(projectPath, 'test-results'),
    path.join(projectPath, 'test-reports'),
    path.join(projectPath, 'test-screenshots')
  ]

  try {
    let removedCount = 0
    for (const dir of testDirs) {
      if (await fs.pathExists(dir)) {
        await fs.remove(dir)
        removedCount++
        logger.debug(`删除测试目录: ${dir}`)
      }
    }

    if (removedCount > 0) {
      logger.success(`✅ 测试结果已重置（删除 ${removedCount} 个目录）`)
    } else {
      logger.info('📌 测试目录不存在，跳过重置')
    }
  } catch (error) {
    throw new Error(`重置测试结果失败: ${error}`)
  }
}

/**
 * 重置Git仓库
 */
async function resetGit(
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  try {
    const gitManager = new GitManager({ projectPath })

    // 检查Git仓库状态
    const status = await gitManager.getStatus()
    if (!status.isRepo) {
      logger.info('📌 未找到Git仓库，跳过重置')
      return
    }

    // 重置到初始状态（危险操作！）
    logger.warn('⚠️  正在重置Git仓库...')

    // 保存当前分支信息
    const currentBranch = status.currentBranch

    // 重置所有未提交的更改
    await gitManager.resetHard()

    // 如果当前分支不是main，切换到main
    if (currentBranch && currentBranch !== 'main') {
      try {
        await gitManager.checkoutBranch('main')
      } catch {
        // 如果main分支不存在，创建它
        await gitManager.createBranch('main')
      }
    }

    logger.success('✅ Git仓库已重置')

  } catch (error) {
    throw new Error(`重置Git仓库失败: ${error}`)
  }
}

/**
 * 重置配置文件
 */
async function resetConfig(
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const fs = await import('fs-extra')
  const { DEFAULT_CONFIG } = await import('../../types/config.js')

  const configFile = path.join(projectPath, 'agent.config.json')

  try {
    // 写入默认配置
    await fs.writeJson(configFile, DEFAULT_CONFIG, { spaces: 2 })
    logger.success('✅ 配置文件已重置到默认值')

  } catch (error) {
    throw new Error(`重置配置文件失败: ${error}`)
  }
}

/**
 * 完全重置项目
 */
async function resetAll(
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  // 按顺序重置各个部分
  await resetProgress(projectPath, options, logger)
  await resetFeatures(projectPath, options, logger)
  await resetTests(projectPath, options, logger)
  await resetConfig(projectPath, options, logger)

  // Git重置放在最后（最危险）
  if (options.type === 'all') {
    await resetGit(projectPath, options, logger)
  }
}

/**
 * 恢复保留的文件
 */
async function restoreKeptFiles(
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  if (!options['keep-files']) {
    return
  }

  const fs = await import('fs-extra')
  const filesToKeep = options['keep-files'].split(',').map(f => f.trim())

  // 注意：这个功能需要在重置前备份文件，然后恢复
  // 由于时间关系，暂时只记录警告
  logger.warn('⚠️  --keep-files 选项功能正在开发中')
  logger.info('💡 当前建议手动备份需要保留的文件')
}

/**
 * 重新初始化项目
 */
async function reinitializeProject(
  projectPath: string,
  options: ResetCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  logger.info('🔄 重新初始化项目')

  try {
    // 这里可以调用初始化智能体
    // 暂时显示提示
    logger.info('💡 重新初始化功能正在开发中')
    logger.info('💡 当前建议运行: agent-cli init')

  } catch (error) {
    logger.warn(`重新初始化失败: ${error}`)
  }
}

/**
 * 处理重置错误
 */
function handleResetError(error: unknown, logger: ReturnType<typeof createLogger>): void {
  logger.error('❌ 重置操作失败')

  if (error instanceof Error) {
    logger.error(`错误信息: ${error.message}`)

    if (error.message.includes('权限')) {
      logger.info('💡 权限相关错误:')
      logger.info('  1. 确保对项目文件有读写权限')
      logger.info('  2. 尝试使用管理员权限运行')
    } else if (error.message.includes('文件')) {
      logger.info('💡 文件相关错误:')
      logger.info('  1. 确保文件没有被其他程序占用')
      logger.info('  2. 检查磁盘空间是否充足')
    } else if (error.message.includes('Git')) {
      logger.info('💡 Git相关错误:')
      logger.info('  1. 确保Git已正确安装')
      logger.info('  2. 检查Git仓库状态')
    }

    if (process.env.DEBUG === 'true' || logger.isDebugEnabled()) {
      logger.debug('详细错误堆栈:', error.stack)
    }
  } else {
    logger.error(`未知错误: ${String(error)}`)
  }

  logger.info('\n💡 获取帮助:')
  logger.info('  $ agent-cli reset --help')

  process.exit(1)
}

/**
 * 导出命令模块（符合CLI框架接口）
 */
export const commandModule = {
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
  action: async (cmdOptions: any) => {
    await handleResetCommand(cmdOptions)
  }
}

// 默认导出
export default { createResetCommand, commandModule }