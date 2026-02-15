# Agent CLI 用户指南

> 长效运行智能体CLI工具 - 详细使用说明

## 项目概述

Agent CLI 是一个用于管理长效运行智能体项目的命令行工具，实现了《Effective harnesses for long-running agents》中描述的双轨方案。本工具支持结构化的进度跟踪、增量功能实现和自动化测试，确保智能体能够在多个会话间保持稳定进展。

**核心特性**：
- 🚀 **项目初始化**：快速创建完整项目环境，生成详细功能列表
- 📊 **进度跟踪**：双轨方案实现，结构化进度管理
- 🔄 **增量开发**：每次只实现一个功能，保持原子性提交
- ✅ **自动化测试**：端到端功能验证，测试报告生成
- 🔧 **Git集成**：自动化版本控制，智能提交管理
- 🧠 **上下文监控**：Token使用估算，实时预警，自动会话总结

## 安装指南

### 前置要求
- Node.js >= 18.0.0
- Git >= 2.0.0
- npm 或 yarn

### 安装步骤

1. **克隆项目仓库**：
   ```bash
   git clone https://github.com/your-username/agent-cli.git
   cd agent-cli
   ```

2. **安装依赖**：
   ```bash
   npm install
   ```

3. **构建项目**：
   ```bash
   npm run build
   ```

4. **全局安装（可选）**：
   ```bash
   npm link  # 将 agent-cli 命令添加到全局路径
   ```

5. **验证安装**：
   ```bash
   agent-cli --version
   agent-cli --help
   ```

### 开发环境

如果你想基于源码进行开发：

```bash
# 开发模式（自动监视文件变化）
npm run dev

# 运行测试套件
npm test

# 代码格式化
npm run format

# 代码检查
npm run lint
```

## 快速开始

### 第一步：创建新项目

使用 `init` 命令创建新的智能体项目：

```bash
# 交互式创建项目
agent-cli init my-web-app

# 或指定模板和选项
agent-cli init my-api-service \
  --template api-service \
  --tech-stack "typescript,express" \
  --description "一个REST API服务项目"
```

**可用项目类型**：
- `web-app` - 网页应用
- `api-service` - API服务
- `cli-tool` - 命令行工具
- `library` - 库项目
- `mobile-app` - 移动应用
- `desktop-app` - 桌面应用

### 第二步：查看项目状态

初始化后，查看项目当前状态：

```bash
# 查看整体项目状态
agent-cli status

# 查看详细进度报告
agent-cli status --detailed

# 以JSON格式输出
agent-cli status --format json
```

### 第三步：开始增量开发

使用 `next` 命令获取下一个推荐功能：

```bash
# 获取下一个待实现的功能
agent-cli next

# 查看功能详情和依赖关系
agent-cli next --show-dependencies

# 手动选择特定功能
agent-cli next --feature-id "feature-001"
```

### 第四步：执行测试

在实现功能后，运行测试验证功能：

```bash
# 运行所有测试
agent-cli test

# 运行特定测试套件
agent-cli test --suites "tests/*.json"

# 运行测试并生成报告
agent-cli test --report --output ./test-report.html
```

## 核心命令详解

### 项目初始化 (init)

```bash
agent-cli init <project-name> [options]
```

**选项**：
- `--template, -t` - 项目模板类型（默认：web-app）
- `--tech-stack, -s` - 技术栈（逗号分隔）
- `--description, -d` - 项目描述
- `--author, -a` - 作者信息
- `--repository, -r` - 仓库URL
- `--license, -l` - 许可证类型
- `--skip-git` - 跳过Git初始化
- `--skip-tests` - 跳过测试配置

**示例**：
```bash
# 创建React + TypeScript网页应用
agent-cli init my-app \
  --template web-app \
  --tech-stack "react,typescript,tailwind" \
  --description "现代化的网页应用"

# 创建Express API服务
agent-cli init my-api \
  --template api-service \
  --tech-stack "typescript,express,jest" \
  --description "RESTful API服务"
```

### 状态查看 (status)

```bash
agent-cli status [options]
```

**选项**：
- `--detailed, -d` - 显示详细信息
- `--format, -f` - 输出格式（text/json/html/markdown）
- `--output, -o` - 输出文件路径
- `--since` - 显示特定时间后的进度

**输出示例**：
```
📊 项目状态: my-web-app
├── 进度: 35% (7/20 功能完成)
├── 最后更新时间: 2026-02-16 14:30:00
├── 当前功能: 用户登录界面 (#feature-007)
├── 待完成: 13个功能
└── 测试通过率: 100% (20/20 测试通过)
```

### 下一步功能 (next)

```bash
agent-cli next [options]
```

