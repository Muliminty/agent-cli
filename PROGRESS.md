# 长效运行智能体CLI工具 - 进度文档

## 项目概述
实现《Effective harnesses for long-running agents》文章中描述的双轨方案，创建一个独立的Node.js/TypeScript CLI工具，用于管理长效运行智能体项目，支持初始化、增量进展、状态跟踪和自动化测试。

**核心目标**：通过结构化的进度跟踪、增量功能实现和自动化测试，确保智能体能够在多个会话间保持稳定进展，产出高质量的代码。

## 当前状态
**阶段**：第二阶段核心模块（智能体框架和上下文监控完成）
**进度**：48.2%
**最后更新时间**：2026-02-14

## 已完成的工作 ✅

### 1. 项目初始化
- 创建独立项目目录 `/Users/muliminty/project/agent-cli`
- 配置完整的 `package.json` 包含所有依赖
- 设置 TypeScript 编译和构建工具

### 2. 构建配置
- `tsconfig.json` - TypeScript 配置（ES2022 + ESM）
- `tsup.config.ts` - 构建配置（支持ESM和类型生成）
- `jest.config.js` - 测试配置（Jest + ts-jest）
- `.gitignore` - Git 忽略文件

### 3. 核心类型系统（已完成）
- `src/types/feature.ts` - 功能类型定义（Feature、TestResult、FeatureList）
- `src/types/config.ts` - 配置类型定义（使用 Zod schema 验证）
- `src/types/project.ts` - 项目状态类型定义（ProjectState、ProgressEntry、ProjectContext）
- `src/config/schema.ts` - 配置验证、合并和JSON Schema生成

### 4. 技术栈配置
- **语言**: TypeScript (ES2022 + ESM)
- **构建工具**: tsup
- **测试框架**: Jest + ts-jest
- **核心依赖**: commander.js, chalk, inquirer, zod, fs-extra, simple-git, puppeteer 等

### 5. CLI框架和工具模块（已完成）
- `bin/agent-cli` - CLI可执行文件入口 ✓
- `src/cli/index.ts` - CLI框架和命令路由 ✓
- `src/utils/logger.ts` - 日志工具（彩色输出、文件日志）✓
- `src/utils/file-utils.ts` - 文件操作工具（安全的读写、批量操作、模板渲染）✓
- `src/config/loader.ts` - 配置文件加载和解析 ✓
- `src/config/defaults.ts` - 默认配置常量 ✓
- `src/core/progress/tracker.ts` - 进度跟踪器（核心模块）✓

### 6. Git集成模块（已完成）
- `src/core/git/manager.ts` - Git管理器（高级API）✓
- `src/core/git/operations.ts` - Git操作封装（底层API）✓
- 仓库初始化和配置 ✓
- 自动化提交和模板系统 ✓
- 分支管理和状态检查 ✓
- 错误处理和重试机制 ✓

### 7. 上下文监控系统（已完成）
- `src/utils/token-counter.ts` - Token估算器（基于经验规则）✓
- `src/core/agent/context-monitor.ts` - 完整版上下文监控智能体 ✓
- `src/core/agent/context-monitor-simple.ts` - 简化版上下文监控智能体 ✓
- 扩展配置类型和schema支持上下文监控 ✓
- 实时token使用估算和阈值预警 ✓
- 会话总结生成和token历史记录 ✓

## 待完成的任务 📋

### 第一阶段：基础框架（剩余部分）

#### 1. CLI框架实现
- [x] `src/cli/index.ts` - CLI入口和参数解析 ✓
- [x] `src/cli/parser.ts` - 命令行参数解析器 ✓
- [x] `bin/agent-cli` - CLI可执行文件入口 ✓
- [ ] `src/cli/commands/` - 命令实现目录结构

#### 2. 工具函数模块
- [x] `src/utils/logger.ts` - 日志工具（彩色输出、文件日志）✓
- [x] `src/utils/file-utils.ts` - 文件操作工具 ✓
- [ ] `src/utils/prompt-utils.ts` - 交互式提示工具
- [ ] `src/utils/validation.ts` - 数据验证工具

#### 3. 配置加载器
- [x] `src/config/loader.ts` - 配置文件加载和解析 ✓
- [x] `src/config/defaults.ts` - 默认配置常量 ✓

### 第二阶段：核心模块

#### 4. 进度跟踪系统
- [x] `src/core/progress/tracker.ts` - 进度跟踪器（核心）✓
- [ ] `src/core/progress/feature-list.ts` - 功能列表管理器
- [ ] `src/core/progress/state-manager.ts` - 状态管理器

#### 5. Git集成模块
- [x] `src/core/git/manager.ts` - Git管理器 ✓
- [x] `src/core/git/operations.ts` - Git操作封装 ✓

