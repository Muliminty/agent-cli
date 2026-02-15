#!/usr/bin/env node

/**
 * Todo应用本地服务器
 * 设计思路：简单的静态文件服务器，支持CORS和缓存控制
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const ROOT_DIR = path.join(__dirname, '..');

// MIME类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

// 默认文件
const DEFAULT_FILES = ['index.html', 'index.htm'];

class StaticServer {
  constructor() {
    this.server = http.createServer(this.handleRequest.bind(this));
    this.setupServer();
  }

  setupServer() {
    this.server.on('error', (error) => {
      console.error('服务器错误:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`端口 ${PORT} 已被占用，请使用其他端口`);
        process.exit(1);
      }
    });

    this.server.on('listening', () => {
      console.log(`服务器运行在: http://${HOST}:${PORT}`);
      console.log(`根目录: ${ROOT_DIR}`);
      console.log('按 Ctrl+C 停止服务器');
    });
  }

  handleRequest(req, res) {
    const parsedUrl = url.parse(req.url);
    let filePath = path.join(ROOT_DIR, parsedUrl.pathname);

    // 记录请求
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

    // 处理根路径
    if (parsedUrl.pathname === '/') {
      this.serveDefaultFile(res);
      return;
    }

    // 安全检查：防止目录遍历攻击
    if (!filePath.startsWith(ROOT_DIR)) {
      this.sendError(res, 403, '禁止访问');
      return;
    }

    // 检查文件是否存在
    fs.stat(filePath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          this.sendError(res, 404, '文件未找到');
        } else {
          this.sendError(res, 500, '服务器错误');
        }
        return;
      }

      // 如果是目录，尝试提供默认文件
      if (stats.isDirectory()) {
        this.serveDirectory(filePath, res);
        return;
      }

      // 提供文件
      this.serveFile(filePath, stats, res);
    });
  }

  serveDefaultFile(res) {
    for (const defaultFile of DEFAULT_FILES) {
      const filePath = path.join(ROOT_DIR, defaultFile);
      if (fs.existsSync(filePath)) {
        this.serveFile(filePath, fs.statSync(filePath), res);
        return;
      }
    }
    this.sendError(res, 404, '未找到默认文件');
  }

  serveDirectory(dirPath, res) {
    for (const defaultFile of DEFAULT_FILES) {
      const filePath = path.join(dirPath, defaultFile);
      if (fs.existsSync(filePath)) {
        this.serveFile(filePath, fs.statSync(filePath), res);
        return;
      }
    }
    this.sendError(res, 403, '目录浏览已禁用');
  }

  serveFile(filePath, stats, res) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // 设置响应头
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 处理OPTIONS请求
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // 读取并发送文件
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      console.error('读取文件错误:', err);
      this.sendError(res, 500, '读取文件错误');
    });

    stream.pipe(res);
  }

  sendError(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`${statusCode} - ${message}\n`);
  }

  start() {
    this.server.listen(PORT, HOST);
  }

  stop() {
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log('服务器已停止');
        resolve();
      });
    });
  }
}

// 启动服务器
const server = new StaticServer();

// 处理进程信号
process.on('SIGINT', () => {
  console.log('\n收到停止信号，正在关闭服务器...');
  server.stop().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('\n收到终止信号，正在关闭服务器...');
  server.stop().then(() => process.exit(0));
});

// 启动服务器
server.start();

// 导出用于测试
module.exports = server;