**选项**：
- `--feature-id, -f` - 指定功能ID
- `--show-dependencies, -d` - 显示依赖关系
- `--skip-dependency-check` - 跳过依赖检查
- `--priority, -p` - 优先级过滤（high/medium/low）

**工作流程**：
1. 分析功能列表和依赖关系
2. 推荐下一个可实现的功能
3. 生成智能体提示词
4. 更新进度状态

### 测试运行 (test)

```bash
agent-cli test [options]
```

**选项**：
- `--suites, -s` - 测试套件路径模式
- `--report, -r` - 生成测试报告
- `--output, -o` - 报告输出路径
- `--format, -f` - 报告格式（html/json/text）
- `--headless` - 无头模式运行（Puppeteer）
- `--timeout, -t` - 测试超时时间（毫秒）

**支持的测试框架**：
- Puppeteer（默认）
- Playwright
- Cypress
- Jest

### 配置管理 (config)

```bash
# 查看当前配置
agent-cli config --list

# 设置配置值
agent-cli config --set "agent.model=claude-3-5-sonnet"
agent-cli config --set "agent.temperature=0.8"
agent-cli config --set "testing.framework=puppeteer"

# 验证配置
agent-cli config --validate

# 重置为默认配置
agent-cli config --reset

# 导出配置
agent-cli config --export ./my-config.json
```

### 报告生成 (report)

```bash
# 生成进度报告
agent-cli report --type progress --format html --output ./progress.html

# 生成测试报告
agent-cli report --type test --format json --output ./test-results.json

# 生成健康状态报告
agent-cli report --type health --format markdown --output ./health.md

# 生成综合报告
agent-cli report --type comprehensive --format html --output ./full-report.html
```

**报告类型**：
- `progress` - 进度分析报告
- `test` - 测试结果报告
- `health` - 项目健康状态报告
- `comprehensive` - 综合报告（包含所有信息）

### 上下文监控 (context)

```bash
# 检查上下文使用率
agent-cli context --input ./messages.json

# 设置警告阈值
agent-cli context --threshold 0.8

# 生成会话总结
agent-cli context --summarize

# 查看token使用历史
agent-cli context --history

# 监控实时会话
agent-cli context --monitor --output ./context-log.txt
```

### 项目重置 (reset)

```bash
# 重置进度（保留功能和配置）
agent-cli reset --type progress

# 重置功能列表
agent-cli reset --type features

# 重置Git历史（危险！）
agent-cli reset --type git --backup

# 完全重置项目
agent-cli reset --type full --confirm

# 预览重置影响
agent-cli reset --type progress --preview
```

**安全特性**：
- 默认需要确认操作
- 支持备份和恢复
- 预览模式显示影响范围
- 分级重置选项

## 配置文件详解

Agent CLI 使用 `agent.config.json` 文件进行配置管理，支持多级配置源（环境变量 > 配置文件 > 默认配置）。

### 配置文件位置

1. **项目配置文件**：`./agent.config.json`
2. **用户全局配置**：`~/.agent-cli/config.json`
3. **环境变量配置**：`AGENT_CLI_*` 前缀

### 配置结构示例

```json
{
  "$schema": "./node_modules/agent-cli/schemas/config.schema.json",
  "project": {
    "name": "my-web-app",
    "description": "现代化的React网页应用",
    "type": "web-app",
    "techStack": ["react", "typescript", "tailwind"],
    "version": "1.0.0",
    "author": "开发者姓名",
    "repository": "https://github.com/username/my-web-app",
    "license": "MIT"
  },
  "agent": {
    "model": "claude-3-5-sonnet",
    "contextMonitoring": {
      "enabled": true,
      "warningThreshold": 0.8,
      "maxTokens": 131072,
      "autoSummarize": true,
      "summaryInterval": 10
    },
    "initializer": {
      "promptTemplate": "templates/init-prompt.md",
      "maxFeatures": 200,
      "featureDetailLevel": "high",
      "generateTests": true,
      "generateDocs": true
    },
    "coder": {
      "promptTemplate": "templates/coder-prompt.md",
      "incrementalMode": true,
      "maxStepsPerSession": 1,
      "requireTests": true,
      "autoCommit": true,
      "reviewChanges": true
    },
    "maxRetries": 3,
    "retryDelay": 5000,
    "temperature": 0.7
  },
  "testing": {
    "framework": "puppeteer",
    "headless": true,
    "timeout": 30000,
    "takeScreenshots": true,
    "recordVideo": false,
    "viewport": {
      "width": 1280,
      "height": 720
    }
  },
  "git": {
    "autoCommit": true,
    "branch": "main",
    "commitTemplate": "feat: {description}\n\n- 实现功能: {details}\n- 分类: {category}\n- 测试状态: {testStatus}\n- 相关文件: {files}",
    "commitOnTestPass": true,
    "tagReleases": false
  },
  "paths": {
    "progressFile": "claude-progress.txt",
    "featureListFile": "feature-list.json",
    "configFile": "agent.config.json",
    "logsDir": "logs"
  },
  "features": {
    "enableProgressTracking": true,
    "enableAutoTesting": true,
    "enableGitIntegration": true,
    "enableErrorRecovery": true
  }
}
```

