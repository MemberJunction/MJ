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
 * Redirects are checked hop by hop. A route sees only the first request of a redirect: the browser follows the
 * rest itself (Playwright: "The handler will only be called for the first url if the response is a redirect").
 * So the route fetches every request itself without following redirects ({@link HeadlessPageRenderer.RouteRequest}):
 * - the page's own navigation stops at a redirect; {@link HeadlessPageRenderer.Render} checks where it points
 *   and navigates there, a new navigation that goes through the route again (and keeps the page's URL right);
 * - anything else (scripts, images, frames, the page's own fetches) has its redirects followed by the route,
 *   each hop checked, and the browser is handed the last answer.
 *
 * WebSockets do not go through the route at all, so the page may open none: reading a page never needs a live
 * connection.
 *
 * A session whose artifact carries a browser storage state (`AccessArtifact.Extensions.StorageState`, from the
 * `BrowserLogin` Access driver) is restored into each page's context, cookies and `localStorage` both, when the
 * page is on one of the session's origins; its `Cookie` header is then not added again. How a page is loaded is
 * the source's `PageRendererOptions` (`WaitUntil`, `WaitSelector`, `ScrollToBottom`, `UserAgent`); how Chromium is
 * launched is the deployment's ({@link HeadlessPageRenderer.LaunchArgs}, or `MJ_HEADLESS_CHROMIUM_ARGS`).
 *
 * Not covered: the address is checked by name before each request is fetched, so a DNS server that answers
 * differently between the check and the fetch could still reach a private address. Closing that needs every
 * connection made to an address checked at connect time (a proxy of our own).
 *
 * @module @memberjunction/content-pipeline
 */

import type { APIRequestContext, APIResponse, Browser, BrowserContextOptions, Page, Route } from 'playwright';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AssertPublicUrl } from '@memberjunction/network-utils';
import {
    BasePageRenderer,
    PageRenderOptions,
    PageRenderRequest,
    PageRenderResult,
    SessionStorageState,
    SessionStorageStateOf,
} from '@memberjunction/content-pipeline-base';

/** The registered key. */
export const HEADLESS_PAGE_RENDERER = 'Headless';

/** How long a page may take to load and settle when the source sets no limit. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** How long the shared browser stays open with nothing to render. */
const IDLE_CLOSE_MS = 60_000;
/** The most redirects one request may take (Chromium's own limit). */
const MAX_REDIRECTS = 20;
/** How long `WaitSelector` may take to appear when the source sets no `WaitSelectorTimeoutMs`. */
const DEFAULT_WAIT_SELECTOR_TIMEOUT_MS = 10_000; // content that arrives after load usually does within seconds
/** The most scroll steps `ScrollToBottom` takes, so an endless feed cannot hold a render forever. */
const MAX_SCROLL_STEPS = 50; // fifty screens of lazy content; the render's own timeout still bounds it
/** The environment variable that adds Chromium launch arguments (space-separated), e.g. `--no-sandbox` in a container. */
export const HEADLESS_CHROMIUM_ARGS_ENV = 'MJ_HEADLESS_CHROMIUM_ARGS';

/** What one render's route knows: the page whose navigation it watches, and how subsequent hops are fetched. */
export interface HeadlessRenderState {
    /** The page being rendered; its main frame's navigations stop at a redirect (see `Render`). */
    Page: Page | null;
    /** Where the page's navigation was last redirected; `Render` checks it and navigates there. */
    RedirectTo: string | null;
    /** Fetches a redirect's later hops, with the context's cookies. */
    Requests: APIRequestContext;
}

@RegisterClass(BasePageRenderer, HEADLESS_PAGE_RENDERER)
export class HeadlessPageRenderer extends BasePageRenderer {
    public readonly Key: string = HEADLESS_PAGE_RENDERER;

    /**
     * Extra Chromium launch arguments for this process (e.g. `['--no-sandbox', '--disable-dev-shm-usage']` in a
     * container), added to those in {@link HEADLESS_CHROMIUM_ARGS_ENV}. Read when the shared browser launches.
     */
    public static LaunchArgs: string[] = [];

    private static browser: Promise<Browser> | null = null;
    private static inUse = 0;
    private static idleTimer: ReturnType<typeof setTimeout> | null = null;

    public async Render(request: PageRenderRequest): Promise<PageRenderResult> {
        if (request.Signal.aborted) {
            throw new Error('Render aborted before starting');
        }
        await this.AssertAllowed(request.URL);
        const browser = await HeadlessPageRenderer.acquire();
        let context: Awaited<ReturnType<Browser['newContext']>> | null = null;
        const abort = () => void context?.close().catch(() => undefined);
        request.Signal.addEventListener('abort', abort, { once: true });
        try {
            if (request.Signal.aborted) {
                throw new Error('Render aborted before navigation');
            }
            context = await browser.newContext(this.contextOptions(request));
            const state: HeadlessRenderState = { Page: null, RedirectTo: null, Requests: context.request };
            await context.route('**/*', (route) => this.RouteRequest(route, request, state));
            await context.routeWebSocket(/.*/, (socket) => socket.close({ code: 1008, reason: 'WebSockets are not allowed when rendering a page' }));
            const page = await context.newPage();
            state.Page = page;
            const response = await this.navigate(page, this.withAccessQuery(request), request, state);
            await this.settle(page, request.Options);
            const finalUrl = page.url();
            if (/^https?:/i.test(finalUrl)) {
                await this.AssertAllowed(finalUrl);
            }
            return { Html: await page.content(), FinalURL: finalUrl, Status: response?.status() ?? 0 };
        } finally {
            request.Signal.removeEventListener('abort', abort);
            await context?.close().catch(() => undefined);
            HeadlessPageRenderer.release();
        }
    }

    /**
     * Load the page, following its redirects one navigation at a time: the route stops the page's navigation at
     * a redirect and says where it points, and each hop is checked here before the page goes there.
     */
    private async navigate(page: Page, url: string, request: PageRenderRequest, state: HeadlessRenderState) {
        const deadline = Date.now() + (request.TimeoutMs ?? DEFAULT_TIMEOUT_MS);
        for (let hops = 0; ; hops++) {
            state.RedirectTo = null;
            const response = await page.goto(url, { waitUntil: request.Options?.WaitUntil ?? 'networkidle', timeout: Math.max(1, deadline - Date.now()) });
            const next = state.RedirectTo as string | null;
            if (!next) {
                return response;
            }
            if (hops >= MAX_REDIRECTS) {
                throw new Error(`'${request.URL}' redirected more than ${MAX_REDIRECTS} times`);
            }
            await this.AssertAllowed(next);
            url = next;
        }
    }

    /** The page's context: no service workers, the source's User-Agent, and the session's browser state when it is for this page. */
    private contextOptions(request: PageRenderRequest): BrowserContextOptions {
        const storage = this.storageStateFor(request);
        return {
            serviceWorkers: 'block',
            ...(request.Options?.UserAgent ? { userAgent: request.Options.UserAgent } : {}),
            ...(storage ? { storageState: ToPlaywrightStorageState(storage) } : {}),
        };
    }

    /** The session's browser state, when it carries one and the page is on one of the session's origins. */
    private storageStateFor(request: PageRenderRequest): SessionStorageState | null {
        const state = SessionStorageStateOf(request.Access);
        if (!state) {
            return null;
        }
        try {
            return this.isAccessOrigin(new URL(request.URL).origin, request) ? state : null;
        } catch {
            return null;
        }
    }

    /** After navigation: wait for the source's selector, and scroll to the bottom when asked, so late content is there. */
    private async settle(page: Page, options: PageRenderOptions | undefined): Promise<void> {
        if (options?.WaitSelector) {
            await page.waitForSelector(options.WaitSelector, { state: 'visible', timeout: options.WaitSelectorTimeoutMs ?? DEFAULT_WAIT_SELECTOR_TIMEOUT_MS });
        }
        if (options?.ScrollToBottom) {
            await ScrollToBottom(page);
        }
    }

    /**
     * Run `work` with the shared browser, which stays open (and is closed after a while idle) like a render's. For
     * other browser work of the pipeline, such as a browser login, so it launches no second Chromium.
     */
    public static async WithBrowser<T>(work: (browser: Browser) => Promise<T>): Promise<T> {
        const browser = await HeadlessPageRenderer.acquire();
        try {
            return await work(browser);
        } finally {
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

    /**
     * One request the page makes. It is refused when its address may not be loaded; otherwise it is fetched
     * here, never letting the browser follow a redirect unchecked:
     * - the page's own navigation that is redirected is answered with an empty page, and `RedirectTo` says where
     *   it points
     *   ({@link HeadlessPageRenderer.navigate} checks it and goes there);
     * - any other request has its redirects followed here, each hop checked, and the browser gets the last answer.
     * The session's headers go only to the session's own origins, hop by hop.
     */
    protected async RouteRequest(route: Route, request: PageRenderRequest, state: HeadlessRenderState): Promise<void> {
        const sent = route.request();
        const target = sent.url();
        if (target.startsWith('data:') || target.startsWith('blob:')) {
            return route.continue();
        }
        if (!(await this.allowed(target))) {
            return route.abort('blockedbyclient');
        }
        const pageNavigation = sent.isNavigationRequest() && state.Page !== null && this.frameOf(route) === state.Page.mainFrame();
        let response: APIResponse;
        try {
            response = await route.fetch({ maxRedirects: 0, headers: this.headersFor(target, sent.headers(), request) });
            let url = target;
            let method = sent.method();
            let hops = 0;
            for (let next = this.redirectOf(response, url); next; next = this.redirectOf(response, url)) {
                if (pageNavigation) {
                    // An empty page, not an abort: an abort sends the browser to its error page, which races
                    // the navigation to the next hop.
                    state.RedirectTo = next;
                    return route.fulfill({ status: 200, contentType: 'text/html', body: '' });
                }
                if (++hops > MAX_REDIRECTS || !(await this.allowed(next))) {
                    return route.abort('blockedbyclient');
                }
                // A 303, and a 301/302 answering a POST, go on as a GET without the body (as browsers do).
                const status = response.status();
                const keepsBody = status === 307 || status === 308 || (method !== 'POST' && status !== 303);
                method = keepsBody ? method : 'GET';
                url = next;
                response = await state.Requests.fetch(url, {
                    method,
                    headers: this.headersFor(url, sent.headers(), request),
                    ...(keepsBody && sent.postDataBuffer() ? { data: sent.postDataBuffer()! } : {}),
                    maxRedirects: 0,
                });
            }
        } catch {
            return route.abort('failed');
        }
        return route.fulfill({ response });
    }

    /** Whether an address may be loaded; checked on every request and every hop so an origin check is never cached. */
    private async allowed(url: string): Promise<boolean> {
        try {
            new URL(url);
        } catch {
            return false;
        }
        return this.AssertAllowed(url).then(() => true, () => false);
    }

    /** Where a redirect answer points (absolute), or null when it is not a redirect. */
    private redirectOf(response: APIResponse, url: string): string | null {
        const location = response.headers()['location'];
        if (response.status() < 300 || response.status() > 399 || !location) {
            return null;
        }
        try {
            return new URL(location, url).href;
        } catch {
            return null;
        }
    }

    /** The request's headers, with the session's added when the address is one of the session's own origins. */
    private headersFor(url: string, headers: Record<string, string>, request: PageRenderRequest): Record<string, string> {
        let origin: string;
        try {
            origin = new URL(url).origin;
        } catch {
            return headers;
        }
        if (!request.Access?.Headers || !this.isAccessOrigin(origin, request)) {
            return headers;
        }
        // With the browser state restored the context holds the cookies; a Cookie header would replace them.
        const session = SessionStorageStateOf(request.Access)
            ? Object.fromEntries(Object.entries(request.Access.Headers).filter(([name]) => name.toLowerCase() !== 'cookie'))
            : request.Access.Headers;
        return { ...headers, ...session };
    }

    /** The frame a request came from; a request with none (a service worker's) is never the page's. */
    private frameOf(route: Route) {
        try {
            return route.request().frame();
        } catch {
            return null;
        }
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
        if (HeadlessPageRenderer.browser) {
            const existing = await HeadlessPageRenderer.browser.catch(() => null);
            if (!existing || !existing.isConnected()) {
                HeadlessPageRenderer.browser = null;
            }
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
        const browser = await chromium.launch({ headless: true, args: HeadlessPageRenderer.launchArgs() });
        browser.once('disconnected', () => {
            HeadlessPageRenderer.browser = null;
        });
        return browser;
    }

    /** {@link LaunchArgs} plus those in {@link HEADLESS_CHROMIUM_ARGS_ENV}, each once. */
    private static launchArgs(): string[] {
        const fromEnv = (process.env[HEADLESS_CHROMIUM_ARGS_ENV] ?? '').split(/\s+/).filter((a) => a.length > 0);
        return [...new Set([...fromEnv, ...HeadlessPageRenderer.LaunchArgs])];
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

/** Scroll a page to its bottom a screen at a time until it stops growing (or {@link MAX_SCROLL_STEPS}), for content loaded on scroll. */
async function ScrollToBottom(page: Page): Promise<void> {
    let height = -1;
    for (let step = 0; step < MAX_SCROLL_STEPS; step++) {
        const next = await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
            return document.body.scrollHeight;
        });
        const atBottom = await page.evaluate(() => window.scrollY + window.innerHeight >= document.body.scrollHeight - 2);
        if (atBottom && next === height) {
            return;
        }
        height = next;
        await page.waitForTimeout(250);
    }
}

/** A {@link SessionStorageState} in Playwright's `storageState` shape. */
export function ToPlaywrightStorageState(state: SessionStorageState): Exclude<BrowserContextOptions['storageState'], string | undefined> {
    return {
        cookies: state.Cookies.map((c) => ({
            name: c.Name,
            value: c.Value,
            domain: c.Domain,
            path: c.Path,
            expires: c.Expires,
            httpOnly: c.HttpOnly,
            secure: c.Secure,
            sameSite: c.SameSite,
        })),
        origins: state.Origins.map((o) => ({ origin: o.Origin, localStorage: o.LocalStorage.map((e) => ({ name: e.Name, value: e.Value })) })),
    };
}
