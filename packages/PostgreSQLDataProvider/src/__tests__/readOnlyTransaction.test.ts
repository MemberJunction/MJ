import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

vi.mock('pg', () => ({ default: { Pool: vi.fn(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn() })) } }));

/**
 * A statement run with `readOnlyTransaction` executes inside a read-only transaction that is
 * always rolled back, so a session setting it changes (`SET`, `set_config`) is undone before the
 * connection returns to the pool and is never seen by a later request.
 */
type Client = { queries: string[]; query: (sql: string) => Promise<{ rows: unknown[] }>; release: () => void };

describe('PostgreSQLDataProvider.ExecuteSQL with readOnlyTransaction', () => {
    let provider: PostgreSQLDataProvider;
    let client: Client;
    let failOn: string | null;

    beforeEach(() => {
        provider = new PostgreSQLDataProvider();
        failOn = null;
        client = {
            queries: [],
            query: vi.fn(async (sql: string) => {
                client.queries.push(sql);
                if (failOn && sql.includes(failOn)) throw new Error('boom');
                return { rows: [{ v: 1 }] };
            }),
            release: vi.fn(),
        };
        const pool = { query: vi.fn(async () => ({ rows: [] })), connect: vi.fn(async () => client) };
        const cm = (provider as unknown as { _connectionManager: { AcquireClient: () => Promise<unknown>; Pool: unknown } })._connectionManager;
        cm.AcquireClient = vi.fn(async () => client);
        Object.defineProperty(cm, 'Pool', { value: pool, configurable: true });
    });

    it('wraps the statement in a read-only transaction that is rolled back', async () => {
        const rows = await provider.ExecuteSQL("SELECT set_config('statement_timeout', '3s', false) AS v", [], { readOnlyTransaction: true });
        expect(rows).toEqual([{ v: 1 }]);
        expect(client.queries).toEqual(['BEGIN READ ONLY', `SELECT set_config('statement_timeout', '3s', false) AS v`, 'ROLLBACK']);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('rolls back and releases the connection when the statement fails', async () => {
        failOn = 'nope';
        await expect(provider.ExecuteSQL('SELECT nope', [], { readOnlyTransaction: true })).rejects.toThrow('boom');
        expect(client.queries).toEqual(['BEGIN READ ONLY', 'SELECT nope', 'ROLLBACK']);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('runs inside the ambient transaction when one is open, without nesting another', async () => {
        await provider.BeginTransaction();
        await provider.ExecuteSQL('SELECT 1 AS v', [], { readOnlyTransaction: true });
        expect(client.queries).toEqual(['BEGIN', 'SELECT 1 AS v']);
        await provider.RollbackTransaction();
    });
});
