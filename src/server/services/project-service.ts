/**
 * 项目服务
 * 设计思路：封装项目相关的业务逻辑，提供健康状态、文件状态等服务
 */

import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { join } from 'path'
import { existsSync, readFileSync, statSync } from 'fs'
import { ProgressTracker } from '../../core/progress/tracker.js'

const logger = createLogger('service:project')

export interface ProjectHealth {
  status: 'healthy' | 'warning' | 'error'
  checks: Array<{
    name: string
    status: 'pass' | 'warning' | 'fail'
    message: string
    details?: any
  }>
  score: number // 0-100
  timestamp: number
}

export interface FileStatus {
  path: string
  exists: boolean
  size: number
  modified: number | null
  readable: boolean
}

/**
 * 获取项目健康状态
 */
export async function getProjectHealth(cwd: string): Promise<ProjectHealth> {
  const checks: ProjectHealth['checks'] = []
  let score = 100
  const deduction = 20 // 每个失败检查扣分

  try {
    // 加载配置
    const config = await loadConfig(undefined, cwd)

    // 检查1：配置文件
    const configFile = join(cwd, config.paths.configFile)
    if (existsSync(configFile)) {
      try {
        const configContent = readFileSync(configFile, 'utf-8')
        JSON.parse(configContent) // 验证JSON格式
        checks.push({
          name: '配置文件',
          status: 'pass',
          message: '配置文件有效且可访问'
        })
      } catch (error) {
        score -= deduction
        checks.push({
          name: '配置文件',
          status: 'fail',
          message: '配置文件无效或格式错误',
          details: error instanceof Error ? error.message : String(error)
        })
      }
    } else {
      score -= deduction
      checks.push({
        name: '配置文件',
        status: 'fail',
        message: '配置文件不存在'
      })
    }

    // 检查2：进度文件
    const progressFile = join(cwd, config.paths.progressFile)
    if (existsSync(progressFile)) {
      try {
        const progressContent = readFileSync(progressFile, 'utf-8')
        checks.push({
          name: '进度文件',
          status: 'pass',
          message: `进度文件有效，大小: ${progressContent.length} 字符`
        })
      } catch (error) {
        score -= deduction
        checks.push({
          name: '进度文件',
          status: 'fail',
          message: '进度文件无法读取',
          details: error instanceof Error ? error.message : String(error)
        })
      }
    } else {
      checks.push({
        name: '进度文件',
        status: 'warning',
        message: '进度文件不存在（可能是新项目）'
      })
      score -= deduction / 2 // 警告只扣一半分
    }

    // 检查3：功能列表文件
    const featureListFile = join(cwd, config.paths.featureListFile)
    if (existsSync(featureListFile)) {
      try {
        const featureContent = readFileSync(featureListFile, 'utf-8')
        const featureList = JSON.parse(featureContent)

        if (Array.isArray(featureList)) {
          const completed = featureList.filter((f: any) => f.status === 'completed').length
          const inProgress = featureList.filter((f: any) => f.status === 'in_progress').length
          const total = featureList.length

          checks.push({
            name: '功能列表',
            status: 'pass',
            message: `功能列表有效，总计: ${total}，已完成: ${completed}，进行中: ${inProgress}`
          })
        } else {
          score -= deduction
          checks.push({
            name: '功能列表',
            status: 'fail',
            message: '功能列表格式无效（应为数组）'
          })
        }
      } catch (error) {
        score -= deduction
        checks.push({
          name: '功能列表',
          status: 'fail',
          message: '功能列表文件无法读取或解析',
          details: error instanceof Error ? error.message : String(error)
        })
      }
    } else {
      checks.push({
        name: '功能列表',
        status: 'warning',
        message: '功能列表文件不存在（可能是新项目）'
      })
      score -= deduction / 2
    }

    // 检查4：日志目录
    const logsDir = join(cwd, config.paths.logsDir)
    if (existsSync(logsDir)) {
      try {
        const stats = statSync(logsDir)
        if (stats.isDirectory()) {
          checks.push({
            name: '日志目录',
            status: 'pass',
            message: '日志目录可访问'
          })
        } else {
          score -= deduction
          checks.push({
            name: '日志目录',
            status: 'fail',
            message: '日志路径不是目录'
          })
        }
      } catch (error) {
        score -= deduction
        checks.push({
          name: '日志目录',
          status: 'fail',
          message: '日志目录无法访问',
          details: error instanceof Error ? error.message : String(error)
        })
      }
    } else {
      checks.push({
        name: '日志目录',
        status: 'warning',
        message: '日志目录不存在（将自动创建）'
      })
      score -= deduction / 2
    }

    // 检查5：配置有效性
    try {
      // 验证配置
      if (config.project.name && config.project.name.length > 0) {
        checks.push({
          name: '项目配置',
          status: 'pass',
          message: `项目配置有效: ${config.project.name}`
        })
      } else {
        score -= deduction
        checks.push({
          name: '项目配置',
          status: 'warning',
          message: '项目名称未设置'
        })
      }
    } catch (error) {
      score -= deduction
      checks.push({
        name: '项目配置',
        status: 'fail',
        message: '项目配置无效',
        details: error instanceof Error ? error.message : String(error)
      })
    }

    // 确保分数在0-100之间
    score = Math.max(0, Math.min(100, score))

    // 确定整体状态
    const hasFail = checks.some(check => check.status === 'fail')
    const hasWarning = checks.some(check => check.status === 'warning')

    let status: ProjectHealth['status'] = 'healthy'
    if (hasFail) {
      status = 'error'
    } else if (hasWarning) {
      status = 'warning'
    }

    return {
      status,
      checks,
      score,
      timestamp: Date.now()
    }

  } catch (error) {
    logger.error('获取项目健康状态失败', { error })

    return {
      status: 'error',
      checks: [{
        name: '健康检查',
        status: 'fail',
        message: '健康检查过程失败',
        details: error instanceof Error ? error.message : String(error)
      }],
      score: 0,
      timestamp: Date.now()
    }
  }
}

