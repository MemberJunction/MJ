import { CompositeKey, DatabaseProviderBase, IMetadataProvider, LogStatusEx, Metadata, RunView, type UserInfo } from '@memberjunction/core';
import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import type {
    MJCompanyIntegrationEntity,
    MJCompanyIntegrationEntityMapEntity,
    MJCompanyIntegrationFieldMapEntity,
    MJCompanyIntegrationRunEntity,
    MJCompanyIntegrationRunDetailEntity,
    MJCompanyIntegrationRecordMapEntity,
    MJCompanyIntegrationSyncWatermarkEntity,
    MJIntegrationEntity,
    MJIntegrationSourceTypeEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import type {
    ICompanyIntegrationEntityMap,
    ICompanyIntegrationFieldMap,
} from './entity-types.js';
import type {
    SyncResult,
    MappedRecord,
    ExternalRecord,
    SyncTriggerType,
    SyncProgress,
    OnProgressCallback,
    OnNotificationCallback,
    SyncNotification,
    WatermarkType,
    IntegrationSyncOptions,
    EntityMapSyncResult,
    SyncProgressSnapshot,
    SchemaPromotionResult,
    PostSyncSchemaPromotionCallback,
} from './types.js';
import { ClassifyError, IsRetryableError } from './types.js';
import { WithRetry } from './RetryRunner.js';
import { WithTimeout, DEFAULT_OPERATION_TIMEOUTS } from './BaseIntegrationConnector.js';
import { ConnectorFactory } from './ConnectorFactory.js';
import { FieldMappingEngine } from './FieldMappingEngine.js';
import { MatchEngine } from './MatchEngine.js';
import { WatermarkService } from './WatermarkService.js';
import { SyncLogger } from './SyncLogger.js';
import { CONTENT_HASH_COLUMN, computeContentHashWithOverflow, contentHashBasis } from './ContentHash.js';
import { serializeKeyValue } from './KeySerialization.js';
import { CUSTOM_OVERFLOW_COLUMN, hasUnmappedFields } from './CustomOverflow.js';
import { partitionRecords, partitionRollupHash, diffPartitions, partitionKeyForIdentity } from './HashDiff.js';
import { RateLimiter } from './RateLimiter.js';
import { AdaptiveConcurrencyController, RunAdaptive } from './AdaptiveConcurrency.js';
import { mostRecentWinner, type RecencyWinner } from './ConflictRecency.js';
import { IntegrationProgressEmitter } from '@memberjunction/integration-progress-artifacts';
import type { BaseIntegrationConnector, FetchContext, FetchBatchResult } from './BaseIntegrationConnector.js';

/** Default batch size for fetching records from external systems */
const DEFAULT_BATCH_SIZE = 200;

/**
 * Hard ceiling on records the opt-in partitionReconcile (Merkle) mode may accumulate in RAM
 * before it fails loud rather than risking an OOM crash. That mode buffers the ENTIRE fetched
 * set (see applyViaPartitionReconcile) — intended for watermark-less small/medium objects. This
 * cap is generous (well above the "tens of thousands" the mode targets); crossing it means the
 * object is too large for partitionReconcile and the operator should disable it (the default
 * streaming path has no such limit). Turns a silent OOM into an actionable error.
 */
const PARTITION_RECONCILE_MAX_ACCUMULATION = 500_000;

/**
 * Ceiling on the in-memory set of fetched ExternalIDs used for full-sync orphan detection. Past this,
 * we stop tracking + skip the orphan sweep for that entity-map (surfaced as a SyncWarning) rather than
 * grow the set unbounded and risk OOM on a multi-million-row full sync. Incremental syncs don't build
 * this set; only full-sync / partition-reconcile do. Generous on purpose — most objects never hit it.
 */
const ORPHAN_DETECTION_MAX_IDS = 1_000_000;

/**
 * Cap on the retained per-record error SAMPLE in the aggregate run result. RecordsErrored keeps the
 * true count; only this many error objects are kept for diagnostics (FinalizeRun persists the first
 * 100). Prevents a multi-million-row failing run from holding every error object in RAM.
 */
const MAX_AGGREGATE_ERRORS = 200;

/**
 * In-memory safety ceiling for a FULL push (every row of an MJ entity is loaded into RAM before
 * pushing). Past this we fail loud + actionable instead of risking an OOM. Env-overridable for the
 * rare legitimate large full push. The proper long-term fix is a streaming/keyset push.
 */
const FULL_PUSH_MAX_RECORDS = (() => {
    const override = Number(process.env.MJ_INTEGRATION_FULL_PUSH_MAX_RECORDS);
    return Number.isFinite(override) && override > 0 ? Math.floor(override) : 1_000_000;
})();

/**
 * Server-side Integration Engine.
 *
 * Wraps IntegrationEngineBase (cached metadata) via composition and provides
 * the full sync orchestration pipeline: fetch → map → match → validate → apply.
 *
 * Pattern mirrors AIEngine wrapping AIEngineBase.
 *
 * Usage:
 *   await IntegrationEngine.Instance.Config(false, contextUser);
 *   const result = await IntegrationEngine.Instance.RunSync(companyIntegrationID, contextUser);
 */

/**
 * Thrown when a per-record write fails because the destination entity's
 * stored procedure (spCreate/spUpdate/spDelete) doesn't exist in the
 * database. This happens when CodeGen has not been run for an entity that
 * the picker added to the integration's object list — typically right
 * after expanding which sObjects/objects are syncable. The condition is
 * deterministic per entity (no amount of retrying will create the proc),
 * so the engine treats this as fail-stop FOR THE ENTIRE OBJECT instead of
 * per-record: one log line, all remaining records marked as skipped, sync
 * moves on to the next entity. Without this, a single un-CodeGen'd
 * destination object can produce thousands of identical per-record
 * "Could not find stored procedure" errors that drown the run report.
 */
export class SchemaNotGeneratedError extends Error {
    public readonly EntityName: string;
    public readonly StoredProcedureName: string;

    constructor(entityName: string, storedProcedureName: string) {
        super(
            `Schema not generated for entity '${entityName}': stored procedure ` +
            `'${storedProcedureName}' does not exist in the database. ` +
            `Run CodeGen for this entity to create the destination tables/views/procs, then re-sync.`
        );
        this.name = 'SchemaNotGeneratedError';
        this.EntityName = entityName;
        this.StoredProcedureName = storedProcedureName;
    }
}

/**
 * §29 — base of the VALUE-FIT error family: a mapped value cannot fit/coerce into its destination
 * column's type. Per the bounded-typing policy (small columns; large content is an explicit text/json
 * modality), such a value is NEVER truncated/clamped and NEVER widens the column — the offending
 * RECORD is skipped and surfaced as a structured SyncWarning so the gap is visible, not silent, and
 * the rest of the batch still commits. Caught per-record in ApplySingleRecord (catches the base, so
 * every family member is handled uniformly). Add a subclass for each new fit failure mode.
 */
export abstract class ValueFitError extends Error {
    public readonly FieldName: string;
    /** Stable SyncWarning code for this fit failure (e.g. STRING_OVERFLOW_SKIPPED). */
    public abstract readonly WarningCode: string;
    constructor(message: string, fieldName: string) {
        super(message);
        this.name = new.target.name;
        this.FieldName = fieldName;
    }
    /** Structured detail for the SyncWarning payload (subclass-specific). */
    public abstract Details(): Record<string, unknown>;
}

/** A string value wider than its bounded NVARCHAR column. */
export class StringOverflowError extends ValueFitError {
    public readonly WarningCode = 'STRING_OVERFLOW_SKIPPED';
    public readonly ValueLength: number;
    public readonly MaxLength: number;
    constructor(fieldName: string, valueLength: number, maxLength: number) {
        super(`Value for '${fieldName}' is ${valueLength} chars, exceeding the column width ${maxLength}; record skipped (not truncated).`, fieldName);
        this.ValueLength = valueLength;
        this.MaxLength = maxLength;
    }
    public Details(): Record<string, unknown> { return { valueLength: this.ValueLength, maxLength: this.MaxLength }; }
}

/** A numeric value outside its integer column's representable range (e.g. > INT max → would sink the batch at bind time). */
export class NumericOverflowError extends ValueFitError {
    public readonly WarningCode = 'NUMERIC_OVERFLOW_SKIPPED';
    public readonly Value: number;
    public readonly SqlType: string;
    constructor(fieldName: string, value: number, sqlType: string) {
        super(`Value for '${fieldName}' (${value}) is outside the range of its ${sqlType} column; record skipped (not clamped).`, fieldName);
        this.Value = value;
        this.SqlType = sqlType;
    }
    public Details(): Record<string, unknown> { return { value: this.Value, sqlType: this.SqlType }; }
}

/** §29 — integer SQL-type ranges (JS-number-comparable). BIGINT bounds exceed 2^53 so the check is a
 *  no-op there (any JS number already fits); the real overflow risk is INT/SMALLINT/TINYINT. */
const INTEGER_SQL_BOUNDS: Record<string, { min: number; max: number }> = {
    tinyint: { min: 0, max: 255 },
    smallint: { min: -32768, max: 32767 },
    int: { min: -2147483648, max: 2147483647 },
    integer: { min: -2147483648, max: 2147483647 },
    bigint: { min: -9223372036854775808, max: 9223372036854775807 },
};

/**
 * Returns a SchemaNotGeneratedError if the given Save() failure message matches the
 * "CRUD routine doesn't exist yet" pattern for either dialect, otherwise null. When
 * CodeGen hasn't created the spCreate/spUpdate/spDelete for an entity, BaseEntity.Save()
 * returns false and the routine-not-found error lands in LatestResult.CompleteMessage:
 *   - SQL Server: `Could not find stored procedure '<schema>.<name>'`
 *   - PostgreSQL: `function <schema>.<name>(<args>) does not exist` (SQLSTATE 42883)
 * The PG form is what a connector entity in a custom schema hits before its CRUD
 * functions are generated, so it must be classified too (else the run produces
 * per-record errors instead of one fail-fast SchemaNotGeneratedError).
 */
function detectSchemaNotGenerated(entityName: string, errorMessage: string): SchemaNotGeneratedError | null {
    const sqlServer = errorMessage.match(/Could not find stored procedure '([^']+)'/i);
    if (sqlServer) return new SchemaNotGeneratedError(entityName, sqlServer[1]);
    const postgres = errorMessage.match(/function\s+([^(\s]+)\s*\([^)]*\)\s+does not exist/i);
    if (postgres) return new SchemaNotGeneratedError(entityName, postgres[1]);
    return null;
}

export class IntegrationEngine extends BaseSingleton<IntegrationEngine> {
    public constructor() {
        super();
    }
    private readonly fieldMappingEngine = new FieldMappingEngine();
    private readonly matchEngine = new MatchEngine();
    private readonly watermarkService = new WatermarkService();

    /** Optional provider override; falls back to Metadata.Provider when not set. */
    private _provider?: IMetadataProvider;

    /**
     * Server-registered hook for post-sync custom-column promotion (gaps.md §2 / M2). The
     * engine has no dependency on RSU/CodeGen — the server registers an implementation via
     * {@link SetPostSyncSchemaPromotionCallback}. Undefined ⇒ promotion is simply not wired
     * (e.g. unit tests, non-server hosts), which is a no-op.
     */
    private postSyncSchemaPromotionCallback?: PostSyncSchemaPromotionCallback;

    /** Registers (or clears, with undefined) the post-sync custom-column promotion hook. */
    public SetPostSyncSchemaPromotionCallback(callback: PostSyncSchemaPromotionCallback | undefined): void {
        this.postSyncSchemaPromotionCallback = callback;
    }

