import { BaseSingleton } from '@memberjunction/global';
import { BaseEntity, EntityFieldInfo, EntityInfo, Metadata, RunView, UserInfo, LogError } from '@memberjunction/core';
import { MJRecordGeoCodeEntity, MJGeoAddressCacheEntity, GeoDataEngine } from '@memberjunction/core-entities';
import { GeoFieldMapping, GeocodeResult, GeocodeStatus, GeocodePrecision, GeocodingSource, GeoSyncOptions, GeocodeMemo, AddressLookupOutcome } from './types';
import { ComputeGeoSourceHash, NormalizeAddress, ComputeAddressHash } from './hash';
import { GeocodingProviderRegistry, GeocodeRequest, IGeocodingProvider, ProviderGeocodeResult } from './providers';

/**
 * Singleton service that manages the geocoding lifecycle for entity records.
 * Called by CodeGen-generated AfterSave hooks on geo-enabled entities.
 *
 * Responsibilities:
 * - Computes source field hashes for change detection
 * - Checks existing RecordGeoCode rows for staleness
 * - Dispatches geocoding through a layered lookup path:
 *   in-run memo → persistent GeoAddressCache → external provider
 * - Upserts RecordGeoCode rows with results or error status
 *
 * ## Address-level caching
 * External provider calls are the expensive step, so results are shared at the
 * *address* level (not just per-record):
 * - **Persistent cache** — `MJ: Geo Address Caches`, keyed by SHA-256 of the
 *   normalized address string. Any record in any entity whose address was
 *   previously geocoded reuses the stored result. Writes are gated on the
 *   provider's `AllowsPersistentStorage` ToS flag; reads are unconditional.
 *   Negative results are cached with a TTL (see NEGATIVE_CACHE_TTL_MS) so
 *   unresolvable addresses aren't retried on every run, but are re-attempted
 *   eventually.
 * - **In-run memo** — callers processing many records (the Scheduled Geocoding
 *   action) pass a {@link GeocodeMemo} via options so duplicate addresses in
 *   one run — including concurrent duplicates inside a parallel batch —
 *   coalesce into a single cache read / provider call.
 *
 * All geocoding is fire-and-forget — errors are captured in RecordGeoCode
 * and retried by the scheduled geocoding job. Never throws.
 */
export class GeoCodeSyncService extends BaseSingleton<GeoCodeSyncService> {
    /**
     * How long a negative (not_geocodable) GeoAddressCache entry suppresses
     * re-attempts for the same address. After expiry the next lookup goes back
     * to the provider (addresses occasionally become resolvable as provider
     * data improves).
     */
    private static readonly NEGATIVE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    public constructor() {
        super();
    }

    public static get Instance(): GeoCodeSyncService {
        return GeoCodeSyncService.getInstance<GeoCodeSyncService>();
    }

