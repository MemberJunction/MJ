/**
 * @module actions/promote-model.action
 *
 * **Promote ML Model** action — the thin Action boundary over the model lifecycle
 * transition (plan §6.4 / §12). It lets an agent / workflow / UI move a model
 * through `Draft → Validated → Published → Archived`, **enforcing the leakage
 * sign-off gate**: a leakage-flagged model cannot be promoted without an explicit
 * human/agent `SignOff`.
 *
 * Per CLAUDE.md "Actions are boundaries": this action does NOT mutate the model's
 * metrics, artifact, or any training payload — promotion is a **lifecycle-only**
 * transition (the model is immutable, §6.4). It validates `ModelID` +
 * `TargetStatus`, delegates the leakage check + transition to an injectable
 * {@link IModelPromotionGate}, and maps the new status back.
 *
 * The gate is an injectable seam so unit tests substitute a mock with no live DB.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, type UserInfo, type IMetadataProvider } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';

import { BasePredictiveStudioAction } from './base-predictive-studio.action';
import { ProductionModelPromotionGate } from './promote-model.gate';

/** The driver-class key this action registers under (matches the metadata row). */
export const PROMOTE_MODEL_DRIVER_CLASS = 'PredictiveStudioPromoteModelAction';

/** The lifecycle statuses a model may be promoted/transitioned to. */
export type PromotableStatus = 'Validated' | 'Published' | 'Archived';

/** The set of valid target statuses (used for validation). */
export const PROMOTABLE_STATUSES: readonly PromotableStatus[] = ['Validated', 'Published', 'Archived'];

/** The model id + requested transition + sign-off, handed to the gate. */
export interface PromoteModelRequest {
  modelId: string;
  targetStatus: PromotableStatus;
  signOff: boolean;
  /**
   * Justification for a sign-off override. REQUIRED (non-empty) when `signOff`
   * overrides a leakage-FLAGGED model — the gate refuses the override without a
   * reason, then persists a sign-off audit note. Ignored when the model isn't
   * flagged (sign-off has nothing to override).
   */
  reason?: string;
  contextUser?: UserInfo;
  provider?: IMetadataProvider;
}

/** Outcome of a promotion attempt. */
export type PromoteModelOutcome =
  | { kind: 'promoted'; newStatus: PromotableStatus; signOffNote?: string }
  | { kind: 'refused-leakage'; topFeature?: string; topShare?: number }
  | { kind: 'signoff-reason-required'; topFeature?: string; topShare?: number }
  | { kind: 'invalid-transition'; currentStatus: string; targetStatus: PromotableStatus }
  | { kind: 'not-found' }
  | { kind: 'save-failed'; message: string };

/**
 * The single lifecycle-transition seam this action depends on — load the model,
 * enforce the leakage sign-off gate, and transition the status (lifecycle only).
 * The production implementation ({@link ProductionModelPromotionGate}) loads the
 * `MJ: ML Models` row, determines leakage from its frozen feature importance, and
 * saves only the `Status`; tests inject a deterministic fake.
 */
export interface IModelPromotionGate {
  /** Attempt the promotion, enforcing the leakage sign-off gate. */
  promote(request: PromoteModelRequest): Promise<PromoteModelOutcome>;
}

/**
 * Transitions a model's lifecycle status with the leakage sign-off gate enforced.
 * Output: `Status` (the new status string, on success).
 */
@RegisterClass(BaseAction, PROMOTE_MODEL_DRIVER_CLASS)
export class PredictiveStudioPromoteModelAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    try {
      const modelId = this.getStringParam(params, 'ModelID');
      if (!modelId) {
        return this.fail('VALIDATION_ERROR', 'ModelID parameter is required');
      }

      const targetStatus = this.parseTargetStatus(params);
      if (!targetStatus) {
        return this.fail(
          'VALIDATION_ERROR',
          `TargetStatus parameter is required and must be one of: ${PROMOTABLE_STATUSES.join(', ')}`,
        );
      }

      const signOff = this.getBooleanParam(params, 'SignOff', false);
      const reason = this.getStringParam(params, 'Reason');

