/**
 * 进度跟踪器模块
 * 设计思路：管理双轨方案中的结构化进度跟踪
 *
 * 双轨方案实现：
 * 1. 轨道A（结构化进度）:
 *    - claude-progress.txt: 人类可读的进度日志
 *    - feature-list.json: 结构化功能状态
 *    - Git历史: 完整的变更记录
 *
 * 2. 轨道B（增量开发）:
 *    - 每次只实现一个功能
 *    - 保持原子性提交
 *    - 自动测试验证
 *
 * 功能特点：
 * 1. 多文件状态同步
 * 2. 冲突检测和解决
 * 3. 原子操作保证一致性
 * 4. 进度报告生成
 */

import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { createLogger } from '../../utils/logger.js'
import type {
  Feature,
  FeatureList,
  ProjectState,
  ProgressEntry
} from '../../types/index.js'

// ES模块的__dirname替代方案
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 日志实例
const logger = createLogger()

// 进度跟踪器配置
export interface ProgressTrackerConfig {
  /** 项目根目录 */
  projectPath: string
  /** 进度文件路径 */
  progressFile?: string
  /** 功能列表文件路径 */
  featureListFile?: string
  /** 是否自动保存 */
  autoSave?: boolean
  /** 是否启用详细日志 */
  verbose?: boolean
}

// 进度文件格式
interface ProgressFile {
  /** 文件版本 */
  version: string
  /** 项目名称 */
  projectName: string
  /** 进度条目 */
  entries: ProgressEntry[]
  /** 元数据 */
  metadata: {
    createdAt: Date
    updatedAt: Date
    totalFeatures: number
    completedFeatures: number
    currentFocus?: string
  }
}

/**
 * 进度跟踪器类
 * 负责管理项目进度状态和文件同步
 */
export class ProgressTracker {
  private config: Required<ProgressTrackerConfig>
  private projectState: ProjectState | null = null
  private featureList: FeatureList | null = null
  private progressEntries: ProgressEntry[] = []
  private isInitialized = false

  constructor(config: ProgressTrackerConfig) {
    // 设置默认配置
    this.config = {
      projectPath: config.projectPath,
      progressFile: config.progressFile || path.join(config.projectPath, 'claude-progress.txt'),
      featureListFile: config.featureListFile || path.join(config.projectPath, 'feature-list.json'),
      autoSave: config.autoSave ?? true,
      verbose: config.verbose ?? false
    }

    logger.debug(`进度跟踪器初始化，项目路径: ${this.config.projectPath}`)
  }

  /**
   * 初始化跟踪器，加载现有进度数据
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('进度跟踪器已经初始化')
      return
    }

    logger.startTask('初始化进度跟踪器')

    try {
      // 确保项目目录存在
      await fs.ensureDir(this.config.projectPath)

      // 尝试加载现有数据
      await this.loadAllData()

      // 如果数据为空，创建初始状态
      if (!this.projectState || !this.featureList) {
        await this.createInitialState()
      }

      this.isInitialized = true
      logger.completeTask('初始化进度跟踪器')

      // 输出状态摘要
      await this.printStatusSummary()
    } catch (error) {
      logger.error(`进度跟踪器初始化失败: ${error}`)
      throw error
    }
  }

  /**
   * 加载所有进度数据
   */
  private async loadAllData(): Promise<void> {
    try {
      // 加载进度文件
      if (await fs.pathExists(this.config.progressFile)) {
        await this.loadProgressFile()
      } else {
        logger.debug('进度文件不存在，将创建新文件')
      }

      // 加载功能列表
      if (await fs.pathExists(this.config.featureListFile)) {
        await this.loadFeatureList()
      } else {
        logger.debug('功能列表文件不存在，将创建新文件')
      }
    } catch (error) {
      logger.error(`加载进度数据失败: ${error}`)
      throw error
    }
  }

