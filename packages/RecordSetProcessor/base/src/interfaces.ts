/**
 * @fileoverview The three pluggable seams of the Record Set Processor — source, processor, and
 * persistence tracker — plus the engine's options shape. The engine ({@link
 * @memberjunction/record-set-processor}) routes every set-iterating job through these interfaces.
 * @module @memberjunction/record-set-processor-base
 */

import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
    ProcessCursor,
    ProcessRunSummary,
    ProgressInfo,
    RecordBatch,
    RecordRef,
    RecordResult,
    RunCounts,
    SourceTypeValue,
    TriggeredByValue,
} from './types';

/** Lightweight, persistable description of a source — used to populate the run header. */
export interface SourceDescriptor {
    /** The kind of source (View / List / Filter / Array / Keyset / SingleRecord). */
    SourceType: SourceTypeValue;
    /** The source's defining ID (ViewID or ListID) when applicable. */
    SourceID?: string;
    /** The source's resolved filter snapshot, when applicable. */
    SourceFilter?: string;
    /** The target entity ID, when the source knows it up-front. */
    EntityID?: string;
}

/**
 * SOURCE seam — yields the record set in cursor-paginated batches. Implementations decide their own
 * pagination strategy (offset vs. keyset); the cursor is opaque to the engine and round-tripped
 * through the tracker for resume.
 */
export interface IRecordSetSource {
    /**
     * Returns the next batch of records after the given cursor.
     * @param cursor - The cursor returned by the previous batch, or `undefined` to start from the beginning.
     * @param batchSize - Maximum number of records to return.
     * @param contextUser - The acting user (required server-side for permissions).
     * @param provider - Optional metadata provider for entity resolution.
     * @returns A batch with the records, the next cursor, and an exhausted flag.
     */
    NextBatch(cursor: ProcessCursor | undefined, batchSize: number, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RecordBatch>;

    /** Returns a persistable description of this source for the run header. */
    Describe(): SourceDescriptor;
}

/** Per-record execution context handed to an {@link IRecordProcessor}. */
export interface RecordProcessorContext {
    /** The acting user. */
    contextUser: UserInfo;
    /** The owning provider — use this for data access (never `new Metadata()`), per the multi-provider rule. */
    provider: IMetadataProvider;
    /** ID of the current process run, when one is being tracked. */
    processRunID?: string;
}

/**
 * PROCESSOR (executor) seam — does the work for a single record and returns its outcome. Concrete
 * processors wrap an Action, an Agent (via Execute Agent), an Infer-&-Write-Back step, or a plain
 * function.
 */
export interface IRecordProcessor {
    /**
     * Processes one record.
     * @param record - The record to process.
     * @param context - The per-record execution context.
     * @returns The record's outcome (Succeeded / Failed / Skipped) plus any payload / trace links.
     */
    ProcessRecord(record: RecordRef, context: RecordProcessorContext): Promise<RecordResult>;
}

/** Opaque handle returned by a tracker's `BeginRun`, threaded back through the other tracker calls. */
export interface RunHandle {
    /** ID of the persisted run, when the tracker persists one. */
    ProcessRunID?: string;
    /** Tracker-private state. */
    [key: string]: unknown;
}

/** Metadata describing a run, supplied to a tracker's `BeginRun`. */
export interface ProcessRunMeta {
    /** FK to the originating Record Process definition (NULL for ad-hoc / engine-driven runs). */
    RecordProcessID?: string;
    /** FK to the owning `ScheduledJobRun` when launched by the scheduler (NULL otherwise). */
    ScheduledJobRunID?: string;
    /** FK to the target entity. */
    EntityID?: string;
    /** What triggered the run. */
    TriggeredBy: TriggeredByValue;
    /** The kind of source. */
    SourceType: SourceTypeValue;
    /** ViewID / ListID, when applicable. */
    SourceID?: string;
    /** Resolved filter snapshot, when applicable. */
    SourceFilter?: string;
    /** Effective batch size. */
    BatchSize?: number;
    /** Known total record count, or null. */
    TotalItemCount?: number | null;
    /** JSON-serializable snapshot of the effective configuration. */
    Configuration?: unknown;
    /** True when this run is a dry-run (compute-only) preview — persisted on the run header so history can distinguish it from a real apply. */
    DryRun?: boolean;
}

/**
 * PERSISTENCE seam — records run lifecycle, per-record detail, checkpoints, and the pause/cancel
 * handshake. The default `GenericProcessRunTracker` (in the engine package) writes `MJ: Process
 * Runs` / `MJ: Process Run Details`; domain consumers can supply their own (e.g. the classifier's
 * Content Process Runs), and `NoOpTracker` discards everything for fire-and-forget single-record work.
 */
export interface IProcessRunTracker {
    /** Begins a run and returns a handle threaded through the remaining calls. */
    BeginRun(meta: ProcessRunMeta, contextUser: UserInfo, provider?: IMetadataProvider): Promise<RunHandle>;

