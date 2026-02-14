import { Logger } from '../../utils/logger';
import { PuppeteerRunner } from './puppeteer-runner';
import {
  TestSuite,
  TestResult,
  TestStep,
  TestConfig,
  TestReport,
  TestError,
  TestStatus
} from '../../types/test';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 测试管理器
 * 负责加载测试套件、执行测试、生成报告和管理测试生命周期
 */
export class TestManager {
  private logger: Logger;
  private runner: PuppeteerRunner | null = null;
  private config: TestConfig;
  private testSuites: TestSuite[] = [];
  private currentResults: TestResult[] = [];

  constructor(config: TestConfig) {
    this.config = config;
    this.logger = new Logger('test-manager');
  }

  /**
   * 加载测试套件
   */
  async loadTestSuites(suitePaths: string[]): Promise<void> {
    this.testSuites = [];

    for (const suitePath of suitePaths) {
      try {
        const suite = await this.loadTestSuite(suitePath);
        this.testSuites.push(suite);
        this.logger.info(`加载测试套件: ${suite.name} (${suite.steps.length} 个步骤)`);
      } catch (error) {
        this.logger.error(`加载测试套件失败: ${suitePath}`, error);
        throw new TestError(`无法加载测试套件: ${suitePath}`, error);
      }
    }

    if (this.testSuites.length === 0) {
      throw new TestError('未找到有效的测试套件');
    }

    this.logger.success(`已加载 ${this.testSuites.length} 个测试套件`);
  }

  /**
   * 加载单个测试套件文件
   */
  private async loadTestSuite(filePath: string): Promise<TestSuite> {
    const content = await fs.readFile(filePath, 'utf-8');
    const suite = JSON.parse(content) as TestSuite;

    // 验证测试套件结构
    this.validateTestSuite(suite);

    // 设置默认值
    suite.id = suite.id || path.basename(filePath, '.json');
    suite.filePath = filePath;

    return suite;
  }

  /**
   * 验证测试套件结构
   */
  private validateTestSuite(suite: TestSuite): void {
    if (!suite.name) {
      throw new TestError('测试套件缺少名称');
    }

    if (!suite.steps || !Array.isArray(suite.steps)) {
      throw new TestError('测试套件缺少步骤数组');
    }

    // 验证每个步骤
    for (const step of suite.steps) {
      this.validateTestStep(step);
    }
  }

  /**
   * 验证测试步骤
   */
  private validateTestStep(step: TestStep): void {
    if (!step.id) {
      throw new TestError('测试步骤缺少ID');
    }

    if (!step.name) {
      throw new TestError('测试步骤缺少名称');
    }

    if (!step.type) {
      throw new TestError('测试步骤缺少类型');
    }

    // 验证步骤类型
    const validTypes = ['navigate', 'click', 'type', 'wait', 'assert', 'custom'];
    if (!validTypes.includes(step.type)) {
      throw new TestError(`无效的测试步骤类型: ${step.type}`);
    }

    // 验证必要参数
    switch (step.type) {
      case 'navigate':
        if (!step.params?.url) {
          throw new TestError('导航步骤缺少URL参数');
        }
        break;
      case 'click':
        if (!step.params?.selector) {
          throw new TestError('点击步骤缺少选择器参数');
        }
        break;
      case 'type':
        if (!step.params?.selector || step.params?.text === undefined) {
          throw new TestError('输入步骤缺少选择器或文本参数');
        }
        break;
      case 'assert':
        if (!step.params?.assertType || !step.params?.selector) {
          throw new TestError('断言步骤缺少类型或选择器参数');
        }
        break;
      case 'custom':
        if (!step.params?.script) {
          throw new TestError('自定义步骤缺少脚本参数');
        }
        break;
    }
  }

  /**
   * 执行所有测试套件
   */
  async runAllTests(): Promise<TestReport> {
    const startTime = new Date();
    this.currentResults = [];

    this.logger.info('开始执行所有测试套件');

    try {
      // 初始化测试运行器
      this.runner = new PuppeteerRunner(this.config);
      await this.runner.initialize();

      // 执行每个测试套件
      for (const suite of this.testSuites) {
        await this.runTestSuite(suite);
      }

      // 生成报告
      const report = this.generateReport(startTime);

      this.logger.success('所有测试执行完成');
      return report;
    } catch (error) {
      this.logger.error('测试执行过程中发生错误:', error);
      throw error;
    } finally {
      // 清理资源
      if (this.runner) {
        await this.runner.cleanup();
        this.runner = null;
      }
    }
  }

