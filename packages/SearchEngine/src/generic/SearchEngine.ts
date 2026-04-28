/**
 * @fileoverview SearchEngine singleton - the main entry point for multi-source search.
 *
 * Orchestrates search providers discovered from the SearchProvider metadata entity,
 * fuses results with Reciprocal Rank Fusion (RRF), applies enrichment
 * (entity icons, record names, tags), and filters by minimum score.
 *
 * When `SearchParams.ScopeIDs` is provided, the engine resolves each scope against
 * `SearchEngineBase` (which caches all `MJ: Search Scope*` metadata), builds a
 * `ScopeConstraints` object per scope (including Nunjucks-rendered MetadataFilter,
 * ExtraFilter, UserSearchString, and FolderPath values), runs each scope's providers
 * in parallel, then fuses the per-scope results via cross-scope RRF. An optional
 * re-ranker stage (`BaseReRanker`) runs after fusion when configured.
 *
 * Providers are loaded via `@RegisterClass(BaseSearchProvider, DriverClass)` and
 * instantiated using the MJ ClassFactory based on active SearchProvider records.
 *
 * Uses BaseSingleton from @memberjunction/global for a truly global instance.
 *
 * @module @memberjunction/search-engine
 */

import { EntityInfo, EntityPermissionType, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    SearchEngineBase,
    MJSearchProviderEntity,
    MJSearchScopeEntity,
    ScopeBundle
} from '@memberjunction/core-entities';
import { BaseSingleton, MJGlobal, NormalizeUUID } from '@memberjunction/global';
import {
    SearchParams,
    SearchResult,
    SearchResultItem,
    SearchStreamEvent,
    SearchFilters,
    SearchProviderInfo,
    SearchContext,
    ScopeConstraints,
    ScopeExternalIndexConstraint,
    ScopeEntityConstraint,
    ScopeStorageConstraint,
    FusionWeightsByProvider,
} from './search.types';
import { BaseSearchProvider, SearchProviderConfig } from './ISearchProvider';
import { SearchFusion, LabeledResultList } from './SearchFusion';
import { SearchEnricher } from './SearchEnricher';
import { FullTextSearchProvider } from './FullTextSearchProvider';
import { BaseReRanker } from './BaseReRanker';
import { NoopReRanker, LoadNoopReRanker } from './NoopReRanker';
import { RenderScopeTemplate, RenderScopeJsonTemplate } from './ScopeTemplateRenderer';

// Keep the default re-ranker registration alive under tree-shaking
LoadNoopReRanker();

/**
 * Configuration options for the SearchEngine.
 */
export interface SearchEngineConfig {
    /** Default maximum results if not specified in SearchParams (default: 20) */
    DefaultMaxResults?: number;
    /**
     * Default multiplier applied to per-provider `topK` to compensate for residual
     * late permission filtering. Individual calls can override via
     * `SearchParams.PermissionOverfetchFactor`. Default: 2.
     */
    DefaultPermissionOverfetchFactor?: number;
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
    /** The record's raw entity (for driver-class lookups + future per-scope filtering) */
    Record: MJSearchProviderEntity;
}

/** Parsed `SearchScope.ScopeConfig.reRanker` block. */
interface ReRankerConfig {
    driverClass?: string;
    inputTopN?: number;
    outputTopN?: number;
    config?: Record<string, unknown>;
}

