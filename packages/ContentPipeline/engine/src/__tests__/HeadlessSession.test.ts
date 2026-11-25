/**
 * @fileoverview A browser login and the renderer's options, for real: a local site with a login form, a page
 * whose content arrives late, and a page that reads its session from cookies and `localStorage`.
 *
 * The `BrowserLogin` driver signs in through the form and hands back the session's cookie (for plain fetches)
 * and the browser's state; the `Headless` renderer restores that state into the page it renders. Local addresses
 * are refused in production, so these subclasses allow them; nothing else differs. Skipped where Playwright or its
 * Chromium is not installed.
 */
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccessHeadersFor, AccessRequest, SessionStorageStateOf } from '@memberjunction/content-pipeline-base';
import type { Browser } from 'playwright';
import { HeadlessPageRenderer, NextHopRequest, RestorableStorageState } from '../HeadlessPageRenderer.js';
import { BrowserLoginAccessDriver } from '../BrowserLoginAccessDriver.js';

const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+\//;

class LocalPageRenderer extends HeadlessPageRenderer {
    protected override async AssertAllowed(url: string): Promise<void> {
        if (!local.test(url)) {
            throw new Error(`refused ${url}`);
        }
    }
}

class LocalBrowserLogin extends BrowserLoginAccessDriver {
    protected override async AssertAllowed(url: string): Promise<void> {
        if (!local.test(url)) {
            throw new Error(`refused ${url}`);
        }
    }
}

/** A login that refuses one more address: the internal page a redirect points at. */
class GuardedBrowserLogin extends LocalBrowserLogin {
    protected override async AssertAllowed(url: string): Promise<void> {
        if (url.includes('/internal')) {
            throw new Error(`refused ${url}`);
        }
        await super.AssertAllowed(url);
    }
}

let site: Server;
let siteURL = '';
/** A second host: the identity provider a single sign-on login passes through. */
let idp: Server;
let idpURL = '';
let available = true;
const seen: { path: string; method?: string; body?: string; headers: IncomingHttpHeaders }[] = [];

const PAGES: Record<string, string> = {
    '/login':
        '<html><body><form method="post" action="/do-login">' +
        '<input type="email" name="email"><button id="next" type="button" onclick="document.getElementById(\'pw\').style.display=\'block\'">Next</button>' +
        '<div id="pw" style="display:none"><input type="password" name="password"><button type="submit">Sign in</button></div>' +
        '</form></body></html>',
    '/login-sso':
        '<html><body><form method="post" action="/do-login-sso">' +
        '<input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button>' +
        '</form></body></html>',
    '/login-307':
        '<html><body><form method="post" action="/do-login-307">' +
        '<input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button>' +
        '</form></body></html>',
    '/login-ws':
        '<html><body><form method="post" action="/do-login">' +
        '<input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button>' +
        '</form><script>new WebSocket(location.origin.replace("http", "ws") + "/sock")</script></body></html>',
    '/internal': '<html><body><input type="email" name="email"><p>internal</p></body></html>',
    '/home': '<html><body><div id="welcome">Welcome</div><script>localStorage.setItem("token", "local-token")</script></body></html>',
    '/session':
        '<html><body><p id="out"></p><script>document.getElementById("out").textContent = "token=" + localStorage.getItem("token")</script></body></html>',
    '/login-script':
        '<html><body><form id="f"><input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button></form>' +
        '<script>document.getElementById("f").addEventListener("submit", async (e) => { e.preventDefault();' +
        ' const body = () => new URLSearchParams(new FormData(e.target));' +
        ' await fetch("/api-auth", { headers: { Authorization: "Bearer page-token" } }).catch(() => null);' +
        ' await fetch("/api-chain", { method: "POST", body: body() }).catch(() => null);' +
        ' await fetch("/api-login-307", { method: "POST", body: body() }).catch(() => null);' +
        ' location.href = "/home"; });</script></body></html>',
    '/login-spa':
        '<html><body><form id="f"><input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button></form>' +
        '<script>document.getElementById("f").addEventListener("submit", (e) => { e.preventDefault(); localStorage.setItem("token", "spa-token");' +
        ' const d = document.createElement("div"); d.id = "welcome"; d.textContent = "Welcome"; document.body.appendChild(d); });</script></body></html>',
    '/login-sso-slow':
        '<html><body><form method="post" action="/do-login-sso-slow">' +
        '<input type="email" name="email"><input type="password" name="password"><button type="submit">Sign in</button>' +
        '</form></body></html>',
    '/page-leak': '<html><body><img src="/img-redirect"><script>fetch("/api-auth", { headers: { Authorization: "Bearer page-token" } })</script></body></html>',
    '/echo-cookie': '<html><body>echo</body></html>',
    '/endless':
        '<html><body><div style="height:3000px">top</div><script>addEventListener("scroll", () => { const d = document.createElement("div"); d.style.height = "3000px"; document.body.appendChild(d); })</script></body></html>',
    '/late':
        '<html><body><p>shell</p><script>setTimeout(() => { const d = document.createElement("div"); d.id = "late"; d.textContent = "Arrived late."; document.body.appendChild(d); }, 400)</script></body></html>',
};

