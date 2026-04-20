import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the config module
vi.mock('../config', () => ({
    dbHost: 'localhost',
    dbPort: 1433,
    dbUsername: 'testuser',
    dbPassword: 'testpass',
    dbDatabase: 'testdb',
    mjCoreSchema: '__mj',
    currentUserEmail: 'test@example.com',
    serverPort: 8000,
    autoRefreshInterval: 3600000
}));

// Mock the db module
vi.mock('../db', () => ({
    default: {
        connect: vi.fn().mockResolvedValue(undefined)
    }
}));

// Mock SQL server data provider
vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
    SQLServerProviderConfigData: class SQLServerProviderConfigData {
        constructor(_pool: unknown, _schema: string, _interval: number) {}
    },
    setupSQLServerClient: vi.fn().mockResolvedValue(undefined)
}));

import { timeout, handleServerInit } from '../util';

describe('timeout', () => {
    it('should reject after specified ms', async () => {
        vi.useFakeTimers();

        const promise = timeout(1000);
        vi.advanceTimersByTime(1000);

        await expect(promise).rejects.toThrow('Batch operation timed out');

        vi.useRealTimers();
    });

    it('should not resolve before timeout', async () => {
        vi.useFakeTimers();

        let rejected = false;
        timeout(5000).catch(() => { rejected = true; });

        vi.advanceTimersByTime(2000);
        // Need to flush promises
        await vi.advanceTimersByTimeAsync(0);

        expect(rejected).toBe(false);

        vi.advanceTimersByTime(3000);
        await vi.advanceTimersByTimeAsync(0);

        expect(rejected).toBe(true);

        vi.useRealTimers();
    });
});

describe('handleServerInit', () => {
    beforeEach(() => {
        // Reset the module-level _serverInitalized flag by resetting modules
        vi.resetModules();
    });

    it('should be a function', () => {
        expect(typeof handleServerInit).toBe('function');
    });

    it('should connect pool and setup client on first call', async () => {
        const db = await import('../db');
        const { setupSQLServerClient } = await import('@memberjunction/sqlserver-dataprovider');

        await handleServerInit(false);

        expect(db.default.connect).toHaveBeenCalled();
        expect(setupSQLServerClient).toHaveBeenCalled();
    });
});
