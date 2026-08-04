/**
 * @fileoverview Core type definitions for the SearchEngine package.
 *
 * Defines request/response types, filters, and result structures used
 * throughout the search engine for vector, full-text, and entity search
 * with Reciprocal Rank Fusion.
 *
 * @module @memberjunction/search-engine
 */

/**
 * Source types that can contribute to search results.
 */
export type SearchSource = 'vector' | 'fulltext' | 'entity' | 'storage';

/**
 * Discriminator for how a search result should be rendered in the UI.
 * - 'entity-record': A record from an MJ entity (navigable via EntityRecord viewer)
 * - 'storage-file': A file from a file storage provider (open externally)
 * - 'content-item': A content item (articles, web pages, etc.)
 */
export type SearchResultType = 'entity-record' | 'storage-file' | 'content-item';

/**
 * Search modes that control the level of enrichment applied to results.
 * - 'full': Apply all enrichment (icons, record names, tags)
 * - 'preview': Skip enrichment for faster results (e.g., autocomplete)
 */
export type SearchMode = 'full' | 'preview';

/**
 * Per-source score breakdown for a search result.
 */
export interface SearchScoreBreakdown {
    /** Score from vector similarity search */
    Vector?: number;
    /** Score from full-text search */
    FullText?: number;
    /** Score from entity LIKE-based search */
    Entity?: number;
    /** Score from file storage search */
    Storage?: number;
    /**
     * Re-rank score from the optional re-ranker stage (post-RRF, pre-dedup).
     * When present, the top-level `Score` has been replaced by this value.
     */
    ReRank?: number;
}

/**
 * Filters that can be applied to narrow search results.
 */
export interface SearchFilters {
    /** Restrict to specific entity names */
    EntityNames?: string[];
    /** Restrict to specific source types (vector metadata filter) */
    SourceTypes?: string[];
    /** Require specific tags */
    Tags?: string[];
}

/**
 * Parameters for executing a search.
 */
export interface SearchParams {
    /** The search query text */
    Query: string;
    /** Maximum number of results to return (default: 20) */
    MaxResults?: number;
    /** Optional filters to narrow results */
    Filters?: SearchFilters;
    /** Minimum score threshold (0-1). Results below this are excluded after RRF fusion. */
    MinScore?: number;
    /** Search mode: 'full' applies enrichment, 'preview' skips it for speed */
    Mode?: SearchMode;
    /**
     * Optional array of `MJ: Search Scopes` record IDs. When provided, the engine resolves
     * each scope's metadata (providers, external indexes, entities, storage accounts) and
     * runs only those constrained providers. Results from multiple scopes are combined via
     * cross-scope RRF fusion. When omitted/empty, behaves as if the Global scope was used
     * (backward compatible). A single scope marked `IsGlobal=true` is also treated as no
     * filter.
     */
    ScopeIDs?: string[];
    /**
     * Optional multi-tenant runtime context. Interpolated into each scope's Nunjucks-rendered
     * MetadataFilter, ExtraFilter, UserSearchString, and FolderPath values so the same scope
     * definition can serve many tenants. See Section 9 of plans/search-scopes-rag-plus.md.
     */
    SearchContext?: SearchContext;
    /**
     * Optional per-agent fusion weight override. When set, the engine applies these weights
     * during cross-scope RRF fusion and honors them per-provider when weighting
     * within-scope lists. Resolution order: this > SearchScope.ScopeConfig.fusionWeights >
     * engine defaults. Example: `{ vector: 2.0, fulltext: 1.0, entity: 1.0, storage: 1.0 }`.
     */
    FusionWeightsOverride?: FusionWeightsByProvider;
    /**
     * Optional per-provider `topK` overfetch multiplier. Compensates for residual late
     * permission filtering by requesting more candidates from each provider than the caller
     * strictly wants. The final result count is still bounded by `MaxResults`. Default: 2.
     */
    PermissionOverfetchFactor?: number;
    /**
     * Optional ID of the AIAgent on whose behalf this search runs. When set, the engine
     * stamps it onto the SearchExecutionLog row so analytics can attribute usage back to
     * the calling agent. Pass-through only — permission resolution does its own agent
     * lookup separately via the resolver caller.
     */
    AIAgentID?: string | null;
    /**
     * Optional ID of the AI Skill active for this search. Stamped onto the SearchExecutionLog
     * row alongside `AIAgentID`.
     *
     * A skill is a search principal in its own right — activating one can reach a scope the
     * user's own roles do not grant — so a log that records only the agent cannot reconstruct
     * why a scope was reachable. Pass-through only: the engine does not resolve entitlement
     * itself, the caller that selects scopes does.
     */
    AISkillID?: string | null;
}

