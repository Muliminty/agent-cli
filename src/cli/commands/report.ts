/**
 * 报告生成命令模块
 * 设计思路：生成项目进展、测试结果、代码质量等多维度报告，支持多种格式输出
 *
 * 功能特点：
 * 1. 多类型报告：进度报告、测试报告、健康报告、综合报告
 * 2. 多格式输出：文本、JSON、HTML、Markdown
 * 3. 详细分析：趋势分析、问题诊断、改进建议
 * 4. 灵活配置：可自定义报告内容和样式
 *
 * 踩坑提醒：
 * 1. HTML报告需要处理模板和静态资源，注意路径解析
 * 2. 大项目报告生成要考虑性能，避免阻塞
 * 3. 文件写入要注意权限和并发问题
 * 4. 时间格式化要考虑时区和本地化
 */

import { Command } from 'commander'
import * as path from 'path'
import { createLogger } from '../../utils/logger.js'
import { loadConfig } from '../../config/loader.js'
import { ProgressTracker } from '../../core/progress/tracker.js'
import { GitManager } from '../../core/git/manager.js'
import type { Feature, FeatureList, ProjectState } from '../../types/index.js'
import type { GitStatus } from '../../core/git/manager.js'

// 报告类型
type ReportType = 'progress' | 'test' | 'health' | 'summary' | 'all'

// 输出格式
type ReportFormat = 'text' | 'json' | 'html' | 'markdown'

// 报告命令选项
interface ReportCommandOptions {
  /** 报告类型 */
  type?: ReportType
  /** 输出格式 */
  format?: ReportFormat
  /** 输出文件路径（默认输出到控制台） */
  output?: string
  /** 详细模式 */
  verbose?: boolean
  /** 调试模式 */
  debug?: boolean
  /** 指定配置文件 */
  config?: string
  /** 工作目录 */
  cwd?: string
  /** 覆盖报告标题 */
  title?: string
  /** 包含时间范围（格式：YYYY-MM-DD,YYYY-MM-DD） */
  timeRange?: string
  /** 包含功能ID列表（逗号分隔） */
  features?: string
  /** 包含标签列表（逗号分隔） */
  tags?: string
  /** 不包含已完成的功能 */
  'exclude-completed'?: boolean
  /** 包含详细测试结果 */
  'include-tests'?: boolean
  /** 包含Git历史 */
  'include-git'?: boolean
  /** 包含建议和行动计划 */
  'include-recommendations'?: boolean
  /** 强制覆盖输出文件 */
  force?: boolean
}

/**
 * 创建报告命令
 */
export function createReportCommand(): Command {
  const command = new Command('report')
    .description('生成项目报告 - 进度、测试、健康状态等多维度分析')
    .option('-t, --type <type>', '报告类型 (progress, test, health, summary, all)', 'summary')
    .option('-f, --format <format>', '输出格式 (text, json, html, markdown)', 'text')
    .option('-o, --output <path>', '输出文件路径（默认输出到控制台）')
    .option('-v, --verbose', '详细模式')
    .option('--debug', '调试模式')
    .option('-c, --config <path>', '指定配置文件路径', 'agent.config.json')
    .option('--cwd <path>', '设置工作目录', process.cwd())
    .option('--title <title>', '覆盖报告标题')
    .option('--time-range <range>', '时间范围 (格式: 2024-01-01,2024-12-31)')
    .option('--features <ids>', '包含特定功能ID（逗号分隔）')
    .option('--tags <tags>', '包含特定标签（逗号分隔）')
    .option('--exclude-completed', '不包含已完成的功能')
    .option('--include-tests', '包含详细测试结果')
    .option('--include-git', '包含Git历史')
    .option('--include-recommendations', '包含建议和行动计划')
    .option('--force', '强制覆盖输出文件')

    .action(async (options: ReportCommandOptions) => {
      await handleReportCommand(options)
    })

  // 添加示例
  command.addHelpText('after', `
使用示例:
  $ agent-cli report                            # 生成摘要报告（默认）
  $ agent-cli report --type progress            # 生成进度报告
  $ agent-cli report --type test                # 生成测试报告
  $ agent-cli report --type health              # 生成健康状态报告
  $ agent-cli report --type all                 # 生成综合报告
  $ agent-cli report --format html --output ./report.html  # 生成HTML报告
  $ agent-cli report --format json              # 生成JSON格式报告
  $ agent-cli report --format markdown          # 生成Markdown报告
  $ agent-cli report --verbose                  # 详细输出模式
  $ agent-cli report --time-range "2024-01-01,2024-12-31"  # 指定时间范围
  $ agent-cli report --features "feat1,feat2"   # 包含特定功能
  $ agent-cli report --tags "important,urgent"  # 包含特定标签
  $ agent-cli report --exclude-completed        # 不包含已完成功能
  $ agent-cli report --include-tests --include-git  # 包含测试和Git信息

报告类型说明:
  • progress   - 项目进度报告：功能完成情况、进度趋势、剩余工作量
  • test       - 测试报告：测试覆盖率、通过率、失败详情、历史趋势
  • health     - 健康状态报告：项目健康状况、风险识别、建议改进
  • summary    - 摘要报告：关键指标概览（默认）
  • all        - 综合报告：包含所有类型报告的完整版本

输出格式说明:
  • text      - 文本格式（控制台友好）
  • json      - JSON格式（机器可读，便于集成）
  • html      - HTML格式（可视化报告，适合分享）
  • markdown  - Markdown格式（文档友好，适合README）

报告内容:
  • 项目概览和关键指标
  • 功能状态和进度统计
  • 测试结果和质量指标
  • Git提交历史和趋势
  • 风险识别和改进建议
  • 行动计划和优先级
  `)

  return command
}

