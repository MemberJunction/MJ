/**
 * A realtime session's `Config` JSON is writable by the session owner: the UI and Widget Guest
 * roles hold Create/Update on `MJ: AI Agent Sessions`, row-scoped only to their own sessions. These
 * tests edit `Config` the way such an owner could and check that the relay mutations do not take
 * authority from it: the target agent is re-authorized for the caller, direct actions are not read
 * from it, and run ids are used only when they are records of the session. They also check that
 * scope-limited callers get no direct actions, because a scoped anonymous caller's relay runs as the
 * system user.
 */
// type-graphql decorators on the resolver need the reflect-metadata polyfill loaded first.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

const hasPermissionMock = vi.fn(async (_agentID: string, _user?: unknown, _permission?: string): Promise<boolean> => true);
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIAgentPermissionHelper: {
        HasPermission: (agentID: string, user: unknown, permission: string) => hasPermissionMock(agentID, user, permission),
    },
    AIEngineBase: {
        GetProviderInstance: vi.fn(),
    },
}));

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            Agents: [],
            AgentTypes: [],
        },
    },
}));

const executeRelayedToolMock = vi.fn();
const appendPromptRunMessageMock = vi.fn(async (): Promise<boolean> => true);
const accumulatePromptRunUsageMock = vi.fn(async (): Promise<boolean> => true);
vi.mock('@memberjunction/ai-agents', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        RealtimeClientSessionService: class {
            ExecuteRelayedTool = executeRelayedToolMock;
            AppendPromptRunMessage = appendPromptRunMessageMock;
            AccumulatePromptRunUsage = accumulatePromptRunUsageMock;
        },
    };
});

const heartbeatMock = vi.fn(async () => true);
vi.mock('../agentSessions/index.js', () => ({
    SessionManager: class {
        Heartbeat = heartbeatMock;
    },
}));

let currentProvider: unknown;
vi.mock('../util.js', () => ({
    GetReadWriteProvider: () => currentProvider,
}));

const getSystemUserMock = vi.fn<() => UserInfo | undefined>();
vi.mock('@memberjunction/generic-database-provider', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        UserCache: {
            get Instance() {
                return { GetSystemUser: getSystemUserMock };
            },
        },
    };
});

import { RealtimeClientSessionResolver } from '../resolvers/RealtimeClientSessionResolver.js';
import type { AppContext } from '../types.js';
import type { RunViewParams, UserInfo } from '@memberjunction/core';
import type { ExecuteRelayedToolInput } from '@memberjunction/ai-agents';
import type { PubSubEngine } from 'type-graphql';

const SESSION_ID = 'c3c3c3c3-0000-4000-8000-000000000001';
const USER_ID = 'c3c3c3c3-0000-4000-8000-000000000002';
const TARGET_ID = 'c3c3c3c3-0000-4000-8000-000000000003';
const OTHER_AGENT_ID = 'c3c3c3c3-0000-4000-8000-000000000004';
const CO_RUN_ID = 'c3c3c3c3-0000-4000-8000-000000000005';
const PROMPT_RUN_ID = 'c3c3c3c3-0000-4000-8000-000000000006';
const STEP_ID = 'c3c3c3c3-0000-4000-8000-000000000007';
const PAUSED_RUN_ID = 'c3c3c3c3-0000-4000-8000-000000000008';
/** A run that exists, but belongs to someone else's session. */
const FOREIGN_RUN_ID = 'c3c3c3c3-0000-4000-8000-0000000000f1';
/** Harmless text that is not a UUID and would change the meaning of a quoted filter. */
const NOT_A_UUID = "x' OR '1'='1";

const USER = { ID: USER_ID, Email: 'owner@example.com' };

interface FakeEntity {
    [key: string]: unknown;
    Save: () => Promise<boolean>;
    Load: (id: string) => Promise<boolean>;
    NewRecord: () => void;
}

/** Rows the fake RunView returns, keyed by entity name. */
type FakeRows = Record<string, Array<Record<string, unknown>>>;

function makeSession(config: Record<string, unknown>, overrides: Partial<FakeEntity> = {}): FakeEntity {
    return {
        ID: SESSION_ID,
        Status: 'Active',
        UserID: USER_ID,
        ConversationID: 'c3c3c3c3-0000-4000-8000-0000000000c1',
        Config_: JSON.stringify(config),
        Save: vi.fn(async () => true),
        Load: vi.fn(async () => true),
        NewRecord: vi.fn(),
        LatestResult: null,
        ...overrides,
    };
}