      const gate = this.createGate();
      const outcome = await gate.promote({
        modelId,
        targetStatus,
        signOff,
        reason,
        contextUser: params.ContextUser,
        provider: params.Provider,
      });

      return this.mapOutcome(params, modelId, outcome);
    } catch (e) {
      LogError(e);
      return this.fail('PROMOTION_FAILED', `Promotion failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Map the gate outcome to an {@link ActionResultSimple}. */
  protected mapOutcome(params: RunActionParams, modelId: string, outcome: PromoteModelOutcome): ActionResultSimple {
    switch (outcome.kind) {
      case 'promoted':
        this.addOutputParam(params, 'Status', outcome.newStatus);
        if (outcome.signOffNote) {
          this.addOutputParam(params, 'SignOffNote', outcome.signOffNote);
        }
        return this.ok(
          params,
          outcome.signOffNote
            ? `Model ${modelId} transitioned to ${outcome.newStatus}. ${outcome.signOffNote}`
            : `Model ${modelId} transitioned to ${outcome.newStatus}.`,
        );
      case 'refused-leakage':
        return this.fail('LEAKAGE_SIGNOFF_REQUIRED', this.leakageRefusalMessage(modelId, outcome));
      case 'signoff-reason-required':
        return this.fail('SIGNOFF_REASON_REQUIRED', this.signOffReasonRequiredMessage(modelId, outcome));
      case 'invalid-transition':
        return this.fail(
          'INVALID_TRANSITION',
          `Model ${modelId} cannot move from '${outcome.currentStatus}' to '${outcome.targetStatus}'. ` +
            'Allowed lifecycle: Draft → Validated → Published → Archived (with Published ↔ Archived).',
        );
      case 'not-found':
        return this.fail('MODEL_NOT_FOUND', `ML Model '${modelId}' was not found.`);
      case 'save-failed':
        return this.fail('SAVE_FAILED', `Failed to transition model '${modelId}': ${outcome.message}`);
    }
  }

  /** Compose the plain-language refusal message for a leakage-flagged model. */
  protected leakageRefusalMessage(
    modelId: string,
    outcome: Extract<PromoteModelOutcome, { kind: 'refused-leakage' }>,
  ): string {
    const detail =
      outcome.topFeature != null
        ? ` One feature ("${outcome.topFeature}") accounts for ${(((outcome.topShare ?? 0) * 100)).toFixed(0)}% of the model's predictions, which often signals the model is accidentally peeking at the answer.`
        : '';
    return (
      `Model ${modelId} was flagged for possible target leakage and cannot be promoted without sign-off.${detail} ` +
      'A human must review the model and re-run this action with SignOff=true to confirm the result is legitimate.'
    );
  }

  /**
   * Compose the message when a sign-off override of a leakage-flagged model was
   * requested WITHOUT a justification reason — the override is refused until one is
   * supplied so the audit trail is never empty.
   */
  protected signOffReasonRequiredMessage(
    modelId: string,
    outcome: Extract<PromoteModelOutcome, { kind: 'signoff-reason-required' }>,
  ): string {
    const detail =
      outcome.topFeature != null
        ? ` (one feature, "${outcome.topFeature}", dominates this model's predictions)`
        : '';
    return (
      `Model ${modelId} is leakage-flagged${detail} and SignOff=true was supplied without a Reason. ` +
      'Overriding a leakage flag requires a non-empty Reason so the sign-off is auditable. ' +
      'Re-run this action with both SignOff=true and a Reason explaining why the result is legitimate.'
    );
  }

  // ----- param parsing -------------------------------------------------------

  /** Parse + validate the `TargetStatus` param against the promotable set. */
  protected parseTargetStatus(params: RunActionParams): PromotableStatus | undefined {
    const raw = this.getStringParam(params, 'TargetStatus');
    if (!raw) {
      return undefined;
    }
    const match = PROMOTABLE_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
    return match;
  }

  // ----- injectable gate seam (overridden in tests) --------------------------

  /** Construct the production promotion gate. Overridable so tests inject a mock. */
  protected createGate(): IModelPromotionGate {
    return new ProductionModelPromotionGate();
  }
}
