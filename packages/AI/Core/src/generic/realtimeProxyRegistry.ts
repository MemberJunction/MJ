import { BaseSingleton } from '@memberjunction/global';
import type { RealtimeSessionParams } from './baseRealtime';

/**
 * The URL path MJAPI's realtime proxy listens on for websocket upgrades, and that provider drivers
 * embed in the browser-facing `wss://<mjapi-public><REALTIME_PROXY_PATH>?ticket=<id>` URL. Shared here
 * (in Core) so the minting side (driver) and the serving side (MJServer proxy) can never drift.
 */
export const REALTIME_PROXY_PATH = '/realtime-proxy';

/**
 * The URL path MJAPI's realtime **relay** claims for websocket upgrades: `/realtime/relay/<ticket>`, followed by any
 * suffix. The ticket travels in the path because a provider's browser SDK appends its own path to the base URL it is
 * given (Gemini's web SDK adds `/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent`), which would break
 * a query value. Drivers build the URL with {@link BuildRealtimeRelayUrl}; MJServer serves it.
 */
export const REALTIME_RELAY_PATH = '/realtime/relay';

/** How long after the mint a relay session accepts its one fresh connection, in seconds. */
export const REALTIME_RELAY_OPEN_WINDOW_SECONDS = 300;

/** The longest a relay session lives, in seconds; a shorter `MaxSessionSeconds` ends it sooner. */
export const REALTIME_RELAY_SESSION_LIFETIME_SECONDS = 1800;

/** The most connections one relay session accepts: the fresh one plus resumes. */
export const REALTIME_RELAY_MAX_CONNECTIONS = 10;

/**
 * How many of the most recent forwarded resumption handles a relay session remembers. A client resumes with the latest
 * handle it received, or the one before when the latest was in flight as its connection dropped.
 */
const RELAY_HANDLE_MEMORY = 64;

/**
 * The URL path MJAPI's realtime WebRTC SDP broker listens on for offer/answer exchanges.
 */
export const REALTIME_SDP_EXCHANGE_PATH = '/realtime/sdp-exchange';

/**
 * @deprecated Use `REALTIME_SDP_EXCHANGE_PATH`.
 */
export const OPENAI_LIVE_SDP_EXCHANGE_PATH = REALTIME_SDP_EXCHANGE_PATH;

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
    /** The driver class authorizing this ticket (e.g. 'OpenAILiveRealtime'). */
    DriverClass?: string;
    /**
     * Authoritative session configuration minted by the server (e.g. for WebRTC SDP exchanges).
     * Prevents clients from tampering with upstream model, reasoning, or tools.
     */
    SessionConfig?: Record<string, unknown>;
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
    /** The driver class authorizing this ticket (optional). */
    DriverClass?: string;
    /** Authoritative session configuration minted by the server (optional). */
    SessionConfig?: Record<string, unknown>;
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

// ── Relay sessions ──────────────────────────────────────────────────────────────────────────────────

/** What the browser's first relay frame asks for, as {@link IRealtimeRelayPolicy.ReadOpenIntent} reads it. */
export interface RealtimeRelayOpenIntent {
    /**
     * The resumption handle the browser presented, or `null` for a fresh session. A handle opens a connection only when
     * the relay forwarded it to this session earlier ({@link RealtimeProxyRegistry.RecordRelayHandle}).
     */
    ResumeHandle: string | null;
    /** The browser asked for audio only: a downgrade the policy writes into its opening frames. */
    AudioOnly: boolean;
}

/**
 * A policy's verdict on one client frame. `Forward` holds the text to send upstream (the frame as it came, or
 * rewritten). `Drop` holds a short type label (for example `contextUpdate`) that the relay counts and logs, so it must
 * never carry payload content.
 */
export type RealtimeRelayFrameVerdict = { Forward: string } | { Drop: string };

/**
 * The provider half of MJAPI's realtime relay: what the relay needs to know about one provider's wire protocol. The
 * relay (MJServer) owns the transport (sockets, deadlines, pings, the frame cap, close codes) and calls the policy at
 * five points. A policy lives with its provider driver, so MJServer depends on this interface only.
 *
 * Client frames are text: the relay drops binary client frames before the policy sees them, and every frame a policy
 * returns goes upstream as text. Server frames reach {@link ObserveServerFrame} as bytes and go to the browser
 * unchanged.
 */
