/**
 * @fileoverview Open MCP sessions, keyed by session ID.
 *
 * Streamable HTTP clients rarely send the DELETE that ends a session, so without an idle timeout
 * every session (an `McpServer` plus its tool closures) stays in memory until the process exits.
 * Each session also remembers the exact credential that opened it, so neither a session ID alone
 * nor a different credential of the same user can use it.
 *
 * @module @memberjunction/ai-mcp-server/sessionRegistry
 */

import { NormalizeUUID } from '@memberjunction/global';
import type { MCPSessionContext } from './auth/types.js';

/** The part of a transport the registry needs. */
export interface ClosableTransport {
    // case-violation-ok-legacy-back-compat: mirrors the MCP SDK transport's own close(), which the registry calls
    close(): Promise<void>;
}

/** One open session. */
export interface MCPSessionEntry<T extends ClosableTransport> {
    Transport: T;
    /** The credential that opened the session ({@link SessionCredentialKey}); later requests must present the same one. */
    OwnerKey: string;
    /** Last request time, in the registry clock's milliseconds. */
    LastSeen: number;
}

/**
 * Identifies the credential behind a request: the API key (by hash) or the OAuth identity (issuer
 * and subject, so a refreshed token keeps its session), plus the user. A session's tools were built
 * for the credential that opened it, so no other credential, even the same user's, may use it.
 */
export function SessionCredentialKey(session: Pick<MCPSessionContext, 'user' | 'authMethod' | 'apiKeyHash' | 'oauth'>): string {
    const userID = NormalizeUUID(session.user.ID);
    switch (session.authMethod) {
        case 'apiKey':
            return `apiKey|${userID}|${session.apiKeyHash ?? ''}`;
        case 'oauth':
            return `oauth|${userID}|${session.oauth?.issuer ?? ''}|${session.oauth?.subject ?? ''}`;
        default:
            return `${session.authMethod}|${userID}`;
    }
}

/** Holds open sessions, checks their owner, and closes the ones left idle. */
export class MCPSessionRegistry<T extends ClosableTransport> {
    private readonly sessions = new Map<string, MCPSessionEntry<T>>();
    private closed = false;

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

    /**
     * Records a new session owned by the credential `ownerKey`. After {@link CloseAll} (shutdown),
     * the session is closed at once instead: a request that was mid-start must not leave one behind.
     */
    public Add(sessionId: string, transport: T, ownerKey: string): void {
        if (this.closed) {
            void closeEach([[sessionId, transport]]);
            return;
        }
        this.sessions.set(sessionId, { Transport: transport, OwnerKey: ownerKey, LastSeen: this.now() });
    }

    /**
     * Returns the session if it exists AND belongs to `ownerKey`, marking it active. A session
     * owned by another credential is reported as missing, so its existence is not revealed.
     */
    public GetForOwner(sessionId: string, ownerKey: string): MCPSessionEntry<T> | undefined {
        const entry = this.sessions.get(sessionId);
        if (!entry || entry.OwnerKey !== ownerKey) {
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

    /** Closes and forgets every session, and closes any added afterwards. */
    public async CloseAll(): Promise<void> {
        this.closed = true;
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
