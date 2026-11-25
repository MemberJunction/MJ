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
    /**
     * The entity this source's items are created, loaded and saved as: an IS-A extension of `MJ: Content Items`
     * (for example a product's own `Content Items` entity), by name. Saving an item as its extension
     * writes both rows under one ID, so no item exists without its extension row; an existing item that
     * has none gets it added. Overrides the source type's, the content type's and the system default
     * (`ContentPipeline.ItemEntity` on the default AI Configuration). Unset everywhere means plain
     * `MJ: Content Items`. An entity that is not an extension of `MJ: Content Items` fails the item.
     */
    ItemEntity?: string;

    /**
     * Options passed to the segmentation strategy named by SegmenterKey.
     *
     * Sizing note: TargetTokens should be driven by the shape of your QUERIES, not by the
     * embedding model's context window. The window is an upper bound; a good chunk is about
     * as much content as a good answer, so that a matching chunk is mostly signal.
     */
    SegmentationOptions?: IContentSegmentationOptions;

    /**
     * Options passed to the cleaning strategy named by CleanerKey. Selector rules are
     * per-source because the right selector is a property of the site's template.
     */
    CleaningOptions?: IContentCleaningOptions;

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
     * Vector-database record-id strategy for this source's chunks. Default 'recordId'.
     * - 'recordId' (default, recommended): each ContentItemChunk's unique RecordID is used as its
     *   vector-DB record id. Safe with the soft-delete + PurgeDeletedChunks flow — a re-chunk mints
     *   new rows with new ids, so a superseded (soft-deleted) chunk and its replacement never share
     *   a vector id, and purging the old one can't orphan the live chunk's vector.
     * - 'hash': a deterministic hash of the parent content item id (5.49 EntityDocument parity).
     *   NOT safe with re-chunking + purge — a replacement chunk reuses the superseded chunk's id,
     *   so purging the old chunk would delete the live chunk's vector. Use only for sources that
     *   are never re-chunked or purged.
     */
    VectorIDStrategy?: 'hash' | 'recordId';
    /**
     * How chunk text + vectors are stored for this source. Default 'alwaysChunk'.
     * - 'alwaysChunk' (default): every content item gets at least one ContentItemChunk row holding
     *   its text — even items small enough to fit in a single chunk — and ContentItem.VectorRecordID
     *   is never set. The ContentItemChunk table is always the single source of truth for vectors.
     * - 'mixed': items that fit in a single chunk keep their text and vector id on the ContentItem
     *   (no chunk row); only larger items are split into ContentItemChunk rows.
     */
    ChunkTextStorage?: 'mixed' | 'alwaysChunk';
    /**
     * Controls what goes into each vector's metadata. Vector-store metadata has real storage +
     * performance cost, so this lets a source keep it minimal. Falls back to the ContentType's
     * default, then 'default'.
     */
    VectorMetadata?: IContentSourceVectorMetadataConfig;
    /**
     * The MJ entity this source's VECTORS resolve to, for search attribution. Optional; when unset,
     * attribution falls back to the index's Entity Documents exactly as before.
     *
     * Why this exists. `SearchEngine` groups results by `EntityName` and evaluates THAT entity's
     * CanRead/RLS, so a match it cannot name is dropped rather than shown unlabelled. A source whose
     * vectors carry minimal metadata (`VectorMetadata.FieldStrategy: 'explicit'`) has no `Entity`
     * key to read, and a source populated outside MJ's pipeline has no Entity Document either —
     * this is how such a source states the answer once instead of paying for it per vector.
     *
     * Distinct from the `EntityID` **column**, which is the entity an Entity-type source pulls
     * records *from* and is null for file/RSS/website sources. This is the entity its vectors *are*.
     *
     * Set it to an **ISA extension** rather than the base entity when that is where row-level
     * security lives: attribution decides which entity's RLS is applied, so naming the base entity
     * of an extension evaluates the wrong rules.
     *
     * One declaration names one entity, so it is only meaningful when a source's vectors are all at
     * the same level. Under `ChunkTextStorage: 'mixed'` a source emits ContentItem-level vectors for
     * single-chunk items and ContentItemChunk-level vectors for the rest — two different entities —
     * so leave this unset there and let per-vector `Entity` metadata carry it.
     *
     * Setting this also changes what gets WRITTEN — with `FieldStrategy: 'explicit'`, new vectors omit
     * `Entity` and carry `ContentSourceID` instead, so the entity name lives in one place rather than on
     * every vector. That additionally requires `ChunkTextStorage: 'alwaysChunk'`,
     * `VectorIDStrategy: 'recordId'`, and a name here resolving to `MJ: Content Item Chunks` or a
     * subtype. Anything unmet and `Entity` is written anyway, because a match search cannot attribute is
     * dropped by the permission filter rather than returned unlabelled — `'mixed'` would need two names,
     * `'hash'` leaves no recoverable record id, and a declaration naming the ITEM entity would point
     * search at a table holding none of these ids.
     *
     * Note that last one when row-level security is your reason for declaring an extension: under
     * `'alwaysChunk'` the vectors are chunk rows, so the extension has to extend the CHUNK entity.
     * Existing vectors are untouched and keep resolving through their stored key.
     */
    VectorEntityName?: string;
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
     * Settings for individual extractors, keyed by extractor key, handed to that extractor as
     * `ExtractRequest.Options`. Layered: the Content Source Type's, then the source's
     * `SourceSpecificConfiguration`, then the source's own, then a run's `Options`. For example the
     * `Manifest` extractor (a CSV or TSV listing documents) reads `{ "Manifest": { "LinkColumn": "Link",
     * "TextColumn": "Body", "TitleColumn": "Title", "DateColumn": "Published", "DecoratorColumn": "Journal",
     * "KeyColumn": "ID", "Columns": { "Member Type": "Audience" }, "Delimiter": "," } }`, and the `Html` extractor
     * reads `{ "Html": { "TitleSelector": "h1.article-title" } }` (the element whose text is the page's title).
     */
    ExtractorOptions?: Record<string, Record<string, unknown>>;

    /**
     * The registered page renderer (`BasePageRenderer`) that loads this source's web pages, for sites
     * built by script in the browser: `Headless` loads them in a headless Chromium (needs the
     * `playwright` package). Used by the website crawler and by Extract. Unset: a plain HTTP GET.
     */
    PageRenderer?: string;
    /**
     * When {@link PageRenderer} is used. `Always` (default): every page is rendered, except an address whose HEAD names a
     * document file (a PDF, Word, Excel, PowerPoint, an image...), which is fetched plainly. `WhenEmpty`: a page is
     * fetched plainly first and rendered only when that finds an empty, script-only page (under
     * `Tuning.EmptyPageTextChars` characters of text, default 200), or when the site refused the plain fetch (a 401,
     * 403 or 5xx; not a 404, 410 or 429).
     */
    PageRenderMode?: 'Always' | 'WhenEmpty';
    /** How {@link PageRenderer} loads a page and when it counts as settled. Unset: the renderer's defaults. */
    PageRendererOptions?: IContentSourcePageRendererOptions;
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
    /**
     * Optional Semantic Graph overlay configuration for the Content Pipeline `Graph` stage
     * (`@RegisterClass(BasePipelineStage, 'Graph')`). When enabled on a Content Source that
     * is linked to a `GraphID` (either a Canon graph or a shared/per-source Knowledge graph),
     * the pipeline clusters ingested chunks into higher-level `MJ: Graph Concepts` and emits
     * typed `MJ: Graph Edges` (`SourcedFrom`, `Mentions`, `BroaderThan`, `Contradicts`, etc.).
     */
    GraphOverlay?: IContentSourceGraphOverlayConfig;
    /**
     * Optional artifact indexing for a push-only (`Upload`) source. When set, the Content Pipeline's
     * `ArtifactGraphIndexer` pushes the latest version of every artifact of these types into this
     * source as it is saved, one Content Item per artifact, linked to the `MJ: Artifacts` record
     * so graph access follows the artifact's own permissions. Combine with `GraphOverlay` to put
     * the documents into a graph.
     */
    Artifacts?: IContentSourceArtifactsConfiguration;
}