    /** Records the outcome of a single processed record. */
    RecordResult(handle: RunHandle, record: RecordRef, result: RecordResult, contextUser: UserInfo, provider?: IMetadataProvider): Promise<void>;

    /**
     * Persists the resume cursor + running counts after a batch and reports whether to continue.
     * Implementations that support pause/cancel re-check their backing row's cancellation flag here
     * and return `false` to request a graceful pause.
     * @returns `true` to continue, `false` to pause/stop.
     */
    Checkpoint(handle: RunHandle, cursor: ProcessCursor, counts: RunCounts, contextUser: UserInfo, provider?: IMetadataProvider): Promise<boolean>;

    /** Finalizes the run with its terminal status + summary counts. */
    CompleteRun(handle: RunHandle, summary: ProcessRunSummary, contextUser: UserInfo, provider?: IMetadataProvider): Promise<void>;

    /** Loads the resume cursor for a run being resumed, or `undefined` to start from the beginning. */
    LoadResumeCursor(handle: RunHandle, contextUser: UserInfo, provider?: IMetadataProvider): Promise<ProcessCursor | undefined>;
}

/** Options for a single `RecordSetProcessor.Process()` invocation. */
export interface RecordSetProcessOptions {
    /** The record-set source to iterate. */
    source: IRecordSetSource;
    /** The per-record processor (executor). */
    processor: IRecordProcessor;
    /** Persistence tracker (defaults to `GenericProcessRunTracker` in the engine). */
    tracker?: IProcessRunTracker;
    /** The acting user (required). */
    contextUser: UserInfo;
    /** The owning provider; defaults to the active provider when omitted. */
    provider?: IMetadataProvider;
    /** Optional FK to the originating Record Process definition. */
    recordProcessID?: string;
    /** Optional FK to the owning `ScheduledJobRun` when launched by the scheduler. */
    scheduledJobRunID?: string;
    /** Optional target entity ID (otherwise derived from the source). */
    entityID?: string;
    /** What triggered the run (default `Manual`). */
    triggeredBy?: TriggeredByValue;
    /** Records per batch (default 100). */
    batchSize?: number;
    /** Maximum records processed concurrently within a batch (default 1). */
    maxConcurrency?: number;
    /** Error-rate circuit breaker threshold, as a percentage (default 20). */
    errorThresholdPercent?: number;
    /** Delay between batches in milliseconds (default 0). */
    delayBetweenBatchesMs?: number;
    /** Optional rate-limit applied once per batch before processing. */
    rateLimit?: { requestsPerMinute?: number; tokensPerMinute?: number };
    /** Whether to resume from a prior checkpoint when one exists (default true). */
    resume?: boolean;
    /** Hard cap on the number of records processed this run. */
    maxRecords?: number;
    /** Progress callback invoked after each batch. */
    onProgress?: (progress: ProgressInfo) => void;
    /**
     * Budget-gate hook invoked after each batch. Return `{ continue: false, reason }` to pause the
     * run (e.g. when a per-run cost/item budget is exhausted).
     */
    onAfterBatch?: (batch: RecordRef[], processed: number) => Promise<{ continue: boolean; reason?: string } | null>;
    /** JSON-serializable snapshot of configuration, persisted on the run header. */
    configuration?: unknown;
    /** True when this is a dry-run (compute-only) pass — recorded on the run header so history can distinguish previews from real applies. */
    dryRun?: boolean;
}

// Re-export the progress/summary value types most consumers need alongside the seams.
export type { ProgressInfo, ProcessRunSummary };
