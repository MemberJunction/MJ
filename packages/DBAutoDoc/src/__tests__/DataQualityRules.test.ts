import { describe, it, expect } from 'vitest';
import { CreateRuleContext, DeriveFindings, FindingId, SpellingGroups, ToISODate, NameWords } from '../quality/DataQualityRules';
import { ResolveDataQualityConfig, ValidateDataQualityConfig, DATA_QUALITY_CHECKS } from '../quality/DataQualityConfig';
import type { DataQualityConfig } from '../types/config';
import type { ColumnQualityMeasures, DataQualityCheck, DataQualityFinding, DataQualityPhase, RelationshipProbeResult } from '../types/data-quality';
import type { ColumnDefinition, ColumnStatistics, DatabaseDocumentation, ForeignKeyReference, TableDefinition } from '../types/state';
import type { AutoDocIndex } from '../types/driver';

// ─── fixtures ────────────────────────────────────────────────────────────────

function stats(totalRows: number, distinctCount: number, nullCount: number, extra: Partial<ColumnStatistics> = {}): ColumnStatistics {
  return {
    totalRows,
    distinctCount,
    nullCount,
    uniquenessRatio: totalRows > 0 ? distinctCount / totalRows : 0,
    nullPercentage: totalRows > 0 ? (nullCount / totalRows) * 100 : 0,
    sampleValues: [],
    ...extra,
  };
}

function col(name: string, dataType: string, s?: ColumnStatistics, extra: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { name, dataType, isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [], statistics: s, ...extra };
}

function table(name: string, columns: ColumnDefinition[], extra: Partial<TableDefinition> = {}): TableDefinition {
  return { name, rowCount: columns[0]?.statistics?.totalRows ?? 0, dependsOn: [], dependents: [], columns, descriptionIterations: [], indexes: [], ...extra };
}

function pkIndex(tableName: string, column: string): AutoDocIndex {
  return {
    SchemaName: 'dbo',
    TableName: tableName,
    IndexName: `pk_${tableName}`,
    Columns: [column],
    IncludeColumns: [],
    IsUnique: true,
    IsPrimaryKey: true,
    Method: 'btree',
    HasExpressions: false,
  };
}

function idColumn(rows: number): ColumnDefinition {
  return col('Id', 'int', stats(rows, rows, 0), { isPrimaryKey: true, isNullable: false });
}

function state(tables: TableDefinition[], provider: 'sqlserver' | 'postgresql' = 'sqlserver', phase?: DataQualityPhase): DatabaseDocumentation {
  return {
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
      totalTables: tables.length,
      totalColumns: 0,
    },
    database: { name: 'db', server: 'stub', analyzedAt: '', provider },
    phases: { descriptionGeneration: [], ...(phase ? { dataQuality: phase } : {}) },
    schemas: [{ name: 'dbo', tables, descriptionIterations: [] }],
  };
}

function phaseWith(
  tableProbes: Record<string, Record<string, ColumnQualityMeasures>>,
  relationships: Record<string, RelationshipProbeResult> = {},
  rowCounts: Record<string, number> = {},
): DataQualityPhase {
  const probes: DataQualityPhase['TableProbes'] = {};
  for (const [key, columns] of Object.entries(tableProbes)) {
    probes[key] = { ProbedAt: '', Outcome: 'ok', RowCount: rowCounts[key], Measures: [], Columns: columns, DurationMs: 0 };
  }
  return {
    Status: 'completed',
    StartedAt: '',
    ProbesEnabled: true,
    TotalTables: 1,
    TablesProbed: 1,
    TablesSkipped: 0,
    TablesFailed: 0,
    RelationshipsProbed: 0,
    RelationshipsFailed: 0,
    ProbeDurationMs: 0,
    TableProbes: probes,
    RelationshipProbes: relationships,
  };
}

const NOW = new Date('2026-11-09T12:00:00Z');

function derive(s: DatabaseDocumentation, config?: DataQualityConfig): DataQualityFinding[] {
  return DeriveFindings(CreateRuleContext(s, ResolveDataQualityConfig(config), NOW));
}

const kinds = (findings: DataQualityFinding[], column?: string): DataQualityCheck[] =>
  findings.filter((f) => column === undefined || f.ColumnName === column).map((f) => f.Kind);

/** A well-keyed table of `rows` rows with the given extra columns. */
function keyed(name: string, rows: number, columns: ColumnDefinition[], extra: Partial<TableDefinition> = {}): TableDefinition {
  return table(name, [idColumn(rows), ...columns], { indexes: [pkIndex(name, 'Id')], ...extra });
}

