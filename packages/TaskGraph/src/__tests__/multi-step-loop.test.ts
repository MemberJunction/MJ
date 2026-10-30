import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import type { ActionResult, MJActionEntityExtended } from '@memberjunction/actions-base';
import type { MJTaskEntity, MJTaskEntity_ITaskLoopIteration } from '@memberjunction/core-entities';
import { BaseAgent, BaseAgentType, LoopAgentType } from '@memberjunction/ai-agents';
import {
    BuildActionOutputObject,
    TaskNode,
    type AgentAction,
    type AgentConfiguration,
    type BaseAgentNextStep,
    type ExecuteAgentParams,
    type ForEachOperation,
    type MJAIAgentEntityExtended,
    type MJAIAgentRunEntityExtended,
    type MJAIAgentRunStepEntityExtended,
    type TaskGraphSpec,
} from '@memberjunction/ai-core-plus';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload, TaskGraphService } from '../TaskGraphService';
import type { TaskActionRunner } from '../types';
import type { TaskStepConfiguration } from '../decision-node';

const TEST_USER = { ID: 'user-1', Name: 'Test User' } as unknown as UserInfo;
const WORKFLOW_TYPE_ID = '00000000-0000-4000-8000-000000000099';

interface TaskBodyOutcomeShape {
    Success: boolean;
    Output?: unknown;
    ErrorMessage?: string;
    Iterations?: MJTaskEntity_ITaskLoopIteration[];
}

interface FakeDispatcher {
    runTaskBody(
        task: MJTaskEntity,
        provider: IMetadataProvider,
        inputPayload: unknown,
        dependencyOutputs: Map<string, unknown>,
    ): Promise<TaskBodyOutcomeShape>;
}

function dispatcherWith(actionRunner: TaskActionRunner): FakeDispatcher {
    const instance = Object.create(TaskGraphDispatcher.prototype) as unknown as {
        actionRunner: TaskActionRunner;
        contextUser: UserInfo;
    };
    instance.actionRunner = actionRunner;
    instance.contextUser = TEST_USER;
    return instance as unknown as FakeDispatcher;
}

