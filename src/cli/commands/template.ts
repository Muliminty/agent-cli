/**
 * 模板管理CLI命令
 * 设计思路：提供完整的模板管理功能，支持内置模板和用户自定义模板
 *
 * 功能特点：
 * 1. 模板发现和列表展示
 * 2. 模板详情和变量信息
 * 3. 模板渲染和变量替换
 * 4. 用户模板管理（添加、删除）
 * 5. 模板验证和测试
 */

import path from 'path'
import { createLogger } from '../../utils/logger.js'
import { TemplateUtils, type TemplateInfo, type TemplateSearchOptions } from '../../utils/template-utils.js'
import { FileUtils } from '../../utils/file-utils.js'

// 日志实例
const logger = createLogger()

// 命令处理函数类型
type TemplateCommandHandler = (options: any) => Promise<void>

/**
 * 处理模板列表命令
 */
export const handleTemplateList: TemplateCommandHandler = async (options) => {
  try {
    const searchOptions: TemplateSearchOptions = {
      query: options.query,
      types: options.type?.split(',').map((t: string) => t.trim()) as any,
      tags: options.tags?.split(',').map((t: string) => t.trim()),
      recursive: true,
      maxDepth: 3
    }

    logger.info('📋 正在扫描模板...')

    const result = await TemplateUtils.listTemplates(searchOptions)
    if (!result.success) {
      logger.error(`❌ 扫描模板失败: ${result.error}`)
      return
    }

    const templates = result.data!

    if (templates.length === 0) {
      logger.info('ℹ️  未找到任何模板')
      return
    }

    // 按类型分组
    const templatesByType: Record<string, TemplateInfo[]> = {}
    for (const template of templates) {
      if (!templatesByType[template.type]) {
        templatesByType[template.type] = []
      }
      templatesByType[template.type].push(template)
    }

    // 显示统计信息
    logger.info(`\n📊 模板统计:`)
    for (const [type, typeTemplates] of Object.entries(templatesByType)) {
      logger.info(`  ${type}: ${typeTemplates.length} 个模板`)
    }

    // 显示模板列表
    logger.info('\n📋 可用模板列表:')

    for (const [type, typeTemplates] of Object.entries(templatesByType)) {
      logger.info(`\n${type.toUpperCase()} 模板:`)

      for (const template of typeTemplates) {
        const desc = template.description ? ` - ${template.description}` : ''
        const vars = template.variables?.length ? ` (${template.variables.length} 个变量)` : ''

        logger.info(`  • ${template.name}${desc}${vars}`)

        if (options.verbose) {
          logger.info(`    路径: ${template.filePath}`)
          if (template.metadata?.version) {
            logger.info(`    版本: ${template.metadata.version}`)
          }
          if (template.metadata?.tags?.length) {
            logger.info(`    标签: ${template.metadata.tags.join(', ')}`)
          }
        }
      }
    }

    // 提示信息
    if (!options.verbose) {
      logger.info('\n💡 使用 --verbose 查看详细信息和 --query 进行筛选')
      logger.info('💡 使用 agent-cli template info <模板名> 查看模板详情')
    }

  } catch (error) {
    logger.error(`❌ 执行模板列表命令失败: ${error instanceof Error ? error.message : String(error)}`)
    if (options.debug && error instanceof Error) {
      logger.debug(error.stack || '无堆栈信息')
    }
  }
}

/**
 * 处理模板详情命令
 */
