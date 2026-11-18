/**
 * A scheduled job that is running is never dispatched again by the process running it.
 *
 * Reported on a production tenant (MJ 6.1.6): a nightly integration sync started a second run 9 s
 * after the first one finished, and that duplicate was then dispatched again every lease interval.
 * Three gaps in the engine combine to do it:
 *
 *   1. Any ScheduledJob save during a run (`advancePastMissedRuns`, a schedule toggle,
 *      `expireFinishedJobs`) fires OnJobChanged → Config(true), which REPLACES the `ScheduledJobs`
 *      entries with new objects read from the database — still carrying the run's pre-run
 *      `NextRunAt`. The dispatch loop then treats the running job as due.
 *   2. `updateJobStatistics` advanced only the object captured at dispatch, so once the run
 *      finished the live entry still read as due and the next tick ran the job again.
 *   3. The lease sweep untracked a hung run without moving `NextRunAt`, so the tick that swept it
 *      dispatched it again straight away, and again every lease interval after that.
 *
 * The harness models the database instead of queueing canned sproc results: the lock sprocs, the
 * stats sproc and the sweep's lease query all read and write one row per job, and Config(true)
 * rebuilds `ScheduledJobs` from those rows as new objects, the way the base engine's reload does.
 * So "the live entry is no longer the object the run holds" follows from the scenario rather than
 * being set up by hand.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// The simulated database and engine surroundings
// ---------------------------------------------------------------------------

/** One `__mj.ScheduledJob` row: the columns the engine reads or the sprocs write. */
interface JobRow {
    ID: string;
    Name: string;
    Status: string;
    JobTypeID: string;
    CronExpression: string;
    Timezone: string;
    ConcurrencyMode: string;
    MissedRunPolicy: string;
    StartAt: Date | null;
    EndAt: Date | null;
    MaxRuntimeMinutes: number | null;
    NextRunAt: Date | null;
    LastRunAt: Date | null;
    RunCount: number;
    SuccessCount: number;
    FailureCount: number;
    LockToken: string | null;
    LockedAt: Date | null;
    LockedByInstance: string | null;
    ExpectedCompletionAt: Date | null;
    NotifyOnSuccess: boolean;
    NotifyOnFailure: boolean;
}

/** A job entity as the engine holds it in `ScheduledJobs`. */
interface JobEntity extends JobRow {
    LatestResult: { CompleteMessage: string };
    Save: () => Promise<boolean>;
}

/** One `__mj.ScheduledJobRun` row. */
interface RunRow {
    ID: string;
    ScheduledJobID: string;
    Status: string;
    QueuedAt: Date | null;
    StartedAt: Date | null;
    CompletedAt: Date | null;
    Success: boolean;
    ErrorMessage: string | null;
}

interface RunEntity extends RunRow {
    ExecutedByUserID: string;
    Details: string | null;
    LatestResult: { CompleteMessage: string };
    Save: () => Promise<boolean>;
}

/** A run the test holds open until it calls `Finish`. */
interface HeldRun {
    Started: Promise<void>;
    Finish: (success?: boolean) => void;
}

