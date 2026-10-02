import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { HttpError, HttpGet, IsHttpError } from "@memberjunction/network-utils";
import { getApiIntegrationsConfig } from "../../config";

/** One result from Brave's web search endpoint, normalised to this package's naming. */
export interface BraveSearchResultItem {
    title: string;
    url: string;
    /** Brave calls this `description`; it is the result snippet. */
    snippet: string;
    /** Host as Brave displays it, e.g. `irs.gov`. Empty when Brave omits `meta_url`. */
    displayUrl: string;
    /** Human-readable relative age ("3 days ago"). Only present on results Brave dates. */
    age?: string;
    /** Publication/modification date when Brave resolved one, as an ISO-ish string. */
    pageAge?: string;
    /** Additional snippets from the same page. Only populated when `ExtraSnippets` is set. */
    extraSnippets?: string[];
}

interface BraveAPIMetaUrl {
    netloc?: string;
    hostname?: string;
}

interface BraveAPIWebResult {
    title?: string;
    url?: string;
    description?: string;
    age?: string;
    page_age?: string;
    extra_snippets?: string[];
    meta_url?: BraveAPIMetaUrl;
}

interface BraveAPIResponse {
    web?: { results?: BraveAPIWebResult[] };
    query?: { original?: string; altered?: string };
}