// ─── statistics checks ───────────────────────────────────────────────────────

describe('data quality rules over statistics', () => {
  it('reports an always-null column and nothing else about it', () => {
    const f = derive(state([keyed('T', 500, [col('Unused', 'int', stats(500, 0, 500))])]));
    expect(kinds(f, 'Unused')).toEqual(['AlwaysNull']);
    expect(f.find((x) => x.Kind === 'AlwaysNull')?.Severity).toBe('warning');
  });

  it('reports a constant column and names the value', () => {
    const f = derive(
      state([
        keyed('T', 500, [
          col('Region', 'nvarchar', stats(500, 1, 0, { valueDistribution: [{ value: 'EU', frequency: 500 }] }), { maxLength: 10, isNullable: false }),
        ]),
      ]),
    );
    const finding = f.find((x) => x.Kind === 'ConstantValue');
    expect(finding?.Message).toContain("'EU'");
    expect(finding?.SampleValues).toEqual(['EU']);
  });

  it('reports a high null rate at the threshold but not below it', () => {
    const at = derive(state([keyed('T', 1000, [col('Fax', 'nvarchar', stats(1000, 50, 900), { maxLength: 30 })])]));
    const below = derive(state([keyed('T', 1000, [col('Fax', 'nvarchar', stats(1000, 50, 899), { maxLength: 30 })])]));
    expect(kinds(at, 'Fax')).toContain('HighNullRate');
    expect(kinds(below, 'Fax')).not.toContain('HighNullRate');
  });

  it('reports a mostly-null foreign key as an optional relationship, not as a high null rate', () => {
    const fk = col('ManagerId', 'int', stats(1000, 10, 950), { isForeignKey: true });
    const kindsFound = kinds(derive(state([keyed('T', 1000, [fk])])), 'ManagerId');
    expect(kindsFound).toContain('ForeignKeyMostlyNull');
    expect(kindsFound).not.toContain('HighNullRate');
  });

  it('reports a near-unique column with its duplicate count, using non-null rows as the base', () => {
    // 1000 rows, 100 NULL, 895 distinct among 900 non-null: 99.4% unique, 5 repeats.
    const f = derive(state([keyed('T', 1000, [col('Email', 'nvarchar', stats(1000, 895, 100), { maxLength: 200 })])]));
    const finding = f.find((x) => x.Kind === 'NearUnique');
    expect(finding?.Measures.DuplicateValues).toBe(5);
    expect(finding?.Measures.NonNullRows).toBe(900);
  });

  it('does not claim near-unique or undeclared-unique when the indexes were not read', () => {
    const t = keyed('T', 1000, [
      col('Code', 'nvarchar', stats(1000, 1000, 0), { maxLength: 20 }),
      col('Email', 'nvarchar', stats(1000, 995, 0), { maxLength: 200 }),
    ]);
    t.indexes = undefined;
    expect(kinds(derive(state([t])))).not.toEqual(expect.arrayContaining(['NearUnique']));
    expect(kinds(derive(state([t])))).not.toContain('UndeclaredUnique');
  });

  it('reports an undeclared unique key on identifier types but not on dates or decimals', () => {
    const f = derive(
      state([
        keyed('T', 1000, [
          col('Code', 'nvarchar', stats(1000, 1000, 0), { maxLength: 20 }),
          col('CreatedAt', 'datetime2', stats(1000, 1000, 0)),
          col('Amount', 'decimal', stats(1000, 1000, 0)),
        ]),
      ]),
    );
    expect(kinds(f, 'Code')).toContain('UndeclaredUnique');
    expect(kinds(f, 'CreatedAt')).not.toContain('UndeclaredUnique');
    expect(kinds(f, 'Amount')).not.toContain('UndeclaredUnique');
  });

  it('reports a placeholder date from the range, and the exact row count when probed', () => {
    const hire = col('HireDate', 'datetime', stats(300, 200, 0, { min: '1900-01-01T00:00:00.000Z', max: '2024-03-01T00:00:00.000Z' }));
    const fromStats = derive(state([keyed('T', 300, [hire])])).find((x) => x.Kind === 'SentinelDate');
    expect(fromStats?.Source).toBe('statistics');
    expect(fromStats?.SampleValues).toEqual(['1900-01-01']);
    const probed = derive(state([keyed('T', 300, [hire])], 'sqlserver', phaseWith({ 'dbo.T': { HireDate: { NonNullRows: 300, SentinelDateRows: 12 } } })));
    const finding = probed.find((x) => x.Kind === 'SentinelDate');
    expect(finding?.Source).toBe('probe');
    expect(finding?.Measures.SentinelRows).toBe(12);
  });

  it('treats 9999-12-31 as a placeholder, not as a future date', () => {
    const f = derive(state([keyed('T', 300, [col('ShipDate', 'datetime', stats(300, 200, 0, { min: '2020-01-01', max: '9999-12-31' }))])]));
    expect(kinds(f, 'ShipDate')).toContain('SentinelDate');
    expect(kinds(f, 'ShipDate')).not.toContain('FutureDate');
  });

  it('reports future dates, except in columns whose name says they look ahead', () => {
    const ordered = col('OrderDate', 'datetime', stats(300, 200, 0, { min: '2020-01-01', max: '2031-05-01' }));
    const expires = col('ExpiresAt', 'datetime', stats(300, 200, 0, { min: '2020-01-01', max: '2031-05-01' }));
    const f = derive(state([keyed('T', 300, [ordered, expires])]));
    expect(kinds(f, 'OrderDate')).toContain('FutureDate');
    expect(kinds(f, 'ExpiresAt')).not.toContain('FutureDate');
  });

  it('reports values that fill the declared length, more severely when most values do', () => {
    const filled = col('Code', 'nvarchar', stats(300, 250, 0, { maxLength: 10, avgLength: 9.8 }), { maxLength: 10 });
    const finding = derive(state([keyed('T', 300, [filled])])).find((x) => x.Kind === 'LengthAtCapacity');
    expect(finding?.Severity).toBe('warning');
    const occasional = col('Note', 'nvarchar', stats(300, 250, 0, { maxLength: 50, avgLength: 12 }), { maxLength: 50 });
    expect(derive(state([keyed('T', 300, [occasional])])).find((x) => x.Kind === 'LengthAtCapacity')?.Severity).toBe('info');
  });

  it('reports negative values only in quantity-like columns', () => {
    const f = derive(
      state([
        keyed('T', 300, [
          col('OrderQty', 'int', stats(300, 20, 0, { min: -3, max: 40 })),
          col('Balance', 'decimal', stats(300, 200, 0, { min: -500, max: 900 })),
        ]),
      ]),
    );
    expect(kinds(f, 'OrderQty')).toContain('NegativeValue');
    expect(kinds(f, 'Balance')).not.toContain('NegativeValue');
  });

  it('reports a one-to-one foreign key', () => {
    const fk = col('PersonId', 'int', stats(500, 500, 0), { isForeignKey: true });
    expect(kinds(derive(state([keyed('T', 500, [fk])])), 'PersonId')).toContain('OneToOne');
  });
});

