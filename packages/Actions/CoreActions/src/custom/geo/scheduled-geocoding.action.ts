import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { RunView, Metadata, LogStatus, LogError, UserInfo, EntityInfo, CompositeKey } from '@memberjunction/core';
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
 * Designed to run on a schedule (every few hours) as a safety net for records
 * that bypass BaseEntity.Save() (bulk SQL imports, direct DB operations).
 */
@RegisterClass(BaseAction, 'Scheduled Geocoding')
export class ScheduledGeocodingAction extends BaseAction {
    private static readonly DEFAULT_MAX_RETRIES = 5;
    private static readonly DEFAULT_BATCH_SIZE = 100;

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser) {
            return { Success: false, ResultCode: 'MISSING_USER', Message: 'ScheduledGeocodingAction requires a context user' };
        }

        const maxRetries = this.getNumericParam(params, 'MaxRetries', ScheduledGeocodingAction.DEFAULT_MAX_RETRIES);
        const batchSize = this.getNumericParam(params, 'BatchSize', ScheduledGeocodingAction.DEFAULT_BATCH_SIZE);

        LogStatus('ScheduledGeocodingAction: Starting maintenance run');

        const stats = { MissingProcessed: 0, MissingSuccess: 0, RetriesProcessed: 0, RetriesSuccess: 0, OrphansRemoved: 0 };

        // Step 1: Find and geocode missing records
        const missingStats = await this.processMissingRecords(contextUser, batchSize);
        stats.MissingProcessed = missingStats.Processed;
        stats.MissingSuccess = missingStats.Success;

        // Step 2: Retry failed geocoding attempts
        const retryStats = await this.processFailedRetries(contextUser, maxRetries, batchSize);
        stats.RetriesProcessed = retryStats.Processed;
        stats.RetriesSuccess = retryStats.Success;

        // Step 3: Clean up orphaned RecordGeoCode rows
        stats.OrphansRemoved = await this.cleanupOrphanedRecords(contextUser, batchSize);

        LogStatus(`ScheduledGeocodingAction: Complete — Missing: ${stats.MissingProcessed} processed (${stats.MissingSuccess} success), Retries: ${stats.RetriesProcessed} (${stats.RetriesSuccess} success), Orphans: ${stats.OrphansRemoved} removed`);

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: JSON.stringify(stats)
        };
    }

    /**
     * Find records in geo-enabled entities that have no RecordGeoCode row
     * and geocode them using GeoCodeSyncService.
     */
    private async processMissingRecords(
        contextUser: UserInfo,
        batchSize: number
    ): Promise<{ Processed: number; Success: number }> {
        const md = new Metadata();
        const geoEntities = md.Entities.filter(e => e.SupportsGeoCoding);
        let processed = 0;
        let success = 0;

        for (const entityInfo of geoEntities) {
            if (processed >= batchSize) break;

            const remaining = batchSize - processed;
            const entityStats = await this.processMissingForEntity(entityInfo, contextUser, remaining);
            processed += entityStats.Processed;
            success += entityStats.Success;
        }

        if (processed > 0) {
            LogStatus(`ScheduledGeocodingAction: Processed ${processed} missing records (${success} geocoded successfully)`);
        }

        return { Processed: processed, Success: success };
    }

    /**
     * Process missing RecordGeoCode rows for a single entity.
     */
    private async processMissingForEntity(
        entityInfo: EntityInfo,
        contextUser: UserInfo,
        maxRows: number
    ): Promise<{ Processed: number; Success: number }> {
        const rv = new RunView();

        // Find records that have no RecordGeoCode row
        // We load entity records as entity_object so GeoCodeSyncService can read field values
        const pkField = entityInfo.FirstPrimaryKey;
        if (!pkField) return { Processed: 0, Success: 0 };

        // Build filter for records with at least one non-null geo field
        const geoFields = entityInfo.Fields.filter(f =>
            f.ExtendedType != null && f.ExtendedType.startsWith('Geo') &&
            f.ExtendedType !== 'GeoLatitude' && f.ExtendedType !== 'GeoLongitude'
        );
        if (geoFields.length === 0) return { Processed: 0, Success: 0 };

        // At least one address-type geo field must be non-null
        const nonNullConditions = geoFields.map(f => `${f.Name} IS NOT NULL`).join(' OR ');

        // Subquery to exclude records that already have a RecordGeoCode row
        // Use a LEFT JOIN approach via ExtraFilter with NOT EXISTS
        const entityIdStr = entityInfo.ID.replace(/'/g, "''");
        const filter = `(${nonNullConditions}) AND NOT EXISTS (SELECT 1 FROM __mj.RecordGeoCode rgc WHERE rgc.EntityID = '${entityIdStr}' AND rgc.RecordID = CAST(${pkField.Name} AS NVARCHAR(450)))`;

        try {
            const result = await rv.RunView({
                EntityName: entityInfo.Name,
                ExtraFilter: filter,
                MaxRows: maxRows,
                ResultType: 'entity_object'
            }, contextUser);

            if (!result.Success || result.Results.length === 0) {
                return { Processed: 0, Success: 0 };
            }

            let successCount = 0;
            for (const record of result.Results) {
                try {
                    const entity = record as unknown as import('@memberjunction/core').BaseEntity;
                    await GeoCodeSyncService.Instance.SyncIfChanged(entity);
                    successCount++;
                } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    LogError(`ScheduledGeocodingAction: Failed to geocode ${entityInfo.Name} record: ${msg}`);
                }
            }

            return { Processed: result.Results.length, Success: successCount };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`ScheduledGeocodingAction: Error querying missing records for ${entityInfo.Name}: ${msg}`);
            return { Processed: 0, Success: 0 };
        }
    }

    /**
     * Retry failed geocoding attempts. Loads the source entity record
     * and re-runs GeoCodeSyncService.
     */
    private async processFailedRetries(
        contextUser: UserInfo,
        maxRetries: number,
        batchSize: number
    ): Promise<{ Processed: number; Success: number }> {
        const rv = new RunView();

        const failedResult = await rv.RunView<MJRecordGeoCodeEntity>({
            EntityName: 'MJ: Record Geo Codes',
            ExtraFilter: `Status='failed' AND RetryCount < ${maxRetries}`,
            MaxRows: batchSize,
            OrderBy: 'RetryCount ASC, GeocodedAt ASC',
            ResultType: 'entity_object'
        }, contextUser);

        if (!failedResult.Success || failedResult.Results.length === 0) {
            return { Processed: 0, Success: 0 };
        }

        LogStatus(`ScheduledGeocodingAction: ${failedResult.Results.length} failed records eligible for retry`);

        const md = new Metadata();
        let successCount = 0;

        for (const geoRecord of failedResult.Results) {
            try {
                // Load the source entity record
                const entityInfo = md.EntityByID(geoRecord.EntityID);
                if (!entityInfo) continue;

                const entity = await md.GetEntityObject(entityInfo.Name, contextUser);
                const pk = new CompositeKey([{ FieldName: 'ID', Value: geoRecord.RecordID }]);
                const loaded = await entity.InnerLoad(pk);
                if (!loaded) {
                    // Source record doesn't exist anymore — mark for orphan cleanup
                    continue;
                }

                await GeoCodeSyncService.Instance.SyncIfChanged(entity);
                successCount++;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`ScheduledGeocodingAction: Retry failed for RecordGeoCode ${geoRecord.ID}: ${msg}`);
            }
        }

        return { Processed: failedResult.Results.length, Success: successCount };
    }

    /**
     * Remove RecordGeoCode rows whose source entity record no longer exists.
     * Processes one entity at a time to keep queries efficient.
     */
    private async cleanupOrphanedRecords(
        contextUser: UserInfo,
        batchSize: number
    ): Promise<number> {
        const rv = new RunView();
        const md = new Metadata();
        let totalRemoved = 0;

        // Get distinct EntityIDs from RecordGeoCode
        const entityResult = await rv.RunView<{ EntityID: string }>({
            EntityName: 'MJ: Record Geo Codes',
            Fields: ['EntityID'],
            ResultType: 'simple',
            MaxRows: 1000
        }, contextUser);

        if (!entityResult.Success) return 0;

        // Deduplicate entity IDs
        const entityIds = [...new Set(entityResult.Results.map(r => r.EntityID))];

        for (const entityId of entityIds) {
            if (totalRemoved >= batchSize) break;

            try {
                const entityInfo = md.EntityByID(entityId);
                if (!entityInfo) {
                    // Entity itself was deleted — all its geo records are orphans
                    // Skip for now — this is rare and could be a large delete
                    continue;
                }

                const pkField = entityInfo.FirstPrimaryKey;
                if (!pkField) continue;

                // Find RecordGeoCode rows for this entity where the source record is missing
                // Use a NOT EXISTS subquery against the entity's base table
                const orphanResult = await rv.RunView<MJRecordGeoCodeEntity>({
                    EntityName: 'MJ: Record Geo Codes',
                    ExtraFilter: `EntityID = '${entityId}' AND NOT EXISTS (SELECT 1 FROM ${entityInfo.SchemaName}.${entityInfo.BaseTable} src WHERE CAST(src.${pkField.Name} AS NVARCHAR(450)) = RecordID)`,
                    MaxRows: batchSize - totalRemoved,
                    ResultType: 'entity_object'
                }, contextUser);

                if (orphanResult.Success && orphanResult.Results.length > 0) {
                    for (const orphan of orphanResult.Results) {
                        try {
                            await orphan.Delete();
                            totalRemoved++;
                        } catch {
                            // Log but continue — one failed delete shouldn't stop the rest
                        }
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
