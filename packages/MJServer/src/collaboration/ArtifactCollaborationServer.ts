import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket as WsClient, WebSocketServer, type RawData } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    Base64ToBytes,
    BaseSingleton,
    BytesToBase64,
    EscapeSQLString,
    MJEventType,
    MJGlobal,
    NormalizeUUID,
    ShutdownRegistry,
    UUIDsEqual,
    type IShutdownable
} from '@memberjunction/global';
import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    MJArtifactVersionEntity,
    MJArtifactWorkingStateEntity,
    SlideDeckEngine,
    SpreadsheetEngine,
    type SlideDeckSpec,
    type SlideSpec,
    type SpreadsheetCellSpec,
    type SpreadsheetNamedRangeSpec,
    type WorkbookSpec,
    type WorksheetSpec
} from '@memberjunction/core-entities';
import { ApiRoute } from '../apiRoot.js';
import { configInfo } from '../config.js';
import { getUserPayload } from '../context.js';
import type { DataSourceInfo } from '../types.js';
import { InMemoryYjsRoomRelay, type IYjsRoomRelay, type YjsRelayMessage } from './YjsRoomRelay.js';

/** Canonical WebSocket upgrade path for Yjs artifact collaboration rooms (relative to `MJAPI_BASE_PATH`). */
export const ARTIFACT_COLLABORATION_WS_PATH = '/collaboration/yjs';

/** Optional `MJGlobal` event code for decoupled server-side live artifact mutations. */
export const ARTIFACT_LIVE_MUTATION_EVENT_CODE = 'ArtifactCollaboration.LiveContentMutation';

/** `MJGlobal` event code emitted by `MJArtifactVersionEntityServer.Save()` on every version save. */
export const ARTIFACT_VERSION_SAVED_EVENT_CODE = 'MJ_ARTIFACT_VERSION_SAVED';

/** Top-level `y-protocols` wire frame discriminators. */
export const YJS_MESSAGE_SYNC = 0;
export const YJS_MESSAGE_AWARENESS = 1;
export const YJS_MESSAGE_CONTROL = 2;
export const YJS_MESSAGE_PERMISSION_STATUS = 3;

/** Close codes used by `ArtifactCollaborationServer` for deterministic client handling. */
export const WS_CLOSE_UNAUTHORIZED = 4401;
export const WS_CLOSE_FORBIDDEN = 4403;
export const WS_CLOSE_BAD_REQUEST = 4400;

/** Default TTL (seconds) for single-use WebSocket upgrade tickets. */
export const DEFAULT_COLLABORATION_TICKET_TTL_SECONDS = 60;

/** Hard server-side upper bound (seconds) for single-use WebSocket upgrade tickets (5 minutes). */
export const MAX_COLLABORATION_TICKET_TTL_SECONDS = 300;

/** Default idle room retention window (ms) after the last client disconnects. */
export const DEFAULT_IDLE_ROOM_TTL_MS = 30_000;

/** Default ping/pong heartbeat & periodic permission sweep interval (ms). */
export const DEFAULT_COLLABORATION_HEARTBEAT_MS = 30_000;

const WORKING_STATE_FLUSH_DEBOUNCE_MS = 2500;
const MAX_COLLAB_FRAME_BYTES = 16 * 1024 * 1024; // 16 MB
const MAX_VERSION_SAVE_ATTEMPTS = 3;
const MAX_IDLE_FLUSH_RETRIES = 3;
const COLLABORATION_ALLOWED_ORIGINS_ENV = 'MJ_COLLABORATION_ALLOWED_ORIGINS';
const REALTIME_ALLOWED_ORIGINS_ENV = 'MJ_REALTIME_PROXY_ALLOWED_ORIGINS';
const MAX_LOGGED_ORIGIN_CHARS = 200;

/**
 * Pluggable atomic nonce replay store (e.g., backed by Redis `SET NX PX`) used to enforce
 * single-use WebSocket collaboration tickets across multiple `MJServer` instances (`Blocker 1`).
 */
export interface TicketReplayStore {
    /**
     * Atomically claims `nonce` for `ttlMs` milliseconds.
     * Returns `true` if `nonce` had not been seen before; returns `false` on replay.
     */
    ConsumeNonce(nonce: string, ttlMs: number): Promise<boolean> | boolean;
}

/**
 * Parameters for issuing a single-use WebSocket collaboration upgrade ticket (`A3`).
 */
export interface IssueCollaborationTicketParams {
    ArtifactID: string;
    User: UserInfo;
    ApiKeyHash?: string;
    TTLSeconds?: number;
}

/**
 * Result returned when minting a single-use collaboration ticket.
 */
export interface IssuedCollaborationTicket {
    Ticket: string;
    ExpiresAt: string;
}

interface StoredCollaborationTicket {
    Nonce: string;
    ArtifactID: string;
    User: UserInfo;
    ApiKeyHash?: string;
    IssuedAtMs: number;
    ExpiresAtMs: number;
}

/**
 * Connected client handle inside a {@link CollaborationRoom}.
 */
export interface CollaborationClientConnection {
    /** Underlying `ws` socket. */
    Socket: WsClient;
    /** Authenticated MJ user for this socket. */
    User: UserInfo;
    /** Target `MJ: Artifacts.ID` room. */
    ArtifactID: string;
    /** Whether this connection is currently permitted to push Yjs write updates (`CanEdit`). */
    CanEdit: boolean;
    /** Optional API key hash if this connection was established via a scoped API key. */
    ApiKeyHash?: string;
    /** Set of Yjs awareness client IDs owned by this socket (cleaned up on disconnect). */
    ControlledClientIDs: Set<number>;
    /** Tracks ping/pong liveness across heartbeat sweeps. */
    Alive: boolean;
    /** Whether initial post-REST-save deduplication check has completed for this connection. */
    InitialSyncDedupeChecked?: boolean;
}

/**
 * Active in-memory Yjs room for a single `MJ: Artifacts` record.
 */
export interface CollaborationRoom {
    /** `MJ: Artifacts.ID` represented by this room. */
    ArtifactID: string;
    /** Optional delegating entity ID (`MJ: Artifacts.DelegateEntityID`) if this artifact inherits permissions. */
    DelegateEntityID: string | null;
    /** Optional delegating record ID (`MJ: Artifacts.DelegateRecordID`) if this artifact inherits permissions. */
    DelegateRecordID: string | null;
    /** Shared Yjs CRDT document (`doc.getText('content')` holds the serialized text/JSON payload). */
    Doc: Y.Doc;
    /** Shared Yjs Awareness state for connected cursors, selections, and user presence badges. */
    Awareness: awarenessProtocol.Awareness;
    /** Connected WebSocket clients in this room on this server instance. */
    Connections: Set<CollaborationClientConnection>;
    /** Whether `Doc` has un-flushed binary updates waiting to be written to `MJ: Artifact Working States`. */
    DirtyWorkingState: boolean;
    /** Whether `Doc` has changes not yet compacted into an immutable `MJ: Artifact Versions` row. */
    DirtyVersion: boolean;
    /** Consecutive failed flush/compaction attempts during idle room disposal (capped at `MAX_IDLE_FLUSH_RETRIES`). */
    CompactionRetryCount: number;
    /** User who most recently applied an edit in this room. */
    LastModifiedByUser: UserInfo | null;
    /** Latest `MJ: Artifact Versions.ID` reconciled into this room. */
    BaseVersionID: string | null;
    /** Latest `MJ: Artifact Versions.VersionNumber` reconciled into this room. */
    BaseVersionNumber: number;
    /** Serialized content of the latest `MJ: Artifact Versions` row reconciled into this room. */
    BaseVersionText: string;
    /** Baseline content most recently 3-way merged into this room via `reconcileOutOfBandVersionIntoRoom`. */
    LastReconciledBaselineText?: string | null;
    /** Server-memory-only pre-out-of-band Yjs snapshot for reconnect deduplication (never stored inside `Doc.getMap('meta')`). */
    PreOutOfBandDocState?: Uint8Array | null;
    /** Monotonic lineage token updated whenever an out-of-band version or reset mutates the room. */
    RoomEpoch: string;
    /** Serialized per-room flush promise queue so concurrent `FlushWorkingState` calls never interleave. */
    FlushQueue: Promise<boolean>;
    /** Debounce timer for periodic working-state checkpointing. */
    WorkingStateTimer: ReturnType<typeof setTimeout> | null;
    /** Idle room disposal timer armed when `Connections.size === 0`. */
    IdleDisposeTimer: ReturnType<typeof setTimeout> | null;
    /** Relay unsubscribe function for cross-instance pub/sub. */
    UnsubscribeRelay: (() => void) | null;
    /** Listener bound to `Doc.on('update', ...)` so it can be detached on room disposal. */
    DocUpdateListener: (update: Uint8Array, origin: unknown) => void;
    /** Listener bound to `Awareness.on('update', ...)` so it can be detached on room disposal. */
    AwarenessUpdateListener: (
        changes: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
    ) => void;
}

/**
 * JSON payload sent inside a {@link YJS_MESSAGE_PERMISSION_STATUS} frame (`type = 3`).
 */
export interface CollaborationPermissionStatusFrame {
    canRead: boolean;
    canEdit: boolean;
    reason?: string;
    versionNumber?: number;
    roomEpoch?: string;
}

/**
 * JSON payload sent inside a {@link YJS_MESSAGE_CONTROL} frame (`type = 2`).
 */
export interface CollaborationControlFrame {
    action: 'save-version' | 'version-saved' | 'readonly-rejected' | 'room-reset';
    versionId?: string;
    versionNumber?: number;
    roomEpoch?: string;
    payload?: string;
    message?: string;
}

interface AuthenticatedUpgradeResult {
    User: UserInfo;
    ApiKeyHash?: string;
}

interface WorkingStateProjection {
    ID: string;
    ArtifactID?: string;
    YjsState?: string | Uint8Array | null;
    __mj_UpdatedAt?: Date | string | null;
}

/**
 * Normalizes a `VARBINARY(MAX)` column value returned by `RunView(..., ResultType: 'simple')`
 * (which is a `Buffer`/`Uint8Array` on SQL Server `mssql` and a base64 `string` on GraphQL/mocks)
 * into raw bytes (`Uint8Array`).
 */
export function DecodeWorkingStateBytes(raw: unknown): Uint8Array {
    if (!raw) {
        return new Uint8Array(0);
    }
    if (raw instanceof Uint8Array) {
        return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    }
    if (typeof raw === 'string') {
        return Base64ToBytes(raw);
    }
    return new Uint8Array(0);
}

/**
 * Normalizes a raw `RunView(..., ResultType: 'simple')` row from `MJ: Artifact Working States`
 * so `YjsState` is a base64 `string | null` before hydrating `MJArtifactWorkingStateEntity.LoadFromData(...)`.
 */
function normalizeWorkingStateRowForEntity(row: Record<string, unknown>): Record<string, unknown> {
    const rawYjs = row['YjsState'];
    if (rawYjs instanceof Uint8Array) {
        return {
            ...row,
            YjsState: BytesToBase64(rawYjs)
        };
    }
    return row;
}

interface VersionRowProjection {
    ID: string;
    VersionNumber: number;
    Content?: string | null;
    Configuration?: string | null;
    ContentHash?: string | null;
    __mj_CreatedAt?: Date | string | null;
    __mj_UpdatedAt?: Date | string | null;
}

interface ArtifactDelegateProjection {
    ID: string;
    DelegateEntityID?: string | null;
    DelegateRecordID?: string | null;
}

/**
 * Real-time collaborative editing service for MJ Docs, Slides, Sheets, and inline OLE Artifacts.
 *
 * Implements the standard `y-protocols` binary sync (`0`) and awareness (`1`) wire protocol over
 * WebSockets (`/collaboration/yjs?artifactId=<uuid>&ticket=<nonce>`), augmented with:
 * - Single-use short-TTL upgrade tickets (`MintArtifactCollaborationTicket` -> `?ticket=`) and header-only fallback auth (`A3`),
 * - Origin allowlist validation (`C6`) and API-key scope enforcement (`artifact:read` / `artifact:edit`, `C4`),
 * - Strict read-only frame filtering and authenticated awareness ownership (`C3`),
 * - Live mid-session permission revocation, child-delegate cascade, and fault-tolerant relay (`C2`),
 * - System-user checkpointing to `MJ: Artifact Working States` (`B1`) + retry-safe `MJ: Artifact Versions` compaction (`C5`),
 * - Ping/pong socket heartbeats and idle room disposal (`C1`), and
 * - Cross-instance state-vector catch-up (`sync-request` / `sync-state`) over `IYjsRoomRelay` (`C5`).
 */
export class ArtifactCollaborationServer extends BaseSingleton<ArtifactCollaborationServer> implements IShutdownable {
    public readonly ShutdownName = 'ArtifactCollaborationServer';

    private readonly _wss = new WebSocketServer({
        noServer: true,
        maxPayload: MAX_COLLAB_FRAME_BYTES
    });

    private static readonly MAX_TRACKED_COMPACTED_VECTORS = 512;
    private static readonly MAX_INLINE_RELAY_DOC_UPDATE_BYTES = 262_144;
    private static readonly _compactedStateVectors = new Map<
        string,
        {
            OriginServerID: string;
            SavedStateVectorB64: string;
            VersionID: string;
            ContentHash: string;
        }
    >();

    private readonly _serverInstanceId = `collab-${randomUUID()}`;
    private readonly _rooms = new Map<string, CollaborationRoom>();
    private readonly _roomInitPromises = new Map<string, Promise<CollaborationRoom>>();
    private readonly _tickets = new Map<string, StoredCollaborationTicket>();
    private readonly _consumedTickets = new Map<string, number>();
    private readonly _inFlightCompactionVersionIds = new Set<string>();
    private readonly _pendingSyncWaiters = new Map<string, Set<(synced: boolean) => void>>();
    private readonly _pendingUpgradesByArtifact = new Map<string, number>();
    private _relay: IYjsRoomRelay = new InMemoryYjsRoomRelay();
    private _dataSources: DataSourceInfo[] = [];
    private _providerOverride: IMetadataProvider | null = null;
    private _authOverride: ((req: IncomingMessage) => Promise<UserInfo | null>) | null = null;
    private _ticketHmacSecretOverride: string | null = null;
    private _ticketReplayStore: TicketReplayStore | null = null;
    private _unsubscribePermissionEngine: (() => void) | null = null;
    private _globalMutationSub: { unsubscribe: () => void } | null = null;
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private _idleRoomTtlMs: number = DEFAULT_IDLE_ROOM_TTL_MS;
    private _heartbeatIntervalMs: number = DEFAULT_COLLABORATION_HEARTBEAT_MS;
    private _shutdownRegistered = false;
    private _shuttingDown = false;
    private _startupSecretsChecked = false;

    protected constructor() {
        super();
        this.ensurePermissionListenerRegistered();
        this.ensureGlobalMutationListenerRegistered();
    }

    /** Returns the process-wide singleton instance of {@link ArtifactCollaborationServer}. */
    public static get Instance(): ArtifactCollaborationServer {
        return super.getInstance<ArtifactCollaborationServer>();
    }

    /**
     * Supplies the active MJServer `DataSourceInfo[]` pool list so HTTP-header WebSocket upgrades
     * resolve `getUserPayload` against real database pools, and performs one-time startup validation
     * of required >= 32-byte HMAC secrets (`E1`).
     */
    public SetDataSources(dataSources: DataSourceInfo[]): void {
        this._dataSources = dataSources ?? [];
        if (!this._startupSecretsChecked) {
            this._startupSecretsChecked = true;
            this.CheckStartupSecrets();
        }
    }

    /**
     * Checks `MJ_ARTIFACT_COLLAB_HMAC_SECRET` and `MJ_FROZEN_BLOCK_HMAC_SECRET` at server startup (`E1`).
     * Emits clear startup warnings when either secret is unset or shorter than 32 UTF-8 bytes so operators
     * immediately see why live collaborative editing or frozen-snapshot signing is disabled.
     */
    public CheckStartupSecrets(): {
        CollabSecretConfigured: boolean;
        FrozenBlockSecretConfigured: boolean;
        Warnings: string[];
    } {
        const warnings: string[] = [];
        const collabSecret = this.getTicketHmacSecret();
        const collabSecretConfigured = collabSecret !== null;
        if (!collabSecretConfigured) {
            const msg =
                '[ArtifactCollaborationServer] Startup warning: MJ_ARTIFACT_COLLAB_HMAC_SECRET is unset or shorter than 32 UTF-8 bytes; live collaborative editing is disabled until a >= 32-byte secret is configured.';
            warnings.push(msg);
            LogStatus(msg);
            console.warn(msg);
        }

        const frozenCandidate =
            process.env['MJ_FROZEN_BLOCK_HMAC_SECRET']?.trim() ||
            process.env['MJ_FROZEN_SNAPSHOT_SECRET']?.trim() ||
            '';
        const frozenBlockSecretConfigured = Buffer.byteLength(frozenCandidate, 'utf8') >= 32;
        if (!frozenBlockSecretConfigured) {
            const msg =
                '[ArtifactCollaborationServer] Startup warning: MJ_FROZEN_BLOCK_HMAC_SECRET is unset or shorter than 32 UTF-8 bytes; frozen-snapshot signing is disabled until a >= 32-byte secret is configured.';
            warnings.push(msg);
            LogStatus(msg);
            console.warn(msg);
        }

        return {
            CollabSecretConfigured: collabSecretConfigured,
            FrozenBlockSecretConfigured: frozenBlockSecretConfigured,
            Warnings: warnings
        };
    }

    /**
     * Configures the cross-instance {@link IYjsRoomRelay} (e.g., swapping in {@link RedisYjsRoomRelay}
     * at server boot when Redis pub/sub is enabled).
     */
    public SetRoomRelay(relay: IYjsRoomRelay): void {
        this._relay = relay;
        this.ensurePermissionListenerRegistered();
    }

    /** Returns the currently active {@link IYjsRoomRelay}. */
    public GetRoomRelay(): IYjsRoomRelay {
        return this._relay;
    }

    /**
     * Optional metadata provider override for deterministic integration tests.
     */
    public SetMetadataProviderOverride(provider: IMetadataProvider | null): void {
        this._providerOverride = provider;
    }

    /**
     * Optional authentication resolver override for deterministic integration tests.
     */
    public SetAuthResolverOverride(resolver: ((req: IncomingMessage) => Promise<UserInfo | null>) | null): void {
        this._authOverride = resolver;
    }

    /**
     * Configures an explicit >= 32-byte HMAC secret for signing WebSocket collaboration tickets (`Blocker 1`).
     */
    public SetTicketHmacSecret(secret: string | null): void {
        const trimmed = (secret ?? '').trim();
        this._ticketHmacSecretOverride = trimmed.length > 0 ? trimmed : null;
    }

    /**
     * Configures an atomic distributed nonce replay store (e.g., Redis `SET NX PX`) to enforce
     * single-use WebSocket collaboration tickets across multiple server replicas (`Blocker 1`).
     */
    public SetTicketReplayStore(store: TicketReplayStore | null): void {
        this._ticketReplayStore = store;
    }

    /**
     * Configures the idle room disposal TTL (milliseconds) after the last client disconnects.
     */
    public SetIdleRoomTtlMs(ttlMs: number): void {
        this._idleRoomTtlMs = Math.max(10, ttlMs);
    }

