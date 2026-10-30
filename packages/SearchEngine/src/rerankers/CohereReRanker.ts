/**
 * @fileoverview Cohere Rerank integration for SearchEngine scopes (P2D.2 + Rerank 5 Context Focus).
 *
 * The Cohere call itself is the AI layer's `CohereReranker` (registered by `@memberjunction/ai-cohere`,
 * which both server bootstraps load), resolved through the ClassFactory so SearchEngine takes no
 * Cohere dependency. This file adds only what scope search needs on top: the relevance threshold,
 * Context Focus snippets on the result items, and per-search cost reporting.
 *
 * **Cost model.** Cohere bills per "search," where one search reranks up to 100
 * documents. Above 100 docs, larger requests count as multiple searches. The estimate
 * uses 0.2¢ per search ($2.00 per 1k, Cohere's rerank-v3.5 price as of 2026-04) for every
 * model; it is not adjusted per model.
 *
 * **API key resolution.** Checks `GetAIAPIKey('CohereReranker')` first (matching
 * `metadata/ai-models/.cohere-reranker-models.json` → `AI_VENDOR_API_KEY__COHERERERANKER`)
 * and falls back to `GetAIAPIKey('CohereLLM')` (`AI_VENDOR_API_KEY__COHERELLM`).
 *
 * @module @memberjunction/search-engine
 */

import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/core';
import { BaseReranker as AIBaseReranker, RerankParams, RerankResult, GetAIAPIKey } from '@memberjunction/ai';
import { BaseReRanker } from '../generic/BaseReRanker';
import { SearchResultItem } from '../generic/search.types';

type RelevantSpans = NonNullable<SearchResultItem['RelevantSpans']>;

/**
 * Wraps the AI layer's `CohereReranker` for scope search: maps the scope config onto its options,
 * applies the threshold, narrows snippets to Context Focus spans, and records whether the call succeeded
 * so cost is only reported for real calls.
 */
class CohereScopeAIReranker extends AIBaseReranker {
    public LastCallSucceeded = false;

    constructor(private readonly cohere: AIBaseReranker, apiKey: string, modelName: string) {
        super(apiKey, modelName);
    }

    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        this.LastCallSucceeded = false;
        const config = params.options ?? {};
        const response = await this.cohere.Rerank({
            ...params,
            options: { RelevantSpans: relevantSpansOption(config['relevantSpans']) },
        });
        if (!response.success) {
            throw new Error(response.errorMessage ?? 'Cohere rerank failed');
        }
        this.LastCallSucceeded = true;

        const focusSnippet = config['focusSnippet'] !== false;
        const results = response.results.map(r => withRelevantSpans(r, focusSnippet));
        const threshold = config['minRelevanceThreshold'];
        if (typeof threshold !== 'number') {
            return results;
        }
        // Like the agents' reranker threshold, this never empties the list: when no result reaches
        // it, the reranked list is returned unfiltered.
        const kept = results.filter(r => r.relevanceScore >= threshold);
        return kept.length > 0 ? kept : results;
    }
}

/** Scope config `relevantSpans` (`true` or `{ threshold, maxSpans }`) as the provider's `RelevantSpans` option. */
function relevantSpansOption(raw: unknown): boolean | { Threshold?: number; MaxSpans?: number } | undefined {
    if (raw === true) {
        return true;
    }
    if (raw && typeof raw === 'object') {
        const { threshold, maxSpans } = raw as { threshold?: number; maxSpans?: number };
        return { Threshold: threshold, MaxSpans: maxSpans };
    }
    return undefined;
}

/** Copy a result's Context Focus spans onto its search item, narrowing the snippet to them when asked. */
function withRelevantSpans(result: RerankResult, focusSnippet: boolean): RerankResult {
    const spans = result.document.metadata?.['RelevantSpans'] as RelevantSpans | undefined;
    const original = result.document.metadata?.['__mjSearchItem'] as SearchResultItem | undefined;
    if (!spans?.length || !original) {
        return result;
    }
    const item: SearchResultItem = {
        ...original,
        RelevantSpans: spans,
        Snippet: (focusSnippet && focusedSnippet(result.document.text, original.Snippet, spans)) || original.Snippet,
    };
    return { ...result, document: { ...result.document, metadata: { ...result.document.metadata, __mjSearchItem: item } } };
}

/**
 * The spans' text from the snippet onward, in document order. Spans index the text that was sent for
 * reranking (`buildRerankText`, overridable) in Unicode code points, so the snippet's position is found
 * in that text rather than assumed. '' when the snippet isn't in it, which keeps the original snippet.
 */
