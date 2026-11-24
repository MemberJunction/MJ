import type { RawData, WebSocket as WsClient } from 'ws';
import type { IRealtimeInProcessUpstream, RealtimeInProcessPeer, RealtimeInProcessUpstreamFactory } from '@memberjunction/ai';

/** The caps on one browser connection whose upstream runs in this process. */
export interface RealtimeInProcessLimits {
    /** The largest browser message accepted, in bytes (a microphone frame is a few KB). The websocket server enforces it (1009). */
    MaxFrameBytes: number;
    /** Bytes the browser may have queued after a send; past this it cannot keep up and the call closes (1013). */
    MaxBrowserBufferedBytes: number;
    /** How often the browser is pinged, in ms. */
    PingIntervalMs: number;
    /** Pings the browser may leave unanswered in a row before it is terminated. */
    MaxMissedPongs: number;
}

/** The limits MJAPI runs in-process upstreams with. */
export const REALTIME_IN_PROCESS_LIMITS: Readonly<RealtimeInProcessLimits> = Object.freeze({
    MaxFrameBytes: 1024 * 1024,
    MaxBrowserBufferedBytes: 16 * 1024 * 1024,
    PingIntervalMs: 20_000,
    MaxMissedPongs: 2,
});

/** Close codes this tunnel sends itself (RFC 6455 §7.4.1). */
const CLOSE_NORMAL = 1000;
const CLOSE_INTERNAL = 1011;
const CLOSE_TRY_AGAIN = 1013;

/** How long a close frame may go unanswered before the socket is dropped, in ms. */
const CLOSE_GRACE_MS = 2_000;

/** The longest close reason a websocket frame carries, in bytes. */
const MAX_CLOSE_REASON_BYTES = 123;

/**
 * One browser connection whose upstream runs inside MJAPI (see {@link IRealtimeInProcessUpstream}).
 *
 * The upstream may hold provider connections that bill for as long as they are open, so this tunnel's main job is to
 * notice every way a browser can go away: a close, an error, silence (pings), or falling behind. Each ends in exactly
 * one {@link IRealtimeInProcessUpstream.Closed}. Logs never carry frames or tickets.
 */
export class RealtimeInProcessTunnel {
    private upstream: IRealtimeInProcessUpstream | null = null;
    private pingTimer: ReturnType<typeof setInterval> | null = null;
    private unansweredPings = 0;
    private closed = false;

    constructor(
        private readonly browser: WsClient,
        private readonly openUpstream: RealtimeInProcessUpstreamFactory,
        private readonly limits: RealtimeInProcessLimits,
        private readonly onClosed: () => void
    ) {}

    /** Listens to the browser, opens the upstream and starts the pings. */
    public Start(): void {
        this.browser.on('message', (data: RawData, isBinary: boolean) => this.fromBrowser(data, isBinary));
        this.browser.on('pong', () => (this.unansweredPings = 0));
        this.browser.on('close', () => this.Close());
        this.browser.on('error', () => this.Close());
        const peer: RealtimeInProcessPeer = {
            Send: (frame) => this.toBrowser(frame),
            Close: (code, reason) => this.Close(code, reason),
        };
        try {
            this.upstream = this.openUpstream(peer);
        } catch (err) {
            this.fail('the upstream could not be opened', err);
            return;
        }
        if (this.closed) {
            // The upstream closed the call while it was being opened: Close ran before there was anything to tell.
            this.tellUpstreamClosed();
            return;
        }
        this.pingTimer = setInterval(() => this.ping(), this.limits.PingIntervalMs);
        this.pingTimer.unref?.();
    }

    /** Closes the browser connection and tells the upstream. Idempotent. */
    public Close(code: number = CLOSE_NORMAL, reason: string = ''): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
        this.closeBrowser(code, reason);
        this.tellUpstreamClosed();
        this.onClosed();
    }

    private fromBrowser(data: RawData, isBinary: boolean): void {
        if (this.closed || isBinary) {
            return; // the protocol is JSON text; a binary frame has no meaning here
        }
        const bytes = Array.isArray(data) ? Buffer.concat(data) : data instanceof ArrayBuffer ? Buffer.from(data) : data;
        try {
            this.upstream?.Receive(bytes.toString('utf8'));
        } catch (err) {
            this.fail('the upstream failed on a frame', err);
        }
    }

    private toBrowser(frame: string): void {
        if (this.closed || this.browser.readyState !== this.browser.OPEN) {
            return;
        }
        this.browser.send(frame);
        if (this.browser.bufferedAmount > this.limits.MaxBrowserBufferedBytes) {
            this.Close(CLOSE_TRY_AGAIN, 'Connection too slow');
        }
    }

    private ping(): void {
        if (this.unansweredPings >= this.limits.MaxMissedPongs) {
            this.browser.terminate();
            this.Close();
            return;
        }
        this.unansweredPings++;
        this.browser.ping();
    }

    /** Sends the close frame, and drops a socket that never answers it (a slow or dead browser). */
    private closeBrowser(code: number, reason: string): void {
        if (this.browser.readyState === this.browser.CLOSED) {
            return;
        }
        try {
            this.browser.close(code, Buffer.from(reason).subarray(0, MAX_CLOSE_REASON_BYTES));
        } catch (err) {
            console.warn(`[RealtimeInProcess] close failed (${errorText(err)}); dropping the socket`);
            this.browser.terminate();
            return;
        }
        const grace = setTimeout(() => this.browser.terminate(), CLOSE_GRACE_MS);
        grace.unref?.();
        this.browser.once('close', () => clearTimeout(grace));
    }

    private tellUpstreamClosed(): void {
        const upstream = this.upstream;
        this.upstream = null;
        try {
            upstream?.Closed();
        } catch (err) {
            console.warn(`[RealtimeInProcess] the upstream failed while closing: ${errorText(err)}`);
        }
    }

    private fail(what: string, err: unknown): void {
        console.warn(`[RealtimeInProcess] ${what}: ${errorText(err)}`);
        this.Close(CLOSE_INTERNAL, 'Realtime upstream failed');
    }
}

function errorText(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
