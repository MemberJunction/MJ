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

import { EntityInfo, EntityPermissionType, IMetadataProvider, LogError, LogStatus, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    SearchEngineBase,
    MJSearchProviderEntity,
    MJSearchScopeEntity,
    MJSearchExecutionLogEntity,
    MJAIAgentEntity,
    MJAISkillEntity,
    ScopeBundle
} from '@memberjunction/core-entities';
import { BaseSingleton, MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
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
    DimensionExplanation,
    ScopePrincipals,
} from './search.types';
import { BaseSearchProvider, SearchProviderConfig } from './ISearchProvider';
import { SearchFusion, LabeledResultList } from './SearchFusion';
import { SearchEnricher } from './SearchEnricher';
import { FullTextSearchProvider } from './FullTextSearchProvider';
import { BaseReRanker } from './BaseReRanker';
import { NoopReRanker, LoadNoopReRanker } from './NoopReRanker';
import { RerankerBudgetGuard } from '../rerankers/RerankerBudgetGuard';
import { RenderScopeTemplate, RenderScopeJsonTemplate } from './ScopeTemplateRenderer';
import { LaneKindForIndexType } from './ScopeValueEscaper';
import { CheckRenderedTemplate, CheckRequiredMetadataKeys, ParseRequiredMetadataKeys } from './ScopeFilterGuard';
import { ScopeDimensionResolver } from './ScopeDimensionResolver';
import {
    ScopeExplanation,
    ExplainScopeInput,
    LaneExplanation,
    EntitlementExplanation,
} from './ScopeExplanation';
import { DefaultSearchScopePermissionResolver } from '../permissions/SearchScopePermissionResolver';

/**
 * Collects lane problems keyed by the lane's **row ID** instead of throwing.
 *
 * Present ⇒ the caller is EXPLAINING a hypothetical search and wants every broken lane in one
 * pass. Absent ⇒ the caller is RUNNING a real search and the first unusable restriction must
 * abort it, because the alternative is querying that lane unfiltered.
 *
 * Keyed by row ID rather than by display name: two `SearchScopeEntity` rows over the SAME
 * entity is a legitimate configuration (two different `ExtraFilter`s), and keying by the entity
 * name made them collide — one broken lane then reported its sibling as skipped too.
 */
type LaneProblemCollector = Map<string, string>;

/**
 * Emitted whenever a scope configures no lanes at all — which in MJ means UNSCOPED, not narrow.
 * Shared by the dry run and the search path so both produce identical wording.
 */
const UNBOUNDED_SCOPE_DIAGNOSTIC =
    'this scope configures NO lanes (no external indexes, entities, or storage accounts). ' +
    'That is not a narrow scope — providers read an empty configuration as UNSCOPED, so it ' +
    'searches everything available to them with no filter.';

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
 * Callback fired the moment an individual provider's `Search()` resolves —
 * before fusion, dedup, permission filtering, or rerank. Used by
 * {@link SearchEngine.streamSearch} to emit `provider` events as each
 * provider returns rather than waiting for the whole pipeline. The callback
 * runs inside the provider's promise chain, so any throw it raises will
 * cancel that provider's contribution but won't take down the search.
 */
