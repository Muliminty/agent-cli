import { Page, Browser } from 'puppeteer';
import { Logger } from '../../utils/logger';
import { TestConfig, TestEnvironment } from '../../types/test';
import * as os from 'os';

/**
 * 测试环境管理器
 * 负责设置和管理测试环境，包括Cookies、本地存储、会话存储等
 * 设计思路：提供统一的环境配置接口，确保测试环境的一致性
 */
export class TestEnvironmentManager {
  private logger: Logger;
  private page: Page | null = null;
  private config: TestConfig;
  private environmentInfo: TestEnvironment | null = null;

  constructor(config: TestConfig) {
    this.config = config;
    this.logger = new Logger('test-environment');
  }

  /**
   * 设置页面实例
   */
  setPage(page: Page): void {
    this.page = page;
  }

  /**
   * 初始化测试环境
   */
  async initialize(): Promise<void> {
    if (!this.page) {
      throw new Error('页面未设置，无法初始化环境');
    }

    this.logger.info('正在初始化测试环境...');

    try {
      // 1. 设置Cookies
      await this.setupCookies();

      // 2. 设置本地存储
      await this.setupLocalStorage();

      // 3. 设置会话存储
      await this.setupSessionStorage();

      // 4. 收集环境信息
      await this.collectEnvironmentInfo();

      this.logger.success('测试环境初始化完成');
    } catch (error) {
      this.logger.error('测试环境初始化失败:', error);
      throw error;
    }
  }

