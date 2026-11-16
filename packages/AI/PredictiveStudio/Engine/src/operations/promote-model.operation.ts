/**
 * @module operations/promote-model.operation
 *
 * **Promote ML Model** Remote Operation — the server body for the Manual-mode `PredictiveStudio.PromoteModel`
 * operation. A `Sync` lifecycle-only call that applies ONE `transition` (`evaluate`, `publish`, `archive`, `rollback`)
 * through the {@link LifecycleGate}, the only writer of `MJ: ML Models.Status` (PR 4 §5.3).
 *
 * Per CLAUDE.md "transport-layer architecture", the operation is a THIN adapter — it carries no lifecycle logic. The
 * transition → gate mapping is {@link ModelTransitionDelegation}, shared with the Promote action. The caller is the
 * initiator (`{ kind: 'human', userId }`), so an interactive user is recorded as the approver of a publish.
 *
 * An input that breaks the wire contract (no `modelId`, a `transition` the contract does not have, a non-string `reason`
 * or `signOffId`) is refused before any read with `INVALID_INPUT` naming the field (`PredictiveStudioRefusals.InvalidInput`,
 * a code from Core's catalog), so no transition is attempted and no row is written. A gate refusal is not an error: it is
 * returned as `{ applied: false, status, refusal }`, the refusal being the gate's `TransitionRefusal`, so a caller can say
 * in words why nothing changed.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation } from '@memberjunction/core';
import {
  PredictiveStudioPromoteModelOperation,
  type PredictiveStudioPromoteModelInput,
  type PredictiveStudioPromoteModelOutput,
} from '@memberjunction/core-entities';

import { LifecycleGate } from '../registry/lifecycle-gate';
import { GateContexts } from '../registry/gate-seams';
import { ModelTransitionDelegation, type ModelTransitionResult } from './delegation';
import { PredictiveStudioRefusals } from './refusals';

/**
 * Server implementation of `PredictiveStudio.PromoteModel`. Extends the CodeGen-emitted
 * {@link PredictiveStudioPromoteModelOperation} base (`ExecutionMode='Sync'`, `RequiredScope='predictive:execute'`)
 * and supplies only the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.PromoteModel')
export class PredictiveStudioPromoteModelServerOperation extends PredictiveStudioPromoteModelOperation {
  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioPromoteModelInput,
    provider: IMetadataProvider,
    user: UserInfo,
    _context: RemoteOpServerContext,
  ): Promise<PredictiveStudioPromoteModelOutput> {
    if (!input || typeof input.modelId !== 'string' || input.modelId.trim().length === 0) {
      throw PredictiveStudioRefusals.InvalidInput(this.OperationKey, 'modelId', 'is required');
    }
    const transition = ModelTransitionDelegation.ParseTransition(input.transition);
    if (transition === null) {
      throw PredictiveStudioRefusals.InvalidInput(this.OperationKey, 'transition', `is required (one of: ${ModelTransitionDelegation.Transitions.join(', ')})`);
    }
    for (const field of ['reason', 'signOffId'] as const) {
      const value = input[field];
      if (value !== undefined && value !== null && typeof value !== 'string') throw PredictiveStudioRefusals.InvalidInput(this.OperationKey, field, 'must be a string when given');
    }
    const result = await ModelTransitionDelegation.Apply(
      { ModelID: input.modelId, Transition: transition, Reason: input.reason || null, SignOffID: input.signOffId || null, Initiator: { kind: 'human', userId: user.ID } },
      GateContexts.ForRequest({ ContextUser: user, Provider: provider }),
      this.CreateLifecycleGate(),
    );
    return PredictiveStudioPromoteModelServerOperation.ToOutput(result);
  }

  /** The operation's output for a gate result: `applied` and the status, with the gate's refusal when it refused. */
  public static ToOutput(result: ModelTransitionResult): PredictiveStudioPromoteModelOutput {
    if (result.Applied === true) return { applied: true, status: result.Status };
    return { applied: false, status: result.Status, refusal: result.Refusal };
  }

  /** The lifecycle gate the transition runs through (production: {@link LifecycleGate}). Overridable so tests inject one. */
  protected CreateLifecycleGate(): LifecycleGate {
    return new LifecycleGate();
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioPromoteModelOperation(): void {
  // intentionally empty
}
