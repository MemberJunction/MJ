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
// AI enrichment stage of the query extraction pipeline.
// Calls the enrichment prompt for parameter descriptions and
// merges the deterministic results with its output.
// ═══════════════════════════════════════════════════

/** The AI prompt matched by {@link QueryParameterEnricher.FindEnrichmentPrompt}. */
type EnrichmentPrompt = NonNullable<ReturnType<typeof AIEngine.Instance.Prompts.find>>;

/**
 * The enrichment stage of the query extraction pipeline, as static members: running the
 * enrichment prompt, merging its answer with the deterministic parse, and the heuristic fallbacks
 * (descriptions, sample values) used when no AI answer is available. The protected statics are the
 * steps a subclass can replace.
 */
export class QueryParameterEnricher {
    /** Name of the AI prompt that enriches query parameters. */
    protected static readonly PROMPT_NAME = 'SQL Query Parameter Extraction';
    /** Category of that prompt. */
    protected static readonly PROMPT_CATEGORY = 'MJ: System';

    /** A syntactically valid GUID that matches no row, so a query run with the sample is safe and returns zero rows. */
    protected static readonly EMPTY_GUID_SAMPLE = '00000000-0000-0000-0000-000000000000';

    /** Type description mapping for the deterministic heuristic fallback. */
    protected static readonly TYPE_DESCRIPTIONS: Readonly<Record<string, string>> = {
        'string': 'text value',
        'number': 'numeric value',
        'date': 'date value',
        'boolean': 'true/false flag',
        'array': 'list of values',
    };

    /**
     * Runs the AI enrichment prompt to get descriptions and sample values for parameters.
     * Returns null if the prompt is unavailable or fails (non-fatal).
     *
     * @param sql - The SQL query text to analyze
     * @param entityMetadata - Resolved entity metadata from the query's table references
     * @param contextUser - The current user context for AI engine configuration
     * @param metadataProvider - Provider for metadata operations
     */
    public static async RunAIEnrichment(
        sql: string,
        entityMetadata: EntityMetadataEntry[],
        contextUser: UserInfo,
        metadataProvider: IMetadataProvider,
    ): Promise<ParameterExtractionResult | null> {
        try {
            await AIEngine.Instance.Config(false, contextUser, metadataProvider);

            const aiPrompt = QueryParameterEnricher.FindEnrichmentPrompt();
            if (!aiPrompt) {
                return null;
            }

            return await QueryParameterEnricher.ExecuteEnrichmentPrompt(aiPrompt, sql, entityMetadata, contextUser);
        } catch (e) {
            console.warn('AI enrichment error, using heuristic descriptions:', e);
            return null;
        }
    }

    /**
     * Locates the AI prompt used for SQL parameter extraction enrichment.
     * Returns undefined if not found, with a console warning.
     */
    protected static FindEnrichmentPrompt(): EnrichmentPrompt | undefined {
        const aiPrompt = AIEngine.Instance.Prompts.find(
            p => p.Name === QueryParameterEnricher.PROMPT_NAME && p.Category === QueryParameterEnricher.PROMPT_CATEGORY,
        );

        if (!aiPrompt) {
            console.warn(`AI prompt for ${QueryParameterEnricher.PROMPT_NAME} not found. Descriptions will use heuristics.`);
        }

        return aiPrompt;
    }

    /**
     * Executes the enrichment prompt via AIPromptRunner and returns the parsed result.
     * Returns null if execution fails or produces no result.
     */
    protected static async ExecuteEnrichmentPrompt(
        aiPrompt: EnrichmentPrompt,
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
            console.warn('AI enrichment failed, using heuristic descriptions.');
            return null;
        }

