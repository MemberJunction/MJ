import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseProviderBase, UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import {
    AgentUserPolicyEngine,
    CreateScopeCommonReachAudience,
    TASK_SECURITY_ENVELOPE_VERSION,
    TAINTED_EGRESS_BLOCKED,
    type AgentAction,
    type AgentRunAudience,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type MJAIAgentEntityExtended,
    type MJAIAgentUserPolicyEntity,
    type TaskSecurityEnvelope,
} from '@memberjunction/ai-core-plus';
import {
    AUDIENCE_UNSUPPORTED_RESULT_CODE,
    type ActionResult,
    type MJActionEntityExtended,
    type RunActionParams,
} from '@memberjunction/actions-base';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogStatusEx: vi.fn(),
        LogErrorEx: vi.fn(),
        IsVerboseLoggingEnabled: vi.fn(() => false),
    };
});

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        get Instance() {
            return {
                Config: async (): Promise<void> => undefined,
                Agents: [],
                AgentRelationships: [],
                AgentActions: [],
                GetSubAgents: (): never[] => [],
                GetClientToolsForAgent: (): never[] => [],
            };
        },
    },
}));

const actionHarness = vi.hoisted(() => ({
    dispatched: [] as RunActionParams[],
    answer: { Success: true, ResultCode: 'SUCCESS', Message: 'ok' } as { Success: boolean; ResultCode: string; Message: string },
}));

vi.mock('@memberjunction/actions', () => {
    class MockBaseAction {
        public get SupportsAudience(): boolean {
            return false;
        }
    }
    return {
        BaseAction: MockBaseAction,
        ActionEngineServer: {
            get Instance() {
                return {
                    RunAction: async (input: RunActionParams): Promise<ActionResult> => {
                        actionHarness.dispatched.push(input);
                        return {
                            Success: actionHarness.answer.Success,
                            ResultCode: actionHarness.answer.ResultCode,
                            Message: actionHarness.answer.Message,
                            Params: [],
                            RunParams: input,
                            LogEntry: undefined,
                            Result: undefined,
                        };
                    },
                };
            },
        },
    };
});

import { BaseAction } from '@memberjunction/actions';
import { BaseAgent, CircuitBreakerActionResult } from '../base-agent';
import { AgentDataPreloader } from '../AgentDataPreloader';
import { AgentAudienceAddsReader, AgentAudienceProblem, AgentAudienceReaderIDs } from '../agent-audience';

@RegisterClass(BaseAction, '__Test_AudienceAwareSearch')
class AudienceAwareTestAction extends BaseAction {
    public override get SupportsAudience(): boolean {
        return true;
    }
}

@RegisterClass(BaseAction, '__Test_NonAudienceAction')
class NonAudienceTestAction extends BaseAction {
    public override get SupportsAudience(): boolean {
        return false;
    }
}

const CALLER_ID = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const READER_ID = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const AGENT_ID = 'aaaaaaaa-0000-4000-8000-0000000000a1';

const makeUser = (ID: string, Name: string): UserInfo =>
    new UserInfo(undefined, { ID, Name, Email: `${Name.toLowerCase()}@test.mj`, UserRoles: [] });

const CALLER = makeUser(CALLER_ID, 'Caller');
const READER = makeUser(READER_ID, 'Reader');

const DB_PROVIDER = Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase & {
    RunView: () => Promise<{ Success: boolean; Results: never[]; RowCount: number; TotalRowCount: number; ExecutionTime: number }>;
};
DB_PROVIDER.RunView = async () => ({
    Success: true,
    Results: [],
    RowCount: 0,
    TotalRowCount: 0,
    ExecutionTime: 0,
});

const AGENT = { ID: AGENT_ID, Name: 'Workspace Common Reach Agent' } as MJAIAgentEntityExtended;

