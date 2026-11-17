/**
 * @fileoverview The headless renderer, for real: a local page whose text is written by script.
 *
 * Two local servers on different ports are two origins: the page's own (which the session belongs to) and a
 * script host. The session's header must reach the page and never the script host. Local addresses are
 * refused in production, so this test's renderer allows them; nothing else differs. Skipped where Playwright
 * or its Chromium is not installed.
 */
import { createServer, IncomingHttpHeaders, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HeadlessPageRenderer } from '../HeadlessPageRenderer.js';

class LocalPageRenderer extends HeadlessPageRenderer {
    protected override async AssertAllowed(url: string): Promise<void> {
        if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) {
            throw new Error(`refused ${url}`);
        }
    }
}

const seen: { server: string; path: string; headers: IncomingHttpHeaders }[] = [];
let site: Server;
let scripts: Server;
let siteURL = '';
let scriptURL = '';
let available = true;

function listen(server: Server): Promise<string> {
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
}

beforeAll(async () => {
    scripts = createServer((req, res) => {
        seen.push({ server: 'scripts', path: req.url ?? '', headers: req.headers });
        res.setHeader('content-type', 'application/javascript');
        res.end("document.getElementById('late').textContent = 'Written by a third-party script.';");
    });
    scriptURL = await listen(scripts);
    site = createServer((req, res) => {
        seen.push({ server: 'site', path: req.url ?? '', headers: req.headers });
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
