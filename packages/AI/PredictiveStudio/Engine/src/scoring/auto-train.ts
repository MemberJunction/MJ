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
 * {@link PipelineAutoTrainer} is the production {@link IModelAutoTrainer}. When a run
 * finds its model needs training it:
 *   1. **reuses** the newest Published model of the pipeline whose artifact loads
 *      `verified` through the artifact registry (so concurrent or repeated runs don't
 *      retrain; a lost, changed or unregistered artifact is never reused), or
 *   2. **trains** the pipeline through the real {@link TrainingEngine} path and
 *      **evaluates** the run through the lifecycle gate (`LifecycleGate.Evaluate({ trainingRunId })`:
 *      Draft → Validated from the run's stored gate decision). It does not publish: until M4b routes
 *      automatic publishing through the gate's automated publisher, the new model scores as a
 *      Validated model. A model the gate refuses (a calibration hold, no stored decision), one it
 *      evaluates to KeepBaseline (which does not score), and one whose training run flagged leakage
 *      (published only after a person's sign-off) are not served: the run fails naming why;
 *   3. **repoints** the Record Process's `Configuration.modelId` and every scoring
 *      binding on that process (or on the superseded model) at the new model, and
 *      creates the declared binding when none exists yet;
 *   4. **archives** the superseded model through the lifecycle gate (`LifecycleGate.Archive`, with a
 *      reason); a model the lifecycle table cannot archive (a Draft) is left as it is.
 *
 * Nothing here runs unless a Record Process declares `autoTrain` — other apps and
 * processes keep the plain "needs training" refusal.
 */

import { LogError, LogStatus, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLModelScoringBindingEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';
import { IsValidUUID, UUIDsEqual } from '@memberjunction/global';
import type { Actor, LeakageFlag } from '@memberjunction/predictive-studio-core';

import { TrainingDelegation } from '../operations/delegation';
import { LifecycleGate } from '../registry/lifecycle-gate';
import { GateContexts } from '../registry/gate-seams';
import { GateRefusals } from '../registry/gate-refusals';
import type { GateContext } from '../registry/gate-context';
import { StoredRuns } from '../registry/stored-publish-inputs';
import { MetadataEntityFactory } from '../training/seams';
import { TrainingEngine } from '../training/training-engine';
import { ArtifactRegistry, type IArtifactRegistry } from '../registry/artifact-registry';
import type { RegistryContext } from '../registry/registry-context';
import { StorageProviderArtifactLoader } from './storage-provider-artifact-loader';
import { UpsertScoringBinding } from './scoring-binding';
import { ModelHasTrainedArtifact, ModelReadiness } from './model-readiness';
import type { AutoTrainRequest, IModelAutoTrainer } from './types';

/** Signature of the train step (production: {@link TrainingDelegation.TrainModelViaEngine}); injectable for tests. */
export type AutoTrainTrainFn = (pipelineId: string, provider: IMetadataProvider, user: UserInfo) => Promise<MJMLModelEntity>;

/**
 * The pipeline's training run completed without a model: its gate decision shipped no artifact (`no-signal`, or the
 * unit's existing rule kept), so there is nothing to publish or score. The message carries the run's stored reason.
 */
export class AutoTrainShippedNoModelError extends Error {
  constructor(public readonly PipelineID: string, public readonly TrainingRunID: string, public readonly Reason: string) {
    super(`Auto-train: training pipeline ${PipelineID} (run ${TrainingRunID}) shipped no model, so there is nothing to score with: ${Reason}`);
    this.name = 'AutoTrainShippedNoModelError';
  }
}

/** Optional seams for {@link PipelineAutoTrainer} (all default to production implementations). */
export interface PipelineAutoTrainerOptions {
  /** Trains the pipeline and returns the new (Draft) model row. */
  train?: AutoTrainTrainFn;
  /** The lifecycle gate the trained run is evaluated through and the superseded model archived through. */
  gate?: LifecycleGate;
  /**
   * The artifact registry a reusable model's artifact is loaded and verified through. Optional because a registry is
   * built for one request's provider and user and the production auto-trainer is built once at startup with neither;
   * when absent, each lookup builds `ArtifactRegistry.ForContext` over a `StorageProviderArtifactLoader` for its call.
   */
  registry?: IArtifactRegistry;
}

/** Who auto-train acts as at the lifecycle gate. */
const AUTO_TRAIN_ACTOR: Actor = { kind: 'system', component: 'auto-train' };

/**
 * Production {@link IModelAutoTrainer}: reuse-or-train, evaluate, repoint, archive.
 */
export class PipelineAutoTrainer implements IModelAutoTrainer {
  private readonly train: AutoTrainTrainFn;
  private readonly gate: LifecycleGate;
  private readonly registry: IArtifactRegistry | null;

  constructor(options: PipelineAutoTrainerOptions = {}) {
    this.train = options.train || PipelineAutoTrainer.TrainThroughEngine;
    this.gate = options.gate || new LifecycleGate();
    this.registry = options.registry || null;
  }

  /**
   * The production train step: train the pipeline through the training engine and return its model.
   *
   * @throws AutoTrainShippedNoModelError when the run's gate decision shipped no model, carrying its stored reason
   */
  public static async TrainThroughEngine(pipelineId: string, provider: IMetadataProvider, user: UserInfo): Promise<MJMLModelEntity> {
    const result = await TrainingDelegation.TrainModelViaEngine({ pipelineId }, provider, user);
    if (result.model === null) throw new AutoTrainShippedNoModelError(pipelineId, result.run.ID, TrainingEngine.NoModelReason(result));
    return result.model;
  }

  /** @inheritdoc */
  public async EnsureTrainedModel(request: AutoTrainRequest, contextUser: UserInfo, provider: IMetadataProvider): Promise<string> {
    if (!IsValidUUID(request.pipelineId)) {
      throw new Error(`Auto-train: '${request.pipelineId}' is not a valid ML Training Pipeline id.`);
    }
    const ctx = GateContexts.ForRequest({ ContextUser: contextUser, Provider: provider });
    const reused = await this.findReusableModel(request.pipelineId, contextUser, provider);
    const modelId = reused || (await this.TrainAndEvaluate(request.pipelineId, ctx));
    await this.repoint(request, modelId, contextUser, provider);
    await this.ArchiveSupersededModel(request.currentModelId, modelId, ctx);
    LogStatus(
      `Predictive Studio auto-train: pipeline '${request.pipelineId}' → ${reused ? 'reused' : 'trained + evaluated (Validated)'} model '${modelId}'` +
        (request.recordProcessId ? `; Record Process '${request.recordProcessId}' repointed.` : '.'),
    );
    return modelId;
  }

  // ----- reuse --------------------------------------------------------------

  /**
   * The newest Published model of the pipeline whose artifact `/predict` serves and whose artifact load is `verified`,
   * if any (a forecast's series forecaster published before the gate refused one is skipped, and so is a model whose
   * artifact is missing, changed or unregistered).
   */
  protected async findReusableModel(pipelineId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<Pick<MJMLModelEntity, 'ID' | 'ArtifactFileID' | 'ArtifactSha256' | 'Lineage'>>(
      {
        EntityName: 'MJ: ML Models',
        ExtraFilter: `PipelineID='${pipelineId}' AND Status='Published' AND ArtifactFileID IS NOT NULL`,
        OrderBy: 'Version DESC',
        Fields: ['ID', 'ArtifactFileID', 'ArtifactSha256', 'Lineage'],
        ResultType: 'simple',
        MaxRows: 5,
      },
      contextUser,
    );
    if (!result.Success) {
      return null;
    }
    const ctx: RegistryContext = { ContextUser: contextUser, Provider: provider };
    const registry = this.registry || ArtifactRegistry.ForContext(ctx, new StorageProviderArtifactLoader());
    for (const row of result.Results) {
      const servable = ModelHasTrainedArtifact(row) && ModelReadiness.IsServedByPredict(row);
      if (servable && (await registry.Load(row, ctx)).Status === 'verified') {
        return row.ID;
      }
    }
    return null;
  }

  // ----- train + evaluate ---------------------------------------------------

  /**
   * Train the pipeline (real TrainingEngine path) and evaluate its run through the lifecycle gate; nothing is published
   * (M4b). The new model is served only when the gate moved it to Validated and its run flagged no leakage.
   *
   * @throws Error naming the model and why when the gate refused it, kept the baseline, or the run flagged leakage
   */
  protected async TrainAndEvaluate(pipelineId: string, ctx: GateContext): Promise<string> {
    const model = await this.train(pipelineId, ctx.Provider, ctx.ContextUser);
    const where = `Auto-train: trained model '${model.ID}' from pipeline '${pipelineId}'`;
    if (!model.TrainingRunID) throw new Error(`${where} names no training run, so the lifecycle gate cannot evaluate it.`);
    const outcome = await this.gate.Evaluate({ trainingRunId: model.TrainingRunID }, AUTO_TRAIN_ACTOR, ctx);
    if (outcome.Kind !== 'evaluated') {
      throw new Error(`${where} but the lifecycle gate did not evaluate it (${GateRefusals.Describe(outcome.Refusal)}). It stays in Draft for a person to review in Predictive Studio.`);
    }
    if (outcome.To !== 'Validated') {
      throw new Error(`${where}: the lifecycle gate kept the simple baseline (${outcome.To}), which does not score until a person publishes it in Predictive Studio.`);
    }
    const flags = await this.ReadLeakageFlags(model.TrainingRunID, ctx);
    if (flags.length > 0) {
      throw new Error(`${where}: its training run flagged ${flags.join(', ')}, so it is not served until a person records a sign-off in Predictive Studio.`);
    }
    return model.ID;
  }

  /**
   * The leakage-flag kinds the training run stores (`ValidationResults.trainer.leakageFlags`). The gate refuses to
   * publish such a model; auto-train, which serves the Validated model until M4b, refuses to serve it the same way.
   */
  protected async ReadLeakageFlags(trainingRunId: string, ctx: GateContext): Promise<readonly LeakageFlag['kind'][]> {
    const run = await StoredRuns.Read(trainingRunId, ctx);
    return [...new Set((run?.Trainer?.leakageFlags || []).map((f) => f.kind))];
  }

  // ----- repoint ------------------------------------------------------------

  /**
   * Point the Record Process (its `Configuration.modelId`) and its scoring bindings at
   * the trained model. Bindings on the process — and bindings still on the superseded
   * model — are repointed; when none exist and a binding was declared, one is created.
   */
  protected async repoint(request: AutoTrainRequest, modelId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
    const factory = new MetadataEntityFactory(provider);
    let rp: MJRecordProcessEntity | null = null;
    const recordProcessId = request.recordProcessId;
    if (recordProcessId !== null && IsValidUUID(recordProcessId)) {
      rp = await factory.getEntityObject<MJRecordProcessEntity>('MJ: Record Processes', contextUser);
      if (await rp.Load(recordProcessId)) {
        const config = this.parseConfig(rp.Configuration);
        config.modelId = modelId;
        rp.Configuration = JSON.stringify(config);
        if (!(await rp.Save())) {
          throw new Error(`Auto-train: failed to repoint Record Process '${rp.ID}': ${rp.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
      } else {
        rp = null;
      }
    }

    const bindings = await this.loadBindings(request, rp?.ID ?? null, contextUser, provider);
    for (const binding of bindings) {
      if (UUIDsEqual(binding.MLModelID, modelId)) {
        continue;
      }
      binding.MLModelID = modelId;
      if (!(await binding.Save())) {
        LogError(`Auto-train: failed to repoint scoring binding '${binding.ID}': ${binding.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
    }

    if (bindings.length === 0 && rp && request.binding) {
      await UpsertScoringBinding(
        {
          mlModelId: modelId,
          recordProcessId: rp.ID,
          targetEntityId: rp.EntityID,
          targetColumn: request.binding.targetColumn,
          mode: request.binding.mode ?? (rp.ScheduleEnabled ? 'Scheduled' : 'OnDemand'),
        },
        factory,
        contextUser,
      );
    }
  }

  /** Bindings on the Record Process and/or on the superseded model. */
  protected async loadBindings(
    request: AutoTrainRequest,
    recordProcessId: string | null,
    contextUser: UserInfo,
    provider: IMetadataProvider,
  ): Promise<MJMLModelScoringBindingEntity[]> {
    const clauses: string[] = [];
    if (IsValidUUID(recordProcessId)) clauses.push(`RecordProcessID='${recordProcessId}'`);
    if (IsValidUUID(request.currentModelId)) clauses.push(`MLModelID='${request.currentModelId}'`);
    if (clauses.length === 0) {
      return [];
    }
    const result = await RunView.FromMetadataProvider(provider).RunView<MJMLModelScoringBindingEntity>(
      { EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: clauses.join(' OR '), ResultType: 'entity_object' },
      contextUser,
    );
    return result.Success ? result.Results : [];
  }

  /**
   * Archive the superseded model through the lifecycle gate (best-effort — never fails the run). A model the lifecycle
   * table cannot archive (a Draft, or one already Archived) and an ID that names no model are left alone; any other
   * refusal is logged.
   */
  protected async ArchiveSupersededModel(oldModelId: string | null, newModelId: string, ctx: GateContext): Promise<void> {
    if (oldModelId === null || !IsValidUUID(oldModelId) || UUIDsEqual(oldModelId, newModelId)) {
      return;
    }
    try {
      const result = await this.gate.Archive(oldModelId, `Superseded by auto-train's model ${newModelId}.`, AUTO_TRAIN_ACTOR, ctx);
      if (result.Ok === true) return;
      const refusal = result.Refusal;
      if (!('kind' in refusal)) {
        LogError(`Auto-train: could not archive superseded model '${oldModelId}': its artifact load was ${refusal.Load.Status}`);
      } else if (refusal.kind !== 'illegal-transition' && refusal.kind !== 'model-not-found') {
        LogError(`Auto-train: could not archive superseded model '${oldModelId}': ${GateRefusals.Describe(refusal)}`);
      }
    } catch (e) {
      LogError(`Auto-train: archiving superseded model '${oldModelId}' failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Parse the Record Process Configuration JSON into a mutable object. */
  private parseConfig(raw: string | null): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
}
