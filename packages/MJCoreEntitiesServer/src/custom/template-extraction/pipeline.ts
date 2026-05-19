// ═══════════════════════════════════════════════════
// Template parameter extraction pipeline.
//
// Orchestrates:
//   1. PARSE  — deterministic AST extraction (parser.ts)
//   2. ENRICH — AI fills in descriptions (best-effort, non-fatal)
//   3. MERGE  — deterministic wins, AI fills gaps
//
// Produces MergedTemplateParameter[] ready for database sync.
// ═══════════════════════════════════════════════════

import { LogError, UserInfo } from "@memberjunction/core";
import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import { ParseTemplateParameters } from "./parser";
import type {
    DeterministicParameter,
    EnrichedParameterInfo,
    EnrichmentResult,
    MergedTemplateParameter,
    TemplateParamType,
} from "./types";

/**
 * Runs the full template parameter extraction pipeline:
 *   1. PARSE  — deterministic Nunjucks AST analysis
 *   2. ENRICH — AI generates descriptions (best-effort)
 *   3. MERGE  — combine deterministic + AI results
 *
 * @param templateText  The raw Nunjucks template content
 * @param templateName  The template name (used for self-extraction skip)
 * @param contextUser   Server-side user context
 * @returns Array of merged parameters ready for sync, plus any parse warnings
 */
export async function RunTemplateExtractionPipeline(
    templateText: string,
    templateName: string,
    contextUser: UserInfo,
): Promise<TemplateExtractionResult> {
    // ── STAGE 1: PARSE ──
    const parseResult = ParseTemplateParameters(templateText);

    if (parseResult.parameters.length === 0) {
        return {
            parameters: [],
            warnings: parseResult.warnings,
        };
    }

    // Filter out system variables for the enrichment step — they get standard descriptions
    const userParams = parseResult.parameters.filter(p => !p.isSystemVariable);
    const systemParams = parseResult.parameters.filter(p => p.isSystemVariable);

    // ── STAGE 2: ENRICH (best-effort, non-fatal) ──
    let enrichedDescriptions: Map<string, string> = new Map();

    if (userParams.length > 0) {
        enrichedDescriptions = await runAIEnrichment(
            templateText,
            userParams,
            templateName,
            contextUser,
        );
    }

    // ── STAGE 3: MERGE ──
    const mergedParams = mergeResults(parseResult.parameters, enrichedDescriptions);

    return {
        parameters: mergedParams,
        warnings: parseResult.warnings,
    };
}

/**
 * Result of the full extraction pipeline.
 */
export interface TemplateExtractionResult {
    parameters: MergedTemplateParameter[];
    warnings: string[];
}

// ─── Stage 2: AI Enrichment ──────────────────────────────────────────────────

/**
 * Call the "Template Parameter Extraction" AI prompt to generate descriptions.
 * Unlike the old approach, we give the AI the already-extracted parameter list
 * and ask ONLY for descriptions — not for parameter discovery.
 *
 * Non-fatal: returns an empty map on any failure.
 */
async function runAIEnrichment(
    templateText: string,
    parameters: DeterministicParameter[],
    templateName: string,
    contextUser: UserInfo,
): Promise<Map<string, string>> {
    const descriptions = new Map<string, string>();

    try {
        // Skip self-extraction to avoid infinite loop
        if (templateName === "Template Parameter Extraction") {
            return descriptions;
        }

        await AIEngine.Instance.Config(false, contextUser);

        const aiPrompt = AIEngine.Instance.Prompts.find(p =>
            p.Name === 'Template Parameter Extraction' &&
            p.Category === 'MJ: System'
        );

        if (!aiPrompt) {
            console.warn('AI prompt for Template Parameter Extraction not found. Skipping AI enrichment.');
            return descriptions;
        }

        // Build a summary of what we found deterministically, so the AI
        // can generate descriptions without needing to re-discover params
        const paramSummary = parameters.map(p => ({
            name: p.name,
            type: p.type,
            isRequired: p.isRequired,
            defaultValue: p.defaultValue,
            properties: summarizeProperties(p.properties),
        }));

        const promptData = {
            templateText,
            extractedParameters: paramSummary,
        };

        const promptRunner = new AIPromptRunner();
        const params = new AIPromptParams();
        params.prompt = aiPrompt;
        params.data = promptData;
        params.contextUser = contextUser;

        const result = await promptRunner.ExecutePrompt<EnrichmentResult>(params);

        if (result.success && result.result?.parameters) {
            for (const enriched of result.result.parameters) {
                if (enriched.name && enriched.description) {
                    descriptions.set(enriched.name.toLowerCase(), enriched.description);
                }
            }
        }
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        LogError(`Template parameter AI enrichment failed: ${msg}`);
        // Non-fatal — deterministic results are still valid
    }

    return descriptions;
}

