import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { HttpError, HttpPost, IsHttpError } from "@memberjunction/network-utils";
import { getApiIntegrationsConfig } from "../../config";

/** The slice of Perplexity's `/chat/completions` response this action reads. */
interface PerplexityChatResponse {
    choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
    }>;
    citations?: string[];
    images?: Array<Record<string, unknown>>;
    related_questions?: string[];
    usage?: Record<string, unknown>;
}

/** One result from Perplexity's `/search` endpoint, normalised to this package's naming. */
export interface PerplexitySearchResultItem {
    title: string;
    url: string;
    snippet: string;
    /** Publication date when Perplexity resolved one. */
    date?: string;
    /** When Perplexity last saw the page change. */
    lastUpdated?: string;
}

interface PerplexityAPISearchResult {
    title?: string;
    url?: string;
    snippet?: string;
    date?: string;
    last_updated?: string;
}

interface PerplexitySearchResponse {
    results?: PerplexityAPISearchResult[];
    id?: string;
    server_time?: string;
}

/** Which Perplexity product a call routes to. */
export type PerplexitySearchMode = 'search' | 'answer';

/**
 * Action that queries Perplexity. It fronts **two different products**, selected
 * by `Mode`, because they answer different questions and cost different money.
 *
 * - **`search` (default)** calls `POST /search`, Perplexity's raw search endpoint.
 *   It returns ranked `title` / `url` / `snippet` results with no model in the
 *   loop: sub-second, flat-priced per query, and deterministic enough to cache.
 *   This is the mode to use when something wants *sources*.
 * - **`answer`** calls `POST /chat/completions` against the Sonar models. It
 *   returns synthesised prose plus a flat citation list, takes seconds rather
 *   than milliseconds, and bills per token. Use it when a caller genuinely wants
 *   a written answer rather than results to read.
 *
 * `search` is the default deliberately. Every caller that omitted `Mode` before
 * this parameter existed was paying Sonar generation prices, and waiting for
 * generation latency, to obtain what was usually just a list of links — and
 * `Citations` is still populated in `search` mode, so callers that only read the
 * URL list keep working unchanged.
 *
 * @example
 * ```typescript
 * // Structured results — fast, flat-priced (default)
 * await runAction({
 *   ActionName: 'Perplexity Search',
 *   Params: [{ Name: 'Query', Value: 'latest developments in quantum computing' }]
 * });
 *
 * // Structured results, recent only, restricted to two domains
 * await runAction({
 *   ActionName: 'Perplexity Search',
 *   Params: [
 *     { Name: 'Query',               Value: 'IRS Form 990 filing changes' },
 *     { Name: 'MaxResults',          Value: 15 },
 *     { Name: 'SearchRecencyFilter', Value: 'month' },
 *     { Name: 'SearchDomainFilter',  Value: ['irs.gov', 'councilofnonprofits.org'] }
 *   ]
 * });
 *
 * // A written answer with citations — slower, token-billed
 * await runAction({
 *   ActionName: 'Perplexity Search',
 *   Params: [
 *     { Name: 'Query', Value: 'summarise the 2026 nonprofit reporting changes' },
 *     { Name: 'Mode',  Value: 'answer' },
 *     { Name: 'Model', Value: 'sonar-pro' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Perplexity Search")
export class PerplexitySearchAction extends BaseAction {
    private static readonly SEARCH_ENDPOINT = 'https://api.perplexity.ai/search';
    private static readonly CHAT_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
    /** Perplexity's cap on results per web-search request. */
    private static readonly MAX_RESULTS = 20;
    private static readonly DEFAULT_MAX_RESULTS = 10;
    /** Perplexity's cap on the domain allow/deny list. */
    private static readonly MAX_DOMAIN_FILTERS = 20;
    private static readonly RECENCY_VALUES = ['hour', 'day', 'week', 'month', 'year'] as const;

    /**
     * Executes the Perplexity call.
     *
     * @param params - The action parameters containing:
     *   - Query: Search query text (required)
     *   - Mode: 'search' (default) for structured results, or 'answer' for Sonar prose
     *   - SearchDomainFilter: Restrict to these domains (max 20) — both modes
     *   - SearchRecencyFilter: 'hour' | 'day' | 'week' | 'month' | 'year' — both modes
     *
     *   `search` mode only:
     *   - MaxResults: 1-20 (default 10)
     *   - Country: 2-letter country code for localisation
     *
     *   `answer` mode only:
     *   - Model: 'sonar' (default), 'sonar-pro', 'sonar-reasoning-pro', 'sonar-deep-research'.
     *     Note the legacy `llama-3.1-sonar-*` identifiers were retired by Perplexity in
     *     February 2025 and now fail with an invalid-model error
     *   - MaxTokens, Temperature, TopP
     *   - ReturnImages, ReturnRelatedQuestions
     *
     * @returns Structured results in `search` mode; prose plus citations in `answer` mode
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const query = this.getStringParam(params, 'query');
        if (!query) {
            return this.createErrorResult("Query parameter is required", "MISSING_QUERY");
        }

        const mode = (this.getStringParam(params, 'mode') || 'search').trim().toLowerCase();
        if (mode !== 'search' && mode !== 'answer') {
            return this.createErrorResult(
                `Mode must be 'search' or 'answer' (got '${mode}')`,
                "INVALID_MODE"
            );
        }

        const apiKey = getApiIntegrationsConfig().perplexityApiKey;
        if (!apiKey) {
            return this.createErrorResult(
                "Perplexity API key not found. Set perplexityApiKey in mj.config.cjs or PERPLEXITY_API_KEY environment variable",
                "MISSING_API_KEY"
            );
        }

        const recency = this.getStringParam(params, 'searchrecencyfilter')?.trim().toLowerCase();
        if (recency && !PerplexitySearchAction.RECENCY_VALUES.includes(recency as typeof PerplexitySearchAction.RECENCY_VALUES[number])) {
            return this.createErrorResult(
                `SearchRecencyFilter must be one of ${PerplexitySearchAction.RECENCY_VALUES.join(', ')} (got '${recency}')`,
                "INVALID_RECENCY_FILTER"
            );
        }

        // Truncated rather than rejected: Perplexity 400s on an over-long list, and the
        // first 20 domains still express what the caller was narrowing to.
        const domainFilter = this.getStringArrayParam(params, 'searchdomainfilter')
            .slice(0, PerplexitySearchAction.MAX_DOMAIN_FILTERS);

        try {
            return mode === 'search'
                ? await this.runSearchMode(params, { query, apiKey, recency, domainFilter })
                : await this.runAnswerMode(params, { query, apiKey, recency, domainFilter });
        } catch (error) {
            // Status 0 is HttpError's "the request never produced a response" — a timeout or a
            // network failure. That is not an API answer, so it falls through to SEARCH_FAILED.
            if (IsHttpError(error) && error.Status > 0) {
                return this.mapHttpError(error);
            }
            return this.createErrorResult(
                `Failed to perform Perplexity search: ${error instanceof Error ? error.message : String(error)}`,
                "SEARCH_FAILED"
            );
        }
    }

    /** `POST /search` — structured results, no model in the loop. */
    private async runSearchMode(
        params: RunActionParams,
        ctx: { query: string; apiKey: string; recency?: string; domainFilter: string[] }
    ): Promise<ActionResultSimple> {
        // Clamped rather than rejected, matching Tavily and Brave: a caller asking for
        // 50 wants as many as possible, and Perplexity rejects the whole request above its cap.
        const maxResults = Math.min(
            Math.max(Math.floor(this.getNumericParam(params, 'maxresults', PerplexitySearchAction.DEFAULT_MAX_RESULTS)), 1),
            PerplexitySearchAction.MAX_RESULTS
        );

        const requestBody: Record<string, unknown> = { query: ctx.query, max_results: maxResults };
        if (ctx.domainFilter.length > 0) {
            requestBody.search_domain_filter = ctx.domainFilter;
        }
        if (ctx.recency) {
            requestBody.search_recency_filter = ctx.recency;
        }
        const country = this.getStringParam(params, 'country');
        if (country) {
            requestBody.country = country.trim().toUpperCase();
        }

        const response = await HttpPost<PerplexitySearchResponse>(
            PerplexitySearchAction.SEARCH_ENDPOINT,
            requestBody,
            { Headers: { 'Authorization': `Bearer ${ctx.apiKey}` }, Timeout: 30000 }
        );

        if (!response.Data) {
            return this.createErrorResult("Empty response from Perplexity Search API", "EMPTY_RESPONSE");
        }

        const results = (response.Data.results ?? []).map((item): PerplexitySearchResultItem => {
            const mapped: PerplexitySearchResultItem = {
                title: item.title ?? '',
                url: item.url ?? '',
                snippet: item.snippet ?? '',
            };
            if (item.date) {
                mapped.date = item.date;
            }
            if (item.last_updated) {
                mapped.lastUpdated = item.last_updated;
            }
            return mapped;
        });

        // `Citations` is emitted here too, holding the result URLs. Callers written against
        // the old answer-only behaviour read that param, and this keeps them working when
        // the default mode changed underneath them.
        const citations = results.map(r => r.url).filter(u => u.length > 0);

        this.addOutputParam(params, 'Results', results);
        this.addOutputParam(params, 'ResultCount', results.length);
        this.addOutputParam(params, 'Citations', citations);
        this.addOutputParam(params, 'CitationCount', citations.length);
        this.addOutputParam(params, 'SearchResultDetails', {
            query: ctx.query,
            mode: 'search',
            maxResults,
            results,
            citations,
            serverTime: response.Data.server_time,
        });

        // Zero results is a real answer to a narrow query, not a failure.
        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: results.length === 0
                ? `Perplexity returned no results for '${ctx.query}'.`
                : `Perplexity returned ${results.length} result(s) for '${ctx.query}'.`
        };
    }

    /** `POST /chat/completions` — Sonar prose plus citations. */
    private async runAnswerMode(
        params: RunActionParams,
        ctx: { query: string; apiKey: string; recency?: string; domainFilter: string[] }
    ): Promise<ActionResultSimple> {
        const model = this.getStringParam(params, 'model') || 'sonar';
        const returnImages = this.getBooleanParam(params, 'returnimages', false);
        const returnRelatedQuestions = this.getBooleanParam(params, 'returnrelatedquestions', false);

        const requestBody: Record<string, unknown> = {
            model,
            messages: [{ role: 'user', content: ctx.query }],
            max_tokens: this.getNumericParam(params, 'maxtokens', 1000),
            temperature: this.getNumericParam(params, 'temperature', 0.2),
            top_p: this.getNumericParam(params, 'topp', 0.9),
            return_images: returnImages,
            return_related_questions: returnRelatedQuestions,
            stream: false
        };
        if (ctx.domainFilter.length > 0) {
            requestBody.search_domain_filter = ctx.domainFilter;
        }
        if (ctx.recency) {
            requestBody.search_recency_filter = ctx.recency;
        }

        const response = await HttpPost<PerplexityChatResponse>(
            PerplexitySearchAction.CHAT_ENDPOINT,
            requestBody,
            { Headers: { 'Authorization': `Bearer ${ctx.apiKey}` }, Timeout: 60000 }
        );

        if (!response.Data) {
            return this.createErrorResult("Empty response from Perplexity API", "EMPTY_RESPONSE");
        }

        const result = response.Data;
        const choice = result.choices?.[0];
        const content = choice?.message?.content || '';
        const citations = result.citations || [];
        const images = result.images || [];
        const relatedQuestions = result.related_questions || [];

        const outputData = {
            query: ctx.query,
            mode: 'answer',
            model,
            content,
            citations,
            images,
            relatedQuestions,
            usage: result.usage || {},
            finishReason: choice?.finish_reason
        };

        this.addOutputParam(params, 'Content', content);
        this.addOutputParam(params, 'Citations', citations);
        this.addOutputParam(params, 'CitationCount', citations.length);
        if (returnImages && images.length > 0) {
            this.addOutputParam(params, 'Images', images);
            this.addOutputParam(params, 'ImageCount', images.length);
        }
        if (returnRelatedQuestions && relatedQuestions.length > 0) {
            this.addOutputParam(params, 'RelatedQuestions', relatedQuestions);
            this.addOutputParam(params, 'RelatedQuestionCount', relatedQuestions.length);
        }
        this.addOutputParam(params, 'Usage', result.usage);
        this.addOutputParam(params, 'SearchResultDetails', outputData);

        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify(outputData, null, 2)
        };
    }

    private mapHttpError(error: HttpError): ActionResultSimple {
        const status = error.Status;
        const errorData = error.Data as { error?: { message?: string } } | undefined;
        const detail = errorData?.error?.message || error.message;

        if (status === 401 || status === 403) {
            return this.createErrorResult(`Invalid Perplexity API key (HTTP ${status})`, "INVALID_API_KEY");
        }
        if (status === 429) {
            return this.createErrorResult("Perplexity API rate limit exceeded", "RATE_LIMITED");
        }
        if (status === 400 || status === 422) {
            return this.createErrorResult(
                `Perplexity rejected the request (HTTP ${status}): ${detail}`,
                "INVALID_REQUEST"
            );
        }
        return this.createErrorResult(`Perplexity API error: ${detail}`, "API_ERROR");
    }

    /**
     * Get string parameter value
     */
    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null) return undefined;
        return String(param.Value);
    }

    /**
     * A list param, accepted as a real array or as a comma-separated string — both
     * forms arrive in practice, from agent input mappings and from humans respectively.
     */
    private getStringArrayParam(params: RunActionParams, paramName: string): string[] {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        const value = param?.Value;
        if (value === undefined || value === null) return [];
        const raw = Array.isArray(value) ? value.map(v => String(v)) : String(value).split(',');
        return raw.map(v => v.trim()).filter(v => v.length > 0);
    }

    /**
     * Get boolean parameter value with default
     */
    private getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean = false): boolean {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null) return defaultValue;
        return String(param.Value).toLowerCase() === 'true';
    }

    /**
     * Get numeric parameter value with default
     */
    private getNumericParam(params: RunActionParams, paramName: string, defaultValue: number = 0): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null) return defaultValue;
        const num = Number(param.Value);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * Add output parameter
     */
    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: 'Output',
            Value: value
        });
    }

    /**
     * Create error result
     */
    private createErrorResult(message: string, code: string): ActionResultSimple {
        return {
            Success: false,
            Message: message,
            ResultCode: code
        };
    }
}
