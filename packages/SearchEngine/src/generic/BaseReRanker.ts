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
import { MJGlobal } from '@memberjunction/global';
import { BaseReranker as AIBaseReranker, RerankDocument, RerankResult } from '@memberjunction/ai';
import { SearchResultItem } from './search.types';

/**
 * Lightweight catalog entry for a registered reranker, returned by
 * `BaseReRanker.GetAvailableRerankers()`. Designed for UI dropdown population on
 * the SearchScope form (P2D.7) — a single call gives the form everything it
 * needs to render selectable options without separately instantiating each
 * registered class.
 */
export interface RegisteredReRankerInfo {
    /** ClassFactory registration key — what goes into ScopeConfig.reRanker.driverClass */
    DriverClass: string;
    /** Human-friendly label for UI display (BaseReRanker.Name) */
    Name: string;
    /** Reranker version (BaseReRanker.Version) */
    Version: string;
    /** Whether this reranker incurs API cost (true) or runs free locally (false) */
    HasCost: boolean;
}

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
/**
 * Optional per-call cost-reporting callback. Real-provider rerankers (Cohere, Voyage,
 * OpenAI) invoke this with the actual cents charged for a single Rerank call so the
 * SearchEngine / scope-level budget guard can accumulate spend and short-circuit
 * runaway agents. NoopReRanker and BGE (local) report 0.
 */
export type ReRankerCostReporter = (cents: number) => void;

export abstract class BaseReRanker {
    /**
     * The `DriverClass` key used by `@RegisterClass(BaseReRanker, 'DriverClassName')` so
     * the SearchEngine can resolve this subclass via `ClassFactory` from the scope's
     * `ScopeConfig.reRanker.driverClass` value.
     */
    public abstract get DriverClass(): string;

    /**
     * Human-friendly display name. Defaults to `DriverClass` so subclasses don't have to
     * override unless they want a different label in UI dropdowns / cost reports.
     */
    public get Name(): string {
        return this.DriverClass;
    }

    /**
     * Reranker semantic version (independent of the package version). Bump this on a
     * subclass when the prompt, scoring formula, or upstream model identifier changes
     * in a way that invalidates cached scores. Defaults to `'1'`.
     */
    public get Version(): string {
        return '1';
    }

    /**
     * Maximum number of candidates a single Rerank call can score. Real providers cap
     * this (Cohere: 1000, Voyage: 1000, OpenAI: varies). The SearchEngine should respect
     * this cap by chunking large candidate lists. Defaults to `Number.MAX_SAFE_INTEGER`
     * (no cap) — subclasses should override.
     */
    public GetMaxResultCount(): number {
        return Number.MAX_SAFE_INTEGER;
    }

    /**
     * Pre-call cost estimate in cents for reranking the given candidate count. Used by
     * the budget guard to short-circuit BEFORE making the call when the projected cost
     * exceeds `SearchScope.RerankerBudgetCents`.
     *
     * Default: 0 (free / local). Real-provider subclasses override based on their pricing.
     *
     * @param resultCount - The number of candidates to be reranked.
     * @returns Estimated cost in cents (whole + fractional, e.g. `0.25` for ¼¢).
     */
    public EstimateCostCents(resultCount: number): number {
        void resultCount;
        return 0;
    }

    /**
     * Optional cost reporter. When set, the reranker invokes it after each successful
     * Rerank call with the actual cents charged. The SearchEngine wires this from the
     * `RerankerBudgetGuard` to the scope-level spend tracker — see Phase 2D.6.
     */
    public CostReporter: ReRankerCostReporter | null = null;

    /**
     * Helper for subclasses: report a cost AND record it on the optional callback. Always
     * safe to call even when no callback is set.
     */
    protected reportCost(cents: number): void {
        if (cents > 0 && this.CostReporter) {
            this.CostReporter(cents);
        }
    }

    /**
     * Enumerate every reranker currently registered with ClassFactory under
     * `BaseReRanker`. Designed for the SearchScope form's reranker dropdown (P2D.7) —
     * the form populates the dropdown from this single call rather than hardcoding
     * a list, so any ClassFactory-registered reranker (including third-party ones
     * published as separate packages) shows up automatically.
     *
     * Each entry includes the driver-class registration key, the friendly Name,
     * Version, and a `HasCost` flag (true when EstimateCostCents(1) > 0). Sorted
     * by Name for stable UI ordering.
     */
    public static GetAvailableRerankers(): RegisteredReRankerInfo[] {
        const registrations = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseReRanker);
        const seen = new Set<string>();
        const out: RegisteredReRankerInfo[] = [];
        for (const reg of registrations) {
            const key = reg.Key;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            try {
                const Ctor = reg.SubClass as unknown as new () => BaseReRanker;
                const instance = new Ctor();
                out.push({
                    DriverClass: key,
                    Name: instance.Name,
                    Version: instance.Version,
                    HasCost: instance.EstimateCostCents(1) > 0,
                });
            } catch (err) {
                // Some rerankers may require args we can't supply at enumeration time.
                // Fall back to the registration key alone — the UI still gets an
                // option, it just lacks the friendly label.
                LogError(`BaseReRanker.GetAvailableRerankers: could not introspect "${key}" — ${err instanceof Error ? err.message : String(err)}`);
                out.push({ DriverClass: key, Name: key, Version: '?', HasCost: false });
            }
        }
        out.sort((a, b) => a.Name.localeCompare(b.Name));
        return out;
    }

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
