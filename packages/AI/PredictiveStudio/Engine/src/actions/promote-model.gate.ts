/**
 * @module actions/promote-model.gate
 *
 * Production implementation of the {@link IModelPromotionGate} seam used by the
 * {@link PredictiveStudioPromoteModelAction}. It is the only place in the Promote
 * action path that touches MJ's live data: it loads the immutable `MJ: ML Models`
 * row, determines whether the model was **leakage-flagged**, enforces the
 * sign-off gate, and saves ONLY the lifecycle `Status` (never metrics, artifact,
 * or any training payload — the model is immutable, §6.4).
 *
 * ## Leakage detection (no dedicated column)
 * A model has no `LeakageFlagged` column; the leakage signal is derived. The gate
 * re-runs the SAME single-feature-dominance check the {@link TrainingEngine} uses
 * (§6.4) over the model's frozen `FeatureImportance`, against the dominance
 * threshold from the producing pipeline's `LeakageGuard` (falling back to the
 * standard 0.6). This is deterministic and needs no extra state on the model.
 */

import { RunView, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import type { MJMLModelEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { FeatureImportance, LeakageGuard } from '@memberjunction/predictive-studio-core';

import { detectSingleFeatureDominance } from '../feature-assembly/leakage-guard';
import type {
  IModelPromotionGate,
  PromoteModelRequest,
  PromoteModelOutcome,
} from './promote-model.action';

/** Default single-feature-dominance threshold when a pipeline doesn't specify one. */
const DEFAULT_DOMINANCE_THRESHOLD = 0.6;

/**
 * Loads a model, enforces the leakage sign-off gate, and transitions its status.
 */
export class ProductionModelPromotionGate implements IModelPromotionGate {
  /** @inheritdoc */
  public async promote(request: PromoteModelRequest): Promise<PromoteModelOutcome> {
    const model = await this.loadModel(request.modelId, request.contextUser, request.provider);
    if (!model) {
      return { kind: 'not-found' };
    }

    if (!request.signOff) {
      const leakage = await this.detectLeakage(model, request.contextUser, request.provider);
      if (leakage.flagged) {
        return { kind: 'refused-leakage', topFeature: leakage.topFeature, topShare: leakage.topShare };
      }
    }

    return this.transition(model, request.targetStatus);
  }

  // ----- model load ----------------------------------------------------------

  /** Load the model as an `entity_object` (it is mutated to set Status). */
  protected async loadModel(
    modelId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLModelEntity | null> {
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<MJMLModelEntity>(
      {
        EntityName: 'MJ: ML Models',
        ExtraFilter: `ID='${modelId}'`,
        ResultType: 'entity_object',
        MaxRows: 1,
      },
      contextUser,
    );
    if (!result.Success || result.Results.length === 0) {
      return null;
    }
    return result.Results[0];
  }

  // ----- leakage detection ---------------------------------------------------

  /**
   * Determine whether the model was leakage-flagged by re-running the
   * single-feature-dominance check over its frozen `FeatureImportance` against the
   * producing pipeline's threshold.
   */
  protected async detectLeakage(
    model: MJMLModelEntity,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<{ flagged: boolean; topFeature?: string; topShare?: number }> {
    const importance = this.parseJson<FeatureImportance>(model.FeatureImportance, {});
    const threshold = await this.resolveThreshold(model.PipelineID, contextUser, provider);
    const dominance = detectSingleFeatureDominance(importance, threshold);
    return { flagged: dominance.Dominant, topFeature: dominance.TopFeature, topShare: dominance.TopShare };
  }

  /** Resolve the dominance threshold from the producing pipeline's `LeakageGuard`. */
  protected async resolveThreshold(
    pipelineId: string | null | undefined,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<number> {
    if (!pipelineId) {
      return DEFAULT_DOMINANCE_THRESHOLD;
    }
    const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
    const result = await rv.RunView<MJMLTrainingPipelineEntity>(
      {
        EntityName: 'MJ: ML Training Pipelines',
        ExtraFilter: `ID='${pipelineId}'`,
        Fields: ['LeakageGuard'],
        ResultType: 'simple',
        MaxRows: 1,
      },
      contextUser,
    );
    if (!result.Success || result.Results.length === 0) {
      return DEFAULT_DOMINANCE_THRESHOLD;
    }
    const guard = this.parseJson<LeakageGuard>(result.Results[0].LeakageGuard, {
      DenyFields: [],
      SingleFeatureDominanceThreshold: DEFAULT_DOMINANCE_THRESHOLD,
    });
    const threshold = guard.SingleFeatureDominanceThreshold;
    return Number.isFinite(threshold) ? threshold : DEFAULT_DOMINANCE_THRESHOLD;
  }

  // ----- transition ----------------------------------------------------------

  /** Set ONLY the lifecycle status and save; never touches metrics/artifact. */
  protected async transition(
    model: MJMLModelEntity,
    targetStatus: PromoteModelRequest['targetStatus'],
  ): Promise<PromoteModelOutcome> {
    model.Status = targetStatus;
    const saved = await model.Save();
    if (!saved) {
      return { kind: 'save-failed', message: model.LatestResult?.CompleteMessage ?? 'unknown error' };
    }
    return { kind: 'promoted', newStatus: targetStatus };
  }

  // ----- helpers -------------------------------------------------------------

  /** Parse a possibly-null JSON column, falling back to a default on null/parse error. */
  private parseJson<T>(raw: string | null | undefined, fallback: T): T {
    if (raw == null || raw.trim().length === 0) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}
