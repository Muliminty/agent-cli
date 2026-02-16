/**
 * 测试配置合并
 */

import { loadConfig } from './dist/config/loader.js'

async function testConfig() {
  console.log('测试配置合并...')

  try {
    // 加载配置
    const config = await loadConfig('./test-server-config.json', process.cwd())

    console.log('配置加载成功:')
    console.log('server.enabled:', config.server.enabled)
    console.log('server.port:', config.server.port)
    console.log('server.host:', config.server.host)
    console.log('server.basePath:', config.server.basePath)
    console.log('server.websocket.enabled:', config.server.websocket.enabled)
    console.log('server.websocket.path:', config.server.websocket.path)

    // 测试健康检查路径
    const healthPath = config.server.basePath + '/health'
    console.log('健康检查路径:', healthPath)

  } catch (error) {
    console.error('测试失败:', error)
  }
}

testConfig()