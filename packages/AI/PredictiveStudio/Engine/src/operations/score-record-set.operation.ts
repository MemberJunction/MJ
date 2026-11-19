/**
 * @module operations/score-record-set.operation
 *
 * **Score Record Set** Remote Operation — the server body for `PredictiveStudio.ScoreRecordSet`, the typed peer of the
 * Score *Action*. With a `bindingId` it scores through the binding and writes the binding's Feature Values; without one
 * it predicts and returns the predictions, writing nothing. A completed run is `Success = true` with the run under
 * `Output`; a refused or failed run is `Success = false` with the refusal's `ResultCode` and a message naming the
 * refusal and the scoring run (the structured refusal is stored on that `MJ: ML Scoring Runs` row).
 *
 * Per CLAUDE.md "transport-layer architecture", the operation is a THIN adapter: the scope resolution and the
 * `ScoringService` call live in {@link ProductionScoreRecordSetRunner}, shared with the Score action.
 *
 * Marked `LongRunning` (a large scope can take a while): it emits coarse start/finish progress.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, RemoteOpResult, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation, type RemoteOpServerContext } from '@memberjunction/core';
import {
  PredictiveStudioScoreRecordSetOperation,
  type PredictiveStudioScoreRecordSetInput,
  type PredictiveStudioScoreRecordSetOutput,
} from '@memberjunction/core-entities';

import { PredictiveStudioScoreRecordSetAction, type IScoreRecordSetRunner, type ScoreRecordSetScope } from '../actions/score-record-set.action';
import type { ProductionScoreRecordSetRunner } from '../actions/score-record-set.runner';
import { ScoreRecordSetViaRunner, BuildScoreRecordSetRunner } from './delegation';
import { PredictiveStudioRefusals } from './refusals';

/**
 * Server implementation of `PredictiveStudio.ScoreRecordSet`. Extends the
 * CodeGen-emitted {@link PredictiveStudioScoreRecordSetOperation} base
 * (`ExecutionMode='LongRunning'`, `RequiredScope='predictive:execute'`) and supplies
 * only the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.ScoreRecordSet')
export class PredictiveStudioScoreRecordSetServerOperation extends PredictiveStudioScoreRecordSetOperation {
  /** Returns refusals as typed `ResultCode`s (see `PredictiveStudioRefusals`). */
  public override async ExecuteServer(
    input: PredictiveStudioScoreRecordSetInput,
    context: RemoteOpServerContext,
  ): Promise<RemoteOpResult<PredictiveStudioScoreRecordSetOutput>> {
    return PredictiveStudioRefusals.ExecuteServer(
      () => this.Authorize(input, context.user),
      () => this.InternalExecute(input, context.provider, context.user, context),
      this.OperationKey,
    );
  }

  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioScoreRecordSetInput,
    provider: IMetadataProvider,
    user: UserInfo,
    context: RemoteOpServerContext,
  ): Promise<PredictiveStudioScoreRecordSetOutput> {
    if (!input?.modelId) throw PredictiveStudioRefusals.InvalidInput(this.OperationKey, 'modelId', 'is required');
    const scope: ScoreRecordSetScope | undefined = input.scope;
    if (!scope || PredictiveStudioScoreRecordSetAction.CountScopeSelectors(scope) !== 1) {
      throw PredictiveStudioRefusals.InvalidInput(this.OperationKey, 'scope', 'must populate exactly one of: records, viewId, listId, filter, single');
    }
    context.emitProgress({ OperationKey: this.OperationKey, Processed: 0, Status: 'Running', Message: `Scoring records with model ${input.modelId}…` });

    const outcome = await ScoreRecordSetViaRunner(
      {
        modelId: input.modelId, bindingId: input.bindingId, scope, asOfDate: input.asOfDate,
        dryRun: input.dryRun === true, contextUser: user, provider,
      },
      this.runner(),
    );
    const result = outcome.Result;
    context.emitProgress({ OperationKey: this.OperationKey, Processed: result.Total, Status: 'Running', Message: `Scored ${result.Total}, wrote ${result.Written} (scoring run ${result.ScoringRunID}).` });
    return {
      status: result.Status, scoringRunId: result.ScoringRunID, modelId: result.ModelID, modelVersion: result.ModelVersion, artifactSha256: result.ArtifactSha256,
      total: result.Total, written: result.Written, dryRun: result.DryRun,
      // Predictions travel only when nothing was written (no binding, or a dry run).
      predictions: outcome.Predictions.length > 0 ? [...outcome.Predictions] : undefined,
    };
  }

  /**
   * The scoring runner to delegate to. Overridable so unit tests inject a mock with
   * no live DB / sidecar (mirrors the Action's `createRunner` seam). The production
   * default ({@link ProductionScoreRecordSetRunner}) resolves the scope and calls
   * `ScoringService` — the SAME path the Score action uses.
   */
  protected runner(): IScoreRecordSetRunner {
    return BuildScoreRecordSetRunner();
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioScoreRecordSetOperation(): void {
  // intentionally empty
}
