import { describe, it, expect } from 'vitest';
import { BuildCachedColumnStats, DetectDataPattern, HasBlankOrZero } from '../discovery/ColumnStatsBuilder';
import { ColumnStatsCache } from '../discovery/ColumnStatsCache';
import { PKDetector } from '../discovery/PKDetector';
import { FKDetector } from '../discovery/FKDetector';
import { DiscoveryEngine } from '../discovery/DiscoveryEngine';
import type { AIConfig } from '../types/config';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver';
import type { RelationshipDiscoveryConfig } from '../types/config';
import type { ColumnDefinition, ColumnStatistics, SchemaDefinition, TableDefinition } from '../types/state';

/**
 * Relationship discovery used to start from an empty statistics cache and query every column again,
 * although the sampling pass had just measured the same columns (3-4 full scans per column, twice).
 * The cache is now seeded from the sampling statistics on the schema, and the detectors query only
 * the columns sampling did not cover.
 */

// ─── fixtures ────────────────────────────────────────────────────────────────

interface ColSpec {
  name: string;
  type?: string;
  rows?: number;
  distinct?: number;
  nulls?: number;
  samples?: Array<string | number | null>;
  /** false = the sampling pass did not reach this column */
  sampled?: boolean;
}

/** Statistics as DataSampler.AnalyzeTable records them (nullPercentage is 0–100 there). */
function sampledStats(spec: ColSpec): ColumnStatistics {
  const rows = spec.rows ?? 0;
  const nulls = spec.nulls ?? 0;
  const distinct = spec.distinct ?? 0;
  return {
    totalRows: rows,
    distinctCount: distinct,
    uniquenessRatio: rows ? distinct / rows : 0,
    nullCount: nulls,
    nullPercentage: rows ? (nulls / rows) * 100 : 0,
    sampleValues: spec.samples ?? [1, 2, 3],
    valueDistribution: [{ value: 1, frequency: 1 }],
    min: 1,
    max: rows,
    avg: 5.5,
    stdDev: 2.9,
    maxLength: 10,
    minLength: 1,
  };
}

function column(spec: ColSpec): ColumnDefinition {
  return {
    name: spec.name,
    dataType: spec.type ?? 'int',
    isNullable: (spec.nulls ?? 0) > 0,
    isPrimaryKey: false,
    isForeignKey: false,
    descriptionIterations: [],
    statistics: spec.sampled === false ? undefined : sampledStats(spec),
  };
}

function table(name: string, specs: ColSpec[]): TableDefinition {
  return { name, rowCount: specs[0]?.rows ?? 0, dependsOn: [], dependents: [], columns: specs.map(column), descriptionIterations: [] };
}

function schema(tables: TableDefinition[]): SchemaDefinition {
  return { name: 'dbo', tables, descriptionIterations: [] };
}

const CONFIG = {
  confidence: { primaryKeyMinimum: 0.7, foreignKeyMinimum: 0.6, llmValidationThreshold: 0.8 },
  sampling: { maxRowsPerTable: 1000, valueOverlapSampleSize: 100, statisticalSignificance: 100 },
  patterns: { primaryKeyNames: ['.*[Ii][Dd]$'], foreignKeyNames: ['.*[Ii][Dd]$'], compositeKeyIndicators: [] },
} as unknown as RelationshipDiscoveryConfig;

/** A driver that records every statistics query and, unless allowed, refuses it. */
function statsDriver(allowQueries: boolean): { driver: BaseAutoDocDriver; queried: string[] } {
  const queried: string[] = [];
  const driver = {
    getColumnStatisticsForDiscovery: async (_schema: string, _table: string, col: string, type: string) => {
      queried.push(col);
      if (!allowQueries) throw new Error(`discovery queried ${col} although sampling had measured it`);
      return { columnName: col, dataType: type, totalRows: 10, nullCount: 0, distinctCount: 10, sampleValues: [1, 2, 3] };
    },
    checkColumnCombinationUniqueness: async () => false,
  } as unknown as BaseAutoDocDriver;
  return { driver, queried };
}

const CUSTOMER: ColSpec[] = [
  { name: 'CustomerID', rows: 10, distinct: 10 },
  { name: 'Name', type: 'nvarchar', rows: 10, distinct: 8, samples: ['Ann', 'Bob'] },
  { name: 'Notes', type: 'nvarchar', rows: 10, distinct: 3, nulls: 7, samples: ['x', null] },
];

// ─── the builder ─────────────────────────────────────────────────────────────