function makeActionEntity(overrides: Partial<MJActionEntityExtended> = {}): MJActionEntityExtended {
    return {
        ID: 'aaaaaaaa-0000-4000-8000-0000000000f1',
        Name: 'Scoped Search',
        DriverClass: '__Test_AudienceAwareSearch',
        Type: 'Custom',
        Params: { Items: [] },
        Config_Object: null,
        ...overrides,
    } as MJActionEntityExtended;
}

function makeParams(audience?: AgentRunAudience, extra: Partial<ExecuteAgentParams> = {}): ExecuteAgentParams {
    return {
        agent: AGENT,
        conversationMessages: [{ role: 'user', content: 'search shared workspace' }],
        contextUser: CALLER,
        provider: DB_PROVIDER as IMetadataProvider,
        PrimaryScopeEntityName: 'Workspaces',
        PrimaryScopeRecordID: 'ws-1m-readers',
        ...(audience ? { Audience: audience } : {}),
        ...extra,
    };
}

interface BaseAgentAudienceInternals {
    _audienceReaders: UserInfo[] | undefined;
    _audienceLockedActions: Set<string>;
    _depth: number;
    audienceReadersFor(params: ExecuteAgentParams): Promise<{ Readers: UserInfo[] } | { Error: string }>;
    injectPriorTurnToolResults(params: ExecuteAgentParams): Promise<void>;
    loadPriorTurnToolResultSteps(params: ExecuteAgentParams): Promise<unknown[]>;
    preloadAgentData(params: ExecuteAgentParams): Promise<void>;
    executeTasksStep(params: ExecuteAgentParams, previous: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    createStepEntity(input: Record<string, unknown>): Promise<Record<string, unknown>>;
    finalizeStepEntity(step: Record<string, unknown>, success: boolean): Promise<void>;
    sessionAudienceRefusal(params: ExecuteAgentParams): string | null;
    executeClientToolsStep(params: ExecuteAgentParams, config: Record<string, unknown>, previous: BaseAgentNextStep): Promise<BaseAgentNextStep>;
    callerContextSections(
        agent: MJAIAgentEntityExtended,
        extraData: Record<string, unknown> | undefined,
        withhold: boolean
    ): { clientToolDetails: string; appContext: string };
    promptWithholding(params: ExecuteAgentParams): { TaskGraphs: boolean; CallerContext: boolean };
    processMemoryWritesForTurn(writes: Array<{ note: string; type: string }>, params: ExecuteAgentParams): Promise<void>;
    executeMemoryWritesAsSteps(writes: Array<{ note: string; type: string }>, params: ExecuteAgentParams): Promise<unknown[]>;
    raiseFeedbackRequest(params: ExecuteAgentParams, step: Record<string, unknown>, decision: BaseAgentNextStep): Promise<void>;
    createFeedbackRequest(params: ExecuteAgentParams, step: Record<string, unknown>, decision: BaseAgentNextStep): Promise<void>;
    taskGraphSecurityEnvelope(params: ExecuteAgentParams): { Envelope: TaskSecurityEnvelope | undefined } | { Refusal: string };
}

function getInternals(agent: BaseAgent): BaseAgentAudienceInternals {
    return agent as unknown as BaseAgentAudienceInternals;
}

describe('MJ-1 Structural Audience Common-Reach Mode', () => {
    let agent: BaseAgent;
    let internals: BaseAgentAudienceInternals;

    beforeEach(() => {
        // Force ClassFactory retention for test drivers
        void AudienceAwareTestAction;
        void NonAudienceTestAction;
        expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseAction, '__Test_AudienceAwareSearch')).toBeDefined();
        expect(MJGlobal.Instance.ClassFactory.GetRegistration(BaseAction, '__Test_NonAudienceAction')).toBeDefined();

        UserCache.Instance.SetUsers([CALLER, READER]);
        AgentUserPolicyEngine.Instance.ClearCache();
        actionHarness.dispatched.length = 0;
        actionHarness.answer = { Success: true, ResultCode: 'SUCCESS', Message: 'ok' };
        agent = new BaseAgent();
        internals = getInternals(agent);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        AgentUserPolicyEngine.Instance.ClearCache();
        UserCache.Instance.SetUsers([]);
    });

