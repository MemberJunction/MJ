/**
 * Tests for the Scheduling dashboard's pure agent-context helpers:
 * - buildSchedulingAgentContext: deep, mode-scoped state snapshot → agent context
 * - isValidSchedulingTab / schedulingTabLabel: tab validation + labels
 * - resolveSchedulingItem / buildSchedulingNotFoundError: id→name→contains resolution
 * - capSchedulingList: bounded name lists
 */
import { describe, it, expect } from 'vitest';
import {
    buildSchedulingAgentContext,
    buildSchedulingNotFoundError,
    capSchedulingList,
    isValidSchedulingTab,
    resolveSchedulingItem,
    schedulingTabLabel,
    SchedulingAgentContextInput,
    SchedulingExecutionSnapshot,
    SchedulingItemCandidate,
    SchedulingJobSnapshot,
    SCHEDULING_CONTEXT_LIST_CAP,
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

function makeExec(overrides: Partial<SchedulingExecutionSnapshot> = {}): SchedulingExecutionSnapshot {
    return {
        ExecutionId: 'exec-1',
        JobId: 'job-1',
        JobName: 'Nightly Sync',
        Status: 'Completed',
        ...overrides,
    };
}

function makeInput(overrides: Partial<SchedulingAgentContextInput> = {}): SchedulingAgentContextInput {
    return {
        ActiveTab: 'dashboard',
        Jobs: [],
        AlertCount: 0,
        LockedJobCount: 0,
        RunningCount: 0,
        JobTypeBreakdown: [],
        JobsSearchTerm: '',
        StatusFilter: '',
        TypeFilter: '',
        VisibleJobs: [],
        SelectedJob: null,
        ActivitySearchTerm: '',
        ActivityStatusFilter: '',
        ActivityJobNameFilter: '',
        ActivityTimeRange: '7d',
        VisibleExecutions: [],
        ActivityJobNames: [],
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

describe('schedulingTabLabel', () => {
    it('returns the human-readable label for known tabs', () => {
        expect(schedulingTabLabel('dashboard')).toBe('Dashboard');
        expect(schedulingTabLabel('jobs')).toBe('Jobs');
        expect(schedulingTabLabel('activity')).toBe('Activity');
    });

    it('falls back to a default for unknown tabs', () => {
        expect(schedulingTabLabel('bogus')).toBe('Scheduling');
    });
});

describe('capSchedulingList', () => {
    it('returns the list unchanged when under the cap', () => {
        const list = ['a', 'b', 'c'];
        expect(capSchedulingList(list)).toEqual(list);
    });

    it('truncates to the cap and never mutates the input', () => {
        const list = Array.from({ length: SCHEDULING_CONTEXT_LIST_CAP + 10 }, (_, i) => `j${i}`);
        const capped = capSchedulingList(list);
        expect(capped.length).toBe(SCHEDULING_CONTEXT_LIST_CAP);
        expect(list.length).toBe(SCHEDULING_CONTEXT_LIST_CAP + 10); // unchanged
    });
});

describe('resolveSchedulingItem', () => {
    const candidates: SchedulingItemCandidate[] = [
        { ID: 'AAAA-1111', Name: 'Nightly Sync' },
        { ID: 'BBBB-2222', Name: 'Hourly Cleanup' },
        { ID: 'CCCC-3333', Name: 'Weekly Report' },
    ];

    it('matches by exact id, case-insensitively', () => {
        expect(resolveSchedulingItem('aaaa-1111', candidates)?.Name).toBe('Nightly Sync');
        expect(resolveSchedulingItem('AAAA-1111', candidates)?.ID).toBe('AAAA-1111');
    });

    it('matches by exact name, case-insensitively', () => {
        expect(resolveSchedulingItem('hourly cleanup', candidates)?.ID).toBe('BBBB-2222');
    });

    it('falls back to a partial (contains) name match', () => {
        expect(resolveSchedulingItem('report', candidates)?.ID).toBe('CCCC-3333');
        expect(resolveSchedulingItem('sync', candidates)?.Name).toBe('Nightly Sync');
    });

    it('returns null on a miss and on empty/whitespace input', () => {
        expect(resolveSchedulingItem('nonexistent', candidates)).toBeNull();
        expect(resolveSchedulingItem('', candidates)).toBeNull();
        expect(resolveSchedulingItem('   ', candidates)).toBeNull();
    });

    it('prefers an id match over a contains-name match', () => {
        const c: SchedulingItemCandidate[] = [
            { ID: 'sync', Name: 'Unrelated' },
            { ID: 'X', Name: 'Nightly Sync' },
        ];
        // "sync" is an exact id of the first AND a contains-name of the second → id wins
        expect(resolveSchedulingItem('sync', c)?.Name).toBe('Unrelated');
    });
});

describe('buildSchedulingNotFoundError', () => {
    const candidates: SchedulingItemCandidate[] = [
        { ID: '1', Name: 'Alpha' },
        { ID: '2', Name: 'Beta' },
    ];

    it('lists available names on a miss', () => {
        const msg = buildSchedulingNotFoundError('zzz', candidates);
        expect(msg).toContain('No job found matching "zzz"');
        expect(msg).toContain('Alpha');
        expect(msg).toContain('Beta');
    });

    it('adds a total-count hint when the list is truncated', () => {
        const many = Array.from({ length: SCHEDULING_CONTEXT_LIST_CAP + 5 }, (_, i) => ({ ID: `${i}`, Name: `Job ${i}` }));
        const msg = buildSchedulingNotFoundError('zzz', many);
        expect(msg).toContain(`(${many.length} total)`);
    });

    it('omits the available-names clause when there are no candidates', () => {
        const msg = buildSchedulingNotFoundError('zzz', []);
        expect(msg).toBe('No job found matching "zzz".');
    });

    it('honors a custom noun', () => {
        const msg = buildSchedulingNotFoundError('zzz', candidates, 'execution');
        expect(msg).toContain('No execution found');
        expect(msg).toContain('Available executions');
    });
});

describe('buildSchedulingAgentContext — KPI slice (always present)', () => {
    it('passes through the active tab + label and alert/locked/running counts', () => {
        const ctx = buildSchedulingAgentContext(makeInput({
            ActiveTab: 'activity',
            AlertCount: 3,
            LockedJobCount: 2,
            RunningCount: 1,
        }));
        expect(ctx['ActiveTab']).toBe('activity');
        expect(ctx['ActiveTabLabel']).toBe('Activity');
        expect(ctx['AlertCount']).toBe(3);
        expect(ctx['LockedJobCount']).toBe(2);
        expect(ctx['RunningCount']).toBe(1);
    });

    it('coerces an invalid active tab to dashboard', () => {
        const ctx = buildSchedulingAgentContext(makeInput({ ActiveTab: 'bogus' }));
        expect(ctx['ActiveTab']).toBe('dashboard');
        expect(ctx['ActiveTabLabel']).toBe('Dashboard');
    });

    it('reports zero counts and zero success rate for an empty job list', () => {
        const ctx = buildSchedulingAgentContext(makeInput());
        expect(ctx['TotalJobs']).toBe(0);
        expect(ctx['ActiveJobCount']).toBe(0);
        expect(ctx['PausedJobCount']).toBe(0);
        expect(ctx['DisabledJobCount']).toBe(0);
        expect(ctx['PendingJobCount']).toBe(0);
        expect(ctx['ExpiredJobCount']).toBe(0);
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
                makeJob({ JobId: 'f', Status: 'Expired' }),
            ],
        }));
        expect(ctx['TotalJobs']).toBe(6);
        expect(ctx['ActiveJobCount']).toBe(2);
        expect(ctx['PausedJobCount']).toBe(1);
        expect(ctx['DisabledJobCount']).toBe(1);
        expect(ctx['PendingJobCount']).toBe(1);
        expect(ctx['ExpiredJobCount']).toBe(1);
    });

    it('averages success rate only across jobs that have run, rounded to 3 dp', () => {
        const ctx = buildSchedulingAgentContext(makeInput({
            Jobs: [
                makeJob({ JobId: 'a', SuccessRate: 1, TotalRuns: 10 }),
                makeJob({ JobId: 'b', SuccessRate: 0.5, TotalRuns: 4 }),
                makeJob({ JobId: 'c', SuccessRate: 0, TotalRuns: 0 }), // never-run excluded
            ],
        }));
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
        expect(ctx['SuccessRate']).toBe(0.667);
    });

    it('publishes a bounded job-type breakdown with count + names', () => {
        const breakdown = Array.from({ length: SCHEDULING_CONTEXT_LIST_CAP + 3 }, (_, i) => ({
            TypeName: `Type ${i}`,
            ActiveJobsCount: i,
            TotalRuns: i * 2,
        }));
        const ctx = buildSchedulingAgentContext(makeInput({ JobTypeBreakdown: breakdown }));
        expect(ctx['JobTypeCount']).toBe(breakdown.length);
        expect((ctx['JobTypeNames'] as string[]).length).toBe(SCHEDULING_CONTEXT_LIST_CAP);
    });
});

