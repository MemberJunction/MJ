import { describe, it, expect } from 'vitest';
import {
  BuildDuplicateRowsStatement,
  BuildExactDistributionStatement,
  BuildRelationshipProbeStatement,
  BuildTableProbeStatement,
  MYSQL_QUALITY_DIALECT,
  POSTGRESQL_QUALITY_DIALECT,
  ParseProbeRow,
  QualityDialectFor,
  SQL_SERVER_QUALITY_DIALECT,
} from '../quality/QualityProbeSQL';
import { PlanRelationshipProbes } from '../quality/ProbePlanner';
import { ResolveDataQualityConfig } from '../quality/DataQualityConfig';
import { CreateRuleContext } from '../quality/DataQualityRules';
import type { DatabaseDocumentation } from '../types/state';
import type { RelationshipProbeSpec, TableQualityProbeSpec } from '../types/data-quality';

const spec: TableQualityProbeSpec = {
  Schema: 'Sales',
  Table: 'Order',
  Columns: [
    {
      Name: 'Status',
      DataType: 'nvarchar',
      DeclaredLength: 20,
      Measures: ['NonNull', 'Blank', 'Untrimmed', 'Variants', 'NumericLike', 'DateLike', 'AtCapacity'],
    },
    { Name: 'ShipDate', DataType: 'datetime', Measures: ['NonNull', 'SentinelDate', 'FutureDate'] },
    { Name: 'OrderQty', DataType: 'int', Measures: ['NonNull', 'Negative'] },
  ],
  CountDuplicateRows: false,
  FutureToleranceDays: 1,
};

describe('table probe SQL', () => {
  it('SQL Server: one statement, 64-bit counts, binary collation for exact distinct, byte lengths, date casts', () => {
    const { Sql, Aliases } = BuildTableProbeStatement(spec, spec.Columns, SQL_SERVER_QUALITY_DIALECT);
    expect(Sql).toContain('COUNT_BIG(*) AS rows_');
    expect(Sql).toContain('COLLATE Latin1_General_BIN2');
    expect(Sql).toContain('DATALENGTH([Status])');
    expect(Sql).toContain('TRY_CONVERT(float, [Status])');
    expect(Sql).toContain("CAST([ShipDate] AS date) IN (CAST('1753-01-01' AS date), CAST('1900-01-01' AS date), CAST('9999-12-31' AS date))");
    expect(Sql).toContain('DATEADD(day, 1, SYSDATETIME())');
    // Placeholder dates are not also counted as future dates.
    expect(Sql).toMatch(/\[ShipDate\] > DATEADD\(day, 1, SYSDATETIME\(\)\) AND NOT CAST\(\[ShipDate\] AS date\) IN/);
    expect(Sql).toContain('LEN([Status]) = 20');
    expect(Sql).toContain('FROM [Sales].[Order]');
    expect(Sql.trim().endsWith('OPTION (MAXDOP 1)')).toBe(true);
    // No subquery inside an aggregate: SQL Server rejects it.
    expect(Sql).not.toMatch(/COUNT_BIG\(CASE WHEN[^)]*SELECT/);
    expect(Aliases.map((a) => a.Alias)).toContain('c1_sentinel');
    expect(Aliases.every((a) => a.Alias === a.Alias.toLowerCase())).toBe(true);
  });

  it('SQL Server: smalldatetime uses its own placeholder dates, which fit its range', () => {
    const small = { ...spec, Columns: [{ Name: 'D', DataType: 'smalldatetime', Measures: ['SentinelDate' as const] }] };
    const { Sql } = BuildTableProbeStatement(small, small.Columns, SQL_SERVER_QUALITY_DIALECT);
    expect(Sql).toContain("CAST('2079-06-06' AS date)");
    expect(Sql).not.toContain('9999-12-31');
  });

  it('PostgreSQL: FILTER, bigint casts, whitespace-aware btrim, isfinite, regex', () => {
    const { Sql } = BuildTableProbeStatement(spec, spec.Columns, POSTGRESQL_QUALITY_DIALECT);
    expect(Sql).toContain('COUNT(*)::bigint AS rows_');
    expect(Sql).toContain('(COUNT(*) FILTER (WHERE');
    expect(Sql).toContain('btrim("Status"::text, E\' \\t\\r\\n\')');
    expect(Sql).toContain('NOT isfinite("ShipDate")');
    expect(Sql).toContain("now() + interval '1 days'");
    expect(Sql).toContain('FROM "Sales"."Order"');
    expect(Sql).not.toContain('OPTION');
  });

  it('MySQL: SUM(CASE), binary distinct, REGEXP, zero dates', () => {
    const { Sql } = BuildTableProbeStatement(spec, spec.Columns, MYSQL_QUALITY_DIALECT);
    expect(Sql).toContain('SUM(CASE WHEN');
    expect(Sql).toContain('COUNT(DISTINCT CAST(`Status` AS BINARY))');
    expect(Sql).toContain('REGEXP');
    expect(Sql).toContain("LIKE '0000-00-00%'");
    expect(Sql).toContain('FROM `Sales`.`Order`');
  });

  it('splits wide tables into batches with distinct aliases, and keeps trailing spaces distinct on SQL Server', () => {
    const wide: TableQualityProbeSpec = {
      ...spec,
      Columns: Array.from({ length: 5 }, (_, i) => ({ Name: `C${i}`, DataType: 'int', Measures: ['NonNull' as const] })),
    };
    const statements = [0, 2, 4].map((start) => BuildTableProbeStatement(wide, wide.Columns.slice(start, start + 2), SQL_SERVER_QUALITY_DIALECT, start));
    expect(statements).toHaveLength(3);
    const aliases = statements.flatMap((s) => s.Aliases.filter((a) => a.Column).map((a) => a.Alias));
    expect(new Set(aliases).size).toBe(5);
    expect(aliases).toEqual(['c0_nonnull', 'c1_nonnull', 'c2_nonnull', 'c3_nonnull', 'c4_nonnull']);

    const { Sql: variantSql } = BuildTableProbeStatement(spec, [spec.Columns[0]], SQL_SERVER_QUALITY_DIALECT);
    expect(variantSql).toContain("CAST(CAST([Status] AS NVARCHAR(3999)) + N'|' AS NVARCHAR(4000)) COLLATE Latin1_General_BIN2");
    expect(BuildExactDistributionStatement('dbo', 'T', 'Status', 50, SQL_SERVER_QUALITY_DIALECT)).toContain('DATALENGTH([Status])');
  });

  it('quotes identifiers by doubling the closing delimiter', () => {
    expect(SQL_SERVER_QUALITY_DIALECT.Quote('a]b')).toBe('[a]]b]');
    expect(POSTGRESQL_QUALITY_DIALECT.Quote('a"b')).toBe('"a""b"');
    expect(MYSQL_QUALITY_DIALECT.Quote('a`b')).toBe('`a``b`');
  });

  it('counts duplicate rows over the comparable columns only', () => {
    const s = BuildDuplicateRowsStatement({ ...spec, CountDuplicateRows: true, DuplicateRowColumns: ['A', 'B'] }, SQL_SERVER_QUALITY_DIALECT);
    expect(s?.Sql).toContain('SELECT DISTINCT [A], [B] FROM [Sales].[Order]');
    expect(BuildDuplicateRowsStatement({ ...spec, CountDuplicateRows: true, DuplicateRowColumns: [] }, SQL_SERVER_QUALITY_DIALECT)).toBeUndefined();
  });
});

