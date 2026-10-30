import { describe, it, expect, vi, afterEach } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import type { MJTaskEntity, MJTaskEntity_ITaskLoopIteration } from '@memberjunction/core-entities';
import { TaskNode, type TaskGraphSpec } from '@memberjunction/ai-core-plus';
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

    it('preserves all array appends when multi-step ForEach runs in parallel executionMode', async () => {
        const runner: TaskActionRunner = {
            RunActionForTask: vi.fn(async ({ ActionID, InputPayload }) => {
                const params = InputPayload as Record<string, unknown>;
                await new Promise((r) => setTimeout(r, 10));
                if (ActionID === 'act-step1') {
                    return { Success: true, Output: { Half: Number(params['n']) * 10 } };
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
        const collected = ((outcome.Output as Record<string, unknown>)['collected'] as number[]).slice().sort((a, b) => a - b);
        expect(collected).toEqual([11, 21, 31, 41]);
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
                    { id: 'chk', name: 'CheckDone', params: { val: '{{steps.inc.NextVal}}' } },
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
});
