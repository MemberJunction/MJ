/**
 * @module snapshot/holdout-carver
 *
 * Assigns each assembled row its manifest role before the snapshot is written; the roles are part of the manifest,
 * so they are part of the snapshot's fingerprint.
 */
import type { SnapshotRowRole } from '@memberjunction/predictive-studio-core';
import type { AssembledRow } from '../feature-assembly/as-of/as-of-assembler';
import { LockedHoldoutSplitter } from '../training/locked-holdout';

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
