/**
 * Save/Delete data-path tests — driving the REAL SQLServerDataProvider through the
 * full DatabaseProviderBase.Save()/Delete() orchestration with REAL EntityInfo /
 * BaseEntity fixtures, capturing the stored-procedure invocation the provider
 * constructs at the mocked mssql request boundary.
 *
 * Real code under test: Save()/Delete() orchestration, GenerateSaveSQL (generic
 * layer) + the SQL Server save grammar (CoerceSaveFieldValue, RenderSaveCallBinding,
 * WrapSaveCallForResult, WrapSaveCallWithRecordChange), GetCreateUpdateSPName,
 * GenerateDeleteSQL/GetDeleteSQLWithDetails, ValidateDeleteResult, and the
 * ExecuteSQL → executeSQLCore → mssql.Request pipeline.
 *
 * Only mocked: the mssql module and the entity-action/AI-action engines (no-op'd via
 * a protected-hook override so the hermetic test never reaches those subsystems).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import type { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import { EntitySaveOptions, EntityDeleteOptions, TransactionVariable } from '@memberjunction/core';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { SQLServerTransactionGroup } from '../SQLServerTransactionGroup';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
import {
  TEST_USER,
  MakeWidgetEntityInfo,
  MakeRecordChangesEntityInfo,
  MakeSavedWidgetEntity,
  MakeNewWidgetEntity,
  SavedWidgetRow,
} from './helpers/entity-fixtures';

interface ProviderPrivateSurface {
  _pool: MockConnectionPool;
  _datetimeOffsetTestComplete: boolean;
  _needsDatetimeOffsetAdjustment: boolean;
}

class SaveDeleteTestProvider extends SQLServerDataProvider {
  public EntityActionInvocations: Array<{ BaseType: string; Before: boolean }> = [];
  private testEntities: EntityInfo[] = [];

  public override get Entities(): EntityInfo[] {
    return this.testEntities;
  }

  // The record-change wrappers resolve the core schema from ConfigData, which only
  // exists after a full Config() (metadata load) — pin it for the hermetic harness.
  public override get MJCoreSchemaName(): string {
    return '__mj';
  }

  public SetTestEntities(entities: EntityInfo[]): void {
    this.testEntities = entities;
  }

  public AttachPool(pool: MockConnectionPool): void {
    const surface = this as unknown as ProviderPrivateSurface;
    surface._pool = pool;
    surface._datetimeOffsetTestComplete = true;
    surface._needsDatetimeOffsetAdjustment = false;
  }

  // Entity actions / AI actions are separate subsystems (EntityActionEngineServer,
  // AIEngine) — no-op them so Save()/Delete() orchestration runs hermetically while
  // still recording that the hooks fired at the right times.
  protected override async HandleEntityActions(
    _entity: BaseEntity,
    baseType: 'save' | 'delete' | 'validate',
    before: boolean,
  ): Promise<never[]> {
    this.EntityActionInvocations.push({ BaseType: baseType, Before: before });
    return [];
  }

  protected override async HandleEntityAIActions(): Promise<void> {
    // no-op — AI engine not under test
  }

  /** Exposes the delete SQL the provider would run, for the rendering guards. */
  public DeleteSQLForTest(entity: BaseEntity, user: UserInfo): string {
    return this.GenerateDeleteSQL(entity, user).fullSQL;
  }

  /** Exposes the save SQL pair (executed fullSQL, logged simpleSQL) for the replay-guard tests. */
  public async SaveSQLForTest(entity: BaseEntity, isNew: boolean, user: UserInfo, options = new EntitySaveOptions()) {
    return this.GenerateSaveSQL(entity, isNew, user, options);
  }
}

function makeProvider(): SaveDeleteTestProvider {
  const provider = new SaveDeleteTestProvider();
  provider.AttachPool(new MockConnectionPool());
  return provider;
}

