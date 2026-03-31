/**
 * @fileoverview Vector search provider for the Unified Search Service.
 *
 * Embeds the query using the configured embedding model, queries the shared
 * vector index with optional metadata filters, and returns scored candidates
 * compatible with RRF fusion.
 *
 * @module @memberjunction/ai-knowledge-search
 */

import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase, BaseResponse, SharedIndexFilterOptions, VectorMetadataFilter } from '@memberjunction/ai-vectordb';
import { ScoredCandidate } from '@memberjunction/ai-vector-dupe';
import { MJGlobal } from '@memberjunction/global';
import { SearchFilters } from './SearchTypes';

/**
 * Configuration for the vector search provider.
 */
export interface VectorSearchConfig {
    /** The vector database instance to query */
    VectorDB: VectorDBBase;
    /** The embedding model to use for query embedding */
    EmbeddingModel: BaseEmbeddings;
    /** The name of the shared index to query */
    IndexName: string;
    /** Maximum number of results to retrieve from the vector index */
    TopK: number;
}

/**
 * Provides vector similarity search against the shared Knowledge Hub index.
 */
export class VectorSearchProvider {
    private config: VectorSearchConfig;

    constructor(config: VectorSearchConfig) {
        this.config = config;
    }

    /**
     * Execute a vector similarity search.
     *
     * @param query - The search query text
     * @param filters - Optional filters to narrow results
     * @returns Scored candidates suitable for RRF fusion
     */
    public async Search(query: string, filters?: SearchFilters): Promise<ScoredCandidate[]> {
        // Step 1: Embed the query
        const embedResult = await this.config.EmbeddingModel.EmbedText({ text: query, model: '' });
        if (!embedResult || !embedResult.vector || embedResult.vector.length === 0) {
            return [];
        }

        const queryVector = embedResult.vector;

        // Step 2: Build metadata filter from search filters
        const metadataFilter = this.buildMetadataFilter(filters);

        // Step 3: Query the vector index
        const response: BaseResponse = await this.config.VectorDB.QueryIndex({
            vector: queryVector,
            topK: this.config.TopK,
            includeMetadata: true,
            filter: metadataFilter,
        });

        if (!response.success || !response.data) {
            return [];
        }

        // Step 4: Convert to ScoredCandidate format
        return this.convertToScoredCandidates(response);
    }

    /**
     * Convert search filters into a SharedIndexFilterOptions and then to a native filter.
     */
    private buildMetadataFilter(filters?: SearchFilters): object | undefined {
        if (!filters) {
            return undefined;
        }

        const indexFilter: SharedIndexFilterOptions = {
            EntityNames: filters.EntityNames,
            SourceTypes: filters.SourceTypes,
            ContentTypes: filters.ContentTypes,
            Tags: filters.Tags,
        };

        return VectorMetadataFilter.FromOptions(indexFilter);
    }

    /**
     * Convert vector DB response to ScoredCandidate array for RRF fusion.
     */
    private convertToScoredCandidates(response: BaseResponse): ScoredCandidate[] {
        const matches = response.data?.matches;
        if (!Array.isArray(matches)) {
            return [];
        }

        return matches.map((match: { id: string; score?: number; metadata?: Record<string, unknown> }) => ({
            ID: match.id,
            Score: match.score ?? 0,
            Metadata: match.metadata,
        }));
    }
}
