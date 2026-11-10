import { createHash, randomBytes } from 'node:crypto';
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

/** Default idle room retention window (ms) after the last client disconnects. */
export const DEFAULT_IDLE_ROOM_TTL_MS = 30_000;

/** Default ping/pong heartbeat & periodic permission sweep interval (ms). */
export const DEFAULT_COLLABORATION_HEARTBEAT_MS = 30_000;

const WORKING_STATE_FLUSH_DEBOUNCE_MS = 2500;
const MAX_COLLAB_FRAME_BYTES = 16 * 1024 * 1024; // 16 MB
const MAX_VERSION_SAVE_ATTEMPTS = 3;
const COLLABORATION_ALLOWED_ORIGINS_ENV = 'MJ_COLLABORATION_ALLOWED_ORIGINS';
const REALTIME_ALLOWED_ORIGINS_ENV = 'MJ_REALTIME_PROXY_ALLOWED_ORIGINS';
const MAX_LOGGED_ORIGIN_CHARS = 200;

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
    ArtifactID: string;
    User: UserInfo;
    ApiKeyHash?: string;
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
    /** User who most recently applied an edit in this room. */
    LastModifiedByUser: UserInfo | null;
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
}

/**
 * JSON payload sent inside a {@link YJS_MESSAGE_CONTROL} frame (`type = 2`).
 */
export interface CollaborationControlFrame {
    action: 'save-version' | 'version-saved' | 'readonly-rejected';
    versionId?: string;
    versionNumber?: number;
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

