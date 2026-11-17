import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import jwt from 'jsonwebtoken';
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
    GetGlobalObjectStore,
    MJEventType,
    MJGlobal,
    NormalizeUUID,
    ShutdownRegistry,
    UUIDsEqual,
    type IShutdownable
} from '@memberjunction/global';
import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    BuildArtifactVersionConfigurationWithPreview,
    DocumentLiveBlockEngine,
    IsValidThumbnailDataUrl,
    MAX_IMPORT_SHEETS,
    MAX_IMPORT_WORKBOOK_CELLS,
    MJArtifactTypeEntity,
    MJArtifactVersionEntity,
    MJArtifactWorkingStateEntity,
    ResolveArtifactTypeThumbnailPolicy,
    SlideDeckEngine,
    SpreadsheetEngine,
    ValidateArtifactContentMutationAgainstLocks,
    type ArtifactTypeThumbnailPolicy,
    type SlideDeckSpec,
    type SlideSpec,
    type SpreadsheetCellSpec,
    type SpreadsheetNamedRangeSpec,
    type WorkbookSpec,
    type WorksheetSpec
} from '@memberjunction/core-entities';
import {
    MarkTrustedCompactionVersionSave,
    RegisterWorkingStateContentDeserializer,
} from '@memberjunction/core-entities-server';
import { ApiRoute } from '../apiRoot.js';
import { configInfo } from '../config.js';
import { getUserPayload } from '../context.js';
import type { DataSourceInfo } from '../types.js';
import { InMemoryYjsRoomRelay, type IYjsRoomRelay, type YjsRelayMessage } from './YjsRoomRelay.js';
import {
    ARTIFACT_AGENT_PRESENCE_HOOK_KEY,
    ARTIFACT_LIVE_CONTENT_READER_HOOK_KEY,
    type ArtifactAgentPresenceEvent,
    type ArtifactLiveRoomSnapshot,
} from '@memberjunction/ai-agents';
import type { ArtifactJsonValue, ArtifactToolArgs } from '@memberjunction/ai-core-plus';

/** Canonical WebSocket upgrade path for Yjs artifact collaboration rooms (relative to `MJAPI_BASE_PATH`). */
export const ARTIFACT_COLLABORATION_WS_PATH = '/collaboration/yjs';

/** Optional `MJGlobal` event code for decoupled server-side live artifact mutations. */
export const ARTIFACT_LIVE_MUTATION_EVENT_CODE = 'ArtifactCollaboration.LiveContentMutation';

/** Global store key shared with `ArtifactToolManager` (`SetArtifactLiveMutationHook`). */
export const ARTIFACT_LIVE_MUTATION_HOOK_KEY = '___MJ_ARTIFACT_LIVE_MUTATION_HOOK___';

/** Max inline snapshot length (chars) embedded inside `Y.Doc.getMap('meta')` (`R8-1`). */
const MAX_META_INLINE_SNAPSHOT_B64_CHARS = 2048;

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

/** Machine-readable GraphQL `ErrorCode` returned when `MJ_ARTIFACT_COLLAB_HMAC_SECRET` is unset or < 32 bytes. */
export const COLLAB_SECRET_UNCONFIGURED_CODE = 'COLLAB_SECRET_UNCONFIGURED';

/**
 * Typed error thrown by {@link ArtifactCollaborationServer.IssueTicket} when the collaboration
 * ticket HMAC secret (`MJ_ARTIFACT_COLLAB_HMAC_SECRET` / `MJ_COLLABORATION_TICKET_SECRET`) is
 * unset or shorter than 32 UTF-8 bytes.
 */
export class CollaborationSecretUnconfiguredError extends Error {
    public readonly ErrorCode = COLLAB_SECRET_UNCONFIGURED_CODE;

    public constructor(message: string) {
        super(message);
        this.name = 'CollaborationSecretUnconfiguredError';
    }
}

/** Rejected incoming/agent hunk recorded when a live edit wins a 3-way merge conflict (`R7-5`). */
export interface RejectedAgentMergeHunk {
    BaseText: string;
    LiveText: string;
    RejectedIncomingText: string;
}

/**
 * The per-key values a slide deck's room structures hold for one serialized deck, used to undo an agent
 * change key by key: deck metadata, slides by `SlideID`, and slide order.
 */
interface StructureEntries {
    Meta: Map<string, string>;
    Items: Map<string, string>;
    Order: string[];
}

/** {@link StructureEntries} for a workbook, plus its cells keyed `<SheetID>::<RowID>::<ColumnID>`. */
interface WorkbookStructureEntries extends StructureEntries {
    Cells: Map<string, string>;
}

/** Detailed 3-way merge outcome returned by {@link ArtifactCollaborationServer.MergeConcurrentDocumentEditsDetailed} (`R7-5`). */
export interface ConcurrentDocumentMergeResult {
    MergedText: string;
    HadConflict: boolean;
    RejectedAgentHunks: RejectedAgentMergeHunk[];
}

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
const MAX_AWARENESS_FRAME_BYTES = 16_384; // 16 KB
const MAX_ACTIVE_COLLAB_ROOMS = 2_000;
const MAX_ACTIVE_ROOMS_PER_USER = 50;
const MAX_ROOM_DOC_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_RETAINED_DIRTY_ROOMS = 250;
const RETAINED_DIRTY_ROOM_TTL_MS = 15 * 60_000; // 15 minutes
const CLIENT_FRAME_RATE_WINDOW_MS = 10_000;
const MAX_CLIENT_FRAMES_PER_WINDOW = 500;
const MAX_VERSION_SAVE_ATTEMPTS = 3;
const MAX_IDLE_FLUSH_RETRIES = 3;
const COLLABORATION_ALLOWED_ORIGINS_ENV = 'MJ_COLLABORATION_ALLOWED_ORIGINS';
const REALTIME_ALLOWED_ORIGINS_ENV = 'MJ_REALTIME_PROXY_ALLOWED_ORIGINS';
const MAX_LOGGED_ORIGIN_CHARS = 200;

/** Reserved high Yjs clientID block for server-emitted AI agent awareness (browser clients cannot claim or spoof). */
export const AGENT_AWARENESS_CLIENT_ID_BASE = 0x70000000;
export const AGENT_AWARENESS_CLIENT_ID_MAX = 0x7fffffff;
const DEFAULT_AGENT_PRESENCE_THROTTLE_MS = 150;
const DEFAULT_AGENT_PRESENCE_DECAY_MS = 8_000;
const DEFAULT_AGENT_PRESENCE_TTL_MS = 60_000;
const DEFAULT_AGENT_PRESENCE_EXIT_GRACE_MS = 2_500;
const SAFE_AWARENESS_COLOR_RE =
    /^(#[0-9a-fA-F]{3,8}|var\(--mj-[a-zA-Z0-9-]+\)|(rgb|hsl)a?\([0-9.,\s%/]+\))$/;
const DEFAULT_AWARENESS_COLOR = 'var(--mj-brand-primary)';

type AwarenessJsonPrimitive = string | number | boolean | null;
type AwarenessJsonValue = AwarenessJsonPrimitive | AwarenessJsonValue[] | AwarenessJsonObject;
interface AwarenessJsonObject {
    [key: string]: AwarenessJsonValue | undefined;
}

interface AgentAwarenessUserPayload {
    userId: string;
    userName: string;
    name: string;
    color: string;
    canEdit: boolean;
    isAgent: true;
    agentPresenceKey: string;
    agentRunId?: string;
    agentName: string;
    actingForUserId: string;
    actingForUserName: string;
    agentPhase: ArtifactAgentPresenceEvent['Phase'];
    toolName?: string;
    actionSummary?: string;
    agentLocation?: ArtifactAgentPresenceEvent['Location'];
    timestampMs: number;
}

interface AgentAwarenessPayload {
    isAgent: true;
    agentPresenceKey: string;
    agentPhase: ArtifactAgentPresenceEvent['Phase'];
    agentLocation?: ArtifactAgentPresenceEvent['Location'];
    cursor: null;
    user: AgentAwarenessUserPayload;
}

function sanitizeAwarenessColor(raw: AwarenessJsonValue | undefined): string {
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (SAFE_AWARENESS_COLOR_RE.test(trimmed)) {
            return trimmed;
        }
    }
    return DEFAULT_AWARENESS_COLOR;
}

function isAwarenessJsonObject(val: AwarenessJsonValue | undefined): val is AwarenessJsonObject {
    return Boolean(val && typeof val === 'object' && !Array.isArray(val));
}

function isRelayedAgentAwarenessPayload(val: AwarenessJsonValue | undefined): boolean {
    if (!isAwarenessJsonObject(val)) {
        return false;
    }
    if (val['isAgent'] === true) {
        return true;
    }
    const userObj = val['user'];
    return isAwarenessJsonObject(userObj) && userObj['isAgent'] === true;
}
const AGENT_PRESENCE_PALETTE = [
    '#6366f1',
    '#8b5cf6',
    '#06b6d4',
    '#10b981',
    '#f59e0b',
    '#ec4899',
];

interface AgentRoomPresenceEntry {
    ClientID: number;
    Clock: number;
    LastEvent: ArtifactAgentPresenceEvent;
    LastBroadcastMs: number;
    PendingWorkingEvent: ArtifactAgentPresenceEvent | null;
    ThrottleTimer: ReturnType<typeof setTimeout> | null;
    DecayTimer: ReturnType<typeof setTimeout> | null;
    TtlTimer: ReturnType<typeof setTimeout> | null;
    ExitGraceTimer: ReturnType<typeof setTimeout> | null;
}

interface DetachedAgentPresenceEntry {
    RoomKey: string;
    ArtifactID: string;
    PresenceKey: string;
    Entry: AgentRoomPresenceEntry;
}

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
    /** Optional cross-replica ticket metadata store (used to persist `ApiKeyHash` server-side across nodes, `N2`). */
    SetTicketData?(nonce: string, dataJson: string, ttlMs: number): Promise<void> | void;
    /** Optional cross-replica ticket metadata lookup & cleanup (`N2`). */
    GetAndDeleteTicketData?(nonce: string): Promise<string | null> | string | null;
}

/**
 * Parameters for issuing a single-use WebSocket collaboration upgrade ticket (`A3`).
 */
export interface IssueCollaborationTicketParams {
    ArtifactID: string;
    User: UserInfo;
    ApiKeyHash?: string;
    TTLSeconds?: number;
    /** Optional provider used to bind the ticket to a specific tenant/database scope. */
    Provider?: IMetadataProvider;
    /** Optional upstream token expiry (epoch ms) propagated onto the WebSocket connection. */
    TokenExpiresAtMs?: number;
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
    ProviderKey: string;
    Provider?: IMetadataProvider | null;
    User: UserInfo;
    ApiKeyHash?: string;
    IssuedAtMs: number;
    ExpiresAtMs: number;
    TokenExpiresAtMs?: number;
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
    /** Whether this connection's authenticated user is the authoritative owner of the artifact. */
    IsOwner?: boolean;
    /** Optional API key hash if this connection was established via a scoped API key. */
    ApiKeyHash?: string;
    /** Optional upstream auth token expiration timestamp (epoch ms) checked on permission sweeps (`NW-5`). */
    TokenExpiresAtMs?: number;
    /** Set of Yjs awareness client IDs owned by this socket (cleaned up on disconnect, capped at `32`). */
    ControlledClientIDs: Set<number>;
    /** Tracks ping/pong liveness across heartbeat sweeps. */
    Alive: boolean;
    /** Whether initial post-REST-save deduplication check has completed for this connection. */
    InitialSyncDedupeChecked?: boolean;
    /** Start epoch ms of the active per-connection frame rate window. */
    FrameWindowStartMs?: number;
    /** Incoming frame count within the active per-connection rate window. */
    FrameCountInWindow?: number;
}

/**
 * Active in-memory Yjs room for a single `MJ: Artifacts` record.
 */
export interface CollaborationRoom {
    /** Canonical composite room map key (`${providerKey}::${normalizedArtifactId}`). */
    RoomKey: string;
    /** Provider/tenant scope key isolating rooms across distinct providers/tenants. */
    ProviderKey: string;
    /** Metadata provider bound to this room when hydrated. */
    Provider: IMetadataProvider;
    /** `MJ: Artifacts.ID` represented by this room. */
    ArtifactID: string;
    /** Authoritative `MJ: Artifacts.UserID` owner of the artifact (used for OOB lock conflict checks, `B3`). */
    ArtifactOwnerUserID?: string | null;
    /** Normalized user ID that hydrated this room (used for per-user active room quota, `S9b`). */
    CreatedByUserID?: string | null;
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
    /** Cached flag indicating whether any document, slide, or spreadsheet lock is currently present (`O(1)` fast path). */
    HasActiveLocks: boolean;
    /** Consecutive failed flush/compaction attempts during idle room disposal (capped at `MAX_IDLE_FLUSH_RETRIES`). */
    CompactionRetryCount: number;
    /** Timestamp when an idle dirty room first entered failed-compaction retention (bounded TTL eviction). */
    RetainedDirtySinceMs?: number;
    /** User who most recently applied an edit in this room. */
    LastModifiedByUser: UserInfo | null;
    /** Latest `MJ: Artifact Versions.ID` reconciled into this room. */
    BaseVersionID: string | null;
    /** Latest `MJ: Artifact Versions.VersionNumber` reconciled into this room. */
    BaseVersionNumber: number;
    /** Serialized content of the latest `MJ: Artifact Versions` row reconciled into this room. */
    BaseVersionText: string;
    /** Raw `Configuration` JSON string of the latest `MJ: Artifact Versions` row reconciled into this room. */
    BaseConfiguration?: string | null;
    /** Preserves live `BaseConfiguration` across compaction when a lock-conflicted OOB/restore version carried a stripped config (`S5-1`). */
    PreserveLiveConfiguration?: boolean;
    /** Highest out-of-band / restore version rejected for active locks so working-state flush stays permitted (`S6-1`). */
    RejectedOobVersionNumber?: number;
    /** Trusted DB `__mj_UpdatedAt` epoch millis of the last working-state row hydrated or saved by this room. */
    LastPersistedWorkingStateMs?: number;
    /** In-memory ID of the most recent authoritative restore applied on this node (`R9-2`). */
    LastAppliedRestoreVersionID: string | null;
    /** In-memory VersionNumber of the most recent authoritative restore applied on this node (`R9-2`). */
    LastAppliedRestoreVersionNumber: number;
    /** `MJ: Artifact Versions.ID` of the most recent out-of-band version reconciled into this room (`R10-6`). */
    LastReconciledOobVersionID: string | null;
    /** Serialized content of the most recent out-of-band version reconciled into this room (`R12-1`). */
    LastReconciledOobContent: string | null;
    /** Merge result from the most recent out-of-band version reconciliation (`R10-6`). */
    LastReconciledOobMergeResult: ConcurrentDocumentMergeResult | null;
    /** Baseline content most recently 3-way merged into this room via `reconcileOutOfBandVersionIntoRoom`. */
    LastReconciledBaselineText?: string | null;
    /** Server-memory-only pre-out-of-band Yjs snapshot for reconnect deduplication (never stored inside `Doc.getMap('meta')`). */
    PreOutOfBandDocState?: Uint8Array | null;
    /** State vector captured at the most recent version compaction/seed for incremental CRDT delta broadcasts (`R7-6`). */
    LastCompactedStateVector?: Uint8Array | null;
    /** Pending conflict notice from cold room hydration delivered to the first attaching client (`R7-5`). */
    PendingHydrateConflict?: { VersionID: string; RejectedHunkCount: number; RoomEpoch: string } | null;
    /** Monotonic lineage token updated whenever an out-of-band version or reset mutates the room. */
    RoomEpoch: string;
    /** Serialized per-room flush promise queue so concurrent `FlushWorkingState` calls never interleave. */
    FlushQueue: Promise<boolean>;
    /** Serialized per-room compaction promise queue preventing concurrent version compactions (`NW-5`). */
    CompactionQueue: Promise<{ Saved: boolean; VersionID?: string; VersionNumber?: number }>;
    /** Debounce timer for periodic working-state checkpointing. */
    WorkingStateTimer: ReturnType<typeof setTimeout> | null;
    /** Idle room disposal timer armed when `Connections.size === 0`. */
    IdleDisposeTimer: ReturnType<typeof setTimeout> | null;
    /** Relay unsubscribe function for cross-instance pub/sub. */
    UnsubscribeRelay: (() => void) | null;
    /** Listener bound to `Doc.on('update', ...)` so it can be detached on room disposal. */
    DocUpdateListener: (update: Uint8Array, origin: CollaborationClientConnection | string | null | undefined) => void;
    /** Listener bound to `Awareness.on('update', ...)` so it can be detached on room disposal. */
    AwarenessUpdateListener: (
        changes: { added: number[]; updated: number[]; removed: number[] },
        origin: CollaborationClientConnection | string | null | undefined
    ) => void;
    /** Server-owned awareness client IDs reserved for AI agents inside this room (`C3` anti-spoof). */
    ProtectedAgentClientIDs: Set<number>;
    /** Per-agent active awareness timers, clocks, and coalesced states inside this room. */
    AgentPresenceEntries: Map<string, AgentRoomPresenceEntry>;
    /** Fallback ghost-cleanup timers for agent presence relayed from peer MJServer instances. */
    RelayedAgentPresenceTimers: Map<number, ReturnType<typeof setTimeout>>;
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
    action: 'save-version' | 'version-saved' | 'readonly-rejected' | 'room-reset' | 'merge-conflict';
    versionId?: string;
    versionNumber?: number;
    rejectedHunkCount?: number;
    roomEpoch?: string;
    payload?: string;
    message?: string;
    actorUserId?: string;
    /** Optional client-captured rendered screenshot (`data:image/webp|jpeg|png|svg+xml;base64,...`) sent on `'save-version'`. */
    thumbnailDataUrl?: string;
}

interface AuthenticatedUpgradeResult {
    User: UserInfo;
    ApiKeyHash?: string;
    TokenExpiresAtMs?: number;
    ProviderKey?: string;
    Provider?: IMetadataProvider | null;
}

interface ServerPersistedWatermark {
    BaseVersionID: string | null;
    BaseVersionNumber: number;
    BaseVersionText: string;
    LastAppliedRestoreVersionID: string | null;
    LastAppliedRestoreVersionNumber: number;
    UpdatedAtMs: number;
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
    Description?: string | null;
    Comments?: string | null;
    __mj_CreatedAt?: Date | string | null;
    __mj_UpdatedAt?: Date | string | null;
}

interface RegisteredLiveMutationEvent {
    artifactId: string;
    alphaId: string;
    versionId?: string;
    versionNumber?: number;
    previousContent?: string;
    updatedContent: string;
    xlsxBase64?: string;
    configurationPatch?: ArtifactToolArgs;
    provider?: IMetadataProvider | null;
    tool: string;
    contextUser?: UserInfo;
    agentRunId?: string;
    agentName?: string;
    deferCommit?: boolean;
}

interface RegisteredLiveMutationHookResult {
    applied?: boolean;
    mergedContent?: string;
    hadConflict?: boolean;
    rejectedHunksCount?: number;
    rejectedAgentHunks?: Array<{
        BaseLines: string[];
        LiveLines: string[];
        RejectedAgentLines: string[];
    }>;
    commit?: (persisted?: { versionId?: string; versionNumber?: number }) => Promise<RegisteredLiveMutationHookResult | void>;
    /** Undoes the agent's change; `rolledBackVersionId` is the version row the manager is discarding, if it persisted one. */
    rollback?: (rolledBackVersionId?: string) => Promise<void> | void;
}
export type ArtifactLiveMutationHookResult = RegisteredLiveMutationHookResult;

interface PendingSyncWaiterEntry {
    settle: (synced: boolean) => void;
    isSatisfied?: () => boolean;
}

interface ArtifactDelegateProjection {
    ID: string;
    UserID?: string | null;
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
    private static readonly MAX_TRACKED_COMPACTED_VECTORS_PER_ARTIFACT = 8;
    private static readonly MAX_INLINE_RELAY_DOC_UPDATE_BYTES = 262_144;
    private static readonly SYNC_WAIT_TIMEOUT_MS = 1500;
    private static readonly MAX_CONTROLLED_CLIENT_IDS_PER_CONN = 32;
    private static readonly MAX_AGENT_CLOCK_HIGH_WATER_ENTRIES = 10_000;
    private static readonly COMPACTION_LEASE_TTL_MS = 15_000;

    private static getSharedCollabState(): {
        CompactedStateVectors: Map<
            string,
            {
                OriginServerID: string;
                SavedStateVectorB64: string;
                SavedSnapshotB64?: string;
                VersionID: string;
                ContentHash: string;
            }
        >;
        CompactedVectorKeysByArtifact: Map<string, Array<{ verKey: string; artKey: string }>>;
        InFlightCompactionVersionIds: Set<string>;
        ServerVersionWatermarks: Map<string, ServerPersistedWatermark>;
    } {
        const store = GetGlobalObjectStore();
        const storeKey = '___SINGLETON__MJ_COLLAB_SHARED_STATE';
        if (!store[storeKey]) {
            store[storeKey] = {
                CompactedStateVectors: new Map(),
                CompactedVectorKeysByArtifact: new Map(),
                InFlightCompactionVersionIds: new Set<string>(),
                ServerVersionWatermarks: new Map<string, ServerPersistedWatermark>(),
            };
        }
        const state = store[storeKey] as {
            CompactedStateVectors: Map<
                string,
                {
                    OriginServerID: string;
                    SavedStateVectorB64: string;
                    SavedSnapshotB64?: string;
                    VersionID: string;
                    ContentHash: string;
                }
            >;
            CompactedVectorKeysByArtifact: Map<string, Array<{ verKey: string; artKey: string }>>;
            InFlightCompactionVersionIds: Set<string>;
            ServerVersionWatermarks?: Map<string, ServerPersistedWatermark>;
        };
        if (!state.ServerVersionWatermarks) {
            state.ServerVersionWatermarks = new Map<string, ServerPersistedWatermark>();
        }
        return state as {
            CompactedStateVectors: Map<
                string,
                {
                    OriginServerID: string;
                    SavedStateVectorB64: string;
                    SavedSnapshotB64?: string;
                    VersionID: string;
                    ContentHash: string;
                }
            >;
            CompactedVectorKeysByArtifact: Map<string, Array<{ verKey: string; artKey: string }>>;
            InFlightCompactionVersionIds: Set<string>;
            ServerVersionWatermarks: Map<string, ServerPersistedWatermark>;
        };
    }

    private readonly _serverInstanceId = `collab-${randomUUID()}`;
    private readonly _rooms = new Map<string, CollaborationRoom>();
    private readonly _providersByKey = new Map<string, IMetadataProvider>();
    private readonly _roomInitPromises = new Map<string, Promise<CollaborationRoom>>();
    private readonly _tickets = new Map<string, StoredCollaborationTicket>();
    private readonly _consumedTickets = new Map<string, number>();
    private readonly _pendingSyncWaiters = new Map<string, Set<PendingSyncWaiterEntry>>();
    private readonly _pendingUpgradesByArtifact = new Map<string, number>();
    private readonly _detachedAgentPresence = new Map<string, DetachedAgentPresenceEntry>();
    private readonly _agentClientClockHighWater = new Map<string, number>();
    private _relay: IYjsRoomRelay = new InMemoryYjsRoomRelay();
    private _dataSources: DataSourceInfo[] = [];
    private _providerOverride: IMetadataProvider | null = null;
    private _authOverride: ((req: IncomingMessage) => Promise<UserInfo | null>) | null = null;
    private _ticketHmacSecretOverride: string | null = null;
    private _ticketReplayStore: TicketReplayStore | null = null;
    private _unsubscribePermissionEngine: (() => void) | null = null;
    private _globalMutationSub: { unsubscribe: () => void } | null = null;
    private _ownedLiveMutationHook:
        | ((evt: RegisteredLiveMutationEvent) => Promise<RegisteredLiveMutationHookResult | void>)
        | null = null;
    private _ownedLiveContentReaderHook:
        | ((artifactId: string, contextUser?: UserInfo) => Promise<ArtifactLiveRoomSnapshot | null> | ArtifactLiveRoomSnapshot | null)
        | null = null;
    private _ownedAgentPresenceHook:
        | ((evt: ArtifactAgentPresenceEvent) => Promise<void> | void)
        | null = null;
    private _agentPresenceThrottleMs: number = DEFAULT_AGENT_PRESENCE_THROTTLE_MS;
    private _agentPresenceDecayMs: number = DEFAULT_AGENT_PRESENCE_DECAY_MS;
    private _agentPresenceTtlMs: number = DEFAULT_AGENT_PRESENCE_TTL_MS;
    private _agentPresenceExitGraceMs: number = DEFAULT_AGENT_PRESENCE_EXIT_GRACE_MS;
    private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private _idleRoomTtlMs: number = DEFAULT_IDLE_ROOM_TTL_MS;
    private _heartbeatIntervalMs: number = DEFAULT_COLLABORATION_HEARTBEAT_MS;
    private _shutdownRegistered = false;
    private _shuttingDown = false;
    private _startupSecretsChecked = false;

    protected constructor() {
        super();
        RegisterWorkingStateContentDeserializer((raw) => this.DeserializeWorkingStateBytesToContent(raw));
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
        if (!this._shuttingDown) {
            this.ensureGlobalMutationListenerRegistered();
        }
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
        if (provider && !this._shuttingDown) {
            this.ensureGlobalMutationListenerRegistered();
        }
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
     * Configures AI agent presence awareness timings (throttle, working->settled decay, hard TTL, and exit grace).
     */
    public SetAgentPresenceTimings(options: {
        throttleMs?: number;
        decayMs?: number;
        ttlMs?: number;
        exitGraceMs?: number;
    }): void {
        if (typeof options.throttleMs === 'number') {
            this._agentPresenceThrottleMs = Math.max(0, options.throttleMs);
        }
        if (typeof options.decayMs === 'number') {
            this._agentPresenceDecayMs = Math.max(10, options.decayMs);
        }
        if (typeof options.ttlMs === 'number') {
            this._agentPresenceTtlMs = Math.max(20, options.ttlMs);
        }
        if (typeof options.exitGraceMs === 'number') {
            this._agentPresenceExitGraceMs = Math.max(0, options.exitGraceMs);
        }
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

    private resolveProviderKey(provider?: IMetadataProvider | null, _user?: UserInfo | null): string {
        const effectiveProvider = provider ?? this.activeProvider();
        if (effectiveProvider) {
            const candidate = effectiveProvider as IMetadataProvider & {
                ProviderKey?: string;
                InstanceConnectionString?: string;
                ConfigData?: {
                    MJCoreSchemaName?: string;
                    Database?: string;
                    ConnectionString?: string;
                };
            };
            if (typeof candidate.ProviderKey === 'string' && candidate.ProviderKey.trim().length > 0) {
                return candidate.ProviderKey.trim().toLowerCase();
            }
            const cfgKeyParts = [
                candidate.ConfigData?.Database,
                candidate.ConfigData?.MJCoreSchemaName,
                candidate.InstanceConnectionString ?? candidate.ConfigData?.ConnectionString,
            ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
            if (cfgKeyParts.length > 0) {
                return createHash('sha256').update(cfgKeyParts.join('|'), 'utf8').digest('hex').slice(0, 16);
            }
        }
        return 'default';
    }

    private getRoomKey(
        artifactId: string,
        provider?: IMetadataProvider | null,
        user?: UserInfo | null
    ): string {
        const normId = NormalizeUUID((artifactId ?? '').trim());
        const providerKey = this.resolveProviderKey(provider, user);
        return `${providerKey}::${normId}`;
    }

    private relayKeyForRoom(artifactId: string, providerKey: string): string {
        const cleanId = (artifactId ?? '').trim().toLowerCase();
        if (!providerKey || providerKey === 'default') {
            return cleanId;
        }
        return `${providerKey}::${NormalizeUUID(cleanId)}`;
    }

    private recordServerWatermark(room: CollaborationRoom): void {
        const shared = ArtifactCollaborationServer.getSharedCollabState();
        shared.ServerVersionWatermarks.set(room.RoomKey, {
            BaseVersionID: room.BaseVersionID ?? null,
            BaseVersionNumber: Math.max(room.BaseVersionNumber ?? 0, room.RejectedOobVersionNumber ?? 0),
            BaseVersionText: room.BaseVersionText ?? '',
            LastAppliedRestoreVersionID: room.LastAppliedRestoreVersionID ?? null,
            LastAppliedRestoreVersionNumber: room.LastAppliedRestoreVersionNumber ?? 0,
            UpdatedAtMs: Date.now(),
        });
    }

    private parseSuggestionArray(raw: ArtifactJsonValue | undefined): ArtifactJsonValue[] {
        if (!Array.isArray(raw)) {
            return [];
        }
        const out: ArtifactJsonValue[] = [];
        for (const item of raw) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const candidate = item as { SuggestionID?: ArtifactJsonValue };
                if (typeof candidate.SuggestionID === 'string' && candidate.SuggestionID.trim().length > 0) {
                    out.push(item);
                }
            }
        }
        return out;
    }

    private readSuggestionsFromVersionConfiguration(configRaw?: string | null): ArtifactJsonValue[] {
        if (!configRaw || typeof configRaw !== 'string' || configRaw.trim().length === 0) {
            return [];
        }
        try {
            const parsed = JSON.parse(configRaw) as { suggestions?: ArtifactJsonValue };
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return this.parseSuggestionArray(parsed.suggestions);
            }
        } catch {
            // Non-JSON configuration
        }
        return [];
    }

