import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, request, Server } from 'http';
import { connect, AddressInfo, Server as NetServer, createServer as createNetServer } from 'net';
import { AllowlistProxy } from '../../lib/network-proxy';
import { NetworkAllowlist } from '../../lib/network-policy';

/**
 * The proxy over real loopback sockets, no browser needed. One HTTP server stands in for an
 * allowed CDN (127.0.0.1) and an outside host (localhost) at once; a raw TCP server stands in for
 * a TURN server. Each records what reached it, so a test can show a refused request never did.
 */
describe('AllowlistProxy', () => {
  let web: Server;
  let webPort: number;
  let turn: NetServer;
  let turnPort: number;
  const webHits: string[] = [];
  let turnConnections = 0;
  let proxy: AllowlistProxy;

  beforeAll(async () => {
    web = createServer((req, res) => {
      webHits.push(`${req.method} ${req.headers.host}${req.url}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
    });
    await new Promise<void>(resolve => web.listen(0, '127.0.0.1', resolve));
    webPort = (web.address() as AddressInfo).port;
    turn = createNetServer(socket => {
      turnConnections++;
      socket.end('pong');
    });
    await new Promise<void>(resolve => turn.listen(0, '127.0.0.1', resolve));
    turnPort = (turn.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => web.close(() => resolve()));
    await new Promise<void>(resolve => turn.close(() => resolve()));
  });

  beforeEach(async () => {
    webHits.length = 0;
    turnConnections = 0;
    const allowlist = new NetworkAllowlist([`http://127.0.0.1:${webPort}/lib.js`, `https://127.0.0.1:${turnPort}/`]);
    proxy = new AllowlistProxy(url => allowlist.IsAllowed(url));
    await proxy.Start();
  });

  afterEach(async () => {
    await proxy.Stop();
  });

  const proxyPort = () => Number(new URL(proxy.Server).port);

  /** A plain-HTTP request through the proxy, in absolute form, as a browser sends it. */
  function viaProxy(url: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: proxyPort(), method: 'GET', path: url, headers: { host: url.startsWith('http') ? new URL(url).host : `127.0.0.1:${webPort}` } }, res => {
        let body = '';
        res.on('data', chunk => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  /** A `CONNECT` through the proxy; resolves with its status line and what came back through it. */
  function connectViaProxy(authority: string): Promise<{ statusLine: string; tunnelled: string }> {
    return new Promise((resolve, reject) => {
      const socket = connect(proxyPort(), '127.0.0.1', () => socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`));
      let received = '';
      socket.on('data', chunk => (received += chunk.toString()));
      socket.on('error', reject);
      socket.on('close', () => {
        const [head, tunnelled = ''] = received.split('\r\n\r\n');
        resolve({ statusLine: head.split('\r\n')[0], tunnelled });
      });
    });
  }

  it('forwards a plain-HTTP request to an allowed origin', async () => {
    const res = await viaProxy(`http://127.0.0.1:${webPort}/lib.js?v=1`);
    expect(res).toEqual({ status: 200, body: 'ok' });
    expect(webHits).toEqual([`GET 127.0.0.1:${webPort}/lib.js?v=1`]);
    expect(proxy.BlockedRequests).toEqual([]);
  });

  it('refuses a plain-HTTP request to another origin, and records it without the query string', async () => {
    const res = await viaProxy(`http://localhost:${webPort}/collect?rows=secret`);
    expect(res.status).toBe(403);
    expect(webHits).toEqual([]);
    expect(proxy.BlockedRequests).toEqual([`http://localhost:${webPort}/collect`]);
  });

  it('tunnels a CONNECT to an allowed host and port', async () => {
    const res = await connectViaProxy(`127.0.0.1:${turnPort}`);
    expect(res.statusLine).toBe('HTTP/1.1 200 Connection Established');
    expect(res.tunnelled).toBe('pong');
    expect(turnConnections).toBe(1);
  });

  it('refuses a CONNECT to a host the allowlist does not allow, as a TURN server would be', async () => {
    const res = await connectViaProxy(`localhost:${turnPort}`);
    expect(res.statusLine).toBe('HTTP/1.1 403 Forbidden');
    expect(turnConnections).toBe(0);
    expect(proxy.BlockedRequests).toEqual([`https://localhost:${turnPort}/`]);
  });

  it('refuses a CONNECT to another port on an allowed host', async () => {
    const res = await connectViaProxy(`127.0.0.1:${webPort}`);
    expect(res.statusLine).toBe('HTTP/1.1 403 Forbidden');
  });

  it('refuses a request that is not in absolute form', async () => {
    const res = await viaProxy('/lib.js');
    expect(res.status).toBe(403);
    expect(webHits).toEqual([]);
  });

  it('throws for its address before it is started', () => {
    expect(() => new AllowlistProxy(() => true).Server).toThrow(/not been started/);
  });
});