#### 6. 智能体基类
- [x] `src/core/agent/base.ts` - 基础智能体抽象类 ✓
- [x] `src/core/agent/initializer.ts` - 初始化智能体 ✓
- [x] `src/core/agent/context-monitor.ts` - 上下文监控智能体 ✓
- [x] `src/core/agent/context-monitor-simple.ts` - 简化版上下文监控智能体 ✓
- [x] `src/core/agent/` - 智能体模块目录结构 ✓

### 第三阶段：智能体实现

#### 7. 初始化智能体
- [x] `src/core/agent/initializer.ts` - 初始化智能体实现 ✓
- [x] 项目脚手架生成逻辑 ✓
- [x] 功能列表生成算法 ✓

#### 8. 编码智能体
- [ ] `src/core/agent/coder.ts` - 编码智能体实现
- [ ] 增量功能选择逻辑
- [ ] 代码修改和测试流程

### 第四阶段：测试集成

#### 9. 测试框架
- [ ] `src/core/test/puppeteer-runner.ts` - Puppeteer测试运行器
- [ ] `src/core/test/test-manager.ts` - 测试管理器
- [ ] 测试结果管理和报告生成

#### 10. 端到端测试
- [ ] 实际项目测试用例
- [ ] 功能验证流程
- [ ] 错误处理和恢复机制

### 第五阶段：完善和优化

#### 11. CLI命令实现
- [ ] `src/cli/commands/init.ts` - 初始化命令
- [ ] `src/cli/commands/status.ts` - 状态查看命令
- [ ] `src/cli/commands/next.ts` - 下一步实现命令
- [ ] `src/cli/commands/test.ts` - 测试命令
- [ ] `src/cli/commands/config.ts` - 配置管理命令

#### 12. 模板系统
- [ ] `templates/init-prompt.md` - 初始化提示词模板
- [ ] `templates/coder-prompt.md` - 编码提示词模板
- [ ] `templates/feature-list.json` - 功能列表模板

#### 13. 文档和示例
- [ ] `README.md` - 项目文档
- [ ] `examples/web-app/` - 示例项目
- [ ] 用户指南和API文档

#### 14. 上下文监控系统
- [x] `src/utils/token-counter.ts` - Token估算器 ✓
- [x] `src/core/agent/context-monitor.ts` - 上下文监控智能体 ✓
- [x] `src/core/agent/context-monitor-simple.ts` - 简化版上下文监控智能体 ✓
- [x] 扩展配置类型和schema ✓
- [x] `src/cli/commands/context.ts` - 上下文监控CLI命令 ✓
- [ ] 集成到智能体框架中

## 文件结构现状

```
agent-cli/
├── package.json                    # 项目配置和依赖 ✓
├── tsconfig.json                   # TypeScript配置 ✓
├── tsup.config.ts                  # 构建配置 ✓
├── jest.config.js                  # 测试配置 ✓
├── .gitignore                      # Git忽略配置 ✓
├── PROGRESS.md                     # 进度文档（当前文件）✓
└── src/
    ├── types/
    │   ├── index.ts                # 类型导出 ✓
    │   ├── feature.ts              # 功能类型定义 ✓
    │   ├── config.ts               # 配置类型定义 ✓
    │   └── project.ts              # 项目状态类型 ✓
    └── config/
        └── schema.ts               # 配置schema和验证 ✓
```

## 技术栈详情

### 已安装依赖
- **运行时依赖**:
  - `commander` - CLI框架
  - `chalk` - 彩色输出
  - `inquirer` - 交互式提示
  - `ora` - 进度指示器
  - `fs-extra` - 增强的文件操作
  - `zod` - 类型验证
  - `simple-git` - Git操作封装
  - `puppeteer` - 端到端测试
  - `execa` - 子进程执行
  - `boxen` - 终端框显示

- **开发依赖**:
  - `typescript` - TypeScript编译器
  - `tsup` - 构建工具
  - `jest` + `ts-jest` - 测试框架
  - `@types/*` - 类型定义
  - `eslint` + `prettier` - 代码质量工具

### 构建配置
- **目标环境**: Node.js >= 18.0.0
- **模块系统**: ESM (ES2022)
- **构建输出**: `dist/` 目录
- **类型生成**: 自动生成 `.d.ts` 文件

## 下一步行动计划 🚀

### 已完成的高优先级任务 ✅

1. **CLI入口文件** (`bin/agent-cli`) ✓
   - 创建可执行文件入口
   - 设置正确的shebang和权限

2. **CLI框架** (`src/cli/index.ts`) ✓
   - 实现命令行参数解析
   - 设置命令路由
   - 添加帮助和版本信息

3. **日志工具** (`src/utils/logger.ts`) ✓
   - 彩色控制台输出
   - 文件日志记录
   - 进度指示器

4. **配置加载器** (`src/config/loader.ts`) ✓
   - 读取和验证配置文件
   - 环境变量支持
   - 配置合并逻辑

