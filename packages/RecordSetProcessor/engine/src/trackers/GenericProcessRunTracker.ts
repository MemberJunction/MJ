/**
 * @fileoverview The default persistence tracker — writes `MJ: Process Runs` (the run header) and
 * `MJ: Process Run Details` (one row per processed record), and implements the pause/cancel
 * handshake by re-reading the run row's `CancellationRequested` flag at each checkpoint.
 * @module @memberjunction/record-set-processor
 */

import { BaseEntitySaveQueue, IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
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
    /**
     * Fire-and-forget queue for per-record detail INSERTs. Each detail is its own entity instance (a
     * distinct key), so detail writes run concurrently without blocking the per-record loop; `CompleteRun`
     * flushes them before finalizing the run. (Reliable/insert-before-fire mode is a future enhancement —
     * it needs a per-record start hook on `IProcessRunTracker`.)
     */
    private readonly detailQueue = new BaseEntitySaveQueue();

    public async BeginRun(meta: ProcessRunMeta, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RunHandle> {
        const md = provider ?? Metadata.Provider;
        const run = await md.GetEntityObject<MJProcessRunEntity>('MJ: Process Runs', contextUser);
        run.NewRecord();
        run.RecordProcessID = meta.RecordProcessID ?? null;
        run.ScheduledJobRunID = meta.ScheduledJobRunID ?? null;
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
        // Fire-and-forget — the detail write must not block the per-record loop, and a failed write must
        // not abort the run (the queue logs failures; CompleteRun flushes + reports the count).
        this.detailQueue.Insert(detail);
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
        // Ensure every fire-and-forget detail write has landed before we finalize the run header.
        const flush = await this.detailQueue.Flush();
        if (flush.failures > 0) {
            LogError(`GenericProcessRunTracker: ${flush.failures} Process Run Detail write(s) failed for run '${(handle as GenericRunHandle).run.ID}'`);
        }

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