/**
 * Which artifacts a push-only source indexes, and how eagerly.
 */
export interface IContentSourceArtifactsConfiguration {
    /** `MJ: Artifact Types` names whose versions are indexed, e.g. `["Markdown Document"]`. Matched case-insensitively. */
    ArtifactTypes?: string[];
    /**
     * Quiet period after the last save of an artifact before it is indexed, in milliseconds.
     * Collaborative editing saves often; indexing waits for the edits to settle. Default 10000.
     */
    DebounceMs?: number;
    /**
     * When false, the source is skipped by the indexer while keeping what it already indexed.
     * Default true.
     */
    Enabled?: boolean;
}

/**
 * Per-source Semantic Graph overlay configuration for the Content Pipeline `Graph` stage.
 */
export interface IContentSourceGraphOverlayConfig {
    /** Enable the Graph overlay stage after Embed for this Content Source. Default false. */
    Enabled?: boolean;
    /**
     * Concept taxonomy mode:
     * - 'constrained': only link chunks to existing approved/proposed GraphConcepts in the target Graph.
     * - 'auto-grow': link to existing GraphConcepts when matched; synthesize new proposed GraphConcepts for unmatched clusters.
     * - 'free-flow': synthesize and merge GraphConcepts across the target Graph without subtree restrictions.
     */
    ConceptTaxonomyMode?: 'constrained' | 'auto-grow' | 'free-flow';
    /** Default evidentiary authority tier name (from MJ: Graph Authority Tiers) assigned to concepts synthesized from this Content Source. */
    DefaultAuthorityTier?: string;
    /** Optional default GraphAuthorityTier ID assigned to concepts synthesized from this Content Source. */
    DefaultAuthorityTierID?: string;
    /** Whether to synthesize higher-level GraphConcept records from chunk clusters. Default true when Enabled. */
    SynthesizeConcepts?: boolean;
    /** Minimum supporting chunks required to form a new concept seed cluster. Default 2. */
    MinChunksForConceptCluster?: number;
    /** Cosine similarity threshold (0.0-1.0) for clustering chunk vectors or matching existing concepts. Default 0.82. */
    ConceptSimilarityThreshold?: number;
    /**Confidence threshold (0.0-1.0) at or above which inferred edges/concepts are auto-approved; below routes to Proposed. Default 0.90. */
    AutoApproveThreshold?: number;
    /** Whether to detect and emit Contradicts edges when chunks conflict on thresholds, dates, or formulas. Default true. */
    DetectContradictions?: boolean;
    /** ClassFactory key for the BaseConceptSynthesizer implementation. Default 'DeterministicConceptSynthesizer'. */
    SynthesizerKey?: string;
    /** Maximum concept clusters synthesized by the LLM per pipeline run. NULL/unset = unlimited. */
    MaxConceptsPerRun?: number;
}

