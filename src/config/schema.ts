/**
 * 配置schema定义
 * 设计思路：使用Zod提供运行时验证和类型安全，支持配置文件的加载和验证
 */

import { z } from 'zod'
import { ConfigSchema, DEFAULT_CONFIG } from '../types/config.js'

export type Config = z.infer<typeof ConfigSchema>
export { ConfigSchema, DEFAULT_CONFIG }

/**
 * 验证配置对象
 * @param config 配置对象
 * @returns 验证后的配置对象
 * @throws 如果配置无效则抛出错误
 */
export function validateConfig(config: unknown): z.infer<typeof ConfigSchema> {
  try {
    return ConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code
      }))

      throw new Error(`配置验证失败:\n${errors.map(e => `  - ${e.path}: ${e.message}`).join('\n')}`)
    }
    throw error
  }
}

/**
 * 合并配置，优先使用用户配置，缺失的项使用默认值
 * @param userConfig 用户配置
 * @returns 合并后的完整配置
 */
export function mergeConfig(userConfig: Partial<z.infer<typeof ConfigSchema>>): z.infer<typeof ConfigSchema> {
  // 深拷贝默认配置，避免污染原始DEFAULT_CONFIG
  const merged = JSON.parse(JSON.stringify(DEFAULT_CONFIG))

  // 深度合并配置
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

/**
 * 生成配置schema的JSON Schema，可用于IDE自动补全
 * @returns JSON Schema对象
 */
export function generateJsonSchema(): object {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://agent-cli.dev/schemas/config.schema.json',
    title: 'Agent CLI Configuration',
    description: 'Configuration schema for Agent CLI tool',
    type: 'object',
    properties: {
      $schema: {
        type: 'string',
        description: 'JSON Schema reference'
      },
      project: {
        type: 'object',
        description: 'Project configuration',
        properties: {
          name: {
            type: 'string',
            description: 'Project name',
            minLength: 1,
            maxLength: 100
          },
          description: {
            type: 'string',
            description: 'Project description',
            minLength: 10,
            maxLength: 1000
          },
          type: {
            type: 'string',
            description: 'Project type',
            enum: ['web-app', 'api-service', 'cli-tool', 'library', 'mobile-app', 'desktop-app']
          },
          techStack: {
            type: 'array',
            description: 'Technology stack',
            items: {
              type: 'string',
              enum: ['react', 'vue', 'angular', 'svelte', 'nextjs', 'nuxt', 'express', 'nestjs', 'fastify', 'typescript', 'javascript', 'tailwind', 'bootstrap', 'material-ui', 'antd', 'jest', 'vitest', 'cypress', 'puppeteer']
            },
            minItems: 1,
            maxItems: 10
          },
          version: {
            type: 'string',
            description: 'Project version',
            default: '1.0.0'
          },
          author: {
            type: 'string',
            description: 'Project author'
          },
          repository: {
            type: 'string',
            description: 'Repository URL',
            format: 'uri'
          },
          license: {
            type: 'string',
            description: 'License type'
          }
        },
        required: ['name', 'description', 'type', 'techStack']
      },
      agent: {
        type: 'object',
        description: 'Agent configuration',
        properties: {
          model: {
            type: 'string',
            description: 'AI model to use',
            enum: ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku', 'gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
            default: 'claude-3-5-sonnet'
          },
          contextMonitoring: {
            type: 'object',
            description: 'Context monitoring configuration',
            properties: {
              enabled: {
                type: 'boolean',
                description: 'Enable context monitoring',
                default: true
              },
              warningThreshold: {
                type: 'number',
                description: 'Warning threshold (0.5-0.95)',
                minimum: 0.5,
                maximum: 0.95,
                default: 0.8
              },
              maxTokens: {
                type: 'number',
                description: 'Maximum tokens limit',
                minimum: 1000,
                maximum: 200000,
                default: 131072
              },
              autoSummarize: {
                type: 'boolean',
                description: 'Enable auto summarization',
                default: true
              },
              summaryInterval: {
                type: 'number',
                description: 'Summary interval (messages)',
                minimum: 1,
                maximum: 100,
                default: 10
              },
              modelSpecificLimits: {
                type: 'object',
                description: 'Model-specific context limits',
                additionalProperties: {
                  type: 'number'
                },
                default: {
                  'claude-3-5-sonnet': 131072,
                  'claude-3-opus': 131072,
                  'claude-3-haiku': 131072,
                  'gpt-4': 128000,
                  'gpt-4-turbo': 128000,
                  'gpt-3.5-turbo': 16385
                }
              }
            },
            default: {}
          },
          initializer: {
            type: 'object',
            description: 'Initializer agent configuration',
            properties: {
              promptTemplate: {
                type: 'string',
                description: 'Prompt template path',
                default: 'templates/init-prompt.md'
              },
              maxFeatures: {
                type: 'number',
                description: 'Maximum number of features to generate',
                minimum: 50,
                maximum: 500,
                default: 200
              },
              featureDetailLevel: {
                type: 'string',
                description: 'Level of detail for features',
                enum: ['low', 'medium', 'high'],
                default: 'high'
              },
              generateTests: {
                type: 'boolean',
                description: 'Whether to generate tests',
                default: true
              },
              generateDocs: {
                type: 'boolean',
                description: 'Whether to generate documentation',
                default: true
              }
            },
            default: {}
          },
          coder: {
            type: 'object',
            description: 'Coder agent configuration',
            properties: {
              promptTemplate: {
                type: 'string',
                description: 'Prompt template path',
                default: 'templates/coder-prompt.md'
              },
              incrementalMode: {
                type: 'boolean',
                description: 'Whether to work in incremental mode',
                default: true
              },
              maxStepsPerSession: {
                type: 'number',
                description: 'Maximum steps per session',
                minimum: 1,
                maximum: 10,
                default: 1
              },
              requireTests: {
                type: 'boolean',
                description: 'Whether tests are required',
                default: true
              },
              autoCommit: {
                type: 'boolean',
                description: 'Whether to auto-commit changes',
                default: true
              },
              reviewChanges: {
                type: 'boolean',
                description: 'Whether to review changes',
                default: true
              }
            },
            default: {}
          },
          maxRetries: {
            type: 'number',
            description: 'Maximum retry attempts',
            minimum: 0,
            maximum: 10,
            default: 3
          },
          retryDelay: {
            type: 'number',
            description: 'Delay between retries in milliseconds',
            minimum: 1000,
            maximum: 60000,
            default: 5000
          },
          temperature: {
            type: 'number',
            description: 'AI temperature setting',
            minimum: 0,
            maximum: 2,
            default: 0.7
          }
        },
        default: {}
      },
      testing: {
        type: 'object',
        description: 'Testing configuration',
        properties: {
          framework: {
            type: 'string',
            description: 'Testing framework',
            enum: ['puppeteer', 'playwright', 'cypress', 'jest'],
            default: 'puppeteer'
          },
          headless: {
            type: 'boolean',
            description: 'Whether to run tests in headless mode',
            default: true
          },
          timeout: {
            type: 'number',
            description: 'Test timeout in milliseconds',
            minimum: 1000,
            maximum: 120000,
            default: 30000
          },
          takeScreenshots: {
            type: 'boolean',
            description: 'Whether to take screenshots',
            default: true
          },
          recordVideo: {
            type: 'boolean',
            description: 'Whether to record video',
            default: false
          },
          viewport: {
            type: 'object',
            description: 'Viewport configuration',
            properties: {
              width: {
                type: 'number',
                description: 'Viewport width',
                default: 1280
              },
              height: {
                type: 'number',
                description: 'Viewport height',
                default: 720
              }
            },
            default: {}
          }
        },
        default: {}
      },
      git: {
        type: 'object',
        description: 'Git configuration',
        properties: {
          autoCommit: {
            type: 'boolean',
            description: 'Whether to auto-commit',
            default: true
          },
          branch: {
            type: 'string',
            description: 'Git branch',
            default: 'main'
          },
          commitTemplate: {
            type: 'string',
            description: 'Commit message template',
            default: 'feat: {description}\n\n- 实现功能: {details}\n- 分类: {category}\n- 测试状态: {testStatus}\n- 相关文件: {files}'
          },
          commitOnTestPass: {
            type: 'boolean',
            description: 'Whether to commit only when tests pass',
            default: true
          },
          tagReleases: {
            type: 'boolean',
            description: 'Whether to tag releases',
            default: false
          }
        },
        default: {}
      },
      server: {
        type: 'object',
        description: 'Web server configuration for visualization dashboard',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Enable web server',
            default: false
          },
          port: {
            type: 'number',
            description: 'Server port',
            minimum: 1,
            maximum: 65535,
            default: 3000
          },
          host: {
            type: 'string',
            description: 'Server host',
            default: 'localhost'
          },
          basePath: {
            type: 'string',
            description: 'Base path for API routes',
            default: '/'
          },
          trustProxy: {
            type: 'boolean',
            description: 'Trust proxy headers',
            default: false
          },
          timeout: {
            type: 'number',
            description: 'Request timeout in milliseconds',
            minimum: 1000,
            maximum: 300000,
            default: 30000
          },
          keepAliveTimeout: {
            type: 'number',
            description: 'Keep-alive timeout in milliseconds',
            minimum: 1000,
            maximum: 120000,
            default: 5000
          },
          maxHeadersCount: {
            type: 'number',
            description: 'Maximum number of headers',
            minimum: 1,
            maximum: 2000,
            default: 2000
          },
          websocket: {
            type: 'object',
            description: 'WebSocket configuration',
            properties: {
              enabled: {
                type: 'boolean',
                description: 'Enable WebSocket',
                default: true
              },
              path: {
                type: 'string',
                description: 'WebSocket endpoint path',
                default: '/ws'
              },
              pingInterval: {
                type: 'number',
                description: 'Ping interval in milliseconds',
                minimum: 1000,
                maximum: 60000,
                default: 30000
              },
              maxConnections: {
                type: 'number',
                description: 'Maximum WebSocket connections',
                minimum: 1,
                maximum: 1000,
                default: 100
              },
              reconnectAttempts: {
                type: 'number',
                description: 'Reconnection attempts',
                minimum: 0,
                maximum: 10,
                default: 3
              },
              reconnectDelay: {
                type: 'number',
                description: 'Reconnection delay in milliseconds',
                minimum: 1000,
                maximum: 10000,
                default: 2000
              }
            },
            default: {}
          },
          staticFiles: {
            type: 'object',
            description: 'Static files configuration',
            properties: {
              enabled: {
                type: 'boolean',
                description: 'Enable static file serving',
                default: true
              },
              directory: {
                type: 'string',
                description: 'Static files directory',
                default: 'public'
              },
              maxAge: {
                type: 'number',
                description: 'Cache max age in seconds',
                minimum: 0,
                maximum: 31536000,
                default: 86400
              },
              index: {
                type: 'boolean',
                description: 'Serve index.html',
                default: true
              },
              fallback: {
                type: 'string',
                description: 'Fallback file for SPA routing'
              }
            },
            default: {}
          },
          cors: {
            type: 'object',
            description: 'CORS configuration',
            properties: {
              enabled: {
                type: 'boolean',
                description: 'Enable CORS',
                default: true
              },
              origin: {
                type: ['string', 'array'],
                description: 'Allowed origins',
                default: '*'
              },
              methods: {
                type: 'array',
                description: 'Allowed HTTP methods',
                items: { type: 'string' },
                default: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
              },
              allowedHeaders: {
                type: 'array',
                description: 'Allowed headers',
                items: { type: 'string' },
                default: ['Content-Type', 'Authorization']
              },
              credentials: {
                type: 'boolean',
                description: 'Allow credentials',
                default: false
              },
              maxAge: {
                type: 'number',
                description: 'Preflight cache duration in seconds',
                minimum: 0,
                maximum: 86400,
                default: 86400
              }
            },
            default: {}
          },
          compression: {
            type: 'object',
            description: 'Compression configuration',
            properties: {
              enabled: {
                type: 'boolean',
                description: 'Enable compression',
                default: true
              },
              threshold: {
                type: 'number',
                description: 'Minimum response size to compress in bytes',
                minimum: 0,
                maximum: 1048576,
                default: 1024
              },
              level: {
                type: 'number',
                description: 'Compression level (0-9)',
                minimum: -1,
                maximum: 9,
                default: 6
              }
            },
            default: {}
          },
          security: {
            type: 'object',
            description: 'Security configuration',
            properties: {
              helmet: {
                type: 'boolean',
                description: 'Enable Helmet security headers',
                default: true
              },
              rateLimit: {
                type: 'object',
                description: 'Rate limiting configuration',
                properties: {
                  enabled: {
                    type: 'boolean',
                    description: 'Enable rate limiting',
                    default: true
                  },
                  windowMs: {
                    type: 'number',
                    description: 'Time window in milliseconds',
                    minimum: 60000,
                    maximum: 3600000,
                    default: 900000
                  },
                  max: {
                    type: 'number',
                    description: 'Maximum requests per window',
                    minimum: 1,
                    maximum: 1000,
                    default: 100
                  }
                },
                default: {}
              },
              xssFilter: {
                type: 'boolean',
                description: 'Enable XSS filter',
                default: true
              },
              noSniff: {
                type: 'boolean',
                description: 'Enable no-sniff',
                default: true
              },
              hidePoweredBy: {
                type: 'boolean',
                description: 'Hide X-Powered-By header',
                default: true
              }
            },
            default: {}
          },
          logging: {
            type: 'object',
            description: 'Server logging configuration',
            properties: {
              enabled: {
                type: 'boolean',
                description: 'Enable server logging',
                default: true
              },
              level: {
                type: 'string',
                description: 'Log level',
                enum: ['error', 'warn', 'info', 'debug'],
                default: 'info'
              },
              format: {
                type: 'string',
                description: 'Log format',
                enum: ['combined', 'common', 'dev', 'short', 'tiny'],
                default: 'combined'
              },
              file: {
                type: 'string',
                description: 'Log file path'
              },
              maxSize: {
                type: 'number',
                description: 'Maximum log file size in bytes',
                minimum: 1048576,
                maximum: 1073741824,
                default: 10485760
              }
            },
            default: {}
          }
        },
        default: {}
      },
      paths: {
        type: 'object',
        description: 'Path configuration',
        properties: {
          progressFile: {
            type: 'string',
            description: 'Progress file path',
            default: 'claude-progress.txt'
          },
          featureListFile: {
            type: 'string',
            description: 'Feature list file path',
            default: 'feature-list.json'
          },
          configFile: {
            type: 'string',
            description: 'Config file path',
            default: 'agent.config.json'
          },
          logsDir: {
            type: 'string',
            description: 'Logs directory',
            default: 'logs'
          }
        },
        default: {}
      },
      features: {
        type: 'object',
        description: 'Feature flags',
        properties: {
          enableProgressTracking: {
            type: 'boolean',
            description: 'Enable progress tracking',
            default: true
          },
          enableAutoTesting: {
            type: 'boolean',
            description: 'Enable auto testing',
            default: true
          },
          enableGitIntegration: {
            type: 'boolean',
            description: 'Enable Git integration',
            default: true
          },
          enableErrorRecovery: {
            type: 'boolean',
            description: 'Enable error recovery',
            default: true
          }
        },
        default: {}
      }
    },
    required: ['project'],
    additionalProperties: false
  }
}