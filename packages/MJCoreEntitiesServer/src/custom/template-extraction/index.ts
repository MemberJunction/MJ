// Template Extraction Pipeline — barrel exports

// Pipeline orchestrator
export { RunTemplateExtractionPipeline } from "./pipeline";
export type { TemplateExtractionResult } from "./pipeline";

// Parser (deterministic AST extraction)
export { ParseTemplateParameters } from "./parser";

// Types
export type {
    TemplateParamType,
    PropertyAccess,
    DeterministicParameter,
    ParameterUsage,
    ParseResult,
    EnrichmentResult,
    EnrichedParameterInfo,
    MergedTemplateParameter,
} from "./types";
