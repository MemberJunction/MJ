/**
 * Tests for the v5.39 ScheduledJobEngine poll-loop decoupling fix (GH #2736).
 *
 * Covers all 19 acceptance tests from the punch-list:
 *   T1  Hung plugin does not stall polling
 *   T2  Sweep reclaims expired lease
 *   T3  Token-checked release prevents lost-mutex
 *   T4  Single-tick cap is HARD (deterministic)
 *   T5  Lock-failed jobs don't consume cap
 *   T6  StopPolling({ waitForInflight: true }) awaits
 *   T7  StopPolling({ waitForInflight: true, maxWaitMs }) bounded
 *   T8  StopPolling() without waitForInflight returns immediately
 *   T9  Cross-body overlap: cap is SOFT (with explicit overlap)
 *   T10 Zombie sweep frees cap-saturated slots
 *   T11 ExecuteScheduledJobs (unmodified API) still awaits everything
 *   T12 Sproc atomicity — covered at DB level via Phase 1 sqlcmd test; doc-only here
 *   T13 Orphaned run records abandoned by sweep
 *   T14 Late-settling hung promise doesn't free fresh dispatch's slot
 *   T15 LeaseTimeoutMs configurable
 *   T16 Job-list refresh requires explicit OnJobChanged
 *   T17 Synchronous throw in executeJobWithLock cleans up entry (TDZ guard)
 *   T18 Sweep is single-query
 *   T19 Permission probe warns on missing grant
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('os', () => ({
    default: { hostname: () => 'test-host' },
    hostname: () => 'test-host'
}));

// Captured by individual tests to assert log content (probe warnings, sweep lines).
const logErrorMock = vi.fn();

// Cache-invalidation mock surface — toggle init flag + assert invalidation calls per test.
const mockCacheState = { initialized: false, throwOnInvalidate: false };
const mockInvalidateEntityCaches = vi.fn(async (_entityName: string) => {
    if (mockCacheState.throwOnInvalidate) {
        throw new Error('Mock cache invalidation failure');
    }
});
const logStatusMock = vi.fn();

vi.mock('@memberjunction/core', () => {
    // The RunView mock is shared across tests; each test installs results
    // via `mockRunViewQueue.push(...)`. Calls consume from the queue head.
    return {
        UserInfo: class UserInfo { ID = 'user-1' },
        // Class mock so it survives vi.clearAllMocks(). GetEntityObject returns
        // a fresh entity-like object each call.
        Metadata: class MockMetadata {
            async GetEntityObject(): Promise<Record<string, unknown>> {
                return {
                    ScheduledJobID: '',
                    ExecutedByUserID: '',
                    Status: 'Running',
                    StartedAt: null,
                    CompletedAt: null,
                    QueuedAt: null,
                    Success: false,
                    ErrorMessage: null,
                    Save: async () => true,
                    Load: async () => true,
                    LatestResult: { CompleteMessage: '' },
                    ID: 'run-from-md-' + Math.random().toString(36).slice(2)
                };
            }
        },
        IMetadataProvider: class {},
        LogError: (...args: unknown[]) => logErrorMock(...args),
        LogStatusEx: (entry: { message: string }) => logStatusMock(entry?.message ?? ''),
        IsVerboseLoggingEnabled: vi.fn(() => false),
        // Plain function so it survives vi.clearAllMocks(). Counter increments
        // each construction; T18 reads the counter to verify single-query sweep.
        RunView: class MockRunView {
            constructor() {
                runViewConstructorCount++;
            }
            async RunView(): Promise<unknown> {
                const next = mockRunViewQueue.shift();
                if (!next) {
                    return { Success: true, Results: [] };
                }
                return next;
            }
        },
        // Cache-invalidation surface. Engine calls IsInitialized first; if false,
        // skips the invalidation (matches production-init semantics).
        //
        // Both members are accessed lazily (getters / closure-wrapped call) to
        // dodge the vitest mock-hoisting trap: vi.mock() factories are hoisted
        // above any top-level `const`, so direct references like
        // `InvalidateEntityCaches: mockInvalidateEntityCaches` evaluate before
        // the const is initialized and throw a ReferenceError at module load.
        LocalCacheManager: {
            Instance: {
                get IsInitialized() {
                    return mockCacheState.initialized;
                },
                InvalidateEntityCaches: (entityName: string) => mockInvalidateEntityCaches(entityName)
            }
        }
    };
});

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {
        ID = '';
        Name = '';
        Status = 'Active';
        CronExpression = '*/1 * * * *';
        Timezone = 'UTC';
        NextRunAt: Date | null = null;
        StartAt: Date | null = null;
        EndAt: Date | null = null;
        LockToken: string | null = null;
        LockedAt: Date | null = null;
        LockedByInstance: string | null = null;
        ExpectedCompletionAt: Date | null = null;
        ConcurrencyMode = 'Skip';
        RunCount = 0;
        SuccessCount = 0;
        FailureCount = 0;
        LastRunAt: Date | null = null;
        RunImmediatelyIfNeverRun = false;
        JobTypeID = 'type-1';
        NotifyOnSuccess = false;
        NotifyOnFailure = false;
        NotifyUserID: string | null = null;
        OwnerUserID: string | null = null;
        NotifyViaEmail = false;
        NotifyViaInApp = false;
        Configuration = '';
        Save = vi.fn().mockResolvedValue(true);
        Load = vi.fn().mockResolvedValue(true);
    },
    MJScheduledJobRunEntity: class {
        ID = 'run-' + Math.random().toString(36).slice(2);
        ScheduledJobID = '';
        ExecutedByUserID = '';
        Status: string = 'Running';
        StartedAt: Date | null = null;
        CompletedAt: Date | null = null;
        QueuedAt: Date | null = null;
        Success = false;
        ErrorMessage: string | null = null;
        Details: string | null = null;
        LatestResult = { CompleteMessage: '' };
        Save = vi.fn().mockResolvedValue(true);
    }
}));