    /** Returns the active provider — explicit override if set, otherwise the global default. */
    protected get ProviderToUse(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /** In-process lock map to prevent concurrent syncs for the same CompanyIntegration */
    private static readonly activeSyncs = new Map<string, Promise<SyncResult>>();

    /**
     * Per-engine async mutex serializing the DB-WRITE section across concurrently-synced streams.
     * When a layer runs multiple entity maps in parallel (syncConcurrency > 1), they all share ONE
     * provider connection whose transaction state is singular — so concurrent BeginTransaction /
     * SavePoint / Commit calls corrupt each other ("Transaction has not begun", "Cannot roll back
     * SavePoint"). The fetch phase stays parallel (the real throughput win — it's network-bound);
     * only the per-batch write transaction is serialized through this lock. Keyed per engine
     * instance, which owns the shared provider.
     */
    private _writeChain: Promise<unknown> = Promise.resolve();
    private runWriteExclusive<T>(fn: () => Promise<T>): Promise<T> {
        // Run fn after the prior write completes (whether it resolved or rejected); keep the chain
        // alive past failures so one errored batch never deadlocks subsequent writers.
        const run = this._writeChain.then(() => fn(), () => fn());
        this._writeChain = run.then(() => undefined, () => undefined);
        return run;
    }

    /** Abort controllers for cancelling running syncs */
    private static readonly _abortControllers = new Map<string, AbortController>();

    /** Live sync progress — updated on every batch for ALL syncs regardless of caller */
    private static readonly _syncProgress = new Map<string, SyncProgressSnapshot>();

    /** Read current sync progress for a connector. Returns undefined if no sync is running. */
    public static GetSyncProgress(companyIntegrationID: string): SyncProgressSnapshot | undefined {
        return IntegrationEngine._syncProgress.get(companyIntegrationID.toLowerCase());
    }

    /** Cancel a running sync for a connector. Returns true if a sync was found and signalled. */
    public static CancelSync(companyIntegrationID: string): boolean {
        const key = companyIntegrationID.toLowerCase();
        const controller = IntegrationEngine._abortControllers.get(key);
        if (controller) {
            console.log(`[IntegrationEngine] Cancelling sync for ${companyIntegrationID}`);
            controller.abort();
            return true;
        }
        return false;
    }

    /** Get all active sync progress entries */
    public static GetAllSyncProgress(): Map<string, SyncProgressSnapshot> {
        return new Map(IntegrationEngine._syncProgress);
    }

    /** Configurable maximum batch size. Connector batches exceeding this are truncated. */
    public MaxBatchSize: number = DEFAULT_BATCH_SIZE;

    /**
     * Resumes any syncs that were orphaned by a process restart.
     * Finds all CompanyIntegrationRun records with Status='In Progress',
     * determines which entity maps already completed (have run details),
     * and resumes from the remaining entity maps using existing watermarks.
     *
     * Call this once during MJAPI startup after metadata is loaded.
     */
    public async ResumeOrphanedSyncs(contextUser: UserInfo, provider?: IMetadataProvider): Promise<void> {
        if (provider) this._provider = provider;
        await IntegrationEngineBase.Instance.Config(false, contextUser, provider);

        const rv = new RunView();
        const orphanedRuns = await rv.RunView<MJCompanyIntegrationRunEntity>({
            EntityName: 'MJ: Company Integration Runs',
            ExtraFilter: `Status='In Progress'`,
            ResultType: 'entity_object',
            BypassCache: true, // resume must see the live in-progress runs, not a stale cache
        }, contextUser);

        if (!orphanedRuns.Success || orphanedRuns.Results.length === 0) {
            // Nothing to resume is the steady-state at every boot — verbose-only so it doesn't clutter the
            // startup log. Only an ACTUAL resume (the "Found N…" path below) is worth showing by default.
            LogStatusEx({ message: '[IntegrationEngine] No orphaned syncs to resume', verboseOnly: true });
            return;
        }

        console.log(`[IntegrationEngine] Found ${orphanedRuns.Results.length} orphaned sync(s) to resume`);

        for (const run of orphanedRuns.Results) {
            const companyIntegrationID = run.CompanyIntegrationID;
            const runID = run.ID;
            const lockKey = companyIntegrationID.toLowerCase();

            // C1: respect the SAME in-process concurrency lock RunSync uses. If a live sync for this
            // CompanyIntegration is already running (e.g. the scheduler fired during startup), skip the
            // resume — double-running one CI on the shared provider connection corrupts its singular
            // transaction state (exactly what runWriteExclusive guards against WITHIN a run). The
            // get→set pair below has no await between them, so check-and-reserve is atomic on the loop.
            if (IntegrationEngine.activeSyncs.get(lockKey)) {
                console.log(`[IntegrationEngine] Skipping resume of run ${runID.substring(0, 8)} — a live sync for ${lockKey} is already running`);
                continue;
            }
            let resolveResumeLock!: (r: SyncResult) => void;
            let resumeResult: SyncResult | undefined;
            IntegrationEngine.activeSyncs.set(lockKey, new Promise<SyncResult>(res => { resolveResumeLock = res; }));

            try {
                // Find which entity MAPS already completed SUCCESSFULLY in this run. We correlate
                // by EntityMapID (parsed from the detail's RecordID, stamped by CreateRunDetail),
                // not EntityID — two maps can target the same MJ Entity, so keying on EntityID
                // could skip a still-pending sibling map. We also require IsSuccess=1: a map that
                // completed WITH errors (RecordsErrored>0, no throw) must be re-attempted on resume,
                // otherwise its errored records are silently abandoned.
                const detailsResult = await rv.RunView<{ RecordID: string; IsSuccess: boolean }>({
                    EntityName: 'MJ: Company Integration Run Details',
                    ExtraFilter: `CompanyIntegrationRunID='${runID}'`,
                    Fields: ['RecordID', 'IsSuccess'],
                    ResultType: 'simple',
                }, contextUser);

                const completedMapIDs = new Set<string>();
                if (detailsResult.Success) {
                    for (const d of detailsResult.Results) {
                        if (!d.IsSuccess) continue; // completed-with-errors → re-attempt on resume
                        const m = /^EntityMap:([0-9a-fA-F-]+)\|/.exec(d.RecordID ?? '');
                        // Parse-miss falls open (map treated as not-completed → re-runs): at worst a
                        // redundant idempotent re-sync, never a silent skip.
                        if (m) completedMapIDs.add(m[1].toLowerCase());
                    }
                }

                console.log(
                    `[IntegrationEngine] Resuming run ${runID.substring(0, 8)}... ` +
                    `for ${companyIntegrationID.substring(0, 8)}... ` +
                    `(${completedMapIDs.size} entity maps already completed)`
                );

                // Load config and filter to only remaining entity maps (by map ID)
                const config = await this.LoadRunConfiguration(companyIntegrationID, contextUser);
                const remainingMaps = config.entityMaps.filter(
                    em => !completedMapIDs.has(em.ID.toLowerCase())
                );

                if (remainingMaps.length === 0) {
                    console.log(`[IntegrationEngine] All entity maps completed for run ${runID.substring(0, 8)}, marking as Success`);
                    run.EndedAt = new Date();
                    run.Status = 'Success';
                    await run.Save();
                    continue;
                }

                console.log(`[IntegrationEngine] Resuming ${remainingMaps.length} remaining entity maps (of ${config.entityMaps.length} total)`);

                // Replace entityMaps with only the remaining ones
                config.entityMaps = remainingMaps;

                // Execute remaining maps using the existing run record
                const result = await this.ExecuteEntityMaps(config, run, contextUser);
                result.RunID = runID;
                await this.FinalizeRun(run, result, contextUser);
                resumeResult = result;

                console.log(
                    `[IntegrationEngine] Resume complete for ${runID.substring(0, 8)}: ` +
                    `${result.RecordsCreated} created, ${result.RecordsUpdated} updated, ` +
                    `${result.RecordsErrored} errored`
                );
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[IntegrationEngine] Failed to resume run ${runID.substring(0, 8)}: ${errMsg}`);

                // Mark as failed so it doesn't get picked up again
                run.EndedAt = new Date();
                run.Status = 'Failed';
                run.ErrorLog = JSON.stringify([{ ErrorMessage: `Resume failed: ${errMsg}` }]);
                await run.Save();
            } finally {
                // Release the C1 lock + unblock any RunSync that began awaiting this resume (RunSync returns
                // `existing`). Resolve with the real result when we have one, else a benign empty result so no
                // waiter hangs. Promise resolve is idempotent and the early-exit `continue` also lands here.
                IntegrationEngine.activeSyncs.delete(lockKey);
                resolveResumeLock(resumeResult ?? {
                    Success: false, ErrorMessage: 'Resume produced no result', RecordsProcessed: 0,
                    RecordsCreated: 0, RecordsUpdated: 0, RecordsDeleted: 0, RecordsErrored: 0,
                    RecordsSkipped: 0, Errors: [], EntityMapResults: [], Duration: 0,
                });
            }
        }
    }

    /**
     * Executes a full sync run for a company integration.
     * If a sync is already running for the same integration, waits for it to finish
     * and returns the existing result (concurrency lock).
     *
     * @param companyIntegrationID - ID of the CompanyIntegration to sync
     * @param contextUser - User context for all data operations
     * @param triggerType - What triggered this sync (defaults to 'Manual')
     * @param onProgress - Optional callback invoked with progress updates during sync
     * @param onNotification - Optional callback invoked with a notification when the sync completes or fails
     * @returns Aggregate sync result with record counts and errors
     */
    public async RunSync(
        companyIntegrationID: string,
        contextUser: UserInfo,
        triggerType: SyncTriggerType = 'Manual',
        onProgress?: OnProgressCallback,
        onNotification?: OnNotificationCallback,
        options?: IntegrationSyncOptions,
        provider?: IMetadataProvider
    ): Promise<SyncResult> {
        if (provider) this._provider = provider;
        const lockKey = companyIntegrationID.toLowerCase();
        const existing = IntegrationEngine.activeSyncs.get(lockKey);
        if (existing) {
            console.warn(`[IntegrationEngine] Sync already running for ${lockKey}, waiting...`);
            return existing;
        }

        // Initialize abort controller and progress tracking
        const abortController = new AbortController();
        IntegrationEngine._abortControllers.set(lockKey, abortController);
        IntegrationEngine._syncProgress.set(lockKey, {
            StartedAt: new Date(),
            CurrentEntity: '',
            EntityMapsTotal: 0,
            EntityMapsCompleted: 0,
            RecordsProcessed: 0,
            RecordsCreated: 0,
            RecordsUpdated: 0,
            RecordsErrored: 0,
            TriggerType: triggerType,
        });

        // Wrap caller's onProgress with internal tracking
        const wrappedProgress: OnProgressCallback = (progress) => {
            const entry = IntegrationEngine._syncProgress.get(lockKey);
            if (entry) {
                entry.EntityMapsTotal = progress.TotalEntityMaps;
                entry.EntityMapsCompleted = progress.EntityMapIndex;
                entry.RecordsProcessed = progress.RecordsProcessedInCurrentMap;
            }
            if (onProgress) onProgress(progress);
        };

        const syncPromise = this.executeSyncInternal(
            companyIntegrationID, contextUser, triggerType, wrappedProgress, onNotification, options, abortController.signal
        );
        IntegrationEngine.activeSyncs.set(lockKey, syncPromise);
        try {
            return await syncPromise;
        } finally {
            IntegrationEngine.activeSyncs.delete(lockKey);
            IntegrationEngine._abortControllers.delete(lockKey);
            IntegrationEngine._syncProgress.delete(lockKey);
        }
    }

    /**
     * Internal sync execution method. Contains the full orchestration logic.
     */
    private async executeSyncInternal(
        companyIntegrationID: string,
        contextUser: UserInfo,
        triggerType: SyncTriggerType,
        onProgress?: OnProgressCallback,
        onNotification?: OnNotificationCallback,
        options?: IntegrationSyncOptions,
        abortSignal?: AbortSignal
    ): Promise<SyncResult> {
        const startTime = Date.now();
        const logger = new SyncLogger({ ciId: companyIntegrationID, integration: null });
        logger.emit('sync.run.start', {
            triggerType,
            fullSync: options?.FullSync ?? false,
            scheduledJobRunID: options?.ScheduledJobRunID ?? null,
            entityMapIDsFilter: options?.EntityMapIDs ?? null,
            syncDirectionOverride: options?.SyncDirection ?? null,
        });
        const config = await this.LoadRunConfiguration(companyIntegrationID, contextUser, options);
        logger.attachIntegrationName(config.companyIntegration.Integration);
        logger.emit('sync.config.loaded', {
            integration: config.companyIntegration.Integration,
            integrationID: config.companyIntegration.IntegrationID,
            entityMapsCount: config.entityMaps.length,
            entityMaps: config.entityMaps.map(em => ({
                ExternalObjectName: em.ExternalObjectName,
                Entity: em.Entity,
                SyncDirection: em.SyncDirection,
                IsActive: em.SyncEnabled === true,
                Priority: em.Priority ?? null,
            })),
            maxBatchSize: this.MaxBatchSize,
        });
        logger.emit('sync.connector.built', {
            connectorClass: config.connector?.constructor?.name ?? null,
        });

        // IsActive gate (single authoritative engine-level enforcement). A deactivated
        // CompanyIntegration must not sync regardless of which path triggered it — the GQL
        // StartSync mutation, the scheduled-job driver, or any future caller all funnel
        // through here. Gating BEFORE CreateRunRecord guarantees no orphan 'In Progress'
        // run row is produced for a deactivated connector. IsActive is boolean | null;
        // only an explicit false aborts (null/undefined = not gated, preserving behavior
        // for connections predating the flag).
        if (config.companyIntegration.IsActive === false) {
            const message = 'Connector is deactivated (IsActive=false); sync not started';
            logger.emit('sync.warning', { reason: 'deactivated', message });
            return {
                Success: false,
                ErrorMessage: message,
                RecordsProcessed: 0,
                RecordsCreated: 0,
                RecordsUpdated: 0,
                RecordsDeleted: 0,
                RecordsErrored: 0,
                RecordsSkipped: 0,
                Errors: [],
                EntityMapResults: [],
                Duration: Date.now() - startTime,
            };
        }

        const run = await this.CreateRunRecord(config.companyIntegration, triggerType, contextUser, options?.ScheduledJobRunID);
        logger.attachRunId(run.ID);

        // Durable, queryable, restart-surviving artifact stream for this sync. runID is
        // the CompanyIntegrationRun.ID so the JSONL artifact cross-correlates with the run
        // row. Exposed over GraphQL (IntegrationListRuns / IntegrationGetRun /
        // IntegrationTailRunEvents). Construction is best-effort — a logging-dir problem
        // must never block a sync.
        const progress = this.createSyncProgressEmitter(run.ID, companyIntegrationID, config, triggerType, options, startTime);
        if (progress) {
            logger.attachEmitter(progress);
            try { progress.runStart('Sync run started'); } catch { /* best-effort */ }
        }

        try {
            const result = await this.ExecuteEntityMaps(config, run, contextUser, onProgress, abortSignal, logger);
            result.RunID = run.ID;
            result.Duration = Date.now() - startTime;
            if (result.RecordsErrored > 0) {
                result.ErrorMessage = `Sync completed with ${result.RecordsErrored} error(s)`;
            }
            await this.FinalizeRun(run, result, contextUser, onNotification, abortSignal?.aborted);
            // Post-sync custom-column promotion (gaps.md §2 / M2). Self-gated server-side: a
            // customs-free sync does no work. Skipped for an aborted run. Never throws into the sync.
            if (!abortSignal?.aborted) {
                result.SchemaUpdate = await this.invokePostSyncPromotionSafe(companyIntegrationID, contextUser, result);
                // Restart-signal (M3): when columns were promoted, surface it on the structured
                // stream so a watching client (IntegrationTailRunEvents) knows an MJAPI restart is
                // needed to expose the new columns over GraphQL — read as intentional, not a crash.
                // No new columns ⇒ no event ⇒ no restart (the convergence/1× guarantee). The new
                // columns are already usable by the NEXT sync without a restart (metadata refreshed).
                if (result.SchemaUpdate?.SchemaUpdatePending) {
                    logger.emit('sync.schema_update', {
                        columnsAdded: result.SchemaUpdate.ColumnsAdded,
                        restartRequiredForGraphQL: true,
                    });
                }
                // Surface any non-fatal promotion problems on the structured stream so the operator
                // sees what DIDN'T promote (RSU/DDL/save failure, per-pass cap deferral, missing map) —
                // promotion never fails the sync, but a swallowed problem must not be invisible (§4).
                for (const w of result.SchemaUpdate?.Warnings ?? []) {
                    logger.warning('schema-promotion', 'CUSTOM_COLUMN_PROMOTION_WARNING', w);
                }
            }
            const summary = this.buildSyncResultBody(config.companyIntegration.Integration, result);
            logger.emit('sync.run.complete', {
                success: result.Success && result.RecordsErrored === 0,
                durationMs: result.Duration,
                recordsProcessed: result.RecordsProcessed,
                recordsCreated: result.RecordsCreated,
                recordsUpdated: result.RecordsUpdated,
                recordsDeleted: result.RecordsDeleted,
                recordsSkipped: result.RecordsSkipped,
                recordsErrored: result.RecordsErrored,
                errorCount: result.Errors?.length ?? 0,
            });
            // A cancelled run returns normally (no throw) with abortSignal.aborted set — finalize it as
            // 'cancelled' (exitReason='aborted'), NOT 'completed', so a stopped run is distinguishable.
            await this.finalizeSyncProgress(progress, abortSignal?.aborted ? 'cancelled' : 'completed', result.ErrorMessage);
            console.log(`[IntegrationEngine] Sync complete:\n${summary}`);
            return result;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.emit('sync.run.fail', { error: errMsg, durationMs: Date.now() - startTime });
            await this.finalizeSyncProgress(progress, 'failed', errMsg);
            await this.FailRun(run, err, contextUser, onNotification);
            throw err;
        }
    }

    /**
     * Builds the durable progress emitter for a sync run. Best-effort: returns
     * undefined (and never throws) if the artifact store can't be initialized, so
     * structured logging can never block a sync.
     */
    private createSyncProgressEmitter(
        runID: string,
        companyIntegrationID: string,
        config: RunConfiguration,
        triggerType: SyncTriggerType,
        options: IntegrationSyncOptions | undefined,
        startTimeMs: number
    ): IntegrationProgressEmitter | undefined {
        try {
            return new IntegrationProgressEmitter({
                runID,
                runKind: 'SyncRun',
                integrationID: config.companyIntegration.IntegrationID ?? undefined,
                companyIntegrationID,
                triggerType: this.mapTriggerTypeForManifest(triggerType),
                startedAt: new Date(startTimeMs).toISOString(),
                context: {
                    integration: config.companyIntegration.Integration ?? undefined,
                    fullSync: options?.FullSync ?? false,
                    entityMapCount: config.entityMaps.length,
                },
            });
        } catch {
            return undefined;
        }
    }

    /** Maps the engine SyncTriggerType to the manifest's triggerType vocabulary. */
    private mapTriggerTypeForManifest(t: SyncTriggerType): 'Manual' | 'Scheduled' | 'Webhook' | 'Pipeline' | 'Restart' {
        switch (t) {
            case 'Scheduled': return 'Scheduled';
            case 'Webhook': return 'Webhook';
            default: return 'Manual';
        }
    }

    /** Writes the terminal artifact result + flushes. Best-effort — never throws. */
    private async finalizeSyncProgress(
        progress: IntegrationProgressEmitter | undefined,
        outcome: 'completed' | 'failed' | 'cancelled',
        message?: string
    ): Promise<void> {
        if (!progress) return;
        try {
            switch (outcome) {
                case 'completed':
                    await progress.complete(message ?? 'Sync run complete');
                    break;
                case 'cancelled':
                    // A user/system abort stopped the run mid-flight. The persisted
                    // CompanyIntegrationRun has no 'Cancelled' status, so exitReason='aborted'
                    // on the artifact is the GQL-visible signal that distinguishes a stopped
                    // run from one that completed (partial state is still durable).
                    await progress.cancel(message ?? 'Sync cancelled by user');
                    break;
                case 'failed':
                    await progress.fail(message ?? 'Sync run failed');
                    break;
            }
            await progress.flush();
        } catch {
            /* best-effort terminal write */
        }
    }

    /**
     * Loads all configuration needed for a sync run.
     */
    private async LoadRunConfiguration(
        companyIntegrationID: string,
        contextUser: UserInfo,
        options?: IntegrationSyncOptions
    ): Promise<RunConfiguration> {
        const rv = new RunView();

        // BypassCache on ALL three: this loads the live configuration a sync is about to ACT on — the
        // CompanyIntegration toggles, the per-entity-map Configuration (partitionReconcile/Merkle, sync
        // direction, priority), and the connector mapping. A sync MUST decide from committed state, never a
        // stale filtered cache. Without this, a config the caller just wrote (e.g. enabling partition
        // reconcile) is invisible to the very next run on a dialect whose filtered-cache invalidation lags
        // (observed: PG read the pre-toggle entity map → fell to the Timestamp path → never wrote the
        // ChangeToken rollup snapshot, while SQL Server saw the fresh config). Same committed-state rule as
        // the match/record-map/idempotency reads.
        const [ciResult, entityMapsResult, integrationsResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Company Integrations',
                ExtraFilter: `ID='${companyIntegrationID}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
                BypassCache: true,
            },
            {
                EntityName: 'MJ: Company Integration Entity Maps',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND SyncEnabled=1 AND Status='Active'`,
                OrderBy: 'Priority ASC',
                ResultType: 'entity_object',
                BypassCache: true,
            },
            {
                EntityName: 'MJ: Integrations',
                ExtraFilter: '',
                ResultType: 'entity_object',
                BypassCache: true,
            },
        ], contextUser);

        const companyIntegration = (ciResult.Results as MJCompanyIntegrationEntity[])[0];
        if (!companyIntegration) {
            throw new Error(`CompanyIntegration not found: ${companyIntegrationID}`);
        }

        const integration = (integrationsResult.Results as MJIntegrationEntity[])
            .find(i => UUIDsEqual(i.ID, companyIntegration.IntegrationID));
        if (!integration) {
            throw new Error(`Integration not found for CompanyIntegration: ${companyIntegrationID}`);
        }

        const connector = ConnectorFactory.Resolve(integration);

        let entityMaps = entityMapsResult.Results as ICompanyIntegrationEntityMap[];

        // Filter to specific entity maps if requested
        if (options?.EntityMapIDs && options.EntityMapIDs.length > 0) {
            const requestedIDs = new Set(options.EntityMapIDs.map(id => id.toLowerCase()));
            entityMaps = entityMaps.filter(m => requestedIDs.has(m.ID.toLowerCase()));
        }

        return {
            companyIntegration,
            entityMaps,
            integration,
            connector,
            // Explicit caller request wins; otherwise honor the integration's periodic-reconcile cadence.
            fullSync: options?.FullSync ?? await this.resolveScheduledFullSync(companyIntegration, contextUser),
            syncDirection: options?.SyncDirection,
        };
    }

    /**
     * Periodic full-reconcile cadence (plan §C5: "periodic full reconcile for hard deletes"). When the
     * caller did NOT explicitly request FullSync, an integration can opt into automatic periodic full
     * reconciles via CompanyIntegration.Configuration {"fullSyncEvery": N}: every Nth completed run
     * (and the first) does a full fetch + orphan/delete-detection instead of a watermark-incremental
     * pull, so hard-deletes upstream are reclaimed on a schedule without the caller tracking cadence.
     * Zero cost when unset (no DB read); returns false on N<=1 / unset / any error (incremental — no
     * behavior change).
     */
    private async resolveScheduledFullSync(companyIntegration: MJCompanyIntegrationEntity, contextUser: UserInfo): Promise<boolean> {
        try {
            const raw = companyIntegration.Configuration;
            if (!raw) return false;
            const parsed = JSON.parse(raw) as { fullSyncEvery?: number };
            const every = Number(parsed.fullSyncEvery);
            if (!Number.isFinite(every) || every <= 1) return false;
            const rv = new RunView();
            const runs = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Company Integration Runs',
                // 'Success' is the only terminal "this run actually completed a reconcile" state the
                // engine ever writes (FinalizeRun / the resume path). The CompanyIntegrationRun Status
                // value list is Pending/In Progress/Success/Failed (no 'Completed'), so filtering on a
                // value the engine never writes made this count ALWAYS 0 → every scheduled run forced
                // to a full sync (0 % every === 0). 'Success' restores the intended 1-in-N cadence.
                ExtraFilter: `CompanyIntegrationID='${companyIntegration.ID}' AND Status='Success'`,
                Fields: ['ID'],
                ResultType: 'simple',
                BypassCache: true, // full-vs-incremental decision needs the true completed-run count
            }, contextUser);
            if (!runs.Success) return false;
            // Every Nth completed run (and the first, when the count is 0) is a full reconcile.
            return (runs.Results.length % Math.floor(every)) === 0;
        } catch {
            return false;
        }
    }

    /**
     * Creates a new CompanyIntegrationRun record to track this sync.
     */
    private async CreateRunRecord(
        companyIntegration: MJCompanyIntegrationEntity,
        triggerType: SyncTriggerType,
        contextUser: UserInfo,
        scheduledJobRunID?: string
    ): Promise<MJCompanyIntegrationRunEntity> {
        const md = this.ProviderToUse;
        const run = await md.GetEntityObject<MJCompanyIntegrationRunEntity>(
            'MJ: Company Integration Runs',
            contextUser
        );
        run.NewRecord();
        run.CompanyIntegrationID = companyIntegration.ID;
        run.RunByUserID = contextUser.ID;
        run.StartedAt = new Date();
        run.Status = 'In Progress';
        run.TotalRecords = 0;
        run.ConfigData = JSON.stringify({ triggerType });

        // Link to scheduled job run if triggered by the scheduler.
        // Use Set() because the ScheduledJobRunID column won't exist on the
        // generated entity type until CodeGen runs after the migration.
        if (scheduledJobRunID) {
            run.Set('ScheduledJobRunID', scheduledJobRunID);
        }

        const saved = await run.Save();
        if (!saved) {
            throw new Error('Failed to create CompanyIntegrationRun record');
        }
        return run;
    }

    /**
     * Processes all entity maps, aggregating results with progress tracking.
     */
    private async ExecuteEntityMaps(
        config: RunConfiguration,
        run: MJCompanyIntegrationRunEntity,
        contextUser: UserInfo,
        onProgress?: OnProgressCallback,
        abortSignal?: AbortSignal,
        logger?: SyncLogger
    ): Promise<SyncResult> {
        const aggregate: SyncResult = {
            Success: true,
            RecordsProcessed: 0,
            RecordsCreated: 0,
            RecordsUpdated: 0,
            RecordsDeleted: 0,
            RecordsErrored: 0,
            RecordsSkipped: 0,
            Errors: [],
            EntityMapResults: [],
        };

        const totalMaps = config.entityMaps.length;
        let globalIndex = 0;

        // Per-map processing. Extracted so it can run sequentially OR concurrently within a
        // dependency layer. Aggregate mutations run when each promise resolves — atomic under
        // single-threaded async, so concurrent maps in a layer are safe.
        const processOne = async (entityMap: ICompanyIntegrationEntityMap): Promise<{ ok: boolean; throttled: boolean }> => {
            if (abortSignal?.aborted) return { ok: true, throttled: false };
            const i = globalIndex++;
            const mapStartTime = Date.now();
            const direction = config.syncDirection ?? entityMap.SyncDirection ?? 'Pull';
            logger?.emit('sync.entity-map.start', {
                index: i,
                total: totalMaps,
                externalObjectName: entityMap.ExternalObjectName,
                mjEntity: entityMap.Entity,
                direction,
                priority: entityMap.Priority ?? null,
            });
            try {
                const mapResult = await this.ProcessSingleEntityMap(
                    config, entityMap, run, contextUser, i, totalMaps, onProgress, abortSignal, logger
                );
                this.MergeResult(aggregate, mapResult);
                aggregate.EntityMapResults!.push(this.buildEntityMapResult(entityMap, mapResult, Date.now() - mapStartTime));
                logger?.emit('sync.entity-map.complete', {
                    externalObjectName: entityMap.ExternalObjectName,
                    mjEntity: entityMap.Entity,
                    direction,
                    success: mapResult.Success,
                    durationMs: Date.now() - mapStartTime,
                    recordsProcessed: mapResult.RecordsProcessed,
                    recordsCreated: mapResult.RecordsCreated,
                    recordsUpdated: mapResult.RecordsUpdated,
                    recordsDeleted: mapResult.RecordsDeleted,
                    recordsSkipped: mapResult.RecordsSkipped,
                    recordsErrored: mapResult.RecordsErrored,
                });
                this.checkSecondLayerEmpty(entityMap, mapResult, depGraph, processedByIoId, ioNameById, ioCategoryById, logger);
                return { ok: mapResult.Success, throttled: mapResult.Throttled === true };
            } catch (err) {
                const objName = entityMap.ExternalObjectName ?? entityMap.ID;
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[IntegrationEngine] Entity map '${objName}' failed: ${errMsg}`);
                logger?.emit('sync.entity-map.complete', {
                    externalObjectName: objName,
                    mjEntity: entityMap.Entity,
                    direction,
                    success: false,
                    durationMs: Date.now() - mapStartTime,
                    error: errMsg,
                });
                aggregate.RecordsErrored++;
                aggregate.Errors.push({
                    ExternalID: objName,
                    ChangeType: 'Skip',
                    ErrorMessage: errMsg,
                    ErrorCode: 'CONNECTOR_ERROR',
                    Severity: 'Critical',
                    ExternalRecord: { ExternalID: objName, ObjectType: objName, Fields: {} },
                });
                aggregate.EntityMapResults!.push({
                    EntityMapID: entityMap.ID,
                    ExternalObjectName: objName,
                    EntityName: entityMap.Entity ?? '',
                    Success: false,
                    RecordsProcessed: 0,
                    RecordsCreated: 0,
                    RecordsUpdated: 0,
                    RecordsDeleted: 0,
                    RecordsErrored: 1,
                    RecordsSkipped: 0,
                    Duration: Date.now() - mapStartTime,
                });
                return { ok: false, throttled: ClassifyError(err).Code === 'RATE_LIMIT_EXCEEDED' };
            }
        };

        // Group maps into dependency layers (parents before children) via the IntegrationObject FK
        // graph, then process layers in order. Layers run sequentially — a child never syncs before
        // its parent. Within a layer the maps are mutually independent and run up to `concurrency`
        // at a time. Default concurrency is 1 (sequential — unchanged behavior); opt in to
        // parallelism via CompanyIntegration.Configuration {"syncConcurrency": N}.
        const layers = this.buildEntityMapDependencyLayers(config, logger);
        const concurrency = this.getSyncConcurrency(config);
        // §7 smart-but-careful peak parallelization: an AIMD controller governs the in-flight cap
        // PER LAYER — start at the configured syncConcurrency, ramp UP toward the connector's
        // MaxConcurrencyHint on clean maps, cut on map failure. With no hint and default
        // syncConcurrency=1, min=max=1 → strictly sequential (unchanged behavior). The per-request
        // RateLimiter is the backstop that keeps the source within its real rate as parallelism rises.
        // Configuration override (IntegrationSetSyncConfig) wins over the connector's MaxConcurrencyHint constant.
        const maxConcurrency = Math.max(concurrency, this.getConfigOverrides(config).maxConcurrency ?? config.connector.MaxConcurrencyHint ?? concurrency);
        const concController = new AdaptiveConcurrencyController({ start: concurrency, min: 1, max: maxConcurrency });

        // Second-layer silent-empty detection state (see checkSecondLayerEmpty): a per-IO running
        // record count + the FK dependency graph, so an association/dependent object that fetches
        // ZERO records while it HAS parents is surfaced as a structured SyncWarning. Layers run
        // parents-first, so a child's parents' counts are already recorded by the time it completes.
        const depGraph = this.computeSelectedDependencyGraph(config);
        const processedByIoId = new Map<string, number>();
        const ioNameById = new Map<string, string>();
        const ioCategoryById = new Map<string, string>();   // for Category='Association' objects the FK graph can't see
        if (depGraph) {
            for (const io of this.GetIntegrationObjectsByIntegrationID(config.companyIntegration.IntegrationID) ?? []) {
                ioNameById.set(io.ID.toUpperCase(), io.Name);
                if (io.Category) ioCategoryById.set(io.ID.toUpperCase(), io.Category);
            }
        }

        // §4 OPT-IN: cross-layer pipelining overlaps independent DAG branches (a child starts when ITS
        // parents finish, not when the whole parent layer does). Default OFF → the strict layer-barrier
        // loop below (unchanged). Falls back to the barrier if the per-map dependency graph can't build.
        const mapDeps = this.getCrossLayerPipelineEnabled(config) ? this.buildMapDependencies(config) : null;
        if (mapDeps) {
            logger?.emit('sync.config.loaded', { crossLayerPipeline: true, totalMaps });
            await this.runPipelinedDAG(config.entityMaps, mapDeps, concController, processOne, abortSignal);
            if (abortSignal?.aborted) {
                aggregate.Success = false;
                aggregate.ErrorMessage = 'Sync cancelled by user';
            }
            return aggregate;
        }

        for (const layer of layers) {
            if (abortSignal?.aborted) {
                console.log(`[IntegrationEngine] Sync cancelled (${globalIndex}/${totalMaps} maps processed)`);
                aggregate.Success = false;
                aggregate.ErrorMessage = 'Sync cancelled by user';
                break;
            }
            await RunAdaptive(layer, async (m) => {
                if (abortSignal?.aborted) return { ok: true, throttled: false };
                const { ok, throttled } = await processOne(m);
                // §5 Gap 2: a real source throttle (RATE_LIMIT_EXCEEDED on fetch) now also cuts the
                // per-layer in-flight cap, not just the per-request token bucket. A plain data failure
                // (FK/validation/transform) carries throttled=false, so concurrency only drops on an
                // actual rate-limit signal — never on ordinary record errors.
                return { ok, throttled };
            }, concController);
        }

        return aggregate;
    }

    /**
     * Groups the run's entity maps into dependency layers (parents before children) using the
     * IntegrationObject FK graph (RelatedIntegrationObjectID). Layer 0 = roots (no FK dependency on
     * another selected object); layer N depends only on layers &lt; N. Maps within a layer are
     * mutually independent and safe to run concurrently. Falls back to a single layer (all maps,
     * original order) if the graph can't be resolved — preserving current behavior. Stable: the
     * original config order is preserved within each layer.
     */
    private buildEntityMapDependencyLayers(config: RunConfiguration, logger?: SyncLogger): ICompanyIntegrationEntityMap[][] {
        const maps = config.entityMaps;
        if (maps.length <= 1) return [maps];
        try {
            const graph = this.computeSelectedDependencyGraph(config);
            if (!graph) return [maps];
            const { mapToIoId, parentsByIoId } = graph;
            const selectedIoIds = new Set(parentsByIoId.keys());

            // Kahn layering: an IO is ready when all its (selected) parents are already placed.
            const ioLayer = new Map<string, number>();
            const remaining = new Set(selectedIoIds);
            let layerNum = 0;
            while (remaining.size > 0) {
                const ready = [...remaining].filter(id => [...parentsByIoId.get(id)!].every(p => !remaining.has(p)));
                if (ready.length === 0) {
                    // cycle (or unresolved) — place the rest in the current layer so they still run,
                    // but SURFACE it: parent-before-child ordering is no longer guaranteed for them,
                    // so a second-layer object here may fetch before its parents are populated.
                    for (const id of remaining) ioLayer.set(id, layerNum);
                    logger?.warning('dependency-graph', 'DEPENDENCY_LAYERING_DEGRADED',
                        `Dependency cycle or unresolved parent among ${remaining.size} integration object(s) — parent-before-child ordering is NOT guaranteed for them; a second-layer object may fetch before its parents are populated (possible silent-empty).`,
                        { unresolvedObjectCount: remaining.size });
                    break;
                }
                for (const id of ready) { ioLayer.set(id, layerNum); remaining.delete(id); }
                layerNum++;
            }

            const byLayer = new Map<number, ICompanyIntegrationEntityMap[]>();
            for (const m of maps) {
                const ioId = mapToIoId.get(m.ID);
                const l = ioId !== undefined ? (ioLayer.get(ioId) ?? 0) : 0;   // maps with no IO → treated as roots
                if (!byLayer.has(l)) byLayer.set(l, []);
                byLayer.get(l)!.push(m);
            }
            return [...byLayer.keys()].sort((a, b) => a - b).map(k => byLayer.get(k)!);
        } catch (err) {
            // Building the dependency graph itself failed — we still run (single flat layer, original
            // order) but parent-before-child ordering is NOT guaranteed, so SURFACE it rather than
            // silently degrade (this path previously emitted nothing).
            logger?.warning('dependency-graph', 'DEPENDENCY_LAYERING_DEGRADED',
                `Failed to build the integration dependency graph (${err instanceof Error ? err.message : String(err)}) — running all objects in a single flat layer; parent-before-child ordering is NOT guaranteed, so a second-layer object may fetch before its parents are populated.`,
                { fallback: 'single-layer' });
            return [maps];   // any failure → single layer, original order
        }
    }

    /**
     * Builds the selected-object FK dependency graph for a run: each selected IntegrationObject →
     * the set of its SELECTED parent IntegrationObject IDs (via IntegrationObjectField.RelatedIntegrationObjectID).
     * Shared by {@link buildEntityMapDependencyLayers} (parent-before-child ordering) and the
     * second-layer silent-empty tripwire ({@link checkSecondLayerEmpty}). Returns null when the
     * graph can't be resolved (no IOs, or none of the maps resolve to an IO) — callers then fall
     * back to flat/original ordering.
     */
    private computeSelectedDependencyGraph(config: RunConfiguration):
        { mapToIoId: Map<string, string>; parentsByIoId: Map<string, Set<string>> } | null {
        const ios = this.GetIntegrationObjectsByIntegrationID(config.companyIntegration.IntegrationID);
        if (!ios || ios.length === 0) return null;
        const ioByName = new Map<string, string>();   // lower(IO.Name) → IO.ID (upper)
        const ioById = new Map<string, MJIntegrationObjectEntity>();   // IO.ID (upper) → IO
        for (const io of ios) { ioByName.set(io.Name.toLowerCase(), io.ID.toUpperCase()); ioById.set(io.ID.toUpperCase(), io); }

        const mapToIoId = new Map<string, string>();   // entityMap.ID → IO.ID
        const selectedIoIds = new Set<string>();
        for (const m of config.entityMaps) {
            const ioId = m.ExternalObjectName ? ioByName.get(m.ExternalObjectName.toLowerCase()) : undefined;
            if (ioId) { mapToIoId.set(m.ID, ioId); selectedIoIds.add(ioId); }
        }
        if (selectedIoIds.size === 0) return null;

        const parentsByIoId = new Map<string, Set<string>>();
        for (const ioId of selectedIoIds) {
            const set = new Set<string>();
            // (1) hard FK pointer on a field (RelatedIntegrationObjectID).
            for (const f of this.GetIntegrationObjectFields(ioId)) {
                const parent = f.RelatedIntegrationObjectID?.toUpperCase();
                if (parent && parent !== ioId && selectedIoIds.has(parent)) set.add(parent);
            }
            // (2) SOFT-FK form (parent-iterated children): the parent is named in the IO's
            // Configuration (parentObjectName / ReferencedType), NOT via RelatedIntegrationObjectID —
            // which is null for soft-FK connectors. Without this, nulling the FK pointer collapses the
            // dependency graph → children run in layer 0 alongside their door → ZERO_PARENTS on the
            // first sync (door not yet populated). Resolve the parent name → its IO id so doors are
            // ordered before their children in a SINGLE pass.
            const cfgRaw = ioById.get(ioId)?.Configuration;
            if (cfgRaw) {
                try {
                    const cfg = JSON.parse(cfgRaw) as { parentObjectName?: string; ReferencedType?: string };
                    for (const name of [cfg.parentObjectName, cfg.ReferencedType]) {
                        const parent = name ? ioByName.get(name.toLowerCase()) : undefined;
                        if (parent && parent !== ioId && selectedIoIds.has(parent)) set.add(parent);
                    }
                } catch { /* non-JSON Configuration → no soft-FK parent to add */ }
            }
            parentsByIoId.set(ioId, set);
        }
        return { mapToIoId, parentsByIoId };
    }

