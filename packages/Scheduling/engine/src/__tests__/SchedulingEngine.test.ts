import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies
vi.mock('os', () => ({
    default: { hostname: () => 'test-host' },
    hostname: () => 'test-host'
}));

vi.mock('@memberjunction/core', () => ({
    UserInfo: class UserInfo { ID = 'user-1' },
    Metadata: vi.fn().mockImplementation(() => ({
        GetEntityObject: vi.fn().mockResolvedValue({
            ScheduledJobID: '',
            ExecutedByUserID: '',
            Status: '',
            StartedAt: null,
            QueuedAt: null,
            Save: vi.fn().mockResolvedValue(true),
            ID: 'run-123'
        })
    })),
    LogError: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
    // Added in v5.39 for decoupling fix — the engine imports these even on
    // code paths these existing tests don't exercise. Minimal class stubs
    // so module-load doesn't fail.
    IMetadataProvider: class {},
    RunView: class {
        async RunView(): Promise<{ Success: boolean; Results: unknown[] }> {
            return { Success: true, Results: [] };
        }
    }
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJScheduledJobEntity: class {
        ID = '';
        Name = '';
        Status = '';
        CronExpression = '';
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
        JobTypeID = '';
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
        ID = 'run-123';
        ScheduledJobID = '';
        ExecutedByUserID = '';
        Status = '';
        StartedAt: Date | null = null;
        CompletedAt: Date | null = null;
        QueuedAt: Date | null = null;
        Success = false;
        ErrorMessage: string | null = null;
        Details: string | null = null;
        Save = vi.fn().mockResolvedValue(true);
    }
}));

// Shared singleton store
const singletonStore: Record<string, unknown> = {};

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
                    CreateInstance: vi.fn()
                }
            }
        },
        UUIDsEqual: (a: string, b: string) => a === b
    };
});

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationChannel: {}
}));

vi.mock('@memberjunction/scheduling-engine-base', () => {
    const fakeBase = {
        ScheduledJobs: [] as Array<Record<string, unknown>>,
        ScheduledJobTypes: [] as Array<Record<string, unknown>>,
        ScheduledJobRuns: [] as Array<Record<string, unknown>>,
        ActivePollingInterval: 60000 as number | null,
        Config: vi.fn().mockResolvedValue(true),
        UpdatePollingInterval: vi.fn(),
        GetJobTypeByName: vi.fn(),
        GetJobTypeByDriverClass: vi.fn(),
        GetJobsByType: vi.fn().mockReturnValue([]),
        GetRunsForJob: vi.fn().mockReturnValue([]),
        // Added in v5.39 for the decoupling fix. Provider doubles as both an
        // IMetadataProvider and a DatabaseProviderBase via the engine's cast.
        // Default ExecuteSQL returns the permission-probe "OK" shape so the
        // probe call in StartPolling doesn't warn.
        ContextUser: { ID: 'user-1' },
        ProviderToUse: {
            MJCoreSchemaName: '__mj',
            ExecuteSQL: vi.fn().mockResolvedValue([{ permission_name: 'EXECUTE' }])
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
        GetNextRunTime: vi.fn().mockReturnValue(new Date('2025-06-01T00:00:00Z')),
        IsExpressionDue: vi.fn().mockReturnValue(false)
    }
}));

vi.mock('../NotificationManager', () => ({
    NotificationManager: {
        SendScheduledJobNotification: vi.fn().mockResolvedValue(undefined)
    }
}));

import { SchedulingEngine } from '../ScheduledJobEngine';
import { SchedulingEngineBase } from '@memberjunction/scheduling-engine-base';
import { CronExpressionHelper } from '../CronExpressionHelper';

