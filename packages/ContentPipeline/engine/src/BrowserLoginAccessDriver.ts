/**
 * @fileoverview {@link BrowserLoginAccessDriver} — sign in to a site through its login page in a headless browser,
 * for logins a plain form post cannot do (script-built forms, reCAPTCHA-scored logins, single sign-on hops), and
 * hand the session on as cookies (and, optionally, the browser's whole state).
 *
 * Selected with `AccessDriverKey: 'BrowserLogin'`. Needs the `playwright` package, like the `Headless` renderer
 * (it uses the renderer's shared browser). The user name and password come from `MJ: Credentials`; the rest from the
 * source's settings (`AccessRequest.Parameters`):
 *
 * | Parameter | Meaning | Default |
 * |---|---|---|
 * | `LoginURL` | The login page | the source URL |
 * | `LoginPreClickSelector` | A button to click before the form exists (a "Log in" link to the identity provider) | none |
 * | `LoginUsernameSelector` | The user name field | `input[type=email]`, `input[name=username]`, … |
 * | `LoginContinueSelector` | A "continue" button between the user name and the password (two-step forms) | none |
 * | `LoginPasswordSelector` | The password field | `input[type=password]` |
 * | `LoginSubmitSelector` | The submit button | `button[type=submit]`, `input[type=submit]` |
 * | `LoginConfirmSelector` | A confirmation to click if it appears ("Stay signed in?") | none |
 * | `LoginSuccessSelector` | An element that must appear once signed in | none |
 * | `LoginCookieMarker` | A cookie that must exist once signed in | none |
 * | `LoginUserAgent` | The browser's `User-Agent` | the browser's own |
 * | `LoginTimeoutMs` | How long each step may take | 30000 |
 * | `LoginStorageState` | `false` leaves the browser state out of the artifact | `true` |
 * | `SessionOrigins` / `SessionTtlMinutes` | As for `FormLogin` | the source URL's origin / the cookies' expiry |
 *
 * The artifact's `Cookie` header per session origin (`OriginHeaders`) serves plain fetches; its
 * `Extensions.StorageState` (cookies and `localStorage`) is restored by the `Headless` renderer into each page it
 * renders, for a site whose session is not cookie-only. A login whose session is only in `localStorage` (a script
 * login that sets no cookie) hands on the browser state alone.
 *
 * Every request the login page makes to a private or reserved address is refused (MJ's SSRF guard, by name), and
 * so is every redirect hop; WebSockets, which Playwright's request routing does not see, are refused outright (as the
 * `Headless` renderer refuses them). Playwright routes only the first request of a redirect, and a redirect answer
 * handed to the browser is followed without the route too, so each request is fetched here without following
 * redirects ({@link BrowserLoginAccessDriver.RouteLogin}):
 * - a page navigation that is redirected is answered with a page that navigates on to the checked target (carrying
 *   the redirect's cookies); that navigation comes through the route again, so every hop of a sign-on is checked.
 *   The driver waits past these stand-in pages for a real document before it goes on;
 * - any other request (a script's) has its redirects followed in the route, each hop checked, and the browser gets
 *   the last answer.
 *
 * A request that still carries its body at a 307/308 (a posted form, a script's posted credentials) is followed only
 * to its own origin: the login's credentials are not re-posted to another site (as `FormLogin` refuses them), so such
 * a hop fails the request. Each hop goes as a browser's would (the renderer's `NextHopRequest`): a POST turned into a
 * GET stays bodiless, and a hop to another origin carries no `Authorization`.
 *
 * The artifact keeps only what belongs to the session's origins: the cookies that go to their hosts (each as a
 * host-only cookie of a session host, so a `.example.com` cookie cannot reach another subdomain) and their
 * `localStorage`. An identity provider's own cookies (a single sign-on hop's) stay in the login's browser.
 *
 * @module @memberjunction/content-pipeline
 */

