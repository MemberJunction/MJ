/**
 * @fileoverview SearchEngine singleton - the main entry point for multi-source search.
 *
 * Orchestrates vector, full-text, and entity search providers in parallel,
 * fuses results with Reciprocal Rank Fusion (RRF), applies enrichment
 * (entity icons, record names, tags), and filters by minimum score.
 *
 * Uses BaseSingleton from @memberjunction/global for a truly global instance.
 *
 * @module @memberjunction/search-engine
 */

import { EntityInfo, EntityPermissionType, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton, NormalizeUUID } from '@memberjunction/global';
import {
    SearchParams,
    SearchResult,
    SearchResultItem,
    SearchFilters,
} from './search.types';
import { ISearchProvider } from './ISearchProvider';
import { SearchFusion, LabeledResultList } from './SearchFusion';
import { SearchEnricher } from './SearchEnricher';
import { VectorSearchProvider } from './VectorSearchProvider';
import { FullTextSearchProvider } from './FullTextSearchProvider';
import { EntitySearchProvider } from './EntitySearchProvider';
import { StorageSearchProvider } from './StorageSearchProvider';

/**
 * Configuration options for the SearchEngine.
 */
export interface SearchEngineConfig {
    /** Default maximum results if not specified in SearchParams (default: 20) */
    DefaultMaxResults?: number;
    /** Whether to include entity LIKE-based search (default: true) */
    EnableEntitySearch?: boolean;
    /** Whether to include full-text search (default: true) */
    EnableFullTextSearch?: boolean;
    /** Whether to include vector search (default: true, but gracefully skipped if unavailable) */
    EnableVectorSearch?: boolean;
    /** Whether to include file storage search (default: true, but gracefully skipped if unavailable) */
    EnableStorageSearch?: boolean;
}

/**
 * Singleton search engine that orchestrates multi-source search with RRF fusion.
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
    private _providers: ISearchProvider[] = [];
    private _fusion = new SearchFusion();
    private _enricher = new SearchEnricher();
    private _defaultMaxResults = 20;

    /**
     * Initialize the search engine with configuration and check provider availability.
     * Safe to call multiple times (no-ops if already configured unless forceRefresh=true).
     *
     * @param config - Engine configuration options
     * @param contextUser - The user context for checking provider availability
     * @param forceRefresh - If true, re-initializes even if already configured
     */
    public async Config(
        config: SearchEngineConfig = {},
        contextUser: UserInfo,
        forceRefresh: boolean = false
    ): Promise<void> {
        if (this._configured && !forceRefresh) return;

        this._defaultMaxResults = config.DefaultMaxResults ?? 20;
        this._providers = [];

        // Build provider list based on config
        const enableVector = config.EnableVectorSearch !== false;
        const enableFullText = config.EnableFullTextSearch !== false;
        const enableEntity = config.EnableEntitySearch !== false;

        if (enableVector) {
            const vectorProvider = new VectorSearchProvider();
            await vectorProvider.CheckAvailability(contextUser);
            if (vectorProvider.IsAvailable()) {
                this._providers.push(vectorProvider);
                LogStatus('SearchEngine: Vector search provider enabled');
            } else {
                LogStatus('SearchEngine: Vector search provider not available (no indexes configured)');
            }
        }

        if (enableFullText) {
            const ftsProvider = new FullTextSearchProvider(this._enricher);
            this._providers.push(ftsProvider);
            LogStatus('SearchEngine: Full-text search provider enabled');
        }

        if (enableEntity) {
            const entityProvider = new EntitySearchProvider();
            this._providers.push(entityProvider);
            LogStatus('SearchEngine: Entity search provider enabled');
        }

        const enableStorage = config.EnableStorageSearch !== false;
        if (enableStorage) {
            const storageProvider = new StorageSearchProvider();
            await storageProvider.CheckAvailability(contextUser);
            if (storageProvider.IsAvailable()) {
                this._providers.push(storageProvider);
                LogStatus('SearchEngine: Storage search provider enabled');
            } else {
                LogStatus('SearchEngine: Storage search provider not available (no searchable accounts configured)');
            }
        }

        this._configured = true;
        LogStatus(`SearchEngine: Configured with ${this._providers.length} provider(s)`);
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

            // Step 1: Run all providers in parallel
            const labeledLists = await this.executeProviders(params.Query, topK, params.Filters, contextUser);
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
            if (mode === 'full') {
                await this._enricher.Enrich(results, contextUser);
            }

            LogStatus(`SearchEngine: Search complete in ${Date.now() - startTime}ms - ${results.length} results`);

            return {
                Success: true,
                Results: results,
                TotalCount: results.length,
                ElapsedMs: Date.now() - startTime,
                SourceCounts: sourceCounts,
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
    // Private helpers
    // ────────────────────────────────────────────────────────────────

    /**
     * Run all available providers in parallel and return labeled result lists.
     */
    private async executeProviders(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo
    ): Promise<LabeledResultList[]> {
        if (this._providers.length === 0) {
            LogStatus('SearchEngine: No providers available');
            return [];
        }

        const promises = this._providers
            .filter(p => p.IsAvailable())
            .map(async (provider): Promise<LabeledResultList> => {
                try {
                    const results = await provider.Search(query, topK, filters, contextUser);
                    return { Source: provider.SourceType, Results: results };
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    LogError(`SearchEngine: Provider "${provider.SourceType}" failed: ${msg}`);
                    return { Source: provider.SourceType, Results: [] };
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
            const md = new Metadata();
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
            ErrorMessage: message,
        };
    }
}
