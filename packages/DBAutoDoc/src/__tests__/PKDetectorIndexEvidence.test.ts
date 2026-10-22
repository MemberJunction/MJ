import { describe, it, expect } from 'vitest';
import { PKDetector } from '../discovery/PKDetector';
import { ColumnStatsCache } from '../discovery/ColumnStatsCache';
import { ClassifySingleColumnKey, CompositeKeyIndexes, IsKeyIndex, INDEX_KEY_BOOST, UNIQUE_COMPOSITE_CONFIDENCE } from '../discovery/IndexKeyEvidence';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver';
import type { AutoDocIndex } from '../types/driver';
import type { ColumnStatistics, PKCandidate } from '../types/discovery';
import type { RelationshipDiscoveryConfig } from '../types/config';
import type { ColumnDefinition, TableDefinition } from '../types/state';

// ─── fixtures ────────────────────────────────────────────────────────────────

interface ColSpec { name: string; type?: string; nullable?: boolean; rows: number; distinct: number; nulls?: number; samples?: Array<string | number> }

function column(spec: ColSpec): ColumnDefinition {
  return { name: spec.name, dataType: spec.type ?? 'int', isNullable: spec.nullable ?? false, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] };
}

function index(name: string, columns: string[], extra: Partial<AutoDocIndex> = {}): AutoDocIndex {
  return { SchemaName: 'dbo', TableName: 'T', IndexName: name, Columns: columns, IncludeColumns: [], IsUnique: true, IsPrimaryKey: false, Method: 'btree', HasExpressions: false, ...extra };
}

function table(name: string, specs: ColSpec[], indexes?: AutoDocIndex[]): TableDefinition {
  return { name, rowCount: specs[0]?.rows ?? 0, dependsOn: [], dependents: [], columns: specs.map(column), descriptionIterations: [], indexes };
}

const CONFIG = {
  confidence: { primaryKeyMinimum: 0.7, foreignKeyMinimum: 0.6, llmValidationThreshold: 0.8 },
  sampling: { maxRowsPerTable: 1000, valueOverlapSampleSize: 100, statisticalSignificance: 100, compositeKeyMaxColumns: 3 },
  patterns: { primaryKeyNames: ['^id$', '.*_id$', '^pk_.*', '.*_key$'], foreignKeyNames: ['.*_id$'], compositeKeyIndicators: [] }
} as unknown as RelationshipDiscoveryConfig;

/** Runs the real detector against stubbed driver statistics. */
async function detect(t: TableDefinition, specs: ColSpec[], options: { indexBacked?: boolean; combinationUnique?: boolean } = {}): Promise<PKCandidate[]> {
  const bySpec = new Map(specs.map((s) => [s.name, s]));
  const driver = {
    getColumnStatisticsForDiscovery: async (_s: string, _t: string, col: string, type: string): Promise<ColumnStatistics> => {
      const s = bySpec.get(col)!;
      return { columnName: col, dataType: type, totalRows: s.rows, nullCount: s.nulls ?? 0, distinctCount: s.distinct, sampleValues: s.samples ?? (s.rows ? [1, 2, 3] : []) };
    },
    checkColumnCombinationUniqueness: async () => options.combinationUnique ?? false
  } as unknown as BaseAutoDocDriver;
  const config = { ...CONFIG, indexBackedCandidates: options.indexBacked } as RelationshipDiscoveryConfig;
  return new PKDetector(driver, config, new ColumnStatsCache()).DetectPKCandidates('dbo', t, 1);
}

const cols = (c: PKCandidate[]) => c.map((x) => x.columnNames.join('+'));

// ─── pure helpers ────────────────────────────────────────────────────────────

describe('IndexKeyEvidence', () => {
  it('only PK and unique indexes without a filter or expression parts can back a key', () => {
    expect(IsKeyIndex(index('uq', ['a']))).toBe(true);
    expect(IsKeyIndex(index('pk', ['a'], { IsUnique: false, IsPrimaryKey: true }))).toBe(true);
    expect(IsKeyIndex(index('ix', ['a'], { IsUnique: false }))).toBe(false);
    expect(IsKeyIndex(index('uq_f', ['a'], { FilterDefinition: 'a > 0' }))).toBe(false);
    expect(IsKeyIndex(index('uq_x', ['(expression)'], { HasExpressions: true }))).toBe(false);
  });

  it('classifies a single column by its backing index; a primary-key index counts as unique', () => {
    const t = { indexes: [index('uq_code', ['Code']), index('pk_id', ['ID'], { IsUnique: false, IsPrimaryKey: true }), index('uq_pair', ['ID', 'Code'])] };
    expect(ClassifySingleColumnKey(t, { name: 'id', isNullable: false })).toMatchObject({ Kind: 'UniqueNotNull', Index: { IndexName: 'pk_id' } });
    expect(ClassifySingleColumnKey(t, { name: 'Code', isNullable: false })?.Kind).toBe('UniqueNotNull');
    expect(ClassifySingleColumnKey(t, { name: 'Code', isNullable: true })?.Kind).toBe('UniqueNullable');
    expect(ClassifySingleColumnKey(t, { name: 'Other', isNullable: false })).toBeUndefined();
    expect(CompositeKeyIndexes(t).map((i) => i.IndexName)).toEqual(['uq_pair']);
  });
});

// ─── PKDetector ──────────────────────────────────────────────────────────────