const sim = vi.hoisted(() => {
    const jobRows = new Map<string, JobRow>();
    const runRows = new Map<string, RunRow>();
    /** Every lock-sproc call, in order. */
    const lockCalls: Array<{ Sproc: string; JobID: string }> = [];
    /** Job IDs whose entity was saved in full (BaseEntity.Save), in order. */
    const jobSaves: string[] = [];
    /** Plugin Execute calls per job ID. */
    const executions = new Map<string, number>();
    /** Runs the next Execute calls will hold open, in order; an Execute with none queued succeeds at once. */
    const heldRuns: Array<{ MarkStarted: () => void; Outcome: Promise<{ Success: boolean }> }> = [];
    const hooks: {
        /** Awaited inside the sweep's lease query before it reads the rows. */
        BeforeSweepReads?: () => Promise<void>;
        /** While set, the lock release waits for it — a release still in flight. */
        HoldRelease?: Promise<void>;
    } = {};
    let runSeq = 0;

    const copyRow = (source: JobRow): JobRow => ({
        ID: source.ID,
        Name: source.Name,
        Status: source.Status,
        JobTypeID: source.JobTypeID,
        CronExpression: source.CronExpression,
        Timezone: source.Timezone,
        ConcurrencyMode: source.ConcurrencyMode,
        MissedRunPolicy: source.MissedRunPolicy,
        StartAt: source.StartAt,
        EndAt: source.EndAt,
        MaxRuntimeMinutes: source.MaxRuntimeMinutes,
        NextRunAt: source.NextRunAt,
        LastRunAt: source.LastRunAt,
        RunCount: source.RunCount,
        SuccessCount: source.SuccessCount,
        FailureCount: source.FailureCount,
        LockToken: source.LockToken,
        LockedAt: source.LockedAt,
        LockedByInstance: source.LockedByInstance,
        ExpectedCompletionAt: source.ExpectedCompletionAt,
        NotifyOnSuccess: source.NotifyOnSuccess,
        NotifyOnFailure: source.NotifyOnFailure,
    });

    const base = {
        ScheduledJobs: [] as JobEntity[],
        ScheduledJobTypes: [{ ID: 'type-1', DriverClass: 'TestDriver' }],
        ScheduledJobRuns: [] as RunEntity[],
        ActivePollingInterval: 60_000 as number | null,
        ContextUser: { ID: 'user-1' },
        RunViewProviderToUse: {},
        ProviderToUse: {
            MJCoreSchemaName: '__mj',
            PlatformKey: 'sqlserver',
            Dialect: {
                ProcedureCallSyntax: (schema: string, name: string, params: string[]) =>
                    `EXEC [${schema}].[${name}] ${params.join(', ')}`,
            },
            ExecuteSQL: (_sql: string, params: unknown[], options: { description?: string }) =>
                executeSproc(options?.description ?? '', params),
        },
        /** Config(true) is the reload a ScheduledJob save triggers: new objects, read from the rows. */
        Config: async (forceRefresh?: boolean): Promise<boolean> => {
            if (forceRefresh) {
                base.ScheduledJobs = [...jobRows.values()].filter(r => r.Status === 'Active').map(toEntity);
            }
            return true;
        },
        UpdatePollingInterval: (): void => undefined,
        GetJobTypeByName: (): undefined => undefined,
        GetJobTypeByDriverClass: (): undefined => undefined,
        GetJobsByType: (): JobEntity[] => [],
        GetRunsForJob: (): RunEntity[] => [],
    };

    function toEntity(row: JobRow): JobEntity {
        const entity: JobEntity = {
            ...copyRow(row),
            LatestResult: { CompleteMessage: '' },
            // A full-entity save writes every column back, lock columns included, and then reloads
            // the job list, as MJScheduledJobEntityExtended.Save does.
            Save: async () => {
                jobSaves.push(entity.ID);
                jobRows.set(entity.ID, copyRow(entity));
                await base.Config(true);
                return true;
            },
        };
        return entity;
    }

    async function executeSproc(sproc: string, params: unknown[]): Promise<Array<Record<string, unknown>>> {
        const jobId = String(params[0]);
        const row = jobRows.get(jobId);
        const now = new Date();
        switch (sproc) {
            case 'spAcquireScheduledJobLock': {
                lockCalls.push({ Sproc: sproc, JobID: jobId });
                if (!row) {
                    return [{ Acquired: 0 }];
                }
                const free = !row.LockToken || !row.ExpectedCompletionAt || row.ExpectedCompletionAt < now;
                if (!free) {
                    return [{ Acquired: 0 }];
                }
                row.LockToken = String(params[1]);
                row.LockedAt = now;
                row.LockedByInstance = String(params[2]);
                row.ExpectedCompletionAt = params[3] as Date;
                return [{ Acquired: 1 }];
            }
            case 'spReleaseScheduledJobLockIfTokenMatches': {
                lockCalls.push({ Sproc: sproc, JobID: jobId });
                if (hooks.HoldRelease) {
                    await hooks.HoldRelease;
                }
                if (!row || row.LockToken !== String(params[1])) {
                    return [{ Released: 0 }];
                }
                row.LockToken = null;
                row.LockedAt = null;
                row.LockedByInstance = null;
                row.ExpectedCompletionAt = null;
                return [{ Released: 1 }];
            }
            case 'spUpdateScheduledJobStatistics': {
                if (row) {
                    row.RunCount++;
                    if (params[1] === 1) {
                        row.SuccessCount++;
                    } else {
                        row.FailureCount++;
                    }
                    row.LastRunAt = params[2] as Date;
                    row.NextRunAt = params[3] as Date;
                }
                return [];
            }
            default:
                // The startup permission probe and anything else: answer "granted".
                return [{ permission_name: 'EXECUTE' }];
        }
    }

    /** The sweep's query: tracked jobs whose lock is gone or whose lease has run out. */
    function staleLeases(extraFilter: string): Array<{ ID: string; Name: string; ExpectedCompletionAt: Date | null }> {
        const ids = [...(extraFilter.match(/ID IN \(([^)]*)\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]);
        const now = new Date();
        return ids
            .map(id => jobRows.get(id))
            .filter((row): row is JobRow => !!row)
            .filter(row => !row.LockToken || !row.ExpectedCompletionAt || row.ExpectedCompletionAt < now)
            .map(row => ({ ID: row.ID, Name: row.Name, ExpectedCompletionAt: row.ExpectedCompletionAt }));
    }

    function newRun(): RunEntity {
        runSeq++;
        const run: RunEntity = {
            ID: `run-${runSeq}`,
            ScheduledJobID: '',
            ExecutedByUserID: '',
            Status: 'Running',
            QueuedAt: null,
            StartedAt: null,
            CompletedAt: null,
            Success: false,
            ErrorMessage: null,
            Details: null,
            LatestResult: { CompleteMessage: '' },
            Save: async () => {
                runRows.set(run.ID, {
                    ID: run.ID,
                    ScheduledJobID: run.ScheduledJobID,
                    Status: run.Status,
                    QueuedAt: run.QueuedAt,
                    StartedAt: run.StartedAt,
                    CompletedAt: run.CompletedAt,
                    Success: run.Success,
                    ErrorMessage: run.ErrorMessage,
                });
                return true;
            },
        };
        return run;
    }

    /** The sweep's orphan cleanup query: a job's runs still marked Running, as fresh objects. */
    function runningRuns(extraFilter: string): RunEntity[] {
        const jobId = extraFilter.match(/ScheduledJobID='([^']+)'/)?.[1];
        return [...runRows.values()]
            .filter(r => r.ScheduledJobID === jobId && r.Status === 'Running')
            .map(r => {
                const run = newRun();
                Object.assign(run, r, { ID: r.ID });
                return run;
            });
    }

    const plugin = {
        Execute: async (context: { Schedule: { ID: string } }): Promise<{ Success: boolean }> => {
            const jobId = context.Schedule.ID;
            executions.set(jobId, (executions.get(jobId) ?? 0) + 1);
            const held = heldRuns.shift();
            if (!held) {
                return { Success: true };
            }
            held.MarkStarted();
            return held.Outcome;
        },
    };

    return { jobRows, runRows, lockCalls, jobSaves, executions, heldRuns, hooks, base, plugin, staleLeases, runningRuns, newRun };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('os', () => ({
    default: { hostname: () => 'test-host' },
    hostname: () => 'test-host',
}));

vi.mock('@memberjunction/core', () => ({
    UserInfo: class UserInfo { ID = 'user-1'; },
    IMetadataProvider: class {},
    Metadata: class {
        async GetEntityObject(): Promise<RunEntity> {
            return sim.newRun();
        }
    },
    RunView: class {
        async RunView(params: { EntityName: string; ExtraFilter?: string }): Promise<{ Success: boolean; Results: unknown[] }> {
            if (params.EntityName === 'MJ: Scheduled Jobs') {
                if (sim.hooks.BeforeSweepReads) {
                    await sim.hooks.BeforeSweepReads();
                }
                return { Success: true, Results: sim.staleLeases(params.ExtraFilter ?? '') };
            }
            if (params.EntityName === 'MJ: Scheduled Job Runs') {
                return { Success: true, Results: sim.runningRuns(params.ExtraFilter ?? '') };
            }
            return { Success: true, Results: [] };
        }
    },
    LogError: (): void => undefined,
    LogStatusEx: (): void => undefined,
    IsVerboseLoggingEnabled: (): boolean => false,
    LocalCacheManager: {
        Instance: {
            IsInitialized: false,
            InvalidateEntityCaches: async (): Promise<void> => undefined,
        },
    },
    // CronExpressionHelper (used for real here) imports these for its validator.
    ValidationResult: class { Success = true; Errors: unknown[] = []; },
    ValidationErrorInfo: class {},
    ValidationErrorType: { Failure: 'Failure', Warning: 'Warning' },
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {},
    MJScheduledJobRunEntity: class {},
    MJScheduledJobTypeEntity: class {},
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
    const { ToEpochMs } = await importOriginal<typeof import('@memberjunction/global')>();
    const singletons: Record<string, unknown> = {};
    class BaseSingleton<T> {
        protected static getInstance<T>(this: new () => T): T {
            if (!singletons[this.name]) {
                singletons[this.name] = new this();
            }
            return singletons[this.name] as T;
        }
    }
    return {
        BaseSingleton,
        ToEpochMs,
        MJGlobal: { Instance: { ClassFactory: { CreateInstance: () => sim.plugin } } },
        RegisterClass: () => (target: unknown) => target,
        UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
    };
});

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationChannel: {},
}));

