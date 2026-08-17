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
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import type { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';
import { EntitySaveOptions, EntityDeleteOptions } from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { mssqlState, MockConnectionPool } from './helpers/mock-mssql';
import {
  TEST_USER,
  makeWidgetEntityInfo,
  makeRecordChangesEntityInfo,
  makeSavedWidgetEntity,
  makeNewWidgetEntity,
  savedWidgetRow,
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
}

function makeProvider(): SaveDeleteTestProvider {
  const provider = new SaveDeleteTestProvider();
  provider.AttachPool(new MockConnectionPool());
  return provider;
}

/** Extracts the uuid-derived variable suffix RenderSaveCallBinding appended (e.g. '_a1b2c3d4'). */
function extractSuffix(sql: string, codeName: string): string {
  const match = new RegExp(`@${codeName}(_[0-9a-f]{8})`).exec(sql);
  expect(match, `expected a suffixed @${codeName} variable in:\n${sql}`).not.toBeNull();
  return (match as RegExpExecArray)[1];
}

describe('SQLServerDataProvider save path (real Save() → GenerateSaveSQL → mssql request)', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  it('CREATE: emits DECLARE/SET/EXEC spCreateWidget with correctly typed, escaped, coerced parameters', async () => {
    const provider = makeProvider();
    const entityInfo = makeWidgetEntityInfo();
    const entity = makeNewWidgetEntity(entityInfo, TEST_USER);
    entity.Set('Name', "Widget's One");
    entity.Set('Description', 'A test widget');
    entity.Set('IsActive', true);
    entity.Set('LaunchedAt', new Date('2025-04-05T12:00:00.000Z'));
    entity.Set('ExternalID', 'newid()'); // function literal → must be skipped so the DB default fires

    const returnedRow = { ...savedWidgetRow(), Name: "Widget's One" };
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
    const entity = makeNewWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    entity.Set('ID', 'w-9999');
    entity.Set('Name', 'Pre-keyed');
    entity.Set('IsActive', false);
    mssqlState.QueueResult({ rows: [{ ...savedWidgetRow(), ID: 'w-9999', Name: 'Pre-keyed' }] });

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
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    expect(entity.IsSaved).toBe(true);
    entity.Set('Name', 'Renamed Widget');

    const updatedRow = { ...savedWidgetRow(), Name: 'Renamed Widget' };
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
    provider.SetTestEntities([makeRecordChangesEntityInfo()]);
    const entityInfo = makeWidgetEntityInfo({ trackRecordChanges: true });
    const entity = makeNewWidgetEntity(entityInfo, TEST_USER);
    entity.Set('Name', 'Tracked Widget');
    entity.Set('IsActive', true);
    mssqlState.QueueResult({ rows: [{ ...savedWidgetRow(), Name: 'Tracked Widget' }] });

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
    const entity = makeNewWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    entity.Set('Name', 'Ghost');
    entity.Set('IsActive', true);
    mssqlState.QueueResult({ rows: [] });

    await expect(provider.Save(entity, TEST_USER, new EntitySaveOptions())).rejects.toThrow(
      /Error creating new record, no rows returned/,
    );
  });
});

describe('SQLServerDataProvider delete path (real Delete() → GenerateDeleteSQL → mssql request)', () => {
  beforeEach(() => {
    mssqlState.Reset();
  });

  it('emits the bare EXEC spDeleteWidget call with quoted PK when record changes are off', async () => {
    const provider = makeProvider();
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    mssqlState.QueueResult({ rows: [{ ID: 'w-0001' }] });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(true);
    expect(mssqlState.Queries).toHaveLength(1);
    expect(mssqlState.Queries[0].sql).toBe(`EXEC [dbo].[spDeleteWidget] @ID='w-0001'`);
  });

  it('with TrackRecordChanges: wraps the delete in @ResultTable capture + Delete record-change EXEC', async () => {
    const provider = makeProvider();
    provider.SetTestEntities([makeRecordChangesEntityInfo()]);
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo({ trackRecordChanges: true }), TEST_USER);
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
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    mssqlState.QueueResult({ rows: [{ ID: 'some-other-record' }] });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(false);
    expect(entity.LatestResult?.Message).toContain('ID=w-0001 not found');
  });

  it('returns false when the proc returns no rows', async () => {
    const provider = makeProvider();
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    mssqlState.QueueResult({ rows: [] });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(false);
    expect(entity.LatestResult?.Message).toBe('No result returned from SQL');
  });

  it('validates against the LAST result set when CASCADE deletes return multiple result sets', async () => {
    const provider = makeProvider();
    const entity = makeSavedWidgetEntity(makeWidgetEntityInfo(), TEST_USER);
    // First result set: cascade-deleted children; last result set: the record itself
    mssqlState.QueueResult({
      recordsets: [[{ ChildID: 'c-1' }, { ChildID: 'c-2' }], [{ ID: 'w-0001' }]],
    });

    const deleted = await provider.Delete(entity, new EntityDeleteOptions(), TEST_USER);

    expect(deleted).toBe(true);
  });
});
