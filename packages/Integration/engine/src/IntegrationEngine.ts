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
} from './types.js';
import { ClassifyError } from './types.js';
import { ConnectorFactory } from './ConnectorFactory.js';
import { FieldMappingEngine } from './FieldMappingEngine.js';
import { MatchEngine } from './MatchEngine.js';
import { WatermarkService } from './WatermarkService.js';
import { SyncLogger } from './SyncLogger.js';
import { CONTENT_HASH_COLUMN, computeContentHash } from './ContentHash.js';
import { IntegrationProgressEmitter } from '@memberjunction/integration-progress-artifacts';
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
            await this.FinalizeRun(run, result, contextUser, onNotification);
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
            await this.finalizeSyncProgress(progress, true, result.ErrorMessage);
            console.log(`[IntegrationEngine] Sync complete:\n${summary}`);
            return result;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            logger.emit('sync.run.fail', { error: errMsg, durationMs: Date.now() - startTime });
            await this.finalizeSyncProgress(progress, false, errMsg);
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
        success: boolean,
        message?: string
    ): Promise<void> {
        if (!progress) return;
        try {
            if (success) {
                await progress.complete(message ?? 'Sync run complete');
            } else {
                await progress.fail(message ?? 'Sync run failed');
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
        const processOne = async (entityMap: ICompanyIntegrationEntityMap): Promise<void> => {
            if (abortSignal?.aborted) return;
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
            }
        };

        // Group maps into dependency layers (parents before children) via the IntegrationObject FK
        // graph, then process layers in order. Layers run sequentially — a child never syncs before
        // its parent. Within a layer the maps are mutually independent and run up to `concurrency`
        // at a time. Default concurrency is 1 (sequential — unchanged behavior); opt in to
        // parallelism via CompanyIntegration.Configuration {"syncConcurrency": N}.
        const layers = this.buildEntityMapDependencyLayers(config);
        const concurrency = this.getSyncConcurrency(config);
        for (const layer of layers) {
            if (abortSignal?.aborted) {
                console.log(`[IntegrationEngine] Sync cancelled (${globalIndex}/${totalMaps} maps processed)`);
                aggregate.Success = false;
                aggregate.ErrorMessage = 'Sync cancelled by user';
                break;
            }
            await this.runBounded(layer, concurrency, processOne);
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
    private buildEntityMapDependencyLayers(config: RunConfiguration): ICompanyIntegrationEntityMap[][] {
        const maps = config.entityMaps;
        if (maps.length <= 1) return [maps];
        try {
            const ios = this.GetIntegrationObjectsByIntegrationID(config.companyIntegration.IntegrationID);
            if (!ios || ios.length === 0) return [maps];

            const ioByName = new Map<string, string>();   // lower(IO.Name) → IO.ID (upper)
            for (const io of ios) ioByName.set(io.Name.toLowerCase(), io.ID.toUpperCase());

            const mapToIoId = new Map<string, string>();   // entityMap.ID → IO.ID
            const selectedIoIds = new Set<string>();
            for (const m of maps) {
                const ioId = m.ExternalObjectName ? ioByName.get(m.ExternalObjectName.toLowerCase()) : undefined;
                if (ioId) { mapToIoId.set(m.ID, ioId); selectedIoIds.add(ioId); }
            }
            if (selectedIoIds.size === 0) return [maps];

            // deps: IO.ID → set of selected parent IO.IDs
            const deps = new Map<string, Set<string>>();
            for (const ioId of selectedIoIds) {
                const set = new Set<string>();
                for (const f of this.GetIntegrationObjectFields(ioId)) {
                    const parent = f.RelatedIntegrationObjectID?.toUpperCase();
                    if (parent && parent !== ioId && selectedIoIds.has(parent)) set.add(parent);
                }
                deps.set(ioId, set);
            }

            // Kahn layering: an IO is ready when all its (selected) parents are already placed.
            const ioLayer = new Map<string, number>();
            const remaining = new Set(selectedIoIds);
            let layerNum = 0;
            while (remaining.size > 0) {
                const ready = [...remaining].filter(id => [...deps.get(id)!].every(p => !remaining.has(p)));
                if (ready.length === 0) {
                    // cycle (or unresolved) — place the rest in the current layer so they still run
                    for (const id of remaining) ioLayer.set(id, layerNum);
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
        } catch {
            return [maps];   // any failure → single layer, original order
        }
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
    private readonly _requestChains = new Map<string, Promise<number>>();

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
        const minMs = this.getRequestSpacingMs(config);
        if (minMs <= 0) return;
        const key = config.companyIntegration.IntegrationID;
        const prev = this._requestChains.get(key) ?? Promise.resolve(0);
        const nextP = prev.then(async (lastAt) => {
            const now = Date.now();
            const scheduled = Math.max(now, lastAt + minMs);
            const wait = scheduled - now;
            if (wait > 0) await new Promise<void>(r => setTimeout(r, wait));
            return scheduled;
        });
        // Keep the chain alive even if a turn rejects (it won't here, but be defensive).
        this._requestChains.set(key, nextP.catch(() => Date.now()));
        await nextP;
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
        const watermark = await this.watermarkService.Load(entityMapID, contextUser, 'Pull');
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
                batch = await config.connector.FetchChanges(ctx);
            } catch (fetchErr) {
                const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
                console.error(`[IntegrationEngine] FetchChanges error for ${entityMap.ExternalObjectName}: ${errMsg}`);
                logger?.emit('sync.record.error', {
                    phase: 'fetch',
                    externalObjectName: entityMap.ExternalObjectName,
                    batchIndex: batchCount,
                    error: errMsg,
                });
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
                await this.ApplyRecords(resolved, config.companyIntegration, entityMap, result, contextUser, logger);
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

        let latestChangeAt: string | null = null;

        for (const change of changedRecords) {
            result.RecordsProcessed++;
            try {
                await this.PushSingleRecord(change, config, entityMap, pushFieldMaps, result, contextUser, logger);
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
            await this.rateLimit(config);
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
                if (policy === 'DestWins' || policy === 'MostRecent') {
                    // MJ wins. (Full timestamp-compare for MostRecent is the deferred enhancement.)
                    toPush[fm.SourceFieldName] = mjVal;
                } else if (policy === 'Manual') {
                    manualConflict = true;                               // quarantine for a human
                }
                // SourceWins → leave external as-is (don't push this field)
            }
            // !mjChanged → nothing to push; both-changed-same → converged.
        }

        if (conflictFields.length > 0) {
            logger?.emit('sync.record.conflict', {
                entity: entityMap.Entity,
                externalId: externalID,
                mjRecordId: change.RecordID,
                conflictFields,
                policy,
                resolution: policy === 'Manual' ? 'quarantined' : (policy === 'SourceWins' ? 'external-wins' : 'mj-wins'),
            });
            if (manualConflict) {
                await this.markConflictOnMJRecord(change.RecordID, entityMap, conflictFields, contextUser);
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

    /** Marks an MJ mirror record in-conflict (Manual resolution) via its standard sync columns. Best-effort. */
    private async markConflictOnMJRecord(
        mjRecordID: string,
        entityMap: ICompanyIntegrationEntityMap,
        conflictFields: string[],
        contextUser: UserInfo
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
            await entity.Save();
        } catch {
            // best-effort
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
        contextUser: UserInfo,
        logger?: SyncLogger
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

            // One cheap read per batch fetches the stored content hashes for the rows we'd
            // otherwise load one-by-one. For a watermark-less re-sync where nothing changed,
            // this lets UpdateRecord skip every per-record load. Best-effort: undefined → the
            // existing dirty-flag path runs unchanged.
            const precheckHashes = await this.PrefetchContentHashes(batch, contextUser);

            await provider.BeginTransaction();
            try {
                for (const record of batch) {
                    result.RecordsProcessed++;
                    await this.ApplySingleRecord(record, companyIntegration, entityMap, result, contextUser, logger, precheckHashes);
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
        contextUser: UserInfo,
        logger?: SyncLogger,
        precheckHashes?: Map<string, string>
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

        switch (record.ChangeType) {
            case 'Create':
                await this.CreateRecord(record, companyIntegration, entityMap, contextUser);
                result.RecordsCreated++;
                break;
            case 'Update':
                await this.UpdateRecord(record, companyIntegration, entityMap, result, contextUser, precheckHashes);
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
        contextUser: UserInfo,
        precheckHashes?: Map<string, string>
    ): Promise<void> {
        if (!record.MatchedMJRecordID) {
            // No matched ID — treat as a new record
            await this.CreateRecord(record, companyIntegration, entityMap, contextUser);
            result.RecordsCreated++;
            return;
        }

        // Content-hash fast path (watermark-less change detection): if the batch
        // prefetch produced a stored hash for this record and it equals the freshly
        // computed hash of the incoming mapped fields, the record is provably
        // unchanged — skip the per-record DB load AND the write. The dirty-flag check
        // below is the fallback for entities without the hash column.
        if (precheckHashes) {
            const stored = precheckHashes.get(record.MatchedMJRecordID);
            if (stored && stored === computeContentHash(record.MappedFields ?? {})) {
                result.RecordsSkipped++;
                return;
            }
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
        if (pkFields.length !== 1) return undefined; // single-PK fast path only
        const pk = pkFields[0].Name;

        try {
            const escaped = ids.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
            const rv = new RunView();
            const res = await rv.RunView<Record<string, string>>({
                EntityName: entityName,
                Fields: [pk, CONTENT_HASH_COLUMN],
                ExtraFilter: `${pk} IN (${escaped})`,
                ResultType: 'simple',
            }, contextUser);
            if (!res.Success) return undefined;
            const map = new Map<string, string>();
            for (const row of res.Results) {
                const id = row[pk];
                const hash = row[CONTENT_HASH_COLUMN];
                if (id != null && typeof hash === 'string' && hash.length > 0) {
                    map.set(String(id), hash);
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
            entity.Set(CONTENT_HASH_COLUMN, computeContentHash(record.MappedFields ?? {}));
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
