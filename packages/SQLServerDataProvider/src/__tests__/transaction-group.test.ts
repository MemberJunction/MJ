/**
 * SQLServerTransactionGroup behavioral tests — driving the REAL transaction group
 * (HandleSubmit via the public TransactionGroupBase.Submit()) against the mocked
 * mssql boundary.
 *
 * Covered: statement ordering inside one transaction, positional Vars binding
 * (? → @pN), transaction variables (a Define result feeding a later Use item,
 * including instruction regeneration through the provider), the failure path
 * (immediate rollback, remaining statements skipped, NOTHING commits), the
 * empty-recordset "failed item but committed group" semantics, preprocessing
 * waits, and the Submit state machine guards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import {
  Metadata,
  TransactionItem,
  TransactionResult,
  TransactionVariable,
  UserInfo,
  BaseEntity,
  IMetadataProvider,
} from '@memberjunction/core';
import { SQLServerTransactionGroup } from '../SQLServerTransactionGroup';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
import { TEST_USER, makeWidgetEntityInfo, makeSavedWidgetEntity } from './helpers/entity-fixtures';

/**
 * Minimal stub of the pieces of SQLServerDataProvider the transaction group reaches
 * through the global Metadata.Provider: row post-processing, SP-name resolution,
 * save-SQL regeneration (variables path), and the SQL-logging session map read by
 * GenericDatabaseProvider.LogSQLStatement.
 */
function makeProviderStub() {
  return {
    _sqlLoggingSessions: new Map<string, unknown>(),
    ProcessEntityRows: vi.fn(
      async (rows: Record<string, unknown>[], _entityInfo: unknown, _user: unknown) => rows,
    ),
    GetCreateUpdateSPName: vi.fn((_entity: BaseEntity, bCreate: boolean) =>
      bCreate ? 'spCreateWidget' : 'spUpdateWidget',
    ),
    GetSaveSQL: vi.fn(
      async (_entity: BaseEntity, _bCreate: boolean, spName: string, _user: UserInfo) =>
        `-- REGENERATED -- EXEC [dbo].${spName}`,
    ),
  };
}
type ProviderStub = ReturnType<typeof makeProviderStub>;

function makeItem(
  entity: BaseEntity,
  operationType: 'Create' | 'Update' | 'Delete',
  instruction: string,
  pool: MockConnectionPool,
  vars: unknown[] | null = null,
): { item: TransactionItem; callback: ReturnType<typeof vi.fn> } {
  const callback = vi.fn();
  const item = new TransactionItem(entity, operationType, instruction, vars, {
    dataSource: pool,
    entityName: entity.EntityInfo.Name,
  }, callback);
  return { item, callback };
}

