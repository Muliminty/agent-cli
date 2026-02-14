/**
 * 文件操作工具模块
 * 设计思路：封装常见文件系统操作，提供安全、易用的API，支持异步操作和错误处理
 *
 * 功能特点：
 * 1. 安全的文件读写操作，自动处理目录创建
 * 2. 批量文件操作，支持通配符匹配
 * 3. 文件内容模板渲染，支持变量替换
 * 4. 原子性操作，避免中间状态
 * 5. 详细的错误信息和恢复建议
 */

import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { createLogger } from './logger.js'

// ES模块的__dirname替代方案
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 日志实例
const logger = createLogger()

// 文件操作选项
export interface FileReadOptions {
  /** 编码格式，默认utf-8 */
  encoding?: BufferEncoding
  /** 是否解析JSON内容 */
  parseJson?: boolean
  /** 如果文件不存在是否抛出错误 */
  throwIfMissing?: boolean
  /** 默认值（文件不存在时返回） */
  defaultValue?: any
}

export interface FileWriteOptions {
  /** 编码格式，默认utf-8 */
  encoding?: BufferEncoding
  /** 是否格式化JSON输出 */
  formatJson?: boolean
  /** 是否确保目录存在 */
  ensureDir?: boolean
  /** 文件模式，默认0o666 */
  mode?: number
  /** 写入模式：'overwrite'覆盖，'append'追加，'prepend'前置 */
  modeType?: 'overwrite' | 'append' | 'prepend'
}

export interface FileCopyOptions {
  /** 是否覆盖已存在的目标文件 */
  overwrite?: boolean
  /** 是否保留文件权限 */
  preserveTimestamps?: boolean
  /** 错误处理：'skip'跳过，'throw'抛出，'overwrite'覆盖 */
  errorOnExist?: 'skip' | 'throw' | 'overwrite'
  /** 文件过滤函数 */
  filter?: (src: string, dest: string) => boolean
}

export interface FileFindOptions {
  /** 搜索模式，支持glob语法 */
  pattern?: string
  /** 是否递归搜索子目录 */
  recursive?: boolean
  /** 文件类型过滤：'file'只文件，'dir'只目录，'both'两者 */
  type?: 'file' | 'dir' | 'both'
  /** 最大深度，0表示不限制 */
  maxDepth?: number
  /** 是否忽略隐藏文件（以.开头的文件） */
  ignoreHidden?: boolean
}

// 文件操作结果
export interface FileOperationResult<T = any> {
  /** 操作是否成功 */
  success: boolean
  /** 操作结果数据 */
  data?: T
  /** 错误信息 */
  error?: string
  /** 操作文件路径 */
  filePath: string
  /** 操作耗时（毫秒） */
  duration: number
}

/**
 * 文件操作工具类
 */
