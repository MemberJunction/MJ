import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import nunjucks from 'nunjucks';
import { ColumnStatsCache } from '../discovery/ColumnStatsCache';
import { SQLServerDriver } from '../drivers/SQLServerDriver';
import { PostgreSQLDriver } from '../drivers/PostgreSQLDriver';
import { MySQLDriver } from '../drivers/MySQLDriver';
import { Introspector } from '../database/Database';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver';
import type { AutoDocQueryResult, AutoDocSchema } from '../types/driver';
import type { CachedColumnStats } from '../types/discovery';
import type { SchemaDefinition } from '../types/state';

/**
 * Defects the data quality phase depends on, fixed alongside it:
 * - the discovery stats merge replaced the sampler's statistics (losing ranges and the value
 *   distribution) and wrote a 0-1 null fraction where the prompt prints a percentage;
 * - every driver reported an empty table as one row;
 * - the table prompt read `tableName`/`schemaName`, which the context never supplies;
 * - declared FK columns had no target, so the prompt printed "FOREIGN KEY → ..".
 */

afterEach(() => vi.restoreAllMocks());

function cached(column: string, extra: Partial<CachedColumnStats> = {}): CachedColumnStats {
  return {
    schemaName: 'dbo',
    tableName: 'T',
    columnName: column,
    dataType: 'int',
    totalRows: 200,
    nullCount: 60,
    nullPercentage: 0.3,
    distinctCount: 40,
    uniqueness: 0.2,
    dataPattern: 'natural',
    sampleValues: [1, 2],
    pkEligible: false,
    fkEligible: true,
    computedAt: 'now',
    queryTimeMs: 3,
    minValue: 1,
    maxValue: 99,
    ...extra,
  };
}

function schemaWith(statistics?: SchemaDefinition['tables'][number]['columns'][number]['statistics']): SchemaDefinition[] {
  return [
    {
      name: 'dbo',
      descriptionIterations: [],
      tables: [
        {
          name: 'T',
          rowCount: 200,
          dependsOn: [],
          dependents: [],
          descriptionIterations: [],
          columns: [{ name: 'C', dataType: 'int', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [], statistics }],
        },
      ],
    },
  ];
}

describe('ColumnStatsCache.MergeIntoSchemas', () => {
  it('keeps the sampled statistics and only adds what sampling does not produce', () => {
    const cache = new ColumnStatsCache();
    cache.SetColumnStats(cached('C', { dataPattern: 'sequential' }));
    const schemas = schemaWith({
      totalRows: 200,
      distinctCount: 40,
      uniquenessRatio: 0.2,
      nullCount: 60,
      nullPercentage: 30,
      sampleValues: [5],
      valueDistribution: [{ value: 5, frequency: 10 }],
      min: 1,
      max: 99,
      avg: 50,
      stdDev: 4,
      minLength: 1,
      maxLength: 2,
    });
    cache.MergeIntoSchemas(schemas);
    const s = schemas[0].tables[0].columns[0].statistics;
    expect(s).toMatchObject({
      nullPercentage: 30,
      min: 1,
      max: 99,
      avg: 50,
      stdDev: 4,
      minLength: 1,
      maxLength: 2,
      dataPattern: 'sequential',
      minValue: 1,
      maxValue: 99,
    });
    expect(s?.valueDistribution).toEqual([{ value: 5, frequency: 10 }]);
    expect(s?.sampleValues).toEqual([5]);
  });

  it('builds statistics from the cache when sampling did not run, with the null percentage on 0-100', () => {
    const cache = new ColumnStatsCache();
    cache.SetColumnStats(cached('C'));
    const schemas = schemaWith(undefined);
    cache.MergeIntoSchemas(schemas);
    const s = schemas[0].tables[0].columns[0].statistics;
    expect(s?.nullPercentage).toBe(30);
    expect(s?.min).toBe(1);
    expect(s?.max).toBe(99);
  });
});

