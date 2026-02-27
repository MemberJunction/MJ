import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import axios from "axios";
import { getApiIntegrationsConfig } from "../../config";

/**
 * Action that performs AI-powered web search using Perplexity's Search API
 * Returns comprehensive search results with citations and related questions
 *
 * @example
 * ```typescript
 * // Basic search with Perplexity
 * await runAction({
 *   ActionName: 'Perplexity Search',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'latest developments in quantum computing'
 *   }]
 * });
 *
 * // Search with specific model and parameters
 * await runAction({
 *   ActionName: 'Perplexity Search',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'climate change research papers 2024'
 *   }, {
 *     Name: 'Model',
 *     Value: 'llama-3.1-sonar-large-128k-online'
 *   }, {
 *     Name: 'ReturnRelatedQuestions',
 *     Value: true
 *   }, {
 *     Name: 'ReturnImages',
 *     Value: true
 *   }]
 * });
 *
 * // Search with domain filtering
 * await runAction({
 *   ActionName: 'Perplexity Search',
 *   Params: [{
 *     Name: 'Query',
 *     Value: 'machine learning tutorials'
 *   }, {
 *     Name: 'SearchDomainFilter',
 *     Value: ['github.com', 'arxiv.org', 'medium.com']
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Perplexity Search")
export class PerplexitySearchAction extends BaseAction {

    /**
     * Executes the Perplexity AI search
     *
     * @param params - The action parameters containing:
     *   - Query: Search query text (required)
     *   - Model: Perplexity model to use (default: 'llama-3.1-sonar-small-128k-online')
     *     Options: llama-3.1-sonar-small-128k-online, llama-3.1-sonar-large-128k-online,
     *              llama-3.1-sonar-huge-128k-online
     *   - MaxTokens: Maximum tokens in response (default: 1000)
     *   - Temperature: Sampling temperature 0-2 (default: 0.2)
     *   - TopP: Nucleus sampling threshold (default: 0.9)
     *   - ReturnImages: Include images in results (default: false)
     *   - ReturnRelatedQuestions: Include related questions (default: false)
     *   - SearchDomainFilter: Array of domains to limit/exclude search (use '-' prefix to exclude)
     *   - SearchRecencyFilter: Filter by recency - 'day', 'week', 'month', 'year' (optional)
     *
     * @returns Search results with content, citations, and related questions
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get required parameters
            const query = this.getStringParam(params, 'query');
            if (!query) {
                return this.createErrorResult("Query parameter is required", "MISSING_QUERY");
            }

            // Get API key from config (which checks mj.config.cjs then falls back to environment variable)
            const apiConfig = getApiIntegrationsConfig();
            const apiKey = apiConfig.perplexityApiKey;
            if (!apiKey) {
                return this.createErrorResult(
                    "Perplexity API key not found. Set perplexityApiKey in mj.config.cjs or PERPLEXITY_API_KEY environment variable",
                    "MISSING_API_KEY"
                );
            }

            // Get optional parameters
            const model = this.getStringParam(params, 'model') || 'llama-3.1-sonar-small-128k-online';
            const maxTokens = this.getNumericParam(params, 'maxtokens', 1000);
            const temperature = this.getNumericParam(params, 'temperature', 0.2);
            const topP = this.getNumericParam(params, 'topp', 0.9);
            const returnImages = this.getBooleanParam(params, 'returnimages', false);
            const returnRelatedQuestions = this.getBooleanParam(params, 'returnrelatedquestions', false);
            const searchRecencyFilter = this.getStringParam(params, 'searchrecencyfilter');

            // Get domain filter (can be array or comma-separated string)
            const domainFilterParam = this.getParamValue(params, 'searchdomainfilter');
            let searchDomainFilter: string[] | undefined;
            if (domainFilterParam) {
                if (Array.isArray(domainFilterParam)) {
                    searchDomainFilter = domainFilterParam;
                } else if (typeof domainFilterParam === 'string') {
                    searchDomainFilter = domainFilterParam.split(',').map(d => d.trim());
                }
            }

            // Build request body
            const requestBody: Record<string, unknown> = {
                model,
                messages: [
                    {
                        role: 'user',
                        content: query
                    }
                ],
                max_tokens: maxTokens,
                temperature,
                top_p: topP,
                return_images: returnImages,
                return_related_questions: returnRelatedQuestions,
                stream: false
            };

            // Add optional parameters
            if (searchDomainFilter && searchDomainFilter.length > 0) {
                requestBody.search_domain_filter = searchDomainFilter;
            }
            if (searchRecencyFilter) {
                requestBody.search_recency_filter = searchRecencyFilter;
            }

            // Make API request
            const response = await axios.post(
                'https://api.perplexity.ai/chat/completions',
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000 // 60 second timeout
                }
            );

            if (!response.data) {
                return this.createErrorResult("Empty response from Perplexity API", "EMPTY_RESPONSE");
            }

            // Extract response data
            const result = response.data;
            const choice = result.choices?.[0];
            const message = choice?.message;
            const content = message?.content || '';
            const citations = result.citations || [];
            const images = result.images || [];
            const relatedQuestions = result.related_questions || [];

            // Build output data
            const outputData = {
                query,
                model,
                content,
                citations,
                images,
                relatedQuestions,
                usage: result.usage || {},
                finishReason: choice?.finish_reason
            };

            // Add output parameters
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

        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const errorData = error.response?.data;

                if (status === 401) {
                    return this.createErrorResult(
                        "Invalid Perplexity API key",
                        "INVALID_API_KEY"
                    );
                }

                if (status === 429) {
                    return this.createErrorResult(
                        "Perplexity API rate limit exceeded",
                        "RATE_LIMITED"
                    );
                }

                return this.createErrorResult(
                    `Perplexity API error: ${errorData?.error?.message || error.message}`,
                    "API_ERROR"
                );
            }

            return this.createErrorResult(
                `Failed to perform Perplexity search: ${error instanceof Error ? error.message : String(error)}`,
                "SEARCH_FAILED"
            );
        }
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
     * Get parameter value (any type)
     */
    private getParamValue(params: RunActionParams, paramName: string): unknown {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        return param?.Value;
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