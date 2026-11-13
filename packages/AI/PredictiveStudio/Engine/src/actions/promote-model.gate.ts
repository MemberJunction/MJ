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
 * standard 0.6). A kept simple baseline stores no importance of its own (`{}`), so
 * the run's leakage audit its Lineage records (the finalist importance's top feature
 * and share) is judged against the same threshold: either one flags the model.
 *
 * ## Holds no sign-off overrides
 * A model whose Lineage records a `calibrationHold` (its family is hidden for its
 * holdout calibration) is never moved to Validated or Published, and a model whose
 * artifact the sidecar's `/predict` does not serve (a forecast's series forecaster,
 * {@link ModelReadiness.IsServedByPredict}) is never published.
 */

import { RunView, LogError, LogStatus, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import type { MJMLModelEntity, MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { CALIBRATION_SLOPE_RANGE, DOMINANCE_THRESHOLD_DEFAULT, type FeatureImportance, type LeakageGuard } from '@memberjunction/predictive-studio-core';

import { DetectSingleFeatureDominance } from '../feature-assembly/leakage-guard';
import { ModelScoringActionGenerator } from './model-scoring-action-generator';
import { ModelHasTrainedArtifact, ModelNeedsTrainingMessage, ModelReadiness } from '../scoring/model-readiness';
import { TrainerModelLineageReader } from '../training/trainer-model-lineage';
import type {
  IModelPromotionGate,
  PromoteModelRequest,
  PromoteModelOutcome,
} from './promote-model.action';

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
    // A hidden family is never offered: no sign-off overrides a calibration hold, so it is checked first.
    const calibrationRefusal = this.CalibrationHoldRefusal(model, request.targetStatus);
    if (calibrationRefusal !== null) {
      return calibrationRefusal;
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

    return this.transition(model, request.targetStatus, signOffNote, request.contextUser, request.provider);
  }

  /**
   * The refusal of a calibration-held model ({@link TrainerModelLineageReader.CalibrationHoldOf}) moving to Validated or
   * Published; null for any other model or target (a held model may still be archived).
   */
  protected CalibrationHoldRefusal(model: MJMLModelEntity, targetStatus: PromoteModelRequest['targetStatus']): PromoteModelOutcome | null {
    if (targetStatus === 'Archived') return null;
    const hold = TrainerModelLineageReader.CalibrationHoldOf(model.Lineage);
    return hold === null ? null : { kind: 'refused-calibration', slope: hold.slope };
  }

  /**
   * The plain-language refusal of a calibration-held model, shared by the Promote action and operation.
   *
   * @param modelId the `MJ: ML Models` id
   * @param slope the held finalist's holdout calibration slope; null when it could not be measured
   */
  public static CalibrationRefusalMessage(modelId: string, slope: number | null): string {
    const range = `${CALIBRATION_SLOPE_RANGE[0]}–${CALIBRATION_SLOPE_RANGE[1]}`;
    const why = slope === null
      ? 'its calibration slope could not be measured on the held-back rows'
      : `its probabilities are miscalibrated on the held-back rows (calibration slope ${slope.toFixed(2)}, outside the ${range} range)`;
    return (
      `Model ${modelId} is held for calibration and cannot be validated or published: ${why}. A family outside the ` +
      `${range} calibration range is hidden, so no sign-off overrides it; retrain to get a model whose calibration is in range.`
    );
  }

  /**
   * A short plain description of an outcome that did not promote, for callers that report why a model was not
   * published (auto-train, the pipeline builder).
   */
  public static DescribeRefusal(outcome: PromoteModelOutcome): string {
    switch (outcome.kind) {
      case 'refused-leakage':
      case 'signoff-reason-required':
        return `possible target leakage on "${outcome.topFeature || 'a feature'}" needs human sign-off`;
      case 'refused-calibration':
        return outcome.slope === null
          ? 'its calibration slope could not be measured, so its family is hidden (calibration hold)'
          : `its calibration slope ${outcome.slope.toFixed(2)} is outside ${CALIBRATION_SLOPE_RANGE[0]}–${CALIBRATION_SLOPE_RANGE[1]}, so its family is hidden (calibration hold)`;
      case 'not-servable':
      case 'needs-training':
      case 'save-failed':
        return outcome.message;
      case 'invalid-transition':
        return `invalid transition from ${outcome.currentStatus}`;
      case 'not-found':
        return 'model not found';
      case 'promoted':
        return 'promoted';
    }
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
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider,
  ): Promise<MJMLModelEntity | null> {
    // The model id is interpolated into a SQL filter — it MUST be a UUID. A
    // non-UUID can't match a real row and is refused rather than concatenated.
    if (!IsValidUUID(modelId)) {
      return null;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJMLModelEntity>(
      {
        EntityName: 'MJ: ML Models',
        ExtraFilter: `ID='${modelId}'`,
        ResultType: 'entity_object',
        MaxRows: 1,
        SkipTotalRowCount: true,
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
   * producing pipeline's threshold, and judging the run's leakage audit its Lineage
   * records against the same (clamped) threshold: a kept simple baseline stores `{}`
   * as its importance, so the finalist's audit is what can flag it. A model whose
   * Lineage records no audit (trained before the audit existed) is judged by its
   * importance alone.
   */
  protected async detectLeakage(
    model: MJMLModelEntity,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider,
  ): Promise<{ flagged: boolean; topFeature?: string; topShare?: number }> {
    const importance = this.parseJson<FeatureImportance>(model.FeatureImportance, {});
    const threshold = await this.resolveThreshold(model.PipelineID, contextUser, provider);
    const dominance = DetectSingleFeatureDominance(importance, threshold);
    if (dominance.Dominant) {
      return { flagged: true, topFeature: dominance.TopFeature, topShare: dominance.TopShare };
    }
    // The same strict comparison as the importance check, against the threshold it applied.
    const audit = TrainerModelLineageReader.LeakageAuditOf(model.Lineage);
    if (audit !== null && audit.topShare > dominance.Threshold) {
      return { flagged: true, topFeature: audit.topFeature, topShare: audit.topShare };
    }
    return { flagged: false, topFeature: dominance.TopFeature, topShare: dominance.TopShare };
  }

  /** Resolve the dominance threshold from the producing pipeline's `LeakageGuard`. */
  protected async resolveThreshold(
    pipelineId: string | null | undefined,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider,
  ): Promise<number> {
    // pipelineId is interpolated into a SQL filter — only a UUID is valid. A
    // missing/malformed id falls back to the default threshold (never concatenated).
    if (!IsValidUUID(pipelineId)) {
      return DOMINANCE_THRESHOLD_DEFAULT;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const result = await rv.RunView<MJMLTrainingPipelineEntity>(
      {
        EntityName: 'MJ: ML Training Pipelines',
        ExtraFilter: `ID='${pipelineId}'`,
        Fields: ['LeakageGuard'],
        ResultType: 'simple',
        MaxRows: 1,
        SkipTotalRowCount: true,
      },
      contextUser,
    );
    if (!result.Success || result.Results.length === 0) {
      return DOMINANCE_THRESHOLD_DEFAULT;
    }
    const guard = this.parseJson<LeakageGuard>(result.Results[0].LeakageGuard, {
      DenyFields: [],
      SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT,
    });
    const threshold = guard.SingleFeatureDominanceThreshold;
    return Number.isFinite(threshold) ? threshold : DOMINANCE_THRESHOLD_DEFAULT;
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
    signOffNote: string | undefined,
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider,
  ): Promise<PromoteModelOutcome> {
    const currentStatus = model.Status ?? 'Draft';
    const allowed = ProductionModelPromotionGate.ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(targetStatus)) {
      return { kind: 'invalid-transition', currentStatus, targetStatus };
    }
    // A model with no trained artifact can't score anything, so it must never reach
    // Published — refuse with the plain "needs training" message instead of letting it
    // look deployable and then fail every record at run time. Checked after the
    // lifecycle rule, so an illegal jump is still reported as an invalid transition.
    if (targetStatus === 'Published' && !ModelHasTrainedArtifact(model)) {
      return { kind: 'needs-training', message: ModelNeedsTrainingMessage(model.ID) };
    }
    // An artifact /predict does not serve (a forecast's series forecaster) would fail every record once bound.
    if (targetStatus === 'Published' && !ModelReadiness.IsServedByPredict(model)) {
      return { kind: 'not-servable', message: ModelReadiness.NotServedByPredictMessage(model.ID) };
    }
    model.Status = targetStatus;
    const saved = await model.Save();
    if (!saved) {
      return { kind: 'save-failed', message: model.LatestResult?.CompleteMessage ?? 'unknown error' };
    }
    await this.syncScoringAction(model, targetStatus, contextUser, provider);
    return { kind: 'promoted', newStatus: targetStatus, signOffNote };
  }

  /**
   * Keep the per-model scoring Action (PS2-2) in step with the model's new
   * lifecycle status — generate/refresh it on `Published` (the status that makes a
   * model usable for scoring) and disable it on `Archived`. This is a pure
   * enhancement, NOT part of the promotion contract: any failure is logged and
   * swallowed so it can never fail an otherwise-successful promotion.
   */
  protected async syncScoringAction(
    model: MJMLModelEntity,
    targetStatus: PromoteModelRequest['targetStatus'],
    contextUser: UserInfo | undefined,
    provider: IMetadataProvider,
  ): Promise<void> {
    // The generator needs a contextUser to read/write Action metadata. Without one
    // (a bare in-process call) we skip — the live path always supplies it.
    if (!contextUser) {
      return;
    }
    try {
      const generator = new ModelScoringActionGenerator();
      if (targetStatus === 'Published') {
        await generator.generateForModel(model, contextUser, provider);
      } else if (targetStatus === 'Archived') {
        await generator.disableForModel(model, contextUser, provider);
      }
    } catch (e) {
      LogError(
        `ProductionModelPromotionGate: scoring-action sync for model '${model.ID}' (→ ${targetStatus}) failed ` +
          `but the promotion succeeded: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
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
