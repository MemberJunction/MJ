/**
 * Unit tests for Phase 2 Workstream 2 optimizations:
 * - Item 2.1: Single-pass `pollOnce` (`propagateAndRollup` -> `findClaimableTasks` graph state reuse,
 *   in-memory human task short-circuit, single parent task load on `GraphState.parent`).
 * - Item 2.2: Zero-reload `executeClaimed` via pre-hydrated `ClaimedTaskCandidate`
 *   (`taskEntity`, `parentTask`, `parentMetadata`, and `dependencyOutputs` extracted in memory).
 * - Item 2.3: Parallelized resolver lookups and child/dependency saves in `TaskGraphService.Submit`,
 *   and parallelized layout saves in `TaskGraphDispatcher.persistComputedLayout`.
 */
import { describe, it, expect, vi } from 'vitest';
import { RunView, type IMetadataProvider, type RunViewParams, type UserInfo } from '@memberjunction/core';
import type { MJTaskDependencyEntity, MJTaskEntity } from '@memberjunction/core-entities';
import { TaskGraphDispatcher, type ClaimedTaskCandidate } from '../TaskGraphDispatcher';
import { BuildTaskGraphParentInputPayload, ParseTaskGraphParentMetadata, TaskGraphService } from '../TaskGraphService';
import type { TaskActionRunner, TaskAgentRunner } from '../types';
import type { TaskGraphSpec } from '@memberjunction/ai-core-plus';

const TEST_USER = { ID: '00000000-0000-0000-0000-000000000001', Name: 'Tester', IsActive: true } as UserInfo;
const WORKFLOW_TYPE_ID = '11111111-1111-4111-8111-111111111111';

interface MockParentRecord {
    ID: string;
    Name: string;
    Status: string;
    PercentComplete: number;
    StartedAt: Date | null;
    CompletedAt: Date | null;
    UserID: string | null;
    AgentID: string | null;
    AgentRunID: string | null;
    ConversationDetailID: string | null;
    InputPayload: string | null;
    Load: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
}

function makeParentRecord(id: string, name: string, invocationData?: Record<string, unknown>): MockParentRecord {
    const bag = BuildTaskGraphParentInputPayload({
        continuation: 'none',
        reinvokeDepth: 1,
        failureSemantics: 'block',
        submittedByAgentRunID: 'run-100',
        submittedByUserID: TEST_USER.ID,
        invocation: invocationData ? { data: invocationData, context: { env: 'test' } } : null,
    });
    return {
        ID: id,
        Name: name,
        Status: 'In Progress',
        PercentComplete: 0,
        StartedAt: null,
        CompletedAt: null,
        UserID: TEST_USER.ID,
        AgentID: 'agent-owner-1',
        AgentRunID: 'run-100',
        ConversationDetailID: null,
        InputPayload: JSON.stringify(bag),
        Load: vi.fn().mockResolvedValue(true),
        Save: vi.fn().mockResolvedValue(true),
    };
}

function makeChildTask(fields: {
    ID: string;
    ParentID: string;
    Name: string;
    Status?: MJTaskEntity['Status'];
    StepType?: MJTaskEntity['StepType'];
    ActionID?: string | null;
    AgentID?: string | null;
    PromptID?: string | null;
    UserID?: string | null;
    InputPayload?: string | null;
    OutputPayload?: string | null;
    Configuration?: string | null;
    ConfigurationObject?: Record<string, unknown> | null;
}): MJTaskEntity & { Save: ReturnType<typeof vi.fn>; Load: ReturnType<typeof vi.fn> } {
    const saveFn = vi.fn().mockResolvedValue(true);
    const loadFn = vi.fn().mockResolvedValue(true);
    return {
        ID: fields.ID,
        ParentID: fields.ParentID,
        Name: fields.Name,
        Status: fields.Status ?? 'Pending',
        StepType: fields.StepType ?? 'Action',
        ActionID: fields.ActionID ?? null,
        AgentID: fields.AgentID ?? null,
        PromptID: fields.PromptID ?? null,
        UserID: fields.UserID ?? null,
        ClaimedBy: null,
        ClaimExpiresAt: null,
        StartedAt: null,
        CompletedAt: null,
        PercentComplete: fields.Status === 'Complete' ? 100 : 0,
        ErrorMessage: null,
        InputPayload: fields.InputPayload ?? JSON.stringify({}),
        OutputPayload: fields.OutputPayload ?? null,
        Configuration: fields.Configuration ?? null,
        ConfigurationObject: fields.ConfigurationObject ?? null,
        Save: saveFn,
        Load: loadFn,
    } as unknown as MJTaskEntity & { Save: ReturnType<typeof vi.fn>; Load: ReturnType<typeof vi.fn> };
}

