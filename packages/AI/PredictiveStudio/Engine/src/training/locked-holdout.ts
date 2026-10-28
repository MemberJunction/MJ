/**
 * @module training/locked-holdout
 *
 * The seeded carve of the **locked holdout** (plan §8.2) that training takes off the assembled rows before anything
 * is sent to the sidecar. The rows that land in the holdout depend only on the row values, their order and the seed,
 * so the same training read with the same seed always holds out the same rows. Classification holdouts are
 * stratified on the label (as the sidecar's own split is), so an imbalanced or small target keeps every class in the
 * holdout when the data allows it; regression holdouts are a plain seeded sample.
 */
import type { MatrixData, ProblemType } from '@memberjunction/predictive-studio-core';

/**
 * The seed for every training split: the engine's locked-holdout carve and the sidecar's train/test and k-fold splits
 * (sent as `ValidationConfig.random_state`). 42 is the sidecar's own default, so the two sides always agree.
 */
export const DEFAULT_SPLIT_SEED = 42;

/** The result of carving a matrix into a training portion and a locked holdout; both keep the input row order. */
export interface LockedHoldoutSplit {
  /** The rows the model may train and tune on. */
  Training: MatrixData;
  /** The rows scored exactly once, never trained on. */
  LockedHoldout: MatrixData;
  /** `LockedHoldout.rows.length`. */
  HoldoutRowCount: number;
  /** `Training.rows.length`. */
  TrainingRowCount: number;
  /**
   * Holdout rows per label (label as text → row count) for a classification carve; an empty object for regression
   * or when the label column is absent. Training stores it in the model Lineage as `lockedHoldoutClassCounts`.
   */
  HoldoutClassCounts: Record<string, number>;
}

/** One label value's rows during a stratified carve. */
interface ClassGroup {
  /** Row indices carrying this label, shuffled by the seeded generator. */
  indices: number[];
  /** The proportional share of the holdout this class would get with fractional rows allowed. */
  ideal: number;
  /** Rows of this class assigned to the holdout. */
  take: number;
}

/** Seeded, stratified locked-holdout carve. Pure; no I/O. */
export class LockedHoldoutSplitter {
  /**
   * How many rows a fraction holds out of `total`: at least one when the fraction is positive, never every row (one
   * row always stays for training), and none when there is at most one row.
   */
  public static HoldoutCount(total: number, fraction: number): number {
    const f = LockedHoldoutSplitter.clampFraction(fraction);
    if (total <= 1) return 0;
    return Math.min(Math.max(Math.floor(total * f), f > 0 ? 1 : 0), total - 1);
  }

  /**
   * Carve the locked holdout off `matrix`.
   *
   * @param matrix the assembled rows (rows with no label already removed)
   * @param fraction the pipeline's `LockedHoldoutFraction`
   * @param targetColumn the label column; when it is not in the matrix the carve is a plain seeded sample
   * @param problemType classification carves are stratified on the label; regression carves are not
   * @param seed the split seed (normally {@link DEFAULT_SPLIT_SEED})
   */
  public static Carve(matrix: MatrixData, fraction: number, targetColumn: string, problemType: ProblemType, seed: number): LockedHoldoutSplit {
    const total = matrix.rows.length;
    const holdoutCount = LockedHoldoutSplitter.HoldoutCount(total, fraction);
    const targetIdx = matrix.columns.indexOf(targetColumn);
    const random = LockedHoldoutSplitter.mulberry32(seed);
    const holdoutIndices =
      problemType === 'classification' && targetIdx >= 0
        ? LockedHoldoutSplitter.stratifiedPick(matrix, targetIdx, holdoutCount, random)
        : LockedHoldoutSplitter.shuffledIndices(total, random).slice(0, holdoutCount);

    const inHoldout = new Set(holdoutIndices);
    const trainingRows = matrix.rows.filter((_r, i) => !inHoldout.has(i));
    const holdoutRows = matrix.rows.filter((_r, i) => inHoldout.has(i));
    return {
      Training: { columns: matrix.columns, rows: trainingRows },
      LockedHoldout: { columns: matrix.columns, rows: holdoutRows },
      HoldoutRowCount: holdoutRows.length,
      TrainingRowCount: trainingRows.length,
      HoldoutClassCounts: problemType === 'classification' && targetIdx >= 0 ? LockedHoldoutSplitter.countLabels(holdoutRows, targetIdx) : {},
    };
  }

