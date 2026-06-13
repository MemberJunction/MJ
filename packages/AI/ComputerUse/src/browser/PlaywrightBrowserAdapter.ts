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

import type { Browser, BrowserContext, CDPSession, Page, Route } from 'playwright';
import { BaseBrowserAdapter } from './BaseBrowserAdapter.js';
import {
    BrowserAction,
    BrowserConfig,
    ActionExecutionResult,
    CookieEntry,
    ScreencastFrame,
    ScreencastOptions,
    AccessibilityNode,
    ElementInfo,
    BoundingBox,
} from '../types/browser.js';
import { ClassifyConnectEndpoint } from './connect-endpoint.js';

/**
 * Shape of a node returned by Playwright's `page.accessibility.snapshot()`.
 * Only the fields we map are declared. As of Playwright 1.58 the
 * `accessibility` namespace remains at runtime but is no longer in the public
 * `.d.ts`, so we declare a precise local view rather than reach for `any`.
 */
interface PlaywrightAXNode {
    role: string;
    name: string;
    value?: string | number;
    children?: PlaywrightAXNode[];
}

/**
 * Typed view of the (now untyped-in-d.ts) `page.accessibility` namespace.
 * Lets us call `snapshot()` without `any` while staying resilient to the
 * field having been dropped from the published types.
 */
interface PlaywrightAccessibilityNamespace {
    snapshot(): Promise<PlaywrightAXNode | null>;
}

/**
 * Minimal shape of a CDP `Page.screencastFrame` event payload — only the
 * fields we consume. Playwright's `CDPSession.on('Page.screencastFrame', …)`
 * is loosely typed, so we narrow it here to stay free of `any`.
 */
interface CDPScreencastFramePayload {
    /** Base64-encoded frame image data. */
    data: string;
    /** Acknowledgement id to pass back to `Page.screencastFrameAck`. */
    sessionId: number;
    /** Frame metadata, including device-pixel dimensions. */
    metadata: {
        deviceWidth: number;
        deviceHeight: number;
    };
}

export class PlaywrightBrowserAdapter extends BaseBrowserAdapter {
    private browser: Browser | null = null;
    private context: BrowserContext | null = null;
    private page: Page | null = null;

    private config: BrowserConfig = new BrowserConfig();

    /** True when we attached to an external browser rather than launching one. */
    private connected: boolean = false;
    /** True when WE created the context (so Close() is allowed to close it). */
    private ownsContext: boolean = true;

    /** Per-domain extra headers. Key = domain, Value = headers map */
    private domainHeaders: Map<string, Record<string, string>> = new Map();
    /** Whether the route interceptor has been set up */
    private routeInterceptorActive: boolean = false;

    /** Active CDP session backing a running screencast, if any. */
    private screencastSession: CDPSession | null = null;
    /** Monotonic frame counter for the current screencast session. */
    private screencastSequence: number = 0;

    // ─── Lifecycle ─────────────────────────────────────────

    public override async Launch(config: BrowserConfig): Promise<void> {
        if (this.browser) {
            return; // Already launched
        }

        this.config = config;

        let chromium: Awaited<typeof import('playwright')>['chromium'];
        try {
            ({ chromium } = await import('playwright'));
        } catch {
            throw new Error(
                'Playwright is required for browser automation but is not installed. ' +
                'Install it with: npm install playwright'
            );
        }

        if (config.Connect) {
            // Attach to an already-running browser. We don't own its lifecycle,
            // so Close() must not call browser.close().
            const method = ClassifyConnectEndpoint(config.Connect, config.ConnectType);
            this.browser = method === 'server'
                ? await chromium.connect(config.Connect)
                : await chromium.connectOverCDP(config.Connect);
            this.connected = true;
        } else {
            this.browser = await chromium.launch({
                headless: config.Headless,
                slowMo: config.SlowMo,
                args: config.Args,
            });
            this.connected = false;
        }

        // Decide context strategy. When attached AND ReuseExistingContext is
        // requested, reuse the running browser's first context (CDP always
        // exposes the default context; a fresh Playwright server has none).
        if (this.connected && config.ReuseExistingContext) {
            const existing = this.browser.contexts();
            if (existing.length > 0) {
                this.context = existing[0];
                this.ownsContext = false;
                // Viewport/UserAgent/InitialLocalStorage are ignored on reused
                // contexts — Playwright only honors them at newContext() time.
            } else {
                this.context = await this.createOwnContext(config);
                this.ownsContext = true;
            }
        } else {
            this.context = await this.createOwnContext(config);
            this.ownsContext = true;
        }

        this.page = await this.context.newPage();

        // Set default navigation timeout
        this.page.setDefaultNavigationTimeout(config.NavigationTimeoutMs);
        this.page.setDefaultTimeout(config.ActionTimeoutMs);
    }

