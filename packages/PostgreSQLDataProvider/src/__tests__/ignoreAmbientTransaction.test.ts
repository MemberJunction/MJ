import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

// Mock pg module — the provider never reaches a real pool here.
vi.mock('pg', () => ({ default: { Pool: vi.fn(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn() })) } }));

/**
 * #4514 — a read that carries `ignoreAmbientTransaction` runs on the pool even while an ambient
 * transaction is open, so the metadata batch a timer-driven refresh issues never lands on the
 * transaction's client beside its COMMIT. Everything else keeps using the transaction client.
 */
type Captured = { queries: string[]; query: (sql: string) => Promise<{ rows: unknown[] }>; release: () => void };

describe('PostgreSQLDataProvider.ExecuteSQL with ignoreAmbientTransaction (#4514)', () => {
    let provider: PostgreSQLDataProvider;
    let client: Captured;
    let pool: { queries: string[]; query: (sql: string) => Promise<{ rows: unknown[] }> };

    beforeEach(() => {
        provider = new PostgreSQLDataProvider();
        client = {
            queries: [],
            query: vi.fn(async (sql: string) => { client.queries.push(sql); return { rows: [] }; }),
            release: vi.fn(),
        };
        pool = { queries: [], query: vi.fn(async (sql: string) => { pool.queries.push(sql); return { rows: [{ ok: 1 }] }; }) };
        const cm = (provider as unknown as { _connectionManager: { AcquireClient: () => Promise<unknown>; Pool: unknown } })._connectionManager;
        cm.AcquireClient = vi.fn(async () => client);
        Object.defineProperty(cm, 'Pool', { value: pool, configurable: true });
    });

    it('a plain read inside a transaction uses the transaction client; the opted-out read uses the pool', async () => {
        await provider.BeginTransaction();
        await provider.ExecuteSQL('SELECT 1 AS a', []);
        const rows = await provider.ExecuteSQL('SELECT 2 AS b', [], { ignoreAmbientTransaction: true });

        expect(client.queries).toEqual(['BEGIN', 'SELECT 1 AS a']);
        expect(pool.queries).toEqual(['SELECT 2 AS b']);
        expect(rows).toEqual([{ ok: 1 }]);
        await provider.RollbackTransaction();
    });

    it('outside a transaction both go to the pool', async () => {
        await provider.ExecuteSQL('SELECT 1 AS a', []);
        await provider.ExecuteSQL('SELECT 2 AS b', [], { ignoreAmbientTransaction: true });
        expect(pool.queries).toEqual(['SELECT 1 AS a', 'SELECT 2 AS b']);
        expect(client.queries).toEqual([]);
    });
});
