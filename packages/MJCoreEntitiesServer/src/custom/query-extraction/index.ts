// Query Extraction Pipeline — barrel exports
// Re-exports the public API for the query extraction subsystem.

// Pipeline orchestrator
export { RunExtractionPipeline, CleanupQueryData } from "./pipeline";
export type { PipelineResult } from "./pipeline";

// Types (shared interfaces)
export type {
    ExtractedParameter,
    ExtractedField,
    ParameterExtractionResult,
    PassthroughParamContext,
    ResolvedCompositionReference,
    EntityMetadataEntry,
    ParseResult,
    ResolveResult,
    QuerySyncContext,
} from "./types";

// Parse stage
export { parseQuerySQL } from "./parse";

// Resolve stage (exported for direct use and testing)
export {
    ResolveCompositionReferences,
    ResolveQueryByNameAndCategory,
    BuildParameterMappings,
    ExtractAliasFromSQL,
    BuildPassthroughParams,
    MergePassthroughParams,
    MapQueryParamTypeToParserType,
    BuildFieldsForSelectStar,
    EnrichFieldTypesFromCompositions,
    EnrichFieldTypesFromEntityMetadata,
    ExpandWildcardFields,
    ExtractEntityMetadataFromSQL,
    DetectDependencyCycles,
    FindEntityByName,
} from "./resolve";

// Enrich stage (exported for testing)
export {
    RunLLMEnrichment,
    MergeParametersWithLLM,
    GenerateParameterDescription,
    BuildPassthroughDescription,
    GenerateSampleValue,
} from "./enrich";

// Sync engine
export { SyncParameters, SyncFields, SyncEntities, SyncDependencies, RemoveAllRecords } from "./sync";

// Dialect conversion
export { ConvertTSQLToPostgreSQL } from "./dialect";
