import { describe, it, expect } from 'vitest';
import type { HoldoutSplit } from '@memberjunction/predictive-studio-core';
import { RollingOriginCarver, TrailingFractionCarver } from '../holdout-carver';
import type { AssembledRow } from '../../feature-assembly/as-of/as-of-assembler';

type RollingOrigin = Extract<HoldoutSplit, { readonly kind: 'rolling-origin' }>;

/** Monthly rows t0…t(n−1) from January 2020, and each row's period. */
function monthly(n: number): { readonly Rows: AssembledRow[]; readonly Periods: Map<string, Date | null> } {
  const rows = Array.from({ length: n }, (_, k): AssembledRow => ({ RowId: `t${k}`, Values: [k], Provenance: [] }));
  return { Rows: rows, Periods: new Map(rows.map((r, k) => [r.RowId, new Date(Date.UTC(2020, k, 1))])) };
}

const design: RollingOrigin = { kind: 'rolling-origin', origins: 5, horizonPeriods: 1, gapPeriods: 0, minTrainPeriods: 24, window: 'expanding' };

describe('RollingOriginCarver', () => {
  it("holds out exactly the last origins × horizon periods, the trainer's outer test periods, whatever the row order", () => {
    const { Rows, Periods } = monthly(40);
    const roles = new RollingOriginCarver(design, Periods).AssignRoles([...Rows].reverse());
    expect([...roles].filter(([, role]) => role === 'locked-holdout').map(([id]) => id).sort()).toEqual(['t35', 't36', 't37', 't38', 't39']);
    expect(roles.size).toBe(40);
    // The trailing fraction would have held out another number of rows (8 of 40 at 0.2).
    expect([...new TrailingFractionCarver(0.2).AssignRoles(Rows).values()].filter((r) => r === 'locked-holdout')).toHaveLength(8);
  });

  it('refuses a series too short for the design, and a row without a period, at the carve stage', () => {
    const short = monthly(28);
    expect(() => new RollingOriginCarver(design, short.Periods).AssignRoles(short.Rows)).toThrow(expect.objectContaining({
      Refusal: { stage: 'carve', reason: { kind: 'too-few-periods', periods: 28, origins: 5, horizonPeriods: 1, gapPeriods: 0, minTrainPeriods: 24 } },
    }));
    const { Rows, Periods } = monthly(40);
    Periods.set('t3', null);
    expect(() => new RollingOriginCarver(design, Periods).AssignRoles(Rows)).toThrow(expect.objectContaining({
      Refusal: { stage: 'carve', reason: { kind: 'missing-carve-date', rowId: 't3', column: 'Period' } },
    }));
  });
});