### 环境变量配置

环境变量命名规则：`AGENT_CLI_[SECTION]_[KEY]`，使用下划线分隔。

**示例**：
```bash
# 设置项目名称
export AGENT_CLI_PROJECT_NAME="my-project"

# 设置AI模型
export AGENT_CLI_AGENT_MODEL="claude-3-5-sonnet"

# 设置温度参数（JSON格式）
export AGENT_CLI_AGENT_TEMPERATURE="0.8"

# 设置技术栈（JSON数组）
export AGENT_CLI_PROJECT_TECH_STACK='["react", "typescript"]'
```

**配置优先级**：
1. 命令行参数（最高）
2. 环境变量
3. 项目配置文件
4. 用户全局配置文件
5. 默认配置（最低）

## 模板系统

Agent CLI 提供强大的模板系统，支持自定义模板和变量替换。

### 内置模板

1. **初始化提示词模板** (`templates/init-prompt.md`)
   - 用于初始化智能体的输入
   - 包含项目信息、技术栈、功能需求

2. **编码提示词模板** (`templates/coder-prompt.md`)
   - 用于编码智能体的输入
   - 包含任务描述、实现步骤、测试要求

3. **功能列表模板** (`templates/feature-list.json`)
   - 功能列表的JSON结构模板
   - 符合Feature类型定义

### 模板管理命令

```bash
# 查看所有模板
agent-cli template list

# 查看模板详情
agent-cli template info init-prompt

# 渲染模板
agent-cli template render init-prompt \
  --output ./output.md \
  --data '{"projectName": "测试项目", "currentDate": "2026-02-16"}'

# 添加自定义模板
agent-cli template add ./my-template.md

# 删除模板
agent-cli template remove my-template
```

### 模板变量

模板支持变量替换语法：`{{variableName}}`

**可用变量**：
- `{{projectName}}` - 项目名称
- `{{projectDescription}}` - 项目描述
- `{{techStack}}` - 技术栈列表
- `{{currentDate}}` - 当前日期
- `{{featureId}}` - 功能ID
- `{{featureTitle}}` - 功能标题
- `{{featureDescription}}` - 功能描述

## 工作流程示例

### 场景一：完整项目开发流程

```bash
# 1. 初始化项目
agent-cli init ecommerce-platform \
  --template web-app \
  --tech-stack "react,typescript,tailwind,express" \
  --description "电商平台前端应用"

# 2. 查看初始状态
agent-cli status

# 3. 开始第一个开发周期
agent-cli next

# 4. 实现功能（使用AI智能体）
# ... 在此处使用AI助手实现功能 ...

# 5. 运行测试
agent-cli test --report

# 6. 重复步骤3-5，直到项目完成
```

### 场景二：已有项目接入

```bash
# 1. 在现有项目目录中
cd existing-project

# 2. 初始化Agent CLI配置
agent-cli config --init

# 3. 导入现有功能列表
agent-cli import --from ./existing-features.json

# 4. 设置Git集成
agent-cli git --init

# 5. 开始增量开发
agent-cli next
```

### 场景三：团队协作流程

```bash
# 开发者A：开始新功能
agent-cli next --feature-id "user-auth"

# 开发者A：实现并测试功能后提交
git add .
git commit -m "feat: 实现用户认证功能"
git push

# 开发者B：拉取最新代码
git pull

# 开发者B：查看最新项目状态
agent-cli status

# 开发者B：继续下一个功能
agent-cli next
```

## 高级功能

### 上下文监控系统

上下文监控系统帮助管理AI模型的token使用，避免超出上下文限制。

**主要功能**：
- 实时Token使用估算
- 阈值预警（默认80%）
- 自动会话总结生成
- Token使用历史记录

**使用场景**：
```bash
# 监控长会话
agent-cli context --monitor --threshold 0.75

# 分析历史对话
agent-cli context --analyze ./conversation.json

# 生成优化建议
agent-cli context --optimize
```

### Git自动化集成

Git集成模块提供自动化版本控制功能。

**特性**：
- 自动化提交（基于功能完成）
- 智能提交消息模板
- 分支管理
- 状态检查和同步

**配置示例**：
```json
{
  "git": {
    "autoCommit": true,
    "branch": "main",
    "commitTemplate": "feat: {description}\n\n实现功能: {details}\n相关文件: {files}\n测试状态: {testStatus}",
    "commitOnTestPass": true,
    "tagReleases": true
  }
}
```

### 测试框架集成

支持多种测试框架，自动验证功能实现。

