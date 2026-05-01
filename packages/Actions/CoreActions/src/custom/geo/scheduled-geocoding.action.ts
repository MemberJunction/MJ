import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, MJGlobal, MJEventType } from '@memberjunction/global';
import {
    RunView, Metadata, LogStatus, LogError, UserInfo, EntityInfo,
    CompositeKey, BaseEntity, BaseEntityEvent, IMetadataProvider
} from '@memberjunction/core';
import { MJRecordGeoCodeEntity } from '@memberjunction/core-entities';
import { GeoCodeSyncService } from '@memberjunction/geo-core';

/**
 * Scheduled geocoding maintenance action that handles three tasks:
 *
 * 1. **Missing records** — Finds records in geo-enabled entities that have
 *    non-null geo fields but no RecordGeoCode row, and geocodes them.
 * 2. **Failed retries** — Retries RecordGeoCode rows with Status='failed'
 *    up to a configurable max retry count.
 * 3. **Orphan cleanup** — Removes RecordGeoCode rows whose source entity
 *    record no longer exists.
 *
 * ## Parameters
 * - **BatchSize** (default 10) — Number of records to geocode **concurrently**
 *   in each parallel batch. Controls API rate pressure. Google Geocoding API
 *   allows 50 QPS, so 10 is conservative and leaves headroom.
 * - **MaxTotalRecords** (default unlimited) — Optional hard cap on the total
 *   number of records processed in a single run. When null/0, processes all
 *   pending records until exhausted.
 * - **MaxRetries** (default 5) — Maximum retry count for failed geocoding
 *   attempts before a record is considered permanently failed.
 *
 * ## Cache Invalidation
 * After geocoding each record, the action loads the parent entity record
 * and fires a synthetic BaseEntity 'save' event so that any cached RunView
 * results containing stale lat/lng (from the RecordGeoCode JOIN) are
 * invalidated. This ensures the server cache stays consistent.
 *
 * Designed to run on a schedule (every few hours) as a safety net for records
 * that bypass BaseEntity.Save() (bulk SQL imports, direct DB operations).
 */
