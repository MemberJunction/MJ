import { describe, it, expect, vi } from 'vitest';
import { Introspector, DataSampler } from '../database/Database.js';
import { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';
import { SQLServerDriver } from '../drivers/SQLServerDriver.js';
import { AutoDocColumn, AutoDocColumnStatistics, AutoDocSchema } from '../types/driver.js';
import { EnumCandidateGate } from '../discovery/EnumCandidateGate.js';
import { AdditionalSchemaInfoGenerator } from '../generators/AdditionalSchemaInfoGenerator.js';
import { ColumnDefinition, ColumnStatistics, DatabaseDocumentation, TableDefinition, ValueListVerdict } from '../types/state.js';
import { AnalysisEngine } from '../core/AnalysisEngine.js';
import { ColumnDescriptionPromptResult } from '../types/prompts.js';
import { AnalysisConfig, DBAutoDocConfig } from '../types/config.js';
import { PromptEngine } from '../prompts/PromptEngine.js';
import { StateManager } from '../state/StateManager.js';
import { IterationTracker } from '../state/IterationTracker.js';

/**
 * #4537: value lists were emitted as closed lists on columns that should not have one (MJ's
 * __mj_* columns, audit user columns, years, GUIDs), sometimes with values the column never held.
 * The prompt asked for verdicts only on enum candidates, but nothing enforced it.
 */

function observed(values: string[], totalRows = 1000): ColumnStatistics {
  return {
    totalRows,
    distinctCount: values.length,
    uniquenessRatio: values.length / totalRows,
    nullCount: 0,
    nullPercentage: 0,
    sampleValues: values,
    valueDistribution: values.map(value => ({ value, frequency: Math.floor(totalRows / values.length) })),
  };
}

function column(name: string, values: string[] | null, extra: Partial<ColumnDefinition> = {}): ColumnDefinition {
  return {
    name,
    dataType: 'nvarchar(40)',
    isNullable: true,
    isPrimaryKey: false,
    isForeignKey: false,
    descriptionIterations: [],
    statistics: values ? observed(values) : undefined,
    ...extra,
  };
}

function verdict(values: string[], type: 'List' | 'ListOrUserEntry' = 'List'): ValueListVerdict {
  return { isEnum: true, type, confidence: 0.95, values, reasoning: 'r', source: 'llm', decidedAt: '2026-10-18T00:00:00Z' };
}

describe('EnumCandidateGate exclusions', () => {
  const gate = new EnumCandidateGate();

  it.each([
    ['__mj_integration_SyncStatus', ['Active', 'Pending', 'Error']],
    ['cst_add_user', ['jsmith', 'adoe', 'bkim']],
    ['CreatedBy', ['jsmith', 'adoe', 'bkim']],
    ['mbr_change_user', ['jsmith', 'adoe']],
  ])('excludes %s by name', (name, values) => {
    expect(gate.EvaluateColumn(column(name, values), 1000)).toBeNull();
  });

  it.each([
    ['years', ['2022', '2024', '2025', '2026']],
    ['GUIDs', ['6f1c2a3b-0d4e-4f5a-9b8c-7d6e5f4a3b2c', 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d']],
    ['dates', ['2024-01-01', '2025-06-30']],
  ])('excludes a column whose values are all %s', (_label, values) => {
    expect(gate.EvaluateColumn(column('dues_year', values), 1000)).toBeNull();
  });

  it('still accepts an ordinary status column', () => {
    expect(gate.EvaluateColumn(column('Status', ['Active', 'Inactive', 'Pending']), 1000)?.values).toEqual(['Active', 'Inactive', 'Pending']);
  });

  it('does not exclude a column only some of whose values look like years', () => {
    expect(gate.EvaluateColumn(column('Tier', ['2024', 'Gold', 'Silver']), 1000)).not.toBeNull();
  });
});

describe('EnumCandidateGate.FilterVerdictValues', () => {
  const gate = new EnumCandidateGate();

  it('drops values the column never held', () => {
    expect(gate.FilterVerdictValues(column('Status', ['Active', 'Archived', 'Error']), 1000, ['Active', 'Inactive', 'Pending', 'Error'])).toEqual(['Active', 'Error']);
  });

  it('rejects the verdict when fewer than two observed values remain', () => {
    expect(gate.FilterVerdictValues(column('Status', ['Active', 'Archived', 'Error']), 1000, ['Active', 'Inactive', 'Pending'])).toBeNull();
  });

  it('rejects a verdict on a column that is not a candidate', () => {
    expect(gate.FilterVerdictValues(column('Notes', ['a', 'b']), 1000, ['a', 'b'])).toBeNull();
    expect(gate.FilterVerdictValues(column('Status', null), 1000, ['Active', 'Inactive'])).toBeNull();
  });
});

describe('AdditionalSchemaInfoGenerator value lists', () => {
  function emitted(columns: ColumnDefinition[]) {
    const state: DatabaseDocumentation = {
      version: '1.0.0',
      summary: { createdAt: '', lastModified: '', totalIterations: 0, totalPromptsRun: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, estimatedCost: 0, totalSchemas: 1, totalTables: 1, totalColumns: columns.length },
      database: { name: 'T', server: 'x', analyzedAt: '' },
      phases: { descriptionGeneration: [] },
      schemas: [{ name: 'app', descriptionIterations: [], tables: [{ name: 'Member', rowCount: 1000, columns, dependsOn: [], dependents: [], descriptionIterations: [] }] }],
    };
    const out = JSON.parse(new AdditionalSchemaInfoGenerator().generate(state)) as Record<string, Array<{ Fields?: Array<{ FieldName: string; ValueListType: string; PossibleValues: string[] }> }>>;
    return out.app?.[0]?.Fields ?? [];
  }

  it('emits a list inferred from data as ListOrUserEntry, with only observed values', () => {
    const fields = emitted([column('Status', ['Active', 'Archived'], { valueListVerdict: verdict(['Active', 'Archived', 'Pending']) })]);
    expect(fields).toEqual([expect.objectContaining({ FieldName: 'Status', ValueListType: 'ListOrUserEntry', PossibleValues: ['Active', 'Archived'] })]);
  });

  it('emits ListOrUserEntry on a column whose CHECK is not a value list', () => {
    // CHECK (Status <> '') allows any non-empty status; a closed list of the observed ones would reject valid rows.
    const fields = emitted([column('Status', ['Active', 'Archived'], { checkConstraint: "([Status]<>'')", valueListVerdict: verdict(['Active', 'Archived']) })]);
    expect(fields[0].ValueListType).toBe('ListOrUserEntry');
  });

  it('emits ListOrUserEntry on a value-list CHECK too, leaving the closed list to CodeGen', () => {
    // Trimmed to observed values, a closed list would drop 'Urgent', which the CHECK allows.
    const fields = emitted([column('Priority', ['Low', 'High'], { checkConstraint: "([Priority]='Urgent' OR [Priority]='High' OR [Priority]='Low')", valueListVerdict: verdict(['Low', 'High', 'Urgent']) })]);
    expect(fields).toEqual([expect.objectContaining({ FieldName: 'Priority', ValueListType: 'ListOrUserEntry', PossibleValues: ['High', 'Low'] })]);
  });

  it('does not export a verdict stored in an older state file on a column the gate now rejects', () => {
    expect(emitted([column('__mj_integration_SyncStatus', ['Active', 'Pending'], { valueListVerdict: verdict(['Active', 'Pending']) })])).toEqual([]);
    expect(emitted([column('dues_year', ['2024', '2025'], { valueListVerdict: verdict(['2024', '2025']) })])).toEqual([]);
  });

  it('exports a user-approved verdict as approved', () => {
    const fields = emitted([column('Region', null, { userApproved: true, valueListVerdict: verdict(['East', 'West']) })]);
    expect(fields).toEqual([expect.objectContaining({ FieldName: 'Region', ValueListType: 'List', PossibleValues: ['East', 'West'] })]);
  });
});

describe('AnalysisEngine.persistEnumVerdicts', () => {
  class TestableEngine extends AnalysisEngine {
    public Persist(table: TableDefinition, results: ColumnDescriptionPromptResult[]): void {
      this.persistEnumVerdicts(table, results, 'test-model');
    }
  }
  const config = {
    analysis: { backpropagation: { maxDepth: 1 }, convergence: { maxIterations: 1, stabilityWindow: 1, confidenceThreshold: 0.8 } },
  } as DBAutoDocConfig;
  const engine = new TestableEngine(config, { setGuardrailCheck: () => undefined } as Partial<PromptEngine> as PromptEngine, {} as StateManager, {} as IterationTracker);

  function result(columnName: string, values: string[]): ColumnDescriptionPromptResult {
    return { columnName, description: 'd', reasoning: 'r', valueList: { isEnum: true, type: 'List', confidence: 0.95, values, reasoning: 'r' } };
  }

  it('drops a verdict the model returned for a column that is not an enum candidate', () => {
    const table: TableDefinition = { name: 'Member', rowCount: 1000, dependsOn: [], dependents: [], descriptionIterations: [],
      columns: [column('cst_add_user', ['jsmith', 'adoe', 'bkim'])] };
    engine.Persist(table, [result('cst_add_user', ['jsmith', 'adoe', 'bkim'])]);
    expect(table.columns[0].valueListVerdict).toBeUndefined();
  });

  it('keeps only the observed values of a candidate column', () => {
    const table: TableDefinition = { name: 'Member', rowCount: 1000, dependsOn: [], dependents: [], descriptionIterations: [],
      columns: [column('Status', ['Active', 'Archived', 'Error'])] };
    engine.Persist(table, [result('Status', ['Active', 'Inactive', 'Archived'])]);
    expect(table.columns[0].valueListVerdict?.values).toEqual(['Active', 'Archived']);
  });
});

describe('declared length (drivers report bare type names)', () => {
  const gate = new EnumCandidateGate();

  it('reads the length from maxLength when the type is a bare varchar', () => {
    expect(gate.EvaluateColumn(column('Status', ['Active', 'Inactive', 'Pending'], { dataType: 'varchar', maxLength: 20 }), 1000)).not.toBeNull();
    expect(gate.EvaluateColumn(column('Status', ['Active', 'Inactive', 'Pending'], { dataType: 'nvarchar', maxLength: 20 }), 1000)).not.toBeNull();
  });

  it('still rejects a bare varchar with no known length (unbounded) or one longer than the limit', () => {
    expect(gate.EvaluateColumn(column('Status', ['Active', 'Inactive'], { dataType: 'varchar' }), 1000)).toBeNull();
    expect(gate.EvaluateColumn(column('Status', ['Active', 'Inactive'], { dataType: 'nvarchar', maxLength: 500 }), 1000)).toBeNull();
  });

  it('Introspector keeps the driver\'s maxLength on the column', async () => {
    const schemas: AutoDocSchema[] = [{ name: 'app', tables: [{ schemaName: 'app', tableName: 'customer', rowCount: 1, primaryKeys: [], foreignKeys: [],
      columns: [{ name: 'cst_status', dataType: 'varchar', isNullable: false, isPrimaryKey: false, isForeignKey: false, maxLength: 20 }] }] }];
    const driver = { getSchemas: async () => schemas } as Partial<BaseAutoDocDriver> as BaseAutoDocDriver;
    const result = await new Introspector(driver).GetSchemas({}, {});
    expect(result[0].tables[0].columns[0].maxLength).toBe(20);
  });

  it('SQL Server reports nchar/nvarchar length in characters, not bytes', async () => {
    class ColumnsOnly extends SQLServerDriver {
      public Columns(): Promise<AutoDocColumn[]> { return this.getColumns('dbo', 't'); }
    }
    const driver = new ColumnsOnly({ provider: 'sqlserver', host: 'x', database: 'x', user: 'u', password: 'p' });
    const row = (column_name: string, data_type: string, max_length: number) =>
      ({ column_name, data_type, max_length, is_nullable: true, precision: 0, scale: 0, is_primary_key: false, is_foreign_key: false });
    vi.spyOn(driver, 'executeQuery').mockResolvedValue({ success: true, data: [row('a', 'nvarchar', 40), row('b', 'varchar', 40), row('c', 'nvarchar', -1), row('d', 'nchar', 10)] });
    expect((await driver.Columns()).map(c => c.maxLength)).toEqual([20, 40, undefined, 5]);
  });
});

describe('DataSampler keeps the value distribution', () => {
  // 1,000 rows: Active 900, Closed 90, Suspended 8, Archived 2. A 20-row random sample rarely shows the last two.
  const stats: AutoDocColumnStatistics = {
    totalRows: 1000, distinctCount: 4, uniquenessRatio: 0.004, nullCount: 0, nullPercentage: 0,
    sampleValues: ['Active', 'Active', 'Closed', 'Active'],
    valueDistribution: [
      { value: 'Active', frequency: 900, percentage: 90 },
      { value: 'Closed', frequency: 90, percentage: 9 },
      { value: 'Suspended', frequency: 8, percentage: 0.8 },
      { value: 'Archived', frequency: 2, percentage: 0.2 },
    ],
  };

  async function sampled(): Promise<ColumnDefinition> {
    const driver = { getColumnStatistics: async () => stats } as Partial<BaseAutoDocDriver> as BaseAutoDocDriver;
    const col = column('status', null);
    await new DataSampler(driver, { cardinalityThreshold: 20, sampleSize: 20 } as AnalysisConfig).AnalyzeTable('app', 'ticket', [col]);
    return col;
  }

  it('copies every distinct value onto the column statistics', async () => {
    expect((await sampled()).statistics?.valueDistribution?.map(v => v.value)).toEqual(['Active', 'Closed', 'Suspended', 'Archived']);
  });

  it('so the gate keeps a rare value the sample missed', async () => {
    const kept = new EnumCandidateGate().FilterVerdictValues(await sampled(), 1000, ['Active', 'Closed', 'Suspended', 'Archived']);
    expect(kept).toEqual(['Active', 'Closed', 'Suspended', 'Archived']);
  });
});
