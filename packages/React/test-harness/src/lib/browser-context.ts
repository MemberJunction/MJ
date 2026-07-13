import { chromium, Browser, BrowserContext, Page } from 'playwright';

/** Environment-variable fallbacks for attaching to an existing browser. */
const CONNECT_ENV_VAR = 'MJ_REACT_TEST_HARNESS_CONNECT';
const REUSE_CONTEXT_ENV_VAR = 'MJ_REACT_TEST_HARNESS_REUSE_CONTEXT';

export interface BrowserContextOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  deviceScaleFactor?: number;
  locale?: string;
  timezoneId?: string;

  /**
   * Attach to an already-running browser instead of launching a new one.
   * The connect method is auto-detected from the endpoint scheme:
   *   - `http(s)://…`  → Chrome DevTools Protocol (`chromium.connectOverCDP`),
   *      e.g. a real Chrome started with `--remote-debugging-port=9222`.
   *   - `ws(s)://…`    → a Playwright browser server (`chromium.connect`),
   *      e.g. one started via `chromium.launchServer()` (local pool / Docker / remote).
   * Falls back to the `MJ_REACT_TEST_HARNESS_CONNECT` env var when unset.
   * When attaching, `headless` is ignored — the external browser already decided.
   */
  connect?: string;

  /**
   * Disambiguate the connect method. A raw CDP websocket also uses `ws://`, which
   * auto-detect would treat as a Playwright server; set `'cdp'` to force CDP.
   * Defaults to `'auto'` (scheme-based detection).
   */
  connectType?: 'cdp' | 'server' | 'auto';

  /**
   * When attached, reuse the running browser's existing default context so its
   * cookies / auth / session are shared (the point of attaching to YOUR browser),
   * instead of creating a fresh isolated context. Defaults to false. Falls back to
   * the `MJ_REACT_TEST_HARNESS_REUSE_CONTEXT` env var (`1`/`true`/`yes`).
   *
   * Note: this breaks per-test isolation — parallel harness instances would share
   * one context. Viewport/locale/userAgent options are ignored when reusing a
   * context (they only apply to contexts the harness creates).
   */
  reuseExistingContext?: boolean;
}

/**
 * Decide whether a connect endpoint refers to a CDP browser or a Playwright server.
 * Pure (no I/O) so it can be unit-tested without launching a browser.
 *
 * @throws if the scheme is unrecognized and no explicit `hint` is given.
 */
export function ClassifyConnectEndpoint(
  endpoint: string,
  hint: 'cdp' | 'server' | 'auto' = 'auto'
): 'cdp' | 'server' {
  if (hint !== 'auto') {
    return hint;
  }
  if (/^wss?:\/\//i.test(endpoint)) {
    return 'server';
  }
  if (/^https?:\/\//i.test(endpoint)) {
    return 'cdp';
  }
  throw new Error(
    `Unrecognized connect endpoint "${endpoint}". Use http(s):// for CDP ` +
    `or ws(s):// for a Playwright server, or set connectType explicitly.`
  );
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  /** True when we attached to an external browser rather than launching one. */
  private connected = false;
  /** True when WE created the context (so close() is allowed to close it). */
  private ownsContext = false;

  constructor(private options: BrowserContextOptions = {}) {
    this.options = {
      headless: true,
      viewport: { width: 1280, height: 720 },
      ...options
    };
  }

  /** Options applied when the harness creates its own browser context. */
  private contextOptions() {
    return {
      viewport: this.options.viewport,
      userAgent: this.options.userAgent,
      deviceScaleFactor: this.options.deviceScaleFactor,
      locale: this.options.locale,
      timezoneId: this.options.timezoneId
    };
  }

  /** Resolve whether to reuse the existing context (option → env-var fallback). */
  private shouldReuseExistingContext(): boolean {
    if (this.options.reuseExistingContext !== undefined) {
      return this.options.reuseExistingContext;
    }
    const raw = (process.env[REUSE_CONTEXT_ENV_VAR] ?? '').toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  async initialize(): Promise<void> {
    if (this.browser) {
      return;
    }

    const endpoint = this.options.connect ?? process.env[CONNECT_ENV_VAR];

    if (endpoint) {
      const method = ClassifyConnectEndpoint(endpoint, this.options.connectType);
      this.browser = method === 'server'
        ? await chromium.connect(endpoint)
        : await chromium.connectOverCDP(endpoint);
      this.connected = true;
    } else {
      this.browser = await chromium.launch({ headless: this.options.headless });
      this.connected = false;
    }

    if (this.connected && this.shouldReuseExistingContext()) {
      // CDP connections always expose at least the default context; a freshly
      // started Playwright server has none, so fall back to creating one.
      const existing = this.browser.contexts();
      if (existing.length > 0) {
        this.context = existing[0];
        this.ownsContext = false;
      } else {
        this.context = await this.browser.newContext(this.contextOptions());
        this.ownsContext = true;
      }
    } else {
      this.context = await this.browser.newContext(this.contextOptions());
      this.ownsContext = true;
    }

    this.page = await this.context.newPage();
  }

  async getPage(): Promise<Page> {
    if (!this.context) {
      await this.initialize();
    }
    // Always create a fresh page for each test to ensure isolation
    // This prevents issues with page.exposeFunction being called multiple times
    // and ensures each test harness instance has its own clean page
    const newPage = await this.context!.newPage();
    return newPage;
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
      // Always close pages we opened. Swallow errors — the page may already be
      // gone (e.g. the external browser closed it) and that must not mask cleanup.
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      // Only close a context WE created. Never tear down a reused/shared context
      // belonging to the attached browser (it may hold the user's other tabs).
      if (this.ownsContext) {
        await this.context.close().catch(() => {});
      }
      this.context = null;
    }
    if (this.browser) {
      // Only close browsers WE launched. When attached, leave the external
      // browser/server running — its lifecycle belongs to whoever started it.
      // The Playwright client connection is released on process exit or when
      // the caller drops this harness.
      if (!this.connected) {
        await this.browser.close().catch(() => {});
      }
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