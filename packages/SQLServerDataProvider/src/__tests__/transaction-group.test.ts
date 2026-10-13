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
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import {
  TransactionItem,
  TransactionResult,
  TransactionVariable,
  UserInfo,
  BaseEntity,
  EntityInfo,
  IEntityDataProvider,
  TransactionGroupProviderError,
} from '@memberjunction/core';
import { SQLServerTransactionGroup } from '../SQLServerTransactionGroup';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
import { TEST_USER, MakeWidgetEntityInfo, MakeSavedWidgetEntity } from './helpers/entity-fixtures';

/**
 * The real provider with the pieces the transaction group reaches through each item's own provider
 * (the entity's ProviderToUse) replaced by spies: row post-processing, SP-name resolution and
 * save-SQL regeneration (variables path).
 */
class StubSQLServerProvider extends SQLServerDataProvider {
  public readonly ProcessSpy = vi.fn(async (rows: Record<string, unknown>[], _entityInfo: EntityInfo, _user?: UserInfo) => rows);
  public readonly SPNameSpy = vi.fn((_entity: BaseEntity, bCreate: boolean) => (bCreate ? 'spCreateWidget' : 'spUpdateWidget'));
  public readonly SaveSQLSpy = vi.fn(async (_entity: BaseEntity, _bCreate: boolean, spName: string, _user: UserInfo) => `-- REGENERATED -- EXEC [dbo].${spName}`);
  public override async ProcessEntityRows(rows: Record<string, unknown>[], entityInfo: EntityInfo, contextUser?: UserInfo): Promise<Record<string, unknown>[]> {
    return this.ProcessSpy(rows, entityInfo, contextUser);
  }
  public override GetCreateUpdateSPName(entity: BaseEntity, bNewRecord: boolean): string {
    return this.SPNameSpy(entity, bNewRecord);
  }
  public override async GetSaveSQL(entity: BaseEntity, bNewRecord: boolean, spName: string, user: UserInfo): Promise<string> {
    return this.SaveSQLSpy(entity, bNewRecord, spName, user);
  }
}

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
  /** The provider every test entity saves through — the group resolves it from each item. */
  let provider: StubSQLServerProvider;

  beforeEach(() => {
    mssqlState.Reset();
    pool = new MockConnectionPool();
    provider = new StubSQLServerProvider();
  });

  it('executes all statements in order inside ONE transaction and commits at the end', async () => {
    const entityInfo = MakeWidgetEntityInfo();
    const entityA = MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider);
    const entityB = MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider);
    const group = new SQLServerTransactionGroup();
    const a = makeItem(entityA, 'Create', 'EXEC [dbo].spCreateWidget @Name=N\'A\'', pool);
    const b = makeItem(entityB, 'Update', 'EXEC [dbo].spUpdateWidget @Name=N\'B\'', pool);
    group.AddTransaction(a.item);
    group.AddTransaction(b.item);
    const rowA = { ID: 'w-a', Name: 'A' };
    const rowB = { ID: 'w-b', Name: 'B' };
    mssqlState.QueueResult({ rows: [rowA] });
    mssqlState.QueueResult({ rows: [rowB] });

    const success = await group.Submit();

    expect(success).toBe(true);
    expect(group.Status).toBe('Complete');
    // Exact connection choreography: begin → statement A → statement B → commit
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'query', 'commit']);
    expect(mssqlState.Queries.map((q) => q.sql)).toEqual([
      'EXEC [dbo].spCreateWidget @Name=N\'A\'',
      'EXEC [dbo].spUpdateWidget @Name=N\'B\'',
    ]);
    // Every statement ran ON the transaction, not on the pool
    expect(mssqlState.Queries.every((q) => q.viaTransaction)).toBe(true);
    // Result rows were post-processed by the provider and delivered to callbacks
    expect(provider.ProcessSpy).toHaveBeenCalledTimes(2);
    expect(a.callback).toHaveBeenCalledWith(rowA, true);
    expect(b.callback).toHaveBeenCalledWith(rowB, true);
  });

  it('binds positional Vars as @p0..@pN and rewrites ? placeholders', async () => {
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider);
    const group = new SQLServerTransactionGroup();
    const { item } = makeItem(entity, 'Update', 'UPDATE Widget SET Name = ? WHERE ID = ?', pool, [
      'Renamed',
      'w-0001',
    ]);
    group.AddTransaction(item);
    mssqlState.QueueResult({ rows: [{ ID: 'w-0001', Name: 'Renamed' }] });

    const success = await group.Submit();

    expect(success).toBe(true);
    expect(mssqlState.Queries).toHaveLength(1);
    expect(mssqlState.Queries[0].sql).toBe('UPDATE Widget SET Name = @p0 WHERE ID = @p1');
    expect(mssqlState.Queries[0].inputs).toEqual([
      { name: 'p0', value: 'Renamed' },
      { name: 'p1', value: 'w-0001' },
    ]);
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'commit']);
  });

  it('refuses, before BEGIN, an item whose record does not save through a SQL Server provider', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined); // Submit() logs the refusal
    // A provider of another kind: anything that is not a SQLServerDataProvider (here, a bare entity-provider double).
    const foreign: IEntityDataProvider = { Config: async () => true, Load: async () => ({}), Save: async () => ({}), Delete: async () => true, GetRecordChanges: async () => [] };
    const group = new SQLServerTransactionGroup();
    const good = makeItem(MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider), 'Update', 'STATEMENT 1', pool);
    const stray = makeItem(MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, foreign), 'Update', 'STATEMENT 2', pool);
    group.AddTransaction(good.item);
    group.AddTransaction(stray.item);

    expect(await group.Submit()).toBe(false);
    expect(mssqlState.EventKinds()).toEqual([]); // no BEGIN, nothing ran
    expect(stray.callback.mock.calls[0][0]).toBeInstanceOf(TransactionGroupProviderError);
    consoleError.mockRestore();
  });

  it('refuses, before BEGIN, a group whose items were queued on different connection pools', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const group = new SQLServerTransactionGroup();
    const a = makeItem(MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider), 'Update', 'STATEMENT 1', pool);
    const b = makeItem(MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider), 'Update', 'STATEMENT 2', new MockConnectionPool());
    group.AddTransaction(a.item);
    group.AddTransaction(b.item);

    expect(await group.Submit()).toBe(false);
    expect(mssqlState.EventKinds()).toEqual([]);
    expect(String(a.callback.mock.calls[0][0])).toMatch(/queued on another connection pool than the rest of the group/);
    consoleError.mockRestore();
  });

  it('rolls back immediately on the first failing statement — remaining statements never run, nothing commits', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined); // Submit() logs the expected failure
    const entityInfo = MakeWidgetEntityInfo();
    const group = new SQLServerTransactionGroup();
    const a = makeItem(MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider), 'Create', 'STATEMENT 1', pool);
    const b = makeItem(MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider), 'Create', 'STATEMENT 2', pool);
    const c = makeItem(MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider), 'Create', 'STATEMENT 3', pool);
    group.AddTransaction(a.item);
    group.AddTransaction(b.item);
    group.AddTransaction(c.item);
    mssqlState.QueueResult({ rows: [{ ID: '1' }] });
    mssqlState.QueueResult({ error: new Error('PK violation on STATEMENT 2') });

    const success = await group.Submit();

    expect(success).toBe(false);
    expect(group.Status).toBe('Failed');
    // begin → stmt1 → stmt2 (fails) → rollback. Statement 3 never executes; commit never happens.
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'query', 'rollback']);
    expect(mssqlState.Queries.map((q) => q.sql)).toEqual(['STATEMENT 1', 'STATEMENT 2']);
    expect(mssqlState.EventKinds()).not.toContain('commit');
    // The item's failure path already rolled back (TransactionGroupRolledBackError); the outer handler
    // must not try again — a second rollback on the finished handle only adds a spurious error.
    expect(consoleError.mock.calls.flat().map(String).join(' ')).not.toMatch(/Failed to rollback/);
    // Submit's failure path reports the error to EVERY item's callback with success=false
    for (const { callback } of [a, b, c]) {
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][1]).toBe(false);
    }
    consoleError.mockRestore();
  });

  it('a save that returns no row fails the whole group: rollback, no commit, Submit false, no sibling success callback', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined); // Submit() logs the expected failure
    const entityInfo = MakeWidgetEntityInfo();
    const group = new SQLServerTransactionGroup();
    const a = makeItem(MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider), 'Update', 'STATEMENT 1', pool);
    const b = makeItem(MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider), 'Update', 'STATEMENT 2', pool);
    const c = makeItem(MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider), 'Update', 'STATEMENT 3', pool);
    group.AddTransaction(a.item);
    group.AddTransaction(b.item);
    group.AddTransaction(c.item);
    mssqlState.QueueResult({ rows: [{ ID: 'w-1' }] });
    mssqlState.QueueResult({ rows: [] }); // succeeded SQL, but no row returned — the record was not persisted

    const success = await group.Submit();

    expect(success).toBe(false);
    expect(group.Status).toBe('Failed');
    // Treated exactly like a statement that threw: rolled back on the failed item, statement 3 never
    // runs, nothing commits — a group that reports Failed never commits.
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'query', 'rollback']);
    expect(mssqlState.Queries.map((q) => q.sql)).toEqual(['STATEMENT 1', 'STATEMENT 2']);
    // No item — not even the sibling whose statement ran first — is reported as a success.
    for (const { callback } of [a, b, c]) {
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][1]).toBe(false);
    }
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('hands a cascading delete item the LAST result set — the record — not a cascaded child row', async () => {
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider);
    const group = new SQLServerTransactionGroup();
    const d = makeItem(entity, 'Delete', 'EXEC [dbo].[spDeleteWidget] @ID=\'w-0001\'', pool);
    group.AddTransaction(d.item);
    mssqlState.QueueResult({
      recordsets: [
        [{ ID: 'child-1', Name: 'Child', ParentID: null }], // cascaded spUpdateChild → base-view row
        [{ ID: 'w-0001' }], // the delete's own keys
      ],
    });

    const success = await group.Submit();

    expect(success).toBe(true);
    expect(d.callback).toHaveBeenCalledWith({ ID: 'w-0001' }, true);
  });

  it('fails a delete item whose row carries NULL keys (nothing deleted) — Submit() false, callback success false', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined); // Submit() logs the expected failure
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider);
    const group = new SQLServerTransactionGroup();
    const d = makeItem(entity, 'Delete', 'EXEC [dbo].[spDeleteWidget] @ID=\'w-0001\'', pool);
    group.AddTransaction(d.item);
    mssqlState.QueueResult({ rows: [{ ID: null }] });

    const success = await group.Submit();

    expect(success).toBe(false);
    expect(group.Status).toBe('Failed');
    // treated exactly like a statement that threw: rolled back, never committed
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'rollback']);
    expect(d.callback).toHaveBeenCalledTimes(1);
    expect(d.callback.mock.calls[0][1]).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('variables: a Define result flows into a later Use item and its instruction is regenerated through the provider', async () => {
    const entityInfo = MakeWidgetEntityInfo();
    const definer = MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider);
    const consumer = MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider);
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
    expect(provider.SPNameSpy).toHaveBeenCalledWith(consumer, true);
    expect(provider.SaveSQLSpy).toHaveBeenCalledTimes(1);
    expect(provider.SaveSQLSpy).toHaveBeenCalledWith(consumer, true, 'spCreateWidget', TEST_USER);
    expect(mssqlState.Queries.map((q) => q.sql)).toEqual([
      'EXEC [dbo].spCreateWidget -- definer',
      '-- REGENERATED -- EXEC [dbo].spCreateWidget',
    ]);
    expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'query', 'commit']);
  });

  it('variables: a Use without a matching Define rolls the transaction back and never commits', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined); // Submit() logs the expected failure
    const entityInfo = MakeWidgetEntityInfo();
    const orphan = MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider);
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
    expect(consoleError.mock.calls.flat().map(String).join(' ')).toContain('NeverDefined');
  });

  it('waits for registered entity preprocessing before touching the connection', async () => {
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider);
    const group = new SQLServerTransactionGroup();
    const { item } = makeItem(entity, 'Update', 'STATEMENT 1', pool);
    group.AddTransaction(item);
    group.RegisterPreprocessing(entity);
    mssqlState.QueueResult({ rows: [{ ID: 'w-0001' }] });

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
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined); // Submit() reports the empty group
    const group = new SQLServerTransactionGroup();

    const success = await group.Submit();

    expect(success).toBe(true);
    expect(group.Status).toBe('Pending');
    expect(mssqlState.EventKinds()).toEqual([]);
    expect(consoleLog.mock.calls.flat().map(String).join(' ')).toContain('No transactions to submit');
  });

  it('guards the state machine: a completed group cannot be resubmitted; a failed group needs the retry flag', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined); // the failed Submit() logs its rollback
    const entityInfo = MakeWidgetEntityInfo();
    const completed = new SQLServerTransactionGroup();
    const okItem = makeItem(MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider), 'Update', 'OK', pool);
    completed.AddTransaction(okItem.item);
    mssqlState.QueueResult({ rows: [{ ID: 'w-0001' }] });
    await completed.Submit();
    await expect(completed.Submit()).rejects.toThrow('TransactionGroup has already been completed');

    const failed = new SQLServerTransactionGroup();
    const badItem = makeItem(MakeSavedWidgetEntity(entityInfo, TEST_USER, undefined, provider), 'Update', 'BAD', pool);
    failed.AddTransaction(badItem.item);
    mssqlState.QueueResult({ error: new Error('deadlock victim') });
    await failed.Submit();
    expect(failed.Status).toBe('Failed');
    await expect(failed.Submit(false)).rejects.toThrow(/cannot be resubmitted/);
    expect(consoleError.mock.calls.flat().map(String).join(' ')).toContain('deadlock victim');
  });

  it('publishes the overall result on TransactionNotifications$', async () => {
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider);
    const group = new SQLServerTransactionGroup();
    const { item } = makeItem(entity, 'Update', 'STATEMENT 1', pool);
    group.AddTransaction(item);
    mssqlState.QueueResult({ rows: [{ ID: 'w-0001' }] });

    const notifications: Array<{ success: boolean; results?: TransactionResult[] }> = [];
    group.TransactionNotifications$.subscribe((n) => notifications.push(n));

    await group.Submit();

    expect(notifications).toHaveLength(1);
    expect(notifications[0].success).toBe(true);
    expect(notifications[0].results).toHaveLength(1);
    expect(notifications[0].results?.[0].Success).toBe(true);
  });
});

