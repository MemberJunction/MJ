/**
 * @module snapshot/holdout-carver
 *
 * Assigns each assembled row its manifest role before the snapshot is written; the roles are part of the manifest,
 * so they are part of the snapshot's fingerprint. The locked holdout is the one the bound Evaluation Protocol declares
 * ({@link HoldoutCarvers.CarverForProtocol}, the one place a holdout kind maps to a carver): a date carve on the
 * declared column, a seeded row-hash carve, or a forecast's rolling-origin test periods. Each carve returns the roles
 * and what it carved ({@link HoldoutCarveOutcome}); the run stores that summary with its results.
 */
import {
  HoldoutCarve,
  UtcDay,
  type CarveRow,
  type DecisionSpec,
  type EvaluationProtocolSpec,
  type HoldoutCarveSummary,
  type HoldoutSplit,
  type PredictionUnitSpec,
  type SnapshotRowRole,
} from '@memberjunction/predictive-studio-core';
import { OrdinalCompare } from '@memberjunction/global';
import type { AssembledRow } from '../feature-assembly/as-of/as-of-assembler';
import type { UnitRow } from '../prediction-unit/unit-row-reader';
import { TrainingRefusedError } from '../training/training-refusal';
import { SnapshotHash } from './snapshot-hash';

type DateCarved = Extract<HoldoutSplit, { readonly kind: 'date-carved' }>;
type RollingOrigin = Extract<HoldoutSplit, { readonly kind: 'rolling-origin' }>;

/** The date column a date carve reads from the unit row itself, rather than from the row's source fields. */
const DECISION_DATE_COLUMN = 'DecisionDate';

/** A carve: the roles of the rows kept in the snapshot, by row id, and the summary the run stores. */
export interface HoldoutCarveOutcome {
  /** A row absent from the map is left out of the snapshot (a date carve's rows on or after `holdoutEnd`); the summary counts it. */
  readonly Roles: ReadonlyMap<string, SnapshotRowRole>;
  readonly Summary: HoldoutCarveSummary;
}

/**
 * Assigns the assembled rows their manifest roles and records what it carved. The carve reads only the unit rows'
 * dates, keys and labels and the protocol, never the order the rows arrive in.
 */
export interface IHoldoutCarver {
  /**
   * The roles of the rows kept in the snapshot and the carve's summary.
   *
   * @param rows the assembled rows
   * @param unitRows the unit row behind each assembled row, by row id
   * @throws TrainingRefusedError (`carve` stage) when the holdout cannot be carved
   */
  AssignRoles(rows: readonly AssembledRow[], unitRows: ReadonlyMap<string, UnitRow>): HoldoutCarveOutcome;
}

/**
 * The date carve: rows whose carve date is on or after the cutoff (and before `holdoutEnd`, when set) are the locked
 * holdout, earlier rows are development, later rows are left out of the snapshot and counted. The carve date is the
 * unit row's decision date when the protocol's `dateColumn` is `DecisionDate`, else the row's own field of that name.
 * The carve groups rows by the unit row's group key, so a new-entity report holds out whole groups (the unit's group
 * key value, or the row's entity key when the unit declares none; a protocol whose report names another key is
 * refused before any row is read).
 */
export class DateCarvedCarver implements IHoldoutCarver {
  /**
   * @param holdout the protocol's date-carved holdout
   * @param period the unit's decision period, the slice each holdout period summarises
   */
  constructor(private readonly holdout: DateCarved, private readonly period: DecisionSpec['period']) {}

