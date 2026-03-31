/**
 * Configuration interface for EntityDocument.Configuration JSON column.
 *
 * Controls how the vectorization pipeline processes records for a given
 * entity document — which fields get into vector metadata, how they're
 * truncated, how records are filtered, and pipeline tuning knobs.
 *
 * All fields are optional. NULL / missing means "use system defaults."
 */

/* ------------------------------------------------------------------ */
/*  Top-level EntityDocument Configuration                             */
/* ------------------------------------------------------------------ */

export interface EntityDocumentConfiguration {
    /** Controls which entity fields appear in vector metadata and how they're stored */
    metadata?: EntityDocumentMetadataConfig;

    /** Scheduling settings for automated incremental sync */
    scheduling?: EntityDocumentSchedulingConfig;

    /** Pipeline tuning — batch sizes, concurrency, rate limiting */
    pipeline?: EntityDocumentPipelineConfig;

    /** Record filtering — limit which records get vectorized */
    recordFilter?: EntityDocumentRecordFilterConfig;

    /** Content chunking for long-form text fields */
    chunking?: EntityDocumentChunkingConfig;
}

/* ------------------------------------------------------------------ */
/*  Metadata Field Configuration                                       */
/* ------------------------------------------------------------------ */

export interface EntityDocumentMetadataConfig {
    /**
     * Strategy for selecting which fields go into vector metadata:
     * - "all":     include every non-PK, non-FK, non-binary, non-system field
     *              (current default behavior)
     * - "include": only include fields listed in `fields`
     * - "exclude": include all fields EXCEPT those listed in `fields`
     */
    fieldStrategy?: 'all' | 'include' | 'exclude';

    /**
     * Per-field overrides. The key is the entity field name.
     * Only relevant when fieldStrategy is "include" or "exclude",
     * or when you need to override truncation for specific fields
     * under "all" mode.
     */
    fields?: Record<string, EntityDocumentFieldConfig>;

    /**
     * Global default truncation limit in characters for fields with
     * MaxLength > 5000 or nvarchar(MAX). Default: 1000.
     * Individual field overrides in `fields` take precedence.
     */
    defaultTruncationLimit?: number;

    /**
     * Whether to include the entity icon in vector metadata.
     * Default: true.
     */
    includeEntityIcon?: boolean;

    /**
     * Whether to include __mj_UpdatedAt in vector metadata for
     * freshness display in search results. Default: true.
     */
    includeUpdatedAt?: boolean;
}

export interface EntityDocumentFieldConfig {
    /**
     * Whether this field is included in vector metadata.
     * Used with "include" strategy to explicitly list fields,
     * or with "exclude" strategy to mark specific fields for exclusion.
     * Under "all" strategy, set to false to exclude a specific field.
     */
    included?: boolean;

    /**
     * Override the truncation limit for this specific field (in characters).
     * Only applies to large text fields. NULL means use the global
     * defaultTruncationLimit.
     */
    truncationLimit?: number;

    /**
     * Whether this field should be used as the primary display title
     * in search result cards. At most one field should be marked.
     * If none are marked, the system uses IsNameField from entity metadata.
     */
    isDisplayTitle?: boolean;

    /**
     * Whether this field should be used as the snippet/preview text
     * in search result cards. At most one field should be marked.
     */
    isSnippetField?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Scheduling Configuration                                           */
/* ------------------------------------------------------------------ */

export interface EntityDocumentSchedulingConfig {
    /**
     * Whether automated sync is enabled for this entity document.
     * Default: false (manual sync only).
     */
    enabled?: boolean;

    /**
     * Cron expression for scheduled sync (e.g. "0 2 * * *" for daily at 2 AM).
     * Mutually exclusive with `intervalSeconds`.
     */
    cronExpression?: string;

    /**
     * Interval in seconds between sync runs. Only used if cronExpression
     * is not set. Minimum: 300 (5 minutes).
     */
    intervalSeconds?: number;

    /**
     * Whether to run a full sync or only incremental (records changed
     * since last sync). Default: "incremental".
     */
    syncMode?: 'full' | 'incremental';

    /**
     * For incremental mode, the timestamp column used to detect changes.
     * Default: "__mj_UpdatedAt".
     */
    changeTrackingColumn?: string;
}

/* ------------------------------------------------------------------ */
/*  Pipeline Tuning Configuration                                      */
/* ------------------------------------------------------------------ */

export interface EntityDocumentPipelineConfig {
    /**
     * Number of records to fetch from the database per page.
     * Default: 100.
     */
    fetchBatchSize?: number;

    /**
     * Number of records to render templates and embed in parallel.
     * Default: 50.
     */
    vectorizeBatchSize?: number;

    /**
     * Number of vectors to upsert to the vector DB in a single call.
     * Default: 50. Capped by VectorDatabaseConfiguration.throughput.maxUpsertBatchSize.
     */
    upsertBatchSize?: number;

    /**
     * Maximum number of concurrent embedding API calls.
     * Controls parallelism in the AsyncBatchTransform pipeline.
     * Default: 3.
     */
    maxConcurrentEmbeddings?: number;

    /**
     * Delay in milliseconds between API calls to avoid rate limiting.
     * Default: 0 (no delay).
     */
    delayBetweenCallsMs?: number;

    /**
     * Whether to force re-vectorization of records that have already
     * been vectorized (by their deterministic SHA-1 ID). Default: false.
     */
    forceRevectorize?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Record Filtering Configuration                                     */
/* ------------------------------------------------------------------ */

export interface EntityDocumentRecordFilterConfig {
    /**
     * Additional SQL filter predicate appended to the WHERE clause when
     * fetching records to vectorize. Uses the same syntax as RunView's
     * ExtraFilter (e.g. "Status = 'Active' AND IsDeleted = 0").
     */
    extraFilter?: string;

    /**
     * Maximum number of records to vectorize in a single run.
     * 0 or undefined means no limit.
     */
    maxRecords?: number;

    /**
     * Starting offset — skip this many records before vectorizing.
     * Useful for resuming after a partial failure.
     */
    startingOffset?: number;
}

/* ------------------------------------------------------------------ */
/*  Content Chunking Configuration                                     */
/* ------------------------------------------------------------------ */

export interface EntityDocumentChunkingConfig {
    /**
     * Whether to enable chunking for long-form text content.
     * When enabled, records with text exceeding `maxChunkTokens` are
     * split into multiple vectors with shared metadata.
     * Default: false (entire rendered template = one vector).
     */
    enabled?: boolean;

    /**
     * Maximum tokens per chunk. The embedding model's context window
     * is the hard ceiling. Default: 512.
     */
    maxChunkTokens?: number;

    /**
     * Number of tokens to overlap between consecutive chunks.
     * Ensures context continuity at chunk boundaries. Default: 50.
     */
    overlapTokens?: number;

    /**
     * Chunking strategy:
     * - "token":     split on token boundaries (most precise)
     * - "sentence":  split on sentence boundaries (more readable)
     * - "paragraph": split on paragraph/double-newline boundaries
     */
    strategy?: 'token' | 'sentence' | 'paragraph';
}
