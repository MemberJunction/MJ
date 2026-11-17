/**
 * @fileoverview {@link HeadlessPageRenderer} — loads a page in a headless Chromium, so a page built by script
 * in the browser is read as a visitor sees it.
 *
 * Selected per source with `Configuration.PageRenderer: 'Headless'`. Playwright is an optional peer dependency,
 * imported only when a page is first rendered; a deployment that never selects this renderer never needs it.
 * One browser is shared by the process and closed after a minute with nothing to render; each page gets a
 * context of its own, closed when the page is read.
 *
 * Every request the page makes (the page, its scripts, images and frames) goes through a route that refuses
 * private and non-web addresses (MJ's SSRF guard) and adds the source's session headers only for the
 * session's own origins, so a third-party script host never sees them.
 *
 * @module @memberjunction/content-pipeline
 */

import type { Browser, Route } from 'playwright';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AssertPublicUrl } from '@memberjunction/network-utils';
import { BasePageRenderer, PageRenderRequest, PageRenderResult } from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const HEADLESS_PAGE_RENDERER = 'Headless';

/** How long a page may take to load and settle when the source sets no limit. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** How long the shared browser stays open with nothing to render. */
const IDLE_CLOSE_MS = 60_000;

@RegisterClass(BasePageRenderer, HEADLESS_PAGE_RENDERER)
export class HeadlessPageRenderer extends BasePageRenderer {
    public readonly Key: string = HEADLESS_PAGE_RENDERER;

    private static browser: Promise<Browser> | null = null;
    private static inUse = 0;
    private static idleTimer: ReturnType<typeof setTimeout> | null = null;

    public async Render(request: PageRenderRequest): Promise<PageRenderResult> {
        await this.AssertAllowed(request.URL);
        const browser = await HeadlessPageRenderer.acquire();
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const abort = () => void context.close().catch(() => undefined);
        request.Signal.addEventListener('abort', abort, { once: true });
        try {
            const allowedHosts = new Map<string, boolean>();
            await context.route('**/*', (route) => this.route(route, request, allowedHosts));
            const page = await context.newPage();
            const response = await page.goto(this.withAccessQuery(request), {
                waitUntil: 'networkidle',
                timeout: request.TimeoutMs ?? DEFAULT_TIMEOUT_MS,
            });
            return { Html: await page.content(), FinalURL: page.url(), Status: response?.status() ?? 0 };
        } finally {
            request.Signal.removeEventListener('abort', abort);
            await context.close().catch(() => undefined);
            HeadlessPageRenderer.release();
        }
    }

    /** Close the shared browser now (a worker shutting down, a test). */
    public static async Shutdown(): Promise<void> {
        const browser = HeadlessPageRenderer.browser;
        HeadlessPageRenderer.browser = null;
        if (HeadlessPageRenderer.idleTimer) {
            clearTimeout(HeadlessPageRenderer.idleTimer);
            HeadlessPageRenderer.idleTimer = null;
        }
        await (await browser?.catch(() => null))?.close().catch(() => undefined);
    }

    /**
     * Refuse an address the page may not load: anything but http(s) (data: and blob: are the page's own), and
     * any host that resolves to a private or reserved address.
     */
    protected async AssertAllowed(url: string): Promise<void> {
        await AssertPublicUrl(url);
    }

    /** One request the page makes: refused, or sent on with the session's headers when its origin may have them. */
    private async route(route: Route, request: PageRenderRequest, allowedHosts: Map<string, boolean>): Promise<void> {
        const target = route.request().url();
        if (target.startsWith('data:') || target.startsWith('blob:')) {
            return route.continue();
        }
        let origin: string;
        try {
            origin = new URL(target).origin;
        } catch {
            return route.abort('blockedbyclient');
        }
        if (!allowedHosts.has(origin)) {
            allowedHosts.set(origin, await this.AssertAllowed(target).then(() => true, () => false));
        }
        if (!allowedHosts.get(origin)) {
            return route.abort('blockedbyclient');
        }
        const headers = request.Access?.Headers && this.isAccessOrigin(origin, request) ? { ...route.request().headers(), ...request.Access.Headers } : undefined;
        return route.continue(headers ? { headers } : undefined);
    }

    /** The page's URL with the session's query parameters, when the page's own origin may have them. */
    private withAccessQuery(request: PageRenderRequest): string {
        const query = request.Access?.QueryParameters;
        if (!query || Object.keys(query).length === 0) {
            return request.URL;
        }
        const url = new URL(request.URL);
        if (!this.isAccessOrigin(url.origin, request)) {
            return request.URL;
        }
        for (const [name, value] of Object.entries(query)) {
            url.searchParams.set(name, value);
        }
        return url.toString();
    }

    private isAccessOrigin(origin: string, request: PageRenderRequest): boolean {
        return request.AccessOrigins.some((allowed) => {
            try {
                return new URL(allowed).origin === origin;
            } catch {
                return false;
            }
        });
    }

    /** The shared browser, launched on first use; kept open while pages render. */
    private static async acquire(): Promise<Browser> {
        HeadlessPageRenderer.inUse++;
        if (HeadlessPageRenderer.idleTimer) {
            clearTimeout(HeadlessPageRenderer.idleTimer);
            HeadlessPageRenderer.idleTimer = null;
        }
        HeadlessPageRenderer.browser ??= HeadlessPageRenderer.launch();
        try {
            return await HeadlessPageRenderer.browser;
        } catch (error) {
            HeadlessPageRenderer.browser = null;
            HeadlessPageRenderer.release();
            throw error;
        }
    }

    private static async launch(): Promise<Browser> {
        let chromium: Awaited<typeof import('playwright')>['chromium'];
        try {
            ({ chromium } = await import('playwright'));
        } catch (error) {
            throw new Error(
                `The Headless page renderer needs the 'playwright' package (and a Chromium for it: npx playwright install chromium): ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        return chromium.launch({ headless: true });
    }

    /** One render done; close the browser once nothing has used it for a while. */
    private static release(): void {
        HeadlessPageRenderer.inUse = Math.max(0, HeadlessPageRenderer.inUse - 1);
        if (HeadlessPageRenderer.inUse > 0 || !HeadlessPageRenderer.browser) {
            return;
        }
        HeadlessPageRenderer.idleTimer = setTimeout(() => {
            HeadlessPageRenderer.Shutdown().catch((error) => LogError(`HeadlessPageRenderer: closing the browser failed: ${String(error)}`));
        }, IDLE_CLOSE_MS);
        HeadlessPageRenderer.idleTimer.unref?.();
    }
}
