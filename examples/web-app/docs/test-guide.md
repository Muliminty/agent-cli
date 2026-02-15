# Todo应用测试指南

本文档提供Todo应用测试的详细指南，包括测试框架介绍、测试套件编写、配置说明和结果分析。

## 测试框架概述

Agent-CLI测试框架是一个基于Puppeteer的端到端测试框架，具有以下特点：

- **声明式测试定义**：使用JSON格式定义测试步骤
- **丰富的操作类型**：支持导航、点击、输入、等待、断言等操作
- **灵活的环境管理**：支持Cookies、LocalStorage、SessionStorage管理
- **强大的结果管理**：支持结果持久化、统计分析和报告生成
- **可扩展性**：支持自定义操作和断言

## 测试套件结构

### 基本结构

一个测试套件文件包含以下部分：

```json
{
  "name": "套件名称",
  "description": "套件描述",
  "version": "1.0.0",
  "timeout": 60000,
  "tests": [
    {
      "name": "测试用例名称",
      "description": "测试用例描述",
      "steps": [
        // 测试步骤数组
      ]
    }
  ]
}
```

### 测试步骤类型

#### 1. navigate - 页面导航
```json
{
  "type": "navigate",
  "url": "http://localhost:3000",
  "name": "导航到首页"
}
```

#### 2. click - 点击元素
```json
{
  "type": "click",
  "selector": "#add-btn",
  "name": "点击添加按钮"
}
```

#### 3. type - 文本输入
```json
{
  "type": "type",
  "selector": "#todo-input",
  "text": "测试待办事项",
  "name": "输入待办事项文本"
}
```

#### 4. wait - 等待操作
```json
{
  "type": "wait",
  "selector": ".todo-item",
  "timeout": 5000,
  "name": "等待待办事项加载"
}
```

#### 5. assert - 断言验证

**可见性断言**：
```json
{
  "type": "assert",
  "selector": "#todo-input",
  "assertion": "visible",
  "name": "验证输入框可见"
}
```

**文本断言**：
```json
{
  "type": "assert",
  "selector": ".todo-text",
  "assertion": "text",
  "expected": "测试待办事项",
  "name": "验证文本内容"
}
```

**数量断言**：
```json
{
  "type": "assert",
  "selector": ".todo-item",
  "assertion": "count",
  "expected": 1,
  "name": "验证待办事项数量"
}
```

#### 6. custom - 自定义操作
```json
{
  "type": "custom",
  "name": "清空本地存储",
  "action": "async (page) => { await page.evaluate(() => localStorage.clear()); }"
}
```

## 测试配置文件

### 配置文件结构

`test-config.json` 文件包含完整的测试配置：

```json
{
  "name": "测试套件名称",
  "description": "测试套件描述",
  "baseUrl": "http://localhost:3000",
  "timeout": 30000,
  "headless": true,
  "screenshotDir": "./screenshots",
  "reportDir": "./reports",
  "environment": {
    "viewport": {
      "width": 1280,
      "height": 800
    }
  },
  "setup": [
    // 测试前准备操作
  ],
  "teardown": [
    // 测试后清理操作
  ],
  "suites": [
    // 测试套件文件路径
  ]
}
```

### 配置项说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `baseUrl` | 测试基础URL | 必填 |
| `timeout` | 全局超时时间（毫秒） | 30000 |
| `headless` | 是否无头模式运行 | true |
| `screenshotDir` | 截图保存目录 | ./screenshots |
| `reportDir` | 报告保存目录 | ./reports |
| `parallel` | 是否并行执行 | false |
| `retry` | 失败重试次数 | 0 |
| `environment.viewport` | 浏览器视口大小 | {width: 1280, height: 800} |
| `environment.userAgent` | 浏览器User-Agent | 默认Chrome UA |
| `setup` | 测试前执行的操作 | [] |
| `teardown` | 测试后执行的操作 | [] |
| `suites` | 测试套件文件路径数组 | [] |

## 测试编写指南

### 1. 页面加载测试

```json
{
  "name": "test-page-load",
  "description": "验证页面正确加载",
  "steps": [
    {
      "type": "navigate",
      "url": "http://localhost:3000",
      "name": "导航到首页"
    },
    {
      "type": "wait",
      "selector": "body",
      "timeout": 10000,
      "name": "等待页面加载"
    },
    {
      "type": "assert",
      "selector": "h1",
      "assertion": "text",
      "expected": "Todo应用",
      "name": "验证页面标题"
    }
  ]
}
```

### 2. 表单操作测试

```json
{
  "name": "test-add-todo",
  "description": "验证添加待办事项功能",
  "steps": [
    {
      "type": "type",
      "selector": "#todo-input",
      "text": "测试待办事项",
      "name": "输入待办事项文本"
    },
    {
      "type": "click",
      "selector": "#add-btn",
      "name": "点击添加按钮"
    },
    {
      "type": "wait",
      "timeout": 1000,
      "name": "等待添加完成"
    },
    {
      "type": "assert",
      "selector": ".todo-item",
      "assertion": "count",
      "expected": 1,
      "name": "验证待办事项数量"
    }
  ]
}
```

