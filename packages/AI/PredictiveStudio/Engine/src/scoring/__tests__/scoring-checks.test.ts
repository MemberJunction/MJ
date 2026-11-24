/**
 * Check 6 of the scoring checks (§5.8.3, C6): no all-null or empty feature column. A column is empty when no row holds
 * a value in it: null, undefined, a non-finite number or a blank string in every row (R5: the refusal had no unit test).
 */
import { describe, it, expect } from 'vitest';

import { ScoringChecks } from '../scoring-checks';
import type { ScoringAssembled } from '../scoring-seams';

/** An assembly of `rows` under `columns`, every column numeric. */
function assembled(columns: string[], rows: (string | number | null)[][]): ScoringAssembled {
  return {
    Status: 'assembled', Matrix: { columns, rows }, Columns: columns.map((Name) => ({ Name, Kind: 'numeric' })), HashColumns: null,
    RowIDs: rows.map((_, i) => `r${i + 1}`), Skipped: [],
  };
}

describe('ScoringChecks.NoEmptyColumn (check 6)', () => {
  it('passes a matrix in which every column holds a value on at least one row', () => {
    expect(ScoringChecks.NoEmptyColumn(assembled(['Tenure', 'Region'], [[4, null], [null, 'East']]))).toBeNull();
  });

  it('refuses naming every column that is null, non-finite or blank on every row, and only those', () => {
    const matrix = assembled(['Tenure', 'Visits', 'Score', 'Region'], [[4, null, Number.NaN, ' '], [5, null, Number.POSITIVE_INFINITY, '']]);
    expect(ScoringChecks.NoEmptyColumn(matrix)).toEqual({ kind: 'nan-or-empty-feature-column', columns: ['Visits', 'Score', 'Region'] });
  });

  it('counts zero as a value, not an empty cell', () => {
    expect(ScoringChecks.NoEmptyColumn(assembled(['Tenure'], [[0], [0]]))).toBeNull();
  });

  it('refuses a matrix with columns and no rows, naming every column; passes one with neither', () => {
    expect(ScoringChecks.NoEmptyColumn(assembled(['Tenure', 'Region'], []))).toEqual({ kind: 'nan-or-empty-feature-column', columns: ['Tenure', 'Region'] });
    expect(ScoringChecks.NoEmptyColumn(assembled([], []))).toBeNull();
  });
});