/** Extracts the PK-hash variable suffix RenderSaveCallBinding appended (e.g. '_a1b2c3d4e5f6' or '_a1b2c3d4e5f6_2'). */
function extractSuffix(sql: string, codeName: string): string {
  const match = new RegExp(`@${codeName}(_[0-9a-f]{12}(?:_[0-9]+)?)`).exec(sql);
  expect(match, `expected a suffixed @${codeName} variable in:\n${sql}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

describe('SQLServerDataProvider save path (real Save() → GenerateSaveSQL → mssql request)', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  it('CREATE: emits DECLARE/SET/EXEC spCreateWidget with correctly typed, escaped, coerced parameters', async () => {
    const provider = makeProvider();
    const entityInfo = MakeWidgetEntityInfo();
    const entity = MakeNewWidgetEntity(entityInfo, TEST_USER);
    entity.Set('Name', "Widget's One");
    entity.Set('Description', 'A test widget');
    entity.Set('IsActive', true);
    entity.Set('LaunchedAt', new Date('2025-04-05T12:00:00.000Z'));
    entity.Set('ExternalID', 'newid()'); // function literal → must be skipped so the DB default fires

    const returnedRow = { ...SavedWidgetRow(), Name: "Widget's One" };
    mssqlState.QueueResult({ rows: [returnedRow] });

    const result = await provider.Save(entity, TEST_USER, new EntitySaveOptions());

    expect(mssqlState.Queries).toHaveLength(1);
    const sql = mssqlState.Queries[0].sql;
    const sfx = extractSuffix(sql, 'Name');

    // Proc name derived from BaseTableCodeName (spCreate is null in metadata)
    expect(sql).toContain(`EXEC [dbo].spCreateWidget `);

    // DECLARE block: typed from real EntityFieldInfo.SQLFullType (uppercased)
    expect(sql).toContain(`@Name${sfx} NVARCHAR(100)`);
    expect(sql).toContain(`@Description${sfx} NVARCHAR(MAX)`);
    expect(sql).toContain(`@IsActive${sfx} BIT`);
    expect(sql).toContain(`@Quantity${sfx} INT`);
    expect(sql).toContain(`@LaunchedAt${sfx} DATETIMEOFFSET`);

    // SET block: string escaping + N prefix, boolean → 1, datetimeoffset → ISO string
    expect(sql).toContain(`SET @Name${sfx} = N'Widget''s One'`);
    expect(sql).toContain(`SET @IsActive${sfx} = 1`);
    expect(sql).toContain(`SET @LaunchedAt${sfx} = '2025-04-05T12:00:00.000Z'`);

    // Null nullable field: declared and passed, but never SET — plus its _Clear companion
    expect(sql).not.toContain(`SET @Quantity${sfx}`);
    expect(sql).toContain(`@Quantity=@Quantity${sfx}`);
    expect(sql).toContain('@Quantity_Clear=1');

    // EXEC args reference the suffixed variables
    expect(sql).toContain(`@Name=@Name${sfx}`);
    expect(sql).toContain(`@IsActive=@IsActive${sfx}`);

    // NewRecord() client-generates a uniqueidentifier PK, so the create binds @ID
    // with a real GUID literal (the DB default never needs to fire here)
    expect(sql).toContain(`@ID=@ID${sfx}`);
    expect(sql).toMatch(new RegExp(`SET @ID${sfx} = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'`));
    // Function-literal uniqueidentifier is skipped entirely
    expect(sql).not.toContain('@ExternalID');
    // Special date fields and virtual fields never appear as SP parameters
    expect(sql).not.toContain('@__mj_CreatedAt');
    expect(sql).not.toContain('@__mj_UpdatedAt');
    expect(sql).not.toContain('@CategoryName');

    // Save() returns the row the proc produced (via the mocked recordset)
    expect(result).toEqual(returnedRow);
  });

  it('CREATE: passes an explicitly assigned PK through to the proc', async () => {
    const provider = makeProvider();
    const entity = MakeNewWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    entity.Set('ID', 'w-9999');
    entity.Set('Name', 'Pre-keyed');
    entity.Set('IsActive', false);
    mssqlState.QueueResult({ rows: [{ ...SavedWidgetRow(), ID: 'w-9999', Name: 'Pre-keyed' }] });

    await provider.Save(entity, TEST_USER, new EntitySaveOptions());

    const sql = mssqlState.Queries[0].sql;
    const sfx = extractSuffix(sql, 'ID');
    expect(sql).toContain(`@ID${sfx} UNIQUEIDENTIFIER`);
    expect(sql).toContain(`SET @ID${sfx} = 'w-9999'`);
    expect(sql).toContain(`@ID=@ID${sfx}`);
    expect(sql).toContain(`SET @IsActive${extractSuffix(sql, 'IsActive')} = 0`);
  });

  it('UPDATE: emits EXEC spUpdateWidget with the PK tail-appended from the loaded entity', async () => {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    expect(entity.IsSaved).toBe(true);
    entity.Set('Name', 'Renamed Widget');

    const updatedRow = { ...SavedWidgetRow(), Name: 'Renamed Widget' };
    mssqlState.QueueResult({ rows: [updatedRow] });

    const result = await provider.Save(entity, TEST_USER, new EntitySaveOptions());

    expect(mssqlState.Queries).toHaveLength(1);
    const sql = mssqlState.Queries[0].sql;
    const sfx = extractSuffix(sql, 'Name');

    expect(sql).toContain('EXEC [dbo].spUpdateWidget ');
    expect(sql).not.toContain('spCreateWidget');
    expect(sql).toContain(`SET @Name${sfx} = N'Renamed Widget'`);

    // PK is tail-appended by RenderSaveCallBinding from entity.PrimaryKey.KeyValuePairs
    expect(sql).toContain(`@ID${sfx} UNIQUEIDENTIFIER`);
    expect(sql).toContain(`SET @ID${sfx} = 'w-0001'`);
    expect(sql).toContain(`@ID=@ID${sfx}`);

    // Nullable field that is null on update still gets its _Clear companion
    expect(sql).toContain('@ExternalID_Clear=1');

    expect(result).toEqual(updatedRow);

    // Hook ordering: validate hook fired via the (no-op'd) entity-action seam
    expect(provider.EntityActionInvocations).toContainEqual({ BaseType: 'validate', Before: false });
  });

  it('CREATE with TrackRecordChanges: wraps the proc call in the @ResultTable + spCreateRecordChange_Internal capture', async () => {
    const provider = makeProvider();
    provider.SetTestEntities([MakeRecordChangesEntityInfo()]);
    const entityInfo = MakeWidgetEntityInfo({ trackRecordChanges: true });
    const entity = MakeNewWidgetEntity(entityInfo, TEST_USER);
    entity.Set('Name', 'Tracked Widget');
    entity.Set('IsActive', true);
    mssqlState.QueueResult({ rows: [{ ...SavedWidgetRow(), Name: 'Tracked Widget' }] });

    await provider.Save(entity, TEST_USER, new EntitySaveOptions());

    expect(mssqlState.Queries).toHaveLength(1);
    const sql = mssqlState.Queries[0].sql;

    // Result-capture table declared from the entity's real field metadata
    expect(sql).toContain('DECLARE @ResultTable TABLE');
    expect(sql).toContain('[ID] uniqueidentifier NOT NULL');
    expect(sql).toContain('[Name] nvarchar(100) NOT NULL');
    expect(sql).toContain('[CategoryName] nvarchar(100) NULL'); // virtual → NULL in capture table

    // Positional capture of the proc's SELECT * output
    expect(sql).toContain('INSERT INTO @ResultTable');
    expect(sql).toContain('EXEC [dbo].spCreateWidget');

    // Composite-key-safe @ID extraction + inline record-change EXEC
    expect(sql).toContain('DECLARE @ID NVARCHAR(MAX)');
    expect(sql).toContain('DECLARE @ResultChangesTable TABLE');
    expect(sql).toContain('[RecordID] nvarchar(750) NOT NULL'); // record-changes entity columns
    expect(sql).toContain('spCreateRecordChange_Internal');
    expect(sql).toContain(`@EntityName='Widgets'`);
    expect(sql).toContain(`@UserID='${TEST_USER.ID}'`);
    expect(sql).toContain(`@Type='Create'`);

    // Final result projection back to the caller
    expect(sql).toContain('SELECT * FROM @ResultTable');
  });

  it('CREATE: throws when the proc returns no rows (create must produce a record)', async () => {
    const provider = makeProvider();
    const entity = MakeNewWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    entity.Set('Name', 'Ghost');
    entity.Set('IsActive', true);
    mssqlState.QueueResult({ rows: [] });

    await expect(provider.Save(entity, TEST_USER, new EntitySaveOptions())).rejects.toThrow(
      /Error creating new record, no rows returned/,
    );
  });
});

