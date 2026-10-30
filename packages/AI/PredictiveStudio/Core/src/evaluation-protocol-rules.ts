/**
 * @module evaluation-protocol-rules
 *
 * Save-time and bind-time rules for Evaluation Protocols, the guard-field author rule and the default protocol a
 * pipeline gets when nobody declared one.
 *
 * Guard-field author rule: under the default `non-agent` setting every author except an agent tool call (a user, a
 * non-agent API caller, a scheduled job, the system) may change the holdout, promotion, leakage audit, exclusions,
 * budgets and the setting itself, and every version passes the same validation; a lineage set to `human-only` accepts
 * those changes only in a user-authored version.
 *
 * Pure and browser-safe: the protocol server entity, the pipeline server entity, the training engine, the agent's
 * builder and the Explorer editor call the same functions, so they compute the same refusals.
 */
import { Canonicalize } from '@memberjunction/global';
import {
  ALLOWED_OUTCOMES, EvaluationProtocol,
  type BaselineSpec, type CalibrationMethod, type EvaluationProtocolColumns, type EvaluationProtocolSpec, type GuardFieldsEditableBy,
  type HoldoutSplit, type InnerValidation, type IntervalSpec, type PredictionIntervalSpec, type ProperScore, type SecondaryMetric,
} from './evaluation-protocol';
import type { Actor, PredictionUnitSpec } from './prediction-unit';
import type { TaskKind, TaskType } from './task-type';

/** The protocol fields `GuardFieldsEditableBy` governs between versions. */
export type GuardField = 'holdout' | 'promotion' | 'leakageAudit' | 'exclusions' | 'budgets' | 'guardFieldsEditableBy';
export const GUARD_FIELDS: readonly GuardField[] = ['holdout', 'promotion', 'leakageAudit', 'exclusions', 'budgets', 'guardFieldsEditableBy'];

/** One reason a protocol version may not be saved, or may not be used with a Prediction Unit version. */
export type ProtocolRefusal =
  | { readonly Kind: 'lag-inside-horizon'; readonly Lag: number; readonly HorizonPeriods: number }
  | { readonly Kind: 'rolling-window-inside-horizon'; readonly EndLag: number; readonly HorizonPeriods: number }
  | { readonly Kind: 'horizon-mismatch'; readonly ProtocolHorizonPeriods: number; readonly UnitHorizonPeriods: number }
  | { readonly Kind: 'inner-gap-below-horizon'; readonly GapPeriods: number; readonly HorizonPeriods: number }
  | { readonly Kind: 'group-key-mismatch'; readonly ProtocolGroupKey: string; readonly UnitGroupKey: string | null }
  | { readonly Kind: 'primary-score-family-mismatch'; readonly Declared: ProperScore['family']; readonly UnitTask: TaskKind }
  | { readonly Kind: 'holdout-kind-mismatch'; readonly Holdout: HoldoutSplit['kind']; readonly UnitTask: TaskKind }
  | { readonly Kind: 'forecast-prediction-intervals'; readonly Method: PredictionIntervalSpec['method'] }
  | { readonly Kind: 'forecast-slices'; readonly OutOfTime: boolean; readonly Subgroups: readonly string[] }
  | { readonly Kind: 'forecast-interval-method'; readonly Method: IntervalSpec['method'] }
  | { readonly Kind: 'forecast-multiple-series'; readonly GrainEntity: string }
  | { readonly Kind: 'no-dummy-baseline' }
  | { readonly Kind: 'guard-field-edited-by-disallowed-author'; readonly Fields: readonly GuardField[]; readonly Author: Actor['kind']; readonly Setting: GuardFieldsEditableBy };

export interface ProtocolValidationInput {
  /** The parsed protocol version being saved. */
  readonly Protocol: EvaluationProtocolSpec;
  /** The previous version in the same lineage; null for version 1. */
  readonly Previous: EvaluationProtocolSpec | null;
  /** Who is saving this version (the row's `AuthoredBy`). */
  readonly AuthoredBy: Actor;
}

/** A protocol before it has a row: everything except the row identity and the author. */
export type EvaluationProtocolDraft = Omit<EvaluationProtocolSpec, 'id' | 'lineageRootId' | 'version' | 'authoredBy'>;

