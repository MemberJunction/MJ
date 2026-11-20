/**
 * The dispatcher runs an action only when the step's execution user may run it, or when the action is
 * bound to the agent run or the durable entity-action binding that submitted the graph.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import { AIAgentPermissionHelper } from '@memberjunction/ai-engine-base';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import type { TaskActionRunner } from '../types';

const BOUND = '11111111-1111-4111-8111-111111111111';
const UNBOUND = '22222222-2222-4222-8222-222222222222';
const AGENT = '33333333-3333-4333-8333-333333333333';
const AGENT_RUN = '44444444-4444-4444-8444-444444444444';
const ENTITY_ACTION = '55555555-5555-4555-8555-555555555555';
const PARENT = '77777777-7777-4777-8777-777777777777';

const DISPATCHER_USER = { ID: '00000000-0000-4000-8000-000000000001', Name: 'Dispatcher', Type: 'Owner' } as unknown as UserInfo;
const REGULAR_USER = { ID: '66666666-6666-4666-8666-666666666666', Name: 'Regular User', Type: 'User', IsActive: true, UserRoles: [] } as unknown as UserInfo;

type Outcome = { Success: boolean; ErrorMessage?: string };
type RunTaskBody = (task: MJTaskEntity, provider: IMetadataProvider, input: unknown, deps: Map<string, unknown>) => Promise<Outcome>;

/** Answers every read the dispatcher makes; no action has `MJ: Action Authorizations` rows. */
function stubReads(): ReturnType<typeof vi.fn> {
    const answer = async (params: RunViewParams) => {
        switch (params.EntityName) {
            case 'MJ: Actions':
                return {
                    Success: true,
                    Results: [BOUND, UNBOUND].map((ID) => ({ ID, Name: ID === BOUND ? 'Bound' : 'Unbound', Type: 'Custom', DriverClass: null })),
                };
            case 'MJ: AI Agent Runs':
                return { Success: true, Results: [{ ID: AGENT_RUN, AgentID: AGENT, UserID: REGULAR_USER.ID }] };
            case 'MJ: AI Agent Actions':
                return { Success: true, Results: [{ AgentID: AGENT, ActionID: BOUND, Status: 'Active' }] };
            case 'MJ: Entity Actions':
                return { Success: true, Results: [{ ID: ENTITY_ACTION, ActionID: BOUND, Status: 'Active', RunMode: 'Durable' }] };
            default:
                return { Success: true, Results: [] };
        }
    };
    const runViews = vi.fn(async (all: RunViewParams[]) => Promise.all(all.map(answer)));
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: vi.fn(answer), RunViews: runViews } as unknown as RunView);
    vi.spyOn(AIAgentPermissionHelper, 'HasPermission').mockResolvedValue(true);
    return runViews;
}

/** A provider whose `MJ: Tasks` parent row holds `metadata` and `agentRunID`. */
function providerWithParent(metadata: Record<string, unknown>, agentRunID: string | null = null): IMetadataProvider {
    const parent = { ID: PARENT, Load: vi.fn().mockResolvedValue(true), InputPayload: JSON.stringify(metadata), AgentRunID: agentRunID, SecurityEnvelope: null };
    return { Authorizations: [], AuthorizationRoles: [], GetEntityObject: vi.fn().mockResolvedValue(parent) } as unknown as IMetadataProvider;
}

/** A dispatcher whose own user is `contextUser`, and whose user cache resolves the graph's submitter to `REGULAR_USER`. */
function dispatcher(runner: TaskActionRunner, contextUser: UserInfo): RunTaskBody {
    (globalThis as Record<string, unknown>).___SINGLETON__UserCache = { Users: [REGULAR_USER], FindUser: async () => REGULAR_USER };
    const instance = new TaskGraphDispatcher(
        { CreateProvider: vi.fn() },
        { RunAgentForTask: vi.fn() },
        contextUser,
        { InstanceID: 'inst-authz' },
        undefined,
        undefined,
        runner,
    );
    const run = (instance as unknown as { runTaskBody: RunTaskBody }).runTaskBody;
    return (...args) => run.call(instance, ...args);
}