describe('SQLServerDataProvider replay form of a create (Metadata_Sync recordings, #4503)', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  it('CREATE: the logged simpleSQL is guarded on the PK and falls back to spUpdate; the executed fullSQL is the plain create', async () => {
    const provider = makeProvider();
    const entity = MakeNewWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    entity.Set('ID', '82DFF26B-2ABB-4A69-8718-1FE550B60816');
    entity.Set('Name', 'Azure Blob Storage');
    entity.Set('IsActive', true);

    const { fullSQL, simpleSQL } = await provider.SaveSQLForTest(entity, true, TEST_USER);
    const sfx = extractSuffix(fullSQL, 'ID');

    expect(fullSQL).toContain('EXEC [dbo].spCreateWidget ');
    expect(fullSQL).not.toContain('IF NOT EXISTS');
    expect(fullSQL).not.toContain('spUpdateWidget');

    expect(simpleSQL).toContain(`IF NOT EXISTS (SELECT 1 FROM [dbo].[Widget] WHERE [ID] = @ID${sfx})`);
    expect(simpleSQL).toContain(`EXEC [dbo].spCreateWidget @ID=@ID${sfx}`);
    expect(simpleSQL).toContain(`EXEC [dbo].spUpdateWidget @ID=@ID${sfx}`);
    // Both branches consume the same DECLARE/SET block, declared once
    expect(simpleSQL!.match(/DECLARE /g)).toHaveLength(1);
    expect(simpleSQL!.match(/SET @ID/g)).toHaveLength(1);
    // The update branch reuses the create's argument list verbatim
    const createArgs = simpleSQL!.split('spCreateWidget ')[1].split('\nEND')[0];
    const updateArgs = simpleSQL!.split('spUpdateWidget ')[1].split('\nEND')[0];
    expect(updateArgs).toBe(createArgs);
  });

  it('CREATE on an entity with no generated update proc: guarded create, no ELSE branch', async () => {
    const provider = makeProvider();
    const entity = MakeNewWidgetEntity(MakeWidgetEntityInfo({ updateProc: false }), TEST_USER);
    entity.Set('ID', 'A0000000-0000-0000-0000-00000000000A');
    entity.Set('Name', 'No update proc');
    entity.Set('IsActive', true);

    const { simpleSQL } = await provider.SaveSQLForTest(entity, true, TEST_USER);

    expect(simpleSQL).toContain('IF NOT EXISTS (SELECT 1 FROM [dbo].[Widget]');
    expect(simpleSQL).toContain('EXEC [dbo].spCreateWidget');
    expect(simpleSQL).not.toContain('ELSE');
    expect(simpleSQL).not.toContain('spUpdateWidget');
  });

  it('UPDATE: the logged simpleSQL carries only the changed field + PK; the executed fullSQL still passes every column', async () => {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    entity.Set('Name', 'Renamed');

    const { fullSQL, simpleSQL } = await provider.SaveSQLForTest(entity, false, TEST_USER);
    const sfx = extractSuffix(fullSQL, 'Name');

    // Executed form unchanged: every SP parameter, including untouched ones
    expect(fullSQL).toContain(`@Description=@Description${sfx}`);
    expect(fullSQL).toContain(`@IsActive=@IsActive${sfx}`);
    expect(fullSQL).toContain('@ExternalID_Clear=1');

    // Logged form: spUpdate with the changed field and the key, same suffix, nothing else
    expect(simpleSQL).toBe(
      `DECLARE @Name${sfx} NVARCHAR(100),\n        @ID${sfx} UNIQUEIDENTIFIER\n\n` +
        `SET @Name${sfx} = N'Renamed'\nSET @ID${sfx} = 'w-0001'\n\n` +
        `EXEC [dbo].spUpdateWidget @Name=@Name${sfx},\n                @ID=@ID${sfx}`,
    );
    expect(simpleSQL).not.toContain('IF NOT EXISTS');
  });

  it('UPDATE: a field changed to NULL is logged with its _Clear companion; untouched NULLs are not', async () => {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    entity.Set('Description', null);

    const { simpleSQL } = await provider.SaveSQLForTest(entity, false, TEST_USER);

    expect(simpleSQL).toContain('@Description=@Description');
    expect(simpleSQL).toContain('@Description_Clear=1');
    expect(simpleSQL).not.toContain('@Name=');
    expect(simpleSQL).not.toContain('@ExternalID_Clear=1');
  });

  it('UPDATE that changed no proc parameter: logged as a comment, so a replay writes nothing', async () => {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);

    const { fullSQL, simpleSQL } = await provider.SaveSQLForTest(entity, false, TEST_USER);

    expect(fullSQL).toContain('EXEC [dbo].spUpdateWidget');
    expect(simpleSQL).toMatch(/^-- Widgets \(.*w-0001.*\): saved with no field changes; nothing to replay$/);
    expect(simpleSQL).not.toContain('EXEC');
  });

  it('forced UPDATE (IgnoreDirtyState, e.g. alwaysPush): logs the full row, which is what the caller asked to re-impose', async () => {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    entity.Set('Name', 'Renamed');
    const options = Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true });

    const { fullSQL, simpleSQL } = await provider.SaveSQLForTest(entity, false, TEST_USER, options);

    expect(simpleSQL).toBe(fullSQL);
    expect(simpleSQL).toContain('@Description=@Description');
  });

  it('UPDATE through a hand-written update proc (spUpdateGenerated off): logs the full row, since no ISNULL merge is promised', async () => {
    const provider = makeProvider();
    const info = MakeWidgetEntityInfo();
    info.spUpdateGenerated = false;
    const entity = MakeSavedWidgetEntity(info, TEST_USER);
    entity.Set('Name', 'Renamed');

    const { fullSQL, simpleSQL } = await provider.SaveSQLForTest(entity, false, TEST_USER);

    expect(simpleSQL).toBe(fullSQL);
    expect(simpleSQL).toContain('@Description=@Description');
  });

  it('UPDATE inside a TransactionGroup: the replay form reuses the save\'s suffix instead of allocating another ordinal', async () => {
    const provider = makeProvider();
    const group = new SQLServerTransactionGroup();
    const first = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    first.Set('Name', 'One');
    first.TransactionGroup = group;
    const second = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    second.Set('Name', 'Two');
    second.TransactionGroup = group;

    const a = await provider.SaveSQLForTest(first, false, TEST_USER);
    const b = await provider.SaveSQLForTest(second, false, TEST_USER);
    const sfxA = extractSuffix(a.fullSQL, 'Name');
    const sfxB = extractSuffix(b.fullSQL, 'Name');

    // Same record twice in one group: the second gets _2 — not _3, which an extra allocation would give
    expect(sfxB).toBe(`${sfxA}_2`);
    expect(a.simpleSQL).toContain(`@Name${sfxA} NVARCHAR(100)`);
    expect(b.simpleSQL).toContain(`@Name${sfxB} NVARCHAR(100)`);
  });

  it('CREATE without TrackRecordChanges: the guarded form still reaches the SQL logger as the fallback', async () => {
    const provider = makeProvider();
    const entity = MakeNewWidgetEntity(MakeWidgetEntityInfo({ trackRecordChanges: false }), TEST_USER);
    entity.Set('Name', 'Plain');
    entity.Set('IsActive', true);
    mssqlState.QueueResult({ rows: [{ ...SavedWidgetRow(), Name: 'Plain' }] });
    const logged: Array<{ query: string; fallback?: string }> = [];
    // Same argument order as executeSQLCore's context.logSqlStatement call
    (provider as unknown as { _logSqlStatement: unknown })._logSqlStatement = async (
      query: string,
      _params: unknown,
      _description: string | undefined,
      _ignoreLogging: boolean | undefined,
      _isMutation: boolean | undefined,
      fallback?: string,
    ) => {
      logged.push({ query, fallback });
    };

    await provider.Save(entity, TEST_USER, new EntitySaveOptions());

    const save = logged.find((l) => l.query.includes('spCreateWidget'));
    expect(save).toBeDefined();
    expect(save!.query).not.toContain('IF NOT EXISTS');
    expect(save!.fallback).toContain('IF NOT EXISTS (SELECT 1 FROM [dbo].[Widget]');
    expect(save!.fallback).toContain('spUpdateWidget');
  });
});

