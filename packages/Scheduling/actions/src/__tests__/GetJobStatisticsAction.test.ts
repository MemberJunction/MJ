/**
 * Tests for `Get Scheduled Job Statistics`: per-job totals, success rate and the average duration of
 * completed runs. A job's runs can carry its ID in either case (SQL Server returns UUIDs upper-case),
 * and the average must still count every completed run of that job and no other job's.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const runViewResult = vi.fn();

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (_target: Function) => {},
}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class {},
}));

vi.mock('@memberjunction/scheduling-engine', () => ({
    SchedulingEngine: { Instance: {} },
}));

vi.mock('@memberjunction/core', () => ({
    Metadata: class {},
    UserInfo: class {},
    RunView: class { RunView = runViewResult; },
    LogError: vi.fn(),
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {},
}));

import { GetScheduledJobStatisticsAction } from '../GetJobStatisticsAction';
import type { RunActionParams } from '@memberjunction/actions-base';

class TestableAction extends GetScheduledJobStatisticsAction {
    public Run(params: RunActionParams) {
        return this.InternalRunAction(params);
    }
}

const NIGHTLY = 'aaaaaaaa-0000-0000-0000-000000000001';
const HOURLY = 'bbbbbbbb-0000-0000-0000-000000000002';

function run(ScheduledJobID: string, ScheduledJob: string, Status: string, startedAtMinute: number, seconds: number | null) {
    const StartedAt = new Date(Date.UTC(2026, 9, 1, 0, startedAtMinute));
    const CompletedAt = seconds == null ? null : new Date(StartedAt.getTime() + seconds * 1000);
    return { ScheduledJobID, ScheduledJob, Status, StartedAt, CompletedAt };
}

const params = (): RunActionParams => ({ Params: [], ContextUser: { ID: 'user-1' } } as unknown as RunActionParams);

const statisticsOf = (p: RunActionParams) => p.Params.find((x) => x.Name === 'Statistics')?.Value;

beforeEach(() => {
    runViewResult.mockReset();
});

describe('Get Scheduled Job Statistics', () => {
    it('averages each job over its own completed runs, whatever case the run carries the job ID in', async () => {
        runViewResult.mockResolvedValue({
            Success: true,
            Results: [
                run(NIGHTLY, 'Nightly', 'Completed', 30, 60),
                run(HOURLY, 'Hourly', 'Completed', 20, 10),
                run(NIGHTLY.toUpperCase(), 'Nightly', 'Completed', 10, 120),
                run(NIGHTLY, 'Nightly', 'Failed', 5, 999),
                run(HOURLY, 'Hourly', 'Running', 1, null),
            ],
        });
        const p = params();

        const result = await new TestableAction().Run(p);

        expect(result.Success).toBe(true);
        // The map that counts runs is keyed by the raw ID, so the upper-case run makes its own
        // entry; the duration average for each entry still covers both spellings of the job.
        expect(statisticsOf(p)).toEqual([
            { JobID: HOURLY, JobName: 'Hourly', TotalRuns: 2, SuccessfulRuns: 1, FailedRuns: 0, SuccessRate: 50, AverageDurationSeconds: 10, LastRunAt: new Date(Date.UTC(2026, 9, 1, 0, 20)), LastRunStatus: 'Completed' },
            { JobID: NIGHTLY, JobName: 'Nightly', TotalRuns: 2, SuccessfulRuns: 1, FailedRuns: 1, SuccessRate: 50, AverageDurationSeconds: 90, LastRunAt: new Date(Date.UTC(2026, 9, 1, 0, 30)), LastRunStatus: 'Completed' },
            { JobID: NIGHTLY.toUpperCase(), JobName: 'Nightly', TotalRuns: 1, SuccessfulRuns: 1, FailedRuns: 0, SuccessRate: 100, AverageDurationSeconds: 90, LastRunAt: new Date(Date.UTC(2026, 9, 1, 0, 10)), LastRunStatus: 'Completed' },
        ]);
    });
});
