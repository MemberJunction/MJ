/**
 * BaseAgent's handling of a run's audience (`ExecuteAgentParams.Audience`): hydrating the reader IDs from the
 * server's user cache (refreshing it once for an unknown ID, then refusing), stamping the readers on every action
 * dispatch, locking out an action the engine refused for the audience, and the paths that are skipped or refused
 * under one (carry-forward, data preloading, task graphs, realtime sessions).
 *
 * The user cache, the audience helpers and the BaseAgent logic are real; the action engine, the metadata engine
 * and the data preloader are the boundaries. Full-run behaviour (a refused run never prompts; the dispatch and the
 * task-graph withholding inside a real loop) is in base-agent-loop.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { IMetadataProvider } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import type { AgentAction, AgentRunAudience, BaseAgentNextStep, ExecuteAgentParams, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import type { ActionResult, MJActionEntityExtended, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    return { ...actual, LogError: vi.fn(), LogStatus: vi.fn(), LogStatusEx: vi.fn(), LogErrorEx: vi.fn(), IsVerboseLoggingEnabled: vi.fn(() => false) };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: async (): Promise<void> => undefined, Agents: [], AgentRelationships: [], AgentActions: [],
                GetSubAgents: (): unknown[] => [], GetClientToolsForAgent: (): unknown[] => [],
            };
        },
    },
}));

const h = vi.hoisted(() => ({
    /** Every RunActionParams the mocked engine received. */
    dispatched: [] as Array<Record<string, unknown>>,
    /** What the mocked engine answers. */
    answer: { Success: true, ResultCode: 'SUCCESS', Message: 'ok' } as Record<string, unknown>,
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
    ActionEngineServer: {
        get Instance() {
            return {
                RunAction: async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
                    h.dispatched.push(input);
                    return { ...h.answer, Params: [], RunParams: input };
                },
            };
        },
    },
}));

import { BaseAgent, CircuitBreakerActionResult } from '../base-agent';
import { AgentDataPreloader } from '../AgentDataPreloader';

const CALLER_ID = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const READER_ID = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const LATE_ID = 'aaaaaaaa-0000-4000-8000-0000000000d1';
const UNKNOWN_ID = 'aaaaaaaa-0000-4000-8000-0000000000e1';

const userOf = (ID: string, Name: string): UserInfo => new UserInfo(undefined, { ID, Name, Email: `${Name.toLowerCase()}@test.mj`, UserRoles: [] });
const CALLER = userOf(CALLER_ID, 'Caller');
const READER = userOf(READER_ID, 'Reader');
const LATE = userOf(LATE_ID, 'Late');

/** A provider that IS a database provider for the refresh's `instanceof` check, and does nothing else. */
const DB_PROVIDER = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase;

const AGENT = { ID: 'aaaaaaaa-0000-4000-8000-0000000000a1', Name: 'Room Agent' } as unknown as MJAIAgentEntityExtended;
const ACTION_ENTITY = { ID: 'aaaaaaaa-0000-4000-8000-0000000000f1', Name: 'Calculate Expression', Params: { Items: [] } } as unknown as MJActionEntityExtended;
const ACTION: AgentAction = { name: 'Calculate Expression', params: { Expression: '1+1' } };

function paramsWith(audience?: AgentRunAudience, extra: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: AGENT,
        conversationMessages: [{ role: 'user', content: 'hello room' }],
        contextUser: CALLER,
        provider: DB_PROVIDER as unknown as IMetadataProvider,
        ...(audience ? { Audience: audience } : {}),
        ...extra,
    };
}

