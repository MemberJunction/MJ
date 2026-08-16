/**
 * Real-metadata fixtures for SQLServerDataProvider behavioral tests.
 *
 * These build REAL `EntityInfo`/`EntityFieldInfo` instances (via their public
 * initData constructors) and a REAL `BaseEntity` subclass — so the code under
 * test exercises the genuine `IsSPParameter`, `CodeName`, `SQLFullType`,
 * `NeedsQuotes`, `UnicodePrefix`, dirty tracking, and primary-key machinery
 * rather than hand-rolled stand-ins. Mirrors the harness technique from
 * packages/GenericDatabaseProvider/src/__tests__/GenericDatabaseProvider.test.ts,
 * upgraded to real metadata classes.
 */
import { BaseEntity, EntityInfo, UserInfo } from '@memberjunction/core';

/** Concrete BaseEntity for tests — BaseEntity has no abstract members, so this is a full real entity object. */
export class TestEntity extends BaseEntity {}

export const TEST_USER = {
  ID: '11111111-2222-3333-4444-555555555555',
  Name: 'Test User',
  Email: 'test@example.com',
} as unknown as UserInfo;

export const WIDGET_ENTITY_ID = 'A1000000-0000-0000-0000-000000000001';
export const RECORD_CHANGES_ENTITY_ID = 'A2000000-0000-0000-0000-000000000002';

/**
 * Raw field init data for the "Widgets" test entity. Deliberately covers the
 * save-grammar corners:
 *  - uniqueidentifier PK (no default → omitted on create when unset)
 *  - required nvarchar (quote escaping + N prefix)
 *  - nullable nvarchar(MAX) (NeedsClearCompanion)
 *  - bit (boolean → 1/0)
 *  - nullable int (declared but never SET when null, plus _Clear companion)
 *  - nullable non-PK uniqueidentifier (function-literal values are skipped on create)
 *  - datetimeoffset (ISO-string coercion)
 *  - __mj_CreatedAt/__mj_UpdatedAt special date fields (excluded from SP params)
 *  - a virtual joined field (excluded from SP params)
 */
function widgetFieldInitData(): Record<string, unknown>[] {
  const base = {
    EntityID: WIDGET_ENTITY_ID,
    Precision: 0,
    Scale: 0,
    AllowsNull: false,
    DefaultValue: null,
    AutoIncrement: false,
    IsVirtual: false,
    IsPrimaryKey: false,
    IsUnique: false,
    AllowUpdateAPI: true,
    IsComputed: false,
    Status: 'Active',
  };
  return [
    { ...base, ID: 'F0000000-0000-0000-0000-000000000001', Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, IsUnique: true, AllowUpdateAPI: false },
    { ...base, ID: 'F0000000-0000-0000-0000-000000000002', Sequence: 2, Name: 'Name', Type: 'nvarchar', Length: 200 },
    { ...base, ID: 'F0000000-0000-0000-0000-000000000003', Sequence: 3, Name: 'Description', Type: 'nvarchar', Length: -1, AllowsNull: true },
    { ...base, ID: 'F0000000-0000-0000-0000-000000000004', Sequence: 4, Name: 'IsActive', Type: 'bit', Length: 1 },
    { ...base, ID: 'F0000000-0000-0000-0000-000000000005', Sequence: 5, Name: 'Quantity', Type: 'int', Length: 4, AllowsNull: true },
    { ...base, ID: 'F0000000-0000-0000-0000-000000000006', Sequence: 6, Name: 'ExternalID', Type: 'uniqueidentifier', Length: 16, AllowsNull: true },
    { ...base, ID: 'F0000000-0000-0000-0000-000000000007', Sequence: 7, Name: 'LaunchedAt', Type: 'datetimeoffset', Length: 10, AllowsNull: true },
    { ...base, ID: 'F0000000-0000-0000-0000-000000000008', Sequence: 8, Name: '__mj_CreatedAt', Type: 'datetimeoffset', Length: 10, AllowUpdateAPI: false },
    { ...base, ID: 'F0000000-0000-0000-0000-000000000009', Sequence: 9, Name: '__mj_UpdatedAt', Type: 'datetimeoffset', Length: 10, AllowUpdateAPI: false },
    { ...base, ID: 'F0000000-0000-0000-0000-00000000000A', Sequence: 10, Name: 'CategoryName', Type: 'nvarchar', Length: 200, AllowsNull: true, IsVirtual: true, AllowUpdateAPI: false },
  ];
}

