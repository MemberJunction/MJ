import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sql from 'mssql';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool, MockTransaction } from './helpers/mock-mssql';

/**
 * #4447 — commit/rollback must not race a transactional query still executing on the handle.
 *
 * Every transactional query is serialized through the instance SQL queue. The code these tests were
 * written against had commit and rollback bypass it and approximated "queue drained" by polling a
 * private mssql field for 2s (#4448 replaced that with a drain; #4454 then routed commit and rollback
 * through the queue itself — see transaction-commit-through-queue.test.ts). The old code polled,
 * gave up silently, and committed anyway — `Can't commit transaction. There is a request in
 * progress.` — then nulled the handle in a `finally`, so the base class's abandon had nothing to
 * roll back and the caller's own rollback reported 'No active transaction to rollback'. That was
 * roughly one in five integration runs, inside `mj sync push`.
 *
 * These drive the real provider against the mocked mssql module: no database, and the assertions
 * are on connection ORDERING rather than timing, so they separate old from new behavior
 * deterministically.
 */

/** Structural view of the provider's private surface exercised here. */
interface ProviderTestSurface {
  _pool: sql.ConnectionPool;
  _transaction: sql.Transaction | null;
  initializeQueueProcessor(): void;
  _internalExecuteSQLInstance(
    query: string,
    parameters: unknown,
    context: { pool: sql.ConnectionPool; transaction?: sql.Transaction | null }
  ): Promise<unknown>;
  waitForActiveRequest(timeoutMs?: number): Promise<void>;
  _activeRequestWaitMs: number;
  BeginTransaction(): Promise<void>;
  CommitTransaction(): Promise<void>;
  RollbackTransaction(): Promise<void>;
}

/** mssql keeps the in-flight request on a private field of the transaction; mirror it for the bypass test. */
type TransactionWithActiveRequest = sql.Transaction & { _activeRequest?: sql.Request | null };

describe('SQLServerDataProvider - transaction commit/rollback vs the instance SQL queue (#4447)', () => {
  let pool: MockConnectionPool;
  let provider: ProviderTestSurface;

  beforeEach(() => {
    mssqlState.Reset();
    pool = new MockConnectionPool();
    provider = new SQLServerDataProvider() as unknown as ProviderTestSurface;
    provider._pool = pool as unknown as sql.ConnectionPool;
    provider.initializeQueueProcessor();
  });

  it('commits only after every queued transactional query has finished', async () => {
    await provider.BeginTransaction();
    const context = { pool: provider._pool, transaction: provider._transaction };

    // Enqueue WITHOUT awaiting: the queue is serial and async, so both are still pending when
    // commit is requested. The old code committed first: begin, commit, query, query.
    const first = provider._internalExecuteSQLInstance('SELECT 1 AS a', null, context);
    const second = provider._internalExecuteSQLInstance('SELECT 2 AS b', null, context);

    await provider.CommitTransaction();

    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'query', 'commit']);
    await Promise.all([first, second]);
    expect(provider._transaction).toBeNull();
  });

  it('rolls the doomed handle back when commit fails, instead of leaking it', async () => {
    await provider.BeginTransaction();
    const tx = provider._transaction as unknown as MockTransaction;
    tx.commit = async () => {
      throw Object.assign(new Error("Can't commit transaction. There is a request in progress."), { code: 'EREQINPROG' });
    };

    await expect(provider.CommitTransaction()).rejects.toThrow(/request in progress/);

    // The base class's abandon must find the handle and roll it back. The old code nulled it in a
    // `finally` first, so this was ['begin'] and the server-side transaction stayed open.
    expect(mssqlState.EventKinds()).toEqual(['begin', 'rollback']);
    expect(provider._transaction).toBeNull();
  });

  it('treats a rollback after a failed commit as already done, not as a second error', async () => {
    await provider.BeginTransaction();
    const tx = provider._transaction as unknown as MockTransaction;
    tx.commit = async () => {
      throw new Error('deadlock victim');
    };
    await expect(provider.CommitTransaction()).rejects.toThrow('deadlock victim');

    // A caller's catch block rolls back defensively. The old code threw
    // 'No active transaction to rollback' here, masking the real error.
    await expect(provider.RollbackTransaction()).resolves.toBeUndefined();
    expect(mssqlState.EventKinds()).toEqual(['begin', 'rollback']);

    // And the flag does not outlive the failure: a fresh transaction behaves normally.
    await provider.BeginTransaction();
    await provider.CommitTransaction();
    expect(mssqlState.EventKinds()).toEqual(['begin', 'rollback', 'begin', 'commit']);
  });

  it('fails loudly when a request bypassed the queue, instead of timing out silently', async () => {
    await provider.BeginTransaction();
    const tx = provider._transaction as TransactionWithActiveRequest;
    tx._activeRequest = new sql.Request(provider._transaction as sql.Transaction);

    // The old code logged, `break`-ed, and returned normally; the caller then committed into a
    // guaranteed 'request in progress'. The short budget keeps the test fast.
    await expect(provider.waitForActiveRequest(25)).rejects.toThrow(/did not go through the instance SQL queue/);

    tx._activeRequest = null;
    await provider.RollbackTransaction();
    expect(mssqlState.EventKinds()).toEqual(['begin', 'rollback']);
  });
  it('surfaces a bypassed request through the commit path itself, and keeps the handle for abandon', async () => {
    await provider.BeginTransaction();
    const tx = provider._transaction as TransactionWithActiveRequest;
    tx._activeRequest = new sql.Request(provider._transaction as sql.Transaction);
    provider._activeRequestWaitMs = 25;

    // End to end through CommitTransaction, not the wait helper in isolation: the drain has nothing
    // to wait for, the guard trips, and the message names the real cause.
    await expect(provider.CommitTransaction()).rejects.toThrow(/did not go through the instance SQL queue/);

    // The handle survived the failure, so the base class's abandon found it and rolled it back.
    // (Real mssql would reject that rollback too while the request is in flight; the mock cannot
    // model an in-flight request, so what this pins is the provider-side contract: the handle
    // reaches abandon instead of being nulled first.)
    expect(mssqlState.EventKinds()).toEqual(['begin', 'rollback']);
    expect(provider._transaction).toBeNull();
  });

});