function providerWithParent(invocation: { data?: unknown; context?: unknown } | null = null): IMetadataProvider {
    const bag = BuildTaskGraphParentInputPayload({
        continuation: 'message',
        reinvokeDepth: 0,
        failureSemantics: 'block',
        submittedByAgentRunID: 'run-1',
        submittedByUserID: 'user-1',
        invocation,
    });
    const parent = { Load: vi.fn().mockResolvedValue(true), InputPayload: JSON.stringify(bag) };
    return { GetEntityObject: vi.fn().mockResolvedValue(parent) } as unknown as IMetadataProvider;
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('TaskGraphDispatcher — multi-step ForEach & While loop bodies (steps[])', () => {
    it('chains step outputs via steps.<id>.*, skips steps whose condition is falsy, and folds outputMapping per pass', async () => {
        let logSeq = 0;
        const runner: TaskActionRunner = {
            RunActionForTask: vi.fn(async ({ ActionID, InputPayload }) => {
                const params = InputPayload as Record<string, unknown>;
                const logId = `log-${++logSeq}`;
                if (ActionID === 'act-double') {
                    return {
                        Success: true,
                        Output: { Result: Number(params['value']) * 2 },
                        ActionLogID: logId,
                    };
                }
                if (ActionID === 'act-bonus') {
                    return {
                        Success: true,
                        Output: { Result: Number(params['doubled']) + Number(params['bonus']) },
                        ActionLogID: logId,
                    };
                }
                return { Success: false, ErrorMessage: `Unexpected action ${ActionID}` };
            }),
        };

        const config: TaskStepConfiguration = {
            stepActionIds: {
                'Double Value': 'act-double',
                'Add Bonus': 'act-bonus',
            },
            forEach: {
                collectionPath: 'payload.numbers',
                itemVariable: 'num',
                indexVariable: 'idx',
                steps: [
                    {
                        id: 'double',
                        name: 'Double Value',
                        params: { value: '{{num}}' },
                    },
                    {
                        id: 'bonus',
                        name: 'Add Bonus',
                        condition: 'steps.double.Result >= 20',
                        params: {
                            doubled: '{{steps.double.Result}}',
                            bonus: 'data.bonusAmount',
                        },
                        outputMapping: '{"Result": "qualified[]"}',
                    },
                ],
            },
        };

        const loopTask = {
            ID: 'task-fe-1',
            Name: 'Score Numbers',
            ParentID: 'parent-1',
            ActionID: 'act-double',
            StepType: 'ForEach',
            ConfigurationObject: config,
        } as unknown as MJTaskEntity;

        const outcome = await dispatcherWith(runner).runTaskBody(
            loopTask,
            providerWithParent({ data: { bonusAmount: 5 } }),
            { numbers: [5, 10, 20] },
            new Map(),
        );

        expect(outcome.Success).toBe(true);
        // Item 5 -> double=10 (<20, bonus skipped); Item 10 -> double=20, bonus=25; Item 20 -> double=40, bonus=45
        expect((outcome.Output as Record<string, unknown>)['qualified']).toEqual([25, 45]);
        expect(runner.RunActionForTask).toHaveBeenCalledTimes(5); // 3 doubles + 2 bonuses
        expect(outcome.Iterations).toHaveLength(3);
        expect(outcome.Iterations?.every((it) => it.success === true && Boolean(it.actionLogID))).toBe(true);
    });

    it('folds parallel multi-step ForEach appends in deterministic collection-index order even when passes complete in reverse order', async () => {
        const runner: TaskActionRunner = {
            RunActionForTask: vi.fn(async ({ ActionID, InputPayload }) => {
                const params = InputPayload as Record<string, unknown>;
                if (ActionID === 'act-step1') {
                    // Reverse delay: n=4 finishes first (8ms), n=1 finishes last (32ms)
                    const n = Number(params['n']);
                    await new Promise((r) => setTimeout(r, (5 - n) * 8));
                    return { Success: true, Output: { Half: n * 10 } };
                }
                return { Success: true, Output: { Final: Number(params['prev']) + 1 } };
            }),
        };

        const config: TaskStepConfiguration = {
            stepActionIds: { Step1: 'act-step1', Step2: 'act-step2' },
            forEach: {
                collectionPath: 'payload.items',
                executionMode: 'parallel',
                maxConcurrency: 4,
                steps: [
                    { id: 's1', name: 'Step1', params: { n: '{{item}}' } },
                    {
                        id: 's2',
                        name: 'Step2',
                        params: { prev: '{{steps.s1.Half}}' },
                        outputMapping: '{"Final": "collected[]"}',
                    },
                ],
            },
        };

        const loopTask = {
            ID: 'task-fe-parallel',
            Name: 'Parallel Multi-Step',
            ParentID: 'parent-1',
            ActionID: 'act-step1',
            StepType: 'ForEach',
            ConfigurationObject: config,
        } as unknown as MJTaskEntity;

        const outcome = await dispatcherWith(runner).runTaskBody(
            loopTask,
            providerWithParent(),
            { items: [1, 2, 3, 4] },
            new Map(),
        );

        expect(outcome.Success).toBe(true);
        // Must match collection index order [11, 21, 31, 41] directly without sorting!
        expect((outcome.Output as Record<string, unknown>)['collected']).toEqual([11, 21, 31, 41]);
        expect(outcome.Iterations?.map((it) => it.index)).toEqual([0, 1, 2, 3]);
    });

    it('resolves ForEach collectionPath from graph invocation data.* (not just payload.*)', async () => {
        const runner: TaskActionRunner = {
            RunActionForTask: vi.fn(async ({ InputPayload }) => {
                const params = InputPayload as Record<string, unknown>;
                return { Success: true, Output: { Doubled: Number(params['v']) * 2 } };
            }),
        };

        const config: TaskStepConfiguration = {
            stepActionIds: { Double: 'act-double' },
            forEach: {
                collectionPath: 'data.seedValues',
                itemVariable: 'v',
                steps: [
                    {
                        id: 'dbl',
                        name: 'Double',
                        params: { v: '{{v}}' },
                        outputMapping: '{"Doubled": "doubled[]"}',
                    },
                ],
            },
        };

        const loopTask = {
            ID: 'task-fe-data',
            Name: 'Data Collection ForEach',
            ParentID: 'parent-1',
            ActionID: 'act-double',
            StepType: 'ForEach',
            ConfigurationObject: config,
        } as unknown as MJTaskEntity;

        const outcome = await dispatcherWith(runner).runTaskBody(
            loopTask,
            providerWithParent({ data: { seedValues: [4, 9] } }),
            {},
            new Map(),
        );

        expect(outcome.Success).toBe(true);
        expect((outcome.Output as Record<string, unknown>)['doubled']).toEqual([8, 18]);
    });

    it('converges a multi-step While loop updating payload across passes', async () => {
        const runner: TaskActionRunner = {
            RunActionForTask: vi.fn(async ({ ActionID, InputPayload }) => {
                const params = InputPayload as Record<string, unknown>;
                if (ActionID === 'act-inc') {
                    return { Success: true, Output: { NextVal: Number(params['current']) + 6 } };
                }
                return {
                    Success: true,
                    Output: {
                        counter: Number(params['val']) + 4,
                        done: Number(params['val']) + 4 >= 30,
                    },
                };
            }),
        };

        const config: TaskStepConfiguration = {
            stepActionIds: { Increment: 'act-inc', CheckDone: 'act-check' },
            while: {
                condition: 'payload.done !== true',
                maxIterations: 10,
                steps: [
                    { id: 'inc', name: 'Increment', params: { current: '{{payload.counter}}' } },
                    {
                        id: 'chk',
                        name: 'CheckDone',
                        params: { val: '{{steps.inc.NextVal}}' },
                        outputMapping: '{"counter": "counter", "done": "done"}',
                    },
                ],
            },
        };

        const whileTask = {
            ID: 'task-while-1',
            Name: 'Converge Counter',
            ParentID: 'parent-1',
            ActionID: 'act-inc',
            StepType: 'While',
            ConfigurationObject: config,
        } as unknown as MJTaskEntity;

        const outcome = await dispatcherWith(runner).runTaskBody(
            whileTask,
            providerWithParent(),
            { counter: 0, done: false },
            new Map(),
        );

        expect(outcome.Success).toBe(true);
        // Each pass adds 6 + 4 = 10 -> 3 passes reach counter=30, done=true
        expect(outcome.Iterations).toHaveLength(3);
        expect((outcome.Output as Record<string, unknown>)['counter']).toBe(30);
        expect((outcome.Output as Record<string, unknown>)['done']).toBe(true);
    });

    it('halts remaining steps in a failed pass and respects continueOnError across passes', async () => {
        const runner: TaskActionRunner = {
            RunActionForTask: vi.fn(async ({ ActionID, InputPayload }) => {
                const params = InputPayload as Record<string, unknown>;
                if (ActionID === 'act-validate') {
                    if (params['val'] === 'bad') {
                        return { Success: false, ErrorMessage: 'invalid item' };
                    }
                    return { Success: true, Output: { Clean: String(params['val']).toUpperCase() } };
                }
                return { Success: true, Output: { Saved: `saved:${String(params['clean'])}` } };
            }),
        };

        const config: TaskStepConfiguration = {
            stepActionIds: { Validate: 'act-validate', Persist: 'act-persist' },
            forEach: {
                collectionPath: 'payload.entries',
                continueOnError: true,
                steps: [
                    { id: 'v', name: 'Validate', params: { val: '{{item}}' } },
                    {
                        id: 'p',
                        name: 'Persist',
                        params: { clean: '{{steps.v.Clean}}' },
                        outputMapping: '{"Saved": "savedItems[]"}',
                    },
                ],
            },
        };

        const loopTask = {
            ID: 'task-fe-err',
            Name: 'Validate and Persist',
            ParentID: 'parent-1',
            ActionID: 'act-validate',
            StepType: 'ForEach',
            ConfigurationObject: config,
        } as unknown as MJTaskEntity;

        const outcome = await dispatcherWith(runner).runTaskBody(
            loopTask,
            providerWithParent(),
            { entries: ['ok1', 'bad', 'ok2'] },
            new Map(),
        );

        expect(outcome.Success).toBe(true);
        // 'ok1' -> Validate + Persist (2 calls), 'bad' -> Validate fails, Persist NOT called (1 call), 'ok2' -> Validate + Persist (2 calls) = 5 calls
        expect(runner.RunActionForTask).toHaveBeenCalledTimes(5);
        expect((outcome.Output as Record<string, unknown>)['savedItems']).toEqual(['saved:OK1', 'saved:OK2']);
        expect(outcome.Iterations?.map((i) => i.success)).toEqual([true, false, true]);
    });

    it('does not leak raw step outputs onto payload when no step in steps[] declares outputMapping', async () => {
        const runner: TaskActionRunner = {
            RunActionForTask: vi.fn(async () => ({
                Success: true,
                Output: { EphemeralField: 'should-not-bleed-into-payload', Count: 99 },
            })),
        };

        const config: TaskStepConfiguration = {
            stepActionIds: { SideEffect: 'act-side' },
            forEach: {
                collectionPath: 'payload.items',
                steps: [{ id: 's1', name: 'SideEffect', params: { x: '{{item}}' } }],
            },
        };

        const loopTask = {
            ID: 'task-fe-nomap',
            Name: 'No Mapping Multi-Step',
            ParentID: 'parent-1',
            ActionID: 'act-side',
            StepType: 'ForEach',
            ConfigurationObject: config,
        } as unknown as MJTaskEntity;

        const outcome = await dispatcherWith(runner).runTaskBody(
            loopTask,
            providerWithParent(),
            { items: ['a', 'b'], untouched: 'yes' },
            new Map(),
        );

        expect(outcome.Success).toBe(true);
        const outObj = outcome.Output as Record<string, unknown>;
        expect(outObj['untouched']).toBe('yes');
        expect(outObj['EphemeralField']).toBeUndefined();
        expect(outObj['Count']).toBeUndefined();
    });

    it('preserves ResolveMappedInput literal semantics for legacy single-action durable loops', async () => {
        const receivedInputs: Array<Record<string, unknown>> = [];
        const runner: TaskActionRunner = {
            RunActionForTask: vi.fn(async ({ InputPayload }) => {
                receivedInputs.push(InputPayload as Record<string, unknown>);
                return { Success: true, Output: { Sent: true } };
            }),
        };

        const config: TaskStepConfiguration = {
            forEach: {
                collectionPath: 'payload.recipients',
                itemVariable: 'recipient',
                action: {
                    name: 'Send Template Email',
                    params: {
                        fileName: 'report.txt',
                        sortBy: 'index',
                        templateBody: 'Hello {{recipientName}}, check {{unknownField}}',
                        email: 'payload.recipient.email',
                        sender: 'data.senderAddress',
                    },
                    outputMapping: '{"Sent": "sentFlags[]"}',
                },
            },
        };

        const loopTask = {
            ID: 'task-fe-legacy',
            Name: 'Legacy Single Action Loop',
            ParentID: 'parent-1',
            ActionID: 'act-send',
            StepType: 'ForEach',
            ConfigurationObject: config,
        } as unknown as MJTaskEntity;

        const outcome = await dispatcherWith(runner).runTaskBody(
            loopTask,
            providerWithParent({ data: { senderAddress: 'ops@mj.test' } }),
            { recipients: [{ email: 'alice@mj.test' }] },
            new Map(),
        );

        expect(outcome.Success).toBe(true);
        expect(receivedInputs).toEqual([
            {
                fileName: 'report.txt',
                sortBy: 'index',
                templateBody: 'Hello {{recipientName}}, check {{unknownField}}',
                email: 'alice@mj.test',
                sender: 'ops@mj.test',
            },
        ]);
        expect((outcome.Output as Record<string, unknown>)['sentFlags']).toEqual([true]);
    });
});

describe('TaskGraphService.Submit — multi-step loops and sanitized native tool name resolution', () => {
    it('resolves sanitized native tool names and stamps ActionID + stepActionIds on multi-step loop tasks', async () => {
        interface SavedTaskRecord {
            ID: string;
            Name: string;
            StepType: string | null;
            ActionID: string | null;
            AgentID: string | null;
            Configuration: string | null;
        }
        const savedTasks: SavedTaskRecord[] = [];
        let taskCounter = 0;

        const provider: IMetadataProvider = {
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: Tasks') {
                    const idx = ++taskCounter;
                    const record: SavedTaskRecord & {
                        NewRecord: () => void;
                        Load: () => Promise<boolean>;
                        Save: () => Promise<boolean>;
                    } = {
                        ID: `00000000-0000-4000-8000-00000000010${idx}`,
                        Name: '',
                        StepType: null,
                        ActionID: null,
                        AgentID: null,
                        Configuration: null,
                        NewRecord: vi.fn(),
                        Load: vi.fn().mockResolvedValue(true),
                        Save: vi.fn(async () => {
                            savedTasks.push({
                                ID: record.ID,
                                Name: record.Name,
                                StepType: record.StepType,
                                ActionID: record.ActionID,
                                AgentID: record.AgentID,
                                Configuration: record.Configuration,
                            });
                            return true;
                        }),
                    };
                    return record;
                }
                return {
                    ID: `dep-${++taskCounter}`,
                    NewRecord: vi.fn(),
                    Save: vi.fn().mockResolvedValue(true),
                };
            }),
        } as unknown as IMetadataProvider;

        const rvMock = {
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Task Types') {
                    return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID }] };
                }
                if (params.EntityName === 'MJ: Actions') {
                    // Simulate SQL `Name IN ('calculate_expression', 'Add Offset')`: exact match hits only 'Add Offset',
                    // while the fallback `Status='Active'` scan returns all active canonical actions.
                    if (params.ExtraFilter?.startsWith('Name IN')) {
                        return { Success: true, Results: [{ ID: 'act-offset', Name: 'Add Offset' }] };
                    }
                    return {
                        Success: true,
                        Results: [
                            { ID: 'act-calc', Name: 'Calculate Expression' },
                            { ID: 'act-offset', Name: 'Add Offset' },
                        ],
                    };
                }
                if (params.EntityName === 'MJ: AI Agents') {
                    if (params.ExtraFilter?.startsWith('Name IN')) {
                        return { Success: true, Results: [] };
                    }
                    return {
                        Success: true,
                        Results: [{ ID: 'agent-qb', Name: 'Query Builder' }],
                    };
                }
                return { Success: true, Results: [] };
            }),
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rvMock as unknown as RunView);

        const spec: TaskGraphSpec = {
            workflowName: 'Native Tool Names + Multi-Step Loop',
            continuation: 'none',
            tasks: [
                TaskNode.ForEach(
                    { tempId: 'fe', name: 'Compute Scores', description: 'Two-step compute', dependsOn: [] },
                    {
                        collectionPath: 'payload.items',
                        steps: [
                            { id: 's1', name: 'calculate_expression', params: { Expression: '{{item}} * 2' } },
                            { id: 's2', name: 'Add Offset', params: { val: '{{steps.s1.Result}}' } },
                        ],
                    },
                ),
                TaskNode.Agent(
                    { tempId: 'ag', name: 'Summarize', description: 'Run sub-agent', dependsOn: ['fe'] },
                    { agentName: 'delegate_to_query_builder', message: 'Summarize computed scores' },
                ),
            ],
        };

        const service = new TaskGraphService();
        const result = await service.Submit(spec, { Provider: provider, ContextUser: TEST_USER });

        expect(result.Success).toBe(true);
        const feTask = savedTasks.find((t) => t.Name === 'Compute Scores')!;
        expect(feTask.ActionID).toBe('act-calc');
        const parsedCfg = JSON.parse(feTask.Configuration!) as TaskStepConfiguration;
        expect(parsedCfg.stepActionIds).toEqual({
            calculate_expression: 'act-calc',
            'Add Offset': 'act-offset',
        });

        const agTask = savedTasks.find((t) => t.Name === 'Summarize')!;
        expect(agTask.AgentID).toBe('agent-qb');
    });

    it('surfaces database RunView failures honestly instead of misreporting unknown actions', async () => {
        const provider: IMetadataProvider = {
            GetEntityObject: vi.fn(),
        } as unknown as IMetadataProvider;

        const rvMock = {
            RunView: vi.fn(async (params: RunViewParams) => {
                if (params.EntityName === 'MJ: Task Types') {
                    return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID }] };
                }
                if (params.EntityName === 'MJ: Actions') {
                    return { Success: false, ErrorMessage: 'Database connection pool exhausted', Results: [] };
                }
                return { Success: true, Results: [] };
            }),
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rvMock as unknown as RunView);

        const spec: TaskGraphSpec = {
            workflowName: 'DB Error Test',
            continuation: 'none',
            tasks: [
                TaskNode.Action(
                    { tempId: 'a1', name: 'Run Calc', description: 'calc', dependsOn: [] },
                    { actionName: "O'Brien's Action" },
                ),
            ],
        };

        const service = new TaskGraphService();
        const result = await service.Submit(spec, { Provider: provider, ContextUser: TEST_USER });

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Database connection pool exhausted');
        expect(result.ErrorMessage).not.toContain('unknown action');
    });
});

