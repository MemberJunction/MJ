/**
 * @module actions/promote-model.action
 *
 * **Promote ML Model** action — the thin Action boundary over the {@link LifecycleGate} (PR 4 §5.3). It lets an agent,
 * a workflow or the UI apply ONE lifecycle `Transition` to a model: `evaluate` (Draft → Validated or KeepBaseline from
 * the training run's stored gate decision), `publish` (Validated or KeepBaseline → Published), `archive` (→ Archived,
 * a `Reason` required) or `rollback` (Archived → Published for a model published before, a `Reason` required).
 *
 * Per CLAUDE.md "Actions are boundaries": this action never writes the model; it validates `ModelID` and `Transition`,
 * delegates to the gate through {@link ModelTransitionDelegation} (shared with the `PredictiveStudio.PromoteModel`
 * operation) with the context user as the initiator, and maps the gate's answer to a result code. A leakage flag is
 * acknowledged only by a person's sign-off record, which an action cannot make (D4-04), so a flagged model is refused
 * `LEAKAGE_FLAGGED`.
 *
 * The gate is created behind {@link PredictiveStudioPromoteModelAction.CreateLifecycleGate} so unit tests inject a fake.
 */

import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { RegisterClass } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { TransitionRefusal } from '@memberjunction/predictive-studio-core';

import { BasePredictiveStudioAction } from './base-predictive-studio.action';
import { LifecycleGate } from '../registry/lifecycle-gate';
import { GateContexts } from '../registry/gate-seams';
import { GateRefusals } from '../registry/gate-refusals';
import { ModelTransitionDelegation, type ModelTransitionResult } from '../operations/delegation';

/** The driver-class key this action registers under (matches the metadata row). */
export { PROMOTE_MODEL_DRIVER_CLASS } from './driver-classes';
import { PROMOTE_MODEL_DRIVER_CLASS } from './driver-classes';

/** The result code of each refusal kind the action names on its own; every other kind is `TRANSITION_REFUSED`. */
const REFUSAL_CODES: Partial<Record<TransitionRefusal['kind'], string>> = {
  'unacknowledged-leakage-flags': 'LEAKAGE_FLAGGED',
  'illegal-transition': 'ILLEGAL_TRANSITION',
  'reason-required': 'REASON_REQUIRED',
  'model-not-found': 'MODEL_NOT_FOUND',
  'calibration-held': 'CALIBRATION_HOLD',
  'not-servable': 'MODEL_NOT_SERVABLE',
};

/**
 * Applies one lifecycle transition to a model through the lifecycle gate. Output: `Status` (the model's new status, on
 * success).
 */
@RegisterClass(BaseAction, PROMOTE_MODEL_DRIVER_CLASS)
export class PredictiveStudioPromoteModelAction extends BasePredictiveStudioAction {
  /** @inheritdoc */
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const modelId = this.getStringParam(params, 'ModelID');
    if (!modelId) {
      return this.fail('VALIDATION_ERROR', 'ModelID parameter is required');
    }
    const transition = ModelTransitionDelegation.ParseTransition(this.getStringParam(params, 'Transition'));
    if (transition === null) {
      return this.fail('VALIDATION_ERROR', `Transition parameter is required and must be one of: ${ModelTransitionDelegation.Transitions.join(', ')}`);
    }
    if (!params.ContextUser) {
      return this.fail('VALIDATION_ERROR', 'A context user is required: the lifecycle gate records who started the transition');
    }
    try {
      const result = await ModelTransitionDelegation.Apply(
        { ModelID: modelId, Transition: transition, Reason: this.getStringParam(params, 'Reason') || null, SignOffID: null, Initiator: { kind: 'human', userId: params.ContextUser.ID } },
        GateContexts.ForRequest({ ContextUser: params.ContextUser, Provider: params.Provider || Metadata.Provider }), // global-provider-ok: RunActionParams.Provider is optional; ActionEngine contract falls back to the global provider (ActionEngine-Base.ts)
        this.CreateLifecycleGate(),
      );
      return this.MapResult(params, modelId, transition, result);
    } catch (e) {
      LogError(e);
      return this.fail('PROMOTION_FAILED', `The ${transition} of ML Model ${modelId} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** The gate's result as an {@link ActionResultSimple}: `SUCCESS` with the `Status` output, or the refusal's code. */
  protected MapResult(params: RunActionParams, modelId: string, transition: string, result: ModelTransitionResult): ActionResultSimple {
    if (result.Applied === true) {
      this.addOutputParam(params, 'Status', result.Status);
      return this.ok(params, `Model ${modelId}: ${transition} applied; it is now ${result.Status}.`);
    }
    const code = REFUSAL_CODES[result.Refusal.kind] || 'TRANSITION_REFUSED';
    return this.fail(code, `Model ${modelId}: the lifecycle gate refused the ${transition} (${result.Refusal.kind}). ${GateRefusals.Describe(result.Refusal)}`);
  }

  /** The lifecycle gate the transition runs through (production: {@link LifecycleGate}). Overridable so tests inject a fake. */
  protected CreateLifecycleGate(): LifecycleGate {
    return new LifecycleGate();
  }
}
