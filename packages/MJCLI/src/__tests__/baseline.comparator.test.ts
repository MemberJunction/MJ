import { describe, expect, it } from 'vitest';
import { CompareSnapshots } from '../baseline/comparator';
import type { SchemaSnapshot, TableDataDump, BaselineCompareOptions } from '../baseline/types';

function emptySnapshot(overrides: Partial<SchemaSnapshot> = {}): SchemaSnapshot {
  return {
    Dialect: 'mssql',
    Schemas: [{ name: 'dbo' }],
    Tables: [],
    Views: [],
    Procedures: [],
    Functions: [],
    Triggers: [],
    Sequences: [],
    UserDefinedTypes: [],
    ExtendedProperties: [],
    Principals: [],
    RoleMemberships: [],
    Permissions: [],
    ...overrides,
  };
}

function makeTable(name: string, extras: Partial<{
  columns: { name: string; type: string; nullable?: boolean }[];
  pk: string[];
}> = {}): SchemaSnapshot['Tables'][number] {
  const cols = extras.columns ?? [{ name: 'ID', type: 'int' }, { name: 'Name', type: 'nvarchar(255)' }];
  return {
    Schema: 'dbo',
    Name: name,
    HasIdentity: false,
    Columns: cols.map((c, i) => ({
      name: c.name,
      ordinal: i + 1,
      dataType: c.type,
      isNullable: c.nullable ?? false,
      isIdentity: false,
      isComputed: false,
    })),
    primaryKey: extras.pk ? { Name: `PK_${name}`, Columns: extras.pk, Clustered: true } : undefined,
    UniqueConstraints: [],
    Indexes: [],
    ForeignKeys: [],
    Checks: [],
  };
}

const compareOpts: BaselineCompareOptions = {
  RowCompareMode: 'full',
  RowHashAlgo: 'sha256',
  RowDiffSampleLimit: 10,
};

