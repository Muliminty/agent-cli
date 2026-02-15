/**
 * 模板系统工具模块
 * 设计思路：提供模板管理、变量替换和自定义模板支持，扩展FileUtils的模板渲染功能
 *
 * 功能特点：
 * 1. 多源模板管理（内置模板、用户模板、项目模板）
 * 2. 模板变量替换和条件渲染（基础支持）
 * 3. 模板发现和加载机制
 * 4. 模板元数据管理和版本控制
 */

import path from 'path'
import fs from 'fs-extra'
import { FileUtils, type FileOperationResult } from './file-utils.js'
import { createLogger } from './logger.js'

// 日志实例
const logger = createLogger()

// 模板类型定义
export interface TemplateInfo {
  /** 模板名称 */
  name: string
  /** 模板描述 */
  description?: string
  /** 模板文件路径 */
  filePath: string
  /** 模板类型 */
  type: 'builtin' | 'user' | 'project'
  /** 模板变量列表 */
  variables?: TemplateVariable[]
  /** 模板元数据 */
  metadata?: {
    version?: string
    author?: string
    createdAt?: string
    updatedAt?: string
    tags?: string[]
    compatibility?: string[]
  }
}

export interface TemplateVariable {
  /** 变量名称 */
  name: string
  /** 变量描述 */
  description?: string
  /** 变量类型 */
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object'
  /** 是否必需 */
  required?: boolean
  /** 默认值 */
  defaultValue?: any
  /** 示例值 */
  example?: any
  /** 验证规则（正则表达式或函数） */
  validation?: string | ((value: any) => boolean)
}

export interface TemplateRenderOptions {
  /** 输出文件路径（如果不提供则返回渲染后的字符串） */
  outputPath?: string
  /** 是否确保输出目录存在 */
  ensureDir?: boolean
  /** 严格模式：如果变量未提供则抛出错误 */
  strictMode?: boolean
  /** 自定义变量解析器 */
  variableResolver?: (varName: string) => string | undefined
  /** 额外变量数据 */
  extraData?: Record<string, any>
}

export interface TemplateSearchOptions {
  /** 搜索名称或描述 */
  query?: string
  /** 模板类型过滤 */
  types?: Array<'builtin' | 'user' | 'project'>
  /** 标签过滤 */
  tags?: string[]
  /** 是否递归搜索 */
  recursive?: boolean
  /** 最大深度 */
  maxDepth?: number
}

// 模板系统配置
export interface TemplateSystemConfig {
  /** 内置模板目录 */
  builtinTemplatesDir?: string
  /** 用户模板目录 */
  userTemplatesDir?: string
  /** 项目模板目录 */
  projectTemplatesDir?: string
  /** 默认模板扩展名 */
  defaultExtensions?: string[]
  /** 是否启用缓存 */
  enableCache?: boolean
  /** 缓存过期时间（毫秒） */
  cacheTTL?: number
}

/**
 * 模板系统工具类
 */
export class TemplateUtils {
  private static config: TemplateSystemConfig = {
    builtinTemplatesDir: path.join(process.cwd(), 'templates'),
    userTemplatesDir: path.join(process.env.HOME || process.env.USERPROFILE || '.', '.agent-cli', 'templates'),
    projectTemplatesDir: path.join(process.cwd(), '.templates'),
    defaultExtensions: ['.md', '.json', '.txt', '.template'],
    enableCache: true,
    cacheTTL: 5 * 60 * 1000 // 5分钟
  }

  private static cache = new Map<string, { data: any; timestamp: number }>()

  /**
   * 更新模板系统配置
   */
  static configure(config: Partial<TemplateSystemConfig>): void {
    this.config = { ...this.config, ...config }
    logger.debug(`模板系统配置已更新: ${JSON.stringify(this.config, null, 2)}`)
  }

  /**
   * 获取当前配置
   */
  static getConfig(): TemplateSystemConfig {
    return { ...this.config }
  }