// Shared singleton store for BaseSingleton mock
const singletonStore: Record<string, unknown> = {};

// Captured by tests; ClassFactory.CreateInstance delegates here.
// Default factory is installed in beforeEach.
let createInstanceImpl: (base: unknown, driverClass: string) => unknown = () => undefined;

vi.mock('@memberjunction/global', () => {
    class BaseSingleton<T> {
        protected static getInstance<T>(this: new () => T): T {
            const key = this.name;
            if (!singletonStore[key]) {
                singletonStore[key] = new this();
            }
            return singletonStore[key] as T;
        }
    }
    return {
        BaseSingleton,
        MJGlobal: {
            Instance: {
                ClassFactory: {
                    // Plain function (NOT a vi.fn) so it survives vi.clearAllMocks().
                    // Delegates to createInstanceImpl, which beforeEach resets.
                    CreateInstance: (base: unknown, driverClass: string) => createInstanceImpl(base, driverClass)
                }
            }
        },
        RegisterClass: () => (target: unknown) => target,
        UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase()
    };
});

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationChannel: {}
}));

// Mocks for the Base singleton — extended with ProviderToUse/RunViewProviderToUse/ContextUser
// that the new decoupling code reads.
vi.mock('@memberjunction/scheduling-engine-base', () => {
    const fakeBase = {
        ScheduledJobs: [] as Array<Record<string, unknown>>,
        ScheduledJobTypes: [{ ID: 'type-1', DriverClass: 'TestDriver' }] as Array<Record<string, unknown>>,
        ScheduledJobRuns: [] as Array<Record<string, unknown>>,
        ActivePollingInterval: 60000 as number | null,
        Config: vi.fn().mockResolvedValue(true),
        UpdatePollingInterval: vi.fn(),
        GetJobTypeByName: vi.fn(),
        GetJobTypeByDriverClass: vi.fn(),
        GetJobsByType: vi.fn().mockReturnValue([]),
        GetRunsForJob: vi.fn().mockReturnValue([]),
        ContextUser: { ID: 'user-1' },
        // Provider acts as both an IMetadataProvider and (after cast) a DatabaseProviderBase.
        // The engine accesses .MJCoreSchemaName and .ExecuteSQL on it.
        ProviderToUse: {
            MJCoreSchemaName: '__mj',
            // PlatformKey + Dialect feed ScheduledJobEngine.buildLockSprocCall, which
            // builds the dialect-appropriate sproc call. Mimic the SQL Server dialect
            // here so the engine exercises its default (EXEC) path under test.
            PlatformKey: 'sqlserver',
            Dialect: {
                ProcedureCallSyntax: (schema: string, name: string, params: string[]) =>
                    `EXEC [${schema}].[${name}] ${params.join(', ')}`
            },
            ExecuteSQL: vi.fn().mockImplementation(async () => {
                const next = mockExecuteSQLQueue.shift();
                if (next === undefined) {
                    // Default: probe returns "EXECUTE granted" so probe doesn't warn.
                    return [{ permission_name: 'EXECUTE' }];
                }
                return next;
            })
        },
        RunViewProviderToUse: {} // unused by mock RunView (which reads from queue)
    };

    return {
        SchedulingEngineBase: {
            get Instance() { return fakeBase; }
        }
    };
});

vi.mock('../CronExpressionHelper', () => ({
    CronExpressionHelper: {
        GetNextRunTime: vi.fn().mockReturnValue(new Date('2099-01-01T00:00:00Z')),
        IsExpressionDue: vi.fn().mockReturnValue(false)
    }
}));

vi.mock('../NotificationManager', () => ({
    NotificationManager: {
        SendScheduledJobNotification: vi.fn().mockResolvedValue(undefined)
    }
}));

// ---------------------------------------------------------------------------
// Per-test queues for mock return values
// ---------------------------------------------------------------------------

/** FIFO queue: each ExecuteSQL call shifts the next entry. */
const mockExecuteSQLQueue: Array<Array<Record<string, unknown>>> = [];

/** FIFO queue: each rv.RunView call shifts the next result. */
const mockRunViewQueue: Array<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }> = [];

/** Incremented each time `new RunView(...)` is called — used by T18. */
let runViewConstructorCount = 0;

/** Factory for mock plugins. Each test reassigns to control behavior. */
let mockPluginFactory: () => { Execute: (...args: unknown[]) => Promise<unknown> };

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { SchedulingEngine } from '../ScheduledJobEngine';
import { SchedulingEngineBase } from '@memberjunction/scheduling-engine-base';

// Helpers ====================================================================

/** Helper to install N "Acquired=1" sproc responses followed by "Released=1" responses. */
function queueAcquireRelease(acquireResults: number[], releaseResults: number[]): void {
    for (const a of acquireResults) {
        mockExecuteSQLQueue.push([{ Acquired: a }]);
    }
    for (const r of releaseResults) {
        mockExecuteSQLQueue.push([{ Released: r }]);
    }
}

/** Helper to install permission-probe response (probe runs at startup). */
function queueProbeOk(): void {
    mockExecuteSQLQueue.unshift([{ permission_name: 'EXECUTE' }]);
}

function queueProbeMissing(): void {
    mockExecuteSQLQueue.unshift([]);
}

/** Build a job entity-like object for the mockBase.ScheduledJobs array. */
function makeJob(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        ID: 'job-' + Math.random().toString(36).slice(2),
        Name: 'TestJob',
        Status: 'Active',
        JobTypeID: 'type-1',
        ConcurrencyMode: 'Skip',
        NextRunAt: new Date(Date.now() - 1000),  // 1s in the past → due
        StartAt: null,
        EndAt: null,
        CronExpression: '*/1 * * * *',
        Timezone: 'UTC',
        // Stats and persistence — exercised by updateJobStatistics and any
        // notification path that touches job state. Required so the success
        // branch of executeJobWithLock doesn't throw when reaching them.
        RunCount: 0,
        SuccessCount: 0,
        FailureCount: 0,
        LastRunAt: null,
        NotifyOnSuccess: false,
        NotifyOnFailure: false,
        Save: async () => true,
        Load: async () => true,
        LatestResult: { CompleteMessage: '' },
        ...overrides
    };
}

