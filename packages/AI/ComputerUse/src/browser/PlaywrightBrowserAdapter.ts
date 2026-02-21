/**
 * Playwright-based browser adapter for the Computer Use engine.
 *
 * This is the default (and currently only) concrete implementation
 * of BaseBrowserAdapter. It drives Chromium via Playwright.
 *
 * Key implementation details:
 * - Per-domain header injection via page.route() interception
 * - Screenshots returned as base64 PNG strings (no Buffer)
 * - Exhaustive action handling via discriminated union switch
 * - Proper cleanup ordering: page → context → browser
 *
 * Playwright is imported dynamically here — it's a peer dependency
 * of @memberjunction/computer-use, so the consumer controls
 * which version is installed.
 */

import { chromium, Browser, BrowserContext, Page, Route } from 'playwright';
import { BaseBrowserAdapter } from './BaseBrowserAdapter.js';
import {
    BrowserAction,
    BrowserConfig,
    ActionExecutionResult,
    CookieEntry,
} from '../types/browser.js';

export class PlaywrightBrowserAdapter extends BaseBrowserAdapter {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    private config: BrowserConfig = new BrowserConfig();

    /** Per-domain extra headers. Key = domain, Value = headers map */
    private domainHeaders: Map<string, Record<string, string>> = new Map();
    /** Whether the route interceptor has been set up */
    private routeInterceptorActive: boolean = false;

    // ─── Lifecycle ─────────────────────────────────────────

