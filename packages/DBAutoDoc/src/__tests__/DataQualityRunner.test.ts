import { describe, it, expect } from 'vitest';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver';
import { DataQualityRunner, NormalizeNullPercentages, CorrectRowCounts } from '../quality/DataQualityRunner';
import type { DataQualityConfig } from '../types/config';
import type { BoundedQueryOutcome } from '../types/data-quality';
import type { ColumnDefinition, ColumnStatistics, DatabaseDocumentation, ForeignKeyReference, TableDefinition } from '../types/state';
import type { AutoDocIndex } from '../types/driver';

// ─── fixtures ────────────────────────────────────────────────────────────────

function stats(totalRows: number, distinctCount: number, nullCount: number, extra: Partial<ColumnStatistics> = {}): ColumnStatistics {
  return {
    totalRows,
    distinctCount,
    nullCount,
    uniquenessRatio: totalRows ? distinctCount / totalRows : 0,
    nullPercentage: totalRows ? (nullCount / totalRows) * 100 : 0,
    sampleValues: [],
    ...extra,
  };
}

function col(name: string, dataType: string, s?: ColumnStatistics, extra: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return { name, dataType, isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [], statistics: s, ...extra };
}

const pk = (t: string): AutoDocIndex => ({
  SchemaName: 'dbo',
  TableName: t,
  IndexName: `pk_${t}`,
  Columns: ['Id'],
  IncludeColumns: [],
  IsUnique: true,
  IsPrimaryKey: true,
  Method: 'btree',
  HasExpressions: false,
});

function table(name: string, rows: number, columns: ColumnDefinition[], extra: Partial<TableDefinition> = {}): TableDefinition {
  const id = col('Id', 'int', stats(rows, rows, 0), { isPrimaryKey: true, isNullable: false });
  return { name, rowCount: rows, dependsOn: [], dependents: [], columns: [id, ...columns], descriptionIterations: [], indexes: [pk(name)], ...extra };
}

function state(tables: TableDefinition[]): DatabaseDocumentation {
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
    database: { name: 'db', server: 'stub', analyzedAt: '', provider: 'sqlserver' },
    phases: { descriptionGeneration: [] },
    schemas: [{ name: 'dbo', tables, descriptionIterations: [] }],
  };
}

type Responder = (sql: string) => BoundedQueryOutcome<Record<string, unknown>>;

/** A driver that answers ExecuteBounded from `respond` and records every statement. */
function fakeDriver(respond: Responder): { Driver: BaseAutoDocDriver; Sql: string[] } {
  const sqlLog: string[] = [];
  const driver = {
    ExecuteBounded: async (sql: string) => {
      sqlLog.push(sql);
      return respond(sql);
    },
  };
  return { Driver: driver as unknown as BaseAutoDocDriver, Sql: sqlLog };
}

/** Answer each alias of a probe statement from `values` (by alias), zero otherwise. */
function rowFor(sql: string, values: Record<string, number | string>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const m of sql.matchAll(/ AS ([a-z0-9_]+)/g)) row[m[1]] = values[m[1]] ?? 0;
  return row;
}

const ok = (rows: Record<string, unknown>[]): BoundedQueryOutcome<Record<string, unknown>> => ({ Ok: true, Rows: rows });

