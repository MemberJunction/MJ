/**
 * @fileoverview Core data types for the Record Set Processor substrate — the shapes shared between
 * the source/processor/tracker seams and the engine. These types are pure data (no behavior) and
 * carry no server-only dependencies, so they are safe to import on the client.
 * @module @memberjunction/record-set-processor-base
 */

import type { ParameterFidelity } from '@memberjunction/ai';
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

/**
 * Whether a Feature Pipeline record changed anything. Mirrors `FeatureValueWriteResult` in
 * `@memberjunction/feature-pipelines`, which this base package cannot depend on: keep the two in step.
 */
export type RecordWriteOutcome = 'Upserted' | 'Unchanged';

/**
 * Why a record failed, when it is a kind the run counts separately: `RejectedInvalid` — an output broke its value
 * constraint; `BelowConfidence` — an output whose floor policy is `fail` was answered below its confidence floor.
 */
export type RecordFailureKind = 'RejectedInvalid' | 'BelowConfidence';

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
    /**
     * Feature Pipelines: the outputs the answer gave below their confidence floor (`MinConfidence`). On a succeeded
     * record they were left unwritten (`OnLowConfidence: 'null'`); on a record failed with `FailureKind`
     * `BelowConfidence` they are why it failed. Absent when every output met its floor.
     */
    BelowConfidenceOutputs?: string[];
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
    /**
     * Records the confidence floor acted on: those whose below-floor outputs were left unwritten (they are also counted
     * as Upserted, Unchanged or Previewed) and those it failed (`FailureKind` `BelowConfidence`, counted apart from
     * {@link Failed}).
     */
    BelowConfidence: number;
    /** Records that failed for any other reason. */
    Failed: number;
    /** Records skipped, on their watermark or by the processor. */
    Skipped: number;
    /** Human-entered values the run's write-backs left in place. */
    HumanValuesPreserved: number;
    /** `completed` only when the run completed with no failed record; else `failed`. */
    Status: 'completed' | 'failed';
    /**
     * A dry run only: why a real run would be refused (e.g. its Feature Pipeline version is not activated), from the
     * processor's run-level check ({@link IRecordProcessor.CurrentRunRefusal}). Absent on a real run, and on a dry run
     * whose real run would go ahead.
     */
    WouldRefuse?: string;
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

/** Preview outcome for a single resolved tag. */
export interface TagWriteBackPreview {
    /** The tag text the result proposed. */
    tagText: string;
    /** The matched tag's ID. */
    resolvedTagID?: string;
    /** The matched tag's name. */
    resolvedTagName?: string;
    /** True when an existing tag matched. */
    matched: boolean;
    /** True when the real write would create the tag (auto-grow). */
    created: boolean;
    /** The root tag the value must live under. */
    rootTagID: string;
    /** The tag's depth below the root. */
    depth?: number;
    /** What the real write would fail on for this tag. */
    error?: string;
    /** True when the tag is matched and the record already carries it, so the real write updates its link instead of creating one. */
    alreadyLinked?: boolean;
    /** True when the tag is already linked at a weight other than the one the real write sets: the write saves the link again, a change. */
    reweighted?: boolean;
}

/** One field of the processed record the real write would change: only fields that differ and hold no human-entered value. */
export interface WriteBackFieldChange {
    /** The field name. */
    Field: string;
    /**
     * The record's current value. `unknown`: it is whatever the entity field holds (text, number, date, ...), a type the
     * field's metadata decides at run time.
     */
    OldValue: unknown;
    /** The value the real write stores; `unknown` for the same reason as {@link OldValue}. */
    NewValue: unknown;
    /** For a foreign-key field: the display name of the record {@link OldValue} points at. Absent when it has none the user may read. */
    OldValueName?: string;
    /** For a foreign-key field: the display name of the record {@link NewValue} points at. Absent as for {@link OldValueName}. */
    NewValueName?: string;
}

/** What the real write does with one child row. */
export type WriteBackChildAction = 'insert' | 'update' | 'delete' | 'none';

