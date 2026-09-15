/**
 * Tests for the Archiving app's pure agent-context helpers:
 * - isValidArchiveRunStatusFilter: status validation for FilterArchiveRunsByStatus
 * - computeArchiveRunStatusCounts: bucket runs into Total/Successful/Failed/Running
 * - filterArchiveRunsByStatus: filter runs by status
 * - buildArchiveConfigAgentContext / buildArchiveRunsAgentContext: context shaping
 */
import { describe, it, expect } from 'vitest';
import {
    IsValidArchiveRunStatusFilter,
    ComputeArchiveRunStatusCounts,
    FilterArchiveRunsByStatus,
    BuildArchiveConfigAgentContext,
    BuildArchiveRunsAgentContext,
    CapArchiveNames,
    ResolveArchiveRun,
    ARCHIVE_RUN_STATUS_FILTERS,
    ARCHIVE_NAME_LIST_CAP,
    ArchiveRunStatusSnapshot,
    ArchiveRunSnapshot,
    ArchiveRunSummaryItem,
} from '../Archiving/archive-agent-context';

function run(status: string): ArchiveRunStatusSnapshot {
    return { Status: status };
}

function fullRun(id: string, name: string, status = 'Complete'): ArchiveRunSnapshot {
    return { ID: id, ConfigurationName: name, Status: status };
}

describe('isValidArchiveRunStatusFilter', () => {
    it('accepts every known filter value', () => {
        for (const f of ARCHIVE_RUN_STATUS_FILTERS) {
            expect(IsValidArchiveRunStatusFilter(f)).toBe(true);
        }
    });

    it('rejects unknown / non-string values', () => {
        expect(IsValidArchiveRunStatusFilter('Bogus')).toBe(false);
        expect(IsValidArchiveRunStatusFilter('')).toBe(false);
        expect(IsValidArchiveRunStatusFilter(undefined)).toBe(false);
        expect(IsValidArchiveRunStatusFilter(42)).toBe(false);
        expect(IsValidArchiveRunStatusFilter(null)).toBe(false);
    });
});

describe('computeArchiveRunStatusCounts', () => {
    it('buckets Complete and PartialSuccess as successful', () => {
        const counts = ComputeArchiveRunStatusCounts([
            run('Complete'),
            run('PartialSuccess'),
            run('Failed'),
            run('Running'),
            run('Cancelled'),
        ]);
        expect(counts).toEqual({
            TotalRuns: 5,
            SuccessfulRuns: 2,
            FailedRuns: 1,
            RunningRuns: 1,
        });
    });

    it('is case-insensitive about status', () => {
        const counts = ComputeArchiveRunStatusCounts([run('complete'), run('FAILED'), run('running')]);
        expect(counts.SuccessfulRuns).toBe(1);
        expect(counts.FailedRuns).toBe(1);
        expect(counts.RunningRuns).toBe(1);
    });

    it('handles an empty list', () => {
        expect(ComputeArchiveRunStatusCounts([])).toEqual({
            TotalRuns: 0,
            SuccessfulRuns: 0,
            FailedRuns: 0,
            RunningRuns: 0,
        });
    });

    it('counts Cancelled toward total only (not any outcome bucket)', () => {
        const counts = ComputeArchiveRunStatusCounts([run('Cancelled'), run('Cancelled')]);
        expect(counts.TotalRuns).toBe(2);
        expect(counts.SuccessfulRuns).toBe(0);
        expect(counts.FailedRuns).toBe(0);
        expect(counts.RunningRuns).toBe(0);
    });
});

describe('filterArchiveRunsByStatus', () => {
    const runs = [run('Complete'), run('Failed'), run('Complete'), run('Running')];

    it('returns all runs (a copy) when filter is "all"', () => {
        const result = FilterArchiveRunsByStatus(runs, 'all');
        expect(result).toHaveLength(4);
        expect(result).not.toBe(runs);
    });

    it('keeps only matching runs (case-insensitive)', () => {
        expect(FilterArchiveRunsByStatus(runs, 'Complete')).toHaveLength(2);
        expect(FilterArchiveRunsByStatus(runs, 'Failed')).toHaveLength(1);
        expect(FilterArchiveRunsByStatus(runs, 'Running')).toHaveLength(1);
        expect(FilterArchiveRunsByStatus(runs, 'Cancelled')).toHaveLength(0);
    });
});

describe('capArchiveNames', () => {
    it('caps at ARCHIVE_NAME_LIST_CAP and never mutates the input', () => {
        const names = Array.from({ length: ARCHIVE_NAME_LIST_CAP + 10 }, (_, i) => `P${i}`);
        const capped = CapArchiveNames(names);
        expect(capped).toHaveLength(ARCHIVE_NAME_LIST_CAP);
        expect(names).toHaveLength(ARCHIVE_NAME_LIST_CAP + 10);
        expect(capped).not.toBe(names);
    });
});

describe('resolveArchiveRun', () => {
    const runs = [fullRun('id-1', 'Nightly Members', 'Complete'), fullRun('id-2', 'Weekly Logs', 'Failed')];

    it('matches by exact ID (case-insensitive)', () => {
        const r = ResolveArchiveRun('ID-1', runs);
        expect(r.ok && r.run.ConfigurationName).toBe('Nightly Members');
    });

    it('matches by exact name then by contains', () => {
        const exact = ResolveArchiveRun('weekly logs', runs);
        expect(exact.ok && exact.run.ID).toBe('id-2');
        const contains = ResolveArchiveRun('members', runs);
        expect(contains.ok && contains.run.ID).toBe('id-1');
    });

    it('returns a tolerant error listing available runs on a miss', () => {
        const r = ResolveArchiveRun('nonexistent', runs);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toContain('Nightly Members');
            expect(r.error).toContain('Weekly Logs');
        }
    });

    it('errors on empty input and empty run list', () => {
        expect(ResolveArchiveRun('  ', runs).ok).toBe(false);
        expect(ResolveArchiveRun('anything', []).ok).toBe(false);
    });
});

