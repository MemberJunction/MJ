/**
 * Output of `WebSearch.Query`.
 *
 * NO import statements — emitted verbatim into the generated remote_operations.ts.
 */
export interface WebSearchQueryHit {
    /** Page title as the provider reports it. */
    title: string;
    /** Absolute URL of the result. */
    url: string;
    /** Snippet or extracted page content. Length and style vary by provider. */
    snippet: string;
    /** Host as the provider displays it, e.g. `irs.gov`. */
    displayUrl?: string;
    /** Publication or last-modified date, ISO-8601, when the provider resolved one. */
    publishedAt?: string;
    /**
     * The provider's own relevance score.
     *
     * Provider-relative and NOT comparable across providers — use it to order hits within one
     * response, never to threshold or to compare two vendors.
     */
    score?: number;
}

/** One provider's turn, recorded whether it succeeded or not. */
export interface WebSearchQueryAttempt {
    providerName: string;
    succeeded: boolean;
    durationMs: number;
    hitCount?: number;
    /** `transient` (another provider may succeed) or `permanent` (the request itself is bad). */
    failureKind?: string;
    errorMessage?: string;
}

export interface WebSearchQueryOutput {
    /** Normalised results. Legitimately empty for a narrow query — that is not a failure. */
    hits: WebSearchQueryHit[];
    /** Synthesized answer, only when `includeAnswer` was requested and the provider produced one. */
    answer?: string;
    /** Name of the provider that actually served this result. */
    providerUsed: string;
    /**
     * Every provider tried, in order — including on success.
     *
     * If the primary rate-limits every call and the secondary quietly serves everything, nothing
     * else makes that visible while the bill moves to a vendor nobody chose.
     */
    attempts: WebSearchQueryAttempt[];
}
