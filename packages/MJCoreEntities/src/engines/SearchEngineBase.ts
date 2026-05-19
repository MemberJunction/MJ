import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, UserInfo } from "@memberjunction/core";
import { RegisterForStartup } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import {
    MJSearchProviderEntity,
    MJSearchScopeEntity,
    MJSearchScopeProviderEntity,
    MJSearchScopeExternalIndexEntity,
    MJSearchScopeEntityEntity,
    MJSearchScopeStorageAccountEntity,
    MJAIAgentSearchScopeEntity,
} from "../generated/entity_subclasses";

/**
 * SearchEngineBase provides cached access to SearchProvider + Search Scope metadata.
 *
 * Loads all `MJ: Search Providers`, `MJ: Search Scopes`, and the 5 Search Scope child
 * tables (`MJ: Search Scope Providers`, `MJ: Search Scope External Indexes`,
 * `MJ: Search Scope Entities`, `MJ: Search Scope Storage Accounts`, `MJ: AI Agent Search Scopes`)
 * via BaseEngine and provides typed getters and lookups for use anywhere
 * (client or server).
 *
 * The server-side SearchEngine class uses SearchEngineBase.Instance to access cached
 * provider metadata instead of loading directly via RunView. It also uses the scope
 * metadata getters to resolve `SearchScope` + children when a scoped search is requested.
 *
 * Uses BaseEngine for automatic caching and entity-event-based auto-refresh so that
 * provider/scope configuration changes are reflected without manual reload.
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
 *
 * // Resolve an active scope by ID (respects Status + StartAt/EndAt)
 * const scope = base.GetActiveScopeByID('...');
 *
 * // Pull everything needed for a scoped search
 * const bundle = base.GetScopeBundle(scopeId);
 * // -> { Scope, Providers, ExternalIndexes, Entities, StorageAccounts }
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
    private _scopes: MJSearchScopeEntity[] = [];
    private _scopeProviders: MJSearchScopeProviderEntity[] = [];
    private _scopeExternalIndexes: MJSearchScopeExternalIndexEntity[] = [];
    private _scopeEntities: MJSearchScopeEntityEntity[] = [];
    private _scopeStorageAccounts: MJSearchScopeStorageAccountEntity[] = [];
    private _agentScopes: MJAIAgentSearchScopeEntity[] = [];

    /**
     * Configures the engine by loading all search provider and scope records from the database.
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
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Search Scopes',
                PropertyName: '_scopes',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Search Scope Providers',
                PropertyName: '_scopeProviders',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Search Scope External Indexes',
                PropertyName: '_scopeExternalIndexes',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Search Scope Entities',
                PropertyName: '_scopeEntities',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Search Scope Storage Accounts',
                PropertyName: '_scopeStorageAccounts',
                CacheLocal: true,
            },
            {
                Type: 'entity',
                EntityName: 'MJ: AI Agent Search Scopes',
                PropertyName: '_agentScopes',
                CacheLocal: true,
            }
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
    }

    // ================================================================
    // Cached data getters — Providers
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
    // Cached data getters — Scopes
    // ================================================================

    /** All scope records (any status). */
    public get Scopes(): MJSearchScopeEntity[] {
        return this._scopes || [];
    }

    /**
     * Scopes that are currently active AND within their optional StartAt/EndAt time window.
     * Callers should prefer this over `Scopes` when resolving runtime search requests.
     */
    public get ActiveScopes(): MJSearchScopeEntity[] {
        const now = new Date();
        return this.Scopes.filter(s => this.isScopeActiveNow(s, now));
    }

    /** All scope-provider join rows. */
    public get ScopeProviders(): MJSearchScopeProviderEntity[] {
        return this._scopeProviders || [];
    }

    /** All scope-external-index rows. */
    public get ScopeExternalIndexes(): MJSearchScopeExternalIndexEntity[] {
        return this._scopeExternalIndexes || [];
    }

    /** All scope-entity rows. */
    public get ScopeEntities(): MJSearchScopeEntityEntity[] {
        return this._scopeEntities || [];
    }

    /** All scope-storage-account rows. */
    public get ScopeStorageAccounts(): MJSearchScopeStorageAccountEntity[] {
        return this._scopeStorageAccounts || [];
    }

    /** All agent-scope assignment rows. */
    public get AgentScopes(): MJAIAgentSearchScopeEntity[] {
        return this._agentScopes || [];
    }

    // ================================================================
    // Lookup helpers — Providers
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
        return this._providers.find(p => UUIDsEqual(p.ID, id));
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

    // ================================================================
    // Lookup helpers — Scopes
    // ================================================================

    /** Find a scope by ID (any status). */
    public GetScopeByID(id: string): MJSearchScopeEntity | undefined {
        if (!id) return undefined;
        return this.Scopes.find(s => UUIDsEqual(s.ID, id));
    }

    /** Find a scope by ID, only returning it if it is currently active. */
    public GetActiveScopeByID(id: string): MJSearchScopeEntity | undefined {
        const scope = this.GetScopeByID(id);
        if (!scope) return undefined;
        return this.isScopeActiveNow(scope, new Date()) ? scope : undefined;
    }

    /** Find a scope by Name (any status). */
    public GetScopeByName(name: string): MJSearchScopeEntity | undefined {
        if (!name) return undefined;
        const lower = name.trim().toLowerCase();
        return this.Scopes.find(s => s.Name.trim().toLowerCase() === lower);
    }

    /** The first scope with `IsGlobal=true` (there should be exactly one). */
    public get GlobalScope(): MJSearchScopeEntity | undefined {
        return this.Scopes.find(s => s.IsGlobal);
    }

    /** The first scope with `IsDefault=true` (or `GlobalScope` as a fallback). */
    public get DefaultScope(): MJSearchScopeEntity | undefined {
        return this.Scopes.find(s => s.IsDefault) ?? this.GlobalScope;
    }

    /** Provider rows (Enabled=true) for a scope. */
    public GetProvidersForScope(scopeID: string): MJSearchScopeProviderEntity[] {
        if (!scopeID) return [];
        return this.ScopeProviders
            .filter(r => UUIDsEqual(r.SearchScopeID, scopeID) && r.Enabled);
    }

    /** External-index rows for a scope. */
    public GetExternalIndexesForScope(scopeID: string): MJSearchScopeExternalIndexEntity[] {
        if (!scopeID) return [];
        return this.ScopeExternalIndexes.filter(r => UUIDsEqual(r.SearchScopeID, scopeID));
    }

    /** Entity rows for a scope. */
    public GetEntitiesForScope(scopeID: string): MJSearchScopeEntityEntity[] {
        if (!scopeID) return [];
        return this.ScopeEntities.filter(r => UUIDsEqual(r.SearchScopeID, scopeID));
    }

    /** Storage-account rows for a scope. */
    public GetStorageAccountsForScope(scopeID: string): MJSearchScopeStorageAccountEntity[] {
        if (!scopeID) return [];
        return this.ScopeStorageAccounts.filter(r => UUIDsEqual(r.SearchScopeID, scopeID));
    }

    /**
     * Resolve a single scope plus every child collection in one call. Convenience
     * for SearchEngine so it does one lookup per scope instead of five.
     */
    public GetScopeBundle(scopeID: string): ScopeBundle | undefined {
        const scope = this.GetScopeByID(scopeID);
        if (!scope) return undefined;
        return {
            Scope: scope,
            Providers: this.GetProvidersForScope(scopeID),
            ExternalIndexes: this.GetExternalIndexesForScope(scopeID),
            Entities: this.GetEntitiesForScope(scopeID),
            StorageAccounts: this.GetStorageAccountsForScope(scopeID),
        };
    }

    // ================================================================
    // Lookup helpers — Agent <-> Scope
    // ================================================================

    /**
     * Agent-scope rows for an agent, filtered by Phase and current active window.
     * @param agentID - The `MJ: AI Agents` record ID
     * @param phase - Optional phase filter. Rows whose `Phase` is `'Both'` match any phase query.
     */
    public GetAgentScopes(
        agentID: string,
        phase?: 'PreExecution' | 'AgentInvoked'
    ): MJAIAgentSearchScopeEntity[] {
        if (!agentID) return [];
        const now = new Date();
        return this.AgentScopes.filter(row => {
            if (!UUIDsEqual(row.AgentID, agentID)) return false;
            if (row.Status !== 'Active') return false;
            if (!this.isAgentScopeActiveNow(row, now)) return false;
            if (phase) {
                if (row.Phase !== phase && row.Phase !== 'Both') return false;
            }
            return true;
        });
    }

    /**
     * The default `IsDefault=true` agent-scope row for an agent, or the highest-priority
     * row (lowest `Priority` value) if no row is marked default.
     */
    public GetDefaultAgentScope(agentID: string): MJAIAgentSearchScopeEntity | undefined {
        const rows = this.GetAgentScopes(agentID);
        if (rows.length === 0) return undefined;
        const explicit = rows.find(r => r.IsDefault);
        if (explicit) return explicit;
        return [...rows].sort((a, b) => a.Priority - b.Priority)[0];
    }

    // ================================================================
    // Time-window helpers
    // ================================================================

    private isScopeActiveNow(scope: MJSearchScopeEntity, now: Date): boolean {
        if (scope.Status !== 'Active') return false;
        if (scope.StartAt && scope.StartAt > now) return false;
        if (scope.EndAt && scope.EndAt < now) return false;
        return true;
    }

    private isAgentScopeActiveNow(row: MJAIAgentSearchScopeEntity, now: Date): boolean {
        if (row.Status !== 'Active') return false;
        if (row.StartAt && row.StartAt > now) return false;
        if (row.EndAt && row.EndAt < now) return false;
        return true;
    }
}

/**
 * Bundle returned from `SearchEngineBase.GetScopeBundle()` — a single scope and every
 * child collection the search engine needs.
 */
export interface ScopeBundle {
    Scope: MJSearchScopeEntity;
    Providers: MJSearchScopeProviderEntity[];
    ExternalIndexes: MJSearchScopeExternalIndexEntity[];
    Entities: MJSearchScopeEntityEntity[];
    StorageAccounts: MJSearchScopeStorageAccountEntity[];
}
