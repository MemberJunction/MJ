/**
 * @fileoverview SearchEngine singleton - the main entry point for multi-source search.
 *
 * Orchestrates search providers discovered from the SearchProvider metadata entity,
 * fuses results with Reciprocal Rank Fusion (RRF), applies enrichment
 * (entity icons, record names, tags), and filters by minimum score.
 *
 * Providers are loaded via @RegisterClass(BaseSearchProvider, DriverClass) and
 * instantiated using the MJ ClassFactory based on active SearchProvider records.
 *
 * Uses BaseSingleton from @memberjunction/global for a truly global instance.
 *
 * @module @memberjunction/search-engine
 */

import { EntityInfo, EntityPermissionType, IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { SearchEngineBase, MJSearchProviderEntity } from '@memberjunction/core-entities';
import { BaseSingleton, MJGlobal, NormalizeUUID } from '@memberjunction/global';
import {
    SearchParams,
    SearchResult,
    SearchResultItem,
    SearchFilters,
    SearchProviderInfo,
} from './search.types';
import { BaseSearchProvider, SearchProviderConfig } from './ISearchProvider';
import { SearchFusion, LabeledResultList } from './SearchFusion';
import { SearchEnricher } from './SearchEnricher';
import { FullTextSearchProvider } from './FullTextSearchProvider';

/**
 * Configuration options for the SearchEngine.
 */
export interface SearchEngineConfig {
    /** Default maximum results if not specified in SearchParams (default: 20) */
    DefaultMaxResults?: number;
}

/**
 * Internal wrapper that pairs a provider instance with its metadata record.
 */
interface ProviderEntry {
    Provider: BaseSearchProvider;
    /** SearchProvider record ID from the database */
    ID: string;
    /** Display label for the UI */
    DisplayName: string;
    /** Font Awesome icon class */
    Icon: string;
    Priority: number;
    SupportsPreview: boolean;
    MaxResultsOverride: number | null;
}

/**
 * Singleton search engine that orchestrates multi-source search with RRF fusion.
 *
 * Providers are discovered from the MJ: Search Providers entity. Each active
 * provider's DriverClass is resolved via ClassFactory to create an instance,
 * which is then initialized with the provider's config from the DB.
 *
 * Usage:
 * ```typescript
 * // Initialize once at server startup
 * await SearchEngine.Instance.Config({}, contextUser);
 *
 * // Execute searches
 * const result = await SearchEngine.Instance.Search({
 *     Query: 'quarterly revenue',
 *     MaxResults: 20,
 *     MinScore: 0.1
 * }, contextUser);
 * ```
 */
export class SearchEngine extends BaseSingleton<SearchEngine> {
    // Constructor must be public to satisfy BaseSingleton.getInstance() constraint
    public constructor() {
        super();
    }

    /** Static accessor for the global singleton instance */
    public static get Instance(): SearchEngine {
        return super.getInstance<SearchEngine>();
    }

    private _configured = false;
    private _providerEntries: ProviderEntry[] = [];
    private _fusion = new SearchFusion();
    private _enricher = new SearchEnricher();
    private _defaultMaxResults = 20;

    /** Access the cached provider metadata from SearchEngineBase */
    protected get Base(): SearchEngineBase {
        return SearchEngineBase.Instance;
    }

    /** Resolve the metadata provider via SearchEngineBase (which extends BaseEngine and tracks ProviderToUse). */
    protected get ProviderToUse(): IMetadataProvider {
        return this.Base.ProviderToUse;
    }

    /**
     * Initialize the search engine by reading active SearchProvider records
     * from SearchEngineBase (which caches them via BaseEngine) and
     * instantiating each via ClassFactory.
     *
     * Safe to call multiple times (no-ops if already configured unless forceRefresh=true).
     *
     * @param config - Engine configuration options
     * @param contextUser - The user context for initialization
     * @param forceRefresh - If true, re-initializes even if already configured
     */
    public async Config(
        config: SearchEngineConfig = {},
        contextUser: UserInfo,
        forceRefresh: boolean = false
    ): Promise<void> {
        if (this._configured && !forceRefresh) return;

        this._defaultMaxResults = config.DefaultMaxResults ?? 20;
        this._providerEntries = [];

        // Ensure SearchEngineBase has loaded provider metadata
        await this.Base.Config(forceRefresh, contextUser);

        const providerRecords = this.Base.ActiveProviders;

        if (providerRecords.length === 0) {
            LogStatus('SearchEngine: No active search providers found in database');
            this._configured = true;
            return;
        }

        // Instantiate and initialize each provider via ClassFactory
        for (const record of providerRecords) {
            await this.initializeProvider(record, contextUser);
        }

        // Propagate the metadata provider to the enricher for entity lookups
        this._enricher.Provider = this.ProviderToUse;

        // Sort by priority (lower = higher priority)
        this._providerEntries.sort((a, b) => a.Priority - b.Priority);

        this._configured = true;
        const names = this._providerEntries.map(e => e.Provider.SourceType);
        LogStatus(`SearchEngine: Configured with ${this._providerEntries.length} provider(s): ${names.join(', ')}`);
    }

    /**
     * Execute a multi-source search with RRF fusion and optional enrichment.
     *
     * Steps:
     * 1. Run all available providers in parallel
     * 2. Fuse results with RRF
     * 3. Deduplicate by EntityName+RecordID
     * 4. Exclude redundant entity-sourced Content Items
     * 5. Apply minimum score threshold
     * 6. Enrich with icons, names, and tags (skipped in preview mode)
     *
     * @param params - Search parameters
     * @param contextUser - The user performing the search
     * @returns Aggregated search result
     */
    public async Search(params: SearchParams, contextUser: UserInfo): Promise<SearchResult> {
        const startTime = Date.now();

        try {
            if (!params.Query.trim()) {
                return this.buildErrorResult('Query cannot be empty', startTime);
            }

            // Ensure configured
            if (!this._configured) {
                await this.Config({}, contextUser);
            }

            const topK = params.MaxResults ?? this._defaultMaxResults;
            const mode = params.Mode ?? 'full';
            const isPreview = mode === 'preview';

            // Step 1: Run all providers in parallel (respecting preview flag)
            const labeledLists = await this.executeProviders(params.Query, topK, params.Filters, contextUser, isPreview);
            const sourceCounts = this.countSources(labeledLists);

            // Step 2: Fuse with RRF
            let results = this._fusion.Fuse(labeledLists, topK);

            // Step 3: Deduplicate
            results = this._fusion.Deduplicate(results);

            // Step 4: Exclude redundant Content Items
            results = await this._enricher.ExcludeEntitySourcedContentItems(results, contextUser);

            // Step 4.5: Filter by entity-level and row-level permissions
            results = await this.filterByPermissions(results, contextUser);

            // Step 5: Apply minimum score threshold
            const scoreThreshold = params.MinScore ?? 0;
            if (scoreThreshold > 0) {
                results = results.filter(r => r.Score >= scoreThreshold);
            }

            // Step 6: Enrich (skip in preview mode)
            if (!isPreview) {
                await this._enricher.Enrich(results, contextUser);
            }

            LogStatus(`SearchEngine: Search complete in ${Date.now() - startTime}ms - ${results.length} results`);

            return {
                Success: true,
                Results: results,
                TotalCount: results.length,
                ElapsedMs: Date.now() - startTime,
                SourceCounts: sourceCounts,
                Providers: this.buildProviderInfoList(),
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchEngine: Search failed: ${msg}`);
            return this.buildErrorResult(msg, startTime);
        }
    }

    /**
     * Quick preview search optimized for autocomplete / typeahead.
     * Uses preview mode (no enrichment), limited to 8 results by default.
     * Only runs providers that have SupportsPreview=true.
     *
     * @param query - The search query text
     * @param maxResults - Maximum number of preview results (default: 8)
     * @param contextUser - The user performing the search
     * @returns Search result in preview mode
     */
    public async PreviewSearch(
        query: string,
        maxResults: number = 8,
        contextUser: UserInfo
    ): Promise<SearchResult> {
        return this.Search({
            Query: query,
            MaxResults: maxResults,
            Mode: 'preview'
        }, contextUser);
    }

    // ────────────────────────────────────────────────────────────────
    // Provider loading and initialization
    // ────────────────────────────────────────────────────────────────

    /**
     * Instantiate a single provider from its SearchProvider metadata record,
     * initialize it, check availability, and add to the active list if available.
     */
    private async initializeProvider(
        record: MJSearchProviderEntity,
        contextUser: UserInfo
    ): Promise<void> {
        const driverClass = record.DriverClass;

        try {
            // Use ClassFactory to create an instance from the DriverClass key
            const provider = MJGlobal.Instance.ClassFactory.CreateInstance<BaseSearchProvider>(
                BaseSearchProvider,
                driverClass
            );

            if (!provider) {
                LogError(`SearchEngine: No registered class found for DriverClass "${driverClass}" (provider: ${record.Name})`);
                return;
            }

            // Parse ProviderConfig JSON if present
            let providerConfig: Record<string, unknown> | null = null;
            if (record.ProviderConfig) {
                try {
                    providerConfig = JSON.parse(record.ProviderConfig) as Record<string, unknown>;
                } catch {
                    LogError(`SearchEngine: Invalid JSON in ProviderConfig for "${record.Name}"`);
                }
            }

            // Build the config object from the metadata record
            const config: SearchProviderConfig = {
                Name: record.Name,
                ProviderConfig: providerConfig,
                CredentialID: record.CredentialID ?? null,
                MaxResultsOverride: record.MaxResultsOverride ?? null,
                SupportsPreview: record.SupportsPreview,
                Priority: record.Priority,
            };

            // Propagate the engine's metadata provider to the search provider for entity lookups
            provider.Provider = this.ProviderToUse;

            // Initialize the provider
            await provider.Initialize(config, contextUser);

            // Special handling: FullTextSearchProvider needs the shared enricher
            if (provider instanceof FullTextSearchProvider) {
                provider.SetEnricher(this._enricher);
            }

            // Check availability
            await provider.CheckAvailability(contextUser);

            if (provider.IsAvailable()) {
                this._providerEntries.push({
                    Provider: provider,
                    ID: record.ID,
                    DisplayName: record.DisplayName ?? record.Name,
                    Icon: record.Icon ?? 'fa-solid fa-circle',
                    Priority: record.Priority,
                    SupportsPreview: record.SupportsPreview,
                    MaxResultsOverride: record.MaxResultsOverride ?? null,
                });
                LogStatus(`SearchEngine: Provider "${record.Name}" (${driverClass}) enabled`);
            } else {
                LogStatus(`SearchEngine: Provider "${record.Name}" (${driverClass}) not available`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchEngine: Failed to initialize provider "${record.Name}" (${driverClass}): ${msg}`);
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Search execution helpers
    // ────────────────────────────────────────────────────────────────

    /**
     * Run all available providers in parallel and return labeled result lists.
     * When isPreview is true, only providers with SupportsPreview=true are included.
     */
    private async executeProviders(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo,
        isPreview: boolean
    ): Promise<LabeledResultList[]> {
        const entries = this._providerEntries.filter(e => {
            if (!e.Provider.IsAvailable()) return false;
            if (isPreview && !e.SupportsPreview) return false;
            return true;
        });

        if (entries.length === 0) {
            LogStatus('SearchEngine: No providers available');
            return [];
        }

        const promises = entries.map(async (entry): Promise<LabeledResultList> => {
            try {
                const providerTopK = entry.MaxResultsOverride ?? topK;
                const results = await entry.Provider.Search(query, providerTopK, filters, contextUser);
                // Stamp provider metadata onto each result
                for (const r of results) {
                    r.ProviderId = entry.ID;
                    r.ProviderLabel = entry.DisplayName;
                    r.ProviderIcon = entry.Icon;
                }
                return { Source: entry.Provider.SourceType, Results: results };
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                LogError(`SearchEngine: Provider "${entry.Provider.SourceType}" failed: ${msg}`);
                return { Source: entry.Provider.SourceType, Results: [] };
            }
        });

        return Promise.all(promises);
    }

    /**
     * Count results contributed by each source before fusion.
     */
    private countSources(lists: LabeledResultList[]): { Vector: number; FullText: number; Entity: number; Storage: number } {
        const counts = { Vector: 0, FullText: 0, Entity: 0, Storage: 0 };
        for (const list of lists) {
            switch (list.Source) {
                case 'vector':
                    counts.Vector = list.Results.length;
                    break;
                case 'fulltext':
                    counts.FullText = list.Results.length;
                    break;
                case 'entity':
                    counts.Entity = list.Results.length;
                    break;
                case 'storage':
                    counts.Storage = list.Results.length;
                    break;
            }
        }
        return counts;
    }

    // ────────────────────────────────────────────────────────────────
    // Permission filtering
    // ────────────────────────────────────────────────────────────────

    /**
     * Filter search results by entity-level and row-level security permissions.
     *
     * Groups results by entity for efficient permission checking:
     * 1. Unknown entities are excluded (fail closed).
     * 2. If the user lacks entity-level CanRead, all results for that entity are dropped.
     * 3. If the user is exempt from RLS, all results pass through.
     * 4. If RLS applies, a RunView validates which record IDs the user can read.
     */
    private async filterByPermissions(
        results: SearchResultItem[],
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        if (results.length === 0) return results;

        // Storage file results have their own permission model (FileStorageAccountPermission)
        // which is already checked by StorageSearchProvider — pass them through here
        const storageResults = results.filter(r => r.ResultType === 'storage-file');
        const entityResults = results.filter(r => r.ResultType !== 'storage-file');

        const byEntity = this.groupResultsByEntity(entityResults);
        const permitted: SearchResultItem[] = [...storageResults];

        const promises: Promise<void>[] = [];
        for (const [entityName, groupResults] of byEntity) {
            promises.push(
                this.filterEntityResults(entityName, groupResults, contextUser, permitted)
            );
        }
        await Promise.all(promises);

        return permitted;
    }

    /**
     * Group search result items by EntityName for batch permission checking.
     */
    private groupResultsByEntity(results: SearchResultItem[]): Map<string, SearchResultItem[]> {
        const byEntity = new Map<string, SearchResultItem[]>();
        for (const result of results) {
            const list = byEntity.get(result.EntityName);
            if (list) {
                list.push(result);
            } else {
                byEntity.set(result.EntityName, [result]);
            }
        }
        return byEntity;
    }

    /**
     * Check permissions for a single entity's batch of results.
     * Permitted results are pushed into the shared `permitted` array.
     * On any error, results are excluded (fail closed).
     */
    private async filterEntityResults(
        entityName: string,
        entityResults: SearchResultItem[],
        contextUser: UserInfo,
        permitted: SearchResultItem[]
    ): Promise<void> {
        try {
            const md = this.ProviderToUse;
            let entity: EntityInfo | null = null;
            try {
                entity = md.EntityByName(entityName);
            } catch {
                // EntityByName throws on unknown entity names — skip these results
                return;
            }
            if (!entity) return;

            // Check entity-level read permission
            const perms = entity.GetUserPermisions(contextUser);
            if (!perms || !perms.CanRead) return;

            // Check RLS
            if (entity.UserExemptFromRowLevelSecurity(contextUser, EntityPermissionType.Read)) {
                // User exempt from RLS — all results for this entity are permitted
                permitted.push(...entityResults);
                return;
            }

            // User is NOT exempt from RLS — check if there's an actual RLS clause
            const rlsClause = entity.GetUserRowLevelSecurityWhereClause(
                contextUser,
                EntityPermissionType.Read,
                ''
            );
            if (!rlsClause) {
                // No RLS clause produced — results pass through
                permitted.push(...entityResults);
                return;
            }

            // RLS applies — validate record IDs via RunView
            await this.filterByRowLevelSecurity(entity, entityResults, rlsClause, contextUser, permitted);
        } catch (error) {
            // Fail closed — if anything goes wrong, exclude the results
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchEngine: Permission filtering failed for entity "${entityName}": ${msg}`);
        }
    }

    /**
     * Use RunView to validate which record IDs the user can see under RLS.
     * Only results whose record IDs survive the RLS filter are added to `permitted`.
     */
    private async filterByRowLevelSecurity(
        entity: EntityInfo,
        entityResults: SearchResultItem[],
        rlsClause: string,
        contextUser: UserInfo,
        permitted: SearchResultItem[]
    ): Promise<void> {
        const pkField = entity.FirstPrimaryKey;
        if (!pkField) {
            // Cannot verify without a primary key — exclude results
            LogError(`SearchEngine: Entity "${entity.Name}" has no primary key, cannot apply RLS filter`);
            return;
        }

        const pkFieldName = pkField.Name;
        const recordIDs = entityResults.map(r => `'${r.RecordID.replace(/'/g, "''")}'`).join(',');
        const filter = `${pkFieldName} IN (${recordIDs}) AND (${rlsClause})`;

        const rv = new RunView();
        const result = await rv.RunView<Record<string, string>>({
            EntityName: entity.Name,
            ExtraFilter: filter,
            Fields: [pkFieldName],
            ResultType: 'simple'
        }, contextUser);

        if (!result.Success) {
            // RunView failed — fail closed, exclude all results
            LogError(`SearchEngine: RLS RunView failed for entity "${entity.Name}": ${result.ErrorMessage ?? 'unknown error'}`);
            return;
        }

        const validIDs = new Set(
            result.Results.map(r => NormalizeUUID(String(r[pkFieldName])))
        );

        for (const item of entityResults) {
            if (validIDs.has(NormalizeUUID(item.RecordID))) {
                permitted.push(item);
            }
        }
    }

    /** Build an error SearchResult */
    private buildErrorResult(message: string, startTime: number): SearchResult {
        return {
            Success: false,
            Results: [],
            TotalCount: 0,
            ElapsedMs: Date.now() - startTime,
            SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
            Providers: [],
            ErrorMessage: message,
        };
    }

    /** Build the list of active provider metadata for the response */
    private buildProviderInfoList(): SearchProviderInfo[] {
        return this._providerEntries.map(e => ({
            ID: e.ID,
            Name: e.DisplayName,
            DisplayName: e.DisplayName,
            Icon: e.Icon,
            SourceType: e.Provider.SourceType,
            Priority: e.Priority,
        }));
    }
}
