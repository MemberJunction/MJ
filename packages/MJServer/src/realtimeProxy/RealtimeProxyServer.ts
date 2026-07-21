import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket as WsClient, WebSocketServer, type RawData } from 'ws';
import { BaseSingleton, ShutdownRegistry, type IShutdownable } from '@memberjunction/global';
import { RealtimeProxyRegistry, REALTIME_PROXY_PATH, type RealtimeProxyTicketEntry } from '@memberjunction/ai';

/**
 * MJAPI's realtime websocket **proxy** — the transport half of the self-hosted realtime provider story.
 *
 * A provider driver (e.g. `HuggingFaceRealtime`) mints a one-time ticket into the shared
 * {@link RealtimeProxyRegistry} pointing at an INTERNAL realtime endpoint, and hands the browser a
 * `wss://<mjapi-public>{REALTIME_PROXY_PATH}?ticket=<id>` URL. The browser opens its socket HERE; this
 * proxy consumes the ticket, opens the authenticated upstream leg (injecting any auth server-side), and
 * pumps frames transparently in both directions. The internal endpoint + auth never reach the browser,
 * and the internal box needs no browser-facing ingress — MJAPI stays the single ingress point.
 *
 * Deliberately provider-agnostic: it does no protocol translation (the same-keyed client driver owns the
 * wire vocabulary) and knows nothing about any specific provider — it is a pure authenticated byte tunnel,
 * reusable by any future self-hosted realtime provider that mints a ticket.
 *
 * A {@link BaseSingleton} + {@link IShutdownable}: it tracks live tunnels and closes them on graceful
 * shutdown (drained by MJServer's `ShutdownRegistry` before `httpServer.close()`).
 */
export class RealtimeProxyServer extends BaseSingleton<RealtimeProxyServer> implements IShutdownable {
    public readonly ShutdownName = 'RealtimeProxyServer';

    /** `noServer` so THIS server never binds its own upgrade listener — MJServer routes upgrades to it by path. */
    private readonly wss = new WebSocketServer({ noServer: true });

    /** Live browser↔upstream tunnels, tracked for shutdown teardown. */
    private readonly tunnels = new Set<RealtimeProxyTunnel>();

    private registered = false;

    protected constructor() {
        super();
    }

    /** Process-wide singleton accessor. */
    public static get Instance(): RealtimeProxyServer {
        return super.getInstance<RealtimeProxyServer>();
    }

    /**
     * Routes an HTTP `upgrade` for {@link REALTIME_PROXY_PATH} to the proxy. Returns `true` when it OWNS
     * (handled/rejected) the request, `false` when the path is not the proxy's — so the caller leaves the
     * socket for the GraphQL websocket server's own upgrade listener. NEVER destroys a socket it doesn't own.
     */
    public TryHandleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): boolean {
        const url = RealtimeProxyServer.parseUrl(request.url);
        if (!url || url.pathname !== REALTIME_PROXY_PATH) {
            return false; // not ours — leave it for the GraphQL WS server
        }
        this.ensureRegistered();
        // Optional Origin allowlist (MJ_REALTIME_PROXY_ALLOWED_ORIGINS: comma-separated origins).
        // Unset ⇒ prior behavior (the single-use short-TTL ticket remains the primary guard);
        // set ⇒ a browser page on a foreign origin cannot ride a leaked ticket id.
        if (!RealtimeProxyServer.originAllowed(request.headers?.origin)) {
            RealtimeProxyServer.rejectUpgrade(socket, 403, 'Forbidden');
            return true;
        }
        const ticketId = url.searchParams.get('ticket') ?? '';
        const entry = RealtimeProxyRegistry.Instance.Consume(ticketId);
        if (!entry) {
            RealtimeProxyServer.rejectUpgrade(socket, 401, 'Unauthorized');
            return true;
        }
        this.wss.handleUpgrade(request, socket, head, (browserWs) => this.openTunnel(browserWs, entry));
        return true;
    }

    /**
     * Evaluates the optional Origin allowlist. Comparison is exact on the normalized origin
     * (scheme://host[:port], lowercased, no trailing slash). An upgrade WITHOUT an Origin header
     * (non-browser client, e.g. a native app or test rig) passes — the allowlist targets
     * cross-origin BROWSER pages, which always send the header.
     *
     * @param origin The upgrade request's Origin header, if any.
     * @returns True when allowed (or no allowlist is configured).
     */
    private static originAllowed(origin: string | undefined): boolean {
        const raw = process.env['MJ_REALTIME_PROXY_ALLOWED_ORIGINS'];
        if (!raw || raw.trim().length === 0) {
            return true; // no allowlist configured — prior behavior
        }
        if (!origin) {
            return true; // non-browser upgrade (no Origin header) — tickets remain the guard
        }
        const normalize = (value: string): string => value.trim().toLowerCase().replace(/\/+$/, '');
        const allowed = raw.split(',').map(normalize).filter((v) => v.length > 0);
        return allowed.includes(normalize(origin));
    }

    /** Opens the upstream leg and wires a bidirectional pump between the browser socket and it. */
    private openTunnel(browserWs: WsClient, entry: RealtimeProxyTicketEntry): void {
        const tunnel = new RealtimeProxyTunnel(browserWs, entry, () => this.tunnels.delete(tunnel));
        this.tunnels.add(tunnel);
        tunnel.Start();
    }

    /** Registers for graceful-shutdown draining exactly once (lazily, on first real use). */
    private ensureRegistered(): void {
        if (!this.registered) {
            ShutdownRegistry.Instance.Register(this);
            this.registered = true;
        }
    }

    /** Closes every live tunnel and the proxy server. Idempotent; never throws. */
    public Shutdown(): void {
        for (const tunnel of [...this.tunnels]) {
            tunnel.Close();
        }
        this.tunnels.clear();
        try {
            this.wss.close();
        } catch {
            /* already closing */
        }
    }

    /** Parses `request.url` (a path+query) into a URL, or `null` when absent/unparseable. */
    private static parseUrl(rawUrl: string | undefined): URL | null {
        if (!rawUrl) {
            return null;
        }
        try {
            return new URL(rawUrl, 'http://internal'); // base is only for parsing path+query
        } catch {
            return null;
        }
    }

    /** Writes a minimal HTTP error response and destroys the socket (used for a rejected upgrade). */
    private static rejectUpgrade(socket: Duplex, code: number, reason: string): void {
        try {
            socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
        } catch {
            /* socket already gone */
        }
        socket.destroy();
    }
}

