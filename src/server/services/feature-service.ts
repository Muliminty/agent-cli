/**
 * 功能服务
 * 设计思路：管理功能列表的读取、更新和统计
 */

import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import type { Feature, FeatureList, FeatureCategory, FeaturePriority, FeatureComplexity } from '../../types/feature.js'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { randomUUID } from 'crypto'

const logger = createLogger('service:feature')

/**
 * 加载功能列表
 */
export async function loadFeatureList(cwd: string): Promise<FeatureList | null> {
  try {
    const config = await loadConfig(undefined, cwd)
    const featureListFile = join(cwd, config.paths.featureListFile)

    if (!existsSync(featureListFile)) {
      logger.debug('功能列表文件不存在', { path: featureListFile })
      return null
    }

    const content = readFileSync(featureListFile, 'utf-8')
    const data = JSON.parse(content)

    // 验证和转换数据
    const featureList: FeatureList = {
      projectName: data.projectName || '未命名项目',
      features: Array.isArray(data.features) ? data.features.map(validateFeature) : [],
      createdAt: new Date(data.createdAt || Date.now()),
      updatedAt: new Date(data.updatedAt || Date.now()),
      version: data.version || '1.0.0',
      totalCount: data.totalCount || (Array.isArray(data.features) ? data.features.length : 0),
      completedCount: data.completedCount || 0,
      inProgressCount: data.inProgressCount || 0,
      blockedCount: data.blockedCount || 0
    }

    // 重新计算统计信息
    updateFeatureListStats(featureList)

    logger.debug('功能列表加载成功', {
      total: featureList.totalCount,
      completed: featureList.completedCount,
      inProgress: featureList.inProgressCount
    })

    return featureList

  } catch (error) {
    logger.error('加载功能列表失败', { error })
    throw error
  }
}

/**
 * 保存功能列表
 */
export async function saveFeatureList(cwd: string, featureList: FeatureList): Promise<void> {
  try {
    const config = await loadConfig(undefined, cwd)
    const featureListFile = join(cwd, config.paths.featureListFile)

    // 更新统计信息
    updateFeatureListStats(featureList)

    // 更新时间戳
    featureList.updatedAt = new Date()

    // 保存到文件
    const content = JSON.stringify(featureList, null, 2)
    writeFileSync(featureListFile, content, 'utf-8')

    logger.debug('功能列表保存成功', {
      total: featureList.totalCount,
      completed: featureList.completedCount,
      inProgress: featureList.inProgressCount
    })

  } catch (error) {
    logger.error('保存功能列表失败', { error })
    throw error
  }
}

/**
 * 验证和规范化功能对象
 */
function validateFeature(data: any): Feature {
  return {
    id: data.id || randomUUID(),
    category: validateCategory(data.category),
    priority: validatePriority(data.priority),
    description: data.description || '未描述的功能',
    steps: Array.isArray(data.steps) ? data.steps : [],
    passes: Boolean(data.passes),
    dependencies: Array.isArray(data.dependencies) ? data.dependencies : [],
    estimatedComplexity: validateComplexity(data.estimatedComplexity),
    notes: data.notes || '',
    createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    status: validateStatus(data.status),
    relatedFiles: Array.isArray(data.relatedFiles) ? data.relatedFiles : undefined,
    testResults: Array.isArray(data.testResults) ? data.testResults : undefined
  }
}

/**
 * 验证分类
 */
function validateCategory(category: any): FeatureCategory {
  const validCategories: FeatureCategory[] = [
    'functional', 'ui', 'performance', 'security',
    'accessibility', 'testing', 'documentation', 'infrastructure'
  ]
  return validCategories.includes(category) ? category : 'functional'
}

/**
 * 验证优先级
 */
function validatePriority(priority: any): FeaturePriority {
  const validPriorities: FeaturePriority[] = ['critical', 'high', 'medium', 'low']
  return validPriorities.includes(priority) ? priority : 'medium'
}

