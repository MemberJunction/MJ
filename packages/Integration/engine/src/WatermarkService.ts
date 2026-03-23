import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import type { ICompanyIntegrationSyncWatermark } from './entity-types.js';
import type { WatermarkType } from './types.js';

/**
 * Service for loading and updating sync watermarks used for incremental data fetching.
 * Watermarks track the "last known position" so each sync only fetches changes since the last run.
 */
export class WatermarkService {
    /**
     * Loads the current watermark for a specific entity map direction.
     *
     * @param entityMapID - The CompanyIntegrationEntityMap ID to load the watermark for
     * @param contextUser - User context for data access
     * @returns The watermark entity if found, or null if no watermark exists yet
     */
    public async Load(
        entityMapID: string,
        contextUser: UserInfo
    ): Promise<ICompanyIntegrationSyncWatermark | null> {
        const rv = new RunView();
        const result = await rv.RunView<ICompanyIntegrationSyncWatermark>({
            EntityName: 'MJ: Company Integration Sync Watermarks',
            ExtraFilter: `EntityMapID='${entityMapID}'`,
            OrderBy: 'LastSyncAt DESC',
            MaxRows: 1,
            ResultType: 'entity_object',
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return null;
        return result.Results[0];
    }

    /**
     * Updates or creates the watermark for a specific entity map.
     * If a watermark record already exists, it is updated in place.
     * If none exists, a new record is created.
     *
     * @param entityMapID - The CompanyIntegrationEntityMap ID to update the watermark for
     * @param newValue - The new watermark value to store
     * @param contextUser - User context for data access
     */
    public async Update(
        entityMapID: string,
        newValue: string,
        contextUser: UserInfo
    ): Promise<void> {
        const existing = await this.Load(entityMapID, contextUser);
        if (existing) {
            await this.UpdateExistingWatermark(existing, newValue);
        } else {
            await this.CreateNewWatermark(entityMapID, newValue, contextUser);
        }
    }

    /**
     * Updates the progress fields on an existing watermark mid-sync without changing
     * the WatermarkValue. Updates RecordsSynced to the cumulative total written so far
     * and refreshes LastSyncAt so the DB reflects live progress between batches.
     * Silently skips if no watermark record exists yet.
     *
     * @param entityMapID - The entity map being synced
     * @param totalWritten - Cumulative number of records written to DB so far
     * @param contextUser - User context for data access
     */
    public async UpdateProgress(
        entityMapID: string,
        totalWritten: number,
        contextUser: UserInfo
    ): Promise<void> {
        const existing = await this.Load(entityMapID, contextUser);
        if (!existing) return;

        existing.RecordsSynced = totalWritten;
        existing.LastSyncAt = new Date();
        await existing.Save();
    }

    /**
     * Validates a watermark value against its expected type.
     *
     * @param watermarkValue - The watermark value to validate
     * @param watermarkType - The expected type of watermark
     * @returns true if the watermark is valid for its type, false otherwise
     */
    public ValidateWatermark(watermarkValue: string, watermarkType: WatermarkType): boolean {
        if (!watermarkValue || watermarkValue.trim().length === 0) {
            return false;
        }

        switch (watermarkType) {
            case 'Timestamp':
                return !isNaN(Date.parse(watermarkValue));
            case 'Version':
                return /^\d+$/.test(watermarkValue);
            case 'Cursor':
            case 'ChangeToken':
                return watermarkValue.length > 0;
            default:
                return watermarkValue.length > 0;
        }
    }

    /**
     * Updates an existing watermark record with a new value and timestamp.
     */
    private async UpdateExistingWatermark(
        watermark: ICompanyIntegrationSyncWatermark,
        newValue: string
    ): Promise<void> {
        watermark.WatermarkValue = newValue;
        watermark.LastSyncAt = new Date();
        const saved = await watermark.Save();
        if (!saved) {
            throw new Error(`Failed to update watermark for EntityMapID=${watermark.EntityMapID}`);
        }
    }

    /**
     * Creates a new watermark record for the given entity map.
     */
    private async CreateNewWatermark(
        entityMapID: string,
        newValue: string,
        contextUser: UserInfo
    ): Promise<void> {
        const md = new Metadata();
        const watermark = await md.GetEntityObject(
            'MJ: Company Integration Sync Watermarks',
            contextUser
        ) as unknown as ICompanyIntegrationSyncWatermark;
        watermark.NewRecord!();
        watermark.EntityMapID = entityMapID;
        watermark.WatermarkValue = newValue;
        watermark.Direction = 'Pull';
        watermark.WatermarkType = 'Timestamp';
        watermark.LastSyncAt = new Date();
        watermark.RecordsSynced = 0;

        const saved = await watermark.Save!();
        if (!saved) {
            throw new Error(`Failed to create watermark for EntityMapID=${entityMapID}`);
        }
    }
}