/**
 * Action that searches the web through the Brave Search API.
 *
 * Brave matters here for a reason that is structural rather than qualitative: it
 * serves results from **its own index** (40B+ pages) rather than reselling
 * Google's or Bing's. Every SERP-proxy vendor — and every product built on the
 * Google Custom Search JSON API, which is discontinued on 2027-01-01 — depends on
 * a search engine continuing to permit that access. Brave does not, so it fails
 * independently of the rest of this package's web-search actions. That is the
 * whole point of adding it.
 *
 * Its output shape is deliberately `title` / `url` / `snippet`, which is the shape
 * `Google Custom Search` returns today, so callers migrating off that action are
 * making a rename rather than a rewrite.
 *
 * Authentication is the `X-Subscription-Token` header. Brave requires
 * `Accept: application/json` and returns gzip, which `fetch` negotiates itself.
 *
 * @example
 * ```typescript
 * // Basic search
 * await runAction({
 *   ActionName: 'Brave Search',
 *   Params: [{ Name: 'Query', Value: 'association management software trends' }]
 * });
 *
 * // Recent results only, more of them
 * await runAction({
 *   ActionName: 'Brave Search',
 *   Params: [
 *     { Name: 'Query',     Value: 'nonprofit membership dues changes' },
 *     { Name: 'Freshness', Value: 'pw' },
 *     { Name: 'Count',     Value: 20 }
 *   ]
 * });
 *
 * // Second page, UK results, with the extra per-page snippets
 * await runAction({
 *   ActionName: 'Brave Search',
 *   Params: [
 *     { Name: 'Query',         Value: 'charity commission filing deadlines' },
 *     { Name: 'Country',       Value: 'GB' },
 *     { Name: 'Offset',        Value: 1 },
 *     { Name: 'ExtraSnippets', Value: true }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Brave Search")
export class BraveSearchAction extends BaseAction {
    private static readonly ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
    /** Brave's cap on results per request. */
    private static readonly MAX_COUNT = 20;
    private static readonly DEFAULT_COUNT = 10;
    /** Brave's cap on the pagination offset (in pages, not results). */
    private static readonly MAX_OFFSET = 9;
    /** Brave rejects queries longer than this outright. */
    private static readonly MAX_QUERY_CHARS = 400;

    private static readonly SAFESEARCH_VALUES = ['off', 'moderate', 'strict'] as const;
    /** `pd`/`pw`/`pm`/`py` = past day/week/month/year. Brave also accepts a date range. */
    private static readonly FRESHNESS_CODES = ['pd', 'pw', 'pm', 'py'] as const;
    private static readonly FRESHNESS_RANGE = /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/;

    /**
     * Executes the Brave search.
     *
     * @param params - The action parameters containing:
     *   - Query: Search query text (required, max 400 characters)
     *   - Count: 1-20 results (default 10)
     *   - Offset: Page offset 0-9 (default 0) — pages, not results
     *   - Country: 2-letter country code for localisation, e.g. 'US', 'GB'
     *   - SearchLang: Language code for results, e.g. 'en'
     *   - SafeSearch: 'off' | 'moderate' (default) | 'strict'
     *   - Freshness: 'pd' | 'pw' | 'pm' | 'py', or 'YYYY-MM-DDtoYYYY-MM-DD'
     *   - ExtraSnippets: Return additional snippets per result (default false).
     *     Brave gates this on plan tier, so it is off unless asked for
     *
     * @returns Structured web results with titles, URLs and snippets
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const query = this.getStringParam(params, 'query');
        if (!query) {
            return this.createErrorResult("Query parameter is required", "MISSING_QUERY");
        }
        // Rejected rather than truncated: silently cutting a query changes what was
        // asked and returns confident results for a different question.
        if (query.length > BraveSearchAction.MAX_QUERY_CHARS) {
            return this.createErrorResult(
                `Query is ${query.length} characters; Brave's limit is ${BraveSearchAction.MAX_QUERY_CHARS}`,
                "QUERY_TOO_LONG"
            );
        }

        const apiKey = getApiIntegrationsConfig().braveApiKey;
        if (!apiKey) {
            return this.createErrorResult(
                "Brave Search API key not found. Set braveApiKey in mj.config.cjs or the BRAVE_SEARCH_API_KEY environment variable",
                "MISSING_API_KEY"
            );
        }

        const safeSearch = (this.getStringParam(params, 'safesearch') || 'moderate').toLowerCase();
        if (!BraveSearchAction.SAFESEARCH_VALUES.includes(safeSearch as typeof BraveSearchAction.SAFESEARCH_VALUES[number])) {
            return this.createErrorResult(
                `SafeSearch must be one of ${BraveSearchAction.SAFESEARCH_VALUES.join(', ')} (got '${safeSearch}')`,
                "INVALID_SAFESEARCH"
            );
        }

        const freshness = this.getStringParam(params, 'freshness')?.toLowerCase();
        if (freshness && !this.isValidFreshness(freshness)) {
            return this.createErrorResult(
                `Freshness must be one of ${BraveSearchAction.FRESHNESS_CODES.join(', ')} or a 'YYYY-MM-DDtoYYYY-MM-DD' range (got '${freshness}')`,
                "INVALID_FRESHNESS"
            );
        }

        // Clamped rather than rejected, matching Tavily Search: a caller asking for 50
        // results wants as many as possible, and Brave rejects the whole request above its cap.
        const count = this.clamp(
            this.getNumericParam(params, 'count', BraveSearchAction.DEFAULT_COUNT),
            1,
            BraveSearchAction.MAX_COUNT
        );
        const offset = this.clamp(this.getNumericParam(params, 'offset', 0), 0, BraveSearchAction.MAX_OFFSET);
        const extraSnippets = this.getBooleanParam(params, 'extrasnippets', false);

        const requestQuery: Record<string, string | number> = { q: query, count, offset, safesearch: safeSearch };
        if (freshness) {
            requestQuery.freshness = freshness;
        }
        const country = this.getStringParam(params, 'country');
        if (country) {
            requestQuery.country = country.toUpperCase();
        }
        const searchLang = this.getStringParam(params, 'searchlang');
        if (searchLang) {
            requestQuery.search_lang = searchLang.toLowerCase();
        }
        if (extraSnippets) {
            requestQuery.extra_snippets = 'true';
        }

        try {
            const response = await HttpGet<BraveAPIResponse>(
                BraveSearchAction.ENDPOINT,
                {
                    Query: requestQuery,
                    Headers: {
                        'X-Subscription-Token': apiKey,
                        'Accept': 'application/json'
                    },
                    Timeout: 15000
                }
            );

            if (!response.Data) {
                return this.createErrorResult("Empty response from Brave Search API", "EMPTY_RESPONSE");
            }

            const results = (response.Data.web?.results ?? []).map((item): BraveSearchResultItem => {
                const mapped: BraveSearchResultItem = {
                    title: item.title ?? '',
                    url: item.url ?? '',
                    snippet: item.description ?? '',
                    displayUrl: item.meta_url?.netloc ?? item.meta_url?.hostname ?? '',
                };
                if (item.age) {
                    mapped.age = item.age;
                }
                if (item.page_age) {
                    mapped.pageAge = item.page_age;
                }
                if (item.extra_snippets && item.extra_snippets.length > 0) {
                    mapped.extraSnippets = item.extra_snippets;
                }
                return mapped;
            });

            // Brave rewrites some queries (spelling, synonyms) and reports it here. A caller
            // debugging unexpected results needs to know the engine searched for something else.
            const alteredQuery = response.Data.query?.altered;

            this.addOutputParam(params, 'Results', results);
            this.addOutputParam(params, 'ResultCount', results.length);
            this.addOutputParam(params, 'SearchResultDetails', {
                query,
                alteredQuery,
                count,
                offset,
                safeSearch,
                freshness,
                results,
            });

            // Zero results is a real answer to a narrow query, not a failure — a caller
            // that treats it as one would retry a query that will keep returning nothing.
            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: results.length === 0
                    ? `Brave returned no results for '${query}'.`
                    : `Brave returned ${results.length} result(s) for '${query}'.`
            };
        } catch (error) {
            // Status 0 is HttpError's "the request never produced a response" — a timeout or a
            // network failure. That is not an API answer, so it falls through to SEARCH_FAILED
            // rather than being dressed up as an API_ERROR with no status.
            if (IsHttpError(error) && error.Status > 0) {
                return this.mapHttpError(error);
            }
            return this.createErrorResult(
                `Failed to perform Brave search: ${error instanceof Error ? error.message : String(error)}`,
                "SEARCH_FAILED"
            );
        }
    }

    private mapHttpError(error: HttpError): ActionResultSimple {
        const status = error.Status;
        const detail = this.describeErrorBody(error.Data) || error.message;

        if (status === 401 || status === 403) {
            return this.createErrorResult(
                `Brave rejected the API key (HTTP ${status}): ${detail}`,
                "INVALID_API_KEY"
            );
        }
        if (status === 429) {
            // Brave meters by plan and, since it retired its free tier in early 2026,
            // bills overage against a stored card. A 429 here is a spend signal, not
            // just a pacing one, so it is surfaced distinctly rather than retried.
            return this.createErrorResult(
                `Brave rate limit or plan quota exceeded: ${detail}`,
                "RATE_LIMITED"
            );
        }
        if (status === 422) {
            return this.createErrorResult(
                `Brave rejected the request parameters (HTTP 422): ${detail}`,
                "INVALID_REQUEST"
            );
        }
        if (status === 400) {
            return this.createErrorResult(
                `Brave rejected the request (HTTP 400): ${detail}`,
                "INVALID_REQUEST"
            );
        }
        return this.createErrorResult(`Brave API error: ${detail}`, "API_ERROR");
    }

    /** Pull whatever explanation the error body carries, without assuming a shape. */
    private describeErrorBody(data: unknown): string {
        if (typeof data === 'string') return data.slice(0, 500);
        if (data && typeof data === 'object') {
            const record = data as Record<string, unknown>;
            // Brave nests its explanation as { error: { detail: '…' } } on 422s.
            const error = record.error;
            if (error && typeof error === 'object') {
                const nested = error as Record<string, unknown>;
                for (const key of ['detail', 'message', 'code']) {
                    const value = nested[key];
                    if (typeof value === 'string' && value.length > 0) return value;
                }
            }
            for (const key of ['detail', 'message', 'error']) {
                const value = record[key];
                if (typeof value === 'string' && value.length > 0) return value;
            }
        }
        return '';
    }

    private isValidFreshness(value: string): boolean {
        if (BraveSearchAction.FRESHNESS_CODES.includes(value as typeof BraveSearchAction.FRESHNESS_CODES[number])) {
            return true;
        }
        return BraveSearchAction.FRESHNESS_RANGE.test(value);
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(Math.floor(value), min), max);
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
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null || param.Value === '') return defaultValue;
        const num = Number(param.Value);
        return isNaN(num) ? defaultValue : num;
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({ Name: name, Type: 'Output', Value: value });
    }

    private createErrorResult(message: string, code: string): ActionResultSimple {
        return { Success: false, Message: message, ResultCode: code };
    }
}

export function LoadBraveSearchAction(): void {
    // Referenced by consumers to keep this registration from being tree-shaken.
}