  /** @throws TrainingRefusedError (`carve` stage) for a row without a readable carve date, or a carve that leaves no development or no holdout row */
  public AssignRoles(rows: readonly AssembledRow[], unitRows: ReadonlyMap<string, UnitRow>): HoldoutCarveOutcome {
    const carve = HoldoutCarve.CarveLockedHoldout(rows.map((a) => this.carveRow(HoldoutCarvers.UnitRowOf(unitRows, a.RowId))), this.holdout);
    if (carve.Ok === false) throw new TrainingRefusedError({ stage: 'carve', reason: carve.Refusal });
    const d = carve.Deployment;
    const ne = carve.NewEntity;
    const summary: HoldoutCarveSummary = {
      kind: 'date-carved', cutoff: this.holdout.cutoff, holdoutEnd: this.holdout.holdoutEnd, developmentRowCount: d.DevelopmentRowCount,
      holdoutRowCount: d.HoldoutRowCount, excludedAfterHoldoutEnd: d.ExcludedAfterHoldoutEnd, holdoutClassCounts: d.HoldoutClassCounts,
      holdoutPeriods: HoldoutCarve.HoldoutPeriods(d.HoldoutCarveDates, this.period),
      newEntity: ne === null ? null : {
        holdoutEntityKeys: ne.HoldoutEntityKeys.length, trainingRowCount: ne.TrainingRowIds.length, holdoutRowCount: ne.HoldoutRowIds.length,
        excludedRowCount: ne.ExcludedRowCount, sharedEntityKeys: ne.SharedEntityKeys,
        heldGroupKeysSha256: DateCarvedCarver.GroupKeysSha256(ne.HoldoutEntityKeys),
        trainingGroupKeysSha256: DateCarvedCarver.GroupKeysSha256(ne.TrainingRowIds.map((id) => HoldoutCarvers.UnitRowOf(unitRows, id).GroupKey)),
      },
    };
    return { Roles: new Map(d.Rows.map((r): [string, SnapshotRowRole] => [r.RowId, r.Role])), Summary: summary };
  }

  /**
   * SHA-256 (lower-case hex) of a set of group keys as the new-entity summary stores it: the distinct keys (the unit row's
   * group key, as the carve groups rows), sorted with `OrdinalCompare`, joined with `\n`, UTF-8.
   */
  public static GroupKeysSha256(keys: readonly string[]): string {
    return SnapshotHash.Sha256Hex([...new Set(keys)].sort(OrdinalCompare).join('\n'));
  }

  /** The unit row as the date carve reads it; a row whose carve column is empty or names no day is refused. */
  private carveRow(u: UnitRow): CarveRow {
    const column = this.holdout.dateColumn;
    const day = column === DECISION_DATE_COLUMN ? u.DecisionDate : UtcDay.ToUtcDay(u.Source[column]);
    if (day === null) throw new TrainingRefusedError({ stage: 'carve', reason: { kind: 'missing-carve-date', rowId: u.RowId, column } });
    return { RowId: u.RowId, EntityKey: u.GroupKey, CarveDate: UtcDay.UtcDayIso(day), Label: typeof u.Label === 'string' ? u.Label : null };
  }
}

/**
 * The seeded row-hash carve for units whose rows share one fixed decision date (no date to carve on): a row is held
 * out when the protocol seed's hash of its row id falls below the fraction, whatever the order the rows were read in.
 * A carve that leaves either side empty is refused.
 */
export class SeededRandomCarver implements IHoldoutCarver {
  /**
   * @param fraction the protocol's holdout fraction, in (0, 1)
   * @param seed the protocol's seed
   */
  constructor(private readonly fraction: number, private readonly seed: number) {}

  /** @throws TrainingRefusedError (`carve` stage, `seeded-random-side-empty`) when the carve leaves no holdout or no development row */
  public AssignRoles(rows: readonly AssembledRow[], unitRows: ReadonlyMap<string, UnitRow>): HoldoutCarveOutcome {
    const carve = HoldoutCarve.SeededRandomCarve(rows.map((r) => r.RowId), this.fraction, this.seed);
    this.refuseEmptySide(carve.HoldoutRowIds.length, carve.DevelopmentRowIds.length);
    const summary: HoldoutCarveSummary = {
      kind: 'seeded-random', cutoff: null, holdoutEnd: null, developmentRowCount: carve.DevelopmentRowIds.length, holdoutRowCount: carve.HoldoutRowIds.length,
      excludedAfterHoldoutEnd: 0, holdoutClassCounts: SeededRandomCarver.classCounts(carve.HoldoutRowIds, unitRows), holdoutPeriods: [], newEntity: null,
    };
    const roles = new Map<string, SnapshotRowRole>([
      ...carve.DevelopmentRowIds.map((id): [string, SnapshotRowRole] => [id, 'development']),
      ...carve.HoldoutRowIds.map((id): [string, SnapshotRowRole] => [id, 'locked-holdout']),
    ]);
    return { Roles: roles, Summary: summary };
  }

