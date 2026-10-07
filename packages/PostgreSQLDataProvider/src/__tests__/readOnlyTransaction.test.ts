import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';

vi.mock('pg', () => ({ default: { Pool: vi.fn(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn() })) } }));

/**
 * A statement run with `readOnlyTransaction` executes inside a read-only transaction that is
 * always rolled back, so a session setting it changes (`SET`, `set_config`) is undone before the
 * connection returns to the pool and is never seen by a later request.
 */
const UNLOCK = 'SELECT pg_advisory_unlock_all()';

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
        expect(client.queries).toEqual(['BEGIN READ ONLY', `SELECT set_config('statement_timeout', '3s', false) AS v`, 'ROLLBACK', UNLOCK]);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('rolls back and releases the connection when the statement fails', async () => {
        failOn = 'nope';
        await expect(provider.ExecuteSQL('SELECT nope', [], { readOnlyTransaction: true })).rejects.toThrow('boom');
        expect(client.queries).toEqual(['BEGIN READ ONLY', 'SELECT nope', 'ROLLBACK', UNLOCK]);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('limits the statement with SET LOCAL statement_timeout inside the same transaction', async () => {
        await provider.ExecuteSQL('SELECT 1 AS v', [], { readOnlyTransaction: true, timeoutMs: 5000 });
        expect(client.queries).toEqual(['BEGIN READ ONLY', 'SET LOCAL statement_timeout = 5000', 'SELECT 1 AS v', 'ROLLBACK', UNLOCK]);
    });

    it('commits a timed statement that is not read-only, so its writes land', async () => {
        await provider.ExecuteSQL('UPDATE t SET a = 1', [], { timeoutMs: 2500 });
        expect(client.queries).toEqual(['BEGIN', 'SET LOCAL statement_timeout = 2500', 'UPDATE t SET a = 1', 'COMMIT', UNLOCK]);
    });

    it('rolls back a timed statement that fails, such as one cancelled at its timeout', async () => {
        failOn = 'slow';
        await expect(provider.ExecuteSQL('SELECT slow()', [], { timeoutMs: 10 })).rejects.toThrow('boom');
        expect(client.queries).toEqual(['BEGIN', 'SET LOCAL statement_timeout = 10', 'SELECT slow()', 'ROLLBACK', UNLOCK]);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    it('never lets a call lift the pool statement_timeout', async () => {
        const cm = provider['_connectionManager'];
        Object.defineProperty(cm, 'Config', { value: { StatementTimeoutMs: 30000 }, configurable: true });
        await provider.ExecuteSQL('SELECT 1 AS v', [], { readOnlyTransaction: true, timeoutMs: 600000 });
        await provider.ExecuteSQL('SELECT 1 AS v', [], { readOnlyTransaction: true, timeoutMs: 1000 });
        expect(client.queries.filter(q => q.startsWith('SET LOCAL'))).toEqual(['SET LOCAL statement_timeout = 30000', 'SET LOCAL statement_timeout = 1000']);
    });

    it('discards the connection when the advisory locks cannot be released', async () => {
        failOn = 'pg_advisory_unlock_all';
        await provider.ExecuteSQL('SELECT 1 AS v', [], { readOnlyTransaction: true });
        expect(client.release).toHaveBeenCalledWith(expect.any(Error));
    });

    it('runs inside the ambient transaction when one is open, without nesting another', async () => {
        await provider.BeginTransaction();
        await provider.ExecuteSQL('SELECT 1 AS v', [], { readOnlyTransaction: true });
        expect(client.queries).toEqual(['BEGIN', 'SELECT 1 AS v']);
        await provider.RollbackTransaction();
    });
});
