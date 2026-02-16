/**
 * serve命令实现 - 启动Web服务器提供可视化仪表板
 * 设计思路：集成Express服务器到现有CLI，提供实时监控和API服务
 */

import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { createDevServer } from '../../server/index.js'
import chalk from 'chalk'
import boxen from 'boxen'
import { default as open } from 'open'
import fs from 'fs'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const logger = createLogger('serve')

/**
 * 处理serve命令
 */
export async function handleServeCommand(options: any): Promise<void> {
  try {
    logger.info('正在启动Web服务器...')

    // 加载配置
    const config = await loadConfig(options.config, options.cwd)

    // 合并命令行选项到配置
    const mergedConfig = mergeOptionsWithConfig(config, options)

    // 创建public目录（如果不存在）
    const staticDir = join(options.cwd || process.cwd(), mergedConfig.server.staticFiles.directory)
    if (!existsSync(staticDir)) {
      logger.info(`创建静态文件目录: ${staticDir}`)
      mkdirSync(staticDir, { recursive: true })
    }

    // 创建服务器实例
    const server = await createDevServer(mergedConfig, options.cwd)

    // 启动服务器
    await server.start()

    const serverUrl = server.getUrl()

    // 显示服务器信息
    displayServerInfo(serverUrl, mergedConfig.server)

    // 自动打开浏览器
    if (options.open) {
      try {
        await open(serverUrl)
        logger.info('已自动打开浏览器')
      } catch (error) {
        logger.warn('无法自动打开浏览器', { error })
      }
    }

    // 设置进程信号处理
    setupSignalHandlers(server)

    // 如果启用watch模式，设置文件监控
    if (options.watch) {
      setupFileWatcher(server, options.cwd).catch(error => {
        logger.error('文件监控启动失败', { error })
      })
    }

  } catch (error) {
    logger.error('启动服务器失败', { error })
    throw error
  }
}

/**
 * 合并命令行选项到配置
 */
function mergeOptionsWithConfig(config: any, options: any): any {
  const merged = JSON.parse(JSON.stringify(config))

  // 更新服务器配置
  if (options.port) {
    merged.server.port = parseInt(options.port, 10)
  }

  if (options.host) {
    merged.server.host = options.host
  }

  if (options.basePath) {
    merged.server.basePath = options.basePath
  }

  if (options.websocketPath) {
    merged.server.websocket.path = options.websocketPath
  }

  if (options.staticDir) {
    merged.server.staticFiles.directory = options.staticDir
  }

  // 处理布尔选项
  if (options.websocket === false) {
    merged.server.websocket.enabled = false
  }

  if (options.static === false) {
    merged.server.staticFiles.enabled = false
  }

  if (options.cors === false) {
    merged.server.cors.enabled = false
  }

  if (options.compression === false) {
    merged.server.compression.enabled = false
  }

  // 确保服务器启用
  merged.server.enabled = true

  return merged
}

/**
 * 显示服务器信息
 */
function displayServerInfo(serverUrl: string, serverConfig: any): void {
  const info = boxen(
    chalk.bold.green('🚀 agent-cli 可视化服务器已启动！\n\n') +
    chalk.cyan('📊 仪表板: ') + chalk.white(serverUrl) + '\n' +
    chalk.cyan('🔌 WebSocket: ') + chalk.white(`${serverUrl}${serverConfig.websocket.path}`) + '\n' +
    chalk.cyan('📈 API端点: ') + chalk.white(`${serverUrl}/api/version`) + '\n' +
    chalk.cyan('❤️  健康检查: ') + chalk.white(`${serverUrl}/health`) + '\n' +
    chalk.cyan('📁 静态文件: ') + chalk.white(serverConfig.staticFiles.directory) + '\n' +
    chalk.cyan('🔧 配置: ') + chalk.white(`端口: ${serverConfig.port}, 主机: ${serverConfig.host}`) + '\n\n' +
    chalk.yellow('按 Ctrl+C 停止服务器'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      backgroundColor: '#1a1a1a'
    }
  )

  console.log(info)
}

/**
 * 设置信号处理
 */