beforeAll(async () => {
    site = createServer((req, res) => {
        seen.push({ path: req.url ?? '', headers: req.headers });
        const path = (req.url ?? '').split('?')[0];
        if (path === '/do-login' && req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
                const fields = new URLSearchParams(body);
                const ok = fields.get('email') === 'member@site.test' && fields.get('password') === 's3cret';
                res.writeHead(302, { location: ok ? '/home' : '/login', ...(ok ? { 'set-cookie': 'sid=member-session; Path=/; HttpOnly' } : {}) });
                res.end();
            });
            return;
        }
        if (path === '/do-login-sso' && req.method === 'POST') {
            req.resume();
            req.on('end', () => {
                res.writeHead(302, { location: `${idpURL}/authorize` });
                res.end();
            });
            return;
        }
        if (path === '/do-login-307' && req.method === 'POST') {
            req.resume();
            req.on('end', () => {
                res.writeHead(307, { location: `${idpURL}/collect` });
                res.end();
            });
            return;
        }
        if (path === '/do-login-sso-slow' && req.method === 'POST') {
            req.resume();
            req.on('end', () => {
                res.writeHead(302, { location: `${idpURL}/authorize-slow` });
                res.end();
            });
            return;
        }
        if (path === '/api-auth' || path === '/img-redirect') {
            res.writeHead(302, { location: `${idpURL}${path === '/api-auth' ? '/whoami' : '/pixel'}` });
            res.end();
            return;
        }
        if (path === '/api-chain' || path === '/api-login-307') {
            req.resume();
            req.on('end', () => {
                res.writeHead(path === '/api-chain' ? 302 : 307, { location: path === '/api-chain' ? '/chain-get' : `${idpURL}/collect` });
                res.end();
            });
            return;
        }
        if (path === '/chain-get') {
            res.writeHead(307, { location: '/chain-end' });
            res.end();
            return;
        }
        if (path === '/chain-end') {
            let body = '';
            req.on('data', (chunk) => (body += chunk));
            req.on('end', () => {
                seen.push({ path: '/chain-end:body', method: req.method, body, headers: req.headers });
                res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'sid=chain-session; Path=/; HttpOnly' });
                res.end('{}');
            });
            return;
        }
        if (path === '/doc.svg') {
            res.setHeader('content-type', 'image/svg+xml');
            res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>');
            return;
        }
        if (path === '/sso-done') {
            res.writeHead(302, { location: '/home', 'set-cookie': 'sid=sso-session; Path=/; HttpOnly' });
            res.end();
            return;
        }
        if (path === '/to-internal') {
            res.writeHead(302, { location: '/internal' });
            res.end();
            return;
        }
        if (path === '/ua') {
            res.setHeader('content-type', 'text/html');
            res.end(`<html><body>ua=${req.headers['user-agent']}</body></html>`);
            return;
        }
        res.setHeader('content-type', 'text/html');
        res.end(PAGES[path] ?? '<html><body>missing</body></html>');
    });
    site.on('upgrade', (req, socket) => {
        seen.push({ path: `ws:${req.url ?? ''}`, headers: req.headers });
        socket.destroy();
    });
    siteURL = await new Promise((resolve) => site.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(site.address() as AddressInfo).port}`)));
    idp = createServer((req, res) => {
        seen.push({ path: `idp:${req.url ?? ''}`, headers: req.headers });
        const path = (req.url ?? '').split('?')[0];
        if (path === '/whoami' || path === '/pixel') {
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.end('ok');
            return;
        }
        if (path === '/bounce') {
            res.writeHead(302, { location: `${siteURL}/echo-cookie` });
            res.end();
            return;
        }
        const answer = () => {
            res.writeHead(302, { location: `${siteURL}/sso-done`, 'set-cookie': 'idp=provider-session; Path=/' });
            res.end();
        };
        // A slow identity provider (slower than the login's wait for the network to go quiet): the login must wait
        // past the redirect's stand-in page for the real one.
        if (path === '/authorize-slow') {
            setTimeout(answer, 6000);
            return;
        }
        answer();
    });
    idpURL = await new Promise((resolve) => idp.listen(0, '127.0.0.1', () => resolve(`http://localhost:${(idp.address() as AddressInfo).port}`)));
    try {
        await HeadlessPageRenderer.WithBrowser(async () => undefined);
    } catch {
        available = false;
    }
}, 60_000);

