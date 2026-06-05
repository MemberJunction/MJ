/**
 * Tests for the v5.39 ScheduledJobEngine heartbeat-based lease renewal (GH #2749).
 *
 * Builds on the same mock surface as ScheduledJobEngine.decoupling.test.ts —
 * the mock ExecuteSQL queue accepts arbitrary result rows, so heartbeat sproc
 * responses are pushed as `{ Extended: n }` entries.
 *
 * Coverage:
 *   H1 Heartbeat extends the lease — calls spExtendScheduledJobLease with the
 *      live token and a (now + HEARTBEAT_LEASE_MS) expectation.
 *   H2 Throttling — many rapid calls produce at most one sproc call per interval.
 *   H3 No-op in Concurrent mode (no lockToken → no sproc call, never throws).
 *   H4 extendLeaseIfTokenMatches returns false on Extended=0.
 *   H5 Heartbeat never throws into plugin code, even when the sproc throws.
 *   H6 Heartbeat logs (does not throw) when the lease was reclaimed (Extended=0).
 *   H7 MaxRuntimeMinutes bumps the acquire-time ExpectedCompletionAt.
 *   H8 MaxRuntimeMinutes never shrinks the lease below the default.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (mirror ScheduledJobEngine.decoupling.test.ts)
// ---------------------------------------------------------------------------

vi.mock('os', () => ({
    default: { hostname: () => 'test-host' },
    hostname: () => 'test-host'
}));

const logErrorMock = vi.fn();
const logStatusMock = vi.fn();

vi.mock('@memberjunction/core', () => {
    return {
        UserInfo: class UserInfo { ID = 'user-1' },
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
        RunView: class MockRunView {
            async RunView(): Promise<unknown> {
                const next = mockRunViewQueue.shift();
                if (!next) {
                    return { Success: true, Results: [] };
                }
                return next;
            }
        },
        LocalCacheManager: {
            Instance: {
                get IsInitialized() { return false; },
                InvalidateEntityCaches: async () => {}
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
        MaxRuntimeMinutes: number | null = null;
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

const singletonStore: Record<string, unknown> = {};
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
        ProviderToUse: {
            MJCoreSchemaName: '__mj',
            ExecuteSQL: vi.fn().mockImplementation(async () => {
                const next = mockExecuteSQLQueue.shift();
                if (next === undefined) {
                    return [{ permission_name: 'EXECUTE' }];
                }
                return next;
            })
        },
        RunViewProviderToUse: {}
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
// Per-test queues
// ---------------------------------------------------------------------------

const mockExecuteSQLQueue: Array<Array<Record<string, unknown>>> = [];
const mockRunViewQueue: Array<{ Success: boolean; Results: unknown[] }> = [];

import { SchedulingEngine } from '../ScheduledJobEngine';
import type { ScheduledJobExecutionContext } from '../BaseScheduledJob';
import { SchedulingEngineBase } from '@memberjunction/scheduling-engine-base';

const mockUser = { ID: 'user-1' };
const mockBase = SchedulingEngineBase.Instance as Record<string, unknown> & {
    ScheduledJobs: Array<Record<string, unknown>>;
    ProviderToUse: { ExecuteSQL: ReturnType<typeof vi.fn>; MJCoreSchemaName: string };
};

function makeJob(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        ID: 'job-' + Math.random().toString(36).slice(2),
        Name: 'TestJob',
        Status: 'Active',
        JobTypeID: 'type-1',
        ConcurrencyMode: 'Skip',
        NextRunAt: new Date(Date.now() - 1000),
        StartAt: null,
        EndAt: null,
        CronExpression: '*/1 * * * *',
        Timezone: 'UTC',
        MaxRuntimeMinutes: null,
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

/**
 * Run a job to completion with a plugin that captures the context.heartbeat
 * closure handed to it, then returns the captured closure for direct exercise.
 */