export interface IRealtimeRelayPolicy {
    /**
     * Headers for the upstream handshake (for example `Authorization: Bearer <token>`). Called on every upstream open,
     * so a short-lived token is fresh for each connection. Never logged and never sent to the browser.
     */
    UpstreamHeaders(): Promise<Record<string, string>>;
    /**
     * Reads the browser's first frame. Returns what it asks for, or `null` when the frame does not open a session (the
     * relay then closes the connection). The first frame itself is never forwarded.
     */
    ReadOpenIntent(firstClientFrame: string): RealtimeRelayOpenIntent | null;
    /** The frames sent upstream before any client frame, for example the setup the server wrote. */
    OpeningFrames(intent: RealtimeRelayOpenIntent): string[];
    /** Decides what happens to each later client frame. */
    FilterClientFrame(frame: string): RealtimeRelayFrameVerdict;
    /**
     * Sees each server frame before the relay forwards it unchanged, and returns the new resumption handle the frame
     * carries, else `null`. Called for every frame (avatar video included), so it should check cheaply before parsing.
     */
    ObserveServerFrame(data: Uint8Array, isBinary: boolean): string | null;
}

/** The parameters for {@link RealtimeProxyRegistry.IssueRelaySession}. Omitted limits take the defaults above. */
export interface RealtimeRelayIssueParams {
    /** The upstream websocket URL. Server side only: never sent to the browser and never logged. */
    UpstreamUrl: string;
    /** The provider's frame policy for this session. */
    Policy: IRealtimeRelayPolicy;
    /** The MJ user the session was minted for (audit). */
    UserID?: string;
    /** The driver class that minted the session (logs). */
    DriverClass?: string;
    /** Seconds after the mint during which the one fresh connection may open ({@link REALTIME_RELAY_OPEN_WINDOW_SECONDS}). */
    OpenWithinSeconds?: number;
    /** The relay's own ceiling on the session's life, in seconds ({@link REALTIME_RELAY_SESSION_LIFETIME_SECONDS}). */
    LifetimeSeconds?: number;
    /**
     * The MJ session cap ({@link RealtimeSessionParams.MaxSessionSeconds}) when one applies: the session ends at
     * whichever of this and `LifetimeSeconds` comes first.
     */
    MaxSessionSeconds?: number;
    /** The most connections the session accepts ({@link REALTIME_RELAY_MAX_CONNECTIONS}). */
    MaxConnections?: number;
}

/** What {@link RealtimeProxyRegistry.FindRelaySession} returns for a session that can still take a connection. */
export interface RealtimeRelaySessionInfo {
    /** The session's frame policy, which reads the connection's first frame. */
    Policy: IRealtimeRelayPolicy;
    /** The driver class that minted the session (logs). */
    DriverClass?: string;
}

/** What {@link RealtimeProxyRegistry.OpenRelaySession} grants one connection. */
export interface RealtimeRelayGrant {
    /** This connection's number within the session: 1 for the fresh one, then one more per resume. */
    ConnectionNumber: number;
    /** The session's connection limit. */
    MaxConnections: number;
    /** `true` for a resume (the browser presented a forwarded handle), `false` for the fresh connection. */
    Resumed: boolean;
    /** The upstream websocket URL. */
    UpstreamUrl: string;
    /** The session's frame policy. */
    Policy: IRealtimeRelayPolicy;
    /** Epoch ms at which the session ends; the relay closes the connection then. */
    ExpiresAtMs: number;
    /** The driver class that minted the session. */
    DriverClass?: string;
    /** The MJ user the session was minted for. */
    UserID?: string;
}

/** Why the registry refused a relay connection (logged by the relay, never sent to the browser). */
export type RealtimeRelayRefusal = 'unknown' | 'expired' | 'connection-cap' | 'fresh-used' | 'fresh-window' | 'unknown-handle';

/** The outcome of {@link RealtimeProxyRegistry.OpenRelaySession}. */
export type RealtimeRelayOpenResult = { Granted: RealtimeRelayGrant } | { Refused: RealtimeRelayRefusal };

/** A relay session's server-side state. */
interface RelaySessionRecord {
    UpstreamUrl: string;
    Policy: IRealtimeRelayPolicy;
    UserID?: string;
    DriverClass?: string;
    /** Epoch ms after which the fresh connection may no longer open. */
    OpenByMs: number;
    /** Epoch ms at which the session ends. */
    ExpiresAtMs: number;
    MaxConnections: number;
    /** Connections granted so far (refused attempts do not count). */
    Connections: number;
    /** The one fresh connection has been granted. */
    FreshOpened: boolean;
    /** Handles the relay forwarded to this session, oldest first, at most {@link RELAY_HANDLE_MEMORY}. */
    Handles: string[];
}

