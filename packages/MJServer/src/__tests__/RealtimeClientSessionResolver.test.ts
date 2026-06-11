// type-graphql decorators (`@ObjectType`, `@Field`, `@Mutation`) on the resolver call
// `Reflect.getMetadata`, which only exists when this polyfill is loaded first. Vitest does not
// bring it in automatically — this line MUST precede any import that pulls in the resolver file.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock CanRun authorization (AIAgentPermissionHelper.HasPermission) ---
const hasPermissionMock = vi.fn<[], Promise<boolean>>();
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: (...args: unknown[]) => hasPermissionMock(...(args as [])),
    },
}));

// --- Mock AIEngine so the Voice Co-Agent resolves without DB-backed config ---
/** Minimal cached-agent shape the resolver's co-agent chain reads. */
interface FakeAgent {
    ID: string;
    Name: string;
    Status?: string;
    TypeID?: string | null;
    DefaultCoAgentID?: string | null;
}
interface FakeAgentType {
    ID: string;
    Name: string;
    DefaultCoAgentID?: string | null;
}
const agentsMock = vi.fn((): FakeAgent[] => [{ ID: 'co-agent-1', Name: 'Voice Co-Agent' }]);
const agentTypesMock = vi.fn((): FakeAgentType[] => []);
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            get Agents() {
                return agentsMock();
            },
            get AgentTypes() {
                return agentTypesMock();
            },
        },
    },
}));

// --- Mock the client-direct service (prepare + relayed-tool execution) ---
const prepareClientSessionMock = vi.fn();
const executeRelayedToolMock = vi.fn();
vi.mock('@memberjunction/ai-agents', () => ({
    RealtimeClientSessionService: class {
        PrepareClientSession = prepareClientSessionMock;
        ExecuteRelayedTool = executeRelayedToolMock;
    },
}));

// --- Mock SessionManager (create / close / heartbeat) ---
const createSessionMock = vi.fn();
const closeSessionMock = vi.fn(async () => true);
const heartbeatMock = vi.fn(async () => true);
vi.mock('../agentSessions/index.js', () => ({
    SessionManager: class {
        CreateSession = createSessionMock;
        CloseSession = closeSessionMock;
        Heartbeat = heartbeatMock;
    },
}));

// --- Mock provider helper so the resolver gets a controllable provider ---
let currentProvider: unknown;
vi.mock('../util.js', () => ({
    GetReadWriteProvider: () => currentProvider,
}));

import { RealtimeClientSessionResolver } from '../resolvers/RealtimeClientSessionResolver.js';
import type { AppContext } from '../types.js';

const USER = { ID: 'user-1', Email: 'tester@example.com' };

/** Build a resolver with GetUserFromPayload stubbed to return our test user. */
function makeResolver(): RealtimeClientSessionResolver {
    const resolver = new RealtimeClientSessionResolver();
    // GetUserFromPayload lives on ResolverBase; stub it to bypass the real auth machinery.
    (resolver as unknown as { GetUserFromPayload: () => unknown }).GetUserFromPayload = () => USER;
    return resolver;
}

/** Minimal AppContext — providers is consumed by the mocked GetReadWriteProvider, so contents are inert. */
function makeCtx(): AppContext {
    return { userPayload: { sessionId: 'pubsub-session-1' }, providers: [] } as unknown as AppContext;
}

/** A controllable PubSubEngine stub whose `publish` calls are asserted. */
function makePubSub(): { publish: ReturnType<typeof vi.fn> } {
    return { publish: vi.fn(async () => undefined) };
}

interface FakeSession {
    [key: string]: unknown;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
    LatestResult?: { CompleteMessage?: string };
}

function makeSessionEntity(overrides: Partial<FakeSession> = {}): FakeSession {
    return {
        ID: 'session-1',
        Status: 'Active',
        ConversationID: 'conv-1',
        UserID: 'user-1',
        Config_: JSON.stringify({ targetAgentID: 'target-1' }),
        NewRecord: vi.fn(),
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        LatestResult: { CompleteMessage: '' },
        ...overrides,
    };
}

/** Provider whose GetEntityObject returns a fixed entity per entity name. */
function makeProvider(factory: (entityName: string) => FakeSession): unknown {
    return { GetEntityObject: vi.fn(async (name: string) => factory(name)) };
}

beforeEach(() => {
    hasPermissionMock.mockReset();
    prepareClientSessionMock.mockReset();
    executeRelayedToolMock.mockReset();
    createSessionMock.mockReset();
    closeSessionMock.mockClear();
    heartbeatMock.mockClear();
    agentsMock.mockReturnValue([{ ID: 'co-agent-1', Name: 'Voice Co-Agent' }]);
    agentTypesMock.mockReturnValue([]);
});

