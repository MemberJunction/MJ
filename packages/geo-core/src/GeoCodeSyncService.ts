import { BaseSingleton } from '@memberjunction/global';
import { BaseEntity, Metadata, RunView, LogError, LogStatus } from '@memberjunction/core';
import { MJRecordGeoCodeEntity } from '@memberjunction/core-entities';
import { GeoFieldMapping, GeocodeResult, GeocodeStatus } from './types';
import { ComputeGeoSourceHash } from './hash';

/**
 * Singleton service that manages the geocoding lifecycle for entity records.
 * Called by CodeGen-generated AfterSave hooks on geo-enabled entities.
 *
 * Responsibilities:
 * - Computes source field hashes for change detection
 * - Checks existing RecordGeoCode rows for staleness
 * - Dispatches geocoding (delegates to registered geocoding providers)
 * - Upserts RecordGeoCode rows with results or error status
 *
 * All geocoding is fire-and-forget — errors are captured in RecordGeoCode
 * and retried by the scheduled geocoding job. Never throws.
 */
export class GeoCodeSyncService extends BaseSingleton<GeoCodeSyncService> {
    public constructor() {
        super();
    }

    public static get Instance(): GeoCodeSyncService {
        return GeoCodeSyncService.getInstance<GeoCodeSyncService>();
    }

    /**
     * Check if any geo field mappings have changed and dispatch geocoding if needed.
     * Called from generated entity subclass AfterSave hooks.
     *
     * This method never throws — all errors are captured in RecordGeoCode rows.
     *
     * @param entity - The entity instance that was just saved
     * @param mappings - CodeGen-generated field-to-location mappings
     */
    public async SyncIfChanged(entity: BaseEntity, mappings: GeoFieldMapping[]): Promise<void> {
        for (const mapping of mappings) {
            try {
                await this.ProcessMapping(entity, mapping);
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                LogError(`GeoCodeSyncService: Error processing ${mapping.LocationType} for ${entity.EntityInfo.Name} ${entity.PrimaryKey.ToString()}: ${message}`);
            }
        }
    }

    /**
     * Process a single field mapping for a single entity record.
     */
    protected async ProcessMapping(entity: BaseEntity, mapping: GeoFieldMapping): Promise<void> {
        const hash = ComputeGeoSourceHash(entity, mapping.Fields);

        const existing = await this.FindExistingGeoCode(
            entity.EntityInfo.ID,
            entity.PrimaryKey.ToString(),
            mapping.LocationType
        );

        if (existing && existing.SourceFieldHash === hash && existing.Status === 'success') {
            return; // No change, already geocoded successfully
        }

        // Upsert a pending row
        const row = existing ?? await this.CreateGeoCodeRow(
            entity.EntityInfo.ID,
            entity.PrimaryKey.ToString(),
            mapping.LocationType
        );

        if (!row) {
            LogError(`GeoCodeSyncService: Failed to create/find RecordGeoCode row`);
            return;
        }

        row.SourceFieldHash = hash;
        row.Status = 'pending' as GeocodeStatus;
        row.GeocodedAt = new Date();
        await row.Save();

        // Attempt geocoding
        try {
            const result = await this.Geocode(entity, mapping);
            if (result) {
                await this.UpdateSuccess(row, result, hash);
            } else {
                await this.UpdateFailure(row, 'Geocoding returned no result');
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            await this.UpdateFailure(row, message);
        }
    }

    /**
     * Find an existing RecordGeoCode row for a given entity/record/location type.
     */
    protected async FindExistingGeoCode(
        entityID: string,
        recordID: string,
        locationType: string
    ): Promise<MJRecordGeoCodeEntity | null> {
        const rv = new RunView();
        const result = await rv.RunView<MJRecordGeoCodeEntity>({
            EntityName: 'MJ: Record Geo Codes',
            ExtraFilter: `EntityID='${entityID}' AND RecordID='${recordID}' AND LocationType='${locationType}'`,
            ResultType: 'entity_object',
            MaxRows: 1
        });
        if (result.Success && result.Results.length > 0) {
            return result.Results[0];
        }
        return null;
    }

    /**
     * Create a new RecordGeoCode row.
     */
    protected async CreateGeoCodeRow(
        entityID: string,
        recordID: string,
        locationType: string
    ): Promise<MJRecordGeoCodeEntity | null> {
        const md = new Metadata();
        const row = await md.GetEntityObject<MJRecordGeoCodeEntity>('MJ: Record Geo Codes');
        row.NewRecord();
        row.EntityID = entityID;
        row.RecordID = recordID;
        row.LocationType = locationType;
        row.Status = 'pending';
        row.RetryCount = 0;
        const saved = await row.Save();
        return saved ? row : null;
    }

    /**
     * Update a RecordGeoCode row with successful geocoding results.
     */
    protected async UpdateSuccess(
        row: MJRecordGeoCodeEntity,
        result: GeocodeResult,
        hash: string
    ): Promise<void> {
        row.Latitude = result.Latitude;
        row.Longitude = result.Longitude;
        row.Precision = result.Precision;
        row.CountryID = result.CountryID ?? '';
        row.StateProvinceID = result.StateProvinceID ?? '';
        row.Status = 'success';
        row.GeocodingSource = result.Source;
        row.SourceFieldHash = hash;
        row.GeocodedAt = new Date();
        row.ErrorMessage = '';
        await row.Save();
    }

    /**
     * Update a RecordGeoCode row with failure information.
     */
    protected async UpdateFailure(row: MJRecordGeoCodeEntity, errorMessage: string): Promise<void> {
        row.Status = 'failed';
        row.ErrorMessage = errorMessage;
        row.RetryCount = (row.RetryCount ?? 0) + 1;
        row.GeocodedAt = new Date();
        await row.Save();
    }

    /**
     * Perform the actual geocoding. This is the extension point where
     * different geocoding strategies can be plugged in.
     *
     * Priority order (per the architecture plan):
     * 1. Native lat/lng fields → copy directly
     * 2. Address-level fields → Google Geocode Action
     * 3. State/country only → GeoResolver against reference tables
     *
     * For now, this is a placeholder that returns null. The actual
     * geocoding providers will be registered in Phase 2/3.
     */
    protected async Geocode(
        _entity: BaseEntity,
        _mapping: GeoFieldMapping
    ): Promise<GeocodeResult | null> {
        // TODO: Phase 2 — implement geocoding provider dispatch
        // For now, mark as pending for the scheduled job to pick up
        LogStatus(`GeoCodeSyncService: Geocoding not yet implemented. Record will be picked up by scheduled job.`);
        return null;
    }
}
