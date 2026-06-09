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
const agentsMock = vi.fn(() => [{ ID: 'co-agent-1', Name: 'Voice Co-Agent' }]);
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            get Agents() {
                return agentsMock();
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
    return { userPayload: {}, providers: [] } as unknown as AppContext;
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

    it('returns the ephemeral config and stores targetAgentID in session config on success', async () => {
        hasPermissionMock.mockResolvedValue(true);
        currentProvider = makeProvider(() => makeSessionEntity());
        createSessionMock.mockResolvedValue(makeSessionEntity({ ID: 'session-9', ConversationID: 'conv-9' }));
        prepareClientSessionMock.mockResolvedValue({
            Success: true,
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
        // Ephemeral config surfaced to the browser.
        expect(result.AgentSessionId).toBe('session-9');
        expect(result.ConversationId).toBe('conv-9');
        expect(result.Provider).toBe('openai');
        expect(result.Model).toBe('gpt-realtime');
        expect(result.EphemeralToken).toBe('ek_abc');
        expect(result.ExpiresAt).toBe('2026-01-01T00:00:00Z');
        expect(JSON.parse(result.SessionConfigJson)).toEqual({ instructions: 'hi' });
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

        expect(closeSessionMock).toHaveBeenCalledWith('session-bad', USER, currentProvider);
    });
});

describe('RealtimeClientSessionResolver.ExecuteRealtimeSessionTool', () => {
    it('enforces ownership — rejects when the caller does not own the session', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ UserID: 'someone-else' }));
        const resolver = makeResolver();

        await expect(
            resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'invoke-target-agent', '{}', makeCtx()),
        ).rejects.toThrow(/do not own/i);

        expect(executeRelayedToolMock).not.toHaveBeenCalled();
    });

    it('reads the target from the session config and returns ResultJson', async () => {
        currentProvider = makeProvider(() =>
            makeSessionEntity({ Config_: JSON.stringify({ targetAgentID: 'target-from-session' }) }),
        );
        executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true });
        const resolver = makeResolver();

        const out = await resolver.ExecuteRealtimeSessionTool(
            'session-1',
            'call-1',
            'invoke-target-agent',
            '{"request":"do it"}',
            makeCtx(),
        );

        expect(out).toBe('{"ok":true}');
        const relayArg = executeRelayedToolMock.mock.calls[0][0] as {
            TargetAgentID: string;
            Call: { CallID: string; ToolName: string; Arguments: string };
        };
        // Target comes from the session, NOT the client.
        expect(relayArg.TargetAgentID).toBe('target-from-session');
        expect(relayArg.Call).toEqual({ CallID: 'call-1', ToolName: 'invoke-target-agent', Arguments: '{"request":"do it"}' });
        expect(heartbeatMock).toHaveBeenCalledWith('session-1', USER, currentProvider);
    });

    it('rejects a closed session', async () => {
        currentProvider = makeProvider(() => makeSessionEntity({ Status: 'Closed' }));
        const resolver = makeResolver();

        await expect(
            resolver.ExecuteRealtimeSessionTool('session-1', 'call-1', 'x', '{}', makeCtx()),
        ).rejects.toThrow(/closed/i);
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
});
