#!/usr/bin/env node

/**
 * CLI功能测试
 * 测试agent-cli serve命令的实际运行
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync, existsSync, unlinkSync, rmdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_PORT = 3005
const TEST_URL = `http://localhost:${TEST_PORT}`
const CONFIG_FILE = join(__dirname, 'test-cli.config.json')

let serverProcess = null

/**
 * 清理函数
 */
function cleanup() {
  // 停止服务器进程
  if (serverProcess) {
    serverProcess.kill('SIGTERM')
    serverProcess = null
  }

  // 清理文件
  try {
    const files = [
      join(__dirname, 'public', 'index.html'),
      join(__dirname, 'test-cli.config.json')
    ]
    const dirs = [
      join(__dirname, 'public')
    ]

    files.forEach(file => {
      if (existsSync(file)) unlinkSync(file)
    })

    dirs.forEach(dir => {
      if (existsSync(dir)) {
        try { rmdirSync(dir) } catch {}
      }
    })
  } catch (error) {
    // 忽略清理错误
  }
}

/**
 * 等待服务器启动
 */
function waitForServer(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    const checkInterval = 500

    const checkServer = async () => {
      try {
        const response = await fetch(`${TEST_URL}/health`)
        if (response.status === 200) {
          resolve(true)
          return
        }
      } catch {
        // 服务器未启动，继续等待
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`服务器启动超时 (${timeout}ms)`))
        return
      }

      setTimeout(checkServer, checkInterval)
    }

    checkServer()
  })
}

/**
 * 测试HTTP端点
 */
async function testEndpoints() {
  const tests = []

  // 测试健康检查
  try {
    const response = await fetch(`${TEST_URL}/health`)
    const data = await response.json()
    tests.push({
      name: '健康检查',
      passed: response.status === 200 && data.status === 'healthy',
      error: response.status !== 200 ? `状态码: ${response.status}` : null
    })
  } catch (error) {
    tests.push({
      name: '健康检查',
      passed: false,
      error: error.message
    })
  }

  // 测试API版本
  try {
    const response = await fetch(`${TEST_URL}/api/version`)
    const data = await response.json()
    tests.push({
      name: 'API版本',
      passed: response.status === 200 && data.name === 'agent-cli',
      error: response.status !== 200 ? `状态码: ${response.status}` : null
    })
  } catch (error) {
    tests.push({
      name: 'API版本',
      passed: false,
      error: error.message
    })
  }

  // 测试静态文件
  try {
    const response = await fetch(TEST_URL)
    const text = await response.text()
    tests.push({
      name: '静态文件服务',
      passed: response.status === 200 &&
              response.headers.get('content-type')?.includes('text/html') &&
              text.includes('<!DOCTYPE html>'),
      error: response.status !== 200 ? `状态码: ${response.status}` : null
    })
  } catch (error) {
    tests.push({
      name: '静态文件服务',
      passed: false,
      error: error.message
    })
  }

  return tests
}

/**
 * 主测试函数
 */
async function runCLITest() {
  console.log('🔧 开始CLI功能测试')
  console.log(`📡 测试URL: ${TEST_URL}`)

  // 注册清理函数
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
  process.on('exit', cleanup)

  try {
    // 1. 启动服务器
    console.log('\n1. 🚀 启动agent-cli服务器...')

    serverProcess = spawn('node', [
      'dist/cli/index.js',
      'serve',
      '--config', CONFIG_FILE,
      '--port', TEST_PORT.toString()
    ], {
      stdio: 'pipe',
      cwd: __dirname
    })

    // 收集输出
    let serverOutput = ''
    serverProcess.stdout.on('data', (data) => {
      serverOutput += data.toString()
      // 显示服务器启动信息
      if (data.toString().includes('🚀 agent-cli 可视化服务器已启动！')) {
        console.log('  服务器启动信息已显示')
      }
    })

    serverProcess.stderr.on('data', (data) => {
      const text = data.toString()
      // 过滤掉日志信息，只显示错误
      if (!text.includes('[INFO]') && !text.includes('[DEBUG]')) {
        console.error('  服务器错误:', text.trim())
      }
    })

    serverProcess.on('error', (error) => {
      console.error('  启动服务器失败:', error)
      cleanup()
      process.exit(1)
    })

    // 2. 等待服务器启动
    console.log('\n2. ⏳ 等待服务器启动...')
    try {
      await waitForServer(8000)
      console.log('  ✅ 服务器已启动')
    } catch (error) {
      console.error(`  ❌ ${error.message}`)
      console.log('  服务器输出:', serverOutput)
      cleanup()
      process.exit(1)
    }

    // 3. 测试端点
    console.log('\n3. 🌐 测试服务器端点...')
    const testResults = await testEndpoints()

    let allPassed = true
    testResults.forEach(result => {
      if (result.passed) {
        console.log(`  ✅ ${result.name}`)
      } else {
        console.log(`  ❌ ${result.name}: ${result.error}`)
        allPassed = false
      }
    })

    // 4. 显示服务器输出摘要
    console.log('\n4. 📋 服务器输出摘要:')
    const lines = serverOutput.split('\n')
    const relevantLines = lines.filter(line =>
      line.includes('🚀') ||
      line.includes('📊') ||
      line.includes('🔌') ||
      line.includes('📈') ||
      line.includes('❤️')
    )
    if (relevantLines.length > 0) {
      relevantLines.forEach(line => console.log(`  ${line.trim()}`))
    }

    // 5. 停止服务器
    console.log('\n5. 🛑 停止服务器...')
    cleanup()

    // 6. 汇总结果
    console.log('\n' + '='.repeat(50))
    console.log('📊 CLI功能测试结果:')
    const passedTests = testResults.filter(t => t.passed).length
    const totalTests = testResults.length
    console.log(`✅ 通过的测试: ${passedTests}/${totalTests}`)

    if (allPassed) {
      console.log('\n🎉 CLI功能测试全部通过！')
      console.log('💡 agent-cli serve命令功能正常')
      process.exit(0)
    } else {
      console.log('\n❌ CLI功能测试失败')
      process.exit(1)
    }

  } catch (error) {
    console.error('\n💥 测试过程中发生错误:', error)
    cleanup()
    process.exit(1)
  }
}

// 运行测试
runCLITest()