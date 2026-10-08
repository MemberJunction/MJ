/**
 * Unit tests for SummarizeWorkflowTasks: a run that handed its workflow to the task-graph dispatcher
 * records its failures on `MJ: Tasks`, not on its own steps, and the audit has to find them there.
 */

import { describe, it, expect } from 'vitest';
import { SummarizeWorkflowTasks, ToWorkflowTaskInfo, WorkflowTaskRow } from '../lib/workflow-tasks';

function task(overrides: Partial<WorkflowTaskRow>): WorkflowTaskRow {
    return {
        ID: 'task-x',
        Name: 'Task',
        Status: 'Complete',
        StepType: 'Agent',
        ErrorMessage: null,
        AgentRunID: null,
        ParentID: 'graph-1',
        ...overrides,
    };
}

describe('SummarizeWorkflowTasks', () => {
    it('returns undefined for a run that dispatched no workflow', () => {
        expect(SummarizeWorkflowTasks([])).toBeUndefined();
    });

    it('counts the work tasks by status and lists the failed ones', () => {
        const summary = SummarizeWorkflowTasks([
            task({ ID: 'graph-1', Name: 'Lead Intake', Status: 'Failed', StepType: null, ParentID: null, AgentRunID: 'run-1' }),
            task({ ID: 't1', Name: 'Score Leads', Status: 'Complete' }),
            task({ ID: 't2', Name: 'Enrich Leads', Status: 'Failed', ErrorMessage: 'Rate limited by enrichment API', AgentRunID: 'run-2' }),
            task({ ID: 't3', Name: 'Notify Sales', Status: 'Skipped', StepType: 'Action' }),
        ]);

        expect(summary).toEqual({
            Status: 'Failed',
            TaskCount: 3,
            StatusCounts: { Complete: 1, Failed: 1, Skipped: 1 },
            FailedTasks: [{
                TaskID: 't2',
                Name: 'Enrich Leads',
                Status: 'Failed',
                StepType: 'Agent',
                ErrorMessage: 'Rate limited by enrichment API',
                AgentRunID: 'run-2',
            }],
        });
    });

    it('reports a workflow that is still running', () => {
        const summary = SummarizeWorkflowTasks([
            task({ ID: 'graph-1', Status: 'In Progress', ParentID: null }),
            task({ ID: 't1', Status: 'Pending' }),
        ]);
        expect(summary?.Status).toBe('In Progress');
        expect(summary?.FailedTasks).toEqual([]);
    });
});

describe('ToWorkflowTaskInfo', () => {
    it('leaves out an empty error and an absent run', () => {
        const info = ToWorkflowTaskInfo(task({ ID: 't1', ErrorMessage: '', AgentRunID: null }));
        expect(info.ErrorMessage).toBeUndefined();
        expect(info.AgentRunID).toBeUndefined();
    });
});