    private readonly _rooms = new Map<string, CollaborationRoom>();
    private readonly _roomInitPromises = new Map<string, Promise<CollaborationRoom>>();
    private readonly _tickets = new Map<string, StoredCollaborationTicket>();
    private _relay: IYjsRoomRelay = new InMemoryYjsRoomRelay();
    private _dataSources: DataSourceInfo[] = [];
    private _providerOverride: IMetadataProvider | null = null;
    private _authOverride: ((req: IncomingMessage) => Promise<UserInfo | null>) | null = null;
    private _unsubscribePermissionEngine: (() => void) | null = null;
    private _globalMutationSub: { unsubscribe: () => void } | null = null;
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private _idleRoomTtlMs: number = DEFAULT_IDLE_ROOM_TTL_MS;
    private _heartbeatIntervalMs: number = DEFAULT_COLLABORATION_HEARTBEAT_MS;
    private _shutdownRegistered = false;
    private _shuttingDown = false;

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
     * resolve `getUserPayload` against real database pools.
     */
    public SetDataSources(dataSources: DataSourceInfo[]): void {
        this._dataSources = dataSources ?? [];
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

    /**
     * Mints a cryptographically random, single-use, short-lived ticket (`TTLSeconds = 60` default)
     * bound to a specific `(ArtifactID, User)` pair so browser WebSockets never pass JWTs or API keys
     * in URL query parameters (`A3`).
     */
    public IssueTicket(params: IssueCollaborationTicketParams): IssuedCollaborationTicket {
        this.ensureShutdownRegistered();
        this.ensurePermissionListenerRegistered();
        this.pruneExpiredTickets();

        const artifactId = (params.ArtifactID ?? '').trim();
        if (!artifactId) {
            throw new Error('IssueTicket requires a non-empty ArtifactID.');
        }
        const ttlSeconds = Math.max(1, params.TTLSeconds ?? DEFAULT_COLLABORATION_TICKET_TTL_SECONDS);
        const expiresAtMs = Date.now() + ttlSeconds * 1000;
        const ticket = randomBytes(24).toString('base64url');

        this._tickets.set(ticket, {
            ArtifactID: artifactId,
            User: params.User,
            ApiKeyHash: params.ApiKeyHash,
            ExpiresAtMs: expiresAtMs
        });

        return {
            Ticket: ticket,
            ExpiresAt: new Date(expiresAtMs).toISOString()
        };
    }

    /**
     * Atomically consumes a single-use collaboration ticket and verifies it matches `expectedArtifactId`
     * and has not expired. Always deletes the ticket on first lookup so replay is impossible (`A3`).
     */
    public ConsumeTicket(
        ticket: string,
        expectedArtifactId: string
    ): { User: UserInfo; ApiKeyHash?: string } | null {
        this.pruneExpiredTickets();
        const normalizedTicket = (ticket ?? '').trim();
        const normalizedArtifactId = (expectedArtifactId ?? '').trim();
        if (!normalizedTicket || !normalizedArtifactId) {
            return null;
        }

        const entry = this._tickets.get(normalizedTicket);
        if (!entry) {
            return null;
        }
        // Single-use: delete unconditionally on first presentation
        this._tickets.delete(normalizedTicket);

        if (entry.ExpiresAtMs <= Date.now()) {
            return null;
        }
        const sameArtifact =
            UUIDsEqual(entry.ArtifactID, normalizedArtifactId) ||
            entry.ArtifactID.toLowerCase() === normalizedArtifactId.toLowerCase();
        if (!sameArtifact) {
            return null;
        }
        if (entry.User.IsActive === false) {
            return null;
        }
        return {
            User: entry.User,
            ApiKeyHash: entry.ApiKeyHash
        };
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
     * `MJ: Artifact Working States` using the server system user (`IncludeInAPI = 0`, `B1`),
     * while recording the editing user in `LastModifiedByUserID`.
     */
    public async FlushWorkingState(artifactId: string, contextUser: UserInfo): Promise<boolean> {
        this.ensureShutdownRegistered();
        const room = this._rooms.get((artifactId ?? '').trim().toLowerCase());
        if (!room) {
            return false;
        }
        if (room.WorkingStateTimer) {
            clearTimeout(room.WorkingStateTimer);
            room.WorkingStateTimer = null;
        }

        const provider = this.activeProvider();
        const actor = contextUser ?? room.LastModifiedByUser;
        const persistenceUser = UserCache.Instance.GetSystemUser() ?? actor;
        if (!provider || !actor || !persistenceUser) {
            return false;
        }

        try {
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
    }

    /**
     * Compacts the room's current collaborative content into a new immutable `MJ: Artifact Versions`
     * record if the content hash differs from the latest persisted version, retrying up to 3 times
     * on concurrent `VersionNumber` conflicts (`C5`), and flushes `MJ: Artifact Working States`.
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

        await this.FlushWorkingState(artifactId, contextUser);

        const currentContent = this.extractRoomSerializedContent(room.Doc);
        const contentHash = createHash('sha256').update(currentContent, 'utf8').digest('hex');
        const rv = RunView.FromMetadataProvider(provider);
        const queryUser = UserCache.Instance.GetSystemUser() ?? contextUser;

        let lastSaveError = 'unknown error';
        for (let attempt = 1; attempt <= MAX_VERSION_SAVE_ATTEMPTS; attempt++) {
            const latestRes = await rv.RunView<{
                ID: string;
                VersionNumber: number;
                Content?: string | null;
                ContentHash?: string | null;
            }>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                    OrderBy: 'VersionNumber DESC',
                    Fields: ['ID', 'VersionNumber', 'Content', 'ContentHash'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                queryUser
            );

            const latest = latestRes.Success ? latestRes.Results?.[0] : undefined;
            if (latest && (latest.ContentHash === contentHash || latest.Content === currentContent)) {
                room.DirtyVersion = false;
                return {
                    Saved: true,
                    VersionID: latest.ID,
                    VersionNumber: latest.VersionNumber
                };
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

            let saved = false;
            try {
                saved = await versionEntity.Save();
                if (!saved) {
                    lastSaveError = versionEntity.LatestResult?.CompleteMessage ?? 'Save() returned false';
                }
            } catch (err) {
                lastSaveError = err instanceof Error ? err.message : String(err);
                saved = false;
            }

            if (saved) {
                room.DirtyVersion = false;
                room.Doc.transact(() => {
                    room.Doc.getMap('meta').set('versionNumber', versionEntity.VersionNumber);
                    room.Doc.getMap('meta').set('versionId', versionEntity.ID);
                }, 'version-meta');

                this.broadcastControlFrame(room, {
                    action: 'version-saved',
                    versionId: versionEntity.ID,
                    versionNumber: versionEntity.VersionNumber
                });

                try {
                    await this._relay.PublishToRoom({
                        ArtifactID: room.ArtifactID,
                        MessageType: 'version-saved',
                        PayloadBase64: '',
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

                return {
                    Saved: true,
                    VersionID: versionEntity.ID,
                    VersionNumber: versionEntity.VersionNumber
                };
            }
        }

        LogError(
            `ArtifactCollaborationServer.CompactRoomToArtifactVersion failed after ${MAX_VERSION_SAVE_ATTEMPTS} attempts for '${artifactId}': ${lastSaveError}`
        );
        return { Saved: false };
    }

    /**
     * Applies a server-side content mutation (e.g., from `DocumentToolLibrary`, `WhiteboardToolLibrary`,
     * `SlideDeckToolLibrary`, or `SpreadsheetToolLibrary` during an `@mention` agent run) directly to
     * the live Yjs room so connected browsers see the diff immediately, and optionally compacts a new
     * `MJ: Artifact Versions` checkpoint.
     */
    public async ApplyServerContentMutation(
        artifactId: string,
        newContent: string,
        user: UserInfo,
        saveVersion: boolean = true
    ): Promise<{ Success: boolean; VersionID?: string; VersionNumber?: number }> {
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
        if (existing !== newContent) {
            room.Doc.transact(() => {
                if (yText.length > 0) {
                    yText.delete(0, yText.length);
                }
                if (newContent.length > 0) {
                    yText.insert(0, newContent);
                }
                this.syncSlideDeckStructuresIfPresent(room.Doc, newContent);
                this.syncSpreadsheetStructuresIfPresent(room.Doc, newContent);
            }, 'server-agent');
            room.LastModifiedByUser = user;
            room.DirtyWorkingState = true;
            room.DirtyVersion = true;
        }

        if (saveVersion) {
            const compacted = await this.CompactRoomToArtifactVersion(artifactId, user);
            return {
                Success: compacted.Saved,
                VersionID: compacted.VersionID,
                VersionNumber: compacted.VersionNumber
            };
        }

        await this.FlushWorkingState(artifactId, user);
        return { Success: true };
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
            if (existing.IdleDisposeTimer) {
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
     * (or hydrates the room first).
     */
    public async GetRoomContent(artifactId: string, contextUser: UserInfo): Promise<string> {
        const room = await this.GetOrCreateRoom(artifactId, contextUser);
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
        await this._relay.Shutdown();
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
            if (
                event.event === MJEventType.ComponentEvent &&
                event.eventCode === ARTIFACT_LIVE_MUTATION_EVENT_CODE &&
                event.args &&
                typeof event.args === 'object'
            ) {
                const payload = event.args as {
                    ArtifactID?: string;
                    NewContent?: string;
                    User?: UserInfo;
                    SaveVersion?: boolean;
                };
                if (payload.ArtifactID && typeof payload.NewContent === 'string' && payload.User) {
                    void this.ApplyServerContentMutation(
                        payload.ArtifactID,
                        payload.NewContent,
                        payload.User,
                        payload.SaveVersion ?? true
                    );
                }
            }
        });
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
            return this.ConsumeTicket(rawTicket, artifactId);
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

            this._wss.handleUpgrade(req, socket, head, (ws) => {
                this.attachClientToRoom(room!, ws, auth.User, effectiveCanEdit, auth.ApiKeyHash);
            });
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
            LastModifiedByUser: contextUser,
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
            }

            // Broadcast state-vector catch-up request so any peer MJServer replica holding live edits replies with diff
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

            const versionCreatedMs = versionRow?.__mj_CreatedAt
                ? new Date(versionRow.__mj_CreatedAt).getTime()
                : NaN;
            const workingUpdatedMs = workingRow?.__mj_UpdatedAt
                ? new Date(workingRow.__mj_UpdatedAt).getTime()
                : NaN;
            const versionNewerThanWorkingState =
                Boolean(versionRow) &&
                Boolean(workingRow?.YjsState) &&
                Number.isFinite(versionCreatedMs) &&
                Number.isFinite(workingUpdatedMs) &&
                versionCreatedMs > workingUpdatedMs;

            if (workingRow?.YjsState && !versionNewerThanWorkingState) {
                const stateBytes = DecodeWorkingStateBytes(workingRow.YjsState);
                if (stateBytes.byteLength > 0) {
                    Y.applyUpdate(room.Doc, stateBytes, 'hydrate');
                }
            }

            const yText = room.Doc.getText('content');
            if (yText.length === 0 && (versionRow?.Content || versionRow?.Configuration)) {
                room.Doc.transact(() => {
                    const initialText = versionRow.Content || versionRow.Configuration || '';
                    if (initialText) {
                        yText.insert(0, initialText);
                    }
                    this.syncSlideDeckStructuresIfPresent(room.Doc, initialText);
                    this.syncSpreadsheetStructuresIfPresent(
                        room.Doc,
                        versionRow.Content ?? '',
                        versionRow.Configuration ?? null
                    );
                    room.Doc.getMap('meta').set('versionNumber', versionRow.VersionNumber);
                    room.Doc.getMap('meta').set('versionId', versionRow.ID);
                }, 'hydrate');
            } else if (versionRow) {
                room.Doc.transact(() => {
                    room.Doc.getMap('meta').set('versionNumber', versionRow.VersionNumber);
                    room.Doc.getMap('meta').set('versionId', versionRow.ID);
                }, 'hydrate');
            }

            return { overwriteStaleWorkingState: versionNewerThanWorkingState };
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
            Alive: true
        };
        room.Connections.add(conn);

        // 1. Send initial permission status frame
        const versionNumber = room.Doc.getMap('meta').get('versionNumber') as number | undefined;
        this.sendPermissionStatusFrame(ws, {
            canRead: true,
            canEdit: canEdit,
            versionNumber: versionNumber
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
        if (origin !== 'relay') {
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
            const remoteVector = msg.PayloadBase64 ? Base64ToBytes(msg.PayloadBase64) : undefined;
            const diffUpdate =
                remoteVector && remoteVector.byteLength > 0
                    ? Y.encodeStateAsUpdate(room.Doc, remoteVector)
                    : Y.encodeStateAsUpdate(room.Doc);
            if (diffUpdate.byteLength > 0) {
                try {
                    await this._relay.PublishToRoom({
                        ArtifactID: room.ArtifactID,
                        MessageType: 'sync-state',
                        PayloadBase64: BytesToBase64(diffUpdate)
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
            const stateBytes = Base64ToBytes(msg.PayloadBase64);
            if (stateBytes.byteLength > 0) {
                Y.applyUpdate(room.Doc, stateBytes, 'relay');
            }
        } else if (msg.MessageType === 'awareness' && msg.PayloadBase64) {
            const awarenessBytes = Base64ToBytes(msg.PayloadBase64);
            if (awarenessBytes.byteLength > 0) {
                awarenessProtocol.applyAwarenessUpdate(room.Awareness, awarenessBytes, 'relay');
            }
        } else if (msg.MessageType === 'permission-revoked') {
            await this.ReevaluateRoomPermissions(room.ArtifactID, msg.TargetUserID, false);
        } else if (msg.MessageType === 'version-saved' && typeof msg.VersionNumber === 'number') {
            room.DirtyVersion = false;
            this.broadcastControlFrame(room, {
                action: 'version-saved',
                versionId: msg.VersionID,
                versionNumber: msg.VersionNumber
            });
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
        if (this._shuttingDown || room.Connections.size > 0) {
            return;
        }
        const key = room.ArtifactID.trim().toLowerCase();
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
            if (room.Connections.size > 0 || room.DirtyWorkingState || room.DirtyVersion) {
                if (room.Connections.size === 0 && !this._shuttingDown) {
                    this.scheduleIdleRoomDisposal(room);
                }
                return;
            }
        }

        this._rooms.delete(key);
        this.teardownRoomResources(room);
    }

    private teardownRoomResources(room: CollaborationRoom): void {
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
     * When `rawContent` represents a serialized {@link SlideDeckSpec} (`Presentation` artifact),
     * populates `doc.getMap('deckMeta')`, `doc.getMap('slidesById')`, and `doc.getArray('slideOrder')`
     * so concurrent per-slide edits and slide reorders merge cleanly across Yjs CRDT maps/arrays (`§ 5.1`, `Accept #1`).
     */
    private syncSlideDeckStructuresIfPresent(doc: Y.Doc, rawContent: string): void {
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
            for (const existingKey of Array.from(slidesById.keys())) {
                if (!nextIds.has(existingKey)) {
                    slidesById.delete(existingKey);
                }
            }

            const currentOrder = slideOrder.toArray();
            const targetOrder = deck.Slides.map((s) => s.SlideID);
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
        rawConfiguration?: string | null
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
                const sheetStruct: WorksheetSpec = {
                    ...ws,
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

            for (const existingSheetId of Array.from(worksheetsById.keys())) {
                if (!validSheetIds.has(existingSheetId)) {
                    worksheetsById.delete(existingSheetId);
                }
            }
            for (const existingCoordKey of Array.from(sheetCellsByCoord.keys())) {
                if (!validCellCoordKeys.has(existingCoordKey)) {
                    sheetCellsByCoord.delete(existingCoordKey);
                }
            }

            const currentOrder = sheetOrder.toArray();
            const targetOrder = wb.Worksheets.map((w) => w.SheetID);
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
