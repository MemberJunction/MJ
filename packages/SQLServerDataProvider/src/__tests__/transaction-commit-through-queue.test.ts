import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sql from 'mssql';
vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool, MockTransaction } from './helpers/mock-mssql';

/**
 * #4454 — commit and rollback run INSIDE the instance SQL queue, not around it.
 *
 * #4448 drained the queue and then committed. Between the drain returning and `commit()` starting
 * there was a microtask window: a query enqueued in it was still pending in the serial queue, so
 * `_activeRequest` was unset, the guard passed, and the commit ran first — the query then hit a
 * finished handle (ENOTBEGUN), or, with the framework's own debounced metadata refresh as the
 * concurrent caller, EINVALIDSTATE / ECLOSE in the deterministic tier (#4486). Routing commit and
 * rollback through the queue makes the ordering the queue's own.
 *
 * #4514 — a read can opt out of the ambient transaction and run on the pool.
 */
interface ProviderTestSurface {
  _pool: sql.ConnectionPool;
  _transaction: sql.Transaction | null;
  _doomed: boolean;
  initializeQueueProcessor(): void;
  _internalExecuteSQLInstance(
    query: string,
    parameters: unknown,
    context: { pool: sql.ConnectionPool; transaction?: sql.Transaction | null }
  ): Promise<unknown>;
  BeginTransaction(): Promise<void>;
  CommitTransaction(): Promise<void>;
  RollbackTransaction(): Promise<void>;
  ExecuteSQL(query: string, parameters: unknown, options?: { ignoreAmbientTransaction?: boolean }): Promise<unknown>;
  ExecuteSQLBatch(queries: string[], parameters?: unknown[][], options?: { ignoreAmbientTransaction?: boolean }): Promise<unknown>;
}

describe('SQLServerDataProvider - commit/rollback routed through the instance SQL queue (#4454)', () => {
  let pool: MockConnectionPool;
  let provider: ProviderTestSurface;

  beforeEach(() => {
    mssqlState.Reset();
    pool = new MockConnectionPool();
    provider = new SQLServerDataProvider() as unknown as ProviderTestSurface;
    provider._pool = pool as unknown as sql.ConnectionPool;
    provider.initializeQueueProcessor();
  });

  it('commits after a query enqueued in the same synchronous turn as the commit', async () => {
    await provider.BeginTransaction();
    const context = { pool: provider._pool, transaction: provider._transaction };
    // No await between the enqueue and the commit request: this is the post-drain window of #4448,
    // where the drain had nothing to wait for and commit() ran before the query.
    const query = provider._internalExecuteSQLInstance('SELECT 1 AS a', null, context);
    const commit = provider.CommitTransaction();
    await Promise.all([query, commit]);

    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'commit']);
    expect(provider._transaction).toBeNull();
  });

  it('rolls back after a query enqueued in the same synchronous turn as the rollback', async () => {
    await provider.BeginTransaction();
    const context = { pool: provider._pool, transaction: provider._transaction };
    const query = provider._internalExecuteSQLInstance('SELECT 1 AS a', null, context);
    const rollback = provider.RollbackTransaction();
    await Promise.all([query, rollback]);

    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'rollback']);
    expect(provider._transaction).toBeNull();
  });

  it('rejects a query enqueued behind the commit with the real cause, and never sends it', async () => {
    await provider.BeginTransaction();
    const handle = provider._transaction;
    const tx = handle as unknown as MockTransaction;
    // Hold the commit open so a query can be enqueued while the commit action is the item running.
    let releaseCommit: () => void = () => undefined;
    const originalCommit = tx.commit.bind(tx);
    tx.commit = async () => {
      await new Promise<void>(resolve => { releaseCommit = resolve; });
      await originalCommit();
    };
    const commit = provider.CommitTransaction();
    await new Promise(resolve => setImmediate(resolve)); // the sentinel is now dequeued and blocked in commit()

    // A caller bug: fired on the handle without awaiting, after asking for the commit. Old behavior
    // was ENOTBEGUN from mssql on a finished handle; now the provider names the cause and never
    // sends the query.
    const late = provider._internalExecuteSQLInstance('SELECT 2 AS b', null, { pool: provider._pool, transaction: handle });
    releaseCommit();

    await commit;
    await expect(late).rejects.toThrow(/ambient transaction ended before this query ran/);
    expect(mssqlState.EventKinds()).toEqual(['begin', 'commit']);
    expect(provider._transaction).toBeNull();
  });

  it('leaves a query on an explicit, non-ambient handle alone', async () => {
    await provider.BeginTransaction();
    // An IS-A chain shares its OWN transaction and passes it explicitly; it is not the ambient
    // handle, so ending the ambient one must not reject it.
    const own = new sql.Transaction(provider._pool) as unknown as MockTransaction;
    await own.begin();
    const context = { pool: provider._pool, transaction: own as unknown as sql.Transaction };
    const ownQuery = provider._internalExecuteSQLInstance('SELECT 3 AS c', null, context);
    await provider.CommitTransaction();
    await expect(ownQuery).resolves.toBeDefined();
    await own.commit();

    expect(mssqlState.EventKinds()).toEqual(['begin', 'begin', 'query', 'commit', 'commit']);
  });

  it('keeps the handle for abandon when the queued commit fails', async () => {
    await provider.BeginTransaction();
    const tx = provider._transaction as unknown as MockTransaction;
    tx.commit = async () => {
      throw new Error('deadlock victim');
    };
    await expect(provider.CommitTransaction()).rejects.toThrow('deadlock victim');
    // The base class's abandon found the handle and rolled it back; a fresh transaction is clean.
    expect(mssqlState.EventKinds()).toEqual(['begin', 'rollback']);
    expect(provider._transaction).toBeNull();
    await provider.BeginTransaction();
    await provider.CommitTransaction();
    expect(mssqlState.EventKinds()).toEqual(['begin', 'rollback', 'begin', 'commit']);
  });
});

