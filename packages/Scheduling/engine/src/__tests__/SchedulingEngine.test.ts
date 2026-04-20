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
    IsVerboseLoggingEnabled: vi.fn(() => false)
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
        GetRunsForJob: vi.fn().mockReturnValue([])
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

describe('SchedulingEngine', () => {
    let engine: SchedulingEngine;
    // Access the mock base for setting up test state
    const mockBase = SchedulingEngineBase.Instance as Record<string, unknown>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
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
        it('should do nothing when not polling', () => {
            expect(engine.IsPolling).toBe(false);
            engine.StopPolling();
            expect(engine.IsPolling).toBe(false);
        });

        it('should set IsPolling to false when called', () => {
            // Start polling first
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.StartPolling>[0];
            engine.StartPolling(mockUser);
            expect(engine.IsPolling).toBe(true);
            engine.StopPolling();
            expect(engine.IsPolling).toBe(false);
        });
    });

    describe('StartPolling', () => {
        it('should set IsPolling to true', () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.StartPolling>[0];
            engine.StartPolling(mockUser);
            expect(engine.IsPolling).toBe(true);
        });

        it('should not start double polling if already polling', () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.StartPolling>[0];
            engine.StartPolling(mockUser);
            const firstPollingState = engine.IsPolling;
            // Calling again should be a no-op
            engine.StartPolling(mockUser);
            expect(engine.IsPolling).toBe(firstPollingState);
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
});