async function captureHeartbeat(job: Record<string, unknown>): Promise<() => Promise<void>> {
    const engine = SchedulingEngine.Instance;
    mockBase.ScheduledJobs = [job];

    let captured: (() => Promise<void>) | undefined;
    createInstanceImpl = () => ({
        Execute: async (context: ScheduledJobExecutionContext) => {
            captured = context.heartbeat;
            return { Success: true, Details: {} };
        }
    });
    // acquire(1) → release(1). Stats sproc + anything else falls back to default.
    mockExecuteSQLQueue.push([{ Acquired: 1 }]);
    mockExecuteSQLQueue.push([{ Released: 1 }]);

    await engine.ExecuteScheduledJobs(mockUser as never);
    if (!captured) {
        throw new Error('Plugin did not receive a heartbeat closure');
    }
    return captured;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteSQLQueue.length = 0;
    mockRunViewQueue.length = 0;
    mockBase.ScheduledJobs = [];
    (mockBase.ScheduledJobTypes as Array<Record<string, unknown>>).length = 0;
    (mockBase.ScheduledJobTypes as Array<Record<string, unknown>>).push({ ID: 'type-1', DriverClass: 'TestDriver' });
    logErrorMock.mockClear();
    logStatusMock.mockClear();

    mockBase.ProviderToUse.ExecuteSQL.mockImplementation(async () => {
        const next = mockExecuteSQLQueue.shift();
        if (next === undefined) {
            return [{ permission_name: 'EXECUTE' }];
        }
        return next;
    });

    createInstanceImpl = () => ({
        Execute: vi.fn().mockResolvedValue({ Success: true, Details: {} })
    });

    const engine = SchedulingEngine.Instance;
    // @ts-expect-error: resetting internal state for test isolation
    engine.inflightJobPromises.clear();
    // @ts-expect-error
    engine.acceptingDispatches = true;
    // @ts-expect-error
    engine.isPolling = false;
    engine.MaxConcurrentJobs = 5;
    engine.LeaseTimeoutMs = 10 * 60 * 1000;
});

afterEach(() => {
    vi.useRealTimers();
});

/** Find the most recent ExecuteSQL call whose SQL text mentions a sproc. */
function lastSprocCall(name: string): unknown[] | undefined {
    const calls = mockBase.ProviderToUse.ExecuteSQL.mock.calls;
    for (let i = calls.length - 1; i >= 0; i--) {
        if (String(calls[i]?.[0] ?? '').includes(name)) {
            return calls[i] as unknown[];
        }
    }
    return undefined;
}

// ============================================================================
// H1: Heartbeat extends the lease
// ============================================================================

describe('H1: heartbeat extends the lease via spExtendScheduledJobLease', () => {
    it('calls the extend sproc with the live token and a now+HEARTBEAT_LEASE_MS expectation', async () => {
        const engine = SchedulingEngine.Instance;
        // Make the throttle window 0 so the first call is an effective beat.
        // @ts-expect-error: override the static for test
        SchedulingEngine.HEARTBEAT_INTERVAL_MS = 0;

        const job = makeJob();
        const heartbeat = await captureHeartbeat(job);

        // Queue the extend sproc response and exercise the closure.
        mockExecuteSQLQueue.push([{ Extended: 1 }]);
        const before = Date.now();
        await heartbeat();
        const after = Date.now();

        const call = lastSprocCall('spExtendScheduledJobLease');
        expect(call).toBeDefined();
        const params = call?.[1] as unknown[];
        // [jobId, token, newExpectedCompletionAt]
        expect(params[0]).toBe(job.ID);
        expect(typeof params[1]).toBe('string'); // the acquire token
        const expected = params[2] as Date;
        const offset = expected.getTime() - before;
        const SIX_MIN = 6 * 60 * 1000;
        expect(offset).toBeGreaterThanOrEqual(SIX_MIN);
        expect(offset).toBeLessThanOrEqual(SIX_MIN + (after - before) + 50);

        // restore
        // @ts-expect-error
        SchedulingEngine.HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
    });
});

// ============================================================================
// H2: Throttling
// ============================================================================

