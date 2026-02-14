# 自动化测试框架使用指南

## 概述

长效运行智能体CLI工具集成了基于Puppeteer的自动化测试框架，支持端到端测试、截图捕获和详细报告生成。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 创建测试套件

在 `tests/` 目录下创建JSON格式的测试套件文件：

```json
{
  "id": "user-login",
  "name": "用户登录测试",
  "description": "测试用户登录流程",
  "tags": ["login", "critical"],
  "steps": [
    {
      "id": "navigate-to-login",
      "name": "导航到登录页面",
      "type": "navigate",
      "params": {
        "url": "https://your-app.com/login",
        "waitUntil": "networkidle0"
      }
    },
    {
      "id": "fill-credentials",
      "name": "输入凭据",
      "type": "type",
      "params": {
        "selector": "#username",
        "text": "test@example.com"
      }
    }
  ]
}
```

### 3. 运行测试

```bash
# 运行所有测试套件
node bin/agent-cli test --suites "tests/*.json" --url "https://your-app.com"

# 显示浏览器界面（调试用）
node bin/agent-cli test --suites "tests/login.json" --no-headless

# 生成HTML报告
node bin/agent-cli test --suites "tests/*.json" --html --verbose

# 使用配置文件
node bin/agent-cli test --config test-config.json
```

## 测试步骤类型

### 1. 导航 (navigate)
```json
{
  "type": "navigate",
  "params": {
    "url": "https://example.com",
    "waitUntil": "networkidle0",
    "waitForSelector": "#app"
  }
}
```

### 2. 点击 (click)
```json
{
  "type": "click",
  "params": {
    "selector": "button.submit",
    "waitAfter": 1000
  }
}
```

### 3. 输入 (type)
```json
{
  "type": "type",
  "params": {
    "selector": "input.email",
    "text": "user@example.com",
    "clear": true,
    "delay": 100,
    "pressEnter": true
  }
}
```

### 4. 等待 (wait)
```json
{
  "type": "wait",
  "params": {
    "duration": 2000,
    "selector": ".loading",
    "hidden": true
  }
}
```

### 5. 断言 (assert)
```json
{
  "type": "assert",
  "params": {
    "assertType": "visible",
    "selector": ".success-message",
    "timeout": 5000
  }
}
```

支持断言类型：
- `visible` - 元素可见
- `hidden` - 元素隐藏
- `text` - 文本内容匹配
- `count` - 元素数量匹配
- `url` - URL匹配

### 6. 自定义 (custom)
```json
{
  "type": "custom",
  "params": {
    "script": "() => console.log('Custom script executed')"
  }
}
```

## 配置选项

### 命令行选项

| 选项 | 描述 | 默认值 |
|------|------|--------|
| `--suites <pattern>` | 测试套件路径（glob模式） | `tests/**/*.json` |
| `--config <path>` | 测试配置文件路径 | - |
| `--url <url>` | 基础URL | - |
| `--no-headless` | 显示浏览器界面 | `false` |
| `--browser-path <path>` | 浏览器可执行文件路径 | - |
| `--timeout <ms>` | 默认超时时间 | `30000` |
| `--continue-on-failure` | 失败时继续执行 | `false` |
| `--screenshot-dir <dir>` | 截图保存目录 | `./test-screenshots` |
| `--report-dir <dir>` | 报告保存目录 | `./test-reports` |
| `--html` | 生成HTML报告 | `false` |
| `--verbose` | 详细输出模式 | `false` |
| `--parallel <count>` | 并行执行数量 | `1` |
| `--retries <count>` | 最大重试次数 | `0` |
| `--format <format>` | 输出格式 | `both` |
| `--history` | 保存历史记录 | `false` |

### 配置文件示例

创建 `test-config.json`：

```json
{
  "headless": true,
  "timeout": 30000,
  "stopOnFailure": false,
  "screenshotDir": "./test-screenshots",
  "screenshotOnSuccess": false,
  "reportDir": "./test-reports",
  "generateHtmlReport": true,
  "verbose": false,
  "maxRetries": 2,
  "parallel": false,
  "parallelCount": 1,
  "baseUrl": "https://your-app.com",
  "cookies": [
    {
      "name": "session_id",
      "value": "your-token",
      "domain": "your-app.com"
    }
  ]
}
```

## 测试报告

### JSON报告
包含完整的测试结果、时间戳、错误信息和截图路径。

### HTML报告
交互式HTML报告，包含：
- 测试结果摘要
- 套件状态可视化
- 失败步骤详情
- 截图查看
- 执行时间线

### 报告目录结构
```
test-reports/
├── test-report-2026-02-14T10-30-00-000Z.json
├── test-report-2026-02-14T10-30-00-000Z.html
├── history/
│   └── history-2026-02-14T10-30-00-000Z.json
└── screenshots/
    ├── login-success_2026-02-14T10-30-01-000Z.png
    └── login-failed_2026-02-14T10-30-02-000Z.png
```

## 最佳实践

### 1. 选择器策略
- 优先使用 `data-testid` 属性
- 避免使用易变的CSS类名
- 使用有意义的ID和名称

### 2. 等待策略
- 使用 `waitForSelector` 等待元素
- 避免硬编码的 `setTimeout`
- 合理设置超时时间

### 3. 错误处理
- 关键步骤设置 `critical: true`
- 使用重试机制处理不稳定测试
- 失败时自动截图

### 4. 测试组织
- 按功能模块分组测试套件
- 使用标签进行分类
- 创建冒烟测试套件

### 5. 性能优化
- 复用浏览器实例
- 并行执行独立测试
- 清理测试数据

## 示例项目

### 登录测试套件
```bash
# 创建测试目录
mkdir -p tests

# 运行示例测试
node bin/agent-cli test --suites "tests/example-login.json" --url "https://your-app.com"
```

### 配置文件
```bash
# 创建配置文件
cp test-config.example.json test-config.json
# 编辑配置文件
vim test-config.json

# 使用配置文件运行测试
node bin/agent-cli test --config test-config.json
```

## 故障排除

### 常见问题

1. **浏览器启动失败**
   - 检查Puppeteer安装
   - 验证浏览器路径
   - 确保有足够的权限

2. **选择器找不到**
   - 检查页面是否加载完成
   - 验证选择器是否正确
   - 增加等待时间

3. **截图失败**
   - 检查目录权限
   - 验证文件路径
   - 确保有足够的磁盘空间

4. **测试不稳定**
   - 增加重试次数
   - 优化等待策略
   - 检查网络稳定性

### 调试模式
```bash
node bin/agent-cli test --suites "tests/*.json" --debug --no-headless
```

## 集成到CI/CD

### GitHub Actions 示例
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: node bin/agent-cli test --suites "tests/*.json" --url "${{ secrets.APP_URL }}" --html
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-reports
          path: test-reports/
```

## API参考

### TestManager 类
```typescript
const manager = new TestManager(config);
await manager.loadTestSuites(['tests/login.json']);
const report = await manager.runAllTests();
await manager.saveReport(report, './reports');
```

### PuppeteerRunner 类
```typescript
const runner = new PuppeteerRunner(config);
await runner.initialize();
const result = await runner.executeStep(step);
await runner.cleanup();
```

## 下一步计划

1. 添加API测试支持
2. 集成性能监控
3. 添加可视化测试编辑器
4. 支持测试数据驱动
5. 集成到智能体开发流程