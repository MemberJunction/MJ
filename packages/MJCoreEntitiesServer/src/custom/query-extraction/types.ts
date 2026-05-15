import type { IMetadataProvider, IRunViewProvider, QueryInfo, UserInfo } from "@memberjunction/core";
import type { MJParameterInfo, MJParseResult, SQLSelectColumn, SQLTableReference } from "@memberjunction/sql-parser";

// ═══════════════════════════════════════════════════
// Shared types for the query extraction pipeline
// ═══════════════════════════════════════════════════

/**
 * A parameter extracted from a query's SQL — the final merged result
 * combining deterministic parsing, dependency metadata, and LLM enrichment.
 */
export interface ExtractedParameter {
    name: string;
    type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';
    isRequired: boolean;
    description: string;
    usage: string[];
    defaultValue: string | null;
    sampleValue: string | null;
}

/**
 * A field extracted from a query's SELECT clause.
 * May be enriched with deterministic SQL types from dependency query fields or entity metadata.
 */
export interface ExtractedField {
    name: string;
    dynamicName?: boolean;
    description: string;
    type: 'number' | 'string' | 'date' | 'boolean';
    optional: boolean;
    sourceEntity?: string | null;
    sourceFieldName?: string | null;
    isComputed?: boolean;
    isSummary?: boolean;
    computationDescription?: string;
    /** Deterministic SQL base type (e.g., "nvarchar", "int", "decimal") — takes priority over generic type mapping */
    sqlBaseType?: string | null;
    /** Deterministic SQL full type (e.g., "nvarchar(100)", "decimal(18,2)") — takes priority over generic type mapping */
    sqlFullType?: string | null;
}

/**
 * Result from LLM enrichment prompt.
 */
export interface ParameterExtractionResult {
    parameters: ExtractedParameter[];
    selectClause?: ExtractedField[];
}

/**
 * Metadata inherited from a dependency query's parameter for passthrough parameters.
 * Used as a fallback source for description and sampleValue when LLM enrichment is unavailable.
 */
export interface PassthroughParamContext {
    description: string | null;
    sampleValue: string | null;
    depQueryName: string;
    depParamName: string;
}

/**
 * A fully resolved composition reference. Produced once by the resolve stage,
 * then consumed by both dependency sync and passthrough parameter extraction.
 */
export interface ResolvedCompositionReference {
    depQuery: QueryInfo;
    referencePath: string;
    alias: string | null;
    parameterMapping: Record<string, string> | null;
    passthroughMappings: Array<{
        parentParamName: string;
        depParamName: string;
    }>;
}

/**
 * Typed entity metadata entry extracted from SQL table references.
 */
export interface EntityMetadataEntry {
    name: string;
    schemaName: string;
    baseView: string;
    fields: Array<{ name: string; type: string; isPrimaryKey: boolean }>;
}

/**
 * Result of the parse stage — computed once from the SQL, consumed by all downstream stages.
 */
export interface ParseResult {
    analysis: MJParseResult;
    deterministicParams: MJParameterInfo[];
    tableRefs: SQLTableReference[];
    selectColumns: SQLSelectColumn[];
}

/**
 * Result of the resolve stage — deterministic resolution of composition refs,
 * parameters, fields, and entity metadata.
 */
export interface ResolveResult {
    resolvedCompositionRefs: ResolvedCompositionReference[];
    allDeterministicParams: MJParameterInfo[];
    passthroughContext: Map<string, PassthroughParamContext>;
    entityMetadata: EntityMetadataEntry[];
    /** Fields resolved from the SQL — via SELECT * expansion against entity metadata, or parsed from explicit SELECT columns */
    resolvedFields: ExtractedField[] | null;
}

/**
 * Everything the pipeline stages need from the entity instance.
 * Decouples helpers from BaseEntity so they are stateless and testable.
 */
export interface QuerySyncContext {
    queryID: string;
    queryName: string;
    sql: string;
    isSaved: boolean;
    contextUser: UserInfo;
    metadataProvider: IMetadataProvider;
    runViewProvider: IRunViewProvider;
    /** Caller-provided tested parameter sample values (paramName → sampleValue).
     *  When present, these take highest priority over LLM-generated or heuristic sampleValues. */
    parameterHints?: Map<string, string>;
}