  /**
   * 执行单个测试套件
   */
  private async runTestSuite(suite: TestSuite): Promise<void> {
    this.logger.info(`执行测试套件: ${suite.name}`);

    const suiteStartTime = new Date();

    try {
      // 执行套件中的每个步骤
      for (const step of suite.steps) {
        const result = await this.runner!.executeStep(step);
        result.suiteId = suite.id;
        result.suiteName = suite.name;
        this.currentResults.push(result);

        // 如果步骤失败且配置要求停止，则中断执行
        if (result.status === 'failed' && this.config.stopOnFailure) {
          this.logger.warn(`测试步骤失败，停止执行套件: ${suite.name}`);
          break;
        }
      }

      const suiteDuration = new Date().getTime() - suiteStartTime.getTime();
      this.logger.info(`测试套件完成: ${suite.name} (${suiteDuration}ms)`);
    } catch (error) {
      this.logger.error(`执行测试套件失败: ${suite.name}`, error);
      throw error;
    }
  }

  /**
   * 生成测试报告
   */
  private generateReport(startTime: Date): TestReport {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    // 统计结果
    const totalSteps = this.currentResults.length;
    const passedSteps = this.currentResults.filter(r => r.status === 'passed').length;
    const failedSteps = this.currentResults.filter(r => r.status === 'failed').length;
    const pendingSteps = this.currentResults.filter(r => r.status === 'pending').length;

    // 按套件分组
    const suiteResults: Record<string, TestResult[]> = {};
    for (const result of this.currentResults) {
      const suiteId = result.suiteId || 'unknown';
      if (!suiteResults[suiteId]) {
        suiteResults[suiteId] = [];
      }
      suiteResults[suiteId].push(result);
    }

    // 计算套件状态
    const suiteStatuses: Record<string, TestStatus> = {};
    for (const [suiteId, results] of Object.entries(suiteResults)) {
      const hasFailed = results.some(r => r.status === 'failed');
      suiteStatuses[suiteId] = hasFailed ? 'failed' : 'passed';
    }

    // 收集环境信息
    const environmentInfo = this.runner?.getEnvironmentInfo() || null;

    const report: TestReport = {
      id: `test-report-${startTime.toISOString().replace(/[:.]/g, '-')}`,
      startTime,
      endTime,
      duration,
      totalSteps,
      passedSteps,
      failedSteps,
      pendingSteps,
      successRate: totalSteps > 0 ? (passedSteps / totalSteps) * 100 : 0,
      results: this.currentResults,
      suiteResults,
      suiteStatuses,
      config: this.config,
      metadata: {
        environment: environmentInfo,
        timestamp: new Date().toISOString(),
        totalSuites: Object.keys(suiteResults).length
      }
    };

    return report;
  }