        return result.result;
    }

    /**
     * Merges deterministic parameter extraction (SQLParser) with AI enrichment.
     *
     * Priority chain for description and sampleValue:
     *   1. AI enrichment (best quality when available)
     *   2. Inherited from dependency query parameter (for passthrough params)
     *   3. Heuristic fallback (generated from type/name)
     *
     * SQLParser is the authority for: name, type, isRequired, defaultValue.
     *
     * @param deterministicParams - Parameters extracted deterministically by SQLParser
     * @param aiResult - AI enrichment result, or null if unavailable
     * @param passthroughContext - Optional map of passthrough parameter context from dependency queries
     * @param parameterHints - Optional caller-provided sample values (paramName → sampleValue); they win over every other source
     */
    public static MergeParameters(
        deterministicParams: MJParameterInfo[],
        aiResult: ParameterExtractionResult | null,
        passthroughContext: Map<string, PassthroughParamContext> = new Map(),
        parameterHints: Map<string, string> = new Map(),
    ): ExtractedParameter[] {
        const aiParams = aiResult?.parameters || [];

        return deterministicParams.map(dp => QueryParameterEnricher.BuildMergedParameter(dp, aiParams, passthroughContext, parameterHints));
    }

    /**
     * Builds a single merged parameter from deterministic, AI, and passthrough sources.
     */
    protected static BuildMergedParameter(
        dp: MJParameterInfo,
        aiParams: ExtractedParameter[],
        passthroughContext: Map<string, PassthroughParamContext>,
        parameterHints: Map<string, string>,
    ): ExtractedParameter {
        const aiMatch = QueryParameterEnricher.FindAIMatch(dp.name, aiParams);
        const ptContext = passthroughContext.get(dp.name.toLowerCase());
        const hintValue = parameterHints.get(dp.name) || parameterHints.get(dp.name.toLowerCase());

        const inheritedDescription = ptContext
            ? QueryParameterEnricher.BuildPassthroughDescription(dp, ptContext)
            : null;

        // An empty AI answer (description, usage, type, sample) is no answer, so the next source in the chain
        // wins — exactly as for a missing one. `||` does that for the strings; `usage` is an array, and an empty
        // array is truthy, so it falls back on its length.
        return {
            name: dp.name,
            type: QueryParameterEnricher.ResolveParameterType(dp, aiMatch),
            isRequired: dp.isRequired,
            description: aiMatch?.description || inheritedDescription || QueryParameterEnricher.GenerateParameterDescription(dp),
            usage: aiMatch?.usage?.length ? aiMatch.usage : dp.usageLocations,
            DefaultValue: QueryParameterEnricher.ResolveDefaultValue(dp, aiMatch),
            SampleValue: hintValue || aiMatch?.SampleValue || ptContext?.SampleValue || QueryParameterEnricher.GenerateSampleValue(dp),
        };
    }

    /**
     * Finds the matching AI parameter by case-insensitive name comparison.
     */
    protected static FindAIMatch(
        paramName: string,
        aiParams: ExtractedParameter[],
    ): ExtractedParameter | undefined {
        const lowerName = paramName.toLowerCase();
        return aiParams.find(lp => lp.name.toLowerCase() === lowerName);
    }

    /**
     * Resolves the parameter type, falling back to AI or 'string' when deterministic type is unknown.
     */
    protected static ResolveParameterType(
        dp: MJParameterInfo,
        aiMatch: ExtractedParameter | undefined,
    ): ExtractedParameter['type'] {
        if (dp.type === 'unknown') {
            return aiMatch?.type || 'string';
        }
        return dp.type;
    }

    /**
     * Resolves the default value, preferring the deterministic value over AI.
     * For array-typed parameters, ensures the default is a valid JSON array string
     * so downstream consumers (e.g., queryParameterProcessor) can parse it safely.
     */
    protected static ResolveDefaultValue(
        dp: MJParameterInfo,
        aiMatch: ExtractedParameter | undefined,
    ): string | null {
        const raw = dp.defaultValue !== null
            ? String(dp.defaultValue)
            // ?? on purpose: '' is a real default value (an empty-string default); only a missing one becomes null.
            : (aiMatch?.DefaultValue ?? null);

        if (raw === null) return null;

        return QueryParameterEnricher.NormalizeDefaultForType(raw, dp.type === 'unknown' ? (aiMatch?.type || 'string') : dp.type);
    }

    /**
     * Normalizes a raw default value string based on the parameter type.
     * For array types, ensures the value is a valid JSON array string.
     * Plain strings like "Attended" become '["Attended"]'; already-valid
     * JSON arrays like '["a","b"]' pass through unchanged.
     */
    public static NormalizeDefaultForType(
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
     * Generates a deterministic description for a parameter when no AI answer is available.
     * Uses the parameter name, type, and default value to create a meaningful description.
     *
     * @param param - The deterministic parameter info from SQLParser
     */
    public static GenerateParameterDescription(param: MJParameterInfo): string {
        const typeDesc = QueryParameterEnricher.TYPE_DESCRIPTIONS[param.type] || 'value';
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
    public static BuildPassthroughDescription(
        param: MJParameterInfo,
        context: PassthroughParamContext,
    ): string {
        const suffix = ` (passed through to "${context.DepQueryName}" as "${context.DepParamName}")`;

        if (context.Description) {
            return `${context.Description}${suffix}`;
        }

        return `${QueryParameterEnricher.GenerateParameterDescription(param)}${suffix}`;
    }

    /**
     * True when a parameter name reads as a primary/foreign key, i.e. a string parameter that carries a
     * GUID. The trailing "ID" must be its own word, so words that merely end in the letters (Valid,
     * VALID, PAID, paid) are not keys:
     *   - the whole name is `ID` in any case (`ID`, `Id`, `id`);
     *   - PascalCase/camelCase: `ID` or `Id` right after a lowercase letter or digit (`ActivityID`,
     *     `userId`, `Step2Id`);
     *   - snake_case in any case: `_id` / `_ID` / `_Id` (`user_id`, `USER_ID`).
     * An all-caps name without a separator (`USERID`) cannot be told apart from an all-caps word that
     * ends in those letters (`PAID`, `VALID`), so it keeps the generic sample.
     * GUID and UUID names also carry GUIDs: the whole name `GUID`/`UUID` in any case, a name ending in
     * `GUID`/`Guid`/`UUID`/`Uuid` (`RecordGUID`, `userUuid`), and `_guid`/`_uuid` suffixes in any case.
     */
    public static IsIdentifierParameterName(name: string): boolean {
        return /^id$/i.test(name) || /[a-z0-9]I[Dd]$/.test(name) || /_id$/i.test(name)
            || /^(guid|uuid)$/i.test(name) || /(GUID|Guid|UUID|Uuid)$/.test(name) || /_(guid|uuid)$/i.test(name);
    }

    /**
     * Generates a deterministic sample value based on the parameter type.
     * Uses the default value if available, otherwise generates a type-appropriate example.
     *
     * @param param - The deterministic parameter info from SQLParser
     */
    public static GenerateSampleValue(param: MJParameterInfo): string | null {
        if (param.defaultValue !== null) {
            return String(param.defaultValue);
        }

        switch (param.type) {
            case 'string': return QueryParameterEnricher.IsIdentifierParameterName(param.name) ? QueryParameterEnricher.EMPTY_GUID_SAMPLE : 'Example';
            case 'number': return '10';
            case 'date': return '2024-01-01';
            case 'boolean': return 'true';
            case 'array': return 'Value1,Value2';
            default: return null;
        }
    }
}
