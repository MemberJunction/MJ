/**
 * @fileoverview Tavily driver — search built for LLM consumption.
 * @module @memberjunction/web-search-engine
 */

import { UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { HttpPost } from '@memberjunction/network-utils';
import { BaseWebSearchProvider } from '../BaseWebSearchProvider';
import { WebSearchCapabilities, WebSearchHit, WebSearchParams, WebSearchProviderResponse } from '../types';
import { ClassifyHttpFailure, Failure } from './httpFailure';

interface TavilyAPIResult {
    title?: string;
    url?: string;
    content?: string;
    score?: number;
    published_date?: string;
    raw_content?: string;
}

interface TavilyAPIResponse {
    query?: string;
    answer?: string;
    results?: TavilyAPIResult[];
    response_time?: number;
}

/**
 * Searches through Tavily, whose results arrive as **extracted page content** rather than
 * snippets plus links to go fetch — which is what makes it well suited to an agent that would
 * otherwise make a second round trip per result.
 *
 * It is an aggregator rather than an index of its own, so it inherits its upstreams' fate;
 * that is why it sits behind Brave in the default priority order rather than ahead of it.
 *
 * Credential key `apiKey`; environment fallback `TAVILY_API_KEY`.
 */
@RegisterClass(BaseWebSearchProvider, 'TavilyWebSearchProvider')
export class TavilyWebSearchProvider extends BaseWebSearchProvider {
    private static readonly ENDPOINT = 'https://api.tavily.com/search';

    public readonly Capabilities: WebSearchCapabilities = {
        Answer: true,
        DomainFilter: true,
        Freshness: true,
        Region: false,
        MaxResultsCap: 20,
    };

    private apiKey: string | undefined;

    public async CheckAvailability(_contextUser: UserInfo): Promise<void> {
        this.apiKey = this.GetSecret('apiKey', 'TAVILY_API_KEY');
        if (this.apiKey) {
            this.MarkAvailable();
        } else {
            this.MarkUnavailable(
                'No Tavily API key. Set it on the linked Credential (key `apiKey`) or as TAVILY_API_KEY.',
            );
        }
    }

    public async ExecuteSearch(
        params: WebSearchParams,
        _contextUser: UserInfo,
    ): Promise<WebSearchProviderResponse> {
        // Tavily dates results only on its news topic, so a freshness request selects that topic.
        const topic = params.Freshness ? 'news' : 'general';
        const body: Record<string, unknown> = {
            query: params.Query,
            search_depth: this.GetConfigValue<string>('searchDepth') ?? 'basic',
            topic,
            max_results: this.ResolveMaxResults(params.MaxResults),
            include_answer: params.IncludeAnswer === true,
            include_raw_content: false,
        };

        if (params.IncludeDomains?.length) {
            body.include_domains = params.IncludeDomains;
        }
        if (params.ExcludeDomains?.length) {
            body.exclude_domains = params.ExcludeDomains;
        }
        const days = this.freshnessToDays(params);
        if (days !== undefined) {
            body.days = days;
        }

        try {
            const response = await HttpPost<TavilyAPIResponse>(TavilyWebSearchProvider.ENDPOINT, body, {
                Headers: { Authorization: `Bearer ${this.apiKey}` },
                Timeout: 60000,
            });

            if (!response.Data) {
                return Failure('transient', 'Empty response from Tavily.');
            }

            return {
                Success: true,
                Hits: (response.Data.results ?? []).map((item) => this.toHit(item)),
                Answer: params.IncludeAnswer ? response.Data.answer : undefined,
            };
        } catch (e) {
            return ClassifyHttpFailure(e, 'Tavily');
        }
    }

    /** Tavily expresses recency as a day count on its news topic. */
    private freshnessToDays(params: WebSearchParams): number | undefined {
        const freshness = params.Freshness;
        if (!freshness) {
            return undefined;
        }
        if (typeof freshness === 'string') {
            return { day: 1, week: 7, month: 30, year: 365 }[freshness];
        }
        const ms = freshness.To.getTime() - freshness.From.getTime();
        return Math.max(1, Math.ceil(ms / 86400000));
    }

    private toHit(item: TavilyAPIResult): WebSearchHit {
        const hit: WebSearchHit = {
            Title: item.title ?? '',
            URL: item.url ?? '',
            Snippet: item.content ?? '',
            Score: typeof item.score === 'number' ? item.score : undefined,
        };
        if (item.published_date) {
            const parsed = new Date(item.published_date);
            if (!isNaN(parsed.getTime())) {
                hit.PublishedAt = parsed;
            }
        }
        if (item.raw_content) {
            hit.ProviderExtras = { rawContent: item.raw_content };
        }
        return hit;
    }
}

/** Anti-tree-shaking anchor. */
export function LoadTavilyWebSearchProvider(): void {
    void TavilyWebSearchProvider;
}