export interface DefaultProtocolArgs {
  readonly Unit: PredictionUnitSpec;
  /** Date-carved (dated tabular units, panels), seeded-random (units with one fixed decision date) or rolling-origin (forecasts). */
  readonly Holdout: HoldoutSplit;
  /** Number of candidates the search will train; sets the random-search size and `maxCandidates`. */
  readonly Candidates: number;
  readonly Seed: number;
  readonly Name: string;
}

/** Row identity of a protocol version being written. */
export interface ProtocolRowMeta {
  readonly ID: string;
  readonly LineageRootID: string;
  readonly Version: number;
  readonly AuthoredBy: Actor;
}

/**
 * The `MJ: Evaluation Protocols` columns a draft determines (every column except the row identity and the author),
 * with the two fixed-value columns as narrow as the entity declares them.
 */
export type EvaluationProtocolDraftColumns = Omit<EvaluationProtocolColumns, 'ID' | 'LineageRootID' | 'Version' | 'AuthoredBy' | 'HoldoutAccessBudget' | 'GuardFieldsEditableBy'> & {
  readonly HoldoutAccessBudget: 1;
  readonly GuardFieldsEditableBy: GuardFieldsEditableBy;
};

/** Save-time and bind-time protocol rules and the default protocol (static members on one owner). */
export class EvaluationProtocolRules {
  /** Whether an author may change guard fields under a setting: never an agent tool call; under `human-only`, only a user. */
  public static MayEditGuardFields(author: Actor, setting: GuardFieldsEditableBy): boolean {
    return setting === 'non-agent' ? author.kind !== 'agent' : author.kind === 'human';
  }

  /**
   * Unit-independent refusals of one protocol version; an empty list means the version may be saved. The minimum
   * number of rolling origins is not checked here: the shape check and the parser refuse a row below it before a spec
   * exists.
   */
  public static ValidateEvaluationProtocol(input: ProtocolValidationInput): readonly ProtocolRefusal[] {
    const p = input.Protocol;
    const out: ProtocolRefusal[] = [];
    if (!p.baselines.some((b) => b.kind === 'dummy')) out.push({ Kind: 'no-dummy-baseline' });
    // The setting in force for a new version is the previous version's: a version cannot lift its own
    // restriction, and the setting is itself a guard field.
    if (input.Previous !== null) {
      const setting = input.Previous.guardFieldsEditableBy;
      const changed = EvaluationProtocolRules.ChangedGuardFields(input.Previous, p);
      if (changed.length > 0 && !EvaluationProtocolRules.MayEditGuardFields(input.AuthoredBy, setting)) {
        out.push({ Kind: 'guard-field-edited-by-disallowed-author', Fields: changed, Author: input.AuthoredBy.kind, Setting: setting });
      }
    }
    return out;
  }

  /** Refusals of a protocol used with one Prediction Unit version (pipeline binding and run start). */
  public static ValidateProtocolForUnit(p: EvaluationProtocolSpec, unit: PredictionUnitSpec): readonly ProtocolRefusal[] {
    return [
      ...EvaluationProtocolRules.checkHoldout(p.holdout, unit),
      ...EvaluationProtocolRules.checkInnerGap(p.innerValidation, p.holdout, unit),
      ...EvaluationProtocolRules.checkGroupKey(p.innerValidation, unit),
      ...EvaluationProtocolRules.checkFamily(p.primaryScore, unit.label.outcome),
      ...EvaluationProtocolRules.checkForecast(p, unit),
    ];
  }

  /** The guard fields whose canonical JSON differs between two versions (key order never reads as a change). */
  public static ChangedGuardFields(prev: EvaluationProtocolSpec, next: EvaluationProtocolSpec): readonly GuardField[] {
    return GUARD_FIELDS.filter((field) => Canonicalize(prev[field]) !== Canonicalize(next[field]));
  }