/**
 * Controls which keys land in a content vector's metadata. Vector metadata is expensive in a
 * vector database (storage + query performance). This mirrors the entity-vectorization pipeline's
 * metadata-control structure (field strategy, per-field overrides, storage-type coercion,
 * truncation, opt-out toggles), adapted to content-item vectors.
 *
 * Field values are read from the parent ContentItem. The identity keys (Entity + RecordID, plus
 * ContentItemID / Sequence for chunk vectors) are managed as system keys — see FieldStrategy.
 */
export interface IContentSourceVectorMetadataConfig {
    /**
     * Which ContentItem fields go into metadata. Mirrors the entity pipeline's field strategy.
     * When UNSET, the standard curated content set is used (the historical default): the identity
     * keys + ContentSourceID / ContentSourceTypeID + Title / Description / URL + Tags. When set:
     * - 'all': every eligible ContentItem field (non-PK, non-uniqueidentifier, non-binary,
     *   non-system) plus the toggle-driven keys below.
     * - 'include': ONLY the ContentItem fields marked `Included: true` in `Fields` (explicit
     *   inclusion wins over the eligibility heuristics — a uniqueidentifier / PK / __mj_* field
     *   can be included by name; only genuinely unstorable binary types are refused).
     * - 'exclude': all eligible fields EXCEPT those marked `Included: false` in `Fields`.
     * - 'explicit': EXACTLY the fields in `Fields` — no system keys except `Entity` (always kept so
     *   content search results stay correctly labeled), and the toggles flip to opt-in (default
     *   false). Keeps metadata minimal. NOTE: under 'explicit' a search hit's record id is
     *   recoverable only when VectorIDStrategy='recordId' (the default), where the vector's own id
     *   is the chunk id; with 'hash' the id would need to be kept explicitly.
     */
    FieldStrategy?: 'all' | 'include' | 'exclude' | 'explicit';
    /** Per-field overrides keyed by ContentItem field name (see {@link IContentSourceVectorMetadataFieldConfig}). */
    Fields?: Record<string, IContentSourceVectorMetadataFieldConfig>;
    /** Global default truncation limit (characters) for large string fields. Default 1000. */
    DefaultTruncationLimit?: number;
    /** Include the content entity's icon. Default true under a set strategy; opt-in under 'explicit'. */
    IncludeEntityIcon?: boolean;
    /** Include __mj_UpdatedAt for recency sorting. Default true under a set strategy; opt-in under 'explicit'. */
    IncludeUpdatedAt?: boolean;
    /** Include the item's Tags array. Default true (and under the curated default); opt-in under 'explicit'. */
    IncludeTags?: boolean;
    /**
     * When true, include the embedded text in metadata under the 'Text' key (which surfaces as the
     * search snippet). Default false — external hydrators read the authoritative text from the
     * ContentItem / ContentItemChunk row, so the copy is usually unnecessary storage. Honored under
     * every strategy (including the curated default).
     */
    IncludeText?: boolean;
}