function makeDetail(): FakeEntity {
    return { ID: 'c3c3c3c3-0000-4000-8000-0000000000d1', Save: vi.fn(async () => true), Load: vi.fn(async () => true), NewRecord: vi.fn() };
}

/** A provider serving the session plus view rows per entity name; `runView` records every view run. */
function makeProvider(session: FakeEntity, rows: FakeRows = {}): { runView: ReturnType<typeof vi.fn> } {
    const runView = vi.fn(async (params: RunViewParams) => {
        const results = rows[params.EntityName ?? ''] ?? [];
        return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 0, ErrorMessage: '' };
    });
    currentProvider = {
        GetEntityObject: vi.fn(async (name: string) => (name === 'MJ: AI Agent Sessions' ? session : makeDetail())),
        RunView: runView,
        RunViews: vi.fn(async (paramsList: RunViewParams[]) => Promise.all(paramsList.map((params) => runView(params)))),
    };
    return { runView };
}

/** Rows that make every run id in `ids` a record of this session. */
function sessionRuns(...ids: string[]): FakeRows {
    return { 'MJ: AI Agent Runs': ids.map((ID) => ({ ID })) };
}

function makeResolver(user: object = USER): RealtimeClientSessionResolver {
    const resolver = new RealtimeClientSessionResolver();
    (resolver as unknown as { GetUserFromPayload: () => unknown }).GetUserFromPayload = () => user;
    return resolver;
}

function makeCtx(): AppContext {
    return { userPayload: { sessionId: 'c3-pubsub-session' }, providers: [] } as unknown as AppContext;
}

function makePubSub(): PubSubEngine {
    return { publish: vi.fn(async () => undefined) } as unknown as PubSubEngine;
}

function relay(resolver: RealtimeClientSessionResolver): Promise<string> {
    return relayTool(resolver, 'invoke-target-agent', '{"request":"hi"}');
}

function relayTool(resolver: RealtimeClientSessionResolver, toolName: string, argsJson = '{}'): Promise<string> {
    return resolver.ExecuteRealtimeSessionTool(SESSION_ID, 'call-1', toolName, argsJson, makeCtx(), makePubSub());
}

/** A scoped anonymous magic-link caller: the relay runs its work as the system user. */
const SCOPED_ANONYMOUS = { ID: USER_ID, Email: 'guest@magic-link.local', IsMagicLinkAnonymous: true, MagicLinkScope: { ResourceID: 'c3-scope' } };
/** A public web-widget guest: anonymous, but not elevated. */
const WIDGET_GUEST = { ID: USER_ID, Email: 'guest@widget.local', IsMagicLinkAnonymous: true, WidgetGuestContext: { WidgetID: 'c3c3c3c3-0000-4000-8000-0000000000b1' } };
/** A resource-scoped magic-link session: a normal role pinned to one shared resource. */
const RESOURCE_SCOPED = { ID: USER_ID, Email: 'invitee@example.com', MagicLinkScope: { ResourceID: 'c3-shared-resource' } };
const SYSTEM_USER = { ID: 'c3c3c3c3-0000-4000-8000-0000000000aa', Email: 'system@example.com' } as UserInfo;

function relayInput(): ExecuteRelayedToolInput {
    return executeRelayedToolMock.mock.calls[0][0] as ExecuteRelayedToolInput;
}

function issuedFilters(runView: ReturnType<typeof vi.fn>): string[] {
    return runView.mock.calls.map(([params]) => (params as RunViewParams).ExtraFilter ?? '');
}

beforeEach(() => {
    hasPermissionMock.mockReset();
    hasPermissionMock.mockImplementation(async () => true);
    executeRelayedToolMock.mockReset();
    executeRelayedToolMock.mockResolvedValue({ ResultJson: '{"ok":true}', Success: true });
    appendPromptRunMessageMock.mockReset();
    appendPromptRunMessageMock.mockResolvedValue(true);
    accumulatePromptRunUsageMock.mockReset();
    accumulatePromptRunUsageMock.mockResolvedValue(true);
    heartbeatMock.mockClear();
    getSystemUserMock.mockReset();
    getSystemUserMock.mockReturnValue(undefined);
});

