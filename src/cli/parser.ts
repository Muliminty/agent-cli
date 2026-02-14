/**
 * 命令行参数解析器模块
 * 设计思路：在commander.js基础上添加参数验证、类型转换和错误处理
 *
 * 功能特点：
 * 1. 参数类型验证（数字、字符串、布尔值、文件路径等）
 * 2. 取值范围检查（最小值、最大值、枚举值）
 * 3. 文件系统检查（文件存在性、目录权限等）
 * 4. JSON格式验证和解析
 * 5. 用户友好的错误消息和修复建议
 * 6. 统一的参数标准化和类型转换
 *
 * 踩坑提醒：
 * 1. 验证错误应该提供具体的修复建议
 * 2. 确保验证逻辑不会影响性能
 * 3. 错误消息要友好，不要显示技术堆栈
 * 4. 保持与commander.js的兼容性
 */

import { Command } from 'commander'
import fs from 'fs-extra'
import path from 'path'
import { createLogger } from '../utils/logger.js'

// 参数验证规则
export interface ValidationRule {
  /** 验证类型 */
  type: 'string' | 'number' | 'boolean' | 'file' | 'directory' | 'json' | 'array'
  /** 是否为必需参数 */
  required?: boolean
  /** 最小值（数字类型） */
  min?: number
  /** 最大值（数字类型） */
  max?: number
  /** 允许的值列表（枚举） */
  enum?: (string | number)[]
  /** 正则表达式模式（字符串类型） */
  pattern?: RegExp
  /** 文件扩展名白名单（文件类型） */
  extensions?: string[]
  /** 自定义验证函数 */
  validate?: (value: any, options: Record<string, any>) => boolean | string
  /** 错误消息模板 */
  errorMessage?: string
}

// 命令选项配置（扩展commander选项）
export interface CommandOptionConfig {
  /** 选项标识（如 -v, --verbose） */
  flags: string
  /** 选项描述 */
  description: string
  /** 默认值 */
  defaultValue?: any
  /** 验证规则 */
  validation?: ValidationRule
  /** 值解析器（字符串到类型的转换） */
  parser?: (value: string) => any
}

// 命令参数配置
export interface CommandArgumentConfig {
  /** 参数名称（如 <project-name>） */
  name: string
  /** 参数描述 */
  description: string
  /** 验证规则 */
  validation?: ValidationRule
}

// 命令配置（扩展CommandModule）
export interface CommandConfig {
  /** 命令名称（如 init, status） */
  command: string
  /** 命令描述 */
  description: string
  /** 选项配置 */
  options?: CommandOptionConfig[]
  /** 参数配置 */
  arguments?: CommandArgumentConfig[]
  /** 命令动作 */
  action: (options: any, config: any) => Promise<void> | void
}

// 解析结果
export interface ParseResult {
  /** 解析是否成功 */
  success: boolean
  /** 解析后的选项和参数 */
  data?: Record<string, any>
  /** 错误信息 */
  error?: string
  /** 修复建议 */
  suggestion?: string
  /** 验证失败的字段 */
  field?: string
}

/**
 * 命令行参数解析器
 */
export class CommandParser {
  private logger = createLogger()

  /**
   * 创建commander命令并添加验证
   */
  createCommand(commandConfig: CommandConfig): Command {
    const command = new Command(commandConfig.command)
      .description(commandConfig.description)

    // 注册参数
    if (commandConfig.arguments) {
      for (const arg of commandConfig.arguments) {
        command.argument(arg.name, arg.description)
      }
    }

    // 注册选项
    if (commandConfig.options) {
      for (const option of commandConfig.options) {
        command.option(option.flags, option.description, option.defaultValue)
      }
    }

    // 添加验证中间件
    this.addValidationMiddleware(command, commandConfig)

    return command
  }

