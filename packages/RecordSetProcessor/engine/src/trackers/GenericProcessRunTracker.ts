/**
 * @fileoverview The default persistence tracker — writes `MJ: Process Runs` (the run header) and
 * `MJ: Process Run Details` (one row per processed record), and implements the pause/cancel
 * handshake by re-reading the run row's `CancellationRequested` flag at each checkpoint.
 * @module @memberjunction/record-set-processor
 */

import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJProcessRunDetailEntity, MJProcessRunEntity } from '@memberjunction/core-entities';
import {
    IProcessRunTracker,
    ProcessCursor,
    ProcessRunMeta,
    ProcessRunSummary,
    RecordRef,
    RecordResult,
    RunCounts,
    RunHandle,
} from '@memberjunction/record-set-processor-base';

/** Internal handle shape — carries the live run entity between tracker calls. */
interface GenericRunHandle extends RunHandle {
    run: MJProcessRunEntity;
}

/** The default tracker, persisting to the generic `MJ: Process Runs` / `MJ: Process Run Details` tables. */
export class GenericProcessRunTracker implements IProcessRunTracker {
    public async BeginRun(meta: ProcessRunMeta, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RunHandle> {
        const md = provider ?? Metadata.Provider;
        const run = await md.GetEntityObject<MJProcessRunEntity>('MJ: Process Runs', contextUser);
        run.NewRecord();
        run.RecordProcessID = meta.RecordProcessID ?? null;
        run.EntityID = meta.EntityID ?? null;
        run.TriggeredBy = meta.TriggeredBy;
        run.SourceType = meta.SourceType;
        run.SourceID = meta.SourceID ?? null;
        run.SourceFilter = meta.SourceFilter ?? null;
        run.Status = 'Running';
        run.StartTime = new Date();
        run.TotalItemCount = meta.TotalItemCount ?? null;
        run.ProcessedItems = 0;
        run.SuccessCount = 0;
        run.ErrorCount = 0;
        run.SkippedCount = 0;
        run.BatchSize = meta.BatchSize ?? null;
        run.CancellationRequested = false;
        run.StartedByUserID = contextUser?.ID ?? null;
        if (meta.Configuration !== undefined) {
            run.Configuration = JSON.stringify(meta.Configuration);
        }
        const saved = await run.Save();
        if (!saved) {
            throw new Error(`GenericProcessRunTracker: failed to create Process Run: ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return { ProcessRunID: run.ID, run } as GenericRunHandle;
    }

    public async RecordResult(handle: RunHandle, record: RecordRef, result: RecordResult, contextUser: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const md = provider ?? Metadata.Provider;
        const run = (handle as GenericRunHandle).run;
        const detail = await md.GetEntityObject<MJProcessRunDetailEntity>('MJ: Process Run Details', contextUser);
        detail.NewRecord();
        detail.ProcessRunID = run.ID;
        detail.EntityID = record.EntityID;
        detail.RecordID = record.RecordID;
        detail.Status = result.Status;
        detail.CompletedAt = new Date();
        detail.StartedAt = result.DurationMs != null ? new Date(Date.now() - result.DurationMs) : null;
        detail.DurationMs = result.DurationMs ?? null;
        detail.AttemptCount = result.AttemptCount ?? 1;
        detail.ResultPayload = result.ResultPayload !== undefined ? JSON.stringify(result.ResultPayload) : null;
        detail.ErrorMessage = result.ErrorMessage ?? null;
        detail.ActionExecutionLogID = result.ActionExecutionLogID ?? null;
        detail.AIAgentRunID = result.AIAgentRunID ?? null;
        const saved = await detail.Save();
        if (!saved) {
            // A failed detail write must not abort the run — log and continue.
            LogError(`GenericProcessRunTracker: failed to save Process Run Detail for record '${record.RecordID}': ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    public async Checkpoint(handle: RunHandle, cursor: ProcessCursor, counts: RunCounts, _contextUser: UserInfo, _provider?: IMetadataProvider): Promise<boolean> {
        const run = (handle as GenericRunHandle).run;
        run.ProcessedItems = counts.Processed;
        run.SuccessCount = counts.Success;
        run.ErrorCount = counts.Error;
        run.SkippedCount = counts.Skipped;
        if (cursor.Offset != null) {
            run.LastProcessedOffset = cursor.Offset;
        }
        if (cursor.Key != null) {
            run.LastProcessedKey = cursor.Key;
        }
        const saved = await run.Save();
        if (!saved) {
            LogError(`GenericProcessRunTracker: checkpoint save failed for run '${run.ID}': ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return true; // a transient checkpoint failure should not halt processing
        }
        // Re-read to pick up an externally-requested pause/cancel.
        await run.Load(run.ID);
        if (run.CancellationRequested) {
            run.Status = 'Paused';
            run.EndTime = new Date();
            await run.Save();
            return false;
        }
        return true;
    }

    public async CompleteRun(handle: RunHandle, summary: ProcessRunSummary, _contextUser: UserInfo, _provider?: IMetadataProvider): Promise<void> {
        const run = (handle as GenericRunHandle).run;
        run.Status = summary.Status;
        run.EndTime = summary.EndTime ?? new Date();
        run.ProcessedItems = summary.Processed;
        run.SuccessCount = summary.Success;
        run.ErrorCount = summary.Error;
        run.SkippedCount = summary.Skipped;
        if (summary.Total != null) {
            run.TotalItemCount = summary.Total;
        }
        if (summary.ErrorMessage) {
            run.ErrorMessage = summary.ErrorMessage;
        }
        const saved = await run.Save();
        if (!saved) {
            LogError(`GenericProcessRunTracker: failed to complete run '${run.ID}': ${run.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    public async LoadResumeCursor(handle: RunHandle, _contextUser: UserInfo, _provider?: IMetadataProvider): Promise<ProcessCursor | undefined> {
        const run = (handle as GenericRunHandle).run;
        if (run.LastProcessedKey != null) {
            return { Key: run.LastProcessedKey };
        }
        if (run.LastProcessedOffset != null && run.LastProcessedOffset > 0) {
            return { Offset: run.LastProcessedOffset };
        }
        return undefined;
    }
}
