/**
 * @fileoverview Optional re-ranker primitive for scope search.
 *
 * A re-ranker runs AFTER per-scope RRF and cross-scope RRF and BEFORE deduplication.
 * It takes a fused candidate list plus the original query and produces a more accurate
 * final ordering — typically via a cross-encoder LLM call (Cohere Rerank, BGE Reranker,
 * Voyage Rerank). Implementations are registered via `@RegisterClass(BaseReRanker, 'DriverClassName')`
 * and selected per-scope via `SearchScope.ScopeConfig.reRanker.driverClass`.
 *
 * This class is a thin adapter over `@memberjunction/ai`'s `BaseReranker`. Subclasses
 * that wrap a real provider (Cohere, BGE, Voyage) return an AI-layer reranker from
 * `getAIReranker()` and inherit the AI layer's validation, timing, and error shape.
 * The default `ReRank()` handles the conversion between `SearchResultItem[]` and the
 * AI layer's `RerankDocument[]` / `RerankResult[]` so subclasses don't have to.
 *
 * Subclasses that don't need the AI layer (e.g. `NoopReRanker`) can override `ReRank()`
 * directly.
 *
 * See Section 8.3 of plans/search-scopes-rag-plus.md.
 *
 * @module @memberjunction/search-engine
 */

import { LogError, UserInfo } from '@memberjunction/core';
import { BaseReranker as AIBaseReranker, RerankDocument, RerankResult } from '@memberjunction/ai';
import { SearchResultItem } from './search.types';

/**
 * Abstract primitive for a search re-ranker. Provides a default implementation of
 * `ReRank()` that delegates to an AI-layer `BaseReranker` returned by
 * `getAIReranker()`. When `getAIReranker()` returns null (the base default), the
 * candidates are sliced to `topN` and returned unchanged.
 *
 * The `NoopReRanker` default implementation (in `NoopReRanker.ts`) returns candidates
 * unchanged and serves as the wiring verification point — the SearchEngine's re-rank
 * stage always resolves a concrete class, even when no real re-ranker is configured.
 */
export abstract class BaseReRanker {
    /**
     * The `DriverClass` key used by `@RegisterClass(BaseReRanker, 'DriverClassName')` so
     * the SearchEngine can resolve this subclass via `ClassFactory` from the scope's
     * `ScopeConfig.reRanker.driverClass` value.
     */
    public abstract get DriverClass(): string;

    /**
     * Score and re-order candidates against the query.
     *
     * Default implementation:
     * 1. Returns empty when `topN <= 0` or `candidates` is empty.
     * 2. Resolves an AI-layer reranker via `getAIReranker()`. If none, slices to `topN`.
     * 3. Maps `SearchResultItem[]` to `RerankDocument[]` (preserving each original item
     *    in `metadata.__mjSearchItem`).
     * 4. Calls the AI reranker's `Rerank()` — inherits validation, timing, error handling.
     * 5. On success, maps the `RerankResult[]` back to `SearchResultItem[]`, replacing
     *    `Score` with `relevanceScore` and augmenting `ScoreBreakdown` with a `ReRank` key.
     * 6. On failure, logs and falls back to the unchanged top-N slice.
     *
     * Subclasses that bypass the AI layer (e.g. `NoopReRanker`) may override this method.
     *
     * @param query - The original query text.
     * @param candidates - The fused candidate list (post-RRF, pre-dedup).
     * @param topN - Maximum number of candidates to return after re-ranking.
     * @param contextUser - The calling user (for auth / tenant propagation).
     * @param config - Optional provider-specific config from `ScopeConfig.reRanker.config`.
     */
    public async ReRank(
        query: string,
        candidates: SearchResultItem[],
        topN: number,
        contextUser: UserInfo,
        config?: Record<string, unknown>
    ): Promise<SearchResultItem[]> {
        if (topN <= 0 || candidates.length === 0) return [];

        const aiReranker = this.getAIReranker(config, contextUser);
        if (!aiReranker) {
            return candidates.slice(0, topN);
        }

        const documents = this.toRerankDocuments(candidates);
        const response = await aiReranker.Rerank({
            query,
            documents,
            topK: topN,
            options: config,
        });

        if (!response.success) {
            LogError(
                `SearchEngine: AI reranker "${this.DriverClass}" failed (${response.durationMs}ms): ${
                    response.errorMessage ?? 'unknown error'
                }`
            );
            return candidates.slice(0, topN);
        }

        return response.results.map(r => this.fromRerankResult(r));
    }

    /**
     * Return the underlying `@memberjunction/ai` `BaseReranker` instance to use.
     *
     * Provider-specific subclasses (Cohere, BGE, Voyage) override this to return a
     * configured AI reranker. Returning `null` (the default) tells `ReRank()` to
     * skip the AI layer and fall back to a simple top-N slice — useful for Noop
     * and test implementations.
     *
     * @param _config - Provider-specific config from `ScopeConfig.reRanker.config`.
     * @param _contextUser - The calling user (for auth / tenant propagation).
     */
    protected getAIReranker(
        _config: Record<string, unknown> | undefined,
        _contextUser: UserInfo
    ): AIBaseReranker | null {
        return null;
    }

    /**
     * Build the text representation of a `SearchResultItem` for the rerank model.
     * Default concatenates `Title` and `Snippet` separated by newline. Override to
     * customize (e.g. include tags or entity context).
     */
    protected buildRerankText(item: SearchResultItem): string {
        const parts = [item.Title, item.Snippet].filter(p => p != null && p.length > 0);
        return parts.join('\n');
    }

    /** Convert the search result candidates into the AI layer's document shape. */
    private toRerankDocuments(candidates: SearchResultItem[]): RerankDocument[] {
        return candidates.map(item => ({
            id: item.ID,
            text: this.buildRerankText(item),
            metadata: { __mjSearchItem: item },
            originalScore: item.Score,
        }));
    }

    /** Recover the original `SearchResultItem` and attach the rerank score. */
    private fromRerankResult(result: RerankResult): SearchResultItem {
        const original = result.document.metadata?.__mjSearchItem as SearchResultItem | undefined;
        if (!original) {
            throw new Error(
                'BaseReRanker: rerank result missing original SearchResultItem in metadata — ' +
                    'did a subclass strip the metadata.__mjSearchItem key?'
            );
        }
        return {
            ...original,
            Score: result.relevanceScore,
            ScoreBreakdown: { ...original.ScoreBreakdown, ReRank: result.relevanceScore },
        };
    }
}
