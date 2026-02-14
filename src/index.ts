/**
 * 长效运行智能体CLI工具 - 主入口文件
 * 设计思路：作为库的入口点，导出所有公共API
 *
 * 注意：CLI可执行文件使用 bin/agent-cli
 * 此文件主要用于库导入场景
 */

import { main } from './cli/index.js'
export { main } from './cli/index.js'
export { createLogger, Logger } from './utils/logger.js'
export { loadConfig, saveConfig } from './config/loader.js'
export { ProgressTracker } from './core/progress/tracker.js'
export { validateConfig, mergeConfig } from './config/schema.js'
export type {
  Feature,
  FeatureList,
  ProjectState,
  ProgressEntry
} from './types/index.js'
export type { Config } from './config/schema.js'

// 版本信息
import pkg from '../package.json' assert { type: 'json' }
export const { version } = pkg

/**
 * 库初始化函数
 */
export function initialize(options?: { debug?: boolean }) {
  console.log('🚀 长效运行智能体CLI工具初始化')
  console.log('📖 版本:', version)
  console.log('💡 使用: agent-cli --help 查看命令列表')

  if (options?.debug) {
    console.log('🔧 调试模式已启用')
  }

  return {
    version,
    help: '使用 agent-cli --help 查看完整命令列表'
  }
}

// 默认导出
export default {
  initialize,
  version,
  main: main
}