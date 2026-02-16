# 长效运行智能体CLI工具

> 实现《Effective harnesses for long-running agents》双轨方案的Node.js/TypeScript CLI工具

## 项目状态

**当前阶段**: 第六阶段闭环Web界面优化
**进度**: 88.7% (102/115 任务完成)
**最后更新**: 2026-02-16 (完成Web界面和DeepSeek AI集成)

**测试状态**: ✅ 70个测试用例全部通过
**AI提供商**: Anthropic (Claude), OpenAI (GPT), DeepSeek
**Web界面**: ✅ 已实现 (通过 `agent-cli serve` 启动)

**已完成功能**: 完整的可视化Web界面、多AI提供商支持、实时任务监控、WebSocket实时通信

## 项目概述

这是一个用于管理长效运行智能体项目的CLI工具，实现了双轨方案，支持：

- **项目初始化**: 创建完整项目环境，生成详细功能列表
- **增量开发**: 每次只实现一个功能，保持环境干净状态
- **进度跟踪**: 结构化进度管理和状态同步
- **自动化测试**: 端到端功能验证和测试报告
- **Git集成**: 自动化版本控制和提交管理

**扩展计划**: 未来将提供可视化Web界面，通过 `agent-cli serve` 命令启动本地Web服务器，使非技术用户也能方便地管理和监控项目进度。

## 快速开始

### 安装依赖
```bash
cd /Users/muliminty/project/agent-cli
npm install
```

### 开发模式
```bash
npm run dev      # 监视模式构建
npm test         # 运行测试
npm run build    # 生产构建
```

## 使用示例

### 基本命令

```bash
# 查看所有可用命令
agent-cli --help

# 初始化新项目
agent-cli init my-project --template web-app

# 查看项目状态
agent-cli status

# 获取下一个推荐功能
agent-cli next

# 执行测试
agent-cli test --suites "tests/*.json"

# 生成项目报告
agent-cli report --type summary --format html --output ./report.html

# 管理配置
agent-cli config --list
agent-cli config --set "agent.model=claude-3-5-sonnet"

# 上下文监控
agent-cli context --input messages.json --threshold 0.8

# 项目重置
agent-cli reset --type progress --backup

# 模板管理
agent-cli template list
agent-cli template info init-prompt
agent-cli template render init-prompt --output ./output.md --data '{"projectName":"测试"}'
agent-cli template add ./my-template.md
```

### 配置文件示例

创建 `agent.config.json` 文件：

```json
{
  "$schema": "./node_modules/agent-cli/schemas/config.schema.json",
  "project": {
    "name": "my-web-app",
    "description": "A modern web application",
    "type": "web-app",
    "techStack": ["react", "typescript", "tailwind"]
  },
  "agent": {
    "model": "claude-3-5-sonnet",
    "initializer": {
      "maxFeatures": 200,
      "featureDetailLevel": "high"
    },
    "coder": {
      "incrementalMode": true,
      "maxStepsPerSession": 1,
      "requireTests": true
    },
    "contextMonitor": {
      "enabled": true,
      "warningThreshold": 0.8,
      "autoSummarize": true
    },
    "ai": {
      "defaultProvider": "anthropic",
      "defaultModel": "claude-3-5-sonnet",
      "temperature": 0.7,
      "maxTokens": 4096,
      "stream": true,
      "providers": {
        "anthropic": {
          "provider": "anthropic",
          "apiKey": "${ANTHROPIC_API_KEY}",
          "enabled": true
        },
        "openai": {
          "provider": "openai",
          "apiKey": "${OPENAI_API_KEY}",
          "enabled": true
        },
        "deepseek": {
          "provider": "deepseek",
          "apiKey": "${DEEPSEEK_API_KEY}",
          "enabled": true
        }
      },
      "usageStats": {
        "enabled": true,
        "trackCosts": true,
        "currency": "USD"
      }
    }
  },
  "testing": {
    "framework": "puppeteer",
    "headless": true,
    "timeout": 30000
  },
  "git": {
    "autoCommit": true,
    "branch": "main"
  }
}
```

## 项目结构

