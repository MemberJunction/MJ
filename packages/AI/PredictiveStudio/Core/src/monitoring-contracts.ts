/**
 * @module monitoring-contracts
 *
 * C7 — monitoring, ported from the target-design contracts (`reference/contracts/contracts.ts` L1435-L1514) with PR 4's
 * deltas (§5.2): `DriftSpec` can express monitor procedure M (D4-05: the `z-mean` statistic and an empirical-replay
 * null); a passing challenger publishes through the gate and the job spec carries the protocol's rollback trigger
 * (D4-17, D4-20); the registry invariant check names a stored Query instead of holding SQL text (D-035) and remediates
 * (§5.7 R7). Drift alone never acts: `DriftSpec.action` stays `alert` (S8.4). Protocol and unit are named by their
 * version-row IDs (D-014): a version row is the version.
 *
 * Casing (D-054): the job spec, the drift spec and the retrain and rollback triggers are stored JSON
 * (`MJ: Scheduled Jobs.Configuration`, the protocol's JSON) and keep the contract's camelCase; the registry check and a
 * period result as the job computes it never leave the process and are PascalCase.
 */
import type { ListsEveryMember } from './json-value';
import type { MonitorDriftLook } from './sidecar-contract';
import type { CalibrationReport } from './trainer-contract';
import type { Interval, IntervalSpec, MetricWithInterval, PromotionRule, ProperScore, RetrainTrigger, RollbackTrigger } from './evaluation-protocol';

/** The null a drift test's thresholds are calibrated on: block replay (the contract) or procedure M's empirical replay. */
export type DriftNullCalibration =
  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON keys
  | { readonly kind: 'block-replay'; readonly blockPeriods: number; readonly replays: number }
  /** Procedure M (D4-05): `looks` looks over `inputs` inputs, `replays` no-drift replays, BH at level `q` = q(L). */
  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON keys
  | { readonly kind: 'empirical-replay'; readonly looks: number; readonly inputs: number; readonly replays: number; readonly q: number };

/** How input drift is tested: false-discovery control across features and looks; an alarm is recorded, never acted on. */
export interface DriftSpec {
  readonly features: 'all-model-features';  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  readonly statistic: 'psi' | 'ks' | 'chi-square' | 'z-mean';  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  readonly fdr: { readonly method: 'benjamini-hochberg'; readonly q: number };  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  /** Thresholds calibrated on a no-drift replay that preserves autocorrelation (S8.3). */
  readonly nullCalibration: DriftNullCalibration;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  readonly documentedFalseAlarmRate: number;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  /** Drift raises an alert (a recorded event); it never retrains on its own. */
  readonly action: 'alert';  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
}

/** `MJ: Scheduled Jobs.Configuration` of one Published model's monitoring job. */
export interface MonitoringJobSpec {
  readonly modelId: string;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  /** The `MJ: ML Evaluation Protocols` version row the model was evaluated under. */
  readonly evaluationProtocolId: string;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  readonly schedule: { readonly cronExpression: string; readonly timezone: string };  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  readonly outcomeJoin: {  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    /** The `MJ: ML Prediction Units` version row whose label window decides when a period is joined. */
    readonly predictionUnitId: string;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly runWhen: 'label-window-closed';  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly joinOn: 'entity-and-as-of-date';  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly excludeInTrainingRows: true;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  };
  readonly performance: {  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly primaryScore: ProperScore;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly period: 'week' | 'month' | 'quarter';  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly interval: IntervalSpec;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly calibration: true;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  };
  readonly drift: DriftSpec;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  readonly challenger: {  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly comparison: 'same-row-ids';  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly score: ProperScore;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    readonly rule: PromotionRule;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
    /** A passing challenger publishes through the lifecycle gate (D4-20); no outcome waits for a reader. */
    readonly onPass: 'publish-through-gate';  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  };
  /** Copied from the protocol's retrain triggers at job creation; a fired trigger is logged and starts a training run. */
  readonly retrainTriggers: readonly RetrainTrigger[];  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  /** The protocol's `Promotion.rollbackOn`; null turns automated rollback off (D4-17). */
  readonly rollback: RollbackTrigger | null;  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
  readonly parity: { readonly sampleRows: number; readonly tolerance: 1e-9 };  // case-violation-ok-legacy-back-compat: stored MonitoringJobSpec JSON key
}

/**
 * Backstop for the publish lock (N8): the scheduled registry check finds a pipeline holding more than one Published
 * model and remediates it through the gate (§5.7 R7). The check runs the named stored Query (`metadata/queries/`) with
 * `RunQuery` on its provider; no TypeScript holds the SQL (D-035).
 */
export interface RegistryInvariantCheck {
  readonly Kind: 'single-published-per-pipeline';
  readonly Query: 'Predictive Studio: Pipelines With More Than One Published Model';
  readonly Schedule: { readonly CronExpression: string; readonly Timezone: string };
  readonly Action: 'remediate';
}

/** One model's monitoring outcome for one period, as the monitoring job computes it (`MJ: ML Monitoring Results`). */
export interface MonitoringPeriodResult {
  readonly ModelID: string;
  /** Period start, an ISO date (yyyy-mm-dd). */
  readonly Period: string;
  readonly JoinedRows: number;
  readonly Primary: MetricWithInterval;
  /**
   * The interval of (period − reference) primary loss under the protocol's `IntervalSpec`, the reference being the
   * model's stored holdout score (PR 4 delta, M6.2): the `outcome-degradation` trigger fires when its lower bound is
   * above the trigger's margin. Null when the period joined no rows.
   */
  readonly Degradation: Interval | null;
  readonly Calibration: CalibrationReport | null;
  readonly DriftAlarms: readonly { readonly Feature: string; readonly AdjustedP: number }[];
  readonly Parity: { readonly Sampled: number; readonly MaxAbsDifference: number; readonly Passed: boolean };
  readonly TriggersFired: readonly RetrainTrigger['kind'][];
  readonly ChallengerRunID: string | null;
}

