import { TestResult, TestReport, TestStatistics, TestHistory, TestStatus } from '../../types/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../../utils/logger';

/**
 * 测试结果管理器
 * 负责测试结果的持久化、查询、过滤和统计分析
 * 设计思路：提供灵活的结果管理接口，支持历史记录查询和趋势分析
 */
export class ResultsManager {
  private logger: Logger;
  private storageDir: string;

  constructor(storageDir: string = './test-results') {
    this.storageDir = storageDir;
    this.logger = new Logger('results-manager');
  }

  /**
   * 保存测试结果
   */
  async saveResults(results: TestResult[], suiteId?: string): Promise<string> {
    try {
      await this.ensureStorageDir();

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = suiteId
        ? `results-${suiteId}-${timestamp}.json`
        : `results-${timestamp}.json`;

      const filepath = path.join(this.storageDir, filename);

      const data = {
        timestamp: new Date().toISOString(),
        suiteId,
        results,
        summary: this.generateSummary(results)
      };

      await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');
      this.logger.debug(`测试结果已保存: ${filepath}`);

      return filepath;
    } catch (error) {
      this.logger.error('保存测试结果失败:', error);
      throw error;
    }
  }

  /**
   * 保存测试报告
   */
  async saveReport(report: TestReport): Promise<string> {
    try {
      await this.ensureStorageDir();

      const filename = `report-${report.id}.json`;
      const filepath = path.join(this.storageDir, filename);

      await fs.writeFile(filepath, JSON.stringify(report, null, 2), 'utf-8');
      this.logger.debug(`测试报告已保存: ${filepath}`);

      return filepath;
    } catch (error) {
      this.logger.error('保存测试报告失败:', error);
      throw error;
    }
  }