```
agent-cli/
├── package.json                    # 项目配置和依赖 ✓
├── tsconfig.json                   # TypeScript配置 ✓
├── tsup.config.ts                  # 构建配置 ✓
├── jest.config.js                  # 测试配置 ✓
├── .gitignore                      # Git忽略配置 ✓
├── !doc/                           # 文档目录 ✓
│   ├── PROGRESS.md                 # 详细进度文档 ✓
│   ├── TODO.md                     # 任务清单和优先级 ✓
│   ├── USER_GUIDE.md               # 完整用户指南 ✓
│   ├── Agent-CLI-项目介绍与使用指南.md # 项目介绍和推广文章 ✓
│   └── 避免上下文爆炸的开发工作流方案.md # 技术方案原理解析 ✓
├── README.md                       # 项目文档（当前文件）✓
├── bin/
│   └── agent-cli                   # CLI可执行文件入口 ✓
├── templates/                      # 模板系统 ✓
│   ├── init-prompt.md              # 初始化提示词模板 ✓
│   ├── coder-prompt.md             # 编码提示词模板 ✓
│   └── feature-list.json           # 功能列表模板 ✓
├── examples/                       # 示例项目 ✓
│   └── web-app/                    # 完整的Todo Web应用示例 ✓
└── src/
    ├── types/                      # 类型定义 ✓
    │   ├── index.ts                # 类型导出 ✓
    │   ├── feature.ts              # 功能类型定义 ✓
    │   ├── config.ts               # 配置类型定义 ✓
    │   └── project.ts              # 项目状态类型 ✓
    ├── config/                     # 配置管理 ✓
    │   ├── loader.ts               # 配置加载和解析 ✓
    │   ├── defaults.ts             # 默认配置常量 ✓
    │   └── schema.ts               # 配置schema和验证 ✓
    ├── cli/                        # CLI框架 ✓
    │   ├── index.ts                # CLI入口和命令路由 ✓
    │   ├── parser.ts               # 命令行参数解析 ✓
    │   └── commands/               # CLI命令实现 ✓
    ├── core/                       # 核心模块 ✓
    │   ├── progress/               # 进度跟踪系统 ✓
    │   ├── git/                    # Git集成模块 ✓
    │   ├── agent/                  # 智能体框架 ✓
    │   └── test/                   # 测试框架 ✓
    ├── utils/                      # 工具函数 ✓
    │   ├── logger.ts               # 日志工具 ✓
    │   ├── file-utils.ts           # 文件操作工具 ✓
    │   └── token-counter.ts        # Token估算器 ✓
    └── index.ts                    # 主入口 ✓
```

## 技术栈

- **语言**: TypeScript (ES2022 + ESM)
- **运行时**: Node.js >= 18.0.0
- **构建工具**: tsup
- **测试框架**: Jest + ts-jest + Puppeteer
- **核心库**: commander.js, chalk, inquirer, zod, fs-extra, simple-git

## 进度跟踪

### 已完成
- ✅ **项目基础架构**：TypeScript构建配置、测试配置、Git忽略配置
- ✅ **核心类型系统**：Feature、Config、Project类型定义和Zod验证schema
- ✅ **CLI框架**：可执行文件入口、命令路由、参数解析、帮助系统
- ✅ **配置系统**：配置文件加载、环境变量支持、配置合并和验证
- ✅ **进度跟踪系统**：双轨方案实现、进度文件管理、状态同步机制
- ✅ **Git集成模块**：Git管理器、操作封装、自动化提交、分支管理
- ✅ **智能体框架**：基础智能体抽象类、初始化智能体、编码智能体、上下文监控智能体
- ✅ **上下文监控系统**：Token估算器、实时监控、阈值预警、自动会话总结
- ✅ **模板系统**：初始化提示词模板、编码提示词模板、功能列表模板
- ✅ **测试框架**：Puppeteer测试运行器、测试管理器、结果管理和报告生成
- ✅ **工具函数**：日志工具、文件操作工具、Token估算器
- ✅ **CLI命令**：config（配置管理）、report（报告生成）、reset（项目重置）、context（上下文监控）等命令
- ✅ **示例项目**：完整的Todo Web应用示例，包含测试套件和文档

### 待完成（剩余3.2%）
- ✅ **模板系统完善**：变量替换功能、模板自定义支持
- ✅ **测试套件编写**：70个单元测试全部通过，覆盖工具模块和配置系统
- 🟨 **文档完善**：用户指南✅、API文档⬜、最佳实践指南⬜
- ⬜ **可视化Web界面**（可选）：CLI + 本地Web服务器方案

**说明**：项目核心功能（96.8%）已基本完成，剩余主要是文档完善和可选的可视化界面。

详细任务列表请查看 [!doc/TODO.md](!doc/TODO.md)

## 开发指南

### 恢复开发
当需要继续开发时，请按照以下步骤：