  /**
   * 添加验证中间件
   */
  private addValidationMiddleware(command: Command, config: CommandConfig): void {
    const originalAction = command.action.bind(command)

    command.action(async (...args: any[]) => {
      try {
        // 提取参数和选项
        const options = args[args.length - 1] || {}
        const commandArgs = args.slice(0, -1)

        // 验证参数
        const validationResult = await this.validateCommandInput(
          commandArgs,
          options,
          config
        )

        if (!validationResult.success) {
          this.logger.error(`❌ 参数验证失败: ${validationResult.error}`)
          if (validationResult.suggestion) {
            this.logger.info(`💡 建议: ${validationResult.suggestion}`)
          }
          this.logger.info(`\n💡 获取帮助:`)
          this.logger.info(`  $ agent-cli ${config.command} --help`)
          process.exit(1)
        }

        // 调用原始动作
        return originalAction(...args)
      } catch (error) {
        this.logger.error(`❌ 命令执行失败: ${error}`)
        if (options.debug && error instanceof Error) {
          this.logger.debug(error.stack || '无堆栈信息')
        }
        process.exit(1)
      }
    })
  }

  /**
   * 验证命令输入
   */
  async validateCommandInput(
    args: any[],
    options: Record<string, any>,
    config: CommandConfig
  ): Promise<ParseResult> {
    const errors: string[] = []
    const suggestions: string[] = []

    // 验证参数
    if (config.arguments) {
      for (let i = 0; i < config.arguments.length; i++) {
        const argConfig = config.arguments[i]
        const value = args[i]

        const result = await this.validateValue(value, argConfig.validation, argConfig.name)
        if (!result.success) {
          errors.push(`参数 "${argConfig.name}": ${result.error}`)
          if (result.suggestion) {
            suggestions.push(result.suggestion)
          }
        }
      }
    }

    // 验证选项
    if (config.options) {
      for (const option of config.options) {
        const flagName = this.extractOptionName(option.flags)
        const value = options[flagName]

        const result = await this.validateValue(value, option.validation, flagName)
        if (!result.success) {
          errors.push(`选项 "${flagName}": ${result.error}`)
          if (result.suggestion) {
            suggestions.push(result.suggestion)
          }
        }

        // 应用值解析器
        if (result.success && value !== undefined && option.parser) {
          try {
            options[flagName] = option.parser(value)
          } catch (error) {
            errors.push(`选项 "${flagName}" 解析失败: ${error}`)
          }
        }
      }
    }

    if (errors.length > 0) {
      return {
        success: false,
        error: errors.join('; '),
        suggestion: suggestions.join('; ')
      }
    }

    return {
      success: true,
      data: { args, options }
    }
  }

  /**
   * 验证单个值
   */
  private async validateValue(
    value: any,
    validation?: ValidationRule,
    fieldName?: string
  ): Promise<ParseResult> {
    // 如果没有验证规则，直接通过
    if (!validation) {
      return { success: true }
    }

    // 检查必需性
    if (validation.required && (value === undefined || value === null || value === '')) {
      return {
        success: false,
        error: `必需参数不能为空`,
        suggestion: `请提供 ${fieldName} 参数的值`,
        field: fieldName
      }
    }

    // 如果值为空且非必需，直接通过
    if (value === undefined || value === null || value === '') {
      return { success: true }
    }

    // 类型验证
    switch (validation.type) {
      case 'number':
        return this.validateNumber(value, validation, fieldName)
      case 'boolean':
        return this.validateBoolean(value, validation, fieldName)
      case 'file':
        return await this.validateFile(value, validation, fieldName)
      case 'directory':
        return await this.validateDirectory(value, validation, fieldName)
      case 'json':
        return this.validateJson(value, validation, fieldName)
      case 'array':
        return this.validateArray(value, validation, fieldName)
      case 'string':
      default:
        return this.validateString(value, validation, fieldName)
    }
  }

  /**
   * 验证数字
   */
  private validateNumber(
    value: any,
    validation: ValidationRule,
    fieldName?: string
  ): ParseResult {
    const num = Number(value)
    if (isNaN(num)) {
      return {
        success: false,
        error: `必须为数字，当前值: "${value}"`,
        suggestion: `请提供一个有效的数字`,
        field: fieldName
      }
    }

    if (validation.min !== undefined && num < validation.min) {
      return {
        success: false,
        error: `必须大于等于 ${validation.min}，当前值: ${num}`,
        suggestion: `请提供一个大于等于 ${validation.min} 的值`,
        field: fieldName
      }
    }

    if (validation.max !== undefined && num > validation.max) {
      return {
        success: false,
        error: `必须小于等于 ${validation.max}，当前值: ${num}`,
        suggestion: `请提供一个小于等于 ${validation.max} 的值`,
        field: fieldName
      }
    }

    if (validation.enum && !validation.enum.includes(num)) {
      return {
        success: false,
        error: `必须是以下值之一: ${validation.enum.join(', ')}，当前值: ${num}`,
        suggestion: `请从允许的值中选择`,
        field: fieldName
      }
    }

    return { success: true }
  }

