import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * Anything the store can release. Derived from the MCP SDK's `Transport` so it tracks the SDK's
 * own `close()` contract; every SDK transport and `McpServer` fit it.
 */
export type StreamableSessionClosable = Pick<Transport, 'close'>;

/** One Streamable HTTP session: its transport and the per-session `McpServer` connected to it. */
export interface StreamableSession<TTransport extends StreamableSessionClosable = StreamableSessionClosable> {
    Transport: TTransport;
    Server: StreamableSessionClosable;
}

/** Configuration for a {@link StreamableSessionStore}. */
export interface StreamableSessionStoreOptions {
    /**
     * How long a session may go unused before it is closed and removed (ms).
     * Defaults to {@link StreamableSessionStore.DEFAULT_IDLE_TTL_MS}. Pass `0` to disable idle expiry.
     */
    IdleTtlMs?: number;
    /**
     * How often idle sessions are swept (ms).
     * Defaults to {@link StreamableSessionStore.DEFAULT_SWEEP_INTERVAL_MS}. Pass `0` to disable background sweeps.
     */
    SweepIntervalMs?: number;
    /** Receives a failure to close an expired or shut-down session. Defaults to `console.error`. */
    OnCloseError?: (sessionId: string, error: Error) => void;
}

interface TrackedSessionEntry<TTransport extends StreamableSessionClosable> {
    Session: StreamableSession<TTransport>;
    LastActiveAtMs: number;
}

/**
 * Lifecycle store for the MCP server's Streamable HTTP sessions, keyed by `Mcp-Session-Id`.
 *
 * A session is created by an `initialize` POST and normally ends when the client sends an HTTP
 * DELETE (firing `transport.onclose` -> {@link Remove}). Clients that crash, sleep, or lose their
 * network without sending DELETE leave idle sessions behind; {@link PruneIdle} (driven by a periodic
 * `.unref()`'d timer and lazy checks on {@link GetTransport}) closes and removes sessions once they
 * exceed {@link IdleTtlMs} without ever evicting active sessions under an arbitrary count cap.
 */
export class StreamableSessionStore<TTransport extends StreamableSessionClosable = StreamableSessionClosable> {
    public static readonly DEFAULT_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
    public static readonly DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

    private readonly sessions = new Map<string, TrackedSessionEntry<TTransport>>();
    private readonly idleTtlMs: number;
    private readonly sweepIntervalMs: number;
    private readonly onCloseError: (sessionId: string, error: Error) => void;
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor(options: StreamableSessionStoreOptions = {}) {
        this.idleTtlMs = options.IdleTtlMs ?? StreamableSessionStore.DEFAULT_IDLE_TTL_MS;
        this.sweepIntervalMs = options.SweepIntervalMs ?? StreamableSessionStore.DEFAULT_SWEEP_INTERVAL_MS;
        this.onCloseError =
            options.OnCloseError ??
            ((sessionId, error) => console.error(`[StreamableHTTP] Error closing session ${sessionId}:`, error));
    }

    /** Number of sessions currently tracked. */
    public get Size(): number {
        return this.sessions.size;
    }

    /**
     * Returns the transport for a session, or `undefined` when the session is unknown or has idled
     * out. A hit counts as activity and restarts the session's idle clock.
     */
    public GetTransport(sessionId: string): TTransport | undefined {
        const entry = this.sessions.get(sessionId);
        if (!entry) {
            return undefined;
        }
        const now = Date.now();
        if (this.isExpired(entry, now)) {
            this.sessions.delete(sessionId);
            this.closeSession(sessionId, entry.Session);
            return undefined;
        }
        entry.LastActiveAtMs = now;
        return entry.Session.Transport;
    }

    /** Starts tracking a session and ensures the idle sweep timer is running when enabled. */
    public Add(sessionId: string, session: StreamableSession<TTransport>): void {
        this.sessions.set(sessionId, {
            Session: session,
            LastActiveAtMs: Date.now(),
        });
        this.ensureSweepTimer();
    }

    /**
     * Stops tracking a session that has already closed. Wire this to the transport's `onclose`; it
     * does not close anything itself.
     */
    public Remove(sessionId: string): boolean {
        const removed = this.sessions.delete(sessionId);
        if (this.sessions.size === 0 && this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
        return removed;
    }

    /** Closes and drops every session that has been idle past {@link IdleTtlMs}. Returns how many were closed. */
    public PruneIdle(): number {
        if (this.idleTtlMs <= 0) {
            return 0;
        }
        const now = Date.now();
        let closedCount = 0;
        for (const [sessionId, entry] of this.sessions) {
            if (this.isExpired(entry, now)) {
                this.sessions.delete(sessionId);
                this.closeSession(sessionId, entry.Session);
                closedCount++;
            }
        }
        if (this.sessions.size === 0 && this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
        return closedCount;
    }

    /** Closes every tracked session and stops the idle sweep timer. */
    public CloseAll(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
        const entries = Array.from(this.sessions.entries());
        this.sessions.clear();
        for (const [sessionId, entry] of entries) {
            this.closeSession(sessionId, entry.Session);
        }
    }

    private isExpired(entry: TrackedSessionEntry<TTransport>, now: number): boolean {
        return this.idleTtlMs > 0 && now - entry.LastActiveAtMs >= this.idleTtlMs;
    }

    private ensureSweepTimer(): void {
        if (this.sweepTimer || this.sweepIntervalMs <= 0 || this.idleTtlMs <= 0) {
            return;
        }
        this.sweepTimer = setInterval(() => this.PruneIdle(), this.sweepIntervalMs);
        // Never keep the process alive just to sweep sessions.
        this.sweepTimer.unref?.();
    }

    /**
     * Closes a session's server (which closes the transport it is connected to) and then the
     * transport itself, in case the two were never connected. Failures are reported, never thrown.
     */
    private closeSession(sessionId: string, session: StreamableSession<TTransport>): void {
        void this.closeQuietly(sessionId, session.Server).then(() => this.closeQuietly(sessionId, session.Transport));
    }

    private async closeQuietly(sessionId: string, target: StreamableSessionClosable): Promise<void> {
        try {
            await target.close();
        } catch (err) {
            this.onCloseError(sessionId, err instanceof Error ? err : new Error(String(err)));
        }
    }
}

/**
 * Closes the server and transport of a session that was created but never stored — the request
 * failed part-way, or it was not an `initialize` request and so was never given a session ID.
 * Closing the server closes the transport it is connected to; the transport is closed as well in
 * case the failure happened before they were connected. Never throws.
 */
export async function ReleaseUnstoredStreamableSession(
    server: StreamableSessionClosable | null,
    transport: StreamableSessionClosable | null
): Promise<void> {
    for (const target of [server, transport]) {
        if (!target) {
            continue;
        }
        try {
            await target.close();
        } catch (err) {
            console.error('[StreamableHTTP] Error releasing an unstored session:', err);
        }
    }
}
