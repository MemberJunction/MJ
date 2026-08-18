/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IContentTypeConfiguration.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.
 */

/**
 * Content-type-level defaults for the autotagging and vectorization pipeline.
 *
 * Content Types classify the kind of content being processed (e.g. "Document", "Email",
 * "Web Page"). Settings defined here act as defaults for every content source that
 * produces this type of content. Individual sources can override these defaults via
 * their own {@link IContentSourceConfiguration}.
 */
export interface IContentTypeConfiguration {
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

    /** Whether to share tag taxonomy with LLM by default for all sources of this type. Can be overridden per source. Default true */
    ShareTaxonomyWithLLM?: boolean;
    /** Default tag taxonomy mode for sources of this type. Can be overridden per source */
    DefaultTagTaxonomyMode?: 'constrained' | 'auto-grow' | 'free-flow';
    /**
     * Default vector-database record-id strategy for sources of this type. Overridable per source
     * via {@link IContentSourceConfiguration.VectorIDStrategy}. Default 'recordId' (the safe,
     * purge-compatible strategy); 'hash' is legacy parity and unsafe with re-chunk + purge.
     */
    VectorIDStrategy?: 'hash' | 'recordId';
    /**
     * Default chunk text/vector storage mode for sources of this type. Overridable per source via
     * {@link IContentSourceConfiguration.ChunkTextStorage}. Default 'alwaysChunk' — every item gets
     * a ContentItemChunk row and ContentItem.VectorRecordID is never set; 'mixed' keeps
     * single-chunk items' text/vector on the ContentItem.
     */
    ChunkTextStorage?: 'mixed' | 'alwaysChunk';
    /**
     * Default vector-metadata configuration for sources of this type. Overridable per source via
     * {@link IContentSourceConfiguration.VectorMetadata}. Controls how minimal each vector's
     * metadata is kept.
     */
    VectorMetadata?: IContentTypeVectorMetadataConfig;
}

/**
 * Content-type-level default for vector metadata shape. Structurally identical to
 * {@link IContentSourceConfiguration.VectorMetadata}; a source's own setting overrides it.
 */
export interface IContentTypeVectorMetadataConfig {
    /**
     * Which ContentItem fields go into metadata (mirrors the entity pipeline). Unset ⇒ the curated
     * default (identity + ContentSourceID/Type + Title / Description / URL + Tags).
     * - 'all': every eligible ContentItem field. - 'include': only `Fields` marked Included.
     * - 'exclude': all eligible except `Fields` marked Included:false. - 'explicit': exactly
     * `Fields`, no system keys except Entity, toggles opt-in.
     */
    FieldStrategy?: 'all' | 'include' | 'exclude' | 'explicit';
    /** Per-field overrides keyed by ContentItem field name. */
    Fields?: Record<string, IContentTypeVectorMetadataFieldConfig>;
    /** Global default truncation limit (characters) for large string fields. Default 1000. */
    DefaultTruncationLimit?: number;
    /** Include the content entity's icon. Default true under a set strategy; opt-in under 'explicit'. */
    IncludeEntityIcon?: boolean;
    /** Include __mj_UpdatedAt for recency sorting. Default true under a set strategy; opt-in under 'explicit'. */
    IncludeUpdatedAt?: boolean;
    /** Include the item's Tags array. Default true (and under the curated default); opt-in under 'explicit'. */
    IncludeTags?: boolean;
    /** Include the embedded text under the 'Text' key. Default false. Honored under every strategy. */
    IncludeText?: boolean;
}

/** Per-field metadata override, keyed by ContentItem field name. Mirrors the entity pipeline. */
export interface IContentTypeVectorMetadataFieldConfig {
    /** Include this field under 'include'/'explicit', or exclude it (false) under 'all'/'exclude'. */
    Included?: boolean;
    /** Override the truncation limit (characters) for this field. */
    TruncationLimit?: number;
    /** How to store this field's value ('string' default, 'number', 'boolean', 'epochSeconds', 'epochMilliseconds'). */
    StoreAs?: 'string' | 'number' | 'boolean' | 'epochSeconds' | 'epochMilliseconds';
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
