/**
 * Git管理器模块
 * 设计思路：封装Git操作，提供自动化版本控制功能
 *
 * 核心功能：
 * 1. 仓库初始化和配置
 * 2. 自动化提交（基于功能状态）
 * 3. 提交消息模板化
 * 4. 分支管理和状态检查
 * 5. 错误处理和重试机制
 */

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git'
import fs from 'fs-extra'
import path from 'path'
import { createLogger } from '../../utils/logger.js'
import type { Feature } from '../../types/feature.js'
import type { Config } from '../../config/schema.js'

// 日志实例
const logger = createLogger()

// Git管理器配置
export interface GitManagerConfig {
  /** 项目路径 */
  projectPath: string
  /** 是否自动提交 */
  autoCommit: boolean
  /** Git分支 */
  branch: string
  /** 提交消息模板 */
  commitTemplate: string
  /** 仅当测试通过时提交 */
  commitOnTestPass: boolean
  /** 是否标记发布版本 */
  tagReleases: boolean
  /** Git用户名（可选） */
  user?: {
    name: string
    email: string
  }
}

// 提交选项
export interface CommitOptions {
  /** 功能描述 */
  description: string
  /** 功能详情 */
  details?: string
  /** 功能分类 */
  category?: string
  /** 测试状态 */
  testStatus?: 'passed' | 'failed' | 'skipped'
  /** 相关文件列表 */
  files?: string[]
  /** 功能ID */
  featureId?: string
  /** 是否强制提交（即使测试失败） */
  force?: boolean
}

// Git操作结果
export interface GitResult {
  success: boolean
  message: string
  data?: any
  error?: string
}

// Git状态信息
export interface GitStatus {
  /** 当前分支 */
  branch: string
  /** 是否有未提交的更改 */
  hasChanges: boolean
  /** 未暂存的更改数量 */
  unstagedChanges: number
  /** 未跟踪的文件数量 */
  untrackedFiles: number
  /** 是否在合并状态 */
  merging: boolean
  /** 最后提交信息 */
  lastCommit?: {
    hash: string
    message: string
    author: string
    date: string
  }
  /** 远程状态 */
  remote?: {
    upstream: string | null
    ahead: number
    behind: number
  }
}

/**
 * Git管理器类
 */
export class GitManager {
  private config: GitManagerConfig
  private git: SimpleGit
  private initialized = false

  constructor(config: Partial<GitManagerConfig> = {}) {
    // 合并默认配置
    this.config = {
      projectPath: process.cwd(),
      autoCommit: true,
      branch: 'main',
      commitTemplate: 'feat: {description}\n\n- 实现功能: {details}\n- 分类: {category}\n- 测试状态: {testStatus}\n- 相关文件: {files}',
      commitOnTestPass: true,
      tagReleases: false,
      ...config
    }

    // 初始化simple-git
    const options: Partial<SimpleGitOptions> = {
      baseDir: this.config.projectPath,
      binary: 'git',
      maxConcurrentProcesses: 6,
      trimmed: false
    }

    this.git = simpleGit(options)
    logger.debug(`Git管理器初始化，项目路径: ${this.config.projectPath}`)
  }

  /**
   * 初始化Git管理器，检查或创建Git仓库
   */
  async initialize(): Promise<GitResult> {
    try {
      logger.startTask('初始化Git管理器')

      // 检查是否在Git仓库中
      const isRepo = await this.isGitRepository()

      if (!isRepo) {
        logger.info('未找到Git仓库，将初始化新仓库')
        await this.initRepository()
      } else {
        logger.info('已存在Git仓库')

        // 检查当前分支
        const currentBranch = await this.getCurrentBranch()
        if (currentBranch !== this.config.branch) {
          logger.info(`当前分支为 ${currentBranch}，目标分支为 ${this.config.branch}`)
          await this.switchBranch(this.config.branch, true)
        }
      }

      // 配置用户信息（如果提供）
      if (this.config.user) {
        await this.setUserInfo(this.config.user.name, this.config.user.email)
      }

      this.initialized = true
      logger.completeTask('初始化Git管理器')

      return {
        success: true,
        message: 'Git管理器初始化成功'
      }
    } catch (error) {
      const errorMsg = `Git管理器初始化失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 检查是否为Git仓库
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.git.status()
      return true
    } catch {
      return false
    }
  }

  /**
   * 初始化Git仓库
   */
  async initRepository(): Promise<GitResult> {
    try {
      logger.startTask('初始化Git仓库')

      // 初始化仓库
      await this.git.init()

      // 创建初始提交
      const readmePath = path.join(this.config.projectPath, 'README.md')
      if (await fs.pathExists(readmePath)) {
        await this.git.add('.')
        await this.commitWithTemplate({
          description: '项目初始化',
          details: '创建项目基础结构和文档',
          category: 'infrastructure',
          testStatus: 'skipped'
        })
      }

      logger.completeTask('初始化Git仓库')

      return {
        success: true,
        message: 'Git仓库初始化成功'
      }
    } catch (error) {
      const errorMsg = `Git仓库初始化失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 获取当前分支
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const branchSummary = await this.git.branch()
      return branchSummary.current
    } catch (error) {
      logger.error(`获取当前分支失败: ${error}`)
      return 'unknown'
    }
  }

