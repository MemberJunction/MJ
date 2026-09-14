/**
 * @fileoverview Public types for the MemberJunction web search engine.
 *
 * Web search is deliberately a **separate concern** from `@memberjunction/search-engine`.
 * That engine searches content MJ owns — entity records, vectors, full-text indexes, storage
 * files — and its `SearchResultItem` requires `EntityName` and `RecordID`, the primary key of a
 * source record. A web result has a URL and none of those. Fitting one in would mean lying in
 * the type and dragging the hit through enrichment built to decorate entity records.
 *
 * What the two DO share is the plugin *pattern*: a provider table carrying `DriverClass`,
 * `Priority`, `Status` and `CredentialID`; ClassFactory resolution; and the
 * `Initialize()` → `CheckAvailability()` → `IsAvailable()` lifecycle.
 *
 * @module @memberjunction/web-search-engine
 */

/**
 * One result from a web search provider, normalised across vendors.
 *
 * The first three fields are the contract every provider must satisfy, and they are
 * deliberately the same shape the retiring `Google Custom Search` action returns — which is
 * what makes migrating off it a rename rather than a rewrite.
 */
export interface WebSearchHit {
    /** Page title as the provider reports it. */
    Title: string;
    /** Absolute URL of the result. */
    URL: string;
    /** Snippet or extracted content. Length and style vary by provider. */
    Snippet: string;
    /** Host as the provider displays it, e.g. `irs.gov`. Absent when the provider omits it. */
    DisplayURL?: string;
    /** Publication or last-modified date, when the provider resolved one. */
    PublishedAt?: Date;
    /**
     * The provider's own relevance score for this hit.
     *
     * **Provider-relative and not comparable across providers** — Brave, Tavily and Perplexity
     * each compute it differently and none is a calibrated probability. Use it to order hits
     * within one response; never threshold on it, and never compare it between providers.
     */
    Score?: number;
    /**
     * Provider-specific extras that do not fit the normalised shape — Brave's extra snippets,
     * Tavily's raw page content, Perplexity's last-updated stamp.
     *
     * This exists so normalisation does not become a lowest-common-denominator: a caller that
     * knows which provider answered (via {@link WebSearchResult.ProviderUsed}) can reach for
     * what makes that provider worth having.
     */
    ProviderExtras?: Record<string, unknown>;
}

/** Relative freshness windows every provider can express in some form. */
export type WebSearchFreshnessWindow = 'day' | 'week' | 'month' | 'year';

/** An absolute date range. Providers that cannot express one fall back to their nearest window. */
export interface WebSearchDateRange {
    From: Date;
    To: Date;
}

export type WebSearchFreshness = WebSearchFreshnessWindow | WebSearchDateRange;

/** Adult-content filtering level. */
export type WebSearchSafeSearch = 'off' | 'moderate' | 'strict';

/**
 * What a driver can do. Declared on the **class**, not stored in the database.
 *
 * Capability is a property of the driver implementation; the database row holds *configuration*
 * — on/off, order, credentials, limits. This mirrors how `search-engine` declares `SourceType`
 * on `BaseSearchProvider` rather than in the `SearchProvider` table.
 */
export interface WebSearchCapabilities {
    /** Can return a synthesized answer alongside hits (Tavily, Perplexity — not Brave). */
    Answer: boolean;
    /** Honours `IncludeDomains` / `ExcludeDomains`. */
    DomainFilter: boolean;
    /** Honours `Freshness`. */
    Freshness: boolean;
    /** Honours `Country` / `Language`. */
    Region: boolean;
    /** The vendor's hard cap on results per request. Requests above it are clamped, not rejected. */
    MaxResultsCap: number;
}

/** Parameters for a web search. Only `Query` is required. */
export interface WebSearchParams {
    /** The search query. Required, non-empty. */
    Query: string;
    /** Desired result count. Clamped to the serving provider's cap. Default 10. */
    MaxResults?: number;
    /**
     * Pin the search to one provider, by `Name` (case-insensitive) or `DriverClass`.
     *
     * **When set, there is no failover.** If the named provider is missing, inactive,
     * unavailable or incapable of what was asked, the call fails with a specific result code.
     * A silent substitution is how you discover in production that a "semantic research"
     * search has been served by a keyword engine for a month.
     */
    Provider?: string;
    /** Restrict results to these domains, where the provider supports it. */
    IncludeDomains?: string[];
    /** Exclude these domains, where the provider supports it. */
    ExcludeDomains?: string[];
    /** Restrict by recency. */
    Freshness?: WebSearchFreshness;
    /** Two-letter country code for localisation, e.g. `US`, `GB`. */
    Country?: string;
    /** Language code for results, e.g. `en`. */
    Language?: string;
    /** Adult-content filter. Default `moderate`. */
    SafeSearch?: WebSearchSafeSearch;
    /**
     * Ask for a synthesized answer as well as hits.
     *
     * Restricts selection to providers whose {@link WebSearchCapabilities.Answer} is true — so
     * it changes *which* provider serves the request, not just what comes back.
     */
    IncludeAnswer?: boolean;
}

