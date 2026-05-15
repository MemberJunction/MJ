import { BaseSingleton } from '@memberjunction/global';
import { BaseEntity, EntityFieldInfo, EntityInfo, Metadata, RunView, UserInfo, LogError } from '@memberjunction/core';
import { MJRecordGeoCodeEntity, GeoDataEngine } from '@memberjunction/core-entities';
import { GeoFieldMapping, GeocodeResult, GeocodeStatus, GeocodingSource, ExistingGeoCodeInfo } from './types';
import { ComputeGeoSourceHash } from './hash';
import { GeocodingProviderRegistry, GeocodeRequest, IGeocodingProvider, ProviderGeocodeResult } from './providers';

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
     * Called from the GenericDatabaseProvider OnSaveCompleted hook.
     *
     * This method never throws — all errors are captured in RecordGeoCode rows.
     *
     * @param entity - The entity instance that was just saved
     * @param contextUser - The user context for data operations
     * @param mappings - Field-to-location mappings (if not provided, derived from EntityField.ExtendedType metadata)
     * @param existingGeoCodesMap - Optional pre-loaded map of existing RecordGeoCode rows keyed by
     *        `RecordID|LocationType`. When provided, eliminates per-record SQL queries in
     *        FindExistingGeoCode(). Used by the scheduled geocoding job for batch processing.
     * @returns The geocode result from the first successfully geocoded mapping, or null
     *          if no geocoding was performed (e.g., hash unchanged) or all attempts failed.
     *          The caller can use this to patch virtual lat/lng fields on the entity's
     *          SP result before finalizeSave() loads it into the entity object.
     */
    public async SyncIfChanged(
        entity: BaseEntity,
        contextUser: UserInfo,
        mappings?: GeoFieldMapping[],
        existingGeoCodesMap?: Map<string, ExistingGeoCodeInfo>,
        providerName?: string | null
    ): Promise<GeocodeResult | null> {
        const resolvedMappings = mappings ?? GeoCodeSyncService.BuildMappingsFromMetadata(entity.EntityInfo);
        if (resolvedMappings.length === 0) return null;

        // GeoDataEngine is loaded on-demand (no @RegisterForStartup). Config() is idempotent —
        // concurrent calls dedup, and repeated calls after load return immediately. Both
        // resolveReferenceIDs() and geocodeViaReferenceData() rely on the in-memory maps
        // populated by this load, so await it before any per-mapping processing.
        await GeoDataEngine.Instance.Config(false, contextUser);

        const provider = GeocodingProviderRegistry.Instance.Resolve(providerName);

        for (const mapping of resolvedMappings) {
            try {
                const result = await this.ProcessMapping(entity, mapping, contextUser, existingGeoCodesMap, provider);
                if (result) return result;
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                LogError(`GeoCodeSyncService: Error processing ${mapping.LocationType} for ${entity.EntityInfo.Name} ${entity.PrimaryKey.ToString()}: ${message}`);
            }
        }
        return null;
    }

    /**
     * Derive geo field mappings from EntityField.ExtendedType metadata.
     * Finds all fields with Geo* ExtendedType values and groups them into
     * a Primary location mapping.
     *
     * @param entityInfo - The entity metadata to inspect
     * @returns Array of geo field mappings (empty if no geo fields found)
     */
    public static BuildMappingsFromMetadata(entityInfo: EntityInfo): GeoFieldMapping[] {
        const geoExtTypes = new Set([
            'Geo', 'GeoAddress', 'GeoCity', 'GeoStateProvince',
            'GeoCountry', 'GeoPostalCode', 'GeoLatitude', 'GeoLongitude'
        ]);
        const geoFields = entityInfo.Fields.filter(
            (f: EntityFieldInfo) => f.ExtendedType != null && geoExtTypes.has(f.ExtendedType)
        );
        if (geoFields.length === 0) return [];

        return [{
            LocationType: 'Primary',
            Fields: geoFields.map((f: EntityFieldInfo) => f.Name)
        }];
    }

    /**
     * Check if an entity has any geo fields defined in its metadata.
     * @param entityInfo - The entity metadata to check
     * @returns true if the entity has at least one field with a Geo* ExtendedType
     */
    public static HasGeoFields(entityInfo: EntityInfo): boolean {
        return entityInfo.SupportsGeoCoding && GeoCodeSyncService.BuildMappingsFromMetadata(entityInfo).length > 0;
    }

    /**
     * Build the composite key used for ExistingGeoCodeInfo map lookups.
     * Format: `RecordID|LocationType`
     */
    public static BuildGeoCodeMapKey(recordID: string, locationType: string): string {
        return `${recordID}|${locationType}`;
    }

    /**
     * Process a single field mapping for a single entity record.
     * @param existingGeoCodesMap - Optional pre-loaded map for O(1) lookup instead of per-record SQL query
     * @returns The geocode result if geocoding was performed successfully, or null if
     *          no geocoding was needed (hash unchanged) or the attempt failed.
     */
    protected async ProcessMapping(
        entity: BaseEntity,
        mapping: GeoFieldMapping,
        contextUser: UserInfo,
        existingGeoCodesMap?: Map<string, ExistingGeoCodeInfo>,
        provider?: IGeocodingProvider | null
    ): Promise<GeocodeResult | null> {
        const hash = ComputeGeoSourceHash(entity, mapping.Fields);

        // Build RecordID matching the format used in the view's LEFT JOIN to vwRecordGeoCodes:
        // - Single PK: bare value as string (e.g., "38CB433E-F36B-1410-84B4-00BD01F02867")
        // - Composite PK: values joined with "||" (e.g., "val1||val2")
        // This must match sql_codegen.ts generateBaseViewJoins() geo JOIN format.
        const pkPairs = entity.PrimaryKey.KeyValuePairs;
        const recordId = pkPairs.length === 1
            ? String(pkPairs[0].Value)
            : pkPairs.map(pk => String(pk.Value)).join('||');

        const existing = await this.FindExistingGeoCode(
            entity.EntityInfo.ID,
            recordId,
            mapping.LocationType,
            contextUser,
            existingGeoCodesMap
        );

        if (existing && existing.SourceFieldHash === hash && existing.Status === 'success') {
            return null; // No change, already geocoded successfully
        }

        // Upsert a pending row
        const row = existing ?? await this.CreateGeoCodeRow(
            entity.EntityInfo.ID,
            recordId,
            mapping.LocationType,
            contextUser
        );

        if (!row) {
            LogError(`GeoCodeSyncService: Failed to create/find RecordGeoCode row`);
            return null;
        }

        row.SourceFieldHash = hash;
        row.Status = 'pending' as GeocodeStatus;
        row.RetryCount = 0; // Reset retries — fresh attempt for new/changed address
        row.GeocodedAt = new Date();
        const pendingSaved = await row.Save();
        if (!pendingSaved) {
            LogError(`GeoCodeSyncService: Failed to save pending RecordGeoCode: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        }

        // Attempt geocoding
        try {
            const result = await this.Geocode(entity, mapping, provider);
            if (result) {
                await this.UpdateSuccess(row, result, hash);
                return result;
            } else {
                // No result means the address can't be geocoded (e.g., "Conference Room B").
                // Mark as not_geocodable so the retry job skips it. If the user later edits
                // the address, the hash will change and SyncIfChanged will re-attempt.
                await this.UpdateNotGeocodable(row, 'Geocoding returned no result — address may not be a valid location');
            }
        } catch (e: unknown) {
            // Exception = transient API error — mark as failed for retry
            const message = e instanceof Error ? e.message : String(e);
            await this.UpdateFailure(row, message);
        }
        return null;
    }

    /**
     * Find an existing RecordGeoCode row for a given entity/record/location type.
     *
     * When `existingGeoCodesMap` is provided (batch mode), checks the in-memory map first.
     * If a match is found, loads the full entity object by ID (single PK lookup — much cheaper
     * than a filtered query). Falls back to a per-record RunView query when no map is provided
     * (single-record mode, e.g., called from the AfterSave hook).
     */
    protected async FindExistingGeoCode(
        entityID: string,
        recordID: string,
        locationType: string,
        contextUser: UserInfo,
        existingGeoCodesMap?: Map<string, ExistingGeoCodeInfo>
    ): Promise<MJRecordGeoCodeEntity | null> {
        // Batch mode: O(1) map lookup + single PK load
        if (existingGeoCodesMap) {
            const key = `${recordID}|${locationType}`;
            const info = existingGeoCodesMap.get(key);
            if (!info) return null;

            // We have a match — check staleness inline to avoid loading the full entity
            // when the hash hasn't changed. The caller (ProcessMapping) does this check too,
            // but we can short-circuit the entity load here for the common "no change" case.
            const md = new Metadata();  // global-provider-ok: sync service — single-provider context
            const row = await md.GetEntityObject<MJRecordGeoCodeEntity>('MJ: Record Geo Codes', contextUser);
            const loaded = await row.Load(info.ID);
            return loaded ? row : null;
        }

        // Single-record mode: per-record RunView query (used by AfterSave hook)
        const rv = new RunView();
        const result = await rv.RunView<MJRecordGeoCodeEntity>({
            EntityName: 'MJ: Record Geo Codes',
            ExtraFilter: `EntityID='${entityID}' AND RecordID='${recordID}' AND LocationType='${locationType}'`,
            ResultType: 'entity_object',
            MaxRows: 1
        }, contextUser);
        if (result.Success && result.Results.length > 0) {
            return result.Results[0];
        }
        return null;
    }

    /**
     * Create a new RecordGeoCode row. If the insert fails due to a unique
     * constraint (race condition from concurrent batch geocoding), falls back
     * to loading the existing row.
     */
    protected async CreateGeoCodeRow(
        entityID: string,
        recordID: string,
        locationType: string,
        contextUser: UserInfo
    ): Promise<MJRecordGeoCodeEntity | null> {
        const md = new Metadata();  // global-provider-ok: sync service — single-provider context
        const row = await md.GetEntityObject<MJRecordGeoCodeEntity>('MJ: Record Geo Codes', contextUser);
        row.NewRecord();
        row.EntityID = entityID;
        row.RecordID = recordID;
        row.LocationType = locationType;
        row.Status = 'pending';
        row.RetryCount = 0;
        const saved = await row.Save();
        if (!saved) {
            // Likely a UNIQUE KEY violation from a concurrent batch — another thread
            // created the row between our FindExistingGeoCode check and this INSERT.
            // Fall back to loading the existing row.
            const existing = await this.FindExistingGeoCode(entityID, recordID, locationType, contextUser);
            if (existing) return existing;

            LogError(`GeoCodeSyncService: Failed to create RecordGeoCode row: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            return null;
        }
        return row;
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
        row.CountryID = result.CountryID ?? null;
        row.StateProvinceID = result.StateProvinceID ?? null;
        row.Status = 'success';
        // The entity's GeocodingSource setter literal type is generated from the DB CHECK
        // constraint. Migration V202605141800 widens that constraint to include 'geocodio'
        // and 'here'; once CodeGen re-runs against the post-migration schema, the cast
        // below becomes unnecessary and should be removed.
        row.GeocodingSource = result.Source as typeof row.GeocodingSource;
        row.SourceFieldHash = hash;
        row.GeocodedAt = new Date();
        row.ErrorMessage = '';
        const saved = await row.Save();
        if (!saved) {
            LogError(`GeoCodeSyncService: Failed to save successful geocode: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Mark a RecordGeoCode row as not geocodable — the address can't be resolved
     * to coordinates (e.g., "Conference Room B", "TBD"). Won't be retried by the
     * bulk job. If the source record's address fields change, the hash mismatch
     * in SyncIfChanged will trigger a fresh attempt.
     */
    protected async UpdateNotGeocodable(row: MJRecordGeoCodeEntity, reason: string): Promise<void> {
        row.Status = 'failed';
        row.ErrorMessage = reason;
        row.RetryCount = 9999; // Permanently skip retries — hash change will reset this
        row.GeocodedAt = new Date();
        const saved = await row.Save();
        if (!saved) {
            LogError(`GeoCodeSyncService: Failed to save not_geocodable status: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Update a RecordGeoCode row with failure information (transient error, eligible for retry).
     */
    protected async UpdateFailure(row: MJRecordGeoCodeEntity, errorMessage: string): Promise<void> {
        row.Status = 'failed';
        row.ErrorMessage = errorMessage;
        row.RetryCount = (row.RetryCount ?? 0) + 1;
        row.GeocodedAt = new Date();
        const saved = await row.Save();
        if (!saved) {
            LogError(`GeoCodeSyncService: Failed to save failure status: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }

    /**
     * Perform the actual geocoding using a priority-based strategy:
     *
     * 1. Native lat/lng fields → copy directly (GeocodingSource = 'native')
     * 2. Address-level fields → configured external geocoding provider
     *    (GeocodingSource = provider.Name — 'google' | 'geocodio' | 'here' | ...)
     * 3. Country/state only → reference table centroid lookup (GeocodingSource = 'reference_data')
     *
     * @param provider The resolved geocoding provider to use for strategy 2.
     *        When null, strategy 2 is skipped and we fall through to reference data.
     */
    protected async Geocode(
        entity: BaseEntity,
        _mapping: GeoFieldMapping,
        provider?: IGeocodingProvider | null,
    ): Promise<GeocodeResult | null> {
        // Strategy 1: Check for native (non-virtual) lat/lng fields.
        // Virtual fields like __mj_Latitude/__mj_Longitude come from the RecordGeoCode JOIN
        // and would create circular logic — reading old geocoded values instead of re-geocoding.
        const latField = entity.EntityInfo.Fields.find(f => f.ExtendedType === 'GeoLatitude' && !f.IsVirtual);
        const lngField = entity.EntityInfo.Fields.find(f => f.ExtendedType === 'GeoLongitude' && !f.IsVirtual);
        if (latField && lngField) {
            const latVal: unknown = entity.Get(latField.Name);
            const lngVal: unknown = entity.Get(lngField.Name);
            const lat = Number(latVal);
            const lng = Number(lngVal);
            if (latVal != null && lngVal != null && !isNaN(lat) && !isNaN(lng)) {
                return {
                    Latitude: lat,
                    Longitude: lng,
                    Precision: 'exact',
                    CountryID: null,
                    StateProvinceID: null,
                    Source: 'native'
                };
            }
        }

        // Collect address field values organized by their geo role
        const geoValues = this.extractGeoFieldValues(entity);

        // Strategy 2: Configured external provider (if one is resolvable)
        const activeProvider = provider ?? GeocodingProviderRegistry.Instance.Resolve();
        if (activeProvider) {
            const addressString = this.buildAddressString(geoValues);
            if (addressString) {
                const request: GeocodeRequest = {
                    AddressString: addressString,
                    Address: geoValues['GeoAddress'],
                    City: geoValues['GeoCity'],
                    StateProvince: geoValues['GeoStateProvince'],
                    PostalCode: geoValues['GeoPostalCode'],
                    Country: geoValues['GeoCountry']
                };
                const providerResult = await activeProvider.Geocode(request);
                if (providerResult) {
                    const result = this.mapProviderResult(providerResult, activeProvider.Name as GeocodingSource);
                    this.resolveReferenceIDs(result, entity);
                    return result;
                }
            }
        }

        // Strategy 3: Reference data centroid lookup (country/state → approximate lat/lng)
        return this.geocodeViaReferenceData(geoValues);
    }

    /**
     * Convert a provider-agnostic result into the persistence-layer shape.
     * Country/state resolution to MJ IDs happens in resolveReferenceIDs().
     */
    private mapProviderResult(r: ProviderGeocodeResult, source: GeocodingSource): GeocodeResult {
        return {
            Latitude: r.Latitude,
            Longitude: r.Longitude,
            Precision: r.Precision,
            CountryID: null,
            StateProvinceID: null,
            Source: source
        };
    }

    /**
     * Extract geo field values organized by their ExtendedType role.
     */
    private extractGeoFieldValues(entity: BaseEntity): Record<string, string> {
        const values: Record<string, string> = {};
        for (const field of entity.EntityInfo.Fields) {
            if (field.ExtendedType && field.ExtendedType.startsWith('Geo')) {
                const val: unknown = entity.Get(field.Name);
                if (val != null && String(val).trim() !== '') {
                    values[field.ExtendedType] = String(val).trim();
                }
            }
        }
        return values;
    }

    /**
     * Build an address string suitable for the Google Geocoding API from geo field values.
     * Orders components logically: Address, City, StateProvince, PostalCode, Country.
     */
    private buildAddressString(geoValues: Record<string, string>): string | null {
        const parts: string[] = [];
        if (geoValues['GeoAddress']) parts.push(geoValues['GeoAddress']);
        if (geoValues['GeoCity']) parts.push(geoValues['GeoCity']);
        if (geoValues['GeoStateProvince']) parts.push(geoValues['GeoStateProvince']);
        if (geoValues['GeoPostalCode']) parts.push(geoValues['GeoPostalCode']);
        if (geoValues['GeoCountry']) parts.push(geoValues['GeoCountry']);
        if (geoValues['Geo']) parts.push(geoValues['Geo']); // generic location field
        return parts.length > 0 ? parts.join(', ') : null;
    }

    /**
     * Resolve CountryID and StateProvinceID from entity geo field values
     * using the in-memory GeoDataEngine (O(1) lookups, no DB queries).
     */
    private resolveReferenceIDs(result: GeocodeResult, entity: BaseEntity): void {
        const geoValues = this.extractGeoFieldValues(entity);
        const geo = GeoDataEngine.Instance;

        const countryVal = geoValues['GeoCountry'];
        if (countryVal) {
            const country = geo.ResolveCountry(countryVal);
            if (country) {
                result.CountryID = country.ID;

                const stateVal = geoValues['GeoStateProvince'];
                if (stateVal) {
                    const state = geo.ResolveState(country.ID, stateVal);
                    if (state) {
                        result.StateProvinceID = state.ID;
                    }
                }
            }
        }
    }

    /**
     * Fallback geocoding using reference table centroids from GeoDataEngine.
     * All lookups are O(1) in-memory — no DB queries.
     */
    private geocodeViaReferenceData(geoValues: Record<string, string>): GeocodeResult | null {
        const geo = GeoDataEngine.Instance;
        const countryVal = geoValues['GeoCountry'];
        const stateVal = geoValues['GeoStateProvince'];

        if (!countryVal && !stateVal) {
            return null;
        }

        // Try state-level first (more precise)
        if (countryVal && stateVal) {
            const country = geo.ResolveCountry(countryVal);
            if (country) {
                const state = geo.ResolveState(country.ID, stateVal);
                if (state && state.Latitude != null && state.Longitude != null) {
                    return {
                        Latitude: state.Latitude,
                        Longitude: state.Longitude,
                        Precision: 'state_province',
                        CountryID: country.ID,
                        StateProvinceID: state.ID,
                        Source: 'reference_data'
                    };
                }
            }
        }

        // Fall back to country-level centroid
        if (countryVal) {
            const country = geo.ResolveCountry(countryVal);
            if (country && country.Latitude != null && country.Longitude != null) {
                return {
                    Latitude: country.Latitude,
                    Longitude: country.Longitude,
                    Precision: 'country',
                    CountryID: country.ID,
                    StateProvinceID: null,
                    Source: 'reference_data'
                };
            }
        }

        return null;
    }

}
