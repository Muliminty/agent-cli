/**
 * 交互式提示工具模块
 * 设计思路：封装inquirer.js，提供常见交互场景的简化API，支持类型安全和验证
 *
 * 功能特点：
 * 1. 常见交互场景的预置模板（确认、选择、输入、多选等）
 * 2. 类型安全的输入/输出，支持泛型
 * 3. 输入验证和格式化，支持自定义验证规则
 * 4. 默认值和自动补全支持
 * 5. 交互式工作流，支持步骤链式调用
 */

import inquirer from 'inquirer'
import { createLogger } from './logger.js'
import type { Question, Answers, DistinctQuestion } from 'inquirer'

// 日志实例
const logger = createLogger()

// 提示选项基础接口
export interface PromptOptions<T = any> {
  /** 提示消息 */
  message: string
  /** 默认值 */
  defaultValue?: T
  /** 是否必填 */
  required?: boolean
  /** 验证函数，返回true表示验证通过，string表示错误消息 */
  validate?: (value: T) => boolean | string | Promise<boolean | string>
  /** 转换函数，在验证前转换输入值 */
  transform?: (value: any) => T
  /** 是否在答案中隐藏此字段 */
  when?: boolean | ((answers: Answers) => boolean)
  /** 页面大小（用于列表选择） */
  pageSize?: number
  /** 帮助文本 */
  helpText?: string
  /** 是否启用详细日志 */
  verbose?: boolean
}

// 文本输入选项
export interface TextPromptOptions extends PromptOptions<string> {
  /** 占位符文本 */
  placeholder?: string
  /** 是否多行输入 */
  multiline?: boolean
  /** 是否密码输入（隐藏字符） */
  password?: boolean
  /** 输入前缀 */
  prefix?: string
  /** 输入后缀 */
  suffix?: string
}

// 数字输入选项
export interface NumberPromptOptions extends PromptOptions<number> {
  /** 最小值 */
  min?: number
  /** 最大值 */
  max?: number
  /** 步长 */
  step?: number
  /** 是否允许小数 */
  allowDecimal?: boolean
}

// 选择选项
export interface Choice<T = string> {
  /** 显示名称 */
  name: string
  /** 值 */
  value: T
  /** 描述文本 */
  description?: string
  /** 是否禁用 */
  disabled?: boolean | string
  /** 是否选中（默认） */
  checked?: boolean
  /** 快捷键 */
  key?: string
}

// 选择提示选项
export interface SelectPromptOptions<T = string> extends PromptOptions<T> {
  /** 选项列表 */
  choices: Choice<T>[]
  /** 是否多选 */
  multiple?: boolean
  /** 是否循环选择 */
  loop?: boolean
  /** 是否搜索过滤 */
  searchable?: boolean
}

// 确认提示选项
export interface ConfirmPromptOptions extends PromptOptions<boolean> {
  /** 确认文本（默认"是"） */
  confirmText?: string
  /** 取消文本（默认"否"） */
  cancelText?: string
  /** 默认选择 */
  default?: boolean
}

// 文件/目录选择选项
export interface PathPromptOptions extends PromptOptions<string> {
  /** 路径类型：'file'文件，'dir'目录，'both'两者 */
  type?: 'file' | 'dir' | 'both'
  /** 基础路径（相对路径的基准） */
  basePath?: string
  /** 文件扩展名过滤（如 ['.js', '.ts']） */
  extensions?: string[]
  /** 是否必须存在 */
  mustExist?: boolean
  /** 是否允许创建新文件/目录 */
  allowCreate?: boolean
}

// 交互式工作流步骤
export interface WorkflowStep<T = any> {
  /** 步骤名称（用于结果对象key） */
  name: string
  /** 步骤类型 */
  type: 'text' | 'number' | 'select' | 'confirm' | 'multiselect' | 'path'
  /** 提示选项 */
  options: PromptOptions<T>
  /** 步骤描述（用于进度显示） */
  description?: string
}

// 工作流结果
export interface WorkflowResult {
  /** 是否成功完成所有步骤 */
  success: boolean
  /** 收集的答案 */
  answers: Record<string, any>
  /** 错误信息（如果有） */
  error?: string
  /** 是否被用户取消 */
  cancelled?: boolean
}

/**
 * 交互式提示工具类
 */
