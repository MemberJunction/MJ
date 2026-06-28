/**
 * Tests for the Scheduling dashboard's pure agent-context helpers:
 * - buildSchedulingAgentContext: state snapshot → agent context object
 * - isValidSchedulingTab: tab validation for the SwitchSchedulingTab client tool
 */
import { describe, it, expect } from 'vitest';
import {
    buildSchedulingAgentContext,
    isValidSchedulingTab,
    SchedulingAgentContextInput,
    SchedulingJobSnapshot,
} from '../Scheduling/scheduling-agent-context';

function makeJob(overrides: Partial<SchedulingJobSnapshot> = {}): SchedulingJobSnapshot {
    return {
        JobId: 'job-1',
        JobName: 'Nightly Sync',
        JobType: 'Action',
        Status: 'Active',
        SuccessRate: 1,
        TotalRuns: 10,
        CronExpression: '0 0 * * *',
        Timezone: 'UTC',
        ...overrides,
    };
}

function makeInput(overrides: Partial<SchedulingAgentContextInput> = {}): SchedulingAgentContextInput {
    return {
        ActiveTab: 'jobs',
        Jobs: [],
        AlertCount: 0,
        StatusFilter: '',
        ...overrides,
    };
}

describe('isValidSchedulingTab', () => {
    it('accepts the three known tabs', () => {
        expect(isValidSchedulingTab('dashboard')).toBe(true);
        expect(isValidSchedulingTab('jobs')).toBe(true);
        expect(isValidSchedulingTab('activity')).toBe(true);
    });

    it('rejects unknown / mis-cased strings', () => {
        expect(isValidSchedulingTab('overview')).toBe(false);
        expect(isValidSchedulingTab('Jobs')).toBe(false); // case-sensitive
        expect(isValidSchedulingTab('')).toBe(false);
    });

    it('rejects non-string input without throwing', () => {
        expect(isValidSchedulingTab(undefined)).toBe(false);
        expect(isValidSchedulingTab(null)).toBe(false);
        expect(isValidSchedulingTab(42)).toBe(false);
        expect(isValidSchedulingTab({ tab: 'jobs' })).toBe(false);
    });
});

describe('buildSchedulingAgentContext', () => {
    it('passes through the active tab, alert count, and status filter', () => {
        const ctx = buildSchedulingAgentContext(makeInput({
            ActiveTab: 'activity',
            AlertCount: 3,
            StatusFilter: 'Active',
        }));
        expect(ctx['ActiveTab']).toBe('activity');
        expect(ctx['AlertCount']).toBe(3);
        expect(ctx['StatusFilter']).toBe('Active');
    });

    it('reports zero counts and zero success rate for an empty job list', () => {
        const ctx = buildSchedulingAgentContext(makeInput());
        expect(ctx['TotalJobs']).toBe(0);
        expect(ctx['ActiveJobCount']).toBe(0);
        expect(ctx['PausedJobCount']).toBe(0);
        expect(ctx['DisabledJobCount']).toBe(0);
        expect(ctx['SuccessRate']).toBe(0);
    });

    it('derives per-status counts from the job snapshots', () => {
        const ctx = buildSchedulingAgentContext(makeInput({
            Jobs: [
                makeJob({ JobId: 'a', Status: 'Active' }),
                makeJob({ JobId: 'b', Status: 'Active' }),
                makeJob({ JobId: 'c', Status: 'Paused' }),
                makeJob({ JobId: 'd', Status: 'Disabled' }),
                makeJob({ JobId: 'e', Status: 'Pending' }),
            ],
        }));
        expect(ctx['TotalJobs']).toBe(5);
        expect(ctx['ActiveJobCount']).toBe(2);
        expect(ctx['PausedJobCount']).toBe(1);
        expect(ctx['DisabledJobCount']).toBe(1);
    });

    it('averages success rate only across jobs that have run, rounded to 3 dp', () => {
        const ctx = buildSchedulingAgentContext(makeInput({
            Jobs: [
                makeJob({ JobId: 'a', SuccessRate: 1, TotalRuns: 10 }),
                makeJob({ JobId: 'b', SuccessRate: 0.5, TotalRuns: 4 }),
                // never-run job is excluded from the average
                makeJob({ JobId: 'c', SuccessRate: 0, TotalRuns: 0 }),
            ],
        }));
        // (1 + 0.5) / 2 = 0.75
        expect(ctx['SuccessRate']).toBe(0.75);
    });

    it('rounds a repeating success-rate average to 3 decimal places', () => {
        const ctx = buildSchedulingAgentContext(makeInput({
            Jobs: [
                makeJob({ JobId: 'a', SuccessRate: 1, TotalRuns: 1 }),
                makeJob({ JobId: 'b', SuccessRate: 0, TotalRuns: 1 }),
                makeJob({ JobId: 'c', SuccessRate: 1, TotalRuns: 1 }),
            ],
        }));
        // 2/3 = 0.6666... → 0.667
        expect(ctx['SuccessRate']).toBe(0.667);
    });
});
