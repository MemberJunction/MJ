import { describe, it, expect, vi } from 'vitest';
import { ApplyReviewResponse, SelectReviewTables, BuildReviewContext, IndexLLMReviewer, IndexReviewTarget } from '../plugins/index-advisor/IndexLLMReview';
import { DEFAULT_INDEX_ADVISOR_OPTIONS } from '../plugins/index-advisor/IndexAdvisorPlugin';
import type { IndexAdvisorData, IndexProposal, IndexReviewResponse } from '../plugins/index-advisor/IndexAdvisorTypes';
import type { AutoDocIndex } from '../types/driver';
import type { DatabaseDocumentation, TableDefinition, ColumnDefinition } from '../types/state';
import type { AIConfig } from '../types/config';
import type { PromptEngine } from '../prompts/PromptEngine';
import type { SampleQuery } from '../types/sample-queries';

function col(name: string, dataType = 'int', distinctCount?: number): ColumnDefinition {
  return {
    name, dataType, isNullable: true, isPrimaryKey: false, isForeignKey: false, descriptionIterations: [],
    statistics: distinctCount === undefined ? undefined : { totalRows: 0, distinctCount, uniquenessRatio: 0, nullCount: 0, nullPercentage: 12.4, sampleValues: [] }
  };
}

const ORDERS: TableDefinition = {
  name: 'Orders', rowCount: 100_000, dependsOn: [], dependents: [], descriptionIterations: [], description: 'Customer orders',
  columns: [col('OrderID'), col('CustomerID', 'int', 5000), col('Status', 'varchar(20)', 6), col('OrderDate', 'datetime'), col('Total', 'decimal'), col('IsRush', 'bit', 2), col('Notes', 'nvarchar(max)')]
};
const TARGET: IndexReviewTarget = { SchemaName: 'dbo', Table: ORDERS };

function proposal(columns: string[], extra: Partial<IndexProposal> = {}): IndexProposal {
  return {
    SchemaName: 'dbo', TableName: 'Orders', Columns: columns, IncludeColumns: [], Source: 'FKCoverage',
    Reason: 'FK has no index.', Priority: 50, Evidence: { RowCount: 100_000 }, ...extra
  };
}

const response = (r: Partial<IndexReviewResponse>): IndexReviewResponse => ({ Decisions: [], Additions: [], ...r });

