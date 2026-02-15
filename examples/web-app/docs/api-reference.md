# Todo应用API参考

本文档提供Todo Web应用的完整API参考，包括应用接口、测试接口和配置接口。

## 应用API

### 核心类：TodoApp

#### 构造函数
```javascript
const todoApp = new TodoApp();
```

#### 方法

##### init()
初始化应用，加载数据并绑定事件。

**调用方式**：
```javascript
todoApp.init();
```

**内部操作**：
1. 从LocalStorage加载待办事项数据
2. 绑定所有事件监听器
3. 渲染初始界面
4. 显示欢迎通知

##### addTodo()
添加新的待办事项。

**调用方式**：
```javascript
todoApp.addTodo();
```

**验证规则**：
1. 输入不能为空或空白字符
2. 文本长度不能超过100个字符
3. 成功添加后清空输入框

**触发事件**：
- `click` #add-btn 按钮
- `keypress` #todo-input 输入框（Enter键）

##### toggleTodo(id)
切换待办事项的完成状态。

**参数**：
- `id` (Number): 待办事项的唯一标识符

**调用方式**：
```javascript
todoApp.toggleTodo(1234567890);
```

##### editTodo(id)
编辑待办事项的文本内容。

**参数**：
- `id` (Number): 待办事项的唯一标识符

**调用方式**：
```javascript
todoApp.editTodo(1234567890);
```

**交互流程**：
1. 显示prompt对话框
2. 验证新文本（非空、长度限制）
3. 更新待办事项文本
4. 保存到LocalStorage
5. 重新渲染界面

##### deleteTodo(id)
删除指定的待办事项。

**参数**：
- `id` (Number): 待办事项的唯一标识符

**调用方式**：
```javascript
todoApp.deleteTodo(1234567890);
```

**交互流程**：
1. 显示确认对话框
2. 用户确认后删除
3. 保存到LocalStorage
4. 重新渲染界面

##### setFilter(filter)
设置待办事项的过滤条件。

**参数**：
- `filter` (String): 过滤条件，可选值：'all', 'active', 'completed'

**调用方式**：
```javascript
todoApp.setFilter('active');
```

##### clearCompleted()
清除所有已完成的待办事项。

**调用方式**：
```javascript
todoApp.clearCompleted();
```

**验证规则**：
- 如果没有已完成的待办事项，显示提示信息

##### clearAll()
清除所有待办事项。

**调用方式**：
```javascript
todoApp.clearAll();
```

**验证规则**：
- 如果没有待办事项，显示提示信息

##### toggleTheme()
切换应用主题（浅色/深色）。

**调用方式**：
```javascript
todoApp.toggleTheme();
```

**存储**：
- 主题设置保存在LocalStorage中（key: 'todo-theme'）

##### exportData()
导出所有待办事项数据为JSON文件。

**调用方式**：
```javascript
todoApp.exportData();
```

