import { describe, it, expect } from 'vitest';
import { IncumbentExpressions } from '../incumbent-heuristic';

describe('incumbent heuristic expressions', () => {
  it('scores the rule "renewed last year" as 1/0 and null when the value is missing', () => {
    const r = IncumbentExpressions.ParseIncumbentExpression('prior_dues_periods_400d >= 2');
    expect(r.Ok).toBe(true);
    if (!r.Ok) return;
    const row = (v: number | null) => (c: string) => (c === 'prior_dues_periods_400d' ? v : null);
    expect([IncumbentExpressions.EvaluateIncumbentExpression(r.Value, row(3)), IncumbentExpressions.EvaluateIncumbentExpression(r.Value, row(1)), IncumbentExpressions.EvaluateIncumbentExpression(r.Value, row(null))]).toEqual([1, 0, null]);
    expect(IncumbentExpressions.IncumbentExpressionColumns(r.Value)).toEqual(['prior_dues_periods_400d']);
  });
  it('binds and tighter than or, and accepts a bare column as the score', () => {
    const r = IncumbentExpressions.ParseIncumbentExpression('a > 1 and b < 2 or c == 0');
    if (!r.Ok) throw new Error(r.Errors.join('; '));
    const rowA: Record<string, number> = { a: 0, b: 5, c: 0 };
    const rowB: Record<string, number> = { a: 2, b: 5, c: 3 };
    expect(IncumbentExpressions.EvaluateIncumbentExpression(r.Value, (c) => rowA[c] ?? null)).toBe(1);
    expect(IncumbentExpressions.EvaluateIncumbentExpression(r.Value, (c) => rowB[c] ?? null)).toBe(0);
    const bare = IncumbentExpressions.ParseIncumbentExpression('LastYearScore');
    expect(bare.Ok && bare.Value).toEqual({ Kind: 'column', Column: 'LastYearScore' });
  });
  it('refuses anything outside the grammar', () => {
    expect(IncumbentExpressions.ParseIncumbentExpression('DROP TABLE x').Ok).toBe(false);
    expect(IncumbentExpressions.ParseIncumbentExpression('a >= ').Ok).toBe(false);
    expect(IncumbentExpressions.ParseIncumbentExpression('a >= 1 xor b < 2').Ok).toBe(false);
  });
});
