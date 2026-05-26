/**
 * Per-source configuration for the Content Classification pipeline.
 *
 * Settings here control how a single content source interacts with the tag taxonomy,
 * the vectorization engine, and source-type-specific parameters. Every property is
 * optional and falls back to a sensible default, so an empty `{}` configuration is valid.
 *
 * The SourceSpecificConfiguration sub-object holds type-specific settings whose shape
 * depends on the content source type (Entity, RSS, Website, Cloud Storage, etc.).
 * The keys match the RequiredFields defined on the parent ContentSourceType's Configuration.
 */
export interface IContentSourceConfiguration {
    /** Tag taxonomy matching mode: constrained (only match within subtree), auto-grow (match or create within subtree), free-flow (match or create anywhere) */
    TagTaxonomyMode?: 'constrained' | 'auto-grow' | 'free-flow';
    /** Root Tag ID for constrained/auto-grow modes — limits taxonomy operations to this subtree */
    TagRootID?: string | null;
    /** Similarity threshold (0.0-1.0) for matching ContentItemTags to formal Tags. Default 0.9 */
    TagMatchThreshold?: number;
    /** Whether to share existing tag taxonomy with the LLM during autotagging. Default true */
    ShareTaxonomyWithLLM?: boolean;
    /** Enable vectorization for this source. Default true */
    EnableVectorization?: boolean;
    /**
     * Lower confidence band (0.0-1.0) that routes a semantic match into the human-in-the-loop
     * `MJ:Tag Suggestions` queue instead of auto-applying or auto-creating. A score `s` is
     * routed as: `s >= TagMatchThreshold` → apply; `SuggestThreshold <= s < TagMatchThreshold`
     * → enqueue suggestion (Reason='BelowThreshold'); `s < SuggestThreshold` → fall through to
     * `handleNoMatch` (governed by `TagTaxonomyMode`). When unset, defaults to
     * `TagMatchThreshold - 0.05` at runtime.
     */
    SuggestThreshold?: number;
    /**
     * Maximum number of content items the autotagger may PROCESS (hand to the LLM) per run
     * before the run is paused via the existing CancellationRequested machinery. Does not
     * include items skipped by change-detection — those are free. NULL/unset = unlimited.
     *
     * Most intuitive "do at most N this run, do the rest next time" knob. When checking
     * budgets after a batch, this is evaluated FIRST (before tag / token / cost caps) because
     * it is the most user-facing and not tied to a specific model's pricing or tokenization.
     *
     * Pause is graceful — the next invocation re-crawls, change-detection skips the items
     * already tagged in DB, and the remaining items get processed.
     */
    MaxItemsPerRun?: number;
    /**
     * Maximum number of new tags the autotagger may auto-create across an entire run before
     * the run is paused via the existing CancellationRequested machinery. NULL/unset = unlimited.
     * Pause is graceful — the run resumes from `LastProcessedOffset` when restarted.
     */
    MaxNewTagsPerRun?: number;
    /**
     * Maximum number of new tags the autotagger may auto-create for a single ContentItem.
     * Once reached, further free-text tags from that item are routed to `MJ:Tag Suggestions`
     * with Reason='MaxItemTagsExceeded' instead of being created. NULL/unset = unlimited.
     */
    MaxNewTagsPerItem?: number;
    /**
     * Maximum cumulative LLM tokens (prompt + completion) the run may consume before pausing.
     * Reads from `ContentProcessRunDetail.TotalTokensUsed` rollup. NULL/unset = unlimited.
     */
    MaxTokensPerRun?: number;
    /**
     * Maximum cumulative cost (USD) the run may incur before pausing. NULL/unset = unlimited.
     */
    MaxCostPerRun?: number;
    /**
     * Source-type-specific configuration values. The keys here correspond to the
     * RequiredFields[].Key values defined on the parent ContentSourceType's Configuration.
     *
     * Examples:
     * - Entity type: { EntityID: "uuid", EntityDocumentID: "uuid" }
     * - RSS Feed: { URL: "https://example.com/feed.xml" }
     * - Cloud Storage: { FileStorageProviderKey: "Azure Blob Storage", PathPrefix: "/documents" }
     * - Local File System: { Path: "/var/data/documents" }
     * - Website: { URL: "https://example.com" } — see Website sub-object below for crawl knobs
     */
    SourceSpecificConfiguration?: Record<string, unknown>;
    /**
     * Website-crawler settings — only meaningful for content sources whose ContentSourceType is
     * "Website". Replaces the legacy per-key ContentSourceParam rows; AutotagWebsite reads from
     * this sub-object first and falls back to ContentSourceParam rows for sources configured
     * before this field existed.
     *
     * In the future, source-type-specific knobs like these may move to a pluggable per-source-type
     * sub-interface scheme (one named property per source type). This is the first opt-in
     * implementation; other source types will follow the same pattern as their knobs grow.
     */
    Website?: IContentSourceWebsiteConfiguration;
}

/**
 * Per-source crawl/discovery settings specific to AutotagWebsite. All optional with
 * runtime defaults; an empty object is valid and produces the standard behavior
 * (MaxDepth=2, recursive crawl on, sibling-domain fan-out off, no URL filter).
 */
export interface IContentSourceWebsiteConfiguration {
    /**
     * Recursion ceiling for in-domain links. `0` = just the start URL; `2` (the default) =
     * root + section pages + their child content pages. Higher values combine multiplicatively
     * with the per-page 1-second crawl delay.
     */
    MaxDepth?: number;
    /**
     * When true (default), the recursive depth-aware crawler runs. Setting false disables it
     * (single-page behavior, retrieved-as-discovered-from-the-seed-URL only).
     */
    CrawlSitesInLowerLevelDomain?: boolean;
    /**
     * When true, also adds sibling-path URLs found on the seed page (single-pass, no recursion).
     * Off by default to avoid accidental fan-out across paths the operator didn't intend.
     */
    CrawlOtherSitesInTopLevelDomain?: boolean;
    /**
     * Regex string. Only URLs matching this pattern are added to the visited set. Use to scope
     * to e.g. `^https://example\.com/blog/.*`. Unset = match everything.
     */
    URLPattern?: string;
    /**
     * URL prefix used for the in-domain check. When unset, derived as the parent directory of
     * the seed URL. Override to expand or constrain the crawl boundary (e.g., set to the bare
     * origin to crawl the whole site).
     */
    RootURL?: string;
}
