/**
 * @module evaluation-protocol
 *
 * The Evaluation Protocol column shapes and their shape checks, the typed protocol (`EvaluationProtocolSpec`,
 * `ParseEvaluationProtocolRow`); the protocol's behaviour rules are in `evaluation-protocol-rules.ts`, the gate in `gate.ts`.
 */
import { UUIDsEqual } from '@memberjunction/global';
import { JsonParse, type JsonValue } from './json-value';

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
 * The Evaluation Protocol's column checks and its typed parser: static members on one owner class. The protocol behaviour rules live in EvaluationProtocolRules (evaluation-protocol-rules.ts).
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
   * rolling-origin has >= 5 origins and no-signal cannot be omitted. The full typed parse and the save-time rules are separate members.
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
      if (!JsonParse.JsonString(holdout, 'dateColumn') || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) problems.push('Holdout date-carved needs dateColumn and cutoff yyyy-mm-dd');
      const end = holdout['holdoutEnd'];
      if (end !== undefined && end !== null && (typeof end !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end <= cutoff)) problems.push('Holdout date-carved holdoutEnd must be null or a yyyy-mm-dd date after cutoff');
    } else {
      problems.push('Holdout kind must be date-carved or rolling-origin');
    }
  }
}
