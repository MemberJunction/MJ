/**
 * @fileoverview {@link PipelineProcessRunTracker} — opens a detail row when a record starts and
 * updates it in place, so a long-running record is visible while it is still running.
 *
 * **Why this is not a change to Record Set Processing.** `IProcessRunTracker` has no per-record
 * start hook — `GenericProcessRunTracker`'s own source says so ("Reliable/insert-before-fire mode is
 * a future enhancement — it needs a per-record start hook on `IProcessRunTracker`"). So the hook
 * lives on the pipeline side: {@link PipelineProcessor} calls {@link OpenDetail}, a method that
 * exists only on this class and not on the interface, before running any stage. When Record Set
 * Processing later calls the standard `RecordResult`, this tracker finalizes the already-open row
 * instead of inserting a new one — turning a single fire-and-forget insert into an open-then-update
 * pair.
 *
 * **This is the one seam the Work Queue replaces.** Once the queue exists, its delivery row *is*
 * live status and the detail row goes back to being written once, at the end. Swapping this tracker
 * out in {@link PipelineRecordProcessRunner} is the whole change; no stage is affected.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJProcessRunDetailEntity } from '@memberjunction/core-entities';
import {
    ProcessRunMeta,
    RecordRef,
    RecordResult,
    RunHandle,
} from '@memberjunction/record-set-processor-base';
import { GenericProcessRunTracker } from '@memberjunction/record-set-processor';
import { ProgressReporter } from './PipelineProcessor.js';

/** An open detail row and the progress accumulated against it. */
interface OpenDetail {
    Detail: MJProcessRunDetailEntity;
    StageName: string;
    StartedAt: Date;
    Progress: string[];
}

/**
 * The pipeline's tracker: open a detail row on start, update it as the stage reports progress,
 * finalize it when the record settles.
 *
 * Constructed together with the processor by {@link PipelineRecordProcessRunner} so the two share a
 * direct object reference rather than being wired through Record Set Processing, which has no way
 * to pass one.
 */
export class PipelineProcessRunTracker extends GenericProcessRunTracker implements ProgressReporter {
    /**
     * Detail rows currently open, keyed by record identity.
     *
     * Safe as an in-memory map because `maxConcurrency` bounds how many records are in flight within
     * a processor instance, and a processor instance is never shared across runs.
     */
    private readonly open = new Map<string, OpenDetail>();

    private handle: RunHandle | null = null;
    private contextUser: UserInfo | null = null;
    private provider: IMetadataProvider | null = null;
    private entityID: string | null = null;

    public override async BeginRun(
        meta: ProcessRunMeta,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<RunHandle> {
        const handle = await super.BeginRun(meta, contextUser, provider);
        this.handle = handle;
        this.contextUser = contextUser;
        this.provider = provider ?? Metadata.Provider;
        this.entityID = meta.EntityID ?? null;
        return handle;
    }

    /**
     * Open a detail row for a record about to be worked on.
     *
     * Awaited by the processor, so the row is on disk before the stage runs and the stage's very
     * first progress report has a row to update. A failure is logged and swallowed by the caller —
     * the record proceeds, just without live visibility.
     */
    public async OpenRecord(key: string, stageName: string): Promise<void> {
        try {
            await this.openDetail(key, stageName);
        } catch (error) {
            LogError(
                `PipelineProcessRunTracker: could not open a detail row for '${key}': ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /** Append a progress line to the open detail row and save it, so status is visible live. */
    public ReportProgress(key: string, message: string): void {
        const entry = this.open.get(key);
        if (!entry) {
            return;
        }
        entry.Progress.push(`${new Date().toISOString()} ${message}`);
        entry.Detail.ResultPayload = JSON.stringify({
            Stage: entry.StageName,
            Status: 'Running',
            Progress: entry.Progress,
        });
        void entry.Detail.Save().catch((error: unknown) => {
            LogError(
                `PipelineProcessRunTracker: progress save failed for '${key}': ` +
                    `${error instanceof Error ? error.message : String(error)}`,
            );
        });
    }

    /**
     * Finalize the open row for this record, or fall back to the base tracker's insert when there
     * is none — which happens when {@link OpenRecord} failed, or when something other than the
     * pipeline processor produced the result.
     */
    public override async RecordResult(
        handle: RunHandle,
        record: RecordRef,
        result: RecordResult,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        const entry = this.open.get(record.RecordID);
        if (!entry) {
            await super.RecordResult(handle, record, result, contextUser, provider);
            return;
        }
        this.open.delete(record.RecordID);

        const detail = entry.Detail;
        detail.Status = result.Status;
        detail.CompletedAt = new Date();
        detail.DurationMs = result.DurationMs ?? Date.now() - entry.StartedAt.getTime();
        detail.AttemptCount = result.AttemptCount ?? 1;
        detail.ErrorMessage = result.ErrorMessage ?? null;
        detail.ResultPayload = JSON.stringify({
            ...(typeof result.ResultPayload === 'object' && result.ResultPayload !== null
                ? (result.ResultPayload as Record<string, unknown>)
                : { Result: result.ResultPayload }),
            Progress: entry.Progress,
        });
        if (!(await detail.Save())) {
            LogError(
                `PipelineProcessRunTracker: failed to finalize detail row for '${record.RecordID}': ` +
                    `${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    /**
     * Records the platform never handed to the processor — Discover's produced items, a splitting
     * reader's children — get one additional detail row each.
     *
     * `RecordID` is the child's real key once committed, or its ephemeral URL identity when the run
     * is a test and nothing was committed.
     */
    public async RecordChildOutcome(
        parentRecord: RecordRef,
        childKey: string,
        result: RecordResult,
    ): Promise<void> {
        if (!this.handle || !this.contextUser) {
            return;
        }
        await super.RecordResult(
            this.handle,
            { EntityID: parentRecord.EntityID, RecordID: childKey },
            result,
            this.contextUser,
            this.provider ?? undefined,
        );
    }

    /** Create and save the `Pending` row, and remember it for the life of this record. */
    private async openDetail(key: string, stageName: string): Promise<void> {
        if (!this.handle || !this.contextUser || this.open.has(key)) {
            return;
        }
        const provider = this.provider ?? Metadata.Provider;
        const detail = await provider.GetEntityObject<MJProcessRunDetailEntity>(
            'MJ: Process Run Details',
            this.contextUser,
        );
        const startedAt = new Date();
        detail.NewRecord();
        detail.ProcessRunID = this.handle.ProcessRunID as string;
        detail.EntityID = this.entityID ?? '';
        detail.RecordID = key;
        detail.Status = 'Pending';
        detail.StartedAt = startedAt;
        detail.AttemptCount = 1;
        detail.ResultPayload = JSON.stringify({ Stage: stageName, Status: 'Running', Progress: [] });
        if (!(await detail.Save())) {
            throw new Error(detail.LatestResult?.CompleteMessage ?? 'unknown error');
        }
        this.open.set(key, { Detail: detail, StageName: stageName, StartedAt: startedAt, Progress: [] });
    }
}
