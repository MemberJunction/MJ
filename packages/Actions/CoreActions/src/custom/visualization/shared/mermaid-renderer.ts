/**
 * @fileoverview Server-side Mermaid → SVG rendering through headless Chromium.
 *
 * Mermaid lays diagrams out by measuring rendered text (`getBBox`, path lengths, canvas text
 * metrics), so it cannot run in plain Node: `mermaid.render()` throws `document is not defined`,
 * and a jsdom shim gets far enough to fail on flowcharts and ER diagrams. The only faithful
 * renderer is a real browser, so this renders inside a headless Chromium page that has the
 * Mermaid bundle loaded and no network access.
 *
 * @module @memberjunction/actions-core/visualization
 */
import { createRequire } from 'node:module';
import { chromium, type Browser, type Page } from 'playwright';
import { BaseSingleton, IShutdownable, ShutdownRegistry } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { MermaidConfig, MermaidTheme } from './mermaid-types';

/**
 * Why a render did not produce an SVG. `RENDER_FAILED` means Mermaid rejected the source, so fixing
 * it can help. `BROWSER_UNAVAILABLE` means the browser failed, not the diagram, so retrying won't.
 */
export type MermaidRenderErrorCode = 'BROWSER_UNAVAILABLE' | 'RENDER_FAILED' | 'TIMEOUT';

export type MermaidRenderResult =
    | { Success: true; Svg: string }
    | { Success: false; ErrorCode: MermaidRenderErrorCode; Message: string };

/** A render failure — the half of {@link MermaidRenderResult} that carries an error code. */
type MermaidRenderFailure = Extract<MermaidRenderResult, { Success: false }>;

/** Upper bound on a single render, so a pathological diagram cannot hold the action open. */
const RENDER_TIMEOUT_MS = 20_000;

/**
 * Most pages rendering at once; further renders wait for one to free up. Each page holds Mermaid's
 * ~3 MB bundle, so this bounds the browser's memory when an agent fans out. Finished pages stay warm.
 */
const MAX_PAGES = 4; // ponytail: fixed cap; make it configurable if a host needs more parallel renders

/** Optional override for the Chromium binary, for hosts whose browser does not match Playwright's build. */
const EXECUTABLE_PATH_ENV = 'MJ_CHROMIUM_EXECUTABLE_PATH';

/** Shape of the `window.mermaid` global the browser bundle installs, as far as we call it. */
interface BrowserMermaid {
    initialize(config: Record<string, unknown>): void;
    render(id: string, code: string): Promise<{ svg: string }>;
}

/** Arguments marshalled into the page for one render. */
interface PageRenderArgs {
    Code: string;
    Config: Record<string, unknown>;
}

/** What the in-page render hands back — plain data, since it crosses the process boundary. */
type PageRenderOutcome = { ok: true; svg: string } | { ok: false; error: string };

/**
 * Process-wide renderer. The browser is launched lazily on first use and shared. Renders run on a
 * pool of at most {@link MAX_PAGES} warm pages, each with Mermaid loaded and no network access, so
 * the 3 MB bundle is parsed once per page rather than once per render. A page that crashed or timed
 * out is closed, never reused. Registered with {@link ShutdownRegistry} so the Chromium child
 * process goes away with the host.
 */
export class MermaidRenderer extends BaseSingleton<MermaidRenderer> implements IShutdownable {
    public readonly ShutdownName = 'MermaidRenderer';

    private browserPromise: Promise<Browser> | null = null;
    private bundlePath: string | null = null;
    /** Warm pages, each tagged with the browser it belongs to so a relaunch never reuses a dead one. */
    private idlePages: Array<{ Page: Page; Browser: Browser }> = [];
    private busyPages = 0;
    private slotWaiters: Array<() => void> = [];

    protected constructor() {
        super();
        ShutdownRegistry.Instance.Register(this);
    }

    public static get Instance(): MermaidRenderer {
        return super.getInstance<MermaidRenderer>();
    }

    /**
     * Renders Mermaid source to an SVG string. Never throws: every failure comes back as a
     * result with an error code, so a caller (an agent) can decide what to do instead.
     */
    public async Render(code: string, theme: MermaidTheme, config: MermaidConfig): Promise<MermaidRenderResult> {
        // Slot first, then the browser: a render that waited must not use a browser that died meanwhile.
        await this.acquireSlot();
        const browser = await this.getBrowser();
        if (browser.Success === false) {
            this.releaseSlot();
            return browser;
        }
        const idle = this.takeIdlePage(browser.Browser);
        const page = idle ? Promise.resolve(idle) : browser.Browser.newPage();
        let reusable = false;
        try {
            // One deadline covers loading Mermaid into a new page as well as the render, so a stalled bundle load is a TIMEOUT too.
            const outcome = await this.withTimeout(page.then((p) => this.renderOnPage(p, !idle, {
                Code: code,
                // Caller config first so theme and the security level cannot be overridden by it.
                Config: { ...config, theme, startOnLoad: false, securityLevel: 'strict' },
            })), RENDER_TIMEOUT_MS);
            // The page finished normally (a syntax error leaves it healthy too), so it can serve the next render.
            reusable = true;
            if (outcome.ok === false) {
                return { Success: false, ErrorCode: 'RENDER_FAILED', Message: outcome.error };
            }
            return { Success: true, Svg: outcome.svg };
        } catch (error) {
            return this.classifyFailure(error);
        } finally {
            await this.checkInPage(page, browser.Browser, reusable);
        }
    }

    /** Closes the shared browser, if one was launched. Its pages, idle ones included, close with it. */
    public async Shutdown(): Promise<void> {
        const pending = this.browserPromise;
        this.browserPromise = null;
        this.idlePages = [];
        if (!pending) {
            return;
        }
        try {
            const browser = await pending;
            await browser.close();
        } catch (error) {
            LogError(`MermaidRenderer: failed to close the headless browser: ${this.describe(error)}`);
        }
    }

