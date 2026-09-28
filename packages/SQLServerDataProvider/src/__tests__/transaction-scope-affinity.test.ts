import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sql from 'mssql';
vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { DoomedTransactionError } from '@memberjunction/generic-database-provider';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';

/**
 * #4786 — a transaction open on a shared provider belongs to the async scope that began it. An
 * unrelated caller on the same instance runs on the pool: never inside the transaction, never queued
 * behind its COMMIT, never rolled back with it.
 */
interface ProviderTestSurface {
  _pool: sql.ConnectionPool;
  _transaction: sql.Transaction | null;
  initializeQueueProcessor(): void;
  BeginTransaction(): Promise<void>;
  CommitTransaction(): Promise<void>;
  RollbackTransaction(): Promise<void>;
  markDoomed(): void;
  ExecuteSQL(query: string, parameters?: unknown, options?: { ignoreAmbientTransaction?: boolean }): Promise<unknown>;
  ExecuteSQLBatch(queries: string[], parameters?: unknown[][], options?: { ignoreAmbientTransaction?: boolean }): Promise<unknown>;
}

function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => { open = resolve; });
  return { wait, open };
}
const via = (text: string): boolean | undefined => mssqlState.Queries.find((q) => q.sql === text)?.viaTransaction;

describe('SQLServerDataProvider — transaction scope affinity (#4786)', () => {
  let provider: ProviderTestSurface;

  beforeEach(() => {
    mssqlState.Reset();
    provider = new SQLServerDataProvider() as unknown as ProviderTestSurface;
    provider._pool = new MockConnectionPool() as unknown as sql.ConnectionPool;
    provider.initializeQueueProcessor();
  });

  it('A1 and its descendant roll back with A; unrelated B reads and writes on the pool', async () => {
    const aOpen = gate();
    const b = (async () => {
      await aOpen.wait;
      await provider.ExecuteSQL('SELECT 1 AS B1');
      await provider.ExecuteSQL("INSERT INTO T VALUES ('B2')");
    })();
    await provider.BeginTransaction();
    await provider.ExecuteSQL("INSERT INTO T VALUES ('A1')");
    await (async () => { await Promise.resolve(); await provider.ExecuteSQL("INSERT INTO T VALUES ('A-child')"); })();
    aOpen.open();
    await b;
    await provider.RollbackTransaction();

    expect(via("INSERT INTO T VALUES ('A1')")).toBe(true);
    expect(via("INSERT INTO T VALUES ('A-child')")).toBe(true);
    expect(via('SELECT 1 AS B1')).toBe(false);
    expect(via("INSERT INTO T VALUES ('B2')")).toBe(false);
  });

  it('continuous unrelated reads never enter the transaction and never fail across its commit', async () => {
    const aOpen = gate();
    let stop = false;
    const errors: string[] = [];
    const readers = Array.from({ length: 3 }, async () => {
      await aOpen.wait;
      while (!stop) {
        try { await provider.ExecuteSQL('SELECT 1 AS R'); } catch (e) { errors.push(String(e)); }
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
    });
    await provider.BeginTransaction();
    await provider.ExecuteSQL("INSERT INTO T VALUES ('A1')");
    aOpen.open();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    await provider.CommitTransaction();
    stop = true;
    await Promise.all(readers);

    expect(errors).toEqual([]);
    expect(mssqlState.Queries.filter((q) => q.sql === 'SELECT 1 AS R').every((q) => !q.viaTransaction)).toBe(true);
    expect(mssqlState.EventKinds().filter((k) => k !== 'query')).toEqual(['begin', 'commit']);
  });

  it('an unrelated batch runs on the pool; the member\'s batch joins', async () => {
    const aOpen = gate();
    const b = (async () => { await aOpen.wait; await provider.ExecuteSQLBatch(['SELECT 2 AS B']); })();
    await provider.BeginTransaction();
    await provider.ExecuteSQLBatch(['SELECT 1 AS A']);
    aOpen.open();
    await b;
    await provider.CommitTransaction();
    expect(via('SELECT 1 AS A')).toBe(true);
    expect(via('SELECT 2 AS B')).toBe(false);
  });

  it('a member that opts out with ignoreAmbientTransaction still runs on the pool (#4514)', async () => {
    await provider.BeginTransaction();
    await provider.ExecuteSQL('SELECT 3 AS X', undefined, { ignoreAmbientTransaction: true });
    await provider.CommitTransaction();
    expect(via('SELECT 3 AS X')).toBe(false);
  });

  it('a doomed transaction fails its members loudly but does not block unrelated callers', async () => {
    const aOpen = gate();
    const b = (async () => { await aOpen.wait; return provider.ExecuteSQL('SELECT 4 AS B'); })();
    await provider.BeginTransaction();
    provider.markDoomed();
    aOpen.open();
    await expect(b).resolves.toBeDefined();
    await expect(provider.ExecuteSQL('SELECT 5 AS A')).rejects.toBeInstanceOf(DoomedTransactionError);
    expect(via('SELECT 4 AS B')).toBe(false);
    await provider.RollbackTransaction();
  });
});