export const handleTemplateInfo: TemplateCommandHandler = async (options) => {
  try {
    const templateName = options.args?.[0]
    if (!templateName) {
      logger.error('❌ 请提供模板名称')
      logger.info('💡 用法: agent-cli template info <模板名称>')
      return
    }

    logger.info(`🔍 正在查找模板 "${templateName}"...`)

    const template = await TemplateUtils.getTemplate(templateName, options.type as any)
    if (!template) {
      logger.error(`❌ 模板未找到: ${templateName}`)
      logger.info('💡 使用 agent-cli template list 查看所有可用模板')
      return
    }

    // 显示模板详情
    logger.info(`\n📄 模板详情:`)
    logger.info(`  名称: ${template.name}`)
    logger.info(`  类型: ${template.type}`)
    logger.info(`  路径: ${template.filePath}`)

    if (template.description) {
      logger.info(`  描述: ${template.description}`)
    }

    // 显示元数据
    if (template.metadata) {
      logger.info(`\n📊 元数据:`)
      if (template.metadata.version) {
        logger.info(`  版本: ${template.metadata.version}`)
      }
      if (template.metadata.author) {
        logger.info(`  作者: ${template.metadata.author}`)
      }
      if (template.metadata.createdAt) {
        logger.info(`  创建时间: ${template.metadata.createdAt}`)
      }
      if (template.metadata.updatedAt) {
        logger.info(`  更新时间: ${template.metadata.updatedAt}`)
      }
      if (template.metadata.tags?.length) {
        logger.info(`  标签: ${template.metadata.tags.join(', ')}`)
      }
      if (template.metadata.compatibility?.length) {
        logger.info(`  兼容性: ${template.metadata.compatibility.join(', ')}`)
      }
    }

    // 显示变量信息
    if (template.variables && template.variables.length > 0) {
      logger.info(`\n🎯 模板变量 (${template.variables.length} 个):`)

      for (const variable of template.variables) {
        logger.info(`\n  • ${variable.name}`)
        if (variable.description) {
          logger.info(`    描述: ${variable.description}`)
        }
        if (variable.type) {
          logger.info(`    类型: ${variable.type}`)
        }
        logger.info(`    必需: ${variable.required ? '是' : '否'}`)
        if (variable.defaultValue !== undefined) {
          logger.info(`    默认值: ${JSON.stringify(variable.defaultValue)}`)
        }
        if (variable.example !== undefined) {
          logger.info(`    示例: ${JSON.stringify(variable.example)}`)
        }
      }
    } else {
      logger.info(`\n🎯 模板变量: 无`)
    }

    // 显示预览（前几行）
    try {
      const contentResult = await FileUtils.readFile(template.filePath, {
        throwIfMissing: false,
        defaultValue: ''
      })

      if (contentResult.success && contentResult.data) {
        const content = contentResult.data as string
        const lines = content.split('\n').slice(0, 10) // 前10行
        const preview = lines.join('\n')

        logger.info(`\n📝 内容预览:`)
        logger.info(preview)

        if (lines.length < content.split('\n').length) {
          logger.info(`  ... (共 ${content.split('\n').length} 行，显示前10行)`)
        }
      }
    } catch (error) {
      logger.warn(`无法读取模板内容: ${error instanceof Error ? error.message : String(error)}`)
    }

  } catch (error) {
    logger.error(`❌ 执行模板详情命令失败: ${error instanceof Error ? error.message : String(error)}`)
    if (options.debug && error instanceof Error) {
      logger.debug(error.stack || '无堆栈信息')
    }
  }
}

/**
 * 处理模板渲染命令
 */
