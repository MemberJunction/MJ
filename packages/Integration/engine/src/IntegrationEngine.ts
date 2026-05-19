import { CompositeKey, DatabaseProviderBase, IMetadataProvider, Metadata, RunView, type UserInfo } from '@memberjunction/core';
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
    SyncTriggerType,
    SyncProgress,
    OnProgressCallback,
    OnNotificationCallback,
    SyncNotification,
    WatermarkType,
    IntegrationSyncOptions,
    EntityMapSyncResult,
    SyncProgressSnapshot,
} from './types.js';
import { ClassifyError } from './types.js';
import { ConnectorFactory } from './ConnectorFactory.js';
import { FieldMappingEngine } from './FieldMappingEngine.js';
import { MatchEngine } from './MatchEngine.js';
import { WatermarkService } from './WatermarkService.js';
import type { BaseIntegrationConnector, FetchContext, FetchBatchResult } from './BaseIntegrationConnector.js';

/** Default batch size for fetching records from external systems */
const DEFAULT_BATCH_SIZE = 200;

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
 * Returns a SchemaNotGeneratedError if the given Save() failure message
 * matches the SP-not-found pattern. Otherwise returns null. The pattern
 * comes from SQL Server's `Could not find stored procedure '<schema>.<name>'`
 * — when CodeGen hasn't created the spCreate/spUpdate/spDelete for an
 * entity, BaseEntity.Save() returns false and the SP-not-found error
 * lands in entity.LatestResult.CompleteMessage.
 */