@RegisterClass(BaseAction, 'Scheduled Geocoding')
export class ScheduledGeocodingAction extends BaseAction {
    private static readonly DEFAULT_MAX_RETRIES = 5;
    private static readonly DEFAULT_BATCH_SIZE = 10;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser) {
            return { Success: false, ResultCode: 'MISSING_USER', Message: 'ScheduledGeocodingAction requires a context user' };
        }

        const maxRetries = this.getNumericParam(params, 'MaxRetries', ScheduledGeocodingAction.DEFAULT_MAX_RETRIES);
        const batchSize = this.getNumericParam(params, 'BatchSize', ScheduledGeocodingAction.DEFAULT_BATCH_SIZE);
        const maxTotal = this.getNullableNumericParam(params, 'MaxTotalRecords');

        LogStatus(`ScheduledGeocodingAction: Starting maintenance run (BatchSize=${batchSize}, MaxTotal=${maxTotal ?? 'unlimited'})`);

        const stats = { MissingProcessed: 0, MissingSuccess: 0, RetriesProcessed: 0, RetriesSuccess: 0, OrphansRemoved: 0 };

        // Step 1: Find and geocode missing records
        const missingStats = await this.processMissingRecords(contextUser, batchSize, maxTotal, params.Provider);
        stats.MissingProcessed = missingStats.Processed;
        stats.MissingSuccess = missingStats.Success;

        // Step 2: Retry failed geocoding attempts
        const retryMaxTotal = maxTotal != null ? Math.max(0, maxTotal - stats.MissingProcessed) : null;
        const retryStats = await this.processFailedRetries(contextUser, maxRetries, batchSize, retryMaxTotal, params.Provider);
        stats.RetriesProcessed = retryStats.Processed;
        stats.RetriesSuccess = retryStats.Success;

        // Step 3: Clean up orphaned RecordGeoCode rows
        stats.OrphansRemoved = await this.cleanupOrphanedRecords(contextUser, batchSize, params.Provider);

        LogStatus(`ScheduledGeocodingAction: Complete — Missing: ${stats.MissingProcessed} processed (${stats.MissingSuccess} success), Retries: ${stats.RetriesProcessed} (${stats.RetriesSuccess} success), Orphans: ${stats.OrphansRemoved} removed`);

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: JSON.stringify(stats)
        };
    }

    // ================================================================
    // Step 1: Process missing RecordGeoCode rows
    // ================================================================

    /**
     * Find records in geo-enabled entities that have no RecordGeoCode row
     * and geocode them. Processes ALL missing records (or up to maxTotal),
     * geocoding in parallel batches of batchSize.
     */
    private async processMissingRecords(
        contextUser: UserInfo,
        batchSize: number,
        maxTotal: number | null,
        provider?: IMetadataProvider
    ): Promise<{ Processed: number; Success: number }> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const geoEntities = md.Entities.filter(e => e.SupportsGeoCoding);
        let totalProcessed = 0;
        let totalSuccess = 0;

        for (const entityInfo of geoEntities) {
            if (maxTotal != null && totalProcessed >= maxTotal) break;

            const remaining = maxTotal != null ? maxTotal - totalProcessed : null;
            const entityStats = await this.processMissingForEntity(entityInfo, contextUser, batchSize, remaining);
            totalProcessed += entityStats.Processed;
            totalSuccess += entityStats.Success;
        }

        if (totalProcessed > 0) {
            LogStatus(`ScheduledGeocodingAction: Processed ${totalProcessed} missing records (${totalSuccess} geocoded successfully)`);
        }

        return { Processed: totalProcessed, Success: totalSuccess };
    }

    /**
     * Process all missing RecordGeoCode rows for a single entity.
     * Loads all entity records with non-null geo fields, filters out those
     * that already have a RecordGeoCode row, then geocodes the rest in
     * parallel batches.
     *
     * @param entityInfo - The entity to process
     * @param contextUser - User context for data operations
     * @param batchSize - Number of concurrent geocoding operations per batch
     * @param maxRows - Maximum records to process (0 = unlimited)
     */
    private async processMissingForEntity(
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        batchSize: number,
        maxRows: number | null
    ): Promise<{ Processed: number; Success: number }> {
        const rv = new RunView();
        const pkField = entityInfo.FirstPrimaryKey;
        if (!pkField) return { Processed: 0, Success: 0 };

        const geoFields = this.getGeoAddressFields(entityInfo);
        if (geoFields.length === 0) return { Processed: 0, Success: 0 };

        try {
            // Get all record IDs that already have a RecordGeoCode row
            const existingRecordIds = await this.getExistingGeoCodeRecordIds(entityInfo.ID, contextUser);

            // Load entity records with non-null geo fields
            const nonNullConditions = geoFields.map(f => `${f.Name} IS NOT NULL`).join(' OR ');
            const result = await rv.RunView({
                EntityName: entityInfo.Name,
                ExtraFilter: `(${nonNullConditions})`,
                IgnoreMaxRows: true,
                BypassCache: true,
                ResultType: 'entity_object'
            }, contextUser);

            if (!result.Success || result.Results.length === 0) {
                return { Processed: 0, Success: 0 };
            }

            // Filter to records missing geocodes
            let missingRecords = (result.Results as unknown as BaseEntity[])
                .filter(entity => {
                    const recordId = this.buildRecordId(entity);
                    return !existingRecordIds.has(recordId);
                });

            if (maxRows != null) {
                missingRecords = missingRecords.slice(0, maxRows);
            }

            if (missingRecords.length === 0) return { Processed: 0, Success: 0 };

            // Geocode in parallel batches
            return await this.geocodeBatch(missingRecords, entityInfo, contextUser, batchSize);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`ScheduledGeocodingAction: Error querying missing records for ${entityInfo.Name}: ${msg}`);
            return { Processed: 0, Success: 0 };
        }
    }

    // ================================================================
    // Step 2: Retry failed geocoding attempts
    // ================================================================

    /**
     * Retry failed geocoding attempts. Loads the source entity record
     * and re-runs GeoCodeSyncService. Processes all eligible failures
     * (or up to maxTotal) in parallel batches.
     */
    private async processFailedRetries(
        contextUser: UserInfo,
        maxRetries: number,
        batchSize: number,
        maxTotal: number | null,
        provider?: IMetadataProvider
    ): Promise<{ Processed: number; Success: number }> {
        const rv = new RunView();

        const failedResult = await rv.RunView<MJRecordGeoCodeEntity>({
            EntityName: 'MJ: Record Geo Codes',
            ExtraFilter: `Status='failed' AND RetryCount < ${maxRetries}`,
            IgnoreMaxRows: true,
            OrderBy: 'RetryCount ASC, GeocodedAt ASC',
            ResultType: 'entity_object'
        }, contextUser);

        if (!failedResult.Success || failedResult.Results.length === 0) {
            return { Processed: 0, Success: 0 };
        }

        let records = failedResult.Results;
        if (maxTotal != null) {
            records = records.slice(0, maxTotal);
        }

        LogStatus(`ScheduledGeocodingAction: ${records.length} failed records eligible for retry`);

        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        let totalProcessed = 0;
        let totalSuccess = 0;

        // Group by entity for efficient processing
        const byEntity = new Map<string, MJRecordGeoCodeEntity[]>();
        for (const geoRecord of records) {
            const key = geoRecord.EntityID;
            let arr = byEntity.get(key);
            if (!arr) {
                arr = [];
                byEntity.set(key, arr);
            }
            arr.push(geoRecord);
        }

        for (const [entityId, geoRecords] of byEntity) {
            const entityInfo = md.EntityByID(entityId);
            if (!entityInfo) continue;

            // Load source entity records and geocode them in parallel batches
            const entities = await this.loadSourceEntities(geoRecords, entityInfo, contextUser, provider);
            if (entities.length === 0) continue;

            const stats = await this.geocodeBatch(entities, entityInfo, contextUser, batchSize);
            totalProcessed += stats.Processed;
            totalSuccess += stats.Success;
        }

        return { Processed: totalProcessed, Success: totalSuccess };
    }

    /**
     * Load source entity records for a set of RecordGeoCode rows.
     * Skips records whose source entity no longer exists.
     */
    private async loadSourceEntities(
        geoRecords: MJRecordGeoCodeEntity[],
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<BaseEntity[]> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const entities: BaseEntity[] = [];

        for (const geoRecord of geoRecords) {
            try {
                const entity = await md.GetEntityObject(entityInfo.Name, contextUser);
                const pk = new CompositeKey([{ FieldName: 'ID', Value: geoRecord.RecordID }]);
                const loaded = await entity.InnerLoad(pk);
                if (loaded) {
                    entities.push(entity);
                }
            } catch {
                // Source record doesn't exist or can't be loaded — skip
            }
        }

        return entities;
    }

    // ================================================================
    // Step 3: Orphan cleanup
    // ================================================================

    /**
     * Remove RecordGeoCode rows whose source entity record no longer exists.
     * Processes one entity at a time to keep queries efficient.
     */
    private async cleanupOrphanedRecords(
        contextUser: UserInfo,
        batchSize: number,
        provider?: IMetadataProvider
    ): Promise<number> {
        const rv = new RunView();
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        let totalRemoved = 0;

        // Get distinct EntityIDs from RecordGeoCode
        const entityResult = await rv.RunView<{ EntityID: string }>({
            EntityName: 'MJ: Record Geo Codes',
            Fields: ['EntityID'],
            ResultType: 'simple',
            IgnoreMaxRows: true
        }, contextUser);

        if (!entityResult.Success) return 0;

        const entityIds = [...new Set(entityResult.Results.map(r => r.EntityID))];

        for (const entityId of entityIds) {
            try {
                const entityInfo = md.EntityByID(entityId);
                if (!entityInfo) continue;

                const pkField = entityInfo.FirstPrimaryKey;
                if (!pkField) continue;

                const orphanResult = await rv.RunView<MJRecordGeoCodeEntity>({
                    EntityName: 'MJ: Record Geo Codes',
                    ExtraFilter: `EntityID = '${entityId}' AND NOT EXISTS (SELECT 1 FROM ${entityInfo.SchemaName}.${entityInfo.BaseTable} src WHERE CAST(src.${pkField.Name} AS NVARCHAR(450)) = RecordID)`,
                    IgnoreMaxRows: true,
                    ResultType: 'entity_object'
                }, contextUser);

                if (orphanResult.Success && orphanResult.Results.length > 0) {
                    // Delete orphans in parallel batches
                    const orphans = orphanResult.Results;
                    for (let i = 0; i < orphans.length; i += batchSize) {
                        const batch = orphans.slice(i, i + batchSize);
                        const results = await Promise.allSettled(batch.map(o => o.Delete()));
                        totalRemoved += results.filter(r => r.status === 'fulfilled' && r.value).length;
                    }
                    LogStatus(`ScheduledGeocodingAction: Removed ${orphanResult.Results.length} orphaned geo records for ${entityInfo.Name}`);
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`ScheduledGeocodingAction: Orphan cleanup error for entity ${entityId}: ${msg}`);
            }
        }

        return totalRemoved;
    }

    // ================================================================
    // Core: parallel batch geocoding with cache invalidation
    // ================================================================

    /**
     * Geocode a list of entity records in parallel batches, then fire cache
     * invalidation events for each successfully geocoded record.
     *
     * For each record in the batch:
     * 1. Run GeoCodeSyncService.SyncIfChanged to geocode and update RecordGeoCode
     * 2. Fire a synthetic BaseEntity 'save' event with the loaded entity so that
     *    LocalCacheManager invalidates any cached RunView results containing stale
     *    lat/lng from the RecordGeoCode JOIN
     *
     * @param entities - Pre-loaded BaseEntity instances to geocode
     * @param entityInfo - Entity metadata
     * @param contextUser - User context
     * @param batchSize - Number of concurrent geocoding operations per batch
     */
    private async geocodeBatch(
        entities: BaseEntity[],
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        batchSize: number
    ): Promise<{ Processed: number; Success: number }> {
        let totalSuccess = 0;

        for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);

            const results = await Promise.allSettled(
                batch.map(entity => this.geocodeAndInvalidate(entity, contextUser))
            );

            const batchSuccess = results.filter(r => r.status === 'fulfilled' && r.value).length;
            totalSuccess += batchSuccess;

            if (entities.length > batchSize) {
                LogStatus(`ScheduledGeocodingAction: ${entityInfo.Name} batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entities.length / batchSize)} — ${batchSuccess}/${batch.length} success`);
            }
        }

        return { Processed: entities.length, Success: totalSuccess };
    }

    /**
     * Geocode a single entity record and fire a cache invalidation event.
     *
     * After geocoding updates the RecordGeoCode row, we need to tell the
     * cache system that this entity record's view data has changed (because
     * the view JOINs to RecordGeoCode for __mj_Latitude/__mj_Longitude).
     * We do this by firing a synthetic BaseEntity 'save' event with the
     * entity instance — the same event that BaseEntity.Save() fires.
     *
     * @returns true if geocoding succeeded, false otherwise
     */
    private async geocodeAndInvalidate(entity: BaseEntity, contextUser: UserInfo): Promise<boolean> {
        try {
            const result = await GeoCodeSyncService.Instance.SyncIfChanged(entity, contextUser);

            if (result) {
                // Geocoding produced new coordinates — fire cache invalidation.
                // Reload the entity to pick up fresh data from the view (including
                // the updated __mj_Latitude/__mj_Longitude from RecordGeoCode JOIN),
                // then raise a save event so LocalCacheManager updates its caches.
                await entity.InnerLoad(entity.PrimaryKey);
                this.fireSyntheticSaveEvent(entity);
            }

            return true;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`ScheduledGeocodingAction: Failed to geocode ${entity.EntityInfo.Name} record: ${msg}`);
            return false;
        }
    }

    /**
     * Fire a synthetic BaseEntity 'save' event via MJGlobal so that
     * LocalCacheManager and BaseEngine listeners pick up the change.
     *
     * This is the same event that BaseEntity.RaiseEvent() fires after
     * a successful Save(), but triggered externally because the record's
     * view data changed due to a RecordGeoCode update (not a direct save).
     *
     * The entity instance is passed as both `component` and `event.baseEntity`
     * so cache handlers can read EntityInfo, PrimaryKeys, and GetAll() —
     * exactly the same contract as a real save event.
     */
    private fireSyntheticSaveEvent(entity: BaseEntity): void {
        const event = new BaseEntityEvent();
        event.type = 'save';
        event.saveSubType = 'update';
        event.baseEntity = entity;
        // Match BaseEntity.RaiseEvent() contract: include the entity's bound provider so
        // multi-provider listeners (LocalCacheManager, BaseEngine, …) scope correctly.
        event.provider = entity.ProviderToUse as unknown as IMetadataProvider | undefined;
        event.payload = null;

        MJGlobal.Instance.RaiseEvent({
            component: entity,
            event: MJEventType.ComponentEvent,
            eventCode: BaseEntity.BaseEventCode,
            args: event
        });
    }

    // ================================================================
    // Helpers
    // ================================================================

    /**
     * Get the geo address fields (non-lat/lng) for an entity.
     * These are the fields that, when non-null, indicate a record
     * should have a geocode.
     */
    private getGeoAddressFields(entityInfo: EntityInfo): EntityInfo['Fields'] {
        return entityInfo.Fields.filter(f =>
            f.ExtendedType != null && f.ExtendedType.startsWith('Geo') &&
            f.ExtendedType !== 'GeoLatitude' && f.ExtendedType !== 'GeoLongitude'
        );
    }

    /**
     * Get the set of RecordIDs that already have a RecordGeoCode row for an entity.
     */
    private async getExistingGeoCodeRecordIds(entityId: string, contextUser: UserInfo): Promise<Set<string>> {
        const rv = new RunView();
        const existingResult = await rv.RunView<{ RecordID: string }>({
            EntityName: 'MJ: Record Geo Codes',
            ExtraFilter: `EntityID = '${entityId}'`,
            Fields: ['RecordID'],
            ResultType: 'simple',
            IgnoreMaxRows: true
        }, contextUser);

        return new Set<string>(
            existingResult.Success ? existingResult.Results.map(r => r.RecordID) : []
        );
    }

    /**
     * Build a RecordID string from an entity's primary key, matching the
     * format used in the view's LEFT JOIN to RecordGeoCode.
     */
    private buildRecordId(entity: BaseEntity): string {
        const pkPairs = entity.PrimaryKey.KeyValuePairs;
        return pkPairs.length === 1
            ? String(pkPairs[0].Value)
            : pkPairs.map(pk => String(pk.Value)).join('||');
    }

    /**
     * Extract a numeric parameter with a default value.
     */
    private getNumericParam(params: RunActionParams, name: string, defaultValue: number): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) return defaultValue;
        const parsed = Number(param.Value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Extract an optional numeric parameter. Returns null if not provided.
     */
    private getNullableNumericParam(params: RunActionParams, name: string): number | null {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === name.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) return null;
        const parsed = Number(param.Value);
        return isNaN(parsed) ? null : parsed;
    }
}