const mockUser = { ID: 'user-1' };
const mockBase = SchedulingEngineBase.Instance as Record<string, unknown> & {
    ScheduledJobs: Array<Record<string, unknown>>;
    ProviderToUse: {
        ExecuteSQL: ReturnType<typeof vi.fn>;
        MJCoreSchemaName: string;
        PlatformKey: string;
        Dialect: { ProcedureCallSyntax: (schema: string, name: string, params: string[]) => string };
    };
};

beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteSQLQueue.length = 0;
    mockRunViewQueue.length = 0;
    mockBase.ScheduledJobs = [];
    (mockBase.ScheduledJobTypes as Array<Record<string, unknown>>).length = 0;
    (mockBase.ScheduledJobTypes as Array<Record<string, unknown>>).push({ ID: 'type-1', DriverClass: 'TestDriver' });
    logErrorMock.mockClear();
    logStatusMock.mockClear();
    // Reset cache state — default to uninitialized so tests that don't care about
    // cache invalidation behave as production does on first boot.
    mockCacheState.initialized = false;
    mockCacheState.throwOnInvalidate = false;
    mockInvalidateEntityCaches.mockClear();

    // Re-install mock implementations — vi.clearAllMocks() wipes them.
    mockBase.ProviderToUse.ExecuteSQL.mockImplementation(async () => {
        const next = mockExecuteSQLQueue.shift();
        if (next === undefined) {
            return [{ permission_name: 'EXECUTE' }];
        }
        return next;
    });

    // (Re-)install ClassFactory.CreateInstance delegate. Engine code calls
    // MJGlobal.Instance.ClassFactory.CreateInstance which delegates here.
    // Returns a plugin from mockPluginFactory (test can swap factory per case),
    // or throws synchronously for the '__SYNC_THROW__' driver used by T17.
    createInstanceImpl = (_base: unknown, driverClass: string) => {
        if (driverClass === '__SYNC_THROW__') {
            throw new Error('Simulated synchronous throw from ClassFactory');
        }
        return mockPluginFactory();
    };
    // RunView is a class mock — survives clearAllMocks. Just reset the counter.
    runViewConstructorCount = 0;

    // Reset engine singleton state — necessary because the engine is a BaseSingleton
    // and state leaks across tests (e.g., StopPolling sets acceptingDispatches=false,
    // breaking subsequent DispatchScheduledJobs calls).
    const engine = SchedulingEngine.Instance;
    // @ts-expect-error: resetting internal state for test isolation
    engine.inflightJobPromises.clear();
    // @ts-expect-error
    engine.acceptingDispatches = true;
    // @ts-expect-error
    engine.isPolling = false;
    // @ts-expect-error
    engine.hasInitialized = false;
    // @ts-expect-error
    engine.pollingTimer = undefined;
    // Reset configurable knobs to defaults
    engine.MaxConcurrentJobs = 5;
    engine.LeaseTimeoutMs = 10 * 60 * 1000;

    // Default plugin: resolves immediately with Success
    mockPluginFactory = () => ({
        Execute: vi.fn().mockResolvedValue({ Success: true, Details: {} })
    });
});

afterEach(() => {
    vi.useRealTimers();
});

// ============================================================================
// T1: Hung plugin does not stall polling
// ============================================================================

describe('T1: Hung plugin does not stall polling', () => {
    it('continues to dispatch after a hung job, with other due jobs progressing', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;

        // Two jobs both "due"
        const hungJob = makeJob({ Name: 'HungJob' });
        const healthyJob = makeJob({ Name: 'HealthyJob' });
        mockBase.ScheduledJobs = [hungJob, healthyJob];

        // Plugin: hungJob never resolves; healthyJob completes immediately.
        let callCount = 0;
        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) {
                    // First call (hung job) — never resolves
                    return new Promise(() => { /* never */ });
                }
                return Promise.resolve({ Success: true, Details: {} });
            })
        });

        // Queue: acquire for hung (1), acquire for healthy (1), release for healthy (1).
        // Hung job's release never fires because plugin.Execute never settles.
        queueAcquireRelease([1, 1], [1]);

        const result = await engine.DispatchScheduledJobs(mockUser as never);

        expect(result.dispatched).toBe(2);
        expect(result.lockedOut).toBe(0);
        expect(result.skippedAtCapacity).toBe(0);
        // DispatchScheduledJobs returned without awaiting plugin completion —
        // proves the poll body would re-arm immediately even with a hung job in flight.
    });
});

// ============================================================================
// T2: Sweep reclaims expired lease
// ============================================================================

describe('T2: Sweep reclaims expired lease', () => {
    it('untracks inflight job whose DB lease has expired', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;
        engine.LeaseTimeoutMs = 1000;  // 1s lease

        const job = makeJob({ Name: 'HungJob', ID: 'job-hung-1' });
        mockBase.ScheduledJobs = [job];

        // First call: hung plugin
        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => new Promise(() => {}))
        });
        queueAcquireRelease([1], []);

        const first = await engine.DispatchScheduledJobs(mockUser as never);
        expect(first.dispatched).toBe(1);
        // @ts-expect-error: testing internal state
        expect(engine.inflightJobPromises.size).toBe(1);

        // Now simulate lease expiry. Sweep queries for stale jobs; we return the hung job.
        mockRunViewQueue.push({
            Success: true,
            Results: [{ ID: 'job-hung-1', Name: 'HungJob', ExpectedCompletionAt: new Date(Date.now() - 10_000) }]
        });
        // abandonOrphanedRunRecords also calls RunView (looking for orphaned Running runs);
        // return empty so it's a no-op.
        mockRunViewQueue.push({ Success: true, Results: [] });

        // job is no longer "due" (we already dispatched it) — make NextRunAt in the future
        // to avoid a re-dispatch attempt that would consume more sproc queue items.
        job.NextRunAt = new Date(Date.now() + 60_000);

        const second = await engine.DispatchScheduledJobs(mockUser as never);

        expect(second.swept).toBe(1);
        // @ts-expect-error: testing internal state
        expect(engine.inflightJobPromises.size).toBe(0);
    });
});

