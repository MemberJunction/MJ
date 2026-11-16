/**
 * Unit tests for `MJScheduledJobEntityServer`: on Save of an existing job whose CronExpression or
 * Timezone changed, NextRunAt is recomputed from the new schedule. New jobs, jobs whose schedule
 * did not change, and a NextRunAt the caller set on this save are left alone.
 *
 * The generated base is mocked to a settable stub with per-field Dirty state, and the cron helper
 * is mocked to a deterministic stand-in ('BAD CRON' throws). Real cron math is covered by the
 * scheduling-engine package's own tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return { ...actual, RegisterClass: () => (target: unknown) => target };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual };
});

const NEXT_TICK = new Date('2030-01-01T09:00:00Z');
const getNextRunTime = vi.fn((cron: string, _tz: string, _from?: Date): Date => {
    if (cron === 'BAD CRON') throw new Error('Invalid cron expression');
    return NEXT_TICK;
});

vi.mock('@memberjunction/scheduling-engine', () => ({
    CronExpressionHelper: {
        GetNextRunTime: (cron: string, tz: string, from?: Date) => getNextRunTime(cron, tz, from),
    },
}));

vi.mock('@memberjunction/core-entities', () => {
    class MockMJScheduledJobEntity {
        public CronExpression = '0 0 4 * * *';
        public Timezone = 'UTC';
        public NextRunAt: Date | null = null;
        public IsSaved = true;
        public SuperSaveCalled = false;
        private dirty = new Set<string>();
        public MarkDirty(...names: string[]): void {
            names.forEach(n => this.dirty.add(n));
        }
        public GetFieldByName(name: string): { Dirty: boolean } {
            return { Dirty: this.dirty.has(name) };
        }
        public async Save(): Promise<boolean> {
            this.SuperSaveCalled = true;
            return true;
        }
    }
    return { MJScheduledJobEntity: MockMJScheduledJobEntity };
});

import { MJScheduledJobEntityServer } from '../custom/MJScheduledJobEntityServer.server';

interface MockHooks {
    IsSaved: boolean;
    SuperSaveCalled: boolean;
    MarkDirty(...names: string[]): void;
}

const OLD_NEXT_RUN = new Date('2029-12-31T04:00:00Z');

function makeJob(): MJScheduledJobEntityServer & MockHooks {
    const job = new MJScheduledJobEntityServer() as MJScheduledJobEntityServer & MockHooks;
    job.NextRunAt = OLD_NEXT_RUN;
    return job;
}

describe('MJScheduledJobEntityServer.Save', () => {
    beforeEach(() => getNextRunTime.mockClear());

    it('recomputes NextRunAt when an existing job\'s cron changes', async () => {
        const job = makeJob();
        job.CronExpression = '0 0 9 * * *';
        job.MarkDirty('CronExpression');

        expect(await job.Save()).toBe(true);

        expect(job.NextRunAt).toEqual(NEXT_TICK);
        expect(getNextRunTime).toHaveBeenCalledWith('0 0 9 * * *', 'UTC', expect.any(Date));
        expect(job.SuperSaveCalled).toBe(true);
    });

    it('recomputes NextRunAt when only the time zone changes', async () => {
        const job = makeJob();
        job.Timezone = 'America/New_York';
        job.MarkDirty('Timezone');

        await job.Save();

        expect(job.NextRunAt).toEqual(NEXT_TICK);
        expect(getNextRunTime).toHaveBeenCalledWith('0 0 4 * * *', 'America/New_York', expect.any(Date));
    });

    it('falls back to UTC when the time zone is empty', async () => {
        const job = makeJob();
        job.Timezone = '';
        job.MarkDirty('CronExpression');

        await job.Save();

        expect(getNextRunTime).toHaveBeenCalledWith('0 0 4 * * *', 'UTC', expect.any(Date));
    });

    it('leaves NextRunAt alone when the schedule did not change', async () => {
        const job = makeJob();
        job.MarkDirty('Name', 'Status');

        await job.Save();

        expect(job.NextRunAt).toEqual(OLD_NEXT_RUN);
        expect(getNextRunTime).not.toHaveBeenCalled();
    });

    it('respects a NextRunAt the caller set on the same save', async () => {
        const job = makeJob();
        const explicit = new Date('2030-06-01T00:00:00Z');
        job.CronExpression = '0 0 9 * * *';
        job.NextRunAt = explicit;
        job.MarkDirty('CronExpression', 'NextRunAt');

        await job.Save();

        expect(job.NextRunAt).toEqual(explicit);
        expect(getNextRunTime).not.toHaveBeenCalled();
    });

    it('recomputes when NextRunAt is dirty but null (a cleared value is not a caller-set time)', async () => {
        const job = makeJob();
        job.NextRunAt = null;
        job.MarkDirty('CronExpression', 'NextRunAt');

        await job.Save();

        expect(job.NextRunAt).toEqual(NEXT_TICK);
    });

    it('leaves a new job to the scheduler, which seeds it honouring RunImmediatelyIfNeverRun', async () => {
        const job = makeJob();
        job.IsSaved = false;
        job.NextRunAt = null;
        job.MarkDirty('CronExpression', 'Timezone');

        await job.Save();

        expect(job.NextRunAt).toBeNull();
        expect(getNextRunTime).not.toHaveBeenCalled();
    });

    it('keeps the stored NextRunAt and still saves when the new cron is invalid', async () => {
        const job = makeJob();
        job.CronExpression = 'BAD CRON';
        job.MarkDirty('CronExpression');

        expect(await job.Save()).toBe(true);

        expect(job.NextRunAt).toEqual(OLD_NEXT_RUN);
        expect(job.SuperSaveCalled).toBe(true);
    });
});
