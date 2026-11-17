import { createHash } from 'node:crypto';
import { createServer, type Server as HttpServer, type IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { IMetadataProvider, IRunViewProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import {
    GetArtifactLiveContentReaderHook,
    GovernedArtifactService,
} from '@memberjunction/ai-agents';
import { ArtifactPermissionEngine, DocumentLiveBlockEngine, SpreadsheetEngine } from '@memberjunction/core-entities';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { RedisLocalStorageProvider } from '@memberjunction/redis-provider';
import '../agentSessions/index.js';

vi.mock('../config.js', () => ({
    configInfo: {
        apiBasePath: '/',
        cors: { allowedOrigins: ['*'] },
    },
}));

vi.mock('../context.js', () => ({
    getUserPayload: vi.fn(async () => null),
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
        'PubSub',
    ];
    return {
        ...Object.fromEntries(decorators.map((name) => [name, noopDecorator])),
        Float: class {},
        Int: class {},
        ID: class {},
        PubSubEngine: class {},
        AuthorizationError: class AuthorizationError extends Error {},
        registerEnumType: () => undefined,
        createUnionType: () => class {},
    };
});

import {
    AGENT_AWARENESS_CLIENT_ID_BASE,
    AGENT_AWARENESS_CLIENT_ID_MAX,
    ARTIFACT_COLLABORATION_WS_PATH,
    ArtifactCollaborationServer,
    YJS_MESSAGE_AWARENESS,
    YJS_MESSAGE_SYNC,
} from '../collaboration/ArtifactCollaborationServer.js';
import { InMemoryYjsRelayBus, InMemoryYjsRoomRelay, type YjsRelayMessage } from '../collaboration/YjsRoomRelay.js';

interface TestAwarenessLocation {
    Domain?: string;
    SheetName?: string;
    Range?: string;
    RangeRef?: string;
}

interface TestAwarenessUser {
    userId?: string;
    userName?: string;
    name?: string;
    color?: string;
    isAgent?: boolean;
    agentName?: string;
    actingForUserName?: string;
    actingForUserId?: string;
    agentPhase?: string;
    actionSummary?: string;
    agentLocation?: TestAwarenessLocation;
}

interface TestAwarenessState {
    isAgent?: boolean;
    user?: TestAwarenessUser;
}

function makeUser(id: string, name: string, email: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = email;
    u.IsActive = true;
    return u;
}

describe('ArtifactCollaborationServer — Server-Owned Yjs Agent Presence, Live Reader & C3 Security', () => {
    const editorUser = makeUser('11111111-1111-1111-1111-111111111111', 'Alice Editor', 'alice@example.com');
    const artifactId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    let httpServer: HttpServer;
    let wsPort: number;
    let versions: Array<{ ID: string; ArtifactID: string; VersionNumber: number; Content: string }>;
    let workingStates: Array<{ ID: string; ArtifactID: string; YjsState: Uint8Array; __mj_UpdatedAt?: Date }>;
    let resolvePermissionsSpy: ReturnType<typeof vi.spyOn>;

    function createMockProvider(): IMetadataProvider & IRunViewProvider {
        const runViewFn = async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: Artifact Working States') {
                const matching = workingStates.filter((w) => UUIDsEqual(w.ArtifactID, artifactId));
                return {
                    Success: true,
                    Results: matching,
                    TotalRowCount: matching.length,
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                return {
                    Success: true,
                    Results: versions.filter((v) => UUIDsEqual(v.ArtifactID, artifactId)),
                    TotalRowCount: versions.length,
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0 };
        };
        return {
            RunView: runViewFn as IRunViewProvider['RunView'],
            RunViews: (async (list: RunViewParams[]) => Promise.all(list.map(runViewFn))) as IRunViewProvider['RunViews'],
        } as IMetadataProvider & IRunViewProvider;
    }

    beforeEach(async () => {
        workingStates = [];
        versions = [
            {
                ID: 'ver-1',
                ArtifactID: artifactId,
                VersionNumber: 1,
                Content: '# Executive Summary\n\nInitial draft text.',
            },
        ];

        resolvePermissionsSpy = vi
            .spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions')
            .mockResolvedValue({
                ArtifactID: artifactId,
                UserID: editorUser.ID,
                IsOwner: true,
                CanRead: true,
                CanEdit: true,
                CanDelete: true,
                CanShare: true,
                HasDirectPermissions: true,
                GrantedBy: 'owner',
            });

        const server = ArtifactCollaborationServer.Instance;
        await server.Shutdown();
        Reflect.set(server, '_shuttingDown', false);
        server.SetTicketHmacSecret('test-collab-ticket-hmac-secret-at-least-32-bytes!!');
        server.SetTicketReplayStore(null);
        DocumentLiveBlockEngine.Instance.SetSigningSecret('test-frozen-block-hmac-secret-at-least-32-bytes!!');
        server.SetRoomRelay(new InMemoryYjsRoomRelay());
        server.SetMetadataProviderOverride(createMockProvider());
        server.SetAgentPresenceTimings({
            throttleMs: 30,
            decayMs: 80,
            ttlMs: 300,
            exitGraceMs: 40,
        });
        server.SetAuthResolverOverride(async (req: IncomingMessage) => {
            const url = new URL(req.url ?? '/', 'http://localhost');
            return url.searchParams.get('testUserId') === editorUser.ID ? editorUser : null;
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
        ArtifactCollaborationServer.Instance.SetTicketHmacSecret(null);
        DocumentLiveBlockEngine.Instance.SetSigningSecret(null);
        await new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
        });
        vi.restoreAllMocks();
    });

    async function connectClient(): Promise<{
        ws: WsClient;
        doc: Y.Doc;
        awareness: awarenessProtocol.Awareness;
    }> {
        return new Promise((resolve, reject) => {
            const doc = new Y.Doc();
            const awareness = new awarenessProtocol.Awareness(doc);
            const ws = new WsClient(
                `ws://127.0.0.1:${wsPort}${ARTIFACT_COLLABORATION_WS_PATH}?artifactId=${artifactId}&testUserId=${editorUser.ID}`,
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
                    resolve({ ws, doc, awareness });
                } else if (msgType === YJS_MESSAGE_AWARENESS) {
                    const update = decoding.readVarUint8Array(decoder);
                    awarenessProtocol.applyAwarenessUpdate(awareness, update, 'server');
                }
            });

            ws.on('error', reject);
        });
    }

    it('registers ArtifactWorkspaceChannelServer via MJServer agentSessions index import', () => {
        const plugin = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(
            BaseRealtimeChannelServer,
            'ArtifactWorkspaceChannelServer',
        );
        expect(plugin).toBeDefined();
        expect(plugin?.ChannelName).toBe('ArtifactWorkspace');
    });

    it('exposes live uncompacted Yjs room edits through GetArtifactLiveContentReaderHook', async () => {
        const { ws, doc } = await connectClient();
        try {
            doc.transact(() => {
                const text = doc.getText('content');
                text.insert(text.length, '\n\nLive uncompacted browser paragraph.');
            }, 'local');

            const enc = encoding.createEncoder();
            encoding.writeVarUint(enc, YJS_MESSAGE_SYNC);
            syncProtocol.writeUpdate(enc, Y.encodeStateAsUpdate(doc));
            ws.send(encoding.toUint8Array(enc));

            await new Promise((r) => setTimeout(r, 40));

            const reader = GetArtifactLiveContentReaderHook();
            expect(reader).not.toBeNull();
            const snap = await reader!(artifactId, editorUser);
            expect(snap?.Content).toContain('Live uncompacted browser paragraph.');
        } finally {
            ws.close();
        }
    });

    it('broadcasts server-owned agent presence awareness across WebSockets & relay, decays working->settled, and clears after exit grace', async () => {
        const relayBus = new InMemoryYjsRelayBus();
        const serverRelay = new InMemoryYjsRoomRelay(relayBus, 'server-1');
        const peerRelay = new InMemoryYjsRoomRelay(relayBus, 'server-2');
        const relayedMessages: YjsRelayMessage[] = [];
        const unsubPeer = await peerRelay.SubscribeRoom(artifactId, (msg) => {
            relayedMessages.push(msg);
        });

        ArtifactCollaborationServer.Instance.SetRoomRelay(serverRelay);

        const { ws, awareness } = await connectClient();
        try {
            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'enter',
                contextUser: editorUser,
                agentRunId: 'run-presence-1',
                agentName: 'Sage',
                toolName: 'upsert_live_table',
                actionSummary: 'Refreshing live query table (Pipeline!A1:E20)',
                location: {
                    Domain: 'spreadsheet',
                    SheetName: 'Pipeline',
                    Range: 'A1:E20',
                },
            });

            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'working',
                contextUser: editorUser,
                agentRunId: 'run-presence-1',
                agentName: 'Sage',
                toolName: 'upsert_live_table',
                actionSummary: 'Refreshing live query table (Pipeline!A1:E20)',
                location: {
                    Domain: 'spreadsheet',
                    SheetName: 'Pipeline',
                    Range: 'A1:E20',
                },
            });

            await new Promise((r) => setTimeout(r, 45));

            const states = Array.from(awareness.getStates().entries());
            const agentEntry = states.find(([cid, st]) => {
                const userObj = (st as TestAwarenessState).user;
                return cid >= AGENT_AWARENESS_CLIENT_ID_BASE && cid <= AGENT_AWARENESS_CLIENT_ID_MAX && userObj?.isAgent === true;
            });
            expect(agentEntry).toBeDefined();
            const agentUser = (agentEntry![1] as TestAwarenessState).user!;
            expect(agentUser.agentName).toBe('Sage');
            expect(agentUser.actingForUserName).toBe('Alice Editor');
            expect(agentUser.actingForUserId).toBe(editorUser.ID);
            expect(agentUser.actionSummary).toBe('Refreshing live query table (Pipeline!A1:E20)');
            expect(agentUser.agentLocation?.Range).toBe('A1:E20');

            // Cross-instance relay also received the awareness frame
            expect(relayedMessages.some((m) => m.MessageType === 'awareness')).toBe(true);

            // Wait for 80ms decay to 'settled'
            await new Promise((r) => setTimeout(r, 95));
            const settledState = awareness.getStates().get(agentEntry![0]) as TestAwarenessState | undefined;
            expect(settledState?.user?.agentPhase).toBe('settled');

            // Emit 'exit' -> remains settled for 40ms grace, then removed cleanly
            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'exit',
                contextUser: editorUser,
                agentRunId: 'run-presence-1',
                agentName: 'Sage',
            });
            await new Promise((r) => setTimeout(r, 85));
            expect(awareness.getStates().has(agentEntry![0])).toBe(false);
        } finally {
            unsubPeer();
            ws.close();
        }
    });

    it('C3 security: strips client-supplied isAgent/actingFor* spoofing, sanitizes user.color, and rejects writes targeting active ProtectedAgentClientIDs', async () => {
        const { ws, doc, awareness } = await connectClient();
        try {
            // Emit real agent presence so an active ProtectedAgentClientID exists on this room
            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'working',
                contextUser: editorUser,
                agentRunId: 'run-protected-agent-1',
                agentName: 'LegitAgent',
            });
            const agentDeadline = Date.now() + 1500;
            let activeAgentClientId: number | undefined;
            while (Date.now() < agentDeadline) {
                for (const [cid, st] of awareness.getStates().entries()) {
                    const userObj = (st as TestAwarenessState).user;
                    if (userObj?.isAgent === true && userObj.agentName === 'LegitAgent') {
                        activeAgentClientId = cid;
                        break;
                    }
                }
                if (activeAgentClientId !== undefined) break;
                await new Promise((r) => setTimeout(r, 15));
            }
            expect(activeAgentClientId).toBeDefined();

            // 1. Browser tries to spoof isAgent/actingForUserName and inject CSS into user.color
            const spoofAwareness = new awarenessProtocol.Awareness(new Y.Doc());
            spoofAwareness.setLocalState({
                isAgent: true,
                agentName: 'SpoofBot',
                user: {
                    name: 'Spoofed Name',
                    color: 'red; background-image: url(https://evil.test/x)',
                    isAgent: true,
                    agentName: 'SpoofBot',
                    actingForUserName: 'Super Admin',
                    agentPhase: 'working',
                },
            });
            const frame = encoding.createEncoder();
            encoding.writeVarUint(frame, YJS_MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
                frame,
                awarenessProtocol.encodeAwarenessUpdate(spoofAwareness, [spoofAwareness.clientID]),
            );
            ws.send(encoding.toUint8Array(frame));

            // 2. Browser also tries to overwrite the active ProtectedAgentClientIDs entry directly
            const hijackEnc = encoding.createEncoder();
            encoding.writeVarUint(hijackEnc, 1);
            encoding.writeVarUint(hijackEnc, activeAgentClientId!);
            encoding.writeVarUint(hijackEnc, 999);
            encoding.writeVarString(
                hijackEnc,
                JSON.stringify({ user: { isAgent: true, agentName: 'HijackedAgent' } }),
            );
            const hijackFrame = encoding.createEncoder();
            encoding.writeVarUint(hijackFrame, YJS_MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(hijackFrame, encoding.toUint8Array(hijackEnc));
            ws.send(encoding.toUint8Array(hijackFrame));

            const deadline = Date.now() + 1500;
            while (!awareness.getStates().has(spoofAwareness.clientID) && Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 15));
            }
            await new Promise((r) => setTimeout(r, 30));

            const clientEntry = awareness.getStates().get(spoofAwareness.clientID) as TestAwarenessState | undefined;
            expect(clientEntry).toBeDefined();
            expect(clientEntry?.isAgent).toBeUndefined();
            expect(clientEntry?.user?.isAgent).toBe(false);
            expect(clientEntry?.user?.actingForUserName).toBeUndefined();
            expect(clientEntry?.user?.userName).toBe('Alice Editor');
            expect(clientEntry?.user?.color).toBe('var(--mj-brand-primary)');

            // Active protected agent clientID was NOT overwritten
            const protectedEntry = awareness.getStates().get(activeAgentClientId!) as TestAwarenessState | undefined;
            expect(protectedEntry?.user?.agentName).toBe('LegitAgent');
            void doc;
            void RedisLocalStorageProvider;
        } finally {
            ws.close();
        }
    });

    it('[C-P0-3] allows human Yjs clientIDs in [0x70000000, 0x7fffffff] and avoids clientID collisions for server agents', async () => {
        const viewer = await connectClient();
        const highIdClient = await connectClient();
        try {
            const presenceKey = `agent:${editorUser.ID}:run-collision-test`;
            const digest = createHash('sha256').update(presenceKey, 'utf8').digest();
            const derivedCollidingId = AGENT_AWARENESS_CLIENT_ID_BASE + (digest.readUInt32BE(0) & 0x0fffffff);

            // Connect a human client using a Y.Doc whose clientID is both inside [0x70000000, 0x7fffffff]
            // and equal to the derived agent ID.
            const humanDoc = new Y.Doc();
            humanDoc.clientID = derivedCollidingId;
            const humanAwareness = new awarenessProtocol.Awareness(humanDoc);
            humanAwareness.setLocalState({
                user: {
                    name: 'Human High ID',
                    color: '#2563eb',
                },
            });
            const humanFrame = encoding.createEncoder();
            encoding.writeVarUint(humanFrame, YJS_MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
                humanFrame,
                awarenessProtocol.encodeAwarenessUpdate(humanAwareness, [humanDoc.clientID]),
            );
            highIdClient.ws.send(encoding.toUint8Array(humanFrame));

            const humanDeadline = Date.now() + 1500;
            while (!viewer.awareness.getStates().has(derivedCollidingId) && Date.now() < humanDeadline) {
                await new Promise((r) => setTimeout(r, 15));
            }
            const humanState = viewer.awareness.getStates().get(derivedCollidingId) as TestAwarenessState | undefined;
            expect(humanState?.user?.isAgent).toBe(false);
            expect(humanState?.user?.color).toBe('#2563eb');

            // Now emit agent presence sharing that exact presenceKey; server must pick an unused clientID
            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'working',
                contextUser: editorUser,
                agentRunId: 'run-collision-test',
                agentName: 'CollisionSafeAgent',
                actionSummary: 'Turn on collision-free ID',
            });

            const agentDeadline = Date.now() + 1500;
            let agentClientId: number | undefined;
            while (Date.now() < agentDeadline) {
                for (const [cid, st] of viewer.awareness.getStates().entries()) {
                    const userObj = (st as TestAwarenessState).user;
                    if (userObj?.isAgent === true && userObj.agentName === 'CollisionSafeAgent') {
                        agentClientId = cid;
                        break;
                    }
                }
                if (agentClientId !== undefined) break;
                await new Promise((r) => setTimeout(r, 15));
            }
            expect(agentClientId).toBeDefined();
            expect(agentClientId).not.toBe(derivedCollidingId);
            expect(viewer.awareness.getStates().has(derivedCollidingId)).toBe(true);
        } finally {
            viewer.ws.close();
            highIdClient.ws.close();
        }
    });

    it('[C-P0-3] maintains monotonic awareness clock across TTL expiry and exit-grace expiry on the same presenceKey', async () => {
        const { ws, awareness } = await connectClient();
        try {
            // Turn 1
            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'working',
                contextUser: editorUser,
                agentRunId: 'run-multi-turn-1',
                agentName: 'Sage',
                actionSummary: 'Turn 1 work',
            });
            const waitForAgent = async (summary: string): Promise<number> => {
                const deadline = Date.now() + 1500;
                while (Date.now() < deadline) {
                    for (const [cid, st] of awareness.getStates().entries()) {
                        const userObj = (st as TestAwarenessState).user;
                        if (userObj?.isAgent === true && userObj.actionSummary === summary) {
                            return cid;
                        }
                    }
                    await new Promise((r) => setTimeout(r, 15));
                }
                throw new Error(`Timed out waiting for agent awareness '${summary}'`);
            };

            const turn1Cid = await waitForAgent('Turn 1 work');
            // Wait past 300ms TTL so server removes entry
            const ttlDeadline = Date.now() + 1500;
            while (awareness.getStates().has(turn1Cid) && Date.now() < ttlDeadline) {
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(awareness.getStates().has(turn1Cid)).toBe(false);

            // Turn 2 on the same agentRunId/presenceKey after TTL removal
            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'working',
                contextUser: editorUser,
                agentRunId: 'run-multi-turn-1',
                agentName: 'Sage',
                actionSummary: 'Turn 2 after TTL',
            });
            const turn2Cid = await waitForAgent('Turn 2 after TTL');
            expect(turn2Cid).toBe(turn1Cid);

            // Explicit exit + wait past 40ms exitGraceMs
            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'exit',
                contextUser: editorUser,
                agentRunId: 'run-multi-turn-1',
                agentName: 'Sage',
            });
            const exitDeadline = Date.now() + 1500;
            while (awareness.getStates().has(turn2Cid) && Date.now() < exitDeadline) {
                await new Promise((r) => setTimeout(r, 15));
            }
            expect(awareness.getStates().has(turn2Cid)).toBe(false);

            // Turn 3 after exit-grace removal
            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'working',
                contextUser: editorUser,
                agentRunId: 'run-multi-turn-1',
                agentName: 'Sage',
                actionSummary: 'Turn 3 after exit',
            });
            const turn3Cid = await waitForAgent('Turn 3 after exit');
            expect(turn3Cid).toBe(turn1Cid);
        } finally {
            ws.close();
        }
    });

    it('[C-P1-1] GetArtifactLiveContentReaderHook hydrates cold MJ: Artifact Working States when no in-memory room exists', async () => {
        const seedDoc = new Y.Doc();
        seedDoc.getText('content').insert(0, '# Cold Persisted Working State');
        seedDoc.getMap('meta').set('baseVersionId', 'ver-1');
        seedDoc.getMap('meta').set('baseVersionNumber', 1);
        workingStates.push({
            ID: 'ws-cold-1',
            ArtifactID: artifactId,
            YjsState: Y.encodeStateAsUpdate(seedDoc),
            __mj_UpdatedAt: new Date(),
        });

        expect(ArtifactCollaborationServer.Instance.ActiveRoomCount).toBe(0);
        const liveReader = GetArtifactLiveContentReaderHook();
        expect(liveReader).not.toBeNull();
        const snap = await liveReader!(artifactId, editorUser);
        expect(snap).not.toBeNull();
        expect(snap?.Content).toBe('# Cold Persisted Working State');
        expect(snap?.VersionNumber).toBe(1);
    });

    it('[C-P0-3] deletes PreferredObjectsPaneHeightPx from Y.Map workbookMeta when cleared to undefined', async () => {
        const engine = SpreadsheetEngine.Instance;
        const wb1 = engine.CreateEmptyWorkbook('PaneHeightBook', ['Sheet1'], 4, 3);
        wb1.PreferredObjectsPaneHeightPx = 320;
        const v1Json = engine.SerializeWorkbook(wb1);
        versions = [
            {
                ID: 'ver-1',
                ArtifactID: artifactId,
                VersionNumber: 1,
                Content: v1Json,
            },
        ];

        const room = await ArtifactCollaborationServer.Instance.GetOrCreateRoom(artifactId, editorUser);
        expect(room).not.toBeNull();
        expect(room!.Doc.getMap<string>('workbookMeta').get('PreferredObjectsPaneHeightPx')).toBe('320');

        const wb2 = engine.ParseWorkbook(v1Json, undefined, { SkipEvaluate: true });
        delete wb2.PreferredObjectsPaneHeightPx;
        const v2Json = engine.SerializeWorkbook(wb2);

        const mutationRes = await ArtifactCollaborationServer.Instance.ApplyServerContentMutation(
            artifactId,
            v2Json,
            editorUser,
            false,
            v1Json,
        );
        expect(mutationRes.Success).toBe(true);
        expect(room!.Doc.getMap<string>('workbookMeta').has('PreferredObjectsPaneHeightPx')).toBe(false);
    });
});
