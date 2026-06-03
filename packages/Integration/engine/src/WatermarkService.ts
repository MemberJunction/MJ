import { Metadata, RunView, type UserInfo } from '@memberjunction/core';
import { MJCompanyIntegrationSyncWatermarkEntity } from '@memberjunction/core-entities';
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
        contextUser: UserInfo,
        direction: 'Pull' | 'Push' = 'Pull'
    ): Promise<ICompanyIntegrationSyncWatermark | null> {
        const rv = new RunView();
        const result = await rv.RunView<ICompanyIntegrationSyncWatermark>({
            EntityName: 'MJ: Company Integration Sync Watermarks',
            ExtraFilter: `EntityMapID='${entityMapID}' AND Direction='${direction}'`,
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
        contextUser: UserInfo,
        direction: 'Pull' | 'Push' = 'Pull'
    ): Promise<void> {
        const existing = await this.Load(entityMapID, contextUser, direction);
        if (existing) {
            await this.UpdateExistingWatermark(existing, newValue);
        } else {
            await this.CreateNewWatermark(entityMapID, newValue, contextUser, direction);
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
     * Persists a keyset/seek resume position for an INTERRUPTED scan (plan.md §8a).
     *
     * Stored on the Pull watermark record as `WatermarkType='Cursor'` so {@link Load} surfaces it and
     * `ProcessPullSync` can resume the seek (`key > AfterKey`) on the next run instead of re-scanning
     * from the start. Only meaningful for connectors that declare a `StableOrderingKey`; the engine
     * gates the call on that, so a timestamp connector's record is never written here. Idempotent —
     * safe to call repeatedly at the checkpoint cadence and once more on graceful early-exit.
     */
    public async SaveKeysetPosition(
        entityMapID: string,
        afterKey: string,
        contextUser: UserInfo
    ): Promise<void> {
        const existing = await this.Load(entityMapID, contextUser, 'Pull');
        if (existing) {
            existing.WatermarkType = 'Cursor';
            existing.WatermarkValue = afterKey;
            existing.LastSyncAt = new Date();
            const saved = await existing.Save();
            if (!saved) {
                throw new Error(`Failed to save keyset position for EntityMapID=${entityMapID}`);
            }
        } else {
            await this.createWatermark(entityMapID, afterKey, 'Cursor', 'Pull', contextUser);
        }
    }

    /**
     * Clears a persisted keyset resume position after a CLEAN scan (plan.md §8a), so the next run
     * starts a fresh seek from the beginning. Keeps the record (still `WatermarkType='Cursor'`) for
     * bookkeeping but nulls the value — a null value is what the restore logic reads as "no scan in
     * progress". No-op when no watermark record exists yet.
     */
    public async ClearKeysetPosition(entityMapID: string, contextUser: UserInfo): Promise<void> {
        const existing = await this.Load(entityMapID, contextUser, 'Pull');
        if (!existing) return;
        existing.WatermarkType = 'Cursor';
        existing.WatermarkValue = null;
        existing.LastSyncAt = new Date();
        const saved = await existing.Save();
        if (!saved) {
            throw new Error(`Failed to clear keyset position for EntityMapID=${entityMapID}`);
        }
    }

    /**
     * Persists the partition→rollup map for a partition hash-diff (Merkle) reconcile of a watermark-less
     * source (plan.md §7). Stored on the Pull watermark record as `WatermarkType='ChangeToken'` (the
     * map IS an opaque change-detection token), JSON-encoded. The object is no-watermark, so this field
     * is free; a partition-reconcile object never also carries a timestamp/cursor. Idempotent upsert.
     */
    public async SavePartitionRollups(
        entityMapID: string,
        rollups: Map<string, string>,
        contextUser: UserInfo
    ): Promise<void> {
        const json = JSON.stringify(Object.fromEntries(rollups));
        const existing = await this.Load(entityMapID, contextUser, 'Pull');
        if (existing) {
            existing.WatermarkType = 'ChangeToken';
            existing.WatermarkValue = json;
            existing.LastSyncAt = new Date();
            const saved = await existing.Save();
            if (!saved) throw new Error(`Failed to save partition rollups for EntityMapID=${entityMapID}`);
        } else {
            await this.createWatermark(entityMapID, json, 'ChangeToken', 'Pull', contextUser);
        }
    }

    /**
     * Loads the previously-stored partition→rollup map (empty map when none / first sync / wrong type),
     * so the next reconcile can diff against it and deep-sync only the partitions whose rollup moved.
     */
    public async LoadPartitionRollups(
        entityMapID: string,
        contextUser: UserInfo
    ): Promise<Map<string, string>> {
        const existing = await this.Load(entityMapID, contextUser, 'Pull');
        if (existing?.WatermarkType === 'ChangeToken' && existing.WatermarkValue) {
            try {
                const obj = JSON.parse(existing.WatermarkValue) as Record<string, string>;
                if (obj && typeof obj === 'object') return new Map(Object.entries(obj));
            } catch {
                // Corrupt/old value — treat as no prior snapshot (forces a full reconcile, never a skip).
            }
        }
        return new Map();
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
     * Creates a new watermark record for the given entity map (Timestamp type — the default for
     * incremental connectors).
     */
    private async CreateNewWatermark(
        entityMapID: string,
        newValue: string,
        contextUser: UserInfo,
        direction: 'Pull' | 'Push' = 'Pull'
    ): Promise<void> {
        await this.createWatermark(entityMapID, newValue, 'Timestamp', direction, contextUser);
    }

    /**
     * Shared creator for a new watermark row. Factored out so timestamp watermarks and keyset resume
     * positions ({@link SaveKeysetPosition}) share one persistence path with a per-call WatermarkType.
     */
    private async createWatermark(
        entityMapID: string,
        value: string | null,
        watermarkType: WatermarkType,
        direction: 'Pull' | 'Push',
        contextUser: UserInfo
    ): Promise<void> {
        const md = new Metadata();  // global-provider-ok: watermark service — single-provider context
        const watermark = await md.GetEntityObject<MJCompanyIntegrationSyncWatermarkEntity>(
            'MJ: Company Integration Sync Watermarks',
            contextUser
        );
        watermark.NewRecord();
        watermark.EntityMapID = entityMapID;
        watermark.WatermarkValue = value;
        watermark.Direction = direction;
        watermark.WatermarkType = watermarkType;
        watermark.LastSyncAt = new Date();
        watermark.RecordsSynced = 0;

        const saved = await watermark.Save();
        if (!saved) {
            const err = watermark.LatestResult?.Message || 'Unknown error';
            throw new Error(`Failed to create watermark for EntityMapID=${entityMapID}: ${err}`);
        }
    }
}
