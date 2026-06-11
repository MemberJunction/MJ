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

// --- Mock AIEngine so the Realtime Co-Agent resolves without DB-backed config ---
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
const agentsMock = vi.fn((): FakeAgent[] => [{ ID: 'co-agent-1', Name: 'Realtime Co-Agent' }]);
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

// --- Mock the client-direct service (prepare + relayed-tool execution + cancel registry) ---
const prepareClientSessionMock = vi.fn();
const executeRelayedToolMock = vi.fn();
const cancelInFlightMock = vi.fn((_agentSessionID: string, _callID?: string): number => 0);
vi.mock('@memberjunction/ai-agents', () => ({
    RealtimeClientSessionService: class {
        PrepareClientSession = prepareClientSessionMock;
        ExecuteRelayedTool = executeRelayedToolMock;
        CancelInFlightDelegations = cancelInFlightMock;
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
    cancelInFlightMock.mockReset();
    cancelInFlightMock.mockReturnValue(0);
    createSessionMock.mockReset();
    closeSessionMock.mockClear();
    heartbeatMock.mockClear();
    agentsMock.mockReturnValue([{ ID: 'co-agent-1', Name: 'Realtime Co-Agent' }]);
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
            CoAgentRunStepID: 'run-step-9',
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
        // After prepare, the observability run + run-step ids are written back into the session config + saved.
        expect(JSON.parse(createdSession.Config_ as string)).toEqual({
            targetAgentID: 'target-1', coAgentRunID: 'co-run-9', promptRunID: 'prompt-run-9', coAgentRunStepID: 'run-step-9',
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
    const GLOBAL_CO: FakeAgent = { ID: 'co-global', Name: 'Realtime Co-Agent', Status: 'Active', TypeID: 'type-realtime' };
    /** The pre-rename legacy seed name — still resolvable as a deprecated fallback. */
    const LEGACY_GLOBAL_CO: FakeAgent = { ID: 'co-global-legacy', Name: 'Voice Co-Agent', Status: 'Active', TypeID: 'type-realtime' };
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

    it('falls through past an INVALID type-level default (dangling reference) to the global Realtime Co-Agent', async () => {
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

    it('resolves the global Realtime Co-Agent by name when no defaults are configured anywhere (step 4)', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, LOOP_TYPE]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: null },
            GLOBAL_CO,
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1');
        expect(coAgentID).toBe('co-global');
    });

    it('falls back to the DEPRECATED legacy seed name when no Realtime Co-Agent exists (un-resynced deployment)', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, LOOP_TYPE]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: null },
            LEGACY_GLOBAL_CO,
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1');
        expect(coAgentID).toBe('co-global-legacy');
    });

    it('prefers the current Realtime Co-Agent name over the legacy name when BOTH exist', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, LOOP_TYPE]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: null },
            LEGACY_GLOBAL_CO,
            GLOBAL_CO,
        ]);

        const coAgentID = await startAndGetCoAgentID('target-1');
        expect(coAgentID).toBe('co-global');
    });

    it('throws (naming the CURRENT seed name) when the chain exhausts and neither global co-agent name exists', async () => {
        setupHappyStart();
        agentTypesMock.mockReturnValue([REALTIME_TYPE, LOOP_TYPE]);
        agentsMock.mockReturnValue([
            { ID: 'target-1', Name: 'Target', Status: 'Active', TypeID: 'type-loop', DefaultCoAgentID: null },
        ]);
        const resolver = makeResolver();

        await expect(
            resolver.StartRealtimeClientSession('target-1', makeCtx()),
        ).rejects.toThrow(/'Realtime Co-Agent' agent is not configured/);
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

    it('persists pendingFeedbackRunID when a relayed call leaves a run paused (preserving the run/step ids)', async () => {
        const session = makeSessionEntity({
            Config_: JSON.stringify({ targetAgentID: 'target-1', coAgentRunID: 'co-run-1', coAgentRunStepID: 'run-step-1' }),
        });
        currentProvider = makeProvider(() => session);
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"q":1}', Success: true, PausedRunID: 'paused-1' });
        const resolver = makeResolver();

        await resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub());

        expect(JSON.parse(session.Config_ as string)).toMatchObject({
            targetAgentID: 'target-1',
            coAgentRunID: 'co-run-1',
            coAgentRunStepID: 'run-step-1',
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

describe('RealtimeClientSessionResolver.ExecuteRealtimeSessionTool — delegated-artifact history linking', () => {
    /**
     * Provider for the junction-linking path: GetEntityObject routes by entity name (session load /
     * junction rows / the hidden anchor detail), RunView serves the latest session-stamped detail
     * lookup. Collects every created junction + anchor entity for assertion.
     */
    function makeLinkProvider(opts: {
        session?: FakeSession;
        detailRows?: Array<{ ID: string }>;
        detailQueryFails?: boolean;
    }): {
        provider: unknown;
        session: FakeSession;
        junctions: FakeSession[];
        anchors: FakeSession[];
        runView: ReturnType<typeof vi.fn>;
    } {
        const session = opts.session ?? makeSessionEntity();
        const junctions: FakeSession[] = [];
        const anchors: FakeSession[] = [];
        const runView = vi.fn(async () =>
            opts.detailQueryFails
                ? { Success: false, ErrorMessage: 'db down', Results: [] }
                : { Success: true, Results: opts.detailRows ?? [] },
        );
        const provider = {
            GetEntityObject: vi.fn(async (name: string) => {
                if (name === 'MJ: AI Agent Sessions') {
                    return session;
                }
                if (name === 'MJ: Conversation Detail Artifacts') {
                    const junction = makeSessionEntity({ ID: `junction-${junctions.length + 1}` });
                    junctions.push(junction);
                    return junction;
                }
                if (name === 'MJ: Conversation Details') {
                    const anchor = makeSessionEntity({ ID: 'anchor-detail-1' });
                    anchors.push(anchor);
                    return anchor;
                }
                return makeSessionEntity();
            }),
            RunView: runView,
        };
        return { provider, session, junctions, anchors, runView };
    }

    const ARTIFACTS = [
        { ArtifactID: 'a-1', ArtifactVersionID: 'av-1', Name: 'Report' },
        { ArtifactID: 'a-2', ArtifactVersionID: 'av-2', Name: 'Chart' },
    ];

    it('junction-links every delegated artifact version to the LATEST session-stamped detail', async () => {
        const { provider, junctions } = makeLinkProvider({ detailRows: [{ ID: 'detail-latest' }] });
        currentProvider = provider;
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true, Artifacts: ARTIFACTS });
        const resolver = makeResolver();

        const out = await resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub());

        expect(out).toBe('{"ok":true}');
        expect(junctions).toHaveLength(2);
        expect(junctions[0].ConversationDetailID).toBe('detail-latest');
        expect(junctions[0].ArtifactVersionID).toBe('av-1');
        expect(junctions[0].Direction).toBe('Output');
        expect(junctions[0].Save).toHaveBeenCalled();
        expect(junctions[1].ConversationDetailID).toBe('detail-latest');
        expect(junctions[1].ArtifactVersionID).toBe('av-2');
        // The relay still heartbeats afterward.
        expect(heartbeatMock).toHaveBeenCalledWith('session-1', USER, currentProvider);
    });

    it('creates a HIDDEN anchor detail (Role AI, HiddenToUser, session-stamped) when no transcript turn exists yet', async () => {
        const { provider, junctions, anchors } = makeLinkProvider({ detailRows: [] });
        currentProvider = provider;
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true, Artifacts: [ARTIFACTS[0]] });
        const resolver = makeResolver();

        await resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub());

        expect(anchors).toHaveLength(1);
        const anchor = anchors[0];
        expect(anchor.Role).toBe('AI');
        expect(anchor.HiddenToUser).toBe(true);
        expect(anchor.ConversationID).toBe('conv-1');
        expect(anchor.AgentSessionID).toBe('session-1');
        expect(anchor.UserID).toBe('user-1');
        expect(anchor.Save).toHaveBeenCalled();
        // The junction anchors to the freshly created hidden detail.
        expect(junctions).toHaveLength(1);
        expect(junctions[0].ConversationDetailID).toBe('anchor-detail-1');
        expect(junctions[0].ArtifactVersionID).toBe('av-1');
    });

    it('skips linking entirely (no detail query, no junction) when the session has no conversation', async () => {
        const { provider, junctions, runView } = makeLinkProvider({
            session: makeSessionEntity({ ConversationID: null }),
        });
        currentProvider = provider;
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true, Artifacts: ARTIFACTS });
        const resolver = makeResolver();

        const out = await resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub());

        expect(out).toBe('{"ok":true}');
        expect(runView).not.toHaveBeenCalled();
        expect(junctions).toHaveLength(0);
    });

    it('skips linking (no detail query) when the relayed result carries no artifacts', async () => {
        const { provider, junctions, runView } = makeLinkProvider({ detailRows: [{ ID: 'detail-1' }] });
        currentProvider = provider;
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true });
        const resolver = makeResolver();

        await resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub());

        expect(runView).not.toHaveBeenCalled();
        expect(junctions).toHaveLength(0);
    });

    it('tolerates a failed anchor lookup / junction save — the relayed result still returns', async () => {
        const { provider } = makeLinkProvider({ detailQueryFails: true });
        currentProvider = provider;
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true, Artifacts: ARTIFACTS });
        const resolver = makeResolver();

        const out = await resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub());

        expect(out).toBe('{"ok":true}');
        expect(heartbeatMock).toHaveBeenCalled();
    });

    it('still enforces ownership before any linking happens', async () => {
        const { provider, junctions } = makeLinkProvider({
            session: makeSessionEntity({ UserID: 'someone-else' }),
            detailRows: [{ ID: 'detail-1' }],
        });
        currentProvider = provider;
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true, Artifacts: ARTIFACTS });
        const resolver = makeResolver();

        await expect(
            resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx(), makePubSub()),
        ).rejects.toThrow(/do not own/i);
        expect(junctions).toHaveLength(0);
    });
});

