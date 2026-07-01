import { BaseSingleton } from '@memberjunction/global';

/**
 * The URL path MJAPI's realtime proxy listens on for websocket upgrades, and that provider drivers
 * embed in the browser-facing `wss://<mjapi-public><REALTIME_PROXY_PATH>?ticket=<id>` URL. Shared here
 * (in Core) so the minting side (driver) and the serving side (MJServer proxy) can never drift.
 */
export const REALTIME_PROXY_PATH = '/realtime-proxy';

/**
 * A short-lived, one-time authorization to open ONE upstream realtime websocket through the
 * MJAPI realtime proxy. Stored server-side only — the upstream URL and (optional) auth header
 * NEVER leave the server; the browser only ever receives the opaque ticket id embedded in the
 * proxy URL it connects to.
 *
 * This is the seam that lets a **self-hosted** realtime provider (e.g. HuggingFace
 * speech-to-speech) participate in the shipped client-direct audio topology WITHOUT exposing
 * the internal endpoint to the browser: the provider driver mints a ticket (via
 * {@link RealtimeProxyRegistry.Issue}) pointing at the internal endpoint, hands the browser a
 * `wss://<mjapi-public>/realtime-proxy?ticket=<id>` URL, and MJAPI's proxy consumes the ticket
 * ({@link RealtimeProxyRegistry.Consume}) to open the authenticated upstream leg and pump frames.
 */
export interface RealtimeProxyTicketEntry {
    /** The internal upstream websocket URL to tunnel to (e.g. `ws://hf-s2s.internal:8000/v1/realtime`). */
    UpstreamUrl: string;
    /**
     * Full `Authorization` header value applied on the UPSTREAM socket only (e.g. `Bearer <key>`).
     * Optional — many self-hosted endpoints are unauthenticated. Never serialized to the browser.
     */
    UpstreamAuthHeader?: string;
    /** The MJ user this ticket was minted for (for audit / optional validation at consume time). */
    UserID?: string;
    /** Epoch-ms after which the ticket is invalid. Enforced on {@link RealtimeProxyRegistry.Consume}. */
    ExpiresAtMs: number;
}

/** The parameters for minting a proxy ticket via {@link RealtimeProxyRegistry.Issue}. */
export interface RealtimeProxyIssueParams {
    /** The internal upstream websocket URL to tunnel to. */
    UpstreamUrl: string;
    /** Full `Authorization` header value for the upstream socket (optional). */
    UpstreamAuthHeader?: string;
    /** The MJ user the ticket is for (optional). */
    UserID?: string;
    /** Time-to-live, in seconds, for the ONE upstream open this ticket authorizes. */
    TTLSeconds: number;
}

/** The result of minting a ticket: the opaque id to embed in the browser proxy URL, plus its expiry. */
export interface RealtimeProxyTicket {
    /** The opaque, single-use ticket id (a UUID) — embedded in the browser-facing proxy URL. */
    ID: string;
    /** ISO-8601 timestamp at which the ticket expires. */
    ExpiresAt: string;
}

/**
 * Process-wide, in-memory registry of one-time realtime-proxy tickets (Global Object Store backed
 * via {@link BaseSingleton}, so the provider driver that mints and the MJAPI proxy that consumes
 * share the SAME instance even under bundler code duplication).
 *
 * Intentionally has **no** background timer: entries are pruned lazily on every {@link Issue} /
 * {@link Consume}, so there is nothing to shut down and no `IShutdownable` wiring is required. Tickets
 * are short-lived and single-use — the map never grows unbounded in practice.
 *
 * Deliberately transport-agnostic: it stores plain data (URL + optional auth + expiry) and knows
 * nothing about websockets or any specific provider. The proxy transport lives in MJServer; the
 * mint logic lives in the provider driver. This is the neutral shared state between them.
 */
export class RealtimeProxyRegistry extends BaseSingleton<RealtimeProxyRegistry> {
    private readonly _tickets: Map<string, RealtimeProxyTicketEntry> = new Map();

    protected constructor() {
        super();
    }

    /** Process-wide singleton accessor. */
    public static get Instance(): RealtimeProxyRegistry {
        return super.getInstance<RealtimeProxyRegistry>();
    }

    /**
     * Mints a single-use ticket authorizing ONE upstream open within its TTL window, and returns the
     * opaque id to embed in the browser-facing proxy URL. Prunes expired tickets as a side effect.
     */
    public Issue(params: RealtimeProxyIssueParams): RealtimeProxyTicket {
        this.pruneExpired();
        const id = RealtimeProxyRegistry.newTicketId();
        const expiresAtMs = Date.now() + Math.max(1, params.TTLSeconds) * 1000;
        this._tickets.set(id, {
            UpstreamUrl: params.UpstreamUrl,
            UpstreamAuthHeader: params.UpstreamAuthHeader,
            UserID: params.UserID,
            ExpiresAtMs: expiresAtMs,
        });
        return { ID: id, ExpiresAt: new Date(expiresAtMs).toISOString() };
    }

    /**
     * Consumes a ticket by id: returns its entry and DELETES it (single-use), or `null` if the id is
     * unknown or expired. Prunes expired tickets as a side effect. The proxy calls this exactly once,
     * during the websocket upgrade, before opening the upstream leg.
     */
    public Consume(id: string): RealtimeProxyTicketEntry | null {
        this.pruneExpired();
        if (!id) {
            return null;
        }
        const entry = this._tickets.get(id);
        if (!entry) {
            return null;
        }
        this._tickets.delete(id); // single-use — always removed on first consume
        if (entry.ExpiresAtMs <= Date.now()) {
            return null; // expired between prune and lookup — treat as invalid
        }
        return entry;
    }

    /** Current number of live (un-consumed, un-expired) tickets — for diagnostics/tests. */
    public get Count(): number {
        this.pruneExpired();
        return this._tickets.size;
    }

    /** Drops every ticket whose window has closed. */
    private pruneExpired(): void {
        const now = Date.now();
        for (const [id, entry] of this._tickets) {
            if (entry.ExpiresAtMs <= now) {
                this._tickets.delete(id);
            }
        }
    }

    /** Generates an opaque ticket id. Uses the platform crypto UUID (Node 16+ / browsers). */
    private static newTicketId(): string {
        const cryptoObj = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
        if (cryptoObj?.randomUUID) {
            return cryptoObj.randomUUID();
        }
        // Fallback: a UUID-shaped random string (only reached on runtimes without crypto.randomUUID).
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.floor(Math.random() * 16);
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
}
