/**
 * LLM review layer for the Index Advisor.
 *
 * Per table, the model sees the rule-based proposals plus the context DBAutoDoc built (column
 * statistics, descriptions, existing indexes, sample queries) and may keep, drop or modify each
 * proposal and suggest new ones. The model returns structured decisions, never SQL; every
 * suggestion is validated deterministically before it is applied.
 */

import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { PromptEngine } from '../../prompts/PromptEngine.js';
import type { AIConfig } from '../../types/config.js';
import type { DatabaseDocumentation, TableDefinition } from '../../types/state.js';
import type { AutoDocIndex } from '../../types/driver.js';
import { IsCovered, IsPoorKeyColumn, IndexPriority } from './IndexRules.js';
import type {
  IndexAdvisorData,
  IndexLLMReviewSummary,
  IndexProposal,
  IndexReviewResponse
} from './IndexAdvisorTypes.js';

const MAX_KEY_COLUMNS = 5;
const MAX_INCLUDE_COLUMNS = 10;
const MAX_SAMPLE_QUERIES = 3;
const MAX_SQL_CHARS = 1500;
const MODEL_OVERRIDE_KEY = 'indexAdvisor';

const lower = (s: string) => s.toLowerCase();

/** A table chosen for review. */
export interface IndexReviewTarget {
  SchemaName: string;
  Table: TableDefinition;
}

/** Result of applying one table's review response. */
export interface IndexReviewApplyResult {
  Proposals: IndexProposal[];
  Dropped: IndexLLMReviewSummary['Dropped'];
  Rejected: IndexLLMReviewSummary['Rejected'];
}

export class IndexLLMReviewer {
  constructor(
    private promptEngine: PromptEngine,
    private ai: AIConfig,
    private log: (message: string) => void
  ) {}

  /** Creates a reviewer with its own prompt engine over the package's prompt templates. */
  public static async Create(ai: AIConfig, log: (message: string) => void): Promise<IndexLLMReviewer> {
    const promptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../prompts');
    const engine = new PromptEngine(ai, promptsDir);
    await engine.Initialize();
    return new IndexLLMReviewer(engine, ai, log);
  }

  /** Reviews the selected tables and returns the revised proposal list plus a summary. */
  public async Review(
    state: DatabaseDocumentation,
    data: IndexAdvisorData,
    platform: string
  ): Promise<{ Proposals: IndexProposal[]; Summary: IndexLLMReviewSummary }> {
    const override = this.ai.modelOverrides?.[MODEL_OVERRIDE_KEY];
    const summary: IndexLLMReviewSummary = {
      Model: override?.model ?? this.ai.model, TablesReviewed: 0, TokensUsed: 0, Dropped: [], Rejected: [], Errors: []
    };
    let proposals = [...data.Proposed];
    for (const target of SelectReviewTables(state, data)) {
      proposals = await this.reviewTable(state, data, target, platform, proposals, summary);
    }
    return { Proposals: proposals.sort((a, b) => b.Priority - a.Priority), Summary: summary };
  }

  private async reviewTable(
    state: DatabaseDocumentation,
    data: IndexAdvisorData,
    target: IndexReviewTarget,
    platform: string,
    proposals: IndexProposal[],
    summary: IndexLLMReviewSummary
  ): Promise<IndexProposal[]> {
    const isThisTable = (p: IndexProposal) => sameTable(p, target);
    const tableProposals = proposals.filter(isThisTable);
    const existing = data.Existing.filter((ix) => sameTable(ix, target));
    const override = this.ai.modelOverrides?.[MODEL_OVERRIDE_KEY];
    const result = await this.promptEngine.ExecutePrompt<IndexReviewResponse>(
      'index-review',
      BuildReviewContext(state, target, tableProposals, existing, platform),
      { responseFormat: 'JSON', temperature: override?.temperature ?? 0.1, maxTokens: override?.maxTokens ?? this.ai.maxTokens, modelOverride: override?.model, effortLevelOverride: override?.effortLevel }
    );
    summary.TablesReviewed++;
    summary.TokensUsed += result.tokensUsed;
    if (!result.success || !result.result) {
      summary.Errors.push({ TableName: target.Table.name, Error: result.errorMessage ?? 'empty response' });
      this.log(`Index Advisor review failed for ${target.SchemaName}.${target.Table.name} (keeping rule-based proposals)`);
      return proposals;
    }
    const applied = ApplyReviewResponse(target, tableProposals, existing, result.result);
    summary.Dropped.push(...applied.Dropped);
    summary.Rejected.push(...applied.Rejected);
    return [...proposals.filter((p) => !isThisTable(p)), ...applied.Proposals];
  }
}

