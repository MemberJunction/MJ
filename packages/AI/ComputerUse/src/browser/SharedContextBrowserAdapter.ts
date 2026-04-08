/**
 * Browser adapter that wraps a pre-existing Playwright BrowserContext.
 *
 * Used by HeadlessBrowserEngine for parallel test execution: multiple tests
 * share a single Browser, each worker gets its own BrowserContext (isolated
 * localStorage, cookies, cache), and this adapter manages a Page within
 * that context.
 *
 * Key differences from PlaywrightBrowserAdapter:
 * - Launch() creates a Page within the shared context (does NOT launch a browser)
 * - Close() closes the Page only (does NOT close context or browser — pool owns those)
 * - Auth state persists between Close()/Launch() cycles (context stays alive)
 */

import type { BrowserContext, Page, Route } from 'playwright';
import { BaseBrowserAdapter } from './BaseBrowserAdapter.js';
import {
    BrowserAction,
    BrowserConfig,
    ActionExecutionResult,
    CookieEntry,
} from '../types/browser.js';

export class SharedContextBrowserAdapter extends BaseBrowserAdapter {
    private sharedContext: BrowserContext;
    private page: Page | null = null;
    private config: BrowserConfig = new BrowserConfig();

    private domainHeaders: Map<string, Record<string, string>> = new Map();
    private routeInterceptorActive: boolean = false;

    constructor(sharedContext: BrowserContext) {
        super();
        this.sharedContext = sharedContext;
    }

    // ─── Lifecycle ─────────────────────────────────────────

    public override async Launch(config: BrowserConfig): Promise<void> {
        if (this.page) {
            return; // Already has an active page
        }

        this.config = config;
        this.page = await this.sharedContext.newPage();
        this.page.setDefaultNavigationTimeout(config.NavigationTimeoutMs);
        this.page.setDefaultTimeout(config.ActionTimeoutMs);
    }

    public override async Close(): Promise<void> {
        // Close the page only — the context and browser are owned by the pool
        if (this.page) {
            await this.page.close().catch(() => {});
            this.page = null;
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

    private async executeActionInternal(action: BrowserAction): Promise<void> {
        const page = this.page!;

        switch (action.Type) {
            case 'Click': {
                let x = action.X;
                let y = action.Y;
                if (action.BoundingBox) {
                    x = (action.BoundingBox.XMin + action.BoundingBox.XMax) / 2;
                    y = (action.BoundingBox.YMin + action.BoundingBox.YMax) / 2;
                }
                await page.mouse.click(x, y, {
                    button: action.Button,
                    clickCount: action.ClickCount,
                });
                break;
            }
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
                const _exhaustive: never = action;
                throw new Error(`Unknown browser action type: ${JSON.stringify(_exhaustive)}`);
            }
        }
    }

    // ─── Auth Support ──────────────────────────────────────

    public override async SetExtraHeaders(
        domain: string,
        headers: Record<string, string>
    ): Promise<void> {
        this.requirePage();
        const existing = this.domainHeaders.get(domain) ?? {};
        this.domainHeaders.set(domain, { ...existing, ...headers });

        if (!this.routeInterceptorActive) {
            await this.page!.route('**/*', async (route: Route) => {
                const requestDomain = this.ExtractDomain(route.request().url());
                const matchedHeaders = this.findHeadersForDomain(requestDomain);

                if (matchedHeaders) {
                    await route.continue({
                        headers: { ...route.request().headers(), ...matchedHeaders },
                    });
                } else {
                    await route.continue();
                }
            });
            this.routeInterceptorActive = true;
        }
    }

    private findHeadersForDomain(domain: string): Record<string, string> | undefined {
        if (this.domainHeaders.has(domain)) return this.domainHeaders.get(domain);
        for (const [pattern, headers] of this.domainHeaders) {
            if (pattern === '*') return headers;
            if (pattern.startsWith('*.')) {
                const suffix = pattern.slice(1);
                if (domain.endsWith(suffix) || domain === pattern.slice(2)) return headers;
            }
        }
        return undefined;
    }

    public override async SetCookies(cookies: CookieEntry[]): Promise<void> {
        const playwrightCookies = cookies.map(cookie => ({
            name: cookie.Name,
            value: cookie.Value,
            domain: cookie.Domain,
            path: cookie.Path,
            secure: cookie.Secure,
            httpOnly: cookie.HttpOnly,
            sameSite: (cookie.SameSite ?? 'Lax') as 'Strict' | 'Lax' | 'None',
            expires: cookie.Expires ?? -1,
        }));
        await this.sharedContext.addCookies(playwrightCookies);
    }

    public override async SetLocalStorage(
        domain: string,
        entries: Record<string, string>
    ): Promise<void> {
        this.requirePage();
        const currentDomain = this.ExtractDomain(this.page!.url());

        if (currentDomain === domain) {
            await this.page!.evaluate((items: Record<string, string>) => {
                for (const [key, value] of Object.entries(items)) {
                    localStorage.setItem(key, value);
                }
            }, entries);
        } else {
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
        return this.page !== null && !this.page.isClosed();
    }

    public override get ViewportWidth(): number {
        return this.config.ViewportWidth;
    }

    public override get ViewportHeight(): number {
        return this.config.ViewportHeight;
    }

    // ─── Internal ──────────────────────────────────────────

    private requirePage(): void {
        if (!this.page) {
            throw new Error('No active page. Call Launch() before using the adapter.');
        }
    }
}
