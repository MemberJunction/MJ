/**
 * @module migration/pre-gate-model-migration
 *
 * `PreGateModelMigration` — §5.6 steps 2–5 for the models the serving migration's data section marked (D4-22, D4-61,
 * D4-13, D4-14): the work the Registry Check job runs on every run while pre-change work remains, so no environment
 * depends on anyone running a command.
 *
 * | Step | Composer | What it does |
 * |---|---|---|
 * | 2 | {@link PreGateModelMigration.ReverifyEvidenceBearing} | a model whose training run stored the gate record is back-filled from that run and re-verified: `LifecycleGate.AdoptPublished` for a Published one, `LifecycleGate.Evaluate` for a Draft one |
 * | 3 | {@link PreGateModelMigration.MigrateArtifacts} | every other pre-change model's artifact checked once ({@link PreChangeArtifacts}) |
 * | 4 | {@link PreGateModelMigration.DisableDemotedSchedules} | the scoring Actions of non-serving `Unevaluated` models disabled; a Record Process without `autoTrain` bound to one has its schedule disabled |
 * | 5 | {@link PreGateModelMigration.ReEvaluate} | each pipeline left without a Published model, not covered by auto-train, retrained once under its protocol through `AutomatedPublisher`; a publish repoints and re-enables the processes step 4 disabled |
 *
 * {@link PreGateModelMigration.RunRegistryStep} runs all four in that order and returns what the job run's `Details`
 * records under {@link PreGateModelMigration.DetailsKey}. Each composer is idempotent and bounded (50 models per step,
 * 3 retrains per run by default): a second run changes nothing that the first finished. Every gate call's initiator is
 * the job run (`{ kind: 'scheduled-job', scheduledJobRunId }`), every read and write runs on `ctx.Provider` as
 * `ctx.ContextUser`, and every ID comparison uses `UUIDsEqual`.
 */
import { CompositeKey, LogError } from '@memberjunction/core';
import type {
  MJMLModelEntity,
  MJMLModelPublishRecordEntity,
  MJMLModelScoringBindingEntity,
  MJMLTrainingPipelineEntity,
  MJMLTrainingRunEntity,
  MJMLTrainingSnapshotEntity,
  MJRecordChangeEntity,
  MJRecordProcessEntity,
  MJScheduledJobRunEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, ExcludeByUUIDs, GroupByUUID, IndexByUUID, IsValidUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
  Delivery,
  JsonParse,
  PredictionUnit,
  RegisteredDelivery,
  type Actor,
  type JsonObject,
  type TaskType,
  type TransitionRefusal,
} from '@memberjunction/predictive-studio-core';

import { ModelScoringActionGenerator } from '../actions/model-scoring-action-generator';
import { RunViewPredictionUnitStore } from '../prediction-unit/unit-store';
import { AutomatedPublisher } from '../registry/automated-publisher';
import type { AdoptOutcome, EvaluateOutcome, GateContext, PublishOutcome, ScoringActionSync } from '../registry/gate-context';
import { GateContexts } from '../registry/gate-seams';
import { LifecycleGate } from '../registry/lifecycle-gate';
import { ProviderTransactions } from '../registry/provider-transactions';
import { PublishNotifications } from '../registry/publish-notifications';
import { RegistryCheckInitiators } from '../registry/registry-check-initiators';
import type { RegistryContext } from '../registry/registry-context';
import { StoredRowReads } from '../registry/stored-row-reads';
import { StoredRuns } from '../registry/stored-publish-inputs';
import { PipelineAutoTrainer, type AutoTrainedRun, type AutoTrainTrainFn } from '../scoring/auto-train';
import { StorageProviderArtifactLoader } from '../scoring/storage-provider-artifact-loader';
import type { IArtifactLoader } from '../scoring/types';
import { TrainingInFlightError } from '../training/training-claims';
import { PreChangeArtifacts, type PreChangeArtifactOutcome } from './pre-change-artifacts';

/** The seams the migration runs through (production: {@link PreGateMigrationContexts.ForJobRun}'s defaults). */
export interface PreGateMigrationSeams {
  /** The lifecycle gate every status change goes through. */
  readonly Gate: LifecycleGate;
  /** The unattended publish of a re-evaluation's training run. */
  readonly Publisher: AutomatedPublisher;
  /** The D4-18 notifications of a demotion. */
  readonly Notifications: PublishNotifications;
  /** What artifact bytes are read through. */
  readonly ArtifactLoader: IArtifactLoader;
  /** What disables the per-model scoring Action of a non-serving `Unevaluated` model. */
  readonly ScoringActions: Pick<ScoringActionSync, 'DisableForModel'>;
  /** One single-flight training run of a pipeline under its bound protocol. */
  readonly Train: AutoTrainTrainFn;
  /** The task a Prediction Unit version declares (its `label.outcome`), or null when the row is gone or does not parse. */
  readonly UnitTask: (unitId: string, ctx: RegistryContext) => Promise<TaskType | null>;
}

/** What every step runs under: the job run's user and provider, the gate's seams, the job run and the migration's seams. */
export interface PreGateMigrationContext extends GateContext {
  /** The Registry Check job run the steps run as (every gate call's initiator). */
  readonly ScheduledJobRunID: string;
  readonly Seams: PreGateMigrationSeams;
}

/** The job's `Configuration.migration` (camelCase like the job's other configuration keys). */
export interface PreChangeMigrationConfig {
  /** Models visited per step per run (default 50). */
  readonly BatchSize: number;
  /** Pipelines retrained per run (default 3). */
  readonly RetrainPerRun: number;
}

/** What step 2 did in one run. */
export interface ReverifyResult {
  readonly Visited: number;
  /** Published models kept Published with an `adopt` record. */
  readonly Adopted: string[];
  /** Published models whose stored record did not re-verify, now `Unevaluated` and not serving. */
  readonly Demoted: { readonly ModelID: string; readonly Refusal: TransitionRefusal; readonly RolledBackTo: string | null }[];
  /** Draft models evaluated from their stored record, with the outcome's kind. */
  readonly Evaluated: { readonly ModelID: string; readonly Outcome: EvaluateOutcome['Kind'] }[];
  /** Models left as they were, retried on the next run (a transient refusal, or a failure). */
  readonly Retry: { readonly ModelID: string; readonly Reason: string }[];
}

/** What step 3 did in one run. */
export interface ArtifactMigrationResult {
  readonly Visited: number;
  /** Models whose `ArtifactStatus` this run changed. */
  readonly Changed: number;
  readonly Verified: string[];
  readonly LegacyLocal: string[];
  readonly Missing: string[];
  readonly HashMismatch: string[];
  /** Models whose storage could not be read, retried on the next run. */
  readonly Retry: { readonly ModelID: string; readonly Reason: string }[];
}

/** What step 4 did in one run. */
export interface ScheduleResult {
  /** Record Processes whose schedule was disabled (the list step 5 re-enables). */
  readonly Disabled: string[];
  /** Non-serving `Unevaluated` models whose scoring Action was disabled (a no-op for one already disabled). */
  readonly ScoringActionsDisabled: string[];
}

