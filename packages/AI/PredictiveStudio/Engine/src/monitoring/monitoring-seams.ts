/**
 * @module monitoring/monitoring-seams
 *
 * The monitoring job's collaborators (M6.3), each behind an interface so the driver and its steps are unit-testable
 * over in-memory doubles: the stored rows it reads and the period row it writes ({@link IMonitoringStore}), the shadow
 * scoring of a model with no binding and of the predecessor ({@link IMonitoringScorer}), procedure M in the sidecar
 * ({@link IMonitoringDrift}), the challenger's training and its unattended publish ({@link IMonitoringPublisher}), the
 * rollback's publish through the lifecycle gate ({@link IMonitoringGate}), M5's parity check
 * ({@link IMonitoringParity}), the D4-18 notification ({@link IMonitoringNotifier}) and the clock. Production
 * implementations are in `monitoring-store.ts`.
 */
import type { MJMLModelEntity, MJMLModelScoringBindingEntity, MJMLMonitoringResultEntity } from '@memberjunction/core-entities';
import type {
  Actor,
  MetricWithInterval,
  MonitorDriftRequest,
  MonitorDriftResponse,
  MonitoringChallengerResult,
  MonitoringParity,
  MonitoringRollbackCheck,
  MonitoringTriggerFired,
  DriftLookEntry,
  PredictionUnitSpec,
  TaskType,
  TrackedMetric,
  CalibrationReport,
} from '@memberjunction/predictive-studio-core';

import type { EvaluateOutcome, PublishOutcome, PublishRequest } from '../registry/gate-context';
import type { RegistryContext } from '../registry/registry-context';
import type { CanonicalLabelValue } from '../prediction-unit/unit-row-reader';
import type { ChallengerSelection } from '../scoring/scoring-seams';

/** The model columns monitoring reads (the generated entity satisfies it). */
export type MonitoredModel = Pick<
  MJMLModelEntity,
  'ID' | 'PipelineID' | 'Version' | 'Status' | 'PredictionUnitID' | 'OutputSemantics' | 'ArtifactFileID' | 'ArtifactSha256' | 'TrainingSnapshotID'
>;

/** The binding columns monitoring reads (the generated entity satisfies it). */
export type MonitoredBinding = Pick<MJMLModelScoringBindingEntity, 'ID' | 'MLTrainingPipelineID'>;

/** A period's grain; the CHECK on `MJ: ML Monitoring Results.PeriodGrain` is the source of the union. */
export type PeriodGrain = MJMLMonitoringResultEntity['PeriodGrain'];

/** One monitored period: `[Start, End)` in UTC days. */
export interface MonitoringPeriod {
  readonly Start: Date;
  readonly End: Date;
  readonly Grain: PeriodGrain;
}

/** One model's stored or shadow-scored prediction of one record. */
export interface ModelPrediction {
  readonly RecordID: string;
  /** The as-of instant the prediction was made for (`EffectiveAsOf`; a shadow row's decision date). */
  readonly EffectiveAsOf: Date;
  /** The record was in the model's training snapshot. */
  readonly InTraining: boolean;
  /** The adverse-class probability of a classifier, the point of a regression. */
  readonly Score: number;
  /** A classifier's probability per class; null for a regression. */
  readonly Probabilities: Readonly<Record<string, number>> | null;
}

/** A record's realised outcome, read by PR 3's unit row reader at the unit's label rule. */
export interface RealisedOutcome {
  readonly RecordID: string;
  readonly DecisionDate: Date;
  readonly Label: CanonicalLabelValue;
  /** The row's group (the unit's group key, else its entity key): a cluster bootstrap resamples by it. */
  readonly GroupKey: string;
}

/** A unit row whose decision date falls in a period (the shadow path scores these). */
export interface UnitRowInPeriod {
  readonly RecordID: string;
  readonly DecisionDate: Date;
}

/** One prediction joined to its realised outcome (`Outcome` null when the closed window found none). */
export interface JoinedRow {
  readonly RecordID: string;
  readonly EffectiveAsOf: Date;
  readonly DecisionDate: Date;
  readonly InTraining: boolean;
  /** The score the model gave this record as of this period (never a later one). */
  readonly ScoreFromPeriod: number;
  /** Alias of {@link ScoreFromPeriod} the evaluation reads. */
  readonly Score: number;
  readonly Probabilities: Readonly<Record<string, number>> | null;
  readonly Outcome: CanonicalLabelValue | null;
  readonly GroupKey: string;
}

/** The model's Prediction Unit as monitoring reads it. */
export interface MonitoredUnit {
  readonly ID: string;
  readonly Spec: PredictionUnitSpec;
  readonly LabelWindowDays: number;
  readonly LabelGapDays: number;
  /** The entity whose records the unit's rows are (the binding's target, D4-168). */
  readonly RowEntity: string;
}