/**
 * Build a concise summary of property access for AI context.
 */
function summarizeProperties(
    props: import("./types").PropertyAccess[]
): string[] {
    const result: string[] = [];
    function walk(items: import("./types").PropertyAccess[], prefix: string): void {
        for (const p of items) {
            const fullPath = prefix ? `${prefix}.${p.name}` : p.name;
            result.push(fullPath);
            walk(p.children, fullPath);
        }
    }
    walk(props, '');
    return result;
}

// ─── Stage 3: Merge ──────────────────────────────────────────────────────────

/**
 * Merge deterministic parse results with AI-generated descriptions.
 * Deterministic data always wins for type, required-ness, and default values.
 * AI provides descriptions only.
 */
function mergeResults(
    deterministicParams: DeterministicParameter[],
    aiDescriptions: Map<string, string>,
): MergedTemplateParameter[] {
    return deterministicParams.map(p => ({
        name: p.name,
        type: p.type,
        isRequired: p.isRequired,
        defaultValue: p.defaultValue,
        description: aiDescriptions.get(p.name.toLowerCase()) ?? generateFallbackDescription(p),
        isSystemVariable: p.isSystemVariable,
    }));
}

/**
 * Generate a basic fallback description when AI enrichment is unavailable.
 */
function generateFallbackDescription(param: DeterministicParameter): string {
    if (param.isSystemVariable) {
        return generateSystemVarDescription(param.name);
    }

    const typeLabel = typeDescriptionMap[param.type] ?? 'value';
    const filterHints = param.appliedFilters.length > 0
        ? ` (formatted with: ${param.appliedFilters.join(', ')})`
        : '';

    return `Template ${typeLabel} parameter '${param.name}'${filterHints}`;
}

/**
 * Generate descriptions for well-known system variables.
 */
function generateSystemVarDescription(name: string): string {
    const known = KNOWN_SYSTEM_VARS[name];
    if (known) return known;
    return `System-provided variable '${name}'`;
}

const KNOWN_SYSTEM_VARS: Record<string, string> = {
    _CURRENT_DATE_AND_TIME: 'System-provided current date and time',
    _CURRENT_DATE: 'System-provided current date',
    _CURRENT_TIME: 'System-provided current time',
    _CURRENT_DAY_OF_WEEK: 'System-provided current day of the week',
    _USER_NAME: 'System-provided current user name',
    _ORGANIZATION_NAME: 'System-provided organization name',
    _AGENT_TYPE_SYSTEM_PROMPT: 'System-provided agent type system prompt',
    _OUTPUT_EXAMPLE: 'System-provided expected output format example',
    _CURRENT_PAYLOAD: 'System-provided current state payload data',
    _SCRATCHPAD_NOTES: 'System-provided scratchpad notes content',
    _SCRATCHPAD_TASKS: 'System-provided scratchpad tasks list',
    _SCRATCHPAD_TASK_SUMMARY: 'System-provided scratchpad task summary',
};

const typeDescriptionMap: Record<TemplateParamType, string> = {
    Scalar: 'scalar',
    Array: 'array',
    Object: 'object',
    Record: 'record',
    Entity: 'entity',
};
