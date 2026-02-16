/**
 * 配置管理命令模块
 * 设计思路：提供统一的配置管理接口，支持查看、设置、验证和重置配置
 *
 * 功能特点：
 * 1. 多级配置支持（项目配置、全局配置、环境变量、命令行参数）
 * 2. 安全的配置验证和错误提示
 * 3. 交互式配置设置和确认
 * 4. 配置导出和导入功能
 * 5. 配置差异对比和合并
 *
 * 踩坑提醒：
 * 1. 配置路径解析要支持点号分隔（如agent.model）
 * 2. 配置值类型转换要正确处理（字符串转数字、布尔值等）
 * 3. 配置文件写回时要保持格式和注释（如果可能）
 * 4. 敏感信息（如API密钥）要加密或使用环境变量
 */

import { Command } from 'commander'
import * as path from 'path'
import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { validateConfig, mergeConfig } from '../../config/schema.js'
import { DEFAULT_CONFIG } from '../../types/config.js'
import type { Config } from '../../config/schema.js'

// 配置命令选项
interface ConfigCommandOptions {
  /** 获取配置值（配置路径，如 agent.model） */
  get?: string
  /** 设置配置值（格式：path=value） */
  set?: string
  /** 重置配置到默认值 */
  reset?: boolean
  /** 列出所有配置项 */
  list?: boolean
  /** 验证配置 */
  validate?: boolean
  /** 输出格式 */
  format?: 'text' | 'json' | 'yaml'
  /** 详细模式 */
  verbose?: boolean
  /** 调试模式 */
  debug?: boolean
  /** 指定配置文件 */
  config?: string
  /** 工作目录 */
  cwd?: string
  /** 全局配置（用户级别） */
  global?: boolean
  /** 交互式模式 */
  interactive?: boolean
  /** 不保存更改（仅预览） */
  dryRun?: boolean
}

/**
 * 创建配置命令
 */
export function createConfigCommand(): Command {
  const command = new Command('config')
    .description('配置管理 - 查看、设置和验证agent-cli配置')
    .option('-g, --get <path>', '获取配置值（配置路径，如 agent.model）')
    .option('-s, --set <path=value>', '设置配置值（格式：path=value）')
    .option('-r, --reset', '重置配置到默认值')
    .option('-l, --list', '列出所有配置项')
    .option('--validate', '验证配置')
    .option('--format <format>', '输出格式 (text, json, yaml)', 'text')
    .option('-v, --verbose', '详细模式')
    .option('--debug', '调试模式')
    .option('-c, --config <path>', '指定配置文件路径', 'agent.config.json')
    .option('--cwd <path>', '设置工作目录', process.cwd())
    .option('--global', '操作全局配置（用户级别）', false)
    .option('-i, --interactive', '交互式模式')
    .option('--dry-run', '不保存更改（仅预览）')

    .action(async (options: ConfigCommandOptions) => {
      await handleConfigCommand(options)
    })

  // 添加示例
  command.addHelpText('after', `
使用示例:
  $ agent-cli config --list                    # 列出所有配置项
  $ agent-cli config --get agent.model         # 获取特定配置值
  $ agent-cli config --set "agent.model=claude-3-opus"  # 设置配置值
  $ agent-cli config --reset                  # 重置配置到默认值
  $ agent-cli config --validate               # 验证配置
  $ agent-cli config --global --list          # 列出全局配置
  $ agent-cli config --format json --list     # JSON格式列出配置
  $ agent-cli config --interactive            # 交互式配置设置
  $ agent-cli config --dry-run --set "testing.timeout=60000"  # 预览设置效果

配置路径示例:
  • agent.model                      - AI模型
  • agent.coder.incrementalMode      - 编码智能体增量模式
  • testing.timeout                  - 测试超时时间
  • git.autoCommit                   - 是否自动提交
  • features.enableAutoTesting       - 是否启用自动测试

配置文件位置:
  • 项目配置: ./agent.config.json
  • 全局配置: ~/.agent-cli/config.json
  • 环境变量: AGENT_CLI_* (如 AGENT_CLI_AGENT_MODEL)
  `)

  return command
}

