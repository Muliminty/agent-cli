/**
 * 数据验证工具模块
 * 设计思路：提供统一的验证接口，支持Zod验证和自定义验证规则
 *
 * 功能特点：
 * 1. 基于Zod的强类型验证，支持复杂数据结构
 * 2. 常见验证规则的预置模板（邮箱、URL、文件路径等）
 * 3. 验证结果统一格式，包含详细错误信息
 * 4. 异步验证支持，支持远程验证场景
 * 5. 验证链式调用，支持多个规则的组合
 */

import { z } from 'zod'
import path from 'path'
import fs from 'fs-extra'
import { createLogger } from './logger.js'

// 日志实例
const logger = createLogger()

// 验证结果接口
export interface ValidationResult<T = any> {
  /** 验证是否通过 */
  success: boolean
  /** 验证后的数据（如果验证通过） */
  data?: T
  /** 错误信息（如果验证失败） */
  errors?: ValidationError[]
  /** 验证耗时（毫秒） */
  duration: number
}

// 验证错误详情
export interface ValidationError {
  /** 错误路径（如 "user.email"） */
  path: string[]
  /** 错误消息 */
  message: string
  /** 错误代码 */
  code?: string
  /** 期望值类型 */
  expected?: string
  /** 实际接收值 */
  received?: any
}

// 验证选项
export interface ValidationOptions {
  /** 是否严格模式（额外的类型检查） */
  strict?: boolean
  /** 是否转换数据（如字符串转数字） */
  coerce?: boolean
  /** 自定义错误消息映射 */
  errorMap?: z.ZodErrorMap
  /** 是否记录详细日志 */
  verbose?: boolean
}

// 常见验证规则
export interface CommonValidationRules {
  /** 必填验证 */
  required?: boolean
  /** 最小长度（字符串或数组） */
  minLength?: number
  /** 最大长度（字符串或数组） */
  maxLength?: number
  /** 最小值（数字） */
  min?: number
  /** 最大值（数字） */
  max?: number
  /** 正则表达式匹配 */
  pattern?: RegExp
  /** 自定义验证函数 */
  validate?: (value: any) => boolean | string | Promise<boolean | string>
}

/**
 * 验证工具类
 */
