import { describe, it, expect } from 'vitest';
import { ApplyBestPrimaryKeys } from '../discovery/ApplyPrimaryKeys';
import type { PKCandidate } from '../types/discovery';
import type { ColumnDefinition, DatabaseDocumentation } from '../types/state';

/**
 * #6004: discovery applies ONE primary key per table, the best non-rejected candidate at or above
 * the confidence floor, and a re-apply after pruning unflags the columns of a rejected candidate.
 * Columns no candidate names are never touched.
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
