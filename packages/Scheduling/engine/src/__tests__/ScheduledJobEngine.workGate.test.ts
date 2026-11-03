/**
 * #6217: the scheduler wakes only when a job, or a work-gated driver's work, is due.
 *
 * Runs the real SchedulingEngineBase (interval math) under the real SchedulingEngine (timer, due
 * checks, gate wiring) with a fake driver whose pending work the test controls. Lock acquisition and
 * job execution are spied out; the questions here are when the engine wakes and what it runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';

vi.mock('os', () => ({
    default: { hostname: () => 'test-host' },
    hostname: () => 'test-host',
}));

const { dbCalls, fakeProvider } = vi.hoisted(() => {
    const dbCalls = { runView: 0, executeSQL: 0 };
    const fakeProvider = {
        MJCoreSchemaName: '__mj',
        ExecuteSQL: async (): Promise<Array<Record<string, unknown>>> => {
            dbCalls.executeSQL++;
            return [{ permission_name: 'EXECUTE' }];
        },
    };
    return { dbCalls, fakeProvider };
});

vi.mock('@memberjunction/core', () => ({
    BaseEngine: class {
        protected async Load(): Promise<void> {
            // rows are seeded directly by the tests
        }
        protected async HandleIndividualBaseEntityEvent(): Promise<boolean> {
            return true;
        }
        protected async OnExternalCacheChange(): Promise<void> {
            // no-op
        }
        public get ProviderToUse(): typeof fakeProvider {
            return fakeProvider;
        }
        public get RunViewProviderToUse(): Record<string, never> {
            return {};
        }
        public get ContextUser(): { ID: string } {
            return { ID: 'user-1' };
        }
        static getInstance<T>(): T {
            const ctor = this as unknown as { __instance?: T } & (new () => T);
            if (!ctor.__instance) {
                ctor.__instance = new ctor();
            }
            return ctor.__instance;
        }
    },
    UserInfo: class UserInfo { ID = 'user-1'; },
    Metadata: class {},
    IMetadataProvider: class {},
    LocalCacheManager: { Instance: { IsInitialized: false } },
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
    RunView: class {
        async RunView(): Promise<{ Success: boolean; Results: unknown[]; TotalRowCount: number }> {
            dbCalls.runView++;
            return { Success: true, Results: [], TotalRowCount: 0 };
        }
    },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobTypeEntity: class {},
    MJScheduledJobRunEntity: class {},
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({}));

const { createInstance } = vi.hoisted(() => ({ createInstance: vi.fn() }));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    const store: Record<string, unknown> = {};
    class BaseSingleton<T> {
        protected static getInstance<T>(this: new () => T): T {
            if (!store[this.name]) {
                store[this.name] = new this();
            }
            return store[this.name] as T;
        }
    }
    return {
        BaseSingleton,
        ToEpochMs: actual.ToEpochMs,
        UUIDsEqual: (a: string, b: string) => a === b,
        RegisterClass: () => () => undefined,
        MJGlobal: { Instance: { ClassFactory: { CreateInstance: createInstance } } },
    };
});

vi.mock('../NotificationManager', () => ({
    NotificationManager: { SendScheduledJobNotification: vi.fn() },
}));

import { SchedulingEngineBase } from '@memberjunction/scheduling-engine-base';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { SchedulingEngine } from '../ScheduledJobEngine';
import { BaseScheduledJob } from '../BaseScheduledJob';
import type { ScheduledJobResult, NotificationContent } from '@memberjunction/scheduling-base-types';
import type { ValidationResult } from '@memberjunction/core';

/** A work-gated driver whose pending work the test sets. */
class FakeGatedDriver extends BaseScheduledJob {
    public WorkDue: Date | null | undefined = null;
    public Prepared = 0;
    public readonly Changed = new Subject<void>();
    public override get IsHighFrequencyByDesign(): boolean {
        return true; // keeps the high-frequency banner out of the test output
    }
    public override NextWorkDueAt(): Date | null | undefined {
        return this.WorkDue;
    }
    public override async PrepareWorkGate(): Promise<void> {
        this.Prepared++;
    }
    public override get WorkGateChanged$() {
        return this.Changed.asObservable();
    }
    async Execute(): Promise<ScheduledJobResult> {
        return { Success: true };
    }
    ValidateConfiguration(): ValidationResult {
        return { Success: true, Errors: [] } as unknown as ValidationResult;
    }
    FormatNotification(): NotificationContent {
        return { Subject: '', Body: '', Priority: 'Normal' };
    }
}

/** An ordinary driver: not gated. */
class FakePlainDriver extends FakeGatedDriver {
    public override NextWorkDueAt(): Date | null | undefined {
        return undefined;
    }
    public override get WorkGateChanged$() {
        return null;
    }
}

type JobRow = Pick<MJScheduledJobEntity, 'ID' | 'Name' | 'Status' | 'JobTypeID' | 'CronExpression' | 'Timezone' | 'ConcurrencyMode' | 'MaxRuntimeMinutes'> & {
    NextRunAt: Date | null;
    StartAt: Date | null;
    EndAt: Date | null;
    MissedRunPolicy: MJScheduledJobEntity['MissedRunPolicy'];
};

type BaseInternals = { _scheduledJobs: JobRow[]; _scheduledJobTypes: Array<{ ID: string; DriverClass: string }> };
type EngineInternals = {
    tryAcquireLock: (jobId: string) => Promise<{ acquired: boolean; token?: string }>;
    executeJobWithLock: (job: JobRow) => Promise<null>;
    initializeNextRunTimes: () => Promise<void>;
    cleanupStaleLocks: () => Promise<void>;
    probeLockSprocPermissions: () => Promise<void>;
    gateDrivers: Map<string, BaseScheduledJob | null>;
};

