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

import { RunView, LogStatus, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
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

/** Canonical UUID shape (8-4-4-4-12 hex), case-insensitive. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a string is a well-formed UUID (the only legal `MJ: ML Models` / pipeline id shape). */
function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

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

    // Always evaluate leakage so a sign-off override of a FLAGGED model can be
    // audited. A clean (non-flagged) model needs neither a sign-off nor a reason.
    const leakage = await this.detectLeakage(model, request.contextUser, request.provider);
    let signOffNote: string | undefined;
    if (leakage.flagged) {
      if (!request.signOff) {
        return { kind: 'refused-leakage', topFeature: leakage.topFeature, topShare: leakage.topShare };
      }
      // Sign-off overriding a FLAGGED model REQUIRES a non-empty justification.
      const reason = request.reason?.trim();
      if (!reason) {
        return { kind: 'signoff-reason-required', topFeature: leakage.topFeature, topShare: leakage.topShare };
      }
      signOffNote = this.recordSignOff(model, request, leakage, reason);
    }

    return this.transition(model, request.targetStatus, signOffNote);
  }

  /**
   * Persist an auditable sign-off note for a leakage override. The model is
   * immutable (no free-text column to write), so the override is recorded via the
   * platform log (an operator-visible audit line) and returned in the outcome so
   * the calling Action surfaces it. The note captures who/when/what-was-overridden
   * and the supplied reason.
   */
  protected recordSignOff(
    model: MJMLModelEntity,
    request: PromoteModelRequest,
    leakage: { topFeature?: string; topShare?: number },
    reason: string,
  ): string {
    const who = request.contextUser?.Email ?? request.contextUser?.Name ?? 'unknown user';
    const when = new Date().toISOString();
    const share = leakage.topShare != null ? ` (${(leakage.topShare * 100).toFixed(0)}% share)` : '';
    const feature = leakage.topFeature ? ` on feature "${leakage.topFeature}"${share}` : '';
    const note =
      `Leakage sign-off override for ML Model '${model.ID}' by ${who} at ${when}: ` +
      `leakage flag${feature} overridden to ${request.targetStatus}. Reason: ${reason}`;
    LogStatus(note);
    return note;
  }

  // ----- model load ----------------------------------------------------------

  /** Load the model as an `entity_object` (it is mutated to set Status). */
  protected async loadModel(
    modelId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider,
  ): Promise<MJMLModelEntity | null> {
    // The model id is interpolated into a SQL filter — it MUST be a UUID. A
    // non-UUID can't match a real row and is refused rather than concatenated.
    if (!isUuid(modelId)) {
      return null;
    }
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
    // pipelineId is interpolated into a SQL filter — only a UUID is valid. A
    // missing/malformed id falls back to the default threshold (never concatenated).
    if (!isUuid(pipelineId)) {
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

  /**
   * Allowed lifecycle transitions keyed on the model's CURRENT status. The
   * lifecycle is `Draft → Validated → Published → Archived`, with the
   * conservative reversible edges `Validated → Archived` (abandon a candidate)
   * and `Archived ↔ Published` (un-archive / re-archive). Anything not listed
   * (e.g. `Draft → Published`) is rejected as an invalid jump.
   */
  protected static readonly ALLOWED_TRANSITIONS: Readonly<Record<string, readonly PromoteModelRequest['targetStatus'][]>> = {
    Draft: ['Validated'],
    Validated: ['Published', 'Archived'],
    Published: ['Archived'],
    Archived: ['Published'],
  };

  /**
   * Set ONLY the lifecycle status and save; never touches metrics/artifact.
   * Enforces the {@link ALLOWED_TRANSITIONS} state machine first — an illegal
   * jump (e.g. Draft → Published) is refused before any mutation/save.
   */
  protected async transition(
    model: MJMLModelEntity,
    targetStatus: PromoteModelRequest['targetStatus'],
    signOffNote?: string,
  ): Promise<PromoteModelOutcome> {
    const currentStatus = model.Status ?? 'Draft';
    const allowed = ProductionModelPromotionGate.ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      return { kind: 'invalid-transition', currentStatus, targetStatus };
    }
    model.Status = targetStatus;
    const saved = await model.Save();
    if (!saved) {
      return { kind: 'save-failed', message: model.LatestResult?.CompleteMessage ?? 'unknown error' };
    }
    return { kind: 'promoted', newStatus: targetStatus, signOffNote };
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
