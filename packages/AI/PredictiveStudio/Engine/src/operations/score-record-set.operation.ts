/**
 * @module operations/score-record-set.operation
 *
 * **Score Record Set** Remote Operation — the server body for the Manual-mode
 * `PredictiveStudio.ScoreRecordSet` operation. The typed peer of the Score *Action*:
 * it resolves the requested scope and scores it with a trained model, returning the
 * counts plus either ephemeral predictions or a write-back confirmation.
 *
 * Per CLAUDE.md "transport-layer architecture", the operation is a THIN adapter —
 * it carries no scoring logic. The scope resolution + `MLModelInferenceProcessor`
 * batch path live in {@link ProductionScoreRecordSetRunner}, shared with the Score
 * action via {@link scoreRecordSetViaRunner}.
 *
 * Marked `LongRunning` (a large scope can take a while): it emits coarse start/finish
 * progress. The runner does not expose a per-record progress hook today, so progress
 * is bounded to the lifecycle phases.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation, type RemoteOpServerContext } from '@memberjunction/core';
import {
  PredictiveStudioScoreRecordSetOperation,
  type PredictiveStudioScoreRecordSetInput,
  type PredictiveStudioScoreRecordSetOutput,
} from '@memberjunction/core-entities';

import type {
  IScoreRecordSetRunner,
  ScoringScope,
  WriteBackDirective,
} from '../actions/score-record-set.action';
import { ProductionScoreRecordSetRunner } from '../actions/score-record-set.runner';
import { scoreRecordSetViaRunner, buildScoreRecordSetRunner } from './delegation';

/**
 * Server implementation of `PredictiveStudio.ScoreRecordSet`. Extends the
 * CodeGen-emitted {@link PredictiveStudioScoreRecordSetOperation} base
 * (`ExecutionMode='LongRunning'`, `RequiredScope='predictive:execute'`) and supplies
 * only the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.ScoreRecordSet')
export class PredictiveStudioScoreRecordSetServerOperation extends PredictiveStudioScoreRecordSetOperation {
  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioScoreRecordSetInput,
    provider: IMetadataProvider,
    user: UserInfo,
    context: RemoteOpServerContext,
  ): Promise<PredictiveStudioScoreRecordSetOutput> {
    if (!input?.modelId) {
      throw new Error('modelId is required');
    }
    const scope = input.scope;
    if (!scope || this.countScopeSelectors(scope) !== 1) {
      throw new Error('scope must populate exactly one of: records, viewId, listId, filter, single');
    }

    context.emitProgress({
      OperationKey: this.OperationKey,
      Processed: 0,
      Status: 'Running',
      Message: `Scoring records with model ${input.modelId}…`,
    });

    const result = await scoreRecordSetViaRunner(
      {
        modelId: input.modelId,
        scope: scope as ScoringScope,
        writeBack: input.writeBack as WriteBackDirective | undefined,
        contextUser: user,
        provider,
      },
      this.runner(),
    );

    context.emitProgress({
      OperationKey: this.OperationKey,
      Processed: result.scoredCount + result.failedCount + result.skippedCount,
      Status: 'Running',
      Message: `Scored ${result.scoredCount}, failed ${result.failedCount}, skipped ${result.skippedCount}.`,
    });

    return {
      scored: result.scoredCount,
      failed: result.failedCount,
      skipped: result.skippedCount,
      wroteBack: result.wroteBack,
      // Predictions are ephemeral — only present when NOT writing back (the runner
      // already drops them on write-back; map straight through).
      predictions: result.wroteBack ? undefined : result.predictions,
    };
  }

  /**
   * Count how many of the mutually-exclusive scope selectors are populated. More
   * than one is ambiguous and is rejected the same as none, so the caller's intent
   * is always unambiguous (mirrors the Score action's `scopeHasTarget`).
   */
  protected countScopeSelectors(scope: PredictiveStudioScoreRecordSetInput['scope']): number {
    let count = 0;
    if (Array.isArray(scope.records) && scope.records.length > 0) count++;
    if (scope.viewId) count++;
    if (scope.listId) count++;
    if (scope.filter) count++;
    if (scope.single) count++;
    return count;
  }

  /**
   * The scoring runner to delegate to. Overridable so unit tests inject a mock with
   * no live DB / sidecar (mirrors the Action's `createRunner` seam). The production
   * default ({@link ProductionScoreRecordSetRunner}) resolves the scope and drives
   * the `MLModelInferenceProcessor` — the SAME path the Score action uses.
   */
  protected runner(): IScoreRecordSetRunner {
    // Use the loader-wired factory so the runner can read the persisted model
    // artifact at score time (a bare `new ProductionScoreRecordSetRunner()` has
    // no artifact loader → "no artifact loader is configured").
    return buildScoreRecordSetRunner();
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioScoreRecordSetOperation(): void {
  // intentionally empty
}
