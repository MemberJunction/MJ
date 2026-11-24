/**
 * ps-promote.ts — take a freshly trained Predictive Studio model through the lifecycle gate so a rig can score it.
 *
 * Scoring refuses a Draft model (`MODEL_NOT_SCORABLE`), and the lifecycle gate moves a model only along the lifecycle
 * table (`evaluate` Draft → Validated or KeepBaseline, the training run's stored decision; then `publish` → Published),
 * so every rig that trains and then scores
 * sends those transitions through `PredictiveStudio.PromoteModel`, the call a Studio user's publish makes. A model whose
 * training run flagged leakage is withheld (`unacknowledged-leakage-flags`) until a person records a sign-off, which a
 * rig cannot make: the helper throws with the gate's refusal, and the rig's log records it.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { PredictiveStudioPromoteModelOperation, type PredictiveStudioModelTransition, type PredictiveStudioTransitionRefusal } from '@memberjunction/core-entities';
import { GateRefusals } from '@memberjunction/predictive-studio';

/** A gate refusal for a rig's failure message: its kind and the gate's plain words, or "no refusal". */
export function GateAnswer(refusal: PredictiveStudioTransitionRefusal | undefined): string {
  return refusal === undefined ? 'no refusal' : `${refusal.kind}: ${GateRefusals.Describe(refusal)}`;
}

/** Apply one lifecycle `transition` to `modelId`; returns the status after. Throws when the operation fails or the gate refuses. */
export async function PromoteModel(
  provider: IMetadataProvider,
  user: UserInfo,
  modelId: string,
  transition: PredictiveStudioModelTransition,
  reason: string,
): Promise<string> {
  const result = await new PredictiveStudioPromoteModelOperation().Execute({ modelId, transition, reason }, { provider, user });
  if (!result.Success || !result.Output) {
    throw new Error(`PromoteModel ${transition} failed: ${result.ErrorMessage}`);
  }
  if (!result.Output.applied) {
    throw new Error(`PromoteModel ${transition} was refused by the lifecycle gate (status=${result.Output.status}, the lifecycle gate's answer: ${GateAnswer(result.Output.refusal)}).`);
  }
  return result.Output.status;
}

/** The statuses `evaluate` may reach: the training run's stored decision (a kept simple baseline scores only once published). */
const EVALUATED_STATUSES: readonly string[] = ['Validated', 'KeepBaseline'];

/** Take a Draft model to Published (`evaluate`, then `publish`), asserting each status reached; returns `Published`. */
export async function PromoteToPublished(provider: IMetadataProvider, user: UserInfo, modelId: string, tag: string): Promise<string> {
  const evaluated = await PromoteModel(provider, user, modelId, 'evaluate', `${tag}: evaluate so the rig can score`);
  if (!EVALUATED_STATUSES.includes(evaluated)) throw new Error(`${tag}: evaluate left ML Model ${modelId} ${evaluated}, not ${EVALUATED_STATUSES.join(' or ')}`);
  const published = await PromoteModel(provider, user, modelId, 'publish', `${tag}: publish so the rig can score`);
  if (published !== 'Published') throw new Error(`${tag}: publish left ML Model ${modelId} ${published}, not Published`);
  return published;
}
