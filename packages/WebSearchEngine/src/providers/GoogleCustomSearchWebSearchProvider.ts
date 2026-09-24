/**
 * @fileoverview Google Custom Search driver — retiring 2027-01-01.
 * @module @memberjunction/web-search-engine
 */

import { UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { HttpGet } from '@memberjunction/network-utils';
import { BaseWebSearchProvider } from '../BaseWebSearchProvider';
import { WebSearchCapabilities, WebSearchHit, WebSearchParams, WebSearchProviderResponse } from '../types';
import { ClassifyHttpFailure, Failure } from './httpFailure';

interface GoogleSearchItem {
    title?: string;
    link?: string;
    displayLink?: string;
    snippet?: string;
}

interface GoogleSearchResponse {
    items?: GoogleSearchItem[];
    searchInformation?: { totalResults?: string };
}

/**
 * Searches through the Google Custom Search JSON API.
 *
 * **This provider has an end date.** Google closed the API to new customers during 2025 and
 * discontinues it on **2027-01-01**. It ships so that hosts already holding a key keep working
 * through the transition, and it is ordered behind Brave and Tavily deliberately.
 *
 * It needs no dated code change to retire: once Google stops serving, calls fail, the engine
 * fails over, and removing the metadata row takes it out of rotation entirely. A host that
 * never had a key sees `CheckAvailability` self-disable it on the first config, which is the
 * ordinary "not configured here" path rather than an error.
 *
 * Credential keys `apiKey` and `cx`; environment fallbacks `GOOGLE_CUSTOM_SEARCH_API_KEY`
 * and `GOOGLE_CUSTOM_SEARCH_CX`.
 */
@RegisterClass(BaseWebSearchProvider, 'GoogleCustomSearchWebSearchProvider')
export class GoogleCustomSearchWebSearchProvider extends BaseWebSearchProvider {
    private static readonly ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

    public readonly Capabilities: WebSearchCapabilities = {
        Answer: false,
        DomainFilter: true,
        Freshness: true,
        Region: true,
        // Google serves at most 10 per request and indexes only the first 100 results.
        MaxResultsCap: 10,
    };

    private apiKey: string | undefined;
    private cx: string | undefined;

    public async CheckAvailability(_contextUser: UserInfo): Promise<void> {
        this.apiKey = this.GetSecret('apiKey', 'GOOGLE_CUSTOM_SEARCH_API_KEY');
        this.cx = this.GetSecret('cx', 'GOOGLE_CUSTOM_SEARCH_CX');
        if (this.apiKey && this.cx) {
            this.MarkAvailable();
        } else {
            this.MarkUnavailable(
                'Google Custom Search needs both an API key and a search engine ID (cx). ' +
                    'Note the API is closed to new customers and is discontinued on 2027-01-01.',
            );
        }
    }

    public async ExecuteSearch(
        params: WebSearchParams,
        _contextUser: UserInfo,
    ): Promise<WebSearchProviderResponse> {
        const query: Record<string, string | number> = {
            key: this.apiKey ?? '',
            cx: this.cx ?? '',
            q: params.Query,
            num: this.ResolveMaxResults(params.MaxResults),
        };

        if (params.SafeSearch) {
            query.safe = params.SafeSearch === 'strict' ? 'active' : 'off';
        }
        // Google takes a single site restriction, so only the first include domain is expressible.
        if (params.IncludeDomains?.length) {
            query.siteSearch = params.IncludeDomains[0];
            query.siteSearchFilter = 'i';
        } else if (params.ExcludeDomains?.length) {
            query.siteSearch = params.ExcludeDomains[0];
            query.siteSearchFilter = 'e';
        }
        const dateRestrict = this.mapFreshness(params);
        if (dateRestrict) {
            query.dateRestrict = dateRestrict;
        }
        if (params.Country) {
            query.gl = params.Country.toLowerCase();
        }

        try {
            const response = await HttpGet<GoogleSearchResponse>(
                GoogleCustomSearchWebSearchProvider.ENDPOINT,
                { Query: query, Timeout: 15000 },
            );
            if (!response.Data) {
                return Failure('transient', 'Empty response from Google Custom Search.');
            }
            return {
                Success: true,
                Hits: (response.Data.items ?? []).map((item) => this.toHit(item)),
            };
        } catch (e) {
            return ClassifyHttpFailure(e, 'Google Custom Search');
        }
    }

    /** Google expresses recency as `d7`, `w2`, `m3`, `y1`. */
    private mapFreshness(params: WebSearchParams): string | undefined {
        const freshness = params.Freshness;
        if (!freshness) {
            return undefined;
        }
        if (typeof freshness === 'string') {
            return { day: 'd1', week: 'w1', month: 'm1', year: 'y1' }[freshness];
        }
        const days = Math.max(1, Math.ceil((freshness.To.getTime() - freshness.From.getTime()) / 86400000));
        return `d${days}`;
    }

    private toHit(item: GoogleSearchItem): WebSearchHit {
        return {
            Title: item.title ?? '',
            URL: item.link ?? '',
            Snippet: item.snippet ?? '',
            DisplayURL: item.displayLink ?? undefined,
        };
    }
}

/** Anti-tree-shaking anchor. */
export function LoadGoogleCustomSearchWebSearchProvider(): void {
    void GoogleCustomSearchWebSearchProvider;
}
