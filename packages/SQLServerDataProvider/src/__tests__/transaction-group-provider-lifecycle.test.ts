/**
 * Provider-scoped SQLServerTransactionGroup lifecycle tests (Item 1.3).
 *
 * Verifies that `SQLServerDataProvider.CreateTransactionGroup()` binds the owning provider
 * instance rather than reading global `Metadata.Provider`, participates in nested savepoints
 * inside an outer `provider.BeginTransaction()`, and defers `RunAfterCommit` tasks registered
 * during item callbacks until the outermost commit settles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import {
  BaseEntity,
  EntityInfo,
  IMetadataProvider,
  Metadata,
  TransactionItem,
  UserInfo,
} from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
import { TEST_USER, makeSavedWidgetEntity, makeWidgetEntityInfo } from './helpers/entity-fixtures';

interface ProviderInternalSurface {
  _pool: MockConnectionPool;
  _datetimeOffsetTestComplete: boolean;
  initializeQueueProcessor(): void;
}

class TestSQLServerProvider extends SQLServerDataProvider {
  public AttachPool(pool: MockConnectionPool): void {
    const surface = this as object as ProviderInternalSurface;
    surface._pool = pool;
    surface._datetimeOffsetTestComplete = true;
    surface.initializeQueueProcessor();
  }

  public QueuePostCommitTask(task: () => void | Promise<void>, label: string): void {
    this.RunAfterCommit(task, label);
  }
}

describe('SQLServerTransactionGroup — provider-scoped transaction lifecycle', () => {
  let pool: MockConnectionPool;
  let requestProvider: TestSQLServerProvider;
  let globalSpyProvider: {
    _sqlLoggingSessions: Map<string, object>;
    ProcessEntityRows: ReturnType<typeof vi.fn>;
  };
  let previousGlobalProvider: IMetadataProvider | undefined;

  beforeEach(() => {
    mssqlState.Reset();
    pool = new MockConnectionPool();
    requestProvider = new TestSQLServerProvider();
    requestProvider.AttachPool(pool);

    globalSpyProvider = {
      _sqlLoggingSessions: new Map<string, object>(),
      ProcessEntityRows: vi.fn(async (rows: Record<string, string>[]) => rows),
    };
    previousGlobalProvider = Metadata.Provider;
    Metadata.Provider = globalSpyProvider as object as IMetadataProvider;
  });

  afterEach(() => {
    Metadata.Provider = previousGlobalProvider as IMetadataProvider;
  });

  function makeGroupItem(
    entityInfo: EntityInfo,
    instruction: string,
    onCallback?: (row: Record<string, string>, success: boolean) => void | Promise<void>,
  ): { entity: BaseEntity; item: TransactionItem; callbackSpy: ReturnType<typeof vi.fn> } {
    const entity = makeSavedWidgetEntity(entityInfo, TEST_USER);
    const callbackSpy = vi.fn(async (row: Record<string, string>, success: boolean) => {
      if (onCallback) {
        await onCallback(row, success);
      }
    });
    const item = new TransactionItem(
      entity,
      'Create',
      instruction,
      null,
      { dataSource: pool, entityName: entityInfo.Name },
      callbackSpy,
    );
    return { entity, item, callbackSpy };
  }

  it('uses the owning per-request provider rather than global Metadata.Provider and defers RunAfterCommit until physical commit', async () => {
    const entityInfo = makeWidgetEntityInfo();
    const requestProcessSpy = vi
      .spyOn(requestProvider, 'ProcessEntityRows')
      .mockImplementation(async (rows: Record<string, string>[], _info: EntityInfo, _user?: UserInfo) => rows);

    const events: string[] = [];
    const tg = await requestProvider.CreateTransactionGroup();
    const { item } = makeGroupItem(entityInfo, "EXEC [dbo].spCreateWidget @Name=N'Scoped'", (_row, ok) => {
      if (ok) {
        events.push(`callback:inTx=${requestProvider.InTransaction}`);
        requestProvider.QueuePostCommitTask(() => {
          events.push(`afterCommit:inTx=${requestProvider.InTransaction}`);
        }, 'post-save-hook');
      }
    });
    tg.AddTransaction(item);
    mssqlState.QueueResult({ rows: [{ ID: 'w-scoped-1', Name: 'Scoped' }] });

    const ok = await tg.Submit();

    expect(ok).toBe(true);
    expect(requestProcessSpy).toHaveBeenCalledTimes(1);
    expect(globalSpyProvider.ProcessEntityRows).not.toHaveBeenCalled();
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'commit']);
    expect(events).toEqual([
      'callback:inTx=true',
      'afterCommit:inTx=false',
    ]);
  });

  it('nests as a savepoint inside an outer provider.BeginTransaction() and promotes RunAfterCommit to the outer commit', async () => {
    const entityInfo = makeWidgetEntityInfo();
    vi.spyOn(requestProvider, 'ProcessEntityRows').mockImplementation(
      async (rows: Record<string, string>[]) => rows,
    );

    const postCommitFired: string[] = [];
    await requestProvider.BeginTransaction();

    // Queue result for SAVE TRANSACTION SavePoint_1 + group statement
    mssqlState.QueueResult({ rows: [] });
    mssqlState.QueueResult({ rows: [{ ID: 'w-nested-1', Name: 'Nested' }] });

    const tg = await requestProvider.CreateTransactionGroup();
    const { item } = makeGroupItem(entityInfo, "EXEC [dbo].spCreateWidget @Name=N'Nested'", (_row, ok) => {
      if (ok) {
        requestProvider.QueuePostCommitTask(() => {
          postCommitFired.push('outer-settled');
        }, 'nested-group-task');
      }
    });
    tg.AddTransaction(item);

    const groupOk = await tg.Submit();
    expect(groupOk).toBe(true);
    // Group settled its inner savepoint frame, NOT the outer physical transaction!
    expect(requestProvider.InTransaction).toBe(true);
    expect(postCommitFired).toEqual([]);
    expect(mssqlState.EventKinds()).not.toContain('commit');

    await requestProvider.CommitTransaction();
    expect(requestProvider.InTransaction).toBe(false);
    expect(postCommitFired).toEqual(['outer-settled']);
    expect(mssqlState.EventKinds()).toContain('commit');
  });

  it('rolls back only its savepoint when a nested TransactionGroup fails, keeping the outer transaction alive and discarding nested RunAfterCommit tasks', async () => {
    const entityInfo = makeWidgetEntityInfo();
    vi.spyOn(requestProvider, 'ProcessEntityRows').mockImplementation(
      async (rows: Record<string, string>[]) => rows,
    );

    const postCommitFired: string[] = [];
    await requestProvider.BeginTransaction();
    requestProvider.QueuePostCommitTask(() => {
      postCommitFired.push('outer-task');
    }, 'outer-task');

    // 1. SAVE TRANSACTION SavePoint_1
    mssqlState.QueueResult({ rows: [] });
    // 2. Group statement fails
    mssqlState.QueueResult({ error: new Error('FK constraint violation inside nested group') });
    // 3. ROLLBACK TRANSACTION SavePoint_1
    mssqlState.QueueResult({ rows: [] });

    const tg = await requestProvider.CreateTransactionGroup();
    const { item } = makeGroupItem(entityInfo, 'EXEC [dbo].spCreateBrokenChild');
    tg.AddTransaction(item);

    const groupOk = await tg.Submit();
    expect(groupOk).toBe(false);
    expect(tg.Status).toBe('Failed');

    // Outer transaction is still alive and can continue executing statements and commit!
    expect(requestProvider.InTransaction).toBe(true);
    expect(mssqlState.Queries.some((q) => q.sql.includes('SAVE TRANSACTION'))).toBe(true);
    expect(mssqlState.Queries.some((q) => q.sql.includes('ROLLBACK TRANSACTION'))).toBe(true);

    await requestProvider.CommitTransaction();
    expect(requestProvider.InTransaction).toBe(false);
    expect(postCommitFired).toEqual(['outer-task']);
  });

  it('throws the descriptive ambient-transaction-ended error when ExecuteOnTransactionHandle is called after the transaction settled', async () => {
    await requestProvider.BeginTransaction();
    const endedHandle = requestProvider.ActiveTransactionHandle!;
    expect(endedHandle).not.toBeNull();
    await requestProvider.CommitTransaction();
    expect(requestProvider.ActiveTransactionHandle).toBeNull();

    await expect(
      requestProvider.ExecuteOnTransactionHandle(endedHandle, 'late query', async () => ({
        recordsets: [],
        recordset: [],
        output: {},
        rowsAffected: [0],
      })),
    ).rejects.toThrow('The ambient transaction ended before this TransactionGroup request ran');
  });
});
