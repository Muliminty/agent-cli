/**
 * 编码智能体模块
 * 设计思路：负责增量功能实现，根据进度跟踪器选择下一个要完成的功能，执行代码修改和测试
 *
 * 核心功能：
 * 1. 增量功能选择逻辑（基于优先级、依赖关系、复杂度）
 * 2. 代码修改流程（读取当前代码，应用修改，验证语法）
 * 3. 测试验证机制（运行单元测试和端到端测试）
 * 4. 状态更新逻辑（更新进度跟踪器，生成提交消息）
 *
 * 踩坑提醒：
 * 1. 代码修改需要保持代码风格一致性
 * 2. 测试失败时需要有回滚机制
 * 3. 增量选择要考虑功能间的依赖关系
 * 4. 大功能需要拆分成多个小步骤
 */

import { BaseAgent, AgentResult, AgentConfig, AgentContext } from './base.js'
import { ProgressTracker } from '../progress/tracker.js'
import { GitManager } from '../git/manager.js'
import { createLogger } from '../../utils/logger.js'
import fs from 'fs-extra'
import path from 'path'
import { execa } from 'execa'
import type { Feature, FeatureList, FeatureStatus, FeatureCategory, FeaturePriority, FeatureComplexity } from '../../types/feature.js'
import type { Config } from '../../config/schema.js'
import type { ProjectState } from '../../types/project.js'

// 编码配置选项
export interface CoderOptions {
  /** 是否自动选择下一个功能 */
  autoSelect?: boolean
  /** 指定要处理的功能ID */
  featureId?: string
  /** 是否运行测试 */
  runTests?: boolean
  /** 测试失败时是否中断流程 */
  failOnTestFailure?: boolean
  /** 是否自动提交 */
  autoCommit?: boolean
  /** 提交消息模板 */
  commitTemplate?: string
  /** 最大重试次数 */
  maxRetries?: number
  /** 是否启用详细日志 */
  verbose?: boolean
}

/**
 * 编码智能体类
 * 负责增量功能实现和代码修改
 */
export class CoderAgent extends BaseAgent {
  private options: CoderOptions
  private progressTracker: ProgressTracker | null = null
  private gitManager: GitManager | null = null
  private currentFeature: Feature | null = null

  constructor(context: AgentContext, options: CoderOptions, config: Partial<AgentConfig> = {}) {
    super(context, {
      name: 'CoderAgent',
      description: '编码智能体，负责增量功能实现和代码修改',
      maxRetries: options.maxRetries || 3,
      retryDelay: 1000,
      timeout: 300000, // 5分钟超时（编码可能较耗时）
      verbose: options.verbose || false,
      enablePerformanceMonitoring: true,
      ...config
    })

    this.options = {
      autoSelect: true,
      runTests: true,
      failOnTestFailure: true,
      autoCommit: true,
      commitTemplate: 'feat: {feature_description}',
      ...options
    }
  }

  /**
   * 智能体初始化逻辑
   */
  protected async onInitialize(): Promise<void> {
    this.logger.debug('初始化编码智能体')

    try {
      // 初始化进度跟踪器
      this.progressTracker = new ProgressTracker({
        projectPath: this.context.projectPath,
        autoSave: true,
        verbose: this.config.verbose
      })

      // 初始化Git管理器
      this.gitManager = new GitManager({
        repoPath: this.context.projectPath,
        verbose: this.config.verbose
      })

      this.logger.debug('编码智能体初始化完成')
    } catch (error) {
      this.logger.error(`编码智能体初始化失败: ${error}`)
      throw error
    }
  }