describe('SQLServerDataProvider delete path (real Delete() → GenerateDeleteSQL → mssql request)', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  it('emits the bare EXEC spDeleteWidget call with quoted PK when record changes are off', async () => {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    mssqlState.QueueResult({ rows: [{ ID: 'w-0001' }] });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(true);
    expect(mssqlState.Queries).toHaveLength(1);
    expect(mssqlState.Queries[0].sql).toBe(`EXEC [dbo].[spDeleteWidget] @ID='w-0001'`);
  });

  it('with TrackRecordChanges: wraps the delete in @ResultTable capture + Delete record-change EXEC', async () => {
    const provider = makeProvider();
    provider.SetTestEntities([MakeRecordChangesEntityInfo()]);
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo({ trackRecordChanges: true }), TEST_USER);
    mssqlState.QueueResult({ rows: [{ ID: 'w-0001' }] });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(true);
    const sql = mssqlState.Queries[0].sql;
    expect(sql).toContain('DECLARE @ResultTable TABLE');
    expect(sql).toContain(`EXEC [dbo].[spDeleteWidget] @ID='w-0001'`);
    expect(sql).toContain('spCreateRecordChange_Internal');
    expect(sql).toContain(`@Type='Delete'`);
    expect(sql).toContain(`@EntityName='Widgets'`);
    expect(sql).toContain('SELECT @ID AS [ID]'); // PK echoed back for delete validation
  });

  it('returns false when the proc echoes a different PK (delete validation)', async () => {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    mssqlState.QueueResult({ rows: [{ ID: 'some-other-record' }] });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(false);
    expect(entity.LatestResult?.Message).toContain('ID=w-0001 not found');
  });

  it('returns false when the proc returns no rows', async () => {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    mssqlState.QueueResult({ rows: [] });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(false);
    expect(entity.LatestResult?.Message).toBe('No result returned from SQL');
  });

  it('validates against the LAST result set when CASCADE deletes return multiple result sets', async () => {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER);
    // First result set: cascade-deleted children; last result set: the record itself
    mssqlState.QueueResult({
      recordsets: [[{ ChildID: 'c-1' }, { ChildID: 'c-2' }], [{ ID: 'w-0001' }]],
    });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(true);
  });
});

/**
 * A CascadeDeletes entity's generated spDelete EXECs the related spUpdate (nullable FK) or spDelete for
 * each child row, and each of those returns a result set ahead of the proc's own `SELECT <pk>`. A
 * positional `INSERT INTO @ResultTable EXEC spDelete…` therefore fails with SQL error 213 on the
 * first child view row (live: deleting an AI Prompt referenced by a Feature Value or Record Process).
 */