function makeDependency(id: string, taskId: string, dependsOnTaskId: string): MJTaskDependencyEntity {
    return {
        ID: id,
        TaskID: taskId,
        DependsOnTaskID: dependsOnTaskId,
        DependencyType: 'FinishToStart',
        Condition: null,
        ExclusiveGroup: null,
        Priority: 0,
        Sequence: 0,
    } as unknown as MJTaskDependencyEntity;
}

describe('TaskGraphDispatcher polling & execution query optimizations (Items 2.1 & 2.2)', () => {
    it('reduces pollOnce queries to 3 + 2G for active graphs with 0 pending human tasks and loads each parent once', async () => {
        const parent1 = makeParentRecord('graph-1', 'Workflow 1', { recordId: 'rec-1' });
        const parent2 = makeParentRecord('graph-2', 'Workflow 2', { recordId: 'rec-2' });
        const parentsById = new Map<string, MockParentRecord>([
            [parent1.ID, parent1],
            [parent2.ID, parent2],
        ]);

        const g1Step1 = makeChildTask({
            ID: 'g1-t1',
            ParentID: 'graph-1',
            Name: 'G1 Step 1',
            Status: 'Complete',
            StepType: 'Action',
            ActionID: 'act-1',
            OutputPayload: JSON.stringify({ fetchedValue: 42 }),
        });
        const g1Step2 = makeChildTask({
            ID: 'g1-t2',
            ParentID: 'graph-1',
            Name: 'G1 Step 2',
            Status: 'Pending',
            StepType: 'Action',
            ActionID: 'act-2',
            InputPayload: JSON.stringify({}),
            ConfigurationObject: {
                inputMapping: JSON.stringify({ Value: 'payload.fetchedValue', RecordID: 'data.recordId' }),
            },
        });
        const g2Step1 = makeChildTask({
            ID: 'g2-t1',
            ParentID: 'graph-2',
            Name: 'G2 Step 1',
            Status: 'Pending',
            StepType: 'Action',
            ActionID: 'act-1',
        });

        const depsByGraph = new Map<string, MJTaskDependencyEntity[]>([
            ['graph-1', [makeDependency('dep-1', 'g1-t2', 'g1-t1')]],
            ['graph-2', []],
        ]);
        const childrenByGraph = new Map<string, MJTaskEntity[]>([
            ['graph-1', [g1Step1, g1Step2]],
            ['graph-2', [g2Step1]],
        ]);

        let runViewQueryCount = 0;
        let humanTaskQueryCount = 0;

        const rvMock = {
            RunView: vi.fn(async (params: RunViewParams) => {
                runViewQueryCount++;
                const filter = params.ExtraFilter ?? '';
                if (filter.includes("StepType='Human'") || filter.includes('ActionID IS NULL AND AgentID IS NULL')) {
                    humanTaskQueryCount++;
                }
                if (params.EntityName === 'MJ: Task Types') {
                    return { Success: true, Results: [{ ID: WORKFLOW_TYPE_ID }] };
                }
                if (params.EntityName === 'MJ: Tasks') {
                    for (const [graphId, children] of childrenByGraph.entries()) {
                        if (filter === `ParentID='${graphId}'`) {
                            return { Success: true, Results: children };
                        }
                    }
                    return { Success: true, Results: [] };
                }
                if (params.EntityName === 'MJ: Task Dependencies') {
                    if (filter.includes('g1-t1')) {
                        return { Success: true, Results: depsByGraph.get('graph-1') ?? [] };
                    }
                    if (filter.includes('g2-t1')) {
                        return { Success: true, Results: depsByGraph.get('graph-2') ?? [] };
                    }
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            }),
            RunViews: vi.fn(async (items: RunViewParams[]) => {
                runViewQueryCount += items.length;
                return [
                    { Success: true, Results: [{ ParentID: 'graph-1' }, { ParentID: 'graph-2' }] },
                    { Success: true, Results: [{ ID: 'graph-1' }, { ID: 'graph-2' }] },
                    { Success: true, Results: [] },
                ];
            }),
        };

        const spyFromProvider = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rvMock as unknown as RunView);

        const provider: IMetadataProvider = {
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: Tasks') {
                    const holder: { target: MockParentRecord | null; Load: (id: string) => Promise<boolean> } = {
                        target: null,
                        Load: async (id: string) => {
                            const found = parentsById.get(id) ?? null;
                            if (!found) return false;
                            await found.Load(id);
                            Object.assign(holder, found);
                            return true;
                        },
                    };
                    return holder;
                }
                return { Load: vi.fn().mockResolvedValue(false), Save: vi.fn().mockResolvedValue(true) };
            }),
        } as unknown as IMetadataProvider;

        const actionRunner: TaskActionRunner = {
            RunActionForTask: vi.fn().mockResolvedValue({ Success: true, Output: { ok: true } }),
        };
        const agentRunner: TaskAgentRunner = {
            RunAgentForTask: vi.fn().mockResolvedValue({ Success: true, AgentRunID: 'ar-1', Output: {} }),
        };

        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            { InstanceID: 'test-disp-1', MaxConcurrentTasks: 5 },
            undefined,
            undefined,
            actionRunner,
        );

        // Pre-seed cachedWorkflowTaskTypeID and running=true to measure steady-state pollOnce query count
        (dispatcher as unknown as { cachedWorkflowTaskTypeID: string; running: boolean }).cachedWorkflowTaskTypeID = WORKFLOW_TYPE_ID;
        (dispatcher as unknown as { running: boolean }).running = true;
        // Stub claims so TryClaim declines (isolating pollOnce query count from executeClaimed)
        const claimsStub = (dispatcher as unknown as {
            claims: {
                TryClaim: ReturnType<typeof vi.fn>;
                TryUpdateParentProgress: ReturnType<typeof vi.fn>;
                TrySettleParent: ReturnType<typeof vi.fn>;
            };
        }).claims;
        claimsStub.TryClaim = vi.fn().mockResolvedValue(false);
        claimsStub.TryUpdateParentProgress = vi.fn().mockResolvedValue(true);
        claimsStub.TrySettleParent = vi.fn().mockResolvedValue(true);

        await (dispatcher as unknown as { pollOnce(): Promise<void> }).pollOnce();

        // For G = 2 active graphs with 0 pending human tasks:
        // - findActiveGraphIDs: 1 RunViews batch of 3 queries
        // - Per graph (2 graphs): 1 child tasks RunView + 1 dependencies RunView = 4 queries
        // Total = 3 + 2*2 = 7 queries (down from 6 + 13*2 = 32)
        expect(runViewQueryCount).toBe(7);
        expect(humanTaskQueryCount).toBe(0);

        // Parent task for each graph is loaded only ONCE (during loadGraphState) and reused for rollup
        expect(parent1.Load).toHaveBeenCalledTimes(1);
        expect(parent2.Load).toHaveBeenCalledTimes(1);

        spyFromProvider.mockRestore();
    });

    it('passes in-memory pendingHumanTasks to human sweeps without re-querying MJ: Tasks and reloads graph only when a human task settles', async () => {
        const parent1 = makeParentRecord('graph-human', 'Human Approval Workflow');
        const humanTask = makeChildTask({
            ID: 'h-1',
            ParentID: 'graph-human',
            Name: 'Approve Release',
            Status: 'Pending',
            StepType: 'Human',
            ActionID: null,
            AgentID: null,
            PromptID: null,
            UserID: TEST_USER.ID,
        });
        const downstreamTask = makeChildTask({
            ID: 'a-2',
            ParentID: 'graph-human',
            Name: 'Deploy Release',
            Status: 'Pending',
            StepType: 'Action',
            ActionID: 'act-deploy',
        });

        let humanTasksTableQueries = 0;
        let childTasksLoads = 0;

        const answeredRequest = {
            ID: 'req-1',
            OriginatingTaskID: 'h-1',
            Status: 'Approved',
            ResponseData: JSON.stringify({ approved: true }),
            Comments: 'Looks good',
            Save: vi.fn().mockResolvedValue(true),
        };

        const rvMock = {
            RunView: vi.fn(async (params: RunViewParams) => {
                const filter = params.ExtraFilter ?? '';
                if (params.EntityName === 'MJ: Tasks') {
                    if (filter.includes("StepType='Human'") || filter.includes('ActionID IS NULL')) {
                        humanTasksTableQueries++;
                    }
                    if (filter === "ParentID='graph-human'") {
                        childTasksLoads++;
                        return { Success: true, Results: [humanTask, downstreamTask] };
                    }
                }
                if (params.EntityName === 'MJ: Task Dependencies') {
                    return {
                        Success: true,
                        Results: [makeDependency('dep-h', 'a-2', 'h-1')],
                    };
                }
                if (params.EntityName === 'MJ: AI Agent Requests') {
                    if (filter.includes("Status IN ('Approved','Rejected','Responded','Expired')")) {
                        return { Success: true, Results: [answeredRequest] };
                    }
                    return { Success: true, Results: [] };
                }
                return { Success: true, Results: [] };
            }),
            RunViews: vi.fn(async () => [
                { Success: true, Results: [{ ParentID: 'graph-human' }] },
                { Success: true, Results: [{ ID: 'graph-human' }] },
                { Success: true, Results: [] },
            ]),
        };

        const spyFromProvider = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rvMock as unknown as RunView);

        const provider: IMetadataProvider = {
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: Tasks') {
                    const holder: { Load: (id: string) => Promise<boolean> } = {
                        Load: async (id: string) => {
                            if (id !== parent1.ID) return false;
                            await parent1.Load(id);
                            Object.assign(holder, parent1);
                            return true;
                        },
                    };
                    return holder;
                }
                return { Load: vi.fn().mockResolvedValue(false), Save: vi.fn().mockResolvedValue(true) };
            }),
        } as unknown as IMetadataProvider;

        const actionRunner: TaskActionRunner = {
            RunActionForTask: vi.fn().mockResolvedValue({ Success: true, Output: {} }),
        };
        const agentRunner: TaskAgentRunner = {
            RunAgentForTask: vi.fn().mockResolvedValue({ Success: true, AgentRunID: 'ar-1', Output: {} }),
        };

        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            { InstanceID: 'test-disp-human', MaxConcurrentTasks: 5 },
            undefined,
            undefined,
            actionRunner,
        );
        (dispatcher as unknown as { cachedWorkflowTaskTypeID: string; running: boolean }).cachedWorkflowTaskTypeID = WORKFLOW_TYPE_ID;
        (dispatcher as unknown as { running: boolean }).running = true;

        const claimsStub = (dispatcher as unknown as {
            claims: {
                TryClaim: ReturnType<typeof vi.fn>;
                TryUpdateParentProgress: ReturnType<typeof vi.fn>;
                TrySettleParent: ReturnType<typeof vi.fn>;
            };
        }).claims;
        claimsStub.TryClaim = vi.fn().mockResolvedValue(false);
        claimsStub.TryUpdateParentProgress = vi.fn().mockResolvedValue(true);
        claimsStub.TrySettleParent = vi.fn().mockResolvedValue(true);

        await (dispatcher as unknown as { pollOnce(): Promise<void> }).pollOnce();

        // Human sweeps did NOT re-query `MJ: Tasks` because `pendingHumanTasks` was passed in memory
        expect(humanTasksTableQueries).toBe(0);
        // The human task settled to Complete, triggering a reload of `loadGraphState` (and reusing `graph.parent`)
        expect(humanTask.Status).toBe('Complete');
        expect(childTasksLoads).toBe(2);
        // Even with the reload after human settlement, `parent1.Load` was called only ONCE!
        expect(parent1.Load).toHaveBeenCalledTimes(1);

        spyFromProvider.mockRestore();
    });

    it('executes a claimed task with 0 pre-execution DB queries when given a pre-hydrated ClaimedTaskCandidate', async () => {
        const parent1 = makeParentRecord('graph-1', 'Workflow 1', { recordId: 'rec-999' });
        const upstreamTask = makeChildTask({
            ID: 'g1-t1',
            ParentID: 'graph-1',
            Name: 'Upstream Step',
            Status: 'Complete',
            StepType: 'Action',
            ActionID: 'act-1',
            OutputPayload: JSON.stringify({ computedTotal: 1250 }),
        });
        const claimedTask = makeChildTask({
            ID: 'g1-t2',
            ParentID: 'graph-1',
            Name: 'Downstream Step',
            Status: 'Pending',
            StepType: 'Action',
            ActionID: 'act-2',
            InputPayload: JSON.stringify({}),
            ConfigurationObject: {
                inputMapping: JSON.stringify({
                    Total: 'payload.computedTotal',
                    RecordID: 'data.recordId',
                    Env: 'context.env',
                }),
            },
        });

        const getEntityObjectSpy = vi.fn().mockRejectedValue(
            new Error('GetEntityObject should not be called during pre-hydrated executeClaimed'),
        );
        const runViewSpy = vi.fn().mockRejectedValue(
            new Error('RunView should not be called during pre-hydrated executeClaimed'),
        );
        const spyFromProvider = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: runViewSpy,
            RunViews: runViewSpy,
        } as unknown as RunView);

        const provider = {
            GetEntityObject: getEntityObjectSpy,
        } as unknown as IMetadataProvider;

        const actionInputs: unknown[] = [];
        const actionRunner: TaskActionRunner = {
            RunActionForTask: vi.fn(async (params) => {
                actionInputs.push(params.InputPayload);
                return { Success: true, Output: { completed: true } };
            }),
        };
        const agentRunner: TaskAgentRunner = {
            RunAgentForTask: vi.fn().mockResolvedValue({ Success: true, AgentRunID: 'ar-1', Output: {} }),
        };

        const dispatcher = new TaskGraphDispatcher(
            { CreateProvider: async () => provider },
            agentRunner,
            TEST_USER,
            { InstanceID: 'test-disp-2', MaxConcurrentTasks: 5 },
            undefined,
            undefined,
            actionRunner,
        );

        const claimsStub = (dispatcher as unknown as {
            claims: {
                CompleteClaimed: ReturnType<typeof vi.fn>;
                Heartbeat: ReturnType<typeof vi.fn>;
            };
        }).claims;
        claimsStub.CompleteClaimed = vi.fn().mockResolvedValue(true);
        claimsStub.Heartbeat = vi.fn().mockResolvedValue(true);

        const candidate: ClaimedTaskCandidate = {
            ID: claimedTask.ID,
            taskId: claimedTask.ID,
            ParentID: claimedTask.ParentID,
            Name: claimedTask.Name,
            taskEntity: claimedTask,
            parentTask: parent1 as unknown as MJTaskEntity,
            parentMetadata: ParseTaskGraphParentMetadata(parent1.InputPayload),
            dependencyOutputs: new Map<string, unknown>([
                [upstreamTask.ID, { computedTotal: 1250 }],
            ]),
        };

        await (dispatcher as unknown as {
            executeClaimed(taskOrID: string | ClaimedTaskCandidate, prehydrated?: Partial<ClaimedTaskCandidate>): Promise<void>;
        }).executeClaimed(candidate);

        // Zero DB loads occurred during executeClaimed
        expect(claimedTask.Load).not.toHaveBeenCalled();
        expect(parent1.Load).not.toHaveBeenCalled();
        expect(getEntityObjectSpy).not.toHaveBeenCalled();
        expect(runViewSpy).not.toHaveBeenCalled();

        // Action ran with merged dependency outputs and parent invocation data/context
        expect(actionInputs).toEqual([
            {
                Total: 1250,
                RecordID: 'rec-999',
                Env: 'test',
            },
        ]);
        expect(claimsStub.CompleteClaimed).toHaveBeenCalledTimes(1);

        spyFromProvider.mockRestore();
    });
});

