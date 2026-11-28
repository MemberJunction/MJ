import { createServer, type Server as HttpServer, type IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket as WsClient } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import {
    IMetadataProvider,
    IRunQueryProvider,
    IRunViewProvider,
    RunQueryParams,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import { BaseRealtimeChannelServer } from '@memberjunction/ai';
import {
    ArtifactAgentPresenceEvent,
    ArtifactToolManager,
    GovernedArtifactService,
    SpreadsheetToolLibrary,
} from '@memberjunction/ai-agents';
import { MutateGovernedArtifactAction } from '@memberjunction/core-actions';
import {
    ArtifactPermissionEngine,
    DocumentLiveBlockEngine,
    GetSpreadsheetWorkerRunner,
    QueryEngine,
    RegisterSpreadsheetWorkerRunner,
    SetSpreadsheetWorkerIsolationRequired,
    SpreadsheetEngine,
    type SpreadsheetWorkerIsolationRunner,
} from '@memberjunction/core-entities';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
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
        'Resolver', 'Query', 'Mutation', 'Subscription', 'Arg', 'Args', 'ArgsType',
        'Ctx', 'Root', 'Info', 'Field', 'FieldResolver', 'ObjectType', 'InputType',
        'InterfaceType', 'Authorized', 'UseMiddleware', 'Extensions', 'Directive', 'PubSub',
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
    ArtifactCollaborationServer,
} from '../collaboration/ArtifactCollaborationServer.js';
import { InMemoryYjsRelayBus, InMemoryYjsRoomRelay } from '../collaboration/YjsRoomRelay.js';

class TestDetachedRelayCollabNode extends ArtifactCollaborationServer {
    public constructor() {
        super();
    }

    public DispatchAgentPresence(evt: ArtifactAgentPresenceEvent): void {
        this.applyServerAgentPresenceEvent(evt);
    }
}

interface E2EAwarenessLocation {
    Domain?: string;
    SheetName?: string;
    RangeRef?: string;
    Summary?: string;
}

interface E2EAwarenessUser {
    isAgent?: boolean;
    agentName?: string;
    actingForUserName?: string;
    actingForUserId?: string;
    agentPhase?: string;
    agentLocation?: E2EAwarenessLocation;
}

interface E2EAwarenessState {
    user?: E2EAwarenessUser;
}

interface E2ELiveTableStepResult {
    tool: string;
    data: {
        materialized?: boolean;
        headers?: string[];
        rowCount?: number;
        boundingRange?: string;
    };
}

interface MockArtifactVersionEntityRecord {
    ID: string;
    ArtifactID: string;
    VersionNumber: number;
    Content: string;
    ContentMode: string;
    MimeType: string;
    NewRecord: () => boolean;
    Save: () => Promise<boolean>;
}

function makeUser(id: string, name: string, email: string): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = email;
    u.IsActive = true;
    return u;
}