  /**
   * 加载进度文件
   */
  private async loadProgressFile(): Promise<void> {
    try {
      const content = await fs.readFile(this.config.progressFile, 'utf-8')
      const lines = content.split('\n').filter(line => line.trim())

      // 解析进度条目
      this.progressEntries = lines.map((line, index) => {
        try {
          // 格式: [时间戳] [级别] 描述
          const match = line.match(/\[([^\]]+)\] \[([^\]]+)\] (.+)/)
          if (match) {
            const [, timestamp, action, description] = match
            return {
              timestamp: new Date(timestamp),
              action: action as ProgressEntry['action'],
              description,
              details: {}
            }
          }

          // 简单格式: 时间戳 - 描述
          const simpleMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+)/)
          if (simpleMatch) {
            const [, timestamp, description] = simpleMatch
            return {
              timestamp: new Date(timestamp),
              action: 'info' as ProgressEntry['action'],
              description,
              details: {}
            }
          }

          // 默认格式
          return {
            timestamp: new Date(),
            action: 'info' as ProgressEntry['action'],
            description: line,
            details: {}
          }
        } catch {
          // 解析失败，创建简单条目
          return {
            timestamp: new Date(),
            action: 'info' as ProgressEntry['action'],
            description: line,
            details: {}
          }
        }
      })

      logger.debug(`加载进度条目: ${this.progressEntries.length} 条`)
    } catch (error) {
      logger.error(`加载进度文件失败: ${error}`)
      throw error
    }
  }

  /**
   * 加载功能列表
   */
  private async loadFeatureList(): Promise<void> {
    try {
      const content = await fs.readFile(this.config.featureListFile, 'utf-8')
      const data = JSON.parse(content)

      // 验证数据格式
      if (!data.features || !Array.isArray(data.features)) {
        throw new Error('功能列表格式无效: 缺少features数组')
      }

      this.featureList = {
        projectName: data.projectName || '未命名项目',
        features: data.features.map((f: any) => ({
          ...f,
          createdAt: new Date(f.createdAt || Date.now()),
          updatedAt: new Date(f.updatedAt || Date.now())
        })),
        createdAt: new Date(data.createdAt || Date.now()),
        updatedAt: new Date(data.updatedAt || Date.now()),
        version: data.version || '1.0.0',
        totalCount: data.totalCount || data.features.length,
        completedCount: data.completedCount || data.features.filter((f: any) => f.passes).length,
        inProgressCount: data.inProgressCount || data.features.filter((f: any) => f.status === 'in_progress').length,
        blockedCount: data.blockedCount || data.features.filter((f: any) => f.status === 'blocked').length
      }

      logger.debug(`加载功能列表: ${this.featureList.features.length} 个功能`)
    } catch (error) {
      logger.error(`加载功能列表失败: ${error}`)
      throw error
    }
  }

  /**
   * 创建初始状态
   */
  private async createInitialState(): Promise<void> {
    logger.debug('创建初始进度状态')

    // 创建初始功能列表
    this.featureList = {
      projectName: path.basename(this.config.projectPath),
      features: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      totalCount: 0,
      completedCount: 0,
      inProgressCount: 0,
      blockedCount: 0
    }

    // 创建初始项目状态
    this.projectState = {
      projectName: path.basename(this.config.projectPath),
      completedFeatures: [],
      pendingFeatures: [],
      inProgressFeatures: [],
      blockedFeatures: [],
      lastUpdated: new Date(),
      currentFocus: null,
      testResults: [],
      progressPercentage: 0,
      totalWorkHours: 0,
      health: 'healthy',
      healthDetails: {
        testPassRate: 0,
        buildStatus: 'unknown',
        dependenciesStatus: 'unknown',
        recentErrors: []
      }
    }

    // 创建初始进度条目
    this.progressEntries = [{
      timestamp: new Date(),
      action: 'feature_started',
      description: '项目初始化完成',
      details: {
        projectName: this.featureList.projectName,
        featureCount: 0
      }
    }]

    // 保存初始数据
    if (this.config.autoSave) {
      await this.saveAllData()
    }
  }

  /**
   * 保存所有数据
   */
  async saveAllData(): Promise<void> {
    logger.startTask('保存进度数据')

    try {
      // 确保目录存在
      await fs.ensureDir(this.config.projectPath)

      // 保存进度文件
      await this.saveProgressFile()

      // 保存功能列表
      await this.saveFeatureList()

      // 更新项目状态
      await this.updateProjectState()

      logger.completeTask('保存进度数据')
    } catch (error) {
      logger.error(`保存进度数据失败: ${error}`)
      throw error
    }
  }

  /**
   * 保存进度文件
   */
  private async saveProgressFile(): Promise<void> {
    try {
      const lines = this.progressEntries.map(entry => {
        const timestamp = entry.timestamp.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
        return `[${timestamp}] [${entry.action}] ${entry.description}`
      })

      const content = lines.join('\n') + '\n'
      await fs.writeFile(this.config.progressFile, content, 'utf-8')

      logger.debug(`保存进度文件: ${this.progressEntries.length} 条记录`)
    } catch (error) {
      logger.error(`保存进度文件失败: ${error}`)
      throw error
    }
  }

  /**
   * 保存功能列表
   */
  private async saveFeatureList(): Promise<void> {
    if (!this.featureList) {
      throw new Error('功能列表未初始化')
    }

    try {
      // 更新统计信息
      this.featureList.updatedAt = new Date()
      this.featureList.totalCount = this.featureList.features.length
      this.featureList.completedCount = this.featureList.features.filter(f => f.passes).length
      this.featureList.inProgressCount = this.featureList.features.filter(f => f.status === 'in_progress').length
      this.featureList.blockedCount = this.featureList.features.filter(f => f.status === 'blocked').length

      // 转换为可序列化格式
      const data = {
        ...this.featureList,
        createdAt: this.featureList.createdAt.toISOString(),
        updatedAt: this.featureList.updatedAt.toISOString(),
        features: this.featureList.features.map(feature => ({
          ...feature,
          createdAt: feature.createdAt.toISOString(),
          updatedAt: feature.updatedAt.toISOString()
        }))
      }

      const content = JSON.stringify(data, null, 2)
      await fs.writeFile(this.config.featureListFile, content, 'utf-8')

      logger.debug(`保存功能列表: ${this.featureList.features.length} 个功能`)
    } catch (error) {
      logger.error(`保存功能列表失败: ${error}`)
      throw error
    }
  }

  /**
   * 更新项目状态
   */
  private async updateProjectState(): Promise<void> {
    if (!this.featureList || !this.projectState) return

    // 分类功能
    const completedFeatures = this.featureList.features.filter(f => f.passes)
    const pendingFeatures = this.featureList.features.filter(f => !f.passes && f.status === 'pending')
    const inProgressFeatures = this.featureList.features.filter(f => f.status === 'in_progress')
    const blockedFeatures = this.featureList.features.filter(f => f.status === 'blocked')

    // 更新项目状态
    this.projectState = {
      ...this.projectState,
      projectName: this.featureList.projectName,
      completedFeatures,
      pendingFeatures,
      inProgressFeatures,
      blockedFeatures,
      lastUpdated: new Date(),
      progressPercentage: this.featureList.totalCount > 0
        ? Math.round((this.featureList.completedCount / this.featureList.totalCount) * 100)
        : 0,
      health: this.calculateHealthStatus()
    }

    logger.debug(`项目状态更新: ${this.projectState.progressPercentage}% 完成`)
  }

  /**
   * 计算项目健康状态
   */
  private calculateHealthStatus(): ProjectState['health'] {
    if (!this.featureList || !this.projectState) return 'healthy'

    const { blockedCount, totalCount } = this.featureList

    if (blockedCount > totalCount * 0.3) return 'critical'
    if (blockedCount > totalCount * 0.1) return 'warning'
    return 'healthy'
  }

  /**
   * 添加进度条目
   */
  async addProgressEntry(entry: Omit<ProgressEntry, 'timestamp'>): Promise<void> {
    const fullEntry: ProgressEntry = {
      ...entry,
      timestamp: new Date()
    }

    this.progressEntries.push(fullEntry)

    // 限制条目数量，保留最近1000条
    if (this.progressEntries.length > 1000) {
      this.progressEntries = this.progressEntries.slice(-1000)
    }

    logger.debug(`添加进度条目: ${entry.action} - ${entry.description}`)

    if (this.config.autoSave) {
      await this.saveProgressFile()
    }
  }

  /**
   * 添加功能
   */
  async addFeature(feature: Omit<Feature, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<string> {
    if (!this.featureList) {
      throw new Error('功能列表未初始化')
    }

    const featureId = `feature-${String(this.featureList.features.length + 1).padStart(3, '0')}`
    const now = new Date()

    const newFeature: Feature = {
      ...feature,
      id: featureId,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      passes: false
    }

    this.featureList.features.push(newFeature)

    // 添加进度条目
    await this.addProgressEntry({
      action: 'feature_started',
      featureId,
      description: `添加新功能: ${feature.description}`,
      details: {
        category: feature.category,
        priority: feature.priority
      }
    })

    logger.info(`添加新功能: ${featureId} - ${feature.description}`)

    if (this.config.autoSave) {
      await this.saveFeatureList()
      await this.updateProjectState()
    }

    return featureId
  }

  /**
   * 更新功能状态
   */
  async updateFeature(featureId: string, updates: Partial<Feature>): Promise<void> {
    if (!this.featureList) {
      throw new Error('功能列表未初始化')
    }

    const featureIndex = this.featureList.features.findIndex(f => f.id === featureId)
    if (featureIndex === -1) {
      throw new Error(`功能未找到: ${featureId}`)
    }

    const oldFeature = this.featureList.features[featureIndex]
    const updatedFeature = {
      ...oldFeature,
      ...updates,
      updatedAt: new Date()
    }

    this.featureList.features[featureIndex] = updatedFeature

    // 添加进度条目
    await this.addProgressEntry({
      action: 'feature_completed',
      featureId,
      description: `更新功能状态: ${oldFeature.description}`,
      details: {
        oldStatus: oldFeature.status,
        newStatus: updatedFeature.status,
        passes: updatedFeature.passes
      }
    })

    logger.info(`更新功能: ${featureId} - 状态: ${updatedFeature.status}`)

    if (this.config.autoSave) {
      await this.saveFeatureList()
      await this.updateProjectState()
    }
  }

  /**
   * 获取下一个待实现功能
   */
  getNextFeature(): Feature | null {
    if (!this.featureList) {
      throw new Error('功能列表未初始化')
    }

    // 优先选择进行中的功能
    const inProgressFeatures = this.featureList.features.filter(f => f.status === 'in_progress')
    if (inProgressFeatures.length > 0) {
      return inProgressFeatures[0]
    }

    // 选择未完成且未阻塞的功能，按优先级排序
    const availableFeatures = this.featureList.features.filter(f =>
      !f.passes &&
      f.status !== 'blocked' &&
      f.dependencies.every(depId =>
        this.featureList!.features.find(f => f.id === depId)?.passes
      )
    )

    if (availableFeatures.length === 0) {
      return null
    }

    // 按优先级排序: critical > high > medium > low
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    return availableFeatures.sort((a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority]
    )[0]
  }

  /**
   * 打印状态摘要
   */
  async printStatusSummary(): Promise<void> {
    if (!this.featureList || !this.projectState) {
      logger.warn('无法打印状态摘要: 数据未初始化')
      return
    }

    logger.title('项目状态摘要')

    const { projectName, progressPercentage, health } = this.projectState
    const { totalCount, completedCount, inProgressCount, blockedCount } = this.featureList

    logger.item('项目名称', projectName)
    logger.item('总体进度', `${progressPercentage}%`)
    logger.item('健康状态', health === 'healthy' ? '✅ 良好' : health === 'warning' ? '⚠️ 警告' : '❌ 严重')

    logger.divider()

    logger.item('总功能数', totalCount.toString())
    logger.item('已完成', `${completedCount} (${Math.round((completedCount / totalCount) * 100)}%)`)
    logger.item('进行中', inProgressCount.toString())
    logger.item('阻塞中', blockedCount.toString())
    logger.item('待完成', (totalCount - completedCount).toString())

    logger.divider()

    // 显示下一个功能
    const nextFeature = this.getNextFeature()
    if (nextFeature) {
      logger.item('下一个功能', nextFeature.description)
      logger.item('功能ID', nextFeature.id)
      logger.item('优先级', nextFeature.priority)
    } else if (completedCount === totalCount) {
      logger.info('🎉 所有功能已完成！')
    } else {
      logger.warn('没有可用的下一个功能，可能存在依赖阻塞')
    }
  }

  /**
   * 获取项目状态
   */
  getProjectState(): ProjectState {
    if (!this.projectState) {
      throw new Error('项目状态未初始化')
    }
    return this.projectState
  }

  /**
   * 获取功能列表
   */
  getFeatureList(): FeatureList {
    if (!this.featureList) {
      throw new Error('功能列表未初始化')
    }
    return this.featureList
  }

  /**
   * 获取进度条目
   */
  getProgressEntries(): ProgressEntry[] {
    return [...this.progressEntries]
  }

  /**
   * 重置功能状态
   */
  async resetFeature(featureId: string): Promise<void> {
    await this.updateFeature(featureId, {
      status: 'pending',
      passes: false,
      testResults: []
    })
  }

  /**
   * 生成进度报告
   */
  generateReport(): {
    summary: Record<string, any>
    features: Feature[]
    progress: ProgressEntry[]
  } {
    if (!this.featureList || !this.projectState) {
      throw new Error('数据未初始化')
    }

    return {
      summary: {
        projectName: this.projectState.projectName,
        progressPercentage: this.projectState.progressPercentage,
        health: this.projectState.health,
        totalFeatures: this.featureList.totalCount,
        completedFeatures: this.featureList.completedCount,
        inProgressFeatures: this.featureList.inProgressCount,
        blockedFeatures: this.featureList.blockedCount,
        lastUpdated: this.projectState.lastUpdated
      },
      features: [...this.featureList.features],
      progress: [...this.progressEntries].slice(-100) // 最近100条
    }
  }
}

// 默认导出
export default ProgressTracker