describe('drivers report an empty table as zero rows', () => {
  type Row = Record<string, string | number | null>;
  const emptyRow: Row = { total_count: 0, distinct_count: 0, null_count: 0 };
  const cases: Array<[string, BaseAutoDocDriver]> = [
    ['SQL Server', new SQLServerDriver({ provider: 'sqlserver', host: 'h', database: 'd', user: 'u', password: 'p' })],
    ['PostgreSQL', new PostgreSQLDriver({ provider: 'postgresql', host: 'h', database: 'd', user: 'u', password: 'p' })],
    ['MySQL', new MySQLDriver({ provider: 'mysql', host: 'h', database: 'd', user: 'u', password: 'p' })],
  ];
  for (const [name, driver] of cases) {
    it(name, async () => {
      vi.spyOn(driver, 'executeQuery').mockImplementation(async (): Promise<AutoDocQueryResult<Row>> => ({ success: true, data: [emptyRow] }));
      const stats = await driver.getColumnStatistics('dbo', 'Empty', 'C', 'int', 20, 10);
      expect(stats.totalRows).toBe(0);
      expect(stats.uniquenessRatio).toBe(0);
      expect(stats.nullPercentage).toBe(0);
    });
  }
});

describe('declared foreign keys', () => {
  it('SQL Server reads whether each constraint is trusted', async () => {
    const driver = new SQLServerDriver({ provider: 'sqlserver', host: 'h', database: 'd', user: 'u', password: 'p' });
    vi.spyOn(driver, 'executeQuery').mockImplementation(async (query: string) => {
      if (query.includes('sys.foreign_key_columns') && query.includes('is_not_trusted')) {
        return {
          success: true,
          data: [
            {
              column_name: 'A',
              referenced_schema: 'dbo',
              referenced_table: 'P',
              referenced_column: 'Id',
              constraint_name: 'fk_ok',
              is_not_trusted: false,
              is_disabled: false,
            },
            {
              column_name: 'B',
              referenced_schema: 'dbo',
              referenced_table: 'P',
              referenced_column: 'Id',
              constraint_name: 'fk_nocheck',
              is_not_trusted: true,
              is_disabled: false,
            },
          ],
        };
      }
      return { success: true, data: [] };
    });
    const queries: string[] = [];
    const spy = vi.mocked(driver.executeQuery);
    const fks = await (driver as unknown as { getForeignKeys(s: string, t: string): Promise<Array<{ isTrusted?: boolean }>> }).getForeignKeys('dbo', 'C');
    for (const call of spy.mock.calls) queries.push(String(call[0]));
    expect(fks.map((f) => f.isTrusted)).toEqual([true, false]);
    // Composite keys keep their column order.
    expect(queries.join('\n')).toContain('ORDER BY fkc.name, fk.constraint_column_id');
  });

  it('PostgreSQL treats a NOT VALID constraint as untrusted', async () => {
    const driver = new PostgreSQLDriver({ provider: 'postgresql', host: 'h', database: 'd', user: 'u', password: 'p' });
    vi.spyOn(driver, 'executeQuery').mockImplementation(async (query: string) => {
      if (query.includes('pg_constraint')) {
        return {
          success: true,
          data: [{ column_name: 'a', referenced_schema: 'app', referenced_table: 'p', referenced_column: 'id', constraint_name: 'fk_a', is_validated: false }],
        };
      }
      return { success: true, data: [] };
    });
    const fks = await (driver as unknown as { getForeignKeys(s: string, t: string): Promise<Array<{ isTrusted?: boolean }>> }).getForeignKeys('app', 'c');
    expect(fks[0].isTrusted).toBe(false);
  });

  it('introspection gives each declared FK column its target and carries trust onto the relationship', async () => {
    const autoDoc: AutoDocSchema[] = [
      {
        name: 'dbo',
        tables: [
          {
            schemaName: 'dbo',
            tableName: 'Line',
            rowCount: 10,
            primaryKeys: [],
            columns: [
              { name: 'OfferId', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: true },
              { name: 'ProductId', dataType: 'int', isNullable: false, isPrimaryKey: false, isForeignKey: true },
            ],
            foreignKeys: [
              {
                columnName: 'OfferId',
                referencedSchema: 'dbo',
                referencedTable: 'OfferProduct',
                referencedColumn: 'OfferId',
                constraintName: 'fk_line',
                isTrusted: false,
              },
              {
                columnName: 'ProductId',
                referencedSchema: 'dbo',
                referencedTable: 'OfferProduct',
                referencedColumn: 'ProductId',
                constraintName: 'fk_line',
                isTrusted: false,
              },
            ],
          },
        ],
      },
    ];
    const driver = { getSchemas: async () => autoDoc, getExistingDescriptions: async () => [] } as unknown as BaseAutoDocDriver;
    const [schema] = await new Introspector(driver).GetSchemas({}, {});
    const line = schema.tables[0];
    expect(line.columns[1].foreignKeyReferences).toMatchObject({ schema: 'dbo', table: 'OfferProduct', column: 'ProductId', constraintName: 'fk_line' });
    expect(line.dependsOn.map((d) => d.isTrusted)).toEqual([false, false]);
  });
});