// ── Browser-facing URLs ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the browser-facing URL of a relay session, `<baseWs>/realtime/relay/<id>`, with no trailing slash, so a
 * provider SDK that appends its own path keeps the ticket in the path.
 *
 * @param baseWs The MJAPI websocket origin (`ws(s)://host[:port]`), as {@link ResolveRealtimeProxyBaseWsUrl} returns it.
 * @param id The ticket id from {@link RealtimeProxyRegistry.IssueRelaySession}.
 */
export function BuildRealtimeRelayUrl(baseWs: string, id: string): string {
    return `${trimTrailingSlashes(baseWs)}${REALTIME_RELAY_PATH}/${encodeURIComponent(id)}`;
}

/**
 * Resolves the browser-facing MJAPI websocket origin (`ws(s)://host[:port]`) for proxy and relay URLs. Precedence:
 * `params.Config.proxyBaseUrl` → `MJAPI_PUBLIC_URL` → `GRAPHQL_BASE_URL` + `GRAPHQL_PORT` (defaults `http://localhost`
 * and `4000`), the env vars MJAPI derives its public URL from. Only the origin is kept; callers append
 * {@link REALTIME_PROXY_PATH} or use {@link BuildRealtimeRelayUrl}. {@link ResolveRealtimeProxyBaseHttpUrl} returns
 * the same origin with an `http(s)` scheme.
 */
export function ResolveRealtimeProxyBaseWsUrl(params: Pick<RealtimeSessionParams, 'Config'>): string {
    return HttpOriginToWs(resolveMjapiPublicSource(params));
}

/**
 * Resolves the browser-facing MJAPI origin (`http(s)://host[:port]`) for MJAPI's realtime HTTP routes, such as the
 * WebRTC SDP broker at {@link REALTIME_SDP_EXCHANGE_PATH}. It is the origin {@link ResolveRealtimeProxyBaseWsUrl}
 * returns, from the same source and precedence, with an `http(s)` scheme (`ws` and `wss` sources become `http` and
 * `https`). Only the origin is kept, because MJAPI serves its realtime routes at the server root, not under the
 * GraphQL path that `MJAPI_PUBLIC_URL` may carry. A relative `proxyBaseUrl` (`/`) stays relative, for a page served
 * from MJAPI's own origin.
 */
export function ResolveRealtimeProxyBaseHttpUrl(params: Pick<RealtimeSessionParams, 'Config'>): string {
    return toHttpOrigin(resolveMjapiPublicSource(params));
}

/**
 * The URL MJAPI's browser-facing origin is read from, first match wins: `params.Config.proxyBaseUrl` (non-blank),
 * `MJAPI_PUBLIC_URL`, then `GRAPHQL_BASE_URL` + `GRAPHQL_PORT`. With nothing set this is `http://localhost:4000`.
 * These are the env vars and defaults MJAPI's own configuration reads for `publicUrl`, `baseUrl` and `graphqlPort`
 * (`DEFAULT_SERVER_CONFIG` in `@memberjunction/server`), so the default names the port MJAPI listens on. An empty
 * `GRAPHQL_PORT` counts as unset, as it does there.
 */
function resolveMjapiPublicSource(params: Pick<RealtimeSessionParams, 'Config'>): string {
    const override = params.Config?.['proxyBaseUrl'];
    return (
        (typeof override === 'string' && override.trim().length > 0 ? override.trim() : '') ||
        readProcessEnv('MJAPI_PUBLIC_URL') ||
        `${readProcessEnv('GRAPHQL_BASE_URL') ?? 'http://localhost'}:${readProcessEnv('GRAPHQL_PORT') || '4000'}`
    );
}

/**
 * Converts an http(s) or ws(s) URL (or origin) into an `http(s)://host[:port]` origin, dropping any path. A source that
 * is not an absolute URL (a relative path such as `/mjapi`) keeps its text, without trailing slashes.
 */
function toHttpOrigin(source: string): string {
    try {
        const url = new URL(source);
        const httpScheme = url.protocol === 'https:' || url.protocol === 'wss:' ? 'https' : 'http';
        return `${httpScheme}://${url.host}`;
    } catch {
        // Not a parseable absolute URL: best-effort scheme swap, without trailing slashes.
        return trimTrailingSlashes(source).replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
    }
}

