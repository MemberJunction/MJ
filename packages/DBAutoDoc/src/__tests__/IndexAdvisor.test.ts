import { describe, it, expect } from 'vitest';
import { MapPostgreSQLIndexRows, MapSQLServerIndexRows, MapMySQLIndexRows, BuildSQLServerIndexQuery } from '../drivers/IndexCatalog';
import { ProposeIndexes, FindRedundantIndexes, IsCovered } from '../plugins/index-advisor/IndexRules';
import { IndexMigrationGenerator } from '../plugins/index-advisor/IndexMigrationGenerator';
import { ResolveIndexAdvisorOptions, DEFAULT_INDEX_ADVISOR_OPTIONS } from '../plugins/index-advisor/IndexAdvisorPlugin';
import type { IndexAdvisorData, IndexProposal } from '../plugins/index-advisor/IndexAdvisorTypes';
import { AUTODOC_EXPRESSION_KEY_PART, type AutoDocIndex } from '../types/driver';
import type { DatabaseDocumentation, TableDefinition, ColumnDefinition } from '../types/state';
import type { FKCandidate, PKCandidate, RelationshipDiscoveryPhase } from '../types/discovery';

// ─── fixtures ────────────────────────────────────────────────────────────────

function col(name: string, dataType = 'int', distinctCount?: number): ColumnDefinition {
  return {
    name, dataType, isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [],
    statistics: distinctCount === undefined ? undefined : {
      totalRows: 0, distinctCount, uniquenessRatio: 0, nullCount: 0, nullPercentage: 0, sampleValues: []
    }
  };
}

function table(name: string, rowCount: number, columns: ColumnDefinition[], dependsOn: TableDefinition['dependsOn'] = []): TableDefinition {
  return { name, rowCount, dependsOn, dependents: [], columns, descriptionIterations: [] };
}

function stateWith(tables: TableDefinition[], discovered?: { fks?: FKCandidate[]; pks?: PKCandidate[] }): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {} as DatabaseDocumentation['summary'],
    database: { name: 'db', server: 'srv', analyzedAt: '' },
    phases: {
      descriptionGeneration: [],
      keyDetection: discovered
        ? ({ discovered: { primaryKeys: discovered.pks ?? [], foreignKeys: discovered.fks ?? [] } } as unknown as RelationshipDiscoveryPhase)
        : undefined
    },
    schemas: [{ name: 'dbo', tables, descriptionIterations: [] }]
  };
}

function index(tableName: string, name: string, columns: string[], extra: Partial<AutoDocIndex> = {}): AutoDocIndex {
  return {
    SchemaName: 'dbo', TableName: tableName, IndexName: name, Columns: columns, IncludeColumns: [],
    IsUnique: false, IsPrimaryKey: false, Method: 'btree', HasExpressions: false, ...extra
  };
}

