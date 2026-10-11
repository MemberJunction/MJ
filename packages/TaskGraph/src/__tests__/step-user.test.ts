/**
 * Every step of a graph runs as the person who submitted it — never as the dispatcher.
 *
 * The dispatcher runs as the platform's service account, and it used to hand that account to every
 * runner: once a plan existed, each prompt, action and agent step ran with system privileges
 * whoever had asked for it. These pin the rule that replaced that (`resolveStepUser`):
 *
 * - a graph whose parent records another user runs every step as that user, looked up fresh;
 * - a graph the dispatcher's own identity submitted, or one that records no submitter (persisted
 *   before submitters were stamped), runs as the dispatcher, exactly as before;
 * - a recorded submitter who cannot be found, is inactive, or cannot be resolved at all FAILS the
 *   step — it never falls back to the dispatcher, which would be the escalation this removes.
 */
import { describe, it, expect, vi } from 'vitest';
import { UserInfo, type IMetadataProvider } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload } from '../TaskGraphService';
import type {
    TaskActionRunner,
    TaskActionRunParams,
    TaskAgentRunner,
    TaskAgentRunParams,
    TaskPromptRunner,
    TaskPromptRunParams,
    TaskUserResolver,
} from '../types';

const SYSTEM_USER_ID = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
const REQUESTER_ID = 'F1F1F1F1-0000-4000-8000-000000000001';

function user(id: string, name: string, isActive: boolean = true): UserInfo {
    return Object.assign(new UserInfo(), { ID: id, Name: name, IsActive: isActive });
}

const SYSTEM_USER = user(SYSTEM_USER_ID, 'System');
const REQUESTER = user(REQUESTER_ID, 'Ursula UI-Role');

/** What the step bodies these tests drive read off a Task row. */
type StepTask = Pick<MJTaskEntity, 'ID' | 'ParentID' | 'Name' | 'StepType' | 'PromptID' | 'ActionID' | 'AgentID'> & {
    ConfigurationObject: Record<string, unknown> | null;
};

function step(over: Partial<StepTask>): MJTaskEntity {
    const row: StepTask = {
        ID: 'T-1', ParentID: 'P-1', Name: 'Draft the summary', StepType: 'Prompt',
        PromptID: 'PROMPT-1', ActionID: null, AgentID: null, ConfigurationObject: null,
        ...over,
    };
    return row as unknown as MJTaskEntity;
}

/** A provider whose only entity is the graph's parent row; counts how often it is loaded. */
function graphProvider(submittedByUserID: string | null | undefined, loadSucceeds: boolean = true) {
    const bag = submittedByUserID === undefined
        ? null
        : JSON.stringify(BuildTaskGraphParentInputPayload({
            continuation: 'message', reinvokeDepth: 0, failureSemantics: 'block',
            submittedByAgentRunID: null, submittedByUserID, invocation: null,
        }));
    const loads = { count: 0 };
    const parent = {
        InputPayload: bag,
        AgentRunID: null,
        Load: vi.fn(async () => { loads.count++; return loadSucceeds; }),
    };
    const provider = { GetEntityObject: vi.fn().mockResolvedValue(parent) } as unknown as IMetadataProvider;
    return { Provider: provider, Loads: loads, Parent: parent };
}

/** Runners that record the user they were handed. */
function runners() {
    const prompt: TaskPromptRunParams[] = [];
    const action: TaskActionRunParams[] = [];
    const agent: TaskAgentRunParams[] = [];
    const promptRunner: TaskPromptRunner = { RunPromptForTask: async (p) => { prompt.push(p); return { Success: true, Output: {} }; } };
    const actionRunner: TaskActionRunner = { RunActionForTask: async (p) => { action.push(p); return { Success: true, Output: {} }; } };
    const agentRunner: TaskAgentRunner = { RunAgentForTask: async (p) => { agent.push(p); return { Success: true, Output: {} }; } };
    return { promptRunner, actionRunner, agentRunner, Calls: { prompt, action, agent } };
}

type StepRunner = {
    runTaskBody(task: MJTaskEntity, provider: IMetadataProvider, input: unknown, deps: Map<string, unknown>): Promise<{ Success: boolean; ErrorMessage?: string }>;
    forgetGraphObservability(parentTaskID: string): void;
};

function drivesSteps(value: object): value is StepRunner {
    return typeof Reflect.get(value, 'runTaskBody') === 'function'
        && typeof Reflect.get(value, 'forgetGraphObservability') === 'function';
}