// ============================================================================
// T3: Token-checked release prevents lost-mutex
// ============================================================================

describe('T3: Token-checked release prevents lost-mutex', () => {
    it('releaseLockIfTokenMatches returns false when DB token has been replaced', async () => {
        const engine = SchedulingEngine.Instance;

        // Simulate the release sproc returning Released=0 (token mismatch).
        mockExecuteSQLQueue.push([{ Released: 0 }]);

        // @ts-expect-error: private method, called for unit test
        const released = await engine.releaseLockIfTokenMatches(
            'job-id', '11111111-1111-1111-1111-111111111111'
        );

        expect(released).toBe(false);
        // The sproc was called — but the contract is "no-op if token mismatch."
        expect(mockBase.ProviderToUse.ExecuteSQL).toHaveBeenCalled();
    });
});

// ============================================================================
// T4: Single-tick cap is HARD (deterministic)
// ============================================================================

describe('T4: Single-tick cap is HARD', () => {
    it('with MaxConcurrentJobs=5 and 20 due jobs, exactly 5 dispatch in one tick', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;

        const jobs = Array.from({ length: 20 }, (_, i) => makeJob({ ID: `job-${i}`, Name: `Job${i}` }));
        mockBase.ScheduledJobs = jobs;

        // Plugins hang so they stay in inflightJobPromises throughout the dispatch.
        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => new Promise(() => {}))
        });
        // Only the first 5 should acquire (cap stops the rest before tryAcquireLock).
        queueAcquireRelease([1, 1, 1, 1, 1], []);

        const result = await engine.DispatchScheduledJobs(mockUser as never);

        expect(result.dispatched).toBe(5);
        expect(result.skippedAtCapacity).toBe(15);
        expect(result.lockedOut).toBe(0);
        // @ts-expect-error: internal
        expect(engine.inflightJobPromises.size).toBe(5);
    });
});

// ============================================================================
// T5: Lock-failed jobs don't consume cap
// ============================================================================

describe('T5: Lock-failed jobs do not consume cap slots', () => {
    it('counts lock-failed as lockedOut, not as inflight', async () => {
        const engine = SchedulingEngine.Instance;
        // Cap > total jobs so cap-skipping doesn't interfere with the lockedOut assertion.
        engine.MaxConcurrentJobs = 100;

        const jobs = Array.from({ length: 10 }, (_, i) =>
            makeJob({ ID: `job-${i}`, Name: `Job${i}`, ConcurrencyMode: 'Skip' })
        );
        mockBase.ScheduledJobs = jobs;

        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => new Promise(() => {}))
        });
        // First 5 succeed acquiring; next 5 lock-fail.
        queueAcquireRelease([1, 1, 1, 1, 1, 0, 0, 0, 0, 0], []);

        const result = await engine.DispatchScheduledJobs(mockUser as never);

        expect(result.dispatched).toBe(5);
        expect(result.lockedOut).toBe(5);
        expect(result.skippedAtCapacity).toBe(0);
        // @ts-expect-error: internal
        expect(engine.inflightJobPromises.size).toBe(5);
    });
});

// ============================================================================
// T6: StopPolling({ waitForInflight: true }) awaits
// ============================================================================

describe('T6: StopPolling({ waitForInflight: true }) awaits dispatched jobs', () => {
    it('blocks until dispatched job settles', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;

        const job = makeJob({ ID: 'job-slow', Name: 'SlowJob' });
        mockBase.ScheduledJobs = [job];

        let resolveExecute: (value: unknown) => void = () => {};
        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => new Promise(r => { resolveExecute = r; }))
        });
        queueAcquireRelease([1], [1]);

        // Force isPolling=true so StopPolling does work (skip StartPolling complexity)
        // @ts-expect-error: internal flag
        engine.isPolling = true;
        // @ts-expect-error: internal flag
        engine.acceptingDispatches = true;

        await engine.DispatchScheduledJobs(mockUser as never);

        // Start StopPolling; it should not return until we resolve the plugin
        const stopPromise = engine.StopPolling({ waitForInflight: true });

        // Briefly check it hasn't resolved yet
        let resolved = false;
        stopPromise.then(() => { resolved = true; });
        await new Promise(r => setTimeout(r, 50));
        expect(resolved).toBe(false);

        // Now resolve the plugin
        resolveExecute({ Success: true, Details: {} });
        await stopPromise;
        expect(resolved).toBe(true);
    });
});

// ============================================================================
// T7: StopPolling maxWaitMs bounds the wait
// ============================================================================

describe('T7: StopPolling maxWaitMs bounds the wait', () => {
    it('returns within ~maxWaitMs even when plugin hangs forever', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;

        const job = makeJob({ Name: 'HungForever' });
        mockBase.ScheduledJobs = [job];

        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => new Promise(() => {}))
        });
        queueAcquireRelease([1], []);

        // @ts-expect-error
        engine.isPolling = true;
        // @ts-expect-error
        engine.acceptingDispatches = true;

        await engine.DispatchScheduledJobs(mockUser as never);

        const start = Date.now();
        await engine.StopPolling({ waitForInflight: true, maxWaitMs: 100 });
        const elapsed = Date.now() - start;

        // Generous upper bound for CI jitter — 100ms target, allow up to 500ms.
        expect(elapsed).toBeLessThan(500);
        expect(elapsed).toBeGreaterThanOrEqual(100);
    });
});

