import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

/**
 * Action that performs web search using DuckDuckGo's Instant Answer API
 * Returns search results with titles, URLs, and snippets
 * 
 * @example
 * ```typescript
 * // Basic web search
 * await runAction({
 *   ActionName: 'Web Search',
 *   Params: [{
 *     Name: 'SearchTerms',
 *     Value: 'TypeScript programming'
 *   }]
 * });
 * 
 * // Search with custom result count
 * await runAction({
 *   ActionName: 'Web Search',
 *   Params: [{
 *     Name: 'SearchTerms',
 *     Value: 'machine learning tutorials'
 *   }, {
 *     Name: 'MaxResults',
 *     Value: 15
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__WebSearch")
export class WebSearchAction extends BaseAction {

    /**
     * Executes the web search using DuckDuckGo's API
     * 
     * @param params - The action parameters containing:
     *   - SearchTerms: Keywords to search for (required)
     *   - MaxResults: Maximum number of results to return (default: 10, max: 30)
     *   - Region: Regional search preference (default: 'us-en')
     *   - SafeSearch: Safe search level - 'strict', 'moderate', 'off' (default: 'moderate')
     * 
     * @returns Web search results with titles, URLs, and snippets
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const searchTermsParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'searchterms');
            const maxResultsParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'maxresults');
            const regionParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'region');
            const safeSearchParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'safesearch');

            if (!searchTermsParam || !searchTermsParam.Value) {
                return {
                    Success: false,
                    Message: "SearchTerms parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const searchTerms = searchTermsParam.Value.toString().trim();
            const maxResults = Math.min(parseInt(maxResultsParam?.Value?.toString() || '10'), 30);
            const region = regionParam?.Value?.toString() || 'us-en';
            const safeSearch = safeSearchParam?.Value?.toString() || 'moderate';

            if (searchTerms.length === 0) {
                return {
                    Success: false,
                    Message: "SearchTerms cannot be empty",
                    ResultCode: "INVALID_PARAMETERS"
                };
            }

            // Use DuckDuckGo's HTML search (no API key required)
            const searchUrl = `https://html.duckduckgo.com/html/`;
            const formData = new URLSearchParams();
            formData.append('q', searchTerms);
            formData.append('kl', region);
            formData.append('safe', safeSearch === 'strict' ? 'strict' : safeSearch === 'off' ? '-1' : 'moderate');

            const response = await fetch(searchUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (compatible; MemberJunction/1.0; +https://memberjunction.org)'
                },
                body: formData
            });

            if (!response.ok) {
                return {
                    Success: false,
                    Message: `DuckDuckGo search failed: ${response.status} ${response.statusText}`,
                    ResultCode: "SEARCH_FAILED"
                };
            }

            const html = await response.text();
            const results = this.parseSearchResults(html, maxResults);

            if (results.length === 0) {
                return {
                    Success: false,
                    Message: "No search results found",
                    ResultCode: "NO_RESULTS"
                };
            }

            const resultData = {
                searchTerms,
                totalResults: results.length,
                maxResults,
                region,
                safeSearch,
                results,
                searchUrl: `https://duckduckgo.com/?q=${encodeURIComponent(searchTerms)}`
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(resultData, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to perform web search: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Parses DuckDuckGo HTML search results
     */
    private parseSearchResults(html: string, maxResults: number): any[] {
        const results: any[] = [];
        
        try {
            // Simple regex-based parsing for DuckDuckGo results
            // Look for result containers with class 'result'
            const resultRegex = /<div class="result[^"]*"[^>]*>(.*?)<\/div>/gs;
            const linkRegex = /<a[^>]+href="([^"]+)"[^>]*class="result__a"[^>]*>(.*?)<\/a>/s;
            const snippetRegex = /<a[^>]+result__snippet[^>]*>(.*?)<\/a>/s;
            const urlDisplayRegex = /<span class="result__url[^>]*>(.*?)<\/span>/s;

            let match: RegExpExecArray | null;
            let count = 0;
            
            while ((match = resultRegex.exec(html)) !== null && count < maxResults) {
                const resultHtml = match[1];
                
                const linkMatch = linkRegex.exec(resultHtml);
                if (linkMatch) {
                    const url = this.decodeUrl(linkMatch[1]);
                    const title = this.stripHtml(linkMatch[2]);
                    
                    const snippetMatch = snippetRegex.exec(resultHtml);
                    const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]) : '';
                    
                    const urlDisplayMatch = urlDisplayRegex.exec(resultHtml);
                    const displayUrl = urlDisplayMatch ? this.stripHtml(urlDisplayMatch[1]) : url;
                    
                    if (url && title && url.startsWith('http')) {
                        results.push({
                            title: title.trim(),
                            url: url.trim(),
                            displayUrl: displayUrl.trim(),
                            snippet: snippet.trim(),
                            rank: count + 1
                        });
                        count++;
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing search results:', error);
        }

        return results;
    }

    /**
     * Decodes DuckDuckGo URL redirects
     */
    private decodeUrl(encodedUrl: string): string {
        try {
            if (encodedUrl.includes('uddg=')) {
                const urlMatch = encodedUrl.match(/uddg=([^&]+)/);
                if (urlMatch) {
                    return decodeURIComponent(urlMatch[1]);
                }
            }
            return encodedUrl;
        } catch {
            return encodedUrl;
        }
    }

    /**
     * Strips HTML tags and decodes entities
     */
    private stripHtml(html: string): string {
        return html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }
}

/**
 * Loader function to ensure the WebSearchAction class is included in the bundle.
 */
export function LoadWebSearchAction() {
    // this function is a stub that is used to force the bundler to include the above class in the final bundle and not tree shake them out
}