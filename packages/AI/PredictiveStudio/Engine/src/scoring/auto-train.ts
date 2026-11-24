/**
 * @module scoring/auto-train
 *
 * **Train-if-untrained** for scoring Record Processes that opt in via
 * `Configuration.autoTrain` (see {@link MLAutoTrainConfig}).
 *
 * ## Why
 * A trained model artifact is per-host (its bytes live on the server that trained
 * it) and training always creates a NEW immutable `MJ: ML Models` row. An app that
 * ships a scoring process therefore cannot ship a usable model: on a fresh install
 * the model must be trained *there*. Without help, the process points at a model
 * that has no artifact and every run fails.
 *
 * ## What
 * {@link PipelineAutoTrainer} is the production {@link IModelAutoTrainer}. When a run finds its model needs training
 * (never trained, its artifact lost, or not Published) it serves the pipeline's Published model, in this order:
 *
 * | Step | Reads | Outcome |
 * |---|---|---|
 * | 1. reuse | the pipeline's Published models, newest first, through the artifact registry | the first whose artifact `/predict` serves and whose load is `verified` |
 * | 2. resume ({@link PipelineAutoTrainer.ResumeTransientRefusal}) | the newest Draft, Validated or KeepBaseline model; its latest publish record; that record's Process Run | a transient refusal from this Record Process is published again through {@link AutomatedPublisher} (D4-131), without retraining |
 * | 3. retry window ({@link PipelineAutoTrainer.WithinRetryWindow}) | the newest non-transient refusal of the pipeline's runs | younger than `retryAfterHours` (24): not retrained; the run fails naming the refusal and when training resumes |
 * | 4. train ({@link PipelineAutoTrainer.TrainAndPublish}) | the single-flight claim (D4-12), then the training engine | the run evaluated and published through {@link AutomatedPublisher.EvaluateAndPublish} |
 *
 * A publish that does not happen fails the Process Run with the recorded refusal (§5.7 R4) unless a Published model of
 * the pipeline is left to score with, which then scores and the withheld outcome is logged. The process is then
 * repointed at the served model; its scoring bindings name the pipeline, so they follow it unchanged. The publish archives a superseded model of the same pipeline in its
 * own transaction; a superseded model of another pipeline is never archived (it may still serve another process,
 * D4-12) and is named in the log instead. The gate decides every publish: a kept baseline, a flagged run or a caller
 * without the publish grants is withheld and recorded by the gate, never pre-judged here (D4-99).
 *
 * Nothing here runs unless a Record Process declares `autoTrain` — other apps and
 * processes keep the plain "needs training" refusal.
 */