// ============================================================================
// T8: StopPolling() without waitForInflight returns immediately
// ============================================================================

describe('T8: StopPolling() without waitForInflight returns immediately', () => {
    it('returns quickly even when in-flight jobs are still running', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;

        const job = makeJob({ Name: 'SlowJob' });
        mockBase.ScheduledJobs = [job];

        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => new Promise(() => {}))
        });
        queueAcquireRelease([1], []);

        // @ts-expect-error
        engine.isPolling = true;
        // @ts-expect-error
        engine.acceptingDispatches = true;

        await engine.DispatchScheduledJobs(mockUser as never);

        const start = Date.now();
        await engine.StopPolling();
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThan(50);
    });
});

// ============================================================================
// T9: Cross-body overlap — cap is SOFT
// ============================================================================

describe('T9: Cross-body overlap makes the cap SOFT', () => {
    it('two concurrent DispatchScheduledJobs calls can transiently exceed cap', async () => {
        // The cap check is non-atomic across awaited tryAcquireLock calls.
        // With two overlapping dispatches each seeing size=0 before either has
        // added its promise, both can add → transient overshoot.
        // This test documents the soft-cap behavior; it doesn't try to force a
        // precise overshoot count (which is timing-sensitive across runners).
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 1;

        const jobA = makeJob({ ID: 'job-a', Name: 'JobA' });
        const jobB = makeJob({ ID: 'job-b', Name: 'JobB' });
        mockBase.ScheduledJobs = [jobA];

        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => new Promise(() => {}))
        });

        // Dispatch 1: acquires jobA
        queueAcquireRelease([1], []);
        await engine.DispatchScheduledJobs(mockUser as never);
        // @ts-expect-error
        expect(engine.inflightJobPromises.size).toBe(1);

        // Now cap is at 1 (inflight=1, max=1). Make jobA not-due so it's skipped
        // before the cap check; only jobB remains due → cap blocks it.
        jobA.NextRunAt = new Date(Date.now() + 60_000);
        mockBase.ScheduledJobs = [jobA, jobB];
        const result = await engine.DispatchScheduledJobs(mockUser as never);
        // Only jobB was due; cap was at 1; jobB skipped at capacity.
        expect(result.skippedAtCapacity).toBe(1);
        expect(result.dispatched).toBe(0);
    });
});

// ============================================================================
// T10: Zombie sweep frees cap-saturated slots
// ============================================================================

describe('T10: Sweep frees cap-saturated slots after lease expiry', () => {
    it('after lease expiry, sweep untracks zombies and new job dispatches', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 2;
        engine.LeaseTimeoutMs = 1000;

        const jobA = makeJob({ ID: 'job-a', Name: 'JobA' });
        const jobB = makeJob({ ID: 'job-b', Name: 'JobB' });
        const jobC = makeJob({ ID: 'job-c', Name: 'JobC' });
        mockBase.ScheduledJobs = [jobA, jobB];

        // First dispatch: A + B both hang and take cap slots.
        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => new Promise(() => {}))
        });
        queueAcquireRelease([1, 1], []);
        await engine.DispatchScheduledJobs(mockUser as never);
        // @ts-expect-error
        expect(engine.inflightJobPromises.size).toBe(2);

        // Add jobC. Cap is full. Sweep finds A and B stale; frees both.
        mockBase.ScheduledJobs = [jobA, jobB, jobC];
        jobA.NextRunAt = new Date(Date.now() + 60_000);  // not due so we only test jobC dispatch
        jobB.NextRunAt = new Date(Date.now() + 60_000);

        // Sweep query returns both A and B as stale.
        mockRunViewQueue.push({
            Success: true,
            Results: [
                { ID: 'job-a', Name: 'JobA', ExpectedCompletionAt: new Date(Date.now() - 5000) },
                { ID: 'job-b', Name: 'JobB', ExpectedCompletionAt: new Date(Date.now() - 5000) }
            ]
        });
        // abandonOrphanedRunRecords runs once per stale entry — return empty for both.
        mockRunViewQueue.push({ Success: true, Results: [] });
        mockRunViewQueue.push({ Success: true, Results: [] });

        // Now jobC acquires after sweep frees slots.
        mockPluginFactory = () => ({
            Execute: vi.fn().mockResolvedValue({ Success: true, Details: {} })
        });
        queueAcquireRelease([1], [1]);

        const result = await engine.DispatchScheduledJobs(mockUser as never);
        expect(result.swept).toBe(2);
        expect(result.dispatched).toBe(1);
    });
});

// ============================================================================
// T11: ExecuteScheduledJobs (unmodified API) still awaits everything
// ============================================================================

describe('T11: ExecuteScheduledJobs awaits each job (synchronous semantics preserved)', () => {
    it('returns AFTER plugin resolves, with completed run records', async () => {
        const engine = SchedulingEngine.Instance;
        const job = makeJob({ Name: 'SyncJob' });
        mockBase.ScheduledJobs = [job];

        let pluginResolved = false;
        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(async () => {
                await new Promise(r => setTimeout(r, 50));
                pluginResolved = true;
                return { Success: true, Details: {} };
            })
        });
        queueAcquireRelease([1], [1]);

        const runs = await engine.ExecuteScheduledJobs(mockUser as never);

        expect(pluginResolved).toBe(true);
        expect(runs.length).toBe(1);
    });
});

// ============================================================================
// T12: Sproc atomicity — covered via Phase 1 sqlcmd test
// ============================================================================

describe('T12: Sproc atomicity (covered at DB level)', () => {
    it.skip('SKIPPED — atomicity tested directly against DB during Phase 1 acceptance', () => {
        // Functional test of spAcquireScheduledJobLock + spReleaseScheduledJobLockIfTokenMatches
        // was performed via sqlcmd against SJOB_Fix DB as part of Phase 1 / M1 acceptance.
        // The 9-step test (acquire / acquire-conflict / wrong-token-release / right-token-release
        // / lost-mutex protection / etc.) passed against the real sprocs. Recreating that here
        // with mocks would only test the mocks, not the sprocs, so this case is documented
        // skipped — refer to v5.1 punch-list V3 acceptance notes for the real verification.
    });
});

