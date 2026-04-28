/**
 * @fileoverview OpenAI chat-judge re-ranker (P2D.4).
 *
 * **Decision (2026-04-28):** OpenAI does not publish a first-party reranker endpoint.
 * Their offerings are completions, chat, embeddings, and moderation — there is no
 * dedicated `/rerank`. This implementation uses the documented fallback from the plan:
 * a small chat-completion-based "judge" that scores each candidate's relevance to the
 * query and returns the new ordering. Re-evaluate this decision when OpenAI ships a
 * first-party reranker — the canonical plan calls out swapping in the first-party
 * endpoint as soon as it exists.
 *
 * **Approach.** Single chat completion call, JSON-mode response. The model receives
 * the query and a numbered list of documents and returns
 * `{ "scores": [<number 0..1>, ...] }` with one score per document, in input order.
 * We then sort by score, slice to topN, and return.
 *
 * **Cost.** `gpt-4o-mini` defaults: $0.15 / 1M input tokens, $0.60 / 1M output tokens
 * (2026-04 pricing). Pre-call estimate uses a conservative ~80 tokens/doc input plus
 * 8 tokens/doc output. Post-call cost reports the exact `usage.{prompt,completion}_tokens`
 * from OpenAI so the budget guard sees real spend.
 *
 * **API key.** `GetAIAPIKey('OpenAILLM')` —
 * AI_VENDOR_API_KEY__OPENAILLM or any registered AIAPIKeys subclass.
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

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = [
    'You are a precise relevance scorer for a search system.',
    'Given a user query and a numbered list of candidate documents, return a JSON object',
    'with a single key "scores" whose value is an array of numbers. The array must have',
    'exactly one entry per input document, in the same order, where each entry is a',
    'relevance score in [0, 1] representing how well that document answers the query.',
    'Use the full range — do not cluster all scores in one band. Output JSON only.',
].join('\n');

interface OpenAIChatResponse {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface PricePerToken {
    input: number;  // cents per token
    output: number; // cents per token
}

class OpenAIScopeAIReranker extends AIBaseReranker {
    /** Last call's prompt+completion tokens, populated by `doRerank`. */
    public lastPromptTokens = 0;
    public lastCompletionTokens = 0;

    constructor(apiKey: string, modelName: string) {
        super(apiKey, modelName);
    }

    protected async doRerank(params: RerankParams): Promise<RerankResult[]> {
        const docList = params.documents
            .map((d, i) => `[${i}] ${d.text}`)
            .join('\n');
        const userPrompt = `Query:\n${params.query}\n\nDocuments:\n${docList}`;

        const response = await fetch(OPENAI_CHAT_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: this._modelName,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userPrompt },
                ],
                response_format: { type: 'json_object' },
                temperature: 0,
            }),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`OpenAI rerank-judge call failed (${response.status}): ${text || response.statusText}`);
        }

        const json = await response.json() as OpenAIChatResponse;
        this.lastPromptTokens = json.usage?.prompt_tokens ?? 0;
        this.lastCompletionTokens = json.usage?.completion_tokens ?? 0;

        const content = json.choices[0]?.message.content ?? '';
        const parsed = JSON.parse(content) as { scores?: unknown };
        if (!Array.isArray(parsed.scores)) {
            throw new Error(`OpenAI rerank-judge returned malformed scores: ${content}`);
        }
        const scores = parsed.scores as unknown[];
        if (scores.length !== params.documents.length) {
            throw new Error(`OpenAI rerank-judge returned ${scores.length} scores for ${params.documents.length} documents`);
        }

        // Build (doc, score) pairs, sort descending by score, optionally slice topK.
        const pairs = params.documents.map((d, i) => ({
            doc: d,
            score: typeof scores[i] === 'number' ? (scores[i] as number) : 0,
        }));
        pairs.sort((a, b) => b.score - a.score);
        const topK = params.topK ?? pairs.length;
        return pairs.slice(0, topK).map((p, idx) => ({
            id: p.doc.id,
            relevanceScore: p.score,
            document: p.doc,
            rank: idx,
        }));
    }
}

