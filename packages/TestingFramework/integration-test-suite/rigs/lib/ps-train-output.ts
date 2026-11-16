/**
 * ps-train-output — reading a `PredictiveStudio.TrainModel` result in a rig.
 *
 * Type-only imports: reading a result needs no runtime code. (The over-the-wire `ps-live-*` rigs still load the server
 * Engine through `@memberjunction/predictive-studio-truth-suite`, whose index imports it; it registers no entity
 * subclasses, and every Remote Operation they run is routed by their `GraphQLDataProvider` over the wire.)
 */
import type { PredictiveStudioTrainModelOutput } from '@memberjunction/core-entities';

/** A rig's pass/fail recorder: logs the label and counts (or raises) a failure when the condition is false. */
export type RigCheck = (condition: boolean, label: string) => void;

/**
 * The model a `PredictiveStudio.TrainModel` run shipped, asserted against the run's stored gate decision: a model id
 * comes back exactly when the decision ships one (`model` or `keep-simple-baseline`), and the rig needs one for
 * `purpose`. Returns the id, or null when the run shipped none — a failed check that names the stored outcome and reason,
 * never a cast.
 */
export function ShippedModelID(out: Pick<PredictiveStudioTrainModelOutput, 'modelId' | 'gateOutcome' | 'gateReason'>, purpose: string, check: RigCheck): string | null {
  const ships = out.gateOutcome === 'model' || out.gateOutcome === 'keep-simple-baseline';
  check(!!out.modelId === ships, `a model id comes back exactly when the stored gate decision ships one (outcome '${out.gateOutcome ?? 'none'}', model ${out.modelId ?? 'none'})`);
  const shipped = `the run's stored gate decision shipped a model to ${purpose}`;
  check(!!out.modelId, out.modelId ? shipped : `${shipped} (it shipped none: ${out.gateOutcome ?? 'no gate decision'} — ${out.gateReason ?? 'no reason stored'})`);
  return out.modelId || null;
}

/** A {@link RigCheck} for a rig that stops at its first failure: it logs the check and throws when it fails. */
export function RequireCheck(condition: boolean, label: string): void {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) throw new Error(label);
}
