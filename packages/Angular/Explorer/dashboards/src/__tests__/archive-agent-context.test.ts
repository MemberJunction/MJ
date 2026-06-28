/**
 * Tests for the Archiving app's pure agent-context helpers:
 * - isValidArchiveRunStatusFilter: status validation for FilterArchiveRunsByStatus
 * - computeArchiveRunStatusCounts: bucket runs into Total/Successful/Failed/Running
 * - filterArchiveRunsByStatus: filter runs by status
 * - buildArchiveConfigAgentContext / buildArchiveRunsAgentContext: context shaping
 */
import { describe, it, expect } from 'vitest';
import {
    isValidArchiveRunStatusFilter,
    computeArchiveRunStatusCounts,
    filterArchiveRunsByStatus,
    buildArchiveConfigAgentContext,
    buildArchiveRunsAgentContext,
    ARCHIVE_RUN_STATUS_FILTERS,
    ArchiveRunStatusSnapshot,
} from '../Archiving/archive-agent-context';

function run(status: string): ArchiveRunStatusSnapshot {
    return { Status: status };
}

describe('isValidArchiveRunStatusFilter', () => {
    it('accepts every known filter value', () => {
        for (const f of ARCHIVE_RUN_STATUS_FILTERS) {
            expect(isValidArchiveRunStatusFilter(f)).toBe(true);
        }
    });

    it('rejects unknown / non-string values', () => {
        expect(isValidArchiveRunStatusFilter('Bogus')).toBe(false);
        expect(isValidArchiveRunStatusFilter('')).toBe(false);
        expect(isValidArchiveRunStatusFilter(undefined)).toBe(false);
        expect(isValidArchiveRunStatusFilter(42)).toBe(false);
        expect(isValidArchiveRunStatusFilter(null)).toBe(false);
    });
});

describe('computeArchiveRunStatusCounts', () => {
    it('buckets Complete and PartialSuccess as successful', () => {
        const counts = computeArchiveRunStatusCounts([
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
        const counts = computeArchiveRunStatusCounts([run('complete'), run('FAILED'), run('running')]);
        expect(counts.SuccessfulRuns).toBe(1);
        expect(counts.FailedRuns).toBe(1);
        expect(counts.RunningRuns).toBe(1);
    });

    it('handles an empty list', () => {
        expect(computeArchiveRunStatusCounts([])).toEqual({
            TotalRuns: 0,
            SuccessfulRuns: 0,
            FailedRuns: 0,
            RunningRuns: 0,
        });
    });

    it('counts Cancelled toward total only (not any outcome bucket)', () => {
        const counts = computeArchiveRunStatusCounts([run('Cancelled'), run('Cancelled')]);
        expect(counts.TotalRuns).toBe(2);
        expect(counts.SuccessfulRuns).toBe(0);
        expect(counts.FailedRuns).toBe(0);
        expect(counts.RunningRuns).toBe(0);
    });
});

describe('filterArchiveRunsByStatus', () => {
    const runs = [run('Complete'), run('Failed'), run('Complete'), run('Running')];

    it('returns all runs (a copy) when filter is "all"', () => {
        const result = filterArchiveRunsByStatus(runs, 'all');
        expect(result).toHaveLength(4);
        expect(result).not.toBe(runs);
    });

    it('keeps only matching runs (case-insensitive)', () => {
        expect(filterArchiveRunsByStatus(runs, 'Complete')).toHaveLength(2);
        expect(filterArchiveRunsByStatus(runs, 'Failed')).toHaveLength(1);
        expect(filterArchiveRunsByStatus(runs, 'Running')).toHaveLength(1);
        expect(filterArchiveRunsByStatus(runs, 'Cancelled')).toHaveLength(0);
    });
});

describe('buildArchiveConfigAgentContext', () => {
    it('shapes the read-only config context (no scheduling fields)', () => {
        const ctx = buildArchiveConfigAgentContext({
            PolicyCount: 3,
            ActivePolicyCount: 2,
            EntitiesUnderArchive: 7,
            IsLoading: false,
        });
        expect(ctx).toEqual({
            Surface: 'ArchiveConfiguration',
            PolicyCount: 3,
            ActivePolicyCount: 2,
            EntitiesUnderArchive: 7,
            IsLoading: false,
        });
        // Scheduling fields are intentionally absent (no schema source).
        expect(ctx).not.toHaveProperty('ScheduledJobCount');
        expect(ctx).not.toHaveProperty('NextScheduledRun');
    });
});

describe('buildArchiveRunsAgentContext', () => {
    it('shapes the read-only runs context', () => {
        const ctx = buildArchiveRunsAgentContext({
            Counts: { TotalRuns: 10, SuccessfulRuns: 6, FailedRuns: 3, RunningRuns: 1 },
            StatusFilter: 'Failed',
            FilteredRunCount: 3,
            SelectedRunId: 'run-123',
            IsLoading: false,
        });
        expect(ctx).toEqual({
            Surface: 'ArchiveRunHistory',
            TotalRuns: 10,
            SuccessfulRuns: 6,
            FailedRuns: 3,
            RunningRuns: 1,
            StatusFilter: 'Failed',
            FilteredRunCount: 3,
            SelectedRunId: 'run-123',
            IsLoading: false,
        });
    });
});