**导出格式**：
```json
{
  "todos": [...],
  "exportDate": "2026-02-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

##### importData()
从JSON文件导入待办事项数据。

**调用方式**：
```javascript
todoApp.importData();
```

**导入流程**：
1. 显示导入对话框
2. 用户粘贴JSON数据
3. 验证数据格式
4. 导入有效数据
5. 重新渲染界面

**数据验证**：
1. JSON格式验证
2. todos数组验证
3. 每个待办事项的结构验证

#### 工具方法

##### showNotification(message, type)
显示通知消息。

**参数**：
- `message` (String): 通知消息内容
- `type` (String): 通知类型，可选值：'success', 'error', 'warning', 'info'

**调用方式**：
```javascript
todoApp.showNotification('操作成功！', 'success');
```

##### showConfirm(title, message, callback)
显示确认对话框。

**参数**：
- `title` (String): 对话框标题
- `message` (String): 对话框消息
- `callback` (Function): 确认后的回调函数

**调用方式**：
```javascript
todoApp.showConfirm('确认删除', '确定要删除此项吗？', () => {
  console.log('用户确认删除');
});
```

##### saveToStorage()
保存待办事项数据到LocalStorage。

**存储键名**：'todo-app-data'

##### loadFromStorage()
从LocalStorage加载待办事项数据。

##### getFilteredTodos()
获取过滤后的待办事项列表。

**返回值**：Array - 过滤后的待办事项数组

##### calculateStats()
计算统计信息。

**返回值**：Object - 包含以下属性的统计对象
- `total` (Number): 总数量
- `active` (Number): 进行中数量
- `completed` (Number): 已完成数量
- `completionRate` (Number): 完成率（百分比）

##### render()
渲染应用界面。

**渲染内容**：
1. 更新统计信息显示
2. 渲染待办事项列表
3. 绑定待办事项事件

### DOM元素参考

#### 主要元素

| 选择器 | 类型 | 描述 |
|--------|------|------|
| `#todo-input` | `<input>` | 待办事项输入框 |
| `#add-btn` | `<button>` | 添加按钮 |
| `.filter-btn` | `<button>` | 过滤按钮（全部/进行中/已完成） |
| `#clear-completed` | `<button>` | 清除已完成按钮 |
| `#clear-all` | `<button>` | 清除全部按钮 |
| `#todo-list` | `<div>` | 待办事项列表容器 |
| `.todo-item` | `<div>` | 单个待办事项项 |
| `.todo-checkbox` | `<input>` | 完成状态复选框 |
| `.todo-text` | `<span>` | 待办事项文本 |
| `.todo-action-btn.edit` | `<button>` | 编辑按钮 |
| `.todo-action-btn.delete` | `<button>` | 删除按钮 |
| `#total-count` | `<span>` | 总计数量显示 |
| `#active-count` | `<span>` | 进行中数量显示 |
| `#completed-count` | `<span>` | 已完成数量显示 |
| `#completion-rate` | `<span>` | 完成率显示 |
| `#toggle-theme` | `<a>` | 主题切换链接 |
| `#export-data` | `<a>` | 导出数据链接 |
| `#import-data` | `<a>` | 导入数据链接 |

#### 模态框元素

| 选择器 | 类型 | 描述 |
|--------|------|------|
| `#confirm-dialog` | `<div>` | 确认对话框 |
| `#confirm-title` | `<h3>` | 确认对话框标题 |
| `#confirm-message` | `<p>` | 确认对话框消息 |
| `#confirm-cancel` | `<button>` | 取消按钮 |
| `#confirm-ok` | `<button>` | 确认按钮 |
| `#import-dialog` | `<div>` | 导入对话框 |
| `#import-textarea` | `<textarea>` | 导入数据文本框 |
| `#import-cancel` | `<button>` | 导入取消按钮 |
| `#import-ok` | `<button>` | 导入确认按钮 |

#### 通知元素

| 选择器 | 类型 | 描述 |
|--------|------|------|
| `#notification` | `<div>` | 通知容器 |
| `#notification-message` | `<span>` | 通知消息 |
| `#notification-close` | `<button>` | 关闭通知按钮 |

### 数据模型

#### 待办事项对象结构

```javascript
{
  id: Number,           // 唯一标识符（时间戳）
  text: String,         // 待办事项文本（1-100字符）
  completed: Boolean,   // 完成状态
  createdAt: String,    // 创建时间（ISO格式）
  updatedAt: String     // 更新时间（ISO格式）
}
```

#### 本地存储结构

**键名**: `todo-app-data`

**值**: JSON字符串化的待办事项数组
```json
[
  {
    "id": 1234567890,
    "text": "示例待办事项",
    "completed": false,
    "createdAt": "2026-02-15T10:30:00.000Z",
    "updatedAt": "2026-02-15T10:30:00.000Z"
  }
]
```

#### 主题设置

**键名**: `todo-theme`

