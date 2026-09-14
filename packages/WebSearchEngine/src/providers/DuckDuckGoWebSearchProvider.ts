/**
 * @fileoverview DuckDuckGo driver — keyless last resort.
 * @module @memberjunction/web-search-engine
 */

import { LogError, UserInfo } from '@memberjunction/core';
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
 * set, so coverage is thin and many ordinary queries return nothing at all. It also rate-limits
 * aggressively and without documentation.
 *
 * It earns its place because it needs **no credential**, so a host that has configured nothing
 * still gets some web capability rather than a hard failure. Treat a deployment that relies on
 * it as unconfigured, not as working.
 */
@RegisterClass(BaseWebSearchProvider, 'DuckDuckGoWebSearchProvider')
export class DuckDuckGoWebSearchProvider extends BaseWebSearchProvider {
    private static readonly ENDPOINT = 'https://api.duckduckgo.com/';
    private static readonly HTML_ENDPOINT = 'https://duckduckgo.com/html/';

    private static readonly RESULT_PATTERNS: readonly RegExp[] = [
        /<div class="[^"]*result[^"]*"[^>]*>/gs,
        /<div[^>]+data-testid="result"[^>]*>/gs,
        /<div class="[^"]*links_main[^"]*"[^>]*>/gs,
    ];
    private static readonly LINK_PATTERNS: readonly RegExp[] = [
        /<a[^>]+href="([^"]+)"[^>]*class="[^"]*result__a[^"]*"[^>]*>(.*?)<\/a>/s,
        /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/s,
    ];
    private static readonly SNIPPET_PATTERNS: readonly RegExp[] = [
        /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)<\/a>/s,
        /<span class="[^"]*result__snippet[^"]*"[^>]*>(.*?)<\/span>/s,
        /<div class="[^"]*snippet[^"]*"[^>]*>(.*?)<\/div>/s,
    ];
    private static readonly URL_DISPLAY_PATTERNS: readonly RegExp[] = [
        /<span class="[^"]*result__url[^"]*"[^>]*>(.*?)<\/span>/s,
        /<cite[^>]*>(.*?)<\/cite>/s,
    ];

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
            const hits = this.flattenTopics(response.Data.RelatedTopics ?? []).slice(0, maxResults);

            // The abstract, when present, is the most relevant thing DDG returns — it leads.
            if (response.Data.AbstractText && response.Data.AbstractURL) {
                hits.unshift({
                    Title: response.Data.Heading ?? params.Query,
                    URL: response.Data.AbstractURL,
                    Snippet: response.Data.AbstractText,
                });
            }

            if (hits.length > 0) {
                return { Success: true, Hits: hits.slice(0, maxResults) };
            }
            // The Instant Answer API answers a minority of queries. Rather than report an empty
            // result for one DDG surface when another would have answered, fall through to HTML.
            return await this.searchHtml(params, maxResults);
        } catch (e) {
            return classifyHttpFailure(e, 'DuckDuckGo');
        }
    }


    /** Fetch and parse the HTML results page, used when the Instant Answer API has nothing. */
    private async searchHtml(
        params: WebSearchParams,
        maxResults: number,
    ): Promise<WebSearchProviderResponse> {
        try {
            const response = await HttpGet<string>(DuckDuckGoWebSearchProvider.HTML_ENDPOINT, {
                Query: { q: params.Query },
                Headers: {
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
                Timeout: 15000,
            });
            const html = typeof response.Data === 'string' ? response.Data : '';
            if (!html) {
                return { Success: true, Hits: [] };
            }
            return { Success: true, Hits: this.parseResultsHtml(html, maxResults) };
        } catch (e) {
            return classifyHttpFailure(e, 'DuckDuckGo');
        }
    }

    /**
     * Parse DuckDuckGo's HTML results page.
     *
     * **The defect this shape exists to prevent.** The result block used to be captured with
     * `<div class="...result...">(.*?)</div>` — non-greedy, so it stopped at the first *nested*
     * `</div>`. A DuckDuckGo result block contains nested divs: the link sits near the top of one
     * and survived, while the snippet sits *after* that inner div and was cut out of the captured
     * text on every single result.
     *
     * The symptom was ten well-formed hits with `Snippet: ''` throughout — results that look
     * completely normal and carry no information, which a caller cannot tell apart from a topic
     * nobody has written about. A generated draft once reported "the research data was empty",
     * which was literally true of what it had been handed, and a reviewer counting sources
     * overruled it.
     *
     * So this slices from one result's start to the next, capturing the whole block including
     * nesting, rather than trying to balance tags with a regular expression.
     */
    private parseResultsHtml(html: string, maxResults: number): WebSearchHit[] {
        const hits: WebSearchHit[] = [];

        for (const resultPattern of DuckDuckGoWebSearchProvider.RESULT_PATTERNS) {
            if (hits.length >= maxResults) {
                break;
            }

            const starts: number[] = [];
            const startRegex = new RegExp(resultPattern.source, resultPattern.flags);
            let startMatch: RegExpExecArray | null;
            while ((startMatch = startRegex.exec(html)) !== null) {
                starts.push(startMatch.index);
                if (startMatch.index === startRegex.lastIndex) {
                    startRegex.lastIndex++; // zero-width guard
                }
            }

            for (let i = 0; i < starts.length && hits.length < maxResults; i++) {
                const block = html.slice(starts[i], starts[i + 1] ?? html.length);
                const hit = this.parseResultBlock(block);
                if (hit) {
                    hits.push(hit);
                }
            }

            if (hits.length > 0) {
                break;
            }
        }

        // Results with no text are not results. If the markup shifts again and every snippet comes
        // back empty, that must be LOUD: the failure is otherwise invisible — the caller receives
        // the expected number of well-formed objects with the only meaningful field blank. Logged
        // rather than thrown, because titles and URLs are still useful and discarding them would
        // be a worse answer than a noisy one.
        if (hits.length > 0 && hits.every((h) => !h.Snippet)) {
            LogError(
                `DuckDuckGoWebSearchProvider: parsed ${hits.length} result(s) and EVERY snippet is ` +
                    `empty. The result markup has almost certainly changed — callers are getting ` +
                    `titles and URLs with no content, which reads as "nothing was written about this topic".`,
            );
        }

        return hits;
    }

    /** Pull one hit out of a single result block, or null when it carries no usable link. */
    private parseResultBlock(block: string): WebSearchHit | null {
        const linkMatch = this.firstMatch(block, DuckDuckGoWebSearchProvider.LINK_PATTERNS);
        if (!linkMatch) {
            return null;
        }

        const url = this.decodeUrl(linkMatch[1]);
        const title = this.stripHtml(linkMatch[2]).trim();
        if (!url || !title || !(url.startsWith('http') || url.startsWith('//'))) {
            return null;
        }

        const snippetMatch = this.firstMatch(block, DuckDuckGoWebSearchProvider.SNIPPET_PATTERNS);
        const displayMatch = this.firstMatch(block, DuckDuckGoWebSearchProvider.URL_DISPLAY_PATTERNS);

        return {
            Title: title,
            URL: (url.startsWith('//') ? `https:${url}` : url).trim(),
            Snippet: snippetMatch ? this.stripHtml(snippetMatch[1]).trim() : '',
            DisplayURL: displayMatch ? this.stripHtml(displayMatch[1]).trim() : this.extractDomain(url),
        };
    }

    private firstMatch(input: string, patterns: readonly RegExp[]): RegExpExecArray | null {
        for (const pattern of patterns) {
            const match = new RegExp(pattern.source, pattern.flags).exec(input);
            if (match) {
                return match;
            }
        }
        return null;
    }

    /** DuckDuckGo wraps outbound links in a redirect carrying the real URL in `uddg`. */
    private decodeUrl(encodedUrl: string): string {
        try {
            const match = encodedUrl.match(/uddg=([^&]+)/);
            return match ? decodeURIComponent(match[1]) : encodedUrl;
        } catch {
            return encodedUrl;
        }
    }

    private stripHtml(input: string): string {
        return input
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ');
    }

    private extractDomain(url: string): string {
        try {
            return new URL(url.startsWith('//') ? `https:${url}` : url).hostname;
        } catch {
            return '';
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
                // DDG puts "Title - description" in one string; split on the first dash only.
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
