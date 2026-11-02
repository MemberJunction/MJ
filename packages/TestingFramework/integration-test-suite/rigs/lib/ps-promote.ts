/**
 * ps-promote.ts — promote a freshly trained Predictive Studio model so a rig can score it.
 *
 * Scoring refuses a Draft model (`MODEL_NOT_SCORABLE`), and the promotion gate enforces
 * Draft → Validated → Published (no Draft → Published jump), so every rig that trains and then
 * scores promotes stepwise through `PredictiveStudio.PromoteModel`, the call a Studio user's
 * promote makes. `signOff` + `reason` are passed so a leakage-flagged model still reaches Published.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { PredictiveStudioPromoteModelOperation } from '@memberjunction/core-entities';

export type PromotableStatus = 'Validated' | 'Published' | 'Archived';

/** Promote `modelId` one lifecycle step; returns the status after. Throws when the gate refuses. */
export async function PromoteModel(
  provider: IMetadataProvider,
  user: UserInfo,
  modelId: string,
  targetStatus: PromotableStatus,
  reason: string,
): Promise<string> {
  const result = await new PredictiveStudioPromoteModelOperation().Execute(
    { modelId, targetStatus, signOff: true, reason },
    { provider, user },
  );
  if (!result.Success || !result.Output) {
    throw new Error(`Promote → ${targetStatus} failed: ${result.ErrorMessage}`);
  }
  if (!result.Output.promoted) {
    throw new Error(`Promote → ${targetStatus} did not promote (status=${result.Output.status}).`);
  }
  return result.Output.status;
}

/** Promote a Draft model to Published (Draft → Validated → Published); returns the final status. */
export async function PromoteToPublished(provider: IMetadataProvider, user: UserInfo, modelId: string, tag: string): Promise<string> {
  await PromoteModel(provider, user, modelId, 'Validated', `${tag}: promote to Validated so the rig can score`);
  return PromoteModel(provider, user, modelId, 'Published', `${tag}: promote to Published so the rig can score`);
}