/** One pipeline's step-5 outcome in one run. */
export type ReEvaluationFinding =
  /** The pipeline names no Prediction Unit: nothing trains it and no unit is invented (retried once a unit is bound). */
  | { readonly PipelineID: string; readonly Kind: 'no-prediction-unit' }
  /** A Record Process declares `autoTrain` for the pipeline: its own runs retrain it (§5.6 step 4). */
  | { readonly PipelineID: string; readonly Kind: 'covered-by-auto-train' }
  /** The pipeline's last recorded attempt is newer than every change-detection column: not retrained. */
  | { readonly PipelineID: string; readonly Kind: 'unchanged-since-last-attempt'; readonly TrainingRunID: string }
  /** Another run is training the pipeline (the single-flight claim, §5.7 R2). */
  | { readonly PipelineID: string; readonly Kind: 'training-in-flight'; readonly InFlightRunID: string }
  /** Published through the gate; the listed Record Processes were repointed and re-enabled. */
  | { readonly PipelineID: string; readonly Kind: 'published'; readonly TrainingRunID: string; readonly ModelID: string; readonly ReEnabled: string[] }
  /** Trained and withheld (the gate's record says why). */
  | { readonly PipelineID: string; readonly Kind: 'withheld'; readonly TrainingRunID: string; readonly Reason: string }
  /** The training itself failed or was refused (retried next run). */
  | { readonly PipelineID: string; readonly Kind: 'training-failed'; readonly Reason: string }
  /** Past this run's `retrainPerRun`: retried next run. */
  | { readonly PipelineID: string; readonly Kind: 'deferred' };

/** What step 5 did in one run. */
export interface ReEvaluationResult {
  /** Training runs started. */
  readonly Trained: number;
  readonly Findings: ReEvaluationFinding[];
}

/** What one registry run of the migration did: the job run's `Details` under {@link PreGateModelMigration.DetailsKey}. */
export interface PreChangeStepDetails {
  readonly Reverified: ReverifyResult;
  readonly Artifacts: ArtifactMigrationResult;
  readonly Schedules: ScheduleResult;
  readonly ReEvaluation: ReEvaluationResult;
  /** The Record Processes this run disabled, read back by later runs' step 5 (D4-14). */
  readonly DisabledProcessIDs: string[];
}

/** The counts a dry run reports (nothing written). */
export interface PreChangeSurvey {
  /** Published or Draft models with a stored gate record still to re-verify. */
  readonly EvidenceBearing: number;
  /** Other pre-change models whose artifact is still `unverified`. */
  readonly UnverifiedArtifacts: number;
  /** Record Processes step 4 would disable. */
  readonly SchedulesToDisable: number;
  /** Pipelines without a Published model that hold an `Unevaluated` one. */
  readonly PipelinesToReEvaluate: number;
}

/** What one on-demand pass is asked to do (`PredictiveStudio.MigratePreGateModels`). */
export interface PreChangePassOptions {
  /** True: report the remaining work and write nothing. */
  readonly DryRun: boolean;
  /** The Registry Check job run a writing pass belongs to; null for none (a writing pass is then refused). */
  readonly ScheduledJobRunID: string | null;
  readonly Config: PreChangeMigrationConfig;
}

/** What one on-demand pass did: the remaining work before it, and for a writing pass what its steps did. */
export interface PreChangePassResult {
  readonly DryRun: boolean;
  readonly Survey: PreChangeSurvey;
  /** Null for a dry run, or when no pre-change work remained. */
  readonly Details: PreChangeStepDetails | null;
}

/** The newest publish-ledger row of a pipeline's training runs: its run and when it was recorded. */
interface PipelineAttempt {
  readonly TrainingRunID: string;
  readonly RecordedAt: Date;
}

/** The pipeline columns step 5 reads. */
type ReEvaluatedPipeline = Pick<MJMLTrainingPipelineEntity, 'ID' | 'PredictionUnitID' | 'EvaluationProtocolID' | 'TargetEntity' | 'TargetEntityID' | '__mj_UpdatedAt'>;

/** Builds the migration's context. */
export class PreGateMigrationContexts {
  /**
   * The production context for one Registry Check job run: the gate's production seams, and the migration's production
   * seams with any of `seams` replaced.
   */
  public static ForJobRun(ctx: RegistryContext, scheduledJobRunId: string, seams: Partial<PreGateMigrationSeams> = {}): PreGateMigrationContext {
    const gate = seams.Gate || new LifecycleGate();
    return {
      ...GateContexts.ForRequest(ctx),
      ScheduledJobRunID: scheduledJobRunId,
      Seams: {
        Gate: gate,
        Publisher: seams.Publisher || new AutomatedPublisher(gate),
        Notifications: seams.Notifications || new PublishNotifications(),
        ArtifactLoader: seams.ArtifactLoader || new StorageProviderArtifactLoader(),
        ScoringActions: seams.ScoringActions || new ModelScoringActionGenerator(),
        Train: seams.Train || PipelineAutoTrainer.TrainThroughEngine,
        UnitTask: seams.UnitTask || PreGateModelMigration.ReadUnitTask,
      },
    };
  }
}

/** The pre-change model migration's steps. */
export class PreGateModelMigration {
  /** The key of the job run's `Details` this migration's record sits under. */
  public static readonly DetailsKey = 'PreChangeModels';
  /** The `StatusReason` the data section gives a demoted model that does not serve (D4-13: the migration's mark). */
  public static readonly NotServingReason =
    'Trained before the Predictive Studio lifecycle gate; never evaluated under an Evaluation Protocol; the pipeline is retrained under its protocol automatically.';
  /** The `StatusReason` the data section gives the pre-change model that keeps serving its pipeline. */
  public static readonly ServingReason =
    'Trained before the Predictive Studio lifecycle gate and still serving; never evaluated under an Evaluation Protocol; replaced automatically when a model is published through the gate.';
  /** Record Changes rows read per keyset page by the change detection ({@link InputRowChangedAfter}). */
  public static readonly ChangePageSize = 500;
  /** The job configuration's defaults (D4-22). */
  public static readonly DefaultConfig: PreChangeMigrationConfig = { BatchSize: 50, RetrainPerRun: 3 };

  // ============================================================================================== composers ==

  /**
   * The registry job's step (g): nothing when no pre-change work remains ({@link HasPendingWork}); otherwise steps 2,
   * 3, 4 and 5 in that order, and what they did (the job run's `Details` under {@link DetailsKey}).
   */
  public static async RunRegistryStep(config: PreChangeMigrationConfig, ctx: PreGateMigrationContext): Promise<PreChangeStepDetails | null> {
    if (!(await PreGateModelMigration.HasPendingWork(ctx))) return null;
    const reverified = await PreGateModelMigration.ReverifyEvidenceBearing(config.BatchSize, ctx);
    const artifacts = await PreGateModelMigration.MigrateArtifacts(config.BatchSize, ctx);
    const schedules = await PreGateModelMigration.DisableDemotedSchedules(ctx);
    const reEvaluation = await PreGateModelMigration.ReEvaluate(config.RetrainPerRun, ctx, schedules.Disabled);
    return { Reverified: reverified, Artifacts: artifacts, Schedules: schedules, ReEvaluation: reEvaluation, DisabledProcessIDs: schedules.Disabled };
  }