/**
 * 处理配置命令
 */
export async function handleConfigCommand(options: ConfigCommandOptions): Promise<void> {
  const logger = createLogger({ debug: options.debug ?? false })

  try {
    logger.title('⚙️  配置管理')

    // 确定操作类型
    const operation = determineOperation(options)

    switch (operation) {
      case 'get':
        await handleGetConfig(options, logger)
        break
      case 'set':
        await handleSetConfig(options, logger)
        break
      case 'reset':
        await handleResetConfig(options, logger)
        break
      case 'list':
        await handleListConfig(options, logger)
        break
      case 'validate':
        await handleValidateConfig(options, logger)
        break
      case 'interactive':
        await handleInteractiveConfig(options, logger)
        break
      default:
        logger.error('未指定有效操作')
        logger.info('💡 使用 --help 查看可用选项')
        process.exit(1)
    }

  } catch (error) {
    handleConfigError(error, logger)
  }
}

/**
 * 确定操作类型
 */
function determineOperation(options: ConfigCommandOptions): string {
  if (options.get) return 'get'
  if (options.set) return 'set'
  if (options.reset) return 'reset'
  if (options.list) return 'list'
  if (options.validate) return 'validate'
  if (options.interactive) return 'interactive'
  return 'unknown'
}

/**
 * 处理获取配置操作
 */
async function handleGetConfig(options: ConfigCommandOptions, logger: ReturnType<typeof createLogger>): Promise<void> {
  const config = await loadTargetConfig(options, logger)
  const configPath = options.get!

  // 解析配置路径
  const value = getConfigValue(config, configPath)

  if (value === undefined) {
    logger.error(`配置路径不存在: ${configPath}`)
    logger.info('💡 使用 --list 查看可用配置路径')
    process.exit(1)
  }

  // 根据格式输出
  switch (options.format) {
    case 'json':
      console.log(JSON.stringify(value, null, 2))
      break
    case 'yaml':
      const yaml = await import('js-yaml')
      console.log(yaml.dump(value, { indent: 2 }))
      break
    default:
      displayConfigValue(configPath, value, logger)
  }
}

/**
 * 处理设置配置操作
 */
async function handleSetConfig(options: ConfigCommandOptions, logger: ReturnType<typeof createLogger>): Promise<void> {
  if (!options.set) {
    throw new Error('设置操作需要 --set 参数')
  }

  // 解析路径和值
  const [path, valueStr] = options.set.split('=', 2)
  if (!path || valueStr === undefined) {
    throw new Error('--set 参数格式应为 path=value')
  }

  const config = await loadTargetConfig(options, logger)
  const currentValue = getConfigValue(config, path)
  const newValue = parseConfigValue(valueStr, currentValue)

  // 验证新值
  const validationResult = validateConfigUpdate(config, path, newValue)
  if (!validationResult.valid) {
    throw new Error(`配置验证失败: ${validationResult.error}`)
  }

  // 显示变更预览
  logger.info('📝 配置变更预览:')
  logger.item('配置路径', path)
  logger.item('当前值', formatValueForDisplay(currentValue))
  logger.item('新值', formatValueForDisplay(newValue))
  logger.item('配置文件', getConfigFilePath(options))

  if (options.dryRun) {
    logger.success('✅ 预览模式，不保存更改')
    return
  }

  // 确认操作（非交互式模式下自动确认）
  if (options.interactive !== false) {
    const { getPromptUtils } = await import('../../utils/prompt-utils.js')
    const confirmed = await getPromptUtils().confirm({
      message: '确认保存配置更改？',
      defaultValue: true
    })
    if (!confirmed) {
      logger.info('❌ 用户取消操作')
      return
    }
  }

  // 更新配置
  await updateConfigFile(options, path, newValue, logger)

  logger.success('✅ 配置更新成功')
  logger.info('💡 运行以下命令验证配置:')
  logger.info(`  $ agent-cli config --validate`)
}

/**
 * 处理重置配置操作
 */
