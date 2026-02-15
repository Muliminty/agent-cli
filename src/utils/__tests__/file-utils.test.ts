/**
 * file-utils.ts 单元测试
 * 设计思路：测试文件操作工具的基本功能，模拟文件系统操作
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
    readFile: jest.fn().mockResolvedValue(''),
    copy: jest.fn().mockResolvedValue(undefined),
    copyFile: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    pathExists: jest.fn().mockResolvedValue(true),
    stat: jest.fn().mockResolvedValue({ size: 1024, birthtime: new Date(), isDirectory: () => false }),
    readdir: jest.fn().mockResolvedValue([]),
    mkdirp: jest.fn().mockResolvedValue(undefined),
    move: jest.fn().mockResolvedValue(undefined),
    outputFile: jest.fn().mockResolvedValue(undefined),
    utimes: jest.fn().mockResolvedValue(undefined)
  }
})

// 模拟logger模块
jest.mock('../logger.ts', () => {
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

import { FileUtils } from '../file-utils.ts'
import type { FileOperationResult, FileReadOptions, FileWriteOptions } from '../file-utils.ts'

describe('FileUtils工具', () => {
  let fs: any

  beforeEach(() => {
    jest.restoreAllMocks()
    fs = require('fs-extra')
  })

  describe('文件读取', () => {
    test('应该成功读取文件内容', async () => {
      const mockContent = '测试文件内容'
      fs.readFile.mockResolvedValue(mockContent)

      const result = await FileUtils.readFile('/tmp/test.txt')
      expect(result.success).toBe(true)
      expect(result.data).toBe(mockContent)
      expect(result.filePath).toBe('/tmp/test.txt')
    })

    test('应该处理文件不存在的情况', async () => {
      // 模拟文件不存在的情况
      fs.pathExists.mockResolvedValue(false)

      const result = await FileUtils.readFile('/nonexistent.txt', {
        throwIfMissing: false,
        defaultValue: '默认内容'
      })
      expect(result.success).toBe(true)
      expect(result.data).toBe('默认内容')
    })

    test('应该解析JSON文件', async () => {
      const jsonData = { name: 'test', value: 123 }
      // 确保所有必要的mock都设置正确
      fs.pathExists.mockResolvedValue(true)
      fs.readFile.mockResolvedValue(JSON.stringify(jsonData))

      const result = await FileUtils.readFile('/tmp/data.json', {
        parseJson: true
      })
      expect(result.success).toBe(true)
      expect(result.data).toEqual(jsonData)
    })
  })

  describe('文件写入', () => {
    test('应该成功写入文件', async () => {
      fs.writeFile.mockResolvedValue(undefined)

      const result = await FileUtils.writeFile('/tmp/output.txt', '内容')
      expect(result.success).toBe(true)
      // 注意：writeFile实际传递的是options对象 { encoding: 'utf-8', mode: 0o666 }
      expect(fs.writeFile).toHaveBeenCalledWith('/tmp/output.txt', '内容', { encoding: 'utf-8', mode: 0o666 })
    })

    test('应该自动创建目录', async () => {
      fs.writeFile.mockResolvedValue(undefined)

      const result = await FileUtils.writeFile('/tmp/subdir/file.txt', '内容', {
        ensureDir: true
      })
      expect(result.success).toBe(true)
      expect(fs.ensureDir).toHaveBeenCalled()
    })
  })

  describe('文件操作', () => {
    test('应该复制文件', async () => {
      // 设置复制文件所需的mock
      fs.pathExists.mockImplementation(async (path: string) => {
        // 源文件存在，目标文件不存在
        if (path === '/tmp/source.txt') return true
        if (path === '/tmp/dest.txt') return false
        return true
      })
      fs.stat.mockResolvedValue({
        size: 1024,
        birthtime: new Date(),
        isDirectory: () => false, // 是文件，不是目录
        atime: new Date(),
        mtime: new Date()
      })
      fs.copyFile.mockResolvedValue(undefined)
      fs.utimes.mockResolvedValue(undefined)

      const result = await FileUtils.copy('/tmp/source.txt', '/tmp/dest.txt')
      expect(result.success).toBe(true)
      expect(fs.copyFile).toHaveBeenCalled()
    })

    test('应该删除文件', async () => {
      // 设置删除文件所需的mock
      fs.pathExists.mockResolvedValue(true)
      fs.remove.mockResolvedValue(undefined)

      const result = await FileUtils.remove('/tmp/file.txt')
      expect(result.success).toBe(true)
      expect(fs.remove).toHaveBeenCalledWith('/tmp/file.txt')
    })

    test('应该检查文件是否存在', async () => {
      fs.pathExists.mockResolvedValue(true)

      const result = await FileUtils.exists('/tmp/file.txt')
      expect(result.success).toBe(true)
      expect(result.data).toBe(true)
    })
  })

  describe('目录操作', () => {
    test('应该创建目录', async () => {
      fs.ensureDir.mockResolvedValue(undefined)

      const result = await FileUtils.ensureDir('/tmp/newdir')
      expect(result.success).toBe(true)
      // ensureDir可能被递归调用多次，检查至少被调用过一次
      expect(fs.ensureDir).toHaveBeenCalled()
    })

    test('应该列出目录内容', async () => {
      const files = ['file1.txt', 'file2.txt']
      // 设置读取目录所需的mock
      fs.pathExists.mockResolvedValue(true)
      fs.stat.mockResolvedValue({
        size: 4096,
        birthtime: new Date(),
        isDirectory: () => true // 是目录
      })
      fs.readdir.mockResolvedValue(files)

      const result = await FileUtils.readDir('/tmp')
      expect(result.success).toBe(true)
      expect(result.data).toEqual(files)
    })
  })

  describe('路径处理', () => {
    test('应该获取文件扩展名', () => {
      const result = FileUtils.getFileExtension('/tmp/file.json')
      // getFileExtension返回小写扩展名且不带点号
      expect(result).toBe('json')
    })

    test('应该规范化路径', () => {
      const result = FileUtils.normalizePath('path\\to\\file.txt')
      expect(result).toBe('path/to/file.txt')
    })
  })

  describe('模板渲染', () => {
    test('应该渲染简单模板', async () => {
      const template = 'Hello {{name}}!'
      const data = { name: 'World' }

      // 需要模拟文件读取和写入
      fs.readFile.mockResolvedValue(template)
      fs.writeFile.mockResolvedValue(undefined)

      const result = await FileUtils.renderTemplate('/tmp/template.txt', data, '/tmp/output.txt')
      expect(result.success).toBe(true)
    })
  })
})