    describe('audience helper predicates', () => {
        it('accepts ScopeCommonReach, returns zero enumerated IDs, and marks audience as active', () => {
            const structural = CreateScopeCommonReachAudience();
            expect(AgentAudienceProblem(structural)).toBeNull();
            expect(AgentAudienceProblem({ Mode: 'ScopeCommonReach' })).toBeNull();
            expect(AgentAudienceReaderIDs(structural, CALLER_ID)).toEqual([]);
            expect(AgentAudienceAddsReader(structural, CALLER_ID)).toBe(true);
        });

        it('preserves fail-closed validation on empty Intersection vs ScopeCommonReach', () => {
            const emptyIntersection: AgentRunAudience = { Mode: 'Intersection', UserIDs: [] };
            expect(AgentAudienceProblem(emptyIntersection)).toMatch(/at least one ID/);
            expect(AgentAudienceAddsReader(emptyIntersection, CALLER_ID)).toBe(true);
        });
    });

    describe('O(1) startup without reader enumeration', () => {
        it('initializes ScopeCommonReach in O(1) with zero ResolveAudienceUsers or UserCache.Refresh calls', async () => {
            // Empty UserCache simulates avoiding loading/scanning 1M workspace readers
            UserCache.Instance.SetUsers([]);
            const refreshSpy = vi.spyOn(UserCache.Instance, 'Refresh');
            const resolveSpy = vi.spyOn(
                agent as unknown as { ResolveAudienceUsers: () => Promise<UserInfo[]> },
                'ResolveAudienceUsers'
            );

            const result = await internals.audienceReadersFor(makeParams({ Mode: 'ScopeCommonReach' }));
            expect(result).toEqual({ Readers: [] });
            expect(resolveSpy).not.toHaveBeenCalled();
            expect(refreshSpy).not.toHaveBeenCalled();
        });

        it('emits constant-size ScopeCommonReach metadata in TaskSecurityEnvelope without reader IDs', () => {
            const envelopeResult = internals.taskGraphSecurityEnvelope(makeParams({ Mode: 'ScopeCommonReach' }));
            expect('Envelope' in envelopeResult).toBe(true);
            if ('Envelope' in envelopeResult) {
                expect(envelopeResult.Envelope?.Audience).toEqual({ Mode: 'ScopeCommonReach' });
                const serialized = JSON.stringify(envelopeResult.Envelope);
                expect(serialized).toContain('ScopeCommonReach');
                expect(serialized).not.toContain(READER_ID);
            }
        });

        it('still fails closed on { Mode: Intersection, UserIDs: [] } without touching UserCache', async () => {
            const refreshSpy = vi.spyOn(UserCache.Instance, 'Refresh');
            const result = await internals.audienceReadersFor(makeParams({ Mode: 'Intersection', UserIDs: [] }));
            expect(result).toEqual({ Error: expect.stringMatching(/^Invalid Audience: /) });
            expect(refreshSpy).not.toHaveBeenCalled();
        });

        it('fails closed when ScopeCommonReach is supplied without a constraining run scope', async () => {
            const unscopedParams = makeParams(
                { Mode: 'ScopeCommonReach' },
                { PrimaryScopeEntityName: undefined, PrimaryScopeRecordID: undefined, SecondaryScopes: undefined, SearchScopeIDs: undefined }
            );
            const result = await internals.audienceReadersFor(unscopedParams);
            expect(result).toEqual({ Error: expect.stringMatching(/requires a constraining run scope/) });
            await expect(
                agent.ExecuteSingleAction(unscopedParams, { name: 'Scoped Search', params: { Query: 'q' } }, makeActionEntity(), CALLER)
            ).rejects.toThrow(/requires a constraining run scope/);
            expect(actionHarness.dispatched).toHaveLength(0);
        });

        it('accepts ScopeCommonReach when SecondaryScopes or SearchScopeIDs constrains the run without PrimaryScopeRecordID', async () => {
            const withSecondary = makeParams(
                { Mode: 'ScopeCommonReach' },
                { PrimaryScopeEntityName: undefined, PrimaryScopeRecordID: undefined, SecondaryScopes: { WorkspaceID: 'ws-1' } }
            );
            expect(await internals.audienceReadersFor(withSecondary)).toEqual({ Readers: [] });

            const agentWithSearchScopes = new BaseAgent();
            const withSearchScopes = makeParams(
                { Mode: 'ScopeCommonReach' },
                { PrimaryScopeEntityName: undefined, PrimaryScopeRecordID: undefined, SearchScopeIDs: ['scope-1'] }
            );
            expect(await getInternals(agentWithSearchScopes).audienceReadersFor(withSearchScopes)).toEqual({ Readers: [] });
        });
    });

