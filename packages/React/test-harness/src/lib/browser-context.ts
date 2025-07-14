import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface BrowserContextOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  deviceScaleFactor?: number;
  locale?: string;
  timezoneId?: string;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(private options: BrowserContextOptions = {}) {
    this.options = {
      headless: true,
      viewport: { width: 1280, height: 720 },
      ...options
    };
  }

  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    this.browser = await chromium.launch({
      headless: this.options.headless
    });

    this.context = await this.browser.newContext({
      viewport: this.options.viewport,
      userAgent: this.options.userAgent,
      deviceScaleFactor: this.options.deviceScaleFactor,
      locale: this.options.locale,
      timezoneId: this.options.timezoneId
    });

    this.page = await this.context.newPage();
  }

  async getPage(): Promise<Page> {
    if (!this.page) {
      await this.initialize();
    }
    return this.page!;
  }

  async navigateTo(url: string): Promise<void> {
    const page = await this.getPage();
    await page.goto(url);
  }

  async evaluateInPage<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T> {
    const page = await this.getPage();
    return await page.evaluate(fn, ...args);
  }

  async waitForSelector(selector: string, options?: { timeout?: number }): Promise<void> {
    const page = await this.getPage();
    await page.waitForSelector(selector, options);
  }

  async screenshot(path?: string): Promise<Buffer> {
    const page = await this.getPage();
    return await page.screenshot({ path });
  }

  async getContent(): Promise<string> {
    const page = await this.getPage();
    return await page.content();
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async reload(): Promise<void> {
    const page = await this.getPage();
    await page.reload();
  }

  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'load'): Promise<void> {
    const page = await this.getPage();
    await page.waitForLoadState(state);
  }
}