describe('SQLServerTransactionGroup.Submit', () => {
  let pool: MockConnectionPool;
  let providerStub: ProviderStub;
  let previousProvider: IMetadataProvider | undefined;

  beforeEach(() => {
    mssqlState.Reset();
    pool = new MockConnectionPool();
    providerStub = makeProviderStub();
    previousProvider = Metadata.Provider;
    Metadata.Provider = providerStub as unknown as IMetadataProvider;
  });

  afterEach(() => {
    Metadata.Provider = previousProvider as IMetadataProvider;
  });

  const SENTINEL = '__mj_batch_item';
  const sentinel = (i: number) => [{ [SENTINEL]: i }];

  it('sends the whole group in ONE round trip inside ONE transaction, and maps each result back to its item', async () => {
    // The group has no variable dependencies, so nothing here needs anything else to have run
    // first — the condition under which N statements can travel as one. The SQL is unchanged:
    // same generated procedures, same Record Changes writes, same save events. Only trips change.
    const entityInfo = makeWidgetEntityInfo();
    const entityA = makeSavedWidgetEntity(entityInfo, TEST_USER);
    const entityB = makeSavedWidgetEntity(entityInfo, TEST_USER);
    const group = new SQLServerTransactionGroup();
    const a = makeItem(entityA, 'Create', 'EXEC [dbo].spCreateWidget @Name=N\'A\'', pool);
    const b = makeItem(entityB, 'Update', 'EXEC [dbo].spUpdateWidget @Name=N\'B\'', pool);
    group.AddTransaction(a.item);
    group.AddTransaction(b.item);
    const rowA = { ID: 'w-a', Name: 'A' };
    const rowB = { ID: 'w-b', Name: 'B' };
    mssqlState.QueueResult({ recordsets: [sentinel(0), [rowA], sentinel(1), [rowB]] });

    const success = await group.Submit();

    expect(success).toBe(true);
    expect(group.Status).toBe('Complete');
    // begin → ONE query → commit. Previously this was one query PER item.
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'commit']);
    expect(mssqlState.Queries).toHaveLength(1);
    // Both statements are present, in order, each opened by its own sentinel.
    const sent = mssqlState.Queries[0].sql;
    expect(sent).toContain('EXEC [dbo].spCreateWidget');
    expect(sent).toContain('EXEC [dbo].spUpdateWidget');
    expect(sent.indexOf('spCreateWidget')).toBeLessThan(sent.indexOf('spUpdateWidget'));
    expect(sent).toContain(`SELECT 0 AS [${SENTINEL}]`);
    expect(sent).toContain(`SELECT 1 AS [${SENTINEL}]`);
    expect(mssqlState.Queries[0].viaTransaction).toBe(true);
    // Each item still receives ITS OWN row, post-processed by the provider.
    expect(providerStub.ProcessEntityRows).toHaveBeenCalledTimes(2);
    expect(a.callback).toHaveBeenCalledWith(rowA, true);
    expect(b.callback).toHaveBeenCalledWith(rowB, true);
  });

  it('binds positional Vars as @p0..@pN and rewrites ? placeholders', async () => {
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    const group = new SQLServerTransactionGroup();
    const { item } = makeItem(entity, 'Update', 'UPDATE Widget SET Name = ? WHERE ID = ?', pool, [
      'Renamed',
      'w-0001',
    ]);
    group.AddTransaction(item);
    mssqlState.QueueResult({ recordsets: [sentinel(0), [{ ID: 'w-0001', Name: 'Renamed' }]] });

    const success = await group.Submit();

    expect(success).toBe(true);
    expect(mssqlState.Queries).toHaveLength(1);
    expect(mssqlState.Queries[0].sql).toContain('UPDATE Widget SET Name = @p0 WHERE ID = @p1');
    expect(mssqlState.Queries[0].inputs).toEqual([
      { name: 'p0', value: 'Renamed' },
      { name: 'p1', value: 'w-0001' },
    ]);
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'commit']);
  });

  it('numbers parameters ACROSS items, so two items cannot bind each other values', async () => {
    // One request carries ONE parameter namespace. Two items that each rendered `?` would both
    // want @p0 — the second silently overwriting the first — unless numbering is global.
    const entityInfo = makeWidgetEntityInfo();
    const group = new SQLServerTransactionGroup();
    const a = makeItem(makeSavedWidgetEntity(entityInfo, TEST_USER), 'Update', 'UPDATE Widget SET Name = ? WHERE ID = ?', pool, ['A', 'w-1']);
    const b = makeItem(makeSavedWidgetEntity(entityInfo, TEST_USER), 'Update', 'UPDATE Widget SET Name = ? WHERE ID = ?', pool, ['B', 'w-2']);
    group.AddTransaction(a.item);
    group.AddTransaction(b.item);
    mssqlState.QueueResult({ recordsets: [sentinel(0), [{ ID: 'w-1' }], sentinel(1), [{ ID: 'w-2' }]] });

    await group.Submit();

    const sent = mssqlState.Queries[0].sql;
    expect(sent).toContain('SET Name = @p0 WHERE ID = @p1');
    expect(sent).toContain('SET Name = @p2 WHERE ID = @p3');
    expect(mssqlState.Queries[0].inputs).toEqual([
      { name: 'p0', value: 'A' },
      { name: 'p1', value: 'w-1' },
      { name: 'p2', value: 'B' },
      { name: 'p3', value: 'w-2' },
    ]);
  });

  it('a failure anywhere in the batch rolls the whole thing back and commits nothing', async () => {
    // SEMANTIC NOTE. Serially, the client stopped SENDING after the first failure, so later
    // statements were never transmitted. Batched, they travel together and the server may reach
    // some of them before the error. The guarantee that matters is unchanged and is what this
    // asserts: the transaction rolls back, NOTHING commits, and every item reports failure.
    const entityInfo = makeWidgetEntityInfo();
    const group = new SQLServerTransactionGroup();
    const a = makeItem(makeSavedWidgetEntity(entityInfo, TEST_USER), 'Create', 'STATEMENT 1', pool);
    const b = makeItem(makeSavedWidgetEntity(entityInfo, TEST_USER), 'Create', 'STATEMENT 2', pool);
    const c = makeItem(makeSavedWidgetEntity(entityInfo, TEST_USER), 'Create', 'STATEMENT 3', pool);
    group.AddTransaction(a.item);
    group.AddTransaction(b.item);
    group.AddTransaction(c.item);
    mssqlState.QueueResult({ error: new Error('PK violation on STATEMENT 2') });

    const success = await group.Submit();

    expect(success).toBe(false);
    expect(group.Status).toBe('Failed');
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'rollback']);
    expect(mssqlState.EventKinds()).not.toContain('commit');
    for (const { callback } of [a, b, c]) {
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][1]).toBe(false);
    }
  });

  it('treats an item that returned no rows as failed, while the batch still commits', async () => {
    // No exception was thrown, so the transaction still commits — only the group RESULT reflects
    // the failed item. Load-bearing behaviour, preserved. The item that returned nothing emits no
    // result set at all, which is exactly why results are split by sentinel rather than zipped.
    const entityInfo = makeWidgetEntityInfo();
    const group = new SQLServerTransactionGroup();
    const a = makeItem(makeSavedWidgetEntity(entityInfo, TEST_USER), 'Update', 'STATEMENT 1', pool);
    const b = makeItem(makeSavedWidgetEntity(entityInfo, TEST_USER), 'Update', 'STATEMENT 2', pool);
    group.AddTransaction(a.item);
    group.AddTransaction(b.item);
    mssqlState.QueueResult({ recordsets: [sentinel(0), [{ ID: 'w-1' }], sentinel(1)] });

    const success = await group.Submit();

    expect(success).toBe(false);
    expect(group.Status).toBe('Failed');
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'commit']);
    expect(a.callback).toHaveBeenCalledWith({ ID: 'w-1' }, true);
    expect(b.callback.mock.calls[0][1]).toBeFalsy();
  });

  it('variables: a Define result flows into a later Use item and its instruction is regenerated through the provider', async () => {
    const entityInfo = makeWidgetEntityInfo();
    const definer = makeSavedWidgetEntity(entityInfo, TEST_USER);
    const consumer = makeSavedWidgetEntity(entityInfo, TEST_USER);
    const group = new SQLServerTransactionGroup();
    const a = makeItem(definer, 'Create', 'EXEC [dbo].spCreateWidget -- definer', pool);
    const b = makeItem(consumer, 'Create', 'EXEC [dbo].spCreateWidget -- consumer', pool);
    group.AddTransaction(a.item);
    group.AddTransaction(b.item);
    // Define 'NewWidgetID' from the definer's ID; Use it as the consumer's ExternalID
    group.AddVariable(new TransactionVariable('NewWidgetID', definer, 'ID', 'Define'));
    group.AddVariable(new TransactionVariable('NewWidgetID', consumer, 'ExternalID', 'Use'));
    mssqlState.QueueResult({ rows: [{ ID: 'w-new-1', Name: 'Definer' }] });
    mssqlState.QueueResult({ rows: [{ ID: 'w-new-2', Name: 'Consumer' }] });

    const success = await group.Submit();

    expect(success).toBe(true);
    // The Define value (from the FIRST statement's result row) landed on the consumer entity
    expect(consumer.Get('ExternalID')).toBe('w-new-1');
    // Because a variable was set, the consumer's instruction was REGENERATED via the provider
    expect(providerStub.GetCreateUpdateSPName).toHaveBeenCalledWith(consumer, true);
    expect(providerStub.GetSaveSQL).toHaveBeenCalledTimes(1);
    expect(providerStub.GetSaveSQL).toHaveBeenCalledWith(consumer, true, 'spCreateWidget', TEST_USER);
    expect(mssqlState.Queries.map((q) => q.sql)).toEqual([
      'EXEC [dbo].spCreateWidget -- definer',
      '-- REGENERATED -- EXEC [dbo].spCreateWidget',
    ]);
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'query', 'commit']);
  });

  it('variables: a Use without a matching Define rolls the transaction back and never commits', async () => {
    const entityInfo = makeWidgetEntityInfo();
    const orphan = makeSavedWidgetEntity(entityInfo, TEST_USER);
    const group = new SQLServerTransactionGroup();
    const a = makeItem(orphan, 'Create', 'EXEC [dbo].spCreateWidget -- orphan', pool);
    group.AddTransaction(a.item);
    group.AddVariable(new TransactionVariable('NeverDefined', orphan, 'ExternalID', 'Use'));

    const success = await group.Submit();

    expect(success).toBe(false);
    expect(group.Status).toBe('Failed');
    // The variable resolution failure happens BEFORE the statement executes
    expect(mssqlState.EventKinds()).toEqual(['begin', 'rollback']);
    expect(mssqlState.Queries).toHaveLength(0);
    expect(a.callback.mock.calls[0][1]).toBe(false);
  });

  it('waits for registered entity preprocessing before touching the connection', async () => {
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    const group = new SQLServerTransactionGroup();
    const { item } = makeItem(entity, 'Update', 'STATEMENT 1', pool);
    group.AddTransaction(item);
    group.RegisterPreprocessing(entity);
    mssqlState.QueueResult({ recordsets: [sentinel(0), [{ ID: 'w-0001' }]] });

    const submitPromise = group.Submit();
    // Give the event loop a chance — Submit must be parked on preprocessing
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mssqlState.EventKinds()).toEqual([]);
    expect(group.PreprocessingComplete()).toBe(false);

    // Entity signals its async preprocessing is done → the group proceeds
    entity.RaiseReadyForTransaction();
    const success = await submitPromise;

    expect(success).toBe(true);
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'commit']);
  });

  it('returns true and stays Pending when there are no transactions — the connection is never touched', async () => {
    const group = new SQLServerTransactionGroup();

    const success = await group.Submit();

    expect(success).toBe(true);
    expect(group.Status).toBe('Pending');
    expect(mssqlState.EventKinds()).toEqual([]);
  });

  it('guards the state machine: a completed group cannot be resubmitted; a failed group needs the retry flag', async () => {
    const entityInfo = makeWidgetEntityInfo();
    const completed = new SQLServerTransactionGroup();
    const okItem = makeItem(makeSavedWidgetEntity(entityInfo, TEST_USER), 'Update', 'OK', pool);
    completed.AddTransaction(okItem.item);
    mssqlState.QueueResult({ recordsets: [sentinel(0), [{ ID: 'w-0001' }]] });
    await completed.Submit();
    await expect(completed.Submit()).rejects.toThrow('TransactionGroup has already been completed');

    const failed = new SQLServerTransactionGroup();
    const badItem = makeItem(makeSavedWidgetEntity(entityInfo, TEST_USER), 'Update', 'BAD', pool);
    failed.AddTransaction(badItem.item);
    mssqlState.QueueResult({ error: new Error('deadlock victim') });
    await failed.Submit();
    expect(failed.Status).toBe('Failed');
    await expect(failed.Submit(false)).rejects.toThrow(/cannot be resubmitted/);
  });

  it('publishes the overall result on TransactionNotifications$', async () => {
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    const group = new SQLServerTransactionGroup();
    const { item } = makeItem(entity, 'Update', 'STATEMENT 1', pool);
    group.AddTransaction(item);
    mssqlState.QueueResult({ recordsets: [sentinel(0), [{ ID: 'w-0001' }]] });

    const notifications: Array<{ success: boolean; results?: TransactionResult[] }> = [];
    group.TransactionNotifications$.subscribe((n) => notifications.push(n));

    await group.Submit();

    expect(notifications).toHaveLength(1);
    expect(notifications[0].success).toBe(true);
    expect(notifications[0].results).toHaveLength(1);
    expect(notifications[0].results?.[0].Success).toBe(true);
  });
});