class ParityBaseAgent extends BaseAgent {
    private stepSeq = 0;
    private readonly agentType: BaseAgentType = new LoopAgentType();
    private readonly runStub: MJAIAgentRunEntityExtended = {
        ID: 'parity-run-1',
        AgentID: '11111111-1111-4111-8111-111111111111',
        Steps: [],
    } as unknown as MJAIAgentRunEntityExtended;

    public constructor(
        private readonly actions: MJActionEntityExtended[],
        private readonly handler: (name: string, params: Record<string, unknown>) => Promise<ActionResult>,
    ) {
        super();
    }

    public override get AgentTypeInstance(): BaseAgentType {
        return this.agentType;
    }

    public override get AgentRun(): MJAIAgentRunEntityExtended | null {
        return this.runStub;
    }

    protected override getEffectiveActionsForValidation(_agentId: string): MJActionEntityExtended[] {
        return this.actions;
    }

    protected override async createStepEntity(stepParams: {
        stepType: MJAIAgentRunStepEntityExtended['StepType'];
        stepName: string;
        parentId?: string;
    }): Promise<MJAIAgentRunStepEntityExtended> {
        return {
            ID: `parity-step-${++this.stepSeq}`,
            StepType: stepParams.stepType,
            StepName: stepParams.stepName,
            ParentID: stepParams.parentId ?? null,
            Status: 'Running',
            TargetLogID: null,
            StepNumber: this.stepSeq,
            Save: async () => true,
        } as unknown as MJAIAgentRunStepEntityExtended;
    }

