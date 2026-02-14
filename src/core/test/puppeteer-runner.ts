import puppeteer, { Browser, Page, LaunchOptions } from 'puppeteer';
import { Logger } from '../../utils/logger';
import { TestResult, TestStep, TestConfig, TestError } from '../../types/test';
import { TestEnvironmentManager } from './environment-manager';

/**
 * Puppeteer测试运行器
 * 负责启动浏览器、执行测试步骤、捕获结果和截图
 */
export class PuppeteerRunner {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private logger: Logger;
  private config: TestConfig;
  private environmentManager: TestEnvironmentManager;

  constructor(config: TestConfig) {
    this.config = config;
    this.logger = new Logger('puppeteer-runner');
    this.environmentManager = new TestEnvironmentManager(config);
  }

  /**
   * 初始化测试环境
   * 启动浏览器并创建新页面
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('正在启动浏览器...');

      const launchOptions: LaunchOptions = {
        headless: this.config.headless ?? true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080'
        ],
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      };

      // 添加可选的浏览器路径
      if (this.config.browserPath) {
        launchOptions.executablePath = this.config.browserPath;
      }

      this.browser = await puppeteer.launch(launchOptions);
      this.page = await this.browser.newPage();

      // 设置页面超时
      this.page.setDefaultTimeout(this.config.timeout || 30000);
      this.page.setDefaultNavigationTimeout(this.config.timeout || 30000);

      // 设置用户代理
      await this.page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // 初始化测试环境管理器
      this.environmentManager.setPage(this.page);
      await this.environmentManager.initialize();

      this.logger.success('浏览器启动成功');
    } catch (error) {
      this.logger.error('浏览器启动失败:', error);
      throw new TestError('浏览器初始化失败', error);
    }
  }

  /**
   * 执行单个测试步骤
   */
  async executeStep(step: TestStep): Promise<TestResult> {
    if (!this.page) {
      throw new TestError('页面未初始化');
    }

    const result: TestResult = {
      stepId: step.id,
      stepName: step.name,
      status: 'pending',
      startTime: new Date(),
      endTime: null,
      error: null,
      screenshot: null
    };

    try {
      this.logger.info(`执行测试步骤: ${step.name}`);

      // 根据步骤类型执行不同的操作
      switch (step.type) {
        case 'navigate':
          await this.executeNavigation(step);
          break;
        case 'click':
          await this.executeClick(step);
          break;
        case 'type':
          await this.executeType(step);
          break;
        case 'wait':
          await this.executeWait(step);
          break;
        case 'assert':
          await this.executeAssert(step);
          break;
        case 'custom':
          await this.executeCustom(step);
          break;
        default:
          throw new TestError(`未知的测试步骤类型: ${(step as any).type}`);
      }

      result.status = 'passed';
      result.endTime = new Date();

      // 如果配置要求截图，则捕获截图
      if (this.config.screenshotOnSuccess) {
        result.screenshot = await this.captureScreenshot(step.name);
      }

      this.logger.success(`测试步骤通过: ${step.name}`);
    } catch (error) {
      result.status = 'failed';
      result.endTime = new Date();
      result.error = error instanceof Error ? error.message : String(error);

      // 失败时总是截图
      result.screenshot = await this.captureScreenshot(`${step.name}_failed`);

      this.logger.error(`测试步骤失败: ${step.name}`, error);
    }

    return result;
  }

  /**
   * 执行导航步骤
   */
  private async executeNavigation(step: TestStep): Promise<void> {
    if (!this.page) return;

    const url = step.params?.url;
    if (!url) {
      throw new TestError('导航步骤缺少URL参数');
    }

    this.logger.debug(`导航到: ${url}`);
    await this.page.goto(url, {
      waitUntil: step.params?.waitUntil || 'networkidle0'
    });

    // 可选：等待特定元素出现
    if (step.params?.waitForSelector) {
      await this.page.waitForSelector(step.params.waitForSelector, {
        timeout: step.params?.timeout || 10000
      });
    }
  }

  /**
   * 执行点击步骤
   */
  private async executeClick(step: TestStep): Promise<void> {
    if (!this.page) return;

    const selector = step.params?.selector;
    if (!selector) {
      throw new TestError('点击步骤缺少选择器参数');
    }

    this.logger.debug(`点击元素: ${selector}`);

    // 等待元素可见
    await this.page.waitForSelector(selector, {
      visible: true,
      timeout: step.params?.timeout || 10000
    });

    // 点击元素
    await this.page.click(selector);

    // 可选：等待导航或内容变化
    if (step.params?.waitAfter) {
      await this.page.waitForTimeout(step.params.waitAfter);
    }
  }

  /**
   * 执行输入步骤
   */
  private async executeType(step: TestStep): Promise<void> {
    if (!this.page) return;

    const selector = step.params?.selector;
    const text = step.params?.text;

    if (!selector || text === undefined) {
      throw new TestError('输入步骤缺少选择器或文本参数');
    }

    this.logger.debug(`在 ${selector} 输入: ${text}`);

    // 等待元素可见
    await this.page.waitForSelector(selector, {
      visible: true,
      timeout: step.params?.timeout || 10000
    });

    // 清空输入框（可选）
    if (step.params?.clear) {
      await this.page.click(selector, { clickCount: 3 });
      await this.page.keyboard.press('Backspace');
    }

    // 输入文本
    await this.page.type(selector, text, {
      delay: step.params?.delay || 50
    });

    // 可选：按回车键
    if (step.params?.pressEnter) {
      await this.page.keyboard.press('Enter');
    }
  }

