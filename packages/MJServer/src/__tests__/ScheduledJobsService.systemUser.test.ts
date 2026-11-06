/**
 * #4232: `scheduledJobs.systemUserEmail` used to default (in the zod schema) to an address no
 * stock database has, and the service matched it by Email only. It now resolves through
 * `ResolveConfiguredPrincipal`: an active user by Name or Email, else the system user.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config.js', () => ({ configInfo: {} }));

type MockUser = { ID: string; Name: string; Email: string; Type: string; IsActive: boolean };
const mockUsers: MockUser[] = [];
const SYSTEM_USER_ID = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';

vi.mock('@memberjunction/generic-database-provider', () => ({
    UserCache: {
        get Users() { return mockUsers; },
        Instance: {
            get Users() { return mockUsers; },
            get SYSTEM_USER_ID() { return SYSTEM_USER_ID; },
        },
    },
}));

const mockEngineConfig = vi.fn().mockResolvedValue(undefined);
vi.mock('@memberjunction/scheduling-engine', () => ({
    SchedulingEngine: {
        Instance: {
            Config: (...args: unknown[]) => mockEngineConfig(...args),
        },
    },
}));

import { ScheduledJobsService } from '../services/ScheduledJobsService.js';

const SYSTEM: MockUser = { ID: SYSTEM_USER_ID, Name: 'System', Email: 'not.set@nowhere.com', Type: 'Owner', IsActive: true };
const RUNNER: MockUser = { ID: 'AAAA0000-0000-0000-0000-000000000001', Name: 'Job Runner', Email: 'jobs@example.com', Type: 'User', IsActive: true };

describe('ScheduledJobsService system user (#4232)', () => {
    beforeEach(() => {
        mockUsers.length = 0;
        mockEngineConfig.mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    it('a config without systemUserEmail runs jobs as the system user', async () => {
        mockUsers.push(RUNNER, SYSTEM);
        const svc = new ScheduledJobsService({ enabled: true, maxConcurrentJobs: 5, defaultLockTimeout: 1, staleLockCleanupInterval: 1 });

        await svc.Initialize();

        expect(mockEngineConfig).toHaveBeenCalledWith(false, SYSTEM);
    });

    it('matches the configured value against Name as well as Email', async () => {
        mockUsers.push(RUNNER, SYSTEM);
        const svc = new ScheduledJobsService({ enabled: true, systemUserEmail: 'Job Runner', maxConcurrentJobs: 5, defaultLockTimeout: 1, staleLockCleanupInterval: 1 });

        await svc.Initialize();

        expect(mockEngineConfig).toHaveBeenCalledWith(false, RUNNER);
    });

    it('an unmatched value falls back to the system user instead of failing startup', async () => {
        mockUsers.push(RUNNER, SYSTEM);
        const svc = new ScheduledJobsService({ enabled: true, systemUserEmail: 'system@memberjunction.org', maxConcurrentJobs: 5, defaultLockTimeout: 1, staleLockCleanupInterval: 1 });

        await svc.Initialize();

        expect(mockEngineConfig).toHaveBeenCalledWith(false, SYSTEM);
    });

    it('fails with the configured value in the message when no user at all can be used', async () => {
        const svc = new ScheduledJobsService({ enabled: true, systemUserEmail: 'ghost@example.com', maxConcurrentJobs: 5, defaultLockTimeout: 1, staleLockCleanupInterval: 1 });

        await expect(svc.Initialize()).rejects.toThrow('ghost@example.com');
        expect(mockEngineConfig).not.toHaveBeenCalled();
    });
});