vi.mock('@memberjunction/scheduling-engine-base', () => ({
    SchedulingEngineBase: { get Instance() { return sim.base; } },
}));

vi.mock('../NotificationManager', () => ({
    NotificationManager: { SendScheduledJobNotification: async (): Promise<void> => undefined },
}));

import { SchedulingEngine } from '../ScheduledJobEngine';
import type { UserInfo } from '@memberjunction/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The engine's private state these tests drive or inspect. */
interface EngineInternals {
    inflightJobPromises: Map<string, Promise<unknown>>;
    acceptingDispatches: boolean;
    isPolling: boolean;
}

const HOUR_MS = 60 * 60 * 1000;
const user = { ID: 'user-1' } as unknown as UserInfo;
const engine = (): SchedulingEngine => SchedulingEngine.Instance;
const internals = (): EngineInternals => SchedulingEngine.Instance as unknown as EngineInternals;

/** Add a job row that is due now (an hourly job whose NextRunAt passed a second ago) and load it. */
async function seedJob(overrides: Partial<JobRow> = {}): Promise<string> {
    const id = `job-${sim.jobRows.size + 1}`;
    sim.jobRows.set(id, {
        ID: id,
        Name: `Nightly sync ${id}`,
        Status: 'Active',
        JobTypeID: 'type-1',
        CronExpression: '0 * * * *',
        Timezone: 'UTC',
        ConcurrencyMode: 'Skip',
        MissedRunPolicy: 'RunOnce',
        StartAt: null,
        EndAt: null,
        MaxRuntimeMinutes: null,
        NextRunAt: new Date(Date.now() - 1000),
        LastRunAt: null,
        RunCount: 0,
        SuccessCount: 0,
        FailureCount: 0,
        LockToken: null,
        LockedAt: null,
        LockedByInstance: null,
        ExpectedCompletionAt: null,
        NotifyOnSuccess: false,
        NotifyOnFailure: false,
        ...overrides,
    });
    await sim.base.Config(true);
    return id;
}

