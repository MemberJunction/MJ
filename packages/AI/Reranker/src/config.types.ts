/**
 * @fileoverview Configuration types for the AI Reranker Service.
 *
 * These types define the agent-level configuration for reranking behavior,
 * stored as JSON in the AIAgent.RerankerConfiguration column.
 *
 * @module @memberjunction/ai-reranker
 * @since 3.0.0
 */

/**
 * Configuration for agent reranking behavior.
 * Stored as JSON in AIAgent.RerankerConfiguration column.
 * When null or disabled, vector search results are used directly without reranking.
 */
export interface RerankerConfiguration {
    /**
     * Master switch for reranking. When false, reranking is disabled.
     */
    enabled: boolean;

    /**
     * ID of the AIModel with type='Reranker' to use for reranking.
     */
    rerankerModelId: string;

    /**
     * Multiplier for initial retrieval count.
     * If agent wants N notes, fetch N * retrievalMultiplier candidates, then rerank to top N.
     * Default: 3
     */
    retrievalMultiplier: number;

    /**
     * Minimum relevance score (0.0-1.0) for reranked results to be included.
     * Results below this threshold are filtered out.
     * Default: 0.5
     */
    minRelevanceThreshold: number;

    /**
     * Optional: AIPrompt ID for prompt-backed reranking.
     * Only used when the reranker's DriverClass is 'LLMReranker' (the chat prompt it runs) or
     * 'DecisionReranker' (the decision prompt it asks, 'Default Decision' otherwise).
     */
    rerankPromptID?: string;

    /**
     * Optional: Additional entity fields to include when building rerank document context.
     * Example: ['Keywords', 'Type'] to include note type and keywords in ranking context.
     */
    contextFields?: string[];

    /**
     * Whether to fallback to original vector search results when reranker fails.
     * When true: on error, returns unranked vector search results.
     * When false: on error, throws an exception.
     * Default: true
     */
    fallbackOnError: boolean;

    /**
     * Optional: whether examples get a reranking stage too.
     * When true, example retrieval fetches maxExamples * retrievalMultiplier candidates and reranks
     * them with the same reranker, threshold and fallbackOnError as notes.
     * When absent or false, examples use vector search results directly.
     * Default: false
     */
    // case-violation-ok-legacy-back-compat: a key of the camelCase JSON stored in AIAgent.RerankerConfiguration
    rerankExamples?: boolean;

    /**
     * Optional: the time budget, in milliseconds, for a DecisionReranker's decision calls, all together.
     * When it runs out the calls are aborted and the rerank fails, so the caller falls back as
     * fallbackOnError says. Other rerankers ignore it.
     * Default: 15000 (DEFAULT_DECISION_RERANK_TIMEOUT_MS)
     */
    // case-violation-ok-legacy-back-compat: a key of the camelCase JSON stored in AIAgent.RerankerConfiguration
    decisionTimeoutMS?: number;
}

/**
 * Parse and validate RerankerConfiguration from JSON string.
 * Returns null if config is null, empty, or has enabled=false.
 * Applies default values for optional fields.
 *
 * @param configJson - JSON string from AIAgent.RerankerConfiguration
 * @returns Parsed configuration with defaults applied, or null if disabled/invalid
 */
export function ParseRerankerConfiguration(configJson: string | null | undefined): RerankerConfiguration | null {
    if (!configJson || configJson.trim().length === 0) {
        return null;
    }

    try {
        const parsed = JSON.parse(configJson) as Partial<RerankerConfiguration>;

        // If explicitly disabled, return null
        if (parsed.enabled === false) {
            return null;
        }

        // Validate required field
        if (!parsed.rerankerModelId) {
            return null;
        }

        // Return with defaults applied
        return {
            enabled: true,
            rerankerModelId: parsed.rerankerModelId,
            retrievalMultiplier: parsed.retrievalMultiplier ?? 3,
            minRelevanceThreshold: parsed.minRelevanceThreshold ?? 0.5,
            rerankPromptID: parsed.rerankPromptID,
            contextFields: parsed.contextFields ?? [],
            fallbackOnError: parsed.fallbackOnError ?? true,
            rerankExamples: parsed.rerankExamples,
            decisionTimeoutMS: parsed.decisionTimeoutMS
        };
    } catch {
        return null;
    }
}

/** @deprecated Use {@link ParseRerankerConfiguration}. */
export function parseRerankerConfiguration(configJson: string | null | undefined): RerankerConfiguration | null {
    return ParseRerankerConfiguration(configJson);
}
