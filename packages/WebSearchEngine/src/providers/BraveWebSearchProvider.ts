/**
 * @fileoverview Brave Search driver.
 * @module @memberjunction/web-search-engine
 */

import { UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { HttpGet } from '@memberjunction/network-utils';
import { BaseWebSearchProvider } from '../BaseWebSearchProvider';
import {
    WebSearchCapabilities,
    WebSearchHit,
    WebSearchParams,
    WebSearchProviderResponse,
} from '../types';
import { classifyHttpFailure, failure } from './httpFailure';

interface BraveAPIWebResult {
    title?: string;
    url?: string;
    description?: string;
    age?: string;
    page_age?: string;
    extra_snippets?: string[];
    meta_url?: { netloc?: string; hostname?: string };
}

interface BraveAPIResponse {
    web?: { results?: BraveAPIWebResult[] };
    query?: { original?: string; altered?: string };
}

/**
 * Searches the web through the Brave Search API.
 *
 * Brave is the recommended default for a structural reason rather than a qualitative one: it
 * serves from **its own index** rather than reselling Google's or Bing's. Every SERP-proxy
 * vendor, and the Google Custom Search JSON API that this engine exists to replace, depends on
 * a search engine continuing to permit that access. Brave does not, so it fails independently
 * of every other driver here — which is the entire point of having a provider set.
 *
 * Credential key `apiKey`; environment fallback `BRAVE_SEARCH_API_KEY`.
 */
@RegisterClass(BaseWebSearchProvider, 'BraveWebSearchProvider')
export class BraveWebSearchProvider extends BaseWebSearchProvider {
    private static readonly ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
    /** Brave rejects queries longer than this outright. */
    private static readonly MAX_QUERY_CHARS = 400;
    /** Brave's cap on the pagination offset, in pages. */
    private static readonly MAX_OFFSET = 9;

    public readonly Capabilities: WebSearchCapabilities = {
        Answer: false,
        DomainFilter: true,
        Freshness: true,
        Region: true,
        MaxResultsCap: 20,
    };

    private apiKey: string | undefined;

    public async CheckAvailability(_contextUser: UserInfo): Promise<void> {
        this.apiKey = this.GetSecret('apiKey', 'BRAVE_SEARCH_API_KEY');
        if (this.apiKey) {
            this.MarkAvailable();
        } else {
            this.MarkUnavailable(
                'No Brave API key. Set it on the linked Credential (key `apiKey`) or as BRAVE_SEARCH_API_KEY.',
            );
        }
    }

    public async ExecuteSearch(
        params: WebSearchParams,
        _contextUser: UserInfo,
    ): Promise<WebSearchProviderResponse> {
        // Rejected rather than truncated: silently cutting a query changes what was asked and
        // returns confident results for a different question. Permanent — no other provider
        // will accept it either.
        if (params.Query.length > BraveWebSearchProvider.MAX_QUERY_CHARS) {
            return failure(
                'permanent',
                `Query is ${params.Query.length} characters; Brave's limit is ${BraveWebSearchProvider.MAX_QUERY_CHARS}.`,
            );
        }

        const q = this.applyDomainFilters(params);
        if (q.length > BraveWebSearchProvider.MAX_QUERY_CHARS) {
            return failure(
                'permanent',
                `Query plus domain filters is ${q.length} characters; Brave's limit is ${BraveWebSearchProvider.MAX_QUERY_CHARS}.`,
            );
        }

        const query: Record<string, string | number> = {
            q,
            count: this.ResolveMaxResults(params.MaxResults),
            offset: 0,
            safesearch: params.SafeSearch ?? 'moderate',
        };

        const freshness = this.mapFreshness(params);
        if (freshness) {
            query.freshness = freshness;
        }
        if (params.Country) {
            query.country = params.Country.toUpperCase();
        }
        if (params.Language) {
            query.search_lang = params.Language.toLowerCase();
        }

        try {
            const response = await HttpGet<BraveAPIResponse>(BraveWebSearchProvider.ENDPOINT, {
                Query: query,
                Headers: {
                    'X-Subscription-Token': this.apiKey ?? '',
                    Accept: 'application/json',
                },
                Timeout: 15000,
            });

            if (!response.Data) {
                return failure('transient', 'Empty response from Brave Search.');
            }

            return {
                Success: true,
                Hits: (response.Data.web?.results ?? []).map((item) => this.toHit(item)),
            };
        } catch (e) {
            return classifyHttpFailure(e, 'Brave');
        }
    }

    /**
     * Brave has no domain-filter request parameter — it expresses domain scoping through query
     * operators, so that is how the capability is honoured. Includes become an OR-group of
     * `site:` terms; excludes become `-site:` terms.
     */
    private applyDomainFilters(params: WebSearchParams): string {
        const parts: string[] = [params.Query.trim()];
        const include = (params.IncludeDomains ?? []).map((d) => d.trim()).filter(Boolean);
        const exclude = (params.ExcludeDomains ?? []).map((d) => d.trim()).filter(Boolean);

        if (include.length === 1) {
            parts.push(`site:${include[0]}`);
        } else if (include.length > 1) {
            parts.push(`(${include.map((d) => `site:${d}`).join(' OR ')})`);
        }
        for (const domain of exclude) {
            parts.push(`-site:${domain}`);
        }
        return parts.join(' ');
    }

    /** Brave expresses relative windows as pd/pw/pm/py and ranges as `YYYY-MM-DDtoYYYY-MM-DD`. */
    private mapFreshness(params: WebSearchParams): string | undefined {
        const freshness = params.Freshness;
        if (!freshness) {
            return undefined;
        }
        if (typeof freshness === 'string') {
            return { day: 'pd', week: 'pw', month: 'pm', year: 'py' }[freshness];
        }
        const iso = (d: Date) => d.toISOString().slice(0, 10);
        return `${iso(freshness.From)}to${iso(freshness.To)}`;
    }

    private toHit(item: BraveAPIWebResult): WebSearchHit {
        const hit: WebSearchHit = {
            Title: item.title ?? '',
            URL: item.url ?? '',
            Snippet: item.description ?? '',
            DisplayURL: item.meta_url?.netloc ?? item.meta_url?.hostname ?? undefined,
        };
        if (item.page_age) {
            const parsed = new Date(item.page_age);
            if (!isNaN(parsed.getTime())) {
                hit.PublishedAt = parsed;
            }
        }
        // Brave's relative age string and extra snippets have no slot in the normalised shape,
        // and they are part of why Brave is worth having — so they ride along here.
        const extras: Record<string, unknown> = {};
        if (item.age) {
            extras.age = item.age;
        }
        if (item.extra_snippets?.length) {
            extras.extraSnippets = item.extra_snippets;
        }
        if (Object.keys(extras).length > 0) {
            hit.ProviderExtras = extras;
        }
        return hit;
    }
}

/** Anti-tree-shaking anchor — importing this module is what runs the @RegisterClass decorator. */
export function LoadBraveWebSearchProvider(): void {
    void BraveWebSearchProvider;
}
