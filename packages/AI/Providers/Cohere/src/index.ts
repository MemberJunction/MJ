/**
 * @memberjunction/ai-cohere
 *
 * Cohere AI provider for MemberJunction.
 * Currently provides reranking capabilities using Cohere's Rerank API.
 *
 * Supported models:
 * - rerank-v3.5: Latest English reranker with best accuracy
 * - rerank-multilingual-v3.0: Supports 100+ languages
 *
 * API Key:
 * Set via environment variable: AI_VENDOR_API_KEY__COHERELLM
 *
 * Usage:
 * ```typescript
 * import { LoadCohereReranker } from '@memberjunction/ai-cohere';
 *
 * // Ensure class registration
 * LoadCohereReranker();
 *
 * // Create instance via ClassFactory
 * const reranker = ClassFactory.CreateInstance<BaseReranker>(
 *     BaseReranker,
 *     'CohereLLM',
 *     apiKey,
 *     'rerank-v3.5'
 * );
 *
 * const response = await reranker.Rerank({
 *     query: 'What is the capital of France?',
 *     documents: [
 *         { id: '1', text: 'Paris is the capital of France.' },
 *         { id: '2', text: 'London is in England.' }
 *     ],
 *     topK: 5
 * });
 * ```
 */

export {
    CohereReranker,
    createCohereReranker,
    LoadCohereReranker
} from './models/CohereReranker';