    /**
     * Surfaces the second-layer silent-empty case as a structured warning. An object that HAS FK
     * parents (an association/dependent — a "second-layer" object) but fetched ZERO records is the
     * classic silent fail: a successful run that quietly produced nothing because its parents
     * weren't synced/mapped or the DAG ordered it too early. Rather than let that look identical to
     * "genuinely no data", we emit a SyncWarning (with the parent record counts) so it is visible
     * over GraphQL. Must be called AFTER the map completes; relies on parents (earlier layers)
     * having already recorded their counts in `processedByIoId`.
     */
    private checkSecondLayerEmpty(
        entityMap: ICompanyIntegrationEntityMap,
        mapResult: SyncResult,
        depGraph: { mapToIoId: Map<string, string>; parentsByIoId: Map<string, Set<string>> } | null,
        processedByIoId: Map<string, number>,
        ioNameById: Map<string, string>,
        ioCategoryById: Map<string, string>,
        logger?: SyncLogger
    ): void {
        if (!depGraph) return;
        const ioId = depGraph.mapToIoId.get(entityMap.ID);
        if (!ioId) return;
        processedByIoId.set(ioId, (processedByIoId.get(ioId) ?? 0) + mapResult.RecordsProcessed);

        const parents = depGraph.parentsByIoId.get(ioId);
        const category = ioCategoryById.get(ioId);
        // An object is "second-layer" if the FK graph KNOWS it has parents OR it is an association
        // by Category. The Category branch is essential: HubSpot (and similar) associations carry no
        // FK edges (Relationships:[]), so the graph alone is blind to them — Category catches them.
        const isSecondLayer = (parents !== undefined && parents.size > 0) || category === 'Association';
        if (!isSecondLayer) return;                        // not a second-layer object
        if (mapResult.RecordsProcessed > 0) return;        // it filled in — nothing to flag

        const parentRecordCounts: Record<string, number> = {};
        if (parents) for (const p of parents) parentRecordCounts[ioNameById.get(p) ?? p] = processedByIoId.get(p) ?? 0;
        const knownParents = Object.keys(parentRecordCounts);
        const parentsHadRows = Object.values(parentRecordCounts).some(n => n > 0);

        const why = knownParents.length === 0
            ? `No FK edges are declared for it (RelatedIntegrationObjectID is unset on its FK fields), so the sync DAG cannot order it after its parents — set those FK edges (or run C8 enrichment) so it orders correctly; until then it may fetch before its parents are populated (possible SILENT FAIL).`
            : parentsHadRows
                ? `Its parents DID sync rows — likely a missing FK edge, missing/disabled entity-map, or wrong DAG order (possible SILENT FAIL).`
                : `Its parent layer produced 0 rows — either there is genuinely nothing to associate, or the parents were not synced/mapped.`;

        logger?.warning(
            entityMap.ExternalObjectName ?? entityMap.ID,
            'SECOND_LAYER_EMPTY',
            `'${entityMap.ExternalObjectName}' is a second-layer object (${knownParents.length ? `depends on ${knownParents.join(', ')}` : `category '${category}'`}) but fetched 0 records this run. ${why}`,
            { parentRecordCounts, parentsHadRows, category },
        );
    }

    /** Opt-in sync concurrency from CompanyIntegration.Configuration; default 1 (sequential), clamped [1,16]. */
    private getSyncConcurrency(config: RunConfiguration): number {
        try {
            const raw = config.companyIntegration.Configuration;
            if (raw) {
                const parsed = JSON.parse(raw) as { syncConcurrency?: number };
                const n = Number(parsed.syncConcurrency);
                if (Number.isFinite(n) && n >= 1) return Math.min(Math.floor(n), 16);
            }
        } catch { /* fall through */ }
        return 1;
    }

    /**
     * §4 OPT-IN cross-layer pipelining (CompanyIntegration.Configuration {"crossLayerPipeline": true}).
     * Default OFF → strict layer-barrier execution (unchanged). When ON, a child map starts as soon as
     * ITS OWN parents finish, instead of waiting for the entire parent LAYER — overlapping independent
     * branches of the DAG. Correctness is preserved because a child still gates on parent COMPLETION
     * (the parent's row writes are committed and its record-count recorded before the child begins).
     * Off by default because the throughput win is only measurable against a live run.
     */
    private getCrossLayerPipelineEnabled(config: RunConfiguration): boolean {
        try {
            const raw = config.companyIntegration.Configuration;
            if (raw) return (JSON.parse(raw) as { crossLayerPipeline?: boolean }).crossLayerPipeline === true;
        } catch { /* fall through */ }
        return false;
    }

    /**
     * Per-map parent dependencies (entityMap.ID → set of parent entityMap.IDs) from the FK graph.
     * Used by the §4 pipelined scheduler. Returns null when the graph can't be resolved (caller then
     * falls back to layer-barrier execution).
     */
    private buildMapDependencies(config: RunConfiguration): Map<string, Set<string>> | null {
        const graph = this.computeSelectedDependencyGraph(config);
        if (!graph) return null;
        const { mapToIoId, parentsByIoId } = graph;
        // Invert mapToIoId: IO.ID → the maps targeting it (an IO can back more than one map).
        const mapsByIoId = new Map<string, string[]>();
        for (const [mapId, ioId] of mapToIoId) {
            if (!mapsByIoId.has(ioId)) mapsByIoId.set(ioId, []);
            mapsByIoId.get(ioId)!.push(mapId);
        }
        const deps = new Map<string, Set<string>>();
        for (const m of config.entityMaps) {
            const ioId = mapToIoId.get(m.ID);
            const parentMapIds = new Set<string>();
            if (ioId) {
                for (const parentIoId of parentsByIoId.get(ioId) ?? []) {
                    for (const pm of mapsByIoId.get(parentIoId) ?? []) {
                        if (pm !== m.ID) parentMapIds.add(pm);
                    }
                }
            }
            deps.set(m.ID, parentMapIds);
        }
        return deps;
    }

    /**
     * §4 dependency-aware scheduler: runs every map concurrently, but each map first awaits its
     * parents' completion, THEN gates on the live AIMD cap before doing work. Deadlock-free even at
     * cap=1: a map awaiting parents does NOT hold a concurrency slot (the slot is acquired only AFTER
     * the parent-await resolves), so parents always get to run. The cap gate counts only ACTIVE work.
     */
    private async runPipelinedDAG(
        maps: ICompanyIntegrationEntityMap[],
        mapDeps: Map<string, Set<string>>,
        controller: AdaptiveConcurrencyController,
        process: (m: ICompanyIntegrationEntityMap) => Promise<{ ok: boolean; throttled: boolean }>,
        abortSignal?: AbortSignal,
    ): Promise<void> {
        const resolvers = new Map<string, () => void>();
        const donePromises = new Map<string, Promise<void>>();
        for (const m of maps) donePromises.set(m.ID, new Promise<void>(r => resolvers.set(m.ID, r)));
        const inFlight = { count: 0 };

        const scheduleOne = async (m: ICompanyIntegrationEntityMap): Promise<void> => {
            try {
                const deps = mapDeps.get(m.ID);
                if (deps && deps.size > 0) {
                    await Promise.all([...deps].map(d => donePromises.get(d)).filter((p): p is Promise<void> => !!p));
                }
                if (abortSignal?.aborted) return;
                // Gate on the LIVE cap (yield on a macrotask so in-flight I/O isn't starved — mirrors
                // adaptiveWorker). Only ACTIVE work counts toward the cap; waiting-on-parents does not.
                while (inFlight.count >= controller.Cap) {
                    await new Promise<void>(r => setTimeout(r, 0));
                    if (abortSignal?.aborted) return;
                }
                inFlight.count++;
                try {
                    const outcome = await process(m);
                    if (outcome.throttled || !outcome.ok) controller.OnThrottleOrError();
                    else controller.OnSuccess();
                } finally {
                    inFlight.count--;
                }
            } finally {
                resolvers.get(m.ID)!();   // unblock children whether we ran, aborted, or threw
            }
        };

        await Promise.all(maps.map(m => scheduleOne(m)));
    }

    /** Runs `fn` over items with at most `cap` concurrent executions. cap&lt;=1 → strictly sequential. */
    private async runBounded<T>(items: T[], cap: number, fn: (item: T) => Promise<void>): Promise<void> {
        if (cap <= 1) {
            for (const it of items) await fn(it);
            return;
        }
        let next = 0;
        const workers = Array.from({ length: Math.min(cap, items.length) }, async () => {
            while (true) {
                const i = next++;
                if (i >= items.length) return;
                await fn(items[i]);
            }
        });
        await Promise.all(workers);
    }

    /** Per-integration request-spacing chain for the rate limiter (keyed by IntegrationID → last scheduled time). */
    private readonly _rateLimiters = new Map<string, RateLimiter>();

