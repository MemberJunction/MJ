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
import { AccessRequest, SessionStorageStateOf } from '@memberjunction/content-pipeline-base';
import { HeadlessPageRenderer } from '../HeadlessPageRenderer.js';
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
const seen: { path: string; headers: IncomingHttpHeaders }[] = [];

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
        res.writeHead(302, { location: `${siteURL}/sso-done`, 'set-cookie': 'idp=provider-session; Path=/' });
        res.end();
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
        expect(artifact.Headers?.Cookie).toBe('sid=member-session');
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
        expect(artifact.Headers?.Cookie).toBe('sid=sso-session');
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
        expect(artifact.Headers?.Cookie).toBe('sid=member-session');
        expect(seen.some((s) => s.path.startsWith('ws:'))).toBe(false);
    }, 60_000);

    it('needs a user name and a password from the credential', async () => {
        await expect(new LocalBrowserLogin().Connect(loginRequest({}, {}))).rejects.toThrow(/needs a username and a password/);
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

    it('fails a render whose selector never appears', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        await expect(
            new LocalPageRenderer().Render({ URL: `${siteURL}/late`, AccessOrigins: [], Options: { WaitSelector: '#never', WaitSelectorTimeoutMs: 500 }, Signal: new AbortController().signal }),
        ).rejects.toThrow();
    }, 60_000);
});
