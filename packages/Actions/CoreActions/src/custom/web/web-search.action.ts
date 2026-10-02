import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import {
    WebSearchEngine,
    WebSearchFreshness,
    WebSearchParams,
    WebSearchSafeSearch,
} from "@memberjunction/web-search-engine";

/**
 * Action that performs a web search through whichever provider the administrator has configured.
 *
 * This is the **provider-neutral entry point** agents should bind to. It holds no vendor logic of
 * its own: it extracts parameters, hands them to {@link WebSearchEngine}, and maps the result
 * back. Which vendor actually serves the request — Brave, Tavily, Perplexity, or a fallback when
 * the first choice is rate-limited — is decided by the `MJ: Web Search Providers` records and
 * their `Priority`, not by the caller and not by the agent.
 *
 * That is the point. An LLM choosing between named vendor actions is making an infrastructure
 * decision it has no information for: it cannot know which key is configured, which is cheaper,
 * or which is rate-limited right now. Swapping vendors here is a metadata edit, with no change to
 * any agent.
 *
 * `Provider` is the escape hatch for a caller who genuinely knows better. When set, the engine
 * **fails rather than substituting** — a silent substitution is how you discover months later
 * that a deliberate choice stopped being honoured.
 *
 * @example
 * ```typescript
 * // Let the administrator's priority order decide
 * await runAction({
 *   ActionName: 'Web Search',
 *   Params: [{ Name: 'Query', Value: 'association management trends' }]
 * });
 *
 * // Recent results from two domains, with a synthesized answer
 * await runAction({
 *   ActionName: 'Web Search',
 *   Params: [
 *     { Name: 'Query',          Value: 'IRS Form 990 filing changes' },
 *     { Name: 'Freshness',      Value: 'month' },
 *     { Name: 'IncludeDomains', Value: ['irs.gov', 'councilofnonprofits.org'] },
 *     { Name: 'IncludeAnswer',  Value: true }
 *   ]
 * });
 *
 * // Pin one vendor — fails if it is not available rather than using another
 * await runAction({
 *   ActionName: 'Web Search',
 *   Params: [
 *     { Name: 'Query',    Value: 'quantum error correction 2026' },
 *     { Name: 'Provider', Value: 'Brave' }
 *   ]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__WebSearch")
export class WebSearchAction extends BaseAction {
    private static readonly FRESHNESS_WINDOWS = ['day', 'week', 'month', 'year'] as const;
    private static readonly SAFE_SEARCH_VALUES = ['off', 'moderate', 'strict'] as const;

    /**
     * Executes the search.
     *
     * @param params - The action parameters containing:
     *   - Query: Search query text (required)
     *   - MaxResults: Desired result count, clamped to the serving provider's cap (default 10)
     *   - Provider: Pin to one provider by Name or DriverClass. Fails if unavailable
     *   - IncludeDomains / ExcludeDomains: Array or comma-separated domain lists
     *   - Freshness: 'day' | 'week' | 'month' | 'year'
     *   - Country: Two-letter country code, e.g. 'US'
     *   - Language: Language code, e.g. 'en'
     *   - SafeSearch: 'off' | 'moderate' | 'strict' (default 'moderate')
     *   - IncludeAnswer: Also return a synthesized answer, restricting provider selection
     *
     * @returns Normalised results plus which provider served them
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const query = this.getStringParam(params, 'query') || this.getStringParam(params, 'searchterms');
        if (!query) {
            return this.createErrorResult("Query parameter is required", "MISSING_QUERY");
        }

        const freshness = this.getStringParam(params, 'freshness')?.toLowerCase();
        if (freshness && !WebSearchAction.FRESHNESS_WINDOWS.includes(freshness as typeof WebSearchAction.FRESHNESS_WINDOWS[number])) {
            return this.createErrorResult(
                `Freshness must be one of ${WebSearchAction.FRESHNESS_WINDOWS.join(', ')} (got '${freshness}')`,
                "INVALID_FRESHNESS"
            );
        }

        const safeSearch = this.getStringParam(params, 'safesearch')?.toLowerCase();
        if (safeSearch && !WebSearchAction.SAFE_SEARCH_VALUES.includes(safeSearch as typeof WebSearchAction.SAFE_SEARCH_VALUES[number])) {
            return this.createErrorResult(
                `SafeSearch must be one of ${WebSearchAction.SAFE_SEARCH_VALUES.join(', ')} (got '${safeSearch}')`,
                "INVALID_SAFESEARCH"
            );
        }

        const searchParams: WebSearchParams = {
            Query: query,
            MaxResults: this.getOptionalNumericParam(params, 'maxresults'),
            Provider: this.getStringParam(params, 'provider'),
            IncludeDomains: this.getStringArrayParam(params, 'includedomains'),
            ExcludeDomains: this.getStringArrayParam(params, 'excludedomains'),
            Freshness: freshness as WebSearchFreshness | undefined,
            Country: this.getStringParam(params, 'country'),
            Language: this.getStringParam(params, 'language'),
            SafeSearch: safeSearch as WebSearchSafeSearch | undefined,
            IncludeAnswer: this.getBooleanParam(params, 'includeanswer', false),
        };

        const engine = WebSearchEngine.Instance;
        await engine.Config(false, params.ContextUser);
        const result = await engine.Search(searchParams, params.ContextUser);

        // Attempts are emitted on both paths. When a fallback served the request, that is the
        // only thing that says so — and it is worth knowing before the invoice does.
        this.addOutputParam(params, 'Attempts', result.Attempts);

        if (!result.Success) {
            return this.createErrorResult(
                result.ErrorMessage ?? 'Web search failed.',
                result.ResultCode
            );
        }

        this.addOutputParam(params, 'Results', result.Hits);
        this.addOutputParam(params, 'ResultCount', result.Hits.length);
        this.addOutputParam(params, 'ProviderUsed', result.ProviderUsed);
        if (result.Answer) {
            this.addOutputParam(params, 'Answer', result.Answer);
        }
        this.addOutputParam(params, 'SearchResultDetails', {
            query,
            providerUsed: result.ProviderUsed,
            resultCount: result.Hits.length,
            results: result.Hits,
            answer: result.Answer,
            attempts: result.Attempts,
        });

        // Zero results is a real answer to a narrow query, not a failure — a caller that treats
        // it as one would retry a query that will keep returning nothing.
        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: result.Hits.length === 0
                ? `${result.ProviderUsed} returned no results for '${query}'.`
                : `${result.ProviderUsed} returned ${result.Hits.length} result(s) for '${query}'.`
        };
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

    private getOptionalNumericParam(params: RunActionParams, paramName: string): number | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (param?.Value === undefined || param?.Value === null || param.Value === '') return undefined;
        const num = Number(param.Value);
        return isNaN(num) ? undefined : num;
    }

    /**
     * A list param, accepted as a real array or as a comma-separated string — both forms arrive
     * in practice, from agent input mappings and from humans respectively.
     */
    private getStringArrayParam(params: RunActionParams, paramName: string): string[] | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        const value = param?.Value;
        if (value === undefined || value === null) return undefined;
        const raw = Array.isArray(value) ? value.map(v => String(v)) : String(value).split(',');
        const cleaned = raw.map(v => v.trim()).filter(v => v.length > 0);
        return cleaned.length > 0 ? cleaned : undefined;
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({ Name: name, Type: 'Output', Value: value });
    }

    private createErrorResult(message: string, code: string): ActionResultSimple {
        return { Success: false, Message: message, ResultCode: code };
    }
}

export function LoadWebSearchAction(): void {
    // Referenced by consumers to keep this registration from being tree-shaken.
}
