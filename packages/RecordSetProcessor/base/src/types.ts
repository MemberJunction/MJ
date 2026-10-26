/**
 * @fileoverview Core data types for the Record Set Processor substrate — the shapes shared between
 * the source/processor/tracker seams and the engine. These types are pure data (no behavior) and
 * carry no server-only dependencies, so they are safe to import on the client.
 * @module @memberjunction/record-set-processor-base
 */

import type { FieldChange } from '@memberjunction/global';

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

/** Whether a record write changed anything. */
export type RecordWriteOutcome = 'Upserted' | 'Unchanged';

/** Why a record failed, when the run counts it apart: an output broke its value constraint. */
export type RecordFailureKind = 'RejectedInvalid';

/** The outcome of processing a single record, returned by an {@link IRecordProcessor}. */
export interface RecordResult {
    /** Whether the record succeeded, failed, or was skipped. */
    Status: RecordResultStatusValue;
    /** Structured output payload produced for the record (persisted as JSON on the detail row). */
    ResultPayload?: unknown;
    /** Error detail when `Status` is `Failed`. */
    ErrorMessage?: string;
    /** Set when the answer was rejected (see {@link RecordFailureKind}): the run counts it apart from other failures. */
    FailureKind?: RecordFailureKind;
    /** The outputs answered below their confidence floor and withheld. */
    BelowConfidenceOutputs?: string[];
    /** Non-fatal problems with this record's processing (e.g. its cache entry could not be stored). */
    Warnings?: string[];
    /** Processing duration in milliseconds (the engine fills this in if the processor does not). */
    DurationMs?: number;
    /** Number of attempts made for this record. */
    AttemptCount?: number;
    /** Deep-trace link to an Action Execution Log, when the work was an Action. */
    ActionExecutionLogID?: string;
    /**
     * Resolves once the `MJ: Action Execution Logs` row named by {@link ActionExecutionLogID} has been
     * written. The Action engine writes that row fire-and-forget, so the ID can name a row that does not
     * exist yet. A tracker that stores `ActionExecutionLogID` in a foreign key must not save the row
     * before this resolves; it should queue the wait with the save rather than await it here, so the
     * per-record loop never blocks on the log write. Never rejects. A live promise, never serialized;
     * set only by the Action record processor.
     */
    ActionExecutionLogPersisted?: Promise<void>;
    /** Deep-trace link to an AI Agent Run, when the work was an Agent. */
    AIAgentRunID?: string;
    /** Deep-trace link to an AI Prompt Run, when the work was an Infer-and-Write-Back. */
    AIPromptRunID?: string;
    /**
     * The `MJ: AI Prompts` row behind `AIPromptRunID` and `PromptVersionHash`, when it is not the Record
     * Process's own prompt (an escalated record is answered by its target prompt).
     * Absent means the process's own prompt.
     */
    PromptID?: string;
    /** Content hash of the prompt version / instructions used to compute this record's result. */
    PromptVersionHash?: string;
    /** Reference to the FeatureValueCache entry when served from or saved to the cache. */
    FeatureValueCacheID?: string;
    /** Per-output confidence scores keyed by output Name: the driver's own, else the answer's at each ConfidenceRef. */
    Confidence?: Record<string, number>;
    /** Whether this record's values and write-back changed anything. Absent on a dry run. */
    Outcome?: RecordWriteOutcome;
    /** True when a dry run computed the record (nothing written, no `Outcome`). */
    DryRun?: boolean;
    HumanValuesPreserved?: number;
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

/** Progress snapshot emitted to a run's `OnProgress` callback. */
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
    /** Optional processor-specific run summary persisted as JSON in `MJ: Process Runs.ResultSummary`. */
    ResultSummary?: unknown;
    /** On a dry run, why a real run would be refused (e.g. a prerequisite or version gate is not met). */
    WouldRefuse?: string;
}

/** Result returned by `RecordSetProcessor.Process()` — a run summary plus the persisted run ID. */
export interface ProcessRunResult extends ProcessRunSummary {
    /** ID of the persisted `MJ: Process Runs` row, when a persisting tracker was used. */
    ProcessRunID?: string;
}

/** Preview outcome for a single resolved tag. */
export interface TagWriteBackPreview {
    tagText: string;
    resolvedTagID?: string;
    resolvedTagName?: string;
    matched: boolean;
    created: boolean;
    rootTagID: string;
    depth?: number;
    error?: string;
}

/** Outcome of the engine's `ApplyOutputMapping`. */
export interface WriteBackResult {
    /** True if the processed record's fields were actually updated (false on a dry-run, and when every mapped field already held its value). */
    updatedRecord: boolean;
    /** True when anything was written (record field, child insert/update/delete, tag). False for an identical re-run. */
    changed: boolean;
    /** ID of the created child record, when a single child mapping was applied (absent on a dry-run). */
    createdChildID?: string;
    /** IDs of created child records when childRecords (or fan-out) was applied (absent on a dry-run). */
    createdChildIDs?: string[];
    updatedChildIDs?: string[];
    deletedChildIDs?: string[];
    unchangedChildIDs?: string[];
    /** IDs of human-owned child rows the result also proposed and that were left untouched. */
    preservedHumanChildIDs?: string[];
    preservedHumanFields?: string[];
    /** Fields whose Human value a run that overwrites human values retired (the field is the processor's again). */
    retiredHumanFields?: string[];
    /** Mapped fields whose answer was withheld below its confidence floor: cleared where the processor wrote the value. */
    withheldFields?: string[];
    withheldKeptFields?: string[];
    withheldChildEntities?: string[];
    /** IDs of created tagged item records (absent on a dry-run). */
    createdTaggedItemIDs?: string[];
    /** True when this was a dry-run: values were computed (and field names validated) but NOTHING was saved. */
    dryRun?: boolean;
    /** On a dry-run, the fields the real write WOULD change on the processed record, with their new values. */
    previewFields?: Record<string, unknown>;
    /** On a dry-run with a single child mapping, the child values the real write WOULD store. */
    previewChild?: Record<string, unknown>;
    /** On a dry-run with child mappings, the child values the real write WOULD store (an insert's, or an update's differing ones). */
    previewChildren?: Array<Record<string, unknown>>;
    /** On a dry-run with tag mappings, the resolved tag previews. */
    previewTags?: TagWriteBackPreview[];
    /** On a dry run: what the real write would fail on. Absent when the real write would go through. */
    previewErrors?: string[];
    /** On a dry run: processor-deferred record values (e.g. unmapped outputs) that would be stored. Absent when none would change. */
    previewValues?: WriteBackValuePreview[];
}

/** On a dry run, a processor-deferred value that would be stored: its name/label, previous stored value, and proposed value. */
export interface WriteBackValuePreview {
    Name: string;
    Label?: string;
    Previous: unknown;
    Proposed: unknown;
}

/** The `MJ: Process Run Details.ResultPayload` of a record a write-back work type (Infer, Action, Agent) processed. */
export interface WriteBackRunPayload {
    /** The work's output, before the output mapping was applied. `unknown`: its shape belongs to whichever work type ran. */
    output?: unknown;
    /** What the output mapping wrote, or on a dry run would write. */
    writeBack?: WriteBackResult;
}

/** The structured payload recorded on each Process Run Detail of a FieldRules run (the per-record diff). */
export interface FieldRulesResultPayload {
    DryRun: boolean;
    Changes: FieldChange[];
    ChangedFields: string[];
}