/** Per-field metadata override, keyed by ContentItem field name. Mirrors the entity pipeline. */
export interface IContentSourceVectorMetadataFieldConfig {
    /** Include this field under 'include'/'explicit', or exclude it (false) under 'all'/'exclude'. */
    Included?: boolean;
    /** Override the truncation limit (characters) for this field. */
    TruncationLimit?: number;
    /**
     * How to store this field's value: 'string' (default, truncated), 'number', 'boolean',
     * 'epochSeconds' / 'epochMilliseconds' (parse a date to Unix epoch for numeric range filters).
     * SQL numeric column types store as numbers automatically without setting this.
     */
    StoreAs?: 'string' | 'number' | 'boolean' | 'epochSeconds' | 'epochMilliseconds';
    /**
     * Write this field under a different metadata key (for example `Date` as `ContentDate`). Unset: the
     * field's own name. The identity keys (`Entity`, `RecordID`, `ContentItemID`, `Sequence`) cannot be
     * written this way.
     */
    MetadataKey?: string;
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
    /**
     * Seed the crawl from the site's sitemaps: those in {@link SitemapURLs}, else the ones robots.txt
     * names, else `/sitemap.xml`. Each in-scope page a sitemap lists is found (unless its `lastmod` is
     * older than the walk's `Since`) and its links are followed like any other page's. Default false.
     */
    UseSitemaps?: boolean;
    /** Sitemaps to read instead of looking in robots.txt. A sitemap index is followed. */
    SitemapURLs?: string[];
    /** Pause after reading each page, in ms, to be polite to the site. Default 1000. */
    CrawlDelayMs?: number;
    /**
     * The most pages whose links one walk reads (across all its parts). The pages already found when it is reached
     * are still checked and reported, but their links are not read; dead pages, files and retries do not count.
     * Unset: no limit.
     */
    MaxPages?: number;
    /** How long the page renderer may take to load and settle a page, in ms. Default 30000. */
    RenderTimeoutMs?: number;
    /**
     * How many pages the crawl fetches at a time. Default 1. Politeness (below) still applies per host, so a host
     * that rate-limits the crawl is paced however many fetches are in flight.
     */
    Concurrency?: number;
    /**
     * Fetch a page whose links will not be read (one level past {@link MaxDepth}, a sibling path, any page past
     * {@link MaxPages}) to know it is alive before reporting it. Default true: a dead link never becomes an item.
     * `false` reports such pages unfetched, saving the crawl one request per page (Extract fetches each one anyway),
     * at the cost of dead links becoming items that fail in Extract.
     */
    CheckLeafPages?: boolean;
    /**
     * How a host that answers 429 (or 503 with Retry-After) is handled: the host is slowed (its rate limiter halves), and
     * the fetch is retried after the longer of what the host asks and an exponential backoff. A page still limited after
     * its retries is tried once more at the end of the crawl rather than losing its links.
     */
    RateLimit?: IContentSourceRateLimitConfiguration;
    /** The `User-Agent` the crawl's and Extract's plain HTTP requests send. Default `Mozilla/5.0 (compatible; MemberJunction/1.0)`. */
    UserAgent?: string;
    /**
     * The most bytes of one response read (a page, an item Extract fetches). An item past it fails as a lasting
     * error (an error answer past it keeps its status); a page read for its links is read up to it. A sitemap is
     * held to the sitemap protocol's own 50 MB instead. Unset: no limit.
     */
    MaxResponseBytes?: number;
    /** Treat `www.` and the bare host, and `http` and `https`, as one site: one page, one scope. Default false. */
    MergeWwwAndScheme?: boolean;
    /**
     * Remove tracking and back-link query parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`, `mc_cid`, `mc_eid`,
     * `_ga`, `_gl`, `_gac_*`, `redirect`, `_token`) from every URL, so one page is not found as many. Default false.
     */
    StripTrackingParams?: boolean;
    /** The query parameters to remove instead of the default list (names; a trailing `*` is a prefix). Setting it turns stripping on. */
    StripQueryParams?: string[];
    /** A page whose `<link rel="canonical">` names a page already found is a duplicate and is not reported. Default false. */
    DedupCanonical?: boolean;
    /** A page that redirects to a page already found is a duplicate and is not reported, and the target is not read again. Default false. */
    DedupRedirects?: boolean;
    /**
     * More than this many distinct query strings on one path and the crawl stops following that path (filters,
     * paginators and calendars that never end). Unset: no limit.
     */
    LoopLimit?: number;
    /** Do not follow links whose path is a date (`/2026/05/01/`, `/01-05-2026/`): an endless calendar. Default false. */
    SkipCalendarPaths?: boolean;
    /**
     * Only pages matching one of these are visited and reported; the start page is always visited for its links.
     * Each entry is a substring of the URL, or a regular expression when written `re:<pattern>`. Applies on top of
     * {@link URLPattern}. Unset: everything in scope.
     */
    IncludePatterns?: string[];
    /**
     * Pages matching one of these are neither visited nor reported; the start page is still visited for its links,
     * but not reported. Same syntax as {@link IncludePatterns}.
     */
    ExcludePatterns?: string[];
}

