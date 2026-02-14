/**
 * 日志工具模块
 * 设计思路：提供统一的日志输出接口，支持彩色控制台输出和文件日志
 *
 * 功能特点：
 * 1. 多日志级别：debug, info, success, warn, error
 * 2. 彩色输出，提高可读性
 * 3. 文件日志支持，便于问题排查
 * 4. 进度指示器和任务跟踪
 * 5. 结构化日志格式
 */

import chalk from 'chalk'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

// ES模块的__dirname替代方案
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 日志级别定义
export type LogLevel = 'debug' | 'info' | 'success' | 'warn' | 'error'

// 日志配置接口
export interface LoggerConfig {
  /** 日志级别，低于此级别的日志将不显示 */
  level?: LogLevel
  /** 是否启用调试模式 */
  debug?: boolean
  /** 是否启用彩色输出 */
  colors?: boolean
  /** 日志文件路径，如不指定则不写入文件 */
  logFile?: string
  /** 是否显示时间戳 */
  timestamp?: boolean
  /** 是否显示日志级别标签 */
  showLevel?: boolean
}

// 日志级别优先级映射
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  success: 1,
  warn: 2,
  error: 3
}

// 日志级别颜色映射
const LOG_LEVEL_COLORS: Record<LogLevel, chalk.Chalk> = {
  debug: chalk.gray,
  info: chalk.blue,
  success: chalk.green,
  warn: chalk.yellow,
  error: chalk.red
}

// 日志级别标签映射
const LOG_LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  success: 'SUCCESS',
  warn: 'WARN',
  error: 'ERROR'
}

// 默认配置
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  debug: false,
  colors: true,
  timestamp: true,
  showLevel: true
}

/**
 * 日志工具类
 */
export class Logger {
  private config: LoggerConfig
  private logStream: fs.WriteStream | null = null

  constructor(config: LoggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    // 如果指定了日志文件，创建写入流
    if (this.config.logFile) {
      this.ensureLogFile(this.config.logFile)
      this.logStream = fs.createWriteStream(this.config.logFile, { flags: 'a' })
    }
  }

  /**
   * 确保日志文件目录存在
   */
  private ensureLogFile(logFile: string): void {
    const dir = path.dirname(logFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirpSync(dir)
    }
  }

  /**
   * 格式化时间戳
   */
  private formatTimestamp(): string {
    const now = new Date()
    return now.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
  }

  /**
   * 检查是否应该记录该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    const currentPriority = LOG_LEVEL_PRIORITY[this.config.level!]
    const messagePriority = LOG_LEVEL_PRIORITY[level]
    return messagePriority >= currentPriority
  }

  /**
   * 写入文件日志
   */
  private writeToFile(level: LogLevel, message: string): void {
    if (!this.logStream) return

    const timestamp = this.formatTimestamp()
    const label = LOG_LEVEL_LABELS[level]
    const logLine = `[${timestamp}] [${label}] ${message}\n`

    this.logStream.write(logLine)
  }

  /**
   * 格式化控制台输出
   */
  private formatConsoleOutput(level: LogLevel, message: string): string {
    const parts: string[] = []

    // 添加时间戳
    if (this.config.timestamp) {
      const timestamp = this.formatTimestamp()
      parts.push(this.config.colors ? chalk.gray(`[${timestamp}]`) : `[${timestamp}]`)
    }

    // 添加日志级别标签
    if (this.config.showLevel) {
      const label = LOG_LEVEL_LABELS[level]
      const color = LOG_LEVEL_COLORS[level]
      parts.push(this.config.colors ? color(`[${label}]`) : `[${label}]`)
    }

    // 添加消息
    const color = LOG_LEVEL_COLORS[level]
    parts.push(this.config.colors ? color(message) : message)

    return parts.join(' ')
  }

  /**
   * 通用日志方法
   */
  private log(level: LogLevel, message: string): void {
    if (!this.shouldLog(level)) return

    // 写入控制台
    const consoleOutput = this.formatConsoleOutput(level, message)
    console.log(consoleOutput)

    // 写入文件（如果有）
    this.writeToFile(level, message)
  }

  /**
   * 调试日志
   */
  debug(message: string): void {
    this.log('debug', message)
  }

  /**
   * 信息日志
   */
  info(message: string): void {
    this.log('info', message)
  }

  /**
   * 成功日志
   */
  success(message: string): void {
    this.log('success', message)
  }

  /**
   * 警告日志
   */
  warn(message: string): void {
    this.log('warn', message)
  }

  /**
   * 错误日志
   */
  error(message: string): void {
    this.log('error', message)
  }

  /**
   * 进度指示器 - 开始一个任务
   */
  startTask(description: string): void {
    if (this.shouldLog('info')) {
      const timestamp = this.config.timestamp ? `[${this.formatTimestamp()}] ` : ''
      const prefix = this.config.colors ? chalk.cyan('⏳') : '⏳'
      console.log(`${timestamp}${prefix} ${description}...`)
    }
  }

  /**
   * 进度指示器 - 完成任务
   */
  completeTask(description: string, success = true): void {
    if (this.shouldLog('info')) {
      const timestamp = this.config.timestamp ? `[${this.formatTimestamp()}] ` : ''
      const prefix = success
        ? (this.config.colors ? chalk.green('✅') : '✅')
        : (this.config.colors ? chalk.red('❌') : '❌')
      const status = success ? '完成' : '失败'
      console.log(`${timestamp}${prefix} ${description} ${status}`)
    }
  }

  /**
   * 分割线
   */
  divider(char = '─', length = 60): void {
    if (this.shouldLog('info')) {
      const line = char.repeat(length)
      console.log(this.config.colors ? chalk.gray(line) : line)
    }
  }

  /**
   * 标题
   */
  title(text: string): void {
    if (this.shouldLog('info')) {
      this.divider()
      console.log(this.config.colors ? chalk.bold.cyan(`  ${text}`) : `  ${text}`)
      this.divider()
    }
  }

  /**
   * 列表项
   */
  item(label: string, value: string): void {
    if (this.shouldLog('info')) {
      const formattedLabel = this.config.colors ? chalk.cyan(`${label}:`) : `${label}:`
      console.log(`  ${formattedLabel} ${value}`)
    }
  }

  /**
   * 关闭日志流
   */
  close(): void {
    if (this.logStream) {
      this.logStream.end()
      this.logStream = null
    }
  }
}

/**
 * 创建默认日志实例
 */
let defaultLogger: Logger | null = null

export function createLogger(config: LoggerConfig = {}): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger(config)
  }
  return defaultLogger
}

/**
 * 获取默认日志实例
 */
export function getLogger(): Logger {
  if (!defaultLogger) {
    defaultLogger = new Logger()
  }
  return defaultLogger
}

// 默认导出
export default { Logger, createLogger, getLogger }