/**
 * @fileoverview The headless renderer, for real: a local page whose text is written by script.
 *
 * Local servers on different ports are different origins: the page's own (which the session belongs to), a
 * script host, and an "internal" server standing in for a private address. The session's header must reach the
 * page and never the script host, and nothing the page does may reach the internal server: not a redirect of
 * the page or of anything it loads, and not a WebSocket. Local addresses are refused in production, so this
 * test's renderer allows them, except the internal server's; nothing else differs. Skipped where Playwright or
 * its Chromium is not installed.
 */
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HeadlessPageRenderer } from '../HeadlessPageRenderer.js';

class LocalPageRenderer extends HeadlessPageRenderer {
    protected override async AssertAllowed(url: string): Promise<void> {
        if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url) || (internalURL && url.startsWith(internalURL))) {
            throw new Error(`refused ${url}`);
        }
    }
}

const seen: { server: string; path: string; headers: IncomingHttpHeaders }[] = [];
let site: Server;
let scripts: Server;
let internal: Server;
let siteURL = '';
let scriptURL = '';
let internalURL = '';
/** Every request and WebSocket upgrade that reached the internal server. */
const reachedInternal: string[] = [];
let available = true;

function listen(server: Server): Promise<string> {
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

beforeAll(async () => {
    internal = createServer((req, res) => {
        reachedInternal.push(`http ${req.url}`);
        res.end('internal secret');
    });
    internal.on('upgrade', (req, socket) => {
        reachedInternal.push(`ws ${req.url}`);
        socket.destroy();
    });
    internalURL = await listen(internal);
    scripts = createServer((req, res) => {
        seen.push({ server: 'scripts', path: req.url ?? '', headers: req.headers });
        res.setHeader('content-type', 'application/javascript');
        res.end("document.getElementById('late').textContent = 'Written by a third-party script.';");
    });
    scriptURL = await listen(scripts);
    site = createServer((req, res) => {
        seen.push({ server: 'site', path: req.url ?? '', headers: req.headers });
        const redirects: Record<string, string> = {
            '/moved': '/page',
            '/to-internal': `${internalURL}/secret-page`,
            '/image-to-internal': `${internalURL}/secret-image`,
            '/script-moved': `${scriptURL}/widget.js`,
        };
        const target = redirects[(req.url ?? '').split('?')[0]];
        if (target) {
            res.statusCode = 302;
            res.setHeader('location', target);
            res.end();
            return;
        }
        if (req.url?.startsWith('/loads-internal')) {
            res.setHeader('content-type', 'text/html');
            res.end(`<html><body><p>Loads things.</p>
                <img src="/image-to-internal">
                <script>try { new WebSocket('${internalURL.replace('http', 'ws')}/socket'); } catch (e) {}</script>
                </body></html>`);
            return;
        }
        if (req.url?.startsWith('/moved-script-page')) {
            res.setHeader('content-type', 'text/html');
            res.end(`<html><body><div id="late"></div><script src="/script-moved"></script></body></html>`);
            return;
        }
        if (req.url?.startsWith('/missing')) {
            res.statusCode = 404;
            res.end('<html><body>gone</body></html>');
            return;
        }
        res.setHeader('content-type', 'text/html');
        res.end(`<html><body><div id="app"></div><div id="late"></div>
            <script>document.getElementById('app').textContent = 'Rendered in the browser.';</script>
            <script src="${scriptURL}/widget.js"></script></body></html>`);
    });
    siteURL = await listen(site);
    try {
        const { chromium } = await import('playwright');
        await (await chromium.launch({ headless: true })).close();
    } catch {
        available = false;
    }
});

afterAll(async () => {
    await HeadlessPageRenderer.Shutdown();
    site?.close();
    scripts?.close();
    internal?.close();
});

describe('the headless renderer', () => {
    it("returns the page as the browser built it, and sends the session only to the session's origin", async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        const result = await new LocalPageRenderer().Render({
            URL: `${siteURL}/page`,
            Access: { Headers: { Authorization: 'Bearer member-session' }, QueryParameters: { key: 'k1' } },
            AccessOrigins: [siteURL],
            Signal: new AbortController().signal,
        });

        expect(result.Status).toBe(200);
        expect(result.Html).toContain('Rendered in the browser.');
        expect(result.Html).toContain('Written by a third-party script.');
        const page = seen.find((s) => s.server === 'site' && s.path.startsWith('/page'));
        expect(page?.path).toBe('/page?key=k1');
        expect(page?.headers.authorization).toBe('Bearer member-session');
        const script = seen.find((s) => s.server === 'scripts');
        expect(script?.headers.authorization).toBeUndefined();
    }, 60_000);

    it('reports the status of a page that is not there', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        const result = await new LocalPageRenderer().Render({ URL: `${siteURL}/missing`, AccessOrigins: [], Signal: new AbortController().signal });
        expect(result.Status).toBe(404);
    }, 60_000);

    it('follows a redirect the page may take, through the same checks', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        const result = await new LocalPageRenderer().Render({ URL: `${siteURL}/moved`, AccessOrigins: [], Signal: new AbortController().signal });
        expect(result.Status).toBe(200);
        expect(result.FinalURL).toBe(`${siteURL}/page`);
        expect(result.Html).toContain('Rendered in the browser.');
    }, 60_000);

    it("follows what the page loads through a redirect, and the session's header does not follow it to another origin", async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        seen.length = 0;
        const result = await new LocalPageRenderer().Render({
            URL: `${siteURL}/moved-script-page`,
            Access: { Headers: { Authorization: 'Bearer member-session' } },
            AccessOrigins: [siteURL],
            Signal: new AbortController().signal,
        });
        expect(result.Html).toContain('Written by a third-party script.');
        expect(seen.find((s) => s.server === 'site' && s.path === '/script-moved')?.headers.authorization).toBe('Bearer member-session');
        const script = seen.find((s) => s.server === 'scripts');
        expect(script).toBeDefined();
        expect(script?.headers.authorization).toBeUndefined();
    }, 60_000);

    it('refuses a page whose address is refused when it has loaded (its name now resolves elsewhere)', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        // Allowed when the route checks it, refused when checked again once the page has loaded.
        class ChangingRenderer extends LocalPageRenderer {
            private checks = 0;
            protected override async AssertAllowed(url: string): Promise<void> {
                await super.AssertAllowed(url);
                if (++this.checks > 2) {
                    throw new Error(`refused ${url} now`);
                }
            }
        }
        await expect(
            new ChangingRenderer().Render({ URL: `${siteURL}/missing`, AccessOrigins: [], Signal: new AbortController().signal }),
        ).rejects.toThrow(/refused .* now/);
    }, 60_000);

    it('never sends the page to a refused address it is redirected to', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        reachedInternal.length = 0;
        await expect(
            new LocalPageRenderer().Render({ URL: `${siteURL}/to-internal`, AccessOrigins: [], Signal: new AbortController().signal }),
        ).rejects.toThrow(`refused ${internalURL}/secret-page`);
        expect(reachedInternal).toEqual([]);
    }, 60_000);

    it('never lets what the page loads reach a refused address, by redirect or WebSocket', async (ctx) => {
        if (!available) {
            ctx.skip();
        }
        reachedInternal.length = 0;
        const result = await new LocalPageRenderer().Render({ URL: `${siteURL}/loads-internal`, AccessOrigins: [], Signal: new AbortController().signal });
        expect(result.Html).toContain('Loads things.');
        expect(reachedInternal).toEqual([]);
    }, 60_000);

    it('refuses a private address in production', async () => {
        await expect(
            new HeadlessPageRenderer().Render({ URL: `${siteURL}/page`, AccessOrigins: [], Signal: new AbortController().signal }),
        ).rejects.toThrow(/private or reserved/);
    });

    it('refuses immediately when Signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort('cancelled');
        await expect(
            new LocalPageRenderer().Render({ URL: `${siteURL}/page`, AccessOrigins: [], Signal: controller.signal }),
        ).rejects.toThrow(/aborted/);
    });
});
