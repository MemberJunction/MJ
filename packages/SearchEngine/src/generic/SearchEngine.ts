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

import {
    CompositeKey, EntityInfo, EntityPermissionType, IMetadataProvider, KeyValuePair, LogError, LogStatus, Metadata, RunView, RunViewParams,
    RunViewResult, UserInfo
} from '@memberjunction/core';
import {
    SearchEngineBase,
    MJSearchProviderEntity,
    MJSearchScopeEntity,
    MJSearchExecutionLogEntity,
    MJAIAgentEntity,
    MJAISkillEntity,
    ScopeBundle
} from '@memberjunction/core-entities';
import { BaseSingleton, EscapeSQLString, IsValidUUID, MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { FileStorageEngine, StorageAccessEvaluator } from '@memberjunction/storage';
import {
    SearchParams,
    SearchResult,
    SearchSource,
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
    SearchAudience,
} from './search.types';
import { BaseSearchProvider, SearchProviderConfig } from './ISearchProvider';
import { SearchFusion, LabeledResultList } from './SearchFusion';
import { SearchEnricher } from './SearchEnricher';
import { FullTextSearchProvider } from './FullTextSearchProvider';
import { StorageSearchProvider } from './StorageSearchProvider';
import { BaseReRanker } from './BaseReRanker';
import { NoopReRanker, LoadNoopReRanker } from './NoopReRanker';
import { RerankerBudgetGuard } from '../rerankers/RerankerBudgetGuard';
import { RenderScopeTemplate, RenderScopeJsonTemplate } from './ScopeTemplateRenderer';
import { LaneKindForIndexType } from './ScopeValueEscaper';
import { CheckRenderedFolderPath, CheckRenderedTemplate, CheckRequiredMetadataKeys, ParseRequiredMetadataKeys } from './ScopeFilterGuard';
import { ScopeDimensionResolver } from './ScopeDimensionResolver';
import {
    ScopeExplanation,
    ExplainScopeInput,
    LaneExplanation,
    EntitlementExplanation,
    EntitlementSource,
} from './ScopeExplanation';
import { GetSearchScopePermissionResolver } from '../permissions/SearchScopePermissionResolver';

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

/** What a scope's configuration lets it reach — see `SearchEngine.judgeScopeBound`. */
interface ScopeBoundJudgement {
    /**
     * False when the scope can retrieve nothing: no enabled provider row naming a configured, available
     * provider; no active lane; no listed provider that reads a lane kind the scope configures; or (in a
     * dry run) a lane skipped for a problem the real search refuses on.
     */
    CanRetrieve: boolean;
    /** True only for a global scope with no lanes, which runs every provider unfiltered. */
    Unbounded: boolean;
    /** Why, in the shared wording both the dry run and the search path record. */
    Diagnostics: string[];
    /**
     * The providers a search of this scope calls — the search path runs exactly these, so it cannot call a
     * provider the dry run did not count. Empty when `CanRetrieve` is false. For a global scope (which the
     * search path runs unconstrained), every available provider.
     */
    Providers: ProviderEntry[];
}

/** One lane row of a scope bundle, by lane kind. */
type ScopeExternalIndexRow = ScopeBundle['ExternalIndexes'][number];
type ScopeEntityRow = ScopeBundle['Entities'][number];
type ScopeStorageRow = ScopeBundle['StorageAccounts'][number];

/** The rendered `ExtraFilter` bound one entity carries in a scope — see `SearchEngine.enforceLaneExtraFilters`. */
interface LaneEntityBound {
    /** The entity's name as the lane names it. */
    EntityName: string;
    /** The lane filters, ORed when several lanes name the entity. */
    Clause: string;
}

/**
 * Emitted when a GLOBAL scope configures no lanes at all — a global scope runs unconstrained, so
 * every provider searches everything available to it. Shared by the dry run and the search path.
 */
const UNBOUNDED_SCOPE_DIAGNOSTIC =
    'this global scope configures NO lanes (no external indexes, entities, or storage accounts). ' +
    'A global scope is UNSCOPED: every provider searches everything available to it with no filter.';

/**
 * Emitted when a NON-global scope configures no lanes. Each lane list reaches the providers empty,
 * and an empty list means "nothing for this provider", so the scope reaches nothing — never everything.
 */
const NO_LANES_DIAGNOSTIC =
    'this scope configures NO lanes (no external indexes, entities, or storage accounts), so it reaches nothing: ' +
    'a non-global scope searches only what its lanes name. Add a lane to make it retrieve.';

/**
 * Emitted when a NON-global scope has no enabled `MJ: Search Scope Providers` row. It runs no provider —
 * a scope with no provider rows used to run every provider, which made disabling the last row widen it.
 */
const NO_PROVIDER_ROWS_DIAGNOSTIC =
    'this scope has no enabled provider rows (MJ: Search Scope Providers), so it runs no provider and returns nothing: ' +
    'a non-global scope runs only the providers it lists. Add an enabled provider row to make it retrieve.';

/** Emitted when a NON-global scope's provider rows name no provider this engine can run. */
function noRunnableProviderDiagnostic(isPreview: boolean): string {
    const which = isPreview ? 'configured, available provider that supports preview searches' : 'configured, available provider';
    return `this scope's enabled provider rows name no ${which}, so it runs no provider and returns nothing. ` +
        'Check that each provider row names an active MJ: Search Providers row whose provider initialised.';
}

/**
 * Emitted when a NON-global scope's runnable providers read no lane kind the scope configures
 * (`BaseSearchProvider.ConsumesLaneKinds`) — e.g. a Vector provider row over entity lanes only. Each provider
 * would get an empty list for every lane it reads, so none is called and the scope reaches nothing.
 */
function noProviderReadsALaneDiagnostic(providers: ProviderEntry[], lanes: LaneExplanation[]): string {
    const listed = providers.map(p => `${p.DisplayName} (reads ${p.Provider.ConsumesLaneKinds.join(', ') || 'no lane'})`).join('; ');
    const configured = Array.from(new Set(lanes.filter(l => l.Status === 'Active').map(l => l.Kind))).join(', ');
    return `none of this scope's providers reads a lane kind it configures — providers: ${listed}; active lanes: ${configured}. ` +
        'It reaches nothing: add a lane each provider reads (e.g. a Vector external-index row for a vector provider), ' +
        'or a provider row for a provider that reads these lanes.';
}

/** Emitted (dry run only) when a lane is skipped: the real search refuses on the first such lane. */
function refusedLanesDiagnostic(skipped: LaneExplanation[]): string {
    const named = skipped.map(l => `${l.Kind} "${l.Target}"`).join(', ');
    return `a real search would be refused: ${skipped.length === 1 ? 'a lane is' : `${skipped.length} lanes are`} unusable (${named}). ` +
        'A search refuses a scope with any unusable lane rather than search the others; fix the lane(s) to make it retrieve.';
}

// Keep the default re-ranker registration alive under tree-shaking
LoadNoopReRanker();

/** Where a content entity sits in the derived-content family (see `SearchEngine.VerifyOriginRecords`). */
type ContentFamilyLevel = 'chunk' | 'item';

/** The MJ record a content row was derived from, as its Entity Record Document names it. */
interface ContentOriginRef {
    EntityName: string;
    /**
     * A key segment: compact (bare value) today, possibly `ID|…` from writers that move to `ToRecordID()`.
     * Parsed with `CompositeKey.FromURLSegment`, which reads both.
     */
    RecordID: string;
}

/**
 * The columns of `MJ: Content Items` the origin walk reads. For a root item (no `ParentID`) the view gives
 * `RootParentID` the row's own id; for a child it is null when the view cannot walk the `ParentID` chain.
 */
interface ContentItemRow {
    ID: string;
    ParentID: string | null;
    RootParentID: string | null;
    EntityRecordDocumentID: string | null;
}

/** The columns of `MJ: Entity Record Documents` the origin walk reads. `Entity` is the view's join to the entity's name. */
interface EntityRecordDocumentRow {
    ID: string;
    Entity: string | null;
    RecordID: string | null;
}

/** One origin entity's readability check, asked in the `RunViews` batch of `SearchEngine.ReadableOriginRecordIDs`. */
interface OriginReadCheck {
    EntityName: string;
    Entity: EntityInfo;
    /** The record ids as the Entity Record Documents carry them. */
    RecordIDs: string[];
    Params: RunViewParams;
}

/**
 * Configuration options for the SearchEngine.
 */
export interface SearchEngineConfig {
    /** Default maximum results if not specified in SearchParams (default: 20) */
    DefaultMaxResults?: number;
    /**
     * Default multiplier applied to per-provider `topK` to compensate for residual
     * late permission filtering. A scope's `ScopeConfig.permissionOverfetchFactor` or a call's
     * `SearchParams.PermissionOverfetchFactor` takes precedence. Clamped to 1–20 (logged once, at
     * configuration); a non-finite value falls back to 2. Default: 2.
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
    /**
     * Result rows from this provider, with metadata already stamped — before any permission pass, so
     * {@link SearchEngine.streamSearch} forwards only their count, never the rows.
     */
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

    /**
     * Ceiling on the per-provider over-fetch multiplier, whatever its source (caller, scope metadata or
     * the engine default). Above it a single metadata edit would multiply every provider call for every
     * caller of the scope, and vector providers bill per candidate.
     */
    private static readonly MAX_OVERFETCH_FACTOR = 20;

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
        // `??` passes NaN/Infinity through; a non-finite default would have become the provider topK.
        const configuredDefault = config.DefaultPermissionOverfetchFactor;
        this._defaultOverfetchFactor = typeof configuredDefault === 'number' && Number.isFinite(configuredDefault)
            ? this.clampOverfetchFactor(configuredDefault, 'the engine default')
            : 2;
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
            // A malformed audience fails the search here rather than being skipped later: a reader the
            // host failed to map would otherwise restrict nothing, and the room would see the caller's reach.
            this.validateAudience(params.Audience);

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

            // ──────────────────────────────────────────────────────────
            // Resolve scopes (when supplied)
            // ──────────────────────────────────────────────────────────
            const { Bundles: resolvedScopes, Unresolved: unresolvedScopeIDs } = this.resolveScopes(params.ScopeIDs);
            if (unresolvedScopeIDs.length > 0) {
                // Before the cache lookup: a scope deactivated seconds ago must not be served from its old entry.
                return this.refuseUnresolvableScopes(unresolvedScopeIDs, params, contextUser, startTime);
            }
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

            // Resolved after the cache lookup, so a cache hit never pays for scope-config parsing or logs a clamp.
            const overfetchFactor = this.ResolvePermissionOverfetchFactor(params, resolvedScopes);
            const providerTopK = Math.max(topK, Math.ceil(topK * overfetchFactor));
            // Per-provider events report a count of hits taken before any permission pass. Cap it at the
            // caller's own topK so the over-fetch factor does not inflate what a stream client is told.
            const partialEvents: OnProviderResolved | undefined = onProviderResolved
                ? (ev) => onProviderResolved({ ...ev, results: ev.results.slice(0, topK) })
                : undefined;

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
                    partialEvents,
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
                        partialEvents,
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
            // Dedup → content-item promotion/exclusion → merge promoted entities → permission safety net → score threshold → enrich
            // ──────────────────────────────────────────────────────────
            let results = this._fusion.Deduplicate(fusedResults);
            if (isUnconstrained) {
                // Scoped results were promoted per scope, before their lane bounds were applied (boundScopeHits):
                // promoting here, after fusion, would let a promoted hit skip its origin entity's lane ExtraFilter.
                this._enricher.Provider = this.ProviderToUse;
                results = await this._enricher.ExcludeEntitySourcedContentItems(results, contextUser);
                results = this._fusion.Deduplicate(results);
            }

            const beforePermCount = results.length;
            const permissionStats = { OriginGateRemoved: 0 };
            results = await this.filterByPermissions(results, contextUser, permissionStats);
            if (permissionStats.OriginGateRemoved > 0) {
                // By design, not a push-down gap: content derived from a record the user may not read.
                const removed = permissionStats.OriginGateRemoved;
                LogStatus(`SearchEngine: origin-record gate removed ${removed} result(s) derived from records the user may not read.`);
            }
            // Origin-gate removals are counted above, so this stays the push-down signal it always was.
            const lateFilteredCount = beforePermCount - results.length - permissionStats.OriginGateRemoved;
            if (lateFilteredCount > 0) {
                // Observability: Section 3.6 — if a provider's push-down is complete, this
                // number should be zero (the safety net should never trim anything).
                LogStatus(`SearchEngine: Residual permission filter removed ${lateFilteredCount} result(s) — consider tightening provider push-down.`);
            }
            results = await this.FilterForAudience(results, params, contextUser);

            const scoreThreshold = params.MinScore ?? 0;
            if (scoreThreshold > 0) {
                results = results.filter(r => r.Score >= scoreThreshold);
            }

            // Trim to caller's requested topK (we overfetched earlier)
            if (results.length > topK) results = results.slice(0, topK);

            // Always run enrichment (entity icons, entity display names, record names) on the final topK results,
            // including preview searches (where topK <= 8, resolving names in a single fast batched query).
            this._enricher.Provider = this.ProviderToUse;
            await this._enricher.Enrich(results, contextUser);

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
     * Streaming variant of {@link Search}: the same pipeline, with a progress event as each provider
     * returns, so a UI or agent can show progress before fusion, the permission pass and enrichment finish.
     *
     * **Progress, not partial results.** A `provider` event carries the provider's name, its duration and
     * `resultCount` — how many hits it returned, capped at `MaxResults` — and never the hits themselves
     * (`results` is always empty). They arrive before the permission pass, so they include rows the caller's
     * row filters would drop, external-index hits not yet verified against the entity they name, and content
     * whose origin record the caller may not read. Results arrive only in `fused` and `final`, which carry
     * exactly what {@link Search} returns. `resultCount` is counted before the permission and audience passes,
     * like `SearchResult.SourceCounts`, so don't show it to a room.
     *
     * Cancellation: the consumer can stop iterating at any point — the underlying search runs to
     * completion and its result is discarded. Mid-pipeline AbortSignal cancellation is not supported.
     *
     * Event ordering:
     *   1. One `provider` event per provider that ran, in the order they return (a provider that failed
     *      reports `resultCount: 0`)
     *   2. Exactly one `fused` event
     *   3. Exactly one `final` event (`reranked` is part of the type but not emitted today)
     *   4. On error: a single `error` event in place of `fused` and `final`.
     *
     * @example
     * for await (const ev of SearchEngine.Instance.streamSearch(params, user)) {
     *   switch (ev.phase) {
     *     case 'provider':  scratchpad.append(`${ev.providerName}: ${ev.resultCount} hits`); break;
     *     case 'final':     scratchpad.commit(ev.results); break;
     *     case 'error':     scratchpad.fail(ev.error); break;
     *   }
     * }
     */
    public async *streamSearch(  // case-violation-ok-legacy-back-compat: generator — a delegating stub would return the generator, not yield from it
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

        // A provider's hits arrive before any permission pass, so its event carries progress only: the name,
        // the duration and a count. The hits themselves reach the caller in `fused`/`final`, after the
        // permission pass (and, under an audience, after the audience pass).
        const onProviderResolved: OnProviderResolved = (ev) => {
            const label = sourceTypeToLabel[ev.sourceType.toLowerCase()] ?? ev.sourceType;
            push({
                phase: 'provider',
                providerName: label,
                results: [],
                resultCount: ev.results.length,
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
            // The audience narrows the result set, so a search the caller ran alone must never be
            // served from the cache to a room, nor a room's result to the caller alone. Sorted so
            // the same readers in any order share an entry. IDs only: within the TTL, a reader object
            // with the same ID but different roles gets the cached verdict (see SearchParams.Audience).
            AudienceReaderIDs: this.audienceReaderIDs(params.Audience, contextUser),
        };
        return `${userKey}|${trimmed}|${this.stableStringify(projection)}`;
    }

    /**
     * Throw when `audience` is present but cannot be honoured. Called first in `searchInternal`, whose catch
     * turns the throw into a `Success: false` result. A malformed reader is refused rather than skipped:
     * skipping it would restrict nothing, and the room would see the caller's full reach.
     */
    private validateAudience(audience: SearchAudience | undefined): void {
        if (audience === undefined) return;
        const problem = this.audienceProblem(audience);
        if (problem) throw new Error(`SearchEngine: invalid Audience — ${problem}`);
    }

    /** What is wrong with an audience, or `null` when it is well formed. Takes `unknown`: hosts assemble it at runtime. */
    private audienceProblem(audience: unknown): string | null {
        if (audience === null || typeof audience !== 'object') {
            return `expected { Readers: UserInfo[] }, got ${this.describeValue(audience)}. Omit Audience for a search with no audience.`;
        }
        const readers = 'Readers' in audience ? audience.Readers : undefined;
        if (!Array.isArray(readers)) {
            return `Readers must be an array of hydrated UserInfo objects, got ${this.describeValue(readers)}.`;
        }
        const list: unknown[] = readers;
        for (let i = 0; i < list.length; i++) {
            const problem = this.audienceReaderProblem(list[i]);
            if (problem) return `Readers[${i}] ${problem}`;
        }
        return null;
    }

    /**
     * What is wrong with one reader, or `null`. A reader needs a non-empty `ID` and a `UserRoles` array:
     * `[]` is a reader with no roles (legitimate, reads nothing); a missing array means it was never hydrated.
     */
    private audienceReaderProblem(reader: unknown): string | null {
        if (reader === null || typeof reader !== 'object') {
            return `is ${this.describeValue(reader)}, not a UserInfo — map every participant to a hydrated user before searching for them.`;
        }
        const id = 'ID' in reader ? reader.ID : undefined;
        if (typeof id !== 'string' || id.trim() === '') {
            return 'has no ID — a reader the host could not map to a user would restrict nothing, so the search is refused.';
        }
        const roles = 'UserRoles' in reader ? reader.UserRoles : undefined;
        if (!Array.isArray(roles)) {
            return `(${id}) has no UserRoles array — pass hydrated UserInfo (e.g. from UserCache); a reader with no roles is \`UserRoles: []\`.`;
        }
        return null;
    }

    /** `null`, `an array`, or the `typeof` name: validation messages name a bad value's kind rather than echo it. */
    private describeValue(value: unknown): string {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'an array';
        return typeof value;
    }

    /**
     * The readers an audience actually adds: one per distinct ID (case-insensitive), the caller's own ID left
     * out. Empty when the audience changes nothing. Expects an audience that passed `validateAudience`.
     */
    private distinctReaders(audience: SearchAudience | undefined, contextUser: UserInfo): UserInfo[] {
        if (!audience) return [];
        const seen = new Set<string>();
        const callerID = contextUser.ID?.toLowerCase();
        if (callerID) seen.add(callerID);
        const readers: UserInfo[] = [];
        for (const reader of audience.Readers) {
            const id = reader.ID.toLowerCase();
            if (seen.has(id)) continue;
            seen.add(id);
            readers.push(reader);
        }
        return readers;
    }

    /** The distinct reader IDs, lower-cased and sorted, for the cache key. `undefined` when the audience adds no reader, so it keys like no audience. */
    private audienceReaderIDs(audience: SearchAudience | undefined, contextUser: UserInfo): string[] | undefined {
        const ids = this.distinctReaders(audience, contextUser).map(r => r.ID.toLowerCase()).sort();
        return ids.length > 0 ? ids : undefined;
    }

    /**
     * Keep only the results every reader in `params.Audience` may read, on top of the caller's own filter.
     * Each reader gets the same safety net the caller did (`filterByPermissions`: entity read, row filters,
     * ownership), so a shared conversation's results are the intersection of what every participant may see —
     * the asker's reach is the ceiling, each other reader's reach lowers it. Readers are checked concurrently;
     * a reader with the caller's own ID, or listed twice, is checked once. Expects a validated audience
     * (`searchInternal` validates it before doing any work).
     *
     * Two things the pass cannot do, both failing closed:
     * - **Storage hits are refused under an audience.** Their permission model is the storage account's;
     *   `filterByPermissions` re-checks a `storage-file` hit's account for the user it is given, but this pass
     *   does not yet combine those per-reader answers for storage, so a storage hit is not shown to the room.
     * - **A reader with no roles (`UserRoles: []`) reads nothing.** Permissions and row filters are
     *   evaluated from `UserInfo.UserRoles`, so such a reader empties the result. A reader with no
     *   `UserRoles` array at all never gets here: validation refuses it.
     *
     * **Identity contract.** A result survives when every reader's `filterByPermissions` returns it. Survivors
     * are matched to the input by `EntityName|RecordID` (the record the result names), falling back to object
     * identity for a result that names no record. An override of `filterByPermissions` may therefore return
     * copies, but must not rewrite `EntityName` or `RecordID`.
     *
     * Protected so a host can change how an audience combines (a host that materializes a shared reach in one
     * query can replace the per-reader pass). It receives the whole `params`, so an override can see the anchor
     * (`SearchContext`) and the scopes. The default is the intersection.
     */
    protected async FilterForAudience(
        results: SearchResultItem[],
        params: SearchParams,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const readers = this.distinctReaders(params.Audience, contextUser);
        if (readers.length === 0 || results.length === 0) return results;

        const checkable = results.filter(r => r.ResultType !== 'storage-file');
        if (checkable.length < results.length) {
            LogStatus(`SearchEngine: ${results.length - checkable.length} storage result(s) dropped under an audience — ` +
                'storage hits are re-checked for the caller only; per-reader storage checks are a follow-up.');
        }

        const survivors = await Promise.all(readers.map(reader => this.filterByPermissions(checkable, reader)));
        this.logAudienceNarrowing(readers, survivors, checkable.length);
        const keptByEveryReader = survivors.map(list => new Set(list.map(r => this.audienceIdentity(r))));
        return checkable.filter(r => {
            const identity = this.audienceIdentity(r);
            return keptByEveryReader.every(kept => kept.has(identity));
        });
    }

    /** `EntityName|RecordID` for a result that names a record, else the object itself — see `FilterForAudience`'s identity contract. */
    private audienceIdentity(result: SearchResultItem): string | SearchResultItem {
        return result.EntityName && result.RecordID ? `${result.EntityName}|${result.RecordID}` : result;
    }

    /** Log, per reader, why the shared result set shrank: a reader with no roles, or results a reader cannot read. */
    private logAudienceNarrowing(readers: UserInfo[], survivors: SearchResultItem[][], checkedCount: number): void {
        readers.forEach((reader, i) => {
            if (reader.UserRoles.length === 0) {
                LogStatus(`SearchEngine: Audience reader ${reader.ID} has no roles (UserRoles: []) — permissions resolve ` +
                    'from roles, so expect it to read nothing and the shared result set to be empty.');
            }
            const dropped = checkedCount - survivors[i].length;
            if (dropped > 0) {
                LogStatus(`SearchEngine: Audience reader ${reader.ID} cannot read ${dropped} result(s) the caller can — ` +
                    'removed from the shared result set.');
            }
        });
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
     * is precisely the finding the caller asked for. A scope that cannot be resolved (inactive,
     * expired, or missing) refuses the whole search, so when one is named every scope comes back
     * unreachable, each saying why.
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
        return this.markRefusedTogether(explanations, this.resolveScopes(input.ScopeIDs).Unresolved);
    }

    /**
     * A search naming a scope it cannot resolve is refused outright (see `refuseUnresolvableScopes`), so a dry
     * run over the same IDs reaches nothing through ANY of them — including a scope that is reachable on its
     * own. Each such scope is marked unreachable with the reason; the unresolvable ones already explain
     * themselves.
     */
    private markRefusedTogether(explanations: ScopeExplanation[], unresolved: string[]): ScopeExplanation[] {
        if (unresolved.length === 0) return explanations;
        const note = `searched together with ${unresolved.join(', ')}, which cannot be resolved, the search is refused — `
            + 'this scope reaches nothing in it (on its own it would be searched as explained above)';
        return explanations.map(e => unresolved.some(id => UUIDsEqual(id, e.ScopeID))
            ? e
            : { ...e, Reachable: false, Diagnostics: [...e.Diagnostics, note] });
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
        // Active first, as the search resolves it: `GetScopeBundle` alone finds a scope of any status, so an
        // inactive or expired scope used to be explained as searchable while the search refused it.
        const scope = this.Base.GetActiveScopeByID(scopeID);
        const bundle = scope ? this.Base.GetScopeBundle(scopeID) : undefined;
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
            // DO NOT BIND A PRINCIPAL THE ENTITLEMENT STEP JUST REFUSED. `deriveServerValue` binds
            // `Principals.SkillID` (and AgentID) into a dimension's expansion query, so resolving
            // with the caller's principals after `explainEntitlement` denied them would run
            // server-authored SQL parameterised by an ID that failed its gate — the exact thing the
            // action refuses with INVALID_PARAM rather than "continuing with a null skill". The
            // dimension explanation is still produced, just for an unprincipled search, and the
            // diagnostic says so rather than leaving the reader to assume the principals applied.
            // Drop the principals ONLY when the principals are what was refused. Dropping them for
            // an unrelated denial — the user simply has no per-scope grant — drives the expansion
            // query with null ids, which returns no rows, which makes a required dimension throw and
            // the explanation announce "dimension resolution FAILED". The admin then goes and fixes a
            // dimension that was never broken. `PrincipalNotActivatable` is exactly the distinction
            // needed to tell those two cases apart.
            // EVERY principal-side refusal drops the principals, not just one of them.
            //
            // The rule stated above is "drop them ONLY when the principals are what was refused", and
            // `PrincipalNotActivatable` was the only source honouring it. `AgentNone`,
            // `AgentAssignedNotListed`, `SkillNone` and `SkillAssignedNotListed` are equally
            // principal-side — the principal IS the reason — yet their ids were still bound into the
            // expansion query. This is the same set the Scoped Search action classifies as
            // ACCESS_DENIED rather than PERMISSION_DENIED, for the same reason.
            // A TOTAL MAP, NOT A LIST: `EntitlementSource` is a closed union, so writing
            // this as `Record<Source, boolean>` makes the compiler demand an answer for any source
            // added later. As a `string[]` a new principal-side source would silently default to
            // "bind it" — which is the exact defect this block exists to fix, re-openable by an
            // unrelated edit.
            const IS_PRINCIPAL_SIDE: Record<EntitlementSource, boolean> = {
                PrincipalNotActivatable: true,
                AgentNone: true,
                AgentAssignedNotListed: true,
                SkillNone: true,
                SkillAssignedNotListed: true,
                // Grant-only sources: unreachable while `Allowed` is false, listed for totality.
                AgentUnscopedAll: false,
                SkillUnscopedAll: false,
                // User-side: dropping principals here would drive the expansion query with nulls,
                // making a required dimension throw and the explanation announce a failure that is
                // not real. `DirectGrant` covers the explicit-None deny, which is still user-side.
                DirectGrant: false,
                RoleGrant: false,
                NoGrant: false,
                // Scope-side, and unreachable here: an unresolvable scope is explained before entitlement.
                ScopeUnresolvable: false,
            };
            const principalsJudged =
                entitlement.Allowed || !IS_PRINCIPAL_SIDE[entitlement.Source];
            if (!principalsJudged && (input.AIAgentID || input.AISkillID)) {
                diagnostics.push(
                    'principals were NOT bound into dimension resolution: entitlement denied them, '
                    + 'so the bound below is the one an unprincipled search would see.');
            }
            const resolved = await this.dimensionResolver.Resolve({
                Scope: scope,
                CallerContext: input.SearchContext,
                ContextUser: contextUser,
                Principals: principalsJudged
                    ? this.principalsFrom(input)
                    : { AgentID: null, SkillID: null },
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

        // What the scope's rows let it reach — which providers run (listed, configured, available, and reading
        // a lane kind the scope configures) over which lanes — by the same judgement the search path makes, for
        // a full (non-preview) search. A lane skipped here is one the real search would refuse on, so a skipped
        // lane makes the scope unreachable rather than "reachable through the others".
        const bound = this.judgeScopeBound(bundle, lanes, false);
        diagnostics.push(...bound.Diagnostics);

        return {
            ScopeID: scope.ID,
            ScopeName: scope.Name,
            Entitlement: entitlement,
            Dimensions: dimensions,
            Lanes: lanes,
            Diagnostics: diagnostics,
            Reachable: entitlement.Allowed && bound.CanRetrieve && !dimensionFailure,
            Unbounded: bound.Unbounded,
            ResolvedContext: effectiveContext,
        };
    }

    /**
     * What a scope's configuration lets it reach. One judgement, used by the dry run and the search path — and
     * the search path calls exactly the `Providers` it returns, so the two cannot disagree about who runs.
     *
     * A GLOBAL scope runs unconstrained (the search path never builds constraints for it), so with no
     * lanes it is unbounded. A NON-global scope is bounded by its rows: it runs only the providers its enabled
     * rows name that are configured and available (and support preview, for a preview search), and of those
     * only the ones that read a lane kind the scope has an active lane of (`BaseSearchProvider.ConsumesLaneKinds`).
     * With none of those, it reaches nothing — an empty configuration never means "everything". A skipped lane
     * (only a dry run has one) is a problem the real search refuses on, so it makes the scope unreachable too.
     */
    private judgeScopeBound(bundle: ScopeBundle, lanes: LaneExplanation[], isPreview: boolean): ScopeBoundJudgement {
        if (bundle.Scope.IsGlobal) return this.judgeGlobalScopeBound(lanes, isPreview);
        const runnable = this.runnableScopeProviders(bundle, isPreview);
        const serving = this.providersWithAnActiveLane(runnable, lanes);
        const skipped = lanes.filter((l) => l.Status === 'Skipped');
        const diagnostics: string[] = [];
        if (bundle.Providers.length === 0) diagnostics.push(NO_PROVIDER_ROWS_DIAGNOSTIC);
        else if (runnable.length === 0) diagnostics.push(noRunnableProviderDiagnostic(isPreview));
        if (lanes.length === 0) diagnostics.push(NO_LANES_DIAGNOSTIC);
        if (skipped.length > 0) diagnostics.push(refusedLanesDiagnostic(skipped));
        const hasActiveLane = lanes.some((l) => l.Status === 'Active');
        if (runnable.length > 0 && hasActiveLane && serving.length === 0) diagnostics.push(noProviderReadsALaneDiagnostic(runnable, lanes));
        const canRetrieve = serving.length > 0 && skipped.length === 0;
        return { CanRetrieve: canRetrieve, Unbounded: false, Diagnostics: diagnostics, Providers: canRetrieve ? serving : [] };
    }

    /** {@link judgeScopeBound} for a global scope, which runs every available provider unconstrained. */
    private judgeGlobalScopeBound(lanes: LaneExplanation[], isPreview: boolean): ScopeBoundJudgement {
        const hasLanes = lanes.length > 0;
        return {
            CanRetrieve: hasLanes ? lanes.some((l) => l.Status === 'Active') : true,
            Unbounded: !hasLanes,
            Diagnostics: hasLanes ? [] : [UNBOUNDED_SCOPE_DIAGNOSTIC],
            Providers: this.availableProviders(isPreview),
        };
    }

    /** The configured entries a search may call: available now, and preview-capable for a preview search. */
    private availableProviders(isPreview: boolean): ProviderEntry[] {
        return this._providerEntries.filter(entry => entry.Provider.IsAvailable() && (!isPreview || entry.SupportsPreview));
    }

    /**
     * The available entries a NON-global scope's enabled provider rows name. A non-global scope runs ONLY the
     * providers it lists: no enabled row means no provider, never every provider (disabling a scope's last row
     * used to widen it to all of them).
     */
    private runnableScopeProviders(bundle: ScopeBundle, isPreview: boolean): ProviderEntry[] {
        const listed = new Set(bundle.Providers.map(p => NormalizeUUID(p.SearchProviderID)));
        return this.availableProviders(isPreview).filter(entry => listed.has(NormalizeUUID(entry.ID)));
    }

    /**
     * Of `entries`, the ones with at least one ACTIVE lane of a kind they read (`ConsumesLaneKinds`). A provider
     * whose lane kinds are all empty in the scope is never called: it could only search nothing, or — written with
     * the old `?.length` pattern — fall back to its unscoped default.
     */
    private providersWithAnActiveLane(entries: ProviderEntry[], lanes: LaneExplanation[]): ProviderEntry[] {
        const activeKinds = new Set(lanes.filter((l) => l.Status === 'Active').map((l) => l.Kind));
        return entries.filter(entry => entry.Provider.ConsumesLaneKinds.some(kind => activeKinds.has(kind)));
    }

    /** Resolve entitlement for the dry run, including the skill and tenant principals.
     * `protected`, like {@link principalsFrom}, so a test can drive it without weak-typed casts.
     */
    protected async explainEntitlement(
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
            // No ENTITLEMENT gate here on purpose — that judgement belongs to
            // ResolveEffectivePermission. (The loadability check just below is a different thing: it
            // refuses an id that names nothing, which the resolver could not judge either way.)
            // The principals are judged inside ResolveEffectivePermission,
            // where a principal actually widens — so the preview and the search reach the same
            // verdict because they run the same code, not because two copies agree.
            const [agent, skill] = await Promise.all([
                this.loadPrincipal<MJAIAgentEntity>('MJ: AI Agents', input.AIAgentID, contextUser),
                this.loadPrincipal<MJAISkillEntity>('MJ: AI Skills', input.AISkillID, contextUser),
            ]);

            // A PRINCIPAL THAT WAS NAMED BUT WOULD NOT LOAD IS A REFUSAL, NOT AN ABSENCE.
            //
            // `loadPrincipal` returns null both when nothing was supplied and when what was supplied
            // does not exist. Letting the second case fall through as null means the resolver never
            // sees a principal, so its rules never fire, and a user with their own grant is reported
            // ALLOWED — after which `principalsJudged` is true and `principalsFrom(input)` binds the
            // caller's RAW id string into the expansion query, unjudged. That is precisely what the
            // action refuses with INVALID_PARAM rather than "continuing with a null skill", and a
            // preview that promises what the search refuses is worse than no preview.
            const unloadable =
                (input.AIAgentID && !agent) ? `agent '${input.AIAgentID}'`
                : (input.AISkillID && !skill) ? `skill '${input.AISkillID}'`
                : null;
            if (unloadable) {
                return {
                    Allowed: false,
                    Level: 'None',
                    Source: 'PrincipalNotActivatable',
                    Reason: `${unloadable} was supplied but could not be loaded, so it cannot be judged. The Scoped Search action refuses this with INVALID_PARAM, and the SearchKnowledge resolvers refuse an unloadable agent the same way — preview and enforcement agree.`,
                    Principals: principals,
                };
            }

            const permission = await GetSearchScopePermissionResolver().ResolveEffectivePermission({
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
            // NOTE: Source 'NoGrant' is user-side, so the caller's principals are still bound into
            // dimension resolution even though nothing judged them — reaching here requires the
            // permission store itself to be failing. Revisit if ExplainScope gains a production caller.
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

    /** Load an agent or skill principal by ID; null when no ID was supplied.
     * `protected` so a test can substitute principal loading; see {@link explainEntitlement}.
     */
    protected async loadPrincipal<T extends MJAIAgentEntity | MJAISkillEntity>(
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
                // FolderPath restricts the lane to one folder, so a path that rendered empty, with an
                // empty segment, or with traversal makes the lane unusable — as buildScopeConstraints rules.
                Status: problems.has(row.ID) ? 'Skipped' : 'Active',
                RenderedFilter: rendered?.FolderPath ?? null,
                Reason: problems.get(row.ID),
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
            // An inactive or expired scope still has a row, and its name is what an admin will recognise.
            ScopeName: this.Base.GetScopeByID(scopeID)?.Name ?? '(not found)',
            Entitlement: {
                Allowed: false,
                Level: 'None',
                // Not 'NoGrant': nothing about the caller's grants was judged — the scope's status refused it.
                Source: 'ScopeUnresolvable',
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
            Diagnostics: [`scope "${scopeID}" is not an active scope — a search naming it is refused, never widened to a global search`],
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
     * Load the `ScopeBundle` of each requested scope ID that names a scope active right now, and collect the IDs
     * that do not (inactive, expired, or missing). A search refuses when any ID is unresolved
     * ({@link refuseUnresolvableScopes}); `ExplainScope` reports the same. No IDs → no bundles, which the
     * search treats as Global.
     */
    private resolveScopes(scopeIDs?: string[]): { Bundles: ScopeBundle[]; Unresolved: string[] } {
        const resolution = { Bundles: [] as ScopeBundle[], Unresolved: [] as string[] };
        for (const id of scopeIDs ?? []) {
            const bundle = this.Base.GetActiveScopeByID(id) ? this.Base.GetScopeBundle(id) : undefined;
            if (bundle) resolution.Bundles.push(bundle);
            else resolution.Unresolved.push(id);
        }
        return resolution;
    }

    /**
     * Refuse a search that named a scope the engine cannot resolve (inactive, expired, or missing): an error
     * result and a `Failure` row in `MJ: Search Execution Logs`, never a wider search.
     *
     * Before, an unresolvable scope was skipped, and a search whose scopes were all skipped ran UNSCOPED —
     * every provider, every entity, no scope filter — because no resolved scope reads as Global. Refused when
     * ANY named scope fails, not only when all do: dropping one of several scopes silently changes what the
     * caller asked for, and nothing in the results would tell them. An error result is how the engine already
     * reports a scope it refuses (a `ScopeDimensionError`, a restricting filter that did not render).
     */
    private refuseUnresolvableScopes(
        unresolved: string[],
        params: SearchParams,
        contextUser: UserInfo,
        startTime: number
    ): SearchResult {
        const named = `${unresolved.length === 1 ? 'scope' : 'scopes'} ${unresolved.map(id => `"${id}"`).join(', ')}`;
        const message = `SearchEngine: search refused — ${named} could not be resolved (inactive, expired, or not found). ` +
            'A search naming a scope it cannot resolve is refused, never run without that scope.';
        LogError(message);
        this.logSearchExecution({
            Status: 'Failure',
            FailureReason: message,
            Query: params.Query,
            // The log row's SearchScopeID is a foreign key, so it names a scope row that exists, or none — and it
            // must name a scope that was REFUSED: the first unresolved scope that has a row (inactive or expired),
            // never a valid scope searched beside a missing one, which would attribute the refusal to it.
            ScopeIDs: unresolved.filter(id => this.Base.GetScopeByID(id) !== undefined).slice(0, 1),
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
        return this.buildErrorResult(message, startTime);
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
        sourceCounts: { Vector: number; FullText: number; Entity: number; Storage: number; Tag?: number };
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
        const lanes = this.buildLaneExplanations(bundle, constraints, new Map());
        // The same judgement the dry run makes, so both produce the same verdict and the same prose —
        // an auditor reading a log row should not have to know which path wrote it. Its `Providers` are the ones
        // this search calls: listed by an enabled row, configured, available (preview-capable for a preview), and
        // reading a lane kind this scope configures.
        const bound = this.judgeScopeBound(bundle, lanes, isPreview);
        const decision: ScopeExplanation = {
            ScopeID: scope.ID,
            ScopeName: scope.Name,
            Entitlement: null,
            Dimensions: dimensionResult.Provenance,
            Lanes: lanes,
            Diagnostics: [...dimensionResult.Diagnostics, ...bound.Diagnostics],
            Reachable: bound.CanRetrieve,
            Unbounded: bound.Unbounded,
            ResolvedContext: effectiveContext,
        };

        const applicableProviders = bound.Providers;
        if (applicableProviders.length === 0) {
            LogStatus(`SearchEngine: Scope "${scope.Name}" runs no provider — skipping. ${bound.Diagnostics.join(' ')}`);
            return { scopeID: scope.ID, fused: [], sourceCounts: { Vector: 0, FullText: 0, Entity: 0, Storage: 0 }, decision };
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

        // A lane's ExtraFilter bounds its entity for EVERY provider, not only the entity lane that applies it in SQL —
        // including a content-item hit promoted to its origin record, which is promoted here, per scope, for that reason.
        const labeled = await this.boundScopeHits(await Promise.all(promises), constraints, contextUser, scope.Name);
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

    // ────────────────────────────────────────────────────────────────
    // Lane ExtraFilter: one bound per entity, for every provider
    // ────────────────────────────────────────────────────────────────

    /**
     * Hold one scope's hits to its lane bounds, before fusion, in three steps:
     *  1. every hit, against the lane `ExtraFilter` of the entity it names ({@link enforceLaneExtraFilters});
     *  2. content-item promotion: a `MJ: Content Items` hit derived from an entity record becomes that record,
     *     marked `PromotedFromContentItemID` (`SearchEnricher.ExcludeEntitySourcedContentItems`);
     *  3. every PROMOTED hit, against the lane `ExtraFilter` of the origin entity it now names.
     *
     * Step 1 holds a content-item hit to a Content Items lane; step 3 holds the record it became to that
     * record's lane. Promotion used to run once, after cross-scope fusion, so a promoted hit met no lane bound:
     * a vector hit on a content item became a row of a bounded entity from outside the bound. `searchInternal`
     * promotes only unconstrained results (which have no lane bounds), so nothing is promoted twice.
     */
    private async boundScopeHits(
        lists: LabeledResultList[],
        constraints: ScopeConstraints,
        contextUser: UserInfo,
        scopeName: string
    ): Promise<LabeledResultList[]> {
        const bounded = await this.enforceLaneExtraFilters(lists, constraints, contextUser, scopeName, 'all');
        const promoted = await this.promoteContentItems(bounded, contextUser);
        return this.enforceLaneExtraFilters(promoted, constraints, contextUser, scopeName, 'promoted');
    }

    /** Content-item promotion, per provider list. A list with no `MJ: Content Items` hit comes back unchanged, unread. */
    private async promoteContentItems(lists: LabeledResultList[], contextUser: UserInfo): Promise<LabeledResultList[]> {
        this._enricher.Provider = this.ProviderToUse;
        return Promise.all(lists.map(async (list) => ({
            ...list,
            Results: await this._enricher.ExcludeEntitySourcedContentItems(list.Results, contextUser),
        })));
    }

    /**
     * Enforce each entity lane's rendered `ExtraFilter` on the hits of every OTHER provider.
     *
     * The entity lane applies its ExtraFilter in SQL. The full-text and tag lanes take only the lanes'
     * entity NAMES, and the vector and 3rd-party lanes key off their own index rows — so a scope that bounds
     * an entity with an ExtraFilter still returned rows outside it through every lane but one. Here a hit for
     * an entity with a lane ExtraFilter in this scope is kept only when its record satisfies that filter,
     * read as the user: `PK IN (...) AND (<ExtraFilter>)`, one RunView per filtered entity per scope (the
     * permission pass's readability check, with the lane's filter as the clause). The filter is the exact
     * string the entity lane runs: same template, same context, same escaping.
     *
     * Exemption follows the provider the ENGINE stamped on the hit (`ProviderId`, through
     * {@link ProviderForResult}): only a provider declaring `BaseSearchProvider.AppliesLaneExtraFilter` (the entity
     * provider) applied the filter already. `SourceType` is provider-declared and proves nothing, and a promoted
     * content-item hit is never exempt (the filter it met, if any, was the Content Items lane's). Storage files are
     * not entity records and pass. `pass` is `'promoted'` to check only promoted hits ({@link boundScopeHits}).
     * Fails closed: a failed read drops that entity's hits from the other providers.
     */
    private async enforceLaneExtraFilters(
        lists: LabeledResultList[],
        constraints: ScopeConstraints,
        contextUser: UserInfo,
        scopeName: string,
        pass: 'all' | 'promoted'
    ): Promise<LabeledResultList[]> {
        const bounds = this.laneEntityBounds(constraints.Entities);
        if (bounds.size === 0) return lists;
        const boundOf = (item: SearchResultItem): LaneEntityBound | undefined => this.laneBoundFor(item, bounds, pass);
        const candidates = new Map<LaneEntityBound, SearchResultItem[]>();
        for (const item of lists.flatMap(l => l.Results)) {
            const bound = boundOf(item);
            if (bound) candidates.set(bound, [...(candidates.get(bound) ?? []), item]);
        }
        if (candidates.size === 0) return lists;

        const kept = await this.hitsInsideLaneFilters(candidates, contextUser, scopeName);
        const bounded = lists.map(list => ({ ...list, Results: list.Results.filter(r => !boundOf(r) || kept.has(r)) }));
        const removed = lists.reduce((n, l) => n + l.Results.length, 0) - bounded.reduce((n, l) => n + l.Results.length, 0);
        if (removed > 0) {
            LogStatus(`SearchEngine: scope "${scopeName}" — lane ExtraFilters removed ${removed} hit(s) ` +
                'that other providers returned outside the entity lane\'s bound.');
        }
        return bounded;
    }

    /**
     * Each entity's lane bound, keyed by {@link laneEntityKey}. Several lanes on one entity are a union (the
     * entity lane searches each), so their filters are ORed; an entity with any UNFILTERED lane is unbounded
     * for this scope and gets no entry. A lane whose entity could not be named is skipped.
     */
    private laneEntityBounds(lanes: ScopeEntityConstraint[] | undefined): Map<string, LaneEntityBound> {
        const filters = new Map<string, { EntityName: string; Filters: string[] | null }>();
        for (const lane of lanes ?? []) {
            const key = this.laneEntityKey(lane.EntityName);
            if (!key) continue;
            const filter = lane.ExtraFilter?.trim();
            const prior = filters.get(key);
            const merged = !filter || prior?.Filters === null ? null : [...(prior?.Filters ?? []), filter];
            filters.set(key, { EntityName: lane.EntityName, Filters: merged });
        }
        const bounds = new Map<string, LaneEntityBound>();
        for (const [key, entry] of filters) {
            if (!entry.Filters) continue;
            const clause = entry.Filters.length === 1 ? entry.Filters[0] : entry.Filters.map(f => `(${f})`).join(' OR ');
            bounds.set(key, { EntityName: entry.EntityName, Clause: clause });
        }
        return bounds;
    }

    /** An entity name normalised for matching a hit's `EntityName` to a lane's. */
    private laneEntityKey(entityName: string | null | undefined): string {
        return (entityName ?? '').trim().toLowerCase();
    }

    /**
     * The lane bound `item` must satisfy in this `pass`, or `undefined` when it has none: a storage file, a hit
     * from a provider that applied the lane filter itself, a hit for an entity with no filtered lane — or, in the
     * `'promoted'` pass, a hit that was not promoted (step 1 of {@link boundScopeHits} already checked it).
     */
    private laneBoundFor(item: SearchResultItem, bounds: Map<string, LaneEntityBound>, pass: 'all' | 'promoted'): LaneEntityBound | undefined {
        if (item.ResultType === 'storage-file') return undefined;
        if (pass === 'promoted' && !item.PromotedFromContentItemID) return undefined;
        if (this.providerThatReadRow(item)?.AppliesLaneExtraFilter === true) return undefined;
        return bounds.get(this.laneEntityKey(item.EntityName));
    }

    /** The candidate hits whose record satisfies its entity's lane bound — one read per entity, in parallel. */
    private async hitsInsideLaneFilters(
        candidates: Map<LaneEntityBound, SearchResultItem[]>,
        contextUser: UserInfo,
        scopeName: string
    ): Promise<Set<SearchResultItem>> {
        const kept = new Set<SearchResultItem>();
        await Promise.all(Array.from(candidates.entries()).map(async ([bound, hits]) => {
            for (const hit of await this.hitsInsideLaneFilter(bound, hits, contextUser, scopeName)) kept.add(hit);
        }));
        return kept;
    }

    /** `hits` (all of `bound`'s entity) whose record satisfies the lane filter, read as the user; none when the read fails. */
    private async hitsInsideLaneFilter(
        bound: LaneEntityBound,
        hits: SearchResultItem[],
        contextUser: UserInfo,
        scopeName: string
    ): Promise<SearchResultItem[]> {
        try {
            const entity = this.ProviderToUse.EntityByName(bound.EntityName);
            if (!entity) throw new Error('the entity is not in metadata');
            const recordIDs = Array.from(new Set(hits.map(h => h.RecordID)));
            const keys = await this.readableRecordKeys(entity, recordIDs, bound.Clause, contextUser);
            if (!keys) throw new Error('the read failed');
            return hits.filter(h => {
                const key = this.recordMatchKey(entity, h.RecordID);
                return key !== null && keys.has(key);
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`SearchEngine: scope "${scopeName}" — ${hits.length} hit(s) of "${bound.EntityName}" ` +
                `could not be checked against the lane ExtraFilter, so they were dropped: ${msg}`);
            return [];
        }
    }

    /**
     * Assemble a `ScopeConstraints` for a single scope: Nunjucks-render each template
     * field against the `SearchContext`, then hand the rendered values to providers.
     */
    /**
     * Fail a search CLOSED when a scope field that RESTRICTS was authored but did not render
     * usably (see `CheckRenderedTemplate`).
     *
     * Throwing rather than dropping the offending row is deliberate. Dropping one lane of
     * several would quietly change what the scope covers, and a scope's ONLY lane dropped used to
     * collapse to `undefined` — "unscoped" to every provider. (A non-global scope now hands providers
     * an empty list, which means "nothing", but a silently narrowed scope is still a wrong answer.)
     * A broken restricting template is a misconfiguration and should be loud and actionable, never
     * silently degraded.
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

        const externalIndexes: ScopeExternalIndexConstraint[] = bundle.ExternalIndexes.map(row =>
            this.buildExternalIndexConstraint(row, searchContext, scopeLabel, collector));
        const entities: ScopeEntityConstraint[] = bundle.Entities.map(row =>
            this.buildEntityConstraint(row, searchContext, scopeLabel, collector));
        const storage: ScopeStorageConstraint[] = bundle.StorageAccounts.map(row =>
            this.buildStorageConstraint(row, searchContext, scopeLabel, collector));

        // Per-provider query transforms: resolved from SearchScopeProvider.QueryTransformTemplateID
        // For stored template IDs we need the TemplateEngine — that resolution happens in
        // Phase 1C (AgentPreExecutionRAG) before this engine is called. We still honor any
        // pre-rendered transforms that upstream callers placed in the scope config bag.
        const scopeConfig = this.parseJson(bundle.Scope.ScopeConfig);
        const rawTransforms = scopeConfig?.perProviderQueryTransforms;
        const queryTransforms = rawTransforms && typeof rawTransforms === 'object'
            ? { ...rawTransforms as Record<string, string> }
            : undefined;

        // A NON-global scope hands every provider a defined list, even an empty one: an empty list means
        // "nothing for you", and `undefined` would read as "unscoped" — every entity, every index, no
        // filter. Only a global scope keeps the old collapse (it runs unconstrained anyway).
        const lanesOrUnscoped = <T>(rows: T[]): T[] | undefined => (rows.length || !bundle.Scope.IsGlobal ? rows : undefined);
        return {
            ExternalIndexes: lanesOrUnscoped(externalIndexes),
            Entities: lanesOrUnscoped(entities),
            StorageAccounts: lanesOrUnscoped(storage),
            Context: searchContext,
            QueryTransforms: queryTransforms,
            ScopeConfig: scopeConfig ?? undefined
        };
    }

    /** One external-index lane's constraint, with its restricting fields guarded. */
    private buildExternalIndexConstraint(
        row: ScopeExternalIndexRow,
        searchContext: SearchContext | undefined,
        scopeLabel: string,
        collector?: LaneProblemCollector
    ): ScopeExternalIndexConstraint {
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
    }

    /** One entity lane's constraint: its `ExtraFilter` rendered for T-SQL and guarded. */
    private buildEntityConstraint(
        row: ScopeEntityRow,
        searchContext: SearchContext | undefined,
        scopeLabel: string,
        collector?: LaneProblemCollector
    ): ScopeEntityConstraint {
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
            // UserSearchString is NOT a restriction — it shapes the query text — so a soft
            // render there cannot widen an access bound and is deliberately left unguarded.
            // (FolderPath, by contrast, restricts; see buildStorageConstraint.)
            // 'none' deliberately: this becomes QUERY TEXT, not syntax. Escaping it would corrupt
            // the search rather than protect it, and it cannot express a bound.
            UserSearchString: row.UserSearchString ? RenderScopeTemplate(row.UserSearchString, searchContext, undefined, 'none') : undefined
        };
    }

    /**
     * One storage lane's constraint. `FolderPath` RESTRICTS — it is what confines the lane to one folder
     * of the account — so a FolderPath that was authored but renders empty, with an empty segment, with
     * a `..` segment, or with an interpolated value the `path` escaper refuses makes the lane unusable:
     * the search is refused (or, in a dry run, the lane is reported skipped). An absent FolderPath still
     * means the whole account.
     */
    private buildStorageConstraint(
        row: ScopeStorageRow,
        searchContext: SearchContext | undefined,
        scopeLabel: string,
        collector?: LaneProblemCollector
    ): ScopeStorageConstraint {
        let folderPath: string | undefined;
        if (row.FolderPath) {
            folderPath = this.renderFolderPath(row.FolderPath, searchContext, scopeLabel, row, collector);
            if (folderPath !== undefined) {
                const check = CheckRenderedFolderPath(row.FolderPath, folderPath);
                if (check.Status === 'unusable') this.reportFolderPathProblem(check.Reason, scopeLabel, row, collector);
            }
        }
        return {
            SearchScopeStorageAccountID: row.ID,
            FileStorageAccountID: row.FileStorageAccountID,
            FolderPath: folderPath,
        };
    }

    /**
     * Render a storage lane's FolderPath on the `path` lane. The renderer throws when an interpolated value
     * is `..` or `.`, or contains a separator; that is reported as the lane's problem (undefined is returned
     * only in a dry run, where the problem is collected instead of thrown).
     */
    private renderFolderPath(
        source: string,
        searchContext: SearchContext | undefined,
        scopeLabel: string,
        row: ScopeStorageRow,
        collector?: LaneProblemCollector
    ): string | undefined {
        try {
            return RenderScopeTemplate(source, searchContext, undefined, 'path');
        } catch (e) {
            this.reportFolderPathProblem(e instanceof Error ? e.message : String(e), scopeLabel, row, collector);
            return undefined;
        }
    }

    /** A FolderPath problem, in the wording `assertRestrictingTemplateRendered` uses for every restricting field. */
    private reportFolderPathProblem(reason: string, scopeLabel: string, row: ScopeStorageRow, collector?: LaneProblemCollector): void {
        this.reportLaneProblem(
            `SearchEngine: scope ${scopeLabel} — FolderPath for storage account "${row.FileStorageAccountID}" ` +
                `could not be rendered safely, so the search was NOT run. ${reason}`,
            row.ID,
            collector
        );
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

    /**
     * The per-provider over-fetch multiplier for this search, in priority order: the caller's
     * `SearchParams.PermissionOverfetchFactor`; else the **largest** of each resolved scope's declared
     * `ScopeConfig.permissionOverfetchFactor` (a scope that declares none counts as the engine default);
     * else the engine default. Clamped to `[1, MAX_OVERFETCH_FACTOR]`.
     *
     * The largest wins across scopes, not the first: over-fetch exists to compensate for late
     * permission filtering, and a lane trimmed heavily by it needs the extra candidates whichever
     * scope it belongs to. A larger factor never changes which results the caller gets (the final
     * list is still trimmed to `MaxResults`), but it does cost more: every provider returns more
     * candidates, dedup, the content exclusion and the permission passes do more work, a re-ranker is
     * fed up to its `inputTopN` from a bigger pool, and `streamSearch`'s per-provider partial events
     * (capped to the caller's `MaxResults`) draw from it. This is why a scope may declare it at all:
     * the scope's author knows how sparse its lanes are after permissions, and every caller shouldn't
     * have to.
     */
    protected ResolvePermissionOverfetchFactor(params: SearchParams, resolvedScopes: ScopeBundle[]): number {
        if (typeof params.PermissionOverfetchFactor === 'number' && Number.isFinite(params.PermissionOverfetchFactor)) {
            return this.clampOverfetchFactor(params.PermissionOverfetchFactor, 'the caller');
        }
        // A scope that declares nothing counts as the default, so one scope's low factor never pulls
        // down a neighbour that was happy with the default (the max is a floor, never a ceiling).
        const factors = resolvedScopes.map(bundle => this.scopeOverfetchFactor(bundle.Scope.ScopeConfig) ?? this._defaultOverfetchFactor);
        if (factors.length > 0) return this.clampOverfetchFactor(Math.max(...factors), 'a scope');
        return this._defaultOverfetchFactor;
    }

    /** A scope's declared `ScopeConfig.permissionOverfetchFactor`, when it is a finite number. Anything else is "not declared". */
    private scopeOverfetchFactor(scopeConfigJson: string | null | undefined): number | undefined {
        const factor = this.parseJson(scopeConfigJson)?.permissionOverfetchFactor;
        return typeof factor === 'number' && Number.isFinite(factor) ? factor : undefined;
    }

    /**
     * Hold the factor to `[1, MAX_OVERFETCH_FACTOR]`. Below 1 would under-fetch the caller's own `topK`;
     * above the ceiling, a single metadata edit would multiply every provider call for every caller of
     * the scope (vector providers bill per candidate). A clamped value is logged so the author sees it.
     */
    private clampOverfetchFactor(factor: number, from: string): number {
        const clamped = Math.min(SearchEngine.MAX_OVERFETCH_FACTOR, Math.max(1, factor));
        if (clamped !== factor) {
            LogStatus(`SearchEngine: permission over-fetch factor ${factor} from ${from} clamped to ${clamped} (allowed range 1–${SearchEngine.MAX_OVERFETCH_FACTOR}).`);
        }
        return clamped;
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
        const entries = this.availableProviders(isPreview);

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
    private countSources(lists: LabeledResultList[]): { Vector: number; FullText: number; Entity: number; Storage: number; Tag?: number } {
        const counts = { Vector: 0, FullText: 0, Entity: 0, Storage: 0, Tag: 0 };
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
                case 'tag':
                    counts.Tag += list.Results.length;
                    break;
            }
        }
        return counts;
    }

    // ────────────────────────────────────────────────────────────────
    // Permission filtering (residual late safety net, then the origin-record gate)
    // ────────────────────────────────────────────────────────────────

    /**
     * Filter search results by entity-level and row-level security permissions, then by whether the user
     * may read the record each content result was derived from.
     *
     * **Steps 1–4 are a safety net.** Providers are expected to do per-provider permission
     * push-down (Section 3.6 of plans/search-scopes-rag-plus.md). If those steps remove more
     * than a handful of results in practice, the responsible provider's push-down is incomplete
     * and should be fixed. **Step 5 is not**: it drops by design, because no provider can push
     * an origin record's own row filters down into a content index. Its removals are counted
     * into `stats.OriginGateRemoved`, so the late-filter count keeps its meaning.
     *
     * Groups results by entity for efficient permission checking:
     * 1. Unknown entities are excluded (fail closed).
     * 2. If the user lacks entity-level CanRead, all results for that entity are dropped.
     * 3. If the user is exempt from RLS, all results pass through.
     * 4. If RLS applies, a RunView validates which record IDs the user can read.
     * 5. Content items and chunks are kept only when the user may read the record they were
     *    derived from ({@link VerifyOriginRecords}).
     *
     * `storage-file` results take their own path ({@link filterStorageResults}): they are re-checked against
     * the storage-account permission model for this user, never passed through on the strength of their type.
     *
     * @param stats optional per-call counters; `OriginGateRemoved` is incremented by step 5's removals
     */
    protected async filterByPermissions(
        results: SearchResultItem[],
        contextUser: UserInfo,
        stats?: { OriginGateRemoved: number }
    ): Promise<SearchResultItem[]> {
        if (results.length === 0) return results;

        // Storage file results have their own permission model (FileStorageAccountPermission) — re-checked
        // here for this user rather than trusted from the provider (see filterStorageResults)
        const storageResults = results.filter(r => r.ResultType === 'storage-file');
        const entityResults = results.filter(r => r.ResultType !== 'storage-file');

        const byEntity = this.groupResultsByEntity(entityResults);
        const permitted: SearchResultItem[] = [];

        const promises: Promise<void>[] = [this.filterStorageResults(storageResults, contextUser, permitted)];
        for (const [entityName, groupResults] of byEntity) {
            promises.push(
                this.filterEntityResults(entityName, groupResults, contextUser, permitted, stats)
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
     * The storage half of {@link filterByPermissions}: re-check `storage-file` results for `contextUser` and push the
     * ones that pass into `permitted`.
     *
     * `ResultType` is set by whichever provider produced a result, so being typed `storage-file` proves nothing. A
     * storage hit is kept only when ALL hold:
     * - its `ProviderId` — stamped by this engine on every result, overwriting whatever the provider set — names a
     *   configured entry whose provider is a {@link StorageSearchProvider};
     * - the account it names (`RawMetadata.accountId`, as that provider writes it) is one `contextUser` may read now,
     *   per `StorageAccessEvaluator` (per call; the account-without-rows rule lives there); and
     * - the object it names (`RawMetadata.path` / `objectId`) does not back an `MJ: Files` row `contextUser` may not
     *   read — the tracked-file rule `CreatePreAuthDownloadUrl` applies, so a hit never names (or excerpts) a file the
     *   caller would be refused ({@link dropUnreadableTrackedStorageHits}).
     *
     * Anything else — no or a foreign `ProviderId`, missing or unparseable metadata, an evaluator failure or throw —
     * drops the result (fail closed). Order is restored by the caller.
     */
    private async filterStorageResults(
        results: SearchResultItem[],
        contextUser: UserInfo,
        permitted: SearchResultItem[]
    ): Promise<void> {
        if (results.length === 0) return;
        try {
            const candidates = this.storageCandidates(results);
            if (candidates.length === 0) return;
            const readable = await StorageAccessEvaluator.Instance.AccessibleAccountIDs(
                candidates.map(c => c.AccountID),
                contextUser,
                'Read',
                this.ProviderToUse
            );
            const onReadableAccounts = candidates.filter(c => readable.has(NormalizeUUID(c.AccountID)));
            const visible = await this.dropUnreadableTrackedStorageHits(onReadableAccounts, contextUser);
            permitted.push(...visible.map(c => c.Item));
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchEngine: Storage permission filtering failed — ${results.length} storage result(s) dropped: ${msg}`);
        }
    }

    /**
     * The tracked-file rule on storage hits: grouped by account, each account's hits are checked in one batched lookup
     * against the `MJ: Files` rows on that account's provider (`StorageAccessEvaluator.UnreadableTrackedObjectKeys`,
     * compared the way the account's driver addresses keys), and a hit whose path or object ID backs a row the caller
     * may not read is dropped. An account whose provider or driver cannot be resolved loses all its hits (fail closed).
     */
    private async dropUnreadableTrackedStorageHits(
        candidates: Array<{ Item: SearchResultItem; AccountID: string; ObjectKeys: string[] }>,
        contextUser: UserInfo
    ): Promise<Array<{ Item: SearchResultItem; AccountID: string; ObjectKeys: string[] }>> {
        const byAccount = new Map<string, Array<{ Item: SearchResultItem; AccountID: string; ObjectKeys: string[] }>>();
        for (const candidate of candidates) {
            const key = NormalizeUUID(candidate.AccountID);
            byAccount.set(key, [...(byAccount.get(key) ?? []), candidate]);
        }
        const kept = await Promise.all([...byAccount.values()].map(group => this.readableTrackedStorageHits(group, contextUser)));
        return kept.flat();
    }

    /** {@link dropUnreadableTrackedStorageHits} for one account's hits; any failure drops them all. */
    private async readableTrackedStorageHits(
        group: Array<{ Item: SearchResultItem; AccountID: string; ObjectKeys: string[] }>,
        contextUser: UserInfo
    ): Promise<Array<{ Item: SearchResultItem; AccountID: string; ObjectKeys: string[] }>> {
        const accountID = group[0].AccountID;
        try {
            await FileStorageEngine.Instance.Config(false, contextUser, this.ProviderToUse);
            const account = FileStorageEngine.Instance.GetAccountById(accountID);
            if (!account) {
                LogError(`SearchEngine: storage account ${accountID} is not in the storage cache — its ${group.length} hit(s) dropped`);
                return [];
            }
            const driver = await FileStorageEngine.Instance.GetDriver(account.ID, contextUser);
            const unreadable = await StorageAccessEvaluator.Instance.UnreadableTrackedObjectKeys(
                account.ProviderID, group.flatMap(c => c.ObjectKeys), contextUser, this.ProviderToUse, driver
            );
            return group.filter(c => !c.ObjectKeys.some(key => unreadable.has(key)));
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchEngine: tracked-file check failed for storage account ${accountID} — its ${group.length} hit(s) dropped: ${msg}`);
            return [];
        }
    }

    /**
     * The storage results that came from a configured {@link StorageSearchProvider} entry and name a well-formed account
     * and at least one object key, paired with them. Everything else is left out, which drops it.
     */
    private storageCandidates(results: SearchResultItem[]): Array<{ Item: SearchResultItem; AccountID: string; ObjectKeys: string[] }> {
        const storageProviderIDs = new Set(
            this._providerEntries.filter(e => e.Provider instanceof StorageSearchProvider).map(e => NormalizeUUID(e.ID))
        );
        const candidates: Array<{ Item: SearchResultItem; AccountID: string; ObjectKeys: string[] }> = [];
        for (const item of results) {
            if (!item.ProviderId || !storageProviderIDs.has(NormalizeUUID(item.ProviderId))) continue;
            const location = this.storageLocationOf(item);
            if (location) candidates.push({ Item: item, ...location });
        }
        return candidates;
    }

    /**
     * The account (`RawMetadata.accountId`) and object keys (`RawMetadata.path`, `RawMetadata.objectId`) a
     * `storage-file` result names, or null when the account is absent or malformed or no object key is present.
     */
    private storageLocationOf(item: SearchResultItem): { AccountID: string; ObjectKeys: string[] } | null {
        if (!item.RawMetadata) return null;
        try {
            type StorageMetadataValue = string | number | boolean | object | null;
            const parsed: { accountId?: StorageMetadataValue; path?: StorageMetadataValue; objectId?: StorageMetadataValue } | null =
                JSON.parse(item.RawMetadata);
            if (!parsed || typeof parsed !== 'object') return null;
            const accountId = parsed.accountId;
            const objectKeys = [parsed.path, parsed.objectId].filter((k): k is string => typeof k === 'string' && k.length > 0);
            if (typeof accountId !== 'string' || !IsValidUUID(accountId) || objectKeys.length === 0) return null;
            return { AccountID: accountId, ObjectKeys: objectKeys };
        } catch {
            return null;
        }
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
     * Permitted results are pushed into the shared `permitted` array; rows the origin-record gate removes are
     * counted into `stats` when it is supplied.
     * On any error, results are excluded (fail closed).
     */
    private async filterEntityResults(
        entityName: string,
        entityResults: SearchResultItem[],
        contextUser: UserInfo,
        permitted: SearchResultItem[],
        stats?: { OriginGateRemoved: number }
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

            // A row the user may read is not yet a row they may be shown: content derived from a record they
            // cannot read is still theirs to miss, so the admitted rows pass the origin gate next.
            const ownRows = await this.admitOwnRows(entity, entityResults, rlsClause, contextUser);
            const kept = await this.VerifyOriginRecords(entity, ownRows, contextUser);
            if (stats) stats.OriginGateRemoved += Math.max(0, ownRows.length - kept.length);
            permitted.push(...kept);
        } catch (error) {
            // Fail closed — if anything goes wrong, exclude the results
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchEngine: Permission filtering failed for entity "${entityName}": ${msg}`);
        }
    }

    /**
     * Gate 1: the results that are rows of `entity` the user may read.
     *
     * With no row filter (or a user exempt from row filtering) that settles WHICH ROWS of this entity they may
     * see — it does not establish that these results ARE this entity's rows. `EntityName` is provider output,
     * and for the vector and 3rd-party lanes it comes from the index: vector metadata's `Entity` key, or the
     * index name. Admitting on that label alone lets whoever writes the index choose which entity's
     * permissions get evaluated, so a label naming an entity the user CAN read admits documents that are not
     * that entity's records at all.
     *
     * Results that came out of a RunView against the entity need no such check, so those pass untouched (this
     * is the hot path and its cost is unchanged) and only the rest are verified — see {@link isSelfEvidentRow}
     * for which results qualify. When a row filter applies, every result is verified: ownership is checked as
     * a side effect of filtering.
     */
    private async admitOwnRows(
        entity: EntityInfo,
        entityResults: SearchResultItem[],
        rlsClause: string,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const ownRows: SearchResultItem[] = [];
        if (rlsClause) {
            await this.verifyOwnershipAndRowFilters(entity, entityResults, rlsClause, contextUser, ownRows);
            return ownRows;
        }
        const unverified: SearchResultItem[] = [];
        for (const item of entityResults) {
            (this.isSelfEvidentRow(item) ? ownRows : unverified).push(item);
        }
        if (unverified.length > 0) {
            await this.verifyOwnershipAndRowFilters(entity, unverified, undefined, contextUser, ownRows);
        }
        return ownRows;
    }

    /**
     * Whether `item` is self-evidently a row of the entity it is labelled with: the engine stamped it with a
     * configured provider that reads that entity through `RunView`
     * ({@link BaseSearchProvider.ResultsAreRowsOfLabelledEntity}), AND it carries one of the lanes in
     * {@link lanesWithSelfEvidentOwnership}.
     *
     * Trust follows the engine's stamp, never the label. `SourceType` is provider output and `SearchSource` is a
     * closed union, so every shipped external-index provider (Azure AI Search, Typesense, Elasticsearch,
     * OpenSearch) stamps `'fulltext'` with the index name as `EntityName`, and a third-party provider may stamp
     * `'entity'`. A result with no `ProviderId` (a fusion fallback, a hand-built hit) or one naming no configured
     * provider is verified, and so is a hit promoted from a content item to its origin record
     * (`PromotedFromContentItemID`): its provider read the content item, never the origin row.
     *
     * Fusion and dedup never move a `ProviderId` onto another item's `EntityName`/`RecordID`/`SourceType`: each
     * merged result is one provider's item, whole, and only scores, `ScoreBreakdown`, tags and (dedup) a snippet
     * replacing a generic one are taken from the items it absorbed. Those may be from rows nothing verified:
     * `Deduplicate` merges items sharing `EntityName` + `RecordID`, but per-scope RRF (`SearchFusion.applyRRF`)
     * merges `ScoreBreakdown` across items sharing only a `RecordID` — of any entity — keeping the first. So a
     * merge can lend a trusted item another item's scores, never its trust: trust is the surviving item's own.
     */
    private isSelfEvidentRow(item: SearchResultItem): boolean {
        if (!SearchEngine.lanesWithSelfEvidentOwnership.has(item.SourceType)) return false;
        return this.providerThatReadRow(item)?.ResultsAreRowsOfLabelledEntity === true;
    }

    /**
     * The configured provider that read the row `item` names — {@link ProviderForResult}, except for a hit the
     * engine promoted from a content item to its origin record (`PromotedFromContentItemID`), whose row no
     * provider read. Both per-provider trust decisions resolve through here: ownership
     * (`ResultsAreRowsOfLabelledEntity`, {@link isSelfEvidentRow}) and the lane `ExtraFilter` exemption
     * (`AppliesLaneExtraFilter`, {@link laneBoundFor}).
     */
    private providerThatReadRow(item: SearchResultItem): BaseSearchProvider | undefined {
        return item.PromotedFromContentItemID ? undefined : this.ProviderForResult(item);
    }

    /**
     * The configured provider whose engine-stamped `ProviderId` `item` carries, or `undefined` when it carries
     * none or names no configured provider. The engine overwrites `ProviderId` on every result a provider
     * returns, before fusion.
     *
     * Protected so a probe can map a hand-built hit to a provider instance without configuring the engine. It
     * decides which results skip ownership verification and which skip the lane `ExtraFilter` re-check, so an
     * override must only ever return the provider that actually produced the result.
     */
    protected ProviderForResult(item: SearchResultItem): BaseSearchProvider | undefined {
        if (!item.ProviderId) return undefined;
        return this._providerEntries.find(e => UUIDsEqual(e.ID, item.ProviderId))?.Provider;
    }

    /**
     * Lanes whose results can be self-evident rows of the entity they are labelled with — a necessary
     * condition only: the provider that produced the result must also say it reads that entity through
     * `RunView` (see {@link isSelfEvidentRow}). The vector lane, and anything else, is always verified.
     *
     * An allowlist rather than a denylist on purpose: a `SourceType` nobody anticipated is verified by
     * default instead of trusted by default.
     */
    private static readonly lanesWithSelfEvidentOwnership: ReadonlySet<string> =
        new Set<SearchSource>(['entity', 'fulltext']);

    /**
     * Use RunView to confirm the results really are records of `entity`, and — when a row filter is
     * supplied — that the user may see them.
     * Only results whose record IDs come back are added to `permitted`, so a result whose id is not a
     * record of this entity is dropped whether or not a row filter exists.
     */
    private async verifyOwnershipAndRowFilters(
        entity: EntityInfo,
        entityResults: SearchResultItem[],
        rlsClause: string | undefined,
        contextUser: UserInfo,
        permitted: SearchResultItem[]
    ): Promise<void> {
        const validKeys = await this.readableRecordKeys(entity, entityResults.map(r => r.RecordID), rlsClause, contextUser);
        if (!validKeys) return; // fail closed — already logged

        for (const item of entityResults) {
            const key = this.recordMatchKey(entity, item.RecordID);
            if (key !== null && validKeys.has(key)) {
                permitted.push(item);
            }
        }
    }

    /**
     * Ask the database, as `contextUser`, which of `recordIDs` are rows of `entity` the user may read:
     * `PK IN (...)`, ANDed with `rlsClause` when one applies, run through RunView so the user's own row
     * filters apply as well. Returns the matching keys in {@link canonicalKeyValues} form, or `null`
     * when the question could not be asked (no primary key, no usable record id, RunView failed) — the
     * caller fails closed.
     */
    private async readableRecordKeys(
        entity: EntityInfo,
        recordIDs: string[],
        rlsClause: string | undefined,
        contextUser: UserInfo
    ): Promise<Set<string> | null> {
        const params = this.readableKeysParams(entity, recordIDs, rlsClause);
        if (!params) return null;
        const rv = new RunView();
        return this.readableKeySet(entity, await rv.RunView<Record<string, unknown>>(params, contextUser));
    }

    /**
     * The RunView behind {@link readableRecordKeys}, projecting only the key. `null` when it cannot be asked:
     * the entity has no primary key, or no record id names a key of it (both logged).
     *
     * `MaxRows` is the number of ids, since each matches at most one row: left unset, the entity's
     * `UserViewMaxRows` could truncate the answer and silently drop readable results.
     */
    private readableKeysParams(entity: EntityInfo, recordIDs: string[], rlsClause: string | undefined): RunViewParams | null {
        const pkField = entity.FirstPrimaryKey; // first-pk-ok: presence check; Name is only used under the PrimaryKeys.length === 1 branch
        if (!pkField) {
            // Cannot verify without a primary key — exclude results
            LogError(`SearchEngine: Entity "${entity.Name}" has no primary key, cannot verify result ownership`);
            return null;
        }

        // `RecordID` is a compact CompositeKey segment: the bare value for a single-column key, a
        // "F1|v1||F2|v2" segment for a composite one. A single-column key is verified with one IN();
        // a composite key needs a (F1=.. AND F2=..) term per record — an IN() on the first column
        // alone could never match the segment, and this check fails closed, so every composite-key
        // result would have been dropped as unauthorized.
        const membership = entity.PrimaryKeys.length === 1
            ? this.buildSingleKeyMembership(entity, pkField.Name, recordIDs)
            : this.buildCompositeKeyMembership(entity, recordIDs);
        if (!membership) return null;
        // Without a row filter this is a pure existence check against the entity's own view.
        const filter = rlsClause ? `(${membership}) AND (${rlsClause})` : membership;

        return {
            EntityName: entity.Name,
            ExtraFilter: filter,
            Fields: entity.PrimaryKeys.map(pk => pk.Name),
            ResultType: 'simple',
            MaxRows: recordIDs.length
        };
    }

    /** The keys a {@link readableKeysParams} RunView returned, in {@link canonicalKeyValues} form; `null` (logged) when it failed. */
    private readableKeySet(entity: EntityInfo, result: RunViewResult<Record<string, unknown>> | undefined): Set<string> | null {
        if (!result?.Success) {
            // RunView failed — fail closed, exclude all results
            LogError(`SearchEngine: ownership/RLS RunView failed for entity "${entity.Name}": ${result?.ErrorMessage ?? 'unknown error'}`);
            return null;
        }
        return new Set(
            result.Results.map(r => this.canonicalKeyValues(entity, CompositeKey.FromEntityRecord(entity, r)))
        );
    }

    /**
     * `PK IN ('a','b',...)` — the fast path for the overwhelmingly common single-column key. Each id is
     * read as a key segment first, so a bare value and a prefixed `ID|value` segment (the encoding
     * `CompositeKey.ToRecordID()` writes) both compare on the value alone.
     */
    private buildSingleKeyMembership(entity: EntityInfo, pkFieldName: string, recordIDs: string[]): string {
        const values = recordIDs.map(id => {
            const key = CompositeKey.FromURLSegment(entity, id);
            return String(key.KeyValuePairs[0]?.Value ?? id);
        });
        const ids = values.map(v => `'${EscapeSQLString(v)}'`).join(',');
        return `${pkFieldName} IN (${ids})`;
    }

    /**
     * `(F1='v1' AND F2='v2') OR (...)` — one term per composite-key record. The field names come from the
     * record id, so only a segment {@link parseCompositeKey} accepts reaches the SQL, under the metadata's own
     * names; any other is dropped (logged). Empty when no segment is usable.
     */
    private buildCompositeKeyMembership(entity: EntityInfo, recordIDs: string[]): string {
        const terms: string[] = [];
        for (const id of recordIDs) {
            const key = this.parseCompositeKey(entity, id);
            if (key) terms.push(`(${key.ToWhereClause()})`);
            else LogError(`SearchEngine: record id "${id}" does not name the primary key of "${entity.Name}"; dropping it`);
        }
        return terms.join(' OR ');
    }

    /**
     * A composite-key segment rebuilt on `entity`'s own primary-key names, or `null` when it names a field that
     * is not a primary key of `entity` or leaves one out. Names match case-insensitively and are replaced by
     * the metadata's, so nothing parsed from a record id is interpolated into SQL as an identifier.
     */
    private parseCompositeKey(entity: EntityInfo, recordID: string): CompositeKey | null {
        const pairs = CompositeKey.FromURLSegment(entity, recordID).KeyValuePairs;
        if (pairs.length !== entity.PrimaryKeys.length) return null;
        const rebuilt: KeyValuePair[] = [];
        for (const pk of entity.PrimaryKeys) {
            const match = pairs.find(kv => kv.FieldName.trim().toLowerCase() === pk.Name.trim().toLowerCase());
            if (!match) return null;
            rebuilt.push(new KeyValuePair(pk.Name, match.Value));
        }
        return CompositeKey.FromKeyValuePairs(rebuilt);
    }

    /**
     * The {@link canonicalKeyValues} form of the key `recordID` names in `entity`, to match against the rows a
     * readability check returned. `null` for a composite-key segment {@link parseCompositeKey} rejects.
     */
    private recordMatchKey(entity: EntityInfo, recordID: string): string | null {
        if (entity.PrimaryKeys.length === 1) return this.canonicalKeyValues(entity, CompositeKey.FromURLSegment(entity, recordID));
        const key = this.parseCompositeKey(entity, recordID);
        return key ? this.canonicalKeyValues(entity, key) : null;
    }

    // ────────────────────────────────────────────────────────────────────────────────────────────
    // Origin records: a second gate for content derived from another MJ record
    // ────────────────────────────────────────────────────────────────────────────────────────────

    /**
     * Second gate, after a result is known to be a readable row of its own entity: may the user also
     * read the record the row was DERIVED from?
     *
     * Row-level security on a content entity settles who may read the content table. It cannot say
     * whether the person may read the file, task or conversation that content was extracted from —
     * that permission lives on the origin entity, under its own row filters. Without this gate, a
     * chunk of a document the user may not open passes the first gate and is quoted anyway.
     *
     * For `MJ: Content Items` and `MJ: Content Item Chunks` (and any IS-A subtype of either) the
     * default follows chunk → item (→ root item, for a split child) → `MJ: Entity Record Documents`
     * → the origin record, and keeps a result only when the origin is a row the user may read,
     * verified the way {@link verifyOwnershipAndRowFilters} verifies the result's own entity. A
     * content row with no Entity Record Document (crawled, uploaded, external) has no origin and
     * passes unchanged, as does every result of a non-content entity.
     *
     * Every lookup runs as the user, and that is a NEW requirement on who may see content hits: read on
     * the base `MJ: Content Items` for anyone who sees chunk hits (the chunk → item hop reads it), and read
     * on `MJ: Entity Record Documents` for anyone who sees hits derived from a record (the item → document
     * hop reads it). An app that indexes documents behind its own permissions grants those, under its
     * own row filters. Without them the affected rows are dropped: every row of the group for the chunk
     * and item hops, only the document-bearing rows for the document hop.
     *
     * The origin's own permissions are checked once; an origin that is itself a content row is not walked
     * again. Protected so a host can extend the rule to another derived-content family. Fails closed: a
     * lookup that reports failure, or returns a row without a column it asked for (field-level security),
     * drops the rows that depended on it; a lookup that throws drops the whole group. It never widens.
     */
    protected async VerifyOriginRecords(
        entity: EntityInfo,
        results: SearchResultItem[],
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        if (results.length === 0) return results;
        const level = this.contentFamilyLevel(entity);
        if (!level) return results;
        try {
            const origins = await this.resolveContentOrigins(entity, level, results, contextUser);
            return await this.keepReadableOrigins(entity, results, origins, contextUser);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SearchEngine: origin-record check failed for entity "${entity.Name}": ${msg}`);
            return [];
        }
    }

    /**
     * Where `entity` sits in the content family: `'chunk'` for `MJ: Content Item Chunks` or a subtype,
     * `'item'` for `MJ: Content Items` or a subtype, `null` for anything else. Walks `ParentID` on the
     * request's provider; a cycle in the metadata ends the walk rather than looping.
     */
    private contentFamilyLevel(entity: EntityInfo): ContentFamilyLevel | null {
        const provider = this.ProviderToUse;
        const visited = new Set<string>();
        let current: EntityInfo | undefined = entity;
        while (current && !visited.has(current.ID)) {
            if (current.Name === 'MJ: Content Item Chunks') return 'chunk';
            if (current.Name === 'MJ: Content Items') return 'item';
            visited.add(current.ID);
            current = current.ParentID ? provider.EntityByID(current.ParentID) : undefined;
        }
        return null;
    }

    /**
     * A content result's `RecordID` as the key value the origin lookups query and the origin map is keyed by.
     * Read as a key segment, exactly as gate 1 reads it, so a prefixed `ID|value` id resolves to its value.
     * Empty when the segment does not name the entity's key.
     */
    private contentRecordKey(entity: EntityInfo, recordID: string): string {
        // canonicalKeyValues of a single-column key is the NormalizeUUID'd value itself.
        const key = CompositeKey.FromURLSegment(entity, recordID);
        return this.canonicalKeyValues(entity, key); // first-pk-ok: the content family is single-column by design (IS-A subtypes share the base key)
    }

    /**
     * Resolve each result to its origin record. The returned map is keyed by {@link contentRecordKey}; a
     * value of `null` means "a content row with no origin" (it passes); a missing key means a link in the
     * chain could not be read as this user (it is dropped).
     *
     * Failures are scoped to the rows that depended on the failed hop. Every row depends on the chunk
     * and item hops, so a failed lookup there throws and the caller drops the group. Only split children
     * depend on the root hop, and only document-bearing items on the Entity Record Document hop, so a
     * failure there leaves just those rows unresolved and lets the rest through on their own merits.
     */
    private async resolveContentOrigins(
        entity: EntityInfo,
        level: ContentFamilyLevel,
        results: SearchResultItem[],
        contextUser: UserInfo
    ): Promise<Map<string, ContentOriginRef | null>> {
        const recordIDs = Array.from(new Set(results.map(r => this.contentRecordKey(entity, r.RecordID)))).filter(id => id !== '');
        const itemOfRecord = level === 'chunk'
            ? await this.lookupChunkItems(entity, recordIDs, contextUser)
            : new Map(recordIDs.map(id => [id, id]));
        const itemIDs = Array.from(new Set(itemOfRecord.values()));
        const erdOfItem = await this.lookupItemOrigins(itemIDs, contextUser);
        const erdIDs = Array.from(new Set(Array.from(erdOfItem.values()).filter((id): id is string => id !== null)));
        const originOfErd = await this.lookupEntityRecordDocuments(erdIDs, contextUser);

        const origins = new Map<string, ContentOriginRef | null>();
        for (const id of recordIDs) {
            const itemID = itemOfRecord.get(id);
            if (itemID === undefined) continue;             // the chunk is not a row the user can read
            const erdID = erdOfItem.get(itemID);
            if (erdID === undefined) continue;              // the item (or its root) is not a row the user can read
            if (erdID === null) { origins.set(id, null); continue; } // external content: no origin
            const origin = originOfErd.get(erdID);
            if (origin) origins.set(id, origin);            // else: the document is not readable → dropped
        }
        return origins;
    }

    /**
     * chunk id → owning Content Item id, read through the chunk entity's own view as the user. Every
     * chunk result depends on this hop, so a failed lookup throws and the group is dropped.
     */
    private async lookupChunkItems(entity: EntityInfo, chunkIDs: string[], contextUser: UserInfo): Promise<Map<string, string>> {
        const pkName = entity.FirstPrimaryKey.Name; // first-pk-ok: IS-A family shares the parent's single-column key
        const rows = await this.runLookup<Record<string, unknown>>(entity.Name, [pkName, 'ContentItemID'], pkName, chunkIDs, contextUser);
        if (!rows) throw new Error(`lookup of "${entity.Name}" failed; every result depends on it`);
        const map = new Map<string, string>();
        for (const row of rows) {
            const itemID = row['ContentItemID'];
            if (typeof row[pkName] === 'string' && typeof itemID === 'string') {
                map.set(NormalizeUUID(row[pkName]), NormalizeUUID(itemID));
            }
        }
        return map;
    }

    /**
     * Content Item id → its Entity Record Document id, `null` when it has none.
     *
     * Always read through the base `MJ: Content Items`, whatever entity the result was labelled with:
     * `RootParentID` is a view-computed column, and an IS-A subtype's view projects only its parent's
     * base columns, so reading a subtype would silently lose the root link and let a split child
     * through as "no origin". The key is shared across the family, so the base view holds every row.
     *
     * A split child is judged by its own document first and by its root's only when it has none — one more
     * hop, taken once. A failed root lookup leaves only those children unresolved (dropped); a failed item
     * lookup throws, since every row depends on it.
     */
    private async lookupItemOrigins(itemIDs: string[], contextUser: UserInfo): Promise<Map<string, string | null>> {
        const fields = ['ID', 'ParentID', 'RootParentID', 'EntityRecordDocumentID'];
        const rows = await this.runLookup<ContentItemRow>('MJ: Content Items', fields, 'ID', itemIDs, contextUser);
        if (!rows) throw new Error('lookup of "MJ: Content Items" failed; every result depends on it');

        const map = new Map<string, string | null>();
        const rootOfChild = this.classifyItemRows(rows, map);
        if (rootOfChild.size === 0) return map;

        const roots = Array.from(new Set(rootOfChild.values()));
        const rootRows = (await this.runLookup<ContentItemRow>('MJ: Content Items', fields, 'ID', roots, contextUser)) ?? [];
        const docOfRoot = new Map(rootRows.map(r => [NormalizeUUID(r.ID), r.EntityRecordDocumentID ? NormalizeUUID(r.EntityRecordDocumentID) : null]));
        for (const [child, root] of rootOfChild) {
            const doc = docOfRoot.get(root);
            if (doc !== undefined) map.set(child, doc); // an unreadable root leaves the child unresolved → dropped
        }
        return map;
    }

    /**
     * Sort item rows: an item with its own document, or a root (no `ParentID`) with none, goes straight into
     * `map`; a split child with no document of its own is returned as child → root, to be judged by its root.
     * The view gives a root its own id as `RootParentID`, so a root is never re-read. A child whose
     * `RootParentID` is missing or names itself (the view could not walk its `ParentID` chain) goes nowhere:
     * unresolved, so dropped, rather than passed as "no origin".
     */
    private classifyItemRows(rows: ContentItemRow[], map: Map<string, string | null>): Map<string, string> {
        const rootOfChild = new Map<string, string>();
        for (const row of rows) {
            const id = NormalizeUUID(row.ID);
            const root = row.RootParentID ? NormalizeUUID(row.RootParentID) : null;
            if (row.EntityRecordDocumentID) map.set(id, NormalizeUUID(row.EntityRecordDocumentID));
            else if (!row.ParentID) map.set(id, null);                 // a root with no document: no origin
            else if (root && root !== id) rootOfChild.set(id, root);   // a split child: judged by its root
            else LogError(`SearchEngine: content item ${id} has a ParentID but no resolvable root; its hits are dropped`);
        }
        return rootOfChild;
    }

    /**
     * Entity Record Document id → the (entity, record) it documents, read as the user. Only document-bearing
     * items depend on this hop, so a failed lookup resolves nothing here and drops those rows alone. A
     * document that names no entity or record resolves nothing either.
     */
    private async lookupEntityRecordDocuments(erdIDs: string[], contextUser: UserInfo): Promise<Map<string, ContentOriginRef>> {
        const map = new Map<string, ContentOriginRef>();
        if (erdIDs.length === 0) return map;
        const fields = ['ID', 'Entity', 'RecordID'];
        const rows = (await this.runLookup<EntityRecordDocumentRow>('MJ: Entity Record Documents', fields, 'ID', erdIDs, contextUser)) ?? [];
        for (const row of rows) {
            if (row.Entity && row.RecordID) map.set(NormalizeUUID(row.ID), { EntityName: row.Entity, RecordID: row.RecordID });
        }
        return map;
    }

    /**
     * One `Fields` projection of `entityName` where `keyField IN (ids)`, as the user. `null` (logged) when the
     * RunView fails, or when a row comes back without one of `fields`: field-level security drops a denied
     * column from the projection silently, and reading the absent column as null would turn "may not see the
     * link" into "has no origin" and let the hit through. The caller decides how far the failure reaches.
     * `MaxRows` is the number of ids (each matches at most one row), so `UserViewMaxRows` cannot truncate it.
     */
    private async runLookup<T extends object>(
        entityName: string,
        fields: string[],
        keyField: string,
        ids: string[],
        contextUser: UserInfo
    ): Promise<T[] | null> {
        if (ids.length === 0) return [];
        const rv = new RunView();
        const result = await rv.RunView<T>({
            EntityName: entityName,
            Fields: fields,
            ExtraFilter: `${keyField} IN (${ids.map(id => `'${EscapeSQLString(id)}'`).join(',')})`,
            ResultType: 'simple',
            MaxRows: ids.length
        }, contextUser);
        if (!result.Success) {
            LogError(`SearchEngine: origin lookup of "${entityName}" failed for user ${contextUser.ID}: ${result.ErrorMessage ?? 'unknown error'}`);
            return null;
        }
        const missing = fields.find(field => result.Results.some(row => !Object.prototype.hasOwnProperty.call(row, field)));
        if (missing) {
            LogError(`SearchEngine: origin lookup of "${entityName}" returned no "${missing}" column for user ${contextUser.ID} ` +
                '(denied by field-level security?); the rows that depend on it are dropped');
            return null;
        }
        return result.Results;
    }

    /**
     * Keep the results whose origin record the user may read. Origins are verified through
     * {@link ReadableOriginRecordIDs}: one batch, one view per origin entity.
     */
    private async keepReadableOrigins(
        entity: EntityInfo,
        results: SearchResultItem[],
        origins: Map<string, ContentOriginRef | null>,
        contextUser: UserInfo
    ): Promise<SearchResultItem[]> {
        const idsByEntity = new Map<string, Set<string>>();
        for (const origin of origins.values()) {
            if (!origin) continue;
            const ids = idsByEntity.get(origin.EntityName) ?? new Set<string>();
            ids.add(origin.RecordID);
            idsByEntity.set(origin.EntityName, ids);
        }
        const readable = await this.ReadableOriginRecordIDs(
            new Map(Array.from(idsByEntity, ([entityName, ids]) => [entityName, Array.from(ids)])),
            contextUser
        );

        return results.filter(r => {
            const origin = origins.get(this.contentRecordKey(entity, r.RecordID));
            if (origin === undefined) return false;
            if (origin === null) return true;
            return readable.get(origin.EntityName)?.has(origin.RecordID) ?? false;
        });
    }

    /**
     * For each origin entity, those of its record ids the user may read under that entity's own permissions and
     * row filters — the check {@link verifyOwnershipAndRowFilters} gives a result's own entity. All entities are
     * asked in one `RunViews` batch. An entity the provider does not know, the user may not read at all, or
     * whose view fails gets no entry, so only the rows derived from it are dropped.
     *
     * Protected so a host extending {@link VerifyOriginRecords} to another derived-content family can reuse it.
     *
     * @param idsByEntity origin entity name → record ids, each a bare key value or a key segment
     * @returns origin entity name → the ids (as given) of the rows the user may read
     */
    protected async ReadableOriginRecordIDs(
        idsByEntity: Map<string, string[]>,
        contextUser: UserInfo
    ): Promise<Map<string, Set<string>>> {
        const readable = new Map<string, Set<string>>();
        const checks = this.originReadChecks(idsByEntity, contextUser);
        if (checks.length === 0) return readable;
        const rv = new RunView();
        const results = await rv.RunViews<Record<string, unknown>>(checks.map(c => c.Params), contextUser);
        checks.forEach((check, i) => {
            const keys = this.readableKeySet(check.Entity, results[i]);
            if (!keys) return; // logged; only the rows derived from this entity are dropped
            readable.set(check.EntityName, new Set(check.RecordIDs.filter(id => {
                const key = this.recordMatchKey(check.Entity, id);
                return key !== null && keys.has(key);
            })));
        });
        return readable;
    }

    /** The readability view for each origin entity the user may read at all. The rest get none: not readable. */
    private originReadChecks(idsByEntity: Map<string, string[]>, contextUser: UserInfo): OriginReadCheck[] {
        const checks: OriginReadCheck[] = [];
        for (const [entityName, recordIDs] of idsByEntity) {
            let entity: EntityInfo | undefined;
            try {
                entity = this.ProviderToUse.EntityByName(entityName);
            } catch {
                entity = undefined;
            }
            if (!entity) {
                LogError(`SearchEngine: origin entity "${entityName}" is not in metadata; the hits derived from it are dropped`);
                continue;
            }
            if (!entity.GetUserPermisions(contextUser)?.CanRead) continue;
            const rlsClause = entity.GetEffectiveRowFilterWhereClause(contextUser, EntityPermissionType.Read, '') || undefined;
            const params = this.readableKeysParams(entity, recordIDs, rlsClause);
            if (params) checks.push({ EntityName: entityName, Entity: entity, RecordIDs: recordIDs, Params: params });
        }
        return checks;
    }

    /**
     * Key values in primary-key metadata order, UUID-normalized and joined — the comparison form for
     * matching a result's RecordID against the rows the database returned. Field-name lookup is
     * case-insensitive and values are normalized so a segment written by an external index (lowercase
     * UUIDs, differently-cased column names) still matches. For a single-column key this is exactly
     * `NormalizeUUID(value)`.
     */
    private canonicalKeyValues(entity: EntityInfo, key: CompositeKey): string {
        return entity.PrimaryKeys
            .map(pk => {
                const match = key.KeyValuePairs.find(kv => kv.FieldName.trim().toLowerCase() === pk.Name.trim().toLowerCase());
                return NormalizeUUID(String(match?.Value ?? ''));
            })
            .join('||');
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