  /**
   * 获取缓存数据
   */
  private static getCache(key: string): any {
    if (!this.config.enableCache) return null

    const cached = this.cache.get(key)
    if (!cached) return null

    if (Date.now() - cached.timestamp > (this.config.cacheTTL || 0)) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  /**
   * 设置缓存数据
   */
  private static setCache(key: string, data: any): void {
    if (!this.config.enableCache) return

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  /**
   * 清除缓存
   */
  static clearCache(): void {
    this.cache.clear()
    logger.debug('模板系统缓存已清除')
  }

  /**
   * 获取所有模板目录
   */
  static async getTemplateDirs(): Promise<{ type: string; path: string; exists: boolean }[]> {
    const dirs = [
      { type: 'builtin', path: this.config.builtinTemplatesDir! },
      { type: 'user', path: this.config.userTemplatesDir! },
      { type: 'project', path: this.config.projectTemplatesDir! }
    ]

    const results = []
    for (const dir of dirs) {
      const exists = await fs.pathExists(dir.path)
      results.push({ ...dir, exists })
    }

    return results
  }

  /**
   * 扫描模板文件
   */
  static async scanTemplates(options: TemplateSearchOptions = {}): Promise<TemplateInfo[]> {
    const cacheKey = `scan:${JSON.stringify(options)}`
    const cached = this.getCache(cacheKey)
    if (cached) return cached

    const templateDirs = await this.getTemplateDirs()
    const allTemplates: TemplateInfo[] = []

    for (const dir of templateDirs) {
      if (!dir.exists) continue

      const templates = await this.scanTemplateDir(dir.path, dir.type as 'builtin' | 'user' | 'project', options)
      allTemplates.push(...templates)
    }

    // 按名称排序
    allTemplates.sort((a, b) => a.name.localeCompare(b.name))

    this.setCache(cacheKey, allTemplates)
    return allTemplates
  }

  /**
   * 扫描单个模板目录
   */
  private static async scanTemplateDir(
    dirPath: string,
    type: 'builtin' | 'user' | 'project',
    options: TemplateSearchOptions
  ): Promise<TemplateInfo[]> {
    const templates: TemplateInfo[] = []

    try {
      const files = await FileUtils.findFiles(dirPath, {
        pattern: '*',
        recursive: options.recursive ?? true,
        type: 'file',
        maxDepth: options.maxDepth ?? 3,
        ignoreHidden: true
      })

      if (!files.success) return []

      const extensions = this.config.defaultExtensions!

      for (const filePath of files.data!) {
        const ext = path.extname(filePath).toLowerCase()
        if (!extensions.includes(ext)) {
          continue
        }
        const template = await this.analyzeTemplateFile(filePath, type)
        if (template && this.matchesSearch(template, options)) {
          templates.push(template)
        }
      }
    } catch (error) {
      logger.warn(`扫描模板目录失败: ${dirPath}`, error)
    }

    return templates
  }

  /**
   * 分析模板文件，提取元数据
   */
  private static async analyzeTemplateFile(
    filePath: string,
    type: 'builtin' | 'user' | 'project'
  ): Promise<TemplateInfo | null> {
    try {
      const fileName = path.basename(filePath)
      const name = this.extractTemplateName(fileName)

      // 读取文件内容（只读取前几行用于分析）
      const contentResult = await FileUtils.readFile(filePath, {
        throwIfMissing: false,
        defaultValue: ''
      })

      if (!contentResult.success || !contentResult.data) return null

      const content = contentResult.data as string
      const variables = this.extractVariables(content)

      // 从内容中提取描述（第一行或包含特定标记的行）
      const description = this.extractDescription(content)

      // 解析元数据注释（如果存在）
      const metadata = this.extractMetadata(content)

      return {
        name,
        description,
        filePath,
        type,
        variables,
        metadata
      }
    } catch (error) {
      logger.warn(`分析模板文件失败: ${filePath}`, error)
      return null
    }
  }

  /**
   * 从文件名提取模板名称
   */
  private static extractTemplateName(fileName: string): string {
    // 移除扩展名和可能的前缀/后缀
    const name = fileName
      .replace(/\.[^/.]+$/, '') // 移除扩展名
      .replace(/[-_]/g, ' ') // 将连字符和下划线替换为空格
      .replace(/\btemplate\b/gi, '') // 移除'template'单词
      .trim()

    return name || fileName
  }

  /**
   * 从内容中提取变量
   */
  private static extractVariables(content: string): TemplateVariable[] {
    const variables: TemplateVariable[] = []
    const variableRegex = /\{\{\s*([\w.]+)(?:\s*\|\s*\w+)?\s*\}\}/g

    let match: RegExpExecArray | null
    const seen = new Set<string>()

    while ((match = variableRegex.exec(content)) !== null) {
      const varName = match[1].trim()

      // 跳过已处理的变量
      if (seen.has(varName)) continue
      seen.add(varName)

      // 简单推断变量类型（基于名称）
      let varType: TemplateVariable['type'] = 'string'
      if (varName.includes('Count') || varName.includes('Number') || varName.includes('Total')) {
        varType = 'number'
      } else if (varName.startsWith('is') || varName.startsWith('has') || varName.includes('Enable')) {
        varType = 'boolean'
      } else if (varName.includes('List') || varName.includes('Array') || varName.includes('Items')) {
        varType = 'array'
      } else if (varName.includes('Config') || varName.includes('Options') || varName.includes('Settings')) {
        varType = 'object'
      }

      variables.push({
        name: varName,
        type: varType,
        required: varName.includes('required') || varType !== 'string',
        description: this.inferVariableDescription(varName)
      })
    }

    return variables
  }

  /**
   * 推断变量描述
   */
  private static inferVariableDescription(varName: string): string {
    const descriptions: Record<string, string> = {
      projectName: '项目名称',
      projectDescription: '项目描述',
      projectType: '项目类型（web-app, api-server, cli-tool, library等）',
      projectGoal: '项目核心目标',
      frontendFramework: '前端框架（react, vue, angular, svelte等）',
      backendFramework: '后端框架（express, koa, fastify, nestjs等）',
      database: '数据库（postgresql, mysql, mongodb, sqlite等）',
      programmingLanguage: '编程语言（typescript, javascript, python, go等）',
      styling: '样式方案（tailwind, css-modules, styled-components等）',
      buildTool: '构建工具（webpack, vite, rollup, esbuild等）',
      creationDate: '创建日期',
      currentDate: '当前日期',
      author: '作者名称',
      version: '版本号'
    }

    return descriptions[varName] || `${varName}变量`
  }

  /**
   * 从内容中提取描述
   */
  private static extractDescription(content: string): string {
    // 查找第一行非空、非注释的行
    const lines = content.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        // 如果行太长，截断
        return trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed
      }
    }

    return ''
  }

