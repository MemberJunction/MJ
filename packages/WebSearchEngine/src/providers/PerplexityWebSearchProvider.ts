/**
 * @fileoverview Perplexity driver — the raw `/search` endpoint, not the Sonar chat models.
 * @module @memberjunction/web-search-engine
 */

import { UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { HttpPost } from '@memberjunction/network-utils';
import { BaseWebSearchProvider } from '../BaseWebSearchProvider';
import { WebSearchCapabilities, WebSearchHit, WebSearchParams, WebSearchProviderResponse } from '../types';
import { classifyHttpFailure, failure } from './httpFailure';

interface PerplexitySearchResult {
    title?: string;
    url?: string;
    snippet?: string;
    date?: string;
    last_updated?: string;
}

interface PerplexitySearchResponse {
    results?: PerplexitySearchResult[];
    id?: string;
    server_time?: string;
}

interface PerplexityChatResponse {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
}

/**
 * Searches through Perplexity.
 *
 * Hits always come from **`POST /search`** — the raw search endpoint, which returns ranked
 * title/url/snippet at a flat per-query price in well under a second. The Sonar chat models are
 * used only when {@link WebSearchParams.IncludeAnswer} asks for prose, because they bill per
 * token and take seconds; paying generation prices to obtain a list of links was the defect
 * this driver exists to avoid repeating.
 *
 * Credential key `apiKey`; environment fallback `PERPLEXITY_API_KEY`.
 */
@RegisterClass(BaseWebSearchProvider, 'PerplexityWebSearchProvider')
export class PerplexityWebSearchProvider extends BaseWebSearchProvider {
    private static readonly SEARCH_ENDPOINT = 'https://api.perplexity.ai/search';
    private static readonly CHAT_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
    /** Perplexity's cap on the domain allow/deny list. */
    private static readonly MAX_DOMAIN_FILTERS = 20;

    public readonly Capabilities: WebSearchCapabilities = {
        Answer: true,
        DomainFilter: true,
        Freshness: true,
        Region: true,
        MaxResultsCap: 20,
    };

    private apiKey: string | undefined;

    public async CheckAvailability(_contextUser: UserInfo): Promise<void> {
        this.apiKey = this.GetSecret('apiKey', 'PERPLEXITY_API_KEY');
        if (this.apiKey) {
            this.MarkAvailable();
        } else {
            this.MarkUnavailable(
                'No Perplexity API key. Set it on the linked Credential (key `apiKey`) or as PERPLEXITY_API_KEY.',
            );
        }
    }

    public async ExecuteSearch(
        params: WebSearchParams,
        _contextUser: UserInfo,
    ): Promise<WebSearchProviderResponse> {
        const body: Record<string, unknown> = {
            query: params.Query,
            max_results: this.ResolveMaxResults(params.MaxResults),
        };

        // Truncated rather than rejected: Perplexity 400s on an over-long list, and the first
        // 20 domains still express what the caller was narrowing to.
        const domains = (params.IncludeDomains ?? []).slice(0, PerplexityWebSearchProvider.MAX_DOMAIN_FILTERS);
        if (domains.length > 0) {
            body.search_domain_filter = domains;
        }
        const recency = this.mapRecency(params);
        if (recency) {
            body.search_recency_filter = recency;
        }
        if (params.Country) {
            body.country = params.Country.toUpperCase();
        }

        try {
            const response = await HttpPost<PerplexitySearchResponse>(
                PerplexityWebSearchProvider.SEARCH_ENDPOINT,
                body,
                { Headers: { Authorization: `Bearer ${this.apiKey}` }, Timeout: 30000 },
            );

            if (!response.Data) {
                return failure('transient', 'Empty response from Perplexity Search.');
            }

            const hits = (response.Data.results ?? []).map((item) => this.toHit(item));
            const answer = params.IncludeAnswer ? await this.fetchAnswer(params) : undefined;
            return { Success: true, Hits: hits, Answer: answer };
        } catch (e) {
            return classifyHttpFailure(e, 'Perplexity');
        }
    }

    /**
     * Second call to the Sonar chat models, made only when an answer was explicitly requested.
     *
     * A failure here does not fail the search — the hits are already in hand and are the more
     * valuable half, so the answer is simply absent.
     */
    private async fetchAnswer(params: WebSearchParams): Promise<string | undefined> {
        try {
            const response = await HttpPost<PerplexityChatResponse>(
                PerplexityWebSearchProvider.CHAT_ENDPOINT,
                {
                    model: this.GetConfigValue<string>('answerModel') ?? 'sonar',
                    messages: [{ role: 'user', content: params.Query }],
                    max_tokens: this.GetConfigValue<number>('answerMaxTokens') ?? 1000,
                    stream: false,
                },
                { Headers: { Authorization: `Bearer ${this.apiKey}` }, Timeout: 60000 },
            );
            return response.Data?.choices?.[0]?.message?.content || undefined;
        } catch {
            // Deliberately swallowed and reported as absent rather than thrown — see the JSDoc.
            return undefined;
        }
    }

    private mapRecency(params: WebSearchParams): string | undefined {
        const freshness = params.Freshness;
        if (!freshness) {
            return undefined;
        }
        if (typeof freshness === 'string') {
            return freshness;
        }
        // Perplexity takes only relative windows; pick the smallest that covers the range.
        const days = Math.ceil((freshness.To.getTime() - freshness.From.getTime()) / 86400000);
        if (days <= 1) return 'day';
        if (days <= 7) return 'week';
        if (days <= 31) return 'month';
        return 'year';
    }

    private toHit(item: PerplexitySearchResult): WebSearchHit {
        const hit: WebSearchHit = {
            Title: item.title ?? '',
            URL: item.url ?? '',
            Snippet: item.snippet ?? '',
        };
        if (item.date) {
            const parsed = new Date(item.date);
            if (!isNaN(parsed.getTime())) {
                hit.PublishedAt = parsed;
            }
        }
        if (item.last_updated) {
            hit.ProviderExtras = { lastUpdated: item.last_updated };
        }
        return hit;
    }
}

/** Anti-tree-shaking anchor. */
export function LoadPerplexityWebSearchProvider(): void {
    void PerplexityWebSearchProvider;
}
