/**
 * 测试命令模块
 * 设计思路：提供完整的端到端测试执行流程，支持Puppeteer自动化测试
 *
 * 功能特点：
 * 1. 支持多种测试套件格式（JSON、YAML）
 * 2. 灵活的测试配置和参数覆盖
 * 3. 详细的测试报告生成（JSON、HTML）
 * 4. 截图捕获和错误诊断
 * 5. 测试历史记录和趋势分析
 *
 * 踩坑提醒：
 * 1. Puppeteer启动需要正确的浏览器路径，注意跨平台兼容性
 * 2. 测试步骤超时设置要合理，避免无限等待
 * 3. 截图目录权限要确保可写
 * 4. 并发测试要注意资源竞争和隔离
 * 5. 错误处理要详细，便于问题排查
 */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createLogger } from '../../utils/logger.js';
import { TestManager } from '../../core/test/test-manager.js';
import type { TestConfig, TestReport } from '../../types/test.js';

// 测试命令选项
interface TestCommandOptions {
  /** 测试套件路径（支持glob模式） */
  suites?: string;
  /** 测试配置文件路径 */
  config?: string;
  /** 基础URL */
  url?: string;
  /** 是否无头模式 */
  headless?: boolean;
  /** 浏览器路径 */
  'browser-path'?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 失败时是否继续 */
  'continue-on-failure'?: boolean;
  /** 截图保存目录 */
  'screenshot-dir'?: string;
  /** 报告保存目录 */
  'report-dir'?: string;
  /** 是否生成HTML报告 */
  html?: boolean;
  /** 是否详细输出 */
  verbose?: boolean;
  /** 调试模式 */
  debug?: boolean;
  /** 并行执行数量 */
  parallel?: number;
  /** 最大重试次数 */
  retries?: number;
  /** 标签过滤 */
  tags?: string;
  /** 输出格式 */
  format?: 'json' | 'html' | 'both';
  /** 是否保存历史记录 */
  history?: boolean;
}

/**
 * 创建测试命令
 */
export function createTestCommand(): Command {
  const command = new Command('test')
    .description('执行端到端自动化测试')
    .option('-s, --suites <pattern>', '测试套件路径（支持glob模式，如: tests/*.json）')
    .option('-c, --config <path>', '测试配置文件路径')
    .option('-u, --url <url>', '基础URL（覆盖配置文件）')
    .option('--no-headless', '显示浏览器界面（默认无头模式）')
    .option('--browser-path <path>', '指定浏览器可执行文件路径')
    .option('--timeout <ms>', '默认超时时间（毫秒）', '30000')
    .option('--continue-on-failure', '失败时继续执行其他测试', false)
    .option('--screenshot-dir <dir>', '截图保存目录', './test-screenshots')
    .option('--report-dir <dir>', '报告保存目录', './test-reports')
    .option('--html', '生成HTML格式报告', false)
    .option('-v, --verbose', '详细输出模式', false)
    .option('--debug', '调试模式（输出更多信息）', false)
    .option('--parallel <count>', '并行执行数量', '1')
    .option('--retries <count>', '最大重试次数', '0')
    .option('--tags <tags>', '标签过滤（逗号分隔）')
    .option('--format <format>', '输出格式: json, html, both', 'both')
    .option('--history', '保存测试历史记录', false)
    .action(async (options: TestCommandOptions) => {
      await executeTestCommand(options);
    });

  return command;
}

/**
 * 执行测试命令
 */
async function executeTestCommand(options: TestCommandOptions): Promise<void> {
  const logger = createLogger('test-command');
  const startTime = new Date();

  try {
    logger.info('开始执行自动化测试');

    // 1. 加载配置
    const config = await loadTestConfig(options);
    logger.debug('测试配置加载完成:', config);

    // 2. 解析测试套件路径
    const suitePaths = await resolveSuitePaths(options.suites || 'tests/**/*.json');
    if (suitePaths.length === 0) {
      logger.warn('未找到测试套件文件');
      logger.info('请创建测试套件文件，例如: tests/login.json');
      logger.info('或使用 --suites 参数指定套件路径');
      return;
    }

    logger.info(`找到 ${suitePaths.length} 个测试套件文件`);

    // 3. 创建测试管理器
    const testManager = new TestManager(config);
    await testManager.loadTestSuites(suitePaths);

    // 4. 执行测试
    logger.info('开始执行测试...');
    const report = await testManager.runAllTests();

    // 5. 生成报告
    await generateReports(testManager, report, options);

    // 6. 显示结果摘要
    displayTestSummary(report, logger);

    // 7. 保存历史记录（如果启用）
    if (options.history) {
      await saveTestHistory(report, options);
    }

    const duration = new Date().getTime() - startTime.getTime();
    logger.info(`测试执行完成，总耗时: ${duration}ms`);

    // 8. 根据测试结果退出码
    if (report.failedSteps > 0) {
      process.exit(1);
    }

  } catch (error) {
    logger.error('测试执行失败:', error);
    process.exit(1);
  }
}

