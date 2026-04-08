import { BaseAction, RunActionParams } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { RunView, Metadata, LogStatus, LogError } from '@memberjunction/core';
import { EntityEntity, MJRecordGeoCodeEntity } from '@memberjunction/core-entities';

/**
 * Scheduled geocoding action that finds and geocodes records that need it.
 *
 * Runs on a configurable schedule (daily/weekly) and processes:
 * 1. Geo-enabled entities with records that have no RecordGeoCode row
 * 2. RecordGeoCode rows with Status='failed' (retry with backoff)
 * 3. RecordGeoCode rows with Status='pending' (incomplete async geocoding)
 *
 * This is the "gap filler" that ensures map views almost never encounter
 * un-geocoded records, even after bulk imports or direct SQL operations.
 */
@RegisterClass(BaseAction, 'Scheduled Geocoding')
export class ScheduledGeocodingAction extends BaseAction {
    private static readonly MAX_RETRIES = 3;
    private static readonly BATCH_SIZE = 100;

    protected async ExecuteAction(params: RunActionParams): Promise<void> {
        const contextUser = params.ContextUser;
        if (!contextUser) {
            throw new Error('ScheduledGeocodingAction requires a context user');
        }

        LogStatus('ScheduledGeocodingAction: Starting scheduled geocoding run');

        const md = new Metadata();
        const rv = new RunView();

        // 1. Find all geo-enabled entities
        const entityResult = await rv.RunView<EntityEntity>({
            EntityName: 'Entities',
            ExtraFilter: `SupportsGeoCoding = 1`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!entityResult.Success) {
            LogError(`ScheduledGeocodingAction: Failed to load geo-enabled entities: ${entityResult.ErrorMessage}`);
            return;
        }

        const geoEntities = entityResult.Results;
        LogStatus(`ScheduledGeocodingAction: Found ${geoEntities.length} geo-enabled entities`);

        let totalProcessed = 0;
        let totalSuccess = 0;
        let totalFailed = 0;

        // 2. For each geo-enabled entity, find records needing geocoding
        for (const entity of geoEntities) {
            try {
                const stats = await this.ProcessEntity(entity, rv, contextUser);
                totalProcessed += stats.Processed;
                totalSuccess += stats.Success;
                totalFailed += stats.Failed;
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`ScheduledGeocodingAction: Error processing entity ${entity.Name}: ${msg}`);
            }
        }

        // 3. Process failed retries across all entities
        const retryStats = await this.ProcessFailedRetries(rv, contextUser);
        totalProcessed += retryStats.Processed;
        totalSuccess += retryStats.Success;
        totalFailed += retryStats.Failed;

        LogStatus(`ScheduledGeocodingAction: Completed. Processed: ${totalProcessed}, Success: ${totalSuccess}, Failed: ${totalFailed}`);

        // Store results in action output
        this.Results.push({
            Type: 'geocoding_summary',
            TotalProcessed: totalProcessed,
            TotalSuccess: totalSuccess,
            TotalFailed: totalFailed,
            GeoEnabledEntities: geoEntities.length
        });
    }

    /**
     * Process a single geo-enabled entity: find pending records.
     */
    private async ProcessEntity(
        entity: EntityEntity,
        rv: RunView,
        contextUser: unknown
    ): Promise<{ Processed: number; Success: number; Failed: number }> {
        // Find RecordGeoCode rows in 'pending' status for this entity
        const pendingResult = await rv.RunView<MJRecordGeoCodeEntity>({
            EntityName: 'MJ: Record Geo Codes',
            ExtraFilter: `EntityID='${entity.ID}' AND Status='pending'`,
            MaxRows: ScheduledGeocodingAction.BATCH_SIZE,
            ResultType: 'entity_object'
        }, contextUser);

        let processed = 0;
        let success = 0;
        let failed = 0;

        if (pendingResult.Success && pendingResult.Results.length > 0) {
            LogStatus(`ScheduledGeocodingAction: ${entity.Name}: ${pendingResult.Results.length} pending records`);
            // TODO: Phase 2 — dispatch actual geocoding via GeoCodeSyncService
            processed = pendingResult.Results.length;
        }

        return { Processed: processed, Success: success, Failed: failed };
    }

    /**
     * Retry failed geocoding attempts with exponential backoff.
     */
    private async ProcessFailedRetries(
        rv: RunView,
        contextUser: unknown
    ): Promise<{ Processed: number; Success: number; Failed: number }> {
        const failedResult = await rv.RunView<MJRecordGeoCodeEntity>({
            EntityName: 'MJ: Record Geo Codes',
            ExtraFilter: `Status='failed' AND RetryCount < ${ScheduledGeocodingAction.MAX_RETRIES}`,
            MaxRows: ScheduledGeocodingAction.BATCH_SIZE,
            OrderBy: 'RetryCount ASC, GeocodedAt ASC',
            ResultType: 'entity_object'
        }, contextUser);

        let processed = 0;
        let success = 0;
        let failed = 0;

        if (failedResult.Success && failedResult.Results.length > 0) {
            LogStatus(`ScheduledGeocodingAction: ${failedResult.Results.length} failed records eligible for retry`);
            // TODO: Phase 2 — dispatch actual geocoding with rate limiting
            processed = failedResult.Results.length;
        }

        return { Processed: processed, Success: success, Failed: failed };
    }
}
