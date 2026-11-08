import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket as WsClient, WebSocketServer, type RawData } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {
    Base64ToBytes,
    BaseSingleton,
    BytesToBase64,
    EscapeSQLString,
    UUIDsEqual,
    type IShutdownable
} from '@memberjunction/global';
import { IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    MJArtifactVersionEntity,
    MJArtifactWorkingStateEntity,
    SlideDeckEngine,
    type SlideDeckSpec,
    type SlideSpec
} from '@memberjunction/core-entities';
import { getUserPayload } from '../context.js';
import { InMemoryYjsRoomRelay, type IYjsRoomRelay, type YjsRelayMessage } from './YjsRoomRelay.js';

/** Canonical WebSocket upgrade path for Yjs artifact collaboration rooms. */
export const ARTIFACT_COLLABORATION_WS_PATH = '/collaboration/yjs';

/** Top-level `y-protocols` wire frame discriminators. */
export const YJS_MESSAGE_SYNC = 0;
export const YJS_MESSAGE_AWARENESS = 1;
export const YJS_MESSAGE_CONTROL = 2;
export const YJS_MESSAGE_PERMISSION_STATUS = 3;

/** Close codes used by `ArtifactCollaborationServer` for deterministic client handling. */
export const WS_CLOSE_UNAUTHORIZED = 4401;
export const WS_CLOSE_FORBIDDEN = 4403;
export const WS_CLOSE_BAD_REQUEST = 4400;

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
    /** Set of Yjs awareness client IDs owned by this socket (cleaned up on disconnect). */
    ControlledClientIDs: Set<number>;
}

/**
 * Active in-memory Yjs room for a single `MJ: Artifacts` record.
 */
export interface CollaborationRoom {
    /** `MJ: Artifacts.ID` represented by this room. */
    ArtifactID: string;
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

const WORKING_STATE_FLUSH_DEBOUNCE_MS = 2500;
const MAX_COLLAB_FRAME_BYTES = 16 * 1024 * 1024; // 16 MB

/**
 * Real-time collaborative editing service for MJ Docs, Slides, Sheets, and inline OLE Artifacts.
 *
 * Implements the standard `y-protocols` binary sync (`0`) and awareness (`1`) wire protocol over
 * WebSockets (`/collaboration/yjs?artifactId=<uuid>`), augmented with:
 * - Viewer-scoped authentication (`getUserPayload`) and `ArtifactPermissionEngine` enforcement (`O4`),
 * - Strict read-only frame filtering (dropping `syncStep2` and `update` frames when `CanEdit === false`),
 * - Live mid-session permission revocation and edit-to-readonly downgrade,
 * - Periodic binary checkpointing to `MJ: Artifact Working States` (`O2`),
 * - Version compaction into `MJ: Artifact Versions` on explicit save, room close, and agent tool runs, and
 * - Pluggable cross-instance room relay (`InMemoryYjsRoomRelay` by default, `RedisYjsRoomRelay` when Redis is enabled, `O3`).
 */
export class ArtifactCollaborationServer extends BaseSingleton<ArtifactCollaborationServer> implements IShutdownable {
    public readonly ShutdownName = 'ArtifactCollaborationServer';

    private readonly _wss = new WebSocketServer({
        noServer: true,
        maxPayload: MAX_COLLAB_FRAME_BYTES
    });

    private readonly _rooms = new Map<string, CollaborationRoom>();
    private readonly _roomInitPromises = new Map<string, Promise<CollaborationRoom>>();
    private _relay: IYjsRoomRelay = new InMemoryYjsRoomRelay();
    private _providerOverride: IMetadataProvider | null = null;
    private _authOverride: ((req: IncomingMessage) => Promise<UserInfo | null>) | null = null;
    private _unsubscribePermissionEngine: (() => void) | null = null;
    private _shuttingDown = false;

    protected constructor() {
        super();
        this._unsubscribePermissionEngine = ArtifactPermissionEngine.Instance.OnPermissionsChanged(async (evt) => {
            await this.ReevaluateRoomPermissions(evt.ArtifactID, evt.TargetUserID, true);
        });
    }

    /** Returns the process-wide singleton instance of {@link ArtifactCollaborationServer}. */
    public static get Instance(): ArtifactCollaborationServer {
        return super.getInstance<ArtifactCollaborationServer>();
    }

