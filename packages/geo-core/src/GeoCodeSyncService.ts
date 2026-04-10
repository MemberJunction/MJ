import { BaseSingleton } from '@memberjunction/global';
import { BaseEntity, EntityFieldInfo, EntityInfo, Metadata, RunView, LogError, LogStatus } from '@memberjunction/core';
import { MJRecordGeoCodeEntity, MJCountryEntity, MJStateProvinceEntity } from '@memberjunction/core-entities';
import { GeoFieldMapping, GeocodeResult, GeocodeStatus, GeocodePrecision } from './types';
import { ComputeGeoSourceHash } from './hash';

/**
 * Response shape from the Google Geocoding API.
 */
interface GoogleGeocodingResponse {
    results: Array<{
        address_components: Array<{
            long_name: string;
            short_name: string;
            types: string[];
        }>;
        formatted_address: string;
        geometry: {
            location: { lat: number; lng: number };
            location_type: string;
        };
    }>;
    status: string;
    error_message?: string;
}

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
     * @param mappings - Field-to-location mappings (if not provided, derived from EntityField.ExtendedType metadata)
     */
    public async SyncIfChanged(entity: BaseEntity, mappings?: GeoFieldMapping[]): Promise<void> {
        const resolvedMappings = mappings ?? GeoCodeSyncService.BuildMappingsFromMetadata(entity.EntityInfo);
        for (const mapping of resolvedMappings) {
            try {
                await this.ProcessMapping(entity, mapping);
            } catch (e: unknown) {
                const message = e instanceof Error ? e.message : String(e);
                LogError(`GeoCodeSyncService: Error processing ${mapping.LocationType} for ${entity.EntityInfo.Name} ${entity.PrimaryKey.ToString()}: ${message}`);
            }
        }
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
     * Process a single field mapping for a single entity record.
     */
    protected async ProcessMapping(entity: BaseEntity, mapping: GeoFieldMapping): Promise<void> {
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
            mapping.LocationType
        );

        if (existing && existing.SourceFieldHash === hash && existing.Status === 'success') {
            return; // No change, already geocoded successfully
        }

        // Upsert a pending row
        const row = existing ?? await this.CreateGeoCodeRow(
            entity.EntityInfo.ID,
            recordId,
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
     * Perform the actual geocoding using a priority-based strategy:
     *
     * 1. Native lat/lng fields → copy directly (GeocodingSource = 'native')
     * 2. Address-level fields → external geocoding API (GeocodingSource = 'google')
     * 3. Country/state only → reference table centroid lookup (GeocodingSource = 'reference_data')
     */
    protected async Geocode(
        entity: BaseEntity,
        mapping: GeoFieldMapping
    ): Promise<GeocodeResult | null> {
        const fields = mapping.Fields;

        // Strategy 1: Check for native lat/lng fields (ExtendedType = GeoLatitude/GeoLongitude)
        const latField = entity.EntityInfo.Fields.find(f => f.ExtendedType === 'GeoLatitude');
        const lngField = entity.EntityInfo.Fields.find(f => f.ExtendedType === 'GeoLongitude');
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

        // Strategy 2: Google Geocoding API (if API key is available)
        const apiKey = this.getGoogleApiKey();
        if (apiKey) {
            const addressString = this.buildAddressString(geoValues);
            if (addressString) {
                const googleResult = await this.geocodeViaGoogle(addressString, apiKey);
                if (googleResult) {
                    // Resolve country/state IDs from Google's response
                    await this.resolveReferenceIDs(googleResult, entity);
                    return googleResult;
                }
            }
        }

        // Strategy 3: Reference data centroid lookup (country/state → approximate lat/lng)
        return this.geocodeViaReferenceData(geoValues);
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
     * Call the Google Geocoding API to convert an address string to coordinates.
     */
    private async geocodeViaGoogle(address: string, apiKey: string): Promise<GeocodeResult | null> {
        try {
            const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
            const response = await fetch(url);
            if (!response.ok) {
                LogError(`GeoCodeSyncService: Google API HTTP error: ${response.status}`);
                return null;
            }

            const data = await response.json() as GoogleGeocodingResponse;
            if (data.status !== 'OK' || !data.results?.length) {
                LogStatus(`GeoCodeSyncService: Google returned status "${data.status}" for "${address}"`);
                return null;
            }

            const result = data.results[0];
            const locationType = result.geometry.location_type;

            // Map Google's location_type to our precision enum
            let precision: GeocodePrecision = 'city';
            if (locationType === 'ROOFTOP') precision = 'exact';
            else if (locationType === 'RANGE_INTERPOLATED') precision = 'exact';
            else if (locationType === 'GEOMETRIC_CENTER') precision = 'city';
            else if (locationType === 'APPROXIMATE') precision = 'state_province';

            return {
                Latitude: result.geometry.location.lat,
                Longitude: result.geometry.location.lng,
                Precision: precision,
                CountryID: null,     // resolved in resolveReferenceIDs
                StateProvinceID: null, // resolved in resolveReferenceIDs
                Source: 'google'
            };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`GeoCodeSyncService: Google geocoding error: ${msg}`);
            return null;
        }
    }

    /**
     * Resolve CountryID and StateProvinceID from entity geo field values
     * against the reference Country/StateProvince tables.
     */
    private async resolveReferenceIDs(result: GeocodeResult, entity: BaseEntity): Promise<void> {
        const geoValues = this.extractGeoFieldValues(entity);
        const rv = new RunView();

        // Resolve country
        const countryVal = geoValues['GeoCountry'];
        if (countryVal) {
            const countryResult = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Countries',
                ExtraFilter: `Name = '${countryVal.replace(/'/g, "''")}' OR ISO2 = '${countryVal.replace(/'/g, "''")}' OR ISO3 = '${countryVal.replace(/'/g, "''")}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                MaxRows: 1
            });
            if (countryResult.Success && countryResult.Results.length > 0) {
                result.CountryID = countryResult.Results[0].ID;

                // Resolve state within this country
                const stateVal = geoValues['GeoStateProvince'];
                if (stateVal) {
                    const stateResult = await rv.RunView<{ ID: string }>({
                        EntityName: 'MJ: State Provinces',
                        ExtraFilter: `CountryID = '${result.CountryID}' AND (Name = '${stateVal.replace(/'/g, "''")}' OR Code = '${stateVal.replace(/'/g, "''")}')`,
                        Fields: ['ID'],
                        ResultType: 'simple',
                        MaxRows: 1
                    });
                    if (stateResult.Success && stateResult.Results.length > 0) {
                        result.StateProvinceID = stateResult.Results[0].ID;
                    }
                }
            }
        }
    }

    /**
     * Fallback geocoding using reference table centroids.
     * Looks up Country/StateProvince by name and returns their centroid coordinates.
     */
    private async geocodeViaReferenceData(geoValues: Record<string, string>): Promise<GeocodeResult | null> {
        const rv = new RunView();
        const countryVal = geoValues['GeoCountry'];
        const stateVal = geoValues['GeoStateProvince'];

        if (!countryVal && !stateVal) {
            return null;
        }

        // Try state-level first (more precise)
        if (countryVal && stateVal) {
            const countryResult = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Countries',
                ExtraFilter: `Name = '${countryVal.replace(/'/g, "''")}' OR ISO2 = '${countryVal.replace(/'/g, "''")}' OR ISO3 = '${countryVal.replace(/'/g, "''")}'`,
                Fields: ['ID'],
                ResultType: 'simple',
                MaxRows: 1
            });
            if (countryResult.Success && countryResult.Results.length > 0) {
                const countryID = countryResult.Results[0].ID;
                const stateResult = await rv.RunView<{ ID: string; Latitude: number; Longitude: number }>({
                    EntityName: 'MJ: State Provinces',
                    ExtraFilter: `CountryID = '${countryID}' AND (Name = '${stateVal.replace(/'/g, "''")}' OR Code = '${stateVal.replace(/'/g, "''")}')`,
                    Fields: ['ID', 'Latitude', 'Longitude'],
                    ResultType: 'simple',
                    MaxRows: 1
                });
                if (stateResult.Success && stateResult.Results.length > 0) {
                    const state = stateResult.Results[0];
                    if (state.Latitude != null && state.Longitude != null) {
                        return {
                            Latitude: state.Latitude,
                            Longitude: state.Longitude,
                            Precision: 'state_province',
                            CountryID: countryID,
                            StateProvinceID: state.ID,
                            Source: 'reference_data'
                        };
                    }
                }
            }
        }

        // Fall back to country-level centroid
        if (countryVal) {
            const countryResult = await rv.RunView<{ ID: string; Latitude: number; Longitude: number }>({
                EntityName: 'MJ: Countries',
                ExtraFilter: `Name = '${countryVal.replace(/'/g, "''")}' OR ISO2 = '${countryVal.replace(/'/g, "''")}' OR ISO3 = '${countryVal.replace(/'/g, "''")}'`,
                Fields: ['ID', 'Latitude', 'Longitude'],
                ResultType: 'simple',
                MaxRows: 1
            });
            if (countryResult.Success && countryResult.Results.length > 0) {
                const country = countryResult.Results[0];
                if (country.Latitude != null && country.Longitude != null) {
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
        }

        return null;
    }

    /**
     * Get the Google Geocoding API key from config or environment.
     */
    private getGoogleApiKey(): string | null {
        // Check environment variables
        const envKey = process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
        if (envKey) return envKey;

        // Try mj.config.cjs via cosmiconfig pattern
        try {
            // Dynamic import to avoid hard dependency on cosmiconfig
            const configVal = (globalThis as Record<string, unknown>)['__mj_config_apiIntegrations'] as Record<string, Record<string, Record<string, string>>> | undefined;
            return configVal?.google?.geocoding?.apiKey ?? null;
        } catch {
            return null;
        }
    }
}