    /**
     * Check if any geo field mappings have changed and dispatch geocoding if needed.
     * Called from the GenericDatabaseProvider OnSaveCompleted hook and the
     * Scheduled Geocoding action.
     *
     * This method never throws — all errors are captured in RecordGeoCode rows.
     *
     * @param entity - The entity instance that was just saved
     * @param contextUser - The user context for data operations
     * @param options - Optional behavior overrides; see {@link GeoSyncOptions}
     * @returns The geocode result from the first successfully geocoded mapping, or null
     *          if no geocoding was performed (e.g., hash unchanged) or all attempts failed.
     *          The caller can use this to patch virtual lat/lng fields on the entity's
     *          SP result before finalizeSave() loads it into the entity object.
     */
    public async SyncIfChanged(
        entity: BaseEntity,
        contextUser: UserInfo,
        options?: GeoSyncOptions
    ): Promise<GeocodeResult | null> {
        const resolvedMappings = options?.mappings ?? GeoCodeSyncService.BuildMappingsFromMetadata(entity.EntityInfo);
        if (resolvedMappings.length === 0) return null;

        // GeoDataEngine is loaded on-demand (no @RegisterForStartup). Config() is idempotent —
        // concurrent calls dedup, and repeated calls after load return immediately. Both
        // resolveReferenceIDs() and geocodeViaReferenceData() rely on the in-memory maps
        // populated by this load, so await it before any per-mapping processing.
        await GeoDataEngine.Instance.Config(false, contextUser);

        const provider = GeocodingProviderRegistry.Instance.Resolve(options?.providerName);

        for (const mapping of resolvedMappings) {
            try {
                const result = await this.ProcessMapping(entity, mapping, contextUser, provider, options);
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
     * Process a single field mapping for a single entity record.
     * @returns The geocode result if geocoding was performed successfully, or null if
     *          no geocoding was needed (hash unchanged) or the attempt failed.
     */
    protected async ProcessMapping(
        entity: BaseEntity,
        mapping: GeoFieldMapping,
        contextUser: UserInfo,
        provider?: IGeocodingProvider | null,
        options?: GeoSyncOptions
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
            contextUser
        );

        if (existing && existing.SourceFieldHash === hash && existing.Status === 'success') {
            // No change, already geocoded successfully. When the caller runs a
            // SQL-side staleness sweep (source __mj_UpdatedAt > GeocodedAt), refresh
            // GeocodedAt so this row exits the sweep filter instead of being
            // re-verified on every future run.
            if (options?.touchOnHashMatch) {
                existing.GeocodedAt = new Date();
                const touched = await existing.Save();
                if (!touched) {
                    LogError(`GeoCodeSyncService: Failed to refresh GeocodedAt on hash match: ${existing.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
            return null;
        }

        // Upsert the pending row. New rows carry hash + pending status on the
        // INSERT itself (one write); existing rows need an UPDATE to reset them
        // for the fresh attempt.
        let row: MJRecordGeoCodeEntity | null;
        if (existing) {
            existing.SourceFieldHash = hash;
            existing.Status = 'pending' as GeocodeStatus;
            existing.RetryCount = 0; // Reset retries — fresh attempt for new/changed address
            existing.GeocodedAt = new Date();
            const pendingSaved = await existing.Save();
            if (!pendingSaved) {
                LogError(`GeoCodeSyncService: Failed to save pending RecordGeoCode: ${existing.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                return null;
            }
            row = existing;
        } else {
            row = await this.CreateGeoCodeRow(entity.EntityInfo.ID, recordId, mapping.LocationType, hash, contextUser);
            if (!row) {
                LogError(`GeoCodeSyncService: Failed to create/find RecordGeoCode row`);
                return null;
            }
        }

        // Attempt geocoding
        try {
            const result = await this.Geocode(entity, mapping, contextUser, provider, options?.memo);
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
     * Single indexed point lookup against UQ(EntityID, RecordID, LocationType).
     */
    protected async FindExistingGeoCode(
        entityID: string,
        recordID: string,
        locationType: string,
        contextUser: UserInfo
    ): Promise<MJRecordGeoCodeEntity | null> {
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
     * Create a new RecordGeoCode row carrying the source hash and pending status
     * on the INSERT itself (avoids a separate follow-up UPDATE). If the insert
     * fails due to a unique constraint (race condition from concurrent batch
     * geocoding), falls back to loading the existing row and resetting it for
     * this attempt.
     */
    protected async CreateGeoCodeRow(
        entityID: string,
        recordID: string,
        locationType: string,
        sourceFieldHash: string,
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
        row.SourceFieldHash = sourceFieldHash;
        row.GeocodedAt = new Date();
        const saved = await row.Save();
        if (!saved) {
            // Likely a UNIQUE KEY violation from a concurrent batch — another thread
            // created the row between our FindExistingGeoCode check and this INSERT.
            // Fall back to loading the existing row and resetting it for this attempt.
            const existing = await this.FindExistingGeoCode(entityID, recordID, locationType, contextUser);
            if (existing) {
                existing.SourceFieldHash = sourceFieldHash;
                existing.Status = 'pending';
                existing.RetryCount = 0;
                existing.GeocodedAt = new Date();
                const resetSaved = await existing.Save();
                if (resetSaved) return existing;
            }

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
     * 2. Address-level fields → in-run memo → persistent GeoAddressCache →
     *    configured external geocoding provider
     *    (GeocodingSource = the provider that originally produced the result)
     * 3. Country/state only → reference table centroid lookup (GeocodingSource = 'reference_data')
     *
     * @param provider The resolved geocoding provider to use for strategy 2.
     *        When null, strategy 2 is skipped and we fall through to reference data.
     * @param memo Optional in-run memo coalescing duplicate-address lookups.
     */
    protected async Geocode(
        entity: BaseEntity,
        _mapping: GeoFieldMapping,
        contextUser: UserInfo,
        provider?: IGeocodingProvider | null,
        memo?: GeocodeMemo
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

        // Strategy 2: memo → persistent address cache → external provider
        const activeProvider = provider ?? GeocodingProviderRegistry.Instance.Resolve();
        if (activeProvider) {
            const addressString = this.buildAddressString(geoValues);
            if (addressString) {
                const outcome = await this.resolveAddress(addressString, geoValues, activeProvider, contextUser, memo);
                if (outcome.Result) {
                    const result = this.mapProviderResult(outcome.Result, outcome.SourceProvider as GeocodingSource);
                    this.resolveReferenceIDs(result, entity);
                    return result;
                }
                // outcome.Result === null → the address is not geocodable (live
                // provider miss or cached negative). Fall through to strategy 3,
                // matching the pre-cache behavior for provider misses.
            }
        }

        // Strategy 3: Reference data centroid lookup (country/state → approximate lat/lng)
        return this.geocodeViaReferenceData(geoValues);
    }

    // ================================================================
    // Address-level lookup: memo → persistent cache → provider
    // ================================================================

    /**
     * Resolve an address through the in-run memo. Duplicate addresses (including
     * concurrent duplicates inside a parallel batch) share one underlying
     * lookup promise. Transient provider errors are NOT memoized — the memo
     * entry is removed on rejection so later records retry.
     */
    private resolveAddress(
        addressString: string,
        geoValues: Record<string, string>,
        provider: IGeocodingProvider,
        contextUser: UserInfo,
        memo?: GeocodeMemo
    ): Promise<AddressLookupOutcome> {
        const normalized = NormalizeAddress(addressString);
        const memoKey = `${provider.Name}|${normalized}`;

        const memoized = memo?.get(memoKey);
        if (memoized) return memoized;

        const promise = this.lookupOrGeocodeAddress(addressString, normalized, geoValues, provider, contextUser);
        if (memo) {
            memo.set(memoKey, promise);
            promise.catch(() => memo.delete(memoKey));
        }
        return promise;
    }

    /**
     * The un-memoized address lookup: persistent GeoAddressCache first, then the
     * external provider with write-through (gated on the provider's
     * AllowsPersistentStorage ToS flag).
     *
     * @throws on transient provider errors (network etc.) — the caller marks the
     *         record 'failed' for retry, same as a direct provider call.
     */
    private async lookupOrGeocodeAddress(
        addressString: string,
        normalizedAddress: string,
        geoValues: Record<string, string>,
        provider: IGeocodingProvider,
        contextUser: UserInfo
    ): Promise<AddressLookupOutcome> {
        const addressHash = ComputeAddressHash(normalizedAddress);

        // 1) Persistent cache — read is unconditional (entries were stored under a
        //    storage-permitting provider's ToS; reusing them is fine regardless of
        //    which provider is configured for this run).
        const cached = await this.lookupAddressCache(addressHash, contextUser);
        if (cached) {
            if (cached.Status === 'success' && cached.Latitude != null && cached.Longitude != null) {
                return {
                    Result: this.cacheRowToProviderResult(cached, cached.Latitude, cached.Longitude),
                    SourceProvider: cached.GeocodingSource ?? provider.Name,
                    FromCache: true
                };
            }
            const negativeStillValid = cached.Status === 'not_geocodable' &&
                (cached.ExpiresAt == null || cached.ExpiresAt.getTime() > Date.now());
            if (negativeStillValid) {
                return { Result: null, SourceProvider: cached.GeocodingSource ?? provider.Name, FromCache: true };
            }
            // Expired negative entry — re-attempt with the provider and refresh the row below.
        }

        // 2) External provider. Throws on transient API errors (propagated to caller).
        // The provider receives the ORIGINAL-cased address string (normalization is
        // only for cache keys) so provider behavior is identical to a direct call.
        const request: GeocodeRequest = {
            AddressString: addressString,
            Address: geoValues['GeoAddress'],
            City: geoValues['GeoCity'],
            StateProvince: geoValues['GeoStateProvince'],
            PostalCode: geoValues['GeoPostalCode'],
            Country: geoValues['GeoCountry']
        };
        const providerResult = await provider.Geocode(request);

        // 3) Write-through — only when the provider's ToS permits persistent storage.
        if (provider.AllowsPersistentStorage) {
            await this.writeAddressCache(addressHash, normalizedAddress, providerResult, provider.Name, contextUser, cached);
        }

        return { Result: providerResult, SourceProvider: provider.Name, FromCache: false };
    }

    /**
     * Point lookup of a GeoAddressCache row by address hash (unique index).
     * BypassCache is set because these one-off, per-address fingerprints would
     * otherwise accumulate in the server-side RunView cache. Never throws —
     * cache infrastructure problems must not break geocoding.
     */
    private async lookupAddressCache(
        addressHash: string,
        contextUser: UserInfo
    ): Promise<MJGeoAddressCacheEntity | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<MJGeoAddressCacheEntity>({
                EntityName: 'MJ: Geo Address Caches',
                ExtraFilter: `AddressHash='${addressHash}'`,
                MaxRows: 1,
                ResultType: 'entity_object',
                BypassCache: true
            }, contextUser);
            return result.Success && result.Results.length > 0 ? result.Results[0] : null;
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`GeoCodeSyncService: GeoAddressCache lookup failed (degrading to provider call): ${message}`);
            return null;
        }
    }

    /**
     * Write-through to the persistent address cache. Creates a new row or
     * refreshes the one found during lookup (e.g., an expired negative entry).
     * Negative results get an ExpiresAt TTL; successes never expire. Never
     * throws — a failed cache write (including benign unique-violation races
     * from concurrent batches) must not break geocoding.
     */
    private async writeAddressCache(
        addressHash: string,
        normalizedAddress: string,
        result: ProviderGeocodeResult | null,
        providerName: string,
        contextUser: UserInfo,
        existingRow: MJGeoAddressCacheEntity | null
    ): Promise<void> {
        try {
            let row = existingRow;
            if (!row) {
                const md = new Metadata();  // global-provider-ok: sync service — single-provider context
                row = await md.GetEntityObject<MJGeoAddressCacheEntity>('MJ: Geo Address Caches', contextUser);
                row.NewRecord();
                row.AddressHash = addressHash;
            }
            row.NormalizedAddress = normalizedAddress.substring(0, 1000);
            if (result) {
                row.Status = 'success';
                row.Latitude = result.Latitude;
                row.Longitude = result.Longitude;
                row.Precision = result.Precision;
                row.Confidence = result.Confidence;
                row.FormattedAddress = result.FormattedAddress ? result.FormattedAddress.substring(0, 500) : null;
                row.ExpiresAt = null;
            } else {
                row.Status = 'not_geocodable';
                row.Latitude = null;
                row.Longitude = null;
                row.Precision = null;
                row.Confidence = null;
                row.FormattedAddress = null;
                row.ExpiresAt = new Date(Date.now() + GeoCodeSyncService.NEGATIVE_CACHE_TTL_MS);
            }
            row.GeocodingSource = providerName;
            row.GeocodedAt = new Date();
            const saved = await row.Save();
            if (!saved) {
                // A UNIQUE KEY violation here is a benign race — a concurrent worker
                // cached the same address between our lookup and this insert.
                LogError(`GeoCodeSyncService: Failed to save GeoAddressCache entry: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            LogError(`GeoCodeSyncService: GeoAddressCache write failed (result still used): ${message}`);
        }
    }

    /**
     * Reconstruct a provider-shaped result from a cached GeoAddressCache row.
     * Only the fields the persistence layer consumes (lat/lng/precision) plus
     * debuggability fields are populated; parsed address components are not
     * stored in the cache.
     */
    private cacheRowToProviderResult(
        row: MJGeoAddressCacheEntity,
        latitude: number,
        longitude: number
    ): ProviderGeocodeResult {
        return {
            Latitude: latitude,
            Longitude: longitude,
            Precision: (row.Precision ?? 'city') as GeocodePrecision,
            Confidence: row.Confidence,
            FormattedAddress: row.FormattedAddress,
            CountryCode: null,
            StateProvinceCode: null,
            StateProvinceName: null,
            City: null,
            PostalCode: null,
            Line1: null,
            Line2: null
        };
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
     * Build an address string suitable for geocoding provider APIs from geo field values.
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
