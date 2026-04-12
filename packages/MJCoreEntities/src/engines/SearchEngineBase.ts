import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { RegisterForStartup } from "@memberjunction/core";
import { MJSearchProviderEntity } from "../generated/entity_subclasses";

/**
 * SearchEngineBase provides cached access to SearchProvider metadata.
 * Loads all MJ: Search Providers records via BaseEngine and provides
 * typed getters and lookups for use anywhere (client or server).
 *
 * The server-side SearchEngine class uses SearchEngineBase.Instance to
 * access cached provider metadata instead of loading directly via RunView.
 *
 * Uses BaseEngine for automatic caching and entity-event-based auto-refresh
 * so that provider configuration changes are reflected without manual reload.
 *
 * Usage:
 * ```typescript
 * const base = SearchEngineBase.Instance;
 * await base.Config(false, contextUser);
 *
 * // Get all active providers
 * const activeProviders = base.ActiveProviders;
 *
 * // Find a provider by driver class
 * const vectorProvider = base.GetProviderByDriverClass('VectorSearchProvider');
 * ```
 */
@RegisterForStartup()
export class SearchEngineBase extends BaseEngine<SearchEngineBase> {
    /**
     * Returns the global singleton instance.
     */
    public static get Instance(): SearchEngineBase {
        return super.getInstance<SearchEngineBase>();
    }

    private _providers: MJSearchProviderEntity[] = [];

    /**
     * Configures the engine by loading all search provider records from the database.
     * @param forceRefresh - If true, forces a refresh from the database even if data is cached
     * @param contextUser - Optional user context for server-side operations
     * @param provider - Optional metadata provider
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Search Providers',
                PropertyName: '_providers',
                CacheLocal: true,
            }
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // ================================================================
    // Cached data getters
    // ================================================================

    /** All search provider records (any status) */
    public get Providers(): MJSearchProviderEntity[] {
        return this._providers || [];
    }

    /** Only active search providers, sorted by Priority ascending */
    public get ActiveProviders(): MJSearchProviderEntity[] {
        return this.Providers
            .filter(p => p.Status === 'Active')
            .sort((a, b) => a.Priority - b.Priority);
    }

    /** Active providers that support preview/autocomplete searches */
    public get PreviewProviders(): MJSearchProviderEntity[] {
        return this.ActiveProviders.filter(p => p.SupportsPreview);
    }

    // ================================================================
    // Lookup helpers
    // ================================================================

    /**
     * Find a provider by its DriverClass key.
     * @param driverClass - The DriverClass value (e.g., 'VectorSearchProvider')
     * @returns The provider entity, or undefined if not found
     */
    public GetProviderByDriverClass(driverClass: string): MJSearchProviderEntity | undefined {
        if (!driverClass) return undefined;
        return this._providers.find(p => p.DriverClass === driverClass);
    }

    /**
     * Find a provider by its Name.
     * @param name - The provider name (e.g., 'Semantic')
     * @returns The provider entity, or undefined if not found
     */
    public GetProviderByName(name: string): MJSearchProviderEntity | undefined {
        if (!name) return undefined;
        const lower = name.trim().toLowerCase();
        return this._providers.find(p => p.Name.trim().toLowerCase() === lower);
    }

    /**
     * Find a provider by its ID.
     * @param id - The provider record ID
     * @returns The provider entity, or undefined if not found
     */
    public GetProviderById(id: string): MJSearchProviderEntity | undefined {
        if (!id) return undefined;
        return this._providers.find(p => p.ID === id);
    }

    /**
     * Get the display label for a source type, resolving from provider metadata.
     * Falls back to the source type string if no provider matches.
     * @param sourceType - The source type key (e.g., 'vector', 'entity')
     */
    public GetDisplayNameForSourceType(sourceType: string): string {
        const provider = this.ActiveProviders.find(p => {
            const driverLower = p.DriverClass.toLowerCase();
            return driverLower.startsWith(sourceType.toLowerCase());
        });
        return provider?.DisplayName ?? provider?.Name ?? sourceType;
    }

    /**
     * Get the icon for a source type, resolving from provider metadata.
     * Falls back to a generic icon if no provider matches.
     * @param sourceType - The source type key (e.g., 'vector', 'entity')
     */
    public GetIconForSourceType(sourceType: string): string {
        const provider = this.ActiveProviders.find(p => {
            const driverLower = p.DriverClass.toLowerCase();
            return driverLower.startsWith(sourceType.toLowerCase());
        });
        return provider?.Icon ?? 'fa-solid fa-circle';
    }
}