**值**:
- `'light'` - 浅色主题
- `'dark'` - 深色主题

### 事件系统

#### 用户交互事件

| 事件 | 元素 | 处理函数 | 描述 |
|------|------|----------|------|
| `click` | `#add-btn` | `addTodo()` | 添加待办事项 |
| `keypress` | `#todo-input` | `addTodo()` (Enter键) | 键盘添加待办事项 |
| `click` | `.filter-btn` | `setFilter()` | 过滤待办事项 |
| `click` | `#clear-completed` | `clearCompleted()` | 清除已完成 |
| `click` | `#clear-all` | `clearAll()` | 清除全部 |
| `click` | `#toggle-theme` | `toggleTheme()` | 切换主题 |
| `click` | `#export-data` | `exportData()` | 导出数据 |
| `click` | `#import-data` | `showImportDialog()` | 显示导入对话框 |
| `change` | `.todo-checkbox` | `toggleTodo()` | 切换完成状态 |
| `click` | `.todo-action-btn.edit` | `editTodo()` | 编辑待办事项 |
| `click` | `.todo-action-btn.delete` | `deleteTodo()` | 删除待办事项 |
| `click` | `#confirm-cancel` | `hideConfirm()` | 取消确认操作 |
| `click` | `#confirm-ok` | `confirmAction()` | 确认操作 |
| `click` | `#import-cancel` | `hideImportDialog()` | 取消导入 |
| `click` | `#import-ok` | `importData()` | 确认导入 |
| `click` | `#notification-close` | `hideNotification()` | 关闭通知 |

#### 自定义事件

应用内部使用以下自定义事件模式：

1. **数据变更事件**
   - 数据保存到LocalStorage时触发
   - 界面重新渲染时触发

2. **状态变更事件**
   - 过滤条件变更时触发
   - 主题切换时触发

3. **用户反馈事件**
   - 显示通知时触发
   - 显示对话框时触发

### CSS类名参考

#### 布局类

| 类名 | 描述 |
|------|------|
| `.container` | 主容器 |
| `.header` | 头部区域 |
| `.main-content` | 主要内容区域 |
| `.footer` | 页脚区域 |

#### 组件类

| 类名 | 描述 |
|------|------|
| `.add-todo-section` | 添加待办事项区域 |
| `.input-group` | 输入框组 |
| `.filter-section` | 过滤区域 |
| `.filter-buttons` | 过滤按钮组 |
| `.actions` | 操作按钮组 |
| `.todo-list-section` | 待办事项列表区域 |
| `.todo-list` | 待办事项列表 |
| `.todo-item` | 单个待办事项 |
| `.stats-section` | 统计区域 |
| `.stats-card` | 统计卡片 |
| `.stat-item` | 统计项 |

#### 状态类

| 类名 | 描述 |
|------|------|
| `.active` | 激活状态（过滤按钮） |
| `.completed` | 完成状态（待办事项） |
| `.dark-mode` | 深色主题（body元素） |
| `.show` | 显示状态（通知、对话框） |
| `.empty-state` | 空状态 |

#### 样式类

| 类名 | 描述 |
|------|------|
| `.btn` | 基础按钮样式 |
| `.btn-primary` | 主要按钮 |
| `.btn-secondary` | 次要按钮 |
| `.btn-danger` | 危险按钮 |
| `.filter-btn` | 过滤按钮 |
| `.todo-action-btn` | 待办事项操作按钮 |
| `.modal` | 模态框 |
| `.modal-content` | 模态框内容 |
| `.modal-actions` | 模态框操作按钮组 |
| `.notification` | 通知 |
| `.notification.success` | 成功通知 |
| `.notification.error` | 错误通知 |
| `.notification.warning` | 警告通知 |
| `.notification.info` | 信息通知 |

## 测试API

### 测试配置API

#### 测试步骤类型

