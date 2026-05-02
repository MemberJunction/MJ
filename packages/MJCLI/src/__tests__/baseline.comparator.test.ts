import { describe, expect, it } from 'vitest';
import { compareSnapshots } from '../baseline/comparator';
import type { SchemaSnapshot, TableDataDump, BaselineCompareOptions } from '../baseline/types';

function emptySnapshot(overrides: Partial<SchemaSnapshot> = {}): SchemaSnapshot {
  return {
    dialect: 'mssql',
    schemas: [{ name: 'dbo' }],
    tables: [],
    views: [],
    procedures: [],
    functions: [],
    triggers: [],
    sequences: [],
    ...overrides,
  };
}

function makeTable(name: string, extras: Partial<{
  columns: { name: string; type: string; nullable?: boolean }[];
  pk: string[];
}> = {}): SchemaSnapshot['tables'][number] {
  const cols = extras.columns ?? [{ name: 'ID', type: 'int' }, { name: 'Name', type: 'nvarchar(255)' }];
  return {
    schema: 'dbo',
    name,
    hasIdentity: false,
    columns: cols.map((c, i) => ({
      name: c.name,
      ordinal: i + 1,
      dataType: c.type,
      isNullable: c.nullable ?? false,
      isIdentity: false,
      isComputed: false,
    })),
    primaryKey: extras.pk ? { name: `PK_${name}`, columns: extras.pk, clustered: true } : undefined,
    uniqueConstraints: [],
    indexes: [],
    foreignKeys: [],
    checks: [],
  };
}

const compareOpts: BaselineCompareOptions = {
  rowCompareMode: 'full',
  rowHashAlgo: 'sha256',
  rowDiffSampleLimit: 10,
};