/**
 * Builds a REAL EntityInfo for the "Widgets" test entity. `spCreate`/`spUpdate`/
 * `spDelete` are left null so the provider derives the default names
 * (spCreateWidget / spUpdateWidget / spDeleteWidget) from BaseTableCodeName —
 * exercising the real GetCreateUpdateSPName fallback.
 */
export function makeWidgetEntityInfo(options?: { trackRecordChanges?: boolean }): EntityInfo {
  return new EntityInfo({
    ID: WIDGET_ENTITY_ID,
    Name: 'Widgets',
    Status: 'Active',
    SchemaName: 'dbo',
    BaseTable: 'Widget',
    BaseTableCodeName: 'Widget',
    BaseView: 'vwWidgets',
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    TrackRecordChanges: options?.trackRecordChanges ?? false,
    spCreate: null,
    spUpdate: null,
    spDelete: null,
    ExternalDataSourceID: null,
    VirtualEntity: false,
    AllowMultipleSubtypes: false,
    EntityFields: widgetFieldInitData(),
    EntityPermissions: [],
  });
}

/**
 * Minimal-but-real EntityInfo for 'MJ: Record Changes' — used by the provider's
 * record-change wrappers to declare the @ResultChangesTable columns.
 */
export function makeRecordChangesEntityInfo(): EntityInfo {
  const base = {
    EntityID: RECORD_CHANGES_ENTITY_ID,
    Precision: 0,
    Scale: 0,
    AllowsNull: false,
    DefaultValue: null,
    AutoIncrement: false,
    IsVirtual: false,
    IsPrimaryKey: false,
    IsUnique: false,
    AllowUpdateAPI: true,
    IsComputed: false,
    Status: 'Active',
  };
  return new EntityInfo({
    ID: RECORD_CHANGES_ENTITY_ID,
    Name: 'MJ: Record Changes',
    Status: 'Active',
    SchemaName: '__mj',
    BaseTable: 'RecordChange',
    BaseTableCodeName: 'RecordChange',
    BaseView: 'vwRecordChanges',
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: false,
    TrackRecordChanges: false,
    ExternalDataSourceID: null,
    VirtualEntity: false,
    EntityFields: [
      { ...base, ID: 'FC000000-0000-0000-0000-000000000001', Sequence: 1, Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true, IsUnique: true, AllowUpdateAPI: false },
      { ...base, ID: 'FC000000-0000-0000-0000-000000000002', Sequence: 2, Name: 'EntityID', Type: 'uniqueidentifier', Length: 16 },
      { ...base, ID: 'FC000000-0000-0000-0000-000000000003', Sequence: 3, Name: 'RecordID', Type: 'nvarchar', Length: 1500 },
      { ...base, ID: 'FC000000-0000-0000-0000-000000000004', Sequence: 4, Name: 'Type', Type: 'nvarchar', Length: 40 },
      { ...base, ID: 'FC000000-0000-0000-0000-000000000005', Sequence: 5, Name: 'ChangesJSON', Type: 'nvarchar', Length: -1, AllowsNull: true },
      { ...base, ID: 'FC000000-0000-0000-0000-000000000006', Sequence: 6, Name: 'FullRecordJSON', Type: 'nvarchar', Length: -1, AllowsNull: true },
    ],
    EntityPermissions: [],
  });
}

/** Plain data for a saved widget row — used to load fixtures into the "existing record" state. */
export function savedWidgetRow(): Record<string, unknown> {
  return {
    ID: 'w-0001',
    Name: 'Widget One',
    Description: 'First run',
    IsActive: true,
    Quantity: 3,
    ExternalID: null,
    LaunchedAt: new Date('2025-04-05T12:00:00.000Z'),
    __mj_CreatedAt: new Date('2025-01-01T00:00:00.000Z'),
    __mj_UpdatedAt: new Date('2025-01-02T00:00:00.000Z'),
    CategoryName: 'Gadgets',
  };
}

/** Creates a REAL BaseEntity in the "loaded / previously saved" state (IsSaved === true). */
export function makeSavedWidgetEntity(entityInfo: EntityInfo, contextUser: UserInfo): TestEntity {
  const entity = new TestEntity(entityInfo);
  entity.ContextCurrentUser = contextUser;
  // replaceOldValues=true marks the entity saved once all PKs are populated —
  // the same path IS-A parent hydration uses in production.
  entity.SetMany(savedWidgetRow(), false, true, true);
  return entity;
}

/** Creates a REAL BaseEntity in the "new record" state (IsSaved === false). */
export function makeNewWidgetEntity(entityInfo: EntityInfo, contextUser: UserInfo): TestEntity {
  const entity = new TestEntity(entityInfo);
  entity.ContextCurrentUser = contextUser;
  entity.NewRecord();
  return entity;
}
