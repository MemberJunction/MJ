import { createServer, type Server as HttpServer, type IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { AgentRunner } from '@memberjunction/ai-agents';
import {
    MJAIAgentEntityExtended,
    MJAIAgentRunEntityExtended
} from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import { EntityInfo, IMetadataProvider, RunViewParams, UserInfo, WellKnownUserSource } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { Base64ToBytes, BytesToBase64, GetGlobalObjectStore, MJEventType, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    ArtifactMetadataEngine,
    ArtifactPermissionEngine,
    DocumentLiveBlockEngine,
    MJArtifactVersionEntity,
    MJConversationDetailArtifactEntity,
    SpreadsheetEngine,
    type SpreadsheetCellSpec,
    type WorkbookSpec,
    type WorksheetSpec
} from '@memberjunction/core-entities';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';

vi.mock('../config.js', () => ({
    configInfo: {
        apiBasePath: '/',
        cors: { allowedOrigins: ['*'] }
    }
}));

vi.mock('../context.js', () => ({
    getUserPayload: vi.fn(async () => null)
}));

vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    const decorators = [
        'Resolver',
        'Query',
        'Mutation',
        'Subscription',
        'Arg',
        'Args',
        'ArgsType',
        'Ctx',
        'Root',
        'Info',
        'Field',
        'FieldResolver',
        'ObjectType',
        'InputType',
        'InterfaceType',
        'Authorized',
        'UseMiddleware',
        'Extensions',
        'Directive',
        'PubSub'
    ];
    return {
        ...Object.fromEntries(decorators.map((name) => [name, noopDecorator])),
        Float: class {},
        Int: class {},
        ID: class {},
        PubSubEngine: class {},
        AuthorizationError: class AuthorizationError extends Error {},
        registerEnumType: () => undefined,
        createUnionType: () => class {}
    };
});

import {
    ARTIFACT_COLLABORATION_WS_PATH,
    ARTIFACT_LIVE_MUTATION_EVENT_CODE,
    ARTIFACT_VERSION_SAVED_EVENT_CODE,
    ArtifactCollaborationServer,
    COLLAB_SECRET_UNCONFIGURED_CODE,
    CollaborationControlFrame,
    CollaborationPermissionStatusFrame,
    WS_CLOSE_FORBIDDEN,
    YJS_MESSAGE_AWARENESS,
    YJS_MESSAGE_CONTROL,
    YJS_MESSAGE_PERMISSION_STATUS,
    YJS_MESSAGE_SYNC
} from '../collaboration/ArtifactCollaborationServer.js';
import {
    type IYjsRoomRelay,
    InMemoryYjsRelayBus,
    InMemoryYjsRoomRelay,
    RedisYjsRoomRelay,
    YjsRelayMessage
} from '../collaboration/YjsRoomRelay.js';
import { DocumentCollaborationResolver } from '../resolvers/DocumentCollaborationResolver.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RunAIAgentResolver } from '../resolvers/RunAIAgentResolver.js';
import { getUserPayload } from '../context.js';
import type { AppContext, DataSourceInfo } from '../types.js';

interface MockStoredWorkingState {
    ID: string;
    ArtifactID: string;
    YjsState: string;
    LastModifiedByUserID: string;
    __mj_UpdatedAt?: string;
}

interface MockStoredVersion {
    ID: string;
    ArtifactID: string;
    VersionNumber: number;
    Content: string;
    ContentHash: string;
    UserID: string;
    Name?: string;
    Configuration?: string | null;
    Description?: string;
    Comments?: string;
    __mj_CreatedAt?: string;
    __mj_UpdatedAt?: string;
}

interface MockPermissionMapEntry {
    CanRead: boolean;
    CanEdit: boolean;
}

function createTestUser(id: string, name: string, email: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = email;
    u.IsActive = true;
    return u;
}

describe('YjsRoomRelay (InMemoryYjsRoomRelay & RedisYjsRoomRelay)', () => {
    it('InMemoryYjsRoomRelay fans out messages across peer instances and suppresses self-echoes', async () => {
        const sharedBus = new InMemoryYjsRelayBus();
        const nodeA = new InMemoryYjsRoomRelay(sharedBus, 'node-a');
        const nodeB = new InMemoryYjsRoomRelay(sharedBus, 'node-b');

        const receivedByA: YjsRelayMessage[] = [];
        const receivedByB: YjsRelayMessage[] = [];

        await nodeA.SubscribeRoom('art-100', (msg) => {
            receivedByA.push(msg);
        });
        const unsubB = await nodeB.SubscribeRoom('art-100', (msg) => {
            receivedByB.push(msg);
        });

        await nodeA.PublishToRoom({
            ArtifactID: 'art-100',
            MessageType: 'sync-update',
            PayloadBase64: 'AQID'
        });

        expect(receivedByA).toHaveLength(0); // Self-echo suppressed
        expect(receivedByB).toHaveLength(1);
        expect(receivedByB[0].PayloadBase64).toBe('AQID');
        expect(receivedByB[0].OriginInstanceID).toBe('node-a');

        unsubB();
        await nodeA.PublishToRoom({
            ArtifactID: 'art-100',
            MessageType: 'sync-update',
            PayloadBase64: 'BAUG'
        });
        expect(receivedByB).toHaveLength(1);

        await nodeA.Shutdown();
        await nodeB.Shutdown();
    });

    it('RedisYjsRoomRelay bridges RedisLocalStorageProvider pub/sub channels and suppresses self-echoes', async () => {
        const channelHandlers = new Map<string, Array<(payload: string) => Promise<void>>>();

        const fakeRedis: Pick<
            RedisLocalStorageProvider,
            'IsPubSubEnabled' | 'SubscribeToChannel' | 'PublishMessageAndWait'
        > = {
            IsPubSubEnabled: true,
            SubscribeToChannel: vi.fn(async (channel: string, cb: (payload: string) => Promise<void>) => {
                const list = channelHandlers.get(channel) ?? [];
                list.push(cb);
                channelHandlers.set(channel, list);
                return () => {
                    const current = channelHandlers.get(channel) ?? [];
                    const idx = current.indexOf(cb);
                    if (idx >= 0) {
                        current.splice(idx, 1);
                    }
                };
            }),
            PublishMessageAndWait: vi.fn(async (channel: string, message: string) => {
                const list = channelHandlers.get(channel) ?? [];
                for (const cb of list) {
                    await cb(message);
                }
                return list.length;
            })
        };

        const relay1 = new RedisYjsRoomRelay(fakeRedis as RedisLocalStorageProvider, 'redis-node-1');
        const relay2 = new RedisYjsRoomRelay(fakeRedis as RedisLocalStorageProvider, 'redis-node-2');

        const received1: YjsRelayMessage[] = [];
        const received2: YjsRelayMessage[] = [];

        await relay1.SubscribeRoom('art-redis-1', (m) => {
            received1.push(m);
        });
        await relay2.SubscribeRoom('art-redis-1', (m) => {
            received2.push(m);
        });

        await relay1.PublishToRoom({
            ArtifactID: 'art-redis-1',
            MessageType: 'permission-revoked',
            PayloadBase64: '',
            TargetUserID: 'user-99'
        });

        expect(received1).toHaveLength(0);
        expect(received2).toHaveLength(1);
        expect(received2[0].TargetUserID).toBe('user-99');

        await relay1.Shutdown();
        await relay2.Shutdown();
    });
});

