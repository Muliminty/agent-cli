/**
 * validation.ts 单元测试
 * 设计思路：测试数据验证工具的基本功能和验证规则
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals'

// 模拟依赖模块
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

jest.mock('fs-extra', () => {
  return {
    ensureDir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    appendFile: jest.fn().mockResolvedValue(undefined),
    pathExists: jest.fn().mockResolvedValue(true),
    readFile: jest.fn().mockResolvedValue('')
  }
})

// 模拟logger模块
jest.mock('../../utils/logger', () => {
  return {
    createLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      success: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  }
})

// 注意：zod不需要模拟，它是纯TypeScript库

import { ValidationUtils } from '../validation.ts'
import type { ValidationResult, ValidationError } from '../validation.ts'

describe('Validation工具', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
  })

  describe('邮箱验证', () => {
    test('应该验证有效的邮箱地址', async () => {
      const result = await ValidationUtils.validateEmail('test@example.com')
      expect(result.success).toBe(true)
      expect(result.data).toBe('test@example.com')
    })

    test('应该拒绝无效的邮箱地址', async () => {
      const result = await ValidationUtils.validateEmail('invalid-email')
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

  })

  describe('URL验证', () => {
    test('应该验证有效的HTTP URL', async () => {
      const result = await ValidationUtils.validateUrl('https://example.com')
      expect(result.success).toBe(true)
    })

    test('应该验证有效的HTTPS URL', async () => {
      const result = await ValidationUtils.validateUrl('https://api.example.com/path')
      expect(result.success).toBe(true)
    })

    test('应该拒绝无效的URL', async () => {
      const result = await ValidationUtils.validateUrl('not-a-url')
      expect(result.success).toBe(false)
    })
  })

  describe('文件路径验证', () => {
    test('应该验证存在的文件路径', async () => {
      // 模拟fs-extra的pathExists返回true
      const fs = require('fs-extra')
      fs.pathExists.mockResolvedValue(true)

      const result = await ValidationUtils.validateFilePath('/tmp/test.txt')
      expect(result.success).toBe(true)
    })

    test('应该拒绝不存在的文件路径', async () => {
      // 模拟fs-extra的pathExists返回false
      const fs = require('fs-extra')
      fs.pathExists.mockResolvedValue(false)

      const result = await ValidationUtils.validateFilePath('/nonexistent/file.txt')
      expect(result.success).toBe(false)
    })

    test('应该支持文件类型检查', async () => {
      const fs = require('fs-extra')
      fs.pathExists.mockResolvedValue(true)

      const result = await ValidationUtils.validateFilePath('/tmp/test.json', { isFile: true })
      expect(result.success).toBe(true)
    })
  })



  describe('验证结果格式', () => {
    test('验证结果应包含duration字段', async () => {
      const result = await ValidationUtils.validateEmail('test@example.com')
      expect(result.duration).toBeGreaterThanOrEqual(0)
      expect(typeof result.duration).toBe('number')
    })

    test('验证失败时应包含错误详情', async () => {
      const result = await ValidationUtils.validateEmail('invalid')
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()

      if (result.errors) {
        const error = result.errors[0]
        expect(error.message).toBeDefined()
        expect(error.path).toBeDefined()
        expect(error.code).toBeDefined()
      }
    })
  })
})