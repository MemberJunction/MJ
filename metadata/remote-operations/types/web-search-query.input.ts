/**
 * Input for `WebSearch.Query`.
 *
 * NO import statements — this definition is emitted verbatim into the generated
 * remote_operations.ts and any import here would break that file.
 */
export interface WebSearchQueryInput {
    /** The search query. Required, non-empty. */
    query: string;
    /** Desired result count. Clamped to the serving provider's cap. Default 10. */
    maxResults?: number;
    /**
     * Pin the search to one provider, by Name (e.g. `Brave`) or DriverClass.
     *
     * When set there is NO failover: if that provider is missing, inactive, unavailable or
     * incapable of what was asked, the call fails rather than quietly serving from another
     * vendor. Omit it to let the administrator's priority order decide.
     */
    provider?: string;
    /** Restrict results to these domains, where the serving provider supports it. */
    includeDomains?: string[];
    /** Exclude these domains, where the serving provider supports it. */
    excludeDomains?: string[];
    /** Relative recency window: `day`, `week`, `month` or `year`. */
    freshness?: 'day' | 'week' | 'month' | 'year';
    /** Two-letter country code for localisation, e.g. `US`, `GB`. */
    country?: string;
    /** Language code for results, e.g. `en`. */
    language?: string;
    /** Adult-content filter. Default `moderate`. */
    safeSearch?: 'off' | 'moderate' | 'strict';
    /**
     * Ask for a synthesized answer alongside the hits.
     *
     * This restricts selection to providers that can produce one, so it changes which provider
     * serves the request — not merely what comes back.
     */
    includeAnswer?: boolean;
}
