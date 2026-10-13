/**
 * `ExecuteRemoteBrowserGoal` attaches a "Browser goal" step to the realtime co-agent run named by the
 * session's `coAgentRunID`. The session owner can edit `Config`, so the run must be a record of the
 * session before a step is attached to it.
 */
// type-graphql decorators on the resolver need the reflect-metadata polyfill loaded first.
import 'reflect-metadata';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// As in RemoteBrowserActionRecovery.test.ts: the decorators become no-ops so the resolver's plain logic runs.
vi.mock('type-graphql', () => {
    const noopDecorator = () => () => undefined;
    return {
        Resolver: noopDecorator,
        Mutation: noopDecorator,
        Query: noopDecorator,
        Subscription: noopDecorator,
        ObjectType: noopDecorator,
        InputType: noopDecorator,
        Field: noopDecorator,
        Arg: noopDecorator,
        Args: noopDecorator,
        Ctx: noopDecorator,
        PubSub: noopDecorator,
        Root: noopDecorator,
        Float: class {},
        Int: class {},
        ID: class {},
    };
});

const achieveGoalMock = vi.fn(async (_sessionID: string, _goal: string, _options: Record<string, unknown>) => ({ Success: true, Status: 'Done' }));
vi.mock('@memberjunction/remote-browser-server', () => ({
    NormalizeInstanceKey: (key?: string) => key,
    RemoteBrowserEngine: {
        Instance: {
            AchieveGoal: (sessionID: string, goal: string, options: Record<string, unknown>) => achieveGoalMock(sessionID, goal, options),
        },
    },
}));

const beginStepMock = vi.fn(async (_provider: unknown, _user: unknown, _coAgentRunID: string | undefined, _goal: string) => null);
vi.mock('../agentSessions/remoteBrowserGoalEngine.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../agentSessions/remoteBrowserGoalEngine.js')>()),
    BeginBrowserGoalStep: (provider: unknown, user: unknown, coAgentRunID: string | undefined, goal: string) =>
        beginStepMock(provider, user, coAgentRunID, goal),
    FinalizeBrowserGoalStep: vi.fn(async () => undefined),
}));

vi.mock('@memberjunction/aiengine', () => ({ AIEngine: { Instance: { Config: vi.fn(), Prompts: [] } } }));
vi.mock('@memberjunction/ai-prompts', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/ai-prompts')>()),
    AIPromptRunner: class {},
}));
vi.mock('@memberjunction/ai-core-plus', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/ai-core-plus')>()),
    AIPromptParams: class {},
}));

import { RemoteBrowserActionResolver } from '../resolvers/RemoteBrowserActionResolver.js';
import type { AppContext } from '../types.js';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAIAgentSessionEntity } from '@memberjunction/core-entities';

const SESSION_ID = 'c3c3c3c3-2000-4000-8000-000000000001';
const CO_RUN_ID = 'c3c3c3c3-2000-4000-8000-000000000002';
/** A run that exists, but belongs to someone else's session. */
const FOREIGN_RUN_ID = 'c3c3c3c3-2000-4000-8000-0000000000f1';

/** The runs the fake lookup reports as records of the session. */
let sessionRunIDs: string[] = [];
const runViewsMock = vi.fn(async (paramsList: Array<{ EntityName?: string }>) =>
    paramsList.map((params) => ({
        Success: true,
        Results: params.EntityName === 'MJ: AI Agent Runs' ? sessionRunIDs.map((ID) => ({ ID })) : [],
    })),
);

/** Bypasses the ownership/provider plumbing (covered elsewhere); the session carries `ConfigJson`. */
class TestableResolver extends RemoteBrowserActionResolver {
    public ConfigJson = '';
    protected override requireUserAndProvider(): { contextUser: UserInfo; provider: IMetadataProvider } {
        return {
            contextUser: { ID: 'c3c3c3c3-2000-4000-8000-0000000000aa' } as unknown as UserInfo,
            provider: { RunViews: runViewsMock } as unknown as IMetadataProvider,
        };
    }
    protected override async loadOwnedSession(): Promise<MJAIAgentSessionEntity> {
        return { ID: SESSION_ID, AgentID: 'agent-1', Config_: this.ConfigJson } as unknown as MJAIAgentSessionEntity;
    }
    protected override async resolveProviderName(): Promise<string | undefined> {
        return 'Self-Hosted Chrome';
    }
}

const ctx = { userPayload: { sessionId: 'push-sess-1' }, providers: [] } as unknown as AppContext;

async function startGoal(config: Record<string, unknown>): Promise<void> {
    const resolver = new TestableResolver();
    resolver.ConfigJson = JSON.stringify(config);
    await resolver.ExecuteRemoteBrowserGoal(SESSION_ID, 'open the docs', ctx);
}

beforeEach(() => {
    sessionRunIDs = [];
    runViewsMock.mockClear();
    beginStepMock.mockClear();
    achieveGoalMock.mockClear();
});

describe('RemoteBrowserActionResolver.ExecuteRemoteBrowserGoal — co-agent run from Config', () => {
    it('does not attach the goal to a run that is not a record of the session', async () => {
        await startGoal({ targetAgentID: 'target-1', coAgentRunID: FOREIGN_RUN_ID });

        expect(beginStepMock).toHaveBeenCalledTimes(1);
        expect(beginStepMock.mock.calls[0][2]).toBeUndefined();
        expect(achieveGoalMock.mock.calls[0][2].AgentRunID).toBeUndefined();
    });

    it('attaches the goal to the session\'s co-agent run', async () => {
        sessionRunIDs = [CO_RUN_ID];

        await startGoal({ targetAgentID: 'target-1', coAgentRunID: CO_RUN_ID });

        expect(beginStepMock.mock.calls[0][2]).toBe(CO_RUN_ID);
        expect(achieveGoalMock.mock.calls[0][2].AgentRunID).toBe(CO_RUN_ID);
    });
});