/**
 * Tables worth reviewing: large enough, and either carrying a rule-based proposal or used by a
 * sample query. Largest first, capped at MaxLLMTables.
 */
export function SelectReviewTables(state: DatabaseDocumentation, data: IndexAdvisorData): IndexReviewTarget[] {
  const wanted = new Set<string>([
    ...data.Proposed.map((p) => tableId(p.SchemaName, p.TableName)),
    ...(state.sampleQueries?.queries ?? []).flatMap((q) => [...q.primaryEntities, ...q.relatedEntities].map((e) => tableId(e.schema, e.table)))
  ]);
  const skipped = new Set(data.SkippedSchemas.map((s) => lower(s.SchemaName)));
  return state.schemas
    .filter((s) => !skipped.has(lower(s.name)))
    .flatMap((s) => s.tables.map((t) => ({ SchemaName: s.name, Table: t })))
    .filter((t) => t.Table.rowCount >= data.Options.MinRowCount && wanted.has(tableId(t.SchemaName, t.Table.name)))
    .sort((a, b) => b.Table.rowCount - a.Table.rowCount)
    .slice(0, data.Options.MaxLLMTables);
}

/** Template context for `prompts/index-review.md`. */
export function BuildReviewContext(
  state: DatabaseDocumentation,
  target: IndexReviewTarget,
  proposals: IndexProposal[],
  existing: AutoDocIndex[],
  platform: string
): object {
  const t = target.Table;
  return {
    platform,
    table: { schema: target.SchemaName, name: t.name, rowCount: t.rowCount, description: t.description ?? '' },
    columns: t.columns.map((c) => ({
      name: c.name,
      dataType: c.dataType,
      distinctCount: c.statistics?.distinctCount ?? null,
      nullPercentage: c.statistics ? Math.round(c.statistics.nullPercentage) : null,
      description: (c.description ?? '').slice(0, 160)
    })),
    existing: existing.map((ix) => ({
      name: ix.IndexName, columns: ix.Columns, include: ix.IncludeColumns, isUnique: ix.IsUnique, isPrimaryKey: ix.IsPrimaryKey, filter: ix.FilterDefinition ?? ''
    })),
    proposals: proposals.map((p) => ({ columns: p.Columns, reason: p.Reason })),
    sampleQueries: (state.sampleQueries?.queries ?? [])
      .filter((q) => [...q.primaryEntities, ...q.relatedEntities].some((e) => tableId(e.schema, e.table) === tableId(target.SchemaName, t.name)))
      .slice(0, MAX_SAMPLE_QUERIES)
      .map((q) => ({ name: q.name, sql: q.sqlQuery.slice(0, MAX_SQL_CHARS) }))
  };
}

/** Applies one table's review response, validating every change. Pure; no LLM involved. */
export function ApplyReviewResponse(
  target: IndexReviewTarget,
  proposals: IndexProposal[],
  existing: AutoDocIndex[],
  response: IndexReviewResponse
): IndexReviewApplyResult {
  const out: IndexReviewApplyResult = { Proposals: [], Dropped: [], Rejected: [] };
  const decisions = new Map((Array.isArray(response.Decisions) ? response.Decisions : []).map((d) => [d.Proposal, d]));
  proposals.forEach((proposal, i) => applyDecision(target, proposal, decisions.get(i + 1), existing, out));
  for (const addition of Array.isArray(response.Additions) ? response.Additions : []) {
    const candidate: IndexProposal = {
      SchemaName: target.SchemaName, TableName: target.Table.name, Columns: addition.Columns ?? [], IncludeColumns: addition.IncludeColumns ?? [],
      Source: 'LLM', Reason: addition.Reason ?? '', Priority: Math.max(1, IndexPriority(target.Table.rowCount) - 5),
      Evidence: { RowCount: target.Table.rowCount }
    };
    acceptIfValid(target, candidate, existing, out);
  }
  return out;
}