    /**
     * Configures the WebSocket ping/pong heartbeat & permission sweep interval (milliseconds).
     */
    public SetHeartbeatIntervalMs(intervalMs: number): void {
        this._heartbeatIntervalMs = Math.max(50, intervalMs);
        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
            this.ensureHeartbeatStarted();
        }
    }

    /** Returns `true` when an in-memory collaboration room is currently loaded for `artifactId`. */
    public HasActiveRoom(artifactId: string): boolean {
        return this._rooms.has((artifactId ?? '').trim().toLowerCase());
    }

    /** Returns the count of currently loaded in-memory collaboration rooms. */
    public get ActiveRoomCount(): number {
        return this._rooms.size;
    }

    private getTicketHmacSecret(): string | null {
        const candidate =
            this._ticketHmacSecretOverride !== null
                ? this._ticketHmacSecretOverride.trim()
                : process.env['MJ_ARTIFACT_COLLAB_HMAC_SECRET']?.trim() ||
                  process.env['MJ_COLLABORATION_TICKET_SECRET']?.trim() ||
                  '';
        if (Buffer.byteLength(candidate, 'utf8') < 32) {
            return null;
        }
        return candidate;
    }

    /**
     * Mints a cryptographically random, single-use, short-lived ticket (`TTLSeconds = 60` default, capped at 300s)
     * bound to a specific `(ArtifactID, User)` pair so browser WebSockets never pass JWTs or API keys
     * in URL query parameters (`A3`, `Blocker 1`). Requires a dedicated >= 32-byte secret
     * (`MJ_ARTIFACT_COLLAB_HMAC_SECRET` or `MJ_COLLABORATION_TICKET_SECRET`).
     */
    public IssueTicket(params: IssueCollaborationTicketParams): IssuedCollaborationTicket {
        this.ensureShutdownRegistered();
        this.ensurePermissionListenerRegistered();
        this.pruneExpiredTickets();

        const secret = this.getTicketHmacSecret();
        if (!secret) {
            throw new Error(
                'Collaboration ticket signing secret (MJ_ARTIFACT_COLLAB_HMAC_SECRET, >= 32 bytes) must be configured before issuing WebSocket collaboration tickets.'
            );
        }

        const artifactId = (params.ArtifactID ?? '').trim();
        if (!artifactId) {
            throw new Error('IssueTicket requires a non-empty ArtifactID.');
        }
        const ttlSeconds = Math.max(
            1,
            Math.min(
                params.TTLSeconds ?? DEFAULT_COLLABORATION_TICKET_TTL_SECONDS,
                MAX_COLLABORATION_TICKET_TTL_SECONDS
            )
        );
        const issuedAtMs = Date.now();
        const expiresAtMs = issuedAtMs + ttlSeconds * 1000;
        const nonce = randomBytes(18).toString('base64url');
        const payloadJson = JSON.stringify({
            n: nonce,
            a: artifactId,
            u: params.User.ID,
            k: params.ApiKeyHash ?? undefined,
            i: issuedAtMs,
            e: expiresAtMs
        });
        const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
        const sigB64 = createHmac('sha256', secret)
            .update(payloadB64, 'utf8')
            .digest('base64url');
        const ticket = `${payloadB64}.${sigB64}`;

        this._tickets.set(ticket, {
            Nonce: nonce,
            ArtifactID: artifactId,
            User: params.User,
            ApiKeyHash: params.ApiKeyHash,
            IssuedAtMs: issuedAtMs,
            ExpiresAtMs: expiresAtMs
        });

        return {
            Ticket: ticket,
            ExpiresAt: new Date(expiresAtMs).toISOString()
        };
    }

    /**
     * Atomically consumes a single-use collaboration ticket and verifies its HMAC signature,
     * server-capped TTL, and `expectedArtifactId` (`A3`, `Blocker 1`).
     */
    public async ConsumeTicket(
        ticket: string,
        expectedArtifactId: string
    ): Promise<{ User: UserInfo; ApiKeyHash?: string } | null> {
        this.pruneExpiredTickets();
        const secret = this.getTicketHmacSecret();
        if (!secret) {
            return null;
        }
        const normalizedTicket = (ticket ?? '').trim();
        const normalizedArtifactId = (expectedArtifactId ?? '').trim();
        if (!normalizedTicket || !normalizedArtifactId) {
            return null;
        }
        if (this._consumedTickets.has(normalizedTicket)) {
            this._tickets.delete(normalizedTicket);
            return null;
        }

        const dotIdx = normalizedTicket.indexOf('.');
        if (dotIdx <= 0 || dotIdx >= normalizedTicket.length - 1) {
            this._tickets.delete(normalizedTicket);
            return null;
        }
        const payloadB64 = normalizedTicket.slice(0, dotIdx);
        const sigB64 = normalizedTicket.slice(dotIdx + 1);
        const expectedSigB64 = createHmac('sha256', secret)
            .update(payloadB64, 'utf8')
            .digest('base64url');
        const sigBuf = Buffer.from(sigB64, 'utf8');
        const expectedBuf = Buffer.from(expectedSigB64, 'utf8');
        if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
            return null;
        }

        try {
            const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
                n?: string;
                a?: string;
                u?: string;
                k?: string;
                i?: number;
                e?: number;
            };
            if (
                !parsed ||
                typeof parsed.n !== 'string' ||
                parsed.n.length < 16 ||
                typeof parsed.a !== 'string' ||
                typeof parsed.u !== 'string' ||
                typeof parsed.i !== 'number' ||
                typeof parsed.e !== 'number'
            ) {
                return null;
            }
            if (this._consumedTickets.has(parsed.n)) {
                this._tickets.delete(normalizedTicket);
                return null;
            }

            const now = Date.now();
            const maxTtlMs = MAX_COLLABORATION_TICKET_TTL_SECONDS * 1000;
            if (
                !Number.isFinite(parsed.i) ||
                !Number.isFinite(parsed.e) ||
                parsed.e <= now ||
                parsed.i > now + 5000 ||
                parsed.e - parsed.i <= 0 ||
                parsed.e - parsed.i > maxTtlMs ||
                parsed.e > now + maxTtlMs + 5000
            ) {
                this._tickets.delete(normalizedTicket);
                return null;
            }

            const entry = this._tickets.get(normalizedTicket);
            this._tickets.delete(normalizedTicket);
            this._consumedTickets.set(normalizedTicket, parsed.e);
            this._consumedTickets.set(parsed.n, parsed.e);

            if (this._ticketReplayStore) {
                const claimed = await this._ticketReplayStore.ConsumeNonce(
                    parsed.n,
                    Math.max(1000, parsed.e - now)
                );
                if (!claimed) {
                    return null;
                }
            } else if (!entry) {
                // Without a distributed TicketReplayStore, require the ticket to have been issued by this node
                // so forged or cross-replica replayed tickets cannot bypass single-use enforcement.
                return null;
            }

            const sameArtifact =
                UUIDsEqual(parsed.a, normalizedArtifactId) ||
                parsed.a.toLowerCase() === normalizedArtifactId.toLowerCase();
            if (!sameArtifact) {
                return null;
            }

            const user = entry?.User ?? UserCache.Instance.Users?.find((u) => UUIDsEqual(u.ID, parsed.u));
            if (!user || user.IsActive === false) {
                return null;
            }
            return {
                User: user,
                ApiKeyHash: entry?.ApiKeyHash ?? parsed.k
            };
        } catch {
            return null;
        }
    }

    /**
     * Evaluates whether an API key (`apiKeyHash`) holds `scopePath` (or `full_access`) on `resource`.
     * Fails closed (`false`) if the system user or scope evaluator cannot authorize the request.
     */
    public async CheckApiKeyScope(
        apiKeyHash: string,
        scopePath: string,
        resource: string,
        sessionUser: UserInfo,
        skipLogging: boolean = false
    ): Promise<boolean> {
        if (!apiKeyHash) {
            return true;
        }
        try {
            const systemUser = UserCache.Instance.GetSystemUser();
            if (!systemUser) {
                return false;
            }
            const apiKeyEngine = GetAPIKeyEngine();
            const fullAccess = await apiKeyEngine.Authorize(
                apiKeyHash,
                'MJAPI',
                'full_access',
                '*',
                systemUser,
                { endpoint: ARTIFACT_COLLABORATION_WS_PATH, method: 'GET' },
                { skipLogging: true }
            );
            if (fullAccess.Allowed) {
                return true;
            }

            const scoped = await apiKeyEngine.Authorize(
                apiKeyHash,
                'MJAPI',
                scopePath,
                resource,
                systemUser,
                { endpoint: ARTIFACT_COLLABORATION_WS_PATH, method: 'GET' },
                {
                    skipLogging,
                    actingContext: sessionUser.APIKeyActingContext
                }
            );
            return Boolean(scoped.Allowed);
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.CheckApiKeyScope failed for scope '${scopePath}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return false;
        }
    }

    /**
     * Inspects an incoming HTTP `upgrade` request and handles it if the pathname matches
     * {@link ARTIFACT_COLLABORATION_WS_PATH} or `ApiRoute(ARTIFACT_COLLABORATION_WS_PATH)`.
     *
     * @returns `true` if the path matched and upgrade handling was claimed; `false` otherwise.
     */
    public TryHandleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
        const parsedUrl = this.parseRequestUrl(req);
        if (!parsedUrl) {
            return false;
        }
        const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
        const mountedPath = ApiRoute(ARTIFACT_COLLABORATION_WS_PATH).replace(/\/+$/, '') || '/';
        if (pathname !== ARTIFACT_COLLABORATION_WS_PATH && pathname !== mountedPath) {
            return false;
        }

        if (this._shuttingDown) {
            this.rejectRawUpgrade(socket, 503, 'Service Unavailable');
            return true;
        }

        if (!this.isOriginAllowed(req.headers.origin)) {
            this.refuseDisallowedOrigin(socket, req.headers.origin);
            return true;
        }

        this.ensureShutdownRegistered();
        this.ensurePermissionListenerRegistered();
        this.ensureHeartbeatStarted();

        void this.handleAuthenticatedUpgrade(req, socket, head, parsedUrl).catch((err) => {
            LogError(
                `ArtifactCollaborationServer.TryHandleUpgrade unexpected error: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            try {
                socket.destroy();
            } catch {
                // Socket already closed
            }
        });
        return true;
    }

    /**
     * Re-evaluates permissions for all active connections in `artifactId`'s room (or only `targetUserId`
     * when specified), plus any open delegated child artifact rooms (`DelegateRecordID === artifactId`).
     * Immediately disconnects clients who lost `CanRead` (or became inactive) and downgrades clients
     * who lost `CanEdit` to read-only mode (`C2`).
     */
    public async ReevaluateRoomPermissions(
        artifactId: string,
        targetUserId?: string,
        publishRelay: boolean = false,
        visitedRoomKeys?: Set<string>
    ): Promise<void> {
        const normalizedId = (artifactId ?? '').trim();
        if (!normalizedId) {
            return;
        }
        const roomKey = normalizedId.toLowerCase();
        const visited = visitedRoomKeys ?? new Set<string>();
        if (visited.has(roomKey)) {
            return;
        }
        visited.add(roomKey);

        if (publishRelay) {
            try {
                await this._relay.PublishToRoom({
                    ArtifactID: normalizedId,
                    MessageType: 'permission-revoked',
                    PayloadBase64: '',
                    TargetUserID: targetUserId
                });
            } catch (err) {
                LogError(
                    `ArtifactCollaborationServer.ReevaluateRoomPermissions relay publish failed for '${normalizedId}': ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        }

        const room = this._rooms.get(roomKey);
        if (room) {
            const provider = this.activeProvider();
            for (const conn of Array.from(room.Connections)) {
                if (targetUserId && !UUIDsEqual(conn.User.ID, targetUserId)) {
                    continue;
                }

                const isActive = this.isUserStillActive(conn.User);
                const canReadScope =
                    isActive && conn.ApiKeyHash
                        ? await this.CheckApiKeyScope(conn.ApiKeyHash, 'artifact:read', room.ArtifactID, conn.User, true)
                        : isActive;

                const perms =
                    isActive && canReadScope
                        ? await ArtifactPermissionEngine.Instance.ResolvePermissions(
                              provider,
                              room.ArtifactID,
                              conn.User
                          )
                        : null;

                if (!isActive || !canReadScope || !perms || !perms.CanRead) {
                    const reason = !isActive
                        ? 'User account is inactive.'
                        : perms?.Reason || 'Read permission revoked.';
                    this.sendPermissionStatusFrame(conn.Socket, {
                        canRead: false,
                        canEdit: false,
                        reason
                    });
                    this.clearControlledAwarenessStates(room, conn);
                    room.Connections.delete(conn);
                    try {
                        conn.Socket.close(WS_CLOSE_FORBIDDEN, 'Read permission revoked');
                    } catch {
                        // Ignore socket close error
                    }
                    if (room.Connections.size === 0) {
                        this.handleRoomBecameEmpty(room, conn.User);
                    }
                } else {
                    let effectiveCanEdit = perms.CanEdit;
                    if (effectiveCanEdit && conn.ApiKeyHash) {
                        const canEditScope = await this.CheckApiKeyScope(
                            conn.ApiKeyHash,
                            'artifact:edit',
                            room.ArtifactID,
                            conn.User,
                            true
                        );
                        if (!canEditScope) {
                            effectiveCanEdit = false;
                        }
                    }
                    if (conn.CanEdit !== effectiveCanEdit) {
                        conn.CanEdit = effectiveCanEdit;
                        this.sendPermissionStatusFrame(conn.Socket, {
                            canRead: true,
                            canEdit: effectiveCanEdit,
                            reason: effectiveCanEdit
                                ? 'Edit permission granted.'
                                : 'Edit permission revoked; session downgraded to read-only.'
                        });
                    }
                }
            }
        }

        // Cascade re-evaluation to any currently open child rooms delegated to this artifact
        for (const candidateRoom of Array.from(this._rooms.values())) {
            if (!candidateRoom.DelegateRecordID) {
                continue;
            }
            const matchesParent =
                UUIDsEqual(candidateRoom.DelegateRecordID, normalizedId) ||
                candidateRoom.DelegateRecordID.trim().toLowerCase() === roomKey;
            if (matchesParent) {
                await this.ReevaluateRoomPermissions(
                    candidateRoom.ArtifactID,
                    targetUserId,
                    publishRelay,
                    visited
                );
            }
        }
    }

    /**
     * Flushes the room's current Yjs state (`Y.encodeStateAsUpdate(room.Doc)`) to
     * `MJ: Artifact Working States` using the server system user (`B1`),
     * while recording the editing user in `LastModifiedByUserID`.
     * All flushes for a room are serialized through `room.FlushQueue` so an older debounced
     * flush can never overwrite a newer post-version flush (`Blocker 2`, `Item 7`).
     */
    public async FlushWorkingState(artifactId: string, contextUser: UserInfo): Promise<boolean> {
        this.ensureShutdownRegistered();
        const key = (artifactId ?? '').trim().toLowerCase();
        const room = this._rooms.get(key);
        if (!room) {
            return false;
        }
        if (room.WorkingStateTimer) {
            clearTimeout(room.WorkingStateTimer);
            room.WorkingStateTimer = null;
        }

        const executeSerializedFlush = async (): Promise<boolean> => {
            if (this._rooms.get(key) !== room) {
                return false;
            }
            const provider = this.activeProvider();
            const actor = contextUser ?? room.LastModifiedByUser;
            const persistenceUser = UserCache.Instance.GetSystemUser() ?? actor;
            if (!provider || !actor || !persistenceUser) {
                return false;
            }

            try {
                // Encode Y.Doc state inside the serialized queue task so we always persist the latest state
                const stateBytes = Y.encodeStateAsUpdate(room.Doc);
                const stateBase64 = BytesToBase64(stateBytes);
                const rv = RunView.FromMetadataProvider(provider);
                const existingRes = await rv.RunView<Record<string, unknown>>(
                    {
                        EntityName: 'MJ: Artifact Working States',
                        ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                        IncludeBinaryFields: true,
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    },
                    persistenceUser
                );

                const entity = await provider.GetEntityObject<MJArtifactWorkingStateEntity>(
                    'MJ: Artifact Working States',
                    persistenceUser
                );
                if (existingRes.Success && existingRes.Results && existingRes.Results.length > 0) {
                    await entity.LoadFromData(normalizeWorkingStateRowForEntity(existingRes.Results[0]));
                } else {
                    entity.NewRecord();
                    entity.ArtifactID = room.ArtifactID;
                }
                entity.YjsState = stateBase64;
                entity.LastModifiedByUserID = actor.ID;
                const saved = await entity.Save();
                if (saved) {
                    room.DirtyWorkingState = false;
                    room.CompactionRetryCount = 0;
                } else {
                    room.DirtyWorkingState = true;
                    LogError(
                        `ArtifactCollaborationServer.FlushWorkingState Save() returned false for '${artifactId}': ${
                            entity.LatestResult?.CompleteMessage ?? 'unknown save error'
                        }`
                    );
                }
                return saved;
            } catch (err) {
                room.DirtyWorkingState = true;
                LogError(
                    `ArtifactCollaborationServer.FlushWorkingState failed for '${artifactId}': ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
                return false;
            }
        };

        const queued = room.FlushQueue.then(executeSerializedFlush, executeSerializedFlush);
        room.FlushQueue = queued;
        return await queued;
    }

    /**
     * Compacts the room's current collaborative content into a new immutable `MJ: Artifact Versions`
     * record if the content hash differs from the latest persisted version, retrying up to 3 times
     * on concurrent `VersionNumber` conflicts (`C5`), and flushes `MJ: Artifact Working States`
     * both before and after the version row and `meta` map are updated (`Blocker 2`).
     * Also reconciles any out-of-band `MJ: Artifact Versions` row written outside the room (`Item 5`).
     */
    public async CompactRoomToArtifactVersion(
        artifactId: string,
        contextUser: UserInfo
    ): Promise<{ Saved: boolean; VersionID?: string; VersionNumber?: number }> {
        this.ensureShutdownRegistered();
        const provider = this.activeProvider();
        if (!provider || !contextUser) {
            return { Saved: false };
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            artifactId,
            contextUser
        );
        if (!perms.CanEdit) {
            return { Saved: false };
        }

        const room = await this.GetOrCreateRoom(artifactId, contextUser);
        if (!room) {
            return { Saved: false };
        }

        const rv = RunView.FromMetadataProvider(provider);
        const queryUser = UserCache.Instance.GetSystemUser() ?? contextUser;

        let lastSaveError = 'unknown error';
        for (let attempt = 1; attempt <= MAX_VERSION_SAVE_ATTEMPTS; attempt++) {
            const latestRes = await rv.RunView<{
                ID: string;
                VersionNumber: number;
                Content?: string | null;
                Configuration?: string | null;
                ContentHash?: string | null;
            }>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                    OrderBy: 'VersionNumber DESC',
                    Fields: ['ID', 'VersionNumber', 'Content', 'Configuration', 'ContentHash'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                queryUser
            );

            const latest = latestRes.Success ? latestRes.Results?.[0] : undefined;

            // Reconcile any out-of-band version saved outside this room (e.g. REST save, restore, or peer replica)
            // on initial compaction check so we never overwrite an out-of-band version with stale room content (Item 5).
            if (
                attempt === 1 &&
                latest &&
                room.BaseVersionID &&
                !UUIDsEqual(latest.ID, room.BaseVersionID) &&
                latest.VersionNumber > room.BaseVersionNumber
            ) {
                const latestText = latest.Content || latest.Configuration || '';
                const latestHash = latest.ContentHash || this.computeSha256Hex(latestText);
                const tracked = this.lookupVerifiedCompactedStateVector(
                    room.ArtifactID,
                    latest.ID,
                    latest.VersionNumber,
                    latestHash
                );
                this.reconcileOutOfBandVersionIntoRoom(room, latest, {
                    originServerId: tracked?.OriginServerID,
                    savedStateVectorB64: tracked?.SavedStateVectorB64,
                    savedContentHash: latestHash
                });
            }

            const currentContent = this.extractRoomSerializedContent(room.Doc);
            const savedStateVectorB64 = BytesToBase64(Y.encodeStateVector(room.Doc));
            const contentHash = createHash('sha256').update(currentContent, 'utf8').digest('hex');

            if (latest && (latest.ContentHash === contentHash || latest.Content === currentContent)) {
                room.DirtyVersion = false;
                room.CompactionRetryCount = 0;
                room.BaseVersionID = latest.ID;
                room.BaseVersionNumber = latest.VersionNumber;
                room.BaseVersionText = currentContent;
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    meta.set('versionNumber', latest.VersionNumber);
                    meta.set('versionId', latest.ID);
                    meta.set('baseVersionNumber', latest.VersionNumber);
                    meta.set('baseVersionId', latest.ID);
                    meta.set('baseContent', currentContent);
                }, 'version-meta');
                if (room.DirtyWorkingState) {
                    await this.FlushWorkingState(artifactId, contextUser);
                }
                if (room.Connections.size === 0 && !this._shuttingDown) {
                    this.scheduleIdleRoomDisposal(room);
                }
                return {
                    Saved: true,
                    VersionID: latest.ID,
                    VersionNumber: latest.VersionNumber
                };
            }

            // Persist the room's current CRDT items to MJ: Artifact Working States BEFORE saving the version row
            // so even if the post-version flush fails or the process crashes right after versionEntity.Save(),
            // the working state already holds the exact client CRDT items (Blocker 2).
            if (room.DirtyWorkingState) {
                await this.FlushWorkingState(artifactId, contextUser);
            }

            const nextVersionNumber = (latest?.VersionNumber ?? 0) + 1;
            const versionEntity = await provider.GetEntityObject<MJArtifactVersionEntity>(
                'MJ: Artifact Versions',
                contextUser
            );
            versionEntity.NewRecord();
            versionEntity.ArtifactID = room.ArtifactID;
            versionEntity.VersionNumber = nextVersionNumber;
            versionEntity.UserID = contextUser.ID;
            versionEntity.Content = currentContent;
            versionEntity.ContentHash = contentHash;
            if (room.Doc.getMap('worksheetsById').size > 0) {
                versionEntity.Configuration = currentContent;
            }

            if (!versionEntity.ID || versionEntity.ID.trim().length === 0) {
                versionEntity.ID = randomUUID();
            }
            const normPendingVersionId = NormalizeUUID(versionEntity.ID);
            this._inFlightCompactionVersionIds.add(normPendingVersionId);
            let saved = false;
            try {
                saved = await versionEntity.Save();
                if (!saved) {
                    lastSaveError = versionEntity.LatestResult?.CompleteMessage ?? 'Save() returned false';
                }
            } catch (err) {
                lastSaveError = err instanceof Error ? err.message : String(err);
                saved = false;
            } finally {
                this._inFlightCompactionVersionIds.delete(normPendingVersionId);
                if (versionEntity.ID && versionEntity.ID.trim().length > 0) {
                    this._inFlightCompactionVersionIds.delete(NormalizeUUID(versionEntity.ID));
                }
            }

            if (saved) {
                this.recordCompactedStateVector(
                    room.ArtifactID,
                    versionEntity.ID,
                    versionEntity.VersionNumber,
                    savedStateVectorB64,
                    contentHash
                );
                room.DirtyVersion = false;
                room.CompactionRetryCount = 0;
                room.BaseVersionID = versionEntity.ID;
                room.BaseVersionNumber = versionEntity.VersionNumber;
                room.BaseVersionText = currentContent;
                const versionVectorMetaKey = `art:${NormalizeUUID(room.ArtifactID)}:v:${versionEntity.VersionNumber}`;
                const versionVectorMetaValue = JSON.stringify({
                    sv: savedStateVectorB64,
                    versionId: versionEntity.ID,
                    contentHash
                });
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    meta.set('versionNumber', versionEntity.VersionNumber);
                    meta.set('versionId', versionEntity.ID);
                    meta.set('baseVersionNumber', versionEntity.VersionNumber);
                    meta.set('baseVersionId', versionEntity.ID);
                    meta.set('baseContent', currentContent);
                    meta.set(versionVectorMetaKey, versionVectorMetaValue);
                    meta.set('roomEpoch', room.RoomEpoch);
                }, 'version-meta');

                // Flush working state AFTER saving the version and updating `meta` so the working state
                // timestamp is never older than the version and includes the updated `versionNumber`/`versionId`.
                await this.FlushWorkingState(artifactId, contextUser);

                this.broadcastControlFrame(room, {
                    action: 'version-saved',
                    versionId: versionEntity.ID,
                    versionNumber: versionEntity.VersionNumber,
                    roomEpoch: room.RoomEpoch
                });

                const fullDocUpdate = Y.encodeStateAsUpdate(room.Doc);
                const savedDocUpdateB64 =
                    fullDocUpdate.byteLength <= ArtifactCollaborationServer.MAX_INLINE_RELAY_DOC_UPDATE_BYTES
                        ? BytesToBase64(fullDocUpdate)
                        : undefined;
                const versionSavedRelayPayload = JSON.stringify({
                    savedStateVectorB64,
                    savedContentHash: contentHash,
                    ...(savedDocUpdateB64 ? { savedDocUpdateB64 } : {})
                });

                try {
                    await this._relay.PublishToRoom({
                        ArtifactID: room.ArtifactID,
                        MessageType: 'version-saved',
                        PayloadBase64: versionSavedRelayPayload,
                        VersionID: versionEntity.ID,
                        VersionNumber: versionEntity.VersionNumber
                    });
                } catch (relayErr) {
                    LogError(
                        `ArtifactCollaborationServer.CompactRoomToArtifactVersion relay publish failed: ${
                            relayErr instanceof Error ? relayErr.message : String(relayErr)
                        }`
                    );
                }

                if (room.Connections.size === 0 && !this._shuttingDown) {
                    this.scheduleIdleRoomDisposal(room);
                }

                return {
                    Saved: true,
                    VersionID: versionEntity.ID,
                    VersionNumber: versionEntity.VersionNumber
                };
            }
        }

        if (room.Connections.size === 0 && !this._shuttingDown) {
            this.scheduleIdleRoomDisposal(room);
        }

        LogError(
            `ArtifactCollaborationServer.CompactRoomToArtifactVersion failed after ${MAX_VERSION_SAVE_ATTEMPTS} attempts for '${artifactId}': ${lastSaveError}`
        );
        return { Saved: false };
    }

    /**
     * Applies a server-side content mutation (e.g., from `DocumentToolLibrary`, `WhiteboardToolLibrary`,
     * `SlideDeckToolLibrary`, or `SpreadsheetToolLibrary` during an `@mention` agent run) directly to
     * the live Yjs room using minimal CRDT diffs so connected browsers preserve their Yjs item lineage
     * and concurrent human additions (`Blocker 1` & `Blocker 2`).
     */
    public async ApplyServerContentMutation(
        artifactId: string,
        newContent: string,
        user: UserInfo,
        saveVersion: boolean = true,
        previousContent?: string
    ): Promise<{ Success: boolean; VersionID?: string; VersionNumber?: number; MergedContent?: string }> {
        this.ensureShutdownRegistered();
        const provider = this.activeProvider();
        if (!provider || !user) {
            return { Success: false };
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            provider,
            artifactId,
            user
        );
        if (!perms.CanEdit) {
            return { Success: false };
        }

        const room = await this.GetOrCreateRoom(artifactId, user);
        if (!room) {
            return { Success: false };
        }

        const yText = room.Doc.getText('content');
        const existing = this.extractRoomSerializedContent(room.Doc);
        const alreadyReconciledFromSameBaseline =
            !saveVersion &&
            typeof previousContent === 'string' &&
            previousContent !== newContent &&
            room.BaseVersionText === newContent &&
            room.LastReconciledBaselineText === previousContent;

        if (existing !== newContent && !alreadyReconciledFromSameBaseline) {
            room.PreOutOfBandDocState = Y.encodeStateAsUpdate(room.Doc);
            const nextEpoch = `epoch-${Date.now()}-${randomBytes(4).toString('hex')}`;
            room.RoomEpoch = nextEpoch;
            room.Doc.transact(() => {
                room.Doc.getMap('meta').set('roomEpoch', nextEpoch);
                this.applyMinimalTextDiff(yText, yText.toString(), newContent, previousContent);
                this.syncSlideDeckStructuresIfPresent(room.Doc, newContent, {
                    preserveConcurrentAdditions: true,
                    baselineContent: previousContent
                });
                this.syncSpreadsheetStructuresIfPresent(room.Doc, newContent, null, {
                    preserveConcurrentAdditions: true,
                    baselineContent: previousContent
                });
                if (
                    room.Doc.getMap('slidesById').size > 0 ||
                    room.Doc.getMap('worksheetsById').size > 0
                ) {
                    const mergedSerialized = this.extractRoomSerializedContent(room.Doc);
                    this.applyMinimalTextDiff(yText, yText.toString(), mergedSerialized);
                }
            }, 'server-agent');
            room.LastModifiedByUser = user;
            room.DirtyWorkingState = true;
            room.DirtyVersion = true;
        }

        const mergedContent = this.extractRoomSerializedContent(room.Doc);

        if (saveVersion) {
            const compacted = await this.CompactRoomToArtifactVersion(artifactId, user);
            const postCompactContent = this.extractRoomSerializedContent(room.Doc);
            if (room.Connections.size === 0 && !this._shuttingDown) {
                this.scheduleIdleRoomDisposal(room);
            }
            return {
                Success: compacted.Saved,
                VersionID: compacted.VersionID,
                VersionNumber: compacted.VersionNumber,
                MergedContent: postCompactContent
            };
        }

        await this.FlushWorkingState(artifactId, user);
        if (room.Connections.size === 0 && !this._shuttingDown) {
            this.scheduleIdleRoomDisposal(room);
        }
        return { Success: true, MergedContent: mergedContent };
    }

    /**
     * Returns the current in-memory room for `artifactId`, hydrating it from `MJ: Artifact Working States`
     * or `MJ: Artifact Versions` if not yet loaded.
     */
    public async GetOrCreateRoom(artifactId: string, contextUser: UserInfo): Promise<CollaborationRoom | null> {
        const key = (artifactId ?? '').trim().toLowerCase();
        if (!key || !contextUser) {
            return null;
        }
        this.ensureShutdownRegistered();
        this.ensurePermissionListenerRegistered();

        const existing = this._rooms.get(key);
        if (existing) {
            if (existing.Connections.size === 0 && !this._shuttingDown) {
                this.scheduleIdleRoomDisposal(existing);
            } else if (existing.IdleDisposeTimer) {
                clearTimeout(existing.IdleDisposeTimer);
                existing.IdleDisposeTimer = null;
            }
            return existing;
        }
        const inFlight = this._roomInitPromises.get(key);
        if (inFlight) {
            return await inFlight;
        }
        const initPromise = this.createAndHydrateRoom(artifactId.trim(), contextUser).finally(() => {
            this._roomInitPromises.delete(key);
        });
        this._roomInitPromises.set(key, initPromise);
        return await initPromise;
    }

    /**
     * Returns the current collaborative string content for `artifactId` from its active Yjs room
     * (or hydrates the room first), reconciling any newer out-of-band `MJ: Artifact Versions` row.
     */
    public async GetRoomContent(artifactId: string, contextUser: UserInfo): Promise<string> {
        const key = (artifactId ?? '').trim().toLowerCase();
        const wasAlreadyLoaded = this._rooms.has(key);
        const room = await this.GetOrCreateRoom(artifactId, contextUser);
        if (room && wasAlreadyLoaded) {
            await this.checkAndReconcileLatestDatabaseVersion(room, contextUser);
        }
        if (room && room.Connections.size === 0 && !this._shuttingDown) {
            this.scheduleIdleRoomDisposal(room);
        }
        return room ? this.extractRoomSerializedContent(room.Doc) : '';
    }

    /**
     * Graceful shutdown hook called by `ShutdownRegistry`. Stops heartbeat intervals, flushes all
     * dirty working states, closes active WebSocket connections, destroys Yjs Awareness & Doc
     * instances, and unsubscribes cross-instance relays.
     */
    public async Shutdown(): Promise<void> {
        this._shuttingDown = true;

        if (this._heartbeatTimer) {
            clearInterval(this._heartbeatTimer);
            this._heartbeatTimer = null;
        }

        for (const room of Array.from(this._rooms.values())) {
            if (room.IdleDisposeTimer) {
                clearTimeout(room.IdleDisposeTimer);
                room.IdleDisposeTimer = null;
            }
            if (room.WorkingStateTimer) {
                clearTimeout(room.WorkingStateTimer);
                room.WorkingStateTimer = null;
            }
            if (room.DirtyWorkingState) {
                const flushActor = room.LastModifiedByUser ?? UserCache.Instance.GetSystemUser();
                if (flushActor) {
                    await this.FlushWorkingState(room.ArtifactID, flushActor);
                }
            }
            for (const conn of room.Connections) {
                try {
                    conn.Socket.close(1001, 'Server shutting down');
                } catch {
                    // Ignore close error
                }
            }
            room.Connections.clear();
            this.teardownRoomResources(room);
        }

        this._rooms.clear();
        this._tickets.clear();
        this._consumedTickets.clear();
        this._inFlightCompactionVersionIds.clear();
        for (const waiters of this._pendingSyncWaiters.values()) {
            for (const resolve of waiters) {
                resolve(false);
            }
        }
        this._pendingSyncWaiters.clear();
        this._pendingUpgradesByArtifact.clear();
        await this._relay.Shutdown();
    }

    /**
     * Returns `true` when `doc` already contains every CRDT insert operation present in `targetStateVectorBytes` (`R5-3`).
     * Note: `Y.encodeStateVector` tracks insert clocks only (not `DeleteSet`), so callers pair this with
     * `savedDocUpdateB64` / `savedContentHash` verification (`R6-7`).
     */
    public DoesDocContainStateVector(doc: Y.Doc, targetStateVectorBytes: Uint8Array): boolean {
        if (!targetStateVectorBytes || targetStateVectorBytes.byteLength === 0) {
            return false;
        }
        try {
            const targetMap = Y.decodeStateVector(targetStateVectorBytes);
            if (targetMap.size === 0) {
                return false;
            }
            const localMap = Y.decodeStateVector(Y.encodeStateVector(doc));
            for (const [clientId, requiredClock] of targetMap.entries()) {
                if (requiredClock > 0 && (localMap.get(clientId) ?? 0) < requiredClock) {
                    return false;
                }
            }
            return true;
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.DoesDocContainStateVector failed: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return false;
        }
    }

    private computeSha256Hex(content: string): string {
        return createHash('sha256').update(content, 'utf8').digest('hex');
    }

    private recordCompactedStateVector(
        artifactId: string,
        versionId: string | undefined,
        versionNumber: number,
        savedStateVectorB64: string,
        contentHash: string
    ): void {
        if (!savedStateVectorB64 || !versionId || !versionId.trim()) {
            return;
        }
        const entry = {
            OriginServerID: this._serverInstanceId,
            SavedStateVectorB64: savedStateVectorB64,
            VersionID: versionId.trim(),
            ContentHash: contentHash
        };
        const map = ArtifactCollaborationServer._compactedStateVectors;
        map.set(`ver:${NormalizeUUID(versionId)}`, entry);
        map.set(`art:${NormalizeUUID(artifactId)}:v:${versionNumber}`, entry);
        while (map.size > ArtifactCollaborationServer.MAX_TRACKED_COMPACTED_VECTORS) {
            const oldestKey = map.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }
            map.delete(oldestKey);
        }
    }

    private lookupVerifiedCompactedStateVector(
        artifactId: string,
        versionId: string,
        versionNumber: number,
        expectedContentHash: string
    ): { OriginServerID: string; SavedStateVectorB64: string; VersionID: string; ContentHash: string } | undefined {
        const map = ArtifactCollaborationServer._compactedStateVectors;
        const byId = map.get(`ver:${NormalizeUUID(versionId)}`);
        if (
            byId &&
            UUIDsEqual(byId.VersionID, versionId) &&
            byId.ContentHash === expectedContentHash
        ) {
            return byId;
        }
        const bySlot = map.get(`art:${NormalizeUUID(artifactId)}:v:${versionNumber}`);
        if (
            bySlot &&
            UUIDsEqual(bySlot.VersionID, versionId) &&
            bySlot.ContentHash === expectedContentHash
        ) {
            return bySlot;
        }
        return undefined;
    }

    private doesDocMetaMatchVersionStateVector(
        doc: Y.Doc,
        artifactId: string,
        versionId: string,
        versionNumber: number,
        expectedContentHash: string
    ): boolean {
        const metaKey = `art:${NormalizeUUID(artifactId)}:v:${versionNumber}`;
        const raw = doc.getMap('meta').get(metaKey);
        if (!raw) {
            return false;
        }
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed.startsWith('{')) {
                // Legacy plain string entries lack `versionId` and `contentHash` verification (`R6-7`).
                return false;
            }
            try {
                const parsed = JSON.parse(trimmed) as {
                    sv?: string;
                    versionId?: string;
                    contentHash?: string;
                };
                return Boolean(
                    parsed.sv &&
                        parsed.versionId &&
                        UUIDsEqual(parsed.versionId, versionId) &&
                        parsed.contentHash === expectedContentHash &&
                        this.DoesDocContainStateVector(doc, Base64ToBytes(parsed.sv))
                );
            } catch (err) {
                LogError(
                    `ArtifactCollaborationServer.doesDocMetaMatchVersionStateVector failed parsing '${metaKey}': ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
                return false;
            }
        }
        if (typeof raw === 'object') {
            const obj = raw as { sv?: string; versionId?: string; contentHash?: string };
            return Boolean(
                obj.sv &&
                    obj.versionId &&
                    UUIDsEqual(obj.versionId, versionId) &&
                    obj.contentHash === expectedContentHash &&
                    this.DoesDocContainStateVector(doc, Base64ToBytes(obj.sv))
            );
        }
        return false;
    }

    private parseVersionSavedRelayPayload(payloadBase64: string | undefined): {
        savedStateVectorB64?: string;
        savedDocUpdateB64?: string;
        savedContentHash?: string;
    } {
        if (!payloadBase64) {
            return {};
        }
        const trimmed = payloadBase64.trim();
        if (!trimmed) {
            return {};
        }
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed) as {
                    savedStateVectorB64?: string;
                    savedDocUpdateB64?: string;
                    savedContentHash?: string;
                };
                return {
                    savedStateVectorB64:
                        typeof parsed.savedStateVectorB64 === 'string' && parsed.savedStateVectorB64
                            ? parsed.savedStateVectorB64
                            : undefined,
                    savedDocUpdateB64:
                        typeof parsed.savedDocUpdateB64 === 'string' && parsed.savedDocUpdateB64
                            ? parsed.savedDocUpdateB64
                            : undefined,
                    savedContentHash:
                        typeof parsed.savedContentHash === 'string' && parsed.savedContentHash
                            ? parsed.savedContentHash
                            : undefined
                };
            } catch (err) {
                LogError(
                    `ArtifactCollaborationServer.parseVersionSavedRelayPayload failed: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
                return {};
            }
        }
        return { savedStateVectorB64: trimmed };
    }

    private parseSyncStateRelayPayload(payloadBase64: string | undefined): {
        updateBytes: Uint8Array;
        savedContentHash?: string;
    } {
        if (!payloadBase64) {
            return { updateBytes: new Uint8Array(0) };
        }
        const trimmed = payloadBase64.trim();
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed) as {
                    savedDocUpdateB64?: string;
                    savedContentHash?: string;
                };
                const updateBytes = parsed.savedDocUpdateB64
                    ? Base64ToBytes(parsed.savedDocUpdateB64)
                    : new Uint8Array(0);
                return {
                    updateBytes,
                    savedContentHash:
                        typeof parsed.savedContentHash === 'string' ? parsed.savedContentHash : undefined
                };
            } catch (err) {
                LogError(
                    `ArtifactCollaborationServer.parseSyncStateRelayPayload failed: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
                return { updateBytes: new Uint8Array(0) };
            }
        }
        return { updateBytes: Base64ToBytes(trimmed) };
    }

    private createPendingSyncWaiter(
        artifactId: string,
        timeoutMs: number
    ): { promise: Promise<boolean>; cancel: () => void } {
        const key = NormalizeUUID(artifactId);
        let settleFn: ((synced: boolean) => void) | null = null;
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = (): void => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            if (settleFn) {
                const set = this._pendingSyncWaiters.get(key);
                if (set) {
                    set.delete(settleFn);
                    if (set.size === 0) {
                        this._pendingSyncWaiters.delete(key);
                    }
                }
            }
        };

        const promise = new Promise<boolean>((resolve) => {
            settleFn = (synced: boolean) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(synced);
            };
            let set = this._pendingSyncWaiters.get(key);
            if (!set) {
                set = new Set();
                this._pendingSyncWaiters.set(key, set);
            }
            set.add(settleFn);
            timer = setTimeout(() => {
                if (settleFn) {
                    settleFn(false);
                }
            }, timeoutMs);
        });

        return {
            promise,
            cancel: () => {
                if (settleFn) {
                    settleFn(false);
                }
            }
        };
    }

    private resolvePendingSyncWaiters(artifactId: string, synced: boolean): void {
        const key = NormalizeUUID(artifactId);
        const set = this._pendingSyncWaiters.get(key);
        if (!set || set.size === 0) {
            return;
        }
        for (const fn of Array.from(set)) {
            fn(synced);
        }
    }

    private ensureShutdownRegistered(): void {
        if (!this._shutdownRegistered) {
            ShutdownRegistry.Instance.Register(this);
            this._shutdownRegistered = true;
        }
    }

    private ensurePermissionListenerRegistered(): void {
        if (!this._unsubscribePermissionEngine) {
            this._unsubscribePermissionEngine = ArtifactPermissionEngine.Instance.OnPermissionsChanged(async (evt) => {
                await this.ReevaluateRoomPermissions(evt.ArtifactID, evt.TargetUserID, true);
            });
        }
    }

    private ensureGlobalMutationListenerRegistered(): void {
        if (this._globalMutationSub) {
            return;
        }
        this._globalMutationSub = MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
            if (event.event !== MJEventType.ComponentEvent || !event.args || typeof event.args !== 'object') {
                return;
            }
            if (event.eventCode === ARTIFACT_LIVE_MUTATION_EVENT_CODE) {
                const payload = event.args as {
                    ArtifactID?: string;
                    NewContent?: string;
                    PreviousContent?: string;
                    User?: UserInfo;
                    SaveVersion?: boolean;
                };
                if (payload.ArtifactID && typeof payload.NewContent === 'string' && payload.User) {
                    void this.ApplyServerContentMutation(
                        payload.ArtifactID,
                        payload.NewContent,
                        payload.User,
                        payload.SaveVersion ?? true,
                        payload.PreviousContent
                    );
                }
            } else if (event.eventCode === ARTIFACT_VERSION_SAVED_EVENT_CODE) {
                const payload = event.args as {
                    ArtifactID?: string;
                    VersionID?: string;
                    versionId?: string;
                    VersionNumber?: number;
                    Content?: string | null;
                    Configuration?: string | null;
                    OriginServerID?: string;
                    SavedStateVectorB64?: string;
                    SavedContentHash?: string;
                };
                const eventVersionId = payload.VersionID ?? payload.versionId;
                if (
                    payload.ArtifactID &&
                    eventVersionId &&
                    typeof payload.VersionNumber === 'number' &&
                    !this._inFlightCompactionVersionIds.has(NormalizeUUID(eventVersionId))
                ) {
                    const room = this._rooms.get(payload.ArtifactID.trim().toLowerCase());
                    if (room && !UUIDsEqual(room.BaseVersionID, eventVersionId)) {
                        const eventContent = payload.Content || payload.Configuration || '';
                        const expectedHash = payload.SavedContentHash ?? this.computeSha256Hex(eventContent);
                        const tracked = this.lookupVerifiedCompactedStateVector(
                            payload.ArtifactID,
                            eventVersionId,
                            payload.VersionNumber,
                            expectedHash
                        );
                        this.reconcileOutOfBandVersionIntoRoom(
                            room,
                            {
                                ID: eventVersionId,
                                VersionNumber: payload.VersionNumber,
                                Content: payload.Content,
                                Configuration: payload.Configuration
                            },
                            {
                                originServerId: payload.OriginServerID ?? tracked?.OriginServerID,
                                savedStateVectorB64: payload.SavedStateVectorB64 ?? tracked?.SavedStateVectorB64,
                                savedContentHash: expectedHash
                            }
                        );
                    }
                }
            }
        });
    }

    private reconcileOutOfBandVersionIntoRoom(
        room: CollaborationRoom,
        version: {
            ID: string;
            VersionNumber: number;
            Content?: string | null;
            Configuration?: string | null;
        },
        options?: {
            previousContent?: string;
            originServerId?: string;
            savedStateVectorB64?: string;
            savedContentHash?: string;
            crdtSynced?: boolean;
        }
    ): void {
        if (UUIDsEqual(room.BaseVersionID, version.ID)) {
            return;
        }
        if (
            options?.originServerId === this._serverInstanceId &&
            room.BaseVersionNumber >= version.VersionNumber
        ) {
            return;
        }
        const targetText = version.Content || version.Configuration || '';
        const targetContentHash = this.computeSha256Hex(targetText);
        const yText = room.Doc.getText('content');
        const liveText = this.extractRoomSerializedContent(room.Doc);
        const baselineText = options?.previousContent ?? room.BaseVersionText;
        const nextEpoch = `epoch-${version.ID}-${version.VersionNumber}`;
        room.RoomEpoch = nextEpoch;

        const trackedVerified = this.lookupVerifiedCompactedStateVector(
            room.ArtifactID,
            version.ID,
            version.VersionNumber,
            targetContentHash
        );
        const relayHashMatches =
            !options?.savedContentHash || options.savedContentHash === targetContentHash;
        const effectiveVectorB64 = relayHashMatches
            ? options?.savedStateVectorB64 ?? trackedVerified?.SavedStateVectorB64
            : trackedVerified?.SavedStateVectorB64;

        const alreadyContainsCompactedOps = Boolean(
            (options?.crdtSynced && relayHashMatches) ||
                (effectiveVectorB64 &&
                    this.DoesDocContainStateVector(room.Doc, Base64ToBytes(effectiveVectorB64))) ||
                this.doesDocMetaMatchVersionStateVector(
                    room.Doc,
                    room.ArtifactID,
                    version.ID,
                    version.VersionNumber,
                    targetContentHash
                )
        );

        const setBaseMeta = (recordVectorB64?: string): void => {
            const meta = room.Doc.getMap('meta');
            meta.set('roomEpoch', nextEpoch);
            meta.set('versionNumber', version.VersionNumber);
            meta.set('versionId', version.ID);
            meta.set('baseVersionNumber', version.VersionNumber);
            meta.set('baseVersionId', version.ID);
            meta.set('baseContent', targetText);
            if (recordVectorB64) {
                meta.set(
                    `art:${NormalizeUUID(room.ArtifactID)}:v:${version.VersionNumber}`,
                    JSON.stringify({
                        sv: recordVectorB64,
                        versionId: version.ID,
                        contentHash: targetContentHash
                    })
                );
            }
        };

        if (alreadyContainsCompactedOps) {
            // Room CRDT state already includes every Yjs operation (including DeleteSet when CRDT-synced)
            // that went into `version`. Advance base version metadata without running a redundant text merge
            // so concurrent live typing is never duplicated or clobbered (`R5-3`, `R6-7`).
            const recordedSvB64 = effectiveVectorB64 ?? BytesToBase64(Y.encodeStateVector(room.Doc));
            room.Doc.transact(() => {
                setBaseMeta(recordedSvB64);
            }, 'server-oob-version');
            room.DirtyVersion = liveText !== targetText;
        } else if (liveText === targetText) {
            room.Doc.transact(() => {
                setBaseMeta();
            }, 'server-oob-version');
            room.DirtyVersion = false;
        } else if (liveText === baselineText) {
            room.PreOutOfBandDocState = Y.encodeStateAsUpdate(room.Doc);
            room.Doc.transact(() => {
                this.applyMinimalTextDiff(yText, yText.toString(), targetText);
                this.syncSlideDeckStructuresIfPresent(room.Doc, targetText);
                this.syncSpreadsheetStructuresIfPresent(
                    room.Doc,
                    version.Content ?? '',
                    version.Configuration ?? null
                );
                setBaseMeta();
            }, 'server-oob-version');
            room.DirtyVersion = false;
        } else if (baselineText !== targetText) {
            room.PreOutOfBandDocState = Y.encodeStateAsUpdate(room.Doc);
            room.Doc.transact(() => {
                this.applyMinimalTextDiff(yText, yText.toString(), targetText, baselineText);
                this.syncSlideDeckStructuresIfPresent(room.Doc, targetText, {
                    preserveConcurrentAdditions: true,
                    baselineContent: baselineText
                });
                this.syncSpreadsheetStructuresIfPresent(
                    room.Doc,
                    version.Content ?? '',
                    version.Configuration ?? null,
                    {
                        preserveConcurrentAdditions: true,
                        baselineContent: baselineText
                    }
                );
                if (
                    room.Doc.getMap('slidesById').size > 0 ||
                    room.Doc.getMap('worksheetsById').size > 0
                ) {
                    const mergedSerialized = this.extractRoomSerializedContent(room.Doc);
                    this.applyMinimalTextDiff(yText, yText.toString(), mergedSerialized);
                }
                setBaseMeta();
            }, 'server-oob-version');
            const mergedText = this.extractRoomSerializedContent(room.Doc);
            room.DirtyVersion = mergedText !== targetText;
        } else {
            // liveText !== baselineText && baselineText === targetText: preserve live edits untouched
            room.Doc.transact(() => {
                setBaseMeta();
            }, 'server-oob-version');
            room.DirtyVersion = true;
        }

        room.LastReconciledBaselineText = baselineText;
        room.BaseVersionID = version.ID;
        room.BaseVersionNumber = version.VersionNumber;
        room.BaseVersionText = targetText;
        room.DirtyWorkingState = true;
        this.scheduleWorkingStateFlush(room);

        this.broadcastControlFrame(room, {
            action: 'version-saved',
            versionId: version.ID,
            versionNumber: version.VersionNumber,
            roomEpoch: room.RoomEpoch
        });
    }

    private async checkAndReconcileLatestDatabaseVersion(
        room: CollaborationRoom,
        contextUser: UserInfo,
        options?: {
            originServerId?: string;
            relayVersionId?: string;
            savedStateVectorB64?: string;
            savedContentHash?: string;
            crdtSynced?: boolean;
        }
    ): Promise<void> {
        const provider = this.activeProvider();
        if (!provider) {
            return;
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const queryUser = UserCache.Instance.GetSystemUser() ?? contextUser;
            const res = await rv.RunView<{
                ID: string;
                VersionNumber: number;
                Content?: string | null;
                Configuration?: string | null;
            }>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                    OrderBy: 'VersionNumber DESC',
                    Fields: ['ID', 'VersionNumber', 'Content', 'Configuration'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                queryUser
            );
            const latest = res.Success ? res.Results?.[0] : undefined;
            if (
                latest &&
                (!room.BaseVersionID || !UUIDsEqual(latest.ID, room.BaseVersionID)) &&
                latest.VersionNumber > room.BaseVersionNumber
            ) {
                const relayMatchesLatest = Boolean(
                    options?.relayVersionId && UUIDsEqual(latest.ID, options.relayVersionId)
                );
                const reconcileOptions = relayMatchesLatest
                    ? {
                          originServerId: options?.originServerId,
                          savedStateVectorB64: options?.savedStateVectorB64,
                          savedContentHash: options?.savedContentHash,
                          crdtSynced: options?.crdtSynced
                      }
                    : {
                          originServerId: options?.originServerId
                      };
                this.reconcileOutOfBandVersionIntoRoom(room, latest, reconcileOptions);
            }
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.checkAndReconcileLatestDatabaseVersion failed for '${room.ArtifactID}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        }
    }

    private ensureHeartbeatStarted(): void {
        if (this._heartbeatTimer || this._shuttingDown) {
            return;
        }
        this._heartbeatTimer = setInterval(() => {
            void this.runHeartbeatAndPermissionSweep();
        }, this._heartbeatIntervalMs);
        (this._heartbeatTimer as { unref?: () => void }).unref?.();
    }

    private async runHeartbeatAndPermissionSweep(): Promise<void> {
        if (this._shuttingDown || this._rooms.size === 0) {
            return;
        }
        for (const room of Array.from(this._rooms.values())) {
            for (const conn of Array.from(room.Connections)) {
                if (!conn.Alive) {
                    try {
                        conn.Socket.terminate();
                    } catch {
                        // Ignore terminate error
                    }
                    this.onClientDisconnect(room, conn);
                    continue;
                }
                conn.Alive = false;
                try {
                    if (conn.Socket.readyState === WsClient.OPEN) {
                        conn.Socket.ping();
                    }
                } catch {
                    // Ignore ping error
                }
            }

            if (room.Connections.size > 0) {
                try {
                    await this.ReevaluateRoomPermissions(room.ArtifactID, undefined, false);
                } catch (err) {
                    LogError(
                        `ArtifactCollaborationServer periodic permission sweep error for '${room.ArtifactID}': ${
                            err instanceof Error ? err.message : String(err)
                        }`
                    );
                }
            }
        }
    }

    private pruneExpiredTickets(): void {
        const now = Date.now();
        for (const [ticket, entry] of this._tickets) {
            if (entry.ExpiresAtMs <= now) {
                this._tickets.delete(ticket);
            }
        }
        for (const [ticket, expiresAtMs] of this._consumedTickets) {
            if (expiresAtMs <= now) {
                this._consumedTickets.delete(ticket);
            }
        }
    }

    private isOriginAllowed(origin: string | undefined): boolean {
        if (!origin) {
            // Non-browser upgrade (Node/CLI/test client without Origin header)
            return true;
        }
        let parsedOrigin: string;
        try {
            const url = new URL(origin);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                return false;
            }
            parsedOrigin = url.origin.toLowerCase();
        } catch {
            return false;
        }

        const normalize = (val: string): string => val.trim().toLowerCase().replace(/\/+$/, '');

        const envOriginsRaw =
            process.env[COLLABORATION_ALLOWED_ORIGINS_ENV] ?? process.env[REALTIME_ALLOWED_ORIGINS_ENV];
        if (envOriginsRaw && envOriginsRaw.trim().length > 0) {
            const allowed = envOriginsRaw.split(',').map(normalize).filter((v) => v.length > 0);
            if (allowed.includes('*')) {
                return true;
            }
            return allowed.includes(parsedOrigin);
        }

        const corsOrigins = configInfo?.cors?.allowedOrigins;
        if (Array.isArray(corsOrigins) && corsOrigins.length > 0 && !corsOrigins.includes('*')) {
            const allowed = corsOrigins.map(normalize).filter((v) => v.length > 0);
            return allowed.includes(parsedOrigin);
        }

        return true;
    }

    private refuseDisallowedOrigin(socket: Duplex, origin: string | undefined): void {
        const safeOrigin = (origin ?? '').replace(/[^\x20-\x7E]/g, '?').slice(0, MAX_LOGGED_ORIGIN_CHARS);
        console.warn(`[ArtifactCollaboration] WebSocket upgrade refused (403): disallowed Origin "${safeOrigin}"`);
        this.rejectRawUpgrade(socket, 403, 'Forbidden');
    }

    private isUserStillActive(user: UserInfo): boolean {
        if (user.IsActive === false) {
            return false;
        }
        const cached = UserCache.Instance.Users?.find((u) => UUIDsEqual(u.ID, user.ID));
        if (cached && cached.IsActive === false) {
            return false;
        }
        return true;
    }

    private activeProvider(): IMetadataProvider {
        return this._providerOverride ?? Metadata.Provider;
    }

    private parseRequestUrl(req: IncomingMessage): URL | null {
        try {
            const rawUrl = req.url ?? '/';
            return new URL(rawUrl, 'http://localhost');
        } catch {
            return null;
        }
    }

    private rejectRawUpgrade(socket: Duplex, statusCode: number, statusText: string): void {
        try {
            socket.write(
                `HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`
            );
        } catch {
            // Ignore write error
        } finally {
            try {
                socket.destroy();
            } catch {
                // Socket already destroyed
            }
        }
    }

    private async authenticateUpgradeRequest(
        req: IncomingMessage,
        parsedUrl: URL,
        artifactId: string
    ): Promise<AuthenticatedUpgradeResult | null> {
        // SECURITY (A3): Explicitly forbid credential query-string parameters (`?token=` and `?apiKey=`)
        // so bearer tokens and API keys can never leak into reverse-proxy, CDN, or access logs.
        if (parsedUrl.searchParams.has('token') || parsedUrl.searchParams.has('apiKey')) {
            return null;
        }

        // (a) Unit test override
        if (this._authOverride) {
            const user = await this._authOverride(req);
            if (!user || user.IsActive === false) {
                return null;
            }
            return { User: user };
        }

        // (b) Primary browser path: single-use short-TTL `?ticket=<nonce>`
        if (parsedUrl.searchParams.has('ticket')) {
            const rawTicket = parsedUrl.searchParams.get('ticket') ?? '';
            return await this.ConsumeTicket(rawTicket, artifactId);
        }

        // (c) Non-browser / server-to-server HTTP headers ONLY
        const authHeader = req.headers['authorization'];
        const bearerToken =
            typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
                ? authHeader.trim()
                : undefined;

        const rawSystemKey = req.headers['x-mj-api-key'];
        const systemApiKey =
            typeof rawSystemKey === 'string' && rawSystemKey.trim().length > 0
                ? rawSystemKey.trim()
                : undefined;

        const rawUserKey = req.headers['x-mj-user-api-key'] ?? req.headers['x-api-key'];
        const userApiKey =
            typeof rawUserKey === 'string' && rawUserKey.trim().length > 0
                ? rawUserKey.trim()
                : undefined;

        if (!bearerToken && !systemApiKey && !userApiKey) {
            return null;
        }

        let originDomain: string | undefined;
        if (typeof req.headers.origin === 'string' && req.headers.origin.trim().length > 0) {
            try {
                originDomain = new URL(req.headers.origin).hostname || undefined;
            } catch {
                originDomain = undefined;
            }
        }

        try {
            const payload = await getUserPayload(
                bearerToken ?? '',
                'default',
                this._dataSources,
                originDomain,
                systemApiKey,
                userApiKey,
                {
                    endpoint: ARTIFACT_COLLABORATION_WS_PATH,
                    method: req.method || 'GET',
                    ipAddress: req.socket?.remoteAddress,
                    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined
                },
                req
            );
            if (!payload?.userRecord || payload.userRecord.IsActive !== true) {
                return null;
            }
            return {
                User: payload.userRecord,
                ApiKeyHash: payload.apiKeyHash
            };
        } catch {
            return null;
        }
    }

    private async handleAuthenticatedUpgrade(
        req: IncomingMessage,
        socket: Duplex,
        head: Buffer,
        parsedUrl: URL
    ): Promise<void> {
        try {
            const artifactId = (parsedUrl.searchParams.get('artifactId') ?? '').trim();
            if (!artifactId) {
                this.rejectRawUpgrade(socket, 400, 'Bad Request: artifactId is required');
                return;
            }

            const auth = await this.authenticateUpgradeRequest(req, parsedUrl, artifactId);
            if (!auth) {
                this.rejectRawUpgrade(socket, 401, 'Unauthorized');
                return;
            }

            if (auth.ApiKeyHash) {
                const readAllowed = await this.CheckApiKeyScope(
                    auth.ApiKeyHash,
                    'artifact:read',
                    artifactId,
                    auth.User,
                    false
                );
                if (!readAllowed) {
                    this.rejectRawUpgrade(socket, 403, 'Forbidden');
                    return;
                }
            }

            const provider = this.activeProvider();
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                artifactId,
                auth.User
            );
            if (!perms.CanRead) {
                this.rejectRawUpgrade(socket, 403, 'Forbidden');
                return;
            }

            let effectiveCanEdit = perms.CanEdit;
            if (effectiveCanEdit && auth.ApiKeyHash) {
                const editAllowed = await this.CheckApiKeyScope(
                    auth.ApiKeyHash,
                    'artifact:edit',
                    artifactId,
                    auth.User,
                    true
                );
                if (!editAllowed) {
                    effectiveCanEdit = false;
                }
            }

            const roomKey = artifactId.toLowerCase();
            this._pendingUpgradesByArtifact.set(roomKey, (this._pendingUpgradesByArtifact.get(roomKey) ?? 0) + 1);
            try {
                let room: CollaborationRoom | null = null;
                try {
                    room = await this.GetOrCreateRoom(artifactId, auth.User);
                } catch (hydrationErr) {
                    LogError(
                        `ArtifactCollaborationServer failed to hydrate room '${artifactId}': ${
                            hydrationErr instanceof Error ? hydrationErr.message : String(hydrationErr)
                        }`
                    );
                    this.rejectRawUpgrade(socket, 500, 'Internal Server Error');
                    return;
                }

                if (!room) {
                    this.rejectRawUpgrade(socket, 404, 'Not Found');
                    return;
                }

                if (room.IdleDisposeTimer) {
                    clearTimeout(room.IdleDisposeTimer);
                    room.IdleDisposeTimer = null;
                }

                this._wss.handleUpgrade(req, socket, head, (ws) => {
                    this.attachClientToRoom(room!, ws, auth.User, effectiveCanEdit, auth.ApiKeyHash);
                });
            } finally {
                const remaining = (this._pendingUpgradesByArtifact.get(roomKey) ?? 1) - 1;
                if (remaining <= 0) {
                    this._pendingUpgradesByArtifact.delete(roomKey);
                } else {
                    this._pendingUpgradesByArtifact.set(roomKey, remaining);
                }
            }
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.handleAuthenticatedUpgrade failed: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            try {
                socket.destroy();
            } catch {
                // Socket already closed
            }
        }
    }

    private deterministicClientIdFromSeed(seed: string): number {
        const digest = createHash('sha256')
            .update(seed || 'mj-artifact-collaboration-seed', 'utf8')
            .digest();
        const raw = digest.readUInt32BE(0) & 0x7fffffff;
        return raw === 0 ? 1 : raw;
    }

    private async createAndHydrateRoom(artifactId: string, contextUser: UserInfo): Promise<CollaborationRoom> {
        const key = artifactId.trim().toLowerCase();
        const doc = new Y.Doc();
        const awareness = new awarenessProtocol.Awareness(doc);
        // Remove the server Y.Doc's synthetic empty local state so only real connected users appear in awareness
        awareness.setLocalState(null);

        const room: CollaborationRoom = {
            ArtifactID: artifactId,
            DelegateEntityID: null,
            DelegateRecordID: null,
            Doc: doc,
            Awareness: awareness,
            Connections: new Set(),
            DirtyWorkingState: false,
            DirtyVersion: false,
            CompactionRetryCount: 0,
            LastModifiedByUser: contextUser,
            BaseVersionID: null,
            BaseVersionNumber: 0,
            BaseVersionText: '',
            RoomEpoch: `epoch-init-${artifactId}`,
            FlushQueue: Promise.resolve(true),
            WorkingStateTimer: null,
            IdleDisposeTimer: null,
            UnsubscribeRelay: null,
            DocUpdateListener: (update: Uint8Array, origin: unknown) => {
                this.onRoomDocUpdate(room, update, origin);
            },
            AwarenessUpdateListener: (changes, origin) => {
                this.onRoomAwarenessUpdate(room, changes, origin);
            }
        };

        try {
            const { overwriteStaleWorkingState } = await this.hydrateRoomStateFromDatabase(room, contextUser);

            doc.on('update', room.DocUpdateListener);
            awareness.on('update', room.AwarenessUpdateListener);

            room.UnsubscribeRelay = await this._relay.SubscribeRoom(artifactId, async (msg: YjsRelayMessage) => {
                await this.onRelayMessage(room, msg);
            });

            this._rooms.set(key, room);

            if (overwriteStaleWorkingState) {
                await this.FlushWorkingState(room.ArtifactID, contextUser);
                try {
                    const hydratedState = Y.encodeStateAsUpdate(room.Doc);
                    const hydratedHash = this.computeSha256Hex(this.extractRoomSerializedContent(room.Doc));
                    await this._relay.PublishToRoom({
                        ArtifactID: room.ArtifactID,
                        MessageType: 'sync-state',
                        PayloadBase64: JSON.stringify({
                            savedDocUpdateB64: BytesToBase64(hydratedState),
                            savedContentHash: hydratedHash
                        })
                    });
                } catch (hydrateRelayErr) {
                    LogError(
                        `ArtifactCollaborationServer hydrated sync-state relay publish failed for '${room.ArtifactID}': ${
                            hydrateRelayErr instanceof Error
                                ? hydrateRelayErr.message
                                : String(hydrateRelayErr)
                        }`
                    );
                }
            }

            // Broadcast state-vector catch-up request so any peer MJServer replica holding live edits replies with full state
            try {
                const stateVector = Y.encodeStateVector(room.Doc);
                await this._relay.PublishToRoom({
                    ArtifactID: room.ArtifactID,
                    MessageType: 'sync-request',
                    PayloadBase64: BytesToBase64(stateVector)
                });
            } catch (syncReqErr) {
                LogError(
                    `ArtifactCollaborationServer initial sync-request relay publish failed for '${room.ArtifactID}': ${
                        syncReqErr instanceof Error ? syncReqErr.message : String(syncReqErr)
                    }`
                );
            }

            if (room.Connections.size === 0 && !this._shuttingDown) {
                this.scheduleIdleRoomDisposal(room);
            }

            return room;
        } catch (err) {
            this._rooms.delete(key);
            this.teardownRoomResources(room);
            throw err;
        }
    }

    private async hydrateRoomStateFromDatabase(
        room: CollaborationRoom,
        contextUser: UserInfo
    ): Promise<{ overwriteStaleWorkingState: boolean }> {
        const provider = this.activeProvider();
        if (!provider || !contextUser) {
            return { overwriteStaleWorkingState: false };
        }
        const queryUser = UserCache.Instance.GetSystemUser() ?? contextUser;

        try {
            const rv = RunView.FromMetadataProvider(provider);
            const safeId = EscapeSQLString(room.ArtifactID);
            const [workingRes, versionRes, artifactRes] = await rv.RunViews(
                [
                    {
                        EntityName: 'MJ: Artifact Working States',
                        ExtraFilter: `ArtifactID='${safeId}'`,
                        Fields: ['ID', 'ArtifactID', 'YjsState', '__mj_UpdatedAt'],
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    },
                    {
                        EntityName: 'MJ: Artifact Versions',
                        ExtraFilter: `ArtifactID='${safeId}'`,
                        OrderBy: 'VersionNumber DESC',
                        Fields: ['ID', 'VersionNumber', 'Content', 'Configuration', '__mj_CreatedAt', '__mj_UpdatedAt'],
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    },
                    {
                        EntityName: 'MJ: Artifacts',
                        ExtraFilter: `ID='${safeId}'`,
                        Fields: ['ID', 'DelegateEntityID', 'DelegateRecordID'],
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    }
                ],
                queryUser
            );

            if (!workingRes.Success) {
                throw new Error(workingRes.ErrorMessage || 'Failed to query MJ: Artifact Working States');
            }
            if (!versionRes.Success) {
                throw new Error(versionRes.ErrorMessage || 'Failed to query MJ: Artifact Versions');
            }

            if (artifactRes?.Success && artifactRes.Results && artifactRes.Results.length > 0) {
                const artRow = artifactRes.Results[0] as ArtifactDelegateProjection;
                room.DelegateEntityID = artRow.DelegateEntityID ?? null;
                room.DelegateRecordID = artRow.DelegateRecordID ?? null;
            }

            const workingRow = workingRes.Results?.[0] as WorkingStateProjection | undefined;
            const versionRow = versionRes.Results?.[0] as VersionRowProjection | undefined;

            let appliedWorkingState = false;
            let sanitizedLegacyMeta = false;
            if (workingRow?.YjsState) {
                const stateBytes = DecodeWorkingStateBytes(workingRow.YjsState);
                if (stateBytes.byteLength > 0) {
                    // Always apply the persisted Yjs working state first so CRDT item IDs (`clientID, clock`)
                    // are preserved across room disposals and client reconnections (`Blocker 1` & `Blocker 2`).
                    Y.applyUpdate(room.Doc, stateBytes, 'hydrate');
                    appliedWorkingState = true;
                    // Strip any legacy nested `preOutOfBandStateB64` stored in `Y.Map('meta')` so bloated rows shrink (`B2`).
                    if (room.Doc.getMap('meta').has('preOutOfBandStateB64')) {
                        room.Doc.transact(() => {
                            room.Doc.getMap('meta').delete('preOutOfBandStateB64');
                        }, 'hydrate');
                        sanitizedLegacyMeta = true;
                    }
                }
            }

            const metaMap = room.Doc.getMap('meta');
            const rawBaseVersionId = (metaMap.get('baseVersionId') ?? metaMap.get('versionId')) as
                | string
                | undefined;
            const workingVersionId =
                typeof rawBaseVersionId === 'string' && rawBaseVersionId.trim().length > 0
                    ? rawBaseVersionId.trim()
                    : undefined;
            const rawBaseVersionNum = (metaMap.get('baseVersionNumber') ?? metaMap.get('versionNumber')) as
                | number
                | undefined;
            const workingVersionNum =
                typeof rawBaseVersionNum === 'number' ? rawBaseVersionNum : undefined;
            const hasMetaBaseContent = metaMap.has('baseContent');
            const metaBaseContent = hasMetaBaseContent
                ? String(metaMap.get('baseContent') ?? '')
                : undefined;

            const versionCreatedMs = versionRow?.__mj_CreatedAt
                ? new Date(versionRow.__mj_CreatedAt).getTime()
                : NaN;
            const workingUpdatedMs = workingRow?.__mj_UpdatedAt
                ? new Date(workingRow.__mj_UpdatedAt).getTime()
                : NaN;
            const timestampNewer =
                Number.isFinite(versionCreatedMs) &&
                Number.isFinite(workingUpdatedMs) &&
                versionCreatedMs > workingUpdatedMs;
            const versionLineageNewer =
                Boolean(versionRow) &&
                workingVersionId !== undefined &&
                !UUIDsEqual(versionRow!.ID, workingVersionId) &&
                versionRow!.VersionNumber > (workingVersionNum ?? 0) &&
                !(Number.isFinite(versionCreatedMs) && Number.isFinite(workingUpdatedMs) && workingUpdatedMs > versionCreatedMs);

            const yText = room.Doc.getText('content');
            const versionTargetText = versionRow?.Content || versionRow?.Configuration || '';
            const versionNewerThanWorkingState =
                Boolean(versionRow) &&
                Boolean(workingRow?.YjsState) &&
                (workingVersionId
                    ? !UUIDsEqual(workingVersionId, versionRow!.ID)
                    : hasMetaBaseContent
                      ? versionTargetText !== (metaBaseContent ?? '')
                      : timestampNewer || versionLineageNewer);

            let seededOrUpdatedWorkingState = sanitizedLegacyMeta;

            if (!appliedWorkingState && yText.length === 0 && versionTargetText) {
                // Seed inside a deterministic-clientID Y.Doc derived from versionRow.ID (or room.ArtifactID)
                // so multi-instance cold opens produce identical Yjs CRDT item IDs (clientID, clock)
                // and merge without duplicating text (Blocker 2, Path 2).
                const seedDoc = new Y.Doc();
                seedDoc.clientID = this.deterministicClientIdFromSeed(versionRow?.ID || room.ArtifactID);
                const nextEpoch = `epoch-${versionRow?.ID ?? room.ArtifactID}`;
                room.RoomEpoch = nextEpoch;
                seedDoc.transact(() => {
                    seedDoc.getText('content').insert(0, versionTargetText);
                    this.syncSlideDeckStructuresIfPresent(seedDoc, versionTargetText);
                    this.syncSpreadsheetStructuresIfPresent(
                        seedDoc,
                        versionRow?.Content ?? '',
                        versionRow?.Configuration ?? null
                    );
                    const seedMeta = seedDoc.getMap('meta');
                    if (versionRow) {
                        seedMeta.set('versionNumber', versionRow.VersionNumber);
                        seedMeta.set('versionId', versionRow.ID);
                        seedMeta.set('baseVersionNumber', versionRow.VersionNumber);
                        seedMeta.set('baseVersionId', versionRow.ID);
                    }
                    seedMeta.set('baseContent', versionTargetText);
                    seedMeta.set('roomEpoch', nextEpoch);
                }, 'seed');
                const seedBytes = Y.encodeStateAsUpdate(seedDoc);
                seedDoc.destroy();
                Y.applyUpdate(room.Doc, seedBytes, 'hydrate');
                seededOrUpdatedWorkingState = true;
            } else if (!appliedWorkingState && yText.length === 0) {
                const nextEpoch = `epoch-${versionRow?.ID ?? room.ArtifactID}`;
                room.RoomEpoch = nextEpoch;
                room.Doc.transact(() => {
                    const seedMeta = room.Doc.getMap('meta');
                    if (versionRow) {
                        seedMeta.set('versionNumber', versionRow.VersionNumber);
                        seedMeta.set('versionId', versionRow.ID);
                        seedMeta.set('baseVersionNumber', versionRow.VersionNumber);
                        seedMeta.set('baseVersionId', versionRow.ID);
                    }
                    seedMeta.set('baseContent', '');
                    seedMeta.set('roomEpoch', nextEpoch);
                }, 'hydrate');
            } else if (appliedWorkingState && versionNewerThanWorkingState && versionRow) {
                const currentSerialized = this.extractRoomSerializedContent(room.Doc);
                const versionContentHash = this.computeSha256Hex(versionTargetText);
                const trackedHydrate = this.lookupVerifiedCompactedStateVector(
                    room.ArtifactID,
                    versionRow.ID,
                    versionRow.VersionNumber,
                    versionContentHash
                );
                const alreadyContainsVersionOps = Boolean(
                    (trackedHydrate?.SavedStateVectorB64 &&
                        this.DoesDocContainStateVector(
                            room.Doc,
                            Base64ToBytes(trackedHydrate.SavedStateVectorB64)
                        )) ||
                        this.doesDocMetaMatchVersionStateVector(
                            room.Doc,
                            room.ArtifactID,
                            versionRow.ID,
                            versionRow.VersionNumber,
                            versionContentHash
                        )
                );

                let baseVersionText: string | undefined = hasMetaBaseContent ? metaBaseContent : undefined;
                if (
                    baseVersionText === undefined &&
                    !alreadyContainsVersionOps &&
                    (workingVersionId !== undefined ||
                        (typeof workingVersionNum === 'number' && workingVersionNum > 0))
                ) {
                    const baseFilter =
                        workingVersionId !== undefined
                            ? `ID='${EscapeSQLString(workingVersionId)}' AND ArtifactID='${EscapeSQLString(room.ArtifactID)}'`
                            : `ArtifactID='${EscapeSQLString(room.ArtifactID)}' AND VersionNumber=${Math.floor(workingVersionNum!)}`;
                    const baseRes = await rv.RunView<{
                        ID: string;
                        VersionNumber: number;
                        Content?: string | null;
                        Configuration?: string | null;
                    }>(
                        {
                            EntityName: 'MJ: Artifact Versions',
                            ExtraFilter: baseFilter,
                            Fields: ['ID', 'VersionNumber', 'Content', 'Configuration'],
                            MaxRows: 1,
                            SkipTotalRowCount: true,
                            ResultType: 'simple'
                        },
                        queryUser
                    );
                    const baseRow = baseRes.Success ? baseRes.Results?.[0] : undefined;
                    if (
                        baseRow &&
                        ((workingVersionId !== undefined && UUIDsEqual(baseRow.ID, workingVersionId)) ||
                            (typeof workingVersionNum === 'number' && baseRow.VersionNumber === workingVersionNum))
                    ) {
                        baseVersionText = baseRow.Content || baseRow.Configuration || '';
                    }
                }

                room.PreOutOfBandDocState = Y.encodeStateAsUpdate(room.Doc);
                const nextEpoch = `epoch-${versionRow.ID}-${versionRow.VersionNumber}`;
                room.RoomEpoch = nextEpoch;
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    meta.set('roomEpoch', nextEpoch);
                    if (!alreadyContainsVersionOps && currentSerialized !== versionTargetText) {
                        this.applyMinimalTextDiff(yText, yText.toString(), versionTargetText, baseVersionText);
                        const mergeOpts =
                            baseVersionText !== undefined
                                ? { preserveConcurrentAdditions: true, baselineContent: baseVersionText }
                                : undefined;
                        this.syncSlideDeckStructuresIfPresent(room.Doc, versionTargetText, mergeOpts);
                        this.syncSpreadsheetStructuresIfPresent(
                            room.Doc,
                            versionRow.Content ?? '',
                            versionRow.Configuration ?? null,
                            mergeOpts
                        );
                        if (
                            baseVersionText !== undefined &&
                            (room.Doc.getMap('slidesById').size > 0 || room.Doc.getMap('worksheetsById').size > 0)
                        ) {
                            const mergedSerialized = this.extractRoomSerializedContent(room.Doc);
                            this.applyMinimalTextDiff(yText, yText.toString(), mergedSerialized);
                        }
                    }
                    meta.set('versionNumber', versionRow.VersionNumber);
                    meta.set('versionId', versionRow.ID);
                    meta.set('baseVersionNumber', versionRow.VersionNumber);
                    meta.set('baseVersionId', versionRow.ID);
                    meta.set('baseContent', versionTargetText);
                }, 'hydrate');
                if (this.extractRoomSerializedContent(room.Doc) !== versionTargetText) {
                    room.DirtyVersion = true;
                }
                seededOrUpdatedWorkingState = true;
            } else if (versionRow) {
                const existingEpoch = room.Doc.getMap('meta').get('roomEpoch') as string | undefined;
                const nextEpoch = existingEpoch || `epoch-${versionRow.ID}`;
                room.RoomEpoch = nextEpoch;
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    meta.set('versionNumber', versionRow.VersionNumber);
                    meta.set('versionId', versionRow.ID);
                    meta.set('baseVersionNumber', versionRow.VersionNumber);
                    meta.set('baseVersionId', versionRow.ID);
                    meta.set('baseContent', versionTargetText);
                    if (!existingEpoch) {
                        meta.set('roomEpoch', nextEpoch);
                    }
                }, 'hydrate');
            }

            if (versionRow) {
                room.BaseVersionID = versionRow.ID;
                room.BaseVersionNumber = versionRow.VersionNumber;
                room.BaseVersionText = versionTargetText;
            } else {
                room.BaseVersionText = this.extractRoomSerializedContent(room.Doc);
            }

            return { overwriteStaleWorkingState: seededOrUpdatedWorkingState };
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.hydrateRoomStateFromDatabase error on '${room.ArtifactID}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            throw err;
        }
    }

    private attachClientToRoom(
        room: CollaborationRoom,
        ws: WsClient,
        user: UserInfo,
        canEdit: boolean,
        apiKeyHash?: string
    ): void {
        if (room.IdleDisposeTimer) {
            clearTimeout(room.IdleDisposeTimer);
            room.IdleDisposeTimer = null;
        }

        const conn: CollaborationClientConnection = {
            Socket: ws,
            User: user,
            ArtifactID: room.ArtifactID,
            CanEdit: canEdit,
            ApiKeyHash: apiKeyHash,
            ControlledClientIDs: new Set(),
            Alive: true,
            InitialSyncDedupeChecked: false
        };
        room.Connections.add(conn);

        // 1. Send initial permission status frame (including roomEpoch)
        const versionNumber = room.Doc.getMap('meta').get('versionNumber') as number | undefined;
        const roomEpoch = (room.Doc.getMap('meta').get('roomEpoch') as string | undefined) ?? room.RoomEpoch;
        this.sendPermissionStatusFrame(ws, {
            canRead: true,
            canEdit: canEdit,
            versionNumber: versionNumber,
            roomEpoch: roomEpoch
        });

        // 2. Send Yjs Sync Step 1 + Sync Step 2 (full current state so client is immediately synchronized)
        const syncStep1Encoder = encoding.createEncoder();
        encoding.writeVarUint(syncStep1Encoder, YJS_MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(syncStep1Encoder, room.Doc);
        this.sendBinaryFrame(ws, encoding.toUint8Array(syncStep1Encoder));

        const syncStep2Encoder = encoding.createEncoder();
        encoding.writeVarUint(syncStep2Encoder, YJS_MESSAGE_SYNC);
        syncProtocol.writeSyncStep2(syncStep2Encoder, room.Doc);
        this.sendBinaryFrame(ws, encoding.toUint8Array(syncStep2Encoder));

        // 3. Send existing Awareness states if any clients are present
        const awarenessStates = room.Awareness.getStates();
        if (awarenessStates.size > 0) {
            const awarenessEncoder = encoding.createEncoder();
            encoding.writeVarUint(awarenessEncoder, YJS_MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
                awarenessEncoder,
                awarenessProtocol.encodeAwarenessUpdate(room.Awareness, Array.from(awarenessStates.keys()))
            );
            this.sendBinaryFrame(ws, encoding.toUint8Array(awarenessEncoder));
        }

        ws.on('pong', () => {
            conn.Alive = true;
        });

        ws.on('message', (data: RawData) => {
            conn.Alive = true;
            this.onClientMessage(room, conn, data);
        });

        ws.on('close', () => {
            this.onClientDisconnect(room, conn);
        });

        ws.on('error', (err) => {
            LogStatus(`ArtifactCollaborationServer socket error (${room.ArtifactID}): ${err.message}`);
        });
    }

    /**
     * Checks whether a newly reconnecting client's first write frame (`syncStep2` or `update`) is
     * re-sending offline edits that were already committed to the server via REST fallback
     * (`CommitArtifactInlineEdit` / out-of-band `ArtifactVersion` save). If so, suppresses the
     * duplicate update and sends `room-reset` so the client adopts the room's canonical CRDT items (`Blocker 2`).
     */
    private shouldSuppressDuplicateReconnectUpdate(
        room: CollaborationRoom,
        conn: CollaborationClientConnection,
        incomingUpdateBytes: Uint8Array
    ): boolean {
        if (conn.InitialSyncDedupeChecked || incomingUpdateBytes.byteLength === 0) {
            return false;
        }
        conn.InitialSyncDedupeChecked = true;

        const preBytes = room.PreOutOfBandDocState;
        if (!preBytes || preBytes.byteLength === 0) {
            return false;
        }
        try {
            const preDoc = new Y.Doc();
            Y.applyUpdate(preDoc, preBytes);
            const preText = preDoc.getText('content').toString();
            Y.applyUpdate(preDoc, incomingUpdateBytes);
            const clientIntendedText = preDoc.getText('content').toString();
            preDoc.destroy();

            const currentRoomText = room.Doc.getText('content').toString();
            if (clientIntendedText !== preText && clientIntendedText === currentRoomText) {
                const fullStateB64 = BytesToBase64(Y.encodeStateAsUpdate(room.Doc));
                this.sendControlFrame(conn.Socket, {
                    action: 'room-reset',
                    payload: fullStateB64,
                    roomEpoch: room.RoomEpoch,
                    versionId: room.BaseVersionID ?? undefined,
                    versionNumber: room.BaseVersionNumber || undefined
                });
                return true;
            }
        } catch {
            // Fall through and process normally
        }
        return false;
    }

    private onClientMessage(
        room: CollaborationRoom,
        conn: CollaborationClientConnection,
        rawData: RawData
    ): void {
        try {
            const bytes = this.rawDataToUint8Array(rawData);
            if (bytes.byteLength === 0) {
                return;
            }
            const decoder = decoding.createDecoder(bytes);
            const messageType = decoding.readVarUint(decoder);

            switch (messageType) {
                case YJS_MESSAGE_SYNC: {
                    // Peek sync sub-message type before allowing readSyncMessage to mutate room.Doc!
                    const subDecoder = decoding.clone(decoder);
                    const syncMessageType = decoding.readVarUint(subDecoder);
                    const isWriteFrame =
                        syncMessageType === syncProtocol.messageYjsSyncStep2 ||
                        syncMessageType === syncProtocol.messageYjsUpdate;

                    if (isWriteFrame && !conn.CanEdit) {
                        this.sendControlFrame(conn.Socket, {
                            action: 'readonly-rejected',
                            message: 'Write update rejected: connection has read-only access to this artifact.'
                        });
                        return;
                    }

                    if (isWriteFrame) {
                        const incomingUpdateBytes = decoding.readVarUint8Array(subDecoder);
                        if (this.shouldSuppressDuplicateReconnectUpdate(room, conn, incomingUpdateBytes)) {
                            return;
                        }
                        room.LastModifiedByUser = conn.User;
                        room.DirtyWorkingState = true;
                        room.DirtyVersion = true;
                        this.scheduleWorkingStateFlush(room);
                    }

                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
                    syncProtocol.readSyncMessage(decoder, encoder, room.Doc, conn);
                    if (encoding.length(encoder) > 1) {
                        this.sendBinaryFrame(conn.Socket, encoding.toUint8Array(encoder));
                    }
                    break;
                }
                case YJS_MESSAGE_AWARENESS: {
                    const updateBytes = decoding.readVarUint8Array(decoder);
                    this.applyAuthenticatedAwarenessUpdate(room, conn, updateBytes);
                    break;
                }
                case YJS_MESSAGE_CONTROL: {
                    const jsonStr = decoding.readVarString(decoder);
                    const control = JSON.parse(jsonStr) as CollaborationControlFrame;
                    if (control.action === 'save-version') {
                        if (!conn.CanEdit) {
                            this.sendControlFrame(conn.Socket, {
                                action: 'readonly-rejected',
                                message: 'Cannot save version: connection has read-only access.'
                            });
                            return;
                        }
                        void this.CompactRoomToArtifactVersion(room.ArtifactID, conn.User);
                    }
                    break;
                }
                default:
                    break;
            }
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.onClientMessage error in room '${room.ArtifactID}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        }
    }

    /**
     * Enforces per-connection awareness ownership (`C3`):
     * - Rejects awareness entries targeting `room.Awareness.clientID` or any `clientID` already
     *   owned by another active connection in `room.Connections`.
     * - Rejects `null` state removals unless `conn.ControlledClientIDs` already owns `clientID`.
     * - Stamps server-authenticated user identity (`userId`, `userName`, `name`, `email`, `canEdit`)
     *   onto non-null awareness `user` payloads so clients cannot spoof collaborator badges.
     */
    private applyAuthenticatedAwarenessUpdate(
        room: CollaborationRoom,
        conn: CollaborationClientConnection,
        updateBytes: Uint8Array
    ): void {
        if (updateBytes.byteLength === 0) {
            return;
        }
        const decoder = decoding.createDecoder(updateBytes);
        const count = decoding.readVarUint(decoder);
        const accepted: Array<{ clientID: number; clock: number; stateJson: string }> = [];

        for (let i = 0; i < count; i++) {
            const clientID = decoding.readVarUint(decoder);
            const clock = decoding.readVarUint(decoder);
            const rawStateJson = decoding.readVarString(decoder);

            if (clientID === room.Awareness.clientID) {
                continue;
            }

            let ownedByOther = false;
            for (const otherConn of room.Connections) {
                if (otherConn !== conn && otherConn.ControlledClientIDs.has(clientID)) {
                    ownedByOther = true;
                    break;
                }
            }
            if (ownedByOther) {
                continue;
            }

            const parsedState = JSON.parse(rawStateJson) as Record<string, unknown> | null;
            if (parsedState === null) {
                if (!conn.ControlledClientIDs.has(clientID)) {
                    continue;
                }
                accepted.push({ clientID, clock, stateJson: 'null' });
            } else if (typeof parsedState === 'object' && !Array.isArray(parsedState)) {
                const rawUser =
                    parsedState['user'] &&
                    typeof parsedState['user'] === 'object' &&
                    !Array.isArray(parsedState['user'])
                        ? (parsedState['user'] as Record<string, unknown>)
                        : {};
                const verifiedState: Record<string, unknown> = {
                    ...parsedState,
                    user: {
                        ...rawUser,
                        userId: conn.User.ID,
                        userName: conn.User.Name,
                        name: conn.User.Name,
                        email: conn.User.Email || undefined,
                        canEdit: conn.CanEdit
                    }
                };
                conn.ControlledClientIDs.add(clientID);
                accepted.push({
                    clientID,
                    clock,
                    stateJson: JSON.stringify(verifiedState)
                });
            }
        }

        if (accepted.length === 0) {
            return;
        }

        const sanitizedEncoder = encoding.createEncoder();
        encoding.writeVarUint(sanitizedEncoder, accepted.length);
        for (const entry of accepted) {
            encoding.writeVarUint(sanitizedEncoder, entry.clientID);
            encoding.writeVarUint(sanitizedEncoder, entry.clock);
            encoding.writeVarString(sanitizedEncoder, entry.stateJson);
        }

        awarenessProtocol.applyAwarenessUpdate(
            room.Awareness,
            encoding.toUint8Array(sanitizedEncoder),
            conn
        );
    }

    private onRoomDocUpdate(room: CollaborationRoom, update: Uint8Array, origin: unknown): void {
        if (origin === 'hydrate') {
            return;
        }

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        const frame = encoding.toUint8Array(encoder);

        for (const conn of room.Connections) {
            if (conn === origin) {
                continue;
            }
            this.sendBinaryFrame(conn.Socket, frame);
        }

        // Relay across server instances if the update did not arrive from the relay itself
        if (origin !== 'relay' && origin !== 'collab-relay') {
            void this._relay
                .PublishToRoom({
                    ArtifactID: room.ArtifactID,
                    MessageType: 'sync-update',
                    PayloadBase64: BytesToBase64(update)
                })
                .catch((err) => {
                    LogError(
                        `ArtifactCollaborationServer.onRoomDocUpdate relay publish error for '${room.ArtifactID}': ${
                            err instanceof Error ? err.message : String(err)
                        }`
                    );
                });
        }
    }

    private onRoomAwarenessUpdate(
        room: CollaborationRoom,
        changes: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
    ): void {
        const changedClients = changes.added.concat(changes.updated, changes.removed);
        if (changedClients.length === 0) {
            return;
        }

        if (origin && typeof origin === 'object' && 'ControlledClientIDs' in origin) {
            const conn = origin as CollaborationClientConnection;
            for (const clientId of changes.added) {
                conn.ControlledClientIDs.add(clientId);
            }
            for (const clientId of changes.removed) {
                conn.ControlledClientIDs.delete(clientId);
            }
        }

        const updateBytes = awarenessProtocol.encodeAwarenessUpdate(room.Awareness, changedClients);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, YJS_MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, updateBytes);
        const frame = encoding.toUint8Array(encoder);

        for (const conn of room.Connections) {
            this.sendBinaryFrame(conn.Socket, frame);
        }

        if (origin !== 'relay') {
            void this._relay
                .PublishToRoom({
                    ArtifactID: room.ArtifactID,
                    MessageType: 'awareness',
                    PayloadBase64: BytesToBase64(updateBytes)
                })
                .catch((err) => {
                    LogError(
                        `ArtifactCollaborationServer.onRoomAwarenessUpdate relay publish error for '${room.ArtifactID}': ${
                            err instanceof Error ? err.message : String(err)
                        }`
                    );
                });
        }
    }

    private async onRelayMessage(room: CollaborationRoom, msg: YjsRelayMessage): Promise<void> {
        if (msg.MessageType === 'sync-update' && msg.PayloadBase64) {
            const updateBytes = Base64ToBytes(msg.PayloadBase64);
            if (updateBytes.byteLength > 0) {
                Y.applyUpdate(room.Doc, updateBytes, 'relay');
            }
        } else if (msg.MessageType === 'sync-request') {
            // Always broadcast full Y.Doc state (including DeleteSet) + content hash on sync-state
            const fullUpdate = Y.encodeStateAsUpdate(room.Doc);
            if (fullUpdate.byteLength > 0) {
                const currentHash = this.computeSha256Hex(this.extractRoomSerializedContent(room.Doc));
                try {
                    await this._relay.PublishToRoom({
                        ArtifactID: room.ArtifactID,
                        MessageType: 'sync-state',
                        PayloadBase64: JSON.stringify({
                            savedDocUpdateB64: BytesToBase64(fullUpdate),
                            savedContentHash: currentHash
                        })
                    });
                } catch (err) {
                    LogError(
                        `ArtifactCollaborationServer sync-state reply failed for '${room.ArtifactID}': ${
                            err instanceof Error ? err.message : String(err)
                        }`
                    );
                }
            }
        } else if (msg.MessageType === 'sync-state' && msg.PayloadBase64) {
            const parsedSync = this.parseSyncStateRelayPayload(msg.PayloadBase64);
            if (parsedSync.updateBytes.byteLength > 0) {
                Y.applyUpdate(room.Doc, parsedSync.updateBytes, 'collab-relay');
            }
            this.resolvePendingSyncWaiters(room.ArtifactID, true);
        } else if (msg.MessageType === 'awareness' && msg.PayloadBase64) {
            const awarenessBytes = Base64ToBytes(msg.PayloadBase64);
            if (awarenessBytes.byteLength > 0) {
                awarenessProtocol.applyAwarenessUpdate(room.Awareness, awarenessBytes, 'relay');
            }
        } else if (msg.MessageType === 'permission-revoked') {
            await this.ReevaluateRoomPermissions(room.ArtifactID, msg.TargetUserID, false);
        } else if (msg.MessageType === 'version-saved' && typeof msg.VersionNumber === 'number') {
            const relayPayload = this.parseVersionSavedRelayPayload(msg.PayloadBase64);
            let crdtSynced = false;

            if (relayPayload.savedDocUpdateB64) {
                const updateBytes = Base64ToBytes(relayPayload.savedDocUpdateB64);
                if (updateBytes.byteLength > 0) {
                    Y.applyUpdate(room.Doc, updateBytes, 'collab-relay');
                }
                crdtSynced = true;
            } else {
                const missingStateVector = Boolean(
                    relayPayload.savedStateVectorB64 &&
                        !this.DoesDocContainStateVector(
                            room.Doc,
                            Base64ToBytes(relayPayload.savedStateVectorB64)
                        )
                );
                const cleanRoomHashDiffers = Boolean(
                    relayPayload.savedContentHash &&
                        !room.DirtyVersion &&
                        this.computeSha256Hex(this.extractRoomSerializedContent(room.Doc)) !==
                            relayPayload.savedContentHash
                );
                if (missingStateVector || cleanRoomHashDiffers) {
                    const syncWaiter = this.createPendingSyncWaiter(room.ArtifactID, 300);
                    try {
                        await this._relay.PublishToRoom({
                            ArtifactID: room.ArtifactID,
                            MessageType: 'sync-request',
                            PayloadBase64: BytesToBase64(Y.encodeStateVector(room.Doc))
                        });
                    } catch (syncReqErr) {
                        syncWaiter.cancel();
                        LogError(
                            `ArtifactCollaborationServer version-saved sync-request publish failed for '${room.ArtifactID}': ${
                                syncReqErr instanceof Error ? syncReqErr.message : String(syncReqErr)
                            }`
                        );
                    }
                    crdtSynced = await syncWaiter.promise;
                }
            }

            const queryActor = room.LastModifiedByUser ?? UserCache.Instance.GetSystemUser();
            if (msg.VersionID && !UUIDsEqual(msg.VersionID, room.BaseVersionID) && queryActor) {
                await this.checkAndReconcileLatestDatabaseVersion(room, queryActor, {
                    originServerId: msg.OriginInstanceID,
                    relayVersionId: msg.VersionID,
                    savedStateVectorB64: relayPayload.savedStateVectorB64,
                    savedContentHash: relayPayload.savedContentHash,
                    crdtSynced
                });
            } else {
                room.DirtyVersion = false;
                this.broadcastControlFrame(room, {
                    action: 'version-saved',
                    versionId: msg.VersionID,
                    versionNumber: msg.VersionNumber,
                    roomEpoch: room.RoomEpoch
                });
            }
        }
    }

    private clearControlledAwarenessStates(
        room: CollaborationRoom,
        conn: CollaborationClientConnection
    ): void {
        if (conn.ControlledClientIDs.size > 0) {
            awarenessProtocol.removeAwarenessStates(
                room.Awareness,
                Array.from(conn.ControlledClientIDs),
                null
            );
            conn.ControlledClientIDs.clear();
        }
    }

    private onClientDisconnect(room: CollaborationRoom, conn: CollaborationClientConnection): void {
        if (!room.Connections.has(conn)) {
            return;
        }
        room.Connections.delete(conn);
        this.clearControlledAwarenessStates(room, conn);

        if (room.Connections.size === 0) {
            this.handleRoomBecameEmpty(room, conn.User);
        }
    }

    private handleRoomBecameEmpty(room: CollaborationRoom, fallbackUser: UserInfo): void {
        if (room.DirtyWorkingState || room.DirtyVersion) {
            const actor = room.LastModifiedByUser ?? fallbackUser;
            void this.CompactRoomToArtifactVersion(room.ArtifactID, actor).finally(() => {
                if (room.Connections.size === 0 && !this._shuttingDown) {
                    this.scheduleIdleRoomDisposal(room);
                }
            });
        } else if (!this._shuttingDown) {
            this.scheduleIdleRoomDisposal(room);
        }
    }

    private scheduleIdleRoomDisposal(room: CollaborationRoom): void {
        if (room.IdleDisposeTimer) {
            clearTimeout(room.IdleDisposeTimer);
            room.IdleDisposeTimer = null;
        }
        room.IdleDisposeTimer = setTimeout(() => {
            room.IdleDisposeTimer = null;
            void this.disposeRoomIfIdle(room);
        }, this._idleRoomTtlMs);
        (room.IdleDisposeTimer as { unref?: () => void }).unref?.();
    }

    private async disposeRoomIfIdle(room: CollaborationRoom): Promise<void> {
        const key = room.ArtifactID.trim().toLowerCase();
        if (
            this._shuttingDown ||
            room.Connections.size > 0 ||
            (this._pendingUpgradesByArtifact.get(key) ?? 0) > 0
        ) {
            return;
        }
        if (this._rooms.get(key) !== room) {
            return;
        }

        if (room.DirtyWorkingState || room.DirtyVersion) {
            const actor = room.LastModifiedByUser ?? UserCache.Instance.GetSystemUser();
            if (actor) {
                if (room.DirtyVersion) {
                    await this.CompactRoomToArtifactVersion(room.ArtifactID, actor);
                } else {
                    await this.FlushWorkingState(room.ArtifactID, actor);
                }
            }
            if (room.Connections.size > 0 || (this._pendingUpgradesByArtifact.get(key) ?? 0) > 0) {
                return;
            }
            if (room.DirtyWorkingState || room.DirtyVersion) {
                room.CompactionRetryCount += 1;
                if (room.CompactionRetryCount < MAX_IDLE_FLUSH_RETRIES && !this._shuttingDown) {
                    this.scheduleIdleRoomDisposal(room);
                    return;
                }
                // Retain the dirty room in memory rather than evicting unpersisted user edits (Item 8),
                // while stopping background retry timers until the next connection or shutdown.
                LogError(
                    `ArtifactCollaborationServer.disposeRoomIfIdle retaining dirty room '${room.ArtifactID}' in memory after ${room.CompactionRetryCount} failed flush/compaction attempts.`
                );
                return;
            }
        }

        if (room.Connections.size > 0 || (this._pendingUpgradesByArtifact.get(key) ?? 0) > 0) {
            return;
        }

        this._rooms.delete(key);
        this.teardownRoomResources(room);
    }

    private teardownRoomResources(room: CollaborationRoom): void {
        room.PreOutOfBandDocState = null;
        if (room.IdleDisposeTimer) {
            clearTimeout(room.IdleDisposeTimer);
            room.IdleDisposeTimer = null;
        }
        if (room.WorkingStateTimer) {
            clearTimeout(room.WorkingStateTimer);
            room.WorkingStateTimer = null;
        }
        if (room.UnsubscribeRelay) {
            try {
                room.UnsubscribeRelay();
            } catch {
                // Ignore relay unsubscribe error
            }
            room.UnsubscribeRelay = null;
        }
        try {
            room.Awareness.off('update', room.AwarenessUpdateListener);
            room.Awareness.destroy();
        } catch {
            // Ignore awareness destroy error
        }
        try {
            room.Doc.off('update', room.DocUpdateListener);
            room.Doc.destroy();
        } catch {
            // Ignore doc destroy error
        }
    }

    private scheduleWorkingStateFlush(room: CollaborationRoom): void {
        if (room.WorkingStateTimer) {
            return;
        }
        room.WorkingStateTimer = setTimeout(() => {
            room.WorkingStateTimer = null;
            if (room.DirtyWorkingState && room.LastModifiedByUser) {
                void this.FlushWorkingState(room.ArtifactID, room.LastModifiedByUser);
            }
        }, WORKING_STATE_FLUSH_DEBOUNCE_MS);
        (room.WorkingStateTimer as { unref?: () => void }).unref?.();
    }

    private sendPermissionStatusFrame(ws: WsClient, status: CollaborationPermissionStatusFrame): void {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, YJS_MESSAGE_PERMISSION_STATUS);
        encoding.writeVarString(encoder, JSON.stringify(status));
        this.sendBinaryFrame(ws, encoding.toUint8Array(encoder));
    }

    private sendControlFrame(ws: WsClient, control: CollaborationControlFrame): void {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, YJS_MESSAGE_CONTROL);
        encoding.writeVarString(encoder, JSON.stringify(control));
        this.sendBinaryFrame(ws, encoding.toUint8Array(encoder));
    }

    private broadcastControlFrame(room: CollaborationRoom, control: CollaborationControlFrame): void {
        for (const conn of room.Connections) {
            this.sendControlFrame(conn.Socket, control);
        }
    }

    private sendBinaryFrame(ws: WsClient, frame: Uint8Array): void {
        if (ws.readyState === WsClient.OPEN) {
            ws.send(frame);
        }
    }

    private rawDataToUint8Array(rawData: RawData): Uint8Array {
        if (rawData instanceof Uint8Array) {
            return rawData;
        }
        if (rawData instanceof ArrayBuffer) {
            return new Uint8Array(rawData);
        }
        if (Array.isArray(rawData)) {
            return new Uint8Array(Buffer.concat(rawData));
        }
        return new Uint8Array(rawData as Buffer);
    }

    /**
     * Performs a 3-way logical-line merge of concurrent `liveDocText` (human) and `incomingText`
     * (agent / out-of-band DB version) against `baseText` (`R6-4`, `R6-7`).
     *
     * Tokenizes into newline-terminated logical lines (`[^\n]*\n|[^\n]+`, with zero phantom trailing
     * `''` anchor) and aligns by line body so pure human insertions at the start or end of a 1-line
     * document (with or without a trailing `\n`) and human edits overlapping full agent rewrites
     * survive cleanly without resurrecting stale `baseText` lines.
     */
    public MergeConcurrentDocumentEdits(
        baseText: string,
        liveDocText: string,
        incomingText: string
    ): string {
        if (liveDocText === baseText) {
            return incomingText;
        }
        if (incomingText === baseText) {
            return liveDocText;
        }
        if (liveDocText === incomingText) {
            return incomingText;
        }

        const baseTokens = this.tokenizeLogicalLines(baseText);
        const liveTokens = this.tokenizeLogicalLines(liveDocText);
        const incomingTokens = this.tokenizeLogicalLines(incomingText);

        const baseBodies = baseTokens.map((t) => t.body);
        const liveBodies = liveTokens.map((t) => t.body);
        const incomingBodies = incomingTokens.map((t) => t.body);

        const humanHunks = this.computeLineReplacementHunks(baseBodies, liveBodies);
        const agentHunks = this.computeLineReplacementHunks(baseBodies, incomingBodies);

        const emitted: string[] = [];
        const emitLine = (raw: string): void => {
            if (emitted.length > 0 && !emitted[emitted.length - 1].endsWith('\n')) {
                emitted[emitted.length - 1] += '\n';
            }
            emitted.push(raw);
        };

        let basePos = 0;
        let hi = 0;
        let ai = 0;
        let liveDelta = 0;
        let agentDelta = 0;

        while (basePos < baseTokens.length || hi < humanHunks.length || ai < agentHunks.length) {
            const hCur = hi < humanHunks.length ? humanHunks[hi] : undefined;
            const aCur = ai < agentHunks.length ? agentHunks[ai] : undefined;

            const hIsPureAtPos = Boolean(hCur && hCur.oldStart === basePos && hCur.oldEnd === basePos);
            const aIsPureAtPos = Boolean(aCur && aCur.oldStart === basePos && aCur.oldEnd === basePos);

            if (hIsPureAtPos && aIsPureAtPos && hCur && aCur) {
                const hIns = liveTokens.slice(hCur.newStart, hCur.newEnd);
                const aIns = incomingTokens.slice(aCur.newStart, aCur.newEnd);
                let prefixMatch = 0;
                while (
                    prefixMatch < aIns.length &&
                    prefixMatch < hIns.length &&
                    aIns[prefixMatch].body === hIns[prefixMatch].body
                ) {
                    prefixMatch++;
                }
                let suffixMatch = 0;
                while (
                    suffixMatch < aIns.length - prefixMatch &&
                    suffixMatch < hIns.length - prefixMatch &&
                    aIns[aIns.length - 1 - suffixMatch].body ===
                        hIns[hIns.length - 1 - suffixMatch].body
                ) {
                    suffixMatch++;
                }
                for (const tok of hIns) {
                    emitLine(tok.raw);
                }
                for (let k = prefixMatch; k < aIns.length - suffixMatch; k++) {
                    emitLine(aIns[k].raw);
                }
                liveDelta += hCur.newEnd - hCur.newStart;
                agentDelta += aCur.newEnd - aCur.newStart;
                hi++;
                ai++;
                continue;
            }

            if (hIsPureAtPos && hCur) {
                for (let k = hCur.newStart; k < hCur.newEnd; k++) {
                    emitLine(liveTokens[k].raw);
                }
                liveDelta += hCur.newEnd - hCur.newStart;
                hi++;
                continue;
            }

            if (aIsPureAtPos && aCur) {
                for (let k = aCur.newStart; k < aCur.newEnd; k++) {
                    emitLine(incomingTokens[k].raw);
                }
                agentDelta += aCur.newEnd - aCur.newStart;
                ai++;
                continue;
            }

            const hStarts = Boolean(hCur && hCur.oldStart === basePos);
            const aStarts = Boolean(aCur && aCur.oldStart === basePos);

            if (!hStarts && !aStarts) {
                if (basePos >= baseTokens.length) {
                    break;
                }
                const baseTok = baseTokens[basePos];
                const alignedLive = liveTokens[basePos + liveDelta];
                const alignedIncoming = incomingTokens[basePos + agentDelta];
                let chosenRaw = baseTok.raw;
                if (baseTok.eol === '') {
                    if (alignedIncoming?.eol) {
                        chosenRaw = baseTok.body + alignedIncoming.eol;
                    } else if (alignedLive?.eol) {
                        chosenRaw = baseTok.body + alignedLive.eol;
                    }
                }
                emitLine(chosenRaw);
                basePos++;
                continue;
            }

            const clusterStart = basePos;
            let clusterEnd = Math.max(
                hStarts && hCur ? hCur.oldEnd : basePos,
                aStarts && aCur ? aCur.oldEnd : basePos
            );
            let hEndIdx = hi;
            let aEndIdx = ai;
            let expanded = true;
            while (expanded) {
                expanded = false;
                while (
                    hEndIdx < humanHunks.length &&
                    humanHunks[hEndIdx].oldStart < clusterEnd
                ) {
                    if (humanHunks[hEndIdx].oldEnd > clusterEnd) {
                        clusterEnd = humanHunks[hEndIdx].oldEnd;
                        expanded = true;
                    }
                    hEndIdx++;
                }
                while (
                    aEndIdx < agentHunks.length &&
                    agentHunks[aEndIdx].oldStart < clusterEnd
                ) {
                    if (agentHunks[aEndIdx].oldEnd > clusterEnd) {
                        clusterEnd = agentHunks[aEndIdx].oldEnd;
                        expanded = true;
                    }
                    aEndIdx++;
                }
            }

            const clusterH = humanHunks.slice(hi, hEndIdx);
            const clusterA = agentHunks.slice(ai, aEndIdx);

            const applyClusterHunks = (
                hunks: Array<{ oldStart: number; oldEnd: number; newStart: number; newEnd: number }>,
                sourceTokens: Array<{ raw: string; body: string; eol: string }>,
                fallbackTokens: Array<{ raw: string; body: string; eol: string }>
            ): Array<{ raw: string; body: string; eol: string }> => {
                const out: Array<{ raw: string; body: string; eol: string }> = [];
                let p = clusterStart;
                let idx = 0;
                while (p < clusterEnd || idx < hunks.length) {
                    const hk = idx < hunks.length ? hunks[idx] : undefined;
                    if (hk && hk.oldStart === p) {
                        for (let k = hk.newStart; k < hk.newEnd; k++) {
                            out.push(sourceTokens[k]);
                        }
                        p = hk.oldEnd;
                        idx++;
                    } else if (p < clusterEnd) {
                        out.push(fallbackTokens[p - clusterStart]);
                        p++;
                    } else {
                        break;
                    }
                }
                return out;
            };

            const baseClusterSlice = baseTokens.slice(clusterStart, clusterEnd);
            const humanClusterTokens = applyClusterHunks(clusterH, liveTokens, baseClusterSlice);
            const agentClusterTokens = applyClusterHunks(clusterA, incomingTokens, baseClusterSlice);

            if (clusterA.length === 0) {
                for (const tok of humanClusterTokens) {
                    emitLine(tok.raw);
                }
            } else if (clusterH.length === 0) {
                for (const tok of agentClusterTokens) {
                    emitLine(tok.raw);
                }
            } else {
                const humanJoined = humanClusterTokens.map((t) => t.raw).join('');
                const agentJoined = agentClusterTokens.map((t) => t.raw).join('');
                const clusterSpan = clusterEnd - clusterStart;
                const humanTouchedSpan = clusterH.reduce(
                    (acc, hk) => acc + (hk.oldEnd - hk.oldStart),
                    0
                );

                if (humanJoined === agentJoined) {
                    for (const tok of humanClusterTokens) {
                        emitLine(tok.raw);
                    }
                } else if (
                    clusterA.length === 1 &&
                    clusterA[0].oldStart === clusterStart &&
                    clusterA[0].oldEnd === clusterEnd &&
                    agentClusterTokens.length === clusterSpan &&
                    humanTouchedSpan < clusterSpan
                ) {
                    // 1:1 line-preserving agent rewrite (e.g. R2): rebase human's hunks positionally
                    // onto `agentClusterTokens` so human edits survive in place and zero base lines revive.
                    const rebased = applyClusterHunks(clusterH, liveTokens, agentClusterTokens);
                    for (const tok of rebased) {
                        emitLine(tok.raw);
                    }
                } else if (clusterSpan < baseTokens.length && humanTouchedSpan === clusterSpan) {
                    // Localized conflict on the same line/sub-span of a larger doc: keep human's edit.
                    for (const tok of humanClusterTokens) {
                        emitLine(tok.raw);
                    }
                } else {
                    // Whole-doc or line-count-changing rewrite overlapping human edits: emit agent's
                    // replacement and preserve any non-blank human-authored lines not in base or agent.
                    for (const tok of agentClusterTokens) {
                        emitLine(tok.raw);
                    }
                    const baseBodySet = new Set(baseClusterSlice.map((t) => t.body));
                    const agentBodySet = new Set(agentClusterTokens.map((t) => t.body));
                    for (const hk of clusterH) {
                        for (let k = hk.newStart; k < hk.newEnd; k++) {
                            const hTok = liveTokens[k];
                            if (
                                hTok.body.trim().length > 0 &&
                                !baseBodySet.has(hTok.body) &&
                                !agentBodySet.has(hTok.body)
                            ) {
                                emitLine(hTok.raw);
                                agentBodySet.add(hTok.body);
                            }
                        }
                    }
                }
            }

            for (const hk of clusterH) {
                liveDelta += hk.newEnd - hk.newStart - (hk.oldEnd - hk.oldStart);
            }
            for (const ak of clusterA) {
                agentDelta += ak.newEnd - ak.newStart - (ak.oldEnd - ak.oldStart);
            }
            hi = hEndIdx;
            ai = aEndIdx;
            basePos = clusterEnd;
        }

        return emitted.join('');
    }

    /**
     * Transitions `yText` from `currentText` (`yText.toString()`) to `targetText` (or the 3-way merged
     * result when `baselineText` is provided) using minimal prefix/suffix/hunk Yjs CRDT operations so
     * untouched paragraphs retain their Yjs item IDs (`clientID, clock`) (`Blocker 1`, `Blocker 2`, `R6-4`).
     */
    private applyMinimalTextDiff(
        yText: Y.Text,
        currentText: string,
        targetText: string,
        baselineText?: string
    ): void {
        const resolvedTarget =
            typeof baselineText === 'string'
                ? this.MergeConcurrentDocumentEdits(baselineText, currentText, targetText)
                : targetText;
        if (currentText === resolvedTarget) {
            return;
        }

        const oldLines = this.splitTextIntoLineTokens(currentText);
        const newLines = this.splitTextIntoLineTokens(resolvedTarget);
        const hunks = this.computeLineReplacementHunks(oldLines, newLines);
        if (hunks.length === 0) {
            return;
        }

        const oldLineOffsets: number[] = new Array<number>(oldLines.length + 1);
        oldLineOffsets[0] = 0;
        for (let i = 0; i < oldLines.length; i++) {
            oldLineOffsets[i + 1] = oldLineOffsets[i] + oldLines[i].length;
        }

        for (let h = hunks.length - 1; h >= 0; h--) {
            const hunk = hunks[h];
            const startOffset = oldLineOffsets[hunk.oldStart];
            const oldSlice = oldLines.slice(hunk.oldStart, hunk.oldEnd).join('');
            const newSlice = newLines.slice(hunk.newStart, hunk.newEnd).join('');
            const refined = this.refineCharSplice(startOffset, oldSlice, newSlice);
            if (refined.deleteCount > 0) {
                yText.delete(refined.start, refined.deleteCount);
            }
            if (refined.insertText.length > 0) {
                yText.insert(refined.start, refined.insertText);
            }
        }
    }

    private tokenizeLogicalLines(text: string): Array<{ raw: string; body: string; eol: string }> {
        const rawLines = this.splitTextIntoLineTokens(text);
        return rawLines.map((raw) => {
            if (raw.endsWith('\r\n')) {
                return { raw, body: raw.slice(0, -2), eol: '\r\n' };
            }
            if (raw.endsWith('\n')) {
                return { raw, body: raw.slice(0, -1), eol: '\n' };
            }
            return { raw, body: raw, eol: '' };
        });
    }

    private splitTextIntoLineTokens(text: string): string[] {
        if (!text) {
            return [];
        }
        const out: string[] = [];
        let start = 0;
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '\n') {
                out.push(text.slice(start, i + 1));
                start = i + 1;
            }
        }
        if (start < text.length) {
            out.push(text.slice(start));
        }
        return out;
    }

    private refineCharSplice(
        baseOffset: number,
        oldSlice: string,
        newSlice: string
    ): { start: number; deleteCount: number; insertText: string } {
        let prefix = 0;
        const minLen = Math.min(oldSlice.length, newSlice.length);
        while (prefix < minLen && oldSlice.charCodeAt(prefix) === newSlice.charCodeAt(prefix)) {
            prefix++;
        }
        let suffix = 0;
        const maxSuffix = minLen - prefix;
        while (
            suffix < maxSuffix &&
            oldSlice.charCodeAt(oldSlice.length - 1 - suffix) ===
                newSlice.charCodeAt(newSlice.length - 1 - suffix)
        ) {
            suffix++;
        }
        return {
            start: baseOffset + prefix,
            deleteCount: oldSlice.length - prefix - suffix,
            insertText: newSlice.slice(prefix, newSlice.length - suffix)
        };
    }

    private computeLineReplacementHunks(
        oldLines: string[],
        newLines: string[]
    ): Array<{ oldStart: number; oldEnd: number; newStart: number; newEnd: number }> {
        let prefix = 0;
        const minLen = Math.min(oldLines.length, newLines.length);
        while (prefix < minLen && oldLines[prefix] === newLines[prefix]) {
            prefix++;
        }
        let suffix = 0;
        const maxSuffix = minLen - prefix;
        while (
            suffix < maxSuffix &&
            oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
        ) {
            suffix++;
        }

        const oldMid = oldLines.slice(prefix, oldLines.length - suffix);
        const newMid = newLines.slice(prefix, newLines.length - suffix);
        if (oldMid.length === 0 && newMid.length === 0) {
            return [];
        }
        if (oldMid.length === 0 || newMid.length === 0) {
            return [
                {
                    oldStart: prefix,
                    oldEnd: oldLines.length - suffix,
                    newStart: prefix,
                    newEnd: newLines.length - suffix
                }
            ];
        }

        const n = oldMid.length;
        const m = newMid.length;
        const maxD = Math.min(n + m, 2048);
        const offset = n + m;
        const vSize = 2 * offset + 1;
        const v = new Int32Array(vSize).fill(-1);
        v[offset + 1] = 0;
        const trace: Int32Array[] = [];
        let reached = false;

        for (let d = 0; d <= maxD; d++) {
            const vSnap = new Int32Array(vSize).fill(-1);
            for (let k = -d; k <= d; k += 2) {
                const idx = offset + k;
                let x: number;
                if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) {
                    x = v[idx + 1];
                } else {
                    x = v[idx - 1] + 1;
                }
                if (x < 0) {
                    continue;
                }
                let y = x - k;
                while (x < n && y < m && oldMid[x] === newMid[y]) {
                    x++;
                    y++;
                }
                v[idx] = x;
                vSnap[idx] = x;
                if (x >= n && y >= m) {
                    reached = true;
                    break;
                }
            }
            trace.push(vSnap);
            if (reached) {
                break;
            }
        }

        if (!reached) {
            return [
                {
                    oldStart: prefix,
                    oldEnd: oldLines.length - suffix,
                    newStart: prefix,
                    newEnd: newLines.length - suffix
                }
            ];
        }

        // Backtrack Myers trace into matched line pairs
        const matches: Array<{ oldIdx: number; newIdx: number }> = [];
        let cx = n;
        let cy = m;
        for (let d = trace.length - 1; d > 0; d--) {
            const k = cx - cy;
            const prevV = trace[d - 1];
            const prevIdx = offset + k;
            let prevK: number;
            if (k === -d || (k !== d && prevV[prevIdx - 1] < prevV[prevIdx + 1])) {
                prevK = k + 1;
            } else {
                prevK = k - 1;
            }
            const prevX = prevV[offset + prevK];
            const prevY = prevX - prevK;
            while (cx > prevX && cy > prevY) {
                cx--;
                cy--;
                matches.push({ oldIdx: prefix + cx, newIdx: prefix + cy });
            }
            cx = prevX;
            cy = prevY;
        }
        while (cx > 0 && cy > 0) {
            cx--;
            cy--;
            matches.push({ oldIdx: prefix + cx, newIdx: prefix + cy });
        }
        matches.reverse();

        const hunks: Array<{ oldStart: number; oldEnd: number; newStart: number; newEnd: number }> = [];
        let curOld = prefix;
        let curNew = prefix;
        for (const match of matches) {
            if (curOld < match.oldIdx || curNew < match.newIdx) {
                hunks.push({
                    oldStart: curOld,
                    oldEnd: match.oldIdx,
                    newStart: curNew,
                    newEnd: match.newIdx
                });
            }
            curOld = match.oldIdx + 1;
            curNew = match.newIdx + 1;
        }
        const endOld = oldLines.length - suffix;
        const endNew = newLines.length - suffix;
        if (curOld < endOld || curNew < endNew) {
            hunks.push({
                oldStart: curOld,
                oldEnd: endOld,
                newStart: curNew,
                newEnd: endNew
            });
        }
        return hunks;
    }

    /**
     * When `rawContent` represents a serialized {@link SlideDeckSpec} (`Presentation` artifact),
     * populates `doc.getMap('deckMeta')`, `doc.getMap('slidesById')`, and `doc.getArray('slideOrder')`
     * so concurrent per-slide edits and slide reorders merge cleanly across Yjs CRDT maps/arrays (`§ 5.1`, `Accept #1`).
     */
    private syncSlideDeckStructuresIfPresent(
        doc: Y.Doc,
        rawContent: string,
        options?: { preserveConcurrentAdditions?: boolean; baselineContent?: string }
    ): void {
        const trimmed = (rawContent ?? '').trim();
        if (!trimmed.startsWith('{')) {
            return;
        }
        try {
            const parsed = JSON.parse(trimmed) as Partial<SlideDeckSpec>;
            if (!parsed || !Array.isArray(parsed.Slides) || parsed.Slides.length === 0 || !parsed.Theme) {
                return;
            }
            const deck = SlideDeckEngine.Instance.ParseDeckSpec(trimmed);
            const deckMeta = doc.getMap<string>('deckMeta');
            const slidesById = doc.getMap<string>('slidesById');
            const slideOrder = doc.getArray<string>('slideOrder');

            let baselineSlideIds: Set<string> | null = null;
            if (options?.baselineContent && options.baselineContent.trim().startsWith('{')) {
                try {
                    const baseDeck = SlideDeckEngine.Instance.ParseDeckSpec(options.baselineContent.trim());
                    baselineSlideIds = new Set(baseDeck.Slides.map((s) => s.SlideID));
                } catch {
                    baselineSlideIds = null;
                }
            }

            const nextDeckId = deck.DeckID || 'deck-1';
            const nextTitle = deck.Title || 'Presentation';
            const nextSubtitle = deck.Subtitle || '';
            const nextAspectRatio = deck.AspectRatio === '4:3' ? '4:3' : '16:9';
            const nextThemeJson = JSON.stringify(deck.Theme);
            const nextMasterJson = JSON.stringify(deck.Master);

            if (deckMeta.get('DeckID') !== nextDeckId) {
                deckMeta.set('DeckID', nextDeckId);
            }
            if (deckMeta.get('Title') !== nextTitle) {
                deckMeta.set('Title', nextTitle);
            }
            if (deckMeta.get('Subtitle') !== nextSubtitle) {
                deckMeta.set('Subtitle', nextSubtitle);
            }
            if (deckMeta.get('AspectRatio') !== nextAspectRatio) {
                deckMeta.set('AspectRatio', nextAspectRatio);
            }
            if (deckMeta.get('Theme') !== nextThemeJson) {
                deckMeta.set('Theme', nextThemeJson);
            }
            if (deckMeta.get('Master') !== nextMasterJson) {
                deckMeta.set('Master', nextMasterJson);
            }

            const nextIds = new Set<string>();
            for (const slide of deck.Slides) {
                nextIds.add(slide.SlideID);
                const slideJson = JSON.stringify(slide);
                if (slidesById.get(slide.SlideID) !== slideJson) {
                    slidesById.set(slide.SlideID, slideJson);
                }
            }

            const preservedConcurrentSlideIds = new Set<string>();
            for (const existingKey of Array.from(slidesById.keys())) {
                if (!nextIds.has(existingKey)) {
                    const wasDeletedFromBaseline = baselineSlideIds ? baselineSlideIds.has(existingKey) : false;
                    if (options?.preserveConcurrentAdditions && !wasDeletedFromBaseline) {
                        preservedConcurrentSlideIds.add(existingKey);
                    } else {
                        slidesById.delete(existingKey);
                    }
                }
            }

            const currentOrder = slideOrder.toArray();
            const targetOrder = deck.Slides.map((s) => s.SlideID);
            if (preservedConcurrentSlideIds.size > 0) {
                for (const id of currentOrder) {
                    if (preservedConcurrentSlideIds.has(id) && !targetOrder.includes(id)) {
                        targetOrder.push(id);
                    }
                }
                for (const id of preservedConcurrentSlideIds) {
                    if (!targetOrder.includes(id)) {
                        targetOrder.push(id);
                    }
                }
            }
            if (
                currentOrder.length !== targetOrder.length ||
                currentOrder.some((id, idx) => id !== targetOrder[idx])
            ) {
                if (slideOrder.length > 0) {
                    slideOrder.delete(0, slideOrder.length);
                }
                slideOrder.insert(0, targetOrder);
            }
        } catch {
            // Non-SlideDeck JSON content — keep Y.Text('content') only
        }
    }

    /**
     * When `rawContent` or `rawConfiguration` represents a serialized {@link WorkbookSpec} (`Excel Spreadsheet`),
     * populates `doc.getMap('workbookMeta')`, `doc.getArray('sheetOrder')`, `doc.getMap('worksheetsById')`,
     * and `doc.getMap('sheetCellsByCoord')` (keyed by `<SheetID>::<RowID>::<ColumnID>`) so concurrent
     * cell edits, row/column insertions, and formula edits merge without conflicts (`§ 6.2`, `Accept #1`).
     */
    private syncSpreadsheetStructuresIfPresent(
        doc: Y.Doc,
        rawContent: string,
        rawConfiguration?: string | null,
        options?: { preserveConcurrentAdditions?: boolean; baselineContent?: string }
    ): void {
        const candidate = (rawConfiguration || rawContent || '').trim();
        if (!candidate) return;
        const looksLikeJsonWorkbook =
            candidate.startsWith('{') && candidate.includes('"Worksheets"');
        const looksLikeXlsx = candidate.startsWith('data:') || candidate.startsWith('UEsDB');
        if (!looksLikeJsonWorkbook && !looksLikeXlsx) {
            return;
        }
        try {
            const wb = SpreadsheetEngine.Instance.ParseWorkbook(rawContent, rawConfiguration);
            if (!wb || !Array.isArray(wb.Worksheets) || wb.Worksheets.length === 0) {
                return;
            }
            const workbookMeta = doc.getMap<string>('workbookMeta');
            const sheetOrder = doc.getArray<string>('sheetOrder');
            const worksheetsById = doc.getMap<string>('worksheetsById');
            const sheetCellsByCoord = doc.getMap<string>('sheetCellsByCoord');

            let baselineSheetIds: Set<string> | null = null;
            let baselineCoordKeys: Set<string> | null = null;
            const baselineRowIdsBySheet = new Map<string, Set<string>>();
            const baselineColIdsBySheet = new Map<string, Set<string>>();
            if (options?.baselineContent && options.baselineContent.trim().length > 0) {
                try {
                    const baseWb = SpreadsheetEngine.Instance.ParseWorkbook(options.baselineContent);
                    if (baseWb && Array.isArray(baseWb.Worksheets)) {
                        baselineSheetIds = new Set<string>();
                        baselineCoordKeys = new Set<string>();
                        for (const bws of baseWb.Worksheets) {
                            baselineSheetIds.add(bws.SheetID);
                            baselineRowIdsBySheet.set(bws.SheetID, new Set(bws.Rows.map((r) => r.RowID)));
                            baselineColIdsBySheet.set(bws.SheetID, new Set(bws.Columns.map((c) => c.ColumnID)));
                            for (const cell of Object.values(bws.Cells ?? {})) {
                                baselineCoordKeys.add(`${bws.SheetID}::${cell.RowID}::${cell.ColumnID}`);
                            }
                        }
                    }
                } catch {
                    baselineSheetIds = null;
                    baselineCoordKeys = null;
                }
            }

            if (workbookMeta.get('WorkbookID') !== wb.WorkbookID) {
                workbookMeta.set('WorkbookID', wb.WorkbookID);
            }
            if (workbookMeta.get('Title') !== wb.Title) {
                workbookMeta.set('Title', wb.Title);
            }
            if (workbookMeta.get('ActiveSheetID') !== wb.ActiveSheetID) {
                workbookMeta.set('ActiveSheetID', wb.ActiveSheetID);
            }
            const namedRangesJson = JSON.stringify(wb.NamedRanges ?? []);
            if (workbookMeta.get('NamedRanges') !== namedRangesJson) {
                workbookMeta.set('NamedRanges', namedRangesJson);
            }

            const validSheetIds = new Set<string>();
            const validCellCoordKeys = new Set<string>();

            for (const ws of wb.Worksheets) {
                validSheetIds.add(ws.SheetID);
                let mergedRows = ws.Rows;
                let mergedCols = ws.Columns;

                if (options?.preserveConcurrentAdditions) {
                    const existingSheetRaw = worksheetsById.get(ws.SheetID);
                    if (existingSheetRaw) {
                        try {
                            const existingSheet = JSON.parse(existingSheetRaw) as WorksheetSpec;
                            const targetRowIds = new Set(ws.Rows.map((r) => r.RowID));
                            const baseRowIds = baselineRowIdsBySheet.get(ws.SheetID);
                            const concurrentRows = (existingSheet.Rows ?? []).filter(
                                (r) => !targetRowIds.has(r.RowID) && !(baseRowIds && baseRowIds.has(r.RowID))
                            );
                            if (concurrentRows.length > 0) {
                                mergedRows = [...ws.Rows, ...concurrentRows];
                            }

                            const targetColIds = new Set(ws.Columns.map((c) => c.ColumnID));
                            const baseColIds = baselineColIdsBySheet.get(ws.SheetID);
                            const concurrentCols = (existingSheet.Columns ?? []).filter(
                                (c) => !targetColIds.has(c.ColumnID) && !(baseColIds && baseColIds.has(c.ColumnID))
                            );
                            if (concurrentCols.length > 0) {
                                mergedCols = [...ws.Columns, ...concurrentCols];
                            }
                        } catch {
                            // Ignore malformed existing sheet JSON
                        }
                    }
                }

                const sheetStruct: WorksheetSpec = {
                    ...ws,
                    Rows: mergedRows,
                    Columns: mergedCols,
                    Cells: {}
                };
                const sheetStructJson = JSON.stringify(sheetStruct);
                if (worksheetsById.get(ws.SheetID) !== sheetStructJson) {
                    worksheetsById.set(ws.SheetID, sheetStructJson);
                }

                for (const cell of Object.values(ws.Cells)) {
                    const coordKey = `${ws.SheetID}::${cell.RowID}::${cell.ColumnID}`;
                    validCellCoordKeys.add(coordKey);
                    const cellJson = JSON.stringify(cell);
                    if (sheetCellsByCoord.get(coordKey) !== cellJson) {
                        sheetCellsByCoord.set(coordKey, cellJson);
                    }
                }
            }

            const preservedConcurrentSheetIds = new Set<string>();
            for (const existingSheetId of Array.from(worksheetsById.keys())) {
                if (!validSheetIds.has(existingSheetId)) {
                    const wasDeletedFromBaseline = baselineSheetIds ? baselineSheetIds.has(existingSheetId) : false;
                    if (options?.preserveConcurrentAdditions && !wasDeletedFromBaseline) {
                        preservedConcurrentSheetIds.add(existingSheetId);
                    } else {
                        worksheetsById.delete(existingSheetId);
                    }
                }
            }
            for (const existingCoordKey of Array.from(sheetCellsByCoord.keys())) {
                if (!validCellCoordKeys.has(existingCoordKey)) {
                    const wasDeletedFromBaseline = baselineCoordKeys ? baselineCoordKeys.has(existingCoordKey) : false;
                    if (options?.preserveConcurrentAdditions && !wasDeletedFromBaseline) {
                        // Preserve cell added concurrently by another client in the live room
                    } else {
                        sheetCellsByCoord.delete(existingCoordKey);
                    }
                }
            }

            const currentOrder = sheetOrder.toArray();
            const targetOrder = wb.Worksheets.map((w) => w.SheetID);
            if (preservedConcurrentSheetIds.size > 0) {
                for (const sId of currentOrder) {
                    if (preservedConcurrentSheetIds.has(sId) && !targetOrder.includes(sId)) {
                        targetOrder.push(sId);
                    }
                }
                for (const sId of preservedConcurrentSheetIds) {
                    if (!targetOrder.includes(sId)) {
                        targetOrder.push(sId);
                    }
                }
            }
            if (
                currentOrder.length !== targetOrder.length ||
                currentOrder.some((id, idx) => id !== targetOrder[idx])
            ) {
                if (sheetOrder.length > 0) {
                    sheetOrder.delete(0, sheetOrder.length);
                }
                sheetOrder.insert(0, targetOrder);
            }
        } catch {
            // Non-Spreadsheet content
        }
    }

    /**
     * Reconstructs the canonical string content of a Yjs room.
     * - If the room contains per-worksheet/per-cell CRDT maps (`worksheetsById` + `sheetCellsByCoord`),
     *   reconstructs the merged {@link WorkbookSpec}, resolves all stable-ID formulas (`FormulaStable`),
     *   and recalculates the workbook (`§ 6.2`, `Accept #1`).
     * - If the room contains per-slide CRDT maps (`slidesById` + `slideOrder`), reconstructs
     *   the merged {@link SlideDeckSpec} JSON (`§ 5.1`).
     */
    private extractRoomSerializedContent(doc: Y.Doc): string {
        const worksheetsById = doc.getMap<string>('worksheetsById');
        const sheetOrder = doc.getArray<string>('sheetOrder');
        const workbookMeta = doc.getMap<string>('workbookMeta');
        const sheetCellsByCoord = doc.getMap<string>('sheetCellsByCoord');

        if (worksheetsById.size > 0) {
            try {
                const orderedSheetIds = sheetOrder.toArray();
                const placedSheetIds = new Set<string>();
                const worksheets: WorksheetSpec[] = [];

                const collectSheet = (sheetId: string, rawJson: string): void => {
                    if (placedSheetIds.has(sheetId) || !rawJson) return;
                    placedSheetIds.add(sheetId);
                    const ws = JSON.parse(rawJson) as WorksheetSpec;
                    ws.Cells = ws.Cells ?? {};

                    const prefix = `${sheetId}::`;
                    for (const [coordKey, cellJson] of sheetCellsByCoord.entries()) {
                        if (!coordKey.startsWith(prefix) || !cellJson) continue;
                        const cell = JSON.parse(cellJson) as SpreadsheetCellSpec;
                        const tempAddr = cell.Address || `${cell.RowID}:${cell.ColumnID}`;
                        ws.Cells[tempAddr] = cell;
                    }
                    SpreadsheetEngine.Instance.ReindexWorksheetAndResolveFormulas(ws);
                    worksheets.push(ws);
                };

                for (const sId of orderedSheetIds) {
                    const sJson = worksheetsById.get(sId);
                    if (sJson) collectSheet(sId, sJson);
                }
                for (const [sId, sJson] of worksheetsById.entries()) {
                    collectSheet(sId, sJson);
                }

                if (worksheets.length > 0) {
                    let namedRanges: SpreadsheetNamedRangeSpec[] = [];
                    const nrRaw = workbookMeta.get('NamedRanges');
                    if (nrRaw) {
                        try {
                            namedRanges = JSON.parse(nrRaw) as SpreadsheetNamedRangeSpec[];
                        } catch {
                            namedRanges = [];
                        }
                    }
                    const now = new Date().toISOString();
                    const activeId = workbookMeta.get('ActiveSheetID') || worksheets[0].SheetID;
                    const wb: WorkbookSpec = SpreadsheetEngine.Instance.NormalizeWorkbook({
                        WorkbookID: workbookMeta.get('WorkbookID') || 'wb-1',
                        Title: workbookMeta.get('Title') || 'Workbook',
                        ActiveSheetID: activeId,
                        Worksheets: worksheets,
                        NamedRanges: namedRanges,
                        CreatedAt: now,
                        UpdatedAt: now
                    });
                    SpreadsheetEngine.Instance.EvaluateWorkbook(wb);
                    return SpreadsheetEngine.Instance.SerializeWorkbook(wb);
                }
            } catch {
                // Fall back to other extractors
            }
        }

        const slidesById = doc.getMap<string>('slidesById');
        const slideOrder = doc.getArray<string>('slideOrder');
        const deckMeta = doc.getMap<string>('deckMeta');

        if (slidesById.size > 0) {
            try {
                let baseDeck: Partial<SlideDeckSpec> = {};
                const rawText = doc.getText('content').toString().trim();
                if (rawText.startsWith('{')) {
                    try {
                        baseDeck = JSON.parse(rawText) as Partial<SlideDeckSpec>;
                    } catch {
                        baseDeck = {};
                    }
                }

                let theme = baseDeck.Theme;
                const rawTheme = deckMeta.get('Theme');
                if (rawTheme) {
                    try {
                        theme = JSON.parse(rawTheme) as SlideDeckSpec['Theme'];
                    } catch {
                        // Keep baseDeck.Theme
                    }
                }

                let master = baseDeck.Master;
                const rawMaster = deckMeta.get('Master');
                if (rawMaster) {
                    try {
                        master = JSON.parse(rawMaster) as SlideDeckSpec['Master'];
                    } catch {
                        // Keep baseDeck.Master
                    }
                }

                const orderedIds = slideOrder.toArray();
                const placed = new Set<string>();
                const slides: SlideSpec[] = [];

                for (const id of orderedIds) {
                    const sJson = slidesById.get(id);
                    if (sJson && !placed.has(id)) {
                        slides.push(JSON.parse(sJson) as SlideSpec);
                        placed.add(id);
                    }
                }
                for (const [id, sJson] of slidesById.entries()) {
                    if (!placed.has(id) && sJson) {
                        slides.push(JSON.parse(sJson) as SlideSpec);
                        placed.add(id);
                    }
                }

                if (slides.length > 0) {
                    const renumbered = slides.map((s, idx) => ({
                        ...s,
                        SlideNumber: idx + 1
                    }));
                    const reconstructed: SlideDeckSpec = SlideDeckEngine.Instance.ParseDeckSpec(
                        JSON.stringify({
                            ...baseDeck,
                            SchemaVersion: '1.0',
                            DeckID: deckMeta.get('DeckID') || baseDeck.DeckID || 'deck-1',
                            Title: deckMeta.get('Title') || baseDeck.Title || 'Presentation',
                            Subtitle:
                                deckMeta.get('Subtitle') !== undefined
                                    ? deckMeta.get('Subtitle')
                                    : baseDeck.Subtitle,
                            AspectRatio:
                                (deckMeta.get('AspectRatio') as '16:9' | '4:3') ||
                                baseDeck.AspectRatio ||
                                '16:9',
                            Theme: theme,
                            Master: master,
                            Slides: renumbered
                        })
                    );
                    return SlideDeckEngine.Instance.SerializeDeckSpec(reconstructed);
                }
            } catch {
                // Fall back to Y.Text('content')
            }
        }

        return doc.getText('content').toString();
    }
}