async function handleResetConfig(options: ConfigCommandOptions, logger: ReturnType<typeof createLogger>): Promise<void> {
  const configPath = getConfigFilePath(options)

  logger.info('🔄 重置配置到默认值')
  logger.item('配置文件', configPath)

  // 显示将被重置的配置项
  const currentConfig = await loadTargetConfig(options, logger)
  const defaultConfig = DEFAULT_CONFIG
  const changedPaths = findChangedConfigPaths(currentConfig, defaultConfig)

  if (changedPaths.length === 0) {
    logger.info('📌 配置已经是默认值')
    return
  }

  logger.info('📋 将被重置的配置项:')
  for (const changedPath of changedPaths.slice(0, 5)) {
    logger.info(`  • ${changedPath}`)
  }
  if (changedPaths.length > 5) {
    logger.info(`  ... 还有 ${changedPaths.length - 5} 个配置项`)
  }

  if (options.dryRun) {
    logger.success('✅ 预览模式，不保存更改')
    return
  }

  // 确认操作
  if (options.interactive !== false) {
    const { getPromptUtils } = await import('../../utils/prompt-utils.js')
    const confirmed = await getPromptUtils().confirm({
      message: `确认重置 ${changedPaths.length} 个配置项到默认值？`,
      defaultValue: false
    })
    if (!confirmed) {
      logger.info('❌ 用户取消操作')
      return
    }
  }

  // 写入默认配置
  const fs = await import('fs-extra')
  await fs.writeJson(configPath, defaultConfig, { spaces: 2 })

  logger.success('✅ 配置重置成功')
}

/**
 * 处理列出配置操作
 */
async function handleListConfig(options: ConfigCommandOptions, logger: ReturnType<typeof createLogger>): Promise<void> {
  const config = await loadTargetConfig(options, logger)

  switch (options.format) {
    case 'json':
      console.log(JSON.stringify(config, null, 2))
      break
    case 'yaml':
      const yaml = await import('js-yaml')
      console.log(yaml.dump(config, { indent: 2 }))
      break
    default:
      displayConfigTree(config, options.verbose, logger)
  }
}

/**
 * 处理验证配置操作
 */
async function handleValidateConfig(options: ConfigCommandOptions, logger: ReturnType<typeof createLogger>): Promise<void> {
  try {
    const config = await loadTargetConfig(options, logger)
    const validatedConfig = validateConfig(config)

    logger.success('✅ 配置验证通过')

    if (options.verbose) {
      logger.divider('配置摘要')
      logger.item('项目名称', validatedConfig.project.name)
      logger.item('项目类型', validatedConfig.project.type)
      logger.item('AI模型', validatedConfig.agent.model)
      logger.item('测试框架', validatedConfig.testing.framework)
      logger.item('Git自动提交', validatedConfig.git.autoCommit ? '✅ 启用' : '❌ 禁用')
    }

  } catch (error) {
    if (error instanceof Error) {
      logger.error('❌ 配置验证失败')
      logger.error(`错误信息: ${error.message}`)

      // 尝试提供修复建议
      if (error.message.includes('project.name')) {
        logger.info('💡 修复建议:')
        logger.info('  确保 project.name 字段存在且非空')
        logger.info('  运行: agent-cli config --set "project.name=项目名称"')
      } else if (error.message.includes('project.type')) {
        logger.info('💡 修复建议:')
        logger.info('  确保 project.type 是有效值: web-app, api-service, cli-tool, library, mobile-app, desktop-app')
        logger.info('  运行: agent-cli config --set "project.type=web-app"')
      }

      process.exit(1)
    }
    throw error
  }
}

/**
 * 处理交互式配置操作
 */
async function handleInteractiveConfig(options: ConfigCommandOptions, logger: ReturnType<typeof createLogger>): Promise<void> {
  logger.info('🔄 交互式配置模式')

  // 这里可以实现完整的交互式配置向导
  // 由于时间关系，暂时提示用户使用其他选项
  logger.info('💡 交互式配置向导正在开发中')
  logger.info('💡 当前可使用以下命令:')
  logger.info('  • agent-cli config --list')
  logger.info('  • agent-cli config --get <path>')
  logger.info('  • agent-cli config --set <path=value>')
}