/** A dispatcher running as the system user, with only what the step path reads. */
function dispatcher(resolver: TaskUserResolver | undefined, r = runners()) {
    const instance = {
        contextUser: SYSTEM_USER,
        userResolver: resolver,
        promptRunner: r.promptRunner,
        actionRunner: r.actionRunner,
        agentRunner: r.agentRunner,
        stepUserIDByGraph: new Map<string, string | null>(),
        emittedGateVerdicts: new Map<string, Map<string, string>>(),
        nodeProgressLastEmit: new Map<string, Map<string, number>>(),
        announcedPaused: new Map<string, boolean>(),
        debugStateByGraph: new Map<string, unknown>(),
    };
    Object.setPrototypeOf(instance, TaskGraphDispatcher.prototype);
    if (!drivesSteps(instance)) throw new Error('TaskGraphDispatcher no longer has runTaskBody/forgetGraphObservability.');
    return { Dispatcher: instance, Calls: r.Calls };
}

/** A resolver that knows the given users and records every lookup. */
function resolverFor(...known: UserInfo[]): TaskUserResolver & { Lookups: string[] } {
    const lookups: string[] = [];
    return {
        Lookups: lookups,
        FindUserByID: async (id: string) => { lookups.push(id); return known.find((u) => u.ID === id); },
    };
}

describe('graph steps run as the person who submitted the graph', () => {
    it('hands a Prompt step the submitter, not the dispatcher', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor(REQUESTER));

        const outcome = await Dispatcher.runTaskBody(step({ StepType: 'Prompt' }), graphProvider(REQUESTER_ID).Provider, null, new Map());

        expect(outcome.Success).toBe(true);
        expect(Calls.prompt[0].ContextUser).toBe(REQUESTER);
    });

    it('hands an Action step the submitter', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor(REQUESTER));

        await Dispatcher.runTaskBody(
            step({ StepType: 'Action', PromptID: null, ActionID: 'ACTION-1' }), graphProvider(REQUESTER_ID).Provider, null, new Map(),
        );

        expect(Calls.action[0].ContextUser).toBe(REQUESTER);
    });

    it('hands an Agent step the submitter', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor(REQUESTER));

        await Dispatcher.runTaskBody(
            step({ StepType: 'Agent', PromptID: null, AgentID: 'AGENT-1' }), graphProvider(REQUESTER_ID).Provider, null, new Map(),
        );

        expect(Calls.agent[0].ContextUser).toBe(REQUESTER);
    });

    it('hands every pass of a loop body the submitter', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor(REQUESTER));
        const loop = step({
            StepType: 'ForEach', PromptID: null, ActionID: 'ACTION-1',
            ConfigurationObject: { forEach: { collectionPath: 'payload.items', itemVariable: 'item', action: { name: 'Echo', params: {} } } },
        });

        await Dispatcher.runTaskBody(loop, graphProvider(REQUESTER_ID).Provider, { items: [1, 2, 3] }, new Map());

        expect(Calls.action).toHaveLength(3);
        expect(Calls.action.every((c) => c.ContextUser === REQUESTER)).toBe(true);
    });
});

describe('graphs that name no one else still run as the dispatcher', () => {
    it('runs a graph the dispatcher\'s own identity submitted as the dispatcher, without a lookup', async () => {
        const resolver = resolverFor(REQUESTER);
        const { Dispatcher, Calls } = dispatcher(resolver);

        // A schedule or another platform job submits as the service account; the casing differs on
        // purpose — SQL Server and PostgreSQL disagree on it.
        await Dispatcher.runTaskBody(step({}), graphProvider(SYSTEM_USER_ID.toLowerCase()).Provider, null, new Map());

        expect(Calls.prompt[0].ContextUser).toBe(SYSTEM_USER);
        expect(resolver.Lookups).toEqual([]);
    });

    it('runs a graph persisted before submitters were recorded as the dispatcher', async () => {
        const resolver = resolverFor(REQUESTER);
        const { Dispatcher, Calls } = dispatcher(resolver);

        await Dispatcher.runTaskBody(step({}), graphProvider(undefined).Provider, null, new Map());

        expect(Calls.prompt[0].ContextUser).toBe(SYSTEM_USER);
        expect(resolver.Lookups).toEqual([]);
    });

    it('runs a graph whose submitter is recorded as null as the dispatcher', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor(REQUESTER));

        await Dispatcher.runTaskBody(step({}), graphProvider(null).Provider, null, new Map());

        expect(Calls.prompt[0].ContextUser).toBe(SYSTEM_USER);
    });

    it('runs a task with no graph parent as the dispatcher, without reading anything', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor(REQUESTER));
        const { Provider, Loads } = graphProvider(REQUESTER_ID);

        await Dispatcher.runTaskBody(step({ ParentID: null }), Provider, null, new Map());

        expect(Calls.prompt[0].ContextUser).toBe(SYSTEM_USER);
        expect(Loads.count).toBe(0);
    });
});