/**
 * Chat-completion-based "judge" reranker. Configure per scope via
 * `SearchScope.ScopeConfig.reRanker.driverClass = 'OpenAIReRanker'`.
 *
 * Override the model via `ScopeConfig.reRanker.config.model`
 * (default: `gpt-4o-mini` — change when a first-party OpenAI rerank endpoint launches).
 */
@RegisterClass(BaseReRanker, 'OpenAIReRanker')
export class OpenAIReRanker extends BaseReRanker {
    /** Pricing in cents-per-token. As of 2026-04. */
    private static readonly PRICING: Record<string, PricePerToken> = {
        'gpt-4o-mini': { input: 0.15 / 1_000_000 * 100, output: 0.60 / 1_000_000 * 100 },
        'gpt-4o':      { input: 2.50 / 1_000_000 * 100, output: 10.00 / 1_000_000 * 100 },
        'gpt-4.1-mini':{ input: 0.40 / 1_000_000 * 100, output: 1.60 / 1_000_000 * 100 },
        'gpt-4.1':     { input: 2.00 / 1_000_000 * 100, output: 8.00 / 1_000_000 * 100 },
    };

    private currentAIReranker: OpenAIScopeAIReranker | null = null;

    public get DriverClass(): string {
        return 'OpenAIReRanker';
    }
    public override get Name(): string {
        return 'OpenAI';
    }
    public override get Version(): string {
        return '1';
    }

    /**
     * Effective limit when the candidate list plus prompt fits in the model's input
     * window. With gpt-4o-mini's 128k input context and ~80 tokens/doc, the practical
     * cap is well above 1000. Returning 1000 to match the other rerankers; the
     * SearchEngine will chunk above this when chunking is implemented.
     */
    public override GetMaxResultCount(): number {
        return 1000;
    }

    /**
     * Pre-call cost estimate. ~80 input tokens/doc + 50 system/query tokens, plus
     * 8 output tokens/doc. Conservative — actual usage tends to be lower.
     */
    public override EstimateCostCents(resultCount: number): number {
        const pricing = OpenAIReRanker.PRICING['gpt-4o-mini'];
        const inputTokens = resultCount * 80 + 50;
        const outputTokens = resultCount * 8;
        return inputTokens * pricing.input + outputTokens * pricing.output;
    }

    protected override getAIReranker(
        config: Record<string, unknown> | undefined,
        _contextUser: UserInfo,
    ): AIBaseReranker | null {
        if (this.currentAIReranker) return this.currentAIReranker;

        const apiKey = GetAIAPIKey('OpenAILLM');
        if (!apiKey) {
            LogError('OpenAIReRanker: no API key found for driver "OpenAILLM" — set AI_VENDOR_API_KEY__OPENAILLM or register an AIAPIKeys subclass.');
            return null;
        }
        const modelName = (config?.['model'] as string | undefined) ?? 'gpt-4o-mini';
        this.currentAIReranker = new OpenAIScopeAIReranker(apiKey, modelName);
        return this.currentAIReranker;
    }

    public override async ReRank(
        query: string,
        candidates: SearchResultItem[],
        topN: number,
        contextUser: UserInfo,
        config?: Record<string, unknown>,
    ): Promise<SearchResultItem[]> {
        if (topN <= 0 || candidates.length === 0) return [];
        this.currentAIReranker = null;
        const apiReranker = this.getAIReranker(config, contextUser) as OpenAIScopeAIReranker | null;
        try {
            if (!apiReranker) return candidates.slice(0, topN);
            const result = await super.ReRank(query, candidates, topN, contextUser, config);
            const modelName = (config?.['model'] as string | undefined) ?? 'gpt-4o-mini';
            const pricing = OpenAIReRanker.PRICING[modelName] ?? OpenAIReRanker.PRICING['gpt-4o-mini'];
            const cents = apiReranker.lastPromptTokens * pricing.input
                + apiReranker.lastCompletionTokens * pricing.output;
            if (cents > 0) this.reportCost(cents);
            return result;
        } finally {
            this.currentAIReranker = null;
        }
    }
}

/** Tree-shake prevention helper. */
export function LoadOpenAIReRanker(): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ref = OpenAIReRanker;
}
