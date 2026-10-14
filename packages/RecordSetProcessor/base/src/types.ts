/**
 * @fileoverview Core data types for the Record Set Processor substrate — the shapes shared between
 * the source/processor/tracker seams and the engine. These types are pure data (no behavior) and
 * carry no server-only dependencies, so they are safe to import on the client.
 * @module @memberjunction/record-set-processor-base
 */

import type { ParameterFidelity } from '@memberjunction/ai';

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

/**
 * Whether a Feature Pipeline record changed anything. Mirrors `FeatureValueWriteResult` in
 * `@memberjunction/feature-pipelines`, which this base package cannot depend on: keep the two in step.
 */
export type RecordWriteOutcome = 'Upserted' | 'Unchanged';

/** Why a record failed, when it is a kind the run counts separately. */
export type RecordFailureKind = 'RejectedInvalid';

/** The outcome of processing a single record, returned by an {@link IRecordProcessor}. */
export interface RecordResult {
    /** Whether the record succeeded, failed, or was skipped. */
    Status: RecordResultStatusValue;
    /** Structured output payload produced for the record (persisted as JSON on the detail row). */
    ResultPayload?: unknown;
    /** Error detail when `Status` is `Failed`. */
    ErrorMessage?: string;
    /** Set when the output failed its constraints: the run counts the record as rejected, apart from other failures. */
    FailureKind?: RecordFailureKind;
    /** Non-fatal problems with this record's processing (e.g. its cache entry could not be stored). */
    Warnings?: string[];
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
    /**
     * The `MJ: AI Prompts` row behind `AIPromptRunID` and `PromptVersionHash`, when it is not the Record
     * Process's own prompt (a Decision pipeline's escalated record is answered by its LLM pipeline's prompt).
     * Absent means the process's own prompt.
     */
    PromptID?: string;
    /** Content hash of the prompt version / instructions used to compute this record's result. */
    PromptVersionHash?: string;
    /** Reference to the FeatureValueCache entry when served from or saved to the cache. */
    FeatureValueCacheID?: string;
    /** Per-output confidence scores keyed by output Name: the driver's own, else the answer's at each ConfidenceRef. */
    Confidence?: Record<string, number>;
    /** Feature Pipelines: whether this record's values and write-back changed anything. Absent on a dry run. */
    Outcome?: RecordWriteOutcome;
    /**
     * Feature Pipelines: true when the record was computed by a dry run, which writes nothing. Such a result has no
     * `Outcome` (it changed nothing); a run summary counts it as a record the real run would have written.
     */
    DryRun?: boolean;
    /** Feature Pipelines: the pipeline version (MJ: Feature Pipeline Versions.Version) that computed the result. */
    PipelineVersion?: number | null;
    /** Feature Pipelines: how many human-entered values this record's write-back left in place. */
    HumanValuesPreserved?: number;
    /** Feature Pipelines: the pin the record was computed under; the run result reports it. */
    PipelinePin?: FeaturePipelineRunPin;
    /** Feature Pipelines: whether the record's model call sent the configured parameters (a refusal on any record is the run's). */
    ParameterFidelity?: ParameterFidelity;
}

/** The pin a Feature Pipeline run computed under: its pipeline version and the Feature Value key hashes. */
export interface FeaturePipelineRunPin {
    /** `MJ: Feature Pipeline Versions.Version` the run computed under; null when no version was resolved. */
    PipelineVersion: number | null;
    /** Hash of the prompt version (template text with its rendered constraints) the values were computed with. */
    PromptVersionHash: string | null;
    /** The primary `MJ: AI Models` ID the prompt ran on; null when the prompt has no primary model. */
    AIModelID: string | null;
    /** Hash of the prompt's inference parameters (temperature, seed, ...). */
    ParametersHash: string | null;
}

/** Result of one Feature Pipeline run; persisted as `MJ: Process Runs.ResultSummary`. */
export interface FeaturePipelineRunResult {
    /** The `MJ: Record Processes` ID of the pipeline that ran. */
    RecordProcessID: string;
    /** The run's pin: the first record's, else the processor's run-level pin (a run whose records were all skipped). */
    Pin: FeaturePipelineRunPin | null;
    /** A refused fidelity when any record had one, else the first record's; null when no record reported one. */
    ParameterFidelity: ParameterFidelity | null;
    /** Records the run handed to the processor: every processed record except those skipped on their watermark. */
    Attempted: number;
    /** Records whose Feature Values or write-back changed something. */
    Upserted: number;
    /** Records whose Feature Values all held their values and whose write-back changed nothing. */
    Unchanged: number;
    /** Records a dry run computed: it writes nothing, so they are neither Upserted nor Unchanged. */
    Previewed: number;
    /** Records whose output failed its constraints (counted apart from {@link Failed}). */
    RejectedInvalid: number;
    /** Records that failed for any other reason. */
    Failed: number;
    /** Records skipped, on their watermark or by the processor. */
    Skipped: number;
    /** Human-entered values the run's write-backs left in place. */
    HumanValuesPreserved: number;
    /** `completed` only when the run completed with no failed record; else `failed`. */
    Status: 'completed' | 'failed';
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
    /** A Feature Pipeline run's result (runs with `FeaturePipeline`); the default tracker persists it as `ResultSummary`. */
    FeaturePipeline?: FeaturePipelineRunResult;
}

/** Result returned by `RecordSetProcessor.Process()` — a run summary plus the persisted run ID. */
export interface ProcessRunResult extends ProcessRunSummary {
    /** ID of the persisted `MJ: Process Runs` row, when a persisting tracker was used. */
    ProcessRunID?: string;
}
