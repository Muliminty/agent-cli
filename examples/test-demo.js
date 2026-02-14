#!/usr/bin/env node

/**
 * 测试框架功能演示
 * 展示新实现的测试结果管理和环境管理功能
 */

import { TestEnvironmentManager } from '../src/core/test/environment-manager.js';
import { ResultsManager } from '../src/core/test/results-manager.js';
import { Logger } from '../src/utils/logger.js';

async function demoEnvironmentManager() {
  console.log('🧪 演示测试环境管理器\n');

  const config = {
    baseUrl: 'https://example.com',
    cookies: [
      {
        name: 'session_id',
        value: 'demo-session-123',
        domain: 'example.com'
      }
    ],
    localStorage: {
      theme: 'dark',
      language: 'zh-CN'
    },
    sessionStorage: {
      temp_data: 'demo'
    }
  };

  const envManager = new TestEnvironmentManager(config);

  // 验证环境配置
  const validation = envManager.validateEnvironment();
  console.log('✅ 环境配置验证:', validation.valid);
  if (validation.issues.length > 0) {
    console.log('⚠️  问题:', validation.issues);
  }

  // 生成环境报告
  const report = envManager.generateEnvironmentReport();
  console.log('\n📋 环境报告:');
  console.log(report);

  console.log('\n---\n');
}

async function demoResultsManager() {
  console.log('📊 演示测试结果管理器\n');

  const resultsManager = new ResultsManager('./demo-results');
  const logger = new Logger('demo');

  // 创建示例测试结果
  const mockResults = [
    {
      stepId: 'step-1',
      stepName: '导航到首页',
      suiteId: 'demo-suite',
      suiteName: '演示套件',
      status: 'passed',
      startTime: new Date(Date.now() - 3000),
      endTime: new Date(Date.now() - 2000),
      error: null,
      screenshot: null,
      duration: 1000
    },
    {
      stepId: 'step-2',
      stepName: '点击登录按钮',
      suiteId: 'demo-suite',
      suiteName: '演示套件',
      status: 'failed',
      startTime: new Date(Date.now() - 2000),
      endTime: new Date(Date.now() - 1000),
      error: '元素未找到: button.login',
      screenshot: '/screenshots/error.png',
      duration: 1000
    },
    {
      stepId: 'step-3',
      stepName: '输入用户名',
      suiteId: 'demo-suite',
      suiteName: '演示套件',
      status: 'passed',
      startTime: new Date(Date.now() - 1000),
      endTime: new Date(),
      error: null,
      screenshot: null,
      duration: 1000
    }
  ];

  // 保存结果
  const savedPath = await resultsManager.saveResults(mockResults, 'demo-suite');
  console.log('✅ 测试结果已保存:', savedPath);

  // 生成摘要
  const summary = resultsManager.generateSummary(mockResults);
  console.log('\n📈 结果摘要:');
  console.log(`- 总步骤: ${summary.total}`);
  console.log(`- 通过: ${summary.passed}`);
  console.log(`- 失败: ${summary.failed}`);
  console.log(`- 成功率: ${summary.successRate.toFixed(1)}%`);
  console.log(`- 平均时长: ${summary.averageDuration.toFixed(0)}ms`);

  // 查询结果
  const queryResults = await resultsManager.queryResults({
    status: 'failed',
    limit: 5
  });
  console.log('\n🔍 查询失败的结果:');
  queryResults.forEach(result => {
    console.log(`  - ${result.stepName}: ${result.error}`);
  });

  // 生成统计信息
  const statistics = await resultsManager.generateStatistics();
  console.log('\n📊 统计信息:');
  console.log(`- 总套件数: ${statistics.totalSuites}`);
  console.log(`- 总步骤数: ${statistics.totalSteps}`);
  console.log(`- 成功率: ${statistics.successRate.toFixed(1)}%`);

  // 获取历史记录
  const history = await resultsManager.getTestHistory();
  console.log('\n📚 测试历史记录:');
  console.log(`- 历史记录数量: ${history.length}`);

  // 导出CSV
  const csvPath = './demo-results/results.csv';
  await resultsManager.exportToCsv(mockResults, csvPath);
  console.log(`\n📁 CSV导出完成: ${csvPath}`);

  console.log('\n---\n');
}

async function demoTrendAnalysis() {
  console.log('📈 演示趋势分析\n');

  const resultsManager = new ResultsManager('./demo-results');

  try {
    const trends = await resultsManager.generateTrendAnalysis(7);
    console.log('✅ 趋势分析生成成功');
    console.log(`- 分析天数: ${trends.dates.length}`);
    console.log(`- 成功率趋势: ${trends.successRates.map(r => r.toFixed(1)).join(', ')}`);
    console.log(`- 测试数量: ${trends.testCounts.join(', ')}`);
  } catch (error) {
    console.log('⚠️  趋势分析失败（需要更多历史数据）');
  }

  console.log('\n---\n');
}

async function cleanup() {
  console.log('🧹 演示清理\n');

  const resultsManager = new ResultsManager('./demo-results');

  try {
    const deletedCount = await resultsManager.cleanupOldResults(0); // 立即清理所有演示数据
    console.log(`✅ 清理完成，删除了 ${deletedCount} 个文件`);

    const fs = await import('fs/promises');
    await fs.rm('./demo-results', { recursive: true, force: true });
    console.log('✅ 演示目录已删除');
  } catch (error) {
    console.log('⚠️  清理过程中出现错误:', error.message);
  }
}

async function main() {
  console.log('🚀 测试框架功能演示开始\n');

  try {
    await demoEnvironmentManager();
    await demoResultsManager();
    await demoTrendAnalysis();
    await cleanup();

    console.log('🎉 演示完成！');
    console.log('\n💡 实际使用示例:');
    console.log('1. 运行测试: node bin/agent-cli test --suites "tests/*.json"');
    console.log('2. 查看报告: 打开 test-reports/ 目录下的HTML文件');
    console.log('3. 分析结果: 使用ResultsManager API进行结果分析');
  } catch (error) {
    console.error('❌ 演示失败:', error);
    process.exit(1);
  }
}

main();