/**
 * @module evaluation-protocol
 *
 * The Evaluation Protocol column shapes and their shape checks, the typed protocol (`EvaluationProtocolSpec`,
 * `ParseEvaluationProtocolRow`); the protocol's behaviour rules are in `evaluation-protocol-rules.ts`, the gate in `gate.ts`.
 */
import { UUIDsEqual } from '@memberjunction/global';
import { JsonParse, type JsonObject, type JsonValue, type ParseResult } from './json-value';
import { PredictionUnit, type Actor } from './prediction-unit';

declare const nonNegativeBrand: unique symbol;
/** A number >= 0, produced only by {@link EvaluationProtocol.ToNonNegative}. */
export type NonNegative = number & { readonly [nonNegativeBrand]: 'NonNegative' };

export interface Interval { readonly level: number; readonly lower: number; readonly upper: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export interface MetricWithInterval { readonly metric: MetricKey; readonly value: number; readonly interval: Interval; readonly n: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name

export type ProperScore =
  | { readonly family: 'binary'; readonly metric: 'log-loss' | 'brier' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly family: 'multiclass'; readonly metric: 'multiclass-log-loss' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly family: 'continuous'; readonly metric: 'rmse' | 'mae' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly family: 'count'; readonly metric: 'poisson-deviance' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly family: 'non-negative'; readonly metric: 'tweedie-deviance' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly family: 'forecast'; readonly metric: 'mase' | 'rmse' };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export type SecondaryMetric = 'auc' | 'accuracy' | 'f1' | 'precision' | 'recall' | 'r2' | 'calibration-slope';
export type MetricKey = ProperScore['metric'] | SecondaryMetric;
export type MetricDirection = 'lower-is-better' | 'higher-is-better' | 'closer-to-one';
export const METRIC_DIRECTION: { readonly [K in MetricKey]: MetricDirection } = {
  'log-loss': 'lower-is-better', brier: 'lower-is-better', 'multiclass-log-loss': 'lower-is-better', rmse: 'lower-is-better',  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  mae: 'lower-is-better', 'poisson-deviance': 'lower-is-better', 'tweedie-deviance': 'lower-is-better', mase: 'lower-is-better',  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  auc: 'higher-is-better', accuracy: 'higher-is-better', f1: 'higher-is-better', precision: 'higher-is-better',  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  recall: 'higher-is-better', r2: 'higher-is-better', 'calibration-slope': 'closer-to-one',  // case-violation-ok-legacy-back-compat: contracts.ts wire name
};
/** The proper scores allowed per family (one source for the shape check and the protocol rules). */
export const PROPER_SCORES_BY_FAMILY: { readonly [F in ProperScore['family']]: readonly Extract<ProperScore, { family: F }>['metric'][] } = {
  binary: ['log-loss', 'brier'], multiclass: ['multiclass-log-loss'], continuous: ['rmse', 'mae'],
  count: ['poisson-deviance'], 'non-negative': ['tweedie-deviance'], forecast: ['mase', 'rmse'],
};

export type BaselineSpec =
  | { readonly kind: 'dummy'; readonly name: 'base-rate' | 'mean' | 'training-window-mean' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'one-feature'; readonly selection: 'best-single-feature-inner-cv' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'glm'; readonly family: 'logistic' | 'multinomial' | 'gaussian' | 'poisson' | 'tweedie'; readonly penalty: 'l2' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'naive' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'seasonal-naive'; readonly season: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'incumbent-heuristic'; readonly name: string };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export type BaselineRole = 'dummy' | 'simple';
export type HoldoutSplit =
  | {
      readonly kind: 'date-carved'; readonly dateColumn: string; readonly cutoff: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      /** Optional end (exclusive) of the holdout window; rows on or after it are in neither role (it reproduces the reference pipeline's holdout keys). */
      readonly holdoutEnd: string | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
      readonly newEntityReport: { readonly groupKey: string; readonly holdoutFraction: number } | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
    }
  | { readonly kind: 'rolling-origin'; readonly origins: number; readonly horizonPeriods: number; readonly gapPeriods: number; readonly minTrainPeriods: number; readonly window: 'expanding' | 'sliding' };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export type InnerValidation =
  | { readonly kind: 'repeated-stratified-kfold'; readonly folds: number; readonly repeats: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'grouped-kfold'; readonly folds: number; readonly repeats: number; readonly groupKey: string }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'blocked-time'; readonly folds: number; readonly gapPeriods: number; readonly groupKey: string | null };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export type CalibrationMethod =
  | { readonly kind: 'platt'; readonly fitOn: 'disjoint-calibration-fold' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'isotonic'; readonly fitOn: 'disjoint-calibration-fold' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'auto'; readonly thresholdRows: number; readonly fitOn: 'disjoint-calibration-fold' }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'not-applicable'; readonly reason: 'regression-task' };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export type ResamplingSpec = { readonly kind: 'none' } | { readonly kind: 'in-fold'; readonly method: 'class-weight' | 'undersample' | 'oversample' };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export interface IntervalSpec {
  readonly level: 0.95;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly method: 'bootstrap' | 'cluster-bootstrap' | 'block-bootstrap' | 'delong';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly resamples: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly pairedTest: 'paired-bootstrap' | 'delong' | 'corrected-resampled-t' | 'diebold-mariano';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}
export interface LeakageAuditSpec {
  readonly singleFeatureHeldOutAucMax: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly timeShiftedLabelTest: true;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly dropColumnTest: true;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly importanceAggregation: 'per-source-column';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly highCardinalityIdCheck: true;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}
