/**
 * Unit tests for AgentAuditService: `mj ai audit agent-run` must find a dispatched workflow's
 * failures on its tasks, list recent runs as the entity objects it promises, and filter
 * `--status success` on the status successful runs actually have.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface RunViewCall {
    EntityName: string;
    ExtraFilter?: string;
    ResultType?: string;
    Fields?: string[];
}

const db = vi.hoisted(() => ({
    calls: [] as RunViewCall[],
    run: null as Record<string, unknown> | null,
    steps: [] as Array<Record<string, unknown>>,
    graphParents: [] as Array<Record<string, unknown>>,
    graphChildren: [] as Array<Record<string, unknown>>,
    recentRuns: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {
        async GetEntityObject() {
            return {
                Load: async () => db.run !== null,
                get ID() { return db.run?.ID; },
                get Agent() { return db.run?.Agent; },
                get AgentID() { return db.run?.AgentID; },
                get Status() { return db.run?.Status; },
                get StartedAt() { return db.run?.StartedAt; },
                get CompletedAt() { return db.run?.CompletedAt; },
                get TotalTokensUsed() { return db.run?.TotalTokensUsed; },
                get ErrorMessage() { return db.run?.ErrorMessage; },
            };
        }
    },
    RunView: class {
        async RunView(params: RunViewCall) {
            db.calls.push(params);
            if (params.EntityName === 'MJ: AI Agent Run Steps') return { Success: true, Results: db.steps };
            if (params.EntityName === 'MJ: AI Agent Runs') return { Success: true, Results: db.recentRuns };
            if (params.EntityName === 'MJ: Tasks') {
                const isParentQuery = params.ExtraFilter?.includes('ParentID IS NULL');
                return { Success: true, Results: isParentQuery ? db.graphParents : db.graphChildren };
            }
            return { Success: false, ErrorMessage: `unexpected entity ${params.EntityName}` };
        }
    },
}));

vi.mock('../lib/mj-provider', () => ({ InitializeMJProvider: vi.fn(async () => ({})) }));

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { Users: [{ ID: 'user-1' }] },
}));

import { AgentAuditService } from '../services/AgentAuditService';

const RUN_ID = 'run-1';

describe('AgentAuditService', () => {
    beforeEach(() => {
        db.calls = [];
        db.run = {
            ID: RUN_ID,
            Agent: 'Lead Intake Flow',
            AgentID: 'agent-1',
            Status: 'Failed',
            StartedAt: new Date('2026-10-07T10:00:00Z'),
            CompletedAt: new Date('2026-10-07T10:01:00Z'),
            TotalTokensUsed: 1200,
            ErrorMessage: 'Workflow failed: 1 task(s) failed',
        };
        // The submitting run's own steps all succeeded: the work happened on the dispatcher.
        db.steps = [
            { ID: 'step-1', StepName: 'Workflow runs on the task-graph dispatcher', StepType: 'Decision', Status: 'Completed' },
            { ID: 'step-2', StepName: 'Task Graph: Lead Intake', StepType: 'TaskGraph', Status: 'Completed' },
        ];
        db.graphParents = [
            { ID: 'graph-1', Name: 'Lead Intake', Status: 'Failed', StepType: null, ErrorMessage: null, AgentRunID: RUN_ID, ParentID: null },
        ];
        db.graphChildren = [
            { ID: 't1', Name: 'Score Leads', Status: 'Complete', StepType: 'Agent', ErrorMessage: null, AgentRunID: 'run-2', ParentID: 'graph-1' },
            { ID: 't2', Name: 'Enrich Leads', Status: 'Failed', StepType: 'Action', ErrorMessage: 'Rate limited', AgentRunID: null, ParentID: 'graph-1' },
        ];
        db.recentRuns = [];
    });

    describe('GetRunSummary', () => {
        it('reports a dispatched workflow, counting its failed tasks as errors', async () => {
            const summary = await new AgentAuditService().GetRunSummary(RUN_ID, { includeStepList: true, maxTokens: 100 });

            expect(summary.Workflow).toEqual({
                Status: 'Failed',
                TaskCount: 2,
                StatusCounts: { Complete: 1, Failed: 1 },
                FailedTasks: [{ TaskID: 't2', Name: 'Enrich Leads', Status: 'Failed', StepType: 'Action', ErrorMessage: 'Rate limited', AgentRunID: undefined }],
            });
            expect(summary.errorCount).toBe(1);
            expect(summary.hasErrors).toBe(true);
            expect(summary.RunErrorMessage).toBe('Workflow failed: 1 task(s) failed');
        });

        it('finds the graph through its parent task, then everything under it', async () => {
            await new AgentAuditService().GetRunSummary(RUN_ID, { includeStepList: true, maxTokens: 100 });

            const taskQueries = db.calls.filter(call => call.EntityName === 'MJ: Tasks');
            expect(taskQueries).toHaveLength(2);
            expect(taskQueries[0].ExtraFilter).toBe(`AgentRunID = '${RUN_ID}' AND ParentID IS NULL`);
            expect(taskQueries[1].ExtraFilter).toBe(`RootParentID IN ('graph-1') AND ParentID IS NOT NULL`);
            expect(taskQueries[1].ResultType).toBe('simple');
        });

        it('makes one task query, and reports no workflow, for a run that dispatched none', async () => {
            db.graphParents = [];
            db.run = { ...db.run, Status: 'Completed', ErrorMessage: null };

            const summary = await new AgentAuditService().GetRunSummary(RUN_ID, { includeStepList: true, maxTokens: 100 });

            expect(summary.Workflow).toBeUndefined();
            expect(summary.errorCount).toBe(0);
            expect(summary.hasErrors).toBe(false);
            expect(db.calls.filter(call => call.EntityName === 'MJ: Tasks')).toHaveLength(1);
        });
    });

    describe('AnalyzeErrors', () => {
        // It used to report "Found 0 failed step(s)" for a workflow that had failed.
        it('includes the failed workflow tasks', async () => {
            const analysis = await new AgentAuditService().AnalyzeErrors(RUN_ID);

            expect(analysis.failedSteps).toEqual([]);
            expect(analysis.FailedTasks?.map(task => task.Name)).toEqual(['Enrich Leads']);
            expect(analysis.errorCount).toBe(1);
            expect(analysis.RunErrorMessage).toBe('Workflow failed: 1 task(s) failed');
        });
    });

    describe('ListRecentRuns', () => {
        it('loads entity objects, as its return type promises', async () => {
            await new AgentAuditService().ListRecentRuns({ status: 'all', days: 7, limit: 10 });

            const call = db.calls.find(c => c.EntityName === 'MJ: AI Agent Runs');
            expect(call?.ResultType).toBe('entity_object');
        });

        // There is no 'Success' status; a successful run is 'Completed'.
        it('filters --status success on Completed', async () => {
            await new AgentAuditService().ListRecentRuns({ status: 'success', days: 7, limit: 10 });

            const call = db.calls.find(c => c.EntityName === 'MJ: AI Agent Runs');
            expect(call?.ExtraFilter).toContain(`Status = 'Completed'`);
        });
    });
});