    /**
     * Configures the cross-instance {@link IYjsRoomRelay} (e.g., swapping in {@link RedisYjsRoomRelay}
     * at server boot when Redis pub/sub is enabled).
     */
    public SetRoomRelay(relay: IYjsRoomRelay): void {
        this._relay = relay;
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
     * Inspects an incoming HTTP `upgrade` request and handles it if the pathname matches
     * {@link ARTIFACT_COLLABORATION_WS_PATH} (`/collaboration/yjs`).
     *
     * @returns `true` if the path matched and upgrade handling was claimed; `false` otherwise.
     */
    public TryHandleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
        const parsedUrl = this.parseRequestUrl(req);
        if (!parsedUrl) {
            return false;
        }
        const pathname = parsedUrl.pathname.replace(/\/+$/, '');
        if (pathname !== ARTIFACT_COLLABORATION_WS_PATH) {
            return false;
        }

        if (this._shuttingDown) {
            this.rejectRawUpgrade(socket, 503, 'Service Unavailable');
            return true;
        }

        void this.handleAuthenticatedUpgrade(req, socket, head, parsedUrl);
        return true;
    }

    /**
     * Re-evaluates permissions for all active connections in `artifactId`'s room (or only `targetUserId`
     * when specified). Immediately disconnects clients who lost `CanRead` and downgrades clients
     * who lost `CanEdit` to read-only mode. When `publishRelay` is `true`, also broadcasts a
     * `'permission-revoked'` message across {@link IYjsRoomRelay} so peer MJServer instances
     * re-evaluate their active sockets for the same artifact room (`O3`).
     */
    public async ReevaluateRoomPermissions(
        artifactId: string,
        targetUserId?: string,
        publishRelay: boolean = false
    ): Promise<void> {
        if (publishRelay) {
            await this._relay.PublishToRoom({
                ArtifactID: artifactId,
                MessageType: 'permission-revoked',
                PayloadBase64: '',
                TargetUserID: targetUserId
            });
        }
        const room = this._rooms.get(artifactId.trim().toLowerCase());
        if (!room) {
            return;
        }
        const provider = this.activeProvider();
        for (const conn of Array.from(room.Connections)) {
            if (targetUserId && !UUIDsEqual(conn.User.ID, targetUserId)) {
                continue;
            }
            const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(
                provider,
                room.ArtifactID,
                conn.User
            );
            if (!perms.CanRead) {
                this.sendPermissionStatusFrame(conn.Socket, {
                    canRead: false,
                    canEdit: false,
                    reason: perms.Reason || 'Read permission revoked.'
                });
                try {
                    conn.Socket.close(WS_CLOSE_FORBIDDEN, 'Read permission revoked');
                } catch {
                    // ignore socket close error
                }
                room.Connections.delete(conn);
            } else if (conn.CanEdit !== perms.CanEdit) {
                conn.CanEdit = perms.CanEdit;
                this.sendPermissionStatusFrame(conn.Socket, {
                    canRead: true,
                    canEdit: perms.CanEdit,
                    reason: perms.CanEdit
                        ? 'Edit permission granted.'
                        : 'Edit permission revoked; session downgraded to read-only.'
                });
            }
        }
    }

    /**
     * Flushes the room's current Yjs state vector (`Y.encodeStateAsUpdate(room.Doc)`) to
     * `MJ: Artifact Working States` (`YjsState VARBINARY(MAX)`).
     */
    public async FlushWorkingState(artifactId: string, contextUser: UserInfo): Promise<boolean> {
        const room = this._rooms.get(artifactId.trim().toLowerCase());
        if (!room) {
            return false;
        }
        if (room.WorkingStateTimer) {
            clearTimeout(room.WorkingStateTimer);
            room.WorkingStateTimer = null;
        }

        const provider = this.activeProvider();
        const user = contextUser ?? room.LastModifiedByUser;
        if (!provider || !user) {
            return false;
        }

        try {
            const stateBytes = Y.encodeStateAsUpdate(room.Doc);
            const stateBase64 = BytesToBase64(stateBytes);
            const rv = RunView.FromMetadataProvider(provider);
            const existingRes = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Artifact Working States',
                    ExtraFilter: `ArtifactID='${EscapeSQLString(room.ArtifactID)}'`,
                    Fields: ['ID'],
                    MaxRows: 1,
                    SkipTotalRowCount: true,
                    ResultType: 'simple'
                },
                user
            );