describe('SQLServerDataProvider delete path — CascadeDeletes entity with TrackRecordChanges', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  function cascadingWidget(deleteType: 'Hard' | 'Soft' = 'Hard') {
    const provider = makeProvider();
    provider.SetTestEntities([MakeRecordChangesEntityInfo()]);
    const entity = MakeSavedWidgetEntity(
      MakeWidgetEntityInfo({ trackRecordChanges: true, cascadeDeletes: true, deleteType }),
      TEST_USER,
    );
    return { provider, entity };
  }

  it('does not capture the proc output with a positional INSERT…EXEC', async () => {
    const { provider, entity } = cascadingWidget();
    mssqlState.QueueResult({ recordsets: [[{ ID: 'w-0001' }], [{ ID: 'w-0001' }]] });

    await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    const sql = mssqlState.Queries[0].sql;
    expect(sql).not.toContain('@ResultTable');
    expect(sql).not.toMatch(/INSERT\s+INTO\s+@ResultTable\s+EXEC/);
    expect(sql).toContain(`EXEC [dbo].[spDeleteWidget] @ID='w-0001';`);
  });

  it('logs the Delete record change only when the row was visible before the EXEC and is gone after it', async () => {
    const { provider, entity } = cascadingWidget();
    mssqlState.QueueResult({ recordsets: [[{ ID: 'w-0001' }], [{ ID: 'w-0001' }]] });

    await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    const sql = mssqlState.Queries[0].sql;
    const lockedVisible = `EXISTS (SELECT 1 FROM [dbo].[Widget] WITH (UPDLOCK, HOLDLOCK) WHERE [ID] = 'w-0001')`;
    const visible = `EXISTS (SELECT 1 FROM [dbo].[Widget] WHERE [ID] = 'w-0001')`;
    expect(sql).toContain(`DECLARE @__mj_DeleteTargetExisted BIT = CASE WHEN ${lockedVisible} THEN 1 ELSE 0 END;`);
    expect(sql).toContain(`IF @__mj_DeleteTargetExisted = 1 AND NOT ${visible}`);
    // existence is read before the delete runs, absence after it
    expect(sql.indexOf('@__mj_DeleteTargetExisted BIT')).toBeLessThan(sql.indexOf('EXEC [dbo].[spDeleteWidget]'));
    expect(sql.indexOf('EXEC [dbo].[spDeleteWidget]')).toBeLessThan(sql.indexOf('IF @__mj_DeleteTargetExisted = 1'));
    expect(sql).toContain('spCreateRecordChange_Internal');
    expect(sql).toContain(`@Type='Delete'`);
    // the record's keys are the batch's LAST result set; NULL keys when nothing was deleted
    expect(sql).toMatch(/SELECT CAST\('w-0001' AS [^)]+\) AS \[ID\];\s+END\s+ELSE\s+SELECT CAST\(NULL AS [^)]+\) AS \[ID\];/);
  });

  it('runs check + EXEC + re-check atomically: locked before-check inside one transaction, own transaction only when none is open', async () => {
    const { provider, entity } = cascadingWidget();
    mssqlState.QueueResult({ recordsets: [[{ ID: 'w-0001' }], [{ ID: 'w-0001' }]] });

    await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    const sql = mssqlState.Queries[0].sql;
    const at = (fragment: string): number => {
      const i = sql.indexOf(fragment);
      expect(i, `missing: ${fragment}`).toBeGreaterThanOrEqual(0);
      return i;
    };
    const owns = at('DECLARE @__mj_OwnsDeleteTransaction BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;');
    const begin = at('IF @__mj_OwnsDeleteTransaction = 1 BEGIN TRANSACTION;');
    const tryStart = at('BEGIN TRY');
    const check = at('WITH (UPDLOCK, HOLDLOCK)');
    const exec = at(`EXEC [dbo].[spDeleteWidget] @ID='w-0001';`);
    const recheck = at('IF @__mj_DeleteTargetExisted = 1 AND NOT EXISTS');
    const commit = at('IF @__mj_OwnsDeleteTransaction = 1 COMMIT TRANSACTION;');
    const catchStart = at('BEGIN CATCH');
    const rollback = at('IF @__mj_OwnsDeleteTransaction = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;');
    const rethrow = at('THROW;');
    expect([owns, begin, tryStart, check, exec, recheck, commit, catchStart, rollback, rethrow]).toEqual(
      [owns, begin, tryStart, check, exec, recheck, commit, catchStart, rollback, rethrow].slice().sort((x, y) => x - y),
    );
    expect(sql.trimEnd().endsWith('END CATCH;')).toBe(true);
  });

  it('a soft-delete entity counts the row as visible only while __mj_DeletedAt IS NULL', async () => {
    const { provider, entity } = cascadingWidget('Soft');
    mssqlState.QueueResult({ recordsets: [[{ ID: 'w-0001' }], [{ ID: 'w-0001' }]] });

    await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(mssqlState.Queries[0].sql).toContain(
      `EXISTS (SELECT 1 FROM [dbo].[Widget] WHERE [ID] = 'w-0001' AND [__mj_DeletedAt] IS NULL)`,
    );
  });

  it('succeeds when child view rows and child keys precede the record (validation reads the LAST set)', async () => {
    const { provider, entity } = cascadingWidget();
    mssqlState.QueueResult({
      recordsets: [
        [{ ID: 'child-model-1' }], // cascaded spDeleteChild → SELECT @ID
        [{ ID: 'child-2', Name: 'Child', ParentID: null, Status: 'Active' }], // cascaded spUpdateChild → base-view row
        [{ ID: 'w-0001' }], // spDeleteWidget's own SELECT @ID
        [{ ID: 'w-0001' }], // wrapper's final SELECT of the deleted keys
      ],
    });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(true);
  });

  it('fails when the wrapper reports NULL keys (nothing was deleted)', async () => {
    const { provider, entity } = cascadingWidget();
    mssqlState.QueueResult({ recordsets: [[{ ID: null }], [{ ID: null }]] });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(false);
    expect(entity.LatestResult?.Message).toContain('ID=w-0001 not found');
  });

  it('both tracked delete wrappers survive batched variable scoping (every local reference is renamed)', async () => {
    // BatchedSubmit renames each item's DECLAREd locals but protects `@name =` inside an EXEC's
    // argument list, which runs to the next `;`. An unterminated `EXEC spDelete… @ID='x'` let that
    // span swallow the following `SELECT @ID=ID FROM @ResultTable`, leaving `@ID` undeclared.
    const { provider, entity } = cascadingWidget();
    mssqlState.QueueResult({ recordsets: [[{ ID: 'w-0001' }], [{ ID: 'w-0001' }]] });
    await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);
    const cascadingScoped = SQLServerTransactionGroup.ScopeItemVariables(mssqlState.Queries[0].sql, 0);
    expect(cascadingScoped).toContain('IF @__mj_DeleteTargetExisted_mjb0 = 1');
    expect(cascadingScoped).toContain('INSERT INTO @ResultChangesTable_mjb0');
    expect(cascadingScoped).toContain(`EXEC [dbo].[spDeleteWidget] @ID='w-0001';`); // callee argument untouched

    mssqlState.Reset();
    const plainProvider = makeProvider();
    plainProvider.SetTestEntities([MakeRecordChangesEntityInfo()]);
    const plain = MakeSavedWidgetEntity(MakeWidgetEntityInfo({ trackRecordChanges: true }), TEST_USER);
    mssqlState.QueueResult({ rows: [{ ID: 'w-0001' }] });
    await plainProvider.Delete(plain, new EntityDeleteOptions(), TEST_USER);
    const plainScoped = SQLServerTransactionGroup.ScopeItemVariables(mssqlState.Queries[0].sql, 0);
    expect(plainScoped).toContain('SELECT @ID_mjb0=ID FROM @ResultTable_mjb0');
    expect(plainScoped).not.toMatch(/SELECT @ID=ID/);
  });

  it('escapes a quote in a key value in the proc call and in the existence checks', async () => {
    const provider = makeProvider();
    provider.SetTestEntities([MakeRecordChangesEntityInfo()]);
    const entity = MakeSavedWidgetEntity(
      MakeWidgetEntityInfo({ trackRecordChanges: true, cascadeDeletes: true }),
      TEST_USER,
      { ID: "w'1" },
    );
    mssqlState.QueueResult({ recordsets: [[{ ID: "w'1" }], [{ ID: "w'1" }]] });

    await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    const sql = mssqlState.Queries[0].sql;
    expect(sql).toContain(`EXEC [dbo].[spDeleteWidget] @ID='w''1';`);
    expect(sql).toContain(`WHERE [ID] = 'w''1')`);
    expect(sql).not.toContain(`'w'1'`);
  });

  for (const cascadeDeletes of [true, false]) {
    it(`refuses to render a delete for a record with no key value (CascadeDeletes=${cascadeDeletes}) — never the literal 'null'/'undefined'`, () => {
      const provider = makeProvider();
      provider.SetTestEntities([MakeRecordChangesEntityInfo()]);
      // Provider.Delete() refuses an unsaved record before rendering; the renderer refuses on its own too.
      const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo({ trackRecordChanges: true, cascadeDeletes }), TEST_USER, { ID: null });

      expect(() => provider.DeleteSQLForTest(entity, TEST_USER)).toThrow(/Cannot render the delete of Widgets: the record has no value for primary key ID/);
    });
  }

  it('keeps the INSERT…EXEC capture for a tracked entity WITHOUT CascadeDeletes', async () => {
    const provider = makeProvider();
    provider.SetTestEntities([MakeRecordChangesEntityInfo()]);
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo({ trackRecordChanges: true }), TEST_USER);
    mssqlState.QueueResult({ rows: [{ ID: 'w-0001' }] });

    await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(mssqlState.Queries[0].sql).toMatch(/INSERT INTO @ResultTable\s+EXEC \[dbo\]\.\[spDeleteWidget\]/);
    expect(mssqlState.Queries[0].sql).not.toContain('@__mj_DeleteTargetExisted');
  });
});

