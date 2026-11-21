import { describe, it, expect } from 'vitest';
import { CompositeKey, EntityDependency, EntityInfo, GetRecordDependenciesOptions, KeyValuePair } from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider.js';

/**
 * Tests for `BuildSoftLinkDependencySQL` — the query that finds records pointing at a target record
 * through a polymorphic `EntityID`/`RecordID` column pair rather than a foreign key.
 *
 * The function had shipped since ~v2 but was never exercised, because its trigger
 * (`EntityField.EntityIDFieldName`) is NULL on every row in the system. Three defects fell out of
 * turning it on, and each has a test here:
 *
 *  - it filtered the discriminator on the *holder's* entity ID rather than the target's, so it looked
 *    for `TaskLink` rows pointing at `TaskLink`;
 *  - it compared the payload column against the bare first primary key value, but a `RecordID`
 *    column stores the canonical `ID|<guid>` encoding;
 *  - it derived string quoting from the holder's primary key type and applied it to both literals,
 *    emitting unquoted GUIDs for an integer-keyed holder.
 */

const TARGET_ENTITY_ID = 'AAAAAAAA-1111-1111-1111-AAAAAAAAAAAA';
const HOLDER_ENTITY_ID = 'BBBBBBBB-2222-2222-2222-BBBBBBBBBBBB';
const RECORD_GUID = '38CB433E-F36B-1410-8DA0-00021F8B792E';

type MockField = {
  Name: string;
  EntityIDFieldName: string | null;
  RelatedEntity?: string | null;
  RelatedEntityFieldName?: string | null;
  IsVirtual?: boolean;
};

function mockEntity(opts: {
  Name: string;
  ID: string;
  BaseView: string;
  BaseTable?: string;
  pk?: { Name: string; NeedsQuotes: boolean; IsVirtual?: boolean }[];
  Fields?: MockField[];
}): EntityInfo {
  const pk = opts.pk ?? [{ Name: 'ID', NeedsQuotes: true }];
  return {
    Name: opts.Name,
    ID: opts.ID,
    SchemaName: '__mj',
    BaseView: opts.BaseView,
    BaseTable: opts.BaseTable,
    PrimaryKeys: pk,
    FirstPrimaryKey: pk[0],
    Fields: opts.Fields ?? [],
  } as unknown as EntityInfo;
}

/** Stubs the two metadata members the SQL builder reads, so no database is involved. */
class TestProvider extends SQLServerDataProvider {
  constructor(private readonly _entities: EntityInfo[]) {
    super();
  }
  public override get Entities(): EntityInfo[] {
    return this._entities;
  }
  public override EntityByName(entityName: string): EntityInfo | undefined {
    return this._entities.find((e) => e.Name === entityName);
  }
  public buildSoftLinkSQL(entityName: string, key: CompositeKey, options?: GetRecordDependenciesOptions): string {
    return this.BuildSoftLinkDependencySQL(entityName, key, options);
  }
  public buildHardLinkSQL(
    depsOrName: EntityDependency[] | string,
    key: CompositeKey,
    options?: GetRecordDependenciesOptions,
  ): string {
    return this.BuildHardLinkDependencySQL(depsOrName, key, options);
  }
}

/** A GUID-keyed target ("Persons") and a holder ("Task Links") carrying one polymorphic pair. */
function guidKeyedFixture() {
  const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons' });
  const holder = mockEntity({
    Name: 'Task Links',
    ID: HOLDER_ENTITY_ID,
    BaseView: 'vwTaskLinks',
    Fields: [
      { Name: 'ID', EntityIDFieldName: null },
      { Name: 'EntityID', EntityIDFieldName: null },
      { Name: 'RecordID', EntityIDFieldName: 'EntityID' },
    ],
  });
  return new TestProvider([target, holder]);
}