  /**
   * 从内容中提取元数据
   */
  private static extractMetadata(content: string): TemplateInfo['metadata'] {
    const metadata: TemplateInfo['metadata'] = {}

    // 查找元数据注释块
    const metadataRegex = /#+\s*模板元数据\s*\n([\s\S]*?)(?:\n#+|\n\n|$)/
    const match = content.match(metadataRegex)

    if (match) {
      const metadataBlock = match[1]
      const lines = metadataBlock.split('\n')

      for (const line of lines) {
        const keyValueMatch = line.match(/^\s*([\w-]+)\s*:\s*(.+)\s*$/)
        if (keyValueMatch) {
          const key = keyValueMatch[1].trim()
          const value = keyValueMatch[2].trim()

          switch (key.toLowerCase()) {
            case 'version':
              metadata.version = value
              break
            case 'author':
              metadata.author = value
              break
            case 'createdat':
            case 'created_at':
              metadata.createdAt = value
              break
            case 'updatedat':
            case 'updated_at':
              metadata.updatedAt = value
              break
            case 'tags':
              metadata.tags = value.split(',').map(tag => tag.trim())
              break
            case 'compatibility':
              metadata.compatibility = value.split(',').map(item => item.trim())
              break
          }
        }
      }
    }

    return metadata
  }

