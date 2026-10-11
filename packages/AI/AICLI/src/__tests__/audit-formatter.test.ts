/**
 * Unit tests for AuditFormatter's handling of dispatched workflows and run-level errors, and of the
 * run list's JSON rendering.
 */

import { describe, it, expect, vi } from 'vitest';

// Plain text, so assertions do not depend on colour codes. Every style, chained or not
// (`chalk.bold.red`), is another pass-through function.
vi.mock('chalk', () => {
    const identity = (s: string) => s;
    const handler: ProxyHandler<(s: string) => string> = {
        get: (_target, prop) => {
            if (prop === 'default' || prop === '__esModule') return _target;
            return new Proxy(identity, handler);
        },
        apply: (_target, _this, args: unknown[]) => String(args[0]),
    };
    return { default: new Proxy(identity, handler) };
});

vi.mock('table', () => ({
    table: (data: string[][]) => data.map(row => row.join(' | ')).join('\n'),
}));

import type { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import { AuditFormatter } from '../lib/audit-formatter';
import type { ErrorAnalysis, RunSummary } from '../services/AgentAuditService';

const SUMMARY: RunSummary = {
    runId: 'run-1',
    agentName: 'Lead Intake Flow',
    agentId: 'agent-1',
    status: 'Failed',
    startedAt: '2026-10-07T10:00:00.000Z',
    completedAt: '2026-10-07T10:01:00.000Z',
    duration: 60000,
    totalTokens: 1200,
    estimatedCost: 0.01,
    stepCount: 1,
    steps: [{ stepNumber: 1, stepId: 'step-1-uuid', stepName: 'Task Graph: Lead Intake', stepType: 'TaskGraph', status: 'Completed', duration: 1000 }],
    hasErrors: true,
    errorCount: 1,
    RunErrorMessage: 'Workflow failed: 1 task(s) failed',
    Workflow: {
        Status: 'Failed',
        TaskCount: 2,
        StatusCounts: { Complete: 1, Failed: 1 },
        FailedTasks: [{ TaskID: 't2', Name: 'Enrich Leads', Status: 'Failed', StepType: 'Agent', ErrorMessage: 'Rate limited', AgentRunID: 'run-2' }],
    },
};

const ANALYSIS: ErrorAnalysis = {
    runId: 'run-1',
    agentName: 'Lead Intake Flow',
    errorCount: 1,
    failedSteps: [],
    suggestedFixes: [],
    RunErrorMessage: 'Workflow failed: 1 task(s) failed',
    FailedTasks: SUMMARY.Workflow?.FailedTasks,
};

describe('AuditFormatter', () => {
    const formatter = new AuditFormatter();

    describe('FormatRunSummary', () => {
        it('shows the dispatched workflow and its failed tasks in compact mode', () => {
            const output = formatter.FormatRunSummary(SUMMARY, 'compact');
            expect(output).toContain('Run Error:      Workflow failed: 1 task(s) failed');
            expect(output).toContain('Dispatched Workflow:');
            expect(output).toContain('Tasks:          2 (Complete 1, Failed 1)');
            expect(output).toContain('✗ Enrich Leads');
            expect(output).toContain('Rate limited');
            expect(output).toContain('mj ai audit agent-run run-2 --errors');
        });

        it('shows them in markdown, and points at the real audit command', () => {
            const output = formatter.FormatRunSummary(SUMMARY, 'markdown');
            expect(output).toContain('## Dispatched Workflow');
            expect(output).toContain('**Enrich Leads**');
            expect(output).toContain('- **Run Error**: Workflow failed: 1 task(s) failed');
            expect(output).toContain('mj ai audit agent-run run-1 --errors');
            expect(output).not.toContain('mj ai agent-audit');
        });

        it('adds workflow rows to the table', () => {
            const output = formatter.FormatRunSummary(SUMMARY, 'table');
            expect(output).toContain('Workflow Tasks | 2 (Complete 1, Failed 1)');
            expect(output).toContain('Failed Tasks | Enrich Leads: Rate limited');
        });

        it('carries the workflow in JSON', () => {
            const parsed = JSON.parse(formatter.FormatRunSummary(SUMMARY, 'json'));
            expect(parsed.Workflow.FailedTasks[0].Name).toBe('Enrich Leads');
            expect(parsed.RunErrorMessage).toBe('Workflow failed: 1 task(s) failed');
        });

        it('leaves the workflow section out for a run that dispatched none', () => {
            const output = formatter.FormatRunSummary({ ...SUMMARY, Workflow: undefined }, 'compact');
            expect(output).not.toContain('Dispatched Workflow');
        });
    });

    describe('FormatRunSummary token usage', () => {
        const WITH_TOKENS: RunSummary = {
            ...SUMMARY,
            Workflow: undefined,
            totalTokens: 6504,
            estimatedCost: 0.0123,
            CostSource: 'Recorded',
            Tokens: { UncachedInput: 4, CacheRead: 5000, CacheWrite: 1200, TotalInput: 6204, Output: 300 },
        };

        it('shows total input with its buckets, and the recorded cost, in compact mode', () => {
            const output = formatter.FormatRunSummary(WITH_TOKENS, 'compact');
            expect(output).toContain('Total Tokens:   6,504 (input 6,204 + output 300)');
            expect(output).toContain('Input Tokens:   6,204 = uncached 4 + cache read 5,000 + cache write 1,200');
            expect(output).toContain('Cost:           $0.0123');
            expect(output).not.toContain('Estimated Cost');
        });

        it('shows the same in markdown and table', () => {
            expect(formatter.FormatRunSummary(WITH_TOKENS, 'markdown'))
                .toContain('- **Input Tokens**: 6,204 = uncached 4 + cache read 5,000 + cache write 1,200');
            expect(formatter.FormatRunSummary(WITH_TOKENS, 'table'))
                .toContain('Total Tokens | 6,504 (input 6,204 + output 300)');
        });

        it('labels a flat estimate as one', () => {
            const output = formatter.FormatRunSummary({ ...WITH_TOKENS, CostSource: 'Estimated' }, 'compact');
            expect(output).toContain('Estimated Cost: $0.0123');
        });

        it('still renders a summary built without the token breakdown', () => {
            const output = formatter.FormatRunSummary(SUMMARY, 'compact');
            expect(output).toContain('Total Tokens:   1,200\n');
            expect(output).toContain('Estimated Cost: $0.0100');
            expect(output).not.toContain('Input Tokens');
        });
    });

    describe('FormatErrorAnalysis', () => {
        it('lists the failed workflow tasks in compact mode', () => {
            const output = formatter.FormatErrorAnalysis(ANALYSIS, 'compact');
            expect(output).toContain('Found 0 failed step(s) and 1 failed workflow task(s)');
            expect(output).toContain('Failed Workflow Tasks:');
            expect(output).toContain('Enrich Leads');
            expect(output).toContain('Workflow failed: 1 task(s) failed');
        });

        it('lists them in markdown', () => {
            const output = formatter.FormatErrorAnalysis(ANALYSIS, 'markdown');
            expect(output).toContain('## Failed Workflow Tasks');
            expect(output).toContain('**Enrich Leads**');
        });

        it('keeps the old wording when there are no failed tasks', () => {
            const output = formatter.FormatErrorAnalysis({ ...ANALYSIS, FailedTasks: [], RunErrorMessage: undefined }, 'compact');
            expect(output).toContain('Found 0 failed step(s)');
            expect(output).not.toContain('workflow task');
        });
    });

    describe('FormatRunList', () => {
        it('renders entity objects as JSON through GetAll()', () => {
            const run = { GetAll: () => ({ ID: 'run-1', Agent: 'Lead Intake Flow', Status: 'Completed' }) } as unknown as MJAIAgentRunEntity;
            const parsed = JSON.parse(formatter.FormatRunList([run], 'json'));
            expect(parsed).toEqual([{ ID: 'run-1', Agent: 'Lead Intake Flow', Status: 'Completed' }]);
        });

        it('points at the real audit command', () => {
            const run = { ID: 'run-1-uuid', Agent: 'Lead Intake Flow', Status: 'Completed', StartedAt: new Date(), CompletedAt: null } as unknown as MJAIAgentRunEntity;
            expect(formatter.FormatRunList([run], 'compact')).toContain('mj ai audit agent-run <run-id>');
        });
    });
});