function focusedSnippet(rerankText: string, snippet: string | undefined, spans: RelevantSpans): string {
    const at = snippet ? rerankText.indexOf(snippet) : -1;
    if (at < 0) {
        return '';
    }
    const snippetStart = Array.from(rerankText.slice(0, at)).length;
    return [...spans]
        .sort((a, b) => a.Start - b.Start)
        .map(s => Array.from(s.Text).slice(Math.max(0, snippetStart - s.Start)).join('').trim())
        .filter(Boolean)
        .join(' … ');
}

/**
 * Cohere re-ranker for SearchEngine (defaults to `rerank-v5.0-fast`). Configured per scope via
 * `SearchScope.ScopeConfig.reRanker.driverClass = 'CohereReRanker'`.
 *
 * Configuration keys in `ScopeConfig.reRanker.config`:
 * - `model`: Cohere model ID (`'rerank-v5.0-fast'`, `'rerank-v5.0-pro'`, `'rerank-v4.0-pro'`, `'rerank-v3.5'`, etc.)
 * - `relevantSpans`: `true` or `{ threshold?: number, maxSpans?: number }` to extract passage-level
 *   spans with Cohere Rerank 5 Context Focus.
 * - `focusSnippet`: When Context Focus returns spans, whether to narrow `Snippet` to them (default: `true`).
 * - `minRelevanceThreshold`: Calibrated relevance cutoff (0.0-1.0). Results below it are dropped,
 *   unless none reaches it, in which case all are kept.
 */
@RegisterClass(BaseReRanker, 'CohereReRanker')
export class CohereReRanker extends BaseReRanker {
    private currentAIReranker: CohereScopeAIReranker | null = null;

    public get DriverClass(): string {
        return 'CohereReRanker';
    }
    public override get Name(): string {
        return 'Cohere';
    }
    public override get Version(): string {
        return '1';
    }

    /**
     * Cohere caps a single rerank call at 1000 documents. Above this, the SearchEngine
     * should chunk (not implemented yet — most realistic candidate lists are <100).
     */
    public override GetMaxResultCount(): number {
        return 1000;
    }

    /**
     * Cohere bills per "search". 1 search reranks up to 100 documents; above 100,
     * count as `ceil(N/100)` searches, each estimated at 0.2¢ (see the file header).
     */
    public override EstimateCostCents(resultCount: number): number {
        const searches = Math.max(1, Math.ceil(resultCount / 100));
        return searches * 0.2;
    }

    protected override getAIReranker(
        config: Record<string, unknown> | undefined,
        _contextUser: UserInfo,
    ): AIBaseReranker | null {
        if (this.currentAIReranker) return this.currentAIReranker;

        const apiKey = GetAIAPIKey('CohereReranker') || GetAIAPIKey('CohereLLM');
        if (!apiKey) {
            LogError('CohereReRanker: no API key found for driver "CohereReranker" or "CohereLLM" — set AI_VENDOR_API_KEY__COHERERERANKER (or AI_VENDOR_API_KEY__COHERELLM) or register an AIAPIKeys subclass.');
            return null;
        }
        const modelName = (config?.['model'] as string | undefined) ?? 'rerank-v5.0-fast';
        const cohere = MJGlobal.Instance.ClassFactory.TryCreateInstance<AIBaseReranker>(AIBaseReranker, 'CohereReranker', apiKey, modelName);
        if (!cohere.Resolved || !cohere.Instance) {
            LogError(`CohereReRanker: the "CohereReranker" AI reranker is not registered (is @memberjunction/ai-cohere loaded?): ${cohere.Reason}`);
            return null;
        }
        this.currentAIReranker = new CohereScopeAIReranker(cohere.Instance, apiKey, modelName);
        return this.currentAIReranker;
    }

    /**
     * Override `ReRank` to record actual cost via `reportCost` only after a successful
     * Cohere call (matching `VoyageReRanker`'s `super.ReRank` pattern).
     */
    public override async ReRank(
        query: string,
        candidates: SearchResultItem[],
        topN: number,
        contextUser: UserInfo,
        config?: Record<string, unknown>,
    ): Promise<SearchResultItem[]> {
        if (topN <= 0 || candidates.length === 0) return [];
        this.currentAIReranker = null;
        const apiReranker = this.getAIReranker(config, contextUser) as CohereScopeAIReranker | null;
        try {
            if (!apiReranker) {
                return candidates.slice(0, topN);
            }
            const result = await super.ReRank(query, candidates, topN, contextUser, config);
            if (apiReranker.LastCallSucceeded) {
                this.reportCost(this.EstimateCostCents(candidates.length));
            }
            return result;
        } finally {
            this.currentAIReranker = null;
        }
    }
}

/**
 * Tree-shake prevention helper. Call from a consumer's `public-api.ts` (or from
 * `LoadCohereReRanker()` in a generated registration manifest) to guarantee the
 * `@RegisterClass` side-effect runs.
 */
export function LoadCohereReRanker(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = CohereReRanker;
}