describe('H2: heartbeat self-throttles to one effective beat per interval', () => {
    it('many rapid calls produce at most one extend-sproc call within a window', async () => {
        // Default interval (5 min) — rapid synchronous calls are all within it.
        const job = makeJob();
        const heartbeat = await captureHeartbeat(job);

        // Provide one extend response in case a beat fires; subsequent throttled
        // calls won't consume the queue.
        mockExecuteSQLQueue.push([{ Extended: 1 }]);

        for (let i = 0; i < 50; i++) {
            await heartbeat();
        }

        const extendCalls = mockBase.ProviderToUse.ExecuteSQL.mock.calls.filter(c =>
            String(c?.[0] ?? '').includes('spExtendScheduledJobLease')
        );
        // First call is throttled because lastHeartbeatMs is seeded to "now" at
        // closure creation; within the 5-min window NONE of the 50 calls beats.
        expect(extendCalls.length).toBe(0);
    });
});

// ============================================================================
// H3: No-op in Concurrent mode
// ============================================================================

describe('H3: heartbeat is a no-op in Concurrent mode', () => {
    it('never calls the extend sproc and never throws when there is no lock', async () => {
        const engine = SchedulingEngine.Instance;
        const job = makeJob({ ConcurrencyMode: 'Concurrent' });
        mockBase.ScheduledJobs = [job];

        let captured: (() => Promise<void>) | undefined;
        createInstanceImpl = () => ({
            Execute: async (context: ScheduledJobExecutionContext) => {
                captured = context.heartbeat;
                return { Success: true, Details: {} };
            }
        });
        // Concurrent mode: tryAcquireLock still runs (acquire fails → concurrent
        // path). Queue an acquire=0 so it takes the no-lock branch.
        mockExecuteSQLQueue.push([{ Acquired: 0 }]);

        await engine.ExecuteScheduledJobs(mockUser as never);
        expect(captured).toBeDefined();

        const callsBefore = mockBase.ProviderToUse.ExecuteSQL.mock.calls.length;
        await expect(captured!()).resolves.toBeUndefined();
        const extendCalls = mockBase.ProviderToUse.ExecuteSQL.mock.calls
            .slice(callsBefore)
            .filter(c => String(c?.[0] ?? '').includes('spExtendScheduledJobLease'));
        expect(extendCalls.length).toBe(0);
    });
});

// ============================================================================
// H4: extendLeaseIfTokenMatches returns false on Extended=0
// ============================================================================

describe('H4: extendLeaseIfTokenMatches returns false on token mismatch', () => {
    it('returns false when the sproc reports Extended=0', async () => {
        const engine = SchedulingEngine.Instance;
        mockExecuteSQLQueue.push([{ Extended: 0 }]);

        // @ts-expect-error: private method exercised directly
        const extended = await engine.extendLeaseIfTokenMatches(
            'job-x', '11111111-1111-1111-1111-111111111111', new Date()
        );
        expect(extended).toBe(false);
    });

    it('returns true when the sproc reports Extended=1', async () => {
        const engine = SchedulingEngine.Instance;
        mockExecuteSQLQueue.push([{ Extended: 1 }]);

        // @ts-expect-error: private method exercised directly
        const extended = await engine.extendLeaseIfTokenMatches(
            'job-x', '11111111-1111-1111-1111-111111111111', new Date()
        );
        expect(extended).toBe(true);
    });
});

// ============================================================================
// H5: Heartbeat never throws even when the sproc throws
// ============================================================================

describe('H5: heartbeat swallows + logs errors, never throws into plugin code', () => {
    it('resolves cleanly when the extend sproc rejects', async () => {
        // @ts-expect-error
        SchedulingEngine.HEARTBEAT_INTERVAL_MS = 0;
        const job = makeJob();
        const heartbeat = await captureHeartbeat(job);

        mockBase.ProviderToUse.ExecuteSQL.mockRejectedValueOnce(new Error('DB exploded'));

        await expect(heartbeat()).resolves.toBeUndefined();
        const errLog = logErrorMock.mock.calls.find(c =>
            String(c?.[0] ?? '').includes('Lease renewal failed')
        );
        expect(errLog).toBeDefined();

        // @ts-expect-error
        SchedulingEngine.HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
    });
});

