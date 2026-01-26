import { RegisterClass } from '@memberjunction/global';
import { BaseReranker, RerankParams, RerankResult } from '@memberjunction/ai';
import { CohereClient } from 'cohere-ai';

/**
 * Cohere implementation of the BaseReranker class.
 * Uses Cohere's Rerank API for semantic document reranking.
 *
 * Supported models:
 * - rerank-v3.5: Latest English reranker with best accuracy
 * - rerank-multilingual-v3.0: Supports 100+ languages
 *
 * API Key:
 * Set via environment variable: AI_VENDOR_API_KEY__COHERERERANKER
 *
 * Usage:
 * ```typescript
 * const reranker = ClassFactory.CreateInstance<BaseReranker>(
 *     BaseReranker,
 *     'CohereReranker',
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
@RegisterClass(BaseReranker, 'CohereReranker')
export class CohereReranker extends BaseReranker {
    private _client: CohereClient;

    /**
     * Create a new CohereReranker instance.
     * @param apiKey - Cohere API key
     * @param modelName - Model to use (default: 'rerank-v3.5')
     */
    constructor(apiKey: string, modelName?: string) {
        super(apiKey, modelName || 'rerank-v3.5');
        // Use inherited protected apiKey getter from BaseModel
        this._client = new CohereClient({ token: this.apiKey });
    }

    /**
     * Rerank documents using Cohere's Rerank API.
     *
     * The Cohere API returns results sorted by relevance with scores from 0-1.
     * We map the response to our RerankResult format, preserving document metadata.
     */
    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        // Build enhanced query with context about what makes memory notes relevant
        const enhancedQuery = `You are evaluating agent memory notes for relevance to a user message.

Key principles for scoring relevance:
- User identity notes (name, preferences) are almost ALWAYS relevant, especially for greetings
- Memory notes provide context that COULD be useful, not just direct matches
- Preferences should be applied whenever the topic might come up
- Context notes help maintain continuity across conversations

The user's current message is: "${params.query}"

Find memory notes that would help respond appropriately to this message.`;

        // DEBUG: Log request with ALL documents
        console.log('CohereReranker REQUEST:', JSON.stringify({
            model: this._modelName,
            originalQuery: params.query,
            enhancedQuery: enhancedQuery.substring(0, 200) + '...',
            documentCount: params.documents.length,
            topK: params.topK,
            allDocs: params.documents.map((d, i) => `[${i}] ${d.text.substring(0, 80)}...`)
        }, null, 2));

        // Call Cohere's rerank endpoint with enhanced query
        const response = await this._client.rerank({
            model: this._modelName,
            query: enhancedQuery,
            documents: params.documents.map(d => d.text),
            topN: params.topK || params.documents.length,
            returnDocuments: false // We track documents ourselves to preserve metadata
        });

        // DEBUG: Log response
        console.log('CohereReranker RESPONSE:', JSON.stringify({
            resultCount: response.results.length,
            results: response.results.slice(0, 5).map(r => ({
                index: r.index,
                relevanceScore: r.relevanceScore
            }))
        }, null, 2));

        // Map Cohere results to our format
        // Cohere returns results already sorted by relevance
        const results: RerankResult[] = response.results.map((result, idx) => {
            const originalDoc = params.documents[result.index];
            return {
                id: originalDoc.id,
                relevanceScore: result.relevanceScore,
                document: originalDoc,
                rank: idx
            };
        });

        return results;
    }
}

/**
 * Factory function to create a CohereReranker with default model.
 * Convenience function for simple usage.
 */
export function createCohereReranker(apiKey: string, modelName?: string): CohereReranker {
    return new CohereReranker(apiKey, modelName);
}

/**
 * Ensure the CohereReranker class is loaded for tree-shaking prevention.
 * Import this function in your module's entry point.
 */
export function LoadCohereReranker(): void {
    // This function exists to ensure the class registration occurs
    // when the module is imported, preventing tree-shaking from removing it
}
