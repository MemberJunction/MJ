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
     * Source-type-specific configuration values. The keys here correspond to the
     * RequiredFields[].Key values defined on the parent ContentSourceType's Configuration.
     *
     * Examples:
     * - Entity type: { EntityID: "uuid", EntityDocumentID: "uuid" }
     * - RSS Feed: { URL: "https://example.com/feed.xml" }
     * - Cloud Storage: { FileStorageProviderKey: "Azure Blob Storage", PathPrefix: "/documents" }
     * - Local File System: { Path: "/var/data/documents" }
     * - Website: { URL: "https://example.com", CrawlDepth: 2 }
     */
    SourceSpecificConfiguration?: Record<string, unknown>;
}