  /**
   * 检查模板是否匹配搜索条件
   */
  private static matchesSearch(template: TemplateInfo, options: TemplateSearchOptions): boolean {
    // 类型过滤
    if (options.types && options.types.length > 0 && !options.types.includes(template.type)) {
      return false
    }

    // 查询过滤
    if (options.query) {
      const query = options.query.toLowerCase()
      const nameMatch = template.name.toLowerCase().includes(query)
      const descMatch = template.description?.toLowerCase().includes(query) ?? false

      if (!nameMatch && !descMatch) {
        return false
      }
    }

    // 标签过滤
    if (options.tags && options.tags.length > 0) {
      const templateTags = template.metadata?.tags || []
      if (!options.tags.some(tag => templateTags.includes(tag))) {
        return false
      }
    }

    return true
  }

  /**
   * 获取模板详情
   */
  static async getTemplate(name: string, type?: 'builtin' | 'user' | 'project'): Promise<TemplateInfo | null> {
    const cacheKey = `template:${name}:${type || 'any'}`
    const cached = this.getCache(cacheKey)
    if (cached) return cached

    const templates = await this.scanTemplates()
    let template: TemplateInfo | null = null

    if (type) {
      template = templates.find(t => t.name === name && t.type === type) || null
    } else {
      // 按优先级查找：project > user > builtin
      template = templates.find(t => t.name === name && t.type === 'project') ||
                 templates.find(t => t.name === name && t.type === 'user') ||
                 templates.find(t => t.name === name) ||
                 null
    }

    if (template) {
      this.setCache(cacheKey, template)
    }

    return template
  }

