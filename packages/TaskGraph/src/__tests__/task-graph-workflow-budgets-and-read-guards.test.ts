/**
 * Unit tests for MJ-9 (Whole-Workflow USD Cost & Wall-Clock Duration Caps) and
 * MJ-10 (Zero Silent Decision-Read Row-Cap Enforcement) in `@memberjunction/task-graph`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    RunView,
    RunViewDecisionReadTruncatedError,
    type IMetadataProvider,
    type RunViewParams,
    type RunViewResult,
    type UserInfo,
} from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { TaskClaimStore } from '../TaskClaimStore';
import { TaskGraphDispatcher } from '../TaskGraphDispatcher';
import { TaskGraphGovernanceCoordinator } from '../TaskGraphGovernanceCoordinator';
import { BuildTaskGraphParentInputPayload, ParseTaskGraphParentMetadata } from '../TaskGraphService';
import { ResolveRecordsByNameOrToolName } from '../resolve-by-tool-name';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return {
        ...actual,
        LogError: vi.fn(),
        LogStatus: vi.fn(),
        LogWarning: vi.fn(),
    };
});

function createParentTaskEntity(args: {
    id: string;
    workflowMaxCostUsd?: number;
    workflowMaxDurationMs?: number;
    startedAtMs?: number;
}): MJTaskEntity {
    const startedAtMs = args.startedAtMs ?? Date.now();
    const inputPayload = BuildTaskGraphParentInputPayload({
        continuation: 'none',
        reinvokeDepth: 0,
        failureSemantics: 'block',
        submittedByAgentRunID: null,
        submittedByUserID: 'user-wf-1',
        submittedByAgentID: 'agent-wf-1',
        workflowBudget: {
            ...(args.workflowMaxCostUsd !== undefined ? { MaxCostUsd: args.workflowMaxCostUsd } : {}),
            ...(args.workflowMaxDurationMs !== undefined ? { MaxWallClockMs: args.workflowMaxDurationMs } : {}),
            StartedAtMs: startedAtMs,
        },
    });
    return {
        ID: args.id,
        ParentID: null,
        TypeID: 'wf-type-id',
        AgentID: 'agent-wf-1',
        UserID: 'user-wf-1',
        Status: 'In Progress',
        StartedAt: new Date(startedAtMs),
        InputPayload: JSON.stringify(inputPayload),
    } as MJTaskEntity;
}

function createChildTaskEntity(id: string, parentId: string, name: string): MJTaskEntity {
    return {
        ID: id,
        ParentID: parentId,
        Name: name,
        Status: 'In Progress',
        AttemptCount: 0,
        StartedAt: new Date(),
        Configuration: null,
    } as MJTaskEntity;
}

describe('MJ-9: TaskGraph Whole-Workflow USD Cost & Wall-Clock Duration Caps', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('round-trips workflowBudget metadata in BuildTaskGraphParentInputPayload / ParseTaskGraphParentMetadata', () => {
        const startedAtMs = 1_700_000_000_000;
        const payload = BuildTaskGraphParentInputPayload({
            continuation: 'message',
            reinvokeDepth: 0,
            failureSemantics: 'block',
            submittedByAgentRunID: null,
            submittedByUserID: 'u-1',
            workflowBudget: {
                MaxCostUsd: 0.75,
                MaxWallClockMs: 45_000,
                StartedAtMs: startedAtMs,
            },
        });
        const parsed = ParseTaskGraphParentMetadata(JSON.stringify(payload));
        expect(parsed.governanceEnabled).toBe(true);
        expect(parsed.workflowBudget).toEqual({
            MaxCostUsd: 0.75,
            MaxWallClockMs: 45_000,
            StartedAtMs: startedAtMs,
        });
    });

    it('tracks remaining USD headroom across settled nodes and blocks dispatch once workflow MaxCostUsd is reached', async () => {
        const graphID = '11111111-1111-4111-8111-111111111111';
        const node1ID = '22222222-2222-4222-8222-222222222221';
        const node2ID = '22222222-2222-4222-8222-222222222222';
        const startMs = Date.now() - 200;
        const parent = createParentTaskEntity({
            id: graphID,
            workflowMaxCostUsd: 0.25,
            workflowMaxDurationMs: 60_000,
            startedAtMs: startMs,
        });
        const node1 = createChildTaskEntity(node1ID, graphID, 'Step 1');
        const node2 = createChildTaskEntity(node2ID, graphID, 'Step 2');

        const coordinator = new TaskGraphGovernanceCoordinator({ Enabled: true });
        const contextUser = { ID: 'user-wf-1', Type: 'Owner' } as UserInfo;
        const mockProvider = { CurrentUser: contextUser } as IMetadataProvider;

        // Pre-dispatch before any spend: allowed with full headroom
        const checkBefore = await coordinator.CheckWorkflowBudgetBeforeDispatch({
            Provider: mockProvider,
            ContextUser: contextUser,
            GraphID: graphID,
            Parent: parent,
            Task: node1,
            NowMs: startMs + 50,
        });
        expect(checkBefore.Exceeded).toBe(false);

        // Node 1 settles with $0.18 spend -> remaining = $0.07
        await coordinator.RecordNodeSettlementAndEvaluate({
            Provider: mockProvider,
            ContextUser: contextUser,
            Parent: parent,
            Task: node1,
            Success: true,
            CostUsd: 0.18,
            TokensUsed: 500,
        });
        const ctxAfterNode1 = coordinator.GetWorkflowBudgetContext(graphID, parent, startMs + 100);
        expect(ctxAfterNode1?.WorkflowMaxCostUsd).toBe(0.25);
        expect(ctxAfterNode1?.CumulativeCostUsd).toBeCloseTo(0.18, 6);
        expect(ctxAfterNode1?.RemainingCostUsd).toBeCloseTo(0.07, 6);

        // Node 2 settles with $0.10 spend -> total $0.28 >= $0.25
        await coordinator.RecordNodeSettlementAndEvaluate({
            Provider: mockProvider,
            ContextUser: contextUser,
            Parent: parent,
            Task: node2,
            Success: true,
            CostUsd: 0.10,
            TokensUsed: 400,
        });

        const checkAfter = await coordinator.CheckWorkflowBudgetBeforeDispatch({
            Provider: mockProvider,
            ContextUser: contextUser,
            GraphID: graphID,
            Parent: parent,
            Task: node2,
            NowMs: startMs + 250,
        });
        expect(checkAfter.Exceeded).toBe(true);
        expect(checkAfter.Diagnostic?.Code).toBe('WORKFLOW_COST_LIMIT_EXCEEDED');
        expect(checkAfter.Diagnostic?.Dimension).toBe('CostUsd');
        expect(checkAfter.Diagnostic?.CumulativeCostUsd).toBeCloseTo(0.28, 6);
        expect(checkAfter.Diagnostic?.ElapsedWallClockMs).toBeGreaterThanOrEqual(200);
        expect(checkAfter.Diagnostic?.BreachingTaskID).toBe(node2ID);

        const diag = coordinator.GetGraphDiagnostics(graphID);
        expect(diag?.LastLimitExceeded?.Code).toBe('WORKFLOW_COST_LIMIT_EXCEEDED');
        const blocked = await coordinator.IsGraphBlockedByGovernance(
            mockProvider,
            graphID,
            { paused: false },
            parent,
            contextUser,
        );
        expect(blocked).toBe(true);
    });

    it('enforces whole-workflow wall-clock duration cap before dispatching downstream nodes', async () => {
        const graphID = '33333333-3333-4333-8333-333333333331';
        const nodeID = '44444444-4444-4444-8444-444444444441';
        const startMs = Date.now() - 10_000;
        const parent = createParentTaskEntity({
            id: graphID,
            workflowMaxCostUsd: 5.0,
            workflowMaxDurationMs: 2_000,
            startedAtMs: startMs,
        });
        const node = createChildTaskEntity(nodeID, graphID, 'Delayed Step');

        const coordinator = new TaskGraphGovernanceCoordinator({ Enabled: true });
        const contextUser = { ID: 'user-wf-1', Type: 'Owner' } as UserInfo;
        const mockProvider = { CurrentUser: contextUser } as IMetadataProvider;

        const check = await coordinator.CheckWorkflowBudgetBeforeDispatch({
            Provider: mockProvider,
            ContextUser: contextUser,
            GraphID: graphID,
            Parent: parent,
            Task: node,
            NowMs: startMs + 3_500,
        });
        expect(check.Exceeded).toBe(true);
        expect(check.Diagnostic?.Code).toBe('WORKFLOW_DURATION_LIMIT_EXCEEDED');
        expect(check.Diagnostic?.Dimension).toBe('WallClockMs');
        expect(check.Diagnostic?.Limit).toBe(2_000);
        expect(check.Diagnostic?.ElapsedWallClockMs).toBe(3_500);
    });
});

describe('MJ-10: Zero Silent Decision-Read Row-Cap Enforcement in TaskGraph', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('ResolveRecordsByNameOrToolName fails loudly instead of reporting missing records on truncated RunView', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: async () => ({
                Success: true,
                Results: [{ ID: 'id-1', Name: 'ActionA' }],
                RowCount: 1,
                TotalRowCount: 12,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserView: {} as RunViewResult<{ ID: string; Name: string }>['UserView'],
            }),
        } as RunView);

        const resolved = await ResolveRecordsByNameOrToolName({
            EntityName: 'MJ: Actions',
            Names: ['ActionA', 'ActionB'],
            Provider: {} as IMetadataProvider,
            ContextUser: { ID: 'u-1' } as UserInfo,
        });
        expect(resolved.Success).toBe(false);
        expect(resolved.ErrorMessage).toContain('truncat');
    });

    it('TaskGraphDispatcher.findActiveGraphIDs throws RunViewDecisionReadTruncatedError when TotalRowCount exceeds Results', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunViews: async (queries: RunViewParams[]) =>
                queries.map(() => ({
                    Success: true,
                    Results: [{ ParentID: 'AAAAAAAA-0000-4000-8000-000000000001', ID: 'AAAAAAAA-0000-4000-8000-000000000001' }],
                    RowCount: 1,
                    TotalRowCount: 1005,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserView: {} as RunViewResult<{ ID: string }>['UserView'],
                })),
        } as RunView);

        const dispatcher = Object.create(TaskGraphDispatcher.prototype) as {
            findActiveGraphIDs(provider: IMetadataProvider): Promise<string[]>;
        };
        Object.assign(dispatcher, {
            cachedWorkflowTaskTypeID: 'wf-type-1',
            retryingSettlement: new Map<string, number>(),
            contextUser: { ID: 'u-1' } as UserInfo,
        });

        await expect(dispatcher.findActiveGraphIDs({} as IMetadataProvider)).rejects.toBeInstanceOf(
            RunViewDecisionReadTruncatedError,
        );
    });

    it('TaskGraphDispatcher.loadGraphState throws RunViewDecisionReadTruncatedError instead of running a partial DAG', async () => {
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({
            RunView: async () => ({
                Success: true,
                Results: [createChildTaskEntity('c-1', 'p-1', 'Child 1')],
                RowCount: 1,
                TotalRowCount: 50,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserView: {} as RunViewResult<MJTaskEntity>['UserView'],
            }),
        } as RunView);

        const dispatcher = Object.create(TaskGraphDispatcher.prototype) as {
            loadGraphState(provider: IMetadataProvider, parentTaskID: string): Promise<Record<string, string>>;
        };
        Object.assign(dispatcher, {
            contextUser: { ID: 'u-1' } as UserInfo,
            claims: new TaskClaimStore('inst-1', 60),
        });

        await expect(dispatcher.loadGraphState({} as IMetadataProvider, 'p-1')).rejects.toBeInstanceOf(
            RunViewDecisionReadTruncatedError,
        );
    });

    it('TaskGraphGovernanceCoordinator.syncSettledNodesFromStore and loadRunMetricsLookup fail closed with RunViewDecisionReadTruncatedError on truncated reads', async () => {
        const capturedQueries: RunViewParams[] = [];
        const parent = createParentTaskEntity({
            id: 'graph-trunc-1',
            workflowMaxCostUsd: 1.0,
        });
        const node1 = createChildTaskEntity('task-1', 'graph-trunc-1', 'Node 1');
        const fakeRunView: Pick<RunView, 'RunView' | 'RunViews'> = {
            RunView: async <T = Record<string, string | number | boolean | null>>(params: RunViewParams) => {
                capturedQueries.push(params);
                if (params.EntityName === 'MJ: Tasks' && params.ExtraFilter?.includes("ParentID='graph-trunc-1'")) {
                    return {
                        Success: true,
                        Results: [{ ID: 'task-1', Status: 'Complete', AgentRunID: null, StartedAt: null, CompletedAt: null, __mj_UpdatedAt: null, Configuration: null }] as T[],
                        RowCount: 1,
                        TotalRowCount: 500,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        UserView: {} as RunViewResult<T>['UserView'],
                    };
                }
                return {
                    Success: true,
                    Results: [] as T[],
                    RowCount: 0,
                    TotalRowCount: 0,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserView: {} as RunViewResult<T>['UserView'],
                };
            },
            RunViews: async <T = Record<string, string | number | boolean | null>>(queries: RunViewParams[]) => {
                capturedQueries.push(...queries);
                return queries.map(() => ({
                    Success: true,
                    Results: [{ ID: 'run-1', TotalCostRollup: 0.1, TotalCost: 0.1 }] as T[],
                    RowCount: 1,
                    TotalRowCount: 250,
                    ExecutionTime: 1,
                    ErrorMessage: '',
                    UserView: {} as RunViewResult<T>['UserView'],
                }));
            },
        };
        vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue(fakeRunView as RunView);

        const coordinator = new TaskGraphGovernanceCoordinator(new TaskClaimStore('inst-1', 60), { Enabled: true });
        const contextUser = { ID: 'u-1', Type: 'Owner' } as UserInfo;
        const provider = {
            CurrentUser: contextUser,
            RunView: fakeRunView.RunView,
        } as Partial<IMetadataProvider> as IMetadataProvider;

        await expect(
            coordinator.RecordNodeSettlementAndEvaluate({
                Provider: provider,
                ContextUser: contextUser,
                Parent: parent,
                Task: node1,
                Success: true,
                CostUsd: 0.1,
                TokensUsed: 100,
            }),
        ).rejects.toBeInstanceOf(RunViewDecisionReadTruncatedError);
        const syncQuery = capturedQueries.find(
            (q) => q.EntityName === 'MJ: Tasks' && q.ExtraFilter?.includes("ParentID='graph-trunc-1'"),
        );
        expect(syncQuery?.IgnoreMaxRows).toBe(true);

        // Now test loadRunMetricsLookup truncation via ResolveOrRecoverNodeSettlementMetrics with an AgentRunID
        capturedQueries.length = 0;
        await expect(
            coordinator.ResolveOrRecoverNodeSettlementMetrics(provider, 'graph-trunc-1', parent, contextUser, {
                AgentRunID: 'run-1',
            }),
        ).rejects.toBeInstanceOf(RunViewDecisionReadTruncatedError);
        const metricsQuery = capturedQueries.find((q) => q.EntityName === 'MJ: AI Agent Runs');
        expect(metricsQuery?.IgnoreMaxRows).toBe(true);
    });
});
