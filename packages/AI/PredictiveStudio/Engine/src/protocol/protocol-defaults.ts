/**
 * @module protocol/protocol-defaults
 *
 * The one owner of a Prediction Unit's default locked holdout and the default protocol seed. The agent builder binds a
 * default protocol with it, and the truth-suite fixtures choose their year-cutoff holdout with it, so the two never
 * derive the default differently.
 */
import {
  DEFAULT_YEAR_CUTOFF_SHARE,
  HoldoutCarve,
  type HoldoutSplit,
  type PredictionUnitSpec,
} from '@memberjunction/predictive-studio-core';
import { PredictionUnitRowReader, type UnitReadDeps } from '../prediction-unit/unit-row-reader';

/** What reading the unit's rows needs when the default holdout is carved on their decision dates. */
export type ProtocolDefaultsReadDeps = Pick<UnitReadDeps, 'DataAccess' | 'Metadata' | 'Now'>;

/** A unit's default holdout and the defaults behind it (static members on one owner). */
export class ProtocolDefaults {
  /** Rolling origins of a forecast's default holdout: the fewest the protocol rules accept. */
  public static readonly ROLLING_ORIGINS = 5;
  /** Periods every rolling origin trains on at least (one year of monthly periods). */
  public static readonly MIN_TRAIN_PERIODS = 12;
  /** The share of rows a seeded row-hash holdout puts in the holdout. */
  public static readonly SEEDED_RANDOM_FRACTION = 0.25;
  /** The protocol seed a default protocol is created with (the truth-suite fixtures' measured runs use it too). */
  public static readonly DEFAULT_SEED = 0;

  /**
   * The default holdout of a unit that needs no row read: the last rolling origins for a forecast, a seeded row hash
   * when every row shares one fixed decision date; null when the holdout is carved on the rows' decision dates.
   */
  public static HoldoutWithoutRows(unit: PredictionUnitSpec): HoldoutSplit | null {
    if (unit.label.outcome.kind === 'forecast') {
      return {
        kind: 'rolling-origin', origins: ProtocolDefaults.ROLLING_ORIGINS, horizonPeriods: unit.temporal?.horizonPeriods || 1,
        gapPeriods: 0, minTrainPeriods: ProtocolDefaults.MIN_TRAIN_PERIODS, window: 'expanding',
      };
    }
    if (unit.rows.kind === 'grain' && unit.rows.decisionDate.kind === 'fixed') {
      return { kind: 'seeded-random', fraction: ProtocolDefaults.SEEDED_RANDOM_FRACTION };
    }
    return null;
  }

  /** The date-carved holdout on the decision date at the year cutoff over the given decision dates (`yyyy-mm-dd`). */
  public static DateCarvedHoldout(decisionDates: readonly string[]): HoldoutSplit {
    return {
      kind: 'date-carved', dateColumn: 'DecisionDate', cutoff: HoldoutCarve.YearCutoff(decisionDates, DEFAULT_YEAR_CUTOFF_SHARE),
      holdoutEnd: null, newEntityReport: null,
    };
  }

  /**
   * A unit's default holdout: {@link HoldoutWithoutRows} when it needs no rows, else the year cutoff over the unit's
   * resolved decision dates, read the way training reads them.
   *
   * @throws Error naming the refusal when the unit's rows cannot be read
   */
  public static async DefaultHoldoutFor(unit: PredictionUnitSpec, deps: ProtocolDefaultsReadDeps): Promise<HoldoutSplit> {
    const fixed = ProtocolDefaults.HoldoutWithoutRows(unit);
    if (fixed !== null) return fixed;
    const read = await new PredictionUnitRowReader().Read(unit, { ...deps, Read: { mode: 'complete' } });
    if (read.Status !== 'read') throw new Error(`Prediction Unit "${unit.name}" rows could not be read to choose the holdout cutoff: ${JSON.stringify(read.Refusal)}`);
    return ProtocolDefaults.DateCarvedHoldout(read.Rows.map((r) => r.DecisionDate.toISOString().slice(0, 10)));
  }
}
