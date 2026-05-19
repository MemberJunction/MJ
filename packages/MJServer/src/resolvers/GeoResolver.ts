import { Resolver, Query, Arg, Ctx, ObjectType, Field, InputType, Float, Int } from 'type-graphql';
import { AppContext } from '../types.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { RunView, LogError, Metadata, UserInfo } from '@memberjunction/core';
import { MJCountryEntity, MJStateProvinceEntity } from '@memberjunction/core-entities';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

@ObjectType()
export class GeoCountryResult {
    @Field()
    ID!: string;

    @Field()
    Name!: string;

    @Field()
    ISO2!: string;

    @Field()
    ISO3!: string;

    @Field(() => Float, { nullable: true })
    Latitude!: number | null;

    @Field(() => Float, { nullable: true })
    Longitude!: number | null;
}

@ObjectType()
export class GeoStateProvinceResult {
    @Field()
    ID!: string;

    @Field()
    CountryID!: string;

    @Field()
    Name!: string;

    @Field()
    Code!: string;

    @Field()
    ISO3166_2!: string;

    @Field(() => Float, { nullable: true })
    Latitude!: number | null;

    @Field(() => Float, { nullable: true })
    Longitude!: number | null;
}

@ObjectType()
export class GeoResolveResult {
    @Field()
    Success!: boolean;

    @Field({ nullable: true })
    CountryID?: string;

    @Field({ nullable: true })
    CountryName?: string;

    @Field({ nullable: true })
    StateProvinceID?: string;

    @Field({ nullable: true })
    StateProvinceName?: string;

    @Field(() => Float, { nullable: true })
    Latitude?: number;

    @Field(() => Float, { nullable: true })
    Longitude?: number;

    @Field({ nullable: true })
    ErrorMessage?: string;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * GraphQL resolver for geographic reference data resolution.
 * Provides country/state text-to-reference matching via the GeoResolver service.
 * Used by clients that need to resolve free-text location strings to structured
 * reference data (Country/StateProvince IDs, centroids) without a full geocoding API call.
 */
@Resolver()
export class GeoResolver extends ResolverBase {
    private _countries: MJCountryEntity[] | null = null;
    private _states: MJStateProvinceEntity[] | null = null;

    /**
     * Lazily load all countries into memory (~250 records).
     */
    private async GetCountries(contextUser: UserInfo | undefined): Promise<MJCountryEntity[]> {
        if (this._countries) return this._countries;
        const rv = new RunView();
        const result = await rv.RunView<MJCountryEntity>({
            EntityName: 'MJ: Countries',
            ResultType: 'entity_object'
        }, contextUser);
        if (result.Success) {
            this._countries = result.Results;
        }
        return this._countries ?? [];
    }

    /**
     * Lazily load all state/provinces into memory (~5000 records).
     */
    private async GetStates(contextUser: UserInfo | undefined): Promise<MJStateProvinceEntity[]> {
        if (this._states) return this._states;
        const rv = new RunView();
        const result = await rv.RunView<MJStateProvinceEntity>({
            EntityName: 'MJ: State Provinces',
            ResultType: 'entity_object'
        }, contextUser);
        if (result.Success) {
            this._states = result.Results;
        }
        return this._states ?? [];
    }

    /**
     * Resolve a free-text country string to a Country reference record.
     * Matches by Name, ISO2, ISO3, or CommonAliases.
     */
    @Query(() => GeoResolveResult)
    async ResolveCountry(
        @Arg('input', () => String) input: string,
        @Ctx() { userPayload }: AppContext
    ): Promise<GeoResolveResult> {
        try {
            const user = this.GetUserFromPayload(userPayload);
            const countries = await this.GetCountries(user);
            const normalized = input.trim().toLowerCase();

            // 1. Exact match on Name, ISO2, ISO3
            const exact = countries.find(c =>
                c.Name.toLowerCase() === normalized ||
                c.ISO2.toLowerCase() === normalized ||
                c.ISO3.toLowerCase() === normalized
            );
            if (exact) {
                return {
                    Success: true,
                    CountryID: exact.ID,
                    CountryName: exact.Name,
                    Latitude: exact.Latitude ?? undefined,
                    Longitude: exact.Longitude ?? undefined
                };
            }

            // 2. CommonAliases search
            const aliasMatch = countries.find(c => {
                if (!c.CommonAliases) return false;
                try {
                    const aliases: string[] = JSON.parse(c.CommonAliases);
                    return aliases.some(a => a.toLowerCase() === normalized);
                } catch {
                    return false;
                }
            });
            if (aliasMatch) {
                return {
                    Success: true,
                    CountryID: aliasMatch.ID,
                    CountryName: aliasMatch.Name,
                    Latitude: aliasMatch.Latitude ?? undefined,
                    Longitude: aliasMatch.Longitude ?? undefined
                };
            }

            return { Success: false, ErrorMessage: `No country match for "${input}"` };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`GeoResolver.ResolveCountry error: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }

    /**
     * Resolve a free-text state/province string with country context.
     * Country context is critical: "CA" = California (US) vs Canada (ISO2).
     */
    @Query(() => GeoResolveResult)
    async ResolveStateProvince(
        @Arg('stateInput', () => String) stateInput: string,
        @Arg('countryInput', () => String) countryInput: string,
        @Ctx() { userPayload }: AppContext
    ): Promise<GeoResolveResult> {
        try {
            const user = this.GetUserFromPayload(userPayload);

            // First resolve country
            const countryResult = await this.ResolveCountry(countryInput, { userPayload } as AppContext);
            if (!countryResult.Success || !countryResult.CountryID) {
                return { Success: false, ErrorMessage: `Could not resolve country "${countryInput}"` };
            }

            const states = await this.GetStates(user);
            const countryStates = states.filter(s => s.CountryID === countryResult.CountryID);
            const normalized = stateInput.trim().toLowerCase();

            // 1. Exact match on Name, Code, ISO3166_2
            const exact = countryStates.find(s =>
                s.Name.toLowerCase() === normalized ||
                s.Code.toLowerCase() === normalized ||
                s.ISO3166_2.toLowerCase() === normalized
            );
            if (exact) {
                return {
                    Success: true,
                    CountryID: countryResult.CountryID,
                    CountryName: countryResult.CountryName,
                    StateProvinceID: exact.ID,
                    StateProvinceName: exact.Name,
                    Latitude: exact.Latitude ?? undefined,
                    Longitude: exact.Longitude ?? undefined
                };
            }

            // 2. CommonAliases search
            const aliasMatch = countryStates.find(s => {
                if (!s.CommonAliases) return false;
                try {
                    const aliases: string[] = JSON.parse(s.CommonAliases);
                    return aliases.some(a => a.toLowerCase() === normalized);
                } catch {
                    return false;
                }
            });
            if (aliasMatch) {
                return {
                    Success: true,
                    CountryID: countryResult.CountryID,
                    CountryName: countryResult.CountryName,
                    StateProvinceID: aliasMatch.ID,
                    StateProvinceName: aliasMatch.Name,
                    Latitude: aliasMatch.Latitude ?? undefined,
                    Longitude: aliasMatch.Longitude ?? undefined
                };
            }

            return { Success: false, ErrorMessage: `No state/province match for "${stateInput}" in ${countryResult.CountryName}` };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`GeoResolver.ResolveStateProvince error: ${msg}`);
            return { Success: false, ErrorMessage: msg };
        }
    }
}
