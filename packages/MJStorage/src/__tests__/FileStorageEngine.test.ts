/**
 * Unit tests for FileStorageEngine's driver-cache disposal behavior.
 *
 * Regression coverage for the memory-leak audit finding: RefreshDriverCache() used to call
 * `_driverCache.clear()` with no disposal of the outgoing drivers, so every live SDK client
 * (S3Client, BlobServiceClient, etc.) held by a cached driver was simply dropped and left to be
 * GC'd whenever its own keep-alive sockets happened to expire. RefreshDriverCache() is reachable
 * from ordinary end-user activity: UploadFile() force-refreshes the whole engine (and therefore
 * the whole driver cache) any time ResolveStorageAccount() can't find the requested account ID.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@memberjunction/global', () => ({
    BaseSingleton: class BaseSingletonMock<T> {
        protected constructor() {}
        protected static getInstance<U>(this: new () => U): U {
            return new this();
        }
    },
}));

const { mockBase } = vi.hoisted(() => {
    const mockBase = {
        Loaded: true,
        Config: vi.fn().mockResolvedValue(undefined),
        AccountsWithProviders: [] as unknown[],
        GetAccountById: vi.fn(),
        GetProviderById: vi.fn(),
        GetAccountByName: vi.fn(),
        GetAccountsByProviderID: vi.fn(),
        GetAccountWithProvider: vi.fn(),
    };
    return { mockBase };
});

vi.mock('@memberjunction/core-entities', () => ({
    FileStorageEngineBase: {
        get Instance() { return mockBase; },
    },
}));

vi.mock('@memberjunction/core', () => ({
    LogError: vi.fn(),
    Metadata: class { static Provider = {}; },
}));

vi.mock('../util', () => ({
    InitializeDriverWithAccountCredentials: vi.fn(),
}));

import { FileStorageEngine } from '../FileStorageEngine';
import { FileStorageBase } from '../generic/FileStorageBase';
import { LogError } from '@memberjunction/core';

/** Minimal disposable fake driver — enough to satisfy the FileStorageBase surface this test touches. */
function makeFakeDriver(disposeImpl?: () => void): FileStorageBase {
    return {
        Dispose: vi.fn(disposeImpl),
    } as unknown as FileStorageBase;
}

describe('FileStorageEngine driver-cache disposal', () => {
    let engine: FileStorageEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        mockBase.Loaded = true;
        mockBase.AccountsWithProviders = [];
        engine = new FileStorageEngine();
        (engine as unknown as { _contextUser: unknown })._contextUser = { ID: 'test-user' };
    });

    describe('RefreshDriverCache', () => {
        it('calls Dispose() on every cached driver before clearing the cache', async () => {
            const driverA = makeFakeDriver();
            const driverB = makeFakeDriver();
            const cache = (engine as unknown as { _driverCache: Map<string, FileStorageBase> })._driverCache;
            cache.set('account-a', driverA);
            cache.set('account-b', driverB);

            await engine.RefreshDriverCache();

            expect(driverA.Dispose).toHaveBeenCalledTimes(1);
            expect(driverB.Dispose).toHaveBeenCalledTimes(1);
            expect(cache.size).toBe(0);
        });

        it('still clears the cache and logs when a driver Dispose() throws', async () => {
            const throwingDriver = makeFakeDriver(() => {
                throw new Error('boom');
            });
            const healthyDriver = makeFakeDriver();
            const cache = (engine as unknown as { _driverCache: Map<string, FileStorageBase> })._driverCache;
            cache.set('account-throws', throwingDriver);
            cache.set('account-ok', healthyDriver);

            await expect(engine.RefreshDriverCache()).resolves.not.toThrow();

            expect(throwingDriver.Dispose).toHaveBeenCalledTimes(1);
            expect(healthyDriver.Dispose).toHaveBeenCalledTimes(1);
            expect(cache.size).toBe(0);
            expect(LogError).toHaveBeenCalled();
        });

        it('is a no-op disposal pass when the cache starts empty', async () => {
            const cache = (engine as unknown as { _driverCache: Map<string, FileStorageBase> })._driverCache;
            expect(cache.size).toBe(0);

            await expect(engine.RefreshDriverCache()).resolves.not.toThrow();
            expect(cache.size).toBe(0);
        });
    });

    describe('GetDriver on-demand caching', () => {
        it('does not call Dispose when populating a previously-uncached account', async () => {
            const newDriver = makeFakeDriver();
            const { InitializeDriverWithAccountCredentials } = await import('../util');
            vi.mocked(InitializeDriverWithAccountCredentials).mockResolvedValue(newDriver);
            mockBase.GetAccountWithProvider.mockReturnValue({
                account: { ID: 'account-new' },
                provider: {},
            });

            const driver = await engine.GetDriver('account-new', { ID: 'test-user' } as never);

            expect(driver).toBe(newDriver);
            expect(newDriver.Dispose).not.toHaveBeenCalled();
        });
    });
});
