/**
 * @fileoverview Unified Search Service orchestrator.
 *
 * Combines vector search, full-text search, and entity metadata search
 * with RRF fusion to provide a single search endpoint for the Knowledge Hub.
 *
 * @module @memberjunction/ai-knowledge-search
 */

import { LogError, LogStatus } from '@memberjunction/core';
import {
    UnifiedSearchRequest,
    UnifiedSearchResponse,
    SearchSourceType,
} from './SearchTypes';
import { VectorSearchProvider, VectorSearchConfig } from './VectorSearchProvider';
import { FullTextSearchProvider, FullTextSearchConfig } from './FullTextSearchProvider';
import { SearchFusion, LabeledCandidateList } from './SearchFusion';

/**
 * Configuration for the Unified Search Service.
 */
export interface UnifiedSearchConfig {
    /** Configuration for the vector search provider (optional -- omit to disable vector search) */
    VectorSearch?: VectorSearchConfig;
    /** Configuration for the full-text search provider (optional -- omit to disable FTS) */
    FullTextSearch?: FullTextSearchConfig;
    /** Default maximum results if not specified in the request */
    DefaultMaxResults: number;
}

/**
 * Orchestrates parallel execution of multiple search providers and fuses results.
 */
export class UnifiedSearchService {
    private config: UnifiedSearchConfig;
    private vectorProvider: VectorSearchProvider | null;
    private fullTextProvider: FullTextSearchProvider | null;
    private fusion: SearchFusion;

    constructor(config: UnifiedSearchConfig) {
        this.config = config;
        this.vectorProvider = config.VectorSearch
            ? new VectorSearchProvider(config.VectorSearch)
            : null;
        this.fullTextProvider = config.FullTextSearch
            ? new FullTextSearchProvider(config.FullTextSearch)
            : null;
        this.fusion = new SearchFusion();
    }

    /**
     * Execute a unified search across all configured providers.
     *
     * 1. Parse query and filters
     * 2. Execute all enabled search providers in parallel
     * 3. Fuse results using RRF
     * 4. Return UnifiedSearchResponse
     */
    public async Search(request: UnifiedSearchRequest): Promise<UnifiedSearchResponse> {
        const startTime = Date.now();
        const maxResults = request.MaxResults ?? this.config.DefaultMaxResults;
        const includeSources = request.IncludeSources ?? this.getEnabledSources();

        try {
            // Execute all providers in parallel
            const labeledLists = await this.executeProviders(request, includeSources);

            // Fuse results
            const fusedResults = this.fusion.Fuse(labeledLists, maxResults);

            // Count results per source
            const sourceCounts = this.countSourceContributions(labeledLists);

            return {
                Success: true,
                Results: fusedResults,
                TotalCount: fusedResults.length,
                ElapsedMs: Date.now() - startTime,
                SourceCounts: sourceCounts,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`UnifiedSearchService.Search failed: ${message}`);

            return {
                Success: false,
                Results: [],
                TotalCount: 0,
                ElapsedMs: Date.now() - startTime,
                SourceCounts: { Vector: 0, FullText: 0, Entity: 0 },
                ErrorMessage: message,
            };
        }
    }

    /**
     * Get which sources are enabled based on configuration.
     */
    private getEnabledSources(): SearchSourceType[] {
        const sources: SearchSourceType[] = [];
        if (this.vectorProvider) sources.push('vector');
        if (this.fullTextProvider) sources.push('fulltext');
        return sources;
    }

    /**
     * Execute all requested search providers in parallel.
     */
    private async executeProviders(
        request: UnifiedSearchRequest,
        sources: SearchSourceType[]
    ): Promise<LabeledCandidateList[]> {
        const promises: Promise<LabeledCandidateList>[] = [];

        if (sources.includes('vector') && this.vectorProvider) {
            promises.push(this.executeVectorSearch(request));
        }

        if (sources.includes('fulltext') && this.fullTextProvider) {
            promises.push(this.executeFullTextSearch(request));
        }

        const results = await Promise.all(promises);
        return results;
    }

    /**
     * Execute vector search and wrap in a labeled list.
     */
    private async executeVectorSearch(
        request: UnifiedSearchRequest
    ): Promise<LabeledCandidateList> {
        if (!this.vectorProvider) {
            return { Source: 'vector', Candidates: [] };
        }

        const candidates = await this.vectorProvider.Search(request.Query, request.Filters);
        return { Source: 'vector', Candidates: candidates };
    }

    /**
     * Execute full-text search and wrap in a labeled list.
     */
    private async executeFullTextSearch(
        request: UnifiedSearchRequest
    ): Promise<LabeledCandidateList> {
        if (!this.fullTextProvider) {
            return { Source: 'fulltext', Candidates: [] };
        }

        const candidates = await this.fullTextProvider.Search(
            request.Query,
            request.Filters,
            request.ContextUser
        );
        return { Source: 'fulltext', Candidates: candidates };
    }

    /**
     * Count how many candidates each source contributed.
     */
    private countSourceContributions(
        lists: LabeledCandidateList[]
    ): { Vector: number; FullText: number; Entity: number } {
        const counts = { Vector: 0, FullText: 0, Entity: 0 };

        for (const list of lists) {
            switch (list.Source) {
                case 'vector':
                    counts.Vector = list.Candidates.length;
                    break;
                case 'fulltext':
                    counts.FullText = list.Candidates.length;
                    break;
                case 'entity':
                    counts.Entity = list.Candidates.length;
                    break;
            }
        }

        return counts;
    }
}