export type SearchStrategy =
  | { readonly kind: 'random'; readonly candidates: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'guided'; readonly method: 'bayesian' | 'successive-halving'; readonly equalCostComparisonId: string };  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export interface Budgets { readonly maxComputeSeconds: number; readonly maxTokens: number; readonly maxCandidates: number; readonly hardStop: true }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export interface PromotionRule {
  readonly comparators: readonly BaselineSpec[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly incumbent: 'current-published' | 'none';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly margin: NonNegative;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly lowerBoundLevel: 0.95;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly pairedOn: 'same-holdout-rows';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly decisionTable: 'Q13+Q14+Q15';  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}
export type GateOutcome = 'model' | 'keep-simple-baseline' | 'no-signal';
export const ALLOWED_OUTCOMES: readonly ['model', 'keep-simple-baseline', 'no-signal'] = ['model', 'keep-simple-baseline', 'no-signal'];
/**
 * Who may change the guard fields (holdout, promotion, leakage audit, exclusions, budgets) in the next version of a
 * protocol. `non-agent` (default): every author except an agent tool call (an agent may not relax its own
 * guardrails); `human-only` (optional): only a version authored by a user. Either way every version passes the
 * same guard-field validation.
 */
export type GuardFieldsEditableBy = 'non-agent' | 'human-only';
export const GUARD_FIELDS_EDITABLE_BY: readonly GuardFieldsEditableBy[] = ['non-agent', 'human-only'];
export interface ProtocolExclusions { readonly denyFields: readonly string[]; readonly denySources: readonly string[] }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export interface SliceSpec { readonly outOfTime: boolean; readonly subgroups: readonly string[] }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export interface PredictionIntervalSpec { readonly method: 'split-conformal' | 'quantile'; readonly nominalCoverage: readonly number[] }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export interface ResidualDiagnosticsSpec { readonly acfLags: number; readonly ljungBoxAlpha: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
export type RetrainTrigger =
  | { readonly kind: 'outcome-degradation'; readonly margin: NonNegative; readonly consecutivePeriods: number }  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  | { readonly kind: 'calibration-drift'; readonly slopeOutside: readonly [number, number]; readonly consecutivePeriods: number };  // case-violation-ok-legacy-back-compat: contracts.ts wire name

/** The typed Evaluation Protocol version a run is graded under (no pipeline or unit reference: the pipeline binds both). */
export interface EvaluationProtocolSpec {
  readonly id: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly lineageRootId: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly version: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly name: string;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly holdout: HoldoutSplit;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly innerValidation: InnerValidation;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly seed: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly holdoutAccessBudget: 1;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly primaryScore: ProperScore;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly secondaryMetrics: readonly SecondaryMetric[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly baselines: readonly BaselineSpec[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly calibration: CalibrationMethod;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly resampling: ResamplingSpec;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly intervals: IntervalSpec;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly promotion: PromotionRule;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly allowedOutcomes: typeof ALLOWED_OUTCOMES;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly leakageAudit: LeakageAuditSpec;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly exclusions: ProtocolExclusions;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly slices: SliceSpec;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly predictionIntervals: PredictionIntervalSpec | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly residualDiagnostics: ResidualDiagnosticsSpec | null;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly retrainTriggers: readonly RetrainTrigger[];  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly search: SearchStrategy;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly budgets: Budgets;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly minMinorityClassRows: number;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly guardFieldsEditableBy: GuardFieldsEditableBy;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
  readonly authoredBy: Actor;  // case-violation-ok-legacy-back-compat: contracts.ts wire name
}

/** A calendar day, yyyy-mm-dd (the holdout cutoff and end). */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Every `SecondaryMetric`; `satisfies` refuses a value that is not one. */
const SECONDARY_METRICS = ['auc', 'accuracy', 'f1', 'precision', 'recall', 'r2', 'calibration-slope'] as const satisfies readonly SecondaryMetric[];
/** Compile-time completeness: a `SecondaryMetric` added without listing it in SECONDARY_METRICS breaks the build. */
const secondaryMetricsComplete: [Exclude<SecondaryMetric, (typeof SECONDARY_METRICS)[number]>] extends [never] ? true : never = true;
void secondaryMetricsComplete;

/** The `MJ: Evaluation Protocols` columns the checks read (the generated entity satisfies this structurally). */
export interface EvaluationProtocolColumns {
  ID: string; LineageRootID: string; Version: number; Name: string;
  Holdout: string; InnerValidation: string; Seed: number; HoldoutAccessBudget: number;
  PrimaryScore: string; SecondaryMetrics: string; Baselines: string; Calibration: string; Resampling: string;
  Intervals: string; Promotion: string; AllowedOutcomes: string; LeakageAudit: string; Exclusions: string;
  Slices: string; PredictionIntervals: string | null; ResidualDiagnostics: string | null; RetrainTriggers: string;
  SearchStrategy: string; Budgets: string; MinMinorityClassRows: number; GuardFieldsEditableBy: string; AuthoredBy: string;
}

/**
 * The Evaluation Protocol's column checks and its typed parser: static members on one owner class. The protocol
 * behaviour rules live in EvaluationProtocolRules (evaluation-protocol-rules.ts).
 */
export class EvaluationProtocol {
  /** The only producer of a {@link NonNegative} (a margin or a budget). */
  public static ToNonNegative(x: number): NonNegative {
    if (!Number.isFinite(x) || x < 0) {
      throw new RangeError(`expected a finite number >= 0, got ${String(x)}`);
    }
    return x as NonNegative;
  }

  /** Narrows a stored `GuardFieldsEditableBy` column value to its union. */
  public static IsGuardFieldsEditableBy(v: string): v is GuardFieldsEditableBy {
    return v === 'non-agent' || v === 'human-only';
  }

  /**
   * The shape checks run by `MJEvaluationProtocolEntityServer.Validate()`: every JSON column parses, the fixed
   * fields hold their only admissible values, the primary score is proper for its family, the margin is >= 0,
   * rolling-origin has >= 5 origins and no-signal cannot be omitted. Seed (an integer >= 0) and Version (an integer
   * >= 1) are checked here too, so a row the typed parser would refuse is refused at save time as well. The full typed
   * parse and the save-time rules are separate members.
   */
  public static GetEvaluationProtocolShapeProblems(row: EvaluationProtocolColumns): string[] {
    const problems: string[] = [];
    const json = (text: string | null, column: string, required: boolean): JsonValue | null => {
      if (!required && (text === null || text.trim().length === 0)) return null;
      const r = JsonParse.ParseJsonText(text, column);
      if (r.Ok === false) {
        problems.push(...r.Errors);
        return null;
      }
      return r.Value;
    };
    for (const [column, text] of [
      ['InnerValidation', row.InnerValidation], ['SecondaryMetrics', row.SecondaryMetrics], ['Baselines', row.Baselines],
      ['Calibration', row.Calibration], ['Resampling', row.Resampling], ['Intervals', row.Intervals],
      ['LeakageAudit', row.LeakageAudit], ['Exclusions', row.Exclusions], ['Slices', row.Slices],
      ['RetrainTriggers', row.RetrainTriggers], ['SearchStrategy', row.SearchStrategy], ['Budgets', row.Budgets], ['AuthoredBy', row.AuthoredBy],
    ] as const) {
      json(text, column, true);
    }
    json(row.PredictionIntervals, 'PredictionIntervals', false);
    json(row.ResidualDiagnostics, 'ResidualDiagnostics', false);
    EvaluationProtocol.checkFixedColumns(row, problems);
    EvaluationProtocol.checkAllowedOutcomes(json(row.AllowedOutcomes, 'AllowedOutcomes', true), problems);
    EvaluationProtocol.checkPrimaryScore(json(row.PrimaryScore, 'PrimaryScore', true), problems);
    EvaluationProtocol.checkPromotionMargin(json(row.Promotion, 'Promotion', true), problems);
    EvaluationProtocol.checkHoldoutShape(json(row.Holdout, 'Holdout', true), problems);
    return problems;
  }

  /** The scalar columns with one admissible value or range, and the version-1 lineage root. */
  private static checkFixedColumns(row: EvaluationProtocolColumns, problems: string[]): void {
    if (row.HoldoutAccessBudget !== 1) problems.push('HoldoutAccessBudget must be 1');
    if (!Number.isInteger(row.Seed) || row.Seed < 0) problems.push('Seed must be an integer >= 0');
    if (!Number.isInteger(row.Version) || row.Version < 1) problems.push('Version must be an integer >= 1');
    if (!EvaluationProtocol.IsGuardFieldsEditableBy(row.GuardFieldsEditableBy)) problems.push('GuardFieldsEditableBy must be non-agent or human-only');
    if (!Number.isInteger(row.MinMinorityClassRows) || row.MinMinorityClassRows < 1) problems.push('MinMinorityClassRows must be an integer >= 1');
    // Case-insensitive UUID comparison (SQL Server returns upper-case UUIDs, PostgreSQL lower-case).
    if (row.Version === 1 && !UUIDsEqual(row.LineageRootID, row.ID)) problems.push('Version 1 must be its own lineage root (LineageRootID = ID)');
  }

  /** A protocol cannot omit no-signal: the outcomes are exactly ALLOWED_OUTCOMES. */
  private static checkAllowedOutcomes(outcomes: JsonValue | null, problems: string[]): void {
    if (outcomes !== null && JSON.stringify(outcomes) !== JSON.stringify(ALLOWED_OUTCOMES)) {
      problems.push('AllowedOutcomes must be exactly ["model","keep-simple-baseline","no-signal"]');
    }
  }

  /** The primary score's metric must be a proper score of its family. */
  private static checkPrimaryScore(primary: JsonValue | null, problems: string[]): void {
    if (primary === null) return;
    const family = JsonParse.IsJsonObject(primary) ? JsonParse.JsonString(primary, 'family') : null;
    const metric = JsonParse.IsJsonObject(primary) ? JsonParse.JsonString(primary, 'metric') : null;
    const allowed: readonly string[] | null = family !== null && EvaluationProtocol.isProperScoreFamily(family) ? PROPER_SCORES_BY_FAMILY[family] : null;
    if (allowed === null) problems.push(`PrimaryScore family "${family || ''}" is not one of ${Object.keys(PROPER_SCORES_BY_FAMILY).join(', ')}`);
    else if (metric === null || !allowed.includes(metric)) problems.push(`PrimaryScore metric "${metric || ''}" is not a proper score of family "${family}" (allowed: ${allowed.join(', ')})`);
  }

  /** The promotion margin is a finite number >= 0. */
  private static checkPromotionMargin(promotion: JsonValue | null, problems: string[]): void {
    if (promotion === null) return;
    const margin = JsonParse.IsJsonObject(promotion) ? JsonParse.JsonNumber(promotion, 'margin') : null;
    if (margin === null || margin < 0) problems.push('Promotion margin must be a finite number >= 0');
  }

  /** Narrows a family string to a key of PROPER_SCORES_BY_FAMILY without a cast. */
  private static isProperScoreFamily(family: string): family is ProperScore['family'] {
    return Object.prototype.hasOwnProperty.call(PROPER_SCORES_BY_FAMILY, family);
  }

  /** A date-carved holdout names its date column and cutoff (and an end after it); rolling-origin needs >= 5 origins. */
  private static checkHoldoutShape(holdout: JsonValue | null, problems: string[]): void {
    if (holdout === null || !JsonParse.IsJsonObject(holdout)) return;
    const kind = JsonParse.JsonString(holdout, 'kind');
    if (kind === 'rolling-origin') {
      const origins = JsonParse.JsonInteger(holdout, 'origins');
      if (origins === null || origins < 5) problems.push(`Holdout rolling-origin needs at least 5 origins (${origins === null ? 'none' : origins} given)`);
    } else if (kind === 'date-carved') {
      const cutoff = JsonParse.JsonString(holdout, 'cutoff') || '';
      if (!JsonParse.JsonString(holdout, 'dateColumn') || !ISO_DAY.test(cutoff)) problems.push('Holdout date-carved needs dateColumn and cutoff yyyy-mm-dd');
      const end = holdout['holdoutEnd'];
      if (end !== undefined && end !== null && (typeof end !== 'string' || !ISO_DAY.test(end) || end <= cutoff)) problems.push('Holdout date-carved holdoutEnd must be null or a yyyy-mm-dd date after cutoff');
    } else {
      problems.push('Holdout kind must be date-carved or rolling-origin');
    }
  }

  private static isSecondaryMetric(s: string): s is SecondaryMetric {
    return SECONDARY_METRICS.some((m) => m === s);
  }

  private static intAtLeast(o: JsonObject, key: string, min: number): number | null {
    const v = JsonParse.JsonInteger(o, key);
    return v !== null && v >= min ? v : null;
  }

  /**
   * Parse every column of an `MJ: Evaluation Protocols` row into {@link EvaluationProtocolSpec}. All problems are
   * reported (each names its column); the shape checks ({@link GetEvaluationProtocolShapeProblems}) run first so
   * their messages are the ones a user sees for the fixed fields.
   */
  public static ParseEvaluationProtocolRow(row: EvaluationProtocolColumns): ParseResult<EvaluationProtocolSpec> {
    const errors: string[] = [...EvaluationProtocol.GetEvaluationProtocolShapeProblems(row)];
    const holdout = EvaluationProtocol.parseHoldout(EvaluationProtocol.objectOf(row.Holdout, 'Holdout', errors), errors);
    const innerValidation = EvaluationProtocol.parseInnerValidation(EvaluationProtocol.objectOf(row.InnerValidation, 'InnerValidation', errors), errors);
    const primaryScore = EvaluationProtocol.parsePrimaryScore(EvaluationProtocol.objectOf(row.PrimaryScore, 'PrimaryScore', errors));
    const secondaryMetrics = EvaluationProtocol.parseSecondaryMetrics(EvaluationProtocol.arrayOf(row.SecondaryMetrics, 'SecondaryMetrics', errors), errors);
    const baselines = EvaluationProtocol.parseBaselines(EvaluationProtocol.arrayOf(row.Baselines, 'Baselines', errors), errors);
    const calibration = EvaluationProtocol.parseCalibration(EvaluationProtocol.objectOf(row.Calibration, 'Calibration', errors), errors);
    const resampling = EvaluationProtocol.parseResampling(EvaluationProtocol.objectOf(row.Resampling, 'Resampling', errors), errors);
    const intervals = EvaluationProtocol.parseIntervals(EvaluationProtocol.objectOf(row.Intervals, 'Intervals', errors), errors);
    const promotionObj = EvaluationProtocol.objectOf(row.Promotion, 'Promotion', errors);
    const promotion = promotionObj === null ? null : EvaluationProtocol.parsePromotion(promotionObj, errors);
    const leakageAudit = EvaluationProtocol.parseLeakageAudit(EvaluationProtocol.objectOf(row.LeakageAudit, 'LeakageAudit', errors), errors);
    const exclusions = EvaluationProtocol.parseExclusions(EvaluationProtocol.objectOf(row.Exclusions, 'Exclusions', errors), errors);
    const slices = EvaluationProtocol.parseSlices(EvaluationProtocol.objectOf(row.Slices, 'Slices', errors), errors);
    const predictionIntervals = EvaluationProtocol.isBlank(row.PredictionIntervals) ? null : EvaluationProtocol.parsePredictionIntervals(EvaluationProtocol.objectOf(row.PredictionIntervals, 'PredictionIntervals', errors), errors);
    const residualDiagnostics = EvaluationProtocol.isBlank(row.ResidualDiagnostics) ? null : EvaluationProtocol.parseResidualDiagnostics(EvaluationProtocol.objectOf(row.ResidualDiagnostics, 'ResidualDiagnostics', errors), errors);
    const retrainTriggers = EvaluationProtocol.parseRetrainTriggers(EvaluationProtocol.arrayOf(row.RetrainTriggers, 'RetrainTriggers', errors), errors);
    const search = EvaluationProtocol.parseSearch(EvaluationProtocol.objectOf(row.SearchStrategy, 'SearchStrategy', errors), errors);
    const budgets = EvaluationProtocol.parseBudgets(EvaluationProtocol.objectOf(row.Budgets, 'Budgets', errors), errors);
    // An invalid value is already reported by the shape check.
    const guardFieldsEditableBy = EvaluationProtocol.IsGuardFieldsEditableBy(row.GuardFieldsEditableBy) ? row.GuardFieldsEditableBy : null;
    const authoredBy = EvaluationProtocol.parseAuthoredBy(row.AuthoredBy, errors);

    if (
      errors.length > 0 || holdout === null || innerValidation === null || primaryScore === null || calibration === null ||
      resampling === null || intervals === null || promotion === null || leakageAudit === null || exclusions === null ||
      slices === null || search === null || budgets === null || authoredBy === null || guardFieldsEditableBy === null
    ) {
      return { Ok: false, Errors: errors.length > 0 ? errors : ['Evaluation Protocol row is incomplete'] };
    }
    return {
      Ok: true,
      Value: {
        id: row.ID, lineageRootId: row.LineageRootID, version: row.Version, name: row.Name,
        holdout, innerValidation, seed: row.Seed, holdoutAccessBudget: 1, primaryScore, secondaryMetrics, baselines,
        calibration, resampling, intervals, promotion, allowedOutcomes: ALLOWED_OUTCOMES, leakageAudit,
        exclusions, slices, predictionIntervals, residualDiagnostics,
        retrainTriggers, search, budgets, minMinorityClassRows: row.MinMinorityClassRows, guardFieldsEditableBy,
        authoredBy,
      },
    };
  }

  private static isBlank(text: string | null): boolean {
    return text === null || text.trim().length === 0;
  }

  /** A JSON-object column; a malformed one is reported once (the shape check may already have named it). */
  private static objectOf(text: string | null, column: string, errors: string[]): JsonObject | null {
    const r = JsonParse.ParseJsonText(text, column);
    if (r.Ok === false) {
      if (!errors.some((e) => e.startsWith(column))) errors.push(...r.Errors);
      return null;
    }
    if (!JsonParse.IsJsonObject(r.Value)) {
      errors.push(`${column} must be a JSON object`);
      return null;
    }
    return r.Value;
  }

  /** A JSON-array column; a malformed one is reported once. */
  private static arrayOf(text: string | null, column: string, errors: string[]): JsonValue[] | null {
    const r = JsonParse.ParseJsonText(text, column);
    if (r.Ok === false) {
      if (!errors.some((e) => e.startsWith(column))) errors.push(...r.Errors);
      return null;
    }
    if (!Array.isArray(r.Value)) {
      errors.push(`${column} must be a JSON array`);
      return null;
    }
    return r.Value;
  }

  private static parseSecondaryMetrics(raw: JsonValue[] | null, errors: string[]): SecondaryMetric[] {
    const out: SecondaryMetric[] = [];
    for (const m of raw || []) {
      if (typeof m === 'string' && EvaluationProtocol.isSecondaryMetric(m)) out.push(m);
      else errors.push(`SecondaryMetrics entry ${JSON.stringify(m)} is not one of ${SECONDARY_METRICS.join(', ')}`);
    }
    return out;
  }

  private static parseBaselines(raw: JsonValue[] | null, errors: string[]): BaselineSpec[] {
    const out: BaselineSpec[] = [];
    (raw || []).forEach((b, i) => {
      const parsed = JsonParse.IsJsonObject(b) ? EvaluationProtocol.parseBaseline(b) : null;
      if (parsed === null) errors.push(`Baselines[${i}] must be dummy, one-feature, glm, naive, seasonal-naive or incumbent-heuristic`);
      else out.push(parsed);
    });
    return out;
  }

  private static parseRetrainTriggers(raw: JsonValue[] | null, errors: string[]): RetrainTrigger[] {
    const out: RetrainTrigger[] = [];
    (raw || []).forEach((t, i) => {
      const parsed = JsonParse.IsJsonObject(t) ? EvaluationProtocol.parseRetrainTrigger(t) : null;
      if (parsed === null) errors.push(`RetrainTriggers[${i}] must be outcome-degradation {margin>=0, consecutivePeriods} or calibration-drift {slopeOutside:[lo,hi], consecutivePeriods}`);
      else out.push(parsed);
    });
    return out;
  }

  private static parseExclusions(v: JsonObject | null, errors: string[]): ProtocolExclusions | null {
    if (v === null) return null;
    const denyFields = JsonParse.JsonStringArray(v, 'denyFields');
    const denySources = JsonParse.JsonStringArray(v, 'denySources');
    if (denyFields !== null && denySources !== null) return { denyFields, denySources };
    errors.push('Exclusions must be {denyFields: string[], denySources: string[]}');
    return null;
  }

  private static parseSlices(v: JsonObject | null, errors: string[]): SliceSpec | null {
    if (v === null) return null;
    const outOfTime = JsonParse.JsonBoolean(v, 'outOfTime');
    const subgroups = JsonParse.JsonStringArray(v, 'subgroups');
    if (outOfTime !== null && subgroups !== null) return { outOfTime, subgroups };
    errors.push('Slices must be {outOfTime: boolean, subgroups: string[]}');
    return null;
  }

  private static parseAuthoredBy(text: string, errors: string[]): Actor | null {
    const json = JsonParse.ParseJsonText(text, 'AuthoredBy');
    if (json.Ok === false) {
      if (!errors.some((e) => e.startsWith('AuthoredBy'))) errors.push(...json.Errors);
      return null;
    }
    const a = PredictionUnit.ParseActor(json.Value);
    if (a.Ok === true) return a.Value;
    errors.push(...a.Errors);
    return null;
  }

  private static parseHoldout(v: JsonObject | null, errors: string[]): HoldoutSplit | null {
    if (v === null) return null;
    const kind = JsonParse.JsonString(v, 'kind');
    if (kind === 'date-carved') {
      const dateColumn = JsonParse.JsonString(v, 'dateColumn');
      const cutoff = JsonParse.JsonString(v, 'cutoff');
      const endRaw = v['holdoutEnd'];
      const holdoutEnd = endRaw === undefined || endRaw === null ? null : JsonParse.JsonString(v, 'holdoutEnd');
      const reportRaw = v['newEntityReport'];
      if (reportRaw !== undefined && reportRaw !== null && !JsonParse.IsJsonObject(reportRaw)) {
        errors.push('HoldoutSplit.newEntityReport must be null or {groupKey, holdoutFraction in (0,1)}');
        return null;
      }
      const reportObj = reportRaw === undefined || reportRaw === null ? null : reportRaw;
      const groupKey = reportObj === null ? null : JsonParse.JsonString(reportObj, 'groupKey');
      const fraction = reportObj === null ? null : JsonParse.JsonNumber(reportObj, 'holdoutFraction');
      const reportOk = reportObj === null || (groupKey !== null && fraction !== null && fraction > 0 && fraction < 1);
      const endOk = holdoutEnd === null || (ISO_DAY.test(holdoutEnd) && cutoff !== null && holdoutEnd > cutoff);
      if (dateColumn && cutoff && ISO_DAY.test(cutoff) && endOk && reportOk && (endRaw === undefined || endRaw === null || holdoutEnd !== null)) {
        return {
          kind, dateColumn, cutoff, holdoutEnd,
          newEntityReport: reportObj === null || groupKey === null || fraction === null ? null : { groupKey, holdoutFraction: fraction },
        };
      }
      errors.push('Holdout date-carved needs dateColumn, cutoff yyyy-mm-dd, holdoutEnd null or a later yyyy-mm-dd, newEntityReport null or {groupKey, holdoutFraction in (0,1)}');
      return null;
    }
    if (kind === 'rolling-origin') {
      const origins = EvaluationProtocol.intAtLeast(v, 'origins', 5);
      const horizonPeriods = EvaluationProtocol.intAtLeast(v, 'horizonPeriods', 1);
      const gapPeriods = EvaluationProtocol.intAtLeast(v, 'gapPeriods', 0);
      const minTrainPeriods = EvaluationProtocol.intAtLeast(v, 'minTrainPeriods', 1);
      const window = JsonParse.JsonString(v, 'window');
      if (origins !== null && horizonPeriods !== null && gapPeriods !== null && minTrainPeriods !== null && (window === 'expanding' || window === 'sliding')) {
        return { kind, origins, horizonPeriods, gapPeriods, minTrainPeriods, window };
      }
      errors.push('Holdout rolling-origin needs origins>=5, horizonPeriods>=1, gapPeriods>=0, minTrainPeriods>=1, window expanding|sliding');
      return null;
    }
    return null; // the shape check already reported an unknown kind
  }

  private static parseInnerValidation(v: JsonObject | null, errors: string[]): InnerValidation | null {
    if (v === null) return null;
    const kind = JsonParse.JsonString(v, 'kind');
    const folds = EvaluationProtocol.intAtLeast(v, 'folds', 2);
    if (kind === 'repeated-stratified-kfold') {
      const repeats = EvaluationProtocol.intAtLeast(v, 'repeats', 1);
      if (folds !== null && repeats !== null) return { kind, folds, repeats };
    } else if (kind === 'grouped-kfold') {
      const repeats = EvaluationProtocol.intAtLeast(v, 'repeats', 1);
      const groupKey = JsonParse.JsonString(v, 'groupKey');
      if (folds !== null && repeats !== null && groupKey) return { kind, folds, repeats, groupKey };
    } else if (kind === 'blocked-time') {
      const gapPeriods = EvaluationProtocol.intAtLeast(v, 'gapPeriods', 0);
      const groupKey = v['groupKey'] === null ? null : JsonParse.JsonString(v, 'groupKey');
      if (folds !== null && gapPeriods !== null && (v['groupKey'] === null || groupKey !== null)) return { kind, folds, gapPeriods, groupKey };
    }
    errors.push('InnerValidation must be repeated-stratified-kfold {folds>=2, repeats>=1}, grouped-kfold {folds>=2, repeats>=1, groupKey} or blocked-time {folds>=2, gapPeriods>=0, groupKey|null}');
    return null;
  }

  private static parsePrimaryScore(v: JsonObject | null): ProperScore | null {
    if (v === null) return null;
    const family = JsonParse.JsonString(v, 'family');
    const metric = JsonParse.JsonString(v, 'metric');
    switch (family) {
      case 'binary': return metric === 'log-loss' || metric === 'brier' ? { family, metric } : null;
      case 'multiclass': return metric === 'multiclass-log-loss' ? { family, metric } : null;
      case 'continuous': return metric === 'rmse' || metric === 'mae' ? { family, metric } : null;
      case 'count': return metric === 'poisson-deviance' ? { family, metric } : null;
      case 'non-negative': return metric === 'tweedie-deviance' ? { family, metric } : null;
      case 'forecast': return metric === 'mase' || metric === 'rmse' ? { family, metric } : null;
      default: return null; // reported by the shape check
    }
  }

  private static parseBaseline(v: JsonObject): BaselineSpec | null {
    const kind = JsonParse.JsonString(v, 'kind');
    switch (kind) {
      case 'dummy': {
        const name = JsonParse.JsonString(v, 'name');
        return name === 'base-rate' || name === 'mean' || name === 'training-window-mean' ? { kind, name } : null;
      }
      case 'one-feature':
        return JsonParse.JsonString(v, 'selection') === 'best-single-feature-inner-cv' ? { kind, selection: 'best-single-feature-inner-cv' } : null;
      case 'glm': {
        const family = JsonParse.JsonString(v, 'family');
        const ok = family === 'logistic' || family === 'multinomial' || family === 'gaussian' || family === 'poisson' || family === 'tweedie';
        return ok && JsonParse.JsonString(v, 'penalty') === 'l2' ? { kind, family, penalty: 'l2' } : null;
      }
      case 'naive':
        return { kind };
      case 'seasonal-naive': {
        const season = EvaluationProtocol.intAtLeast(v, 'season', 1);
        return season === null ? null : { kind, season };
      }
      case 'incumbent-heuristic': {
        const name = JsonParse.JsonString(v, 'name');
        return name ? { kind, name } : null;
      }
      default:
        return null;
    }
  }

  private static parseCalibration(v: JsonObject | null, errors: string[]): CalibrationMethod | null {
    if (v === null) return null;
    const kind = JsonParse.JsonString(v, 'kind');
    const fitOn = JsonParse.JsonString(v, 'fitOn');
    if ((kind === 'platt' || kind === 'isotonic') && fitOn === 'disjoint-calibration-fold') return { kind, fitOn };
    if (kind === 'auto' && fitOn === 'disjoint-calibration-fold') {
      const thresholdRows = EvaluationProtocol.intAtLeast(v, 'thresholdRows', 1);
      if (thresholdRows !== null) return { kind, thresholdRows, fitOn };
    }
    if (kind === 'not-applicable' && JsonParse.JsonString(v, 'reason') === 'regression-task') return { kind, reason: 'regression-task' };
    errors.push('Calibration must be platt|isotonic {fitOn:"disjoint-calibration-fold"}, auto {thresholdRows>=1, fitOn} or not-applicable {reason:"regression-task"}');
    return null;
  }

  private static parseResampling(v: JsonObject | null, errors: string[]): ResamplingSpec | null {
    if (v === null) return null;
    const kind = JsonParse.JsonString(v, 'kind');
    if (kind === 'none') return { kind };
    const method = JsonParse.JsonString(v, 'method');
    if (kind === 'in-fold' && (method === 'class-weight' || method === 'undersample' || method === 'oversample')) return { kind, method };
    errors.push('Resampling must be {kind:"none"} or {kind:"in-fold", method: class-weight|undersample|oversample}');
    return null;
  }

  private static parseIntervals(v: JsonObject | null, errors: string[]): IntervalSpec | null {
    if (v === null) return null;
    const level = JsonParse.JsonNumber(v, 'level');
    const method = JsonParse.JsonString(v, 'method');
    const resamples = EvaluationProtocol.intAtLeast(v, 'resamples', 100);
    const pairedTest = JsonParse.JsonString(v, 'pairedTest');
    const methodOk = method === 'bootstrap' || method === 'cluster-bootstrap' || method === 'block-bootstrap' || method === 'delong';
    const testOk = pairedTest === 'paired-bootstrap' || pairedTest === 'delong' || pairedTest === 'corrected-resampled-t' || pairedTest === 'diebold-mariano';
    if (level === 0.95 && methodOk && testOk && resamples !== null) return { level: 0.95, method, resamples, pairedTest };
    errors.push('Intervals must be {level: 0.95, method: bootstrap|cluster-bootstrap|block-bootstrap|delong, resamples>=100, pairedTest: paired-bootstrap|delong|corrected-resampled-t|diebold-mariano}');
    return null;
  }

  private static parsePromotion(v: JsonObject, errors: string[]): PromotionRule | null {
    const rawComparators = JsonParse.JsonArrayField(v, 'comparators');
    if (rawComparators === null) {
      errors.push('Promotion.comparators must be an array of baseline specs');
      return null;
    }
    const comparators: BaselineSpec[] = [];
    for (const c of rawComparators) {
      const b = JsonParse.IsJsonObject(c) ? EvaluationProtocol.parseBaseline(c) : null;
      if (b === null) {
        errors.push('Promotion.comparators entries must be baseline specs');
        return null;
      }
      comparators.push(b);
    }
    const incumbent = JsonParse.JsonString(v, 'incumbent');
    const margin = JsonParse.JsonNumber(v, 'margin');
    const ok = (incumbent === 'current-published' || incumbent === 'none') && margin !== null && margin >= 0 &&
      JsonParse.JsonNumber(v, 'lowerBoundLevel') === 0.95 && JsonParse.JsonString(v, 'pairedOn') === 'same-holdout-rows' && JsonParse.JsonString(v, 'decisionTable') === 'Q13+Q14+Q15';
    if (!ok || margin === null || (incumbent !== 'current-published' && incumbent !== 'none')) {
      if (!errors.includes('Promotion margin must be a finite number >= 0')) {
        errors.push('Promotion must be {comparators, incumbent: current-published|none, margin>=0, lowerBoundLevel: 0.95, pairedOn: same-holdout-rows, decisionTable: Q13+Q14+Q15}');
      }
      return null;
    }
    return { comparators, incumbent, margin: EvaluationProtocol.ToNonNegative(margin), lowerBoundLevel: 0.95, pairedOn: 'same-holdout-rows', decisionTable: 'Q13+Q14+Q15' };
  }

  private static parseLeakageAudit(v: JsonObject | null, errors: string[]): LeakageAuditSpec | null {
    if (v === null) return null;
    const ceiling = JsonParse.JsonNumber(v, 'singleFeatureHeldOutAucMax');
    if (ceiling !== null && ceiling > 0.5 && ceiling <= 1 && JsonParse.JsonBoolean(v, 'timeShiftedLabelTest') === true &&
        JsonParse.JsonBoolean(v, 'dropColumnTest') === true && JsonParse.JsonString(v, 'importanceAggregation') === 'per-source-column' &&
        JsonParse.JsonBoolean(v, 'highCardinalityIdCheck') === true) {
      return { singleFeatureHeldOutAucMax: ceiling, timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: 'per-source-column', highCardinalityIdCheck: true };
    }
    errors.push('LeakageAudit must be {singleFeatureHeldOutAucMax in (0.5, 1], timeShiftedLabelTest: true, dropColumnTest: true, importanceAggregation: per-source-column, highCardinalityIdCheck: true}');
    return null;
  }

  private static parsePredictionIntervals(v: JsonObject | null, errors: string[]): PredictionIntervalSpec | null {
    if (v === null) return null;
    const method = JsonParse.JsonString(v, 'method');
    const raw = JsonParse.JsonArrayField(v, 'nominalCoverage');
    const levels: number[] = [];
    for (const x of raw || []) if (typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 1) levels.push(x);
    const coverageOk = raw !== null && raw.length > 0 && levels.length === raw.length;
    if (!coverageOk) errors.push('PredictionIntervals.nominalCoverage must be a non-empty array of numbers strictly between 0 and 1');
    if (method !== 'split-conformal' && method !== 'quantile') errors.push('PredictionIntervals.method must be split-conformal or quantile');
    return coverageOk && (method === 'split-conformal' || method === 'quantile') ? { method, nominalCoverage: levels } : null;
  }

  private static parseResidualDiagnostics(v: JsonObject | null, errors: string[]): ResidualDiagnosticsSpec | null {
    if (v === null) return null;
    const acfLags = EvaluationProtocol.intAtLeast(v, 'acfLags', 1);
    const alpha = JsonParse.JsonNumber(v, 'ljungBoxAlpha');
    if (acfLags !== null && alpha !== null && alpha > 0 && alpha < 1) return { acfLags, ljungBoxAlpha: alpha };
    errors.push('ResidualDiagnostics must be {acfLags>=1, ljungBoxAlpha in (0,1)}');
    return null;
  }

  private static parseRetrainTrigger(v: JsonObject): RetrainTrigger | null {
    const kind = JsonParse.JsonString(v, 'kind');
    const consecutivePeriods = EvaluationProtocol.intAtLeast(v, 'consecutivePeriods', 1);
    if (consecutivePeriods === null) return null;
    if (kind === 'outcome-degradation') {
      const margin = JsonParse.JsonNumber(v, 'margin');
      return margin !== null && margin >= 0 ? { kind, margin: EvaluationProtocol.ToNonNegative(margin), consecutivePeriods } : null;
    }
    if (kind === 'calibration-drift') {
      const range = JsonParse.JsonArrayField(v, 'slopeOutside');
      const lo = range?.[0];
      const hi = range?.[1];
      return range !== null && range.length === 2 && typeof lo === 'number' && typeof hi === 'number' && lo < hi
        ? { kind, slopeOutside: [lo, hi], consecutivePeriods } : null;
    }
    return null;
  }

  private static parseSearch(v: JsonObject | null, errors: string[]): SearchStrategy | null {
    if (v === null) return null;
    const kind = JsonParse.JsonString(v, 'kind');
    if (kind === 'random') {
      const candidates = EvaluationProtocol.intAtLeast(v, 'candidates', 1);
      if (candidates !== null) return { kind, candidates };
    }
    if (kind === 'guided') {
      const method = JsonParse.JsonString(v, 'method');
      const equalCostComparisonId = JsonParse.JsonString(v, 'equalCostComparisonId');
      if ((method === 'bayesian' || method === 'successive-halving') && equalCostComparisonId) return { kind, method, equalCostComparisonId };
    }
    errors.push('SearchStrategy must be {kind:"random", candidates>=1} or {kind:"guided", method: bayesian|successive-halving, equalCostComparisonId}');
    return null;
  }

  private static parseBudgets(v: JsonObject | null, errors: string[]): Budgets | null {
    if (v === null) return null;
    const maxComputeSeconds = JsonParse.JsonNumber(v, 'maxComputeSeconds');
    const maxTokens = EvaluationProtocol.intAtLeast(v, 'maxTokens', 0);
    const maxCandidates = EvaluationProtocol.intAtLeast(v, 'maxCandidates', 1);
    if (maxComputeSeconds !== null && maxComputeSeconds > 0 && maxTokens !== null && maxCandidates !== null && JsonParse.JsonBoolean(v, 'hardStop') === true) {
      return { maxComputeSeconds, maxTokens, maxCandidates, hardStop: true };
    }
    errors.push('Budgets must be {maxComputeSeconds>0, maxTokens>=0, maxCandidates>=1, hardStop: true}');
    return null;
  }
}
