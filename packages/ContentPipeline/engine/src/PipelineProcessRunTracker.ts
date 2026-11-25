/**
 * @fileoverview {@link PipelineProcessRunTracker} — opens a Process Run Detail row when a record starts and
 * updates it in place, so a long-running record is visible while it runs.
 *
 * `IProcessRunTracker` has no per-record start hook, so the processor calls {@link OpenRecord} itself; when
 * Record Set Processing later calls `RecordResult`, the open row is finalized instead of inserting a new one.
 *
 * @module @memberjunction/content-pipeline
 */

import { IMetadataProvider, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJProcessRunDetailEntity } from '@memberjunction/core-entities';
import { UUIDMap } from '@memberjunction/global';
import { ProcessRunMeta, RecordRef, RecordResult, RunHandle } from '@memberjunction/record-set-processor-base';
import { GenericProcessRunTracker } from '@memberjunction/record-set-processor';
import { ProgressReporter } from './PipelineProcessor.js';

interface OpenDetail {
    Detail: MJProcessRunDetailEntity;
    StageName: string;
    StartedAt: Date;
    Progress: string[];
    /** The un-awaited progress save, which the final save must wait for so it is not overtaken. */
    InFlight?: Promise<unknown>;
}

/** The pipeline's tracker, paired with its processor by the work type's registration. */
export class PipelineProcessRunTracker extends GenericProcessRunTracker implements ProgressReporter {
    /** Open rows by record key. One processor per run, bounded by `maxConcurrency`. */
    private readonly open = new UUIDMap<OpenDetail>();
    private handle: RunHandle | null = null;
    private contextUser: UserInfo | null = null;
    private provider: IMetadataProvider | null = null;
    private entityID: string | null = null;

    public override async BeginRun(meta: ProcessRunMeta, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RunHandle> {
        const handle = await super.BeginRun(meta, contextUser, provider);
        this.handle = handle;
        this.contextUser = contextUser;
        this.provider = provider ?? Metadata.Provider;
        this.entityID = meta.EntityID ?? null;
        return handle;
    }

    /** Open a Pending detail row for a record about to run. A failure is logged, never thrown. */
    public async OpenRecord(key: string, stageName: string): Promise<void> {
        try {
            await this.openDetail(key, stageName);
        } catch (error) {
            LogError(`PipelineProcessRunTracker: could not open a detail row for '${key}': ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** Append a progress line to the record's open row. Not awaited: a stage never waits on telemetry. */
    public ReportProgress(key: string, message: string): void {
        const entry = this.open.Get(key);
        if (!entry) {
            return;
        }
        entry.Progress.push(`${new Date().toISOString()} ${message}`);
        entry.Detail.ResultPayload = JSON.stringify({ Stage: entry.StageName, Status: 'Running', Progress: entry.Progress });
        entry.InFlight = entry.Detail.Save().catch((error: unknown) => {
            LogError(`PipelineProcessRunTracker: progress save failed for '${key}': ${error instanceof Error ? error.message : String(error)}`);
        });
    }

    /** Finalize the record's open row, or fall back to the standard insert when none was opened. */
    public override async RecordResult(
        handle: RunHandle,
        record: RecordRef,
        result: RecordResult,
        contextUser: UserInfo,
        provider?: IMetadataProvider,
    ): Promise<void> {
        const entry = this.open.Get(record.RecordID);
        if (!entry) {
            await super.RecordResult(handle, record, result, contextUser, provider);
            return;
        }
        this.open.Delete(record.RecordID);
        await entry.InFlight;
        const detail = entry.Detail;
        detail.Status = result.Status;
        detail.CompletedAt = new Date();
        detail.DurationMs = result.DurationMs ?? Date.now() - entry.StartedAt.getTime();
        detail.AttemptCount = result.AttemptCount ?? 1;
        detail.ErrorMessage = result.ErrorMessage ?? null;
        const payload = typeof result.ResultPayload === 'object' && result.ResultPayload !== null
            ? (result.ResultPayload as Record<string, unknown>)
            : { Result: result.ResultPayload };
        detail.ResultPayload = JSON.stringify({ ...payload, Progress: entry.Progress });
        if (!(await detail.Save())) {
            LogError(`PipelineProcessRunTracker: failed to finalize detail row for '${record.RecordID}': ${detail.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /** One detail row for a record produced during the run (a discovered item, an archive member). */
    public async RecordChildOutcome(parentRecord: RecordRef, childKey: string, result: RecordResult, childEntityID?: string): Promise<void> {
        if (!this.handle || !this.contextUser) {
            return;
        }
        await super.RecordResult(
            this.handle,
            { EntityID: childEntityID ?? parentRecord.EntityID, RecordID: childKey },
            result,
            this.contextUser,
            this.provider ?? undefined,
        );
    }

    private async openDetail(key: string, stageName: string): Promise<void> {
        if (!this.handle || !this.contextUser || this.open.Has(key)) {
            return;
        }
        const provider = this.provider ?? Metadata.Provider;
        const detail = await provider.GetEntityObject<MJProcessRunDetailEntity>('MJ: Process Run Details', this.contextUser);
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
        this.open.Set(key, { Detail: detail, StageName: stageName, StartedAt: startedAt, Progress: [] });
    }
}