describe('data quality rules stay quiet where the data is fine', () => {
  it('does not call a fixed-format code truncated when every value has the declared length', () => {
    const account = col('AccountNumber', 'nvarchar', stats(300, 300, 0, { minLength: 10, maxLength: 10, avgLength: 10 }), { maxLength: 10 });
    expect(kinds(derive(state([keyed('T', 300, [account])])), 'AccountNumber')).not.toContain('LengthAtCapacity');
  });

  it('does not treat unbounded text as a key candidate', () => {
    const log = col('TSQL', 'nvarchar', stats(500, 500, 0));
    expect(kinds(derive(state([keyed('T', 500, [log])])), 'TSQL')).not.toContain('UndeclaredUnique');
  });

  it('does not report one-to-one for a column that is the whole primary key', () => {
    const t = table('Employee', [col('BusinessEntityID', 'int', stats(300, 300, 0), { isPrimaryKey: true, isForeignKey: true, isNullable: false })], {
      indexes: [pkIndex('Employee', 'BusinessEntityID')],
    });
    expect(kinds(derive(state([t])))).not.toContain('OneToOne');
  });

  it('reports a constant blank string once, as a blank string, not as a constant', () => {
    const comment = col('Comment', 'nvarchar', stats(300, 1, 200, { valueDistribution: [{ value: '   ', frequency: 100 }] }), { maxLength: 128 });
    const s = state([keyed('T', 300, [comment])], 'sqlserver', phaseWith({ 'dbo.T': { Comment: { NonNullRows: 100, BlankRows: 100 } } }));
    expect(kinds(derive(s), 'Comment')).toContain('BlankString');
    expect(kinds(derive(s), 'Comment')).not.toContain('ConstantValue');
  });

  it('explains a constant timestamp as rows written together', () => {
    const modified = col('ModifiedDate', 'datetime', stats(300, 1, 0, { valueDistribution: [{ value: '2008-04-30', frequency: 300 }] }));
    expect(derive(state([keyed('T', 300, [modified])])).find((f) => f.Kind === 'ConstantValue')?.Message).toContain('written at the same moment');
  });

  it('shows near-unique uniqueness without rounding up to 100%', () => {
    const email = col('Email', 'nvarchar', stats(19972, 19967, 0), { maxLength: 50 });
    expect(derive(state([keyed('T', 19972, [email])])).find((f) => f.Kind === 'NearUnique')?.Message).toContain('(99.97% unique)');
  });
});