    /** Minimum ms between outbound requests for this integration (Integration.BatchRequestWaitTime; 0 = disabled). */
    private getRequestSpacingMs(config: RunConfiguration): number {
        try {
            const integ = this.Base.GetIntegrationByID(config.companyIntegration.IntegrationID);
            const ms = integ?.BatchRequestWaitTime ?? -1;
            return ms > 0 ? ms : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Rate-limits outbound connector requests per integration, honoring
     * Integration.BatchRequestWaitTime. No-op when the limit is unset/-1 (the default → zero
     * behavior change). Requests are chained per integration so concurrent callers (opt-in
     * parallel sync) are spaced apart too — the safety net that keeps parallelism within the
     * vendor's rate limit.
     */
    private async rateLimit(config: RunConfiguration): Promise<void> {
        await this.getRateLimiter(config).Acquire(config.companyIntegration.ID as string);
    }

    /**
     * Adaptive token-bucket limiter for this company integration (plan.md §7 peak-aware rate
     * limiting), lazily created and configured from the connector's RateLimitPolicy — or, when the
     * connector declares none, from Integration.BatchRequestWaitTime (spacing → tokens/sec). Keyed by
     * CompanyIntegrationID (NOT IntegrationID): source limits are per-credential, so two companies on
     * the same vendor have independent budgets and must not share one bucket. {@link reportRateOutcome}
     * feeds 429s/successes back so the rate auto-tunes (AIMD).
     */
    /**
     * Per-connection numeric tuning overrides from CompanyIntegration.Configuration — the typed
     * fields the IntegrationSetSyncConfig GraphQL mutation writes. These let an operator override
     * the connector's code-constant rate limit / concurrency / discovery budget per connection,
     * via the API, instead of editing code. Only positive finite values are honored.
     */
    private getConfigOverrides(config: RunConfiguration): {
        maxConcurrency?: number; rateLimitTokensPerSec?: number; rateLimitBurst?: number; discoveryTimeBudgetMs?: number;
    } {
        try {
            const raw = config.companyIntegration.Configuration;
            if (!raw) return {};
            const p = JSON.parse(raw) as Record<string, unknown>;
            const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined);
            return {
                maxConcurrency: num(p.maxConcurrency),
                rateLimitTokensPerSec: typeof p.rateLimitTokensPerSec === 'number' && p.rateLimitTokensPerSec > 0 ? p.rateLimitTokensPerSec : undefined,
                rateLimitBurst: num(p.rateLimitBurst),
                discoveryTimeBudgetMs: num(p.discoveryTimeBudgetMs),
            };
        } catch { return {}; }
    }

    private getRateLimiter(config: RunConfiguration): RateLimiter {
        const key = config.companyIntegration.ID as string;
        let rl = this._rateLimiters.get(key);
        if (!rl) {
            const policy = config.connector.RateLimitPolicy;
            const overrides = this.getConfigOverrides(config);
            const spacingMs = this.getRequestSpacingMs(config);
            // Configuration override wins over the connector's code constant (the "not just constants" goal).
            const tokensPerSec = overrides.rateLimitTokensPerSec ?? policy?.TokensPerSec ?? (spacingMs > 0 ? 1000 / spacingMs : 10);
            rl = new RateLimiter({
                TokensPerSec: tokensPerSec,
                // Floor Burst at 1 so a slow-spacing integration (fractional tokens/sec) still gets
                // one immediate token instead of stalling ~1s on the very first request.
                Burst: Math.max(1, overrides.rateLimitBurst ?? policy?.Burst ?? Math.ceil(tokensPerSec)),
                ThrottleBackoffFactor: policy?.ThrottleBackoffFactor,
                // Thread the connector's recovery tuning through; RateLimiter applies its own sane
                // defaults (ramp = rate/10, floor = rate/20) when these are omitted.
                SuccessRampPerCall: policy?.SuccessRampPerCall,
                MinTokensPerSec: policy?.MinTokensPerSec,
            });
            this._rateLimiters.set(key, rl);
        }
        return rl;
    }

    /**
     * Feed a fetch/write outcome back to the company integration's adaptive limiter. No
     * `throttledErr` = a clean response → ramp the rate up; a rate-limit error → back off (honoring
     * the connector's parsed Retry-After). Other errors are ignored (don't ramp, don't back off).
     */
    private reportRateOutcome(config: RunConfiguration, throttledErr?: unknown): void {
        const key = config.companyIntegration.ID as string;
        const rl = this._rateLimiters.get(key);
        if (!rl) return;
        if (throttledErr === undefined) { rl.ReportSuccess(key); return; }
        rl.ReportThrottle(key, config.connector.ExtractRetryAfterMs(throttledErr));
    }

    /**
     * Feed a push/CRUD result to the limiter so the WRITE path tunes the rate too (the fetch path
     * already does): a 2xx ramps the rate up, a 429 backs it off (honoring Retry-After). Otherwise
     * leave the rate untouched.
     */
    private reportRateForCrud(config: RunConfiguration, result: { Success: boolean; StatusCode?: number; ErrorMessage?: string }): void {
        if (result.Success) { this.reportRateOutcome(config); return; }
        if (result.StatusCode === 429) this.reportRateOutcome(config, new Error(result.ErrorMessage ?? '429 rate limit'));
    }

    /**
     * Processes a single entity map based on SyncDirection:
     * - Pull: fetch from external → map → match → apply to MJ
     * - Push: detect MJ changes → map → push to external
     * - Bidirectional: pull first, then push
     */
    private async ProcessSingleEntityMap(
        config: RunConfiguration,
        entityMap: ICompanyIntegrationEntityMap,
        run: MJCompanyIntegrationRunEntity,
        contextUser: UserInfo,
        entityMapIndex: number,
        totalEntityMaps: number,
        onProgress?: OnProgressCallback,
        abortSignal?: AbortSignal,
        logger?: SyncLogger
    ): Promise<SyncResult> {
        const direction = config.syncDirection ?? entityMap.SyncDirection ?? 'Pull';

        if (direction === 'Pull') {
            return this.ProcessPullSync(config, entityMap, run, contextUser, entityMapIndex, totalEntityMaps, onProgress, abortSignal, logger);
        }

        if (direction === 'Push') {
            return this.ProcessPushSync(config, entityMap, run, contextUser, entityMapIndex, totalEntityMaps, onProgress, abortSignal, logger);
        }

        // Bidirectional: pull first, then push
        const pullResult = await this.ProcessPullSync(config, entityMap, run, contextUser, entityMapIndex, totalEntityMaps, onProgress, abortSignal, logger);
        const pushResult = await this.ProcessPushSync(config, entityMap, run, contextUser, entityMapIndex, totalEntityMaps, onProgress, abortSignal, logger);
        this.MergeResult(pullResult, pushResult);
        return pullResult;
    }

    /**
     * Pull sync: fetch from external → map → match → validate → apply to MJ.
     */
    private async ProcessPullSync(
        config: RunConfiguration,
        entityMap: ICompanyIntegrationEntityMap,
        run: MJCompanyIntegrationRunEntity,
        contextUser: UserInfo,
        entityMapIndex: number,
        totalEntityMaps: number,
        onProgress?: OnProgressCallback,
        abortSignal?: AbortSignal,
        logger?: SyncLogger
    ): Promise<SyncResult> {
        const entityMapID = entityMap.ID;
        const fieldMaps = await this.LoadFieldMaps(entityMapID, contextUser);
        const watermark = await this.runWriteExclusive(() => this.watermarkService.Load(entityMapID, contextUser, 'Pull'));
        logger?.emit('sync.entity-map.start', {
            phase: 'pull-detail',
            externalObjectName: entityMap.ExternalObjectName,
            fieldMapsCount: fieldMaps.length,
            fieldMaps: fieldMaps.map(fm => ({
                SourceField: fm.SourceFieldName,
                DestField: fm.DestinationFieldName,
                Direction: fm.Direction,
                IsKey: fm.IsKeyField,
            })),
            initialWatermark: watermark?.WatermarkValue ?? null,
            watermarkType: watermark?.WatermarkType ?? null,
            fullSync: config.fullSync,
        });

        // A6: Validate watermark before using it — skip entirely when FullSync requested
        let initialWatermark = config.fullSync ? null : (watermark?.WatermarkValue ?? null);
        if (initialWatermark && watermark) {
            const watermarkType = (watermark.WatermarkType ?? 'Timestamp') as WatermarkType;
            if (!this.watermarkService.ValidateWatermark(initialWatermark, watermarkType)) {
                console.warn(
                    `[IntegrationEngine] Invalid watermark '${initialWatermark}' for EntityMap ${entityMap.ID}, resetting to full fetch`
                );
                initialWatermark = null;
            }
        }

        // §8a keyset checkpoint-resume: a connector that declares a StableOrderingKey for this object
        // scans by a monotonic seek key (`WHERE <key> > AfterKey ORDER BY <key>`) instead of a timestamp
        // watermark. For those, an INTERRUPTED scan persists its last ordering key on the Pull watermark
        // record (WatermarkType='Cursor'); a clean scan clears it. Resuming from that key is provably
        // safe — the connector re-fetches only `key > AfterKey`, so no record is skipped and any boundary
        // overlap is absorbed by the idempotent upsert (and content-hash keeps unchanged rows write-free).
        // Entirely dormant for non-keyset connectors (StableOrderingKey === null), so the existing
        // timestamp path is untouched.
        //
        // KNOWN LIMITATION (intentional, documented): declaring a StableOrderingKey forces
        // `initialWatermark = null` below — i.e. this engine treats "has a stable ordering key" and "uses
        // a timestamp watermark" as MUTUALLY EXCLUSIVE. They are actually orthogonal (watermark = the
        // *what-to-fetch* incremental filter; keyset = the *where-am-I* resume position), and the clean
        // future shape is two independent connector signals the engine combines. Until then: a connector
        // whose object DOES have a usable server-side date/timestamp incremental MUST NOT declare a
        // StableOrderingKey for that object — doing so would null the watermark and silently turn every
        // incremental sync into a full scan. (Concretely: HubSpot CRM objects use a date-watermark search
        // and deliberately return null here; their >10k-window scale problem is solved connector-locally
        // via keyset *within* the date filter, not by this engine path.) StableOrderingKey is the right
        // tool only for objects with NO usable date watermark (pure repeated full scans).
        const isKeysetConnector = config.connector.StableOrderingKey(entityMap.ExternalObjectName) != null;

        // §7 partition (Merkle) hash-diff reconcile: an OPT-IN mode for watermark-less objects. Instead of
        // re-applying every fetched record, accumulate them, bucket by stable identity, fold each bucket's
        // content hashes into one rollup, and compare against last sync's rollups — then deep-apply ONLY the
        // partitions whose rollup moved (changed/added). Unchanged partitions are proven-identical and
        // skipped entirely (no match lookup, no upsert). The rollup snapshot lives on the Pull watermark
        // record (WatermarkType='ChangeToken'); since the object is watermark-less, that field is free, so
        // null the timestamp watermark here (same orthogonality caveat as keyset). Default-off: a connector
        // with a real watermark is untouched.
        const partitionReconcile = !isKeysetConnector && this.isPartitionReconcileEnabled(entityMap);
        const partitionCount = this.partitionReconcileCount(entityMap);
        if (partitionReconcile) {
            initialWatermark = null; // the watermark record holds the rollup snapshot, not a timestamp
        }

        let resumeAfterKey: string | undefined;
        if (isKeysetConnector) {
            initialWatermark = null; // keyset connectors filter by the seek key, never a timestamp
            if (!config.fullSync && watermark?.WatermarkType === 'Cursor' && watermark.WatermarkValue) {
                resumeAfterKey = watermark.WatermarkValue;
                logger?.emit('sync.resume.keyset', {
                    externalObjectName: entityMap.ExternalObjectName,
                    resumeAfterKey,
                });
                console.log(
                    `[IntegrationEngine] ${entityMap.ExternalObjectName}: resuming interrupted keyset scan ` +
                    `from ordering key '${resumeAfterKey}' instead of re-scanning from the start.`
                );
            }
        }

        const result: SyncResult = {
            Success: true,
            RecordsProcessed: 0,
            RecordsCreated: 0,
            RecordsUpdated: 0,
            RecordsDeleted: 0,
            RecordsErrored: 0,
            RecordsSkipped: 0,
            Errors: [],
        };

        let hasMore = true;
        let currentWatermark = initialWatermark;
        // §10 — the watermark ALWAYS advances to the max value seen on a clean fetch; it is NEVER held back
        // by a per-record failure. A failed record is classified: a PROVABLY-TRANSIENT save error is retried
        // inline within the batch (ApplyRecords); a PERMANENT (or retry-exhausted) failure is dead-lettered —
        // counted errored, logged to result.Errors (queryable over GraphQL), and the sync moves on. Holding
        // the watermark at the last-clean batch was the old safe-floor; it poison-pilled the stream when an
        // EARLY record failed permanently (the whole window re-fetched + re-failed every run, watermark frozen
        // at the start). Recovery for dead-lettered records is an operator-triggered full sync (which ignores
        // the watermark). The run still reports Status='Failed' whenever ANY record errored.
        let recordsInMap = 0;
        let currentPage: number | undefined;
        let currentOffset: number | undefined;
        let currentCursor: string | undefined;
        let currentAfterKey: string | undefined = resumeAfterKey;   // §7 keyset/seek resume position (last-seen StableOrderingKey)
        let batchCount = 0;
        let previousBatchFingerprint: string | undefined;
        let fetchCompletedCleanly = true; // flipped to false if fetch aborted or errored mid-way
        let hadFetchGap = false;          // ≥1 page was skipped after a persistent fetch error (offset/page paging)
        let fetchGapCount = 0;            // CONSECUTIVE skipped pages (reset on any clean fetch)
        const MAX_FETCH_GAPS = 25;        // give up + hold the watermark if this many pages fail in a row (API down)
        let consecutiveEmptyBatches = 0;  // P3-D: detect a connector that pages empty-but-HasMore forever
        const MAX_BATCHES_PER_MAP = 5000;
        const EMPTY_BATCH_WARN_THRESHOLD = 5; // warn once after this many empty-but-HasMore batches in a row
        const fetchedExternalIDs = new Set<string>(); // Track all IDs seen during this pull for orphan detection
        let orphanTrackingOverflowed = false; // set if the ID set exceeds ORPHAN_DETECTION_MAX_IDS → skip the sweep, don't OOM
        const accumulatedMapped: MappedRecord[] = []; // partition-reconcile mode: collect mapped records, apply post-loop

        while (hasMore) {
            if (abortSignal?.aborted) {
                console.log(`[IntegrationEngine] Sync cancelled for ${entityMap.ExternalObjectName} after ${recordsInMap} records — saving watermark`);
                fetchCompletedCleanly = false;
                break;
            }
            batchCount++;
            if (batchCount > MAX_BATCHES_PER_MAP) {
                console.error(
                    `[IntegrationEngine] Safety limit reached: ${MAX_BATCHES_PER_MAP} batches for ` +
                    `${entityMap.ExternalObjectName}. Stopping to prevent infinite loop.`
                );
                fetchCompletedCleanly = false;
                break;
            }
            const ctx: FetchContext = {
                CompanyIntegration: config.companyIntegration,
                ObjectName: entityMap.ExternalObjectName,
                WatermarkValue: currentWatermark,
                BatchSize: this.MaxBatchSize,
                ContextUser: contextUser,
                CurrentPage: currentPage,
                CurrentOffset: currentOffset,
                CurrentCursor: currentCursor,
                AfterKeyValue: currentAfterKey ?? null,   // §7 keyset/seek resume (connector opt-in)
                // §7: expose the per-credential adaptive AIMD bucket + concurrency cap so a connector's
                // INNER request loop (second-layer / parent-iterated objects) is governed by the SAME
                // adaptive rate as the object level, instead of a fixed self-throttle that defeats
                // concurrency and ignores 429 back-off. Back-compat: connectors that ignore these are unchanged.
                RateLimitAcquire: () => this.rateLimit(config),
                RateLimitReport: (throttledErr?: unknown) => this.reportRateOutcome(config, throttledErr),
                MaxConcurrency: Math.max(1, this.getConfigOverrides(config).maxConcurrency ?? config.connector.MaxConcurrencyHint ?? 4),
            };

            logger?.emit('sync.fetch.batch.start', {
                externalObjectName: entityMap.ExternalObjectName,
                batchIndex: batchCount,
                watermarkValue: currentWatermark,
                page: currentPage ?? null,
                offset: currentOffset ?? null,
                cursor: currentCursor ?? null,
                batchSize: this.MaxBatchSize,
            });
            let batch: FetchBatchResult;
            const fetchStart = Date.now();
            try {
                await this.rateLimit(config);
                // Resilient fetch: bound each attempt with a timeout (a hung vendor API must not
                // hold the sync lock forever) and retry only transient errors (network/throttle/DB).
                // A non-retryable error (auth, 4xx, parse) throws immediately as before.
                batch = await WithRetry(
                    () => WithTimeout(
                        config.connector.FetchChanges(ctx),
                        DEFAULT_OPERATION_TIMEOUTS.FetchChangesMs,
                        `FetchChanges(${entityMap.ExternalObjectName})`,
                    ),
                    undefined,
                    (err) => IsRetryableError(ClassifyError(err).Code),
                    (attempt, err, delayMs) => logger?.emit('sync.fetch.retry', {
                        externalObjectName: entityMap.ExternalObjectName,
                        batchIndex: batchCount,
                        attempt,
                        delayMs,
                        error: err instanceof Error ? err.message : String(err),
                    }),
                );
                this.reportRateOutcome(config);   // clean fetch → ramp the adaptive rate back up
                fetchGapCount = 0;                // clean fetch → reset the consecutive fetch-gap counter
                // §10: connector type-driven post-processing hook (default no-op) — enforce/normalize
                // record values to their resolved formats before mapping + write.
                if (batch.Records.length > 0) {
                    batch.Records = batch.Records.map(r => config.connector.PostProcessRecord(r));
                }
            } catch (fetchErr) {
                const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
                // A throttle (429 / rate-limit) backs the adaptive limiter off (honoring Retry-After);
                // other errors don't touch the rate. §5 Gap 2: also flag the map result so the per-layer
                // AIMD controller reduces in-flight concurrency, not just the per-request token bucket.
                if (ClassifyError(fetchErr).Code === 'RATE_LIMIT_EXCEEDED') {
                    this.reportRateOutcome(config, fetchErr);
                    result.Throttled = true;
                }
                console.error(`[IntegrationEngine] FetchChanges error for ${entityMap.ExternalObjectName}: ${errMsg}`);
                logger?.emit('sync.record.error', {
                    phase: 'fetch',
                    externalObjectName: entityMap.ExternalObjectName,
                    batchIndex: batchCount,
                    error: errMsg,
                });
                // Resilience: a persistent fetch failure on ONE page shouldn't abandon the whole object.
                // POSITION-based paging (offset/page) can step past the failed page and keep going; we mark
                // the fetch incomplete (so the watermark is HELD below + the orphan/partition sweep is skipped)
                // — the skipped window is re-fetched next run (idempotent upsert + content-hash skip reconcile
                // it), no data lost. CURSOR paging CAN'T continue (the next cursor lives in the failed response).
                const canSkipPage = currentOffset != null || currentPage != null;
                if (canSkipPage && fetchGapCount < MAX_FETCH_GAPS) {
                    fetchGapCount++;
                    hadFetchGap = true;
                    fetchCompletedCleanly = false;
                    logger?.warning(
                        entityMap.ExternalObjectName ?? entityMap.ID,
                        'FETCH_PAGE_SKIPPED',
                        `Persistent fetch error at ${currentOffset != null ? 'offset ' + currentOffset : 'page ' + currentPage} for ` +
                        `'${entityMap.ExternalObjectName}' (batch ${batchCount}); skipped this page and continued — the ` +
                        `watermark is held so the window is re-fetched next run. Error: ${errMsg}`,
                        { offset: currentOffset ?? null, page: currentPage ?? null, batchIndex: batchCount, error: errMsg },
                    );
                    if (currentOffset != null) currentOffset += this.MaxBatchSize;
                    else if (currentPage != null) currentPage += 1;
                    continue;
                }
                fetchCompletedCleanly = false;
                break;
            }
            logger?.emit('sync.fetch.batch.complete', {
                externalObjectName: entityMap.ExternalObjectName,
                batchIndex: batchCount,
                durationMs: Date.now() - fetchStart,
                recordCount: batch.Records.length,
                hasMore: batch.HasMore,
                newWatermark: batch.NewWatermarkValue ?? null,
                nextPage: batch.NextPage ?? null,
                nextOffset: batch.NextOffset ?? null,
                nextCursor: batch.NextCursor ?? null,
            });

            // Forward any non-fatal diagnostics the connector attached (e.g. a second-layer object
            // that found zero parents) into the structured artifact so they're visible over GraphQL
            // instead of a swallowed console.warn.
            if (batch.Warnings && batch.Warnings.length > 0) {
                for (const w of batch.Warnings) {
                    logger?.warning(entityMap.ExternalObjectName ?? 'sync', w.Code, w.Message, w.Data);
                }
            }

            // If the connector returned more records than MaxBatchSize, log it but never truncate —
            // all records are written, just in sub-batches to keep DB transactions manageable.
            if (batch.Records.length > this.MaxBatchSize) {
                console.log(
                    `[IntegrationEngine] ${entityMap.ExternalObjectName}: connector returned ` +
                    `${batch.Records.length} records (> MaxBatchSize ${this.MaxBatchSize}), writing in chunks.`
                );
            }

            if (batch.Records.length > 0) {
                const fingerprint = batch.Records.map(r => r.ExternalID).join(',');
                if (fingerprint === previousBatchFingerprint) {
                    console.warn(
                        `[IntegrationEngine] Duplicate batch detected for ${entityMap.ExternalObjectName} — ` +
                        `connector returned same records twice. Stopping to prevent infinite loop.`
                    );
                    fetchCompletedCleanly = false;
                    break;
                }
                previousBatchFingerprint = fingerprint;
            }

            if (!orphanTrackingOverflowed) {
                for (const rec of batch.Records) {
                    fetchedExternalIDs.add(rec.ExternalID);
                }
                // OOM guard: a multi-million-row full sync would grow this set without bound. Past the
                // ceiling, drop it + flag so orphan detection is skipped (a SyncWarning is emitted below)
                // rather than risk crashing the run.
                if (fetchedExternalIDs.size > ORPHAN_DETECTION_MAX_IDS) {
                    orphanTrackingOverflowed = true;
                    fetchedExternalIDs.clear();
                }
            }

            const mapped = this.fieldMappingEngine.Apply(
                batch.Records, fieldMaps, entityMap.Entity
            );
            // Partition (Merkle) reconcile defers match + apply: accumulate mapped records now; the
            // partition-diff + selective apply runs once after the full fetch (applyViaPartitionReconcile).
            if (partitionReconcile) {
                accumulatedMapped.push(...mapped);
                // OOM guard: this mode buffers the ENTIRE fetched set in RAM. Past a generous ceiling,
                // fail loud (caught by the per-map error path → other maps continue) instead of crashing
                // the whole run with an OOM. The default streaming path has no such limit.
                if (accumulatedMapped.length > PARTITION_RECONCILE_MAX_ACCUMULATION) {
                    throw new Error(
                        `partitionReconcile accumulated ${accumulatedMapped.length} records for ` +
                        `${entityMap.ExternalObjectName} (cap ${PARTITION_RECONCILE_MAX_ACCUMULATION}). This mode ` +
                        `buffers the whole set in RAM and is unsafe at this size — disable Configuration.partitionReconcile ` +
                        `for this object to stream via per-record content-hash instead.`
                    );
                }
            }
            // Serialize the match READ too (record-map / PK lookups). On a shared provider connection
            // a read routes through whatever transaction is active, so a match read in this stream
            // collides with another concurrent stream's in-flight write transaction ("Transaction has
            // not begun"). Holding the same write-lock for the read keeps the connection single-owner.
            const resolved = partitionReconcile
                ? []
                : await this.runWriteExclusive(() => this.matchEngine.Resolve(mapped, entityMap, fieldMaps, contextUser));

            const beforeApply = result.RecordsCreated + result.RecordsUpdated + result.RecordsSkipped + result.RecordsErrored;
            try {
                if (!partitionReconcile) await this.ApplyRecords(resolved, config.companyIntegration, entityMap, result, contextUser, logger, this.getSyncConcurrency(config) <= 1);
            } catch (applyErr) {
                if (applyErr instanceof SchemaNotGeneratedError) {
                    // The destination spCreate/Update/Delete doesn't exist
                    // (CodeGen hasn't run for this entity). Every remaining
                    // record in this batch (and every record from any future
                    // fetch on this entityMap) would fail identically. Skip
                    // the rest cleanly with one error entry, abort fetching.
                    const remainingInBatch = resolved.length - (result.RecordsCreated + result.RecordsUpdated + result.RecordsSkipped + result.RecordsErrored - beforeApply);
                    result.RecordsSkipped += Math.max(remainingInBatch, 0);
                    result.Errors.push({
                        ExternalID: '',
                        ChangeType: 'Create',
                        ErrorMessage: applyErr.message,
                        ErrorCode: 'CONFIGURATION_ERROR',
                        Severity: 'Critical',
                    });
                    console.warn(
                        `[IntegrationEngine] ${entityMap.ExternalObjectName} → ${entityMap.Entity}: ` +
                        `${applyErr.message} Skipped ${remainingInBatch} record(s) in this batch and aborting further fetches for this entity.`
                    );
                    fetchCompletedCleanly = false;
                    hasMore = false;
                    break;
                }
                throw applyErr;
            }
            const afterApply = result.RecordsCreated + result.RecordsUpdated + result.RecordsSkipped + result.RecordsErrored;

            if (!partitionReconcile && batch.Records.length > 0) {
                const written = afterApply - beforeApply;
                const offsetInfo = currentOffset != null ? ` (offset ${currentOffset})` : '';
                console.log(
                    `[IntegrationEngine] ${entityMap.ExternalObjectName}: wrote ${written} records to DB` +
                    `${offsetInfo} — running totals: ${result.RecordsCreated} created, ${result.RecordsUpdated} updated, ` +
                    `${result.RecordsSkipped} skipped, ${result.RecordsErrored} errored` +
                    (batch.HasMore ? ` | more batches pending` : ` | batch complete`)
                );

                // Update progress on the watermark record so the DB reflects live sync state
                if (batch.HasMore) {
                    await this.runWriteExclusive(() => this.watermarkService.UpdateProgress(entityMapID, afterApply, contextUser));
                }
            }

            recordsInMap += batch.Records.length;

            // A8: Progress tracking
            if (onProgress) {
                this.emitProgress(onProgress, entityMapIndex, totalEntityMaps, recordsInMap, recordsInMap);
            }

            if (batch.NewWatermarkValue) {
                currentWatermark = batch.NewWatermarkValue;   // §10 — track the max seen; failures never hold it back
            }
            currentPage = batch.NextPage;
            currentOffset = batch.NextOffset;
            currentCursor = batch.NextCursor;
            currentAfterKey = batch.NextAfterKeyValue ?? currentAfterKey;   // §7 advance keyset position
            // §8a: persist a resumable checkpoint PERIODICALLY (every 25 batches, not every batch —
            // each emit is an fs.appendFile, so per-batch on a multi-thousand-batch object would flood
            // the artifact) so a crash/restart can resume near where it stopped (watermark for
            // incremental, AfterKey/cursor for keyset/no-watermark scans) rather than from scratch.
            if (batchCount % 25 === 0) {
                logger?.checkpoint(entityMap.ExternalObjectName ?? entityMap.ID, {
                    watermark: currentWatermark ?? null,
                    afterKey: currentAfterKey ?? null,
                    page: currentPage ?? null,
                    offset: currentOffset ?? null,
                    cursor: currentCursor ?? null,
                    batchIndex: batchCount,
                    recordsInMap,
                });
                // Durable floor for a hard process kill: persist the keyset seek position to the
                // watermark record (the only per-map store the next run loads at startup). The
                // post-loop save below handles graceful early-exits precisely; this covers a SIGKILL
                // between graceful checkpoints, costing at most ~25 batches of re-fetch on resume.
                if (isKeysetConnector && currentAfterKey) {
                    await this.runWriteExclusive(() => this.watermarkService.SaveKeysetPosition(entityMapID, currentAfterKey, contextUser));
                }
            }
            // P3-D: a connector returning empty pages with HasMore=true would otherwise spin silently
            // to MAX_BATCHES_PER_MAP. Surface a structured warning once the empty streak crosses the
            // threshold so the connector bug is visible, not buried.
            if (batch.Records.length === 0 && batch.HasMore === true) {
                consecutiveEmptyBatches++;
                if (consecutiveEmptyBatches === EMPTY_BATCH_WARN_THRESHOLD) {
                    logger?.warning(
                        entityMap.ExternalObjectName ?? entityMap.ID,
                        'CONSECUTIVE_EMPTY_BATCHES',
                        `'${entityMap.ExternalObjectName}' returned ${EMPTY_BATCH_WARN_THRESHOLD} empty batches in a row while still reporting HasMore=true ` +
                        `(batch ${batchCount}/${MAX_BATCHES_PER_MAP}). Likely a connector pagination bug (cursor not advancing / HasMore stuck true).`,
                        { batchCount, consecutiveEmptyBatches },
                    );
                }
            } else {
                consecutiveEmptyBatches = 0;
            }
            hasMore = batch.HasMore === true; // Explicit boolean check — prevents truthy undefined from looping
        }

        // Partition (Merkle) reconcile: the full set is now accumulated — diff it against last sync's
        // rollups and deep-apply ONLY the changed/added partitions; the new rollup snapshot is persisted
        // inside. Runs only on a CLEAN fetch (a partial set would mis-skip partitions and lose updates).
        if (partitionReconcile && fetchCompletedCleanly) {
            await this.applyViaPartitionReconcile(accumulatedMapped, config, entityMap, fieldMaps, result, contextUser, logger, partitionCount);
        }

        if (fetchCompletedCleanly && partitionReconcile) {
            // The rollup snapshot (not a timestamp) was saved by applyViaPartitionReconcile above.
            result.WatermarkAfter = null;
        } else if (fetchCompletedCleanly && isKeysetConnector && !config.connector.MonotonicWatermark) {
            // A clean keyset scan covered the whole ordering range. A PURE-keyset connector (no reliable
            // watermark) has no timestamp filter — the next scheduled sync re-seeks from the start
            // (content-hash keeps unchanged rows write-free) — so clear the resume marker rather than
            // writing a timestamp into it, which the restore logic would otherwise mis-read as a seek key.
            // NOTE: a connector that ALSO returns a monotonic watermark (MonotonicWatermark=true) skips
            // this branch and falls through to SAVE that watermark below, so its next incremental NARROWS
            // (microtime > watermark) instead of re-scanning the whole object every run.
            await this.runWriteExclusive(() => this.watermarkService.ClearKeysetPosition(entityMapID, contextUser));
            result.WatermarkAfter = null;
        } else if (fetchCompletedCleanly) {
            // Save a watermark on every clean fetch, even when the connector
            // can't compute a NewWatermarkValue (empty result set, or a source
            // object with no modstamp column). Without the fallback, every
            // subsequent incremental re-issues the same unfiltered query — on
            // Salesforce orgs this means scanning 1,500+ empty tables per run.
            //
            // After a clean full sync, advance the watermark to "now" rather
            // than the max modification date in the last batch. HubSpot's list
            // API returns records in creation order, so the last batch can
            // contain records with very old hs_lastmodifieddate values; a
            // stale watermark then causes the next incremental to re-fetch
            // the entire change history from that old date.
            //
            // For source objects that have no modstamp column at all (e.g.
            // Salesforce __Share tables), the connector will ignore the saved
            // watermark when building its SOQL — behavior there is unchanged,
            // but at least a watermark row exists for bookkeeping.
            let finalWatermark: string;
            if (currentWatermark) {
                // §10 — advance to the max watermark seen, ALWAYS. Errored records are dead-lettered (logged +
                // counted), never held against the watermark — a permanently-failing record must not freeze the
                // stream. A full sync advances to wall-clock "now" — EXCEPT a connector whose watermark is a
                // reliable monotonic max (MonotonicWatermark=true): for it, "now" in the source's OWN watermark
                // format IS currentWatermark (the max seen), so advancing to that — not an ISO timestamp the
                // connector can't compare against — lets the next incremental narrow.
                const incrementalWatermark = currentWatermark;
                // D2 clock-skew safety net: a clean full sync advances to wall-clock "now", but if the source's
                // own max watermark is AHEAD of our clock, advancing to "now" would skip the (now, sourceMax]
                // window on the next incremental — so never advance the watermark below the max value seen.
                let fullSyncWatermark = new Date().toISOString();
                if (currentWatermark > fullSyncWatermark) fullSyncWatermark = currentWatermark;
                finalWatermark = config.fullSync && !config.connector.MonotonicWatermark ? fullSyncWatermark : incrementalWatermark;
            } else {
                finalWatermark = new Date().toISOString();
            }
            await this.runWriteExclusive(() => this.watermarkService.Update(entityMapID, finalWatermark, contextUser, 'Pull'));
            result.WatermarkAfter = finalWatermark;
        } else if (isKeysetConnector && currentAfterKey) {
            // The keyset scan stopped early (cancel / fetch error / safety limit). Persist the precise
            // last ordering key so the next run resumes the seek from here instead of restarting.
            await this.runWriteExclusive(() => this.watermarkService.SaveKeysetPosition(entityMapID, currentAfterKey, contextUser));
            result.WatermarkAfter = currentAfterKey;
        }

        // Orphan detection: delete/tombstone MJ records whose external counterpart no longer exists.
        // Runs on a full sync OR a partition-reconcile (both fetch the COMPLETE set, so an MJ record
        // whose ExternalID isn't in fetchedExternalIDs is genuinely gone — even one inside an otherwise
        // unchanged/skipped partition). Only on a clean fetch — a partial set would delete live records.
        if ((config.fullSync || partitionReconcile) && fetchedExternalIDs.size > 0 && fetchCompletedCleanly) {
            await this.DeleteOrphanedRecords(
                config.companyIntegration, entityMap, fetchedExternalIDs, result, contextUser, logger
            );
        } else if (orphanTrackingOverflowed && fetchCompletedCleanly) {
            // We deliberately stopped tracking IDs to avoid OOM — orphan/delete detection can't run
            // safely this pass (a partial set would delete live records). Surface it, don't hide it.
            logger?.warning(
                entityMap.ExternalObjectName ?? entityMap.ID,
                'ORPHAN_DETECTION_SKIPPED_TOO_LARGE',
                `'${entityMap.ExternalObjectName}' returned more than ${ORPHAN_DETECTION_MAX_IDS.toLocaleString()} records, ` +
                `so orphan/delete detection was skipped this run to avoid excessive memory use. Records were synced normally; ` +
                `deletions in the source will not be reflected until a smaller/incremental run or a raised cap.`,
                { cap: ORPHAN_DETECTION_MAX_IDS },
            );
        }

        // If any page was skipped after a persistent fetch error, surface ONE summary warning so the
        // operator knows this object's data is INCOMPLETE this run (the per-page warnings carry the
        // offsets). The watermark was held above, so the skipped window is re-fetched on the next run.
        if (hadFetchGap) {
            logger?.warning(
                entityMap.ExternalObjectName ?? entityMap.ID,
                'FETCH_INCOMPLETE_PAGES_SKIPPED',
                `'${entityMap.ExternalObjectName}' finished with one or more pages skipped after persistent fetch errors — ` +
                `the result set is INCOMPLETE. The watermark was held, so the skipped window is re-fetched next run; ` +
                `records on the reachable pages were synced normally.`,
                { skipped: true },
            );
        }

        await this.CreateRunDetail(run, entityMap, result, contextUser);
        return result;
    }

    /**
     * Push sync: detect local MJ record changes → reverse-map fields → push to external system.
     *
     * Uses MJ's Record Changes entity to find records modified since the last push watermark.
     * Filters out changes made by the integration engine itself to prevent echo loops.
     * For each changed record, calls the connector's CreateRecord/UpdateRecord/DeleteRecord.
     */
    private async ProcessPushSync(
        config: RunConfiguration,
        entityMap: ICompanyIntegrationEntityMap,
        run: MJCompanyIntegrationRunEntity,
        contextUser: UserInfo,
        _entityMapIndex: number,
        _totalEntityMaps: number,
        _onProgress?: OnProgressCallback,
        _abortSignal?: AbortSignal,
        logger?: SyncLogger
    ): Promise<SyncResult> {
        const entityMapID = entityMap.ID;
        const fieldMaps = await this.LoadFieldMaps(entityMapID, contextUser);
        const pushWatermark = await this.watermarkService.Load(entityMapID, contextUser, 'Push');
        const lastPushAt = pushWatermark?.WatermarkValue ?? null;

        // Check connector write capability
        if (!config.connector.SupportsCreate && !config.connector.SupportsUpdate) {
            console.log(`[IntegrationEngine] Push skipped for ${entityMap.ExternalObjectName}: connector does not support writes`);
            logger?.emit('sync.push.candidates', {
                externalObjectName: entityMap.ExternalObjectName,
                skipped: true,
                reason: 'connector-does-not-support-writes',
                supportsCreate: config.connector.SupportsCreate,
                supportsUpdate: config.connector.SupportsUpdate,
            });
            return this.EmptyResult();
        }

        // Full push: load ALL records from the MJ entity. Incremental push: only changed records.
        const changedRecords = config.fullSync
            ? await this.LoadAllMJRecords(entityMap, config.companyIntegration, contextUser)
            : await this.LoadChangedMJRecords(entityMap, lastPushAt, contextUser);

        if (changedRecords.length === 0) {
            console.log(`[IntegrationEngine] Push: no changes for ${entityMap.ExternalObjectName} since ${lastPushAt ?? 'beginning'}`);
            logger?.emit('sync.push.candidates', {
                externalObjectName: entityMap.ExternalObjectName,
                changedCount: 0,
                fullSync: config.fullSync,
                sinceLastPushAt: lastPushAt,
            });
            await this.CreateRunDetail(run, entityMap, this.EmptyResult(), contextUser);
            return this.EmptyResult();
        }

        console.log(`[IntegrationEngine] Push: ${changedRecords.length} changed records for ${entityMap.ExternalObjectName}`);
        logger?.emit('sync.push.candidates', {
            externalObjectName: entityMap.ExternalObjectName,
            changedCount: changedRecords.length,
            fullSync: config.fullSync,
            sinceLastPushAt: lastPushAt,
            firstFew: changedRecords.slice(0, 5).map(c => ({ recordID: c.RecordID, changeType: c.Type, changedAt: c.ChangedAt ?? null })),
        });

        const result: SyncResult = {
            Success: true, RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0,
            RecordsDeleted: 0, RecordsErrored: 0, RecordsSkipped: 0, Errors: [],
        };

        // Get push-direction field maps (DestToSource or Both)
        const pushFieldMaps = fieldMaps.filter(
            fm => fm.Direction === 'DestToSource' || fm.Direction === 'Both'
        );

        // If no field maps are configured for push, skip this entity entirely
        if (pushFieldMaps.length === 0) {
            console.log(`[IntegrationEngine] Push skipped for ${entityMap.ExternalObjectName}: no field maps with push direction`);
            return this.EmptyResult();
        }

        // Watermark safety: the push watermark must never advance PAST a record that FAILED to
        // push, or the next incremental push (which filters ChangedAt > watermark, strictly) would
        // permanently exclude that record and silently drop the local change. We therefore clamp the
        // advance strictly BELOW the earliest-failing record's ChangedAt — tracked by VALUE, not
        // array position, because the dedup that produces changedRecords does not guarantee the
        // carried ChangedAt is monotonic with order. ISO-8601 ChangedAt strings compare correctly
        // lexicographically, matching the SQL `ChangedAt > '...'` filter in LoadChangedMJRecords.
        let firstErrorChangeAt: string | null = null; // min ChangedAt among failed pushes
        const successfulChangeAts: string[] = [];

        for (const change of changedRecords) {
            result.RecordsProcessed++;
            try {
                await this.PushSingleRecord(change, config, entityMap, pushFieldMaps, result, contextUser, logger);
                if (change.ChangedAt) successfulChangeAts.push(change.ChangedAt);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                result.RecordsErrored++;
                if (change.ChangedAt && (!firstErrorChangeAt || change.ChangedAt < firstErrorChangeAt)) {
                    firstErrorChangeAt = change.ChangedAt; // earliest failure gates the watermark
                }
                result.Errors.push({
                    ExternalID: change.RecordID,
                    ChangeType: change.Type as 'Create' | 'Update' | 'Delete' | 'Skip',
                    ErrorMessage: errMsg,
                    ErrorCode: 'CONNECTOR_ERROR',
                    Severity: 'Critical',
                    ExternalRecord: { ExternalID: change.RecordID, ObjectType: entityMap.ExternalObjectName, Fields: {} },
                });
            }
        }

        // Advance only to the MAX successful ChangedAt that is strictly BEFORE the earliest failure,
        // so any failed record (and anything at/after its timestamp) is re-selected next pass. If the
        // earliest (or only) change failed, latestChangeAt stays null → the watermark is not advanced
        // at all, guaranteeing retry. A success sharing an identical ChangedAt with a failure is also
        // re-selected next pass (strict `>` keeps the watermark below that timestamp) — harmless, a
        // re-push of an unchanged record is idempotent via the existing record-map/dirty-flag path.
        let latestChangeAt: string | null = null;
        for (const at of successfulChangeAts) {
            if (firstErrorChangeAt && at >= firstErrorChangeAt) continue;
            if (!latestChangeAt || at > latestChangeAt) latestChangeAt = at;
        }

        // Update push watermark
        if (latestChangeAt) {
            await this.watermarkService.Update(entityMapID, latestChangeAt, contextUser, 'Push');
        }

        console.log(
            `[IntegrationEngine] Push complete for ${entityMap.ExternalObjectName}: ` +
            `${result.RecordsCreated} created, ${result.RecordsUpdated} updated, ` +
            `${result.RecordsDeleted} deleted, ${result.RecordsErrored} errored`
        );

        await this.CreateRunDetail(run, entityMap, result, contextUser);
        return result;
    }

    /** Loads MJ records changed since the last push watermark, excluding integration-engine changes. */
    private async LoadChangedMJRecords(
        entityMap: ICompanyIntegrationEntityMap,
        lastPushAt: string | null,
        contextUser: UserInfo
    ): Promise<Array<{ RecordID: string; Type: string; ChangedAt: string; Fields: Record<string, unknown> }>> {
        const rv = new RunView();

        // Query Record Changes for this entity since the last push
        let filter = `EntityID='${entityMap.EntityID}'`;
        if (lastPushAt) {
            filter += ` AND ChangedAt > '${lastPushAt}'`;
        }
        // Exclude changes made by the integration engine (System user or specific source)
        filter += ` AND UserID != 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E'`; // System user
        filter += ` AND Type IN ('Create', 'Update', 'Delete')`;

        const result = await rv.RunView<{
            RecordID: string; Type: string; ChangedAt: string;
        }>({
            EntityName: 'Record Changes',
            ExtraFilter: filter,
            OrderBy: 'ChangedAt ASC',
            Fields: ['RecordID', 'Type', 'ChangedAt'],
            ResultType: 'simple',
        }, contextUser);

        if (!result.Success) return [];

        // Dedupe: keep only the latest change per RecordID.
        // RecordChange.RecordID format is "fieldName|value" or "f1|v1||f2|v2" for composites.
        // Normalize to just the value(s) so it matches CompanyIntegrationRecordMap.EntityRecordID.
        const latestByRecord = new Map<string, { RecordID: string; Type: string; ChangedAt: string; Fields: Record<string, unknown> }>();
        for (const r of result.Results) {
            const normalizedID = this.NormalizeRecordChangeID(r.RecordID);
            latestByRecord.set(normalizedID, { ...r, RecordID: normalizedID, Fields: {} });
        }

        // Load current field values for each changed record
        const md = this.ProviderToUse;
        const entityInfo = md.EntityByName(entityMap.Entity);
        const pkFieldName = entityInfo?.FirstPrimaryKey?.Name ?? 'ID';
        for (const [recordID, change] of latestByRecord) {
            if (change.Type === 'Delete') continue; // No fields to load for deletes
            try {
                const entity = await md.GetEntityObject(entityMap.Entity, contextUser);
                const loaded = await entity.InnerLoad(new CompositeKey([{ FieldName: pkFieldName, Value: recordID }]));
                if (loaded) {
                    change.Fields = entity.GetAll();
                }
            } catch {
                // Record may have been deleted between change detection and load
            }
        }

        return [...latestByRecord.values()];
    }

    /**
     * Loads ALL records from an MJ entity for full push sync.
     * For each record, checks the record map to determine if it's a Create (no external ID)
     * or Update (has external ID) in the external system.
     */
    private async LoadAllMJRecords(
        entityMap: ICompanyIntegrationEntityMap,
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<Array<{ RecordID: string; Type: string; ChangedAt: string; Fields: Record<string, unknown> }>> {
        const rv = new RunView();

        // Load all records from the MJ entity. OOM SAFETY VALVE: a full push materializes every row of
        // the MJ entity in RAM. Past a generous ceiling, fail LOUD + actionable (caught by the per-map
        // error path → other maps continue) rather than risk an OOM that kills the whole run. A genuine
        // full push of a multi-million-row entity should use incremental push or raise the limit; we do
        // NOT silently partial-push (that would advance the watermark past unsent rows → dropped data).
        // NOTE: a true streaming/keyset push refactor is the proper long-term fix; this guard makes the
        // failure mode safe in the meantime without touching the delicate push-watermark clamp logic.
        const allResult = await rv.RunView<Record<string, unknown>>({
            EntityName: entityMap.Entity,
            ResultType: 'simple',
            MaxRows: FULL_PUSH_MAX_RECORDS + 1,   // +1 so we can detect "exceeded" vs "exactly at cap"
        }, contextUser);

        if (!allResult.Success || allResult.Results.length === 0) return [];
        if (allResult.Results.length > FULL_PUSH_MAX_RECORDS) {
            throw new Error(
                `Full push of '${entityMap.Entity}' exceeds the in-memory safety limit of ` +
                `${FULL_PUSH_MAX_RECORDS.toLocaleString()} records. A full push loads every row into memory; ` +
                `use incremental push (set a push watermark) or raise MJ_INTEGRATION_FULL_PUSH_MAX_RECORDS. ` +
                `Refusing to partial-push (that would advance the watermark past unsent rows and drop data).`
            );
        }

        // Load existing record maps to know which records already exist externally
        const mapResult = await rv.RunView<{ EntityRecordID: string; ExternalSystemRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter: `CompanyIntegrationID='${companyIntegration.ID}' AND EntityID='${entityMap.EntityID}'`,
            Fields: ['EntityRecordID', 'ExternalSystemRecordID'],
            ResultType: 'simple',
            BypassCache: true, // sync decisions must reflect committed record-map state, not a stale cache
        }, contextUser);

        const existingMaps = new Map<string, string>();
        if (mapResult.Success) {
            for (const m of mapResult.Results) {
                existingMaps.set(m.EntityRecordID, m.ExternalSystemRecordID);
            }
        }

        const md = this.ProviderToUse;
        const entityInfo = md.EntityByName(entityMap.Entity);
        const pkFieldName = entityInfo?.FirstPrimaryKey?.Name ?? 'ID';

        const now = new Date().toISOString();
        return allResult.Results.map(record => {
            const recordID = String(record[pkFieldName] ?? '');
            return {
                RecordID: recordID,
                Type: existingMaps.has(recordID) ? 'Update' : 'Create',
                ChangedAt: now,
                Fields: record,
            };
        });
    }

    /** Pushes a single changed MJ record to the external system. */
    private async PushSingleRecord(
        change: { RecordID: string; Type: string; ChangedAt: string; Fields: Record<string, unknown> },
        config: RunConfiguration,
        entityMap: ICompanyIntegrationEntityMap,
        pushFieldMaps: ICompanyIntegrationFieldMap[],
        result: SyncResult,
        contextUser: UserInfo,
        logger?: SyncLogger
    ): Promise<void> {
        // Reverse-map MJ fields to external fields
        const externalAttributes: Record<string, unknown> = {};
        for (const fm of pushFieldMaps) {
            const mjValue = change.Fields[fm.DestinationFieldName];
            if (mjValue !== undefined && mjValue !== null) {
                externalAttributes[fm.SourceFieldName] = mjValue;
            }
        }

        // Nothing to push — all field values were null/undefined. Skip instead of erroring.
        if (change.Type !== 'Delete' && Object.keys(externalAttributes).length === 0) {
            result.RecordsSkipped++;
            return;
        }

        // Look up the ExternalID from the record map
        const rv = new RunView();
        const mapResult = await rv.RunView<{ ExternalSystemRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter: `EntityRecordID='${change.RecordID}' AND CompanyIntegrationID='${config.companyIntegration.ID}'`,
            Fields: ['ExternalSystemRecordID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true, // write-back targets the committed external-id mapping
        }, contextUser);

        const externalID = mapResult.Success && mapResult.Results.length > 0
            ? mapResult.Results[0].ExternalSystemRecordID
            : null;

        const crudBase = {
            CompanyIntegration: config.companyIntegration,
            ObjectName: entityMap.ExternalObjectName,
            ContextUser: contextUser,
        };

        if (change.Type === 'Delete' && externalID && config.connector.SupportsDelete) {
            await this.rateLimit(config);
            const delResult = await config.connector.DeleteRecord({ ...crudBase, ExternalID: externalID });
            this.reportRateForCrud(config, delResult);
            if (!delResult.Success) {
                if (delResult.StatusCode === 403) {
                    console.warn(`[IntegrationEngine] Skipping delete — ${delResult.ErrorMessage}`);
                    this.warnPushSkip(logger, entityMap, 'delete', delResult.ErrorMessage ?? 'forbidden (403)', { statusCode: 403, recordID: change.RecordID });
                    result.RecordsSkipped++;
                    return;
                }
                throw new Error(delResult.ErrorMessage ?? 'Delete failed');
            }
            result.RecordsDeleted++;
        } else if (externalID) {
            // Pull-first 3-way combine: snapshot = common ancestor, MJ = ours, external = theirs.
            // Merge non-overlapping field changes; a same-field-both-sides change is a true conflict
            // resolved per the entity map's ConflictResolution policy. Safe fallbacks throughout:
            // no snapshot / no GetRecord / fetch failure → push the full attribute set (prior
            // last-write-wins behavior). Never throws, never blocks the push on infrastructure.
            const combine = await this.computePushCombine(
                change, config, entityMap, pushFieldMaps, externalAttributes, externalID, contextUser, logger
            );
            if (combine.action === 'skip') {
                result.RecordsSkipped++;
                return;
            }
            if (Object.keys(combine.attributes).length === 0) {
                // After the merge there is nothing for MJ to push (external already had our change,
                // or external-wins took every conflicting field). Not an error.
                result.RecordsSkipped++;
                return;
            }
            await this.rateLimit(config);
            const updResult = await config.connector.UpdateRecord({
                ...crudBase, ExternalID: externalID, Attributes: combine.attributes,
            });
            this.reportRateForCrud(config, updResult);
            if (!updResult.Success) {
                if (updResult.StatusCode === 403) {
                    console.warn(`[IntegrationEngine] Skipping update — ${updResult.ErrorMessage}`);
                    this.warnPushSkip(logger, entityMap, 'update', updResult.ErrorMessage ?? 'forbidden (403)', { statusCode: 403, recordID: change.RecordID });
                    result.RecordsSkipped++;
                    return;
                }
                throw new Error(updResult.ErrorMessage ?? 'Update failed');
            }
            result.RecordsUpdated++;
        } else if (config.connector.SupportsCreate) {
            // Create new external record
            await this.rateLimit(config);
            const createResult = await config.connector.CreateRecord({
                ...crudBase, Attributes: externalAttributes,
            });
            this.reportRateForCrud(config, createResult);
            if (!createResult.Success) {
                if (createResult.StatusCode === 403) {
                    console.warn(`[IntegrationEngine] Skipping create — ${createResult.ErrorMessage}`);
                    this.warnPushSkip(logger, entityMap, 'create', createResult.ErrorMessage ?? 'forbidden (403)', { statusCode: 403, recordID: change.RecordID });
                    result.RecordsSkipped++;
                    return;
                }
                throw new Error(createResult.ErrorMessage ?? 'Create failed');
            }
            // Persist the new external ID so future syncs update instead of re-creating
            if (createResult.ExternalID) {
                await this.SaveRecordMap(
                    config.companyIntegration.ID as string,
                    createResult.ExternalID,
                    entityMap.EntityID,
                    change.RecordID,
                    contextUser
                );
                result.RecordsCreated++;
            } else {
                // Create succeeded but the connector returned NO ExternalID, so we cannot write a record map.
                // Counting this as a clean create is a trap: the next sync sees the MJ record as still-unmapped
                // and CREATES IT AGAIN externally — unbounded duplicates on every run. Surface it loudly and
                // count it errored (not created) so the duplicate risk is visible, never silent.
                this.warnPushSkip(logger, entityMap, 'create',
                    'create succeeded but the connector returned no ExternalID — no record map written; future syncs would duplicate this record. The connector must return CRUDResult.ExternalID on create.',
                    { recordID: change.RecordID });
                result.RecordsErrored++;
            }
        } else {
            // A changed MJ record with no external counterpart, but the connector can't create it —
            // silently dropping the change would lose it, so surface it.
            this.warnPushSkip(logger, entityMap, 'create',
                'connector does not support create; a new MJ record with no external counterpart was not pushed',
                { recordID: change.RecordID });
            result.RecordsSkipped++;
        }
    }

    /**
     * Surface a SKIPPED push (forbidden write / unsupported op) as a structured SyncWarning so a
     * change that was NOT written to the external system is visible over GraphQL — not just a
     * console.warn + a silent RecordsSkipped bump. Mirrors the read-side silent-fail surfacing
     * (plan.md §8 "things go right, and when they don't it's loud" — applied to the write path).
     */
    private warnPushSkip(
        logger: SyncLogger | undefined,
        entityMap: ICompanyIntegrationEntityMap,
        operation: string,
        message: string,
        data?: Record<string, unknown>,
    ): void {
        logger?.warning(
            entityMap.ExternalObjectName ?? entityMap.ID,
            'PUSH_SKIPPED',
            `Push ${operation} skipped — the change was NOT written to the external system: ${message}`,
            { operation, ...data },
        );
    }

    /**
     * Pull-first 3-way combine for bidirectional push. Snapshot (last-synced external state) is
     * the common ancestor; MJ-current is "ours"; the re-fetched external record is "theirs".
     *  - field only WE changed   → push our value
     *  - field only THEY changed → leave it (don't push; next pull brings it into MJ)
     *  - both changed, same value → converged, skip
     *  - both changed, different  → true conflict → ConflictResolution policy
     * Returns the attribute subset MJ should actually push. Safe fallbacks: no snapshot / no
     * GetRecord support / fetch failure → push the full attribute set (prior behavior). Never throws.
     */
    private async computePushCombine(
        change: { RecordID: string; Fields: Record<string, unknown> },
        config: RunConfiguration,
        entityMap: ICompanyIntegrationEntityMap,
        pushFieldMaps: ICompanyIntegrationFieldMap[],
        fullAttributes: Record<string, unknown>,
        externalID: string,
        contextUser: UserInfo,
        logger?: SyncLogger
    ): Promise<{ action: 'proceed' | 'skip'; attributes: Record<string, unknown> }> {
        const snapRaw = change.Fields['__mj_integration_LastSyncedSnapshot'];
        if (typeof snapRaw !== 'string' || snapRaw.length === 0) return { action: 'proceed', attributes: fullAttributes };
        let base: Record<string, unknown>;
        try { base = JSON.parse(snapRaw) as Record<string, unknown>; } catch { return { action: 'proceed', attributes: fullAttributes }; }
        if (!config.connector.SupportsGet) return { action: 'proceed', attributes: fullAttributes };

        let ext: ExternalRecord | null;
        try {
            await this.rateLimit(config);
            ext = await config.connector.GetRecord({
                CompanyIntegration: config.companyIntegration,
                ObjectName: entityMap.ExternalObjectName,
                ExternalID: externalID,
                ContextUser: contextUser,
            });
        } catch {
            return { action: 'proceed', attributes: fullAttributes }; // re-fetch failed → don't block push
        }
        if (!ext) return { action: 'proceed', attributes: fullAttributes };

        const policy = (entityMap.ConflictResolution as string) || 'DestWins';
        // MostRecent is a per-record decision: compare the MJ row's last update against the
        // external record's ModifiedAt once, up front. null = indeterminate (a timestamp is
        // missing/unparseable) → the conflict falls back to DestWins so it's never dropped.
        const mostRecentWinner = policy === 'MostRecent' ? this.resolveMostRecentWinner(change.Fields, ext) : null;
        const mjWinsConflict = policy === 'DestWins'
            || (policy === 'MostRecent' && mostRecentWinner !== 'external');
        const toPush: Record<string, unknown> = {};
        const conflictFields: string[] = [];
        let manualConflict = false;

        for (const fm of pushFieldMaps) {
            const baseVal = base[fm.DestinationFieldName];
            const mjVal = change.Fields[fm.DestinationFieldName];
            const extVal = ext.Fields[fm.SourceFieldName];
            const mjChanged = !this.valuesEqual(mjVal, baseVal);
            const extChanged = !this.valuesEqual(extVal, baseVal);

            if (mjChanged && !extChanged) {
                toPush[fm.SourceFieldName] = mjVal;                       // only we changed → push ours
            } else if (mjChanged && extChanged && !this.valuesEqual(mjVal, extVal)) {
                conflictFields.push(fm.DestinationFieldName);            // both changed, different → conflict
                if (policy === 'Manual') {
                    manualConflict = true;                               // quarantine for a human
                } else if (mjWinsConflict) {
                    toPush[fm.SourceFieldName] = mjVal;                  // DestWins, or MostRecent→MJ (incl. indeterminate)
                }
                // SourceWins, or MostRecent→external → leave external as-is (don't push this field)
            }
            // !mjChanged → nothing to push; both-changed-same → converged.
        }

        if (conflictFields.length > 0) {
            const resolution = policy === 'Manual' ? 'quarantined'
                : policy === 'SourceWins' ? 'external-wins'
                : policy === 'MostRecent' ? (mostRecentWinner === 'external' ? 'external-wins (most-recent)' : 'mj-wins (most-recent)')
                : 'mj-wins';
            logger?.emit('sync.record.conflict', {
                entity: entityMap.Entity,
                externalId: externalID,
                mjRecordId: change.RecordID,
                conflictFields,
                policy,
                resolution,
            });
            if (manualConflict) {
                await this.markConflictOnMJRecord(change.RecordID, entityMap, conflictFields, contextUser, logger);
                return { action: 'skip', attributes: {} };
            }
        }
        return { action: 'proceed', attributes: toPush };
    }

    /** Loose value equality for conflict comparison across JSON/string/number/bool/null shapes. */
    private valuesEqual(a: unknown, b: unknown): boolean {
        if (a === b) return true;
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return String(a) === String(b);
    }

    /**
     * MostRecent conflict resolution: compares the MJ row's last-update time
     * (`__mj_UpdatedAt`) against the external record's `ModifiedAt`. Record-level recency
     * (most sources don't expose per-field timestamps), so the caller computes it once
     * and applies it to every conflicting field. Returns null when a timestamp is
     * missing/unparseable → caller falls back to DestWins (a conflict is never dropped).
     */
    private resolveMostRecentWinner(mjFields: Record<string, unknown>, ext: ExternalRecord): RecencyWinner | null {
        return mostRecentWinner(mjFields['__mj_UpdatedAt'], ext.ModifiedAt);
    }

    /** Marks an MJ mirror record in-conflict (Manual resolution) via its standard sync columns. Best-effort. */
    private async markConflictOnMJRecord(
        mjRecordID: string,
        entityMap: ICompanyIntegrationEntityMap,
        conflictFields: string[],
        contextUser: UserInfo,
        logger?: SyncLogger
    ): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const entity = await md.GetEntityObject(entityMap.Entity, contextUser);
            const entityInfo = md.EntityByName(entityMap.Entity);
            const pkFields = entityInfo?.PrimaryKeys ?? (entityInfo?.FirstPrimaryKey ? [entityInfo.FirstPrimaryKey] : []);
            const loaded = await entity.InnerLoad(this.BuildEntityPrimaryKey(mjRecordID, pkFields));
            if (!loaded) return;
            const fields = entity.Fields ?? [];
            const hasField = (n: string) => fields.some(f => f.Name === n);
            if (hasField('__mj_integration_SyncStatus')) entity.Set('__mj_integration_SyncStatus', 'Conflict');
            if (hasField('__mj_integration_SyncMessage')) {
                entity.Set('__mj_integration_SyncMessage', `Bidirectional conflict: external changed ${conflictFields.join(', ')} since last sync; awaiting manual resolution.`);
            }
            // Surface a failed conflict-mark: the engine thinks the row is quarantined, but without the
            // marker the operator has no signal. A silent failure here leaves the record in limbo.
            const ok = await entity.Save();
            if (!ok) {
                logger?.warning(
                    entityMap.ExternalObjectName ?? entityMap.Entity ?? entityMap.ID,
                    'CONFLICT_MARK_FAILED',
                    `Could not mark MJ record ${mjRecordID} in-conflict: ${entity.LatestResult?.CompleteMessage ?? 'Save() returned false'}`,
                    { mjRecordID, conflictFields },
                );
            }
        } catch (markErr) {
            logger?.warning(
                entityMap.ExternalObjectName ?? entityMap.Entity ?? entityMap.ID,
                'CONFLICT_MARK_FAILED',
                `Could not mark MJ record ${mjRecordID} in-conflict: ${markErr instanceof Error ? markErr.message : String(markErr)}`,
                { mjRecordID, conflictFields },
            );
        }
    }

    /**
     * Full-sync orphan detection: finds MJ records that have a record map entry
     * but were NOT returned by the external system during this full pull.
     * These records were deleted externally and should be removed from MJ.
     */
    private async DeleteOrphanedRecords(
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        fetchedExternalIDs: Set<string>,
        result: SyncResult,
        contextUser: UserInfo,
        logger?: SyncLogger
    ): Promise<void> {
        const rv = new RunView();
        const mapResult = await rv.RunView<{ EntityRecordID: string; ExternalSystemRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `CompanyIntegrationID='${companyIntegration.ID}' ` +
                `AND EntityID='${entityMap.EntityID}'`,
            Fields: ['EntityRecordID', 'ExternalSystemRecordID'],
            ResultType: 'simple',
            BypassCache: true, // orphan-sweep compares against committed record-map state
        }, contextUser);

        if (!mapResult.Success) return;

        const orphans = mapResult.Results.filter(m => !fetchedExternalIDs.has(m.ExternalSystemRecordID));
        if (orphans.length === 0) return;

        console.log(`[IntegrationEngine] Orphan detection for ${entityMap.ExternalObjectName}: ${orphans.length} records in MJ not found in external system`);
        // Surface delete-detection in the structured stream (previously console-only). The orphan
        // COUNT is already in the run counts via RecordsDeleted, but a dedicated warning makes a
        // large/unexpected count visible over GraphQL — the early signal of an incomplete upstream
        // fetch silently archiving live records.
        logger?.warning(
            entityMap.ExternalObjectName ?? entityMap.ID,
            'ORPHANS_DETECTED',
            `${orphans.length} record(s) exist in MJ but were not returned by the external system on this full sync — they will be archived/deleted (delete-detection). A large or unexpected count can indicate an incomplete upstream fetch, so review before trusting the deletions.`,
            { orphanCount: orphans.length },
        );

        const md = this.ProviderToUse;
        const entityInfo = md.EntityByName(entityMap.Entity);
        const pkFields = entityInfo?.PrimaryKeys ?? (entityInfo?.FirstPrimaryKey ? [entityInfo.FirstPrimaryKey] : []);

        for (const orphan of orphans) {
            try {
                const entity = await md.GetEntityObject(entityMap.Entity, contextUser);
                const loaded = await entity.InnerLoad(this.BuildEntityPrimaryKey(orphan.EntityRecordID, pkFields));
                if (!loaded) {
                    console.log(`[IntegrationEngine] Orphan ${orphan.EntityRecordID} already deleted from MJ`);
                    continue;
                }
                const deleted = await entity.Delete();
                if (deleted) {
                    result.RecordsDeleted++;
                    console.log(`[IntegrationEngine] Deleted orphan ${entityMap.Entity} ${orphan.EntityRecordID} (external ${orphan.ExternalSystemRecordID} no longer exists)`);
                } else {
                    const reason = entity.LatestResult?.CompleteMessage ?? 'unknown reason';
                    console.warn(`[IntegrationEngine] Orphan delete blocked for ${entityMap.Entity} ${orphan.EntityRecordID} — ${reason}`);
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                console.warn(`[IntegrationEngine] Orphan delete failed for ${entityMap.Entity} ${orphan.EntityRecordID}: ${msg}`);
            }
        }
    }

    /**
     * Strips field-name prefixes from a RecordChange.RecordID to get the raw entity record ID.
     * "hs_object_id|465950833372" → "465950833372"
     * "contact_id|123||deal_id|456" → "123|456"
     */
    private NormalizeRecordChangeID(recordID: string): string {
        return recordID
            .split('||')
            .map(part => { const i = part.indexOf('|'); return i >= 0 ? part.substring(i + 1) : part; })
            .join('|');
    }


    /** Returns an empty SyncResult. */
    private EmptyResult(): SyncResult {
        return {
            Success: true, RecordsProcessed: 0, RecordsCreated: 0, RecordsUpdated: 0,
            RecordsDeleted: 0, RecordsErrored: 0, RecordsSkipped: 0, Errors: [],
        };
    }

    /**
     * Emits a progress update via the callback.
     */
    private emitProgress(
        onProgress: OnProgressCallback,
        entityMapIndex: number,
        totalEntityMaps: number,
        processedInMap: number,
        totalInMap: number
    ): void {
        const mapProgress = totalEntityMaps > 0 ? entityMapIndex / totalEntityMaps : 0;
        const inMapProgress = totalInMap > 0 ? processedInMap / totalInMap : 0;
        const overallPercent = Math.round((mapProgress + inMapProgress / totalEntityMaps) * 100);

        const progress: SyncProgress = {
            EntityMapIndex: entityMapIndex,
            TotalEntityMaps: totalEntityMaps,
            RecordsProcessedInCurrentMap: processedInMap,
            TotalRecordsInCurrentMap: totalInMap,
            PercentComplete: Math.min(overallPercent, 100),
        };
        onProgress(progress);
    }

    /**
     * Loads active field maps for a given entity map.
     */
    private async LoadFieldMaps(
        entityMapID: string,
        contextUser: UserInfo
    ): Promise<ICompanyIntegrationFieldMap[]> {
        const rv = new RunView();
        const result = await rv.RunView<ICompanyIntegrationFieldMap>({
            EntityName: 'MJ: Company Integration Field Maps',
            ExtraFilter: `EntityMapID='${entityMapID}' AND Status='Active'`,
            OrderBy: 'Priority ASC',
            ResultType: 'entity_object',
            BypassCache: true, // field maps drive value mapping; a sync must see freshly-applied maps
        }, contextUser);

        return result.Success ? result.Results : [];
    }

    /** Parses the entity map's Configuration JSON (best-effort) for engine-side feature toggles. */
    private parseEntityMapConfig(entityMap: ICompanyIntegrationEntityMap): { partitionReconcile?: boolean; partitionCount?: number } | null {
        const raw = entityMap.Configuration;
        if (!raw) return null;
        try { return JSON.parse(raw) as { partitionReconcile?: boolean; partitionCount?: number }; } catch { return null; }
    }

    /** Opt-in partition (Merkle) reconcile flag from the entity map Configuration (GQL-managed). */
    private isPartitionReconcileEnabled(entityMap: ICompanyIntegrationEntityMap): boolean {
        return this.parseEntityMapConfig(entityMap)?.partitionReconcile === true;
    }

    /** Partition count for the reconcile (default 256), from the entity map Configuration if set. */
    private partitionReconcileCount(entityMap: ICompanyIntegrationEntityMap): number {
        const n = Number(this.parseEntityMapConfig(entityMap)?.partitionCount);
        return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 256;
    }

    /**
     * Partition (Merkle) hash-diff reconcile (§7). Given ALL mapped records of a watermark-less object,
     * bucket them by stable identity, fold each bucket's content hashes into one order-independent rollup,
     * compare against last sync's rollups, and deep-apply (match + upsert) ONLY the partitions whose rollup
     * moved (changed/added). Partitions whose rollup matches are proven identical and skipped entirely
     * (counted as skipped — no match lookup, no write). The new snapshot is persisted ONLY after a clean
     * apply, so a failure re-reconciles from the prior snapshot next time. Deletes are handled by the
     * caller's orphan sweep over the full fetched-id set.
     *
     * MEMORY: this mode buffers the ENTIRE fetched set (`accumulatedMapped`) in RAM until this post-loop
     * apply, rather than streaming batch-by-batch — that's the cost of one complete cross-batch snapshot.
     * It is intended for watermark-less small/medium objects (the kind that re-fetch everything anyway,
     * e.g. a membership roster of tens of thousands). Don't enable it on a multi-million-row object; for
     * those, leave it off and rely on per-record content-hash (which streams).
     */
    private async applyViaPartitionReconcile(
        mappedRecords: MappedRecord[],
        config: RunConfiguration,
        entityMap: ICompanyIntegrationEntityMap,
        fieldMaps: ICompanyIntegrationFieldMap[],
        result: SyncResult,
        contextUser: UserInfo,
        logger: SyncLogger | undefined,
        partitionCount: number,
    ): Promise<void> {
        const entityMapID = entityMap.ID;
        const idOf = (r: MappedRecord) => r.ExternalRecord.ExternalID;
        const partitionOf = (r: MappedRecord) => partitionKeyForIdentity(idOf(r), partitionCount);

        // Bucket + rollup the just-fetched full set.
        const buckets = partitionRecords(mappedRecords, idOf, partitionOf);
        const newRollups = new Map<string, string>();
        for (const [partition, recs] of buckets) {
            newRollups.set(partition, partitionRollupHash(recs, r => contentHashBasis(r.MappedFields, r.UnmappedFields)));
        }

        // Diff against last sync's snapshot; only changed/added partitions need a deep apply. On a FORCED
        // FULL SYNC, treat the snapshot as empty so EVERY partition is re-applied: fullSync is the operator's
        // explicit "redo everything" — used to repair out-of-band drift (a manual DB edit, a changed field
        // map, a partition that failed to apply on a prior run). Honoring the snapshot on fullSync would
        // silently skip exactly the partitions the operator is trying to repair.
        const stored = config.fullSync
            ? new Map<string, string>()
            : await this.watermarkService.LoadPartitionRollups(entityMapID, contextUser);
        const diff = diffPartitions(newRollups, stored);
        const toApply = new Set<string>([...diff.changed, ...diff.added]);

        let appliedRecords = 0;
        let skippedPartitions = 0;
        let skippedRecords = 0;
        try {
            for (const [partition, recs] of buckets) {
                if (!toApply.has(partition)) {
                    skippedPartitions++;
                    skippedRecords += recs.length;
                    // Count as processed-and-skipped so the run invariant holds
                    // (processed == created + updated + skipped + errored); these records never enter
                    // ApplyRecords, which is the only other place RecordsProcessed is incremented.
                    result.RecordsProcessed += recs.length;
                    result.RecordsSkipped += recs.length;
                    continue;
                }
                // D3: serialize the match READ through the same write-mutex the non-partition path uses
                // (~line 1644). matchEngine.Resolve reads existing MJ rows on the SHARED provider
                // connection, so when streams run in parallel (syncConcurrency>1) it must not interleave
                // with another stream's open write transaction (else "Transaction in progress" / dirty read).
                const resolved = await this.runWriteExclusive(() => this.matchEngine.Resolve(recs, entityMap, fieldMaps, contextUser));
                await this.ApplyRecords(resolved, config.companyIntegration, entityMap, result, contextUser, logger, this.getSyncConcurrency(config) <= 1);
                appliedRecords += recs.length;
            }
        } catch (applyErr) {
            if (applyErr instanceof SchemaNotGeneratedError) {
                result.Errors.push({ ExternalID: '', ChangeType: 'Create', ErrorMessage: applyErr.message, ErrorCode: 'CONFIGURATION_ERROR', Severity: 'Critical' });
                console.warn(`[IntegrationEngine] ${entityMap.ExternalObjectName} → ${entityMap.Entity}: ${applyErr.message} (partition reconcile aborted; snapshot not advanced)`);
                return; // do NOT persist the new rollups — next sync re-reconciles from the prior snapshot
            }
            throw applyErr;
        }

        // Persist the new snapshot only after a clean apply.
        await this.watermarkService.SavePartitionRollups(entityMapID, newRollups, contextUser);

        logger?.emit('sync.partition.reconcile', {
            externalObjectName: entityMap.ExternalObjectName,
            totalRecords: mappedRecords.length,
            totalPartitions: buckets.size,
            changedPartitions: diff.changed.length,
            addedPartitions: diff.added.length,
            removedPartitions: diff.removed.length,
            appliedRecords,
            skippedPartitions,
            skippedRecords,
        });
    }

    /**
     * Applies resolved records to MJ, handling each individually for error isolation.
     */
    private async ApplyRecords(
        records: MappedRecord[],
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        result: SyncResult,
        contextUser: UserInfo,
        logger?: SyncLogger,
        // OPT-IN concurrency (syncConcurrency>1): when false, the batch is applied WITHOUT a provider
        // transaction (per-record auto-commit on pooled connections). Rationale: the provider holds ONE
        // global transaction bound to one connection, so a held transaction makes every concurrent
        // stream's fetch-phase reads (credentials, etc.) collide on that connection. Running the
        // concurrent write transaction-free keeps the global transaction null → zero collisions. The
        // lost batch atomicity is absorbed by the engine's idempotency (upsert-by-identity + content
        // hash) and the safe-floor watermark (advances only on a clean batch). Default true = the
        // proven atomic serial path, unchanged.
        useTransaction: boolean = true
    ): Promise<void> {
        // Batched application with per-record failure isolation (the "grace gap" fix).
        // Happy path: each batch of up to APPLY_BATCH_SIZE records commits as a single
        // transaction — small enough to avoid SQL Server lock escalation (~5000 rows) while
        // amortizing transaction overhead across the batch. When a batch transaction FAILS,
        // we roll it back, restore the per-batch counter snapshot, and RE-APPLY every record
        // in the batch in its OWN transaction so only the actually-failing record(s) error
        // out — the good siblings still get committed. One poison record no longer sinks up
        // to 500 healthy records.
        const APPLY_BATCH_SIZE = 500;
        const provider = this.ProviderToUse as DatabaseProviderBase;

        for (let i = 0; i < records.length; i += APPLY_BATCH_SIZE) {
            const batch = records.slice(i, i + APPLY_BATCH_SIZE);
            const batchStartProcessed = result.RecordsProcessed;
            const batchStartCreated = result.RecordsCreated;
            const batchStartUpdated = result.RecordsUpdated;
            const batchStartDeleted = result.RecordsDeleted;
            const batchStartSkipped = result.RecordsSkipped;

            // One cheap read per batch fetches the stored content hashes for the rows we'd
            // otherwise load one-by-one. For a watermark-less re-sync where nothing changed,
            // this lets UpdateRecord skip every per-record load. Best-effort: undefined → the
            // existing dirty-flag path runs unchanged.
            // Serialize the per-batch DB-write across concurrently-synced streams (shared provider
            // connection ⇒ one transaction at a time). Fetch already happened in parallel upstream;
            // only this write section is mutually exclusive. A throw inside (e.g. SchemaNotGenerated)
            // propagates out to fail-stop this entity map, exactly as before.
            await this.runWriteExclusive(async () => {
                const precheckHashes = await this.PrefetchContentHashes(batch, contextUser);

                // PKs of records the content-hash fast path skipped this batch — still present and
                // confirmed-unchanged on the source. Collected so we can refresh LastReconciledAt for
                // all of them in ONE set-based touch after the batch (instead of a frozen-forever stamp).
                let reconciledSkipIds: string[] = [];

                if (useTransaction) {
                    await provider.BeginTransaction();
                    try {
                        for (const record of batch) {
                            result.RecordsProcessed++;
                            await this.ApplySingleRecord(record, companyIntegration, entityMap, result, contextUser, logger, precheckHashes, reconciledSkipIds);
                        }
                        await provider.CommitTransaction();
                    } catch (err) {
                        await provider.RollbackTransaction();
                        // The batch transaction rolled back; the skip-IDs collected during the failed attempt
                        // never committed. Reset and let the per-record retry re-collect only what commits.
                        reconciledSkipIds = [];

                        // Roll back the in-memory counters that ApplySingleRecord bumped inside the failed batch
                        result.RecordsProcessed = batchStartProcessed;
                        result.RecordsCreated = batchStartCreated;
                        result.RecordsUpdated = batchStartUpdated;
                        result.RecordsDeleted = batchStartDeleted;
                        result.RecordsSkipped = batchStartSkipped;

                        // SchemaNotGeneratedError is per-entity-deterministic — every record in
                        // this object will fail the same way. Bubble it up so ProcessPullSync
                        // can fail-stop the entityMap with one log line instead of producing
                        // per-record duplicates. Rollback + counter restore above already ran.
                        if (err instanceof SchemaNotGeneratedError) {
                            throw err;
                        }

                        // Degrade to per-record application so the failure isolates to the poison
                        // record(s) and every good record in this batch still commits.
                        await this.applyRecordsIndividually(
                            batch, companyIntegration, entityMap, result, contextUser, logger, precheckHashes, reconciledSkipIds
                        );
                    }
                } else {
                    // OPT-IN concurrent path (syncConcurrency>1): NO batch transaction. Each record
                    // auto-commits on its own pooled connection, so the global transaction is never
                    // held and concurrent streams' fetch-phase reads can't collide on the shared
                    // connection. Per-record error isolation: a poison record is logged + counted; the
                    // rest still commit; the idempotent re-sync + safe-floor watermark reconcile any
                    // partial batch (the atomicity the transactional path provides is not needed here).
                    for (const record of batch) {
                        result.RecordsProcessed++;
                        try {
                            // §10 — bounded inline retry for provably-transient save failures (auto-commit per
                            // record, so no transaction to manage); permanent errors throw straight to dead-letter.
                            await WithRetry(
                                () => this.ApplySingleRecord(record, companyIntegration, entityMap, result, contextUser, logger, precheckHashes, reconciledSkipIds),
                                undefined,
                                (e) => !(e instanceof SchemaNotGeneratedError) && IsRetryableError(ClassifyError(e).Code),
                                (attempt, e, delayMs) => logger?.emit('sync.record.retry', {
                                    phase: 'save',
                                    externalObjectName: entityMap.ExternalObjectName,
                                    externalId: record.ExternalRecord?.ExternalID ?? '',
                                    attempt, delayMs, errorCode: ClassifyError(e).Code,
                                }),
                            );
                        } catch (err) {
                            if (err instanceof SchemaNotGeneratedError) {
                                throw err;
                            }
                            // §10 — permanent / retry-exhausted → dead-letter (count + log), move on; watermark advances regardless.
                            result.RecordsErrored++;
                            const classified = ClassifyError(err);
                            result.Errors.push({
                                ExternalID: record.ExternalRecord?.ExternalID ?? '',
                                ChangeType: record.ChangeType ?? 'Create',
                                ErrorMessage: err instanceof Error ? err.message : String(err),
                                ErrorCode: classified.Code,
                                Severity: classified.Severity,
                            });
                        }
                    }
                }

                // After the batch settles (committed, or per-record retried), refresh
                // LastReconciledAt for every content-hash-skipped row in ONE set-based touch.
                // Best-effort — a touch failure must never break the sync.
                if (reconciledSkipIds.length > 0) {
                    await this.TouchLastReconciledAt(entityMap, reconciledSkipIds, contextUser, logger);
                }
            });
        }
    }

    /**
     * Refreshes __mj_integration_LastReconciledAt = now for a set of records that the content-hash
     * fast path skipped (present + confirmed-unchanged on the source). Issues ONE set-based UPDATE
     * for the whole skip set so the optimization isn't defeated by per-row writes. No-op (and never
     * throws) when the entity lacks the column, has a composite PK, or the UPDATE fails — best-effort,
     * mirroring PrefetchContentHashes. Keeps the column's "last confirmed present" semantics honest so
     * future unseen-since-last-reconcile logic can't misclassify a still-present unchanged record.
     */
    private async TouchLastReconciledAt(
        entityMap: ICompanyIntegrationEntityMap,
        recordIds: string[],
        contextUser: UserInfo,
        logger?: SyncLogger
    ): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const entityInfo = md.EntityByName(entityMap.Entity ?? '');
            if (!entityInfo) return;
            const RECONCILED_COLUMN = '__mj_integration_LastReconciledAt';
            if (!entityInfo.Fields.some(f => f.Name === RECONCILED_COLUMN)) return;
            const pkFields = entityInfo.PrimaryKeys ?? [];
            if (pkFields.length !== 1) return; // single-PK set-based touch only
            if (!entityInfo.SchemaName || !entityInfo.BaseTable) return;

            const provider = md as DatabaseProviderBase;
            const dialect = provider.Dialect;
            const table = `${dialect.QuoteIdentifier(entityInfo.SchemaName)}.${dialect.QuoteIdentifier(entityInfo.BaseTable)}`;
            const col = dialect.QuoteIdentifier(RECONCILED_COLUMN);
            const pk = dialect.QuoteIdentifier(pkFields[0].Name);
            const uniqueIds = Array.from(new Set(recordIds));
            const inList = uniqueIds.map(id => dialect.QuoteStringLiteral(String(id))).join(',');
            const now = dialect.QuoteStringLiteral(new Date().toISOString());
            const sql = `UPDATE ${table} SET ${col} = ${now} WHERE ${pk} IN (${inList})`;
            await provider.ExecuteSQL(sql, undefined, undefined, contextUser);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[IntegrationEngine] LastReconciledAt touch skipped for ${entityMap.ExternalObjectName}: ${msg}`);
            // Best-effort: surface in the structured stream as a non-fatal warning (a touch failure
            // must never break the sync). Uses the existing 'sync.warning' channel.
            logger?.warning('reconcile', 'LAST_RECONCILED_TOUCH_FAILED', msg, {
                externalObjectName: entityMap.ExternalObjectName,
                count: recordIds.length,
            });
        }
    }

    /**
     * Per-record fallback for a batch whose single transaction failed. Re-applies each
     * record in its OWN transaction so a failure isolates to that record only — good
     * siblings commit, the poison record(s) error out with their REAL per-record cause.
     *
     * Counters and the run-invariant are preserved: every record bumps RecordsProcessed
     * exactly once (so the chunk's processed total still equals chunk.length), good
     * records increment Created/Updated/Skipped via ApplySingleRecord, and each failure
     * increments RecordsErrored and pushes a SyncRecordError classified with the SAME
     * ClassifyError used by the connector path. A `sync.record.error` event is emitted
     * once PER failed record (phase:'save'), carrying that record's real ExternalID /
     * ChangeType — not a single batch-wide error.
     *
     * Begin/Commit/Rollback are always matched per record (no leaked open transaction).
     */
    private async applyRecordsIndividually(
        batch: MappedRecord[],
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        result: SyncResult,
        contextUser: UserInfo,
        logger: SyncLogger | undefined,
        precheckHashes: Map<string, string> | undefined,
        reconciledSkipIds?: string[]
    ): Promise<void> {
        const provider = this.ProviderToUse as DatabaseProviderBase;

        for (const record of batch) {
            result.RecordsProcessed++;
            try {
                // §10 — apply in its own transaction, with bounded inline retry for PROVABLY-TRANSIENT
                // save failures (NETWORK_TIMEOUT / RATE_LIMIT_EXCEEDED / DATABASE_ERROR per IsRetryableError).
                // Each attempt rolls back on throw so the next starts clean; a deadlock/momentary timeout
                // self-heals here. A PERMANENT error (validation/FK/duplicate/config) is NOT retried — it
                // throws straight out to the dead-letter path below.
                await WithRetry(
                    async () => {
                        await provider.BeginTransaction();
                        try {
                            await this.ApplySingleRecord(record, companyIntegration, entityMap, result, contextUser, logger, precheckHashes, reconciledSkipIds);
                            await provider.CommitTransaction();
                        } catch (e) {
                            await provider.RollbackTransaction();
                            throw e;
                        }
                    },
                    undefined,
                    (err) => !(err instanceof SchemaNotGeneratedError) && IsRetryableError(ClassifyError(err).Code),
                    (attempt, err, delayMs) => logger?.emit('sync.record.retry', {
                        phase: 'save',
                        externalObjectName: entityMap.ExternalObjectName,
                        externalId: record.ExternalRecord.ExternalID,
                        changeType: record.ChangeType,
                        attempt,
                        delayMs,
                        errorCode: ClassifyError(err).Code,
                    }),
                );
            } catch (recErr) {
                // A schema-not-generated failure on one record means EVERY record in this
                // object will fail identically — bubble it up so the entityMap fail-stops
                // once rather than emitting per-record duplicates for the whole batch.
                if (recErr instanceof SchemaNotGeneratedError) {
                    throw recErr;
                }

                // §10 — permanent (or retry-exhausted transient) failure → DEAD-LETTER: count it errored,
                // log it (queryable over GraphQL), and move on. The watermark is NOT held back (it advances
                // to max-seen regardless), so a permanently-bad record never poison-pills the stream; recovery
                // is an operator-triggered full sync. The run still reports Status='Failed' (RecordsErrored>0).
                const classified = ClassifyError(recErr);
                const msg = recErr instanceof Error ? recErr.message : String(recErr);
                result.RecordsErrored++;
                result.Errors.push({
                    ExternalID: record.ExternalRecord.ExternalID,
                    ChangeType: record.ChangeType,
                    ErrorMessage: msg,
                    ErrorCode: classified.Code,
                    Severity: classified.Severity,
                    ExternalRecord: record.ExternalRecord,
                });
                // Surface each save-side failure in the durable artifact (one event per
                // failed record) so isolated failures are visible over GraphQL.
                logger?.emit('sync.record.error', {
                    phase: 'save',
                    externalObjectName: entityMap.ExternalObjectName,
                    externalId: record.ExternalRecord.ExternalID,
                    changeType: record.ChangeType,
                    error: msg,
                    errorCode: classified.Code,
                });
            }
        }
    }

    /**
     * Applies a single record change (Create, Update, Delete, or Skip).
     */
    private async ApplySingleRecord(
        record: MappedRecord,
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        result: SyncResult,
        contextUser: UserInfo,
        logger?: SyncLogger,
        precheckHashes?: Map<string, string>,
        reconciledSkipIds?: string[]
    ): Promise<void> {
        logger?.emit('sync.record.decision', {
            externalId: record.ExternalRecord.ExternalID,
            objectType: record.ExternalRecord.ObjectType,
            entity: record.MJEntityName,
            changeType: record.ChangeType,
            matchedMJRecordID: record.MatchedMJRecordID ?? null,
        });

        // Capture counters so we can report the concrete per-record outcome in the log.
        const before = {
            c: result.RecordsCreated, u: result.RecordsUpdated,
            d: result.RecordsDeleted, s: result.RecordsSkipped,
        };

        try {
            switch (record.ChangeType) {
                case 'Create': {
                    const outcome = await this.CreateRecord(record, companyIntegration, entityMap, contextUser);
                    if (outcome === 'updated') result.RecordsUpdated++;
                    else if (outcome === 'skipped') result.RecordsSkipped++;
                    else result.RecordsCreated++;
                    break;
                }
                case 'Update':
                    await this.UpdateRecord(record, companyIntegration, entityMap, result, contextUser, precheckHashes, reconciledSkipIds);
                    break;
                case 'Delete': {
                    const didDelete = await this.DeleteRecord(record, entityMap, contextUser);
                    if (didDelete) result.RecordsDeleted++;
                    else result.RecordsErrored++;
                    break;
                }
                case 'Skip':
                    result.RecordsSkipped++;
                    break;
            }
        } catch (err) {
            // §29 — a value that doesn't fit its column type (string too wide, integer out of range) is a
            // per-RECORD skip, not a batch failure and not truncation/clamping. Surface it as a structured
            // SyncWarning (visible over GraphQL) and move on so the rest of the batch still commits. The
            // base ValueFitError is caught, so every family member is handled uniformly. Any other error
            // propagates (batch isolation handles it).
            if (err instanceof ValueFitError) {
                result.RecordsSkipped++;
                logger?.warning(
                    entityMap.ExternalObjectName ?? entityMap.Entity ?? entityMap.ID,
                    err.WarningCode,
                    `Record skipped — ${err.message}`,
                    { externalId: record.ExternalRecord.ExternalID, field: err.FieldName, ...err.Details() },
                );
            } else {
                throw err;
            }
        }

        if (logger) {
            const outcome =
                result.RecordsCreated > before.c ? 'created' :
                result.RecordsUpdated > before.u ? 'updated' :
                result.RecordsDeleted > before.d ? (entityMap.DeleteBehavior === 'SoftDelete' ? 'archived' : 'deleted') :
                result.RecordsSkipped > before.s ? 'skipped' : 'errored';
            logger.emit(outcome === 'archived' ? 'sync.record.archived' : 'sync.record.saved', {
                externalId: record.ExternalRecord.ExternalID,
                entity: record.MJEntityName,
                outcome,
                // The mirror row's __mj_integration_LastSyncedSnapshot is refreshed on create/update.
                snapshotWritten: outcome === 'created' || outcome === 'updated',
                matchedMJRecordID: record.MatchedMJRecordID ?? null,
            });
        }
    }

    /**
     * Upserts an MJ record BY PRIMARY KEY (and saves a record-map entry).
     *
     * This is the "unmatched" write path — reached when a record matched neither the RecordMap nor a
     * key-field lookup, so the caller assumed it was new. Historically it blindly `NewRecord()`+INSERTed,
     * which COLLIDED with a duplicate-key violation when the dest row already existed but no RecordMap
     * pointed at it. That happens for real: after the entity maps (and their record maps) are deleted while
     * the dest rows persist (a maps delete+re-add, or a partial cleanup), a content-changed record matches
     * neither the (gone) map nor a key field and lands here — over a live PK.
     *
     * Fix: load by the record's mapped PK first; only `NewRecord()` when the row does not already exist,
     * otherwise UPDATE it in place. This makes the create path idempotent on the PK (§7 "idempotent upserts
     * keyed on PK") and re-establishes the missing record map either way.
     *
     * @returns true if an existing row was updated, false if a new row was inserted (so the caller counts correctly).
     */
    private async CreateRecord(
        record: MappedRecord,
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        contextUser: UserInfo
    ): Promise<'created' | 'updated' | 'skipped'> {
        const md = this.ProviderToUse;
        const entity = await md.GetEntityObject(record.MJEntityName, contextUser);
        const entityInfo = md.EntityByName(record.MJEntityName);
        const pkFields = entityInfo?.PrimaryKeys ?? (entityInfo?.FirstPrimaryKey ? [entityInfo.FirstPrimaryKey] : []);

        // Upsert-safe: if the record's mapped fields carry a PK (soft-PK dest tables key on the external
        // ID), check whether that row already exists before deciding INSERT vs UPDATE. A null mappedPK
        // (e.g. a server-assigned UUID PK not present in the mapped fields) means a genuinely new row.
        const mappedPK = this.extractMappedPrimaryKey(record, pkFields);
        const existed = mappedPK != null
            ? await entity.InnerLoad(this.BuildEntityPrimaryKey(mappedPK, pkFields))
            : false;

        if (existed) {
            // Content-hash fast path (the upsert-path complement to UpdateRecord's matched-path precheck):
            // if the existing row's STORED hash equals the recomputed hash of the incoming mapped fields,
            // the record is provably unchanged — re-establish the (possibly-cleared) record map and SKIP
            // the write. Without this, object-valued mapped fields (persisted as JSON strings) make MJ's
            // field-level dirty tracking fire spuriously on every re-sync, re-writing unchanged rows — the
            // PropFuel `opens` class of redundant write that UpdateRecord's content-hash skip already avoids
            // on the MATCHED path but the upsert (unmatched / soft-PK) path did not. .Get on the dynamic
            // integration column is the sanctioned access here — these runtime-created tables have no
            // generated entity type (the engine already .Set()s the same __mj_integration_* columns).
            const hasHashColumn = entityInfo?.Fields.some(f => f.Name === CONTENT_HASH_COLUMN) ?? false;
            if (hasHashColumn) {
                const storedHash = entity.Get(CONTENT_HASH_COLUMN);
                if (typeof storedHash === 'string' && storedHash.length > 0
                    && storedHash === computeContentHashWithOverflow(record.MappedFields ?? {}, record.UnmappedFields)) {
                    await this.SaveRecordMap(
                        companyIntegration.ID, record.ExternalRecord.ExternalID, entityMap.EntityID,
                        entity.PrimaryKey.KeyValuePairs.map(kv => String(kv.Value)).join('|'), contextUser,
                    );
                    return 'skipped';
                }
            }
            // Footprint-clean upsert: set only the BUSINESS fields first; if nothing actually changed
            // (dirty tracking after SetEntityFields, BEFORE the always-changing integration metadata),
            // re-establish the possibly-cleared record map and SKIP the write — leaving __mj_UpdatedAt
            // and the integration LastSynced columns untouched, exactly like the content-hash skip path.
            this.SetEntityFields(entity, record.MappedFields);
            if (!entity.Dirty) {
                await this.SaveRecordMap(
                    companyIntegration.ID, record.ExternalRecord.ExternalID, entityMap.EntityID,
                    entity.PrimaryKey.KeyValuePairs.map(kv => String(kv.Value)).join('|'), contextUser,
                );
                return 'skipped';
            }
        } else {
            entity.NewRecord();
            this.SetEntityFields(entity, record.MappedFields);
        }
        this.SetStandardIntegrationFields(entity, record);

        // A5: Pre-write validation
        this.validateEntity(entity, record.MJEntityName);

        const saved = await entity.Save();
        if (!saved) {
            const errMsg = entity.LatestResult?.CompleteMessage ?? 'unknown error';
            const schemaErr = detectSchemaNotGenerated(record.MJEntityName, errMsg);
            if (schemaErr) throw schemaErr;
            throw new Error(`Failed to ${existed ? 'update' : 'create'} ${record.MJEntityName} record: ${errMsg}`);
        }

        // Use the entity's actual PK as the EntityRecordID in the record map, NOT the external ID.
        // Storing the external ID as EntityRecordID caused UpdateRecord to fail to load the entity
        // (UUID lookup with a HubSpot numeric ID) and fall back here, producing duplicates on every
        // incremental sync. SaveRecordMap is an upsert keyed on (CompanyIntegration, Entity, ExternalID),
        // so this also re-establishes a map that was previously cleared.
        const entityRecordID = entity.PrimaryKey.KeyValuePairs.map(kv => String(kv.Value)).join('|');
        await this.SaveRecordMap(
            companyIntegration.ID,
            record.ExternalRecord.ExternalID,
            entityMap.EntityID,
            entityRecordID,
            contextUser
        );
        return existed ? 'updated' : 'created';
    }

    /**
     * Builds the pipe-joined PK string for a record from its MAPPED fields (case-insensitively), or null
     * when any PK field is absent/blank — i.e. the PK is not carried by the mapped data (server-assigned),
     * so the record is genuinely new and must be inserted. Used by CreateRecord for PK-safe upsert.
     */
    private extractMappedPrimaryKey(record: MappedRecord, pkFields: Array<{ Name: string }>): string | null {
        if (!pkFields.length) return null;
        const fields = record.MappedFields ?? {};
        const lower = new Map<string, unknown>();
        for (const [k, v] of Object.entries(fields)) lower.set(k.toLowerCase(), v);
        const values: string[] = [];
        for (const pk of pkFields) {
            const v = (pk.Name in fields) ? fields[pk.Name] : lower.get(pk.Name.toLowerCase());
            // serializeKeyValue mirrors the write-side coercion (objects → JSON, not "[object Object]")
            // so the load key equals the value stored in the column for object-valued PKs.
            const s = serializeKeyValue(v);
            if (s === '') return null;
            values.push(s);
        }
        return values.join('|');
    }

    /**
     * Updates an existing MJ record with pre-write validation.
     * If the record cannot be loaded (e.g. it was deleted or never fully created),
     * falls back to CreateRecord (upsert behavior).
     */
    private async UpdateRecord(
        record: MappedRecord,
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        result: SyncResult,
        contextUser: UserInfo,
        precheckHashes?: Map<string, string>,
        reconciledSkipIds?: string[]
    ): Promise<void> {
        if (!record.MatchedMJRecordID) {
            // No matched ID — upsert by PK (insert; or update/skip if the PK already exists)
            const outcome = await this.CreateRecord(record, companyIntegration, entityMap, contextUser);
            if (outcome === 'updated') result.RecordsUpdated++;
            else if (outcome === 'skipped') result.RecordsSkipped++;
            else result.RecordsCreated++;
            return;
        }

        // Content-hash fast path (watermark-less change detection): if the batch
        // prefetch produced a stored hash for this record and it equals the freshly
        // computed hash of the incoming mapped fields, the record is provably
        // unchanged — skip the per-record DB load AND the write. The dirty-flag check
        // below is the fallback for entities without the hash column.
        if (precheckHashes) {
            const stored = precheckHashes.get(record.MatchedMJRecordID);
            if (stored && stored === computeContentHashWithOverflow(record.MappedFields ?? {}, record.UnmappedFields)) {
                result.RecordsSkipped++;
                // Re-establish the external↔MJ record map even on the content-hash skip. A record can
                // reach UpdateRecord matched by KEY FIELDS / PK (MatchEngine.FindByKeyFields queries the
                // dest table directly, NOT the RecordMap) with NO map row pointing at it — e.g. after the
                // entity maps (and their cascaded record maps) were deleted while the dest rows persisted
                // (a maps delete+re-add, partial cleanup, or a fresh CompanyIntegration over pre-existing
                // rows). Skipping the write here without writing the map leaves the RecordMap empty for
                // every unchanged-but-matched record, so orphan/delete detection and the 1:1 completeness
                // invariant silently degrade. SaveRecordMap is an upsert keyed on
                // (CompanyIntegration, Entity, ExternalID) — idempotent for already-mapped records, and the
                // CreateRecord skip branches already do exactly this. MatchedMJRecordID IS the dest PK
                // (PrimaryKeys order, '|'-joined), which is the EntityRecordID the map stores.
                await this.SaveRecordMap(
                    companyIntegration.ID, record.ExternalRecord.ExternalID, entityMap.EntityID,
                    record.MatchedMJRecordID, contextUser,
                );
                // The record IS still present and confirmed-unchanged on the source — but skipping
                // the write here means SetStandardIntegrationFields never runs, so __mj_integration_
                // LastReconciledAt would freeze at first-sync time. Record the PK so the batch can
                // refresh LastReconciledAt in ONE set-based touch (keeps the skip optimization while
                // keeping the column's "last confirmed present" semantics honest for future
                // unseen-since-last-reconcile logic). No per-row write — see TouchLastReconciledAt.
                if (reconciledSkipIds) reconciledSkipIds.push(record.MatchedMJRecordID);
                return;
            }
        }

        const md = this.ProviderToUse;
        const entity = await md.GetEntityObject(record.MJEntityName, contextUser);
        const entityInfo = md.EntityByName(record.MJEntityName);
        const pkFields = entityInfo?.PrimaryKeys ?? (entityInfo?.FirstPrimaryKey ? [entityInfo.FirstPrimaryKey] : []);
        const loaded = await entity.InnerLoad(this.BuildEntityPrimaryKey(record.MatchedMJRecordID, pkFields));
        if (!loaded) {
            // Matched-ID row vanished — fall back to upsert by PK (insert; or update/skip if PK exists)
            const outcome = await this.CreateRecord(record, companyIntegration, entityMap, contextUser);
            if (outcome === 'updated') result.RecordsUpdated++;
            else if (outcome === 'skipped') result.RecordsSkipped++;
            else result.RecordsCreated++;
            return;
        }

        this.SetEntityFields(entity, record.MappedFields);
        this.SetStandardIntegrationFields(entity, record);

        // Skip unchanged records — if no field values actually changed after setting,
        // don't write to DB. Uses MJ's built-in dirty tracking (zero custom comparison logic).
        // Critical for connectors without server-side date filtering (e.g., YM) where every
        // sync re-fetches all records. Without this, 50k+ records get re-written every run.
        if (!entity.Dirty) {
            result.RecordsSkipped++;
            // Re-establish the record map even when the write is skipped — see the content-hash skip
            // above for the full rationale (a key-field/PK match can land here with no map row, and
            // dropping the map silently breaks the 1:1 completeness invariant + orphan detection).
            // The entity is loaded here, so use its actual PK as the EntityRecordID. Idempotent upsert.
            await this.SaveRecordMap(
                companyIntegration.ID, record.ExternalRecord.ExternalID, entityMap.EntityID,
                entity.PrimaryKey.KeyValuePairs.map(kv => String(kv.Value)).join('|'), contextUser,
            );
            return;
        }

        // A5: Pre-write validation
        this.validateEntity(entity, record.MJEntityName);

        const saved = await entity.Save();
        if (!saved) {
            const errMsg = entity.LatestResult?.CompleteMessage ?? 'unknown error';
            const schemaErr = detectSchemaNotGenerated(record.MJEntityName, errMsg);
            if (schemaErr) throw schemaErr;
            throw new Error(`Failed to update ${record.MJEntityName} record ${record.MatchedMJRecordID}: ${errMsg}`);
        }

        // Maintain the external↔MJ record map on UPDATE too, not just on CREATE. A record matched via
        // key fields (MatchEngine.FindByKeyFields queries the dest table directly, NOT the RecordMap)
        // would otherwise be updated with no map ever written — so the RecordMap drifts from the actual
        // rows and orphan/delete detection silently degrades. SaveRecordMap is an upsert keyed on
        // (CompanyIntegration, Entity, ExternalID), so this is idempotent for already-mapped records.
        const entityRecordID = entity.PrimaryKey.KeyValuePairs.map(kv => String(kv.Value)).join('|');
        await this.SaveRecordMap(
            companyIntegration.ID,
            record.ExternalRecord.ExternalID,
            entityMap.EntityID,
            entityRecordID,
            contextUser
        );
        result.RecordsUpdated++;
    }

    /**
     * Batch-loads the stored `__mj_integration_ContentHash` for the Update records in a
     * batch, keyed by matched MJ record ID. Returns undefined (→ no fast-path skip; the
     * dirty-flag path runs) when the optimization doesn't apply or can't be performed:
     *   - the target entity has no ContentHash column (predates the feature), or
     *   - the entity has a composite PK (we keep the '|'-split out of the fast path), or
     *   - nothing in the batch is an Update with a matched ID, or
     *   - the read fails (best-effort — a logging/optimization read must never break a sync).
     */
    private async PrefetchContentHashes(
        batch: MappedRecord[],
        contextUser: UserInfo
    ): Promise<Map<string, string> | undefined> {
        const ids = Array.from(new Set(
            batch.filter(r => r.ChangeType === 'Update' && r.MatchedMJRecordID)
                 .map(r => r.MatchedMJRecordID as string)
        ));
        if (ids.length === 0) return undefined;

        const entityName = batch[0].MJEntityName;
        const entityInfo = this.ProviderToUse.EntityByName(entityName);
        if (!entityInfo) return undefined;
        if (!entityInfo.Fields.some(f => f.Name === CONTENT_HASH_COLUMN)) return undefined;
        const pkFields = entityInfo.PrimaryKeys ?? [];
        if (pkFields.length === 0) return undefined;
        // Map keys must match `record.MatchedMJRecordID`, which is the PK value(s) joined by '|' in
        // PrimaryKeys order (single value for single-PK, "v1|v2" for composite — see MatchEngine).
        const pkNames = pkFields.map(f => f.Name);

        try {
            const rv = new RunView();
            let extraFilter: string;
            if (pkNames.length === 1) {
                // Single-PK fast path: WHERE pk IN (...).
                const escaped = ids.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
                extraFilter = `${pkNames[0]} IN (${escaped})`;
            } else {
                // Composite-PK: each MatchedMJRecordID is "v1|v2|..." in PrimaryKeys order. Build
                // an OR of per-record (pk1='v1' AND pk2='v2') clauses — bounded by batch size.
                // Plain (unbracketed) identifiers → dialect-agnostic (SS brackets break Postgres).
                extraFilter = ids.map(mid => {
                    const parts = String(mid).split('|');
                    return '(' + pkNames.map((name, i) =>
                        `${name} = '${String(parts[i] ?? '').replace(/'/g, "''")}'`).join(' AND ') + ')';
                }).join(' OR ');
            }
            const res = await rv.RunView<Record<string, string>>({
                EntityName: entityName,
                Fields: [...pkNames, CONTENT_HASH_COLUMN],
                ExtraFilter: extraFilter,
                ResultType: 'simple',
            }, contextUser);
            if (!res.Success) return undefined;
            const map = new Map<string, string>();
            for (const row of res.Results) {
                // Re-key by the same '|'-join the matcher produced, so the lookup in ApplySingleRecord hits.
                const key = pkNames.map(n => row[n] ?? '').join('|');
                const hash = row[CONTENT_HASH_COLUMN];
                if (typeof hash === 'string' && hash.length > 0) {
                    map.set(key, hash);
                }
            }
            return map;
        } catch {
            return undefined; // best-effort — never break a sync over a prefetch failure
        }
    }

    /**
     * Runs Validate() on an entity if the method exists.
     * Throws a validation error with details if validation fails.
     */
    private validateEntity(
        entity: { Validate?: () => ValidationResult | null },
        entityName: string
    ): void {
        if (typeof entity.Validate !== 'function') return;

        const validationResult = entity.Validate();
        if (validationResult && !validationResult.Success) {
            const messages = validationResult.Errors?.map(e => e.Message).join('; ') ?? 'Validation failed';
            throw new Error(`Validation failed for ${entityName}: ${messages}`);
        }
    }

    /**
     * Deletes (or soft-deletes) an MJ record based on the entity map's DeleteBehavior.
     */
    private async DeleteRecord(
        record: MappedRecord,
        entityMap: ICompanyIntegrationEntityMap,
        contextUser: UserInfo
    ): Promise<boolean> {
        if (!record.MatchedMJRecordID) {
            console.log(`[IntegrationEngine] Skipping delete for ${record.ExternalRecord.ObjectType} ExternalID=${record.ExternalRecord.ExternalID} — no MJ record map entry (record was never synced)`);
            return false;
        }

        if (entityMap.DeleteBehavior === 'DoNothing') return false;

        const md = this.ProviderToUse;
        const entity = await md.GetEntityObject(record.MJEntityName, contextUser);
        const entityInfo = md.EntityByName(record.MJEntityName);
        const pkFields = entityInfo?.PrimaryKeys ?? (entityInfo?.FirstPrimaryKey ? [entityInfo.FirstPrimaryKey] : []);
        const loaded = await entity.InnerLoad(this.BuildEntityPrimaryKey(record.MatchedMJRecordID, pkFields));
        if (!loaded) {
            console.log(`[IntegrationEngine] Skipping delete for ${record.MJEntityName} ${record.MatchedMJRecordID} — record not found in MJ DB (may have been deleted already)`);
            return false;
        }

        // SoftDelete = mark the mirror row Archived (the standard sync-status for records
        // removed upstream) and keep it; HardDelete physically removes it. (DoNothing
        // already returned above.) Previously both behaviors hit entity.Delete() — so
        // SoftDelete was indistinguishable from HardDelete.
        if (entityMap.DeleteBehavior === 'SoftDelete') {
            const fields = entity.Fields ?? [];
            const hasField = (n: string) => fields.some(f => f.Name === n);
            if (hasField('__mj_integration_SyncStatus')) entity.Set('__mj_integration_SyncStatus', 'Archived');
            if (hasField('__mj_integration_LastSyncedAt')) entity.Set('__mj_integration_LastSyncedAt', new Date().toISOString());
            // Explicit, queryable tombstone (plan §2.5) — distinct from parsing SyncStatus='Archived'.
            if (hasField('__mj_integration_IsTombstoned')) entity.Set('__mj_integration_IsTombstoned', true);
            if (hasField('__mj_integration_DeletedDetectedAt')) entity.Set('__mj_integration_DeletedDetectedAt', new Date().toISOString());
            const archived = await entity.Save();
            if (!archived) {
                const reason = entity.LatestResult?.CompleteMessage ?? 'unknown reason';
                console.warn(`[IntegrationEngine] Soft-delete (archive) failed for ${record.MJEntityName} ${record.MatchedMJRecordID} — ${reason}`);
            }
            return archived;
        }

        const deleted = await entity.Delete();
        if (!deleted) {
            const reason = entity.LatestResult?.CompleteMessage ?? 'unknown reason';
            console.warn(`[IntegrationEngine] Delete blocked for ${record.MJEntityName} ${record.MatchedMJRecordID} — ${reason}`);
        }
        return deleted;
    }

    /**
     * Builds a CompositeKey for a record lookup using the entity's PK field definitions.
     * Supports both single-PK and composite-PK entities. For composite PKs the recordID
     * is expected to be a '|'-delimited string of values in PK-field sequence order —
     * the same format written by BaseRESTIntegrationConnector.ToExternalRecord.
     */
    private BuildEntityPrimaryKey(
        recordID: string,
        pkFields: Array<{ Name: string }>
    ): CompositeKey {
        const key = new CompositeKey();
        if (pkFields.length <= 1) {
            key.KeyValuePairs.push({ FieldName: pkFields[0]?.Name ?? 'ID', Value: recordID });
        } else {
            const parts = recordID.split('|');
            for (let i = 0; i < pkFields.length; i++) {
                key.KeyValuePairs.push({ FieldName: pkFields[i].Name, Value: parts[i] ?? '' });
            }
        }
        return key;
    }

    /**
     * Sets fields on a BaseEntity instance from a field value map.
     */
    private SetEntityFields(
        entity: {
            Set(fieldName: string, value: unknown): void;
            Fields?: Array<{ Name: string; EntityFieldInfo?: { Type?: string; AllowsNull?: boolean; MaxLength?: number }; Type?: string }>;
        },
        fields: Record<string, unknown>
    ): void {
        // Build a quick lookup of field types so we can coerce values correctly.
        // Empty strings and common "null sentinel" values from external systems
        // (e.g., Salesforce returns "" for unset lat/lon on some records) MUST
        // become JS null before hitting BaseEntity.Set() — otherwise MJ's SQL
        // provider passes "" into a DECIMAL/INT/DATE column and SQL Server
        // throws "Error converting data type nvarchar to decimal".
        const typeLookup = new Map<string, string>();
        const maxLenLookup = new Map<string, number>();
        for (const f of entity.Fields ?? []) {
            const rawType = f.EntityFieldInfo?.Type ?? f.Type;
            if (rawType) typeLookup.set(f.Name.toLowerCase(), rawType.toLowerCase());
            const ml = f.EntityFieldInfo?.MaxLength;   // already a CHARACTER count (nvarchar bytes→chars); 0 = unlimited
            if (typeof ml === 'number' && ml > 0) maxLenLookup.set(f.Name.toLowerCase(), ml);
        }

        for (const [fieldName, value] of Object.entries(fields)) {
            const key = fieldName.toLowerCase();
            const coerced = this.coerceIncomingValue(value, typeLookup.get(key));
            entity.Set(fieldName, this.enforceValueFit(coerced, typeLookup.get(key), maxLenLookup.get(key), fieldName));
        }
    }

    /**
     * §5/§10/§29 value-fit enforcement: a value that cannot fit its bounded destination column is NOT
     * truncated/clamped (silent corruption) and does NOT widen the column (space is the priority) —
     * instead it raises a {@link ValueFitError}, which ApplySingleRecord catches to SKIP that one record
     * and surface a structured SyncWarning. Two fit failures are enforced: a string wider than its column
     * ({@link StringOverflowError}) and an integer outside its column's range ({@link NumericOverflowError},
     * which would otherwise sink the whole batch at SQL bind time). Values that fit / unlimited columns /
     * non-enforced types pass through unchanged.
     */
    private enforceValueFit(value: unknown, targetType: string | undefined, maxLength: number | undefined, fieldName: string): unknown {
        if (typeof value === 'string' && maxLength !== undefined && value.length > maxLength) {
            throw new StringOverflowError(fieldName, value.length, maxLength);
        }
        if (typeof value === 'number' && Number.isFinite(value) && targetType) {
            const bound = INTEGER_SQL_BOUNDS[targetType.toLowerCase()];
            if (bound && (value < bound.min || value > bound.max)) {
                throw new NumericOverflowError(fieldName, value, targetType);
            }
        }
        return value;
    }

    /**
     * Coerce external values to something MJ's SQL provider can bind safely.
     * The external system has already done its best — this is only a safety
     * net for common edge cases (empty strings for numeric columns, etc.).
     */
    private coerceIncomingValue(value: unknown, targetType?: string): unknown {
        if (value == null) return value;

        // Reject NaN / Infinity for any numeric value before it hits the SQL
        // parameter binder. The mssql driver passes these straight through to
        // SQL Server as 'NaN' / 'Infinity' strings, which then fails decimal
        // conversion. Connectors occasionally surface NaN when the source API
        // returns a sentinel that JSON.parse coerces to NaN, or when arithmetic
        // on missing fields produces it. Better to null than crash the row.
        if (typeof value === 'number' && !Number.isFinite(value)) return null;

        // Structured values (objects/arrays — nested JSON fields from APIs like HubSpot, or the output of
        // ApplySplit/ApplyCustom) cannot bind to a SQL column and would throw at entity.Set(), sinking the
        // whole 500-record batch. Serialize to JSON and let the type handling below place it: a string/text
        // column gets the JSON text; a scalar column won't parse it and nulls it. Grace over a hard failure (§8).
        if (typeof value === 'object' && !(value instanceof Date)) {
            value = JSON.stringify(value);
        }

        // Non-string primitives pass through unchanged (numbers, booleans,
        // Dates, etc.). The mssql driver handles them natively.
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        if (trimmed === '') {
            // Empty string → null for ALL types. If the column is non-string and
            // we pass an empty string, SQL Server's implicit conversion fails.
            // If the column IS a string and was nullable, null is still a
            // reasonable representation of "no value".
            return null;
        }
        if (targetType) {
            if (this.isNumericSqlType(targetType)) {
                // Strip common formatting that SI/SF/HubSpot occasionally
                // include in numeric-typed responses: thousands separators,
                // currency symbols, leading +. Trailing % stays as-is —
                // a percent column should be unformatted upstream.
                const cleaned = trimmed.replace(/^\+/, '').replace(/[,$£€¥]/g, '');
                const n = Number(cleaned);
                return Number.isFinite(n) ? n : null;
            }
            if (this.isBooleanSqlType(targetType)) {
                const lower = trimmed.toLowerCase();
                if (lower === 'true' || lower === '1' || lower === 'yes') return true;
                if (lower === 'false' || lower === '0' || lower === 'no') return false;
                return null;
            }
            if (this.isDateSqlType(targetType)) {
                const d = new Date(trimmed);
                return Number.isNaN(d.getTime()) ? null : d;
            }
            return value;
        }
        // No target type info — this happens when the entity's Fields array
        // isn't enriched (e.g. freshly-RSU'd entities before the metadata cache
        // catches up). Without this branch, a SF field typed `double` in
        // describe but returned as "3.14" by the API flows through as an
        // nvarchar → SQL Server throws "Error converting data type nvarchar to
        // decimal". We can't be sure of the target column type here, but shape
        // sniffing is safer than silently handing SQL Server a string: if the
        // incoming value is unambiguously numeric or boolean we coerce,
        // otherwise leave it alone.
        return this.shapeSniffedCoerce(trimmed, value);
    }

    /**
     * Shape-based coercion used only when we have no target type info. Matches
     * JSON-safe number/boolean literals exactly so we don't accidentally coerce
     * legitimately string-shaped IDs that happen to contain digits.
     */
    private shapeSniffedCoerce(trimmed: string, original: string): unknown {
        // Boolean literal
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        // Strict numeric literal — no leading/trailing characters, finite
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
            const n = Number(trimmed);
            if (Number.isFinite(n)) return n;
        }
        return original;
    }

    private isNumericSqlType(t: string): boolean {
        return /decimal|numeric|int|bigint|smallint|tinyint|float|double|real|money/.test(t);
    }

    private isBooleanSqlType(t: string): boolean {
        return /bit|bool/.test(t);
    }

    private isDateSqlType(t: string): boolean {
        return /date|time|timestamp/.test(t);
    }

    /**
     * Sets standard integration columns (__mj_integration_*) on target entities.
     * Silently skips if the entity doesn't have these columns (e.g., __mj targets).
     */
    private SetStandardIntegrationFields(
        entity: { Set(fieldName: string, value: unknown): void; Fields?: Array<{ Name: string }> },
        record: MappedRecord
    ): void {
        const fieldNames = entity.Fields?.map(f => f.Name) ?? [];
        const hasField = (name: string) => fieldNames.includes(name);

        if (hasField('__mj_integration_LastSyncedAt')) {
            entity.Set('__mj_integration_LastSyncedAt', new Date().toISOString());
        }
        if (hasField('__mj_integration_SyncStatus')) {
            entity.Set('__mj_integration_SyncStatus', 'Active');
        }
        // Snapshot the external values we just synced — the last-known external state,
        // kept independent of any later local edits to the mirror row. Powers
        // watermark-less change detection and the 3-way field-level merge (combine)
        // on bidirectional push (snapshot = common ancestor).
        if (hasField('__mj_integration_LastSyncedSnapshot')) {
            entity.Set('__mj_integration_LastSyncedSnapshot', JSON.stringify(record.MappedFields ?? {}));
        }
        // A clean sync clears any prior conflict/error note.
        if (hasField('__mj_integration_SyncMessage')) {
            entity.Set('__mj_integration_SyncMessage', null);
        }
        // Content hash of the mapped values — the cheap change-detection key for
        // watermark-less sources. On the next sync, a record whose freshly-computed
        // hash equals the stored hash can be skipped without loading it (see
        // PrefetchContentHashes / UpdateRecord). No-op on tables predating the column.
        if (hasField(CONTENT_HASH_COLUMN)) {
            entity.Set(CONTENT_HASH_COLUMN, computeContentHashWithOverflow(record.MappedFields ?? {}, record.UnmappedFields));
        }
        // Custom-overflow capture (gaps.md §2): park any source keys with no field map as JSON,
        // in THIS same row write (no extra round-trip → a customs-free sync stays byte-identical).
        // Only written when there ARE extras; when empty, this is the signal that no post-sync RSU
        // promotion is needed for this row. Backend staging only — never user-facing metadata until
        // a key is promoted to a real column. No-op on tables predating the column. See CustomOverflow.
        if (hasField(CUSTOM_OVERFLOW_COLUMN) && hasUnmappedFields(record.UnmappedFields)) {
            entity.Set(CUSTOM_OVERFLOW_COLUMN, JSON.stringify(record.UnmappedFields));
        }

        // ── Per-record sync ledger (plan §2.5) ───────────────────────────────────────
        // The external system's version token for optimistic-concurrency on bidirectional
        // push (detects "external changed since we last saw it"). HubSpot et al. expose this
        // as the modified timestamp; sources with no version token leave it null (honest gap).
        const externalVersion = record.ExternalRecord?.ModifiedAt
            ? new Date(record.ExternalRecord.ModifiedAt).toISOString()
            : null;
        if (hasField('__mj_integration_ExternalVersion')) {
            entity.Set('__mj_integration_ExternalVersion', externalVersion);
        }
        // The watermark value we observed for THIS record (per-record, vs the entity-map-level
        // CompanyIntegrationSyncWatermark) — lets a record carry its own last-seen change marker.
        if (hasField('__mj_integration_LastSeenModifiedValue')) {
            entity.Set('__mj_integration_LastSeenModifiedValue', externalVersion);
        }
        // Last time this record was confirmed against the source (every successful pull-apply
        // reconciles it). NOTE: currently updated on full AND incremental syncs; a full-only
        // refinement (to find records unseen since the last full reconcile) is a documented follow-up.
        if (hasField('__mj_integration_LastReconciledAt')) {
            entity.Set('__mj_integration_LastReconciledAt', new Date().toISOString());
        }
        // Which side last wrote this row. This is the pull-apply path → 'Pull'. (A bidirectional
        // push-back path sets 'Push'.) Lets conflict handling know the last writer direction.
        if (hasField('__mj_integration_LastWriterDirection')) {
            entity.Set('__mj_integration_LastWriterDirection', 'Pull');
        }
        // A live (non-deleted) record. The soft-delete path flips this to true + stamps
        // DeletedDetectedAt — an explicit, queryable tombstone instead of parsing SyncStatus text.
        if (hasField('__mj_integration_IsTombstoned')) {
            entity.Set('__mj_integration_IsTombstoned', false);
        }
    }

    /**
     * Creates or updates a CompanyIntegrationRecordMap entry to track the external↔MJ mapping.
     */
    private async SaveRecordMap(
        companyIntegrationID: string,
        externalID: string,
        entityID: string,
        entityRecordID: string,
        contextUser: UserInfo
    ): Promise<void> {
        const md = this.ProviderToUse;
        const recordMap = await md.GetEntityObject<MJCompanyIntegrationRecordMapEntity>(
            'MJ: Company Integration Record Maps',
            contextUser
        );

        // Upsert by identity: one row per (CompanyIntegration, Entity, external record).
        // The prior always-NewRecord() behavior created a duplicate map row whenever a
        // record fell through to this path again (e.g. matching missed), which then made
        // every by-external-ID lookup ambiguous. Look up an existing mapping first.
        const rv = new RunView();
        const existing = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND EntityID='${entityID}' AND ExternalSystemRecordID='${externalID.replace(/'/g, "''")}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
            BypassCache: true, // upsert-by-identity: a stale miss here re-creates a duplicate record map
        }, contextUser);

        if (existing.Success && existing.Results.length > 0) {
            const loaded = await recordMap.Load(existing.Results[0].ID);
            if (!loaded) recordMap.NewRecord();
        } else {
            recordMap.NewRecord();
        }

        recordMap.CompanyIntegrationID = companyIntegrationID;
        recordMap.ExternalSystemRecordID = externalID;
        recordMap.EntityID = entityID;
        recordMap.EntityRecordID = entityRecordID;

        const saved = await recordMap.Save();
        if (!saved) {
            throw new Error(`Failed to save record map for external ID ${externalID}: ${recordMap.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Creates a CompanyIntegrationRunDetail record for audit/reporting.
     */
    private async CreateRunDetail(
        run: MJCompanyIntegrationRunEntity,
        entityMap: ICompanyIntegrationEntityMap,
        result: SyncResult,
        contextUser: UserInfo
    ): Promise<void> {
        const md = this.ProviderToUse;
        const detail = await md.GetEntityObject<MJCompanyIntegrationRunDetailEntity>(
            'MJ: Company Integration Run Details',
            contextUser
        );
        detail.NewRecord();
        detail.CompanyIntegrationRunID = run.ID;
        detail.EntityID = entityMap.EntityID;
        // Stamp the EntityMapID (NOT just the EntityID) into the free-form RecordID so resume
        // can correlate completion per entity MAP. Two distinct maps can target the same MJ Entity
        // (CompanyIntegrationEntityMap has no unique (CompanyIntegrationID, EntityID) constraint),
        // so keying resume on EntityID alone could wrongly skip a second still-pending map sharing
        // that entity. Format: 'EntityMap:<id>|Processed:<n>'. ResumeOrphanedSyncs parses this.
        detail.RecordID = `EntityMap:${entityMap.ID}|Processed:${result.RecordsProcessed}`;
        detail.Action = result.RecordsCreated > 0 ? 'INSERT' : 'UPDATE';
        detail.IsSuccess = result.RecordsErrored === 0;

        // Retry: this row IS the per-entity-map audit trail the GraphQL GetRun API reads. A lost save
        // makes a working sync look like it processed zero maps. Retry transient failures before giving up.
        try {
            await WithRetry(
                async () => {
                    const ok = await detail.Save();
                    if (!ok) throw new Error(detail.LatestResult?.CompleteMessage ?? 'detail.Save() returned false');
                    return true;
                },
                { MaxAttempts: 3, InitialBackoffMs: 500, MaxBackoffMs: 5000, JitterFraction: 0.1 },
            );
        } catch (detailErr) {
            console.error(
                `[IntegrationEngine] Failed to save run detail for entity map ${entityMap.ID} after retries: ` +
                `${detailErr instanceof Error ? detailErr.message : String(detailErr)}. ` +
                `The run's per-map audit row is missing; GetRun will under-report processed maps.`
            );
        }
    }

    /**
     * Merges an entity-map-level result into the aggregate result.
     */
    private MergeResult(aggregate: SyncResult, mapResult: SyncResult): void {
        aggregate.RecordsProcessed += mapResult.RecordsProcessed;
        aggregate.RecordsCreated += mapResult.RecordsCreated;
        aggregate.RecordsUpdated += mapResult.RecordsUpdated;
        aggregate.RecordsDeleted += mapResult.RecordsDeleted;
        aggregate.RecordsErrored += mapResult.RecordsErrored;   // true count, always exact
        aggregate.RecordsSkipped += mapResult.RecordsSkipped;
        // Bound the retained error SAMPLE: only the first MAX_AGGREGATE_ERRORS are ever persisted
        // (FinalizeRun slices to 100). Accumulating every per-record error across a multi-million-row
        // failing run would hold the whole set in RAM for no gain — RecordsErrored already has the count.
        if (aggregate.Errors.length < MAX_AGGREGATE_ERRORS && mapResult.Errors.length > 0) {
            const room = MAX_AGGREGATE_ERRORS - aggregate.Errors.length;
            aggregate.Errors.push(...mapResult.Errors.slice(0, room));
        }

        if (mapResult.RecordsErrored > 0) {
            aggregate.Success = false;
        }
    }

    /**
     * Builds a per-entity-map result summary from the entity map and its sync result.
     */
    private buildEntityMapResult(
        entityMap: ICompanyIntegrationEntityMap,
        mapResult: SyncResult,
        duration?: number
    ): EntityMapSyncResult {
        return {
            EntityMapID: entityMap.ID,
            ExternalObjectName: entityMap.ExternalObjectName ?? '',
            EntityName: entityMap.Entity ?? '',
            Success: mapResult.RecordsErrored === 0,
            RecordsProcessed: mapResult.RecordsProcessed,
            RecordsCreated: mapResult.RecordsCreated,
            RecordsUpdated: mapResult.RecordsUpdated,
            RecordsDeleted: mapResult.RecordsDeleted,
            RecordsErrored: mapResult.RecordsErrored,
            RecordsSkipped: mapResult.RecordsSkipped,
            Duration: duration,
        };
    }

    /**
     * Finalizes a successful run with aggregate totals and emits a completion notification.
     */
    private async FinalizeRun(
        run: MJCompanyIntegrationRunEntity,
        result: SyncResult,
        contextUser: UserInfo,
        onNotification?: OnNotificationCallback,
        aborted?: boolean
    ): Promise<void> {
        run.EndedAt = new Date();
        run.TotalRecords = result.RecordsProcessed;
        // A user/system-cancelled run must NOT be recorded as 'Success' — that hides the
        // cancellation in run history (indistinguishable from a clean completion) and is wrong
        // for any downstream cadence/health logic. Until a first-class 'Cancelled' status value
        // exists on CompanyIntegrationRun (Status value list is Pending/In Progress/Success/Failed),
        // finalize an aborted run as 'Failed' with an explicit ErrorLog. The durable progress
        // artifact additionally carries exitReason='aborted' (see finalizeSyncProgress) so a stopped
        // run stays distinguishable from a real failure over GraphQL.
        if (aborted) {
            run.Status = 'Failed';
            run.ErrorLog = result.ErrorMessage ?? 'Sync cancelled by user';
        } else {
            run.Status = result.RecordsErrored > 0 ? 'Failed' : 'Success';
            if (result.Errors.length > 0) {
                run.ErrorLog = JSON.stringify(result.Errors.slice(0, 100));
            }
        }
        // Retry the finalize save: a failed save leaves the run 'In Progress', which ResumeOrphanedSyncs
        // re-queues on next startup → the whole sync re-runs (re-fetch + re-apply). Worth a few retries to
        // make the terminal status durable. Both a thrown infra error and a `false` logical-failure retry.
        try {
            await WithRetry(
                async () => {
                    const ok = await run.Save();
                    if (!ok) throw new Error(run.LatestResult?.CompleteMessage ?? 'run.Save() returned false');
                    return true;
                },
                { MaxAttempts: 3, InitialBackoffMs: 500, MaxBackoffMs: 5000, JitterFraction: 0.1 },
            );
        } catch (saveErr) {
            console.error(
                `[IntegrationEngine] Failed to finalize run ${run.ID} after retries: ` +
                `${saveErr instanceof Error ? saveErr.message : String(saveErr)}. ` +
                `Run may remain 'In Progress' and be re-queued as orphaned on next startup.`
            );
        }

        if (onNotification) {
            const notification = this.buildCompletionNotification(run, result);
            this.safeNotify(onNotification, notification);
        }

        // Retention: keep the run-history audit tables bounded (best-effort; never fails the sync).
        await this.pruneOldRunHistory(run, contextUser);
    }

    /**
     * Retention: prune old CompanyIntegrationRun + RunDetail rows for THIS connection so the audit
     * tables don't grow without bound (a row accumulates per sync forever otherwise — the unbounded-log
     * gap). Keeps the `MJ_INTEGRATION_MAX_RUNS_PER_CI` most-recent runs (default 100; <=0 disables).
     * Uses dialect-safe BULK DELETEs — NOT per-row BaseEntity.Delete, which would just shift the
     * unbounded growth into RecordChanges. Best-effort: a prune failure must NEVER fail a sync that
     * already landed data, and one bulk statement drains a large backlog in a single round-trip.
     */
    private async pruneOldRunHistory(run: MJCompanyIntegrationRunEntity, contextUser: UserInfo): Promise<void> {
        const keep = parseInt(process.env.MJ_INTEGRATION_MAX_RUNS_PER_CI ?? '100', 10);
        if (!Number.isFinite(keep) || keep <= 0) return; // retention disabled
        try {
            const md = this.ProviderToUse;
            const runInfo = run.EntityInfo;
            const detailInfo = md.EntityByName('MJ: Company Integration Run Details');
            const ciId = run.CompanyIntegrationID;
            if (!runInfo?.SchemaName || !runInfo.BaseTable || !runInfo.PrimaryKeys?.length) return;
            if (!detailInfo?.SchemaName || !detailInfo.BaseTable || !ciId) return;

            // Cutoff = StartedAt of the Nth-most-recent run for this CI. If there aren't MORE than
            // `keep` runs, there's nothing to prune.
            const recent = await new RunView().RunView<{ StartedAt: Date | string }>({
                EntityName: runInfo.Name,
                ExtraFilter: `CompanyIntegrationID='${String(ciId).replace(/'/g, "''")}'`,
                OrderBy: 'StartedAt DESC',
                Fields: ['StartedAt'],
                MaxRows: keep,
                ResultType: 'simple',
            }, contextUser);
            if (!recent.Success || (recent.TotalRowCount ?? 0) <= keep) return;
            const cutoffRaw = recent.Results?.[recent.Results.length - 1]?.StartedAt;
            if (!cutoffRaw) return;

            const provider = md as DatabaseProviderBase;
            const d = provider.Dialect;
            const runTable = `${d.QuoteIdentifier(runInfo.SchemaName)}.${d.QuoteIdentifier(runInfo.BaseTable)}`;
            const detailTable = `${d.QuoteIdentifier(detailInfo.SchemaName)}.${d.QuoteIdentifier(detailInfo.BaseTable)}`;
            const runPk = d.QuoteIdentifier(runInfo.PrimaryKeys[0].Name);
            const ciCol = d.QuoteIdentifier('CompanyIntegrationID');
            const startedCol = d.QuoteIdentifier('StartedAt');
            const detailFk = d.QuoteIdentifier('CompanyIntegrationRunID');
            const ci = d.QuoteStringLiteral(String(ciId));
            const cut = d.QuoteStringLiteral(new Date(cutoffRaw).toISOString());
            const oldRuns = `SELECT ${runPk} FROM ${runTable} WHERE ${ciCol}=${ci} AND ${startedCol} < ${cut}`;

            // Details first (FK → run; these entities don't cascade-delete), then the runs.
            await provider.ExecuteSQL(`DELETE FROM ${detailTable} WHERE ${detailFk} IN (${oldRuns})`, undefined, undefined, contextUser);
            await provider.ExecuteSQL(`DELETE FROM ${runTable} WHERE ${ciCol}=${ci} AND ${startedCol} < ${cut}`, undefined, undefined, contextUser);
        } catch (err) {
            console.warn(`[IntegrationEngine] Run-history retention prune skipped: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Marks a run as failed after an unrecoverable error and emits a failure notification.
     */
    private async FailRun(
        run: MJCompanyIntegrationRunEntity,
        err: unknown,
        _contextUser: UserInfo,
        onNotification?: OnNotificationCallback
    ): Promise<void> {
        run.EndedAt = new Date();
        run.Status = 'Failed';
        run.ErrorLog = err instanceof Error ? err.message : String(err);
        await run.Save();

        if (onNotification) {
            const failResult: SyncResult = {
                Success: false,
                RecordsProcessed: 0,
                RecordsCreated: 0,
                RecordsUpdated: 0,
                RecordsDeleted: 0,
                RecordsErrored: 0,
                RecordsSkipped: 0,
                Errors: [],
            };
            const notification = this.buildFailureNotification(run, err, failResult);
            this.safeNotify(onNotification, notification);
        }
    }

    /**
     * Builds a SyncNotification for a completed run (success or completed-with-errors).
     */
    private buildCompletionNotification(
        run: MJCompanyIntegrationRunEntity,
        result: SyncResult
    ): SyncNotification {
        const hasErrors = result.RecordsErrored > 0;
        const event = hasErrors ? 'SyncCompletedWithErrors' : 'SyncCompleted';
        const severity = hasErrors ? 'Warning' : 'Info';
        const integrationName = run.Get('Integration') ?? 'Unknown Integration';
        const subject = hasErrors
            ? `Integration Sync Completed with Errors: ${integrationName}`
            : `Integration Sync Completed: ${integrationName}`;

        const body = this.buildSyncResultBody(integrationName, result);

        return {
            Event: event,
            Severity: severity,
            CompanyIntegrationID: run.CompanyIntegrationID,
            RunID: run.ID,
            Subject: subject,
            Body: body,
            Result: result,
            OccurredAt: new Date(),
        };
    }

    /**
     * Builds a SyncNotification for a catastrophically failed run.
     */
    private buildFailureNotification(
        run: MJCompanyIntegrationRunEntity,
        err: unknown,
        result: SyncResult
    ): SyncNotification {
        const integrationName = run.Get('Integration') ?? 'Unknown Integration';
        const errorMessage = err instanceof Error ? err.message : String(err);
        const subject = `Integration Sync Failed: ${integrationName}`;
        const body = [
            `Integration: ${integrationName}`,
            `Status: Failed`,
            `Error: ${errorMessage}`,
            `Time: ${new Date().toISOString()}`,
        ].join('\n');

        return {
            Event: 'SyncFailed',
            Severity: 'Error',
            CompanyIntegrationID: run.CompanyIntegrationID,
            RunID: run.ID,
            Subject: subject,
            Body: body,
            Result: result,
            OccurredAt: new Date(),
        };
    }

    /**
     * Formats a human-readable sync result body for notification messages.
     */
    private buildSyncResultBody(integrationName: string, result: SyncResult): string {
        const lines = [
            `Integration: ${integrationName}`,
            `Status: ${result.RecordsErrored > 0 ? 'Completed with errors' : 'Success'}`,
            '',
            'Record Counts:',
            `  Processed:  ${result.RecordsProcessed}`,
            `  Created:    ${result.RecordsCreated}`,
            `  Updated:    ${result.RecordsUpdated}`,
            `  Deleted:    ${result.RecordsDeleted}`,
            `  Skipped:    ${result.RecordsSkipped}`,
        ];
        if (result.RecordsErrored > 0) {
            lines.push(`  Errors:     ${result.RecordsErrored}`);
            if (result.Errors.length > 0) {
                lines.push('', 'Error Summary (first 5):');
                for (const e of result.Errors.slice(0, 5)) {
                    lines.push(`  [${e.ErrorCode}] ${e.ExternalID}: ${e.ErrorMessage}`);
                }
            }
        }
        lines.push('', `Completed at: ${new Date().toISOString()}`);
        return lines.join('\n');
    }

    /**
     * Invokes the notification callback without propagating exceptions.
     */
    private safeNotify(callback: OnNotificationCallback, notification: SyncNotification): void {
        try {
            callback(notification);
        } catch (notifyErr) {
            console.warn('[IntegrationEngine] Notification callback threw:', notifyErr);
        }
    }

    /**
     * Invokes the post-sync custom-column promotion hook (gaps.md §2 / M2) without ever
     * propagating an exception into the sync — a promotion failure must never fail a sync that
     * already landed its data. Returns undefined when no hook is registered (a no-op host) or
     * the hook throws. The hook is self-gated: a customs-free sync does no work.
     */
    private async invokePostSyncPromotionSafe(
        companyIntegrationID: string,
        contextUser: UserInfo,
        result: SyncResult
    ): Promise<SchemaPromotionResult | undefined> {
        if (!this.postSyncSchemaPromotionCallback) return undefined;
        try {
            const syncedEntityNames = [
                ...new Set((result.EntityMapResults ?? []).map(r => r.EntityName).filter(Boolean)),
            ];
            return await this.postSyncSchemaPromotionCallback({
                CompanyIntegrationID: companyIntegrationID,
                ContextUser: contextUser,
                SyncedEntityNames: syncedEntityNames,
                Provider: this._provider,
            });
        } catch (promoteErr) {
            console.warn('[IntegrationEngine] Post-sync schema promotion callback threw:', promoteErr);
            return undefined;
        }
    }

    // ── Composition: delegate metadata to IntegrationEngineBase ───────

    protected get Base(): IntegrationEngineBase {
        return IntegrationEngineBase.Instance;
    }

    /**
     * Configures the engine by loading all integration metadata.
     * Delegates to IntegrationEngineBase.Config().
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        await IntegrationEngineBase.Instance.Config(forceRefresh ?? false, contextUser, provider);
    }

    // ── Metadata Accessors (delegated to Base) ────────────────────────

    public get Integrations(): MJIntegrationEntity[] {
        return this.Base.Integrations;
    }

    public get SourceTypes(): MJIntegrationSourceTypeEntity[] {
        return this.Base.SourceTypes;
    }

    public get CompanyIntegrations(): MJCompanyIntegrationEntity[] {
        return this.Base.CompanyIntegrations;
    }

    public get EntityMaps(): MJCompanyIntegrationEntityMapEntity[] {
        return this.Base.EntityMaps;
    }

    public get FieldMaps(): MJCompanyIntegrationFieldMapEntity[] {
        return this.Base.FieldMaps;
    }

    public get Watermarks(): MJCompanyIntegrationSyncWatermarkEntity[] {
        return this.Base.Watermarks;
    }

    // ── Convenience Lookups (delegated to Base) ───────────────────────

    public GetIntegrationByID(id: string): MJIntegrationEntity | undefined {
        return this.Base.GetIntegrationByID(id);
    }

    public GetIntegrationByName(name: string): MJIntegrationEntity | undefined {
        return this.Base.GetIntegrationByName(name);
    }

    public GetCompanyIntegrationByID(id: string): MJCompanyIntegrationEntity | undefined {
        return this.Base.GetCompanyIntegrationByID(id);
    }

    public GetCompanyIntegrationsByIntegrationID(integrationID: string): MJCompanyIntegrationEntity[] {
        return this.Base.GetCompanyIntegrationsByIntegrationID(integrationID);
    }

    public GetEntityMapsForCompanyIntegration(companyIntegrationID: string): MJCompanyIntegrationEntityMapEntity[] {
        return this.Base.GetEntityMapsForCompanyIntegration(companyIntegrationID);
    }

    public GetFieldMapsForEntityMap(entityMapID: string): MJCompanyIntegrationFieldMapEntity[] {
        return this.Base.GetFieldMapsForEntityMap(entityMapID);
    }

    public GetEnabledEntityMaps(companyIntegrationID: string): MJCompanyIntegrationEntityMapEntity[] {
        return this.Base.GetEnabledEntityMaps(companyIntegrationID);
    }

    public GetIntegrationForCompanyIntegration(companyIntegrationID: string): MJIntegrationEntity | undefined {
        return this.Base.GetIntegrationForCompanyIntegration(companyIntegrationID);
    }

    // ── Integration Object Metadata (delegated to Base) ──────────────

    public get IntegrationObjects(): MJIntegrationObjectEntity[] {
        return this.Base.IntegrationObjects;
    }

    public get IntegrationObjectFields(): MJIntegrationObjectFieldEntity[] {
        return this.Base.IntegrationObjectFields;
    }

    public GetIntegrationObjectsByIntegrationID(integrationID: string): MJIntegrationObjectEntity[] {
        return this.Base.GetIntegrationObjectsByIntegrationID(integrationID);
    }

    public GetIntegrationObject(integrationID: string, objectName: string): MJIntegrationObjectEntity | undefined {
        return this.Base.GetIntegrationObject(integrationID, objectName);
    }

    public GetIntegrationObjectByID(objectID: string): MJIntegrationObjectEntity | undefined {
        return this.Base.GetIntegrationObjectByID(objectID);
    }

    public GetIntegrationObjectFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.Base.GetIntegrationObjectFields(objectID);
    }

    public GetActiveIntegrationObjects(integrationID: string): MJIntegrationObjectEntity[] {
        return this.Base.GetActiveIntegrationObjects(integrationID);
    }

    public GetObjectsInDependencyOrder(integrationID: string): MJIntegrationObjectEntity[] {
        return this.Base.GetObjectsInDependencyOrder(integrationID);
    }

    // ── Singleton ─────────────────────────────────────────────────────

    public static get Instance(): IntegrationEngine {
        return IntegrationEngine.getInstance<IntegrationEngine>();
    }
}

/** Internal configuration bundle for a sync run */
interface RunConfiguration {
    companyIntegration: MJCompanyIntegrationEntity;
    entityMaps: ICompanyIntegrationEntityMap[];
    integration: MJIntegrationEntity;
    connector: BaseIntegrationConnector;
    fullSync: boolean;
    /** When set, overrides each entity map's own SyncDirection for this run. */
    syncDirection?: 'Pull' | 'Push' | 'Bidirectional';
}

/** Shape of a validation result from BaseEntity.Validate() */
interface ValidationResult {
    Success: boolean;
    Errors?: ValidationError[];
}

/** Shape of a single validation error */
interface ValidationError {
    Message: string;
}