describe('a submitter who cannot act fails the step instead of escalating', () => {
    it('fails when the submitter no longer exists, and runs nothing', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor());

        const outcome = await Dispatcher.runTaskBody(step({}), graphProvider(REQUESTER_ID).Provider, null, new Map());

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toContain(REQUESTER_ID);
        expect(outcome.ErrorMessage).toMatch(/could not be found/);
        expect(Calls.prompt).toHaveLength(0);
    });

    it('fails when the submitter is inactive', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor(user(REQUESTER_ID, 'Gone Person', false)));

        const outcome = await Dispatcher.runTaskBody(step({}), graphProvider(REQUESTER_ID).Provider, null, new Map());

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toMatch(/inactive/);
        expect(Calls.prompt).toHaveLength(0);
    });

    it('fails when this host has no way to look users up', async () => {
        const { Dispatcher, Calls } = dispatcher(undefined);

        const outcome = await Dispatcher.runTaskBody(step({}), graphProvider(REQUESTER_ID).Provider, null, new Map());

        expect(outcome.Success).toBe(false);
        expect(outcome.ErrorMessage).toMatch(/no way to look users up/);
        expect(Calls.prompt).toHaveLength(0);
    });

    it('fails when the lookup throws, rather than reading the throw as permission', async () => {
        const throwing: TaskUserResolver = { FindUserByID: async () => { throw new Error('cache offline'); } };
        const { Dispatcher, Calls } = dispatcher(throwing);

        const outcome = await Dispatcher.runTaskBody(step({}), graphProvider(REQUESTER_ID).Provider, null, new Map());

        expect(outcome.Success).toBe(false);
        expect(Calls.prompt).toHaveLength(0);
    });

    it('fails when the graph cannot be read, and asks again on the next step', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor(REQUESTER));
        const unreadable = graphProvider(REQUESTER_ID, false);

        const first = await Dispatcher.runTaskBody(step({}), unreadable.Provider, null, new Map());
        const second = await Dispatcher.runTaskBody(step({ ID: 'T-2' }), unreadable.Provider, null, new Map());

        expect(first.Success).toBe(false);
        expect(first.ErrorMessage).toMatch(/could not be read/);
        expect(second.Success).toBe(false);
        expect(unreadable.Loads.count).toBe(2);
        expect(Calls.prompt).toHaveLength(0);
    });

    it('treats a hand-edited empty submitter as someone to find, not as "no submitter"', async () => {
        const { Dispatcher, Calls } = dispatcher(resolverFor(REQUESTER));

        const outcome = await Dispatcher.runTaskBody(step({}), graphProvider('').Provider, null, new Map());

        expect(outcome.Success).toBe(false);
        expect(Calls.prompt).toHaveLength(0);
    });
});

describe('the submitter is read once per graph, the user once per step', () => {
    it('reads the graph once for two steps, and looks the user up for each', async () => {
        const resolver = resolverFor(REQUESTER);
        const { Dispatcher } = dispatcher(resolver);
        const { Provider, Loads } = graphProvider(REQUESTER_ID);

        await Dispatcher.runTaskBody(step({ ID: 'T-1' }), Provider, null, new Map());
        await Dispatcher.runTaskBody(step({ ID: 'T-2' }), Provider, null, new Map());

        expect(Loads.count).toBe(1);
        // Looked up per step, so a deactivation or role change applies at the next step.
        expect(resolver.Lookups).toEqual([REQUESTER_ID, REQUESTER_ID]);
    });

    it('stops a graph whose submitter is deactivated between two steps', async () => {
        const active = user(REQUESTER_ID, 'Ursula');
        const resolver = resolverFor(active);
        const { Dispatcher, Calls } = dispatcher(resolver);
        const { Provider } = graphProvider(REQUESTER_ID);

        const first = await Dispatcher.runTaskBody(step({ ID: 'T-1' }), Provider, null, new Map());
        active.IsActive = false;
        const second = await Dispatcher.runTaskBody(step({ ID: 'T-2' }), Provider, null, new Map());

        expect(first.Success).toBe(true);
        expect(second.Success).toBe(false);
        expect(Calls.prompt).toHaveLength(1);
    });

    it('forgets the graph once it settles, so a revived graph is read again', async () => {
        const { Dispatcher } = dispatcher(resolverFor(REQUESTER));
        const { Provider, Loads } = graphProvider(REQUESTER_ID);

        await Dispatcher.runTaskBody(step({}), Provider, null, new Map());
        Dispatcher.forgetGraphObservability('P-1');
        await Dispatcher.runTaskBody(step({ ID: 'T-2' }), Provider, null, new Map());

        expect(Loads.count).toBe(2);
    });
});