  /**
   * 保存测试报告
   */
  async saveReport(report: TestReport, outputDir?: string): Promise<string> {
    const dir = outputDir || this.config.reportDir || './test-reports';

    try {
      // 确保目录存在
      await fs.mkdir(dir, { recursive: true });

      // 生成文件名
      const timestamp = report.startTime.toISOString().replace(/[:.]/g, '-');
      const filename = `test-report-${timestamp}.json`;
      const filepath = path.join(dir, filename);

      // 保存报告
      await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');

      this.logger.success(`测试报告已保存: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error('保存测试报告失败:', error);
      throw new TestError('无法保存测试报告', error);
    }
  }

  /**
   * 生成HTML格式的测试报告
   */
  async generateHtmlReport(report: TestReport, outputDir?: string): Promise<string> {
    const dir = outputDir || this.config.reportDir || './test-reports';

    try {
      // 确保目录存在
      await fs.mkdir(dir, { recursive: true });

      // 生成HTML内容
      const html = this.createHtmlReport(report);

      // 生成文件名
      const timestamp = report.startTime.toISOString().replace(/[:.]/g, '-');
      const filename = `test-report-${timestamp}.html`;
      const filepath = path.join(dir, filename);

      // 保存HTML报告
      await fs.writeFile(filepath, html, 'utf-8');

      this.logger.success(`HTML测试报告已保存: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error('生成HTML测试报告失败:', error);
      throw new TestError('无法生成HTML测试报告', error);
    }
  }

  /**
   * 创建HTML报告内容
   */
  private createHtmlReport(report: TestReport): string {
    const passedColor = '#10b981';
    const failedColor = '#ef4444';
    const pendingColor = '#f59e0b';

    const formatTime = (date: Date | null) => {
      if (!date) return 'N/A';
      return date.toLocaleString();
    };

    const formatDuration = (ms: number) => {
      if (ms < 1000) return `${ms}ms`;
      return `${(ms / 1000).toFixed(2)}s`;
    };

    const statusBadge = (status: TestStatus) => {
      const colors = {
        passed: passedColor,
        failed: failedColor,
        pending: pendingColor
      };
      return `<span style="background: ${colors[status]}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">${status}</span>`;
    };

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>测试报告 - ${report.id}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8fafc;
            padding: 20px;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }

        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }

        .header .timestamp {
            opacity: 0.9;
            font-size: 14px;
        }

        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f1f5f9;
        }

        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .summary-card h3 {
            font-size: 14px;
            color: #64748b;
            margin-bottom: 10px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .summary-card .value {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .summary-card .value.passed { color: ${passedColor}; }
        .summary-card .value.failed { color: ${failedColor}; }
        .summary-card .value.pending { color: ${pendingColor}; }

        .details {
            padding: 30px;
        }

        .section {
            margin-bottom: 40px;
        }

        .section h2 {
            font-size: 20px;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e2e8f0;
            color: #475569;
        }

        .suite-results {
            margin-top: 20px;
        }

        .suite {
            background: #f8fafc;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            border-left: 4px solid #cbd5e1;
        }

        .suite.passed { border-left-color: ${passedColor}; }
        .suite.failed { border-left-color: ${failedColor}; }

        .suite-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }

        .suite-header h3 {
            font-size: 18px;
            color: #334155;
        }

        .steps {
            margin-top: 15px;
        }

        .step {
            background: white;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 10px;
            border-left: 3px solid #cbd5e1;
        }

        .step.passed { border-left-color: ${passedColor}; }
        .step.failed { border-left-color: ${failedColor}; }
        .step.pending { border-left-color: ${pendingColor}; }

        .step-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .step-name {
            font-weight: 500;
            color: #475569;
        }

        .step-details {
            font-size: 14px;
            color: #64748b;
            margin-top: 5px;
        }

        .step-error {
            background: #fee2e2;
            border: 1px solid #fecaca;
            border-radius: 4px;
            padding: 10px;
            margin-top: 10px;
            font-family: monospace;
            font-size: 13px;
            color: #dc2626;
        }

        .screenshot {
            margin-top: 10px;
        }

        .screenshot img {
            max-width: 100%;
            border-radius: 4px;
            border: 1px solid #e2e8f0;
        }

        .environment-info {
            margin-top: 20px;
        }

        .environment-card {
            background: #f8fafc;
            border-radius: 8px;
            padding: 20px;
            border-left: 4px solid #3b82f6;
        }

        .environment-card h3 {
            font-size: 16px;
            color: #1e40af;
            margin-bottom: 15px;
            padding-bottom: 8px;
            border-bottom: 1px solid #dbeafe;
        }

        .environment-details {
            font-size: 14px;
            color: #475569;
        }

        .environment-details div {
            margin-bottom: 8px;
            padding-left: 10px;
            border-left: 2px solid #93c5fd;
        }

        .environment-details strong {
            color: #1e40af;
            margin-right: 8px;
        }

        .footer {
            text-align: center;
            padding: 20px;
            color: #64748b;
            font-size: 14px;
            border-top: 1px solid #e2e8f0;
            background: #f8fafc;
        }

        @media (max-width: 768px) {
            .summary {
                grid-template-columns: 1fr;
            }

            .suite-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 测试执行报告</h1>
            <div class="timestamp">
                执行时间: ${formatTime(report.startTime)} - ${formatTime(report.endTime)}
                (${formatDuration(report.duration)})
            </div>
        </div>

        <div class="summary">
            <div class="summary-card">
                <h3>总步骤数</h3>
                <div class="value">${report.totalSteps}</div>
            </div>

            <div class="summary-card">
                <h3>通过</h3>
                <div class="value passed">${report.passedSteps}</div>
            </div>

            <div class="summary-card">
                <h3>失败</h3>
                <div class="value failed">${report.failedSteps}</div>
            </div>

            <div class="summary-card">
                <h3>成功率</h3>
                <div class="value passed">${report.successRate.toFixed(1)}%</div>
            </div>
        </div>

        <div class="details">
            <div class="section">
                <h2>📋 测试套件详情</h2>
                <div class="suite-results">
                    ${Object.entries(report.suiteResults).map(([suiteId, results]) => {
                        const suiteName = results[0]?.suiteName || suiteId;
                        const suiteStatus = report.suiteStatuses[suiteId] || 'pending';
                        const passedCount = results.filter(r => r.status === 'passed').length;
                        const failedCount = results.filter(r => r.status === 'failed').length;

                        return `
                        <div class="suite ${suiteStatus}">
                            <div class="suite-header">
                                <h3>${suiteName}</h3>
                                <div>
                                    ${statusBadge(suiteStatus)}
                                    <span style="margin-left: 10px; color: #64748b; font-size: 14px;">
                                        ${passedCount} 通过 / ${failedCount} 失败 / ${results.length} 总计
                                    </span>
                                </div>
                            </div>
                            <div class="steps">
                                ${results.map(result => {
                                    const stepDuration = result.endTime && result.startTime
                                        ? formatDuration(result.endTime.getTime() - result.startTime.getTime())
                                        : 'N/A';

                                    return `
                                    <div class="step ${result.status}">
                                        <div class="step-header">
                                            <div class="step-name">${result.stepName}</div>
                                            ${statusBadge(result.status)}
                                        </div>
                                        <div class="step-details">
                                            <div>步骤ID: ${result.stepId}</div>
                                            <div>执行时间: ${stepDuration}</div>
                                            ${result.error ? `
                                            <div class="step-error">
                                                <strong>错误:</strong> ${result.error}
                                            </div>
                                            ` : ''}
                                            ${result.screenshot ? `
                                            <div class="screenshot">
                                                <strong>截图:</strong><br>
                                                <img src="${result.screenshot}" alt="测试步骤截图">
                                            </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>

        <div class="details">
            <div class="section">
                <h2>🌍 测试环境信息</h2>
                <div class="environment-info">
                    ${report.metadata?.environment ? `
                    <div class="environment-card">
                        <h3>浏览器信息</h3>
                        <div class="environment-details">
                            <div><strong>浏览器:</strong> ${report.metadata.environment.browser.name} ${report.metadata.environment.browser.version}</div>
                            <div><strong>操作系统:</strong> ${report.metadata.environment.platform.os} (${report.metadata.environment.platform.arch})</div>
                            <div><strong>Puppeteer版本:</strong> ${report.metadata.environment.puppeteer.version}</div>
                            <div><strong>收集时间:</strong> ${formatTime(report.metadata.environment.timestamp)}</div>
                        </div>
                    </div>
                    ` : `
                    <div class="environment-card">
                        <div class="environment-details">
                            <p>环境信息未收集</p>
                        </div>
                    </div>
                    `}
                </div>
            </div>
        </div>

        <div class="footer">
            <p>生成时间: ${formatTime(new Date())} | 测试配置: ${JSON.stringify(report.config, null, 2)}</p>
        </div>
    </div>
</body>
</html>
    `;
  }

  /**
   * 获取测试套件列表
   */
  getTestSuites(): TestSuite[] {
    return [...this.testSuites];
  }

  /**
   * 获取最近的测试结果
   */
  getRecentResults(): TestResult[] {
    return [...this.currentResults];
  }

  /**
   * 清除测试结果
   */
  clearResults(): void {
    this.currentResults = [];
  }
}