describe('SQLServerDataProvider save-call variable suffix (loom #12 WP3)', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  it('same record → same suffix across two independent Save() calls', async () => {
    const info = MakeWidgetEntityInfo();
    const a = MakeSavedWidgetEntity(info, TEST_USER);
    const b = MakeSavedWidgetEntity(info, TEST_USER);
    a.Set('Name', 'Once');
    b.Set('Name', 'Twice');
    mssqlState.QueueResult({ rows: [{ ...SavedWidgetRow(), Name: 'Once' }] });
    mssqlState.QueueResult({ rows: [{ ...SavedWidgetRow(), Name: 'Twice' }] });
    const provider = makeProvider();
    await provider.Save(a, TEST_USER, new EntitySaveOptions());
    await provider.Save(b, TEST_USER, new EntitySaveOptions());
    const sfxA = extractSuffix(mssqlState.Queries[0].sql, 'Name');
    const sfxB = extractSuffix(mssqlState.Queries[1].sql, 'Name');
    expect(sfxA).toBe(sfxB);
    expect(sfxA).toMatch(/^_[0-9a-f]{12}$/);
    expect(sfxA).toBe(
      '_' + GenericDatabaseProvider.SaveCallVariableHash('dbo', 'Widget', ['w-0001']),
    );
  });

  it('different records → different suffixes', async () => {
    const info = MakeWidgetEntityInfo();
    const a = MakeSavedWidgetEntity(info, TEST_USER);
    const b = MakeNewWidgetEntity(info, TEST_USER);
    b.Set('ID', 'w-9999');
    b.Set('Name', 'Other');
    b.Set('IsActive', true);
    a.Set('Name', 'First');
    mssqlState.QueueResult({ rows: [{ ...SavedWidgetRow(), Name: 'First' }] });
    mssqlState.QueueResult({ rows: [{ ...SavedWidgetRow(), ID: 'w-9999', Name: 'Other' }] });
    const provider = makeProvider();
    await provider.Save(a, TEST_USER, new EntitySaveOptions());
    await provider.Save(b, TEST_USER, new EntitySaveOptions());
    expect(extractSuffix(mssqlState.Queries[0].sql, 'Name')).not.toBe(
      extractSuffix(mssqlState.Queries[1].sql, 'Name'),
    );
  });

  describe('through a REAL SQLServerTransactionGroup (HandleSubmit uses each item\'s own provider)', () => {

    /** Every `@name` declared by a T-SQL batch, including comma-separated continuations. */
    function declaredNames(sql: string): string[] {
      return [...sql.matchAll(/(?:DECLARE\s+|,\s*\n\s*)@([A-Za-z0-9_]+)\s+[A-Z]/g)].map((m) => m[1]);
    }

    it('same record twice in one group (sequential path) → _hash then _hash_2, so TransactionGroup is honored at render time', async () => {
      const info = MakeWidgetEntityInfo();
      const provider = makeProvider();
      provider.SetTestEntities([info]);
      const group = new SQLServerTransactionGroup();
      const a = MakeSavedWidgetEntity(info, TEST_USER, undefined, provider);
      const b = MakeSavedWidgetEntity(info, TEST_USER, undefined, provider);
      a.TransactionGroup = group;
      b.TransactionGroup = group;
      a.Set('Name', 'One');
      b.Set('Name', 'Two');
      const saveA = provider.Save(a, TEST_USER, new EntitySaveOptions());
      const saveB = provider.Save(b, TEST_USER, new EntitySaveOptions());
      mssqlState.QueueResult({ rows: [{ ...SavedWidgetRow(), Name: 'One' }] });
      mssqlState.QueueResult({ rows: [{ ...SavedWidgetRow(), Name: 'Two' }] });

      expect(await group.Submit()).toBe(true);
      await Promise.all([saveA, saveB]);

      expect(mssqlState.EventKinds()).toEqual(['begin', 'query', 'query', 'commit']);
      const first = extractSuffix(mssqlState.Queries[0].sql, 'Name');
      expect(first).toBe('_' + GenericDatabaseProvider.SaveCallVariableHash('dbo', 'Widget', ['w-0001']));
      expect(extractSuffix(mssqlState.Queries[1].sql, 'Name')).toBe(`${first}_2`);
    });

    it('BatchedSubmit with a repeated hash: one batch, every local unique and item-scoped', async () => {
      const info = MakeWidgetEntityInfo();
      const provider = makeProvider();
      provider.SetTestEntities([info]);
      const group = new SQLServerTransactionGroup();
      group.BatchedSubmit = true;
      const same1 = MakeSavedWidgetEntity(info, TEST_USER, undefined, provider);
      const same2 = MakeSavedWidgetEntity(info, TEST_USER, undefined, provider);
      const other = MakeNewWidgetEntity(info, TEST_USER, provider);
      other.Set('ID', 'w-9999');
      other.Set('Name', 'Other');
      other.Set('IsActive', true);
      for (const e of [same1, same2, other]) e.TransactionGroup = group;
      same1.Set('Name', 'One');
      same2.Set('Name', 'Two');
      const saves = [same1, same2, other].map((e) => provider.Save(e, TEST_USER, new EntitySaveOptions()));
      mssqlState.QueueResult({
        recordsets: [
          [{ __mj_batch_item: 0 }], [{ ...SavedWidgetRow(), Name: 'One' }],
          [{ __mj_batch_item: 1 }], [{ ...SavedWidgetRow(), Name: 'Two' }],
          [{ __mj_batch_item: 2 }], [{ ...SavedWidgetRow(), ID: 'w-9999', Name: 'Other' }],
        ],
      });

      expect(await group.Submit()).toBe(true);
      await Promise.all(saves);

      expect(mssqlState.Queries).toHaveLength(1);
      const names = declaredNames(mssqlState.Queries[0].sql);
      expect(names.length).toBeGreaterThan(3);
      expect(new Set(names).size).toBe(names.length);
      // The allocator's ordinal keeps the two same-record items apart …
      const hash = GenericDatabaseProvider.SaveCallVariableHash('dbo', 'Widget', ['w-0001']);
      expect(names).toContain(`Name_${hash}_mjb0`);
      expect(names).toContain(`Name_${hash}_2_mjb1`);
      // … and scopeItemVariables scopes EVERY declared local of every item, not just the first.
      expect(names.every((n) => /_mjb[0-2]$/.test(n))).toBe(true);
    });
  });
});