describe('SQLServerDataProvider - ignoreAmbientTransaction runs a read on the pool (#4514)', () => {
  let provider: ProviderTestSurface;

  beforeEach(() => {
    mssqlState.Reset();
    provider = new SQLServerDataProvider() as unknown as ProviderTestSurface;
    provider._pool = new MockConnectionPool() as unknown as sql.ConnectionPool;
    provider.initializeQueueProcessor();
  });

  it('a batch joins the ambient transaction by default and runs on the pool with the option', async () => {
    await provider.BeginTransaction();
    await provider.ExecuteSQLBatch(['SELECT 1 AS a']);
    await provider.ExecuteSQLBatch(['SELECT 2 AS b'], undefined, { ignoreAmbientTransaction: true });
    await provider.CommitTransaction();

    expect(mssqlState.Queries.map(q => q.viaTransaction)).toEqual([true, false]);
  });

  it('a single statement does the same', async () => {
    await provider.BeginTransaction();
    await provider.ExecuteSQL('SELECT 1 AS a', null);
    await provider.ExecuteSQL('SELECT 2 AS b', null, { ignoreAmbientTransaction: true });
    await provider.CommitTransaction();

    expect(mssqlState.Queries.map(q => q.viaTransaction)).toEqual([true, false]);
  });

  it('is not blocked by a doomed ambient transaction — a pool read cannot autocommit anything', async () => {
    await provider.BeginTransaction();
    provider._doomed = true;
    await expect(provider.ExecuteSQLBatch(['SELECT 1 AS a'])).rejects.toThrow(/doomed/);
    await expect(provider.ExecuteSQLBatch(['SELECT 1 AS a'], undefined, { ignoreAmbientTransaction: true })).resolves.toBeDefined();
    expect(mssqlState.Queries.map(q => q.viaTransaction)).toEqual([false]);
    provider._doomed = false;
    await provider.RollbackTransaction();
  });
});
