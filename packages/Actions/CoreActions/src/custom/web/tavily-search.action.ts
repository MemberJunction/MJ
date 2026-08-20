import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import axios from "axios";
import { getApiIntegrationsConfig } from "../../config";

/** One result from Tavily's /search endpoint. */
export interface TavilySearchResultItem {
    title: string;
    url: string;
    /** Extracted page content, already trimmed by Tavily to what an LLM needs. */
    content: string;
    /**
     * Tavily's relevance score for this result against the query, 0-1.
     *
     * It is a *relative* ranking signal within one response, not a calibrated
     * probability — do not compare scores across queries, and do not hard-code
     * thresholds against it.
     */
    score: number;
    /** Only populated when `Topic` is 'news'; absent otherwise. */
    publishedDate?: string;
    /** Only populated when `IncludeRawContent` is set. */
    rawContent?: string;
}

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
    images?: unknown[];
    response_time?: number;
}

/**
 * Action that searches the web through Tavily, a search API built for LLM
 * consumption: results arrive as extracted page content rather than as snippets
 * plus links to go fetch.
 *
 * Two things distinguish it from the other search actions in this package.
 * `Topic: 'news'` gives a date-filtered news index with `PublishedDate` on every
 * result, which is what makes recency-sensitive questions answerable. And
 * `IncludeAnswer` returns a synthesized answer alongside the results, so a caller
 * that only needs the conclusion does not have to run its own summarization pass.
 *
 * Authentication is `Authorization: Bearer <key>`. Tavily also still accepts an
 * `api_key` field in the request body, but that form is legacy and puts the
 * credential in the payload, so it is not used here.
 *
 * @example
 * ```typescript
 * // Basic search
 * await runAction({
 *   ActionName: 'Tavily Search',
 *   Params: [{ Name: 'Query', Value: 'association management software trends' }]
 * });
 *
 * // Recent news, with a synthesized answer
 * await runAction({
 *   ActionName: 'Tavily Search',
 *   Params: [
 *     { Name: 'Query', Value: 'nonprofit membership dues changes' },
 *     { Name: 'Topic', Value: 'news' },
 *     { Name: 'Days', Value: 7 },
 *     { Name: 'IncludeAnswer', Value: true }
 *   ]
 * });
 *
 * // Advanced depth, restricted to two domains
 * await runAction({
 *   ActionName: 'Tavily Search',
 *   Params: [
 *     { Name: 'Query', Value: 'IRS Form 990 filing requirements' },
 *     { Name: 'SearchDepth', Value: 'advanced' },
 *     { Name: 'IncludeDomains', Value: ['irs.gov', 'councilofnonprofits.org'] }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Tavily Search")
export class TavilySearchAction extends BaseAction {
    /** Tavily's cap on results per request. */
    private static readonly MAX_RESULTS = 20;
    private static readonly DEFAULT_MAX_RESULTS = 10;
    private static readonly ENDPOINT = 'https://api.tavily.com/search';

    /**
     * Executes the Tavily search.
     *
     * @param params - The action parameters containing:
     *   - Query: Search query text (required)
     *   - SearchDepth: 'basic' (default) or 'advanced'. Advanced costs more Tavily
     *     credits per call and returns better-extracted content
     *   - Topic: 'general' (default) or 'news'. 'news' is the only topic that
     *     returns publication dates and the only one `Days` applies to
     *   - Days: For Topic 'news', how far back to search (default 3 at Tavily)
     *   - MaxResults: 1-20 (default 10)
     *   - IncludeAnswer: Return a synthesized answer alongside results (default false)
     *   - IncludeRawContent: Return full page text per result (default false) —
     *     this can be very large, so it is off unless asked for
     *   - IncludeDomains: Only return results from these domains
     *   - ExcludeDomains: Never return results from these domains
     *
     * @returns Search results, and the synthesized answer when requested
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const query = this.getStringParam(params, 'query');
        if (!query) {
            return this.createErrorResult("Query parameter is required", "MISSING_QUERY");
        }

        const apiKey = getApiIntegrationsConfig().tavilyApiKey;
        if (!apiKey) {
            return this.createErrorResult(
                "Tavily API key not found. Set tavilyApiKey in mj.config.cjs or the TAVILY_API_KEY environment variable",
                "MISSING_API_KEY"
            );
        }

        const searchDepth = (this.getStringParam(params, 'searchdepth') || 'basic').toLowerCase();
        if (searchDepth !== 'basic' && searchDepth !== 'advanced') {
            return this.createErrorResult(
                `SearchDepth must be 'basic' or 'advanced' (got '${searchDepth}')`,
                "INVALID_SEARCH_DEPTH"
            );
        }

        const topic = (this.getStringParam(params, 'topic') || 'general').toLowerCase();
        if (topic !== 'general' && topic !== 'news') {
            return this.createErrorResult(
                `Topic must be 'general' or 'news' (got '${topic}')`,
                "INVALID_TOPIC"
            );
        }

        // Clamped rather than rejected: a caller asking for 50 results wants as many
        // as possible, and Tavily rejects the whole request above its cap.
        const requestedMaxResults = this.getNumericParam(params, 'maxresults', TavilySearchAction.DEFAULT_MAX_RESULTS);
        const maxResults = Math.min(Math.max(Math.floor(requestedMaxResults), 1), TavilySearchAction.MAX_RESULTS);

        const includeAnswer = this.getBooleanParam(params, 'includeanswer', false);
        const includeRawContent = this.getBooleanParam(params, 'includerawcontent', false);
        const includeDomains = this.getStringArrayParam(params, 'includedomains');
        const excludeDomains = this.getStringArrayParam(params, 'excludedomains');
        const days = this.getOptionalNumericParam(params, 'days');

        const requestBody: Record<string, unknown> = {
            query,
            search_depth: searchDepth,
            topic,
            max_results: maxResults,
            include_answer: includeAnswer,
            include_raw_content: includeRawContent,
        };
        if (includeDomains.length > 0) {
            requestBody.include_domains = includeDomains;
        }
        if (excludeDomains.length > 0) {
            requestBody.exclude_domains = excludeDomains;
        }
        // `days` is a news-only parameter. Sending it on a general search is at best
        // ignored, so it is dropped with the reason stated rather than passed through.
        if (days !== undefined) {
            if (topic === 'news') {
                requestBody.days = Math.max(Math.floor(days), 1);
            } else {
                this.addOutputParam(
                    params,
                    'Warnings',
                    [`Days was ignored: it only applies when Topic is 'news' (Topic was '${topic}').`]
                );
            }
        }

        try {
            const response = await axios.post<TavilyAPIResponse>(
                TavilySearchAction.ENDPOINT,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            );

            if (!response.data) {
                return this.createErrorResult("Empty response from Tavily API", "EMPTY_RESPONSE");
            }

            const results = (response.data.results ?? []).map((item): TavilySearchResultItem => {
                const mapped: TavilySearchResultItem = {
                    title: item.title ?? '',
                    url: item.url ?? '',
                    content: item.content ?? '',
                    score: typeof item.score === 'number' ? item.score : 0,
                };
                if (item.published_date) {
                    mapped.publishedDate = item.published_date;
                }
                if (item.raw_content) {
                    mapped.rawContent = item.raw_content;
                }
                return mapped;
            });

            const answer = response.data.answer ?? '';

            this.addOutputParam(params, 'Results', results);
            this.addOutputParam(params, 'ResultCount', results.length);
            if (includeAnswer) {
                this.addOutputParam(params, 'Answer', answer);
            }
            this.addOutputParam(params, 'SearchResultDetails', {
                query,
                searchDepth,
                topic,
                maxResults,
                results,
                answer,
                responseTime: response.data.response_time,
            });

            // Zero results is a real answer to a narrow query, not a failure — a
            // caller that treats it as one would retry a query that will keep
            // returning nothing. It is reported in the message instead.
            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: results.length === 0
                    ? `Tavily returned no results for '${query}'.`
                    : `Tavily returned ${results.length} result(s) for '${query}'.`
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const detail = this.describeAxiosError(error.response?.data) || error.message;

                if (status === 401 || status === 403) {
                    return this.createErrorResult(
                        `Tavily rejected the API key (HTTP ${status}): ${detail}`,
                        "INVALID_API_KEY"
                    );
                }
                if (status === 429) {
                    return this.createErrorResult(
                        `Tavily rate limit or credit allowance exceeded: ${detail}`,
                        "RATE_LIMITED"
                    );
                }
                if (status === 400 || status === 422) {
                    return this.createErrorResult(
                        `Tavily rejected the request (HTTP ${status}): ${detail}`,
                        "INVALID_REQUEST"
                    );
                }
                return this.createErrorResult(`Tavily API error: ${detail}`, "API_ERROR");
            }

            return this.createErrorResult(
                `Failed to perform Tavily search: ${error instanceof Error ? error.message : String(error)}`,
                "SEARCH_FAILED"
            );
        }
    }

    /** Pull whatever explanation the error body carries, without assuming a shape. */
    private describeAxiosError(data: unknown): string {
        if (typeof data === 'string') return data.slice(0, 500);
        if (data && typeof data === 'object') {
            const record = data as Record<string, unknown>;
            for (const key of ['detail', 'error', 'message']) {
                const value = record[key];
                if (typeof value === 'string' && value.length > 0) return value;
                // Tavily's 422 nests the explanation as { detail: { error: '…' } }.
                if (value && typeof value === 'object') {
                    const nested = (value as Record<string, unknown>).error;
                    if (typeof nested === 'string' && nested.length > 0) return nested;
                }
            }
        }
        return '';
    }

    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null) return undefined;
        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    private getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean): boolean {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null) return defaultValue;
        if (typeof param.Value === 'boolean') return param.Value;
        return String(param.Value).trim().toLowerCase() === 'true';
    }

    private getNumericParam(params: RunActionParams, paramName: string, defaultValue: number): number {
        return this.getOptionalNumericParam(params, paramName) ?? defaultValue;
    }

    private getOptionalNumericParam(params: RunActionParams, paramName: string): number | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null || param.Value === '') return undefined;
        const num = Number(param.Value);
        return isNaN(num) ? undefined : num;
    }

    /**
     * A list param, accepted as a real array or as a comma-separated string —
     * both forms arrive in practice, from agent input mappings and from humans
     * respectively.
     */
    private getStringArrayParam(params: RunActionParams, paramName: string): string[] {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        const value = param?.Value;
        if (value === undefined || value === null) return [];
        const raw = Array.isArray(value) ? value.map(v => String(v)) : String(value).split(',');
        return raw.map(v => v.trim()).filter(v => v.length > 0);
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({ Name: name, Type: 'Output', Value: value });
    }

    private createErrorResult(message: string, code: string): ActionResultSimple {
        return { Success: false, Message: message, ResultCode: code };
    }
}

export function LoadTavilySearchAction(): void {
    // Referenced by consumers to keep this registration from being tree-shaken.
}