  /**
   * 渲染模板
   */
  static async renderTemplate(
    templateName: string,
    data: Record<string, any>,
    options: TemplateRenderOptions = {}
  ): Promise<FileOperationResult<string>> {
    try {
      // 查找模板
      const template = await this.getTemplate(templateName)
      if (!template) {
        return {
          success: false,
          error: `模板未找到: ${templateName}`,
          filePath: '',
          duration: 0
        }
      }

      // 合并额外数据
      const allData = { ...data, ...options.extraData }

      // 验证必需变量
      if (options.strictMode && template.variables) {
        const missingVars = template.variables
          .filter(v => v.required && allData[v.name] === undefined)
          .map(v => v.name)

        if (missingVars.length > 0) {
          return {
            success: false,
            error: `缺少必需变量: ${missingVars.join(', ')}`,
            filePath: template.filePath,
            duration: 0
          }
        }
      }

      // 使用FileUtils的renderTemplate方法
      const renderOptions = {
        outputPath: options.outputPath,
        ensureDir: options.ensureDir ?? true
      }

      const result = await FileUtils.renderTemplate(template.filePath, allData, renderOptions.outputPath)

      if (result.success) {
        logger.debug(`模板渲染成功: ${templateName} -> ${options.outputPath || '字符串输出'}`)
      }

      return result
    } catch (error) {
      const errorMsg = `模板渲染失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: '',
        duration: 0
      }
    }
  }

  /**
   * 添加用户模板
   */
  static async addUserTemplate(
    sourcePath: string,
    templateName?: string
  ): Promise<FileOperationResult<TemplateInfo>> {
    try {
      const startTime = Date.now()

      // 确保用户模板目录存在
      const userTemplatesDir = this.config.userTemplatesDir!
      await FileUtils.ensureDir(userTemplatesDir)

      // 检查源文件是否存在
      const sourceExists = await FileUtils.exists(sourcePath)
      if (!sourceExists.success || !sourceExists.data) {
        return {
          success: false,
          error: `源文件不存在: ${sourcePath}`,
          filePath: sourcePath,
          duration: Date.now() - startTime
        }
      }

      // 确定模板名称
      const finalTemplateName = templateName || path.basename(sourcePath, path.extname(sourcePath))
      const destPath = path.join(userTemplatesDir, path.basename(sourcePath))

      // 复制文件
      const copyResult = await FileUtils.copy(sourcePath, destPath, {
        overwrite: true
      })

      if (!copyResult.success) {
        return {
          success: false,
          error: copyResult.error,
          filePath: sourcePath,
          duration: Date.now() - startTime
        }
      }

      // 分析新模板
      const template = await this.analyzeTemplateFile(destPath, 'user')
      if (!template) {
        return {
          success: false,
          error: '无法分析模板文件',
          filePath: destPath,
          duration: Date.now() - startTime
        }
      }

      logger.debug(`用户模板添加成功: ${finalTemplateName} -> ${destPath}`)

      return {
        success: true,
        data: template,
        filePath: destPath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `添加用户模板失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: sourcePath,
        duration: 0
      }
    }
  }

  /**
   * 删除模板
   */
  static async deleteTemplate(
    templateName: string,
    type?: 'builtin' | 'user' | 'project'
  ): Promise<FileOperationResult<void>> {
    try {
      const startTime = Date.now()

      // 查找模板
      const template = await this.getTemplate(templateName, type)
      if (!template) {
        return {
          success: false,
          error: `模板未找到: ${templateName}`,
          filePath: '',
          duration: Date.now() - startTime
        }
      }

      // 不允许删除内置模板
      if (template.type === 'builtin') {
        return {
          success: false,
          error: '不允许删除内置模板',
          filePath: template.filePath,
          duration: Date.now() - startTime
        }
      }

      // 删除文件
      const deleteResult = await FileUtils.remove(template.filePath)
      if (!deleteResult.success) {
        return deleteResult
      }

      // 清除相关缓存
      this.clearCache()

      logger.debug(`模板删除成功: ${templateName}`)

      return {
        success: true,
        filePath: template.filePath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `删除模板失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: '',
        duration: 0
      }
    }
  }

  /**
   * 列出所有可用模板
   */
  static async listTemplates(options: TemplateSearchOptions = {}): Promise<FileOperationResult<TemplateInfo[]>> {
    try {
      const startTime = Date.now()
      const templates = await this.scanTemplates(options)

      return {
        success: true,
        data: templates,
        filePath: '',
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `列出模板失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: '',
        duration: 0
      }
    }
  }

  /**
   * 验证模板变量
   */
  static validateTemplateVariables(
    template: TemplateInfo,
    data: Record<string, any>
  ): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = []
    const warnings: string[] = []

    if (!template.variables || template.variables.length === 0) {
      return { valid: true, errors, warnings }
    }

    for (const variable of template.variables) {
      const value = data[variable.name]

      // 检查必需变量
      if (variable.required && value === undefined) {
        errors.push(`缺少必需变量: ${variable.name}`)
        continue
      }

      // 类型检查
      if (value !== undefined && variable.type) {
        let typeValid = true

        switch (variable.type) {
          case 'string':
            typeValid = typeof value === 'string'
            break
          case 'number':
            typeValid = typeof value === 'number' && !isNaN(value)
            break
          case 'boolean':
            typeValid = typeof value === 'boolean'
            break
          case 'array':
            typeValid = Array.isArray(value)
            break
          case 'object':
            typeValid = typeof value === 'object' && value !== null && !Array.isArray(value)
            break
        }

        if (!typeValid) {
          warnings.push(`变量 ${variable.name} 期望类型为 ${variable.type}，实际为 ${typeof value}`)
        }
      }

      // 自定义验证
      if (value !== undefined && variable.validation) {
        if (typeof variable.validation === 'string') {
          // 正则表达式验证
          const regex = new RegExp(variable.validation)
          if (!regex.test(String(value))) {
            errors.push(`变量 ${variable.name} 不符合验证规则: ${variable.validation}`)
          }
        } else if (typeof variable.validation === 'function') {
          // 函数验证
          if (!variable.validation(value)) {
            errors.push(`变量 ${variable.name} 验证失败`)
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }
}

/**
 * 创建模板工具实例
 */
export function createTemplateUtils(): TemplateUtils {
  return TemplateUtils
}

/**
 * 获取默认模板工具实例
 */
export function getTemplateUtils(): TemplateUtils {
  return TemplateUtils
}

// 默认导出
export default {
  TemplateUtils,
  createTemplateUtils,
  getTemplateUtils
}