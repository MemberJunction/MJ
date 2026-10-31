/**
 * @memberjunction/ai-cohere
 *
 * Cohere AI provider for MemberJunction.
 * Currently provides reranking capabilities using Cohere's Rerank API.
 *
 * Supported models:
 * - rerank-v5.0-pro: Flagship cross-encoder reranker (32K context, 100+ languages, Context Focus)
 * - rerank-v5.0-fast: High-throughput cross-encoder reranker (32K context, 100+ languages, Context Focus)
 * - rerank-v4.0-pro: Previous-generation flagship reranker (32K context, 100+ languages)
 * - rerank-v4.0-fast: Previous-generation fast reranker (32K context, 100+ languages)
 * - rerank-v3.5: Legacy English reranker (deprecated upstream)
 * - rerank-multilingual-v3.0: Legacy multilingual reranker
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
 *     'CohereReranker',
 *     apiKey,
 *     'rerank-v5.0-fast'
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
export type { CohereRelevantSpan, CohereRelevantSpansOptions, CohereRerankOptions } from './models/CohereReranker';

export { CohereEmbedding } from './models/CohereEmbedding';
