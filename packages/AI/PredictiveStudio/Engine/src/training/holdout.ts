/**
 * @module training/holdout
 *
 * The locked-holdout carve — extracted so **exactly one** implementation is shared by every
 * consumer that must agree on what "the training partition" means.
 *
 * There are now two: {@link TrainingEngine}, which trains on the training portion and scores the
 * holdout exactly once, and the statistics pre-pass, which must describe the training portion and
 * **never** the holdout. If those two ever carved differently, the pre-pass would be measuring
 * rows the final model is graded on, and `MLModel.HoldoutMetrics` would silently stop being the
 * honest number the whole validation discipline (§8.2) rests on.
 */

import type { MatrixData, ValidationStrategy } from '@memberjunction/predictive-studio-core';

/** The result of carving a matrix into a training portion + a locked holdout. */
export interface HoldoutSplit {
  /** Rows the model may train and tune on. */
  training: MatrixData;
  /** Rows scored exactly once, on the final model. Never sent as training data. */
  lockedHoldout: MatrixData;
  holdoutRowCount: number;
  trainingRowCount: number;
}

/**
 * Carve the locked holdout off the TAIL of an assembled matrix, before any train/test split.
 *
 * Deterministic by construction — it is a positional slice, not a random sample — so the same
 * matrix and the same fraction always yield the same partition. That is what lets the statistics
 * pre-pass and the training run agree on the split without exchanging row ids.
 *
 * Degenerate inputs are handled rather than guarded against by the caller: a fraction of 0 yields
 * an empty holdout, and a matrix of 0 or 1 rows is never split (there is no honest holdout to take
 * from a single row).
 *
 * @param matrix the fully assembled matrix (features + target)
 * @param validation the pipeline's validation strategy, read for `LockedHoldoutFraction`
 */
export function carveLockedHoldout(matrix: MatrixData, validation: ValidationStrategy): HoldoutSplit {
  const fraction = clamp01(validation.LockedHoldoutFraction);
  const total = matrix.rows.length;
  const holdoutCount = total > 1 ? Math.min(Math.max(Math.floor(total * fraction), fraction > 0 ? 1 : 0), total - 1) : 0;
  const cut = total - holdoutCount;

  const trainingRows = matrix.rows.slice(0, cut);
  const holdoutRows = matrix.rows.slice(cut);
  return {
    training: { columns: matrix.columns, rows: trainingRows },
    lockedHoldout: { columns: matrix.columns, rows: holdoutRows },
    holdoutRowCount: holdoutRows.length,
    trainingRowCount: trainingRows.length,
  };
}

/** Clamp a fraction into `[0, 1]`, mapping NaN/negative to 0. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value > 1 ? 1 : value;
}
