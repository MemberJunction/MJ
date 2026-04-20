import { describe, it, expect, vi } from 'vitest';

// ---- hoisted mocks ----
vi.mock('mssql', () => {
    class MockConnectionPool {
        connect = vi.fn().mockResolvedValue(undefined);
    }
    return { ConnectionPool: MockConnectionPool };
});

vi.mock('../db', () => ({
    default: { connect: vi.fn().mockResolvedValue(undefined) },
}));

// Mock config with non-required env vars
vi.mock('../config', () => ({
    dbHost: 'localhost',
    dbPort: 1433,
    dbUsername: 'sa',
    dbPassword: 'password',
    dbDatabase: 'testdb',
    mjCoreSchema: '__mj',
    currentUserEmail: 'test@test.com',
    serverPort: 8000,
    autoRefreshInterval: 3600000,
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    SQLServerProviderConfigData: vi.fn(),
    setupSQLServerClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: vi.fn(),
}));

vi.mock('@memberjunction/scheduled-actions', () => ({
    ScheduledActionEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            ExecuteScheduledActions: vi.fn().mockResolvedValue([]),
            ExecuteScheduledAction: vi.fn().mockResolvedValue({ Success: true }),
        },
    },
}));

// ---- import after mocks ----
import { timeout } from '../util';

describe('timeout utility', () => {
    it('should reject after the specified milliseconds', async () => {
        vi.useFakeTimers();
        const promise = timeout(1000);
        vi.advanceTimersByTime(1000);
        await expect(promise).rejects.toThrow('Batch operation timed out');
        vi.useRealTimers();
    });

    it('should not resolve before timeout', async () => {
        vi.useFakeTimers();
        let rejected = false;
        const promise = timeout(5000).catch(() => { rejected = true; });
        vi.advanceTimersByTime(4999);
        // Give microtask queue a tick
        await Promise.resolve();
        expect(rejected).toBe(false);
        vi.advanceTimersByTime(1);
        await promise;
        expect(rejected).toBe(true);
        vi.useRealTimers();
    });
});
