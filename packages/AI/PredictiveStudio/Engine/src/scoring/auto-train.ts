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
 *   1. **reuses** the newest Published, artifact-backed model of the pipeline whose
 *      bytes load on this server (so concurrent or repeated runs don't retrain), or
 *   2. **trains** the pipeline through the real {@link TrainingEngine} path and
 *      **publishes** the result through the promotion gate (Draft → Validated →
 *      Published — a leakage-flagged model is refused and stays Draft, exactly as a
 *      human-driven promotion would be);
 *   3. **repoints** the Record Process's `Configuration.modelId` and every scoring
 *      binding on that process (or on the superseded model) at the new model, and
 *      creates the declared binding when none exists yet;
 *   4. **archives** the superseded model when it was Published (it can't score).
 *
 * Nothing here runs unless a Record Process declares `autoTrain` — other apps and
 * processes keep the plain "needs training" refusal.
 */

import { LogError, LogStatus, RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLModelScoringBindingEntity, MJRecordProcessEntity } from '@memberjunction/core-entities';

import { TrainModelViaEngine } from '../operations/delegation';
import { ProductionModelPromotionGate } from '../actions/promote-model.gate';
import type { IModelPromotionGate, PromoteModelOutcome } from '../actions/promote-model.action';
import { MetadataEntityFactory } from '../training/seams';
import { LocalArtifactLoader } from './artifact-loader';
import { UpsertScoringBinding } from './scoring-binding';
import { ModelHasTrainedArtifact } from './model-readiness';
import type { AutoTrainRequest, IArtifactLoader, IModelAutoTrainer } from './types';

/** Canonical UUID shape — the only id shape interpolated into a filter here. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/** Signature of the train step (production: {@link TrainModelViaEngine}); injectable for tests. */
export type AutoTrainTrainFn = (pipelineId: string, provider: IMetadataProvider, user: UserInfo) => Promise<MJMLModelEntity>;

/** Optional seams for {@link PipelineAutoTrainer} (all default to production implementations). */
export interface PipelineAutoTrainerOptions {
  /** Trains the pipeline and returns the new (Draft) model row. */
  train?: AutoTrainTrainFn;
  /** The promotion gate used to publish (and archive the superseded model). */
  gate?: IModelPromotionGate;
  /** Reads artifact bytes — used to confirm a reusable model actually loads on this server. */
  artifactLoader?: IArtifactLoader;
}

/**
 * Production {@link IModelAutoTrainer}: reuse-or-train, publish, repoint, archive.
 */
export class PipelineAutoTrainer implements IModelAutoTrainer {
  private readonly train: AutoTrainTrainFn;
  private readonly gate: IModelPromotionGate;
  private readonly artifactLoader: IArtifactLoader;

  constructor(options: PipelineAutoTrainerOptions = {}) {
    this.train = options.train ?? (async (pipelineId, provider, user) => (await TrainModelViaEngine({ pipelineId }, provider, user)).model);
    this.gate = options.gate ?? new ProductionModelPromotionGate();
    this.artifactLoader = options.artifactLoader ?? new LocalArtifactLoader();
  }

  /** @inheritdoc */
  public async EnsureTrainedModel(request: AutoTrainRequest, contextUser: UserInfo, provider: IMetadataProvider): Promise<string> {
    if (!isUuid(request.pipelineId)) {
      throw new Error(`Auto-train: '${request.pipelineId}' is not a valid ML Training Pipeline id.`);
    }
    const reused = await this.findReusableModel(request.pipelineId, contextUser, provider);
    const modelId = reused ?? (await this.trainAndPublish(request.pipelineId, contextUser, provider));
    await this.repoint(request, modelId, contextUser, provider);
    await this.archiveSuperseded(request.currentModelId, modelId, contextUser, provider);
    LogStatus(
      `Predictive Studio auto-train: pipeline '${request.pipelineId}' → ${reused ? 'reused' : 'trained + published'} model '${modelId}'` +
        (request.recordProcessId ? `; Record Process '${request.recordProcessId}' repointed.` : '.'),
    );
    return modelId;
  }

  // ----- reuse --------------------------------------------------------------

  /** The newest Published model of the pipeline whose artifact loads on this server, if any. */
  protected async findReusableModel(pipelineId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string | null> {
    const result = await RunView.FromMetadataProvider(provider).RunView<{ ID: string; ArtifactFileID: string | null }>(
      {
        EntityName: 'MJ: ML Models',
        ExtraFilter: `PipelineID='${pipelineId}' AND Status='Published' AND ArtifactFileID IS NOT NULL`,
        OrderBy: 'Version DESC',
        Fields: ['ID', 'ArtifactFileID'],
        ResultType: 'simple',
        MaxRows: 5,
      },
      contextUser,
    );
    if (!result.Success) {
      return null;
    }
    for (const row of result.Results) {
      if (ModelHasTrainedArtifact(row) && row.ArtifactFileID && (await this.artifactLoader.load(row.ArtifactFileID, contextUser))) {
        return row.ID;
      }
    }
    return null;
  }

  // ----- train + publish ----------------------------------------------------

  /** Train the pipeline (real TrainingEngine path) and publish the new model through the gate. */
  protected async trainAndPublish(pipelineId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<string> {
    const model = await this.train(pipelineId, provider, contextUser);
    for (const targetStatus of ['Validated', 'Published'] as const) {
      const outcome = await this.gate.promote({ modelId: model.ID, targetStatus, signOff: false, contextUser, provider });
      if (outcome.kind !== 'promoted') {
        throw new Error(
          `Auto-train: trained model '${model.ID}' from pipeline '${pipelineId}' but could not move it to ${targetStatus} ` +
            `(${this.describeRefusal(outcome)}). It stays in ${model.Status ?? 'Draft'} for a human to review in Predictive Studio.`,
        );
      }
    }
    return model.ID;
  }

  /** Plain description of a non-promoted outcome. */
  protected describeRefusal(outcome: PromoteModelOutcome): string {
    switch (outcome.kind) {
      case 'refused-leakage':
      case 'signoff-reason-required':
        return `possible target leakage on "${outcome.topFeature ?? 'a feature'}" needs human sign-off`;
      case 'invalid-transition':
        return `invalid transition from ${outcome.currentStatus}`;
      case 'needs-training':
        return outcome.message;
      case 'not-found':
        return 'model not found';
      case 'save-failed':
        return outcome.message;
      case 'promoted':
        return 'promoted';
    }
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
    if (isUuid(request.recordProcessId)) {
      rp = await factory.getEntityObject<MJRecordProcessEntity>('MJ: Record Processes', contextUser);
      if (await rp.Load(request.recordProcessId)) {
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
      if (binding.MLModelID === modelId) {
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
    if (isUuid(recordProcessId)) clauses.push(`RecordProcessID='${recordProcessId}'`);
    if (isUuid(request.currentModelId)) clauses.push(`MLModelID='${request.currentModelId}'`);
    if (clauses.length === 0) {
      return [];
    }
    const result = await RunView.FromMetadataProvider(provider).RunView<MJMLModelScoringBindingEntity>(
      { EntityName: 'MJ: ML Model Scoring Bindings', ExtraFilter: clauses.join(' OR '), ResultType: 'entity_object' },
      contextUser,
    );
    return result.Success ? result.Results : [];
  }

  /** Archive the superseded model when it was Published (best-effort — never fails the run). */
  protected async archiveSuperseded(oldModelId: string | null, newModelId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
    if (!isUuid(oldModelId) || oldModelId.toLowerCase() === newModelId.toLowerCase()) {
      return;
    }
    try {
      const outcome = await this.gate.promote({ modelId: oldModelId, targetStatus: 'Archived', signOff: false, contextUser, provider });
      if (outcome.kind !== 'promoted' && outcome.kind !== 'invalid-transition' && outcome.kind !== 'not-found') {
        LogError(`Auto-train: could not archive superseded model '${oldModelId}': ${this.describeRefusal(outcome)}`);
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