  /**
   * §5.6 step 2 for at most `batch` models: each Published or Draft model with no `Delivery`, a stored training run and
   * an `unverified` artifact. A Published one goes through `LifecycleGate.AdoptPublished` with the back-fill
   * ({@link BackFillFromStoredRun}) inside its transaction: kept Published with an `adopt` record, or demoted with a
   * notification (D4-18) and the incumbent rolled back. A Draft one is back-filled in its own transaction (an artifact
   * that does not verify records its state and leaves it Draft) and then evaluated (`LifecycleGate.Evaluate`). A failure
   * is logged and the model retried on the next run.
   */
  public static async ReverifyEvidenceBearing(batch: number, ctx: PreGateMigrationContext): Promise<ReverifyResult> {
    const rows = await PreGateModelMigration.ReadEvidenceBearing(batch, ctx);
    const result: ReverifyResult = { Visited: rows.length, Adopted: [], Demoted: [], Evaluated: [], Retry: [] };
    for (const row of rows) {
      try {
        if (row.Status === 'Published') await PreGateModelMigration.AdoptOne(row.ID, result, ctx);
        else await PreGateModelMigration.EvaluateOne(row.ID, result, ctx);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        LogError(`Predictive Studio pre-change migration: re-verifying ML Model ${row.ID} failed; it is retried on the next run: ${reason}`);
        result.Retry.push({ ModelID: row.ID, Reason: reason });
      }
    }
    return result;
  }

