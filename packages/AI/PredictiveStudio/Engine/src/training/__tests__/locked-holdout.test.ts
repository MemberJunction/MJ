import { describe, it, expect } from 'vitest';
import type { MatrixData } from '@memberjunction/predictive-studio-core';

import { LockedHoldoutSplitter, DEFAULT_SPLIT_SEED } from '../locked-holdout';

/** `count` rows of [id, label]; `labelOf(i)` picks each row's label. */
function matrix(count: number, labelOf: (i: number) => number | string): MatrixData {
  return { columns: ['id', 'label'], rows: Array.from({ length: count }, (_v, i) => [i, labelOf(i)]) };
}

const holdoutIds = (m: MatrixData, fraction: number, seed: number, problemType: 'classification' | 'regression' = 'classification'): number[] =>
  LockedHoldoutSplitter.Carve(m, fraction, 'label', problemType, seed).LockedHoldout.rows.map((r) => Number(r[0]));

describe('LockedHoldoutSplitter — seeded locked-holdout carve (I1)', () => {
  it('uses the sidecar default seed', () => {
    expect(DEFAULT_SPLIT_SEED).toBe(42);
  });

  it('same rows + same seed → same holdout', () => {
    const m = matrix(100, (i) => i % 3);
    expect(holdoutIds(m, 0.2, 42)).toEqual(holdoutIds(m, 0.2, 42));
    expect(holdoutIds(m, 0.2, 7, 'regression')).toEqual(holdoutIds(m, 0.2, 7, 'regression'));
  });

  it('different seed → different holdout', () => {
    const m = matrix(100, (i) => i % 3);
    expect(holdoutIds(m, 0.2, 42)).not.toEqual(holdoutIds(m, 0.2, 43));
    expect(holdoutIds(m, 0.2, 42, 'regression')).not.toEqual(holdoutIds(m, 0.2, 43, 'regression'));
  });

  it('is a sample, not the trailing rows', () => {
    const m = matrix(100, () => 1);
    expect(holdoutIds(m, 0.1, 42, 'regression')).not.toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
  });

  it('splits training and holdout disjointly, covering every row, in input order', () => {
    const m = matrix(50, (i) => i % 2);
    const split = LockedHoldoutSplitter.Carve(m, 0.2, 'label', 'classification', 42);
    const train = split.Training.rows.map((r) => Number(r[0]));
    const hold = split.LockedHoldout.rows.map((r) => Number(r[0]));
    expect(hold).toHaveLength(10);
    expect(train).toHaveLength(40);
    expect([...train, ...hold].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_v, i) => i));
    expect(hold).toEqual([...hold].sort((a, b) => a - b));
    expect(train).toEqual([...train].sort((a, b) => a - b));
  });

  it('keeps every class in a classification holdout when the data allows it', () => {
    // 95 / 3 / 2 imbalance, 10% holdout: a plain sample would usually miss the two small classes.
    const m = matrix(100, (i) => (i < 95 ? 'common' : i < 98 ? 'rare' : 'rarest'));
    for (const seed of [1, 2, 3, 42, 99]) {
      const split = LockedHoldoutSplitter.Carve(m, 0.1, 'label', 'classification', seed);
      expect(split.HoldoutRowCount).toBe(10);
      expect(Object.keys(split.HoldoutClassCounts)).toEqual(['common', 'rare', 'rarest']);
      // Every class also keeps at least one training row.
      expect(new Set(split.Training.rows.map((r) => r[1]))).toEqual(new Set(['common', 'rare', 'rarest']));
    }
  });

  it('keeps class proportions in the holdout', () => {
    const m = matrix(100, (i) => (i < 70 ? 0 : 1));
    expect(LockedHoldoutSplitter.Carve(m, 0.2, 'label', 'classification', 42).HoldoutClassCounts).toEqual({ '0': 14, '1': 6 });
  });

  it('records holdout class counts only for classification', () => {
    const m = matrix(20, (i) => i % 2);
    expect(LockedHoldoutSplitter.Carve(m, 0.2, 'label', 'classification', 42).HoldoutClassCounts).toEqual({ '0': 2, '1': 2 });
    expect(LockedHoldoutSplitter.Carve(m, 0.2, 'label', 'regression', 42).HoldoutClassCounts).toEqual({});
  });

  it('keeps the holdout count arithmetic: at least one row for a positive fraction, never every row', () => {
    expect(LockedHoldoutSplitter.HoldoutCount(10, 0.2)).toBe(2);
    expect(LockedHoldoutSplitter.HoldoutCount(10, 0.01)).toBe(1);
    expect(LockedHoldoutSplitter.HoldoutCount(10, 1)).toBe(9);
    expect(LockedHoldoutSplitter.HoldoutCount(10, 0)).toBe(0);
    expect(LockedHoldoutSplitter.HoldoutCount(1, 0.5)).toBe(0);
  });
});
