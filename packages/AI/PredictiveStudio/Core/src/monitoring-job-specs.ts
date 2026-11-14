/**
 * @module monitoring-job-specs
 *
 * The `MonitoringJobSpec` a published model's monitoring job is created with (`MJ: Scheduled Jobs.Configuration`),
 * built from the protocol the model was evaluated under, and the schema that checks one (D4-92). The protocol supplies
 * the scores, the interval method, the promotion rule a challenger is judged by, the retrain triggers and the rollback
 * trigger; the members the protocol does not hold (the schedule, the period, the drift test and the parity sample) take
 * the defaults below.
 *
 * **The defaults are M3's and M6 revises them before it activates any job.** The gate creates the job `Pending` and the
 * scheduler runs only `Active` jobs, so nothing reads these values until M6's monitoring driver exists: a monthly
 * schedule and period; drift by monitor procedure M (`z-mean`, Benjamini–Hochberg) at q(12) = 0.0095 over 12 monthly
 * looks (gate G6.6's design), with 4,000,000 null replays and the documented false-alarm rate 0.05; and parity on 100
 * sampled scored rows at the fixed tolerance 1e-9.
 */
import { z } from 'zod';
import type { EvaluationProtocolSpec } from './evaluation-protocol';
import { JsonParse, type ParseResult } from './json-value';
import type { MonitoringJobSpec } from './monitoring-contracts';

/** What the spec reads of the model it monitors. */
export interface MonitoredModel {
  /** `MJ: ML Models`.ID */
  readonly ModelID: string;
  /** The `MJ: ML Prediction Units` version row the model was trained for (its label window decides when a period joins). */
  readonly PredictionUnitID: string;
  /** How many input features the model scores (drift tests each one). */
  readonly FeatureCount: number;
}

const nonNegative = z.number().nonnegative();
const positiveInt = z.number().int().positive();
const properScore = z.discriminatedUnion('family', [
  z.object({ family: z.literal('binary'), metric: z.enum(['log-loss', 'brier']) }).strict(),
  z.object({ family: z.literal('multiclass'), metric: z.literal('multiclass-log-loss') }).strict(),
  z.object({ family: z.literal('continuous'), metric: z.enum(['rmse', 'mae']) }).strict(),
  z.object({ family: z.literal('count'), metric: z.literal('poisson-deviance') }).strict(),
  z.object({ family: z.literal('non-negative'), metric: z.literal('tweedie-deviance') }).strict(),
  z.object({ family: z.literal('forecast'), metric: z.enum(['mase', 'rmse']) }).strict(),
]);
const intervalSpec = z.object({
  level: z.literal(0.95),
  method: z.enum(['bootstrap', 'cluster-bootstrap', 'block-bootstrap', 'delong']),
  resamples: positiveInt,
  pairedTest: z.enum(['paired-bootstrap', 'delong', 'corrected-resampled-t', 'diebold-mariano']),
}).strict();
const rollbackTrigger = z.object({ kind: z.literal('previous-beats-current'), margin: nonNegative, consecutivePeriods: positiveInt }).strict();
const retrainTrigger = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('outcome-degradation'), margin: nonNegative, consecutivePeriods: positiveInt }).strict(),
  z.object({ kind: z.literal('calibration-drift'), slopeOutside: z.tuple([z.number(), z.number()]), consecutivePeriods: positiveInt }).strict(),
]);
const promotionRule = z.object({
  // The comparators are the protocol's own baseline specs, already checked when the protocol row was parsed.
  comparators: z.array(z.object({ kind: z.string() }).passthrough()),
  incumbent: z.enum(['current-published', 'none']),
  margin: nonNegative,
  lowerBoundLevel: z.literal(0.95),
  pairedOn: z.literal('same-holdout-rows'),
  decisionTable: z.literal('Q13+Q14+Q15'),
  requiresHumanSignOff: z.boolean(),
  signOffExpiryDays: positiveInt,
  autoPublishKeepBaseline: z.boolean(),
  rollbackOn: rollbackTrigger.nullable(),
}).strict();
const nullCalibration = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('block-replay'), blockPeriods: positiveInt, replays: positiveInt }).strict(),
  z.object({ kind: z.literal('empirical-replay'), looks: positiveInt, inputs: positiveInt, replays: positiveInt, q: z.number().gt(0).lt(1) }).strict(),
]);
const monitoringJobSpec = z.object({
  modelId: z.string().uuid(),
  evaluationProtocolId: z.string().min(1),
  schedule: z.object({ cronExpression: z.string().min(1), timezone: z.string().min(1) }).strict(),
  outcomeJoin: z.object({
    predictionUnitId: z.string().min(1),
    runWhen: z.literal('label-window-closed'),
    joinOn: z.literal('entity-and-as-of-date'),
    excludeInTrainingRows: z.literal(true),
  }).strict(),
  performance: z.object({ primaryScore: properScore, period: z.enum(['week', 'month', 'quarter']), interval: intervalSpec, calibration: z.literal(true) }).strict(),
  drift: z.object({
    features: z.literal('all-model-features'),
    statistic: z.enum(['psi', 'ks', 'chi-square', 'z-mean']),
    fdr: z.object({ method: z.literal('benjamini-hochberg'), q: z.number().gt(0).lt(1) }).strict(),
    nullCalibration,
    documentedFalseAlarmRate: z.number().gt(0).lt(1),
    action: z.literal('alert'),
  }).strict(),
  challenger: z.object({ comparison: z.literal('same-row-ids'), score: properScore, rule: promotionRule, onPass: z.literal('publish-through-gate') }).strict(),
  retrainTriggers: z.array(retrainTrigger),
  rollback: rollbackTrigger.nullable(),
  parity: z.object({ sampleRows: positiveInt, tolerance: z.literal(1e-9) }).strict(),
}).strict();

