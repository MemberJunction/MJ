/**
 * Content-type-level defaults for the autotagging and vectorization pipeline.
 *
 * Content Types classify the kind of content being processed (e.g. "Document", "Email",
 * "Web Page"). Settings defined here act as defaults for every content source that
 * produces this type of content. Individual sources can override these defaults via
 * their own {@link IContentSourceConfiguration}.
 */
export interface IContentTypeConfiguration {
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