/**
 * 配置加载器模块
 * 设计思路：统一管理配置加载、验证和合并，支持多级配置源
 *
 * 配置源优先级（从高到低）：
 * 1. 命令行参数
 * 2. 环境变量
 * 3. 项目配置文件 (agent.config.json)
 * 4. 用户全局配置 (~/.agent-cli/config.json)
 * 5. 默认配置
 *
 * 功能特点：
 * 1. 自动配置文件发现和加载
 * 2. 配置验证和错误提示
 * 3. 环境变量支持
 * 4. 配置热重载支持
 */

import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { validateConfig, mergeConfig, ConfigSchema, DEFAULT_CONFIG } from './schema.js'
import { createLogger } from '../utils/logger.js'

// ES模块的__dirname替代方案
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 日志实例
const logger = createLogger()

// 配置加载选项
export interface LoadConfigOptions {
  /** 配置文件路径，如未指定则自动查找 */
  configPath?: string
  /** 工作目录 */
  cwd?: string
  /** 是否验证配置 */
  validate?: boolean
  /** 是否合并默认配置 */
  mergeDefaults?: boolean
}

// 环境变量前缀
const ENV_PREFIX = 'AGENT_CLI_'

/**
 * 从环境变量加载配置
 * 环境变量命名规则：AGENT_CLI_[SECTION]_[KEY]，使用下划线分隔
 * 例如：AGENT_CLI_PROJECT_NAME → config.project.name
 */
function loadFromEnv(): Partial<z.infer<typeof ConfigSchema>> {
  const envConfig: any = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith(ENV_PREFIX)) continue

    // 移除前缀并转换为小写
    const configKey = key.slice(ENV_PREFIX.length).toLowerCase()

    // 将下划线分隔的键转换为嵌套对象
    const keyParts = configKey.split('_')
    let current = envConfig

    // 构建嵌套结构
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i]
      if (!current[part]) current[part] = {}
      current = current[part]
    }

    // 设置值
    const lastKey = keyParts[keyParts.length - 1]

    // 尝试解析JSON值
    try {
      current[lastKey] = JSON.parse(value!)
    } catch {
      // 如果解析失败，使用原始字符串值
      current[lastKey] = value
    }
  }

  return envConfig
}

/**
 * 查找配置文件
 * 搜索顺序：
 * 1. 指定路径（如果提供）
 * 2. 当前目录下的 agent.config.json
 * 3. 父目录递归查找（最多向上5层）
 * 4. 用户主目录下的全局配置
 */
async function findConfigFile(searchPath?: string, cwd = process.cwd()): Promise<string | null> {
  // 如果指定了路径，直接使用
  if (searchPath) {
    const absolutePath = path.isAbsolute(searchPath) ? searchPath : path.join(cwd, searchPath)
    if (await fs.pathExists(absolutePath)) {
      return absolutePath
    }
    return null
  }

  // 在当前目录查找
  const localConfig = path.join(cwd, 'agent.config.json')
  if (await fs.pathExists(localConfig)) {
    return localConfig
  }

  // 向上递归查找（最多5层）
  let currentDir = cwd
  for (let i = 0; i < 5; i++) {
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break // 到达根目录

    const configInParent = path.join(parentDir, 'agent.config.json')
    if (await fs.pathExists(configInParent)) {
      return configInParent
    }

    currentDir = parentDir
  }

  // 查找用户全局配置
  const homeDir = process.env.HOME || process.env.USERPROFILE
  if (homeDir) {
    const globalConfig = path.join(homeDir, '.agent-cli', 'config.json')
    if (await fs.pathExists(globalConfig)) {
      return globalConfig
    }
  }

  return null
}

/**
 * 从文件加载配置
 */
async function loadFromFile(filePath: string): Promise<Partial<z.infer<typeof ConfigSchema>>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const config = JSON.parse(content)

    // 处理$schema引用
    if (config.$schema) {
      // 这里可以添加schema验证，但为了简化先跳过
      delete config.$schema
    }

    return config
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`配置文件 ${filePath} 不是有效的JSON: ${error.message}`)
    }
    throw new Error(`无法读取配置文件 ${filePath}: ${error}`)
  }
}

/**
 * 加载配置
 * @param configPath 配置文件路径（可选）
 * @param cwd 工作目录（可选）
 * @returns 验证后的配置对象
 */