afterAll(async () => {
    await HeadlessPageRenderer.Shutdown();
    site?.close();
    idp?.close();
});

function loginRequest(parameters: Record<string, string>, secret: Record<string, string> = { username: 'member@site.test', password: 's3cret' }): AccessRequest {
    return {
        ContentSourceID: 'S1',
        URL: siteURL,
        Role: 'Default',
        Secret: secret,
        Parameters: { LoginURL: `${siteURL}/login`, ...parameters },
        ContextUser: {} as never,
        Provider: {} as never,
        Signal: new AbortController().signal,
    };
}

describe('the BrowserLogin access driver', () => {
    it("signs in through a two-step form and hands back the session's cookie and browser state", async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        const artifact = await new LocalBrowserLogin().Connect(
            loginRequest({ LoginContinueSelector: '#next', LoginSuccessSelector: '#welcome', LoginCookieMarker: 'sid' }),
        );
        expect(AccessHeadersFor(artifact, siteURL)?.Cookie).toBe('sid=member-session');
        expect(artifact.Origins).toEqual([siteURL]);
        const state = SessionStorageStateOf(artifact);
        expect(state?.Origins.find((o) => o.Origin === siteURL)?.LocalStorage).toEqual([{ Name: 'token', Value: 'local-token' }]);
    }, 60_000);

    it('fails a refused login, naming what it waited for', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        await expect(
            new LocalBrowserLogin().Connect(
                loginRequest({ LoginContinueSelector: '#next', LoginSuccessSelector: '#welcome', LoginTimeoutMs: '2000' }, { username: 'member@site.test', password: 'wrong' }),
            ),
        ).rejects.toThrow(/'#welcome' did not appear/);
    }, 60_000);

    it('checks every redirect hop: a login page that redirects to a refused address never loads it', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        seen.length = 0;
        await expect(new GuardedBrowserLogin().Connect(loginRequest({ LoginURL: `${siteURL}/to-internal`, LoginTimeoutMs: '2000' }))).rejects.toThrow();
        expect(seen.some((s) => s.path === '/to-internal')).toBe(true);
        expect(seen.some((s) => s.path.includes('/internal') && s.path !== '/to-internal')).toBe(false);
    }, 60_000);

    it("follows a single sign-on hop through another host, and keeps only the session origin's cookies", async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        seen.length = 0;
        const artifact = await new LocalBrowserLogin().Connect(loginRequest({ LoginURL: `${siteURL}/login-sso`, LoginSuccessSelector: '#welcome' }));
        expect(seen.some((s) => s.path === 'idp:/authorize')).toBe(true);
        expect(AccessHeadersFor(artifact, siteURL)?.Cookie).toBe('sid=sso-session');
        const state = SessionStorageStateOf(artifact);
        expect(state?.Cookies.map((c) => c.Name)).toEqual(['sid']);
        expect(state?.Origins.every((o) => o.Origin === siteURL)).toBe(true);
    }, 60_000);

    it('does not re-post the credentials to another site: a posted login redirected (307) to another origin fails', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        seen.length = 0;
        await expect(new LocalBrowserLogin().Connect(loginRequest({ LoginURL: `${siteURL}/login-307`, LoginSuccessSelector: '#welcome', LoginTimeoutMs: '2000' }))).rejects.toThrow();
        expect(seen.some((s) => s.path === '/do-login-307')).toBe(true);
        expect(seen.some((s) => s.path.startsWith('idp:'))).toBe(false);
    }, 60_000);

    it('refuses the login page a WebSocket (request routing does not see one)', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        seen.length = 0;
        const artifact = await new LocalBrowserLogin().Connect(loginRequest({ LoginURL: `${siteURL}/login-ws`, LoginSuccessSelector: '#welcome' }));
        expect(AccessHeadersFor(artifact, siteURL)?.Cookie).toBe('sid=member-session');
        expect(seen.some((s) => s.path.startsWith('ws:'))).toBe(false);
    }, 60_000);

    it('needs a user name and a password from the credential', async () => {
        await expect(new LocalBrowserLogin().Connect(loginRequest({}, {}))).rejects.toThrow(/needs a username and a password/);
    });

    it("sends a script login's requests on as a browser would: no credentials to another origin, no body after a GET", async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        seen.length = 0;
        const artifact = await new LocalBrowserLogin().Connect(loginRequest({ LoginURL: `${siteURL}/login-script`, LoginSuccessSelector: '#welcome' }));
        // A fetch's 307 that would re-post the credentials to another origin is refused, as a form's is.
        expect(seen.some((s) => s.path === 'idp:/collect')).toBe(false);
        // A redirect to another origin drops the page's Authorization.
        const whoami = seen.find((s) => s.path === 'idp:/whoami');
        expect(whoami).toBeDefined();
        expect(whoami?.headers.authorization).toBeUndefined();
        // POST -> 302 -> GET -> 307: the GET stays a GET without the body or its content type.
        expect(seen.find((s) => s.path === '/chain-get')?.headers['content-type']).toBeUndefined();
        expect(seen.find((s) => s.path === '/chain-end:body')).toMatchObject({ method: 'GET', body: '' });
        expect(AccessHeadersFor(artifact, siteURL)?.Cookie).toBe('sid=chain-session');
    }, 60_000);

    it("hands on a login whose session is only in localStorage (a script login that sets no cookie)", async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        const artifact = await new LocalBrowserLogin().Connect(loginRequest({ LoginURL: `${siteURL}/login-spa`, LoginSuccessSelector: '#welcome' }));
        expect(artifact.OriginHeaders).toBeUndefined();
        expect(SessionStorageStateOf(artifact)?.Origins.find((o) => o.Origin === siteURL)?.LocalStorage).toEqual([{ Name: 'token', Value: 'spa-token' }]);
    }, 60_000);

    it("does not count an identity provider's cookie as the LoginCookieMarker", async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        await expect(
            new LocalBrowserLogin().Connect(loginRequest({ LoginURL: `${siteURL}/login-sso`, LoginSuccessSelector: '#welcome', LoginCookieMarker: 'idp' })),
        ).rejects.toThrow(/no 'idp' cookie/);
    }, 60_000);

    it('waits past the pages standing in for a slow sign-on redirect before it reads the session', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        // No success selector: the session is read as soon as the submit has settled.
        const artifact = await new LocalBrowserLogin().Connect(loginRequest({ LoginURL: `${siteURL}/login-sso-slow` }));
        expect(AccessHeadersFor(artifact, siteURL)?.Cookie).toBe('sid=sso-session');
    }, 60_000);

    it('refuses a run that was already cancelled, before it starts a browser', async () => {
        let started = 0;
        class CountingLogin extends LocalBrowserLogin {
            protected override WithBrowser<T>(work: (browser: Browser) => Promise<T>): Promise<T> {
                started++;
                return super.WithBrowser(work);
            }
        }
        const cancelled = new AbortController();
        cancelled.abort();
        await expect(new CountingLogin().Connect({ ...loginRequest({}), Signal: cancelled.signal })).rejects.toThrow(/cancelled/);
        expect(started).toBe(0);
    });
});