describe('PKDetector with index evidence', () => {
  // Northwind's customer_demographics: an empty table whose only evidence is a unique index.
  const EMPTY: ColSpec[] = [{ name: 'customer_type_id', type: 'bpchar', rows: 0, distinct: 0 }, { name: 'customer_desc', type: 'text', nullable: true, rows: 0, distinct: 0 }];

  it('an empty table with a unique index on a NOT NULL, well-named column gets a candidate above primaryKeyMinimum', async () => {
    const found = await detect(table('customer_demographics', EMPTY, [index('uq_type', ['customer_type_id'])]), EMPTY);
    expect(cols(found)).toEqual(['customer_type_id']);
    expect(found[0].confidence).toBeGreaterThanOrEqual(70);
    expect(found[0].evidence.backingIndex).toBe('uq_type');
  });

  it('gives that empty table nothing when the column is nullable, or when the switch is off', async () => {
    const nullable = EMPTY.map((s) => (s.name === 'customer_type_id' ? { ...s, nullable: true } : s));
    expect(await detect(table('customer_demographics', nullable, [index('uq_type', ['customer_type_id'])]), nullable)).toEqual([]);
    expect(await detect(table('customer_demographics', EMPTY, [index('uq_type', ['customer_type_id'])]), EMPTY, { indexBacked: false })).toEqual([]);
  });

  it('still applies the blacklist to a unique index (a natural key like name is not the PK)', async () => {
    const specs: ColSpec[] = [{ name: 'name', type: 'varchar(50)', rows: 0, distinct: 0 }];
    expect(await detect(table('things', specs, [index('uq_name', ['name'])]), specs)).toEqual([]);
  });

  it('keeps a surrogate id ahead of a unique natural key on the same table', async () => {
    const specs: ColSpec[] = [{ name: 'id', rows: 500, distinct: 500 }, { name: 'email', type: 'varchar(200)', rows: 500, distinct: 500, samples: ['a@x.org', 'b@x.org'] }];
    const found = await detect(table('users', specs, [index('uq_email', ['email'])]), specs);
    expect(found[0].columnNames).toEqual(['id']);
  });

  it('boosts a unique index on a nullable column that has no nulls', async () => {
    const specs: ColSpec[] = [{ name: 'code_key', type: 'varchar(10)', nullable: true, rows: 40, distinct: 40, samples: ['A1', 'B2'] }];
    const withIndex = await detect(table('codes', specs, [index('uq_code', ['code_key'])]), specs);
    const without = await detect(table('codes', specs), specs);
    expect(withIndex[0].confidence - without[0].confidence).toBe(INDEX_KEY_BOOST.UniqueNullable);
  });

  it('ranks the nullable boost below the NOT NULL one (NULLs can repeat in a unique index)', () => {
    expect(INDEX_KEY_BOOST.UniqueNullable).toBeGreaterThan(0);
    expect(INDEX_KEY_BOOST.UniqueNullable).toBeLessThan(INDEX_KEY_BOOST.UniqueNotNull);
  });

  it('considers composite unique indexes even when a surrogate key exists', async () => {
    const specs: ColSpec[] = [{ name: 'line_id', rows: 300, distinct: 300 }, { name: 'order_id', rows: 300, distinct: 60 }, { name: 'line_no', rows: 300, distinct: 5 }];
    const found = await detect(table('order_line', specs, [index('uq_order_line', ['order_id', 'line_no'])]), specs);
    const composite = found.find((c) => c.columnNames.length === 2);
    expect(composite?.columnNames).toEqual(['order_id', 'line_no']);
    expect(composite?.confidence).toBe(85);
    expect(found[0].columnNames).toEqual(['line_id']); // the surrogate still ranks first
  });

  it('skips a composite unique index on nullable columns unless the table has rows and no nulls', async () => {
    const empty: ColSpec[] = [{ name: 'a_id', nullable: true, rows: 0, distinct: 0 }, { name: 'b_id', nullable: true, rows: 0, distinct: 0 }];
    expect(await detect(table('pairs', empty, [index('uq_ab', ['a_id', 'b_id'])]), empty)).toEqual([]);
    const withNulls: ColSpec[] = [{ name: 'a_id', nullable: true, rows: 30, distinct: 10, nulls: 2 }, { name: 'b_id', nullable: true, rows: 30, distinct: 3 }];
    expect((await detect(table('pairs', withNulls, [index('uq_ab', ['a_id', 'b_id'])]), withNulls)).filter((c) => c.columnNames.length === 2)).toEqual([]);
  });

  it('accepts a composite unique index on nullable columns that show no nulls in a non-empty table, at the lower confidence', async () => {
    const specs: ColSpec[] = [{ name: 'a_id', nullable: true, rows: 30, distinct: 10 }, { name: 'b_id', nullable: true, rows: 30, distinct: 3 }];
    const composite = (await detect(table('pairs', specs, [index('uq_ab', ['a_id', 'b_id'])]), specs)).find((c) => c.columnNames.length === 2);
    expect(composite).toMatchObject({ columnNames: ['a_id', 'b_id'], confidence: UNIQUE_COMPOSITE_CONFIDENCE.NoNullsObserved, evidence: { backingIndex: 'uq_ab' } });
    expect(UNIQUE_COMPOSITE_CONFIDENCE.NoNullsObserved).toBeLessThan(UNIQUE_COMPOSITE_CONFIDENCE.NotNull);
  });

  it('treats a composite primary-key index like a composite unique index', async () => {
    const specs: ColSpec[] = [{ name: 'order_id', rows: 10, distinct: 10 }, { name: 'product_id', rows: 10, distinct: 4 }];
    const found = await detect(table('order_detail', specs, [index('pk_od', ['order_id', 'product_id'], { IsUnique: false, IsPrimaryKey: true })]), specs);
    expect(found.find((c) => c.columnNames.length === 2)).toMatchObject({ columnNames: ['order_id', 'product_id'], confidence: 85 });
  });
});