/**
 * Transaction-group deletes are judged by the same key-match predicate as the direct path: a row
 * with NULL keys (the generated spDelete's "nothing deleted") fails the item, the group, and the
 * entity's result, and the after-delete hooks fire only for a matched delete.
 */
describe('SQLServerDataProvider delete inside a TransactionGroup (real Delete() → group Submit())', () => {
  // Submit() console.errors the (expected) failure and LogError reports the rejected delete; keep test output clean.
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mssqlState.Reset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  async function deleteInGroup(rows: Record<string, unknown>[], batched: boolean) {
    const provider = makeProvider();
    const entity = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider);
    const group = new SQLServerTransactionGroup();
    group.BatchedSubmit = batched;
    entity.TransactionGroup = group;
    await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);
    if (batched) {
      mssqlState.QueueResult({ recordsets: [[{ __mj_batch_item: 0 }], rows] });
    } else {
      mssqlState.QueueResult({ rows });
    }
    const submitted = await group.Submit();
    const afterDeleteHooks = provider.EntityActionInvocations.filter((i) => i.BaseType === 'delete' && !i.Before).length;
    return { submitted, group, entity, afterDeleteHooks };
  }

  for (const batched of [false, true]) {
    const mode = batched ? 'batched' : 'sequential';

    it(`${mode}: a NULL-key row fails the delete — Submit() false, entity result false, no after-delete hooks`, async () => {
      const { submitted, group, entity, afterDeleteHooks } = await deleteInGroup([{ ID: null }], batched);

      expect(submitted).toBe(false);
      expect(group.Status).toBe('Failed');
      expect(entity.LatestResult?.Success).toBe(false);
      expect(afterDeleteHooks).toBe(0);
    });

    it(`${mode}: the record's keys (any UUID letter case) succeed and fire the after-delete hooks once`, async () => {
      const { submitted, group, entity, afterDeleteHooks } = await deleteInGroup([{ ID: 'W-0001' }], batched);

      expect(submitted).toBe(true);
      expect(group.Status).toBe('Complete');
      expect(entity.LatestResult?.Success).toBe(true);
      expect(afterDeleteHooks).toBe(1);
    });
  }
});