/**
 * 验证复杂度
 */
function validateComplexity(complexity: any): FeatureComplexity {
  const validComplexities: FeatureComplexity[] = ['simple', 'medium', 'complex']
  return validComplexities.includes(complexity) ? complexity : 'medium'
}

/**
 * 验证状态
 */
function validateStatus(status: any): Feature['status'] {
  const validStatuses: Feature['status'][] = ['pending', 'in_progress', 'completed', 'blocked']
  return validStatuses.includes(status) ? status : 'pending'
}

/**
 * 更新功能列表统计信息
 */
function updateFeatureListStats(featureList: FeatureList): void {
  const features = featureList.features

  featureList.totalCount = features.length
  featureList.completedCount = features.filter(f => f.status === 'completed').length
  featureList.inProgressCount = features.filter(f => f.status === 'in_progress').length
  featureList.blockedCount = features.filter(f => f.status === 'blocked').length
}

/**
 * 获取功能统计信息
 */
export function getFeatureStats(featureList: FeatureList): {
  byCategory: Record<FeatureCategory, number>
  byPriority: Record<FeaturePriority, number>
  byStatus: Record<Feature['status'], number>
  byComplexity: Record<FeatureComplexity, number>
  completionRate: number
  avgComplexity: number
} {
  const features = featureList.features

  // 按分类统计
  const byCategory: Record<FeatureCategory, number> = {
    functional: 0, ui: 0, performance: 0, security: 0,
    accessibility: 0, testing: 0, documentation: 0, infrastructure: 0
  }

  // 按优先级统计
  const byPriority: Record<FeaturePriority, number> = {
    critical: 0, high: 0, medium: 0, low: 0
  }

  // 按状态统计
  const byStatus: Record<Feature['status'], number> = {
    pending: 0, in_progress: 0, completed: 0, blocked: 0
  }

  // 按复杂度统计
  const byComplexity: Record<FeatureComplexity, number> = {
    simple: 0, medium: 0, complex: 0
  }

  // 复杂度权重
  const complexityWeights = {
    simple: 1,
    medium: 2,
    complex: 3
  }

  let totalComplexity = 0

  // 统计所有功能
  for (const feature of features) {
    byCategory[feature.category] = (byCategory[feature.category] || 0) + 1
    byPriority[feature.priority] = (byPriority[feature.priority] || 0) + 1
    byStatus[feature.status] = (byStatus[feature.status] || 0) + 1
    byComplexity[feature.estimatedComplexity] = (byComplexity[feature.estimatedComplexity] || 0) + 1

    totalComplexity += complexityWeights[feature.estimatedComplexity]
  }

  // 计算完成率
  const completionRate = featureList.totalCount > 0
    ? Math.round((featureList.completedCount / featureList.totalCount) * 100)
    : 0

  // 计算平均复杂度
  const avgComplexity = features.length > 0
    ? totalComplexity / features.length
    : 0

  return {
    byCategory,
    byPriority,
    byStatus,
    byComplexity,
    completionRate,
    avgComplexity
  }
}

/**
 * 获取下一个推荐功能
 */
export function getNextRecommendedFeature(featureList: FeatureList): Feature | null {
  const features = featureList.features

  // 过滤出未完成且未阻塞的功能
  const availableFeatures = features.filter(f =>
    f.status !== 'completed' &&
    f.status !== 'blocked'
  )

  if (availableFeatures.length === 0) {
    return null
  }

  // 优先级权重
  const priorityWeights = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  }

  // 复杂度权重（反向，优先选择简单的）
  const complexityWeights = {
    simple: 3,
    medium: 2,
    complex: 1
  }

  // 计算每个功能的得分
  const scoredFeatures = availableFeatures.map(feature => {
    let score = 0

    // 优先级越高得分越高
    score += priorityWeights[feature.priority] * 10

    // 复杂度越低得分越高
    score += complexityWeights[feature.estimatedComplexity] * 5

    // 依赖越少得分越高
    score += (10 - Math.min(feature.dependencies.length, 10)) * 2

    // 已经开始的优先
    if (feature.status === 'in_progress') {
      score += 20
    }

    return { feature, score }
  })

  // 按得分排序
  scoredFeatures.sort((a, b) => b.score - a.score)

  return scoredFeatures[0]?.feature || null
}