/** Hold the next plugin Execute open until the test finishes it. */
function holdNextRun(): HeldRun {
    let markStarted: () => void = () => undefined;
    let finish: (outcome: { Success: boolean }) => void = () => undefined;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const outcome = new Promise<{ Success: boolean }>(resolve => { finish = resolve; });
    sim.heldRuns.push({ MarkStarted: markStarted, Outcome: outcome });
    return { Started: started, Finish: (success = true) => finish({ Success: success }) };
}

/** Let every pending promise reaction run, including the dispatch's untracking `.finally`. */
async function drain(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
}

/** The entry the dispatch loop will look at for this job. */
function liveEntry(jobId: string): JobEntity {
    const entry = sim.base.ScheduledJobs.find(j => j.ID === jobId);
    if (!entry) {
        throw new Error(`No live entry for ${jobId}`);
    }
    return entry;
}

function row(jobId: string): JobRow {
    const r = sim.jobRows.get(jobId);
    if (!r) {
        throw new Error(`No row for ${jobId}`);
    }
    return r;
}

/** The DB's view of time passing past the lease this run took. */
function expireLease(jobId: string): void {
    row(jobId).ExpectedCompletionAt = new Date(Date.now() - 1000);
}

const acquireAttempts = (jobId: string): number =>
    sim.lockCalls.filter(c => c.Sproc === 'spAcquireScheduledJobLock' && c.JobID === jobId).length;
