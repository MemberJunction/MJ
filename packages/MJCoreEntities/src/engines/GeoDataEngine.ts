import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { RegisterForStartup } from "@memberjunction/core";
import { MJCountryEntity, MJStateProvinceEntity } from "../generated/entity_subclasses";

/**
 * GeoDataEngine provides cached, in-memory access to Country and StateProvince
 * reference data. Loaded once at startup via @RegisterForStartup, all lookups
 * are O(1) via pre-built Maps keyed by common lookup patterns.
 *
 * Usage:
 * ```typescript
 * const engine = GeoDataEngine.Instance;
 * const country = engine.GetCountryByISO2('US');
 * const state = engine.GetStateByCode('US-country-id', 'CO');
 * ```
 */
@RegisterForStartup()
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

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
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
