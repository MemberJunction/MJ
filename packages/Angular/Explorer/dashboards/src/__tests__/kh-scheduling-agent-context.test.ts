/**
 * Tests for the Knowledge Hub Scheduling surface's pure agent-context helpers
 * (distinct from the top-level Scheduling dashboard's helpers):
 * - buildSchedulingAgentContext: deep counts + bounded structured list + next-due
 * - resolveScheduledJob: id → name → contains resolution
 * - nextDueJobName: earliest NextRunAt
 * - buildScheduleNotFoundError: tolerant "available jobs" error
 */
import { describe, it, expect } from 'vitest';
import {
    buildSchedulingAgentContext,
    resolveScheduledJob,
    nextDueJobName,
    buildScheduleNotFoundError,
    ScheduledJobCandidate,
} from '../KnowledgeHub/components/scheduling/scheduling-agent-context';

function makeJob(overrides: Partial<ScheduledJobCandidate> = {}): ScheduledJobCandidate {
    return {
        ID: 'j-1',
        Name: 'Autotag Nightly',
        Description: null,
        Status: 'Active',
        CronExpression: '0 2 * * *',
        NextRunAt: null,
        LastRunAt: null,
        RunCount: 10,
        SuccessCount: 9,
        ...overrides,
    };
}

describe('resolveScheduledJob', () => {
    const jobs = [
        makeJob({ ID: 'j-1', Name: 'Autotag Nightly' }),
        makeJob({ ID: 'j-2', Name: 'Vectorize Content' }),
    ];
    it('resolves by exact id', () => {
        expect(resolveScheduledJob('J-2', jobs)?.Name).toBe('Vectorize Content');
    });
    it('resolves by exact name', () => {
        expect(resolveScheduledJob('autotag nightly', jobs)?.ID).toBe('j-1');
    });
    it('falls back to contains', () => {
        expect(resolveScheduledJob('vectorize', jobs)?.ID).toBe('j-2');
    });
    it('returns null on empty / miss', () => {
        expect(resolveScheduledJob('', jobs)).toBeNull();
        expect(resolveScheduledJob('nope', jobs)).toBeNull();
    });
});

describe('nextDueJobName', () => {
    it('returns the earliest future NextRunAt', () => {
        const jobs = [
            makeJob({ Name: 'Later', NextRunAt: '2030-01-01T00:00:00Z' }),
            makeJob({ Name: 'Sooner', NextRunAt: '2026-07-01T00:00:00Z' }),
            makeJob({ Name: 'NoNext', NextRunAt: null }),
        ];
        expect(nextDueJobName(jobs)).toBe('Sooner');
    });
    it('returns null when no job has a NextRunAt', () => {
        expect(nextDueJobName([makeJob({ NextRunAt: null })])).toBeNull();
    });
});

describe('buildScheduleNotFoundError', () => {
    it('lists a bounded sample of names', () => {
        const names = Array.from({ length: 13 }, (_, i) => `Job ${i}`);
        const msg = buildScheduleNotFoundError('xyz', names);
        expect(msg).toContain('No scheduled job matches "xyz"');
        expect(msg).toContain('(+3 more)');
    });
});

describe('buildSchedulingAgentContext', () => {
    it('counts by lifecycle status', () => {
        const all = [
            makeJob({ ID: 'j-1', Status: 'Active' }),
            makeJob({ ID: 'j-2', Status: 'Paused' }),
            makeJob({ ID: 'j-3', Status: 'Disabled' }),
            makeJob({ ID: 'j-4', Status: 'Active' }),
        ];
        const ctx = buildSchedulingAgentContext({
            AllJobs: all, FilteredJobs: all, StatusFilter: '', SearchQuery: '', RecentRunCount: 5, IsLoading: false,
        });
        expect(ctx['TotalJobs']).toBe(4);
        expect(ctx['ActiveCount']).toBe(2);
        expect(ctx['PausedCount']).toBe(1);
        expect(ctx['DisabledCount']).toBe(1);
        expect(ctx['StatusFilter']).toBe('All');
        expect(ctx['RecentRunCount']).toBe(5);
    });

    it('publishes structured jobs with success rate', () => {
        const all = [makeJob({ RunCount: 10, SuccessCount: 8 })];
        const ctx = buildSchedulingAgentContext({
            AllJobs: all, FilteredJobs: all, StatusFilter: '', SearchQuery: '', RecentRunCount: 0, IsLoading: false,
        });
        const jobs = ctx['Jobs'] as Array<Record<string, unknown>>;
        expect(jobs[0]['SuccessRate']).toBe(80);
        expect(jobs[0]['Cron']).toBe('0 2 * * *');
    });

    it('bounds the visible jobs and flags truncation', () => {
        const all = Array.from({ length: 30 }, (_, i) => makeJob({ ID: `j-${i}`, Name: `Job ${i}` }));
        const ctx = buildSchedulingAgentContext({
            AllJobs: all, FilteredJobs: all, StatusFilter: '', SearchQuery: '', RecentRunCount: 0, IsLoading: false,
        });
        expect((ctx['Jobs'] as unknown[]).length).toBe(25);
        expect((ctx['VisibleJobNames'] as string[]).length).toBe(25);
        expect(ctx['JobsTruncated']).toBe(true);
    });

    it('reflects the active status filter and search query', () => {
        const all = [makeJob({ ID: 'j-1', Status: 'Active' }), makeJob({ ID: 'j-2', Status: 'Paused' })];
        const ctx = buildSchedulingAgentContext({
            AllJobs: all, FilteredJobs: [all[0]], StatusFilter: 'Active', SearchQuery: 'autotag', RecentRunCount: 0, IsLoading: false,
        });
        expect(ctx['StatusFilter']).toBe('Active');
        expect(ctx['SearchQuery']).toBe('autotag');
        expect(ctx['VisibleJobs']).toBe(1);
    });
});
