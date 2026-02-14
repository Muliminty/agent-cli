/**
 * Git操作封装模块
 * 设计思路：提供底层Git命令封装，处理错误和重试
 *
 * 功能特点：
 * 1. 原子性Git操作
 * 2. 错误处理和重试机制
 * 3. 进度反馈和状态报告
 * 4. 命令执行结果解析
 */

import simpleGit, { SimpleGit } from 'simple-git'
import { execa } from 'execa'
import { createLogger } from '../../utils/logger.js'

// 日志实例
const logger = createLogger()

// Git操作选项
export interface GitOperationOptions {
  /** 项目路径 */
  cwd: string
  /** 命令超时时间（毫秒） */
  timeout?: number
  /** 最大重试次数 */
  maxRetries?: number
  /** 重试延迟（毫秒） */
  retryDelay?: number
  /** 是否启用详细日志 */
  verbose?: boolean
}

// Git命令执行结果
export interface GitCommandResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  duration: number
  command: string
  args: string[]
}

// Git操作错误
export class GitOperationError extends Error {
  constructor(
    message: string,
    public command: string,
    public args: string[],
    public exitCode: number,
    public stderr: string
  ) {
    super(message)
    this.name = 'GitOperationError'
  }
}

/**
 * Git操作封装类
 */
export class GitOperations {
  private options: Required<GitOperationOptions>
  private git: SimpleGit

  constructor(options: Partial<GitOperationOptions> = {}) {
    this.options = {
      cwd: process.cwd(),
      timeout: 30000,
      maxRetries: 3,
      retryDelay: 1000,
      verbose: false,
      ...options
    }

    this.git = simpleGit({
      baseDir: this.options.cwd,
      binary: 'git',
      maxConcurrentProcesses: 1 // 串行执行以避免冲突
    })
  }

