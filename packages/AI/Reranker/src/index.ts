/**
 * @memberjunction/ai-reranker
 *
 * AI Reranker Service for MemberJunction's two-stage retrieval system.
 * Provides centralized reranker management and LLM-based reranking capabilities.
 *
 * Key Components:
 * - RerankerService: Singleton service for managing reranker instances
 * - LLMReranker: LLM-based reranker using AI Prompts system
 * - DecisionReranker: Decision-based reranker, one Likelihood question per document
 * - RerankerConfiguration: Configuration types for agent-level settings
 *
 * Usage:
 * ```typescript
 * import {
 *     RerankerService,
 *     RerankerConfiguration,
 *     parseRerankerConfiguration
 * } from '@memberjunction/ai-reranker';
 *
 * // Parse configuration from agent
 * const config = parseRerankerConfiguration(agent.RerankerConfiguration);
 *
 * // Rerank notes if enabled
 * if (config?.enabled) {
 *     const result = await RerankerService.Instance.rerankNotes(
 *         vectorSearchResults,
 *         userQuery,
 *         config,
 *         contextUser
 *     );
 * }
 * ```
 *
 * @module @memberjunction/ai-reranker
 * @since 3.0.0
 */

// Configuration types
export {
    RerankerConfiguration,
    ParseRerankerConfiguration, parseRerankerConfiguration
} from './config.types';

// Service
export {
    RerankerService,
    RerankServiceResult,
    RerankObservabilityOptions
} from './RerankerService';

// LLM Reranker
export {
    LLMReranker,
    CreateLLMReranker, createLLMReranker
} from './LLMReranker';

// Decision Reranker
export { DecisionReranker, DEFAULT_DECISION_RERANK_TIMEOUT_MS, DEFAULT_DECISION_RERANK_DOCUMENTS_PER_CALL } from './DecisionReranker';
export type { DecisionRerankOptions } from './DecisionReranker';

// Runner
export { AIRerankerRunner } from './AIRerankerRunner';
export type { AIRerankParams, AIRerankRunResult } from './rerank-runner.types';
