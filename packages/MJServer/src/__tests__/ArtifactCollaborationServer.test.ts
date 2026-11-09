import { createServer, type Server as HttpServer, type IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { IMetadataProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import {
    ArtifactPermissionEngine,
    DocumentLiveBlockEngine,
    SpreadsheetEngine,
    type SpreadsheetCellSpec,
    type WorkbookSpec,
    type WorksheetSpec
} from '@memberjunction/core-entities';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';

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
    ArtifactCollaborationServer,
    CollaborationControlFrame,
    CollaborationPermissionStatusFrame,
    WS_CLOSE_FORBIDDEN,
    YJS_MESSAGE_AWARENESS,
    YJS_MESSAGE_CONTROL,
    YJS_MESSAGE_PERMISSION_STATUS,
    YJS_MESSAGE_SYNC
} from '../collaboration/ArtifactCollaborationServer.js';
import {
    InMemoryYjsRelayBus,
    InMemoryYjsRoomRelay,
    RedisYjsRoomRelay,
    YjsRelayMessage
} from '../collaboration/YjsRoomRelay.js';
import { DocumentCollaborationResolver } from '../resolvers/DocumentCollaborationResolver.js';
import type { AppContext } from '../types.js';

interface MockStoredWorkingState {
    ID: string;
    ArtifactID: string;
    YjsState: string;
    LastModifiedByUserID: string;
}

interface MockStoredVersion {
    ID: string;
    ArtifactID: string;
    VersionNumber: number;
    Content: string;
    ContentHash: string;
    UserID: string;
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

    function createMockProvider(): IMetadataProvider {
        const runViewFn = async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: Artifact Working States') {
                const existing = workingStates.get(artifactId);
                return {
                    Success: true,
                    Results: existing ? [existing] : [],
                    TotalRowCount: existing ? 1 : 0
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                const sorted = [...versions].sort((a, b) => b.VersionNumber - a.VersionNumber);
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
                        async Save() {
                            workingStates.set(this.ArtifactID, {
                                ID: this.ID,
                                ArtifactID: this.ArtifactID,
                                YjsState: this.YjsState,
                                LastModifiedByUserID: this.LastModifiedByUserID
                            });
                            return true;
                        }
                    };
                    return record;
                }
                if (entityName === 'MJ: Artifact Versions') {
                    const record: MockStoredVersion & {
                        NewRecord: () => void;
                        Save: () => Promise<boolean>;
                    } = {
                        ID: `ver-${versions.length + 1}`,
                        ArtifactID: artifactId,
                        VersionNumber: 1,
                        Content: '',
                        ContentHash: '',
                        UserID: '',
                        NewRecord() {
                            this.ID = `ver-${versions.length + 1}`;
                        },
                        async Save() {
                            versions.push({
                                ID: this.ID,
                                ArtifactID: this.ArtifactID,
                                VersionNumber: this.VersionNumber,
                                Content: this.Content,
                                ContentHash: this.ContentHash,
                                UserID: this.UserID
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

        const server = ArtifactCollaborationServer.Instance;
        // Reset shutdown flag and rooms via Shutdown, then re-configure
        await server.Shutdown();
        (server as unknown as { _shuttingDown: boolean })._shuttingDown = false;
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
        resolvePermissionsSpy.mockRestore();
        await ArtifactCollaborationServer.Instance.Shutdown();
        ArtifactCollaborationServer.Instance.SetMetadataProviderOverride(null);
        ArtifactCollaborationServer.Instance.SetAuthResolverOverride(null);
        await new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
        });
    });

    function connectYjsClient(userId: string): Promise<{
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

            const ws = new WsClient(
                `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${artifactId}&testUserId=${userId}`
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

        // 2. FreezeDocumentLiveBlock requires acknowledgeSecurityWarning=true
        const specJson = JSON.stringify({
            BlockID: 'blk-live-1',
            Kind: 'EntityView',
            Mode: 'Live',
            EntityName: 'MJ: Users'
        });
        const unackedFreeze = await resolver.FreezeDocumentLiveBlock(specJson, false, editorCtx);
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

        const ackedFreeze = await resolver.FreezeDocumentLiveBlock(specJson, true, editorCtx);
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
});