  /**
   * 执行等待步骤
   */
  private async executeWait(step: TestStep): Promise<void> {
    if (!this.page) return;

    const duration = step.params?.duration || 1000;
    const selector = step.params?.selector;

    this.logger.debug(`等待 ${duration}ms`);

    if (selector) {
      // 等待特定元素
      await this.page.waitForSelector(selector, {
        visible: step.params?.visible,
        hidden: step.params?.hidden,
        timeout: duration
      });
    } else {
      // 简单等待
      await this.page.waitForTimeout(duration);
    }
  }

  /**
   * 执行断言步骤
   */
  private async executeAssert(step: TestStep): Promise<void> {
    if (!this.page) return;

    const type = step.params?.assertType;
    const selector = step.params?.selector;
    const expected = step.params?.expected;

    if (!type || !selector) {
      throw new TestError('断言步骤缺少类型或选择器参数');
    }

    this.logger.debug(`断言: ${type} on ${selector}`);

    switch (type) {
      case 'visible':
        await this.page.waitForSelector(selector, {
          visible: true,
          timeout: step.params?.timeout || 10000
        });
        break;

      case 'hidden':
        await this.page.waitForSelector(selector, {
          hidden: true,
          timeout: step.params?.timeout || 10000
        });
        break;

      case 'text':
        if (expected === undefined) {
          throw new TestError('文本断言缺少预期值参数');
        }
        await this.assertText(selector, expected, step.params?.exact);
        break;

      case 'count':
        if (expected === undefined) {
          throw new TestError('数量断言缺少预期值参数');
        }
        await this.assertCount(selector, expected);
        break;

      case 'url':
        if (expected === undefined) {
          throw new TestError('URL断言缺少预期值参数');
        }
        await this.assertUrl(expected, step.params?.exact);
        break;

      default:
        throw new TestError(`未知的断言类型: ${type}`);
    }
  }

  /**
   * 执行自定义步骤
   */
  private async executeCustom(step: TestStep): Promise<void> {
    if (!this.page) return;

    const script = step.params?.script;
    if (!script) {
      throw new TestError('自定义步骤缺少脚本参数');
    }

    this.logger.debug('执行自定义脚本');

    // 在页面上下文中执行脚本
    await this.page.evaluate(script);
  }

  /**
   * 断言文本内容
   */
  private async assertText(selector: string, expected: string, exact?: boolean): Promise<void> {
    if (!this.page) return;

    const actual = await this.page.$eval(selector, el => el.textContent?.trim() || '');

    if (exact) {
      if (actual !== expected) {
        throw new TestError(`文本断言失败: 期望 "${expected}"，实际 "${actual}"`);
      }
    } else {
      if (!actual.includes(expected)) {
        throw new TestError(`文本断言失败: 期望包含 "${expected}"，实际 "${actual}"`);
      }
    }
  }

  /**
   * 断言元素数量
   */
  private async assertCount(selector: string, expected: number): Promise<void> {
    if (!this.page) return;

    const count = await this.page.$$eval(selector, elements => elements.length);

    if (count !== expected) {
      throw new TestError(`数量断言失败: 期望 ${expected} 个元素，实际 ${count} 个`);
    }
  }

  /**
   * 断言URL
   */
  private async assertUrl(expected: string, exact?: boolean): Promise<void> {
    if (!this.page) return;

    const actual = this.page.url();

    if (exact) {
      if (actual !== expected) {
        throw new TestError(`URL断言失败: 期望 "${expected}"，实际 "${actual}"`);
      }
    } else {
      if (!actual.includes(expected)) {
        throw new TestError(`URL断言失败: 期望包含 "${expected}"，实际 "${actual}"`);
      }
    }
  }

  /**
   * 捕获截图
   */
  private async captureScreenshot(name: string): Promise<string | null> {
    if (!this.page || !this.config.screenshotDir) {
      return null;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${name}_${timestamp}.png`;
      const filepath = `${this.config.screenshotDir}/${filename}`;

      await this.page.screenshot({
        path: filepath,
        fullPage: this.config.screenshotFullPage || false
      });

      this.logger.debug(`截图已保存: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.warn('截图失败:', error);
      return null;
    }
  }

  /**
   * 清理测试环境
   */
  async cleanup(): Promise<void> {
    try {
      // 清除测试环境
      if (this.page) {
        await this.environmentManager.clearEnvironment();
        await this.page.close();
        this.page = null;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }

      this.logger.info('测试环境已清理');
    } catch (error) {
      this.logger.error('清理测试环境失败:', error);
    }
  }

  /**
   * 获取当前页面URL
   */
  getCurrentUrl(): string {
    return this.page?.url() || '';
  }

  /**
   * 获取页面标题
   */
  async getPageTitle(): Promise<string> {
    if (!this.page) return '';
    return await this.page.title();
  }

  /**
   * 获取页面HTML
   */
  async getPageContent(): Promise<string> {
    if (!this.page) return '';
    return await this.page.content();
  }

  /**
   * 获取环境管理器
   */
  getEnvironmentManager(): TestEnvironmentManager {
    return this.environmentManager;
  }

  /**
   * 获取环境信息
   */
  getEnvironmentInfo() {
    return this.environmentManager.getEnvironmentInfo();
  }

  /**
   * 保存环境快照
   */
  async saveEnvironmentSnapshot(snapshotPath: string): Promise<void> {
    return this.environmentManager.saveEnvironmentSnapshot(snapshotPath);
  }

  /**
   * 恢复环境快照
   */
  async restoreEnvironmentSnapshot(snapshotPath: string): Promise<void> {
    return this.environmentManager.restoreEnvironmentSnapshot(snapshotPath);
  }
}