describe('relationship probe SQL', () => {
  const composite: RelationshipProbeSpec = {
    Child: { Schema: 'Sales', Table: 'Line', Columns: ['OfferId', 'ProductId'] },
    Parent: { Schema: 'Sales', Table: 'OfferProduct', Columns: ['OfferId', 'ProductId'] },
    CompareAsText: false,
    CountUnreferencedParents: false,
  };

  it('checks only rows whose key columns are all non-null, with an anti-join per relationship', () => {
    const { Sql, Aliases } = BuildRelationshipProbeStatement([composite], SQL_SERVER_QUALITY_DIALECT);
    expect(Sql).toContain('c.[OfferId] IS NOT NULL AND c.[ProductId] IS NOT NULL');
    expect(Sql).toContain('NOT EXISTS (SELECT 1 FROM [Sales].[OfferProduct] p WHERE p.[OfferId] = c.[OfferId] AND p.[ProductId] = c.[ProductId])');
    expect(Aliases.map((a) => a.Alias)).toEqual(['r0_checked', 'r0_orphans']);
  });

  it('compares as text when the two sides have different types', () => {
    const single: RelationshipProbeSpec = {
      Child: { Schema: 'dbo', Table: 'Order', Columns: ['CustomerCode'] },
      Parent: { Schema: 'dbo', Table: 'Customer', Columns: ['Id'] },
      CompareAsText: true,
      CountUnreferencedParents: true,
    };
    const { Sql, Aliases } = BuildRelationshipProbeStatement([single], POSTGRESQL_QUALITY_DIALECT);
    expect(Sql).toContain('p."Id"::text = c."CustomerCode"::text');
    expect(Aliases.map((a) => a.Alias)).toEqual(['r0_checked', 'r0_orphans', 'r0_parents', 'r0_unreferenced']);
  });

  it('packs several relationships into one statement', () => {
    const { Aliases } = BuildRelationshipProbeStatement([composite, composite], SQL_SERVER_QUALITY_DIALECT);
    expect(Aliases.filter((a) => a.Measure === 'OrphanRows').map((a) => a.Relationship)).toEqual([0, 1]);
  });

  it('compares numeric mismatches numerically and GUID-vs-text mismatches case-insensitively', () => {
    const doc: DatabaseDocumentation = {
      version: '1',
      summary: {
        createdAt: '',
        lastModified: '',
        totalIterations: 0,
        totalPromptsRun: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        totalSchemas: 1,
        totalTables: 3,
        totalColumns: 4,
      },
      database: { name: 'db', server: 's', analyzedAt: '', provider: 'sqlserver' },
      phases: { descriptionGeneration: [] },
      schemas: [
        {
          name: 'dbo',
          descriptionIterations: [],
          tables: [
            {
              name: 'Item',
              rowCount: 10,
              dependsOn: [],
              dependents: [],
              descriptionIterations: [],
              columns: [{ name: 'Id', dataType: 'int', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] }],
            },
            {
              name: 'Account',
              rowCount: 10,
              dependsOn: [],
              dependents: [],
              descriptionIterations: [],
              columns: [{ name: 'Id', dataType: 'uniqueidentifier', isNullable: false, isPrimaryKey: true, isForeignKey: false, descriptionIterations: [] }],
            },
            {
              name: 'Child',
              rowCount: 10,
              dependsOn: [
                { schema: 'dbo', table: 'Item', column: 'ItemRef', referencedColumn: 'Id' },
                { schema: 'dbo', table: 'Account', column: 'AccountGuidText', referencedColumn: 'Id' },
              ],
              dependents: [],
              descriptionIterations: [],
              columns: [
                { name: 'ItemRef', dataType: 'numeric(10,2)', isNullable: true, isPrimaryKey: false, isForeignKey: true, descriptionIterations: [] },
                { name: 'AccountGuidText', dataType: 'varchar', maxLength: 36, isNullable: true, isPrimaryKey: false, isForeignKey: true, descriptionIterations: [] },
              ],
            },
          ],
        },
      ],
    };
    const planned = PlanRelationshipProbes(CreateRuleContext(doc, ResolveDataQualityConfig(undefined)), () => false);
    expect(planned).toHaveLength(2);
    expect(planned[0].Spec.ColumnComparisons).toEqual(['numeric']);
    expect(planned[1].Spec.ColumnComparisons).toEqual(['caseInsensitiveText']);

    const { Sql } = BuildRelationshipProbeStatement(
      planned.map((p) => p.Spec),
      SQL_SERVER_QUALITY_DIALECT,
    );
    expect(Sql).toContain('CAST(p.[Id] AS DECIMAL(38, 10)) = CAST(c.[ItemRef] AS DECIMAL(38, 10))');
    expect(Sql).toContain('LOWER(LTRIM(RTRIM(CAST(p.[Id] AS NVARCHAR(4000))))) = LOWER(LTRIM(RTRIM(CAST(c.[AccountGuidText] AS NVARCHAR(4000)))))');
  });
});

