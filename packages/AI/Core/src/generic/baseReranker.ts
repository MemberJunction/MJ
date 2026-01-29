/**
 * @fileoverview Abstract base class for AI reranker implementations.
 *
 * Provides the foundation for semantic reranking providers (Cohere, LLM-based, etc.)
 * following the same patterns as BaseLLM and BaseEmbeddings.
 *
 * Implementations should:
 * 1. Register with @RegisterClass(BaseReranker, 'ProviderName')
 * 2. Implement the protected doRerank() method
 * 3. Handle provider-specific API calls and response mapping
 *
 * @module @memberjunction/ai
 * @since 3.0.0
 */

import { BaseModel } from './baseModel';
import { RerankParams, RerankResponse, RerankResult } from './reranker.types';

/**
 * Abstract base class for all reranker implementations.
 * Extends BaseModel to follow MJ conventions for AI model classes.
 *
 * Provides common functionality including:
 * - Input validation
 * - Response standardization
 * - Utility methods for sorting and filtering results
 *
 * Example usage:
 * ```typescript
 * @RegisterClass(BaseReranker, 'CohereReranker')
 * export class CohereReranker extends BaseReranker {
 *     protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
 *         // Call Cohere API and return results
 *     }
 * }
 * ```
 */
export abstract class BaseReranker extends BaseModel {
    protected _modelName: string;

    /**
     * Create a new reranker instance.
     * @param apiKey - API key for the reranking service (e.g., Cohere API key)
     * @param modelName - Optional model name to use (provider-specific)
     */
    constructor(apiKey: string, modelName?: string) {
        super(apiKey);
        this._modelName = modelName || '';
    }

    /**
     * Get the model name used for this reranker
     */
    public get ModelName(): string {
        return this._modelName;
    }

    /**
     * Rerank documents based on their relevance to a query.
     * This is the main entry point for reranking operations.
     *
     * The method:
     * 1. Validates input parameters
     * 2. Calls the provider-specific doRerank() implementation
     * 3. Applies topK limit if specified
     * 4. Returns standardized RerankResponse
     *
     * @param params - Reranking parameters including query and documents
     * @returns Promise resolving to RerankResponse with reranked results
     */
    public async Rerank(params: RerankParams): Promise<RerankResponse> {
        const startTime = Date.now();

        try {
            // Validate input
            if (!params.query || params.query.trim().length === 0) {
                return this.createErrorResponse('Query cannot be empty', startTime);
            }

            if (!params.documents || params.documents.length === 0) {
                return {
                    success: true,
                    results: [],
                    durationMs: Date.now() - startTime,
                    modelName: this._modelName
                };
            }

            // Validate all documents have required fields
            for (let i = 0; i < params.documents.length; i++) {
                const doc = params.documents[i];
                if (!doc.id || !doc.text) {
                    return this.createErrorResponse(
                        `Document at index ${i} missing required field (id or text)`,
                        startTime
                    );
                }
            }

            // Call provider-specific implementation
            const results = await this.doRerank(params);

            // Apply topK limit if specified
            const topK = params.topK || results.length;
            const limitedResults = results.slice(0, topK);

            // Update rank values after limiting
            const rankedResults = limitedResults.map((r, idx) => ({
                ...r,
                rank: idx
            }));

            return {
                success: true,
                results: rankedResults,
                durationMs: Date.now() - startTime,
                modelName: this._modelName
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`BaseReranker.Rerank error: ${message}`);
            return this.createErrorResponse(message, startTime);
        }
    }

    /**
     * Provider-specific reranking implementation.
     * Subclasses must implement this method to perform the actual reranking.
     *
     * Implementation requirements:
     * - Call the provider's reranking API
     * - Map results to RerankResult format
     * - Sort results by relevance score (highest first)
     * - Preserve document metadata for zero-copy retrieval
     *
     * @param params - Reranking parameters
     * @returns Promise resolving to array of RerankResult sorted by relevance
     */
    protected abstract doRerank(params: RerankParams): Promise<RerankResult[]>;

    /**
     * Create a standardized error response.
     * Used internally when validation fails or an exception occurs.
     */
    protected createErrorResponse(message: string, startTime: number): RerankResponse {
        return {
            success: false,
            results: [],
            errorMessage: message,
            durationMs: Date.now() - startTime,
            modelName: this._modelName
        };
    }

    /**
     * Sort results by relevance score in descending order.
     * Utility method for implementations.
     */
    protected sortByRelevance(results: RerankResult[]): RerankResult[] {
        return [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    /**
     * Filter results by minimum relevance threshold.
     * Utility method for implementations that need to filter low-scoring results.
     */
    protected filterByThreshold(results: RerankResult[], minScore: number): RerankResult[] {
        return results.filter(r => r.relevanceScore >= minScore);
    }
}
