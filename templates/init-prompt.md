# 项目初始化提示词模板

## 项目基本信息
**项目名称**: {{projectName}}
**项目描述**: {{projectDescription}}
**项目类型**: {{projectType}} (可选: web-app, api-server, cli-tool, library, mobile-app, desktop-app, other)
**核心目标**: {{projectGoal}}

## 技术栈选择
**前端框架**: {{frontendFramework}} (可选: react, vue, angular, svelte, none)
**后端框架**: {{backendFramework}} (可选: express, koa, fastify, nestjs, none)
**数据库**: {{database}} (可选: postgresql, mysql, mongodb, sqlite, redis, none)
**编程语言**: {{programmingLanguage}} (可选: typescript, javascript, python, go, rust, java, other)
**样式方案**: {{styling}} (可选: tailwind, css-modules, styled-components, sass, less, none)
**构建工具**: {{buildTool}} (可选: webpack, vite, rollup, esbuild, none)

## 项目结构要求
**代码组织**: {{codeOrganization}} (可选: feature-based, layer-based, domain-driven, simple)
**测试策略**: {{testingStrategy}} (可选: unit-tests, integration-tests, e2e-tests, tdd, bdd, minimal)
**代码质量**: {{codeQuality}} (可选: eslint, prettier, husky, commitlint, simple)

## 核心功能需求
请列出项目需要实现的核心功能，按优先级排序：

### 高优先级 (P0)
1. **{{feature1Name}}**: {{feature1Description}}
   - 技术实现: {{feature1Implementation}}
   - 验收标准: {{feature1AcceptanceCriteria}}

2. **{{feature2Name}}**: {{feature2Description}}
   - 技术实现: {{feature2Implementation}}
   - 验收标准: {{feature2AcceptanceCriteria}}

### 中优先级 (P1)
3. **{{feature3Name}}**: {{feature3Description}}
   - 技术实现: {{feature3Implementation}}
   - 验收标准: {{feature3AcceptanceCriteria}}

4. **{{feature4Name}}**: {{feature4Description}}
   - 技术实现: {{feature4Implementation}}
   - 验收标准: {{feature4AcceptanceCriteria}}

### 低优先级 (P2)
5. **{{feature5Name}}**: {{feature5Description}}
   - 技术实现: {{feature5Implementation}}
   - 验收标准: {{feature5AcceptanceCriteria}}

## 非功能需求
**性能要求**: {{performanceRequirements}}
**安全性要求**: {{securityRequirements}}
**可维护性**: {{maintainabilityRequirements}}
**可扩展性**: {{scalabilityRequirements}}
**兼容性**: {{compatibilityRequirements}} (浏览器、设备、平台等)

## 开发约束
**时间限制**: {{timeConstraints}}
**技术限制**: {{technicalConstraints}}
**团队限制**: {{teamConstraints}}
**预算限制**: {{budgetConstraints}}

## 交付物要求
**代码仓库**: {{repositoryRequirements}}
**文档要求**: {{documentationRequirements}}
**部署要求**: {{deploymentRequirements}}
**监控要求**: {{monitoringRequirements}}

## 验收标准
**功能完成度**: {{functionalityCompletion}}
**代码质量**: {{codeQualityStandards}}
**测试覆盖率**: {{testCoverage}}
**性能指标**: {{performanceMetrics}}
**安全合规**: {{securityCompliance}}

## 特殊说明
{{specialInstructions}}

---

**模板使用说明**:
1. 将 `{{变量名}}` 替换为实际值
2. 可根据项目需要调整章节结构
3. 优先级分类可根据实际情况调整
4. 功能描述应具体、可测试
5. 验收标准应明确、可衡量

**生成的功能列表将用于**:
- 进度跟踪和状态管理
- 增量开发和测试验证
- Git提交和版本控制
- 项目报告和状态同步