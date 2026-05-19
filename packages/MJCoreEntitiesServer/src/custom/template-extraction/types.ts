// ═══════════════════════════════════════════════════
// Shared types for the template parameter extraction pipeline
// ═══════════════════════════════════════════════════

/**
 * Valid template parameter types, matching the database constraint values
 * on the MJ: Template Params entity.
 */
export type TemplateParamType = 'Scalar' | 'Array' | 'Object' | 'Record' | 'Entity';

/**
 * A property accessed on a template parameter via dot notation.
 * Built up by the AST walker as it encounters `{{ param.prop }}` patterns.
 */
export interface PropertyAccess {
    /** Property name (e.g., "name" from `{{ user.name }}`) */
    name: string;
    /** Inferred type of this property from usage context */
    type: TemplateParamType;
    /** Whether this property is accessed only inside a conditional guard */
    optional: boolean;
    /** Nested properties, built up from deeper access patterns like `{{ user.address.city }}` */
    children: PropertyAccess[];
}

/**
 * A template parameter deterministically extracted from the Nunjucks AST.
 */
export interface DeterministicParameter {
    /** Parameter name as it appears in the template (e.g., "userName", "entityMetadata") */
    name: string;
    /** Inferred type based on how the parameter is used in the template */
    type: TemplateParamType;
    /** Whether the parameter is required (used outside any conditional guard) */
    isRequired: boolean;
    /**
     * Default value detected from `| default('value')` filter or `param or 'fallback'` pattern.
     * Null if no default was detected.
     */
    defaultValue: string | null;
    /**
     * Whether this is a system-provided variable (name starts with underscore).
     * System variables like `_CURRENT_DATE_AND_TIME` are injected by the runtime,
     * not supplied by the caller.
     */
    isSystemVariable: boolean;
    /**
     * All Nunjucks filters applied to this parameter (e.g., ["safe", "json", "join"]).
     * Useful for understanding how the parameter value is used.
     */
    appliedFilters: string[];
    /**
     * Top-level properties accessed on this parameter.
     * Only populated when the parameter is used as an Object or Array of Objects.
     */
    properties: PropertyAccess[];
    /**
     * All usage locations in the template text, described as line/col pairs.
     */
    usages: ParameterUsage[];
}

/**
 * Records where in the template a parameter is referenced.
 */
export interface ParameterUsage {
    line: number;
    col: number;
    /** The full access path at this usage point (e.g., "user.address.city") */
    accessPath: string;
    /** Whether this usage is inside a conditional block that guards on the parameter */
    isConditional: boolean;
}

/**
 * Result of the deterministic parse stage.
 */
export interface ParseResult {
    /** All parameters extracted from the template AST */
    parameters: DeterministicParameter[];
    /** Any parse errors or warnings encountered */
    warnings: string[];
}

/**
 * Result from the AI enrichment stage — descriptions and refined metadata.
 */
export interface EnrichmentResult {
    parameters: EnrichedParameterInfo[];
}

/**
 * AI-generated enrichment data for a single parameter.
 */
export interface EnrichedParameterInfo {
    name: string;
    description: string;
}

/**
 * Final merged parameter combining deterministic extraction with AI enrichment.
 * This is what gets synced to the MJ: Template Params entity.
 */
export interface MergedTemplateParameter {
    name: string;
    type: TemplateParamType;
    isRequired: boolean;
    defaultValue: string | null;
    description: string;
    isSystemVariable: boolean;
}