function applyDecision(
  target: IndexReviewTarget,
  proposal: IndexProposal,
  decision: IndexReviewResponse['Decisions'][number] | undefined,
  existing: AutoDocIndex[],
  out: IndexReviewApplyResult
): void {
  if (decision?.Action === 'drop' && decision.Reason) {
    out.Dropped.push({ Proposal: proposal, Reason: decision.Reason });
    return;
  }
  if (decision?.Action === 'modify') {
    const modified: IndexProposal = {
      ...proposal,
      Columns: decision.Columns ?? proposal.Columns,
      IncludeColumns: decision.IncludeColumns ?? proposal.IncludeColumns,
      Reason: `${proposal.Reason} Adjusted by review: ${decision.Reason}`
    };
    if (acceptIfValid(target, modified, existing, out)) {
      return;
    }
  }
  // keep, no decision, or an invalid modification: the rule-based proposal stands
  acceptIfValid(target, proposal, existing, out);
}

/** Validates a proposal against the table and what is already planned; records rejections. */
function acceptIfValid(target: IndexReviewTarget, p: IndexProposal, existing: AutoDocIndex[], out: IndexReviewApplyResult): boolean {
  const why = validate(target, p, existing, out.Proposals);
  if (why) {
    out.Rejected.push({ TableName: target.Table.name, Columns: p.Columns, Why: why });
    return false;
  }
  out.Proposals.push({ ...p, Columns: canonical(target.Table, p.Columns), IncludeColumns: canonical(target.Table, p.IncludeColumns) });
  return true;
}

function validate(target: IndexReviewTarget, p: IndexProposal, existing: AutoDocIndex[], planned: IndexProposal[]): string | null {
  const columns = p.Columns ?? [];
  const include = p.IncludeColumns ?? [];
  const unknown = [...columns, ...include].filter((c) => !findColumn(target.Table, c));
  if (columns.length === 0 || columns.length > MAX_KEY_COLUMNS) return `needs 1–${MAX_KEY_COLUMNS} key columns`;
  if (include.length > MAX_INCLUDE_COLUMNS) return `too many INCLUDE columns`;
  if (unknown.length) return `unknown column(s): ${unknown.join(', ')}`;
  if (new Set(columns.map(lower)).size !== columns.length) return 'repeats a key column';
  if (include.some((c) => columns.some((k) => lower(k) === lower(c)))) return 'INCLUDE repeats a key column';
  if (IsPoorKeyColumn(findColumn(target.Table, columns[0])!)) return `leading column ${columns[0]} is a poor index key`;
  if (IsCovered(columns, existing)) return 'an existing index already starts with these columns';
  if (planned.some((q) => q.Columns.length === columns.length && q.Columns.every((c, i) => lower(c) === lower(columns[i])))) return 'duplicates another proposal';
  return null;
}

function findColumn(table: TableDefinition, name: string) {
  return table.columns.find((c) => lower(c.name) === lower(name));
}

function canonical(table: TableDefinition, names: string[]): string[] {
  return names.map((n) => findColumn(table, n)?.name ?? n);
}

function sameTable(item: { SchemaName: string; TableName: string }, target: IndexReviewTarget): boolean {
  return lower(item.SchemaName) === lower(target.SchemaName) && lower(item.TableName) === lower(target.Table.name);
}

function tableId(schema: string, table: string): string {
  return `${lower(schema)}.${lower(table)}`;
}

