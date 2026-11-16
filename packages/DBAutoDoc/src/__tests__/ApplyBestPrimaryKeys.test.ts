import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'url';
import { ApplyBestPrimaryKeys } from '../discovery/ApplyPrimaryKeys';
import { AnalysisEngine } from '../core/AnalysisEngine';
import { PromptEngine } from '../prompts/PromptEngine';
import type { StateManager } from '../state/StateManager';
import type { IterationTracker } from '../state/IterationTracker';
import type { DBAutoDocConfig } from '../types/config';
import type { PKCandidate, RelationshipDiscoveryPhase } from '../types/discovery';
import type { ColumnDefinition, ColumnStatistics, DatabaseDocumentation } from '../types/state';

/**
 * Discovery applies ONE primary key per table: the best surviving candidate (not rejected, and
 * confirmed or at or above the confidence floor; confirmed first, then highest confidence). A
 * re-apply after pruning or after an LLM decision unflags the columns of the candidates that lost,
 * and a table whose candidates were all rejected ends with none flagged. Columns no candidate names
 * are never touched.
 */

function column(name: string, isPrimaryKey = false): ColumnDefinition {
  return { name, dataType: 'int', isNullable: false, isPrimaryKey, isForeignKey: false, descriptionIterations: [] };
}

function state(columns: ColumnDefinition[]): DatabaseDocumentation {
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
      totalColumns: columns.length,
    },
    database: { name: 'db', server: 'stub', analyzedAt: '' },
    phases: { descriptionGeneration: [] },
    schemas: [
      { name: 'dbo', tables: [{ name: 'Price', rowCount: 10, dependsOn: [], dependents: [], columns, descriptionIterations: [] }], descriptionIterations: [] },
    ],
  };
}

function candidate(columnNames: string[], confidence: number, status: PKCandidate['status'] = 'candidate'): PKCandidate {
  return {
    schemaName: 'dbo',
    tableName: 'Price',
    columnNames,
    confidence,
    evidence: { uniqueness: 1, nullCount: 0, totalRows: 10, dataPattern: 'composite', namingScore: 0, dataTypeScore: 0, warnings: [] },
    discoveredInIteration: 1,
    validatedByLLM: false,
    status,
  };
}

const flagged = (s: DatabaseDocumentation): string[] => s.schemas[0].tables[0].columns.filter((c) => c.isPrimaryKey).map((c) => c.name);

describe('ApplyBestPrimaryKeys', () => {
  it('flags only the best candidate per table, not the union of all candidates above the floor', () => {
    const s = state([column('ID'), column('ProductKey'), column('TypeKey'), column('Amount')]);
    const result = ApplyBestPrimaryKeys(s, [candidate(['ID'], 75), candidate(['ProductKey', 'TypeKey'], 95)], 70);
    expect(flagged(s)).toEqual(['ProductKey', 'TypeKey']);
    expect(result).toEqual({ TablesFlagged: 1, ColumnsCleared: 0 });
  });

  it('on re-apply after pruning, unflags the rejected winner and flags the surviving candidate', () => {
    const s = state([column('ID'), column('ProductKey'), column('TypeKey'), column('Amount')]);
    const candidates = [candidate(['ID'], 75), candidate(['ProductKey', 'TypeKey'], 95)];
    ApplyBestPrimaryKeys(s, candidates, 70);
    candidates[1].status = 'rejected';
    const result = ApplyBestPrimaryKeys(s, candidates, 70);
    expect(flagged(s)).toEqual(['ID']);
    expect(result).toEqual({ TablesFlagged: 1, ColumnsCleared: 2 });
  });

  it('ignores candidates below the floor and leaves a table with none untouched', () => {
    const s = state([column('ID'), column('Code')]);
    const result = ApplyBestPrimaryKeys(s, [candidate(['Code'], 40)], 70);
    expect(flagged(s)).toEqual([]);
    expect(result).toEqual({ TablesFlagged: 0, ColumnsCleared: 0 });
  });

  it('never touches a column no candidate names, so a key declared in the catalog survives', () => {
    const s = state([column('DeclaredKey', true), column('ID'), column('Other')]);
    ApplyBestPrimaryKeys(s, [candidate(['ID'], 90)], 70);
    expect(flagged(s)).toEqual(['DeclaredKey', 'ID']);
  });

  it('keeps the earlier candidate on a confidence tie', () => {
    const s = state([column('A'), column('B')]);
    ApplyBestPrimaryKeys(s, [candidate(['A'], 90), candidate(['B'], 90)], 70);
    expect(flagged(s)).toEqual(['A']);
  });
});

