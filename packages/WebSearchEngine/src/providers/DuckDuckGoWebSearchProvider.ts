/**
 * @fileoverview DuckDuckGo driver — keyless last resort.
 * @module @memberjunction/web-search-engine
 */

import { UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { HttpGet } from '@memberjunction/network-utils';
import { BaseWebSearchProvider } from '../BaseWebSearchProvider';
import { WebSearchCapabilities, WebSearchHit, WebSearchParams, WebSearchProviderResponse } from '../types';
import { classifyHttpFailure, failure } from './httpFailure';

interface DDGRelatedTopic {
    Text?: string;
    FirstURL?: string;
    Topics?: DDGRelatedTopic[];
}

interface DDGInstantAnswer {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: DDGRelatedTopic[];
}

/**
 * Searches through DuckDuckGo's Instant Answer API.
 *
 * **This is a last resort, and it is ordered last for good reasons.** The Instant Answer API is
 * not a web search API: it returns disambiguation topics and an abstract, not a ranked result
 * set, so it answers only a minority of queries and returns nothing at all for many ordinary
 * ones. It also rate-limits aggressively and without documentation.
 *
 * It earns its place because it needs **no credential**, so a host that has configured nothing
 * still gets some web capability rather than a hard failure. Treat a deployment that relies on
 * it as unconfigured, not as working — configure Brave or Tavily for real coverage.
 *
 * ## Why there is no HTML fallback
 *
 * An earlier version fell back to fetching and regex-parsing DuckDuckGo's HTML results page,
 * which answered far more queries. It was removed deliberately: running regular expressions over
 * remote HTML is running them over **attacker-influenceable input**, and the parser carried two
 * high-severity findings — polynomial backtracking in the result patterns (the `[^"]*…[^"]*`
 * shape) and incomplete sanitization in its tag-stripping.
 *
 * Hardening those patterns would have narrowed the surface; deleting the parser removes it. For a
 * fallback *inside* a last-resort provider that this engine already tells operators not to rely
 * on, the capability was not worth the exposure — and "the regex looks safe now" is exactly the
 * kind of claim that is true when written and wrong later. Anything needing real web coverage
 * should configure a provider with an API.
 */
@RegisterClass(BaseWebSearchProvider, 'DuckDuckGoWebSearchProvider')
export class DuckDuckGoWebSearchProvider extends BaseWebSearchProvider {
    private static readonly ENDPOINT = 'https://api.duckduckgo.com/';

    public readonly Capabilities: WebSearchCapabilities = {
        Answer: false,
        DomainFilter: false,
        Freshness: false,
        Region: false,
        MaxResultsCap: 30,
    };

    /** Keyless, so always available — which is the entire reason it is the fallback. */
    public async CheckAvailability(_contextUser: UserInfo): Promise<void> {
        this.MarkAvailable();
    }

    public async ExecuteSearch(
        params: WebSearchParams,
        _contextUser: UserInfo,
    ): Promise<WebSearchProviderResponse> {
        try {
            const response = await HttpGet<DDGInstantAnswer>(DuckDuckGoWebSearchProvider.ENDPOINT, {
                Query: { q: params.Query, format: 'json', no_html: 1, skip_disambig: 1 },
                Timeout: 15000,
            });

            if (!response.Data) {
                return failure('transient', 'Empty response from DuckDuckGo.');
            }

            const maxResults = this.ResolveMaxResults(params.MaxResults);
            const hits = this.flattenTopics(response.Data.RelatedTopics ?? []);

            // The abstract, when present, is the most relevant thing DDG returns — it leads.
            if (response.Data.AbstractText && response.Data.AbstractURL) {
                hits.unshift({
                    Title: response.Data.Heading ?? params.Query,
                    URL: response.Data.AbstractURL,
                    Snippet: response.Data.AbstractText,
                });
            }

            // Zero hits is common here and is reported honestly rather than escalated: the engine
            // treats it as a successful empty answer, so a caller that needs coverage sees the
            // gap instead of a failure it might retry.
            return { Success: true, Hits: hits.slice(0, maxResults) };
        } catch (e) {
            return classifyHttpFailure(e, 'DuckDuckGo');
        }
    }

    /** RelatedTopics nests one level for disambiguation groups; flatten to a single list. */
    private flattenTopics(topics: DDGRelatedTopic[]): WebSearchHit[] {
        const hits: WebSearchHit[] = [];
        for (const topic of topics) {
            if (topic.Topics?.length) {
                hits.push(...this.flattenTopics(topic.Topics));
                continue;
            }
            if (topic.FirstURL && topic.Text) {
                // DDG puts "Title - description" in one string; split on the first separator only.
                const separator = topic.Text.indexOf(' - ');
                hits.push({
                    Title: separator > 0 ? topic.Text.slice(0, separator) : topic.Text,
                    URL: topic.FirstURL,
                    Snippet: separator > 0 ? topic.Text.slice(separator + 3) : topic.Text,
                });
            }
        }
        return hits;
    }
}

/** Anti-tree-shaking anchor. */
export function LoadDuckDuckGoWebSearchProvider(): void {
    void DuckDuckGoWebSearchProvider;
}