/**
 * One live browser↔upstream tunnel. Buffers browser→upstream frames until the upstream socket is open,
 * then pumps both directions byte-transparently (text and binary alike). Closing either side closes the other.
 */
class RealtimeProxyTunnel {
    /** How long the upstream websocket may take to OPEN before the tunnel is torn down (ms). */
    private static readonly UPSTREAM_OPEN_TIMEOUT_MS = 15_000;
    /**
     * Cap on frames buffered browser→upstream before the upstream opens. A half-connected
     * upstream (TCP accepted, WS handshake never completes) must not let a browser streaming PCM
     * grow an unbounded in-memory array on MJAPI; past the cap the OLDEST frames are dropped
     * (voice frames are perishable — late delivery of stale audio is worthless anyway).
     */
    private static readonly MAX_PENDING_FRAMES = 512;

    private upstream: WsClient | null = null;
    /** Frames the browser sent before the upstream opened; flushed in order once it's ready. */
    private readonly pending: Array<{ data: RawData; isBinary: boolean }> = [];
    private openDeadline: ReturnType<typeof setTimeout> | null = null;
    private droppedPendingFrames = 0;
    private closed = false;

    constructor(
        private readonly browser: WsClient,
        private readonly entry: RealtimeProxyTicketEntry,
        private readonly onClosed: () => void
    ) {}

    /** Opens the upstream socket and wires both legs. */
    public Start(): void {
        const headers = this.entry.UpstreamAuthHeader ? { Authorization: this.entry.UpstreamAuthHeader } : undefined;
        const upstream = new WsClient(this.entry.UpstreamUrl, { headers });
        this.upstream = upstream;

        // Deadline: an upstream that accepts TCP but never completes the WS handshake would
        // otherwise hold the tunnel (and its buffer) open forever.
        this.openDeadline = setTimeout(() => {
            this.openDeadline = null;
            if (!this.closed && upstream.readyState !== WsClient.OPEN) {
                console.warn(`[RealtimeProxy] upstream did not open within ${RealtimeProxyTunnel.UPSTREAM_OPEN_TIMEOUT_MS}ms — closing tunnel`);
                this.Close();
            }
        }, RealtimeProxyTunnel.UPSTREAM_OPEN_TIMEOUT_MS);
        (this.openDeadline as { unref?: () => void }).unref?.();

        upstream.on('open', () => {
            if (this.openDeadline) {
                clearTimeout(this.openDeadline);
                this.openDeadline = null;
            }
            this.flushPending();
        });
        upstream.on('message', (data: RawData, isBinary: boolean) => this.forward(this.browser, data, isBinary));
        upstream.on('close', () => this.Close());
        upstream.on('error', () => this.Close());

        this.browser.on('message', (data: RawData, isBinary: boolean) => this.fromBrowser(data, isBinary));
        this.browser.on('close', () => this.Close());
        this.browser.on('error', () => this.Close());
    }

    /** Browser→upstream: forward immediately when the upstream is open, else queue until it is. */
    private fromBrowser(data: RawData, isBinary: boolean): void {
        if (this.upstream && this.upstream.readyState === WsClient.OPEN) {
            this.forward(this.upstream, data, isBinary);
        } else {
            this.pending.push({ data, isBinary });
            if (this.pending.length > RealtimeProxyTunnel.MAX_PENDING_FRAMES) {
                this.pending.shift(); // drop-oldest: stale voice frames are worthless anyway
                this.droppedPendingFrames++;
                if (this.droppedPendingFrames === 1 || this.droppedPendingFrames % 100 === 0) {
                    console.warn(`[RealtimeProxy] pre-open buffer cap hit — dropped ${this.droppedPendingFrames} oldest frame(s) awaiting upstream open`);
                }
            }
        }
    }

    /** Drains any frames queued before the upstream opened. */
    private flushPending(): void {
        if (!this.upstream) {
            return;
        }
        for (const frame of this.pending) {
            this.forward(this.upstream, frame.data, frame.isBinary);
        }
        this.pending.length = 0;
    }

    /** Sends one frame on a socket, preserving the text/binary distinction; failures close the tunnel. */
    private forward(target: WsClient, data: RawData, isBinary: boolean): void {
        if (target.readyState !== WsClient.OPEN) {
            return;
        }
        try {
            target.send(data, { binary: isBinary });
        } catch {
            this.Close();
        }
    }

    /** Closes both legs and detaches the tunnel from the server. Idempotent. */
    public Close(): void {
        if (this.openDeadline) {
            clearTimeout(this.openDeadline);
            this.openDeadline = null;
        }
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.pending.length = 0;
        for (const sock of [this.browser, this.upstream]) {
            try {
                sock?.close();
            } catch {
                /* already closing */
            }
        }
        this.onClosed();
    }
}