### 3. 交互操作测试

```json
{
  "name": "test-toggle-todo",
  "description": "验证切换完成状态",
  "steps": [
    {
      "type": "click",
      "selector": ".todo-checkbox",
      "name": "点击复选框"
    },
    {
      "type": "wait",
      "timeout": 1000,
      "name": "等待状态更新"
    },
    {
      "type": "assert",
      "selector": ".todo-item.completed",
      "assertion": "count",
      "expected": 1,
      "name": "验证完成状态"
    }
  ]
}
```

### 4. 错误场景测试

```json
{
  "name": "test-empty-input",
  "description": "验证空输入处理",
  "steps": [
    {
      "type": "click",
      "selector": "#add-btn",
      "name": "点击添加按钮（空输入）"
    },
    {
      "type": "wait",
      "timeout": 1000,
      "name": "等待处理完成"
    },
    {
      "type": "assert",
      "selector": ".notification.show",
      "assertion": "visible",
      "name": "验证显示通知"
    },
    {
      "type": "assert",
      "selector": ".notification",
      "assertion": "text",
      "expected": "请输入待办事项内容！",
      "name": "验证错误消息"
    }
  ]
}
```

### 5. 自定义操作测试

```json
{
  "name": "test-custom-operation",
  "description": "验证自定义操作",
  "steps": [
    {
      "type": "custom",
      "name": "准备测试数据",
      "action": "async (page) => { await page.evaluate(() => { localStorage.setItem('todo-app-data', JSON.stringify([{ id: 1, text: '测试数据', completed: false }])); }); }"
    },
    {
      "type": "navigate",
      "url": "http://localhost:3000",
      "name": "刷新页面"
    },
    {
      "type": "assert",
      "selector": ".todo-item",
      "assertion": "count",
      "expected": 1,
      "name": "验证数据加载"
    }
  ]
}
```

## 测试执行

### 命令行执行

```bash
# 使用配置文件运行测试
agent-cli test --config test-config.json

# 指定报告格式
agent-cli test --config test-config.json --report-format html

# 保存失败截图
agent-cli test --config test-config.json --screenshot-on-failure

# 详细日志输出
agent-cli test --config test-config.json --verbose
```

### 脚本执行

```bash
# 运行所有测试
./scripts/run-tests.sh

# 指定端口运行
./scripts/run-tests.sh --port 8080

# 运行特定测试套件
./scripts/run-tests.sh --suite todo-basic

# 非无头模式运行（可以看到浏览器）
./scripts/run-tests.sh --headless false
```

### npm脚本

```bash
# 启动应用
npm start

# 运行所有测试
npm test

# 运行基础测试
npm run test:basic

# 生成报告
npm run test:report

# 开发模式
npm run dev
```

## 测试结果分析

### 报告文件

测试完成后会生成以下报告文件：

1. **HTML报告** (`reports/test-report.html`)
   - 交互式测试结果查看
   - 详细错误信息
   - 失败截图查看

2. **JSON报告** (`reports/test-report.json`)
   - 结构化测试数据
   - 便于自动化处理
   - 包含完整测试详情

3. **自定义报告** (`reports/generated/`)
   - 文本格式报告
   - Markdown格式报告
   - 自定义HTML报告

### 结果解读

#### 成功测试
- 所有测试步骤执行成功
- 断言验证通过
- 无错误发生

#### 失败测试
- 某个测试步骤执行失败
- 断言验证失败
- 发生未捕获错误

#### 跳过测试
- 测试被显式跳过
- 前置条件不满足
- 测试超时

### 错误排查

#### 常见错误类型

1. **元素未找到**
   ```json
   {
     "error": "Element not found: #non-existent-element"
   }
   ```
   **解决方案**：
   - 检查选择器是否正确
   - 确保元素已加载完成
   - 增加等待时间

2. **断言失败**
   ```json
   {
     "error": "Assertion failed: Expected 'text' to be '预期文本', got '实际文本'"
   }
   ```
   **解决方案**：
   - 检查预期值是否正确
   - 验证页面状态
   - 检查异步操作是否完成

3. **超时错误**
   ```json
   {
     "error": "Timeout: Waiting for selector .todo-item"
   }
   ```
   **解决方案**：
   - 增加超时时间
   - 检查网络连接
   - 验证服务器状态

4. **JavaScript错误**
   ```json
   {
     "error": "TypeError: Cannot read property 'value' of null"
   }
   ```
   **解决方案**：
   - 检查页面JavaScript代码
   - 验证DOM结构
   - 查看浏览器控制台错误

#### 调试技巧

1. **查看详细日志**
   ```bash
   agent-cli test --config test-config.json --verbose
   ```

2. **非无头模式运行**
   ```bash
   ./scripts/run-tests.sh --headless false
   ```

3. **保存截图**
   ```bash
   agent-cli test --config test-config.json --screenshot-on-failure
   ```

4. **检查网络请求**
   ```bash
   # 在测试配置中启用网络日志
   "logging": {
     "level": "debug",
     "network": true
   }
   ```