  /**
   * 执行Git命令（使用execa）
   */
  async executeCommand(command: string, args: string[] = []): Promise<GitCommandResult> {
    const startTime = Date.now()
    const fullCommand = `git ${command} ${args.join(' ')}`

    if (this.options.verbose) {
      logger.debug(`执行Git命令: ${fullCommand}`)
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      try {
        const result = await execa('git', [command, ...args], {
          cwd: this.options.cwd,
          timeout: this.options.timeout,
          reject: false // 不自动抛出错误
        })

        const duration = Date.now() - startTime

        const gitResult: GitCommandResult = {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          duration,
          command,
          args
        }

        if (result.exitCode === 0) {
          if (this.options.verbose) {
            logger.debug(`Git命令成功: ${fullCommand} (${duration}ms)`)
          }
          return gitResult
        } else {
          lastError = new GitOperationError(
            `Git命令失败: ${result.stderr || '未知错误'}`,
            command,
            args,
            result.exitCode,
            result.stderr
          )

          if (attempt < this.options.maxRetries) {
            const delay = this.options.retryDelay * (attempt + 1)
            if (this.options.verbose) {
              logger.warn(`命令失败，${delay}ms后重试 (${attempt + 1}/${this.options.maxRetries}): ${fullCommand}`)
            }
            await this.delay(delay)
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        const duration = Date.now() - startTime

        if (attempt < this.options.maxRetries) {
          const delay = this.options.retryDelay * (attempt + 1)
          if (this.options.verbose) {
            logger.warn(`命令异常，${delay}ms后重试 (${attempt + 1}/${this.options.maxRetries}): ${fullCommand}`)
          }
          await this.delay(delay)
        }
      }
    }

    const duration = Date.now() - startTime
    logger.error(`Git命令最终失败: ${fullCommand} (${duration}ms)`)

    throw lastError || new Error(`Git命令执行失败: ${fullCommand}`)
  }

  /**
   * 延迟执行
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 检查Git是否可用
   */
  async checkGitAvailable(): Promise<boolean> {
    try {
      const result = await this.executeCommand('--version')
      return result.success
    } catch {
      return false
    }
  }

  /**
   * 克隆仓库
   */
  async cloneRepository(repoUrl: string, destination?: string, options: {
    branch?: string
    depth?: number
    singleBranch?: boolean
  } = {}): Promise<GitCommandResult> {
    const args = [repoUrl]

    if (destination) {
      args.push(destination)
    }

    if (options.branch) {
      args.push('--branch', options.branch)
    }

    if (options.depth) {
      args.push('--depth', options.depth.toString())
    }

    if (options.singleBranch) {
      args.push('--single-branch')
    }

    return this.executeCommand('clone', args)
  }

  /**
   * 获取仓库状态（详细）
   */
  async getDetailedStatus(): Promise<GitCommandResult> {
    return this.executeCommand('status', ['--porcelain', '-b'])
  }

  /**
   * 添加文件
   */
  async addFiles(paths: string | string[]): Promise<GitCommandResult> {
    const pathArray = Array.isArray(paths) ? paths : [paths]
    return this.executeCommand('add', pathArray)
  }

  /**
   * 提交更改
   */
  async commitChanges(message: string, options: {
    allowEmpty?: boolean
    amend?: boolean
    noVerify?: boolean
  } = {}): Promise<GitCommandResult> {
    const args = ['-m', message]

    if (options.allowEmpty) {
      args.push('--allow-empty')
    }

    if (options.amend) {
      args.push('--amend')
    }

    if (options.noVerify) {
      args.push('--no-verify')
    }

    return this.executeCommand('commit', args)
  }

  /**
   * 推送更改
   */
  async pushChanges(options: {
    remote?: string
    branch?: string
    force?: boolean
    tags?: boolean
    followTags?: boolean
  } = {}): Promise<GitCommandResult> {
    const args = []

    if (options.remote) {
      args.push(options.remote)
      if (options.branch) {
        args.push(options.branch)
      }
    }

    if (options.force) {
      args.push('--force')
    }

    if (options.tags) {
      args.push('--tags')
    }

    if (options.followTags) {
      args.push('--follow-tags')
    }

    return this.executeCommand('push', args)
  }

  /**
   * 拉取更改
   */
  async pullChanges(options: {
    remote?: string
    branch?: string
    rebase?: boolean
    noVerify?: boolean
  } = {}): Promise<GitCommandResult> {
    const args = []

    if (options.remote) {
      args.push(options.remote)
      if (options.branch) {
        args.push(options.branch)
      }
    }

    if (options.rebase) {
      args.push('--rebase')
    }

    if (options.noVerify) {
      args.push('--no-verify')
    }

    return this.executeCommand('pull', args)
  }

  /**
   * 获取差异
   */
  async getDiff(options: {
    staged?: boolean
    unstaged?: boolean
    cached?: boolean
    file?: string
    format?: 'name-only' | 'name-status' | 'raw' | 'diff'
  } = {}): Promise<GitCommandResult> {
    const args = []

    if (options.staged || options.cached) {
      args.push('--cached')
    }

    if (options.format) {
      args.push(`--${options.format}`)
    }

    if (options.file) {
      args.push('--', options.file)
    }

    return this.executeCommand('diff', args)
  }

  /**
   * 查看日志
   */
  async getLog(options: {
    maxCount?: number
    since?: string
    until?: string
    author?: string
    grep?: string
    format?: string
    oneline?: boolean
  } = {}): Promise<GitCommandResult> {
    const args = []

    if (options.maxCount) {
      args.push(`-n ${options.maxCount}`)
    }

    if (options.since) {
      args.push(`--since="${options.since}"`)
    }

    if (options.until) {
      args.push(`--until="${options.until}"`)
    }

    if (options.author) {
      args.push(`--author="${options.author}"`)
    }

    if (options.grep) {
      args.push(`--grep="${options.grep}"`)
    }

    if (options.format) {
      args.push(`--format="${options.format}"`)
    }

    if (options.oneline) {
      args.push('--oneline')
    }

    return this.executeCommand('log', args)
  }

  /**
   * 创建分支
   */
  async createBranch(branchName: string, options: {
    checkout?: boolean
    startPoint?: string
    orphan?: boolean
  } = {}): Promise<GitCommandResult> {
    const args = []

    if (options.checkout) {
      args.push('-b')
    }

    args.push(branchName)

    if (options.startPoint) {
      args.push(options.startPoint)
    }

    if (options.orphan) {
      args.push('--orphan')
    }

    return this.executeCommand('branch', args)
  }

  /**
   * 删除分支
   */
  async deleteBranch(branchName: string, options: {
    force?: boolean
    remote?: boolean
  } = {}): Promise<GitCommandResult> {
    const args = ['-d']

    if (options.force) {
      args[0] = '-D'
    }

    if (options.remote) {
      args.push('-r')
    }

    args.push(branchName)

    return this.executeCommand('branch', args)
  }

  /**
   * 创建标签
   */
  async createTag(tagName: string, options: {
    message?: string
    annotate?: boolean
    force?: boolean
    commit?: string
  } = {}): Promise<GitCommandResult> {
    const args = []

    if (options.annotate && options.message) {
      args.push('-a', tagName, '-m', options.message)
    } else {
      args.push(tagName)
    }

    if (options.force) {
      args.push('-f')
    }

    if (options.commit) {
      args.push(options.commit)
    }

    return this.executeCommand('tag', args)
  }

  /**
   * 重置更改
   */
  async resetChanges(options: {
    mode: 'soft' | 'mixed' | 'hard' | 'merge' | 'keep'
    commit?: string
    paths?: string[]
  }): Promise<GitCommandResult> {
    const args = [`--${options.mode}`]

    if (options.commit) {
      args.push(options.commit)
    }

    if (options.paths && options.paths.length > 0) {
      args.push('--')
      args.push(...options.paths)
    }

    return this.executeCommand('reset', args)
  }

  /**
   * 清理工作区
   */
  async cleanWorkspace(options: {
    force?: boolean
    directories?: boolean
    interactive?: boolean
    exclude?: string[]
  } = {}): Promise<GitCommandResult> {
    const args = []

    if (options.force) {
      args.push('-f')
    }

    if (options.directories) {
      args.push('-d')
    }

    if (options.interactive) {
      args.push('-i')
    }

    if (options.exclude && options.exclude.length > 0) {
      options.exclude.forEach(pattern => {
        args.push('-e', pattern)
      })
    }

    return this.executeCommand('clean', args)
  }

  /**
   * 执行自定义Git命令
   */
  async customCommand(command: string, args: string[] = []): Promise<GitCommandResult> {
    return this.executeCommand(command, args)
  }

  /**
   * 解析状态输出
   */
  parseStatusOutput(output: string): Array<{
    status: string
    path: string
    originalPath?: string
  }> {
    const lines = output.trim().split('\n')
    const result = []

    for (const line of lines) {
      if (!line.trim()) continue

      const status = line.substring(0, 2).trim()
      const path = line.substring(3).trim()

      // 处理重命名/移动的情况
      if (status.includes('R') || status.includes('C')) {
        const parts = path.split('->').map(p => p.trim())
        result.push({
          status,
          path: parts[1] || parts[0],
          originalPath: parts[1] ? parts[0] : undefined
        })
      } else {
        result.push({ status, path })
      }
    }

    return result
  }

  /**
   * 解析日志输出（单行格式）
   */
  parseLogOutput(output: string): Array<{
    hash: string
    message: string
  }> {
    const lines = output.trim().split('\n')
    const result = []

    for (const line of lines) {
      if (!line.trim()) continue

      const parts = line.split(' ', 2)
      if (parts.length >= 2) {
        result.push({
          hash: parts[0],
          message: parts.slice(1).join(' ').trim()
        })
      }
    }

    return result
  }
}

// 默认导出
export default GitOperations