  /** One plain sentence per refusal, used as the validation message, the run refusal and in the editor. */
  public static DescribeProtocolRefusal(r: ProtocolRefusal): string {
    switch (r.Kind) {
      case 'lag-inside-horizon':
        return `Lag ${r.Lag} reads a period inside the ${r.HorizonPeriods}-period forecast horizon; every lag must be at least the horizon.`;
      case 'rolling-window-inside-horizon':
        return `A rolling window ending ${r.EndLag} periods back reads inside the ${r.HorizonPeriods}-period horizon; its end lag must be at least the horizon.`;
      case 'horizon-mismatch':
        return `The rolling-origin backtest scores a ${r.ProtocolHorizonPeriods}-period horizon but the Prediction Unit forecasts ${r.UnitHorizonPeriods} period${r.UnitHorizonPeriods === 1 ? '' : 's'} ahead; the two horizons must be equal.`;
      case 'inner-gap-below-horizon':
        return `Blocked-time inner folds need a gap of at least the horizon (${r.HorizonPeriods} periods); this protocol declares ${r.GapPeriods}.`;
      case 'group-key-mismatch':
        return `The protocol groups its inner validation by "${r.ProtocolGroupKey}", but the Prediction Unit ${r.UnitGroupKey === null ? 'has no group key (its rows are grouped by their entity key)' : `groups its rows by "${r.UnitGroupKey}"`}; the folds would not be grouped the way the protocol says.`;
      case 'primary-score-family-mismatch':
        return `The primary score is a ${r.Declared} score but the Prediction Unit's task is ${r.UnitTask}; candidates may only be ranked by a ${r.UnitTask} score.`;
      case 'holdout-kind-mismatch':
        return `A ${r.UnitTask} unit cannot use a ${r.Holdout} holdout: forecasts use rolling-origin, units with one fixed decision date use seeded-random, every other unit a date-carved holdout.`;
      case 'forecast-prediction-intervals':
        return `Forecast prediction-interval coverage is not available; this protocol declares ${r.Method} prediction intervals.`;
      case 'forecast-slices':
        return `Forecast slices are not available; this protocol declares ${EvaluationProtocolRules.declaredSlices(r.OutOfTime, r.Subgroups)}.`;
      case 'forecast-interval-method':
        return `A forecast's intervals resample whole rolling origins (block-bootstrap); this protocol declares ${r.Method}.`;
      case 'forecast-multiple-series':
        return `A forecast trains one series per snapshot; this Prediction Unit has a row per ${r.GrainEntity} record per period, one series per ${r.GrainEntity} record (panel forecasts are not available).`;
      case 'no-dummy-baseline':
        return 'A dummy baseline (base rate or mean) is required: it is the "no signal" yardstick of the gate.';
      case 'guard-field-edited-by-disallowed-author':
        return r.Setting === 'non-agent'
          ? `An agent tool call cannot change the guard fields ${r.Fields.join(', ')}; they are set in protocol configuration (UI, a non-agent API caller, a scheduled job or shipped metadata).`
          : `This protocol is set to human-only guard fields: only a version authored by a user may change ${r.Fields.join(', ')}; this version was authored by: ${r.Author}.`;
    }
  }

  /** The proper score a task family ranks by when nobody declared one. */
  public static DefaultPrimaryScore(task: TaskType): ProperScore {
    switch (task.kind) {
      case 'binary': return { family: 'binary', metric: 'log-loss' };
      case 'multiclass': return { family: 'multiclass', metric: 'multiclass-log-loss' };
      case 'continuous': return { family: 'continuous', metric: 'rmse' };
      case 'count': return { family: 'count', metric: 'poisson-deviance' };
      case 'non-negative': return { family: 'non-negative', metric: 'tweedie-deviance' };
      case 'forecast': return { family: 'forecast', metric: 'mase' };
    }
  }

