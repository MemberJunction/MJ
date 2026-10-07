/**
 * A provider configured on a shared pool renders query filters for PostgreSQL, exactly as one
 * configured with its own pool does.
 */
import { describe, it, expect, vi } from 'vitest';
import pg from 'pg';
import { RunQuerySQLFilterManager } from '@memberjunction/core';
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
