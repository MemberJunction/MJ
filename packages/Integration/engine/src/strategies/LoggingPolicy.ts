/**
 * Strategy interfaces for integration logging.
 *
 * Three layers:
 * - IntegrationLogger: structured console/debug logging with table lifecycle events
 * - TransactionLogger: database-persisted audit trail (CompanyIntegrationRunDetail)
 * - SyncLogEntry + AsyncGenerator: streamable log entries for real-time UI via GraphQL subscriptions
 */

// ─── Sync Log Entry (streamable) ────────────────────────────────────

/** Severity level for a log entry */
export type LogSeverity = 'debug' | 'info' | 'warn' | 'error';

/** Phase of the sync pipeline where the log entry was emitted */
export type SyncPhase = 'Auth' | 'Fetch' | 'Transform' | 'Match' | 'Apply' | 'Watermark' | 'Complete' | 'Error';

/** Status of a table in the sync plan */
export type TableSyncStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

/**
 * A single, structured log entry emitted during a sync run.
 * Designed to be yielded from an AsyncGenerator for real-time streaming
 * via a GraphQL subscription resolver.
 */
export interface SyncLogEntry {
    /** When this entry was emitted */
    Timestamp: Date;
    /** Severity level */
    Severity: LogSeverity;
    /** Current pipeline phase */
    Phase: SyncPhase;
    /** The integration object/table this entry relates to (null for run-level entries) */
    ObjectName: string | null;
    /** Human-readable message */
    Message: string;
    /** Structured data for programmatic consumption */
    Data?: Record<string, unknown>;
}

/** Result summary for a completed batch apply */
export interface BatchApplyResult {
    /** Number of records created */
    Created: number;
    /** Number of records updated */
    Updated: number;
    /** Number of records deleted */
    Deleted: number;
    /** Number of records skipped */
    Skipped: number;
    /** Number of records that errored */
    Errored: number;
}

/** Summary of a table's sync status — used for "which tables HAVE synced / WILL sync" reporting */
export interface TableSyncSummary {
    /** Integration object name */
    ObjectName: string;
    /** Current sync status */
    Status: TableSyncStatus;
    /** Records processed so far (0 if pending) */
    RecordsProcessed: number;
    /** Records created */
    RecordsCreated: number;
    /** Records updated */
    RecordsUpdated: number;
    /** Records errored */
    RecordsErrored: number;
    /** Duration in milliseconds (null if not started or in progress) */
    DurationMs: number | null;
    /** Error message if failed */
    ErrorMessage?: string;
}

// ─── Integration Logger ─────────────────────────────────────────────

/** Human-readable structured logger for integration operations with table lifecycle tracking */
export interface IntegrationLogger {
    /** Log an informational message */
    Info(objectName: string, message: string, data?: Record<string, unknown>): void;
    /** Log a warning */
    Warn(objectName: string, message: string, data?: Record<string, unknown>): void;
    /** Log an error */
    Error(objectName: string, message: string, error?: unknown): void;
    /** Log progress (records processed) */
    Progress(objectName: string, processed: number, total?: number): void;
    /** Mark the start of a named phase */
    StartPhase(phase: string, objectName: string): void;
    /** Mark the end of a named phase */
    EndPhase(phase: string, objectName: string, result: 'success' | 'failure'): void;

    // ── Table lifecycle events (informative sync plan) ──────────────

    /**
     * Announce the sync plan: which tables will be synced, in what order.
     * Called before any table starts syncing.
     * @param tables - ordered list of table names that WILL sync
     */
    SyncPlanAnnounce(tables: string[]): void;

    /**
     * Mark a table as starting sync.
     * @param objectName - the table starting
     * @param index - 0-based position in the sync plan
     * @param totalTables - total tables in the plan
     */
    TableStart(objectName: string, index: number, totalTables: number): void;

    /**
     * Mark a table as completed.
     * @param objectName - the table that finished
     * @param summary - counts and timing for this table
     */
    TableComplete(objectName: string, summary: TableSyncSummary): void;

    /**
     * Mark a table as failed.
     * @param objectName - the table that failed
     * @param error - the error that caused the failure
     */
    TableFailed(objectName: string, error: unknown): void;

    /**
     * Mark a table as skipped (e.g., disabled entity map).
     * @param objectName - the table that was skipped
     * @param reason - why it was skipped
     */
    TableSkipped(objectName: string, reason: string): void;

    /**
     * Return the current sync status of all tables.
     * Used by resolvers to show "which tables HAVE synced, which WILL sync".
     */
    GetTableSummaries(): TableSyncSummary[];
}

// ─── Transaction Logger ─────────────────────────────────────────────

/** Database-persisted transaction logger writing to CompanyIntegrationRunDetail */
export interface TransactionLogger {
    /** Log the start of a batch apply operation */
    LogBatchStart(runId: string, objectName: string, batchNumber: number, batchSize: number): void;
    /** Log the completion of a batch apply operation */
    LogBatchComplete(runId: string, objectName: string, batchNumber: number, results: BatchApplyResult): void;
    /** Log an individual record operation (create/update/delete/skip) */
    LogRecordOperation(
        runId: string,
        objectName: string,
        externalId: string,
        operation: 'create' | 'update' | 'delete' | 'skip',
        success: boolean,
        message?: string
    ): void;
    /** Log a phase transition in the sync pipeline */
    LogPhaseTransition(runId: string, fromPhase: string, toPhase: string, objectName: string): void;
    /** Flush buffered log entries to the database */
    Flush(): Promise<void>;

    // ── Streamable log access ───────────────────────────────────────

    /**
     * Returns an AsyncGenerator that yields SyncLogEntry objects in real-time.
     * Used by GraphQL subscription resolvers to stream logs to the UI.
     * The generator completes when the sync run finishes.
     *
     * @param runId - the sync run to stream logs for
     * @returns async generator yielding log entries as they're emitted
     */
    StreamLogs(runId: string): AsyncGenerator<SyncLogEntry, void, undefined>;
}