  /** Rows per label, keyed by the label as text (the same key the stratified carve groups on), in sorted label order. */
  private static countLabels(rows: MatrixData['rows'], targetIdx: number): Record<string, number> {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = String(row[targetIdx]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const sorted: Record<string, number> = {};
    for (const key of [...counts.keys()].sort()) sorted[key] = counts.get(key) as number;
    return sorted;
  }

  /**
   * Pick `holdoutCount` row indices so each label keeps its share of the rows (largest remainder), every label with
   * at least two rows gets one holdout row when there are enough holdout rows to go round, and no label loses all of
   * its training rows unless the holdout cannot be filled otherwise.
   */
  private static stratifiedPick(matrix: MatrixData, targetIdx: number, holdoutCount: number, random: () => number): number[] {
    const total = matrix.rows.length;
    const byLabel = new Map<string, number[]>();
    matrix.rows.forEach((row, i) => {
      const key = String(row[targetIdx]);
      const list = byLabel.get(key);
      if (list) list.push(i);
      else byLabel.set(key, [i]);
    });
    // Sorted label order, so the result does not depend on which label happens to appear first.
    const groups: ClassGroup[] = [...byLabel.keys()].sort().map((key) => {
      const indices = byLabel.get(key) as number[];
      LockedHoldoutSplitter.shuffleInPlace(indices, random);
      const ideal = (indices.length * holdoutCount) / total;
      return { indices, ideal, take: Math.min(Math.floor(ideal), indices.length - 1) };
    });

    const splittable = groups.filter((g) => g.indices.length >= 2);
    if (holdoutCount >= splittable.length) {
      for (const g of splittable) g.take = Math.max(g.take, 1);
    }
    LockedHoldoutSplitter.trimTo(groups, holdoutCount);
    LockedHoldoutSplitter.fillTo(groups, holdoutCount, (g) => g.indices.length - 1);
    // Only when every label is down to one training row: complete the holdout from the remaining rows.
    LockedHoldoutSplitter.fillTo(groups, holdoutCount, (g) => g.indices.length);
    return groups.flatMap((g) => g.indices.slice(0, g.take));
  }

  /** Remove holdout rows from the most over-allocated labels until the total fits, keeping each label's first row. */
  private static trimTo(groups: ClassGroup[], holdoutCount: number): void {
    let sum = groups.reduce((s, g) => s + g.take, 0);
    while (sum > holdoutCount) {
      const candidates = groups.filter((g) => g.take > 1);
      const pool = candidates.length > 0 ? candidates : groups.filter((g) => g.take > 0);
      const most = pool.reduce((a, b) => (b.take - b.ideal > a.take - a.ideal ? b : a));
      most.take--;
      sum--;
    }
  }

  /** Add holdout rows to the most under-allocated labels (up to `cap`) until the total is reached or no label has room. */
  private static fillTo(groups: ClassGroup[], holdoutCount: number, cap: (g: ClassGroup) => number): void {
    let sum = groups.reduce((s, g) => s + g.take, 0);
    while (sum < holdoutCount) {
      const pool = groups.filter((g) => g.take < cap(g));
      if (pool.length === 0) return;
      const least = pool.reduce((a, b) => (b.ideal - b.take > a.ideal - a.take ? b : a));
      least.take++;
      sum++;
    }
  }

  /** `0..count-1` in a seeded random order. */
  private static shuffledIndices(count: number, random: () => number): number[] {
    const indices = Array.from({ length: count }, (_v, i) => i);
    LockedHoldoutSplitter.shuffleInPlace(indices, random);
    return indices;
  }

  /** Fisher–Yates shuffle driven by the seeded generator. */
  private static shuffleInPlace(values: number[], random: () => number): void {
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const swap = values[i];
      values[i] = values[j];
      values[j] = swap;
    }
  }

  /**
   * mulberry32: a small, fast 32-bit seeded generator returning floats in [0, 1). Local so the carve has no dependency
   * whose algorithm could change under it — the same seed must give the same holdout across releases.
   */
  private static mulberry32(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** A fraction clamped into [0, 1]; a non-finite or negative value is 0. */
  private static clampFraction(value: number): number {
    if (!Number.isFinite(value) || value < 0) return 0;
    return value > 1 ? 1 : value;
  }
}