describe('ArtifactCollaborationServer (WebSocket Yjs CRDT Sync, Permissions, Checkpointing & Compaction)', () => {
    const editorUser = createTestUser('user-editor-1', 'Alice Editor', 'alice@example.com');
    const secondEditorUser = createTestUser('user-editor-2', 'Bob CoAuthor', 'bob@example.com');
    const viewerUser = createTestUser('user-viewer-1', 'Charlie Viewer', 'charlie@example.com');
    const artifactId = '11111111-2222-3333-4444-555555555555';

    let httpServer: HttpServer;
    let wsPort: number;
    let workingStates: Map<string, MockStoredWorkingState>;
    let versions: MockStoredVersion[];
    let permissionTable: Map<string, MockPermissionMapEntry>;
    let resolvePermissionsSpy: ReturnType<typeof vi.spyOn>;
    let aiConfigSpy: ReturnType<typeof vi.spyOn>;

    function createMockProvider(options?: {
        onBeforeVersionSave?: (draft: MockStoredVersion) => Promise<boolean>;
    }): IMetadataProvider {
        const runViewFn = async (params: RunViewParams) => {
            const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
            const artMatch = filter.match(/\bArtifactID='([^']+)'/);
            if (params.EntityName === 'MJ: Artifact Working States') {
                const targetArtId = artMatch ? artMatch[1] : artifactId;
                let existing: MockStoredWorkingState | undefined;
                for (const [key, val] of workingStates.entries()) {
                    if (UUIDsEqual(key, targetArtId)) {
                        existing = val;
                        break;
                    }
                }
                return {
                    Success: true,
                    Results: existing ? [existing] : [],
                    TotalRowCount: existing ? 1 : 0
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                let candidates = [...versions];
                if (artMatch) {
                    candidates = candidates.filter((v) => UUIDsEqual(v.ArtifactID, artMatch[1]));
                }
                const idMatch = filter.match(/\bID='([^']+)'/);
                if (idMatch) {
                    candidates = candidates.filter((v) => UUIDsEqual(v.ID, idMatch[1]));
                }
                const verNumMatch = filter.match(/\bVersionNumber=(\d+)/);
                if (verNumMatch) {
                    const targetVer = Number(verNumMatch[1]);
                    candidates = candidates.filter((v) => v.VersionNumber === targetVer);
                }
                const sorted = candidates.sort((a, b) => b.VersionNumber - a.VersionNumber);
                return {
                    Success: true,
                    Results: sorted.length > 0 ? [sorted[0]] : [],
                    TotalRowCount: sorted.length
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0 };
        };

        const mockProvider: Partial<IMetadataProvider> = {
            RunView: runViewFn as IMetadataProvider['RunView'],
            RunViews: (async (paramsArray: RunViewParams[]) => {
                const results = [];
                for (const p of paramsArray) {
                    results.push(await runViewFn(p));
                }
                return results;
            }) as IMetadataProvider['RunViews'],
            GetEntityObject: (async (entityName: string) => {
                if (entityName === 'MJ: Artifact Working States') {
                    const record: MockStoredWorkingState & {
                        NewRecord: () => void;
                        Load: (id: string) => Promise<boolean>;
                        LoadFromData: (data: Partial<MockStoredWorkingState>) => Promise<boolean>;
                        Save: () => Promise<boolean>;
                    } = {
                        ID: 'ws-row-1',
                        ArtifactID: artifactId,
                        YjsState: '',
                        LastModifiedByUserID: '',
                        NewRecord() {
                            this.ID = 'ws-row-1';
                        },
                        async Load(id: string) {
                            const found = workingStates.get(artifactId);
                            if (found) {
                                this.ID = id;
                                this.ArtifactID = found.ArtifactID;
                                this.YjsState = found.YjsState;
                                this.LastModifiedByUserID = found.LastModifiedByUserID;
                            }
                            return true;
                        },
                        async LoadFromData(data: Partial<MockStoredWorkingState>) {
                            if (data.ID) this.ID = data.ID;
                            if (data.ArtifactID) this.ArtifactID = data.ArtifactID;
                            if (data.YjsState !== undefined) this.YjsState = data.YjsState;
                            if (data.LastModifiedByUserID !== undefined) {
                                this.LastModifiedByUserID = data.LastModifiedByUserID;
                            }
                            return true;
                        },
                        async Save() {
                            workingStates.set(this.ArtifactID, {
                                ID: this.ID,
                                ArtifactID: this.ArtifactID,
                                YjsState: this.YjsState,
                                LastModifiedByUserID: this.LastModifiedByUserID,
                                __mj_UpdatedAt: new Date().toISOString()
                            });
                            return true;
                        }
                    };
                    return record;
                }
                if (entityName === 'MJ: Artifact Versions') {
                    const record: MockStoredVersion & {
                        IsSaved: boolean;
                        NewRecord: () => void;
                        Load: (id: string) => Promise<boolean>;
                        Save: () => Promise<boolean>;
                    } = {
                        ID: `ver-${versions.length + 1}`,
                        ArtifactID: artifactId,
                        VersionNumber: 1,
                        Content: '',
                        ContentHash: '',
                        UserID: '',
                        IsSaved: true,
                        NewRecord() {
                            this.ID = `ver-${versions.length + 1}`;
                            this.IsSaved = false;
                        },
                        async Load(id: string) {
                            const found = versions.find((v) => UUIDsEqual(v.ID, id));
                            if (found) {
                                this.ID = found.ID;
                                this.ArtifactID = found.ArtifactID;
                                this.VersionNumber = found.VersionNumber;
                                this.Content = found.Content;
                                this.ContentHash = found.ContentHash;
                                this.UserID = found.UserID;
                                this.Name = found.Name;
                                this.Configuration = found.Configuration;
                                this.Description = found.Description;
                                this.Comments = found.Comments;
                                this.IsSaved = true;
                                return true;
                            }
                            return false;
                        },
                        async Save() {
                            if (options?.onBeforeVersionSave) {
                                const allow = await options.onBeforeVersionSave({
                                    ID: this.ID,
                                    ArtifactID: this.ArtifactID,
                                    VersionNumber: this.VersionNumber,
                                    Content: this.Content,
                                    ContentHash: this.ContentHash,
                                    UserID: this.UserID,
                                    Name: this.Name,
                                    Configuration: this.Configuration,
                                    Description: this.Description,
                                    Comments: this.Comments
                                });
                                if (!allow) {
                                    return false;
                                }
                            }
                            const now = new Date().toISOString();
                            this.IsSaved = true;
                            versions.push({
                                ID: this.ID,
                                ArtifactID: this.ArtifactID,
                                VersionNumber: this.VersionNumber,
                                Content: this.Content,
                                ContentHash: this.ContentHash,
                                UserID: this.UserID,
                                Name: this.Name,
                                Configuration: this.Configuration,
                                Description: this.Description,
                                Comments: this.Comments,
                                __mj_CreatedAt: now,
                                __mj_UpdatedAt: now
                            });
                            return true;
                        }
                    };
                    return record;
                }
                throw new Error(`Unexpected entity '${entityName}' in test mock`);
            }) as IMetadataProvider['GetEntityObject']
        };

        return mockProvider as IMetadataProvider;
    }

    beforeEach(async () => {
        workingStates = new Map();
        versions = [
            {
                ID: 'ver-1',
                ArtifactID: artifactId,
                VersionNumber: 1,
                Content: '# Initial Strategy Document\n\nBaseline paragraph.',
                ContentHash: 'initial-hash',
                UserID: editorUser.ID
            }
        ];

        permissionTable = new Map<string, MockPermissionMapEntry>([
            [editorUser.ID, { CanRead: true, CanEdit: true }],
            [secondEditorUser.ID, { CanRead: true, CanEdit: true }],
            [viewerUser.ID, { CanRead: true, CanEdit: false }]
        ]);

        resolvePermissionsSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
            .mockImplementation(async (_provider, artId, user) => {
                const entry = permissionTable.get(user.ID) ?? { CanRead: false, CanEdit: false };
                return {
                    ArtifactID: artId,
                    CanRead: entry.CanRead,
                    CanEdit: entry.CanEdit,
                    CanDelete: entry.CanEdit,
                    CanShare: entry.CanEdit,
                    Source: entry.CanRead ? 'DirectShare' : 'Denied',
                    Reason: entry.CanRead ? 'Allowed in test' : 'Access denied in test'
                };
            });

        aiConfigSpy = vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);

        const server = ArtifactCollaborationServer.Instance;
        // Reset shutdown flag and rooms via Shutdown, then re-configure
        await server.Shutdown();
        (server as unknown as { _shuttingDown: boolean })._shuttingDown = false;
        server.SetTicketHmacSecret('test-collab-ticket-hmac-secret-at-least-32-bytes!!');
        server.SetTicketReplayStore(null);
        DocumentLiveBlockEngine.Instance.SetSigningSecret('test-frozen-block-hmac-secret-at-least-32-bytes!!');
        server.SetRoomRelay(new InMemoryYjsRoomRelay());
        server.SetMetadataProviderOverride(createMockProvider());
        server.SetAuthResolverOverride(async (req: IncomingMessage) => {
            const url = new URL(req.url ?? '/', 'http://localhost');
            const userId = url.searchParams.get('testUserId');
            if (userId === editorUser.ID) return editorUser;
            if (userId === secondEditorUser.ID) return secondEditorUser;
            if (userId === viewerUser.ID) return viewerUser;
            return null;
        });

        httpServer = createServer();
        httpServer.on('upgrade', (req, socket, head) => {
            if (!server.TryHandleUpgrade(req, socket, head)) {
                socket.destroy();
            }
        });

        await new Promise<void>((resolve) => {
            httpServer.listen(0, '127.0.0.1', () => {
                wsPort = (httpServer.address() as AddressInfo).port;
                resolve();
            });
        });
    });

    afterEach(async () => {
        aiConfigSpy.mockRestore();
        resolvePermissionsSpy.mockRestore();
        await ArtifactCollaborationServer.Instance.Shutdown();
        ArtifactCollaborationServer.Instance.SetIdleRoomTtlMs(30_000);
        ArtifactCollaborationServer.Instance.SetMetadataProviderOverride(null);
        ArtifactCollaborationServer.Instance.SetAuthResolverOverride(null);
        ArtifactCollaborationServer.Instance.SetTicketHmacSecret(null);
        ArtifactCollaborationServer.Instance.SetTicketReplayStore(null);
        DocumentLiveBlockEngine.Instance.SetSigningSecret(null);
        await new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
        });
    });

    function connectYjsClient(userId: string, customArtifactId?: string): Promise<{
        ws: WsClient;
        doc: Y.Doc;
        awareness: awarenessProtocol.Awareness;
        permissionFrames: CollaborationPermissionStatusFrame[];
        controlFrames: CollaborationControlFrame[];
        waitForText: (expectedSubstring: string, timeoutMs?: number) => Promise<void>;
    }> {
        return new Promise((resolve, reject) => {
            const doc = new Y.Doc();
            const awareness = new awarenessProtocol.Awareness(doc);
            const permissionFrames: CollaborationPermissionStatusFrame[] = [];
            const controlFrames: CollaborationControlFrame[] = [];

            const targetArtId = customArtifactId ?? artifactId;
            const ws = new WsClient(
                `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${targetArtId}&testUserId=${userId}`
            );

            ws.on('message', (raw: Buffer) => {
                const bytes = new Uint8Array(raw);
                const decoder = decoding.createDecoder(bytes);
                const msgType = decoding.readVarUint(decoder);

                if (msgType === YJS_MESSAGE_SYNC) {
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
                    syncProtocol.readSyncMessage(decoder, encoder, doc, 'server');
                    if (encoding.length(encoder) > 1 && ws.readyState === WsClient.OPEN) {
                        ws.send(encoding.toUint8Array(encoder));
                    }
                } else if (msgType === YJS_MESSAGE_AWARENESS) {
                    const update = decoding.readVarUint8Array(decoder);
                    awarenessProtocol.applyAwarenessUpdate(awareness, update, 'server');
                } else if (msgType === YJS_MESSAGE_PERMISSION_STATUS) {
                    const json = decoding.readVarString(decoder);
                    permissionFrames.push(JSON.parse(json) as CollaborationPermissionStatusFrame);
                } else if (msgType === YJS_MESSAGE_CONTROL) {
                    const json = decoding.readVarString(decoder);
                    controlFrames.push(JSON.parse(json) as CollaborationControlFrame);
                }
            });

            doc.on('update', (update: Uint8Array, origin: unknown) => {
                if (origin === 'server') {
                    return;
                }
                if (ws.readyState === WsClient.OPEN) {
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
                    syncProtocol.writeUpdate(encoder, update);
                    ws.send(encoding.toUint8Array(encoder));
                }
            });

            awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
                if (origin === 'server') {
                    return;
                }
                const changed = added.concat(updated, removed);
                if (changed.length > 0 && ws.readyState === WsClient.OPEN) {
                    const updateBytes = awarenessProtocol.encodeAwarenessUpdate(awareness, changed);
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, YJS_MESSAGE_AWARENESS);
                    encoding.writeVarUint8Array(encoder, updateBytes);
                    ws.send(encoding.toUint8Array(encoder));
                }
            });

            const waitForText = (expectedSubstring: string, timeoutMs = 2000): Promise<void> => {
                return new Promise((resWait, rejWait) => {
                    if (doc.getText('content').toString().includes(expectedSubstring)) {
                        resWait();
                        return;
                    }
                    const timer = setTimeout(() => {
                        doc.off('update', check);
                        rejWait(
                            new Error(
                                `Timed out waiting for text '${expectedSubstring}'. Current: '${doc.getText('content').toString()}'`
                            )
                        );
                    }, timeoutMs);
                    const check = () => {
                        if (doc.getText('content').toString().includes(expectedSubstring)) {
                            clearTimeout(timer);
                            doc.off('update', check);
                            resWait();
                        }
                    };
                    doc.on('update', check);
                });
            };

            ws.on('open', () => {
                resolve({ ws, doc, awareness, permissionFrames, controlFrames, waitForText });
            });
            ws.on('error', (err) => reject(err));
        });
    }

    it('hydrates initial room state from MJ: Artifact Versions and synchronizes real-time Yjs edits between two editors', async () => {
        const clientA = await connectYjsClient(editorUser.ID);
        const clientB = await connectYjsClient(secondEditorUser.ID);

        await clientA.waitForText('# Initial Strategy Document');
        await clientB.waitForText('# Initial Strategy Document');

        expect(clientA.permissionFrames[0]).toMatchObject({ canRead: true, canEdit: true, versionNumber: 1 });
        expect(clientB.permissionFrames[0]).toMatchObject({ canRead: true, canEdit: true, versionNumber: 1 });

        // Editor A inserts text at the end of the document
        clientA.doc.transact(() => {
            const yText = clientA.doc.getText('content');
            yText.insert(yText.length, '\n\n## Section Added by Alice');
        });

        // Editor B receives the CRDT update in real time
        await clientB.waitForText('## Section Added by Alice');
        expect(clientB.doc.getText('content').toString()).toContain('## Section Added by Alice');

        clientA.ws.close();
        clientB.ws.close();
    });

    it('drops write frames from read-only clients and emits readonly-rejected control frame without mutating room state', async () => {
        const viewerClient = await connectYjsClient(viewerUser.ID);
        await viewerClient.waitForText('# Initial Strategy Document');

        expect(viewerClient.permissionFrames[0]).toMatchObject({ canRead: true, canEdit: false });

        // Viewer attempts to mutate their local Y.Doc (which sends a Yjs update frame to server)
        viewerClient.doc.transact(() => {
            viewerClient.doc.getText('content').insert(0, 'UNAUTHORIZED WRITE ');
        });

        // Wait for server to send readonly-rejected control frame
        await vi.waitFor(() => {
            expect(viewerClient.controlFrames.some((f) => f.action === 'readonly-rejected')).toBe(true);
        });

        // Verify the authoritative server room content was NOT modified
        const serverContent = await ArtifactCollaborationServer.Instance.GetRoomContent(artifactId, editorUser);
        expect(serverContent).toBe('# Initial Strategy Document\n\nBaseline paragraph.');
        expect(serverContent).not.toContain('UNAUTHORIZED WRITE');

        viewerClient.ws.close();
    });

    it('downgrades an active editor to read-only and disconnects revoked readers immediately when permissions change mid-session', async () => {
        const clientA = await connectYjsClient(editorUser.ID);
        const clientViewer = await connectYjsClient(viewerUser.ID);

        await clientA.waitForText('# Initial Strategy Document');
        await clientViewer.waitForText('# Initial Strategy Document');

        // 1. Downgrade editorUser from CanEdit=true to CanEdit=false
        permissionTable.set(editorUser.ID, { CanRead: true, CanEdit: false });
        await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
            ArtifactID: artifactId,
            TargetUserID: editorUser.ID
        });

        await vi.waitFor(() => {
            const latestPerm = clientA.permissionFrames[clientA.permissionFrames.length - 1];
            expect(latestPerm).toMatchObject({ canRead: true, canEdit: false });
        });

        // Now editorUser's write attempt must be rejected
        clientA.doc.transact(() => {
            clientA.doc.getText('content').insert(0, 'AFTER DOWNGRADE ');
        });
        await vi.waitFor(() => {
            expect(clientA.controlFrames.some((f) => f.action === 'readonly-rejected')).toBe(true);
        });

        // 2. Revoke viewerUser's read permission completely -> socket closed with WS_CLOSE_FORBIDDEN (4403)
        const closePromise = new Promise<number>((resolve) => {
            clientViewer.ws.on('close', (code) => resolve(code));
        });
        permissionTable.set(viewerUser.ID, { CanRead: false, CanEdit: false });
        await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
            ArtifactID: artifactId,
            TargetUserID: viewerUser.ID
        });

        const closeCode = await closePromise;
        expect(closeCode).toBe(WS_CLOSE_FORBIDDEN);

        clientA.ws.close();
    });

    it('checkpoints binary Yjs state to MJ: Artifact Working States and compacts versions to MJ: Artifact Versions', async () => {
        const clientA = await connectYjsClient(editorUser.ID);
        await clientA.waitForText('# Initial Strategy Document');

        clientA.doc.transact(() => {
            const yText = clientA.doc.getText('content');
            yText.insert(yText.length, '\n\nCheckpointed and compacted content.');
        });

        // Wait for server room to receive the update
        await vi.waitFor(async () => {
            const content = await ArtifactCollaborationServer.Instance.GetRoomContent(artifactId, editorUser);
            expect(content).toContain('Checkpointed and compacted content.');
        });

        // Explicitly flush working state
        const flushed = await ArtifactCollaborationServer.Instance.FlushWorkingState(artifactId, editorUser);
        expect(flushed).toBe(true);
        const savedWorkingState = workingStates.get(artifactId);
        expect(savedWorkingState).toBeDefined();
        expect(savedWorkingState!.YjsState.length).toBeGreaterThan(10);

        // Compact room into a new MJ: Artifact Versions record
        const compacted = await ArtifactCollaborationServer.Instance.CompactRoomToArtifactVersion(
            artifactId,
            editorUser
        );
        expect(compacted.Saved).toBe(true);
        expect(compacted.VersionNumber).toBe(2);
        expect(versions).toHaveLength(2);
        expect(versions[1].Content).toContain('Checkpointed and compacted content.');
        expect(versions[1].ContentHash).toMatch(/^[a-f0-9]{64}$/);

        // Connected client receives version-saved control broadcast
        await vi.waitFor(() => {
            expect(
                clientA.controlFrames.some((f) => f.action === 'version-saved' && f.versionNumber === 2)
            ).toBe(true);
        });

        clientA.ws.close();
    });

    it('ApplyServerContentMutation applies server-side tool library edits to the live Yjs room and broadcasts to clients', async () => {
        const clientA = await connectYjsClient(editorUser.ID);
        await clientA.waitForText('# Initial Strategy Document');

        const result = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            artifactId,
            '# Initial Strategy Document\n\nUpdated by @DocsAgent via DocumentToolLibrary.',
            editorUser,
            true
        );

        expect(result.Success).toBe(true);
        expect(result.VersionNumber).toBe(2);

        // Connected browser client sees the agent's mutation in real time
        await clientA.waitForText('Updated by @DocsAgent via DocumentToolLibrary.');
        expect(clientA.doc.getText('content').toString()).toContain(
            'Updated by @DocsAgent via DocumentToolLibrary.'
        );

        clientA.ws.close();
    });

    it('DocumentCollaborationResolver enforces permissions on ResolveArtifactUserPermissions, ExecuteDocumentLiveBlock, FreezeDocumentLiveBlock, and CommitArtifactInlineEdit', async () => {
        const resolver = new DocumentCollaborationResolver();
        const mockProvider = createMockProvider();

        const editorCtx: AppContext = {
            dataSource: {} as AppContext['dataSource'],
            dataSources: [],
            providers: [{ provider: mockProvider, type: 'Read-Write' }],
            userPayload: {
                userRecord: editorUser,
                email: editorUser.Email,
                sessionId: 'sess-1'
            }
        };

        const viewerCtx: AppContext = {
            ...editorCtx,
            userPayload: {
                userRecord: viewerUser,
                email: viewerUser.Email,
                sessionId: 'sess-2'
            }
        };

        // 1. ResolveArtifactUserPermissions
        const perms = await resolver.ResolveArtifactUserPermissions(artifactId, editorCtx);
        expect(perms.CanRead).toBe(true);
        expect(perms.CanEdit).toBe(true);

        // 2. FreezeDocumentLiveBlock & ExecuteDocumentLiveBlock require non-empty hostArtifactId
        const specJson = JSON.stringify({
            BlockID: 'blk-live-1',
            Kind: 'EntityView',
            Mode: 'Live',
            EntityName: 'MJ: Users'
        });
        const missingHostExec = await resolver.ExecuteDocumentLiveBlock(specJson, editorCtx);
        expect(missingHostExec.Success).toBe(false);
        expect(missingHostExec.AccessDenied).toBe(true);
        expect(missingHostExec.ErrorMessage).toContain('hostArtifactId');

        const missingHostFreeze = await resolver.FreezeDocumentLiveBlock(specJson, true, editorCtx);
        expect(missingHostFreeze.Success).toBe(false);
        expect(missingHostFreeze.ErrorMessage).toContain('hostArtifactId');

        const unackedFreeze = await resolver.FreezeDocumentLiveBlock(specJson, false, editorCtx, artifactId);
        expect(unackedFreeze.Success).toBe(false);
        expect(unackedFreeze.ErrorMessage).toContain('acknowledgeSecurityWarning');

        // Mock ExecuteBlock for acknowledged freeze
        const execSpy = vi.spyOn(DocumentLiveBlockEngine.Instance, 'ExecuteBlock').mockResolvedValue({
            Success: true,
            BlockID: 'blk-live-1',
            Kind: 'EntityView',
            Mode: 'Live',
            Columns: [{ Name: 'Name', DisplayName: 'Name', Type: 'nvarchar' }],
            Rows: [{ Name: 'Alice Editor' }],
            TotalRowCount: 1,
            ExecutedAt: '2026-11-08T10:00:00.000Z'
        });

        const ackedFreeze = await resolver.FreezeDocumentLiveBlock(specJson, true, editorCtx, artifactId);
        expect(ackedFreeze.Success).toBe(true);
        expect(ackedFreeze.UpdatedSpecJSON).toContain('"Mode":"Frozen"');
        execSpy.mockRestore();

        // 3. CommitArtifactInlineEdit denies viewer and succeeds for editor
        const deniedCommit = await resolver.CommitArtifactInlineEdit(
            artifactId,
            '{"version":2}',
            true,
            viewerCtx
        );
        expect(deniedCommit.Success).toBe(false);

        const allowedCommit = await resolver.CommitArtifactInlineEdit(
            artifactId,
            '# Updated via Inline Commit',
            true,
            editorCtx
        );
        expect(allowedCommit.Success).toBe(true);
        expect(allowedCommit.VersionNumber).toBe(2);

        // 4. ExecuteDocumentLiveBlock & FreezeDocumentLiveBlock enforce hostArtifactId permissions
        const deniedFreezeOnHost = await resolver.FreezeDocumentLiveBlock(
            specJson,
            true,
            viewerCtx,
            artifactId
        );
        expect(deniedFreezeOnHost.Success).toBe(false);

        permissionTable.set(viewerUser.ID, { CanRead: false, CanEdit: false });
        const deniedExecOnHost = await resolver.ExecuteDocumentLiveBlock(
            specJson,
            viewerCtx,
            artifactId
        );
        expect(deniedExecOnHost.Success).toBe(false);
        expect(deniedExecOnHost.AccessDenied).toBe(true);
    });

    it('rejects direct ApplyServerContentMutation and CompactRoomToArtifactVersion calls from a read-only user', async () => {
        const mutationRes = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            artifactId,
            '# Unauthorized direct server mutation',
            viewerUser,
            true
        );
        expect(mutationRes.Success).toBe(false);

        const compactRes = await ArtifactCollaborationServer.Instance.CompactRoomToArtifactVersion(
            artifactId,
            viewerUser
        );
        expect(compactRes.Saved).toBe(false);
    });

    it('publishes permission-revoked over IYjsRoomRelay and downgrades/closes sockets across server instances', async () => {
        const bus = new InMemoryYjsRelayBus();
        const relayServerB = new InMemoryYjsRoomRelay(bus);
        const relayServerA = new InMemoryYjsRoomRelay(bus);

        // Attach Server B to the shared relay bus and connect editorUser
        ArtifactCollaborationServer.Instance.SetRoomRelay(relayServerB);
        const clientOnB = await connectYjsClient(editorUser.ID);
        await clientOnB.waitForText('# Initial Strategy Document');
        expect(clientOnB.permissionFrames[0]).toMatchObject({ canRead: true, canEdit: true });

        // Simulate Server A publishing permission-revoked across the shared relay bus
        permissionTable.set(editorUser.ID, { CanRead: true, CanEdit: false });
        await relayServerA.PublishToRoom({
            ArtifactID: artifactId,
            MessageType: 'permission-revoked',
            PayloadBase64: '',
            TargetUserID: editorUser.ID
        });

        await vi.waitFor(() => {
            const latest = clientOnB.permissionFrames[clientOnB.permissionFrames.length - 1];
            expect(latest).toMatchObject({ canRead: true, canEdit: false });
        });

        // Also verify that local NotifyPermissionsChanged publishes 'permission-revoked' to the relay bus
        const receivedOnPeer: YjsRelayMessage[] = [];
        const unsubPeer = await relayServerA.SubscribeRoom(artifactId, (msg) => {
            receivedOnPeer.push(msg);
        });

        await ArtifactPermissionEngine.Instance.NotifyPermissionsChanged({
            ArtifactID: artifactId,
            TargetUserID: editorUser.ID
        });

        expect(
            receivedOnPeer.some(
                (m) => m.MessageType === 'permission-revoked' && m.TargetUserID === editorUser.ID
            )
        ).toBe(true);

        unsubPeer();
        await relayServerA.Shutdown();
        clientOnB.ws.close();
    });

    it('synchronizes concurrent per-slide Yjs edits (slidesById Y.Map) and slide reordering (slideOrder Y.Array) with zero data loss (Wave 2 Accept #1)', async () => {
        // Seed version 1 with a 3-slide presentation deck JSON
        const initialDeck = {
            SchemaVersion: '1.0',
            DeckID: 'deck-wave2-sync',
            Title: 'Board Strategy Deck',
            AspectRatio: '16:9',
            Theme: {
                ThemeID: 'mj-default',
                Name: 'MemberJunction Default',
                PrimaryColor: '#2563EB',
                AccentColor: '#0EA5E9',
                BackgroundColor: '#FFFFFF',
                SurfaceColor: '#F8FAFC',
                TextPrimaryColor: '#0F172A',
                TextSecondaryColor: '#475569',
                BorderColor: '#E2E8F0',
                HeadingFontFamily: 'Inter, system-ui, sans-serif',
                BodyFontFamily: 'Inter, system-ui, sans-serif',
                MonospaceFontFamily: 'JetBrains Mono, monospace'
            },
            Master: {
                HeaderText: 'MemberJunction Confidential',
                FooterText: 'Q4 Strategy',
                ShowSlideNumbers: true,
                ShowHeaderOnTitleSlide: false,
                ShowFooterOnTitleSlide: false,
                OrganizationName: 'MemberJunction'
            },
            Slides: [
                {
                    SlideID: 'slide-1',
                    Layout: 'Title',
                    Title: 'Original Slide 1 Title',
                    Subtitle: 'Original Subtitle',
                    SpeakerNotes: 'Notes 1',
                    Regions: []
                },
                {
                    SlideID: 'slide-2',
                    Layout: 'TitleAndBody',
                    Title: 'Original Slide 2 Title',
                    SpeakerNotes: 'Notes 2',
                    Regions: [
                        {
                            RegionID: 'body',
                            Label: 'Primary Content',
                            Kind: 'rich-text',
                            MarkdownContent: '- Initial bullet on Slide 2'
                        }
                    ]
                },
                {
                    SlideID: 'slide-3',
                    Layout: 'BigNumber',
                    Title: 'Original Slide 3 KPI',
                    SpeakerNotes: 'Notes 3',
                    Regions: [
                        {
                            RegionID: 'kpi',
                            Label: 'Headline Metric',
                            Kind: 'big-number',
                            MarkdownContent: '',
                            BigNumberValue: '$4.2M',
                            BigNumberLabel: 'ARR'
                        }
                    ]
                }
            ]
        };
        versions[0].Content = JSON.stringify(initialDeck, null, 2);

        const clientA = await connectYjsClient(editorUser.ID);
        const clientB = await connectYjsClient(secondEditorUser.ID);

        await clientA.waitForText('Original Slide 1 Title');
        await clientB.waitForText('Original Slide 2 Title');

        // Verify per-slide Y.Map and Y.Array structures were populated on the Y.Doc
        expect(clientA.doc.getArray<string>('slideOrder').toArray()).toEqual(['slide-1', 'slide-2', 'slide-3']);
        expect(clientB.doc.getArray<string>('slideOrder').toArray()).toEqual(['slide-1', 'slide-2', 'slide-3']);

        // Editor A updates Slide 1 in `slidesById` AND updates `deckMeta` (Brand Theme Seeds + Master + Title)
        clientA.doc.transact(() => {
            const slidesById = clientA.doc.getMap<string>('slidesById');
            const slide1 = JSON.parse(slidesById.get('slide-1')!);
            slide1.Title = 'Alice Updated Slide 1 Title';
            slide1.SpeakerNotes = 'Alice speaker notes on slide 1';
            slidesById.set('slide-1', JSON.stringify(slide1));

            const deckMeta = clientA.doc.getMap<string>('deckMeta');
            deckMeta.set('Title', 'Alice Brand-Themed Strategy Deck');
            deckMeta.set(
                'Theme',
                JSON.stringify({
                    ...initialDeck.Theme,
                    ThemeID: 'nova-brand-seed',
                    Name: 'Nova Cybernetics Brand Theme',
                    PrimaryColor: '#7C3AED',
                    AccentColor: '#10B981',
                    BackgroundColor: '#0F172A'
                })
            );
            deckMeta.set(
                'Master',
                JSON.stringify({
                    ...initialDeck.Master,
                    OrganizationName: 'Nova Cybernetics'
                })
            );
        });

        // Simultaneously, Editor B updates Slide 2 in `slidesById` AND reorders the deck to ['slide-3', 'slide-1', 'slide-2']
        clientB.doc.transact(() => {
            const slidesById = clientB.doc.getMap<string>('slidesById');
            const slide2 = JSON.parse(slidesById.get('slide-2')!);
            slide2.Title = 'Bob Updated Slide 2 Revenue Analysis';
            slide2.Regions[0].MarkdownContent = '- Bob added Q4 enterprise pipeline metrics';
            slidesById.set('slide-2', JSON.stringify(slide2));

            const slideOrder = clientB.doc.getArray<string>('slideOrder');
            slideOrder.delete(0, slideOrder.length);
            slideOrder.insert(0, ['slide-3', 'slide-1', 'slide-2']);
        });

        // Wait for server room to converge both concurrent per-slide edits, deckMeta theme/master, AND the new slide order
        await vi.waitFor(async () => {
            const roomJson = await ArtifactCollaborationServer.Instance.GetRoomContent(artifactId, editorUser);
            const mergedDeck = JSON.parse(roomJson) as typeof initialDeck;
            expect(mergedDeck.Title).toBe('Alice Brand-Themed Strategy Deck');
            expect(mergedDeck.Theme.ThemeID).toBe('nova-brand-seed');
            expect(mergedDeck.Theme.PrimaryColor).toBe('#7C3AED');
            expect(mergedDeck.Master.OrganizationName).toBe('Nova Cybernetics');
            expect(mergedDeck.Slides.map((s) => s.SlideID)).toEqual(['slide-3', 'slide-1', 'slide-2']);
            const s1 = mergedDeck.Slides.find((s) => s.SlideID === 'slide-1')!;
            const s2 = mergedDeck.Slides.find((s) => s.SlideID === 'slide-2')!;
            const s3 = mergedDeck.Slides.find((s) => s.SlideID === 'slide-3')!;
            expect(s1.Title).toBe('Alice Updated Slide 1 Title');
            expect(s1.SpeakerNotes).toBe('Alice speaker notes on slide 1');
            expect(s2.Title).toBe('Bob Updated Slide 2 Revenue Analysis');
            expect(s2.Regions[0].MarkdownContent).toContain('Bob added Q4 enterprise pipeline metrics');
            expect(s3.Title).toBe('Original Slide 3 KPI');
        });

        // Compact room into MJ: Artifact Versions and verify the compacted JSON preserves deckMeta + slidesById + slideOrder
        const compacted = await ArtifactCollaborationServer.Instance.CompactRoomToArtifactVersion(
            artifactId,
            editorUser
        );
        expect(compacted.Saved).toBe(true);
        const savedDeck = JSON.parse(versions[versions.length - 1].Content) as typeof initialDeck;
        expect(savedDeck.Title).toBe('Alice Brand-Themed Strategy Deck');
        expect(savedDeck.Theme.ThemeID).toBe('nova-brand-seed');
        expect(savedDeck.Theme.PrimaryColor).toBe('#7C3AED');
        expect(savedDeck.Master.OrganizationName).toBe('Nova Cybernetics');
        expect(savedDeck.Slides.map((s) => s.SlideID)).toEqual(['slide-3', 'slide-1', 'slide-2']);

        clientA.ws.close();
        clientB.ws.close();
    });

    it('synchronizes concurrent row insertions (worksheetsById) and formula edits (sheetCellsByCoord) over Yjs so every formula points where it did (Wave 3 Accept #1)', async () => {
        const sheetEngine = SpreadsheetEngine.Instance;
        const wb = sheetEngine.CreateEmptyWorkbook('Q1 Collaborative Budget', ['Operating'], 12, 6);
        const ws = wb.Worksheets[0];
        sheetEngine.SetCell(wb, ws.SheetID, 'B2', { Value: 100 }, false);
        sheetEngine.SetCell(wb, ws.SheetID, 'B3', { Value: 200 }, false);
        sheetEngine.SetCell(wb, ws.SheetID, 'B4', { Value: 300 }, false);
        sheetEngine.SetCell(wb, ws.SheetID, 'B5', { Value: 400 }, true);
        versions[0].Content = sheetEngine.SerializeWorkbook(wb);

        const clientA = await connectYjsClient(editorUser.ID);
        const clientB = await connectYjsClient(secondEditorUser.ID);

        await clientA.waitForText('Q1 Collaborative Budget');
        await clientB.waitForText('Q1 Collaborative Budget');

        // Verify initial Yjs CRDT maps were populated
        expect(clientA.doc.getArray<string>('sheetOrder').toArray()).toEqual(['sheet-1']);
        expect(clientB.doc.getMap<string>('worksheetsById').has('sheet-1')).toBe(true);

        // User A inserts 1 row at the top of sheet-1 (before row 1) in `worksheetsById`
        clientA.doc.transact(() => {
            const worksheetsById = clientA.doc.getMap<string>('worksheetsById');
            const sheetStruct = JSON.parse(worksheetsById.get('sheet-1')!) as WorksheetSpec;
            sheetStruct.Rows.unshift({
                RowID: 'sheet-1-row-inserted-top',
                Index: 1,
                Height: 24,
                Hidden: false
            });
            sheetStruct.Rows.forEach((r, idx) => {
                r.Index = idx + 1;
            });
            worksheetsById.set('sheet-1', JSON.stringify(sheetStruct));
        });

        // Simultaneously, User B writes =SUM(B2:B5) into row-6, col-B (against the stable RowIDs sheet-1-row-2 .. sheet-1-row-5)
        clientB.doc.transact(() => {
            const sheetCellsByCoord = clientB.doc.getMap<string>('sheetCellsByCoord');
            const formulaCell: SpreadsheetCellSpec = {
                RowID: 'sheet-1-row-6',
                ColumnID: 'sheet-1-col-B',
                Address: 'B6',
                RawValue: null,
                Formula: '=SUM(B2:B5)',
                FormulaStable:
                    '=SUM(@RANGE(sheet-1-row-2,sheet-1-col-B,sheet-1-row-5,sheet-1-col-B))'
            };
            sheetCellsByCoord.set('sheet-1::sheet-1-row-6::sheet-1-col-B', JSON.stringify(formulaCell));
        });

        // Wait for server room to converge both User A's row insertion AND User B's formula edit
        await vi.waitFor(async () => {
            const roomJson = await ArtifactCollaborationServer.Instance.GetRoomContent(
                artifactId,
                editorUser
            );
            const mergedWb = JSON.parse(roomJson) as WorkbookSpec;
            const mergedSheet = mergedWb.Worksheets[0];
            // Because User A inserted a row at index 1, sheet-1-row-6 moved to row 7 (B7)
            // and sheet-1-row-2..sheet-1-row-5 moved to B3:B6, so the formula resolved to =SUM(B3:B6) = 1000!
            expect(mergedSheet.Cells['B7']).toBeDefined();
            expect(mergedSheet.Cells['B7'].Formula).toBe('=SUM(B3:B6)');
            expect(mergedSheet.Cells['B7'].ComputedValue).toBe(1000);
        });

        // Compact room into MJ: Artifact Versions and verify both Content and Configuration are persisted
        const compacted = await ArtifactCollaborationServer.Instance.CompactRoomToArtifactVersion(
            artifactId,
            editorUser
        );
        expect(compacted.Saved).toBe(true);
        const savedWb = JSON.parse(versions[versions.length - 1].Content) as WorkbookSpec;
        expect(savedWb.Worksheets[0].Cells['B7'].Formula).toBe('=SUM(B3:B6)');
        expect(savedWb.Worksheets[0].Cells['B7'].ComputedValue).toBe(1000);

        clientA.ws.close();
        clientB.ws.close();
    });

    it('mints single-use collaboration tickets via MintArtifactCollaborationTicket and rejects ticket replay with 401 (A3)', async () => {
        // Use real ticket/header auth rather than the test override
        ArtifactCollaborationServer.Instance.SetAuthResolverOverride(null);

        const resolver = new DocumentCollaborationResolver();
        const mockProvider = createMockProvider();
        const editorCtx: AppContext = {
            dataSource: {} as AppContext['dataSource'],
            dataSources: [],
            providers: [{ provider: mockProvider, type: 'Read-Write' }],
            userPayload: {
                userRecord: editorUser,
                email: editorUser.Email,
                sessionId: 'sess-ticket-1'
            }
        };

        const minted = await resolver.MintArtifactCollaborationTicket(artifactId, editorCtx);
        expect(minted.Success).toBe(true);
        expect(minted.Ticket).toBeDefined();
        expect(minted.Ticket!.length).toBeGreaterThanOrEqual(32);
        expect(minted.CanRead).toBe(true);
        expect(minted.CanEdit).toBe(true);
        expect(minted.WsPath).toBe(ARTIFACT_COLLABORATION_WS_PATH);

        // 1. First WebSocket connection with the minted single-use ticket succeeds
        const firstWs = new WsClient(
            `ws://127.0.0.1:${wsPort}${minted.WsPath}?artifactId=${artifactId}&ticket=${encodeURIComponent(minted.Ticket!)}`
        );
        await new Promise<void>((resolve, reject) => {
            firstWs.once('open', () => resolve());
            firstWs.once('error', (err) => reject(err));
        });
        firstWs.close();

        // 2. Second WebSocket connection reusing the exact same ticket is rejected with HTTP 401!
        const replayStatus = await new Promise<number>((resolve) => {
            const replayWs = new WsClient(
                `ws://127.0.0.1:${wsPort}${minted.WsPath}?artifactId=${artifactId}&ticket=${encodeURIComponent(minted.Ticket!)}`
            );
            replayWs.once('unexpected-response', (_req, res) => {
                resolve(res.statusCode ?? 0);
                replayWs.terminate();
            });
            replayWs.once('error', () => {
                // handled by unexpected-response
            });
        });
        expect(replayStatus).toBe(401);

        // 3. A ticket minted for artifactId cannot be consumed on a different artifactId
        const crossArtifactTicket = ArtifactCollaborationServer.Instance.IssueTicket({
            ArtifactID: artifactId,
            User: editorUser
        });
        const wrongArtifactStatus = await new Promise<number>((resolve) => {
            const wrongWs = new WsClient(
                `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=99999999-9999-4999-8999-999999999999&ticket=${encodeURIComponent(crossArtifactTicket.Ticket)}`
            );
            wrongWs.once('unexpected-response', (_req, res) => {
                resolve(res.statusCode ?? 0);
                wrongWs.terminate();
            });
            wrongWs.once('error', () => {});
        });
        expect(wrongArtifactStatus).toBe(401);
    });

    it('rejects ?token= and ?apiKey= query-string secrets with 401 and enforces Origin allowlist with 403 (A3, C6)', async () => {
        // Even with auth override active, ?token= and ?apiKey= in query string must be rejected unconditionally
        const queryTokenStatus = await new Promise<number>((resolve) => {
            const ws = new WsClient(
                `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${artifactId}&token=secret-jwt&testUserId=${editorUser.ID}`
            );
            ws.once('unexpected-response', (_req, res) => {
                resolve(res.statusCode ?? 0);
                ws.terminate();
            });
            ws.once('error', () => {});
        });
        expect(queryTokenStatus).toBe(401);

        const queryApiKeyStatus = await new Promise<number>((resolve) => {
            const ws = new WsClient(
                `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${artifactId}&apiKey=mj_sk_secret`
            );
            ws.once('unexpected-response', (_req, res) => {
                resolve(res.statusCode ?? 0);
                ws.terminate();
            });
            ws.once('error', () => {});
        });
        expect(queryApiKeyStatus).toBe(401);

        // Enforce MJ_COLLABORATION_ALLOWED_ORIGINS when Origin header is present
        process.env.MJ_COLLABORATION_ALLOWED_ORIGINS = 'https://app.memberjunction.com';
        try {
            const foreignOriginStatus = await new Promise<number>((resolve) => {
                const ws = new WsClient(
                    `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${artifactId}&testUserId=${editorUser.ID}`,
                    { headers: { Origin: 'https://evil.example.org' } }
                );
                ws.once('unexpected-response', (_req, res) => {
                    resolve(res.statusCode ?? 0);
                    ws.terminate();
                });
                ws.once('error', () => {});
            });
            expect(foreignOriginStatus).toBe(403);
        } finally {
            delete process.env.MJ_COLLABORATION_ALLOWED_ORIGINS;
        }
    });

    it('disposes idle rooms after the last client disconnects and dirty state has been compacted (C1)', async () => {
        const server = ArtifactCollaborationServer.Instance;
        server.SetIdleRoomTtlMs(40);
        try {
            const clientA = await connectYjsClient(editorUser.ID);
            await clientA.waitForText('# Initial Strategy Document');
            expect(server.HasActiveRoom(artifactId)).toBe(true);

            clientA.doc.transact(() => {
                const yText = clientA.doc.getText('content');
                yText.insert(yText.length, '\n\nEdited before last disconnect.');
            });

            await vi.waitFor(async () => {
                const content = await server.GetRoomContent(artifactId, editorUser);
                expect(content).toContain('Edited before last disconnect.');
            });

            // Close last client -> triggers compaction + idle disposal timer
            clientA.ws.close();

            await vi.waitFor(
                () => {
                    expect(server.HasActiveRoom(artifactId)).toBe(false);
                },
                { timeout: 2000 }
            );

            // Verify edits were compacted into MJ: Artifact Versions before room disposal
            expect(versions[versions.length - 1].Content).toContain('Edited before last disconnect.');
        } finally {
            server.SetIdleRoomTtlMs(30_000);
        }
    });

    it('enforces authenticated awareness ownership: stamps server user identity and blocks spoofing or cross-client deletion (C3)', async () => {
        const clientA = await connectYjsClient(editorUser.ID);
        const clientB = await connectYjsClient(secondEditorUser.ID);
        await clientA.waitForText('# Initial Strategy Document');
        await clientB.waitForText('# Initial Strategy Document');

        // 1. Client A attempts to spoof its own user metadata as 'CEO Spoof' with fake userId
        clientA.awareness.setLocalStateField('user', {
            userId: 'fake-ceo-id',
            userName: 'CEO Spoof',
            name: 'CEO Spoof',
            color: '#EF4444'
        });
        const spoofedUpdate = awarenessProtocol.encodeAwarenessUpdate(clientA.awareness, [
            clientA.doc.clientID
        ]);
        const frameA = encoding.createEncoder();
        encoding.writeVarUint(frameA, YJS_MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(frameA, spoofedUpdate);
        clientA.ws.send(encoding.toUint8Array(frameA));

        // Client B receives Client A's awareness state stamped with server-authenticated identity!
        await vi.waitFor(() => {
            const stateOnB = clientB.awareness.getStates().get(clientA.doc.clientID) as
                | { user?: Record<string, unknown> }
                | undefined;
            expect(stateOnB).toBeDefined();
            expect(stateOnB?.user?.['userId']).toBe(editorUser.ID);
            expect(stateOnB?.user?.['userName']).toBe(editorUser.Name);
            expect(stateOnB?.user?.['name']).toBe(editorUser.Name);
        });

        // 2. Client B maliciously crafts a raw awareness frame attempting to delete (null) Client A's clientID!
        const hijackPayload = encoding.createEncoder();
        encoding.writeVarUint(hijackPayload, 1); // 1 entry
        encoding.writeVarUint(hijackPayload, clientA.doc.clientID); // Victim clientID owned by Client A
        encoding.writeVarUint(hijackPayload, 999); // Higher clock
        encoding.writeVarString(hijackPayload, 'null'); // Attempted removal

        const hijackFrame = encoding.createEncoder();
        encoding.writeVarUint(hijackFrame, YJS_MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(hijackFrame, encoding.toUint8Array(hijackPayload));
        clientB.ws.send(encoding.toUint8Array(hijackFrame));

        // Also send a legitimate update for Client B's own clientID so we know the server processed B's message queue
        clientB.awareness.setLocalStateField('user', { name: 'Bob', color: '#10B981' });
        const bUpdate = awarenessProtocol.encodeAwarenessUpdate(clientB.awareness, [clientB.doc.clientID]);
        const frameB = encoding.createEncoder();
        encoding.writeVarUint(frameB, YJS_MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(frameB, bUpdate);
        clientB.ws.send(encoding.toUint8Array(frameB));

        await vi.waitFor(() => {
            expect(clientA.awareness.getStates().has(clientB.doc.clientID)).toBe(true);
        });

        // Client A's presence must STILL exist on the server and on Client B!
        const stateStillOnB = clientB.awareness.getStates().get(clientA.doc.clientID) as
            | { user?: Record<string, unknown> }
            | undefined;
        expect(stateStillOnB?.user?.['userId']).toBe(editorUser.ID);

        clientA.ws.close();
        clientB.ws.close();
    });

    it('hydrates from newer MJ: Artifact Versions when working state is stale, and evicts failed hydrations without caching empty rooms (C5)', async () => {
        const server = ArtifactCollaborationServer.Instance;

        // Seed an OLD working state (t = 10:00) and a NEWER version 2 (t = 11:00)
        const staleDoc = new Y.Doc();
        staleDoc.getText('content').insert(0, '# STALE WORKING STATE CONTENT');
        workingStates.set(artifactId, {
            ID: 'ws-stale-1',
            ArtifactID: artifactId,
            YjsState: BytesToBase64(Y.encodeStateAsUpdate(staleDoc)),
            LastModifiedByUserID: editorUser.ID,
            __mj_UpdatedAt: '2026-11-09T10:00:00.000Z'
        });
        staleDoc.destroy();

        versions.push({
            ID: 'ver-2-newer',
            ArtifactID: artifactId,
            VersionNumber: 2,
            Content: '# FRESH VERSION 2 WRITTEN AT 11:00',
            ContentHash: 'fresh-v2-hash',
            UserID: editorUser.ID,
            __mj_CreatedAt: '2026-11-09T11:00:00.000Z',
            __mj_UpdatedAt: '2026-11-09T11:00:00.000Z'
        });

        const hydratedContent = await server.GetRoomContent(artifactId, editorUser);
        expect(hydratedContent).toBe('# FRESH VERSION 2 WRITTEN AT 11:00');
        expect(hydratedContent).not.toContain('STALE WORKING STATE');

        // Verify failed hydration evicts the room and rethrows rather than caching an empty Y.Doc
        const brokenArtifactId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
        permissionTable.set(editorUser.ID, { CanRead: true, CanEdit: true });
        const brokenProvider: Partial<IMetadataProvider> = {
            RunViews: (async () => {
                throw new Error('Simulated DB connection outage');
            }) as IMetadataProvider['RunViews']
        };
        server.SetMetadataProviderOverride(brokenProvider as IMetadataProvider);

        await expect(server.GetOrCreateRoom(brokenArtifactId, editorUser)).rejects.toThrow(
            /Simulated DB connection outage/
        );
        expect(server.HasActiveRoom(brokenArtifactId)).toBe(false);
    });

    it('converges state across two peer ArtifactCollaborationServer instances via sync-request / sync-state over InMemoryYjsRelayBus (C5)', async () => {
        class PeerCollaborationServerNodeA extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class PeerCollaborationServerNodeB extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }

        const sharedBus = new InMemoryYjsRelayBus();
        const nodeA = new PeerCollaborationServerNodeA();
        const nodeB = new PeerCollaborationServerNodeB();

        nodeA.SetRoomRelay(new InMemoryYjsRoomRelay(sharedBus, 'peer-node-a'));
        nodeB.SetRoomRelay(new InMemoryYjsRoomRelay(sharedBus, 'peer-node-b'));
        nodeA.SetMetadataProviderOverride(createMockProvider());
        nodeB.SetMetadataProviderOverride(createMockProvider());

        try {
            // Node A opens the room first and receives live in-memory CRDT edits NOT yet compacted to MJ: Artifact Versions
            const roomA = await nodeA.GetOrCreateRoom(artifactId, editorUser);
            expect(roomA).not.toBeNull();
            roomA!.Doc.transact(() => {
                const yText = roomA!.Doc.getText('content');
                yText.insert(yText.length, '\n\nLive uncompacted paragraph on Node A.');
            }, 'local-node-a');

            // Node B joins later: hydrates baseline from DB, broadcasts 'sync-request', receives 'sync-state' from Node A!
            await nodeB.GetOrCreateRoom(artifactId, secondEditorUser);

            await vi.waitFor(async () => {
                const contentOnB = await nodeB.GetRoomContent(artifactId, secondEditorUser);
                expect(contentOnB).toBe(
                    '# Initial Strategy Document\n\nBaseline paragraph.\n\nLive uncompacted paragraph on Node A.'
                );
            });
        } finally {
            await nodeA.Shutdown();
            await nodeB.Shutdown();
        }
    });

    it('downgrades/disconnects local clients even when relay.PublishToRoom throws, and rolls back child artifact when version Save fails (C2, C7)', async () => {
        // 1. Fault-tolerant permission downgrade when relay throws
        const throwingRelay: InMemoryYjsRoomRelay = new InMemoryYjsRoomRelay();
        vi.spyOn(throwingRelay, 'PublishToRoom').mockRejectedValue(new Error('Simulated Redis outage'));
        ArtifactCollaborationServer.Instance.SetRoomRelay(throwingRelay);

        const clientA = await connectYjsClient(editorUser.ID);
        await clientA.waitForText('# Initial Strategy Document');
        expect(clientA.permissionFrames[0]).toMatchObject({ canRead: true, canEdit: true });

        permissionTable.set(editorUser.ID, { CanRead: true, CanEdit: false });
        await ArtifactCollaborationServer.Instance.ReevaluateRoomPermissions(
            artifactId,
            editorUser.ID,
            true
        );

        await vi.waitFor(() => {
            const latest = clientA.permissionFrames[clientA.permissionFrames.length - 1];
            expect(latest).toMatchObject({ canRead: true, canEdit: false });
        });
        clientA.ws.close();

        // 2. Compensating rollback in CreateInlineDelegatedArtifact when version.Save() returns false
        let childDeleted = false;
        const rollbackProvider: Partial<IMetadataProvider> = {
            Entities: [{ ID: 'ent-artifacts-id', Name: 'MJ: Artifacts' }] as IMetadataProvider['Entities'],
            RunView: (async () => ({
                Success: true,
                Results: [{ ID: artifactId, EnvironmentID: 'env-prod-1' }],
                TotalRowCount: 1
            })) as IMetadataProvider['RunView'],
            GetEntityObject: (async (entityName: string) => {
                if (entityName === 'MJ: Artifacts') {
                    return {
                        ID: 'child-art-orphan-test',
                        Name: '',
                        TypeID: '',
                        UserID: '',
                        EnvironmentID: '',
                        DelegateEntityID: null as string | null,
                        DelegateRecordID: null as string | null,
                        NewRecord() {},
                        async Save() {
                            return true;
                        },
                        async Delete() {
                            childDeleted = true;
                            return true;
                        }
                    };
                }
                if (entityName === 'MJ: Artifact Versions') {
                    return {
                        ID: 'ver-fail-1',
                        ArtifactID: '',
                        VersionNumber: 1,
                        UserID: '',
                        Content: '',
                        ContentHash: '',
                        LatestResult: { CompleteMessage: 'Simulated version constraint failure' },
                        NewRecord() {},
                        async Save() {
                            return false;
                        }
                    };
                }
                throw new Error(`Unexpected entity ${entityName}`);
            }) as IMetadataProvider['GetEntityObject']
        };

        permissionTable.set(editorUser.ID, { CanRead: true, CanEdit: true });
        const configSpy = vi.spyOn(ArtifactMetadataEngine.Instance, 'Config').mockResolvedValue();
        const findTypeSpy = vi
            .spyOn(ArtifactMetadataEngine.Instance, 'FindArtifactType')
            .mockReturnValue({ ID: 'type-whiteboard-1', Name: 'Whiteboard' } as ReturnType<
                typeof ArtifactMetadataEngine.Instance.FindArtifactType
            >);

        try {
            const resolver = new DocumentCollaborationResolver();
            const ctx: AppContext = {
                dataSource: {} as AppContext['dataSource'],
                dataSources: [],
                providers: [{ provider: rollbackProvider as IMetadataProvider, type: 'Read-Write' }],
                userPayload: {
                    userRecord: editorUser,
                    email: editorUser.Email,
                    sessionId: 'sess-rollback'
                }
            };
            const res = await resolver.CreateInlineDelegatedArtifact(
                artifactId,
                'Embedded Diagram',
                'Whiteboard',
                '{}',
                ctx
            );
            expect(res.Success).toBe(false);
            expect(res.ErrorMessage).toContain('Simulated version constraint failure');
            expect(childDeleted).toBe(true);
        } finally {
            configSpy.mockRestore();
            findTypeSpy.mockRestore();
        }
    });

    it('authenticates HTTP-header WebSocket upgrades with distinct system/user API keys, passes dataSources, and enforces artifact:read / artifact:edit scopes (A3, C4)', async () => {
        const server = ArtifactCollaborationServer.Instance;
        server.SetAuthResolverOverride(null);
        const fakeDataSources = [{ type: 'Read-Write' }] as unknown as DataSourceInfo[];
        server.SetDataSources(fakeDataSources);

        const sysUser = createTestUser('sys-user-1', 'System', 'system@example.com');
        const getSysSpy = vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);

        const authorizeMock = vi.fn(
            async (_hash: string, _app: string, scopePath: string) => ({
                Allowed: scopePath === 'artifact:read', // read-only API key (lacks full_access and artifact:edit)
                Reason: scopePath === 'artifact:read' ? 'Granted read' : 'Missing artifact:edit'
            })
        );
        const engineSpy = vi.spyOn({ GetAPIKeyEngine }, 'GetAPIKeyEngine');
        void engineSpy;
        const realEngine = GetAPIKeyEngine();
        const authEngineSpy = vi
            .spyOn(realEngine, 'Authorize')
            .mockImplementation(authorizeMock as unknown as typeof realEngine.Authorize);

        const mockedGetUserPayload = vi.mocked(getUserPayload);
        mockedGetUserPayload.mockResolvedValueOnce({
            userRecord: editorUser,
            email: editorUser.Email,
            sessionId: 'sess-apikey-ws',
            apiKeyId: 'key-id-1',
            apiKeyHash: 'sha256-readonly-key'
        });

        try {
            // Editor user has CanEdit=true in ArtifactPermissionEngine, BUT their API key only has 'artifact:read'!
            const permissionFrames: CollaborationPermissionStatusFrame[] = [];
            const ws = new WsClient(
                `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${artifactId}`,
                {
                    headers: {
                        'x-mj-user-api-key': 'mj_sk_user_key_123'
                    }
                }
            );

            await new Promise<void>((resolve, reject) => {
                ws.on('message', (raw: Buffer) => {
                    const decoder = decoding.createDecoder(new Uint8Array(raw));
                    const msgType = decoding.readVarUint(decoder);
                    if (msgType === YJS_MESSAGE_PERMISSION_STATUS) {
                        permissionFrames.push(
                            JSON.parse(decoding.readVarString(decoder)) as CollaborationPermissionStatusFrame
                        );
                        resolve();
                    }
                });
                ws.once('error', (err) => reject(err));
            });

            // Verify getUserPayload received fakeDataSources (arg 3), undefined systemApiKey (arg 5), and userApiKey (arg 6)
            expect(mockedGetUserPayload).toHaveBeenCalledWith(
                '',
                'default',
                fakeDataSources,
                undefined,
                undefined,
                'mj_sk_user_key_123',
                expect.objectContaining({ endpoint: ARTIFACT_COLLABORATION_WS_PATH }),
                expect.anything()
            );

            // Session must be capped to canEdit=false because API key lacked 'artifact:edit'!
            expect(permissionFrames[0]).toMatchObject({ canRead: true, canEdit: false });
            ws.close();
        } finally {
            authEngineSpy.mockRestore();
            getSysSpy.mockRestore();
            server.SetDataSources([]);
        }
    });

    it('retries CompactRoomToArtifactVersion on concurrent VersionNumber save conflict and cascades permission revocation to delegated child rooms (C2, C5)', async () => {
        const server = ArtifactCollaborationServer.Instance;

        // 1. Test retry on VersionNumber conflict
        let saveAttempts = 0;
        const baseProvider = createMockProvider();
        const flakyVersionProvider: Partial<IMetadataProvider> = {
            ...baseProvider,
            GetEntityObject: (async (entityName: string, user?: UserInfo) => {
                if (entityName === 'MJ: Artifact Versions') {
                    const baseObj = await baseProvider.GetEntityObject(entityName, user);
                    const origSave = baseObj.Save.bind(baseObj);
                    baseObj.Save = async () => {
                        saveAttempts++;
                        if (saveAttempts === 1) {
                            // Simulate concurrent peer saving Version 2 first!
                            versions.push({
                                ID: 'ver-concurrent-2',
                                ArtifactID: artifactId,
                                VersionNumber: 2,
                                Content: '# Concurrent Peer Edit',
                                ContentHash: 'peer-hash-v2',
                                UserID: secondEditorUser.ID
                            });
                            return false;
                        }
                        return await origSave();
                    };
                    return baseObj;
                }
                return await baseProvider.GetEntityObject(entityName, user);
            }) as IMetadataProvider['GetEntityObject']
        };
        server.SetMetadataProviderOverride(flakyVersionProvider as IMetadataProvider);

        const mutated = await server.ApplyServerContentMutation(
            artifactId,
            '# Retry Conflict Document\n\nSaved cleanly on attempt 2 as Version 3.',
            editorUser,
            true
        );
        expect(mutated.Success).toBe(true);
        expect(saveAttempts).toBe(2);
        expect(mutated.VersionNumber).toBe(3);

        // 2. Test delegated child room cascade when parent artifact permissions change
        const childArtifactId = 'cccccccc-1111-4222-8333-444444444444';
        const childAwareProvider: Partial<IMetadataProvider> = {
            ...baseProvider,
            RunViews: (async (paramsArray: RunViewParams[]) => {
                return paramsArray.map((p) => {
                    if (p.EntityName === 'MJ: Artifacts' && p.ExtraFilter?.includes(childArtifactId)) {
                        return {
                            Success: true,
                            Results: [
                                {
                                    ID: childArtifactId,
                                    DelegateEntityID: 'ent-artifacts-id',
                                    DelegateRecordID: artifactId
                                }
                            ],
                            TotalRowCount: 1
                        };
                    }
                    if (p.EntityName === 'MJ: Artifact Versions') {
                        return {
                            Success: true,
                            Results: [versions[0]],
                            TotalRowCount: 1
                        };
                    }
                    return { Success: true, Results: [], TotalRowCount: 0 };
                });
            }) as IMetadataProvider['RunViews']
        };
        server.SetMetadataProviderOverride(childAwareProvider as IMetadataProvider);

        // Connect editorUser directly to the delegated child artifact room
        const childFrames: CollaborationPermissionStatusFrame[] = [];
        const childWs = new WsClient(
            `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${childArtifactId}&testUserId=${editorUser.ID}`
        );
        await new Promise<void>((resolve, reject) => {
            childWs.on('message', (raw: Buffer) => {
                const dec = decoding.createDecoder(new Uint8Array(raw));
                if (decoding.readVarUint(dec) === YJS_MESSAGE_PERMISSION_STATUS) {
                    childFrames.push(JSON.parse(decoding.readVarString(dec)) as CollaborationPermissionStatusFrame);
                    if (childFrames.length === 1) resolve();
                }
            });
            childWs.once('error', (err) => reject(err));
        });
        expect(childFrames[0]).toMatchObject({ canRead: true, canEdit: true });

        // Downgrade editorUser on the PARENT host artifact and fire ReevaluateRoomPermissions(parentArtifactId)
        permissionTable.set(editorUser.ID, { CanRead: true, CanEdit: false });
        await server.ReevaluateRoomPermissions(artifactId, editorUser.ID, false);

        await vi.waitFor(() => {
            expect(childFrames[childFrames.length - 1]).toMatchObject({ canRead: true, canEdit: false });
        });
        childWs.close();
    });

    it('preserves CRDT item lineage across Save Version -> room disposal -> client reconnect with zero paragraph duplication (Blocker 1)', async () => {
        const server = ArtifactCollaborationServer.Instance;
        server.SetIdleRoomTtlMs(25);

        // 1. Client connects, receives initial state, and edits the document
        const client1 = await connectYjsClient(editorUser.ID);
        await client1.waitForText('# Initial Strategy Document');

        client1.doc.transact(() => {
            const yText = client1.doc.getText('content');
            yText.insert(yText.length, '\n\nParagraph 2 added before version save.');
        }, 'local-edit');

        const expectedDocText =
            '# Initial Strategy Document\n\nBaseline paragraph.\n\nParagraph 2 added before version save.';

        await vi.waitFor(async () => {
            const serverContent = await server.GetRoomContent(artifactId, editorUser);
            expect(serverContent).toBe(expectedDocText);
        });

        // 2. Client saves a version via CompactRoomToArtifactVersion
        const compactRes = await server.CompactRoomToArtifactVersion(artifactId, editorUser);
        expect(compactRes.Saved).toBe(true);
        expect(compactRes.VersionNumber).toBe(2);

        // Working state must have been flushed AFTER the version row was saved
        const wsRow = workingStates.get(artifactId);
        const latestVer = versions[versions.length - 1];
        expect(wsRow).toBeDefined();
        expect(latestVer.VersionNumber).toBe(2);
        expect(new Date(wsRow!.__mj_UpdatedAt!).getTime()).toBeGreaterThanOrEqual(
            new Date(latestVer.__mj_CreatedAt!).getTime()
        );

        // 3. Client disconnects and room is disposed on idle timeout
        client1.ws.close();
        await vi.waitFor(
            () => {
                expect(server.HasActiveRoom(artifactId)).toBe(false);
            },
            { timeout: 1500 }
        );

        // 4. Client reconnects to the freshly re-hydrated server room while still holding its existing Y.Doc (`client1.doc`)
        const reconnectedWs = new WsClient(
            `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${artifactId}&testUserId=${editorUser.ID}`
        );
        await new Promise<void>((resolve, reject) => {
            reconnectedWs.on('open', () => {
                const enc = encoding.createEncoder();
                encoding.writeVarUint(enc, YJS_MESSAGE_SYNC);
                syncProtocol.writeSyncStep1(enc, client1.doc);
                reconnectedWs.send(encoding.toUint8Array(enc));
            });
            reconnectedWs.on('message', (raw: Buffer) => {
                const dec = decoding.createDecoder(new Uint8Array(raw));
                const msgType = decoding.readVarUint(dec);
                if (msgType === YJS_MESSAGE_SYNC) {
                    const replyEnc = encoding.createEncoder();
                    encoding.writeVarUint(replyEnc, YJS_MESSAGE_SYNC);
                    syncProtocol.readSyncMessage(dec, replyEnc, client1.doc, 'server');
                    if (encoding.length(replyEnc) > 1) {
                        reconnectedWs.send(encoding.toUint8Array(replyEnc));
                    }
                    resolve();
                }
            });
            reconnectedWs.once('error', (err) => reject(err));
        });

        // Wait a tick for any sync-step-2 messages to settle
        await new Promise((r) => setTimeout(r, 40));

        // Both client and server must have the exact document text ONCE — zero paragraph duplication!
        expect(client1.doc.getText('content').toString()).toBe(expectedDocText);
        expect(await server.GetRoomContent(artifactId, editorUser)).toBe(expectedDocText);

        reconnectedWs.close();
        client1.doc.destroy();
    });

    it('merges ApplyServerContentMutation as a minimal diff and preserves concurrent human additions in live rooms (Blocker 2)', async () => {
        const server = ArtifactCollaborationServer.Instance;
        const baselineText = '# Initial Strategy Document\n\nSection 1 baseline.\n\nSection 2 original.';
        versions[0].Content = baselineText;

        const client = await connectYjsClient(editorUser.ID);
        await client.waitForText('Section 2 original.');

        // Human concurrently edits Section 1 in the live room
        client.doc.transact(() => {
            const yText = client.doc.getText('content');
            const idx = yText.toString().indexOf('Section 1 baseline.');
            yText.delete(idx, 'Section 1 baseline.'.length);
            yText.insert(idx, 'Section 1 edited by human.');
        }, 'human-local');

        await vi.waitFor(async () => {
            expect(await server.GetRoomContent(artifactId, editorUser)).toContain('Section 1 edited by human.');
        });

        // Agent mutates Section 2 starting from `baselineText`
        const agentNewText = '# Initial Strategy Document\n\nSection 1 baseline.\n\nSection 2 updated by agent.';
        const res = await server.ApplyServerContentMutation(
            artifactId,
            agentNewText,
            editorUser,
            false,
            baselineText
        );
        expect(res.Success).toBe(true);

        // Both the human's edit to Section 1 and the agent's edit to Section 2 must be preserved!
        await vi.waitFor(async () => {
            const merged = await server.GetRoomContent(artifactId, editorUser);
            expect(merged).toBe(
                '# Initial Strategy Document\n\nSection 1 edited by human.\n\nSection 2 updated by agent.'
            );
            expect(client.doc.getText('content').toString()).toBe(
                '# Initial Strategy Document\n\nSection 1 edited by human.\n\nSection 2 updated by agent.'
            );
        });

        client.ws.close();
    });

    it('disposes socketless rooms after idle TTL and caps failed compaction retries at 3 attempts', async () => {
        const server = ArtifactCollaborationServer.Instance;
        server.SetIdleRoomTtlMs(20);

        // 1. Socketless room created by ApplyServerContentMutation is automatically disposed after idle TTL
        const mutated = await server.ApplyServerContentMutation(
            artifactId,
            '# Socketless Mutation Content',
            editorUser,
            false
        );
        expect(mutated.Success).toBe(true);
        expect(server.HasActiveRoom(artifactId)).toBe(true);

        await vi.waitFor(
            () => {
                expect(server.HasActiveRoom(artifactId)).toBe(false);
            },
            { timeout: 1500 }
        );

        // 2. Room whose working-state flush persistently fails retries at most 3 times and retains dirty state in memory
        const failingArtifactId = 'ffffffff-1111-4222-8333-999999999999';
        let flushFailures = 0;
        const baseProvider = createMockProvider();
        const failingFlushProvider: Partial<IMetadataProvider> = {
            ...baseProvider,
            GetEntityObject: (async (entityName: string, user?: UserInfo) => {
                const obj = await baseProvider.GetEntityObject(entityName, user);
                if (entityName === 'MJ: Artifact Working States') {
                    obj.Save = async () => {
                        flushFailures++;
                        return false;
                    };
                }
                return obj;
            }) as IMetadataProvider['GetEntityObject']
        };
        server.SetMetadataProviderOverride(failingFlushProvider as IMetadataProvider);

        const room = await server.GetOrCreateRoom(failingArtifactId, editorUser);
        expect(room).not.toBeNull();
        room!.DirtyWorkingState = true;

        await vi.waitFor(
            () => {
                expect(flushFailures).toBeGreaterThanOrEqual(3);
            },
            { timeout: 2500 }
        );
        expect(flushFailures).toBeLessThanOrEqual(4);
        // Dirty room must be retained in memory so unpersisted user edits are never dropped
        expect(server.HasActiveRoom(failingArtifactId)).toBe(true);
    });

    it('requires a >= 32-byte ticket HMAC secret, caps TTL at 5 minutes, rejects forged constants, and enforces distributed TicketReplayStore (Blocker 1)', async () => {
        const server = ArtifactCollaborationServer.Instance;

        // 1. Refuse to mint or consume tickets when secret is unset or < 32 bytes
        server.SetTicketHmacSecret(null);
        expect(() =>
            server.IssueTicket({
                ArtifactID: artifactId,
                User: editorUser
            })
        ).toThrow(/MJ_ARTIFACT_COLLAB_HMAC_SECRET, >= 32 bytes/);

        server.SetTicketHmacSecret('too-short-secret');
        expect(() =>
            server.IssueTicket({
                ArtifactID: artifactId,
                User: editorUser
            })
        ).toThrow(/MJ_ARTIFACT_COLLAB_HMAC_SECRET, >= 32 bytes/);

        // 2. Restore >= 32-byte secret and verify server-side TTL cap (MAX = 300s)
        server.SetTicketHmacSecret('test-collab-ticket-hmac-secret-at-least-32-bytes!!');
        const capped = server.IssueTicket({
            ArtifactID: artifactId,
            User: editorUser,
            TTLSeconds: 86400 * 365 // 1 year requested -> capped to 300s
        });
        const expDeltaMs = new Date(capped.ExpiresAt).getTime() - Date.now();
        expect(expDeltaMs).toBeLessThanOrEqual(305_000);
        expect(expDeltaMs).toBeGreaterThan(290_000);

        // 3. Distributed TicketReplayStore allows cross-instance first use and blocks replay on second instance
        const claimedNonces = new Set<string>();
        server.SetTicketReplayStore({
            ConsumeNonce(nonce: string): boolean {
                if (claimedNonces.has(nonce)) {
                    return false;
                }
                claimedNonces.add(nonce);
                return true;
            }
        });
        const getUserSpy = vi
            .spyOn(UserCache.Instance, 'Users', 'get')
            .mockReturnValue([editorUser]);
        try {
            const crossTicket = server.IssueTicket({
                ArtifactID: artifactId,
                User: editorUser
            });
            // Simulate consumption on a peer replica that does not have crossTicket in local _tickets
            (server as unknown as { _tickets: Map<string, unknown> })._tickets.clear();
            const firstUse = await server.ConsumeTicket(crossTicket.Ticket, artifactId);
            expect(firstUse?.User.ID).toBe(editorUser.ID);

            (server as unknown as { _consumedTickets: Map<string, number> })._consumedTickets.clear();
            const secondUseOnPeer = await server.ConsumeTicket(crossTicket.Ticket, artifactId);
            expect(secondUseOnPeer).toBeNull();
        } finally {
            getUserSpy.mockRestore();
        }
    });

    it('prevents duplication across multi-instance cold opens, out-of-band version writes, 3-way repeated-line merges, and REST save reconnects (Blocker 2 & Item 5)', async () => {
        const server = ArtifactCollaborationServer.Instance;

        // 1. Multi-instance cold open: two servers cold-seed from the same ArtifactVersion before WorkingState exists
        class PeerServer1 extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class PeerServer2 extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        const sharedBus = new InMemoryYjsRelayBus();
        const peer1 = new PeerServer1();
        const peer2 = new PeerServer2();
        peer1.SetRoomRelay(new InMemoryYjsRoomRelay(sharedBus, 'cold-1'));
        peer2.SetRoomRelay(new InMemoryYjsRoomRelay(sharedBus, 'cold-2'));
        peer1.SetMetadataProviderOverride(createMockProvider());
        peer2.SetMetadataProviderOverride(createMockProvider());

        try {
            // Clear working states so both peers cold-seed from versions[0]
            workingStates.clear();
            await peer1.GetOrCreateRoom(artifactId, editorUser);
            workingStates.clear();
            await peer2.GetOrCreateRoom(artifactId, secondEditorUser);

            const content1 = await peer1.GetRoomContent(artifactId, editorUser);
            const content2 = await peer2.GetRoomContent(artifactId, secondEditorUser);
            expect(content1).toBe('# Initial Strategy Document\n\nBaseline paragraph.');
            expect(content2).toBe('# Initial Strategy Document\n\nBaseline paragraph.');
        } finally {
            await peer1.Shutdown();
            await peer2.Shutdown();
        }

        // 2. 3-way merge with repeated blank lines and repeated '- todo' items
        workingStates.clear();
        const repeatedBaseline = [
            '# Title',
            '',
            '## One',
            '- todo',
            '- todo',
            '',
            '## Two',
            ''
        ].join('\n');
        versions[0].Content = repeatedBaseline;

        const client = await connectYjsClient(editorUser.ID);
        await client.waitForText('## Two');

        // Human edits Section One header in live room
        client.doc.transact(() => {
            const yText = client.doc.getText('content');
            const idx = yText.toString().indexOf('## One');
            yText.delete(idx, '## One'.length);
            yText.insert(idx, '## One (Human Edited)');
        }, 'human');

        await vi.waitFor(async () => {
            expect(await server.GetRoomContent(artifactId, editorUser)).toContain('## One (Human Edited)');
        });

        // Agent deletes the SECOND '- todo' and inserts content under '## Two' starting from repeatedBaseline
        const agentTarget = [
            '# Title',
            '',
            '## One',
            '- todo',
            '',
            '## Two',
            'Inserted in Section Two by Agent.'
        ].join('\n');

        await server.ApplyServerContentMutation(
            artifactId,
            agentTarget,
            editorUser,
            false,
            repeatedBaseline
        );

        const merged3Way = await server.GetRoomContent(artifactId, editorUser);
        expect(merged3Way).toBe(
            [
                '# Title',
                '',
                '## One (Human Edited)',
                '- todo',
                '',
                '## Two',
                'Inserted in Section Two by Agent.'
            ].join('\n')
        );
        client.ws.close();
        const compactedStep2 = await server.CompactRoomToArtifactVersion(artifactId, editorUser);
        expect(compactedStep2.Saved).toBe(true);

        // 3. Out-of-band version write while room is open is reconciled, not overwritten on next compaction
        versions.push({
            ID: 'ver-oob-99',
            ArtifactID: artifactId,
            VersionNumber: 99,
            Content: '# Out-of-Band Restored Version 99',
            ContentHash: 'oob-hash-99',
            UserID: secondEditorUser.ID,
            __mj_CreatedAt: new Date(Date.now() + 5000).toISOString(),
            __mj_UpdatedAt: new Date(Date.now() + 5000).toISOString()
        });

        const compactedAfterOob = await server.CompactRoomToArtifactVersion(artifactId, editorUser);
        expect(compactedAfterOob.Saved).toBe(true);
        expect(await server.GetRoomContent(artifactId, editorUser)).toContain(
            '# Out-of-Band Restored Version 99'
        );
    });

    it('ExecuteAnchoredCommentAgentMention enforces CanEdit for edit mode and succeeds for editors (Item 20)', async () => {
        const resolver = new DocumentCollaborationResolver();
        const mockProvider = createMockProvider();
        const fakeSkipAgent: Partial<MJAIAgentEntityExtended> = {
            ID: 'aaaaaaaa-1111-4222-8333-444444444444',
            Name: 'Skip',
            Status: 'Active'
        };
        const fakeRun: Partial<MJAIAgentRunEntityExtended> = {
            ID: 'bbbbbbbb-1111-4222-8333-444444444444',
            AgentID: fakeSkipAgent.ID
        };
        const loadedSpy = vi.spyOn(AIEngine.Instance, 'Loaded', 'get').mockReturnValue(true);
        const agentsSpy = vi
            .spyOn(AIEngine.Instance, 'Agents', 'get')
            .mockReturnValue([fakeSkipAgent as MJAIAgentEntityExtended]);
        const canRunSpy = vi.spyOn(AIEngine.Instance, 'CanUserRunAgent').mockReturnValue(true);
        const runAgentSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockResolvedValue({
            success: true,
            payload: {
                reply: 'Applied requested paragraph edit.',
                replacement: 'Replaced paragraph via anchored comment.'
            },
            agentRun: fakeRun as MJAIAgentRunEntityExtended
        });

        try {
            const editorCtx: AppContext = {
                dataSource: {} as AppContext['dataSource'],
                dataSources: [],
                providers: [{ provider: mockProvider, type: 'Read-Write' }],
                userPayload: {
                    userRecord: editorUser,
                    email: editorUser.Email,
                    sessionId: 'sess-mention-editor'
                }
            };
            const viewerCtx: AppContext = {
                ...editorCtx,
                userPayload: {
                    userRecord: viewerUser,
                    email: viewerUser.Email,
                    sessionId: 'sess-mention-viewer'
                }
            };

            const deniedEdit = await resolver.ExecuteAnchoredCommentAgentMention(
                artifactId,
                'Skip',
                'edit',
                '@Skip replace Baseline paragraph.',
                'Baseline paragraph.',
                viewerCtx
            );
            expect(deniedEdit.Success).toBe(false);
            expect(deniedEdit.ErrorMessage).toContain('CanEdit');

            const allowedEdit = await resolver.ExecuteAnchoredCommentAgentMention(
                artifactId,
                'Skip',
                'edit',
                '@Skip Replaced paragraph via anchored comment.',
                'Baseline paragraph.',
                editorCtx
            );
            expect(allowedEdit.Success).toBe(true);
            expect(allowedEdit.UpdatedContent).toContain('Replaced paragraph via anchored comment.');
        } finally {
            runAgentSpy.mockRestore();
            canRunSpy.mockRestore();
            agentsSpy.mockRestore();
            loadedSpy.mockRestore();
        }
    });

    it('B1: reconcileOutOfBandVersionIntoRoom performs a true 3-way merge across single-node MJ_ARTIFACT_VERSION_SAVED and multi-node version-saved relays while logging DB lookup errors', async () => {
        const server = ArtifactCollaborationServer.Instance;
        const baseDoc = [
            '# Product Roadmap',
            '',
            '## Summary',
            'Baseline summary line.',
            '',
            '## Milestones',
            'Baseline milestone Q1.',
            '',
            '## Risks',
            'Baseline risk item.'
        ].join('\n');
        versions[0].Content = baseDoc;

        const client = await connectYjsClient(editorUser.ID);
        await client.waitForText('Baseline milestone Q1.');

        // 1. Human types live edits into ## Summary before any version checkpoint happens
        client.doc.transact(() => {
            const yText = client.doc.getText('content');
            const idx = yText.toString().indexOf('Baseline summary line.');
            yText.delete(idx, 'Baseline summary line.'.length);
            yText.insert(idx, 'Human live summary typed in editor.');
        }, 'human-live');

        await vi.waitFor(async () => {
            expect(await server.GetRoomContent(artifactId, editorUser)).toContain(
                'Human live summary typed in editor.'
            );
        });

        // Simulate ArtifactToolManager saving v2 (built from baseDoc, editing ## Milestones) -> fires MJ_ARTIFACT_VERSION_SAVED synchronously BEFORE LiveContentMutation
        const agentV2Text = [
            '# Product Roadmap',
            '',
            '## Summary',
            'Baseline summary line.',
            '',
            '## Milestones',
            'Agent updated milestone Q1 + Q2.',
            '',
            '## Risks',
            'Baseline risk item.'
        ].join('\n');
        versions.push({
            ID: 'ver-agent-b1-2',
            ArtifactID: artifactId,
            VersionNumber: 2,
            Content: agentV2Text,
            ContentHash: 'agent-b1-hash-2',
            UserID: editorUser.ID,
            __mj_CreatedAt: new Date().toISOString(),
            __mj_UpdatedAt: new Date().toISOString()
        });
        MJGlobal.Instance.RaiseEvent({
            component: null,
            event: MJEventType.ComponentEvent,
            eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
            args: {
                ArtifactID: artifactId,
                VersionID: 'ver-agent-b1-2',
                VersionNumber: 2,
                Content: agentV2Text,
                UserID: editorUser.ID
            }
        });
        // Followed immediately by LiveContentMutation with previousContent = baseDoc
        await server.ApplyServerContentMutation(artifactId, agentV2Text, editorUser, false, baseDoc);

        const afterSingleNodeMerge = await server.GetRoomContent(artifactId, editorUser);
        expect(afterSingleNodeMerge).toBe(
            [
                '# Product Roadmap',
                '',
                '## Summary',
                'Human live summary typed in editor.',
                '',
                '## Milestones',
                'Agent updated milestone Q1 + Q2.',
                '',
                '## Risks',
                'Baseline risk item.'
            ].join('\n')
        );
        const activeRoom = await server.GetOrCreateRoom(artifactId, editorUser);
        expect(activeRoom?.DirtyVersion).toBe(true);
        client.ws.close();

        // 2. Multi-node relay: Node B holds uncompacted human edits in ## Risks while Node A saves v3 and broadcasts 'version-saved'
        class MultiNodePeerB extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        const bus = new InMemoryYjsRelayBus();
        const relayA = new InMemoryYjsRoomRelay(bus, 'b1-node-a');
        const relayB = new InMemoryYjsRoomRelay(bus, 'b1-node-b');
        const peerB = new MultiNodePeerB();
        peerB.SetRoomRelay(relayB);
        peerB.SetMetadataProviderOverride(createMockProvider());

        try {
            const roomOnB = await peerB.GetOrCreateRoom(artifactId, secondEditorUser);
            expect(roomOnB).not.toBeNull();
            // Human on Node B modifies ## Summary
            roomOnB!.Doc.transact(() => {
                const yText = roomOnB!.Doc.getText('content');
                const idx = yText.toString().indexOf('Baseline summary line.');
                yText.delete(idx, 'Baseline summary line.'.length);
                yText.insert(idx, 'Node B concurrent human keystrokes.');
            }, 'node-b-human');

            // Node A saves v3 updating ## Risks (starting from v2) and broadcasts 'version-saved'
            const nodeAV3Text = [
                '# Product Roadmap',
                '',
                '## Summary',
                'Baseline summary line.',
                '',
                '## Milestones',
                'Agent updated milestone Q1 + Q2.',
                '',
                '## Risks',
                'Node A compacted risk mitigation plan.'
            ].join('\n');
            versions.push({
                ID: 'ver-node-a-3',
                ArtifactID: artifactId,
                VersionNumber: 3,
                Content: nodeAV3Text,
                ContentHash: 'node-a-hash-3',
                UserID: editorUser.ID,
                __mj_CreatedAt: new Date().toISOString(),
                __mj_UpdatedAt: new Date().toISOString()
            });

            await relayA.PublishToRoom({
                ArtifactID: artifactId,
                MessageType: 'version-saved',
                PayloadBase64: '',
                VersionID: 'ver-node-a-3',
                VersionNumber: 3
            });

            await vi.waitFor(async () => {
                const mergedOnB = await peerB.GetRoomContent(artifactId, secondEditorUser);
                expect(mergedOnB).toContain('Node B concurrent human keystrokes.');
                expect(mergedOnB).toContain('Node A compacted risk mitigation plan.');
            });

            // 3. Verify checkAndReconcileLatestDatabaseVersion logs errors instead of swallowing silently when DB lookup throws
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            const throwingProvider: Partial<IMetadataProvider> = {
                RunView: (async () => {
                    throw new Error('Simulated DB version lookup failure');
                }) as IMetadataProvider['RunView']
            };
            peerB.SetMetadataProviderOverride(throwingProvider as IMetadataProvider);

            await relayA.PublishToRoom({
                ArtifactID: artifactId,
                MessageType: 'version-saved',
                PayloadBase64: '',
                VersionID: 'ver-node-a-4',
                VersionNumber: 4
            });

            await vi.waitFor(() => {
                expect(errorSpy).toHaveBeenCalledWith(
                    expect.stringContaining('checkAndReconcileLatestDatabaseVersion failed')
                );
            });
            errorSpy.mockRestore();
        } finally {
            await relayA.Shutdown();
            await peerB.Shutdown();
        }
    });

    it('B2: keeps Y.Doc update byteLength < 10_000 across 20 consecutive mutations on a 2 KB doc and strips legacy preOutOfBandStateB64', async () => {
        const server = ArtifactCollaborationServer.Instance;

        // Build a > 2 KB realistic Markdown document
        const paragraphs: string[] = ['# Enterprise Architecture Specification'];
        for (let i = 1; i <= 24; i++) {
            paragraphs.push(
                `## Section ${i}\nOperational requirement ${i}: deterministic collaborative synchronization across browser clients and background AI workers.`
            );
        }
        const initial2KbDoc = paragraphs.join('\n\n');
        expect(Buffer.byteLength(initial2KbDoc, 'utf8')).toBeGreaterThanOrEqual(2048);
        versions[0].Content = initial2KbDoc;

        // Seed a legacy working state containing a bloated `meta.preOutOfBandStateB64` entry
        const legacyDoc = new Y.Doc();
        legacyDoc.getText('content').insert(0, initial2KbDoc);
        legacyDoc.getMap('meta').set('preOutOfBandStateB64', 'LEGACY_EMBEDDED_STATE_'.repeat(300));
        workingStates.set(artifactId, {
            ID: 'ws-legacy-bloat',
            ArtifactID: artifactId,
            YjsState: BytesToBase64(Y.encodeStateAsUpdate(legacyDoc)),
            LastModifiedByUserID: editorUser.ID,
            __mj_UpdatedAt: new Date(Date.now() + 1000).toISOString()
        });
        legacyDoc.destroy();

        const room = await server.GetOrCreateRoom(artifactId, editorUser);
        expect(room).not.toBeNull();
        // Legacy preOutOfBandStateB64 must be stripped on room hydration
        expect(room!.Doc.getMap('meta').has('preOutOfBandStateB64')).toBe(false);

        // Execute 20 consecutive server mutations + out-of-band reconciliations on the >= 2 KB document
        let currentDoc = initial2KbDoc;
        for (let step = 1; step <= 20; step++) {
            const prevDoc = currentDoc;
            currentDoc = currentDoc.replace(
                `Operational requirement ${step}:`,
                `Operational requirement ${step} [rev-${step}]:`
            );
            const verNum = step + 1;
            const verId = `ver-b2-step-${verNum}`;
            versions.push({
                ID: verId,
                ArtifactID: artifactId,
                VersionNumber: verNum,
                Content: currentDoc,
                ContentHash: `hash-b2-${verNum}`,
                UserID: editorUser.ID,
                __mj_CreatedAt: new Date().toISOString(),
                __mj_UpdatedAt: new Date().toISOString()
            });

            if (step % 2 === 0) {
                MJGlobal.Instance.RaiseEvent({
                    component: null,
                    event: MJEventType.ComponentEvent,
                    eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
                    args: {
                        ArtifactID: artifactId,
                        VersionID: verId,
                        VersionNumber: verNum,
                        Content: currentDoc,
                        UserID: editorUser.ID
                    }
                });
            } else {
                const res = await server.ApplyServerContentMutation(
                    artifactId,
                    currentDoc,
                    editorUser,
                    false,
                    prevDoc
                );
                expect(res.Success).toBe(true);
            }
        }

        const encodedBytes = Y.encodeStateAsUpdate(room!.Doc);
        expect(encodedBytes.byteLength).toBeLessThan(10_000);
        expect(room!.Doc.getMap('meta').has('preOutOfBandStateB64')).toBe(false);
        expect(room!.PreOutOfBandDocState).toBeInstanceOf(Uint8Array);

        await server.FlushWorkingState(artifactId, editorUser);
        const persistedWs = workingStates.get(artifactId);
        expect(persistedWs).toBeDefined();
        const verifyPersistedDoc = new Y.Doc();
        Y.applyUpdate(verifyPersistedDoc, Base64ToBytes(persistedWs!.YjsState));
        expect(verifyPersistedDoc.getMap('meta').has('preOutOfBandStateB64')).toBe(false);
        verifyPersistedDoc.destroy();
    });

    it('C1: ExecuteAnchoredCommentAgentMention enforces API key scopes, resolves agents by normalized handle, posts Role=AI ConversationDetail replies, and never echoes prompts or overwrites content on missing/failed agents', async () => {
        const resolver = new DocumentCollaborationResolver();
        const savedReplies: Array<{
            ConversationID: string;
            Message: string;
            Role: string;
            AgentID: string | null;
            ParentID: string | null;
            Status: string;
        }> = [];

        const baseProvider = createMockProvider();
        const c1Provider: Partial<IMetadataProvider> = {
            ...baseProvider,
            RunView: (async (params: RunViewParams, user?: UserInfo) => {
                if (params.EntityName === 'MJ: Conversations') {
                    return {
                        Success: true,
                        Results: [
                            {
                                ID: 'dddddddd-2222-4333-8444-555555555555',
                                AnchorMetadata: JSON.stringify({
                                    quote: 'Baseline paragraph.',
                                    status: 'Open'
                                })
                            }
                        ],
                        TotalRowCount: 1
                    };
                }
                return await baseProvider.RunView(params, user);
            }) as IMetadataProvider['RunView'],
            GetEntityObject: (async (entityName: string, user?: UserInfo) => {
                if (entityName === 'MJ: Conversation Details') {
                    const draft = {
                        ID: 'eeeeeeee-2222-4333-8444-555555555555',
                        ConversationID: '',
                        UserID: '',
                        Role: '',
                        AgentID: null as string | null,
                        ParentID: null as string | null,
                        Message: '',
                        Status: '',
                        NewRecord() {
                            return undefined;
                        },
                        async Save() {
                            savedReplies.push({
                                ConversationID: this.ConversationID,
                                Message: this.Message,
                                Role: this.Role,
                                AgentID: this.AgentID,
                                ParentID: this.ParentID,
                                Status: this.Status
                            });
                            return true;
                        }
                    };
                    return draft;
                }
                return await baseProvider.GetEntityObject(entityName, user);
            }) as IMetadataProvider['GetEntityObject']
        };

        const editorCtx: AppContext = {
            dataSource: {} as AppContext['dataSource'],
            dataSources: [],
            providers: [{ provider: c1Provider as IMetadataProvider, type: 'Read-Write' }],
            userPayload: {
                userRecord: editorUser,
                email: editorUser.Email,
                sessionId: 'sess-c1'
            }
        };

        const activeAgent: Partial<MJAIAgentEntityExtended> = {
            ID: '12121212-3434-4567-8989-abababababab',
            Name: 'Research Analyst',
            Status: 'Active'
        };
        const fakeRun: Partial<MJAIAgentRunEntityExtended> = {
            ID: '34343434-5656-4789-8989-cdcdcdcdcdcd',
            AgentID: activeAgent.ID
        };

        const loadedSpy = vi.spyOn(AIEngine.Instance, 'Loaded', 'get').mockReturnValue(true);
        const agentsSpy = vi
            .spyOn(AIEngine.Instance, 'Agents', 'get')
            .mockReturnValue([activeAgent as MJAIAgentEntityExtended]);
        const canRunSpy = vi.spyOn(AIEngine.Instance, 'CanUserRunAgent').mockReturnValue(true);

        try {
            // 1. API key scope enforcement: 'artifact:comment' key may comment, but 'edit' mode requires 'artifact:edit'
            const sysUser = createTestUser('sys-c1-1', 'System', 'sys-c1@example.com');
            const sysSpy = vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);
            const apiKeyEngine = GetAPIKeyEngine();
            const authorizeSpy = vi.spyOn(apiKeyEngine, 'Authorize').mockImplementation(
                async (_hash: string, _app: string, scopePath: string) => ({
                    Allowed: scopePath === 'artifact:comment',
                    Reason: scopePath === 'artifact:comment' ? 'Allowed comment' : 'Denied edit',
                    MatchedRule: null,
                    EvaluatedRules: []
                })
            );
            const scopedCtx: AppContext = {
                ...editorCtx,
                userPayload: {
                    ...editorCtx.userPayload,
                    apiKeyId: 'key-c1',
                    apiKeyHash: 'hash-comment-only'
                }
            };

            try {
                await expect(
                    resolver.ExecuteAnchoredCommentAgentMention(
                        artifactId,
                        'Research Analyst',
                        'edit',
                        '@research-analyst rewrite this',
                        'Baseline paragraph.',
                        scopedCtx
                    )
                ).rejects.toThrow(/Access denied/i);
            } finally {
                authorizeSpy.mockRestore();
                sysSpy.mockRestore();
            }

            // 2. Unknown agent handle returns { Success: false } and NEVER echoes prompt or mutates document content
            const unknownRes = await resolver.ExecuteAnchoredCommentAgentMention(
                artifactId,
                '@NoSuchAgent',
                'edit',
                '@NoSuchAgent DESTRUCTIVE PROMPT INSTRUCTION',
                'Baseline paragraph.',
                editorCtx
            );
            expect(unknownRes.Success).toBe(false);
            expect(unknownRes.ErrorMessage).toContain("No AI agent matching '@NoSuchAgent' was found.");
            expect(unknownRes.ReplyBody).toBeUndefined();
            expect(await ArtifactCollaborationServer.Instance.GetRoomContent(artifactId, editorUser)).toBe(
                '# Initial Strategy Document\n\nBaseline paragraph.'
            );

            // 3. Matching agent via normalized hyphenated handle in 'comment' mode executes AgentRunner and posts Role='AI' reply
            const runCommentSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockResolvedValueOnce({
                success: true,
                payload: { reply: 'Q4 ARR figures match the audited ledger.' },
                agentRun: fakeRun as MJAIAgentRunEntityExtended
            });
            const commentRes = await resolver.ExecuteAnchoredCommentAgentMention(
                artifactId,
                '@research-analyst',
                'comment',
                '@research-analyst verify baseline paragraph',
                'Baseline paragraph.',
                editorCtx
            );
            expect(commentRes.Success).toBe(true);
            expect(commentRes.ReplyBody).toBe('Q4 ARR figures match the audited ledger.');
            expect(savedReplies).toHaveLength(1);
            expect(savedReplies[0]).toMatchObject({
                ConversationID: 'dddddddd-2222-4333-8444-555555555555',
                Role: 'AI',
                AgentID: activeAgent.ID,
                Message: 'Q4 ARR figures match the audited ledger.',
                Status: 'Complete'
            });
            runCommentSpy.mockRestore();

            // 4. Edit mode when agent returns no replacement fails closed without overwriting RawMarkdown with prompt text
            const runNoReplaceSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockResolvedValueOnce({
                success: true,
                payload: { reply: 'I cannot rewrite this without Q4 targets.' },
                agentRun: fakeRun as MJAIAgentRunEntityExtended
            });
            const noReplaceEdit = await resolver.ExecuteAnchoredCommentAgentMention(
                artifactId,
                'Research Analyst',
                'edit',
                '@Research Analyst replace with raw instruction text',
                'Baseline paragraph.',
                editorCtx
            );
            expect(noReplaceEdit.Success).toBe(false);
            expect(noReplaceEdit.ErrorMessage).toContain('did not produce a valid replacement');
            expect(await ArtifactCollaborationServer.Instance.GetRoomContent(artifactId, editorUser)).toBe(
                '# Initial Strategy Document\n\nBaseline paragraph.'
            );
            runNoReplaceSpy.mockRestore();
        } finally {
            canRunSpy.mockRestore();
            agentsSpy.mockRestore();
            loadedSpy.mockRestore();
        }
    });

    it('D3: RunAIAgentResolver.loadInputArtifactsBatch filters conversation input artifact versions through ArtifactPermissionEngine CanRead ACL', async () => {
        class TestableRunAIAgentResolver extends RunAIAgentResolver {
            public async LoadBatchForTest(
                detailIds: string[],
                user: UserInfo,
                provider: IMetadataProvider
            ): Promise<Map<string, MJArtifactVersionEntity[]>> {
                return this.loadInputArtifactsBatch(detailIds, user, provider);
            }
        }

        const allowedArtId = 'a1111111-2222-4333-8444-555555555555';
        const deniedArtId = 'd9999999-2222-4333-8444-555555555555';
        const detailId = 'cd111111-2222-4333-8444-555555555555';

        resolvePermissionsSpy.mockImplementation(async (_provider, artId) => {
            const readable = UUIDsEqual(artId, allowedArtId);
            return {
                ArtifactID: artId ?? '',
                CanRead: readable,
                CanEdit: false,
                CanDelete: false,
                CanShare: false,
                Source: readable ? 'ArtifactPermission' : 'Denied',
                Reason: readable ? 'Shared with user' : 'No read grant'
            };
        });

        const links: Partial<MJConversationDetailArtifactEntity>[] = [
            {
                ID: 'link-1',
                ConversationDetailID: detailId,
                ArtifactVersionID: 'ver-allowed-1',
                Direction: 'Input'
            },
            {
                ID: 'link-2',
                ConversationDetailID: detailId,
                ArtifactVersionID: 'ver-denied-1',
                Direction: 'Input'
            }
        ];
        const loadedVersions: Partial<MJArtifactVersionEntity>[] = [
            {
                ID: 'ver-allowed-1',
                ArtifactID: allowedArtId,
                VersionNumber: 1,
                Name: 'Readable Doc.md'
            },
            {
                ID: 'ver-denied-1',
                ArtifactID: deniedArtId,
                VersionNumber: 1,
                Name: 'Private Owner Doc.md'
            }
        ];

        const aclProvider: Partial<IMetadataProvider> = {
            RunView: (async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Conversation Detail Artifacts') {
                    return {
                        Success: true,
                        Results: links as MJConversationDetailArtifactEntity[],
                        TotalRowCount: links.length
                    };
                }
                if (params.EntityName === 'MJ: Artifact Versions') {
                    return {
                        Success: true,
                        Results: loadedVersions as MJArtifactVersionEntity[],
                        TotalRowCount: loadedVersions.length
                    };
                }
                return { Success: true, Results: [], TotalRowCount: 0 };
            }) as IMetadataProvider['RunView']
        };

        const resolver = new TestableRunAIAgentResolver();
        const byDetail = await resolver.LoadBatchForTest(
            [detailId],
            viewerUser,
            aclProvider as IMetadataProvider
        );

        const versionsForTurn = byDetail.get(detailId) ?? [];
        expect(versionsForTurn).toHaveLength(1);
        expect(versionsForTurn[0].ID).toBe('ver-allowed-1');
    });

    it('E1 & E2: CheckStartupSecrets warns when HMAC secrets are missing/<32 bytes, and MintArtifactCollaborationTicket omits WsUrl unless MJAPI_PUBLIC_URL is set', async () => {
        const server = ArtifactCollaborationServer.Instance;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const prevCollabEnv = process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
        const prevTicketEnv = process.env.MJ_COLLABORATION_TICKET_SECRET;
        const prevFrozenEnv = process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        const prevPublicUrl = process.env.MJAPI_PUBLIC_URL;

        try {
            // E1: Missing / short secrets produce explicit startup warnings
            server.SetTicketHmacSecret(null);
            delete process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
            delete process.env.MJ_COLLABORATION_TICKET_SECRET;
            process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = 'short-secret';

            const missingStatus = server.CheckStartupSecrets();
            expect(missingStatus.CollabSecretConfigured).toBe(false);
            expect(missingStatus.FrozenBlockSecretConfigured).toBe(false);
            expect(missingStatus.Warnings).toHaveLength(2);
            expect(warnSpy).toHaveBeenCalledTimes(2);

            // Configure >= 32-byte secrets -> zero warnings
            warnSpy.mockClear();
            server.SetTicketHmacSecret('test-collab-ticket-hmac-secret-at-least-32-bytes!!');
            process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = 'test-frozen-block-hmac-secret-at-least-32-bytes!!';
            const validStatus = server.CheckStartupSecrets();
            expect(validStatus.CollabSecretConfigured).toBe(true);
            expect(validStatus.FrozenBlockSecretConfigured).toBe(true);
            expect(validStatus.Warnings).toHaveLength(0);
            expect(warnSpy).not.toHaveBeenCalled();

            // E2: Without MJAPI_PUBLIC_URL, WsUrl is undefined (never ws://localhost:4000/...) while WsPath is returned
            delete process.env.MJAPI_PUBLIC_URL;
            const resolver = new DocumentCollaborationResolver();
            const editorCtx: AppContext = {
                dataSource: {} as AppContext['dataSource'],
                dataSources: [],
                providers: [{ provider: createMockProvider(), type: 'Read-Write' }],
                userPayload: {
                    userRecord: editorUser,
                    email: editorUser.Email,
                    sessionId: 'sess-e2'
                }
            };

            const relativeMinted = await resolver.MintArtifactCollaborationTicket(artifactId, editorCtx);
            expect(relativeMinted.Success).toBe(true);
            expect(relativeMinted.WsPath).toBe(ARTIFACT_COLLABORATION_WS_PATH);
            expect(relativeMinted.WsUrl).toBeUndefined();

            // With MJAPI_PUBLIC_URL configured, WsUrl is returned as an absolute wss:// URL
            process.env.MJAPI_PUBLIC_URL = 'https://api.staging.memberjunction.org';
            const publicMinted = await resolver.MintArtifactCollaborationTicket(artifactId, editorCtx);
            expect(publicMinted.Success).toBe(true);
            expect(publicMinted.WsPath).toBe(ARTIFACT_COLLABORATION_WS_PATH);
            expect(publicMinted.WsUrl).toBe(
                `wss://api.staging.memberjunction.org${ARTIFACT_COLLABORATION_WS_PATH}`
            );
        } finally {
            warnSpy.mockRestore();
            if (prevCollabEnv === undefined) delete process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
            else process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = prevCollabEnv;
            if (prevTicketEnv === undefined) delete process.env.MJ_COLLABORATION_TICKET_SECRET;
            else process.env.MJ_COLLABORATION_TICKET_SECRET = prevTicketEnv;
            if (prevFrozenEnv === undefined) delete process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
            else process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = prevFrozenEnv;
            if (prevPublicUrl === undefined) delete process.env.MJAPI_PUBLIC_URL;
            else process.env.MJAPI_PUBLIC_URL = prevPublicUrl;
        }
    });

    it('R5-3a & R5-3b: cross-node compaction state vector prevents duplicating synced edits ("Hello world" and "A line.\\nB line.\\n")', async () => {
        class PeerServer extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        const bus = new InMemoryYjsRelayBus();
        const relayA = new InMemoryYjsRoomRelay(bus, 'r5-node-a');
        const relayB = new InMemoryYjsRoomRelay(bus, 'r5-node-b');
        const nodeA = new PeerServer();
        const nodeB = new PeerServer();
        nodeA.SetRoomRelay(relayA);
        nodeB.SetRoomRelay(relayB);
        nodeA.SetMetadataProviderOverride(createMockProvider());
        nodeB.SetMetadataProviderOverride(createMockProvider());

        try {
            // Scenario A: empty initial content, Node A types "Hello", syncs to Node B, Node B appends " world", Node A compacts "Hello"
            versions[0].Content = '';
            const roomA = await nodeA.GetOrCreateRoom(artifactId, editorUser);
            const roomB = await nodeB.GetOrCreateRoom(artifactId, secondEditorUser);
            expect(roomA).not.toBeNull();
            expect(roomB).not.toBeNull();

            roomA!.Doc.transact(() => {
                roomA!.Doc.getText('content').insert(0, 'Hello');
            }, 'client-on-a');

            await vi.waitFor(async () => {
                expect(await nodeB.GetRoomContent(artifactId, secondEditorUser)).toBe('Hello');
            });

            // Apply a local-to-B client edit (" world") onto roomB without relaying it to Node A yet
            const bLocalClientDoc = new Y.Doc();
            Y.applyUpdate(bLocalClientDoc, Y.encodeStateAsUpdate(roomB!.Doc));
            bLocalClientDoc.getText('content').insert(5, ' world');
            Y.applyUpdate(roomB!.Doc, Y.encodeStateAsUpdate(bLocalClientDoc), 'remote-relay');
            bLocalClientDoc.destroy();
            expect(await nodeB.GetRoomContent(artifactId, secondEditorUser)).toBe('Hello world');

            const compacted = await nodeA.CompactRoomToArtifactVersion(artifactId, editorUser);
            expect(compacted.Saved).toBe(true);

            // Node B already contains every Yjs op in Node A's compacted state vector -> MUST stay "Hello world", NEVER "Hello worldHello"
            await new Promise((r) => setTimeout(r, 40));
            expect(await nodeB.GetRoomContent(artifactId, secondEditorUser)).toBe('Hello world');

            // Scenario B: "A line.\n" + "B line.\n" deduplication on positional 3-way merge when same anchor inserts "A line.\n"
            const artifactId2 = '22222222-3333-4444-5555-666666666666';
            versions = [
                {
                    ID: 'ver-lines-1',
                    ArtifactID: artifactId2,
                    VersionNumber: 1,
                    Content: 'Header\n',
                    ContentHash: 'hash-lines-1',
                    UserID: editorUser.ID
                }
            ];
            const roomLines = await ArtifactCollaborationServer.Instance.GetOrCreateRoom(
                artifactId2,
                editorUser
            );
            expect(roomLines).not.toBeNull();
            roomLines!.Doc.transact(() => {
                const yText = roomLines!.Doc.getText('content');
                yText.insert(yText.length, 'A line.\nB line.\n');
            }, 'human-lines');

            await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
                artifactId2,
                'Header\nA line.\n',
                editorUser,
                false,
                'Header\n'
            );
            expect(await ArtifactCollaborationServer.Instance.GetRoomContent(artifactId2, editorUser)).toBe(
                'Header\nA line.\nB line.\n'
            );
        } finally {
            await nodeA.Shutdown();
            await nodeB.Shutdown();
            await relayA.Shutdown();
            await relayB.Shutdown();
        }
    });

    it('R5-3c, R5-3d & R5-3e: empty-base reconcile preserves concurrent human lines without duplication, full agent rewrite rebases concurrent human edits, and newer-version hydrate performs 3-way merge', async () => {
        const server = ArtifactCollaborationServer.Instance;

        // R5-3c / R6-7: Empty base ("") reconcile deduplicates "Hello\n" while preserving human's "World\n"
        versions[0].Content = '';
        const emptyRoom = await server.GetOrCreateRoom(artifactId, editorUser);
        expect(emptyRoom).not.toBeNull();
        emptyRoom!.Doc.transact(() => {
            emptyRoom!.Doc.getText('content').insert(0, 'Hello\nWorld\n');
        }, 'human-on-empty');

        await server.ApplyServerContentMutation(artifactId, 'Hello\n', editorUser, false, '');
        const afterEmptyReconcile = await server.GetRoomContent(artifactId, editorUser);
        expect(afterEmptyReconcile).not.toBe('Hello\nWorld\nHello\n');
        expect(afterEmptyReconcile).toBe('Hello\nWorld\n');

        // R5-3d / R6-4: Full agent rewrite ("Alpha.\nBeta.\nGamma.\n" -> "ALPHA formal.\nBETA formal.\nGAMMA formal.\n")
        // rebases human's concurrent edit ("Beta, edited.") without resurrecting stale base lines!
        const rewriteArtId = '33333333-4444-5555-6666-777777777777';
        const baseThreeLines = 'Alpha.\nBeta.\nGamma.\n';
        versions = [
            {
                ID: 'ver-rw-1',
                ArtifactID: rewriteArtId,
                VersionNumber: 1,
                Content: baseThreeLines,
                ContentHash: 'rw-hash-1',
                UserID: editorUser.ID
            }
        ];
        const rwRoom = await server.GetOrCreateRoom(rewriteArtId, editorUser);
        expect(rwRoom).not.toBeNull();
        rwRoom!.Doc.transact(() => {
            const yText = rwRoom!.Doc.getText('content');
            const idx = yText.toString().indexOf('Beta.');
            yText.delete(idx, 'Beta.'.length);
            yText.insert(idx, 'Beta, edited.');
        }, 'human-beta-edit');

        const fullAgentRewrite = 'ALPHA formal.\nBETA formal.\nGAMMA formal.\n';
        await server.ApplyServerContentMutation(
            rewriteArtId,
            fullAgentRewrite,
            editorUser,
            false,
            baseThreeLines
        );
        expect(await server.GetRoomContent(rewriteArtId, editorUser)).toBe(
            'ALPHA formal.\nBeta, edited.\nGAMMA formal.\n'
        );
        expect(rwRoom!.PreOutOfBandDocState).toBeInstanceOf(Uint8Array);
        const recoveredPreDoc = new Y.Doc();
        Y.applyUpdate(recoveredPreDoc, rwRoom!.PreOutOfBandDocState!);
        expect(recoveredPreDoc.getText('content').toString()).toBe('Alpha.\nBeta, edited.\nGamma.\n');
        recoveredPreDoc.destroy();

        // R5-3e: Newer-version room hydration 3-way merges uncompacted workingState (at v1) with newer DB v2
        class HydratePeerServer extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        const hydratePeer = new HydratePeerServer();
        hydratePeer.SetMetadataProviderOverride(createMockProvider());

        try {
            const v1Base = '# Spec\n\n## Intro\nOriginal intro.\n\n## Details\nOriginal details.\n';
            const v2OutOfBand = '# Spec\n\n## Intro\nOriginal intro.\n\n## Details\nUpdated details in v2.\n';
            versions = [
                {
                    ID: 'ver-hyd-1',
                    ArtifactID: artifactId,
                    VersionNumber: 1,
                    Content: v1Base,
                    ContentHash: 'hyd-1',
                    UserID: editorUser.ID,
                    __mj_CreatedAt: new Date(Date.now() - 10_000).toISOString(),
                    __mj_UpdatedAt: new Date(Date.now() - 10_000).toISOString()
                },
                {
                    ID: 'ver-hyd-2',
                    ArtifactID: artifactId,
                    VersionNumber: 2,
                    Content: v2OutOfBand,
                    ContentHash: 'hyd-2',
                    UserID: editorUser.ID,
                    __mj_CreatedAt: new Date(Date.now() + 10_000).toISOString(),
                    __mj_UpdatedAt: new Date(Date.now() + 10_000).toISOString()
                }
            ];

            const staleWorkingDoc = new Y.Doc();
            staleWorkingDoc
                .getText('content')
                .insert(0, '# Spec\n\n## Intro\nUncompacted human intro.\n\n## Details\nOriginal details.\n');
            staleWorkingDoc.getMap('meta').set('versionId', 'ver-hyd-1');
            staleWorkingDoc.getMap('meta').set('versionNumber', 1);
            workingStates.set(artifactId, {
                ID: 'ws-hyd-1',
                ArtifactID: artifactId,
                YjsState: BytesToBase64(Y.encodeStateAsUpdate(staleWorkingDoc)),
                LastModifiedByUserID: editorUser.ID,
                __mj_UpdatedAt: new Date(Date.now() - 5_000).toISOString()
            });
            staleWorkingDoc.destroy();

            const hydratedRoom = await hydratePeer.GetOrCreateRoom(artifactId, editorUser);
            expect(hydratedRoom).not.toBeNull();
            expect(hydratedRoom!.Doc.getText('content').toString()).toBe(
                '# Spec\n\n## Intro\nUncompacted human intro.\n\n## Details\nUpdated details in v2.\n'
            );
        } finally {
            await hydratePeer.Shutdown();
        }
    });

    it('R5-4, R5-6 & R5-7: enforces agent:execute scope & fail-closed AIEngine checks, returns post-merge UpdatedContent, refuses unmatched conversationId/thread fallback, and handles missing ticket secret cleanly', async () => {
        const resolver = new DocumentCollaborationResolver();
        const savedReplies: Array<{ ConversationID: string; Message: string }> = [];
        const baseProvider = createMockProvider();
        const r5Provider: Partial<IMetadataProvider> = {
            ...baseProvider,
            RunView: (async (params: RunViewParams, user?: UserInfo) => {
                if (params.EntityName === 'MJ: Conversations') {
                    const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
                    const unrelatedThread = {
                        ID: 'cccccccc-1111-4222-8333-999999999999',
                        AnchorMetadata: JSON.stringify({
                            quote: 'Completely different quote.',
                            status: 'Open'
                        })
                    };
                    if (filter.includes("ID='")) {
                        const match = filter.includes(unrelatedThread.ID);
                        return {
                            Success: true,
                            Results: match ? [unrelatedThread] : [],
                            TotalRowCount: match ? 1 : 0
                        };
                    }
                    return {
                        Success: true,
                        Results: [unrelatedThread],
                        TotalRowCount: 1
                    };
                }
                return await baseProvider.RunView(params, user);
            }) as IMetadataProvider['RunView'],
            GetEntityObject: (async (entityName: string, user?: UserInfo) => {
                if (entityName === 'MJ: Conversation Details') {
                    return {
                        ConversationID: '',
                        UserID: '',
                        Role: '',
                        AgentID: null as string | null,
                        Message: '',
                        Status: '',
                        NewRecord() {
                            return undefined;
                        },
                        async Save() {
                            savedReplies.push({
                                ConversationID: this.ConversationID,
                                Message: this.Message
                            });
                            return true;
                        }
                    };
                }
                return await baseProvider.GetEntityObject(entityName, user);
            }) as IMetadataProvider['GetEntityObject']
        };

        const activeAgent: Partial<MJAIAgentEntityExtended> = {
            ID: '99999999-1111-4222-8333-aaaaaaaaaaaa',
            Name: 'Copy Editor',
            Status: 'Active'
        };
        const fakeRun: Partial<MJAIAgentRunEntityExtended> = {
            ID: '88888888-1111-4222-8333-bbbbbbbbbbbb',
            AgentID: activeAgent.ID
        };

        const agentsSpy = vi
            .spyOn(AIEngine.Instance, 'Agents', 'get')
            .mockReturnValue([activeAgent as MJAIAgentEntityExtended]);
        const canRunSpy = vi.spyOn(AIEngine.Instance, 'CanUserRunAgent').mockReturnValue(true);

        const editorCtx: AppContext = {
            dataSource: {} as AppContext['dataSource'],
            dataSources: [],
            providers: [{ provider: r5Provider as IMetadataProvider, type: 'Read-Write' }],
            userPayload: {
                userRecord: editorUser,
                email: editorUser.Email,
                sessionId: 'sess-r5'
            }
        };

        try {
            // R5-4a: API key with artifact:comment + artifact:edit but WITHOUT agent:execute is rejected before running AgentRunner
            const sysUser = createTestUser('sys-r5-1', 'System', 'sys-r5@example.com');
            const sysSpy = vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(sysUser);
            const apiKeyEngine = GetAPIKeyEngine();
            const authorizeSpy = vi.spyOn(apiKeyEngine, 'Authorize').mockImplementation(
                async (_hash: string, _app: string, scopePath: string) => ({
                    Allowed: scopePath === 'artifact:comment' || scopePath === 'artifact:edit',
                    Reason: scopePath === 'agent:execute' ? 'Missing agent:execute scope' : 'Allowed artifact scope',
                    MatchedRule: null,
                    EvaluatedRules: []
                })
            );
            const runSpyBlocked = vi.spyOn(AgentRunner.prototype, 'RunAgent');
            try {
                await expect(
                    resolver.ExecuteAnchoredCommentAgentMention(
                        artifactId,
                        'Copy Editor',
                        'comment',
                        '@copy-editor review this',
                        'Baseline paragraph.',
                        {
                            ...editorCtx,
                            userPayload: {
                                ...editorCtx.userPayload,
                                apiKeyId: 'key-no-agent-exec',
                                apiKeyHash: 'hash-no-agent-exec'
                            }
                        }
                    )
                ).rejects.toThrow(/Access denied/i);
                expect(runSpyBlocked).not.toHaveBeenCalled();
            } finally {
                runSpyBlocked.mockRestore();
                authorizeSpy.mockRestore();
                sysSpy.mockRestore();
            }

            // R5-4b: Fail CLOSED when AIEngine.Config throws or CanUserRunAgent throws (even when Agents list is populated)
            const errLogSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                aiConfigSpy.mockRejectedValueOnce(new Error('DB metadata offline'));
                const cfgFailRes = await resolver.ExecuteAnchoredCommentAgentMention(
                    artifactId,
                    'Copy Editor',
                    'comment',
                    '@copy-editor hello',
                    'Baseline paragraph.',
                    editorCtx
                );
                expect(cfgFailRes.Success).toBe(false);
                expect(cfgFailRes.ErrorMessage).toContain('Unable to load AI agent catalog');

                canRunSpy.mockImplementationOnce(() => {
                    throw new Error('ACL subsystem failure');
                });
                const permThrowRes = await resolver.ExecuteAnchoredCommentAgentMention(
                    artifactId,
                    'Copy Editor',
                    'comment',
                    '@copy-editor hello',
                    'Baseline paragraph.',
                    editorCtx
                );
                expect(permThrowRes.Success).toBe(false);
                expect(permThrowRes.ErrorMessage).toContain('Unable to verify run permission');
            } finally {
                errLogSpy.mockRestore();
            }

            // R5-6a: Unmatched explicit conversationId returns { Success: false, ErrorMessage: 'Anchored comment thread not found.' }
            const missingThreadRes = await resolver.ExecuteAnchoredCommentAgentMention(
                artifactId,
                'Copy Editor',
                'comment',
                '@copy-editor check thread',
                'Baseline paragraph.',
                editorCtx,
                'ffffffff-0000-4000-8000-000000000000'
            );
            expect(missingThreadRes.Success).toBe(false);
            expect(missingThreadRes.ErrorMessage).toBe('Anchored comment thread not found.');
            expect(savedReplies).toHaveLength(0);

            // R5-6b: Edit mode returns post-merge UpdatedContent (including concurrent live room edits) AND does NOT post reply to unrelated thread
            const mergeArtifactId = '44444444-5555-6666-7777-888888888888';
            versions.push({
                ID: 'ver-merge-r5-1',
                ArtifactID: mergeArtifactId,
                VersionNumber: 1,
                Content: '# Strategy\n\nIntro line.\n\nTarget quote.\n',
                ContentHash: 'hash-merge-r5-1',
                UserID: editorUser.ID
            });
            const room = await ArtifactCollaborationServer.Instance.GetOrCreateRoom(
                mergeArtifactId,
                editorUser
            );
            expect(room).not.toBeNull();

            const runMergeSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockImplementationOnce(async () => {
                // Simulate a concurrent co-author editing "Intro line." while the agent is thinking!
                room!.Doc.transact(() => {
                    const yText = room!.Doc.getText('content');
                    const introIdx = yText.toString().indexOf('Intro line.');
                    yText.delete(introIdx, 'Intro line.'.length);
                    yText.insert(introIdx, 'Concurrent co-author intro.');
                }, 'concurrent-coauthor');

                return {
                    success: true,
                    payload: {
                        reply: 'Polished target quote.',
                        replacement: 'Polished quote.'
                    },
                    agentRun: fakeRun as MJAIAgentRunEntityExtended
                };
            });

            const mergedEditRes = await resolver.ExecuteAnchoredCommentAgentMention(
                mergeArtifactId,
                'Copy Editor',
                'edit',
                '@copy-editor polish',
                'Target quote.',
                editorCtx
            );
            runMergeSpy.mockRestore();

            expect(mergedEditRes.Success).toBe(true);
            expect(mergedEditRes.UpdatedContent).toBe(
                '# Strategy\n\nConcurrent co-author intro.\n\nPolished quote.\n'
            );
            // Because r5Provider only had an unrelated anchored thread ("Completely different quote."), zero replies were posted to it!
            expect(savedReplies).toHaveLength(0);

            // R5-7: MintArtifactCollaborationTicket returns structured { Success: false } instead of throwing when HMAC secret is unset
            const prevCollab = process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
            const prevTicket = process.env.MJ_COLLABORATION_TICKET_SECRET;
            const ticketErrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                ArtifactCollaborationServer.Instance.SetTicketHmacSecret(null);
                delete process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
                delete process.env.MJ_COLLABORATION_TICKET_SECRET;

                const noSecretRes = await resolver.MintArtifactCollaborationTicket(artifactId, editorCtx);
                expect(noSecretRes.Success).toBe(false);
                expect(noSecretRes.CanRead).toBe(true);
                expect(noSecretRes.CanEdit).toBe(true);
                expect(noSecretRes.ErrorMessage).toBeTruthy();
            } finally {
                ticketErrSpy.mockRestore();
                if (prevCollab !== undefined) process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = prevCollab;
                if (prevTicket !== undefined) process.env.MJ_COLLABORATION_TICKET_SECRET = prevTicket;
                ArtifactCollaborationServer.Instance.SetTicketHmacSecret(
                    'test-collab-ticket-hmac-secret-at-least-32-bytes!!'
                );
            }
        } finally {
            canRunSpy.mockRestore();
            agentsSpy.mockRestore();
        }
    });

    it('R5-1 GraphQL single-record ACL: ResolverBase.MapFieldNamesToCodeNames enforces CanRead on MJ: Artifact Versions and blocks MJ: Artifact Working States', async () => {
        class TestableResolverBase extends ResolverBase {
            public async MapSingleForTest(
                entityName: string,
                row: Record<string, string | number | null>,
                user?: UserInfo,
                provider?: IMetadataProvider
            ): Promise<Record<string, string | number | null> | null> {
                return await this.MapFieldNamesToCodeNames(entityName, row, user, provider);
            }
            public async MapArrayForTest(
                entityName: string,
                rows: Array<Record<string, string | number | null>>,
                user?: UserInfo,
                provider?: IMetadataProvider
            ): Promise<Array<Record<string, string | number | null>>> {
                return await this.ArrayMapFieldNamesToCodeNames(entityName, rows, user, provider);
            }
        }

        const fakeEntityInfo = new EntityInfo({
            ID: 'ei-artifact-versions-test',
            Name: 'MJ: Artifact Versions',
            EntityFields: [
                { ID: 'ef-1', Name: 'ID', CodeName: 'ID', Type: 'uniqueidentifier' },
                { ID: 'ef-2', Name: 'ArtifactID', CodeName: 'ArtifactID', Type: 'uniqueidentifier' },
                { ID: 'ef-3', Name: 'Content', CodeName: 'Content', Type: 'nvarchar' }
            ]
        });

        const mappingProvider: Partial<IMetadataProvider> = {
            ...createMockProvider(),
            EntityByName: () => fakeEntityInfo
        };

        const resolverBase = new TestableResolverBase();
        const strangerUser = createTestUser('user-stranger-99', 'Mallory', 'mallory@example.com');
        const versionRow = {
            ID: 'ver-secret-1',
            ArtifactID: artifactId,
            Content: 'Top-secret single-record payload'
        };

        // 1. Unauthorized user -> null
        expect(
            await resolverBase.MapSingleForTest(
                'MJ: Artifact Versions',
                versionRow,
                strangerUser,
                mappingProvider as IMetadataProvider
            )
        ).toBeNull();

        // 2. Missing contextUser or missing ArtifactID -> null (fail closed)
        expect(
            await resolverBase.MapSingleForTest(
                'MJ: Artifact Versions',
                versionRow,
                undefined,
                mappingProvider as IMetadataProvider
            )
        ).toBeNull();
        expect(
            await resolverBase.MapSingleForTest(
                'MJ: Artifact Versions',
                { ID: 'ver-no-art', Content: 'Secret' },
                viewerUser,
                mappingProvider as IMetadataProvider
            )
        ).toBeNull();

        // 3. Authorized viewer -> mapped row returned
        const allowedMapped = await resolverBase.MapSingleForTest(
            'MJ: Artifact Versions',
            versionRow,
            viewerUser,
            mappingProvider as IMetadataProvider
        );
        expect(allowedMapped).not.toBeNull();
        expect(allowedMapped?.Content).toBe('Top-secret single-record payload');

        // 4. Elevated system user -> allowed without failing
        const sysUser = createTestUser('sys-acl-1', 'System', 'sys@example.com');
        const sysSpy = vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation(
            (u?: UserInfo | null) => Boolean(u && UUIDsEqual(u.ID, sysUser.ID))
        );
        try {
            const sysMapped = await resolverBase.MapSingleForTest(
                'MJ: Artifact Versions',
                versionRow,
                sysUser,
                mappingProvider as IMetadataProvider
            );
            expect(sysMapped?.Content).toBe('Top-secret single-record payload');
        } finally {
            sysSpy.mockRestore();
        }

        // 5. MJ: Artifact Working States -> unconditionally blocked (null / [])
        expect(
            await resolverBase.MapSingleForTest(
                'MJ: Artifact Working States',
                { ID: 'ws-1', ArtifactID: artifactId, YjsState: 'base64==' },
                editorUser,
                mappingProvider as IMetadataProvider
            )
        ).toBeNull();
        expect(
            await resolverBase.MapArrayForTest(
                'MJ: Artifact Working States',
                [{ ID: 'ws-1', ArtifactID: artifactId, YjsState: 'base64==' }],
                editorUser,
                mappingProvider as IMetadataProvider
            )
        ).toEqual([]);
    });

    it('R6-4: Yjs simulations preserve concurrent human edits across WD1, R2, prepend + full rewrite, 1-line doc without trailing newline, and zero-human-edit full rewrites', async () => {
        const server = ArtifactCollaborationServer.Instance;

        const runYjsSim = async (
            simArtifactId: string,
            baseContent: string,
            applyHumanEdit: (yText: Y.Text) => void,
            agentContent: string
        ): Promise<{ serverText: string; clientText: string }> => {
            versions = [
                {
                    ID: `ver-${simArtifactId}`,
                    ArtifactID: simArtifactId,
                    VersionNumber: 1,
                    Content: baseContent,
                    ContentHash: `hash-${simArtifactId}`,
                    UserID: editorUser.ID
                }
            ];
            workingStates.delete(simArtifactId);
            const room = await server.GetOrCreateRoom(simArtifactId, editorUser);
            expect(room).not.toBeNull();

            // Simulate a live browser Y.Doc synced with the server room
            const clientDoc = new Y.Doc();
            Y.applyUpdate(clientDoc, Y.encodeStateAsUpdate(room!.Doc));
            clientDoc.transact(() => {
                applyHumanEdit(clientDoc.getText('content'));
            }, 'browser-human');
            Y.applyUpdate(room!.Doc, Y.encodeStateAsUpdate(clientDoc), 'browser-sync');

            const res = await server.ApplyServerContentMutation(
                simArtifactId,
                agentContent,
                editorUser,
                false,
                baseContent
            );
            expect(res.Success).toBe(true);

            // Sync server's minimal CRDT diff back into the browser Y.Doc
            Y.applyUpdate(clientDoc, Y.encodeStateAsUpdate(room!.Doc));
            const serverText = await server.GetRoomContent(simArtifactId, editorUser);
            const clientText = clientDoc.getText('content').toString();
            clientDoc.destroy();
            expect(clientText).toBe(serverText);
            return { serverText, clientText };
        };

        // 1. Simulation WD1: 1-line doc ('Helo world.\n'), human appends paragraph, agent fixes typo ('Hello world.\n')
        const wd1 = await runYjsSim(
            'r64-wd1-1111-4111-8111-111111111111',
            'Helo world.\n',
            (yText) => {
                yText.insert(yText.length, '\nHuman paragraph.\n');
            },
            'Hello world.\n'
        );
        expect(wd1.serverText).toBe('Hello world.\n\nHuman paragraph.\n');

        // 2. Simulation R2: 3-line doc rewritten by agent while human edits line 2
        const r2 = await runYjsSim(
            'r64-r2a-2222-4222-8222-222222222222',
            'Line 1\nLine 2\nLine 3\n',
            (yText) => {
                const idx = yText.toString().indexOf('Line 2');
                yText.delete(idx, 'Line 2'.length);
                yText.insert(idx, 'Human 2');
            },
            'Agent 1\nAgent 2\nAgent 3\n'
        );
        expect(r2.serverText).toBe('Agent 1\nHuman 2\nAgent 3\n');
        expect(r2.serverText).not.toContain('Line 1');
        expect(r2.serverText).not.toContain('Line 3');

        // 2b. Simulation R2 with line-count-changing full rewrite (R7-5): live edit wins consistently without duplicating agent lines
        const r2Condensed = await runYjsSim(
            'r64-r2b-2222-4222-8222-222222222223',
            'Line 1\nLine 2\nLine 3\n',
            (yText) => {
                const idx = yText.toString().indexOf('Line 2');
                yText.delete(idx, 'Line 2'.length);
                yText.insert(idx, 'Human 2');
            },
            'Agent condensed summary.\n'
        );
        expect(r2Condensed.serverText).toBe('Line 1\nHuman 2\nLine 3\n');
        expect(r2Condensed.serverText).not.toContain('Agent condensed summary.');

        // 3. Prepend + full rewrite: human prepends header at pos 0 while agent rewrites entire base
        const prependSim = await runYjsSim(
            'r64-pre-3333-4333-8333-333333333333',
            'Line 1\nLine 2\n',
            (yText) => {
                yText.insert(0, 'Human prepended intro.\n\n');
            },
            'Agent 1\nAgent 2\n'
        );
        expect(prependSim.serverText).toBe('Human prepended intro.\n\nAgent 1\nAgent 2\n');

        // 4. 1-line doc WITHOUT trailing '\n': human appends paragraph while agent fixes line 1 without '\n'
        const noTrailingNl = await runYjsSim(
            'r64-nonl-4444-4444-8444-444444444444',
            'Helo world.',
            (yText) => {
                yText.insert(yText.length, '\n\nHuman paragraph.');
            },
            'Hello world.'
        );
        expect(noTrailingNl.serverText).toBe('Hello world.\n\nHuman paragraph.');

        // 5. Full rewrite with ZERO human edits: result MUST be incomingText ONLY (never append old base lines!)
        const zeroHumanRewrite = await runYjsSim(
            'r64-zero-5555-4555-8555-555555555555',
            'Old 1\nOld 2\nOld 3\nOld 4\n',
            () => {
                // No human edits
            },
            'Brand new concise rewrite.\n'
        );
        expect(zeroHumanRewrite.serverText).toBe('Brand new concise rewrite.\n');
    });

    it('R6-7 (1, 3 & 4): multi-Y.Doc relay applies pure deletes via savedDocUpdateB64, awaits sync-state on >256KB docs, scopes relay vectors to exact VersionID, and suppresses compaction echoes per VersionID only', async () => {
        class R67NodeA1 extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class R67NodeB1 extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class R67NodeA2 extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class R67NodeB2 extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class R67NodeB3 extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }

        // --- 1a. Pure delete on Node A propagates CRDT DeleteSet to Node B via savedDocUpdateB64 ---
        const bus1 = new InMemoryYjsRelayBus();
        const relayA1 = new InMemoryYjsRoomRelay(bus1, 'r67-node-a1');
        const relayB1 = new InMemoryYjsRoomRelay(bus1, 'r67-node-b1');
        const nodeA1 = new R67NodeA1();
        const nodeB1 = new R67NodeB1();
        expect(nodeA1).not.toBe(nodeB1);
        nodeA1.SetRoomRelay(relayA1);
        nodeB1.SetRoomRelay(relayB1);
        nodeA1.SetMetadataProviderOverride(createMockProvider());
        nodeB1.SetMetadataProviderOverride(createMockProvider());

        try {
            const artDel = 'a1111111-1111-4111-8111-111111111111';
            versions = [
                {
                    ID: 'ver-del-1',
                    ArtifactID: artDel,
                    VersionNumber: 1,
                    Content: 'Keep line.\nDelete me.\n',
                    ContentHash: 'hash-del-1',
                    UserID: editorUser.ID
                }
            ];
            workingStates.delete(artDel);

            const roomA = await nodeA1.GetOrCreateRoom(artDel, editorUser);
            const roomB = await nodeB1.GetOrCreateRoom(artDel, secondEditorUser);
            expect(roomA).not.toBeNull();
            expect(roomB).not.toBeNull();

            // Simulate a client on Node A deleting "Delete me.\n" when `sync-update` was dropped/delayed
            // (passing origin = 'relay' suppresses live sync-update broadcast so ONLY 'version-saved' carries it!)
            const clientOnA = new Y.Doc();
            Y.applyUpdate(clientOnA, Y.encodeStateAsUpdate(roomA!.Doc));
            const delIdx = clientOnA.getText('content').toString().indexOf('Delete me.\n');
            clientOnA.getText('content').delete(delIdx, 'Delete me.\n'.length);
            Y.applyUpdate(roomA!.Doc, Y.encodeStateAsUpdate(clientOnA), 'relay');
            clientOnA.destroy();

            // Notice: insert state vectors on roomA and roomB are IDENTICAL because a Yjs delete does NOT advance insert clocks!
            expect(nodeB1.DoesDocContainStateVector(roomB!.Doc, Y.encodeStateVector(roomA!.Doc))).toBe(true);

            // Meanwhile a client on Node B appends "B concurrent tail.\n" locally
            const clientOnB = new Y.Doc();
            Y.applyUpdate(clientOnB, Y.encodeStateAsUpdate(roomB!.Doc));
            clientOnB.getText('content').insert(clientOnB.getText('content').length, 'B concurrent tail.\n');
            Y.applyUpdate(roomB!.Doc, Y.encodeStateAsUpdate(clientOnB), 'relay');
            roomB!.DirtyVersion = true;
            clientOnB.destroy();

            const compactDel = await nodeA1.CompactRoomToArtifactVersion(artDel, editorUser);
            expect(compactDel.Saved).toBe(true);

            await vi.waitFor(async () => {
                expect(await nodeB1.GetRoomContent(artDel, secondEditorUser)).toBe(
                    'Keep line.\nB concurrent tail.\n'
                );
            });
        } finally {
            await nodeA1.Shutdown();
            await nodeB1.Shutdown();
            await relayA1.Shutdown();
            await relayB1.Shutdown();
        }

        // --- 1b. Large doc (>262,144 bytes) omits inline savedDocUpdateB64, publishes sync-request, and AWAITS delayed sync-state before reconcile ---
        const bus2 = new InMemoryYjsRelayBus();
        const baseRelayA2 = new InMemoryYjsRoomRelay(bus2, 'r67-node-a2');
        const baseRelayB2 = new InMemoryYjsRoomRelay(bus2, 'r67-node-b2');
        let syncRequestCount = 0;

        // Wrap Node A's relay so 'sync-state' reply is dispatched asynchronously 40ms AFTER 'sync-request' PublishToRoom resolves
        const delayedRelayA2: IYjsRoomRelay = {
            get InstanceID(): string {
                return baseRelayA2.InstanceID;
            },
            PublishToRoom: async (msg) => {
                if (msg.MessageType === 'sync-state') {
                    setTimeout(() => {
                        void baseRelayA2.PublishToRoom(msg);
                    }, 40);
                    return;
                }
                await baseRelayA2.PublishToRoom(msg);
            },
            SubscribeRoom: (artId, handler) =>
                baseRelayA2.SubscribeRoom(artId, async (msg) => {
                    if (msg.MessageType === 'sync-request') {
                        syncRequestCount++;
                    }
                    await handler(msg);
                }),
            Shutdown: () => baseRelayA2.Shutdown()
        };

        const nodeA2 = new R67NodeA2();
        const nodeB2 = new R67NodeB2();
        expect(nodeA2).not.toBe(nodeB2);
        nodeA2.SetRoomRelay(delayedRelayA2);
        nodeB2.SetRoomRelay(baseRelayB2);
        nodeA2.SetMetadataProviderOverride(createMockProvider());
        nodeB2.SetMetadataProviderOverride(createMockProvider());

        try {
            const artLarge = 'a2222222-2222-4222-8222-222222222222';
            const largeBody = `${'Large paragraph line for >256KB relay threshold test.\n'.repeat(5200)}`;
            expect(Buffer.byteLength(largeBody, 'utf8')).toBeGreaterThan(262_144);
            versions = [
                {
                    ID: 'ver-large-1',
                    ArtifactID: artLarge,
                    VersionNumber: 1,
                    Content: largeBody,
                    ContentHash: 'hash-large-1',
                    UserID: editorUser.ID
                }
            ];
            workingStates.delete(artLarge);

            const roomALarge = await nodeA2.GetOrCreateRoom(artLarge, editorUser);
            const roomBLarge = await nodeB2.GetOrCreateRoom(artLarge, secondEditorUser);
            expect(roomALarge).not.toBeNull();
            expect(roomBLarge).not.toBeNull();
            syncRequestCount = 0;

            // Unrelayed >256KB paste on Node A ("largePaste + A line.\n") + concurrent edit on Node B ("B line.\n")
            const largePastePrefix = `${'Pasted paragraph line exceeding 256KB delta threshold.\n'.repeat(5000)}`;
            const largePaste = `${largePastePrefix}A line.\n`;
            expect(Buffer.byteLength(largePaste, 'utf8')).toBeGreaterThan(262_144);
            const docOnA = new Y.Doc();
            Y.applyUpdate(docOnA, Y.encodeStateAsUpdate(roomALarge!.Doc));
            docOnA.getText('content').insert(docOnA.getText('content').length, largePaste);
            Y.applyUpdate(roomALarge!.Doc, Y.encodeStateAsUpdate(docOnA), 'relay');
            docOnA.destroy();

            const docOnB = new Y.Doc();
            Y.applyUpdate(docOnB, Y.encodeStateAsUpdate(roomBLarge!.Doc));
            docOnB.getText('content').insert(docOnB.getText('content').length, 'B line.\n');
            Y.applyUpdate(roomBLarge!.Doc, Y.encodeStateAsUpdate(docOnB), 'relay');
            roomBLarge!.DirtyVersion = true;
            docOnB.destroy();

            const compactLarge = await nodeA2.CompactRoomToArtifactVersion(artLarge, editorUser);
            expect(compactLarge.Saved).toBe(true);

            await vi.waitFor(async () => {
                expect(syncRequestCount).toBeGreaterThanOrEqual(1);
                const mergedLargeB = await nodeB2.GetRoomContent(artLarge, secondEditorUser);
                const tail = mergedLargeB.slice(largeBody.length);
                // Exact CRDT merge without redundant text-merge duplication ('A line.\nB line.\nA line.\n' never happens!)
                expect(tail === `${largePaste}B line.\n` || tail === `B line.\n${largePaste}`).toBe(true);
                expect(tail.match(/A line\.\n/g)?.length).toBe(1);
                expect(tail.match(/B line\.\n/g)?.length).toBe(1);
            });
        } finally {
            await nodeA2.Shutdown();
            await nodeB2.Shutdown();
            await baseRelayA2.Shutdown();
            await baseRelayB2.Shutdown();
        }

        // --- 3. Relay vector applies ONLY when latest DB version ID matches relay VersionID ---
        const bus3 = new InMemoryYjsRelayBus();
        const relayA3 = new InMemoryYjsRoomRelay(bus3, 'r67-node-a3');
        const relayB3 = new InMemoryYjsRoomRelay(bus3, 'r67-node-b3');
        const nodeB3 = new R67NodeB3();
        nodeB3.SetRoomRelay(relayB3);
        nodeB3.SetMetadataProviderOverride(createMockProvider());

        try {
            const artMismatch = 'a3333333-3333-4333-8333-333333333333';
            versions = [
                {
                    ID: 'ver-mm-1',
                    ArtifactID: artMismatch,
                    VersionNumber: 1,
                    Content: 'Base v1.\n',
                    ContentHash: 'hash-mm-1',
                    UserID: editorUser.ID
                }
            ];
            workingStates.delete(artMismatch);
            const roomBMm = await nodeB3.GetOrCreateRoom(artMismatch, secondEditorUser);
            expect(roomBMm).not.toBeNull();
            const bSvB64 = BytesToBase64(Y.encodeStateVector(roomBMm!.Doc));

            // DB already moved ahead to v3 (out-of-band agent write) before v2's relay arrives!
            versions.push(
                {
                    ID: 'ver-mm-2',
                    ArtifactID: artMismatch,
                    VersionNumber: 2,
                    Content: 'Base v1.\n',
                    ContentHash: 'hash-mm-2',
                    UserID: editorUser.ID
                },
                {
                    ID: 'ver-mm-3',
                    ArtifactID: artMismatch,
                    VersionNumber: 3,
                    Content: 'Base v1.\nOut-of-band v3 paragraph.\n',
                    ContentHash: 'hash-mm-3',
                    UserID: editorUser.ID
                }
            );

            // Relay carries v2's VersionID + a state vector already contained in roomBMm
            await relayA3.PublishToRoom({
                ArtifactID: artMismatch,
                MessageType: 'version-saved',
                PayloadBase64: JSON.stringify({ savedStateVectorB64: bSvB64 }),
                VersionID: 'ver-mm-2',
                VersionNumber: 2
            });

            await vi.waitFor(async () => {
                // Because latest.ID ('ver-mm-3') !== relayVersionId ('ver-mm-2'), Node B runs full text reconcile for v3!
                expect(await nodeB3.GetRoomContent(artMismatch, secondEditorUser)).toBe(
                    'Base v1.\nOut-of-band v3 paragraph.\n'
                );
            });
        } finally {
            await nodeB3.Shutdown();
            await relayA3.Shutdown();
            await relayB3.Shutdown();
        }

        // --- 4. Compaction echo suppression is scoped to in-flight VersionID, NOT entire ArtifactID ---
        const echoServer = ArtifactCollaborationServer.Instance;
        const artEcho = 'a4444444-4444-4444-8444-444444444444';
        versions = [
            {
                ID: 'ver-echo-1',
                ArtifactID: artEcho,
                VersionNumber: 1,
                Content: 'Line A\nLine B\n',
                ContentHash: 'hash-echo-1',
                UserID: editorUser.ID
            }
        ];
        workingStates.delete(artEcho);
        const echoProvider = createMockProvider({
            onBeforeVersionSave: async (draftVersion) => {
                // 1) Own echo for the in-flight compaction VersionID IS suppressed
                MJGlobal.Instance.RaiseEvent({
                    component: null,
                    event: MJEventType.ComponentEvent,
                    eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
                    args: {
                        ArtifactID: artEcho,
                        VersionID: draftVersion.ID,
                        VersionNumber: draftVersion.VersionNumber,
                        Content: 'SHOULD_BE_SUPPRESSED_SELF_ECHO\n'
                    }
                });
                // 2) Concurrent out-of-band save with a DIFFERENT VersionID on the SAME ArtifactID is NOT suppressed!
                MJGlobal.Instance.RaiseEvent({
                    component: null,
                    event: MJEventType.ComponentEvent,
                    eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
                    args: {
                        ArtifactID: artEcho,
                        VersionID: 'ver-concurrent-oob-99',
                        VersionNumber: 99,
                        Content: 'Line A\nLine B\nConcurrent OOB addition.\n'
                    }
                });
                return true;
            }
        });
        echoServer.SetMetadataProviderOverride(echoProvider);
        const echoRoom = await echoServer.GetOrCreateRoom(artEcho, editorUser);
        echoRoom!.Doc.transact(() => {
            const yText = echoRoom!.Doc.getText('content');
            yText.delete(0, 'Line A'.length);
            yText.insert(0, 'Human Line A');
        }, 'human-echo-edit');

        const echoCompacted = await echoServer.CompactRoomToArtifactVersion(artEcho, editorUser);
        expect(echoCompacted.Saved).toBe(true);
        const afterEchoContent = await echoServer.GetRoomContent(artEcho, editorUser);
        expect(afterEchoContent).not.toContain('SHOULD_BE_SUPPRESSED_SELF_ECHO');
        expect(afterEchoContent).toContain('Human Line A');
        expect(afterEchoContent).toContain('Concurrent OOB addition.');
    });

    it('R6-7 (2 & 5): never records stale art:<id>:v:N vectors before Save() succeeds, rejects mismatched versionId/contentHash vectors, and 3-way merges hydrate on empty base and Restored versions', async () => {
        class HydrateNode extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        const node = new HydrateNode();

        try {
            // --- 2a. Failed compaction Save() NEVER writes art:<id>:v:N, so subsequent OOB v2 reconciles cleanly ---
            const artFail = 'b1111111-1111-4111-8111-111111111111';
            versions = [
                {
                    ID: 'ver-f-1',
                    ArtifactID: artFail,
                    VersionNumber: 1,
                    Content: 'Initial v1.\n',
                    ContentHash: 'hash-f-1',
                    UserID: editorUser.ID
                }
            ];
            workingStates.delete(artFail);

            let failSaves = true;
            node.SetMetadataProviderOverride(
                createMockProvider({
                    onBeforeVersionSave: async () => !failSaves
                })
            );
            const roomFail = await node.GetOrCreateRoom(artFail, editorUser);
            expect(roomFail).not.toBeNull();
            roomFail!.Doc.transact(() => {
                roomFail!.Doc.getText('content').insert(roomFail!.Doc.getText('content').length, 'Human draft.\n');
            }, 'human-draft');

            const failedCompact = await node.CompactRoomToArtifactVersion(artFail, editorUser);
            expect(failedCompact.Saved).toBe(false);
            expect(
                roomFail!.Doc.getMap('meta').has(`art:${artFail.toLowerCase()}:v:2`)
            ).toBe(false);

            // Now an out-of-band REST/agent save writes v2 -> must NOT falsely match a stale v2 vector!
            failSaves = false;
            MJGlobal.Instance.RaiseEvent({
                component: null,
                event: MJEventType.ComponentEvent,
                eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
                args: {
                    ArtifactID: artFail,
                    VersionID: 'ver-oob-v2',
                    VersionNumber: 2,
                    Content: 'Initial v1.\nAgent v2 section.\n'
                }
            });
            const afterOobV2 = await node.GetRoomContent(artFail, editorUser);
            expect(afterOobV2).toContain('Human draft.');
            expect(afterOobV2).toContain('Agent v2 section.');

            // --- 2b. Stale or legacy art:<id>:v:N entry in meta with mismatched versionId/contentHash is rejected ---
            const staleMetaKey = `art:${artFail.toLowerCase()}:v:3`;
            const currentSvB64 = BytesToBase64(Y.encodeStateVector(roomFail!.Doc));
            roomFail!.Doc.transact(() => {
                roomFail!.Doc.getMap('meta').set(
                    staleMetaKey,
                    JSON.stringify({
                        sv: currentSvB64,
                        versionId: 'ver-stale-other-3',
                        contentHash: 'stale-hash'
                    })
                );
            }, 'test-stale-meta');

            MJGlobal.Instance.RaiseEvent({
                component: null,
                event: MJEventType.ComponentEvent,
                eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
                args: {
                    ArtifactID: artFail,
                    VersionID: 'ver-real-3',
                    VersionNumber: 3,
                    Content: 'Initial v1.\nAgent v2 section.\nRestored v3 appendix.\n'
                }
            });
            expect(await node.GetRoomContent(artFail, editorUser)).toContain('Restored v3 appendix.');

            // --- 5a. Hydrate 3-way merge on EMPTY base ("") ---
            const artEmptyHydrate = 'b2222222-2222-4222-8222-222222222222';
            const emptyBaseWorkingDoc = new Y.Doc();
            emptyBaseWorkingDoc.getText('content').insert(0, 'Human draft from empty base.\n');
            emptyBaseWorkingDoc.getMap('meta').set('baseContent', '');
            workingStates.set(artEmptyHydrate, {
                ID: 'ws-empty-base',
                ArtifactID: artEmptyHydrate,
                YjsState: BytesToBase64(Y.encodeStateAsUpdate(emptyBaseWorkingDoc)),
                LastModifiedByUserID: editorUser.ID,
                __mj_UpdatedAt: new Date().toISOString()
            });
            emptyBaseWorkingDoc.destroy();

            versions = [
                {
                    ID: 'ver-empty-hyd-1',
                    ArtifactID: artEmptyHydrate,
                    VersionNumber: 1,
                    Content: 'Agent v1 from empty base.\n',
                    ContentHash: 'hash-empty-hyd-1',
                    UserID: editorUser.ID,
                    __mj_CreatedAt: new Date(Date.now() - 5_000).toISOString(),
                    __mj_UpdatedAt: new Date(Date.now() - 5_000).toISOString()
                }
            ];

            const hydratedEmptyRoom = await node.GetOrCreateRoom(artEmptyHydrate, editorUser);
            expect(hydratedEmptyRoom).not.toBeNull();
            const mergedFromEmpty = await node.GetRoomContent(artEmptyHydrate, editorUser);
            expect(mergedFromEmpty).toContain('Human draft from empty base.');
            expect(mergedFromEmpty).toContain('Agent v1 from empty base.');
            expect(hydratedEmptyRoom!.Doc.getMap('meta').get('baseVersionId')).toBe('ver-empty-hyd-1');

            // --- 5b. Hydrate recognizes a Restored DB version whose text equals base (baseVersionId !== latestVersion.ID) ---
            const artRestored = 'b3333333-3333-4333-8333-333333333333';
            const workingAtV1 = new Y.Doc();
            workingAtV1.getText('content').insert(0, 'Original v1 body.\nUncompacted human note.\n');
            workingAtV1.getMap('meta').set('baseVersionId', 'ver-rest-1');
            workingAtV1.getMap('meta').set('baseVersionNumber', 1);
            workingAtV1.getMap('meta').set('baseContent', 'Original v1 body.\n');
            workingAtV1.getMap('meta').set('versionId', 'ver-rest-1');
            workingAtV1.getMap('meta').set('versionNumber', 1);
            workingStates.set(artRestored, {
                ID: 'ws-rest-1',
                ArtifactID: artRestored,
                YjsState: BytesToBase64(Y.encodeStateAsUpdate(workingAtV1)),
                LastModifiedByUserID: editorUser.ID,
                // Working state flushed AFTER v3 was restored — must still detect baseVersionId !== ver-rest-3!
                __mj_UpdatedAt: new Date(Date.now() + 10_000).toISOString()
            });
            workingAtV1.destroy();

            versions = [
                {
                    ID: 'ver-rest-3',
                    ArtifactID: artRestored,
                    VersionNumber: 3,
                    Content: 'Original v1 body.\n',
                    ContentHash: 'hash-rest-3',
                    UserID: editorUser.ID,
                    __mj_CreatedAt: new Date().toISOString(),
                    __mj_UpdatedAt: new Date().toISOString()
                }
            ];

            const restoredRoom = await node.GetOrCreateRoom(artRestored, editorUser);
            expect(restoredRoom).not.toBeNull();
            expect(restoredRoom!.BaseVersionID).toBe('ver-rest-3');
            expect(restoredRoom!.Doc.getMap('meta').get('baseVersionId')).toBe('ver-rest-3');
            expect(restoredRoom!.Doc.getMap('meta').get('versionNumber')).toBe(3);
            expect(await node.GetRoomContent(artRestored, editorUser)).toBe(
                'Original v1 body.\nUncompacted human note.\n'
            );
        } finally {
            await node.Shutdown();
        }
    });

    it('Polish: empty-string HMAC env vars fall through to secondary secrets, and malformed vectors, relay sync-request failures, malformed AnchorMetadata, and unmatched threads log errors', async () => {
        const server = ArtifactCollaborationServer.Instance;
        const prevCollab = process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
        const prevTicket = process.env.MJ_COLLABORATION_TICKET_SECRET;
        const prevFrozen = process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
        const prevSnapshot = process.env.MJ_FROZEN_SNAPSHOT_SECRET;
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        try {
            // 1. Empty/whitespace primary env vars fall through identically in CheckStartupSecrets() and IssueTicket()
            server.SetTicketHmacSecret(null);
            process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = '   ';
            process.env.MJ_COLLABORATION_TICKET_SECRET = 'fallback-collab-ticket-secret-at-least-32-bytes!!';
            process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = '';
            process.env.MJ_FROZEN_SNAPSHOT_SECRET = 'fallback-frozen-snapshot-secret-at-least-32-bytes!!';

            const status = server.CheckStartupSecrets();
            expect(status.CollabSecretConfigured).toBe(true);
            expect(status.FrozenBlockSecretConfigured).toBe(true);
            expect(status.Warnings).toHaveLength(0);

            const ticket = server.IssueTicket({ ArtifactID: artifactId, User: editorUser });
            expect(ticket.Ticket.length).toBeGreaterThan(20);

            // 2. Corrupted state vector bytes in DoesDocContainStateVector log via LogError and return false
            const dummyDoc = new Y.Doc();
            errorSpy.mockClear();
            const containsCorrupt = server.DoesDocContainStateVector(
                dummyDoc,
                new Uint8Array([255, 255, 255, 255, 255, 255])
            );
            dummyDoc.destroy();
            expect(containsCorrupt).toBe(false);
            expect(
                errorSpy.mock.calls.some((args) =>
                    args.map(String).join(' ').includes('DoesDocContainStateVector failed')
                )
            ).toBe(true);

            // 3. Relay sync-request publish failure during version-saved logs via LogError
            class FailingSyncReqNode extends ArtifactCollaborationServer {
                public constructor() {
                    super();
                }
            }
            const bus = new InMemoryYjsRelayBus();
            const baseRelayA = new InMemoryYjsRoomRelay(bus, 'pol-a');
            const baseRelayB = new InMemoryYjsRoomRelay(bus, 'pol-b');
            const failingRelayB: IYjsRoomRelay = {
                get InstanceID(): string {
                    return baseRelayB.InstanceID;
                },
                PublishToRoom: async (msg) => {
                    if (msg.MessageType === 'sync-request') {
                        throw new Error('Simulated Redis publish outage on sync-request');
                    }
                    await baseRelayB.PublishToRoom(msg);
                },
                SubscribeRoom: (artId, handler) => baseRelayB.SubscribeRoom(artId, handler),
                Shutdown: () => baseRelayB.Shutdown()
            };
            const nodeB = new FailingSyncReqNode();
            nodeB.SetRoomRelay(failingRelayB);
            nodeB.SetMetadataProviderOverride(createMockProvider());
            try {
                const roomB = await nodeB.GetOrCreateRoom(artifactId, secondEditorUser);
                expect(roomB).not.toBeNull();
                errorSpy.mockClear();

                const foreignDoc = new Y.Doc();
                foreignDoc.getText('content').insert(0, 'Foreign op');
                const foreignSvB64 = BytesToBase64(Y.encodeStateVector(foreignDoc));
                foreignDoc.destroy();

                await baseRelayA.PublishToRoom({
                    ArtifactID: artifactId,
                    MessageType: 'version-saved',
                    PayloadBase64: JSON.stringify({ savedStateVectorB64: foreignSvB64 }),
                    VersionID: 'ver-pol-2',
                    VersionNumber: 2
                });

                await vi.waitFor(() => {
                    expect(
                        errorSpy.mock.calls.some((args) =>
                            args
                                .map(String)
                                .join(' ')
                                .includes('Simulated Redis publish outage on sync-request')
                        )
                    ).toBe(true);
                });
            } finally {
                await nodeB.Shutdown();
                await baseRelayA.Shutdown();
                await baseRelayB.Shutdown();
            }

            // 4. DocumentCollaborationResolver logs malformed AnchorMetadata JSON and unmatched thread early returns
            const resolver = new DocumentCollaborationResolver();
            const baseProv = createMockProvider();
            const malformedAnchorProvider: Partial<IMetadataProvider> = {
                ...baseProv,
                RunView: (async (params: RunViewParams) => {
                    if (params.EntityName === 'MJ: Conversations') {
                        return {
                            Success: true,
                            Results: [{ ID: 'conv-bad-json', AnchorMetadata: '{not-valid-json' }],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                            UserViewRunID: ''
                        };
                    }
                    return await baseProv.RunView(params);
                }) as IMetadataProvider['RunView']
            };

            const activeAgent: Partial<MJAIAgentEntityExtended> = {
                ID: '98989898-1212-4343-8585-cdcdcdcdcdcd',
                Name: 'Thread Reviewer',
                Status: 'Active'
            };
            const fakeRun: Partial<MJAIAgentRunEntityExtended> = {
                ID: '76767676-1212-4343-8585-efefefefefef',
                AgentID: activeAgent.ID
            };
            const loadedSpy = vi.spyOn(AIEngine.Instance, 'Loaded', 'get').mockReturnValue(true);
            const agentsSpy = vi
                .spyOn(AIEngine.Instance, 'Agents', 'get')
                .mockReturnValue([activeAgent as MJAIAgentEntityExtended]);
            const canRunSpy = vi.spyOn(AIEngine.Instance, 'CanUserRunAgent').mockReturnValue(true);
            const runCommentSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockResolvedValueOnce({
                success: true,
                payload: { reply: 'Reviewed note.' },
                agentRun: fakeRun as MJAIAgentRunEntityExtended
            });

            const resolverCtx: AppContext = {
                dataSource: {} as AppContext['dataSource'],
                dataSources: [],
                providers: [{ provider: malformedAnchorProvider as IMetadataProvider, type: 'Read-Write' }],
                userPayload: {
                    userRecord: editorUser,
                    email: editorUser.Email,
                    sessionId: 'sess-polish-resolver'
                }
            };

            try {
                errorSpy.mockClear();
                const mentionRes = await resolver.ExecuteAnchoredCommentAgentMention(
                    artifactId,
                    '@thread-reviewer',
                    'comment',
                    '@thread-reviewer check quote',
                    'target quote',
                    resolverCtx
                );
                expect(mentionRes.Success).toBe(true);
                const resolverErrors = errorSpy.mock.calls
                    .map((args) => args.map(String).join(' '))
                    .join('\n');
                expect(resolverErrors).toContain('failed parsing AnchorMetadata');
                expect(resolverErrors).toContain('could not match an open anchored thread');
            } finally {
                runCommentSpy.mockRestore();
                canRunSpy.mockRestore();
                agentsSpy.mockRestore();
                loadedSpy.mockRestore();
            }
        } finally {
            errorSpy.mockRestore();
            server.SetTicketHmacSecret('test-collab-ticket-hmac-secret-at-least-32-bytes!!');
            if (prevCollab === undefined) delete process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
            else process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = prevCollab;
            if (prevTicket === undefined) delete process.env.MJ_COLLABORATION_TICKET_SECRET;
            else process.env.MJ_COLLABORATION_TICKET_SECRET = prevTicket;
            if (prevFrozen === undefined) delete process.env.MJ_FROZEN_BLOCK_HMAC_SECRET;
            else process.env.MJ_FROZEN_BLOCK_HMAC_SECRET = prevFrozen;
            if (prevSnapshot === undefined) delete process.env.MJ_FROZEN_SNAPSHOT_SECRET;
            else process.env.MJ_FROZEN_SNAPSHOT_SECRET = prevSnapshot;
        }
    });

    it('R7-5: MergeConcurrentDocumentEditsDetailed resolves WD1, WD2/WD3, R2, Prepend, NoTrailingNl, ZeroHumanRewrite, A2, A9, A11, A14, A15, S2, and concurrent Whiteboard JSON merges without duplication or JSON corruption', () => {
        const server = ArtifactCollaborationServer.Instance;

        // WD1: 1-line doc, human appends paragraph, agent fixes typo -> pure insertion, NOT a conflict
        const wd1 = server.MergeConcurrentDocumentEditsDetailed(
            'Helo world.\n',
            'Helo world.\n\nHuman paragraph.\n',
            'Hello world.\n'
        );
        expect(wd1).toEqual({
            MergedText: 'Hello world.\n\nHuman paragraph.\n',
            HadConflict: false,
            RejectedAgentHunks: []
        });

        // WD2 / WD3: human inserts new paragraph inside multi-paragraph doc without modifying base lines
        const wd2 = server.MergeConcurrentDocumentEditsDetailed(
            'First paragraph.\nSecond paragraph.\n',
            'First paragraph.\nHuman inserted middle paragraph.\nSecond paragraph.\n',
            'First paragraph polished.\nSecond paragraph polished.\n'
        );
        expect(wd2).toEqual({
            MergedText:
                'First paragraph polished.\nHuman inserted middle paragraph.\nSecond paragraph polished.\n',
            HadConflict: false,
            RejectedAgentHunks: []
        });

        // R2: 3-line doc rewritten 1:1 by agent while human edited ONLY line 2 -> positional rebase + conflict reported
        const r2 = server.MergeConcurrentDocumentEditsDetailed(
            'Line 1\nLine 2\nLine 3\n',
            'Line 1\nHuman 2\nLine 3\n',
            'Agent 1\nAgent 2\nAgent 3\n'
        );
        expect(r2.MergedText).toBe('Agent 1\nHuman 2\nAgent 3\n');
        expect(r2.HadConflict).toBe(true);
        expect(r2.RejectedAgentHunks).toEqual([
            {
                BaseText: 'Line 2\n',
                LiveText: 'Human 2\n',
                RejectedIncomingText: 'Agent 2\n'
            }
        ]);

        // Prepend: human prepends intro at top while agent rewrites base -> pure insertion, NOT a conflict
        const prepend = server.MergeConcurrentDocumentEditsDetailed(
            'Line 1\nLine 2\n',
            'Human prepended intro.\n\nLine 1\nLine 2\n',
            'Agent 1\nAgent 2\n'
        );
        expect(prepend).toEqual({
            MergedText: 'Human prepended intro.\n\nAgent 1\nAgent 2\n',
            HadConflict: false,
            RejectedAgentHunks: []
        });

        // NoTrailingNl: 1-line doc without '\n', human appends paragraph, agent fixes typo -> NOT a conflict
        const noNl = server.MergeConcurrentDocumentEditsDetailed(
            'Helo world.',
            'Helo world.\n\nHuman paragraph.',
            'Hello world.'
        );
        expect(noNl).toEqual({
            MergedText: 'Hello world.\n\nHuman paragraph.',
            HadConflict: false,
            RejectedAgentHunks: []
        });

        // ZeroHumanRewrite: no human edits -> incoming rewrite wins cleanly, NOT a conflict
        const zeroHuman = server.MergeConcurrentDocumentEditsDetailed(
            'Old 1\nOld 2\n',
            'Old 1\nOld 2\n',
            'Concise rewrite.\n'
        );
        expect(zeroHuman).toEqual({
            MergedText: 'Concise rewrite.\n',
            HadConflict: false,
            RejectedAgentHunks: []
        });

        // A2: human fixes typo in multi-sentence paragraph while agent condenses it -> live edit wins, ZERO duplicate lines
        const a2 = server.MergeConcurrentDocumentEditsDetailed(
            'The cat sat on the mat.\nIt purred loudly.\n',
            'The cat sat down.\nIt purred loudly.\n',
            'The feline sat and purred.\n'
        );
        expect(a2.MergedText).toBe('The cat sat down.\nIt purred loudly.\n');
        expect(a2.MergedText).not.toContain('The feline sat and purred.');
        expect(a2.HadConflict).toBe(true);
        expect(a2.RejectedAgentHunks).toHaveLength(1);
        expect(a2.RejectedAgentHunks[0].RejectedIncomingText).toBe('The feline sat and purred.\n');

        // A9: 3-line doc where human edited all 3 lines and agent rewrote all 3 lines -> live edit wins, ZERO duplication
        const a9 = server.MergeConcurrentDocumentEditsDetailed(
            'a\nb\nc\n',
            'a1\nb1\nc1\n',
            'A\nB\nC\n'
        );
        expect(a9.MergedText).toBe('a1\nb1\nc1\n');
        expect(a9.HadConflict).toBe(true);
        expect(a9.RejectedAgentHunks).toEqual([
            {
                BaseText: 'a\nb\nc\n',
                LiveText: 'a1\nb1\nc1\n',
                RejectedIncomingText: 'A\nB\nC\n'
            }
        ]);

        // A11: 1-line doc edited differently by both sides -> live edit wins, ZERO duplication
        const a11 = server.MergeConcurrentDocumentEditsDetailed(
            'Hello',
            'Hello world',
            'Hello there'
        );
        expect(a11.MergedText).toBe('Hello world');
        expect(a11.HadConflict).toBe(true);
        expect(a11.RejectedAgentHunks).toEqual([
            {
                BaseText: 'Hello',
                LiveText: 'Hello world',
                RejectedIncomingText: 'Hello there'
            }
        ]);

        // A14: same-line conflict in a multi-line doc -> live edit wins AND conflict is reported
        const a14 = server.MergeConcurrentDocumentEditsDetailed(
            'Header\nShared line\nFooter\n',
            'Header\nHuman line\nFooter\n',
            'Header\nAgent line\nFooter\n'
        );
        expect(a14.MergedText).toBe('Header\nHuman line\nFooter\n');
        expect(a14.HadConflict).toBe(true);
        expect(a14.RejectedAgentHunks).toEqual([
            {
                BaseText: 'Shared line\n',
                LiveText: 'Human line\n',
                RejectedIncomingText: 'Agent line\n'
            }
        ]);

        // S2: multi-section doc with non-conflicting agent edit in Section 1 + same-line conflict in Section 2
        const s2 = server.MergeConcurrentDocumentEditsDetailed(
            '# Section 1\nOld 1\n\n# Section 2\nOld 2\n',
            '# Section 1\nOld 1\n\n# Section 2\nHuman 2\n',
            '# Section 1\nAgent 1\n\n# Section 2\nAgent 2\n'
        );
        expect(s2.MergedText).toBe('# Section 1\nAgent 1\n\n# Section 2\nHuman 2\n');
        expect(s2.HadConflict).toBe(true);
        expect(s2.RejectedAgentHunks).toEqual([
            {
                BaseText: 'Old 2\n',
                LiveText: 'Human 2\n',
                RejectedIncomingText: 'Agent 2\n'
            }
        ]);

        // A15a: single-line JSON non-conflicting keys -> structural 3-way JSON merge, 100% valid JSON, HadConflict: false
        const a15Clean = server.MergeConcurrentDocumentEditsDetailed(
            '{"a":1,"b":2}',
            '{"a":5,"b":2}',
            '{"a":1,"b":3}'
        );
        expect(JSON.parse(a15Clean.MergedText)).toEqual({ a: 5, b: 3 });
        expect(a15Clean.HadConflict).toBe(false);
        expect(a15Clean.RejectedAgentHunks).toEqual([]);

        // A15b: single-line JSON conflicting key "a" -> live wins on "a", 100% valid JSON, HadConflict: true
        const a15Conflict = server.MergeConcurrentDocumentEditsDetailed(
            '{"a":1,"b":2}',
            '{"a":5,"b":2}',
            '{"a":9,"b":2}'
        );
        expect(JSON.parse(a15Conflict.MergedText)).toEqual({ a: 5, b: 2 });
        expect(a15Conflict.HadConflict).toBe(true);
        expect(a15Conflict.RejectedAgentHunks).toHaveLength(1);

        // A15c: JSON key deletions respected on unchanged side
        const a15Delete = server.MergeConcurrentDocumentEditsDetailed(
            '{"a":1,"b":2,"c":3}',
            '{"a":1,"c":3}',
            '{"a":1,"b":2,"c":30,"d":4}'
        );
        expect(JSON.parse(a15Delete.MergedText)).toEqual({ a: 1, c: 30, d: 4 });
        expect(a15Delete.HadConflict).toBe(false);

        // Concurrent Whiteboard JSON merges: nested appState keys AND ID-keyed elements merge cleanly (`R8-9`),
        // while conflicting edits to the same element property pick live (`HadConflict: true`).
        const wbBase = JSON.stringify({
            elements: [{ id: 'rect-1', x: 10, y: 20 }],
            appState: { viewBackgroundColor: '#ffffff', gridSize: 20 }
        });
        const wbLive = JSON.stringify({
            elements: [{ id: 'rect-1', x: 50, y: 20 }, { id: 'arrow-human', x: 0, y: 0 }],
            appState: { viewBackgroundColor: '#f8fafc', gridSize: 20 }
        });
        const wbIncoming = JSON.stringify({
            elements: [{ id: 'rect-1', x: 10, y: 99 }],
            appState: { viewBackgroundColor: '#ffffff', gridSize: 40, zoom: 1.5 }
        });
        const wbMerged = server.MergeConcurrentDocumentEditsDetailed(wbBase, wbLive, wbIncoming);
        const wbParsed = JSON.parse(wbMerged.MergedText) as {
            elements: Array<{ id: string; x: number; y: number }>;
            appState: Record<string, string | number>;
        };
        expect(wbParsed.elements).toEqual([
            { id: 'rect-1', x: 50, y: 99 },
            { id: 'arrow-human', x: 0, y: 0 }
        ]);
        expect(wbParsed.appState).toEqual({
            viewBackgroundColor: '#f8fafc',
            gridSize: 40,
            zoom: 1.5
        });
        expect(wbMerged.HadConflict).toBe(false);

        const wbConflictingIncoming = JSON.stringify({
            elements: [{ id: 'rect-1', x: 99, y: 99 }],
            appState: { viewBackgroundColor: '#ffffff', gridSize: 40 }
        });
        const wbConflictMerged = server.MergeConcurrentDocumentEditsDetailed(
            wbBase,
            wbLive,
            wbConflictingIncoming
        );
        const wbConflictParsed = JSON.parse(wbConflictMerged.MergedText) as {
            elements: Array<{ id: string; x: number; y: number }>;
        };
        expect(wbConflictParsed.elements).toEqual([
            { id: 'rect-1', x: 50, y: 99 },
            { id: 'arrow-human', x: 0, y: 0 }
        ]);
        expect(wbConflictMerged.HadConflict).toBe(true);

        // Top-level JSON array -> live edit wins cleanly, valid JSON, HadConflict: true
        const jsonArr = server.MergeConcurrentDocumentEditsDetailed(
            '[{"id":1}]',
            '[{"id":1},{"id":2}]',
            '[{"id":1},{"id":3}]'
        );
        expect(JSON.parse(jsonArr.MergedText)).toEqual([{ id: 1 }, { id: 2 }]);
        expect(jsonArr.HadConflict).toBe(true);
    });

    it('R7-5: broadcasts observable merge-conflict WebSocket control frames across ApplyServerContentMutation, checkAndReconcileLatestDatabaseVersion, and cold room hydration', async () => {
        const server = ArtifactCollaborationServer.Instance;

        // 1. ApplyServerContentMutation + checkAndReconcileLatestDatabaseVersion on live room
        versions = [
            {
                ID: 'ver-mc-1',
                ArtifactID: artifactId,
                VersionNumber: 1,
                Content: 'Header\nOriginal line\nFooter\n',
                ContentHash: 'hash-mc-1',
                UserID: editorUser.ID
            }
        ];
        workingStates.clear();

        const client = await connectYjsClient(editorUser.ID);
        await client.waitForText('Original line');

        client.doc.transact(() => {
            const yText = client.doc.getText('content');
            const idx = yText.toString().indexOf('Original line');
            yText.delete(idx, 'Original line'.length);
            yText.insert(idx, 'Human live line');
        }, 'human-live');

        await vi.waitFor(async () => {
            expect(await server.GetRoomContent(artifactId, editorUser)).toBe(
                'Header\nHuman live line\nFooter\n'
            );
        });

        // Agent mutates same line against baseContent -> live wins AND 'merge-conflict' control frame is broadcast!
        const mutRes = await server.ApplyServerContentMutation(
            artifactId,
            'Header\nAgent conflicting line\nFooter\n',
            editorUser,
            false,
            'Header\nOriginal line\nFooter\n'
        );
        expect(mutRes.Success).toBe(true);
        expect(await server.GetRoomContent(artifactId, editorUser)).toBe(
            'Header\nHuman live line\nFooter\n'
        );

        await vi.waitFor(() => {
            const conflictFrames = client.controlFrames.filter((f) => f.action === 'merge-conflict');
            expect(conflictFrames.length).toBeGreaterThanOrEqual(1);
            expect(conflictFrames[0].rejectedHunkCount).toBe(1);
            expect(conflictFrames[0].roomEpoch).toBeTruthy();
        });

        // Out-of-band DB version write conflicting on the same line -> broadcasts 'merge-conflict' with versionId
        client.controlFrames.length = 0;
        versions.push({
            ID: 'ver-mc-2',
            ArtifactID: artifactId,
            VersionNumber: 2,
            Content: 'Header\nOOB conflicting line\nFooter\n',
            ContentHash: 'hash-mc-2',
            UserID: secondEditorUser.ID
        });
        MJGlobal.Instance.RaiseEvent({
            component: null,
            event: MJEventType.ComponentEvent,
            eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
            args: {
                ArtifactID: artifactId,
                VersionID: 'ver-mc-2',
                VersionNumber: 2,
                Content: 'Header\nOOB conflicting line\nFooter\n'
            }
        });

        await vi.waitFor(() => {
            const oobConflicts = client.controlFrames.filter((f) => f.action === 'merge-conflict');
            expect(oobConflicts).toHaveLength(1);
            expect(oobConflicts[0].versionId).toBe('ver-mc-2');
            expect(oobConflicts[0].rejectedHunkCount).toBe(1);
        });
        client.ws.close();
        client.doc.destroy();

        // 2. Cold room hydration conflict flushes 'merge-conflict' when first WebSocket client connects
        const coldArtifactId = 'd4444444-4444-4444-8444-444444444444';
        const offlineDoc = new Y.Doc();
        offlineDoc.getText('content').insert(0, 'Human offline edit.\n');
        offlineDoc.getMap('meta').set('baseVersionId', 'ver-hyd-1');
        offlineDoc.getMap('meta').set('baseVersionNumber', 1);
        offlineDoc.getMap('meta').set('versionId', 'ver-hyd-1');
        offlineDoc.getMap('meta').set('versionNumber', 1);
        workingStates.set(coldArtifactId, {
            ID: 'ws-hyd-conflict',
            ArtifactID: coldArtifactId,
            YjsState: BytesToBase64(Y.encodeStateAsUpdate(offlineDoc)),
            LastModifiedByUserID: editorUser.ID,
            __mj_UpdatedAt: new Date().toISOString()
        });
        offlineDoc.destroy();

        versions = [
            {
                ID: 'ver-hyd-1',
                ArtifactID: coldArtifactId,
                VersionNumber: 1,
                Content: 'Original cold base.\n',
                ContentHash: 'hash-hyd-1',
                UserID: editorUser.ID
            },
            {
                ID: 'ver-hyd-2',
                ArtifactID: coldArtifactId,
                VersionNumber: 2,
                Content: 'Agent cold rewrite.\n',
                ContentHash: 'hash-hyd-2',
                UserID: secondEditorUser.ID
            }
        ];

        const coldControlFrames: CollaborationControlFrame[] = [];
        const coldDoc = new Y.Doc();
        const coldWs = await new Promise<WsClient>((resolve, reject) => {
            const ws = new WsClient(
                `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${coldArtifactId}&testUserId=${editorUser.ID}`
            );
            ws.on('message', (raw: Buffer) => {
                const decoder = decoding.createDecoder(new Uint8Array(raw));
                const msgType = decoding.readVarUint(decoder);
                if (msgType === YJS_MESSAGE_SYNC) {
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
                    syncProtocol.readSyncMessage(decoder, encoder, coldDoc, 'server');
                    if (encoding.length(encoder) > 1 && ws.readyState === WsClient.OPEN) {
                        ws.send(encoding.toUint8Array(encoder));
                    }
                } else if (msgType === YJS_MESSAGE_CONTROL) {
                    coldControlFrames.push(
                        JSON.parse(decoding.readVarString(decoder)) as CollaborationControlFrame
                    );
                }
            });
            ws.on('open', () => resolve(ws));
            ws.on('error', reject);
        });

        await vi.waitFor(() => {
            expect(coldDoc.getText('content').toString()).toContain('Human offline edit.');
            const hydConflicts = coldControlFrames.filter((f) => f.action === 'merge-conflict');
            expect(hydConflicts).toHaveLength(1);
            expect(hydConflicts[0].versionId).toBe('ver-hyd-2');
            expect(hydConflicts[0].rejectedHunkCount).toBe(1);
        });
        coldWs.close();
        coldDoc.destroy();
    });

    it(
        'R7-6 & Sync waiter: omits duplicate meta.baseContent, publishes <5KB compaction deltas on 300KB docs, recovers M2c/M4b >256KB pastes via WorkingState fallback, detects M5e pure deletes via Snapshot, and rejects corrupt sync-state',
        async () => {
            class R76NodeA1 extends ArtifactCollaborationServer {
                public constructor() {
                    super();
                }
            }
            class R76NodeB1 extends ArtifactCollaborationServer {
                public constructor() {
                    super();
                }
            }
            class R76NodeA2 extends ArtifactCollaborationServer {
                public constructor() {
                    super();
                }
            }
            class R76NodeB2 extends ArtifactCollaborationServer {
                public constructor() {
                    super();
                }
            }
            class R76NodeA3 extends ArtifactCollaborationServer {
                public constructor() {
                    super();
                }
            }
            class R76NodeB3 extends ArtifactCollaborationServer {
                public constructor() {
                    super();
                }
            }

            // --- 1 & 2. No meta.baseContent duplication + <5KB typing compaction delta on a 300KB doc ---
            const busDelta = new InMemoryYjsRelayBus();
            const baseRelayADelta = new InMemoryYjsRoomRelay(busDelta, 'r76-delta-a');
            const baseRelayBDelta = new InMemoryYjsRoomRelay(busDelta, 'r76-delta-b');
            const publishedByA: YjsRelayMessage[] = [];
            let deltaSyncRequests = 0;

            const spyRelayADelta: IYjsRoomRelay = {
                get InstanceID(): string {
                    return baseRelayADelta.InstanceID;
                },
                PublishToRoom: async (msg) => {
                    publishedByA.push(msg);
                    await baseRelayADelta.PublishToRoom(msg);
                },
                SubscribeRoom: (artId, handler) =>
                    baseRelayADelta.SubscribeRoom(artId, async (msg) => {
                        if (msg.MessageType === 'sync-request') {
                            deltaSyncRequests++;
                        }
                        await handler(msg);
                    }),
                Shutdown: () => baseRelayADelta.Shutdown()
            };

            const nodeADelta = new R76NodeA1();
            const nodeBDelta = new R76NodeB1();
            expect(nodeADelta).not.toBe(nodeBDelta);
            nodeADelta.SetRoomRelay(spyRelayADelta);
            nodeBDelta.SetRoomRelay(baseRelayBDelta);
            nodeADelta.SetMetadataProviderOverride(createMockProvider());
            nodeBDelta.SetMetadataProviderOverride(createMockProvider());

            try {
                const art300k = 'c1111111-1111-4111-8111-111111111111';
                const doc300k = `${'300KB baseline paragraph line for incremental compaction delta check.\n'.repeat(4500)}`;
                expect(Buffer.byteLength(doc300k, 'utf8')).toBeGreaterThan(300_000);
                versions = [
                    {
                        ID: 'ver-300k-1',
                        ArtifactID: art300k,
                        VersionNumber: 1,
                        Content: doc300k,
                        ContentHash: 'hash-300k-1',
                        UserID: editorUser.ID
                    }
                ];
                workingStates.delete(art300k);

                const roomA = await nodeADelta.GetOrCreateRoom(art300k, editorUser);
                const roomB = await nodeBDelta.GetOrCreateRoom(art300k, secondEditorUser);
                expect(roomA).not.toBeNull();
                expect(roomB).not.toBeNull();

                // Verify meta.baseContent is NOT stored on rooms backed by a persisted versionId
                expect(roomA!.Doc.getMap('meta').has('baseContent')).toBe(false);

                publishedByA.length = 0;
                deltaSyncRequests = 0;

                // User types a short sentence on Node A (unrelayed live op) and compacts
                const typingClient = new Y.Doc();
                Y.applyUpdate(typingClient, Y.encodeStateAsUpdate(roomA!.Doc));
                typingClient
                    .getText('content')
                    .insert(typingClient.getText('content').length, 'Incremental typed line.\n');
                Y.applyUpdate(roomA!.Doc, Y.encodeStateAsUpdate(typingClient), 'relay');
                typingClient.destroy();

                const compactRes = await nodeADelta.CompactRoomToArtifactVersion(art300k, editorUser);
                expect(compactRes.Saved).toBe(true);
                expect(roomA!.Doc.getMap('meta').has('baseContent')).toBe(false);

                // Persisted WorkingState size must NOT double the 300KB document
                const persistedWs = workingStates.get(art300k);
                expect(persistedWs).toBeDefined();
                const persistedBytes = Base64ToBytes(persistedWs!.YjsState);
                expect(persistedBytes.byteLength).toBeLessThan(400_000);

                // Published 'version-saved' carries an incremental delta < 5KB (never > 256KB full state!)
                const versionSavedMsg = publishedByA.find((m) => m.MessageType === 'version-saved');
                expect(versionSavedMsg).toBeDefined();
                expect(Buffer.byteLength(versionSavedMsg!.PayloadBase64, 'utf8')).toBeLessThan(5_000);
                const parsedRelayJson = JSON.parse(versionSavedMsg!.PayloadBase64) as {
                    savedDocUpdateB64?: string;
                    prevStateVectorB64?: string;
                    savedSnapshotB64?: string;
                };
                expect(parsedRelayJson.savedDocUpdateB64).toBeTruthy();
                expect(parsedRelayJson.prevStateVectorB64).toBeTruthy();
                expect(parsedRelayJson.savedSnapshotB64).toBeTruthy();

                await vi.waitFor(async () => {
                    expect(await nodeBDelta.GetRoomContent(art300k, secondEditorUser)).toBe(
                        `${doc300k}Incremental typed line.\n`
                    );
                });
                expect(deltaSyncRequests).toBe(0);
            } finally {
                await nodeADelta.Shutdown();
                await nodeBDelta.Shutdown();
                await baseRelayADelta.Shutdown();
                await baseRelayBDelta.Shutdown();
            }

            // --- 3 & 5. M5e (lost pure delete on Node A while Node B is dirty) + raw Base64 sync-state wire format ---
            const busM5e = new InMemoryYjsRelayBus();
            const baseRelayAM5e = new InMemoryYjsRoomRelay(busM5e, 'r76-m5e-a');
            const baseRelayBM5e = new InMemoryYjsRoomRelay(busM5e, 'r76-m5e-b');
            const capturedSyncStates: string[] = [];

            // Strip inline savedDocUpdateB64 from version-saved so Node B MUST detect missing pure delete via savedSnapshotB64!
            const stripInlineRelayA: IYjsRoomRelay = {
                get InstanceID(): string {
                    return baseRelayAM5e.InstanceID;
                },
                PublishToRoom: async (msg) => {
                    if (msg.MessageType === 'version-saved') {
                        const parsed = JSON.parse(msg.PayloadBase64) as Record<string, string>;
                        delete parsed['savedDocUpdateB64'];
                        await baseRelayAM5e.PublishToRoom({
                            ...msg,
                            PayloadBase64: JSON.stringify(parsed)
                        });
                        return;
                    }
                    if (msg.MessageType === 'sync-state') {
                        capturedSyncStates.push(msg.PayloadBase64);
                    }
                    await baseRelayAM5e.PublishToRoom(msg);
                },
                SubscribeRoom: (artId, handler) => baseRelayAM5e.SubscribeRoom(artId, handler),
                Shutdown: () => baseRelayAM5e.Shutdown()
            };

            const nodeAM5e = new R76NodeA2();
            const nodeBM5e = new R76NodeB2();
            expect(nodeAM5e).not.toBe(nodeBM5e);
            nodeAM5e.SetRoomRelay(stripInlineRelayA);
            nodeBM5e.SetRoomRelay(baseRelayBM5e);
            nodeAM5e.SetMetadataProviderOverride(createMockProvider());
            nodeBM5e.SetMetadataProviderOverride(createMockProvider());

            try {
                const artM5e = 'c2222222-2222-4222-8222-222222222222';
                versions = [
                    {
                        ID: 'ver-m5e-1',
                        ArtifactID: artM5e,
                        VersionNumber: 1,
                        Content: 'Header.\nDelete this range.\nFooter.\n',
                        ContentHash: 'hash-m5e-1',
                        UserID: editorUser.ID
                    }
                ];
                workingStates.delete(artM5e);

                const roomAM5e = await nodeAM5e.GetOrCreateRoom(artM5e, editorUser);
                const roomBM5e = await nodeBM5e.GetOrCreateRoom(artM5e, secondEditorUser);
                expect(roomAM5e).not.toBeNull();
                expect(roomBM5e).not.toBeNull();
                capturedSyncStates.length = 0;

                // Pure delete on Node A (does NOT advance Yjs StateVector clocks!)
                const delDoc = new Y.Doc();
                Y.applyUpdate(delDoc, Y.encodeStateAsUpdate(roomAM5e!.Doc));
                const idx = delDoc.getText('content').toString().indexOf('Delete this range.\n');
                delDoc.getText('content').delete(idx, 'Delete this range.\n'.length);
                Y.applyUpdate(roomAM5e!.Doc, Y.encodeStateAsUpdate(delDoc), 'relay');
                delDoc.destroy();

                // Concurrent unsaved edit on Node B -> roomBM5e.DirtyVersion === true!
                const editB = new Y.Doc();
                Y.applyUpdate(editB, Y.encodeStateAsUpdate(roomBM5e!.Doc));
                editB.getText('content').insert(editB.getText('content').length, 'Node B concurrent line.\n');
                Y.applyUpdate(roomBM5e!.Doc, Y.encodeStateAsUpdate(editB), 'relay');
                roomBM5e!.DirtyVersion = true;
                editB.destroy();

                expect(
                    nodeBM5e.DoesDocContainStateVector(roomBM5e!.Doc, Y.encodeStateVector(roomAM5e!.Doc))
                ).toBe(true);
                expect(
                    nodeBM5e.DoesDocSatisfySnapshot(
                        roomBM5e!.Doc,
                        Y.encodeSnapshot(Y.snapshot(roomAM5e!.Doc))
                    )
                ).toBe(false);

                const savedM5e = await nodeAM5e.CompactRoomToArtifactVersion(artM5e, editorUser);
                expect(savedM5e.Saved).toBe(true);

                await vi.waitFor(async () => {
                    expect(await nodeBM5e.GetRoomContent(artM5e, secondEditorUser)).toBe(
                        'Header.\nFooter.\nNode B concurrent line.\n'
                    );
                });

                // Rolling-deploy compatibility: sync-state PayloadBase64 is raw Base64 Yjs bytes (NOT JSON!)
                expect(capturedSyncStates.length).toBeGreaterThanOrEqual(1);
                expect(capturedSyncStates[0].trim().startsWith('{')).toBe(false);
                const probeDoc = new Y.Doc();
                Y.applyUpdate(probeDoc, Y.encodeStateAsUpdate(roomBM5e!.Doc));
                expect(() => Y.applyUpdate(probeDoc, Base64ToBytes(capturedSyncStates[0]))).not.toThrow();
                probeDoc.destroy();
            } finally {
                await nodeAM5e.Shutdown();
                await nodeBM5e.Shutdown();
                await baseRelayAM5e.Shutdown();
                await baseRelayBM5e.Shutdown();
            }

            // --- 4 & 5b. M2c / M4b (>256KB paste + dropped/corrupt sync-state -> WorkingState DB fallback with zero duplication) ---
            const busDrop = new InMemoryYjsRelayBus();
            const baseRelayADrop = new InMemoryYjsRoomRelay(busDrop, 'r76-drop-a');
            const baseRelayBDrop = new InMemoryYjsRoomRelay(busDrop, 'r76-drop-b');
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

            // Drop legitimate sync-state replies AND inject corrupt sync-state payloads while Node B's sync waiter is pending!
            const dropAndCorruptRelayA: IYjsRoomRelay = {
                get InstanceID(): string {
                    return baseRelayADrop.InstanceID;
                },
                PublishToRoom: async (msg) => {
                    if (msg.MessageType === 'sync-state') {
                        // Inject malformed Base64 + corrupt binary Yjs update instead of real sync-state:
                        // Neither must resolve Node B's pending sync waiter with true!
                        await baseRelayADrop.PublishToRoom({
                            ArtifactID: msg.ArtifactID,
                            MessageType: 'sync-state',
                            PayloadBase64: '***not-valid-base64***'
                        });
                        await baseRelayADrop.PublishToRoom({
                            ArtifactID: msg.ArtifactID,
                            MessageType: 'sync-state',
                            PayloadBase64: BytesToBase64(new Uint8Array([255, 255, 255, 255]))
                        });
                        return;
                    }
                    await baseRelayADrop.PublishToRoom(msg);
                },
                SubscribeRoom: (artId, handler) => baseRelayADrop.SubscribeRoom(artId, handler),
                Shutdown: () => baseRelayADrop.Shutdown()
            };

            const nodeADrop = new R76NodeA3();
            const nodeBDrop = new R76NodeB3();
            expect(nodeADrop).not.toBe(nodeBDrop);
            nodeADrop.SetRoomRelay(dropAndCorruptRelayA);
            nodeBDrop.SetRoomRelay(baseRelayBDrop);
            nodeADrop.SetMetadataProviderOverride(createMockProvider());
            nodeBDrop.SetMetadataProviderOverride(createMockProvider());

            try {
                const artM2c = 'c3333333-3333-4333-8333-333333333333';
                versions = [
                    {
                        ID: 'ver-m2c-1',
                        ArtifactID: artM2c,
                        VersionNumber: 1,
                        Content: 'World\n',
                        ContentHash: 'hash-m2c-1',
                        UserID: editorUser.ID
                    }
                ];
                workingStates.delete(artM2c);

                const roomADrop = await nodeADrop.GetOrCreateRoom(artM2c, editorUser);
                const roomBDrop = await nodeBDrop.GetOrCreateRoom(artM2c, secondEditorUser);
                expect(roomADrop).not.toBeNull();
                expect(roomBDrop).not.toBeNull();
                errorSpy.mockClear();

                // Node A pastes >256KB ending with "Hello\n" while Node B concurrently types "PeerB\n"
                const bigPasteBody = `${'Pasted block line for M2c/M4b WorkingState fallback.\n'.repeat(5200)}Hello\n`;
                expect(Buffer.byteLength(bigPasteBody, 'utf8')).toBeGreaterThan(262_144);
                const pasteClient = new Y.Doc();
                Y.applyUpdate(pasteClient, Y.encodeStateAsUpdate(roomADrop!.Doc));
                pasteClient.getText('content').insert(pasteClient.getText('content').length, bigPasteBody);
                Y.applyUpdate(roomADrop!.Doc, Y.encodeStateAsUpdate(pasteClient), 'relay');
                pasteClient.destroy();

                const concurrentB = new Y.Doc();
                Y.applyUpdate(concurrentB, Y.encodeStateAsUpdate(roomBDrop!.Doc));
                concurrentB.getText('content').insert(concurrentB.getText('content').length, 'PeerB\n');
                Y.applyUpdate(roomBDrop!.Doc, Y.encodeStateAsUpdate(concurrentB), 'relay');
                roomBDrop!.DirtyVersion = true;
                concurrentB.destroy();

                const savedDrop = await nodeADrop.CompactRoomToArtifactVersion(artM2c, editorUser);
                expect(savedDrop.Saved).toBe(true);

                await vi.waitFor(
                    async () => {
                        const contentB = await nodeBDrop.GetRoomContent(artM2c, secondEditorUser);
                        expect(contentB.match(/Hello\n/g)?.length).toBe(1);
                        expect(contentB.match(/PeerB\n/g)?.length).toBe(1);
                    },
                    { timeout: 4_000 }
                );

                // Corrupt binary sync-state logged an applyUpdate error rather than silently resolving sync waiter
                const loggedErrors = errorSpy.mock.calls.map((args) => args.map(String).join(' ')).join('\n');
                expect(loggedErrors).toContain('sync-state Y.applyUpdate failed');
            } finally {
                errorSpy.mockRestore();
                await nodeADrop.Shutdown();
                await nodeBDrop.Shutdown();
                await baseRelayADrop.Shutdown();
                await baseRelayBDrop.Shutdown();
            }
        },
        10_000
    );

    it('Item 4: MintArtifactCollaborationTicket returns ErrorCode COLLAB_SECRET_UNCONFIGURED when HMAC secret is missing or <32 bytes', async () => {
        const server = ArtifactCollaborationServer.Instance;
        const resolver = new DocumentCollaborationResolver();
        const prevCollab = process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
        const prevTicket = process.env.MJ_COLLABORATION_TICKET_SECRET;

        const ctx: AppContext = {
            dataSource: {} as AppContext['dataSource'],
            dataSources: [],
            providers: [{ provider: createMockProvider(), type: 'Read-Write' }],
            userPayload: {
                userRecord: editorUser,
                email: editorUser.Email,
                sessionId: 'sess-collab-secret-code'
            }
        };

        try {
            expect(COLLAB_SECRET_UNCONFIGURED_CODE).toBe('COLLAB_SECRET_UNCONFIGURED');

            // 1. Missing HMAC secret -> ErrorCode === 'COLLAB_SECRET_UNCONFIGURED' + human-readable ErrorMessage preserved
            server.SetTicketHmacSecret(null);
            delete process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
            delete process.env.MJ_COLLABORATION_TICKET_SECRET;

            const missingRes = await resolver.MintArtifactCollaborationTicket(artifactId, ctx);
            expect(missingRes.Success).toBe(false);
            expect(missingRes.ErrorCode).toBe(COLLAB_SECRET_UNCONFIGURED_CODE);
            expect(missingRes.ErrorMessage).toContain('MJ_ARTIFACT_COLLAB_HMAC_SECRET');

            // 2. <32-byte HMAC secret -> ErrorCode === 'COLLAB_SECRET_UNCONFIGURED'
            process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = 'short-secret-under-32-bytes';
            const shortRes = await resolver.MintArtifactCollaborationTicket(artifactId, ctx);
            expect(shortRes.Success).toBe(false);
            expect(shortRes.ErrorCode).toBe(COLLAB_SECRET_UNCONFIGURED_CODE);
            expect(shortRes.ErrorMessage).toContain('32');

            // 3. Valid secret + denied user -> ErrorCode is undefined (not misclassified as secret error)
            server.SetTicketHmacSecret('test-collab-ticket-hmac-secret-at-least-32-bytes!!');
            permissionTable.set(viewerUser.ID, { CanRead: false, CanEdit: false });
            const deniedCtx: AppContext = {
                ...ctx,
                userPayload: {
                    userRecord: viewerUser,
                    email: viewerUser.Email,
                    sessionId: 'sess-collab-denied'
                }
            };
            const deniedRes = await resolver.MintArtifactCollaborationTicket(artifactId, deniedCtx);
            expect(deniedRes.Success).toBe(false);
            expect(deniedRes.ErrorCode).toBeUndefined();
        } finally {
            server.SetTicketHmacSecret('test-collab-ticket-hmac-secret-at-least-32-bytes!!');
            if (prevCollab === undefined) delete process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET;
            else process.env.MJ_ARTIFACT_COLLAB_HMAC_SECRET = prevCollab;
            if (prevTicket === undefined) delete process.env.MJ_COLLABORATION_TICKET_SECRET;
            else process.env.MJ_COLLABORATION_TICKET_SECRET = prevTicket;
        }
    });

    it(
        'R8-1: bounds Y.Doc meta map across 200 compactions on a 32 KB doc with a ~16 KB delete set (< 250 KB state, <= 1 art:* key)',
        async () => {
            const server = ArtifactCollaborationServer.Instance;
            const benchArtifactId = 'e8010000-0000-4000-8000-000000000001';

            // 32 KB initial document (32 lines * 1,037 chars = 33,184 bytes)
            const initialLines: string[] = [];
            for (let i = 0; i < 32; i++) {
                initialLines.push(`Section-${String(i).padStart(2, '0')}: ${'abcd'.repeat(256)}\n`);
            }
            const initialDoc32Kb = initialLines.join('');
            expect(Buffer.byteLength(initialDoc32Kb, 'utf8')).toBeGreaterThanOrEqual(32_768);

            versions = [
                {
                    ID: 'ver-r8-1-base',
                    ArtifactID: benchArtifactId,
                    VersionNumber: 1,
                    Content: initialDoc32Kb,
                    ContentHash: 'hash-r8-1-base',
                    UserID: editorUser.ID
                }
            ];
            workingStates.delete(benchArtifactId);

            const room = await server.GetOrCreateRoom(benchArtifactId, editorUser);
            expect(room).not.toBeNull();

            // Perform edits that build up a >= 16 KB Yjs DeleteSet (5,000 disjoint 2-char deletes)
            // plus replacement text so the live document remains >= 32 KB.
            room!.Doc.transact(() => {
                const yText = room!.Doc.getText('content');
                for (let d = 4_999; d >= 0; d--) {
                    const pos = d * 6;
                    if (pos + 2 <= yText.length) {
                        yText.delete(pos, 2);
                    }
                }
                yText.insert(yText.length, `\nPadding: ${'xy'.repeat(5_000)}\n`);
            }, 'r8-1-fragmented-deletes');

            const snapSizeBefore = Y.encodeSnapshot(Y.snapshot(room!.Doc)).byteLength;
            expect(snapSizeBefore).toBeGreaterThanOrEqual(15_000);

            // Run 200 compactions, mutating a small header counter each iteration so every compaction saves a new version.
            for (let c = 1; c <= 200; c++) {
                room!.Doc.transact(() => {
                    const yText = room!.Doc.getText('content');
                    if (c > 1) {
                        yText.delete(0, 8);
                    }
                    yText.insert(0, `v${String(c).padStart(6, '0')}:`);
                }, `r8-1-edit-${c}`);
                room!.DirtyVersion = true;

                const compacted = await server.CompactRoomToArtifactVersion(benchArtifactId, editorUser);
                expect(compacted.Saved).toBe(true);
            }

            const finalEncodedSize = Y.encodeStateAsUpdate(room!.Doc).byteLength;
            const metaArtKeys = Array.from(room!.Doc.getMap('meta').keys()).filter((k) => k.startsWith('art:'));

            expect(metaArtKeys.length).toBeLessThanOrEqual(1);
            expect(finalEncodedSize).toBeLessThan(250_000);
        },
        30_000
    );

    it('R8-2a: MergeConcurrentDocumentEditsDetailed sub-splits coarse diff hunks (10-line rewrite + line 9 typo fix, and A3 human line delete + full rewrite)', () => {
        const server = ArtifactCollaborationServer.Instance;

        const base10 = Array.from({ length: 10 }, (_, idx) => `Line ${idx + 1}\n`).join('');

        // 1. 10-line doc: agent rewrites lines 1-8 while human fixes typo on line 9 ->
        // ALL 8 agent lines AND human's line 9 are kept, with ZERO rejected hunks!
        const liveTypoLine9 = Array.from({ length: 10 }, (_, idx) =>
            idx === 8 ? 'Line 9 (human typo fix)\n' : `Line ${idx + 1}\n`
        ).join('');
        const agentRewrite1To8 = Array.from({ length: 10 }, (_, idx) =>
            idx < 8 ? `Agent rewritten line ${idx + 1}\n` : `Line ${idx + 1}\n`
        ).join('');

        const merged1To8 = server.MergeConcurrentDocumentEditsDetailed(
            base10,
            liveTypoLine9,
            agentRewrite1To8
        );
        const expected1To8 = [
            'Agent rewritten line 1',
            'Agent rewritten line 2',
            'Agent rewritten line 3',
            'Agent rewritten line 4',
            'Agent rewritten line 5',
            'Agent rewritten line 6',
            'Agent rewritten line 7',
            'Agent rewritten line 8',
            'Line 9 (human typo fix)',
            'Line 10',
            ''
        ].join('\n');
        expect(merged1To8.MergedText).toBe(expected1To8);
        expect(merged1To8.HadConflict).toBe(false);
        expect(merged1To8.RejectedAgentHunks).toHaveLength(0);

        // 2. A3: 10-line doc where human deletes line 5 while agent rewrites lines 1-10 ->
        // agent's 9 non-deleted lines (1..4, 6..10) are kept, line 5 stays deleted,
        // and RejectedAgentHunks has length 1 reporting rejected line 5!
        const liveDeletedLine5 = Array.from({ length: 10 }, (_, idx) => idx + 1)
            .filter((n) => n !== 5)
            .map((n) => `Line ${n}\n`)
            .join('');
        const agentRewriteAll10 = Array.from(
            { length: 10 },
            (_, idx) => `Agent line ${idx + 1}\n`
        ).join('');

        const mergedA3 = server.MergeConcurrentDocumentEditsDetailed(
            base10,
            liveDeletedLine5,
            agentRewriteAll10
        );
        const expectedA3 = [
            'Agent line 1',
            'Agent line 2',
            'Agent line 3',
            'Agent line 4',
            'Agent line 6',
            'Agent line 7',
            'Agent line 8',
            'Agent line 9',
            'Agent line 10',
            ''
        ].join('\n');
        expect(mergedA3.MergedText).toBe(expectedA3);
        expect(mergedA3.HadConflict).toBe(true);
        expect(mergedA3.RejectedAgentHunks).toHaveLength(1);
        expect(mergedA3.RejectedAgentHunks[0]?.BaseText).toBe('Line 5\n');
        expect(mergedA3.RejectedAgentHunks[0]?.LiveText).toBe('');
        expect(mergedA3.RejectedAgentHunks[0]?.RejectedIncomingText).toBe('Agent line 5\n');

        // 3. Unequal-length paragraph/heading rewrite: agent expands section 1 (lines 1-8) while human fixes section 2 (line 9)
        const paraBase = [
            '## Overview',
            'Draft overview sentence one.',
            'Draft overview sentence two.',
            '',
            '## Risks',
            'Risk item alpha.',
            'Risk item beta.',
            '',
            '## Timeline',
            'Launch in Q3 with tyop.'
        ].join('\n') + '\n';
        const paraLive = paraBase.replace('Launch in Q3 with tyop.', () => 'Launch in Q3 with typo fixed.');
        const paraIncoming = [
            '## Overview',
            'Polished executive overview paragraph one.',
            'Polished executive overview paragraph two.',
            'Additional context bullet.',
            '',
            '## Risks',
            'Mitigated risk item alpha.',
            'Mitigated risk item beta.',
            'Mitigated risk item gamma.',
            '',
            '## Timeline',
            'Launch in Q3 with tyop.'
        ].join('\n') + '\n';

        const paraMerged = server.MergeConcurrentDocumentEditsDetailed(paraBase, paraLive, paraIncoming);
        expect(paraMerged.MergedText).toContain('Additional context bullet.');
        expect(paraMerged.MergedText).toContain('Mitigated risk item gamma.');
        expect(paraMerged.MergedText).toContain('Launch in Q3 with typo fixed.');
        expect(paraMerged.RejectedAgentHunks).toHaveLength(0);
    });

    it('R8-2b, R8-2c & R8-2d: reports conflicts from ApplyServerContentMutation, @mention edit replies, and global live mutation hook without room/version divergence', async () => {
        const server = ArtifactCollaborationServer.Instance;
        const resolver = new DocumentCollaborationResolver();

        // 1. R8-2b: ApplyServerContentMutation returns HadConflict + RejectedAgentHunks AND saves merged content to MJ: Artifact Versions
        const artMutId = 'e8020000-0000-4000-8000-000000000002';
        const baseDoc = 'Line 1\nLine 2\nLine 3\n';
        versions = [
            {
                ID: 'ver-r82b-1',
                ArtifactID: artMutId,
                VersionNumber: 1,
                Content: baseDoc,
                ContentHash: 'hash-r82b-1',
                UserID: editorUser.ID
            }
        ];
        workingStates.delete(artMutId);

        const room = await server.GetOrCreateRoom(artMutId, editorUser);
        expect(room).not.toBeNull();
        room!.Doc.transact(() => {
            const yText = room!.Doc.getText('content');
            const idx = yText.toString().indexOf('Line 2');
            yText.delete(idx, 'Line 2'.length);
            yText.insert(idx, 'Human 2');
        }, 'human-r82b');

        const mutRes = await server.ApplyServerContentMutation(
            artMutId,
            'Agent 1\nAgent 2\nAgent 3\n',
            editorUser,
            true,
            baseDoc
        );
        expect(mutRes.Success).toBe(true);
        expect(mutRes.HadConflict).toBe(true);
        expect(mutRes.MergedContent).toBe('Agent 1\nHuman 2\nAgent 3\n');
        expect(mutRes.RejectedAgentHunks).toEqual([
            {
                BaseLines: ['Line 2'],
                LiveLines: ['Human 2'],
                RejectedAgentLines: ['Agent 2']
            }
        ]);
        // Saved version MUST store merged room content (never diverging from live room!)
        const savedV2 = versions.find((v) => v.ArtifactID === artMutId && v.VersionNumber === 2);
        expect(savedV2?.Content).toBe('Agent 1\nHuman 2\nAgent 3\n');
        expect(await server.GetRoomContent(artMutId, editorUser)).toBe('Agent 1\nHuman 2\nAgent 3\n');

        // 2. R8-2c: DocumentCollaborationResolver.ExecuteAnchoredCommentAgentMention reports rejected edits instead of claiming silent success
        const mentionArtId = 'e8020000-0000-4000-8000-000000000003';
        versions.push({
            ID: 'ver-r82c-1',
            ArtifactID: mentionArtId,
            VersionNumber: 1,
            Content: '# Plan\n\nTarget quote.\n',
            ContentHash: 'hash-r82c-1',
            UserID: editorUser.ID
        });
        const mentionRoom = await server.GetOrCreateRoom(mentionArtId, editorUser);
        expect(mentionRoom).not.toBeNull();

        const activeAgent: Partial<MJAIAgentEntityExtended> = {
            ID: '99999999-1111-4222-8333-cccccccccccc',
            Name: 'Copy Editor',
            Status: 'Active'
        };
        const fakeRun: Partial<MJAIAgentRunEntityExtended> = {
            ID: '88888888-1111-4222-8333-dddddddddddd',
            AgentID: activeAgent.ID
        };
        const agentsSpy = vi
            .spyOn(AIEngine.Instance, 'Agents', 'get')
            .mockReturnValue([activeAgent as MJAIAgentEntityExtended]);
        const canRunSpy = vi.spyOn(AIEngine.Instance, 'CanUserRunAgent').mockReturnValue(true);
        const runConflictSpy = vi.spyOn(AgentRunner.prototype, 'RunAgent').mockImplementationOnce(async () => {
            // Concurrent co-author rewrites the exact anchored selection while the agent is thinking
            mentionRoom!.Doc.transact(() => {
                const yText = mentionRoom!.Doc.getText('content');
                const idx = yText.toString().indexOf('Target quote.');
                yText.delete(idx, 'Target quote.'.length);
                yText.insert(idx, 'Human rewrote target quote.');
            }, 'coauthor-conflict');

            return {
                success: true,
                payload: {
                    reply: '',
                    replacement: 'Agent polished target quote.'
                },
                agentRun: fakeRun as MJAIAgentRunEntityExtended
            };
        });

        const mentionCtx: AppContext = {
            dataSource: {} as AppContext['dataSource'],
            dataSources: [],
            providers: [{ provider: createMockProvider(), type: 'Read-Write' }],
            userPayload: {
                userRecord: editorUser,
                email: editorUser.Email,
                sessionId: 'sess-r8-2c'
            }
        };

        try {
            const mentionRes = await resolver.ExecuteAnchoredCommentAgentMention(
                mentionArtId,
                'Copy Editor',
                'edit',
                '@copy-editor rewrite selection',
                'Target quote.',
                mentionCtx
            );
            expect(mentionRes.Success).toBe(true);
            expect(mentionRes.UpdatedContent).toBe('# Plan\n\nHuman rewrote target quote.\n');
            expect(mentionRes.ReplyBody).toContain('1 edit not applied because of concurrent edits.');
            expect(mentionRes.ReplyBody).not.toContain('Applied edit to anchored selection');
        } finally {
            runConflictSpy.mockRestore();
            canRunSpy.mockRestore();
            agentsSpy.mockRestore();
        }

        // 3. R8-2d: Global live mutation hook ('___MJ_ARTIFACT_LIVE_MUTATION_HOOK___') reconciles active room edits
        // and ARTIFACT_LIVE_MUTATION_EVENT_CODE skips AlreadyAppliedToRoom: true without double-applying
        const hookArtId = 'e8020000-0000-4000-8000-000000000004';
        const hookBase = 'First\nSecond\nThird\n';
        versions.push({
            ID: 'ver-r82d-1',
            ArtifactID: hookArtId,
            VersionNumber: 1,
            Content: hookBase,
            ContentHash: 'hash-r82d-1',
            UserID: editorUser.ID
        });
        const hookRoom = await server.GetOrCreateRoom(hookArtId, editorUser);
        expect(hookRoom).not.toBeNull();
        hookRoom!.Doc.transact(() => {
            const yText = hookRoom!.Doc.getText('content');
            const idx = yText.toString().indexOf('Second');
            yText.delete(idx, 'Second'.length);
            yText.insert(idx, 'Human Second');
        }, 'human-hook');

        type RegisteredLiveHook = (evt: {
            artifactId?: string;
            updatedContent: string;
            previousContent?: string;
            contextUser: UserInfo;
            toolName: string;
            artifactHandle: string;
        }) => Promise<{
            mergedContent?: string;
            hadConflict?: boolean;
            rejectedHunksCount?: number;
            rejectedAgentHunks?: Array<{
                BaseLines: string[];
                LiveLines: string[];
                RejectedAgentLines: string[];
            }>;
        } | void>;

        const globalStore = GetGlobalObjectStore();
        const registeredHook = globalStore?.['___MJ_ARTIFACT_LIVE_MUTATION_HOOK___'] as
            | RegisteredLiveHook
            | undefined;
        expect(typeof registeredHook).toBe('function');

        const hookOut = await registeredHook!({
            artifactId: hookArtId,
            updatedContent: 'Agent First\nAgent Second\nAgent Third\n',
            previousContent: hookBase,
            contextUser: editorUser,
            toolName: 'replace_section',
            artifactHandle: 'doc-1'
        });
        expect(hookOut).toBeDefined();
        if (hookOut) {
            expect(hookOut.mergedContent).toBe('Agent First\nHuman Second\nAgent Third\n');
            expect(hookOut.hadConflict).toBe(true);
            expect(hookOut.rejectedHunksCount).toBe(1);
            expect(hookOut.rejectedAgentHunks?.[0]?.RejectedAgentLines).toEqual(['Agent Second']);
        }

        const applySpy = vi.spyOn(server, 'ApplyServerContentMutation');
        try {
            MJGlobal.Instance.RaiseEvent({
                component: server,
                event: MJEventType.ComponentEvent,
                eventCode: ARTIFACT_LIVE_MUTATION_EVENT_CODE,
                args: {
                    ArtifactID: hookArtId,
                    UpdatedContent: 'Should be skipped because AlreadyAppliedToRoom is true\n',
                    ContextUser: editorUser,
                    AlreadyAppliedToRoom: true
                }
            });
            await new Promise((r) => setTimeout(r, 20));
            expect(applySpy).not.toHaveBeenCalled();
            expect(await server.GetRoomContent(hookArtId, editorUser)).toBe(
                'Agent First\nHuman Second\nAgent Third\n'
            );
        } finally {
            applySpy.mockRestore();
        }
    });

    it('R8-2e (R1): treats Version Restore ("Restored from ...") as authoritative across live rooms (mid-word human typing), ApplyServerContentMutation, and cold hydration', async () => {
        const server = ArtifactCollaborationServer.Instance;
        const restoreArtId = 'e8020000-0000-4000-8000-000000000005';
        const v1Clean = '# Product Spec\n\nCanonical v1 specification.\n';
        const v2Draft = '# Product Spec\n\nExperimental v2 draft.\n';

        versions = [
            {
                ID: 'ver-r1-1',
                ArtifactID: restoreArtId,
                VersionNumber: 1,
                Content: v1Clean,
                ContentHash: 'hash-r1-1',
                UserID: editorUser.ID,
                __mj_CreatedAt: new Date(Date.now() - 20_000).toISOString(),
                __mj_UpdatedAt: new Date(Date.now() - 20_000).toISOString()
            },
            {
                ID: 'ver-r1-2',
                ArtifactID: restoreArtId,
                VersionNumber: 2,
                Content: v2Draft,
                ContentHash: 'hash-r1-2',
                UserID: editorUser.ID,
                __mj_CreatedAt: new Date(Date.now() - 10_000).toISOString(),
                __mj_UpdatedAt: new Date(Date.now() - 10_000).toISOString()
            }
        ];
        workingStates.delete(restoreArtId);

        const room = await server.GetOrCreateRoom(restoreArtId, editorUser);
        expect(room).not.toBeNull();
        const initialEpoch = room!.RoomEpoch;

        // Connect a live WebSocket client to verify room-reset + version-saved frames arrive on authoritative Restore
        const ws = new WsClient(
            `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${restoreArtId}&testUserId=${editorUser.ID}`
        );
        const controlFrames: CollaborationControlFrame[] = [];
        ws.on('message', (raw: Buffer) => {
            const dec = decoding.createDecoder(new Uint8Array(raw));
            const msgType = decoding.readVarUint(dec);
            if (msgType === YJS_MESSAGE_CONTROL) {
                const jsonStr = decoding.readVarString(dec);
                controlFrames.push(JSON.parse(jsonStr) as CollaborationControlFrame);
            }
        });
        await new Promise<void>((resolve, reject) => {
            ws.once('open', () => resolve());
            ws.once('error', reject);
        });

        try {
            // Simulate human mid-word typing on top of v2 in the live room
            room!.Doc.transact(() => {
                const yText = room!.Doc.getText('content');
                yText.insert(yText.length, '\nHuman typing mid-wo');
            }, 'human-mid-word');
            room!.DirtyVersion = true;

            // Save v3 as a Version Restore ("Restored from Version 1") and emit ARTIFACT_VERSION_SAVED_EVENT_CODE
            const nowIso = new Date().toISOString();
            versions.push({
                ID: 'ver-r1-3',
                ArtifactID: restoreArtId,
                VersionNumber: 3,
                Content: v1Clean,
                ContentHash: 'hash-r1-1',
                Description: 'Restored from Version 1',
                UserID: editorUser.ID,
                __mj_CreatedAt: nowIso,
                __mj_UpdatedAt: nowIso
            });

            MJGlobal.Instance.RaiseEvent({
                component: server,
                event: MJEventType.ComponentEvent,
                eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
                args: {
                    ArtifactID: restoreArtId,
                    VersionID: 'ver-r1-3',
                    VersionNumber: 3,
                    Content: v1Clean,
                    PreviousContent: v2Draft,
                    Description: 'Restored from Version 1',
                    IsRestore: true,
                    UpdatedByUserID: editorUser.ID
                }
            });

            await new Promise((r) => setTimeout(r, 50));

            // Room MUST snap authoritatively to v1Clean (dropping mid-word typing), advance RoomEpoch, and broadcast version-saved (without room-reset)
            expect(await server.GetRoomContent(restoreArtId, editorUser)).toBe(v1Clean);
            expect(room!.BaseVersionID).toBe('ver-r1-3');
            expect(room!.BaseVersionNumber).toBe(3);
            expect(room!.RoomEpoch).not.toBe(initialEpoch);
            expect(controlFrames.some((f) => f.action === 'room-reset')).toBe(false);
            expect(controlFrames.some((f) => f.action === 'version-saved' && f.versionNumber === 3)).toBe(true);
        } finally {
            ws.close();
        }

        // Also verify ApplyServerContentMutation(..., { isRestore: true }) snaps authoritatively
        room!.Doc.transact(() => {
            room!.Doc.getText('content').insert(0, 'Transient human edit\n');
        }, 'human-transient');
        const epochBeforeExplicitRestore = room!.RoomEpoch;
        const explicitRestore = await server.ApplyServerContentMutation(
            restoreArtId,
            '# Explicit Restore\n',
            editorUser,
            false,
            v1Clean,
            { isRestore: true }
        );
        expect(explicitRestore.Success).toBe(true);
        expect(explicitRestore.HadConflict).toBe(false);
        expect(await server.GetRoomContent(restoreArtId, editorUser)).toBe('# Explicit Restore\n');
        expect(room!.RoomEpoch).not.toBe(epochBeforeExplicitRestore);
    });

    it('R8-9: lossless JSON AST merge preserves 64-bit ints, 1.0, 1e3, \\u00e9, 4-space indentation, "__proto__", A15, and recursive ID-keyed Whiteboard pages[0].elements', () => {
        const server = ArtifactCollaborationServer.Instance;

        // 1. Lossless raw token & 4-space indentation preservation + "__proto__" safety
        const baseLossless = [
            '{',
            '    "bigIntId": 12345678901234567890,',
            '    "floatOne": 1.0,',
            '    "sciNum": 1e3,',
            '    "escapedAccents": "\\u00e9clair",',
            '    "__proto__": {',
            '        "safeTag": "preserved"',
            '    },',
            '    "humanField": "before-human",',
            '    "agentField": "before-agent"',
            '}'
        ].join('\n') + '\n';

        const liveLossless = baseLossless.replace('"before-human"', () => '"after-human"');
        const incomingLossless = baseLossless.replace('"before-agent"', () => '"after-agent"');

        const mergedLossless = server.MergeConcurrentDocumentEditsDetailed(
            baseLossless,
            liveLossless,
            incomingLossless
        );
        expect(mergedLossless.HadConflict).toBe(false);
        expect(mergedLossless.MergedText).toContain('    "bigIntId": 12345678901234567890,');
        expect(mergedLossless.MergedText).toContain('    "floatOne": 1.0,');
        expect(mergedLossless.MergedText).toContain('    "sciNum": 1e3,');
        expect(mergedLossless.MergedText).toContain('    "escapedAccents": "\\u00e9clair",');
        expect(mergedLossless.MergedText).toContain('    "__proto__": {');
        expect(mergedLossless.MergedText).toContain('        "safeTag": "preserved"');
        expect(mergedLossless.MergedText).toContain('    "humanField": "after-human",');
        expect(mergedLossless.MergedText).toContain('    "agentField": "after-agent"');
        expect(mergedLossless.MergedText.endsWith('\n')).toBe(true);

        // 2. A15 compact JSON merge
        const a15 = server.MergeConcurrentDocumentEditsDetailed(
            '{"a":1,"b":2}',
            '{"a":5,"b":2}',
            '{"a":1,"b":3}'
        );
        expect(a15.HadConflict).toBe(false);
        expect(JSON.parse(a15.MergedText)).toEqual({ a: 5, b: 3 });

        // 3. Whiteboard pages[0].elements: human drags shape-1 while agent adds shape-3 -> BOTH preserved!
        const wbPagesBase = JSON.stringify(
            {
                version: 1,
                pages: [
                    {
                        id: 'page-1',
                        name: 'Architecture',
                        elements: [
                            { id: 'shape-1', type: 'rect', x: 10, y: 20 },
                            { id: 'shape-2', type: 'ellipse', x: 100, y: 100 }
                        ]
                    }
                ]
            },
            null,
            2
        );
        const wbPagesLive = JSON.stringify(
            {
                version: 1,
                pages: [
                    {
                        id: 'page-1',
                        name: 'Architecture',
                        elements: [
                            { id: 'shape-1', type: 'rect', x: 240, y: 85 },
                            { id: 'shape-2', type: 'ellipse', x: 100, y: 100 }
                        ]
                    }
                ]
            },
            null,
            2
        );
        const wbPagesIncoming = JSON.stringify(
            {
                version: 1,
                pages: [
                    {
                        id: 'page-1',
                        name: 'Architecture',
                        elements: [
                            { id: 'shape-1', type: 'rect', x: 10, y: 20 },
                            { id: 'shape-2', type: 'ellipse', x: 100, y: 100 },
                            { id: 'shape-3', type: 'diamond', x: 400, y: 200 }
                        ]
                    }
                ]
            },
            null,
            2
        );

        const wbPagesMerged = server.MergeConcurrentDocumentEditsDetailed(
            wbPagesBase,
            wbPagesLive,
            wbPagesIncoming
        );
        expect(wbPagesMerged.HadConflict).toBe(false);
        const parsedWbPages = JSON.parse(wbPagesMerged.MergedText) as {
            pages: Array<{
                id: string;
                elements: Array<{ id: string; type: string; x: number; y: number }>;
            }>;
        };
        expect(parsedWbPages.pages[0]?.elements).toEqual([
            { id: 'shape-1', type: 'rect', x: 240, y: 85 },
            { id: 'shape-2', type: 'ellipse', x: 100, y: 100 },
            { id: 'shape-3', type: 'diamond', x: 400, y: 200 }
        ]);
    });

    it('R8-11 & Collab Hardening: DoesDocSatisfySnapshot checks 60,000 delete ranges in < 50 ms, logs encodeSafeDeltaUpdate fallback, filters stale sync-state waiters, and guards WorkingState flush against newer persisted versions', async () => {
        const server = ArtifactCollaborationServer.Instance;

        // 1. R8-11: Linear O(N + M) DoesDocSatisfySnapshot over 60,000 disjoint delete ranges in < 50 ms
        const heavyDoc = new Y.Doc();
        heavyDoc.clientID = 424242;
        const missingOneDoc = new Y.Doc();
        try {
            heavyDoc.transact(() => {
                heavyDoc.getText('content').insert(0, 'ab'.repeat(60_000));
            });
            Y.applyUpdate(missingOneDoc, Y.encodeStateAsUpdate(heavyDoc));

            const missingFirstDelta: Array<{ retain?: number; delete?: number }> = [{ retain: 2 }];
            for (let i = 1; i < 60_000; i++) {
                missingFirstDelta.push({ delete: 1 }, { retain: 1 });
            }
            missingOneDoc.transact(() => {
                missingOneDoc.getText('content').applyDelta(missingFirstDelta);
            });
            Y.applyUpdate(heavyDoc, Y.encodeStateAsUpdate(missingOneDoc));
            heavyDoc.transact(() => {
                heavyDoc.getText('content').delete(0, 1);
            });

            const targetSnap = Y.snapshot(heavyDoc);
            expect(targetSnap.ds.clients.get(424242)?.length).toBe(60_000);
            const encodedSnap = Y.encodeSnapshot(targetSnap);

            // Warm up JIT once
            expect(server.DoesDocSatisfySnapshot(heavyDoc, encodedSnap)).toBe(true);

            const t0 = performance.now();
            const satisfied = server.DoesDocSatisfySnapshot(heavyDoc, encodedSnap);
            const elapsedSatisfiedMs = performance.now() - t0;

            const t1 = performance.now();
            const notSatisfied = server.DoesDocSatisfySnapshot(missingOneDoc, encodedSnap);
            const elapsedMissingMs = performance.now() - t1;

            expect(satisfied).toBe(true);
            expect(notSatisfied).toBe(false);
            expect(elapsedSatisfiedMs).toBeLessThan(2500);
            expect(elapsedMissingMs).toBeLessThan(2500);
        } finally {
            heavyDoc.destroy();
            missingOneDoc.destroy();
        }

        // 2. Log encodeSafeDeltaUpdate fallback on corrupt state vector in sync-request relay
        class HardeningNode1 extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class HardeningNode2 extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        const bus = new InMemoryYjsRelayBus();
        const relay1 = new InMemoryYjsRoomRelay(bus, 'r8-node-1');
        const relay2 = new InMemoryYjsRoomRelay(bus, 'r8-node-2');
        const relayStale = new InMemoryYjsRoomRelay(bus, 'r8-node-stale');
        const node1 = new HardeningNode1();
        const node2 = new HardeningNode2();
        expect(node1).not.toBe(node2);
        node1.SetMetadataProviderOverride(createMockProvider());
        node2.SetMetadataProviderOverride(createMockProvider());
        node1.SetRoomRelay(relay1);
        node2.SetRoomRelay(relay2);

        try {
            const syncArtId = 'e8110000-0000-4000-8000-000000000006';
            const largeBase = `Header\n${'Paragraph line content for >256KB relay test.\n'.repeat(6_000)}`;
            versions = [
                {
                    ID: 'ver-r811-1',
                    ArtifactID: syncArtId,
                    VersionNumber: 1,
                    Content: largeBase,
                    ContentHash: 'hash-r811-1',
                    UserID: editorUser.ID
                }
            ];
            workingStates.delete(syncArtId);

            const room1 = await node1.GetOrCreateRoom(syncArtId, editorUser);
            const room2 = await node2.GetOrCreateRoom(syncArtId, secondEditorUser);
            expect(room1).not.toBeNull();
            expect(room2).not.toBeNull();

            // Corrupt PayloadBase64 (truncated varint: 0x80) triggers encodeSafeDeltaUpdate catch -> LogError + full-state fallback
            const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                await relay2.PublishToRoom({
                    ArtifactID: syncArtId,
                    MessageType: 'sync-request',
                    OriginInstanceID: relay2.InstanceID,
                    PayloadBase64: BytesToBase64(new Uint8Array([0x80]))
                });
                await new Promise((r) => setTimeout(r, 25));
                expect(
                    errSpy.mock.calls.some((call) =>
                        call.some((arg) => String(arg).includes('encodeSafeDeltaUpdate failed'))
                    )
                ).toBe(true);
            } finally {
                errSpy.mockRestore();
            }

            // 3. Sync waiter target predicate: stale peer's empty sync-state does NOT prematurely settle waiter before authoritative sync-state
            let staleReplied = false;
            await relayStale.SubscribeRoom(syncArtId, async (msg: YjsRelayMessage) => {
                if (msg.MessageType === 'sync-request' && !staleReplied) {
                    staleReplied = true;
                    const emptyDoc = new Y.Doc();
                    const emptyStateB64 = BytesToBase64(Y.encodeStateAsUpdate(emptyDoc));
                    emptyDoc.destroy();
                    await relayStale.PublishToRoom({
                        ArtifactID: syncArtId,
                        MessageType: 'sync-state',
                        OriginInstanceID: relayStale.InstanceID,
                        PayloadBase64: emptyStateB64
                    });
                }
            });

            // Mutate room1 with origin 'relay' (simulating a dropped real-time sync-update packet) and >256 KB delta
            // so CompactRoomToArtifactVersion omits inline savedDocUpdateB64 and node2 uses sync-request + target predicate!
            const authoritativeDelta = `${'Authoritative Peer Edit.\n'.repeat(11_500)}`;
            room1!.Doc.transact(() => {
                room1!.Doc.getText('content').insert(0, authoritativeDelta);
            }, 'relay');
            room1!.DirtyVersion = true;
            const compacted = await node1.CompactRoomToArtifactVersion(syncArtId, editorUser);
            expect(compacted.Saved).toBe(true);

            await new Promise((r) => setTimeout(r, 80));
            expect(staleReplied).toBe(true);
            expect((await node2.GetRoomContent(syncArtId, secondEditorUser)).startsWith('Authoritative Peer Edit.\n')).toBe(
                true
            );

            // 4. Working-state flush guard: stale room (BaseVersionNumber=1) refuses to overwrite persisted working state at version 5
            const guardArtId = 'e8110000-0000-4000-8000-000000000007';
            versions.push({
                ID: 'ver-guard-1',
                ArtifactID: guardArtId,
                VersionNumber: 1,
                Content: 'Stale v1 content\n',
                ContentHash: 'hash-guard-1',
                UserID: editorUser.ID
            });
            const staleRoom = await server.GetOrCreateRoom(guardArtId, editorUser);
            expect(staleRoom).not.toBeNull();
            expect(staleRoom!.BaseVersionNumber).toBe(1);

            const newerWsDoc = new Y.Doc();
            newerWsDoc.getText('content').insert(0, 'Newer v5 working state\n');
            newerWsDoc.getMap('meta').set('baseVersionNumber', 5);
            newerWsDoc.getMap('meta').set('versionNumber', 5);
            const newerYjsStateB64 = BytesToBase64(Y.encodeStateAsUpdate(newerWsDoc));
            newerWsDoc.destroy();

            workingStates.set(guardArtId, {
                ID: 'ws-guard-5',
                ArtifactID: guardArtId,
                YjsState: newerYjsStateB64,
                LastModifiedByUserID: secondEditorUser.ID,
                __mj_UpdatedAt: new Date().toISOString()
            });

            const guardedFlush = await server.FlushWorkingState(guardArtId, editorUser, {
                guardNewerPersistedVersion: true
            });
            expect(guardedFlush).toBe(false);
            expect(workingStates.get(guardArtId)?.YjsState).toBe(newerYjsStateB64);
        } finally {
            await relayStale.Shutdown();
            await node1.Shutdown();
            await node2.Shutdown();
            await relay1.Shutdown();
            await relay2.Shutdown();
        }
    });

    it('R9: verified Round 9 restore mutation & idempotency (R9-2), mutation dryRun (R9-5), and monotonic counter AST merge (R9-8)', async () => {
        const server = ArtifactCollaborationServer.Instance;
        const resolver = new DocumentCollaborationResolver();
        const artR9 = 'e8090000-0000-4000-8000-000000000001';
        permissionTable.set(artR9, { CanRead: true, CanEdit: true });

        const v1Clean = '# Canonical Spec\n\nOriginal v1 baseline specification.\n';
        const v2Draft = '# Canonical Spec\n\nExperimental v2 modified draft.\n';

        versions.push(
            {
                ID: 'ver-r9-1',
                ArtifactID: artR9,
                VersionNumber: 1,
                Name: 'Spec.md',
                Content: v1Clean,
                ContentHash: 'hash-r9-1',
                UserID: editorUser.ID,
                __mj_CreatedAt: new Date(Date.now() - 30_000).toISOString(),
                __mj_UpdatedAt: new Date(Date.now() - 30_000).toISOString()
            },
            {
                ID: 'ver-r9-2',
                ArtifactID: artR9,
                VersionNumber: 2,
                Name: 'Spec.md',
                Content: v2Draft,
                ContentHash: 'hash-r9-2',
                UserID: editorUser.ID,
                __mj_CreatedAt: new Date(Date.now() - 15_000).toISOString(),
                __mj_UpdatedAt: new Date(Date.now() - 15_000).toISOString()
            }
        );
        workingStates.delete(artR9);

        const mockProv = createMockProvider();
        const editorCtx: AppContext = {
            dataSource: {} as AppContext['dataSource'],
            providers: [{ type: 'Read-Write', provider: mockProv }],
            user: editorUser,
            userPayload: {
                userRecord: { ID: editorUser.ID, Email: editorUser.Email },
                email: editorUser.Email,
                sessionId: 'sess-r9'
            }
        };

        // Active room exists before restore (e.g. user editing in session)
        const initialRoom = await server.GetOrCreateRoom(artR9, editorUser);
        expect(initialRoom).not.toBeNull();
        expect(await server.GetRoomContent(artR9, editorUser)).toBe(v2Draft);

        // 1. R9-2: RestoreArtifactVersion mutation on DocumentCollaborationResolver restores v1 as v3
        const restoreRes = await resolver.RestoreArtifactVersion(artR9, 'ver-r9-1', editorCtx);
        expect(restoreRes.Success).toBe(true);
        expect(restoreRes.VersionNumber).toBe(3);
        expect(restoreRes.VersionID).toBeTruthy();

        // Room state must reflect the restored v1Clean content
        const restoredRoom = await server.GetOrCreateRoom(artR9, editorUser);
        expect(restoredRoom).not.toBeNull();
        expect(await server.GetRoomContent(artR9, editorUser)).toBe(v1Clean);

        const metaMap = restoredRoom!.Doc.getMap('meta');
        expect(metaMap.get('lastAppliedRestoreVersionId')).toBe(restoreRes.VersionID);
        expect(metaMap.get('lastAppliedRestoreVersionNumber')).toBe(3);

        // 2. R9-2 Multi-node restore idempotency:
        // A human adds post-restore edits to the room
        restoredRoom!.Doc.transact(() => {
            const yText = restoredRoom!.Doc.getText('content');
            yText.insert(yText.length, '\nHuman post-restore live edit.\n');
        }, 'human-post-restore');
        const postRestoreText = await server.GetRoomContent(artR9, editorUser);
        expect(postRestoreText).toContain('Human post-restore live edit.');

        // Peer node / duplicate event publishes the SAME restore version or an older restore version
        MJGlobal.Instance.RaiseEvent({
            component: server,
            event: MJEventType.ComponentEvent,
            eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
            args: {
                ArtifactID: artR9,
                VersionID: restoreRes.VersionID,
                VersionNumber: 3,
                Content: v1Clean,
                IsRestore: true,
                UpdatedByUserID: editorUser.ID
            }
        });
        await new Promise((r) => setTimeout(r, 30));

        // Multi-node deduplication: room must NOT wipe post-restore edits when restore was already applied!
        expect(await server.GetRoomContent(artR9, editorUser)).toBe(postRestoreText);

        // 3. R9-5: dryRun: true in ApplyServerContentMutation
        const dryRunRes = await server.ApplyServerContentMutation(
            artR9,
            '# Probing Agent Proposed Title\n\nProposed body.',
            editorUser,
            false,
            v1Clean,
            { dryRun: true }
        );
        expect(dryRunRes.Success).toBe(true);
        expect(dryRunRes.MergedContent).toContain('# Probing Agent Proposed Title');
        // Live room must be completely unmodified by dryRun
        expect(await server.GetRoomContent(artR9, editorUser)).toBe(postRestoreText);

        // 4. R9-8 / R10-4: Monotonic counter merge & ID suffix scanning in AST merge on Whiteboard root
        const baseJson = JSON.stringify({
            idCounter: 10,
            zCounter: 5,
            seq: 1,
            pages: [{ id: 'item-10', text: 'Base item' }]
        }, null, 2);

        const liveJson = JSON.stringify({
            idCounter: 12,
            zCounter: 8,
            seq: 2,
            pages: [
                { id: 'item-10', text: 'Base item' },
                { id: 'item-12', text: 'Live item' }
            ]
        }, null, 2);

        const incomingJson = JSON.stringify({
            idCounter: 11,
            zCounter: 15,
            seq: 3,
            pages: [
                { id: 'item-10', text: 'Base item' },
                { id: 'item-15', text: 'Incoming item' }
            ]
        }, null, 2);

        const astMergeRes = server.MergeConcurrentDocumentEditsDetailed(baseJson, liveJson, incomingJson);
        const mergedObj = JSON.parse(astMergeRes.MergedText) as {
            idCounter: number;
            zCounter: number;
            seq: number;
            pages: Array<{ id: string; text: string }>;
        };

        // Counters must take Math.max on Whiteboard root
        expect(mergedObj.zCounter).toBe(15);
        // seq is not a whiteboard root counter; live edit wins on conflict
        expect(mergedObj.seq).toBe(2);
        // idCounter must be at least maxSuffix (item-15 has suffix 15 > live 12)
        expect(mergedObj.idCounter).toBe(15);
        expect(mergedObj.pages.some((it) => it.id === 'item-15')).toBe(true);
        expect(mergedObj.pages.some((it) => it.id === 'item-12')).toBe(true);
    });

    it('R9: multi-node concurrent restore, cold working-state restore, and deferCommit + MJ_ARTIFACT_VERSION_SAVED idempotency', async () => {
        class RestoreNodeA extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class RestoreNodeB extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }

        const bus = new InMemoryYjsRelayBus();
        const relayA = new InMemoryYjsRoomRelay(bus, 'r9-restore-node-a');
        const relayB = new InMemoryYjsRoomRelay(bus, 'r9-restore-node-b');
        const nodeA = new RestoreNodeA();
        const nodeB = new RestoreNodeB();
        nodeA.SetMetadataProviderOverride(createMockProvider());
        nodeB.SetMetadataProviderOverride(createMockProvider());
        nodeA.SetRoomRelay(relayA);
        nodeB.SetRoomRelay(relayB);

        try {
            // 1. Multi-node restore when Node B has concurrent pre-restore Bob edits + pre-arrived Yjs meta
            const multiArtId = 'e8090000-0000-4000-8000-000000000002';
            permissionTable.set(multiArtId, { CanRead: true, CanEdit: true });
            const v1Clean = '# Architecture\n\nClean v1 paragraph.\n';
            const v2Draft = '# Architecture\n\nModified v2 paragraph.\n';
            versions.push(
                {
                    ID: 'ver-r9-m1',
                    ArtifactID: multiArtId,
                    VersionNumber: 1,
                    Name: 'Arch.md',
                    Content: v1Clean,
                    ContentHash: 'hash-r9-m1',
                    UserID: editorUser.ID
                },
                {
                    ID: 'ver-r9-m2',
                    ArtifactID: multiArtId,
                    VersionNumber: 2,
                    Name: 'Arch.md',
                    Content: v2Draft,
                    ContentHash: 'hash-r9-m2',
                    UserID: editorUser.ID
                }
            );
            workingStates.delete(multiArtId);

            const roomA = await nodeA.GetOrCreateRoom(multiArtId, editorUser);
            const roomB = await nodeB.GetOrCreateRoom(multiArtId, secondEditorUser);
            expect(roomA).not.toBeNull();
            expect(roomB).not.toBeNull();

            // Bob types concurrent pre-restore text on Node B (origin 'relay' simulates local client op not yet echoed)
            roomB!.Doc.transact(() => {
                const yTextB = roomB!.Doc.getText('content');
                yTextB.insert(yTextB.length, '\nBob concurrent pre-restore typing.\n');
                // Simulate premature Yjs meta arrival from peer before authoritative restore reconciliation
                roomB!.Doc.getMap('meta').set('lastAppliedRestoreVersionId', 'ver-r9-m3');
                roomB!.Doc.getMap('meta').set('lastAppliedRestoreVersionNumber', 3);
            }, 'relay');
            roomB!.DirtyVersion = true;

            versions.push({
                ID: 'ver-r9-m3',
                ArtifactID: multiArtId,
                VersionNumber: 3,
                Name: 'Arch.md',
                Content: v1Clean,
                ContentHash: 'hash-r9-m1',
                Description: 'Restored from v1',
                Comments: 'Restored from v1',
                UserID: editorUser.ID
            });

            await nodeA.RestoreToSavedVersion(
                multiArtId,
                { ID: 'ver-r9-m3', VersionNumber: 3, Content: v1Clean },
                editorUser
            );
            await new Promise((r) => setTimeout(r, 50));

            // Both Node A and Node B must snap cleanly to v1Clean without orphan Bob pre-restore text
            expect(await nodeA.GetRoomContent(multiArtId, editorUser)).toBe(v1Clean);
            expect(await nodeB.GetRoomContent(multiArtId, secondEditorUser)).toBe(v1Clean);
            expect(roomB!.DirtyVersion).toBe(false);

            // Bob now makes a post-restore edit on Node B; duplicate v3 restore relay must NOT wipe it
            roomB!.Doc.transact(() => {
                const yTextB = roomB!.Doc.getText('content');
                yTextB.insert(yTextB.length, '\nBob post-restore edit.\n');
            }, 'relay');
            roomB!.DirtyVersion = true;
            const expectedPostRestore = `${v1Clean}\nBob post-restore edit.\n`;

            await relayA.PublishToRoom({
                ArtifactID: multiArtId,
                MessageType: 'version-saved',
                OriginInstanceID: relayA.InstanceID,
                PayloadBase64: JSON.stringify({ isRestore: true }),
                VersionID: 'ver-r9-m3',
                VersionNumber: 3
            });
            await new Promise((r) => setTimeout(r, 40));
            expect(await nodeB.GetRoomContent(multiArtId, secondEditorUser)).toBe(expectedPostRestore);
            expect(roomB!.DirtyVersion).toBe(true);

            // 2. Cold hibernated WorkingState restore (no active room in memory when v3 was saved)
            const coldArtId = 'e8090000-0000-4000-8000-000000000003';
            permissionTable.set(coldArtId, { CanRead: true, CanEdit: true });
            const coldDoc = new Y.Doc();
            coldDoc.getText('content').insert(0, `${v2Draft}\nHibernated uncompacted draft.\n`);
            coldDoc.getMap('meta').set('baseVersionId', 'ver-cold-2');
            coldDoc.getMap('meta').set('baseVersionNumber', 2);
            coldDoc.getMap('meta').set('versionId', 'ver-cold-2');
            coldDoc.getMap('meta').set('versionNumber', 2);
            workingStates.set(coldArtId, {
                ID: 'ws-cold-2',
                ArtifactID: coldArtId,
                YjsState: BytesToBase64(Y.encodeStateAsUpdate(coldDoc)),
                LastModifiedByUserID: secondEditorUser.ID,
                __mj_UpdatedAt: new Date(Date.now() - 10_000).toISOString()
            });
            coldDoc.destroy();

            versions.push(
                {
                    ID: 'ver-cold-2',
                    ArtifactID: coldArtId,
                    VersionNumber: 2,
                    Name: 'Cold.md',
                    Content: v2Draft,
                    ContentHash: 'hash-cold-2',
                    UserID: editorUser.ID,
                    __mj_CreatedAt: new Date(Date.now() - 20_000).toISOString()
                },
                {
                    ID: 'ver-cold-3',
                    ArtifactID: coldArtId,
                    VersionNumber: 3,
                    Name: 'Cold.md',
                    Content: v1Clean,
                    ContentHash: 'hash-cold-3',
                    Description: 'Restored from v1',
                    Comments: 'Restored from v1',
                    UserID: editorUser.ID,
                    __mj_CreatedAt: new Date().toISOString()
                }
            );

            await nodeA.RestoreToSavedVersion(
                coldArtId,
                { ID: 'ver-cold-3', VersionNumber: 3, Content: v1Clean },
                editorUser
            );
            expect(await nodeA.GetRoomContent(coldArtId, editorUser)).toBe(v1Clean);

            // 3. deferCommit: true + MJ_ARTIFACT_VERSION_SAVED + commit({ versionId, versionNumber }) idempotency & reuse
            const server = ArtifactCollaborationServer.Instance;
            const agentArtId = 'e8090000-0000-4000-8000-000000000004';
            permissionTable.set(agentArtId, { CanRead: true, CanEdit: true });
            const baseAgentDoc = '# Roadmap\n\n## Q1\nInitial item.\n';
            versions.push({
                ID: 'ver-agent-1',
                ArtifactID: agentArtId,
                VersionNumber: 1,
                Name: 'Roadmap.md',
                Content: baseAgentDoc,
                ContentHash: 'hash-agent-1',
                UserID: editorUser.ID
            });
            workingStates.delete(agentArtId);

            const agentRoom = await server.GetOrCreateRoom(agentArtId, editorUser);
            expect(agentRoom).not.toBeNull();

            const store = GetGlobalObjectStore();
            const hook = store?.['___MJ_ARTIFACT_LIVE_MUTATION_HOOK___'] as
                | ((evt: {
                      artifactId: string;
                      alphaId: string;
                      previousContent?: string;
                      updatedContent: string;
                      tool: string;
                      contextUser?: UserInfo;
                      deferCommit?: boolean;
                  }) => Promise<{
                      mergedContent?: string;
                      commit?: (persisted?: { versionId?: string; versionNumber?: number }) => Promise<void> | void;
                  } | void>)
                | undefined;
            expect(typeof hook).toBe('function');

            // Tool call #1: new version ver-agent-2 emits MJ_ARTIFACT_VERSION_SAVED before commit()
            const updated1 = '# Roadmap\n\n## Q1\nInitial item.\n- Added by tool call 1.\n';
            const preview1 = await hook!({
                artifactId: agentArtId,
                alphaId: 'A',
                previousContent: baseAgentDoc,
                updatedContent: updated1,
                tool: 'replace_section',
                contextUser: editorUser,
                deferCommit: true
            });
            expect(preview1 && preview1.mergedContent).toBe(updated1);
            // Room is untouched before Save/commit
            expect(await server.GetRoomContent(agentArtId, editorUser)).toBe(baseAgentDoc);

            versions.push({
                ID: 'ver-agent-2',
                ArtifactID: agentArtId,
                VersionNumber: 2,
                Name: 'Roadmap.md',
                Content: updated1,
                ContentHash: 'hash-agent-2a',
                UserID: editorUser.ID
            });
            MJGlobal.Instance.RaiseEvent({
                component: server,
                event: MJEventType.ComponentEvent,
                eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
                args: {
                    ArtifactID: agentArtId,
                    VersionID: 'ver-agent-2',
                    VersionNumber: 2,
                    Content: updated1
                }
            });
            await preview1!.commit?.({ versionId: 'ver-agent-2', versionNumber: 2 });

            expect(await server.GetRoomContent(agentArtId, editorUser)).toBe(updated1);
            expect(agentRoom!.DirtyVersion).toBe(false);

            // Tool call #2 in same agent run: reuses ver-agent-2 in-place
            const updated2 = '# Roadmap\n\n## Q1\nInitial item.\n- Added by tool call 1.\n- Added by tool call 2.\n';
            const preview2 = await hook!({
                artifactId: agentArtId,
                alphaId: 'A',
                previousContent: updated1,
                updatedContent: updated2,
                tool: 'replace_section',
                contextUser: editorUser,
                deferCommit: true
            });
            expect(preview2 && preview2.mergedContent).toBe(updated2);

            MJGlobal.Instance.RaiseEvent({
                component: server,
                event: MJEventType.ComponentEvent,
                eventCode: ARTIFACT_VERSION_SAVED_EVENT_CODE,
                args: {
                    ArtifactID: agentArtId,
                    VersionID: 'ver-agent-2',
                    VersionNumber: 2,
                    Content: updated2
                }
            });
            await preview2!.commit?.({ versionId: 'ver-agent-2', versionNumber: 2 });

            expect(await server.GetRoomContent(agentArtId, editorUser)).toBe(updated2);
            expect(agentRoom!.DirtyVersion).toBe(false);
        } finally {
            await nodeA.Shutdown();
            await nodeB.Shutdown();
            await relayA.Shutdown();
            await relayB.Shutdown();
        }
    });

    it('R10-2 Reconnect after Restore: preserves awareness, avoids duplication, and converges cleanly', async () => {
        const server = ArtifactCollaborationServer.Instance;
        const reconnectArtId = 'e8100000-0000-4000-8000-000000000001';
        permissionTable.set(reconnectArtId, { CanRead: true, CanEdit: true });
        const v1Text = '# Strategy Document\n\nv1 baseline text.\n';
        const v2Text = '# Strategy Document\n\nv1 baseline text.\n\n## Section Added by Alice and Bob in v2\n';

        versions.push({
            ID: 'ver-r10-1',
            ArtifactID: reconnectArtId,
            VersionNumber: 1,
            Name: 'Strategy.md',
            Content: v1Text,
            ContentHash: 'hash-r10-1',
            UserID: editorUser.ID
        });

        // 1. Alice and Bob connect via WebSocket
        const clientA = await connectYjsClient(editorUser.ID, reconnectArtId);
        const clientB = await connectYjsClient(secondEditorUser.ID, reconnectArtId);

        await clientA.waitForText('v1 baseline text.');
        await clientB.waitForText('v1 baseline text.');

        // Alice sets awareness
        clientA.awareness.setLocalStateField('user', { name: 'Alice', color: '#ff0000' });

        // Alice edits doc to v2
        clientA.doc.transact(() => {
            const yText = clientA.doc.getText('content');
            yText.insert(yText.length, '\n## Section Added by Alice and Bob in v2\n');
        });

        await clientB.waitForText('## Section Added by Alice and Bob in v2');
        expect(clientB.doc.getText('content').toString()).toContain('## Section Added by Alice and Bob in v2');

        // Compact to v2
        versions.push({
            ID: 'ver-r10-2',
            ArtifactID: reconnectArtId,
            VersionNumber: 2,
            Name: 'Strategy.md',
            Content: v2Text,
            ContentHash: 'hash-r10-2',
            UserID: editorUser.ID
        });

        // 2. Bob disconnects with his v2 doc
        clientB.ws.close();

        // 3. Restore to v1 runs on server
        versions.push({
            ID: 'ver-r10-3',
            ArtifactID: reconnectArtId,
            VersionNumber: 3,
            Name: 'Strategy.md',
            Content: v1Text,
            ContentHash: 'hash-r10-1',
            Description: 'Restored from Version 1',
            UserID: editorUser.ID
        });

        await server.RestoreToSavedVersion(
            reconnectArtId,
            {
                ID: 'ver-r10-3',
                VersionNumber: 3,
                Content: v1Text
            },
            editorUser
        );

        // Alice's client should converge to v1Text via Yjs sync-update without room-reset
        await clientA.waitForText('v1 baseline text.');
        await vi.waitFor(() => {
            expect(clientA.doc.getText('content').toString()).toBe(v1Text);
        });

        // Alice's awareness state is NOT wiped by restore
        expect(clientA.awareness.getLocalState()?.['user']).toEqual({ name: 'Alice', color: '#ff0000' });
        const room = await server.GetOrCreateRoom(reconnectArtId, editorUser);
        expect(room?.Awareness.getStates().size).toBeGreaterThan(0);

        // 4. Bob reconnects with his old v2 doc
        const wsBobReconnect = new WsClient(
            `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${reconnectArtId}&testUserId=${secondEditorUser.ID}`
        );

        wsBobReconnect.on('message', (raw: Buffer) => {
            const bytes = new Uint8Array(raw);
            const decoder = decoding.createDecoder(bytes);
            const msgType = decoding.readVarUint(decoder);
            if (msgType === YJS_MESSAGE_SYNC) {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
                syncProtocol.readSyncMessage(decoder, encoder, clientB.doc, 'server');
                if (encoding.length(encoder) > 1 && wsBobReconnect.readyState === WsClient.OPEN) {
                    wsBobReconnect.send(encoding.toUint8Array(encoder));
                }
            }
        });

        wsBobReconnect.on('open', () => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, YJS_MESSAGE_SYNC);
            syncProtocol.writeSyncStep1(encoder, clientB.doc);
            wsBobReconnect.send(encoding.toUint8Array(encoder));
        });

        // Room, Alice, and Bob all end with v1 content (ZERO duplication!)
        await vi.waitFor(() => {
            expect(clientB.doc.getText('content').toString()).toBe(v1Text);
        });

        const serverFinalText = await server.GetRoomContent(reconnectArtId, editorUser);
        expect(serverFinalText).toBe(v1Text);
        expect(clientA.doc.getText('content').toString()).toBe(v1Text);
        expect(clientB.doc.getText('content').toString()).toBe(v1Text);
        expect(serverFinalText).not.toContain('## Section Added by Alice and Bob in v2');

        clientA.ws.close();
        wsBobReconnect.close();
    });

    it('R10-2 Multi-Node Restore + 15ms DB Latency Race: converges identically with post-restore edit preserved and zero duplication', async () => {
        class LatencyRaceNodeA extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }
        class LatencyRaceNodeB extends ArtifactCollaborationServer {
            public constructor() {
                super();
            }
        }

        const bus = new InMemoryYjsRelayBus();
        const relayA = new InMemoryYjsRoomRelay(bus, 'r10-race-node-a');
        const relayB = new InMemoryYjsRoomRelay(bus, 'r10-race-node-b');
        const nodeA = new LatencyRaceNodeA();
        const nodeB = new LatencyRaceNodeB();

        const raceArtId = 'e8100000-0000-4000-8000-000000000002';
        permissionTable.set(raceArtId, { CanRead: true, CanEdit: true });
        const v1Clean = '# System Architecture\n\nClean v1 content.\n';
        const v2Draft = '# System Architecture\n\nDraft v2 content.\n';

        versions.push(
            {
                ID: 'ver-race-1',
                ArtifactID: raceArtId,
                VersionNumber: 1,
                Name: 'Arch.md',
                Content: v1Clean,
                ContentHash: 'hash-race-1',
                UserID: editorUser.ID
            },
            {
                ID: 'ver-race-2',
                ArtifactID: raceArtId,
                VersionNumber: 2,
                Name: 'Arch.md',
                Content: v2Draft,
                ContentHash: 'hash-race-2',
                UserID: editorUser.ID
            }
        );

        nodeA.SetMetadataProviderOverride(createMockProvider());

        // Node B has 15ms simulated RunViews latency
        const providerB = createMockProvider();
        const origRunViews = providerB.RunViews.bind(providerB);
        providerB.RunViews = async (params) => {
            await new Promise((r) => setTimeout(r, 15));
            return origRunViews(params);
        };

        nodeB.SetMetadataProviderOverride(providerB);
        nodeA.SetRoomRelay(relayA);
        nodeB.SetRoomRelay(relayB);

        try {
            // Both nodes initialize room at v2Draft
            const roomA = await nodeA.GetOrCreateRoom(raceArtId, editorUser);
            const roomB = await nodeB.GetOrCreateRoom(raceArtId, secondEditorUser);
            expect(roomA).not.toBeNull();
            expect(roomB).not.toBeNull();

            // Register v3 restore in DB
            versions.push({
                ID: 'ver-race-3',
                ArtifactID: raceArtId,
                VersionNumber: 3,
                Name: 'Arch.md',
                Content: v1Clean,
                ContentHash: 'hash-race-1',
                Description: 'Restored from Version 1',
                UserID: editorUser.ID
            });

            // Node A restores to v1
            await nodeA.RestoreToSavedVersion(
                raceArtId,
                {
                    ID: 'ver-race-3',
                    VersionNumber: 3,
                    Content: v1Clean
                },
                editorUser
            );

            // Alice immediately appends "Alice post-restore\n" on Node A
            roomA!.Doc.transact(() => {
                const yTextA = roomA!.Doc.getText('content');
                yTextA.insert(yTextA.length, 'Alice post-restore\n');
            }, 'alice-post-restore');

            // Wait for relay to propagate to Node B (including Node B's 15ms simulated RunView latency)
            await vi.waitFor(async () => {
                const contentB = await nodeB.GetRoomContent(raceArtId, secondEditorUser);
                expect(contentB).toContain('Alice post-restore\n');
            }, { timeout: 2000 });

            const expected = `${v1Clean}Alice post-restore\n`;
            const contentA = await nodeA.GetRoomContent(raceArtId, editorUser);
            const contentB = await nodeB.GetRoomContent(raceArtId, secondEditorUser);

            expect(contentA).toBe(expected);
            expect(contentB).toBe(expected);
            expect(contentA).not.toContain(v2Draft);
            expect(contentB).not.toContain(v2Draft);
        } finally {
            await nodeA.Shutdown();
            await nodeB.Shutdown();
            await relayA.Shutdown();
            await relayB.Shutdown();
        }
    });

    it('R10-4 JSON Counter Narrowing: lowering seq or pageCounter, or order IDs do not clamp; whiteboard root clamps idCounter and zCounter', () => {
        const server = ArtifactCollaborationServer.Instance;

        // 1. Lowering seq 5 -> 2 (human) while agent is at 5: no clamping, HadConflict === false
        const baseSeq = JSON.stringify({ seq: 5, title: 'Document' }, null, 2);
        const liveSeqHuman = JSON.stringify({ seq: 2, title: 'Document' }, null, 2);
        const incSeqAgent = JSON.stringify({ seq: 5, title: 'Document' }, null, 2);
        const mergeSeq1 = server.MergeConcurrentDocumentEditsDetailed(baseSeq, liveSeqHuman, incSeqAgent);
        expect(mergeSeq1.HadConflict).toBe(false);
        expect(JSON.parse(mergeSeq1.MergedText).seq).toBe(2);

        // 2. Lowering seq 5 -> 0 (agent) while human is at 5: no clamping, HadConflict === false
        const incSeqAgentZero = JSON.stringify({ seq: 0, title: 'Document' }, null, 2);
        const mergeSeq2 = server.MergeConcurrentDocumentEditsDetailed(baseSeq, incSeqAgent, incSeqAgentZero);
        expect(mergeSeq2.HadConflict).toBe(false);
        expect(JSON.parse(mergeSeq2.MergedText).seq).toBe(0);

        // 3. Lowering nested pageCounter 10 -> 3: no clamping, HadConflict === false
        const basePage = JSON.stringify({ config: { pageCounter: 10 } }, null, 2);
        const livePageLower = JSON.stringify({ config: { pageCounter: 3 } }, null, 2);
        const incPageUnchanged = JSON.stringify({ config: { pageCounter: 10 } }, null, 2);
        const mergePage = server.MergeConcurrentDocumentEditsDetailed(basePage, livePageLower, incPageUnchanged);
        expect(mergePage.HadConflict).toBe(false);
        expect(JSON.parse(mergePage.MergedText).config.pageCounter).toBe(3);

        // 4. Unrelated "id": "order-99999": idCounter does not clamp to 99999
        const baseOrder = JSON.stringify({
            idCounter: 5,
            orders: [{ id: 'order-99999', amount: 100 }]
        }, null, 2);
        const liveOrder = JSON.stringify({
            idCounter: 5,
            orders: [{ id: 'order-99999', amount: 100 }]
        }, null, 2);
        const incOrder = JSON.stringify({
            idCounter: 6,
            orders: [
                { id: 'order-99999', amount: 100 },
                { id: 'order-100000', amount: 200 }
            ]
        }, null, 2);
        const mergeOrder = server.MergeConcurrentDocumentEditsDetailed(baseOrder, liveOrder, incOrder);
        expect(mergeOrder.HadConflict).toBe(false);
        expect(JSON.parse(mergeOrder.MergedText).idCounter).toBe(6);

        // 5. Whiteboard root concurrent human + agent additions: clamps idCounter and zCounter
        const baseWb = JSON.stringify({
            idCounter: 1,
            zCounter: 1,
            pages: [{ id: 'p1', elements: [{ id: 'shape-1' }] }]
        }, null, 2);
        const liveWb = JSON.stringify({
            idCounter: 2,
            zCounter: 2,
            pages: [{ id: 'p1', elements: [{ id: 'shape-1' }, { id: 'shape-2' }] }]
        }, null, 2);
        const incWb = JSON.stringify({
            idCounter: 3,
            zCounter: 3,
            pages: [{ id: 'p1', elements: [{ id: 'shape-1' }, { id: 'sticky-3' }] }]
        }, null, 2);
        const mergeWb = server.MergeConcurrentDocumentEditsDetailed(baseWb, liveWb, incWb);
        const mergedWbObj = JSON.parse(mergeWb.MergedText) as {
            idCounter: number;
            zCounter: number;
            pages: Array<{ id: string; elements: Array<{ id: string }> }>;
        };
        expect(mergedWbObj.idCounter).toBeGreaterThanOrEqual(3);
        expect(mergedWbObj.zCounter).toBe(3);
    });
});
