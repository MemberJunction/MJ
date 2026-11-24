/**
 * @module operations/withdraw-scoring-binding.operation
 *
 * **Withdraw Scoring Binding** Remote Operation — the server body for the Manual-mode
 * `PredictiveStudio.WithdrawScoringBinding` operation. A thin adapter: the withdrawal (status, then the column copies
 * the binding made, in one transaction) is {@link ScoringBindings.Withdraw}. Failures throw, so the framework wraps
 * them as an `EXECUTION_ERROR` result preserving the message.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation } from '@memberjunction/core';
import {
  PredictiveStudioWithdrawScoringBindingOperation,
  type PredictiveStudioWithdrawScoringBindingInput,
  type PredictiveStudioWithdrawScoringBindingOutput,
} from '@memberjunction/core-entities';
import { ScoringBindings } from '../scoring/scoring-binding';

/**
 * Server implementation of `PredictiveStudio.WithdrawScoringBinding`. Extends the CodeGen-emitted
 * {@link PredictiveStudioWithdrawScoringBindingOperation} base and supplies only the body; registered last so it wins
 * server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.WithdrawScoringBinding')
export class PredictiveStudioWithdrawScoringBindingServerOperation extends PredictiveStudioWithdrawScoringBindingOperation {
  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioWithdrawScoringBindingInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<PredictiveStudioWithdrawScoringBindingOutput> {
    if (!input?.bindingId) {
      throw new Error('bindingId is required');
    }
    const outcome = await ScoringBindings.Withdraw(input.bindingId, { ContextUser: user, Provider: provider });
    return { cleared: outcome.Cleared, keptHuman: outcome.KeptHuman };
  }
}
