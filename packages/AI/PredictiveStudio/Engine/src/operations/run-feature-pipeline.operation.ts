/**
 * @module operations/run-feature-pipeline.operation
 *
 * **Run Feature Pipeline** Remote Operation — the server body for the Manual-mode
 * `PredictiveStudio.RunFeaturePipeline` operation. A Feature Pipeline is a
 * *categorized* `MJ: Record Processes` row (it has no dedicated entity), so running
 * one is exactly running the underlying Record Process. This operation therefore
 * delegates straight to the Record Set Processing substrate's facade
 * (`RecordProcessExecutor.RunByID`) — the same hardened batching / resume / audit
 * path every bulk operation uses — rather than re-implementing any iteration logic.
 *
 * Per CLAUDE.md "record-set-processing guide": don't re-implement batching/audit;
 * compose the substrate. Marked `LongRunning`: it forwards the executor's per-batch
 * progress as typed `RemoteOpProgress`, so an attached caller (and the over-the-wire
 * progress channel) sees live run progress — mirroring `RecordProcess.RunNow`.
 */

import { RegisterClass } from '@memberjunction/global';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { BaseRemotableOperation, type RemoteOpServerContext } from '@memberjunction/core';
import {
  PredictiveStudioRunFeaturePipelineOperation,
  type PredictiveStudioRunFeaturePipelineInput,
  type PredictiveStudioRunFeaturePipelineOutput,
} from '@memberjunction/core-entities';
import type { RecordProcessScopeOverride } from '@memberjunction/core-entities';
import type { ProcessRunResult } from '@memberjunction/record-set-processor-base';
import { RecordProcessExecutor, type RunRecordProcessOptions } from '@memberjunction/record-set-processor';

/**
 * The narrow facade seam this operation depends on — "run the Record Process with
 * this id and these options, give me the run summary". The production implementation
 * is the substrate's {@link RecordProcessExecutor}; tests inject a deterministic fake
 * so the mapping is unit-testable with no live DB.
 */
export interface IFeaturePipelineRunner {
  /** Run a Record Process by id and return its run summary. */
  RunByID(recordProcessID: string, options: RunRecordProcessOptions): Promise<ProcessRunResult>;
}

/**
 * Server implementation of `PredictiveStudio.RunFeaturePipeline`. Extends the
 * CodeGen-emitted {@link PredictiveStudioRunFeaturePipelineOperation} base
 * (`ExecutionMode='LongRunning'`, `RequiredScope='predictive:execute'`) and supplies
 * only the body; registered last so it wins server-side dispatch.
 */
@RegisterClass(BaseRemotableOperation, 'PredictiveStudio.RunFeaturePipeline')
export class PredictiveStudioRunFeaturePipelineServerOperation extends PredictiveStudioRunFeaturePipelineOperation {
  /** @inheritdoc */
  protected async InternalExecute(
    input: PredictiveStudioRunFeaturePipelineInput,
    provider: IMetadataProvider,
    user: UserInfo,
    context: RemoteOpServerContext,
  ): Promise<PredictiveStudioRunFeaturePipelineOutput> {
    if (!input?.featurePipelineID) {
      throw new Error('featurePipelineID is required');
    }

    const result = await this.runner().RunByID(input.featurePipelineID, {
      contextUser: user,
      provider,
      triggeredBy: 'OnDemand',
      singleRecordID: input.singleRecordID,
      dryRun: input.dryRun,
      // The wire scope shape IS the substrate's RecordProcessScopeOverride (both are
      // the CodeGen-emitted `{ Kind: 'records' | 'view' | 'list' | 'filter'; … }`).
      scope: input.scope as RecordProcessScopeOverride | undefined,
      // Forward the executor's per-batch progress as typed RemoteOpProgress so an
      // attached caller's onProgress (and the over-the-wire channel) sees live progress.
      onProgress: (p) =>
        context.emitProgress({
          OperationKey: this.OperationKey,
          Processed: p.Processed,
          Total: p.Total ?? undefined,
          Status: 'Running',
          Message: `Processed ${p.Processed}${p.Total != null ? ` of ${p.Total}` : ''} record(s)`,
          Payload: { Success: p.Success, Error: p.Error, Skipped: p.Skipped, CurrentRecordID: p.CurrentRecordID },
        }),
    });

    return this.toOutput(result);
  }

  /**
   * Map the substrate's {@link ProcessRunResult} onto the operation's typed output.
   * `written` is the substrate's `Success` count — for a FieldRules feature pipeline
   * those are the records whose feature values were written back (0 in dry-run).
   */
  protected toOutput(result: ProcessRunResult): PredictiveStudioRunFeaturePipelineOutput {
    return {
      processRunID: result.ProcessRunID,
      status: result.Status,
      processed: result.Processed,
      written: result.Success,
      skipped: result.Skipped,
      error: result.Error,
      errorMessage: result.ErrorMessage,
    };
  }

  /**
   * The Record Process facade to delegate to. Overridable so unit tests inject a
   * fake with no live DB. The production default is the substrate's
   * {@link RecordProcessExecutor}.
   */
  protected runner(): IFeaturePipelineRunner {
    return new RecordProcessExecutor();
  }
}

/** Tree-shaking anchor — call from a server bootstrap to retain this registration. */
export function LoadPredictiveStudioRunFeaturePipelineOperation(): void {
  // intentionally empty
}