/**
 * 处理报告命令
 */
export async function handleReportCommand(options: ReportCommandOptions): Promise<void> {
  const logger = createLogger({ debug: options.debug })

  try {
    logger.title('📋 生成项目报告')

    // 加载配置
    const config = await loadConfig(options.config, options.cwd)
    const projectPath = options.cwd || process.cwd()

    // 检查项目是否已初始化
    const isInitialized = await checkProjectInitialization(projectPath, logger)
    if (!isInitialized) {
      logger.warn('项目未初始化或未找到进度文件')
      logger.info('💡 运行以下命令初始化项目:')
      logger.info('  $ agent-cli init <project-name>')
      return
    }

    // 加载进度跟踪器
    const progressTracker = await loadProgressTracker(projectPath, logger)

    // 生成报告数据
    const reportData = await generateReportData(progressTracker, options, logger)

    // 根据格式输出报告
    await outputReport(reportData, options, logger)

    logger.success('✅ 报告生成完成')

  } catch (error) {
    handleReportError(error, logger)
  }
}

/**
 * 检查项目是否已初始化
 */
async function checkProjectInitialization(projectPath: string, logger: ReturnType<typeof createLogger>): Promise<boolean> {
  try {
    const fs = await import('fs-extra')

    // 检查是否存在进度文件
    const progressFile = path.join(projectPath, 'claude-progress.txt')
    const featureListFile = path.join(projectPath, 'feature-list.json')

    const hasProgressFile = await fs.pathExists(progressFile)
    const hasFeatureListFile = await fs.pathExists(featureListFile)

    return hasProgressFile || hasFeatureListFile
  } catch (error) {
    logger.debug(`检查项目初始化失败: ${error}`)
    return false
  }
}

/**
 * 加载进度跟踪器
 */
async function loadProgressTracker(
  projectPath: string,
  logger: ReturnType<typeof createLogger>
): Promise<ProgressTracker> {
  try {
    const progressTracker = new ProgressTracker({
      projectPath,
      autoSave: false,
      verbose: false
    })

    await progressTracker.initialize()
    return progressTracker
  } catch (error) {
    throw new Error(`加载进度跟踪器失败: ${error}`)
  }
}

/**
 * 生成报告数据
 */
async function generateReportData(
  progressTracker: ProgressTracker,
  options: ReportCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<ReportData> {
  const projectState = progressTracker.getProjectState()
  const featureList = progressTracker.getFeatureList()
  const progressEntries = progressTracker.getProgressEntries()

  // 基础报告数据
  const reportData: ReportData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      reportType: options.type || 'summary',
      projectName: projectState.projectName || '未命名项目',
      projectPath: progressTracker.config.projectPath
    },
    summary: generateSummary(projectState, featureList),
    progress: generateProgressReport(projectState, featureList, progressEntries, options),
    features: generateFeaturesReport(featureList, options)
  }

  // 可选包含测试结果
  if (options['include-tests']) {
    reportData.tests = await generateTestsReport(progressTracker.config.projectPath, options, logger)
  }

  // 可选包含Git信息
  if (options['include-git']) {
    reportData.git = await generateGitReport(progressTracker.config.projectPath, options, logger)
  }

  // 可选包含建议
  if (options['include-recommendations']) {
    reportData.recommendations = generateRecommendations(reportData)
  }

  return reportData
}

/**
 * 生成摘要
 */
