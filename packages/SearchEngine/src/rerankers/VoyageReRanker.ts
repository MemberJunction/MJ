/**
 * @fileoverview Voyage AI Rerank API integration (P2D.3).
 *
 * Calls Voyage's `rerank-2` (and `rerank-2-lite`) endpoint via the public REST API.
 * No SDK dependency — Voyage's surface is small and fetch-based, so we call the
 * endpoint directly and avoid pulling in `voyageai` as another optional peer.
 *
 * **Cost model.** Voyage bills per token (query + document tokens combined). Pricing
 * as of 2026-04: `rerank-2` is $0.05 per 1M tokens; `rerank-2-lite` is $0.02 per 1M
 * tokens. We approximate token count as `ceil(charCount / 4)` for the estimate, then
 * report the exact `usage.total_tokens` returned by the API as the actual cost.
 *
 * **API key resolution.** Uses `GetAIAPIKey('VoyageLLM')` — sources from
 * `AI_VENDOR_API_KEY__VOYAGELLM` env var or any registered AIAPIKeys subclass.
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

const VOYAGE_RERANK_URL = 'https://api.voyageai.com/v1/rerank';

interface VoyageRerankResponseItem {
    index: number;
    relevance_score: number;
}
interface VoyageRerankResponse {
    object: string;
    data: VoyageRerankResponseItem[];
    model: string;
    usage: { total_tokens: number };
}

/**
 * Approximate Voyage's tokenizer by `ceil(charCount / 4)`. Real Voyage tokenization is
 * BPE-based; this approximation is conservative enough to keep budget guards from
 * under-counting in practice.
 */
function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Inline AI-layer reranker that POSTs to Voyage's rerank endpoint.
 */
class VoyageScopeAIReranker extends AIBaseReranker {
    /**
     * Last-call usage. Populated on each `doRerank()` so the SearchEngine wrapper can
     * report exact cost via `usage.total_tokens` instead of the pre-call estimate.
     */
    public lastTokensUsed = 0;

    constructor(apiKey: string, modelName: string) {
        super(apiKey, modelName);
    }

    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        const body = {
            query: params.query,
            documents: params.documents.map(d => d.text),
            model: this._modelName,
            top_k: params.topK ?? params.documents.length,
            return_documents: false,
        };

        const response = await fetch(VOYAGE_RERANK_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Voyage rerank failed (${response.status}): ${text || response.statusText}`);
        }

        const json = await response.json() as VoyageRerankResponse;
        this.lastTokensUsed = json.usage?.total_tokens ?? 0;

        return json.data.map((r, idx) => ({
            id: params.documents[r.index].id,
            relevanceScore: r.relevance_score,
            document: params.documents[r.index],
            rank: idx,
        }));
    }
}

/**
 * Voyage `rerank-2` re-ranker. Configure per scope via
 * `SearchScope.ScopeConfig.reRanker.driverClass = 'VoyageReRanker'`.
 *
 * Override the model via `ScopeConfig.reRanker.config.model = 'rerank-2-lite'` for
 * the cheaper lite variant.
 */
@RegisterClass(BaseReRanker, 'VoyageReRanker')
export class VoyageReRanker extends BaseReRanker {
    /** Pricing in cents-per-token, indexed by model name. As of 2026-04. */
    private static readonly CENTS_PER_TOKEN: Record<string, number> = {
        'rerank-2': 0.05 / 1_000_000 * 100,        // $0.05 / 1M tokens → 5e-6 cents/token
        'rerank-2-lite': 0.02 / 1_000_000 * 100,   // $0.02 / 1M tokens → 2e-6 cents/token
    };

    /**
     * Per-instance reranker, captured so we can read `lastTokensUsed` after a call to
     * report exact cost. Recreated per ReRank invocation when config or contextUser
     * change shouldn't be a concern in practice.
     */
    private currentAIReranker: VoyageScopeAIReranker | null = null;

    public get DriverClass(): string {
        return 'VoyageReRanker';
    }
    public override get Name(): string {
        return 'Voyage';
    }
    public override get Version(): string {
        return '1';
    }

    /** Voyage's published cap is 1000 documents per call. */
    public override GetMaxResultCount(): number {
        return 1000;
    }

    /**
     * Pre-call cost estimate using `ceil(charCount / 4)` per document plus query
     * tokens. Conservative — tends to over-estimate, which is what a budget guard
     * wants. Default model is `rerank-2`; pass `config.model` to switch.
     */
    public override EstimateCostCents(resultCount: number): number {
        // Use the default model's pricing for the estimate; the actual call will use
        // whatever's in config.model and the post-call cost report will be exact.
        const pricePerToken = VoyageReRanker.CENTS_PER_TOKEN['rerank-2'] ?? 0;
        // Assume average document size ~250 chars (~62 tokens) and a 30-token query.
        const approxTokens = resultCount * 62 + 30;
        return approxTokens * pricePerToken;
    }

    protected override getAIReranker(
        config: Record<string, unknown> | undefined,
        _contextUser: UserInfo,
    ): AIBaseReranker | null {
        // Return the cached instance if `ReRank()` already constructed one for this
        // invocation — super.ReRank calls us a second time during dispatch. Without
        // the cache we'd build two separate Voyage clients per call and lose track of
        // `lastTokensUsed`.
        if (this.currentAIReranker) return this.currentAIReranker;

        const apiKey = GetAIAPIKey('VoyageLLM');
        if (!apiKey) {
            LogError('VoyageReRanker: no API key found for driver "VoyageLLM" — set AI_VENDOR_API_KEY__VOYAGELLM or register an AIAPIKeys subclass.');
            return null;
        }
        const modelName = (config?.['model'] as string | undefined) ?? 'rerank-2';
        this.currentAIReranker = new VoyageScopeAIReranker(apiKey, modelName);
        return this.currentAIReranker;
    }

    /**
     * Override `ReRank` to report exact post-call cost via `usage.total_tokens` from
     * the Voyage response, not the pre-call estimate. The estimate exists only to feed
     * the budget guard's pre-call short-circuit.
     */
    public override async ReRank(
        query: string,
        candidates: SearchResultItem[],
        topN: number,
        contextUser: UserInfo,
        config?: Record<string, unknown>,
    ): Promise<SearchResultItem[]> {
        if (topN <= 0 || candidates.length === 0) return [];
        // Reset the per-call cache and prime it via getAIReranker. Super will reuse it.
        this.currentAIReranker = null;
        const apiReranker = this.getAIReranker(config, contextUser) as VoyageScopeAIReranker | null;
        try {
            if (!apiReranker) {
                // No API key — fall through to a top-N slice without charge.
                return candidates.slice(0, topN);
            }
            const result = await super.ReRank(query, candidates, topN, contextUser, config);
            const modelName = (config?.['model'] as string | undefined) ?? 'rerank-2';
            const pricePerToken = VoyageReRanker.CENTS_PER_TOKEN[modelName] ?? VoyageReRanker.CENTS_PER_TOKEN['rerank-2'];
            const cents = apiReranker.lastTokensUsed * pricePerToken;
            if (cents > 0) {
                this.reportCost(cents);
            }
            return result;
        } finally {
            this.currentAIReranker = null;
        }
    }
}

/** Tree-shake prevention helper. */
export function LoadVoyageReRanker(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = VoyageReRanker;
}