describe('ExecuteRealtimeSessionTool — target agent named in Config', () => {
    it('refuses to relay when the caller cannot run the target agent in the session config', async () => {
        hasPermissionMock.mockImplementation(async (agentID: string) => agentID !== OTHER_AGENT_ID);
        makeProvider(makeSession({ targetAgentID: OTHER_AGENT_ID }));

        await expect(relay(makeResolver())).rejects.toThrow(/not authorized/i);
        expect(executeRelayedToolMock).not.toHaveBeenCalled();
    });

    it('refuses before elevating a scoped anonymous caller to the system user', async () => {
        getSystemUserMock.mockReturnValue(SYSTEM_USER);
        hasPermissionMock.mockImplementation(async (agentID: string) => agentID !== OTHER_AGENT_ID);
        makeProvider(makeSession({ targetAgentID: OTHER_AGENT_ID }));

        await expect(relay(makeResolver(SCOPED_ANONYMOUS))).rejects.toThrow(/not authorized/i);
        expect(executeRelayedToolMock).not.toHaveBeenCalled();
        // CanRun was asked about the caller, never the system user.
        expect(hasPermissionMock).toHaveBeenCalledWith(OTHER_AGENT_ID, SCOPED_ANONYMOUS, 'run');
        expect(hasPermissionMock.mock.calls.every(([, user]) => user === SCOPED_ANONYMOUS)).toBe(true);
    });

    it('relays when the caller can run the target agent', async () => {
        makeProvider(makeSession({ targetAgentID: TARGET_ID }));

        await expect(relay(makeResolver())).resolves.toBe('{"ok":true}');
        expect(relayInput().TargetAgentID).toBe(TARGET_ID);
    });
});

describe('ExecuteRealtimeSessionTool — direct actions for scope-limited callers', () => {
    function refusal(resultJson: string): { success: boolean; output: string } {
        return JSON.parse(resultJson) as { success: boolean; output: string };
    }

    it('refuses a direct action from a scoped anonymous caller before elevating it to the system user', async () => {
        getSystemUserMock.mockReturnValue(SYSTEM_USER);
        makeProvider(makeSession({ targetAgentID: TARGET_ID }));

        const result = refusal(await relayTool(makeResolver(SCOPED_ANONYMOUS), 'Get_Record', '{"EntityName":"MJ: Users"}'));

        expect(result.success).toBe(false);
        expect(result.output).toContain('invoke-target-agent');
        expect(executeRelayedToolMock).not.toHaveBeenCalled();
        // The refusal is decided on the caller: the system user was never even looked up.
        expect(getSystemUserMock).not.toHaveBeenCalled();
    });

    it('refuses a direct action from a public web-widget guest', async () => {
        makeProvider(makeSession({ targetAgentID: TARGET_ID }));

        const result = refusal(await relayTool(makeResolver(WIDGET_GUEST), 'Get_Record'));

        expect(result.success).toBe(false);
        expect(executeRelayedToolMock).not.toHaveBeenCalled();
    });

    it('refuses a direct action from a resource-scoped magic-link session', async () => {
        makeProvider(makeSession({ targetAgentID: TARGET_ID }));

        const result = refusal(await relayTool(makeResolver(RESOURCE_SCOPED), 'Get_Record'));

        expect(result.success).toBe(false);
        expect(executeRelayedToolMock).not.toHaveBeenCalled();
    });

    it('still delegates invoke-target-agent for a scoped anonymous caller', async () => {
        getSystemUserMock.mockReturnValue(SYSTEM_USER);
        makeProvider(makeSession({ targetAgentID: TARGET_ID }));

        await expect(relay(makeResolver(SCOPED_ANONYMOUS))).resolves.toBe('{"ok":true}');
        expect(executeRelayedToolMock).toHaveBeenCalledTimes(1);
    });

    it('still relays a direct action for a caller that is not scope-limited', async () => {
        makeProvider(makeSession({ targetAgentID: TARGET_ID }));

        await expect(relayTool(makeResolver(), 'Get_Record')).resolves.toBe('{"ok":true}');
        expect(executeRelayedToolMock).toHaveBeenCalledTimes(1);
        expect(executeRelayedToolMock.mock.calls[0][1]).toBe(USER);
    });
});