    private readSuggestionsFromDoc(doc: Y.Doc): ArtifactJsonValue[] {
        const map = doc.getMap<string>('suggestions');
        if (map.size === 0) {
            return [];
        }
        const list: Array<{ CreatedAt: string; SuggestionID: string; Raw: ArtifactJsonValue }> = [];
        for (const [id, jsonStr] of map.entries()) {
            if (typeof jsonStr !== 'string' || jsonStr.trim().length === 0) {
                continue;
            }
            try {
                const parsed = JSON.parse(jsonStr) as { CreatedAt?: ArtifactJsonValue; SuggestionID?: ArtifactJsonValue };
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const effectiveId =
                        typeof parsed.SuggestionID === 'string' && parsed.SuggestionID.trim().length > 0
                            ? parsed.SuggestionID.trim()
                            : id;
                    const createdAt = typeof parsed.CreatedAt === 'string' ? parsed.CreatedAt : '';
                    list.push({
                        CreatedAt: createdAt,
                        SuggestionID: effectiveId,
                        Raw: parsed as ArtifactJsonValue
                    });
                }
            } catch {
                // Skip malformed entry
            }
        }
        list.sort((a, b) => {
            if (a.CreatedAt !== b.CreatedAt) {
                return a.CreatedAt < b.CreatedAt ? -1 : 1;
            }
            return a.SuggestionID.localeCompare(b.SuggestionID);
        });
        return list.map((entry) => entry.Raw);
    }

    private syncSuggestionsIntoDoc(
        doc: Y.Doc,
        suggestions: ArtifactJsonValue[],
        options?: { replace?: boolean }
    ): boolean {
        const map = doc.getMap<string>('suggestions');
        const nextById = new Map<string, string>();
        for (const item of suggestions) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const candidate = item as { SuggestionID?: ArtifactJsonValue };
                if (typeof candidate.SuggestionID === 'string' && candidate.SuggestionID.trim().length > 0) {
                    nextById.set(candidate.SuggestionID.trim(), JSON.stringify(item));
                }
            }
        }
        let changed = false;
        for (const [id, serialized] of nextById.entries()) {
            if (map.get(id) !== serialized) {
                map.set(id, serialized);
                changed = true;
            }
        }
        if (options?.replace === true) {
            for (const existingId of Array.from(map.keys())) {
                if (!nextById.has(existingId)) {
                    map.delete(existingId);
                    changed = true;
                }
            }
        }
        return changed;
    }

    private mergeConfigurationWithSuggestions(
        baseConfigRaw: string | null | undefined,
        suggestions: ArtifactJsonValue[]
    ): string | null {
        let baseObj: Record<string, ArtifactJsonValue> | null = null;
        if (baseConfigRaw && typeof baseConfigRaw === 'string' && baseConfigRaw.trim().length > 0) {
            try {
                const parsed = JSON.parse(baseConfigRaw) as Record<string, ArtifactJsonValue>;
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    baseObj = { ...parsed };
                }
            } catch {
                baseObj = null;
            }
        }
        if (!baseObj) {
            if (suggestions.length === 0) {
                return baseConfigRaw ?? null;
            }
            baseObj = {};
        }
        if (suggestions.length > 0) {
            baseObj['suggestions'] = suggestions;
        } else if ('suggestions' in baseObj) {
            baseObj['suggestions'] = [];
        }
        return JSON.stringify(baseObj);
    }

    private findRoomForArtifact(
        artifactId: string,
        provider?: IMetadataProvider | null,
        user?: UserInfo | null
    ): CollaborationRoom | undefined {
        const scoped = this._rooms.get(this.getRoomKey(artifactId, provider, user));
        if (scoped) {
            return scoped;
        }
        if (!provider) {
            const normalized = NormalizeUUID((artifactId ?? '').trim());
            const matches: CollaborationRoom[] = [];
            for (const room of this._rooms.values()) {
                if (NormalizeUUID(room.ArtifactID) === normalized) {
                    matches.push(room);
                }
            }
            if (matches.length === 1) {
                return matches[0];
            }
            if (matches.length > 1) {
                const userProviderKey = this.resolveProviderKey(null, user);
                const exactUserTenantRoom = matches.find((m) => m.ProviderKey === userProviderKey);
                if (exactUserTenantRoom) {
                    return exactUserTenantRoom;
                }
                // Multiple distinct providers/tenants hold rooms for the same ArtifactID; fail closed.
                return undefined;
            }
        }
        return undefined;
    }

    /** Returns `true` when an in-memory collaboration room is currently loaded for `artifactId`. */
    public HasActiveRoom(artifactId: string, provider?: IMetadataProvider | null): boolean {
        if (!artifactId || artifactId.trim().length === 0) {
            return false;
        }
        if (this._rooms.has(this.getRoomKey(artifactId, provider))) {
            return true;
        }
        if (!provider) {
            const normalized = NormalizeUUID(artifactId.trim());
            let matchCount = 0;
            for (const room of this._rooms.values()) {
                if (NormalizeUUID(room.ArtifactID) === normalized) {
                    matchCount += 1;
                }
            }
            if (matchCount === 1) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns the serialized content and base configuration of a currently active in-memory room
     * for lock validation (e.g. before persisting a version restore, `B2`), or `null` if no room
     * is active (or room resolution is ambiguous across tenants).
     */
    public GetActiveRoomLockBaseline(
        artifactId: string,
        provider?: IMetadataProvider | null,
        user?: UserInfo | null
    ): { Content: string; Configuration: string | null } | null {
        const room = this.findRoomForArtifact(artifactId, provider, user);
        if (!room) {
            return null;
        }
        return {
            Content: this.extractRoomSerializedContent(room.Doc),
            Configuration: room.BaseConfiguration ?? null
        };
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
        this.ensureGlobalMutationListenerRegistered();
        this.pruneExpiredTickets();

        const secret = this.getTicketHmacSecret();
        if (!secret) {
            throw new CollaborationSecretUnconfiguredError(
                'Collaboration ticket signing secret (MJ_ARTIFACT_COLLAB_HMAC_SECRET, >= 32 bytes) must be configured before issuing WebSocket collaboration tickets.'
            );
        }

        const artifactId = (params.ArtifactID ?? '').trim();
        if (!artifactId) {
            throw new Error('IssueTicket requires a non-empty ArtifactID.');
        }
        const providerKey = this.resolveProviderKey(params.Provider ?? null, params.User);
        if (params.Provider) {
            this._providersByKey.set(providerKey, params.Provider);
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
        const hasApiKeyHash = typeof params.ApiKeyHash === 'string' && params.ApiKeyHash.trim().length > 0;
        const payloadJson = JSON.stringify({
            n: nonce,
            a: artifactId,
            pk: providerKey,
            u: params.User.ID,
            i: issuedAtMs,
            e: expiresAtMs,
            ...(hasApiKeyHash ? { ak: true } : {}),
            ...(typeof params.TokenExpiresAtMs === 'number' && Number.isFinite(params.TokenExpiresAtMs)
                ? { te: params.TokenExpiresAtMs }
                : {})
        });
        const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
        const sigB64 = createHmac('sha256', secret)
            .update(payloadB64, 'utf8')
            .digest('base64url');
        const ticket = `${payloadB64}.${sigB64}`;

        if (hasApiKeyHash && this._ticketReplayStore?.SetTicketData) {
            try {
                const pendingSet = this._ticketReplayStore.SetTicketData(
                    nonce,
                    JSON.stringify({ ApiKeyHash: params.ApiKeyHash }),
                    (ttlSeconds + 5) * 1000
                );
                if (pendingSet && typeof (pendingSet as Promise<void>).catch === 'function') {
                    void (pendingSet as Promise<void>).catch((err) => {
                        LogError(
                            `ArtifactCollaborationServer.IssueTicket failed to store ticket metadata in replay store: ${
                                err instanceof Error ? err.message : String(err)
                            }`
                        );
                    });
                }
            } catch (err) {
                LogError(
                    `ArtifactCollaborationServer.IssueTicket failed to store ticket metadata in replay store: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        }

        this._tickets.set(ticket, {
            Nonce: nonce,
            ArtifactID: artifactId,
            ProviderKey: providerKey,
            Provider: params.Provider ?? null,
            User: params.User,
            ApiKeyHash: params.ApiKeyHash,
            IssuedAtMs: issuedAtMs,
            ExpiresAtMs: expiresAtMs,
            TokenExpiresAtMs: params.TokenExpiresAtMs
        });

        return {
            Ticket: ticket,
            ExpiresAt: new Date(expiresAtMs).toISOString()
        };
    }

    /**
     * Atomically consumes a single-use collaboration ticket and verifies its HMAC signature,
     * server-capped TTL, provider scope, and `expectedArtifactId` (`A3`, `Blocker 1`).
     */
    public async ConsumeTicket(
        ticket: string,
        expectedArtifactId: string,
        expectedProvider?: IMetadataProvider | null
    ): Promise<AuthenticatedUpgradeResult | null> {
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
                pk?: string;
                u?: string;
                k?: string;
                i?: number;
                e?: number;
                te?: number;
                ak?: boolean;
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
            const ticketProviderKey = entry?.ProviderKey ?? parsed.pk;
            const currentProviderKey = expectedProvider
                ? this.resolveProviderKey(expectedProvider, user)
                : ticketProviderKey ?? this.resolveProviderKey(null, user);
            if (ticketProviderKey && expectedProvider && ticketProviderKey !== currentProviderKey) {
                return null;
            }
            const resolvedTicketProvider =
                expectedProvider ??
                entry?.Provider ??
                (ticketProviderKey ? this._providersByKey.get(ticketProviderKey) : undefined) ??
                null;
            const tokenExpiresAtMs = entry?.TokenExpiresAtMs ?? parsed.te;
            if (typeof tokenExpiresAtMs === 'number' && Number.isFinite(tokenExpiresAtMs) && tokenExpiresAtMs <= now) {
                return null;
            }
            let apiKeyHash = entry?.ApiKeyHash;
            if (!apiKeyHash && parsed.ak && this._ticketReplayStore?.GetAndDeleteTicketData) {
                try {
                    const metaRaw = await this._ticketReplayStore.GetAndDeleteTicketData(parsed.n);
                    if (metaRaw) {
                        const metaParsed = JSON.parse(metaRaw) as { ApiKeyHash?: string };
                        if (typeof metaParsed?.ApiKeyHash === 'string' && metaParsed.ApiKeyHash.trim().length > 0) {
                            apiKeyHash = metaParsed.ApiKeyHash;
                        }
                    }
                } catch {
                    apiKeyHash = undefined;
                }
            }
            // Fail closed on cross-replica API-key tickets if ApiKeyHash cannot be recovered (`N2`).
            if (parsed.ak && !apiKeyHash) {
                return null;
            }
            return {
                User: user,
                ApiKeyHash: apiKeyHash,
                TokenExpiresAtMs: tokenExpiresAtMs,
                ProviderKey: ticketProviderKey ?? currentProviderKey,
                Provider: resolvedTicketProvider
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
        this.ensureGlobalMutationListenerRegistered();
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
        visitedRoomKeys?: Set<string>,
        providerOverride?: IMetadataProvider | null
    ): Promise<void> {
        const normalizedId = (artifactId ?? '').trim();
        if (!normalizedId) {
            return;
        }
        const visitKey = providerOverride
            ? this.getRoomKey(normalizedId, providerOverride)
            : normalizedId.toLowerCase();
        const visited = visitedRoomKeys ?? new Set<string>();
        if (visited.has(visitKey)) {
            return;
        }
        visited.add(visitKey);

        const matchingRooms: CollaborationRoom[] = [];
        if (providerOverride) {
            const scoped = this._rooms.get(this.getRoomKey(normalizedId, providerOverride));
            if (scoped) matchingRooms.push(scoped);
        } else {
            const normTargetId = NormalizeUUID(normalizedId);
            for (const candidate of this._rooms.values()) {
                if (NormalizeUUID(candidate.ArtifactID) === normTargetId) {
                    matchingRooms.push(candidate);
                }
            }
        }

        if (publishRelay) {
            try {
                const relayProviderKey = matchingRooms[0]?.ProviderKey ?? this.resolveProviderKey(providerOverride);
                await this._relay.PublishToRoom({
                    ArtifactID: normalizedId,
                    ProviderKey: relayProviderKey,
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

        for (const room of matchingRooms) {
            const provider = this._providerOverride ?? room.Provider ?? this.activeProvider();
            const nowMs = Date.now();
            for (const conn of Array.from(room.Connections)) {
                if (targetUserId && !UUIDsEqual(conn.User.ID, targetUserId)) {
                    continue;
                }

                const tokenExpired =
                    typeof conn.TokenExpiresAtMs === 'number' &&
                    Number.isFinite(conn.TokenExpiresAtMs) &&
                    conn.TokenExpiresAtMs <= nowMs;
                const isActive = !tokenExpired && this.isUserStillActive(conn.User);
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
                    const reason = tokenExpired
                        ? 'Authentication token has expired.'
                        : !isActive
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
                        conn.Socket.close(WS_CLOSE_FORBIDDEN, tokenExpired ? 'Token expired' : 'Read permission revoked');
                    } catch {
                        // Ignore socket close error
                    }
                    if (room.Connections.size === 0) {
                        this.handleRoomBecameEmpty(room, conn.User);
                    }
                } else {
                    conn.IsOwner = perms.Source === 'Owner';
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
                candidateRoom.DelegateRecordID.trim().toLowerCase() === normalizedId.toLowerCase();
            if (matchesParent) {
                await this.ReevaluateRoomPermissions(
                    candidateRoom.ArtifactID,
                    targetUserId,
                    publishRelay,
                    visited,
                    candidateRoom.Provider
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
    public async FlushWorkingState(
        artifactId: string,
        contextUser: UserInfo,
        options?: { guardNewerPersistedVersion?: boolean; provider?: IMetadataProvider | null }
    ): Promise<boolean> {
        this.ensureShutdownRegistered();
        const room = this.findRoomForArtifact(artifactId, options?.provider ?? null, contextUser);
        if (!room) {
            return false;
        }
        const key = room.RoomKey;
        if (room.WorkingStateTimer) {
            clearTimeout(room.WorkingStateTimer);
            room.WorkingStateTimer = null;
        }

        const executeSerializedFlush = async (): Promise<boolean> => {
            if (this._rooms.get(key) !== room) {
                return false;
            }
            const provider = this._providerOverride ?? room.Provider ?? this.activeProvider();
            const actor = contextUser ?? room.LastModifiedByUser;
            const persistenceUser = UserCache.Instance.GetSystemUser() ?? actor;
            if (!provider || !actor || !persistenceUser) {
                return false;
            }

            try {
                // Encode Y.Doc state inside the serialized queue task so we always persist the latest state
                let stateBytes = Y.encodeStateAsUpdate(room.Doc);
                let stateBase64 = BytesToBase64(stateBytes);
                const rv = RunView.FromMetadataProvider(provider);
                const existingRes = await rv.RunView<Record<string, string | number | Uint8Array | Date | null>>(
                    {
                        EntityName: 'MJ: Artifact Working States',
                        ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                        Fields: ['ID', 'ArtifactID', 'YjsState', 'LastModifiedByUserID', '__mj_UpdatedAt'],
                        IncludeBinaryFields: true,
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    },
                    persistenceUser
                );

                const existingRow =
                    existingRes.Success && existingRes.Results && existingRes.Results.length > 0
                        ? existingRes.Results[0]
                        : undefined;

                if (options?.guardNewerPersistedVersion) {
                    // P0-13: Evaluate version progression exclusively from trusted server watermarks
                    // and DB version/working-state rows — NEVER read watermarks from client-writable Y.Map('meta').
                    const sharedState = ArtifactCollaborationServer.getSharedCollabState();
                    const effectiveRoomVersion = Math.max(
                        room.BaseVersionNumber,
                        room.RejectedOobVersionNumber ?? 0
                    );
                    const serverWatermark = sharedState.ServerVersionWatermarks.get(room.RoomKey);
                    if (serverWatermark && serverWatermark.BaseVersionNumber > effectiveRoomVersion) {
                        return false;
                    }
                    const existingUpdatedRaw = existingRow?.['__mj_UpdatedAt'];
                    const existingUpdatedMs =
                        existingUpdatedRaw instanceof Date
                            ? existingUpdatedRaw.getTime()
                            : typeof existingUpdatedRaw === 'string' && existingUpdatedRaw.length > 0
                              ? new Date(existingUpdatedRaw).getTime()
                              : NaN;
                    const knownPersistedMs = room.LastPersistedWorkingStateMs ?? 0;
                    if (
                        existingRow?.['YjsState'] &&
                        Number.isFinite(existingUpdatedMs) &&
                        existingUpdatedMs > knownPersistedMs
                    ) {
                        const latestVerRes = await rv.RunView<{ VersionNumber: number }>(
                            {
                                EntityName: 'MJ: Artifact Versions',
                                ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                                OrderBy: 'VersionNumber DESC',
                                Fields: ['VersionNumber'],
                                MaxRows: 1,
                                SkipTotalRowCount: true,
                                ResultType: 'simple'
                            },
                            persistenceUser
                        );
                        const latestVerNum =
                            latestVerRes.Success && latestVerRes.Results && latestVerRes.Results.length > 0
                                ? Number(latestVerRes.Results[0].VersionNumber ?? 0)
                                : 0;
                        if (Number.isFinite(latestVerNum) && latestVerNum > effectiveRoomVersion) {
                            return false;
                        }
                    }
                }

                const entity = await provider.GetEntityObject<MJArtifactWorkingStateEntity>(
                    'MJ: Artifact Working States',
                    persistenceUser
                );
                if (existingRow) {
                    await entity.LoadFromData(normalizeWorkingStateRowForEntity(existingRow));
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
                    const updatedRaw = entity.__mj_UpdatedAt;
                    const updatedMs =
                        updatedRaw instanceof Date
                            ? updatedRaw.getTime()
                            : Date.now();
                    room.LastPersistedWorkingStateMs = Number.isFinite(updatedMs) ? updatedMs : Date.now();
                    this.recordServerWatermark(room);
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
    private async resolveArtifactTypeThumbnailPolicyForRoom(
        provider: IMetadataProvider,
        artifactId: string,
        queryUser: UserInfo,
        room: CollaborationRoom
    ): Promise<{
        TypeEntity: MJArtifactTypeEntity | null;
        AllTypes: ReadonlyArray<MJArtifactTypeEntity>;
        Policy: ArtifactTypeThumbnailPolicy;
    }> {
        let typeEntity: MJArtifactTypeEntity | null = null;
        let allTypes: ReadonlyArray<MJArtifactTypeEntity> = [];
        try {
            await ArtifactMetadataEngine.Instance.Config(false, queryUser, provider);
            allTypes = ArtifactMetadataEngine.Instance.ArtifactTypes ?? [];
            const rv = RunView.FromMetadataProvider(provider);
            const artRes = await rv.RunView<{ ID: string; TypeID?: string | null }>(
                {
                    EntityName: 'MJ: Artifacts',
                    ExtraFilter: `ID='${EscapeSQLString(artifactId)}'`,
                    Fields: ['ID', 'TypeID'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                queryUser
            );
            const typeId = artRes.Success ? artRes.Results?.[0]?.TypeID : null;
            if (typeId) {
                typeEntity = allTypes.find((t) => UUIDsEqual(t.ID, typeId)) ?? null;
            }
        } catch {
            // Fall back safely when unit-test mocks omit ArtifactMetadataEngine or MJ: Artifacts rows
        }

        let driverHint: string | null = typeEntity?.DriverClass ?? null;
        if (!typeEntity && !driverHint) {
            if (room.Doc.getMap('worksheetsById').size > 0) {
                driverHint = 'SpreadsheetArtifactViewerPlugin';
            } else if (room.Doc.getMap('slidesById').size > 0) {
                driverHint = 'SlideDeckArtifactViewerPlugin';
            }
        }

        const policy = ResolveArtifactTypeThumbnailPolicy(typeEntity, allTypes, driverHint);
        return { TypeEntity: typeEntity, AllTypes: allTypes, Policy: policy };
    }

    public async CompactRoomToArtifactVersion(
        artifactId: string,
        contextUser: UserInfo,
        options?: { CapturedThumbnailDataUrl?: string | null; Provider?: IMetadataProvider | null }
    ): Promise<{ Saved: boolean; VersionID?: string; VersionNumber?: number }> {
        this.ensureShutdownRegistered();
        const resolvedProvider = options?.Provider ?? this.activeProvider();
        if (!resolvedProvider || !contextUser) {
            return { Saved: false };
        }
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
            resolvedProvider,
            artifactId,
            contextUser
        );
        if (!perms.CanEdit) {
            return { Saved: false };
        }

        const room = await this.GetOrCreateRoom(artifactId, contextUser, resolvedProvider);
        if (!room) {
            return { Saved: false };
        }

        const runCompaction = async (): Promise<{ Saved: boolean; VersionID?: string; VersionNumber?: number }> => {
            const provider = room.Provider ?? resolvedProvider;
            const relayKey = this.relayKeyForRoom(room.ArtifactID, room.ProviderKey);
            let leaseHeld = false;
            if (this._relay.TryAcquireCompactionLease) {
                leaseHeld = await this._relay.TryAcquireCompactionLease(
                    relayKey,
                    ArtifactCollaborationServer.COMPACTION_LEASE_TTL_MS
                );
                if (!leaseHeld) {
                    await new Promise((r) => setTimeout(r, 100));
                    leaseHeld = await this._relay.TryAcquireCompactionLease(
                        relayKey,
                        ArtifactCollaborationServer.COMPACTION_LEASE_TTL_MS
                    );
                }
            } else {
                leaseHeld = true;
            }
            if (!leaseHeld) {
                return { Saved: false };
            }

            try {
                const rv = RunView.FromMetadataProvider(provider);
                const queryUser = UserCache.Instance.GetSystemUser() ?? contextUser;
                const sharedState = ArtifactCollaborationServer.getSharedCollabState();

                let lastSaveError = 'unknown error';
                for (let attempt = 1; attempt <= MAX_VERSION_SAVE_ATTEMPTS; attempt++) {
            const latestRes = await rv.RunView<{
                ID: string;
                VersionNumber: number;
                Name?: string | null;
                Content?: string | null;
                Configuration?: string | null;
                ContentHash?: string | null;
                Description?: string | null;
                Comments?: string | null;
                UserID?: string | null;
            }>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                    OrderBy: 'VersionNumber DESC',
                    Fields: [
                        'ID',
                        'VersionNumber',
                        'Name',
                        'Content',
                        'Configuration',
                        'ContentHash',
                        'Description',
                        'Comments',
                        'UserID'
                    ],
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
                latest.VersionNumber > room.BaseVersionNumber &&
                !(
                    (room.LastAppliedRestoreVersionID !== null &&
                        UUIDsEqual(room.LastAppliedRestoreVersionID, latest.ID)) ||
                    (room.RejectedOobVersionNumber ?? 0) >= latest.VersionNumber
                )
            ) {
                const latestText = latest.Content || latest.Configuration || '';
                const latestHash = latest.ContentHash || this.computeSha256Hex(latestText);
                const tracked = this.lookupVerifiedCompactedStateVector(
                    room.ArtifactID,
                    latest.ID,
                    latest.VersionNumber,
                    latestHash,
                    room.ProviderKey
                );
                this.reconcileOutOfBandVersionIntoRoom(room, latest, {
                    originServerId: tracked?.OriginServerID,
                    savedStateVectorB64: tracked?.SavedStateVectorB64,
                    savedSnapshotB64: tracked?.SavedSnapshotB64,
                    savedContentHash: latestHash,
                    actorUserId: latest.UserID ?? undefined
                });
            }

            const currentContent = await this.extractRoomSerializedContentIsolated(room.Doc);
            const roomSuggestions = this.readSuggestionsFromDoc(room.Doc);
            const latestSuggestions = latest
                ? this.readSuggestionsFromVersionConfiguration(latest.Configuration)
                : [];
            const suggestionsUnchanged =
                JSON.stringify(roomSuggestions) === JSON.stringify(latestSuggestions);
            const preMetaStateVectorB64 = BytesToBase64(Y.encodeStateVector(room.Doc));
            const contentHash = createHash('sha256').update(currentContent, 'utf8').digest('hex');

            if (
                latest &&
                suggestionsUnchanged &&
                !room.PreserveLiveConfiguration &&
                (latest.ContentHash === contentHash || latest.Content === currentContent)
            ) {
                room.DirtyVersion = false;
                room.CompactionRetryCount = 0;
                room.BaseVersionID = latest.ID;
                room.BaseVersionNumber = latest.VersionNumber;
                room.BaseVersionText = currentContent;
                room.BaseConfiguration = latest.Configuration ?? null;
                room.PreserveLiveConfiguration = false;
                room.RejectedOobVersionNumber = undefined;
                this.recordServerWatermark(room);
                const keepMetaKey = `art:${NormalizeUUID(room.ArtifactID)}:v:${latest.VersionNumber}`;
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    meta.set('versionNumber', latest.VersionNumber);
                    meta.set('versionId', latest.ID);
                    meta.set('baseVersionNumber', latest.VersionNumber);
                    meta.set('baseVersionId', latest.ID);
                    if (meta.has('baseContent')) {
                        meta.delete('baseContent');
                    }
                    this.pruneArtifactVersionMetaKeys(meta, meta.has(keepMetaKey) ? keepMetaKey : undefined);
                }, 'version-meta');
                room.LastCompactedStateVector = Y.encodeStateVector(room.Doc);
                if (room.DirtyWorkingState) {
                    await this.FlushWorkingState(artifactId, contextUser, { provider });
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
                await this.FlushWorkingState(artifactId, contextUser, { provider });
            }

            const nextVersionNumber = (latest?.VersionNumber ?? 0) + 1;
            const versionEntity = await provider.GetEntityObject<MJArtifactVersionEntity>(
                'MJ: Artifact Versions',
                contextUser
            );
            versionEntity.NewRecord();
            versionEntity.ArtifactID = room.ArtifactID;
            versionEntity.VersionNumber = nextVersionNumber;
            if (latest?.Name) {
                versionEntity.Name = latest.Name;
            }
            versionEntity.UserID = contextUser.ID;
            versionEntity.Content = currentContent;
            versionEntity.ContentHash = contentHash;
            const { TypeEntity, AllTypes, Policy } = await this.resolveArtifactTypeThumbnailPolicyForRoom(
                provider,
                room.ArtifactID,
                queryUser,
                room
            );
            const rawBaseConfig =
                room.Doc.getMap('worksheetsById').size > 0
                    ? currentContent
                    : room.PreserveLiveConfiguration && room.BaseConfiguration != null
                      ? room.BaseConfiguration
                      : (latest?.Configuration ?? room.BaseConfiguration ?? null);
            const enrichedConfig = BuildArtifactVersionConfigurationWithPreview(
                rawBaseConfig,
                currentContent,
                TypeEntity?.DriverClass ?? null,
                latest?.Name ?? null,
                {
                    Policy,
                    ArtifactType: TypeEntity,
                    AllArtifactTypes: AllTypes,
                    CapturedThumbnailDataUrl: options?.CapturedThumbnailDataUrl ?? null
                }
            );
            const baseConfigForSuggestions =
                enrichedConfig ?? (room.Doc.getMap('worksheetsById').size > 0 ? currentContent : rawBaseConfig);
            const finalConfig =
                roomSuggestions.length > 0 || latestSuggestions.length > 0
                    ? this.mergeConfigurationWithSuggestions(baseConfigForSuggestions, roomSuggestions)
                    : baseConfigForSuggestions;
            if (finalConfig) {
                versionEntity.Configuration = finalConfig;
            } else if (room.Doc.getMap('worksheetsById').size > 0) {
                versionEntity.Configuration = currentContent;
            }

            if (!versionEntity.ID || versionEntity.ID.trim().length === 0) {
                versionEntity.ID = randomUUID();
            }
            const normPendingVersionId = NormalizeUUID(versionEntity.ID);
            sharedState.InFlightCompactionVersionIds.add(normPendingVersionId);
            MarkTrustedCompactionVersionSave(versionEntity);
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
                sharedState.InFlightCompactionVersionIds.delete(normPendingVersionId);
                if (versionEntity.ID && versionEntity.ID.trim().length > 0) {
                    sharedState.InFlightCompactionVersionIds.delete(NormalizeUUID(versionEntity.ID));
                }
            }

            if (saved) {
                const prevCompactedSv = room.LastCompactedStateVector ?? null;
                room.DirtyVersion = false;
                room.CompactionRetryCount = 0;
                room.BaseVersionID = versionEntity.ID;
                room.BaseVersionNumber = versionEntity.VersionNumber;
                room.BaseVersionText = currentContent;
                room.BaseConfiguration = versionEntity.Configuration ?? null;
                room.PreserveLiveConfiguration = false;
                room.RejectedOobVersionNumber = undefined;
                this.recordServerWatermark(room);
                const versionVectorMetaKey = `art:${NormalizeUUID(room.ArtifactID)}:v:${versionEntity.VersionNumber}`;
                const preMetaSnapshotB64 = BytesToBase64(Y.encodeSnapshot(Y.snapshot(room.Doc)));
                const versionVectorMetaValue = JSON.stringify({
                    sv: preMetaStateVectorB64,
                    ...(preMetaSnapshotB64.length < MAX_META_INLINE_SNAPSHOT_B64_CHARS
                        ? { snap: preMetaSnapshotB64 }
                        : {}),
                    versionId: versionEntity.ID,
                    versionNumber: versionEntity.VersionNumber,
                    contentHash
                });
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    meta.set('versionNumber', versionEntity.VersionNumber);
                    meta.set('versionId', versionEntity.ID);
                    meta.set('baseVersionNumber', versionEntity.VersionNumber);
                    meta.set('baseVersionId', versionEntity.ID);
                    if (meta.has('baseContent')) {
                        meta.delete('baseContent');
                    }
                    meta.set(versionVectorMetaKey, versionVectorMetaValue);
                    this.pruneArtifactVersionMetaKeys(meta, versionVectorMetaKey);
                    meta.set('roomEpoch', room.RoomEpoch);
                }, 'version-meta');

                const postMetaStateVector = Y.encodeStateVector(room.Doc);
                const savedStateVectorB64 = BytesToBase64(postMetaStateVector);
                const savedSnapshotB64 = BytesToBase64(Y.encodeSnapshot(Y.snapshot(room.Doc)));
                const deltaUpdate = prevCompactedSv
                    ? this.encodeSafeDeltaUpdate(room.Doc, prevCompactedSv)
                    : Y.encodeStateAsUpdate(room.Doc);
                const prevStateVectorB64 = prevCompactedSv ? BytesToBase64(prevCompactedSv) : undefined;
                room.LastCompactedStateVector = postMetaStateVector;

                this.recordCompactedStateVector(
                    room.ArtifactID,
                    versionEntity.ID,
                    versionEntity.VersionNumber,
                    savedStateVectorB64,
                    contentHash,
                    savedSnapshotB64,
                    room.ProviderKey
                );

                // Flush working state AFTER saving the version and updating `meta` so the working state
                // timestamp is never older than the version and includes the updated `versionNumber`/`versionId`.
                await this.FlushWorkingState(artifactId, contextUser, { provider });

                this.broadcastControlFrame(room, {
                    action: 'version-saved',
                    versionId: versionEntity.ID,
                    versionNumber: versionEntity.VersionNumber,
                    roomEpoch: room.RoomEpoch
                });

                const savedDocUpdateB64 =
                    deltaUpdate.byteLength <= ArtifactCollaborationServer.MAX_INLINE_RELAY_DOC_UPDATE_BYTES
                        ? BytesToBase64(deltaUpdate)
                        : undefined;
                const versionSavedRelayPayload = JSON.stringify({
                    savedStateVectorB64,
                    savedSnapshotB64,
                    savedContentHash: contentHash,
                    ...(prevStateVectorB64 ? { prevStateVectorB64 } : {}),
                    ...(savedDocUpdateB64 ? { savedDocUpdateB64 } : {})
                });

                try {
                    await this._relay.PublishToRoom({
                        ArtifactID: room.ArtifactID,
                        ProviderKey: room.ProviderKey,
                        MessageType: 'version-saved',
                        PayloadBase64: versionSavedRelayPayload,
                        TargetUserID: versionEntity.UserID ?? contextUser.ID,
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
            } finally {
                if (leaseHeld && this._relay.ReleaseCompactionLease) {
                    try {
                        await this._relay.ReleaseCompactionLease(relayKey);
                    } catch {
                        // Lease will naturally expire by TTL
                    }
                }
            }
        };

        const queued = room.CompactionQueue.then(runCompaction, runCompaction);
        room.CompactionQueue = queued.catch(() => ({ Saved: false }));
        return await queued;
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
        previousContent?: string,
        options?: {
            isRestore?: boolean;
            dryRun?: boolean;
            actorUserId?: string;
            persistedVersionId?: string;
            persistedVersionNumber?: number;
            persistedContent?: string;
            capturedThumbnailDataUrl?: string | null;
            provider?: IMetadataProvider | null;
        }
    ): Promise<{
        Success: boolean;
        VersionID?: string;
        VersionNumber?: number;
        MergedContent?: string;
        ErrorMessage?: string;
        HadConflict?: boolean;
        RejectedAgentHunks?: Array<{
            BaseLines: string[];
            LiveLines: string[];
            RejectedAgentLines: string[];
        }>;
    }> {
        this.ensureShutdownRegistered();
        this.ensureGlobalMutationListenerRegistered();
        const provider = options?.provider ?? this.activeProvider();
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
        const isOwner = perms.Source === 'Owner';

        if (options?.dryRun === true) {
            const tempDoc = new Y.Doc();
            try {
                const liveRoom = this.findRoomForArtifact(artifactId, provider, user);
                if (liveRoom) {
                    Y.applyUpdate(tempDoc, Y.encodeStateAsUpdate(liveRoom.Doc));
                } else {
                    const hasWorking = await this.hasPersistedWorkingState(artifactId, user, provider);
                    if (hasWorking) {
                        const hydratedRoom = await this.GetOrCreateRoom(artifactId, user, provider);
                        if (hydratedRoom) {
                            Y.applyUpdate(tempDoc, Y.encodeStateAsUpdate(hydratedRoom.Doc));
                        }
                    }
                }

                const existingTempContent = this.extractRoomSerializedContent(tempDoc);
                if (options?.isRestore !== true) {
                    const lockValidation = this.validateContentMutationAgainstLocks(
                        existingTempContent,
                        newContent,
                        user.ID,
                        isOwner
                    );
                    if (!lockValidation.Allowed) {
                        return {
                            Success: false,
                            ErrorMessage: lockValidation.Reason
                        };
                    }
                }

                const tempYText = tempDoc.getText('content');
                let mutationMergeResult: ConcurrentDocumentMergeResult | null = null;
                let isStructuredSlideOrSheet = false;

                tempDoc.transact(() => {
                    if (options?.isRestore === true) {
                        if (tempYText.length > 0) {
                            tempYText.delete(0, tempYText.length);
                        }
                        if (newContent.length > 0) {
                            tempYText.insert(0, newContent);
                        }
                        this.syncSlideDeckStructuresIfPresent(tempDoc, newContent);
                        this.syncSpreadsheetStructuresIfPresent(tempDoc, newContent, null);
                    } else {
                        mutationMergeResult = this.applyMinimalTextDiff(
                            tempYText,
                            tempYText.toString(),
                            newContent,
                            previousContent
                        );
                        this.syncSlideDeckStructuresIfPresent(tempDoc, newContent, {
                            preserveConcurrentAdditions: true,
                            baselineContent: previousContent
                        });
                        this.syncSpreadsheetStructuresIfPresent(tempDoc, newContent, null, {
                            preserveConcurrentAdditions: true,
                            baselineContent: previousContent
                        });
                        isStructuredSlideOrSheet =
                            tempDoc.getMap('slidesById').size > 0 ||
                            tempDoc.getMap('worksheetsById').size > 0;
                        if (isStructuredSlideOrSheet) {
                            const mergedSerialized = this.extractRoomSerializedContent(tempDoc);
                            this.applyMinimalTextDiff(tempYText, tempYText.toString(), mergedSerialized);
                        }
                    }
                }, options?.isRestore === true ? 'server-restore' : 'server-agent');

                const mergedContent = this.extractRoomSerializedContent(tempDoc);
                const resolvedMerge = mutationMergeResult as ConcurrentDocumentMergeResult | null;
                const hadConflict = Boolean(
                    options?.isRestore !== true && !isStructuredSlideOrSheet && resolvedMerge?.HadConflict
                );
                const rejectedLineHunks =
                    options?.isRestore !== true && resolvedMerge
                        ? resolvedMerge.RejectedAgentHunks.map((h) => ({
                              BaseLines: this.splitLogicalLineStrings(h.BaseText),
                              LiveLines: this.splitLogicalLineStrings(h.LiveText),
                              RejectedAgentLines: this.splitLogicalLineStrings(h.RejectedIncomingText)
                          }))
                        : [];
                return {
                    Success: true,
                    MergedContent: mergedContent,
                    HadConflict: hadConflict,
                    RejectedAgentHunks: rejectedLineHunks
                };
            } finally {
                tempDoc.destroy();
            }
        }

        const room = await this.GetOrCreateRoom(artifactId, user, provider);
        if (!room) {
            return { Success: false };
        }

        const isRestore = options?.isRestore === true;
        const yText = room.Doc.getText('content');
        const existing = this.extractRoomSerializedContent(room.Doc);
        if (!isRestore) {
            const lockValidation = this.validateContentMutationAgainstLocks(existing, newContent, user.ID, isOwner);
            if (!lockValidation.Allowed) {
                return {
                    Success: false,
                    ErrorMessage: lockValidation.Reason
                };
            }
        }
        const alreadyReconciledFromSameBaseline =
            !isRestore &&
            !saveVersion &&
            typeof previousContent === 'string' &&
            previousContent !== newContent &&
            room.BaseVersionText === newContent &&
            room.LastReconciledBaselineText === previousContent;

        let mutationMergeResult: ConcurrentDocumentMergeResult | null = null;
        let isStructuredSlideOrSheet = false;

        if (alreadyReconciledFromSameBaseline) {
            if (options?.persistedVersionId && UUIDsEqual(room.LastReconciledOobVersionID, options.persistedVersionId)) {
                mutationMergeResult = room.LastReconciledOobMergeResult;
            }
        } else if (isRestore || existing !== newContent) {
            room.PreOutOfBandDocState = Y.encodeStateAsUpdate(room.Doc);
            const nextEpoch = `epoch-${isRestore ? 'restore-' : ''}${Date.now()}-${randomBytes(4).toString('hex')}`;
            room.RoomEpoch = nextEpoch;
            if (isRestore) {
                const isMatchingBase = typeof room.BaseVersionText === 'string' && room.BaseVersionText === newContent;
                const restoreVerId = options?.persistedVersionId ?? (isMatchingBase ? room.BaseVersionID : undefined);
                const restoreVerNum = options?.persistedVersionNumber ?? (isMatchingBase ? room.BaseVersionNumber : undefined);
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    meta.set('roomEpoch', nextEpoch);
                }, 'server-restore');
                this.applyDeterministicRestoreTextToDoc(
                    room.Doc,
                    room.ArtifactID,
                    restoreVerId,
                    restoreVerNum,
                    newContent,
                    'server-restore'
                );
                room.Doc.transact(() => {
                    this.syncSlideDeckStructuresIfPresent(room.Doc, newContent);
                    this.syncSpreadsheetStructuresIfPresent(room.Doc, newContent);
                }, 'server-restore');
            } else {
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    meta.set('roomEpoch', nextEpoch);
                    mutationMergeResult = this.applyMinimalTextDiff(
                        yText,
                        yText.toString(),
                        newContent,
                        previousContent
                    );
                    this.syncSlideDeckStructuresIfPresent(room.Doc, newContent, {
                        preserveConcurrentAdditions: true,
                        baselineContent: previousContent
                    });
                    this.syncSpreadsheetStructuresIfPresent(room.Doc, newContent, null, {
                        preserveConcurrentAdditions: true,
                        baselineContent: previousContent
                    });
                    isStructuredSlideOrSheet =
                        room.Doc.getMap('slidesById').size > 0 ||
                        room.Doc.getMap('worksheetsById').size > 0;
                    if (isStructuredSlideOrSheet) {
                        const mergedSerialized = this.extractRoomSerializedContent(room.Doc);
                        this.applyMinimalTextDiff(yText, yText.toString(), mergedSerialized);
                    }
                }, 'server-agent');
            }
            room.LastModifiedByUser = user;
            room.DirtyWorkingState = true;
            room.DirtyVersion = true;
        }

        const mergedContent = this.extractRoomSerializedContent(room.Doc);
        const resolvedMerge = mutationMergeResult as ConcurrentDocumentMergeResult | null;
        const hadConflict = Boolean(!isRestore && !isStructuredSlideOrSheet && resolvedMerge?.HadConflict);
        const rejectedLineHunks =
            !isRestore && resolvedMerge
                ? resolvedMerge.RejectedAgentHunks.map((h) => ({
                      BaseLines: this.splitLogicalLineStrings(h.BaseText),
                      LiveLines: this.splitLogicalLineStrings(h.LiveText),
                      RejectedAgentLines: this.splitLogicalLineStrings(h.RejectedIncomingText)
                  }))
                : [];

        if (saveVersion) {
            const preCompactVersionId = room.BaseVersionID;
            const compacted = await this.CompactRoomToArtifactVersion(artifactId, user, {
                CapturedThumbnailDataUrl: options?.capturedThumbnailDataUrl ?? null,
                Provider: room.Provider
            });
            if (isRestore) {
                const effectiveVerId = compacted.VersionID ?? room.BaseVersionID ?? undefined;
                const effectiveVerNum = compacted.VersionNumber ?? (room.BaseVersionNumber || undefined);
                if (effectiveVerId) {
                    room.LastAppliedRestoreVersionID = effectiveVerId;
                }
                if (typeof effectiveVerNum === 'number') {
                    room.LastAppliedRestoreVersionNumber = effectiveVerNum;
                }
                if (effectiveVerId || effectiveVerNum) {
                    room.Doc.transact(() => {
                        const meta = room.Doc.getMap('meta');
                        if (effectiveVerId) {
                            meta.set('lastAppliedRestoreVersionId', effectiveVerId);
                        }
                        if (effectiveVerNum) {
                            meta.set('lastAppliedRestoreVersionNumber', effectiveVerNum);
                        }
                    }, 'server-restore');
                }
                if (effectiveVerId && UUIDsEqual(effectiveVerId, preCompactVersionId)) {
                    this.broadcastControlFrame(room, {
                        action: 'version-saved',
                        versionId: effectiveVerId,
                        versionNumber: effectiveVerNum,
                        roomEpoch: room.RoomEpoch
                    });
                }
            } else if (hadConflict && resolvedMerge) {
                this.broadcastMergeConflictFrame(room, {
                    action: 'merge-conflict',
                    versionId: compacted.VersionID ?? room.BaseVersionID ?? undefined,
                    rejectedHunkCount: resolvedMerge.RejectedAgentHunks.length,
                    roomEpoch: room.RoomEpoch,
                    actorUserId: options?.actorUserId ?? user.ID
                });
            }
            const postCompactContent = this.extractRoomSerializedContent(room.Doc);
            if (room.Connections.size === 0 && !this._shuttingDown) {
                this.scheduleIdleRoomDisposal(room);
            }
            return {
                Success: compacted.Saved,
                VersionID: compacted.VersionID,
                VersionNumber: compacted.VersionNumber,
                MergedContent: postCompactContent,
                HadConflict: hadConflict,
                RejectedAgentHunks: rejectedLineHunks
            };
        }

        let broadcastReusedPersistedVersion = false;
        if (isRestore) {
            room.DirtyVersion = false;
            room.BaseVersionText = mergedContent;
            if (room.BaseVersionID) {
                room.LastAppliedRestoreVersionID = room.BaseVersionID;
            }
            if (room.BaseVersionNumber) {
                room.LastAppliedRestoreVersionNumber = room.BaseVersionNumber;
            }
            const postRestoreSv = Y.encodeStateVector(room.Doc);
            room.LastCompactedStateVector = postRestoreSv;
            if (room.BaseVersionID || room.BaseVersionNumber) {
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    if (room.BaseVersionID) {
                        meta.set('lastAppliedRestoreVersionId', room.BaseVersionID);
                    }
                    if (room.BaseVersionNumber) {
                        meta.set('lastAppliedRestoreVersionNumber', room.BaseVersionNumber);
                    }
                }, 'server-restore');
            }
            if (room.BaseVersionID) {
                this.recordCompactedStateVector(
                    room.ArtifactID,
                    room.BaseVersionID,
                    room.BaseVersionNumber,
                    BytesToBase64(postRestoreSv),
                    this.computeSha256Hex(mergedContent),
                    BytesToBase64(Y.encodeSnapshot(Y.snapshot(room.Doc))),
                    room.ProviderKey
                );
            }
        } else if (options?.persistedVersionId) {
            const targetPersistedContent = options.persistedContent ?? newContent;
            broadcastReusedPersistedVersion = Boolean(
                room.BaseVersionID && UUIDsEqual(room.BaseVersionID, options.persistedVersionId)
            );
            room.BaseVersionID = options.persistedVersionId;
            if (typeof options.persistedVersionNumber === 'number') {
                room.BaseVersionNumber = options.persistedVersionNumber;
            }
            room.BaseVersionText = targetPersistedContent;
            if (typeof previousContent === 'string') {
                room.LastReconciledBaselineText = previousContent;
            }
            room.DirtyVersion = mergedContent !== targetPersistedContent;
            room.Doc.transact(() => {
                const meta = room.Doc.getMap('meta');
                meta.set('versionId', options.persistedVersionId!);
                meta.set('baseVersionId', options.persistedVersionId!);
                if (typeof options.persistedVersionNumber === 'number') {
                    meta.set('versionNumber', options.persistedVersionNumber);
                    meta.set('baseVersionNumber', options.persistedVersionNumber);
                }
                meta.set('roomEpoch', room.RoomEpoch);
            }, 'server-agent');
            room.LastCompactedStateVector = room.DirtyVersion ? null : Y.encodeStateVector(room.Doc);
        }
        this.recordServerWatermark(room);
        await this.FlushWorkingState(artifactId, user, { provider: room.Provider });
        if (isRestore) {
            this.broadcastControlFrame(room, {
                action: 'version-saved',
                versionId: room.BaseVersionID ?? undefined,
                versionNumber: room.BaseVersionNumber || undefined,
                roomEpoch: room.RoomEpoch
            });
        } else {
            if (broadcastReusedPersistedVersion) {
                this.broadcastControlFrame(room, {
                    action: 'version-saved',
                    versionId: room.BaseVersionID ?? undefined,
                    versionNumber: room.BaseVersionNumber || undefined,
                    roomEpoch: room.RoomEpoch
                });
            }
            if (hadConflict && resolvedMerge) {
                this.broadcastMergeConflictFrame(room, {
                    action: 'merge-conflict',
                    versionId: room.BaseVersionID ?? undefined,
                    rejectedHunkCount: resolvedMerge.RejectedAgentHunks.length,
                    roomEpoch: room.RoomEpoch,
                    actorUserId: options?.actorUserId ?? user.ID
                });
            }
        }
        if (room.Connections.size === 0 && !this._shuttingDown) {
            this.scheduleIdleRoomDisposal(room);
        }
        return {
            Success: true,
            MergedContent: mergedContent,
            HadConflict: hadConflict,
            RejectedAgentHunks: rejectedLineHunks
        };
    }

    /**
     * Authoritatively restores an artifact room or persisted working state to a previously saved version (`R9-2`).
     * Hydrates the room if active or persisted, applies the restore snapshot, flushes working state immediately,
     * and broadcasts a version-saved relay message with `isRestore: true` to peer replica nodes.
     */
    public async RestoreToSavedVersion(
        artifactId: string,
        savedVersion: { ID: string; VersionNumber: number; Content?: string | null; Configuration?: string | null; UserID?: string | null },
        user: UserInfo,
        provider?: IMetadataProvider | null
    ): Promise<void> {
        const resolvedProvider = provider ?? this.activeProvider();
        const resolvedProviderKey = this.resolveProviderKey(resolvedProvider, user);
        const hasLive = this.HasActiveRoom(artifactId, resolvedProvider) || (await this.hasPersistedWorkingState(artifactId, user, resolvedProvider));
        const targetText = savedVersion.Content || savedVersion.Configuration || '';
        const targetContentHash = this.computeSha256Hex(targetText);
        let handledViaLocalRoom = false;

        if (hasLive) {
            const room = await this.GetOrCreateRoom(artifactId, user, resolvedProvider);
            if (room) {
                handledViaLocalRoom = true;
                const alreadyAppliedByListener = Boolean(
                    room.LastAppliedRestoreVersionID && UUIDsEqual(room.LastAppliedRestoreVersionID, savedVersion.ID)
                );
                if (!alreadyAppliedByListener) {
                    if (this._relay) {
                        await this.requestPeerRoomSyncCatchup(room);
                    }
                    this.reconcileOutOfBandVersionIntoRoom(room, savedVersion, {
                        isRestore: true,
                        actorUserId: savedVersion.UserID ?? user.ID
                    });
                }
                room.HasActiveLocks = this.computeContentHasActiveLocks(this.extractRoomSerializedContent(room.Doc));
                await this.FlushWorkingState(artifactId, user, { provider: resolvedProvider });
                if (this._relay) {
                    try {
                        await this._relay.PublishToRoom({
                            ArtifactID: room.ArtifactID,
                            ProviderKey: room.ProviderKey,
                            MessageType: 'sync-state',
                            PayloadBase64: BytesToBase64(Y.encodeStateAsUpdate(room.Doc))
                        });
                    } catch (syncRelayErr) {
                        LogError(
                            `ArtifactCollaborationServer.RestoreToSavedVersion sync-state relay publish failed: ${
                                syncRelayErr instanceof Error ? syncRelayErr.message : String(syncRelayErr)
                            }`
                        );
                    }
                }
                if (room.Connections.size === 0 && !this._shuttingDown) {
                    this.scheduleIdleRoomDisposal(room);
                }
            }
        }

        if (!handledViaLocalRoom && this._relay) {
            const relayPayload = JSON.stringify({
                isRestore: true,
                savedContentHash: targetContentHash
            });
            try {
                await this._relay.PublishToRoom({
                    ArtifactID: artifactId,
                    ProviderKey: resolvedProviderKey,
                    MessageType: 'version-saved',
                    PayloadBase64: relayPayload,
                    TargetUserID: savedVersion.UserID ?? user.ID,
                    VersionID: savedVersion.ID,
                    VersionNumber: savedVersion.VersionNumber
                });
            } catch (relayErr) {
                LogError(
                    `ArtifactCollaborationServer.RestoreToSavedVersion relay publish failed: ${
                        relayErr instanceof Error ? relayErr.message : String(relayErr)
                    }`
                );
            }
        }
    }

    /**
     * Returns the current in-memory room for `artifactId`, hydrating it from `MJ: Artifact Working States`
     * or `MJ: Artifact Versions` if not yet loaded.
     */
    public async GetOrCreateRoom(
        artifactId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider | null
    ): Promise<CollaborationRoom | null> {
        const cleanId = (artifactId ?? '').trim();
        if (!cleanId || !contextUser) {
            return null;
        }
        const resolvedProvider = provider ?? this.activeProvider();
        const key = this.getRoomKey(cleanId, resolvedProvider, contextUser);
        this.ensureShutdownRegistered();
        this.ensurePermissionListenerRegistered();
        this.ensureGlobalMutationListenerRegistered();

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
        const initPromise = this.createAndHydrateRoom(cleanId, contextUser, resolvedProvider).finally(() => {
            this._roomInitPromises.delete(key);
        });
        this._roomInitPromises.set(key, initPromise);
        return await initPromise;
    }

    /**
     * Returns the current collaborative string content for `artifactId` from its active Yjs room
     * (or hydrates the room first), reconciling any newer out-of-band `MJ: Artifact Versions` row.
     */
    public async GetRoomContent(
        artifactId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider | null
    ): Promise<string> {
        const resolvedProvider = provider ?? this.activeProvider();
        const key = this.getRoomKey(artifactId, resolvedProvider, contextUser);
        const wasAlreadyLoaded = this._rooms.has(key);
        const room = await this.GetOrCreateRoom(artifactId, contextUser, resolvedProvider);
        if (room && wasAlreadyLoaded) {
            await this.checkAndReconcileLatestDatabaseVersion(room, contextUser);
        }
        if (room && room.Connections.size === 0 && !this._shuttingDown) {
            this.scheduleIdleRoomDisposal(room);
        }
        return room ? await this.extractRoomSerializedContentIsolated(room.Doc) : '';
    }

    /**
     * Graceful shutdown hook called by `ShutdownRegistry`. Stops heartbeat intervals, flushes all
     * dirty working states, closes active WebSocket connections, destroys Yjs Awareness & Doc
     * instances, and unsubscribes cross-instance relays.
     */
    public async Shutdown(): Promise<void> {
        this._shuttingDown = true;
        this._idleRoomTtlMs = DEFAULT_IDLE_ROOM_TTL_MS;

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
                    await this.FlushWorkingState(room.ArtifactID, flushActor, { provider: room.Provider });
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
        for (const detached of this._detachedAgentPresence.values()) {
            this.clearAgentPresenceTimers(detached.Entry);
            detached.Entry.PendingWorkingEvent = null;
        }
        this._detachedAgentPresence.clear();
        this._agentClientClockHighWater.clear();
        this._tickets.clear();
        this._consumedTickets.clear();
        const sharedState = ArtifactCollaborationServer.getSharedCollabState();
        sharedState.InFlightCompactionVersionIds.clear();
        sharedState.CompactedStateVectors.clear();
        sharedState.CompactedVectorKeysByArtifact.clear();
        sharedState.ServerVersionWatermarks.clear();
        for (const waiters of this._pendingSyncWaiters.values()) {
            for (const waiter of waiters) {
                waiter.settle(false);
            }
        }
        this._pendingSyncWaiters.clear();
        this._pendingUpgradesByArtifact.clear();
        if (this._globalMutationSub) {
            this._globalMutationSub.unsubscribe();
            this._globalMutationSub = null;
        }
        if (this._ownedLiveMutationHook) {
            const store = GetGlobalObjectStore();
            if (store && store[ARTIFACT_LIVE_MUTATION_HOOK_KEY] === this._ownedLiveMutationHook) {
                delete store[ARTIFACT_LIVE_MUTATION_HOOK_KEY];
            }
            this._ownedLiveMutationHook = null;
        }
        if (this._ownedLiveContentReaderHook) {
            const store = GetGlobalObjectStore();
            if (store && store[ARTIFACT_LIVE_CONTENT_READER_HOOK_KEY] === this._ownedLiveContentReaderHook) {
                delete store[ARTIFACT_LIVE_CONTENT_READER_HOOK_KEY];
            }
            this._ownedLiveContentReaderHook = null;
        }
        if (this._ownedAgentPresenceHook) {
            const store = GetGlobalObjectStore();
            if (store && store[ARTIFACT_AGENT_PRESENCE_HOOK_KEY] === this._ownedAgentPresenceHook) {
                delete store[ARTIFACT_AGENT_PRESENCE_HOOK_KEY];
            }
            this._ownedAgentPresenceHook = null;
        }
        this._agentPresenceThrottleMs = DEFAULT_AGENT_PRESENCE_THROTTLE_MS;
        this._agentPresenceDecayMs = DEFAULT_AGENT_PRESENCE_DECAY_MS;
        this._agentPresenceTtlMs = DEFAULT_AGENT_PRESENCE_TTL_MS;
        this._agentPresenceExitGraceMs = DEFAULT_AGENT_PRESENCE_EXIT_GRACE_MS;
        await this._relay.Shutdown();
    }

    /** Clears `_shuttingDown` after `Shutdown()` in isolated unit tests reusing the process singleton. */
    public ResetShutdownForTests(): void {
        this._shuttingDown = false;
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

    /**
     * Returns `true` when `doc` satisfies BOTH the insert `StateVector` AND the full `DeleteSet`
     * encoded in `snapshotBytes` (`R7-6`). Because `DoesDocSatisfySnapshot` inspects the CRDT
     * `DeleteSet` directly, lost pure deletes from peer nodes are detected even when the local room
     * has its own concurrent unsaved edits (`room.DirtyVersion === true`, `M5e`).
     */
    public DoesDocSatisfySnapshot(doc: Y.Doc, snapshotBytes: Uint8Array): boolean {
        if (!snapshotBytes || snapshotBytes.byteLength === 0) {
            return false;
        }
        try {
            const targetSnap = Y.decodeSnapshot(snapshotBytes);
            const localSnap = Y.snapshot(doc);

            for (const [clientId, requiredClock] of targetSnap.sv.entries()) {
                if (requiredClock > 0 && (localSnap.sv.get(clientId) ?? 0) < requiredClock) {
                    return false;
                }
            }

            const coalesceRanges = (
                items: ReadonlyArray<{ clock: number; len: number }>
            ): Array<{ start: number; end: number }> => {
                const nonEmpty: Array<{ clock: number; len: number }> = [];
                let isSorted = true;
                let prevClock = -Infinity;
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    if (item.len > 0) {
                        if (item.clock < prevClock) {
                            isSorted = false;
                        }
                        prevClock = item.clock;
                        nonEmpty.push(item);
                    }
                }
                if (nonEmpty.length === 0) {
                    return [];
                }
                if (!isSorted) {
                    nonEmpty.sort((a, b) => a.clock - b.clock);
                }
                const coalesced: Array<{ start: number; end: number }> = [];
                for (let i = 0; i < nonEmpty.length; i++) {
                    const item = nonEmpty[i];
                    const start = item.clock;
                    const end = item.clock + item.len;
                    const prev = coalesced[coalesced.length - 1];
                    if (prev && prev.end >= start) {
                        if (end > prev.end) {
                            prev.end = end;
                        }
                    } else {
                        coalesced.push({ start, end });
                    }
                }
                return coalesced;
            };

            for (const [clientId, requiredDeletes] of targetSnap.ds.clients.entries()) {
                if (!requiredDeletes || requiredDeletes.length === 0) {
                    continue;
                }
                const reqRanges = coalesceRanges(requiredDeletes);
                if (reqRanges.length === 0) {
                    continue;
                }
                const localDeletes = localSnap.ds.clients.get(clientId);
                if (!localDeletes || localDeletes.length === 0) {
                    return false;
                }
                const localRanges = coalesceRanges(localDeletes);
                if (localRanges.length === 0) {
                    return false;
                }

                // Linear O(N + M) two-pointer containment walk across sorted disjoint intervals (`R8-11`)
                let li = 0;
                for (let ri = 0; ri < reqRanges.length; ri++) {
                    const req = reqRanges[ri];
                    while (li < localRanges.length && localRanges[li].end < req.start) {
                        li++;
                    }
                    if (li >= localRanges.length) {
                        return false;
                    }
                    const loc = localRanges[li];
                    if (loc.start > req.start || loc.end < req.end) {
                        return false;
                    }
                }
            }

            return true;
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.DoesDocSatisfySnapshot failed: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return false;
        }
    }

    private encodeSafeDeltaUpdate(doc: Y.Doc, stateVectorBytes: Uint8Array): Uint8Array {
        try {
            return Y.encodeStateAsUpdate(doc, stateVectorBytes);
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.encodeSafeDeltaUpdate failed encoding delta update, falling back to full state: ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return Y.encodeStateAsUpdate(doc);
        }
    }

    private decodeStrictBase64Bytes(raw: string): Uint8Array | null {
        const trimmed = raw.trim();
        if (trimmed.length === 0) {
            return new Uint8Array(0);
        }
        if (trimmed.length % 4 === 1) {
            return null;
        }
        const isStdBase64 =
            trimmed.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed);
        const isUrlSafeBase64 = /^[A-Za-z0-9\-_]+={0,2}$/.test(trimmed);
        if (!isStdBase64 && !isUrlSafeBase64) {
            return null;
        }
        let normalized = trimmed.replace(/-/g, () => '+').replace(/_/g, () => '/');
        while (normalized.length % 4 !== 0) {
            normalized += '=';
        }
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
            return null;
        }
        try {
            return Base64ToBytes(normalized);
        } catch {
            return null;
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
        contentHash: string,
        savedSnapshotB64?: string,
        providerKey: string = 'default'
    ): void {
        if (!savedStateVectorB64 || !versionId || !versionId.trim()) {
            return;
        }
        const entry = {
            OriginServerID: this._serverInstanceId,
            SavedStateVectorB64: savedStateVectorB64,
            SavedSnapshotB64: savedSnapshotB64,
            VersionID: versionId.trim(),
            ContentHash: contentHash
        };
        const sharedState = ArtifactCollaborationServer.getSharedCollabState();
        const map = sharedState.CompactedStateVectors;
        const pKey = providerKey || 'default';
        const normArtId = NormalizeUUID(artifactId);
        const verKey = `${pKey}::ver:${NormalizeUUID(versionId)}`;
        const artKey = `${pKey}::art:${normArtId}:v:${versionNumber}`;
        map.set(verKey, entry);
        map.set(artKey, entry);

        const perArtifactMap = sharedState.CompactedVectorKeysByArtifact;
        const perArtifactKey = `${pKey}::${normArtId}`;
        const existingPerArtifact = perArtifactMap.get(perArtifactKey) ?? [];
        const filteredPerArtifact = existingPerArtifact.filter(
            (item) => item.verKey !== verKey && item.artKey !== artKey
        );
        filteredPerArtifact.push({ verKey, artKey });
        while (
            filteredPerArtifact.length >
            ArtifactCollaborationServer.MAX_TRACKED_COMPACTED_VECTORS_PER_ARTIFACT
        ) {
            const evicted = filteredPerArtifact.shift();
            if (!evicted) {
                break;
            }
            map.delete(evicted.verKey);
            map.delete(evicted.artKey);
        }
        perArtifactMap.set(perArtifactKey, filteredPerArtifact);

        while (map.size > ArtifactCollaborationServer.MAX_TRACKED_COMPACTED_VECTORS) {
            const oldestKey = map.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }
            map.delete(oldestKey);
        }
    }

    private pruneArtifactVersionMetaKeys(
        meta: ReturnType<Y.Doc['getMap']>,
        keepKey?: string
    ): void {
        for (const k of Array.from(meta.keys())) {
            if (k.startsWith('art:') && k !== keepKey) {
                meta.delete(k);
            }
        }
    }

    private isAuthoritativeRestoreVersion(
        _version?: { Description?: string | null; Comments?: string | null } | null,
        explicitIsRestore?: boolean
    ): boolean {
        return explicitIsRestore === true;
    }

    private splitLogicalLineStrings(text: string): string[] {
        return this.tokenizeLogicalLines(text).map((t) => t.body);
    }

    private async hasPersistedWorkingState(
        artifactId: string,
        contextUser?: UserInfo,
        providerOverride?: IMetadataProvider | null
    ): Promise<boolean> {
        const provider = providerOverride ?? this.activeProvider();
        const queryUser = UserCache.Instance.GetSystemUser() ?? contextUser;
        if (!provider || !queryUser) {
            return false;
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Artifact Working States',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(artifactId)}'`,
                    Fields: ['ID'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                queryUser
            );
            if (!res.Success && res.ErrorMessage) {
                LogError(
                    `ArtifactCollaborationServer.hasPersistedWorkingState failed for '${artifactId}': ${res.ErrorMessage}`
                );
            }
            return Boolean(res.Success && res.Results && res.Results.length > 0);
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.hasPersistedWorkingState failed for '${artifactId}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return false;
        }
    }

    private lookupVerifiedCompactedStateVector(
        artifactId: string,
        versionId: string,
        versionNumber: number,
        expectedContentHash: string,
        providerKey: string = 'default'
    ):
        | {
              OriginServerID: string;
              SavedStateVectorB64: string;
              SavedSnapshotB64?: string;
              VersionID: string;
              ContentHash: string;
          }
        | undefined {
        const map = ArtifactCollaborationServer.getSharedCollabState().CompactedStateVectors;
        const pKey = providerKey || 'default';
        const byId = map.get(`${pKey}::ver:${NormalizeUUID(versionId)}`);
        if (
            byId &&
            UUIDsEqual(byId.VersionID, versionId) &&
            byId.ContentHash === expectedContentHash
        ) {
            return byId;
        }
        const bySlot = map.get(`${pKey}::art:${NormalizeUUID(artifactId)}:v:${versionNumber}`);
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
                    snap?: string;
                    versionId?: string;
                    contentHash?: string;
                };
                return Boolean(
                    parsed.sv &&
                        parsed.versionId &&
                        UUIDsEqual(parsed.versionId, versionId) &&
                        parsed.contentHash === expectedContentHash &&
                        this.DoesDocContainStateVector(doc, Base64ToBytes(parsed.sv)) &&
                        (!parsed.snap || this.DoesDocSatisfySnapshot(doc, Base64ToBytes(parsed.snap)))
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
            const obj = raw as { sv?: string; snap?: string; versionId?: string; contentHash?: string };
            return Boolean(
                obj.sv &&
                    obj.versionId &&
                    UUIDsEqual(obj.versionId, versionId) &&
                    obj.contentHash === expectedContentHash &&
                    this.DoesDocContainStateVector(doc, Base64ToBytes(obj.sv)) &&
                    (!obj.snap || this.DoesDocSatisfySnapshot(doc, Base64ToBytes(obj.snap)))
            );
        }
        return false;
    }

    private parseVersionSavedRelayPayload(payloadBase64: string | undefined): {
        savedStateVectorB64?: string;
        prevStateVectorB64?: string;
        savedSnapshotB64?: string;
        savedDocUpdateB64?: string;
        savedContentHash?: string;
        isRestore?: boolean;
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
                    prevStateVectorB64?: string;
                    savedSnapshotB64?: string;
                    savedDocUpdateB64?: string;
                    savedContentHash?: string;
                    isRestore?: boolean;
                };
                return {
                    savedStateVectorB64:
                        typeof parsed.savedStateVectorB64 === 'string' && parsed.savedStateVectorB64
                            ? parsed.savedStateVectorB64
                            : undefined,
                    prevStateVectorB64:
                        typeof parsed.prevStateVectorB64 === 'string' && parsed.prevStateVectorB64
                            ? parsed.prevStateVectorB64
                            : undefined,
                    savedSnapshotB64:
                        typeof parsed.savedSnapshotB64 === 'string' && parsed.savedSnapshotB64
                            ? parsed.savedSnapshotB64
                            : undefined,
                    savedDocUpdateB64:
                        typeof parsed.savedDocUpdateB64 === 'string' && parsed.savedDocUpdateB64
                            ? parsed.savedDocUpdateB64
                            : undefined,
                    savedContentHash:
                        typeof parsed.savedContentHash === 'string' && parsed.savedContentHash
                            ? parsed.savedContentHash
                            : undefined,
                    isRestore: parsed.isRestore === true ? true : undefined
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
        updateBytes: Uint8Array | null;
        savedContentHash?: string;
    } {
        if (!payloadBase64) {
            return { updateBytes: null };
        }
        const trimmed = payloadBase64.trim();
        if (!trimmed) {
            return { updateBytes: null };
        }
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed) as {
                    savedDocUpdateB64?: string;
                    savedContentHash?: string;
                };
                if (!parsed.savedDocUpdateB64 || typeof parsed.savedDocUpdateB64 !== 'string') {
                    return { updateBytes: null };
                }
                const updateBytes = this.decodeStrictBase64Bytes(parsed.savedDocUpdateB64);
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
                return { updateBytes: null };
            }
        }
        return { updateBytes: this.decodeStrictBase64Bytes(trimmed) };
    }

    protected async tryCatchUpRoomFromPersistedWorkingState(
        room: CollaborationRoom,
        savedStateVectorB64?: string,
        savedSnapshotB64?: string
    ): Promise<boolean> {
        const provider = this._providerOverride ?? room.Provider ?? this.activeProvider();
        const queryUser = UserCache.Instance.GetSystemUser() ?? room.LastModifiedByUser;
        if (!provider || !queryUser) {
            return false;
        }
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const res = await rv.RunView<WorkingStateProjection>(
                {
                    EntityName: 'MJ: Artifact Working States',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                    Fields: ['ID', 'ArtifactID', 'YjsState'],
                    IncludeBinaryFields: true,
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                queryUser
            );
            const workingRow = res.Success ? res.Results?.[0] : undefined;
            if (!workingRow?.YjsState) {
                return false;
            }
            const stateBytes = DecodeWorkingStateBytes(workingRow.YjsState);
            if (stateBytes.byteLength === 0) {
                return false;
            }
            Y.applyUpdate(room.Doc, stateBytes, 'collab-relay');

            const svBytes = savedStateVectorB64
                ? this.decodeStrictBase64Bytes(savedStateVectorB64)
                : null;
            const snapBytes = savedSnapshotB64
                ? this.decodeStrictBase64Bytes(savedSnapshotB64)
                : null;
            const svSatisfied =
                !savedStateVectorB64 ||
                Boolean(svBytes && this.DoesDocContainStateVector(room.Doc, svBytes));
            const snapSatisfied =
                !savedSnapshotB64 ||
                Boolean(snapBytes && this.DoesDocSatisfySnapshot(room.Doc, snapBytes));
            return svSatisfied && snapSatisfied;
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.tryCatchUpRoomFromPersistedWorkingState failed for '${room.ArtifactID}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return false;
        }
    }

    private createPendingSyncWaiter(
        artifactId: string,
        timeoutMs: number,
        isSatisfied?: () => boolean
    ): { promise: Promise<boolean>; cancel: () => void } {
        const key = NormalizeUUID(artifactId);
        let waiterEntry: PendingSyncWaiterEntry | null = null;
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const cleanup = (): void => {
            if (timer !== null) {
                clearTimeout(timer);
                timer = null;
            }
            if (waiterEntry) {
                const set = this._pendingSyncWaiters.get(key);
                if (set) {
                    set.delete(waiterEntry);
                    if (set.size === 0) {
                        this._pendingSyncWaiters.delete(key);
                    }
                }
            }
        };

        const promise = new Promise<boolean>((resolve) => {
            const settleFn = (synced: boolean): void => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(synced);
            };
            waiterEntry = {
                settle: settleFn,
                isSatisfied
            };
            let set = this._pendingSyncWaiters.get(key);
            if (!set) {
                set = new Set();
                this._pendingSyncWaiters.set(key, set);
            }
            set.add(waiterEntry);
            timer = setTimeout(() => {
                settleFn(false);
            }, timeoutMs);
        });

        return {
            promise,
            cancel: () => {
                waiterEntry?.settle(false);
            }
        };
    }

    private resolvePendingSyncWaiters(artifactId: string, synced: boolean): void {
        const key = NormalizeUUID(artifactId);
        const set = this._pendingSyncWaiters.get(key);
        if (!set || set.size === 0) {
            return;
        }
        for (const entry of Array.from(set)) {
            if (synced && entry.isSatisfied && !entry.isSatisfied()) {
                continue;
            }
            entry.settle(synced);
        }
    }

    private async requestPeerRoomSyncCatchup(
        room: CollaborationRoom,
        timeoutMs: number = ArtifactCollaborationServer.SYNC_WAIT_TIMEOUT_MS,
        isSatisfied?: () => boolean
    ): Promise<boolean> {
        if (!this._relay) {
            return false;
        }
        if (typeof this._relay.HasRoomPeers === 'function') {
            try {
                const hasPeers = await this._relay.HasRoomPeers(room.ArtifactID);
                if (!hasPeers) {
                    return false;
                }
            } catch (err) {
                // Fall through to the normal sync-request: asking peers that may not exist only costs the
                // wait, while skipping peers that do exist could miss their edits.
                LogError(
                    `ArtifactCollaborationServer: HasRoomPeers failed for artifact '${room.ArtifactID}'; requesting a peer sync anyway: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        }
        const syncWaiter = this.createPendingSyncWaiter(room.ArtifactID, timeoutMs, isSatisfied);
        try {
            const peerCount = await this._relay.PublishToRoom({
                ArtifactID: room.ArtifactID,
                ProviderKey: room.ProviderKey,
                MessageType: 'sync-request',
                PayloadBase64: BytesToBase64(Y.encodeStateVector(room.Doc))
            });
            if (typeof peerCount === 'number' && peerCount <= 0) {
                syncWaiter.cancel();
                return false;
            }
        } catch (syncReqErr) {
            syncWaiter.cancel();
            LogError(
                `ArtifactCollaborationServer sync-request publish failed for '${room.ArtifactID}': ${
                    syncReqErr instanceof Error ? syncReqErr.message : String(syncReqErr)
                }`
            );
            return false;
        }
        return await syncWaiter.promise;
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

    private ensureLiveMutationHookRegistered(): void {
        if (this._shuttingDown) {
            return;
        }
        const store = GetGlobalObjectStore();
        if (!store) {
            return;
        }
        const existingHook = store[ARTIFACT_LIVE_MUTATION_HOOK_KEY];
        if (existingHook !== undefined && existingHook !== this._ownedLiveMutationHook) {
            // Respect a custom hook explicitly installed via SetArtifactLiveMutationHook (e.g., unit tests).
            return;
        }
        if (!this._ownedLiveMutationHook) {
            this._ownedLiveMutationHook = async (
                evt: RegisteredLiveMutationEvent
            ): Promise<RegisteredLiveMutationHookResult | void> => {
                if (this._shuttingDown || !evt?.artifactId) {
                    return undefined;
                }
                const evtProvider = evt.provider ?? null;
                const hasLiveState =
                    this.HasActiveRoom(evt.artifactId, evtProvider) ||
                    (await this.hasPersistedWorkingState(evt.artifactId, evt.contextUser, evtProvider));
                if (!hasLiveState) {
                    return undefined;
                }
                const actor = evt.contextUser ?? UserCache.Instance.GetSystemUser();
                if (!actor) {
                    return undefined;
                }
                const incomingSuggestions = Array.isArray(evt.configurationPatch?.suggestions)
                    ? this.parseSuggestionArray(evt.configurationPatch.suggestions)
                    : null;
                if (evt.deferCommit === true) {
                    const existingRoom = this.findRoomForArtifact(evt.artifactId, evtProvider, actor);
                    const effectiveProvider = evtProvider ?? existingRoom?.Provider ?? null;
                    const preDeferVersionId = existingRoom?.BaseVersionID ?? null;
                    const preDeferVersionNumber = existingRoom?.BaseVersionNumber ?? 0;
                    const preDeferBaseVersionText = existingRoom?.BaseVersionText ?? null;
                    const preDeferBaseConfiguration = existingRoom?.BaseConfiguration ?? null;
                    const preDeferSuggestions = existingRoom
                        ? this.readSuggestionsFromDoc(existingRoom.Doc)
                        : null;
                    const preDeferContent = existingRoom
                        ? this.extractRoomSerializedContent(existingRoom.Doc)
                        : (evt.previousContent ?? '');

                    const preview = await this.ApplyServerContentMutation(
                        evt.artifactId,
                        evt.updatedContent,
                        actor,
                        false,
                        evt.previousContent,
                        { dryRun: true, actorUserId: evt.contextUser?.ID, provider: effectiveProvider }
                    );
                    if (!preview.Success) {
                        return undefined;
                    }
                    // What the room actually held once the agent's change landed (set by `commit`). A
                    // later rollback undoes exactly this, so it needs the real post-commit text, not the
                    // dry-run preview, which can differ when someone typed between preview and commit.
                    let appliedAgentContent: string | undefined;
                    return {
                        mergedContent: preview.MergedContent,
                        hadConflict: Boolean(preview.HadConflict),
                        rejectedHunksCount: preview.RejectedAgentHunks?.length ?? 0,
                        rejectedAgentHunks: preview.RejectedAgentHunks,
                        commit: async (persisted) => {
                            const provider = effectiveProvider ?? this.activeProvider();
                            if (provider && actor) {
                                const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                                    provider,
                                    evt.artifactId,
                                    actor
                                );
                                if (!perms.CanEdit) {
                                    return { applied: false };
                                }
                            }
                            const targetPersistedContent = preview.MergedContent ?? evt.updatedContent;
                            const currentTargetRoom =
                                this.findRoomForArtifact(evt.artifactId, effectiveProvider, actor) ?? existingRoom;
                            const applyLiveSuggestionsToRoom = (targetRoom: CollaborationRoom): boolean => {
                                if (!incomingSuggestions) {
                                    return false;
                                }
                                let changed = false;
                                targetRoom.Doc.transact(() => {
                                    changed = this.syncSuggestionsIntoDoc(
                                        targetRoom.Doc,
                                        incomingSuggestions,
                                        { replace: true }
                                    );
                                }, 'server-agent');
                                if (changed) {
                                    targetRoom.DirtyWorkingState = true;
                                }
                                return changed;
                            };
                            const reconciledThisVersionViaOob = Boolean(
                                currentTargetRoom &&
                                persisted?.versionId &&
                                UUIDsEqual(currentTargetRoom.LastReconciledOobVersionID, persisted.versionId) &&
                                currentTargetRoom.LastReconciledOobContent === targetPersistedContent
                            );
                            if (
                                currentTargetRoom &&
                                persisted?.versionId &&
                                UUIDsEqual(currentTargetRoom.BaseVersionID, persisted.versionId) &&
                                currentTargetRoom.BaseVersionText === targetPersistedContent &&
                                (reconciledThisVersionViaOob ||
                                    this.extractRoomSerializedContent(currentTargetRoom.Doc) === targetPersistedContent)
                            ) {
                                applyLiveSuggestionsToRoom(currentTargetRoom);
                                const actualRoomContent = this.extractRoomSerializedContent(currentTargetRoom.Doc);
                                const oobMerge = reconciledThisVersionViaOob
                                    ? currentTargetRoom.LastReconciledOobMergeResult
                                    : null;
                                const effectiveHadConflict = oobMerge
                                    ? Boolean(oobMerge.HadConflict)
                                    : Boolean(preview.HadConflict);
                                const effectiveRejectedHunks = oobMerge
                                    ? oobMerge.RejectedAgentHunks.map((h) => ({
                                          BaseLines: this.splitLogicalLineStrings(h.BaseText),
                                          LiveLines: this.splitLogicalLineStrings(h.LiveText),
                                          RejectedAgentLines: this.splitLogicalLineStrings(h.RejectedIncomingText)
                                      }))
                                    : preview.RejectedAgentHunks;
                                await this.FlushWorkingState(evt.artifactId, actor, {
                                    provider: currentTargetRoom.Provider
                                });
                                if (!oobMerge && preview.HadConflict && (preview.RejectedAgentHunks?.length ?? 0) > 0) {
                                    this.broadcastMergeConflictFrame(currentTargetRoom, {
                                        action: 'merge-conflict',
                                        versionId: currentTargetRoom.BaseVersionID ?? undefined,
                                        rejectedHunkCount: preview.RejectedAgentHunks?.length ?? 0,
                                        roomEpoch: currentTargetRoom.RoomEpoch,
                                        actorUserId: evt.contextUser?.ID ?? actor.ID
                                    });
                                }
                                if (currentTargetRoom.Connections.size === 0 && !this._shuttingDown) {
                                    this.scheduleIdleRoomDisposal(currentTargetRoom);
                                }
                                appliedAgentContent = actualRoomContent;
                                return {
                                    applied: true,
                                    mergedContent: actualRoomContent,
                                    hadConflict: effectiveHadConflict,
                                    rejectedHunksCount: effectiveRejectedHunks?.length ?? 0,
                                    rejectedAgentHunks: effectiveRejectedHunks
                                };
                            }
                            const commitRes = await this.ApplyServerContentMutation(
                                evt.artifactId,
                                evt.updatedContent,
                                actor,
                                false,
                                evt.previousContent,
                                {
                                    actorUserId: evt.contextUser?.ID,
                                    persistedVersionId: persisted?.versionId,
                                    persistedVersionNumber: persisted?.versionNumber,
                                    persistedContent: targetPersistedContent,
                                    provider: effectiveProvider
                                }
                            );
                            if (commitRes.Success && incomingSuggestions) {
                                const updatedRoom =
                                    this.findRoomForArtifact(evt.artifactId, effectiveProvider, actor) ?? existingRoom;
                                if (updatedRoom && applyLiveSuggestionsToRoom(updatedRoom)) {
                                    await this.FlushWorkingState(evt.artifactId, actor, {
                                        provider: updatedRoom.Provider
                                    });
                                }
                            }
                            if (commitRes.Success && typeof commitRes.MergedContent === 'string') {
                                appliedAgentContent = commitRes.MergedContent;
                            }
                            return {
                                applied: commitRes.Success,
                                mergedContent: commitRes.MergedContent,
                                hadConflict: Boolean(commitRes.HadConflict),
                                rejectedHunksCount: commitRes.RejectedAgentHunks?.length ?? 0,
                                rejectedAgentHunks: commitRes.RejectedAgentHunks
                            };
                        },
                        rollback: async (rolledBackVersionId?: string): Promise<void> => {
                            const currentRoom =
                                this.findRoomForArtifact(evt.artifactId, effectiveProvider, actor) ?? existingRoom;
                            const roomReconciledRolledBackVersion = Boolean(
                                currentRoom &&
                                    rolledBackVersionId &&
                                    (UUIDsEqual(currentRoom.BaseVersionID, rolledBackVersionId) ||
                                        UUIDsEqual(currentRoom.LastReconciledOobVersionID, rolledBackVersionId))
                            );
                            if (!currentRoom || !roomReconciledRolledBackVersion) {
                                return;
                            }

                            // The room returns to the version it was based on before the agent call...
                            const restoredBaseText = preDeferBaseVersionText || evt.previousContent || '';
                            // ...but its CONTENT returns to what it held right before the agent call, not to
                            // that saved text: anything typed and not yet saved was already part of the room
                            // and is not the agent's to undo.
                            const agentResultContent =
                                appliedAgentContent ?? preview.MergedContent ?? evt.updatedContent;
                            currentRoom.Doc.transact(() => {
                                this.revertAgentMutationInDoc(
                                    currentRoom.Doc,
                                    agentResultContent,
                                    [agentResultContent, preview.MergedContent ?? '', evt.updatedContent],
                                    preDeferContent
                                );
                                if (preDeferSuggestions !== null) {
                                    this.syncSuggestionsIntoDoc(
                                        currentRoom.Doc,
                                        this.parseSuggestionArray(preDeferSuggestions),
                                        { replace: true }
                                    );
                                }
                                const meta = currentRoom.Doc.getMap('meta');
                                if (preDeferVersionId) {
                                    meta.set('versionId', preDeferVersionId);
                                    meta.set('baseVersionId', preDeferVersionId);
                                }
                                if (preDeferVersionNumber > 0) {
                                    meta.set('versionNumber', preDeferVersionNumber);
                                    meta.set('baseVersionNumber', preDeferVersionNumber);
                                }
                            }, 'server-rollback');

                            currentRoom.BaseVersionID = preDeferVersionId;
                            currentRoom.BaseVersionNumber = preDeferVersionNumber;
                            currentRoom.BaseVersionText = restoredBaseText;
                            currentRoom.BaseConfiguration = preDeferBaseConfiguration;
                            const postRollbackText = this.extractRoomSerializedContent(currentRoom.Doc);
                            currentRoom.DirtyVersion = postRollbackText !== restoredBaseText;
                            currentRoom.PreOutOfBandDocState = null;
                            currentRoom.LastReconciledOobVersionID = null;
                            currentRoom.LastReconciledOobContent = null;
                            currentRoom.LastReconciledOobMergeResult = null;
                            currentRoom.LastReconciledBaselineText = null;
                            this.recordServerWatermark(currentRoom);

                            const fullState = Y.encodeStateAsUpdate(currentRoom.Doc);
                            const encoder = encoding.createEncoder();
                            encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
                            syncProtocol.writeUpdate(encoder, fullState);
                            const frame = encoding.toUint8Array(encoder);
                            for (const conn of currentRoom.Connections) {
                                this.sendBinaryFrame(conn.Socket, frame);
                            }
                            await this._relay.PublishToRoom({
                                ArtifactID: currentRoom.ArtifactID,
                                ProviderKey: currentRoom.ProviderKey,
                                MessageType: 'sync-state',
                                PayloadBase64: BytesToBase64(fullState)
                            });
                            await this._relay.PublishToRoom({
                                ArtifactID: currentRoom.ArtifactID,
                                ProviderKey: currentRoom.ProviderKey,
                                MessageType: 'room-rollback',
                                PayloadBase64: Buffer.from(
                                    JSON.stringify({
                                        restoredVersionId: preDeferVersionId,
                                        restoredVersionNumber: preDeferVersionNumber,
                                        restoredBaseText,
                                        restoredBaseConfiguration: preDeferBaseConfiguration
                                    }),
                                    'utf8'
                                ).toString('base64')
                            });
                            await this.FlushWorkingState(currentRoom.ArtifactID, actor, {
                                provider: currentRoom.Provider
                            });
                        }
                    };
                }
                const res = await this.ApplyServerContentMutation(
                    evt.artifactId,
                    evt.updatedContent,
                    actor,
                    false,
                    evt.previousContent,
                    { actorUserId: evt.contextUser?.ID, provider: evtProvider }
                );
                if (!res.Success) {
                    return undefined;
                }
                if (incomingSuggestions) {
                    const liveRoom = this.findRoomForArtifact(evt.artifactId, evtProvider, actor);
                    if (liveRoom) {
                        let suggestionsChanged = false;
                        liveRoom.Doc.transact(() => {
                            suggestionsChanged = this.syncSuggestionsIntoDoc(
                                liveRoom.Doc,
                                incomingSuggestions,
                                { replace: true }
                            );
                        }, 'server-agent');
                        if (suggestionsChanged) {
                            liveRoom.DirtyWorkingState = true;
                            await this.FlushWorkingState(liveRoom.ArtifactID, actor, {
                                provider: liveRoom.Provider
                            });
                        }
                    }
                }
                return {
                    mergedContent: res.MergedContent,
                    hadConflict: Boolean(res.HadConflict),
                    rejectedHunksCount: res.RejectedAgentHunks?.length ?? 0,
                    rejectedAgentHunks: res.RejectedAgentHunks
                };
            };
        }
        store[ARTIFACT_LIVE_MUTATION_HOOK_KEY] = this._ownedLiveMutationHook;
    }

    private ensureLiveContentReaderHookRegistered(): void {
        if (this._shuttingDown) {
            return;
        }
        const store = GetGlobalObjectStore();
        if (!store) {
            return;
        }
        const existingHook = store[ARTIFACT_LIVE_CONTENT_READER_HOOK_KEY];
        if (existingHook !== undefined && existingHook !== this._ownedLiveContentReaderHook) {
            return;
        }
        if (!this._ownedLiveContentReaderHook) {
            this._ownedLiveContentReaderHook = async (
                artifactId: string,
                contextUser?: UserInfo
            ): Promise<ArtifactLiveRoomSnapshot | null> => {
                if (this._shuttingDown || !artifactId) {
                    return null;
                }
                const normalizedId = artifactId.trim();
                let room = this.findRoomForArtifact(normalizedId, null, contextUser);
                if (!room) {
                    const effectiveUser = contextUser ?? UserCache.Instance.GetSystemUser();
                    if (effectiveUser && (await this.hasPersistedWorkingState(normalizedId, effectiveUser))) {
                        room = (await this.GetOrCreateRoom(normalizedId, effectiveUser)) ?? undefined;
                        if (room && room.Connections.size === 0 && !this._shuttingDown) {
                            this.scheduleIdleRoomDisposal(room);
                        }
                    }
                }
                if (!room) {
                    return null;
                }
                const suggestions = this.readSuggestionsFromDoc(room.Doc);
                const mergedConfig = this.mergeConfigurationWithSuggestions(
                    room.BaseConfiguration ?? null,
                    suggestions
                );
                return {
                    Content: await this.extractRoomSerializedContentIsolated(room.Doc),
                    VersionNumber: room.BaseVersionNumber,
                    VersionID: room.BaseVersionID,
                    ...(mergedConfig ? { Configuration: mergedConfig } : {}),
                    Suggestions: suggestions
                };
            };
        }
        store[ARTIFACT_LIVE_CONTENT_READER_HOOK_KEY] = this._ownedLiveContentReaderHook;
    }

    private ensureAgentPresenceHookRegistered(): void {
        if (this._shuttingDown) {
            return;
        }
        const store = GetGlobalObjectStore();
        if (!store) {
            return;
        }
        const existingHook = store[ARTIFACT_AGENT_PRESENCE_HOOK_KEY];
        if (existingHook !== undefined && existingHook !== this._ownedAgentPresenceHook) {
            return;
        }
        if (!this._ownedAgentPresenceHook) {
            this._ownedAgentPresenceHook = (evt: ArtifactAgentPresenceEvent): void => {
                if (this._shuttingDown || !evt?.ArtifactID || !evt?.AgentPresenceKey) {
                    return;
                }
                this.applyServerAgentPresenceEvent(evt);
            };
        }
        store[ARTIFACT_AGENT_PRESENCE_HOOK_KEY] = this._ownedAgentPresenceHook;
    }

    private deriveAgentAwarenessClientId(agentPresenceKey: string): number {
        const digest = createHash('sha256').update(agentPresenceKey, 'utf8').digest();
        // Mask into [0x70000000, 0x7fffffff] (30 bits signed positive JS safe integer range)
        const low28 = digest.readUInt32BE(0) & 0x0fffffff;
        return AGENT_AWARENESS_CLIENT_ID_BASE + low28;
    }

    private pickAgentPresenceColor(agentPresenceKey: string): string {
        const digest = createHash('sha256').update(agentPresenceKey, 'utf8').digest();
        return AGENT_PRESENCE_PALETTE[digest[0] % AGENT_PRESENCE_PALETTE.length];
    }

    private clearAgentPresenceTimers(entry: AgentRoomPresenceEntry): void {
        if (entry.ThrottleTimer) {
            clearTimeout(entry.ThrottleTimer);
            entry.ThrottleTimer = null;
        }
        if (entry.DecayTimer) {
            clearTimeout(entry.DecayTimer);
            entry.DecayTimer = null;
        }
        if (entry.TtlTimer) {
            clearTimeout(entry.TtlTimer);
            entry.TtlTimer = null;
        }
        if (entry.ExitGraceTimer) {
            clearTimeout(entry.ExitGraceTimer);
            entry.ExitGraceTimer = null;
        }
    }

    private buildAgentAwarenessPayload(evt: ArtifactAgentPresenceEvent): AgentAwarenessPayload {
        const color = sanitizeAwarenessColor(this.pickAgentPresenceColor(evt.AgentPresenceKey));
        return {
            isAgent: true,
            agentPresenceKey: evt.AgentPresenceKey,
            agentPhase: evt.Phase,
            agentLocation: evt.Location ?? undefined,
            cursor: null,
            user: {
                userId: `agent:${evt.AgentPresenceKey}`,
                userName: evt.AgentName,
                name: evt.AgentName,
                color,
                canEdit: true,
                isAgent: true,
                agentPresenceKey: evt.AgentPresenceKey,
                agentRunId: evt.AgentRunID ?? undefined,
                agentName: evt.AgentName,
                actingForUserId: evt.ActingForUserID,
                actingForUserName: evt.ActingForUserName,
                agentPhase: evt.Phase,
                toolName: evt.ToolName ?? undefined,
                actionSummary: evt.ActionSummary ?? undefined,
                agentLocation: evt.Location ?? undefined,
                timestampMs: evt.TimestampMs
            }
        };
    }

    private recordAgentClientClockHighWater(roomKey: string, clientId: number, ...candidateClocks: number[]): number {
        const hwKey = `${roomKey}::${clientId}`;
        const prev = this._agentClientClockHighWater.get(hwKey) ?? 0;
        let next = prev;
        for (const candidate of candidateClocks) {
            if (Number.isFinite(candidate) && candidate > next) {
                next = candidate;
            }
        }
        if (next > 0) {
            if (
                !this._agentClientClockHighWater.has(hwKey) &&
                this._agentClientClockHighWater.size >= ArtifactCollaborationServer.MAX_AGENT_CLOCK_HIGH_WATER_ENTRIES
            ) {
                const oldestKey = this._agentClientClockHighWater.keys().next().value;
                if (typeof oldestKey === 'string') {
                    this._agentClientClockHighWater.delete(oldestKey);
                }
            }
            this._agentClientClockHighWater.set(hwKey, next);
        }
        return next;
    }

    private isClientIdInUseInRoom(room: CollaborationRoom, presenceKey: string, candidateClientId: number): boolean {
        if (candidateClientId === room.Awareness.clientID || room.ProtectedAgentClientIDs.has(candidateClientId)) {
            return true;
        }
        for (const conn of room.Connections) {
            if (conn.ControlledClientIDs.has(candidateClientId)) {
                return true;
            }
        }
        if (room.Awareness.getStates().has(candidateClientId)) {
            return true;
        }
        for (const [key, entry] of room.AgentPresenceEntries.entries()) {
            if (key !== presenceKey && entry.ClientID === candidateClientId) {
                return true;
            }
        }
        return false;
    }

    private pickAvailableAgentAwarenessClientId(
        presenceKey: string,
        room: CollaborationRoom | undefined
    ): number {
        const baseClientId = this.deriveAgentAwarenessClientId(presenceKey);
        if (!room || !this.isClientIdInUseInRoom(room, presenceKey, baseClientId)) {
            return baseClientId;
        }
        const baseOffset = baseClientId - AGENT_AWARENESS_CLIENT_ID_BASE;
        for (let step = 1; step <= 1024; step++) {
            const candidate = AGENT_AWARENESS_CLIENT_ID_BASE + ((baseOffset + step) & 0x0fffffff);
            if (!this.isClientIdInUseInRoom(room, presenceKey, candidate)) {
                return candidate;
            }
        }
        return baseClientId;
    }

    private buildDetachedPresenceKey(roomKey: string, presenceKey: string): string {
        return `${roomKey}::${presenceKey}`;
    }

    private isAgentPresenceEntryActive(roomKey: string, presenceKey: string, entry: AgentRoomPresenceEntry): boolean {
        const room = this._rooms.get(roomKey);
        if (room && room.AgentPresenceEntries.get(presenceKey) === entry) {
            return true;
        }
        const detachedKey = this.buildDetachedPresenceKey(roomKey, presenceKey);
        return this._detachedAgentPresence.get(detachedKey)?.Entry === entry;
    }

    private encodeAgentAwarenessUpdate(clientId: number, clock: number, payloadJson: string): Uint8Array {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 1);
        encoding.writeVarUint(encoder, clientId);
        encoding.writeVarUint(encoder, clock);
        encoding.writeVarString(encoder, payloadJson);
        return encoding.toUint8Array(encoder);
    }

    private publishAgentAwarenessRelay(
        artifactId: string,
        awarenessBytes: Uint8Array,
        providerKey?: string
    ): void {
        if (awarenessBytes.byteLength === 0) {
            return;
        }
        void this._relay
            .PublishToRoom({
                ArtifactID: artifactId,
                ProviderKey: providerKey,
                MessageType: 'awareness',
                PayloadBase64: BytesToBase64(awarenessBytes)
            })
            .catch((err) => {
                LogError(
                    `ArtifactCollaborationServer agent awareness relay publish error for '${artifactId}': ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            });
    }

    private adoptDetachedAgentPresenceForRoom(roomKey: string, room: CollaborationRoom): void {
        for (const [detachedKey, detached] of Array.from(this._detachedAgentPresence.entries())) {
            if (detached.RoomKey !== roomKey) {
                continue;
            }
            this._detachedAgentPresence.delete(detachedKey);
            let targetClientId = detached.Entry.ClientID;
            if (this.isClientIdInUseInRoom(room, detached.PresenceKey, targetClientId)) {
                targetClientId = this.pickAvailableAgentAwarenessClientId(detached.PresenceKey, room);
                detached.Entry.ClientID = targetClientId;
            }
            room.ProtectedAgentClientIDs.add(targetClientId);
            room.AgentPresenceEntries.set(detached.PresenceKey, detached.Entry);
            if (detached.Entry.LastEvent.Phase !== 'exit') {
                const roomClock = room.Awareness.meta.get(targetClientId)?.clock ?? 0;
                const highWater = this._agentClientClockHighWater.get(`${roomKey}::${targetClientId}`) ?? 0;
                if (detached.Entry.Clock <= Math.max(roomClock, highWater)) {
                    detached.Entry.Clock = Math.max(roomClock, highWater) + 1;
                }
                this.recordAgentClientClockHighWater(roomKey, targetClientId, detached.Entry.Clock);
                const awarenessBytes = this.encodeAgentAwarenessUpdate(
                    targetClientId,
                    detached.Entry.Clock,
                    JSON.stringify(this.buildAgentAwarenessPayload(detached.Entry.LastEvent))
                );
                awarenessProtocol.applyAwarenessUpdate(room.Awareness, awarenessBytes, 'relay');
            }
        }
    }

    private clearRelayedAgentPresenceTimer(room: CollaborationRoom, clientID: number): void {
        const timer = room.RelayedAgentPresenceTimers.get(clientID);
        if (timer) {
            clearTimeout(timer);
            room.RelayedAgentPresenceTimers.delete(clientID);
        }
    }

    private scheduleRelayedAgentPresenceGhostTtl(room: CollaborationRoom, clientID: number): void {
        this.clearRelayedAgentPresenceTimer(room, clientID);
        const roomKey = room.RoomKey;
        const graceMs = Math.min(5_000, Math.max(25, Math.round(this._agentPresenceTtlMs * 0.2)));
        const timeoutMs = Math.max(25, this._agentPresenceTtlMs) + graceMs;
        const timer = setTimeout(() => {
            room.RelayedAgentPresenceTimers.delete(clientID);
            if (this._shuttingDown || this._rooms.get(roomKey) !== room) {
                return;
            }
            const ownedLocally = Array.from(room.AgentPresenceEntries.values()).some((e) => e.ClientID === clientID);
            if (ownedLocally) {
                return;
            }
            room.ProtectedAgentClientIDs.delete(clientID);
            if (room.Awareness.getStates().has(clientID)) {
                awarenessProtocol.removeAwarenessStates(room.Awareness, [clientID], 'agent-presence');
            }
        }, timeoutMs);
        (timer as { unref?: () => void }).unref?.();
        room.RelayedAgentPresenceTimers.set(clientID, timer);
    }

    private syncProtectedAgentClientIdsFromRelayAwareness(room: CollaborationRoom, awarenessBytes: Uint8Array): void {
        try {
            const roomKey = room.RoomKey;
            const decoder = decoding.createDecoder(awarenessBytes);
            const count = decoding.readVarUint(decoder);
            for (let i = 0; i < count; i++) {
                const clientID = decoding.readVarUint(decoder);
                const clock = decoding.readVarUint(decoder);
                const rawStateJson = decoding.readVarString(decoder);
                if (rawStateJson === 'null') {
                    this.recordAgentClientClockHighWater(roomKey, clientID, clock);
                    room.ProtectedAgentClientIDs.delete(clientID);
                    this.clearRelayedAgentPresenceTimer(room, clientID);
                    continue;
                }
                let parsedState: AwarenessJsonValue | undefined;
                try {
                    parsedState = JSON.parse(rawStateJson) as AwarenessJsonValue;
                } catch {
                    parsedState = undefined;
                }
                if (isRelayedAgentAwarenessPayload(parsedState)) {
                    this.recordAgentClientClockHighWater(roomKey, clientID, clock);
                    room.ProtectedAgentClientIDs.add(clientID);
                    this.scheduleRelayedAgentPresenceGhostTtl(room, clientID);
                } else {
                    room.ProtectedAgentClientIDs.delete(clientID);
                    this.clearRelayedAgentPresenceTimer(room, clientID);
                }
            }
        } catch {
            // Ignore malformed awareness payload; applyAwarenessUpdate validates as needed
        }
    }

    private broadcastAgentAwarenessEntry(
        roomKey: string,
        artifactId: string,
        entry: AgentRoomPresenceEntry,
        evt: ArtifactAgentPresenceEvent
    ): void {
        const room = this._rooms.get(roomKey);
        const roomClock = room?.Awareness.meta.get(entry.ClientID)?.clock ?? 0;
        const highWater = this._agentClientClockHighWater.get(`${roomKey}::${entry.ClientID}`) ?? 0;
        entry.Clock = Math.max(entry.Clock, roomClock, highWater) + 1;
        this.recordAgentClientClockHighWater(roomKey, entry.ClientID, entry.Clock);
        entry.LastEvent = evt;
        entry.LastBroadcastMs = Date.now();
        const awarenessBytes = this.encodeAgentAwarenessUpdate(
            entry.ClientID,
            entry.Clock,
            JSON.stringify(this.buildAgentAwarenessPayload(evt))
        );
        if (room) {
            this.clearRelayedAgentPresenceTimer(room, entry.ClientID);
            room.ProtectedAgentClientIDs.add(entry.ClientID);
            awarenessProtocol.applyAwarenessUpdate(room.Awareness, awarenessBytes, 'agent-presence');
            return;
        }
        // No local WebSocket room on this MJServer instance: relay directly so peer nodes deliver it to their viewers.
        const providerKey = roomKey.includes('::') ? roomKey.slice(0, roomKey.indexOf('::')) : undefined;
        this.publishAgentAwarenessRelay(artifactId, awarenessBytes, providerKey);
    }

    private removeServerAgentPresenceEntry(
        roomKey: string,
        artifactId: string,
        presenceKey: string,
        entry: AgentRoomPresenceEntry
    ): void {
        this.clearAgentPresenceTimers(entry);
        entry.PendingWorkingEvent = null;
        const detachedKey = this.buildDetachedPresenceKey(roomKey, presenceKey);
        if (this._detachedAgentPresence.get(detachedKey)?.Entry === entry) {
            this._detachedAgentPresence.delete(detachedKey);
        }
        const room = this._rooms.get(roomKey);
        const highWater = this._agentClientClockHighWater.get(`${roomKey}::${entry.ClientID}`) ?? 0;
        if (room) {
            if (room.AgentPresenceEntries.get(presenceKey) === entry) {
                room.AgentPresenceEntries.delete(presenceKey);
            }
            this.clearRelayedAgentPresenceTimer(room, entry.ClientID);
            room.ProtectedAgentClientIDs.delete(entry.ClientID);
            if (room.Awareness.getStates().has(entry.ClientID)) {
                awarenessProtocol.removeAwarenessStates(room.Awareness, [entry.ClientID], 'agent-presence');
                const postRemoveClock = room.Awareness.meta.get(entry.ClientID)?.clock ?? 0;
                entry.Clock = this.recordAgentClientClockHighWater(
                    roomKey,
                    entry.ClientID,
                    entry.Clock + 1,
                    highWater + 1,
                    postRemoveClock
                );
                return;
            }
        }
        const roomClock = room?.Awareness.meta.get(entry.ClientID)?.clock ?? 0;
        entry.Clock = Math.max(entry.Clock, roomClock, highWater) + 1;
        this.recordAgentClientClockHighWater(roomKey, entry.ClientID, entry.Clock);
        const removalBytes = this.encodeAgentAwarenessUpdate(entry.ClientID, entry.Clock, 'null');
        const providerKey = roomKey.includes('::') ? roomKey.slice(0, roomKey.indexOf('::')) : undefined;
        this.publishAgentAwarenessRelay(artifactId, removalBytes, providerKey);
    }

    private scheduleAgentHardTtl(
        roomKey: string,
        artifactId: string,
        presenceKey: string,
        entry: AgentRoomPresenceEntry
    ): void {
        if (entry.TtlTimer) {
            clearTimeout(entry.TtlTimer);
        }
        entry.TtlTimer = setTimeout(() => {
            entry.TtlTimer = null;
            this.removeServerAgentPresenceEntry(roomKey, artifactId, presenceKey, entry);
        }, this._agentPresenceTtlMs);
        (entry.TtlTimer as { unref?: () => void }).unref?.();
    }

    private scheduleAgentWorkingDecay(
        roomKey: string,
        artifactId: string,
        presenceKey: string,
        entry: AgentRoomPresenceEntry
    ): void {
        if (entry.DecayTimer) {
            clearTimeout(entry.DecayTimer);
            entry.DecayTimer = null;
        }
        if (entry.LastEvent.Phase === 'working' || entry.LastEvent.Phase === 'enter') {
            entry.DecayTimer = setTimeout(() => {
                entry.DecayTimer = null;
                if (!this.isAgentPresenceEntryActive(roomKey, presenceKey, entry)) {
                    return;
                }
                const settledEvent: ArtifactAgentPresenceEvent = {
                    ...entry.LastEvent,
                    Phase: 'settled',
                    TimestampMs: Date.now()
                };
                this.broadcastAgentAwarenessEntry(roomKey, artifactId, entry, settledEvent);
            }, this._agentPresenceDecayMs);
            (entry.DecayTimer as { unref?: () => void }).unref?.();
        }
    }

    protected applyServerAgentPresenceEvent(evt: ArtifactAgentPresenceEvent): void {
        const cleanArtifactId = (evt.ArtifactID ?? '').trim();
        const presenceKey = evt.AgentPresenceKey.trim();
        if (!cleanArtifactId || !presenceKey) {
            return;
        }

        const matchedRoom = this.findRoomForArtifact(cleanArtifactId, null, null);
        const roomKey = matchedRoom ? matchedRoom.RoomKey : this.getRoomKey(cleanArtifactId, null, null);
        const room = matchedRoom ?? this._rooms.get(roomKey);
        const detachedKey = this.buildDetachedPresenceKey(roomKey, presenceKey);
        let entry = room ? room.AgentPresenceEntries.get(presenceKey) : this._detachedAgentPresence.get(detachedKey)?.Entry;

        if (!entry && room) {
            const detached = this._detachedAgentPresence.get(detachedKey);
            if (detached) {
                this._detachedAgentPresence.delete(detachedKey);
                entry = detached.Entry;
                room.ProtectedAgentClientIDs.add(entry.ClientID);
                room.AgentPresenceEntries.set(presenceKey, entry);
            }
        }

        if (!entry) {
            if (evt.Phase === 'exit') {
                return;
            }
            const clientId = this.pickAvailableAgentAwarenessClientId(presenceKey, room);
            const roomMetaClock = room?.Awareness.meta.get(clientId)?.clock ?? 0;
            const highWaterClock = this.recordAgentClientClockHighWater(roomKey, clientId, roomMetaClock);
            entry = {
                ClientID: clientId,
                Clock: highWaterClock,
                LastEvent: evt,
                LastBroadcastMs: 0,
                PendingWorkingEvent: null,
                ThrottleTimer: null,
                DecayTimer: null,
                TtlTimer: null,
                ExitGraceTimer: null
            };
            if (room) {
                room.ProtectedAgentClientIDs.add(clientId);
                room.AgentPresenceEntries.set(presenceKey, entry);
            } else {
                this._detachedAgentPresence.set(detachedKey, {
                    RoomKey: roomKey,
                    ArtifactID: evt.ArtifactID,
                    PresenceKey: presenceKey,
                    Entry: entry
                });
            }
        }

        if (entry.ExitGraceTimer) {
            clearTimeout(entry.ExitGraceTimer);
            entry.ExitGraceTimer = null;
        }

        if (evt.Phase === 'exit') {
            if (entry.ThrottleTimer) {
                clearTimeout(entry.ThrottleTimer);
                entry.ThrottleTimer = null;
            }
            entry.PendingWorkingEvent = null;
            if (entry.DecayTimer) {
                clearTimeout(entry.DecayTimer);
                entry.DecayTimer = null;
            }
            if (entry.TtlTimer) {
                clearTimeout(entry.TtlTimer);
                entry.TtlTimer = null;
            }
            if (this._agentPresenceExitGraceMs <= 0) {
                this.removeServerAgentPresenceEntry(roomKey, evt.ArtifactID, presenceKey, entry);
                return;
            }
            const settledBeforeExit: ArtifactAgentPresenceEvent = {
                ...entry.LastEvent,
                Phase: 'settled',
                TimestampMs: Date.now()
            };
            this.broadcastAgentAwarenessEntry(roomKey, evt.ArtifactID, entry, settledBeforeExit);
            entry.ExitGraceTimer = setTimeout(() => {
                entry!.ExitGraceTimer = null;
                this.removeServerAgentPresenceEntry(roomKey, evt.ArtifactID, presenceKey, entry!);
            }, this._agentPresenceExitGraceMs);
            (entry.ExitGraceTimer as { unref?: () => void }).unref?.();
            return;
        }

        this.scheduleAgentHardTtl(roomKey, evt.ArtifactID, presenceKey, entry);

        if (evt.Phase === 'working' && this._agentPresenceThrottleMs > 0) {
            const elapsed = Date.now() - entry.LastBroadcastMs;
            if (elapsed < this._agentPresenceThrottleMs) {
                entry.PendingWorkingEvent = evt;
                if (!entry.ThrottleTimer) {
                    const delay = Math.max(1, this._agentPresenceThrottleMs - elapsed);
                    entry.ThrottleTimer = setTimeout(() => {
                        entry!.ThrottleTimer = null;
                        const pending = entry!.PendingWorkingEvent;
                        entry!.PendingWorkingEvent = null;
                        if (pending && this.isAgentPresenceEntryActive(roomKey, presenceKey, entry!)) {
                            this.broadcastAgentAwarenessEntry(roomKey, evt.ArtifactID, entry!, pending);
                            this.scheduleAgentWorkingDecay(roomKey, evt.ArtifactID, presenceKey, entry!);
                        }
                    }, delay);
                    (entry.ThrottleTimer as { unref?: () => void }).unref?.();
                }
                return;
            }
        }

        if (entry.ThrottleTimer) {
            clearTimeout(entry.ThrottleTimer);
            entry.ThrottleTimer = null;
        }
        entry.PendingWorkingEvent = null;
        this.broadcastAgentAwarenessEntry(roomKey, evt.ArtifactID, entry, evt);
        this.scheduleAgentWorkingDecay(roomKey, evt.ArtifactID, presenceKey, entry);
    }

    private ensureGlobalMutationListenerRegistered(): void {
        this.ensureLiveMutationHookRegistered();
        this.ensureLiveContentReaderHookRegistered();
        this.ensureAgentPresenceHookRegistered();
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
                    AlreadyAppliedToRoom?: boolean;
                };
                if (payload.AlreadyAppliedToRoom === true) {
                    return;
                }
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
                    Description?: string | null;
                    Comments?: string | null;
                    UserID?: string;
                    UpdatedByUserID?: string;
                    IsRestore?: boolean;
                    OriginServerID?: string;
                    SavedStateVectorB64?: string;
                    SavedContentHash?: string;
                };
                const eventVersionId = payload.VersionID ?? payload.versionId;
                const actorUserId = payload.UserID ?? payload.UpdatedByUserID;
                if (
                    payload.ArtifactID &&
                    eventVersionId &&
                    typeof payload.VersionNumber === 'number' &&
                    !ArtifactCollaborationServer.getSharedCollabState().InFlightCompactionVersionIds.has(
                        NormalizeUUID(eventVersionId)
                    )
                ) {
                    const normEventArtId = NormalizeUUID(payload.ArtifactID.trim());
                    const matchingRooms = Array.from(this._rooms.values()).filter(
                        (r) => NormalizeUUID(r.ArtifactID) === normEventArtId
                    );
                    for (const room of matchingRooms) {
                        if (!UUIDsEqual(room.BaseVersionID, eventVersionId) || payload.IsRestore === true) {
                            const eventContent = payload.Content || payload.Configuration || '';
                            const expectedHash = payload.SavedContentHash ?? this.computeSha256Hex(eventContent);
                            const tracked = this.lookupVerifiedCompactedStateVector(
                                payload.ArtifactID,
                                eventVersionId,
                                payload.VersionNumber,
                                expectedHash,
                                room.ProviderKey
                            );
                            this.reconcileOutOfBandVersionIntoRoom(
                                room,
                                {
                                    ID: eventVersionId,
                                    VersionNumber: payload.VersionNumber,
                                    Content: payload.Content,
                                    Configuration: payload.Configuration,
                                    Description: payload.Description,
                                    Comments: payload.Comments,
                                    UserID: actorUserId
                                },
                                {
                                    originServerId: payload.OriginServerID ?? tracked?.OriginServerID,
                                    savedStateVectorB64: payload.SavedStateVectorB64 ?? tracked?.SavedStateVectorB64,
                                    savedSnapshotB64: tracked?.SavedSnapshotB64,
                                    savedContentHash: expectedHash,
                                    isRestore: payload.IsRestore,
                                    actorUserId: actorUserId
                                }
                            );
                        } else if (UUIDsEqual(room.BaseVersionID, eventVersionId)) {
                            const eventContent = payload.Content || payload.Configuration || '';
                            if (eventContent !== room.BaseVersionText) {
                                room.BaseVersionText = eventContent;
                                room.LastReconciledOobVersionID = null;
                                room.LastReconciledOobContent = null;
                                room.LastReconciledOobMergeResult = null;
                                const currentRoomText = this.extractRoomSerializedContent(room.Doc);
                                room.DirtyVersion = currentRoomText !== eventContent;
                                room.LastCompactedStateVector = room.DirtyVersion
                                    ? null
                                    : Y.encodeStateVector(room.Doc);
                                room.DirtyWorkingState = true;
                                this.scheduleWorkingStateFlush(room);
                            }
                        }
                    }
                }
            }
        });
    }

    protected reconcileOutOfBandVersionIntoRoom(
        room: CollaborationRoom,
        version: {
            ID: string;
            VersionNumber: number;
            Content?: string | null;
            Configuration?: string | null;
            Description?: string | null;
            Comments?: string | null;
            UserID?: string;
        },
        options?: {
            previousContent?: string;
            originServerId?: string;
            savedStateVectorB64?: string;
            savedSnapshotB64?: string;
            savedContentHash?: string;
            crdtSynced?: boolean;
            isRestore?: boolean;
            actorUserId?: string;
        }
    ): void {
        const isRestore = this.isAuthoritativeRestoreVersion(version, options?.isRestore);
        if (isRestore) {
            const alreadyApplied =
                (room.LastAppliedRestoreVersionID !== null &&
                    UUIDsEqual(room.LastAppliedRestoreVersionID, version.ID)) ||
                room.LastAppliedRestoreVersionNumber >= version.VersionNumber ||
                room.BaseVersionNumber > version.VersionNumber;
            if (alreadyApplied) {
                return;
            }
        } else {
            if (UUIDsEqual(room.BaseVersionID, version.ID)) {
                return;
            }
            if (
                options?.originServerId === this._serverInstanceId &&
                room.BaseVersionNumber >= version.VersionNumber
            ) {
                return;
            }
        }
        const targetText = version.Content || version.Configuration || '';
        const targetContentHash = this.computeSha256Hex(targetText);
        const yText = room.Doc.getText('content');
        const liveText = this.extractRoomSerializedContent(room.Doc);
        const baselineText = options?.previousContent ?? room.BaseVersionText;
        const nextEpoch = `epoch-${isRestore ? 'restore-' : ''}${version.ID}-${version.VersionNumber}`;
        room.RoomEpoch = nextEpoch;

        const trackedVerified = this.lookupVerifiedCompactedStateVector(
            room.ArtifactID,
            version.ID,
            version.VersionNumber,
            targetContentHash,
            room.ProviderKey
        );
        const relayHashMatches =
            !options?.savedContentHash || options.savedContentHash === targetContentHash;
        const effectiveVectorB64 = relayHashMatches
            ? options?.savedStateVectorB64 ?? trackedVerified?.SavedStateVectorB64
            : trackedVerified?.SavedStateVectorB64;
        const effectiveSnapshotB64 = relayHashMatches
            ? options?.savedSnapshotB64 ?? trackedVerified?.SavedSnapshotB64
            : trackedVerified?.SavedSnapshotB64;

        const snapshotSatisfied =
            !effectiveSnapshotB64 ||
            this.DoesDocSatisfySnapshot(room.Doc, Base64ToBytes(effectiveSnapshotB64));

        const alreadyContainsCompactedOps = Boolean(
            (options?.crdtSynced && relayHashMatches) ||
                (effectiveVectorB64 &&
                    this.DoesDocContainStateVector(room.Doc, Base64ToBytes(effectiveVectorB64)) &&
                    snapshotSatisfied) ||
                this.doesDocMetaMatchVersionStateVector(
                    room.Doc,
                    room.ArtifactID,
                    version.ID,
                    version.VersionNumber,
                    targetContentHash
                )
        );

        const setBaseMeta = (recordVectorB64?: string, recordSnapshotB64?: string): void => {
            const meta = room.Doc.getMap('meta');
            meta.set('roomEpoch', nextEpoch);
            meta.set('versionNumber', version.VersionNumber);
            meta.set('versionId', version.ID);
            meta.set('baseVersionNumber', version.VersionNumber);
            meta.set('baseVersionId', version.ID);
            if (meta.has('baseContent')) {
                meta.delete('baseContent');
            }
            const versionVectorMetaKey = `art:${NormalizeUUID(room.ArtifactID)}:v:${version.VersionNumber}`;
            if (recordVectorB64) {
                meta.set(
                    versionVectorMetaKey,
                    JSON.stringify({
                        sv: recordVectorB64,
                        ...(recordSnapshotB64 && recordSnapshotB64.length < MAX_META_INLINE_SNAPSHOT_B64_CHARS
                            ? { snap: recordSnapshotB64 }
                            : {}),
                        versionId: version.ID,
                        versionNumber: version.VersionNumber,
                        contentHash: targetContentHash
                    })
                );
                this.pruneArtifactVersionMetaKeys(meta, versionVectorMetaKey);
            } else {
                this.pruneArtifactVersionMetaKeys(
                    meta,
                    meta.has(versionVectorMetaKey) ? versionVectorMetaKey : undefined
                );
            }
        };

        if (isRestore) {
            // B2: Enforce lock validation against live room/working-state content BEFORE either
            // `alreadyContainsCompactedOps` or full-restore replaces `room.Doc`.
            const restoreActorId = options?.actorUserId ?? version.UserID ?? null;
            const isRestoreOwner = Boolean(
                restoreActorId &&
                room.ArtifactOwnerUserID &&
                UUIDsEqual(restoreActorId, room.ArtifactOwnerUserID)
            );
            if (!isRestoreOwner && (liveText !== targetText || (room.BaseConfiguration ?? null) !== (version.Configuration ?? null))) {
                const restoreLockCheck = ValidateArtifactContentMutationAgainstLocks(
                    liveText,
                    targetText,
                    restoreActorId,
                    false,
                    {
                        currentConfiguration: room.BaseConfiguration ?? null,
                        nextConfiguration: version.Configuration ?? null
                    }
                );
                if (!restoreLockCheck.Allowed) {
                    // S5-1 & S6-1: Keep prior BaseConfiguration & BaseVersion baseline intact when a peer
                    // restore is rejected for locks so compaction persists live Content + protected config,
                    // while tracking RejectedOobVersionNumber so FlushWorkingState stays permitted.
                    room.LastAppliedRestoreVersionID = version.ID;
                    room.LastAppliedRestoreVersionNumber = version.VersionNumber;
                    room.PreserveLiveConfiguration = true;
                    room.RejectedOobVersionNumber = Math.max(
                        room.RejectedOobVersionNumber ?? 0,
                        version.VersionNumber
                    );
                    room.DirtyVersion = true;
                    room.LastCompactedStateVector = null;
                    room.DirtyWorkingState = true;
                    this.recordServerWatermark(room);
                    this.scheduleWorkingStateFlush(room);
                    this.broadcastMergeConflictFrame(room, {
                        action: 'merge-conflict',
                        versionId: version.ID,
                        rejectedHunkCount: 1,
                        roomEpoch: room.RoomEpoch,
                        actorUserId: restoreActorId ?? undefined
                    });
                    return;
                }
            }

            if (alreadyContainsCompactedOps) {
                room.Doc.transact(() => {
                    setBaseMeta(effectiveVectorB64, effectiveSnapshotB64);
                    const meta = room.Doc.getMap('meta');
                    meta.set('lastAppliedRestoreVersionId', version.ID);
                    meta.set('lastAppliedRestoreVersionNumber', version.VersionNumber);
                    const restoreSuggestions = this.readSuggestionsFromVersionConfiguration(version.Configuration);
                    if (restoreSuggestions.length > 0 || room.Doc.getMap('suggestions').size > 0) {
                        this.syncSuggestionsIntoDoc(
                            room.Doc,
                            this.parseSuggestionArray(restoreSuggestions),
                            { replace: true }
                        );
                    }
                }, 'server-oob-version');
                room.BaseVersionID = version.ID;
                room.BaseVersionNumber = version.VersionNumber;
                room.BaseVersionText = targetText;
                room.BaseConfiguration = version.Configuration ?? null;
                room.LastReconciledBaselineText = targetText;
                room.LastAppliedRestoreVersionID = version.ID;
                room.LastAppliedRestoreVersionNumber = version.VersionNumber;
                this.recordServerWatermark(room);
                const currentText = this.extractRoomSerializedContent(room.Doc);
                room.DirtyVersion = currentText !== targetText;
                room.LastCompactedStateVector = room.DirtyVersion ? null : Y.encodeStateVector(room.Doc);
                room.DirtyWorkingState = true;
                this.scheduleWorkingStateFlush(room);
                this.broadcastControlFrame(room, {
                    action: 'version-saved',
                    versionId: version.ID,
                    versionNumber: version.VersionNumber,
                    roomEpoch: room.RoomEpoch
                });
                return;
            }

            room.PreOutOfBandDocState = Y.encodeStateAsUpdate(room.Doc);
            const preRestoreSv = Y.encodeStateVector(room.Doc);
            const preRestoreSvB64 = BytesToBase64(preRestoreSv);

            this.applyDeterministicRestoreTextToDoc(
                room.Doc,
                room.ArtifactID,
                version.ID,
                version.VersionNumber,
                targetText,
                'server-restore'
            );
            room.Doc.transact(() => {
                this.syncSlideDeckStructuresIfPresent(room.Doc, targetText);
                this.syncSpreadsheetStructuresIfPresent(room.Doc, targetText, version.Configuration ?? null);
                const restoreSuggestions = this.readSuggestionsFromVersionConfiguration(version.Configuration);
                if (restoreSuggestions.length > 0 || room.Doc.getMap('suggestions').size > 0) {
                    this.syncSuggestionsIntoDoc(
                        room.Doc,
                        this.parseSuggestionArray(restoreSuggestions),
                        { replace: true }
                    );
                }
            }, 'server-restore');

            const postRestoreSv = Y.encodeStateVector(room.Doc);
            const postRestoreSvB64 = BytesToBase64(postRestoreSv);
            const postRestoreSnapB64 = BytesToBase64(Y.encodeSnapshot(Y.snapshot(room.Doc)));

            room.Doc.transact(() => {
                setBaseMeta(postRestoreSvB64, postRestoreSnapB64);
                const meta = room.Doc.getMap('meta');
                meta.set('lastAppliedRestoreVersionId', version.ID);
                meta.set('lastAppliedRestoreVersionNumber', version.VersionNumber);
            }, 'server-restore');

            const restoreDeltaBytes = this.encodeSafeDeltaUpdate(room.Doc, preRestoreSv);
            const MAX_INLINE_RELAY_UPDATE_BYTES = ArtifactCollaborationServer.MAX_INLINE_RELAY_DOC_UPDATE_BYTES;

            room.DirtyVersion = false;
            room.LastCompactedStateVector = postRestoreSv;
            room.LastReconciledBaselineText = targetText;
            room.BaseVersionID = version.ID;
            room.BaseVersionNumber = version.VersionNumber;
            room.BaseVersionText = targetText;
            room.BaseConfiguration = version.Configuration ?? null;
            room.LastAppliedRestoreVersionID = version.ID;
            room.LastAppliedRestoreVersionNumber = version.VersionNumber;
            room.HasActiveLocks = this.computeContentHasActiveLocks(this.extractRoomSerializedContent(room.Doc));
            this.recordServerWatermark(room);
            this.recordCompactedStateVector(
                room.ArtifactID,
                version.ID,
                version.VersionNumber,
                postRestoreSvB64,
                targetContentHash,
                postRestoreSnapB64,
                room.ProviderKey
            );
            room.DirtyWorkingState = true;
            this.scheduleWorkingStateFlush(room);

            const isLocalOrNoOrigin =
                !options?.originServerId || options.originServerId === this._serverInstanceId;
            if (this._relay && isLocalOrNoOrigin) {
                const restoreRelayPayload = JSON.stringify({
                    savedStateVectorB64: postRestoreSvB64,
                    savedSnapshotB64: postRestoreSnapB64,
                    savedContentHash: targetContentHash,
                    isRestore: true,
                    ...(restoreDeltaBytes.byteLength <= MAX_INLINE_RELAY_UPDATE_BYTES
                        ? {
                              savedDocUpdateB64: BytesToBase64(restoreDeltaBytes),
                              prevStateVectorB64: preRestoreSvB64
                          }
                        : {})
                });
                try {
                    void this._relay.PublishToRoom({
                        ArtifactID: room.ArtifactID,
                        ProviderKey: room.ProviderKey,
                        MessageType: 'version-saved',
                        PayloadBase64: restoreRelayPayload,
                        TargetUserID: options?.actorUserId ?? version.UserID ?? undefined,
                        VersionID: version.ID,
                        VersionNumber: version.VersionNumber
                    });
                } catch (relayErr) {
                    LogError(
                        `ArtifactCollaborationServer.reconcileOutOfBandVersionIntoRoom relay publish failed: ${
                            relayErr instanceof Error ? relayErr.message : String(relayErr)
                        }`
                    );
                }
            }
            const flushUser = room.LastModifiedByUser ?? UserCache.Instance.GetSystemUser();
            if (flushUser) {
                void this.FlushWorkingState(room.ArtifactID, flushUser, { provider: room.Provider });
            }

            this.broadcastControlFrame(room, {
                action: 'version-saved',
                versionId: version.ID,
                versionNumber: version.VersionNumber,
                roomEpoch: room.RoomEpoch
            });
            return;
        }

        let oobMergeResult: ConcurrentDocumentMergeResult | null = null;
        let isStructuredSlideOrSheet = false;

        if (alreadyContainsCompactedOps) {
            // Room CRDT state already includes every Yjs operation (including DeleteSet when CRDT-synced)
            // that went into `version`. Advance base version metadata without running a redundant text merge
            // so concurrent live typing is never duplicated or clobbered (`R5-3`, `R6-7`).
            const recordedSvB64 = effectiveVectorB64 ?? BytesToBase64(Y.encodeStateVector(room.Doc));
            room.Doc.transact(() => {
                setBaseMeta(recordedSvB64, effectiveSnapshotB64);
            }, 'server-oob-version');
            room.DirtyVersion = liveText !== targetText;
            if (!room.DirtyVersion) {
                room.LastCompactedStateVector = Y.encodeStateVector(room.Doc);
            } else if (effectiveVectorB64) {
                const decodedSv = this.decodeStrictBase64Bytes(effectiveVectorB64);
                room.LastCompactedStateVector = decodedSv && decodedSv.byteLength > 0 ? decodedSv : null;
            }
        } else if (liveText === targetText) {
            room.Doc.transact(() => {
                setBaseMeta();
            }, 'server-oob-version');
            room.DirtyVersion = false;
            room.LastCompactedStateVector = Y.encodeStateVector(room.Doc);
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
            room.LastCompactedStateVector = Y.encodeStateVector(room.Doc);
        } else if (baselineText !== targetText) {
            room.PreOutOfBandDocState = Y.encodeStateAsUpdate(room.Doc);
            room.Doc.transact(() => {
                oobMergeResult = this.applyMinimalTextDiff(
                    yText,
                    yText.toString(),
                    targetText,
                    baselineText
                );
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
                const oobSuggestions = this.readSuggestionsFromVersionConfiguration(version.Configuration);
                if (oobSuggestions.length > 0) {
                    this.syncSuggestionsIntoDoc(room.Doc, this.parseSuggestionArray(oobSuggestions));
                }
                isStructuredSlideOrSheet =
                    room.Doc.getMap('slidesById').size > 0 ||
                    room.Doc.getMap('worksheetsById').size > 0;
                if (isStructuredSlideOrSheet) {
                    const mergedSerialized = this.extractRoomSerializedContent(room.Doc);
                    this.applyMinimalTextDiff(yText, yText.toString(), mergedSerialized);
                }
                setBaseMeta();
            }, 'server-oob-version');
            const mergedText = this.extractRoomSerializedContent(room.Doc);
            room.DirtyVersion = mergedText !== targetText;
            room.LastCompactedStateVector = room.DirtyVersion ? null : Y.encodeStateVector(room.Doc);
        } else {
            // liveText !== baselineText && baselineText === targetText: preserve live edits untouched
            room.Doc.transact(() => {
                setBaseMeta();
            }, 'server-oob-version');
            room.DirtyVersion = true;
            room.LastCompactedStateVector = null;
        }

        // B3 / R5: Ensure out-of-band version reconciliation (including restores) never silently
        // overwrites live room locks created/held inside the active room when authored by a non-owner.
        let oobLockConflict = false;
        if (this.computeContentHasActiveLocks(liveText) || Boolean(room.BaseConfiguration && room.BaseConfiguration.trim())) {
            const candidateText = this.extractRoomSerializedContent(room.Doc);
            if (candidateText !== liveText) {
                const oobActorId = options?.actorUserId ?? version.UserID ?? null;
                const isOobOwner = Boolean(
                    oobActorId &&
                    room.ArtifactOwnerUserID &&
                    UUIDsEqual(oobActorId, room.ArtifactOwnerUserID)
                );
                const oobLockCheck = ValidateArtifactContentMutationAgainstLocks(
                    liveText,
                    candidateText,
                    oobActorId,
                    isOobOwner,
                    {
                        currentConfiguration: room.BaseConfiguration ?? null,
                        nextConfiguration: version.Configuration ?? null
                    }
                );
                if (!oobLockCheck.Allowed) {
                    oobLockConflict = true;
                    room.Doc.transact(() => {
                        this.applyMinimalTextDiff(yText, yText.toString(), liveText);
                        this.syncSlideDeckStructuresIfPresent(room.Doc, liveText);
                        this.syncSpreadsheetStructuresIfPresent(
                            room.Doc,
                            liveText,
                            room.BaseConfiguration ?? null
                        );
                    }, 'server-oob-version');
                    room.DirtyVersion = true;
                    room.LastCompactedStateVector = null;
                }
            }
        }

        room.LastReconciledBaselineText = baselineText;
        room.BaseVersionID = version.ID;
        room.BaseVersionNumber = version.VersionNumber;
        room.BaseVersionText = targetText;
        if (oobLockConflict) {
            // Preserve live BaseConfiguration across lock-conflicted OOB reconciliations (`S5-1`, `S6-1`)
            room.PreserveLiveConfiguration = true;
            room.RejectedOobVersionNumber = Math.max(
                room.RejectedOobVersionNumber ?? 0,
                version.VersionNumber
            );
        } else {
            room.BaseConfiguration = version.Configuration ?? null;
            room.PreserveLiveConfiguration = false;
        }
        room.HasActiveLocks = this.computeContentHasActiveLocks(this.extractRoomSerializedContent(room.Doc));
        room.DirtyWorkingState = true;
        this.recordServerWatermark(room);
        this.scheduleWorkingStateFlush(room);

        this.broadcastControlFrame(room, {
            action: 'version-saved',
            versionId: version.ID,
            versionNumber: version.VersionNumber,
            roomEpoch: room.RoomEpoch
        });

        const resolvedOobMerge = oobMergeResult as ConcurrentDocumentMergeResult | null;
        room.LastReconciledOobVersionID = version.ID;
        room.LastReconciledOobContent = targetText;
        room.LastReconciledOobMergeResult = !isStructuredSlideOrSheet ? resolvedOobMerge : null;
        if ((!isStructuredSlideOrSheet && resolvedOobMerge?.HadConflict) || oobLockConflict) {
            this.broadcastMergeConflictFrame(room, {
                action: 'merge-conflict',
                versionId: version.ID,
                rejectedHunkCount: resolvedOobMerge?.RejectedAgentHunks.length ?? (oobLockConflict ? 1 : 0),
                roomEpoch: room.RoomEpoch,
                actorUserId: options?.actorUserId ?? version.UserID
            });
        }
    }

    private async checkAndReconcileLatestDatabaseVersion(
        room: CollaborationRoom,
        contextUser: UserInfo,
        options?: {
            originServerId?: string;
            relayVersionId?: string;
            savedStateVectorB64?: string;
            savedSnapshotB64?: string;
            savedContentHash?: string;
            crdtSynced?: boolean;
            isRestore?: boolean;
            actorUserId?: string;
        }
    ): Promise<void> {
        const provider = this._providerOverride ?? room.Provider ?? this.activeProvider();
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
                Description?: string | null;
                Comments?: string | null;
                UserID?: string | null;
            }>(
                {
                    EntityName: 'MJ: Artifact Versions',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                    OrderBy: 'VersionNumber DESC',
                    Fields: ['ID', 'VersionNumber', 'Content', 'Configuration', 'Description', 'Comments', 'UserID'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                queryUser
            );
            const latest = res.Success ? res.Results?.[0] : undefined;
            const isUnappliedRestore =
                Boolean(latest) &&
                options?.isRestore === true &&
                !(
                    (room.LastAppliedRestoreVersionID !== null &&
                        UUIDsEqual(room.LastAppliedRestoreVersionID, latest!.ID)) ||
                    room.LastAppliedRestoreVersionNumber >= latest!.VersionNumber
                );
            if (
                latest &&
                (((!room.BaseVersionID || !UUIDsEqual(latest.ID, room.BaseVersionID)) &&
                    latest.VersionNumber > room.BaseVersionNumber) ||
                    (isUnappliedRestore && latest.VersionNumber >= room.BaseVersionNumber))
            ) {
                const relayMatchesLatest = Boolean(
                    options?.relayVersionId && UUIDsEqual(latest.ID, options.relayVersionId)
                );
                // N2: Only trust the relay's actorUserId when the relay frame actually matches `latest.ID`;
                // otherwise attribute to `latest.UserID` so a concurrent save isn't misattributed.
                const resolvedActorUserId = relayMatchesLatest
                    ? (options?.actorUserId ?? latest.UserID ?? undefined)
                    : (latest.UserID ?? undefined);
                const reconcileOptions = relayMatchesLatest
                    ? {
                          originServerId: options?.originServerId,
                          savedStateVectorB64: options?.savedStateVectorB64,
                          savedSnapshotB64: options?.savedSnapshotB64,
                          savedContentHash: options?.savedContentHash,
                          crdtSynced: options?.crdtSynced,
                          isRestore: options?.isRestore,
                          actorUserId: resolvedActorUserId
                      }
                    : {
                          originServerId: options?.originServerId,
                          actorUserId: resolvedActorUserId
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
            if (!user || user.IsActive === false || user.IsMagicLinkAnonymous || user.MagicLinkScope) {
                return null;
            }
            return { User: user };
        }

        // (b) Primary browser path: single-use short-TTL `?ticket=<nonce>`
        if (parsedUrl.searchParams.has('ticket')) {
            const rawTicket = parsedUrl.searchParams.get('ticket') ?? '';
            const consumed = await this.ConsumeTicket(rawTicket, artifactId);
            if (!consumed || consumed.User.IsMagicLinkAnonymous || consumed.User.MagicLinkScope) {
                return null;
            }
            return consumed;
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
            if (
                !payload?.userRecord ||
                payload.userRecord.IsActive !== true ||
                payload.userRecord.IsMagicLinkAnonymous ||
                payload.userRecord.MagicLinkScope
            ) {
                return null;
            }
            let tokenExpiresAtMs: number | undefined = payload.tokenExpiresAtMs;
            if (tokenExpiresAtMs === undefined && bearerToken) {
                try {
                    const rawJwt = bearerToken.slice(7).trim();
                    const decoded = jwt.decode(rawJwt);
                    if (decoded && typeof decoded === 'object' && 'exp' in decoded && typeof decoded.exp === 'number') {
                        tokenExpiresAtMs = decoded.exp * 1000;
                    }
                } catch {
                    tokenExpiresAtMs = undefined;
                }
            }
            return {
                User: payload.userRecord,
                ApiKeyHash: payload.apiKeyHash,
                TokenExpiresAtMs: tokenExpiresAtMs
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

            if (
                typeof auth.TokenExpiresAtMs === 'number' &&
                Number.isFinite(auth.TokenExpiresAtMs) &&
                auth.TokenExpiresAtMs <= Date.now()
            ) {
                this.rejectRawUpgrade(socket, 401, 'Unauthorized: token expired');
                return;
            }

            const provider = auth.Provider ?? this.activeProvider();
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

            const roomKey = this.getRoomKey(artifactId, provider, auth.User);
            this._pendingUpgradesByArtifact.set(roomKey, (this._pendingUpgradesByArtifact.get(roomKey) ?? 0) + 1);
            try {
                let room: CollaborationRoom | null = null;
                try {
                    room = await this.GetOrCreateRoom(artifactId, auth.User, provider);
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
                    this.attachClientToRoom(
                        room!,
                        ws,
                        auth.User,
                        effectiveCanEdit,
                        auth.ApiKeyHash,
                        perms.Source === 'Owner',
                        auth.TokenExpiresAtMs
                    );
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

    public ComputeDeterministicRestoreClientId(
        doc: Y.Doc,
        artifactId: string,
        versionId: string | undefined,
        versionNumber: number | undefined,
        targetText: string
    ): number {
        const versionPart = versionId
            ? NormalizeUUID(versionId)
            : targetText
              ? this.computeSha256Hex(targetText)
              : 'adhoc';
        const targetContentHash = this.computeSha256Hex(targetText);
        const existingStateVector = Y.decodeStateVector(Y.encodeStateVector(doc));
        const baseSeedKey = `restore:${NormalizeUUID(artifactId)}:${versionPart}:${versionNumber ?? 0}:${targetContentHash}`;
        let candidateClientId = this.deterministicClientIdFromSeed(baseSeedKey);
        while ((existingStateVector.get(candidateClientId) ?? 0) > 0 || candidateClientId === doc.clientID) {
            candidateClientId = (candidateClientId + 1) & 0x3fffffff;
            if (candidateClientId === 0) {
                candidateClientId = 1;
            }
        }
        return candidateClientId;
    }

    private applyDeterministicRestoreTextToDoc(
        doc: Y.Doc,
        artifactId: string,
        versionId: string | undefined,
        versionNumber: number | undefined,
        targetText: string,
        origin: string = 'server-restore'
    ): number {
        const yText = doc.getText('content');
        if (yText.length > 0) {
            yText.delete(0, yText.length);
        }
        const candidateClientId = this.ComputeDeterministicRestoreClientId(
            doc,
            artifactId,
            versionId,
            versionNumber,
            targetText
        );
        if (targetText.length > 0) {
            const restoreSeedDoc = new Y.Doc();
            restoreSeedDoc.clientID = candidateClientId;
            restoreSeedDoc.transact(() => {
                restoreSeedDoc.getText('content').insert(0, targetText);
            }, 'restore-seed');
            const restoreInsertBytes = Y.encodeStateAsUpdate(restoreSeedDoc);
            restoreSeedDoc.destroy();
            Y.applyUpdate(doc, restoreInsertBytes, origin);
        }
        return candidateClientId;
    }

    private async createAndHydrateRoom(
        artifactId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider | null
    ): Promise<CollaborationRoom> {
        if (this._rooms.size >= MAX_ACTIVE_COLLAB_ROOMS) {
            this.pruneExcessIdleRooms();
        }
        if (this._rooms.size >= MAX_ACTIVE_COLLAB_ROOMS) {
            throw new Error(`Collaboration server active room limit (${MAX_ACTIVE_COLLAB_ROOMS}) reached.`);
        }
        const normalizedCreatorId = contextUser?.ID ? NormalizeUUID(contextUser.ID) : '';
        if (normalizedCreatorId) {
            const countUserRooms = (): number => {
                let n = 0;
                for (const existing of this._rooms.values()) {
                    if (existing.CreatedByUserID === normalizedCreatorId) {
                        n++;
                    }
                }
                return n;
            };
            if (countUserRooms() >= MAX_ACTIVE_ROOMS_PER_USER) {
                for (const [rKey, r] of this._rooms.entries()) {
                    if (
                        r.CreatedByUserID === normalizedCreatorId &&
                        r.Connections.size === 0 &&
                        !r.DirtyWorkingState &&
                        !r.DirtyVersion
                    ) {
                        this._rooms.delete(rKey);
                        this.teardownRoomResources(r);
                    }
                }
                if (countUserRooms() >= MAX_ACTIVE_ROOMS_PER_USER) {
                    throw new Error(
                        `Per-user active collaboration room limit (${MAX_ACTIVE_ROOMS_PER_USER}) reached.`
                    );
                }
            }
        }
        const resolvedProvider = provider ?? this.activeProvider();
        const providerKey = this.resolveProviderKey(resolvedProvider, contextUser);
        if (resolvedProvider) {
            this._providersByKey.set(providerKey, resolvedProvider);
        }
        const key = this.getRoomKey(artifactId, resolvedProvider, contextUser);
        const relayRoomKey = this.relayKeyForRoom(artifactId, providerKey);
        const doc = new Y.Doc();
        const awareness = new awarenessProtocol.Awareness(doc);
        // Remove the server Y.Doc's synthetic empty local state so only real connected users appear in awareness
        awareness.setLocalState(null);

        const room: CollaborationRoom = {
            ArtifactID: artifactId,
            ArtifactOwnerUserID: null,
            CreatedByUserID: normalizedCreatorId || null,
            RoomKey: key,
            ProviderKey: providerKey,
            Provider: resolvedProvider ?? null,
            HasActiveLocks: false,
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
            BaseConfiguration: null,
            LastPersistedWorkingStateMs: 0,
            LastAppliedRestoreVersionID: null,
            LastAppliedRestoreVersionNumber: 0,
            LastReconciledOobVersionID: null,
            LastReconciledOobContent: null,
            LastReconciledOobMergeResult: null,
            LastCompactedStateVector: null,
            PendingHydrateConflict: null,
            RoomEpoch: `epoch-init-${artifactId}`,
            FlushQueue: Promise.resolve(true),
            CompactionQueue: Promise.resolve({ Saved: false }),
            WorkingStateTimer: null,
            IdleDisposeTimer: null,
            UnsubscribeRelay: null,
            DocUpdateListener: (update: Uint8Array, origin: CollaborationClientConnection | string | null | undefined) => {
                this.onRoomDocUpdate(room, update, origin);
            },
            AwarenessUpdateListener: (changes, origin) => {
                this.onRoomAwarenessUpdate(room, changes, origin);
            },
            ProtectedAgentClientIDs: new Set<number>(),
            AgentPresenceEntries: new Map<string, AgentRoomPresenceEntry>(),
            RelayedAgentPresenceTimers: new Map<number, ReturnType<typeof setTimeout>>()
        };

        try {
            const { overwriteStaleWorkingState } = await this.hydrateRoomStateFromDatabase(room, contextUser);

            doc.on('update', room.DocUpdateListener);
            awareness.on('update', room.AwarenessUpdateListener);

            room.UnsubscribeRelay = await this._relay.SubscribeRoom(relayRoomKey, async (msg: YjsRelayMessage) => {
                await this.onRelayMessage(room, msg);
            });

            this._rooms.set(key, room);
            this.adoptDetachedAgentPresenceForRoom(key, room);

            const localHydrateClock = Y.decodeStateVector(Y.encodeStateVector(room.Doc)).get(room.Doc.clientID) ?? 0;
            if (overwriteStaleWorkingState) {
                await this.FlushWorkingState(room.ArtifactID, contextUser, { provider: room.Provider });
            }
            if (overwriteStaleWorkingState || localHydrateClock > 0) {
                try {
                    const hydratedState = Y.encodeStateAsUpdate(room.Doc);
                    await this._relay.PublishToRoom({
                        ArtifactID: room.ArtifactID,
                        ProviderKey: room.ProviderKey,
                        MessageType: 'sync-state',
                        PayloadBase64: BytesToBase64(hydratedState)
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
                    ProviderKey: room.ProviderKey,
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
        const provider = this._providerOverride ?? room.Provider ?? this.activeProvider();
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
                        Fields: [
                            'ID',
                            'VersionNumber',
                            'Content',
                            'Configuration',
                            'Description',
                            'Comments',
                            '__mj_CreatedAt',
                            '__mj_UpdatedAt'
                        ],
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    },
                    {
                        EntityName: 'MJ: Artifacts',
                        ExtraFilter: `ID='${safeId}'`,
                        Fields: ['ID', 'UserID', 'DelegateEntityID', 'DelegateRecordID'],
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
                room.ArtifactOwnerUserID = artRow.UserID ?? null;
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

            const sharedState = ArtifactCollaborationServer.getSharedCollabState();
            const serverWatermark = sharedState.ServerVersionWatermarks.get(room.RoomKey);
            if (serverWatermark?.LastAppliedRestoreVersionID) {
                room.LastAppliedRestoreVersionID = serverWatermark.LastAppliedRestoreVersionID;
            }
            if (serverWatermark && serverWatermark.LastAppliedRestoreVersionNumber > 0) {
                room.LastAppliedRestoreVersionNumber = serverWatermark.LastAppliedRestoreVersionNumber;
            }
            const workingVersionId =
                serverWatermark?.BaseVersionID && serverWatermark.BaseVersionID.trim().length > 0
                    ? serverWatermark.BaseVersionID.trim()
                    : undefined;
            const workingVersionNum =
                serverWatermark && serverWatermark.BaseVersionNumber > 0
                    ? serverWatermark.BaseVersionNumber
                    : undefined;

            const versionCreatedMs = versionRow?.__mj_CreatedAt
                ? new Date(versionRow.__mj_CreatedAt).getTime()
                : NaN;
            const workingUpdatedMs = workingRow?.__mj_UpdatedAt
                ? new Date(workingRow.__mj_UpdatedAt).getTime()
                : NaN;
            room.LastPersistedWorkingStateMs = Number.isFinite(workingUpdatedMs) ? workingUpdatedMs : 0;
            const timestampNewer =
                Number.isFinite(versionCreatedMs) &&
                Number.isFinite(workingUpdatedMs) &&
                versionCreatedMs > workingUpdatedMs;
            const hasServerBaseZero =
                serverWatermark !== undefined &&
                workingVersionId === undefined &&
                (workingVersionNum ?? 0) === 0;
            const versionLineageNewer =
                Boolean(versionRow) &&
                (workingVersionId !== undefined
                    ? !UUIDsEqual(versionRow!.ID, workingVersionId)
                    : hasServerBaseZero) &&
                versionRow!.VersionNumber > (workingVersionNum ?? 0) &&
                !(Number.isFinite(versionCreatedMs) && Number.isFinite(workingUpdatedMs) && workingUpdatedMs > versionCreatedMs);

            const yText = room.Doc.getText('content');
            const versionTargetText = versionRow?.Content || versionRow?.Configuration || '';
            const versionSuggestions = this.readSuggestionsFromVersionConfiguration(versionRow?.Configuration);
            const versionNewerThanWorkingState =
                Boolean(versionRow) &&
                Boolean(workingRow?.YjsState) &&
                (workingVersionId
                    ? !UUIDsEqual(workingVersionId, versionRow!.ID)
                    : timestampNewer || versionLineageNewer);

            let seededOrUpdatedWorkingState = sanitizedLegacyMeta;

            if (!appliedWorkingState && yText.length === 0 && (versionTargetText || versionSuggestions.length > 0)) {
                // Seed inside a deterministic-clientID Y.Doc derived from versionRow.ID (or room.ArtifactID)
                // so multi-instance cold opens produce identical Yjs CRDT item IDs (clientID, clock)
                // and merge without duplicating text (Blocker 2, Path 2).
                const seedDoc = new Y.Doc();
                try {
                    seedDoc.clientID = this.deterministicClientIdFromSeed(versionRow?.ID || room.ArtifactID);
                    const nextEpoch = `epoch-${versionRow?.ID ?? room.ArtifactID}`;
                    room.RoomEpoch = nextEpoch;
                    seedDoc.transact(() => {
                        if (versionTargetText) {
                            seedDoc.getText('content').insert(0, versionTargetText);
                        }
                        this.syncSlideDeckStructuresIfPresent(seedDoc, versionTargetText);
                        this.syncSpreadsheetStructuresIfPresent(
                            seedDoc,
                            versionRow?.Content ?? '',
                            versionRow?.Configuration ?? null
                        );
                        if (versionSuggestions.length > 0) {
                            this.syncSuggestionsIntoDoc(
                                seedDoc,
                                this.parseSuggestionArray(versionSuggestions),
                                { replace: true }
                            );
                        }
                        const seedMeta = seedDoc.getMap('meta');
                        if (versionRow) {
                            seedMeta.set('versionNumber', versionRow.VersionNumber);
                            seedMeta.set('versionId', versionRow.ID);
                            seedMeta.set('baseVersionNumber', versionRow.VersionNumber);
                            seedMeta.set('baseVersionId', versionRow.ID);
                        } else {
                            seedMeta.set('baseContent', '');
                        }
                        seedMeta.set('roomEpoch', nextEpoch);
                    }, 'seed');
                    const seedBytes = Y.encodeStateAsUpdate(seedDoc);
                    Y.applyUpdate(room.Doc, seedBytes, 'hydrate');
                    seededOrUpdatedWorkingState = true;
                } finally {
                    seedDoc.destroy();
                }
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
                        if (seedMeta.has('baseContent')) {
                            seedMeta.delete('baseContent');
                        }
                    } else {
                        seedMeta.set('baseContent', '');
                    }
                    seedMeta.set('roomEpoch', nextEpoch);
                }, 'hydrate');
            } else if (appliedWorkingState && versionNewerThanWorkingState && versionRow) {
                const isHydrateRestore = this.isAuthoritativeRestoreVersion(versionRow);
                const currentSerialized = this.extractRoomSerializedContent(room.Doc);
                const versionContentHash = this.computeSha256Hex(versionTargetText);
                const trackedHydrate = this.lookupVerifiedCompactedStateVector(
                    room.ArtifactID,
                    versionRow.ID,
                    versionRow.VersionNumber,
                    versionContentHash,
                    room.ProviderKey
                );
                const hydrateSnapshotSatisfied =
                    !trackedHydrate?.SavedSnapshotB64 ||
                    this.DoesDocSatisfySnapshot(
                        room.Doc,
                        Base64ToBytes(trackedHydrate.SavedSnapshotB64)
                    );
                const alreadyContainsVersionOps = Boolean(
                    !isHydrateRestore &&
                        ((trackedHydrate?.SavedStateVectorB64 &&
                            this.DoesDocContainStateVector(
                                room.Doc,
                                Base64ToBytes(trackedHydrate.SavedStateVectorB64)
                            ) &&
                            hydrateSnapshotSatisfied) ||
                            this.doesDocMetaMatchVersionStateVector(
                                room.Doc,
                                room.ArtifactID,
                                versionRow.ID,
                                versionRow.VersionNumber,
                                versionContentHash
                            ))
                );

                let baseVersionText: string | undefined = serverWatermark?.BaseVersionText;
                if (
                    !isHydrateRestore &&
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
                const nextEpoch = `epoch-${isHydrateRestore ? 'restore-' : ''}${versionRow.ID}-${versionRow.VersionNumber}`;
                room.RoomEpoch = nextEpoch;
                let hydrateMergeResult: ConcurrentDocumentMergeResult | null = null;
                let isStructuredSlideOrSheet = false;
                const keepHydrateMetaKey = `art:${NormalizeUUID(room.ArtifactID)}:v:${versionRow.VersionNumber}`;
                if (isHydrateRestore) {
                    room.Doc.transact(() => {
                        const meta = room.Doc.getMap('meta');
                        meta.set('roomEpoch', nextEpoch);
                    }, 'hydrate');
                    this.applyDeterministicRestoreTextToDoc(
                        room.Doc,
                        room.ArtifactID,
                        versionRow.ID,
                        versionRow.VersionNumber,
                        versionTargetText,
                        'hydrate'
                    );
                    room.Doc.transact(() => {
                        this.syncSlideDeckStructuresIfPresent(room.Doc, versionTargetText);
                        this.syncSpreadsheetStructuresIfPresent(
                            room.Doc,
                            versionTargetText,
                            versionRow.Configuration ?? null
                        );
                        if (versionSuggestions.length > 0 || room.Doc.getMap('suggestions').size > 0) {
                            this.syncSuggestionsIntoDoc(
                                room.Doc,
                                this.parseSuggestionArray(versionSuggestions),
                                { replace: true }
                            );
                        }
                    }, 'hydrate');
                } else {
                    room.Doc.transact(() => {
                        const meta = room.Doc.getMap('meta');
                        meta.set('roomEpoch', nextEpoch);
                        if (!alreadyContainsVersionOps && currentSerialized !== versionTargetText) {
                            hydrateMergeResult = this.applyMinimalTextDiff(
                                yText,
                                yText.toString(),
                                versionTargetText,
                                baseVersionText
                            );
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
                            isStructuredSlideOrSheet =
                                room.Doc.getMap('slidesById').size > 0 ||
                                room.Doc.getMap('worksheetsById').size > 0;
                            if (baseVersionText !== undefined && isStructuredSlideOrSheet) {
                                const mergedSerialized = this.extractRoomSerializedContent(room.Doc);
                                this.applyMinimalTextDiff(yText, yText.toString(), mergedSerialized);
                            }
                        }
                        if (versionSuggestions.length > 0) {
                            this.syncSuggestionsIntoDoc(
                                room.Doc,
                                this.parseSuggestionArray(versionSuggestions)
                            );
                        }
                    }, 'hydrate');
                }
                room.Doc.transact(() => {
                    const meta = room.Doc.getMap('meta');
                    meta.set('versionNumber', versionRow.VersionNumber);
                    meta.set('versionId', versionRow.ID);
                    meta.set('baseVersionNumber', versionRow.VersionNumber);
                    meta.set('baseVersionId', versionRow.ID);
                    if (meta.has('baseContent')) {
                        meta.delete('baseContent');
                    }
                    this.pruneArtifactVersionMetaKeys(
                        meta,
                        meta.has(keepHydrateMetaKey) ? keepHydrateMetaKey : undefined
                    );
                }, 'hydrate');
                const resolvedHydrateMerge = hydrateMergeResult as ConcurrentDocumentMergeResult | null;
                if (!isHydrateRestore && !isStructuredSlideOrSheet && resolvedHydrateMerge?.HadConflict) {
                    if (room.Connections.size > 0) {
                        this.broadcastMergeConflictFrame(room, {
                            action: 'merge-conflict',
                            versionId: versionRow.ID,
                            rejectedHunkCount: resolvedHydrateMerge.RejectedAgentHunks.length,
                            roomEpoch: room.RoomEpoch
                        });
                    } else {
                        room.PendingHydrateConflict = {
                            VersionID: versionRow.ID,
                            RejectedHunkCount: resolvedHydrateMerge.RejectedAgentHunks.length,
                            RoomEpoch: room.RoomEpoch
                        };
                    }
                }
                if (!isHydrateRestore && this.extractRoomSerializedContent(room.Doc) !== versionTargetText) {
                    room.DirtyVersion = true;
                } else {
                    room.DirtyVersion = false;
                }
                seededOrUpdatedWorkingState = true;
            } else if (versionRow) {
                const meta = room.Doc.getMap('meta');
                const curVerNum = meta.get('versionNumber');
                const curVerId = String(meta.get('versionId') ?? '');
                const curBaseNum = meta.get('baseVersionNumber');
                const curBaseId = String(meta.get('baseVersionId') ?? '');
                const existingEpoch = meta.get('roomEpoch') as string | undefined;
                const nextEpoch = existingEpoch || `epoch-${versionRow.ID}`;
                room.RoomEpoch = nextEpoch;
                const keepHydrateMetaKey = `art:${NormalizeUUID(room.ArtifactID)}:v:${versionRow.VersionNumber}`;
                const artKeys = Array.from(meta.keys()).filter((k) => k.startsWith('art:'));
                const shouldPruneArtKeys = artKeys.length > 1 || (artKeys.length === 1 && artKeys[0] !== keepHydrateMetaKey);

                const needsMetaUpdate =
                    curVerNum !== versionRow.VersionNumber ||
                    !UUIDsEqual(curVerId, versionRow.ID) ||
                    curBaseNum !== versionRow.VersionNumber ||
                    !UUIDsEqual(curBaseId, versionRow.ID) ||
                    meta.has('baseContent') ||
                    shouldPruneArtKeys ||
                    !existingEpoch;

                if (needsMetaUpdate) {
                    room.Doc.transact(() => {
                        if (curVerNum !== versionRow.VersionNumber) {
                            meta.set('versionNumber', versionRow.VersionNumber);
                        }
                        if (!UUIDsEqual(curVerId, versionRow.ID)) {
                            meta.set('versionId', versionRow.ID);
                        }
                        if (curBaseNum !== versionRow.VersionNumber) {
                            meta.set('baseVersionNumber', versionRow.VersionNumber);
                        }
                        if (!UUIDsEqual(curBaseId, versionRow.ID)) {
                            meta.set('baseVersionId', versionRow.ID);
                        }
                        if (meta.has('baseContent')) {
                            meta.delete('baseContent');
                            seededOrUpdatedWorkingState = true;
                        }
                        if (shouldPruneArtKeys) {
                            this.pruneArtifactVersionMetaKeys(
                                meta,
                                meta.has(keepHydrateMetaKey) ? keepHydrateMetaKey : undefined
                            );
                            seededOrUpdatedWorkingState = true;
                        }
                        if (!existingEpoch) {
                            meta.set('roomEpoch', nextEpoch);
                        }
                    }, 'hydrate');
                }
            }

            if (versionRow) {
                room.BaseVersionID = versionRow.ID;
                room.BaseVersionNumber = versionRow.VersionNumber;
                room.BaseVersionText = versionTargetText;
                room.BaseConfiguration = versionRow.Configuration ?? null;
                if (
                    versionSuggestions.length > 0 &&
                    (versionNewerThanWorkingState || room.Doc.getMap('suggestions').size === 0)
                ) {
                    room.Doc.transact(() => {
                        this.syncSuggestionsIntoDoc(room.Doc, this.parseSuggestionArray(versionSuggestions), {
                            replace: versionNewerThanWorkingState
                        });
                    }, 'hydrate');
                    seededOrUpdatedWorkingState = true;
                }
                const postHydrateText = this.extractRoomSerializedContent(room.Doc);
                room.LastCompactedStateVector =
                    postHydrateText === versionTargetText ? Y.encodeStateVector(room.Doc) : null;
                room.HasActiveLocks = this.computeContentHasActiveLocks(postHydrateText);
                this.recordServerWatermark(room);
            } else {
                const postHydrateText = this.extractRoomSerializedContent(room.Doc);
                room.BaseVersionText = postHydrateText;
                room.BaseConfiguration = null;
                room.LastCompactedStateVector = null;
                room.HasActiveLocks = this.computeContentHasActiveLocks(postHydrateText);
                this.recordServerWatermark(room);
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
        apiKeyHash?: string,
        isOwner: boolean = false,
        tokenExpiresAtMs?: number
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
            IsOwner: isOwner,
            ApiKeyHash: apiKeyHash,
            TokenExpiresAtMs: tokenExpiresAtMs,
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

        if (room.PendingHydrateConflict && room.PendingHydrateConflict.RoomEpoch === room.RoomEpoch) {
            const pendingConflict = room.PendingHydrateConflict;
            room.PendingHydrateConflict = null;
            this.sendControlFrame(ws, {
                action: 'merge-conflict',
                versionId: pendingConflict.VersionID,
                rejectedHunkCount: pendingConflict.RejectedHunkCount,
                roomEpoch: pendingConflict.RoomEpoch
            });
        }

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

    /**
     * Checks whether serialized room content currently contains any lock annotations
     * (`<!-- mj-lock -->`, locked `:::mj-block`, slide/region `Locked: true`, or spreadsheet `ProtectedRanges`)
     * so normal keystrokes on unlocked documents skip cloning `room.Doc` (`O(1)` fast path).
     */
    private computeContentHasActiveLocks(content: string): boolean {
        if (!content || content.length === 0) {
            return false;
        }
        const trimmed = content.trim();
        if (trimmed.startsWith('{')) {
            try {
                const parsed = JSON.parse(trimmed) as {
                    Slides?: Array<{ Locked?: boolean; Regions?: Array<{ Locked?: boolean }> }>;
                    Worksheets?: Array<{ ProtectedRanges?: Array<object> }>;
                };
                if (Array.isArray(parsed.Slides)) {
                    for (const slide of parsed.Slides) {
                        if (slide?.Locked) {
                            return true;
                        }
                        if (Array.isArray(slide?.Regions) && slide.Regions.some((r) => Boolean(r?.Locked))) {
                            return true;
                        }
                    }
                    return false;
                }
                if (Array.isArray(parsed.Worksheets)) {
                    return parsed.Worksheets.some(
                        (ws) => Array.isArray(ws?.ProtectedRanges) && ws.ProtectedRanges.length > 0
                    );
                }
            } catch {
                // Fall back to lock parser / fail-safe detection below
                return true;
            }
        }
        try {
            return DocumentLiveBlockEngine.Instance.ParseDocumentLocks(content).length > 0;
        } catch {
            return true;
        }
    }

    private isSlideLockConfigEqual(
        a: { Locked?: boolean; LockedByUserID?: string; AllowEditors?: boolean } | undefined,
        b: { Locked?: boolean; LockedByUserID?: string; AllowEditors?: boolean } | undefined
    ): boolean {
        return (
            Boolean(a?.Locked) === Boolean(b?.Locked) &&
            (a?.LockedByUserID ?? '').trim().toLowerCase() === (b?.LockedByUserID ?? '').trim().toLowerCase() &&
            Boolean(a?.AllowEditors) === Boolean(b?.AllowEditors)
        );
    }

    /**
     * Validates an incoming Yjs write update against client `meta` immutability, Markdown heading locks,
     * Slide Deck locks, and Spreadsheet ProtectedRanges by simulating the update against a cloned doc snapshot.
     * Always evaluates `probeDoc` on every non-empty client write frame (`P0-12`, `P0-13`).
     */
    protected isIncomingUpdateBlockedByLocks(
        room: CollaborationRoom,
        conn: CollaborationClientConnection,
        incomingUpdateBytes: Uint8Array
    ): { Allowed: boolean; Reason?: string } {
        if (incomingUpdateBytes.byteLength === 0) {
            return { Allowed: true };
        }

        const currentContent = this.extractRoomSerializedContent(room.Doc);
        const beforeMetaJson = JSON.stringify(room.Doc.getMap('meta').toJSON());
        const probeDoc = new Y.Doc();
        try {
            const decodedUpdate = Y.decodeUpdate(incomingUpdateBytes);
            const serverStateVector = Y.decodeStateVector(Y.encodeStateVector(room.Doc));
            const readStructParent = (item: Y.Item): object | string | null => item.parent;
            const touchesMetaMap = decodedUpdate.structs.some((struct) => {
                if (!(struct instanceof Y.Item) || readStructParent(struct) !== 'meta') {
                    return false;
                }
                const knownClock = serverStateVector.get(struct.id.client) ?? 0;
                return struct.id.clock >= knownClock;
            });
            if (touchesMetaMap) {
                return {
                    Allowed: false,
                    Reason: 'Forbidden: clients cannot mutate server collaboration metadata.'
                };
            }

            // S9b / R3 O(update) fast path: ONLY when an unlocked plain-text/Markdown document
            // receives an in-order update targeting `yText('content')` with NO delete-set entries
            // (`ds.clients.size === 0`) and NO `mj-lock` / HTML / JSON structural markers.
            // Any update containing deletes (`ds.clients.size > 0`) MUST go through the slow path (`R3`).
            // Note (`L2`): Yjs omits `item.parent` on normal delta items that specify an `origin`, so
            // `readStructParent(struct) !== 'content'` conservatively routes those to the slow path as well.
            if (decodedUpdate.ds.clients.size === 0 && !room.HasActiveLocks && !currentContent.trimStart().startsWith('{')) {
                const expectedNextClockByClient = new Map<number, number>(serverStateVector);
                let safeFastPath = true;
                for (const struct of decodedUpdate.structs) {
                    if (!(struct instanceof Y.Item)) {
                        safeFastPath = false;
                        break;
                    }
                    if (readStructParent(struct) !== 'content') {
                        safeFastPath = false;
                        break;
                    }
                    if (struct.content instanceof Y.ContentString && /[<>{}]|mj-lock|--/i.test(struct.content.str)) {
                        safeFastPath = false;
                        break;
                    }
                    const expectedClock = expectedNextClockByClient.get(struct.id.client) ?? 0;
                    if (struct.id.clock > expectedClock) {
                        safeFastPath = false;
                        break;
                    }
                    if (struct.id.clock + struct.length > expectedClock) {
                        expectedNextClockByClient.set(struct.id.client, struct.id.clock + struct.length);
                    }
                }
                if (safeFastPath) {
                    return { Allowed: true };
                }
            }

            Y.applyUpdate(probeDoc, Y.encodeStateAsUpdate(room.Doc));
            const probeStore = probeDoc.store as {
                pendingStructs: { missing: Map<number, number>; update: Uint8Array } | null;
                pendingDs: Uint8Array | null;
            };
            const beforePendingLen = probeStore.pendingStructs?.update?.byteLength ?? 0;
            const beforePendingDsLen = probeStore.pendingDs?.byteLength ?? 0;
            const beforeMissing = new Map<number, number>(probeStore.pendingStructs?.missing ?? []);

            Y.applyUpdate(probeDoc, incomingUpdateBytes);

            // N5: Only reject if `incomingUpdateBytes` itself introduced NEW pending out-of-order
            // structs or delete sets — never fail because `room.Doc` already held pre-existing relay gaps.
            const afterPendingLen = probeStore.pendingStructs?.update?.byteLength ?? 0;
            const afterPendingDsLen = probeStore.pendingDs?.byteLength ?? 0;
            const afterMissing = probeStore.pendingStructs?.missing;
            let introducedNewMissing = false;
            if (afterMissing) {
                for (const [clientId, missingClock] of afterMissing.entries()) {
                    if (beforeMissing.get(clientId) !== missingClock) {
                        introducedNewMissing = true;
                        break;
                    }
                }
            }
            if (
                afterPendingLen > beforePendingLen ||
                afterPendingDsLen > beforePendingDsLen ||
                introducedNewMissing
            ) {
                return {
                    Allowed: false,
                    Reason: 'Write rejected: incomplete out-of-order Yjs update cannot be lock-verified.'
                };
            }
            const afterMetaJson = JSON.stringify(probeDoc.getMap('meta').toJSON());
            if (afterMetaJson !== beforeMetaJson) {
                return {
                    Allowed: false,
                    Reason: 'Forbidden: clients cannot mutate server collaboration metadata.'
                };
            }
            const nextContent = this.extractRoomSerializedContent(probeDoc);
            return this.validateContentMutationAgainstLocks(
                currentContent,
                nextContent,
                conn.User?.ID,
                conn.IsOwner === true
            );
        } catch {
            // Fail closed when lock validation cannot parse/apply the update cleanly (`P0-12`).
            return {
                Allowed: false,
                Reason: 'Write rejected: unable to verify protected-region lock permissions.'
            };
        } finally {
            probeDoc.destroy();
        }
    }

    /**
     * Enforces protected regions across Documents (`<!-- mj-lock -->`), Slide Decks (`Locked` /
     * `AllowEditors`), and Spreadsheets (`ProtectedRanges`) (`§6.2`).
     */
    private validateContentMutationAgainstLocks(
        currentContent: string,
        nextContent: string,
        actorUserId?: string | null,
        isOwner: boolean = false
    ): { Allowed: boolean; Reason?: string } {
        return ValidateArtifactContentMutationAgainstLocks(currentContent, nextContent, actorUserId, isOwner);
    }

    private onClientMessage(
        room: CollaborationRoom,
        conn: CollaborationClientConnection,
        rawData: RawData
    ): void {
        try {
            const nowMs = Date.now();
            if (!conn.FrameWindowStartMs || nowMs - conn.FrameWindowStartMs >= CLIENT_FRAME_RATE_WINDOW_MS) {
                conn.FrameWindowStartMs = nowMs;
                conn.FrameCountInWindow = 1;
            } else {
                conn.FrameCountInWindow = (conn.FrameCountInWindow ?? 0) + 1;
                if (conn.FrameCountInWindow > MAX_CLIENT_FRAMES_PER_WINDOW) {
                    this.sendControlFrame(conn.Socket, {
                        action: 'readonly-rejected',
                        message: 'Rate limit exceeded: too many collaboration frames in window.'
                    });
                    return;
                }
            }

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
                        const currentDocBytes = Y.encodeStateAsUpdate(room.Doc).byteLength;
                        if (currentDocBytes + incomingUpdateBytes.byteLength > MAX_ROOM_DOC_BYTES) {
                            this.sendControlFrame(conn.Socket, {
                                action: 'readonly-rejected',
                                message: `Write rejected: collaboration document size limit (${MAX_ROOM_DOC_BYTES} bytes) exceeded.`
                            });
                            return;
                        }
                        if (this.shouldSuppressDuplicateReconnectUpdate(room, conn, incomingUpdateBytes)) {
                            return;
                        }
                        const lockCheck = this.isIncomingUpdateBlockedByLocks(room, conn, incomingUpdateBytes);
                        if (!lockCheck.Allowed) {
                            this.sendControlFrame(conn.Socket, {
                                action: 'readonly-rejected',
                                message: lockCheck.Reason || 'Write rejected: region is protected.'
                            });
                            this.sendControlFrame(conn.Socket, {
                                action: 'room-reset',
                                payload: BytesToBase64(Y.encodeStateAsUpdate(room.Doc)),
                                roomEpoch: room.RoomEpoch,
                                versionId: room.BaseVersionID ?? undefined,
                                versionNumber: room.BaseVersionNumber || undefined
                            });
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
                    if (updateBytes.byteLength > MAX_AWARENESS_FRAME_BYTES) {
                        this.sendControlFrame(conn.Socket, {
                            action: 'readonly-rejected',
                            message: `Awareness payload exceeds maximum size (${MAX_AWARENESS_FRAME_BYTES} bytes).`
                        });
                        return;
                    }
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
                        const validCapturedThumbnail = IsValidThumbnailDataUrl(control.thumbnailDataUrl)
                            ? control.thumbnailDataUrl
                            : null;
                        void this.CompactRoomToArtifactVersion(room.ArtifactID, conn.User, {
                            CapturedThumbnailDataUrl: validCapturedThumbnail,
                            Provider: room.Provider
                        });
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

            if (clientID === room.Awareness.clientID || room.ProtectedAgentClientIDs.has(clientID)) {
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

            const parsedState = JSON.parse(rawStateJson) as AwarenessJsonValue;
            if (parsedState === null) {
                if (!conn.ControlledClientIDs.has(clientID)) {
                    continue;
                }
                accepted.push({ clientID, clock, stateJson: 'null' });
            } else if (isAwarenessJsonObject(parsedState)) {
                const {
                    isAgent: _ignoredTopIsAgent,
                    agentPresenceKey: _ignoredTopKey,
                    agentName: _ignoredTopAgentName,
                    agentRunId: _ignoredTopRunId,
                    actingForUserId: _ignoredTopActingForId,
                    actingForUserName: _ignoredTopActingForName,
                    actingForUserEmail: _ignoredTopActingForEmail,
                    email: _ignoredTopEmail,
                    agentPhase: _ignoredTopPhase,
                    toolName: _ignoredTopTool,
                    actionSummary: _ignoredTopSummary,
                    agentLocation: _ignoredTopLocation,
                    ...safeTopLevelState
                } = parsedState;
                const candidateUser = parsedState['user'];
                const rawUser: AwarenessJsonObject = isAwarenessJsonObject(candidateUser) ? candidateUser : {};
                const {
                    isAgent: _ignoredUserIsAgent,
                    agentPresenceKey: _ignoredUserKey,
                    agentName: _ignoredUserAgentName,
                    agentRunId: _ignoredUserRunId,
                    actingForUserId: _ignoredUserActingForId,
                    actingForUserName: _ignoredUserActingForName,
                    actingForUserEmail: _ignoredUserActingForEmail,
                    email: _ignoredUserEmail,
                    agentPhase: _ignoredUserPhase,
                    toolName: _ignoredUserTool,
                    actionSummary: _ignoredUserSummary,
                    agentLocation: _ignoredUserLocation,
                    color: rawUserColor,
                    ...safeRawUser
                } = rawUser;
                const sanitizedColor = rawUserColor !== undefined ? sanitizeAwarenessColor(rawUserColor) : undefined;
                const verifiedState: AwarenessJsonObject = {
                    ...safeTopLevelState,
                    user: {
                        ...safeRawUser,
                        ...(sanitizedColor !== undefined ? { color: sanitizedColor } : {}),
                        userId: conn.User.ID,
                        userName: conn.User.Name,
                        name: conn.User.Name,
                        canEdit: conn.CanEdit,
                        isAgent: false
                    }
                };
                if (
                    !conn.ControlledClientIDs.has(clientID) &&
                    conn.ControlledClientIDs.size >= ArtifactCollaborationServer.MAX_CONTROLLED_CLIENT_IDS_PER_CONN
                ) {
                    continue;
                }
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

    private onRoomDocUpdate(
        room: CollaborationRoom,
        update: Uint8Array,
        origin: CollaborationClientConnection | string | null | undefined
    ): void {
        if (origin === 'hydrate') {
            return;
        }
        room.HasActiveLocks = this.computeContentHasActiveLocks(this.extractRoomSerializedContent(room.Doc));

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
                    ProviderKey: room.ProviderKey,
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
        origin: CollaborationClientConnection | string | null | undefined
    ): void {
        const changedClients = changes.added.concat(changes.updated, changes.removed);
        if (changedClients.length === 0) {
            return;
        }

        if (origin && typeof origin === 'object' && 'ControlledClientIDs' in origin) {
            const conn = origin as CollaborationClientConnection;
            for (const clientId of changes.added) {
                if (
                    conn.ControlledClientIDs.has(clientId) ||
                    conn.ControlledClientIDs.size < ArtifactCollaborationServer.MAX_CONTROLLED_CLIENT_IDS_PER_CONN
                ) {
                    conn.ControlledClientIDs.add(clientId);
                }
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
                    ProviderKey: room.ProviderKey,
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

    private applyServerRoomRollback(
        room: CollaborationRoom,
        payload: {
            restoredVersionId?: string | null;
            restoredVersionNumber?: number;
            restoredBaseText?: string;
            restoredBaseConfiguration?: string | null;
        }
    ): void {
        if (
            typeof payload.restoredVersionNumber === 'number' &&
            payload.restoredVersionNumber > 0 &&
            payload.restoredVersionNumber < room.BaseVersionNumber
        ) {
            room.BaseVersionID = payload.restoredVersionId ?? null;
            room.BaseVersionNumber = payload.restoredVersionNumber;
            if (typeof payload.restoredBaseText === 'string') {
                room.BaseVersionText = payload.restoredBaseText;
            }
            if (payload.restoredBaseConfiguration !== undefined) {
                room.BaseConfiguration = payload.restoredBaseConfiguration;
            }
            room.DirtyVersion = this.extractRoomSerializedContent(room.Doc) !== room.BaseVersionText;
            room.LastReconciledOobVersionID = null;
            room.LastReconciledOobContent = null;
            room.LastReconciledOobMergeResult = null;
            room.LastReconciledBaselineText = null;
            this.recordServerWatermark(room);
        }
    }

    private async onRelayMessage(room: CollaborationRoom, msg: YjsRelayMessage): Promise<void> {
        if (msg.MessageType === 'sync-update' && msg.PayloadBase64) {
            const updateBytes = Base64ToBytes(msg.PayloadBase64);
            if (updateBytes.byteLength > 0) {
                Y.applyUpdate(room.Doc, updateBytes, 'relay');
                this.dedupeOrderArraysAfterRelay(room.Doc);
                room.HasActiveLocks = this.computeContentHasActiveLocks(this.extractRoomSerializedContent(room.Doc));
            }
        } else if (msg.MessageType === 'room-rollback' && msg.PayloadBase64) {
            try {
                const parsed = JSON.parse(Buffer.from(msg.PayloadBase64, 'base64').toString('utf8')) as {
                    restoredVersionId?: string | null;
                    restoredVersionNumber?: number;
                    restoredBaseText?: string;
                    restoredBaseConfiguration?: string | null;
                };
                this.applyServerRoomRollback(room, parsed);
            } catch (err) {
                LogError(
                    `ArtifactCollaborationServer failed parsing room-rollback relay payload for '${room.ArtifactID}': ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        } else if (msg.MessageType === 'sync-request') {
            const reqSvBytes = msg.PayloadBase64 ? this.decodeStrictBase64Bytes(msg.PayloadBase64) : null;
            const diffUpdate =
                reqSvBytes && reqSvBytes.byteLength > 0
                    ? this.encodeSafeDeltaUpdate(room.Doc, reqSvBytes)
                    : Y.encodeStateAsUpdate(room.Doc);
            if (diffUpdate.byteLength > 0) {
                try {
                    await this._relay.PublishToRoom({
                        ArtifactID: room.ArtifactID,
                        ProviderKey: room.ProviderKey,
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
            const parsedSync = this.parseSyncStateRelayPayload(msg.PayloadBase64);
            if (parsedSync.updateBytes && parsedSync.updateBytes.byteLength > 0) {
                try {
                    Y.applyUpdate(room.Doc, parsedSync.updateBytes, 'collab-relay');
                    this.dedupeOrderArraysAfterRelay(room.Doc);
                    room.HasActiveLocks = this.computeContentHasActiveLocks(this.extractRoomSerializedContent(room.Doc));
                    this.resolvePendingSyncWaiters(room.ArtifactID, true);
                } catch (err) {
                    LogError(
                        `ArtifactCollaborationServer sync-state Y.applyUpdate failed for '${room.ArtifactID}': ${
                            err instanceof Error ? err.message : String(err)
                        }`
                    );
                }
            }
        } else if (msg.MessageType === 'awareness' && msg.PayloadBase64) {
            const awarenessBytes = Base64ToBytes(msg.PayloadBase64);
            if (awarenessBytes.byteLength > 0) {
                this.syncProtectedAgentClientIdsFromRelayAwareness(room, awarenessBytes);
                awarenessProtocol.applyAwarenessUpdate(room.Awareness, awarenessBytes, 'relay');
            }
        } else if (msg.MessageType === 'permission-revoked') {
            await this.ReevaluateRoomPermissions(room.ArtifactID, msg.TargetUserID, false, undefined, room.Provider);
        } else if (msg.MessageType === 'version-saved' && typeof msg.VersionNumber === 'number') {
            const relayPayload = this.parseVersionSavedRelayPayload(msg.PayloadBase64);
            let crdtSynced = false;

            const prevSvBytes = relayPayload.prevStateVectorB64
                ? this.decodeStrictBase64Bytes(relayPayload.prevStateVectorB64)
                : null;
            const canApplyInlineDelta = Boolean(
                relayPayload.savedDocUpdateB64 &&
                    (!relayPayload.prevStateVectorB64 ||
                        (prevSvBytes && this.DoesDocContainStateVector(room.Doc, prevSvBytes)))
            );

            if (canApplyInlineDelta && relayPayload.savedDocUpdateB64) {
                const updateBytes = this.decodeStrictBase64Bytes(relayPayload.savedDocUpdateB64);
                if (updateBytes && updateBytes.byteLength > 0) {
                    try {
                        Y.applyUpdate(room.Doc, updateBytes, 'collab-relay');
                        this.dedupeOrderArraysAfterRelay(room.Doc);
                        room.HasActiveLocks = this.computeContentHasActiveLocks(
                            this.extractRoomSerializedContent(room.Doc)
                        );
                        crdtSynced = true;
                    } catch (err) {
                        LogError(
                            `ArtifactCollaborationServer version-saved inline update failed for '${room.ArtifactID}': ${
                                err instanceof Error ? err.message : String(err)
                            }`
                        );
                    }
                } else if (updateBytes && updateBytes.byteLength === 0) {
                    crdtSynced = true;
                }

                if (crdtSynced && relayPayload.savedSnapshotB64) {
                    const snapBytes = this.decodeStrictBase64Bytes(relayPayload.savedSnapshotB64);
                    if (!snapBytes || !this.DoesDocSatisfySnapshot(room.Doc, snapBytes)) {
                        crdtSynced = false;
                    }
                }
            }

            if (!crdtSynced) {
                const targetSvBytes = relayPayload.savedStateVectorB64
                    ? this.decodeStrictBase64Bytes(relayPayload.savedStateVectorB64)
                    : null;
                const targetSnapBytes = relayPayload.savedSnapshotB64
                    ? this.decodeStrictBase64Bytes(relayPayload.savedSnapshotB64)
                    : null;

                const missingStateVector = Boolean(
                    relayPayload.savedStateVectorB64 &&
                        (!targetSvBytes || !this.DoesDocContainStateVector(room.Doc, targetSvBytes))
                );
                const missingSnapshotDeletes = Boolean(
                    relayPayload.savedSnapshotB64 &&
                        (!targetSnapBytes || !this.DoesDocSatisfySnapshot(room.Doc, targetSnapBytes))
                );
                const cleanRoomHashDiffers = Boolean(
                    relayPayload.savedContentHash &&
                        !room.DirtyVersion &&
                        this.computeSha256Hex(this.extractRoomSerializedContent(room.Doc)) !==
                            relayPayload.savedContentHash
                );

                if (missingStateVector || missingSnapshotDeletes || cleanRoomHashDiffers) {
                    const isTargetSatisfied = (): boolean => {
                        const svOk =
                            !relayPayload.savedStateVectorB64 ||
                            Boolean(targetSvBytes && this.DoesDocContainStateVector(room.Doc, targetSvBytes));
                        const snapOk =
                            !relayPayload.savedSnapshotB64 ||
                            Boolean(targetSnapBytes && this.DoesDocSatisfySnapshot(room.Doc, targetSnapBytes));
                        const hashOk =
                            !cleanRoomHashDiffers ||
                            !relayPayload.savedContentHash ||
                            room.DirtyVersion ||
                            this.computeSha256Hex(this.extractRoomSerializedContent(room.Doc)) ===
                                relayPayload.savedContentHash;
                        return svOk && snapOk && hashOk;
                    };
                    crdtSynced = await this.requestPeerRoomSyncCatchup(
                        room,
                        ArtifactCollaborationServer.SYNC_WAIT_TIMEOUT_MS,
                        isTargetSatisfied
                    );

                    if (crdtSynced) {
                        const svOk =
                            !relayPayload.savedStateVectorB64 ||
                            Boolean(targetSvBytes && this.DoesDocContainStateVector(room.Doc, targetSvBytes));
                        const snapOk =
                            !relayPayload.savedSnapshotB64 ||
                            Boolean(targetSnapBytes && this.DoesDocSatisfySnapshot(room.Doc, targetSnapBytes));
                        if (!svOk || !snapOk) {
                            crdtSynced = false;
                        }
                    }

                    if (!crdtSynced && !(room.HasActiveLocks && relayPayload.isRestore)) {
                        crdtSynced = await this.tryCatchUpRoomFromPersistedWorkingState(
                            room,
                            relayPayload.savedStateVectorB64,
                            relayPayload.savedSnapshotB64
                        );
                    }
                } else if (Boolean(relayPayload.savedStateVectorB64 || relayPayload.savedSnapshotB64)) {
                    crdtSynced = true;
                }
            }

            const queryActor = room.LastModifiedByUser ?? UserCache.Instance.GetSystemUser();
            if (
                msg.VersionID &&
                (!UUIDsEqual(msg.VersionID, room.BaseVersionID) || relayPayload.isRestore === true) &&
                queryActor
            ) {
                await this.checkAndReconcileLatestDatabaseVersion(room, queryActor, {
                    originServerId: msg.OriginInstanceID,
                    relayVersionId: msg.VersionID,
                    savedStateVectorB64: relayPayload.savedStateVectorB64,
                    savedSnapshotB64: relayPayload.savedSnapshotB64,
                    savedContentHash: relayPayload.savedContentHash,
                    crdtSynced,
                    isRestore: relayPayload.isRestore,
                    actorUserId: msg.TargetUserID
                });
            } else {
                room.DirtyVersion = false;
                room.LastCompactedStateVector = Y.encodeStateVector(room.Doc);
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
            void this.CompactRoomToArtifactVersion(room.ArtifactID, actor, {
                Provider: room.Provider
            }).finally(() => {
                if (room.Connections.size === 0 && !this._shuttingDown) {
                    this.scheduleIdleRoomDisposal(room);
                }
            });
        } else if (!this._shuttingDown) {
            this.scheduleIdleRoomDisposal(room);
        }
    }

    private pruneExcessIdleRooms(): void {
        const nowMs = Date.now();
        for (const [roomKey, room] of Array.from(this._rooms.entries())) {
            if (room.Connections.size > 0 || (this._pendingUpgradesByArtifact.get(roomKey) ?? 0) > 0) {
                continue;
            }
            const isClean = !room.DirtyWorkingState && !room.DirtyVersion;
            const isExpiredDirty =
                room.RetainedDirtySinceMs != null && nowMs - room.RetainedDirtySinceMs >= RETAINED_DIRTY_ROOM_TTL_MS;
            if (isClean || isExpiredDirty) {
                this._rooms.delete(roomKey);
                this.teardownRoomResources(room);
            }
        }
    }

    private scheduleIdleRoomDisposal(room: CollaborationRoom, delayMs?: number): void {
        if (room.IdleDisposeTimer) {
            clearTimeout(room.IdleDisposeTimer);
            room.IdleDisposeTimer = null;
        }
        room.IdleDisposeTimer = setTimeout(() => {
            room.IdleDisposeTimer = null;
            void this.disposeRoomIfIdle(room);
        }, delayMs ?? this._idleRoomTtlMs);
        (room.IdleDisposeTimer as { unref?: () => void }).unref?.();
    }

    private async disposeRoomIfIdle(room: CollaborationRoom): Promise<void> {
        const key = room.RoomKey;
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
                    await this.CompactRoomToArtifactVersion(room.ArtifactID, actor, { Provider: room.Provider });
                } else {
                    await this.FlushWorkingState(room.ArtifactID, actor, { provider: room.Provider });
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
                const nowMs = Date.now();
                room.RetainedDirtySinceMs = room.RetainedDirtySinceMs ?? nowMs;
                const retainedDirtyCount = Array.from(this._rooms.values()).filter(
                    (r) => r.Connections.size === 0 && (r.DirtyWorkingState || r.DirtyVersion) && r.RetainedDirtySinceMs != null
                ).length;
                const ttlExpired = nowMs - room.RetainedDirtySinceMs >= RETAINED_DIRTY_ROOM_TTL_MS;
                if (!ttlExpired && retainedDirtyCount <= MAX_RETAINED_DIRTY_ROOMS && !this._shuttingDown) {
                    LogError(
                        `ArtifactCollaborationServer.disposeRoomIfIdle retaining dirty room '${room.ArtifactID}' in memory after ${room.CompactionRetryCount} failed flush/compaction attempts.`
                    );
                    this.scheduleIdleRoomDisposal(room, RETAINED_DIRTY_ROOM_TTL_MS);
                    return;
                }
                LogError(
                    `ArtifactCollaborationServer.disposeRoomIfIdle evicting dirty room '${room.ArtifactID}' after retention cap/TTL (${retainedDirtyCount} retained, ttlExpired=${ttlExpired}).`
                );
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
        room.LastCompactedStateVector = null;
        room.PendingHydrateConflict = null;
        const hwPrefix = `${room.RoomKey}::`;
        for (const hwKey of Array.from(this._agentClientClockHighWater.keys())) {
            if (hwKey.startsWith(hwPrefix)) {
                this._agentClientClockHighWater.delete(hwKey);
            }
        }
        if (room.IdleDisposeTimer) {
            clearTimeout(room.IdleDisposeTimer);
            room.IdleDisposeTimer = null;
        }
        if (room.WorkingStateTimer) {
            clearTimeout(room.WorkingStateTimer);
            room.WorkingStateTimer = null;
        }
        for (const timer of room.RelayedAgentPresenceTimers.values()) {
            clearTimeout(timer);
        }
        room.RelayedAgentPresenceTimers.clear();
        for (const entry of room.AgentPresenceEntries.values()) {
            this.clearAgentPresenceTimers(entry);
        }
        room.AgentPresenceEntries.clear();
        room.ProtectedAgentClientIDs.clear();
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
                void this.FlushWorkingState(room.ArtifactID, room.LastModifiedByUser, {
                    guardNewerPersistedVersion: true,
                    provider: room.Provider
                });
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

    private broadcastMergeConflictFrame(room: CollaborationRoom, frame: CollaborationControlFrame): void {
        const systemUserId = UserCache.Instance.GetSystemUser()?.ID;
        const normalizedActorId =
            frame.actorUserId && (!systemUserId || !UUIDsEqual(frame.actorUserId, systemUserId))
                ? frame.actorUserId
                : undefined;

        if (normalizedActorId) {
            const matchingConnections = Array.from(room.Connections).filter((conn) =>
                UUIDsEqual(conn.User.ID, normalizedActorId)
            );
            if (matchingConnections.length > 0) {
                const targetFrame = { ...frame, actorUserId: normalizedActorId };
                for (const conn of matchingConnections) {
                    this.sendControlFrame(conn.Socket, targetFrame);
                }
                return;
            }
        }

        const editorConnections = Array.from(room.Connections).filter((conn) => conn.CanEdit);
        const targetConnections = editorConnections.length > 0 ? editorConnections : Array.from(room.Connections);
        const targetFrame = { ...frame, actorUserId: undefined };
        for (const conn of targetConnections) {
            this.sendControlFrame(conn.Socket, targetFrame);
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
     * Performs a 3-way merge of concurrent `liveDocText` (human) and `incomingText`
     * (agent / out-of-band DB version) against `baseText`, returning `.MergedText` (`R6-4`, `R6-7`, `R7-5`).
     */
    public MergeConcurrentDocumentEdits(
        baseText: string,
        liveDocText: string,
        incomingText: string
    ): string {
        return this.MergeConcurrentDocumentEditsDetailed(baseText, liveDocText, incomingText).MergedText;
    }

    /**
     * Performs a 3-way merge of concurrent `liveDocText` (human) and `incomingText`
     * (agent / out-of-band DB version) against `baseText` with detailed conflict reporting (`R7-5`).
     *
     * Rules:
     * 1. **Structured JSON / Whiteboard payloads**: Never merged line-by-line. Plain JSON objects use
     *    a recursive 3-way key-level structural merge (live edit wins on conflicting scalar/array keys);
     *    top-level JSON arrays or object/array mismatches resolve to `liveDocText` (`HadConflict: true`),
     *    guaranteeing 100% valid JSON.
     * 2. **Text / Markdown payloads**:
     *    - Pure insertions (`oldStart === oldEnd`) are never conflicts (`HadConflict: false`); both
     *      sides' edits and inserted paragraphs are preserved in order.
     *    - Partial human edits inside a 1:1 line-preserving agent rewrite (`R2`) rebase positionally
     *      onto the agent's lines while recording any overwritten agent lines in `RejectedAgentHunks`.
     *    - All other overlapping conflict clusters (`A9`, `A11`, `A2`, `S2`, `A14`) follow a single
     *      consistent rule: **live edit wins** (`humanClusterTokens` emitted, zero duplicate lines) and
     *      the rejected `agentClusterTokens` slice is recorded in `RejectedAgentHunks` (`HadConflict: true`).
     */
    public MergeConcurrentDocumentEditsDetailed(
        baseText: string,
        liveDocText: string,
        incomingText: string
    ): ConcurrentDocumentMergeResult {
        if (liveDocText === baseText) {
            return { MergedText: incomingText, HadConflict: false, RejectedAgentHunks: [] };
        }
        if (incomingText === baseText) {
            return { MergedText: liveDocText, HadConflict: false, RejectedAgentHunks: [] };
        }
        if (liveDocText === incomingText) {
            return { MergedText: incomingText, HadConflict: false, RejectedAgentHunks: [] };
        }

        const structuredMerge = this.tryMergeStructuredJsonEdits(baseText, liveDocText, incomingText);
        if (structuredMerge !== null) {
            return structuredMerge;
        }

        const rejectedHunks: RejectedAgentMergeHunk[] = [];

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
                const humanOnlyPureInsertions = clusterH.every((hk) => hk.oldStart === hk.oldEnd);
                const agentOnlyPureInsertions = clusterA.every((ak) => ak.oldStart === ak.oldEnd);
                const isOneToOneAgentRewrite =
                    clusterA.length === 1 &&
                    clusterA[0].oldStart === clusterStart &&
                    clusterA[0].oldEnd === clusterEnd &&
                    agentClusterTokens.length === clusterSpan;

                if (humanJoined === agentJoined) {
                    for (const tok of humanClusterTokens) {
                        emitLine(tok.raw);
                    }
                } else if (humanOnlyPureInsertions) {
                    // Pure human insertions inside an agent-edited cluster (e.g. WD2/WD3): NOT a conflict!
                    if (isOneToOneAgentRewrite) {
                        const rebased = applyClusterHunks(clusterH, liveTokens, agentClusterTokens);
                        for (const tok of rebased) {
                            emitLine(tok.raw);
                        }
                    } else {
                        for (const hk of clusterH) {
                            if (hk.oldStart === clusterStart) {
                                for (let k = hk.newStart; k < hk.newEnd; k++) {
                                    emitLine(liveTokens[k].raw);
                                }
                            }
                        }
                        for (const tok of agentClusterTokens) {
                            emitLine(tok.raw);
                        }
                        for (const hk of clusterH) {
                            if (hk.oldStart > clusterStart) {
                                for (let k = hk.newStart; k < hk.newEnd; k++) {
                                    emitLine(liveTokens[k].raw);
                                }
                            }
                        }
                    }
                } else if (agentOnlyPureInsertions) {
                    // Pure agent insertions inside a human-edited cluster: NOT a conflict!
                    const isOneToOneHumanRewrite =
                        clusterH.length === 1 &&
                        clusterH[0].oldStart === clusterStart &&
                        clusterH[0].oldEnd === clusterEnd &&
                        humanClusterTokens.length === clusterSpan;
                    if (isOneToOneHumanRewrite) {
                        const rebased = applyClusterHunks(clusterA, incomingTokens, humanClusterTokens);
                        for (const tok of rebased) {
                            emitLine(tok.raw);
                        }
                    } else {
                        for (const ak of clusterA) {
                            if (ak.oldStart === clusterStart) {
                                for (let k = ak.newStart; k < ak.newEnd; k++) {
                                    emitLine(incomingTokens[k].raw);
                                }
                            }
                        }
                        for (const tok of humanClusterTokens) {
                            emitLine(tok.raw);
                        }
                        for (const ak of clusterA) {
                            if (ak.oldStart > clusterStart) {
                                for (let k = ak.newStart; k < ak.newEnd; k++) {
                                    emitLine(incomingTokens[k].raw);
                                }
                            }
                        }
                    }
                } else {
                    // Fine-grained base-line sub-splitting (`R8-2a`):
                    // 1. Align `base` -> `incoming` into minimal line/paragraph segments across `[clusterStart, clusterEnd)`.
                    // 2. Group segments spanned by multi-line human hunks so human replacements stay indivisible.
                    // 3. Apply `incoming` on human-untouched sub-spans; keep `live` (live-edit-wins) ONLY on
                    //    minimal sub-spans modified by `live`, coalescing adjacent conflicted sub-spans (`A9`)
                    //    and reporting ONLY minimal rejected sub-hunks in `RejectedAgentHunks`.
                    interface BaseAgentSegment {
                        bStart: number;
                        bEnd: number;
                        aStart: number;
                        aEnd: number;
                    }

                    const extractLineWordSet = (lineBody: string): Set<string> => {
                        const words = lineBody.toLowerCase().match(/[a-z0-9]+/g);
                        const set = new Set<string>();
                        if (words) {
                            for (const w of words) {
                                if (w.length >= 2 || /^\d+$/.test(w)) {
                                    set.add(w);
                                }
                            }
                        }
                        return set;
                    };

                    const headingLevel = (lineBody: string): number => {
                        const m = lineBody.match(/^\s*(#{1,6})\s+\S/);
                        return m ? m[1].length : 0;
                    };

                    const computeLineAnchorScore = (baseBody: string, incBody: string): number => {
                        const bTrim = baseBody.trim();
                        const aTrim = incBody.trim();
                        if (bTrim === '' && aTrim === '') {
                            return 1.0;
                        }
                        if (bTrim === '' || aTrim === '') {
                            return 0;
                        }
                        const bHead = headingLevel(bTrim);
                        const aHead = headingLevel(aTrim);
                        const bWords = extractLineWordSet(bTrim);
                        const aWords = extractLineWordSet(aTrim);
                        let shared = 0;
                        for (const w of bWords) {
                            if (aWords.has(w)) {
                                shared++;
                            }
                        }
                        const dice =
                            bWords.size > 0 && aWords.size > 0
                                ? (2 * shared) / (bWords.size + aWords.size)
                                : 0;
                        if (bHead > 0 && bHead === aHead && (shared >= 1 || dice >= 0.35)) {
                            return Math.max(0.85, dice);
                        }
                        if (dice >= 0.5) {
                            return dice;
                        }
                        return 0;
                    };

                    const emitGapSegments = (
                        outSegs: BaseAgentSegment[],
                        b0: number,
                        b1: number,
                        a0: number,
                        a1: number
                    ): void => {
                        const bLen = b1 - b0;
                        const aLen = a1 - a0;
                        if (bLen === 0 && aLen === 0) {
                            return;
                        }
                        if (bLen === 0) {
                            outSegs.push({ bStart: b0, bEnd: b0, aStart: a0, aEnd: a1 });
                            return;
                        }
                        if (aLen === 0) {
                            for (let i = 0; i < bLen; i++) {
                                outSegs.push({ bStart: b0 + i, bEnd: b0 + i + 1, aStart: a0, aEnd: a0 });
                            }
                            return;
                        }
                        if (bLen === aLen) {
                            for (let i = 0; i < bLen; i++) {
                                outSegs.push({
                                    bStart: b0 + i,
                                    bEnd: b0 + i + 1,
                                    aStart: a0 + i,
                                    aEnd: a0 + i + 1
                                });
                            }
                            return;
                        }
                        outSegs.push({ bStart: b0, bEnd: b1, aStart: a0, aEnd: a1 });
                    };

                    const splitAgentReplacementHunk = (
                        outSegs: BaseAgentSegment[],
                        b0: number,
                        b1: number,
                        a0: number,
                        a1: number
                    ): void => {
                        const bLen = b1 - b0;
                        const aLen = a1 - a0;
                        if (bLen <= 1 || aLen <= 1 || bLen === aLen || bLen * aLen > 40_000) {
                            emitGapSegments(outSegs, b0, b1, a0, a1);
                            return;
                        }

                        // Weighted monotonic DP over blank-line, heading, and word-overlap anchors
                        const cols = aLen + 1;
                        const dp = new Float64Array((bLen + 1) * cols);
                        const choice = new Uint8Array((bLen + 1) * cols); // 1: skip b, 2: skip a, 3: match
                        for (let bi = bLen - 1; bi >= 0; bi--) {
                            for (let aj = aLen - 1; aj >= 0; aj--) {
                                const idx = bi * cols + aj;
                                const skipB = dp[(bi + 1) * cols + aj];
                                const skipA = dp[bi * cols + (aj + 1)];
                                let best = skipB >= skipA ? skipB : skipA;
                                let bestChoice = skipB >= skipA ? 1 : 2;
                                const score = computeLineAnchorScore(
                                    baseTokens[b0 + bi].body,
                                    incomingTokens[a0 + aj].body
                                );
                                if (score > 0) {
                                    const candidate = score + dp[(bi + 1) * cols + (aj + 1)];
                                    if (candidate > best + 1e-9) {
                                        best = candidate;
                                        bestChoice = 3;
                                    }
                                }
                                dp[idx] = best;
                                choice[idx] = bestChoice;
                            }
                        }

                        const anchors: Array<{ bi: number; aj: number }> = [];
                        let cBi = 0;
                        let cAj = 0;
                        while (cBi < bLen && cAj < aLen) {
                            const ch = choice[cBi * cols + cAj];
                            if (ch === 3) {
                                anchors.push({ bi: cBi, aj: cAj });
                                cBi++;
                                cAj++;
                            } else if (ch === 1) {
                                cBi++;
                            } else {
                                cAj++;
                            }
                        }

                        if (anchors.length === 0) {
                            outSegs.push({ bStart: b0, bEnd: b1, aStart: a0, aEnd: a1 });
                            return;
                        }

                        let prevB = b0;
                        let prevA = a0;
                        for (const anc of anchors) {
                            const targetB = b0 + anc.bi;
                            const targetA = a0 + anc.aj;
                            emitGapSegments(outSegs, prevB, targetB, prevA, targetA);
                            outSegs.push({
                                bStart: targetB,
                                bEnd: targetB + 1,
                                aStart: targetA,
                                aEnd: targetA + 1
                            });
                            prevB = targetB + 1;
                            prevA = targetA + 1;
                        }
                        emitGapSegments(outSegs, prevB, b1, prevA, a1);
                    };

                    const rawSegs: BaseAgentSegment[] = [];
                    let walkB = clusterStart;
                    let walkA = clusterStart + agentDelta;
                    let walkAIdx = 0;
                    while (walkB < clusterEnd || walkAIdx < clusterA.length) {
                        const ak = walkAIdx < clusterA.length ? clusterA[walkAIdx] : undefined;
                        if (ak && ak.oldStart === walkB) {
                            splitAgentReplacementHunk(rawSegs, ak.oldStart, ak.oldEnd, ak.newStart, ak.newEnd);
                            walkB = ak.oldEnd;
                            walkA = ak.newEnd;
                            walkAIdx++;
                        } else if (walkB < clusterEnd) {
                            rawSegs.push({
                                bStart: walkB,
                                bEnd: walkB + 1,
                                aStart: walkA,
                                aEnd: walkA + 1
                            });
                            walkB++;
                            walkA++;
                        } else {
                            break;
                        }
                    }

                    // Merge adjacent segments whenever a multi-line human modification hunk crosses their boundary
                    const crossesHumanHunk = (boundary: number): boolean =>
                        clusterH.some(
                            (hk) => hk.oldEnd > hk.oldStart && hk.oldStart < boundary && boundary < hk.oldEnd
                        );

                    const groupedSegs: BaseAgentSegment[] = [];
                    for (const seg of rawSegs) {
                        if (groupedSegs.length === 0) {
                            groupedSegs.push({ ...seg });
                            continue;
                        }
                        const prev = groupedSegs[groupedSegs.length - 1];
                        const zeroLenInsideHumanHunk =
                            seg.bStart === seg.bEnd && crossesHumanHunk(seg.bStart);
                        const prevZeroLenInsideHumanHunk =
                            prev.bStart === prev.bEnd && crossesHumanHunk(prev.bEnd);
                        if (
                            crossesHumanHunk(prev.bEnd) ||
                            zeroLenInsideHumanHunk ||
                            prevZeroLenInsideHumanHunk
                        ) {
                            prev.bEnd = seg.bEnd;
                            prev.aEnd = seg.aEnd;
                        } else {
                            groupedSegs.push({ ...seg });
                        }
                    }

                    const pureHumanByBoundary: Array<Array<{ raw: string; body: string; eol: string }>> =
                        Array.from({ length: clusterSpan + 1 }, () => []);
                    for (const hk of clusterH) {
                        if (hk.oldStart === hk.oldEnd) {
                            const slot = hk.oldStart - clusterStart;
                            if (slot >= 0 && slot <= clusterSpan) {
                                for (let k = hk.newStart; k < hk.newEnd; k++) {
                                    pureHumanByBoundary[slot].push(liveTokens[k]);
                                }
                            }
                        }
                    }

                    const liveIndexForUnchangedBase = (bIdx: number): number => {
                        let shift = liveDelta;
                        for (const hk of clusterH) {
                            if (hk.oldEnd <= bIdx) {
                                shift += hk.newEnd - hk.newStart - (hk.oldEnd - hk.oldStart);
                            }
                        }
                        return bIdx + shift;
                    };

                    const extractLiveSliceForBaseSpan = (
                        bSpanStart: number,
                        bSpanEnd: number
                    ): Array<{ raw: string; body: string; eol: string }> => {
                        const out: Array<{ raw: string; body: string; eol: string }> = [];
                        let p = bSpanStart;
                        while (p < bSpanEnd) {
                            if (p > bSpanStart) {
                                const internalPure = pureHumanByBoundary[p - clusterStart];
                                for (const tok of internalPure) {
                                    out.push(tok);
                                }
                            }
                            const modHk = clusterH.find(
                                (hk) => hk.oldEnd > hk.oldStart && hk.oldStart === p
                            );
                            if (modHk) {
                                for (let k = modHk.newStart; k < modHk.newEnd; k++) {
                                    out.push(liveTokens[k]);
                                }
                                p = modHk.oldEnd;
                            } else {
                                const aligned = liveTokens[liveIndexForUnchangedBase(p)];
                                if (aligned) {
                                    out.push(aligned);
                                } else {
                                    out.push(baseTokens[p]);
                                }
                                p++;
                            }
                        }
                        return out;
                    };

                    interface EvaluatedGroup {
                        bStart: number;
                        bEnd: number;
                        aStart: number;
                        aEnd: number;
                        humanModified: boolean;
                        isConflicted: boolean;
                    }

                    const evalGroups: EvaluatedGroup[] = groupedSegs.map((g) => {
                        const humanModified = clusterH.some(
                            (hk) =>
                                hk.oldEnd > hk.oldStart &&
                                hk.oldStart < g.bEnd &&
                                hk.oldEnd > g.bStart
                        );
                        if (!humanModified) {
                            return { ...g, humanModified: false, isConflicted: false };
                        }
                        const baseSlice = baseTokens.slice(g.bStart, g.bEnd);
                        const agentSlice = incomingTokens.slice(g.aStart, g.aEnd);
                        const liveSlice = extractLiveSliceForBaseSpan(g.bStart, g.bEnd);
                        const agentUnchanged =
                            agentSlice.length === baseSlice.length &&
                            agentSlice.every((t, i) => t.body === baseSlice[i].body);
                        const sameAsLive =
                            agentSlice.length === liveSlice.length &&
                            agentSlice.every((t, i) => t.body === liveSlice[i].body);
                        return {
                            ...g,
                            humanModified: true,
                            isConflicted: !agentUnchanged && !sameAsLive
                        };
                    });

                    // Coalesce adjacent conflicted groups (`A9`)
                    const coalescedGroups: EvaluatedGroup[] = [];
                    for (const eg of evalGroups) {
                        const prev = coalescedGroups[coalescedGroups.length - 1];
                        if (prev && prev.isConflicted && eg.isConflicted && prev.bEnd === eg.bStart) {
                            prev.bEnd = eg.bEnd;
                            prev.aEnd = eg.aEnd;
                        } else {
                            coalescedGroups.push({ ...eg });
                        }
                    }

                    // Emit pure human insertions at clusterStart boundary before first group
                    for (const tok of pureHumanByBoundary[0]) {
                        emitLine(tok.raw);
                    }

                    for (let gi = 0; gi < coalescedGroups.length; gi++) {
                        const grp = coalescedGroups[gi];
                        if (!grp.humanModified) {
                            for (let k = grp.aStart; k < grp.aEnd; k++) {
                                emitLine(incomingTokens[k].raw);
                            }
                            // Emit any pure human insertions strictly inside an unconflicted multi-line group
                            for (let b = grp.bStart + 1; b < grp.bEnd; b++) {
                                for (const tok of pureHumanByBoundary[b - clusterStart]) {
                                    emitLine(tok.raw);
                                }
                            }
                        } else {
                            const liveSlice = extractLiveSliceForBaseSpan(grp.bStart, grp.bEnd);
                            for (const tok of liveSlice) {
                                emitLine(tok.raw);
                            }
                            if (grp.isConflicted) {
                                const baseSlice = baseTokens.slice(grp.bStart, grp.bEnd);
                                const agentSlice = incomingTokens.slice(grp.aStart, grp.aEnd);
                                rejectedHunks.push({
                                    BaseText: baseSlice.map((t) => t.raw).join(''),
                                    LiveText: liveSlice.map((t) => t.raw).join(''),
                                    RejectedIncomingText: agentSlice.map((t) => t.raw).join('')
                                });
                            }
                        }

                        // Emit pure human insertions at grp.bEnd boundary unless next group shares the same bStart === bEnd
                        const nextGrp = coalescedGroups[gi + 1];
                        if (!nextGrp || grp.bEnd > grp.bStart || nextGrp.bStart > grp.bEnd) {
                            const boundaryIdx = grp.bEnd - clusterStart;
                            if (
                                boundaryIdx > 0 &&
                                boundaryIdx <= clusterSpan &&
                                (!nextGrp || nextGrp.bStart === grp.bEnd)
                            ) {
                                // Only emit once per distinct boundary index
                                const alreadyEmittedZeroSpan =
                                    grp.bStart === grp.bEnd && gi > 0 && coalescedGroups[gi - 1].bEnd === grp.bEnd;
                                if (!alreadyEmittedZeroSpan) {
                                    for (const tok of pureHumanByBoundary[boundaryIdx]) {
                                        emitLine(tok.raw);
                                    }
                                }
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

        return {
            MergedText: emitted.join(''),
            HadConflict: rejectedHunks.length > 0,
            RejectedAgentHunks: rejectedHunks
        };
    }

    private tryMergeStructuredJsonEdits(
        baseText: string,
        liveDocText: string,
        incomingText: string
    ): ConcurrentDocumentMergeResult | null {
        if (liveDocText === baseText) {
            return { MergedText: incomingText, HadConflict: false, RejectedAgentHunks: [] };
        }
        if (incomingText === baseText) {
            return { MergedText: liveDocText, HadConflict: false, RejectedAgentHunks: [] };
        }
        if (liveDocText === incomingText) {
            return { MergedText: liveDocText, HadConflict: false, RejectedAgentHunks: [] };
        }

        const liveTrim = liveDocText.trim();
        const incomingTrim = incomingText.trim();
        const baseTrim = baseText.trim();

        const looksLikeStructuredJson = (trimmed: string): boolean =>
            trimmed.startsWith('{') || trimmed.startsWith('[');

        if (
            !looksLikeStructuredJson(liveTrim) ||
            !looksLikeStructuredJson(incomingTrim) ||
            (baseTrim.length > 0 && !looksLikeStructuredJson(baseTrim))
        ) {
            return null;
        }

        interface JsonAstEntry {
            key: string;
            rawKey: string;
            value: JsonAstNode;
        }

        type JsonAstNode =
            | {
                  kind: 'object';
                  raw: string;
                  entries: JsonAstEntry[];
                  byKey: Map<string, JsonAstEntry>;
              }
            | {
                  kind: 'array';
                  raw: string;
                  items: JsonAstNode[];
              }
            | {
                  kind: 'primitive';
                  raw: string;
                  primitiveType: 'string' | 'number' | 'boolean' | 'null';
                  stringValue?: string;
              };

        const parseLosslessJsonAst = (source: string): JsonAstNode | null => {
            let pos = 0;
            const len = source.length;

            const isWs = (ch: number): boolean =>
                ch === 0x20 || ch === 0x09 || ch === 0x0a || ch === 0x0d;

            const skipWs = (): void => {
                while (pos < len && isWs(source.charCodeAt(pos))) {
                    pos++;
                }
            };

            const parseStringToken = (): { raw: string; decoded: string } | null => {
                if (pos >= len || source.charCodeAt(pos) !== 0x22) {
                    return null;
                }
                const start = pos;
                pos++; // '"'
                let decoded = '';
                while (pos < len) {
                    const ch = source.charCodeAt(pos);
                    if (ch === 0x22) {
                        pos++;
                        return { raw: source.slice(start, pos), decoded };
                    }
                    if (ch < 0x20) {
                        return null;
                    }
                    if (ch === 0x5c) {
                        pos++;
                        if (pos >= len) {
                            return null;
                        }
                        const esc = source.charCodeAt(pos);
                        pos++;
                        switch (esc) {
                            case 0x22:
                                decoded += '"';
                                break;
                            case 0x5c:
                                decoded += '\\';
                                break;
                            case 0x2f:
                                decoded += '/';
                                break;
                            case 0x62:
                                decoded += '\b';
                                break;
                            case 0x66:
                                decoded += '\f';
                                break;
                            case 0x6e:
                                decoded += '\n';
                                break;
                            case 0x72:
                                decoded += '\r';
                                break;
                            case 0x74:
                                decoded += '\t';
                                break;
                            case 0x75: {
                                if (pos + 4 > len) {
                                    return null;
                                }
                                const hex = source.slice(pos, pos + 4);
                                if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
                                    return null;
                                }
                                decoded += String.fromCharCode(parseInt(hex, 16));
                                pos += 4;
                                break;
                            }
                            default:
                                return null;
                        }
                    } else {
                        decoded += source[pos];
                        pos++;
                    }
                }
                return null;
            };

            const parseNumberToken = (): JsonAstNode | null => {
                const start = pos;
                if (pos < len && source.charCodeAt(pos) === 0x2d) {
                    pos++;
                }
                if (pos >= len) {
                    return null;
                }
                const firstDigit = source.charCodeAt(pos);
                if (firstDigit === 0x30) {
                    pos++;
                } else if (firstDigit >= 0x31 && firstDigit <= 0x39) {
                    pos++;
                    while (pos < len && source.charCodeAt(pos) >= 0x30 && source.charCodeAt(pos) <= 0x39) {
                        pos++;
                    }
                } else {
                    return null;
                }
                if (pos < len && source.charCodeAt(pos) === 0x2e) {
                    pos++;
                    const fracStart = pos;
                    while (pos < len && source.charCodeAt(pos) >= 0x30 && source.charCodeAt(pos) <= 0x39) {
                        pos++;
                    }
                    if (pos === fracStart) {
                        return null;
                    }
                }
                if (pos < len && (source.charCodeAt(pos) === 0x65 || source.charCodeAt(pos) === 0x45)) {
                    pos++;
                    if (
                        pos < len &&
                        (source.charCodeAt(pos) === 0x2b || source.charCodeAt(pos) === 0x2d)
                    ) {
                        pos++;
                    }
                    const expStart = pos;
                    while (pos < len && source.charCodeAt(pos) >= 0x30 && source.charCodeAt(pos) <= 0x39) {
                        pos++;
                    }
                    if (pos === expStart) {
                        return null;
                    }
                }
                return {
                    kind: 'primitive',
                    raw: source.slice(start, pos),
                    primitiveType: 'number'
                };
            };

            const parseValue = (): JsonAstNode | null => {
                skipWs();
                if (pos >= len) {
                    return null;
                }
                const ch = source.charCodeAt(pos);
                if (ch === 0x7b) {
                    // '{'
                    const start = pos;
                    pos++;
                    skipWs();
                    const entries: JsonAstEntry[] = [];
                    const byKey = new Map<string, JsonAstEntry>();
                    if (pos < len && source.charCodeAt(pos) === 0x7d) {
                        pos++;
                        return { kind: 'object', raw: source.slice(start, pos), entries, byKey };
                    }
                    while (pos < len) {
                        skipWs();
                        const keyTok = parseStringToken();
                        if (!keyTok) {
                            return null;
                        }
                        skipWs();
                        if (pos >= len || source.charCodeAt(pos) !== 0x3a) {
                            return null;
                        }
                        pos++; // ':'
                        const valNode = parseValue();
                        if (!valNode) {
                            return null;
                        }
                        const entry: JsonAstEntry = {
                            key: keyTok.decoded,
                            rawKey: keyTok.raw,
                            value: valNode
                        };
                        if (byKey.has(entry.key)) {
                            const existingIdx = entries.findIndex((e) => e.key === entry.key);
                            if (existingIdx >= 0) {
                                entries[existingIdx] = entry;
                            }
                        } else {
                            entries.push(entry);
                        }
                        byKey.set(entry.key, entry);
                        skipWs();
                        if (pos >= len) {
                            return null;
                        }
                        const sep = source.charCodeAt(pos);
                        if (sep === 0x2c) {
                            pos++;
                            continue;
                        }
                        if (sep === 0x7d) {
                            pos++;
                            return { kind: 'object', raw: source.slice(start, pos), entries, byKey };
                        }
                        return null;
                    }
                    return null;
                }
                if (ch === 0x5b) {
                    // '['
                    const start = pos;
                    pos++;
                    skipWs();
                    const items: JsonAstNode[] = [];
                    if (pos < len && source.charCodeAt(pos) === 0x5d) {
                        pos++;
                        return { kind: 'array', raw: source.slice(start, pos), items };
                    }
                    while (pos < len) {
                        const item = parseValue();
                        if (!item) {
                            return null;
                        }
                        items.push(item);
                        skipWs();
                        if (pos >= len) {
                            return null;
                        }
                        const sep = source.charCodeAt(pos);
                        if (sep === 0x2c) {
                            pos++;
                            continue;
                        }
                        if (sep === 0x5d) {
                            pos++;
                            return { kind: 'array', raw: source.slice(start, pos), items };
                        }
                        return null;
                    }
                    return null;
                }
                if (ch === 0x22) {
                    const strTok = parseStringToken();
                    if (!strTok) {
                        return null;
                    }
                    return {
                        kind: 'primitive',
                        raw: strTok.raw,
                        primitiveType: 'string',
                        stringValue: strTok.decoded
                    };
                }
                if (ch === 0x2d || (ch >= 0x30 && ch <= 0x39)) {
                    return parseNumberToken();
                }
                if (source.startsWith('true', pos)) {
                    pos += 4;
                    return { kind: 'primitive', raw: 'true', primitiveType: 'boolean' };
                }
                if (source.startsWith('false', pos)) {
                    pos += 5;
                    return { kind: 'primitive', raw: 'false', primitiveType: 'boolean' };
                }
                if (source.startsWith('null', pos)) {
                    pos += 4;
                    return { kind: 'primitive', raw: 'null', primitiveType: 'null' };
                }
                return null;
            };

            const root = parseValue();
            if (!root) {
                return null;
            }
            skipWs();
            return pos === len ? root : null;
        };

        const liveAst = parseLosslessJsonAst(liveTrim);
        const incAst = parseLosslessJsonAst(incomingTrim);
        const baseAst =
            baseTrim.length === 0
                ? ({
                      kind: 'object',
                      raw: '{}',
                      entries: [],
                      byKey: new Map<string, JsonAstEntry>()
                  } as JsonAstNode)
                : parseLosslessJsonAst(baseTrim);

        if (!liveAst || !incAst || !baseAst) {
            return null;
        }
        if (
            liveAst.kind === 'primitive' ||
            incAst.kind === 'primitive' ||
            baseAst.kind === 'primitive'
        ) {
            return null;
        }
        if (liveAst.kind !== 'object' || incAst.kind !== 'object' || baseAst.kind !== 'object') {
            // Top-level JSON array or object/array mismatch: live edit wins cleanly to preserve valid JSON!
            return {
                MergedText: liveDocText,
                HadConflict: true,
                RejectedAgentHunks: [
                    {
                        BaseText: baseText,
                        LiveText: liveDocText,
                        RejectedIncomingText: incomingText
                    }
                ]
            };
        }

        const numbersSemanticallyEqual = (rawA: string, rawB: string): boolean => {
            if (rawA === rawB) {
                return true;
            }
            const intRe = /^-?\d+$/;
            if (intRe.test(rawA) && intRe.test(rawB)) {
                try {
                    return BigInt(rawA) === BigInt(rawB);
                } catch {
                    return false;
                }
            }
            if (rawA.replace(/^-/, '').length > 15 || rawB.replace(/^-/, '').length > 15) {
                return false;
            }
            const numA = Number(rawA);
            const numB = Number(rawB);
            return Number.isFinite(numA) && Number.isFinite(numB) && numA === numB;
        };

        const nodesEqual = (a: JsonAstNode | undefined, b: JsonAstNode | undefined): boolean => {
            if (!a && !b) {
                return true;
            }
            if (!a || !b || a.kind !== b.kind) {
                return false;
            }
            if (a.raw === b.raw) {
                return true;
            }
            if (a.kind === 'primitive' && b.kind === 'primitive') {
                if (a.primitiveType !== b.primitiveType) {
                    return false;
                }
                if (a.primitiveType === 'string') {
                    return a.stringValue === b.stringValue;
                }
                if (a.primitiveType === 'number') {
                    return numbersSemanticallyEqual(a.raw, b.raw);
                }
                return a.raw === b.raw;
            }
            if (a.kind === 'array' && b.kind === 'array') {
                if (a.items.length !== b.items.length) {
                    return false;
                }
                for (let i = 0; i < a.items.length; i++) {
                    if (!nodesEqual(a.items[i], b.items[i])) {
                        return false;
                    }
                }
                return true;
            }
            if (a.kind === 'object' && b.kind === 'object') {
                if (a.byKey.size !== b.byKey.size) {
                    return false;
                }
                for (const [k, entryA] of a.byKey.entries()) {
                    const entryB = b.byKey.get(k);
                    if (!entryB || !nodesEqual(entryA.value, entryB.value)) {
                        return false;
                    }
                }
                return true;
            }
            return false;
        };

        // Detect indentation unit and newline conventions from `liveDocText` (fallback `baseText`)
        const styleRef = liveTrim.includes('\n')
            ? liveDocText
            : baseTrim.includes('\n')
              ? baseText
              : liveDocText;
        const prettyFormatted = liveTrim.includes('\n');
        const lineSep = styleRef.includes('\r\n') ? '\r\n' : '\n';
        let indentUnit = '  ';
        if (prettyFormatted) {
            const indentMatches = Array.from(styleRef.matchAll(/\r?\n([ \t]+)\S/g));
            let minIndent: string | null = null;
            for (const m of indentMatches) {
                const candidate = m[1];
                if (candidate && (minIndent === null || candidate.length < minIndent.length)) {
                    minIndent = candidate;
                }
            }
            if (minIndent) {
                indentUnit = minIndent;
            }
        }
        const compactColon = !prettyFormatted && /"\s*:\s+/.test(liveTrim) ? ': ' : ':';
        const compactComma = !prettyFormatted && /,\s+"/.test(liveTrim) ? ', ' : ',';
        const trailingNewline = liveDocText.endsWith('\r\n')
            ? '\r\n'
            : liveDocText.endsWith('\n')
              ? '\n'
              : '';

        const serializeAstNode = (node: JsonAstNode, depth: number): string => {
            if (node.kind === 'primitive') {
                return node.raw;
            }
            if (node.kind === 'array') {
                if (node.items.length === 0) {
                    return '[]';
                }
                if (!prettyFormatted) {
                    return `[${node.items.map((it) => serializeAstNode(it, depth + 1)).join(compactComma)}]`;
                }
                const childPad = indentUnit.repeat(depth + 1);
                const closePad = indentUnit.repeat(depth);
                const rendered = node.items.map(
                    (it) => `${childPad}${serializeAstNode(it, depth + 1)}`
                );
                return `[${lineSep}${rendered.join(`,${lineSep}`)}${lineSep}${closePad}]`;
            }
            if (node.entries.length === 0) {
                return '{}';
            }
            if (!prettyFormatted) {
                return `{${node.entries
                    .map((e) => `${e.rawKey}${compactColon}${serializeAstNode(e.value, depth + 1)}`)
                    .join(compactComma)}}`;
            }
            const childPad = indentUnit.repeat(depth + 1);
            const closePad = indentUnit.repeat(depth);
            const rendered = node.entries.map(
                (e) => `${childPad}${e.rawKey}: ${serializeAstNode(e.value, depth + 1)}`
            );
            return `{${lineSep}${rendered.join(`,${lineSep}`)}${lineSep}${closePad}}`;
        };

        const emptyObjectNode: Extract<JsonAstNode, { kind: 'object' }> = {
            kind: 'object',
            raw: '{}',
            entries: [],
            byKey: new Map<string, JsonAstEntry>()
        };

        const extractArrayItemId = (
            node: JsonAstNode
        ): { idKey: string; obj: Extract<JsonAstNode, { kind: 'object' }> } | null => {
            if (node.kind !== 'object') {
                return null;
            }
            const idEntry = node.byKey.get('id') ?? node.byKey.get('ID');
            if (!idEntry || idEntry.value.kind !== 'primitive') {
                return null;
            }
            if (idEntry.value.primitiveType === 'string' && idEntry.value.stringValue) {
                return { idKey: `s:${idEntry.value.stringValue}`, obj: node };
            }
            if (idEntry.value.primitiveType === 'number') {
                return { idKey: `n:${idEntry.value.raw}`, obj: node };
            }
            return null;
        };

        const indexArrayById = (
            items: JsonAstNode[]
        ): Map<string, Extract<JsonAstNode, { kind: 'object' }>> | null => {
            const map = new Map<string, Extract<JsonAstNode, { kind: 'object' }>>();
            for (const item of items) {
                const extracted = extractArrayItemId(item);
                if (!extracted || map.has(extracted.idKey)) {
                    return null;
                }
                map.set(extracted.idKey, extracted.obj);
            }
            return map;
        };

        const rejectedHunks: RejectedAgentMergeHunk[] = [];

        const hasPagesArray =
            baseAst.byKey.get('pages')?.value.kind === 'array' ||
            liveAst.byKey.get('pages')?.value.kind === 'array' ||
            incAst.byKey.get('pages')?.value.kind === 'array';
        const hasElementsArray =
            baseAst.byKey.get('elements')?.value.kind === 'array' ||
            liveAst.byKey.get('elements')?.value.kind === 'array' ||
            incAst.byKey.get('elements')?.value.kind === 'array';
        const isWhiteboardRoot =
            (hasPagesArray || hasElementsArray) &&
            (baseAst.byKey.has('idCounter') ||
                liveAst.byKey.has('idCounter') ||
                incAst.byKey.has('idCounter') ||
                baseAst.byKey.has('zCounter') ||
                liveAst.byKey.has('zCounter') ||
                incAst.byKey.has('zCounter'));

        const mergeIdKeyedArrays = (
            baseItems: JsonAstNode[],
            liveItems: JsonAstNode[],
            incItems: JsonAstNode[],
            depth: number = 0
        ): Extract<JsonAstNode, { kind: 'array' }> | null => {
            if (baseItems.length === 0 && liveItems.length === 0 && incItems.length === 0) {
                return { kind: 'array', raw: '[]', items: [] };
            }
            const baseMap = indexArrayById(baseItems);
            const liveMap = indexArrayById(liveItems);
            const incMap = indexArrayById(incItems);
            if (!baseMap || !liveMap || !incMap) {
                return null;
            }

            const baseSurvivingInLive = Array.from(baseMap.keys()).filter((id) => liveMap.has(id));
            const liveFromBase = Array.from(liveMap.keys()).filter((id) => baseMap.has(id));
            const baseSurvivingInInc = Array.from(baseMap.keys()).filter((id) => incMap.has(id));
            const incFromBase = Array.from(incMap.keys()).filter((id) => baseMap.has(id));

            const liveKeptBaseOrder =
                baseSurvivingInLive.length === liveFromBase.length &&
                baseSurvivingInLive.every((id, i) => id === liveFromBase[i]);
            const incKeptBaseOrder =
                baseSurvivingInInc.length === incFromBase.length &&
                baseSurvivingInInc.every((id, i) => id === incFromBase[i]);

            const orderedIds: string[] = [];
            const seenIds = new Set<string>();

            if (liveKeptBaseOrder && !incKeptBaseOrder) {
                for (const id of incMap.keys()) {
                    seenIds.add(id);
                    orderedIds.push(id);
                }
                for (const id of liveMap.keys()) {
                    if (!seenIds.has(id)) {
                        seenIds.add(id);
                        orderedIds.push(id);
                    }
                }
            } else {
                for (const id of liveMap.keys()) {
                    seenIds.add(id);
                    orderedIds.push(id);
                }
                for (const id of incMap.keys()) {
                    if (!seenIds.has(id)) {
                        seenIds.add(id);
                        orderedIds.push(id);
                    }
                }
            }

            const mergedItems: JsonAstNode[] = [];
            for (const id of orderedIds) {
                const baseObj = baseMap.get(id);
                const liveObj = liveMap.get(id);
                const incObj = incMap.get(id);

                if (liveObj && incObj) {
                    if (!baseObj) {
                        if (nodesEqual(liveObj, incObj)) {
                            mergedItems.push(liveObj);
                        } else {
                            mergedItems.push(mergeObjectNodes(emptyObjectNode, liveObj, incObj, depth + 1));
                        }
                    } else if (nodesEqual(liveObj, baseObj)) {
                        mergedItems.push(incObj);
                    } else if (nodesEqual(incObj, baseObj)) {
                        mergedItems.push(liveObj);
                    } else if (nodesEqual(liveObj, incObj)) {
                        mergedItems.push(liveObj);
                    } else {
                        mergedItems.push(mergeObjectNodes(baseObj, liveObj, incObj, depth + 1));
                    }
                } else if (liveObj && !incObj) {
                    if (!baseObj) {
                        // Added concurrently in live
                        mergedItems.push(liveObj);
                    } else if (nodesEqual(liveObj, baseObj)) {
                        // Deleted in incoming while untouched in live -> honor deletion
                    } else {
                        // Modified in live while deleted in incoming -> live edit wins
                        mergedItems.push(liveObj);
                        rejectedHunks.push({
                            BaseText: baseObj.raw,
                            LiveText: liveObj.raw,
                            RejectedIncomingText: ''
                        });
                    }
                } else if (!liveObj && incObj) {
                    if (!baseObj) {
                        // Added concurrently in incoming
                        mergedItems.push(incObj);
                    } else if (nodesEqual(incObj, baseObj)) {
                        // Deleted in live while untouched in incoming -> honor deletion
                    } else {
                        // Deleted in live while modified in incoming -> live deletion wins
                        rejectedHunks.push({
                            BaseText: baseObj.raw,
                            LiveText: '',
                            RejectedIncomingText: incObj.raw
                        });
                    }
                }
            }

            return {
                kind: 'array',
                raw: '',
                items: mergedItems
            };
        };

        const WHITEBOARD_ROOT_COUNTER_KEYS = new Set(['idCounter', 'zCounter']);

        const mergeObjectNodes = (
            baseObj: Extract<JsonAstNode, { kind: 'object' }>,
            liveObj: Extract<JsonAstNode, { kind: 'object' }>,
            incObj: Extract<JsonAstNode, { kind: 'object' }>,
            depth: number = 0
        ): Extract<JsonAstNode, { kind: 'object' }> => {
            const orderedKeys: string[] = [];
            const seen = new Set<string>();
            for (const e of liveObj.entries) {
                if (!seen.has(e.key)) {
                    seen.add(e.key);
                    orderedKeys.push(e.key);
                }
            }
            for (const e of incObj.entries) {
                if (!seen.has(e.key)) {
                    seen.add(e.key);
                    orderedKeys.push(e.key);
                }
            }
            for (const e of baseObj.entries) {
                if (!seen.has(e.key)) {
                    seen.add(e.key);
                    orderedKeys.push(e.key);
                }
            }

            const entries: JsonAstEntry[] = [];
            const byKey = new Map<string, JsonAstEntry>();

            for (const k of orderedKeys) {
                const baseEntry = baseObj.byKey.get(k);
                const liveEntry = liveObj.byKey.get(k);
                const incEntry = incObj.byKey.get(k);

                const liveUnchanged = nodesEqual(liveEntry?.value, baseEntry?.value);
                const incUnchanged = nodesEqual(incEntry?.value, baseEntry?.value);

                const shouldClampWhiteboardCounter =
                    isWhiteboardRoot &&
                    depth === 0 &&
                    WHITEBOARD_ROOT_COUNTER_KEYS.has(k) &&
                    !liveUnchanged &&
                    !incUnchanged;

                if (
                    shouldClampWhiteboardCounter &&
                    liveEntry?.value.kind === 'primitive' &&
                    liveEntry.value.primitiveType === 'number' &&
                    incEntry?.value.kind === 'primitive' &&
                    incEntry.value.primitiveType === 'number'
                ) {
                    const liveNum = Number(liveEntry.value.raw);
                    const incNum = Number(incEntry.value.raw);
                    const maxVal = Math.max(
                        Number.isFinite(liveNum) ? Math.floor(liveNum) : 0,
                        Number.isFinite(incNum) ? Math.floor(incNum) : 0
                    );
                    const chosenEntry: JsonAstEntry = {
                        key: k,
                        rawKey: liveEntry.rawKey,
                        value: {
                            kind: 'primitive',
                            raw: String(maxVal),
                            primitiveType: 'number'
                        }
                    };
                    entries.push(chosenEntry);
                    byKey.set(k, chosenEntry);
                } else if (liveUnchanged && incUnchanged) {
                    if (liveEntry) {
                        entries.push(liveEntry);
                        byKey.set(k, liveEntry);
                    }
                } else if (liveUnchanged) {
                    if (incEntry) {
                        const chosenEntry: JsonAstEntry = {
                            key: k,
                            rawKey: liveEntry?.rawKey ?? incEntry.rawKey,
                            value: incEntry.value
                        };
                        entries.push(chosenEntry);
                        byKey.set(k, chosenEntry);
                    }
                } else if (incUnchanged) {
                    if (liveEntry) {
                        entries.push(liveEntry);
                        byKey.set(k, liveEntry);
                    }
                } else if (nodesEqual(liveEntry?.value, incEntry?.value)) {
                    if (liveEntry) {
                        entries.push(liveEntry);
                        byKey.set(k, liveEntry);
                    }
                } else if (
                    liveEntry?.value.kind === 'object' &&
                    incEntry?.value.kind === 'object'
                ) {
                    const nestedBase =
                        baseEntry?.value.kind === 'object' ? baseEntry.value : emptyObjectNode;
                    const mergedChild = mergeObjectNodes(
                        nestedBase,
                        liveEntry.value,
                        incEntry.value,
                        depth + 1
                    );
                    const mergedEntry: JsonAstEntry = {
                        key: k,
                        rawKey: liveEntry.rawKey,
                        value: mergedChild
                    };
                    entries.push(mergedEntry);
                    byKey.set(k, mergedEntry);
                } else if (
                    liveEntry?.value.kind === 'array' &&
                    incEntry?.value.kind === 'array'
                ) {
                    const baseItems =
                        baseEntry?.value.kind === 'array' ? baseEntry.value.items : [];
                    const idMerged = mergeIdKeyedArrays(
                        baseItems,
                        liveEntry.value.items,
                        incEntry.value.items,
                        depth + 1
                    );
                    if (idMerged) {
                        const mergedEntry: JsonAstEntry = {
                            key: k,
                            rawKey: liveEntry.rawKey,
                            value: idMerged
                        };
                        entries.push(mergedEntry);
                        byKey.set(k, mergedEntry);
                    } else {
                        entries.push(liveEntry);
                        byKey.set(k, liveEntry);
                        rejectedHunks.push({
                            BaseText: baseEntry ? `{${baseEntry.rawKey}:${baseEntry.value.raw}}` : '',
                            LiveText: `{${liveEntry.rawKey}:${liveEntry.value.raw}}`,
                            RejectedIncomingText: `{${incEntry.rawKey}:${incEntry.value.raw}}`
                        });
                    }
                } else {
                    if (liveEntry) {
                        entries.push(liveEntry);
                        byKey.set(k, liveEntry);
                    }
                    rejectedHunks.push({
                        BaseText: baseEntry ? `{${baseEntry.rawKey}:${baseEntry.value.raw}}` : '',
                        LiveText: liveEntry ? `{${liveEntry.rawKey}:${liveEntry.value.raw}}` : '',
                        RejectedIncomingText: incEntry
                            ? `{${incEntry.rawKey}:${incEntry.value.raw}}`
                            : ''
                    });
                }
            }

            return {
                kind: 'object',
                raw: '',
                entries,
                byKey
            };
        };

        const mergedRoot = mergeObjectNodes(baseAst, liveAst, incAst, 0);

        // If this is a Whiteboard document and pages or elements changed, scan element IDs
        // matching whiteboard prefixes and ensure 'idCounter' is at least maxSuffix!
        const pagesChanged =
            !nodesEqual(liveAst.byKey.get('pages')?.value, baseAst.byKey.get('pages')?.value) ||
            !nodesEqual(incAst.byKey.get('pages')?.value, baseAst.byKey.get('pages')?.value);
        const elementsChanged =
            !nodesEqual(liveAst.byKey.get('elements')?.value, baseAst.byKey.get('elements')?.value) ||
            !nodesEqual(incAst.byKey.get('elements')?.value, baseAst.byKey.get('elements')?.value);

        const idCounterEntry = mergedRoot.byKey.get('idCounter');
        if (
            isWhiteboardRoot &&
            (pagesChanged || elementsChanged) &&
            idCounterEntry &&
            idCounterEntry.value.kind === 'primitive' &&
            idCounterEntry.value.primitiveType === 'number'
        ) {
            let maxSuffix = Number(idCounterEntry.value.raw);
            if (!Number.isFinite(maxSuffix)) {
                maxSuffix = 0;
            }

            const WHITEBOARD_ELEMENT_ID_RE =
                /^(?:shape|sticky|text|connector|frame|image|freehand|group|elem|el|item)-(\d+)$/;

            const scanNodeForIdSuffixes = (node: JsonAstNode | undefined): void => {
                if (!node) {
                    return;
                }
                if (node.kind === 'array') {
                    for (const item of node.items) {
                        scanNodeForIdSuffixes(item);
                    }
                } else if (node.kind === 'object') {
                    const idEntry = node.byKey.get('id') ?? node.byKey.get('ID');
                    if (
                        idEntry &&
                        idEntry.value.kind === 'primitive' &&
                        idEntry.value.primitiveType === 'string' &&
                        idEntry.value.stringValue
                    ) {
                        const match = idEntry.value.stringValue.match(WHITEBOARD_ELEMENT_ID_RE);
                        if (match && match[1]) {
                            const suffixNum = parseInt(match[1], 10);
                            if (Number.isFinite(suffixNum) && suffixNum > maxSuffix) {
                                maxSuffix = suffixNum;
                            }
                        }
                    }
                    for (const childEntry of node.entries) {
                        if (
                            childEntry.key === 'items' ||
                            childEntry.key === 'elements' ||
                            childEntry.key === 'pages'
                        ) {
                            scanNodeForIdSuffixes(childEntry.value);
                        }
                    }
                }
            };

            const pagesNode = mergedRoot.byKey.get('pages')?.value;
            scanNodeForIdSuffixes(pagesNode);
            const elementsNode = mergedRoot.byKey.get('elements')?.value;
            scanNodeForIdSuffixes(elementsNode);

            if (maxSuffix > Number(idCounterEntry.value.raw)) {
                idCounterEntry.value = {
                    kind: 'primitive',
                    raw: String(maxSuffix),
                    primitiveType: 'number'
                };
            }
        }

        const serialized = serializeAstNode(mergedRoot, 0) + trailingNewline;

        return {
            MergedText: serialized,
            HadConflict: rejectedHunks.length > 0,
            RejectedAgentHunks: rejectedHunks
        };
    }

    /**
     * Transitions `yText` from `currentText` (`yText.toString()`) to `targetText` (or the 3-way merged
     * result when `baselineText` is provided) using minimal prefix/suffix/hunk Yjs CRDT operations so
     * untouched paragraphs retain their Yjs item IDs (`clientID, clock`) (`Blocker 1`, `Blocker 2`, `R6-4`, `R7-5`).
     */
    private applyMinimalTextDiff(
        yText: Y.Text,
        currentText: string,
        targetText: string,
        baselineText?: string
    ): ConcurrentDocumentMergeResult | null {
        const mergeResult =
            typeof baselineText === 'string'
                ? this.MergeConcurrentDocumentEditsDetailed(baselineText, currentText, targetText)
                : null;
        const resolvedTarget = mergeResult ? mergeResult.MergedText : targetText;
        if (currentText === resolvedTarget) {
            return mergeResult;
        }

        const oldLines = this.splitTextIntoLineTokens(currentText);
        const newLines = this.splitTextIntoLineTokens(resolvedTarget);
        const hunks = this.computeLineReplacementHunks(oldLines, newLines);
        if (hunks.length === 0) {
            return mergeResult;
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
        return mergeResult;
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
            // On a merge, a value the incoming version left as it was in the baseline is not written,
            // so a concurrent live edit to that slide or field survives the reconcile.
            const baselineEntries = options?.preserveConcurrentAdditions && options.baselineContent
                ? this.parseDeckStructureEntries(options.baselineContent)
                : null;
            const setDeckMeta = (key: string, value: string): void => {
                if (deckMeta.get(key) !== value && !this.isUnchangedByIncoming(baselineEntries?.Meta, key, value)) {
                    deckMeta.set(key, value);
                }
            };
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

            setDeckMeta('DeckID', nextDeckId);
            setDeckMeta('Title', nextTitle);
            setDeckMeta('Subtitle', nextSubtitle);
            setDeckMeta('AspectRatio', nextAspectRatio);
            setDeckMeta('Theme', nextThemeJson);
            setDeckMeta('Master', nextMasterJson);

            const nextIds = new Set<string>();
            for (const slide of deck.Slides) {
                nextIds.add(slide.SlideID);
                const slideJson = JSON.stringify(slide);
                if (
                    slidesById.get(slide.SlideID) !== slideJson &&
                    !(slidesById.has(slide.SlideID) && this.isUnchangedByIncoming(baselineEntries?.Items, slide.SlideID, slideJson))
                ) {
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
            const targetOrder = this.dedupeStringArray(
                this.resolveMergedOrder(
                    currentOrder,
                    deck.Slides.map((s) => s.SlideID),
                    baselineEntries?.Order,
                    (id) => slidesById.has(id)
                )
            );
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
        options?: { preserveConcurrentAdditions?: boolean; baselineContent?: string; preparsedWorkbook?: WorkbookSpec }
    ): void {
        const trimmedContent = (rawContent ?? '').trim();
        const trimmedConfig = (rawConfiguration ?? '').trim();
        if (!trimmedContent && !trimmedConfig && !options?.preparsedWorkbook) return;
        const looksLikeJsonWorkbook =
            (trimmedContent.startsWith('{') && trimmedContent.includes('"Worksheets"')) ||
            (trimmedConfig.startsWith('{') && trimmedConfig.includes('"Worksheets"'));
        const looksLikeXlsx =
            trimmedContent.startsWith('data:') ||
            trimmedContent.startsWith('UEsDB') ||
            trimmedConfig.startsWith('data:') ||
            trimmedConfig.startsWith('UEsDB');
        if (!options?.preparsedWorkbook && !looksLikeJsonWorkbook && !looksLikeXlsx) {
            return;
        }
        try {
            const wb =
                options?.preparsedWorkbook ??
                SpreadsheetEngine.Instance.ParseWorkbook(rawContent, rawConfiguration, { SkipEvaluate: true });
            if (!wb || !Array.isArray(wb.Worksheets) || wb.Worksheets.length === 0) {
                return;
            }
            const workbookMeta = doc.getMap<string>('workbookMeta');
            const sheetOrder = doc.getArray<string>('sheetOrder');
            // On a merge, a value the incoming version left as it was in the baseline is not written,
            // so a concurrent live edit to that cell, sheet or field survives the reconcile.
            const baselineEntries = options?.preserveConcurrentAdditions && options.baselineContent
                ? this.parseWorkbookStructureEntries(options.baselineContent)
                : null;
            const setWorkbookMeta = (key: string, value: string): void => {
                if (workbookMeta.get(key) !== value && !this.isUnchangedByIncoming(baselineEntries?.Meta, key, value)) {
                    workbookMeta.set(key, value);
                }
            };
            const worksheetsById = doc.getMap<string>('worksheetsById');
            const sheetCellsByCoord = doc.getMap<string>('sheetCellsByCoord');

            let baselineSheetIds: Set<string> | null = null;
            let baselineCoordKeys: Set<string> | null = null;
            const baselineRowIdsBySheet = new Map<string, Set<string>>();
            const baselineColIdsBySheet = new Map<string, Set<string>>();
            if (options?.baselineContent && options.baselineContent.trim().length > 0) {
                try {
                    const baseWb = SpreadsheetEngine.Instance.ParseWorkbook(options.baselineContent, undefined, {
                        SkipEvaluate: true
                    });
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

            const createdAtIso =
                typeof wb.CreatedAt === 'string' && wb.CreatedAt.trim().length > 0
                    ? wb.CreatedAt.trim()
                    : '1970-01-01T00:00:00.000Z';
            const updatedAtIso =
                typeof wb.UpdatedAt === 'string' && wb.UpdatedAt.trim().length > 0
                    ? wb.UpdatedAt.trim()
                    : createdAtIso;

            setWorkbookMeta('WorkbookID', wb.WorkbookID);
            setWorkbookMeta('Title', wb.Title);
            setWorkbookMeta('ActiveSheetID', wb.ActiveSheetID);
            setWorkbookMeta('NamedRanges', JSON.stringify(wb.NamedRanges ?? []));
            setWorkbookMeta('CreatedAt', createdAtIso);
            setWorkbookMeta('UpdatedAt', updatedAtIso);
            if (typeof wb.PreferredObjectsPaneHeightPx === 'number' && Number.isFinite(wb.PreferredObjectsPaneHeightPx)) {
                setWorkbookMeta('PreferredObjectsPaneHeightPx', String(Math.round(wb.PreferredObjectsPaneHeightPx)));
            } else if (
                workbookMeta.has('PreferredObjectsPaneHeightPx') &&
                (!baselineEntries?.Meta || baselineEntries.Meta.has('PreferredObjectsPaneHeightPx'))
            ) {
                workbookMeta.delete('PreferredObjectsPaneHeightPx');
            }

            const validSheetIds = new Set<string>();
            const validCellCoordKeys = new Set<string>();

            for (const ws of wb.Worksheets) {
                validSheetIds.add(ws.SheetID);
                const incomingSheetJson = JSON.stringify({ ...ws, Rows: ws.Rows, Columns: ws.Columns, Cells: {} });
                const keepLiveSheet =
                    worksheetsById.has(ws.SheetID) &&
                    this.isUnchangedByIncoming(baselineEntries?.Items, ws.SheetID, incomingSheetJson);
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
                if (!keepLiveSheet && worksheetsById.get(ws.SheetID) !== sheetStructJson) {
                    worksheetsById.set(ws.SheetID, sheetStructJson);
                }

                for (const cell of Object.values(ws.Cells)) {
                    const coordKey = `${ws.SheetID}::${cell.RowID}::${cell.ColumnID}`;
                    validCellCoordKeys.add(coordKey);
                    const cellJson = JSON.stringify(cell);
                    if (
                        sheetCellsByCoord.get(coordKey) !== cellJson &&
                        !(sheetCellsByCoord.has(coordKey) && this.isUnchangedByIncoming(baselineEntries?.Cells, coordKey, cellJson))
                    ) {
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
            const targetOrder = this.dedupeStringArray(
                this.resolveMergedOrder(
                    currentOrder,
                    wb.Worksheets.map((w) => w.SheetID),
                    baselineEntries?.Order,
                    (id) => worksheetsById.has(id)
                )
            );
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
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            if (msg.startsWith('Spreadsheet ')) {
                throw err;
            }
            // Non-Spreadsheet content
        }
    }

    /**
     * Undoes one agent mutation in `doc` while keeping every edit other users made, before or after
     * the agent's change (`R15-1`, `R15-3`). Call inside a transaction.
     *
     * - Plain text: a 3-way merge with the agent's result as the base, the live text as "ours" and
     *   `revertToContent` (the room just before the agent call) as "theirs". Lines nobody else touched go
     *   back; lines someone edited since keep their edit.
     * - Slide decks and workbooks: per slide / sheet / cell / metadata key, a value is put back only when
     *   the agent changed it AND the live value is still the agent's. `Y.Text('content')` is then
     *   re-derived from the structures so the two never disagree.
     *
     * @param agentResultContent - the room's content right after the agent's change landed
     * @param agentCandidateContents - every serialization the agent's values may have been written from
     *   (the applied result, the dry-run preview, the raw tool output); a live value equal to any of them
     *   counts as "still the agent's"
     * @param revertToContent - the room's content right before the agent call
     */
    private revertAgentMutationInDoc(
        doc: Y.Doc,
        agentResultContent: string,
        agentCandidateContents: string[],
        revertToContent: string
    ): void {
        const yText = doc.getText('content');
        const isStructured = doc.getMap('slidesById').size > 0 || doc.getMap('worksheetsById').size > 0;
        if (!isStructured) {
            this.applyMinimalTextDiff(yText, yText.toString(), revertToContent, agentResultContent);
            return;
        }
        const candidates = agentCandidateContents.filter((c) => typeof c === 'string' && c.length > 0);
        this.revertAgentSlideDeckChanges(doc, candidates, revertToContent);
        this.revertAgentSpreadsheetChanges(doc, candidates, revertToContent);
        this.applyMinimalTextDiff(yText, yText.toString(), this.extractRoomSerializedContent(doc));
    }

    /** Per-key revert of an agent's slide-deck change; see {@link revertAgentMutationInDoc}. */
    private revertAgentSlideDeckChanges(doc: Y.Doc, agentContents: string[], revertToContent: string): void {
        const revertDeck = this.parseDeckStructureEntries(revertToContent);
        const agentDecks = agentContents
            .map((c) => this.parseDeckStructureEntries(c))
            .filter((d): d is StructureEntries => d !== null);
        if (!revertDeck || agentDecks.length === 0) {
            return;
        }
        const slidesById = doc.getMap<string>('slidesById');
        this.revertKeyedMapAgentChanges(slidesById, agentDecks.map((d) => d.Items), revertDeck.Items);
        this.revertKeyedMapAgentChanges(doc.getMap<string>('deckMeta'), agentDecks.map((d) => d.Meta), revertDeck.Meta);
        this.revertOrderAgentChange(doc.getArray<string>('slideOrder'), slidesById, agentDecks.map((d) => d.Order), revertDeck.Order);
    }

    /** Per-key revert of an agent's workbook change; see {@link revertAgentMutationInDoc}. */
    private revertAgentSpreadsheetChanges(doc: Y.Doc, agentContents: string[], revertToContent: string): void {
        const revertBook = this.parseWorkbookStructureEntries(revertToContent);
        const agentBooks = agentContents
            .map((c) => this.parseWorkbookStructureEntries(c))
            .filter((b): b is WorkbookStructureEntries => b !== null);
        if (!revertBook || agentBooks.length === 0) {
            return;
        }
        const worksheetsById = doc.getMap<string>('worksheetsById');
        this.revertKeyedMapAgentChanges(worksheetsById, agentBooks.map((b) => b.Items), revertBook.Items);
        this.revertKeyedMapAgentChanges(
            doc.getMap<string>('sheetCellsByCoord'),
            agentBooks.map((b) => b.Cells),
            revertBook.Cells
        );
        this.revertKeyedMapAgentChanges(doc.getMap<string>('workbookMeta'), agentBooks.map((b) => b.Meta), revertBook.Meta);
        this.revertOrderAgentChange(doc.getArray<string>('sheetOrder'), worksheetsById, agentBooks.map((b) => b.Order), revertBook.Order);
    }

    /**
     * Puts each key of `map` back to its `revertEntries` value when the agent changed it and nobody has
     * changed it since. A key whose live value is not one of the agent's values was edited by someone
     * else after the agent and is left alone; that edit wins.
     */
    private revertKeyedMapAgentChanges(
        map: Y.Map<string>,
        agentEntryMaps: Map<string, string>[],
        revertEntries: Map<string, string>
    ): void {
        const keys = new Set<string>(revertEntries.keys());
        for (const agentEntries of agentEntryMaps) {
            for (const key of agentEntries.keys()) {
                keys.add(key);
            }
        }
        for (const key of keys) {
            const revertValue = revertEntries.get(key);
            const liveValue = map.get(key);
            if (liveValue === revertValue) {
                continue;
            }
            const liveIsStillAgentValue = agentEntryMaps.some((entries) => entries.get(key) === liveValue);
            if (!liveIsStillAgentValue) {
                continue;
            }
            if (revertValue === undefined) {
                map.delete(key);
            } else {
                map.set(key, revertValue);
            }
        }
    }

    /**
     * Restores the pre-agent order of an order array when the live order is still the agent's. Ids that
     * survived the revert but are not in the old order (someone edited an item the agent added) stay,
     * appended in their live order; ids no longer in `itemsMap` are dropped.
     */
    private revertOrderAgentChange(
        orderArray: Y.Array<string>,
        itemsMap: Y.Map<string>,
        agentOrders: string[][],
        revertOrder: string[]
    ): void {
        const liveOrder = orderArray.toArray();
        const sameOrder = (a: string[], b: string[]): boolean =>
            a.length === b.length && a.every((id, idx) => id === b[idx]);
        if (!agentOrders.some((order) => sameOrder(order, liveOrder))) {
            return;
        }
        const target = revertOrder.filter((id) => itemsMap.has(id));
        for (const id of liveOrder) {
            if (itemsMap.has(id) && !target.includes(id)) {
                target.push(id);
            }
        }
        if (sameOrder(target, liveOrder)) {
            return;
        }
        if (orderArray.length > 0) {
            orderArray.delete(0, orderArray.length);
        }
        orderArray.insert(0, target);
    }

    /**
     * True when the incoming version left `key` exactly as it was in the merge baseline, so the live
     * room's value (possibly a concurrent edit) should be kept rather than overwritten.
     */
    private isUnchangedByIncoming(baseline: Map<string, string> | undefined, key: string, incomingValue: string): boolean {
        return baseline !== undefined && baseline.get(key) === incomingValue;
    }

    private dedupeStringArray(values: string[]): string[] {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const v of values) {
            if (typeof v === 'string' && v.length > 0 && !seen.has(v)) {
                seen.add(v);
                out.push(v);
            }
        }
        return out;
    }

    /**
     * Deduplicates `slideOrder` and `sheetOrder` Y.Arrays in place after concurrent CRDT array insertions
     * from multiple replicas during restore/sync (`NW-5`).
     */
    private dedupeOrderArraysAfterRelay(doc: Y.Doc): void {
        const dedupeArr = (arr: Y.Array<string>, itemsMap: Y.Map<string>): void => {
            const current = arr.toArray();
            if (current.length === 0) {
                return;
            }
            const next = this.dedupeStringArray(current).filter((id) => itemsMap.size === 0 || itemsMap.has(id));
            if (next.length !== current.length || next.some((id, idx) => id !== current[idx])) {
                arr.delete(0, arr.length);
                if (next.length > 0) {
                    arr.insert(0, next);
                }
            }
        };
        const slideOrder = doc.getArray<string>('slideOrder');
        const sheetOrder = doc.getArray<string>('sheetOrder');
        const slidesById = doc.getMap<string>('slidesById');
        const worksheetsById = doc.getMap<string>('worksheetsById');
        const hasDupSlide = new Set(slideOrder.toArray()).size !== slideOrder.length;
        const hasDupSheet = new Set(sheetOrder.toArray()).size !== sheetOrder.length;
        if (hasDupSlide || hasDupSheet) {
            doc.transact(() => {
                if (hasDupSlide) dedupeArr(slideOrder, slidesById);
                if (hasDupSheet) dedupeArr(sheetOrder, worksheetsById);
            }, 'collab-relay');
        }
    }

    /**
     * The order to write during a merge. When the incoming version kept the baseline order, a concurrent
     * live reorder wins: the live order is kept (minus removed items) and items the incoming version added
     * are appended. Otherwise the incoming order wins, as before.
     */
    private resolveMergedOrder(
        liveOrder: string[],
        incomingOrder: string[],
        baselineOrder: string[] | undefined,
        exists: (id: string) => boolean
    ): string[] {
        const incomingKeptBaselineOrder =
            baselineOrder !== undefined &&
            baselineOrder.length === incomingOrder.length &&
            baselineOrder.every((id, idx) => id === incomingOrder[idx]);
        if (!incomingKeptBaselineOrder) {
            return this.dedupeStringArray(incomingOrder);
        }
        const merged = this.dedupeStringArray(liveOrder).filter((id) => exists(id));
        for (const id of incomingOrder) {
            if (!merged.includes(id)) {
                merged.push(id);
            }
        }
        return merged;
    }

    /**
     * The values {@link syncSlideDeckStructuresIfPresent} writes for `content`, keyed the same way, or
     * `null` when `content` is not a slide deck.
     */
    private parseDeckStructureEntries(content: string): StructureEntries | null {
        const trimmed = (content ?? '').trim();
        if (!trimmed.startsWith('{')) {
            return null;
        }
        try {
            const raw = JSON.parse(trimmed) as Partial<SlideDeckSpec>;
            if (!raw || !Array.isArray(raw.Slides) || raw.Slides.length === 0 || !raw.Theme) {
                return null;
            }
            const deck = SlideDeckEngine.Instance.ParseDeckSpec(trimmed);
            const meta = new Map<string, string>([
                ['DeckID', deck.DeckID || 'deck-1'],
                ['Title', deck.Title || 'Presentation'],
                ['Subtitle', deck.Subtitle || ''],
                ['AspectRatio', deck.AspectRatio === '4:3' ? '4:3' : '16:9'],
                ['Theme', JSON.stringify(deck.Theme)],
                ['Master', JSON.stringify(deck.Master)]
            ]);
            const items = new Map<string, string>(deck.Slides.map((s) => [s.SlideID, JSON.stringify(s)]));
            return { Meta: meta, Items: items, Order: deck.Slides.map((s) => s.SlideID) };
        } catch (err) {
            LogError(`ArtifactCollaborationServer: could not parse slide deck structures: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    /**
     * The values {@link syncSpreadsheetStructuresIfPresent} writes for `content`, keyed the same way, or
     * `null` when `content` is not a workbook.
     */
    private parseWorkbookStructureEntries(content: string): WorkbookStructureEntries | null {
        const trimmed = (content ?? '').trim();
        const looksLikeWorkbook =
            (trimmed.startsWith('{') && trimmed.includes('"Worksheets"')) ||
            trimmed.startsWith('data:') ||
            trimmed.startsWith('UEsDB');
        if (!looksLikeWorkbook) {
            return null;
        }
        try {
            const wb = SpreadsheetEngine.Instance.ParseWorkbook(content, undefined, { SkipEvaluate: true });
            if (!wb || !Array.isArray(wb.Worksheets) || wb.Worksheets.length === 0) {
                return null;
            }
            const createdAtIso =
                typeof wb.CreatedAt === 'string' && wb.CreatedAt.trim().length > 0
                    ? wb.CreatedAt.trim()
                    : '1970-01-01T00:00:00.000Z';
            const updatedAtIso =
                typeof wb.UpdatedAt === 'string' && wb.UpdatedAt.trim().length > 0
                    ? wb.UpdatedAt.trim()
                    : createdAtIso;
            const meta = new Map<string, string>([
                ['WorkbookID', wb.WorkbookID],
                ['Title', wb.Title],
                ['ActiveSheetID', wb.ActiveSheetID],
                ['NamedRanges', JSON.stringify(wb.NamedRanges ?? [])],
                ['CreatedAt', createdAtIso],
                ['UpdatedAt', updatedAtIso]
            ]);
            if (typeof wb.PreferredObjectsPaneHeightPx === 'number' && Number.isFinite(wb.PreferredObjectsPaneHeightPx)) {
                meta.set('PreferredObjectsPaneHeightPx', String(Math.round(wb.PreferredObjectsPaneHeightPx)));
            }
            const items = new Map<string, string>();
            const cells = new Map<string, string>();
            for (const ws of wb.Worksheets) {
                const sheetStruct: WorksheetSpec = { ...ws, Rows: ws.Rows, Columns: ws.Columns, Cells: {} };
                items.set(ws.SheetID, JSON.stringify(sheetStruct));
                for (const cell of Object.values(ws.Cells)) {
                    cells.set(`${ws.SheetID}::${cell.RowID}::${cell.ColumnID}`, JSON.stringify(cell));
                }
            }
            return { Meta: meta, Items: items, Cells: cells, Order: wb.Worksheets.map((w) => w.SheetID) };
        } catch (err) {
            LogError(`ArtifactCollaborationServer: could not parse workbook structures: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    }

    private buildRoomWorkbookFromDoc(doc: Y.Doc): WorkbookSpec | null {
        const worksheetsById = doc.getMap<string>('worksheetsById');
        if (worksheetsById.size === 0) {
            return null;
        }
        if (worksheetsById.size > MAX_IMPORT_SHEETS) {
            throw new Error(
                `Spreadsheet rejected: workbook exceeds maximum sheet limit (${MAX_IMPORT_SHEETS}).`
            );
        }
        const sheetOrder = doc.getArray<string>('sheetOrder');
        const workbookMeta = doc.getMap<string>('workbookMeta');
        const sheetCellsByCoord = doc.getMap<string>('sheetCellsByCoord');
        if (sheetCellsByCoord.size > MAX_IMPORT_WORKBOOK_CELLS) {
            throw new Error(
                `Spreadsheet rejected: workbook exceeds maximum cell limit (${MAX_IMPORT_WORKBOOK_CELLS}).`
            );
        }

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

        if (worksheets.length === 0) {
            throw new Error('Corrupt collaboration state: worksheetsById has entries but zero valid worksheets.');
        }

        let namedRanges: SpreadsheetNamedRangeSpec[] = [];
        const nrRaw = workbookMeta.get('NamedRanges');
        if (nrRaw) {
            try {
                namedRanges = JSON.parse(nrRaw) as SpreadsheetNamedRangeSpec[];
            } catch {
                namedRanges = [];
            }
        }
        const createdAt = workbookMeta.get('CreatedAt') || '1970-01-01T00:00:00.000Z';
        const updatedAt = workbookMeta.get('UpdatedAt') || createdAt;
        const activeId = workbookMeta.get('ActiveSheetID') || worksheets[0].SheetID;
        const prefPaneRaw = workbookMeta.get('PreferredObjectsPaneHeightPx');
        const prefPaneHeight = prefPaneRaw ? Number(prefPaneRaw) : NaN;
        return SpreadsheetEngine.Instance.NormalizeWorkbook({
            WorkbookID: workbookMeta.get('WorkbookID') || 'wb-1',
            Title: workbookMeta.get('Title') || 'Workbook',
            ActiveSheetID: activeId,
            Worksheets: worksheets,
            NamedRanges: namedRanges,
            ...(Number.isFinite(prefPaneHeight) && prefPaneHeight > 0
                ? { PreferredObjectsPaneHeightPx: Math.round(prefPaneHeight) }
                : {}),
            CreatedAt: createdAt,
            UpdatedAt: updatedAt
        });
    }

    /**
     * Async worker-isolated room content extraction used by compaction (`R6-1`).
     */
    private async extractRoomSerializedContentIsolated(doc: Y.Doc): Promise<string> {
        const worksheetsById = doc.getMap<string>('worksheetsById');
        if (worksheetsById.size > 0) {
            try {
                const wb = this.buildRoomWorkbookFromDoc(doc)!;
                await SpreadsheetEngine.Instance.EvaluateWorkbookIsolated(wb);
                return SpreadsheetEngine.Instance.SerializeWorkbook(wb, { preserveTimestamps: true });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`Failed to extract collaborative workbook content (fail-closed): ${msg}`);
            }
        }
        return this.extractRoomSerializedContent(doc);
    }

    /**
     * Reconstructs the canonical string content of a Yjs room.
     * - If the room contains per-worksheet/per-cell CRDT maps (`worksheetsById` + `sheetCellsByCoord`),
     *   reconstructs the merged {@link WorkbookSpec}, resolves all stable-ID formulas (`FormulaStable`),
     *   and recalculates the workbook (`§ 6.2`, `Accept #1`) unless `skipEvaluate` is true (`S6-2`).
     * - If the room contains per-slide CRDT maps (`slidesById` + `slideOrder`), reconstructs
     *   the merged {@link SlideDeckSpec} JSON (`§ 5.1`).
     */
    private extractRoomSerializedContent(doc: Y.Doc, options?: { skipEvaluate?: boolean }): string {
        const worksheetsById = doc.getMap<string>('worksheetsById');

        if (worksheetsById.size > 0) {
            try {
                const wb = this.buildRoomWorkbookFromDoc(doc)!;
                if (options?.skipEvaluate === false) {
                    SpreadsheetEngine.Instance.EvaluateWorkbook(wb);
                }
                return SpreadsheetEngine.Instance.SerializeWorkbook(wb, { preserveTimestamps: true });
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`Failed to extract collaborative workbook content (fail-closed): ${msg}`);
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
                    theme = JSON.parse(rawTheme) as SlideDeckSpec['Theme'];
                }

                let master = baseDeck.Master;
                const rawMaster = deckMeta.get('Master');
                if (rawMaster) {
                    master = JSON.parse(rawMaster) as SlideDeckSpec['Master'];
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
                throw new Error('Corrupt collaboration state: slidesById has entries but zero valid slides.');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(`Failed to extract collaborative slide deck content (fail-closed): ${msg}`);
            }
        }

        return doc.getText('content').toString();
    }

    /**
     * Decodes a persisted `MJ: Artifact Working States.YjsState` binary blob (raw `Uint8Array` or
     * base64 string) into serialized document/deck/workbook text (`R5-1`).
     */
    public DeserializeWorkingStateBytesToContent(raw: unknown): string {
        const bytes = DecodeWorkingStateBytes(raw);
        if (bytes.byteLength === 0) {
            return '';
        }
        const tempDoc = new Y.Doc();
        try {
            Y.applyUpdate(tempDoc, bytes);
            return this.extractRoomSerializedContent(tempDoc, { skipEvaluate: true });
        } finally {
            tempDoc.destroy();
        }
    }
}

// Register immediately at module load so MJArtifactVersionEntityServer can decode working-state
// binary blobs even before ArtifactCollaborationServer.Instance is accessed (`R5-1`).
RegisterWorkingStateContentDeserializer((raw) =>
    ArtifactCollaborationServer.Instance.DeserializeWorkingStateBytesToContent(raw)
);