import type { APIRequestContext, APIResponse, Browser, BrowserContext, Locator, Page, Route } from 'playwright';
import { RegisterClass } from '@memberjunction/global';
import { AssertPublicUrl } from '@memberjunction/network-utils';
import {
    ACCESS_STORAGE_STATE_EXTENSION,
    AccessArtifact,
    AccessRequest,
    BaseAccessDriver,
    SessionStorageCookie,
    SessionStorageState,
} from '@memberjunction/content-pipeline-base';
import { FirstHopRequest, HeadlessPageRenderer, NextHopRequest } from './HeadlessPageRenderer.js';
import { Cookie, CookieJar } from 'tough-cookie';
import { LoginCredentials, OriginCookies, SessionArtifact, SessionOrigins, SessionTtlMs } from './LoginSession.js';

/** The registered key. */
export const BROWSER_LOGIN_ACCESS_DRIVER = 'BrowserLogin';

/** How long each login step may take when the source sets no `LoginTimeoutMs`. */
const DEFAULT_STEP_TIMEOUT_MS = 30_000; // an identity provider's hop can be slow; half a minute per step
/** The most redirects one login request follows (Chromium's own limit). */
const MAX_LOGIN_REDIRECTS = 20;
/** How long to look for a step that may not be there (a continue button, a confirmation). */
const OPTIONAL_STEP_TIMEOUT_MS = 5_000; // long enough for a script to draw it, short enough not to stall a login without it

const DEFAULT_USERNAME_SELECTOR = "input[type='email'], input[name='username'], input[name='email'], input[name='Email'], #username, #email";
const DEFAULT_PASSWORD_SELECTOR = "input[type='password']";
const DEFAULT_SUBMIT_SELECTOR = "button[type='submit'], input[type='submit']";
/** The `<meta name>` that marks a page standing in for a redirect (see {@link NavigateOnPage}). */
const REDIRECT_STAND_IN_MARKER = 'mj-login-redirect';

/** One cookie of a Playwright browser's storage state. */
type BrowserCookie = Awaited<ReturnType<BrowserContext['storageState']>>['cookies'][number];

@RegisterClass(BaseAccessDriver, BROWSER_LOGIN_ACCESS_DRIVER)
export class BrowserLoginAccessDriver extends BaseAccessDriver {
    public readonly Key = BROWSER_LOGIN_ACCESS_DRIVER;

    public async Connect(request: AccessRequest): Promise<AccessArtifact> {
        const credentials = LoginCredentials(request, this.Key);
        this.assertNotAborted(request);
        const loginURL = request.Parameters.LoginURL || request.URL;
        await this.AssertAllowed(loginURL);
        return this.WithBrowser(async (browser) => {
            const context = await browser.newContext({
                serviceWorkers: 'block',
                ...(request.Parameters.LoginUserAgent ? { userAgent: request.Parameters.LoginUserAgent } : {}),
            });
            const abort = () => void context.close().catch(() => undefined);
            request.Signal.addEventListener('abort', abort, { once: true });
            try {
                // An abort while the browser was starting fired no listener: check again before the login page loads.
                this.assertNotAborted(request);
                await context.route('**/*', (route) => this.RouteLogin(route, context.request));
                await context.routeWebSocket(/.*/, (socket) => socket.close({ code: 1008, reason: 'WebSockets are not allowed during a login' }));
                const page = await context.newPage();
                await this.SignIn(page, loginURL, credentials, request);
                return await this.artifactOf(context, request);
            } finally {
                request.Signal.removeEventListener('abort', abort);
                await context.close().catch(() => undefined);
            }
        });
    }