describe('BuildCachedColumnStats', () => {
  const build = (over: Partial<Parameters<typeof BuildCachedColumnStats>[0]>) =>
    BuildCachedColumnStats({
      SchemaName: 'dbo',
      TableName: 'T',
      ColumnName: 'C',
      DataType: 'int',
      TotalRows: 10,
      NullCount: 0,
      DistinctCount: 10,
      SampleValues: [1, 2, 3],
      ...over,
    });

  it('uniqueness is distinct over all rows, and PK eligibility needs rows, no nulls, no blanks and 100% unique', () => {
    expect(build({})).toMatchObject({ uniqueness: 1, pkEligible: true, fkEligible: true });
    expect(build({ DistinctCount: 5 })).toMatchObject({ uniqueness: 0.5, pkEligible: false });
    expect(build({ NullCount: 1, DistinctCount: 9 })).toMatchObject({ pkEligible: false });
    expect(build({ TotalRows: 0, DistinctCount: 0 })).toMatchObject({ uniqueness: 0, pkEligible: false });
    expect(build({ SampleValues: [0, 1, 2] }).pkEligible).toBe(false);
    expect(build({ SampleValues: ['a', ' ', 'b'] }).pkEligible).toBe(false);
  });

  it('reports the null share as a fraction, whatever unit the source used', () => {
    expect(build({ NullCount: 2, DistinctCount: 8 }).nullPercentage).toBe(0.2);
  });

  it('keeps the value distribution sampling collected, so the enum gate still sees it after discovery', () => {
    expect(build({ ValueDistribution: [{ value: 'A', frequency: 4 }] }).valueDistribution).toEqual([{ value: 'A', frequency: 4 }]);
  });

  it('classifies values by type and sample', () => {
    expect(DetectDataPattern([], 'uniqueidentifier')).toBe('guid');
    expect(DetectDataPattern(['6f9619ff-8b86-d011-b42d-00c04fc964ff', '6f9619ff-8b86-d011-b42d-00c04fc964fe'], 'char')).toBe('guid');
    expect(DetectDataPattern([3, 1, 2], 'int')).toBe('sequential');
    expect(DetectDataPattern([5, 9], 'int')).toBe('unknown');
    expect(DetectDataPattern(['Ann', 'Bob'], 'nvarchar')).toBe('natural');
    expect(HasBlankOrZero(['a', '0'])).toBe(true);
    expect(HasBlankOrZero(undefined)).toBe(false);
  });
});

// ─── seeding the cache ───────────────────────────────────────────────────────

describe('ColumnStatsCache.SeedFromSchemas', () => {
  it('seeds every column sampling measured and skips the ones it did not', () => {
    const cache = new ColumnStatsCache();
    const specs = [...CUSTOMER, { name: 'Skipped', sampled: false }];
    expect(cache.SeedFromSchemas([schema([table('Customer', specs)])])).toBe(3);
    expect(cache.getColumnStats('dbo', 'Customer', 'CustomerID')).toMatchObject({
      totalRows: 10,
      distinctCount: 10,
      uniqueness: 1,
      pkEligible: true,
      dataPattern: 'sequential',
    });
    expect(cache.getColumnStats('dbo', 'Customer', 'Notes')).toMatchObject({ nullCount: 7, nullPercentage: 0.7, pkEligible: false });
    expect(cache.hasColumnStats('dbo', 'Customer', 'Skipped')).toBe(false);
  });

  it('never overwrites an entry the cache already holds', () => {
    const cache = new ColumnStatsCache();
    cache.setColumnStats(
      BuildCachedColumnStats({
        SchemaName: 'dbo',
        TableName: 'Customer',
        ColumnName: 'CustomerID',
        DataType: 'int',
        TotalRows: 10,
        NullCount: 0,
        DistinctCount: 5,
        SampleValues: [],
      }),
    );
    expect(cache.SeedFromSchemas([schema([table('Customer', CUSTOMER)])])).toBe(2);
    expect(cache.getColumnStats('dbo', 'Customer', 'CustomerID')?.uniqueness).toBe(0.5);
  });
});

describe('ColumnStatsCache.MergeIntoSchemas', () => {
  it('a sampled column keeps everything sampling recorded and gains the data pattern', () => {
    const t = table('Customer', CUSTOMER);
    const s = schema([t]);
    const cache = new ColumnStatsCache();
    cache.SeedFromSchemas([s]);
    cache.MergeIntoSchemas([s]);
    const id = t.columns[0].statistics!;
    expect(id.dataPattern).toBe('sequential');
    expect(id).toMatchObject({ avg: 5.5, stdDev: 2.9, maxLength: 10, minLength: 1, min: 1, max: 10 });
    expect(t.columns[2].statistics!.nullPercentage).toBe(70); // sampling's own unit, untouched
  });

  it('a column sampling did not cover gets the record discovery computed', () => {
    const t = table('Customer', [{ name: 'CustomerID', sampled: false }]);
    const s = schema([t]);
    const cache = new ColumnStatsCache();
    cache.setColumnStats(
      BuildCachedColumnStats({
        SchemaName: 'dbo',
        TableName: 'Customer',
        ColumnName: 'CustomerID',
        DataType: 'int',
        TotalRows: 4,
        NullCount: 0,
        DistinctCount: 4,
        SampleValues: [1, 2, 3, 4],
      }),
    );
    cache.MergeIntoSchemas([s]);
    expect(t.columns[0].statistics).toMatchObject({ totalRows: 4, distinctCount: 4, uniquenessRatio: 1, dataPattern: 'sequential' });
  });
});

