/**
 * @fileoverview The rule for which reranker drivers are prompt-backed, shared by the two places that
 * build reranker drivers: `RerankerService.GetReranker` and `AIRerankerRunner`.
 *
 * @module @memberjunction/ai-reranker
 */

/**
 * The prompt-backed reranker drivers: `LLMReranker`, which asks a chat prompt to score the documents,
 * and `DecisionReranker`, which asks a decision prompt one Likelihood question per document.
 */
const PROMPT_BACKED_RERANKER_DRIVERS: ReadonlySet<string> = new Set(['LLMReranker', 'DecisionReranker']);

/**
 * Whether a reranker driver is prompt-backed. A prompt-backed driver runs an MJ prompt, so it is built
 * with the prompt's ID and the context user, and it needs no API key of its own: the prompt's models
 * resolve their own credentials.
 *
 * @param driverClass - The driver class of a reranker model's vendor row
 * @returns True for `LLMReranker` and `DecisionReranker`
 */
export function IsPromptBackedReranker(driverClass: string | null | undefined): boolean {
    return driverClass != null && PROMPT_BACKED_RERANKER_DRIVERS.has(driverClass);
}
