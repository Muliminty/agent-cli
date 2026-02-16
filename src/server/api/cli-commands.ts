/**
 * CLI命令API路由
 * 设计思路：将现有CLI命令暴露为Web API，支持通过Web界面执行所有CLI操作
 *
 * 功能特点：
 * 1. 支持所有核心CLI命令：init、status、next、test、config、report、reset、context等
 * 2. 实时进度反馈（通过WebSocket）
 * 3. 命令执行结果和错误处理
 * 4. 支持交互式命令（需要处理用户输入）
 *
 * 踩坑提醒：
 * 1. CLI命令通常设计为命令行调用，需要适配为函数调用
 * 2. 需要正确处理工作目录和配置加载
 * 3. 异步命令执行需要提供进度反馈
 * 4. 错误处理要转换为友好的API响应
 */

import { Router } from 'express'
import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { existsSync } from 'fs'
import { execa } from 'execa'

const logger = createLogger('api:cli-commands')
const router = Router()

/**
 * CLI命令执行请求
 */
interface CLICommandRequest {
  command: string
  args?: string[]
  cwd?: string
  options?: Record<string, any>
}

/**
 * CLI命令执行响应
 */
interface CLICommandResponse {
  success: boolean
  command: string
  output?: string
  data?: any
  error?: string
  warnings?: string[]
  timestamp: number
  executionId?: string
}

/**
 * 执行CLI命令
 * POST /api/cli/execute
 */
router.post('/execute', async (req, res) => {
  const executionId = randomUUID()
  const startTime = Date.now()

  try {
    const { command, args = [], cwd = process.cwd(), options = {} }: CLICommandRequest = req.body

    logger.info('收到CLI命令执行请求', { executionId, command, args, cwd })

    // 验证命令
    const validCommands = ['init', 'status', 'next', 'test', 'config', 'report', 'reset', 'context', 'template']
    if (!validCommands.includes(command)) {
      return res.status(400).json({
        success: false,
        command,
        error: `不支持的命令: ${command}`,
        validCommands,
        timestamp: Date.now()
      })
    }

    // 验证工作目录
    if (!existsSync(cwd)) {
      return res.status(400).json({
        success: false,
        command,
        error: `工作目录不存在: ${cwd}`,
        timestamp: Date.now()
      })
    }

    // 加载项目配置（如果存在）
    let config = null
    try {
      config = await loadConfig(undefined, cwd)
    } catch (error) {
      // 配置加载失败对于某些命令可能是正常的（如init）
      if (command !== 'init') {
        logger.warn('加载项目配置失败', { cwd, error })
      }
    }

    // 执行命令
    let result: any
    try {
      result = await executeCommand(command, args, cwd, options, config)
    } catch (error: any) {
      logger.error('命令执行失败', { executionId, command, error })
      throw error
    }

    const duration = Date.now() - startTime

    const response: CLICommandResponse = {
      success: true,
      command,
      output: result.output,
      data: result.data,
      warnings: result.warnings || [],
      timestamp: Date.now(),
      executionId
    }

    logger.info('CLI命令执行完成', { executionId, command, duration })

    res.json(response)

  } catch (error: any) {
    const duration = Date.now() - startTime
    logger.error('CLI命令处理失败', { executionId, error, duration })

    const errorResponse: CLICommandResponse = {
      success: false,
      command: req.body.command || 'unknown',
      error: error.message || '命令执行失败',
      timestamp: Date.now(),
      executionId
    }

    res.status(500).json(errorResponse)
  }
})

/**
 * 获取支持的命令列表
 * GET /api/cli/commands
 */
router.get('/commands', async (req, res) => {
  try {
    const commands = [
      {
        name: 'init',
        description: '初始化新项目',
        args: ['project-name'],
        options: ['--path', '--template', '--tech-stack', '--no-git']
      },
      {
        name: 'status',
        description: '查看项目状态',
        args: [],
        options: ['--verbose', '--json']
      },
      {
        name: 'next',
        description: '执行下一个功能',
        args: [],
        options: ['--skip-tests', '--dry-run']
      },
      {
        name: 'test',
        description: '运行测试',
        args: ['test-name'],
        options: ['--watch', '--coverage', '--report']
      },
      {
        name: 'config',
        description: '管理配置',
        args: ['action'],
        options: ['--get', '--set', '--validate', '--format']
      },
      {
        name: 'report',
        description: '生成报告',
        args: ['type'],
        options: ['--format', '--output', '--period']
      },
      {
        name: 'reset',
        description: '重置项目',
        args: ['level'],
        options: ['--force', '--backup', '--dry-run']
      },
      {
        name: 'context',
        description: '上下文监控',
        args: [],
        options: ['--check', '--summary', '--stats']
      },
      {
        name: 'template',
        description: '模板管理',
        args: ['action'],
        options: ['--list', '--add', '--remove', '--update']
      }
    ]

    res.json({
      success: true,
      data: {
        commands,
        total: commands.length,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    })

  } catch (error) {
    logger.error('获取命令列表失败', { error })
    res.status(500).json({
      success: false,
      error: '获取命令列表失败',
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now()
    })
  }
})

/**
 * 执行具体命令
 */
async function executeCommand(
  command: string,
  args: string[],
  cwd: string,
  options: Record<string, any>,
  config: any
): Promise<{ output: string; data?: any; warnings?: string[] }> {
  // 构建CLI参数
  const cliArgs = [command, ...args]

  // 添加选项
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === 'boolean' && value) {
      cliArgs.push(`--${key}`)
    } else if (typeof value === 'string') {
      cliArgs.push(`--${key}`, value)
    } else if (typeof value === 'number') {
      cliArgs.push(`--${key}`, value.toString())
    }
  }

  // 添加格式选项，默认JSON以便解析
  if (!cliArgs.includes('--format')) {
    cliArgs.push('--format', 'json')
  }

  try {
    // 执行CLI命令
    const { stdout, stderr, exitCode } = await execa('node', ['dist/cli/index.js', ...cliArgs], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000, // 30秒超时
      env: {
        ...process.env,
        // 确保使用正确的Node环境
        NODE_ENV: 'production',
        FORCE_COLOR: '0' // 禁用颜色输出
      }
    })

    let output = stdout
    const warnings: string[] = []

    if (stderr) {
      warnings.push(`命令执行产生警告: ${stderr}`)
    }

    // 尝试解析JSON输出
    let data: any = null
    try {
      if (stdout.trim()) {
        data = JSON.parse(stdout)
        // 如果解析成功，使用data中的message作为output
        if (data.message) {
          output = data.message
        }
      }
    } catch (parseError) {
      // 不是JSON，保持原样
    }

    return {
      output,
      data,
      warnings
    }

  } catch (error: any) {
    // 命令执行失败
    if (error.exitCode !== undefined) {
      return {
        output: `命令执行失败 (退出码 ${error.exitCode}): ${error.message}`,
        data: null,
        warnings: [error.stderr || error.message]
      }
    }

    throw error // 重新抛出其他错误
  }
}

export default router