export class PromptUtils {
  /**
   * 文本输入提示
   */
  static async text(options: TextPromptOptions): Promise<string | null> {
    const startTime = Date.now()
    const {
      message,
      defaultValue,
      required = false,
      validate,
      transform,
      when,
      placeholder,
      multiline = false,
      password = false,
      prefix,
      suffix,
      helpText,
      verbose = false
    } = options

    try {
      if (verbose) {
        logger.startTask(`文本输入提示: ${message}`)
      }

      const question: DistinctQuestion = {
        type: password ? 'password' : (multiline ? 'editor' : 'input'),
        name: 'value',
        message,
        default: defaultValue,
        validate: required
          ? async (input: any) => {
              if (!input || (typeof input === 'string' && input.trim() === '')) {
                return '此项为必填项'
              }
              if (validate) {
                const result = await validate(input)
                if (typeof result === 'string') return result
                if (!result) return '输入验证失败'
              }
              return true
            }
          : validate,
        transformer: transform,
        when,
        prefix,
        suffix,
        ...(helpText && { description: helpText })
      }

      if (placeholder) {
        // 设置默认值为占位符（仅显示，不影响实际值）
        question.filter = (input: string) => {
          if (input === placeholder) return ''
          return input
        }
        question.default = placeholder
      }

      const answers = await inquirer.prompt([question])
      const result = answers.value

      if (verbose) {
        logger.completeTask(`文本输入完成: ${message}`)
        logger.debug(`输入结果: ${password ? '***' : result}`)
      }

      return result
    } catch (error) {
      const errorMsg = `文本输入失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return null
    } finally {
      if (verbose) {
        logger.debug(`文本输入耗时: ${Date.now() - startTime}ms`)
      }
    }
  }

  /**
   * 数字输入提示
   */
  static async number(options: NumberPromptOptions): Promise<number | null> {
    const startTime = Date.now()
    const {
      message,
      defaultValue,
      required = false,
      validate,
      min,
      max,
      step,
      allowDecimal = true,
      when,
      helpText,
      verbose = false
    } = options

    try {
      if (verbose) {
        logger.startTask(`数字输入提示: ${message}`)
      }

      const combinedValidate = async (input: any): Promise<boolean | string> => {
        // 转换为数字
        let num: number
        if (typeof input === 'string') {
          num = allowDecimal ? parseFloat(input) : parseInt(input, 10)
          if (isNaN(num)) {
            return '请输入有效的数字'
          }
        } else if (typeof input === 'number') {
          num = input
        } else {
          return '请输入有效的数字'
        }

        // 范围检查
        if (min !== undefined && num < min) {
          return `数字不能小于 ${min}`
        }
        if (max !== undefined && num > max) {
          return `数字不能大于 ${max}`
        }

        // 小数检查
        if (!allowDecimal && !Number.isInteger(num)) {
          return '请输入整数'
        }

        // 步长检查
        if (step !== undefined && Math.abs(num - (defaultValue || 0)) % step !== 0) {
          return `数字必须是 ${step} 的倍数`
        }

        // 必填检查
        if (required && (input === null || input === undefined || input === '')) {
          return '此项为必填项'
        }

        // 自定义验证
        if (validate) {
          const result = await validate(num)
          if (typeof result === 'string') return result
          if (!result) return '数字验证失败'
        }

        return true
      }

      const question: DistinctQuestion = {
        type: 'input',
        name: 'value',
        message,
        default: defaultValue,
        validate: combinedValidate,
        filter: (input: any) => {
          if (typeof input === 'string') {
            return allowDecimal ? parseFloat(input) : parseInt(input, 10)
          }
          return input
        },
        when,
        ...(helpText && { description: helpText })
      }

      const answers = await inquirer.prompt([question])
      const result = answers.value

      if (verbose) {
        logger.completeTask(`数字输入完成: ${message}`)
        logger.debug(`输入结果: ${result}`)
      }

      return result
    } catch (error) {
      const errorMsg = `数字输入失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return null
    } finally {
      if (verbose) {
        logger.debug(`数字输入耗时: ${Date.now() - startTime}ms`)
      }
    }
  }