/**
 * 更新功能状态
 */
export function updateFeatureStatus(
  featureList: FeatureList,
  featureId: string,
  status: Feature['status'],
  notes?: string
): Feature | null {
  const feature = featureList.features.find(f => f.id === featureId)

  if (!feature) {
    return null
  }

  // 更新状态
  const oldStatus = feature.status
  feature.status = status
  feature.updatedAt = new Date()

  // 更新备注
  if (notes) {
    feature.notes = notes
  }

  // 记录状态变更
  logger.info('功能状态更新', {
    featureId,
    oldStatus,
    newStatus: status,
    description: feature.description
  })

  // 更新统计信息
  updateFeatureListStats(featureList)

  return feature
}

/**
 * 添加测试结果
 */
export function addTestResult(
  feature: Feature,
  testResult: {
    description: string
    passed: boolean
    executionTime: number
    error?: string
    screenshotPath?: string
  }
): Feature {
  if (!feature.testResults) {
    feature.testResults = []
  }

  const newTestResult = {
    id: randomUUID(),
    description: testResult.description,
    passed: testResult.passed,
    executionTime: testResult.executionTime,
    error: testResult.error,
    screenshotPath: testResult.screenshotPath,
    timestamp: new Date()
  }

  feature.testResults.push(newTestResult)

  // 更新通过状态
  if (testResult.passed) {
    feature.passes = true
  }

  feature.updatedAt = new Date()

  return feature
}

/**
 * 过滤功能列表
 */
export function filterFeatures(
  features: Feature[],
  filters: {
    category?: FeatureCategory
    priority?: FeaturePriority
    status?: Feature['status']
    complexity?: FeatureComplexity
    search?: string
  }
): Feature[] {
  return features.filter(feature => {
    // 按分类过滤
    if (filters.category && feature.category !== filters.category) {
      return false
    }

    // 按优先级过滤
    if (filters.priority && feature.priority !== filters.priority) {
      return false
    }

    // 按状态过滤
    if (filters.status && feature.status !== filters.status) {
      return false
    }

    // 按复杂度过滤
    if (filters.complexity && feature.estimatedComplexity !== filters.complexity) {
      return false
    }

    // 按搜索词过滤
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const inDescription = feature.description.toLowerCase().includes(searchLower)
      const inNotes = feature.notes.toLowerCase().includes(searchLower)
      const inId = feature.id.toLowerCase().includes(searchLower)

      if (!inDescription && !inNotes && !inId) {
        return false
      }
    }

    return true
  })
}

/**
 * 获取功能依赖图
 */
export function getFeatureDependencyGraph(featureList: FeatureList): {
  nodes: Array<{ id: string; label: string; status: Feature['status'] }>
  edges: Array<{ source: string; target: string; type: 'dependency' }>
} {
  const nodes = featureList.features.map(feature => ({
    id: feature.id,
    label: feature.description.substring(0, 30) + (feature.description.length > 30 ? '...' : ''),
    status: feature.status
  }))

  const edges: Array<{ source: string; target: string; type: 'dependency' }> = []

  for (const feature of featureList.features) {
    for (const dependencyId of feature.dependencies) {
      // 检查依赖是否存在
      const dependencyExists = featureList.features.some(f => f.id === dependencyId)
      if (dependencyExists) {
        edges.push({
          source: dependencyId,
          target: feature.id,
          type: 'dependency'
        })
      }
    }
  }

  return { nodes, edges }
}