// ─── table checks ────────────────────────────────────────────────────────────

describe('data quality rules over tables', () => {
  it('reports an empty table and no column findings for it, with no NaN anywhere', () => {
    const empty = table('Empty', [col('Id', 'int', stats(0, 0, 0), { isPrimaryKey: true }), col('Name', 'nvarchar', stats(0, 0, 0))], {
      indexes: [pkIndex('Empty', 'Id')],
    });
    const f = derive(state([empty]));
    expect(kinds(f)).toEqual(['EmptyTable']);
    expect(JSON.stringify(f)).not.toContain('NaN');
  });

  it('reports a table with no primary key, mentioning a unique index that could serve', () => {
    const t = table('Log', [col('Code', 'nvarchar', stats(500, 500, 0), { maxLength: 20 })], {
      indexes: [{ ...pkIndex('Log', 'Code'), IsPrimaryKey: false, IndexName: 'uq_code' }],
    });
    const finding = derive(state([t])).find((x) => x.Kind === 'NoPrimaryKey');
    expect(finding?.Message).toContain('(Code)');
  });

  it('reports an isolated table, but not one another table references', () => {
    const parent = keyed('Parent', 100, []);
    const child = keyed('Child', 100, [col('ParentId', 'int', stats(100, 50, 0), { isForeignKey: true })], {
      dependsOn: [{ schema: 'dbo', table: 'Parent', column: 'ParentId', referencedColumn: 'Id', constraintName: 'fk_child_parent', isTrusted: true }],
    });
    const lonely = keyed('Lonely', 100, []);
    const f = derive(state([parent, child, lonely]));
    const isolated = f.filter((x) => x.Kind === 'IsolatedTable').map((x) => x.TableName);
    expect(isolated).toEqual(['Lonely']);
  });

  it('reports a stale catalog estimate once the exact count is known', () => {
    const t = keyed('T', 1000, [], { rowCountEstimate: 400 });
    const finding = derive(state([t])).find((x) => x.Kind === 'StaleRowCountEstimate');
    expect(finding?.Measures).toEqual({ Estimate: 400, Exact: 1000 });
  });
});

// ─── probe checks ────────────────────────────────────────────────────────────