5. **进度跟踪器** (`src/core/progress/tracker.ts`) ✓
   - 管理 `claude-progress.txt`
   - 状态同步机制
   - 进度报告生成

### 已完成的高优先级任务 ✅

1. **Git管理器** (`src/core/git/manager.ts`) ✓
   - Git仓库操作
   - 提交消息模板
   - 分支管理
   - 自动化提交
   - 状态检查和报告

2. **Git操作封装** (`src/core/git/operations.ts`) ✓
   - 底层Git命令封装
   - 错误处理和重试机制
   - 原子性操作保证

3. **智能体基类** (`src/core/agent/base.ts`) ✓
   - 通用智能体接口
   - 错误处理机制
   - 状态管理
   - 初始化智能体实现

4. **上下文监控基础** (`src/utils/token-counter.ts` 和 `src/core/agent/context-monitor*.ts`) ✓
   - Token估算器实现
   - 上下文使用率计算
   - 预警阈值配置
   - 实时监控和预警系统

### 新的高优先级任务（建议接下来完成）

1. **文件操作工具** (`src/utils/file-utils.ts`)
   - 文件读写操作
   - 目录创建和清理
   - 路径处理工具

2. **命令解析器** (`src/cli/parser.ts`)
   - 命令行参数解析
   - 选项验证
   - 命令路由

3. **上下文监控CLI命令** (`src/cli/commands/context.ts`)
   - 上下文使用率检查
   - Token估算和预警
   - 集成监控智能体

### 中优先级（核心功能）

1. **功能列表管理器** (`src/core/progress/feature-list.ts`)
   - 功能状态管理
   - 依赖关系解析
   - 优先级排序

2. **状态管理器** (`src/core/progress/state-manager.ts`)
   - 项目状态同步
   - 冲突检测和解决
   - 备份和恢复

3. **交互式提示工具** (`src/utils/prompt-utils.ts`)
   - 用户输入处理
   - 选择菜单
   - 确认对话框

### 低优先级（功能完善）

1. **模板文件** (`templates/`)
   - 初始化提示词模板
   - 编码提示词模板
   - 功能列表模板

2. **测试用例** (`tests/`)
   - 单元测试
   - 集成测试
   - 端到端测试

## 关键设计决策

### 1. 类型安全优先
- 使用 TypeScript 提供编译时类型检查
- 使用 Zod 进行运行时数据验证
- 所有外部输入都经过严格验证

### 2. 配置驱动架构
- 支持 JSON 配置文件 (`agent.config.json`)
- 环境变量覆盖机制
- 配置schema验证确保数据完整性

### 3. 模块化设计
- 清晰的模块边界和职责分离
- 易于测试和维护
- 支持未来的插件扩展

### 4. 错误处理和恢复
- 完善的错误处理机制
- 状态检查点和回滚
- 详细的错误日志和报告

### 5. 用户友好体验
- 彩色输出和进度指示
- 详细的帮助文档
- 交互式命令行界面

## 注意事项 ⚠️

### 开发注意事项
1. **代码风格**: 使用 ESLint + Prettier 保持代码一致性
2. **类型安全**: 所有函数都需要类型注解，避免使用 `any`
3. **错误处理**: 所有异步操作都需要错误处理
4. **测试覆盖**: 核心功能需要单元测试，重要流程需要集成测试

### 技术限制
1. **Node.js版本**: 要求 >= 18.0.0（使用ESM模块系统）
2. **平台兼容**: 主要支持 macOS 和 Linux，Windows 需要额外测试
3. **Git依赖**: 需要系统安装 Git 客户端
4. **浏览器依赖**: Puppeteer 需要 Chromium/Chrome

### 安全考虑
1. **文件权限**: 谨慎处理文件读写权限
2. **命令执行**: 避免命令注入风险
3. **配置文件**: 不要提交敏感信息到版本控制
4. **依赖安全**: 定期更新依赖包，检查安全漏洞

## 恢复开发指南

当需要继续开发时，可以按照以下步骤：

1. **安装依赖**:
   ```bash
   cd /Users/muliminty/project/agent-cli
   npm install
   ```

2. **启动开发环境**:
   ```bash
   npm run dev  # 监视模式构建
   npm test     # 运行测试
   ```

3. **查看当前进度**:
   - 阅读此文档了解已完成和待完成的任务
   - 检查 `src/` 目录中的现有代码
   - 查看 `package.json` 了解项目配置

4. **继续开发**:
   - 按照"下一步行动计划"中的优先级顺序开发
   - 每个功能完成后添加相应的测试
   - 定期运行 `npm test` 确保代码质量

## 联系方式

**项目位置**: `/Users/muliminty/project/agent-cli`
**文档更新**: 每次重要进展后更新此文件
**版本控制**: 建议使用 Git 进行版本管理

---
*最后更新: 2026-02-14*
*文档状态: 进行中*