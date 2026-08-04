import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import type { IMetadataProvider, UserInfo } from "@memberjunction/core";
import type { MJParameterInfo } from "@memberjunction/sql-parser";
import type {
    EntityMetadataEntry,
    ExtractedParameter,
    ParameterExtractionResult,
    PassthroughParamContext,
} from "./types";

// ═══════════════════════════════════════════════════
// LLM enrichment stage of the query extraction pipeline.
// Handles calling the LLM for parameter descriptions and
// merging deterministic results with LLM output.
// ═══════════════════════════════════════════════════

const PROMPT_NAME = 'SQL Query Parameter Extraction';
const PROMPT_CATEGORY = 'MJ: System';

/**
 * Type description mapping for deterministic heuristic fallback.
 */
const TypeDescriptions: Record<string, string> = {
    'string': 'text value',
    'number': 'numeric value',
    'date': 'date value',
    'boolean': 'true/false flag',
    'array': 'list of values',
};

/**
 * Runs the LLM enrichment prompt to get descriptions and sample values for parameters.
 * Returns null if the LLM is unavailable or fails (non-fatal).
 *
 * @param sql - The SQL query text to analyze
 * @param entityMetadata - Resolved entity metadata from the query's table references
 * @param contextUser - The current user context for AI engine configuration
 * @param metadataProvider - Provider for metadata operations
 */
export async function RunLLMEnrichment(
    sql: string,
    entityMetadata: EntityMetadataEntry[],
    contextUser: UserInfo,
    metadataProvider: IMetadataProvider,
): Promise<ParameterExtractionResult | null> {
    try {
        await AIEngine.Instance.Config(false, contextUser, metadataProvider);

        const aiPrompt = FindEnrichmentPrompt();
        if (!aiPrompt) {
            return null;
        }

        return await ExecuteEnrichmentPrompt(aiPrompt, sql, entityMetadata, contextUser);
    } catch (e) {
        console.warn('LLM enrichment error, using heuristic descriptions:', e);
        return null;
    }
}

/**
 * Locates the AI prompt used for SQL parameter extraction enrichment.
 * Returns undefined if not found, with a console warning.
 */
function FindEnrichmentPrompt(): ReturnType<typeof AIEngine.Instance.Prompts.find> {
    const aiPrompt = AIEngine.Instance.Prompts.find(
        p => p.Name === PROMPT_NAME && p.Category === PROMPT_CATEGORY,
    );

    if (!aiPrompt) {
        console.warn(`AI prompt for ${PROMPT_NAME} not found. Descriptions will use heuristics.`);
    }

    return aiPrompt;
}

/**
 * Executes the enrichment prompt via AIPromptRunner and returns the parsed result.
 * Returns null if execution fails or produces no result.
 */
async function ExecuteEnrichmentPrompt(
    aiPrompt: NonNullable<ReturnType<typeof FindEnrichmentPrompt>>,
    sql: string,
    entityMetadata: EntityMetadataEntry[],
    contextUser: UserInfo,
): Promise<ParameterExtractionResult | null> {
    const promptRunner = new AIPromptRunner();
    const params = new AIPromptParams();
    params.prompt = aiPrompt;
    params.data = { templateText: sql, entities: entityMetadata };
    params.contextUser = contextUser;

    const result = await promptRunner.ExecutePrompt<ParameterExtractionResult>(params);

    if (!result.success || !result.result) {
        console.warn('LLM enrichment failed, using heuristic descriptions.');
        return null;
    }

    return result.result;
}

/**
 * Merges deterministic parameter extraction (SQLParser) with LLM enrichment.
 *
 * Priority chain for description and sampleValue:
 *   1. LLM enrichment (best quality when available)
 *   2. Inherited from dependency query parameter (for passthrough params)
 *   3. Heuristic fallback (generated from type/name)
 *
 * SQLParser is the authority for: name, type, isRequired, defaultValue.
 *
 * @param deterministicParams - Parameters extracted deterministically by SQLParser
 * @param llmResult - LLM enrichment result, or null if unavailable
 * @param passthroughContext - Optional map of passthrough parameter context from dependency queries
 */
export function MergeParametersWithLLM(
    deterministicParams: MJParameterInfo[],
    llmResult: ParameterExtractionResult | null,
    passthroughContext: Map<string, PassthroughParamContext> = new Map(),
    parameterHints: Map<string, string> = new Map(),
): ExtractedParameter[] {
    const llmParams = llmResult?.parameters ?? [];

    return deterministicParams.map(dp => BuildMergedParameter(dp, llmParams, passthroughContext, parameterHints));
}

/**
 * Builds a single merged parameter from deterministic, LLM, and passthrough sources.
 */