/**
 * Runtime multi-tenant context that flows through every provider so a single
 * `SearchScope` definition can serve many tenants without per-tenant scope clones.
 *
 * Fields are injected into each scope's Nunjucks-rendered values as:
 * - `{{ context.PrimaryScopeRecordID }}`
 * - `{{ context.SecondaryScopes.<dimensionName> }}`
 *
 * Type-aligned with the agent memory system's `SecondaryScopeConfig` / `SecondaryScopeValue`
 * in `@memberjunction/ai-core-plus` — the same `ExecuteAgentParams.primaryScopeRecordId` +
 * `secondaryScopes` flow through notes, pre-execution RAG, and scoped search without any
 * translation.
 */
export interface SearchContext {
    /** Entity type that represents the tenant (e.g., Organization, Company). Optional — descriptive only. */
    PrimaryScopeEntityID?: string;
    /** Specific tenant record ID. NULL = no tenant filtering. */
    PrimaryScopeRecordID?: string;
    /** Additional dimensional scoping (e.g., `{ DepartmentID: 'support', ContactID: '...' }`). */
    SecondaryScopes?: Record<string, SecondaryScopeValue>;
}

/**
 * One dimensional scope value. Mirrors the canonical type from `@memberjunction/ai-core-plus`
 * (`SecondaryScopeValue = string | number | boolean | string[]`) so the same
 * `ExecuteAgentParams.secondaryScopes` value flows through notes, pre-execution RAG, and
 * scoped search with zero translation. Re-declared here rather than imported to avoid a
 * reverse dependency (search-engine → ai-core-plus).
 *
 * Per-dimension inheritance mode (strict vs. cascading) lives on the scope's
 * `SearchContextConfig.dimensions[].inheritanceMode`, not on the runtime value.
 */
export type SecondaryScopeValue = string | number | boolean | string[];

// ─────────────────────────────────────────────────────────────────────────────
// Dimension DECLARATION — the shape stored in `SearchScope.SearchContextConfig`.
//
// The column has existed since the Search Scopes schema shipped and documents
// `dimensions[] / inheritanceMode / strictValidation`, but nothing read it: dimensions
// arrived as a free-form bag that any caller — including an LLM writing a tool call — could
// author. These types make the declaration enforceable, so a dimension can be an access
// bound rather than a narrowing convenience.
//
// Declared here rather than imported from `ai-core-plus` for the same reason
// `SecondaryScopeValue` is (see above): search-engine must not take a reverse dependency.
// ─────────────────────────────────────────────────────────────────────────────

/** Who may author a dimension's value at run time. */
export type ScopeDimensionTrust =
    /** Accepted from the caller, then grammar-validated. Narrowing only. Default. */
    | 'CallerSupplied'
    /** Derived by the engine. Caller-supplied values for this key are DISCARDED. */
    | 'ServerDerived';

/** Value grammar. The engine REJECTS a value that fails its declared grammar. */
export type ScopeDimensionValueType =
    | 'uuid' | 'uuid[]' | 'enum' | 'int' | 'iso-date' | 'bool' | 'freetext';

/** Lattice used when a caller may only NARROW a server-derived dimension. */
export type ScopeDimensionValueDomain = 'scalar' | 'set' | 'opaque';