/** A shadow scoring run's result (`Path = 'monitoring'`, `DryRun = 1`, nothing written). */
export interface ShadowScoring {
  readonly ScoringRunID: string;
  readonly Status: 'completed' | 'refused' | 'failed';
  /** Why the run did not complete; null when it did. */
  readonly Reason: string | null;
  readonly Predictions: readonly ModelPrediction[];
}

/** The period row the job writes (`MJ: ML Monitoring Results`, unique per model, grain and period: a re-run updates it). */
export interface PeriodRowWrite {
  readonly ModelID: string;
  readonly ScheduledJobRunID: string | null;
  readonly Period: MonitoringPeriod;
  readonly State: MJMLMonitoringResultEntity['State'];
  readonly ScoredRows: number;
  readonly JoinedRows: number;
  readonly ExcludedInTrainingRows: number;
  readonly Primary: MetricWithInterval | null;
  readonly Tracked: readonly TrackedMetric[] | null;
  readonly Calibration: CalibrationReport | null;
  readonly DriftLook: readonly DriftLookEntry[] | null;
  readonly DriftAlarms: readonly DriftLookEntry[];
  readonly Parity: MonitoringParity | null;
  readonly TriggersFired: readonly MonitoringTriggerFired[];
  readonly ChallengerRunID: string | null;
  readonly Challenger: MonitoringChallengerResult | null;
  readonly Rollback: MonitoringRollbackCheck | null;
  readonly ErrorMessage: string | null;
}

/** An earlier period row as the triggers read it back. */
export interface StoredPeriodRow {
  readonly Period: Date;
  readonly State: MJMLMonitoringResultEntity['State'];
  readonly Primary: MetricWithInterval | null;
  readonly Calibration: CalibrationReport | null;
  readonly TriggersFired: readonly MonitoringTriggerFired[];
}

/** The model a published model's `publish` record replaced (D4-17). */
export interface Predecessor {
  readonly ModelID: string;
  /** The predecessor row as stored now; null when it has been deleted since. */
  readonly Model: MonitoredModel | null;
}

/** Per-input drift values: the training window's and the period's. */
export interface DriftInputValues {
  readonly Name: string;
  readonly Reference: readonly number[];
  readonly Current: readonly number[];
}

/** The stored rows monitoring reads and the period row it writes. */
export interface IMonitoringStore {
  /** The model row; null when it is gone. */
  LoadModel(modelId: string, ctx: RegistryContext): Promise<MonitoredModel | null>;
  /** The model's task from its `OutputSemantics`. @throws when the model has none */
  TaskOf(model: MonitoredModel): TaskType;
  /** The model's Prediction Unit. @throws when it cannot be read or parsed */
  LoadUnit(unitId: string, ctx: RegistryContext): Promise<MonitoredUnit>;
  /**
   * The binding whose stored rows the period joins: the pipeline's `Active` binding; else its newest `Withdrawn`
   * binding that stored `Model` rows of `modelId` in the period (a withdrawn binding's rows still join for the periods
   * it scored); null when neither (the shadow path, D4-67).
   */
  BindingOf(pipelineId: string, modelId: string, period: MonitoringPeriod, ctx: RegistryContext): Promise<MonitoredBinding | null>;
  /**
   * The model's stored `Source = 'Model'` rows of `role` with `EffectiveAsOf` in the period, one per record (the row as
   * of the period, never a later one), including `InTraining` rows (the caller counts and excludes them).
   */
  ModelRows(modelId: string, bindingId: string, role: 'Champion' | 'Challenger', period: MonitoringPeriod, ctx: RegistryContext): Promise<ModelPrediction[]>;
  /** The unit's rows whose decision date falls in the period, read as of `now`. */
  UnitRowsInPeriod(unit: MonitoredUnit, period: MonitoringPeriod, now: Date, ctx: RegistryContext): Promise<UnitRowInPeriod[]>;
  /** The realised outcomes of `recordIds` (a record the unit's reader excludes, or whose label is unknown, is absent), read as of `now`. */
  Outcomes(unit: MonitoredUnit, recordIds: readonly string[], now: Date, ctx: RegistryContext): Promise<readonly RealisedOutcome[]>;
  /** The holdout primary score frozen in the model's `publish` record's evidence; null when it has none. */
  ReferenceScore(modelId: string, ctx: RegistryContext): Promise<MetricWithInterval | null>;
  /** The model's earlier period rows of the grain, oldest first, before `period`. */
  EarlierPeriods(modelId: string, grain: PeriodGrain, before: Date, ctx: RegistryContext): Promise<StoredPeriodRow[]>;
  /** The predecessor the model's latest applied `publish` record replaced; null when it replaced none. */
  Predecessor(modelId: string, ctx: RegistryContext): Promise<Predecessor | null>;
  /** Whether the model's stored artifact loads verified (the rollback's eligibility, §5.7 R5). */
  ArtifactVerified(model: MonitoredModel, ctx: RegistryContext): Promise<{ readonly Verified: boolean; readonly Reason: string }>;
  /** The binding's live challenger and its record sample as of `asOf` (its Record Process `ChallengerConfiguration`); null when none. */
  Challenger(binding: MonitoredBinding, asOf: Date, ctx: RegistryContext): Promise<ChallengerSelection | null>;
  /** The model's inputs' training-window and period values for procedure M. */
  DriftInputs(model: MonitoredModel, unit: MonitoredUnit, recordIds: readonly string[], ctx: RegistryContext): Promise<DriftInputValues[]>;
  /** Inserts the period row, or updates the one stored for the model, grain and period; returns its ID. */
  WritePeriod(write: PeriodRowWrite, ctx: RegistryContext): Promise<string>;
  /** The user a scheduled job run's notifications go to (its job's `OwnerUserID`, D4-18); null when none. */
  JobOwner(scheduledJobRunId: string, ctx: RegistryContext): Promise<string | null>;
}