| 类型 | 参数 | 描述 |
|------|------|------|
| `navigate` | `url`, `name` | 导航到指定URL |
| `click` | `selector`, `name` | 点击指定元素 |
| `type` | `selector`, `text`, `name` | 在指定元素输入文本 |
| `wait` | `selector`/`timeout`, `name` | 等待元素或时间 |
| `assert` | `selector`, `assertion`, `expected`, `name` | 断言验证 |
| `custom` | `action`, `name` | 自定义操作 |

#### 断言类型

| 类型 | 参数 | 描述 |
|------|------|------|
| `visible` | - | 元素可见 |
| `hidden` | - | 元素隐藏 |
| `text` | `expected` | 元素文本等于预期值 |
| `count` | `expected` | 元素数量等于预期值 |
| `url` | `expected` | 页面URL等于预期值 |

#### 自定义操作API

自定义操作可以访问以下Puppeteer API：

```javascript
{
  "type": "custom",
  "name": "示例操作",
  "action": "async (page) => {
    // page 对象提供以下方法：

    // 导航
    await page.goto('http://example.com');

    // 元素操作
    await page.click('#button');
    await page.type('#input', 'text');
    await page.waitForSelector('.element');

    // 页面评估（执行JavaScript）
    const result = await page.evaluate(() => {
      return document.title;
    });

    // 截图
    await page.screenshot({ path: 'screenshot.png' });

    // 返回布尔值表示测试结果
    return true;
  }"
}
```

### 测试数据API

#### 测试数据生成

```javascript
// 在自定义操作中生成测试数据
{
  "type": "custom",
  "name": "生成测试数据",
  "action": "async (page) => {
    await page.evaluate(() => {
      const todos = [];
      for (let i = 1; i <= 10; i++) {
        todos.push({
          id: Date.now() + i,
          text: `测试待办事项 ${i}`,
          completed: i % 2 === 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
      localStorage.setItem('todo-app-data', JSON.stringify(todos));
    });
    return true;
  }"
}
```

#### 测试数据验证

```javascript
{
  "type": "custom",
  "name": "验证测试数据",
  "action": "async (page) => {
    const data = await page.evaluate(() => {
      return localStorage.getItem('todo-app-data');
    });

    if (!data) return false;

    const todos = JSON.parse(data);

    // 验证数据结构
    const isValid = todos.every(todo => {
      return todo.id &&
             typeof todo.text === 'string' &&
             typeof todo.completed === 'boolean' &&
             todo.createdAt &&
             todo.updatedAt;
    });

    return isValid && todos.length === 10;
  }"
}
```

### 测试工具API

#### 等待工具

```javascript
{
  "type": "custom",
  "name": "智能等待",
  "action": "async (page) => {
    // 等待元素出现
    const waitForElement = async (selector, timeout = 5000) => {
      try {
        await page.waitForSelector(selector, { timeout });
        return true;
      } catch {
        return false;
      }
    };

    // 等待元素消失
    const waitForElementHidden = async (selector, timeout = 5000) => {
      try {
        await page.waitForSelector(selector, {
          timeout,
          hidden: true
        });
        return true;
      } catch {
        return false;
      }
    };

    // 使用工具
    const isVisible = await waitForElement('.todo-item');
    const isHidden = await waitForElementHidden('.loading');

    return isVisible && isHidden;
  }"
}
```

#### 断言工具

```javascript
{
  "type": "custom",
  "name": "复杂断言",
  "action": "async (page) => {
    // 获取元素文本
    const getText = async (selector) => {
      return await page.$eval(selector, el => el.textContent.trim());
    };

    // 获取元素数量
    const getCount = async (selector) => {
      return (await page.$$(selector)).length;
    };

    // 验证多个条件
    const totalText = await getText('#total-count');
    const activeText = await getText('#active-count');
    const completedText = await getText('#completed-count');

    const total = parseInt(totalText);
    const active = parseInt(activeText);
    const completed = parseInt(completedText);

    return total === active + completed && total >= 0;
  }"
}
```