const queuedRuns = (jobId: string): RunRow[] =>
    [...sim.runRows.values()].filter(r => r.ScheduledJobID === jobId && r.QueuedAt !== null);
const stats = (j: JobRow) => ({
    RunCount: j.RunCount,
    SuccessCount: j.SuccessCount,
    FailureCount: j.FailureCount,
    LastRunAt: j.LastRunAt?.getTime() ?? null,
    NextRunAt: j.NextRunAt?.getTime() ?? null,
});

beforeEach(() => {
    sim.jobRows.clear();
    sim.runRows.clear();
    sim.lockCalls.length = 0;
    sim.jobSaves.length = 0;
    sim.executions.clear();
    sim.heldRuns.length = 0;
    sim.hooks.BeforeSweepReads = undefined;
    sim.hooks.HoldRelease = undefined;
    sim.base.ScheduledJobs = [];

    const state = internals();
    state.inflightJobPromises.clear();
    state.acceptingDispatches = true;
    // A live poller: OnJobChanged then only reloads, as it does mid-run in production, instead of
    // starting a poll loop of its own.
    state.isPolling = true;
    engine().MaxConcurrentJobs = 5;
    engine().LeaseTimeoutMs = 10 * 60 * 1000;
});

afterEach(() => {
    internals().isPolling = false;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('a mid-run reload (OnJobChanged → Config(true)) brings back the pre-run NextRunAt', () => {
    it('does not make the next tick contend for the running job\'s lock or queue a run behind it', async () => {
        const id = await seedJob({ ConcurrencyMode: 'Queue' });
        const run = holdNextRun();

        const first = await engine().DispatchScheduledJobs(user);
        expect(first.dispatched).toBe(1);
        await run.Started;
        const dispatchedEntry = liveEntry(id);

        // A ScheduledJob save anywhere in the process reloads the list while the run is going.
        await engine().OnJobChanged(user);
        expect(liveEntry(id)).not.toBe(dispatchedEntry);
        expect(liveEntry(id).NextRunAt!.getTime()).toBeLessThanOrEqual(Date.now());

        const second = await engine().DispatchScheduledJobs(user);

        expect(second).toEqual({ swept: 0, dispatched: 0, lockedOut: 0, skippedAtCapacity: 0 });
        expect(acquireAttempts(id)).toBe(1);
        expect(queuedRuns(id)).toEqual([]);
        expect(sim.executions.get(id)).toBe(1);

        run.Finish();
        await drain();
    });

    it('does not save the running job\'s row as a "missed run" when the run outlasts its next occurrence', async () => {
        const id = await seedJob({ MissedRunPolicy: 'Skip' });
        const run = holdNextRun();

        await engine().DispatchScheduledJobs(user);
        await run.Started;
        await engine().OnJobChanged(user);

        // Two hours later the run is still going; its hourly occurrence has come and gone.
        const later = new Date(Date.now() + 2 * HOUR_MS);
        const tick = await engine().DispatchScheduledJobs(user, later);

        expect(sim.jobSaves).not.toContain(id);
        expect(tick).toEqual({ swept: 0, dispatched: 0, lockedOut: 0, skippedAtCapacity: 0 });
        expect(sim.executions.get(id)).toBe(1);

        run.Finish();
        await drain();
    });
});

describe('a run that finishes after a mid-run reload', () => {
    it('leaves the live entry carrying the advanced NextRunAt and stats, so the next tick does not run it again', async () => {
        const id = await seedJob();
        const run = holdNextRun();

        await engine().DispatchScheduledJobs(user);
        await run.Started;
        const tracked = internals().inflightJobPromises.get(id);
        await engine().OnJobChanged(user);

        run.Finish(true);
        await tracked;
        await drain();
        // Untracked, so it is the entry's NextRunAt — not the in-flight guard — that keeps it idle.
        expect(internals().inflightJobPromises.has(id)).toBe(false);

        expect(row(id).NextRunAt!.getTime()).toBeGreaterThan(Date.now());
        expect(row(id)).toMatchObject({ RunCount: 1, SuccessCount: 1, FailureCount: 0 });
        expect(stats(liveEntry(id))).toEqual(stats(row(id)));

        const next = await engine().DispatchScheduledJobs(user);

        expect(next.dispatched).toBe(0);
        expect(acquireAttempts(id)).toBe(1);
        expect(sim.executions.get(id)).toBe(1);
    });
});

describe('a hung run reclaimed by the lease sweep', () => {
    it.each([
        ['with no reload', false],
        ['after a mid-run reload', true],
    ])('counts as a failed run, moves to its next occurrence, and is not dispatched again (%s)', async (_label, reload) => {
        const id = await seedJob();
        holdNextRun(); // never finished

        await engine().DispatchScheduledJobs(user);
        await drain();
        if (reload) {
            await engine().OnJobChanged(user);
        }
        expireLease(id);

        const sweepTick = await engine().DispatchScheduledJobs(user);

        expect(sweepTick.swept).toBe(1);
        expect(sweepTick.dispatched).toBe(0);
        expect(row(id).NextRunAt!.getTime()).toBeGreaterThan(Date.now());
        expect(row(id)).toMatchObject({ RunCount: 1, SuccessCount: 0, FailureCount: 1 });
        expect(stats(liveEntry(id))).toEqual(stats(row(id)));

        const following = await engine().DispatchScheduledJobs(user);

        expect(following).toEqual({ swept: 0, dispatched: 0, lockedOut: 0, skippedAtCapacity: 0 });
        expect(acquireAttempts(id)).toBe(1);
        expect(sim.executions.get(id)).toBe(1);
    });

    it('is not counted a second time when the hung execution settles later', async () => {
        const id = await seedJob();
        const hung = holdNextRun();

        await engine().DispatchScheduledJobs(user);
        await hung.Started;
        const tracked = internals().inflightJobPromises.get(id);
        expireLease(id);
        await engine().DispatchScheduledJobs(user);
        const advancedTo = row(id).NextRunAt!.getTime();

        hung.Finish(true);
        await tracked;
        await drain();

        expect(row(id)).toMatchObject({ RunCount: 1, SuccessCount: 0, FailureCount: 1 });
        expect(row(id).NextRunAt!.getTime()).toBe(advancedTo);
        expect(stats(liveEntry(id))).toEqual(stats(row(id)));
    });
});

describe('a run the sweep sees just as it finishes is counted once, as what it was', () => {
    it('a run that released its lock while the sweep was reading is not counted as failed', async () => {
        // The sweep's query matches `LockToken IS NULL` too, so a job that finished and released its
        // lock while the query was in flight comes back as "stale" (see abandonOrphanedRunRecords).
        const id = await seedJob();
        const run = holdNextRun();

        await engine().DispatchScheduledJobs(user);
        await run.Started;
        const tracked = internals().inflightJobPromises.get(id);
        sim.hooks.BeforeSweepReads = async () => {
            sim.hooks.BeforeSweepReads = undefined;
            run.Finish(true);
            await tracked;
            await drain();
        };

        await engine().DispatchScheduledJobs(user);

        expect(row(id)).toMatchObject({ RunCount: 1, SuccessCount: 1, FailureCount: 0 });
    });

    it('a run whose lease ran out while it was recording its outcome is not also counted as failed', async () => {
        const id = await seedJob();
        const run = holdNextRun();

        await engine().DispatchScheduledJobs(user);
        await run.Started;
        const tracked = internals().inflightJobPromises.get(id);

        let releaseLock: () => void = () => undefined;
        sim.hooks.HoldRelease = new Promise<void>(resolve => { releaseLock = resolve; });
        run.Finish(true);
        await drain();
        // Its statistics are written; its lock release is still in flight; its lease has run out.
        expect(row(id).RunCount).toBe(1);
        expect(internals().inflightJobPromises.get(id)).toBe(tracked);
        expireLease(id);

        await engine().DispatchScheduledJobs(user);
        sim.hooks.HoldRelease = undefined;
        releaseLock();
        await tracked;

        expect(row(id)).toMatchObject({ RunCount: 1, SuccessCount: 1, FailureCount: 0 });
    });
});