    private async getBrowser(): Promise<{ Success: true; Browser: Browser } | MermaidRenderFailure> {
        // ShutdownAll has already dropped this renderer from the registry, so a browser launched now would never be closed.
        if (ShutdownRegistry.Instance.IsShuttingDown) {
            return { Success: false, ErrorCode: 'BROWSER_UNAVAILABLE', Message: 'Mermaid rendering is unavailable while the server shuts down.' };
        }
        try {
            const pending = (this.browserPromise ??= this.launchBrowser());
            const browser = await pending;
            if (browser.isConnected()) {
                return { Success: true, Browser: browser };
            }
            // The browser died (crash, host OOM) — relaunch once rather than failing every later render.
            // Concurrent renders all see the same dead browser: only the first drops it, the rest join its relaunch.
            if (this.browserPromise === pending) {
                this.browserPromise = null;
            }
            return { Success: true, Browser: await (this.browserPromise ??= this.launchBrowser()) };
        } catch (error) {
            const message = `Mermaid rendering needs a headless Chromium (Playwright) on the server, and none could be started: ${this.describe(error)}`;
            LogError(`MermaidRenderer: ${message}`);
            return { Success: false, ErrorCode: 'BROWSER_UNAVAILABLE', Message: message };
        }
    }

    private launchBrowser(): Promise<Browser> {
        // `playwright` ships no browser; the host provides Chromium (`npx playwright install chromium`,
        // a system package, or an explicit path). Without one, launch fails and the render reports
        // BROWSER_UNAVAILABLE instead of producing a broken diagram.
        const launch = chromium.launch({
            headless: true,
            executablePath: process.env[EXECUTABLE_PATH_ENV] || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        // A failed launch must not stay cached, but a late failure must not evict a newer launch either.
        launch.catch(() => {
            if (this.browserPromise === launch) {
                this.browserPromise = null;
            }
        });
        return launch;
    }

    /** Waits for one of the {@link MAX_PAGES} render slots. */
    private async acquireSlot(): Promise<void> {
        if (this.busyPages < MAX_PAGES) {
            this.busyPages++;
            return;
        }
        // releaseSlot hands its slot straight to the oldest waiter, so busyPages never passes the cap.
        await new Promise<void>((resolve) => this.slotWaiters.push(resolve));
    }

    private releaseSlot(): void {
        const next = this.slotWaiters.shift();
        if (next) {
            next();
        } else {
            this.busyPages--;
        }
    }

    /** A warm page from this browser, if one is idle. */
    private takeIdlePage(browser: Browser): Page | undefined {
        // Drop pages from a browser that has since been replaced, and pages that closed while idle.
        this.idlePages = this.idlePages.filter((idle) => idle.Browser === browser && !idle.Page.isClosed());
        return this.idlePages.pop()?.Page;
    }

    /** Returns a healthy page to the pool, or closes one that crashed or timed out. Always frees the slot. */
    private async checkInPage(page: Promise<Page>, browser: Browser, reusable: boolean): Promise<void> {
        if (!reusable) {
            // Free the slot first: a wedged page must not hold one while it closes.
            this.releaseSlot();
            await this.closeQuietly(page);
            return;
        }
        this.idlePages.push({ Page: await page, Browser: browser });
        this.releaseSlot();
    }

    private async renderOnPage(page: Page, isNew: boolean, args: PageRenderArgs): Promise<PageRenderOutcome> {
        if (isNew) {
            // The diagram source is model output. The page needs nothing from the network, so it gets nothing.
            await page.route('**/*', (route) => route.abort());
            await page.setContent('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>');
            await page.addScriptTag({ path: this.getBundlePath() });
        }
        return page.evaluate(async ({ Code, Config }: PageRenderArgs): Promise<PageRenderOutcome> => {
            const mermaid = (window as unknown as { mermaid: BrowserMermaid }).mermaid;
            try {
                // A warm page starts every render empty, so nothing from an earlier diagram carries over.
                document.body.replaceChildren();
                mermaid.initialize(Config);
                const { svg } = await mermaid.render(`mermaid-${Date.now()}`, Code);
                return { ok: true, svg };
            } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
        }, args);
    }

    private withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new MermaidRenderTimeoutError(ms)), ms);
        });
        return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
    }

    private getBundlePath(): string {
        if (!this.bundlePath) {
            this.bundlePath = createRequire(import.meta.url).resolve('mermaid/dist/mermaid.min.js');
        }
        return this.bundlePath;
    }

    private classifyFailure(error: unknown): MermaidRenderFailure {
        if (error instanceof MermaidRenderTimeoutError) {
            return { Success: false, ErrorCode: 'TIMEOUT', Message: error.message };
        }
        // Mermaid's own errors come back as an outcome, never thrown, so anything thrown is the browser
        // (a crashed page, a missing bundle). Saying so keeps a caller from "fixing" valid Mermaid and retrying.
        const message = `The headless browser failed while rendering: ${this.describe(error)}`;
        LogError(`MermaidRenderer: ${message}`);
        return { Success: false, ErrorCode: 'BROWSER_UNAVAILABLE', Message: message };
    }

    private async closeQuietly(page: Promise<Page>): Promise<void> {
        try {
            await (await page).close();
        } catch (error) {
            LogError(`MermaidRenderer: failed to close a render page: ${this.describe(error)}`);
        }
    }

    private describe(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}

class MermaidRenderTimeoutError extends Error {
    constructor(ms: number) {
        super(`Mermaid render did not finish within ${ms / 1000}s`);
        this.name = 'MermaidRenderTimeoutError';
    }
}