  /**
   * 验证布尔值
   */
  private validateBoolean(
    value: any,
    _validation: ValidationRule,
    fieldName?: string
  ): ParseResult {
    if (typeof value !== 'boolean' &&
        !['true', 'false', '0', '1', 'yes', 'no'].includes(String(value).toLowerCase())) {
      return {
        success: false,
        error: `必须为布尔值，当前值: "${value}"`,
        suggestion: `请使用 true/false, yes/no, 或 0/1`,
        field: fieldName
      }
    }

    return { success: true }
  }

  /**
   * 验证文件
   */
  private async validateFile(
    value: any,
    validation: ValidationRule,
    fieldName?: string
  ): Promise<ParseResult> {
    if (typeof value !== 'string') {
      return {
        success: false,
        error: `必须为文件路径字符串`,
        suggestion: `请提供一个有效的文件路径`,
        field: fieldName
      }
    }

    try {
      const filePath = path.resolve(value)
      const exists = await fs.pathExists(filePath)

      if (!exists) {
        return {
          success: false,
          error: `文件不存在: ${filePath}`,
          suggestion: `请检查文件路径是否正确`,
          field: fieldName
        }
      }

      const stats = await fs.stat(filePath)
      if (!stats.isFile()) {
        return {
          success: false,
          error: `路径不是文件: ${filePath}`,
          suggestion: `请提供一个文件路径，而不是目录`,
          field: fieldName
        }
      }

      // 检查文件扩展名
      if (validation.extensions && validation.extensions.length > 0) {
        const ext = path.extname(filePath).toLowerCase().substring(1)
        if (!validation.extensions.includes(ext)) {
          return {
            success: false,
            error: `文件扩展名必须是: ${validation.extensions.join(', ')}，当前: .${ext}`,
            suggestion: `请使用支持的文件格式`,
            field: fieldName
          }
        }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: `文件访问失败: ${error}`,
        suggestion: `请检查文件权限和路径`,
        field: fieldName
      }
    }
  }

  /**
   * 验证目录
   */
  private async validateDirectory(
    value: any,
    validation: ValidationRule,
    fieldName?: string
  ): Promise<ParseResult> {
    if (typeof value !== 'string') {
      return {
        success: false,
        error: `必须为目录路径字符串`,
        suggestion: `请提供一个有效的目录路径`,
        field: fieldName
      }
    }

    try {
      const dirPath = path.resolve(value)
      const exists = await fs.pathExists(dirPath)

      if (!exists) {
        return {
          success: false,
          error: `目录不存在: ${dirPath}`,
          suggestion: `请检查目录路径是否正确，或创建该目录`,
          field: fieldName
        }
      }

      const stats = await fs.stat(dirPath)
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `路径不是目录: ${dirPath}`,
          suggestion: `请提供一个目录路径，而不是文件`,
          field: fieldName
        }
      }