/** Outcome codes. `SUCCESS` is the only one where {@link WebSearchResult.Success} is true. */
export type WebSearchResultCode =
    | 'SUCCESS'
    /** `Query` was missing or blank. */
    | 'MISSING_QUERY'
    /** No web search providers exist in metadata at all — a setup problem, not a search failure. */
    | 'NO_PROVIDERS_CONFIGURED'
    /** Providers exist, but none is Active, available and capable of this request. */
    | 'NO_ELIGIBLE_PROVIDER'
    /** An explicit `Provider` was named and no such provider exists in metadata. */
    | 'PROVIDER_NOT_FOUND'
    /** The named provider exists but its `Status` is not `Active`. */
    | 'PROVIDER_NOT_ACTIVE'
    /** The named provider is Active but not operational — usually a missing credential. */
    | 'PROVIDER_UNAVAILABLE'
    /** The named provider cannot do what was asked, e.g. `IncludeAnswer` on a hits-only provider. */
    | 'PROVIDER_LACKS_CAPABILITY'
    /** Every eligible provider was tried and each failed. See `Attempts`. */
    | 'ALL_PROVIDERS_FAILED'
    /** The request itself was rejected and retrying elsewhere cannot help. */
    | 'INVALID_REQUEST';

/**
 * Why a provider call failed, which decides whether the engine tries the next provider.
 *
 * - `transient` — rate limit, 5xx, timeout, network. Another provider may well succeed.
 * - `permanent` — the *request* is the problem (query too long, malformed parameters). Every
 *   other provider will reject it too, so the engine stops rather than burning paid calls on
 *   a request that cannot succeed and burying the real error behind N identical failures.
 */
export type WebSearchFailureKind = 'transient' | 'permanent';

/** One provider's turn, recorded whether it succeeded or not. */
export interface WebSearchAttempt {
    /** The provider's `Name` from metadata. */
    ProviderName: string;
    /** The provider's `DriverClass`. */
    DriverClass: string;
    Succeeded: boolean;
    /** Wall-clock duration of the provider call. */
    DurationMs: number;
    /** How many hits it returned. Zero is a legitimate answer, not a failure. */
    HitCount?: number;
    FailureKind?: WebSearchFailureKind;
    ErrorMessage?: string;
}

/** The result of {@link WebSearchEngine.Search}. */
export interface WebSearchResult {
    Success: boolean;
    ResultCode: WebSearchResultCode;
    /** Normalised hits. Empty on failure, and legitimately empty on a narrow query. */
    Hits: WebSearchHit[];
    /** Synthesized answer, only when `IncludeAnswer` was requested and the provider produced one. */
    Answer?: string;
    /** `Name` of the provider that actually served the result. Always set when `Success`. */
    ProviderUsed?: string;
    /**
     * Every provider tried, in order.
     *
     * **Populated on the success path too**, deliberately. If the primary provider rate-limits
     * every call and the secondary quietly serves everything, the system looks healthy while
     * the bill moves to a vendor nobody chose. This is what makes that visible.
     */
    Attempts: WebSearchAttempt[];
    ErrorMessage?: string;
}

/** Configuration handed to a driver during {@link BaseWebSearchProvider.Initialize}. */
export interface WebSearchProviderConfig {
    /** The provider's `Name` from its metadata record. */
    Name: string;
    /** Parsed `ProviderConfig` JSON, or null when the column was empty or unparseable. */
    ProviderConfig: Record<string, unknown> | null;
    /** Decrypted credential values, when the record carried a `CredentialID`. */
    CredentialValues: Record<string, unknown> | null;
    /** Per-provider result cap from metadata, or null to use the driver's own cap. */
    MaxResultsOverride: number | null;
    /** Ordering value from metadata; lower is higher priority. */
    Priority: number;
}

/** What a driver returns from {@link BaseWebSearchProvider.ExecuteSearch}. */
export interface WebSearchProviderResponse {
    Success: boolean;
    Hits: WebSearchHit[];
    Answer?: string;
    /** Required when `Success` is false — decides failover. */
    FailureKind?: WebSearchFailureKind;
    ErrorMessage?: string;
}

/** Catalog entry for a registered driver, for admin UI population. */
export interface RegisteredWebSearchProviderInfo {
    /** ClassFactory registration key — the `WebSearchProvider.DriverClass` column value. */
    DriverClass: string;
    Capabilities: WebSearchCapabilities;
}