/** One declared dimension of a scope's Search Context. */
export interface ScopeSecondaryDimension {
    /** Key as it appears in `SearchContext.SecondaryScopes`. */
    name: string;
    /**
     * True when this dimension participates in the ACCESS BOUND. Acts as a profile:
     * implies `trust: 'ServerDerived'`, fail-closed resolution, and forbids `freetext`.
     */
    restricts?: boolean;
    trust?: ScopeDimensionTrust;
    valueType?: ScopeDimensionValueType;
    /** Required when `valueType === 'enum'`. */
    enumValues?: string[];
    valueDomain?: ScopeDimensionValueDomain;
    /**
     * `MJ: Queries` row that derives this dimension's value. Run as the acting user, so its
     * `MJ: Query Permissions` gate the derivation. Bound parameters: PrimaryScopeRecordID,
     * UserID, AgentID.
     */
    expansionQueryID?: string;
    /** Names a ServerDerived dimension this one may only narrow (never widen). */
    narrowingOf?: string;
    required?: boolean;
    defaultValue?: SecondaryScopeValue | null;
    /**
     * Required acknowledgment when a RESTRICTING dimension declares `inheritanceMode: 'cascading'`.
     *
     * `cascading` means "content that lacks this dimension applies to everyone" — permissive, and
     * therefore the wrong posture for a boundary. It is occasionally what an author genuinely wants
     * (untagged legacy content that should stay visible while it is being backfilled), so it is not
     * forbidden — but it must be deliberate rather than a default someone inherited, and it must be
     * greppable. Setting this to true is that acknowledgment; without it the scope refuses to load.
     */
    acknowledgeCascadingOnBoundary?: boolean;
    /**
     * Marks this dimension as **advisory** (§5.12 supersession): it may only ever cause content to
     * be REMOVED from an already-entitled set, never added.
     *
     * The consequence is a deliberately inverted failure posture. A boundary fails CLOSED — if it
     * cannot be resolved the search is refused. An advisory dimension fails **SOFT** — if it cannot
     * be resolved it is simply dropped and the search proceeds, because the worst case is that a
     * superseded corpus stays in the results. Getting a boundary wrong leaks data; getting this
     * wrong makes relevance worse.
     *
     * `advisory` and `restricts` are mutually exclusive; declaring both is a contradiction and is
     * rejected at load.
     */
    advisory?: boolean;
    /**
     * Ordered supersession rules — **first match wins**. Only meaningful on an `advisory` dimension.
     *
     * This is where "invoking skill A+B adds C and removes B" lives. The ordered logic derives a
     * KEY from whichever dimension combination is active; the scope's filter then excludes whatever
     * that key maps to, via a guarded `AND NOT EXISTS (…)` clause. The rules stay data rather than
     * code, and because the clause can only subtract from an already-bounded set, a wrong rule
     * degrades relevance instead of granting access — which is exactly why this needs none of the
     * grammar, positive-assertion or fail-closed machinery a boundary requires.
     */
    supersededByRules?: ScopeSupersessionRule[];
    inheritanceMode?: 'cascading' | 'strict';
    description?: string;
}

/**
 * One ordered supersession rule (§5.12).
 *
 * Fires when EVERY entry in `when` matches the already-resolved dimensions; publishes `key`.
 * Matching is deliberately forgiving in one direction: a resolved value that is an ARRAY matches when
 * it *contains* the expected value, so "the Exam Writer skill is among the active skills" is
 * expressible without the author having to know whether the dimension is scalar or set. String
 * comparison is case-insensitive because UUID casing is not consistent anywhere in MJ, and a rule
 * that silently never fires because of letter case would be near-impossible to debug.
 */
export interface ScopeSupersessionRule {
    /** Dimension name → value that must match. All entries must match for the rule to fire. */
    when: Record<string, SecondaryScopeValue>;
    /** The supersession key published when this rule fires. */
    key: string;
    /** Optional human-readable reason, surfaced in provenance so the decision explains itself. */
    because?: string;
}

/** Parsed `SearchScope.SearchContextConfig`. A null/absent config leaves behavior unchanged. */
export interface ScopeSearchContextConfig {
    dimensions: ScopeSecondaryDimension[];
    defaultInheritanceMode?: 'cascading' | 'strict';
    allowSecondaryOnly?: boolean;
    /** When true, a caller key that is not declared REJECTS the search. */
    strictValidation?: boolean;
}

/**
 * Where a resolved dimension's value actually came from.
 *
 * This is the audit answer to "who decided this?", and it is the difference between a bound
 * that carries an access decision and one that merely looks like it does. `CallerSupplied`
 * means an outside party — possibly an LLM writing a tool call — chose the value; that is
 * fine for a search refinement and unacceptable for an access bound. `ServerDerived` means
 * the engine computed it and no caller could influence it. `DiscardedCaller` records an
 * attempt that was thrown away, which is exactly the event a security review wants to find.
 */
export type DimensionProvenance =
    /** Caller supplied it, the dimension trusts callers, and it passed grammar validation. */
    | 'CallerSupplied'
    /** The engine derived it (an approved expansion query); no caller input was used. */
    | 'ServerDerived'
    /** Nobody supplied it; the declaration's `defaultValue` filled in. */
    | 'Default'
    /** The caller supplied a value for a ServerDerived dimension and it was thrown away. */
    | 'DiscardedCaller'
    /** The caller narrowed within a server-derived bound and the meet survived. */
    | 'Narrowed'
    /** Declared but unresolved — not supplied, not derivable, not required. */
    | 'Absent'
    /** Produced by an ordered advisory rule (§5.12 supersession) rather than by a caller or a query. */
    | 'RuleDerived';

/**
 * Principals a dimension's expansion query may bind.
 *
 * Declared once and shared so the real search path and the `ExplainScope` dry run cannot drift:
 * a preview computed from different principals than the search would use is worse than no
 * preview, because it is confidently wrong.
 */
