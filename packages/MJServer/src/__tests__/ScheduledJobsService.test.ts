/**
 * Wiring of MJServer's `scheduledJobs` config block into the scheduling engine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// config.ts validates DB env at module load; this suite needs only the config type.
vi.mock('../config.js', () => ({ configInfo: {} }));

/** A user row as the mocked UserCache exposes it. */
interface CachedUser {
    ID: string;
    Email: string;
}

const { mockUsers, fakeEngine, calls } = vi.hoisted(() => {
    const calls: string[] = [];
    const users: CachedUser[] = [];
    const scheduledJobs: Array<{ ID: string }> = [];
    const pollingInterval: number | null = null;
    const fakeEngine = {
        MaxConcurrentJobs: 5,
        LeaseTimeoutMs: 600_000,
        resumeIntervalMs: 3_600_000,
        get PausedJobResumeIntervalMs(): number { return this.resumeIntervalMs; },
        set PausedJobResumeIntervalMs(value: number) { calls.push(`interval=${value}`); this.resumeIntervalMs = value; },
        ScheduledJobs: scheduledJobs,
        ActivePollingInterval: pollingInterval,
        Config: async (): Promise<void> => undefined,
        StartPolling: async (): Promise<void> => { calls.push('StartPolling'); },
        StopPolling: async (): Promise<void> => undefined,
    };
    return { mockUsers: users, fakeEngine, calls };
});

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: { get Users() { return mockUsers; } },
}));

vi.mock('@memberjunction/scheduling-engine', () => ({
    SchedulingEngine: { get Instance() { return fakeEngine; } },
}));

import { ScheduledJobsService } from '../services/ScheduledJobsService.js';
import type { ScheduledJobsConfig } from '../config.js';

function makeConfig(overrides: Partial<ScheduledJobsConfig> = {}): ScheduledJobsConfig {
    return {
        enabled: true,
        systemUserEmail: 'system@memberjunction.org',
        maxConcurrentJobs: 5,
        defaultLockTimeout: 600_000,
        staleLockCleanupInterval: 300_000,
        pausedJobResumeInterval: 3_600_000,
        ...overrides,
    };
}

describe('ScheduledJobsService engine wiring', () => {
    beforeEach(() => {
        calls.length = 0;
        mockUsers.length = 0;
        mockUsers.push({ ID: 'sys', Email: 'system@memberjunction.org' });
        fakeEngine.resumeIntervalMs = 3_600_000;
    });

    it('applies scheduledJobs.pausedJobResumeInterval to the engine before polling starts', async () => {
        const service = new ScheduledJobsService(makeConfig({ pausedJobResumeInterval: 900_000 }));
        await service.Initialize();
        await service.Start();
        expect(fakeEngine.PausedJobResumeIntervalMs).toBe(900_000);
        expect(calls).toEqual(['interval=900000', 'StartPolling']);
    });

    it('applies the tunables it is given (lock timeout and concurrency included)', async () => {
        const service = new ScheduledJobsService(makeConfig({ maxConcurrentJobs: 8, defaultLockTimeout: 120_000 }));
        await service.Initialize();
        await service.Start();
        expect(fakeEngine.MaxConcurrentJobs).toBe(8);
        expect(fakeEngine.LeaseTimeoutMs).toBe(120_000);
    });
});