describe('buildSchedulingAgentContext — mode-scoped detail slices', () => {
    it('on the dashboard tab, publishes only the KPI slice (no jobs/activity detail)', () => {
        const ctx = buildSchedulingAgentContext(makeInput({
            ActiveTab: 'dashboard',
            JobsSearchTerm: 'should-not-appear',
            ActivitySearchTerm: 'should-not-appear',
        }));
        expect(ctx['JobsSearchTerm']).toBeUndefined();
        expect(ctx['VisibleJobNames']).toBeUndefined();
        expect(ctx['ActivitySearchTerm']).toBeUndefined();
        expect(ctx['VisibleExecutionJobNames']).toBeUndefined();
    });

    it('on the jobs tab, publishes search/filters, visible names + selection', () => {
        const ctx = buildSchedulingAgentContext(makeInput({
            ActiveTab: 'jobs',
            JobsSearchTerm: 'sync',
            StatusFilter: 'Active',
            TypeFilter: 'Action',
            VisibleJobs: [makeJob({ JobId: 'a', JobName: 'Nightly Sync' }), makeJob({ JobId: 'b', JobName: 'Hourly Sync' })],
            SelectedJob: makeJob({ JobId: 'a', JobName: 'Nightly Sync' }),
        }));
        expect(ctx['JobsSearchTerm']).toBe('sync');
        expect(ctx['StatusFilter']).toBe('Active');
        expect(ctx['TypeFilter']).toBe('Action');
        expect(ctx['VisibleJobCount']).toBe(2);
        expect(ctx['VisibleJobNames']).toEqual(['Nightly Sync', 'Hourly Sync']);
        expect(ctx['VisibleJobNamesTruncated']).toBe(false);
        expect(ctx['SelectedJobId']).toBe('a');
        expect(ctx['SelectedJobName']).toBe('Nightly Sync');
        // activity-only fields must NOT leak onto the jobs tab
        expect(ctx['ActivityTimeRange']).toBeUndefined();
    });

    it('on the jobs tab with no selection, omits the selected-job fields', () => {
        const ctx = buildSchedulingAgentContext(makeInput({ ActiveTab: 'jobs', SelectedJob: null }));
        expect(ctx['SelectedJobId']).toBeUndefined();
        expect(ctx['SelectedJobName']).toBeUndefined();
    });

    it('flags a truncated visible-jobs list', () => {
        const many = Array.from({ length: SCHEDULING_CONTEXT_LIST_CAP + 4 }, (_, i) => makeJob({ JobId: `${i}`, JobName: `Job ${i}` }));
        const ctx = buildSchedulingAgentContext(makeInput({ ActiveTab: 'jobs', VisibleJobs: many }));
        expect(ctx['VisibleJobCount']).toBe(many.length);
        expect((ctx['VisibleJobNames'] as string[]).length).toBe(SCHEDULING_CONTEXT_LIST_CAP);
        expect(ctx['VisibleJobNamesTruncated']).toBe(true);
    });

    it('on the activity tab, publishes search/filters, time range, executions + job names', () => {
        const ctx = buildSchedulingAgentContext(makeInput({
            ActiveTab: 'activity',
            ActivitySearchTerm: 'fail',
            ActivityStatusFilter: 'Failed',
            ActivityJobNameFilter: 'Nightly Sync',
            ActivityTimeRange: '30d',
            VisibleExecutions: [makeExec({ JobName: 'Nightly Sync' }), makeExec({ JobName: 'Hourly Cleanup' })],
            ActivityJobNames: ['Nightly Sync', 'Hourly Cleanup'],
        }));
        expect(ctx['ActivitySearchTerm']).toBe('fail');
        expect(ctx['ActivityStatusFilter']).toBe('Failed');
        expect(ctx['ActivityJobNameFilter']).toBe('Nightly Sync');
        expect(ctx['ActivityTimeRange']).toBe('30d');
        expect(ctx['VisibleExecutionCount']).toBe(2);
        expect(ctx['VisibleExecutionJobNames']).toEqual(['Nightly Sync', 'Hourly Cleanup']);
        expect(ctx['ActivityJobNameCount']).toBe(2);
        expect(ctx['ActivityJobNames']).toEqual(['Nightly Sync', 'Hourly Cleanup']);
        // jobs-only fields must NOT leak onto the activity tab
        expect(ctx['StatusFilter']).toBeUndefined();
        expect(ctx['VisibleJobNames']).toBeUndefined();
    });
});
