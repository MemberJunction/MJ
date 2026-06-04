/**
 * Structured progress event types — generic enough to cover RSU runs, sync runs,
 * connector-creation pipelines, table creation. The vocabulary is fixed; specific
 * subsystems carry their own state shape in the `data` field.
 */

/** What kind of run produced this progress stream. */
export type IntegrationRunKind =
    | 'SyncRun'
    | 'ConnectorCreation'
    | 'RSU'
    | 'TableCreation'
    | 'Discovery'
    | 'Enrichment'
    | 'Other';

/** Event types in the progress.jsonl stream. */
export type IntegrationProgressEventType =
    /** Run started. */
    | 'run.start'
    /** Run terminated successfully. */
    | 'run.complete'
    /** Run terminated with failure. */
    | 'run.fail'
    /** Run cancelled mid-flight by a user/system abort (not a failure, not a clean completion). */
    | 'run.cancel'
    /** Run resumed from a prior checkpoint after a kill/restart. */
    | 'run.resumed'
    /** A named stage within the run started. */
    | 'stage.start'
    /** A named stage within the run completed. */
    | 'stage.complete'
    /** A named stage within the run errored (run may continue or fail). */
    | 'stage.error'
    /** A batch of records is about to be processed (sync paths). */
    | 'records.batch.start'
    /** A batch of records has been processed. */
    | 'records.batch.complete'
    /** A single record errored within a batch. */
    | 'record.error'
    /**
     * A non-fatal warning surfaced during the run. Carries a structured
     * {stage, code, message, data} payload (see {@link SyncWarning}). Distinct
     * from `stage.error`/`record.error`: a warning never fails the run, it is
     * aggregated separately into the result's `warnings[]` rollup.
     */
    | 'warning'
    /** Long-running progress with no record-level granularity. */
    | 'progress.heartbeat'
    /**
     * Resumable checkpoint. Carries `resumableState` — the subsystem-specific
     * shape needed for the run to resume from this exact point. On restart,
     * the resumption engine reads the latest checkpoint event for any in-flight
     * run and hands the resumableState back to the originating service.
     */
    | 'checkpoint'
    /** An outbound API call started (vendor-API debugging, esp. GraphQL). */
    | 'external.call.start'
    /** An outbound API call completed. */
    | 'external.call.complete'
    /** An outbound API call retrying after transient failure. */
    | 'external.call.retry'
    /** TransformRecord (or equivalent) reshaped a record. */
    | 'transform.applied'
    /** Discovery added a new IntegrationObject row. */
    | 'discovery.object.added'
    /** Discovery added a new IntegrationObjectField row. */
    | 'discovery.field.added'
    /** PK classifier invoked for an object. */
    | 'pk.classifier.invoked'
    /** PK classifier returned a verdict. */
    | 'pk.classifier.result'
    /** An MJ entity was generated for an IO row that has a PK. */
    | 'entity.generated'
    /** An IO row was skipped from entity generation because it lacks a PK. */
    | 'entity.skipped-no-pk';

/** Severity levels for progress events. */
export type IntegrationProgressLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Whether an event's `counts` feed the run-level APPLIED aggregate
 * ({@link IntegrationRunResult.aggregateCounts} / {@link IntegrationRunSnapshot.counts}).
 *
 * Two count vocabularies flow through the stream and must NOT both be summed:
 * - `stage.complete` / `run.complete` carry the authoritative **applied** quartet
 *   {processed,succeeded,failed,skipped} for a finished stage/run → these aggregate.
 * - `records.batch.complete` (and `progress.heartbeat`) carry a *fetched* / in-flight
 *   `processed` count for live per-batch progress only. The same records are reported
 *   again — applied — by the stage rollup, so summing batch counts double-counts every
 *   record (a 56-record sync would report processed:112). These do NOT aggregate.
 *
 * The emitter and the reader both call this so a re-derived count always matches the
 * emitter's running aggregate. Centralizing the rule here keeps the two in lock-step.
 */
export function CountsContributeToAggregate(eventType: IntegrationProgressEventType): boolean {
    return eventType === 'stage.complete' || eventType === 'run.complete';
}