describe('ExecuteRealtimeSessionTool — directActions in Config', () => {
    it('does not hand the directActions stored in the session config to the relay', async () => {
        makeProvider(makeSession({ targetAgentID: TARGET_ID, directActions: { enabled: true, actionNames: ['*'] } }));

        await relay(makeResolver());

        expect(relayInput().DirectActions).toBeUndefined();
    });
});

describe('ExecuteRealtimeSessionTool — run ids in Config', () => {
    it('drops run ids that are not UUIDs, and never puts them in a filter', async () => {
        const { runView } = makeProvider(makeSession({ targetAgentID: TARGET_ID, coAgentRunID: NOT_A_UUID, pendingFeedbackRunID: NOT_A_UUID }));

        await relay(makeResolver());

        expect(relayInput().ParentRunID).toBeUndefined();
        expect(relayInput().ResumeRunID).toBeUndefined();
        expect(issuedFilters(runView).filter((f) => f.includes(NOT_A_UUID))).toEqual([]);
    });

    it('drops run ids that are not records of this session', async () => {
        const { runView } = makeProvider(
            makeSession({ targetAgentID: TARGET_ID, coAgentRunID: FOREIGN_RUN_ID, pendingFeedbackRunID: FOREIGN_RUN_ID }),
        );

        await relay(makeResolver());

        expect(relayInput().ParentRunID).toBeUndefined();
        expect(relayInput().ResumeRunID).toBeUndefined();
        expect(issuedFilters(runView).some((f) => f.includes(`AgentSessionID='${SESSION_ID}'`))).toBe(true);
    });

    it('passes run ids that are records of this session', async () => {
        makeProvider(
            makeSession({ targetAgentID: TARGET_ID, coAgentRunID: CO_RUN_ID, pendingFeedbackRunID: PAUSED_RUN_ID }),
            sessionRuns(CO_RUN_ID, PAUSED_RUN_ID),
        );

        await relay(makeResolver());

        expect(relayInput().ParentRunID).toBe(CO_RUN_ID);
        expect(relayInput().ResumeRunID).toBe(PAUSED_RUN_ID);
    });
});

describe('prompt-run mirrors — promptRunID in Config', () => {
    const PROMPT_STEP_ROWS: FakeRows = {
        ...sessionRuns(CO_RUN_ID),
        'MJ: AI Agent Run Steps': [{ ID: STEP_ID, StepType: 'Prompt', TargetLogID: PROMPT_RUN_ID }],
    };

    it('RelayRealtimeUsage does not write to a prompt run that is not this session\'s', async () => {
        makeProvider(makeSession({ targetAgentID: TARGET_ID, coAgentRunID: CO_RUN_ID, promptRunID: FOREIGN_RUN_ID }), sessionRuns(CO_RUN_ID));

        const out = await makeResolver().RelayRealtimeUsage(SESSION_ID, 10, 5, makeCtx());

        expect(out).toBe(false);
        expect(accumulatePromptRunUsageMock).not.toHaveBeenCalled();
    });

    it('RelayRealtimeTranscript does not append to a prompt run that is not this session\'s', async () => {
        makeProvider(makeSession({ targetAgentID: TARGET_ID, coAgentRunID: CO_RUN_ID, promptRunID: FOREIGN_RUN_ID }), sessionRuns(CO_RUN_ID));

        const out = await makeResolver().RelayRealtimeTranscript(SESSION_ID, 'User', 'hello', makeCtx());

        expect(out).toBe(true);
        expect(appendPromptRunMessageMock).not.toHaveBeenCalled();
    });

    it('RelayRealtimeUsage writes to the prompt run of this session\'s co-agent run', async () => {
        makeProvider(makeSession({ targetAgentID: TARGET_ID, coAgentRunID: CO_RUN_ID, promptRunID: PROMPT_RUN_ID }), PROMPT_STEP_ROWS);

        const out = await makeResolver().RelayRealtimeUsage(SESSION_ID, 10, 5, makeCtx());

        expect(out).toBe(true);
        expect(accumulatePromptRunUsageMock).toHaveBeenCalledTimes(1);
        expect(accumulatePromptRunUsageMock.mock.calls[0][0]).toBe(PROMPT_RUN_ID);
    });
});
