import { createServer, request as httpRequest, IncomingMessage, Server, ServerResponse } from 'http';
import { connect as netConnect, Socket } from 'net';
import { RedactUrl } from './network-policy';

/**
 * The network-level half of the test page's allowlist: an HTTP proxy on the loopback interface
 * that every context the harness creates sends its traffic through.
 *
 * Request routing only sees what the page's network stack hands it. The browser also makes
 * requests routing never sees: Speculation Rules prefetches, and WebRTC's connections to STUN and
 * TURN servers. The proxy refuses any of them whose origin the allowlist does not allow, so they
 * fail closed even though no route saw them. Plain-HTTP requests arrive in absolute form and are
 * forwarded; HTTPS, WSS and TURN-over-TCP arrive as `CONNECT host:port` and are tunnelled.
 */
export class AllowlistProxy {
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();
  private readonly blocked: string[] = [];

  /** @param isAllowed decides each request, given its URL (a `CONNECT` is checked as `https://host:port/`). */
  constructor(private readonly isAllowed: (url: string) => boolean) {}

  /** The proxy's address for Playwright's `proxy.server`. Throws before {@link Start}. */
  get Server(): string {
    const address = this.server?.address();
    if (!address || typeof address === 'string') {
      throw new Error('AllowlistProxy has not been started');
    }
    return `http://127.0.0.1:${address.port}`;
  }

  /** What the proxy refused, oldest first, as origin + path (query strings dropped). */
  get BlockedRequests(): string[] {
    return [...this.blocked];
  }

  /** Listens on a free loopback port. The server is unref'd, so it never keeps the process alive. */
  async Start(): Promise<void> {
    if (this.server) {
      return;
    }
    const server = createServer((req, res) => this.forward(req, res));
    server.on('connect', (req: IncomingMessage, socket: Socket, head: Buffer) => this.tunnel(req, socket, head));
    server.on('connection', socket => this.track(socket));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    server.unref();
    this.server = server;
  }

  /** Closes the listener and every connection still open through it. */
  async Stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    for (const socket of this.sockets) {
      socket.destroy();
    }
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  }

  /** Forwards an absolute-form plain-HTTP request, or refuses it with 403. */
  private forward(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? '';
    if (!/^http:\/\//i.test(url) || !this.isAllowed(url)) {
      this.refuse(url, () => res.writeHead(403, { 'Content-Type': 'text/plain' }).end('Blocked by test harness network policy'));
      req.resume();
      return;
    }
    const target = new URL(url);
    const headers = { ...req.headers };
    delete headers['proxy-connection'];
    delete headers['proxy-authorization'];
    const upstream = httpRequest(
      { host: target.hostname, port: target.port || 80, method: req.method, path: `${target.pathname}${target.search}`, headers },
      upstreamRes => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      }
    );
    upstream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502);
      }
      res.end();
    });
    req.pipe(upstream);
  }

  /** Opens a `CONNECT` tunnel to an allowed host and port, or refuses it with 403. */
  private tunnel(req: IncomingMessage, client: Socket, head: Buffer): void {
    const authority = req.url ?? '';
    const url = `https://${authority}/`;
    const target = parseAuthority(authority);
    client.on('error', () => client.destroy());
    if (!target || !this.isAllowed(url)) {
      this.refuse(url, () => client.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
      return;
    }
    const upstream = netConnect(target.port, target.host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        upstream.write(head);
      }
      upstream.pipe(client);
      client.pipe(upstream);
    });
    this.track(upstream);
    upstream.on('error', () => client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
  }

  private refuse(url: string, respond: () => void): void {
    this.blocked.push(RedactUrl(url));
    respond();
  }

  private track(socket: Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
  }
}

/** The host and port of a `CONNECT` authority (`host:port`, `[v6]:port`), or null when malformed. */
function parseAuthority(authority: string): { host: string; port: number } | null {
  try {
    const url = new URL(`https://${authority}/`);
    const port = Number(url.port || 443);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    return host && Number.isInteger(port) && port > 0 ? { host, port } : null;
  } catch {
    return null;
  }
}
