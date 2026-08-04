/**
 * @module operations/promote-model.operation
 *
 * **Promote ML Model** Remote Operation — the server body for the Manual-mode
 * `PredictiveStudio.PromoteModel` operation. A `Sync` lifecycle-only transition
 * (`Draft → Validated → Published → Archived`) that **enforces the leakage sign-off
 * gate**: a leakage-flagged model cannot be promoted without an explicit sign-off
 * (and a justification reason).
 *
 * Per CLAUDE.md "transport-layer architecture", the operation is a THIN adapter — it
 * carries no promotion logic. The leakage detection + state-machine transition live
 * in {@link ProductionModelPromotionGate}, shared with the Promote action via
 * {@link promoteModelViaGate}. The gate touches ONLY the `Status` (the model is
 * immutable, §6.4).
 *
 * Non-promoted outcomes (leakage refusal, missing reason, invalid transition, not
 * found, save failure) are surfaced as a thrown error so the framework wraps them as
 * a clean `EXECUTION_ERROR` result; the message preserves the plain-language detail
 * the Action also surfaces.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation } from '@memberjunction/core';
import {
  PredictiveStudioPromoteModelOperation,
  type PredictiveStudioPromoteModelInput,
  type PredictiveStudioPromoteModelOutput,
} from '@memberjunction/core-entities';

import type {
  IModelPromotionGate,
  PromoteModelOutcome,
} from '../actions/promote-model.action';
import { ProductionModelPromotionGate } from '../actions/promote-model.gate';
import { promoteModelViaGate } from './delegation';

/**
 * Server implementation of `PredictiveStudio.PromoteModel`. Extends the
 * CodeGen-emitted {@link PredictiveStudioPromoteModelOperation} base
 * (`ExecutionMode='Sync'`, `RequiredScope='predictive:execute'`) and supplies only
 * the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.PromoteModel')
export class PredictiveStudioPromoteModelServerOperation extends PredictiveStudioPromoteModelOperation {
  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioPromoteModelInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<PredictiveStudioPromoteModelOutput> {
    if (!input?.modelId) {
      throw new Error('modelId is required');
    }
    if (!input.targetStatus) {
      throw new Error('targetStatus is required (one of: Validated, Published, Archived)');
    }

    const outcome = await promoteModelViaGate(
      {
        modelId: input.modelId,
        targetStatus: input.targetStatus,
        signOff: input.signOff ?? false,
        reason: input.reason,
        contextUser: user,
        provider,
      },
      this.gate(),
    );

    return this.toOutput(input, outcome);
  }

  /**
   * Map the gate outcome onto the operation's typed output. The single happy path
   * (`promoted`) returns `{ promoted: true, status: newStatus }`; every refusal /
   * failure throws with the plain-language detail so the framework surfaces it as a
   * clean error (rather than silently returning `promoted: false`).
   */
  protected toOutput(
    input: PredictiveStudioPromoteModelInput,
    outcome: PromoteModelOutcome,
  ): PredictiveStudioPromoteModelOutput {
    switch (outcome.kind) {
      case 'promoted':
        return { promoted: true, status: outcome.newStatus };
      case 'refused-leakage':
        throw new Error(this.leakageRefusalMessage(input.modelId, outcome));
      case 'signoff-reason-required':
        throw new Error(this.signOffReasonRequiredMessage(input.modelId, outcome));
      case 'invalid-transition':
        throw new Error(
          `Model ${input.modelId} cannot move from '${outcome.currentStatus}' to '${outcome.targetStatus}'. ` +
            'Allowed lifecycle: Draft → Validated → Published → Archived (with Published ↔ Archived).',
        );
      case 'not-found':
        throw new Error(`ML Model '${input.modelId}' was not found.`);
      case 'save-failed':
        throw new Error(`Failed to transition model '${input.modelId}': ${outcome.message}`);
    }
  }

  /** Plain-language refusal message for a leakage-flagged model (mirrors the Action). */
  protected leakageRefusalMessage(
    modelId: string,
    outcome: Extract<PromoteModelOutcome, { kind: 'refused-leakage' }>,
  ): string {
    const detail =
      outcome.topFeature != null
        ? ` One feature ("${outcome.topFeature}") accounts for ${((outcome.topShare ?? 0) * 100).toFixed(0)}% of the model's predictions, which often signals the model is accidentally peeking at the answer.`
        : '';
    return (
      `Model ${modelId} was flagged for possible target leakage and cannot be promoted without sign-off.${detail} ` +
      'A human must review the model and re-run this operation with signOff=true (and a reason) to confirm the result is legitimate.'
    );
  }

  /** Message when a sign-off override was requested without a justification reason. */
  protected signOffReasonRequiredMessage(
    modelId: string,
    outcome: Extract<PromoteModelOutcome, { kind: 'signoff-reason-required' }>,
  ): string {
    const detail =
      outcome.topFeature != null
        ? ` (one feature, "${outcome.topFeature}", dominates this model's predictions)`
        : '';
    return (
      `Model ${modelId} is leakage-flagged${detail} and signOff=true was supplied without a reason. ` +
      'Overriding a leakage flag requires a non-empty reason so the sign-off is auditable.'
    );
  }

  /**
   * The promotion gate to delegate to. Overridable so unit tests inject a mock with
   * no live DB. The production default ({@link ProductionModelPromotionGate}) is the
   * SAME gate the Promote action uses.
   */
  protected gate(): IModelPromotionGate {
    return new ProductionModelPromotionGate();
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioPromoteModelOperation(): void {
  // intentionally empty
}