export interface ScopePrincipals {
    AgentID?: string | null;
    SkillID?: string | null;
}

/** One dimension's resolved value together with the provenance that makes it auditable. */
export interface DimensionExplanation {
    Name: string;
    /** The resolved value, or null when the dimension came out `Absent`. */
    Value: SecondaryScopeValue | null;
    Provenance: DimensionProvenance;
    /** True when this dimension narrows what the search may reach (an access bound). */
    Restricts: boolean;
    /**
     * The inheritance mode actually ENFORCED, after defaulting. A restricting dimension with no
     * explicit mode resolves to `strict`; a non-restricting one to `cascading`.
     */
    InheritanceMode?: 'cascading' | 'strict';
    /** Extra human-readable detail — what was discarded, which query derived it, and so on. */
    Note?: string;
}

/**
 * Per-provider fusion weights. Keys are the `SearchSource` values.
 * Weights > 1 amplify a provider's contribution; weights < 1 dampen it.
 */
export interface FusionWeightsByProvider {
    vector?: number;
    fulltext?: number;
    entity?: number;
    storage?: number;
    /** Catch-all for 3rd-party / custom providers keyed by `SourceType` string. */
    [key: string]: number | undefined;
}

/**
 * Constraints assembled from one or more `SearchScope` records and handed to each provider
 * so the provider can narrow its retrieval to the scoped surface and apply native
 * permission / metadata push-down.
 *
 * Providers that receive `scopeConstraints` MUST implement permission push-down
 * (see Section 3.6 of plans/search-scopes-rag-plus.md) — no result the calling user cannot
 * see should ever enter RRF/re-rank.
 */
export interface ScopeConstraints {
    /**
     * For vector and 3rd-party index providers (Elasticsearch, Typesense, AzureAISearch,
     * OpenSearch): only query these external indexes. Each entry carries its IndexType,
     * native identifier, rendered MetadataFilter, and any ExternalIndexConfig.
     */
    ExternalIndexes?: ScopeExternalIndexConstraint[];
    /** For `EntitySearchProvider` / `FullTextSearchProvider`: only search these entities. */
    Entities?: ScopeEntityConstraint[];
    /** For `StorageSearchProvider`: only search these accounts/folders. */
    StorageAccounts?: ScopeStorageConstraint[];
    /** Multi-tenant runtime context — filters results to a specific tenant/dimension. */
    Context?: SearchContext;
    /**
     * Optional per-provider query rewrites. Map key is the provider's `DriverClass` or
     * `SourceType`. Provider uses this in place of the raw query when present.
     */
    QueryTransforms?: Record<string, string>;
    /**
     * Advanced scope config passed through verbatim. Providers may inspect this for
     * provider-specific knobs (e.g., vector namespace, route key).
     */
    ScopeConfig?: Record<string, unknown>;
}

/**
 * One external-index row for a scope, post-template-rendering.
 */
export interface ScopeExternalIndexConstraint {
    /** 'Vector' | 'Elasticsearch' | 'Typesense' | 'AzureAISearch' | 'OpenSearch' | 'Other' */
    IndexType: string;
    /** Required when `IndexType='Vector'`. The MJ `VectorIndex.ID` to target. */
    VectorIndexID?: string;
    /** Required when `IndexType != 'Vector'`. The engine-native index/collection/alias name. */
    ExternalIndexName?: string;
    /**
     * Rendered (post-Nunjucks, post-SearchContext-interpolation) native metadata filter.
     * Pinecone/Qdrant/PGVector filter object, or Elasticsearch filter DSL, etc. Provider
     * interprets. Parsed JSON object when the source was JSON; otherwise the raw rendered
     * string.
     */
    MetadataFilter?: unknown;
    /** Any extra provider-interpreted config (cluster alias, routing key). */
    ExternalIndexConfig?: unknown;
    /** ID of the originating `MJ: Search Scope External Indexes` row (for observability). */
    SearchScopeExternalIndexID?: string;
}

/**
 * One scoped entity, post-template-rendering.
 */
export interface ScopeEntityConstraint {
    EntityID: string;
    EntityName: string;
    /** Rendered SQL WHERE fragment (Nunjucks templating already applied). */
    ExtraFilter?: string;
    /** Rendered override for RunView's `UserSearchString` (Nunjucks templating already applied). */
    UserSearchString?: string;
    /** ID of the originating `MJ: Search Scope Entities` row (for observability). */
    SearchScopeEntityID?: string;
}

/**
 * One scoped storage account/folder, post-template-rendering.
 */
