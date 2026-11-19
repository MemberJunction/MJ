import { describe, it, expect } from 'vitest';
import { EnumCandidateGate } from '../discovery/EnumCandidateGate';
import { DataQualityReportGenerator } from '../generators/DataQualityReportGenerator';
import { MarkdownGenerator } from '../generators/MarkdownGenerator';
import { AdditionalSchemaInfoGenerator } from '../generators/AdditionalSchemaInfoGenerator';
import { ColumnQualityLines, OrphanEvidence, TableQualityLines } from '../quality/PromptFacts';
import type { DataQualityFinding, DataQualityPhase } from '../types/data-quality';
import type { ColumnDefinition, DatabaseDocumentation } from '../types/state';

// ─── value lists ─────────────────────────────────────────────────────────────

function statusColumn(distribution: Array<[string, number]>): ColumnDefinition {
  const total = distribution.reduce((n, [, f]) => n + f, 0);
  return {
    name: 'Status',
    dataType: 'nvarchar(20)',
    isNullable: false,
    isPrimaryKey: false,
    isForeignKey: false,
    maxLength: 20,
    descriptionIterations: [],
    statistics: {
      totalRows: total,
      distinctCount: distribution.length,
      nullCount: 0,
      uniquenessRatio: distribution.length / total,
      nullPercentage: 0,
      sampleValues: [],
      valueDistribution: distribution.map(([value, frequency]) => ({ value, frequency })),
    },
  };
}

describe('value lists fold spellings that differ only by case or spaces', () => {
  const column = statusColumn([
    ['Active', 700],
    ['Closed', 200],
    ['ACTIVE', 60],
    ['active ', 30],
    ['closed', 10],
  ]);

  it('keeps every spelling when folding is off (the default)', () => {
    const candidate = new EnumCandidateGate().EvaluateColumn(column, 1000);
    expect(candidate?.values).toEqual(['Active', 'Closed', 'ACTIVE', 'active', 'closed']);
    expect(candidate?.variantsFolded).toBeUndefined();
  });

  it('collapses to the most frequent spelling and counts the folds when on', () => {
    const candidate = new EnumCandidateGate({ FoldSpellingVariants: true }).EvaluateColumn(column, 1000);
    expect(candidate?.values).toEqual(['Active', 'Closed']);
    expect(candidate?.variantsFolded).toBe(3);
  });

  it('accepts a verdict value in any spelling and returns the canonical one', () => {
    const gate = new EnumCandidateGate({ FoldSpellingVariants: true });
    expect(gate.FilterVerdictValues(column, 1000, ['active', 'CLOSED', 'Pending'])).toEqual(['Active', 'Closed']);
    expect(new EnumCandidateGate().FilterVerdictValues(column, 1000, ['active', 'CLOSED'])).toBeNull();
  });

  it('leaves a column without collisions exactly as before', () => {
    const clean = statusColumn([
      ['Active', 700],
      ['Closed', 300],
    ]);
    expect(new EnumCandidateGate({ FoldSpellingVariants: true }).EvaluateColumn(clean, 1000)).toEqual(new EnumCandidateGate().EvaluateColumn(clean, 1000));
  });
});

// ─── prompt lines ────────────────────────────────────────────────────────────

function finding(extra: Partial<DataQualityFinding>): DataQualityFinding {
  return {
    Id: 'x',
    Kind: 'AlwaysNull',
    Severity: 'warning',
    Scope: 'column',
    Source: 'statistics',
    SchemaName: 'dbo',
    TableName: 'Order',
    Measures: {},
    Message: 'm',
    ...extra,
  };
}

describe('prompt lines', () => {
  const findings: DataQualityFinding[] = [
    finding({ ColumnName: 'Fax', Kind: 'HighNullRate', Severity: 'info', Message: '95% of rows are NULL.' }),
    finding({ ColumnName: 'Fax', Kind: 'BlankString', Severity: 'warning', Message: '10 rows are blank.' }),
    finding({ Scope: 'table', Kind: 'NoPrimaryKey', Message: 'No primary key.' }),
    finding({
      Scope: 'relationship',
      Kind: 'OrphanedForeignKey',
      Severity: 'error',
      ColumnName: 'CustomerId',
      ColumnNames: ['CustomerId'],
      Related: { SchemaName: 'dbo', TableName: 'Customer', ColumnNames: ['Id'], Declared: false },
      Measures: { OrphanRate: 0.04, CheckedRows: 500 },
      Message: '20 orphans.',
    }),
  ];

  it('lists column facts most severe first, capped per column', () => {
    expect(ColumnQualityLines(findings, 3).get('Fax')).toEqual(['10 rows are blank.', '95% of rows are NULL.']);
    expect(ColumnQualityLines(findings, 1).get('Fax')).toEqual(['10 rows are blank.']);
    expect(ColumnQualityLines(findings, 0).size).toBe(0);
  });

  it('lists table and relationship facts with the relationship spelled out', () => {
    expect(TableQualityLines(findings)).toEqual(['CustomerId → dbo.Customer: 20 orphans.', 'No primary key.']);
  });

  it('leaves constraint suggestions out of the prompt', () => {
    const suggestions = [
      finding({ ColumnName: 'Fax', Kind: 'NullableNeverNull', Severity: 'info', Message: 'never null' }),
      finding({ Scope: 'table', Kind: 'StaleRowCountEstimate', Severity: 'info', Message: 'stale' }),
    ];
    expect(ColumnQualityLines(suggestions, 3).size).toBe(0);
    expect(TableQualityLines(suggestions)).toEqual([]);
  });

  it('finds the orphan evidence for a pruning candidate', () => {
    expect(OrphanEvidence(findings, 'customerid', 'dbo', 'customer')).toEqual({ OrphanRate: 0.04, CheckedRows: 500 });
    expect(OrphanEvidence(findings, 'ShipToId', 'dbo', 'Customer')).toBeUndefined();
  });
});

