import { MJLruCache } from '@memberjunction/global';
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

/** Limits for a {@link StreamableSessionStore}. */
export interface StreamableSessionStoreOptions {
    /** Most sessions kept at once. Defaults to {@link StreamableSessionStore.DEFAULT_MAX_SESSIONS}. */
    MaxSessions?: number;
    /** How long a session may go unused before it is closed. Defaults to {@link StreamableSessionStore.DEFAULT_IDLE_TTL_MS}. */
    IdleTtlMs?: number;
    /** How often idle sessions are swept. Defaults to {@link StreamableSessionStore.DEFAULT_SWEEP_INTERVAL_MS}. */
    SweepIntervalMs?: number;
    /** Receives a failure to close an evicted session. Defaults to `console.error`. */
    OnCloseError?: (sessionId: string, error: unknown) => void;
}

/**
 * Bounded store of the MCP server's Streamable HTTP sessions, keyed by `Mcp-Session-Id`.
 *
 * A session is created by an `initialize` POST and normally ends when the client sends an HTTP
 * DELETE. Clients that crash, sleep, lose their network or simply reconnect never send that DELETE,
 * and each abandoned session keeps a whole `McpServer` — every registered tool and its schemas —
 * alive. A plain `Map` therefore grew for the life of the process, at a rate any authenticated
 * client controls.
 *
 * This store closes and drops a session once it has been idle for {@link IdleTtlMs} (using a session
 * refreshes it), and closes the least recently used session when a new one would exceed
 * {@link MaxSessions}. A client whose session was evicted sees exactly what it sees after a server
 * restart: its session ID is unknown, so it must initialize again.
 */
export class StreamableSessionStore<TTransport extends StreamableSessionClosable = StreamableSessionClosable> {
    public static readonly DEFAULT_MAX_SESSIONS = 1_000;
    public static readonly DEFAULT_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
    public static readonly DEFAULT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

    private readonly sessions: MJLruCache<string, StreamableSession<TTransport>>;
    private readonly sweepIntervalMs: number;
    private readonly onCloseError: (sessionId: string, error: unknown) => void;
    private sweepTimer: ReturnType<typeof setInterval> | null = null;

    constructor(options: StreamableSessionStoreOptions = {}) {
        this.sweepIntervalMs = options.SweepIntervalMs ?? StreamableSessionStore.DEFAULT_SWEEP_INTERVAL_MS;
        this.onCloseError =
            options.OnCloseError ??
            ((sessionId, error) => console.error(`[StreamableHTTP] Error closing session ${sessionId}:`, error));
        this.sessions = new MJLruCache<string, StreamableSession<TTransport>>({
            maxSize: options.MaxSessions ?? StreamableSessionStore.DEFAULT_MAX_SESSIONS,
            ttlMs: options.IdleTtlMs ?? StreamableSessionStore.DEFAULT_IDLE_TTL_MS,
            onEvict: (sessionId, session, reason) => {
                // 'delete' means the session already closed (client DELETE / transport close) or was
                // replaced; every other reason is the store ending a session nobody closed.
                if (reason !== 'delete') {
                    this.closeSession(sessionId, session);
                }
            },
        });
    }

    /** Number of sessions currently held (idle sessions leave on the next sweep or lookup). */
    public get Size(): number {
        return this.sessions.Size;
    }

    /**
     * Returns the transport for a session, or `undefined` when the session is unknown or has idled
     * out. A hit counts as use: it restarts the session's idle clock and makes it most recently used.
     */
    public GetTransport(sessionId: string): TTransport | undefined {
        const session = this.sessions.Get(sessionId);
        if (!session) {
            return undefined;
        }
        // Re-store to restart the idle TTL (a read alone only refreshes recency).
        this.sessions.Delete(sessionId);
        this.sessions.Set(sessionId, session);
        return session.Transport;
    }

    /** Starts tracking a session and makes sure the idle sweep is running. */
    public Add(sessionId: string, session: StreamableSession<TTransport>): void {
        this.sessions.Set(sessionId, session);
        this.ensureSweepTimer();
    }

    /**
     * Stops tracking a session that has already closed. Wire this to the transport's `onclose`; it
     * does not close anything itself.
     */
    public Remove(sessionId: string): boolean {
        return this.sessions.Delete(sessionId);
    }

    /** Closes and drops every session that has been idle past the TTL. Returns how many were closed. */
    public PruneIdle(): number {
        return this.sessions.Prune();
    }

    /** Closes every session and stops the idle sweep. */
    public CloseAll(): void {
        if (this.sweepTimer) {
            clearInterval(this.sweepTimer);
            this.sweepTimer = null;
        }
        this.sessions.Clear();
    }

    private ensureSweepTimer(): void {
        if (this.sweepTimer || this.sweepIntervalMs <= 0) {
            return;
        }
        this.sweepTimer = setInterval(() => this.PruneIdle(), this.sweepIntervalMs);
        // Never keep the process alive just to sweep sessions.
        this.sweepTimer.unref?.();
    }

    /**
     * Closes a session's server (which closes the transport it is connected to) and then the
     * transport itself, in case the two were never connected. Failures are reported, never thrown:
     * eviction runs from a timer and from unrelated requests.
     */
    private closeSession(sessionId: string, session: StreamableSession<TTransport>): void {
        void this.closeQuietly(sessionId, session.Server).then(() => this.closeQuietly(sessionId, session.Transport));
    }

    private async closeQuietly(sessionId: string, target: StreamableSessionClosable): Promise<void> {
        try {
            await target.close();
        } catch (error) {
            this.onCloseError(sessionId, error);
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
        } catch (error) {
            console.error('[StreamableHTTP] Error releasing an unstored session:', error);
        }
    }
}