/**
 * 获取文件状态
 */
export function getFileStatus(cwd: string, relativePath: string): FileStatus {
  const fullPath = join(cwd, relativePath)

  try {
    if (existsSync(fullPath)) {
      const stats = statSync(fullPath)
      return {
        path: relativePath,
        exists: true,
        size: stats.size,
        modified: stats.mtime.getTime(),
        readable: true
      }
    } else {
      return {
        path: relativePath,
        exists: false,
        size: 0,
        modified: null,
        readable: false
      }
    }
  } catch (error) {
    logger.error('获取文件状态失败', { path: fullPath, error })
    return {
      path: relativePath,
      exists: false,
      size: 0,
      modified: null,
      readable: false
    }
  }
}

/**
 * 获取项目统计信息
 */
export async function getProjectStats(cwd: string): Promise<{
  files: Record<string, FileStatus>
  features: {
    total: number
    completed: number
    inProgress: number
    pending: number
  }
  progress: {
    percentage: number
    lastUpdate: number | null
  }
}> {
  try {
    const config = await loadConfig(undefined, cwd)

    // 获取文件状态
    const files = {
      config: getFileStatus(cwd, config.paths.configFile),
      progress: getFileStatus(cwd, config.paths.progressFile),
      features: getFileStatus(cwd, config.paths.featureListFile),
      logs: getFileStatus(cwd, config.paths.logsDir)
    }

    // 获取功能统计
    let featureStats = {
      total: 0,
      completed: 0,
      inProgress: 0,
      pending: 0
    }

    const featureListFile = join(cwd, config.paths.featureListFile)
    if (existsSync(featureListFile)) {
      try {
        const content = readFileSync(featureListFile, 'utf-8')
        const featureList = JSON.parse(content)

        if (Array.isArray(featureList)) {
          featureStats = {
            total: featureList.length,
            completed: featureList.filter((f: any) => f.status === 'completed').length,
            inProgress: featureList.filter((f: any) => f.status === 'in_progress').length,
            pending: featureList.filter((f: any) => !f.status || f.status === 'pending').length
          }
        }
      } catch (error) {
        logger.warn('解析功能列表失败', { error })
      }
    }

    // 获取进度信息
    let progressPercentage = 0
    let lastUpdate = null

    const progressFile = join(cwd, config.paths.progressFile)
    if (existsSync(progressFile)) {
      try {
        const stats = statSync(progressFile)
        lastUpdate = stats.mtime.getTime()

        // 简单计算进度：基于完成的功能比例
        if (featureStats.total > 0) {
          progressPercentage = Math.round((featureStats.completed / featureStats.total) * 100)
        }
      } catch (error) {
        logger.warn('获取进度信息失败', { error })
      }
    }

    return {
      files,
      features: featureStats,
      progress: {
        percentage: progressPercentage,
        lastUpdate
      }
    }

  } catch (error) {
    logger.error('获取项目统计信息失败', { error })
    throw error
  }
}

/**
 * 验证项目结构
 */
export async function validateProjectStructure(cwd: string): Promise<{
  valid: boolean
  issues: Array<{
    type: 'error' | 'warning' | 'info'
    message: string
    suggestion?: string
  }>
}> {
  const issues: Array<{
    type: 'error' | 'warning' | 'info'
    message: string
    suggestion?: string
  }> = []

  try {
    const config = await loadConfig(undefined, cwd)

    // 检查必要文件
    const requiredFiles = [
      config.paths.configFile,
      config.paths.progressFile,
      config.paths.featureListFile
    ]

    for (const file of requiredFiles) {
      const status = getFileStatus(cwd, file)
      if (!status.exists) {
        issues.push({
          type: file === config.paths.configFile ? 'error' : 'warning',
          message: `文件不存在: ${file}`,
          suggestion: file === config.paths.configFile
            ? '请运行 agent-cli init 初始化项目'
            : '文件将在使用时自动创建'
        })
      } else if (!status.readable) {
        issues.push({
          type: 'error',
          message: `文件无法读取: ${file}`,
          suggestion: '检查文件权限或文件是否损坏'
        })
      }
    }

    // 检查日志目录
    const logsDir = join(cwd, config.paths.logsDir)
    if (!existsSync(logsDir)) {
      issues.push({
        type: 'info',
        message: '日志目录不存在',
        suggestion: '目录将在首次记录日志时自动创建'
      })
    }

    return {
      valid: issues.every(issue => issue.type !== 'error'),
      issues
    }

  } catch (error) {
    logger.error('验证项目结构失败', { error })

    return {
      valid: false,
      issues: [{
        type: 'error',
        message: '验证过程失败',
        suggestion: '检查项目配置和文件权限'
      }]
    }
  }
}