// ─── reports ─────────────────────────────────────────────────────────────────

function reportState(): DatabaseDocumentation {
  const phase: DataQualityPhase = {
    Status: 'partial',
    StartedAt: '',
    ProbesEnabled: true,
    TotalTables: 2,
    TablesProbed: 1,
    TablesSkipped: 1,
    TablesFailed: 0,
    RelationshipsProbed: 1,
    RelationshipsFailed: 0,
    ProbeDurationMs: 1500,
    TableProbes: { 'dbo.Big': { ProbedAt: '', Outcome: 'skipped', Reason: 'rows above maxRowsForProbe', Measures: [], Columns: {}, DurationMs: 0 } },
    RelationshipProbes: {},
    FindingCounts: { error: 1, warning: 1, info: 1 },
  };
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
      totalTables: 1,
      totalColumns: 1,
    },
    database: { name: 'Shop', server: 'stub', analyzedAt: '' },
    phases: { descriptionGeneration: [], dataQuality: phase },
    schemas: [
      {
        name: 'dbo',
        descriptionIterations: [],
        tables: [
          {
            name: 'Order',
            rowCount: 500,
            dependsOn: [],
            dependents: [],
            descriptionIterations: [],
            columns: [{ name: 'Fax', dataType: 'nvarchar', isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [] }],
          },
        ],
      },
    ],
    dataQuality: [
      finding({ Id: 'HighNullRate:dbo.Order.Fax', ColumnName: 'Fax', Kind: 'HighNullRate', Severity: 'info', Message: '95% of rows are NULL.' }),
      finding({ Id: 'BlankString:dbo.Order.Fax', ColumnName: 'Fax', Kind: 'BlankString', Severity: 'warning', Message: '10 rows are blank.' }),
      finding({
        Id: 'OrphanedForeignKey:dbo.Order.CustomerId->dbo.Customer',
        Scope: 'relationship',
        Kind: 'OrphanedForeignKey',
        Severity: 'error',
        ColumnName: 'CustomerId',
        ColumnNames: ['CustomerId'],
        Related: { SchemaName: 'dbo', TableName: 'Customer', ColumnNames: ['Id'], Declared: true },
        Message: '20 orphans.',
      }),
    ],
  };
}

describe('data quality report', () => {
  it('groups findings by severity, then table, and lists what was not probed', () => {
    const md = new DataQualityReportGenerator().GenerateMarkdown(reportState());
    expect(md).toContain('# Data Quality: Shop');
    expect(md.indexOf('## Errors')).toBeLessThan(md.indexOf('## Warnings'));
    expect(md.indexOf('## Warnings')).toBeLessThan(md.indexOf('## Information'));
    expect(md).toContain('- **CustomerId** → dbo.Customer · OrphanedForeignKey: 20 orphans.');
    expect(md).toContain('## Not probed');
    expect(md).toContain('- dbo.Big: rows above maxRowsForProbe');
  });

  it('writes JSON with counts and without the raw per-table measurements', () => {
    const json = JSON.parse(new DataQualityReportGenerator().GenerateJson(reportState()));
    expect(json.Counts).toEqual({ error: 1, warning: 1, info: 1 });
    expect(json.CountsByKind.BlankString).toBe(1);
    expect(json.Phase.TableProbes).toBeUndefined();
    expect(json.Findings).toHaveLength(3);
  });

  it('summary.md shows warnings and errors per table, not information', () => {
    const md = new MarkdownGenerator().Generate(reportState());
    expect(md).toContain('**Data Quality**:');
    expect(md).toContain('BlankString: 10 rows are blank.');
    expect(md).not.toContain('HighNullRate: 95%');
  });

  it('adds nothing to additionalSchemaInfo.json, which CodeGen reads', () => {
    const withQuality = reportState();
    const without = { ...reportState(), dataQuality: undefined };
    const gen = new AdditionalSchemaInfoGenerator();
    expect(gen.Generate(withQuality, {})).toEqual(gen.Generate(without, {}));
  });
});