    describe('unconditional enforcement of all non-enumeration audience boundaries', () => {
        const STRUCTURAL_AUDIENCE: AgentRunAudience = { Mode: 'ScopeCommonReach', ScopeAsserted: true };

        it('permits SupportsAudience actions, propagates IsStructuralAudience, and strictly refuses + locks out non-supporting and runtime actions', async () => {
            const searchEntity = makeActionEntity();
            const searchAction: AgentAction = { name: 'Scoped Search', params: { Query: 'q' } };
            const allowedResult = await agent.ExecuteSingleAction(makeParams(STRUCTURAL_AUDIENCE), searchAction, searchEntity, CALLER);
            expect(allowedResult.Success).toBe(true);
            expect(actionHarness.dispatched).toHaveLength(1);
            expect(actionHarness.dispatched[0].IsStructuralAudience).toBe(true);
            expect(actionHarness.dispatched[0].Audience).toBeUndefined();

            const nonAudienceEntity = makeActionEntity({
                ID: 'aaaaaaaa-0000-4000-8000-0000000000f2',
                Name: 'Send Email',
                DriverClass: '__Test_NonAudienceAction',
            });
            const nonAudienceAction: AgentAction = { name: 'Send Email', params: {} };
            const refused = await agent.ExecuteSingleAction(makeParams(STRUCTURAL_AUDIENCE), nonAudienceAction, nonAudienceEntity, CALLER);
            expect(refused.Success).toBe(false);
            expect(refused.ResultCode).toBe(AUDIENCE_UNSUPPORTED_RESULT_CODE);
            expect(internals._audienceLockedActions.has('Send Email')).toBe(true);
            expect(actionHarness.dispatched).toHaveLength(1);

            const lockedRepeat = await agent.ExecuteSingleAction(makeParams(STRUCTURAL_AUDIENCE), nonAudienceAction, nonAudienceEntity, CALLER);
            expect(lockedRepeat).toBeInstanceOf(CircuitBreakerActionResult);
            expect((lockedRepeat as CircuitBreakerActionResult).Reason).toBe('audience');

            const runtimeEntity = makeActionEntity({
                ID: 'aaaaaaaa-0000-4000-8000-0000000000f3',
                Name: 'Runtime Script',
                Type: 'Runtime',
                DriverClass: '__Test_AudienceAwareSearch',
            });
            const runtimeRefused = await agent.ExecuteSingleAction(
                makeParams(STRUCTURAL_AUDIENCE),
                { name: 'Runtime Script', params: {} },
                runtimeEntity,
                CALLER
            );
            expect(runtimeRefused.Success).toBe(false);
            expect(runtimeRefused.ResultCode).toBe(AUDIENCE_UNSUPPORTED_RESULT_CODE);
            expect(actionHarness.dispatched).toHaveLength(1);
        });

        it('memoizes SupportsAudience per SubClass via GetRegistration without repeated BaseAction construction', async () => {
            @RegisterClass(BaseAction, '__Test_MemoizedAudienceSearch')
            class MemoizedAudienceAction extends BaseAction {
                public static ConstructionCount = 0;
                constructor() {
                    super();
                    MemoizedAudienceAction.ConstructionCount++;
                }
                public override get SupportsAudience(): boolean {
                    return true;
                }
            }
            void MemoizedAudienceAction;

            const createSpy = vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance');
            const memoEntity = makeActionEntity({ DriverClass: '__Test_MemoizedAudienceSearch' });
            const unregisteredEntity = makeActionEntity({
                ID: 'aaaaaaaa-0000-4000-8000-0000000000f9',
                Name: 'Unregistered Action',
                DriverClass: '__Test_DoesNotExist',
            });

            await agent.ExecuteSingleAction(makeParams(STRUCTURAL_AUDIENCE), { name: 'Scoped Search', params: { Query: 'q1' } }, memoEntity, CALLER);
            await agent.ExecuteSingleAction(makeParams(STRUCTURAL_AUDIENCE), { name: 'Scoped Search', params: { Query: 'q2' } }, memoEntity, CALLER);
            await agent.ExecuteSingleAction(makeParams(STRUCTURAL_AUDIENCE), { name: 'Unregistered Action', params: {} }, unregisteredEntity, CALLER);

            expect(MemoizedAudienceAction.ConstructionCount).toBe(1);
            expect(createSpy).toHaveBeenCalledTimes(1);
        });

        it('enforces AgentUserPolicyEngine Deny rules even for SupportsAudience actions under ScopeCommonReach', async () => {
            const policy = {
                AgentID: AGENT_ID,
                UserID: CALLER_ID,
                Status: 'Active',
                ActionPolicyRulesObject: [
                    {
                        actionPattern: 'Scoped Search',
                        policy: 'Deny',
                    },
                ],
                EntityAccessRulesObject: [],
            } as unknown as MJAIAgentUserPolicyEntity;
            AgentUserPolicyEngine.Instance.SetCachedPolicy(policy);

            const searchEntity = makeActionEntity();
            const result = await agent.ExecuteSingleAction(
                makeParams(STRUCTURAL_AUDIENCE),
                { name: 'Scoped Search', params: { Query: 'q' } },
                searchEntity,
                CALLER
            );
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe('POLICY_DENIED');
            expect(actionHarness.dispatched).toHaveLength(0);
        });

        it('enforces tainted-egress classification restrictions under ScopeCommonReach', async () => {
            const taintedEnvelope: TaskSecurityEnvelope = {
                Version: TASK_SECURITY_ENVELOPE_VERSION,
                Audience: { Mode: 'ScopeCommonReach' },
                IsRunTainted: true,
            };
            (agent as unknown as { _taintedSources: Array<{ Source: string }> })._taintedSources = [{ Source: 'WebSearch' }];
            const taintedSearchEntity = makeActionEntity({
                Config_Object: { disallowWhenTainted: true, outputTrustLevel: 'Untrusted' },
            });
            const result = await agent.ExecuteSingleAction(
                makeParams(STRUCTURAL_AUDIENCE, { SecurityEnvelope: taintedEnvelope }),
                { name: 'Scoped Search', params: { Query: 'secret' } },
                taintedSearchEntity,
                CALLER
            );
            expect(result.Success).toBe(false);
            expect(result.ResultCode).toBe(TAINTED_EGRESS_BLOCKED);
            expect(actionHarness.dispatched).toHaveLength(0);
        });

        it('skips data preloading, prior tool carry-forward, memory writes, client tools, feedback requests, and realtime sessions', async () => {
            const preloadSpy = vi.spyOn(AgentDataPreloader.Instance, 'PreloadAgentData');
            await internals.preloadAgentData(makeParams(STRUCTURAL_AUDIENCE));
            expect(preloadSpy).not.toHaveBeenCalled();

            internals._depth = 0;
            const loadPriorSpy = vi.spyOn(internals, 'loadPriorTurnToolResultSteps').mockResolvedValue([]);
            await internals.injectPriorTurnToolResults(makeParams(STRUCTURAL_AUDIENCE, { conversationId: 'CONV-1' }));
            expect(loadPriorSpy).not.toHaveBeenCalled();

            expect(internals.promptWithholding(makeParams(STRUCTURAL_AUDIENCE)).CallerContext).toBe(true);
            expect(internals.callerContextSections(AGENT, {
                clientTools: [{ Name: 'NavigateTo', Description: 'Open', InputSchema: {} }],
                appContext: { App: { Name: 'CRM' }, AdditionalContext: { secret: 'x' } },
            }, true)).toEqual({ clientToolDetails: '', appContext: '' });

            const clientStep = await internals.executeClientToolsStep(
                makeParams(STRUCTURAL_AUDIENCE, { sessionID: 'sess-1' }),
                {},
                { step: 'ClientTools', clientTools: [{ Name: 'NavigateTo', Params: {} }], previousPayload: {} } as BaseAgentNextStep
            );
            expect(clientStep).toMatchObject({ step: 'Failed', terminate: true });

            const writerAgent = { ...AGENT, AllowMemoryWrite: true } as MJAIAgentEntityExtended;
            vi.spyOn(internals, 'createStepEntity').mockResolvedValue({});
            vi.spyOn(internals, 'finalizeStepEntity').mockResolvedValue(undefined);
            const writeSpy = vi.spyOn(internals, 'executeMemoryWritesAsSteps').mockResolvedValue([]);
            await internals.processMemoryWritesForTurn([{ note: 'private', type: 'Context' }], makeParams(STRUCTURAL_AUDIENCE, { agent: writerAgent }));
            expect(writeSpy).not.toHaveBeenCalled();

            const feedbackSpy = vi.spyOn(internals, 'createFeedbackRequest').mockResolvedValue(undefined);
            await internals.raiseFeedbackRequest(
                makeParams(STRUCTURAL_AUDIENCE),
                {},
                { step: 'Chat', message: 'Clarify?' } as BaseAgentNextStep
            );
            expect(feedbackSpy).not.toHaveBeenCalled();

            expect(internals.sessionAudienceRefusal(makeParams(STRUCTURAL_AUDIENCE))).toMatch(/session-driven/);

            const taskStep = await internals.executeTasksStep(
                makeParams(STRUCTURAL_AUDIENCE),
                { step: 'Tasks', taskGraph: { workflowName: 'wf', tasks: [] }, previousPayload: {} } as BaseAgentNextStep
            );
            expect(taskStep).toMatchObject({ step: 'Failed', terminate: true });
        });
    });