import { LogError, LogStatus, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLModelPublishRecordEntity, MJMLModelScoringBindingEntity, MJMLTrainingRunEntity, MJProcessRunEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import { JsonParse, type Actor, type JsonObject } from '@memberjunction/predictive-studio-core';

import { TrainingDelegation } from '../operations/delegation';
import { AutomatedPublisher } from '../registry/automated-publisher';
import { LifecycleGate } from '../registry/lifecycle-gate';
import { GateContexts } from '../registry/gate-seams';
import { GateRefusals } from '../registry/gate-refusals';
import type { EvaluateOutcome, GateContext, PublishOutcome } from '../registry/gate-context';
import { PublishNotifications } from '../registry/publish-notifications';
import { SYSTEM_CLOCK, type GateClock } from '../registry/publish-locks';
import { StoredRowReads } from '../registry/stored-row-reads';
import { MetadataEntityFactory } from '../training/seams';
import { TrainingInFlightError } from '../training/training-claims';
import { ArtifactRegistry, type IArtifactRegistry } from '../registry/artifact-registry';
import type { RegistryContext } from '../registry/registry-context';
import { StorageProviderArtifactLoader } from './storage-provider-artifact-loader';
import { ScoringBindings } from './scoring-binding';
import { ModelHasTrainedArtifact, ModelReadiness } from './model-readiness';
import type { AutoTrainRequest, IModelAutoTrainer } from './types';

/** What the train step trained: its run, and the model row it shipped (null when the gate decision shipped none). */
export interface AutoTrainedRun {
  /** The `MJ: ML Training Runs` row the training wrote. */
  readonly TrainingRunID: string;
  /** Its `Draft` model, or null for a run whose decision shipped no artifact (no-signal, or a kept rule). */
  readonly ModelID: string | null;
}

/**
 * Signature of the train step (production: {@link PipelineAutoTrainer.TrainThroughEngine}, a single-flight training);
 * injectable for tests.
 *
 * @throws TrainingInFlightError when another run of the pipeline is in flight (no run row was written)
 */
export type AutoTrainTrainFn = (pipelineId: string, provider: IMetadataProvider, user: UserInfo) => Promise<AutoTrainedRun>;

/**
 * Auto-train did not serve a model and no Published model of the pipeline is left to score with (§5.7 R4): the publish
 * was withheld, the run stopped at Evaluate, the retry window holds the pipeline, or another training is in flight. The
 * message names the recorded refusal (or the in-flight run); the Process Run fails with it.
 */
export class AutoTrainWithheldError extends Error {
  /**
   * @param message the Process Run's `ErrorMessage`
   * @param TrainingRunID the run the refusal (or the in-flight training) belongs to
   * @param ModelID the withheld model, or null for a run-level outcome
   */
  constructor(message: string, public readonly TrainingRunID: string, public readonly ModelID: string | null) {
    super(message);
    this.name = 'AutoTrainWithheldError';
  }
}

/** The newest non-transient refusal of a pipeline's runs, and when the retry window it opens ends. */
export interface RetryWindowHold {
  /** The refusal record's training run. */
  readonly TrainingRunID: string;
  /** Its model, or null for a run-level record. */
  readonly ModelID: string | null;
  /** The refusal's plain words (the record's `Reason`). */
  readonly Reason: string;
  /** When it was recorded. */
  readonly RecordedAt: Date;
  /** When auto-train may train the pipeline again: `RecordedAt` plus `retryAfterHours`. */
  readonly ResumesAt: Date;
}

/** Optional seams for {@link PipelineAutoTrainer} (all default to production implementations). */
export interface PipelineAutoTrainerOptions {
  /** Trains the pipeline (single-flight) and returns its run and model. */
  train?: AutoTrainTrainFn;
  /** The lifecycle gate every automatic Evaluate and Publish runs through. */
  gate?: LifecycleGate;
  /**
   * The artifact registry a reusable model's artifact is loaded and verified through. Optional because a registry is
   * built for one request's provider and user and the production auto-trainer is built once at startup with neither;
   * when absent, each lookup builds `ArtifactRegistry.ForContext` over a `StorageProviderArtifactLoader` for its call.
   */
  registry?: IArtifactRegistry;
  /** The clock the retry window and the notification day are read on (PR 3's `TrainingDeps.now` seam); default the current time. */
  now?: () => Date;  // case-violation-ok-legacy-back-compat: cased like the existing options (train, gate, registry) and PR 3's TrainingDeps.now seam
}

/**
 * Production {@link IModelAutoTrainer}: reuse, resume, retry window, train and publish, repoint.
 */
export class PipelineAutoTrainer implements IModelAutoTrainer {
  /** The retry window after a non-transient refusal when the process declares none (§5.7 R1). */
  public static readonly DEFAULT_RETRY_AFTER_HOURS = 24;

  private readonly train: AutoTrainTrainFn;
  private readonly gate: LifecycleGate;
  private readonly registry: IArtifactRegistry | null;
  private readonly now: () => Date;

  constructor(options: PipelineAutoTrainerOptions = {}) {
    this.train = options.train || PipelineAutoTrainer.TrainThroughEngine;
    this.gate = options.gate || new LifecycleGate();
    this.registry = options.registry || null;
    this.now = options.now || (() => new Date());
  }

  /**
   * The production train step: a single-flight training of the pipeline through the training engine.
   *
   * @throws TrainingInFlightError when another run of the pipeline is in flight
   */
  public static async TrainThroughEngine(pipelineId: string, provider: IMetadataProvider, user: UserInfo): Promise<AutoTrainedRun> {
    const result = await TrainingDelegation.TrainModelViaEngine({ pipelineId, SingleFlight: true }, provider, user);
    return { TrainingRunID: result.run.ID, ModelID: result.model ? result.model.ID : null };
  }

  /**
   * The auto-train initiator of a request (`{ kind: 'system', component: 'auto-train', processRunId }`); without a
   * valid Process Run ID the initiator names none (nobody is notified). Pure.
   */
  public static InitiatorOf(request: AutoTrainRequest): Actor {
    return request.processRunId && IsValidUUID(request.processRunId)
      ? { kind: 'system', component: 'auto-train', processRunId: request.processRunId }
      : { kind: 'system', component: 'auto-train' };
  }

  /** The request's retry window in hours: a finite, non-negative `retryAfterHours`, else the default 24. Pure. */
  public static RetryAfterHoursOf(request: AutoTrainRequest): number {
    const hours = request.retryAfterHours;
    return typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 ? hours : PipelineAutoTrainer.DEFAULT_RETRY_AFTER_HOURS;
  }

  /** @inheritdoc */
  public async EnsureTrainedModel(request: AutoTrainRequest, contextUser: UserInfo, provider: IMetadataProvider): Promise<string> {
    if (!IsValidUUID(request.pipelineId)) {
      throw new Error(`Auto-train: '${request.pipelineId}' is not a valid ML Training Pipeline id.`);
    }
    const ctx = GateContexts.ForRequest({ ContextUser: contextUser, Provider: provider });
    const pipelineId = request.pipelineId;
    const reused = await this.findReusableModel(pipelineId, contextUser, provider);
    if (reused !== null) return this.serve(request, reused, 'reused', ctx);
    const resumed = await this.ResumeTransientRefusal(pipelineId, request, ctx);
    if (resumed !== null) return this.serve(request, resumed, 'resumed a transiently withheld publish of', ctx);
    const hold = await this.WithinRetryWindow(pipelineId, PipelineAutoTrainer.RetryAfterHoursOf(request), ctx);
    if (hold !== null) throw this.retryWindowError(pipelineId, request, hold);
    const trained = await this.TrainAndPublish(pipelineId, request, ctx);
    return this.serve(request, trained, 'trained + published (or kept serving)', ctx);
  }

  // ----- reuse --------------------------------------------------------------

  /**
   * The newest Published model of the pipeline whose artifact `/predict` serves and whose artifact load is `verified`,
   * if any (a forecast's series forecaster published before the gate refused one is skipped, and so is a model whose
   * artifact is missing, changed or unregistered). Validated, KeepBaseline, Archived and Unevaluated models are never
   * reused. The read goes past the RunView cache ({@link StoredRowReads}): a model deleted or demoted by anything other
   * than an entity save on this server (`spDeleteEntityWithCoreDependencies`, another server) is never reused from a
   * stale copy (M4b.6 cell (c)). A failed read reuses nothing.
   */
  protected async findReusableModel(pipelineId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | null> {
    const ctx: RegistryContext = { ContextUser: contextUser, Provider: provider };
    const result = await StoredRowReads.Run<Pick<MJMLModelEntity, 'ID' | 'ArtifactFileID' | 'ArtifactSha256' | 'Lineage'>>(
      {
        EntityName: 'MJ: ML Models',
        ExtraFilter: `PipelineID='${EscapeSQLString(pipelineId)}' AND Status='Published' AND ArtifactFileID IS NOT NULL`,
        OrderBy: 'Version DESC',
        Fields: ['ID', 'ArtifactFileID', 'ArtifactSha256', 'Lineage'],
        ResultType: 'simple',
        MaxRows: 5,
      },
      ctx,
    );
    if (!result.Success) {
      return null;
    }
    const registry = this.registry || ArtifactRegistry.ForContext(ctx, new StorageProviderArtifactLoader());
    for (const row of result.Results) {
      const servable = ModelHasTrainedArtifact(row) && ModelReadiness.IsServedByPredict(row);
      if (servable && (await registry.Load(row, ctx)).Status === 'verified') {
        return row.ID;
      }
    }
    return null;
  }

  // ----- resume -------------------------------------------------------------

  /**
   * Resumes instead of retraining (§5.7 R1): when the pipeline's newest resumable model's (Draft — a transient Evaluate
   * refusal of a publish attempt, D4-143 —, or Validated or KeepBaseline — a transient Publish refusal, D4-131) latest
   * publish record is a
   * `refusal` with `Transient = 1` started by a Process Run of this Record Process, its run goes through
   * {@link AutomatedPublisher.EvaluateAndPublish} again, which resumes at the publish (D4-131). Returns the served model
   * ({@link ServedModelOf}); null when there is nothing to resume (no Record Process, no resumable model, a latest record
   * that is not a transient refusal, or one from another process).
   *
   * @throws AutoTrainWithheldError when the resumed publish is withheld again and no Published model is left
   * @throws Error when a stored row cannot be read
   */
  protected async ResumeTransientRefusal(pipelineId: string, request: AutoTrainRequest, ctx: GateContext): Promise<string | null> {
    const recordProcessId = request.recordProcessId;
    if (recordProcessId === null || !IsValidUUID(recordProcessId)) return null;
    const model = await this.readNewestResumable(pipelineId, ctx);
    if (model === null || model.TrainingRunID === null) return null;
    const record = await this.readLatestRecord(model.ID, ctx);
    if (record === null || record.Kind !== 'refusal' || record.Transient !== true) return null;
    const initiator = record.InitiatorObject;
    if (initiator.kind !== 'system' || !initiator.processRunId) return null;
    if (!(await this.isRunOfRecordProcess(initiator.processRunId, recordProcessId, ctx))) return null;
    const outcome = await this.PublisherFor(request).EvaluateAndPublish(model.TrainingRunID, PipelineAutoTrainer.InitiatorOf(request), ctx);
    return this.ServedModelOf(outcome, model.TrainingRunID, pipelineId, ctx);
  }

  // ----- retry window -------------------------------------------------------

  /**
   * The retry window (§5.7 R1): the newest non-transient `refusal` record of the pipeline's runs (any `Purpose`), read
   * by `TrainingRunID` in one bounded query (the runs are a subquery, {@link runsOfPipelineSQL}) so a run-level outcome (`gate-no-signal`, a kept rule) counts as much as a withheld publish
   * (D4-56), when it was recorded less than `retryAfterHours` ago; null when there is none (or the window is 0).
   *
   * @throws Error when a stored row cannot be read
   */
  protected async WithinRetryWindow(pipelineId: string, retryAfterHours: number, ctx: GateContext): Promise<RetryWindowHold | null> {
    if (retryAfterHours <= 0) return null;
    const r = await StoredRowReads.Run<Pick<MJMLModelPublishRecordEntity, 'ID' | 'ModelID' | 'TrainingRunID' | 'Reason' | 'RecordedAt'>>(
      {
        EntityName: 'MJ: ML Model Publish Records',
        ExtraFilter: `TrainingRunID IN (${PipelineAutoTrainer.runsOfPipelineSQL(pipelineId, ctx)}) AND Kind='refusal' AND Transient=0`,
        OrderBy: 'RecordedAt DESC', Fields: ['ID', 'ModelID', 'TrainingRunID', 'Reason', 'RecordedAt'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Auto-train: reading the refusals of pipeline ${pipelineId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    if (!row || row.TrainingRunID === null) return null;
    const recordedAt = new Date(row.RecordedAt);
    const resumesAt = new Date(recordedAt.getTime() + retryAfterHours * 3_600_000);
    if (resumesAt.getTime() <= this.now().getTime()) return null;
    return { TrainingRunID: row.TrainingRunID, ModelID: row.ModelID, Reason: row.Reason || 'no reason recorded', RecordedAt: recordedAt, ResumesAt: resumesAt };
  }

  // ----- train + publish ----------------------------------------------------

  /**
   * Trains the pipeline (single-flight) and publishes its run through {@link AutomatedPublisher.EvaluateAndPublish}
   * with the auto-train initiator. When another training of the pipeline is in flight, the pipeline's Published model
   * is served when there is one; otherwise the run fails naming the in-flight run (§5.7 R2).
   *
   * @throws AutoTrainWithheldError when the publish is withheld, or training is in flight, and no Published model is left
   */
  protected async TrainAndPublish(pipelineId: string, request: AutoTrainRequest, ctx: GateContext): Promise<string> {
    let trained: AutoTrainedRun;
    try {
      trained = await this.train(pipelineId, ctx.Provider, ctx.ContextUser);
    } catch (error) {
      if (error instanceof TrainingInFlightError) return this.servedWhileInFlight(pipelineId, error, ctx);
      throw error;
    }
    const outcome = await this.PublisherFor(request).EvaluateAndPublish(trained.TrainingRunID, PipelineAutoTrainer.InitiatorOf(request), ctx);
    return this.ServedModelOf(outcome, trained.TrainingRunID, pipelineId, ctx);
  }

  /**
   * The automated publisher of one request: the trainer's gate, and notifications that send withheld outcomes unless
   * the process set `notifyOnWithheld: false` (§5.7 R4 (d)).
   */
  protected PublisherFor(request: AutoTrainRequest): AutomatedPublisher {
    const clock: GateClock = { Now: () => this.now().getTime(), Sleep: SYSTEM_CLOCK.Sleep };
    return new AutomatedPublisher(this.gate, new PublishNotifications(clock, { NotifyWithheld: request.notifyOnWithheld !== false }));
  }

  /**
   * The model an automatic attempt leaves to score with (§5.7 R4): the published model (`published`,
   * `already-published`); otherwise the pipeline's reusable Published model, with the withheld outcome logged.
   *
   * @throws AutoTrainWithheldError naming the refusal when no Published model is left ({@link WithheldErrorOf})
   */
  protected async ServedModelOf(outcome: PublishOutcome | EvaluateOutcome, trainingRunId: string, pipelineId: string, ctx: GateContext): Promise<string> {
    if (outcome.Kind === 'published' || outcome.Kind === 'already-published') return outcome.ModelID;
    const withheld = await this.WithheldErrorOf(outcome, trainingRunId, ctx);
    const current = await this.findReusableModel(pipelineId, ctx.ContextUser, ctx.Provider);
    if (current === null) throw withheld;
    LogStatus(`Predictive Studio auto-train: ${withheld.message} The pipeline's Published model '${current}' keeps serving.`);
    return current;
  }

  /**
   * The R4 error of an attempt that published nothing. A withheld publish, or a model-level Evaluate refusal of a run
   * that has a model row (its `ResultingModelID`: a calibration hold, `not-servable`, …), is worded for that model:
   * "Auto-train trained model <id> v<n>; publish withheld: <reason>". A run with no model row (Evaluate recorded it at
   * run level) is worded for the run: "Auto-train run <id>; evaluation withheld: <reason> (publish withheld: …)".
   *
   * @throws Error when the run or the model cannot be read
   */
  protected async WithheldErrorOf(
    outcome: Exclude<PublishOutcome | EvaluateOutcome, { readonly Kind: 'published' | 'already-published' }>, trainingRunId: string, ctx: GateContext,
  ): Promise<AutoTrainWithheldError> {
    if (outcome.Kind === 'withheld') return this.modelWithheldError(outcome.ModelID, GateRefusals.Describe(outcome.Refusal), trainingRunId, ctx);
    if (outcome.Kind === 'evaluated') return new AutoTrainWithheldError(PipelineAutoTrainer.RunWithheldMessage(trainingRunId, `evaluated to ${outcome.To}`), trainingRunId, null);
    const modelId = outcome.Kind === 'refused' ? await this.readResultingModelId(trainingRunId, ctx) : null;
    if (modelId !== null) return this.modelWithheldError(modelId, GateRefusals.Describe(outcome.Refusal), trainingRunId, ctx);
    return new AutoTrainWithheldError(PipelineAutoTrainer.RunWithheldMessage(trainingRunId, GateRefusals.Describe(outcome.Refusal)), trainingRunId, null);
  }

  /** The R4 message of a run that left no model to publish (Evaluate stopped it). Pure. */
  public static RunWithheldMessage(trainingRunId: string, reason: string): string {
    return `Auto-train run ${trainingRunId}; evaluation withheld: ${reason} (publish withheld: the run has no model to publish).`;
  }

  // ----- repoint ------------------------------------------------------------

  /**
   * Point the Record Process (its `Configuration.modelId`) at the trained model. Scoring bindings name the pipeline,
   * not a model version, so they need no repoint; when the process declares a binding (`autoTrain.binding`), it is
   * created on the process's entity, or updated when the pipeline already binds that feature there.
   * The process row is read past the RunView cache. A Record Process the request names that no longer exists (deleted
   * between training and repoint, M4b.6 cell (d)) is not written to, and the run fails naming the process
   * ({@link RecordProcessGoneMessage}); the publish that committed before stands, and the next process on the pipeline
   * serves that model without training.
   *
   * @throws Error when the named Record Process no longer exists, cannot be read, or its save or its binding's fails
   */
  protected async repoint(request: AutoTrainRequest, modelId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
    const ctx: RegistryContext = { ContextUser: contextUser, Provider: provider };
    const recordProcessId = request.recordProcessId;
    if (recordProcessId === null || !IsValidUUID(recordProcessId)) return;
    const rp = await this.readRecordProcess(recordProcessId, ctx);
    if (rp === null) throw new Error(PipelineAutoTrainer.RecordProcessGoneMessage(recordProcessId, modelId, request.pipelineId));
    rp.Configuration = PipelineAutoTrainer.RepointedConfiguration(rp.Configuration, modelId);
    if (!(await rp.Save())) {
      throw new Error(`Auto-train: failed to repoint Record Process '${rp.ID}': ${rp.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
    if (request.binding) await this.ensureDeclaredBinding(request, request.binding, rp, ctx);
  }

  /**
   * A Record Process `Configuration` repointed at `modelId`: every other key kept, `modelId` replaced (an empty or
   * malformed configuration becomes `{ modelId }`). The one repoint rule, shared with the pre-change re-evaluation's
   * re-enable of a process (§5.6 step 5). Pure.
   */
  public static RepointedConfiguration(raw: string | null, modelId: string): string {
    const parsed = JsonParse.ParseJsonText(raw, 'Configuration');
    const config: JsonObject = parsed.Ok && JsonParse.IsJsonObject(parsed.Value) ? parsed.Value : {};
    return JSON.stringify({ ...config, modelId });
  }

  /** The error of a repoint whose Record Process no longer exists (the run fails loudly; nothing is written to it). Pure. */
  public static RecordProcessGoneMessage(recordProcessId: string, modelId: string, pipelineId: string): string {
    return `Auto-train: Record Process '${recordProcessId}' no longer exists, so it was not repointed at ML Model '${modelId}'; ` +
      `a process that runs next on pipeline '${pipelineId}' serves that model without training.`;
  }

  /** Creates the process's declared binding of the pipeline, or updates the pipeline's binding of that feature. */
  protected async ensureDeclaredBinding(request: AutoTrainRequest, declared: NonNullable<AutoTrainRequest['binding']>, rp: MJRecordProcessEntity, ctx: RegistryContext): Promise<void> {
    const existing = await StoredRowReads.Run<Pick<MJMLModelScoringBindingEntity, 'ID' | 'MLTrainingPipelineID'>>({
      EntityName: 'MJ: ML Model Scoring Bindings',
      ExtraFilter: `TargetEntityID='${EscapeSQLString(rp.EntityID)}' AND FeatureName='${EscapeSQLString(declared.featureName)}'`,
      Fields: ['ID', 'MLTrainingPipelineID'],
      ResultType: 'simple',
    }, ctx);
    if (!existing.Success) throw new Error(`Auto-train: reading the scoring binding "${declared.featureName}" failed: ${existing.ErrorMessage}`);
    const same = existing.Results.find((b) => UUIDsEqual(b.MLTrainingPipelineID, request.pipelineId));
    await ScoringBindings.Upsert({
      bindingId: same ? same.ID : undefined,
      mlTrainingPipelineId: request.pipelineId,
      featureName: declared.featureName,
      viewAuthorizationId: ScoringBindings.ViewAuthorizationForUpsert(declared.viewAuthorizationId, same ? same.ID : undefined, ctx.Provider),
      targetEntityId: rp.EntityID,
      recordProcessId: rp.ID,
      targetColumn: declared.targetColumn || null,
      targetColumnSource: declared.targetColumn ? declared.targetColumnSource || null : null,
      mode: declared.mode || (rp.ScheduleEnabled ? 'Scheduled' : 'OnDemand'),
    }, new MetadataEntityFactory(ctx.Provider), ctx.ContextUser);
  }

  // ----- private helpers ----------------------------------------------------

  /** Repoints the process at the served model, names a superseded model of another pipeline, logs the outcome. */
  private async serve(request: AutoTrainRequest, modelId: string, how: string, ctx: GateContext): Promise<string> {
    await this.repoint(request, modelId, ctx.ContextUser, ctx.Provider);
    await this.logSupersededElsewhere(request, modelId, ctx);
    LogStatus(
      `Predictive Studio auto-train: pipeline '${request.pipelineId}' → ${how} model '${modelId}'` +
        (request.recordProcessId ? `; Record Process '${request.recordProcessId}' repointed.` : '.'),
    );
    return modelId;
  }

  /**
   * A superseded model of another pipeline is not archived (D4-12: it may still serve another process); it is named in
   * the log. A superseded model of this pipeline needs nothing here: a publish archives its incumbent in its own
   * transaction, and a reused model replaced nothing.
   */
  private async logSupersededElsewhere(request: AutoTrainRequest, modelId: string, ctx: GateContext): Promise<void> {
    const oldId = request.currentModelId;
    if (oldId === null || !IsValidUUID(oldId) || UUIDsEqual(oldId, modelId)) return;
    const old = await this.readModel(oldId, ctx);
    if (old === null || UUIDsEqual(old.PipelineID, request.pipelineId)) return;
    LogStatus(
      `Predictive Studio auto-train: ML Model '${old.ID}' (pipeline '${old.PipelineID}') is no longer this process's model; ` +
        `it is not archived, since it belongs to another pipeline and may still serve another process.`,
    );
  }

  /** The loser of the single-flight claim: the pipeline's Published model, else the run fails naming the in-flight run. */
  private async servedWhileInFlight(pipelineId: string, inFlight: TrainingInFlightError, ctx: GateContext): Promise<string> {
    const current = await this.findReusableModel(pipelineId, ctx.ContextUser, ctx.Provider);
    if (current === null) {
      throw new AutoTrainWithheldError(
        `Auto-train: training pipeline ${pipelineId} is already being trained by run ${inFlight.InFlightRunID}, and it has no Published model to score with until that run publishes one.`,
        inFlight.InFlightRunID, null,
      );
    }
    LogStatus(`Predictive Studio auto-train: training pipeline ${pipelineId} is already being trained by run ${inFlight.InFlightRunID}; its Published model '${current}' scores this run.`);
    return current;
  }

  /** The retry window's refusal: the R4 message of the held attempt, then when training may resume. */
  private retryWindowError(pipelineId: string, request: AutoTrainRequest, hold: RetryWindowHold): AutoTrainWithheldError {
    const attempt = hold.ModelID === null
      ? PipelineAutoTrainer.RunWithheldMessage(hold.TrainingRunID, hold.Reason)
      : `Auto-train trained model ${hold.ModelID} (run ${hold.TrainingRunID}); publish withheld: ${hold.Reason}`;
    return new AutoTrainWithheldError(
      `${attempt} Auto-train does not retrain pipeline ${pipelineId} before ${hold.ResumesAt.toISOString()} ` +
        `(autoTrain.retryAfterHours = ${PipelineAutoTrainer.RetryAfterHoursOf(request)} after that refusal, recorded ${hold.RecordedAt.toISOString()}).`,
      hold.TrainingRunID, hold.ModelID,
    );
  }

  /** The R4 error of the model's withheld publish, with {@link modelWithheldMessage}'s wording. */
  private async modelWithheldError(modelId: string, reason: string, trainingRunId: string, ctx: GateContext): Promise<AutoTrainWithheldError> {
    return new AutoTrainWithheldError(await this.modelWithheldMessage(modelId, reason, ctx), trainingRunId, modelId);
  }

  /** "Auto-train trained model <id> v<n>; publish withheld: <reason>" (§5.7 R4). */
  private async modelWithheldMessage(modelId: string, reason: string, ctx: GateContext): Promise<string> {
    const model = await this.readModel(modelId, ctx);
    return `Auto-train trained model ${modelId} v${model ? model.Version : '?'}; publish withheld: ${reason}`;
  }

  /** One model's ID, pipeline and version, read past the cache; null when it is gone. */
  private async readModel(modelId: string, ctx: GateContext): Promise<Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Version'> | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelEntity, 'ID' | 'PipelineID' | 'Version'>>(
      { EntityName: 'MJ: ML Models', ExtraFilter: `ID='${EscapeSQLString(modelId)}'`, Fields: ['ID', 'PipelineID', 'Version'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Auto-train: reading ML Model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }

  /**
   * The pipeline's newest resumable model (by version), read past the cache: Draft (its publish attempt may have been
   * refused at Evaluate, transiently, D4-143), Validated or KeepBaseline (refused at Publish, D4-131). Whether it is
   * resumed is decided by its latest record ({@link ResumeTransientRefusal}).
   */
  private async readNewestResumable(pipelineId: string, ctx: GateContext): Promise<Pick<MJMLModelEntity, 'ID' | 'TrainingRunID'> | null> {
    const r = await StoredRowReads.Run<Pick<MJMLModelEntity, 'ID' | 'TrainingRunID'>>(
      {
        EntityName: 'MJ: ML Models', ExtraFilter: `PipelineID='${EscapeSQLString(pipelineId)}' AND Status IN ('Draft','Validated','KeepBaseline')`,
        OrderBy: 'Version DESC', Fields: ['ID', 'TrainingRunID'], MaxRows: 1, ResultType: 'simple',
      },
      ctx,
    );
    if (!r.Success) throw new Error(`Auto-train: reading the resumable models of pipeline ${pipelineId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }

  /** The Record Process row, read past the cache as an entity to save; null when it no longer exists. */
  private async readRecordProcess(recordProcessId: string, ctx: RegistryContext): Promise<MJRecordProcessEntity | null> {
    const r = await StoredRowReads.Run<MJRecordProcessEntity>(
      { EntityName: 'MJ: Record Processes', ExtraFilter: `ID='${EscapeSQLString(recordProcessId)}'`, MaxRows: 1, ResultType: 'entity_object' },
      ctx,
    );
    if (!r.Success) throw new Error(`Auto-train: reading Record Process ${recordProcessId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }

  /** The model's newest publish record (`RecordedAt` descending), read past the cache. */
  private async readLatestRecord(modelId: string, ctx: GateContext): Promise<MJMLModelPublishRecordEntity | null> {
    const r = await StoredRowReads.Run<MJMLModelPublishRecordEntity>(
      { EntityName: 'MJ: ML Model Publish Records', ExtraFilter: `ModelID='${EscapeSQLString(modelId)}'`, OrderBy: 'RecordedAt DESC', MaxRows: 1, ResultType: 'entity_object' },
      ctx,
    );
    if (!r.Success) throw new Error(`Auto-train: reading the publish records of ML Model ${modelId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0] || null;
  }

  /** Whether the Process Run belongs to the Record Process (IDs compared as UUIDs). */
  private async isRunOfRecordProcess(processRunId: string, recordProcessId: string, ctx: GateContext): Promise<boolean> {
    const r = await StoredRowReads.Run<Pick<MJProcessRunEntity, 'ID' | 'RecordProcessID'>>(
      { EntityName: 'MJ: Process Runs', ExtraFilter: `ID='${EscapeSQLString(processRunId)}'`, Fields: ['ID', 'RecordProcessID'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Auto-train: reading Process Run ${processRunId} failed: ${r.ErrorMessage || 'unknown error'}`);
    const run = r.Results[0];
    return run !== undefined && run.RecordProcessID !== null && UUIDsEqual(run.RecordProcessID, recordProcessId);
  }

  /**
   * The subquery of the pipeline's training run IDs, over the `MJ: ML Training Runs` base view the provider names
   * (`SELECT ID FROM [<schema>].[<view>] WHERE PipelineID='<id>'`), so the refusal read stays one query however many
   * runs the pipeline has.
   *
   * @throws Error when the provider does not describe `MJ: ML Training Runs`
   */
  private static runsOfPipelineSQL(pipelineId: string, ctx: GateContext): string {
    const runs = ctx.Provider.EntityByName('MJ: ML Training Runs');
    if (!runs) throw new Error('Auto-train: the provider does not describe MJ: ML Training Runs, so the refusals of a pipeline cannot be read');
    return `SELECT ID FROM [${runs.SchemaName}].[${runs.BaseView}] WHERE PipelineID='${EscapeSQLString(pipelineId)}'`;
  }

  /** The training run's `ResultingModelID`, read past the cache; null when the run is gone or shipped no model row. */
  private async readResultingModelId(trainingRunId: string, ctx: GateContext): Promise<string | null> {
    const r = await StoredRowReads.Run<Pick<MJMLTrainingRunEntity, 'ID' | 'ResultingModelID'>>(
      { EntityName: 'MJ: ML Training Runs', ExtraFilter: `ID='${EscapeSQLString(trainingRunId)}'`, Fields: ['ID', 'ResultingModelID'], MaxRows: 1, ResultType: 'simple' },
      ctx,
    );
    if (!r.Success) throw new Error(`Auto-train: reading ML Training Run ${trainingRunId} failed: ${r.ErrorMessage || 'unknown error'}`);
    return r.Results[0]?.ResultingModelID || null;
  }
}