/** Shadow scoring through `ScoringService.Predict` on the `monitoring` path (dry run, nothing written). */
export interface IMonitoringScorer {
  /**
   * Scores `rows` with `model`, each assembled as of its own decision date (`'unit-rule'`). `predecessorOf` names the
   * Published model whose `publish` record replaced `model` when `model` is that predecessor (the only non-Published
   * model the monitoring path admits, D4-17); null for the Published model itself.
   */
  Shadow(model: MonitoredModel, unit: MonitoredUnit, rows: readonly UnitRowInPeriod[], predecessorOf: string | null, ctx: RegistryContext): Promise<ShadowScoring>;
}

/** Procedure M in the sidecar (`POST /monitor/drift`, M6.1). */
export interface IMonitoringDrift {
  MonitorDrift(request: MonitorDriftRequest): Promise<MonitorDriftResponse>;
}

/** A challenger's training and its unattended publish through `AutomatedPublisher` (D-029). */
export interface IMonitoringPublisher {
  /** Trains the pipeline on a fresh snapshot (single-flight); the model is compared with the incumbent on its rows. */
  Train(pipelineId: string, ctx: RegistryContext): Promise<{ readonly TrainingRunID: string; readonly ModelID: string | null }>;
  /** `AutomatedPublisher.EvaluateAndPublish` with the scheduled-job initiator. */
  EvaluateAndPublish(trainingRunId: string, initiator: Actor, ctx: RegistryContext): Promise<PublishOutcome | EvaluateOutcome>;
}

/** The rollback's publish through the lifecycle gate (`purpose: 'rollback'`). */
export interface IMonitoringGate {
  Publish(request: PublishRequest, ctx: RegistryContext): Promise<PublishOutcome>;
}

/** M5's parity check over a binding's stored rows. */
export interface IMonitoringParity {
  /** Samples `n` of the binding's stored rows with `seed`, recomputes them and compares at `tolerance`. */
  Check(binding: MonitoredBinding, n: number, seed: number, tolerance: number, ctx: RegistryContext): Promise<{ readonly Sampled: number; readonly MaxAbsDifference: number; readonly Passed: boolean }>;
}

/** One `MJ: User Notifications` row to the job's owner (D4-18); informational, nothing waits for it. */
export interface IMonitoringNotifier {
  Notify(userId: string, title: string, message: string, modelId: string, ctx: RegistryContext): Promise<void>;
}

/** Every collaborator of the monitoring driver. */
export interface MonitoringSeams {
  readonly Store: IMonitoringStore;
  readonly Scorer: IMonitoringScorer;
  readonly Drift: IMonitoringDrift;
  readonly Publisher: IMonitoringPublisher;
  readonly Gate: IMonitoringGate;
  readonly Parity: IMonitoringParity;
  readonly Notifier: IMonitoringNotifier;
  readonly Clock: { Now(): Date };
}

/** What every monitoring step runs under: the job's user and provider, the job run, and the collaborators. */
export interface MonitoringContext extends RegistryContext {
  /** The `MJ: Scheduled Job Runs` row of the run; null for a run started by `PredictiveStudio.RunModelMonitoring`. */
  readonly ScheduledJobRunID: string | null;
  readonly Seams: MonitoringSeams;
}