function runner(config: DataQualityConfig | undefined, driver: BaseAutoDocDriver, skip = false): DataQualityRunner {
  return new DataQualityRunner(config, { Driver: driver, SkipRequested: skip, Now: () => new Date('2026-11-09T00:00:00Z') });
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('DataQualityRunner', () => {
  const statusColumn = () =>
    col(
      'Status',
      'nvarchar',
      stats(1000, 5, 0, {
        valueDistribution: [
          { value: 'Active', frequency: 800 },
          { value: 'Closed', frequency: 200 },
        ],
      }),
      { maxLength: 20 },
    );

  it('takes no measurements and derives nothing when skipped', async () => {
    const { Driver, Sql } = fakeDriver(() => ok([]));
    const s = state([table('T', 1000, [col('Unused', 'int', stats(1000, 0, 1000))])]);
    const r = runner(undefined, Driver, true);
    await r.RunMeasurementPass(s);
    expect(s.phases.dataQuality?.Status).toBe('skipped');
    expect(r.DeriveAndStore(s)).toEqual([]);
    expect(s.dataQuality).toBeUndefined();
    expect(Sql).toHaveLength(0);
  });

  it('with probes off, issues no SQL but still reports what the statistics show', async () => {
    const { Driver, Sql } = fakeDriver(() => ok([]));
    const s = state([table('T', 1000, [col('Unused', 'int', stats(1000, 0, 1000))])]);
    const r = runner({ probes: false }, Driver);
    await r.RunMeasurementPass(s);
    const findings = r.DeriveAndStore(s);
    expect(Sql).toHaveLength(0);
    expect(s.phases.dataQuality).toMatchObject({ Status: 'completed', ProbesEnabled: false });
    expect(findings.map((f) => f.Kind)).toContain('AlwaysNull');
  });

  it('probes a table once, records the counts, and turns them into findings', async () => {
    const { Driver, Sql } = fakeDriver((sql) => ok([rowFor(sql, { rows_: '1000', c0_nonnull: 1000, c0_blank: 25, c0_untrimmed: 3 })]));
    const s = state([table('T', 1000, [statusColumn()])]);
    const r = runner(undefined, Driver);
    await r.RunMeasurementPass(s);
    expect(Sql).toHaveLength(1);
    const probe = s.phases.dataQuality?.TableProbes['dbo.T'];
    expect(probe).toMatchObject({ Outcome: 'ok', RowCount: 1000, Columns: { Status: { BlankRows: 25, UntrimmedRows: 3 } } });
    const kinds = r.DeriveAndStore(s).map((f) => f.Kind);
    expect(kinds).toEqual(expect.arrayContaining(['BlankString', 'UntrimmedString']));
    expect(s.phases.dataQuality?.FindingCounts?.warning).toBeGreaterThan(0);
  });

  it('replaces the catalog estimate with the exact row count and keeps the estimate', async () => {
    const { Driver } = fakeDriver((sql) => ok([rowFor(sql, { rows_: 1000 })]));
    const t = table('T', 1000, [statusColumn()]);
    t.rowCount = 640;
    const s = state([t]);
    await runner(undefined, Driver).RunMeasurementPass(s);
    expect(t.rowCount).toBe(1000);
    expect(t.rowCountEstimate).toBe(640);
  });

  it('splits a failing batch down to the column the engine cannot evaluate', async () => {
    const columns = [
      col('A', 'nvarchar', stats(100, 5, 0), { maxLength: 20 }),
      col('B', 'nvarchar', stats(100, 5, 0), { maxLength: 20 }),
      col('C', 'nvarchar', stats(100, 5, 0), { maxLength: 20 }),
    ];
    const { Driver, Sql } = fakeDriver((sql) =>
      sql.includes('[B]') ? { Ok: false, Reason: 'columns are not comparable (type mismatch)' } : ok([rowFor(sql, { rows_: 100 })]),
    );
    const s = state([table('T', 100, columns)]);
    await runner(undefined, Driver).RunMeasurementPass(s);
    const probe = s.phases.dataQuality?.TableProbes['dbo.T'];
    expect(probe?.Outcome).toBe('partial');
    expect(probe?.Columns.B?.Failed).toBe('columns are not comparable (type mismatch)');
    expect(probe?.Columns.A?.BlankRows).toBe(0);
    expect(probe?.Columns.C?.BlankRows).toBe(0);
    expect(s.phases.dataQuality?.Status).toBe('partial');
    expect(Sql.length).toBeGreaterThan(1);
  });

  it('records a table it cannot read as failed, with a value-free reason, and keeps going', async () => {
    const { Driver } = fakeDriver((sql) =>
      sql.includes('[Locked]') ? { Ok: false, Reason: 'no permission to read one of the columns' } : ok([rowFor(sql, { rows_: 100 })]),
    );
    const s = state([table('Locked', 100, [statusColumn()]), table('Open', 100, [statusColumn()])]);
    await runner(undefined, Driver).RunMeasurementPass(s);
    expect(s.phases.dataQuality?.TableProbes['dbo.Locked']).toMatchObject({ Outcome: 'failed', Reason: 'no permission to read one of the columns' });
    expect(s.phases.dataQuality?.TableProbes['dbo.Open']?.Outcome).toBe('ok');
    expect(s.phases.dataQuality).toMatchObject({ TablesFailed: 1, TablesProbed: 1, Status: 'partial' });
  });

  it('skips tables above maxRowsForProbe without querying them', async () => {
    const { Driver, Sql } = fakeDriver((sql) => ok([rowFor(sql, { rows_: 100 })]));
    const s = state([table('Big', 5000, [statusColumn()]), table('Small', 100, [statusColumn()])]);
    await runner({ maxRowsForProbe: 1000 }, Driver).RunMeasurementPass(s);
    expect(s.phases.dataQuality?.TableProbes['dbo.Big']).toMatchObject({ Outcome: 'skipped', Reason: 'rows above maxRowsForProbe' });
    expect(Sql.every((q) => !q.includes('[Big]'))).toBe(true);
  });

  it('does not re-probe a completed table on resume, and probes only relationships added since', async () => {
    const { Driver, Sql } = fakeDriver((sql) => ok([rowFor(sql, { rows_: 100, r0_checked: 100, r0_orphans: 4 })]));
    const customers = table('Customer', 100, []);
    const orders = table('Order', 100, [col('CustomerId', 'int', stats(100, 50, 0), { isForeignKey: true }), statusColumn()]);
    const s = state([customers, orders]);
    const r = runner(undefined, Driver);
    await r.RunMeasurementPass(s);
    expect(Sql.filter((q) => q.includes('FROM [dbo].[Order]'))).toHaveLength(1);
    expect(Sql.filter((q) => q.includes('NOT EXISTS'))).toHaveLength(0);

    // The description loop proposes a key: only that relationship is probed.
    const proposed: ForeignKeyReference = { schema: 'dbo', table: 'Customer', column: 'CustomerId', referencedColumn: 'Id' };
    orders.dependsOn.push(proposed);
    const before = Sql.length;
    await r.RunRelationshipPass(s);
    expect(Sql.length - before).toBe(1);
    expect(Sql[Sql.length - 1]).toContain('NOT EXISTS');
    const finding = r.DeriveAndStore(s).find((f) => f.Kind === 'OrphanedForeignKey');
    expect(finding?.Measures.OrphanRows).toBe(4);

    // A resumed run with the same state probes nothing new.
    const again = Sql.length;
    await runner(undefined, Driver).RunMeasurementPass(s);
    expect(Sql.length).toBe(again);
  });

  it('never probes a trusted declared key, and probes an untrusted one', async () => {
    const { Driver, Sql } = fakeDriver((sql) => ok([rowFor(sql, { rows_: 100, r0_checked: 100, r0_orphans: 0 })]));
    const trusted: ForeignKeyReference = {
      schema: 'dbo',
      table: 'Customer',
      column: 'CustomerId',
      referencedColumn: 'Id',
      constraintName: 'fk_ok',
      isTrusted: true,
    };
    const untrusted: ForeignKeyReference = {
      schema: 'dbo',
      table: 'Customer',
      column: 'BillToId',
      referencedColumn: 'Id',
      constraintName: 'fk_nocheck',
      isTrusted: false,
    };
    const orders = table(
      'Order',
      100,
      [col('CustomerId', 'int', stats(100, 50, 0), { isForeignKey: true }), col('BillToId', 'int', stats(100, 50, 0), { isForeignKey: true })],
      { dependsOn: [trusted, untrusted] },
    );
    const s = state([table('Customer', 100, []), orders]);
    await runner(undefined, Driver).RunMeasurementPass(s);
    const orphanSql = Sql.filter((q) => q.includes('NOT EXISTS'));
    expect(orphanSql).toHaveLength(1);
    expect(orphanSql[0]).toContain('[BillToId]');
    expect(orphanSql[0]).not.toContain('[CustomerId] IS NOT NULL');
  });

  it('fetches the exact spellings when variants are found and uses them as the value distribution', async () => {
    const { Driver } = fakeDriver((sql) => {
      if (sql.includes('GROUP BY')) {
        return ok([
          { value: 'Active', frequency: '700' },
          { value: 'ACTIVE', frequency: '100' },
          { value: 'Closed', frequency: '200' },
        ]);
      }
      return ok([rowFor(sql, { rows_: 1000, c0_nonnull: 1000, c0_variants: 1 })]);
    });
    const status = statusColumn();
    status.possibleValues = ['Active', 'Closed'];
    const s = state([table('T', 1000, [status])]);
    const r = runner(undefined, Driver);
    await r.RunMeasurementPass(s);
    expect(status.statistics?.valueDistribution?.map((v) => v.value)).toEqual(['Active', 'ACTIVE', 'Closed']);
    expect(status.possibleValues).toEqual(['Active', 'ACTIVE', 'Closed']);
    const finding = r.DeriveAndStore(s).find((f) => f.Kind === 'CaseWhitespaceVariants');
    expect(finding?.SampleValues).toEqual(['Active', 'ACTIVE']);
  });

  it('survives a driver that throws instead of returning a failure', async () => {
    const driver = {
      ExecuteBounded: async () => {
        throw new Error("Conversion failed when converting the varchar value 'AA:1' to int");
      },
    } as unknown as BaseAutoDocDriver;
    const s = state([table('T', 100, [statusColumn()])]);
    await runner(undefined, driver).RunMeasurementPass(s);
    const probe = s.phases.dataQuality?.TableProbes['dbo.T'];
    expect(probe?.Outcome).toBe('failed');
    expect(probe?.Reason).toBe('columns are not comparable (type mismatch)');
    expect(JSON.stringify(s.phases.dataQuality)).not.toContain('AA:1');
  });
});

describe('statistics normalisation', () => {
  it('recomputes null percentages on the 0-100 scale', () => {
    const c = col('X', 'int', { ...stats(200, 10, 60), nullPercentage: 0.3 });
    const s = state([table('T', 200, [c])]);
    NormalizeNullPercentages(s);
    expect(c.statistics?.nullPercentage).toBe(30);
  });

  it('takes the exact row count from the sampled statistics when no probe ran', () => {
    const t = table('T', 200, []);
    t.rowCount = 50;
    const s = state([t]);
    CorrectRowCounts(s);
    expect(t.rowCount).toBe(200);
    expect(t.rowCountEstimate).toBe(50);
  });
});
