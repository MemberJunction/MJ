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

/** Why a render did not produce an SVG. */
export type MermaidRenderErrorCode = 'BROWSER_UNAVAILABLE' | 'RENDER_FAILED' | 'TIMEOUT';

export type MermaidRenderResult =
    | { Success: true; Svg: string }
    | { Success: false; ErrorCode: MermaidRenderErrorCode; Message: string };

/** A render failure — the half of {@link MermaidRenderResult} that carries an error code. */
type MermaidRenderFailure = Extract<MermaidRenderResult, { Success: false }>;

/** Upper bound on a single render, so a pathological diagram cannot hold the action open. */
const RENDER_TIMEOUT_MS = 20_000;

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
 * Process-wide renderer. The browser is launched lazily on first use and shared; each render
 * gets its own page, which is always closed. Registered with {@link ShutdownRegistry} so the
 * Chromium child process goes away with the host.
 */
export class MermaidRenderer extends BaseSingleton<MermaidRenderer> implements IShutdownable {
    public readonly ShutdownName = 'MermaidRenderer';

    private browserPromise: Promise<Browser> | null = null;
    private bundlePath: string | null = null;

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
        const browser = await this.getBrowser();
        if (browser.Success === false) {
            return browser;
        }
        let page: Page | null = null;
        try {
            page = await this.openRenderPage(browser.Browser);
            const outcome = await this.renderInPage(page, {
                Code: code,
                // Caller config first so theme and the security level cannot be overridden by it.
                Config: { ...config, theme, startOnLoad: false, securityLevel: 'strict' },
            });
            if (outcome.ok === false) {
                return { Success: false, ErrorCode: 'RENDER_FAILED', Message: outcome.error };
            }
            return { Success: true, Svg: outcome.svg };
        } catch (error) {
            return this.classifyFailure(error);
        } finally {
            await this.closeQuietly(page);
        }
    }

    /** Closes the shared browser, if one was launched. */
    public async Shutdown(): Promise<void> {
        const pending = this.browserPromise;
        this.browserPromise = null;
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
        try {
            if (!this.browserPromise) {
                this.browserPromise = this.launchBrowser();
            }
            const browser = await this.browserPromise;
            if (browser.isConnected()) {
                return { Success: true, Browser: browser };
            }
            // The browser died (crash, host OOM) — relaunch once rather than failing every later render.
            this.browserPromise = this.launchBrowser();
            return { Success: true, Browser: await this.browserPromise };
        } catch (error) {
            this.browserPromise = null;
            const message = `Mermaid rendering needs a headless Chromium (Playwright) on the server, and none could be started: ${this.describe(error)}`;
            LogError(`MermaidRenderer: ${message}`);
            return { Success: false, ErrorCode: 'BROWSER_UNAVAILABLE', Message: message };
        }
    }

    private launchBrowser(): Promise<Browser> {
        // `playwright` ships no browser; the host provides Chromium (`npx playwright install chromium`,
        // a system package, or an explicit path). Without one, launch fails and the render reports
        // BROWSER_UNAVAILABLE instead of producing a broken diagram.
        return chromium.launch({
            headless: true,
            executablePath: process.env[EXECUTABLE_PATH_ENV] || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    }

    private async openRenderPage(browser: Browser): Promise<Page> {
        const page = await browser.newPage();
        page.setDefaultTimeout(RENDER_TIMEOUT_MS);
        // The diagram source is model output. The page needs nothing from the network, so it gets nothing.
        await page.route('**/*', (route) => route.abort());
        await page.setContent('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>');
        await page.addScriptTag({ path: this.getBundlePath() });
        return page;
    }

    private async renderInPage(page: Page, args: PageRenderArgs): Promise<PageRenderOutcome> {
        const render = page.evaluate(async ({ Code, Config }: PageRenderArgs): Promise<PageRenderOutcome> => {
            const mermaid = (window as unknown as { mermaid: BrowserMermaid }).mermaid;
            try {
                mermaid.initialize(Config);
                const { svg } = await mermaid.render(`mermaid-${Date.now()}`, Code);
                return { ok: true, svg };
            } catch (e) {
                return { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
        }, args);
        return this.withTimeout(render, RENDER_TIMEOUT_MS);
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

    private classifyFailure(error: unknown): MermaidRenderResult {
        if (error instanceof MermaidRenderTimeoutError) {
            return { Success: false, ErrorCode: 'TIMEOUT', Message: error.message };
        }
        const message = this.describe(error);
        LogError(`MermaidRenderer: render failed: ${message}`);
        return { Success: false, ErrorCode: 'RENDER_FAILED', Message: message };
    }

    private async closeQuietly(page: Page | null): Promise<void> {
        if (!page) {
            return;
        }
        try {
            await page.close();
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
