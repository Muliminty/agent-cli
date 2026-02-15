/**
 * config/schema.ts 单元测试
 * 设计思路：测试配置验证和合并功能
 */

import { describe, test, expect } from '@jest/globals'
import { validateConfig, mergeConfig, ConfigSchema, DEFAULT_CONFIG } from '../schema.ts'
import type { Config } from '../schema.ts'

describe('配置schema验证', () => {
  test('应该验证有效的配置', () => {
    const validConfig = {
      project: {
        name: '测试项目',
        description: '这是一个用于测试的示例项目，包含完整的功能', // 至少10个字符
        type: 'web-app' as const,
        techStack: ['react', 'typescript']
      },
      agent: {
        model: 'claude-3-opus' as const,
        temperature: 0.7
      }
    }

    const result = validateConfig(validConfig)
    expect(result).toBeDefined()
    expect(result.project.name).toBe('测试项目')
    expect(result.agent.model).toBe('claude-3-opus')
  })

  test('应该拒绝无效的配置', () => {
    const invalidConfig = {
      project: {
        name: 123, // 应该是字符串
        description: '测试',
        type: 'web-app',
        techStack: ['react']
      }
    }

    expect(() => validateConfig(invalidConfig)).toThrow()
  })

  test('应该合并配置，优先使用用户配置', () => {
    const userConfig = {
      project: {
        name: '自定义项目',
        description: '自定义描述',
        type: 'cli-tool' as const,
        techStack: ['typescript']
      },
      agent: {
        temperature: 0.8
      }
    }

    const merged = mergeConfig(userConfig)
    expect(merged.project.name).toBe('自定义项目')
    expect(merged.agent.temperature).toBe(0.8)
    // 未指定的配置应使用默认值
    expect(merged.project.version).toBe(DEFAULT_CONFIG.project.version)
  })

  test('应该深度合并嵌套配置', () => {
    const userConfig = {
      agent: {
        model: 'claude-3-5-sonnet' as const,
        temperature: 0.9
      }
    }

    const merged = mergeConfig(userConfig)
    expect(merged.agent.model).toBe('claude-3-5-sonnet')
    expect(merged.agent.temperature).toBe(0.9)
    // agent的其他属性应保持默认值
    expect(merged.agent.maxRetries).toBe(DEFAULT_CONFIG.agent.maxRetries)
  })

  test('应该处理空配置', () => {
    const merged = mergeConfig({})
    expect(merged).toEqual(DEFAULT_CONFIG)
  })
})

describe('配置schema结构', () => {
  test('ConfigSchema应该正确解析默认配置', () => {
    const result = ConfigSchema.parse(DEFAULT_CONFIG)
    expect(result).toEqual(DEFAULT_CONFIG)
  })

  test('ConfigSchema应该要求必需字段', () => {
    const incompleteConfig = {}
    expect(() => ConfigSchema.parse(incompleteConfig)).toThrow()
  })

  test('DEFAULT_CONFIG应该满足最小描述长度要求', () => {
    // 检查DEFAULT_CONFIG.project.description长度
    console.log('DEFAULT_CONFIG description:', DEFAULT_CONFIG.project.description)
    console.log('DEFAULT_CONFIG description length:', DEFAULT_CONFIG.project.description.length)
    console.log('Full DEFAULT_CONFIG:', JSON.stringify(DEFAULT_CONFIG, null, 2))
    expect(DEFAULT_CONFIG.project.description.length).toBeGreaterThanOrEqual(10)
  })
})