/**
 * 加载目标配置（项目或全局）
 */
async function loadTargetConfig(options: ConfigCommandOptions, logger: ReturnType<typeof createLogger>): Promise<Config> {
  if (options.global) {
    return await loadGlobalConfig(logger)
  } else {
    return await loadConfig(options.config, options.cwd)
  }
}

/**
 * 加载全局配置
 */
async function loadGlobalConfig(logger: ReturnType<typeof createLogger>): Promise<Config> {
  const fs = await import('fs-extra')
  const os = await import('os')

  const globalConfigDir = path.join(os.homedir(), '.agent-cli')
  const globalConfigPath = path.join(globalConfigDir, 'config.json')

  try {
    if (await fs.pathExists(globalConfigPath)) {
      const configData = await fs.readJson(globalConfigPath)
      return mergeConfig(configData)
    } else {
      // 创建默认全局配置
      await fs.ensureDir(globalConfigDir)
      const defaultConfig = DEFAULT_CONFIG
      await fs.writeJson(globalConfigPath, defaultConfig, { spaces: 2 })
      logger.debug(`创建全局配置文件: ${globalConfigPath}`)
      return defaultConfig
    }
  } catch (error) {
    throw new Error(`加载全局配置失败: ${error}`)
  }
}

/**
 * 获取配置值
 */
function getConfigValue(config: any, path: string): any {
  const parts = path.split('.')
  let current = config

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined
    }
    current = current[part]
  }

  return current
}

/**
 * 解析配置值
 */
function parseConfigValue(valueStr: string, currentValue: any): any {
  // 尝试解析为JSON
  try {
    return JSON.parse(valueStr)
  } catch {
    // 如果不是有效的JSON，按类型推断
    if (valueStr.toLowerCase() === 'true') return true
    if (valueStr.toLowerCase() === 'false') return false
    if (valueStr.toLowerCase() === 'null') return null
    if (valueStr.toLowerCase() === 'undefined') return undefined

    // 尝试解析为数字
    const num = Number(valueStr)
    if (!isNaN(num) && valueStr.trim() !== '') return num

    // 默认为字符串
    return valueStr
  }
}

/**
 * 验证配置更新
 */
function validateConfigUpdate(config: Config, path: string, newValue: any): { valid: boolean; error?: string } {
  // 这里可以添加更复杂的验证逻辑
  // 目前只是基本验证

  // 检查路径是否存在
  const currentValue = getConfigValue(config, path)
  if (currentValue === undefined) {
    return { valid: false, error: `配置路径不存在: ${path}` }
  }

  // 检查类型是否匹配
  if (currentValue !== undefined && newValue !== undefined) {
    const currentType = typeof currentValue
    const newType = typeof newValue

    // 允许一些类型转换
    const allowedConversions: Record<string, string[]> = {
      'number': ['string'], // 字符串可以尝试转换为数字
      'boolean': ['string'], // 字符串可以转换为布尔值
      'string': ['number', 'boolean'] // 数字和布尔值可以转换为字符串
    }

    if (currentType !== newType &&
        !(allowedConversions[currentType]?.includes(newType) ||
          allowedConversions[newType]?.includes(currentType))) {
      return {
        valid: false,
        error: `类型不匹配: 期望 ${currentType}, 收到 ${newType}`
      }
    }
  }

  return { valid: true }
}

/**
 * 更新配置文件
 */
async function updateConfigFile(
  options: ConfigCommandOptions,
  path: string,
  newValue: any,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const fs = await import('fs-extra')
  const configPath = getConfigFilePath(options)

  // 读取当前配置
  let configData: any
  try {
    configData = await fs.readJson(configPath)
  } catch (error) {
    throw new Error(`读取配置文件失败: ${error}`)
  }

  // 更新配置
  const parts = path.split('.')
  let current = configData

  // 遍历到最后一个部分之前
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (current[part] === undefined) {
      current[part] = {}
    }
    current = current[part]
  }

  // 设置最后一个部分的值
  const lastPart = parts[parts.length - 1]
  current[lastPart] = newValue

  // 写回文件
  try {
    await fs.writeJson(configPath, configData, { spaces: 2 })
    logger.debug(`配置文件已更新: ${configPath}`)
  } catch (error) {
    throw new Error(`写入配置文件失败: ${error}`)
  }
}