describe('SQLServerDataProvider.BuildSoftLinkDependencySQL', () => {
  it('filters the discriminator on the TARGET entity, not the holder of the link', () => {
    const sql = guidKeyedFixture().buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

    expect(sql).toContain(`[EntityID] = '${TARGET_ENTITY_ID}'`);
    // The original bug: the holder's own ID went into the WHERE clause, so the query asked for
    // Task Links rows whose EntityID points at Task Links.
    expect(sql).not.toContain(HOLDER_ENTITY_ID);
  });

  it('matches both the canonical ID|<guid> encoding and bare <guid> for single-column keys', () => {
    const sql = guidKeyedFixture().buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

    expect(sql).toContain(`[RecordID] IN ('ID|${RECORD_GUID}', '${RECORD_GUID}')`);
  });

  it('uses equality against canonical RecordID when the key is composite', () => {
    const target = mockEntity({
      Name: 'OrderLines',
      ID: TARGET_ENTITY_ID,
      BaseView: 'vwOrderLines',
      pk: [
        { Name: 'OrderID', NeedsQuotes: true },
        { Name: 'LineNo', NeedsQuotes: false },
      ],
    });
    const holder = mockEntity({
      Name: 'Task Links',
      ID: HOLDER_ENTITY_ID,
      BaseView: 'vwTaskLinks',
      Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
    });
    const ck = new CompositeKey([new KeyValuePair('OrderID', RECORD_GUID), new KeyValuePair('LineNo', 1)]);
    const sql = new TestProvider([target, holder]).buildSoftLinkSQL('OrderLines', ck);

    expect(sql).toContain(`[RecordID] = 'OrderID|${RECORD_GUID}||LineNo|1'`);
  });

  it('reads from the holder and reports the target as the parent entity', () => {
    const sql = guidKeyedFixture().buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

    expect(sql).toContain('[__mj].[vwTaskLinks]');
    expect(sql).toContain("'Persons' AS EntityName");
    expect(sql).toContain("'Task Links' AS RelatedEntityName");
    expect(sql).toContain("'RecordID' AS FieldName");
  });

  it('marks every row as a soft link and names the discriminator column', () => {
    // Record merge needs this to know it must write ID|<guid> rather than a bare key value.
    const sql = guidKeyedFixture().buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

    expect(sql).toContain('1 AS IsSoftLink');
    expect(sql).toContain("'EntityID' AS EntityIDFieldName");
  });

  it('quotes both literals even when the holder has an integer primary key', () => {
    // The discriminator is always a uniqueidentifier and the payload always nvarchar, regardless of
    // the holder's own key type. Deriving quoting from the holder produced malformed SQL here.
    const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons' });
    const intHolder = mockEntity({
      Name: 'Legacy Links',
      ID: HOLDER_ENTITY_ID,
      BaseView: 'vwLegacyLinks',
      pk: [{ Name: 'LinkNo', NeedsQuotes: false }],
      Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
    });
    const sql = new TestProvider([target, intHolder]).buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

    expect(sql).toContain(`[EntityID] = '${TARGET_ENTITY_ID}'`);
    expect(sql).toContain(`[RecordID] IN ('ID|${RECORD_GUID}', '${RECORD_GUID}')`);
    expect(sql).not.toContain(`= ${TARGET_ENTITY_ID}`);
  });

  it('emits one UNION ALL branch per polymorphic field, including two on one holder', () => {
    const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons' });
    const twoLinks = mockEntity({
      Name: 'Record Links',
      ID: HOLDER_ENTITY_ID,
      BaseView: 'vwRecordLinks',
      Fields: [
        { Name: 'SourceRecordID', EntityIDFieldName: 'SourceEntityID' },
        { Name: 'TargetRecordID', EntityIDFieldName: 'TargetEntityID' },
      ],
    });
    const sql = new TestProvider([target, twoLinks]).buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

    expect(sql).toContain('[SourceEntityID] =');
    expect(sql).toContain('[TargetEntityID] =');
    expect(sql.match(/UNION ALL/g)).toHaveLength(1);
  });

  it('returns empty SQL when nothing declares a polymorphic pair', () => {
    // This is today's state for every entity in the system, and it must stay a no-op.
    const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons' });
    const plain = mockEntity({
      Name: 'Tasks',
      ID: HOLDER_ENTITY_ID,
      BaseView: 'vwTasks',
      Fields: [{ Name: 'PersonID', EntityIDFieldName: null }],
    });
    expect(new TestProvider([target, plain]).buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID))).toBe('');
  });

  it('throws when the target entity is not in metadata, rather than emitting undefined into SQL', () => {
    expect(() => guidKeyedFixture().buildSoftLinkSQL('No Such Entity', CompositeKey.FromID(RECORD_GUID))).toThrow(
      /not found in metadata/i,
    );
  });

  it('escapes an apostrophe in the record key instead of terminating the literal', () => {
    const target = mockEntity({
      Name: 'Widgets',
      ID: TARGET_ENTITY_ID,
      BaseView: 'vwWidgets',
      pk: [{ Name: 'Code', NeedsQuotes: true }],
    });
    const holder = mockEntity({
      Name: 'Task Links',
      ID: HOLDER_ENTITY_ID,
      BaseView: 'vwTaskLinks',
      Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
    });
    const key = CompositeKey.FromKeyValuePair('Code', "O'Brien");
    const sql = new TestProvider([target, holder]).buildSoftLinkSQL('Widgets', key);

    expect(sql).toContain("[RecordID] IN ('Code|O''Brien', 'O''Brien')");
  });

  it('selects from BaseTable when all referenced columns are physical, and falls back to BaseView when virtual', () => {
    const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons', BaseTable: 'Person' });
    const physicalHolder = mockEntity({
      Name: 'Task Links',
      ID: HOLDER_ENTITY_ID,
      BaseView: 'vwTaskLinks',
      BaseTable: 'TaskLink',
      Fields: [
        { Name: 'ID', EntityIDFieldName: null, IsVirtual: false },
        { Name: 'EntityID', EntityIDFieldName: null, IsVirtual: false },
        { Name: 'RecordID', EntityIDFieldName: 'EntityID', IsVirtual: false },
      ],
    });
    const virtualHolder = mockEntity({
      Name: 'Virtual Links',
      ID: 'CCCCCCCC-3333-3333-3333-CCCCCCCCCCCC',
      BaseView: 'vwVirtualLinks',
      BaseTable: 'VirtualLink',
      Fields: [
        { Name: 'ID', EntityIDFieldName: null, IsVirtual: false },
        { Name: 'EntityID', EntityIDFieldName: null, IsVirtual: true },
        { Name: 'RecordID', EntityIDFieldName: 'EntityID', IsVirtual: false },
      ],
    });

    const sql = new TestProvider([target, physicalHolder, virtualHolder]).buildSoftLinkSQL(
      'Persons',
      CompositeKey.FromID(RECORD_GUID),
    );

    expect(sql).toContain('[__mj].[TaskLink]');
    expect(sql).not.toContain('[__mj].[vwTaskLinks]');
    expect(sql).toContain('[__mj].[vwVirtualLinks]');
    expect(sql).not.toContain('[__mj].[VirtualLink]');
  });

  it('excludes system audit/telemetry entities when IncludeSystemEntities is false', () => {
    const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons' });
    const holder = mockEntity({
      Name: 'Task Links',
      ID: HOLDER_ENTITY_ID,
      BaseView: 'vwTaskLinks',
      BaseTable: 'TaskLink',
      Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
    });
    const recordChanges = mockEntity({
      Name: 'MJ: Record Changes',
      ID: 'DDDDDDDD-4444-4444-4444-DDDDDDDDDDDD',
      BaseView: 'vwRecordChanges',
      BaseTable: 'RecordChange',
      Fields: [{ Name: 'RecordID', EntityIDFieldName: 'EntityID' }],
    });

    const provider = new TestProvider([target, holder, recordChanges]);
    const filteredSQL = provider.buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID), {
      IncludeSystemEntities: false,
    });

    expect(filteredSQL).toContain("'Task Links' AS RelatedEntityName");
    expect(filteredSQL).not.toContain('MJ: Record Changes');
  });
});

