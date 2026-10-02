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
 * The legacy environment-variable fallback is named after the model-vendor row's driver class:
 * AI_VENDOR_API_KEY__COHERERERANKER for the shipped Cohere reranker models. A Cohere credential
 * binding takes precedence over it.
 *
 * Usage:
 * ```typescript
 * import { CohereReranker } from '@memberjunction/ai-cohere';
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

export { CohereReranker, CreateCohereReranker, createCohereReranker } from './models/CohereReranker';

export { CohereEmbedding } from './models/CohereEmbedding';