const START = new Date('2026-11-03T12:00:30.000Z');
const MINUTE = 60_000;

function job(id: string, jobTypeID: string, nextRunAt: Date | null): JobRow {
    return {
        ID: id,
        Name: id,
        Status: 'Active',
        JobTypeID: jobTypeID,
        CronExpression: '0 * * * * *',
        Timezone: 'UTC',
        ConcurrencyMode: 'Skip',
        MaxRuntimeMinutes: null,
        NextRunAt: nextRunAt,
        StartAt: null,
        EndAt: null,
        MissedRunPolicy: 'Skip',
    };
}

describe('SchedulingEngine work gate (#6217)', () => {
    const base = SchedulingEngineBase.Instance as unknown as BaseInternals;
    const engine = SchedulingEngine.Instance;
    const internals = engine as unknown as EngineInternals;
    let gated: FakeGatedDriver;
    let plain: FakePlainDriver;
    let executed: string[];

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(START);
        gated = new FakeGatedDriver();
        plain = new FakePlainDriver();
        internals.gateDrivers.clear();
        createInstance.mockImplementation((_base: unknown, key: string) => (key === 'Gated' ? gated : key === 'Plain' ? plain : null));
        base._scheduledJobTypes = [{ ID: 'type-gated', DriverClass: 'Gated' }, { ID: 'type-plain', DriverClass: 'Plain' }];
        executed = [];
        vi.spyOn(internals, 'initializeNextRunTimes').mockResolvedValue(undefined);
        vi.spyOn(internals, 'cleanupStaleLocks').mockResolvedValue(undefined);
        vi.spyOn(internals, 'probeLockSprocPermissions').mockResolvedValue(undefined);
        vi.spyOn(internals, 'tryAcquireLock').mockResolvedValue({ acquired: true, token: 't' });
        vi.spyOn(internals, 'executeJobWithLock').mockImplementation(async (j: JobRow) => {
            executed.push(j.ID);
            // the real method advances NextRunAt to the next cron occurrence
            j.NextRunAt = new Date(Math.ceil((Date.now() + 1) / MINUTE) * MINUTE);
            return null;
        });
        engine.JobReconcileIntervalMs = 0;
        dbCalls.runView = 0;
        dbCalls.executeSQL = 0;
    });

    afterEach(async () => {
        await engine.StopPolling({ waitForInflight: true });
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    const user = new UserInfo() as UserInfo;

    it('never runs or wakes for a gated job with nothing pending, over an hour', async () => {
        base._scheduledJobs = [job('dispatcher', 'type-gated', new Date(START.getTime() - MINUTE))];
        gated.WorkDue = null;

        await engine.StartPolling(user);
        expect(engine.ActivePollingInterval).toBe(60 * MINUTE);

        await vi.advanceTimersByTimeAsync(59 * MINUTE);
        expect(executed).toEqual([]);
        expect(dbCalls.runView + dbCalls.executeSQL).toBe(0);
    });

    it('arms the timer for the work-due time and runs the gated job once then', async () => {
        base._scheduledJobs = [job('dispatcher', 'type-gated', new Date(START.getTime() - MINUTE))];
        gated.WorkDue = new Date(START.getTime() + 10 * MINUTE);

        await engine.StartPolling(user);
        expect(engine.ActivePollingInterval).toBe(10 * MINUTE);

        await vi.advanceTimersByTimeAsync(10 * MINUTE - 1_000);
        expect(executed).toEqual([]);

        gated.WorkDue = new Date(START.getTime() + 10 * MINUTE); // still pending when the timer fires
        await vi.advanceTimersByTimeAsync(1_000);
        expect(executed).toEqual(['dispatcher']);

        gated.WorkDue = null; // the run consumed the work
        gated.Changed.next();
        await vi.advanceTimersByTimeAsync(30 * MINUTE);
        expect(executed).toEqual(['dispatcher']);
    });

    it('re-arms the timer when the gate reports new work after polling started', async () => {
        base._scheduledJobs = [job('dispatcher', 'type-gated', new Date(START.getTime() - MINUTE))];
        gated.WorkDue = null;
        await engine.StartPolling(user);
        expect(engine.ActivePollingInterval).toBe(60 * MINUTE);

        gated.WorkDue = new Date(START.getTime() + 2 * MINUTE);
        gated.Changed.next();
        expect(engine.ActivePollingInterval).toBe(2 * MINUTE);

        await vi.advanceTimersByTimeAsync(2 * MINUTE);
        expect(executed).toEqual(['dispatcher']);
    });

    it('runs a gated job whose work is due now, ignoring its missed-run policy', async () => {
        // NextRunAt an hour back: with MissedRunPolicy=Skip an ungated job would only be advanced.
        base._scheduledJobs = [job('dispatcher', 'type-gated', new Date(START.getTime() - 60 * MINUTE))];
        gated.WorkDue = START;
        await engine.StartPolling(user);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(executed).toEqual(['dispatcher']);
    });

    it('keeps ungated jobs on their cron', async () => {
        base._scheduledJobs = [job('plain', 'type-plain', new Date(START.getTime() + 30_000))];
        await engine.StartPolling(user);
        expect(engine.ActivePollingInterval).toBe(30_000);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(executed).toEqual(['plain']);
        // re-armed for the next minute, not half of it
        expect(engine.ActivePollingInterval).toBe(60_000);
    });

    it('prepares each gated driver once per pass', async () => {
        base._scheduledJobs = [
            job('dispatcher', 'type-gated', new Date(START.getTime() - MINUTE)),
            job('dispatcher-2', 'type-gated', new Date(START.getTime() - MINUTE)),
        ];
        gated.WorkDue = null;
        await engine.StartPolling(user);
        expect(gated.Prepared).toBe(1);
    });
});
