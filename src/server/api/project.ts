/**
 * 项目API路由
 * 设计思路：提供项目基本信息、状态和配置的API端点
 */

import { Router } from 'express'
import { createLogger } from '../../utils/logger.js'
import type { Config } from '../../types/config.js'
import { ConfigSchema } from '../../types/config.js'
import { loadConfig } from '../../config/loader.js'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { getProjectHealth } from '../services/project-service.js'

const logger = createLogger('api:project')
const router = Router()

/**
 * 获取项目信息
 * GET /api/project
 */
router.get('/', async (req, res) => {
  try {
    const { cwd = process.cwd() } = req.query
    const config = await loadConfig(undefined, cwd as string)

    const projectInfo = {
      name: config.project.name,
      description: config.project.description,
      type: config.project.type,
      techStack: config.project.techStack,
      version: config.project.version,
      author: config.project.author,
      repository: config.project.repository,
      license: config.project.license,
      createdAt: new Date().toISOString(),
      configPath: join(cwd as string, 'agent.config.json')
    }

    res.json({
      success: true,
      data: projectInfo,
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('获取项目信息失败', { error })
    res.status(500).json({
      success: false,
      error: '获取项目信息失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 获取项目状态
 * GET /api/project/status
 */
router.get('/status', async (req, res) => {
  try {
    const { cwd = process.cwd() } = req.query
    const config = await loadConfig(undefined, cwd as string)

    // 检查关键文件是否存在
    const progressFile = join(cwd as string, config.paths.progressFile)
    const featureListFile = join(cwd as string, config.paths.featureListFile)
    const configFile = join(cwd as string, config.paths.configFile)

    const files = {
      progressFile: {
        path: config.paths.progressFile,
        exists: existsSync(progressFile),
        size: existsSync(progressFile) ? readFileSync(progressFile, 'utf-8').length : 0
      },
      featureListFile: {
        path: config.paths.featureListFile,
        exists: existsSync(featureListFile),
        size: existsSync(featureListFile) ? readFileSync(featureListFile, 'utf-8').length : 0
      },
      configFile: {
        path: config.paths.configFile,
        exists: existsSync(configFile),
        size: existsSync(configFile) ? readFileSync(configFile, 'utf-8').length : 0
      }
    }

    // 获取项目健康状态
    const health = await getProjectHealth(cwd as string)

    res.json({
      success: true,
      data: {
        files,
        health,
        config: {
          server: config.server.enabled,
          agent: config.agent.model,
          testing: config.testing.framework,
          git: config.git.autoCommit
        },
        features: {
          progressTracking: config.features.enableProgressTracking,
          autoTesting: config.features.enableAutoTesting,
          gitIntegration: config.features.enableGitIntegration,
          errorRecovery: config.features.enableErrorRecovery
        }
      },
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('获取项目状态失败', { error })
    res.status(500).json({
      success: false,
      error: '获取项目状态失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 获取项目配置
 * GET /api/project/config
 */
router.get('/config', async (req, res) => {
  try {
    const { cwd = process.cwd() } = req.query
    const config = await loadConfig(undefined, cwd as string)

    // 返回安全的配置信息（排除敏感信息）
    const safeConfig = {
      project: config.project,
      agent: {
        model: config.agent.model,
        maxRetries: config.agent.maxRetries,
        temperature: config.agent.temperature
      },
      testing: config.testing,
      git: config.git,
      server: config.server,
      paths: config.paths,
      features: config.features
    }

    res.json({
      success: true,
      data: safeConfig,
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('获取项目配置失败', { error })
    res.status(500).json({
      success: false,
      error: '获取项目配置失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 获取项目健康状态
 * GET /api/project/health
 */
router.get('/health', async (req, res) => {
  try {
    const { cwd = process.cwd() } = req.query
    const health = await getProjectHealth(cwd as string)

    res.json({
      success: true,
      data: health,
      timestamp: Date.now()
    })
  } catch (error) {
    logger.error('获取项目健康状态失败', { error })
    res.status(500).json({
      success: false,
      error: '获取项目健康状态失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 更新项目配置（部分更新）
 * PATCH /api/project/config
 */
router.patch('/config', async (req, res) => {
  try {
    const { cwd = process.cwd(), ...updates } = req.body

    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: '无效的更新数据',
        timestamp: Date.now()
      })
    }

    logger.info('收到配置更新请求', { updates, cwd })

    // 深度合并函数
    const deepMerge = (target: any, source: any): any => {
      const result = { ...target }

      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (target[key] && typeof target[key] === 'object') {
            result[key] = deepMerge(target[key], source[key])
          } else {
            result[key] = source[key]
          }
        } else {
          result[key] = source[key]
        }
      }

      return result
    }

    // 加载当前配置
    const currentConfig = await loadConfig(undefined, cwd as string)
    const configPath = join(cwd as string, 'agent.config.json')

    // 创建备份
    const backupPath = `${configPath}.backup.${Date.now()}`
    writeFileSync(backupPath, JSON.stringify(currentConfig, null, 2), 'utf-8')
    logger.info('配置文件备份已创建', { backupPath })

    // 应用更新
    const updatedConfig = deepMerge(currentConfig, updates)

    // 验证配置
    try {
      const validatedConfig = ConfigSchema.parse(updatedConfig)

      // 写入更新后的配置
      writeFileSync(configPath, JSON.stringify(validatedConfig, null, 2), 'utf-8')
      logger.info('配置文件已更新', { configPath })

      // 返回成功响应
      res.json({
        success: true,
        data: {
          message: '配置更新成功',
          config: validatedConfig,
          backup: backupPath,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      })

    } catch (validationError) {
      // 配置验证失败
      logger.error('配置验证失败', { error: validationError })

      // 恢复备份（删除可能已写入的部分）
      if (existsSync(configPath + '.tmp')) {
        // 如果有临时文件，清理
      }

      return res.status(400).json({
        success: false,
        error: '配置验证失败',
        message: validationError instanceof Error ? validationError.message : String(validationError),
        timestamp: Date.now()
      })
    }

  } catch (error) {
    logger.error('更新项目配置失败', { error })
    res.status(500).json({
      success: false,
      error: '更新项目配置失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

export default router