      // 检查目录权限（简单检查）
      try {
        await fs.access(dirPath, fs.constants.R_OK | fs.constants.W_OK)
      } catch {
        return {
          success: false,
          error: `目录权限不足: ${dirPath}`,
          suggestion: `请确保有读取和写入权限`,
          field: fieldName
        }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: `目录访问失败: ${error}`,
        suggestion: `请检查目录权限和路径`,
        field: fieldName
      }
    }
  }

  /**
   * 验证JSON
   */
  private validateJson(
    value: any,
    _validation: ValidationRule,
    fieldName?: string
  ): ParseResult {
    if (typeof value !== 'string') {
      return {
        success: false,
        error: `必须为JSON字符串`,
        suggestion: `请提供一个有效的JSON字符串`,
        field: fieldName
      }
    }

    try {
      JSON.parse(value)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: `无效的JSON格式: ${error}`,
        suggestion: `请检查JSON语法，确保它是有效的JSON`,
        field: fieldName
      }
    }
  }

  /**
   * 验证数组
   */
  private validateArray(
    value: any,
    validation: ValidationRule,
    fieldName?: string
  ): ParseResult {
    // 尝试将字符串解析为数组
    let array: any[]
    if (typeof value === 'string') {
      try {
        array = JSON.parse(value)
      } catch {
        // 如果不是JSON，尝试按逗号分割
        array = value.split(',').map((item: string) => item.trim())
      }
    } else if (Array.isArray(value)) {
      array = value
    } else {
      return {
        success: false,
        error: `必须为数组或逗号分隔的字符串`,
        suggestion: `请提供一个数组，如 [1,2,3] 或 "item1,item2,item3"`,
        field: fieldName
      }
    }

    if (!Array.isArray(array)) {
      return {
        success: false,
        error: `必须为数组`,
        suggestion: `请提供一个有效的数组`,
        field: fieldName
      }
    }

    // 检查数组元素
    for (let i = 0; i < array.length; i++) {
      const item = array[i]
      if (validation.enum && !validation.enum.includes(item)) {
        return {
          success: false,
          error: `数组元素必须是以下值之一: ${validation.enum.join(', ')}，第 ${i + 1} 个元素: ${item}`,
          suggestion: `请从允许的值中选择数组元素`,
          field: fieldName
        }
      }
    }

    return { success: true }
  }

  /**
   * 验证字符串
   */
  private validateString(
    value: any,
    validation: ValidationRule,
    fieldName?: string
  ): ParseResult {
    if (typeof value !== 'string') {
      return {
        success: false,
        error: `必须为字符串，当前类型: ${typeof value}`,
        suggestion: `请提供一个字符串值`,
        field: fieldName
      }
    }

    if (validation.pattern && !validation.pattern.test(value)) {
      return {
        success: false,
        error: `必须匹配模式: ${validation.pattern}`,
        suggestion: `请提供符合格式要求的字符串`,
        field: fieldName
      }
    }

    if (validation.enum && !validation.enum.includes(value)) {
      return {
        success: false,
        error: `必须是以下值之一: ${validation.enum.join(', ')}，当前值: "${value}"`,
        suggestion: `请从允许的值中选择`,
        field: fieldName
      }
    }

    return { success: true }
  }

  /**
   * 从选项标识中提取选项名称
   */
  private extractOptionName(flags: string): string {
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

  /**
   * 创建常用验证规则
   */
  static createValidationRules() {
    return {
      // 数字验证规则
      number: (min?: number, max?: number): ValidationRule => ({
        type: 'number',
        min,
        max
      }),

      // 文件验证规则
      file: (extensions?: string[]): ValidationRule => ({
        type: 'file',
        extensions
      }),

      // 目录验证规则
      directory: (): ValidationRule => ({
        type: 'directory'
      }),

      // JSON验证规则
      json: (): ValidationRule => ({
        type: 'json'
      }),

      // 枚举验证规则
      enum: (values: (string | number)[]): ValidationRule => ({
        type: 'string',
        enum: values
      }),

      // 必需参数规则
      required: (type: ValidationRule['type'] = 'string'): ValidationRule => ({
        type,
        required: true
      })
    }
  }

  /**
   * 创建常用值解析器
   */
  static createValueParsers() {
    return {
      // JSON解析器
      jsonParser: (value: string) => JSON.parse(value),

      // 数字解析器
      numberParser: (value: string) => Number(value),

      // 布尔值解析器
      booleanParser: (value: string) => {
        if (typeof value === 'boolean') return value
        const str = String(value).toLowerCase()
        return ['true', '1', 'yes'].includes(str)
      },

      // 数组解析器（逗号分隔）
      arrayParser: (value: string) => {
        if (typeof value === 'string') {
          try {
            return JSON.parse(value)
          } catch {
            return value.split(',').map((item: string) => item.trim())
          }
        }
        return value
      }
    }
  }
}

/**
 * 创建命令解析器实例
 */
export function createCommandParser(): CommandParser {
  return new CommandParser()
}

/**
 * 获取默认命令解析器
 */
export function getCommandParser(): CommandParser {
  return new CommandParser()
}

// 默认导出
export default {
  CommandParser,
  createCommandParser,
  getCommandParser,
  createValidationRules: CommandParser.createValidationRules,
  createValueParsers: CommandParser.createValueParsers
}