/** Building and checking monitoring job specs. */
export class MonitoringJobSpecs {
  /** The monitoring schedule until M6 revises it: 03:00 UTC on the first day of each month. */
  public static readonly DEFAULT_SCHEDULE: MonitoringJobSpec['schedule'] = { cronExpression: '0 3 1 * *', timezone: 'UTC' };
  /** The period each look covers (one look per month, matching the schedule). */
  public static readonly DEFAULT_PERIOD: MonitoringJobSpec['performance']['period'] = 'month';
  /** Looks monitor procedure M is calibrated for (G6.6: 12 monthly looks). */
  public static readonly DEFAULT_LOOKS = 12;
  /** q(12) of monitor procedure M (G6.6). */
  public static readonly DEFAULT_DRIFT_Q = 0.0095;
  /** No-drift replays q(L) was found on (≥ 4M, Ruling Q24). */
  public static readonly DEFAULT_NULL_REPLAYS = 4_000_000;
  /** The documented probability of any alarm over the looks under no drift. */
  public static readonly DOCUMENTED_FALSE_ALARM_RATE = 0.05;
  /** Scored rows each period's parity check recomputes. */
  public static readonly DEFAULT_PARITY_SAMPLE_ROWS = 100;

  /**
   * The spec for `model`'s monitoring job under `protocol`, the version row the model was evaluated under: the
   * protocol's primary score (performance and the challenger), its interval method, its promotion rule (the challenger
   * rule), its retrain triggers and its rollback trigger (`promotion.rollbackOn`; null turns automated rollback off),
   * and the module's defaults for the rest. Pure.
   */
  public static FromProtocol(protocol: EvaluationProtocolSpec, model: MonitoredModel): MonitoringJobSpec {
    return {
      modelId: model.ModelID,
      evaluationProtocolId: protocol.id,
      schedule: MonitoringJobSpecs.DEFAULT_SCHEDULE,
      outcomeJoin: { predictionUnitId: model.PredictionUnitID, runWhen: 'label-window-closed', joinOn: 'entity-and-as-of-date', excludeInTrainingRows: true },
      performance: { primaryScore: protocol.primaryScore, period: MonitoringJobSpecs.DEFAULT_PERIOD, interval: protocol.intervals, calibration: true },
      drift: {
        features: 'all-model-features',
        statistic: 'z-mean',
        fdr: { method: 'benjamini-hochberg', q: MonitoringJobSpecs.DEFAULT_DRIFT_Q },
        nullCalibration: {
          kind: 'empirical-replay', looks: MonitoringJobSpecs.DEFAULT_LOOKS, inputs: Math.max(1, model.FeatureCount),
          replays: MonitoringJobSpecs.DEFAULT_NULL_REPLAYS, q: MonitoringJobSpecs.DEFAULT_DRIFT_Q,
        },
        documentedFalseAlarmRate: MonitoringJobSpecs.DOCUMENTED_FALSE_ALARM_RATE,
        action: 'alert',
      },
      challenger: { comparison: 'same-row-ids', score: protocol.primaryScore, rule: protocol.promotion, onPass: 'publish-through-gate' },
      retrainTriggers: protocol.retrainTriggers,
      rollback: protocol.promotion.rollbackOn,
      parity: { sampleRows: MonitoringJobSpecs.DEFAULT_PARITY_SAMPLE_ROWS, tolerance: 1e-9 },
    };
  }

  /**
   * Checks a spec against its schema (object schemas are strict, so an unknown key is refused); every problem is
   * reported with its path. Returns the spec itself on success.
   */
  public static Validate(spec: MonitoringJobSpec): ParseResult<MonitoringJobSpec> {
    const parsed = monitoringJobSpec.safeParse(spec);
    if (parsed.success) return JsonParse.ParseOk(spec);
    return JsonParse.ParseFail<MonitoringJobSpec>(...parsed.error.issues.map((x) => `${x.path.join('.') || '(root)'}: ${x.message}`));
  }
}
