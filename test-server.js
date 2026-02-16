/**
 * 测试Web服务器功能
 */

import { createServer } from './dist/server/index.js'
import { loadConfig } from './dist/config/loader.js'
import { readFileSync } from 'fs'

async function testServer() {
  console.log('🧪 开始测试Web服务器...')

  try {
    // 使用loadConfig加载配置（它会合并默认值）
    const config = await loadConfig('./test-server-config.json', process.cwd())

    console.log('📋 配置加载成功:', {
      port: config.server.port,
      host: config.server.host,
      enabled: config.server.enabled
    })

    // 创建服务器
    console.log('🚀 正在创建服务器...')
    const server = await createServer({
      config,
      cwd: process.cwd()
    })

    console.log('✅ 服务器创建成功')

    // 启动服务器
    console.log('⚡️ 正在启动服务器...')
    await server.start()

    console.log('🎉 服务器启动成功!')
    console.log('📊 访问地址:', server.getUrl())
    console.log('🔌 WebSocket:', server.getUrl() + config.server.websocket.path)
    console.log('❤️  健康检查:', server.getUrl() + '/health')

    // 10秒后停止服务器
    setTimeout(async () => {
      console.log('\n🛑 10秒后停止服务器...')
      await server.stop()
      console.log('✅ 服务器已停止')
      process.exit(0)
    }, 10000)

  } catch (error) {
    console.error('❌ 测试失败:', error)
    process.exit(1)
  }
}

// 运行测试
testServer()