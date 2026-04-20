/**
 * @fileoverview Core type definitions for the MemberJunction AI Reranking system.
 *
 * These types define the contract for reranking operations across all providers
 * (Cohere, LLM-based, etc.) and are used by the BaseReranker abstract class.
 *
 * @module @memberjunction/ai
 * @since 3.0.0
 */

/**
 * A document to be reranked.
 */
export interface RerankDocument {
    /**
     * Unique identifier for the document (e.g., AIAgentNote.ID)
     */
    id: string;

    /**
     * Primary text content to be compared against the query for relevance scoring
     */
    text: string;

    /**
     * Optional metadata to preserve through the reranking process.
     * Use this to store the original entity reference for zero-copy retrieval.
     */
    metadata?: Record<string, unknown>;

    /**
     * Original similarity score from vector search (for reference/logging)
     */
    originalScore?: number;
}

/**
 * A single result from the reranking operation.
 */
export interface RerankResult {
    /**
     * Document ID (matches RerankDocument.id)
     */
    id: string;

    /**
     * Relevance score from the reranker (0.0-1.0, higher is more relevant)
     */
    relevanceScore: number;

    /**
     * The original document with its metadata preserved
     */
    document: RerankDocument;

    /**
     * New rank position after reranking (0-indexed, 0 = most relevant)
     */
    rank: number;
}

/**
 * Parameters for a rerank operation.
 */
export interface RerankParams {
    /**
     * The query text to rank documents against
     */
    query: string;

    /**
     * Documents to rerank (typically from vector search results)
     */
    documents: RerankDocument[];

    /**
     * Maximum number of results to return after reranking.
     * If not specified, returns all reranked documents.
     */
    topK?: number;

    /**
     * Provider-specific options (passed through to the reranker implementation)
     */
    options?: Record<string, unknown>;
}

/**
 * Response from a rerank operation.
 */
export interface RerankResponse {
    /**
     * Whether the rerank operation succeeded
     */
    success: boolean;

    /**
     * Reranked results sorted by relevance (highest first)
     */
    results: RerankResult[];

    /**
     * Error message if the operation failed
     */
    errorMessage?: string;

    /**
     * Time taken to perform the reranking in milliseconds
     */
    durationMs: number;

    /**
     * Model name used for reranking (for logging/debugging)
     */
    modelName?: string;
}
