/**
 * @fileoverview Routes `RecordProcess.RunNow` to the pipeline's own runner for pipeline processes.
 *
 * **Why this exists.** `RecordProcessExecutor.Run()` never passes a `tracker` to
 * `RecordSetProcessor.Instance.Process()`, so every run started through the metadata-driven path —
 * the `RecordProcess.RunNow` remote operation, the UI's "Run Record Process" action, the scheduled-job
 * trigger — gets the default `GenericProcessRunTracker`. That tracker writes one detail row per
 * record, once, when the record finishes.
 *
 * The pipeline needs its own tracker ({@link PipelineProcessRunTracker}) to open a detail row when a
 * record starts and update it as the stage reports progress. Without this override a pipeline run
 * through the API still *works* — the processor and stages are unaffected — but a long-running
 * record is invisible until it finishes, which is the whole point of phase F2.
 *
 * **What it does NOT change.** Anything that is not a pipeline process is delegated to MJ's
 * implementation untouched, so this override is invisible to every other work type.
 *
 * The cleaner long-term fix is for `RecordProcessExecutor` to accept an injected tracker, which
 * would make this class unnecessary. That is an upstream change; this keeps the behaviour correct in
 * the meantime without touching Record Set Processing.
 *
 * @module @memberjunction/content-pipeline
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseRemotableOperation, IMetadataProvider, RemoteOpServerContext, UserInfo } from '@memberjunction/core';
import {
    MJRecordProcessEntity,
    RecordProcessRunNowInput,
    RecordProcessRunNowOutput,
} from '@memberjunction/core-entities';
import { RecordProcessRunNowServerOperation } from '@memberjunction/record-set-processor';
import { PIPELINE_STAGE_WORK_TYPE } from './PipelineStageRegistration.js';
import { PipelineRecordProcessRunner } from './PipelineRecordProcessRunner.js';

/**
 * `RecordProcess.RunNow`, with pipeline processes routed through {@link PipelineRecordProcessRunner}.
 *
 * Registered at the same key as MJ's implementation and loaded after it, so it wins server-side
 * dispatch — the ordinary subclass-and-re-register extension pattern.
 */
@RegisterClass(BaseRemotableOperation, 'RecordProcess.RunNow')
export class PipelineRunNowOperation extends RecordProcessRunNowServerOperation {
    protected override async InternalExecute(
        input: RecordProcessRunNowInput,
        provider: IMetadataProvider,
        user: UserInfo,
        context: RemoteOpServerContext,
    ): Promise<RecordProcessRunNowOutput> {
        if (!input?.recordProcessID) {
            throw new Error('recordProcessID is required');
        }
        if (!(await this.isPipelineProcess(input.recordProcessID, provider, user))) {
            // Not ours — MJ's implementation, unchanged.
            return super.InternalExecute(input, provider, user, context);
        }

        const result = await new PipelineRecordProcessRunner().RunByID(input.recordProcessID, {
            ContextUser: user,
            Provider: provider,
            TriggeredBy: 'OnDemand',
            SingleRecordID: input.singleRecordID,
            Scope: input.scope,
            DryRun: input.dryRun,
            OnProgress: (p) =>
                context.emitProgress({
                    OperationKey: this.OperationKey,
                    Processed: p.Processed,
                    Total: p.Total ?? undefined,
                    Status: 'Running',
                    Message: `Processed ${p.Processed}${p.Total != null ? ` of ${p.Total}` : ''} record(s)`,
                    Payload: {
                        Success: p.Success,
                        Error: p.Error,
                        Skipped: p.Skipped,
                        CurrentRecordID: p.CurrentRecordID,
                    },
                }),
        });

        return {
            processRunID: result.ProcessRunID,
            status: result.Status,
            processed: result.Processed,
            success: result.Success,
            error: result.Error,
            skipped: result.Skipped,
            errorMessage: result.ErrorMessage,
        };
    }

    /**
     * Whether this Record Process is a pipeline one.
     *
     * Read rather than assumed: the operation is registered for every caller, and sending another
     * work type down the pipeline runner would fail it outright.
     */
    private async isPipelineProcess(
        recordProcessID: string,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<boolean> {
        const rp = await provider.GetEntityObject<MJRecordProcessEntity>('MJ: Record Processes', user);
        if (!(await rp.Load(recordProcessID))) {
            // Let MJ's implementation produce the not-found error, so the message stays consistent.
            return false;
        }
        return rp.WorkType === PIPELINE_STAGE_WORK_TYPE;
    }
}