// ─── the detectors use the seed ──────────────────────────────────────────────

describe('PKDetector with a seeded cache', () => {
  it('finds the key from sampling statistics without a single statistics query', async () => {
    const t = table('Customer', CUSTOMER);
    const cache = new ColumnStatsCache();
    cache.SeedFromSchemas([schema([t])]);
    const { driver, queried } = statsDriver(false);
    const found = await new PKDetector(driver, CONFIG, cache).DetectPKCandidates('dbo', t, 1);
    expect(found.map((c) => c.columnNames.join('+'))).toEqual(['CustomerID']);
    expect(queried).toEqual([]);
  });

  it('still queries a column sampling did not cover, and only that one', async () => {
    const t = table('Customer', [...CUSTOMER, { name: 'LegacyID', sampled: false }]);
    const cache = new ColumnStatsCache();
    cache.SeedFromSchemas([schema([t])]);
    const { driver, queried } = statsDriver(true);
    await new PKDetector(driver, CONFIG, cache).DetectPKCandidates('dbo', t, 1);
    expect(queried).toEqual(['LegacyID']);
    expect(cache.hasColumnStats('dbo', 'Customer', 'LegacyID')).toBe(true);
  });

  it('with no seed (the old behaviour) every column is queried', async () => {
    const t = table('Customer', CUSTOMER);
    const { driver, queried } = statsDriver(true);
    await new PKDetector(driver, CONFIG, new ColumnStatsCache()).DetectPKCandidates('dbo', t, 1);
    expect(queried).toEqual(['CustomerID', 'Name', 'Notes']);
  });
});

describe('DiscoveryEngine', () => {
  it('starts with the cache seeded from the schemas it is given, on a fresh run and on resume alike', () => {
    const progress: Array<[string, unknown]> = [];
    const engine = new DiscoveryEngine({
      Driver: statsDriver(false).driver,
      Config: { ...CONFIG, llmValidation: { enabled: false, batchSize: 10 } } as RelationshipDiscoveryConfig,
      AiConfig: { provider: 'gemini', model: 'gemini-3.8-flash', apiKey: 'test', temperature: 0, maxTokens: 100 } as AIConfig,
      schemas: [schema([table('Customer', CUSTOMER)])],
      OnProgress: (message, data) => progress.push([message, data]),
    });
    expect(
      engine
        .GetStatsCache()
        .getTableColumns('dbo', 'Customer')
        .map((c) => c.columnName),
    ).toEqual(['CustomerID', 'Name', 'Notes']);
    expect(progress).toContainEqual(['Seeded discovery statistics from sampling', { columns: 3 }]);
  });
});

describe('FKDetector with a seeded cache', () => {
  const ORDER: ColSpec[] = [
    { name: 'OrderID', rows: 10, distinct: 10 },
    { name: 'CustomerID', rows: 10, distinct: 4, samples: [1, 2, 3] },
  ];

  /** The FK path's other driver calls, stubbed; statistics queries are refused. */
  function fkDriver() {
    const { driver, queried } = statsDriver(false);
    Object.assign(driver, {
      getColumnInfo: async (_s: string, _t: string, col: string) => ({ name: col, type: 'int', nullable: false }),
      testValueOverlap: async () => 1.0,
      getSampleValues: async () => [1, 2, 3],
    });
    return { driver, queried };
  }

  it('measures cardinality from the seeded counts, so a seeded source and target cost no statistics query', async () => {
    const order = table('Order', ORDER);
    const customer = table('Customer', CUSTOMER);
    const schemas = [schema([order, customer])];
    const cache = new ColumnStatsCache();
    cache.SeedFromSchemas(schemas);
    const customerPK = {
      schemaName: 'dbo',
      tableName: 'Customer',
      columnNames: ['CustomerID'],
      confidence: 100,
    } as unknown as import('../types/discovery').PKCandidate;
    const { driver, queried } = fkDriver();
    const found = await new FKDetector(driver, CONFIG, cache).DetectFKCandidates(schemas, 'dbo', order, [customerPK], 1);
    // the target is reached by more than one route (name match and discovered PK), so dedupe
    expect(new Set(found.map((f) => `${f.sourceColumn} -> ${f.targetTable}.${f.targetColumn}`))).toEqual(new Set(['CustomerID -> Customer.CustomerID']));
    expect(found[0].evidence.cardinalityRatio).toBe(0.4); // 4 distinct customers referenced out of 10
    expect(queried).toEqual([]);
  });
});