describe('RealtimeClientSessionResolver.StartRealtimeClientSession', () => {
    it('denies and creates no session when CanRun on the target is false', async () => {
        hasPermissionMock.mockResolvedValue(false);
        currentProvider = makeProvider(() => makeSessionEntity());
        const resolver = makeResolver();

        await expect(
            resolver.StartRealtimeClientSession('target-1', makeCtx()),
        ).rejects.toThrow(/not authorized/i);

        expect(createSessionMock).not.toHaveBeenCalled();
        expect(prepareClientSessionMock).not.toHaveBeenCalled();
    });

    it('returns the ephemeral config and stores targetAgentID + run ids in session config on success', async () => {
        hasPermissionMock.mockResolvedValue(true);
        currentProvider = makeProvider(() => makeSessionEntity());
        const createdSession = makeSessionEntity({ ID: 'session-9', ConversationID: 'conv-9' });
        createSessionMock.mockResolvedValue(createdSession);
        prepareClientSessionMock.mockResolvedValue({
            Success: true,
            CoAgentRunID: 'co-run-9',
            PromptRunID: 'prompt-run-9',
            ClientConfig: {
                Provider: 'openai',
                Model: 'gpt-realtime',
                EphemeralToken: 'ek_abc',
                ExpiresAt: '2026-01-01T00:00:00Z',
                SessionConfig: { instructions: 'hi' },
            },
        });
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), 'conv-9');

        // CanRun was checked on the TARGET agent.
        expect(hasPermissionMock).toHaveBeenCalledWith('target-1', USER, 'run');
        // Session created under the co-agent, with targetAgentID persisted authoritatively.
        const createArg = createSessionMock.mock.calls[0][0] as { agentID: string; config: string };
        expect(createArg.agentID).toBe('co-agent-1');
        expect(JSON.parse(createArg.config)).toEqual({ targetAgentID: 'target-1' });
        // After prepare, the observability run ids are written back into the session config + saved.
        expect(JSON.parse(createdSession.Config_ as string)).toEqual({
            targetAgentID: 'target-1', coAgentRunID: 'co-run-9', promptRunID: 'prompt-run-9',
        });
        expect(createdSession.Save).toHaveBeenCalled();
        // Ephemeral config surfaced to the browser.
        expect(result.AgentSessionId).toBe('session-9');
        expect(result.ConversationId).toBe('conv-9');
        expect(result.Provider).toBe('openai');
        expect(result.Model).toBe('gpt-realtime');
        expect(result.EphemeralToken).toBe('ek_abc');
        expect(result.ExpiresAt).toBe('2026-01-01T00:00:00Z');
        expect(JSON.parse(result.SessionConfigJson)).toEqual({ instructions: 'hi' });
    });

    it('threads preferredModelId to the prepare service and surfaces ModelName + narration template', async () => {
        hasPermissionMock.mockResolvedValue(true);
        currentProvider = makeProvider(() => makeSessionEntity());
        createSessionMock.mockResolvedValue(makeSessionEntity({ ID: 'session-10' }));
        prepareClientSessionMock.mockResolvedValue({
            Success: true,
            ModelID: 'model-77',
            ModelName: 'GPT Realtime 2',
            NarrationInstructionsTemplate: 'Progress: "{{ progressMessage }}" — narrate it.',
            ClientConfig: {
                Provider: 'openai',
                Model: 'gpt-realtime-2',
                EphemeralToken: 'ek_xyz',
                ExpiresAt: '2026-01-01T00:00:00Z',
                SessionConfig: {},
            },
        });
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), 'conv-1', undefined, 'model-77');

        // The explicit model choice is threaded into the prepare input.
        const prepArg = prepareClientSessionMock.mock.calls[0][0] as { PreferredModelID?: string };
        expect(prepArg.PreferredModelID).toBe('model-77');
        // The active model name + narration template surface on the result.
        expect(result.ModelName).toBe('GPT Realtime 2');
        expect(result.NarrationInstructionsTemplate).toContain('{{ progressMessage }}');
    });

    it('omits preferredModelId from the prepare input when not supplied (nullable result fields)', async () => {
        hasPermissionMock.mockResolvedValue(true);
        currentProvider = makeProvider(() => makeSessionEntity());
        createSessionMock.mockResolvedValue(makeSessionEntity({ ID: 'session-11' }));
        prepareClientSessionMock.mockResolvedValue({
            Success: true,
            ClientConfig: {
                Provider: 'openai',
                Model: 'gpt-realtime',
                EphemeralToken: 'ek_abc',
                ExpiresAt: '2026-01-01T00:00:00Z',
                SessionConfig: {},
            },
        });
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx());

        const prepArg = prepareClientSessionMock.mock.calls[0][0] as { PreferredModelID?: string };
        expect(prepArg.PreferredModelID).toBeUndefined();
        expect(result.ModelName).toBeUndefined();
        expect(result.NarrationInstructionsTemplate).toBeUndefined();
    });

    it('propagates the preferred-model failure (and closes the session) — no silent fallback', async () => {
        hasPermissionMock.mockResolvedValue(true);
        currentProvider = makeProvider(() => makeSessionEntity());
        createSessionMock.mockResolvedValue(makeSessionEntity({ ID: 'session-12' }));
        prepareClientSessionMock.mockResolvedValue({
            Success: false,
            ErrorMessage: "The requested model 'Old Realtime' is not active and cannot be used for a voice session.",
        });
        const resolver = makeResolver();

        await expect(
            resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, undefined, 'model-old'),
        ).rejects.toThrow(/not active/);

        expect(closeSessionMock).toHaveBeenCalledWith('session-12', USER, currentProvider, 'Error');
    });

    it('closes the session and throws when prepare fails (no half-open session)', async () => {
        hasPermissionMock.mockResolvedValue(true);
        currentProvider = makeProvider(() => makeSessionEntity());
        createSessionMock.mockResolvedValue(makeSessionEntity({ ID: 'session-bad' }));
        prepareClientSessionMock.mockResolvedValue({ Success: false, ErrorMessage: 'no model' });
        const resolver = makeResolver();

        await expect(
            resolver.StartRealtimeClientSession('target-1', makeCtx()),
        ).rejects.toThrow(/no model/);

        expect(closeSessionMock).toHaveBeenCalledWith('session-bad', USER, currentProvider, 'Error');
    });
});

