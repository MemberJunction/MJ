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
    ScheduledJobEntity: class {
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
    ScheduledJobRunEntity: class {
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

vi.mock('@memberjunction/global', () => ({
    MJGlobal: {
        Instance: {
            ClassFactory: {
                CreateInstance: vi.fn()
            }
        }
    }
}));

vi.mock('@memberjunction/scheduling-base-types', () => ({
    ScheduledJobResult: class {},
    NotificationChannel: {}
}));

vi.mock('@memberjunction/scheduling-engine-base', () => ({
    SchedulingEngineBase: class {
        private static _instances = new Map<Function, unknown>();
        static getInstance<T>(): T {
            const ctor = this as unknown as new () => T;
            if (!this._instances.has(ctor)) {
                this._instances.set(ctor, new ctor());
            }
            return this._instances.get(ctor) as T;
        }
        ScheduledJobs: Array<Record<string, unknown>> = [];
        ScheduledJobTypes: Array<Record<string, unknown>> = [];
        ActivePollingInterval: number | null = 60000;
        Config = vi.fn().mockResolvedValue(undefined);
        UpdatePollingInterval = vi.fn();
    }
}));

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

describe('SchedulingEngine', () => {
    let engine: SchedulingEngine;

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
            engine.ScheduledJobs = [];
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const runs = await engine.ExecuteScheduledJobs(mockUser);
            expect(runs).toEqual([]);
            consoleSpy.mockRestore();
        });

        it('should call Config before executing', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJobs>[0];
            engine.ScheduledJobs = [];
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await engine.ExecuteScheduledJobs(mockUser);
            expect(engine.Config).toHaveBeenCalledWith(false, mockUser);
            consoleSpy.mockRestore();
        });

        it('should update polling interval after execution', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJobs>[0];
            engine.ScheduledJobs = [];
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            await engine.ExecuteScheduledJobs(mockUser);
            expect(engine.UpdatePollingInterval).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should accept a custom evalTime', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJobs>[0];
            const evalTime = new Date('2025-06-15T12:00:00Z');
            engine.ScheduledJobs = [];
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            const runs = await engine.ExecuteScheduledJobs(mockUser, evalTime);
            expect(runs).toEqual([]);
            consoleSpy.mockRestore();
        });
    });

    describe('ExecuteScheduledJob', () => {
        it('should throw when job is not found', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJob>[1];
            engine.ScheduledJobs = [];
            await expect(
                engine.ExecuteScheduledJob('nonexistent-id', mockUser)
            ).rejects.toThrow('not found or not active');
        });

        it('should throw with the job ID in the error message', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.ExecuteScheduledJob>[1];
            engine.ScheduledJobs = [];
            await expect(
                engine.ExecuteScheduledJob('abc-123', mockUser)
            ).rejects.toThrow('abc-123');
        });
    });

    describe('OnJobChanged', () => {
        it('should reload configuration', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.OnJobChanged>[0];
            await engine.OnJobChanged(mockUser);
            expect(engine.Config).toHaveBeenCalledWith(true, mockUser);
        });

        it('should recalculate polling interval', async () => {
            const mockUser = { ID: 'user-1' } as Parameters<typeof engine.OnJobChanged>[0];
            await engine.OnJobChanged(mockUser);
            expect(engine.UpdatePollingInterval).toHaveBeenCalled();
        });
    });
});