export async function loadConfig(
  configPath?: string,
  cwd = process.cwd()
): Promise<z.infer<typeof ConfigSchema>> {
  const startTime = Date.now()
  logger.debug('开始加载配置...')

  try {
    // 查找配置文件
    const foundPath = await findConfigFile(configPath, cwd)
    let fileConfig: Partial<z.infer<typeof ConfigSchema>> = {}

    if (foundPath) {
      logger.debug(`找到配置文件: ${foundPath}`)
      fileConfig = await loadFromFile(foundPath)
    } else if (configPath) {
      // 如果指定了路径但未找到文件
      throw new Error(`配置文件未找到: ${configPath}`)
    } else {
      logger.debug('未找到配置文件，使用默认配置')
    }

    // 加载环境变量配置
    const envConfig = loadFromEnv()
    if (Object.keys(envConfig).length > 0) {
      logger.debug('从环境变量加载配置')
    }

    // 合并配置（优先级：环境变量 > 文件配置 > 默认配置）
    const mergedConfig = mergeConfig({
      ...fileConfig,
      ...envConfig
    })

    // 验证配置
    const validatedConfig = validateConfig(mergedConfig)

    // 记录加载耗时
    const loadTime = Date.now() - startTime
    logger.debug(`配置加载完成，耗时 ${loadTime}ms`)

    if (foundPath) {
      logger.info(`使用配置文件: ${path.relative(cwd, foundPath)}`)
    } else {
      logger.info('使用默认配置')
    }

    return validatedConfig
  } catch (error) {
    logger.error(`配置加载失败: ${error instanceof Error ? error.message : String(error)}`)

    // 提供有用的错误提示
    if (error instanceof z.ZodError) {
      logger.error('配置验证错误，请检查配置文件格式')
      logger.debug(`详细错误: ${JSON.stringify(error.errors, null, 2)}`)
    }

    throw error
  }
}

/**
 * 保存配置到文件
 */
export async function saveConfig(
  config: Partial<z.infer<typeof ConfigSchema>>,
  filePath: string
): Promise<void> {
  try {
    // 确保目录存在
    await fs.ensureDir(path.dirname(filePath))

    // 添加schema引用
    const configWithSchema = {
      $schema: './node_modules/agent-cli/schemas/config.schema.json',
      ...config
    }

    // 写入文件
    await fs.writeFile(filePath, JSON.stringify(configWithSchema, null, 2), 'utf-8')
    logger.success(`配置已保存到: ${filePath}`)
  } catch (error) {
    throw new Error(`保存配置失败: ${error}`)
  }
}

/**
 * 创建默认配置文件
 */
export async function createDefaultConfig(
  projectPath: string,
  projectName?: string
): Promise<string> {
  const configPath = path.join(projectPath, 'agent.config.json')

  // 如果文件已存在，询问是否覆盖
  if (await fs.pathExists(configPath)) {
    throw new Error(`配置文件已存在: ${configPath}`)
  }

  // 创建默认配置
  const defaultConfig = mergeConfig({
    project: {
      name: projectName || path.basename(projectPath),
      description: `由agent-cli创建的项目: ${projectName || path.basename(projectPath)}`,
      type: 'web-app',
      techStack: ['react', 'typescript', 'tailwind'],
      version: '1.0.0'
    }
  })

  // 保存配置
  await saveConfig(defaultConfig, configPath)

  return configPath
}

/**
 * 验证配置对象
 * @deprecated 使用schema.ts中的validateConfig
 */
export function validateConfigObject(config: unknown): z.infer<typeof ConfigSchema> {
  return validateConfig(config)
}

/**
 * 获取配置路径信息
 */
export function getConfigPaths(cwd = process.cwd()): {
  local: string | null
  global: string | null
} {
  const localPath = path.join(cwd, 'agent.config.json')
  const homeDir = process.env.HOME || process.env.USERPROFILE
  const globalPath = homeDir ? path.join(homeDir, '.agent-cli', 'config.json') : null

  return {
    local: fs.existsSync(localPath) ? localPath : null,
    global: globalPath && fs.existsSync(globalPath) ? globalPath : null
  }
}

// 默认导出
export default {
  loadConfig,
  saveConfig,
  createDefaultConfig,
  validateConfig: validateConfigObject,
  getConfigPaths
}