describe('RealtimeClientSessionResolver — authentication gate', () => {
    /** Resolver whose GetUserFromPayload yields NO user (unauthenticated request). */
    function makeAnonymousResolver(): RealtimeClientSessionResolver {
        const resolver = new RealtimeClientSessionResolver();
        (resolver as unknown as { GetUserFromPayload: () => unknown }).GetUserFromPayload = () => undefined;
        return resolver;
    }

    it('StartRealtimeClientSession throws before touching authorization or session creation', async () => {
        currentProvider = makeProvider(() => makeSessionEntity());
        const resolver = makeAnonymousResolver();

        await expect(
            resolver.StartRealtimeClientSession('target-1', makeCtx()),
        ).rejects.toThrow(/not authenticated/i);

        expect(hasPermissionMock).not.toHaveBeenCalled();
        expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('ExecuteRealtimeSessionTool throws before any session load or tool execution', async () => {
        const provider = makeProvider(() => makeSessionEntity());
        currentProvider = provider;
        const resolver = makeAnonymousResolver();

        await expect(
            resolver.ExecuteRealtimeSessionTool('session-1', 'c1', 'x', '{}', makeCtx(), makePubSub()),
        ).rejects.toThrow(/not authenticated/i);

        expect((provider as { GetEntityObject: ReturnType<typeof vi.fn> }).GetEntityObject).not.toHaveBeenCalled();
        expect(executeRelayedToolMock).not.toHaveBeenCalled();
    });
});

describe('RealtimeClientSessionResolver.StartRealtimeClientSession — co-agent resolution chain', () => {
    const REALTIME_TYPE: FakeAgentType = { ID: 'type-realtime', Name: 'Realtime' };
    const LOOP_TYPE: FakeAgentType = { ID: 'type-loop', Name: 'Loop' };
    const GLOBAL_CO: FakeAgent = { ID: 'co-global', Name: 'Voice Co-Agent', Status: 'Active', TypeID: 'type-realtime' };
    /** A valid alternative co-agent (Active + Realtime-type) usable at any chain step. */
    const PERSONA_CO: FakeAgent = { ID: 'co-persona', Name: 'Sales Persona Voice', Status: 'Active', TypeID: 'type-realtime' };
    const TYPE_CO: FakeAgent = { ID: 'co-type-default', Name: 'Loop Default Voice', Status: 'Active', TypeID: 'type-realtime' };

    function setupHappyStart(): void {
        hasPermissionMock.mockResolvedValue(true);
        currentProvider = makeProvider(() => makeSessionEntity());
        createSessionMock.mockResolvedValue(makeSessionEntity({ ID: 'session-co' }));
        prepareClientSessionMock.mockResolvedValue({
            Success: true,
            ClientConfig: {
                Provider: 'openai',
                Model: 'gpt-realtime',
                EphemeralToken: 'ek_abc',
                ExpiresAt: '2026-01-01T00:00:00Z',
                SessionConfig: {},
            },
        });
    }

    /** Starts a session and returns the co-agent id the durable session was created under. */
    async function startAndGetCoAgentID(targetAgentId: string, coAgentId?: string): Promise<string> {
        const resolver = makeResolver();
        await resolver.StartRealtimeClientSession(targetAgentId, makeCtx(), undefined, undefined, undefined, undefined, coAgentId);
        const createArg = createSessionMock.mock.calls[0][0] as { agentID: string };
        return createArg.agentID;
    }

    it('runtime coAgentId wins over agent-level AND type-level defaults (step 1 beats 2/3/4)', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, { ...LOOP_TYPE, DefaultCoAgentID: 'co-type-default' }]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: 'co-persona' },
            PERSONA_CO, TYPE_CO, GLOBAL_CO,
            { ID: 'co-explicit', Name: 'Explicit Voice', Status: 'Active', TypeID: 'type-realtime' },
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1', 'co-explicit');
        expect(coAgentID).toBe('co-explicit');
    });

    it('fails LOUD (throws, no session) when the explicit coAgentId does not exist', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE]);
        agentsMock.mockReturnValue([GLOBAL_CO]);
        const resolver = makeResolver();

        await expect(
            resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, undefined, undefined, undefined, 'co-missing'),
        ).rejects.toThrow(/Invalid coAgentId 'co-missing'/);
        expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('fails LOUD when the explicit coAgentId is not Active', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE]);
        agentsMock.mockReturnValue([
            GLOBAL_CO,
            { ID: 'co-disabled', Name: 'Disabled Voice', Status: 'Disabled', TypeID: 'type-realtime' },
        ]);
        const resolver = makeResolver();

        await expect(
            resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, undefined, undefined, undefined, 'co-disabled'),
        ).rejects.toThrow(/not Active/);
        expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('fails LOUD when the explicit coAgentId is not of the Realtime agent type', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, LOOP_TYPE]);
        agentsMock.mockReturnValue([
            GLOBAL_CO,
            { ID: 'co-loop', Name: 'Loop Agent', Status: 'Active', TypeID: 'type-loop' },
        ]);
        const resolver = makeResolver();

        await expect(
            resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, undefined, undefined, undefined, 'co-loop'),
        ).rejects.toThrow(/not of the 'Realtime' agent type/);
        expect(createSessionMock).not.toHaveBeenCalled();
    });

    it("uses the target agent's DefaultCoAgentID (step 2 beats 3/4) when no runtime param is given", async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, { ...LOOP_TYPE, DefaultCoAgentID: 'co-type-default' }]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: 'co-persona' },
            PERSONA_CO, TYPE_CO, GLOBAL_CO,
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1');
        expect(coAgentID).toBe('co-persona');
    });

    it("uses the agent TYPE's DefaultCoAgentID (step 3 beats 4) when the agent has none", async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, { ...LOOP_TYPE, DefaultCoAgentID: 'co-type-default' }]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: null },
            TYPE_CO, GLOBAL_CO,
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1');
        expect(coAgentID).toBe('co-type-default');
    });

    it('falls through (warn, no throw) past an INVALID agent-level default to the type default', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, { ...LOOP_TYPE, DefaultCoAgentID: 'co-type-default' }]);
        agentsMock.mockReturnValue([
            // Agent-level default points at a Disabled co-agent — tolerated, falls through.
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: 'co-disabled' },
            { ID: 'co-disabled', Name: 'Disabled Voice', Status: 'Disabled', TypeID: 'type-realtime' },
            TYPE_CO, GLOBAL_CO,
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1');
        expect(coAgentID).toBe('co-type-default');
    });

    it('falls through past an INVALID type-level default (dangling reference) to the global Voice Co-Agent', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, { ...LOOP_TYPE, DefaultCoAgentID: 'co-deleted' }]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: null },
            GLOBAL_CO,
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1');
        expect(coAgentID).toBe('co-global');
    });

    it('falls through past a mis-typed (non-Realtime) agent-level default all the way to global', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, LOOP_TYPE]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: 'co-loop' },
            { ID: 'co-loop', Name: 'Loop Agent', Status: 'Active', TypeID: 'type-loop' },
            GLOBAL_CO,
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1');
        expect(coAgentID).toBe('co-global');
    });

    it('resolves the global Voice Co-Agent by name when no defaults are configured anywhere (step 4)', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, LOOP_TYPE]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: null },
            GLOBAL_CO,
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1');
        expect(coAgentID).toBe('co-global');
    });

    it('throws when the chain exhausts and the global Voice Co-Agent is missing entirely', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, LOOP_TYPE]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: null },
        ]);
        const resolver = makeResolver();

        await expect(
            resolver.StartRealtimeClientSession('target-1', makeCtx()),
        ).rejects.toThrow(/'Voice Co-Agent' agent is not configured/);
        expect(createSessionMock).not.toHaveBeenCalled();
    });
});