  /**
   * §5.6 step 3 for at most `batch` models: every model with no `Delivery` and an `unverified` artifact that step 2 does
   * not own (no stored training run, or a status other than Published and Draft), checked and recorded once
   * ({@link PreChangeArtifacts.Migrate}). `legacy-local` and `missing` are final, so a second run visits none of them.
   */
  public static async MigrateArtifacts(batch: number, ctx: PreGateMigrationContext): Promise<ArtifactMigrationResult> {
    const models = await PreGateModelMigration.ReadUnverifiedLegacy(batch, ctx);
    const lists: Omit<ArtifactMigrationResult, 'Visited' | 'Changed'> = { Verified: [], LegacyLocal: [], Missing: [], HashMismatch: [], Retry: [] };
    let changed = 0;
    for (const model of models) {
      let outcome: PreChangeArtifactOutcome;
      try {
        outcome = await PreChangeArtifacts.Migrate(model, ctx, ctx.Seams.ArtifactLoader);
      } catch (error) {
        lists.Retry.push({ ModelID: model.ID, Reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      if (outcome.Kind === 'unchanged') continue;
      changed++;
      PreGateModelMigration.listOf(lists, outcome.ArtifactStatus)?.push(model.ID);
    }
    return { Visited: models.length, Changed: changed, ...lists };
  }

  /**
   * One pre-change model's artifact, checked and recorded ({@link PreChangeArtifacts.Migrate}); the scoring service
   * calls it for a `ServingWhileUnevaluated` model whose artifact is still `unverified` before it serves it.
   *
   * @throws Error when storage cannot be read, the store fails or the save fails
   */
  public static async MigrateArtifact(model: MJMLModelEntity, ctx: RegistryContext, loader: IArtifactLoader = new StorageProviderArtifactLoader()): Promise<PreChangeArtifactOutcome> {
    return PreChangeArtifacts.Migrate(model, ctx, loader);
  }

  /**
   * §5.6 step 4 (D4-14): the scoring Action of every non-serving `Unevaluated` model disabled, and every scheduled
   * `'ML Model'` Record Process without `autoTrain` whose configured model is a non-serving `Unevaluated` one has its
   * schedule disabled (its ID listed for step 5). A process whose model keeps serving, or one with `autoTrain`, keeps
   * its schedule.
   *
   * @throws Error when a read or a save fails
   */
  public static async DisableDemotedSchedules(ctx: PreGateMigrationContext): Promise<ScheduleResult> {
    const demoted = await PreGateModelMigration.ReadModels(`Status='Unevaluated' AND ServingWhileUnevaluated=0`, ctx);
    const actions: string[] = [];
    for (const model of demoted) {
      await ctx.Seams.ScoringActions.DisableForModel(model, ctx.ContextUser, ctx.Provider);
      actions.push(model.ID);
    }
    const disabled: string[] = [];
    const demotedIds = new UUIDSet(demoted.map((m) => m.ID));
    for (const rp of await PreGateModelMigration.ReadScoringProcesses(`ScheduleEnabled=1`, ctx)) {
      const config = PreGateModelMigration.configurationOf(rp);
      const modelId = JsonParse.JsonString(config, 'modelId');
      if (config['autoTrain'] !== undefined || modelId === null || !demotedIds.Has(modelId)) continue;
      rp.ScheduleEnabled = false;
      if (!(await rp.Save())) throw new Error(`Disabling the schedule of Record Process ${rp.ID} failed: ${rp.LatestResult?.CompleteMessage || 'unknown error'}`);
      disabled.push(rp.ID);
    }
    return { Disabled: disabled, ScoringActionsDisabled: actions };
  }

  /**
   * §5.6 step 5 (D4-22): each pipeline with an `Unevaluated` model and no Published one, oldest demotion first. A
   * pipeline with no Prediction Unit is recorded `no-prediction-unit` (nothing is invented for it); one an auto-train
   * process covers is left to it; one whose last recorded attempt is newer than its change-detection columns
   * ({@link ChangedSince}) is not retrained; the rest, at most `retrainPerRun`, train once through the single-flight
   * claim and publish through `AutomatedPublisher` as the job run. A publish repoints and re-enables the Record
   * Processes step 4 disabled for that pipeline (listed by earlier runs' `Details` and `disabledThisRun`).
   *
   * @param disabledThisRun the processes this run's step 4 disabled (not in any `Details` yet)
   */
  public static async ReEvaluate(retrainPerRun: number, ctx: PreGateMigrationContext, disabledThisRun: readonly string[] = []): Promise<ReEvaluationResult> {
    const pipelines = await PreGateModelMigration.PipelinesToReEvaluate(ctx);
    const covered = new UUIDSet(await PreGateModelMigration.AutoTrainedPipelines(ctx));
    const findings: ReEvaluationFinding[] = [];
    let trained = 0;
    for (const pipeline of pipelines) {
      if (!pipeline.PredictionUnitID) {
        findings.push({ PipelineID: pipeline.ID, Kind: 'no-prediction-unit' });
        continue;
      }
      if (covered.Has(pipeline.ID)) {
        findings.push({ PipelineID: pipeline.ID, Kind: 'covered-by-auto-train' });
        continue;
      }
      const attempt = await PreGateModelMigration.LastAttempt(pipeline.ID, ctx);
      if (attempt !== null && !(await PreGateModelMigration.ChangedSince(pipeline, attempt, ctx))) {
        findings.push({ PipelineID: pipeline.ID, Kind: 'unchanged-since-last-attempt', TrainingRunID: attempt.TrainingRunID });
        continue;
      }
      if (trained >= retrainPerRun) {
        findings.push({ PipelineID: pipeline.ID, Kind: 'deferred' });
        continue;
      }
      trained++;
      findings.push(await PreGateModelMigration.RetrainOne(pipeline.ID, disabledThisRun, ctx));
    }
    return { Trained: trained, Findings: findings };
  }

  /**
   * One pass on demand (`PredictiveStudio.MigratePreGateModels`): a dry run returns {@link Survey}'s counts and writes
   * nothing; a writing pass needs the Registry Check job run it belongs to (R9: every lifecycle change is that run's),
   * one that is running now or that the caller executed ({@link WritingRunRefusal}: a finished run of someone else is
   * never borrowed, so the record names who did the work), and then runs {@link RunRegistryStep} as that run, after the
   * same counts.
   *
   * @throws Error naming the run when a writing pass names no run of a Registry Check job, or a finished run the caller
   *   did not execute
   */
  public static async RunPass(options: PreChangePassOptions, ctx: RegistryContext, seams: Partial<PreGateMigrationSeams> = {}): Promise<PreChangePassResult> {
    const survey = await PreGateModelMigration.Survey(ctx);
    if (options.DryRun) return { DryRun: true, Survey: survey, Details: null };
    const runId = options.ScheduledJobRunID;
    const notRegistry = runId === null ? 'no scheduledJobRunId was given' : await RegistryCheckInitiators.RefusalOf({ kind: 'scheduled-job', scheduledJobRunId: runId }, ctx);
    const why = runId !== null && notRegistry === null ? await PreGateModelMigration.WritingRunRefusal(runId, ctx) : notRegistry;
    if (runId === null || why !== null) {
      throw new Error(`Predictive Studio pre-change migration: a writing pass runs only as a ${RegistryCheckInitiators.JobTypeName} job run (ruling R9); ${why}`);
    }
    const details = await PreGateModelMigration.RunRegistryStep(options.Config, PreGateMigrationContexts.ForJobRun(ctx, runId, seams));
    return { DryRun: false, Survey: survey, Details: details };
  }

  /**
   * Why a Registry Check run may not carry a writing pass, or null when it may: it is `Running`, or the caller executed
   * it (`ExecutedByUserID`). A finished run someone else executed is refused, in words naming its status.
   *
   * @throws Error when the read fails
   */
  protected static async WritingRunRefusal(runId: string, ctx: RegistryContext): Promise<string | null> {
    const r = await StoredRowReads.Run<Pick<MJScheduledJobRunEntity, 'ID' | 'Status' | 'ExecutedByUserID'>>(
      { EntityName: 'MJ: Scheduled Job Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, Fields: ['ID', 'Status', 'ExecutedByUserID'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading Scheduled Job Run ${runId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const run = r.Results.find((x) => UUIDsEqual(x.ID, runId));
    if (run === undefined) return `no Scheduled Job Run has the ID '${runId}'`;
    if (run.Status === 'Running' || UUIDsEqual(run.ExecutedByUserID, ctx.ContextUser.ID)) return null;
    return `run ${runId} is ${run.Status}, not Running, and was not executed by the caller`;
  }

  /**
   * The dry run's counts: what steps 2–5 would visit now. Nothing is written.
   *
   * @throws Error when a read fails
   */
  public static async Survey(ctx: RegistryContext): Promise<PreChangeSurvey> {
    const evidence = await PreGateModelMigration.ReadEvidenceBearing(Number.MAX_SAFE_INTEGER, ctx);
    const legacy = await PreGateModelMigration.ReadUnverifiedLegacy(Number.MAX_SAFE_INTEGER, ctx);
    const demoted = await PreGateModelMigration.ReadModels(`Status='Unevaluated' AND ServingWhileUnevaluated=0`, ctx);
    const demotedIds = new UUIDSet(demoted.map((m) => m.ID));
    const schedules = (await PreGateModelMigration.ReadScoringProcesses(`ScheduleEnabled=1`, ctx)).filter((rp) => {
      const config = PreGateModelMigration.configurationOf(rp);
      const modelId = JsonParse.JsonString(config, 'modelId');
      return config['autoTrain'] === undefined && modelId !== null && demotedIds.Has(modelId);
    });
    const pipelines = await PreGateModelMigration.PipelinesToReEvaluate(ctx);
    return { EvidenceBearing: evidence.length, UnverifiedArtifacts: legacy.length, SchedulesToDisable: schedules.length, PipelinesToReEvaluate: pipelines.length };
  }

  /**
   * True while pre-change work remains: a model with no `Delivery` whose artifact is still `unverified`, or a pipeline
   * with an `Unevaluated` model and no Published one.
   *
   * @throws Error when a read fails
   */
  public static async HasPendingWork(ctx: RegistryContext): Promise<boolean> {
    const unverified = await StoredRowReads.Run<Pick<MJMLModelEntity, 'ID'>>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `Delivery IS NULL AND ArtifactStatus='unverified'`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!unverified.Success) throw new Error(`Reading the unverified pre-change models failed: ${unverified.ErrorMessage || 'unknown error'}`);
    if (unverified.Results.length > 0) return true;
    return (await PreGateModelMigration.PipelinesToReEvaluate(ctx)).length > 0;
  }

  /** True when `status` and `reason` are the data section's mark (D4-13): `Unevaluated` with one of its two fixed reasons. Pure. */
  public static IsMigrationMark(status: MJMLModelEntity['Status'], reason: string | null): boolean {
    return status === 'Unevaluated' && (reason === PreGateModelMigration.NotServingReason || reason === PreGateModelMigration.ServingReason);
  }

  /** The job's `Configuration.migration` (`{ batchSize, retrainPerRun }`), each a positive integer, else its default. Pure. */
  public static ConfigFrom(migration: JsonObject | null): PreChangeMigrationConfig {
    const batch = migration === null ? null : JsonParse.JsonInteger(migration, 'batchSize');
    const retrain = migration === null ? null : JsonParse.JsonInteger(migration, 'retrainPerRun');
    return {
      BatchSize: batch !== null && batch > 0 ? batch : PreGateModelMigration.DefaultConfig.BatchSize,
      RetrainPerRun: retrain !== null && retrain >= 0 ? retrain : PreGateModelMigration.DefaultConfig.RetrainPerRun,
    };
  }

  /**
   * The production {@link PreGateMigrationSeams.UnitTask}: the unit version row read past the RunView cache and parsed;
   * its `label.outcome`. Null when the row is gone or does not parse.
   *
   * @throws Error when the read fails
   */
  public static async ReadUnitTask(unitId: string, ctx: RegistryContext): Promise<TaskType | null> {
    const row = await new RunViewPredictionUnitStore(ctx.Provider, ctx.ContextUser).Load(unitId);
    if (row === null) return null;
    const parsed = PredictionUnit.ParsePredictionUnitRow(row);
    return parsed.Ok ? parsed.Value.label.outcome : null;
  }

  // ======================================================================================== protected pieces ==

  /**
   * The back-fill of an evidence-bearing model's registry entry from its stored run (§5.6 step 2), exactly as the
   * trainer builds it (`createTrainerModelRow`): the delivery `Delivery.Create` gives over the run's stored gate decision,
   * trainer artifacts and the unit's task, registered with the artifact's stored file
   * ({@link PreChangeArtifacts.Check}, which stores local bytes write-once and requires the trainer's SHA-256); the
   * snapshot, its hashes and unit, the run's protocol and code version, and the output semantics. `Delivery` and
   * `ArtifactSha256` are first writes, authorised for this save. Returns the refusal that demotes the model when the
   * stored rows cannot give its entry (`not-servable`) or its artifact does not verify (`artifact-unverifiable`); null
   * after the save.
   *
   * @throws Error when storage cannot be read, a read fails or the save fails
   */
  protected static async BackFillFromStoredRun(model: MJMLModelEntity, ctx: PreGateMigrationContext): Promise<TransitionRefusal | null> {
    const notServable = (reason: string): TransitionRefusal => ({ kind: 'not-servable', reason: `ML Model ${model.ID}: ${reason}` });
    if (!model.TrainingRunID) return notServable('names no training run');
    const run = await StoredRuns.Read(model.TrainingRunID, ctx);
    if (run === null || run.Gate === null || run.Trainer === null) return notServable(`training run ${model.TrainingRunID} stores no gate record and trainer result`);
    const runRow = await PreGateModelMigration.ReadRunRow(model.TrainingRunID, ctx);
    const snapshot = runRow?.TrainingSnapshotID ? await PreGateModelMigration.ReadSnapshot(runRow.TrainingSnapshotID, ctx) : null;
    if (runRow === null || snapshot === null) return notServable(`training run ${model.TrainingRunID} names no Training Snapshot row`);
    const task = snapshot.PredictionUnitID ? await ctx.Seams.UnitTask(snapshot.PredictionUnitID, ctx) : null;
    if (task === null) return notServable(`Training Snapshot ${snapshot.ID} names no Prediction Unit whose task can be read`);
    const created = Delivery.Create(run.Gate.decision, run.Trainer.artifacts, task);
    if (created.Ok === false) return notServable(`the stored run's delivery is refused (${created.Error.Kind})`);
    const shipped = created.Delivery.View.artifact;
    if (shipped === null) return notServable('the stored gate decision ships no artifact');
    const check = await PreChangeArtifacts.Check(model, ctx, ctx.Seams.ArtifactLoader, shipped.sha256);
    if (check.Kind !== 'verified') return { kind: 'artifact-unverifiable', detail: PreChangeArtifacts.Describe(check) };
    const registered = RegisteredDelivery.Register(created.Delivery, check.File);
    if (registered.Ok === false) return { kind: 'artifact-unverifiable', detail: registered.Reason };
    const firstWrites = [...(model.Delivery ? [] : ['Delivery' as const]), ...(model.ArtifactSha256 ? [] : ['ArtifactSha256' as const])];
    model.ArtifactFileID = check.File.fileId;
    model.ArtifactSha256 = check.File.sha256;
    model.Delivery = JSON.stringify(registered.Registered.View);
    model.TrainingSnapshotID = snapshot.ID;
    model.SnapshotHash = snapshot.ContentHash;
    model.FeatureSchemaHash = snapshot.FeatureSchemaHash;
    model.PredictionUnitID = snapshot.PredictionUnitID;
    model.EvaluationProtocolID = runRow.EvaluationProtocolID || run.Gate.evaluationProtocolId;
    model.CodeVersion = model.CodeVersion || runRow.CodeVersion;
    model.OutputSemantics = JSON.stringify({ task });
    model.ArtifactStatus = 'verified';
    model.ArtifactCheckedAt = new Date();
    await PreChangeArtifacts.SaveAuthorised(model, firstWrites);
    return null;
  }

  /**
   * One Published evidence-bearing model through `AdoptPublished` with the back-fill; a demotion is notified (D4-18),
   * and so is the rollback it caused.
   */
  protected static async AdoptOne(modelId: string, result: ReverifyResult, ctx: PreGateMigrationContext): Promise<void> {
    const initiator = PreGateModelMigration.initiatorOf(ctx);
    const outcome: AdoptOutcome = await ctx.Seams.Gate.AdoptPublished(modelId, initiator, ctx, { BackFill: (m) => PreGateModelMigration.BackFillFromStoredRun(m, ctx) });
    switch (outcome.Kind) {
      case 'adopted':
      case 'already-adopted':
        result.Adopted.push(outcome.ModelID);
        return;
      case 'demoted': {
        const withheld: PublishOutcome = {
          Kind: 'withheld', Purpose: 'publish', ModelID: outcome.ModelID, Status: 'Unevaluated', Refusal: outcome.Refusal, Transient: false, RefusalRecordID: outcome.RefusalRecordID,
        };
        await ctx.Seams.Notifications.Notify(withheld, initiator, ctx);
        if (outcome.Rollback !== null) await ctx.Seams.Notifications.Notify(outcome.Rollback, initiator, ctx);
        const rolledBackTo = outcome.Rollback !== null && outcome.Rollback.Kind === 'published' ? outcome.Rollback.ModelID : null;
        result.Demoted.push({ ModelID: outcome.ModelID, Refusal: outcome.Refusal, RolledBackTo: rolledBackTo });
        return;
      }
      case 'refused':
        result.Retry.push({ ModelID: outcome.ModelID, Reason: `adoption refused (${outcome.Refusal.kind}${outcome.Transient ? ', transient' : ''})` });
        return;
      default: {
        const unhandled: never = outcome;
        throw new Error(`Predictive Studio pre-change migration: unknown adoption outcome ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /**
   * One Draft evidence-bearing model: back-filled in its own transaction (an artifact that does not verify records its
   * `ArtifactStatus`, so the model is not visited again, and it stays Draft), then evaluated from its stored record.
   */
  protected static async EvaluateOne(modelId: string, result: ReverifyResult, ctx: PreGateMigrationContext): Promise<void> {
    const refusal = await ProviderTransactions.Run(ctx, `the back-fill of ML Model ${modelId}`, async () => {
      const model = await PreGateModelMigration.ReadModel(modelId, ctx);
      return model === null ? ({ kind: 'model-not-found', modelId } satisfies TransitionRefusal) : PreGateModelMigration.BackFillFromStoredRun(model, ctx);
    }, (r) => r === null);
    if (refusal !== null) {
      await PreGateModelMigration.RecordBackFillRefusal(modelId, refusal, ctx);
      result.Evaluated.push({ ModelID: modelId, Outcome: 'refused' });
      return;
    }
    const outcome = await ctx.Seams.Gate.Evaluate({ modelId }, PreGateModelMigration.initiatorOf(ctx), ctx);
    result.Evaluated.push({ ModelID: modelId, Outcome: outcome.Kind });
  }

  /**
   * Records a Draft model's failed back-fill so step 2 does not visit it again: an artifact refusal's state
   * (`missing`, `legacy-local` or `hash-mismatch`, re-derived by one more check), any other refusal as `missing`
   * with the refusal in `StatusReason`.
   */
  protected static async RecordBackFillRefusal(modelId: string, refusal: TransitionRefusal, ctx: PreGateMigrationContext): Promise<void> {
    const model = await PreGateModelMigration.ReadModel(modelId, ctx);
    if (model === null) return;
    const check = refusal.kind === 'artifact-unverifiable' ? await PreChangeArtifacts.Check(model, ctx, ctx.Seams.ArtifactLoader, null) : null;
    model.ArtifactStatus = check !== null && check.Kind !== 'verified' ? PreChangeArtifacts.StatusOf(check) : 'missing';
    model.ArtifactCheckedAt = new Date();
    model.StatusReason = LifecycleGate.AdoptionRefusedReason(refusal);
    await PreChangeArtifacts.SaveAuthorised(model, []);
  }

  /**
   * One retrain of a pipeline through the single-flight training and `AutomatedPublisher` as the job run; a publish
   * repoints and re-enables the pipeline's disabled processes ({@link ReEnableProcesses}).
   */
  protected static async RetrainOne(pipelineId: string, disabledThisRun: readonly string[], ctx: PreGateMigrationContext): Promise<ReEvaluationFinding> {
    let run: AutoTrainedRun;
    try {
      run = await ctx.Seams.Train(pipelineId, ctx.Provider, ctx.ContextUser);
    } catch (error) {
      if (error instanceof TrainingInFlightError) return { PipelineID: pipelineId, Kind: 'training-in-flight', InFlightRunID: error.InFlightRunID };
      return { PipelineID: pipelineId, Kind: 'training-failed', Reason: error instanceof Error ? error.message : String(error) };
    }
    const outcome = await ctx.Seams.Publisher.EvaluateAndPublish(run.TrainingRunID, PreGateModelMigration.initiatorOf(ctx), ctx);
    if (outcome.Kind === 'published' || outcome.Kind === 'already-published') {
      const reEnabled = await PreGateModelMigration.ReEnableProcesses(pipelineId, outcome.ModelID, disabledThisRun, ctx);
      return { PipelineID: pipelineId, Kind: 'published', TrainingRunID: run.TrainingRunID, ModelID: outcome.ModelID, ReEnabled: reEnabled };
    }
    const refusal = outcome.Kind === 'withheld' || outcome.Kind === 'run-recorded' || outcome.Kind === 'refused' ? outcome.Refusal : null;
    return { PipelineID: pipelineId, Kind: 'withheld', TrainingRunID: run.TrainingRunID, Reason: refusal === null ? outcome.Kind : refusal.kind };
  }

  /**
   * After a re-evaluation published `modelId`: every Record Process step 4 disabled (an earlier run's `Details`, or this
   * run's) that still has its schedule disabled and is configured with a model of this pipeline is repointed at the new
   * model (`PipelineAutoTrainer.RepointedConfiguration`, auto-train's rule) and re-enabled. Returns their IDs.
   *
   * @throws Error when a read or a save fails
   */
  protected static async ReEnableProcesses(pipelineId: string, modelId: string, disabledThisRun: readonly string[], ctx: PreGateMigrationContext): Promise<string[]> {
    const listed = [...disabledThisRun, ...(await PreGateModelMigration.DisabledByEarlierRuns(ctx))].filter((id) => IsValidUUID(id));
    if (listed.length === 0) return [];
    const ids = listed.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
    const processes = await PreGateModelMigration.ReadScoringProcesses(`ID IN (${ids}) AND ScheduleEnabled=0`, ctx);
    const configured = processes.map((rp) => ({ Process: rp, ModelID: JsonParse.JsonString(PreGateModelMigration.configurationOf(rp), 'modelId') }));
    const modelIds = configured.map((c) => c.ModelID).filter((id): id is string => id !== null && IsValidUUID(id));
    const models = modelIds.length === 0 ? [] : await PreGateModelMigration.ReadModelColumns(`ID IN (${modelIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ')})`, ctx);
    const modelsById = IndexByUUID(models);
    const reEnabled: string[] = [];
    for (const { Process: rp, ModelID: configuredModel } of configured) {
      const model = configuredModel === null ? undefined : modelsById.Get(configuredModel);
      if (model === undefined || !UUIDsEqual(model.PipelineID, pipelineId)) continue;
      rp.Configuration = PipelineAutoTrainer.RepointedConfiguration(rp.Configuration, modelId);
      rp.ScheduleEnabled = true;
      if (!(await rp.Save())) throw new Error(`Re-enabling Record Process ${rp.ID} failed: ${rp.LatestResult?.CompleteMessage || 'unknown error'}`);
      reEnabled.push(rp.ID);
    }
    return reEnabled;
  }

  /**
   * The Record Processes earlier runs of this job disabled: `DisabledProcessIDs` under {@link DetailsKey} in the
   * `Details` of every run of the job the current run belongs to. A `Details` that is not JSON is skipped.
   *
   * @throws Error when a read fails
   */
  protected static async DisabledByEarlierRuns(ctx: PreGateMigrationContext): Promise<string[]> {
    const current = await StoredRowReads.Run<Pick<MJScheduledJobRunEntity, 'ID' | 'ScheduledJobID'>>(
      { EntityName: 'MJ: Scheduled Job Runs', ExtraFilter: `ID='${EscapeSQLString(ctx.ScheduledJobRunID)}'`, Fields: ['ID', 'ScheduledJobID'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!current.Success) throw new Error(`Reading Scheduled Job Run ${ctx.ScheduledJobRunID} failed: ${current.ErrorMessage || 'unknown error'}`);
    const jobId = current.Results[0]?.ScheduledJobID;
    if (!jobId) return [];
    const runs = await StoredRowReads.Run<Pick<MJScheduledJobRunEntity, 'ID' | 'Details'>>(
      { EntityName: 'MJ: Scheduled Job Runs', ExtraFilter: `ScheduledJobID='${EscapeSQLString(jobId)}'`, Fields: ['ID', 'Details'], ResultType: 'simple' },
      ctx,
    );
    if (!runs.Success) throw new Error(`Reading the runs of Scheduled Job ${jobId} failed: ${runs.ErrorMessage || 'unknown error'}`);
    return runs.Results.flatMap((r) => PreGateModelMigration.DisabledProcessIDsOf(r.Details));
  }

  /** The `DisabledProcessIDs` a job run's `Details` records under {@link DetailsKey}; [] for none or text that is not JSON. Pure. */
  public static DisabledProcessIDsOf(details: string | null): string[] {
    const parsed = JsonParse.ParseJsonText(details, 'Details');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return [];
    const record = parsed.Value[PreGateModelMigration.DetailsKey];
    return JsonParse.IsJsonObject(record) ? JsonParse.JsonStringArray(record, 'DisabledProcessIDs') || [] : [];
  }

  /**
   * The newest publish-ledger row (a `publish` or a `refusal`, run-level included) of the pipeline's training runs: the
   * pipeline's last attempt under the gate; null when it has none.
   *
   * @throws Error when the read fails
   */
  protected static async LastAttempt(pipelineId: string, ctx: RegistryContext): Promise<PipelineAttempt | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelPublishRecordEntity, 'ID' | 'TrainingRunID' | 'Kind' | 'RecordedAt'>>(
      {
        EntityName: 'MJ: ML Model Publish Records',
        ExtraFilter: `TrainingRunID IN (SELECT ID FROM [__mj].[vwMLTrainingRuns] WHERE PipelineID='${EscapeSQLString(pipelineId)}')`,
        OrderBy: 'RecordedAt DESC', Fields: ['ID', 'TrainingRunID', 'Kind', 'RecordedAt'], ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the publish records of pipeline ${pipelineId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const newest = r.Results.find((x) => (x.Kind === 'publish' || x.Kind === 'refusal') && x.TrainingRunID !== null);
    return newest && newest.TrainingRunID ? { TrainingRunID: newest.TrainingRunID, RecordedAt: new Date(newest.RecordedAt) } : null;
  }

  /**
   * True when one of the pipeline's change-detection inputs moved after its last attempt (D4-22, D4-211 as amended):
   * the pipeline row's `__mj_UpdatedAt`; its bound protocol version's ID against the protocol the attempt's run was
   * evaluated under; the newest `__mj_UpdatedAt` of its target entity's input `MJ: Feature Values` (`Source` `Pipeline`
   * or `Human`: a `Model` row is scoring's own prediction, never an input); and its target entity's rows. Scoring writes
   * back into the target rows only through a binding's `TargetColumn` ({@link CopiedColumns}), so for an entity with
   * such a column a row counts only through what changed in it ({@link InputRowChangedAfter}) or a row created after
   * the attempt; an entity with none counts its rows' newest `__mj_UpdatedAt`.
   *
   * @throws Error when a read fails
   */
  protected static async ChangedSince(pipeline: ReEvaluatedPipeline, attempt: PipelineAttempt, ctx: RegistryContext): Promise<boolean> {
    const after = (d: Date | null): boolean => d !== null && d.getTime() > attempt.RecordedAt.getTime();
    if (after(pipeline.__mj_UpdatedAt ? new Date(pipeline.__mj_UpdatedAt) : null)) return true;
    const run = await PreGateModelMigration.ReadRunRow(attempt.TrainingRunID, ctx);
    if (run !== null && pipeline.EvaluationProtocolID && !UUIDsEqual(run.EvaluationProtocolID, pipeline.EvaluationProtocolID)) return true;
    const entityId = pipeline.TargetEntityID;
    const inputValues = entityId ? `EntityID='${EscapeSQLString(entityId)}' AND Source IN ('Pipeline', 'Human')` : null;
    if (inputValues !== null && after(await PreGateModelMigration.NewestStamp('MJ: Feature Values', '__mj_UpdatedAt', inputValues, ctx))) return true;
    if (!pipeline.TargetEntity) return false;
    const copied = entityId ? await PreGateModelMigration.CopiedColumns(entityId, ctx) : new Set<string>();
    if (!entityId || copied.size === 0) return after(await PreGateModelMigration.NewestStamp(pipeline.TargetEntity, '__mj_UpdatedAt', '', ctx));
    if (after(await PreGateModelMigration.NewestStamp(pipeline.TargetEntity, '__mj_CreatedAt', '', ctx))) return true;
    return PreGateModelMigration.InputRowChangedAfter(entityId, copied, attempt.RecordedAt, ctx);
  }

  /**
   * The columns of the entity that scoring writes back into: the `TargetColumn` of every scoring binding of the entity,
   * whatever its status (a withdrawal clears its copies too), trimmed and lower-cased.
   *
   * @throws Error when the read fails
   */
  protected static async CopiedColumns(entityId: string, ctx: RegistryContext): Promise<Set<string>> {
    const r = await StoredRowReads.Run<Pick<MJMLModelScoringBindingEntity, 'TargetColumn'>>(
      { EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: `TargetEntityID='${EscapeSQLString(entityId)}' AND TargetColumn IS NOT NULL`, Fields: ['TargetColumn'], ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the scoring bindings of entity ${entityId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return new Set(r.Results.map((b) => (b.TargetColumn || '').trim().toLowerCase()).filter((c) => c.length > 0));
  }

  /**
   * True when a complete Record Changes row of the entity after `since` is an input change ({@link IsInputChange}):
   * read in keyset pages of {@link ChangePageSize}, stopping at the first one. An entity that does not track record
   * changes has no rows, so only its created rows ({@link ChangedSince}) count.
   *
   * @throws Error when a read fails
   */
  protected static async InputRowChangedAfter(entityId: string, copiedColumns: ReadonlySet<string>, since: Date, ctx: RegistryContext): Promise<boolean> {
    let afterKey: CompositeKey | undefined;
    for (;;) {
      const r = await StoredRowReads.Run<Pick<MJRecordChangeEntity, 'ID' | 'Type' | 'ChangesJSON'>>(
        {
          EntityName: 'MJ: Record Changes',
          ExtraFilter: `EntityID='${EscapeSQLString(entityId)}' AND Status='Complete' AND ChangedAt > '${since.toISOString()}'`,
          OrderBy: 'ID ASC', Fields: ['ID', 'Type', 'ChangesJSON'], MaxRows: PreGateModelMigration.ChangePageSize, ResultType: 'simple', ...(afterKey ? { AfterKey: afterKey } : {}),
        },
        ctx,
      );
      if (!r.Success) throw new Error(`Reading the record changes of entity ${entityId} failed: ${r.ErrorMessage || 'unknown error'}`);
      if (r.Results.some((c) => PreGateModelMigration.IsInputChange(c, copiedColumns))) return true;
      if (r.Results.length < PreGateModelMigration.ChangePageSize) return false;
      afterKey = CompositeKey.FromID(r.Results[r.Results.length - 1].ID); // 'MJ: Record Changes' is an MJ core entity keyed by ID
    }
  }

  /**
   * True when a Record Changes row changed a training input: a `Create` or a `Delete`, or an `Update` listing a field
   * that is not one of `copiedColumns` (scoring's write-backs), or whose `ChangesJSON` does not parse. A `Snapshot` (a
   * history baseline) changes nothing. Pure.
   */
  public static IsInputChange(change: Pick<MJRecordChangeEntity, 'Type' | 'ChangesJSON'>, copiedColumns: ReadonlySet<string>): boolean {
    if (change.Type === 'Snapshot') return false;
    if (change.Type !== 'Update') return true;
    const parsed = JsonParse.ParseJsonText(change.ChangesJSON, 'ChangesJSON');
    if (parsed.Ok === false || !JsonParse.IsJsonObject(parsed.Value)) return true;
    return Object.keys(parsed.Value).some((field) => !copiedColumns.has(field.trim().toLowerCase()));
  }

  /**
   * The pipelines step 5 considers: each with an `Unevaluated` model and no Published one, ordered by the oldest
   * `__mj_UpdatedAt` of its `Unevaluated` models (the oldest demotion first).
   *
   * @throws Error when a read fails
   */
  protected static async PipelinesToReEvaluate(ctx: RegistryContext): Promise<ReEvaluatedPipeline[]> {
    const unevaluated = await PreGateModelMigration.ReadModelColumns(`Status='Unevaluated'`, ctx);
    if (unevaluated.length === 0) return [];
    const pipelineIds = [...new Map(unevaluated.map((m) => [m.PipelineID.toLowerCase(), m.PipelineID])).values()];
    const inList = pipelineIds.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
    const published = await PreGateModelMigration.ReadModelColumns(`Status='Published' AND PipelineID IN (${inList})`, ctx);
    const r = await StoredRowReads.Run<ReEvaluatedPipeline>(
      {
        EntityName: 'MJ: ML Training Pipelines', ExtraFilter: `ID IN (${inList})`,
        Fields: ['ID', 'PredictionUnitID', 'EvaluationProtocolID', 'TargetEntity', 'TargetEntityID', '__mj_UpdatedAt'], ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the pipelines of Unevaluated models failed: ${r.ErrorMessage || 'unknown error'}`);
    const byPipeline = GroupByUUID(unevaluated, (m) => m.PipelineID);
    const demotedAt = (pipelineId: string): number => Math.min(...(byPipeline.Get(pipelineId) || []).map((m) => (m.__mj_UpdatedAt ? new Date(m.__mj_UpdatedAt).getTime() : 0)));
    return ExcludeByUUIDs(r.Results, published.map((m) => m.PipelineID))
      .sort((a, b) => demotedAt(a.ID) - demotedAt(b.ID));
  }

  /**
   * The pipelines an `'ML Model'` Record Process declares `autoTrain` for (`Configuration.autoTrain.pipelineId`).
   *
   * @throws Error when the read fails
   */
  protected static async AutoTrainedPipelines(ctx: RegistryContext): Promise<string[]> {
    const pipelines: string[] = [];
    for (const rp of await PreGateModelMigration.ReadScoringProcesses('', ctx)) {
      const autoTrain = PreGateModelMigration.configurationOf(rp)['autoTrain'];
      const pipelineId = JsonParse.IsJsonObject(autoTrain) ? JsonParse.JsonString(autoTrain, 'pipelineId') : null;
      if (pipelineId !== null) pipelines.push(pipelineId);
    }
    return pipelines;
  }

  // ================================================================================================ reads ==

  /** Step 2's models: Published or Draft, no `Delivery`, a stored training run, an `unverified` artifact; at most `batch`. */
  protected static async ReadEvidenceBearing(batch: number, ctx: RegistryContext): Promise<Pick<MJMLModelEntity, 'ID' | 'Status'>[]> {
    const r = await StoredRowReads.Run<Pick<MJMLModelEntity, 'ID' | 'Status'>>(
      {
        EntityName: 'MJ: ML Models', ExtraFilter: `Delivery IS NULL AND ArtifactStatus='unverified' AND TrainingRunID IS NOT NULL AND Status IN ('Published', 'Draft')`,
        OrderBy: 'Version ASC', Fields: ['ID', 'Status'], MaxRows: batch, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the pre-change models with a stored gate record failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results;
  }

  /**
   * Step 3's models, as entity objects: no `Delivery`, an `unverified` artifact, and either no stored training run or a
   * status step 2 does not own (`Unevaluated`, `Archived`); at most `batch`, one ID once.
   */
  protected static async ReadUnverifiedLegacy(batch: number, ctx: RegistryContext): Promise<MJMLModelEntity[]> {
    const legacy = await PreGateModelMigration.ReadModels(`Delivery IS NULL AND ArtifactStatus='unverified' AND TrainingRunID IS NULL`, ctx, batch);
    const rest = legacy.length >= batch ? [] : await PreGateModelMigration.ReadModels(
      `Delivery IS NULL AND ArtifactStatus='unverified' AND TrainingRunID IS NOT NULL AND Status IN ('Unevaluated', 'Archived')`, ctx, batch - legacy.length,
    );
    return [...legacy, ...ExcludeByUUIDs(rest, legacy.map((l) => l.ID))].slice(0, batch);
  }

  /** Model rows as entity objects (they are saved), oldest version first. */
  protected static async ReadModels(filter: string, ctx: RegistryContext, maxRows?: number): Promise<MJMLModelEntity[]> {
    const r = await StoredRowReads.Run<MJMLModelEntity>({ EntityName: 'MJ: ML Models', ExtraFilter: filter, OrderBy: 'Version ASC', MaxRows: maxRows, ResultType: 'entity_object' }, ctx);
    if (!r.Success) throw new Error(`Reading ML Models (${filter}) failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results;
  }

  /** One model row as an entity object, or null. */
  protected static async ReadModel(modelId: string, ctx: RegistryContext): Promise<MJMLModelEntity | null> {
    const rows = await PreGateModelMigration.ReadModels(`ID='${EscapeSQLString(modelId)}'`, ctx, 1);
    return rows.find((m) => UUIDsEqual(m.ID, modelId)) || null;
  }

  /** The model columns step 5 reads. */
  protected static async ReadModelColumns(filter: string, ctx: RegistryContext): Promise<Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Status' | '__mj_UpdatedAt'>[]> {
    const r = await StoredRowReads.Run<Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Status' | '__mj_UpdatedAt'>>(
      { EntityName: 'MJ: ML Models', ExtraFilter: filter, Fields: ['ID', 'PipelineID', 'Status', '__mj_UpdatedAt'], ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading ML Models (${filter}) failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results;
  }

  /** The `'ML Model'` Record Processes matching `filter` (all of them for an empty one), as entity objects. */
  protected static async ReadScoringProcesses(filter: string, ctx: RegistryContext): Promise<MJRecordProcessEntity[]> {
    const where = filter.length > 0 ? `WorkType='ML Model' AND ${filter}` : `WorkType='ML Model'`;
    const r = await StoredRowReads.Run<MJRecordProcessEntity>({ EntityName: 'MJ: Record Processes', ExtraFilter: where, ResultType: 'entity_object' }, ctx);
    if (!r.Success) throw new Error(`Reading the ML Model Record Processes failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results;
  }

  /** The run columns the back-fill and the change detection read; null when no run has the ID. */
  protected static async ReadRunRow(trainingRunId: string, ctx: RegistryContext): Promise<Pick<MJMLTrainingRunEntity, 'ID' | 'TrainingSnapshotID' | 'EvaluationProtocolID' | 'CodeVersion'> | null> {
    const r = await StoredRowReads.Run<Pick<MJMLTrainingRunEntity, 'ID' | 'TrainingSnapshotID' | 'EvaluationProtocolID' | 'CodeVersion'>>(
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(trainingRunId)}'`, Fields: ['ID', 'TrainingSnapshotID', 'EvaluationProtocolID', 'CodeVersion'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading ML Training Run ${trainingRunId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results.find((x) => UUIDsEqual(x.ID, trainingRunId)) || null;
  }

  /** The snapshot columns the back-fill copies; null when no snapshot has the ID. */
  protected static async ReadSnapshot(snapshotId: string, ctx: RegistryContext): Promise<Pick<MJMLTrainingSnapshotEntity, 'ID' | 'ContentHash' | 'FeatureSchemaHash' | 'PredictionUnitID'> | null> {
    const r = await StoredRowReads.Run<Pick<MJMLTrainingSnapshotEntity, 'ID' | 'ContentHash' | 'FeatureSchemaHash' | 'PredictionUnitID'>>(
      { EntityName: 'MJ: ML Training Snapshots', ExtraFilter: `ID='${EscapeSQLString(snapshotId)}'`, Fields: ['ID', 'ContentHash', 'FeatureSchemaHash', 'PredictionUnitID'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading Training Snapshot ${snapshotId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results.find((x) => UUIDsEqual(x.ID, snapshotId)) || null;
  }

  /** The newest `column` stamp of `entityName`'s rows matching `filter`; null for none. */
  protected static async NewestStamp(entityName: string, column: '__mj_UpdatedAt' | '__mj_CreatedAt', filter: string, ctx: RegistryContext): Promise<Date | null> {
    const r = await StoredRowReads.Run<Readonly<Record<typeof column, Date | string | null>>>(
      { EntityName: entityName, ExtraFilter: filter, OrderBy: `${column} DESC`, Fields: [column], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Reading the newest ${column} of ${entityName} failed: ${r.ErrorMessage || 'unknown error'}`);
    const value = r.Results[0]?.[column];
    return value ? new Date(value) : null;
  }

  // ================================================================================================ private ==

  /** The job run as the initiator of every gate call. */
  private static initiatorOf(ctx: PreGateMigrationContext): Actor {
    return { kind: 'scheduled-job', scheduledJobRunId: ctx.ScheduledJobRunID };
  }

  /** A Record Process `Configuration` as an object ({} when it is empty, not JSON, or not an object). */
  private static configurationOf(rp: Pick<MJRecordProcessEntity, 'Configuration'>): JsonObject {
    const parsed = JsonParse.ParseJsonText(rp.Configuration, 'Configuration');
    return parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? parsed.Value : {};
  }

  /** The result list a recorded artifact state belongs in. */
  private static listOf(result: Omit<ArtifactMigrationResult, 'Visited' | 'Changed'>, status: MJMLModelEntity['ArtifactStatus']): string[] | null {
    switch (status) {
      case 'verified': return result.Verified;
      case 'legacy-local': return result.LegacyLocal;
      case 'missing': return result.Missing;
      case 'hash-mismatch': return result.HashMismatch;
      default: return null;
    }
  }
}
