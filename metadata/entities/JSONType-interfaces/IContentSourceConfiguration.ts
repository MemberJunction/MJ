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