    /**
     * Create a fresh BrowserContext owned by this adapter. Applies viewport,
     * user agent, and any InitialLocalStorage seed via storageState.
     */
    private async createOwnContext(config: BrowserConfig): Promise<BrowserContext> {
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

        return this.browser!.newContext({
            viewport: {
                width: config.ViewportWidth,
                height: config.ViewportHeight,
            },
            userAgent: config.UserAgent,
            ...(storageState ? { storageState } : {}),
        });
    }

    public override async Close(): Promise<void> {
        // Tear down in reverse order: page → context → browser.
        // Ownership rules:
        //   - Always close the page we opened.
        //   - Only close the context if WE created it (ownsContext).
        //   - Only close the browser if WE launched it (!connected).
        // Swallow errors — partial cleanup must not mask the original failure.
        if (this.page) {
            await this.page.close().catch(() => {});
            this.page = null;
        }

        if (this.context) {
            if (this.ownsContext) {
                await this.context.close().catch(() => {});
            }
            this.context = null;
        }

        if (this.browser) {
            if (!this.connected) {
                await this.browser.close().catch(() => {});
            }
            this.browser = null;
        }

        this.connected = false;
        this.ownsContext = true;
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

    // ─── Perception ────────────────────────────────────────

    /**
     * Read the visible text of the current page (the rendered text of <body>).
     * Used by consumers that need page text for agent perception without a
     * screenshot. Returns '' when no page is open (guarded, never throws on
     * a closed adapter).
     */
    public override async GetVisibleText(): Promise<string> {
        if (!this.page) {
            return '';
        }
        return this.page.innerText('body');
    }

    /**
     * Return the current page title. Returns '' when no page is open (guarded,
     * never throws on a closed adapter).
     */
    public override async GetTitle(): Promise<string> {
        if (!this.page) {
            return '';
        }
        return this.page.title();
    }

    /**
     * Wait until the page reaches the given load state. No-op when no page is
     * open (guarded, never throws on a closed adapter).
     */
    public override async WaitForLoadState(
        state: 'load' | 'domcontentloaded' | 'networkidle'
    ): Promise<void> {
        if (!this.page) {
            return;
        }
        await this.page.waitForLoadState(state);
    }

    /**
     * Capture the page's accessibility tree, mapped recursively into our own
     * {@link AccessibilityNode} type. Returns `null` when no page is open or
     * Playwright produces no snapshot (e.g. a blank page).
     */
    public override async GetAccessibilitySnapshot(): Promise<AccessibilityNode | null> {
        if (!this.page) {
            return null;
        }
        // `page.accessibility` exists at runtime but was dropped from Playwright's
        // public types in 1.58; bridge to it through a precise typed view.
        const accessibility = (this.page as unknown as { accessibility: PlaywrightAccessibilityNamespace }).accessibility;
        const root = await accessibility.snapshot();
        return root ? this.mapAccessibilityNode(root) : null;
    }

    /**
     * Recursively map a Playwright accessibility snapshot node into our own
     * {@link AccessibilityNode}. Null-safe on every field; omits empty children.
     */
    private mapAccessibilityNode(node: PlaywrightAXNode): AccessibilityNode {
        const mapped = new AccessibilityNode();
        mapped.Role = node.role ?? '';
        mapped.Name = node.name ?? '';
        if (node.value !== undefined) {
            mapped.Value = String(node.value);
        }
        if (node.children && node.children.length > 0) {
            mapped.Children = node.children.map(child => this.mapAccessibilityNode(child));
        }
        return mapped;
    }

    /**
     * Introspect a single element via `page.locator(selector)`. Reports
     * existence (`count() > 0`), visibility, inner text, and bounding box.
     * Never throws on a missing element — returns `Exists:false` instead.
     * Bounded by the configured action timeout where Playwright supports it.
     */
    public override async QueryElement(selector: string): Promise<ElementInfo> {
        const info = new ElementInfo();
        if (!this.page) {
            return info;
        }

        try {
            const locator = this.page.locator(selector);
            const count = await locator.count();
            if (count === 0) {
                return info; // Exists:false, Visible:false, Text:''
            }

            info.Exists = true;
            // Scope subsequent reads to the first match for stability.
            const first = locator.first();
            info.Visible = await first.isVisible();

            // innerText can throw on detached/hidden nodes — guard it.
            try {
                info.Text = await first.innerText({ timeout: this.config.ActionTimeoutMs });
            } catch {
                info.Text = '';
            }

            const box = await first.boundingBox();
            if (box) {
                const bb = new BoundingBox();
                bb.XMin = box.x;
                bb.YMin = box.y;
                bb.XMax = box.x + box.width;
                bb.YMax = box.y + box.height;
                info.BoundingBox = bb;
            }
        } catch {
            // Any failure (invalid selector, navigation race) → treat as absent.
            return new ElementInfo();
        }

        return info;
    }

    // ─── Screencast (CDP live viewport feed) ───────────────

    /**
     * Start a CDP-backed live screencast of the viewport.
     *
     * Obtains a CDP session via `context.newCDPSession(page)`, subscribes to
     * `Page.screencastFrame`, and for each frame decodes the payload into a
     * {@link ScreencastFrame} (with a monotonic SequenceNumber), invokes
     * `onFrame`, then acks the frame via `Page.screencastFrameAck` so Chromium
     * continues streaming. Calling start while a screencast is already running
     * is a no-op (the existing session keeps streaming).
     *
     * @param onFrame - Callback invoked with each decoded frame.
     * @param opts - Optional sizing / quality / format / frame-skip controls.
     */
    public override async StartScreencast(
        onFrame: (frame: ScreencastFrame) => void,
        opts?: ScreencastOptions
    ): Promise<void> {
        this.requirePage();
        if (this.screencastSession) {
            return; // Already streaming — don't double-subscribe.
        }

        const session = await this.context!.newCDPSession(this.page!);
        this.screencastSession = session;
        this.screencastSequence = 0;

        session.on('Page.screencastFrame', (payload: CDPScreencastFramePayload) => {
            const frame = new ScreencastFrame();
            frame.DataBase64 = payload.data;
            frame.Width = payload.metadata.deviceWidth;
            frame.Height = payload.metadata.deviceHeight;
            frame.SequenceNumber = this.screencastSequence++;
            onFrame(frame);

            // Ack so Chromium keeps producing frames. Best-effort — if the
            // session is detaching mid-flight, swallow the error.
            session.send('Page.screencastFrameAck', { sessionId: payload.sessionId }).catch(() => {});
        });

        await session.send('Page.startScreencast', {
            format: opts?.Format ?? 'jpeg',
            quality: opts?.Quality,
            maxWidth: opts?.MaxWidth,
            maxHeight: opts?.MaxHeight,
            everyNthFrame: opts?.EveryNthFrame,
        });
    }

    /**
     * Stop the active screencast (if any): tell Chromium to stop streaming,
     * detach the CDP session, and clear screencast state. Safe to call when no
     * screencast is running. Best-effort — teardown errors are swallowed.
     */
    public override async StopScreencast(): Promise<void> {
        const session = this.screencastSession;
        if (!session) {
            return;
        }
        this.screencastSession = null;
        this.screencastSequence = 0;

        await session.send('Page.stopScreencast').catch(() => {});
        await session.detach().catch(() => {});
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
                if (action.Selector) {
                    // Selector path: click the matched element directly; the
                    // X/Y/BoundingBox coordinates are ignored when a selector
                    // is supplied.
                    await page.click(action.Selector, {
                        button: action.Button,
                        clickCount: action.ClickCount,
                        timeout: this.config.ActionTimeoutMs,
                    });
                } else {
                    await this.executeClick(page, action);
                }
                break;

            case 'Type':
                if (action.Selector) {
                    // Selector path: focus the matched element, then type so that
                    // keystroke events (and any input handlers) fire naturally.
                    await page.locator(action.Selector).focus({ timeout: this.config.ActionTimeoutMs });
                    await page.keyboard.type(action.Text);
                } else {
                    await page.keyboard.type(action.Text);
                }
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

            case 'MouseMove':
                await page.mouse.move(action.X, action.Y);
                break;

            case 'Scroll':
                if (action.Selector) {
                    // Selector path: bring the matched element into view; the
                    // delta scroll is ignored when a selector is supplied.
                    await page.locator(action.Selector).scrollIntoViewIfNeeded({ timeout: this.config.ActionTimeoutMs });
                } else {
                    await page.mouse.wheel(action.DeltaX, action.DeltaY);
                }
                break;

            case 'Wait':
                if (action.Selector) {
                    // Selector path: wait for the element to appear, bounded by
                    // the configured action timeout; DurationMs is ignored.
                    await page.waitForSelector(action.Selector, { timeout: this.config.ActionTimeoutMs });
                } else {
                    await page.waitForTimeout(action.DurationMs);
                }
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

            case 'Drag':
                await this.executeDrag(page, action);
                break;

            default: {
                // Exhaustive check — TypeScript will error if a case is missing
                const _exhaustive: never = action;
                throw new Error(`Unknown browser action type: ${JSON.stringify(_exhaustive)}`);
            }
        }
    }

    /**
     * Execute a drag action. Uses bounding box centroids when provided,
     * otherwise uses raw start/end X/Y coordinates.
     *
     * Implementation: mouseDown at start → multiple intermediate mouseMove
     * steps → mouseUp at end. The intermediate steps matter because HTML5
     * drag-and-drop handlers (e.g., AG Grid column reorder) only fire
     * `dragover` once they observe sustained mouse motion.
     */
    private async executeDrag(
        page: Page,
        action: {
            StartX: number;
            StartY: number;
            EndX: number;
            EndY: number;
            StartBoundingBox?: { XMin: number; YMin: number; XMax: number; YMax: number };
            EndBoundingBox?: { XMin: number; YMin: number; XMax: number; YMax: number };
            Steps: number;
        }
    ): Promise<void> {
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
        // Playwright's `steps` option walks the mouse via N intermediate
        // moves, which is what HTML5 dnd needs to register the drag.
        await page.mouse.move(endX, endY, { steps });
        await page.mouse.up();
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