describe('baseline/comparator', () => {
  it('reports clean for two identical empty snapshots', () => {
    const report = compareSnapshots({
      left: { snapshot: emptySnapshot(), data: [], label: 'L' },
      right: { snapshot: emptySnapshot(), data: [], label: 'R' },
      options: compareOpts,
    });
    expect(report.isClean).toBe(true);
    expect(report.objectDiffs).toHaveLength(0);
    expect(report.tableRowDiffs).toHaveLength(0);
  });

  it('reports missing table on left', () => {
    const report = compareSnapshots({
      left: { snapshot: emptySnapshot(), data: [], label: 'L' },
      right: { snapshot: emptySnapshot({ tables: [makeTable('Customer')] }), data: [], label: 'R' },
      options: compareOpts,
    });
    expect(report.isClean).toBe(false);
    expect(report.objectDiffs).toContainEqual(expect.objectContaining({
      kind: 'table', diffKind: 'missing-on-left', qualifiedName: 'dbo.customer',
    }));
  });

  it('reports column type difference', () => {
    const left = emptySnapshot({
      tables: [makeTable('Customer', { columns: [{ name: 'ID', type: 'int' }] })],
    });
    const right = emptySnapshot({
      tables: [makeTable('Customer', { columns: [{ name: 'ID', type: 'bigint' }] })],
    });
    const report = compareSnapshots({
      left: { snapshot: left, data: [], label: 'L' },
      right: { snapshot: right, data: [], label: 'R' },
      options: compareOpts,
    });
    expect(report.objectDiffs.some((d) => d.kind === 'column' && d.details?.includes('dataType'))).toBe(true);
  });

  it('reports view body differences', () => {
    const left = emptySnapshot({ views: [{ schema: 'dbo', name: 'V1', definition: 'SELECT 1' }] });
    const right = emptySnapshot({ views: [{ schema: 'dbo', name: 'V1', definition: 'SELECT 2' }] });
    const report = compareSnapshots({
      left: { snapshot: left, data: [], label: 'L' },
      right: { snapshot: right, data: [], label: 'R' },
      options: compareOpts,
    });
    expect(report.objectDiffs.some((d) => d.kind === 'view' && d.diffKind === 'changed')).toBe(true);
  });

  it('treats whitespace-only differences in view bodies as equal', () => {
    const left = emptySnapshot({ views: [{ schema: 'dbo', name: 'V1', definition: 'SELECT  1' }] });
    const right = emptySnapshot({ views: [{ schema: 'dbo', name: 'V1', definition: 'SELECT 1' }] });
    const report = compareSnapshots({
      left: { snapshot: left, data: [], label: 'L' },
      right: { snapshot: right, data: [], label: 'R' },
      options: compareOpts,
    });
    expect(report.objectDiffs.some((d) => d.kind === 'view')).toBe(false);
  });

  it('reports a row-level diff when a column value differs', () => {
    const snapshot = emptySnapshot({ tables: [makeTable('Customer', { pk: ['ID'] })] });
    const dumpA: TableDataDump = {
      schema: 'dbo', table: 'Customer',
      columns: ['ID', 'Name'],
      rows: [[1, 'Alice'], [2, 'Bob']],
      rowCount: 2,
    };
    const dumpB: TableDataDump = {
      schema: 'dbo', table: 'Customer',
      columns: ['ID', 'Name'],
      rows: [[1, 'Alice'], [2, 'Bobby']],
      rowCount: 2,
    };
    const report = compareSnapshots({
      left: { snapshot, data: [dumpA], label: 'L' },
      right: { snapshot, data: [dumpB], label: 'R' },
      options: compareOpts,
    });
    expect(report.isClean).toBe(false);
    expect(report.tableRowDiffs).toHaveLength(1);
    expect(report.tableRowDiffs[0].diffCount).toBeGreaterThan(0);
  });

  it('detects a row missing on one side', () => {
    const snapshot = emptySnapshot({ tables: [makeTable('Customer', { pk: ['ID'] })] });
    const dumpA: TableDataDump = {
      schema: 'dbo', table: 'Customer',
      columns: ['ID', 'Name'],
      rows: [[1, 'Alice'], [2, 'Bob']],
      rowCount: 2,
    };
    const dumpB: TableDataDump = {
      schema: 'dbo', table: 'Customer',
      columns: ['ID', 'Name'],
      rows: [[1, 'Alice']],
      rowCount: 1,
    };
    const report = compareSnapshots({
      left: { snapshot, data: [dumpA], label: 'L' },
      right: { snapshot, data: [dumpB], label: 'R' },
      options: compareOpts,
    });
    expect(report.tableRowDiffs[0].sampleDiffs.some((rd) => rd.diffKind === 'missing-on-right')).toBe(true);
  });

  it('counts mode reports diff only when rowCounts differ', () => {
    const snapshot = emptySnapshot({ tables: [makeTable('Customer', { pk: ['ID'] })] });
    const dumpA: TableDataDump = {
      schema: 'dbo', table: 'Customer', columns: ['ID', 'Name'],
      rows: [[1, 'a'], [2, 'b']], rowCount: 2,
    };
    const dumpB: TableDataDump = {
      schema: 'dbo', table: 'Customer', columns: ['ID', 'Name'],
      rows: [[1, 'a'], [2, 'changed']], rowCount: 2,
    };
    const report = compareSnapshots({
      left: { snapshot, data: [dumpA], label: 'L' },
      right: { snapshot, data: [dumpB], label: 'R' },
      options: { ...compareOpts, rowCompareMode: 'counts' },
    });
    expect(report.tableRowDiffs).toHaveLength(0);
  });

  it('respects ignore pattern', () => {
    const left = emptySnapshot({
      tables: [makeTable('flyway_schema_history')],
    });
    const right = emptySnapshot();
    const report = compareSnapshots({
      left: { snapshot: left, data: [], label: 'L' },
      right: { snapshot: right, data: [], label: 'R' },
      options: { ...compareOpts, ignorePattern: /^flyway_schema_history$/i },
    });
    expect(report.objectDiffs.some((d) => d.qualifiedName.includes('flyway_schema_history'))).toBe(false);
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
      tables: [{ ...makeTable('Order'), foreignKeys: [{ ...fkBase }] }],
    });
    const right = emptySnapshot({
      tables: [{ ...makeTable('Order'), foreignKeys: [{ ...fkBase, onDelete: 'NO_ACTION' as const }] }],
    });
    const report = compareSnapshots({
      left: { snapshot: left, data: [], label: 'L' },
      right: { snapshot: right, data: [], label: 'R' },
      options: compareOpts,
    });
    expect(report.objectDiffs.some((d) => d.kind === 'foreignKey' && d.details?.includes('on-delete'))).toBe(true);
  });
});