/**
 * A login whose browser is a stand-in holding the given cookies: what the artifact keeps of a browser state, without
 * Chromium (a `.example.com` cookie cannot be set on a local test server).
 */
class FixedStateLogin extends BrowserLoginAccessDriver {
    public constructor(private readonly cookies: { name: string; value: string; domain: string }[]) {
        super();
    }
    protected override async AssertAllowed(): Promise<void> {}
    protected override async SignIn(): Promise<void> {}
    protected override WithBrowser<T>(work: (browser: Browser) => Promise<T>): Promise<T> {
        const cookies = this.cookies.map((c) => ({ ...c, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' as const }));
        const context = {
            route: async () => undefined,
            routeWebSocket: async () => undefined,
            newPage: async () => ({}),
            close: async () => undefined,
            request: {},
            storageState: async () => ({ cookies, origins: [] }),
        };
        return work({ newContext: async () => context } as unknown as Browser);
    }
}

describe("what a browser login's artifact keeps of the browser's cookies", () => {
    const parameters = { LoginURL: 'https://sub.example.com/login', SessionOrigins: 'https://sub.example.com, https://b.example.com' };

    it("gives each origin its own cookies; keeps a host-only apex cookie apart from a domain cookie of the same name", async () => {
        const login = new FixedStateLogin([
            { name: 'sid', value: 'domain', domain: '.example.com' },
            { name: 'sid', value: 'apex', domain: 'example.com' },
            { name: 'sid', value: 'b-own', domain: 'b.example.com' },
        ]);
        const artifact = await login.Connect({ ...loginRequest(parameters), URL: 'https://sub.example.com' });
        expect(artifact.Headers).toBeUndefined();
        expect(AccessHeadersFor(artifact, 'https://sub.example.com/x')?.Cookie).toBe('sid=domain');
        expect(AccessHeadersFor(artifact, 'https://b.example.com/x')?.Cookie).toBe('sid=b-own; sid=domain');
        // The browser state: host-only cookies of the session's hosts only; the apex cookie nowhere.
        const cookies = SessionStorageStateOf(artifact)?.Cookies.map((c) => `${c.Domain}:${c.Name}=${c.Value}`);
        expect(cookies?.sort()).toEqual(['b.example.com:sid=b-own', 'sub.example.com:sid=domain']);
    });

    it('checks LoginCookieMarker against the cookies that go to the session, not every cookie the browser holds', async () => {
        const login = new FixedStateLogin([
            { name: 'sid', value: '1', domain: 'sub.example.com' },
            { name: 'auth', value: 'idp', domain: 'idp.test' },
        ]);
        await expect(login.Connect({ ...loginRequest({ ...parameters, LoginCookieMarker: 'auth' }), URL: 'https://sub.example.com' })).rejects.toThrow(/no 'auth' cookie/);
    });
});

describe('restoring a session into a render, and following a redirect', () => {
    const cookie = { Path: '/', Expires: -1, HttpOnly: true, Secure: true, SameSite: 'Lax' as const };

    it('restores only cookies for the access hosts, each host-only, the host-only one first', () => {
        const restored = RestorableStorageState(
            {
                Cookies: [
                    { ...cookie, Name: 'sid', Value: 'domain', Domain: '.example.com' },
                    { ...cookie, Name: 'sid', Value: 'apex', Domain: 'example.com' },
                    { ...cookie, Name: 'pref', Value: 'own', Domain: 'sub.example.com' },
                    { ...cookie, Name: 'pref', Value: 'domain', Domain: '.example.com' },
                ],
                Origins: [
                    { Origin: 'https://sub.example.com', LocalStorage: [{ Name: 't', Value: '1' }] },
                    { Origin: 'https://other.example.com', LocalStorage: [{ Name: 't', Value: '2' }] },
                ],
            },
            ['https://sub.example.com'],
        );
        expect(restored.Cookies.map((c) => `${c.Domain}:${c.Name}=${c.Value}`).sort()).toEqual(['sub.example.com:pref=own', 'sub.example.com:sid=domain']);
        expect(restored.Origins.map((o) => o.Origin)).toEqual(['https://sub.example.com']);
    });

    it('drops credentials on a hop to another origin, and never puts a body back once a redirect made it a GET', () => {
        const first = { URL: 'https://site.test/a', Method: 'POST', Body: Buffer.from('pw=1'), Headers: { Authorization: 'Bearer t', 'Content-Type': 'text/plain', accept: '*/*' } };
        const get = NextHopRequest(first, 302, 'https://site.test/b');
        expect(get).toMatchObject({ Method: 'GET', Body: null, Headers: { Authorization: 'Bearer t', accept: '*/*' } });
        const again = NextHopRequest(get, 307, 'https://cdn.test/c');
        expect(again).toMatchObject({ Method: 'GET', Body: null, Headers: { accept: '*/*' } });
    });
});

describe('the headless renderer with a session and options', () => {
    it("restores the session's browser state into the page, cookies and localStorage, without a second Cookie header", async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        const artifact = await new LocalBrowserLogin().Connect(loginRequest({ LoginContinueSelector: '#next', LoginSuccessSelector: '#welcome' }));
        seen.length = 0;
        const result = await new LocalPageRenderer().Render({ URL: `${siteURL}/session`, Access: artifact, AccessOrigins: [siteURL], Signal: new AbortController().signal });
        expect(result.Html).toContain('token=local-token');
        expect(seen.find((s) => s.path === '/session')?.headers.cookie).toBe('sid=member-session');
    }, 60_000);

    it('waits for a selector, scrolls, and presents the source User-Agent', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        const late = await new LocalPageRenderer().Render({
            URL: `${siteURL}/late`,
            AccessOrigins: [],
            Options: { WaitUntil: 'load', WaitSelector: '#late', ScrollToBottom: true },
            Signal: new AbortController().signal,
        });
        expect(late.Html).toContain('Arrived late.');
        const ua = await new LocalPageRenderer().Render({ URL: `${siteURL}/ua`, AccessOrigins: [], Options: { UserAgent: 'MJ-Render/1' }, Signal: new AbortController().signal });
        expect(ua.Html).toContain('ua=MJ-Render/1');
    }, 60_000);

    it("does not forward the page's cookie or Authorization when what it loads redirects to another origin", async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        seen.length = 0;
        await new LocalPageRenderer().Render({
            URL: `${siteURL}/page-leak`,
            Access: { Origins: [siteURL], Extensions: { StorageState: { Cookies: [{ Name: 'sid', Value: 'restored', Domain: '127.0.0.1', Path: '/', Expires: -1, HttpOnly: true, Secure: false, SameSite: 'Lax' }], Origins: [] } } },
            AccessOrigins: [siteURL],
            Signal: new AbortController().signal,
        });
        expect(seen.find((s) => s.path === '/img-redirect')?.headers.cookie).toBe('sid=restored');
        const pixel = seen.find((s) => s.path === 'idp:/pixel');
        const whoami = seen.find((s) => s.path === 'idp:/whoami');
        expect(pixel && whoami).toBeTruthy();
        expect(pixel?.headers.cookie).toBeUndefined();
        expect(whoami?.headers.authorization).toBeUndefined();
    }, 60_000);

    it('sends the session Cookie header to an access origin the page was redirected onto, when no state was restored', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        seen.length = 0;
        const storage = { Cookies: [{ Name: 'sid', Value: 'restored', Domain: '127.0.0.1', Path: '/', Expires: -1, HttpOnly: true, Secure: false, SameSite: 'Lax' as const }], Origins: [] };
        await new LocalPageRenderer().Render({
            URL: `${idpURL}/bounce`,
            Access: { Origins: [siteURL], OriginHeaders: { [siteURL]: { Cookie: 'sid=header' } }, Extensions: { StorageState: storage } },
            AccessOrigins: [siteURL],
            Signal: new AbortController().signal,
        });
        expect(seen.find((s) => s.path === '/echo-cookie')?.headers.cookie).toBe('sid=header');
    }, 60_000);

