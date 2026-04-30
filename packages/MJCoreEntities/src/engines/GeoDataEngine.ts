import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo, LogStatus } from "@memberjunction/core";
import { MJCountryEntity, MJStateProvinceEntity } from "../generated/entity_subclasses";

/**
 * Pre-parsed polygon geometry with bounding box for fast point-in-polygon testing.
 * Each entry represents one ring (outer boundary or hole) of a GeoJSON polygon.
 */
interface ParsedPolygon {
    /** Coordinate rings: each ring is an array of [lng, lat] pairs */
    rings: number[][][];
    /** Bounding box for fast rejection: [minLng, minLat, maxLng, maxLat] */
    bbox: [number, number, number, number];
}

/**
 * Cached geometry for a state/province or country, parsed once from BoundaryGeoJSON.
 * A single boundary can have multiple polygons (MultiPolygon — islands, exclaves, etc.).
 */
interface CachedGeometry {
    /** The entity ID this geometry belongs to */
    entityId: string;
    /** All polygons in this boundary (supports Polygon and MultiPolygon) */
    polygons: ParsedPolygon[];
    /** Overall bounding box across all polygons: [minLng, minLat, maxLng, maxLat] */
    bbox: [number, number, number, number];
}

/**
 * Result of a point-in-polygon resolution.
 */
export interface GeoPointResolution {
    /** The matched country, if any */
    Country: MJCountryEntity | undefined;
    /** The matched state/province, if any */
    State: MJStateProvinceEntity | undefined;
}

/**
 * GeoDataEngine provides cached, in-memory access to Country and StateProvince
 * reference data, plus point-in-polygon resolution against country/state boundaries.
 * All lookups are O(1) via pre-built Maps keyed by common lookup patterns.
 *
 * **Loaded on demand**, not at app startup. The dataset is large (~3,000+ rows
 * with BoundaryGeoJSON blobs) and parsing the geometry takes ~3–4s synchronously,
 * so we only pay that cost when geocoding or geo lookups are actually needed.
 *
 * **Caller contract**: `await GeoDataEngine.Instance.Config(...)` once before
 * calling any sync lookup method. `Config()` is idempotent — concurrent calls
 * dedup against a single in-flight load (see `BaseEngine.Load`), and repeated
 * calls after load complete return immediately. If no entity in the tenant has
 * `SupportsGeoCoding=1`, `Config()` returns early and lookups will return
 * `undefined` — callers already handle the not-found case so the empty state
 * is safe to leave in place.
 *
 * Usage:
 * ```typescript
 * await GeoDataEngine.Instance.Config(false, contextUser);
 * const country = GeoDataEngine.Instance.GetCountryByISO2('US');
 * const state = GeoDataEngine.Instance.GetStateByCode(country.ID, 'CO');
 * ```
 */
export class GeoDataEngine extends BaseEngine<GeoDataEngine> {
    public static get Instance(): GeoDataEngine {
        return super.getInstance<GeoDataEngine>();
    }

    private _countries: MJCountryEntity[] = [];
    private _stateProvinces: MJStateProvinceEntity[] = [];

    // Pre-built lookup Maps for O(1) access
    private _countriesByISO2 = new Map<string, MJCountryEntity>();
    private _countriesByISO3 = new Map<string, MJCountryEntity>();
    private _countriesByName = new Map<string, MJCountryEntity>();
    private _countriesById = new Map<string, MJCountryEntity>();
    private _statesByCountryAndCode = new Map<string, MJStateProvinceEntity>();
    private _statesByCountryAndName = new Map<string, MJStateProvinceEntity>();
    private _statesById = new Map<string, MJStateProvinceEntity>();