describe('SchedulingEngine', () => {
    let engine: SchedulingEngine;
    // Access the mock base for setting up test state
    const mockBase = SchedulingEngineBase.Instance as Record<string, unknown>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        // `vi.clearAllMocks()` wipes the mock return values declared at
        // `vi.mock()` registration time, so re-install the CronExpressionHelper
        // stubs here. Without this, GetNextRunTime returns undefined and the
        // initializeNextRunTimes branch tests can't observe the cron-tick path.
        (CronExpressionHelper.GetNextRunTime as ReturnType<typeof vi.fn>).mockReturnValue(new Date('2025-06-01T00:00:00Z'));
        (CronExpressionHelper.IsExpressionDue as ReturnType<typeof vi.fn>).mockReturnValue(false);
        // Access the singleton and reset its state
        engine = SchedulingEngine.Instance;
        // Stop any existing polling
        engine.StopPolling();
    });

    afterEach(() => {
        engine.StopPolling();
        vi.useRealTimers();
    });

    describe('Instance (singleton)', () => {
        it('should return the same instance on multiple calls', () => {
            const instance1 = SchedulingEngine.Instance;
            const instance2 = SchedulingEngine.Instance;
            expect(instance1).toBe(instance2);
        });

        it('should be an instance of SchedulingEngine', () => {
            expect(SchedulingEngine.Instance).toBeInstanceOf(SchedulingEngine);
        });
    });

    describe('IsPolling', () => {
        it('should be false initially', () => {
            expect(engine.IsPolling).toBe(false);
        });
    });

    describe('StopPolling', () => {
        it('should do nothing when not polling', async () => {
            expect(engine.IsPolling).toBe(false);
            await engine.StopPolling();
            expect(engine.IsPolling).toBe(false);
        });

        it('should set IsPolling to false when called', async () => {
            // Start polling first. v5.39: StartPolling is async, and requires
            // at least one active job to actually set isPolling=true (otherwise
            // it short-circuits with "no active jobs, polling not started").
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.StartPolling>[0];
            mockBase.ScheduledJobs = [{ ID: 'job-1', Name: 'TestJob', Status: 'Active' }];
            await engine.StartPolling(mockUser);
            expect(engine.IsPolling).toBe(true);
            await engine.StopPolling();
            expect(engine.IsPolling).toBe(false);
            mockBase.ScheduledJobs = [];
        });
    });

    describe('StartPolling', () => {
        it('should set IsPolling to true', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.StartPolling>[0];
            mockBase.ScheduledJobs = [{ ID: 'job-1', Name: 'TestJob', Status: 'Active' }];
            await engine.StartPolling(mockUser);
            expect(engine.IsPolling).toBe(true);
            await engine.StopPolling();
            mockBase.ScheduledJobs = [];
        });

        it('should not start double polling if already polling', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.StartPolling>[0];
            mockBase.ScheduledJobs = [{ ID: 'job-1', Name: 'TestJob', Status: 'Active' }];
            await engine.StartPolling(mockUser);
            const firstPollingState = engine.IsPolling;
            // Calling again should be a no-op
            await engine.StartPolling(mockUser);
            expect(engine.IsPolling).toBe(firstPollingState);
            await engine.StopPolling();
            mockBase.ScheduledJobs = [];
        });
    });

    describe('ExecuteScheduledJobs', () => {
        it('should return an empty array when no jobs are due', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJobs>[0];
            mockBase.ScheduledJobs = [];
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const runs = await engine.ExecuteScheduledJobs(mockUser);
            expect(runs).toEqual([]);
            consoleSpy.mockRestore();
        });

        it('should call Config before executing', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJobs>[0];
            mockBase.ScheduledJobs = [];
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await engine.ExecuteScheduledJobs(mockUser);
            expect(mockBase.Config).toHaveBeenCalledWith(false, mockUser, undefined, false, false);
            consoleSpy.mockRestore();
        });

        it('should update polling interval after execution', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJobs>[0];
            mockBase.ScheduledJobs = [];
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await engine.ExecuteScheduledJobs(mockUser);
            expect(mockBase.UpdatePollingInterval).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should accept a custom evalTime', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJobs>[0];
            const evalTime = new Date('2025-06-15T12:00:00Z');
            mockBase.ScheduledJobs = [];
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const runs = await engine.ExecuteScheduledJobs(mockUser, evalTime);
            expect(runs).toEqual([]);
            consoleSpy.mockRestore();
        });
    });

    describe('ExecuteScheduledJob', () => {
        it('should throw when job is not found', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJob>[1];
            mockBase.ScheduledJobs = [];
            await expect(
                engine.ExecuteScheduledJob('nonexistent-id', mockUser)
            ).rejects.toThrow('not found or not active');
        });

        it('should throw with the job ID in the error message', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJob>[1];
            mockBase.ScheduledJobs = [];
            await expect(
                engine.ExecuteScheduledJob('abc-123', mockUser)
            ).rejects.toThrow('abc-123');
        });
    });

    describe('OnJobChanged', () => {
        it('should reload configuration', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.OnJobChanged>[0];
            await engine.OnJobChanged(mockUser);
            expect(mockBase.Config).toHaveBeenCalledWith(true, mockUser, undefined, false, false);
        });

        it('should recalculate polling interval', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.OnJobChanged>[0];
            await engine.OnJobChanged(mockUser);
            expect(mockBase.UpdatePollingInterval).toHaveBeenCalled();
        });
    });

    describe('initializeNextRunTimes — RunImmediatelyIfNeverRun', () => {
        // Helper to build a minimal job object matching the MJScheduledJobEntity mock shape
        const buildJob = (overrides: Partial<Record<string, unknown>>): Record<string, unknown> => ({
            ID: 'job-1',
            Name: 'Test Job',
            CronExpression: '0 4 * * *',
            Timezone: 'UTC',
            NextRunAt: null,
            LastRunAt: null,
            RunImmediatelyIfNeverRun: false,
            Save: vi.fn().mockResolvedValue(true),
            ...overrides,
        });

        // The method we're testing is private. Calling via a typed cast is
        // cleaner than the alternative of plumbing every code path that
        // reaches it for the sake of one branch test.
        const callInitialize = async (jobs: Array<Record<string, unknown>>): Promise<void> => {
            (mockBase as Record<string, unknown>).ScheduledJobs = jobs;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (engine as any).initializeNextRunTimes({ ID: 'user-1' });
        };

        it('sets NextRunAt to the next cron tick when the flag is off', async () => {
            const nextTick = new Date('2025-06-01T00:00:00Z');
            const job = buildJob({ RunImmediatelyIfNeverRun: false, LastRunAt: null });
            await callInitialize([job]);
            expect(job.NextRunAt).toEqual(nextTick);
            expect(job.Save).toHaveBeenCalledOnce();
        });

        it('sets NextRunAt to "now" when flag is on AND the job has never run', async () => {
            vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
            const job = buildJob({ RunImmediatelyIfNeverRun: true, LastRunAt: null });
            await callInitialize([job]);
            expect((job.NextRunAt as Date).toISOString()).toBe('2026-01-15T12:00:00.000Z');
            expect(job.Save).toHaveBeenCalledOnce();
        });

        it('uses the cron tick when the flag is on but the job HAS run before', async () => {
            const nextTick = new Date('2025-06-01T00:00:00Z');
            const job = buildJob({
                RunImmediatelyIfNeverRun: true,
                LastRunAt: new Date('2026-01-10T00:00:00Z'),
            });
            await callInitialize([job]);
            expect(job.NextRunAt).toEqual(nextTick);
        });

        it('does nothing when NextRunAt is already set', async () => {
            const existing = new Date('2026-02-01T00:00:00Z');
            const job = buildJob({
                RunImmediatelyIfNeverRun: true,
                LastRunAt: null,
                NextRunAt: existing,
            });
            await callInitialize([job]);
            expect(job.NextRunAt).toBe(existing);
            expect(job.Save).not.toHaveBeenCalled();
        });
    });
});