5. **使用自定义操作调试**
   ```json
   {
     "type": "custom",
     "name": "调试信息",
     "action": "async (page) => { console.log('当前URL:', await page.url()); console.log('页面标题:', await page.title()); }"
   }
   ```

## 最佳实践

### 1. 测试设计原则

- **原子性**：每个测试用例只验证一个功能点
- **独立性**：测试用例之间不依赖执行顺序
- **可重复性**：测试结果应该一致
- **可维护性**：测试代码应该易于理解和修改

### 2. 选择器使用

- **优先使用ID选择器**：`#todo-input`
- **使用类选择器**：`.todo-item`
- **避免使用复杂选择器**：`div > ul > li:nth-child(3)`
- **使用数据属性**：`[data-testid="add-button"]`

### 3. 等待策略

- **显式等待**：使用`wait`步骤等待特定条件
- **合理超时**：根据操作复杂度设置适当的超时时间
- **避免固定等待**：尽量减少`wait`步骤中的固定时间等待

### 4. 测试数据管理

- **使用测试数据工厂**：创建可重用的测试数据
- **清理测试数据**：每个测试用例结束后清理数据
- **使用隔离环境**：避免测试数据相互影响

### 5. 错误处理

- **预期错误测试**：专门测试错误处理逻辑
- **错误信息验证**：验证错误消息的准确性和友好性
- **恢复测试**：测试错误发生后的恢复能力

## 性能测试指南

### 1. 性能测试类型

- **加载性能**：页面加载时间、资源加载时间
- **操作性能**：用户操作响应时间
- **内存性能**：内存使用情况、内存泄漏
- **并发性能**：多用户同时操作性能

### 2. 性能指标

- **响应时间**：操作完成所需时间
- **吞吐量**：单位时间内处理的操作数量
- **资源使用**：CPU、内存、网络使用情况
- **稳定性**：长时间运行的稳定性

### 3. 性能测试编写

```json
{
  "name": "test-performance",
  "description": "性能测试示例",
  "steps": [
    {
      "type": "custom",
      "name": "测量加载时间",
      "action": "async (page) => { const startTime = Date.now(); await page.goto('http://localhost:3000'); const loadTime = Date.now() - startTime; console.log(`页面加载时间: ${loadTime}ms`); return loadTime < 3000; }"
    },
    {
      "type": "custom",
      "name": "测量操作性能",
      "action": "async (page) => { const times = []; for (let i = 0; i < 10; i++) { const startTime = Date.now(); await page.type('#todo-input', `测试${i}`); await page.click('#add-btn'); await page.waitForTimeout(100); times.push(Date.now() - startTime); } const avgTime = times.reduce((a, b) => a + b, 0) / times.length; console.log(`平均操作时间: ${avgTime.toFixed(2)}ms`); return avgTime < 500; }"
    }
  ]
}
```

## 扩展测试框架

### 1. 自定义断言

```javascript
// 在自定义操作中实现复杂断言
{
  "type": "custom",
  "name": "验证复杂条件",
  "action": "async (page) => { const items = await page.$$('.todo-item'); const completedItems = await page.$$('.todo-item.completed'); return items.length > 0 && completedItems.length === items.length / 2; }"
}
```

### 2. 测试数据生成

```javascript
// 生成测试数据
{
  "type": "custom",
  "name": "生成测试数据",
  "action": "async (page) => { await page.evaluate(() => { const todos = []; for (let i = 1; i <= 100; i++) { todos.push({ id: i, text: `测试待办事项 ${i}`, completed: i % 2 === 0 }); } localStorage.setItem('todo-app-data', JSON.stringify(todos)); }); }"
}
```

### 3. 测试工具函数

```javascript
// 创建可重用的测试工具
{
  "type": "custom",
  "name": "工具函数示例",
  "action": "async (page) => { // 等待元素出现 const waitForElement = async (selector, timeout = 5000) => { try { await page.waitForSelector(selector, { timeout }); return true; } catch { return false; } }; // 验证元素文本 const getElementText = async (selector) => { return await page.$eval(selector, el => el.textContent); }; // 使用工具函数 const isVisible = await waitForElement('.todo-item'); const text = await getElementText('.todo-text'); return isVisible && text.includes('测试'); }"
}
```

## 总结

本测试指南提供了Todo应用测试的完整指导，包括：

1. **测试框架基础**：了解测试框架的核心概念和功能
2. **测试编写**：掌握各种测试步骤的编写方法
3. **测试执行**：学会如何运行测试和分析结果
4. **错误排查**：掌握常见错误的解决方法
5. **最佳实践**：遵循测试开发的最佳实践
6. **性能测试**：了解性能测试的编写方法
7. **框架扩展**：学习如何扩展测试框架功能

通过本指南，您可以：
- 编写高质量的端到端测试
- 有效管理测试数据和环境
- 快速定位和解决测试问题
- 构建可维护的测试套件
- 实现全面的测试覆盖

如需更多帮助，请参考：
- [Agent-CLI官方文档](https://github.com/your-org/agent-cli)
- [Puppeteer文档](https://pptr.dev/)
- [示例代码](../tests/)