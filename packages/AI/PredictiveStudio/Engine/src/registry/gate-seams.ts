/**
 * @module registry/gate-seams
 *
 * The gate's production seams. The evidence builder ({@link StoredEvidenceBuilder}), the sign-off lookup
 * ({@link StoredSignOffLookup}) and the semantics check ({@link StoredSemanticsCheck}, the model's `MJ: ML Output
 * Bindings` rows against its `OutputSemantics`) live in `governance`. {@link GateContexts.ForRequest} builds a gate
 * context with them over a request's user and provider.
 */
import { StoredEvidenceBuilder } from '../governance/evidence-builder';
import { StoredSemanticsCheck } from '../governance/semantics-checker';
import { StoredSignOffLookup } from '../governance/sign-off-lookup';
import type { GateContext } from './gate-context';
import type { RegistryContext } from './registry-context';

/** Gate contexts. */
export class GateContexts {
  /**
   * A gate context over a request's user and provider: the stored-rows evidence builder, the sign-off lookup over
   * `MJ: ML Model Publish Records`, and the semantics check over `MJ: ML Output Bindings`.
   */
  public static ForRequest(ctx: RegistryContext): GateContext {
    return {
      ContextUser: ctx.ContextUser,
      Provider: ctx.Provider,
      EvidenceBuilder: new StoredEvidenceBuilder(),
      SemanticsCheck: new StoredSemanticsCheck(),
      SignOffLookup: new StoredSignOffLookup(),
    };
  }
}