describe('Unified Agent Artifacts E2E: CoreAction -> GovernedArtifactService -> Live Yjs Awareness & Sheet Sync', () => {
    const alice = makeUser('11111111-1111-1111-1111-111111111111', 'Alice Editor', 'alice@example.com');
    const artifactId = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
    const artifactTypeId = 'tttttttt-1111-2222-3333-444444444444';

    let httpServer: HttpServer;
    let wsPort: number;
    let versions: Array<{
        ID: string;
        ArtifactID: string;
        VersionNumber: number;
        Content: string;
        ContentMode: string;
        MimeType: string;
    }>;

    function createInitialWorkbookJson(): string {
        const engine = new SpreadsheetEngine();
        const wb = engine.CreateEmptyWorkbook('Live Workbook', ['Query Data']);
        return engine.SerializeWorkbook(wb);
    }

    function createMockProvider(): IMetadataProvider & IRunViewProvider & IRunQueryProvider {
        const runViewFn = async (params: RunViewParams) => {
            if (params.EntityName === 'MJ: Artifacts') {
                return {
                    Success: true,
                    Results: [{
                        ID: artifactId,
                        Name: 'Revenue Workbook',
                        TypeID: artifactTypeId,
                        Type: 'Excel Spreadsheet',
                        UserID: alice.ID,
                    }],
                    TotalRowCount: 1,
                };
            }
            if (params.EntityName === 'MJ: Artifact Types') {
                return {
                    Success: true,
                    Results: [{
                        ID: artifactTypeId,
                        Name: 'Excel Spreadsheet',
                        ContentType: 'application/json',
                        DriverClass: 'SpreadsheetArtifactViewerPlugin',
                        ToolLibraryClass: 'SpreadsheetToolLibrary',
                    }],
                    TotalRowCount: 1,
                };
            }
            if (params.EntityName === 'MJ: Artifact Versions') {
                const matching = versions
                    .filter((v) => UUIDsEqual(v.ArtifactID, artifactId))
                    .sort((a, b) => b.VersionNumber - a.VersionNumber);
                return {
                    Success: true,
                    Results: matching,
                    TotalRowCount: matching.length,
                };
            }
            return { Success: true, Results: [], TotalRowCount: 0 };
        };

        const getEntityObjectFn = async (entityName: string) => {
            if (entityName === 'MJ: Artifact Versions') {
                const record: MockArtifactVersionEntityRecord = {
                    ID: `ver-e2e-${versions.length + 1}`,
                    ArtifactID: artifactId,
                    VersionNumber: versions.length + 1,
                    Content: '',
                    ContentMode: 'Text',
                    MimeType: 'application/json',
                    NewRecord: () => true,
                    Save: async () => {
                        versions.push({
                            ID: String(record.ID),
                            ArtifactID: String(record.ArtifactID),
                            VersionNumber: Number(record.VersionNumber),
                            Content: String(record.Content ?? ''),
                            ContentMode: String(record.ContentMode ?? 'Text'),
                            MimeType: String(record.MimeType ?? 'application/json'),
                        });
                        return true;
                    },
                };
                return record;
            }
            return { NewRecord: () => true, Save: async () => true };
        };

        const runQueryFn = async (params: RunQueryParams) => ({
            Success: true,
            QueryID: params.QueryID ?? 'qry-1',
            QueryName: params.QueryName ?? 'Monthly Revenue',
            Results: [
                { Month: 'Jan', Revenue: 12000 },
                { Month: 'Feb', Revenue: 15500 },
            ],
            RowCount: 2,
            TotalRowCount: 2,
            ExecutionTime: 8,
            ErrorMessage: '',
            AppliedParameters: {},
        });

        // Saved queries resolve through the provider's QueryEngine; its deprecated query list stays empty.
        const queryEngineStub = {
            Config: async () => undefined,
            Queries: [
                {
                    ID: 'qry-1',
                    Name: 'Monthly Revenue',
                    CategoryPath: '',
                    QueryParameters: [],
                    QueryEntities: [],
                    UserCanRun: () => ({ canRun: true, deniedEntities: [] }),
                },
            ],
        } as unknown as QueryEngine;
        vi.spyOn(QueryEngine, 'GetProviderInstance').mockReturnValue(queryEngineStub);

        const providerStub: Partial<IMetadataProvider & IRunViewProvider & IRunQueryProvider> = {
            Entities: [],
            Queries: [],
            EntityByName: () => undefined,
            EntityByID: () => undefined,
            RunView: runViewFn as IRunViewProvider['RunView'],
            RunViews: (async (list: RunViewParams[]) => Promise.all(list.map(runViewFn))) as IRunViewProvider['RunViews'],
            GetEntityObject: getEntityObjectFn as IMetadataProvider['GetEntityObject'],
            RunQuery: runQueryFn as IRunQueryProvider['RunQuery'],
        };
        return providerStub as IMetadataProvider & IRunViewProvider & IRunQueryProvider;
    }

    /*
     * This E2E asserts the CoreAction -> GovernedArtifactService -> Yjs/awareness wiring, not spreadsheet worker
     * isolation, so it runs the engine on the main thread through the engine's own runner registration (D5-61, D-091
     * item 17). The server runner starts a fresh worker per isolated operation (~11 per mutation, each ~320 ms of cold
     * module loading), which made this test CPU-bound past its timeout under load. Isolation itself is covered by
     * MJCoreEntitiesServer MJArtifactEntityServer.test.ts (R6-1 & R7-3), ArtifactAdversarialNextWaveServer.test.ts
     * (Follow-up 3) and MJCoreEntities SpreadsheetEngine.test.ts (R8-3, R9-2). The registered runner is restored after.
     */
    let serverRunner: SpreadsheetWorkerIsolationRunner | null = null;

    beforeAll(() => {
        serverRunner = GetSpreadsheetWorkerRunner();
        RegisterSpreadsheetWorkerRunner(null);
        SetSpreadsheetWorkerIsolationRequired(false);
    });

    afterAll(() => {
        RegisterSpreadsheetWorkerRunner(serverRunner);
        SetSpreadsheetWorkerIsolationRequired(serverRunner !== null);
    });

    beforeEach(async () => {
        // Instantiating ensures the module & @RegisterClass side effect cannot be tree-shaken.
        expect(new SpreadsheetToolLibrary()).toBeDefined();

        versions = [
            {
                ID: 'ver-e2e-1',
                ArtifactID: artifactId,
                VersionNumber: 1,
                Content: createInitialWorkbookJson(),
                ContentMode: 'Text',
                MimeType: 'application/json',
            },
        ];

        vi.spyOn(ArtifactPermissionEngine.Instance, 'ResolvePermissions').mockResolvedValue({
            ArtifactID: artifactId,
            UserID: alice.ID,
            IsOwner: true,
            CanRead: true,
            CanEdit: true,
            CanDelete: true,
            CanShare: true,
            HasDirectPermissions: true,
            GrantedBy: 'owner',
        });

        const collab = ArtifactCollaborationServer.Instance;
        await collab.Shutdown();
        (collab as { _shuttingDown?: boolean })._shuttingDown = false;
        collab.SetTicketHmacSecret('test-collab-ticket-hmac-secret-at-least-32-bytes!!');
        collab.SetTicketReplayStore(null);
        DocumentLiveBlockEngine.Instance.SetSigningSecret('test-frozen-block-hmac-secret-at-least-32-bytes!!');
        collab.SetRoomRelay(new InMemoryYjsRoomRelay());
        collab.SetMetadataProviderOverride(createMockProvider());
        collab.SetAgentPresenceTimings({
            throttleMs: 25,
            decayMs: 90,
            ttlMs: 300,
            exitGraceMs: 40,
        });
        collab.SetAuthResolverOverride(async (req: IncomingMessage) => {
            const url = new URL(req.url ?? '/', 'http://localhost');
            return url.searchParams.get('testUserId') === alice.ID ? alice : null;
        });

        httpServer = createServer();
        httpServer.on('upgrade', (req, socket, head) => {
            if (!collab.TryHandleUpgrade(req, socket, head)) {
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
        await ArtifactCollaborationServer.Instance.Shutdown();
        ArtifactCollaborationServer.Instance.SetMetadataProviderOverride(null);
        ArtifactCollaborationServer.Instance.SetAuthResolverOverride(null);
        ArtifactCollaborationServer.Instance.SetTicketHmacSecret(null);
        vi.restoreAllMocks();
        if (httpServer) {
            await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        }
    });

    async function connectYjsBrowserClient(): Promise<{
        ws: WsClient;
        doc: Y.Doc;
        awareness: awarenessProtocol.Awareness;
    }> {
        const doc = new Y.Doc();
        // Ensure the random browser Y.Doc clientID never collides with the reserved server agent range (1 in 16 chance).
        if (doc.clientID >= AGENT_AWARENESS_CLIENT_ID_BASE && doc.clientID <= AGENT_AWARENESS_CLIENT_ID_MAX) {
            doc.clientID = (doc.clientID ^ 0x40000000) >>> 0;
        }
        const awareness = new awarenessProtocol.Awareness(doc);
        const ws = new WsClient(
            `ws://127.0.0.1:${wsPort}/collaboration/yjs?artifactId=${encodeURIComponent(artifactId)}&testUserId=${encodeURIComponent(alice.ID)}`,
        );

        await new Promise<void>((resolve, reject) => {
            let syncDone = false;
            ws.once('error', reject);
            ws.on('message', (data: Buffer) => {
                const msg = new Uint8Array(data);
                const decoder = decoding.createDecoder(msg);
                const msgType = decoding.readVarUint(decoder);
                if (msgType === 0) {
                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, 0);
                    syncProtocol.readSyncMessage(decoder, encoder, doc, 'server');
                    if (encoding.length(encoder) > 1) {
                        ws.send(encoding.toUint8Array(encoder));
                    }
                    if (!syncDone) {
                        syncDone = true;
                        resolve();
                    }
                } else if (msgType === 1) {
                    awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), 'server');
                }
            });
        });

        return { ws, doc, awareness };
    }

    it('registers ArtifactWorkspaceChannelServer and executes CoreAction -> GovernedArtifactService -> Live Yjs Awareness E2E', async () => {
        // 1. Verify ArtifactWorkspaceChannelServer is registered for realtime sessions
        const serverChannel = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelServer>(
            BaseRealtimeChannelServer,
            'ArtifactWorkspaceChannelServer',
        );
        expect(serverChannel).not.toBeNull();

        // 2. Verify zero-initial-artifact workspace enables create_artifact on ArtifactToolManager
        const manager = new ArtifactToolManager();
        manager.Initialize([], { contextUser: alice, workspaceEnabled: true });
        expect(manager.IsWorkspaceEnabled()).toBe(true);
        expect(manager.HasArtifacts()).toBe(false);

        // 3. Connect simulated browser WebSocket viewer on /collaboration/yjs
        const { ws, doc, awareness } = await connectYjsBrowserClient();
        const observedAgentStates: Array<{
            clientId: number;
            agentName?: string;
            actingForUserName?: string;
            actingForUserId?: string;
            agentPhase?: string;
            domain?: string;
            sheetName?: string;
        }> = [];
        awareness.on('update', () => {
            for (const [cid, st] of awareness.getStates().entries()) {
                const userObj = (st as E2EAwarenessState)?.user;
                if (
                    cid >= AGENT_AWARENESS_CLIENT_ID_BASE &&
                    cid <= AGENT_AWARENESS_CLIENT_ID_MAX &&
                    userObj?.isAgent === true
                ) {
                    const loc = userObj.agentLocation;
                    observedAgentStates.push({
                        clientId: cid,
                        agentName: userObj.agentName,
                        actingForUserName: userObj.actingForUserName,
                        actingForUserId: userObj.actingForUserId,
                        agentPhase: userObj.agentPhase,
                        domain: loc?.Domain,
                        sheetName: loc?.SheetName,
                    });
                }
            }
        });

        try {
            // 4. Execute __MutateGovernedArtifact CoreAction with Query Builder agent attribution
            const mutateAction = new MutateGovernedArtifactAction();
            expect(MJGlobal.Instance.ClassFactory.CreateInstance<BaseAction>(BaseAction, '__MutateGovernedArtifact')).not.toBeNull();

            const runParams: RunActionParams = {
                ContextUser: alice,
                Action: { ID: 'act-mutate', Name: 'Mutate Governed Artifact' } as RunActionParams['Action'],
                Filters: [],
                Context: { AgentRunID: 'run-e2e-qb', AgentName: 'Query Builder' } as RunActionParams['Context'],
                Params: [
                    { Name: 'ArtifactID', Type: 'Input', Value: artifactId },
                    {
                        Name: 'Operations',
                        Type: 'Input',
                        Value: [
                            {
                                tool: 'upsert_live_table',
                                input: {
                                    sheet: 'Query Data',
                                    title: 'Monthly Revenue',
                                    sourceType: 'SavedQuery',
                                    queryId: 'qry-1',
                                    queryName: 'Monthly Revenue',
                                    anchorCell: 'A1',
                                },
                            },
                            {
                                tool: 'write_cells',
                                input: {
                                    sheet: 'Query Data',
                                    cells: [{ address: 'C1', value: 'Total' }, { address: 'C2', formula: '=SUM(B2:B3)' }],
                                },
                            },
                        ],
                    },
                ],
            };
            (runParams as { Provider?: IMetadataProvider }).Provider = createMockProvider();

            const actionResult = await mutateAction.Run(runParams);
            expect(actionResult.Success, actionResult.Message).toBe(true);
            expect(runParams.Params.find((p) => p.Name === 'VersionNumber')?.Value).toBe(2);

            const resultsParam = runParams.Params.find((p) => p.Name === 'Results')?.Value as
                | E2ELiveTableStepResult[]
                | undefined;
            const liveTableStep = resultsParam?.find((r) => r.tool === 'upsert_live_table')?.data;
            expect(liveTableStep?.materialized).toBe(true);
            expect(liveTableStep?.headers).toEqual(['Month', 'Revenue']);
            expect(liveTableStep?.rowCount).toBe(2);
            expect(liveTableStep?.boundingRange).toBe('A1:B3');

            // Wait briefly for server Yjs room commit & exit grace period
            await new Promise((r) => setTimeout(r, 120));

            // 5. Verify live Yjs document content updated on the browser WebSocket viewer,
            // preserving FLS stripping of live values on wire/DB and hydrating cleanly for Alice.
            const liveJson = doc.getText('content').toString();
            expect(liveJson).toContain('Monthly Revenue');
            expect(liveJson).toContain('qry-1');
            expect(liveJson).toContain('Total');
            expect(liveJson).toContain('=SUM(B2:B3)');

            const hydratedWb = await SpreadsheetEngine.Instance.ParseWorkbookIsolated(liveJson, undefined, {
                SkipEvaluate: true
            });
            await SpreadsheetEngine.Instance.RefreshLiveTables(hydratedWb, alice, createMockProvider());
            await SpreadsheetEngine.Instance.EvaluateWorkbookIsolated(hydratedWb);
            expect(hydratedWb.Worksheets[0].Cells['A1']?.ComputedValue).toBe('Month');
            expect(hydratedWb.Worksheets[0].Cells['B2']?.ComputedValue).toBe(12000);
            expect(hydratedWb.Worksheets[0].Cells['B3']?.ComputedValue).toBe(15500);
            expect(hydratedWb.Worksheets[0].Cells['C2']?.ComputedValue).toBe(27500);

            // 6. Unconditionally verify browser WebSocket client received spoof-proof server Yjs
            // agent awareness showing Query Builder working on behalf of Alice Editor, then cleared on exit
            expect(observedAgentStates.length).toBeGreaterThan(0);
            expect(observedAgentStates.some((s) => s.agentName === 'Query Builder')).toBe(true);
            expect(observedAgentStates.some((s) => s.actingForUserName === 'Alice Editor')).toBe(true);
            expect(observedAgentStates.some((s) => s.actingForUserId === alice.ID)).toBe(true);
            expect(observedAgentStates.some((s) => s.domain === 'spreadsheet')).toBe(true);

            // Agent presence should be active during the run and cleared after exit + exitGraceMs
            await GovernedArtifactService.Instance.EmitAgentPresence({
                artifactId,
                phase: 'exit',
                contextUser: alice,
                agentRunId: 'run-e2e-qb',
                agentName: 'Query Builder',
            });
            const exitDeadline = Date.now() + 5000;
            while (
                Array.from(awareness.getStates().keys()).some(
                    (cid) => cid >= AGENT_AWARENESS_CLIENT_ID_BASE && cid <= AGENT_AWARENESS_CLIENT_ID_MAX,
                ) &&
                Date.now() < exitDeadline
            ) {
                await new Promise((r) => setTimeout(r, 15));
            }
            expect(
                Array.from(awareness.getStates().keys()).some(
                    (cid) => cid >= AGENT_AWARENESS_CLIENT_ID_BASE && cid <= AGENT_AWARENESS_CLIENT_ID_MAX,
                ),
            ).toBe(false);
        } finally {
            ws.close();
        }
    });

    it('relays detached agent awareness from MJServer node A (0 WS rooms) to viewer connected to node B (H1)', async () => {
        const sharedBus = new InMemoryYjsRelayBus();
        const serverB = ArtifactCollaborationServer.Instance;
        serverB.SetRoomRelay(new InMemoryYjsRoomRelay(sharedBus));
        serverB.SetAgentPresenceTimings({
            throttleMs: 0,
            decayMs: 2_000,
            ttlMs: 60_000,
            exitGraceMs: 0,
        });

        const serverA = new TestDetachedRelayCollabNode();
        serverA.SetRoomRelay(new InMemoryYjsRoomRelay(sharedBus));
        serverA.SetAgentPresenceTimings({
            throttleMs: 0,
            decayMs: 2_000,
            ttlMs: 5_000,
            exitGraceMs: 0,
        });

        const { ws, awareness } = await connectYjsBrowserClient();
        try {
            const observed: E2EAwarenessUser[] = [];
            awareness.on('change', () => {
                for (const [clientId, state] of awareness.getStates().entries()) {
                    if (
                        clientId >= AGENT_AWARENESS_CLIENT_ID_BASE &&
                        clientId <= AGENT_AWARENESS_CLIENT_ID_MAX &&
                        state &&
                        typeof state === 'object'
                    ) {
                        const userObj = (state as E2EAwarenessState).user;
                        if (userObj) {
                            observed.push(userObj);
                        }
                    }
                }
            });

            // Confirm Node A truly has zero local rooms when the agent runs there
            expect(serverA.ActiveRoomCount).toBe(0);

            const presenceKey = `relay-agent:${alice.ID}`;
            serverA.DispatchAgentPresence({
                ArtifactID: artifactId,
                AgentPresenceKey: presenceKey,
                AgentRunID: 'run-detached-node-a',
                AgentName: 'Query Builder',
                ActingForUserID: alice.ID,
                ActingForUserName: 'Alice Editor',
                ActingForUserEmail: 'alice@example.com',
                Phase: 'working',
                ToolName: 'upsert_live_table',
                ActionSummary: 'Streaming query rows from Node A',
                Location: {
                    Domain: 'spreadsheet',
                    SheetName: 'Query Data',
                    RangeRef: 'A1:B3',
                    Summary: 'Sheet: Query Data (A1:B3)',
                },
                TimestampMs: Date.now(),
            });

            const enterDeadline = Date.now() + 5000;
            while (!observed.some((s) => s.agentName === 'Query Builder') && Date.now() < enterDeadline) {
                await new Promise((r) => setTimeout(r, 15));
            }
            expect(observed.some((s) => s.agentName === 'Query Builder')).toBe(true);
            expect(observed.some((s) => s.actingForUserName === 'Alice Editor')).toBe(true);
            expect(observed.some((s) => s.agentPhase === 'working')).toBe(true);

            // Exit on detached Node A must relay removal ('null') so viewer on Node B clears the indicator
            serverA.DispatchAgentPresence({
                ArtifactID: artifactId,
                AgentPresenceKey: presenceKey,
                AgentRunID: 'run-detached-node-a',
                AgentName: 'Query Builder',
                ActingForUserID: alice.ID,
                ActingForUserName: 'Alice Editor',
                Phase: 'exit',
                TimestampMs: Date.now(),
            });

            const exitDeadline = Date.now() + 5000;
            while (
                Array.from(awareness.getStates().keys()).some(
                    (cid) => cid >= AGENT_AWARENESS_CLIENT_ID_BASE && cid <= AGENT_AWARENESS_CLIENT_ID_MAX,
                ) &&
                Date.now() < exitDeadline
            ) {
                await new Promise((r) => setTimeout(r, 15));
            }
            expect(
                Array.from(awareness.getStates().keys()).some(
                    (cid) => cid >= AGENT_AWARENESS_CLIENT_ID_BASE && cid <= AGENT_AWARENESS_CLIENT_ID_MAX,
                ),
            ).toBe(false);
        } finally {
            await serverA.Shutdown();
            ws.close();
        }
    });

    it('[C-P0-3] relay ghost presence TTL cleanup: clears relayed agent awareness when peer node crashes without sending exit', async () => {
        const bus = new InMemoryYjsRelayBus();
        const serverB = ArtifactCollaborationServer.Instance;
        serverB.SetRoomRelay(new InMemoryYjsRoomRelay(bus));
        serverB.SetAgentPresenceTimings({
            throttleMs: 0,
            decayMs: 60,
            ttlMs: 120,
            exitGraceMs: 0,
        });

        const serverA = new TestDetachedRelayCollabNode();
        serverA.SetRoomRelay(new InMemoryYjsRoomRelay(bus));
        serverA.SetAgentPresenceTimings({
            throttleMs: 0,
            decayMs: 5_000,
            ttlMs: 60_000, // Longer than serverB so we test serverB's own relay ghost TTL
            exitGraceMs: 0,
        });

        const { ws, awareness } = await connectYjsBrowserClient();
        try {
            const presenceKey = `ghost-relay-agent:${alice.ID}`;
            serverA.DispatchAgentPresence({
                ArtifactID: artifactId,
                AgentPresenceKey: presenceKey,
                AgentRunID: 'run-ghost-crash',
                AgentName: 'GhostNodeAgent',
                ActingForUserID: alice.ID,
                ActingForUserName: 'Alice Editor',
                Phase: 'working',
                TimestampMs: Date.now(),
            });

            const appearDeadline = Date.now() + 2000;
            let relayedAgentCid: number | undefined;
            while (Date.now() < appearDeadline) {
                for (const [cid, st] of awareness.getStates().entries()) {
                    const userObj = (st as E2EAwarenessState)?.user;
                    if (userObj?.isAgent === true && userObj.agentName === 'GhostNodeAgent') {
                        relayedAgentCid = cid;
                        break;
                    }
                }
                if (relayedAgentCid !== undefined) break;
                await new Promise((r) => setTimeout(r, 15));
            }
            expect(relayedAgentCid).toBeDefined();

            // Simulate Node A crashing abruptly (Shutdown clears its timers without broadcasting exit)
            await serverA.Shutdown();

            // Node B's relay ghost TTL (ttlMs + grace = 120ms + 25ms = 145ms) must remove the ghost presence
            const cleanupDeadline = Date.now() + 2000;
            while (awareness.getStates().has(relayedAgentCid!) && Date.now() < cleanupDeadline) {
                await new Promise((r) => setTimeout(r, 20));
            }
            expect(awareness.getStates().has(relayedAgentCid!)).toBe(false);
        } finally {
            await serverA.Shutdown();
            ws.close();
        }
    });
});