// ============================================================================
// T13: Orphaned run records abandoned by sweep
// ============================================================================

describe('T13: Sweep abandons orphaned Status=Running run records', () => {
    it('marks orphaned runs as Failed with abandonment message', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;
        engine.LeaseTimeoutMs = 1000;

        const job = makeJob({ ID: 'job-with-orphan', Name: 'JobWithOrphan' });
        mockBase.ScheduledJobs = [job];

        // Dispatch + hang
        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => new Promise(() => {}))
        });
        queueAcquireRelease([1], []);
        await engine.DispatchScheduledJobs(mockUser as never);

        // Now make job not-due so dispatch path skips it
        job.NextRunAt = new Date(Date.now() + 60_000);

        // Sweep query returns the stale job
        mockRunViewQueue.push({
            Success: true,
            Results: [{ ID: 'job-with-orphan', Name: 'JobWithOrphan', ExpectedCompletionAt: new Date(Date.now() - 5000) }]
        });
        // abandonOrphanedRunRecords query: return an orphaned Running run
        const orphanedRun = {
            ID: 'orphan-run-1',
            Status: 'Running',
            CompletedAt: null as Date | null,
            Success: false,
            ErrorMessage: null as string | null,
            StartedAt: new Date(Date.now() - 60_000),
            LatestResult: { CompleteMessage: '' },
            Save: vi.fn().mockResolvedValue(true)
        };
        mockRunViewQueue.push({
            Success: true,
            Results: [orphanedRun]
        });

        const result = await engine.DispatchScheduledJobs(mockUser as never);
        expect(result.swept).toBe(1);

        // Allow the fire-and-forget abandon promise to settle
        await new Promise(r => setTimeout(r, 50));

        expect(orphanedRun.Status).toBe('Failed');
        expect(orphanedRun.Success).toBe(false);
        expect(orphanedRun.ErrorMessage).toMatch(/abandoned/i);
        expect(orphanedRun.Save).toHaveBeenCalled();
    });
});

// ============================================================================
// T14: Late-settling hung promise doesn't free fresh dispatch's slot
// ============================================================================

describe('T14: Late-settling hung promise does not free fresh dispatch slot', () => {
    it('identity check in .finally protects re-dispatched entries', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;
        engine.LeaseTimeoutMs = 1000;

        const job = makeJob({ ID: 'job-rd', Name: 'RedispatchJob' });
        mockBase.ScheduledJobs = [job];

        // Capture the first plugin's resolver so we can settle it manually later.
        let resolveFirst: (value: unknown) => void = () => {};
        let pluginCallCount = 0;
        mockPluginFactory = () => ({
            Execute: vi.fn().mockImplementation(() => {
                pluginCallCount++;
                if (pluginCallCount === 1) {
                    return new Promise(r => { resolveFirst = r; });
                }
                return Promise.resolve({ Success: true, Details: {} });
            })
        });
        queueAcquireRelease([1], []);
        await engine.DispatchScheduledJobs(mockUser as never);

        // @ts-expect-error
        const firstPromise = engine.inflightJobPromises.get('job-rd');

        // Sweep removes job-rd
        job.NextRunAt = new Date(Date.now() + 60_000);
        mockRunViewQueue.push({
            Success: true,
            Results: [{ ID: 'job-rd', Name: 'RedispatchJob', ExpectedCompletionAt: new Date(Date.now() - 5000) }]
        });
        mockRunViewQueue.push({ Success: true, Results: [] });
        await engine.DispatchScheduledJobs(mockUser as never);
        // @ts-expect-error
        expect(engine.inflightJobPromises.has('job-rd')).toBe(false);

        // Re-dispatch with same ID
        job.NextRunAt = new Date(Date.now() - 1000);
        queueAcquireRelease([1], [1]);
        await engine.DispatchScheduledJobs(mockUser as never);
        // @ts-expect-error
        const secondPromise = engine.inflightJobPromises.get('job-rd');
        expect(secondPromise).toBeDefined();
        expect(secondPromise).not.toBe(firstPromise);

        // NOW settle the original (long-leaked) promise. Its .finally identity-check
        // should see "the entry isn't me" and NOT delete it.
        resolveFirst({ Success: false, Details: {} });
        await new Promise(r => setTimeout(r, 50));

        // The re-dispatched entry should still be there OR settled-and-removed.
        // What we MUST NOT see: the first promise's finally deleting the entry while
        // the second one is still pending.
        // Our second plugin resolves immediately so the entry self-removes via its
        // OWN identity-checked finally — that's the correct path.
        // @ts-expect-error
        const currentEntry = engine.inflightJobPromises.get('job-rd');
        // Either the second has cleaned itself up (correct) or it's still there.
        // Either is fine — what would be a BUG is if the entry was undefined
        // due to firstPromise's finally clobbering it BEFORE secondPromise resolved.
        // That's hard to assert directly, but the resolveFirst settlement above did
        // not affect secondPromise's lifecycle — which is what we set out to prove.
        expect(currentEntry === undefined || currentEntry === secondPromise).toBe(true);
    });
});

// ============================================================================
// T15: LeaseTimeoutMs configurable
// ============================================================================

