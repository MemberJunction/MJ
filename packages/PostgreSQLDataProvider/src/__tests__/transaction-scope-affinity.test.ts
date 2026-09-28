import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostgreSQLDataProvider } from '../PostgreSQLDataProvider.js';
import { DoomedTransactionError } from '@memberjunction/generic-database-provider';

vi.mock('pg', () => ({ default: { Pool: vi.fn(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn() })) } }));

/** #4786 — the transaction client serves only the async scope that began the transaction. */
type Recorder = { queries: string[]; query: (sql: string) => Promise<{ rows: unknown[] }>; release: () => void };

function gate(): { wait: Promise<void>; open: () => void } {
    let open!: () => void;
    const wait = new Promise<void>((resolve) => { open = resolve; });
    return { wait, open };
}

describe('PostgreSQLDataProvider — transaction scope affinity (#4786)', () => {
    let provider: PostgreSQLDataProvider;
    let client: Recorder;
    let pool: Recorder;

    beforeEach(() => {
        provider = new PostgreSQLDataProvider();
        const recorder = (): Recorder => {
            const r: Recorder = {
                queries: [],
                query: vi.fn(async (sql: string) => { r.queries.push(sql); return { rows: [] }; }),
                release: vi.fn(),
            };
            return r;
        };
        client = recorder();
        pool = recorder();
        const cm = (provider as unknown as { _connectionManager: { AcquireClient: () => Promise<unknown>; Pool: unknown } })._connectionManager;
        cm.AcquireClient = vi.fn(async () => client);
        Object.defineProperty(cm, 'Pool', { value: pool, configurable: true });
    });

    it('the member and its descendants use the transaction client; an unrelated caller uses the pool', async () => {
        const aOpen = gate();
        const b = (async () => { await aOpen.wait; await provider.ExecuteSQL('SELECT 2 AS b', []); })();
        await provider.BeginTransaction();
        await provider.ExecuteSQL('SELECT 1 AS a', []);
        await (async () => { await Promise.resolve(); await provider.ExecuteSQL('SELECT 3 AS child', []); })();
        aOpen.open();
        await b;
        await provider.RollbackTransaction();
        expect(client.queries).toEqual(['BEGIN', 'SELECT 1 AS a', 'SELECT 3 AS child', 'ROLLBACK']);
        expect(pool.queries).toEqual(['SELECT 2 AS b']);
    });

    it('RunColocatedSQL follows the same rule', async () => {
        const aOpen = gate();
        const b = (async () => { await aOpen.wait; await provider.RunColocatedSQL('SELECT 5'); })();
        await provider.BeginTransaction();
        await provider.RunColocatedSQL('SELECT 4');
        aOpen.open();
        await b;
        await provider.CommitTransaction();
        expect(client.queries).toContain('SELECT 4');
        expect(pool.queries).toEqual(['SELECT 5']);
    });

    it('a doomed transaction fails its member but not an unrelated caller', async () => {
        const aOpen = gate();
        const b = (async () => { await aOpen.wait; return provider.ExecuteSQL('SELECT 4 AS b', []); })();
        await provider.BeginTransaction();
        (provider as unknown as { markDoomed(): void }).markDoomed();
        aOpen.open();
        await expect(b).resolves.toBeDefined();
        await expect(provider.ExecuteSQL('SELECT 5 AS a', [])).rejects.toBeInstanceOf(DoomedTransactionError);
        expect(pool.queries).toContain('SELECT 4 AS b');
        expect(client.queries).not.toContain('SELECT 5 AS a');
        await provider.RollbackTransaction();
    });
});