    it('keeps a zero WaitSelectorTimeoutMs from waiting forever, and scrolling within the render deadline', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        const started = Date.now();
        await expect(
            new LocalPageRenderer().Render({ URL: `${siteURL}/late`, AccessOrigins: [], TimeoutMs: 2000, Options: { WaitSelector: '#never', WaitSelectorTimeoutMs: 0 }, Signal: new AbortController().signal }),
        ).rejects.toThrow();
        expect(Date.now() - started).toBeLessThan(6000);

        const scrolling = Date.now();
        const endless = await new LocalPageRenderer().Render({
            URL: `${siteURL}/endless`,
            AccessOrigins: [],
            TimeoutMs: 2500,
            Options: { WaitUntil: 'load', ScrollToBottom: true },
            Signal: new AbortController().signal,
        });
        expect(endless.Html).toContain('top');
        expect(Date.now() - scrolling).toBeLessThan(6000);
    }, 60_000);

    it('scrolls a document that has no body (an SVG) without failing', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        const svg = await new LocalPageRenderer().Render({ URL: `${siteURL}/doc.svg`, AccessOrigins: [], Options: { WaitUntil: 'load', ScrollToBottom: true }, Signal: new AbortController().signal });
        expect(svg.Html).toContain('<rect');
    }, 60_000);

    it('fails a render whose selector never appears', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        await expect(
            new LocalPageRenderer().Render({ URL: `${siteURL}/late`, AccessOrigins: [], Options: { WaitSelector: '#never', WaitSelectorTimeoutMs: 500 }, Signal: new AbortController().signal }),
        ).rejects.toThrow();
    }, 60_000);
});
