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
import { BaseBrowserAdapter, BrowserDiagnosticEvent } from './BaseBrowserAdapter.js';
import {
    BrowserAction,
    BrowserConfig,
    ActionExecutionResult,
    CookieEntry,
    KeyModifier,
} from '../types/browser.js';

export class SharedContextBrowserAdapter extends BaseBrowserAdapter {
    private sharedContext: BrowserContext;
    private page: Page | null = null;
    private config: BrowserConfig = new BrowserConfig();

    private domainHeaders: Map<string, Record<string, string>> = new Map();
    private routeInterceptorActive: boolean = false;
    private diagnosticBuffer: BrowserDiagnosticEvent[] = [];

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
        this.diagnosticBuffer = [];
        this.page = await this.sharedContext.newPage();
        this.page.setDefaultNavigationTimeout(config.NavigationTimeoutMs);
        this.page.setDefaultTimeout(config.ActionTimeoutMs);
        this.attachPageDiagnostics(this.page);
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

    /**
     * Reset per-session state for the given origin while preserving auth tokens.
     * Called between tests in shared-context mode so that the next test starts
     * with a clean app state but doesn't have to re-login.
     *
     * Cleans (for the given origin):
     *   - `sessionStorage` (entirely)
     *   - `localStorage` EXCEPT entries matching auth-token patterns
     *   - All IndexedDB databases (clears cached entity metadata)
     *   - Service worker registrations
     *
     * Preserves: cookies (handled at context level by Playwright — they survive
     * naturally), auth-token localStorage entries (Auth0, MSAL, generic OAuth).
     *
     * Best-effort: never throws.
     */
    public override async ResetStatePreservingAuth(origin: string): Promise<void> {
        // Need a page on the target origin to access its storage.
        // Open a temporary page if we don't have one, navigate to origin, run cleanup, close.
        const ownTempPage = !this.page;
        let page = this.page;

        try {
            if (!page) {
                page = await this.sharedContext.newPage();
            }

            // Navigate to the origin so we can access its localStorage / IndexedDB.
            // Use `domcontentloaded` to avoid waiting on slow Angular bootstrap.
            await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {});

            // Run cleanup in the page context.
            await page.evaluate(async () => {
                // Auth-token key patterns to PRESERVE in localStorage.
                // Covers Auth0 SPA SDK, MSAL, and generic OAuth conventions.
                const AUTH_KEY_PATTERNS = [
                    /^@@auth0spajs@@/,           // Auth0 SPA SDK
                    /^auth0\./,                  // Auth0 legacy
                    /^msal\./i,                  // MSAL (Azure AD)
                    /^okta-/,                    // Okta
                    /access[_-]?token/i,         // Generic OAuth access tokens
                    /id[_-]?token/i,             // OIDC ID tokens
                    /refresh[_-]?token/i,        // OAuth refresh tokens
                ];

                const isAuthKey = (key: string): boolean =>
                    AUTH_KEY_PATTERNS.some(pattern => pattern.test(key));

                // 1. Snapshot auth-related localStorage entries
                const preserved: Record<string, string> = {};
                try {
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && isAuthKey(k)) {
                            const v = localStorage.getItem(k);
                            if (v !== null) preserved[k] = v;
                        }
                    }
                } catch { /* swallow */ }

                // 2. Clear sessionStorage entirely
                try { sessionStorage.clear(); } catch { /* swallow */ }

                // 3. Clear localStorage, then restore preserved auth entries
                try {
                    localStorage.clear();
                    for (const [k, v] of Object.entries(preserved)) {
                        localStorage.setItem(k, v);
                    }
                } catch { /* swallow */ }

                // 4. Delete all IndexedDB databases (clears MJ metadata cache, Apollo cache, etc.)
                try {
                    // `indexedDB.databases()` is supported in modern Chromium
                    const idbAny = indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string }>> };
                    if (typeof idbAny.databases === 'function') {
                        const dbs = await idbAny.databases();
                        await Promise.all(dbs.map(db => {
                            if (!db.name) return Promise.resolve();
                            return new Promise<void>(resolve => {
                                const req = indexedDB.deleteDatabase(db.name!);
                                req.onsuccess = () => resolve();
                                req.onerror = () => resolve();
                                req.onblocked = () => resolve();
                            });
                        }));
                    }
                } catch { /* swallow */ }

                // 5. Unregister service workers (clears cached responses, push subs, etc.)
                try {
                    if ('serviceWorker' in navigator) {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        await Promise.all(regs.map(r => r.unregister().catch(() => false)));
                    }
                } catch { /* swallow */ }
            }).catch(() => { /* swallow */ });
        } catch {
            // Best-effort — never throw
        } finally {
            // If we opened a temporary page just for cleanup, close it.
            if (ownTempPage && page) {
                await page.close().catch(() => {});
                // Don't assign this.page — we never had one.
            }
        }
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
                // Hold any requested modifiers (e.g. Shift-click) around the coordinate click.
                const modifiers = action.Modifiers ?? [];
                for (const modifier of modifiers) {
                    await page.keyboard.down(this.resolveModifier(modifier));
                }
                try {
                    await page.mouse.click(x, y, {
                        button: action.Button,
                        clickCount: action.ClickCount,
                    });
                } finally {
                    for (const modifier of [...modifiers].reverse()) {
                        await page.keyboard.up(this.resolveModifier(modifier));
                    }
                }
                break;
            }
            case 'Type':
                await page.keyboard.type(action.Text);
                break;
            case 'Keypress':
                await page.keyboard.press(action.Modifiers?.length ? [...action.Modifiers, action.Key].join('+') : action.Key);
                break;
            case 'KeyDown':
                await page.keyboard.down(action.Key);
                break;
            case 'KeyUp':
                await page.keyboard.up(action.Key);
                break;
            case 'MouseMove':
                await page.mouse.move(action.X, action.Y);
                break;
            case 'MouseDown':
                await page.mouse.move(action.X, action.Y);
                await page.mouse.down({ button: action.Button });
                break;
            case 'MouseUp':
                await page.mouse.move(action.X, action.Y);
                await page.mouse.up({ button: action.Button });
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
            case 'Drag': {
                let startX = action.StartX;
                let startY = action.StartY;
                let endX = action.EndX;
                let endY = action.EndY;
                if (action.StartBoundingBox) {
                    startX = (action.StartBoundingBox.XMin + action.StartBoundingBox.XMax) / 2;
                    startY = (action.StartBoundingBox.YMin + action.StartBoundingBox.YMax) / 2;
                }
                if (action.EndBoundingBox) {
                    endX = (action.EndBoundingBox.XMin + action.EndBoundingBox.XMax) / 2;
                    endY = (action.EndBoundingBox.YMin + action.EndBoundingBox.YMax) / 2;
                }
                const steps = Math.max(1, Math.floor(action.Steps || 10));
                await page.mouse.move(startX, startY);
                await page.mouse.down();
                await page.mouse.move(endX, endY, { steps });
                await page.mouse.up();
                break;
            }
            default: {
                const _exhaustive: never = action;
                throw new Error(`Unknown browser action type: ${JSON.stringify(_exhaustive)}`);
            }
        }
    }

    /**
     * Resolve a {@link KeyModifier} to the concrete key name `page.keyboard.down`/`up` accept.
     * `'ControlOrMeta'` maps to `'Meta'` on macOS and `'Control'` elsewhere.
     *
     * @param modifier The modifier to resolve.
     * @returns The concrete keyboard key name.
     */
    private resolveModifier(modifier: KeyModifier): string {
        if (modifier === 'ControlOrMeta') {
            return process.platform === 'darwin' ? 'Meta' : 'Control';
        }
        return modifier;
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

    // ─── Diagnostics ──────────────────────────────────────

    /**
     * Retrieve and flush all buffered diagnostic events (console errors,
     * network failures, page crashes) captured since the last call.
     */
    public override GetDiagnostics(): BrowserDiagnosticEvent[] {
        const events = this.diagnosticBuffer;
        this.diagnosticBuffer = [];
        return events;
    }

    /**
     * Attach event listeners to a page to capture console messages,
     * page errors, request failures, and crashes into the diagnostic buffer.
     * Only captures warnings and errors to avoid noise from info/debug logs.
     */
    private attachPageDiagnostics(page: Page): void {
        page.on('console', (msg) => {
            const level = msg.type(); // 'error', 'warning', 'log', 'info', 'debug'
            if (level === 'error' || level === 'warning') {
                this.diagnosticBuffer.push({
                    timestamp: new Date().toISOString(),
                    type: 'console',
                    level,
                    message: msg.text().substring(0, 500),
                    url: page.url(),
                });
            }
        });

        page.on('pageerror', (error) => {
            this.diagnosticBuffer.push({
                timestamp: new Date().toISOString(),
                type: 'pageerror',
                message: error.message.substring(0, 500),
                url: page.url(),
            });
        });

        page.on('requestfailed', (request) => {
            const failure = request.failure();
            this.diagnosticBuffer.push({
                timestamp: new Date().toISOString(),
                type: 'requestfailed',
                message: `${request.method()} ${request.url().substring(0, 200)} — ${failure?.errorText ?? 'unknown'}`,
                url: page.url(),
            });
        });

        page.on('crash', () => {
            this.diagnosticBuffer.push({
                timestamp: new Date().toISOString(),
                type: 'crash',
                message: 'Page crashed (renderer process killed or OOM)',
                url: page.url(),
            });
        });
    }

    // ─── Internal ──────────────────────────────────────────

    private requirePage(): void {
        if (!this.page) {
            throw new Error('No active page. Call Launch() before using the adapter.');
        }
    }
}