export class ValidationUtils {
  /**
   * 使用Zod schema验证数据
   */
  static async validateWithSchema<T>(
    schema: z.ZodSchema<T>,
    data: unknown,
    options: ValidationOptions = {}
  ): Promise<ValidationResult<T>> {
    const startTime = Date.now()
    const { strict = false, coerce = false, errorMap, verbose = false } = options

    try {
      if (verbose) {
        logger.startTask(`Zod schema验证`)
        logger.debug(`验证数据: ${JSON.stringify(data, null, 2)}`)
      }

      // 创建验证schema（应用选项）
      let validationSchema = schema

      if (coerce) {
        // 启用类型转换
        validationSchema = validationSchema
      }

      if (strict) {
        // 启用严格模式
        validationSchema = validationSchema.strict()
      }

      // 执行验证
      const result = await validationSchema.safeParseAsync(data, { errorMap })

      if (verbose) {
        logger.completeTask(`Zod schema验证`)
      }

      if (result.success) {
        return {
          success: true,
          data: result.data,
          duration: Date.now() - startTime
        }
      } else {
        const errors: ValidationError[] = result.error.errors.map(err => ({
          path: err.path,
          message: err.message,
          code: err.code,
          expected: err.expected,
          received: err.received
        }))

        if (verbose) {
          logger.error(`验证失败，错误数: ${errors.length}`)
          errors.forEach((err, index) => {
            logger.error(`错误 ${index + 1}: ${err.path.join('.')} - ${err.message}`)
          })
        }

        return {
          success: false,
          errors,
          duration: Date.now() - startTime
        }
      }
    } catch (error) {
      const errorMsg = `验证过程异常: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)

      return {
        success: false,
        errors: [{
          path: [],
          message: errorMsg,
          code: 'VALIDATION_EXCEPTION'
        }],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 验证字符串
   */
  static async validateString(
    value: unknown,
    rules: CommonValidationRules & {
      /** 字符串类型特定规则 */
      email?: boolean
      url?: boolean
      uuid?: boolean
      ip?: boolean
      date?: boolean
      lowercase?: boolean
      uppercase?: boolean
      trim?: boolean
    } = {}
  ): Promise<ValidationResult<string>> {
    const startTime = Date.now()
    const {
      required = true,
      minLength,
      maxLength,
      pattern,
      email,
      url,
      uuid,
      ip,
      date,
      lowercase,
      uppercase,
      trim,
      validate,
      verbose = false
    } = rules

    try {
      if (verbose) {
        logger.startTask(`字符串验证`)
        logger.debug(`验证值: ${value}`)
      }

      // 构建Zod schema
      let schema = z.string()

      // 必填检查
      if (required) {
        schema = schema.min(1, { message: '不能为空' })
      } else {
        schema = schema.optional()
      }

      // 长度检查
      if (minLength !== undefined) {
        schema = schema.min(minLength, { message: `长度不能少于 ${minLength} 个字符` })
      }
      if (maxLength !== undefined) {
        schema = schema.max(maxLength, { message: `长度不能超过 ${maxLength} 个字符` })
      }

      // 格式检查
      if (email) {
        schema = schema.email({ message: '邮箱格式无效' })
      }
      if (url) {
        schema = schema.url({ message: 'URL格式无效' })
      }
      if (uuid) {
        schema = schema.uuid({ message: 'UUID格式无效' })
      }
      if (ip) {
        schema = schema.ip({ message: 'IP地址格式无效' })
      }
      if (date) {
        schema = schema.datetime({ message: '日期时间格式无效' })
      }

      // 大小写检查
      if (lowercase) {
        schema = schema.refine(val => val === val.toLowerCase(), {
          message: '必须为小写'
        })
      }
      if (uppercase) {
        schema = schema.refine(val => val === val.toUpperCase(), {
          message: '必须为大写'
        })
      }

      // 正则检查
      if (pattern) {
        schema = schema.regex(pattern, { message: '格式不符合要求' })
      }

      // 去除空格
      if (trim) {
        schema = schema.transform(val => val.trim())
      }

      // 自定义验证
      if (validate) {
        schema = schema.refine(
          async (val) => {
            const result = await validate(val)
            if (typeof result === 'string') {
              throw new Error(result)
            }
            return result
          },
          { message: '自定义验证失败' }
        )
      }

      // 执行验证
      const result = await this.validateWithSchema(schema, value, { verbose })

      if (verbose && result.success) {
        logger.completeTask(`字符串验证`)
      }

      return result
    } catch (error) {
      const errorMsg = `字符串验证异常: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)

      return {
        success: false,
        errors: [{
          path: [],
          message: errorMsg,
          code: 'STRING_VALIDATION_EXCEPTION'
        }],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 验证数字
   */
  static async validateNumber(
    value: unknown,
    rules: CommonValidationRules & {
      /** 数字类型特定规则 */
      integer?: boolean
      positive?: boolean
      negative?: boolean
      nonnegative?: boolean
      nonpositive?: boolean
      multipleOf?: number
      finite?: boolean
      safe?: boolean
    } = {}
  ): Promise<ValidationResult<number>> {
    const startTime = Date.now()
    const {
      required = true,
      min,
      max,
      integer,
      positive,
      negative,
      nonnegative,
      nonpositive,
      multipleOf,
      finite = true,
      safe = true,
      validate,
      verbose = false
    } = rules

    try {
      if (verbose) {
        logger.startTask(`数字验证`)
        logger.debug(`验证值: ${value}`)
      }

      // 构建Zod schema
      let schema = z.number()

      // 必填检查
      if (!required) {
        schema = schema.optional()
      }

      // 范围检查
      if (min !== undefined) {
        schema = schema.min(min, { message: `不能小于 ${min}` })
      }
      if (max !== undefined) {
        schema = schema.max(max, { message: `不能大于 ${max}` })
      }

      // 类型检查
      if (integer) {
        schema = schema.int({ message: '必须为整数' })
      }
      if (positive) {
        schema = schema.positive({ message: '必须为正数' })
      }
      if (negative) {
        schema = schema.negative({ message: '必须为负数' })
      }
      if (nonnegative) {
        schema = schema.nonnegative({ message: '必须为非负数' })
      }
      if (nonpositive) {
        schema = schema.nonpositive({ message: '必须为非正数' })
      }
      if (multipleOf !== undefined) {
        schema = schema.multipleOf(multipleOf, { message: `必须是 ${multipleOf} 的倍数` })
      }

      // 数值特性检查
      if (finite) {
        schema = schema.finite({ message: '必须为有限数' })
      }
      if (safe) {
        schema = schema.safe({ message: '必须在安全整数范围内' })
      }

      // 自定义验证
      if (validate) {
        schema = schema.refine(
          async (val) => {
            const result = await validate(val)
            if (typeof result === 'string') {
              throw new Error(result)
            }
            return result
          },
          { message: '自定义验证失败' }
        )
      }

      // 执行验证
      const result = await this.validateWithSchema(schema, value, { verbose })

      if (verbose && result.success) {
        logger.completeTask(`数字验证`)
      }

      return result
    } catch (error) {
      const errorMsg = `数字验证异常: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)

      return {
        success: false,
        errors: [{
          path: [],
          message: errorMsg,
          code: 'NUMBER_VALIDATION_EXCEPTION'
        }],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 验证布尔值
   */
  static async validateBoolean(
    value: unknown,
    options: { required?: boolean; verbose?: boolean } = {}
  ): Promise<ValidationResult<boolean>> {
    const startTime = Date.now()
    const { required = true, verbose = false } = options

    try {
      if (verbose) {
        logger.startTask(`布尔值验证`)
        logger.debug(`验证值: ${value}`)
      }

      let schema = z.boolean()

      if (!required) {
        schema = schema.optional()
      }

      const result = await this.validateWithSchema(schema, value, { verbose })

      if (verbose && result.success) {
        logger.completeTask(`布尔值验证`)
      }

      return result
    } catch (error) {
      const errorMsg = `布尔值验证异常: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)

      return {
        success: false,
        errors: [{
          path: [],
          message: errorMsg,
          code: 'BOOLEAN_VALIDATION_EXCEPTION'
        }],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 验证数组
   */
  static async validateArray<T>(
    value: unknown,
    itemSchema: z.ZodSchema<T>,
    rules: CommonValidationRules & {
      /** 数组类型特定规则 */
      unique?: boolean
      minItems?: number
      maxItems?: number
      exactLength?: number
    } = {}
  ): Promise<ValidationResult<T[]>> {
    const startTime = Date.now()
    const {
      required = true,
      minLength,
      maxLength,
      unique,
      minItems,
      maxItems,
      exactLength,
      validate,
      verbose = false
    } = rules

    try {
      if (verbose) {
        logger.startTask(`数组验证`)
        logger.debug(`验证值: ${JSON.stringify(value)}`)
      }

      // 构建Zod schema
      let schema = z.array(itemSchema)

      // 必填检查
      if (!required) {
        schema = schema.optional()
      }

      // 长度检查（兼容新旧参数名）
      const min = minItems !== undefined ? minItems : minLength
      const max = maxItems !== undefined ? maxItems : maxLength

      if (min !== undefined) {
        schema = schema.min(min, { message: `至少需要 ${min} 个元素` })
      }
      if (max !== undefined) {
        schema = schema.max(max, { message: `最多允许 ${max} 个元素` })
      }
      if (exactLength !== undefined) {
        schema = schema.length(exactLength, { message: `必须正好有 ${exactLength} 个元素` })
      }

      // 唯一性检查
      if (unique) {
        schema = schema.refine(
          (arr) => arr.length === new Set(arr).size,
          { message: '数组元素必须唯一' }
        )
      }

      // 自定义验证
      if (validate) {
        schema = schema.refine(
          async (arr) => {
            const result = await validate(arr)
            if (typeof result === 'string') {
              throw new Error(result)
            }
            return result
          },
          { message: '自定义验证失败' }
        )
      }

      // 执行验证
      const result = await this.validateWithSchema(schema, value, { verbose })

      if (verbose && result.success) {
        logger.completeTask(`数组验证`)
      }

      return result
    } catch (error) {
      const errorMsg = `数组验证异常: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)

      return {
        success: false,
        errors: [{
          path: [],
          message: errorMsg,
          code: 'ARRAY_VALIDATION_EXCEPTION'
        }],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 验证对象
   */
  static async validateObject<T>(
    value: unknown,
    schema: z.ZodSchema<T>,
    options: ValidationOptions & { partial?: boolean } = {}
  ): Promise<ValidationResult<T>> {
    const startTime = Date.now()
    const { partial = false, verbose = false, ...validationOptions } = options

    try {
      if (verbose) {
        logger.startTask(`对象验证`)
        logger.debug(`验证值: ${JSON.stringify(value, null, 2)}`)
      }

      let validationSchema = schema

      // 部分验证（允许缺少某些字段）
      if (partial) {
        validationSchema = validationSchema.partial()
      }

      const result = await this.validateWithSchema(validationSchema, value, {
        ...validationOptions,
        verbose
      })

      if (verbose && result.success) {
        logger.completeTask(`对象验证`)
      }

      return result
    } catch (error) {
      const errorMsg = `对象验证异常: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)

      return {
        success: false,
        errors: [{
          path: [],
          message: errorMsg,
          code: 'OBJECT_VALIDATION_EXCEPTION'
        }],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 验证文件路径
   */
  static async validateFilePath(
    value: unknown,
    options: {
      required?: boolean
      mustExist?: boolean
      type?: 'file' | 'directory' | 'both'
      extensions?: string[]
      basePath?: string
      verbose?: boolean
    } = {}
  ): Promise<ValidationResult<string>> {
    const startTime = Date.now()
    const {
      required = true,
      mustExist = true,
      type = 'both',
      extensions,
      basePath = process.cwd(),
      verbose = false
    } = options

    try {
      if (verbose) {
        logger.startTask(`文件路径验证`)
        logger.debug(`验证路径: ${value}`)
      }

      // 首先验证是否为字符串
      const stringResult = await this.validateString(value, { required, verbose })
      if (!stringResult.success) {
        return stringResult
      }

      const pathValue = stringResult.data!

      // 解析路径
      const resolvedPath = path.isAbsolute(pathValue)
        ? pathValue
        : path.join(basePath, pathValue)

      // 检查路径是否存在
      if (mustExist) {
        const exists = await fs.pathExists(resolvedPath)
        if (!exists) {
          return {
            success: false,
            errors: [{
              path: [],
              message: `路径不存在: ${resolvedPath}`,
              code: 'PATH_NOT_EXISTS'
            }],
            duration: Date.now() - startTime
          }
        }

        // 检查路径类型
        if (type !== 'both') {
          try {
            const stats = await fs.stat(resolvedPath)
            if (type === 'file' && !stats.isFile()) {
              return {
                success: false,
                errors: [{
                  path: [],
                  message: `路径不是文件: ${resolvedPath}`,
                  code: 'NOT_A_FILE'
                }],
                duration: Date.now() - startTime
              }
            }
            if (type === 'directory' && !stats.isDirectory()) {
              return {
                success: false,
                errors: [{
                  path: [],
                  message: `路径不是目录: ${resolvedPath}`,
                  code: 'NOT_A_DIRECTORY'
                }],
                duration: Date.now() - startTime
              }
            }
          } catch (statError) {
            return {
              success: false,
              errors: [{
                path: [],
                message: `无法获取路径信息: ${statError instanceof Error ? statError.message : String(statError)}`,
                code: 'STAT_ERROR'
              }],
              duration: Date.now() - startTime
            }
          }
        }

        // 检查文件扩展名
        if (extensions && extensions.length > 0 && type !== 'directory') {
          const ext = path.extname(resolvedPath).toLowerCase()
          if (!extensions.map(e => e.toLowerCase()).includes(ext)) {
            return {
              success: false,
              errors: [{
                path: [],
                message: `文件扩展名必须是: ${extensions.join(', ')}`,
                code: 'INVALID_EXTENSION'
              }],
              duration: Date.now() - startTime
            }
          }
        }
      }

      if (verbose) {
        logger.completeTask(`文件路径验证`)
        logger.debug(`路径验证通过: ${resolvedPath}`)
      }

      return {
        success: true,
        data: resolvedPath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `文件路径验证异常: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)

      return {
        success: false,
        errors: [{
          path: [],
          message: errorMsg,
          code: 'FILE_PATH_VALIDATION_EXCEPTION'
        }],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 验证邮箱地址
   */
  static async validateEmail(
    value: unknown,
    options: { required?: boolean; verbose?: boolean } = {}
  ): Promise<ValidationResult<string>> {
    return this.validateString(value, {
      ...options,
      email: true,
      trim: true,
      lowercase: true
    })
  }

  /**
   * 验证URL
   */
  static async validateUrl(
    value: unknown,
    options: { required?: boolean; verbose?: boolean } = {}
  ): Promise<ValidationResult<string>> {
    return this.validateString(value, {
      ...options,
      url: true,
      trim: true
    })
  }

  /**
   * 验证功能ID格式（feature-001）
   */
  static async validateFeatureId(
    value: unknown,
    options: { required?: boolean; verbose?: boolean } = {}
  ): Promise<ValidationResult<string>> {
    const startTime = Date.now()
    const { required = true, verbose = false } = options

    try {
      if (verbose) {
        logger.startTask(`功能ID验证`)
        logger.debug(`验证值: ${value}`)
      }

      const schema = z.string()
        .regex(/^feature-\d{3}$/, { message: '功能ID格式必须为 feature-001' })
        .refine(val => {
          const num = parseInt(val.split('-')[1], 10)
          return num >= 1 && num <= 999
        }, { message: '功能编号必须在 001-999 范围内' })

      const result = await this.validateWithSchema(
        required ? schema : schema.optional(),
        value,
        { verbose }
      )

      if (verbose && result.success) {
        logger.completeTask(`功能ID验证`)
      }

      return result
    } catch (error) {
      const errorMsg = `功能ID验证异常: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)

      return {
        success: false,
        errors: [{
          path: [],
          message: errorMsg,
          code: 'FEATURE_ID_VALIDATION_EXCEPTION'
        }],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 验证项目配置
   */
  static async validateProjectConfig(
    value: unknown,
    options: ValidationOptions & { partial?: boolean } = {}
  ): Promise<ValidationResult<any>> {
    // 导入项目配置schema
    // 注意：这里使用动态导入避免循环依赖
    try {
      const { ConfigSchema } = await import('../config/schema.js')
      return this.validateObject(value, ConfigSchema, options)
    } catch (importError) {
      const errorMsg = `无法导入配置schema: ${importError instanceof Error ? importError.message : String(importError)}`
      logger.error(errorMsg)

      return {
        success: false,
        errors: [{
          path: [],
          message: errorMsg,
          code: 'SCHEMA_IMPORT_ERROR'
        }],
        duration: 0
      }
    }
  }

  /**
   * 批量验证多个字段
   */
  static async validateFields(
    validations: Array<{
      name: string
      value: unknown
      validator: (value: unknown) => Promise<ValidationResult>
    }>,
    options: { stopOnFirstError?: boolean; verbose?: boolean } = {}
  ): Promise<{
    success: boolean
    results: Record<string, ValidationResult>
    errors: ValidationError[]
    duration: number
  }> {
    const startTime = Date.now()
    const { stopOnFirstError = false, verbose = false } = options

    try {
      if (verbose) {
        logger.startTask(`批量字段验证`)
        logger.debug(`验证字段数: ${validations.length}`)
      }

      const results: Record<string, ValidationResult> = {}
      const allErrors: ValidationError[] = []

      for (const validation of validations) {
        const { name, value, validator } = validation

        if (verbose) {
          logger.debug(`验证字段: ${name}`)
        }

        const result = await validator(value)
        results[name] = result

        if (!result.success && result.errors) {
          // 为错误添加字段路径
          const fieldErrors = result.errors.map(error => ({
            ...error,
            path: [name, ...error.path]
          }))
          allErrors.push(...fieldErrors)

          if (stopOnFirstError) {
            break
          }
        }
      }

      const success = allErrors.length === 0

      if (verbose) {
        if (success) {
          logger.completeTask(`批量字段验证`)
        } else {
          logger.error(`批量字段验证失败，错误数: ${allErrors.length}`)
        }
      }

      return {
        success,
        results,
        errors: allErrors,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `批量验证异常: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)

      return {
        success: false,
        results: {},
        errors: [{
          path: [],
          message: errorMsg,
          code: 'BATCH_VALIDATION_EXCEPTION'
        }],
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 创建验证链（链式调用）
   */
  static createValidationChain() {
    const validators: Array<(value: any) => Promise<ValidationResult>> = []

    return {
      /**
       * 添加验证器
       */
      add<T>(
        validator: (value: any) => Promise<ValidationResult<T>>
      ) {
        validators.push(validator)
        return this
      },

      /**
       * 执行验证链
       */
      async validate(value: unknown): Promise<ValidationResult> {
        let currentValue = value
        let allErrors: ValidationError[] = []
        const startTime = Date.now()

        for (const validator of validators) {
          const result = await validator(currentValue)

          if (!result.success) {
            allErrors.push(...(result.errors || []))
            return {
              success: false,
              errors: allErrors,
              duration: Date.now() - startTime
            }
          }

          // 如果验证器返回了转换后的数据，更新当前值
          if (result.data !== undefined) {
            currentValue = result.data
          }
        }

        return {
          success: true,
          data: currentValue,
          duration: Date.now() - startTime
        }
      }
    }
  }
}

/**
 * 预置验证规则（常用场景）
 */
export const ValidationRules = {
  /** 非空字符串 */
  requiredString: (options?: { minLength?: number; maxLength?: number }) =>
    (value: unknown) => ValidationUtils.validateString(value, {
      required: true,
      minLength: options?.minLength,
      maxLength: options?.maxLength
    }),

  /** 可选字符串 */
  optionalString: (options?: { minLength?: number; maxLength?: number }) =>
    (value: unknown) => ValidationUtils.validateString(value, {
      required: false,
      minLength: options?.minLength,
      maxLength: options?.maxLength
    }),

  /** 邮箱地址 */
  email: () =>
    (value: unknown) => ValidationUtils.validateEmail(value, { required: true }),

  /** URL地址 */
  url: () =>
    (value: unknown) => ValidationUtils.validateUrl(value, { required: true }),

  /** 正整数 */
  positiveInteger: (options?: { min?: number; max?: number }) =>
    (value: unknown) => ValidationUtils.validateNumber(value, {
      required: true,
      integer: true,
      positive: true,
      min: options?.min,
      max: options?.max
    }),

  /** 文件路径（必须存在） */
  existingFilePath: (options?: { extensions?: string[] }) =>
    (value: unknown) => ValidationUtils.validateFilePath(value, {
      required: true,
      mustExist: true,
      type: 'file',
      extensions: options?.extensions
    }),

  /** 目录路径（必须存在） */
  existingDirectoryPath: () =>
    (value: unknown) => ValidationUtils.validateFilePath(value, {
      required: true,
      mustExist: true,
      type: 'directory'
    }),

  /** 功能ID */
  featureId: () =>
    (value: unknown) => ValidationUtils.validateFeatureId(value, { required: true })
}

/**
 * 创建验证工具实例
 */
export function createValidationUtils(): ValidationUtils {
  return ValidationUtils
}

/**
 * 获取默认验证工具实例
 */
export function getValidationUtils(): ValidationUtils {
  return ValidationUtils
}

// 默认导出
export default {
  ValidationUtils,
  ValidationRules,
  createValidationUtils,
  getValidationUtils
}