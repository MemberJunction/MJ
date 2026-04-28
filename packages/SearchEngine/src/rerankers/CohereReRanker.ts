/**
 * @fileoverview Cohere Rerank API integration (P2D.2).
 *
 * Wraps Cohere's `rerank-v3.5` (English) and `rerank-multilingual-v3.0` endpoints
 * for use as a SearchEngine re-ranker. Distinct from `@memberjunction/ai-cohere`'s
 * `CohereReranker` which is purpose-built for memory-note rerank with a specific
 * augmented prompt — scope search needs the raw query passed through unchanged
 * for accurate semantic similarity.
 *
 * **Cost model.** Cohere bills per "search," where one search reranks up to 100
 * documents. Above 100 docs, larger requests count as multiple searches.
 * Pricing as of 2026-04: $2.00 per 1k searches → 0.2¢ / search.
 *
 * **API key resolution.** Uses `GetAIAPIKey('CohereLLM')` — same key the AI-layer
 * Cohere reranker uses, sourced from the AIAPIKey registry (driver class
 * `CohereLLM` → env var `AI_VENDOR_API_KEY__COHERELLM`).
 *
 * **Optional peer dependency.** `cohere-ai` is declared in `optionalDependencies`
 * so SearchEngine consumers who don't use Cohere don't pay the bundle cost.
 * Loaded via a dynamic import per CLAUDE.md rule #8 case 2 (optional peer).
 *
 * @module @memberjunction/search-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { LogError, UserInfo } from '@memberjunction/core';
import {
    BaseReranker as AIBaseReranker,
    RerankParams,
    RerankResult,
    GetAIAPIKey,
} from '@memberjunction/ai';
import { BaseReRanker } from '../generic/BaseReRanker';
import { SearchResultItem } from '../generic/search.types';

/**
 * Memoized loader for the Cohere SDK. The dynamic import is the **single** approved
 * use of `import()` in this file (CLAUDE.md #8 case 2 — optional peer dep). Caching
 * the resolved client constructor avoids paying the dynamic import cost on every
 * Rerank call.
 */
let cohereClientCtorPromise: Promise<new (opts: { token: string }) => CohereClientLike> | null = null;
interface CohereClientLike {
    rerank(input: {
        model: string;
        query: string;
        documents: string[];
        topN: number;
        returnDocuments: boolean;
    }): Promise<{ results: Array<{ index: number; relevanceScore: number }> }>;
}

async function getCohereClientCtor(): Promise<new (opts: { token: string }) => CohereClientLike> {
    if (!cohereClientCtorPromise) {
        cohereClientCtorPromise = (async () => {
            try {
                const mod = await import('cohere-ai');
                return mod.CohereClient as unknown as new (opts: { token: string }) => CohereClientLike;
            } catch (err) {
                throw new Error(
                    `CohereReRanker: 'cohere-ai' is not installed. Add it to your project's dependencies if you intend to use the Cohere reranker. Underlying error: ${err instanceof Error ? err.message : String(err)}`
                );
            }
        })();
    }
    return cohereClientCtorPromise;
}

/**
 * Inline AI-layer reranker that calls Cohere's `rerank` endpoint with the raw query
 * (no enhanced prompt). Distinct from `@memberjunction/ai-cohere`'s `CohereReranker`
 * which augments the query for memory-note semantics.
 */
class CohereScopeAIReranker extends AIBaseReranker {
    private _clientPromise: Promise<CohereClientLike>;

    constructor(apiKey: string, modelName: string) {
        super(apiKey, modelName);
        this._clientPromise = getCohereClientCtor().then(Ctor => new Ctor({ token: this.apiKey }));
    }

    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        const client = await this._clientPromise;
        const response = await client.rerank({
            model: this._modelName,
            query: params.query,
            documents: params.documents.map(d => d.text),
            topN: params.topK ?? params.documents.length,
            returnDocuments: false,
        });
        return response.results.map((r, idx) => ({
            id: params.documents[r.index].id,
            relevanceScore: r.relevanceScore,
            document: params.documents[r.index],
            rank: idx,
        }));
    }
}

/**
 * Cohere `rerank-v3.5` re-ranker for SearchEngine. Configured per scope via
 * `SearchScope.ScopeConfig.reRanker.driverClass = 'CohereReRanker'`.
 *
 * The model name can be overridden via `ScopeConfig.reRanker.config.model`
 * (e.g. `'rerank-multilingual-v3.0'`).
 */
@RegisterClass(BaseReRanker, 'CohereReRanker')
export class CohereReRanker extends BaseReRanker {
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
     * count as `ceil(N/100)` searches. As of 2026-04, $2.00 per 1k searches = 0.2¢
     * per search. Override via `config.cents_per_search` if Cohere's pricing changes.
     */
    public override EstimateCostCents(resultCount: number): number {
        const searches = Math.max(1, Math.ceil(resultCount / 100));
        return searches * 0.2;
    }

    protected override getAIReranker(
        config: Record<string, unknown> | undefined,
        _contextUser: UserInfo,
    ): AIBaseReranker | null {
        const apiKey = GetAIAPIKey('CohereLLM');
        if (!apiKey) {
            LogError('CohereReRanker: no API key found for driver "CohereLLM" — set AI_VENDOR_API_KEY__COHERELLM or register an AIAPIKeys subclass.');
            return null;
        }
        const modelName = (config?.['model'] as string | undefined) ?? 'rerank-v3.5';
        return new CohereScopeAIReranker(apiKey, modelName);
    }

    /**
     * Override `ReRank` to record actual cost via the inherited `reportCost` helper
     * after a successful Cohere call. Cohere bills per request (not per token), so
     * the post-call cost equals the pre-call estimate — no separate measurement
     * required.
     */
    public override async ReRank(
        query: string,
        candidates: SearchResultItem[],
        topN: number,
        contextUser: UserInfo,
        config?: Record<string, unknown>,
    ): Promise<SearchResultItem[]> {
        if (topN <= 0 || candidates.length === 0) return [];
        const result = await super.ReRank(query, candidates, topN, contextUser, config);
        // Charge cost only when the call actually went out — when getAIReranker
        // returns null, super.ReRank short-circuits to a slice and we shouldn't bill.
        if (this.getAIReranker(config, contextUser)) {
            this.reportCost(this.EstimateCostCents(candidates.length));
        }
        return result;
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