    protected override async finalizeStepEntity(
        stepEntity: MJAIAgentRunStepEntityExtended,
        success: boolean,
    ): Promise<void> {
        stepEntity.Status = success ? 'Success' : 'Failed';
    }

    public override async ExecuteSingleAction(
        _params: ExecuteAgentParams,
        action: AgentAction,
    ): Promise<ActionResult> {
        return this.handler(action.name, action.params ?? {});
    }

    public RunForEach(params: ExecuteAgentParams, decision: BaseAgentNextStep): Promise<BaseAgentNextStep> {
        const cfg: Pick<AgentConfiguration, 'agentType'> = {
            agentType: { Name: 'Loop' } as AgentConfiguration['agentType'],
        };
        return this.executeNextStep(params, cfg as AgentConfiguration, decision);
    }
}

describe('Cross-engine parity — BaseAgent (in-turn) vs TaskGraphDispatcher (durable) on identical multi-step ForEach', () => {
    it('produces byte-identical final payloads across parallel reverse-delay, Both + JSON Message outputs, conditional step, and unmapped step', async () => {
        const actionDefs: Array<Pick<MJActionEntityExtended, 'ID' | 'Name' | 'Status'>> = [
            { ID: 'act-score', Name: 'Compute Score', Status: 'Active' },
            { ID: 'act-audit', Name: 'Audit Scratch', Status: 'Active' },
            { ID: 'act-fmt', Name: 'Format Tier', Status: 'Active' },
        ];
        const actionById = new Map(actionDefs.map((a) => [a.ID, a.Name]));

        const executeSharedAction = async (
            actionName: string,
            params: Record<string, unknown>,
        ): Promise<ActionResult> => {
            if (actionName === 'Compute Score') {
                const n = Number(params['val']);
                const delayMs = n === 1 ? 30 : n === 2 ? 15 : 1;
                await new Promise((r) => setTimeout(r, delayMs));
                return {
                    Success: true,
                    ResultCode: 'OK',
                    Message: '{"meta":{"tier":"gold"}}',
                    Params: [{ Name: 'Score', Value: n * 10, Type: 'Both' }],
                };
            }
            if (actionName === 'Audit Scratch') {
                return {
                    Success: true,
                    ResultCode: 'OK',
                    Message: 'audit-logged',
                    Params: [{ Name: 'UnmappedLeak', Value: `leak-${String(params['seen'])}`, Type: 'Output' }],
                };
            }
            if (actionName === 'Format Tier') {
                return {
                    Success: true,
                    ResultCode: 'OK',
                    Message: 'formatted',
                    Params: [
                        {
                            Name: 'Badge',
                            Value: `${String(params['tier'])}:${String(params['score'])}`,
                            Type: 'Output',
                        },
                    ],
                };
            }
            return { Success: false, ResultCode: 'ERR', Message: `Unknown action ${actionName}`, Params: [] };
        };

        const sharedForEach: ForEachOperation = {
            collectionPath: 'payload.nums',
            itemVariable: 'n',
            executionMode: 'parallel',
            maxConcurrency: 3,
            steps: [
                {
                    id: 'score',
                    name: 'compute_score',
                    params: { val: 'n' },
                    outputMapping: '{"Score": "scores[]"}',
                },
                {
                    id: 'audit',
                    name: 'Audit Scratch',
                    params: { seen: '{{steps.score.Score}}' },
                },
                {
                    id: 'fmt',
                    name: 'Format Tier',
                    condition: 'steps.score.Score >= 20',
                    params: {
                        score: '{{steps.score.Score}}',
                        tier: '{{steps.score.meta.tier}}',
                    },
                    outputMapping: '{"Badge": "qualifiedBadges[]"}',
                },
            ],
        };

        // 1. Run in-turn via BaseAgent
        const initialAgentPayload = { nums: [1, 2, 3] };
        const parityAgent = new ParityBaseAgent(
            actionDefs.map((a) => ({ ...a }) as MJActionEntityExtended),
            executeSharedAction,
        );
        const agentParams: ExecuteAgentParams = {
            agent: {
                ID: '11111111-1111-4111-8111-111111111111',
                Name: 'Parity Agent',
                PayloadSelfWritePaths: null,
            } as MJAIAgentEntityExtended,
            conversationMessages: [],
            payload: initialAgentPayload,
            contextUser: TEST_USER,
            messageExpirationOverride: { expirationTurns: 2, expirationMode: 'Remove' },
        };
        const baseAgentNext = await parityAgent.RunForEach(agentParams, {
            step: 'ForEach',
            terminate: false,
            previousPayload: initialAgentPayload,
            newPayload: initialAgentPayload,
            forEach: sharedForEach,
        });
        expect(baseAgentNext.step).toBe('Retry');

        // 2. Run durably via TaskGraphDispatcher (using BuildActionOutputObject, matching TaskGraphActionRunner)
        const durableRunner: TaskActionRunner = {
            RunActionForTask: vi.fn(async ({ ActionID, InputPayload }) => {
                const name = actionById.get(ActionID) ?? ActionID;
                const res = await executeSharedAction(name, (InputPayload ?? {}) as Record<string, unknown>);
                return {
                    Success: res.Success,
                    Output: BuildActionOutputObject(res.Params, res.Message),
                    ErrorMessage: res.Success ? undefined : res.Message,
                };
            }),
        };
        const durableTask = {
            ID: 'task-parity-fe',
            Name: 'Parity Multi-Step ForEach',
            ParentID: 'parent-1',
            ActionID: 'act-score',
            StepType: 'ForEach',
            ConfigurationObject: {
                stepActionIds: {
                    compute_score: 'act-score',
                    'Audit Scratch': 'act-audit',
                    'Format Tier': 'act-fmt',
                },
                forEach: sharedForEach,
            } satisfies TaskStepConfiguration,
        } as unknown as MJTaskEntity;

        const durableOutcome = await dispatcherWith(durableRunner).runTaskBody(
            durableTask,
            providerWithParent(),
            { nums: [1, 2, 3] },
            new Map(),
        );
        expect(durableOutcome.Success).toBe(true);

        const expectedPayload = {
            nums: [1, 2, 3],
            scores: [10, 20, 30],
            qualifiedBadges: ['gold:20', 'gold:30'],
        };
        // TaskGraphDispatcher attaches loop-node execution summary fields (`results`, `iterations`,
        // `succeeded`, `failed`) alongside the folded payload fields.
        const {
            results: durableIterResults,
            iterations,
            succeeded,
            failed,
            ...durableFoldedPayload
        } = durableOutcome.Output as Record<string, unknown>;
        expect(iterations).toBe(3);
        expect(succeeded).toBe(3);
        expect(failed).toBe(0);
        expect(Array.isArray(durableIterResults)).toBe(true);
        expect(baseAgentNext.newPayload).toEqual(expectedPayload);
        expect(durableFoldedPayload).toEqual(expectedPayload);
        expect(durableFoldedPayload).toEqual(baseAgentNext.newPayload);
    });
});