  /**
   * 智能体执行逻辑 - 增量功能实现
   */
  protected async onExecute(options: Record<string, any>, signal: AbortSignal): Promise<AgentResult> {
    const startTime = Date.now()

    try {
      this.emit('started', { startTime })

      // 步骤1: 选择要处理的功能
      await this.selectFeatureToImplement()

      if (!this.currentFeature) {
        return {
          success: true,
          data: { message: '没有可处理的功能' },
          duration: Date.now() - startTime
        }
      }

      // 步骤2: 分析功能需求
      await this.analyzeFeatureRequirements()

      // 步骤3: 执行代码修改
      await this.executeCodeChanges()

      // 步骤4: 运行测试验证
      if (this.options.runTests) {
        await this.runTests()
      }

      // 步骤5: 更新进度状态
      await this.updateProgress()

      // 步骤6: 自动提交（如果启用）
      if (this.options.autoCommit && this.gitManager) {
        await this.createCommit()
      }

      const duration = Date.now() - startTime
      this.emit('completed', { duration, feature: this.currentFeature })

      return {
        success: true,
        data: {
          featureId: this.currentFeature.id,
          featureDescription: this.currentFeature.description,
          duration
        },
        duration
      }
    } catch (error) {
      const duration = Date.now() - startTime
      this.emit('failed', { error, duration })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration
      }
    }
  }

  /**
   * 选择要处理的功能
   * 实现增量功能选择逻辑：基于优先级、依赖关系、复杂度选择下一个要完成的功能
   */
  private async selectFeatureToImplement(): Promise<void> {
    this.logger.startTask('选择要处理的功能')

    if (this.options.featureId && this.progressTracker) {
      // 如果指定了功能ID，直接选择该功能
      const feature = this.progressTracker.getFeature(this.options.featureId)
      if (feature) {
        this.currentFeature = feature
        this.logger.debug(`选择指定功能: ${feature.id} - ${feature.description}`)
      }
    } else if (this.options.autoSelect && this.progressTracker) {
      // 自动选择下一个功能（基于优先级、依赖关系、复杂度等）
      const features = this.progressTracker.getFeatureList()
      const pendingFeatures = features.filter(f => f.status === 'pending')

      if (pendingFeatures.length > 0) {
        // 过滤掉依赖项未完成的功能
        const availableFeatures = this.filterFeaturesByDependencies(pendingFeatures, features)

        if (availableFeatures.length > 0) {
          // 根据优先级和复杂度评分选择最佳功能
          this.currentFeature = this.selectBestFeature(availableFeatures)
          this.logger.debug(`智能选择功能: ${this.currentFeature.id} - ${this.currentFeature.description}`)
        } else {
          this.logger.warn('有未完成的依赖功能，无法选择新功能')
          // 检查是否有阻塞的功能（依赖已完成但自身被阻塞）
          const blockedFeatures = pendingFeatures.filter(f => f.status === 'blocked')
          if (blockedFeatures.length > 0) {
            this.logger.info(`有 ${blockedFeatures.length} 个功能处于阻塞状态，需要手动处理`)
          }
        }
      }
    }

    if (this.currentFeature) {
      this.logger.completeTask(`选择功能: ${this.currentFeature.description}`)
    } else {
      this.logger.completeTask('没有可处理的功能')
    }
  }

  /**
   * 过滤功能列表，只返回依赖项已完成的功能
   */
  private filterFeaturesByDependencies(
    features: Feature[],
    allFeatures: Feature[]
  ): Feature[] {
    // 创建已完成功能的ID集合
    const completedFeatureIds = new Set(
      allFeatures
        .filter(f => f.status === 'completed')
        .map(f => f.id)
    )

    return features.filter(feature => {
      // 如果没有依赖项，直接可用
      if (!feature.dependencies || feature.dependencies.length === 0) {
        return true
      }

      // 检查所有依赖项是否都已完成
      return feature.dependencies.every(depId => completedFeatureIds.has(depId))
    })
  }

  /**
   * 选择最佳功能（基于优先级和复杂度评分）
   */
  private selectBestFeature(features: Feature[]): Feature {
    // 优先级权重映射
    const priorityWeights: Record<FeaturePriority, number> = {
      critical: 100,
      high: 75,
      medium: 50,
      low: 25
    }

    // 复杂度权重映射（简单功能优先）
    const complexityWeights: Record<FeatureComplexity, number> = {
      simple: 100,
      medium: 75,
      complex: 50
    }

    // 计算每个功能的得分
    const scoredFeatures = features.map(feature => {
      const priorityScore = priorityWeights[feature.priority] || 50
      const complexityScore = complexityWeights[feature.estimatedComplexity] || 75

      // 组合得分：优先级权重更高
      const totalScore = priorityScore * 0.7 + complexityScore * 0.3

      return {
        feature,
        score: totalScore,
        priorityScore,
        complexityScore
      }
    })

    // 按得分降序排序
    scoredFeatures.sort((a, b) => b.score - a.score)

    // 记录选择原因（用于调试）
    const selected = scoredFeatures[0]
    this.logger.debug(`功能选择详情:
      - 功能ID: ${selected.feature.id}
      - 描述: ${selected.feature.description}
      - 总得分: ${selected.score.toFixed(2)}
      - 优先级得分: ${selected.priorityScore} (${selected.feature.priority})
      - 复杂度得分: ${selected.complexityScore} (${selected.feature.estimatedComplexity})
      - 候选功能数: ${features.length}`)

    return selected.feature
  }

  /**
   * 分析功能需求
   * TODO: 实现需求分析逻辑
   */
  private async analyzeFeatureRequirements(): Promise<void> {
    if (!this.currentFeature) {
      throw new Error('没有选中的功能')
    }

    this.logger.startTask('分析功能需求')

    // TODO: 分析功能描述，拆分成具体任务
    // TODO: 检查现有代码结构，确定修改位置
    // TODO: 验证依赖功能是否已完成

    this.logger.completeTask('功能需求分析完成')
  }

  /**
   * 执行代码修改
   * TODO: 实现代码修改逻辑
   */
  private async executeCodeChanges(): Promise<void> {
    if (!this.currentFeature) {
      throw new Error('没有选中的功能')
    }

    this.logger.startTask('执行代码修改')

    // 在开始代码修改前标记功能为进行中
    await this.markFeatureAsInProgress()

    try {
      // 步骤1: 确定要修改的文件
      const filesToModify = await this.identifyFilesToModify()

      if (filesToModify.length === 0) {
        this.logger.warn('没有找到需要修改的文件，跳过代码修改步骤')
        return
      }

      // 步骤2: 读取现有文件内容
      const fileContents = await this.readFileContents(filesToModify)

      // 步骤3: 分析现有代码结构
      const codeAnalysis = await this.analyzeCodeStructure(fileContents)

      // 步骤4: 生成修改计划
      const modificationPlan = await this.generateModificationPlan(codeAnalysis)

      // 步骤5: 应用修改到文件内容
      const modifiedContents = await this.applyModifications(fileContents, modificationPlan)

      // 步骤6: 验证修改后的代码语法
      await this.validateCodeSyntax(modifiedContents)

      // 步骤7: 保存修改后的文件
      await this.saveModifiedFiles(filesToModify, modifiedContents)

      this.logger.success(`代码修改完成，共修改 ${filesToModify.length} 个文件`)
      this.recordProgress({
        action: 'code_modified',
        description: `代码修改完成，涉及 ${filesToModify.length} 个文件`,
        details: {
          files: filesToModify,
          featureId: this.currentFeature.id
        }
      })

    } catch (error) {
      this.logger.error(`代码修改失败: ${error}`)
      throw new Error(`代码修改失败: ${error}`)
    }

    this.logger.completeTask('代码修改执行完成')
  }

  /**
   * 确定需要修改的文件
   */
  private async identifyFilesToModify(): Promise<string[]> {
    if (!this.currentFeature) {
      return []
    }

    const files: string[] = []

    // 从功能的相关文件字段获取
    if (this.currentFeature.relatedFiles && this.currentFeature.relatedFiles.length > 0) {
      files.push(...this.currentFeature.relatedFiles)
    }

    // 根据功能描述推断可能相关的文件
    const inferredFiles = await this.inferFilesFromFeatureDescription()
    files.push(...inferredFiles)

    // 去重并过滤不存在的文件
    const uniqueFiles = [...new Set(files)]
    const existingFiles: string[] = []

    for (const file of uniqueFiles) {
      const filePath = path.join(this.context.projectPath, file)
      try {
        const exists = await fs.pathExists(filePath)
        if (exists) {
          existingFiles.push(file)
        } else {
          this.logger.debug(`文件不存在，跳过: ${file}`)
        }
      } catch (error) {
        this.logger.warn(`检查文件失败 ${file}: ${error}`)
      }
    }

    this.logger.debug(`确定需要修改的文件: ${existingFiles.length} 个`)
    return existingFiles
  }

  /**
   * 根据功能描述推断相关文件
   */
  private async inferFilesFromFeatureDescription(): Promise<string[]> {
    if (!this.currentFeature) {
      return []
    }

    const description = this.currentFeature.description.toLowerCase()
    const files: string[] = []

    // 简单推断逻辑（可根据需要扩展）
    if (description.includes('component') || description.includes('组件')) {
      files.push('src/components/')
    }
    if (description.includes('page') || description.includes('页面')) {
      files.push('src/pages/')
    }
    if (description.includes('api') || description.includes('接口')) {
      files.push('src/services/')
    }
    if (description.includes('style') || description.includes('样式')) {
      files.push('src/styles/')
    }
    if (description.includes('test') || description.includes('测试')) {
      files.push('tests/')
    }

    return files
  }

  /**
   * 读取文件内容
   */
  private async readFileContents(files: string[]): Promise<Map<string, string>> {
    const contents = new Map<string, string>()

    for (const file of files) {
      const filePath = path.join(this.context.projectPath, file)
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        contents.set(file, content)
        this.logger.debug(`读取文件: ${file} (${content.length} 字符)`)
      } catch (error) {
        this.logger.error(`读取文件失败 ${file}: ${error}`)
        throw new Error(`无法读取文件 ${file}: ${error}`)
      }
    }

    return contents
  }

  /**
   * 分析代码结构（占位实现）
   */
  private async analyzeCodeStructure(fileContents: Map<string, string>): Promise<any> {
    // TODO: 实现代码结构分析（AST解析等）
    this.logger.debug('分析代码结构（占位实现）')

    const analysis = {
      fileCount: fileContents.size,
      totalLines: 0,
      languageDetected: 'unknown'
    }

    // 简单统计
    for (const [file, content] of fileContents) {
      analysis.totalLines += content.split('\n').length
    }

    return analysis
  }

  /**
   * 生成修改计划（占位实现）
   */
  private async generateModificationPlan(codeAnalysis: any): Promise<any> {
    // TODO: 基于功能需求生成具体的修改计划
    this.logger.debug('生成修改计划（占位实现）')

    return {
      modifications: [],
      estimatedComplexity: 'medium',
      validationRules: []
    }
  }

  /**
   * 应用修改到文件内容（占位实现）
   */
  private async applyModifications(
    fileContents: Map<string, string>,
    modificationPlan: any
  ): Promise<Map<string, string>> {
    // TODO: 实际应用修改
    this.logger.debug('应用修改到文件内容（占位实现）')

    // 暂时返回原始内容（不做修改）
    return new Map(fileContents)
  }

  /**
   * 验证代码语法（占位实现）
   */
  private async validateCodeSyntax(modifiedContents: Map<string, string>): Promise<void> {
    // TODO: 实现语法验证（例如使用TypeScript编译器）
    this.logger.debug('验证代码语法（占位实现）')

    // 简单检查：确保文件非空
    for (const [file, content] of modifiedContents) {
      if (content.trim().length === 0) {
        this.logger.warn(`文件内容为空: ${file}`)
      }
    }
  }

  /**
   * 保存修改后的文件
   */
  private async saveModifiedFiles(
    files: string[],
    modifiedContents: Map<string, string>
  ): Promise<void> {
    for (const file of files) {
      const content = modifiedContents.get(file)
      if (content !== undefined) {
        const filePath = path.join(this.context.projectPath, file)
        try {
          await fs.writeFile(filePath, content, 'utf-8')
          this.logger.debug(`保存文件: ${file}`)
        } catch (error) {
          this.logger.error(`保存文件失败 ${file}: ${error}`)
          throw new Error(`无法保存文件 ${file}: ${error}`)
        }
      }
    }
  }

  /**
   * 运行测试
   * 实现测试验证机制：运行项目的测试套件并检查结果
   */
  private async runTests(): Promise<void> {
    this.logger.startTask('运行测试')

    try {
      // 步骤1: 检查项目目录中是否有package.json
      const packageJsonPath = path.join(this.context.projectPath, 'package.json')
      const packageJsonExists = await fs.pathExists(packageJsonPath)

      if (!packageJsonExists) {
        this.logger.warn('项目目录中没有package.json文件，跳过测试运行')
        this.recordProgress({
          action: 'tests_skipped',
          description: '项目缺少package.json，跳过测试运行'
        })
        return
      }

      // 步骤2: 读取package.json获取测试脚本
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'))
      const testScript = packageJson.scripts?.test

      if (!testScript) {
        this.logger.warn('package.json中没有定义测试脚本，跳过测试运行')
        this.recordProgress({
          action: 'tests_skipped',
          description: 'package.json中没有测试脚本，跳过测试运行'
        })
        return
      }

      this.logger.debug(`检测到测试脚本: ${testScript}`)

      // 步骤3: 运行测试命令
      const startTime = Date.now()
      let testResult

      try {
        this.logger.info(`正在运行测试: ${testScript}`)

        // 使用execa运行测试命令，设置超时和当前目录
        testResult = await execa('npm', ['run', 'test'], {
          cwd: this.context.projectPath,
          timeout: 300000, // 5分钟超时
          stdio: 'pipe', // 捕获输出
          reject: false // 不抛出异常，让我们自己处理
        })
      } catch (execError) {
        this.logger.error(`执行测试命令失败: ${execError}`)
        throw new Error(`测试执行失败: ${execError}`)
      }

      const duration = Date.now() - startTime
      this.logger.debug(`测试执行完成，耗时: ${duration}ms`)
      this.logger.debug(`测试退出码: ${testResult.exitCode}`)
      this.logger.debug(`测试输出长度: ${testResult.stdout.length} 字符`)

      // 步骤4: 检查测试结果
      if (testResult.exitCode === 0) {
        // 测试通过
        this.logger.success('✅ 测试通过！')
        this.recordProgress({
          action: 'tests_passed',
          description: `测试通过，耗时: ${duration}ms`,
          details: {
            duration,
            stdoutLength: testResult.stdout.length,
            stderrLength: testResult.stderr.length
          }
        })

        // 更新功能测试状态
        if (this.currentFeature && this.progressTracker) {
          await this.updateFeatureTestStatus(true, duration)
        }
      } else {
        // 测试失败
        this.logger.error('❌ 测试失败！')

        // 记录失败详情
        const errorDetails = {
          exitCode: testResult.exitCode,
          stdoutPreview: testResult.stdout.substring(0, 500),
          stderrPreview: testResult.stderr.substring(0, 500),
          duration
        }

        this.logger.error(`测试失败详情:
          退出码: ${testResult.exitCode}
          标准输出预览: ${errorDetails.stdoutPreview}${testResult.stdout.length > 500 ? '...' : ''}
          错误输出预览: ${errorDetails.stderrPreview}${testResult.stderr.length > 500 ? '...' : ''}`)

        this.recordProgress({
          action: 'tests_failed',
          description: `测试失败，退出码: ${testResult.exitCode}`,
          details: errorDetails
        })

        // 更新功能测试状态
        if (this.currentFeature && this.progressTracker) {
          await this.updateFeatureTestStatus(false, duration)
        }

        // 根据配置决定是否抛出错误
        const shouldFailOnTestFailure = this.options.failOnTestFailure !== false // 默认true
        if (shouldFailOnTestFailure) {
          throw new Error(`测试失败，退出码: ${testResult.exitCode}`)
        } else {
          this.logger.warn('测试失败，但配置为不中断流程，继续执行')
        }
      }

      this.logger.completeTask('测试运行完成')
    } catch (error) {
      this.logger.error(`测试运行过程出错: ${error}`)
      this.recordProgress({
        action: 'tests_error',
        description: `测试运行过程出错: ${error}`,
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      })
      throw error // 重新抛出，让上层处理
    }
  }

  /**
   * 更新功能测试状态
   */
  private async updateFeatureTestStatus(passed: boolean, duration: number): Promise<void> {
    if (!this.currentFeature || !this.progressTracker) {
      return
    }

    try {
      // 更新功能的测试状态
      await this.progressTracker.updateFeature(this.currentFeature.id, {
        passes: passed,
        // 添加测试结果记录
        testResults: [
          {
            id: `test_${Date.now()}`,
            description: '自动化测试运行',
            passed,
            executionTime: duration,
            error: passed ? undefined : '测试运行失败'
          }
        ]
      })

      this.logger.debug(`功能 ${this.currentFeature.id} 测试状态更新为: ${passed ? '通过' : '失败'}`)
    } catch (error) {
      this.logger.warn(`更新功能测试状态失败: ${error}`)
    }
  }

  /**
   * 更新进度状态
   * 实现状态更新逻辑：更新功能状态、记录修改详情、更新进度百分比
   */
  private async updateProgress(): Promise<void> {
    if (!this.currentFeature || !this.progressTracker) {
      return
    }

    this.logger.startTask('更新进度状态')

    try {
      // 步骤1: 确定功能的新状态
      // 如果功能当前是pending，则标记为in_progress（表示我们正在处理它）
      // 如果测试已通过，则标记为completed
      let newStatus: 'pending' | 'in_progress' | 'completed' | 'blocked' = this.currentFeature.status

      // 检查测试是否通过（通过updateFeatureTestStatus设置的passes字段）
      const featureAfterTest = this.progressTracker.getFeature(this.currentFeature.id)
      const testPassed = featureAfterTest?.passes === true

      if (testPassed && this.currentFeature.status !== 'completed') {
        newStatus = 'completed'
        this.logger.debug(`功能测试通过，状态更新为: completed`)
      } else if (this.currentFeature.status === 'pending') {
        newStatus = 'in_progress'
        this.logger.debug(`功能开始处理，状态更新为: in_progress`)
      }

      // 步骤2: 准备更新数据
      const updateData: Partial<Feature> = {
        status: newStatus,
        updatedAt: new Date()
      }

      // 如果状态变为completed，记录完成时间
      if (newStatus === 'completed' && this.currentFeature.status !== 'completed') {
        // 可以添加completedAt字段，但Feature接口中没有，所以使用notes或扩展
        updateData.notes = (this.currentFeature.notes || '') + `\n完成于: ${new Date().toISOString()}`
      }

      // 步骤3: 更新功能状态
      await this.progressTracker.updateFeature(this.currentFeature.id, updateData)

      // 步骤4: 记录修改详情（如果执行了代码修改）
      // 这可以通过检查是否有代码修改记录来实现
      // 暂时记录一个简单的事件
      this.recordProgress({
        action: 'feature_status_updated',
        description: `功能状态更新为: ${newStatus}`,
        details: {
          featureId: this.currentFeature.id,
          previousStatus: this.currentFeature.status,
          newStatus,
          testPassed
        }
      })

      // 步骤5: 更新进度百分比
      await this.updateProgressPercentage()

      this.logger.success(`进度状态更新完成: ${this.currentFeature.id} -> ${newStatus}`)
    } catch (error) {
      this.logger.error(`更新进度状态失败: ${error}`)
      this.recordProgress({
        action: 'progress_update_error',
        description: `更新进度状态失败: ${error}`,
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      })
      throw error
    }

    this.logger.completeTask('进度状态更新完成')
  }

  /**
   * 更新进度百分比
   * 计算已完成功能的比例，更新进度跟踪器
   */
  private async updateProgressPercentage(): Promise<void> {
    if (!this.progressTracker) {
      return
    }

    try {
      // 获取所有功能
      const allFeatures = this.progressTracker.getFeatureList()

      if (allFeatures.length === 0) {
        this.logger.debug('没有功能，跳过进度百分比更新')
        return
      }

      // 计算已完成功能的数量
      const completedFeatures = allFeatures.filter(f => f.status === 'completed')
      const completionPercentage = Math.round((completedFeatures.length / allFeatures.length) * 100)

      this.logger.debug(`进度百分比: ${completedFeatures.length}/${allFeatures.length} = ${completionPercentage}%`)

      // 更新进度跟踪器中的总体进度
      // 假设ProgressTracker有setOverallProgress方法
      // 如果没有，我们可以通过其他方式记录
      // 暂时记录到日志和进度事件中
      this.recordProgress({
        action: 'progress_updated',
        description: `总体进度更新: ${completionPercentage}%`,
        details: {
          completed: completedFeatures.length,
          total: allFeatures.length,
          percentage: completionPercentage
        }
      })

      // 如果有设置总体进度的方法，调用它
      // await this.progressTracker.setOverallProgress(completionPercentage)
    } catch (error) {
      this.logger.warn(`更新进度百分比失败: ${error}`)
      // 不抛出错误，因为这不是关键操作
    }
  }

  /**
   * 将功能标记为进行中
   * 在开始处理功能时调用
   */
  private async markFeatureAsInProgress(): Promise<void> {
    if (!this.currentFeature || !this.progressTracker) {
      return
    }

    // 只有当功能当前是pending时才更新
    if (this.currentFeature.status === 'pending') {
      try {
        await this.progressTracker.updateFeature(this.currentFeature.id, {
          status: 'in_progress',
          updatedAt: new Date()
        })

        this.logger.debug(`功能标记为进行中: ${this.currentFeature.id}`)
        this.recordProgress({
          action: 'feature_started',
          description: `开始处理功能: ${this.currentFeature.description}`,
          details: {
            featureId: this.currentFeature.id,
            previousStatus: 'pending',
            newStatus: 'in_progress'
          }
        })

        // 刷新当前功能对象以获取更新后的状态
        const updatedFeature = this.progressTracker.getFeature(this.currentFeature.id)
        if (updatedFeature) {
          this.currentFeature = updatedFeature
        }
      } catch (error) {
        this.logger.warn(`标记功能为进行中失败: ${error}`)
        // 不抛出错误，因为这不是关键操作
      }
    }
  }

  /**
   * 创建提交
   * TODO: 实现提交创建逻辑
   */
  private async createCommit(): Promise<void> {
    if (!this.currentFeature || !this.gitManager) {
      return
    }

    this.logger.startTask('创建提交')

    // TODO: 生成提交消息
    // TODO: 执行Git提交
    // TODO: 处理提交失败

    this.logger.completeTask('提交创建完成')
  }

  /**
   * 清理资源
   */
  protected async onCleanup(): Promise<void> {
    this.logger.debug('清理编码智能体资源')

    this.currentFeature = null

    this.logger.debug('编码智能体资源清理完成')
  }
}

/**
 * 编码智能体工厂
 */
export class CoderAgentFactory {
  static readonly type = 'coder'
  static readonly description = '编码智能体，负责增量功能实现和代码修改'

  static create(context: AgentContext, config?: Partial<AgentConfig>): CoderAgent {
    // 从上下文中提取编码选项
    const options: CoderOptions = {
      autoSelect: true,
      runTests: true,
      autoCommit: true,
      ...(context.userData?.coderOptions || {})
    }

    return new CoderAgent(context, options, config)
  }
}

// 默认导出
export default {
  CoderAgent,
  CoderAgentFactory
}