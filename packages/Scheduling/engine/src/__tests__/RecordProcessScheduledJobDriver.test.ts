import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJScheduledJobEntity, MJScheduledJobRunEntity } from '@memberjunction/core-entities';
import type { RunRecordProcessOptions } from '@memberjunction/record-set-processor';
import type { ScheduledJobExecutionContext } from '../BaseScheduledJob';

const { runByID } = vi.hoisted(() => ({
    runByID: vi.fn(async (_id: string, _options: RunRecordProcessOptions) =>
        ({ Status: 'Completed', Total: 0, Processed: 0, Success: 0, Error: 0, Skipped: 0, ProcessRunID: 'run-1' })),
}));

vi.mock('@memberjunction/record-set-processor', () => ({
    RecordProcessExecutor: class { public RunByID = runByID; },
}));

import { RecordProcessScheduledJobDriver } from '../drivers/RecordProcessScheduledJobDriver';

describe('RecordProcessScheduledJobDriver', () => {
    it('runs the Record Process on the provider the engine read the job with', async () => {
        const provider = {} as IMetadataProvider;
        const schedule: Pick<MJScheduledJobEntity, 'Name' | 'Configuration'> = { Name: 'Nightly', Configuration: JSON.stringify({ RecordProcessID: 'rp-1' }) };
        const run: Pick<MJScheduledJobRunEntity, 'ID'> = { ID: 'job-run-1' };
        const context: ScheduledJobExecutionContext = {
            Schedule: schedule as MJScheduledJobEntity, Run: run as MJScheduledJobRunEntity, ContextUser: {} as UserInfo, Provider: provider,
        };
        const result = await new RecordProcessScheduledJobDriver().Execute(context);
        expect(result.Success).toBe(true);
        expect(runByID.mock.calls[0][0]).toBe('rp-1');
        expect(runByID.mock.calls[0][1].Provider).toBe(provider);
        expect(runByID.mock.calls[0][1].ScheduledJobRunID).toBe('job-run-1');
    });
});