describe('ApplyReviewResponse', () => {
  it('keeps proposals with a keep decision or no decision', () => {
    const out = ApplyReviewResponse(TARGET, [proposal(['CustomerID'])], [], response({ Decisions: [{ Proposal: 1, Action: 'keep', Reason: 'ok' }] }));
    expect(out.Proposals.map((p) => p.Columns)).toEqual([['CustomerID']]);
    expect(ApplyReviewResponse(TARGET, [proposal(['CustomerID'])], [], response({})).Proposals).toHaveLength(1);
  });

  it('drops a proposal only when the decision gives a reason', () => {
    const dropped = ApplyReviewResponse(TARGET, [proposal(['CustomerID'])], [], response({ Decisions: [{ Proposal: 1, Action: 'drop', Reason: 'rarely joined' }] }));
    expect(dropped.Proposals).toEqual([]);
    expect(dropped.Dropped[0].Reason).toBe('rarely joined');
    const noReason = ApplyReviewResponse(TARGET, [proposal(['CustomerID'])], [], response({ Decisions: [{ Proposal: 1, Action: 'drop', Reason: '' }] }));
    expect(noReason.Proposals).toHaveLength(1);
  });

  it('applies a valid modification (composite + INCLUDE), normalising column case', () => {
    const out = ApplyReviewResponse(TARGET, [proposal(['CustomerID'])], [], response({
      Decisions: [{ Proposal: 1, Action: 'modify', Columns: ['customerid', 'orderdate'], IncludeColumns: ['total'], Reason: 'covers the order history query' }]
    }));
    expect(out.Proposals[0]).toMatchObject({ Columns: ['CustomerID', 'OrderDate'], IncludeColumns: ['Total'], Source: 'FKCoverage' });
    expect(out.Proposals[0].Reason).toContain('Adjusted by review: covers the order history query');
  });

  it('keeps the original when a modification is invalid, and records why', () => {
    const out = ApplyReviewResponse(TARGET, [proposal(['CustomerID'])], [], response({
      Decisions: [{ Proposal: 1, Action: 'modify', Columns: ['NoSuchColumn'], Reason: 'x' }]
    }));
    expect(out.Proposals.map((p) => p.Columns)).toEqual([['CustomerID']]);
    expect(out.Rejected[0].Why).toContain('unknown column(s): NoSuchColumn');
  });

  it('accepts a valid addition as an LLM-sourced proposal', () => {
    const out = ApplyReviewResponse(TARGET, [], [], response({ Additions: [{ Columns: ['OrderDate'], Reason: 'date-range filters' }] }));
    expect(out.Proposals[0]).toMatchObject({ Columns: ['OrderDate'], Source: 'LLM', Priority: 45 });
  });

  it('rejects additions that are unknown, poor keys, already covered, duplicates or malformed', () => {
    const existing: AutoDocIndex[] = [{
      SchemaName: 'dbo', TableName: 'Orders', IndexName: 'ix_date', Columns: ['OrderDate', 'Status'], IncludeColumns: [],
      IsUnique: false, IsPrimaryKey: false, Method: 'btree', HasExpressions: false
    }];
    const out = ApplyReviewResponse(TARGET, [proposal(['CustomerID'])], existing, response({
      Additions: [
        { Columns: ['Ghost'], Reason: 'a' },
        { Columns: ['IsRush'], Reason: 'b' },
        { Columns: ['Notes'], Reason: 'c' },
        { Columns: ['OrderDate'], Reason: 'd' },
        { Columns: ['CustomerID'], Reason: 'e' },
        { Columns: [], Reason: 'f' },
        { Columns: ['Status', 'Status'], Reason: 'g' },
        { Columns: ['Total'], IncludeColumns: ['Total'], Reason: 'h' }
      ]
    }));
    expect(out.Proposals.map((p) => p.Columns)).toEqual([['CustomerID']]);
    expect(out.Rejected.map((r) => r.Why)).toEqual([
      'unknown column(s): Ghost',
      'leading column IsRush is a poor index key',
      'leading column Notes is a poor index key',
      'an existing index already starts with these columns',
      'duplicates another proposal',
      'needs 1–5 key columns',
      'repeats a key column',
      'INCLUDE repeats a key column'
    ]);
  });

  it('tolerates a malformed response', () => {
    const out = ApplyReviewResponse(TARGET, [proposal(['CustomerID'])], [], { Decisions: 'nope', Additions: null } as unknown as IndexReviewResponse);
    expect(out.Proposals).toHaveLength(1);
  });
});

// ─── table selection + reviewer ──────────────────────────────────────────────

function sampleQuery(table: string): SampleQuery {
  return {
    id: 'q1', name: `Query on ${table}`, description: '', businessPurpose: '', schema: 'dbo',
    primaryEntities: [{ schema: 'dbo', table }], relatedEntities: [],
    sqlQuery: `SELECT * FROM dbo.${table} WHERE Status = 'open'`
  } as SampleQuery;
}

function makeState(tables: TableDefinition[], queries: SampleQuery[] = []): DatabaseDocumentation {
  return {
    version: '1.0.0', summary: {} as DatabaseDocumentation['summary'], database: { name: 'db', server: 's', analyzedAt: '', provider: 'postgresql' },
    phases: { descriptionGeneration: [] }, schemas: [{ name: 'dbo', tables, descriptionIterations: [] }],
    sampleQueries: queries.length ? { generatedAt: '', status: 'completed', queries, summary: {} as never } : undefined
  };
}

function makeData(proposed: IndexProposal[], options = DEFAULT_INDEX_ADVISOR_OPTIONS): IndexAdvisorData {
  return { AnalyzedAt: '', Options: options, Existing: [], Proposed: proposed, Redundant: [], SkippedSchemas: [] };
}

const table = (name: string, rowCount: number): TableDefinition => ({ ...ORDERS, name, rowCount });