describe('RealtimeClientSessionResolver.ExecuteRealtimeSessionTool', () => {
    it('enforces ownership — rejects when the caller does not own the session', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ UserID: 'someone-else' }));
        const resolver = makeResolver();

        await expect(
            resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub()),
        ).rejects.toThrow(/do not own/i);

        expect(executeRelayedToolMock).not.toHaveBeenCalled();
    });

    it('reads the target + co-agent run id from the session config and returns ResultJson', async () => {
        currentProvider = makeProvider(() =>
            makeSessionEntity({
                Config_: JSON.stringify({ targetAgentID: 'target-from-session', coAgentRunID: 'co-run-77' }),
            }),
        );
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true });
        const resolver = makeResolver();

        const out = await resolver.ExecuteRealtimeSessionTool(
            'session-1',
            'call-1',
            'invoke-target-agent',
            '{"request":"do it"}',
            makeCtx(),
            makePubSub(),
        );

        expect(out).toBe('{"ok":true}');
        const relayArg = executeRelayedToolMock.mock.calls[0][0] as {
            TargetAgentID: string;
            ParentRunID?: string;
            Call: { CallID: string; ToolName: string; Arguments: string };
        };
        // Target comes from the session, NOT the client.
        expect(relayArg.TargetAgentID).toBe('target-from-session');
        // Delegated run nests under the co-agent observability run from the session config.
        expect(relayArg.ParentRunID).toBe('co-run-77');
        expect(relayArg.Call).toEqual({ CallID: 'call-1', ToolName: 'invoke-target-agent', Arguments: '{"request":"do it"}' });
        expect(heartbeatMock).toHaveBeenCalledWith('session-1', USER, currentProvider);
    });

    it('rejects a closed session', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ Status: 'Closed' }));
        const resolver = makeResolver();

        await expect(
            resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'x', '{}', makeCtx(), makePubSub()),
        ).rejects.toThrow(/closed/i);
    });

    it('publishes significant delegation progress (and drops noise) tagged for this voice session', async () => {
        currentProvider = makeProvider(() => makeSessionEntity());
        // Invoke the OnProgress callback the resolver builds, capturing what it publishes.
        executeRelayedToolMock.mockImplementation(async (input: { OnProgress: (p: unknown) => void }) => {
            input.OnProgress({ step: 'initialization', message: 'noise' }); // dropped
            input.OnProgress({ step: 'prompt_execution', message: 'thinking', percentage: 42 }); // published
            return { ResultJson: '{"ok":true}', Success: true };
        });
        const pubSub = makePubSub();
        const resolver = makeResolver();

        await resolver.ExecuteRealtimeSessionTool('session-1', 'call-7', 'invoke-target-agent', '{}', makeCtx(), pubSub);

        // Only the significant step published — exactly one publish.
        expect(pubSub.publish).toHaveBeenCalledTimes(1);
        const [topic, payload] = pubSub.publish.mock.calls[0] as [string, { message: string; sessionId: string }];
        expect(topic).toBe('PUSH_STATUS_UPDATES'); // PUSH_STATUS_UPDATES_TOPIC value
        expect(payload.sessionId).toBe('pubsub-session-1');
        expect(JSON.parse(payload.message)).toMatchObject({
            resolver: 'RealtimeClientSessionResolver',
            type: 'RealtimeDelegationProgress',
            agentSessionID: 'session-1',
            callID: 'call-7',
            step: 'prompt_execution',
            message: 'thinking',
            percentage: 42,
        });
    });

    it('persists pendingFeedbackRunID when a relayed call leaves a run paused', async () => {
        const session = makeSessionEntity({ Config_: JSON.stringify({ targetAgentID: 'target-1' }) });
        currentProvider = makeProvider(() => session);
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"q":1}', Success: true, PausedRunID: 'paused-1' });
        const resolver = makeResolver();

        await resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub());

        expect(JSON.parse(session.Config_ as string)).toMatchObject({
            targetAgentID: 'target-1',
            pendingFeedbackRunID: 'paused-1',
        });
        expect(session.Save).toHaveBeenCalled();
    });

    it('consumes pendingFeedbackRunID as ResumeRunID and clears it on the next call', async () => {
        const session = makeSessionEntity({
            Config_: JSON.stringify({ targetAgentID: 'target-1', pendingFeedbackRunID: 'paused-1' }),
        });
        currentProvider = makeProvider(() => session);
        // Resumed run completes (no new pause).
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"done":1}', Success: true });
        const resolver = makeResolver();

        await resolver.ExecuteRealtimeSessionTool('session-1', 'call-2', 'invoke-target-agent', '{"request":"yes"}', makeCtx(), makePubSub());

        // The paused id was passed in to resume the run...
        const relayArg = executeRelayedToolMock.mock.calls[0][0] as { ResumeRunID?: string };
        expect(relayArg.ResumeRunID).toBe('paused-1');
        // ...and cleared from the session config afterward.
        expect(JSON.parse(session.Config_ as string).pendingFeedbackRunID).toBeUndefined();
        expect(session.Save).toHaveBeenCalled();
    });

    it('re-stores a new pendingFeedbackRunID when a resumed run pauses again', async () => {
        const session = makeSessionEntity({
            Config_: JSON.stringify({ targetAgentID: 'target-1', pendingFeedbackRunID: 'paused-1' }),
        });
        currentProvider = makeProvider(() => session);
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"q":2}', Success: true, PausedRunID: 'paused-2' });
        const resolver = makeResolver();

        await resolver.ExecuteRealtimeSessionTool('session-1', 'call-3', 'invoke-target-agent', '{"request":"yes"}', makeCtx(), makePubSub());

        const relayArg = executeRelayedToolMock.mock.calls[0][0] as { ResumeRunID?: string };
        expect(relayArg.ResumeRunID).toBe('paused-1');
        expect(JSON.parse(session.Config_ as string).pendingFeedbackRunID).toBe('paused-2');
    });

    it('skips the session save entirely when there was no pending run and the call did not pause (no write storm)', async () => {
        const session = makeSessionEntity({ Config_: JSON.stringify({ targetAgentID: 'target-1' }) });
        currentProvider = makeProvider(() => session);
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true });
        const resolver = makeResolver();

        const out = await resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub());

        expect(out).toBe('{"ok":true}');
        expect(session.Save).not.toHaveBeenCalled(); // updatePendingFeedbackRunID no-op path
    });

    it('still returns the tool result when persisting the pendingFeedbackRunID fails (best-effort)', async () => {
        const session = makeSessionEntity({
            Config_: JSON.stringify({ targetAgentID: 'target-1' }),
            Save: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'db down' },
        });
        currentProvider = makeProvider(() => session);
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"q":1}', Success: true, PausedRunID: 'paused-1' });
        const resolver = makeResolver();

        const out = await resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub());

        expect(out).toBe('{"q":1}');
        expect(heartbeatMock).toHaveBeenCalled(); // the relay flow completed despite the failed save
    });

    it('rejects (no tool execution) when the session config is missing entirely', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ Config_: null }));
        const resolver = makeResolver();

        await expect(
            resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'x', '{}', makeCtx(), makePubSub()),
        ).rejects.toThrow(/no target agent configured/i);
        expect(executeRelayedToolMock).not.toHaveBeenCalled();
    });

    it('rejects when the session config is malformed JSON', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ Config_: '{not valid json' }));
        const resolver = makeResolver();

        await expect(
            resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'x', '{}', makeCtx(), makePubSub()),
        ).rejects.toThrow(/no target agent configured/i);
    });

    it('rejects when the session config parses but carries no targetAgentID', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ Config_: JSON.stringify({ coAgentRunID: 'co-1' }) }));
        const resolver = makeResolver();

        await expect(
            resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'x', '{}', makeCtx(), makePubSub()),
        ).rejects.toThrow(/no target agent configured/i);
    });
});