## 配置API

### 应用配置

#### 本地存储配置

| 键名 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `todo-app-data` | String | `[]` | 待办事项数据 |
| `todo-theme` | String | `'light'` | 主题设置 |

#### 应用常量

| 常量 | 值 | 描述 |
|------|-----|------|
| 最大文本长度 | 100 | 待办事项文本最大字符数 |
| 通知显示时间 | 3000ms | 通知自动隐藏时间 |
| 确认超时时间 | 5000ms | 确认对话框超时时间 |

### 测试配置

#### 环境配置

```json
{
  "environment": {
    "viewport": {
      "width": 1280,
      "height": 800
    },
    "userAgent": "Mozilla/5.0...",
    "locale": "zh-CN",
    "timezone": "Asia/Shanghai"
  }
}
```

#### 日志配置

```json
{
  "logging": {
    "level": "info",
    "console": true,
    "file": "./logs/test-execution.log",
    "screenshotOnFailure": true
  }
}
```

#### 钩子配置

```json
{
  "hooks": {
    "beforeSuite": "async (suiteName) => { console.log(`开始套件: ${suiteName}`); }",
    "afterSuite": "async (suiteName, results) => { console.log(`套件完成: ${suiteName}`); }",
    "beforeTest": "async (testName) => { console.log(`开始测试: ${testName}`); }",
    "afterTest": "async (testName, passed) => { console.log(`测试完成: ${testName}`); }"
  }
}
```

### 脚本配置

#### 运行脚本参数

`scripts/run-tests.sh` 支持以下参数：

| 参数 | 简写 | 默认值 | 描述 |
|------|------|--------|------|
| `--help` | `-h` | - | 显示帮助信息 |
| `--port` | `-p` | 3000 | 服务器端口 |
| `--suite` | `-s` | - | 指定测试套件 |
| `--test` | `-t` | - | 指定测试用例 |
| `--no-server` | - | false | 不启动服务器 |
| `--headless` | - | true | 无头模式运行 |

#### 报告脚本参数

`scripts/generate-report.sh` 支持以下参数：

| 参数 | 简写 | 默认值 | 描述 |
|------|------|--------|------|
| `--help` | `-h` | - | 显示帮助信息 |
| `--input` | `-i` | ./reports/test-report.json | 输入JSON报告文件 |
| `--output-dir` | `-o` | ./reports/generated | 输出目录 |
| `--format` | - | all | 输出格式（txt, md, html, all） |

## 错误代码参考

### 应用错误

| 错误类型 | 错误消息 | 原因 | 解决方案 |
|----------|----------|------|----------|
| 空输入错误 | "请输入待办事项内容！" | 输入框为空或空白字符 | 输入有效文本 |
| 超长文本错误 | "待办事项内容不能超过100个字符！" | 文本长度超过100字符 | 缩短文本长度 |
| 导入格式错误 | "导入失败：数据格式不正确：缺少todos数组" | JSON格式不正确 | 检查JSON格式 |
| 导入数据错误 | "导入失败：没有有效的待办事项数据" | 数据验证失败 | 检查数据结构 |

### 测试错误

| 错误类型 | 错误消息 | 原因 | 解决方案 |
|----------|----------|------|----------|
| 元素未找到 | "Element not found: #selector" | 选择器错误或元素未加载 | 检查选择器，增加等待时间 |
| 断言失败 | "Assertion failed: Expected 'X', got 'Y'" | 预期值与实际值不匹配 | 检查页面状态，验证预期值 |
| 超时错误 | "Timeout: Waiting for selector .element" | 元素加载超时 | 增加超时时间，检查网络 |
| JavaScript错误 | "TypeError: Cannot read property..." | 页面JavaScript错误 | 检查控制台错误，修复代码 |

### 配置错误

