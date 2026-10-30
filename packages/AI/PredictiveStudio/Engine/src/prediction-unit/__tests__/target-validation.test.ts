import { describe, it, expect } from 'vitest';
import { UnitTargetValidator } from '../target-validation';
import type { UnitRow } from '../unit-row-reader';
import type { UnitResolutionCounts } from '@memberjunction/predictive-studio-core';

const counts: UnitResolutionCounts = { rowsRead: 10, censoredRowsExcluded: 2, labelKnownRowsExcluded: 0, emptyLabelRowsExcluded: 0, duplicateRowsRemoved: 0, resolvedRows: 8, dataCutoff: '2026-01-01' };
const rowsWith = (labels: (string | number)[]): UnitRow[] => labels.map((Label, i) => ({ RowId: `r${i}`, EntityKey: `e${i}`, DecisionDate: new Date(0), WindowEnd: new Date(0), GroupKey: null, Period: null, Label, Source: {} }));

describe('ValidateUnitTargets', () => {
  it('refuses a one-class binary target before training', () => {
    expect(UnitTargetValidator.ValidateUnitTargets(rowsWith(['1', '1', '1']), { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, counts))
      .toEqual({ status: 'refused', reason: { kind: 'single-valued-target', value: '1', rows: 3 } });
  });
  it('refuses a binary label outside the declared class order', () => {
    const v = UnitTargetValidator.ValidateUnitTargets(rowsWith(['0', '1', 'Pending']), { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, counts);
    expect(v).toEqual({ status: 'refused', reason: { kind: 'task-type-mismatch', declared: 'binary', observed: 'labels Pending are not in classOrder [0, 1]' } });
  });
  it('refuses a Poisson count declared continuous and accepts it declared count', () => {
    const counts3 = rowsWith([0, 1, 2, 0, 3, 5, 1, 0]);
    expect(UnitTargetValidator.ValidateUnitTargets(counts3, { kind: 'continuous' }, counts)).toEqual({ status: 'refused', reason: { kind: 'task-type-mismatch', declared: 'continuous', observed: 'count (non-negative integers including 0, 5 distinct values)' } });
    expect(UnitTargetValidator.ValidateUnitTargets(counts3, { kind: 'count' }, counts)).toEqual({ status: 'valid', observedLevels: 5, eligibleRows: 8, censoredRows: 2 });
  });
  it('refuses negative values for a count and for a non-negative task', () => {
    expect(UnitTargetValidator.ValidateUnitTargets(rowsWith([1, -1, 2]), { kind: 'count' }, counts).status).toBe('refused');
    expect(UnitTargetValidator.ValidateUnitTargets(rowsWith([1.5, -0.1, 2]), { kind: 'non-negative', tweediePower: 1.5 }, counts).status).toBe('refused');
  });
  it('refuses an empty population naming every exclusion', () => {
    expect(UnitTargetValidator.ValidateUnitTargets([], { kind: 'count' }, counts)).toEqual({ status: 'refused', reason: { kind: 'no-resolved-rows', censored: 2, labelKnown: 0, emptyLabel: 0 } });
  });
});