describe('RealtimeClientSessionResolver.RelayRealtimeTranscript', () => {
    it('persists a Conversation Detail stamped with the session conversation + role mapping', async () => {
        const detail = makeSessionEntity({ ID: 'detail-1' });
        const session = makeSessionEntity({ ConversationID: 'conv-7' });
        currentProvider = makeProvider((name) =>
            name === 'MJ: Conversation Details' ? detail : session,
        );
        const resolver = makeResolver();

        const ok = await resolver.RelayRealtimeTranscript('session-1', 'user', 'hello there', makeCtx());

        expect(ok).toBe(true);
        expect(detail.NewRecord).toHaveBeenCalled();
        expect(detail.ConversationID).toBe('conv-7');
        expect(detail.Role).toBe('User');
        expect(detail.Message).toBe('hello there');
        expect(detail.AgentSessionID).toBe('session-1');
        expect(detail.UserID).toBe('user-1');
        expect(detail.Save).toHaveBeenCalled();
        expect(heartbeatMock).toHaveBeenCalledWith('session-1', USER, currentProvider);
    });

    it("maps a non-user role to 'AI'", async () => {
        const detail = makeSessionEntity({ ID: 'detail-2' });
        const session = makeSessionEntity();
        currentProvider = makeProvider((name) =>
            name === 'MJ: Conversation Details' ? detail : session,
        );
        const resolver = makeResolver();

        await resolver.RelayRealtimeTranscript('session-1', 'assistant', 'response', makeCtx());
        expect(detail.Role).toBe('AI');
    });

    it("maps role case/whitespace-insensitively (' USER ' → 'User')", async () => {
        const detail = makeSessionEntity({ ID: 'detail-3' });
        const session = makeSessionEntity();
        currentProvider = makeProvider((name) =>
            name === 'MJ: Conversation Details' ? detail : session,
        );
        const resolver = makeResolver();

        await resolver.RelayRealtimeTranscript('session-1', ' USER ', 'hello', makeCtx());
        expect(detail.Role).toBe('User');
    });

    it('returns false WITHOUT heartbeating when the detail save fails', async () => {
        const detail = makeSessionEntity({
            ID: 'detail-fail',
            Save: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'constraint violation' },
        });
        const session = makeSessionEntity();
        currentProvider = makeProvider((name) =>
            name === 'MJ: Conversation Details' ? detail : session,
        );
        const resolver = makeResolver();

        const ok = await resolver.RelayRealtimeTranscript('session-1', 'user', 'hello', makeCtx());

        expect(ok).toBe(false);
        expect(heartbeatMock).not.toHaveBeenCalled();
    });

    it('rejects a closed session (transcript relay requires an open session)', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ Status: 'Closed' }));
        const resolver = makeResolver();

        await expect(
            resolver.RelayRealtimeTranscript('session-1', 'user', 'hello', makeCtx()),
        ).rejects.toThrow(/closed/i);
    });

    it('enforces ownership — rejects when the caller does not own the session', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ UserID: 'someone-else' }));
        const resolver = makeResolver();

        await expect(
            resolver.RelayRealtimeTranscript('session-1', 'user', 'hello', makeCtx()),
        ).rejects.toThrow(/do not own/i);
        expect(heartbeatMock).not.toHaveBeenCalled();
    });
});

describe('RealtimeClientSessionResolver.StartRealtimeClientSession — clientToolsJson validation', () => {
    const okPrep = {
        Success: true,
        ClientConfig: {
            Provider: 'openai',
            Model: 'gpt-realtime',
            EphemeralToken: 'ek_abc',
            ExpiresAt: '2026-01-01T00:00:00Z',
            SessionConfig: {},
        },
    };

    function setupHappyStart(): void {
        hasPermissionMock.mockResolvedValue(true);
        currentProvider = makeProvider(() => makeSessionEntity());
        createSessionMock.mockResolvedValue(makeSessionEntity({ ID: 'session-ct' }));
        prepareClientSessionMock.mockResolvedValue(okPrep);
    }

    /** Starts a session with `clientToolsJson` and returns the ExtraTools the prepare received. */
    async function startWithClientTools(clientToolsJson?: string): Promise<unknown> {
        const resolver = makeResolver();
        await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, undefined, undefined, clientToolsJson);
        const prepArg = prepareClientSessionMock.mock.calls[0][0] as { ExtraTools?: unknown };
        return prepArg.ExtraTools;
    }

    const validTool = { Name: 'Whiteboard.AddNote', Description: 'Add a sticky note', ParametersSchema: { type: 'object' } };

    it('threads a valid declaration array through as ExtraTools (client-executed UI tools)', async () => {
        setupHappyStart();
        const extraTools = await startWithClientTools(JSON.stringify([validTool]));
        expect(extraTools).toEqual([validTool]);
    });

    it('omits ExtraTools when no clientToolsJson is supplied', async () => {
        setupHappyStart();
        const extraTools = await startWithClientTools(undefined);
        expect(extraTools).toBeUndefined();
    });

    it('tolerantly rejects non-JSON payloads (mints without client tools, never throws)', async () => {
        setupHappyStart();
        const extraTools = await startWithClientTools('not json at all {{{');
        expect(extraTools).toBeUndefined();
    });

    it('rejects non-array JSON payloads', async () => {
        setupHappyStart();
        const extraTools = await startWithClientTools(JSON.stringify({ Name: 'x' }));
        expect(extraTools).toBeUndefined();
    });

    it('rejects a declaration flood beyond the 16-tool cap wholesale', async () => {
        setupHappyStart();
        const flood = Array.from({ length: 17 }, (_, i) => ({ ...validTool, Name: `Tool.${i}` }));
        const extraTools = await startWithClientTools(JSON.stringify(flood));
        expect(extraTools).toBeUndefined();
    });

    it('skips malformed entries (bad Name / Description / ParametersSchema) but keeps valid ones', async () => {
        setupHappyStart();
        const extraTools = await startWithClientTools(JSON.stringify([
            validTool,
            { Name: '', Description: 'no name', ParametersSchema: {} },
            { Name: 'NoDescription', ParametersSchema: {} },
            { Name: 'BadSchema', Description: 'schema is an array', ParametersSchema: [] },
            'not-an-object',
        ]));
        expect(extraTools).toEqual([validTool]);
    });

    it('rejects an oversized declarations payload wholesale', async () => {
        setupHappyStart();
        const huge = JSON.stringify([{ ...validTool, Description: 'x'.repeat(70_000) }]);
        const extraTools = await startWithClientTools(huge);
        expect(extraTools).toBeUndefined();
    });
});