describe('SelectReviewTables', () => {
  it('picks large tables with proposals or sample-query use, largest first, capped', () => {
    const state = makeState([table('Orders', 100_000), table('Lines', 900_000), table('Tiny', 10), table('Unused', 500_000)], [sampleQuery('Lines')]);
    const picked = SelectReviewTables(state, makeData([proposal(['CustomerID'])]));
    expect(picked.map((t) => t.Table.name)).toEqual(['Lines', 'Orders']);
    const capped = SelectReviewTables(state, makeData([proposal(['CustomerID'])], { ...DEFAULT_INDEX_ADVISOR_OPTIONS, MaxLLMTables: 1 }));
    expect(capped.map((t) => t.Table.name)).toEqual(['Lines']);
  });

  it('includes the table\'s sample queries in the prompt context', () => {
    const state = makeState([ORDERS], [sampleQuery('Orders')]);
    const ctx = BuildReviewContext(state, TARGET, [proposal(['CustomerID'])], [], 'postgresql') as { sampleQueries: { sql: string }[]; columns: { nullPercentage: number | null }[] };
    expect(ctx.sampleQueries[0].sql).toContain("WHERE Status = 'open'");
    expect(ctx.columns[1].nullPercentage).toBe(12);
  });
});

describe('IndexLLMReviewer.Review', () => {
  const ai = { provider: 'gemini', model: 'flash', apiKey: 'k', modelOverrides: { indexAdvisor: { model: 'pro' } } } as AIConfig;

  it('applies the model\'s decisions and reports usage', async () => {
    const engine = { ExecutePrompt: vi.fn().mockResolvedValue({ success: true, tokensUsed: 321, result: response({ Additions: [{ Columns: ['OrderDate'], Reason: 'ranges' }] }) }) };
    const reviewer = new IndexLLMReviewer(engine as unknown as PromptEngine, ai, () => {});
    const { Proposals, Summary } = await reviewer.Review(makeState([ORDERS]), makeData([proposal(['CustomerID'])]), 'postgresql');
    expect(Proposals.map((p) => p.Columns)).toEqual([['CustomerID'], ['OrderDate']]);
    expect(Summary).toMatchObject({ Model: 'pro', TablesReviewed: 1, TokensUsed: 321, Errors: [] });
    expect(engine.ExecutePrompt).toHaveBeenCalledWith('index-review', expect.any(Object), expect.objectContaining({ modelOverride: 'pro', responseFormat: 'JSON' }));
  });

  it('keeps rule-based proposals for a table whose review call fails', async () => {
    const engine = { ExecutePrompt: vi.fn().mockResolvedValue({ success: false, tokensUsed: 0, errorMessage: 'rate limited' }) };
    const reviewer = new IndexLLMReviewer(engine as unknown as PromptEngine, ai, () => {});
    const { Proposals, Summary } = await reviewer.Review(makeState([ORDERS]), makeData([proposal(['CustomerID'])]), 'postgresql');
    expect(Proposals.map((p) => p.Columns)).toEqual([['CustomerID']]);
    expect(Summary.Errors).toEqual([{ TableName: 'Orders', Error: 'rate limited' }]);
  });
});

describe('prompts/index-review.md', () => {
  it('renders with a real review context', async () => {
    const nunjucks = (await import('nunjucks')).default;
    const fs = await import('fs');
    const template = fs.readFileSync(new URL('../../prompts/index-review.md', import.meta.url), 'utf-8');
    const existing: AutoDocIndex[] = [{ SchemaName: 'dbo', TableName: 'Orders', IndexName: 'PK_Orders', Columns: ['OrderID'], IncludeColumns: [], IsUnique: true, IsPrimaryKey: true, Method: 'btree', HasExpressions: false }];
    const ctx = BuildReviewContext(makeState([ORDERS], [sampleQuery('Orders')]), TARGET, [proposal(['CustomerID'])], existing, 'postgresql');
    const out = new nunjucks.Environment(null, { autoescape: false }).renderString(template, ctx); // as PromptEngine configures it
    expect(out).toContain('## Table: dbo.Orders (100000 rows)');
    expect(out).toContain('PK_Orders (OrderID) [primary key]');
    expect(out).toContain('1. (CustomerID) — FK has no index.');
    expect(out).toContain("WHERE Status = 'open'");
    expect(out).toContain('"Decisions"');
  });
});