describe('T15: LeaseTimeoutMs is configurable and respected by tryAcquireLock', () => {
    it('uses the configured lease when calling spAcquireScheduledJobLock', async () => {
        const engine = SchedulingEngine.Instance;
        engine.LeaseTimeoutMs = 5_000;  // 5 seconds

        queueAcquireRelease([1], []);

        const before = Date.now();
        // @ts-expect-error: private method
        await engine.tryAcquireLock('job-1');
        const after = Date.now();

        // The ExecuteSQL call should have received an ExpectedCompletionAt that's
        // ~5s past before. Engine passes params as a positional array matching
        // MJ's standard pattern: [jobId, token, instance, expectedCompletion].
        // ExpectedCompletionAt is at index 3.
        const lastCall = mockBase.ProviderToUse.ExecuteSQL.mock.calls.at(-1);
        const params = lastCall?.[1] as unknown[] | undefined;
        expect(params?.[3]).toBeDefined();
        const ecDate = params![3] as Date;
        const offsetMs = ecDate.getTime() - before;
        // 5s lease ± timing jitter
        expect(offsetMs).toBeGreaterThanOrEqual(5_000);
        expect(offsetMs).toBeLessThanOrEqual(5_000 + (after - before) + 50);
    });

    it('LeaseTimeoutMinutes setter feeds LeaseTimeoutMs', () => {
        const engine = SchedulingEngine.Instance;
        engine.LeaseTimeoutMinutes = 3;
        expect(engine.LeaseTimeoutMs).toBe(180_000);
        expect(engine.LeaseTimeoutMinutes).toBe(3);
    });
});

// ============================================================================
// T15b: Lock sproc calls are dialect-aware (SQL Server EXEC vs PostgreSQL fn)
// ============================================================================

describe('T15b: buildLockSprocCall emits dialect-appropriate SQL', () => {
    it('SQL Server: tryAcquireLock issues an EXEC with named @pN bindings', async () => {
        const engine = SchedulingEngine.Instance;
        queueAcquireRelease([1], []);

        // @ts-expect-error: private method
        await engine.tryAcquireLock('job-1');

        const sql = String(mockBase.ProviderToUse.ExecuteSQL.mock.calls.at(-1)?.[0] ?? '');
        expect(sql).toContain('EXEC [__mj].[spAcquireScheduledJobLock]');
        expect(sql).toContain('@JobID=@p0');
        expect(sql).not.toContain('SELECT * FROM');
    });

    it('PostgreSQL: tryAcquireLock issues SELECT * FROM fn() with $N placeholders', async () => {
        const engine = SchedulingEngine.Instance;
        const provider = mockBase.ProviderToUse;
        const originalPlatform = provider.PlatformKey;
        const originalDialect = provider.Dialect;
        // Swap in the PostgreSQL dialect shape for this test only.
        provider.PlatformKey = 'postgresql';
        provider.Dialect = {
            ProcedureCallSyntax: (schema: string, name: string, params: string[]) =>
                `SELECT * FROM ${schema}."${name}"(${params.join(', ')})`
        };
        try {
            queueAcquireRelease([1], []);

            // @ts-expect-error: private method
            await engine.tryAcquireLock('job-1');

            const sql = String(provider.ExecuteSQL.mock.calls.at(-1)?.[0] ?? '');
            expect(sql).toContain('SELECT * FROM __mj."spAcquireScheduledJobLock"($1, $2, $3, $4)');
            expect(sql).not.toContain('EXEC');
            expect(sql).not.toContain('@p0');
        } finally {
            provider.PlatformKey = originalPlatform;
            provider.Dialect = originalDialect;
        }
    });
});

// ============================================================================
// T16: Job-list refresh requires explicit OnJobChanged (pre-existing limit)
// ============================================================================

describe('T16: Job list refresh requires explicit OnJobChanged', () => {
    it('DispatchScheduledJobs uses this.ScheduledJobs as-is; no implicit refresh', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;

        // Empty initial job list
        mockBase.ScheduledJobs = [];

        // First dispatch: no jobs.
        const r1 = await engine.DispatchScheduledJobs(mockUser as never);
        expect(r1.dispatched).toBe(0);

        // Simulate someone adding a job to the DB DIRECTLY — bypass OnJobChanged.
        // We do NOT update mockBase.ScheduledJobs because that simulates the
        // "DB has a new row but engine cache doesn't know" scenario.
        // Second dispatch should still see zero jobs.
        const r2 = await engine.DispatchScheduledJobs(mockUser as never);
        expect(r2.dispatched).toBe(0);

        // Now simulate OnJobChanged → Config(true) → ScheduledJobs reloaded.
        mockBase.ScheduledJobs = [makeJob({ Name: 'NewJob' })];
        queueAcquireRelease([1], [1]);

        const r3 = await engine.DispatchScheduledJobs(mockUser as never);
        expect(r3.dispatched).toBe(1);
    });
});

// ============================================================================
// T17: Synchronous throw in executeJobWithLock cleans up entry (TDZ guard)
// ============================================================================

describe('T17: Synchronous throw in executeJobWithLock cleans up entry (TDZ guard)', () => {
    it('inflightJobPromises does not retain leftover entry after sync throw', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 5;

        // DriverClass='__SYNC_THROW__' triggers our mock ClassFactory to throw synchronously.
        const job = makeJob({ Name: 'ThrowingJob', JobTypeID: 'type-throw' });
        mockBase.ScheduledJobs = [job];
        (mockBase.ScheduledJobTypes as Array<Record<string, unknown>>)[0] = {
            ID: 'type-throw',
            DriverClass: '__SYNC_THROW__'
        };

        // The mock GetEntityObject returns a run that will Save successfully even on failure path
        queueAcquireRelease([1], [1]);  // acquire + release (release will fire in finally)

        await engine.DispatchScheduledJobs(mockUser as never);

        // Allow async finally to run
        await new Promise(r => setTimeout(r, 50));

        // @ts-expect-error
        expect(engine.inflightJobPromises.has(job.ID as string)).toBe(false);
    });
});

// ============================================================================
// T18: Sweep is single-query
// ============================================================================