// ------------------------------------------------------------------ the period row's JSON columns (M6.3, D-054) -----
// `MJ: ML Monitoring Results` stores these camelCase, as every stored JSON column of the program does.

/** A tracked metric of one period beside the primary score: a proper score, a label rate or the mean prediction. */
export interface TrackedMetric {
  /** A proper or secondary metric, the share of a class among the realised labels, or the mean predicted score. */
  readonly metric: MetricWithInterval['metric'] | 'positive-rate' | 'class-rate' | 'mean-prediction';  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  /** The class a `class-rate` (or the adverse class a `positive-rate`) is for; null otherwise. */
  readonly className: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly value: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly interval: Interval;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly n: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/**
 * One input's procedure-M result at the period's look (`DriftLook` holds every input's; `DriftAlarms` the flagged ones):
 * the sidecar's {@link MonitorDriftLook}, stored as it answered it.
 */
export type DriftLookEntry = Readonly<MonitorDriftLook>;

/** The period's scoring parity check (`Parity`): sampled scored rows recomputed, re-sampled once on a failure (D4-20). */
export interface MonitoringParity {
  readonly sampled: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly maxAbsDifference: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly passed: boolean;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly tolerance: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  /** True when the first sample failed and a second one was drawn. */
  readonly resampled: boolean;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  /** The training run a confirmed failure started; null otherwise. */
  readonly trainingRunId: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  /** Why parity was not checked (no binding stores this model's predictions, or nothing to sample); null when checked. */
  readonly skipped: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** One retrain trigger that fired at the period (`TriggersFired` is an array of these). */
export interface MonitoringTriggerFired {
  readonly kind: RetrainTrigger['kind'];  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly reason: string;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** The live challenger mirror's divergence over the period (D-069; `MonitoringRules.Divergence`'s result, stored camelCase). */
export interface MonitoringMirror {
  readonly challengerModelId: string;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly paired: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  /** A classifier's decision agreement at 0.5; null for any other task (not computed). */
  readonly agreement: number | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly meanScoreDelta: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly failures: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** What a period's challenger came to ({@link MonitoringChallengerResult.outcome}). */
export type MonitoringChallengerOutcome = 'none' | 'waiting' | 'published' | 'withheld' | 'stopped' | 'failed';

/** Every {@link MonitoringChallengerOutcome}, the one list a reader of a stored outcome checks against. */
export const MONITORING_CHALLENGER_OUTCOMES = ['none', 'waiting', 'published', 'withheld', 'stopped', 'failed'] as const satisfies readonly MonitoringChallengerOutcome[];
/** Compile-time completeness: an outcome added without listing it in MONITORING_CHALLENGER_OUTCOMES breaks the build. */
const challengerOutcomesComplete: ListsEveryMember<MonitoringChallengerOutcome, (typeof MONITORING_CHALLENGER_OUTCOMES)[number]> = true;
void challengerOutcomesComplete;

/**
 * The period's challenger outcome (`ChallengerResult`): a fired trigger's challenger training run and what the gate did
 * with it (`published` or `withheld` with the record the gate wrote; `stopped` when Evaluate shipped no model;
 * `waiting` while a trigger stays fired after the period that started a challenger, D4-11), or `none`; plus the live
 * mirror's divergence when the binding has a challenger.
 */
export interface MonitoringChallengerResult {
  readonly outcome: MonitoringChallengerOutcome;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly trainingRunId: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  /** The publish record of a published challenger, or the refusal record of a withheld one. */
  readonly recordId: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly reason: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly mirror: MonitoringMirror | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** The period's automated rollback check (`RollbackCheck`, D4-17, §5.7 R5). */
export type MonitoringRollbackCheck =
  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON keys
  | { readonly kind: 'off' }
  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON keys
  | { readonly kind: 'no-predecessor' }
  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON keys
  | { readonly kind: 'not-eligible'; readonly predecessorModelId: string; readonly reason: string }
  | {
      readonly kind: 'checked' | 'rolled-back' | 'rollback-withheld';  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
      readonly predecessorModelId: string;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
      /** Rows both models scored, outside either model's training snapshot, this period. */
      readonly sharedRowIds: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
      /** The paired (current − predecessor) loss interval of each checked period, oldest first. */
      readonly comparisons: readonly Interval[];  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
      /** The publish or refusal record of the rollback; null when it did not fire. */
      readonly recordId: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
    };

/** Every {@link MonitoringRollbackCheck} kind, the one list a reader of a stored check checks against. */
export const MONITORING_ROLLBACK_CHECK_KINDS = ['off', 'no-predecessor', 'not-eligible', 'checked', 'rolled-back', 'rollback-withheld'] as const satisfies readonly MonitoringRollbackCheck['kind'][];
/** Compile-time completeness: a check kind added without listing it in MONITORING_ROLLBACK_CHECK_KINDS breaks the build. */
const rollbackCheckKindsComplete: ListsEveryMember<MonitoringRollbackCheck['kind'], (typeof MONITORING_ROLLBACK_CHECK_KINDS)[number]> = true;
void rollbackCheckKindsComplete;