    describe('backwards compatibility for enumerated Intersection and Caller callers', () => {
        it('hydrates Intersection readers and passes them to actions identically to prior behavior', async () => {
            const actionEntity = makeActionEntity();
            await agent.ExecuteSingleAction(
                makeParams({ Mode: 'Intersection', UserIDs: [READER_ID] }),
                { name: 'Scoped Search', params: { Query: 'q' } },
                actionEntity,
                CALLER
            );
            expect(actionHarness.dispatched).toHaveLength(1);
            expect(actionHarness.dispatched[0].Audience).toEqual({ Readers: [READER] });
            expect(actionHarness.dispatched[0].IsStructuralAudience).toBeUndefined();
        });

        it('runs Caller mode with no audience restriction', async () => {
            const nonAudienceEntity = makeActionEntity({
                Name: 'Send Email',
                DriverClass: '__Test_NonAudienceAction',
            });
            const result = await agent.ExecuteSingleAction(
                makeParams({ Mode: 'Caller' }),
                { name: 'Send Email', params: {} },
                nonAudienceEntity,
                CALLER
            );
            expect(result.Success).toBe(true);
            expect(actionHarness.dispatched[0].Audience).toBeUndefined();
            expect(actionHarness.dispatched[0].IsStructuralAudience).toBeUndefined();
        });
    });
});
