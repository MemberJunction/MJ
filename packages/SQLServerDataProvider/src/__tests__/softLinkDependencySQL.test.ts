import { describe, it, expect } from 'vitest';
import { CompositeKey, EntityInfo } from '@memberjunction/core';
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

type MockField = { Name: string; EntityIDFieldName: string | null };

function mockEntity(opts: {
  Name: string;
  ID: string;
  BaseView: string;
  pk?: { Name: string; NeedsQuotes: boolean }[];
  Fields?: MockField[];
}): EntityInfo {
  const pk = opts.pk ?? [{ Name: 'ID', NeedsQuotes: true }];
  return {
    Name: opts.Name,
    ID: opts.ID,
    SchemaName: '__mj',
    BaseView: opts.BaseView,
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
  public buildSoftLinkSQL(entityName: string, key: CompositeKey): string {
    return this.BuildSoftLinkDependencySQL(entityName, key);
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

  it('compares the payload column against the canonical ID|<guid> encoding', () => {
    const sql = guidKeyedFixture().buildSoftLinkSQL('Persons', CompositeKey.FromID(RECORD_GUID));

    expect(sql).toContain(`[RecordID] = 'ID|${RECORD_GUID}'`);
    // The bare value is what the old code compared against, and it matches nothing in a RecordID column.
    expect(sql).not.toContain(`[RecordID] = '${RECORD_GUID}'`);
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
    expect(sql).toContain(`[RecordID] = 'ID|${RECORD_GUID}'`);
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

    expect(sql).toContain("[RecordID] = 'Code|O''Brien'");
  });
});