| 错误类型 | 错误消息 | 原因 | 解决方案 |
|----------|----------|------|----------|
| 配置文件错误 | "Invalid configuration file" | JSON格式错误 | 检查JSON语法 |
| 缺少配置项 | "Missing required field: baseUrl" | 必需配置项缺失 | 添加缺失配置项 |
| 端口占用错误 | "Port 3000 is already in use" | 端口被占用 | 使用其他端口或停止占用进程 |

## 性能指标

### 加载性能

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| 页面加载时间 | < 3秒 | `window.performance.timing` |
| DOM加载时间 | < 2秒 | `DOMContentLoaded` 事件 |
| 资源加载时间 | < 5秒 | 资源加载完成时间 |

### 操作性能

| 操作 | 目标响应时间 | 测量方法 |
|------|--------------|----------|
| 添加待办事项 | < 500ms | 点击按钮到界面更新 |
| 切换完成状态 | < 300ms | 点击复选框到状态更新 |
| 删除待办事项 | < 800ms | 点击删除到界面更新 |
| 过滤操作 | < 200ms | 点击过滤按钮到列表更新 |

### 内存性能

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| 初始内存使用 | < 50MB | `performance.memory.usedJSHeapSize` |
| 100项内存使用 | < 100MB | 加载100项后的内存使用 |
| 内存增长 | < 1MB/操作 | 每次操作的内存增长 |

## 兼容性参考

### 浏览器兼容性

| 浏览器 | 版本 | 支持状态 | 备注 |
|--------|------|----------|------|
| Chrome | 90+ | ✅ 完全支持 | 推荐浏览器 |
| Firefox | 88+ | ✅ 完全支持 | 完全兼容 |
| Safari | 14+ | ✅ 完全支持 | 完全兼容 |
| Edge | 90+ | ✅ 完全支持 | 基于Chromium |

### 设备兼容性

| 设备类型 | 屏幕尺寸 | 支持状态 | 备注 |
|----------|----------|----------|------|
| 桌面电脑 | > 1024px | ✅ 完全支持 | 最佳体验 |
| 平板电脑 | 768px-1024px | ✅ 完全支持 | 响应式适配 |
| 手机 | < 768px | ✅ 完全支持 | 移动端优化 |

### 操作系统兼容性

| 操作系统 | 版本 | 支持状态 | 备注 |
|----------|------|----------|------|
| Windows | 10+ | ✅ 完全支持 | 完全兼容 |
| macOS | 10.15+ | ✅ 完全支持 | 完全兼容 |
| Linux | 主流发行版 | ✅ 完全支持 | 完全兼容 |

## 更新日志

### v1.0.0 (2026-02-15)
- 初始版本发布
- 完整的Todo应用功能
- 完整的测试套件
- 详细的文档

### 未来计划
- 添加离线支持
- 添加同步功能
- 添加分类标签
- 添加提醒功能

## 技术支持

### 问题反馈

1. **GitHub Issues**
   - 地址：https://github.com/your-org/agent-cli/issues
   - 标签：`example`, `todo-app`, `bug`, `enhancement`

2. **文档问题**
   - 检查本文档的对应章节
   - 参考示例代码
   - 查看测试指南

### 调试帮助

1. **启用调试模式**
   ```bash
   # 应用调试
   localStorage.debug = 'todo-app:*';

   # 测试调试
   agent-cli test --config test-config.json --verbose
   ```

2. **查看日志**
   - 应用控制台：F12打开开发者工具
   - 测试日志：`logs/test-execution.log`
   - 服务器日志：控制台输出

3. **常见问题排查**
   - 检查网络连接
   - 检查浏览器控制台错误
   - 验证LocalStorage数据
   - 查看测试截图

### 贡献指南

1. Fork项目仓库
2. 创建功能分支
3. 提交代码更改
4. 运行测试确保通过
5. 创建Pull Request

**测试要求**：
- 所有测试必须通过
- 新功能必须包含测试
- 代码符合编码规范
- 文档保持更新