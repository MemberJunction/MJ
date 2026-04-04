/**
 * Content-type-level defaults for the autotagging and vectorization pipeline.
 *
 * Stored as a JSON blob in the `Configuration` column of the `Content Types` entity.
 * CodeGen emits a strongly-typed `ConfigurationObject` accessor on `ContentTypeEntity`.
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
}