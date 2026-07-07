/**
 * @module operations/create-scoring-process.operation
 *
 * **Create Scoring Process** Remote Operation — the server body for the Manual-mode
 * `PredictiveStudio.CreateScoringProcess` operation. Creates a persisted, on-demand
 * `WorkType='ML Model'` `MJ: Record Processes` row that scores a target entity's
 * records with a trained model (no schedule). The created row is then run immediately
 * via the generic "Run Record Process" operation, or attached to a recurring schedule
 * via the generic `@memberjunction/ng-scheduling` dialog — so scheduling is NOT this
 * operation's concern.
 *
 * Per CLAUDE.md "transport-layer architecture", this is a THIN adapter: it carries no
 * scoring-process logic. The Record-Process + binding contract lives in
 * {@link createScoringProcess} (shared with the scheduled helper via the
 * `scoring-process-shared` primitives). Validation/save failures throw, so the
 * framework wraps them as a clean `EXECUTION_ERROR` result preserving the message.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation } from '@memberjunction/core';
import {
  PredictiveStudioCreateScoringProcessOperation,
  type PredictiveStudioCreateScoringProcessInput,
  type PredictiveStudioCreateScoringProcessOutput,
} from '@memberjunction/core-entities';
import { createScoringProcess } from '../scoring/scoring-process';

/**
 * Server implementation of `PredictiveStudio.CreateScoringProcess`. Extends the
 * CodeGen-emitted {@link PredictiveStudioCreateScoringProcessOperation} base
 * (`ExecutionMode='Sync'`, `RequiredScope='predictive:execute'`) and supplies only
 * the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.CreateScoringProcess')
export class PredictiveStudioCreateScoringProcessServerOperation extends PredictiveStudioCreateScoringProcessOperation {
  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioCreateScoringProcessInput,
    provider: IMetadataProvider,
    user: UserInfo,
  ): Promise<PredictiveStudioCreateScoringProcessOutput> {
    if (!input?.modelId) {
      throw new Error('modelId is required');
    }
    if (!input.targetEntityName) {
      throw new Error('targetEntityName is required');
    }

    const result = await createScoringProcess({
      modelId: input.modelId,
      targetEntityName: input.targetEntityName,
      scope: input.scope,
      outputField: input.outputField,
      valueKind: input.valueKind,
      primaryKeyField: input.primaryKeyField,
      name: input.name,
      contextUser: user,
      provider,
    });

    return {
      recordProcessId: result.recordProcess.ID,
      wroteColumn: result.binding !== null,
      scoringBindingId: result.binding?.ID,
    };
  }
}