  /** A carve with no holdout row has nothing to test on, and one with no development row nothing to train on. */
  private refuseEmptySide(holdoutRows: number, developmentRows: number): void {
    const rows = holdoutRows + developmentRows;
    if (holdoutRows === 0) throw new TrainingRefusedError({ stage: 'carve', reason: { kind: 'seeded-random-side-empty', side: 'locked-holdout', fraction: this.fraction, rows } });
    if (developmentRows === 0) throw new TrainingRefusedError({ stage: 'carve', reason: { kind: 'seeded-random-side-empty', side: 'development', fraction: this.fraction, rows } });
  }

  /** Holdout rows per class label; null when no holdout row has a text label (a numeric task). */
  private static classCounts(holdoutRowIds: readonly string[], unitRows: ReadonlyMap<string, UnitRow>): Readonly<Record<string, number>> | null {
    const counts: Record<string, number> = {};
    for (const id of holdoutRowIds) {
      const label = HoldoutCarvers.UnitRowOf(unitRows, id).Label;
      if (typeof label === 'string') counts[label] = (counts[label] || 0) + 1;
    }
    return Object.keys(counts).length > 0 ? counts : null;
  }
}

/**
 * Holds out a forecast's rolling-origin test periods: the last `origins × horizonPeriods` distinct periods, the rows the
 * trainer scores its outer origins on (Core's `HoldoutCarve.RollingOriginCarve`, so the manifest's locked-holdout rows
 * are exactly the trainer's design). Each row's period is its unit row's period.
 */
export class RollingOriginCarver implements IHoldoutCarver {
  /** @param holdout the protocol's rolling-origin holdout */
  constructor(private readonly holdout: RollingOrigin) {}

  /** @throws TrainingRefusedError (`carve` stage) for a row without a period, or a series too short for the design */
  public AssignRoles(rows: readonly AssembledRow[], unitRows: ReadonlyMap<string, UnitRow>): HoldoutCarveOutcome {
    const periodRows = rows.map((r) => {
      const period = HoldoutCarvers.UnitRowOf(unitRows, r.RowId).Period;
      if (period === null) throw new TrainingRefusedError({ stage: 'carve', reason: { kind: 'missing-carve-date', rowId: r.RowId, column: 'Period' } });
      return { RowId: r.RowId, Period: UtcDay.UtcDayIso(period) };
    });
    const carved = HoldoutCarve.RollingOriginCarve(periodRows, this.holdout);
    if (carved.Ok === false) throw new TrainingRefusedError({ stage: 'carve', reason: carved.Refusal });
    const held = new Set(carved.HoldoutRowIds);
    const summary: HoldoutCarveSummary = {
      // The first test period is where the holdout starts; a rolling-origin holdout has no end and keeps every row.
      kind: 'rolling-origin', cutoff: carved.HoldoutPeriods[0] || null, holdoutEnd: null, developmentRowCount: rows.length - held.size,
      holdoutRowCount: held.size, excludedAfterHoldoutEnd: 0, holdoutClassCounts: null, holdoutPeriods: carved.HoldoutPeriods, newEntity: null,
    };
    return { Roles: new Map(rows.map((r): [string, SnapshotRowRole] => [r.RowId, held.has(r.RowId) ? 'locked-holdout' : 'development'])), Summary: summary };
  }
}

/** The carver a protocol declares, and the unit-row lookup the carvers share (static members on one owner). */
export class HoldoutCarvers {
  /** The carver for the protocol's holdout kind: the only place a holdout kind maps to a carver. */
  public static CarverForProtocol(protocol: Pick<EvaluationProtocolSpec, 'holdout' | 'seed'>, unit: Pick<PredictionUnitSpec, 'decision'>): IHoldoutCarver {
    const holdout = protocol.holdout;
    switch (holdout.kind) {
      case 'date-carved': return new DateCarvedCarver(holdout, unit.decision.period);
      case 'seeded-random': return new SeededRandomCarver(holdout.fraction, protocol.seed);
      case 'rolling-origin': return new RollingOriginCarver(holdout);
      default: {
        const unknown: never = holdout;
        throw new Error(`Holdout carve: unknown holdout kind ${JSON.stringify(unknown)}`);
      }
    }
  }

  /** The unit row behind an assembled row; an assembled row without one is a caller error (the rows came from elsewhere). */
  public static UnitRowOf(unitRows: ReadonlyMap<string, UnitRow>, rowId: string): UnitRow {
    const u = unitRows.get(rowId);
    if (!u) throw new Error(`Holdout carve: assembled row ${rowId} is not a unit row`);
    return u;
  }
}