describe('buildArchiveConfigAgentContext', () => {
    it('shapes the read-only config context with bounded names (no scheduling fields)', () => {
        const ctx = BuildArchiveConfigAgentContext({
            PolicyCount: 3,
            ActivePolicyCount: 2,
            EntitiesUnderArchive: 7,
            PolicyNames: ['Nightly', 'Weekly'],
            ArchivedEntityNames: ['Logs', 'Audit'],
            IsLoading: false,
        });
        expect(ctx['Surface']).toBe('ArchiveConfiguration');
        expect(ctx['PolicyCount']).toBe(3);
        expect(ctx['PolicyNames']).toEqual(['Nightly', 'Weekly']);
        expect(ctx['ArchivedEntityNames']).toEqual(['Logs', 'Audit']);
        // Scheduling fields are intentionally absent (no schema source).
        expect(ctx).not.toHaveProperty('ScheduledJobCount');
        expect(ctx).not.toHaveProperty('NextScheduledRun');
        // No truncation counts when the lists fit under the cap.
        expect(ctx).not.toHaveProperty('PolicyNameCount');
        expect(ctx).not.toHaveProperty('ArchivedEntityNameCount');
    });

    it('omits name fields when the lists are empty', () => {
        const ctx = BuildArchiveConfigAgentContext({
            PolicyCount: 0,
            ActivePolicyCount: 0,
            EntitiesUnderArchive: 0,
            PolicyNames: [],
            ArchivedEntityNames: [],
            IsLoading: true,
        });
        expect(ctx).not.toHaveProperty('PolicyNames');
        expect(ctx).not.toHaveProperty('ArchivedEntityNames');
    });

    it('caps name lists and surfaces the true total when truncated', () => {
        const policies = Array.from({ length: ARCHIVE_NAME_LIST_CAP + 4 }, (_, i) => `P${i}`);
        const ctx = BuildArchiveConfigAgentContext({
            PolicyCount: policies.length,
            ActivePolicyCount: policies.length,
            EntitiesUnderArchive: 0,
            PolicyNames: policies,
            ArchivedEntityNames: [],
            IsLoading: false,
        });
        expect((ctx['PolicyNames'] as string[]).length).toBe(ARCHIVE_NAME_LIST_CAP);
        expect(ctx['PolicyNameCount']).toBe(policies.length);
    });
});

describe('buildArchiveRunsAgentContext', () => {
    const recent: ArchiveRunSummaryItem[] = [
        { ID: 'id-1', Name: 'Nightly', Status: 'Complete' },
        { ID: 'id-2', Name: 'Weekly', Status: 'Failed' },
    ];

    it('shapes the read-only runs context with selected run + recent runs', () => {
        const ctx = BuildArchiveRunsAgentContext({
            Counts: { TotalRuns: 10, SuccessfulRuns: 6, FailedRuns: 3, RunningRuns: 1 },
            StatusFilter: 'Failed',
            FilteredRunCount: 3,
            SelectedRunId: 'run-123',
            SelectedRunName: 'Weekly Logs',
            SelectedRunStatus: 'Failed',
            RecentRuns: recent,
            IsLoading: false,
        });
        expect(ctx['Surface']).toBe('ArchiveRunHistory');
        expect(ctx['TotalRuns']).toBe(10);
        expect(ctx['SelectedRunName']).toBe('Weekly Logs');
        expect(ctx['SelectedRunStatus']).toBe('Failed');
        expect(ctx['RecentRuns']).toEqual(recent);
        // No DryRun field — there is no honest data source for it.
        expect(ctx).not.toHaveProperty('DryRun');
        expect(ctx).not.toHaveProperty('SelectedRunDryRun');
    });

    it('omits RecentRuns when empty and caps + counts when truncated', () => {
        const empty = BuildArchiveRunsAgentContext({
            Counts: { TotalRuns: 0, SuccessfulRuns: 0, FailedRuns: 0, RunningRuns: 0 },
            StatusFilter: 'all',
            FilteredRunCount: 0,
            SelectedRunId: null,
            SelectedRunName: null,
            SelectedRunStatus: null,
            RecentRuns: [],
            IsLoading: false,
        });
        expect(empty).not.toHaveProperty('RecentRuns');

        const many: ArchiveRunSummaryItem[] = Array.from({ length: ARCHIVE_NAME_LIST_CAP + 3 }, (_, i) => ({
            ID: `id-${i}`,
            Name: `Run${i}`,
            Status: 'Complete',
        }));
        const ctx = BuildArchiveRunsAgentContext({
            Counts: { TotalRuns: many.length, SuccessfulRuns: many.length, FailedRuns: 0, RunningRuns: 0 },
            StatusFilter: 'all',
            FilteredRunCount: many.length,
            SelectedRunId: null,
            SelectedRunName: null,
            SelectedRunStatus: null,
            RecentRuns: many,
            IsLoading: false,
        });
        expect((ctx['RecentRuns'] as unknown[]).length).toBe(ARCHIVE_NAME_LIST_CAP);
        expect(ctx['RecentRunCount']).toBe(many.length);
    });
});
