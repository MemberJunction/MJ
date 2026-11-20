/**
 * JSON shapes for the `MJ: ML Monitoring Results` columns the monitoring job writes (PR 4 Task M6.3): `PrimaryScore`
 * (`MetricWithInterval`), `TrackedMetrics` (an array of `TrackedMetric`), `Calibration` (`CalibrationReport`),
 * `DriftLook` and `DriftAlarms` (arrays of `DriftLookEntry`), `Parity` (`MonitoringParity`), `TriggersFired` (an array
 * of `MonitoringTriggerFired`), `ChallengerResult` (`MonitoringChallengerResult`) and `RollbackCheck`
 * (`MonitoringRollbackCheck`).
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it verbatim, and CodeGen emits it inline
 * (once per entity, however many fields bind it), so it cannot import another file.
 *
 * **Lockstep contract**: every type here is mirrored, field for field, by the type of the same name in
 * `@memberjunction/predictive-studio-core`: `Interval`, `MetricWithInterval` and the metric keys in
 * `evaluation-protocol.ts`; `CalibrationReport` in `trainer-contract.ts`; the monitoring shapes in
 * `monitoring-contracts.ts`. Edit both in the same commit; Core's `src/__tests__/jsontype-mirrors.compile.test.ts` fails
 * when they drift. The keys are camelCase because they are stored JSON.
 */

/** Every metric a run may report: the proper scores and the secondary metrics. */
export type MetricKey =
  | 'log-loss' | 'brier' | 'multiclass-log-loss' | 'rmse' | 'mae' | 'poisson-deviance' | 'tweedie-deviance' | 'mase'
  | 'auc' | 'accuracy' | 'f1' | 'precision' | 'recall' | 'r2' | 'calibration-slope';

/** A confidence interval at `level` around an estimate. */
export interface Interval { readonly level: number; readonly lower: number; readonly upper: number }  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON keys

/** One metric's value on `n` rows, with its interval. */
export interface MetricWithInterval { readonly metric: MetricKey; readonly value: number; readonly interval: Interval; readonly n: number }  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON keys

/** A tracked metric of one period beside the primary score: a proper score, a label rate or the mean prediction. */
export interface TrackedMetric {
  readonly metric: MetricKey | 'positive-rate' | 'class-rate' | 'mean-prediction';  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly className: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly value: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly interval: Interval;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly n: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** A binary model's calibration over the period: the recalibration fit and the reliability bins. */
export interface CalibrationReport {
  readonly method: 'platt' | 'isotonic' | 'auto' | 'not-applicable';  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly intercept: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly slope: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly reliability: readonly {  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
    readonly binLower: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
    readonly binUpper: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
    readonly meanPredicted: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
    readonly observedRate: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
    readonly n: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  }[];
}

/** One input's procedure-M result at the period's look. */
export interface DriftLookEntry {
  readonly input: string;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly kind: 'mean' | 'proportion' | 'series';  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly z: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly p: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly pAdjusted: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly q: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly look: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly flagged: boolean;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** The period's scoring parity check. */
export interface MonitoringParity {
  readonly sampled: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly maxAbsDifference: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly passed: boolean;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly tolerance: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly resampled: boolean;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly trainingRunId: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly skipped: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** One retrain trigger that fired at the period. */
export interface MonitoringTriggerFired {
  readonly kind: 'outcome-degradation' | 'calibration-drift';  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly reason: string;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** The live challenger mirror's divergence over the period (`agreement` is a classifier's; null for any other task). */
export interface MonitoringMirror {
  readonly challengerModelId: string;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly paired: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly agreement: number | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly meanScoreDelta: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly failures: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** The period's challenger outcome and the live mirror's divergence. */
export interface MonitoringChallengerResult {
  readonly outcome: 'none' | 'waiting' | 'published' | 'withheld' | 'stopped' | 'failed';  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly trainingRunId: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly recordId: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly reason: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
  readonly mirror: MonitoringMirror | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
}

/** The period's automated rollback check. */
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
      readonly sharedRowIds: number;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
      readonly comparisons: readonly Interval[];  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
      readonly recordId: string | null;  // case-violation-ok-legacy-back-compat: stored MJ: ML Monitoring Results JSON key
    };