    /**
     * One request the login page makes: refused when its address may not be loaded; otherwise fetched here without
     * following redirects (see the file header), so no hop is loaded unchecked.
     */
    protected async RouteLogin(route: Route, requests: APIRequestContext): Promise<void> {
        const sent = route.request();
        const url = sent.url();
        if (/^(data|blob):/.test(url)) {
            return route.continue();
        }
        if (!(await this.allowed(url))) {
            return route.abort('blockedbyclient');
        }
        try {
            let response = await route.fetch({ maxRedirects: 0 });
            // The browser's own Cookie header is for the first address only; the request context adds each hop's.
            let hop = FirstHopRequest(url, sent.method(), sent.postDataBuffer(), sent.headers());
            for (let hops = 0; ; hops++) {
                const next = RedirectTarget(response, hop.URL);
                if (!next) {
                    return await route.fulfill({ response });
                }
                if (hops >= MAX_LOGIN_REDIRECTS || !(await this.allowed(next))) {
                    return await route.abort('blockedbyclient');
                }
                const following = NextHopRequest(hop, response.status(), next);
                if (sent.isNavigationRequest() && !following.Body) {
                    return await route.fulfill({ status: 200, headers: NavigateOnHeaders(response), body: NavigateOnPage(next) });
                }
                // A body still carried (a form's, a script's fetch) holds the credentials: never to another origin.
                if (following.Body && new URL(next).origin !== new URL(hop.URL).origin) {
                    return await route.abort('blockedbyclient');
                }
                hop = following;
                response = await requests.fetch(hop.URL, { method: hop.Method, headers: hop.Headers, ...(hop.Body ? { data: hop.Body } : {}), maxRedirects: 0 });
            }
        } catch {
            return route.abort('failed');
        }
    }

    /** Whether an address may be loaded (checked on every request and every hop). */
    private async allowed(url: string): Promise<boolean> {
        try {
            new URL(url);
        } catch {
            return false;
        }
        return this.AssertAllowed(url).then(() => true, () => false);
    }

    /** Refuse an address the login may not load: any host that resolves to a private or reserved address. */
    protected async AssertAllowed(url: string): Promise<void> {
        await AssertPublicUrl(url);
    }

    /** The browser to log in with: the Headless renderer's shared one. Overridable (a test, another pool). */
    protected WithBrowser<T>(work: (browser: Browser) => Promise<T>): Promise<T> {
        return HeadlessPageRenderer.WithBrowser(work);
    }

    /** Drive the login page: pre-click, user name, continue, password, submit, confirm, then wait for the success sign. */
    protected async SignIn(page: Page, loginURL: string, credentials: { Username: string; Password: string }, request: AccessRequest): Promise<void> {
        const p = request.Parameters;
        const timeout = this.stepTimeout(request);
        await page.goto(loginURL, { waitUntil: 'domcontentloaded', timeout });
        await this.landed(page, timeout);
        if (p.LoginPreClickSelector) {
            await this.clickAndSettle(page, FirstVisible(page, p.LoginPreClickSelector), timeout);
        }
        await FirstVisible(page, p.LoginUsernameSelector || DEFAULT_USERNAME_SELECTOR).fill(credentials.Username, { timeout });
        const passwordSelector = p.LoginPasswordSelector || DEFAULT_PASSWORD_SELECTOR;
        if (p.LoginContinueSelector) {
            await FirstVisible(page, p.LoginContinueSelector).click({ timeout });
            await page.waitForSelector(passwordSelector, { state: 'visible', timeout });
        }
        await FirstVisible(page, passwordSelector).fill(credentials.Password, { timeout });
        await this.clickAndSettle(page, FirstVisible(page, p.LoginSubmitSelector || DEFAULT_SUBMIT_SELECTOR), timeout);
        if (p.LoginConfirmSelector) {
            const confirm = FirstVisible(page, p.LoginConfirmSelector);
            const shown = await confirm.waitFor({ state: 'visible', timeout: OPTIONAL_STEP_TIMEOUT_MS }).then(() => true, () => false);
            if (shown) {
                await this.clickAndSettle(page, confirm, timeout);
            }
        }
        if (p.LoginSuccessSelector) {
            await page.waitForSelector(p.LoginSuccessSelector, { timeout }).catch(() => {
                throw new Error(`${this.Key}: the login did not succeed ('${p.LoginSuccessSelector}' did not appear at ${page.url()})`);
            });
        }
    }