            const entity = await provider.GetEntityObject<MJArtifactWorkingStateEntity>(
                'MJ: Artifact Working States',
                user
            );
            if (existingRes.Success && existingRes.Results && existingRes.Results.length > 0) {
                await entity.Load(existingRes.Results[0].ID);
            } else {
                entity.NewRecord();
                entity.ArtifactID = room.ArtifactID;
            }
            entity.YjsState = stateBase64;
            entity.LastModifiedByUserID = user.ID;
            const saved = await entity.Save();
            if (saved) {
                room.DirtyWorkingState = false;
            }
            return saved;
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.FlushWorkingState failed for '${artifactId}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
            return false;
        }
    }

    /**
     * Compacts the room's current collaborative content (`room.Doc.getText('content').toString()`)
     * into a new immutable `MJ: Artifact Versions` record if the content hash differs from the
     * latest persisted version, and flushes `MJ: Artifact Working States`.
     */
    public async CompactRoomToArtifactVersion(
        artifactId: string,
        contextUser: UserInfo
    ): Promise<{ Saved: boolean; VersionID?: string; VersionNumber?: number }> {
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
        const user = contextUser;

        await this.FlushWorkingState(artifactId, user);

        const currentContent = this.extractRoomSerializedContent(room.Doc);
        const contentHash = createHash('sha256').update(currentContent, 'utf8').digest('hex');

        const rv = RunView.FromMetadataProvider(provider);
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
            user
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
            user
        );
        versionEntity.NewRecord();
        versionEntity.ArtifactID = room.ArtifactID;
        versionEntity.VersionNumber = nextVersionNumber;
        versionEntity.UserID = user.ID;
        versionEntity.Content = currentContent;
        versionEntity.ContentHash = contentHash;

        const saved = await versionEntity.Save();
        if (!saved) {
            return { Saved: false };
        }

        room.DirtyVersion = false;
        room.Doc.getMap('meta').set('versionNumber', versionEntity.VersionNumber);
        room.Doc.getMap('meta').set('versionId', versionEntity.ID);

        // Broadcast version-saved control frame to all connected clients in the room
        this.broadcastControlFrame(room, {
            action: 'version-saved',
            versionId: versionEntity.ID,
            versionNumber: versionEntity.VersionNumber
        });

        return {
            Saved: true,
            VersionID: versionEntity.ID,
            VersionNumber: versionEntity.VersionNumber
        };
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
        const existing = this._rooms.get(key);
        if (existing) {
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
     * Graceful shutdown hook called by `ShutdownRegistry`. Flushes all dirty working states and
     * closes all active WebSocket connections.
     */
    public async Shutdown(): Promise<void> {
        this._shuttingDown = true;
        for (const room of this._rooms.values()) {
            if (room.WorkingStateTimer) {
                clearTimeout(room.WorkingStateTimer);
                room.WorkingStateTimer = null;
            }
            if (room.DirtyWorkingState && room.LastModifiedByUser) {
                await this.FlushWorkingState(room.ArtifactID, room.LastModifiedByUser);
            }
            for (const conn of room.Connections) {
                try {
                    conn.Socket.close(1001, 'Server shutting down');
                } catch {
                    // ignore close error
                }
            }
            room.Connections.clear();
            if (room.UnsubscribeRelay) {
                room.UnsubscribeRelay();
                room.UnsubscribeRelay = null;
            }
            room.Doc.off('update', room.DocUpdateListener);
            room.Doc.destroy();
        }
        this._rooms.clear();
        await this._relay.Shutdown();
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
            // ignore write error
        } finally {
            socket.destroy();
        }
    }

    private async authenticateUpgradeRequest(req: IncomingMessage, parsedUrl: URL): Promise<UserInfo | null> {
        if (this._authOverride) {
            return await this._authOverride(req);
        }

        const authHeader = req.headers['authorization'];
        let bearerToken: string | undefined;
        if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
            bearerToken = authHeader.slice(7).trim();
        }
        if (!bearerToken) {
            const queryToken = parsedUrl.searchParams.get('token');
            if (queryToken) {
                bearerToken = queryToken.trim();
            }
        }
        const apiKeyHeader = req.headers['x-api-key'];
        const apiKey =
            typeof apiKeyHeader === 'string'
                ? apiKeyHeader.trim()
                : parsedUrl.searchParams.get('apiKey')?.trim() || undefined;

        if (!bearerToken && !apiKey) {
            return null;
        }

        try {
            const payload = await getUserPayload(
                bearerToken ?? '',
                'default',
                [],
                undefined,
                apiKey,
                apiKey,
                undefined,
                req
            );
            if (!payload?.userRecord || payload.userRecord.IsActive !== true) {
                return null;
            }
            return payload.userRecord;
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
        const artifactId = (parsedUrl.searchParams.get('artifactId') ?? '').trim();
        if (!artifactId) {
            this.rejectRawUpgrade(socket, 400, 'Bad Request: artifactId is required');
            return;
        }

        const user = await this.authenticateUpgradeRequest(req, parsedUrl);
        if (!user) {
            this.rejectRawUpgrade(socket, 401, 'Unauthorized');
            return;
        }

        const provider = this.activeProvider();
        const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(provider, artifactId, user);
        if (!perms.CanRead) {
            this.rejectRawUpgrade(socket, 403, 'Forbidden');
            return;
        }

        const room = await this.GetOrCreateRoom(artifactId, user);
        if (!room) {
            this.rejectRawUpgrade(socket, 404, 'Not Found');
            return;
        }

        this._wss.handleUpgrade(req, socket, head, (ws) => {
            this.attachClientToRoom(room, ws, user, perms.CanEdit);
        });
    }

    private async createAndHydrateRoom(artifactId: string, contextUser: UserInfo): Promise<CollaborationRoom> {
        const key = artifactId.trim().toLowerCase();
        const doc = new Y.Doc();
        const awareness = new awarenessProtocol.Awareness(doc);

        const room: CollaborationRoom = {
            ArtifactID: artifactId,
            Doc: doc,
            Awareness: awareness,
            Connections: new Set(),
            DirtyWorkingState: false,
            DirtyVersion: false,
            LastModifiedByUser: contextUser,
            WorkingStateTimer: null,
            UnsubscribeRelay: null,
            DocUpdateListener: (update: Uint8Array, origin: unknown) => {
                this.onRoomDocUpdate(room, update, origin);
            },
            AwarenessUpdateListener: (changes, origin) => {
                this.onRoomAwarenessUpdate(room, changes, origin);
            }
        };

        // Hydrate from MJ: Artifact Working States and/or latest MJ: Artifact Versions
        await this.hydrateRoomStateFromDatabase(room, contextUser);

        doc.on('update', room.DocUpdateListener);
        awareness.on('update', room.AwarenessUpdateListener);

        room.UnsubscribeRelay = await this._relay.SubscribeRoom(artifactId, async (msg: YjsRelayMessage) => {
            await this.onRelayMessage(room, msg);
        });

        this._rooms.set(key, room);
        return room;
    }

    private async hydrateRoomStateFromDatabase(room: CollaborationRoom, contextUser: UserInfo): Promise<void> {
        const provider = this.activeProvider();
        if (!provider || !contextUser) {
            return;
        }
        const user = contextUser;

        try {
            const rv = RunView.FromMetadataProvider(provider);
            const safeId = EscapeSQLString(room.ArtifactID);
            const [workingRes, versionRes] = await rv.RunViews(
                [
                    {
                        EntityName: 'MJ: Artifact Working States',
                        ExtraFilter: `ArtifactID='${safeId}'`,
                        Fields: ['ID', 'ArtifactID', 'YjsState'],
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    },
                    {
                        EntityName: 'MJ: Artifact Versions',
                        ExtraFilter: `ArtifactID='${safeId}'`,
                        OrderBy: 'VersionNumber DESC',
                        Fields: ['ID', 'VersionNumber', 'Content'],
                        MaxRows: 1,
                        SkipTotalRowCount: true,
                        ResultType: 'simple'
                    }
                ],
                user
            );

            const workingRow = workingRes.Success
                ? (workingRes.Results?.[0] as { ID: string; YjsState?: string | null } | undefined)
                : undefined;
            const versionRow = versionRes.Success
                ? (versionRes.Results?.[0] as { ID: string; VersionNumber: number; Content?: string | null } | undefined)
                : undefined;

            if (workingRow?.YjsState) {
                const stateBytes = Base64ToBytes(workingRow.YjsState);
                if (stateBytes.byteLength > 0) {
                    Y.applyUpdate(room.Doc, stateBytes, 'hydrate');
                }
            }

            const yText = room.Doc.getText('content');
            if (yText.length === 0 && versionRow?.Content) {
                room.Doc.transact(() => {
                    yText.insert(0, versionRow.Content!);
                    this.syncSlideDeckStructuresIfPresent(room.Doc, versionRow.Content!);
                    room.Doc.getMap('meta').set('versionNumber', versionRow.VersionNumber);
                    room.Doc.getMap('meta').set('versionId', versionRow.ID);
                }, 'hydrate');
            } else if (versionRow) {
                room.Doc.transact(() => {
                    room.Doc.getMap('meta').set('versionNumber', versionRow.VersionNumber);
                    room.Doc.getMap('meta').set('versionId', versionRow.ID);
                }, 'hydrate');
            }
        } catch (err) {
            LogError(
                `ArtifactCollaborationServer.hydrateRoomStateFromDatabase error on '${room.ArtifactID}': ${
                    err instanceof Error ? err.message : String(err)
                }`
            );
        }
    }

    private attachClientToRoom(
        room: CollaborationRoom,
        ws: WsClient,
        user: UserInfo,
        canEdit: boolean
    ): void {
        const conn: CollaborationClientConnection = {
            Socket: ws,
            User: user,
            ArtifactID: room.ArtifactID,
            CanEdit: canEdit,
            ControlledClientIDs: new Set()
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

        ws.on('message', (data: RawData) => {
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
                        // Drop write frame from read-only connection and notify client
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
                    awarenessProtocol.applyAwarenessUpdate(room.Awareness, updateBytes, conn);
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
            void this._relay.PublishToRoom({
                ArtifactID: room.ArtifactID,
                MessageType: 'sync-update',
                PayloadBase64: BytesToBase64(update)
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
            void this._relay.PublishToRoom({
                ArtifactID: room.ArtifactID,
                MessageType: 'awareness',
                PayloadBase64: BytesToBase64(updateBytes)
            });
        }
    }

    private async onRelayMessage(room: CollaborationRoom, msg: YjsRelayMessage): Promise<void> {
        if (msg.MessageType === 'sync-update' && msg.PayloadBase64) {
            const updateBytes = Base64ToBytes(msg.PayloadBase64);
            if (updateBytes.byteLength > 0) {
                Y.applyUpdate(room.Doc, updateBytes, 'relay');
            }
        } else if (msg.MessageType === 'awareness' && msg.PayloadBase64) {
            const awarenessBytes = Base64ToBytes(msg.PayloadBase64);
            if (awarenessBytes.byteLength > 0) {
                awarenessProtocol.applyAwarenessUpdate(room.Awareness, awarenessBytes, 'relay');
            }
        } else if (msg.MessageType === 'permission-revoked') {
            await this.ReevaluateRoomPermissions(room.ArtifactID, msg.TargetUserID, false);
        }
    }

    private onClientDisconnect(room: CollaborationRoom, conn: CollaborationClientConnection): void {
        room.Connections.delete(conn);
        if (conn.ControlledClientIDs.size > 0) {
            awarenessProtocol.removeAwarenessStates(
                room.Awareness,
                Array.from(conn.ControlledClientIDs),
                null
            );
            conn.ControlledClientIDs.clear();
        }

        // If this was the last connected client and the room has uncompacted edits, flush & compact!
        if (room.Connections.size === 0 && (room.DirtyWorkingState || room.DirtyVersion)) {
            const actor = room.LastModifiedByUser ?? conn.User;
            void this.CompactRoomToArtifactVersion(room.ArtifactID, actor);
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
     * Reconstructs the canonical string content of a Yjs room.
     * If the room contains per-slide CRDT maps (`slidesById` + `slideOrder`), reconstructs
     * the merged {@link SlideDeckSpec} JSON so concurrent slide edits, reorders, and `deckMeta`
     * theme/master updates are preserved.
     */
    private extractRoomSerializedContent(doc: Y.Doc): string {
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