  /**
   * 加载测试结果
   */
  async loadResults(filepath: string): Promise<TestResult[]> {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const data = JSON.parse(content);

      return data.results || [];
    } catch (error) {
      this.logger.error('加载测试结果失败:', error);
      throw error;
    }
  }

  /**
   * 加载测试报告
   */
  async loadReport(filepath: string): Promise<TestReport> {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(content) as TestReport;
    } catch (error) {
      this.logger.error('加载测试报告失败:', error);
      throw error;
    }
  }

  /**
   * 查询测试结果
   */
  async queryResults(query: {
    suiteId?: string;
    status?: TestStatus;
    startDate?: Date;
    endDate?: Date;
    minDuration?: number;
    maxDuration?: number;
    limit?: number;
  }): Promise<TestResult[]> {
    try {
      const allResults = await this.getAllResults();

      return allResults.filter(result => {
        // 套件ID过滤
        if (query.suiteId && result.suiteId !== query.suiteId) {
          return false;
        }

        // 状态过滤
        if (query.status && result.status !== query.status) {
          return false;
        }

        // 时间范围过滤
        if (query.startDate && result.startTime < query.startDate) {
          return false;
        }

        if (query.endDate && result.startTime > query.endDate) {
          return false;
        }

        // 持续时间过滤
        const duration = result.duration || 0;
        if (query.minDuration && duration < query.minDuration) {
          return false;
        }

        if (query.maxDuration && duration > query.maxDuration) {
          return false;
        }

        return true;
      }).slice(0, query.limit || 1000);
    } catch (error) {
      this.logger.error('查询测试结果失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有测试结果
   */
  private async getAllResults(): Promise<TestResult[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const resultFiles = files.filter(f => f.startsWith('results-') && f.endsWith('.json'));

      const allResults: TestResult[] = [];

      for (const file of resultFiles) {
        try {
          const filepath = path.join(this.storageDir, file);
          const results = await this.loadResults(filepath);
          allResults.push(...results);
        } catch (error) {
          this.logger.warn(`加载结果文件失败: ${file}`, error);
        }
      }

      return allResults;
    } catch (error) {
      // 如果目录不存在，返回空数组
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * 生成结果摘要
   */
  generateSummary(results: TestResult[]): {
    total: number;
    passed: number;
    failed: number;
    pending: number;
    successRate: number;
    totalDuration: number;
    averageDuration: number;
  } {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const pending = results.filter(r => r.status === 'pending').length;
    const successRate = total > 0 ? (passed / total) * 100 : 0;

    const durations = results
      .map(r => r.duration || 0)
      .filter(d => d > 0);

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);
    const averageDuration = durations.length > 0 ? totalDuration / durations.length : 0;

    return {
      total,
      passed,
      failed,
      pending,
      successRate,
      totalDuration,
      averageDuration
    };
  }

  /**
   * 生成统计信息
   */
  async generateStatistics(): Promise<TestStatistics> {
    try {
      const allResults = await this.getAllResults();
      const allReports = await this.getAllReports();

      if (allResults.length === 0) {
        return {
          totalSuites: 0,
          totalSteps: 0,
          totalDuration: 0,
          averageDuration: 0,
          successRate: 0,
          failureRate: 0,
          flakyTests: [],
          slowTests: []
        };
      }

      // 计算基本统计
      const summary = this.generateSummary(allResults);

      // 识别不稳定的测试（经常重试）
      const flakyTests = this.identifyFlakyTests(allResults);

      // 识别慢测试
      const slowTests = this.identifySlowTests(allResults);

      // 按套件分组统计
      const suiteResults: Record<string, TestResult[]> = {};
      for (const result of allResults) {
        const suiteId = result.suiteId || 'unknown';
        if (!suiteResults[suiteId]) {
          suiteResults[suiteId] = [];
        }
        suiteResults[suiteId].push(result);
      }

      return {
        totalSuites: Object.keys(suiteResults).length,
        totalSteps: summary.total,
        totalDuration: summary.totalDuration,
        averageDuration: summary.averageDuration,
        successRate: summary.successRate,
        failureRate: 100 - summary.successRate,
        flakyTests,
        slowTests
      };
    } catch (error) {
      this.logger.error('生成统计信息失败:', error);
      throw error;
    }
  }

  /**
   * 识别不稳定的测试
   */
  private identifyFlakyTests(results: TestResult[]): string[] {
    // 按步骤ID分组
    const stepResults: Record<string, TestResult[]> = {};

    for (const result of results) {
      const stepId = result.stepId;
      if (!stepResults[stepId]) {
        stepResults[stepId] = [];
      }
      stepResults[stepId].push(result);
    }

    // 找出经常失败的步骤
    const flakyTests: string[] = [];

    for (const [stepId, stepResultsList] of Object.entries(stepResults)) {
      if (stepResultsList.length < 3) {
        continue; // 需要足够的数据点
      }

      const failedCount = stepResultsList.filter(r => r.status === 'failed').length;
      const failureRate = (failedCount / stepResultsList.length) * 100;

      // 如果失败率在20%-80%之间，认为是flaky测试
      if (failureRate > 20 && failureRate < 80) {
        const stepName = stepResultsList[0]?.stepName || stepId;
        flakyTests.push(`${stepName} (失败率: ${failureRate.toFixed(1)}%)`);
      }
    }

    return flakyTests;
  }

  /**
   * 识别慢测试
   */
  private identifySlowTests(results: TestResult[]): Array<{
    stepId: string;
    stepName: string;
    duration: number;
    suiteName: string;
  }> {
    // 过滤出有效的持续时间
    const validResults = results.filter(r => r.duration && r.duration > 0);

    if (validResults.length === 0) {
      return [];
    }

    // 计算平均持续时间和标准差
    const durations = validResults.map(r => r.duration!);
    const average = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - average, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    // 找出超过平均值2个标准差的慢测试
    const slowThreshold = average + (2 * stdDev);

    const slowTests = validResults
      .filter(r => r.duration! > slowThreshold)
      .map(r => ({
        stepId: r.stepId,
        stepName: r.stepName,
        duration: r.duration!,
        suiteName: r.suiteName || '未知套件'
      }))
      .sort((a, b) => b.duration - a.duration) // 按持续时间降序排序
      .slice(0, 10); // 只取前10个最慢的测试

    return slowTests;
  }

  /**
   * 获取测试历史
   */
  async getTestHistory(limit: number = 10): Promise<TestHistory[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const reportFiles = files
        .filter(f => f.startsWith('report-') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const history: TestHistory[] = [];

      for (const file of reportFiles) {
        try {
          const filepath = path.join(this.storageDir, file);
          const report = await this.loadReport(filepath);

          const historyEntry: TestHistory = {
            id: `history-${report.id}`,
            timestamp: report.startTime,
            reportId: report.id,
            summary: {
              totalSteps: report.totalSteps,
              passedSteps: report.passedSteps,
              failedSteps: report.failedSteps,
              successRate: report.successRate,
              duration: report.duration
            },
            config: report.config,
            filePath: filepath
          };

          history.push(historyEntry);
        } catch (error) {
          this.logger.warn(`加载历史报告失败: ${file}`, error);
        }
      }

      return history;
    } catch (error) {
      // 如果目录不存在，返回空数组
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * 生成趋势分析
   */
  async generateTrendAnalysis(days: number = 30): Promise<{
    dates: string[];
    successRates: number[];
    durations: number[];
    testCounts: number[];
  }> {
    try {
      const history = await this.getTestHistory(100); // 获取足够的历史数据

      // 按日期分组
      const dateGroups: Record<string, {
        successRates: number[];
        durations: number[];
        testCounts: number[];
      }> = {};

      for (const entry of history) {
        const date = entry.timestamp.toISOString().split('T')[0];

        if (!dateGroups[date]) {
          dateGroups[date] = {
            successRates: [],
            durations: [],
            testCounts: []
          };
        }

        dateGroups[date].successRates.push(entry.summary.successRate);
        dateGroups[date].durations.push(entry.summary.duration);
        dateGroups[date].testCounts.push(entry.summary.totalSteps);
      }

      // 转换为数组并按日期排序
      const sortedDates = Object.keys(dateGroups).sort();
      const recentDates = sortedDates.slice(-days);

      const dates: string[] = [];
      const successRates: number[] = [];
      const durations: number[] = [];
      const testCounts: number[] = [];

      for (const date of recentDates) {
        const group = dateGroups[date];

        // 计算当天的平均值
        const avgSuccessRate = group.successRates.reduce((sum, rate) => sum + rate, 0) / group.successRates.length;
        const avgDuration = group.durations.reduce((sum, duration) => sum + duration, 0) / group.durations.length;
        const totalTests = group.testCounts.reduce((sum, count) => sum + count, 0);

        dates.push(date);
        successRates.push(avgSuccessRate);
        durations.push(avgDuration);
        testCounts.push(totalTests);
      }

      return {
        dates,
        successRates,
        durations,
        testCounts
      };
    } catch (error) {
      this.logger.error('生成趋势分析失败:', error);
      throw error;
    }
  }

  /**
   * 导出结果为CSV格式
   */
  async exportToCsv(results: TestResult[], outputPath: string): Promise<void> {
    try {
      const csvRows = [];

      // CSV头
      csvRows.push([
        '步骤ID',
        '步骤名称',
        '套件名称',
        '状态',
        '开始时间',
        '结束时间',
        '持续时间(ms)',
        '错误信息',
        '截图路径'
      ].join(','));

      // 数据行
      for (const result of results) {
        const row = [
          result.stepId,
          `"${result.stepName.replace(/"/g, '""')}"`,
          `"${(result.suiteName || '未知').replace(/"/g, '""')}"`,
          result.status,
          result.startTime.toISOString(),
          result.endTime?.toISOString() || '',
          result.duration || '',
          `"${(result.error || '').replace(/"/g, '""')}"`,
          `"${(result.screenshot || '').replace(/"/g, '""')}"`
        ].join(',');

        csvRows.push(row);
      }

      const csvContent = csvRows.join('\n');
      await fs.writeFile(outputPath, csvContent, 'utf-8');

      this.logger.debug(`CSV导出完成: ${outputPath}`);
    } catch (error) {
      this.logger.error('导出CSV失败:', error);
      throw error;
    }
  }

  /**
   * 清理旧的结果文件
   */
  async cleanupOldResults(maxAgeDays: number = 30): Promise<number> {
    try {
      await this.ensureStorageDir();

      const files = await fs.readdir(this.storageDir);
      const resultFiles = files.filter(f =>
        (f.startsWith('results-') || f.startsWith('report-')) &&
        f.endsWith('.json')
      );

      const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const file of resultFiles) {
        const filepath = path.join(this.storageDir, file);
        const stats = await fs.stat(filepath);

        if (stats.mtimeMs < cutoffTime) {
          await fs.unlink(filepath);
          deletedCount++;
          this.logger.debug(`删除旧结果文件: ${file}`);
        }
      }

      this.logger.info(`清理完成，删除了 ${deletedCount} 个旧结果文件`);
      return deletedCount;
    } catch (error) {
      this.logger.error('清理旧结果失败:', error);
      throw error;
    }
  }

  /**
   * 获取所有报告
   */
  private async getAllReports(): Promise<TestReport[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const reportFiles = files.filter(f => f.startsWith('report-') && f.endsWith('.json'));

      const reports: TestReport[] = [];

      for (const file of reportFiles) {
        try {
          const filepath = path.join(this.storageDir, file);
          const report = await this.loadReport(filepath);
          reports.push(report);
        } catch (error) {
          this.logger.warn(`加载报告文件失败: ${file}`, error);
        }
      }

      return reports;
    } catch (error) {
      // 如果目录不存在，返回空数组
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * 确保存储目录存在
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      this.logger.error('创建存储目录失败:', error);
      throw error;
    }
  }
}