function generateSummary(projectState: ProjectState, featureList: FeatureList): ReportSummary {
  const totalFeatures = featureList.features.length
  const completedFeatures = featureList.features.filter(f => f.status === 'completed').length
  const inProgressFeatures = featureList.features.filter(f => f.status === 'in-progress').length
  const pendingFeatures = featureList.features.filter(f => f.status === 'pending').length

  const completionRate = totalFeatures > 0 ? (completedFeatures / totalFeatures) * 100 : 0

  // 计算健康状态
  let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
  if (completionRate < 30) {
    healthStatus = 'critical'
  } else if (completionRate < 70) {
    healthStatus = 'warning'
  }

  return {
    totalFeatures,
    completedFeatures,
    inProgressFeatures,
    pendingFeatures,
    completionRate,
    healthStatus,
    lastUpdated: projectState.lastUpdated || new Date().toISOString()
  }
}

/**
 * 生成进度报告
 */
function generateProgressReport(
  projectState: ProjectState,
  featureList: FeatureList,
  progressEntries: any[],
  options: ReportCommandOptions
): ProgressReport {
  // 过滤功能
  const filteredFeatures = filterFeatures(featureList.features, options)

  // 按状态分组
  const featuresByStatus = filteredFeatures.reduce((acc, feature) => {
    acc[feature.status] = (acc[feature.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // 计算趋势（简化版）
  const recentEntries = progressEntries.slice(-10) // 最近10个条目

  return {
    total: filteredFeatures.length,
    byStatus: featuresByStatus,
    recentProgress: recentEntries.map(entry => ({
      timestamp: entry.timestamp,
      action: entry.action,
      featureId: entry.featureId
    })),
    estimatedCompletion: estimateCompletion(filteredFeatures)
  }
}

/**
 * 生成功能报告
 */
function generateFeaturesReport(featureList: FeatureList, options: ReportCommandOptions): FeaturesReport {
  const filteredFeatures = filterFeatures(featureList.features, options)

  // 按优先级分组
  const byPriority = filteredFeatures.reduce((acc, feature) => {
    const priority = feature.priority || 'medium'
    acc[priority] = (acc[priority] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // 按复杂度分组
  const byComplexity = filteredFeatures.reduce((acc, feature) => {
    const complexity = feature.complexity || 'medium'
    acc[complexity] = (acc[complexity] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return {
    total: filteredFeatures.length,
    byPriority,
    byComplexity,
    features: filteredFeatures.map(feature => ({
      id: feature.id,
      name: feature.name,
      status: feature.status,
      priority: feature.priority,
      complexity: feature.complexity,
      description: feature.description?.substring(0, 100) // 截断长描述
    }))
  }
}

/**
 * 生成测试报告
 */
async function generateTestsReport(
  projectPath: string,
  options: ReportCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<TestReportSection> {
  // 这里可以集成TestManager获取测试结果
  // 暂时返回模拟数据
  logger.info('📊 测试报告功能正在开发中')

  return {
    totalTests: 0,
    passed: 0,
    failed: 0,
    successRate: 0,
    lastRun: null,
    details: []
  }
}

/**
 * 生成Git报告
 */
async function generateGitReport(
  projectPath: string,
  options: ReportCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<GitReportSection> {
  try {
    const gitManager = new GitManager({ projectPath })
    const status = await gitManager.getStatus()
    const recentCommits = await gitManager.getRecentCommits(10)

    return {
      branch: status.currentBranch || 'unknown',
      isClean: status.isClean,
      totalCommits: recentCommits.length,
      recentCommits: recentCommits.map(commit => ({
        hash: commit.hash?.substring(0, 8) || '',
        message: commit.message,
        author: commit.author,
        date: commit.date
      }))
    }
  } catch (error) {
    logger.warn(`获取Git信息失败: ${error}`)
    return {
      branch: 'unknown',
      isClean: false,
      totalCommits: 0,
      recentCommits: []
    }
  }
}

/**
 * 生成建议
 */
function generateRecommendations(reportData: ReportData): RecommendationsSection {
  const recommendations: string[] = []
  const actions: Array<{ priority: 'high' | 'medium' | 'low'; description: string }> = []

  // 基于摘要生成建议
  if (reportData.summary.completionRate < 30) {
    recommendations.push('项目进度较慢，建议优先完成核心功能')
    actions.push({
      priority: 'high',
      description: '识别并实现3-5个最关键的功能'
    })
  }

  if (reportData.summary.pendingFeatures > 10) {
    recommendations.push('待处理功能较多，建议分批实现')
    actions.push({
      priority: 'medium',
      description: '将功能按优先级分组，每批实现3-5个'
    })
  }

  // 基于功能状态生成建议
  const pendingFeatures = reportData.features.features.filter(f => f.status === 'pending')
  const highPriorityPending = pendingFeatures.filter(f => f.priority === 'high')

  if (highPriorityPending.length > 0) {
    recommendations.push(`有 ${highPriorityPending.length} 个高优先级功能待实现`)
    actions.push({
      priority: 'high',
      description: '优先实现高优先级功能: ' + highPriorityPending.map(f => f.name).join(', ')
    })
  }

  return {
    recommendations,
    actions
  }
}

/**
 * 过滤功能
 */
function filterFeatures(features: Feature[], options: ReportCommandOptions): Feature[] {
  let filtered = [...features]

  // 过滤已完成功能
  if (options['exclude-completed']) {
    filtered = filtered.filter(f => f.status !== 'completed')
  }

  // 过滤特定功能ID
  if (options.features) {
    const featureIds = options.features.split(',').map(id => id.trim())
    filtered = filtered.filter(f => featureIds.includes(f.id))
  }

  // 过滤标签
  if (options.tags) {
    const tags = options.tags.split(',').map(tag => tag.trim())
    filtered = filtered.filter(f =>
      f.tags && f.tags.some(tag => tags.includes(tag))
    )
  }

  return filtered
}

/**
 * 估算完成时间
 */
function estimateCompletion(features: Feature[]): { estimatedDays: number; confidence: 'high' | 'medium' | 'low' } {
  // 简化估算逻辑
  const completed = features.filter(f => f.status === 'completed').length
  const remaining = features.filter(f => f.status !== 'completed').length

  if (remaining === 0) {
    return { estimatedDays: 0, confidence: 'high' }
  }

  // 假设每天能完成2个功能
  const estimatedDays = Math.ceil(remaining / 2)

  // 根据历史完成率估算置信度
  let confidence: 'high' | 'medium' | 'low' = 'medium'
  if (completed > 10) {
    confidence = 'high'
  } else if (completed < 3) {
    confidence = 'low'
  }

  return { estimatedDays, confidence }
}

/**
 * 输出报告
 */
async function outputReport(
  reportData: ReportData,
  options: ReportCommandOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const outputPath = options.output

  switch (options.format) {
    case 'json':
      await outputJsonReport(reportData, outputPath, logger)
      break
    case 'html':
      await outputHtmlReport(reportData, outputPath, logger)
      break
    case 'markdown':
      await outputMarkdownReport(reportData, outputPath, logger)
      break
    default:
      await outputTextReport(reportData, outputPath, logger)
  }
}

/**
 * 输出JSON报告
 */
async function outputJsonReport(
  reportData: ReportData,
  outputPath: string | undefined,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const jsonStr = JSON.stringify(reportData, null, 2)

  if (outputPath) {
    const fs = await import('fs-extra')
    await fs.writeFile(outputPath, jsonStr, 'utf-8')
    logger.success(`✅ JSON报告已保存到: ${outputPath}`)
  } else {
    console.log(jsonStr)
  }
}

/**
 * 输出文本报告
 */
async function outputTextReport(
  reportData: ReportData,
  outputPath: string | undefined,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const lines: string[] = []

  // 报告标题
  lines.push(`📋 项目报告: ${reportData.metadata.projectName}`)
  lines.push(`生成时间: ${new Date(reportData.metadata.generatedAt).toLocaleString()}`)
  lines.push('')

  // 摘要
  lines.push('📊 项目摘要')
  lines.push(`总功能数: ${reportData.summary.totalFeatures}`)
  lines.push(`已完成: ${reportData.summary.completedFeatures} (${reportData.summary.completionRate.toFixed(1)}%)`)
  lines.push(`进行中: ${reportData.summary.inProgressFeatures}`)
  lines.push(`待处理: ${reportData.summary.pendingFeatures}`)
  lines.push(`健康状态: ${reportData.summary.healthStatus === 'healthy' ? '✅ 健康' : reportData.summary.healthStatus === 'warning' ? '⚠️ 警告' : '❌ 严重'}`)
  lines.push('')

  // 进度详情
  lines.push('📈 进度详情')
  for (const [status, count] of Object.entries(reportData.progress.byStatus)) {
    const statusText = status === 'completed' ? '✅ 已完成' : status === 'in-progress' ? '🔄 进行中' : '⏳ 待处理'
    lines.push(`${statusText}: ${count}`)
  }

  if (reportData.progress.estimatedCompletion.estimatedDays > 0) {
    lines.push(`预计完成时间: ${reportData.progress.estimatedCompletion.estimatedDays} 天 (置信度: ${reportData.progress.estimatedCompletion.confidence})`)
  }
  lines.push('')

  // 功能统计
  lines.push('🎯 功能统计')
  lines.push('按优先级:')
  for (const [priority, count] of Object.entries(reportData.features.byPriority)) {
    lines.push(`  ${priority}: ${count}`)
  }

  lines.push('按复杂度:')
  for (const [complexity, count] of Object.entries(reportData.features.byComplexity)) {
    lines.push(`  ${complexity}: ${count}`)
  }
  lines.push('')

  // Git信息（如果有）
  if (reportData.git) {
    lines.push('🔄 Git状态')
    lines.push(`分支: ${reportData.git.branch}`)
    lines.push(`工作区状态: ${reportData.git.isClean ? '✅ 干净' : '⚠️ 有未提交更改'}`)
    lines.push(`最近提交数: ${reportData.git.totalCommits}`)
    lines.push('')
  }

  // 建议（如果有）
  if (reportData.recommendations) {
    lines.push('💡 建议和改进')
    for (const recommendation of reportData.recommendations.recommendations) {
      lines.push(`• ${recommendation}`)
    }
    lines.push('')

    if (reportData.recommendations.actions.length > 0) {
      lines.push('📝 行动计划')
      for (const action of reportData.recommendations.actions) {
        const priorityIcon = action.priority === 'high' ? '🔥' : action.priority === 'medium' ? '⚡' : '💡'
        lines.push(`${priorityIcon} ${action.description}`)
      }
    }
  }

  const reportText = lines.join('\n')

  if (outputPath) {
    const fs = await import('fs-extra')
    await fs.writeFile(outputPath, reportText, 'utf-8')
    logger.success(`✅ 文本报告已保存到: ${outputPath}`)
  } else {
    console.log(reportText)
  }
}

/**
 * 输出HTML报告
 */
async function outputHtmlReport(
  reportData: ReportData,
  outputPath: string | undefined,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  // HTML报告模板
  const htmlTemplate = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportData.metadata.projectName} - 项目报告</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            border-radius: 10px;
            margin-bottom: 2rem;
        }
        .section {
            background: white;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
        }
        .metric-card {
            background: #f8f9fa;
            border-radius: 6px;
            padding: 1rem;
            margin: 0.5rem;
            flex: 1;
            min-width: 200px;
        }
        .metrics-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .progress-bar {
            background: #e1e4e8;
            border-radius: 3px;
            height: 10px;
            margin: 10px 0;
            overflow: hidden;
        }
        .progress-fill {
            background: linear-gradient(90deg, #28a745, #20c997);
            height: 100%;
            transition: width 0.3s ease;
        }
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-completed { background: #28a745; color: white; }
        .status-in-progress { background: #007bff; color: white; }
        .status-pending { background: #6c757d; color: white; }
        .health-healthy { background: #28a745; color: white; }
        .health-warning { background: #ffc107; color: #212529; }
        .health-critical { background: #dc3545; color: white; }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }
        th, td {
            border: 1px solid #dee2e6;
            padding: 0.75rem;
            text-align: left;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        tr:nth-child(even) {
            background: #f8f9fa;
        }
        .recommendation {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 6px;
            padding: 1rem;
            margin: 0.5rem 0;
        }
        .action-high { background: #f8d7da; border-color: #f5c6cb; }
        .action-medium { background: #fff3cd; border-color: #ffeaa7; }
        .action-low { background: #d1ecf1; border-color: #bee5eb; }
        @media (max-width: 768px) {
            .metrics-grid {
                flex-direction: column;
            }
            .metric-card {
                min-width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📋 ${reportData.metadata.projectName} - 项目报告</h1>
        <p>生成时间: ${new Date(reportData.metadata.generatedAt).toLocaleString()}</p>
    </div>

    <div class="section">
        <h2>📊 项目摘要</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <h3>总功能数</h3>
                <p style="font-size: 2rem; font-weight: bold; margin: 0.5rem 0;">${reportData.summary.totalFeatures}</p>
            </div>
            <div class="metric-card">
                <h3>完成率</h3>
                <p style="font-size: 2rem; font-weight: bold; margin: 0.5rem 0;">${reportData.summary.completionRate.toFixed(1)}%</p>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${reportData.summary.completionRate}%"></div>
                </div>
            </div>
            <div class="metric-card">
                <h3>健康状态</h3>
                <p style="font-size: 1.5rem; margin: 0.5rem 0;">
                    <span class="status-badge health-${reportData.summary.healthStatus}">
                        ${reportData.summary.healthStatus === 'healthy' ? '✅ 健康' : reportData.summary.healthStatus === 'warning' ? '⚠️ 警告' : '❌ 严重'}
                    </span>
                </p>
            </div>
        </div>

        <div class="metrics-grid">
            <div class="metric-card">
                <h3>已完成</h3>
                <p style="font-size: 2rem; font-weight: bold; margin: 0.5rem 0; color: #28a745;">${reportData.summary.completedFeatures}</p>
            </div>
            <div class="metric-card">
                <h3>进行中</h3>
                <p style="font-size: 2rem; font-weight: bold; margin: 0.5rem 0; color: #007bff;">${reportData.summary.inProgressFeatures}</p>
            </div>
            <div class="metric-card">
                <h3>待处理</h3>
                <p style="font-size: 2rem; font-weight: bold; margin: 0.5rem 0; color: #6c757d;">${reportData.summary.pendingFeatures}</p>
            </div>
        </div>
    </div>

    <div class="section">
        <h2>📈 进度详情</h2>
        <table>
            <thead>
                <tr>
                    <th>状态</th>
                    <th>数量</th>
                    <th>占比</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(reportData.progress.byStatus).map(([status, count]) => {
                    const percentage = ((count / reportData.progress.total) * 100).toFixed(1)
                    const statusText = status === 'completed' ? '✅ 已完成' : status === 'in-progress' ? '🔄 进行中' : '⏳ 待处理'
                    return `
                    <tr>
                        <td><span class="status-badge status-${status}">${statusText}</span></td>
                        <td>${count}</td>
                        <td>${percentage}%</td>
                    </tr>`
                }).join('')}
            </tbody>
        </table>
    </div>

    <div class="section">
        <h2>🎯 功能统计</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <h3>按优先级</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    ${Object.entries(reportData.features.byPriority).map(([priority, count]) => `
                    <li style="margin: 0.5rem 0;">${priority}: ${count}</li>
                    `).join('')}
                </ul>
            </div>
            <div class="metric-card">
                <h3>按复杂度</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">
                    ${Object.entries(reportData.features.byComplexity).map(([complexity, count]) => `
                    <li style="margin: 0.5rem 0;">${complexity}: ${count}</li>
                    `).join('')}
                </ul>
            </div>
        </div>
    </div>

    ${reportData.git ? `
    <div class="section">
        <h2>🔄 Git状态</h2>
        <p><strong>分支:</strong> ${reportData.git.branch}</p>
        <p><strong>工作区状态:</strong> ${reportData.git.isClean ? '✅ 干净' : '⚠️ 有未提交更改'}</p>
        <p><strong>最近提交数:</strong> ${reportData.git.totalCommits}</p>

        ${reportData.git.recentCommits.length > 0 ? `
        <h3>最近提交</h3>
        <table>
            <thead>
                <tr>
                    <th>提交</th>
                    <th>消息</th>
                    <th>作者</th>
                    <th>时间</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.git.recentCommits.map(commit => `
                <tr>
                    <td><code>${commit.hash}</code></td>
                    <td>${commit.message}</td>
                    <td>${commit.author}</td>
                    <td>${commit.date}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        ` : ''}
    </div>
    ` : ''}

    ${reportData.recommendations ? `
    <div class="section">
        <h2>💡 建议和改进</h2>

        ${reportData.recommendations.recommendations.length > 0 ? `
        <h3>建议</h3>
        ${reportData.recommendations.recommendations.map(rec => `
        <div class="recommendation">
            <p>• ${rec}</p>
        </div>
        `).join('')}
        ` : ''}

        ${reportData.recommendations.actions.length > 0 ? `
        <h3>行动计划</h3>
        ${reportData.recommendations.actions.map(action => `
        <div class="recommendation action-${action.priority}">
            <p><strong>${action.priority === 'high' ? '🔥 高优先级' : action.priority === 'medium' ? '⚡ 中优先级' : '💡 低优先级'}</strong></p>
            <p>${action.description}</p>
        </div>
        `).join('')}
        ` : ''}
    </div>
    ` : ''}

    <div class="section" style="text-align: center; color: #6c757d; font-size: 0.9rem;">
        <p>📄 报告由 agent-cli 生成 | ${new Date().getFullYear()}</p>
    </div>
</body>
</html>
`

  const output = outputPath || 'report.html'
  const fs = await import('fs-extra')
  await fs.writeFile(output, htmlTemplate, 'utf-8')
  logger.success(`✅ HTML报告已保存到: ${output}`)
  logger.info(`💡 在浏览器中打开报告: file://${path.resolve(output)}`)
}

/**
 * 输出Markdown报告
 */
async function outputMarkdownReport(
  reportData: ReportData,
  outputPath: string | undefined,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  const lines: string[] = []

  // 标题
  lines.push(`# ${reportData.metadata.projectName} - 项目报告`)
  lines.push(`**生成时间**: ${new Date(reportData.metadata.generatedAt).toLocaleString()}`)
  lines.push('')

  // 摘要
  lines.push('## 📊 项目摘要')
  lines.push('| 指标 | 值 |')
  lines.push('|------|-----|')
  lines.push(`| 总功能数 | ${reportData.summary.totalFeatures} |`)
  lines.push(`| 已完成 | ${reportData.summary.completedFeatures} (${reportData.summary.completionRate.toFixed(1)}%) |`)
  lines.push(`| 进行中 | ${reportData.summary.inProgressFeatures} |`)
  lines.push(`| 待处理 | ${reportData.summary.pendingFeatures} |`)
  lines.push(`| 健康状态 | ${reportData.summary.healthStatus === 'healthy' ? '✅ 健康' : reportData.summary.healthStatus === 'warning' ? '⚠️ 警告' : '❌ 严重'} |`)
  lines.push('')

  // 进度条
  const progressBarLength = 20
  const filledLength = Math.round((reportData.summary.completionRate / 100) * progressBarLength)
  const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength)
  lines.push(`**进度**: \`${progressBar}\` ${reportData.summary.completionRate.toFixed(1)}%`)
  lines.push('')

  // 进度详情
  lines.push('## 📈 进度详情')
  lines.push('| 状态 | 数量 | 占比 |')
  lines.push('|------|------|------|')
  for (const [status, count] of Object.entries(reportData.progress.byStatus)) {
    const percentage = ((count / reportData.progress.total) * 100).toFixed(1)
    const statusText = status === 'completed' ? '✅ 已完成' : status === 'in-progress' ? '🔄 进行中' : '⏳ 待处理'
    lines.push(`| ${statusText} | ${count} | ${percentage}% |`)
  }
  lines.push('')

  if (reportData.progress.estimatedCompletion.estimatedDays > 0) {
    lines.push(`**预计完成时间**: ${reportData.progress.estimatedCompletion.estimatedDays} 天 (置信度: ${reportData.progress.estimatedCompletion.confidence})`)
    lines.push('')
  }

  // 功能统计
  lines.push('## 🎯 功能统计')
  lines.push('### 按优先级')
  for (const [priority, count] of Object.entries(reportData.features.byPriority)) {
    lines.push(`- **${priority}**: ${count}`)
  }
  lines.push('')

  lines.push('### 按复杂度')
  for (const [complexity, count] of Object.entries(reportData.features.byComplexity)) {
    lines.push(`- **${complexity}**: ${count}`)
  }
  lines.push('')

  // Git信息
  if (reportData.git) {
    lines.push('## 🔄 Git状态')
    lines.push(`- **分支**: ${reportData.git.branch}`)
    lines.push(`- **工作区状态**: ${reportData.git.isClean ? '✅ 干净' : '⚠️ 有未提交更改'}`)
    lines.push(`- **最近提交数**: ${reportData.git.totalCommits}`)
    lines.push('')

    if (reportData.git.recentCommits.length > 0) {
      lines.push('### 最近提交')
      lines.push('| 提交 | 消息 | 作者 | 时间 |')
      lines.push('|------|------|------|------|')
      for (const commit of reportData.git.recentCommits.slice(0, 5)) {
        lines.push(`| \`${commit.hash}\` | ${commit.message} | ${commit.author} | ${commit.date} |`)
      }
      lines.push('')
    }
  }

  // 建议
  if (reportData.recommendations) {
    lines.push('## 💡 建议和改进')

    if (reportData.recommendations.recommendations.length > 0) {
      lines.push('### 建议')
      for (const recommendation of reportData.recommendations.recommendations) {
        lines.push(`- ${recommendation}`)
      }
      lines.push('')
    }

    if (reportData.recommendations.actions.length > 0) {
      lines.push('### 行动计划')
      for (const action of reportData.recommendations.actions) {
        const priorityIcon = action.priority === 'high' ? '🔥' : action.priority === 'medium' ? '⚡' : '💡'
        lines.push(`- ${priorityIcon} **${action.priority}**: ${action.description}`)
      }
      lines.push('')
    }
  }

  // 页脚
  lines.push('---')
  lines.push(`*报告由 agent-cli 生成 • ${new Date().getFullYear()}*`)

  const markdownText = lines.join('\n')

  if (outputPath) {
    const fs = await import('fs-extra')
    await fs.writeFile(outputPath, markdownText, 'utf-8')
    logger.success(`✅ Markdown报告已保存到: ${outputPath}`)
  } else {
    console.log(markdownText)
  }
}

/**
 * 处理报告错误
 */
function handleReportError(error: unknown, logger: ReturnType<typeof createLogger>): void {
  logger.error('❌ 报告生成失败')

  if (error instanceof Error) {
    logger.error(`错误信息: ${error.message}`)

    if (error.message.includes('配置文件')) {
      logger.info('💡 配置文件相关错误:')
      logger.info('  1. 确保配置文件存在且有读取权限')
      logger.info('  2. 检查JSON格式是否正确')
      logger.info('  3. 使用 --config 指定配置文件路径')
    } else if (error.message.includes('权限')) {
      logger.info('💡 权限相关错误:')
      logger.info('  1. 确保对输出目录有写入权限')
      logger.info('  2. 尝试使用不同的输出路径')
      logger.info('  3. 使用 --force 覆盖现有文件')
    } else if (error.message.includes('未初始化')) {
      logger.info('💡 项目初始化相关错误:')
      logger.info('  1. 确保项目已初始化: agent-cli init <project-name>')
      logger.info('  2. 确保工作目录正确')
      logger.info('  3. 检查进度文件是否存在')
    }

    if (process.env.DEBUG === 'true' || logger.isDebugEnabled()) {
      logger.debug('详细错误堆栈:', error.stack)
    }
  } else {
    logger.error(`未知错误: ${String(error)}`)
  }

  logger.info('\n💡 获取帮助:')
  logger.info('  $ agent-cli report --help')

  process.exit(1)
}

/**
 * 报告数据结构
 */
interface ReportData {
  metadata: {
    generatedAt: string
    reportType: string
    projectName: string
    projectPath: string
  }
  summary: ReportSummary
  progress: ProgressReport
  features: FeaturesReport
  tests?: TestReportSection
  git?: GitReportSection
  recommendations?: RecommendationsSection
}

interface ReportSummary {
  totalFeatures: number
  completedFeatures: number
  inProgressFeatures: number
  pendingFeatures: number
  completionRate: number
  healthStatus: 'healthy' | 'warning' | 'critical'
  lastUpdated: string
}

interface ProgressReport {
  total: number
  byStatus: Record<string, number>
  recentProgress: Array<{
    timestamp: string
    action: string
    featureId: string
  }>
  estimatedCompletion: {
    estimatedDays: number
    confidence: 'high' | 'medium' | 'low'
  }
}

interface FeaturesReport {
  total: number
  byPriority: Record<string, number>
  byComplexity: Record<string, number>
  features: Array<{
    id: string
    name: string
    status: string
    priority?: string
    complexity?: string
    description?: string
  }>
}

interface TestReportSection {
  totalTests: number
  passed: number
  failed: number
  successRate: number
  lastRun: string | null
  details: any[]
}

interface GitReportSection {
  branch: string
  isClean: boolean
  totalCommits: number
  recentCommits: Array<{
    hash: string
    message: string
    author: string
    date: string
  }>
}

interface RecommendationsSection {
  recommendations: string[]
  actions: Array<{
    priority: 'high' | 'medium' | 'low'
    description: string
  }>
}

/**
 * 导出命令模块（符合CLI框架接口）
 */
export const commandModule = {
  command: 'report',
  description: '生成项目报告 - 进度、测试、健康状态等多维度分析',
  options: [
    {
      flags: '-t, --type <type>',
      description: '报告类型 (progress, test, health, summary, all)',
      defaultValue: 'summary'
    },
    {
      flags: '-f, --format <format>',
      description: '输出格式 (text, json, html, markdown)',
      defaultValue: 'text'
    },
    {
      flags: '-o, --output <path>',
      description: '输出文件路径（默认输出到控制台）'
    },
    {
      flags: '-v, --verbose',
      description: '详细模式'
    },
    {
      flags: '--debug',
      description: '调试模式'
    },
    {
      flags: '--cwd <path>',
      description: '设置工作目录'
    },
    {
      flags: '--title <title>',
      description: '覆盖报告标题'
    },
    {
      flags: '--time-range <range>',
      description: '时间范围 (格式: YYYY-MM-DD,YYYY-MM-DD)'
    },
    {
      flags: '--features <ids>',
      description: '包含特定功能ID（逗号分隔）'
    },
    {
      flags: '--tags <tags>',
      description: '包含特定标签（逗号分隔）'
    },
    {
      flags: '--exclude-completed',
      description: '不包含已完成的功能'
    },
    {
      flags: '--include-tests',
      description: '包含详细测试结果'
    },
    {
      flags: '--include-git',
      description: '包含Git历史'
    },
    {
      flags: '--include-recommendations',
      description: '包含建议和行动计划'
    },
    {
      flags: '--force',
      description: '强制覆盖输出文件'
    }
  ],
  action: async (cmdOptions: any) => {
    await handleReportCommand(cmdOptions)
  }
}

// 默认导出
export default { createReportCommand, commandModule }
