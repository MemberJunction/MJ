import type { IMetadataProvider, IRunViewProvider, UserInfo, DatabasePlatform } from "@memberjunction/core";
import type { MJQueryEntityExtended } from "@memberjunction/core-entities";
import type { MJParameterInfo, MJParseResult, SQLSelectColumn, SQLTableReference } from "@memberjunction/sql-parser";

// ═══════════════════════════════════════════════════
// Shared types for the query extraction pipeline
// ═══════════════════════════════════════════════════

/**
 * A parameter extracted from a query's SQL — the final merged result
 * combining deterministic parsing, dependency metadata, and LLM enrichment.
 */
export interface ExtractedParameter {
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    type: 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    isRequired: boolean;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    description: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    usage: string[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    DefaultValue: string | null;
    SampleValue: string | null;
}

/**
 * A field extracted from a query's SELECT clause.
 * May be enriched with deterministic SQL types from dependency query fields or entity metadata.
 */
export interface ExtractedField {
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    dynamicName?: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    description: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    type: 'number' | 'string' | 'date' | 'boolean';  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    optional: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    sourceEntity?: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    sourceFieldName?: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    isComputed?: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    isSummary?: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    computationDescription?: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Deterministic SQL base type (e.g., "nvarchar", "int", "decimal") — takes priority over generic type mapping */
    sqlBaseType?: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Deterministic SQL full type (e.g., "nvarchar(100)", "decimal(18,2)") — takes priority over generic type mapping */
    sqlFullType?: string | null;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}

/**
 * Result from LLM enrichment prompt.
 */
export interface ParameterExtractionResult {
    parameters: ExtractedParameter[];  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    selectClause?: ExtractedField[];  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

/**
 * Metadata inherited from a dependency query's parameter for passthrough parameters.
 * Used as a fallback source for description and sampleValue when LLM enrichment is unavailable.
 */
export interface PassthroughParamContext {
    Description: string | null;
    SampleValue: string | null;
    DepQueryName: string;
    DepParamName: string;
}

/**
 * A fully resolved composition reference. Produced once by the resolve stage,
 * then consumed by both dependency sync and passthrough parameter extraction.
 */
export interface ResolvedCompositionReference {
    DepQuery: MJQueryEntityExtended;
    ReferencePath: string;
    Alias: string | null;
    ParameterMapping: Record<string, string> | null;
    PassthroughMappings: Array<{
        parentParamName: string;
        depParamName: string;
    }>;
}

/**
 * Typed entity metadata entry extracted from SQL table references.
 */
export interface EntityMetadataEntry {
    name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    SchemaName: string;
    BaseView: string;
    Fields: Array<{ name: string; type: string; isPrimaryKey: boolean }>;
}

/**
 * Result of the parse stage — computed once from the SQL, consumed by all downstream stages.
 */
export interface ParseResult {
    Analysis: MJParseResult;
    DeterministicParams: MJParameterInfo[];
    TableRefs: SQLTableReference[];
    SelectColumns: SQLSelectColumn[];
}

/**
 * Result of the resolve stage — deterministic resolution of composition refs,
 * parameters, fields, and entity metadata.
 */
export interface ResolveResult {
    ResolvedCompositionRefs: ResolvedCompositionReference[];
    AllDeterministicParams: MJParameterInfo[];
    PassthroughContext: Map<string, PassthroughParamContext>;
    EntityMetadata: EntityMetadataEntry[];
    /** Fields resolved from the SQL — via SELECT * expansion against entity metadata, or parsed from explicit SELECT columns */
    ResolvedFields: ExtractedField[] | null;
}

/**
 * Everything the pipeline stages need from the entity instance.
 * Decouples helpers from BaseEntity so they are stateless and testable.
 */
export interface QuerySyncContext {
    queryID: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    queryName: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** The SQL to extract from — resolved for the current platform (from QuerySQLs or base SQL). */
    sql: string;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    isSaved: boolean;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    contextUser: UserInfo;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    metadataProvider: IMetadataProvider;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    runViewProvider: IRunViewProvider;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** The database platform of the connected database. Determines which SQL dialect
     *  is used for parsing and which SQL types are used for field extraction. */
    platform: DatabasePlatform;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
    /** Caller-provided tested parameter sample values (paramName → sampleValue).
     *  When present, these take highest priority over LLM-generated or heuristic sampleValues. */
    parameterHints?: Map<string, string>;  // case-violation-ok-legacy-back-compat: renaming it broke a use the checker could not see from the declaration — the compile proved it
}