export type OnProviderResolved = (event: {
    /** Source type as reported by the provider (e.g. 'vector', 'fulltext'). */
    sourceType: string;
    /** Result rows from this provider, with metadata already stamped. */
    results: SearchResultItem[];
    /** Wall-clock time spent inside `Provider.Search()` for this invocation. */
    durationMs: number;
    /** Scope ID when running per-scope; undefined when unconstrained. */
    scopeID?: string;
}) => void;

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

    /**
     * Minimum trimmed query length we accept. A single-character query against a
     * `LIKE '%term%'` fan-out is essentially a full-database scan with negligible
     * relevance — the providers also enforce this, but we short-circuit here to
     * avoid the cache lookup and provider dispatch overhead too. Set to 2 (was 3) so
     * legitimate short queries aren't silently dropped (bug C3); must stay in lockstep
     * with the providers' MIN_TERM_LENGTH.
     */
    private static readonly MIN_TERM_LENGTH = 2;

    /**
     * Result cache TTL. 30s balances "user resubmits the same prefix" wins against
     * "results stay reasonably fresh after a write". Cache key includes the user's
     * ID so two users with different RLS scopes never share an entry.
     */
    private static readonly CACHE_TTL_MS = 30_000;

    /** Maximum cached entries across all users. LRU-evicted on overflow. */
    private static readonly CACHE_MAX_ENTRIES = 500;

    private _cache: Map<string, { result: SearchResult; expires: number }> = new Map();

    private _dimensionResolver = new ScopeDimensionResolver();

    /**
     * Resolver for a scope's declared Search Context dimensions. Overridable so a host can
     * supply additional derivation sources (e.g. an external signal) without forking the engine.
     */
    protected get dimensionResolver(): ScopeDimensionResolver {
        return this._dimensionResolver;
    }

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

        // Propagate the metadata provider to the enricher for entity lookups
        this._enricher.Provider = this.ProviderToUse;

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
        return this.searchInternal(params, contextUser);
    }

    /**
     * Internal search implementation that optionally fires `onProviderResolved`
     * as each provider's promise settles. Exposed via the public {@link Search}
     * (no callback) and {@link streamSearch} (queue-backed callback that
     * yields `provider` events to the caller).
     */
    private async searchInternal(
        params: SearchParams,
        contextUser: UserInfo,
        onProviderResolved?: OnProviderResolved,
    ): Promise<SearchResult> {
        const startTime = Date.now();
        // Per-invocation tracking for the post-search SearchExecutionLog row (P3.2).
        let invocationBudgetGuard: RerankerBudgetGuard | null = null;
        let invocationRerankerName: string | null = null;

        try {
            // Defensive null-check: `params.Query.trim()` throws on null/undefined,
            // and Sage's LLM has been observed to emit empty/missing tool args.
            // Coerce to string before validating so we surface a clean error
            // instead of a TypeError that would also skip the audit-log row.
            if (params.Query == null || typeof params.Query !== 'string' || !params.Query.trim()) {
                this.logSearchExecution({
                    Status: 'Failure',
                    FailureReason: 'Query cannot be empty',
                    Query: typeof params.Query === 'string' ? params.Query : '',
                    ScopeIDs: params.ScopeIDs,
                    StartTime: startTime,
                    ResultCount: 0,
                    RerankerName: null,
                    RerankerCostCents: null,
                    SourceCounts: undefined,
                    ContextUser: contextUser,
                    AIAgentID: params.AIAgentID ?? null,
                    AISkillID: params.AISkillID ?? null,
                    PrimaryScopeRecordID: params.SearchContext?.PrimaryScopeRecordID ?? null,
                });
                return this.buildErrorResult('Query cannot be empty', startTime);
            }
            const trimmed = params.Query.trim();
            if (trimmed.length < SearchEngine.MIN_TERM_LENGTH) {
                // Short queries hit unindexed table-scans fanned out across every
                // searchable entity with negligible relevance. Return an empty
                // success result rather than burning resources.
                return {
                    Success: true,
                    Results: [],
                    TotalCount: 0,
                    ElapsedMs: Date.now() - startTime,
                    SourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
                    Providers: this._configured ? this.buildProviderInfoList() : [],
                };
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
            // Cache lookup (next PR #2532). Skip preview searches — they're already
            // cheap and caching would mask config changes during dev. Cache key
            // includes the user's ID so two users with different RLS scopes never
            // share an entry.
            // ──────────────────────────────────────────────────────────
            const cacheKey = isPreview ? null : this.buildCacheKey(trimmed, params, contextUser);
            if (cacheKey) {
                const hit = this._cache.get(cacheKey);
                if (hit && hit.expires > Date.now()) {
                    // Move to end for LRU recency
                    this._cache.delete(cacheKey);
                    this._cache.set(cacheKey, hit);
                    return { ...hit.result, ElapsedMs: Date.now() - startTime };
                }
                if (hit) this._cache.delete(cacheKey); // expired
            }

            // ──────────────────────────────────────────────────────────
            // Execute providers — either unscoped (original path) or per-scope
            // ──────────────────────────────────────────────────────────
            let sourceCounts: { Vector: number; FullText: number; Entity: number; Storage: number };
            let fusedResults: SearchResultItem[];
            // Per-scope decisions, captured for SearchExecutionLog.ScopeDecisionJSON. Empty on
            // the unconstrained path, which resolves no scope and therefore decides nothing.
            const scopeDecisions: ScopeExplanation[] = [];

            if (isUnconstrained) {
                const labeledLists = await this.executeProviders(
                    params.Query,
                    providerTopK,
                    params.Filters,
                    contextUser,
                    isPreview,
                    undefined,
                    onProviderResolved,
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
                        params.FusionWeightsOverride,
                        this.principalsFrom(params),
                        onProviderResolved,
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
                    scopeDecisions.push(r.decision);
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
                // Budget guard (P2D.6): cap real-provider rerank spend at the scope's
                // RerankerBudgetCents. Pulled from the same scope that supplied the
                // reranker config — keeping the policy local to the scope that opted in.
                const budgetCents = this.pickRerankerBudgetCents(resolvedScopes);
                invocationBudgetGuard = new RerankerBudgetGuard(budgetCents);
                invocationRerankerName = reRankerConfig.driverClass;
                fusedResults = await this.runReRanker(
                    params.Query,
                    fusedResults,
                    reRankerConfig,
                    contextUser,
                    invocationBudgetGuard,
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

            this.logSearchExecution({
                Status: 'Success',
                FailureReason: null,
                Query: params.Query,
                ScopeIDs: params.ScopeIDs,
                StartTime: startTime,
                ResultCount: results.length,
                RerankerName: invocationRerankerName,
                RerankerCostCents: invocationBudgetGuard ? invocationBudgetGuard.Spent : null,
                SourceCounts: sourceCounts,
                ContextUser: contextUser,
                AIAgentID: params.AIAgentID ?? null,
                AISkillID: params.AISkillID ?? null,
                PrimaryScopeRecordID: params.SearchContext?.PrimaryScopeRecordID ?? null,
                ScopeDecisions: scopeDecisions,
            });

            const finalResult: SearchResult = {
                Success: true,
                Results: results,
                TotalCount: results.length,
                ElapsedMs: Date.now() - startTime,
                SourceCounts: sourceCounts,
                Providers: this.buildProviderInfoList(),
            };

            if (cacheKey) {
                this.cachePut(cacheKey, finalResult);
            }

            return finalResult;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchEngine: Search failed: ${msg}`);
            this.logSearchExecution({
                Status: 'Failure',
                FailureReason: msg,
                Query: params.Query,
                ScopeIDs: params.ScopeIDs,
                StartTime: startTime,
                ResultCount: 0,
                RerankerName: invocationRerankerName,
                RerankerCostCents: invocationBudgetGuard ? invocationBudgetGuard.Spent : null,
                SourceCounts: undefined,
                ContextUser: contextUser,
                AIAgentID: params.AIAgentID ?? null,
                AISkillID: params.AISkillID ?? null,
                PrimaryScopeRecordID: params.SearchContext?.PrimaryScopeRecordID ?? null,
            });
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
        // Phase 2C v2: true concurrent emission. The internal search is run
        // with an `onProviderResolved` callback that pushes a `provider`
        // event into a queue the moment each provider's promise settles.
        // The generator drains the queue while the search keeps running, so
        // `provider` events arrive as fast as their providers resolve. After
        // the search completes (or errors) we emit `fused` + `final` (or
        // `error`) and close the iterator.
        //
        // Cancellation: if the consumer breaks out of `for await`, the
        // generator's `return()` runs and the underlying search is allowed
        // to finish in the background (its result is discarded). Mid-pipeline
        // AbortSignal propagation is a future enhancement.

        const queue: SearchStreamEvent[] = [];
        let resolveNext: (() => void) | null = null;
        let done = false;

        const push = (ev: SearchStreamEvent): void => {
            queue.push(ev);
            if (resolveNext) {
                const r = resolveNext;
                resolveNext = null;
                r();
            }
        };

        const finish = (): void => {
            done = true;
            if (resolveNext) {
                const r = resolveNext;
                resolveNext = null;
                r();
            }
        };

        // Source-type → friendly provider label mapping for stable UI display.
        // Keys are lowercased to match what providers report.
        const sourceTypeToLabel: Record<string, string> = {
            vector: 'Vector',
            fulltext: 'FullText',
            entity: 'Entity',
            storage: 'Storage',
        };

        const onProviderResolved: OnProviderResolved = (ev) => {
            const label = sourceTypeToLabel[ev.sourceType.toLowerCase()] ?? ev.sourceType;
            push({
                phase: 'provider',
                providerName: label,
                results: ev.results,
                durationMs: ev.durationMs,
            });
        };

        // Kick off the search; do NOT await it here — we want the generator
        // loop below to interleave with the provider callbacks.
        const searchPromise = (async () => {
            try {
                const result = await this.searchInternal(params, contextUser, onProviderResolved);
                if (!result.Success) {
                    push({ phase: 'error', error: result.ErrorMessage ?? 'Search failed' });
                    return;
                }
                push({ phase: 'fused', results: result.Results });
                // Reranker emission is intentionally elided here — the engine's
                // post-fusion rerank fires inside `searchInternal` before this
                // point, and observers seeking that signal should look at the
                // final SearchExecutionLog row. Keeping this generator narrow
                // avoids leaking rerank internals into a streaming surface that
                // can't faithfully separate them from fusion.
                push({
                    phase: 'final',
                    results: result.Results,
                    sourceCounts: result.SourceCounts,
                    elapsedMs: result.ElapsedMs,
                });
            } catch (err) {
                push({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
            } finally {
                finish();
            }
        })();

        // Drain the queue. The loop blocks on `resolveNext` between bursts
        // so that we don't busy-spin while waiting for providers.
        try {
            while (true) {
                if (queue.length > 0) {
                    yield queue.shift()!;
                    continue;
                }
                if (done) {
                    break;
                }
                await new Promise<void>((resolve) => {
                    resolveNext = resolve;
                });
            }
        } finally {
            // If the consumer aborts mid-iteration, surface any background
            // error so it isn't silently swallowed. We don't await the
            // promise on the happy path because `done` already implies it
            // settled.
            if (!done) {
                searchPromise.catch(() => { /* already pushed as error event */ });
            }
        }
    }

    /**
     * Deterministically serialize a value with object keys sorted, so that two
     * logically-identical inputs always produce the same string.
     *
     * `JSON.stringify` preserves *insertion* order, which means a caller that builds
     * `SecondaryScopes` by spreading (a common pattern) can emit the same dimensions in
     * different orders across calls. Left unsorted that causes avoidable cache misses;
     * sorted, identity is stable. Array order is PRESERVED — see buildCacheKey for why
     * `ScopeIDs` order is significant.
     */
    protected stableStringify(value: unknown): string {
        if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
        if (Array.isArray(value)) return `[${value.map((v) => this.stableStringify(v)).join(',')}]`;
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${this.stableStringify(v)}`).join(',')}}`;
    }

    /**
     * Build a stable cache key for a search.
     *
     * The key must include EVERY input that can change the result set, or the cache
     * will serve one caller's results to another. Two of those inputs were previously
     * missing and both are tenancy/authorization-relevant:
     *
     *  - `SearchContext` — carries `PrimaryScopeRecordID` (the TENANT) and the
     *    `SecondaryScopes` dimensions. Omitting it meant a user with access to two
     *    tenants could be served the other tenant's results for up to the cache TTL,
     *    and that two searches differing only by dimension (channel, skill, …)
     *    collided. This is the reason for the fix.
     *  - `ScopeIDs` — determines which corpora are searched at all.
     *
     * Also folded in: `Mode`, `FusionWeightsOverride` and `PermissionOverfetchFactor`
     * (all change ranking or the candidate pool, so they change results) and
     * `AIAgentID` (conservative: agent identity participates in scope resolution and
     * per-agent overrides upstream; including it can only cost a miss, never leak).
     *
     * `ScopeIDs` order is deliberately NOT sorted: it is behaviourally significant,
     * because cross-scope reranker config and budget are taken from the first scope in
     * the array that supplies one. Two different orderings can therefore produce
     * different results and must not share a key.
     *
     * The whole projection is emitted through `stableStringify` so key-order variation
     * in `SecondaryScopes` doesn't fragment the cache. The user ID stays as a readable
     * prefix for debuggability.
     *
     * Note this runs AFTER scope resolution in `searchInternal`, so nothing here is
     * circular. Entitlement is resolved by the CALLERS (`__Scoped_Search`, the
     * GraphQL resolvers), which deny before reaching the engine; the engine therefore
     * never caches across an allow/deny boundary.
     */
    protected buildCacheKey(trimmed: string, params: SearchParams, contextUser: UserInfo): string {
        const userKey = (contextUser as unknown as { ID?: string })?.ID ?? 'anonymous';
        const f = params.Filters ?? {};
        const projection = {
            // Order-insensitive: sorted so equivalent filter sets share an entry.
            Filters: {
                EntityNames: f.EntityNames ? [...f.EntityNames].sort() : undefined,
                SourceTypes: f.SourceTypes ? [...f.SourceTypes].sort() : undefined,
                Tags: f.Tags ? [...f.Tags].sort() : undefined,
            },
            MaxResults: params.MaxResults ?? this._defaultMaxResults,
            MinScore: params.MinScore ?? 0,
            Mode: params.Mode ?? undefined,
            // Order-SENSITIVE — do not sort (see doc comment).
            ScopeIDs: params.ScopeIDs ?? undefined,
            SearchContext: params.SearchContext
                ? {
                      PrimaryScopeEntityID: params.SearchContext.PrimaryScopeEntityID ?? undefined,
                      PrimaryScopeRecordID: params.SearchContext.PrimaryScopeRecordID ?? undefined,
                      SecondaryScopes: params.SearchContext.SecondaryScopes ?? undefined,
                  }
                : undefined,
            FusionWeightsOverride: params.FusionWeightsOverride ?? undefined,
            PermissionOverfetchFactor: params.PermissionOverfetchFactor ?? undefined,
            AIAgentID: params.AIAgentID ?? undefined,
            // Same reasoning as AIAgentID, and Phase D is what makes it load-bearing: a skill is
            // a principal that can reach a scope the user's own roles do not grant, and it binds
            // into expansion queries. Two searches identical but for the active skill are NOT
            // interchangeable, so they must not share a cache entry.
            AISkillID: params.AISkillID ?? undefined,
        };
        return `${userKey}|${trimmed}|${this.stableStringify(projection)}`;
    }

    /** Insert into the LRU cache, evicting oldest entries when over capacity. */
    private cachePut(key: string, result: SearchResult): void {
        if (this._cache.size >= SearchEngine.CACHE_MAX_ENTRIES) {
            // Map iteration order is insertion order — the first entry is oldest.
            const oldest = this._cache.keys().next().value;
            if (oldest !== undefined) this._cache.delete(oldest);
        }
        this._cache.set(key, { result, expires: Date.now() + SearchEngine.CACHE_TTL_MS });
    }

    /** Test / admin hook: clear the result cache. */
    public ClearResultCache(): void {
        this._cache.clear();
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
    // Dry run — explain the bound without executing a search
    // ────────────────────────────────────────────────────────────────

    /**
     * Resolve the entire access chain for one or more scopes and report what a search WOULD be
     * able to reach — **without querying any provider**.
     *
     * This is the answer to a question the platform previously could not answer at all: *"as
     * this user, with this skill active, for this tenant — what is in bounds?"* Every input to
     * that decision is transient. A grant applies because a time window is open right now; a
     * dimension is discarded because it was caller-authored on a `ServerDerived` key; a lane is
     * skipped because its filter lost an `{% if %}` clause. Afterwards, none of it is visible:
     * a correctly-bounded result set and an accidentally-widened one look identical.
     *
     * Note the distinction from {@link PreviewSearch}, which is a real search capped at a few
     * results. This runs **no** search — it reports the bound, not a sample of what is inside
     * it. A sample cannot show you an over-broad bound, because the extra documents it would
     * newly permit are exactly the ones you did not think to look for.
     *
     * Two properties make the output trustworthy:
     *
     *  - It takes the **same untrusted `SearchContext` a real caller would send**, so the
     *    preview shows the anti-spoof discard actually happening. A dry run that only accepted
     *    pre-sanitized input would hide the one thing worth previewing.
     *  - It reports **every** broken lane in one pass rather than throwing on the first, so a
     *    misconfigured scope can be fixed in one sitting instead of one error per re-run.
     *
     * Unlike a real search this never throws for a scope-level problem; a scope that would fail
     * closed comes back with `Reachable: false` and the reason, since "it would have failed"
     * is precisely the finding the caller asked for.
     *
     * @param input   scopes to explain plus the hypothetical caller context and principals
     * @param contextUser the user to evaluate entitlement for
     * @returns one explanation per requested scope, in the order requested
     */
    public async ExplainScope(input: ExplainScopeInput, contextUser: UserInfo): Promise<ScopeExplanation[]> {
        const explanations: ScopeExplanation[] = [];
        for (const scopeID of input.ScopeIDs) {
            explanations.push(await this.explainOneScope(scopeID, input, contextUser));
        }
        return explanations;
    }

    /**
     * Build the principal set a dimension's expansion query may bind.
     *
     * Exists so the real search path and the `ExplainScope` dry run cannot construct principals
     * differently. They already did once: `ExplainScope` passed the agent and the search path
     * passed nothing, so any scope deriving its bound from `AgentID` previewed one bound and
     * searched with another. A single conversion site makes that class of drift unrepresentable
     * rather than merely fixed.
     *
     * Accepts anything carrying the two principal IDs, which both `SearchParams` and
     * `ExplainScopeInput` do.
     */
    protected principalsFrom(source: { AIAgentID?: string | null; AISkillID?: string | null }): ScopePrincipals {
        return { AgentID: source.AIAgentID ?? null, SkillID: source.AISkillID ?? null };
    }

    /** Explain a single scope. Never throws — a failure to resolve IS the explanation. */
    private async explainOneScope(
        scopeID: string,
        input: ExplainScopeInput,
        contextUser: UserInfo
    ): Promise<ScopeExplanation> {
        const bundle = this.Base.GetScopeBundle(scopeID);
        const scope = bundle?.Scope ?? this.Base.GetActiveScopeByID(scopeID);
        if (!bundle || !scope) {
            return this.buildUnresolvableExplanation(scopeID, input, contextUser);
        }

        const entitlement = await this.explainEntitlement(scopeID, input, contextUser);

        // Resolve dimensions against the caller's UNSANITIZED context, exactly as a real search
        // would. A ScopeDimensionError means the search would have failed closed — that is a
        // legitimate result here, so it is reported rather than propagated.
        let dimensions: DimensionExplanation[] = [];
        const diagnostics: string[] = [];
        let effectiveContext: SearchContext | undefined;
        let dimensionFailure: string | null = null;
        try {
            const resolved = await this.dimensionResolver.Resolve({
                Scope: scope,
                CallerContext: input.SearchContext,
                ContextUser: contextUser,
                Principals: this.principalsFrom(input),
            });
            dimensions = resolved.Provenance;
            diagnostics.push(...resolved.Diagnostics);
            effectiveContext = resolved.Context;
        } catch (e) {
            dimensionFailure = e instanceof Error ? e.message : String(e);
            diagnostics.push(`dimension resolution FAILED — a real search would be refused: ${dimensionFailure}`);
        }

        // With dimensions unresolved there is no context to render lanes against, so every lane
        // is reported as skipped for that reason rather than rendered against a partial bound.
        const lanes = dimensionFailure
            ? this.buildAllLanesSkipped(bundle, `dimension resolution failed: ${dimensionFailure}`)
            : this.explainLanes(bundle, effectiveContext);

        // A scope with NO lanes at all is not a narrow scope — it is MJ's widest. Empty child
        // collections are collapsed to `undefined` by buildScopeConstraints, and every provider
        // reads that as "unscoped": all entities, all indexes, no filter. Treating zero lanes as
        // unreachable inverted the one finding a reviewer most needs, so it is called out
        // explicitly instead.
        const hasLanes = lanes.length > 0;
        if (!hasLanes) {
            diagnostics.push(UNBOUNDED_SCOPE_DIAGNOSTIC);
        }
        const canRetrieve = hasLanes ? lanes.some((l) => l.Status === 'Active') : true;

        return {
            ScopeID: scope.ID,
            ScopeName: scope.Name,
            Entitlement: entitlement,
            Dimensions: dimensions,
            Lanes: lanes,
            Diagnostics: diagnostics,
            Reachable: entitlement.Allowed && canRetrieve && !dimensionFailure,
            Unbounded: !hasLanes,
            ResolvedContext: effectiveContext,
        };
    }

    /** Resolve entitlement for the dry run, including the skill and tenant principals. */
    private async explainEntitlement(
        scopeID: string,
        input: ExplainScopeInput,
        contextUser: UserInfo
    ): Promise<EntitlementExplanation> {
        const principals = {
            UserID: contextUser.ID ?? null,
            AgentID: input.AIAgentID ?? null,
            SkillID: input.AISkillID ?? null,
            PrimaryScopeRecordID: input.SearchContext?.PrimaryScopeRecordID ?? null,
        };
        try {
            const [agent, skill] = await Promise.all([
                this.loadPrincipal<MJAIAgentEntity>('MJ: AI Agents', input.AIAgentID, contextUser),
                this.loadPrincipal<MJAISkillEntity>('MJ: AI Skills', input.AISkillID, contextUser),
            ]);
            const permission = await DefaultSearchScopePermissionResolver.ResolveEffectivePermission({
                User: contextUser,
                SearchScopeID: scopeID,
                Agent: agent,
                Skill: skill,
                PrimaryScopeRecordID: principals.PrimaryScopeRecordID,
                ContextUser: contextUser,
            });
            return {
                Allowed: permission.Allowed,
                Level: permission.Level,
                Source: permission.Source,
                Reason: permission.Reason,
                Principals: principals,
            };
        } catch (e) {
            // A resolver failure must read as "denied", never as "allowed" — an explanation that
            // fails open would be worse than no explanation at all.
            const msg = e instanceof Error ? e.message : String(e);
            return {
                Allowed: false,
                Level: 'None',
                Source: 'NoGrant',
                Reason: `entitlement could not be resolved, reported as denied: ${msg}`,
                Principals: principals,
            };
        }
    }

    /** Load an agent or skill principal by ID; null when no ID was supplied. */
    private async loadPrincipal<T extends MJAIAgentEntity | MJAISkillEntity>(
        entityName: string,
        id: string | null | undefined,
        contextUser: UserInfo
    ): Promise<T | null> {
        if (!id) return null;
        const entity = await this.ProviderToUse.GetEntityObject<T>(entityName, contextUser);
        const loaded = await entity.Load(id);
        return loaded ? entity : null;
    }

    /**
     * Render every lane and report which would run.
     *
     * Reuses `buildScopeConstraints` with a collector rather than duplicating the render logic.
     * That matters more than it looks: a separate "explain" renderer would be a second
     * implementation of the guard rules, free to drift from the enforcing one, and a preview
     * that disagrees with what actually runs is worse than having no preview.
     */
    /**
     * Turn already-built constraints plus a problem map into per-lane explanations.
     *
     * Takes the constraints rather than rebuilding them. The previous version called
     * `buildScopeConstraints` itself, which meant the SEARCH path re-rendered every Nunjucks
     * template a second time on every scope of every query purely to produce a log record —
     * pure waste on the hottest path in the engine.
     *
     * Both callers still share one rendering pass, which is what keeps the dry run honest:
     * a separate explain-only renderer would be a second implementation of the guard rules,
     * free to drift from the enforcing one.
     */
    private buildLaneExplanations(
        bundle: ScopeBundle,
        constraints: ScopeConstraints,
        problems: LaneProblemCollector
    ): LaneExplanation[] {
        const lanes: LaneExplanation[] = [];

        for (const row of bundle.ExternalIndexes) {
            const rendered = constraints.ExternalIndexes?.find((c) => UUIDsEqual(c.SearchScopeExternalIndexID, row.ID));
            lanes.push({
                Kind: 'ExternalIndex',
                Target: row.ExternalIndexName ?? row.ID,
                LaneID: row.ID,
                Status: problems.has(row.ID) ? 'Skipped' : 'Active',
                RenderedFilter: this.stringifyFilter(rendered?.MetadataFilter),
                RequiredMetadataKeys: this.safeRequiredKeys(row.RequiredMetadataKeys),
                Reason: problems.get(row.ID),
            });
        }

        for (const row of bundle.Entities) {
            const rendered = constraints.Entities?.find((c) => UUIDsEqual(c.SearchScopeEntityID, row.ID));
            lanes.push({
                Kind: 'Entity',
                Target: this.lookupEntityName(row.EntityID) || row.EntityID,
                LaneID: row.ID,
                Status: problems.has(row.ID) ? 'Skipped' : 'Active',
                RenderedFilter: rendered?.ExtraFilter ?? null,
                RequiredMetadataKeys: this.safeRequiredKeys(row.RequiredMetadataKeys),
                Reason: problems.get(row.ID),
            });
        }

        for (const row of bundle.StorageAccounts) {
            const rendered = constraints.StorageAccounts?.find((c) => UUIDsEqual(c.SearchScopeStorageAccountID, row.ID));
            lanes.push({
                Kind: 'StorageAccount',
                Target: row.FileStorageAccountID,
                LaneID: row.ID,
                // FolderPath is a path prefix, not an access bound, so it is deliberately
                // unguarded here — consistent with buildScopeConstraints.
                Status: 'Active',
                RenderedFilter: rendered?.FolderPath ?? null,
            });
        }

        return lanes;
    }

    /** Render every lane for a DRY RUN, collecting problems instead of throwing on the first. */
    private explainLanes(bundle: ScopeBundle, effectiveContext: SearchContext | undefined): LaneExplanation[] {
        const problems: LaneProblemCollector = new Map();
        try {
            const constraints = this.buildScopeConstraints(bundle, effectiveContext, problems);
            return this.buildLaneExplanations(bundle, constraints, problems);
        } catch (e) {
            // buildScopeConstraints should not throw with a collector present, but a template
            // renderer can still fail for reasons the guards do not model.
            const msg = e instanceof Error ? e.message : String(e);
            return this.buildAllLanesSkipped(bundle, `constraint building threw: ${msg}`);
        }
    }

    /** Every lane, reported as skipped for one shared reason. */
    private buildAllLanesSkipped(bundle: ScopeBundle, reason: string): LaneExplanation[] {
        return [
            ...bundle.ExternalIndexes.map((row): LaneExplanation => ({
                Kind: 'ExternalIndex',
                Target: row.ExternalIndexName ?? row.ID,
                LaneID: row.ID,
                Status: 'Skipped',
                RenderedFilter: null,
                RequiredMetadataKeys: this.safeRequiredKeys(row.RequiredMetadataKeys),
                Reason: reason,
            })),
            ...bundle.Entities.map((row): LaneExplanation => ({
                Kind: 'Entity',
                Target: this.lookupEntityName(row.EntityID) || row.EntityID,
                LaneID: row.ID,
                Status: 'Skipped',
                RenderedFilter: null,
                RequiredMetadataKeys: this.safeRequiredKeys(row.RequiredMetadataKeys),
                Reason: reason,
            })),
            ...bundle.StorageAccounts.map((row): LaneExplanation => ({
                Kind: 'StorageAccount',
                Target: row.FileStorageAccountID,
                LaneID: row.ID,
                Status: 'Skipped',
                RenderedFilter: null,
                Reason: reason,
            })),
        ];
    }

    /** Explanation for a scope that is inactive, missing, or otherwise not loadable. */
    private buildUnresolvableExplanation(
        scopeID: string,
        input: ExplainScopeInput,
        contextUser: UserInfo
    ): ScopeExplanation {
        return {
            ScopeID: scopeID,
            ScopeName: '(not found)',
            Entitlement: {
                Allowed: false,
                Level: 'None',
                Source: 'NoGrant',
                Reason: 'the scope is inactive, expired, or does not exist, so no search can use it',
                Principals: {
                    UserID: contextUser.ID ?? null,
                    AgentID: input.AIAgentID ?? null,
                    SkillID: input.AISkillID ?? null,
                    PrimaryScopeRecordID: input.SearchContext?.PrimaryScopeRecordID ?? null,
                },
            },
            Dimensions: [],
            Lanes: [],
            Diagnostics: [`scope "${scopeID}" is not an active scope`],
            Reachable: false,
            // Not "known to be bounded" — the scope could not be loaded, so nothing about its
            // configuration was observed. It is unreachable either way.
            Unbounded: false,
        };
    }

    /** Parse a lane's required-key contract for display; a malformed one reports as empty. */
    private safeRequiredKeys(raw: string | null | undefined): string[] | undefined {
        try {
            const keys = ParseRequiredMetadataKeys(raw);
            return keys.length ? keys : undefined;
        } catch {
            // The malformed declaration is already reported as the lane's skip reason.
            return undefined;
        }
    }

    /** Render a filter of unknown shape as a display string. */
    private stringifyFilter(filter: unknown): string | null {
        if (filter === null || filter === undefined) return null;
        return typeof filter === 'string' ? filter : JSON.stringify(filter);
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
        agentFusionWeights: FusionWeightsByProvider | undefined,
        /**
         * Principals available to bind into a dimension's expansion query.
         *
         * These MUST match what `ExplainScope` passes. When they did not, a scope whose
         * `expansionQueryID` binds `AgentID` derived one bound in the dry run and a different
         * one at search time — making the preview quietly wrong in the only direction anybody
         * cares about.
         */
        principals: ScopePrincipals,
        onProviderResolved?: OnProviderResolved,
    ): Promise<{
        scopeID: string;
        fused: SearchResultItem[];
        sourceCounts: { Vector: number; FullText: number; Entity: number; Storage: number };
        /**
         * What this scope decided — dimension provenance and per-lane outcomes.
         *
         * `Entitlement` is null here by design: the engine does not gate scopes on
         * SearchScopePermission, the caller that selects them does. Fabricating an "allowed"
         * would make an unevaluated search read as authorized in the audit log.
         */
        decision: ScopeExplanation;
    }> {
        const scope = bundle.Scope;
        const scopeConfig = this.parseJson(scope.ScopeConfig);
        // Resolve this scope's DECLARED dimensions before building any constraint. For a scope
        // with no declaration this returns the caller's context untouched (legacy behaviour);
        // for a declared scope it discards caller-supplied values for ServerDerived keys,
        // enforces value grammars, applies narrowingOf as a meet, and gives strictValidation
        // teeth. A ScopeDimensionError propagates so the search fails CLOSED.
        const dimensionResult = await this.dimensionResolver.Resolve({
            Scope: bundle.Scope,
            CallerContext: searchContext,
            ContextUser: contextUser,
            Principals: principals,
        });
        for (const note of dimensionResult.Diagnostics) {
            LogStatus(`SearchEngine: scope "${bundle.Scope.Name}" — ${note}`);
        }
        const effectiveContext = dimensionResult.Context;
        const constraints = this.buildScopeConstraints(bundle, effectiveContext);
        const perProviderQueryTransforms = constraints.QueryTransforms ?? {};

        // Capture the decision for the audit log, REUSING the constraints just built rather
        // than re-rendering every template a second time. Reaching this line means every lane
        // guard passed (buildScopeConstraints throws otherwise), so the problem map is empty
        // and every lane is Active.
        const unbounded = bundle.ExternalIndexes.length === 0
            && bundle.Entities.length === 0
            && bundle.StorageAccounts.length === 0;
        const decision: ScopeExplanation = {
            ScopeID: scope.ID,
            ScopeName: scope.Name,
            Entitlement: null,
            Dimensions: dimensionResult.Provenance,
            Lanes: this.buildLaneExplanations(bundle, constraints, new Map()),
            // Same warning the dry run emits. The two paths produce one shape, so they should
            // produce the same prose too — an auditor reading a log row should not have to know
            // it was written by the search path rather than by a preview.
            Diagnostics: unbounded
                ? [...dimensionResult.Diagnostics, UNBOUNDED_SCOPE_DIAGNOSTIC]
                : dimensionResult.Diagnostics,
            Reachable: true,
            Unbounded: unbounded,
            ResolvedContext: effectiveContext,
        };

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
                sourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 },
                decision: { ...decision, Reachable: false,
                    Diagnostics: [...decision.Diagnostics, 'no applicable providers for this scope'] },
            };
        }

        // Resolve per-provider `SearchScopeProvider.MaxResultsOverride` if present
        const promises = applicableProviders.map(async (entry): Promise<LabeledResultList> => {
            const providerStart = Date.now();
            try {
                const spRow = bundle.Providers.find(r => UUIDsEqual(r.SearchProviderID, entry.ID));
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
                if (onProviderResolved) {
                    try {
                        onProviderResolved({
                            sourceType: entry.Provider.SourceType,
                            results: providerResults,
                            durationMs: Date.now() - providerStart,
                            scopeID: scope.ID,
                        });
                    } catch (cbErr) {
                        const cbMsg = cbErr instanceof Error ? cbErr.message : String(cbErr);
                        LogError(`SearchEngine: onProviderResolved callback threw for "${entry.Provider.SourceType}" in scope "${scope.Name}": ${cbMsg}`);
                    }
                }
                return { Source: entry.Provider.SourceType, Results: providerResults };
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                LogError(`SearchEngine: Provider "${entry.Provider.SourceType}" failed in scope "${scope.Name}": ${msg}`);
                if (onProviderResolved) {
                    try {
                        onProviderResolved({
                            sourceType: entry.Provider.SourceType,
                            results: [],
                            durationMs: Date.now() - providerStart,
                            scopeID: scope.ID,
                        });
                    } catch { /* swallow */ }
                }
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
        return { scopeID: scope.ID, fused, sourceCounts, decision };
    }

    /**
     * Assemble a `ScopeConstraints` for a single scope: Nunjucks-render each template
     * field against the `SearchContext`, then hand the rendered values to providers.
     */
    /**
     * Fail a search CLOSED when a scope field that RESTRICTS was authored but did not render
     * usably (see `CheckRenderedTemplate`).
     *
     * Throwing rather than dropping the offending row is deliberate. Dropping it would empty
     * the row collection, and `buildScopeConstraints` collapses an empty collection to
     * `undefined` — which every provider reads as "unscoped", i.e. all entities / all indexes
     * with no filter. So the surgical-looking fix is the one that widens; failing the search
     * is the one that doesn't. A broken restricting template is a misconfiguration and should
     * be loud and actionable, never silently degraded into a wider search.
     */
    protected assertRestrictingTemplateRendered(
        source: string | null | undefined,
        rendered: unknown,
        fieldName: string,
        scopeLabel: string,
        rowLabel: string,
        laneID: string,
        collector?: LaneProblemCollector
    ): void {
        const check = CheckRenderedTemplate(source, rendered);
        if (check.Status !== 'unusable') return;
        this.reportLaneProblem(
            `SearchEngine: scope ${scopeLabel} — ${fieldName} for "${rowLabel}" could not be rendered safely, so the search was NOT run. ${check.Reason}`,
            laneID,
            collector
        );
    }

    /**
     * Enforce a lane's `RequiredMetadataKeys` contract (Phase E).
     *
     * The rendered filter must mention every key the author declared. This is the only guard
     * that catches a filter which rendered *partially* — where an optional `{% if %}` clause
     * disappeared because its dimension was absent or discarded, leaving a non-empty filter
     * that passes every other check while restricting on strictly less than intended.
     */
    protected assertRequiredMetadataKeys(
        declaration: string | null | undefined,
        laneID: string,
        rendered: unknown,
        scopeLabel: string,
        rowLabel: string,
        collector?: LaneProblemCollector
    ): void {
        let requiredKeys: string[];
        try {
            requiredKeys = ParseRequiredMetadataKeys(declaration);
        } catch (e) {
            // A contract that cannot be parsed must not degrade to "no contract" — that would
            // turn a typo in the declaration into an unguarded lane.
            this.reportLaneProblem(
                `SearchEngine: scope ${scopeLabel} — lane "${rowLabel}" has an unreadable RequiredMetadataKeys declaration, so the lane cannot be trusted. ${e instanceof Error ? e.message : String(e)}`,
                laneID,
                collector
            );
            return;
        }
        if (requiredKeys.length === 0) return;

        const check = CheckRequiredMetadataKeys(rendered, requiredKeys);
        if (check.Status !== 'unusable') return;
        this.reportLaneProblem(
            `SearchEngine: scope ${scopeLabel} — lane "${rowLabel}" failed its RequiredMetadataKeys contract, so the search was NOT run. ${check.Reason}`,
            laneID,
            collector
        );
    }

    /**
     * Route a lane problem to the right place: throw when enforcing a real search, record when
     * explaining a hypothetical one.
     *
     * A dry run must be able to report *every* broken lane in one pass. If it threw on the first
     * one, an administrator would fix a scope one error at a time, re-running after each — and
     * the whole point of the preview is to see the entire picture before anything runs.
     */
    private reportLaneProblem(message: string, laneID: string, collector?: LaneProblemCollector): void {
        if (collector) {
            collector.set(laneID, message);
            LogStatus(message);
            return;
        }
        LogError(message);
        throw new Error(message);
    }

    private buildScopeConstraints(
        bundle: ScopeBundle,
        searchContext: SearchContext | undefined,
        collector?: LaneProblemCollector
    ): ScopeConstraints {
        const scopeLabel = `${bundle.Scope.Name} (${bundle.Scope.ID})`;

        const externalIndexes: ScopeExternalIndexConstraint[] = bundle.ExternalIndexes.map(row => {
            const rowLabel = row.ExternalIndexName ?? row.ID;
            // §5.4: values are escaped for THIS lane's dialect automatically, derived from IndexType.
            const laneKind = LaneKindForIndexType(row.IndexType);
            const metadataFilter = RenderScopeJsonTemplate(row.MetadataFilter, searchContext, undefined, laneKind);
            this.assertRestrictingTemplateRendered(row.MetadataFilter, metadataFilter, 'MetadataFilter', scopeLabel, rowLabel, row.ID, collector);
            this.assertRequiredMetadataKeys(row.RequiredMetadataKeys, row.ID, metadataFilter, scopeLabel, rowLabel, collector);
            // ExternalIndexConfig is JSON (namespace/routing), regardless of the filter dialect.
            const externalIndexConfig = RenderScopeTemplate(row.ExternalIndexConfig, searchContext, undefined, 'json');
            // ExternalIndexConfig can carry tenant routing (e.g. Pinecone `namespace`), so a
            // silent render failure here can widen retrieval just like a filter can.
            this.assertRestrictingTemplateRendered(row.ExternalIndexConfig, externalIndexConfig, 'ExternalIndexConfig', scopeLabel, rowLabel, row.ID, collector);
            return {
                SearchScopeExternalIndexID: row.ID,
                IndexType: row.IndexType,
                VectorIndexID: row.VectorIndexID ?? undefined,
                ExternalIndexName: row.ExternalIndexName ?? undefined,
                ExternalIndexConfig: this.parseJson(externalIndexConfig),
                MetadataFilter: metadataFilter
            };
        });

        const entities: ScopeEntityConstraint[] = bundle.Entities.map(row => {
            // The entity lane is T-SQL, so single quotes must be doubled.
            const extraFilter = row.ExtraFilter ? RenderScopeTemplate(row.ExtraFilter, searchContext, undefined, 'sql') : undefined;
            const entityLabel = this.lookupEntityName(row.EntityID) || row.EntityID;
            this.assertRestrictingTemplateRendered(row.ExtraFilter, extraFilter, 'ExtraFilter', scopeLabel, entityLabel, row.ID, collector);
            // The SQL lane loses a guarded clause exactly the way an index lane does — same
            // renderer, same SearchContext, same optional {% if %} blocks — and it is the lane
            // that reads the operational database, so it gets the same contract.
            this.assertRequiredMetadataKeys(row.RequiredMetadataKeys, row.ID, extraFilter, scopeLabel, entityLabel, collector);
            return {
                SearchScopeEntityID: row.ID,
                EntityID: row.EntityID,
                EntityName: this.lookupEntityName(row.EntityID),
                ExtraFilter: extraFilter,
                // UserSearchString and FolderPath are NOT restrictions — they shape the query
                // text / a path prefix — so a soft render there cannot widen an access bound
                // and is deliberately left unguarded.
                // 'none' deliberately: this becomes QUERY TEXT, not syntax. Escaping it would corrupt
                // the search rather than protect it, and it cannot express a bound.
                UserSearchString: row.UserSearchString ? RenderScopeTemplate(row.UserSearchString, searchContext, undefined, 'none') : undefined
            };
        });

        const storage: ScopeStorageConstraint[] = bundle.StorageAccounts.map(row => ({
            SearchScopeStorageAccountID: row.ID,
            FileStorageAccountID: row.FileStorageAccountID,
            // Path traversal, not quoting, is the risk on a storage lane.
            FolderPath: row.FolderPath ? RenderScopeTemplate(row.FolderPath, searchContext, undefined, 'path') : undefined
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
            const entity = this.ProviderToUse.Entities.find(e => UUIDsEqual(e.ID, entityID));
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

    /**
     * Pick the first scope's `RerankerBudgetCents` value to apply to the reranker
     * run. Mirrors `pickReRankerConfig` — the leading scope's policy wins. NULL
     * (uncapped) is the default when no scope sets a budget.
     */
    private pickRerankerBudgetCents(resolvedScopes: ScopeBundle[]): number | null {
        for (const bundle of resolvedScopes) {
            const cents = bundle.Scope.RerankerBudgetCents;
            if (cents != null) return cents;
        }
        return null;
    }

    private async runReRanker(
        query: string,
        candidates: SearchResultItem[],
        cfg: ReRankerConfig,
        contextUser: UserInfo,
        budgetGuard?: RerankerBudgetGuard,
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

            // P2D.6 — pre-call budget short-circuit. When the projected cost would
            // exceed the remaining budget, skip rerank entirely and return the
            // unranked top-N. Reported via LogStatus so observability reflects the
            // skip without surfacing as a failure.
            if (budgetGuard) {
                const estimate = reRanker.EstimateCostCents(trimmed.length);
                if (!budgetGuard.CanSpend(estimate)) {
                    LogStatus(`SearchEngine: Re-ranker "${cfg.driverClass}" skipped — projected cost ${estimate.toFixed(4)}¢ exceeds remaining budget ${(budgetGuard.Remaining() ?? 0).toFixed(4)}¢ (Spent ${budgetGuard.Spent.toFixed(4)}¢ / Budget ${budgetGuard.Budget ?? 'uncapped'}¢).`);
                    return trimmed.slice(0, outputTopN);
                }
                // Wire post-call cost reporting through the guard so subsequent
                // EstimateCostCents queries reflect accumulated spend.
                reRanker.CostReporter = budgetGuard.AsCostReporter();
            }

            const ranked = await reRanker.ReRank(query, trimmed, outputTopN, contextUser, cfg.config);
            LogStatus(`SearchEngine: Re-ranker "${cfg.driverClass}" returned ${ranked.length} result(s) (input=${trimmed.length}, outputTopN=${outputTopN}${budgetGuard ? `, spent=${budgetGuard.Spent.toFixed(4)}¢` : ''})`);
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
        scopeConstraints: ScopeConstraints | undefined,
        onProviderResolved?: OnProviderResolved,
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
            const providerStart = Date.now();
            try {
                const providerTopK = entry.MaxResultsOverride ?? topK;
                const results = await entry.Provider.Search(query, providerTopK, filters, contextUser, scopeConstraints);
                // Stamp provider metadata onto each result
                for (const r of results) {
                    r.ProviderId = entry.ID;
                    r.ProviderLabel = entry.DisplayName;
                    r.ProviderIcon = entry.Icon;
                }
                if (onProviderResolved) {
                    try {
                        onProviderResolved({
                            sourceType: entry.Provider.SourceType,
                            results,
                            durationMs: Date.now() - providerStart,
                        });
                    } catch (cbErr) {
                        // Streaming callback throwing must NOT corrupt the result; just log.
                        const cbMsg = cbErr instanceof Error ? cbErr.message : String(cbErr);
                        LogError(`SearchEngine: onProviderResolved callback threw for "${entry.Provider.SourceType}": ${cbMsg}`);
                    }
                }
                return { Source: entry.Provider.SourceType, Results: results };
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                LogError(`SearchEngine: Provider "${entry.Provider.SourceType}" failed: ${msg}`);
                if (onProviderResolved) {
                    try {
                        onProviderResolved({
                            sourceType: entry.Provider.SourceType,
                            results: [],
                            durationMs: Date.now() - providerStart,
                        });
                    } catch { /* swallow */ }
                }
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
    protected async filterByPermissions(
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

            // Check row filters — role RLS AND API-key filters (GetEffectiveRowFilterWhereClause)
            const rlsClause = entity.GetEffectiveRowFilterWhereClause(
                contextUser,
                EntityPermissionType.Read,
                ''
            );
            if (!rlsClause) {
                // No RLS clause (or user is exempt) — results pass through
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
    /**
     * Public hook for callers (e.g. the GraphQL resolver) to emit a
     * Status='Forbidden' SearchExecutionLog row when they reject a request
     * before delegating to {@link Search}. Without this, forbidden invocations
     * never reach the analytics dashboard — exactly the signal admins need
     * to spot users / agents trying to access scopes they shouldn't.
     */
    public async LogForbiddenSearch(input: {
        Query: string;
        ScopeIDs?: string[];
        FailureReason: string;
        StartTime: number;
        ContextUser: UserInfo;
        AIAgentID?: string | null;
        AISkillID?: string | null;
        PrimaryScopeRecordID?: string | null;
    }): Promise<void> {
        await this.logSearchExecution({
            Status: 'Forbidden',
            FailureReason: input.FailureReason,
            Query: input.Query,
            ScopeIDs: input.ScopeIDs,
            StartTime: input.StartTime,
            ResultCount: 0,
            RerankerName: null,
            RerankerCostCents: null,
            SourceCounts: undefined,
            ContextUser: input.ContextUser,
            AIAgentID: input.AIAgentID ?? null,
            AISkillID: input.AISkillID ?? null,
            PrimaryScopeRecordID: input.PrimaryScopeRecordID ?? null,
        });
    }

    /**
     * Best-effort hook (P3.2) that writes one MJSearchExecutionLog row per
     * SearchEngine.Search call. Captures query, timing, scope, result count,
     * reranker info, status, and a per-source-count breakdown for the analytics
     * dashboard (P3.3) and tuning CSV export (P3.4).
     *
     * Errors during the write are swallowed and logged — observability is the
     * point of this hook, not a load-bearing dependency. A logger that brings
     * down search would be the worst possible outcome.
     */
    private async logSearchExecution(input: {
        Status: 'Success' | 'Failure' | 'Forbidden';
        FailureReason: string | null;
        Query: string;
        ScopeIDs?: string[];
        StartTime: number;
        ResultCount: number;
        RerankerName: string | null;
        RerankerCostCents: number | null;
        SourceCounts?: { Vector: number; FullText: number; Entity: number; Storage: number };
        ContextUser: UserInfo;
        AIAgentID?: string | null;
        AISkillID?: string | null;
        PrimaryScopeRecordID?: string | null;
        /** Per-scope decisions captured during this search (Phase F provenance). */
        ScopeDecisions?: ScopeExplanation[];
    }): Promise<void> {
        try {
            const log = await this.ProviderToUse.GetEntityObject<MJSearchExecutionLogEntity>(
                'MJ: Search Execution Logs',
                input.ContextUser,
            );
            log.SearchScopeID = input.ScopeIDs && input.ScopeIDs.length > 0 ? input.ScopeIDs[0] : null;
            log.UserID = input.ContextUser.ID ?? null;
            log.AIAgentID = input.AIAgentID ?? null;
            log.AISkillID = input.AISkillID ?? null;
            log.PrimaryScopeRecordID = input.PrimaryScopeRecordID ?? null;
            // ScopeDecisionJSON answers "why could this search reach what it reached" — the
            // dimension provenance and per-lane outcomes, which are otherwise gone the moment
            // the search returns. Same shape ExplainScope() produces, so a preview taken at
            // configuration time is directly comparable with what actually ran.
            log.ScopeDecisionJSON = input.ScopeDecisions?.length
                ? JSON.stringify(input.ScopeDecisions)
                : null;
            log.Query = input.Query;
            log.TotalDurationMs = Date.now() - input.StartTime;
            log.ResultCount = input.ResultCount;
            log.RerankerName = input.RerankerName;
            log.RerankerCostCents = input.RerankerCostCents;
            log.Status = input.Status;
            log.FailureReason = input.FailureReason;
            // ProvidersJSON: per-source breakdown. Per-provider per-call timings
            // require deeper plumbing through the provider-run loop — deferred to a
            // later Phase 3 pass. For now, capture the source counts which the
            // dashboard's hit-rate / volume charts already need.
            log.ProvidersJSON = input.SourceCounts
                ? JSON.stringify({
                    Vector: { ResultCount: input.SourceCounts.Vector },
                    FullText: { ResultCount: input.SourceCounts.FullText },
                    Entity: { ResultCount: input.SourceCounts.Entity },
                    Storage: { ResultCount: input.SourceCounts.Storage },
                })
                : null;

            const saved = await log.Save();
            if (!saved) {
                LogError(`SearchEngine: SearchExecutionLog write returned false: ${log.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (err) {
            // Swallow — this is best-effort observability and must never affect search latency / availability.
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`SearchEngine: SearchExecutionLog write threw: ${msg}`);
        }
    }

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