describe('RealtimeClientSessionResolver.SaveSessionChannelState', () => {
    const CHANNEL_ROW = { ID: 'channel-wb', IsActive: true };

    /**
     * Provider with both GetEntityObject (session load + new session-channel rows) and RunView
     * (channel definition + session-channel lookup) under test control.
     */
    function makeChannelProvider(opts: {
        session?: FakeSession;
        channelRows?: Array<{ ID: string; IsActive: boolean }>;
        sessionChannelRows?: FakeSession[];
        newSessionChannel?: FakeSession;
    }): { provider: unknown; runView: ReturnType<typeof vi.fn>; newRow: FakeSession } {
        const newRow = opts.newSessionChannel ?? makeSessionEntity({ ID: 'sc-new' });
        const runView = vi.fn(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: AI Agent Channels') {
                return { Success: true, Results: opts.channelRows ?? [] };
            }
            return { Success: true, Results: opts.sessionChannelRows ?? [] };
        });
        const provider = {
            GetEntityObject: vi.fn(async (name: string) =>
                name === 'MJ: AI Agent Session Channels' ? newRow : (opts.session ?? makeSessionEntity()),
            ),
            RunView: runView,
        };
        return { provider, runView, newRow };
    }

    it('enforces ownership — rejects when the caller does not own the session', async () => {
        const { provider } = makeChannelProvider({ session: makeSessionEntity({ UserID: 'someone-else' }) });
        currentProvider = provider;
        const resolver = makeResolver();

        await expect(
            resolver.SaveSessionChannelState('session-1', 'Whiteboard', '{}', makeCtx()),
        ).rejects.toThrow(/do not own/i);
    });

    it('accepts a CLOSED session (the final on-end flush lands after close)', async () => {
        const { provider, newRow } = makeChannelProvider({
            session: makeSessionEntity({ Status: 'Closed' }),
            channelRows: [CHANNEL_ROW],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.SaveSessionChannelState('session-1', 'Whiteboard', '{"v":1}', makeCtx());
        expect(ok).toBe(true);
        expect(newRow.Save).toHaveBeenCalled();
    });

    it('returns false gracefully (no throw) when no channel definition row exists', async () => {
        const { provider, newRow } = makeChannelProvider({ channelRows: [] });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.SaveSessionChannelState('session-1', 'Whiteboard', '{}', makeCtx());
        expect(ok).toBe(false);
        expect(newRow.Save).not.toHaveBeenCalled();
    });

    it('returns false when the channel definition is inactive', async () => {
        const { provider } = makeChannelProvider({ channelRows: [{ ID: 'channel-wb', IsActive: false }] });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.SaveSessionChannelState('session-1', 'Whiteboard', '{}', makeCtx());
        expect(ok).toBe(false);
    });

    it('creates the session-channel row (Status Connected) and stores the state on first save', async () => {
        const { provider, newRow } = makeChannelProvider({ channelRows: [CHANNEL_ROW] });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.SaveSessionChannelState('session-1', 'Whiteboard', '{"items":[]}', makeCtx());

        expect(ok).toBe(true);
        expect(newRow.NewRecord).toHaveBeenCalled();
        expect(newRow.AgentSessionID).toBe('session-1');
        expect(newRow.ChannelID).toBe('channel-wb');
        expect(newRow.Status).toBe('Connected');
        expect(newRow.Config_).toBe('{"items":[]}');
        expect(newRow.LastActiveAt).toBeInstanceOf(Date);
        expect(newRow.Save).toHaveBeenCalled();
    });

    it('updates the EXISTING session-channel row on later saves (no duplicate row)', async () => {
        const existing = makeSessionEntity({ ID: 'sc-existing', Status: 'Connected' });
        const { provider, newRow } = makeChannelProvider({
            channelRows: [CHANNEL_ROW],
            sessionChannelRows: [existing],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.SaveSessionChannelState('session-1', 'Whiteboard', '{"items":[1]}', makeCtx());

        expect(ok).toBe(true);
        expect(existing.Config_).toBe('{"items":[1]}');
        expect(existing.Save).toHaveBeenCalled();
        // The fresh-row path was never taken.
        expect(newRow.NewRecord).not.toHaveBeenCalled();
        expect(newRow.Save).not.toHaveBeenCalled();
    });

    it('rejects an oversized state blob (false, nothing queried/saved)', async () => {
        const { provider, runView, newRow } = makeChannelProvider({ channelRows: [CHANNEL_ROW] });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.SaveSessionChannelState('session-1', 'Whiteboard', 'x'.repeat(2_000_001), makeCtx());
        expect(ok).toBe(false);
        expect(runView).not.toHaveBeenCalled();
        expect(newRow.Save).not.toHaveBeenCalled();
    });

    it('returns false (logged, not thrown) when the row save fails', async () => {
        const failingRow = makeSessionEntity({
            ID: 'sc-fail',
            Save: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'boom' },
        });
        const { provider } = makeChannelProvider({ channelRows: [CHANNEL_ROW], newSessionChannel: failingRow });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.SaveSessionChannelState('session-1', 'Whiteboard', '{}', makeCtx());
        expect(ok).toBe(false);
    });
});

describe('RealtimeClientSessionResolver.StartRealtimeClientSession — prior channel-state restore', () => {
    const okPrep = {
        Success: true,
        ClientConfig: {
            Provider: 'openai',
            Model: 'gpt-realtime',
            EphemeralToken: 'ek_abc',
            ExpiresAt: '2026-01-01T00:00:00Z',
            SessionConfig: {},
        },
    };

    /**
     * Provider for the restore path: GetEntityObject serves the PRIOR session (the only entity
     * the start flow loads directly), RunView serves the prior session-channel rows.
     */
    function makeRestoreProvider(opts: {
        prior?: FakeSession;
        rows?: Array<{ Channel: string; Config: string | null }>;
        runViewResult?: { Success: boolean; ErrorMessage?: string; Results?: unknown[] };
    }): { provider: unknown; runView: ReturnType<typeof vi.fn>; prior: FakeSession } {
        const prior = opts.prior ?? makeSessionEntity({ ID: 'prior-1', UserID: 'user-1' });
        const runView = vi.fn(async () => opts.runViewResult ?? { Success: true, Results: opts.rows ?? [] });
        return { provider: { GetEntityObject: vi.fn(async () => prior), RunView: runView }, runView, prior };
    }

    function setupHappyStart(): void {
        hasPermissionMock.mockResolvedValue(true);
        createSessionMock.mockResolvedValue(makeSessionEntity({ ID: 'session-restore' }));
        prepareClientSessionMock.mockResolvedValue(okPrep);
    }

    it('returns the prior session channel states keyed by channel NAME (empty configs skipped)', async () => {
        setupHappyStart();
        const { provider } = makeRestoreProvider({
            rows: [
                { Channel: 'Whiteboard', Config: '{"items":[1,2]}' },
                { Channel: 'EmptyChannel', Config: null },
                { Channel: 'Notes', Config: '{"text":"hi"}' },
            ],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(result.PriorChannelStatesJson).toBeDefined();
        expect(JSON.parse(result.PriorChannelStatesJson as string)).toEqual({
            Whiteboard: '{"items":[1,2]}',
            Notes: '{"text":"hi"}',
        });
        // lastSessionId still flows into the new durable session record.
        const createArg = createSessionMock.mock.calls[0][0] as { lastSessionID?: string };
        expect(createArg.lastSessionID).toBe('prior-1');
    });

    it('omits the field when no lastSessionId is supplied (no restore query at all)', async () => {
        setupHappyStart();
        const { provider, runView } = makeRestoreProvider({ rows: [{ Channel: 'Whiteboard', Config: '{}' }] });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx());

        expect(result.PriorChannelStatesJson).toBeUndefined();
        expect(runView).not.toHaveBeenCalled();
    });

    it('omits the field (no state leak, no query) when the prior session belongs to ANOTHER user', async () => {
        setupHappyStart();
        const { provider, runView } = makeRestoreProvider({
            prior: makeSessionEntity({ ID: 'prior-1', UserID: 'someone-else' }),
            rows: [{ Channel: 'Whiteboard', Config: '{"secret":true}' }],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(result.PriorChannelStatesJson).toBeUndefined();
        expect(runView).not.toHaveBeenCalled();
    });

    it('omits the field when the prior session does not exist', async () => {
        setupHappyStart();
        const { provider, runView } = makeRestoreProvider({
            prior: makeSessionEntity({ Load: vi.fn(async () => false) }),
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-gone');

        expect(result.PriorChannelStatesJson).toBeUndefined();
        expect(runView).not.toHaveBeenCalled();
    });

    it('omits the field when the prior session has no channel rows / no non-empty configs', async () => {
        setupHappyStart();
        const { provider } = makeRestoreProvider({ rows: [{ Channel: 'Whiteboard', Config: null }] });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');
        expect(result.PriorChannelStatesJson).toBeUndefined();
    });

    it('drops an oversized individual state (beyond the 2MB cap) but restores the rest', async () => {
        setupHappyStart();
        const { provider } = makeRestoreProvider({
            rows: [
                { Channel: 'Huge', Config: 'x'.repeat(2_000_001) },
                { Channel: 'Whiteboard', Config: '{"items":[]}' },
            ],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(JSON.parse(result.PriorChannelStatesJson as string)).toEqual({ Whiteboard: '{"items":[]}' });
    });

    it('drops states that would push the ACCUMULATED restore payload past the 2MB cap', async () => {
        setupHappyStart();
        const { provider } = makeRestoreProvider({
            rows: [
                { Channel: 'First', Config: 'a'.repeat(1_500_000) },
                { Channel: 'Second', Config: 'b'.repeat(1_500_000) }, // would exceed the total cap
            ],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        const states = JSON.parse(result.PriorChannelStatesJson as string) as Record<string, string>;
        expect(Object.keys(states)).toEqual(['First']);
    });

    it('tolerates a failed restore query (start succeeds, field omitted)', async () => {
        setupHappyStart();
        const { provider } = makeRestoreProvider({ runViewResult: { Success: false, ErrorMessage: 'db down' } });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(result.AgentSessionId).toBe('session-restore');
        expect(result.PriorChannelStatesJson).toBeUndefined();
    });

    it('tolerates a thrown restore failure (start succeeds, field omitted)', async () => {
        setupHappyStart();
        currentProvider = {
            GetEntityObject: vi.fn(async () => {
                throw new Error('provider exploded');
            }),
            RunView: vi.fn(),
        };
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(result.AgentSessionId).toBe('session-restore');
        expect(result.PriorChannelStatesJson).toBeUndefined();
    });
});

describe('RealtimeClientSessionResolver.SaveSessionChannelArtifact', () => {
    const WHITEBOARD_TYPE_ROW = { ID: 'type-wb', IsEnabled: true };
    const CHANNEL_ROW = { ID: 'channel-wb', IsActive: true };

    /**
     * Provider for the artifact path: GetEntityObject routes by entity name (session / artifact /
     * version / junction), RunView routes by EntityName (artifact types / conversation details /
     * channel definitions / session-channel rows).
     */
    function makeArtifactProvider(opts: {
        session?: FakeSession;
        typeRows?: Array<{ ID: string; IsEnabled: boolean }>;
        detailRows?: Array<{ ID: string }>;
        channelRows?: Array<{ ID: string; IsActive: boolean }>;
        sessionChannelRows?: FakeSession[];
        artifact?: FakeSession;
        version?: FakeSession;
        junction?: FakeSession;
    }): {
        provider: unknown;
        runView: ReturnType<typeof vi.fn>;
        artifact: FakeSession;
        version: FakeSession;
        junction: FakeSession;
    } {
        const artifact = opts.artifact ?? makeSessionEntity({ ID: 'artifact-1' });
        const version = opts.version ?? makeSessionEntity({ ID: 'version-1' });
        const junction = opts.junction ?? makeSessionEntity({ ID: 'junction-1' });
        const session = opts.session ?? makeSessionEntity();
        const runView = vi.fn(async (params: { EntityName: string }) => {
            switch (params.EntityName) {
                case 'MJ: Artifact Types':
                    return { Success: true, Results: opts.typeRows ?? [] };
                case 'MJ: Conversation Details':
                    return { Success: true, Results: opts.detailRows ?? [] };
                case 'MJ: AI Agent Channels':
                    return { Success: true, Results: opts.channelRows ?? [] };
                default: // MJ: AI Agent Session Channels
                    return { Success: true, Results: opts.sessionChannelRows ?? [] };
            }
        });
        const provider = {
            GetEntityObject: vi.fn(async (name: string) => {
                switch (name) {
                    case 'MJ: Artifacts':
                        return artifact;
                    case 'MJ: Artifact Versions':
                        return version;
                    case 'MJ: Conversation Detail Artifacts':
                        return junction;
                    default:
                        return session;
                }
            }),
            RunView: runView,
        };
        return { provider, runView, artifact, version, junction };
    }

    it('enforces ownership — rejects when the caller does not own the session', async () => {
        const { provider, artifact } = makeArtifactProvider({ session: makeSessionEntity({ UserID: 'someone-else' }) });
        currentProvider = provider;
        const resolver = makeResolver();

        await expect(
            resolver.SaveSessionChannelArtifact('session-1', 'Whiteboard', 'My Board', '{}', makeCtx()),
        ).rejects.toThrow(/do not own/i);
        expect(artifact.Save).not.toHaveBeenCalled();
    });

    it('fails gracefully (structured, no throw) when the Whiteboard artifact type is unseeded', async () => {
        const { provider, artifact } = makeArtifactProvider({ typeRows: [] });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact('session-1', 'Whiteboard', 'My Board', '{}', makeCtx());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/Whiteboard.*artifact type/i);
        expect(result.ArtifactID).toBeUndefined();
        expect(artifact.Save).not.toHaveBeenCalled();
    });

    it('fails gracefully when the Whiteboard artifact type exists but is disabled', async () => {
        const { provider } = makeArtifactProvider({ typeRows: [{ ID: 'type-wb', IsEnabled: false }] });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact('session-1', 'Whiteboard', 'My Board', '{}', makeCtx());
        expect(result.Success).toBe(false);
    });

    it('creates the artifact + v1 version with the right fields and links it into conversation history', async () => {
        const sessionChannelRow = makeSessionEntity({ ID: 'sc-1' });
        const { provider, artifact, version, junction } = makeArtifactProvider({
            session: makeSessionEntity({ ID: 'session-1', ConversationID: 'conv-1' }),
            typeRows: [WHITEBOARD_TYPE_ROW],
            detailRows: [{ ID: 'detail-9' }],
            channelRows: [CHANNEL_ROW],
            sessionChannelRows: [sessionChannelRow],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact(
            'session-1', 'Whiteboard', 'Q3 Planning Board', '{"shapes":[]}', makeCtx(),
        );

        // Structured success with both ids.
        expect(result).toEqual({
            Success: true,
            ArtifactID: 'artifact-1',
            ArtifactVersionID: 'version-1',
            ConversationDetailLinked: true,
        });
        // Artifact header — user-owned, typed, visible, described with session + channel.
        expect(artifact.NewRecord).toHaveBeenCalled();
        expect(artifact.Name).toBe('Q3 Planning Board');
        expect(artifact.TypeID).toBe('type-wb');
        expect(artifact.UserID).toBe('user-1');
        expect(artifact.Visibility).toBe('Always');
        expect(artifact.Description).toContain('session-1');
        expect(artifact.Description).toContain('Whiteboard');
        expect(artifact.Save).toHaveBeenCalled();
        // Version 1 carries the content.
        expect(version.ArtifactID).toBe('artifact-1');
        expect(version.VersionNumber).toBe(1);
        expect(version.Content).toBe('{"shapes":[]}');
        expect(version.UserID).toBe('user-1');
        expect(version.Save).toHaveBeenCalled();
        // Junction against the LATEST session-stamped conversation detail, the way chat links.
        expect(junction.ConversationDetailID).toBe('detail-9');
        expect(junction.ArtifactVersionID).toBe('version-1');
        expect(junction.Direction).toBe('Output');
        expect(junction.Save).toHaveBeenCalled();
        // The session-channel row got its LastActiveAt stamped (saving IS channel activity).
        expect(sessionChannelRow.LastActiveAt).toBeInstanceOf(Date);
        expect(sessionChannelRow.Save).toHaveBeenCalled();
    });

    it('skips the junction silently (still Success) when no conversation detail is stamped with the session', async () => {
        const { provider, junction } = makeArtifactProvider({
            session: makeSessionEntity({ ConversationID: 'conv-1' }),
            typeRows: [WHITEBOARD_TYPE_ROW],
            detailRows: [],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact('session-1', 'Whiteboard', 'Board', '{}', makeCtx());

        expect(result.Success).toBe(true);
        expect(result.ConversationDetailLinked).toBe(false);
        expect(junction.Save).not.toHaveBeenCalled();
    });

    it('skips the junction (no detail query) when the session has no conversation at all', async () => {
        const { provider, runView, junction } = makeArtifactProvider({
            session: makeSessionEntity({ ConversationID: null }),
            typeRows: [WHITEBOARD_TYPE_ROW],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact('session-1', 'Whiteboard', 'Board', '{}', makeCtx());

        expect(result.Success).toBe(true);
        expect(result.ConversationDetailLinked).toBe(false);
        expect(junction.Save).not.toHaveBeenCalled();
        const queriedEntities = runView.mock.calls.map((c) => (c[0] as { EntityName: string }).EntityName);
        expect(queriedEntities).not.toContain('MJ: Conversation Details');
    });

    it('still succeeds (linked=false, logged) when the junction save fails — link is best-effort', async () => {
        const failingJunction = makeSessionEntity({
            ID: 'junction-fail',
            Save: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'fk violation' },
        });
        const { provider } = makeArtifactProvider({
            session: makeSessionEntity({ ConversationID: 'conv-1' }),
            typeRows: [WHITEBOARD_TYPE_ROW],
            detailRows: [{ ID: 'detail-9' }],
            junction: failingJunction,
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact('session-1', 'Whiteboard', 'Board', '{}', makeCtx());

        expect(result.Success).toBe(true);
        expect(result.ConversationDetailLinked).toBe(false);
    });

    it('rejects oversized content (structured failure, nothing queried or saved)', async () => {
        const { provider, runView, artifact } = makeArtifactProvider({ typeRows: [WHITEBOARD_TYPE_ROW] });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact(
            'session-1', 'Whiteboard', 'Board', 'x'.repeat(2_000_001), makeCtx(),
        );

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/oversized/i);
        expect(runView).not.toHaveBeenCalled();
        expect(artifact.Save).not.toHaveBeenCalled();
    });

    it('returns a structured failure when the artifact header save fails (no version attempted)', async () => {
        const failingArtifact = makeSessionEntity({
            ID: 'artifact-fail',
            Save: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'db down' },
        });
        const { provider, version } = makeArtifactProvider({
            typeRows: [WHITEBOARD_TYPE_ROW],
            artifact: failingArtifact,
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact('session-1', 'Whiteboard', 'Board', '{}', makeCtx());

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/artifact save failed/i);
        expect(version.Save).not.toHaveBeenCalled();
    });

    it('returns a structured failure (carrying the orphaned ArtifactID) when the version save fails', async () => {
        const failingVersion = makeSessionEntity({
            ID: 'version-fail',
            Save: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'too big' },
        });
        const { provider, junction } = makeArtifactProvider({
            typeRows: [WHITEBOARD_TYPE_ROW],
            detailRows: [{ ID: 'detail-9' }],
            version: failingVersion,
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact('session-1', 'Whiteboard', 'Board', '{}', makeCtx());

        expect(result.Success).toBe(false);
        expect(result.ArtifactID).toBe('artifact-1');
        expect(result.ArtifactVersionID).toBeUndefined();
        expect(junction.Save).not.toHaveBeenCalled();
    });

    it('accepts a CLOSED session ("save my board" legitimately lands after the call ends)', async () => {
        const { provider } = makeArtifactProvider({
            session: makeSessionEntity({ Status: 'Closed', ConversationID: null }),
            typeRows: [WHITEBOARD_TYPE_ROW],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.SaveSessionChannelArtifact('session-1', 'Whiteboard', 'Board', '{}', makeCtx());
        expect(result.Success).toBe(true);
    });
});
