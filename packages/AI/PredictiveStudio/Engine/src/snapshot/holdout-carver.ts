/**
 * @module snapshot/holdout-carver
 *
 * Assigns each assembled row its manifest role before the snapshot is written; the roles are part of the manifest,
 * so they are part of the snapshot's fingerprint.
 */
import { HoldoutCarve, type HoldoutSplit, type SnapshotRowRole } from '@memberjunction/predictive-studio-core';
import type { AssembledRow } from '../feature-assembly/as-of/as-of-assembler';
import { LockedHoldoutSplitter } from '../training/locked-holdout';
import { TrainingRefusedError } from '../training/training-refusal';
import { UtcDay } from '../prediction-unit/utc-day';

/** Assigns every assembled row a manifest role, by row id. */
export interface IHoldoutCarver {
  AssignRoles(rows: readonly AssembledRow[]): ReadonlyMap<string, SnapshotRowRole>;
}

/**
 * Holds out the trailing fraction of the rows: the latest decisions are the locked holdout, so the model is judged on
 * decisions made after every decision it learned from.
 *
 * It relies on the rows arriving in decision-date order and does not re-sort them: the unit row reader sorts the unit
 * rows by decision date, then row id, and the assembler keeps that order. The holdout size follows the locked-holdout
 * rule: at least one row for a positive fraction, never every row, none when there is at most one row.
 *
 * The carve is positional, so rows that share a decision date can straddle the boundary: the earlier row ids of that
 * date stay in development and the later ones are held out. The boundary is still deterministic (decision-date order,
 * row-id tiebreak), and no development row is decided after a holdout row.
 */
export class TrailingFractionCarver implements IHoldoutCarver {
  constructor(private readonly fraction: number) {}

  public AssignRoles(rows: readonly AssembledRow[]): ReadonlyMap<string, SnapshotRowRole> {
    const n = rows.length;
    const holdout = LockedHoldoutSplitter.HoldoutCount(n, this.fraction);
    return new Map(rows.map((r, i): [string, SnapshotRowRole] => [r.RowId, i >= n - holdout ? 'locked-holdout' : 'development']));
  }
}

/**
 * Holds out a forecast's rolling-origin test periods: the last `origins × horizonPeriods` distinct periods, the rows the
 * trainer scores its outer origins on (Core's `HoldoutCarve.RollingOriginCarve`, so the manifest's locked-holdout rows
 * are exactly the trainer's design). Each row's period comes from the unit row it was assembled from.
 */
export class RollingOriginCarver implements IHoldoutCarver {
  /**
   * @param holdout the protocol's rolling-origin holdout
   * @param periods each unit row's period, by row id (the unit's time column; null when the row has none)
   */
  constructor(private readonly holdout: Extract<HoldoutSplit, { readonly kind: 'rolling-origin' }>, private readonly periods: ReadonlyMap<string, Date | null>) {}

  /**
   * @throws TrainingRefusedError (`carve` stage) for a row without a period, or a series too short for the design
   */
  public AssignRoles(rows: readonly AssembledRow[]): ReadonlyMap<string, SnapshotRowRole> {
    const periodRows = rows.map((r) => {
      const period = this.periods.get(r.RowId);
      if (!period) throw new TrainingRefusedError({ stage: 'carve', reason: { kind: 'missing-carve-date', rowId: r.RowId, column: 'Period' } });
      return { RowId: r.RowId, Period: UtcDay.UtcDayIso(period) };
    });
    const carved = HoldoutCarve.RollingOriginCarve(periodRows, this.holdout);
    if (carved.Ok === false) throw new TrainingRefusedError({ stage: 'carve', reason: carved.Refusal });
    const held = new Set(carved.HoldoutRowIds);
    return new Map(rows.map((r): [string, SnapshotRowRole] => [r.RowId, held.has(r.RowId) ? 'locked-holdout' : 'development']));
  }
}