    // Pre-parsed geometry caches for point-in-polygon testing
    private _countryGeometries: CachedGeometry[] = [];
    private _stateGeometries: CachedGeometry[] = [];
    /** Maps countryId → array of state geometries for that country */
    private _stateGeometriesByCountry = new Map<string, CachedGeometry[]>();

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        // Skip the load entirely if no entity in this tenant has SupportsGeoCoding=1.
        // The country/state-province dataset is large (~3,000+ rows with BoundaryGeoJSON
        // blobs) and parsing the geometry for point-in-polygon takes ~3-4s synchronously.
        // None of that work is useful unless at least one entity opts into geocoding.
        const entities = (provider ?? this.ProviderToUse)?.Entities;
        if (entities && !entities.some(e => e.SupportsGeoCoding)) {
            LogStatus('GeoDataEngine: no entities have SupportsGeoCoding=1 — skipping country/state-province load and geometry parsing');
            return;
        }

        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Countries',
                PropertyName: '_countries',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: State Provinces',
                PropertyName: '_stateProvinces',
                CacheLocal: true,
            }
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        this.buildLookupMaps();
        // Use synchronous main-thread parsing. The Web Worker approach was slower because
        // postMessage structured-clone of 3,092 parsed polygons back to main thread took
        // 11+ seconds, blocking all other engines' promise continuations.
        this.buildGeometryCachesSync();
    }

    // ================================================================
    // Cached data getters
    // ================================================================

    public get Countries(): MJCountryEntity[] {
        return this._countries || [];
    }

    public get StateProvinces(): MJStateProvinceEntity[] {
        return this._stateProvinces || [];
    }

    // ================================================================
    // Country lookups — all O(1)
    // ================================================================

    public GetCountryByISO2(iso2: string): MJCountryEntity | undefined {
        if (!iso2) return undefined;
        return this._countriesByISO2.get(iso2.trim().toUpperCase());
    }

    public GetCountryByISO3(iso3: string): MJCountryEntity | undefined {
        if (!iso3) return undefined;
        return this._countriesByISO3.get(iso3.trim().toUpperCase());
    }

    public GetCountryByName(name: string): MJCountryEntity | undefined {
        if (!name) return undefined;
        return this._countriesByName.get(name.trim().toLowerCase());
    }

    public GetCountryById(id: string): MJCountryEntity | undefined {
        if (!id) return undefined;
        return this._countriesById.get(id.toLowerCase());
    }

    /**
     * Resolve a country from a text value that could be a name, ISO2, or ISO3 code.
     * Tries ISO2 first (most common), then ISO3, then name match.
     */
    public ResolveCountry(value: string): MJCountryEntity | undefined {
        if (!value) return undefined;
        const trimmed = value.trim();
        // Try ISO2 (2-char codes like "US", "GB")
        if (trimmed.length === 2) {
            const byISO2 = this.GetCountryByISO2(trimmed);
            if (byISO2) return byISO2;
        }
        // Try ISO3 (3-char codes like "USA", "GBR")
        if (trimmed.length === 3) {
            const byISO3 = this.GetCountryByISO3(trimmed);
            if (byISO3) return byISO3;
        }
        // Try name match
        return this.GetCountryByName(trimmed);
    }

    // ================================================================
    // State/Province lookups — all O(1)
    // ================================================================

    /**
     * Look up a state/province by its Code within a specific country.
     * @param countryId - The country's UUID
     * @param code - The state/province code (e.g., "CO", "ON", "NSW")
     */
    public GetStateByCode(countryId: string, code: string): MJStateProvinceEntity | undefined {
        if (!countryId || !code) return undefined;
        const key = `${countryId.toLowerCase()}|${code.trim().toUpperCase()}`;
        return this._statesByCountryAndCode.get(key);
    }

    /**
     * Look up a state/province by its Name within a specific country.
     * @param countryId - The country's UUID
     * @param name - The state/province name (e.g., "Colorado", "Ontario")
     */
    public GetStateByName(countryId: string, name: string): MJStateProvinceEntity | undefined {
        if (!countryId || !name) return undefined;
        const key = `${countryId.toLowerCase()}|${name.trim().toLowerCase()}`;
        return this._statesByCountryAndName.get(key);
    }

    public GetStateById(id: string): MJStateProvinceEntity | undefined {
        if (!id) return undefined;
        return this._statesById.get(id.toLowerCase());
    }

    /**
     * Resolve a state/province from a text value within a country.
     * Tries code first, then name match.
     */
    public ResolveState(countryId: string, value: string): MJStateProvinceEntity | undefined {
        if (!countryId || !value) return undefined;
        const byCode = this.GetStateByCode(countryId, value);
        if (byCode) return byCode;
        return this.GetStateByName(countryId, value);
    }

    // ================================================================
    // Point-in-polygon resolution — coordinate-based lookups
    // ================================================================

    /**
     * Resolve a lat/lng coordinate to its containing country and state/province
     * using point-in-polygon testing against cached BoundaryGeoJSON data.
     * No text matching — purely geometric.
     *
     * @param lat - Latitude (-90 to 90)
     * @param lng - Longitude (-180 to 180)
     * @returns The matched country and state/province, or undefined for each if no match
     */
    public ResolvePointToLocation(lat: number, lng: number): GeoPointResolution {
        const country = this.ResolvePointToCountry(lat, lng);
        const state = country ? this.ResolvePointToState(lat, lng, country.ID) : undefined;
        return { Country: country, State: state };
    }

    /**
     * Resolve a lat/lng coordinate to its containing country.
     * Uses bounding-box pre-filtering then ray-casting point-in-polygon.
     */
    public ResolvePointToCountry(lat: number, lng: number): MJCountryEntity | undefined {
        for (const geom of this._countryGeometries) {
            if (this.pointInCachedGeometry(lat, lng, geom)) {
                return this._countriesById.get(geom.entityId);
            }
        }
        return undefined;
    }

    /**
     * Resolve a lat/lng coordinate to its containing state/province within a known country.
     * If countryId is not provided, resolves the country first.
     */
    public ResolvePointToState(lat: number, lng: number, countryId?: string): MJStateProvinceEntity | undefined {
        let resolvedCountryId = countryId?.toLowerCase();
        if (!resolvedCountryId) {
            const country = this.ResolvePointToCountry(lat, lng);
            if (!country) return undefined;
            resolvedCountryId = country.ID.toLowerCase();
        }

        const stateGeoms = this._stateGeometriesByCountry.get(resolvedCountryId);
        if (!stateGeoms) return undefined;

        for (const geom of stateGeoms) {
            if (this.pointInCachedGeometry(lat, lng, geom)) {
                return this._statesById.get(geom.entityId);
            }
        }
        return undefined;
    }

    /**
     * Batch-resolve multiple lat/lng points in parallel.
     * Each point is resolved independently — ideal for choropleth grouping.
     *
     * @param points - Array of {lat, lng} coordinates
     * @returns Array of GeoPointResolution in the same order as input
     */
    public ResolvePoints(points: { lat: number; lng: number }[]): GeoPointResolution[] {
        return points.map(p => this.ResolvePointToLocation(p.lat, p.lng));
    }

    // ================================================================
    // Private — point-in-polygon geometry
    // ================================================================

    /**
     * Test if a point falls inside a CachedGeometry (bbox pre-filter + ray-casting).
     */
    private pointInCachedGeometry(lat: number, lng: number, geom: CachedGeometry): boolean {
        // Fast rejection via overall bounding box
        if (!this.pointInBBox(lat, lng, geom.bbox)) return false;

        // Test each polygon (MultiPolygon support)
        for (const poly of geom.polygons) {
            if (!this.pointInBBox(lat, lng, poly.bbox)) continue;
            if (this.pointInPolygonRings(lat, lng, poly.rings)) return true;
        }
        return false;
    }

    /**
     * Check if a point is inside a bounding box.
     * BBox format: [minLng, minLat, maxLng, maxLat]
     */
    private pointInBBox(lat: number, lng: number, bbox: [number, number, number, number]): boolean {
        return lng >= bbox[0] && lat >= bbox[1] && lng <= bbox[2] && lat <= bbox[3];
    }

    /**
     * Ray-casting point-in-polygon for a polygon with rings.
     * First ring is the outer boundary (must be inside).
     * Subsequent rings are holes (must NOT be inside).
     */
    private pointInPolygonRings(lat: number, lng: number, rings: number[][][]): boolean {
        if (rings.length === 0) return false;

        // Must be inside the outer ring
        if (!this.rayCast(lat, lng, rings[0])) return false;

        // Must NOT be inside any hole
        for (let i = 1; i < rings.length; i++) {
            if (this.rayCast(lat, lng, rings[i])) return false;
        }
        return true;
    }

    /**
     * Ray-casting algorithm: cast a horizontal ray from the point eastward,
     * count how many polygon edges it crosses. Odd = inside.
     * Coordinates are [lng, lat] pairs (GeoJSON convention).
     */
    private rayCast(lat: number, lng: number, ring: number[][]): boolean {
        let inside = false;
        const n = ring.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = ring[i][0], yi = ring[i][1]; // lng, lat of vertex i
            const xj = ring[j][0], yj = ring[j][1]; // lng, lat of vertex j

            // Check if the ray crosses this edge
            if ((yi > lat) !== (yj > lat) &&
                lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    // ================================================================
    // Private — geometry cache building (Web Worker accelerated)
    // ================================================================

    /**
     * The Web Worker source code for GeoJSON parsing. This is embedded as a string
     * so we can create an inline Worker via Blob URL — no separate file needed.
     * The worker receives raw BoundaryGeoJSON strings and returns parsed geometries.
     */
    private static readonly GEO_WORKER_SOURCE = `
        function parsePolygonCoordinates(coordinates) {
            if (!coordinates || coordinates.length === 0) return null;
            let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
            for (const point of coordinates[0]) {
                if (point[0] < minLng) minLng = point[0];
                if (point[1] < minLat) minLat = point[1];
                if (point[0] > maxLng) maxLng = point[0];
                if (point[1] > maxLat) maxLat = point[1];
            }
            return { rings: coordinates, bbox: [minLng, minLat, maxLng, maxLat] };
        }

        function parseEntityBoundary(entityId, boundaryGeoJSON) {
            if (!boundaryGeoJSON) return null;
            try {
                const raw = typeof boundaryGeoJSON === 'string' ? JSON.parse(boundaryGeoJSON) : boundaryGeoJSON;
                const geometry = raw.type === 'Feature' ? raw.geometry : raw;
                if (!geometry || !geometry.coordinates) return null;
                const polygons = [];
                if (geometry.type === 'Polygon') {
                    const parsed = parsePolygonCoordinates(geometry.coordinates);
                    if (parsed) polygons.push(parsed);
                } else if (geometry.type === 'MultiPolygon') {
                    for (const polyCoords of geometry.coordinates) {
                        const parsed = parsePolygonCoordinates(polyCoords);
                        if (parsed) polygons.push(parsed);
                    }
                }
                if (polygons.length === 0) return null;
                const overallBbox = [
                    Math.min(...polygons.map(p => p.bbox[0])),
                    Math.min(...polygons.map(p => p.bbox[1])),
                    Math.max(...polygons.map(p => p.bbox[2])),
                    Math.max(...polygons.map(p => p.bbox[3]))
                ];
                return { entityId: entityId.toLowerCase(), polygons, bbox: overallBbox };
            } catch {
                return null;
            }
        }

        self.onmessage = function(e) {
            const { countries, stateProvinces } = e.data;
            const countryGeometries = [];
            const stateGeometries = [];

            for (const c of countries) {
                const geom = parseEntityBoundary(c.id, c.boundaryGeoJSON);
                if (geom) countryGeometries.push(geom);
            }

            for (const s of stateProvinces) {
                const geom = parseEntityBoundary(s.id, s.boundaryGeoJSON);
                if (geom) {
                    geom._countryId = s.countryId.toLowerCase();
                    stateGeometries.push(geom);
                }
            }

            self.postMessage({ countryGeometries, stateGeometries });
        };
    `;

    /**
     * Parse all BoundaryGeoJSON data using a Web Worker (off main thread).
     * Falls back to synchronous parsing if Workers are unavailable.
     */
    private async buildGeometryCachesAsync(): Promise<void> {
        this._countryGeometries = [];
        this._stateGeometries = [];
        this._stateGeometriesByCountry.clear();

        // Try Web Worker first (browser environment)
        if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined') {
            try {
                const result = await this.parseInWorker();
                this._countryGeometries = result.countryGeometries;
                this.indexStateGeometries(result.stateGeometries);

                LogStatus(`GeoDataEngine: parsed ${result.countryGeometries.length} country and ${result.stateGeometries.length} state/province boundaries for point-in-polygon (Web Worker)`);
                return;
            } catch (err) {
                LogStatus(`GeoDataEngine: Web Worker failed (${err instanceof Error ? err.message : String(err)}), falling back to main thread`);
            }
        }

        // Fallback: synchronous parsing on main thread
        this.buildGeometryCachesSync();
    }

    /**
     * Offload GeoJSON parsing to an inline Web Worker.
     * Returns a promise that resolves with the parsed geometry arrays.
     */
    private parseInWorker(): Promise<{ countryGeometries: CachedGeometry[]; stateGeometries: (CachedGeometry & { _countryId?: string })[] }> {
        return new Promise((resolve, reject) => {
            const blob = new Blob([GeoDataEngine.GEO_WORKER_SOURCE], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            const worker = new Worker(url);

            // Timeout — if the worker takes longer than 30s, fall back
            const timeout = setTimeout(() => {
                worker.terminate();
                URL.revokeObjectURL(url);
                reject(new Error('Worker timeout'));
            }, 30000);

            worker.onmessage = (e: MessageEvent) => {
                clearTimeout(timeout);
                worker.terminate();
                URL.revokeObjectURL(url);
                resolve(e.data);
            };

            worker.onerror = (e: ErrorEvent) => {
                clearTimeout(timeout);
                worker.terminate();
                URL.revokeObjectURL(url);
                reject(new Error(e.message));
            };

            // Send raw data to the worker — only the fields needed for parsing
            const countries = this._countries.map(c => ({
                id: c.ID,
                boundaryGeoJSON: c.BoundaryGeoJSON
            }));
            const stateProvinces = this._stateProvinces.map(s => ({
                id: s.ID,
                countryId: s.CountryID,
                boundaryGeoJSON: s.BoundaryGeoJSON
            }));

            worker.postMessage({ countries, stateProvinces });
        });
    }

    /**
     * Index state geometries by country for fast lookup.
     * Used after both worker and sync parsing paths.
     */
    private indexStateGeometries(stateGeometries: (CachedGeometry & { _countryId?: string })[]): void {
        this._stateGeometries = [];
        this._stateGeometriesByCountry.clear();

        for (const geom of stateGeometries) {
            this._stateGeometries.push(geom);
            const countryKey = geom._countryId || '';
            let arr = this._stateGeometriesByCountry.get(countryKey);
            if (!arr) {
                arr = [];
                this._stateGeometriesByCountry.set(countryKey, arr);
            }
            arr.push(geom);
            delete geom._countryId; // Clean up the temporary field
        }
    }

    /**
     * Synchronous fallback for environments without Web Workers (e.g., Node.js, SSR).
     */
    private buildGeometryCachesSync(): void {
        let countryParsed = 0;
        let stateParsed = 0;

        for (const country of this._countries) {
            const geom = this.parseEntityBoundary(country.ID, country.BoundaryGeoJSON);
            if (geom) {
                this._countryGeometries.push(geom);
                countryParsed++;
            }
        }

        const stateGeoms: (CachedGeometry & { _countryId?: string })[] = [];
        for (const state of this._stateProvinces) {
            const geom = this.parseEntityBoundary(state.ID, state.BoundaryGeoJSON);
            if (geom) {
                (geom as any)._countryId = state.CountryID.toLowerCase();
                stateGeoms.push(geom as CachedGeometry & { _countryId?: string });
                stateParsed++;
            }
        }
        this.indexStateGeometries(stateGeoms);

        LogStatus(`GeoDataEngine: parsed ${countryParsed} country and ${stateParsed} state/province boundaries for point-in-polygon (main thread)`);
    }

    /**
     * Parse a BoundaryGeoJSON value into a CachedGeometry.
     * Supports GeoJSON Feature, Polygon, and MultiPolygon types.
     * Returns null if the boundary is missing or unparseable.
     * Used by the synchronous fallback path.
     */
    private parseEntityBoundary(entityId: string, boundaryGeoJSON: string | null): CachedGeometry | null {
        if (!boundaryGeoJSON) return null;

        try {
            const raw = typeof boundaryGeoJSON === 'string' ? JSON.parse(boundaryGeoJSON) : boundaryGeoJSON;
            const geometry = raw.type === 'Feature' ? raw.geometry : raw;

            if (!geometry || !geometry.coordinates) return null;

            const polygons: ParsedPolygon[] = [];

            if (geometry.type === 'Polygon') {
                const parsed = this.parsePolygonCoordinates(geometry.coordinates);
                if (parsed) polygons.push(parsed);
            } else if (geometry.type === 'MultiPolygon') {
                for (const polyCoords of geometry.coordinates) {
                    const parsed = this.parsePolygonCoordinates(polyCoords);
                    if (parsed) polygons.push(parsed);
                }
            }

            if (polygons.length === 0) return null;

            const overallBbox: [number, number, number, number] = [
                Math.min(...polygons.map(p => p.bbox[0])),
                Math.min(...polygons.map(p => p.bbox[1])),
                Math.max(...polygons.map(p => p.bbox[2])),
                Math.max(...polygons.map(p => p.bbox[3]))
            ];

            return { entityId: entityId.toLowerCase(), polygons, bbox: overallBbox };
        } catch {
            return null;
        }
    }

    /**
     * Parse a single Polygon's coordinate rings and compute its bounding box.
     * GeoJSON Polygon coordinates: [ outerRing, ...holeRings ]
     * Each ring is an array of [lng, lat] pairs.
     * Used by the synchronous fallback path.
     */
    private parsePolygonCoordinates(coordinates: number[][][]): ParsedPolygon | null {
        if (!coordinates || coordinates.length === 0) return null;

        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;

        // Compute bbox from the outer ring (first ring)
        for (const point of coordinates[0]) {
            if (point[0] < minLng) minLng = point[0];
            if (point[1] < minLat) minLat = point[1];
            if (point[0] > maxLng) maxLng = point[0];
            if (point[1] > maxLat) maxLat = point[1];
        }

        return {
            rings: coordinates,
            bbox: [minLng, minLat, maxLng, maxLat]
        };
    }

    // ================================================================
    // Private — build O(1) lookup maps
    // ================================================================

    private buildLookupMaps(): void {
        this._countriesByISO2.clear();
        this._countriesByISO3.clear();
        this._countriesByName.clear();
        this._countriesById.clear();
        this._statesByCountryAndCode.clear();
        this._statesByCountryAndName.clear();
        this._statesById.clear();

        for (const c of this._countries) {
            if (c.ISO2) this._countriesByISO2.set(c.ISO2.trim().toUpperCase(), c);
            if (c.ISO3) this._countriesByISO3.set(c.ISO3.trim().toUpperCase(), c);
            if (c.Name) this._countriesByName.set(c.Name.trim().toLowerCase(), c);
            this._countriesById.set(c.ID.toLowerCase(), c);
        }

        for (const s of this._stateProvinces) {
            const countryKey = s.CountryID.toLowerCase();
            if (s.Code) {
                this._statesByCountryAndCode.set(`${countryKey}|${s.Code.trim().toUpperCase()}`, s);
            }
            if (s.Name) {
                this._statesByCountryAndName.set(`${countryKey}|${s.Name.trim().toLowerCase()}`, s);
            }
            this._statesById.set(s.ID.toLowerCase(), s);
        }
    }
}
