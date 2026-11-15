/**
 * @fileoverview Open Streamable HTTP sessions, keyed by `mcp-session-id`.
 *
 * Streamable HTTP clients rarely send the DELETE that ends a session, so without an idle timeout
 * every session (an `McpServer` plus its tool closures) stays in memory until the process exits.
 * Each session also remembers which user opened it, so a session ID alone never grants access.
 *
 * @module @memberjunction/ai-mcp-server/sessionRegistry
 */

import { UUIDsEqual } from '@memberjunction/global';

/** The part of a transport the registry needs. */
export interface ClosableTransport {
    // case-violation-ok-legacy-back-compat: mirrors the MCP SDK transport's own close(), which the registry calls
    close(): Promise<void>;
}

/** One open session. */
export interface MCPSessionEntry<T extends ClosableTransport> {
    Transport: T;
    /** The user who opened the session; later requests must authenticate as the same user. */
    OwnerUserID: string;
    /** Last request time, in the registry clock's milliseconds. */
    LastSeen: number;
}

/** Holds open sessions, checks their owner, and closes the ones left idle. */
export class MCPSessionRegistry<T extends ClosableTransport> {
    private readonly sessions = new Map<string, MCPSessionEntry<T>>();

    /**
     * @param idleTimeoutMs - a session with no request for this long is closed by {@link SweepIdle}
     * @param now - the clock, injectable for tests
     */
    constructor(
        private readonly idleTimeoutMs: number,
        private readonly now: () => number = Date.now
    ) {
        if (!(idleTimeoutMs > 0)) {
            throw new Error(`MCPSessionRegistry idle timeout must be positive, got ${idleTimeoutMs}`);
        }
    }

    /** Open sessions. */
    public get Size(): number {
        return this.sessions.size;
    }

    /** Records a new session owned by `ownerUserID`. */
    public Add(sessionId: string, transport: T, ownerUserID: string): void {
        this.sessions.set(sessionId, { Transport: transport, OwnerUserID: ownerUserID, LastSeen: this.now() });
    }

    /**
     * Returns the session if it exists AND belongs to `userID`, marking it active. A session owned by
     * someone else is reported as missing, so its existence is not revealed.
     */
    public GetForUser(sessionId: string, userID: string): MCPSessionEntry<T> | undefined {
        const entry = this.sessions.get(sessionId);
        if (!entry || !UUIDsEqual(entry.OwnerUserID, userID)) {
            return undefined;
        }
        entry.LastSeen = this.now();
        return entry;
    }

    /** Forgets a session without closing it (call from the transport's own onclose). */
    public Delete(sessionId: string): void {
        this.sessions.delete(sessionId);
    }

    /**
     * Closes and forgets every session idle longer than the timeout. A failed close is logged and
     * the session is still forgotten.
     * @returns how many sessions were closed
     */
    public async SweepIdle(): Promise<number> {
        const cutoff = this.now() - this.idleTimeoutMs;
        const idle = [...this.sessions].filter(([, entry]) => entry.LastSeen < cutoff);
        for (const [id] of idle) {
            this.sessions.delete(id);
        }
        await closeEach(idle.map(([id, entry]) => [id, entry.Transport]));
        return idle.length;
    }

    /** Closes and forgets every session. */
    public async CloseAll(): Promise<void> {
        const all = [...this.sessions].map(([id, entry]): [string, T] => [id, entry.Transport]);
        this.sessions.clear();
        await closeEach(all);
    }
}

/** Closes each transport, logging (not throwing) individual failures so the rest still close. */
async function closeEach(transports: Array<[string, ClosableTransport]>): Promise<void> {
    const results = await Promise.allSettled(transports.map(([, t]) => t.close()));
    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            console.error(`[MCP] Error closing session ${transports[i][0]}:`, r.reason);
        }
    });
}