/**
 * 加载测试配置
 */
async function loadTestConfig(options: TestCommandOptions): Promise<TestConfig> {
  const config: TestConfig = {
    headless: options.headless !== false,
    timeout: parseInt(options.timeout || '30000'),
    stopOnFailure: !options['continue-on-failure'],
    screenshotDir: options['screenshot-dir'],
    screenshotOnSuccess: options.verbose,
    screenshotFullPage: false,
    reportDir: options['report-dir'],
    generateHtmlReport: options.html,
    verbose: options.verbose,
    maxRetries: parseInt(options.retries || '0'),
    parallel: parseInt(options.parallel || '1') > 1,
    parallelCount: parseInt(options.parallel || '1')
  };

  // 如果有配置文件，加载并合并
  if (options.config) {
    try {
      const fileConfig = await loadConfigFile(options.config);
      Object.assign(config, fileConfig);
    } catch (error) {
      const logger = createLogger('test-command');
      logger.warn(`配置文件加载失败: ${options.config}`, error);
    }
  }

  // 命令行参数覆盖配置文件
  if (options.url) {
    config.baseUrl = options.url;
  }

  if (options['browser-path']) {
    config.browserPath = options['browser-path'];
  }

  return config;
}

/**
 * 加载配置文件
 */
async function loadConfigFile(configPath: string): Promise<Partial<TestConfig>> {
  const content = await fs.readFile(configPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 解析测试套件路径
 */
async function resolveSuitePaths(pattern: string): Promise<string[]> {
  const { globby } = await import('globby');
  const paths = await globby(pattern, {
    absolute: true,
    expandDirectories: false
  });

  // 过滤出JSON文件
  return paths.filter(p => p.endsWith('.json'));
}

/**
 * 生成测试报告
 */
async function generateReports(
  testManager: TestManager,
  report: TestReport,
  options: TestCommandOptions
): Promise<void> {
  const logger = createLogger('test-command');

  try {
    // 确保报告目录存在
    const reportDir = options['report-dir'] || './test-reports';
    await fs.mkdir(reportDir, { recursive: true });

    // 根据格式生成报告
    const format = options.format || 'both';

    if (format === 'json' || format === 'both') {
      const jsonPath = await testManager.saveReport(report, reportDir);
      logger.info(`JSON报告已保存: ${jsonPath}`);
    }

    if (format === 'html' || format === 'both') {
      const htmlPath = await testManager.generateHtmlReport(report, reportDir);
      logger.info(`HTML报告已保存: ${htmlPath}`);
    }

  } catch (error) {
    logger.error('生成测试报告失败:', error);
    // 不抛出错误，继续执行
  }
}

/**
 * 显示测试结果摘要
 */
function displayTestSummary(report: TestReport, logger: ReturnType<typeof createLogger>): void {
  const successRate = report.successRate;
  const emoji = successRate === 100 ? '🎉' : successRate >= 80 ? '✅' : '⚠️';

  logger.info('');
  logger.info('📊 测试结果摘要');
  logger.info('='.repeat(50));
  logger.info(`执行时间: ${report.startTime.toLocaleString()} - ${report.endTime.toLocaleString()}`);
  logger.info(`总时长: ${report.duration}ms`);
  logger.info(`测试套件: ${Object.keys(report.suiteResults).length} 个`);
  logger.info(`测试步骤: ${report.totalSteps} 个`);
  logger.info(`✅ 通过: ${report.passedSteps}`);
  logger.info(`❌ 失败: ${report.failedSteps}`);
  logger.info(`⏳ 待执行: ${report.pendingSteps}`);
  logger.info(`${emoji} 成功率: ${successRate.toFixed(1)}%`);
  logger.info('');

  // 显示失败的测试步骤
  if (report.failedSteps > 0) {
    logger.warn('失败的测试步骤:');
    const failedResults = report.results.filter(r => r.status === 'failed');
    for (const result of failedResults) {
      logger.warn(`  • ${result.suiteName || '未知套件'} - ${result.stepName}`);
      if (result.error) {
        logger.warn(`    错误: ${result.error}`);
      }
    }
    logger.info('');
  }

  // 显示套件状态
  logger.info('测试套件状态:');
  for (const [suiteId, status] of Object.entries(report.suiteStatuses)) {
    const suiteName = report.suiteResults[suiteId]?.[0]?.suiteName || suiteId;
    const icon = status === 'passed' ? '✅' : '❌';
    logger.info(`  ${icon} ${suiteName}: ${status}`);
  }
}

/**
 * 保存测试历史记录
 */
async function saveTestHistory(report: TestReport, options: TestCommandOptions): Promise<void> {
  try {
    const historyDir = path.join(options['report-dir'] || './test-reports', 'history');
    await fs.mkdir(historyDir, { recursive: true });

    const historyEntry = {
      id: report.id,
      timestamp: new Date(),
      reportId: report.id,
      summary: {
        totalSteps: report.totalSteps,
        passedSteps: report.passedSteps,
        failedSteps: report.failedSteps,
        successRate: report.successRate,
        duration: report.duration
      },
      config: report.config
    };

    const filename = `history-${report.id}.json`;
    const filepath = path.join(historyDir, filename);

    await fs.writeFile(filepath, JSON.stringify(historyEntry, null, 2), 'utf-8');

    const logger = createLogger('test-command');
    logger.debug(`测试历史记录已保存: ${filepath}`);
  } catch (error) {
    // 历史记录保存失败不影响主流程
    const logger = createLogger('test-command');
    logger.warn('保存测试历史记录失败:', error);
  }
}

/**
 * 创建示例测试套件
 */
export async function createExampleTestSuite(targetDir: string = './tests'): Promise<void> {
  const logger = createLogger('test-command');

  try {
    await fs.mkdir(targetDir, { recursive: true });

    const exampleSuite = {
      id: 'example-login',
      name: '用户登录测试',
      description: '测试用户登录流程',
      tags: ['login', 'authentication', 'critical'],
      steps: [
        {
          id: 'navigate-to-login',
          name: '导航到登录页面',
          type: 'navigate',
          params: {
            url: 'https://example.com/login',
            waitUntil: 'networkidle0',
            description: '打开登录页面'
          }
        },
        {
          id: 'fill-username',
          name: '输入用户名',
          type: 'type',
          params: {
            selector: '#username',
            text: 'testuser@example.com',
            clear: true,
            delay: 100,
            description: '在用户名输入框中输入测试邮箱'
          }
        },
        {
          id: 'fill-password',
          name: '输入密码',
          type: 'type',
          params: {
            selector: '#password',
            text: 'TestPassword123!',
            clear: true,
            delay: 100,
            description: '在密码输入框中输入测试密码'
          }
        },
        {
          id: 'click-login-button',
          name: '点击登录按钮',
          type: 'click',
          params: {
            selector: 'button[type="submit"]',
            waitAfter: 1000,
            description: '点击提交按钮进行登录'
          }
        },
        {
          id: 'assert-dashboard',
          name: '验证登录成功',
          type: 'assert',
          params: {
            assertType: 'visible',
            selector: '.dashboard-header',
            timeout: 5000,
            description: '验证登录后跳转到仪表板页面'
          }
        },
        {
          id: 'assert-welcome-message',
          name: '验证欢迎消息',
          type: 'assert',
          params: {
            assertType: 'text',
            selector: '.welcome-message',
            expected: '欢迎回来',
            description: '验证页面显示欢迎消息'
          }
        }
      ]
    };

    const filepath = path.join(targetDir, 'example-login.json');
    await fs.writeFile(filepath, JSON.stringify(exampleSuite, null, 2), 'utf-8');

    logger.success(`示例测试套件已创建: ${filepath}`);
    logger.info('使用方法:');
    logger.info(`  agent-cli test --suites "${filepath}" --url "https://your-app.com"`);
    logger.info('请根据实际应用修改选择器和URL');

  } catch (error) {
    logger.error('创建示例测试套件失败:', error);
    throw error;
  }
}