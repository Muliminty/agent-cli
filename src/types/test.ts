/**
 * 测试系统类型定义
 * 设计思路：支持灵活的测试步骤定义、详细的测试结果跟踪和丰富的报告生成
 */

/**
 * 测试步骤类型
 */
export type TestStepType =
  | 'navigate'   // 导航到URL
  | 'click'      // 点击元素
  | 'type'       // 输入文本
  | 'wait'       // 等待
  | 'assert'     // 断言
  | 'custom';    // 自定义操作

/**
 * 断言类型
 */
export type AssertType =
  | 'visible'    // 元素可见
  | 'hidden'     // 元素隐藏
  | 'text'       // 文本内容
  | 'count'      // 元素数量
  | 'url';       // URL匹配

/**
 * 测试步骤参数
 */
export interface TestStepParams {
  // 通用参数
  timeout?: number;
  description?: string;

  // navigate 参数
  url?: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
  waitForSelector?: string;

  // click 参数
  selector?: string;
  waitAfter?: number;

  // type 参数
  text?: string;
  delay?: number;
  clear?: boolean;
  pressEnter?: boolean;

  // wait 参数
  duration?: number;
  visible?: boolean;
  hidden?: boolean;

  // assert 参数
  assertType?: AssertType;
  expected?: string | number;
  exact?: boolean;

  // custom 参数
  script?: string;
}

/**
 * 测试步骤定义
 */
export interface TestStep {
  id: string;                     // 步骤唯一标识
  name: string;                   // 步骤名称
  type: TestStepType;             // 步骤类型
  params?: TestStepParams;        // 步骤参数
  description?: string;           // 步骤描述
  retryCount?: number;            // 重试次数（默认0）
  critical?: boolean;             // 是否为关键步骤（失败则停止）
}

/**
 * 测试套件定义
 */
export interface TestSuite {
  id: string;                     // 套件唯一标识
  name: string;                   // 套件名称
  description?: string;           // 套件描述
  steps: TestStep[];              // 测试步骤列表
  tags?: string[];                // 标签（用于分组筛选）
  filePath?: string;              // 文件路径（加载时自动填充）
  createdAt?: Date;               // 创建时间
  updatedAt?: Date;               // 更新时间
}

/**
 * 测试状态
 */
export type TestStatus = 'pending' | 'running' | 'passed' | 'failed';

/**
 * 测试结果
 */
export interface TestResult {
  stepId: string;                 // 步骤ID
  stepName: string;               // 步骤名称
  suiteId?: string;               // 所属套件ID
  suiteName?: string;             // 所属套件名称
  status: TestStatus;             // 测试状态
  startTime: Date;                // 开始时间
  endTime: Date | null;           // 结束时间
  error: string | null;           // 错误信息
  screenshot: string | null;      // 截图路径
  retryCount?: number;            // 实际重试次数
  duration?: number;              // 执行时长（ms）
}

/**
 * 测试配置
 */
export interface TestConfig {
  // 浏览器配置
  headless?: boolean;             // 是否无头模式
  browserPath?: string;           // 浏览器可执行文件路径
  timeout?: number;               // 默认超时时间（ms）

  // 执行配置
  stopOnFailure?: boolean;        // 失败时停止
  maxRetries?: number;            // 最大重试次数
  parallel?: boolean;             // 是否并行执行
  parallelCount?: number;         // 并行数量

  // 输出配置
  screenshotDir?: string;         // 截图保存目录
  screenshotOnSuccess?: boolean;  // 成功时截图
  screenshotFullPage?: boolean;   // 全屏截图
  reportDir?: string;             // 报告保存目录
  generateHtmlReport?: boolean;   // 生成HTML报告
  verbose?: boolean;              // 详细输出

  // 环境配置
  baseUrl?: string;               // 基础URL
  cookies?: Array<{               // 初始Cookie
    name: string;
    value: string;
    domain?: string;
    path?: string;
  }>;
  localStorage?: Record<string, string>;  // 初始本地存储
  sessionStorage?: Record<string, string>; // 初始会话存储
}

/**
 * 测试报告
 */
export interface TestReport {
  id: string;                     // 报告ID
  startTime: Date;                // 开始时间
  endTime: Date;                  // 结束时间
  duration: number;               // 总时长（ms）
  totalSteps: number;             // 总步骤数
  passedSteps: number;            // 通过步骤数
  failedSteps: number;            // 失败步骤数
  pendingSteps: number;           // 待执行步骤数
  successRate: number;            // 成功率（%）
  results: TestResult[];          // 详细结果
  suiteResults: Record<string, TestResult[]>;  // 按套件分组的结果
  suiteStatuses: Record<string, TestStatus>;   // 套件状态
  config: TestConfig;             // 使用的配置
  metadata?: Record<string, any>; // 附加元数据
}

/**
 * 测试错误
 */
export class TestError extends Error {
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'TestError';
    this.originalError = originalError;

    // 保持正确的原型链
    Object.setPrototypeOf(this, TestError.prototype);
  }

  /**
   * 获取完整的错误信息
   */
  getFullMessage(): string {
    if (this.originalError) {
      return `${this.message}: ${this.originalError.message}`;
    }
    return this.message;
  }

  /**
   * 获取堆栈跟踪
   */
  getFullStack(): string {
    let stack = this.stack || '';

    if (this.originalError && this.originalError.stack) {
      stack += '\n\n原始错误堆栈:\n' + this.originalError.stack;
    }

    return stack;
  }
}

/**
 * 测试执行统计
 */
export interface TestStatistics {
  totalSuites: number;            // 总套件数
  totalSteps: number;             // 总步骤数
  totalDuration: number;          // 总时长（ms）
  averageDuration: number;        // 平均时长（ms）
  successRate: number;            // 成功率（%）
  failureRate: number;            // 失败率（%）
  flakyTests: string[];           // 不稳定的测试（经常重试）
  slowTests: Array<{              // 慢测试
    stepId: string;
    stepName: string;
    duration: number;
    suiteName: string;
  }>;
}

/**
 * 测试历史记录
 */
export interface TestHistory {
  id: string;                     // 历史记录ID
  timestamp: Date;                // 执行时间
  reportId: string;               // 关联的报告ID
  summary: {                      // 摘要
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    successRate: number;
    duration: number;
  };
  config: TestConfig;             // 使用的配置
  filePath?: string;              // 报告文件路径
}

/**
 * 测试环境信息
 */
export interface TestEnvironment {
  browser: {
    name: string;                 // 浏览器名称
    version: string;              // 浏览器版本
  };
  platform: {
    os: string;                   // 操作系统
    arch: string;                 // 架构
  };
  puppeteer: {
    version: string;              // Puppeteer版本
  };
  timestamp: Date;                // 记录时间
}