// ============================================================================
// H6: Heartbeat logs (does not throw) when the lease was reclaimed
// ============================================================================

describe('H6: heartbeat logs a handoff when the lease was reclaimed', () => {
    it('logs (does not throw) when extend returns Extended=0', async () => {
        // @ts-expect-error
        SchedulingEngine.HEARTBEAT_INTERVAL_MS = 0;
        const job = makeJob();
        const heartbeat = await captureHeartbeat(job);

        mockExecuteSQLQueue.push([{ Extended: 0 }]);
        await expect(heartbeat()).resolves.toBeUndefined();

        const handoffLog = logStatusMock.mock.calls.find(c =>
            String(c?.[0] ?? '').includes('slot has been handed off')
        );
        expect(handoffLog).toBeDefined();

        // @ts-expect-error
        SchedulingEngine.HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
    });
});

// ============================================================================
// H7 / H8: MaxRuntimeMinutes bumps (and never shrinks) the acquire-time lease
// ============================================================================

describe('H7/H8: MaxRuntimeMinutes adjusts the acquire-time lease', () => {
    it('bumps ExpectedCompletionAt when the override exceeds the default lease', async () => {
        const engine = SchedulingEngine.Instance;
        engine.LeaseTimeoutMs = 10 * 60 * 1000; // 10 min default
        mockExecuteSQLQueue.push([{ Acquired: 1 }]);

        const before = Date.now();
        // @ts-expect-error: private method
        await engine.tryAcquireLock('job-1', 30); // 30 min override
        const after = Date.now();

        const call = lastSprocCall('spAcquireScheduledJobLock');
        const params = call?.[1] as unknown[];
        const expected = params[3] as Date; // ExpectedCompletionAt
        const offset = expected.getTime() - before;
        const THIRTY_MIN = 30 * 60 * 1000;
        expect(offset).toBeGreaterThanOrEqual(THIRTY_MIN);
        expect(offset).toBeLessThanOrEqual(THIRTY_MIN + (after - before) + 50);
    });

    it('never shrinks below the default lease when override is smaller', async () => {
        const engine = SchedulingEngine.Instance;
        engine.LeaseTimeoutMs = 10 * 60 * 1000; // 10 min default
        mockExecuteSQLQueue.push([{ Acquired: 1 }]);

        const before = Date.now();
        // @ts-expect-error: private method
        await engine.tryAcquireLock('job-1', 2); // 2 min override < default
        const after = Date.now();

        const call = lastSprocCall('spAcquireScheduledJobLock');
        const params = call?.[1] as unknown[];
        const expected = params[3] as Date;
        const offset = expected.getTime() - before;
        const TEN_MIN = 10 * 60 * 1000;
        // Falls back to the 10-min default, NOT the 2-min override.
        expect(offset).toBeGreaterThanOrEqual(TEN_MIN);
        expect(offset).toBeLessThanOrEqual(TEN_MIN + (after - before) + 50);
    });

    it('uses the default lease when MaxRuntimeMinutes is null', async () => {
        const engine = SchedulingEngine.Instance;
        engine.LeaseTimeoutMs = 10 * 60 * 1000;
        mockExecuteSQLQueue.push([{ Acquired: 1 }]);

        const before = Date.now();
        // @ts-expect-error: private method
        await engine.tryAcquireLock('job-1', null);
        const after = Date.now();

        const call = lastSprocCall('spAcquireScheduledJobLock');
        const params = call?.[1] as unknown[];
        const offset = (params[3] as Date).getTime() - before;
        const TEN_MIN = 10 * 60 * 1000;
        expect(offset).toBeGreaterThanOrEqual(TEN_MIN);
        expect(offset).toBeLessThanOrEqual(TEN_MIN + (after - before) + 50);
    });
});