1. **查看当前状态**:
   ```bash
   cd /Users/muliminty/project/agent-cli
   cat "!doc/PROGRESS.md"  # 查看详细进度
   cat "!doc/TODO.md"      # 查看任务清单
   ```

2. **安装依赖**:
   ```bash
   npm install
   ```

3. **启动开发环境**:
   ```bash
   npm run dev      # 自动构建和监视
   ```

4. **继续开发**:
   - 按照 `TODO.md` 中的"紧急任务"顺序开发
   - 每个功能完成后添加相应的测试
   - 定期运行 `npm test` 确保代码质量

### 代码规范
- 使用 TypeScript 严格模式
- 所有函数都需要类型注解
- 使用 ESLint + Prettier 保持代码一致性
- 重要功能需要单元测试

## 设计理念

### 双轨方案实现
1. **轨道A（结构化进度）**: `claude-progress.txt` + `feature-list.json` + Git历史
2. **轨道B（增量开发）**: 每次只实现一个功能，保持原子性提交

### 核心原则
- **类型安全**: 使用 TypeScript + Zod 确保数据完整性
- **配置驱动**: JSON配置文件支持自定义设置
- **模块化设计**: 清晰的职责分离，便于测试和维护
- **错误恢复**: 完善的错误处理和状态恢复机制

## 配置文件示例

```json
{
  "$schema": "./node_modules/agent-cli/schemas/config.schema.json",
  "project": {
    "name": "my-web-app",
    "description": "A modern web application",
    "type": "web-app",
    "techStack": ["react", "typescript", "tailwind"]
  },
  "agent": {
    "model": "claude-3-5-sonnet",
    "initializer": {
      "maxFeatures": 200,
      "featureDetailLevel": "high"
    },
    "coder": {
      "incrementalMode": true,
      "maxStepsPerSession": 1,
      "requireTests": true
    }
  },
  "testing": {
    "framework": "puppeteer",
    "headless": true,
    "timeout": 30000
  },
  "git": {
    "autoCommit": true,
    "branch": "main"
  }
}
```

## 核心功能状态

### 已完成的核心功能 ✅

1. **CLI框架** - 完整的命令行界面，支持10+命令
2. **配置系统** - JSON配置文件、环境变量、配置验证
3. **进度跟踪系统** - 双轨方案实现，结构化进度管理
4. **Git集成模块** - 自动化提交、分支管理、状态同步
5. **智能体框架** - 基础智能体、初始化智能体、编码智能体、上下文监控智能体
6. **上下文监控系统** - Token估算、实时预警、自动会话总结
7. **模板系统** - 变量替换、自定义模板、模板管理CLI命令
8. **测试框架** - Puppeteer测试运行器、测试管理器、报告生成
9. **工具函数库** - 文件操作、日志、Token计数器、验证工具
10. **示例项目** - 完整的Todo Web应用示例，包含测试套件

### 剩余优化任务 📋

1. **测试套件完善** - ✅ 70个单元测试全部通过，覆盖工具模块和配置系统
2. **文档完善** - 🟨 用户指南✅、API文档⬜、最佳实践指南⬜
3. **可视化Web界面** (可选) - ⬜ CLI + 本地Web服务器方案

### 文档资源
- [!doc/PROGRESS.md](!doc/PROGRESS.md) - 详细开发进度和当前状态
- [!doc/TODO.md](!doc/TODO.md) - 任务清单和优先级
- [!doc/USER_GUIDE.md](!doc/USER_GUIDE.md) - 完整用户指南和详细使用说明
- [!doc/Agent-CLI-项目介绍与使用指南.md](!doc/Agent-CLI-项目介绍与使用指南.md) - 项目介绍和推广文章
- [!doc/避免上下文爆炸的开发工作流方案.md](!doc/避免上下文爆炸的开发工作流方案.md) - 技术方案原理解析

### 详细进度
请查看 [!doc/PROGRESS.md](!doc/PROGRESS.md) 获取详细进度和 [!doc/TODO.md](!doc/TODO.md) 查看任务清单。

## 联系方式

**项目位置**: `/Users/muliminty/project/agent-cli`
**文档位置**: `!doc/PROGRESS.md`, `!doc/TODO.md`, `README.md`, `!doc/USER_GUIDE.md`
**开发状态**: 核心功能已完成 (96.8%)，剩余优化任务进行中

---
*开始时间: 2026-02-13*
*最后更新: 2026-02-16 (更新测试进展和用户指南)*
*维护者: Muliminty*