describe('RealtimeClientSessionResolver.StartRealtimeClientSession — prior-transcript hydration', () => {
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

    interface ChainRow {
        UserID: string;
        LastSessionID?: string | null;
    }

    interface DetailQueryRow {
        ID: string;
        Role: string;
        Message: string | null;
        HiddenToUser: boolean;
    }

    /**
     * Provider for the hydration path: GetEntityObject serves prior-session loads from a chain
     * MAP (Load(id) hydrates the entity from the map, false when absent), RunView routes by
     * EntityName — transcript details vs. channel-state rows.
     */
    function makeHydrationProvider(opts: {
        chain: Record<string, ChainRow>;
        detailRows?: DetailQueryRow[];
        detailQueryFails?: boolean;
    }): { provider: unknown; runView: ReturnType<typeof vi.fn> } {
        const runView = vi.fn(async (params: { EntityName: string }) => {
            if (params.EntityName === 'MJ: Conversation Details') {
                return opts.detailQueryFails
                    ? { Success: false, ErrorMessage: 'db down', Results: [] }
                    : { Success: true, Results: opts.detailRows ?? [] };
            }
            return { Success: true, Results: [] }; // session-channel restore — none
        });
        const provider = {
            GetEntityObject: vi.fn(async () => {
                const entity = makeSessionEntity();
                entity.Load = vi.fn(async (id: string) => {
                    const row = opts.chain[id];
                    if (!row) {
                        return false;
                    }
                    entity.ID = id;
                    entity.UserID = row.UserID;
                    entity.LastSessionID = row.LastSessionID ?? null;
                    return true;
                });
                return entity;
            }),
            RunView: runView,
        };
        return { provider, runView };
    }

    function setupHappyStart(): void {
        hasPermissionMock.mockResolvedValue(true);
        createSessionMock.mockResolvedValue(makeSessionEntity({ ID: 'session-new' }));
        prepareClientSessionMock.mockResolvedValue(okPrep);
    }

    function prepTranscriptArg(): string | undefined {
        return (prepareClientSessionMock.mock.calls[0][0] as { PriorTranscript?: string }).PriorTranscript;
    }

    function turn(role: 'User' | 'AI', message: string, id = 'd-1'): DetailQueryRow {
        return { ID: id, Role: role, Message: message, HiddenToUser: false };
    }

    it('threads the prior leg\'s role-tagged transcript into PrepareClientSession.PriorTranscript', async () => {
        setupHappyStart();
        const { provider } = makeHydrationProvider({
            chain: { 'prior-1': { UserID: 'user-1' } },
            detailRows: [turn('User', 'hello there'), turn('AI', 'hi! how can I help?')],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(prepTranscriptArg()).toBe('User: hello there\nAssistant: hi! how can I help?');
    });

    it('walks the prior chain through LastSessionID and queries ALL legs\' details at once', async () => {
        setupHappyStart();
        const { provider, runView } = makeHydrationProvider({
            chain: {
                'prior-2': { UserID: 'user-1', LastSessionID: 'prior-1' },
                'prior-1': { UserID: 'user-1' },
            },
            detailRows: [turn('User', 'first leg'), turn('AI', 'second leg')],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-2');

        const detailCall = runView.mock.calls.find(
            (c) => (c[0] as { EntityName: string }).EntityName === 'MJ: Conversation Details',
        );
        expect(detailCall).toBeDefined();
        const filter = (detailCall![0] as { ExtraFilter: string }).ExtraFilter;
        expect(filter).toContain("'prior-2'");
        expect(filter).toContain("'prior-1'");
        expect(prepTranscriptArg()).toBe('User: first leg\nAssistant: second leg');
    });

    it('NEVER loops on a cyclic prior chain (A→B→A)', async () => {
        setupHappyStart();
        const { provider } = makeHydrationProvider({
            chain: {
                'prior-a': { UserID: 'user-1', LastSessionID: 'prior-b' },
                'prior-b': { UserID: 'user-1', LastSessionID: 'prior-a' },
            },
            detailRows: [turn('User', 'looped once')],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-a');

        expect(result.AgentSessionId).toBe('session-new');
        expect(prepTranscriptArg()).toBe('User: looped once');
    });

    it('keeps only the NEWEST 30 turns (oldest dropped)', async () => {
        setupHappyStart();
        const rows = Array.from({ length: 35 }, (_, i) => turn('User', `turn ${i}`, `d-${i}`));
        const { provider } = makeHydrationProvider({ chain: { 'prior-1': { UserID: 'user-1' } }, detailRows: rows });
        currentProvider = provider;
        const resolver = makeResolver();

        await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        const lines = (prepTranscriptArg() ?? '').split('\n');
        expect(lines).toHaveLength(30);
        expect(lines[0]).toBe('User: turn 5');
        expect(lines[29]).toBe('User: turn 34');
    });

    it('caps the transcript at ~8k chars, dropping the OLDEST lines first', async () => {
        setupHappyStart();
        // 10 turns of 1000 chars each — only the newest ~7 fit the 8000-char budget.
        const rows = Array.from({ length: 10 }, (_, i) => turn('User', `${i}`.padEnd(1000, 'x'), `d-${i}`));
        const { provider } = makeHydrationProvider({ chain: { 'prior-1': { UserID: 'user-1' } }, detailRows: rows });
        currentProvider = provider;
        const resolver = makeResolver();

        await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        const transcript = prepTranscriptArg() ?? '';
        expect(transcript.length).toBeLessThanOrEqual(8000);
        const lines = transcript.split('\n');
        expect(lines).toHaveLength(7);
        expect(lines[0].startsWith('User: 3')).toBe(true); // 0–2 dropped, newest 7 kept
        expect(lines[6].startsWith('User: 9')).toBe(true);
    });

    it('skips hidden, error-role, and empty rows', async () => {
        setupHappyStart();
        const { provider } = makeHydrationProvider({
            chain: { 'prior-1': { UserID: 'user-1' } },
            detailRows: [
                { ID: 'd-1', Role: 'Error', Message: 'boom', HiddenToUser: false },
                { ID: 'd-2', Role: 'AI', Message: 'secret', HiddenToUser: true },
                { ID: 'd-3', Role: 'User', Message: '   ', HiddenToUser: false },
                { ID: 'd-4', Role: 'User', Message: null, HiddenToUser: false },
                { ID: 'd-5', Role: 'User', Message: 'visible', HiddenToUser: false },
            ],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(prepTranscriptArg()).toBe('User: visible');
    });

    it('omits PriorTranscript when no lastSessionId is supplied', async () => {
        setupHappyStart();
        const { provider } = makeHydrationProvider({ chain: {}, detailRows: [turn('User', 'never seen')] });
        currentProvider = provider;
        const resolver = makeResolver();

        await resolver.StartRealtimeClientSession('target-1', makeCtx());

        expect(prepTranscriptArg()).toBeUndefined();
    });

    it('omits PriorTranscript (no leak) when the prior session belongs to ANOTHER user', async () => {
        setupHappyStart();
        const { provider } = makeHydrationProvider({
            chain: { 'prior-1': { UserID: 'someone-else' } },
            detailRows: [turn('User', 'their words')],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(prepTranscriptArg()).toBeUndefined();
    });

    it('stops the chain walk at the first UNOWNED deeper leg but keeps the owned legs', async () => {
        setupHappyStart();
        const { provider, runView } = makeHydrationProvider({
            chain: {
                'prior-2': { UserID: 'user-1', LastSessionID: 'prior-1' },
                'prior-1': { UserID: 'someone-else' },
            },
            detailRows: [turn('User', 'owned leg only')],
        });
        currentProvider = provider;
        const resolver = makeResolver();

        await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-2');

        const detailCall = runView.mock.calls.find(
            (c) => (c[0] as { EntityName: string }).EntityName === 'MJ: Conversation Details',
        );
        const filter = (detailCall![0] as { ExtraFilter: string }).ExtraFilter;
        expect(filter).toContain("'prior-2'");
        expect(filter).not.toContain("'prior-1'");
        expect(prepTranscriptArg()).toBe('User: owned leg only');
    });

    it('tolerates a failed details query (start succeeds, no hydration)', async () => {
        setupHappyStart();
        const { provider } = makeHydrationProvider({
            chain: { 'prior-1': { UserID: 'user-1' } },
            detailQueryFails: true,
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(result.AgentSessionId).toBe('session-new');
        expect(prepTranscriptArg()).toBeUndefined();
    });

    it('tolerates a thrown hydration failure (start succeeds, no hydration)', async () => {
        setupHappyStart();
        currentProvider = {
            GetEntityObject: vi.fn(async () => {
                throw new Error('provider exploded');
            }),
            RunView: vi.fn(async () => ({ Success: true, Results: [] })),
        };
        const resolver = makeResolver();

        const result = await resolver.StartRealtimeClientSession('target-1', makeCtx(), undefined, 'prior-1');

        expect(result.AgentSessionId).toBe('session-new');
        expect(prepTranscriptArg()).toBeUndefined();
    });
});

describe('RealtimeClientSessionResolver.CancelRealtimeSessionTool', () => {
    it('enforces ownership — rejects (no cancel) when the caller does not own the session', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ UserID: 'someone-else' }));
        const resolver = makeResolver();

        await expect(
            resolver.CancelRealtimeSessionTool('session-1', makeCtx(), 'call-1'),
        ).rejects.toThrow(/do not own/i);
        expect(cancelInFlightMock).not.toHaveBeenCalled();
    });

    it('throws before any session load when unauthenticated', async () => {
        const provider = makeProvider(() => makeSessionEntity());
        currentProvider = provider;
        const resolver = new RealtimeClientSessionResolver();
        (resolver as unknown as { GetUserFromPayload: () => unknown }).GetUserFromPayload = () => undefined;

        await expect(resolver.CancelRealtimeSessionTool('session-1', makeCtx())).rejects.toThrow(/not authenticated/i);
        expect((provider as { GetEntityObject: ReturnType<typeof vi.fn> }).GetEntityObject).not.toHaveBeenCalled();
        expect(cancelInFlightMock).not.toHaveBeenCalled();
    });

    it('cancels ONE call when callId is supplied and returns the service count in the structured result', async () => {
        currentProvider = makeProvider(() => makeSessionEntity());
        cancelInFlightMock.mockReturnValue(1);
        const resolver = makeResolver();

        const result = await resolver.CancelRealtimeSessionTool('session-1', makeCtx(), 'call-7');

        expect(result).toEqual({ AbortedCount: 1, Success: true });
        expect(cancelInFlightMock).toHaveBeenCalledWith('session-1', 'call-7');
    });

    it('cancels ALL in-flight delegations when callId is omitted', async () => {
        currentProvider = makeProvider(() => makeSessionEntity());
        cancelInFlightMock.mockReturnValue(3);
        const resolver = makeResolver();

        const result = await resolver.CancelRealtimeSessionTool('session-1', makeCtx());

        expect(result).toEqual({ AbortedCount: 3, Success: true });
        expect(cancelInFlightMock).toHaveBeenCalledWith('session-1', undefined);
    });

    it('is tolerant — Success with AbortedCount 0 when nothing was in flight (the work may have finished already)', async () => {
        currentProvider = makeProvider(() => makeSessionEntity());
        cancelInFlightMock.mockReturnValue(0);
        const resolver = makeResolver();

        await expect(resolver.CancelRealtimeSessionTool('session-1', makeCtx(), 'call-gone')).resolves.toEqual({
            AbortedCount: 0,
            Success: true,
        });
    });

    it('accepts a CLOSED session (a cancel can legitimately race teardown)', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ Status: 'Closed' }));
        cancelInFlightMock.mockReturnValue(1);
        const resolver = makeResolver();

        await expect(resolver.CancelRealtimeSessionTool('session-1', makeCtx())).resolves.toEqual({
            AbortedCount: 1,
            Success: true,
        });
    });

    it('returns a structured failure (never throws) when the registry abort throws unexpectedly', async () => {
        currentProvider = makeProvider(() => makeSessionEntity());
        cancelInFlightMock.mockImplementation(() => {
            throw new Error('registry exploded');
        });
        const resolver = makeResolver();

        const result = await resolver.CancelRealtimeSessionTool('session-1', makeCtx(), 'call-1');

        expect(result.Success).toBe(false);
        expect(result.AbortedCount).toBe(0);
        expect(result.ErrorMessage).toContain('registry exploded');
    });
});

describe('RealtimeClientSessionResolver.RelayRealtimeUsage', () => {
    /** Provider routing the session and the co-agent prompt run by entity name. */
    function makeUsageProvider(opts: {
        session?: FakeSession;
        promptRun?: FakeSession;
    }): { provider: unknown; promptRun: FakeSession } {
        const session =
            opts.session ??
            makeSessionEntity({ Config_: JSON.stringify({ targetAgentID: 'target-1', promptRunID: 'prompt-run-1' }) });
        const promptRun = opts.promptRun ?? makeSessionEntity({ ID: 'prompt-run-1', TokensPrompt: null, TokensCompletion: null, TokensUsed: null });
        const provider = {
            GetEntityObject: vi.fn(async (name: string) => (name === 'MJ: AI Prompt Runs' ? promptRun : session)),
        };
        return { provider, promptRun };
    }

    it('enforces ownership — rejects when the caller does not own the session', async () => {
        const { provider, promptRun } = makeUsageProvider({ session: makeSessionEntity({ UserID: 'someone-else' }) });
        currentProvider = provider;
        const resolver = makeResolver();

        await expect(
            resolver.RelayRealtimeUsage('session-1', 100, 25, makeCtx()),
        ).rejects.toThrow(/do not own/i);
        expect(promptRun.Save).not.toHaveBeenCalled();
    });

    it('ACCUMULATES the relayed deltas onto TokensPrompt/TokensCompletion and recomputes TokensUsed', async () => {
        const { provider, promptRun } = makeUsageProvider({
            promptRun: makeSessionEntity({ ID: 'prompt-run-1', TokensPrompt: 100, TokensCompletion: 40, TokensUsed: 140 }),
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.RelayRealtimeUsage('session-1', 30, 5, makeCtx());

        expect(ok).toBe(true);
        expect(promptRun.Load).toHaveBeenCalledWith('prompt-run-1');
        expect(promptRun.TokensPrompt).toBe(130);
        expect(promptRun.TokensCompletion).toBe(45);
        expect(promptRun.TokensUsed).toBe(175);
        expect(promptRun.Save).toHaveBeenCalled();
    });

    it('treats null token columns as 0 on first accumulation', async () => {
        const { provider, promptRun } = makeUsageProvider({});
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.RelayRealtimeUsage('session-1', 120, 45, makeCtx());

        expect(ok).toBe(true);
        expect(promptRun.TokensPrompt).toBe(120);
        expect(promptRun.TokensCompletion).toBe(45);
        expect(promptRun.TokensUsed).toBe(165);
    });

    it('is a successful no-op (no prompt-run load) when both deltas are zero/negative/non-finite', async () => {
        const { provider, promptRun } = makeUsageProvider({});
        currentProvider = provider;
        const resolver = makeResolver();

        await expect(resolver.RelayRealtimeUsage('session-1', 0, 0, makeCtx())).resolves.toBe(true);
        await expect(resolver.RelayRealtimeUsage('session-1', -5, -1, makeCtx())).resolves.toBe(true);
        await expect(resolver.RelayRealtimeUsage('session-1', Number.NaN, 0, makeCtx())).resolves.toBe(true);
        expect(promptRun.Load).not.toHaveBeenCalled();
        expect(promptRun.Save).not.toHaveBeenCalled();
    });

    it('clamps a negative delta to 0 while accumulating the positive one', async () => {
        const { provider, promptRun } = makeUsageProvider({
            promptRun: makeSessionEntity({ ID: 'prompt-run-1', TokensPrompt: 10, TokensCompletion: 10, TokensUsed: 20 }),
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.RelayRealtimeUsage('session-1', -50, 7, makeCtx());

        expect(ok).toBe(true);
        expect(promptRun.TokensPrompt).toBe(10);
        expect(promptRun.TokensCompletion).toBe(17);
        expect(promptRun.TokensUsed).toBe(27);
    });

    it('returns false (tolerant) when the session config carries no promptRunID', async () => {
        const { provider, promptRun } = makeUsageProvider({
            session: makeSessionEntity({ Config_: JSON.stringify({ targetAgentID: 'target-1' }) }),
        });
        currentProvider = provider;
        const resolver = makeResolver();

        await expect(resolver.RelayRealtimeUsage('session-1', 10, 5, makeCtx())).resolves.toBe(false);
        expect(promptRun.Save).not.toHaveBeenCalled();
    });

    it('returns false (tolerant, no throw) when the session config is missing/malformed', async () => {
        const { provider } = makeUsageProvider({ session: makeSessionEntity({ Config_: '{broken json' }) });
        currentProvider = provider;
        const resolver = makeResolver();

        await expect(resolver.RelayRealtimeUsage('session-1', 10, 5, makeCtx())).resolves.toBe(false);
    });

    it('returns false when the co-agent prompt run cannot be loaded', async () => {
        const { provider, promptRun } = makeUsageProvider({
            promptRun: makeSessionEntity({ ID: 'prompt-run-1', Load: vi.fn(async () => false) }),
        });
        currentProvider = provider;
        const resolver = makeResolver();

        await expect(resolver.RelayRealtimeUsage('session-1', 10, 5, makeCtx())).resolves.toBe(false);
        expect(promptRun.Save).not.toHaveBeenCalled();
    });

    it('returns false (logged) when the prompt-run save fails', async () => {
        const { provider } = makeUsageProvider({
            promptRun: makeSessionEntity({
                ID: 'prompt-run-1',
                TokensPrompt: null,
                TokensCompletion: null,
                Save: vi.fn(async () => false),
                LatestResult: { CompleteMessage: 'db down' },
            }),
        });
        currentProvider = provider;
        const resolver = makeResolver();

        await expect(resolver.RelayRealtimeUsage('session-1', 10, 5, makeCtx())).resolves.toBe(false);
    });

    it('accepts a CLOSED session (the final teardown flush lands after CloseAgentSession)', async () => {
        const { provider, promptRun } = makeUsageProvider({
            session: makeSessionEntity({
                Status: 'Closed',
                Config_: JSON.stringify({ targetAgentID: 'target-1', promptRunID: 'prompt-run-1' }),
            }),
        });
        currentProvider = provider;
        const resolver = makeResolver();

        const ok = await resolver.RelayRealtimeUsage('session-1', 9, 3, makeCtx());

        expect(ok).toBe(true);
        expect(promptRun.TokensPrompt).toBe(9);
        expect(promptRun.TokensCompletion).toBe(3);
        expect(promptRun.TokensUsed).toBe(12);
    });
});