  /**
   * 设置Cookies
   */
  private async setupCookies(): Promise<void> {
    if (!this.page || !this.config.cookies || this.config.cookies.length === 0) {
      return;
    }

    this.logger.debug(`正在设置 ${this.config.cookies.length} 个Cookies`);

    const cookies = this.config.cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain || new URL(this.config.baseUrl || 'http://localhost').hostname,
      path: cookie.path || '/',
      expires: Math.floor(Date.now() / 1000) + 3600, // 1小时后过期
      httpOnly: false,
      secure: this.config.baseUrl?.startsWith('https://') || false,
      sameSite: 'Lax' as const
    }));

    await this.page.setCookie(...cookies);
    this.logger.debug('Cookies设置完成');
  }

  /**
   * 设置本地存储
   */
  private async setupLocalStorage(): Promise<void> {
    if (!this.page || !this.config.localStorage || Object.keys(this.config.localStorage).length === 0) {
      return;
    }

    this.logger.debug(`正在设置 ${Object.keys(this.config.localStorage).length} 个本地存储项`);

    const localStorageScript = `
      (function() {
        const data = ${JSON.stringify(this.config.localStorage)};
        Object.keys(data).forEach(key => {
          localStorage.setItem(key, data[key]);
        });
        return Object.keys(data).length;
      })();
    `;

    const count = await this.page.evaluate(localStorageScript);
    this.logger.debug(`本地存储设置完成，共设置 ${count} 项`);
  }

  /**
   * 设置会话存储
   */
  private async setupSessionStorage(): Promise<void> {
    if (!this.page || !this.config.sessionStorage || Object.keys(this.config.sessionStorage).length === 0) {
      return;
    }

    this.logger.debug(`正在设置 ${Object.keys(this.config.sessionStorage).length} 个会话存储项`);

    const sessionStorageScript = `
      (function() {
        const data = ${JSON.stringify(this.config.sessionStorage)};
        Object.keys(data).forEach(key => {
          sessionStorage.setItem(key, data[key]);
        });
        return Object.keys(data).length;
      })();
    `;

    const count = await this.page.evaluate(sessionStorageScript);
    this.logger.debug(`会话存储设置完成，共设置 ${count} 项`);
  }

  /**
   * 收集环境信息
   */
  private async collectEnvironmentInfo(): Promise<void> {
    if (!this.page) {
      return;
    }

    try {
      // 获取浏览器信息
      const userAgent = await this.page.evaluate(() => navigator.userAgent);
      const browserName = userAgent.includes('Chrome') ? 'Chrome' :
                         userAgent.includes('Firefox') ? 'Firefox' :
                         userAgent.includes('Safari') ? 'Safari' : 'Unknown';

      // 获取浏览器版本
      const versionMatch = userAgent.match(/(Chrome|Firefox|Safari)\/(\d+\.\d+)/);
      const browserVersion = versionMatch ? versionMatch[2] : 'Unknown';

      // 获取Puppeteer版本信息
      const puppeteerVersion = process.env.npm_package_version || 'Unknown';

      this.environmentInfo = {
        browser: {
          name: browserName,
          version: browserVersion
        },
        platform: {
          os: os.platform(),
          arch: os.arch()
        },
        puppeteer: {
          version: puppeteerVersion
        },
        timestamp: new Date()
      };

      this.logger.debug('环境信息收集完成:', this.environmentInfo);
    } catch (error) {
      this.logger.warn('收集环境信息失败:', error);
      this.environmentInfo = null;
    }
  }

  /**
   * 获取环境信息
   */
  getEnvironmentInfo(): TestEnvironment | null {
    return this.environmentInfo;
  }

  /**
   * 保存环境快照
   */
  async saveEnvironmentSnapshot(snapshotPath: string): Promise<void> {
    if (!this.page) {
      throw new Error('页面未设置，无法保存环境快照');
    }

    try {
      const snapshot = {
        timestamp: new Date().toISOString(),
        url: this.page.url(),
        cookies: await this.page.cookies(),
        localStorage: await this.page.evaluate(() => {
          const items: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
              items[key] = localStorage.getItem(key) || '';
            }
          }
          return items;
        }),
        sessionStorage: await this.page.evaluate(() => {
          const items: Record<string, string> = {};
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key) {
              items[key] = sessionStorage.getItem(key) || '';
            }
          }
          return items;
        }),
        viewport: await this.page.viewport(),
        userAgent: await this.page.evaluate(() => navigator.userAgent)
      };

      const fs = await import('fs/promises');
      await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
      this.logger.debug(`环境快照已保存: ${snapshotPath}`);
    } catch (error) {
      this.logger.error('保存环境快照失败:', error);
      throw error;
    }
  }

  /**
   * 恢复环境快照
   */
  async restoreEnvironmentSnapshot(snapshotPath: string): Promise<void> {
    if (!this.page) {
      throw new Error('页面未设置，无法恢复环境快照');
    }

    try {
      const fs = await import('fs/promises');
      const content = await fs.readFile(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(content);

      // 恢复URL
      if (snapshot.url) {
        await this.page.goto(snapshot.url);
      }

      // 恢复Cookies
      if (snapshot.cookies && snapshot.cookies.length > 0) {
        await this.page.setCookie(...snapshot.cookies);
      }

      // 恢复本地存储
      if (snapshot.localStorage && Object.keys(snapshot.localStorage).length > 0) {
        const localStorageScript = `
          (function() {
            const data = ${JSON.stringify(snapshot.localStorage)};
            Object.keys(data).forEach(key => {
              localStorage.setItem(key, data[key]);
            });
            return Object.keys(data).length;
          })();
        `;
        await this.page.evaluate(localStorageScript);
      }

      // 恢复会话存储
      if (snapshot.sessionStorage && Object.keys(snapshot.sessionStorage).length > 0) {
        const sessionStorageScript = `
          (function() {
            const data = ${JSON.stringify(snapshot.sessionStorage)};
            Object.keys(data).forEach(key => {
              sessionStorage.setItem(key, data[key]);
            });
            return Object.keys(data).length;
          })();
        `;
        await this.page.evaluate(sessionStorageScript);
      }

      // 恢复视口
      if (snapshot.viewport) {
        await this.page.setViewport(snapshot.viewport);
      }

      this.logger.debug(`环境快照已恢复: ${snapshotPath}`);
    } catch (error) {
      this.logger.error('恢复环境快照失败:', error);
      throw error;
    }
  }

  /**
   * 清除测试环境
   */
  async clearEnvironment(): Promise<void> {
    if (!this.page) {
      return;
    }

    this.logger.info('正在清除测试环境...');

    try {
      // 清除Cookies
      const cookies = await this.page.cookies();
      if (cookies.length > 0) {
        await this.page.deleteCookie(...cookies);
        this.logger.debug(`清除 ${cookies.length} 个Cookies`);
      }

      // 清除本地存储
      await this.page.evaluate(() => {
        localStorage.clear();
      });

      // 清除会话存储
      await this.page.evaluate(() => {
        sessionStorage.clear();
      });

      this.logger.success('测试环境清除完成');
    } catch (error) {
      this.logger.error('清除测试环境失败:', error);
      throw error;
    }
  }

  /**
   * 验证环境配置
   */
  validateEnvironment(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // 验证基础URL
    if (this.config.baseUrl) {
      try {
        new URL(this.config.baseUrl);
      } catch {
        issues.push(`基础URL格式无效: ${this.config.baseUrl}`);
      }
    }

    // 验证Cookies配置
    if (this.config.cookies) {
      for (let i = 0; i < this.config.cookies.length; i++) {
        const cookie = this.config.cookies[i];
        if (!cookie.name || !cookie.value) {
          issues.push(`Cookie ${i + 1} 缺少名称或值`);
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * 生成环境报告
   */
  generateEnvironmentReport(): string {
    const envInfo = this.environmentInfo;
    if (!envInfo) {
      return '环境信息未收集';
    }

    return `
测试环境报告
============

浏览器信息
--------
- 浏览器: ${envInfo.browser.name} ${envInfo.browser.version}

平台信息
--------
- 操作系统: ${envInfo.platform.os}
- 架构: ${envInfo.platform.arch}

Puppeteer信息
------------
- 版本: ${envInfo.puppeteer.version}

配置信息
--------
- 基础URL: ${this.config.baseUrl || '未设置'}
- Cookies数量: ${this.config.cookies?.length || 0}
- 本地存储项: ${this.config.localStorage ? Object.keys(this.config.localStorage).length : 0}
- 会话存储项: ${this.config.sessionStorage ? Object.keys(this.config.sessionStorage).length : 0}

时间戳
------
- 收集时间: ${envInfo.timestamp.toLocaleString()}
    `.trim();
  }
}