    /**
     * Click, and wait for the navigation it may start (a form post) to land on a real document, past the pages that
     * stand in for its redirects, or for the page to go quiet (a script login).
     */
    private async clickAndSettle(page: Page, target: Locator, timeout: number): Promise<void> {
        const navigated = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: OPTIONAL_STEP_TIMEOUT_MS }).catch(() => null);
        await target.click({ timeout });
        await navigated;
        await this.landed(page, timeout);
        await page.waitForLoadState('networkidle', { timeout: OPTIONAL_STEP_TIMEOUT_MS }).catch(() => undefined);
    }

    /**
     * Wait until the page is a parsed document that is not a stand-in for a redirect ({@link NavigateOnPage}): a
     * stand-in's own load says nothing about where the sign-on ends. Playwright re-runs the check in each new document.
     */
    private async landed(page: Page, timeout: number): Promise<void> {
        await page
            .waitForFunction((marker) => document.readyState !== 'loading' && !document.querySelector(`meta[name="${marker}"]`), REDIRECT_STAND_IN_MARKER, { timeout })
            .catch((error: unknown) => {
                throw new Error(`${this.Key}: the login's redirects did not finish (at ${page.url()}): ${error instanceof Error ? error.message : String(error)}`);
            });
    }

    /**
     * The signed-in context as an artifact: its cookies for the session's origins and (unless turned off) its browser
     * state, cut to those origins: the cookies that go to their hosts and their own `localStorage`. A session needs
     * one or the other: cookies, or (with the browser state kept) `localStorage`.
     */
    private async artifactOf(context: BrowserContext, request: AccessRequest): Promise<AccessArtifact> {
        const state = await context.storageState();
        const origins = SessionOrigins(request);
        const jars = BrowserCookieJars(state.cookies);
        this.assertCookieMarker(jars, origins, request);
        const artifact = SessionArtifact(jars, origins, SessionTtlMs(request));
        const storage = request.Parameters.LoginStorageState?.toLowerCase() === 'false' ? null : SessionStorage(jars, origins, state.origins);
        const hasLocalStorage = storage?.Origins.some((o) => o.LocalStorage.length > 0) ?? false;
        if (!artifact.OriginHeaders && !hasLocalStorage) {
            const what = storage ? 'no cookie and no localStorage' : 'no cookie';
            throw new Error(`${this.Key}: the login set ${what} for ${origins.join(', ') || 'the source'}; check the login settings and the credential`);
        }
        return storage ? { ...artifact, Extensions: { [ACCESS_STORAGE_STATE_EXTENSION]: storage } } : artifact;
    }

    /** `LoginCookieMarker` must be among the cookies that go to the session's origins (an identity provider's does not count). */
    private assertCookieMarker(jars: readonly CookieJar[], origins: readonly string[], request: AccessRequest): void {
        const marker = request.Parameters.LoginCookieMarker;
        if (!marker) {
            return;
        }
        const names = [...new Set(origins.flatMap((origin) => OriginCookies(jars, origin).map((c) => c.key)))];
        if (!names.includes(marker)) {
            throw new Error(`${this.Key}: the login did not succeed (no '${marker}' cookie for ${origins.join(', ')}; got ${names.join(', ') || 'none'})`);
        }
    }

    private assertNotAborted(request: AccessRequest): void {
        if (request.Signal.aborted) {
            throw new Error(`${this.Key}: the login was cancelled before it started`);
        }
    }

    private stepTimeout(request: AccessRequest): number {
        const ms = Number(request.Parameters.LoginTimeoutMs);
        return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_STEP_TIMEOUT_MS;
    }
}

/** The first visible match: responsive sites often draw a desktop and a mobile form sharing selectors. */
function FirstVisible(page: Page, selector: string): Locator {
    return page.locator(selector).filter({ visible: true }).first();
}