**支持的功能**：
- 端到端测试（Puppeteer/Playwright）
- 单元测试集成
- 测试报告生成
- 截图和视频录制

**配置示例**：
```json
{
  "testing": {
    "framework": "puppeteer",
    "headless": true,
    "timeout": 30000,
    "takeScreenshots": true,
    "recordVideo": false,
    "viewport": {
      "width": 1280,
      "height": 720
    }
  }
}
```

## 故障排除

### 常见问题

**Q: 初始化失败，提示"配置文件已存在"**
```
A: 删除现有的 agent.config.json 文件，或使用 --force 参数覆盖
```

**Q: 测试运行时浏览器无法启动**
```
A: 确保已安装Chrome/Chromium，或配置正确的浏览器路径
```

**Q: Git操作失败，权限被拒绝**
```
A: 检查Git配置和SSH密钥，确保有仓库访问权限
```

**Q: 上下文监控警告频繁触发**
```
A: 调整 warningThreshold 配置值，或启用 autoSummarize 减少token使用
```

### 错误代码参考

| 错误代码 | 描述 | 解决方案 |
|---------|------|----------|
| ERR_CONFIG_LOAD | 配置加载失败 | 检查配置文件格式和权限 |
| ERR_GIT_OPERATION | Git操作失败 | 检查Git配置和网络连接 |
| ERR_TEST_TIMEOUT | 测试超时 | 增加超时时间或优化测试 |
| ERR_CONTEXT_LIMIT | 上下文超出限制 | 启用自动总结或减少输入 |
| ERR_TEMPLATE_RENDER | 模板渲染失败 | 检查模板语法和变量 |

### 日志和调试

```bash
# 启用详细日志
agent-cli --verbose <command>

# 查看日志文件
tail -f logs/agent-cli.log

# 调试特定模块
DEBUG=agent-cli:* agent-cli status

# 性能分析
agent-cli --profile test
```

## 最佳实践

### 项目管理建议

1. **保持功能原子性**：每个功能应独立可测试
2. **定期运行测试**：每次功能实现后都应验证
3. **使用Git提交模板**：保持提交消息一致性
4. **监控上下文使用**：避免超出模型限制
5. **定期生成报告**：跟踪项目进度和健康状况

### 配置管理建议

1. **版本控制配置文件**：将 agent.config.json 纳入Git管理
2. **使用环境变量管理敏感信息**：如API密钥、访问令牌
3. **分层配置策略**：全局配置 → 项目配置 → 环境特定配置
4. **定期备份配置**：使用 config --export 命令备份

### 团队协作建议

1. **统一模板和配置**：团队使用相同的模板和配置标准
2. **代码审查流程**：结合Git集成进行代码审查
3. **持续集成**：将Agent CLI集成到CI/CD流程中
4. **知识共享**：定期分享使用经验和最佳实践

## 附录

### 命令行补全

```bash
# 安装命令行补全（bash）
agent-cli completion bash > /etc/bash_completion.d/agent-cli

# 安装命令行补全（zsh）
agent-cli completion zsh > /usr/local/share/zsh/site-functions/_agent-cli
```

### 性能调优

```bash
# 启用缓存
agent-cli config --set "features.enableCaching=true"

# 调整并行度
agent-cli config --set "agent.maxConcurrentOperations=3"

# 优化测试性能
agent-cli config --set "testing.headless=true"
agent-cli config --set "testing.timeout=60000"
```

### 集成第三方工具

Agent CLI 可以与以下工具集成：
- **Docker**：容器化部署
- **CI/CD**：Jenkins、GitHub Actions、GitLab CI
- **监控系统**：Prometheus、Grafana
- **项目管理**：Jira、Trello、Notion

### 获取帮助

```bash
# 查看所有命令帮助
agent-cli --help

# 查看特定命令帮助
agent-cli init --help
agent-cli test --help

# 查看版本信息
agent-cli --version

# 查看项目信息
agent-cli info
```

---

## 更新日志

### 版本 1.0.0 (2026-02-16)
- ✅ 核心功能全部完成（94.6%进度）
- ✅ 70个单元测试全部通过
- ✅ 完整的配置系统和模板系统
- ✅ 上下文监控和Git自动化集成
- ✅ 详细的用户指南和文档

### 未来计划
- 🔄 可视化Web界面开发
- 🔄 更多AI模型支持
- 🔄 插件系统扩展
- 🔄 云服务集成

---

*文档版本: 1.0.0*
*最后更新: 2026-02-16*
*维护者: Agent CLI 开发团队*

如需进一步帮助，请查看：
- [项目主页](https://github.com/your-username/agent-cli)
- [问题追踪](https://github.com/your-username/agent-cli/issues)
- [讨论区](https://github.com/your-username/agent-cli/discussions)