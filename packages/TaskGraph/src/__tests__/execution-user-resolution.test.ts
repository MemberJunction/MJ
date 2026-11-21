import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload } from '../TaskGraphService';
import type { TaskActionRunner, TaskAgentRunner, TaskPromptRunner } from '../types';

function buildProviderWithSubmittingUser(submittedByUserID: string): IMetadataProvider {
    const bag = BuildTaskGraphParentInputPayload({
        continuation: 'message',
        reinvokeDepth: 0,
        failureSemantics: 'block',
        submittedByAgentRunID: 'run-1',
        submittedByUserID,
        invocation: null,
    });
    const parent = { Load: vi.fn().mockResolvedValue(true), InputPayload: JSON.stringify(bag), UserID: submittedByUserID };
    return { GetEntityObject: vi.fn().mockResolvedValue(parent) } as unknown as IMetadataProvider;
}

interface TestableDispatcher {
    actionRunner?: TaskActionRunner;
    promptRunner?: TaskPromptRunner;
    agentRunner?: TaskAgentRunner;
    contextUser: UserInfo;
    runTaskBody(
        task: MJTaskEntity,
        provider: IMetadataProvider,
        inputPayload: unknown,
        dependencyOutputs: Map<string, unknown>
    ): Promise<{ Success: boolean }>;
}

describe('TaskGraphDispatcher — submitting user context preservation', () => {
    const globalRef = globalThis as {
        ___SINGLETON__UserCache?: {
            Users: UserInfo[];
            FindUser(criteria: { ID?: string; Email?: string }): Promise<UserInfo | undefined>;
        };
    };
    let previousCache: typeof globalRef.___SINGLETON__UserCache;

    beforeEach(() => {
        previousCache = globalRef.___SINGLETON__UserCache;
    });

    afterEach(() => {
        globalRef.___SINGLETON__UserCache = previousCache;
    });

    it('passes the submitting user UserInfo (not daemon contextUser) to Action, Prompt, and Agent nodes', async () => {
        const daemonUser = { ID: '00000000-0000-0000-0000-000000000001', Name: 'Daemon', IsActive: true } as UserInfo;
        const aliceUser = { ID: '11111111-2222-3333-4444-555555555555', Name: 'Alice', IsActive: true } as UserInfo;

        globalRef.___SINGLETON__UserCache = {
            Users: [daemonUser, aliceUser],
            FindUser: async ({ ID }) => (ID === aliceUser.ID ? aliceUser : undefined),
        };

        const actionCalls: UserInfo[] = [];
        const promptCalls: UserInfo[] = [];
        const agentCalls: UserInfo[] = [];

        const dispatcher = Object.create(TaskGraphDispatcher.prototype) as TestableDispatcher;
        dispatcher.contextUser = daemonUser;
        dispatcher.actionRunner = {
            RunActionForTask: async (params) => {
                actionCalls.push(params.ContextUser);
                return { Success: true, Output: {} };
            },
        };
        dispatcher.promptRunner = {
            RunPromptForTask: async (params) => {
                promptCalls.push(params.ContextUser);
                return { Success: true, Output: {} };
            },
        };
        dispatcher.agentRunner = {
            RunAgentForTask: async (params) => {
                agentCalls.push(params.ContextUser);
                return { Success: true, Output: {}, AgentRunID: 'ar-1' };
            },
        };

        const provider = buildProviderWithSubmittingUser(aliceUser.ID);

        await dispatcher.runTaskBody(
            { ID: 'T-action', ParentID: 'P-1', ActionID: 'A-1', StepType: 'Action', ConfigurationObject: null } as unknown as MJTaskEntity,
            provider,
            {},
            new Map()
        );
        await dispatcher.runTaskBody(
            { ID: 'T-prompt', ParentID: 'P-1', PromptID: 'PR-1', StepType: 'Prompt', ConfigurationObject: null } as unknown as MJTaskEntity,
            provider,
            {},
            new Map()
        );
        await dispatcher.runTaskBody(
            { ID: 'T-agent', ParentID: 'P-1', AgentID: 'AG-1', StepType: 'Sub-Agent', ConfigurationObject: null } as unknown as MJTaskEntity,
            provider,
            {},
            new Map()
        );

        expect(actionCalls).toEqual([aliceUser]);
        expect(promptCalls).toEqual([aliceUser]);
        expect(agentCalls).toEqual([aliceUser]);
    });

    it('fails closed when the submitting user is inactive in UserCache', async () => {
        const daemonUser = { ID: '00000000-0000-0000-0000-000000000001', Name: 'Daemon', IsActive: true } as UserInfo;
        const inactiveUser = { ID: '99999999-8888-7777-6666-555555555555', Name: 'Suspended', IsActive: false } as UserInfo;

        globalRef.___SINGLETON__UserCache = {
            Users: [daemonUser, inactiveUser],
            FindUser: async ({ ID }) => (ID === inactiveUser.ID ? inactiveUser : undefined),
        };

        const dispatcher = Object.create(TaskGraphDispatcher.prototype) as TestableDispatcher;
        dispatcher.contextUser = daemonUser;
        dispatcher.actionRunner = {
            RunActionForTask: vi.fn().mockResolvedValue({ Success: true, Output: {} }),
        };

        const provider = buildProviderWithSubmittingUser(inactiveUser.ID);

        await expect(
            dispatcher.runTaskBody(
                { ID: 'T-action', ParentID: 'P-1', ActionID: 'A-1', StepType: 'Action', ConfigurationObject: null } as unknown as MJTaskEntity,
                provider,
                {},
                new Map()
            )
        ).rejects.toThrow(/inactive/i);
    });
});
