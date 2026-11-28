/**
 * A provider configured on a shared pool renders query filters for PostgreSQL, exactly as one
 * configured with its own pool does.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pg from 'pg';
import { LocalCacheManager, Metadata, RunQuerySQLFilterManager, SetProvider, type DatabaseProviderBase } from '@memberjunction/core';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import { PostgreSQLProviderConfigData } from '../types.js';

vi.mock('pg', () => ({
    default: {
        Pool: class {
            connect = vi.fn();
            query = vi.fn(async () => ({ rows: [] }));
            end = vi.fn();
        }
    }
}));

describe('ConfigWithSharedPool', () => {
    it('sets the query filter platform to PostgreSQL', async () => {
        RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
        const sharedPool = new pg.Pool();
        const config = new PostgreSQLProviderConfigData({ Host: 'h', Database: 'd', User: 'u', Password: 'p' }, '__mj', 0, undefined, undefined, false);
        await new PostgreSQLDataProvider().ConfigWithSharedPool(config, sharedPool);
        expect(RunQuerySQLFilterManager.Instance.Platform).toBe('postgresql');
        RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
    });
});

describe('PostgreSQLDataProvider.CanConfigureFromGlobalSync & ConfigureFromGlobalSync', () => {
    let previousGlobalProvider: DatabaseProviderBase;

    beforeEach(async () => {
        previousGlobalProvider = Metadata.Provider as unknown as DatabaseProviderBase;
        await LocalCacheManager.Instance.Initialize();
    });

    afterEach(() => {
        SetProvider(previousGlobalProvider);
        RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
    });

    it('returns false from CanConfigureFromGlobalSync when pool is null or global metadata lacks entities', () => {
        const pool = new pg.Pool();
        expect(PostgreSQLDataProvider.CanConfigureFromGlobalSync(null)).toBe(false);
        expect(PostgreSQLDataProvider.CanConfigureFromGlobalSync(undefined)).toBe(false);

        SetProvider({ AllMetadata: { AllEntities: [] } } as unknown as DatabaseProviderBase);
        expect(PostgreSQLDataProvider.CanConfigureFromGlobalSync(pool)).toBe(false);
    });

    it('synchronously configures pool, metadata, and postgresql platform when global state is warm', () => {
        const pool = new pg.Pool();
        const fakeEntities = [{ ID: 'e1', Name: 'Users' }];
        SetProvider({
            AllMetadata: { AllEntities: fakeEntities },
            Entities: fakeEntities,
        } as unknown as DatabaseProviderBase);

        expect(PostgreSQLDataProvider.CanConfigureFromGlobalSync(pool)).toBe(true);

        RunQuerySQLFilterManager.Instance.SetPlatform('sqlserver');
        const provider = new PostgreSQLDataProvider();
        const config = new PostgreSQLProviderConfigData(
            { Host: 'h', Database: 'd', User: 'u', Password: 'p' },
            '__mj',
            0,
            undefined,
            undefined,
            false,
        );
        const ok = provider.ConfigureFromGlobalSync(config, pool);

        expect(ok).toBe(true);
        expect(provider.DatabaseConnection).toBe(pool);
        expect(provider.MJCoreSchemaName).toBe('__mj');
        expect(RunQuerySQLFilterManager.Instance.Platform).toBe('postgresql');
        expect(provider.Entities).toHaveLength(1);
    });

    it('returns false from CanConfigureFromGlobalSync and ConfigureFromGlobalSync when pool is missing or metadata cold', () => {
        const pool = new pg.Pool();
        SetProvider({ AllMetadata: { AllEntities: [] } } as unknown as DatabaseProviderBase);

        expect(PostgreSQLDataProvider.CanConfigureFromGlobalSync(null)).toBe(false);
        expect(PostgreSQLDataProvider.CanConfigureFromGlobalSync(undefined)).toBe(false);
        expect(PostgreSQLDataProvider.CanConfigureFromGlobalSync(pool)).toBe(false);

        const provider = new PostgreSQLDataProvider();
        const config = new PostgreSQLProviderConfigData(
            { Host: 'h', Database: 'd', User: 'u', Password: 'p' },
            '__mj',
            0,
            undefined,
            undefined,
            false,
        );

        expect(provider.ConfigureFromGlobalSync(config, null as unknown as pg.Pool)).toBe(false);
        expect(provider.ConfigureFromGlobalSync(config, pool)).toBe(false);
        expect(() => provider.DatabaseConnection).toThrow();
    });
});