describe('SQLServerTransactionGroup.scopeItemVariables', () => {
  it('scopes every name in a comma-separated DECLARE list, not just the first', () => {
    const sql = [
      'DECLARE @ID_h UNIQUEIDENTIFIER,',
      '        @Name_h NVARCHAR(255),',
      '        @Amount_h DECIMAL(18, 4)',
      '',
      "SET @ID_h = 'w-1'",
      "SET @Name_h = N'x'",
      'SET @Amount_h = 1.5',
      '',
      'EXEC [dbo].spCreateWidget @ID=@ID_h,',
      '                @Name=@Name_h,',
      '                @Amount=@Amount_h',
    ].join('\n');
    const out = SQLServerTransactionGroup.scopeItemVariables(sql, 3);
    expect(out).toContain('DECLARE @ID_h_mjb3 UNIQUEIDENTIFIER,');
    expect(out).toContain('@Name_h_mjb3 NVARCHAR(255),');
    expect(out).toContain('@Amount_h_mjb3 DECIMAL(18, 4)'); // the comma inside the type is not a separator
    expect(out).toContain("SET @Name_h_mjb3 = N'x'");
    expect(out).toContain('@Name=@Name_h_mjb3'); // argument VALUE renamed …
    expect(out).not.toMatch(/@Name_mjb3\s*=/); // … argument NAME untouched
    expect(out).not.toMatch(/@(ID|Name|Amount)_h(?!_mjb3)/); // no bare reference survives
  });

  it('ends a declaration list at the next statement and leaves table-variable column lists alone', () => {
    const sql = [
      'DECLARE @T TABLE (ID INT, Name NVARCHAR(50))',
      'DECLARE @n INT = @seed',
      "INSERT INTO @T (ID, Name) VALUES (1, N'a')",
      'SELECT @n = COUNT(*) FROM @T',
    ].join('\n');
    const out = SQLServerTransactionGroup.scopeItemVariables(sql, 0);
    expect(out).toContain('DECLARE @T_mjb0 TABLE (ID INT, Name NVARCHAR(50))');
    expect(out).toContain('DECLARE @n_mjb0 INT = @seed'); // an initializer's right-hand side is not a declaration
    expect(out).toContain('INSERT INTO @T_mjb0 (ID, Name)');
    expect(out).toContain('SELECT @n_mjb0 = COUNT(*) FROM @T_mjb0');
  });
});
