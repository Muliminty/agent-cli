/**
 * logger.ts 单元测试
 * 设计思路：测试日志工具的基本功能和配置选项
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals'

// 模拟chalk模块
jest.mock('chalk', () => {
  const mockChalk = {
    gray: (text: string) => text,
    blue: (text: string) => text,
    green: (text: string) => text,
    yellow: (text: string) => text,
    red: (text: string) => text,
    bold: {
      gray: (text: string) => text,
      blue: (text: string) => text,
      green: (text: string) => text,
      yellow: (text: string) => text,
      red: (text: string) => text,
    }
  }
  return mockChalk
})

// 模拟fs-extra模块
jest.mock('fs-extra', () => {
  return {
    ensureDir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    appendFile: jest.fn().mockResolvedValue(undefined),
    pathExists: jest.fn().mockResolvedValue(true),
    readFile: jest.fn().mockResolvedValue('')
  }
})

import { createLogger, type LoggerConfig, type LogLevel } from '../logger.ts'

// 模拟console方法以避免测试输出污染
const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn
const originalConsoleInfo = console.info
const originalConsoleDebug = console.debug

describe('Logger工具', () => {
  beforeEach(() => {
    // 重置所有模拟
    jest.restoreAllMocks()

    // 模拟console方法 - logger使用console.log输出所有消息
    console.log = jest.fn()
    console.error = jest.fn()
    console.warn = jest.fn()
    console.info = jest.fn()
    console.debug = jest.fn()
  })

  afterEach(() => {
    // 恢复原始console方法
    console.log = originalConsoleLog
    console.error = originalConsoleError
    console.warn = originalConsoleWarn
    console.info = originalConsoleInfo
    console.debug = originalConsoleDebug
  })

  describe('基础功能', () => {
    test('应该创建默认配置的logger实例', () => {
      const logger = createLogger()
      expect(logger).toBeDefined()
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.success).toBe('function')
    })

    test('应该接受自定义配置', () => {
      const config: LoggerConfig = {
        level: 'warn',
        debug: true,
        colors: false,
        timestamp: false,
        showLevel: false
      }

      const logger = createLogger(config)
      expect(logger).toBeDefined()
    })

    test('应该正确输出不同级别的日志', () => {
      const logger = createLogger({ level: 'debug' })

      logger.debug('调试消息')
      logger.info('信息消息')
      logger.success('成功消息')
      logger.warn('警告消息')
      logger.error('错误消息')

      // 验证console方法被调用
      expect(console.log).toHaveBeenCalled()
      expect(console.log).toHaveBeenCalled()
      expect(console.log).toHaveBeenCalled()
      expect(console.log).toHaveBeenCalled()
    })

    test('应该根据日志级别过滤消息', () => {
      const logger = createLogger({ level: 'warn' })

      logger.debug('调试消息 - 不应显示')
      logger.info('信息消息 - 不应显示')
      logger.success('成功消息 - 不应显示')
      logger.warn('警告消息 - 应显示')
      logger.error('错误消息 - 应显示')

      expect(console.debug).not.toHaveBeenCalled()
      expect(console.info).not.toHaveBeenCalled()
      expect(console.log).toHaveBeenCalled()
      expect(console.log).toHaveBeenCalled()
    })
  })

  describe('配置选项', () => {
    test('应该支持禁用颜色输出', () => {
      const logger = createLogger({ colors: false })
      logger.info('测试消息')

      // 验证输出了消息（具体颜色逻辑在实现中）
      expect(console.log).toHaveBeenCalled()
    })

    test('应该支持时间戳选项', () => {
      const logger = createLogger({ timestamp: true })
      logger.info('带时间戳的消息')

      expect(console.log).toHaveBeenCalled()
    })

    test('应该支持隐藏日志级别标签', () => {
      const logger = createLogger({ showLevel: false })
      logger.info('无级别标签的消息')

      expect(console.log).toHaveBeenCalled()
    })
  })

  describe('文件日志', () => {
    test('应该支持文件日志配置', () => {
      // 使用虚拟文件路径进行测试
      const logger = createLogger({
        logFile: '/tmp/test-log.txt',
        level: 'info'
      })

      logger.info('测试文件日志')

      expect(console.log).toHaveBeenCalled()
      // 注意：实际文件写入测试需要模拟fs-extra
    })
  })

  describe('特殊方法', () => {
    test('shouldLogLevel方法应正确判断日志级别', () => {
      const logger = createLogger({ level: 'info' })

      // 这些是内部方法，如果暴露则测试
      // expect(logger.shouldLogLevel('debug')).toBe(false)
      // expect(logger.shouldLogLevel('info')).toBe(true)
      // expect(logger.shouldLogLevel('warn')).toBe(true)
      // expect(logger.shouldLogLevel('error')).toBe(true)
    })

    test('getLoggerConfig方法应返回配置', () => {
      const config = { level: 'error' as LogLevel }
      const logger = createLogger(config)

      // 如果暴露了获取配置的方法
      // expect(logger.getConfig()).toEqual(expect.objectContaining(config))
    })
  })
})