describe('probe results', () => {
  it('reads string bigints, numbers and NULL sums as numbers', () => {
    const statement = BuildTableProbeStatement(spec, spec.Columns.slice(2), SQL_SERVER_QUALITY_DIALECT);
    const values = ParseProbeRow({ rows_: '12345678901', c0_nonnull: 7, c0_negative: null }, statement);
    expect(values.get('rows_')).toBe(12345678901);
    expect(values.get('c0_nonnull')).toBe(7);
    expect(values.get('c0_negative')).toBe(0);
  });

  it('selects the dialect from the provider name, defaulting to SQL Server', () => {
    expect(QualityDialectFor('postgresql').Provider).toBe('postgresql');
    expect(QualityDialectFor('MySQL').Provider).toBe('mysql');
    expect(QualityDialectFor('oracle').Provider).toBe('sqlserver');
  });

  it('classifies SQL Server timestamp as rowversion, not a date', () => {
    expect(SQL_SERVER_QUALITY_DIALECT.TypeFamily('timestamp')).toBe('other');
    expect(POSTGRESQL_QUALITY_DIALECT.TypeFamily('timestamp')).toBe('date');
    expect(SQL_SERVER_QUALITY_DIALECT.TypeFamily('ntext')).toBe('largeText');
  });

  it('fetches an exact distribution that keeps case apart', () => {
    expect(BuildExactDistributionStatement('dbo', 'T', 'Status', 50, SQL_SERVER_QUALITY_DIALECT)).toContain(
      'GROUP BY CAST([Status] AS NVARCHAR(4000)) COLLATE Latin1_General_BIN2',
    );
    expect(BuildExactDistributionStatement('dbo', 'T', 'Status', 50, MYSQL_QUALITY_DIALECT)).toContain('GROUP BY CAST(`Status` AS BINARY)');
  });
});