/** One child row of the dry-run preview, with what the real write does with it. */
export interface WriteBackChildChange {
    /** The child entity name. */
    Entity: string;
    /** `insert` a new row; `update` an existing row's differing values; `delete` a stale pipeline row; `none` an identical or human-owned row. */
    Action: WriteBackChildAction;
    /**
     * The values the real write stores (an insert: all; an update: the differing ones; a delete or none: the row's key
     * values). `unknown`: they are whatever the child entity's fields hold.
     */
    Values: Record<string, unknown>;
    /**
     * For the foreign-key values in {@link Values}: the display name of the record each points at, by field. A value
     * without a name the user may read is left out.
     */
    ValueNames?: Record<string, string>;
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
    /** IDs of reconciled child rows that were updated. */
    updatedChildIDs?: string[];
    /** IDs of reconciled child rows that were deleted (stale pipeline rows). */
    deletedChildIDs?: string[];
    /** IDs of reconciled child rows that already held the proposed values. */
    unchangedChildIDs?: string[];
    /** IDs of human-owned child rows the result also proposed and that were left untouched. */
    preservedHumanChildIDs?: string[];
    /** Fields whose human-entered value write-back left in place. */
    preservedHumanFields?: string[];
    /** Fields whose Human value a run that overwrites human values retired (the field is the pipeline's again). */
    retiredHumanFields?: string[];
    /**
     * Mapped fields whose answer was withheld (an output below its confidence floor), on a real write and on a dry run
     * alike. Each maps to null: a value the pipeline wrote is cleared, a person's value is kept (`preservedHumanFields`),
     * even on a run that overwrites human values, and a column that does not allow null is left (`withheldKeptFields`).
     */
    withheldFields?: string[];
    /**
     * Withheld fields left as they are because their column does not allow null (a subset of {@link withheldFields}): an
     * abstention cannot clear them, so they keep their value, and the write does not fail on them.
     */
    withheldKeptFields?: string[];
    /** Child entities whose mappings were skipped because the answer withheld them; as {@link withheldFields}. */
    withheldChildEntities?: string[];
    /** IDs of created tagged item records (absent on a dry-run). */
    createdTaggedItemIDs?: string[];
    /** True when this was a dry-run: values were computed (and field names validated) but NOTHING was saved. */
    dryRun?: boolean;
    /** On a dry-run, the resolved field values that WOULD be written to the processed record — the write-back preview. */
    previewFields?: Record<string, unknown>;
    /** On a dry-run with a single child mapping, the resolved child values that WOULD be created. */
    previewChild?: Record<string, unknown>;
    /** On a dry-run with childRecords (or fan-out), the array of resolved child records that WOULD be created. */
    previewChildren?: Array<Record<string, unknown>>;
    /**
     * On a dry run with record field mappings: the fields the real write would change, decided by the same code the
     * write uses (values compared by field type, human-entered values kept), each with the record's current value.
     * Empty when the record already holds every proposed value.
     */
    previewFieldChanges?: WriteBackFieldChange[];
    /** On a dry run with child mappings: every child row with what the real write does with it (see {@link WriteBackChildChange}). */
    previewChildChanges?: WriteBackChildChange[];
    /** On a dry-run with tag mappings, the resolved tag previews. */
    previewTags?: TagWriteBackPreview[];
    /**
     * On a dry run: what the real write would fail on (a foreign-key value with no row in its related entity, a
     * reconcile key proposed twice, a tag outside its root or depth). Absent when the real write would go through.
     */
    PreviewErrors?: string[];
    /** On a dry run: the processed record's display name, so a preview names it. Absent when it has none the user may read. */
    RecordName?: string;
}

/**
 * The `MJ: Process Run Details.ResultPayload` of a record a write-back work type (Infer, Action, Agent) processed:
 * the work's own output, and what applying the output mapping wrote (on a dry run, what it would write).
 */
export interface WriteBackRunPayload {
    /** The work's output, before the output mapping was applied. `unknown`: its shape belongs to whichever work type ran. */
    output?: unknown;
    /** What the output mapping wrote, or on a dry run would write. */
    writeBack?: WriteBackResult;
}

/**
 * One field change of a FieldRules run's per-record diff. On a dry run, a foreign-key field's change also names the
 * records its values point at, so a preview shows names rather than IDs.
 */
export interface FieldRulesPreviewChange extends FieldChange {
    /** A dry run, for a foreign-key field: the display name of the record `OldValue` points at. Absent when it has none the user may read. */
    OldValueName?: string;
    /** A dry run, for a foreign-key field: the display name of the record `NewValue` points at. Absent as for {@link OldValueName}. */
    NewValueName?: string;
}

/** The `MJ: Process Run Details.ResultPayload` of a record a FieldRules run processed: its per-field diff. */
export interface FieldRulesResultPayload {
    /** True when the run was a dry run: the changes were computed, nothing was saved. */
    DryRun: boolean;
    /** Every rule's change, applied or not. */
    Changes: FieldRulesPreviewChange[];
    /** The fields the run wrote (on a dry run, would write). */
    ChangedFields: string[];
    /** A dry run: the processed record's display name. Absent when it has none the user may read. */
    RecordName?: string;
}
