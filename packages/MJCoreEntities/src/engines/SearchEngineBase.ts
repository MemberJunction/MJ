import { BaseEngine, BaseEnginePropertyConfig, BaseEntityEvent, EntityPermissionType, IMetadataProvider, RegisterForStartup, RunView, UserInfo } from "@memberjunction/core";
import { IsBrowser, UUIDsEqual } from "@memberjunction/global";
import {
    MJSearchProviderEntity,
    MJSearchScopeEntity,
    MJSearchScopeProviderEntity,
    MJSearchScopeExternalIndexEntity,
    MJSearchScopeEntityEntity,
    MJSearchScopeStorageAccountEntity,
    MJAIAgentSearchScopeEntity,
} from "../generated/entity_subclasses";
import type { MJAIAgentSearchScopeEntityType } from "../generated/entities/__mj";

const AI_AGENT_SEARCH_SCOPES_ENTITY = 'MJ: AI Agent Search Scopes';

type AgentSearchScopeSummary = Pick<MJAIAgentSearchScopeEntityType, 'AgentID' | 'Status' | 'Phase' | 'StartAt' | 'EndAt'>;
type ActiveWindowRecord = {
    Status?: string | null;
    StartAt?: Date | string | null;
    EndAt?: Date | string | null;
};

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
@RegisterForStartup({ deferred: IsBrowser() })
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
    private agentScopeSummaryCache = new WeakMap<IMetadataProvider, AgentSearchScopeSummary[]>();
    private agentScopeSummaryInFlight = new WeakMap<IMetadataProvider, Promise<AgentSearchScopeSummary[] | null>>();
    private agentScopeProbeGeneration = 0;

    protected override async Load(
        configs: Partial<BaseEnginePropertyConfig>[],
        provider: IMetadataProvider,
        forceRefresh: boolean = false,
        contextUser?: UserInfo
    ): Promise<void> {
        if (forceRefresh || !this.Loaded) {
            this.invalidateAgentScopeSummaryCache();
        }
        return super.Load(configs, provider, forceRefresh, contextUser);
    }

    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        const entityName = (event.baseEntity?.EntityInfo?.Name ?? event.entityName ?? '').trim().toLowerCase();
        const changed = event.type === 'save' || event.type === 'delete' || event.type === 'remote-invalidate';
        if (changed && entityName === AI_AGENT_SEARCH_SCOPES_ENTITY.toLowerCase()) {
            this.invalidateAgentScopeSummaryCache();
        }
        return super.HandleIndividualBaseEntityEvent(event);
    }

    /**
     * Returns `true` when `agentID` has at least one active search scope assignment matching `phase`
     * (including `'Both'`). When unloaded (for example on deferred browser startup or selective engine
     * bootstrap), runs a single lightweight `RunView` over `MJ: AI Agent Search Scopes` cached per
     * provider so agents with no search scopes skip loading all 7 Search entities.
     */
    public async HasActiveAgentScopes(
        agentID: string,
        phase?: 'PreExecution' | 'AgentInvoked',
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<boolean> {
        if (!agentID) return false;
        const resolvedProvider = provider ?? this.ProviderToUse;
        if (this.Loaded && resolvedProvider === this.ProviderToUse) {
            return this.GetAgentScopes(agentID, phase).length > 0;
        }

        const cached = this.agentScopeSummaryCache.get(resolvedProvider);
        if (cached !== undefined) {
            const now = new Date();
            return cached.some(row => this.matchesAgentScopeRow(row, agentID, phase, now));
        }

        let pending = this.agentScopeSummaryInFlight.get(resolvedProvider);
        if (!pending) {
            pending = this.probeAgentScopeSummaries(resolvedProvider, contextUser).finally(() => {
                this.agentScopeSummaryInFlight.delete(resolvedProvider);
            });
            this.agentScopeSummaryInFlight.set(resolvedProvider, pending);
        }

        const rows = await pending;
        if (rows === null) {
            // Fail open on query error so the caller falls back to full Config().
            return true;
        }
        const now = new Date();
        return rows.some(row => this.matchesAgentScopeRow(row, agentID, phase, now));
    }

    private async probeAgentScopeSummaries(
        resolvedProvider: IMetadataProvider,
        contextUser?: UserInfo
    ): Promise<AgentSearchScopeSummary[] | null> {
        const agentScopesMeta = resolvedProvider.EntityByName(AI_AGENT_SEARCH_SCOPES_ENTITY);
        if (!agentScopesMeta) {
            return [];
        }

        await this.SetupGlobalEventListener();
        const generation = this.agentScopeProbeGeneration;

        const rv = RunView.FromMetadataProvider(resolvedProvider);
        const res = await rv.RunView<AgentSearchScopeSummary>(
            {
                EntityName: AI_AGENT_SEARCH_SCOPES_ENTITY,
                ExtraFilter: "[Status] = 'Active'",
                Fields: ['AgentID', 'Status', 'Phase', 'StartAt', 'EndAt'],
                ResultType: 'simple',
            },
            contextUser
        );
        if (!res.Success) {
            return null;
        }

        const rows = res.Results ?? [];
        const rlsExempt = !contextUser || agentScopesMeta.UserExemptFromRowLevelSecurity(contextUser, EntityPermissionType.Read);
        if (rlsExempt && generation === this.agentScopeProbeGeneration) {
            this.agentScopeSummaryCache.set(resolvedProvider, rows);
        }
        return rows;
    }

    private invalidateAgentScopeSummaryCache(): void {
        this.agentScopeProbeGeneration++;
        this.agentScopeSummaryCache = new WeakMap<IMetadataProvider, AgentSearchScopeSummary[]>();
    }

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
        return this.GetConfigData<MJSearchProviderEntity>('_providers');
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
        return this.GetConfigData<MJSearchScopeEntity>('_scopes');
    }

    /**
     * Scopes that are currently active AND within their optional StartAt/EndAt time window.
     * Callers should prefer this over `Scopes` when resolving runtime search requests.
     */
    public get ActiveScopes(): MJSearchScopeEntity[] {
        const now = new Date();
        return this.Scopes.filter(s => this.isWindowActiveNow(s, now));
    }

    /** All scope-provider join rows. */
    public get ScopeProviders(): MJSearchScopeProviderEntity[] {
        return this.GetConfigData<MJSearchScopeProviderEntity>('_scopeProviders');
    }

    /** All scope-external-index rows. */
    public get ScopeExternalIndexes(): MJSearchScopeExternalIndexEntity[] {
        return this.GetConfigData<MJSearchScopeExternalIndexEntity>('_scopeExternalIndexes');
    }

    /** All scope-entity rows. */
    public get ScopeEntities(): MJSearchScopeEntityEntity[] {
        return this.GetConfigData<MJSearchScopeEntityEntity>('_scopeEntities');
    }

    /** All scope-storage-account rows. */
    public get ScopeStorageAccounts(): MJSearchScopeStorageAccountEntity[] {
        return this.GetConfigData<MJSearchScopeStorageAccountEntity>('_scopeStorageAccounts');
    }

    /** All agent-scope assignment rows. */
    public get AgentScopes(): MJAIAgentSearchScopeEntity[] {
        return this.GetConfigData<MJAIAgentSearchScopeEntity>('_agentScopes');
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
        return this.isWindowActiveNow(scope, new Date()) ? scope : undefined;
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
        return this.AgentScopes.filter(row => this.matchesAgentScopeRow(row, agentID, phase, now));
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

    private matchesAgentScopeRow(
        row: AgentSearchScopeSummary,
        agentID: string,
        phase: 'PreExecution' | 'AgentInvoked' | undefined,
        now: Date
    ): boolean {
        if (!UUIDsEqual(row.AgentID, agentID)) return false;
        if (!this.isWindowActiveNow(row, now)) return false;
        if (phase && row.Phase !== phase && row.Phase !== 'Both') return false;
        return true;
    }

    private isWindowActiveNow(row: ActiveWindowRecord, now: Date): boolean {
        if (row.Status !== 'Active') return false;
        if (row.StartAt) {
            const startAt = row.StartAt instanceof Date ? row.StartAt : new Date(row.StartAt);
            if (startAt > now) return false;
        }
        if (row.EndAt) {
            const endAt = row.EndAt instanceof Date ? row.EndAt : new Date(row.EndAt);
            if (endAt < now) return false;
        }
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