export interface ScopeStorageConstraint {
    FileStorageAccountID: string;
    /** Rendered folder path (Nunjucks templating already applied). */
    FolderPath?: string;
    /** ID of the originating `MJ: Search Scope Storage Accounts` row (for observability). */
    SearchScopeStorageAccountID?: string;
}

/**
 * A single search result with provenance and scoring information.
 */
export interface SearchResultItem {
    /** Primary key of the source record (same as RecordID) */
    ID: string;
    /** The entity this result came from */
    EntityName: string;
    /** The source record ID */
    RecordID: string;
    /** How the content was sourced: 'vector', 'fulltext', 'entity', or 'fused' */
    SourceType: string;
    /** Display title for the result */
    Title: string;
    /** Text snippet showing the relevant content */
    Snippet: string;
    /** Fused relevance score (higher is more relevant) */
    Score: number;
    /** Per-source score breakdown */
    ScoreBreakdown: SearchScoreBreakdown;
    /** Tags associated with this result */
    Tags: string[];
    /** Font Awesome icon class for the entity */
    EntityIcon?: string;
    /** Resolved display name for the record */
    RecordName?: string;
    /** When this result was matched */
    MatchedAt: Date;
    /** Raw vector metadata as JSON string (contains all entity fields stored in vector DB) */
    RawMetadata?: string;
    /** Discriminator for UI rendering: entity-record, storage-file, or content-item */
    ResultType: SearchResultType;
    /** ID of the SearchProvider metadata record that produced this result */
    ProviderId?: string;
    /** Display label from the SearchProvider metadata (e.g., "Database", "Semantic Search") */
    ProviderLabel?: string;
    /** Font Awesome icon class from the SearchProvider metadata (e.g., "fa-solid fa-brain") */
    ProviderIcon?: string;
}

/**
 * Discriminated union emitted by `SearchEngine.streamSearch()` as each
 * pipeline stage produces output. Consumers should treat unknown phases
 * as no-ops to remain forward-compatible with future stages (e.g. a
 * 'permission-filtered' phase added later).
 */
export type SearchStreamEvent =
    | {
        phase: 'provider';
        /** Friendly provider name that just returned (Vector / FullText / Entity / Storage / external). */
        providerName: string;
        /** This provider's contribution before fusion. */
        results: SearchResultItem[];
        /** Provider wall-clock duration in ms. */
        durationMs: number;
    }
    | {
        phase: 'fused';
        /** RRF-fused list across providers (and across scopes when applicable). */
        results: SearchResultItem[];
    }
    | {
        phase: 'reranked';
        /** Reranker-permuted list. Same items as 'fused', new order. */
        results: SearchResultItem[];
        /** Reranker class name (Cohere / Voyage / BGE / Noop / etc.) */
        rerankerName: string;
    }
    | {
        phase: 'final';
        /** Post-deduplication, post-permission, post-enrich result set — what Search() would have returned. */
        results: SearchResultItem[];
        /** Same shape as the synchronous SearchResult.SourceCounts. */
        sourceCounts: { Vector: number; FullText: number; Entity: number; Storage: number };
        /** Total wall-clock duration of the stream. */
        elapsedMs: number;
    }
    | {
        phase: 'error';
        /** Provider that failed, if scoped to one. */
        providerName?: string;
        /** Human-readable error message (do NOT include stack traces). */
        error: string;
    };

/**
 * Aggregate result from the search engine.
 */
export interface SearchResult {
    /** Whether the search completed successfully */
    Success: boolean;
    /** The ranked search results */
    Results: SearchResultItem[];
    /** Total number of results returned */
    TotalCount: number;
    /** Total search execution time in milliseconds */
    ElapsedMs: number;
    /** Count of results contributed by each source before fusion */
    SourceCounts: {
        Vector: number;
        FullText: number;
        Entity: number;
        Storage: number;
    };
    /** Metadata for all active search providers (for UI filter facets and labels) */
    Providers: SearchProviderInfo[];
    /** Error message if Success is false */
    ErrorMessage?: string;
}

/**
 * Metadata about an active search provider, sent to the client for UI rendering.
 */
export interface SearchProviderInfo {
    /** SearchProvider record ID */
    ID: string;
    /** Provider name from metadata */
    Name: string;
    /** UI display label (falls back to Name if null) */
    DisplayName: string;
    /** Font Awesome icon class */
    Icon: string;
    /** The SourceType key this provider uses */
    SourceType: string;
    /** Priority (lower = higher) */
    Priority: number;
}

/**
 * A scored candidate used for RRF fusion input/output.
 * Re-exported from @memberjunction/core for convenience.
 */
export type { ScoredCandidate } from '@memberjunction/core';
