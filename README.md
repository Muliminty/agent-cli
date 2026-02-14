# 长效运行智能体CLI工具

> 实现《Effective harnesses for long-running agents》双轨方案的Node.js/TypeScript CLI工具

## 项目状态

**当前阶段**: 第二阶段核心模块（Git集成完成）
**进度**: 28.8% (21/73 任务完成)
**最后更新**: 2026-02-14

## 项目概述

这是一个用于管理长效运行智能体项目的CLI工具，实现了双轨方案，支持：

- **项目初始化**: 创建完整项目环境，生成详细功能列表
- **增量开发**: 每次只实现一个功能，保持环境干净状态
- **进度跟踪**: 结构化进度管理和状态同步
- **自动化测试**: 端到端功能验证和测试报告
- **Git集成**: 自动化版本控制和提交管理

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

## 项目结构

```
agent-cli/
├── package.json                    # 项目配置和依赖
├── tsconfig.json                   # TypeScript配置
├── tsup.config.ts                  # 构建配置
├── jest.config.js                  # 测试配置
├── .gitignore                      # Git忽略配置
├── PROGRESS.md                     # 详细进度文档
├── TODO.md                         # 任务清单
├── README.md                       # 项目文档（当前文件）
└── src/
    ├── types/                      # 类型定义 ✓
    │   ├── index.ts                # 类型导出
    │   ├── feature.ts              # 功能类型定义
    │   ├── config.ts               # 配置类型定义
    │   └── project.ts              # 项目状态类型
    ├── config/                     # 配置管理
    │   └── schema.ts               # 配置schema和验证 ✓
    ├── cli/                        # CLI框架（待实现）
    ├── core/                       # 核心模块（待实现）
    ├── utils/                      # 工具函数（待实现）
    └── index.ts                    # 主入口（待实现）
```

## 技术栈

- **语言**: TypeScript (ES2022 + ESM)
- **运行时**: Node.js >= 18.0.0
- **构建工具**: tsup
- **测试框架**: Jest + ts-jest + Puppeteer
- **核心库**: commander.js, chalk, inquirer, zod, fs-extra, simple-git

## 进度跟踪

### 已完成
- ✅ 项目初始化和配置
- ✅ TypeScript构建配置
- ✅ 核心类型系统（Feature, Config, Project）
- ✅ 配置验证schema（使用Zod）
- ✅ 进度文档和任务清单
- ✅ CLI入口文件和框架
- ✅ 日志工具（彩色输出、文件日志）
- ✅ 配置加载器和默认配置
- ✅ 进度跟踪器（核心模块）
- ✅ Git集成模块（管理器和操作封装）

### 待完成
- ✅ CLI框架实现
- ✅ 工具函数模块（部分）
- ✅ 配置加载器
- ✅ 进度跟踪系统（核心）
- ✅ Git集成模块
- ⬜ 智能体实现
- ⬜ 测试框架
- ⬜ 模板系统
- ⬜ 文件操作工具
- ⬜ 交互式提示工具
- ⬜ 命令解析器

详细任务列表请查看 [TODO.md](./TODO.md)

## 开发指南

### 恢复开发
当需要继续开发时，请按照以下步骤：

1. **查看当前状态**:
   ```bash
   cd /Users/muliminty/project/agent-cli
   cat PROGRESS.md  # 查看详细进度
   cat TODO.md      # 查看任务清单
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

## 下一步计划

### 高优先级（建议接下来完成）
1. ✅ 实现 CLI 入口文件和框架
2. ✅ 创建日志和工具函数模块
3. ✅ 实现配置加载器
4. ✅ 实现进度跟踪器
5. ✅ 实现 Git 管理器
6. 实现智能体基类
7. 实现文件操作工具
8. 实现命令解析器

### 详细计划
请查看 [PROGRESS.md](./PROGRESS.md) 获取详细的下步行动计划。

## 联系方式

**项目位置**: `/Users/muliminty/project/agent-cli`
**文档位置**: `PROGRESS.md`, `TODO.md`
**开发状态**: 进行中

---
*开始时间: 2026-02-13*
*预计完成: 根据进度调整*
*维护者: Muliminty*