  /**
   * The protocol a pipeline gets when nobody declared one (agent builder, legacy migration, fixtures, Explorer "new
   * protocol"). It passes {@link ValidateEvaluationProtocol}, and {@link ValidateProtocolForUnit} for the unit it was
   * made for when `Holdout` is the kind that unit takes. A forecast gets block-bootstrap intervals, no prediction
   * intervals and no slices (the rolling-origin backtest supports none), and a seasonal-naive baseline whose season is
   * the unit's seasonality, or 1 when the unit declares none (a season of 1 makes it the naive forecast).
   */
  public static DefaultEvaluationProtocolDraft(args: DefaultProtocolArgs): EvaluationProtocolDraft {
    const task = args.Unit.label.outcome;
    const baselines = EvaluationProtocolRules.defaultBaselines(args.Unit);
    const candidates = Math.max(args.Candidates, 1);
    return {
      name: args.Name,
      holdout: args.Holdout,
      innerValidation: EvaluationProtocolRules.defaultInnerValidation(args.Unit, args.Holdout),
      seed: args.Seed,
      holdoutAccessBudget: 1,
      primaryScore: EvaluationProtocolRules.DefaultPrimaryScore(task),
      secondaryMetrics: EvaluationProtocolRules.defaultSecondaryMetrics(task),
      baselines,
      calibration: EvaluationProtocolRules.defaultCalibration(task),
      resampling: { kind: 'none' },
      intervals: EvaluationProtocolRules.defaultIntervals(args.Unit),
      promotion: { comparators: baselines, incumbent: 'current-published', margin: EvaluationProtocol.ToNonNegative(0), lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' },
      allowedOutcomes: ALLOWED_OUTCOMES,
      leakageAudit: { singleFeatureHeldOutAucMax: 0.95, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true },
      exclusions: { denyFields: [], denySources: [] },
      slices: { outOfTime: args.Holdout.kind === 'date-carved' && task.kind !== 'forecast', subgroups: [] },
      predictionIntervals: task.kind === 'continuous' || task.kind === 'count' || task.kind === 'non-negative'
        ? { method: 'split-conformal', nominalCoverage: [0.8, 0.9] }
        : null,
      residualDiagnostics: task.kind === 'forecast' ? { acfLags: 12, ljungBoxAlpha: 0.05 } : null,
      retrainTriggers: [],
      search: { kind: 'random', candidates },
      budgets: { maxComputeSeconds: 3600, maxTokens: 0, maxCandidates: candidates, hardStop: true },
      minMinorityClassRows: 20,
      guardFieldsEditableBy: 'non-agent',
    };
  }

  /** A saved version back to a draft (the next version starts from it). */
  public static DraftFromProtocolSpec(spec: EvaluationProtocolSpec): EvaluationProtocolDraft {
    const { id: _id, lineageRootId: _root, version: _version, authoredBy: _author, ...draft } = spec;
    return draft;
  }

  /** The columns a draft determines: every `MJ: Evaluation Protocols` column but the row identity and the author. */
  public static EvaluationProtocolDraftColumns(d: EvaluationProtocolDraft): EvaluationProtocolDraftColumns {
    return {
      Name: d.name,
      Holdout: JSON.stringify(d.holdout), InnerValidation: JSON.stringify(d.innerValidation), Seed: d.seed,
      HoldoutAccessBudget: d.holdoutAccessBudget, PrimaryScore: JSON.stringify(d.primaryScore),
      SecondaryMetrics: JSON.stringify(d.secondaryMetrics), Baselines: JSON.stringify(d.baselines),
      Calibration: JSON.stringify(d.calibration), Resampling: JSON.stringify(d.resampling), Intervals: JSON.stringify(d.intervals),
      Promotion: JSON.stringify(d.promotion), AllowedOutcomes: JSON.stringify(d.allowedOutcomes),
      LeakageAudit: JSON.stringify(d.leakageAudit), Exclusions: JSON.stringify(d.exclusions), Slices: JSON.stringify(d.slices),
      PredictionIntervals: d.predictionIntervals === null ? null : JSON.stringify(d.predictionIntervals),
      ResidualDiagnostics: d.residualDiagnostics === null ? null : JSON.stringify(d.residualDiagnostics),
      RetrainTriggers: JSON.stringify(d.retrainTriggers), SearchStrategy: JSON.stringify(d.search), Budgets: JSON.stringify(d.budgets),
      MinMinorityClassRows: d.minMinorityClassRows, GuardFieldsEditableBy: d.guardFieldsEditableBy,
    };
  }

  /** The `MJ: Evaluation Protocols` columns of a draft (the inverse of `ParseEvaluationProtocolRow`). */
  public static EvaluationProtocolColumnsFromDraft(d: EvaluationProtocolDraft, meta: ProtocolRowMeta): EvaluationProtocolColumns {
    return {
      ID: meta.ID, LineageRootID: meta.LineageRootID, Version: meta.Version, AuthoredBy: JSON.stringify(meta.AuthoredBy),
      ...EvaluationProtocolRules.EvaluationProtocolDraftColumns(d),
    };
  }

  /** True when every row of the unit shares one fixed decision date (cross-sectional data, no date to carve on). */
  private static hasFixedDecisionDate(unit: PredictionUnitSpec): boolean {
    return unit.rows.kind === 'grain' && unit.rows.decisionDate.kind === 'fixed';
  }

  /** The holdout kind a unit takes: rolling-origin for forecasts, seeded-random without dated rows, else date-carved. */
  private static expectedHoldoutKind(unit: PredictionUnitSpec): HoldoutSplit['kind'] {
    if (unit.label.outcome.kind === 'forecast') return 'rolling-origin';
    return EvaluationProtocolRules.hasFixedDecisionDate(unit) ? 'seeded-random' : 'date-carved';
  }

  private static checkHoldout(holdout: HoldoutSplit, unit: PredictionUnitSpec): ProtocolRefusal[] {
    if (holdout.kind !== EvaluationProtocolRules.expectedHoldoutKind(unit)) {
      return [{ Kind: 'holdout-kind-mismatch', Holdout: holdout.kind, UnitTask: unit.label.outcome.kind }];
    }
    if (holdout.kind !== 'rolling-origin') return [];
    const out: ProtocolRefusal[] = [];
    const h = holdout.horizonPeriods;
    if (unit.temporal !== null && unit.temporal.horizonPeriods !== h) {
      out.push({ Kind: 'horizon-mismatch', ProtocolHorizonPeriods: h, UnitHorizonPeriods: unit.temporal.horizonPeriods });
    }
    for (const lag of unit.temporal?.lags || []) if (lag < h) out.push({ Kind: 'lag-inside-horizon', Lag: lag, HorizonPeriods: h });
    for (const w of unit.temporal?.rollingWindows || []) if (w.endLag < h) out.push({ Kind: 'rolling-window-inside-horizon', EndLag: w.endLag, HorizonPeriods: h });
    return out;
  }

  private static checkInnerGap(inner: InnerValidation, holdout: HoldoutSplit, unit: PredictionUnitSpec): ProtocolRefusal[] {
    if (inner.kind !== 'blocked-time') return [];
    const horizon = holdout.kind === 'rolling-origin' ? holdout.horizonPeriods : unit.temporal?.horizonPeriods ?? null;
    if (horizon === null || inner.gapPeriods >= horizon) return [];
    return [{ Kind: 'inner-gap-below-horizon', GapPeriods: inner.gapPeriods, HorizonPeriods: horizon }];
  }

  /**
   * The manifest's group of each row is the unit's group key, so inner folds grouped by any other key would not be
   * grouped the way the protocol says. Field names compare without case, as the database resolves them.
   */
  private static checkGroupKey(inner: InnerValidation, unit: PredictionUnitSpec): ProtocolRefusal[] {
    const protocolKey = inner.kind === 'repeated-stratified-kfold' ? null : inner.groupKey;
    if (protocolKey === null) return [];
    if (unit.groupKey !== null && unit.groupKey.trim().toLowerCase() === protocolKey.trim().toLowerCase()) return [];
    return [{ Kind: 'group-key-mismatch', ProtocolGroupKey: protocolKey, UnitGroupKey: unit.groupKey }];
  }

  private static checkFamily(primary: ProperScore, task: TaskType): ProtocolRefusal[] {
    return primary.family === task.kind ? [] : [{ Kind: 'primary-score-family-mismatch', Declared: primary.family, UnitTask: task.kind }];
  }

  /**
   * What the rolling-origin backtest cannot honour, refused when the protocol is bound rather than when a run fails:
   * prediction intervals, slices, intervals that do not resample whole origins, and more than one series (a unit with a
   * row per grain record per period holds one series per grain record).
   */
  private static checkForecast(p: EvaluationProtocolSpec, unit: PredictionUnitSpec): ProtocolRefusal[] {
    if (unit.label.outcome.kind !== 'forecast') return [];
    const out: ProtocolRefusal[] = [];
    if (p.predictionIntervals !== null) out.push({ Kind: 'forecast-prediction-intervals', Method: p.predictionIntervals.method });
    if (p.slices.outOfTime || p.slices.subgroups.length > 0) out.push({ Kind: 'forecast-slices', OutOfTime: p.slices.outOfTime, Subgroups: p.slices.subgroups });
    if (p.intervals.method !== 'block-bootstrap') out.push({ Kind: 'forecast-interval-method', Method: p.intervals.method });
    if (unit.rows.kind === 'grain-x-periods') out.push({ Kind: 'forecast-multiple-series', GrainEntity: unit.rows.grainEntity });
    return out;
  }

  /** The declared slices in words: "out-of-time", "subgroups A, B" or both joined by "and". */
  private static declaredSlices(outOfTime: boolean, subgroups: readonly string[]): string {
    const parts = [...(outOfTime ? ['out-of-time'] : []), ...(subgroups.length > 0 ? [`subgroups ${subgroups.join(', ')}`] : [])];
    return parts.join(' and ');
  }

  private static defaultBaselines(unit: PredictionUnitSpec): readonly BaselineSpec[] {
    const task = unit.label.outcome;
    const heuristic: BaselineSpec[] = unit.incumbent.kind === 'rule' ? [{ kind: 'incumbent-heuristic', name: unit.incumbent.name }] : [];
    if (task.kind === 'forecast') {
      // `||`: a null or 0 seasonality falls back to a season of 1.
      return [{ kind: 'dummy', name: 'training-window-mean' }, { kind: 'naive' }, { kind: 'seasonal-naive', season: unit.temporal?.seasonality || 1 }, ...heuristic];
    }
    const classification = task.kind === 'binary' || task.kind === 'multiclass';
    return [
      { kind: 'dummy', name: classification ? 'base-rate' : 'mean' },
      { kind: 'one-feature', selection: 'best-single-feature-inner-cv' },
      { kind: 'glm', family: EvaluationProtocolRules.glmFamily(task), penalty: 'l2' },
      ...heuristic,
    ];
  }

  private static glmFamily(task: Exclude<TaskType, { readonly kind: 'forecast' }>): Extract<BaselineSpec, { readonly kind: 'glm' }>['family'] {
    switch (task.kind) {
      case 'binary': return 'logistic';
      case 'multiclass': return 'multinomial';
      case 'continuous': return 'gaussian';
      case 'count': return 'poisson';
      case 'non-negative': return 'tweedie';
    }
  }

  private static defaultInnerValidation(unit: PredictionUnitSpec, holdout: HoldoutSplit): InnerValidation {
    if (unit.label.outcome.kind === 'forecast') {
      const gap = holdout.kind === 'rolling-origin' ? holdout.horizonPeriods : unit.temporal?.horizonPeriods || 1;
      return { kind: 'blocked-time', folds: 5, gapPeriods: gap, groupKey: unit.groupKey };
    }
    if (unit.groupKey !== null) return { kind: 'grouped-kfold', folds: 5, repeats: 3, groupKey: unit.groupKey };
    return { kind: 'repeated-stratified-kfold', folds: 5, repeats: 3 };
  }

  private static defaultSecondaryMetrics(task: TaskType): readonly SecondaryMetric[] {
    switch (task.kind) {
      case 'binary': return ['auc', 'accuracy', 'f1', 'precision', 'recall', 'calibration-slope'];
      case 'multiclass': return ['accuracy', 'f1'];
      case 'continuous':
      case 'count':
      case 'non-negative': return ['r2'];
      case 'forecast': return [];
    }
  }

  private static defaultCalibration(task: TaskType): CalibrationMethod {
    return task.kind === 'binary' || task.kind === 'multiclass'
      ? { kind: 'auto', thresholdRows: 2000, fitOn: 'disjoint-calibration-fold' }
      : { kind: 'not-applicable', reason: 'regression-task' };
  }

  private static defaultIntervals(unit: PredictionUnitSpec): IntervalSpec {
    const method: IntervalSpec['method'] = unit.label.outcome.kind === 'forecast' ? 'block-bootstrap' : unit.groupKey !== null ? 'cluster-bootstrap' : 'bootstrap';
    return { level: 0.95, method, resamples: 2000, pairedTest: 'paired-bootstrap' };
  }
}