  /**
   * 切换分支
   */
  async switchBranch(branchName: string, createIfMissing = false): Promise<GitResult> {
    try {
      logger.startTask(`切换分支到 ${branchName}`)

      const branchSummary = await this.git.branch()
      const branches = branchSummary.all

      if (branches.includes(branchName)) {
        // 分支已存在，切换过去
        await this.git.checkout(branchName)
      } else if (createIfMissing) {
        // 创建新分支
        await this.git.checkoutLocalBranch(branchName)
      } else {
        throw new Error(`分支 ${branchName} 不存在`)
      }

      logger.completeTask(`切换分支到 ${branchName}`)

      return {
        success: true,
        message: `成功切换到分支 ${branchName}`
      }
    } catch (error) {
      const errorMsg = `切换分支失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 设置用户信息
   */
  async setUserInfo(name: string, email: string): Promise<GitResult> {
    try {
      await this.git.addConfig('user.name', name)
      await this.git.addConfig('user.email', email)

      logger.debug(`设置Git用户信息: ${name} <${email}>`)

      return {
        success: true,
        message: 'Git用户信息设置成功'
      }
    } catch (error) {
      const errorMsg = `设置Git用户信息失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 获取Git状态
   */
  async getStatus(): Promise<GitStatus> {
    try {
      const status = await this.git.status()
      const logResult = await this.git.log({ maxCount: 1 })

      const lastCommit = logResult.latest ? {
        hash: logResult.latest.hash,
        message: logResult.latest.message,
        author: logResult.latest.author_name,
        date: logResult.latest.date
      } : undefined

      return {
        branch: status.current || 'unknown',
        hasChanges: status.files.length > 0,
        unstagedChanges: status.files.filter(f => !f.index).length,
        untrackedFiles: status.not_added.length + status.untracked.length,
        merging: status.conflicted.length > 0,
        lastCommit,
        remote: status.tracking ? {
          upstream: status.tracking,
          ahead: status.ahead,
          behind: status.behind
        } : undefined
      }
    } catch (error) {
      logger.error(`获取Git状态失败: ${error}`)
      return {
        branch: 'unknown',
        hasChanges: false,
        unstagedChanges: 0,
        untrackedFiles: 0,
        merging: false
      }
    }
  }

  /**
   * 格式化提交消息
   */
  private formatCommitMessage(options: CommitOptions): string {
    const { description, details, category, testStatus, files, featureId } = options

    // 基础替换
    let message = this.config.commitTemplate
      .replace('{description}', description)
      .replace('{details}', details || '')
      .replace('{category}', category || 'functional')
      .replace('{testStatus}', testStatus || 'skipped')
      .replace('{files}', files ? files.join(', ') : '')
      .replace('{featureId}', featureId || '')

    // 清理多余的换行和空格
    message = message
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim()

    return message
  }

  /**
   * 使用模板提交更改
   */
  async commitWithTemplate(options: CommitOptions): Promise<GitResult> {
    try {
      // 检查是否应该提交
      if (!this.config.autoCommit) {
        return {
          success: true,
          message: '自动提交已禁用，跳过提交'
        }
      }

      if (this.config.commitOnTestPass && options.testStatus === 'failed' && !options.force) {
        return {
          success: true,
          message: '测试未通过，跳过提交'
        }
      }

      logger.startTask('提交更改')

      // 获取当前状态
      const status = await this.git.status()
      if (status.files.length === 0) {
        return {
          success: true,
          message: '没有需要提交的更改'
        }
      }

      // 添加所有更改
      await this.git.add('.')

      // 格式化提交消息
      const commitMessage = this.formatCommitMessage(options)

      // 执行提交
      const commitResult = await this.git.commit(commitMessage)

      logger.completeTask('提交更改')
      logger.info(`提交成功: ${commitResult.commit.substring(0, 8)} - ${options.description}`)

      // 添加进度日志
      logger.debug(`提交详情: ${commitMessage}`)

      return {
        success: true,
        message: '提交成功',
        data: {
          commit: commitResult.commit,
          summary: commitResult.summary,
          message: commitMessage
        }
      }
    } catch (error) {
      const errorMsg = `提交更改失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 基于功能状态提交
   */
  async commitForFeature(feature: Feature, files: string[] = []): Promise<GitResult> {
    const options: CommitOptions = {
      description: feature.description,
      details: `实现功能: ${feature.description}`,
      category: feature.category,
      testStatus: feature.passes ? 'passed' : 'failed',
      files: files.length > 0 ? files : feature.relatedFiles,
      featureId: feature.id
    }

    return this.commitWithTemplate(options)
  }

  /**
   * 创建标签
   */
  async createTag(tagName: string, message?: string): Promise<GitResult> {
    try {
      logger.startTask(`创建标签 ${tagName}`)

      await this.git.addTag(tagName)

      if (message) {
        await this.git.raw(['tag', '-a', tagName, '-m', message])
      }

      logger.completeTask(`创建标签 ${tagName}`)

      return {
        success: true,
        message: `标签 ${tagName} 创建成功`
      }
    } catch (error) {
      const errorMsg = `创建标签失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 推送更改到远程仓库
   */
  async pushToRemote(branch?: string): Promise<GitResult> {
    try {
      const targetBranch = branch || this.config.branch
      logger.startTask(`推送更改到远程仓库 (${targetBranch})`)

      await this.git.push('origin', targetBranch)

      logger.completeTask(`推送更改到远程仓库 (${targetBranch})`)

      return {
        success: true,
        message: '推送成功'
      }
    } catch (error) {
      const errorMsg = `推送更改失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 拉取远程更改
   */
  async pullFromRemote(branch?: string): Promise<GitResult> {
    try {
      const targetBranch = branch || this.config.branch
      logger.startTask(`拉取远程更改 (${targetBranch})`)

      await this.git.pull('origin', targetBranch)

      logger.completeTask(`拉取远程更改 (${targetBranch})`)

      return {
        success: true,
        message: '拉取成功'
      }
    } catch (error) {
      const errorMsg = `拉取更改失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 查看提交历史
   */
  async getCommitHistory(limit = 10): Promise<any[]> {
    try {
      const logResult = await this.git.log({ maxCount: limit })
      return logResult.all.map(commit => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author: commit.author_name,
        authorEmail: commit.author_email,
        refs: commit.refs
      }))
    } catch (error) {
      logger.error(`获取提交历史失败: ${error}`)
      return []
    }
  }

  /**
   * 检查是否需要初始化
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Git管理器未初始化，请先调用 initialize() 方法')
    }
  }

  /**
   * 重置更改
   */
  async resetChanges(mode: 'soft' | 'mixed' | 'hard' = 'mixed'): Promise<GitResult> {
    try {
      logger.startTask(`重置更改 (${mode}模式)`)

      await this.git.reset([`--${mode}`])

      logger.completeTask(`重置更改 (${mode}模式)`)

      return {
        success: true,
        message: `重置成功 (${mode}模式)`
      }
    } catch (error) {
      const errorMsg = `重置更改失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  /**
   * 清理未跟踪的文件
   */
  async cleanUntracked(): Promise<GitResult> {
    try {
      logger.startTask('清理未跟踪的文件')

      await this.git.clean('f', ['-d'])

      logger.completeTask('清理未跟踪的文件')

      return {
        success: true,
        message: '清理成功'
      }
    } catch (error) {
      const errorMsg = `清理未跟踪的文件失败: ${error}`
      logger.error(errorMsg)
      return {
        success: false,
        message: errorMsg,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

// 默认导出
export default GitManager