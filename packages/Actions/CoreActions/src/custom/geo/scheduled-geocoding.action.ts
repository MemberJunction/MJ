import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, MJGlobal, MJEventType } from '@memberjunction/global';
import {
    RunView, Metadata, LogStatus, LogError, UserInfo, EntityInfo,
    CompositeKey, BaseEntity, BaseEntityEvent, IMetadataProvider, DatabaseProviderBase
} from '@memberjunction/core';
import { MJRecordGeoCodeEntity } from '@memberjunction/core-entities';
import { GeoCodeSyncService, ExistingGeoCodeInfo } from '@memberjunction/geo-core';
import { GetDialect, SQLDialect } from '@memberjunction/sql-dialect';

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
 * - **MaxTotalRecords** (default 50,000) — Safety cap on the total number of
 *   records processed in a single run. Prevents unbounded memory growth in
 *   extreme cases. Override via scheduled job parameters. Logs a warning when
 *   the limit is reached so operators know remaining records exist for the
 *   next run.
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
    /** Safety default: cap total records per run to prevent unbounded memory growth in extreme cases. */
    private static readonly DEFAULT_MAX_TOTAL = 50_000;
    /** Page size for RunView pagination — controls how many BaseEntity objects exist simultaneously. */
    private static readonly PAGE_SIZE = 500;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser) {
            return { Success: false, ResultCode: 'MISSING_USER', Message: 'ScheduledGeocodingAction requires a context user' };
        }

        const maxRetries = this.getNumericParam(params, 'MaxRetries', ScheduledGeocodingAction.DEFAULT_MAX_RETRIES);
        const batchSize = this.getNumericParam(params, 'BatchSize', ScheduledGeocodingAction.DEFAULT_BATCH_SIZE);
        const maxTotal = this.getNumericParam(params, 'MaxTotalRecords', ScheduledGeocodingAction.DEFAULT_MAX_TOTAL);

        LogStatus(`ScheduledGeocodingAction: Starting maintenance run (BatchSize=${batchSize}, MaxTotal=${maxTotal})`);

        const stats = { MissingProcessed: 0, MissingSuccess: 0, RetriesProcessed: 0, RetriesSuccess: 0, OrphansRemoved: 0 };

        // Step 1: Find and geocode missing records
        const missingStats = await this.processMissingRecords(contextUser, batchSize, maxTotal, params.Provider);
        stats.MissingProcessed = missingStats.Processed;
        stats.MissingSuccess = missingStats.Success;

        // Step 2: Retry failed geocoding attempts
        const retryMaxTotal = Math.max(0, maxTotal - stats.MissingProcessed);
        const retryStats = await this.processFailedRetries(contextUser, maxRetries, batchSize, retryMaxTotal, params.Provider);
        stats.RetriesProcessed = retryStats.Processed;
        stats.RetriesSuccess = retryStats.Success;

        // Step 3: Clean up orphaned RecordGeoCode rows
        stats.OrphansRemoved = await this.cleanupOrphanedRecords(contextUser, batchSize, params.Provider);

        const totalRecordsProcessed = stats.MissingProcessed + stats.RetriesProcessed;
        if (totalRecordsProcessed >= maxTotal) {
            LogStatus(`ScheduledGeocodingAction: WARNING — MaxTotal limit (${maxTotal}) reached. There may be remaining records for the next run.`);
        }

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
        maxTotal: number,
        provider?: IMetadataProvider
    ): Promise<{ Processed: number; Success: number }> {
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const geoEntities = md.Entities.filter(e => e.SupportsGeoCoding);
        let totalProcessed = 0;
        let totalSuccess = 0;

        for (const entityInfo of geoEntities) {
            if (totalProcessed >= maxTotal) break;

            const remaining = maxTotal - totalProcessed;
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
     * Process all missing RecordGeoCode rows for a single entity using pagination.
     *
     * Instead of loading ALL entity records into memory at once (which causes OOM
     * with 50k+ records), this fetches pages of PAGE_SIZE records, processes each
     * page, then releases references so previous pages can be GC'd.
     *
     * Also loads all existing RecordGeoCode rows for this entity into a lightweight
     * Map upfront (ExistingGeoCodeInfo — ~5 small fields per row, ~15MB for 50k rows)
     * to eliminate the N+1 per-record FindExistingGeoCode SQL query.
     */
    private async processMissingForEntity(
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        batchSize: number,
        maxRows: number
    ): Promise<{ Processed: number; Success: number }> {
        const pkField = entityInfo.FirstPrimaryKey;
        if (!pkField) return { Processed: 0, Success: 0 };

        const geoFields = this.getGeoAddressFields(entityInfo);
        if (geoFields.length === 0) return { Processed: 0, Success: 0 };

        try {
            // Bulk load: lightweight map of all existing RecordGeoCode rows for this entity.
            // Used both for filtering (which records are missing) and passed through to
            // GeoCodeSyncService to eliminate per-record SQL queries.
            const existingMap = await this.loadExistingGeoCodesMap(entityInfo.ID, contextUser);

            const nonNullConditions = geoFields.map(f => `${f.Name} IS NOT NULL`).join(' OR ');
            let totalProcessed = 0;
            let totalSuccess = 0;
            let pageOffset = 0;

            // Paginate through entity records to avoid loading all into memory at once
            while (totalProcessed < maxRows) {
                const pageResult = await this.loadEntityPage(
                    entityInfo.Name, nonNullConditions, pageOffset, contextUser
                );

                if (!pageResult.Success || pageResult.Results.length === 0) break;

                const pageEntities = pageResult.Results as unknown as BaseEntity[];

                // Filter to records missing geocodes (not in existingMap for any LocationType)
                const missingRecords = pageEntities.filter(entity => {
                    const recordId = this.buildRecordId(entity);
                    // A record is "missing" if it has no existing geocode row at all.
                    // Check for 'Primary' since that's the only LocationType currently generated.
                    const key = GeoCodeSyncService.BuildGeoCodeMapKey(recordId, 'Primary');
                    return !existingMap.has(key);
                });

                if (missingRecords.length > 0) {
                    const budget = maxRows - totalProcessed;
                    const toProcess = missingRecords.slice(0, budget);
                    const stats = await this.geocodeBatch(toProcess, entityInfo, contextUser, batchSize, existingMap);
                    totalProcessed += stats.Processed;
                    totalSuccess += stats.Success;
                }

                // If this page was smaller than PAGE_SIZE, we've exhausted the entity
                if (pageEntities.length < ScheduledGeocodingAction.PAGE_SIZE) break;
                pageOffset += ScheduledGeocodingAction.PAGE_SIZE;
            }

            return { Processed: totalProcessed, Success: totalSuccess };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`ScheduledGeocodingAction: Error querying missing records for ${entityInfo.Name}: ${msg}`);
            return { Processed: 0, Success: 0 };
        }
    }

    /**
     * Load a single page of entity records with non-null geo fields.
     * Uses OrderBy on PK + MaxRows + offset simulation via GreaterThan filter
     * to paginate without loading the full result set.
     */
    private async loadEntityPage(
        entityName: string,
        nonNullFilter: string,
        offset: number,
        contextUser: UserInfo
    ): Promise<{ Success: boolean; Results: BaseEntity[] }> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: entityName,
            ExtraFilter: `(${nonNullFilter})`,
            OrderBy: 'ID',
            MaxRows: ScheduledGeocodingAction.PAGE_SIZE,
            StartRow: offset + 1,  // RunView StartRow is 1-based
            BypassCache: true,
            ResultType: 'entity_object'
        }, contextUser);

        return {
            Success: result.Success,
            Results: result.Success ? (result.Results as unknown as BaseEntity[]) : []
        };
    }

    // ================================================================
    // Step 2: Retry failed geocoding attempts
    // ================================================================

    /**
     * Retry failed geocoding attempts using pagination.
     * Loads pages of failed RecordGeoCode rows, then loads source entity records
     * and re-runs GeoCodeSyncService. Processes up to maxTotal records.
     */
    private async processFailedRetries(
        contextUser: UserInfo,
        maxRetries: number,
        batchSize: number,
        maxTotal: number,
        provider?: IMetadataProvider
    ): Promise<{ Processed: number; Success: number }> {
        if (maxTotal <= 0) return { Processed: 0, Success: 0 };

        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        const rv = new RunView();
        let totalProcessed = 0;
        let totalSuccess = 0;
        let pageOffset = 0;

        while (totalProcessed < maxTotal) {
            const pageResult = await rv.RunView<MJRecordGeoCodeEntity>({
                EntityName: 'MJ: Record Geo Codes',
                ExtraFilter: `Status='failed' AND RetryCount < ${maxRetries}`,
                OrderBy: 'RetryCount ASC, GeocodedAt ASC',
                MaxRows: ScheduledGeocodingAction.PAGE_SIZE,
                StartRow: pageOffset + 1,
                BypassCache: true,
                ResultType: 'entity_object'
            }, contextUser);

            if (!pageResult.Success || pageResult.Results.length === 0) break;

            const budget = maxTotal - totalProcessed;
            const records = pageResult.Results.slice(0, budget);

            if (totalProcessed === 0) {
                LogStatus(`ScheduledGeocodingAction: Processing failed records for retry`);
            }

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

                const entities = await this.loadSourceEntities(geoRecords, entityInfo, contextUser, provider);
                if (entities.length === 0) continue;

                const stats = await this.geocodeBatch(entities, entityInfo, contextUser, batchSize);
                totalProcessed += stats.Processed;
                totalSuccess += stats.Success;
            }

            if (pageResult.Results.length < ScheduledGeocodingAction.PAGE_SIZE) break;
            pageOffset += ScheduledGeocodingAction.PAGE_SIZE;
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
     * Processes one entity at a time, paginating orphan queries to avoid loading
     * all orphan rows into memory simultaneously.
     */
    private async cleanupOrphanedRecords(
        contextUser: UserInfo,
        batchSize: number,
        provider?: IMetadataProvider
    ): Promise<number> {
        const rv = new RunView();
        const md = (provider ?? new Metadata()) as unknown as IMetadataProvider;
        // Resolve the dialect for the active provider once — the orphan filter
        // is built per-entity but the dialect (SQL Server vs PostgreSQL) is
        // bound to the provider, not the entity, so deriving it here keeps
        // the per-entity loop dialect-agnostic.
        const platformKey = (md as unknown as DatabaseProviderBase).PlatformKey ?? 'sqlserver';
        const dialect = GetDialect(platformKey);
        let totalRemoved = 0;

        // Get distinct EntityIDs from RecordGeoCode (lightweight — just IDs)
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

                const entityRemoved = await this.cleanupOrphansForEntity(
                    entityId, entityInfo, pkField.Name, contextUser, batchSize, rv, dialect
                );
                totalRemoved += entityRemoved;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`ScheduledGeocodingAction: Orphan cleanup error for entity ${entityId}: ${msg}`);
            }
        }

        return totalRemoved;
    }

    /**
     * Paginated orphan cleanup for a single entity. Fetches pages of orphan rows,
     * deletes them, then fetches the next page. Since deleted rows disappear from
     * subsequent queries, we always fetch from offset 0.
     */
    private async cleanupOrphansForEntity(
        entityId: string,
        entityInfo: EntityInfo,
        pkFieldName: string,
        contextUser: UserInfo,
        batchSize: number,
        rv: RunView,
        dialect: SQLDialect
    ): Promise<number> {
        let entityRemoved = 0;
        const sourceRef = dialect.QuoteSchema(entityInfo.SchemaName, entityInfo.BaseView);
        const pkRef = `src.${dialect.QuoteIdentifier(pkFieldName)}`;
        const pkAsString = dialect.CastToBoundedString(pkRef, 450);
        const entityIdLit = dialect.QuoteStringLiteral(entityId);
        const orphanFilter = `EntityID = ${entityIdLit} AND NOT EXISTS (SELECT 1 FROM ${sourceRef} src WHERE ${pkAsString} = RecordID)`;

        // Paginate: fetch a page, delete it, repeat. Since we're deleting rows,
        // always query from the start — deleted rows won't appear again.
        let hasMore = true;
        while (hasMore) {
            const orphanResult = await rv.RunView<MJRecordGeoCodeEntity>({
                EntityName: 'MJ: Record Geo Codes',
                ExtraFilter: orphanFilter,
                MaxRows: ScheduledGeocodingAction.PAGE_SIZE,
                BypassCache: true,
                ResultType: 'entity_object'
            }, contextUser);

            if (!orphanResult.Success || orphanResult.Results.length === 0) break;

            const orphans = orphanResult.Results;
            for (let i = 0; i < orphans.length; i += batchSize) {
                const batch = orphans.slice(i, i + batchSize);
                const results = await Promise.allSettled(batch.map(o => o.Delete()));
                entityRemoved += results.filter(r => r.status === 'fulfilled' && r.value).length;
            }

            // If we got fewer than PAGE_SIZE, we've exhausted the orphans
            hasMore = orphans.length >= ScheduledGeocodingAction.PAGE_SIZE;
        }

        if (entityRemoved > 0) {
            LogStatus(`ScheduledGeocodingAction: Removed ${entityRemoved} orphaned geo records for ${entityInfo.Name}`);
        }
        return entityRemoved;
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
     * @param existingGeoCodesMap - Optional pre-loaded map passed to GeoCodeSyncService
     */
    private async geocodeBatch(
        entities: BaseEntity[],
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        batchSize: number,
        existingGeoCodesMap?: Map<string, ExistingGeoCodeInfo>
    ): Promise<{ Processed: number; Success: number }> {
        let totalSuccess = 0;

        for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);

            const results = await Promise.allSettled(
                batch.map(entity => this.geocodeAndInvalidate(entity, contextUser, existingGeoCodesMap))
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
    private async geocodeAndInvalidate(
        entity: BaseEntity,
        contextUser: UserInfo,
        existingGeoCodesMap?: Map<string, ExistingGeoCodeInfo>
    ): Promise<boolean> {
        try {
            const result = await GeoCodeSyncService.Instance.SyncIfChanged(
                entity, contextUser, undefined, existingGeoCodesMap
            );

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
     * Load all existing RecordGeoCode rows for an entity into a lightweight Map.
     * Keyed by `RecordID|LocationType` for O(1) lookup.
     *
     * This replaces both the old getExistingGeoCodeRecordIds() Set (for filtering
     * missing records) and the per-record FindExistingGeoCode() SQL query in
     * GeoCodeSyncService (for staleness checking). The map holds ~5 small string
     * fields per row — even 50k rows is only ~15MB, safe to hold in memory for
     * the duration of one entity's processing.
     */
    private async loadExistingGeoCodesMap(
        entityId: string,
        contextUser: UserInfo
    ): Promise<Map<string, ExistingGeoCodeInfo>> {
        const rv = new RunView();
        const result = await rv.RunView<{
            ID: string;
            RecordID: string;
            LocationType: string;
            SourceFieldHash: string | null;
            Status: string;
        }>({
            EntityName: 'MJ: Record Geo Codes',
            ExtraFilter: `EntityID = '${entityId}'`,
            Fields: ['ID', 'RecordID', 'LocationType', 'SourceFieldHash', 'Status'],
            ResultType: 'simple',
            IgnoreMaxRows: true,
            BypassCache: true
        }, contextUser);

        const map = new Map<string, ExistingGeoCodeInfo>();
        if (result.Success) {
            for (const row of result.Results) {
                const key = GeoCodeSyncService.BuildGeoCodeMapKey(row.RecordID, row.LocationType);
                map.set(key, {
                    ID: row.ID,
                    RecordID: row.RecordID,
                    LocationType: row.LocationType,
                    SourceFieldHash: row.SourceFieldHash,
                    Status: row.Status
                });
            }
        }
        return map;
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

}