  /**
   * 选择提示（单选或多选）
   */
  static async select<T = string>(options: SelectPromptOptions<T>): Promise<T | T[] | null> {
    const startTime = Date.now()
    const {
      message,
      defaultValue,
      choices,
      multiple = false,
      required = false,
      validate,
      when,
      loop = true,
      searchable = false,
      pageSize = 10,
      helpText,
      verbose = false
    } = options

    try {
      if (verbose) {
        logger.startTask(`选择提示: ${message}`)
      }

      if (!choices || choices.length === 0) {
        throw new Error('选项列表不能为空')
      }

      const question: DistinctQuestion = {
        type: multiple ? 'checkbox' : (searchable ? 'search-list' : 'list'),
        name: 'value',
        message,
        choices: choices.map(choice => ({
          name: choice.name,
          value: choice.value,
          ...(choice.description && { description: choice.description }),
          ...(choice.disabled && { disabled: choice.disabled }),
          ...(choice.checked && { checked: choice.checked }),
          ...(choice.key && { key: choice.key })
        })),
        default: defaultValue,
        validate: required
          ? (input: any) => {
              if (multiple) {
                if (!input || input.length === 0) {
                  return '请至少选择一个选项'
                }
              } else if (input === null || input === undefined || input === '') {
                return '请选择一个选项'
              }
              if (validate) {
                const result = validate(input)
                if (typeof result === 'string') return result
                if (!result) return '选择验证失败'
              }
              return true
            }
          : validate,
        loop,
        pageSize,
        when,
        ...(helpText && { description: helpText })
      }

      const answers = await inquirer.prompt([question])
      const result = answers.value

      if (verbose) {
        logger.completeTask(`选择完成: ${message}`)
        logger.debug(`选择结果: ${JSON.stringify(result)}`)
      }

      return result
    } catch (error) {
      const errorMsg = `选择提示失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return null
    } finally {
      if (verbose) {
        logger.debug(`选择提示耗时: ${Date.now() - startTime}ms`)
      }
    }
  }

  /**
   * 确认提示
   */
  static async confirm(options: ConfirmPromptOptions): Promise<boolean> {
    const startTime = Date.now()
    const {
      message,
      defaultValue = false,
      confirmText = '是',
      cancelText = '否',
      when,
      helpText,
      verbose = false
    } = options

    try {
      if (verbose) {
        logger.startTask(`确认提示: ${message}`)
      }

      const question: DistinctQuestion = {
        type: 'confirm',
        name: 'value',
        message,
        default: defaultValue,
        when,
        ...(helpText && { description: helpText })
      }

      const answers = await inquirer.prompt([question])
      const result = answers.value

      if (verbose) {
        logger.completeTask(`确认完成: ${message}`)
        logger.debug(`确认结果: ${result ? confirmText : cancelText}`)
      }

      return result
    } catch (error) {
      const errorMsg = `确认提示失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return false
    } finally {
      if (verbose) {
        logger.debug(`确认提示耗时: ${Date.now() - startTime}ms`)
      }
    }
  }

  /**
   * 多选提示
   */
  static async multiselect<T = string>(options: SelectPromptOptions<T>): Promise<T[] | null> {
    return this.select({
      ...options,
      multiple: true
    }) as Promise<T[] | null>
  }

