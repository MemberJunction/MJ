/**
 * @module registry/gate-refusals
 *
 * Every {@link TransitionRefusal} in plain words: the `Reason` of its `refusal` publish record and the model's
 * `StatusReason` after a withheld publish (§5.1: "Automatic publish withheld: …"). One exhaustive switch, so a refusal
 * kind added to Core without words here is a compile error.
 */
import type { Actor, TransitionRefusal } from '@memberjunction/predictive-studio-core';

/** Plain-language text for the gate's refusals. */
export class GateRefusals {
  /** One or two sentences saying why the transition was refused. Pure. */
  public static Describe(refusal: TransitionRefusal): string {
    switch (refusal.kind) {
      case 'illegal-transition':
        return `A model in the ${refusal.from} state cannot move to ${refusal.to}.`;
      case 'no-sign-off':
        return 'The protocol requires an approving human sign-off for this publish, and none was found.';
      case 'gate-no-signal':
        return `The stored gate decision ships nothing: ${refusal.reason}`;
      case 'unacknowledged-leakage-flags':
        return `The training run's leakage audit flagged ${refusal.flags.join(', ')}; a sign-off naming each flag is required.`;
      case 'semantics-check-failed':
        return `The output bindings disagree with the model's semantics: ${refusal.mismatches.join('; ')}`;
      case 'actor-not-permitted':
        return `A ${refusal.actor} initiator is not permitted to make this transition.`;
      case 'does-not-beat-incumbent':
        return `The model does not beat the published model ${refusal.incumbentModelId} by the protocol's margin (paired interval [${refusal.comparison.ci[0]}, ${refusal.comparison.ci[1]}]).`;
      case 'status-written-outside-gate':
        return `The status write was refused by the status guard (${refusal.guard.Reason}).`;
      case 'artifact-unverifiable':
        return `The model's artifact could not be verified: ${refusal.detail}`;
      case 'publish-in-progress':
        return 'Another publish of this pipeline or model holds its lock; retry later.';
      case 'keep-baseline-not-auto-published':
        return 'The stored decision keeps the simple baseline, and the protocol does not publish a kept baseline automatically.';
      case 'sign-off-wait-closed':
        return refusal.closedBy === 'expired' ? 'The sign-off wait expired.' : 'A newer training run was evaluated, so the sign-off wait closed.';
      case 'kept-existing-rule':
        return `The stored decision keeps the existing rule "${refusal.rule}"; no model was created.`;
      case 'calibration-held':
        return refusal.slope === null
          ? 'The model is held for calibration: its calibration slope could not be measured on the held-back rows.'
          : `The model is held for calibration: its calibration slope ${refusal.slope.toFixed(2)} is outside the accepted range.`;
      case 'not-servable':
        return `The model cannot be served: ${refusal.reason}`;
      case 'model-not-found':
        return `No ML Model has the ID '${refusal.modelId}'.`;
      case 'reason-required':
        return 'A reason is required.';
      case 'incumbent-not-current':
        return `The training run was compared with model ${refusal.comparedWith}, but model ${refusal.current} is Published now; retrain to compare with it.`;
      default: {
        const unknown: never = refusal;
        return `Refused: ${JSON.stringify(unknown)}`;
      }
    }
  }

  /** The model's `StatusReason` after a withheld publish: "Automatic publish withheld: …" for a non-human initiator. Pure. */
  public static WithheldStatusReason(refusal: TransitionRefusal, initiator: Actor): string {
    const prefix = initiator.kind === 'human' ? 'Publish withheld' : 'Automatic publish withheld';
    return `${prefix}: ${GateRefusals.Describe(refusal)}`;
  }
}
