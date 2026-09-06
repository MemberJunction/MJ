/**
 * @module agent/architect-forcing
 *
 * Deciding when the orchestrator must run the Architect, and noticing when it produced nothing.
 *
 * The Architect was previously reached only by LLM routing — so on any given run it might not be
 * consulted at all, and when it WAS consulted it sometimes returned without writing its
 * `Architecture` slice. Both failures land in the same place: a plan with no architecture decision,
 * which the gate reads as the pre-Architect shape and executes as if none was ever intended.
 *
 * Forcing it closes the first case. The `ArchitectureAttempted` flag closes the second: once the
 * Architect has been asked, an absent decision is a FAILURE rather than a legacy plan, and the gate
 * refuses instead of quietly building whatever the Experiment Designer ranked first.
 */
import type { ModelingPlanSpec } from '@memberjunction/predictive-studio-core';

/** Plan state plus the forcing stamp, mirroring the statistics pass. */
export interface PredictiveStudioArchitecturePayload extends ModelingPlanSpec {
  /**
   * The count of USER messages when the orchestrator last forced the Architect. Stops the route
   * firing twice for one message when the Architect returned nothing, while a fresh user message
   * still earns a retry.
   */
  ArchitectureAttemptUserMessageCount?: number;
}

/**
 * Should the orchestrator force the Architect?
 *
 * Once the statistics exist and before anything is built: the decision is supposed to rest on
 * measured evidence, so it waits for the pass, and it must happen before a build because a build
 * without one trains a model no decision selected.
 */
export function shouldForceArchitect(
  payload: PredictiveStudioArchitecturePayload | undefined,
  userMessageCount?: number,
): boolean {
  if (!payload || payload.Architecture) {
    return false;
  }
  // The decision rests on the pre-pass. Forcing it earlier would be the guess-from-the-goal the
  // Architect exists to replace.
  if (!payload.Statistics) {
    return false;
  }
  const stampedAt = payload.ArchitectureAttemptUserMessageCount;
  if (stampedAt === undefined) {
    return true;
  }
  return (userMessageCount ?? 0) > stampedAt;
}