describe('ApplyBestPrimaryKeys: confirmation and rejection', () => {
  it('unflags every candidate column when pruning rejects the only candidate', () => {
    const s = state([column('ID'), column('ProductKey'), column('TypeKey')]);
    const candidates = [candidate(['ProductKey', 'TypeKey'], 95)];
    ApplyBestPrimaryKeys(s, candidates, 70);
    candidates[0].status = 'rejected';
    const result = ApplyBestPrimaryKeys(s, candidates, 70);
    expect(flagged(s)).toEqual([]);
    expect(result).toEqual({ TablesFlagged: 0, ColumnsCleared: 2 });
  });

  it('prefers a confirmed candidate over a higher-scoring unconfirmed one', () => {
    const s = state([column('ID'), column('A'), column('B')]);
    ApplyBestPrimaryKeys(s, [candidate(['A', 'B'], 95), candidate(['ID'], 85, 'confirmed')], 70);
    expect(flagged(s)).toEqual(['ID']);
  });

  it('keeps a confirmed candidate below the floor', () => {
    const s = state([column('ID'), column('Code')]);
    ApplyBestPrimaryKeys(s, [candidate(['Code'], 50, 'confirmed')], 70);
    expect(flagged(s)).toEqual(['Code']);
  });
});

describe("AnalysisEngine: an LLM primary-key decision replaces the table's other candidate", () => {
  const uniqueStats: ColumnStatistics = { totalRows: 10, distinctCount: 10, uniquenessRatio: 1, nullCount: 0, nullPercentage: 0, sampleValues: [] };

  function engineFor(s: DatabaseDocumentation): AnalysisEngine {
    const promptEngine = new PromptEngine({ provider: 'gemini', model: 'm', apiKey: 'k' }, fileURLToPath(new URL('../../prompts', import.meta.url)));
    const table = s.schemas[0].tables[0];
    const stateManager = { findTable: () => table } as Partial<StateManager> as StateManager;
    const config = {
      ai: { provider: 'gemini', model: 'm', apiKey: 'k' },
      analysis: { backpropagation: { maxDepth: 1 }, convergence: { maxIterations: 1, stabilityWindow: 1, confidenceThreshold: 0.8 } },
    } as DBAutoDocConfig;
    return new AnalysisEngine(config, promptEngine, stateManager, {} as IterationTracker);
  }

  function withCandidates(s: DatabaseDocumentation, candidates: PKCandidate[]): DatabaseDocumentation {
    s.phases.keyDetection = { discovered: { primaryKeys: candidates, foreignKeys: [] } } as Partial<RelationshipDiscoveryPhase> as RelationshipDiscoveryPhase;
    ApplyBestPrimaryKeys(s, candidates, 70);
    return s;
  }

  it('confirming an existing candidate unflags the candidate discovery had applied', async () => {
    const s = withCandidates(state([column('ID'), column('ProductKey'), column('TypeKey')]), [candidate(['ID'], 85), candidate(['ProductKey', 'TypeKey'], 60)]);
    expect(flagged(s)).toEqual(['ID']);
    await engineFor(s)['processPKInsightFromLLM'](s, 'dbo', 'Price', { columns: ['ProductKey', 'TypeKey'], confidence: 0.9, reasoning: 'r' });
    expect(flagged(s)).toEqual(['ProductKey', 'TypeKey']);
  });

  it('a new key from an LLM proposal unflags the candidate discovery had applied', async () => {
    const code = { ...column('Code'), statistics: uniqueStats };
    const s = withCandidates(state([column('A'), column('B'), code]), [candidate(['A', 'B'], 90)]);
    expect(flagged(s)).toEqual(['A', 'B']);
    await engineFor(s)['processPKInsightFromLLM'](s, 'dbo', 'Price', { columns: ['Code'], confidence: 0.8, reasoning: 'r' });
    expect(flagged(s)).toEqual(['Code']);
  });
});
