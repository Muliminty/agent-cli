/**
 * 服务器配置schema定义
 * 设计思路：为可视化功能提供Web服务器配置，支持Express服务器和WebSocket服务
 */

import { z } from 'zod'

// WebSocket配置
export const WebSocketConfigSchema = z.object({
  enabled: z.boolean().default(true),
  path: z.string().default('/ws'),
  pingInterval: z.number().min(1000).max(60000).default(30000),
  maxConnections: z.number().min(1).max(1000).default(100),
  reconnectAttempts: z.number().min(0).max(10).default(3),
  reconnectDelay: z.number().min(1000).max(10000).default(2000)
})

export type WebSocketConfig = z.infer<typeof WebSocketConfigSchema>

// 静态文件服务配置
export const StaticFilesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  directory: z.string().default('public'),
  maxAge: z.number().min(0).max(31536000).default(86400), // 1天，单位秒
  index: z.boolean().default(true),
  fallback: z.string().optional()
})

export type StaticFilesConfig = z.infer<typeof StaticFilesConfigSchema>

// CORS配置
export const CorsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  origin: z.union([
    z.string(),
    z.array(z.string()),
    z.literal('*')
  ]).default('*'),
  methods: z.array(z.string()).default(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
  allowedHeaders: z.array(z.string()).default(['Content-Type', 'Authorization']),
  credentials: z.boolean().default(false),
  maxAge: z.number().min(0).max(86400).default(86400)
})

export type CorsConfig = z.infer<typeof CorsConfigSchema>

// 压缩配置
export const CompressionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  threshold: z.number().min(0).max(1048576).default(1024), // 1KB
  level: z.number().min(-1).max(9).default(6)
})

export type CompressionConfig = z.infer<typeof CompressionConfigSchema>

// 安全配置
export const SecurityConfigSchema = z.object({
  helmet: z.boolean().default(true),
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    windowMs: z.number().min(60000).max(3600000).default(900000), // 15分钟
    max: z.number().min(1).max(1000).default(100)
  }).default({}),
  xssFilter: z.boolean().default(true),
  noSniff: z.boolean().default(true),
  hidePoweredBy: z.boolean().default(true)
})

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>

// 日志配置
export const ServerLoggingConfigSchema = z.object({
  enabled: z.boolean().default(true),
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  format: z.enum(['combined', 'common', 'dev', 'short', 'tiny']).default('combined'),
  file: z.string().optional(),
  maxSize: z.number().min(1048576).max(1073741824).default(10485760) // 10MB
})

export type ServerLoggingConfig = z.infer<typeof ServerLoggingConfigSchema>

// 服务器配置
export const ServerConfigSchema = z.object({
  enabled: z.boolean().default(false),
  port: z.number().min(1).max(65535).default(3000),
  host: z.string().default('localhost'),
  basePath: z.string().default('/'),
  trustProxy: z.boolean().default(false),
  timeout: z.number().min(1000).max(300000).default(30000),
  keepAliveTimeout: z.number().min(1000).max(120000).default(5000),
  maxHeadersCount: z.number().min(1).max(2000).default(2000),
  websocket: WebSocketConfigSchema.default({}),
  staticFiles: StaticFilesConfigSchema.default({}),
  cors: CorsConfigSchema.default({}),
  compression: CompressionConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
  logging: ServerLoggingConfigSchema.default({})
})

export type ServerConfig = z.infer<typeof ServerConfigSchema>

// 默认服务器配置
export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  enabled: false,
  port: 3000,
  host: 'localhost',
  basePath: '/',
  trustProxy: false,
  timeout: 30000,
  keepAliveTimeout: 5000,
  maxHeadersCount: 2000,
  websocket: {
    enabled: true,
    path: '/ws',
    pingInterval: 30000,
    maxConnections: 100,
    reconnectAttempts: 3,
    reconnectDelay: 2000
  },
  staticFiles: {
    enabled: true,
    directory: 'public',
    maxAge: 86400,
    index: true,
    fallback: 'index.html'
  },
  cors: {
    enabled: true,
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 86400
  },
  compression: {
    enabled: true,
    threshold: 1024,
    level: 6
  },
  security: {
    helmet: true,
    rateLimit: {
      enabled: true,
      windowMs: 900000,
      max: 100
    },
    xssFilter: true,
    noSniff: true,
    hidePoweredBy: true
  },
  logging: {
    enabled: true,
    level: 'info',
    format: 'combined',
    maxSize: 10485760
  }
}

/**
 * 验证服务器配置
 * @param config 服务器配置对象
 * @returns 验证后的配置对象
 * @throws 如果配置无效则抛出错误
 */
export function validateServerConfig(config: unknown): ServerConfig {
  try {
    return ServerConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code
      }))

      throw new Error(`服务器配置验证失败:\n${errors.map(e => `  - ${e.path}: ${e.message}`).join('\n')}`)
    }
    throw error
  }
}

/**
 * 合并服务器配置，优先使用用户配置，缺失的项使用默认值
 * @param userConfig 用户配置
 * @returns 合并后的完整配置
 */
export function mergeServerConfig(userConfig: Partial<ServerConfig>): ServerConfig {
  const merged = JSON.parse(JSON.stringify(DEFAULT_SERVER_CONFIG))

  const deepMerge = (target: any, source: any) => {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) target[key] = {}
        deepMerge(target[key], source[key])
      } else if (source[key] !== undefined) {
        target[key] = source[key]
      }
    }
    return target
  }

  return deepMerge(merged, userConfig)
}