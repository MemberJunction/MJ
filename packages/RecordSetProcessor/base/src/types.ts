/**
 * @fileoverview Core data types for the Record Set Processor substrate — the shapes shared between
 * the source/processor/tracker seams and the engine. These types are pure data (no behavior) and
 * carry no server-only dependencies, so they are safe to import on the client.
 * @module @memberjunction/record-set-processor-base
 */

/** A reference to a single record to be processed. */
export interface RecordRef {
    /** ID of the entity this record belongs to. */
    EntityID: string;
    /** The record's primary key, serialized to a composite-key-safe string. */
    RecordID: string;
    /** Optional already-loaded record data (a plain row or a `BaseEntity`), to save a re-fetch. */
    Record?: unknown;
}

/**
 * Opaque resume cursor round-tripped between a source and the run tracker. A source populates
 * exactly one of these depending on how it paginates; the engine never interprets it.
 */
export interface ProcessCursor {
    /** Offset (StartRow) for offset-paginated sources. */
    Offset?: number;
    /** Last-seen key for keyset (seek) paginated sources — the single-PK value as a string. */
    Key?: string;
}

/** One page of records returned by a source, plus the cursor to fetch the next page. */
export interface RecordBatch {
    /** The records in this batch (empty when the source is exhausted). */
    Records: RecordRef[];
    /** Cursor to pass to the next `NextBatch()` call. */
    NextCursor: ProcessCursor;
    /** True when this is the final batch — no further records remain. */
    Exhausted: boolean;
    /** Total matching rows in the source, when the source knows it (e.g. from `RunView.TotalRowCount`). */
    TotalRowCount?: number;
}

/** Lifecycle status of a process run. Mirrors the `MJ: Process Runs.Status` value list. */
export type ProcessRunStatusValue = 'Pending' | 'Running' | 'Paused' | 'Completed' | 'Failed' | 'Cancelled';

/** Per-record outcome status. Mirrors the `MJ: Process Run Details.Status` value list. */
export type RecordResultStatusValue = 'Succeeded' | 'Failed' | 'Skipped';

/** What triggered a run. Mirrors the `MJ: Process Runs.TriggeredBy` value list. */
export type TriggeredByValue = 'OnChange' | 'Schedule' | 'OnDemand' | 'Manual';

/** The kind of record-set source. Mirrors the `MJ: Process Runs.SourceType` value list. */
export type SourceTypeValue = 'View' | 'List' | 'Filter' | 'Array' | 'Keyset' | 'SingleRecord';

/** The outcome of processing a single record, returned by an {@link IRecordProcessor}. */
export interface RecordResult {
    /** Whether the record succeeded, failed, or was skipped. */
    Status: RecordResultStatusValue;
    /** Structured output payload produced for the record (persisted as JSON on the detail row). */
    ResultPayload?: unknown;
    /** Error detail when `Status` is `Failed`. */
    ErrorMessage?: string;
    /** Processing duration in milliseconds (the engine fills this in if the processor does not). */
    DurationMs?: number;
    /** Number of attempts made for this record. */
    AttemptCount?: number;
    /** Deep-trace link to an Action Execution Log, when the work was an Action. */
    ActionExecutionLogID?: string;
    /** Deep-trace link to an AI Agent Run, when the work was an Agent. */
    AIAgentRunID?: string;
    /** Deep-trace link to an AI Prompt Run, when the work was an Infer-and-Write-Back. */
    AIPromptRunID?: string;
}

/** Running tallies for a process run. */
export interface RunCounts {
    /** Records handed to the processor so far. */
    Processed: number;
    /** Records that succeeded. */
    Success: number;
    /** Records that failed. */
    Error: number;
    /** Records that were skipped. */
    Skipped: number;
}

/** Progress snapshot emitted to a run's `onProgress` callback. */
export interface ProgressInfo extends RunCounts {
    /** Known total record count, or null when the total is not known up-front. */
    Total: number | null;
    /** The record currently being processed, when available. */
    CurrentRecordID?: string;
}

/** Final (or interim) summary of a process run. */
export interface ProcessRunSummary extends RunCounts {
    /** Terminal or current run status. */
    Status: ProcessRunStatusValue;
    /** Known total record count, or null. */
    Total: number | null;
    /** When the run started. */
    StartTime?: Date;
    /** When the run ended. */
    EndTime?: Date;
    /** Run-level error message when `Status` is `Failed`. */
    ErrorMessage?: string;
}

/** Result returned by `RecordSetProcessor.Process()` — a run summary plus the persisted run ID. */
export interface ProcessRunResult extends ProcessRunSummary {
    /** ID of the persisted `MJ: Process Runs` row, when a persisting tracker was used. */
    ProcessRunID?: string;
}