/**
 * How the website crawl backs off and paces a host that rate-limits it. Every field is optional. Each host has its own
 * rate limiter (network-utils `RateLimiter`); a rate-limited fetch is retried with exponential backoff (`WithRetry`).
 */
export interface IContentSourceRateLimitConfiguration {
    /** How many times a rate-limited fetch is retried. Default 3. */
    MaxRetries?: number;
    /** The first backoff wait, in ms; it doubles with each retry (with jitter). Default 2000. */
    BackoffMs?: number;
    /** The longest any one wait may be, in ms. Default 60000. */
    MaxBackoffMs?: number;
    /** The most requests a second to one host; a host that rate-limits the crawl is halved, then recovers. Default 10. */
    RequestsPerSecond?: number;
    /** The slowest a rate-limited host is paced, in requests a second. Default 0.5. */
    MinRequestsPerSecond?: number;
}

/** How the page renderer (e.g. `Headless`) loads a page. Every field is optional. */
export interface IContentSourcePageRendererOptions {
    /**
     * When navigation counts as done: `load`, `domcontentloaded`, `networkidle` (default) or `commit`. A site that
     * polls forever never goes network-idle; use `load` with a {@link WaitSelector} there.
     */
    WaitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
    /** A CSS selector that must be visible before the page is read, for content that arrives after load. */
    WaitSelector?: string;
    /** How long to wait for {@link WaitSelector}, in ms. Default 10000; a selector that never appears fails the render. */
    WaitSelectorTimeoutMs?: number;
    /** Scroll to the bottom before reading, so content loaded on scroll is there. Default false. */
    ScrollToBottom?: boolean;
    /** The `User-Agent` the browser presents. Unset: the browser's own. */
    UserAgent?: string;
}

