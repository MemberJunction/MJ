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
 * The artifact's `Cookie` header serves plain fetches; its `Extensions.StorageState` (cookies and `localStorage`)
 * is restored by the `Headless` renderer into each page it renders, for a site whose session is not cookie-only.
 *
 * Every request the login page makes to a private or reserved address is refused (MJ's SSRF guard, by name), and
 * so is every redirect hop; WebSockets, which Playwright's request routing does not see, are refused outright (as the
 * `Headless` renderer refuses them). Playwright routes only the first request of a redirect, and a redirect answer
 * handed to the browser is followed without the route too, so each request is fetched here without following
 * redirects ({@link BrowserLoginAccessDriver.RouteLogin}):
 * - a page navigation that is redirected is answered with a page that navigates on to the checked target (carrying
 *   the redirect's cookies); that navigation comes through the route again, so every hop of a sign-on is checked.
 *   A navigation whose 307/308 keeps a posted body (the form) is followed in the route only to its own origin: the
 *   browser shows the answer under the first address, and the login's credentials are not re-posted to another
 *   site (as `FormLogin` refuses them), so a hop to another origin fails the login;
 * - any other request (a script's) has its redirects followed in the route, each hop checked, and the browser gets
 *   the last answer.
 *
 * The artifact keeps only what belongs to the session's origins: the cookies that go to their hosts and their
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
    SessionStorageState,
} from '@memberjunction/content-pipeline-base';
import { HeadlessPageRenderer } from './HeadlessPageRenderer.js';
import { Cookie, CookieJar } from 'tough-cookie';
import { CookieSessionArtifact, LoginCredentials, SessionCookies, SessionOrigins, SessionTtlMs } from './LoginSession.js';

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

@RegisterClass(BaseAccessDriver, BROWSER_LOGIN_ACCESS_DRIVER)
export class BrowserLoginAccessDriver extends BaseAccessDriver {
    public readonly Key = BROWSER_LOGIN_ACCESS_DRIVER;

    public async Connect(request: AccessRequest): Promise<AccessArtifact> {
        const credentials = LoginCredentials(request, this.Key);
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
            let target = url;
            let method = sent.method();
            // The browser's own Cookie header is for the first address only; the request context adds each hop's.
            const headers = Object.fromEntries(Object.entries(sent.headers()).filter(([name]) => name.toLowerCase() !== 'cookie'));
            for (let hops = 0; ; hops++) {
                const next = RedirectTarget(response, target);
                if (!next) {
                    return await route.fulfill({ response });
                }
                if (hops >= MAX_LOGIN_REDIRECTS || !(await this.allowed(next))) {
                    return await route.abort('blockedbyclient');
                }
                const status = response.status();
                const keepsMethod = status === 307 || status === 308;
                const body = keepsMethod ? sent.postDataBuffer() : null;
                if (sent.isNavigationRequest()) {
                    if (!body) {
                        return await route.fulfill({ status: 200, headers: NavigateOnHeaders(response), body: NavigateOnPage(next) });
                    }
                    if (new URL(next).origin !== new URL(url).origin) {
                        return await route.abort('blockedbyclient');
                    }
                }
                method = keepsMethod ? method : 'GET';
                target = next;
                response = await requests.fetch(target, { method, headers, ...(body ? { data: body } : {}), maxRedirects: 0 });
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

    /** Click, and wait for the navigation it may start (a form post) or for the page to go quiet (a script login). */
    private async clickAndSettle(page: Page, target: Locator, timeout: number): Promise<void> {
        const navigated = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: OPTIONAL_STEP_TIMEOUT_MS }).catch(() => null);
        await target.click({ timeout });
        await navigated;
        await page.waitForLoadState('networkidle', { timeout: OPTIONAL_STEP_TIMEOUT_MS }).catch(() => undefined);
    }

    /**
     * The signed-in context as an artifact: its cookies for the session's origins and (unless turned off) its browser
     * state, cut to those origins: the cookies that go to their hosts and their own `localStorage`.
     */
    private async artifactOf(context: BrowserContext, request: AccessRequest): Promise<AccessArtifact> {
        const state = await context.storageState();
        const marker = request.Parameters.LoginCookieMarker;
        if (marker && !state.cookies.some((c) => c.name === marker)) {
            throw new Error(`${this.Key}: the login did not succeed (no '${marker}' cookie; got ${state.cookies.map((c) => c.name).join(', ') || 'none'})`);
        }
        // The browser's cookies in a jar, so the session's cookies are chosen by the same RFC 6265 rules as a form login's.
        const jar = new CookieJar();
        for (const c of state.cookies) {
            const domain = c.domain.replace(/^\./, '');
            // A host-only cookie names no domain (the jar takes it from the URL, as for a Set-Cookie without one).
            const cookie = new Cookie({
                key: c.name,
                value: c.value,
                ...(c.domain.startsWith('.') ? { domain } : {}),
                path: c.path,
                expires: c.expires > 0 ? new Date(c.expires * 1000) : 'Infinity',
                secure: c.secure,
                httpOnly: c.httpOnly,
                sameSite: c.sameSite.toLowerCase(),
            });
            jar.setCookieSync(cookie, `https://${domain}${c.path}`, { ignoreError: true });
        }
        const origins = SessionOrigins(request);
        const artifact = CookieSessionArtifact(jar, origins, SessionTtlMs(request), this.Key);
        if (request.Parameters.LoginStorageState?.toLowerCase() === 'false') {
            return artifact;
        }
        const kept = new Set(SessionCookies(jar, origins).map((c) => `${c.domain}|${c.path}|${c.key}`));
        const storage: SessionStorageState = {
            Cookies: state.cookies
                .filter((c) => kept.has(`${c.domain.replace(/^\./, '')}|${c.path}|${c.name}`))
                .map((c) => ({ Name: c.name, Value: c.value, Domain: c.domain, Path: c.path, Expires: c.expires, HttpOnly: c.httpOnly, Secure: c.secure, SameSite: c.sameSite })),
            Origins: state.origins
                .filter((o) => origins.includes(o.origin))
                .map((o) => ({ Origin: o.origin, LocalStorage: o.localStorage.map((e) => ({ Name: e.name, Value: e.value })) })),
        };
        return { ...artifact, Extensions: { [ACCESS_STORAGE_STATE_EXTENSION]: storage } };
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

/** A page that navigates on to `target` at once: a new navigation, which the route sees and checks. */
function NavigateOnPage(target: string): string {
    const literal = JSON.stringify(target).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><script>location.replace(${literal});</script></head><body></body></html>`;
}