function setupSignalHandlers(server: any): void {
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal} 信号，正在停止服务器...`)
    try {
      await server.stop()
      logger.info('服务器已停止')
      process.exit(0)
    } catch (error) {
      logger.error('停止服务器失败', { error })
      process.exit(1)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // 优雅关闭
  process.on('beforeExit', async () => {
    logger.info('进程即将退出，正在清理资源...')
    try {
      await server.stop()
    } catch (error) {
      logger.error('清理资源失败', { error })
    }
  })
}

/**
 * 设置文件监控（watch模式）
 */
async function setupFileWatcher(server: any, cwd?: string): Promise<void> {
  const projectCwd = cwd || process.cwd()

  try {
    // 加载项目配置
    const config = await loadConfig(undefined, projectCwd)

    // 获取要监控的文件路径
    const filesToWatch = [
      { path: config.paths.progressFile, eventType: 'progress' },
      { path: config.paths.featureListFile, eventType: 'features' },
      { path: config.paths.configFile, eventType: 'config' }
    ]

    logger.info('文件监控模式已启用', {
      cwd: projectCwd,
      files: filesToWatch.map(f => f.path)
    })

    // 存储fs.watch实例，用于后续清理
    const watchers: fs.FSWatcher[] = []
    // 防抖计时器映射：filePath -> timer
    const debounceTimers = new Map<string, NodeJS.Timeout>()
    // 防抖延迟（毫秒）
    const DEBOUNCE_DELAY = 500

    filesToWatch.forEach(({ path, eventType }) => {
      const fullPath = join(projectCwd, path)

      // 检查文件是否存在，不存在则跳过（但可能稍后创建）
      if (!existsSync(fullPath)) {
        logger.debug(`监控的文件不存在，跳过: ${path}`)
        return
      }

      try {
        const watcher = fs.watch(fullPath, (eventTypeName, filename) => {
          if (filename) {
            logger.debug(`文件变化检测到`, {
              file: path,
              event: eventTypeName,
              filename
            })

            // 防抖处理：清除之前的计时器
            const existingTimer = debounceTimers.get(fullPath)
            if (existingTimer) {
              clearTimeout(existingTimer)
            }

            // 设置新的计时器
            const timer = setTimeout(async () => {
              try {
                logger.info(`文件变化已处理`, { file: path, eventType })

                // 广播文件变化事件
                if (server.broadcastToSubscribers) {
                  const fileStats = await fs.promises.stat(fullPath).catch(() => null)

                  server.broadcastToSubscribers(eventType, {
                    file: path,
                    event: eventTypeName,
                    timestamp: Date.now(),
                    size: fileStats?.size || 0,
                    modified: fileStats?.mtime?.getTime() || null
                  })

                  // 如果是进度文件或功能列表文件，还可以广播具体的数据更新
                  if (eventType === 'progress' || eventType === 'features') {
                    try {
                      const content = await fs.promises.readFile(fullPath, 'utf-8')
                      server.broadcastToSubscribers(`${eventType}_data`, {
                        file: path,
                        data: eventType === 'features' ? JSON.parse(content) : content,
                        timestamp: Date.now()
                      })
                    } catch (parseError) {
                      logger.warn(`读取文件内容失败，无法广播详细数据`, {
                        file: path,
                        error: parseError
                      })
                    }
                  }
                }
              } catch (error) {
                logger.error(`处理文件变化事件失败`, { file: path, error })
              } finally {
                // 清理计时器
                debounceTimers.delete(fullPath)
              }
            }, DEBOUNCE_DELAY)

            debounceTimers.set(fullPath, timer)
          }
        })

        watchers.push(watcher)
        logger.debug(`开始监控文件`, { file: path, fullPath })

      } catch (error) {
        logger.error(`无法监控文件`, { file: path, error })
      }
    })

    // 提供清理函数
    const cleanup = () => {
      logger.info('清理文件监控器')
      watchers.forEach(watcher => watcher.close())
      debounceTimers.forEach(timer => clearTimeout(timer))
      debounceTimers.clear()
    }

    // 注册清理函数到服务器实例（如果可能）
    if (server.cleanupWatchers) {
      server.cleanupWatchers.push(cleanup)
    } else {
      server.cleanupWatchers = [cleanup]
    }

    // 监听进程退出信号进行清理
    const cleanupOnExit = () => {
      cleanup()
      process.exit(0)
    }

    process.on('SIGINT', cleanupOnExit)
    process.on('SIGTERM', cleanupOnExit)

    logger.info(`文件监控已启动，监控 ${watchers.length} 个文件`)

  } catch (error) {
    logger.error('设置文件监控失败', { error })
    throw error
  }
}

/**
 * 生成默认的仪表板HTML
 */
export function generateDefaultDashboard(cwd: string): string {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>agent-cli 可视化仪表板</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 2rem;
        }

        .header {
            text-align: center;
            margin-bottom: 3rem;
            color: white;
        }

        .header h1 {
            font-size: 3rem;
            margin-bottom: 0.5rem;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }

        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }

        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            margin-bottom: 3rem;
        }

        .card {
            background: white;
            border-radius: 12px;
            padding: 2rem;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.15);
        }

        .card h2 {
            color: #667eea;
            margin-bottom: 1rem;
            font-size: 1.5rem;
        }

        .card p {
            color: #666;
            line-height: 1.6;
        }

        .status-badge {
            display: inline-block;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
            margin-top: 1rem;
        }

        .status-ready {
            background: #10b981;
            color: white;
        }

        .status-waiting {
            background: #f59e0b;
            color: white;
        }

        .progress-bar {
            height: 8px;
            background: #e5e7eb;
            border-radius: 4px;
            margin: 1rem 0;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea, #764ba2);
            border-radius: 4px;
            transition: width 0.5s ease;
        }

        .actions {
            display: flex;
            gap: 1rem;
            margin-top: 2rem;
        }

        .btn {
            padding: 0.8rem 1.5rem;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
        }

        .btn-primary {
            background: #667eea;
            color: white;
        }

        .btn-primary:hover {
            background: #5a67d8;
        }

        .btn-secondary {
            background: #f3f4f6;
            color: #374151;
        }

        .btn-secondary:hover {
            background: #e5e7eb;
        }

        .footer {
            text-align: center;
            color: white;
            opacity: 0.8;
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid rgba(255,255,255,0.1);
        }

        .connection-status {
            position: fixed;
            top: 1rem;
            right: 1rem;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: bold;
            z-index: 1000;
        }

        .connected {
            background: #10b981;
            color: white;
        }

        .disconnected {
            background: #ef4444;
            color: white;
        }

        @media (max-width: 768px) {
            .container {
                padding: 1rem;
            }

            .header h1 {
                font-size: 2rem;
            }

            .dashboard-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="connection-status disconnected" id="connectionStatus">
        正在连接...
    </div>

    <div class="container">
        <div class="header">
            <h1>🚀 agent-cli 可视化仪表板</h1>
            <p>实时监控项目进度、功能状态和测试结果</p>
        </div>

        <div class="dashboard-grid">
            <div class="card">
                <h2>📊 项目概览</h2>
                <p>查看项目整体进度和健康状态</p>
                <div class="progress-bar">
                    <div class="progress-fill" id="overallProgress" style="width: 0%"></div>
                </div>
                <div class="status-badge status-waiting" id="projectStatus">加载中...</div>
            </div>

            <div class="card">
                <h2>🔧 功能管理</h2>
                <p>跟踪功能实现进度和状态</p>
                <div id="featureStats">
                    <p>总计: <span id="totalFeatures">0</span></p>
                    <p>已完成: <span id="completedFeatures">0</span></p>
                    <p>进行中: <span id="inProgressFeatures">0</span></p>
                </div>
            </div>

            <div class="card">
                <h2>🧪 测试结果</h2>
                <p>查看最新的自动化测试结果</p>
                <div id="testStats">
                    <p>通过率: <span id="testPassRate">0%</span></p>
                    <p>总测试数: <span id="totalTests">0</span></p>
                    <p>最后运行: <span id="lastTestRun">-</span></p>
                </div>
            </div>

            <div class="card">
                <h2>📈 实时更新</h2>
                <p>通过WebSocket接收实时数据更新</p>
                <div id="realtimeInfo">
                    <p>连接状态: <span id="wsStatus">断开</span></p>
                    <p>最后更新: <span id="lastUpdate">-</span></p>
                    <p>活动连接: <span id="activeConnections">0</span></p>
                </div>
            </div>
        </div>

        <div class="actions">
            <a href="/api/version" class="btn btn-primary" target="_blank">查看API文档</a>
            <a href="/health" class="btn btn-secondary" target="_blank">健康检查</a>
            <button class="btn btn-secondary" onclick="refreshData()">刷新数据</button>
        </div>

        <div class="footer">
            <p>agent-cli v1.0.0 • 使用 <code>agent-cli serve</code> 启动</p>
            <p>仪表板正在开发中，更多功能即将推出</p>
        </div>
    </div>

    <script>
        // WebSocket连接
        let ws = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;

        function connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = protocol + '//' + window.location.host + '/ws';

            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('WebSocket连接已建立');
                updateConnectionStatus(true);
                reconnectAttempts = 0;

                // 发送欢迎消息
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    data: { events: ['progress', 'features', 'tests'] }
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    handleWebSocketMessage(message);
                } catch (error) {
                    console.error('处理WebSocket消息失败:', error);
                }
            };

            ws.onclose = () => {
                console.log('WebSocket连接已关闭');
                updateConnectionStatus(false);

                // 尝试重连
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    const delay = Math.min(1000 * reconnectAttempts, 10000);
                    console.log(\`\${reconnectAttempts}秒后尝试重连...\`);
                    setTimeout(connectWebSocket, delay);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket错误:', error);
            };
        }

        function handleWebSocketMessage(message) {
            const { type, data } = message;

            switch (type) {
                case 'welcome':
                    console.log('收到欢迎消息:', data);
                    break;
                case 'progress':
                    updateProgress(data);
                    break;
                case 'features':
                    updateFeatures(data);
                    break;
                case 'tests':
                    updateTests(data);
                    break;
                case 'pong':
                    // 心跳响应
                    break;
                default:
                    console.log('收到未知消息类型:', type);
            }

            updateLastUpdate();
        }

        function updateConnectionStatus(connected) {
            const statusElement = document.getElementById('connectionStatus');
            if (connected) {
                statusElement.textContent = '已连接';
                statusElement.className = 'connection-status connected';
            } else {
                statusElement.textContent = '已断开';
                statusElement.className = 'connection-status disconnected';
            }
        }

        function updateProgress(data) {
            const progressElement = document.getElementById('overallProgress');
            const statusElement = document.getElementById('projectStatus');

            if (progressElement && data.progress !== undefined) {
                const progress = Math.round(data.progress * 100);
                progressElement.style.width = progress + '%';
            }

            if (statusElement && data.status) {
                statusElement.textContent = data.status;
                statusElement.className = 'status-badge ' +
                    (data.status === 'healthy' ? 'status-ready' : 'status-waiting');
            }
        }

        function updateFeatures(data) {
            const totalElement = document.getElementById('totalFeatures');
            const completedElement = document.getElementById('completedFeatures');
            const inProgressElement = document.getElementById('inProgressFeatures');

            if (totalElement && data.total !== undefined) {
                totalElement.textContent = data.total;
            }

            if (completedElement && data.completed !== undefined) {
                completedElement.textContent = data.completed;
            }

            if (inProgressElement && data.inProgress !== undefined) {
                inProgressElement.textContent = data.inProgress;
            }
        }

        function updateTests(data) {
            const passRateElement = document.getElementById('testPassRate');
            const totalTestsElement = document.getElementById('totalTests');
            const lastRunElement = document.getElementById('lastTestRun');

            if (passRateElement && data.passRate !== undefined) {
                passRateElement.textContent = Math.round(data.passRate * 100) + '%';
            }

            if (totalTestsElement && data.total !== undefined) {
                totalTestsElement.textContent = data.total;
            }

            if (lastRunElement && data.lastRun) {
                lastRunElement.textContent = new Date(data.lastRun).toLocaleString();
            }
        }

        function updateLastUpdate() {
            const element = document.getElementById('lastUpdate');
            if (element) {
                element.textContent = new Date().toLocaleString();
            }
        }

        function refreshData() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'refresh',
                    data: { timestamp: Date.now() }
                }));
                alert('已发送刷新请求');
            } else {
                alert('WebSocket未连接，无法刷新数据');
            }
        }

        // 初始化
        document.addEventListener('DOMContentLoaded', () => {
            connectWebSocket();

            // 初始加载数据
            fetch('/api/version')
                .then(response => response.json())
                .then(data => {
                    console.log('API版本:', data);
                })
                .catch(error => {
                    console.error('获取API版本失败:', error);
                });
        });

        // 页面可见性变化时重连
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && (!ws || ws.readyState !== WebSocket.OPEN)) {
                connectWebSocket();
            }
        });
    </script>
</body>
</html>
  `

  return html
}

/**
 * 创建默认的仪表板文件
 */
export async function createDefaultDashboard(cwd: string): Promise<void> {
  const staticDir = join(cwd, 'public')
  const dashboardFile = join(staticDir, 'index.html')

  if (!existsSync(dashboardFile)) {
    logger.info('正在创建默认仪表板...')
    const html = generateDefaultDashboard(cwd)
    await import('fs').then(fs => {
      fs.writeFileSync(dashboardFile, html, 'utf-8')
    })
    logger.info(`仪表板已创建: ${dashboardFile}`)
  }
}