describe('data quality rules over probe measurements', () => {
  const status = () =>
    col(
      'Status',
      'nvarchar',
      stats(1000, 6, 0, {
        valueDistribution: [
          { value: 'Active', frequency: 700 },
          { value: 'Closed', frequency: 300 },
        ],
      }),
      { maxLength: 20 },
    );

  it('reports blank strings, untrimmed values and spelling variants with examples', () => {
    const measured: ColumnQualityMeasures = {
      NonNullRows: 1000,
      BlankRows: 40,
      UntrimmedRows: 12,
      VariantSpellings: 3,
      NumericLikeRows: 0,
      DateLikeRows: 0,
      ExactDistribution: [
        { Value: 'Active', Frequency: 650 },
        { Value: 'ACTIVE', Frequency: 40 },
        { Value: 'active', Frequency: 10 },
        { Value: 'Closed', Frequency: 290 },
        { Value: 'closed', Frequency: 10 },
      ],
    };
    const f = derive(state([keyed('T', 1000, [status()])], 'sqlserver', phaseWith({ 'dbo.T': { Status: measured } })));
    expect(kinds(f, 'Status')).toEqual(expect.arrayContaining(['BlankString', 'UntrimmedString', 'CaseWhitespaceVariants']));
    const variants = f.find((x) => x.Kind === 'CaseWhitespaceVariants');
    expect(variants?.SampleValues).toEqual(['Active', 'ACTIVE', 'active']);
    expect(f.find((x) => x.Kind === 'BlankString')?.Severity).toBe('warning');
  });

  it('reports numbers and dates stored as text, but not in code-like columns', () => {
    const amount = col('AmountText', 'nvarchar', stats(1000, 900, 0), { maxLength: 20 });
    const when = col('WhenText', 'nvarchar', stats(1000, 900, 0), { maxLength: 30 });
    const zip = col('PostalCode', 'nvarchar', stats(1000, 900, 0), { maxLength: 10 });
    const f = derive(
      state(
        [keyed('T', 1000, [amount, when, zip])],
        'sqlserver',
        phaseWith({
          'dbo.T': {
            AmountText: { NonNullRows: 1000, BlankRows: 0, NumericLikeRows: 990, DateLikeRows: 0 },
            WhenText: { NonNullRows: 1000, BlankRows: 0, NumericLikeRows: 0, DateLikeRows: 1000 },
            PostalCode: { NonNullRows: 1000, BlankRows: 0, NumericLikeRows: 1000, DateLikeRows: 0 },
          },
        }),
      ),
    );
    expect(kinds(f, 'AmountText')).toContain('NumericStoredAsText');
    expect(kinds(f, 'WhenText')).toContain('DateStoredAsText');
    expect(kinds(f, 'PostalCode')).not.toContain('NumericStoredAsText');
  });

  it('reports duplicate rows when measured', () => {
    const t = table('Staging', [col('A', 'int', stats(1100, 1000, 0)), col('B', 'nvarchar', stats(1100, 900, 0), { maxLength: 10 })]);
    const phase = phaseWith({ 'dbo.Staging': {} }, {}, { 'dbo.Staging': 1100 });
    phase.TableProbes['dbo.Staging'].DuplicateRows = 100;
    const finding = derive(state([t], 'sqlserver', phase), { checks: { ExactDuplicateRows: true } }).find((x) => x.Kind === 'ExactDuplicateRows');
    expect(finding?.Measures.DuplicateRows).toBe(100);
  });
});

// ─── relationship checks ─────────────────────────────────────────────────────

describe('data quality rules over relationships', () => {
  const declared = (trusted: boolean): ForeignKeyReference => ({
    schema: 'dbo',
    table: 'Customer',
    column: 'CustomerId',
    referencedColumn: 'Id',
    constraintName: 'fk_order_customer',
    isTrusted: trusted,
  });
  const orders = (dep: ForeignKeyReference, customerType = 'int') =>
    keyed('Order', 1000, [col('CustomerId', customerType, stats(1000, 300, 0), { isForeignKey: true })], { dependsOn: [dep] });
  const customers = keyed('Customer', 300, []);
  const probe = (orphans: number): RelationshipProbeResult => ({
    ProbedAt: '',
    Child: { Schema: 'dbo', Table: 'Order', Columns: ['CustomerId'] },
    Parent: { Schema: 'dbo', Table: 'Customer', Columns: ['Id'] },
    Origin: 'DeclaredUntrusted',
    Outcome: 'ok',
    CheckedRows: 1000,
    OrphanRows: orphans,
    DurationMs: 0,
  });
  const key = 'dbo.order(customerid)->dbo.customer(id)';

  it('reports an untrusted declared key, and its orphans as an error', () => {
    const s = state([orders(declared(false)), customers], 'sqlserver', phaseWith({}, { [key]: probe(32) }));
    const f = derive(s);
    expect(kinds(f)).toEqual(expect.arrayContaining(['UntrustedForeignKey', 'OrphanedForeignKey']));
    const orphan = f.find((x) => x.Kind === 'OrphanedForeignKey');
    expect(orphan?.Severity).toBe('error');
    expect(orphan?.Measures).toMatchObject({ CheckedRows: 1000, OrphanRows: 32, OrphanRate: 0.032 });
    expect(orphan?.Related).toMatchObject({ SchemaName: 'dbo', TableName: 'Customer', Declared: true });
  });

  it('grades orphans on a discovered key by rate', () => {
    const discovered: ForeignKeyReference = { schema: 'dbo', table: 'Customer', column: 'CustomerId', referencedColumn: 'Id' };
    const low = derive(state([orders(discovered), customers], 'sqlserver', phaseWith({}, { [key]: { ...probe(10), Origin: 'Discovered' } })));
    const high = derive(state([orders(discovered), customers], 'sqlserver', phaseWith({}, { [key]: { ...probe(100), Origin: 'Discovered' } })));
    expect(low.find((x) => x.Kind === 'OrphanedForeignKey')?.Severity).toBe('info');
    expect(high.find((x) => x.Kind === 'OrphanedForeignKey')?.Severity).toBe('warning');
  });

  it('drops the orphan finding once the key is pruned from the table', () => {
    const pruned = keyed('Order', 1000, [col('CustomerId', 'int', stats(1000, 300, 0))]);
    const f = derive(state([pruned, customers], 'sqlserver', phaseWith({}, { [key]: probe(32) })));
    expect(kinds(f)).not.toContain('OrphanedForeignKey');
  });

  it('reports a type mismatch on a discovered key', () => {
    const discovered: ForeignKeyReference = { schema: 'dbo', table: 'Customer', column: 'CustomerId', referencedColumn: 'Id' };
    const f = derive(state([orders(discovered, 'nvarchar'), customers]));
    const finding = f.find((x) => x.Kind === 'ForeignKeyTypeMismatch');
    expect(finding?.Severity).toBe('warning');
  });

  it('groups the columns of a composite declared key into one relationship', () => {
    const child = keyed('Line', 100, [col('A', 'int', stats(100, 10, 0)), col('B', 'int', stats(100, 10, 0))], {
      dependsOn: [
        { schema: 'dbo', table: 'Head', column: 'A', referencedColumn: 'X', constraintName: 'fk_line_head', isTrusted: false },
        { schema: 'dbo', table: 'Head', column: 'B', referencedColumn: 'Y', constraintName: 'fk_line_head', isTrusted: false },
      ],
    });
    const f = derive(state([child, keyed('Head', 10, [])])).filter((x) => x.Kind === 'UntrustedForeignKey');
    expect(f).toHaveLength(1);
    expect(f[0].ColumnNames).toEqual(['A', 'B']);
    expect(f[0].Related?.ColumnNames).toEqual(['X', 'Y']);
    expect(f[0].Id).toBe('UntrustedForeignKey:dbo.Line(A,B)->dbo.Head');
  });
});