/** The private members these tests reach (the keyhole pattern of the other BaseAgent suites). */
interface AudienceInternals {
    _audienceReaders: UserInfo[] | undefined;
    _fatalActionFailures: Set<string>;
    _audienceLockedActions: Set<string>;
    _depth: number;
    _agentRun: { Status: string; ErrorMessage: string | null; Save: () => Promise<boolean> } | null;
    audienceReadersFor(params: ExecuteAgentParams): Promise<{ Readers: UserInfo[] } | { Error: string }>;
    failRunAtStart(message: string, params: ExecuteAgentParams): Promise<never>;
    injectPriorTurnToolResults(params: ExecuteAgentParams): Promise<void>;
    loadPriorTurnToolResultSteps(params: ExecuteAgentParams): Promise<unknown[]>;
    preloadAgentData(params: ExecuteAgentParams): Promise<void>;
    withoutTaskGraphs(promptParams: Record<string, unknown>): Record<string, unknown>;
    executeTasksStep(params: ExecuteAgentParams, previous: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    createStepEntity(input: Record<string, unknown>): Promise<unknown>;
    finalizeStepEntity(step: unknown, success: boolean, errorMessage?: string, outputData?: unknown): Promise<void>;
    sessionAudienceRefusal(params: ExecuteAgentParams): string | null;
    executeClientToolsStep(params: ExecuteAgentParams, config: unknown, previous: BaseAgentNextStep, stepCount?: number): Promise<BaseAgentNextStep>;
    executePromptStep(...args: unknown[]): Promise<BaseAgentNextStep>;
    callerContextSections(
        agent: MJAIAgentEntityExtended, extraData: Record<string, unknown> | undefined, withhold: boolean
    ): { clientToolDetails: string; appContext: string };
    promptWithholding(params: ExecuteAgentParams): { TaskGraphs: boolean; CallerContext: boolean };
    processMemoryWritesForTurn(writes: unknown[], params: ExecuteAgentParams): Promise<void>;
    executeMemoryWritesAsSteps(writes: unknown[], params: ExecuteAgentParams): Promise<unknown[]>;
    raiseFeedbackRequest(params: ExecuteAgentParams, step: unknown, decision: BaseAgentNextStep): Promise<void>;
    createFeedbackRequest(params: ExecuteAgentParams, step: unknown, decision: BaseAgentNextStep): Promise<void>;
}

const internalsOf = (agent: BaseAgent): AudienceInternals => agent as unknown as AudienceInternals;

describe('BaseAgent — run audience', () => {
    let agent: BaseAgent;
    let internals: AudienceInternals;

    beforeEach(() => {
        UserCache.Instance.SetUsers([CALLER, READER]);
        h.dispatched.length = 0;
        h.answer = { Success: true, ResultCode: 'SUCCESS', Message: 'ok' };
        agent = new BaseAgent();
        internals = internalsOf(agent);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        UserCache.Instance.SetUsers([]);
    });

    describe('hydration', () => {
        it('hydrates known IDs from the user cache: the readers beyond the caller, each once, as the cached users', async () => {
            const refresh = vi.spyOn(UserCache.Instance, 'Refresh');
            const result = await internals.audienceReadersFor(paramsWith({ Mode: 'Intersection', UserIDs: [READER_ID.toUpperCase(), CALLER_ID, READER_ID] }));
            expect(result).toEqual({ Readers: [READER] });
            expect('Readers' in result && result.Readers[0]).toBe(READER);
            expect(refresh).not.toHaveBeenCalled();
        });

        it('hydrates once per audience: the same Audience is served from the run state, a different one is loaded again', async () => {
            const audience: AgentRunAudience = { Mode: 'Intersection', UserIDs: [READER_ID] };
            const resolve = vi.spyOn(agent as unknown as { ResolveAudienceUsers: () => Promise<UserInfo[]> }, 'ResolveAudienceUsers');
            await internals.audienceReadersFor(paramsWith(audience));
            await internals.audienceReadersFor(paramsWith(audience));
            expect(resolve).toHaveBeenCalledTimes(1);
            await internals.audienceReadersFor(paramsWith({ Mode: 'Intersection', UserIDs: [READER_ID] }));
            expect(resolve).toHaveBeenCalledTimes(2);
        });

        it('refreshes the user cache once for an unknown ID, and finds a user created since it loaded', async () => {
            const refresh = vi.spyOn(UserCache.Instance, 'Refresh').mockImplementation(async () => UserCache.Instance.SetUsers([CALLER, READER, LATE]));
            const result = await internals.audienceReadersFor(paramsWith({ Mode: 'Intersection', UserIDs: [READER_ID, LATE_ID] }));
            expect(refresh).toHaveBeenCalledOnce();
            expect(refresh).toHaveBeenCalledWith(DB_PROVIDER);
            expect(result).toEqual({ Readers: [READER, LATE] });
        });

        it('refuses an ID still unknown after the refresh, naming it', async () => {
            const refresh = vi.spyOn(UserCache.Instance, 'Refresh').mockResolvedValue(undefined);
            const result = await internals.audienceReadersFor(paramsWith({ Mode: 'Intersection', UserIDs: [READER_ID, UNKNOWN_ID] }));
            expect(refresh).toHaveBeenCalledOnce();
            expect(result).toEqual({ Error: expect.stringContaining(UNKNOWN_ID) });
            expect(internals._audienceReaders).toBeUndefined();
        });

        it.each<[string, unknown]>([
            ['an empty Intersection', { Mode: 'Intersection', UserIDs: [] }],
            ['an Intersection with a blank ID', { Mode: 'Intersection', UserIDs: [READER_ID, ' '] }],
            ['a Caller audience with IDs', { Mode: 'Caller', UserIDs: [READER_ID] }],
            ['an unknown Mode', { Mode: 'Union', UserIDs: [READER_ID] }],
        ])('refuses %s without looking anyone up', async (_label, audience) => {
            const refresh = vi.spyOn(UserCache.Instance, 'Refresh');
            const result = await internals.audienceReadersFor(paramsWith(audience as AgentRunAudience));
            expect(result).toEqual({ Error: expect.stringMatching(/^Invalid Audience: /) });
            expect(refresh).not.toHaveBeenCalled();
        });

        it('treats an Intersection whose only reader is the caller exactly as Caller: no readers, no lookup', async () => {
            const resolve = vi.spyOn(agent as unknown as { ResolveAudienceUsers: () => Promise<UserInfo[]> }, 'ResolveAudienceUsers');
            expect(await internals.audienceReadersFor(paramsWith({ Mode: 'Intersection', UserIDs: [CALLER_ID.toUpperCase()] }))).toEqual({ Readers: [] });
            expect(await internals.audienceReadersFor(paramsWith({ Mode: 'Caller', UserIDs: [] }))).toEqual({ Readers: [] });
            expect(resolve).not.toHaveBeenCalled();
        });

        it('fails the run at its start as a refused permission does: the run is saved Failed with the message, then it throws', async () => {
            const save = vi.fn(async () => true);
            internals._agentRun = { Status: 'Running', ErrorMessage: null, Save: save };
            await expect(internals.failRunAtStart(`Audience names user ID(s) that match no user: ${UNKNOWN_ID}.`, paramsWith())).rejects.toThrow(UNKNOWN_ID);
            expect(internals._agentRun).toMatchObject({ Status: 'Failed', ErrorMessage: expect.stringContaining(UNKNOWN_ID) });
            expect(save).toHaveBeenCalledOnce();
        });
    });

    describe('action dispatch (ExecuteSingleAction)', () => {
        const dispatch = (params: ExecuteAgentParams, skipCircuitBreaker = false): Promise<ActionResult> =>
            agent.ExecuteSingleAction(params, ACTION, ACTION_ENTITY, CALLER, { skipCircuitBreaker });
        const lastDispatch = (): Partial<RunActionParams> => h.dispatched[h.dispatched.length - 1] as Partial<RunActionParams>;

        it('hydrates lazily and stamps RunActionParams.Audience with the readers beyond the caller', async () => {
            await dispatch(paramsWith({ Mode: 'Intersection', UserIDs: [CALLER_ID, READER_ID] }));
            expect(lastDispatch().Audience).toEqual({ Readers: [READER] });
        });

        it('sets no Audience without one, or when it adds nobody beyond the caller', async () => {
            await dispatch(paramsWith());
            expect(lastDispatch().Audience).toBeUndefined();
            await dispatch(paramsWith({ Mode: 'Intersection', UserIDs: [CALLER_ID] }));
            expect(lastDispatch().Audience).toBeUndefined();
        });

        it('puts the audience on the dispatch only — never on the shared action context', async () => {
            const context: Record<string, unknown> = {};
            await dispatch(paramsWith({ Mode: 'Intersection', UserIDs: [READER_ID] }, { context }));
            expect(Object.keys(context)).not.toContain('Audience');
            expect(JSON.stringify(context)).not.toContain(READER_ID);
        });

        it('refuses the call before the engine when the audience names an unknown user', async () => {
            vi.spyOn(UserCache.Instance, 'Refresh').mockResolvedValue(undefined);
            await expect(dispatch(paramsWith({ Mode: 'Intersection', UserIDs: [UNKNOWN_ID] }))).rejects.toThrow(UNKNOWN_ID);
            expect(h.dispatched).toHaveLength(0);
        });

        it('locks an action out for the run when the engine refuses it for the audience (AUDIENCE_UNSUPPORTED)', async () => {
            h.answer = { Success: false, ResultCode: 'AUDIENCE_UNSUPPORTED', Message: "Action 'Calculate Expression' is not available here" };
            const params = paramsWith({ Mode: 'Intersection', UserIDs: [READER_ID] });
            const refused = await dispatch(params);
            expect(refused.Success).toBe(false);
            expect(internals._audienceLockedActions.has('Calculate Expression')).toBe(true);
            expect(internals._fatalActionFailures.has('Calculate Expression')).toBe(false);

            // Its own breaker reason and message: not available in a shared conversation, never a configuration error.
            const again = await dispatch(params);
            expect(again).toBeInstanceOf(CircuitBreakerActionResult);
            expect((again as CircuitBreakerActionResult).Reason).toBe('audience');
            expect(again.Message).toMatch(/not available in this shared conversation/);
            expect(again.Message).toMatch(/Do not call it again/);
            expect(again.Message).not.toMatch(/configuration or credential/);
            expect(h.dispatched).toHaveLength(1);
        });

        it('when the action runs as someone other than the caller, the caller is a reader and the user it runs as is not', async () => {
            const OTHER = userOf('aaaaaaaa-0000-4000-8000-0000000000f9', 'Other');
            UserCache.Instance.SetUsers([CALLER, READER, OTHER]);
            const params = paramsWith({ Mode: 'Intersection', UserIDs: [READER_ID, OTHER.ID] });
            await agent.ExecuteSingleAction(params, ACTION, ACTION_ENTITY, READER, { skipCircuitBreaker: true });
            expect(lastDispatch().Audience).toEqual({ Readers: [OTHER, CALLER] });
            // Control: run as the caller, the readers are the audience's, the caller left out.
            await agent.ExecuteSingleAction(params, ACTION, ACTION_ENTITY, CALLER, { skipCircuitBreaker: true });
            expect(lastDispatch().Audience).toEqual({ Readers: [READER, OTHER] });
        });

        it('a run with no reader stays without one, whoever the action runs as', async () => {
            await agent.ExecuteSingleAction(paramsWith(), ACTION, ACTION_ENTITY, READER, { skipCircuitBreaker: true });
            expect(lastDispatch().Audience).toBeUndefined();
        });

        it('leaves the breaker alone for a caller that does its own accounting (skipCircuitBreaker)', async () => {
            h.answer = { Success: false, ResultCode: 'AUDIENCE_UNSUPPORTED', Message: 'refused' };
            await dispatch(paramsWith({ Mode: 'Intersection', UserIDs: [READER_ID] }), true);
            expect(internals._fatalActionFailures.size).toBe(0);
            expect(internals._audienceLockedActions.size).toBe(0);
        });
    });

    describe('paths skipped or refused under an audience', () => {
        const ROOM: AgentRunAudience = { Mode: 'Intersection', UserIDs: [READER_ID] };

        it("does not carry the previous run's tool results forward", async () => {
            internals._depth = 0;
            const load = vi.spyOn(internals, 'loadPriorTurnToolResultSteps').mockResolvedValue([]);
            await internals.injectPriorTurnToolResults(paramsWith(ROOM, { conversationId: 'CONV-1' }));
            expect(load).not.toHaveBeenCalled();
            await internals.injectPriorTurnToolResults(paramsWith({ Mode: 'Intersection', UserIDs: [CALLER_ID] }, { conversationId: 'CONV-1' }));
            expect(load).toHaveBeenCalledOnce();
        });

        it("skips the agent's data-source preload (control: it runs when the only reader is the caller)", async () => {
            const preload = vi.spyOn(AgentDataPreloader.Instance, 'PreloadAgentData')
                .mockResolvedValue({ data: {}, context: {}, payload: {}, failedSources: [] } as never);
            await internals.preloadAgentData(paramsWith(ROOM));
            expect(preload).not.toHaveBeenCalled();
            await internals.preloadAgentData(paramsWith({ Mode: 'Intersection', UserIDs: [CALLER_ID] }));
            expect(preload).toHaveBeenCalledOnce();
        });

        it('withholds task graphs as a copy: enableTaskGraphs off and the tasks section hidden, the input untouched', () => {
            const base = { enableTaskGraphs: true, includeResponseTypeDefinition: { tasks: true, payload: true }, other: 1 };
            const snapshot = JSON.parse(JSON.stringify(base));
            const withheld = internals.withoutTaskGraphs(base);
            expect(withheld).toEqual({ enableTaskGraphs: false, includeResponseTypeDefinition: { tasks: false, payload: true }, other: 1 });
            expect(base).toEqual(snapshot);
        });

        it('refuses a task graph the model writes anyway, before writing a step', async () => {
            const createStep = vi.spyOn(internals, 'createStepEntity');
            const previous = { step: 'Tasks', taskGraph: { spec: { workflowName: 'wf' } }, previousPayload: {} } as unknown as BaseAgentNextStep;
            const next = await internals.executeTasksStep(paramsWith(ROOM), previous);
            expect(next).toMatchObject({ step: 'Failed', terminate: true });
            expect(next.errorMessage).toMatch(/audience/);
            expect(createStep).not.toHaveBeenCalled();
        });

        it("offers no client tools and injects none of the caller's app context (control: both without an audience)", () => {
            const extraData = {
                clientTools: [{ Name: 'NavigateTo', Description: 'Open a view in the browser', InputSchema: {} }],
                appContext: { App: { Name: 'CRM' }, AdditionalContext: { selectedAccount: 'Acme (private)' } },
            };
            expect(internals.promptWithholding(paramsWith(ROOM)).CallerContext).toBe(true);
            expect(internals.promptWithholding(paramsWith()).CallerContext).toBe(false);
            expect(internals.callerContextSections(AGENT, extraData, true)).toEqual({ clientToolDetails: '', appContext: '' });
            const open = internals.callerContextSections(AGENT, extraData, false);
            expect(open.clientToolDetails).toContain('NavigateTo');
            expect(open.appContext).toContain('Acme (private)');
        });

        it('refuses a client-tools step the model emits anyway, before anything reaches the browser', async () => {
            const prompt = vi.spyOn(internals, 'executePromptStep').mockResolvedValue({ step: 'Retry' } as BaseAgentNextStep);
            const previous = { step: 'ClientTools', clientTools: [{ Name: 'NavigateTo', Params: {} }], previousPayload: {} } as unknown as BaseAgentNextStep;
            const next = await internals.executeClientToolsStep(paramsWith(ROOM, { sessionID: 'browser-session' }), {}, previous);
            expect(next).toMatchObject({ step: 'Failed', terminate: true });
            expect(next.errorMessage).toMatch(/Client tools are not available in a run with an audience/);
            expect(prompt).not.toHaveBeenCalled();
        });

        it("saves no memory writes: one skip step, and the model is told why (control: an opted-in agent alone writes)", async () => {
            const writer = { ...AGENT, AllowMemoryWrite: true } as unknown as MJAIAgentEntityExtended;
            const steps: Array<Record<string, unknown>> = [];
            vi.spyOn(internals, 'createStepEntity').mockImplementation(async (input) => { steps.push(input); return {}; });
            vi.spyOn(internals, 'finalizeStepEntity').mockResolvedValue(undefined);
            const write = vi.spyOn(internals, 'executeMemoryWritesAsSteps').mockResolvedValue([]);
            const roomParams = paramsWith(ROOM, { agent: writer });
            await internals.processMemoryWritesForTurn([{ note: 'Acme renewal is at risk', type: 'Context' }], roomParams);
            expect(write).not.toHaveBeenCalled();
            expect(steps.map((s) => s.stepName)).toEqual(['Memory Writes: skipped (shared conversation)']);
            const told = String(roomParams.conversationMessages.at(-1)?.content);
            expect(told).toMatch(/not available in a shared conversation — the requested memories were NOT saved/);

            await internals.processMemoryWritesForTurn([{ note: 'Acme renewal is at risk', type: 'Context' }], paramsWith(undefined, { agent: writer }));
            expect(write).toHaveBeenCalledOnce();
        });

        it('raises no out-of-conversation feedback request (control: a root run with no reader raises one)', async () => {
            internals._depth = 0;
            const create = vi.spyOn(internals, 'createFeedbackRequest').mockResolvedValue(undefined);
            const decision = { step: 'Chat', message: 'Which account?' } as unknown as BaseAgentNextStep;
            await internals.raiseFeedbackRequest(paramsWith(ROOM), {}, decision);
            expect(create).not.toHaveBeenCalled();
            await internals.raiseFeedbackRequest(paramsWith({ Mode: 'Intersection', UserIDs: [CALLER_ID] }), {}, decision);
            expect(create).toHaveBeenCalledOnce();
            internals._depth = 1;
            await internals.raiseFeedbackRequest(paramsWith(), {}, decision);
            expect(create).toHaveBeenCalledOnce();
        });

        it('refuses a session-driven (realtime) run and a bridged session, and lets one with no reader through', async () => {
            expect(internals.sessionAudienceRefusal(paramsWith(ROOM))).toMatch(/session-driven/);
            expect(internals.sessionAudienceRefusal(paramsWith())).toBeNull();
            await expect(agent.StartBridgeRealtimeSession(paramsWith(ROOM))).rejects.toThrow(/session-driven/);
        });
    });
});
