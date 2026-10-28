// Query Extraction Pipeline — barrel exports
// Re-exports the public API for the query extraction subsystem.

// Extraction (describe-based): facts, child-row writes, the post-commit description pass
export { ComputeQueryExtraction, ExtractionSQLHash } from "./extractQuery";
export { WriteExtractedChildRows } from "./childRowWriter";
export type { ChildRowWriteContext, ChildRowWriteSummary } from "./childRowWriter";
export { RunDescriptionPass } from "./descriptionPass";
export type { DescriptionPassRequest } from "./descriptionPass";
export { AnalyzeQueryTemplate, SQLUsesTemplate, DescribeDiagnostic } from "./templateFacts";
export type { TemplateAnalysis } from "./templateFacts";
export { DescribeQueryOutput, SampleValueFor } from "./describeFacts";
export type { DescribedOutput } from "./describeFacts";
export { EntityObjectIndex, BindColumnSource, BindTableReferences } from "./sourceBinding";
export type { BoundColumnSource } from "./sourceBinding";
export type {
    QueryExtractionOverride,
    QueryExtractionStatus,
    QueryExtractionMode,
    QueryParameterType,
    KnownQueryParameter,
    QueryExtractionInput,
    QueryFieldFact,
    QueryParameterFact,
    QueryEntityFact,
    QueryDependencyFact,
    QueryExtractionResult,
} from "./extractionTypes";

// Legacy pipeline orchestrator (kept as a façade; saves use ComputeQueryExtraction)
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
export { ParseQuerySQL, parseQuerySQL } from "./parse";

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

// Declared child rows (graph saves)
export {
    CollectDeclaredQueryChildren,
    HasDeclaredQueryChildren,
    FindReplacedRows,
    QueueReplacedRowDeletion,
    QueryChildNameKey,
    QueryEntityKey,
    NO_DECLARED_QUERY_CHILDREN,
} from "./declared";
export type { DeclaredQueryChildren, DeclaredQueryCollections } from "./declared";

// Dialect conversion
export { ConvertTSQLToPostgreSQL } from "./dialect";