/**
 * A structured, non-fatal warning surfaced during an integration run. Emitted via
 * `IntegrationProgressEmitter.warning(...)` as a `'warning'` event and aggregated by
 * the reader into the run result's `warnings[]` rollup (with a `warningCount`).
 * Unlike errors, warnings never fail the run.
 */
export interface SyncWarning {
    /** Stable, machine-matchable warning code (e.g. 'FIELD_TRUNCATED'). */
    code: string;
    /** The stage that produced the warning. */
    stage: string;
    /** Human-readable warning message. */
    message: string;
    /** Optional subsystem-specific structured payload. */
    data?: Record<string, unknown>;
}

/** A single event in the progress.jsonl stream (one line, JSON-encoded). */
export interface IntegrationProgressEvent {
    /** ISO 8601 timestamp. */
    ts: string;
    /** Sequence number within the run (monotonic). */
    seq: number;
    /** Event type. */
    eventType: IntegrationProgressEventType;
    /** Severity (default 'info'). */
    level?: IntegrationProgressLevel;
    /** Stage name (when applicable). */
    stage?: string;
    /** Free-form human message (optional — UI may format from data instead). */
    message?: string;
    /** Counts snapshot — convenient for UI summary without parsing data. */
    counts?: {
        processed?: number;
        succeeded?: number;
        failed?: number;
        skipped?: number;
        totalKnown?: number;
    };
    /**
     * Resumable state — only on `checkpoint` events.
     * Subsystem-specific shape: sync uses {watermark, lastRecordID, batchIndex, pageCursor},
     * pipelines use {currentStep, stageInputs}, etc. The originating service
     * interprets the shape based on `stage`.
     */
    resumableState?: Record<string, unknown>;
    /** Subsystem-specific structured payload. */
    data?: Record<string, unknown>;
}

/** manifest.json — written once at run start. */
export interface IntegrationRunManifest {
    runID: string;
    runKind: IntegrationRunKind;
    integrationID?: string;
    companyIntegrationID?: string;
    objectName?: string;
    triggerType?: 'Manual' | 'Scheduled' | 'Webhook' | 'Pipeline' | 'Restart';
    startedAt: string;
    expectedStages?: string[];
    /** Free-form context (vendor name, RSU mode, etc.). */
    context?: Record<string, unknown>;
}

/** result.json — written once at run end (success or failure). */
export interface IntegrationRunResult {
    runID: string;
    completedAt: string;
    success: boolean;
    exitReason: 'completed' | 'failed' | 'killed' | 'budget-exhausted' | 'aborted';
    durationMs: number;
    aggregateCounts?: {
        processed: number;
        succeeded: number;
        failed: number;
        skipped: number;
    };
    errors?: Array<{ stage?: string; message: string; code?: string }>;
    /** Non-fatal warnings surfaced during the run (rollup of `'warning'` events). */
    warnings?: SyncWarning[];
    /** Total number of `'warning'` events emitted (length of `warnings`). */
    warningCount?: number;
    /** When non-empty, this run is resumable: latest checkpoint event sequence. */
    resumableFromSeq?: number;
}

/** Snapshot returned by the reader API for a single run. */
export interface IntegrationRunSnapshot {
    manifest: IntegrationRunManifest;
    latestEvent?: IntegrationProgressEvent;
    eventCount: number;
    result?: IntegrationRunResult;
    isInFlight: boolean;
    /** Latest counts derived from the event stream. */
    counts?: NonNullable<IntegrationProgressEvent['counts']>;
    /** Non-fatal warnings derived from the `'warning'` events in the stream. */
    warnings?: SyncWarning[];
    /** Total number of `'warning'` events in the stream (length of `warnings`). */
    warningCount?: number;
}

/** Filter shape for the reader's ListRuns API. */
export interface IntegrationRunFilter {
    runKind?: IntegrationRunKind;
    integrationID?: string;
    companyIntegrationID?: string;
    sinceTs?: string;
    inFlightOnly?: boolean;
}
