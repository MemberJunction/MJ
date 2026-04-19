/**
 * @fileoverview Optional re-ranker primitive for scope search.
 *
 * A re-ranker runs AFTER per-scope RRF and cross-scope RRF and BEFORE deduplication.
 * It takes a fused candidate list plus the original query and produces a more accurate
 * final ordering — typically via a cross-encoder LLM call (Cohere Rerank, BGE Reranker,
 * Voyage Rerank). Implementations are registered via `@RegisterClass(BaseReRanker, 'DriverClassName')`
 * and selected per-scope via `SearchScope.ScopeConfig.reRanker.driverClass`.
 *
 * See Section 8.3 of plans/search-scopes-rag-plus.md.
 *
 * @module @memberjunction/search-engine
 */

import { UserInfo } from '@memberjunction/core';
import { SearchResultItem } from './search.types';

/**
 * Abstract primitive for a search re-ranker. Subclasses implement the provider-specific
 * call (HTTP to Cohere, local BGE model, etc.) and return candidates in improved order.
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
     * Score and re-order candidates against the query. Implementations MUST respect
     * `topN` — the returned array should be at most `topN` entries, sorted descending
     * by the re-rank score. The original `Score` on each `SearchResultItem` should be
     * replaced with the re-rank score (or the item's `ScoreBreakdown` can be augmented
     * with a `ReRank` key — implementation's choice).
     *
     * @param query - The original query text.
     * @param candidates - The fused candidate list (post-RRF, pre-dedup).
     * @param topN - Maximum number of candidates to return after re-ranking.
     * @param contextUser - The calling user (for auth / tenant propagation).
     * @param config - Optional provider-specific config from `ScopeConfig.reRanker.config`.
     */
    public abstract ReRank(
        query: string,
        candidates: SearchResultItem[],
        topN: number,
        contextUser: UserInfo,
        config?: Record<string, unknown>
    ): Promise<SearchResultItem[]>;
}