/**
 * Options for the segmentation strategy. All optional; each segmenter ignores options
 * that don't apply to it.
 */
export interface IContentSegmentationOptions {
    /** Hard ceiling on tokens per segment. Segments larger than this are split. */
    MaxSegmentTokens?: number;
    /** Overlap tokens applied when an oversized segment must be split. */
    OverlapTokens?: number;
    /** Merge adjacent text segments estimating below this many tokens. */
    MinSegmentTokens?: number;
    /** AdaptiveBoundary: desired segment size — size this to your queries, not to the model. */
    TargetTokens?: number;
    /** AdaptiveBoundary: percent below target at which a paragraph break is accepted. */
    UndershootPercent?: number;
    /** AdaptiveBoundary: percent above target to keep looking for a sentence/word break. */
    OvershootPercent?: number;
    /** AdaptiveBoundary: if the whole text is within this percent of target, don't split at all. */
    NoSplitPercent?: number;
    /** Transcript: maximum wall-clock length of one chapter, in milliseconds. */
    MaxChapterMs?: number;
    /** Transcript: a silence gap at least this long starts a new chapter. */
    BoundaryGapMs?: number;
    /** Transcript: also emit one child segment per speaker turn within each chapter. */
    EmitSubChapters?: boolean;
    /** FixedWindow: window length in milliseconds for audio/video with no transcript. */
    WindowMs?: number;
    /** SemanticText: skip the LLM boundary pass for documents below this token count. */
    MinTokensForLLM?: number;
}

/**
 * Options for the content-cleaning strategy that runs before segmentation.
 *
 * Garbage that survives cleaning is expensive: it gets embedded, stored, retrieved, and
 * shown to a user or an agent. Navigation chrome repeated across a thousand pages produces
 * a thousand near-identical vectors that crowd out real answers.
 */
export interface IContentCleaningOptions {
    /**
     * CSS selectors whose content is the ONLY content to keep. The highest-leverage knob:
     * naming the element that holds the article (e.g. '.article-body', 'main') discards
     * navigation, sidebars, and advertising without enumerating what to drop.
     */
    IncludeSelectors?: string[];
    /** CSS selectors to remove, applied after IncludeSelectors (inline ad slots, share widgets). */
    ExcludeSelectors?: string[];
    /** Collapse runs of whitespace and blank lines. Default true. */
    NormalizeWhitespace?: boolean;
    /** Maximum characters to retain after cleaning. */
    MaxLength?: number;
    /** Html cleaner: replace the built-in exclusion list rather than appending to it. */
    ReplaceDefaultExcludes?: boolean;
    /** Html cleaner: keep `alt` text from images as content. */
    IncludeImageAltText?: boolean;
}