/** Where a redirect answer points (absolute), or null when it is not a redirect. */
function RedirectTarget(response: APIResponse, url: string): string | null {
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

/** The headers of the page that stands in for a redirect: HTML, and the redirect's own cookies (one per line). */
function NavigateOnHeaders(redirect: APIResponse): Record<string, string> {
    const cookies = redirect.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
    return { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...(cookies.length > 0 ? { 'set-cookie': cookies.join('\n') } : {}) };
}

/**
 * A page that navigates on to `target` at once: a new navigation, which the route sees and checks. Marked (before its
 * script) so the driver can tell it from the page the sign-on lands on.
 */
function NavigateOnPage(target: string): string {
    const literal = JSON.stringify(target).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><meta name="${REDIRECT_STAND_IN_MARKER}"><script>location.replace(${literal});</script></head><body></body></html>`;
}

/**
 * The browser's cookies in `tough-cookie` jars, so the session's cookies are chosen by the same RFC 6265 rules as a
 * form login's. Two jars: one for host-only cookies and one for domain cookies, since a jar keeps one cookie per
 * domain, path and name, and a browser can hold a host-only `example.com` cookie and a `.example.com` one of the same
 * name (only the second goes to a subdomain).
 */
function BrowserCookieJars(cookies: readonly BrowserCookie[]): CookieJar[] {
    const hostOnly = new CookieJar();
    const domainWide = new CookieJar();
    for (const c of cookies) {
        const isDomain = c.domain.startsWith('.');
        const host = isDomain ? c.domain.slice(1) : c.domain;
        // A host-only cookie names no domain (the jar takes it from the URL, as for a Set-Cookie without one).
        const cookie = new Cookie({
            key: c.name,
            value: c.value,
            ...(isDomain ? { domain: host } : {}),
            path: c.path,
            expires: c.expires > 0 ? new Date(c.expires * 1000) : 'Infinity',
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite.toLowerCase(),
        });
        (isDomain ? domainWide : hostOnly).setCookieSync(cookie, `https://${host}${c.path}`, { ignoreError: true });
    }
    return [hostOnly, domainWide];
}

/**
 * The browser state the artifact keeps: each session origin's own cookies as host-only cookies of its host (so a
 * domain cookie cannot reach a subdomain outside the session, and same-named cookies of different hosts are both kept;
 * of two of one host, path and name the host-only one wins), and the session origins' `localStorage`.
 */
function SessionStorage(jars: readonly CookieJar[], origins: readonly string[], browserOrigins: Awaited<ReturnType<BrowserContext['storageState']>>['origins']): SessionStorageState {
    const cookies = new Map<string, SessionStorageCookie>();
    for (const origin of origins) {
        const host = new URL(origin).hostname;
        for (const c of OriginCookies(jars, origin)) {
            const key = `${host}|${c.path}|${c.key}`;
            if (!cookies.has(key)) {
                cookies.set(key, StorageCookie(c, host));
            }
        }
    }
    return {
        Cookies: [...cookies.values()],
        Origins: browserOrigins
            .filter((o) => origins.includes(o.origin))
            .map((o) => ({ Origin: o.origin, LocalStorage: o.localStorage.map((e) => ({ Name: e.name, Value: e.value })) })),
    };
}

/** A jar's cookie as a host-only cookie of `host`, in the storage state's shape. */
function StorageCookie(c: Cookie, host: string): SessionStorageCookie {
    const sameSite = (c.sameSite ?? '').toLowerCase();
    return {
        Name: c.key,
        Value: c.value,
        Domain: host,
        Path: c.path ?? '/',
        Expires: c.expires instanceof Date ? Math.floor(c.expires.getTime() / 1000) : -1,
        HttpOnly: c.httpOnly,
        Secure: c.secure,
        SameSite: sameSite === 'strict' ? 'Strict' : sameSite === 'none' ? 'None' : 'Lax',
    };
}
