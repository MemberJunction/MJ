import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import axios from "axios";
import { getApiIntegrationsConfig } from "../../config";

interface GoogleSearchItem {
    title?: string;
    link?: string;
    displayLink?: string;
    snippet?: string;
    htmlSnippet?: string;
    formattedUrl?: string;
    mime?: string;
    fileFormat?: string;
    pagemap?: Record<string, unknown>;
}

interface GoogleSearchResponse {
    items?: GoogleSearchItem[];
    searchInformation?: {
        searchTime?: number;
        formattedSearchTime?: string;
        totalResults?: string;
        formattedTotalResults?: string;
    };
    queries?: Record<string, unknown>;
    context?: Record<string, unknown>;
}

/**
 * Action that performs web search using the Google Custom Search JSON API
 * and returns structured results.
 *
 * @example
 * ```typescript
 * // Basic Google search
 * await runAction({
 *   ActionName: 'Google Custom Search',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'latest trends in renewable energy'
 *   }]
 * });
 *
 * // Search with additional options
 * await runAction({
 *   ActionName: 'Google Custom Search',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'AI regulation whitepapers'
 *   }, {
 *     Name: 'MaxResults',
 *     Value: 5
 *   }, {
 *     Name: 'SafeSearch',
 *     Value: 'high'
 *   }, {
 *     Name: 'SiteSearch',
 *     Value: 'europa.eu'
 *   }, {
 *     Name: 'Verbosity',
 *     Value: 'minimal'  // 'minimal' | 'standard' (default) | 'detailed'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Google Custom Search")
export class GoogleCustomSearchAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const query = this.getStringParam(params, "query") || this.getStringParam(params, "searchterms");
        if (!query) {
            return this.createErrorResult("Query parameter is required", "MISSING_QUERY");
        }

        const apiConfig = getApiIntegrationsConfig();
        const apiKey = apiConfig.google?.customSearch?.apiKey;
        const cx = apiConfig.google?.customSearch?.cx;

        if (!apiKey) {
            return this.createErrorResult(
                "Google Custom Search API key not found. Set google.customSearch.apiKey in mj.config.cjs or GOOGLE_CUSTOM_SEARCH_API_KEY environment variable",
                "MISSING_API_KEY"
            );
        }

        if (!cx) {
            return this.createErrorResult(
                "Google Custom Search engine identifier (CX) not found. Set google.customSearch.cx in mj.config.cjs or GOOGLE_CUSTOM_SEARCH_CX environment variable",
                "MISSING_SEARCH_ENGINE"
            );
        }

        const maxResults = this.clamp(this.getNumericParam(params, "maxresults", 10), 1, 10);
        let startIndex = this.getNumericParam(params, "startindex", 1);
        if (isNaN(startIndex) || startIndex < 1) {
            startIndex = 1;
        }

        // Google Custom Search limits the index to the first 100 results
        const maxStartIndex = Math.max(1, 101 - maxResults);
        if (startIndex > maxStartIndex) {
            startIndex = maxStartIndex;
        }

        const safeSearch = this.normalizeSafeSearch(this.getStringParam(params, "safesearch"));
        const siteSearch = this.getStringParam(params, "sitesearch");
        const siteSearchFilter = this.normalizeSiteSearchFilter(this.getStringParam(params, "sitesearchfilter"));
        const languageRestriction = this.normalizeLanguageRestriction(this.getStringParam(params, "languagerestriction") || this.getStringParam(params, "language"));
        const exactTerms = this.getStringParam(params, "exactterms");
        const excludeTerms = this.getStringParam(params, "excludeterms");
        const dateRestrict = this.getStringParam(params, "daterestrict");
        const searchType = this.normalizeSearchType(this.getStringParam(params, "searchtype"));
        const fileType = this.getStringParam(params, "filetype");
        const region = this.getStringParam(params, "region") || this.getStringParam(params, "gl");
        const verbosity = this.normalizeVerbosity(this.getStringParam(params, "verbosity"));

        const requestParams: Record<string, string | number> = {
            key: apiKey,
            cx,
            q: query,
            num: maxResults,
            start: startIndex
        };

        if (safeSearch) {
            requestParams.safe = safeSearch;
        }
        if (siteSearch) {
            requestParams.siteSearch = siteSearch;
        }
        if (siteSearchFilter) {
            requestParams.siteSearchFilter = siteSearchFilter;
        }
        if (languageRestriction) {
            requestParams.lr = languageRestriction;
        }
        if (exactTerms) {
            requestParams.exactTerms = exactTerms;
        }
        if (excludeTerms) {
            requestParams.excludeTerms = excludeTerms;
        }
        if (dateRestrict) {
            requestParams.dateRestrict = dateRestrict;
        }
        if (searchType) {
            requestParams.searchType = searchType;
        }
        if (fileType) {
            requestParams.fileType = fileType;
        }
        if (region) {
            requestParams.gl = region.toLowerCase();
        }

        try {
            const response = await axios.get<GoogleSearchResponse>(
                "https://www.googleapis.com/customsearch/v1",
                {
                    params: requestParams,
                    timeout: 15000
                }
            );

            if (!response.data) {
                return this.createErrorResult("Empty response from Google Custom Search API", "EMPTY_RESPONSE");
            }

            const data = response.data;
            const items = (data.items || []).map(item => this.transformItemByVerbosity(item, verbosity));
            const totalResults = Number(data.searchInformation?.totalResults || "0");

            const resultData = this.buildResultData(data, items, verbosity, {
                query,
                maxResults,
                startIndex,
                totalResults
            });

            this.addOutputParam(params, "SearchResultsDetails", resultData);
            this.addOutputParam(params, "Items", items);
            this.addOutputParam(params, "ResultCount", items.length);
            this.addOutputParam(params, "TotalResults", totalResults);

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(resultData, null, 2)
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const errorMessage = error.response?.data?.error?.message;

                if (status === 403) {
                    return this.createErrorResult(
                        `Google Custom Search quota exceeded or invalid credentials: ${errorMessage || "Forbidden"}`,
                        "FORBIDDEN"
                    );
                }

                if (status === 400) {
                    return this.createErrorResult(
                        `Google Custom Search request error: ${errorMessage || "Bad Request"}`,
                        "BAD_REQUEST"
                    );
                }

                return this.createErrorResult(
                    `Google Custom Search API error: ${errorMessage || error.message}`,
                    "API_ERROR"
                );
            }

            return this.createErrorResult(
                `Failed to perform Google Custom Search: ${error instanceof Error ? error.message : String(error)}`,
                "SEARCH_FAILED"
            );
        }
    }

    private transformItemByVerbosity(item: GoogleSearchItem, verbosity: 'minimal' | 'standard' | 'detailed') {
        const pagemap = item.pagemap as Record<string, unknown> | undefined;
        const cseImage = this.extractFirstString(pagemap, "cse_image", "src");
        const cseThumbnail = this.extractFirstString(pagemap, "cse_thumbnail", "src");

        // Minimal: Just the essentials for AI agents needing quick results
        if (verbosity === 'minimal') {
            return {
                title: item.title,
                link: item.link,
                snippet: item.snippet
            };
        }

        // Standard: Balanced result set with most commonly needed fields
        if (verbosity === 'standard') {
            return {
                title: item.title,
                link: item.link,
                snippet: item.snippet,
                image: cseImage,
                thumbnail: cseThumbnail
            };
        }

        // Detailed: Everything including metadata and pagemap
        return {
            title: item.title,
            link: item.link,
            displayLink: item.displayLink,
            snippet: item.snippet,
            htmlSnippet: item.htmlSnippet,
            formattedUrl: item.formattedUrl,
            mime: item.mime,
            fileFormat: item.fileFormat,
            image: cseImage,
            thumbnail: cseThumbnail,
            pagemap
        };
    }

    private buildResultData(
        data: GoogleSearchResponse,
        items: unknown[],
        verbosity: 'minimal' | 'standard' | 'detailed',
        metadata: { query: string; maxResults: number; startIndex: number; totalResults: number }
    ) {
        const baseResult = {
            query: metadata.query,
            maxResults: metadata.maxResults,
            startIndex: metadata.startIndex,
            totalResults: metadata.totalResults,
            items
        };

        if (verbosity === 'minimal') {
            return baseResult;
        }

        if (verbosity === 'standard') {
            return {
                ...baseResult,
                searchTime: data.searchInformation?.searchTime
            };
        }

        // Detailed: Include everything
        return {
            ...baseResult,
            searchTime: data.searchInformation?.searchTime,
            searchInformation: data.searchInformation,
            queries: data.queries,
            context: data.context
        };
    }

    private extractFirstString(pagemap: Record<string, unknown> | undefined, key: string, field: string): string | undefined {
        if (!pagemap) {
            return undefined;
        }

        const value = pagemap[key];
        if (!Array.isArray(value)) {
            return undefined;
        }

        for (const entry of value) {
            if (entry && typeof entry === "object" && field in entry) {
                const fieldValue = (entry as Record<string, unknown>)[field];
                if (typeof fieldValue === "string" && fieldValue.trim().length > 0) {
                    return fieldValue;
                }
            }
        }

        return undefined;
    }

    private normalizeSafeSearch(value?: string): string | undefined {
        if (!value) {
            return undefined;
        }

        switch (value.trim().toLowerCase()) {
            case "off":
            case "none":
            case "disabled":
                return "off";
            case "medium":
            case "moderate":
                return "medium";
            case "high":
            case "strict":
            case "active":
                return "high";
            default:
                return undefined;
        }
    }

    private normalizeSiteSearchFilter(value?: string): "i" | "e" | undefined {
        if (!value) {
            return undefined;
        }

        const normalized = value.trim().toLowerCase();
        if (normalized === "include" || normalized === "i") {
            return "i";
        }
        if (normalized === "exclude" || normalized === "e") {
            return "e";
        }

        return undefined;
    }

    private normalizeLanguageRestriction(value?: string): string | undefined {
        if (!value) {
            return undefined;
        }

        const trimmed = value.trim();
        if (trimmed.toLowerCase().startsWith("lang_")) {
            return trimmed;
        }

        if (/^[a-zA-Z]{2}$/.test(trimmed)) {
            return `lang_${trimmed.toLowerCase()}`;
        }

        return undefined;
    }

    private normalizeSearchType(value?: string): "image" | undefined {
        if (!value) {
            return undefined;
        }

        const normalized = value.trim().toLowerCase();
        if (normalized === "image" || normalized === "images") {
            return "image";
        }

        return undefined;
    }

    private normalizeVerbosity(value?: string): 'minimal' | 'standard' | 'detailed' {
        if (!value) {
            return 'standard'; // Default
        }

        const normalized = value.trim().toLowerCase();
        switch (normalized) {
            case 'minimal':
            case 'min':
            case 'basic':
            case 'simple':
                return 'minimal';
            case 'detailed':
            case 'detail':
            case 'full':
            case 'complete':
            case 'verbose':
                return 'detailed';
            case 'standard':
            case 'normal':
            case 'default':
            default:
                return 'standard';
        }
    }

    private clamp(value: number, min: number, max: number): number {
        if (isNaN(value)) {
            return min;
        }

        return Math.min(Math.max(value, min), max);
    }

    private getStringParam(params: RunActionParams, paramName: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return undefined;
        }

        const value = String(param.Value).trim();
        return value.length > 0 ? value : undefined;
    }

    private getNumericParam(params: RunActionParams, paramName: string, defaultValue: number): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }

        const parsed = Number(param.Value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        params.Params.push({
            Name: name,
            Type: "Output",
            Value: value
        });
    }

    private createErrorResult(message: string, code: string): ActionResultSimple {
        return {
            Success: false,
            Message: message,
            ResultCode: code
        };
    }
}