  /**
   * 文件/目录路径选择提示
   */
  static async path(options: PathPromptOptions): Promise<string | null> {
    const startTime = Date.now()
    const {
      message,
      defaultValue,
      type = 'both',
      basePath = process.cwd(),
      extensions,
      mustExist = true,
      allowCreate = false,
      required = false,
      validate,
      when,
      helpText,
      verbose = false
    } = options

    try {
      if (verbose) {
        logger.startTask(`路径选择提示: ${message}`)
      }

      const question: DistinctQuestion = {
        type: 'input',
        name: 'value',
        message,
        default: defaultValue,
        validate: async (input: string) => {
          if (!input || input.trim() === '') {
            if (required) return '路径不能为空'
            return true
          }

          const resolvedPath = path.isAbsolute(input)
            ? input
            : path.join(basePath, input)

          // 检查路径是否存在
          if (mustExist) {
            const exists = await fs.pathExists(resolvedPath)
            if (!exists) {
              if (allowCreate) {
                return true // 允许创建新路径
              }
              return `路径不存在: ${resolvedPath}`
            }

            // 检查路径类型
            if (type !== 'both') {
              const stats = await fs.stat(resolvedPath)
              if (type === 'file' && !stats.isFile()) {
                return `路径不是文件: ${resolvedPath}`
              }
              if (type === 'dir' && !stats.isDirectory()) {
                return `路径不是目录: ${resolvedPath}`
              }
            }

            // 检查文件扩展名
            if (extensions && extensions.length > 0 && type !== 'dir') {
              const ext = path.extname(resolvedPath).toLowerCase()
              if (!extensions.map(e => e.toLowerCase()).includes(ext)) {
                return `文件扩展名必须是: ${extensions.join(', ')}`
              }
            }
          }

          // 自定义验证
          if (validate) {
            const result = await validate(resolvedPath)
            if (typeof result === 'string') return result
            if (!result) return '路径验证失败'
          }

          return true
        },
        filter: (input: string) => {
          if (!input) return input
          return path.isAbsolute(input)
            ? input
            : path.join(basePath, input)
        },
        when,
        ...(helpText && { description: helpText })
      }

      const answers = await inquirer.prompt([question])
      const result = answers.value

      if (verbose) {
        logger.completeTask(`路径选择完成: ${message}`)
        logger.debug(`路径结果: ${result}`)
      }

      return result
    } catch (error) {
      const errorMsg = `路径选择失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return null
    } finally {
      if (verbose) {
        logger.debug(`路径选择耗时: ${Date.now() - startTime}ms`)
      }
    }
  }

  /**
   * 交互式工作流（多步骤提问）
   */
  static async workflow(
    steps: WorkflowStep[],
    options: {
      /** 工作流标题 */
      title?: string
      /** 是否显示进度 */
      showProgress?: boolean
      /** 是否允许取消 */
      allowCancel?: boolean
      /** 取消回调 */
      onCancel?: () => void
    } = {}
  ): Promise<WorkflowResult> {
    const startTime = Date.now()
    const {
      title = '交互式工作流',
      showProgress = true,
      allowCancel = true,
      onCancel
    } = options

    try {
      if (showProgress) {
        logger.title(title)
        logger.info(`开始工作流，共 ${steps.length} 个步骤`)
      }

      const answers: Record<string, any> = {}
      let currentStep = 1

      for (const step of steps) {
        const { name, type, options: stepOptions, description } = step

        if (showProgress) {
          logger.startTask(`步骤 ${currentStep}/${steps.length}: ${description || name}`)
        }

        let result: any = null

        switch (type) {
          case 'text':
            result = await this.text(stepOptions as TextPromptOptions)
            break
          case 'number':
            result = await this.number(stepOptions as NumberPromptOptions)
            break
          case 'select':
            result = await this.select(stepOptions as SelectPromptOptions)
            break
          case 'multiselect':
            result = await this.multiselect(stepOptions as SelectPromptOptions)
            break
          case 'confirm':
            result = await this.confirm(stepOptions as ConfirmPromptOptions)
            break
          case 'path':
            result = await this.path(stepOptions as PathPromptOptions)
            break
          default:
            throw new Error(`未知的步骤类型: ${type}`)
        }

        // 检查是否取消
        if (result === null && allowCancel) {
          if (showProgress) {
            logger.warn('工作流被用户取消')
          }
          if (onCancel) {
            onCancel()
          }
          return {
            success: false,
            answers,
            cancelled: true
          }
        }

        answers[name] = result

        if (showProgress) {
          logger.completeTask(`步骤 ${currentStep}/${steps.length}: ${description || name}`)
        }

        currentStep++
      }

      if (showProgress) {
        logger.success(`工作流完成，共 ${steps.length} 个步骤`)
        logger.debug(`工作流结果: ${JSON.stringify(answers, null, 2)}`)
      }

      return {
        success: true,
        answers,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `工作流执行失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        answers: {},
        error: errorMsg
      }
    }
  }

  /**
   * 项目初始化工作流（预置模板）
   */
  static async projectInitWorkflow(): Promise<WorkflowResult> {
    const steps: WorkflowStep[] = [
      {
        name: 'projectName',
        type: 'text',
        description: '项目名称',
        options: {
          message: '请输入项目名称',
          required: true,
          validate: (value: string) => {
            if (!value || value.trim() === '') {
              return '项目名称不能为空'
            }
            if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
              return '项目名称只能包含字母、数字、下划线和连字符'
            }
            return true
          }
        }
      },
      {
        name: 'projectDescription',
        type: 'text',
        description: '项目描述',
        options: {
          message: '请输入项目描述',
          required: false,
          multiline: true,
          placeholder: '请输入项目的简要描述...'
        }
      },
      {
        name: 'techStack',
        type: 'multiselect',
        description: '技术栈选择',
        options: {
          message: '请选择技术栈',
          choices: [
            { name: 'React', value: 'react' },
            { name: 'Vue', value: 'vue' },
            { name: 'TypeScript', value: 'typescript' },
            { name: 'JavaScript', value: 'javascript' },
            { name: 'Tailwind CSS', value: 'tailwind' },
            { name: 'Node.js', value: 'node' },
            { name: 'Express', value: 'express' },
            { name: 'Next.js', value: 'nextjs' },
            { name: 'Vite', value: 'vite' },
            { name: 'Webpack', value: 'webpack' }
          ],
          required: true,
          validate: (value: string[]) => {
            if (!value || value.length === 0) {
              return '请至少选择一个技术栈'
            }
            return true
          }
        }
      },
      {
        name: 'template',
        type: 'select',
        description: '项目模板',
        options: {
          message: '请选择项目模板',
          choices: [
            { name: 'React应用模板', value: 'react-app', description: '标准React应用结构' },
            { name: 'Vue应用模板', value: 'vue-app', description: '标准Vue应用结构' },
            { name: 'Next.js应用模板', value: 'nextjs-app', description: 'Next.js应用结构' },
            { name: 'Node.js API模板', value: 'node-api', description: 'RESTful API服务' },
            { name: '库/包模板', value: 'library', description: 'TypeScript库项目' }
          ],
          required: true
        }
      },
      {
        name: 'aiModel',
        type: 'select',
        description: 'AI模型选择',
        options: {
          message: '请选择AI模型',
          choices: [
            { name: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet' },
            { name: 'Claude 3 Opus', value: 'claude-3-opus' },
            { name: 'GPT-4', value: 'gpt-4' },
            { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' }
          ],
          defaultValue: 'claude-3-5-sonnet'
        }
      },
      {
        name: 'generateDetailedFeatures',
        type: 'confirm',
        description: '生成详细功能列表',
        options: {
          message: '是否生成详细功能列表（200+功能点）？',
          defaultValue: true,
          confirmText: '生成',
          cancelText: '跳过'
        }
      },
      {
        name: 'autoCommit',
        type: 'confirm',
        description: '自动Git提交',
        options: {
          message: '是否启用自动Git提交？',
          defaultValue: true,
          confirmText: '启用',
          cancelText: '禁用'
        }
      }
    ]

    return this.workflow(steps, {
      title: '项目初始化配置',
      showProgress: true,
      allowCancel: true
    })
  }

  /**
   * 功能选择工作流（用于编码智能体）
   */
  static async featureSelectionWorkflow(
    features: Array<{ id: string; description: string; priority: string }>
  ): Promise<WorkflowResult> {
    if (!features || features.length === 0) {
      return {
        success: false,
        answers: {},
        error: '没有可用的功能列表'
      }
    }

    const steps: WorkflowStep[] = [
      {
        name: 'selectionMode',
        type: 'select',
        description: '功能选择模式',
        options: {
          message: '请选择功能选择模式',
          choices: [
            { name: '自动选择下一个功能', value: 'auto', description: '根据优先级和依赖自动选择' },
            { name: '手动选择功能', value: 'manual', description: '从列表中选择特定功能' },
            { name: '批量选择多个功能', value: 'batch', description: '选择多个功能批量实现' }
          ],
          defaultValue: 'auto'
        }
      }
    ]

    // 根据选择模式添加相应步骤
    const modeStep = steps[0]
    const workflowResult = await this.workflow([modeStep], {
      title: '功能选择',
      showProgress: false
    })

    if (!workflowResult.success || workflowResult.cancelled) {
      return workflowResult
    }

    const selectionMode = workflowResult.answers.selectionMode

    if (selectionMode === 'manual') {
      steps.push({
        name: 'selectedFeature',
        type: 'select',
        description: '选择功能',
        options: {
          message: '请选择要实现的功能',
          choices: features.map(f => ({
            name: `${f.id}: ${f.description} (${f.priority})`,
            value: f.id,
            description: f.description
          })),
          pageSize: Math.min(10, features.length),
          searchable: true,
          required: true
        }
      })
    } else if (selectionMode === 'batch') {
      steps.push({
        name: 'selectedFeatures',
        type: 'multiselect',
        description: '批量选择功能',
        options: {
          message: '请选择要批量实现的功能',
          choices: features.map(f => ({
            name: `${f.id}: ${f.description} (${f.priority})`,
            value: f.id,
            description: f.description
          })),
          pageSize: Math.min(10, features.length),
          searchable: true,
          required: true,
          validate: (value: string[]) => {
            if (!value || value.length === 0) {
              return '请至少选择一个功能'
            }
            return true
          }
        }
      })
    }

    return this.workflow(steps, {
      title: '功能选择配置',
      showProgress: true,
      allowCancel: true
    })
  }
}

// 需要导入path和fs-extra（在顶部已导入，但这里需要确保）
import path from 'path'
import fs from 'fs-extra'

/**
 * 创建提示工具实例
 */
export function createPromptUtils(): PromptUtils {
  return PromptUtils
}

/**
 * 获取默认提示工具实例
 */
export function getPromptUtils(): PromptUtils {
  return PromptUtils
}

// 默认导出
export default {
  PromptUtils,
  createPromptUtils,
  getPromptUtils
}