describe('baseline/comparator', () => {
  it('reports clean for two identical empty snapshots', () => {
    const report = CompareSnapshots({
      Left: { snapshot: emptySnapshot(), data: [], label: 'L' },
      Right: { snapshot: emptySnapshot(), data: [], label: 'R' },
      Options: compareOpts,
    });
    expect(report.isClean).toBe(true);
    expect(report.objectDiffs).toHaveLength(0);
    expect(report.tableRowDiffs).toHaveLength(0);
  });

  it('reports missing table on left', () => {
    const report = CompareSnapshots({
      Left: { snapshot: emptySnapshot(), data: [], label: 'L' },
      Right: { snapshot: emptySnapshot({ Tables: [makeTable('Customer')] }), data: [], label: 'R' },
      Options: compareOpts,
    });
    expect(report.isClean).toBe(false);
    expect(report.objectDiffs).toContainEqual(expect.objectContaining({
      Kind: 'table', DiffKind: 'missing-on-left', QualifiedName: 'dbo.customer',
    }));
  });

  it('reports column type difference', () => {
    const left = emptySnapshot({
      Tables: [makeTable('Customer', { columns: [{ name: 'ID', type: 'int' }] })],
    });
    const right = emptySnapshot({
      Tables: [makeTable('Customer', { columns: [{ name: 'ID', type: 'bigint' }] })],
    });
    const report = CompareSnapshots({
      Left: { snapshot: left, data: [], label: 'L' },
      Right: { snapshot: right, data: [], label: 'R' },
      Options: compareOpts,
    });
    expect(report.objectDiffs.some((d) => d.Kind === 'column' && d.details?.includes('dataType'))).toBe(true);
  });

  it('reports view body differences', () => {
    const left = emptySnapshot({ Views: [{ schema: 'dbo', name: 'V1', definition: 'SELECT 1' }] });
    const right = emptySnapshot({ Views: [{ schema: 'dbo', name: 'V1', definition: 'SELECT 2' }] });
    const report = CompareSnapshots({
      Left: { snapshot: left, data: [], label: 'L' },
      Right: { snapshot: right, data: [], label: 'R' },
      Options: compareOpts,
    });
    expect(report.objectDiffs.some((d) => d.Kind === 'view' && d.DiffKind === 'changed')).toBe(true);
  });

  it('treats whitespace-only differences in view bodies as equal', () => {
    const left = emptySnapshot({ Views: [{ schema: 'dbo', name: 'V1', definition: 'SELECT  1' }] });
    const right = emptySnapshot({ Views: [{ schema: 'dbo', name: 'V1', definition: 'SELECT 1' }] });
    const report = CompareSnapshots({
      Left: { snapshot: left, data: [], label: 'L' },
      Right: { snapshot: right, data: [], label: 'R' },
      Options: compareOpts,
    });
    expect(report.objectDiffs.some((d) => d.Kind === 'view')).toBe(false);
  });

  it('reports a row-level diff when a column value differs', () => {
    const snapshot = emptySnapshot({ Tables: [makeTable('Customer', { pk: ['ID'] })] });
    const dumpA: TableDataDump = {
      Schema: 'dbo', Table: 'Customer',
      Columns: ['ID', 'Name'],
      Rows: [[1, 'Alice'], [2, 'Bob']],
      RowCount: 2,
    };
    const dumpB: TableDataDump = {
      Schema: 'dbo', Table: 'Customer',
      Columns: ['ID', 'Name'],
      Rows: [[1, 'Alice'], [2, 'Bobby']],
      RowCount: 2,
    };
    const report = CompareSnapshots({
      Left: { snapshot, data: [dumpA], label: 'L' },
      Right: { snapshot, data: [dumpB], label: 'R' },
      Options: compareOpts,
    });
    expect(report.isClean).toBe(false);
    expect(report.tableRowDiffs).toHaveLength(1);
    expect(report.tableRowDiffs[0].DiffCount).toBeGreaterThan(0);
  });

  it('detects a row missing on one side', () => {
    const snapshot = emptySnapshot({ Tables: [makeTable('Customer', { pk: ['ID'] })] });
    const dumpA: TableDataDump = {
      Schema: 'dbo', Table: 'Customer',
      Columns: ['ID', 'Name'],
      Rows: [[1, 'Alice'], [2, 'Bob']],
      RowCount: 2,
    };
    const dumpB: TableDataDump = {
      Schema: 'dbo', Table: 'Customer',
      Columns: ['ID', 'Name'],
      Rows: [[1, 'Alice']],
      RowCount: 1,
    };
    const report = CompareSnapshots({
      Left: { snapshot, data: [dumpA], label: 'L' },
      Right: { snapshot, data: [dumpB], label: 'R' },
      Options: compareOpts,
    });
    expect(report.tableRowDiffs[0].SampleDiffs.some((rd) => rd.DiffKind === 'missing-on-right')).toBe(true);
  });

  it('counts mode reports diff only when rowCounts differ', () => {
    const snapshot = emptySnapshot({ Tables: [makeTable('Customer', { pk: ['ID'] })] });
    const dumpA: TableDataDump = {
      Schema: 'dbo', Table: 'Customer', Columns: ['ID', 'Name'],
      Rows: [[1, 'a'], [2, 'b']], RowCount: 2,
    };
    const dumpB: TableDataDump = {
      Schema: 'dbo', Table: 'Customer', Columns: ['ID', 'Name'],
      Rows: [[1, 'a'], [2, 'changed']], RowCount: 2,
    };
    const report = CompareSnapshots({
      Left: { snapshot, data: [dumpA], label: 'L' },
      Right: { snapshot, data: [dumpB], label: 'R' },
      Options: { ...compareOpts, RowCompareMode: 'counts' },
    });
    expect(report.tableRowDiffs).toHaveLength(0);
  });

  it('respects ignore pattern', () => {
    const left = emptySnapshot({
      Tables: [makeTable('flyway_schema_history')],
    });
    const right = emptySnapshot();
    const report = CompareSnapshots({
      Left: { snapshot: left, data: [], label: 'L' },
      Right: { snapshot: right, data: [], label: 'R' },
      Options: { ...compareOpts, ignorePattern: /^flyway_schema_history$/i },
    });
    expect(report.objectDiffs.some((d) => d.QualifiedName.includes('flyway_schema_history'))).toBe(false);
  });

  it('reports FK target and action differences', () => {
    const fkBase = {
      name: 'FK_X',
      columns: ['CustomerID'],
      referencedSchema: 'dbo',
      referencedTable: 'Customer',
      referencedColumns: ['ID'],
      onDelete: 'CASCADE' as const,
      onUpdate: 'NO_ACTION' as const,
    };
    const left = emptySnapshot({
      Tables: [{ ...makeTable('Order'), ForeignKeys: [{ ...fkBase }] }],
    });
    const right = emptySnapshot({
      Tables: [{ ...makeTable('Order'), ForeignKeys: [{ ...fkBase, onDelete: 'NO_ACTION' as const }] }],
    });
    const report = CompareSnapshots({
      Left: { snapshot: left, data: [], label: 'L' },
      Right: { snapshot: right, data: [], label: 'R' },
      Options: compareOpts,
    });
    expect(report.objectDiffs.some((d) => d.Kind === 'foreignKey' && d.details?.includes('on-delete'))).toBe(true);
  });
});