    public override async Launch(config: BrowserConfig): Promise<void> {
        if (this.browser) {
            return; // Already launched
        }

        this.config = config;

        this.browser = await chromium.launch({
            headless: config.Headless,
            slowMo: config.SlowMo,
        });

        // Build storageState if InitialLocalStorage is configured.
        // This pre-populates localStorage before any page loads, avoiding
        // race conditions with SPA auth SDKs that read localStorage on init.
        const storageState = config.InitialLocalStorage?.length
            ? {
                cookies: [] as { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None' }[],
                origins: config.InitialLocalStorage.map(o => ({
                    origin: o.Origin,
                    localStorage: o.Entries,
                })),
            }
            : undefined;

        this.context = await this.browser.newContext({
            viewport: {
                width: config.ViewportWidth,
                height: config.ViewportHeight,
            },
            userAgent: config.UserAgent,
            ...(storageState ? { storageState } : {}),
        });

        this.page = await this.context.newPage();

        // Set default navigation timeout
        this.page.setDefaultNavigationTimeout(config.NavigationTimeoutMs);
        this.page.setDefaultTimeout(config.ActionTimeoutMs);
    }

    public override async Close(): Promise<void> {
        // Tear down in reverse order: page → context → browser
        if (this.page) {
            await this.page.close().catch(() => {});
            this.page = null;
        }

        if (this.context) {
            await this.context.close().catch(() => {});
            this.context = null;
        }

        if (this.browser) {
            await this.browser.close().catch(() => {});
            this.browser = null;
        }

        this.domainHeaders.clear();
        this.routeInterceptorActive = false;
    }

    // ─── Navigation ────────────────────────────────────────

    public override async Navigate(url: string): Promise<void> {
        this.requirePage();
        await this.page!.goto(url, { waitUntil: 'load' });
    }

    // ─── Screenshot ────────────────────────────────────────

    public override async CaptureScreenshot(): Promise<string> {
        this.requirePage();
        const buffer = await this.page!.screenshot({ type: 'png', fullPage: false });
        return buffer.toString('base64');
    }

    // ─── Action Execution ──────────────────────────────────

    public override async ExecuteAction(action: BrowserAction): Promise<ActionExecutionResult> {
        this.requirePage();
        const result = new ActionExecutionResult(action);
        const startTime = performance.now();

        try {
            await this.executeActionInternal(action);
            result.Success = true;
        } catch (error) {
            result.Success = false;
            result.Error = error instanceof Error ? error.message : String(error);
        }

        result.DurationMs = performance.now() - startTime;
        return result;
    }

    /**
     * Internal action dispatch. Switches on the discriminated union Type field.
     * Each case delegates to the appropriate Playwright API.
     */
    private async executeActionInternal(action: BrowserAction): Promise<void> {
        const page = this.page!;

        switch (action.Type) {
            case 'Click':
                await this.executeClick(page, action);
                break;

            case 'Type':
                await page.keyboard.type(action.Text);
                break;

            case 'Keypress':
                await page.keyboard.press(action.Key);
                break;

            case 'KeyDown':
                await page.keyboard.down(action.Key);
                break;

            case 'KeyUp':
                await page.keyboard.up(action.Key);
                break;

            case 'Scroll':
                await page.mouse.wheel(action.DeltaX, action.DeltaY);
                break;

            case 'Wait':
                await page.waitForTimeout(action.DurationMs);
                break;

            case 'Navigate':
                await page.goto(action.Url, { waitUntil: 'load' });
                break;

            case 'GoBack':
                await page.goBack({ waitUntil: 'load' });
                break;

            case 'GoForward':
                await page.goForward({ waitUntil: 'load' });
                break;

            case 'Refresh':
                await page.reload({ waitUntil: 'load' });
                break;

            default: {
                // Exhaustive check — TypeScript will error if a case is missing
                const _exhaustive: never = action;
                throw new Error(`Unknown browser action type: ${JSON.stringify(_exhaustive)}`);
            }
        }
    }

    /**
     * Execute a click action. Uses bounding box center if available,
     * otherwise uses direct X/Y coordinates.
     */
    private async executeClick(
        page: Page,
        action: { X: number; Y: number; BoundingBox?: { XMin: number; YMin: number; XMax: number; YMax: number }; Button: 'left' | 'right' | 'middle'; ClickCount: number }
    ): Promise<void> {
        let x = action.X;
        let y = action.Y;

        // If a bounding box is provided, click the center of it
        if (action.BoundingBox) {
            x = (action.BoundingBox.XMin + action.BoundingBox.XMax) / 2;
            y = (action.BoundingBox.YMin + action.BoundingBox.YMax) / 2;
        }

        await page.mouse.click(x, y, {
            button: action.Button,
            clickCount: action.ClickCount,
        });
    }

    // ─── Auth Support ──────────────────────────────────────

    /**
     * Set extra HTTP headers for all requests to a specific domain.
     *
     * Uses Playwright's page.route() to intercept requests and inject
     * headers for matching domains. The interceptor is set up once on
     * the first call; subsequent calls just update the headers map.
     *
     * Headers are additive — calling this multiple times for the same
     * domain merges headers (later calls override conflicting keys).
     */
    public override async SetExtraHeaders(
        domain: string,
        headers: Record<string, string>
    ): Promise<void> {
        this.requirePage();

        // Merge with existing headers for this domain
        const existing = this.domainHeaders.get(domain) ?? {};
        this.domainHeaders.set(domain, { ...existing, ...headers });

        // Set up the route interceptor once
        if (!this.routeInterceptorActive) {
            await this.setupRouteInterceptor();
            this.routeInterceptorActive = true;
        }
    }

    /**
     * Set up a single route interceptor that handles all domain-scoped
     * header injection. Matches every request URL against our domain
     * headers map and adds matching headers.
     */
    private async setupRouteInterceptor(): Promise<void> {
        await this.page!.route('**/*', async (route: Route) => {
            const requestUrl = route.request().url();
            const requestDomain = this.ExtractDomain(requestUrl);

            // Find matching domain headers
            const headers = this.findHeadersForDomain(requestDomain);

            if (headers) {
                // Merge extra headers with the original request headers
                const existingHeaders = route.request().headers();
                await route.continue({
                    headers: { ...existingHeaders, ...headers },
                });
            } else {
                await route.continue();
            }
        });
    }

    /**
     * Find headers that apply to the given domain.
     * Supports exact match and wildcard patterns (e.g., *.example.com).
     */
    private findHeadersForDomain(domain: string): Record<string, string> | undefined {
        // Check exact match first
        if (this.domainHeaders.has(domain)) {
            return this.domainHeaders.get(domain);
        }

        // Check wildcard patterns
        for (const [pattern, headers] of this.domainHeaders) {
            if (pattern === '*') {
                return headers;
            }
            if (pattern.startsWith('*.')) {
                const suffix = pattern.slice(1); // e.g., ".example.com"
                if (domain.endsWith(suffix) || domain === pattern.slice(2)) {
                    return headers;
                }
            }
        }

        return undefined;
    }

    /**
     * Add cookies to the browser context.
     * Maps our CookieEntry to Playwright's cookie format.
     */
    public override async SetCookies(cookies: CookieEntry[]): Promise<void> {
        this.requireContext();

        const playwrightCookies = cookies.map(cookie => ({
            name: cookie.Name,
            value: cookie.Value,
            domain: cookie.Domain,
            path: cookie.Path,
            secure: cookie.Secure,
            httpOnly: cookie.HttpOnly,
            sameSite: this.mapSameSite(cookie.SameSite),
            expires: cookie.Expires ?? -1,
        }));

        await this.context!.addCookies(playwrightCookies);
    }

    /**
     * Map our SameSite type to Playwright's expected format.
     */
    private mapSameSite(
        sameSite?: 'Strict' | 'Lax' | 'None'
    ): 'Strict' | 'Lax' | 'None' {
        return sameSite ?? 'Lax';
    }

    /**
     * Set localStorage entries for a specific domain.
     *
     * If the page is already on the target domain, entries are set directly
     * via page.evaluate(). If not (e.g. on about:blank before first navigation),
     * entries are deferred via page.addInitScript() so they run before page
     * scripts on the next navigation — this avoids the origin mismatch that
     * would occur from navigating to https://{domain} when the actual target
     * is a different origin (e.g. http://localhost:4201).
     */
    public override async SetLocalStorage(
        domain: string,
        entries: Record<string, string>
    ): Promise<void> {
        this.requirePage();

        const currentDomain = this.ExtractDomain(this.page!.url());
        const onTargetDomain = currentDomain === domain;

        if (onTargetDomain) {
            // Already on the right origin — set directly
            await this.page!.evaluate((items: Record<string, string>) => {
                for (const [key, value] of Object.entries(items)) {
                    localStorage.setItem(key, value);
                }
            }, entries);
        } else {
            // Not yet on the target domain (e.g. about:blank before first nav).
            // Use addInitScript so the entries are injected before page scripts
            // on the next navigation to any page — localStorage will be scoped
            // to whatever origin the browser navigates to next.
            await this.page!.addInitScript((items: Record<string, string>) => {
                for (const [key, value] of Object.entries(items)) {
                    localStorage.setItem(key, value);
                }
            }, entries);
        }
    }

    // ─── State ─────────────────────────────────────────────

    public override get CurrentUrl(): string {
        return this.page?.url() ?? '';
    }

    public override get IsOpen(): boolean {
        return this.browser !== null && this.browser.isConnected();
    }

    public override get ViewportWidth(): number {
        return this.config.ViewportWidth;
    }

    public override get ViewportHeight(): number {
        return this.config.ViewportHeight;
    }

    // ─── Internal Helpers ──────────────────────────────────

    /** Throw if the page hasn't been created via Launch() */
    private requirePage(): void {
        if (!this.page) {
            throw new Error(
                'Browser not launched. Call Launch() before using the adapter.'
            );
        }
    }

    /** Throw if the context hasn't been created via Launch() */
    private requireContext(): void {
        if (!this.context) {
            throw new Error(
                'Browser not launched. Call Launch() before using the adapter.'
            );
        }
    }
}