describe('TaskGraphService.Submit & persistComputedLayout parallelization (Item 2.3)', () => {
    it('parallelizes child task and dependency saves in TaskGraphService.Submit and preserves tempId -> ID mapping', async () => {
        const saveTimestamps: Array<{ kind: 'child' | 'dep'; start: number; end: number }> = [];
        let taskCounter = 0;
        let depCounter = 0;

        const provider: IMetadataProvider = {
            GetEntityObject: vi.fn(async (entityName: string) => {
                if (entityName === 'MJ: Tasks') {
                    const idx = ++taskCounter;
                    const id = `00000000-0000-4000-8000-00000000000${idx}`;
                    return {
                        ID: id,
                        Name: '',
                        NewRecord: vi.fn(),
                        Load: vi.fn().mockResolvedValue(true),
                        Save: vi.fn(async () => {
                            if (idx > 1) {
                                const start = Date.now();
                                await new Promise((r) => setTimeout(r, 20));
                                saveTimestamps.push({ kind: 'child', start, end: Date.now() });
                            }
                            return true;
                        }),
                    };
                }
                if (entityName === 'MJ: Task Dependencies') {
                    const idx = ++depCounter;
                    return {
                        ID: `dep-${idx}`,
                        TaskID: '',
                        DependsOnTaskID: '',
                        NewRecord: vi.fn(),
                        Save: vi.fn(async () => {
                            const start = Date.now();
                            await new Promise((r) => setTimeout(r, 20));
                            saveTimestamps.push({ kind: 'dep', start, end: Date.now() });
                            return true;
                        }),
                    };
                }
                return {
                    ID: WORKFLOW_TYPE_ID,
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
                    return {
                        Success: true,
                        Results: [
                            { ID: 'act-1', Name: 'Action One' },
                            { ID: 'act-2', Name: 'Action Two' },
                            { ID: 'act-3', Name: 'Action Three' },
                        ],
                    };
                }
                return { Success: true, Results: [] };
            }),
        };
        const spyFromProvider = vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(rvMock as unknown as RunView);

        const spec: TaskGraphSpec = {
            workflowName: 'Parallel Submit Test',
            continuation: 'none',
            tasks: [
                { tempId: 'n1', name: 'Node 1', kind: 'Action', configuration: { actionName: 'Action One' } },
                { tempId: 'n2', name: 'Node 2', kind: 'Action', configuration: { actionName: 'Action Two' }, dependsOn: ['n1'] },
                { tempId: 'n3', name: 'Node 3', kind: 'Action', configuration: { actionName: 'Action Three' }, dependsOn: ['n1', 'n2'] },
            ],
        };

        const service = new TaskGraphService();
        const result = await service.Submit(spec, { Provider: provider, ContextUser: TEST_USER });

        expect(result.Success).toBe(true);
        expect(result.ParentTaskID).toBe('00000000-0000-4000-8000-000000000001');
        expect(result.TaskIDMap?.get('n1')).toBe('00000000-0000-4000-8000-000000000002');
        expect(result.TaskIDMap?.get('n2')).toBe('00000000-0000-4000-8000-000000000003');
        expect(result.TaskIDMap?.get('n3')).toBe('00000000-0000-4000-8000-000000000004');

        const childSaves = saveTimestamps.filter((s) => s.kind === 'child');
        const depSaves = saveTimestamps.filter((s) => s.kind === 'dep');
        expect(childSaves).toHaveLength(3);
        expect(depSaves).toHaveLength(3);

        // Verify child saves overlapped in time (concurrent Promise.all execution)
        const childMaxStart = Math.max(...childSaves.map((s) => s.start));
        const childMinEnd = Math.min(...childSaves.map((s) => s.end));
        expect(childMaxStart).toBeLessThanOrEqual(childMinEnd);

        // Verify dependency saves overlapped in time (concurrent Promise.all execution)
        const depMaxStart = Math.max(...depSaves.map((s) => s.start));
        const depMinEnd = Math.min(...depSaves.map((s) => s.end));
        expect(depMaxStart).toBeLessThanOrEqual(depMinEnd);

        spyFromProvider.mockRestore();
    });

    it('parallelizes task.Save() calls in TaskGraphDispatcher.persistComputedLayout', async () => {
        const saveIntervals: Array<{ start: number; end: number }> = [];
        const t1 = makeChildTask({ ID: 'layout-1', ParentID: 'graph-1', Name: 'Step 1', Status: 'Complete' });
        const t2 = makeChildTask({ ID: 'layout-2', ParentID: 'graph-1', Name: 'Step 2', Status: 'Complete' });
        const t3 = makeChildTask({ ID: 'layout-3', ParentID: 'graph-1', Name: 'Step 3', Status: 'Complete' });

        for (const t of [t1, t2, t3]) {
            t.Save = vi.fn(async () => {
                const start = Date.now();
                await new Promise((r) => setTimeout(r, 20));
                saveIntervals.push({ start, end: Date.now() });
                return true;
            });
        }

        const dispatcher = Object.create(TaskGraphDispatcher.prototype) as {
            persistComputedLayout(graph: {
                entityById: Map<string, MJTaskEntity>;
                edges: Array<{ taskId: string; dependsOnTaskId: string; dependencyType: 'FinishToStart' }>;
            }): Promise<void>;
        };

        await dispatcher.persistComputedLayout({
            entityById: new Map<string, MJTaskEntity>([
                [t1.ID, t1],
                [t2.ID, t2],
                [t3.ID, t3],
            ]),
            edges: [
                { taskId: t2.ID, dependsOnTaskId: t1.ID, dependencyType: 'FinishToStart' },
                { taskId: t3.ID, dependsOnTaskId: t2.ID, dependencyType: 'FinishToStart' },
            ],
        });

        expect(saveIntervals).toHaveLength(3);
        const maxStart = Math.max(...saveIntervals.map((s) => s.start));
        const minEnd = Math.min(...saveIntervals.map((s) => s.end));
        expect(maxStart).toBeLessThanOrEqual(minEnd);

        for (const t of [t1, t2, t3]) {
            const parsed = JSON.parse(t.Configuration!) as { layout?: { x: number; y: number } };
            expect(parsed.layout).toBeDefined();
            expect(typeof parsed.layout?.x).toBe('number');
            expect(typeof parsed.layout?.y).toBe('number');
        }
    });
});
