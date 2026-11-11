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
import type { CalibrationReport } from './trainer-contract';
import type { IntervalSpec, MetricWithInterval, PromotionRule, ProperScore, RetrainTrigger, RollbackTrigger } from './evaluation-protocol';

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
  readonly Calibration: CalibrationReport | null;
  readonly DriftAlarms: readonly { readonly Feature: string; readonly AdjustedP: number }[];
  readonly Parity: { readonly Sampled: number; readonly MaxAbsDifference: number; readonly Passed: boolean };
  readonly TriggersFired: readonly RetrainTrigger['kind'][];
  readonly ChallengerRunID: string | null;
}
