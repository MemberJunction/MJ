import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { createHash } from 'crypto';
import { BrowserManager } from '../../lib/browser-context';

/**
 * Real-browser test of the page's network allowlist. Skipped by default (needs Playwright
 * browsers installed); enable with:
 *   RUN_BROWSER_INTEGRATION=1 npx vitest run src/__tests__/network-policy/network-guard.integration.test.ts
 *
 * One local server answers on two host names: 127.0.0.1 is allowed and stands in for a library
 * CDN, and localhost is not and stands in for an outside host. The server records every request
 * it receives, so each test can check that a blocked request never left the browser.
 */
const RUN = !!process.env.RUN_BROWSER_INTEGRATION;

describe.skipIf(!RUN)('BrowserManager network allowlist (integration)', () => {
  let server: Server;
  let port: number;
  const received: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      received.push(`${req.headers.host}${req.url}`);
      if (req.url === '/sw.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript' }).end('');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' }).end('<p>ok</p>');
    });
    // Accept WebSocket handshakes, so a socket the guard let through would really open.
    server.on('upgrade', (req, socket) => {
      received.push(`${req.headers.host}${req.url} (websocket)`);
      const accept = createHash('sha1')
        .update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
      );
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const allowedOrigin = () => `http://127.0.0.1:${port}`;
  const outsideOrigin = () => `http://localhost:${port}`;
  const sentToOutside = () => received.filter(r => r.startsWith('localhost'));

  /** A manager that allows only the stand-in CDN, and a page on it. */
  async function guardedPage(): Promise<{ manager: BrowserManager; page: Awaited<ReturnType<BrowserManager['GetPage']>> }> {
    const manager = new BrowserManager({ allowedNetworkHosts: ['127.0.0.1'] });
    await manager.Initialize();
    const page = await manager.GetPage();
    await page.goto(`${allowedOrigin()}/`);
    return { manager, page };
  }

  it('lets the page reach an allowed host', async () => {
    const { manager, page } = await guardedPage();
    try {
      const status = await page.evaluate(async url => (await fetch(url)).status, `${allowedOrigin()}/lib.js`);
      expect(status).toBe(200);
      expect(manager.GetBlockedRequests(page)).toEqual([]);
    } finally {
      await manager.Close();
    }
  }, 60000);

  it('blocks fetch, images and beacons to other hosts and records them without the query string', async () => {
    received.length = 0;
    const { manager, page } = await guardedPage();
    try {
      const fetchFailed = await page.evaluate(async url => {
        try { await fetch(url); return false; } catch { return true; }
      }, `${outsideOrigin()}/collect?rows=secret`);
      await page.evaluate(url => new Promise<void>(resolve => {
        const img = new Image();
        img.onload = img.onerror = () => resolve();
        img.src = url;
      }), `${outsideOrigin()}/pixel.gif?rows=secret`);
      await page.evaluate(url => navigator.sendBeacon(url, 'rows=secret'), `${outsideOrigin()}/beacon`);
      await page.waitForTimeout(300);

      expect(fetchFailed).toBe(true);
      expect(sentToOutside()).toEqual([]);
      const blocked = manager.GetBlockedRequests(page);
      expect(blocked).toContain(`${outsideOrigin()}/collect`);
      expect(blocked).toContain(`${outsideOrigin()}/pixel.gif`);
      expect(blocked.join(' ')).not.toContain('secret');
    } finally {
      await manager.Close();
    }
  }, 60000);

  it('blocks a request made from a dedicated worker', async () => {
    received.length = 0;
    const { manager, page } = await guardedPage();
    try {
      const outcome = await page.evaluate(url => new Promise<string>(resolve => {
        const source = `fetch(${JSON.stringify(url)}).then(() => postMessage('sent'), () => postMessage('failed'));`;
        const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
        worker.onmessage = e => resolve(String(e.data));
        worker.onerror = () => resolve('worker-error');
      }), `${outsideOrigin()}/from-worker?rows=secret`);
      expect(outcome).not.toBe('sent');
      expect(sentToOutside()).toEqual([]);
    } finally {
      await manager.Close();
    }
  }, 60000);

  it('closes every WebSocket, even to an allowed host', async () => {
    received.length = 0;
    const { manager, page } = await guardedPage();
    try {
      const opened = await page.evaluate(url => new Promise<boolean>(resolve => {
        const socket = new WebSocket(url);
        socket.onopen = () => resolve(true);
        socket.onclose = socket.onerror = () => resolve(false);
      }), `ws://127.0.0.1:${port}/socket`);
      expect(opened).toBe(false);
      expect(received.filter(r => r.endsWith('(websocket)'))).toEqual([]);
    } finally {
      await manager.Close();
    }
  }, 60000);

  it('refuses to register a service worker, whose requests would bypass routing', async () => {
    received.length = 0;
    const { manager, page } = await guardedPage();
    try {
      // Playwright's 'block' makes register() resolve to undefined without fetching the script.
      const registered = await page.evaluate(async () => {
        try { return (await navigator.serviceWorker.register('/sw.js')) !== undefined; } catch { return false; }
      });
      expect(registered).toBe(false);
      expect(received.filter(r => r.endsWith('/sw.js'))).toEqual([]);
    } finally {
      await manager.Close();
    }
  }, 60000);

  it("does no filtering in 'unrestricted' mode", async () => {
    received.length = 0;
    const manager = new BrowserManager({ networkAccess: 'unrestricted' });
    await manager.Initialize();
    try {
      const page = await manager.GetPage();
      await page.goto(`${allowedOrigin()}/`);
      const status = await page.evaluate(async url => (await fetch(url)).status, `${outsideOrigin()}/open`);
      expect(status).toBe(200);
      expect(sentToOutside()).toEqual([`localhost:${port}/open`]);
    } finally {
      await manager.Close();
    }
  }, 60000);
});