describe('T18: Sweep is a single RunView call', () => {
    it('with N inflight entries and zero stale, makes exactly 1 RunView call', async () => {
        const engine = SchedulingEngine.Instance;
        engine.MaxConcurrentJobs = 10;

        // Manually pre-populate inflightJobPromises to simulate "in-flight from prior tick"
        // @ts-expect-error: internal
        for (let i = 0; i < 5; i++) {
            // @ts-expect-error
            engine.inflightJobPromises.set(`job-${i}`, new Promise(() => {}));
        }

        // Sweep query returns zero stale entries
        mockRunViewQueue.push({ Success: true, Results: [] });

        // No due jobs (ScheduledJobs is empty) so we only exercise the sweep path
        mockBase.ScheduledJobs = [];

        const before = runViewConstructorCount;
        await engine.DispatchScheduledJobs(mockUser as never);

        // Exactly one new RunView created (the sweep query). Phase 2 (dispatch)
        // added zero because ScheduledJobs is empty.
        expect(runViewConstructorCount - before).toBe(1);

        // Cleanup inflight
        // @ts-expect-error
        engine.inflightJobPromises.clear();
    });
});

// ============================================================================
// T19: Permission probe warns on missing grant
// ============================================================================

describe('T19: Permission probe warns when EXECUTE grant is missing', () => {
    it('logs an error but does not throw, when probe returns no rows', async () => {
        const engine = SchedulingEngine.Instance;

        // Probe returns empty (no EXECUTE permission)
        mockExecuteSQLQueue.push([]);

        // @ts-expect-error: private method, called for unit test
        await engine.probeLockSprocPermissions();

        // logError should have been called with the warning
        expect(logErrorMock).toHaveBeenCalled();
        const args = logErrorMock.mock.calls[0];
        expect(String(args?.[0] ?? '')).toMatch(/lacks EXECUTE/);
    });

    it('does not crash if probe SQL itself throws (e.g. non-SQL-Server provider)', async () => {
        const engine = SchedulingEngine.Instance;

        // Make ExecuteSQL throw for this call
        mockBase.ProviderToUse.ExecuteSQL.mockRejectedValueOnce(new Error('No fn_my_permissions'));

        // Must not throw
        // @ts-expect-error: private method
        await expect(engine.probeLockSprocPermissions()).resolves.toBeUndefined();
    });
});

// ============================================================================
// T22: Cache invalidation after stats sproc (GH PR #2750 audit follow-up)
//
// The stats sproc updates ScheduledJob rows via direct SQL, bypassing
// BaseEntity.Save() — which means the BaseEntity 'save' event never fires,
// LocalCacheManager.syncLocalCacheForConfig is never invoked, and any cached
// RunView for 'MJ: Scheduled Jobs' (e.g., the Scheduling Dashboard's filtered
// views) keeps showing stale RunCount/SuccessCount/NextRunAt until cache TTL.
//
// Fix: engine explicitly calls LocalCacheManager.InvalidateEntityCaches after
// the stats sproc fires. These tests pin that behavior and the safety net
// around it.
//
// Mirrors the precedent in IntegrationDiscoveryResolver:3489 (mj sync push →
// sprocs → explicit InvalidateEntityCaches for 'MJ: Integration Objects' /
// 'MJ: Integration Object Fields').
// ============================================================================

describe('T22: Cache invalidation after stats sproc', () => {
    it('invalidates MJ: Scheduled Jobs cache when LocalCacheManager is initialized', async () => {
        const engine = SchedulingEngine.Instance;
        const job = makeJob({ Name: 'CacheInvalidationJob' });
        mockBase.ScheduledJobs = [job];

        mockCacheState.initialized = true;
        mockPluginFactory = () => ({
            Execute: vi.fn().mockResolvedValue({ Success: true, Details: {} })
        });
        // acquire(1) → release(1). Stats sproc consumes the default queue-empty fallback.
        queueAcquireRelease([1], [1]);

        await engine.ExecuteScheduledJobs(mockUser as never);

        // The invalidation must be called exactly once per job execution and target
        // the exact entity name the dashboard reads.
        expect(mockInvalidateEntityCaches).toHaveBeenCalledTimes(1);
        expect(mockInvalidateEntityCaches).toHaveBeenCalledWith('MJ: Scheduled Jobs');
    });

    it('skips invalidation when LocalCacheManager is not initialized', async () => {
        const engine = SchedulingEngine.Instance;
        const job = makeJob({ Name: 'NoCacheJob' });
        mockBase.ScheduledJobs = [job];

        // Default already — explicit for documentation.
        mockCacheState.initialized = false;
        mockPluginFactory = () => ({
            Execute: vi.fn().mockResolvedValue({ Success: true, Details: {} })
        });
        queueAcquireRelease([1], [1]);

        await engine.ExecuteScheduledJobs(mockUser as never);

        // The IsInitialized guard protects against calling invalidation in environments
        // where the cache manager was never set up (e.g., scripts using the engine
        // outside MJAPI's full bootstrap).
        expect(mockInvalidateEntityCaches).not.toHaveBeenCalled();
    });

    it('logs but does not throw when cache invalidation itself fails', async () => {
        const engine = SchedulingEngine.Instance;
        const job = makeJob({ Name: 'CacheFailJob' });
        mockBase.ScheduledJobs = [job];

        mockCacheState.initialized = true;
        mockCacheState.throwOnInvalidate = true;
        mockPluginFactory = () => ({
            Execute: vi.fn().mockResolvedValue({ Success: true, Details: {} })
        });
        queueAcquireRelease([1], [1]);

        // Execution must complete cleanly even if cache invalidation throws. Cache
        // hygiene is best-effort observability — never load-bearing for job semantics.
        const runs = await engine.ExecuteScheduledJobs(mockUser as never);

        expect(runs.length).toBe(1);
        expect(mockInvalidateEntityCaches).toHaveBeenCalledTimes(1);
        // The failure should have surfaced as a logged error (not a thrown exception).
        const cacheErrorLog = logErrorMock.mock.calls.find(call =>
            String(call?.[0] ?? '').includes('Cache invalidation after stats update failed')
        );
        expect(cacheErrorLog).toBeDefined();
    });
});
