# Todo Web应用示例

这是一个完整的Todo Web应用示例，用于演示Agent-CLI测试框架的功能。

## 项目概述

本项目展示了一个功能完整的Todo Web应用，包含以下特性：

- **完整的CRUD操作**：添加、编辑、删除、标记完成待办事项
- **数据持久化**：使用LocalStorage保存数据
- **响应式设计**：适配各种屏幕尺寸
- **主题切换**：支持浅色/深色主题
- **数据导入导出**：支持JSON格式数据导入导出
- **丰富的用户反馈**：通知、确认对话框等

## 快速开始

### 前提条件

- Node.js 14.0.0 或更高版本
- npm 6.0.0 或更高版本
- Agent-CLI（已安装或从源码构建）

### 安装和运行

1. **启动应用**：
   ```bash
   cd examples/web-app
   npm start
   ```

2. **在浏览器中打开**：
   ```
   http://localhost:3000
   ```

3. **开发模式**（同时启动服务器和打开浏览器）：
   ```bash
   npm run dev
   ```

## 测试执行

### 运行所有测试

```bash
# 运行所有测试套件
npm test

# 或直接使用脚本
./scripts/run-tests.sh
```

### 运行特定测试套件

```bash
# 基础功能测试
npm run test:basic

# 高级功能测试
npm run test:advanced

# 错误场景测试
npm run test:error

# 性能测试
npm run test:performance

# 运行所有套件
npm run test:all
```

### 测试配置

测试配置文件：`test-config.json`

主要配置项：
- `baseUrl`: 测试服务器地址
- `timeout`: 测试超时时间
- `headless`: 是否无头模式运行
- `screenshotDir`: 截图保存目录
- `reportDir`: 报告保存目录

### 测试套件说明

1. **基础功能测试** (`tests/todo-basic.json`)
   - 页面加载验证
   - 添加待办事项
   - 切换完成状态
   - 删除功能
   - 过滤功能

2. **高级功能测试** (`tests/todo-advanced.json`)
   - 批量操作
   - 数据持久化
   - 清除功能
   - 主题切换
   - 编辑功能

3. **错误场景测试** (`tests/todo-error-cases.json`)
   - 空输入处理
   - 超长文本处理
   - 取消操作
   - 无效数据导入

4. **性能测试** (`tests/todo-performance.json`)
   - 大量数据加载
   - 操作响应时间
   - 内存使用监控
   - 并发操作测试

## 报告生成

### 生成测试报告

```bash
# 运行测试并生成报告
npm test

# 或单独生成报告
npm run test:report
```

### 报告格式

测试完成后会生成多种格式的报告：

1. **HTML报告** (`reports/test-report.html`)
   - 交互式界面
   - 详细测试结果
   - 失败截图查看

2. **JSON报告** (`reports/test-report.json`)
   - 结构化数据
   - 便于自动化处理

3. **自定义报告** (`reports/generated/`)
   - 文本报告 (`test-report.txt`)
   - Markdown报告 (`test-report.md`)
   - 自定义HTML报告 (`test-report-custom.html`)

## 项目结构

```
examples/web-app/
├── index.html              # 主页面
├── app.js                  # 应用逻辑
├── style.css               # 样式文件
├── test-config.json        # 测试配置文件
├── package.json            # 项目配置
├── tests/                  # 测试套件
│   ├── todo-basic.json     # 基础功能测试
│   ├── todo-advanced.json  # 高级功能测试
│   ├── todo-error-cases.json # 错误场景测试
│   └── todo-performance.json # 性能测试
├── scripts/                # 运行脚本
│   ├── start-server.js     # 本地服务器
│   ├── run-tests.sh        # 测试运行脚本
│   └── generate-report.sh  # 报告生成脚本
└── docs/                   # 文档
    ├── test-guide.md       # 测试指南
    └── api-reference.md    # API参考
```

## 测试框架特性展示

本项目展示了Agent-CLI测试框架的以下特性：

### 1. 多种测试步骤类型
- **navigate**: 页面导航
- **click**: 元素点击
- **type**: 文本输入
- **wait**: 等待操作
- **assert**: 断言验证
- **custom**: 自定义操作

### 2. 丰富的断言类型
- **visible**: 元素可见性
- **hidden**: 元素隐藏
- **text**: 文本内容
- **count**: 元素数量
- **url**: 页面URL

### 3. 环境管理
- LocalStorage管理
- Cookie管理
- 页面环境配置

### 4. 结果管理
- 测试结果持久化
- 统计信息生成
- 趋势分析
- 报告生成

### 5. 配置灵活性
- 命令行参数
- JSON配置文件
- 环境变量
- 测试套件组合

## 使用示例

### 使用Agent-CLI直接运行测试

```bash
# 使用配置文件运行测试
agent-cli test --config test-config.json

# 指定特定测试套件
agent-cli test --suite tests/todo-basic.json

# 生成HTML报告
agent-cli test --config test-config.json --report-format html

# 保存截图
agent-cli test --config test-config.json --screenshot-on-failure
```

### 自定义测试配置

创建自定义配置文件 `custom-config.json`：

```json
{
  "baseUrl": "http://localhost:3000",
  "timeout": 60000,
  "headless": false,
  "suites": [
    "./tests/todo-basic.json",
    "./tests/todo-advanced.json"
  ]
}
```

运行自定义配置：
```bash
agent-cli test --config custom-config.json
```

## 开发指南

### 添加新测试

1. 在 `tests/` 目录下创建新的测试套件文件
2. 参考现有测试套件的结构
3. 在 `test-config.json` 中添加套件路径
4. 运行测试验证

### 修改应用功能

1. 修改 `app.js` 中的业务逻辑
2. 更新 `index.html` 中的界面
3. 调整 `style.css` 中的样式
4. 运行测试确保功能正常

### 调试测试

```bash
# 非无头模式运行，可以看到浏览器界面
./scripts/run-tests.sh --headless false

# 只运行特定测试套件
./scripts/run-tests.sh --suite todo-basic

# 查看详细日志
agent-cli test --config test-config.json --verbose
```

## 常见问题

### 1. 端口被占用

如果端口3000被占用，可以指定其他端口：

```bash
PORT=8080 npm start
# 或
./scripts/run-tests.sh --port 8080
```

### 2. Agent-CLI未找到

如果Agent-CLI未安装，可以从源码构建：

```bash
cd ../..
npm install
npm run build
```

### 3. 测试失败

检查以下事项：
- 服务器是否正常运行 (`http://localhost:3000`)
- 浏览器是否已安装（Chrome/Firefox）
- 网络连接是否正常
- 查看错误日志 (`logs/test-execution.log`)

### 4. 性能测试耗时较长

性能测试包含大量数据操作，可能需要较长时间。可以：
- 减少测试数据量
- 跳过性能测试套件
- 增加超时时间

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 运行测试确保通过
5. 创建Pull Request

## 许可证

MIT License

## 联系方式

- 项目主页: https://github.com/your-org/agent-cli
- 问题反馈: https://github.com/your-org/agent-cli/issues
- 文档: https://github.com/your-org/agent-cli/wiki

---

**提示**: 本项目主要用于演示Agent-CLI测试框架的功能，可以作为学习和参考的示例。在实际项目中，请根据具体需求进行调整和优化。