const ORDERS = table('Orders', 50_000, [col('OrderID'), col('CustomerID', 'int', 4000), col('Notes', 'nvarchar(max)'), col('IsRush', 'bit', 2)], [
  { schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID' }
]);

// ─── catalog row mapping ─────────────────────────────────────────────────────

describe('IndexCatalog row mapping', () => {
  it('maps PostgreSQL rows, including INCLUDE columns and partial/expression flags', () => {
    const [ix] = MapPostgreSQLIndexRows([{
      SchemaName: 's', TableName: 't', IndexName: 'ix', IsUnique: true, IsPrimary: false, Method: 'btree',
      FilterDef: '(active = true)', HasExpr: false, KeyColumns: ['a', 'b'], IncludeColumns: ['c']
    }]);
    expect(ix).toMatchObject({ Columns: ['a', 'b'], IncludeColumns: ['c'], IsUnique: true, FilterDefinition: '(active = true)' });
  });

  it('maps SQL Server rows with |-delimited column lists', () => {
    const [ix] = MapSQLServerIndexRows([{
      SchemaName: 'dbo', TableName: 't', IndexName: 'PK_t', IsUnique: true, IsPrimaryKey: true, Method: 'CLUSTERED',
      FilterDefinition: null, KeyColumns: 'ID', IncludeColumns: null
    }]);
    expect(ix).toMatchObject({ Columns: ['ID'], IncludeColumns: [], IsPrimaryKey: true, Method: 'CLUSTERED' });
  });

  it('escapes the schema name in the SQL Server catalog query', () => {
    expect(BuildSQLServerIndexQuery("o'brien")).toContain("s.name = N'o''brien'");
  });

  it('groups MySQL per-column rows into indexes in sequence order and flags expression parts', () => {
    const indexes = MapMySQLIndexRows([
      { SchemaName: 's', TableName: 't', IndexName: 'ix_ab', NonUnique: 1, Method: 'BTREE', ColumnName: 'b', Seq: 2 },
      { SchemaName: 's', TableName: 't', IndexName: 'ix_ab', NonUnique: 1, Method: 'BTREE', ColumnName: 'a', Seq: 1 },
      { SchemaName: 's', TableName: 't', IndexName: 'PRIMARY', NonUnique: '0', Method: 'BTREE', ColumnName: 'id', Seq: 1 },
      { SchemaName: 's', TableName: 't', IndexName: 'ix_fn', NonUnique: 1, Method: 'BTREE', ColumnName: null, Seq: 1 }
    ]);
    const byName = Object.fromEntries(indexes.map((i) => [i.IndexName, i]));
    expect(byName['ix_ab'].Columns).toEqual(['a', 'b']);
    expect(byName['PRIMARY']).toMatchObject({ IsPrimaryKey: true, IsUnique: true });
    expect(byName['ix_fn']).toMatchObject({ HasExpressions: true, Columns: [AUTODOC_EXPRESSION_KEY_PART] });
  });
});

// ─── rules ───────────────────────────────────────────────────────────────────

describe('IndexRules.ProposeIndexes', () => {
  it('proposes an index for an uncovered declared foreign key', () => {
    const [p] = ProposeIndexes(stateWith([ORDERS]), [], DEFAULT_INDEX_ADVISOR_OPTIONS);
    expect(p).toMatchObject({ TableName: 'Orders', Columns: ['CustomerID'], Source: 'FKCoverage' });
    expect(p.Evidence).toMatchObject({ RowCount: 50_000, References: 'dbo.Customers.CustomerID', KeyOrigin: 'declared', LeadingColumnDistinctCount: 4000 });
    expect(p.Priority).toBe(47);
  });

  it('treats an index that starts with the FK column as covering it (case-insensitive)', () => {
    expect(ProposeIndexes(stateWith([ORDERS]), [index('orders', 'ix', ['customerid', 'OrderDate'])], DEFAULT_INDEX_ADVISOR_OPTIONS)).toEqual([]);
  });

  it('does not treat a partial (filtered) index as covering', () => {
    const partial = index('Orders', 'ix', ['CustomerID'], { FilterDefinition: 'IsRush = 1' });
    expect(IsCovered(['CustomerID'], [partial])).toBe(false);
  });

  it('skips small tables, poor key types and near-constant columns', () => {
    const small = table('Small', 10, [col('ParentID')], [{ schema: 'dbo', table: 'P', column: 'ParentID', referencedColumn: 'ID' }]);
    const poor = table('Poor', 50_000, [col('Doc', 'nvarchar(max)'), col('Flag', 'bit', 2)], [
      { schema: 'dbo', table: 'P', column: 'Doc', referencedColumn: 'ID' },
      { schema: 'dbo', table: 'P', column: 'Flag', referencedColumn: 'ID' }
    ]);
    expect(ProposeIndexes(stateWith([small, poor]), [], DEFAULT_INDEX_ADVISOR_OPTIONS)).toEqual([]);
  });

  it('uses confirmed discovered FKs above the confidence bar, and only when enabled', () => {
    const lines = table('Lines', 20_000, [col('OrderRef')]);
    const fk = (confidence: number, status: FKCandidate['status']) => ({
      schemaName: 'dbo', sourceTable: 'Lines', sourceColumn: 'OrderRef', targetSchema: 'dbo', targetTable: 'Orders', targetColumn: 'OrderID',
      confidence, status, validatedByLLM: true, discoveredInIteration: 1
    } as FKCandidate);

    const good = ProposeIndexes(stateWith([lines], { fks: [fk(95, 'confirmed')] }), [], DEFAULT_INDEX_ADVISOR_OPTIONS);
    expect(good[0].Evidence).toMatchObject({ KeyOrigin: 'discovered', KeyConfidence: 95 });
    expect(ProposeIndexes(stateWith([lines], { fks: [fk(70, 'confirmed')] }), [], DEFAULT_INDEX_ADVISOR_OPTIONS)).toEqual([]);
    expect(ProposeIndexes(stateWith([lines], { fks: [fk(95, 'candidate')] }), [], DEFAULT_INDEX_ADVISOR_OPTIONS)).toEqual([]);
    expect(ProposeIndexes(stateWith([lines], { fks: [fk(95, 'confirmed')] }), [], { ...DEFAULT_INDEX_ADVISOR_OPTIONS, IncludeDiscoveredFKs: false })).toEqual([]);
  });

  it('proposes an index for a confirmed discovered PK with no index, but not when the declared PK index exists', () => {
    const events = table('Events', 30_000, [col('EventKey'), col('Name', 'nvarchar(100)')]);
    const pk = { schemaName: 'dbo', tableName: 'Events', columnNames: ['EventKey'], confidence: 98, status: 'confirmed', validatedByLLM: true, discoveredInIteration: 1 } as PKCandidate;
    expect(ProposeIndexes(stateWith([events], { pks: [pk] }), [], DEFAULT_INDEX_ADVISOR_OPTIONS)[0].Source).toBe('SoftPrimaryKey');
    const pkIndex = index('Events', 'PK_Events', ['EventKey'], { IsPrimaryKey: true, IsUnique: true });
    expect(ProposeIndexes(stateWith([events], { pks: [pk] }), [pkIndex], DEFAULT_INDEX_ADVISOR_OPTIONS)).toEqual([]);
  });

  it('deduplicates a key proposed by both a declared and a discovered FK, and sorts by priority', () => {
    const big = table('Big', 5_000_000, [col('AID')], [{ schema: 'dbo', table: 'A', column: 'AID', referencedColumn: 'ID' }]);
    const fk = { schemaName: 'dbo', sourceTable: 'Big', sourceColumn: 'AID', targetSchema: 'dbo', targetTable: 'A', targetColumn: 'ID', confidence: 99, status: 'confirmed' } as FKCandidate;
    const proposals = ProposeIndexes(stateWith([ORDERS, big], { fks: [fk] }), [], DEFAULT_INDEX_ADVISOR_OPTIONS);
    expect(proposals.map((p) => p.TableName)).toEqual(['Big', 'Orders']);
  });
});

describe('IndexRules.FindRedundantIndexes', () => {
  it('flags a plain index whose columns are a prefix of another index on the same table', () => {
    const [r] = FindRedundantIndexes([index('T', 'ix_a', ['a']), index('T', 'ix_ab', ['a', 'b'])]);
    expect(r).toMatchObject({ IndexName: 'ix_a', CoveredBy: 'ix_ab' });
  });

  it('flags only one of two identical indexes', () => {
    expect(FindRedundantIndexes([index('T', 'ix_1', ['a']), index('T', 'ix_2', ['a'])]).map((r) => r.IndexName)).toEqual(['ix_2']);
  });

  it('never flags unique, primary-key, partial or expression indexes, or indexes of a different method', () => {
    expect(FindRedundantIndexes([
      index('T', 'uq_a', ['a'], { IsUnique: true }),
      index('T', 'part_a', ['a'], { FilterDefinition: 'x > 0' }),
      index('T', 'gin_a', ['a'], { Method: 'gin' }),
      index('T', 'ix_ab', ['a', 'b'])
    ])).toEqual([]);
  });
});

// ─── expression key parts (review: an expression in front must not count as coverage) ────

describe('Expression key parts and FK coverage', () => {
  const ORDERS_FK = table('Orders', 50_000, [col('OrderID'), col('Code', 'varchar(20)', 900), col('CustomerID', 'int', 4000)], [
    { schema: 'dbo', table: 'Customers', column: 'CustomerID', referencedColumn: 'CustomerID' }
  ]);
  const mysqlRows = (first: string | null, second: string | null) => MapMySQLIndexRows([
    { SchemaName: 'dbo', TableName: 'Orders', IndexName: 'ix_mixed', NonUnique: 1, Method: 'BTREE', ColumnName: second, Seq: 2 },
    { SchemaName: 'dbo', TableName: 'Orders', IndexName: 'ix_mixed', NonUnique: 1, Method: 'BTREE', ColumnName: first, Seq: 1 }
  ]);
  const pgRows = (keyColumns: (string | null)[]) => MapPostgreSQLIndexRows([{
    SchemaName: 'dbo', TableName: 'Orders', IndexName: 'ix_mixed', IsUnique: false, IsPrimary: false, Method: 'btree',
    FilterDef: null, HasExpr: true, KeyColumns: keyColumns, IncludeColumns: []
  }]);
  const proposedColumns = (existing: AutoDocIndex[]) =>
    ProposeIndexes(stateWith([ORDERS_FK]), existing, DEFAULT_INDEX_ADVISOR_OPTIONS).map((p) => p.Columns);

  it('MySQL: INDEX ((LOWER(Code)), CustomerID) keeps the expression first and does not cover CustomerID', () => {
    const indexes = mysqlRows(null, 'CustomerID');
    expect(indexes[0].Columns).toEqual([AUTODOC_EXPRESSION_KEY_PART, 'CustomerID']);
    expect(proposedColumns(indexes)).toEqual([['CustomerID']]);
  });

  it('MySQL control: INDEX (CustomerID, (LOWER(Code))) does cover CustomerID', () => {
    const indexes = mysqlRows('CustomerID', null);
    expect(indexes[0].Columns).toEqual(['CustomerID', AUTODOC_EXPRESSION_KEY_PART]);
    expect(proposedColumns(indexes)).toEqual([]);
  });

  it('PostgreSQL: (lower(code), customer_id) keeps the expression first and does not cover CustomerID', () => {
    const indexes = pgRows([null, 'CustomerID']);
    expect(indexes[0].Columns).toEqual([AUTODOC_EXPRESSION_KEY_PART, 'CustomerID']);
    expect(proposedColumns(indexes)).toEqual([['CustomerID']]);
  });

  it('PostgreSQL control: (customer_id, lower(code)) does cover CustomerID', () => {
    expect(proposedColumns(pgRows(['CustomerID', null]))).toEqual([]);
  });

  it('does not flag an expression index as redundant', () => {
    const exprFirst = mysqlRows(null, 'CustomerID')[0];
    expect(FindRedundantIndexes([exprFirst, index('Orders', 'ix_cust', ['CustomerID'])])).toEqual([]);
  });
});

// ─── migration generator ─────────────────────────────────────────────────────

const PROPOSAL: IndexProposal = {
  SchemaName: 'dbo', TableName: 'Orders', Columns: ['CustomerID'], IncludeColumns: [], Source: 'FKCoverage',
  Reason: 'Foreign key CustomerID has no index.', Priority: 47, Evidence: { RowCount: 50_000 }
};

function data(proposed: IndexProposal[], concurrently = false): IndexAdvisorData {
  return {
    AnalyzedAt: '2026-10-08T15:04:00.000Z', Options: { ...DEFAULT_INDEX_ADVISOR_OPTIONS, Concurrently: concurrently },
    Existing: [], Proposed: proposed, Redundant: [], SkippedSchemas: []
  };
}

describe('IndexMigrationGenerator', () => {
  const gen = new IndexMigrationGenerator();

  it('emits nothing when there are no proposals', () => {
    expect(gen.Generate(data([]), { Provider: 'postgresql' })).toEqual([]);
  });

  it('names the file from the analysis time, or a given prefix', () => {
    expect(gen.Generate(data([PROPOSAL]), { Provider: 'sqlserver' })[0].FileName).toBe('V202610081504__dbautodoc_indexes.sql');
    expect(gen.Generate(data([PROPOSAL]), { Provider: 'sqlserver', FileNamePrefix: 'V7__' })[0].FileName).toBe('V7__dbautodoc_indexes.sql');
  });

  it('writes a guarded nonclustered index for SQL Server', () => {
    const sql = gen.Generate(data([PROPOSAL]), { Provider: 'sqlserver' })[0].Content;
    expect(sql).toContain("IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Orders_CustomerID' AND object_id = OBJECT_ID(N'[dbo].[Orders]'))");
    expect(sql).toContain('CREATE NONCLUSTERED INDEX [IX_Orders_CustomerID] ON [dbo].[Orders] ([CustomerID]);');
  });

  it('writes CREATE INDEX IF NOT EXISTS for PostgreSQL, with CONCURRENTLY plus a Flyway no-transaction .conf when enabled', () => {
    const plain = gen.Generate(data([PROPOSAL]), { Provider: 'postgresql' });
    expect(plain).toHaveLength(1);
    expect(plain[0].Content).toContain('CREATE INDEX IF NOT EXISTS "IX_Orders_CustomerID" ON "dbo"."Orders" ("CustomerID");');

    const concurrent = gen.Generate(data([PROPOSAL], true), { Provider: 'postgresql' });
    expect(concurrent[0].Content).toContain('CREATE INDEX CONCURRENTLY IF NOT EXISTS');
    expect(concurrent[1]).toEqual({ FileName: 'V202610081504__dbautodoc_indexes.sql.conf', Content: 'executeInTransaction=false\n' });
  });

  it('writes plain CREATE INDEX for MySQL and warns that it is not re-runnable', () => {
    const sql = gen.Generate(data([PROPOSAL]), { Provider: 'mysql' })[0].Content;
    expect(sql).toContain('CREATE INDEX `IX_Orders_CustomerID` ON `dbo`.`Orders` (`CustomerID`);');
    expect(sql).toContain('no CREATE INDEX IF NOT EXISTS');
  });

  it('includes covering columns where the platform supports INCLUDE', () => {
    const withInclude = { ...PROPOSAL, IncludeColumns: ['Total'] };
    expect(gen.Generate(data([withInclude]), { Provider: 'postgresql' })[0].Content).toContain('("CustomerID") INCLUDE ("Total")');
    expect(gen.Generate(data([withInclude]), { Provider: 'mysql' })[0].Content).not.toContain('INCLUDE');
  });

  it('shortens long names to the platform limit with a stable hash suffix, and quotes identifiers safely', () => {
    const long = { TableName: 'A'.repeat(70), Columns: ['B'.repeat(30)] };
    const name = IndexMigrationGenerator.IndexName(long, 'postgresql');
    expect(name.length).toBe(63);
    expect(IndexMigrationGenerator.IndexName(long, 'postgresql')).toBe(name);
    expect(IndexMigrationGenerator.IndexName({ TableName: 'Order Lines', Columns: ['a-b'] }, 'sqlserver')).toBe('IX_Order_Lines_a_b');
    expect(IndexMigrationGenerator.Quote('we]ird', 'sqlserver')).toBe('[we]]ird]');
    expect(IndexMigrationGenerator.Quote('we"ird', 'postgresql')).toBe('"we""ird"');
  });
});

describe('ResolveIndexAdvisorOptions', () => {
  it('uses defaults and ignores values of the wrong type', () => {
    expect(ResolveIndexAdvisorOptions({})).toEqual(DEFAULT_INDEX_ADVISOR_OPTIONS);
    expect(ResolveIndexAdvisorOptions({ MinRowCount: 5, Concurrently: true, LLMReview: 'no' })).toMatchObject({
      MinRowCount: 5, Concurrently: true, LLMReview: true
    });
  });
});
