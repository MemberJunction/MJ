/**
 * Composite-primary-key SQL shape for the SQL Server provider's PK-derived fragments.
 *
 * MJ entities can have any primary key — `ID`, `individual_id`, or a composite `(OrderID, LineNo)`.
 * Every core entity uses a single `ID`, so code that reads only the FIRST key column works on the
 * core product and silently truncates a composite key on customer entities. This file pins:
 *
 *   - GetRecordDependencyLinkSQL / BuildFullPrimaryKeyPredicate — when a dependency FK points at a
 *     non-key column, the record being checked is identified by its FULL key. A composite key must
 *     yield `pk1=v1 AND pk2=v2`; a single-column key must stay byte-identical to the former
 *     `<pk>=<value>` (quoted per the key's type).
 *   - BuildSiblingRecordChangeSQL — the IS-A sibling Record Change read uses the entity's real key
 *     column name, never a hardcoded `ID`.
 *   - executeSQLForUserViewRunLogging — UserViewRunDetail.RecordID holds ONE bare key value, so a
 *     composite-key entity is refused loudly instead of being logged/re-read on one column.
 *
 * Real EntityInfo/EntityFieldInfo instances are used so `NeedsQuotes` and `PrimaryKeys` are the
 * genuine metadata machinery, not stand-ins.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import { CompositeKey, EntityInfo } from '@memberjunction/core';
import type { EntityDependency, UserInfo } from '@memberjunction/core';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { TEST_USER } from './helpers/entity-fixtures';

type Host = {
  GetRecordDependencyLinkSQL: (dep: EntityDependency, entity: EntityInfo, relatedEntity: EntityInfo, key: CompositeKey) => string;
  BuildFullPrimaryKeyPredicate: (entity: EntityInfo, key: CompositeKey) => string;
  BuildSiblingRecordChangeSQL: (varName: string, entityInfo: EntityInfo, changesJSON: string, changesDesc: string, pkValue: string, userId: string) => string;
  executeSQLForUserViewRunLogging: (viewId: number, entityInfo: EntityInfo, effectiveBaseView: string, whereSQL: string, orderBySQL: string, user: UserInfo) => Promise<{ executeViewSQL: string; runID: string }>;
  ExecuteSQL: (sql: string) => Promise<Array<Record<string, unknown>>>;
};

interface RecordedHost extends Host {
  ExecutedSQL: string[];
}

function makeHost(): RecordedHost {
  const host = Object.create(SQLServerDataProvider.prototype) as Record<string, unknown>;
  Object.defineProperty(host, 'MJCoreSchemaName', { value: '__mj' });
  const executed: string[] = [];
  host.ExecutedSQL = executed;
  host.ExecuteSQL = async (sql: string) => {
    executed.push(sql);
    return [{ UserViewRunID: 'RUN-1' }];
  };
  return host as unknown as RecordedHost;
}

const FIELD_BASE = {
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

interface FieldSpec {
  Name: string;
  Type: string;
  Length?: number;
  IsPrimaryKey?: boolean;
  RelatedEntityFieldName?: string;
}

function makeEntity(id: string, name: string, schema: string, baseView: string, fields: FieldSpec[]): EntityInfo {
  return new EntityInfo({
    ID: id,
    Name: name,
    Status: 'Active',
    SchemaName: schema,
    BaseTable: baseView.replace(/^vw/, ''),
    BaseTableCodeName: baseView.replace(/^vw/, ''),
    BaseView: baseView,
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    AllowDeleteAPI: true,
    TrackRecordChanges: true,
    ExternalDataSourceID: null,
    VirtualEntity: false,
    EntityFields: fields.map((f, i) => ({
      ...FIELD_BASE,
      ID: `${id.substring(0, 8)}-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
      EntityID: id,
      Sequence: i + 1,
      Name: f.Name,
      Type: f.Type,
      Length: f.Length ?? (f.Type === 'int' ? 4 : f.Type === 'uniqueidentifier' ? 16 : 200),
      IsPrimaryKey: f.IsPrimaryKey ?? false,
      IsUnique: f.IsPrimaryKey ?? false,
      RelatedEntityFieldName: f.RelatedEntityFieldName ?? null,
    })),
    EntityPermissions: [],
  });
}

/** Single uniqueidentifier key named `ID` — the shape every MJ core entity has. */
const WIDGETS = makeEntity('A1000000-0000-0000-0000-000000000001', 'Widgets', 'dbo', 'vwWidgets', [
  { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
  { Name: 'Code', Type: 'nvarchar' },
]);
/** Single int key with a non-`ID` name — a customer entity mapped from an external schema. */
const INDIVIDUALS = makeEntity('A3000000-0000-0000-0000-000000000003', 'Individuals', 'crm', 'vwIndividuals', [
  { Name: 'individual_id', Type: 'int', IsPrimaryKey: true },
  { Name: 'Email', Type: 'nvarchar' },
]);
/** Composite key — int + nvarchar so the two columns quote differently. */
const ORDER_LINES = makeEntity('A2000000-0000-0000-0000-000000000002', 'Order Lines', 'sales', 'vwOrderLines', [
  { Name: 'OrderID', Type: 'int', IsPrimaryKey: true },
  { Name: 'LineCode', Type: 'nvarchar', Length: 20, IsPrimaryKey: true },
  { Name: 'SKU', Type: 'nvarchar' },
]);

describe('BuildFullPrimaryKeyPredicate', () => {
  const host = makeHost();

  it('single-column key renders exactly `<pk>=<quoted value>` — the pre-composite shape', () => {
    const key = new CompositeKey([{ FieldName: 'ID', Value: 'abc-123' }]);
    expect(host.BuildFullPrimaryKeyPredicate(WIDGETS, key)).toBe("ID='abc-123'");
  });

  it('single-column int key is unquoted and uses the real column name, never ID', () => {
    const key = new CompositeKey([{ FieldName: 'individual_id', Value: 42 }]);
    expect(host.BuildFullPrimaryKeyPredicate(INDIVIDUALS, key)).toBe('individual_id=42');
  });

  it('composite key ANDs every column, quoting each per its own type', () => {
    const key = new CompositeKey([{ FieldName: 'OrderID', Value: 7 }, { FieldName: 'LineCode', Value: 'L-3' }]);
    expect(host.BuildFullPrimaryKeyPredicate(ORDER_LINES, key)).toBe("OrderID=7 AND LineCode='L-3'");
  });

  it('matches key values by field name regardless of pair order', () => {
    const key = new CompositeKey([{ FieldName: 'LineCode', Value: 'L-3' }, { FieldName: 'OrderID', Value: 7 }]);
    expect(host.BuildFullPrimaryKeyPredicate(ORDER_LINES, key)).toBe("OrderID=7 AND LineCode='L-3'");
  });
});

describe('GetRecordDependencyLinkSQL — FK to a non-key column identifies the record by its FULL key', () => {
  const host = makeHost();

  it('single-column key: sub-query WHERE is the former `<pk>=<value>` shape, unchanged', () => {
    const related = makeEntity('B1000000-0000-0000-0000-000000000001', 'Widget Notes', 'dbo', 'vwWidgetNotes', [
      { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
      { Name: 'WidgetCode', Type: 'nvarchar', RelatedEntityFieldName: 'Code' },
    ]);
    const dep: EntityDependency = { EntityName: 'Widgets', RelatedEntityName: 'Widget Notes', FieldName: 'WidgetCode' };
    const sql = host.GetRecordDependencyLinkSQL(dep, WIDGETS, related, new CompositeKey([{ FieldName: 'ID', Value: 'abc-123' }]));
    expect(sql).toBe("(SELECT Code FROM [dbo].vwWidgets WHERE ID='abc-123')");
  });

  it('composite key: sub-query WHERE carries both key columns, so it resolves to exactly one row', () => {
    const related = makeEntity('B2000000-0000-0000-0000-000000000002', 'Shipments', 'sales', 'vwShipments', [
      { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
      { Name: 'LineSKU', Type: 'nvarchar', RelatedEntityFieldName: 'SKU' },
    ]);
    const dep: EntityDependency = { EntityName: 'Order Lines', RelatedEntityName: 'Shipments', FieldName: 'LineSKU' };
    const key = new CompositeKey([{ FieldName: 'OrderID', Value: 7 }, { FieldName: 'LineCode', Value: 'L-3' }]);
    const sql = host.GetRecordDependencyLinkSQL(dep, ORDER_LINES, related, key);
    expect(sql).toBe("(SELECT SKU FROM [sales].vwOrderLines WHERE OrderID=7 AND LineCode='L-3')");
  });

  it('FK to the `id` column still short-circuits to the bare quoted value', () => {
    const related = makeEntity('B3000000-0000-0000-0000-000000000003', 'Widget Tags', 'dbo', 'vwWidgetTags', [
      { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
      { Name: 'WidgetID', Type: 'uniqueidentifier', RelatedEntityFieldName: 'ID' },
    ]);
    const dep: EntityDependency = { EntityName: 'Widgets', RelatedEntityName: 'Widget Tags', FieldName: 'WidgetID' };
    const sql = host.GetRecordDependencyLinkSQL(dep, WIDGETS, related, new CompositeKey([{ FieldName: 'ID', Value: 'abc-123' }]));
    expect(sql).toBe("'abc-123'");
  });
});

describe('BuildSiblingRecordChangeSQL — IS-A sibling read uses the real key column', () => {
  const host = makeHost();

  it('uses the entity primary key name, not a hardcoded ID', () => {
    const sql = host.BuildSiblingRecordChangeSQL('@_rc_prop_0', INDIVIDUALS, '{}', 'desc', '42', 'u-1');
    expect(sql).toContain('FROM [crm].[vwIndividuals] WHERE [individual_id] = \'42\'');
    expect(sql).not.toContain('[ID]');
  });

  it('ID-keyed entity is unchanged', () => {
    const sql = host.BuildSiblingRecordChangeSQL('@_rc_prop_0', WIDGETS, '{}', 'desc', 'abc-123', 'u-1');
    expect(sql).toContain('FROM [dbo].[vwWidgets] WHERE [ID] = \'abc-123\'');
  });
});

describe('executeSQLForUserViewRunLogging — RecordID holds ONE bare key value', () => {
  it('single-column key: logs and re-reads on the real key column name', async () => {
    const host = makeHost();
    const result = await host.executeSQLForUserViewRunLogging(5, INDIVIDUALS, 'vwIndividuals', "Email LIKE '%@x.org'", 'Email', TEST_USER);
    expect(result.runID).toBe('RUN-1');
    expect(host.ExecutedSQL[0]).toContain("INSERT INTO @ViewIDList (ID) (SELECT individual_id FROM [crm].vwIndividuals WHERE (Email LIKE '%@x.org'))");
    expect(result.executeViewSQL).toContain('FROM [crm].vwIndividuals WHERE individual_id IN');
    expect(result.executeViewSQL).toContain('WHERE UserViewRunID=RUN-1');
  });

  it('composite key: refuses loudly before touching the database', async () => {
    const host = makeHost();
    await expect(host.executeSQLForUserViewRunLogging(5, ORDER_LINES, 'vwOrderLines', '1=1', '', TEST_USER))
      .rejects.toThrow(/SaveViewResults \(user view run logging\) requires a single-column primary key\. Entity "Order Lines" has 2 primary key columns \(OrderID, LineCode\)\./);
    expect(host.ExecutedSQL).toHaveLength(0);
  });
});
