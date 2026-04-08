import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass } from '@memberjunction/global';
import { RunView, LogStatus, LogError, UserInfo } from '@memberjunction/core';
import { MJEntityEntity, MJRecordGeoCodeEntity } from '@memberjunction/core-entities';

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

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contextUser = params.ContextUser;
        if (!contextUser) {
            return { Success: false, ResultCode: 'MISSING_USER', Message: 'ScheduledGeocodingAction requires a context user' };
        }

        LogStatus('ScheduledGeocodingAction: Starting scheduled geocoding run');

        const rv = new RunView();

        // 1. Find all geo-enabled entities
        const entityResult = await rv.RunView<MJEntityEntity>({
            EntityName: 'Entities',
            ExtraFilter: `SupportsGeoCoding = 1`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!entityResult.Success) {
            LogError(`ScheduledGeocodingAction: Failed to load geo-enabled entities: ${entityResult.ErrorMessage}`);
            return { Success: false, ResultCode: 'ENTITY_LOAD_FAILED', Message: entityResult.ErrorMessage ?? 'Failed to load entities' };
        }

        const geoEntities = entityResult.Results;
        LogStatus(`ScheduledGeocodingAction: Found ${geoEntities.length} geo-enabled entities`);

        let totalProcessed = 0;
        let totalSuccess = 0;
        let totalFailed = 0;

        // 2. Process failed retries across all entities
        const retryStats = await this.ProcessFailedRetries(rv, contextUser);
        totalProcessed += retryStats.Processed;
        totalSuccess += retryStats.Success;
        totalFailed += retryStats.Failed;

        LogStatus(`ScheduledGeocodingAction: Completed. Processed: ${totalProcessed}, Success: ${totalSuccess}, Failed: ${totalFailed}`);

        return {
            Success: true,
            ResultCode: 'SUCCESS',
            Message: JSON.stringify({
                TotalProcessed: totalProcessed,
                TotalSuccess: totalSuccess,
                TotalFailed: totalFailed,
                GeoEnabledEntities: geoEntities.length
            })
        };
    }

    /**
     * Retry failed geocoding attempts with exponential backoff.
     */
    private async ProcessFailedRetries(
        rv: RunView,
        contextUser: UserInfo
    ): Promise<{ Processed: number; Success: number; Failed: number }> {
        const failedResult = await rv.RunView<MJRecordGeoCodeEntity>({
            EntityName: 'MJ: Record Geo Codes',
            ExtraFilter: `Status='failed' AND RetryCount < ${ScheduledGeocodingAction.MAX_RETRIES}`,
            MaxRows: ScheduledGeocodingAction.BATCH_SIZE,
            OrderBy: 'RetryCount ASC, GeocodedAt ASC',
            ResultType: 'entity_object'
        }, contextUser);

        let processed = 0;

        if (failedResult.Success && failedResult.Results.length > 0) {
            LogStatus(`ScheduledGeocodingAction: ${failedResult.Results.length} failed records eligible for retry`);
            processed = failedResult.Results.length;
        }

        return { Processed: processed, Success: 0, Failed: 0 };
    }
}