/**
 * Singleton search engine that orchestrates multi-source search with RRF fusion.
 *
 * Providers are discovered from the MJ: Search Providers entity. Each active
 * provider's DriverClass is resolved via ClassFactory to create an instance,
 * which is then initialized with the provider's config from the DB record.
 *
 * Usage:
 * ```typescript
 * // Initialize once at server startup
 * await SearchEngine.Instance.Config({}, contextUser);
 *
 * // Execute searches (unscoped — original behavior)
 * const result = await SearchEngine.Instance.Search({
 *     Query: 'quarterly revenue',
 *     MaxResults: 20,
 *     MinScore: 0.1
 * }, contextUser);
 *
 * // Scoped search against two scopes with multi-tenant context
 * const scopedResult = await SearchEngine.Instance.Search({
 *     Query: 'refund policy',
 *     MaxResults: 20,
 *     ScopeIDs: ['hr-scope-id', 'legal-scope-id'],
 *     SearchContext: { PrimaryScopeRecordID: 'tenant-a' }
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
    private _defaultOverfetchFactor = 2;

    /** Access the cached provider metadata from SearchEngineBase */
    protected get Base(): SearchEngineBase {
        return SearchEngineBase.Instance;
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
        this._defaultOverfetchFactor = Math.max(1, config.DefaultPermissionOverfetchFactor ?? 2);
        this._providerEntries = [];

        // Ensure SearchEngineBase has loaded provider + scope metadata
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

        // Sort by priority (lower = higher priority)
        this._providerEntries.sort((a, b) => a.Priority - b.Priority);

        this._configured = true;
        const names = this._providerEntries.map(e => e.Provider.SourceType);
        LogStatus(`SearchEngine: Configured with ${this._providerEntries.length} provider(s): ${names.join(', ')} and ${this.Base.Scopes.length} scope(s)`);
    }

    /**
     * Execute a multi-source search with RRF fusion and optional enrichment.
     *
     * When `params.ScopeIDs` is provided, each scope runs independently and the results
     * are combined via cross-scope RRF before deduplication, re-ranking, and enrichment.
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
            const overfetchFactor = Math.max(1, params.PermissionOverfetchFactor ?? this._defaultOverfetchFactor);
            const providerTopK = Math.max(topK, Math.ceil(topK * overfetchFactor));

            // ──────────────────────────────────────────────────────────
            // Resolve scopes (when supplied)
            // ──────────────────────────────────────────────────────────
            const resolvedScopes = this.resolveScopes(params.ScopeIDs);
            const isUnconstrained = resolvedScopes.length === 0 || resolvedScopes.some(s => s.Scope.IsGlobal);

            // ──────────────────────────────────────────────────────────
            // Execute providers — either unscoped (original path) or per-scope
            // ──────────────────────────────────────────────────────────
            let sourceCounts: { Vector: number; FullText: number; Entity: number; Storage: number };
            let fusedResults: SearchResultItem[];

            if (isUnconstrained) {
                const labeledLists = await this.executeProviders(
                    params.Query,
                    providerTopK,
                    params.Filters,
                    contextUser,
                    isPreview,
                    undefined
                );
                sourceCounts = this.countSources(labeledLists);
                const defaultFusionWeights = params.FusionWeightsOverride;
                fusedResults = this._fusion.Fuse(labeledLists, providerTopK, defaultFusionWeights);
            } else {
                // Run each scope independently, then cross-scope RRF
                const perScopeRunResults = await Promise.all(resolvedScopes.map(bundle =>
                    this.executeScopeBundle(
                        params.Query,
                        providerTopK,
                        params.Filters,
                        contextUser,
                        isPreview,
                        bundle,
                        params.SearchContext,
                        params.FusionWeightsOverride
                    )
                ));

                const sc = { Vector: 0, FullText: 0, Entity: 0, Storage: 0 };
                const perScopeFused = new Map<string, SearchResultItem[]>();
                for (const r of perScopeRunResults) {
                    sc.Vector += r.sourceCounts.Vector;
                    sc.FullText += r.sourceCounts.FullText;
                    sc.Entity += r.sourceCounts.Entity;
                    sc.Storage += r.sourceCounts.Storage;
                    perScopeFused.set(r.scopeID, r.fused);
                }
                sourceCounts = sc;

                if (perScopeFused.size > 1) {
                    fusedResults = this._fusion.CrossScopeFusion(perScopeFused, providerTopK);
                } else {
                    const only = perScopeFused.values().next().value;
                    fusedResults = only ?? [];
                }
            }

            // ──────────────────────────────────────────────────────────
            // Optional re-ranker stage (one per leading scope — pick the first active scope's config)
            // ──────────────────────────────────────────────────────────
            const reRankerConfig = this.pickReRankerConfig(resolvedScopes);
            if (reRankerConfig?.driverClass) {
                fusedResults = await this.runReRanker(
                    params.Query,
                    fusedResults,
                    reRankerConfig,
                    contextUser
                );
            }

            // ──────────────────────────────────────────────────────────
            // Dedup → content-item exclusion → permission safety net → score threshold → enrich
            // ──────────────────────────────────────────────────────────
            let results = this._fusion.Deduplicate(fusedResults);
            results = await this._enricher.ExcludeEntitySourcedContentItems(results, contextUser);

            const beforePermCount = results.length;
            results = await this.filterByPermissions(results, contextUser);
            const lateFilteredCount = beforePermCount - results.length;
            if (lateFilteredCount > 0) {
                // Observability: Section 3.6 — if a provider's push-down is complete, this
                // number should be zero (the safety net should never trim anything).
                LogStatus(`SearchEngine: Residual permission filter removed ${lateFilteredCount} result(s) — consider tightening provider push-down.`);
            }

            const scoreThreshold = params.MinScore ?? 0;
            if (scoreThreshold > 0) {
                results = results.filter(r => r.Score >= scoreThreshold);
            }

            // Trim to caller's requested topK (we overfetched earlier)
            if (results.length > topK) results = results.slice(0, topK);

            if (!isPreview) {
                await this._enricher.Enrich(results, contextUser);
            }

            LogStatus(`SearchEngine: Search complete in ${Date.now() - startTime}ms - ${results.length} result(s)${resolvedScopes.length ? ` across ${resolvedScopes.length} scope(s)` : ''}`);

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
     * Streaming variant of {@link Search}. Yields events as each pipeline
     * stage produces output so the caller can emit partials to the UI / agent
     * before fusion + reranking complete.
     *
     * **Phase 2C v1 semantics:** runs the same internal pipeline as
     * {@link Search} and emits synthetic events at each transition. This
     * preserves all existing fusion / permission / dedup / enrich behavior
     * — important because those steps have subtle correctness rules that
     * we don't want to re-implement in a parallel code path. Per-provider
     * partials are reconstructed from the final SourceCounts; a future
     * refactor (Phase 2C v2) can split provider emission to true real-time
     * concurrent emission once we measure that the synthetic phase is the
     * actual bottleneck.
     *
     * Cancellation: the consumer can stop iterating at any point — the
     * underlying Search() will run to completion but its result is
     * discarded. AbortSignal-based mid-pipeline cancellation is a Phase 2C
     * v2 concern.
     *
     * Event ordering:
     *   1. Zero or more `provider` events (one per non-empty source)
     *   2. Exactly one `fused` event
     *   3. Optional one `reranked` event (when a reranker is configured)
     *   4. Exactly one `final` event
     *   5. On error: a single `error` event in place of `final`.
     *
     * @example
     * for await (const ev of SearchEngine.Instance.streamSearch(params, user)) {
     *   switch (ev.phase) {
     *     case 'provider':  scratchpad.append(`${ev.providerName}: ${ev.results.length} hits`); break;
     *     case 'final':     scratchpad.commit(ev.results); break;
     *     case 'error':     scratchpad.fail(ev.error); break;
     *   }
     * }
     */
    public async *streamSearch(
        params: SearchParams,
        contextUser: UserInfo,
    ): AsyncIterable<SearchStreamEvent> {
        const startTime = Date.now();
        let result: SearchResult;
        try {
            result = await this.Search(params, contextUser);
        } catch (err) {
            yield { phase: 'error', error: err instanceof Error ? err.message : String(err) };
            return;
        }

        if (!result.Success) {
            yield { phase: 'error', error: result.ErrorMessage ?? 'Search failed' };
            return;
        }

        // Emit one provider event per non-empty source. The aggregate result
        // doesn't preserve per-provider lists, so we reconstruct by source
        // type — which is what consumers actually care about (entity vs
        // full-text vs vector vs storage). Order is intentional: vector and
        // full-text first because they're typically fastest to return,
        // entity last because it usually does the most SQL work.
        const partition: Array<{ name: string; results: SearchResultItem[] }> = [
            { name: 'Vector',   results: result.Results.filter(r => (r.SourceType ?? '').toLowerCase() === 'vector') },
            { name: 'FullText', results: result.Results.filter(r => (r.SourceType ?? '').toLowerCase() === 'fulltext') },
            { name: 'Storage',  results: result.Results.filter(r => (r.SourceType ?? '').toLowerCase() === 'storage') },
            { name: 'Entity',   results: result.Results.filter(r => (r.SourceType ?? '').toLowerCase() === 'entity') },
        ];
        const totalElapsed = Date.now() - startTime;
        const perProviderDuration = Math.max(1, Math.floor(totalElapsed / Math.max(1, partition.filter(p => p.results.length > 0).length)));
        for (const p of partition) {
            if (p.results.length === 0) continue;
            yield {
                phase: 'provider',
                providerName: p.name,
                results: p.results,
                durationMs: perProviderDuration,
            };
        }

        yield { phase: 'fused', results: result.Results };

        // The reranker stage in Search() is opaque from outside, so this
        // event fires only when the result set is non-empty AND we observe
        // that a reranker config was applied. We keep it conservative: omit
        // the event rather than mislead consumers into thinking reranking
        // happened when it didn't.
        // (Intentionally no reranker emission in v1 — tracked for v2.)

        yield {
            phase: 'final',
            results: result.Results,
            sourceCounts: result.SourceCounts,
            elapsedMs: result.ElapsedMs,
        };
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
    // Scope resolution
    // ────────────────────────────────────────────────────────────────

    /**
     * Load `ScopeBundle`s for each requested scope ID, filtering out inactive / expired.
     * Returns an empty array when no scope IDs are supplied (caller treats as Global).
     */
    private resolveScopes(scopeIDs?: string[]): ScopeBundle[] {
        if (!scopeIDs || scopeIDs.length === 0) return [];
        const bundles: ScopeBundle[] = [];
        for (const id of scopeIDs) {
            const scope = this.Base.GetActiveScopeByID(id);
            if (!scope) {
                LogStatus(`SearchEngine: Requested scope "${id}" is not active or does not exist — skipping.`);
                continue;
            }
            const bundle = this.Base.GetScopeBundle(id);
            if (bundle) bundles.push(bundle);
        }
        return bundles;
    }

    /**
     * Execute all scoped providers for a single scope bundle and return per-scope fused results.
     */
    private async executeScopeBundle(
        query: string,
        topK: number,
        filters: SearchFilters | undefined,
        contextUser: UserInfo,
        isPreview: boolean,
        bundle: ScopeBundle,
        searchContext: SearchContext | undefined,
        agentFusionWeights: FusionWeightsByProvider | undefined
    ): Promise<{
        scopeID: string;
        fused: SearchResultItem[];
        sourceCounts: { Vector: number; FullText: number; Entity: number; Storage: number };
    }> {
        const scope = bundle.Scope;
        const scopeConfig = this.parseJson(scope.ScopeConfig);
        const constraints = this.buildScopeConstraints(bundle, searchContext);
        const perProviderQueryTransforms = constraints.QueryTransforms ?? {};

        // Determine which providers this scope participates in (SearchScopeProvider rows)
        const scopeProviderIDs = new Set(bundle.Providers.map(p => NormalizeUUID(p.SearchProviderID)));
        const allowAllProviders = scopeProviderIDs.size === 0; // empty = scope is IsGlobal or all-inclusive

        const applicableProviders = this._providerEntries.filter(entry => {
            if (!entry.Provider.IsAvailable()) return false;
            if (isPreview && !entry.SupportsPreview) return false;
            if (allowAllProviders) return true;
            return scopeProviderIDs.has(NormalizeUUID(entry.ID));
        });

        if (applicableProviders.length === 0) {
            LogStatus(`SearchEngine: Scope "${scope.Name}" has no applicable providers — skipping.`);
            return {
                scopeID: scope.ID,
                fused: [],
                sourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 }
            };
        }

        // Resolve per-provider `SearchScopeProvider.MaxResultsOverride` if present
        const promises = applicableProviders.map(async (entry): Promise<LabeledResultList> => {
            try {
                const spRow = bundle.Providers.find(r => NormalizeUUID(r.SearchProviderID) === NormalizeUUID(entry.ID));
                const effectiveTopK = spRow?.MaxResultsOverride ?? entry.MaxResultsOverride ?? topK;

                // If this provider has a per-provider QueryTransform override, stash it
                // under the provider's SourceType in QueryTransforms so the provider finds it.
                const perProviderConstraints: ScopeConstraints = {
                    ...constraints,
                    QueryTransforms: { ...perProviderQueryTransforms }
                };
                // (Note: actual Nunjucks-rendered `QueryTransformTemplateID` resolution for
                // stored templates lives in AgentPreExecutionRAG/ScopedSearchAction, not here.
                // This engine only forwards already-rendered strings that the caller provides.)

                const providerResults = await entry.Provider.Search(
                    query,
                    effectiveTopK,
                    filters,
                    contextUser,
                    perProviderConstraints
                );
                // Stamp provider metadata onto each result
                for (const r of providerResults) {
                    r.ProviderId = entry.ID;
                    r.ProviderLabel = entry.DisplayName;
                    r.ProviderIcon = entry.Icon;
                }
                return { Source: entry.Provider.SourceType, Results: providerResults };
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                LogError(`SearchEngine: Provider "${entry.Provider.SourceType}" failed in scope "${scope.Name}": ${msg}`);
                return { Source: entry.Provider.SourceType, Results: [] };
            }
        });

        const labeled = await Promise.all(promises);
        const sourceCounts = this.countSources(labeled);

        // Per-scope fusion with weight resolution:
        //   agent fusion weights > scope.ScopeConfig.fusionWeights > engine defaults
        const scopeWeights = scopeConfig && typeof scopeConfig.fusionWeights === 'object'
            ? scopeConfig.fusionWeights as FusionWeightsByProvider
            : undefined;
        const fusionWeights = agentFusionWeights ?? scopeWeights;

        const fused = this._fusion.Fuse(labeled, topK, fusionWeights);
        return { scopeID: scope.ID, fused, sourceCounts };
    }

    /**
     * Assemble a `ScopeConstraints` for a single scope: Nunjucks-render each template
     * field against the `SearchContext`, then hand the rendered values to providers.
     */
    private buildScopeConstraints(
        bundle: ScopeBundle,
        searchContext: SearchContext | undefined
    ): ScopeConstraints {
        const externalIndexes: ScopeExternalIndexConstraint[] = bundle.ExternalIndexes.map(row => ({
            SearchScopeExternalIndexID: row.ID,
            IndexType: row.IndexType,
            VectorIndexID: row.VectorIndexID ?? undefined,
            ExternalIndexName: row.ExternalIndexName ?? undefined,
            ExternalIndexConfig: this.parseJson(row.ExternalIndexConfig),
            MetadataFilter: RenderScopeJsonTemplate(row.MetadataFilter, searchContext)
        }));

        const entities: ScopeEntityConstraint[] = bundle.Entities.map(row => ({
            SearchScopeEntityID: row.ID,
            EntityID: row.EntityID,
            EntityName: this.lookupEntityName(row.EntityID),
            ExtraFilter: row.ExtraFilter ? RenderScopeTemplate(row.ExtraFilter, searchContext) : undefined,
            UserSearchString: row.UserSearchString ? RenderScopeTemplate(row.UserSearchString, searchContext) : undefined
        }));

        const storage: ScopeStorageConstraint[] = bundle.StorageAccounts.map(row => ({
            SearchScopeStorageAccountID: row.ID,
            FileStorageAccountID: row.FileStorageAccountID,
            FolderPath: row.FolderPath ? RenderScopeTemplate(row.FolderPath, searchContext) : undefined
        }));

        // Per-provider query transforms: resolved from SearchScopeProvider.QueryTransformTemplateID
        // For stored template IDs we need the TemplateEngine — that resolution happens in
        // Phase 1C (AgentPreExecutionRAG) before this engine is called. We still honor any
        // pre-rendered transforms that upstream callers placed in the scope config bag.
        const scopeConfig = this.parseJson(bundle.Scope.ScopeConfig);
        const rawTransforms = scopeConfig?.perProviderQueryTransforms;
        const queryTransforms = rawTransforms && typeof rawTransforms === 'object'
            ? { ...rawTransforms as Record<string, string> }
            : undefined;

        return {
            ExternalIndexes: externalIndexes.length ? externalIndexes : undefined,
            Entities: entities.length ? entities : undefined,
            StorageAccounts: storage.length ? storage : undefined,
            Context: searchContext,
            QueryTransforms: queryTransforms,
            ScopeConfig: scopeConfig ?? undefined
        };
    }

    /** Resolve the EntityID → EntityName via MJ Metadata (for passing to providers that key by name). */
    private lookupEntityName(entityID: string): string {
        try {
            const md = new Metadata();
            const entity = md.Entities.find(e => NormalizeUUID(e.ID) === NormalizeUUID(entityID));
            return entity?.Name ?? '';
        } catch {
            return '';
        }
    }

    // ────────────────────────────────────────────────────────────────
    // Re-ranker
    // ────────────────────────────────────────────────────────────────

    /**
     * Pick a re-ranker config for this search. When multiple scopes are in play, we
     * use the first scope's config (matching task 1B.17: the re-rank stage is one
     * call applied AFTER cross-scope fusion). A future enhancement could merge
     * per-scope re-rankers, but the current plan keeps it simple.
     */
    private pickReRankerConfig(resolvedScopes: ScopeBundle[]): ReRankerConfig | undefined {
        for (const bundle of resolvedScopes) {
            const scopeConfig = this.parseJson(bundle.Scope.ScopeConfig);
            const rr = scopeConfig?.reRanker as ReRankerConfig | undefined;
            if (rr?.driverClass) return rr;
        }
        return undefined;
    }

    private async runReRanker(
        query: string,
        candidates: SearchResultItem[],
        cfg: ReRankerConfig,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        if (!cfg.driverClass || candidates.length === 0) return candidates;

        try {
            const reRanker = MJGlobal.Instance.ClassFactory.CreateInstance<BaseReRanker>(
                BaseReRanker,
                cfg.driverClass
            ) ?? new NoopReRanker();

            const inputTopN = cfg.inputTopN ?? Math.min(100, candidates.length);
            const outputTopN = cfg.outputTopN ?? Math.min(20, inputTopN);
            const trimmed = candidates.slice(0, inputTopN);
            const ranked = await reRanker.ReRank(query, trimmed, outputTopN, contextUser, cfg.config);
            LogStatus(`SearchEngine: Re-ranker "${cfg.driverClass}" returned ${ranked.length} result(s) (input=${trimmed.length}, outputTopN=${outputTopN})`);
            return ranked;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchEngine: Re-ranker "${cfg.driverClass}" failed, falling back to unranked: ${msg}`);
            return candidates;
        }
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
                    Record: record,
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
    // Search execution helpers (unscoped path)
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
        isPreview: boolean,
        scopeConstraints: ScopeConstraints | undefined
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
                const results = await entry.Provider.Search(query, providerTopK, filters, contextUser, scopeConstraints);
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
                    counts.Vector += list.Results.length;
                    break;
                case 'fulltext':
                    counts.FullText += list.Results.length;
                    break;
                case 'entity':
                    counts.Entity += list.Results.length;
                    break;
                case 'storage':
                    counts.Storage += list.Results.length;
                    break;
            }
        }
        return counts;
    }

    // ────────────────────────────────────────────────────────────────
    // Permission filtering (residual late safety net)
    // ────────────────────────────────────────────────────────────────

    /**
     * Filter search results by entity-level and row-level security permissions.
     *
     * **This is a safety net.** Providers are expected to do per-provider permission
     * push-down (Section 3.6 of plans/search-scopes-rag-plus.md). If this filter is
     * removing more than a handful of results in practice, the responsible provider's
     * push-down is incomplete and should be fixed.
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

        // Preserve the input order (which is the RRF/re-rank order). groupResultsByEntity
        // scrambles by entity; re-sort by original position so consumers still see the
        // best-ranked result first.
        const inputIndex = new Map<SearchResultItem, number>();
        results.forEach((r, i) => inputIndex.set(r, i));
        permitted.sort((a, b) => (inputIndex.get(a) ?? 0) - (inputIndex.get(b) ?? 0));

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

    /** Defensive JSON parse that never throws. Returns `null` on any failure. */
    private parseJson(value: string | null | undefined): Record<string, unknown> | null {
        if (!value) return null;
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
            return null;
        } catch {
            return null;
        }
    }
}