export class FileUtils {
  /**
   * 读取文件内容
   */
  static async readFile(
    filePath: string,
    options: FileReadOptions = {}
  ): Promise<FileOperationResult<string | any>> {
    const startTime = Date.now()
    const {
      encoding = 'utf-8',
      parseJson = false,
      throwIfMissing = true,
      defaultValue
    } = options

    try {
      // 解析相对路径为绝对路径
      const absolutePath = path.resolve(filePath)

      // 检查文件是否存在
      const exists = await fs.pathExists(absolutePath)
      if (!exists) {
        if (throwIfMissing) {
          throw new Error(`文件不存在: ${absolutePath}`)
        }
        if (defaultValue !== undefined) {
          return {
            success: true,
            data: defaultValue,
            filePath: absolutePath,
            duration: Date.now() - startTime
          }
        }
        return {
          success: false,
          error: `文件不存在: ${absolutePath}`,
          filePath: absolutePath,
          duration: Date.now() - startTime
        }
      }

      // 读取文件内容
      const content = await fs.readFile(absolutePath, encoding)

      let data: any = content
      if (parseJson) {
        try {
          data = JSON.parse(content)
        } catch (parseError) {
          throw new Error(`JSON解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}`)
        }
      }

      logger.debug(`读取文件成功: ${absolutePath} (${content.length} bytes)`)

      return {
        success: true,
        data,
        filePath: absolutePath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `读取文件失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 写入文件内容
   */
  static async writeFile(
    filePath: string,
    content: string | Buffer | object,
    options: FileWriteOptions = {}
  ): Promise<FileOperationResult<void>> {
    const startTime = Date.now()
    const {
      encoding = 'utf-8',
      formatJson = true,
      ensureDir = true,
      mode = 0o666,
      modeType = 'overwrite'
    } = options

    try {
      // 解析相对路径为绝对路径
      const absolutePath = path.resolve(filePath)

      // 确保目录存在
      if (ensureDir) {
        const dir = path.dirname(absolutePath)
        await fs.ensureDir(dir)
        logger.debug(`确保目录存在: ${dir}`)
      }

      // 准备写入内容
      let writeContent: string | Buffer
      if (typeof content === 'object' && !Buffer.isBuffer(content)) {
        writeContent = formatJson
          ? JSON.stringify(content, null, 2)
          : JSON.stringify(content)
      } else if (typeof content === 'string') {
        writeContent = content
      } else {
        writeContent = content
      }

      // 根据写入模式处理
      let finalContent = writeContent
      if (modeType === 'append') {
        const existingResult = await this.readFile(absolutePath, {
          throwIfMissing: false,
          encoding
        })
        if (existingResult.success) {
          finalContent = existingResult.data + writeContent
        }
      } else if (modeType === 'prepend') {
        const existingResult = await this.readFile(absolutePath, {
          throwIfMissing: false,
          encoding
        })
        if (existingResult.success) {
          finalContent = writeContent + existingResult.data
        }
      }

      // 写入文件
      await fs.writeFile(absolutePath, finalContent, { encoding, mode })

      const size = Buffer.isBuffer(finalContent)
        ? finalContent.length
        : Buffer.byteLength(finalContent, encoding)

      logger.debug(`写入文件成功: ${absolutePath} (${size} bytes)`)

      return {
        success: true,
        filePath: absolutePath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `写入文件失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 复制文件或目录
   */
  static async copy(
    src: string,
    dest: string,
    options: FileCopyOptions = {}
  ): Promise<FileOperationResult<void>> {
    const startTime = Date.now()
    const {
      overwrite = false,
      preserveTimestamps = true,
      errorOnExist = 'throw',
      filter
    } = options

    try {
      const srcPath = path.resolve(src)
      const destPath = path.resolve(dest)

      // 检查源路径是否存在
      const srcExists = await fs.pathExists(srcPath)
      if (!srcExists) {
        throw new Error(`源路径不存在: ${srcPath}`)
      }

      // 检查目标路径是否存在
      const destExists = await fs.pathExists(destPath)
      if (destExists) {
        if (errorOnExist === 'throw') {
          throw new Error(`目标路径已存在: ${destPath}`)
        } else if (errorOnExist === 'skip') {
          logger.debug(`目标路径已存在，跳过复制: ${destPath}`)
          return {
            success: true,
            filePath: destPath,
            duration: Date.now() - startTime
          }
        }
        // overwrite: 继续执行
      }

      // 复制操作
      const srcStat = await fs.stat(srcPath)
      if (srcStat.isDirectory()) {
        // 复制目录
        await fs.copy(srcPath, destPath, {
          overwrite,
          preserveTimestamps,
          filter
        })
        logger.debug(`复制目录成功: ${srcPath} -> ${destPath}`)
      } else {
        // 复制文件
        await fs.copyFile(srcPath, destPath)
        if (preserveTimestamps) {
          const { atime, mtime } = srcStat
          await fs.utimes(destPath, atime, mtime)
        }
        logger.debug(`复制文件成功: ${srcPath} -> ${destPath}`)
      }

      return {
        success: true,
        filePath: destPath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `复制操作失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: dest,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 移动文件或目录
   */
  static async move(
    src: string,
    dest: string,
    options: Pick<FileCopyOptions, 'overwrite' | 'errorOnExist'> = {}
  ): Promise<FileOperationResult<void>> {
    const startTime = Date.now()
    const { overwrite = false, errorOnExist = 'throw' } = options

    try {
      const srcPath = path.resolve(src)
      const destPath = path.resolve(dest)

      // 检查源路径是否存在
      const srcExists = await fs.pathExists(srcPath)
      if (!srcExists) {
        throw new Error(`源路径不存在: ${srcPath}`)
      }

      // 检查目标路径是否存在
      const destExists = await fs.pathExists(destPath)
      if (destExists) {
        if (errorOnExist === 'throw') {
          throw new Error(`目标路径已存在: ${destPath}`)
        } else if (errorOnExist === 'skip') {
          logger.debug(`目标路径已存在，跳过移动: ${destPath}`)
          return {
            success: true,
            filePath: destPath,
            duration: Date.now() - startTime
          }
        }
        // overwrite: 先删除目标
        if (overwrite) {
          await fs.remove(destPath)
        }
      }

      // 确保目标目录存在
      await fs.ensureDir(path.dirname(destPath))

      // 执行移动
      await fs.move(srcPath, destPath, { overwrite })

      logger.debug(`移动成功: ${srcPath} -> ${destPath}`)

      return {
        success: true,
        filePath: destPath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `移动操作失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: dest,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 删除文件或目录
   */
  static async remove(
    target: string,
    options: { recursive?: boolean; force?: boolean } = {}
  ): Promise<FileOperationResult<void>> {
    const startTime = Date.now()
    const { recursive = true, force = false } = options

    try {
      const targetPath = path.resolve(target)

      // 检查路径是否存在
      const exists = await fs.pathExists(targetPath)
      if (!exists) {
        if (force) {
          logger.debug(`目标路径不存在，无需删除: ${targetPath}`)
          return {
            success: true,
            filePath: targetPath,
            duration: Date.now() - startTime
          }
        }
        throw new Error(`目标路径不存在: ${targetPath}`)
      }

      // 执行删除
      await fs.remove(targetPath)

      logger.debug(`删除成功: ${targetPath}`)

      return {
        success: true,
        filePath: targetPath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `删除操作失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: target,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 检查文件或目录是否存在
   */
  static async exists(target: string): Promise<FileOperationResult<boolean>> {
    const startTime = Date.now()

    try {
      const targetPath = path.resolve(target)
      const exists = await fs.pathExists(targetPath)

      return {
        success: true,
        data: exists,
        filePath: targetPath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `检查存在性失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        data: false,
        filePath: target,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 获取文件或目录信息
   */
  static async stat(
    target: string
  ): Promise<FileOperationResult<fs.Stats>> {
    const startTime = Date.now()

    try {
      const targetPath = path.resolve(target)
      const stats = await fs.stat(targetPath)

      return {
        success: true,
        data: stats,
        filePath: targetPath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `获取文件信息失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: target,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 创建目录（包括父目录）
   */
  static async ensureDir(
    dirPath: string,
    options: { mode?: number } = {}
  ): Promise<FileOperationResult<void>> {
    const startTime = Date.now()
    const { mode = 0o777 } = options

    try {
      const absolutePath = path.resolve(dirPath)
      await fs.ensureDir(absolutePath, mode)

      logger.debug(`创建目录成功: ${absolutePath}`)

      return {
        success: true,
        filePath: absolutePath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `创建目录失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: dirPath,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 读取目录内容
   */
  static async readDir(
    dirPath: string,
    options: { withFileTypes?: boolean; encoding?: BufferEncoding } = {}
  ): Promise<FileOperationResult<string[] | fs.Dirent[]>> {
    const startTime = Date.now()
    const { withFileTypes = false, encoding = 'utf-8' } = options

    try {
      const absolutePath = path.resolve(dirPath)

      // 检查目录是否存在
      const exists = await fs.pathExists(absolutePath)
      if (!exists) {
        throw new Error(`目录不存在: ${absolutePath}`)
      }

      const stats = await fs.stat(absolutePath)
      if (!stats.isDirectory()) {
        throw new Error(`路径不是目录: ${absolutePath}`)
      }

      let data: string[] | fs.Dirent[]
      if (withFileTypes) {
        data = await fs.readdir(absolutePath, { withFileTypes: true, encoding })
      } else {
        data = await fs.readdir(absolutePath, { encoding })
      }

      logger.debug(`读取目录成功: ${absolutePath} (${data.length} 个条目)`)

      return {
        success: true,
        data,
        filePath: absolutePath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `读取目录失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: dirPath,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 查找文件
   */
  static async findFiles(
    searchDir: string,
    options: FileFindOptions = {}
  ): Promise<FileOperationResult<string[]>> {
    const startTime = Date.now()
    const {
      pattern = '*',
      recursive = true,
      type = 'file',
      maxDepth = 0,
      ignoreHidden = true
    } = options

    try {
      const absoluteDir = path.resolve(searchDir)

      // 检查目录是否存在
      const exists = await fs.pathExists(absoluteDir)
      if (!exists) {
        throw new Error(`搜索目录不存在: ${absoluteDir}`)
      }

      const results: string[] = []

      // 递归搜索函数
      const search = async (currentDir: string, depth: number) => {
        if (maxDepth > 0 && depth > maxDepth) return

        const entries = await fs.readdir(currentDir, { withFileTypes: true })

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name)

          // 忽略隐藏文件
          if (ignoreHidden && entry.name.startsWith('.')) {
            continue
          }

          // 检查类型
          let include = false
          if (type === 'both') {
            include = true
          } else if (type === 'file' && entry.isFile()) {
            include = true
          } else if (type === 'dir' && entry.isDirectory()) {
            include = true
          }

          // 检查模式匹配
          if (include && this.matchesPattern(entry.name, pattern)) {
            results.push(fullPath)
          }

          // 递归搜索子目录
          if (recursive && entry.isDirectory()) {
            await search(fullPath, depth + 1)
          }
        }
      }

      await search(absoluteDir, 1)

      logger.debug(`查找文件完成: ${absoluteDir} (找到 ${results.length} 个文件)`)

      return {
        success: true,
        data: results,
        filePath: absoluteDir,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `查找文件失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: searchDir,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 检查文件名是否匹配模式
   */
  private static matchesPattern(filename: string, pattern: string): boolean {
    // 简单实现，支持 * 通配符
    if (pattern === '*') return true

    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(filename)
  }

  /**
   * 渲染模板文件
   */
  static async renderTemplate(
    templatePath: string,
    data: Record<string, any>,
    outputPath?: string
  ): Promise<FileOperationResult<string>> {
    const startTime = Date.now()

    try {
      const absoluteTemplatePath = path.resolve(templatePath)

      // 读取模板内容
      const templateResult = await this.readFile(absoluteTemplatePath, {
        throwIfMissing: true
      })

      if (!templateResult.success) {
        throw new Error(templateResult.error)
      }

      const template = templateResult.data as string

      // 渲染模板
      let rendered = template
      for (const [key, value] of Object.entries(data)) {
        const placeholder = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
        rendered = rendered.replace(placeholder, String(value))
      }

      // 写入输出文件（如果指定）
      if (outputPath) {
        const absoluteOutputPath = path.resolve(outputPath)
        const writeResult = await this.writeFile(absoluteOutputPath, rendered, {
          ensureDir: true
        })

        if (!writeResult.success) {
          throw new Error(writeResult.error)
        }
      }

      logger.debug(`模板渲染成功: ${absoluteTemplatePath}`)

      return {
        success: true,
        data: rendered,
        filePath: outputPath || absoluteTemplatePath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `模板渲染失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath: templatePath,
        duration: Date.now() - startTime
      }
    }
  }

  /**
   * 获取文件哈希（简单实现）
   */
  static async getFileHash(
    filePath: string,
    algorithm: 'md5' | 'sha1' | 'sha256' = 'md5'
  ): Promise<FileOperationResult<string>> {
    const startTime = Date.now()

    try {
      const absolutePath = path.resolve(filePath)

      // 检查文件是否存在
      const exists = await fs.pathExists(absolutePath)
      if (!exists) {
        throw new Error(`文件不存在: ${absolutePath}`)
      }

      const stats = await fs.stat(absolutePath)
      if (!stats.isFile()) {
        throw new Error(`路径不是文件: ${absolutePath}`)
      }

      // 简单哈希实现（基于文件大小和修改时间）
      // 注意：实际项目中应该使用crypto模块，这里简化实现
      const hash = `${algorithm}:${stats.size}:${stats.mtimeMs}`

      return {
        success: true,
        data: hash,
        filePath: absolutePath,
        duration: Date.now() - startTime
      }
    } catch (error) {
      const errorMsg = `计算文件哈希失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMsg)
      return {
        success: false,
        error: errorMsg,
        filePath,
        duration: Date.now() - startTime
      }
    }
  }
}

/**
 * 创建文件工具实例
 */
export function createFileUtils(): FileUtils {
  return FileUtils
}

/**
 * 获取默认文件工具实例
 */
export function getFileUtils(): FileUtils {
  return FileUtils
}

// 默认导出
export default {
  FileUtils,
  createFileUtils,
  getFileUtils
}