function detectSchemaNotGenerated(entityName: string, errorMessage: string): SchemaNotGeneratedError | null {
    const match = errorMessage.match(/Could not find stored procedure '([^']+)'/i);
    if (!match) return null;
    return new SchemaNotGeneratedError(entityName, match[1]);
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

    /** Returns the active provider — explicit override if set, otherwise the global default. */
    protected get ProviderToUse(): IMetadataProvider {
        return this._provider ?? Metadata.Provider;
    }

    /** In-process lock map to prevent concurrent syncs for the same CompanyIntegration */
    private static readonly activeSyncs = new Map<string, Promise<SyncResult>>();

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
        }, contextUser);

        if (!orphanedRuns.Success || orphanedRuns.Results.length === 0) {
            console.log('[IntegrationEngine] No orphaned syncs to resume');
            return;
        }

        console.log(`[IntegrationEngine] Found ${orphanedRuns.Results.length} orphaned sync(s) to resume`);

        for (const run of orphanedRuns.Results) {
            const companyIntegrationID = run.CompanyIntegrationID;
            const runID = run.ID;

            try {
                // Find which entity maps already completed in this run
                const detailsResult = await rv.RunView<{ EntityID: string }>({
                    EntityName: 'MJ: Company Integration Run Details',
                    ExtraFilter: `CompanyIntegrationRunID='${runID}'`,
                    Fields: ['EntityID'],
                    ResultType: 'simple',
                }, contextUser);

                const completedEntityIDs = new Set<string>();
                if (detailsResult.Success) {
                    for (const d of detailsResult.Results) {
                        completedEntityIDs.add(d.EntityID.toLowerCase());
                    }
                }

                console.log(
                    `[IntegrationEngine] Resuming run ${runID.substring(0, 8)}... ` +
                    `for ${companyIntegrationID.substring(0, 8)}... ` +
                    `(${completedEntityIDs.size} entity maps already completed)`
                );

                // Load config and filter to only remaining entity maps
                const config = await this.LoadRunConfiguration(companyIntegrationID, contextUser);
                const remainingMaps = config.entityMaps.filter(
                    em => !completedEntityIDs.has((em.EntityID).toLowerCase())
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
        const config = await this.LoadRunConfiguration(companyIntegrationID, contextUser, options);
        const run = await this.CreateRunRecord(config.companyIntegration, triggerType, contextUser, options?.ScheduledJobRunID);

        try {
            const result = await this.ExecuteEntityMaps(config, run, contextUser, onProgress, abortSignal);
            result.RunID = run.ID;
            result.Duration = Date.now() - startTime;
            if (result.RecordsErrored > 0) {
                result.ErrorMessage = `Sync completed with ${result.RecordsErrored} error(s)`;
            }
            await this.FinalizeRun(run, result, contextUser, onNotification);
            const summary = this.buildSyncResultBody(config.companyIntegration.Integration, result);
            console.log(`[IntegrationEngine] Sync complete:\n${summary}`);
            return result;
        } catch (err) {
            await this.FailRun(run, err, contextUser, onNotification);
            throw err;
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

        const [ciResult, entityMapsResult, integrationsResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Company Integrations',
                ExtraFilter: `ID='${companyIntegrationID}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: Company Integration Entity Maps',
                ExtraFilter: `CompanyIntegrationID='${companyIntegrationID}' AND SyncEnabled=1 AND Status='Active'`,
                OrderBy: 'Priority ASC',
                ResultType: 'entity_object',
            },
            {
                EntityName: 'MJ: Integrations',
                ExtraFilter: '',
                ResultType: 'entity_object',
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
            fullSync: options?.FullSync ?? false,
            syncDirection: options?.SyncDirection,
        };
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
        abortSignal?: AbortSignal
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

        for (let i = 0; i < totalMaps; i++) {
            if (abortSignal?.aborted) {
                console.log(`[IntegrationEngine] Sync cancelled before entity map ${i + 1}/${totalMaps}`);
                aggregate.Success = false;
                aggregate.ErrorMessage = 'Sync cancelled by user';
                break;
            }
            const entityMap = config.entityMaps[i];
            const mapStartTime = Date.now();
            try {
                const mapResult = await this.ProcessSingleEntityMap(
                    config, entityMap, run, contextUser, i, totalMaps, onProgress, abortSignal
                );
                this.MergeResult(aggregate, mapResult);
                aggregate.EntityMapResults!.push(this.buildEntityMapResult(entityMap, mapResult, Date.now() - mapStartTime));
            } catch (err) {
                const objName = entityMap.ExternalObjectName ?? entityMap.ID;
                const errMsg = err instanceof Error ? err.message : String(err);
                console.error(`[IntegrationEngine] Entity map '${objName}' failed: ${errMsg}`);
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
            }
        }

        return aggregate;
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
        abortSignal?: AbortSignal
    ): Promise<SyncResult> {
        const direction = config.syncDirection ?? entityMap.SyncDirection ?? 'Pull';

        if (direction === 'Pull') {
            return this.ProcessPullSync(config, entityMap, run, contextUser, entityMapIndex, totalEntityMaps, onProgress, abortSignal);
        }

        if (direction === 'Push') {
            return this.ProcessPushSync(config, entityMap, run, contextUser, entityMapIndex, totalEntityMaps, onProgress, abortSignal);
        }

        // Bidirectional: pull first, then push
        const pullResult = await this.ProcessPullSync(config, entityMap, run, contextUser, entityMapIndex, totalEntityMaps, onProgress, abortSignal);
        const pushResult = await this.ProcessPushSync(config, entityMap, run, contextUser, entityMapIndex, totalEntityMaps, onProgress, abortSignal);
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
        abortSignal?: AbortSignal
    ): Promise<SyncResult> {
        const entityMapID = entityMap.ID;
        const fieldMaps = await this.LoadFieldMaps(entityMapID, contextUser);
        const watermark = await this.watermarkService.Load(entityMapID, contextUser, 'Pull');

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
        let recordsInMap = 0;
        let currentPage: number | undefined;
        let currentOffset: number | undefined;
        let currentCursor: string | undefined;
        let batchCount = 0;
        let previousBatchFingerprint: string | undefined;
        let fetchCompletedCleanly = true; // flipped to false if fetch aborted or errored mid-way
        const MAX_BATCHES_PER_MAP = 5000;
        const fetchedExternalIDs = new Set<string>(); // Track all IDs seen during this pull for orphan detection

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
            };

            let batch: FetchBatchResult;
            try {
                batch = await config.connector.FetchChanges(ctx);
            } catch (fetchErr) {
                const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
                console.error(`[IntegrationEngine] FetchChanges error for ${entityMap.ExternalObjectName}: ${errMsg}`);
                fetchCompletedCleanly = false;
                break;
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

            for (const rec of batch.Records) {
                fetchedExternalIDs.add(rec.ExternalID);
            }

            const mapped = this.fieldMappingEngine.Apply(
                batch.Records, fieldMaps, entityMap.Entity
            );
            const resolved = await this.matchEngine.Resolve(
                mapped, entityMap, fieldMaps, contextUser
            );

            const beforeApply = result.RecordsCreated + result.RecordsUpdated + result.RecordsSkipped + result.RecordsErrored;
            try {
                await this.ApplyRecords(resolved, config.companyIntegration, entityMap, result, contextUser);
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

            if (batch.Records.length > 0) {
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
                    await this.watermarkService.UpdateProgress(entityMapID, afterApply, contextUser);
                }
            }

            recordsInMap += batch.Records.length;

            // A8: Progress tracking
            if (onProgress) {
                this.emitProgress(onProgress, entityMapIndex, totalEntityMaps, recordsInMap, recordsInMap);
            }

            if (batch.NewWatermarkValue) {
                currentWatermark = batch.NewWatermarkValue;
            }
            currentPage = batch.NextPage;
            currentOffset = batch.NextOffset;
            currentCursor = batch.NextCursor;
            hasMore = batch.HasMore === true; // Explicit boolean check — prevents truthy undefined from looping
        }

        if (fetchCompletedCleanly) {
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
                finalWatermark = config.fullSync ? new Date().toISOString() : currentWatermark;
            } else {
                finalWatermark = new Date().toISOString();
            }
            await this.watermarkService.Update(entityMapID, finalWatermark, contextUser, 'Pull');
            result.WatermarkAfter = finalWatermark;
        }

        // Orphan detection: on full sync, delete MJ records whose external counterpart no longer exists.
        // Only runs if the fetch completed cleanly — a partial fetch (aborted, errored, safety-limited)
        // means fetchedExternalIDs is incomplete; running deletion on it would be catastrophic.
        if (config.fullSync && fetchedExternalIDs.size > 0 && fetchCompletedCleanly) {
            await this.DeleteOrphanedRecords(
                config.companyIntegration, entityMap, fetchedExternalIDs, result, contextUser
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
        _abortSignal?: AbortSignal
    ): Promise<SyncResult> {
        const entityMapID = entityMap.ID;
        const fieldMaps = await this.LoadFieldMaps(entityMapID, contextUser);
        const pushWatermark = await this.watermarkService.Load(entityMapID, contextUser, 'Push');
        const lastPushAt = pushWatermark?.WatermarkValue ?? null;

        // Check connector write capability
        if (!config.connector.SupportsCreate && !config.connector.SupportsUpdate) {
            console.log(`[IntegrationEngine] Push skipped for ${entityMap.ExternalObjectName}: connector does not support writes`);
            return this.EmptyResult();
        }

        // Full push: load ALL records from the MJ entity. Incremental push: only changed records.
        const changedRecords = config.fullSync
            ? await this.LoadAllMJRecords(entityMap, config.companyIntegration, contextUser)
            : await this.LoadChangedMJRecords(entityMap, lastPushAt, contextUser);

        if (changedRecords.length === 0) {
            console.log(`[IntegrationEngine] Push: no changes for ${entityMap.ExternalObjectName} since ${lastPushAt ?? 'beginning'}`);
            await this.CreateRunDetail(run, entityMap, this.EmptyResult(), contextUser);
            return this.EmptyResult();
        }

        console.log(`[IntegrationEngine] Push: ${changedRecords.length} changed records for ${entityMap.ExternalObjectName}`);

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

        let latestChangeAt: string | null = null;

        for (const change of changedRecords) {
            result.RecordsProcessed++;
            try {
                await this.PushSingleRecord(change, config, entityMap, pushFieldMaps, result, contextUser);
                if (change.ChangedAt && (!latestChangeAt || change.ChangedAt > latestChangeAt)) {
                    latestChangeAt = change.ChangedAt;
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                result.RecordsErrored++;
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

        // Load all records from the MJ entity
        const allResult = await rv.RunView<Record<string, unknown>>({
            EntityName: entityMap.Entity,
            ResultType: 'simple',
        }, contextUser);

        if (!allResult.Success || allResult.Results.length === 0) return [];

        // Load existing record maps to know which records already exist externally
        const mapResult = await rv.RunView<{ EntityRecordID: string; ExternalSystemRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter: `CompanyIntegrationID='${companyIntegration.ID}' AND EntityID='${entityMap.EntityID}'`,
            Fields: ['EntityRecordID', 'ExternalSystemRecordID'],
            ResultType: 'simple',
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
        contextUser: UserInfo
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
            const delResult = await config.connector.DeleteRecord({ ...crudBase, ExternalID: externalID });
            if (!delResult.Success) {
                if (delResult.StatusCode === 403) {
                    console.warn(`[IntegrationEngine] Skipping delete — ${delResult.ErrorMessage}`);
                    result.RecordsSkipped++;
                    return;
                }
                throw new Error(delResult.ErrorMessage ?? 'Delete failed');
            }
            result.RecordsDeleted++;
        } else if (externalID) {
            // Update existing external record
            const updResult = await config.connector.UpdateRecord({
                ...crudBase, ExternalID: externalID, Attributes: externalAttributes,
            });
            if (!updResult.Success) {
                if (updResult.StatusCode === 403) {
                    console.warn(`[IntegrationEngine] Skipping update — ${updResult.ErrorMessage}`);
                    result.RecordsSkipped++;
                    return;
                }
                throw new Error(updResult.ErrorMessage ?? 'Update failed');
            }
            result.RecordsUpdated++;
        } else if (config.connector.SupportsCreate) {
            // Create new external record
            const createResult = await config.connector.CreateRecord({
                ...crudBase, Attributes: externalAttributes,
            });
            if (!createResult.Success) {
                if (createResult.StatusCode === 403) {
                    console.warn(`[IntegrationEngine] Skipping create — ${createResult.ErrorMessage}`);
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
            }
            result.RecordsCreated++;
        } else {
            result.RecordsSkipped++;
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
        contextUser: UserInfo
    ): Promise<void> {
        const rv = new RunView();
        const mapResult = await rv.RunView<{ EntityRecordID: string; ExternalSystemRecordID: string }>({
            EntityName: 'MJ: Company Integration Record Maps',
            ExtraFilter:
                `CompanyIntegrationID='${companyIntegration.ID}' ` +
                `AND EntityID='${entityMap.EntityID}'`,
            Fields: ['EntityRecordID', 'ExternalSystemRecordID'],
            ResultType: 'simple',
        }, contextUser);

        if (!mapResult.Success) return;

        const orphans = mapResult.Results.filter(m => !fetchedExternalIDs.has(m.ExternalSystemRecordID));
        if (orphans.length === 0) return;

        console.log(`[IntegrationEngine] Orphan detection for ${entityMap.ExternalObjectName}: ${orphans.length} records in MJ not found in external system`);

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
        }, contextUser);

        return result.Success ? result.Results : [];
    }

    /**
     * Applies resolved records to MJ, handling each individually for error isolation.
     */
    private async ApplyRecords(
        records: MappedRecord[],
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        result: SyncResult,
        contextUser: UserInfo
    ): Promise<void> {
        // Batched atomicity per plans/transaction-group-migration.md: each batch of up to
        // APPLY_BATCH_SIZE records commits or rolls back as a unit. This keeps transactions
        // small enough to avoid SQL Server lock escalation (~5000 rows) while still giving
        // per-batch all-or-nothing semantics. Batch failures report every record in the
        // batch as errored since the rollback undid any partial success within the batch.
        const APPLY_BATCH_SIZE = 500;
        const provider = this.ProviderToUse as DatabaseProviderBase;

        for (let i = 0; i < records.length; i += APPLY_BATCH_SIZE) {
            const batch = records.slice(i, i + APPLY_BATCH_SIZE);
            const batchStartProcessed = result.RecordsProcessed;
            const batchStartCreated = result.RecordsCreated;
            const batchStartUpdated = result.RecordsUpdated;
            const batchStartDeleted = result.RecordsDeleted;

            await provider.BeginTransaction();
            try {
                for (const record of batch) {
                    result.RecordsProcessed++;
                    await this.ApplySingleRecord(record, companyIntegration, entityMap, result, contextUser);
                }
                await provider.CommitTransaction();
            } catch (err) {
                await provider.RollbackTransaction();

                // Roll back the in-memory counters that ApplySingleRecord bumped inside the failed batch
                result.RecordsProcessed = batchStartProcessed;
                result.RecordsCreated = batchStartCreated;
                result.RecordsUpdated = batchStartUpdated;
                result.RecordsDeleted = batchStartDeleted;

                // SchemaNotGeneratedError is per-entity-deterministic — every record in
                // this object will fail the same way. Bubble it up so ProcessPullSync
                // can fail-stop the entityMap with one log line instead of producing
                // per-record duplicates. Rollback + counter restore above already ran.
                if (err instanceof SchemaNotGeneratedError) {
                    throw err;
                }

                const classified = ClassifyError(err);
                const msg = err instanceof Error ? err.message : String(err);
                for (const rec of batch) {
                    result.RecordsProcessed++;
                    result.RecordsErrored++;
                    result.Errors.push({
                        ExternalID: rec.ExternalRecord.ExternalID,
                        ChangeType: rec.ChangeType,
                        ErrorMessage: `Batch rolled back: ${msg}`,
                        ErrorCode: classified.Code,
                        Severity: classified.Severity,
                        ExternalRecord: rec.ExternalRecord,
                    });
                }
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
        contextUser: UserInfo
    ): Promise<void> {
        switch (record.ChangeType) {
            case 'Create':
                await this.CreateRecord(record, companyIntegration, entityMap, contextUser);
                result.RecordsCreated++;
                break;
            case 'Update':
                await this.UpdateRecord(record, companyIntegration, entityMap, result, contextUser);
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
    }

    /**
     * Creates a new MJ record with pre-write validation and saves a record map entry.
     */
    private async CreateRecord(
        record: MappedRecord,
        companyIntegration: MJCompanyIntegrationEntity,
        entityMap: ICompanyIntegrationEntityMap,
        contextUser: UserInfo
    ): Promise<void> {
        const md = this.ProviderToUse;
        const entity = await md.GetEntityObject(record.MJEntityName, contextUser);
        entity.NewRecord();
        this.SetEntityFields(entity, record.MappedFields);
        this.SetStandardIntegrationFields(entity, record);

        // A5: Pre-write validation
        this.validateEntity(entity, record.MJEntityName);

        const saved = await entity.Save();
        if (!saved) {
            const errMsg = entity.LatestResult?.CompleteMessage ?? 'unknown error';
            const schemaErr = detectSchemaNotGenerated(record.MJEntityName, errMsg);
            if (schemaErr) throw schemaErr;
            throw new Error(`Failed to create ${record.MJEntityName} record: ${errMsg}`);
        }

        // Use the entity's actual PK (e.g. the UUID assigned by the DB) as the
        // EntityRecordID in the record map, NOT the external ID. Storing the
        // external ID as EntityRecordID caused UpdateRecord to fail to load the
        // entity (UUID lookup with a HubSpot numeric ID) and fall back to
        // CreateRecord, producing duplicates on every incremental sync.
        const entityRecordID = entity.PrimaryKey.KeyValuePairs.map(kv => String(kv.Value)).join('|');
        await this.SaveRecordMap(
            companyIntegration.ID,
            record.ExternalRecord.ExternalID,
            entityMap.EntityID,
            entityRecordID,
            contextUser
        );
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
        contextUser: UserInfo
    ): Promise<void> {
        if (!record.MatchedMJRecordID) {
            // No matched ID — treat as a new record
            await this.CreateRecord(record, companyIntegration, entityMap, contextUser);
            result.RecordsCreated++;
            return;
        }

        const md = this.ProviderToUse;
        const entity = await md.GetEntityObject(record.MJEntityName, contextUser);
        const entityInfo = md.EntityByName(record.MJEntityName);
        const pkFields = entityInfo?.PrimaryKeys ?? (entityInfo?.FirstPrimaryKey ? [entityInfo.FirstPrimaryKey] : []);
        const loaded = await entity.InnerLoad(this.BuildEntityPrimaryKey(record.MatchedMJRecordID, pkFields));
        if (!loaded) {
            // Record doesn't exist in DB — fall back to INSERT (upsert)
            await this.CreateRecord(record, companyIntegration, entityMap, contextUser);
            result.RecordsCreated++;
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
        result.RecordsUpdated++;
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
            Fields?: Array<{ Name: string; EntityFieldInfo?: { Type?: string; AllowsNull?: boolean }; Type?: string }>;
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
        for (const f of entity.Fields ?? []) {
            const rawType = f.EntityFieldInfo?.Type ?? f.Type;
            if (rawType) typeLookup.set(f.Name.toLowerCase(), rawType.toLowerCase());
        }

        for (const [fieldName, value] of Object.entries(fields)) {
            entity.Set(fieldName, this.coerceIncomingValue(value, typeLookup.get(fieldName.toLowerCase())));
        }
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
        _record: MappedRecord
    ): void {
        const fieldNames = entity.Fields?.map(f => f.Name) ?? [];
        const hasField = (name: string) => fieldNames.includes(name);

        if (hasField('__mj_integration_LastSyncedAt')) {
            entity.Set('__mj_integration_LastSyncedAt', new Date().toISOString());
        }
        if (hasField('__mj_integration_SyncStatus')) {
            entity.Set('__mj_integration_SyncStatus', 'Active');
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
        recordMap.NewRecord();
        recordMap.CompanyIntegrationID = companyIntegrationID;
        recordMap.ExternalSystemRecordID = externalID;
        recordMap.EntityID = entityID;
        recordMap.EntityRecordID = entityRecordID;

        const saved = await recordMap.Save();
        if (!saved) {
            throw new Error(`Failed to save record map for external ID: ${externalID}`);
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
        detail.RecordID = `Processed:${result.RecordsProcessed}`;
        detail.Action = result.RecordsCreated > 0 ? 'INSERT' : 'UPDATE';
        detail.IsSuccess = result.RecordsErrored === 0;

        await detail.Save();
    }

    /**
     * Merges an entity-map-level result into the aggregate result.
     */
    private MergeResult(aggregate: SyncResult, mapResult: SyncResult): void {
        aggregate.RecordsProcessed += mapResult.RecordsProcessed;
        aggregate.RecordsCreated += mapResult.RecordsCreated;
        aggregate.RecordsUpdated += mapResult.RecordsUpdated;
        aggregate.RecordsDeleted += mapResult.RecordsDeleted;
        aggregate.RecordsErrored += mapResult.RecordsErrored;
        aggregate.RecordsSkipped += mapResult.RecordsSkipped;
        aggregate.Errors.push(...mapResult.Errors);

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
        _contextUser: UserInfo,
        onNotification?: OnNotificationCallback
    ): Promise<void> {
        run.EndedAt = new Date();
        run.TotalRecords = result.RecordsProcessed;
        run.Status = result.RecordsErrored > 0 ? 'Failed' : 'Success';
        if (result.Errors.length > 0) {
            run.ErrorLog = JSON.stringify(result.Errors.slice(0, 100));
        }
        await run.Save();

        if (onNotification) {
            const notification = this.buildCompletionNotification(run, result);
            this.safeNotify(onNotification, notification);
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
