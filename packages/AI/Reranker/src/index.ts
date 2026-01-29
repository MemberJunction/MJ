/**
 * @memberjunction/ai-reranker
 *
 * AI Reranker Service for MemberJunction's two-stage retrieval system.
 * Provides centralized reranker management and LLM-based reranking capabilities.
 *
 * Key Components:
 * - RerankerService: Singleton service for managing reranker instances
 * - LLMReranker: LLM-based reranker using AI Prompts system
 * - RerankerConfiguration: Configuration types for agent-level settings
 *
 * Usage:
 * ```typescript
 * import {
 *     RerankerService,
 *     RerankerConfiguration,
 *     parseRerankerConfiguration,
 *     LoadLLMReranker
 * } from '@memberjunction/ai-reranker';
 *
 * // Ensure LLM reranker is loaded
 * LoadLLMReranker();
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
    parseRerankerConfiguration
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
    createLLMReranker,
    LoadLLMReranker
} from './LLMReranker';

// Ensure LLM reranker is registered on module load
import { LoadLLMReranker } from './LLMReranker';
LoadLLMReranker();