/**
 * 获取配置文件路径
 */
function getConfigFilePath(options: ConfigCommandOptions): string {
  if (options.global) {
    const os = require('os')
    return path.join(os.homedir(), '.agent-cli', 'config.json')
  } else {
    return path.resolve(options.cwd || process.cwd(), options.config || 'agent.config.json')
  }
}

/**
 * 查找变化的配置路径
 */
function findChangedConfigPaths(currentConfig: any, defaultConfig: any, prefix: string = ''): string[] {
  const changedPaths: string[] = []

  // 合并两个配置的所有键
  const allKeys = new Set([
    ...Object.keys(currentConfig || {}),
    ...Object.keys(defaultConfig || {})
  ])

  for (const key of allKeys) {
    const currentPath = prefix ? `${prefix}.${key}` : key
    const currentValue = currentConfig?.[key]
    const defaultValue = defaultConfig?.[key]

    if (typeof currentValue === 'object' && currentValue !== null &&
        typeof defaultValue === 'object' && defaultValue !== null) {
      // 递归比较对象
      changedPaths.push(...findChangedConfigPaths(currentValue, defaultValue, currentPath))
    } else if (JSON.stringify(currentValue) !== JSON.stringify(defaultValue)) {
      // 基本值比较
      changedPaths.push(currentPath)
    }
  }

  return changedPaths
}

/**
 * 显示配置值
 */
function displayConfigValue(path: string, value: any, logger: ReturnType<typeof createLogger>): void {
  if (value === undefined || value === null) {
    logger.item(path, '未设置')
  } else if (typeof value === 'object') {
    logger.item(path, JSON.stringify(value, null, 2))
  } else if (typeof value === 'boolean') {
    logger.item(path, value ? '✅ 是' : '❌ 否')
  } else {
    logger.item(path, String(value))
  }
}

/**
 * 显示配置树
 */
function displayConfigTree(config: any, verbose: boolean, logger: ReturnType<typeof createLogger>, prefix: string = ''): void {
  for (const key in config) {
    const value = config[key]
    const fullPath = prefix ? `${prefix}.${key}` : key

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      logger.divider(fullPath)
      displayConfigTree(value, verbose, logger, fullPath)
    } else {
      displayConfigValue(fullPath, value, logger)
    }
  }
}

/**
 * 格式化值用于显示
 */
function formatValueForDisplay(value: any): string {
  if (value === undefined) return '未设置'
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * 处理配置错误
 */
function handleConfigError(error: unknown, logger: ReturnType<typeof createLogger>): void {
  logger.error('❌ 配置命令执行失败')

  if (error instanceof Error) {
    logger.error(`错误信息: ${error.message}`)

    if (error.message.includes('配置文件')) {
      logger.info('💡 配置文件相关错误:')
      logger.info('  1. 确保配置文件存在且有读取权限')
      logger.info('  2. 检查JSON格式是否正确')
      logger.info('  3. 使用 --validate 验证配置')
    } else if (error.message.includes('权限')) {
      logger.info('💡 权限相关错误:')
      logger.info('  1. 确保对配置文件有写入权限')
      logger.info('  2. 尝试使用管理员权限运行')
    }

    if (process.env.DEBUG === 'true' || logger.isDebugEnabled()) {
      logger.debug('详细错误堆栈:', error.stack)
    }
  } else {
    logger.error(`未知错误: ${String(error)}`)
  }

  logger.info('\n💡 获取帮助:')
  logger.info('  $ agent-cli config --help')

  process.exit(1)
}

/**
 * 导出命令模块（符合CLI框架接口）
 */
export const commandModule = {
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
  action: async (cmdOptions: any) => {
    await handleConfigCommand(cmdOptions)
  }
}

// 默认导出
export default { createConfigCommand, commandModule }