/**
 * All-or-nothing: a delete that did not delete its record fails the whole group exactly like a
 * statement that threw — the transaction rolls back (no commit), Submit() is false, and NO item
 * (not even a sibling save that ran first) reports success or fires its after-save/after-delete hooks.
 */
describe('TransactionGroup with a failed item (NULL-key delete, or a save that returned no row) — rolls back, nothing reported as success', () => {
  // Submit() console.errors the (expected) failure and LogError reports the rejected delete; keep test output clean.
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mssqlState.Reset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  type Mode = 'sequential-with-variables' | 'sequential-no-variables' | 'batched';

  /** Two saves; the second returns NO row (its record was not persisted). */
  async function saveThenEmptySave(mode: Mode) {
    const provider = makeProvider();
    const group = new SQLServerTransactionGroup();
    group.BatchedSubmit = mode === 'batched';

    const first = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider);
    first.Set('Name', 'Renamed');
    first.TransactionGroup = group;
    const lost = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, { ID: 'w-0002' }, provider);
    lost.Set('Name', 'Gone');
    lost.TransactionGroup = group;
    if (mode === 'sequential-with-variables') {
      group.AddVariable(new TransactionVariable('FirstWidgetID', first, 'ID', 'Define'));
    }

    await provider.Save(first, TEST_USER, new EntitySaveOptions());
    await provider.Save(lost, TEST_USER, new EntitySaveOptions());

    const firstRow = { ...SavedWidgetRow(), Name: 'Renamed' };
    if (mode === 'batched') {
      mssqlState.QueueResult({ recordsets: [[{ __mj_batch_item: 0 }], [firstRow], [{ __mj_batch_item: 1 }], []] });
    } else {
      mssqlState.QueueResult({ rows: [firstRow] });
      mssqlState.QueueResult({ rows: [] });
    }

    const submitted = await group.Submit();
    const afterHooks = provider.EntityActionInvocations.filter((i) => !i.Before && (i.BaseType === 'save' || i.BaseType === 'delete')).length;
    return { submitted, group, first, lost, afterHooks };
  }

  async function saveThenFailedDelete(mode: Mode) {
    const provider = makeProvider();
    const group = new SQLServerTransactionGroup();
    group.BatchedSubmit = mode === 'batched';

    const saved = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, undefined, provider);
    saved.Set('Name', 'Renamed');
    saved.TransactionGroup = group;
    const doomed = MakeSavedWidgetEntity(MakeWidgetEntityInfo(), TEST_USER, { ID: 'w-0002' }, provider);
    doomed.TransactionGroup = group;
    if (mode === 'sequential-with-variables') {
      group.AddVariable(new TransactionVariable('SavedWidgetID', saved, 'ID', 'Define'));
    }

    await provider.Save(saved, TEST_USER, new EntitySaveOptions());
    await provider.Delete(doomed, new EntityDeleteOptions(), TEST_USER);

    const savedRow = { ...SavedWidgetRow(), Name: 'Renamed' };
    if (mode === 'batched') {
      mssqlState.QueueResult({ recordsets: [[{ __mj_batch_item: 0 }], [savedRow], [{ __mj_batch_item: 1 }], [{ ID: null }]] });
    } else {
      mssqlState.QueueResult({ rows: [savedRow] });
      mssqlState.QueueResult({ rows: [{ ID: null }] });
    }

    const submitted = await group.Submit();
    // after-save / after-delete only ('validate' runs with Before=false while the item is queued)
    const afterHooks = provider.EntityActionInvocations.filter((i) => !i.Before && (i.BaseType === 'save' || i.BaseType === 'delete')).length;
    return { submitted, group, saved, doomed, afterHooks };
  }

  for (const mode of ['sequential-with-variables', 'sequential-no-variables', 'batched'] as const) {
    it(`${mode}: rollback, no commit, Submit() false, no success and no after-hooks for either item`, async () => {
      const { submitted, group, saved, doomed, afterHooks } = await saveThenFailedDelete(mode);

      const events = mssqlState.EventKinds();
      expect(events).toContain('rollback');
      expect(events).not.toContain('commit');
      expect(submitted).toBe(false);
      expect(group.Status).toBe('Failed');
      expect(saved.LatestResult?.Success).toBe(false);
      expect(doomed.LatestResult?.Success).toBe(false);
      expect(afterHooks).toBe(0);
    });

    it(`${mode}: a SAVE that returns no row fails the group the same way — rollback, no commit, no sibling success`, async () => {
      const { submitted, group, first, lost, afterHooks } = await saveThenEmptySave(mode);

      const events = mssqlState.EventKinds();
      expect(events).toContain('rollback');
      expect(events).not.toContain('commit');
      expect(submitted).toBe(false);
      expect(group.Status).toBe('Failed');
      expect(first.LatestResult?.Success).toBe(false);
      expect(lost.LatestResult?.Success).toBe(false);
      expect(afterHooks).toBe(0);
    });
  }
});