describe('SQLServerDataProvider.BuildHardLinkDependencySQL', () => {
  it('queries BaseTable when FK column and PK are physical, and BaseView when FK column is virtual', () => {
    const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons', BaseTable: 'Person' });
    const physicalDep = mockEntity({
      Name: 'Tasks',
      ID: HOLDER_ENTITY_ID,
      BaseView: 'vwTasks',
      BaseTable: 'Task',
      Fields: [{ Name: 'PersonID', EntityIDFieldName: null, RelatedEntity: 'Persons', RelatedEntityFieldName: 'ID', IsVirtual: false }],
    });
    const virtualDep = mockEntity({
      Name: 'TaskSummaries',
      ID: 'EEEEEEEE-5555-5555-5555-EEEEEEEEEEEE',
      BaseView: 'vwTaskSummaries',
      BaseTable: 'TaskSummary',
      Fields: [{ Name: 'PersonID', EntityIDFieldName: null, RelatedEntity: 'Persons', RelatedEntityFieldName: 'ID', IsVirtual: true }],
    });

    const provider = new TestProvider([target, physicalDep, virtualDep]);
    const sql = provider.buildHardLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

    expect(sql).toContain('[__mj].[Task]');
    expect(sql).not.toContain('[__mj].[vwTasks]');
    expect(sql).toContain('[__mj].[vwTaskSummaries]');
    expect(sql).not.toContain('[__mj].[TaskSummary]');
    expect(sql).toContain('0 AS IsSoftLink');
  });

  it('respects IncludeSystemEntities: false and EntityNames filter in BuildHardLinkDependencySQL', () => {
    const target = mockEntity({ Name: 'Persons', ID: TARGET_ENTITY_ID, BaseView: 'vwPersons', BaseTable: 'Person' });
    const tasks = mockEntity({
      Name: 'Tasks',
      ID: HOLDER_ENTITY_ID,
      BaseView: 'vwTasks',
      BaseTable: 'Task',
      Fields: [{ Name: 'PersonID', EntityIDFieldName: null, RelatedEntity: 'Persons', RelatedEntityFieldName: 'ID' }],
    });
    const auditLogs = mockEntity({
      Name: 'MJ: Audit Logs',
      ID: 'FFFFFFFF-6666-6666-6666-FFFFFFFFFFFF',
      BaseView: 'vwAuditLogs',
      BaseTable: 'AuditLog',
      Fields: [{ Name: 'UserID', EntityIDFieldName: null, RelatedEntity: 'Persons', RelatedEntityFieldName: 'ID' }],
    });

    const provider = new TestProvider([target, tasks, auditLogs]);
    const sql = provider.buildHardLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID), {
      IncludeSystemEntities: false,
    });

    expect(sql).toContain("'Tasks' AS RelatedEntityName");
    expect(sql).not.toContain('MJ: Audit Logs');
  });
});
