/**
 * Per-source configuration for the Content Autotagging pipeline.
 *
 * Settings here control how a single content source interacts with the tag taxonomy
 * and the vectorization engine. Every property is optional and falls back to a sensible
 * default, so an empty `{}` configuration is valid.
 *
 * Some properties (e.g. `ShareTaxonomyWithLLM`, `TagTaxonomyMode`) can also be set at
 * the content-type level via {@link IContentTypeConfiguration}; source-level values
 * take precedence when present.
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
}