// ─── switches and config ─────────────────────────────────────────────────────

describe('data quality checks can be switched off', () => {
  it('a check turned off produces no finding of that kind', () => {
    const s = state([keyed('T', 500, [col('Unused', 'int', stats(500, 0, 500))])]);
    expect(kinds(derive(s))).toContain('AlwaysNull');
    expect(kinds(derive(s, { checks: { AlwaysNull: false } }))).not.toContain('AlwaysNull');
  });

  it('defaults every check on except the two that cost an extra scan', () => {
    const c = ResolveDataQualityConfig(undefined);
    const off = DATA_QUALITY_CHECKS.filter((k) => !c.Checks[k]);
    expect(off.sort()).toEqual(['ExactDuplicateRows', 'UnreferencedParentRows']);
    expect(c.Enabled).toBe(true);
    expect(c.Probes).toBe(true);
  });

  it('rejects unknown check names and bad thresholds', () => {
    const errors = ValidateDataQualityConfig({
      checks: { AlwaysNul: false } as Partial<Record<DataQualityCheck, boolean>>,
      thresholds: { nearUniqueRatio: -1 },
    });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("unknown check 'AlwaysNul'");
  });
});

// ─── helpers ─────────────────────────────────────────────────────────────────

describe('data quality helpers', () => {
  it('reads ISO dates from Date objects and saved strings', () => {
    expect(ToISODate(new Date('1900-01-01T00:00:00Z'))).toBe('1900-01-01');
    expect(ToISODate('9999-12-31T00:00:00.000Z')).toBe('9999-12-31');
    expect(ToISODate(undefined)).toBeUndefined();
  });

  it('groups spellings by their folded form, most frequent first', () => {
    expect(
      SpellingGroups([
        { Value: 'active', Frequency: 2 },
        { Value: 'Active', Frequency: 9 },
        { Value: 'Closed', Frequency: 4 },
      ]),
    ).toEqual([['Active', 'active'], ['Closed']]);
  });

  it('splits identifiers into words', () => {
    expect(NameWords('UnitPrice')).toEqual(['unit', 'price']);
    expect(NameWords('order_qty')).toEqual(['order', 'qty']);
    expect(NameWords('HTMLCode')).toEqual(['html', 'code']);
  });

  it('builds stable ids', () => {
    expect(FindingId({ Kind: 'AlwaysNull', SchemaName: 'dbo', TableName: 'T', ColumnName: 'C' })).toBe('AlwaysNull:dbo.T.C');
  });
});