// ─── prompt templates ────────────────────────────────────────────────────────

function render(templateName: string, ctx: object): string {
  const env = new nunjucks.Environment(null, { autoescape: false }); // as PromptEngine configures it
  env.addFilter('jsoninline', (obj: object) => JSON.stringify(obj));
  env.addFilter('join', (arr: string[], sep = ', ') => (Array.isArray(arr) ? arr.join(sep) : ''));
  const template = fs.readFileSync(new URL(`../../prompts/${templateName}`, import.meta.url), 'utf-8');
  return env.renderString(template, ctx);
}

describe('table-analysis prompt', () => {
  const base = {
    schema: 'Sales',
    table: 'Order',
    rowCount: 1000,
    dependencyLevel: 2,
    dependsOn: [],
    dependents: [],
    columns: [
      {
        name: 'Status',
        dataType: 'nvarchar',
        isNullable: true,
        isPrimaryKey: false,
        isForeignKey: false,
        statistics: { distinctCount: 4, uniquenessRatio: 0.004, nullPercentage: 30, minValue: 'A', maxValue: 'Z', sampleValues: [] },
        quality: ['3 values differ only by letter case or surrounding spaces.'],
        enumCandidate: { distinctCount: 4, totalRows: 1000, cardinalityRatio: 0.004, dataType: 'nvarchar', values: ['Active', 'Closed'], variantsFolded: 2 },
      },
      {
        name: 'CustomerId',
        dataType: 'int',
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        foreignKeyReferences: { schema: 'Sales', table: 'Customer', column: 'Id' },
      },
    ],
  };

  it('names the table and its schema and shows the dependency level', () => {
    const out = render('table-analysis.md', base);
    expect(out).toContain('- **Name**: Order');
    expect(out).toContain('- **Schema**: Sales');
    expect(out).toContain('**Dependency Level**: 2');
  });

  it('prints the null percentage, the range from minValue, the FK target and the column quality line', () => {
    const out = render('table-analysis.md', base);
    expect(out).toContain('- Nulls: 30%');
    expect(out).toContain('- Range: A to Z');
    expect(out).toContain('**FOREIGN KEY** → Sales.Customer.Id');
    expect(out).toContain('- Data Quality: 3 values differ only by letter case or surrounding spaces.');
    expect(out).toContain('2 spellings that differ only by case or spaces were folded');
  });

  it('shows the observations block only when there are table facts', () => {
    expect(render('table-analysis.md', base)).not.toContain('## Data Quality Observations');
    const out = render('table-analysis.md', {
      ...base,
      dataQuality: ['CustomerId → Sales.Customer: 4 of 1,000 non-null rows (0.4%) have no matching row in Sales.Customer.'],
    });
    expect(out).toContain('## Data Quality Observations');
    expect(out).toContain('- CustomerId → Sales.Customer: 4 of 1,000');
  });
});

describe('fk-pruning-table prompt', () => {
  it('shows the measured orphan rate when there is one', () => {
    const candidate = { sourceColumn: 'CustomerId', targetSchema: 'Sales', targetTable: 'Customer', targetColumn: 'Id', confidence: 70, locked: false };
    const out = render('fk-pruning-table.md', {
      sourceSchema: 'Sales',
      sourceTable: 'Order',
      allTables: [],
      candidates: [
        { ...candidate, orphanRate: 0.125, checkedRows: 800 },
        { ...candidate, sourceColumn: 'ShipToId' },
      ],
    });
    expect(out).toContain('measured: 12.5% of 800 non-null rows have no matching target row');
    expect(out.match(/measured:/g)).toHaveLength(1);
  });
});