export const handleTemplateRender: TemplateCommandHandler = async (options) => {
  try {
    const templateName = options.args?.[0]
    if (!templateName) {
      logger.error('❌ 请提供模板名称')
      logger.info('💡 用法: agent-cli template render <模板名称> [--output <输出路径>]')
      return
    }

    logger.info(`🎨 正在渲染模板 "${templateName}"...`)

    // 查找模板
    const template = await TemplateUtils.getTemplate(templateName, options.type as any)
    if (!template) {
      logger.error(`❌ 模板未找到: ${templateName}`)
      return
    }

    // 解析数据
    let data: Record<string, any> = {}

    // 从文件读取数据
    if (options.dataFile) {
      try {
        const dataResult = await FileUtils.readFile(options.dataFile, {
          parseJson: true,
          throwIfMissing: true
        })

        if (!dataResult.success) {
          logger.error(`❌ 读取数据文件失败: ${dataResult.error}`)
          return
        }

        data = dataResult.data as Record<string, any>
        logger.debug(`从文件加载数据: ${options.dataFile}`)
      } catch (error) {
        logger.error(`❌ 解析数据文件失败: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }

    // 从命令行参数读取数据
    if (options.data) {
      try {
        const parsedData = JSON.parse(options.data)
        if (typeof parsedData === 'object' && parsedData !== null) {
          data = { ...data, ...parsedData }
        }
        logger.debug('从命令行参数加载数据')
      } catch (error) {
        logger.error(`❌ 解析命令行数据失败: ${error instanceof Error ? error.message : String(error)}`)
        logger.info('💡 数据应为有效的JSON格式，例如: \'{"name":"value"}\'')
        return
      }
    }

    // 从环境变量读取数据
    if (options.envPrefix) {
      const prefix = options.envPrefix
      for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith(prefix)) {
          const dataKey = key.substring(prefix.length).replace(/_/g, '.').toLowerCase()
          data[dataKey] = value
        }
      }
      logger.debug(`从环境变量加载数据 (前缀: ${prefix})`)
    }

    // 交互式输入缺失的必需变量
    if (options.interactive && template.variables) {
      const missingRequired = template.variables.filter(
        v => v.required && data[v.name] === undefined
      )

      if (missingRequired.length > 0) {
        logger.info(`\n📝 需要输入以下必需变量:`)

        for (const variable of missingRequired) {
          const prompt = variable.description
            ? `${variable.name} (${variable.description}): `
            : `${variable.name}: `

          // 简单实现：实际项目中应使用inquirer
          logger.info(prompt, { newline: false })
          // 注意：这里需要实际实现输入逻辑，暂时跳过
          logger.info(`[交互式输入待实现]`)
          data[variable.name] = `[${variable.name}]`
        }
      }
    }

    // 验证变量
    if (!options.skipValidation) {
      const validation = TemplateUtils.validateTemplateVariables(template, data)

      if (validation.warnings.length > 0) {
        logger.warn(`⚠️  变量验证警告:`)
        for (const warning of validation.warnings) {
          logger.warn(`  • ${warning}`)
        }
      }

      if (!validation.valid) {
        logger.error(`❌ 变量验证失败:`)
        for (const error of validation.errors) {
          logger.error(`  • ${error}`)
        }
        return
      }
    }

    // 设置输出路径
    let outputPath = options.output
    if (!outputPath && template.variables?.some(v => v.name === 'outputPath')) {
      // 如果模板有outputPath变量，使用它
      outputPath = data.outputPath
    }

    // 渲染模板
    const renderOptions = {
      outputPath,
      ensureDir: options.ensureDir ?? true,
      strictMode: options.strict ?? false,
      extraData: options.extraData ? JSON.parse(options.extraData) : undefined
    }

    const renderResult = await TemplateUtils.renderTemplate(templateName, data, renderOptions)

    if (!renderResult.success) {
      logger.error(`❌ 模板渲染失败: ${renderResult.error}`)
      return
    }

    // 显示结果
    if (outputPath) {
      logger.info(`✅ 模板渲染成功!`)
      logger.info(`📁 输出文件: ${path.resolve(outputPath)}`)

      if (options.verbose) {
        const statsResult = await FileUtils.stat(outputPath)
        if (statsResult.success && statsResult.data) {
          const stats = statsResult.data
          logger.info(`📊 文件信息: ${stats.size} 字节, 创建于 ${stats.birthtime.toLocaleString()}`)
        }
      }
    } else {
      logger.info(`✅ 模板渲染成功!`)
      logger.info(`📝 渲染结果:`)
      logger.info(renderResult.data as string)
    }

  } catch (error) {
    logger.error(`❌ 执行模板渲染命令失败: ${error instanceof Error ? error.message : String(error)}`)
    if (options.debug && error instanceof Error) {
      logger.debug(error.stack || '无堆栈信息')
    }
  }
}

/**
 * 处理模板添加命令
 */
export const handleTemplateAdd: TemplateCommandHandler = async (options) => {
  try {
    const sourcePath = options.args?.[0]
    if (!sourcePath) {
      logger.error('❌ 请提供源文件路径')
      logger.info('💡 用法: agent-cli template add <源文件路径> [模板名称]')
      return
    }

    const templateName = options.args?.[1]
    logger.info(`➕ 正在添加模板 "${templateName || path.basename(sourcePath)}"...`)

    const result = await TemplateUtils.addUserTemplate(sourcePath, templateName)
    if (!result.success) {
      logger.error(`❌ 添加模板失败: ${result.error}`)
      return
    }

    const template = result.data!
    logger.info(`✅ 模板添加成功!`)
    logger.info(`📁 模板名称: ${template.name}`)
    logger.info(`📁 模板路径: ${template.filePath}`)
    logger.info(`📊 模板类型: ${template.type}`)

    if (template.description) {
      logger.info(`📝 模板描述: ${template.description}`)
    }

    if (template.variables?.length) {
      logger.info(`🎯 检测到 ${template.variables.length} 个变量`)
    }

    logger.info(`\n💡 使用以下命令查看模板详情:`)
    logger.info(`  $ agent-cli template info ${template.name}`)

  } catch (error) {
    logger.error(`❌ 执行模板添加命令失败: ${error instanceof Error ? error.message : String(error)}`)
    if (options.debug && error instanceof Error) {
      logger.debug(error.stack || '无堆栈信息')
    }
  }
}

/**
 * 处理模板删除命令
 */
export const handleTemplateDelete: TemplateCommandHandler = async (options) => {
  try {
    const templateName = options.args?.[0]
    if (!templateName) {
      logger.error('❌ 请提供模板名称')
      logger.info('💡 用法: agent-cli template delete <模板名称>')
      return
    }

    // 确认删除（除非指定 --force）
    if (!options.force) {
      logger.warn(`⚠️  您确定要删除模板 "${templateName}" 吗？`)
      logger.warn(`  此操作将永久删除模板文件`)
      // 简单实现：实际项目中应使用inquirer进行确认
      logger.info('[删除确认待实现 - 使用 --force 跳过确认]')
      return
    }

    logger.info(`🗑️  正在删除模板 "${templateName}"...`)

    const result = await TemplateUtils.deleteTemplate(templateName, options.type as any)
    if (!result.success) {
      logger.error(`❌ 删除模板失败: ${result.error}`)
      return
    }

    logger.info(`✅ 模板删除成功!`)
    logger.info(`📁 已删除文件: ${result.filePath}`)

  } catch (error) {
    logger.error(`❌ 执行模板删除命令失败: ${error instanceof Error ? error.message : String(error)}`)
    if (options.debug && error instanceof Error) {
      logger.debug(error.stack || '无堆栈信息')
    }
  }
}

/**
 * 处理模板验证命令
 */
export const handleTemplateValidate: TemplateCommandHandler = async (options) => {
  try {
    const templateName = options.args?.[0]
    if (!templateName) {
      logger.error('❌ 请提供模板名称')
      logger.info('💡 用法: agent-cli template validate <模板名称> [--data <JSON数据>]')
      return
    }

    logger.info(`🔍 正在验证模板 "${templateName}"...`)

    // 查找模板
    const template = await TemplateUtils.getTemplate(templateName, options.type as any)
    if (!template) {
      logger.error(`❌ 模板未找到: ${templateName}`)
      return
    }

    // 解析测试数据
    let testData: Record<string, any> = {}

    if (options.testData) {
      try {
        testData = JSON.parse(options.testData)
      } catch (error) {
        logger.error(`❌ 解析测试数据失败: ${error instanceof Error ? error.message : String(error)}`)
        return
      }
    }

    // 验证模板
    const validation = TemplateUtils.validateTemplateVariables(template, testData)

    logger.info(`\n📊 模板验证结果:`)
    logger.info(`  模板名称: ${template.name}`)
    logger.info(`  模板类型: ${template.type}`)
    logger.info(`  文件路径: ${template.filePath}`)
    logger.info(`  变量总数: ${template.variables?.length || 0}`)
    logger.info(`  必需变量: ${template.variables?.filter(v => v.required).length || 0}`)

    if (validation.valid) {
      logger.info(`✅ 模板验证通过!`)

      if (validation.warnings.length > 0) {
        logger.warn(`\n⚠️  验证警告:`)
        for (const warning of validation.warnings) {
          logger.warn(`  • ${warning}`)
        }
      }
    } else {
      logger.error(`❌ 模板验证失败!`)

      if (validation.errors.length > 0) {
        logger.error(`\n❌ 验证错误:`)
        for (const error of validation.errors) {
          logger.error(`  • ${error}`)
        }
      }

      if (validation.warnings.length > 0) {
        logger.warn(`\n⚠️  验证警告:`)
        for (const warning of validation.warnings) {
          logger.warn(`  • ${warning}`)
        }
      }
    }

    // 显示变量详情
    if (template.variables && template.variables.length > 0) {
      logger.info(`\n🎯 变量详情:`)

      for (const variable of template.variables) {
        const status = testData[variable.name] !== undefined ? '✅ 已提供' :
                      variable.required ? '❌ 缺失' : '⚠️  可选'

        logger.info(`\n  • ${variable.name} - ${status}`)
        if (variable.description) {
          logger.info(`    描述: ${variable.description}`)
        }
        if (variable.type) {
          logger.info(`    类型: ${variable.type}`)
        }
        if (testData[variable.name] !== undefined) {
          logger.info(`    测试值: ${JSON.stringify(testData[variable.name])}`)
        } else if (variable.defaultValue !== undefined) {
          logger.info(`    默认值: ${JSON.stringify(variable.defaultValue)}`)
        }
      }
    }

    // 建议
    logger.info(`\n💡 建议:`)
    if (!validation.valid) {
      logger.info(`  1. 提供所有必需变量`)
      logger.info(`  2. 确保变量类型正确`)
      logger.info(`  3. 使用 --test-data '{"var":"value"}' 提供测试数据`)
    } else if (template.variables?.some(v => v.required && testData[v.name] === undefined)) {
      logger.info(`  1. 模板验证通过，但部分必需变量未在测试数据中提供`)
      logger.info(`  2. 在实际使用时需要提供这些变量`)
    } else {
      logger.info(`  1. 模板完全有效，可以安全使用`)
      logger.info(`  2. 使用 agent-cli template render 渲染模板`)
    }

  } catch (error) {
    logger.error(`❌ 执行模板验证命令失败: ${error instanceof Error ? error.message : String(error)}`)
    if (options.debug && error instanceof Error) {
      logger.debug(error.stack || '无堆栈信息')
    }
  }
}

/**
 * 主模板命令处理函数
 */
export const handleTemplateCommand: TemplateCommandHandler = async (options) => {
  try {
    const subcommand = options.args?.[0]
    // 移除子命令，使args数组从第一个参数开始
    if (options.args && options.args.length > 0) {
      options.args = options.args.slice(1)
    }

    switch (subcommand) {
      case 'list':
        await handleTemplateList(options)
        break
      case 'info':
        await handleTemplateInfo(options)
        break
      case 'render':
        await handleTemplateRender(options)
        break
      case 'add':
        await handleTemplateAdd(options)
        break
      case 'delete':
        await handleTemplateDelete(options)
        break
      case 'validate':
        await handleTemplateValidate(options)
        break
      case 'help':
      case '--help':
      case '-h':
        showTemplateHelp()
        break
      default:
        if (!subcommand) {
          logger.error('❌ 请提供子命令')
        } else {
          logger.error(`❌ 未知子命令: ${subcommand}`)
        }
        showTemplateHelp()
    }
  } catch (error) {
    logger.error(`❌ 模板命令执行失败: ${error instanceof Error ? error.message : String(error)}`)
    if (options.debug && error instanceof Error) {
      logger.debug(error.stack || '无堆栈信息')
    }
  }
}

/**
 * 显示模板命令帮助信息
 */
function showTemplateHelp(): void {
  logger.info(`
📋 模板管理命令

用法:
  agent-cli template <子命令> [选项]

子命令:
  list                  列出所有可用模板
  info <模板名称>       显示模板详情和变量信息
  render <模板名称>     渲染模板
  add <源文件路径>      添加用户模板
  delete <模板名称>     删除模板
  validate <模板名称>   验证模板

全局选项:
  -t, --type <类型>     模板类型 (builtin, user, project)
  -v, --verbose         详细输出模式
  -d, --debug           调试模式

示例:
  $ agent-cli template list
  $ agent-cli template info init-prompt
  $ agent-cli template render init-prompt --output ./output.md
  $ agent-cli template add ./my-template.md
  $ agent-cli template delete my-template --force
  $ agent-cli template validate init-prompt --test-data '{"projectName":"测试"}'

更多信息:
  - 内置模板位于 templates/ 目录
  - 用户模板位于 ~/.agent-cli/templates/ 目录
  - 项目模板位于 .templates/ 目录
  - 模板支持 {{变量名}} 语法进行变量替换
  `)
}

// 导出主处理函数
export default handleTemplateCommand