function BuildMergedParameter(
    dp: MJParameterInfo,
    llmParams: ExtractedParameter[],
    passthroughContext: Map<string, PassthroughParamContext>,
    parameterHints: Map<string, string>,
): ExtractedParameter {
    const llmMatch = FindLLMMatch(dp.name, llmParams);
    const ptContext = passthroughContext.get(dp.name.toLowerCase());
    const hintValue = parameterHints.get(dp.name) ?? parameterHints.get(dp.name.toLowerCase());

    const inheritedDescription = ptContext
        ? BuildPassthroughDescription(dp, ptContext)
        : null;

    return {
        name: dp.name,
        type: ResolveParameterType(dp, llmMatch),
        isRequired: dp.isRequired,
        description: llmMatch?.description ?? inheritedDescription ?? GenerateParameterDescription(dp),
        usage: llmMatch?.usage ?? dp.usageLocations,
        defaultValue: ResolveDefaultValue(dp, llmMatch),
        sampleValue: hintValue ?? llmMatch?.sampleValue ?? ptContext?.sampleValue ?? GenerateSampleValue(dp),
    };
}

/**
 * Finds the matching LLM parameter by case-insensitive name comparison.
 */
function FindLLMMatch(
    paramName: string,
    llmParams: ExtractedParameter[],
): ExtractedParameter | undefined {
    const lowerName = paramName.toLowerCase();
    return llmParams.find(lp => lp.name.toLowerCase() === lowerName);
}

/**
 * Resolves the parameter type, falling back to LLM or 'string' when deterministic type is unknown.
 */
function ResolveParameterType(
    dp: MJParameterInfo,
    llmMatch: ExtractedParameter | undefined,
): ExtractedParameter['type'] {
    if (dp.type === 'unknown') {
        return llmMatch?.type ?? 'string';
    }
    return dp.type;
}

/**
 * Resolves the default value, preferring the deterministic value over LLM.
 * For array-typed parameters, ensures the default is a valid JSON array string
 * so downstream consumers (e.g., queryParameterProcessor) can parse it safely.
 */
function ResolveDefaultValue(
    dp: MJParameterInfo,
    llmMatch: ExtractedParameter | undefined,
): string | null {
    const raw = dp.defaultValue !== null
        ? String(dp.defaultValue)
        : (llmMatch?.defaultValue ?? null);

    if (raw === null) return null;

    return NormalizeDefaultForType(raw, dp.type === 'unknown' ? (llmMatch?.type ?? 'string') : dp.type);
}

/**
 * Normalizes a raw default value string based on the parameter type.
 * For array types, ensures the value is a valid JSON array string.
 * Plain strings like "Attended" become '["Attended"]'; already-valid
 * JSON arrays like '["a","b"]' pass through unchanged.
 */
export function NormalizeDefaultForType(
    rawDefault: string,
    paramType: string,
): string {
    if (paramType !== 'array') return rawDefault;

    // Already a valid JSON array? Pass through.
    try {
        const parsed = JSON.parse(rawDefault);
        if (Array.isArray(parsed)) return rawDefault;
        // Parsed to a non-array (e.g., a number or string) — wrap it
        return JSON.stringify([parsed]);
    } catch {
        // Not valid JSON (e.g., "Attended") — wrap as single-element array
        return JSON.stringify([rawDefault]);
    }
}

/**
 * Generates a deterministic description for a parameter when LLM is unavailable.
 * Uses the parameter name, type, and default value to create a meaningful description.
 *
 * @param param - The deterministic parameter info from SQLParser
 */
export function GenerateParameterDescription(param: MJParameterInfo): string {
    const typeDesc = TypeDescriptions[param.type] || 'value';
    const requiredDesc = param.isRequired ? 'Required' : 'Optional';
    const humanName = param.name.replace(/([A-Z])/g, ' $1').trim();
    const defaultDesc = param.defaultValue !== null ? ` (default: ${param.defaultValue})` : '';

    return `${requiredDesc} ${typeDesc} for ${humanName}${defaultDesc}`;
}

/**
 * Builds a description for a passthrough parameter by inheriting from the dependency
 * query's parameter description and adding composition context.
 *
 * @param param - The deterministic parameter info from SQLParser
 * @param context - Passthrough context inherited from the dependency query
 */
export function BuildPassthroughDescription(
    param: MJParameterInfo,
    context: PassthroughParamContext,
): string {
    const suffix = ` (passed through to "${context.depQueryName}" as "${context.depParamName}")`;

    if (context.description) {
        return `${context.description}${suffix}`;
    }

    return `${GenerateParameterDescription(param)}${suffix}`;
}

/**
 * Generates a deterministic sample value based on the parameter type.
 * Uses the default value if available, otherwise generates a type-appropriate example.
 *
 * @param param - The deterministic parameter info from SQLParser
 */
export function GenerateSampleValue(param: MJParameterInfo): string | null {
    if (param.defaultValue !== null) {
        return String(param.defaultValue);
    }

    switch (param.type) {
        case 'string': return 'Example';
        case 'number': return '10';
        case 'date': return '2024-01-01';
        case 'boolean': return 'true';
        case 'array': return 'Value1,Value2';
        default: return null;
    }
}