function actionRunner(): TaskActionRunner & { RunActionForTask: ReturnType<typeof vi.fn> } {
    return { EnforcesSecurityEnvelope: true, RunActionForTask: vi.fn().mockResolvedValue({ Success: true, Output: {} }) };
}

function actionTask(actionID: string): MJTaskEntity {
    return { ID: `T-${actionID.slice(0, 4)}`, Name: 'Step', ParentID: PARENT, ActionID: actionID, ConfigurationObject: null, SecurityEnvelope: null } as unknown as MJTaskEntity;
}

function loopTask(config: Record<string, unknown>): MJTaskEntity {
    return { ID: 'T-loop', Name: 'Loop', ParentID: PARENT, ActionID: UNBOUND, StepType: 'ForEach', ConfigurationObject: config, SecurityEnvelope: null } as unknown as MJTaskEntity;
}

const submittedBy = (extra: Record<string, unknown> = {}) => ({ continuation: 'none', reinvokeDepth: 0, submittedByUserID: REGULAR_USER.ID, ...extra });

afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).___SINGLETON__UserCache;
});

describe('TaskGraphDispatcher action authorization', () => {
    it('does not run an action the execution user is not authorized to run, and reads the authorizations as the dispatcher user', async () => {
        const runViews = stubReads();
        const runner = actionRunner();

        const result = await dispatcher(runner, DISPATCHER_USER)(actionTask(UNBOUND), providerWithParent(submittedBy()), {}, new Map());

        expect(runner.RunActionForTask).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
        expect(runViews).toHaveBeenCalled();
        expect(runViews.mock.calls.every((call) => call[1] === DISPATCHER_USER)).toBe(true);
    });

    it('runs an action bound to the submitting agent and refuses one that is not bound', async () => {
        stubReads();
        const runner = actionRunner();
        const run = dispatcher(runner, DISPATCHER_USER);
        const provider = providerWithParent(submittedBy({ submittedByAgentRunID: AGENT_RUN }), AGENT_RUN);

        const bound = await run(actionTask(BOUND), provider, {}, new Map());
        const unbound = await run(actionTask(UNBOUND), provider, {}, new Map());

        expect(bound.Success).toBe(true);
        expect(unbound.Success).toBe(false);
        expect(unbound.ErrorMessage).toContain(UNBOUND);
        expect(runner.RunActionForTask).toHaveBeenCalledTimes(1);
        expect(runner.RunActionForTask.mock.calls[0][0].ActionID).toBe(BOUND);
    });

    it('runs the action of the durable entity-action binding that submitted the graph and refuses any other action', async () => {
        stubReads();
        const runner = actionRunner();
        const run = dispatcher(runner, DISPATCHER_USER);
        const provider = providerWithParent(submittedBy({ submittedByEntityActionID: ENTITY_ACTION }));

        const bound = await run(actionTask(BOUND), provider, {}, new Map());
        const unbound = await run(actionTask(UNBOUND), provider, {}, new Map());

        expect(bound.Success).toBe(true);
        expect(unbound.Success).toBe(false);
        expect(runner.RunActionForTask).toHaveBeenCalledTimes(1);
        expect(runner.RunActionForTask.mock.calls[0][0].ActionID).toBe(BOUND);
    });

    it('does not run a loop body action the execution user is not authorized to run', async () => {
        stubReads();
        const runner = actionRunner();

        const result = await dispatcher(runner, REGULAR_USER)(
            loopTask({ forEach: { collectionPath: 'payload.items', action: { name: 'Unbound', params: {} } } }),
            providerWithParent(submittedBy()),
            { items: [1] },
            new Map(),
        );

        expect(runner.RunActionForTask).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
    });

    it('does not run a multi-step loop step the execution user is not authorized to run', async () => {
        stubReads();
        const runner = actionRunner();

        const result = await dispatcher(runner, REGULAR_USER)(
            loopTask({
                stepActionIds: { Unbound: UNBOUND },
                forEach: { collectionPath: 'payload.items', steps: [{ id: 'only', name: 'Unbound', params: {} }] },
            }),
            providerWithParent(submittedBy()),
            { items: [1] },
            new Map(),
        );

        expect(runner.RunActionForTask).not.toHaveBeenCalled();
        expect(result.Success).toBe(false);
    });
});