/** Converts an http(s) URL (or origin) into a `ws(s)://host[:port]` origin, dropping any path. */
export function HttpOriginToWs(source: string): string {
    try {
        const url = new URL(source);
        const wsScheme = url.protocol === 'https:' || url.protocol === 'wss:' ? 'wss' : 'ws';
        return `${wsScheme}://${url.host}`;
    } catch {
        // Not a parseable absolute URL: best-effort scheme swap, without trailing slashes.
        const trimmed = trimTrailingSlashes(source);
        if (trimmed.startsWith('wss://') || trimmed.startsWith('ws://')) {
            return trimmed;
        }
        return trimmed.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
    }
}

/** Drops trailing `/` characters (a loop rather than a regex, so long inputs cost linear time). */
function trimTrailingSlashes(value: string): string {
    let end = value.length;
    while (end > 0 && value.charCodeAt(end - 1) === 47 /* '/' */) {
        end--;
    }
    return value.slice(0, end);
}

/** Reads a process env var; `undefined` on runtimes without `process` (browsers). */
function readProcessEnv(name: string): string | undefined {
    if (typeof process === 'undefined' || !process.env) {
        return undefined;
    }
    return process.env[name];
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
 *
 * It also holds **relay sessions** ({@link IssueRelaySession}): one ticket per realtime session that
 * opens one fresh connection, then only resumes that present a handle the relay forwarded to that
 * session. They live in this process's memory too, so a resume must reach the MJAPI instance that
 * issued the session (sticky routing for {@link REALTIME_RELAY_PATH} in multi-instance deployments).
 */
export class RealtimeProxyRegistry extends BaseSingleton<RealtimeProxyRegistry> {
    private readonly _tickets: Map<string, RealtimeProxyTicketEntry> = new Map();
    private readonly _relaySessions: Map<string, RelaySessionRecord> = new Map();

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
            DriverClass: params.DriverClass,
            SessionConfig: params.SessionConfig,
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

    // ── Relay sessions ──────────────────────────────────────────────────────────────────────────────

    /**
     * Issues a relay session and returns its ticket id (for {@link BuildRealtimeRelayUrl}) and the moment it ends. The
     * session opens one fresh connection within `OpenWithinSeconds`, then only resumes that present a handle the relay
     * forwarded to it; it ends at `LifetimeSeconds` or `MaxSessionSeconds`, whichever comes first, and accepts at most
     * `MaxConnections` connections. Nothing is called on the policy here: headers are fetched per upstream open.
     */
    public IssueRelaySession(params: RealtimeRelayIssueParams): RealtimeProxyTicket {
        const now = Date.now();
        this.pruneRelaySessions(now);
        const id = RealtimeProxyRegistry.newTicketId();
        const expiresAtMs = now + RealtimeProxyRegistry.relayLifetimeSeconds(params) * 1000;
        const openWithinSeconds = RealtimeProxyRegistry.relaySeconds(params.OpenWithinSeconds, REALTIME_RELAY_OPEN_WINDOW_SECONDS);
        this._relaySessions.set(id, {
            UpstreamUrl: params.UpstreamUrl,
            Policy: params.Policy,
            UserID: params.UserID,
            DriverClass: params.DriverClass,
            OpenByMs: now + openWithinSeconds * 1000, // the lifetime still ends the session first when it is shorter
            ExpiresAtMs: expiresAtMs,
            MaxConnections: RealtimeProxyRegistry.relayMaxConnections(params.MaxConnections),
            Connections: 0,
            FreshOpened: false,
            Handles: [],
        });
        return { ID: id, ExpiresAt: new Date(expiresAtMs).toISOString() };
    }

    /**
     * Looks up a relay session that can still take a connection, without opening one: the relay calls this at the
     * websocket upgrade and answers 401 on `null`. `null` when the id is unknown, the session has ended or reached its
     * connection limit, or neither a fresh open (unused, within its window) nor a resume (a forwarded handle) is left.
     */
    public FindRelaySession(id: string): RealtimeRelaySessionInfo | null {
        const now = Date.now();
        this.pruneRelaySessions(now);
        const entry = id ? this._relaySessions.get(id) : undefined;
        if (!entry || !RealtimeProxyRegistry.relayCanOpen(entry, now)) {
            return null;
        }
        return { Policy: entry.Policy, DriverClass: entry.DriverClass };
    }

    /**
     * Decides one connection from what its first frame asks for. A fresh intent opens only the session's first
     * connection, within its open window; a resume opens only with a handle the relay forwarded to this session. Either
     * way the session must not have ended or reached its connection limit. A granted connection counts toward the limit;
     * a refused one does not.
     */
    public OpenRelaySession(id: string, intent: RealtimeRelayOpenIntent): RealtimeRelayOpenResult {
        const now = Date.now();
        const entry = id ? this._relaySessions.get(id) : undefined;
        const refusal = entry ? RealtimeProxyRegistry.relayRefusal(entry, intent, now) : 'unknown';
        this.pruneRelaySessions(now);
        if (!entry || refusal) {
            return { Refused: refusal ?? 'unknown' };
        }
        if (intent.ResumeHandle === null) {
            entry.FreshOpened = true;
        }
        entry.Connections += 1;
        return {
            Granted: {
                ConnectionNumber: entry.Connections,
                MaxConnections: entry.MaxConnections,
                Resumed: intent.ResumeHandle !== null,
                UpstreamUrl: entry.UpstreamUrl,
                Policy: entry.Policy,
                ExpiresAtMs: entry.ExpiresAtMs,
                DriverClass: entry.DriverClass,
                UserID: entry.UserID,
            },
        };
    }

    /**
     * Records a resumption handle the relay is forwarding to a session's browser, so a later resume may present it. The
     * relay calls this before the frame that carries the handle goes out. Unknown or ended sessions, empty handles and
     * repeats are ignored; the session keeps its {@link RELAY_HANDLE_MEMORY} most recent handles.
     */
    public RecordRelayHandle(id: string, handle: string): void {
        const entry = id ? this._relaySessions.get(id) : undefined;
        if (!entry || !handle || entry.ExpiresAtMs <= Date.now() || entry.Handles.includes(handle)) {
            return;
        }
        entry.Handles.push(handle);
        if (entry.Handles.length > RELAY_HANDLE_MEMORY) {
            entry.Handles.shift();
        }
    }

    /**
     * Current number of relay sessions that have not ended (ended ones, and those whose fresh connection never opened
     * within its window, are pruned) — for diagnostics and tests.
     */
    public get RelaySessionCount(): number {
        this.pruneRelaySessions(Date.now());
        return this._relaySessions.size;
    }

    /** Why `intent` may not open a connection of `entry` now, or `null` when it may. */
    private static relayRefusal(entry: RelaySessionRecord, intent: RealtimeRelayOpenIntent, now: number): RealtimeRelayRefusal | null {
        if (entry.ExpiresAtMs <= now) {
            return 'expired';
        }
        if (entry.Connections >= entry.MaxConnections) {
            return 'connection-cap';
        }
        if (intent.ResumeHandle === null) {
            if (entry.FreshOpened) {
                return 'fresh-used';
            }
            return now > entry.OpenByMs ? 'fresh-window' : null;
        }
        return entry.Handles.includes(intent.ResumeHandle) ? null : 'unknown-handle';
    }

    /** Whether some intent could still open a connection of `entry` (the upgrade-time check). */
    private static relayCanOpen(entry: RelaySessionRecord, now: number): boolean {
        if (entry.ExpiresAtMs <= now || entry.Connections >= entry.MaxConnections) {
            return false;
        }
        return entry.FreshOpened ? entry.Handles.length > 0 : now <= entry.OpenByMs;
    }

    /** Drops relay sessions that have ended, and those whose fresh connection never opened within its window. */
    private pruneRelaySessions(now: number): void {
        for (const [id, entry] of this._relaySessions) {
            if (entry.ExpiresAtMs <= now || (!entry.FreshOpened && now > entry.OpenByMs)) {
                this._relaySessions.delete(id);
            }
        }
    }

    /** The session's life in seconds: `LifetimeSeconds` (default 30 minutes), or `MaxSessionSeconds` when shorter. */
    private static relayLifetimeSeconds(params: RealtimeRelayIssueParams): number {
        const lifetime = RealtimeProxyRegistry.relaySeconds(params.LifetimeSeconds, REALTIME_RELAY_SESSION_LIFETIME_SECONDS);
        const cap = params.MaxSessionSeconds;
        if (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0) {
            return lifetime; // no MJ session cap
        }
        return Math.min(lifetime, Math.max(1, cap));
    }

    /** A duration in seconds: at least 1 when given, the default when omitted or not a finite number. */
    private static relaySeconds(value: number | undefined, fallback: number): number {
        return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, value) : fallback;
    }

    /** A connection limit: a whole number of at least 1 when given, else {@link REALTIME_RELAY_MAX_CONNECTIONS}. */
    private static relayMaxConnections(value: number | undefined): number {
        return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : REALTIME_RELAY_MAX_CONNECTIONS;
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
