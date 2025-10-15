import { ActionResultSimple, RunActionParams, ActionParam } from "@memberjunction/actions-base";
import { BaseAction, ActionEngineServer } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { LogError, Metadata } from "@memberjunction/core";

interface SummaryCitation {
    text: string;           // Exact quote from content
    url: string;            // URL with anchor if available
    anchorId?: string;      // HTML element ID
    context?: string;       // Surrounding text
    relevance: string;      // Why this quote matters
}

interface SummaryOutput {
    summary: string;
    wordCount: number;
    citations?: SummaryCitation[];
    keyPoints?: string[];
    metadata?: {
        pageTitle?: string;
        sourceUrl: string;
    };
}

/**
 * Action that creates a concise summary of content with citations to source material.
 * Can work with either a URL (fetch + summarize) or pre-fetched content.
 *
 * Features:
 * - Flexible input: URL or pre-fetched content
 * - Configurable summary length (word count target)
 * - Optional citations with quotes and links
 * - Focus instructions for domain-specific summarization
 * - Multiple output formats (paragraph, bullets, hybrid)
 * - Automatic anchor link detection for precise citations
 *
 * @example
 * ```typescript
 * // Summarize from URL
 * await runAction({
 *   ActionName: 'Summarize Content',
 *   Params: [{
 *     Name: 'url',
 *     Value: 'https://docs.memberjunction.org/architecture'
 *   }, {
 *     Name: 'summaryWords',
 *     Value: 200
 *   }, {
 *     Name: 'instructions',
 *     Value: 'Focus on metadata layer and entity system'
 *   }]
 * });
 *
 * // Summarize pre-fetched content
 * await runAction({
 *   ActionName: 'Summarize Content',
 *   Params: [{
 *     Name: 'content',
 *     Value: '<html>...</html>'
 *   }, {
 *     Name: 'sourceUrl',
 *     Value: 'https://docs.memberjunction.org/architecture'
 *   }, {
 *     Name: 'includeCitations',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Summarize Content")
export class SummarizeContentAction extends BaseAction {

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Extract parameters
            const url = this.getStringParam(params, "url");
            const content = this.getStringParam(params, "content");
            const sourceUrl = this.getStringParam(params, "sourceurl");
            const summaryWords = this.getNumericParam(params, "summarywords", 200);
            const includeCitations = this.getBooleanParam(params, "includecitations", true);
            const maxCitations = this.getNumericParam(params, "maxcitations", 5);
            const instructions = this.getStringParam(params, "instructions", "Provide a comprehensive summary");
            const format = this.getStringParam(params, "format", "paragraph");

            // Validation: Must have either URL or content
            if (!url && !content) {
                return this.createErrorResult(
                    "Must provide either 'url' or 'content' parameter",
                    "MISSING_INPUT"
                );
            }

            // Validation: If content provided, must have sourceUrl
            if (content && !sourceUrl) {
                return this.createErrorResult(
                    "When using 'content' parameter, 'sourceUrl' is required for citations",
                    "MISSING_SOURCE_URL"
                );
            }

            let pageContent: string;
            let finalSourceUrl: string;

            // Fetch content if URL provided
            if (url) {
                const fetchResult = await this.fetchWebPageContent(url, params);
                if (!fetchResult.success) {
                    return this.createErrorResult(
                        `Failed to fetch web page: ${fetchResult.error}`,
                        "FETCH_FAILED"
                    );
                }
                pageContent = fetchResult.content!;
                finalSourceUrl = url;
            } else {
                // Use provided content
                pageContent = content!;
                finalSourceUrl = sourceUrl!;
            }

            // Call the LLM prompt action to do the actual summarization
            const summaryResult = await this.generateSummary(pageContent, finalSourceUrl, {
                summaryWords,
                includeCitations,
                maxCitations,
                instructions,
                format
            }, params);

            if (!summaryResult.success) {
                return this.createErrorResult(
                    `Failed to generate summary: ${summaryResult.error}`,
                    "SUMMARIZATION_FAILED"
                );
            }

            // Add output parameters
            const outputData = summaryResult.data as SummaryOutput;
            this.addOutputParam(params, "summary", outputData.summary);
            this.addOutputParam(params, "wordCount", outputData.wordCount);
            if (outputData.citations) {
                this.addOutputParam(params, "citations", outputData.citations);
            }
            if (outputData.keyPoints) {
                this.addOutputParam(params, "keyPoints", outputData.keyPoints);
            }
            if (outputData.metadata) {
                this.addOutputParam(params, "metadata", outputData.metadata);
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(outputData, null, 2)
            };

        } catch (error) {
            LogError(`Error in Summarize Content action: ${error}`);
            return this.createErrorResult(
                `Error summarizing content: ${error instanceof Error ? error.message : String(error)}`,
                "UNEXPECTED_ERROR"
            );
        }
    }

    /**
     * Fetch web page content using the Get Web Page Content action
     */
    private async fetchWebPageContent(
        url: string,
        params: RunActionParams
    ): Promise<{ success: boolean; content?: string; error?: string }> {
        try {
            // Create params for the web page content action
            const actionParams: ActionParam[] = [{
                Name: "url",
                Type: "Input",
                Value: url
            }];

            // Execute the Get Web Page Content action
            const result = await this.executeAction("Get Web Page Content", actionParams, params.ContextUser);

            if (!result.Success) {
                return {
                    success: false,
                    error: result.Message || "Failed to fetch web page"
                };
            }

            // Extract content from result
            const content = result.Message || "";
            return {
                success: true,
                content
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Generate summary using LLM via the Execute AI Prompt action
     */
    private async generateSummary(
        content: string,
        sourceUrl: string,
        options: {
            summaryWords: number;
            includeCitations: boolean;
            maxCitations: number;
            instructions: string;
            format: string;
        },
        params: RunActionParams
    ): Promise<{ success: boolean; data?: any; error?: string }> {
        try {
            // Build structured output schema
            const structuredOutput = {
                type: "object",
                properties: {
                    summary: {
                        type: "string",
                        description: `Main summary in ${options.format} format, approximately ${options.summaryWords} words`
                    },
                    wordCount: {
                        type: "number",
                        description: "Actual word count of summary"
                    },
                    ...(options.includeCitations && {
                        citations: {
                            type: "array",
                            description: `Up to ${options.maxCitations} most relevant quotes with source links`,
                            items: {
                                type: "object",
                                properties: {
                                    text: { type: "string", description: "Exact quote from content" },
                                    url: { type: "string", description: "URL with anchor if available" },
                                    anchorId: { type: "string", description: "HTML anchor ID if found" },
                                    context: { type: "string", description: "Brief context around quote" },
                                    relevance: { type: "string", description: "Why this quote is important" }
                                },
                                required: ["text", "url", "relevance"]
                            }
                        }
                    }),
                    ...(options.format === "bullets" || options.format === "hybrid" ? {
                        keyPoints: {
                            type: "array",
                            description: "Key bullet points from content",
                            items: { type: "string" }
                        }
                    } : {}),
                    metadata: {
                        type: "object",
                        properties: {
                            pageTitle: { type: "string" },
                            sourceUrl: { type: "string" }
                        }
                    }
                },
                required: ["summary", "wordCount", "metadata"]
            };

            // Build the prompt data
            const promptData = {
                content,
                sourceUrl,
                summaryWords: options.summaryWords,
                includeCitations: options.includeCitations,
                maxCitations: options.maxCitations,
                instructions: options.instructions,
                format: options.format,
                structuredOutput: JSON.stringify(structuredOutput)
            };

            // Execute AI Prompt action with the "Summarize Content" prompt
            const actionParams: ActionParam[] = [{
                Name: "promptName",
                Type: "Input",
                Value: "Summarize Content"
            }, {
                Name: "data",
                Type: "Input",
                Value: JSON.stringify(promptData)
            }, {
                Name: "responseFormat",
                Type: "Input",
                Value: "json_object"
            }];

            const result = await this.executeAction("Execute AI Prompt", actionParams, params.ContextUser);

            if (!result.Success) {
                return {
                    success: false,
                    error: result.Message || "Failed to execute AI prompt"
                };
            }

            // Parse the result
            let parsedResult: any;
            try {
                // The Execute AI Prompt action should return parsed JSON in Message
                parsedResult = typeof result.Message === "string"
                    ? JSON.parse(result.Message)
                    : result.Message;
            } catch (parseError) {
                return {
                    success: false,
                    error: `Failed to parse AI response: ${parseError}`
                };
            }

            return {
                success: true,
                data: parsedResult
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Execute another action by name
     */
    private async executeAction(
        actionName: string,
        params: ActionParam[],
        contextUser: any
    ): Promise<ActionResultSimple> {
        // Load the action entity using RunView
        const { RunView } = await import("@memberjunction/core");
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'Actions',
            ExtraFilter: `Name='${actionName.replace(/'/g, "''")}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success || !result.Results || result.Results.length === 0) {
            return {
                Success: false,
                ResultCode: "ACTION_NOT_FOUND",
                Message: `Action "${actionName}" not found`
            };
        }

        const action = result.Results[0];

        // Build RunActionParams
        const runParams = new RunActionParams();
        runParams.Action = action;
        runParams.Params = params;
        runParams.ContextUser = contextUser;
        runParams.SkipActionLog = true; // Don't log sub-action executions

        // Execute the action
        const engine = new ActionEngineServer();
        const actionResult = await engine.RunAction(runParams);

        return {
            Success: actionResult.Success,
            ResultCode: actionResult.Success ? "SUCCESS" : "ERROR",
            Message: actionResult.Message,
            Params: actionResult.Params
        };
    }

    // Helper methods (consistent with other actions)
    private getStringParam(params: RunActionParams, paramName: string, defaultValue?: string): string | undefined {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim();
        return value.length > 0 ? value : defaultValue;
    }

    private getNumericParam(params: RunActionParams, paramName: string, defaultValue: number): number {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const parsed = Number(param.Value);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    private getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean): boolean {
        const param = params.Params.find(p => p.Name.trim().toLowerCase() === paramName.toLowerCase());
        if (!param || param.Value === undefined || param.Value === null) {
            return defaultValue;
        }
        const value = String(param.Value).trim().toLowerCase();
        if (value === "true" || value === "1" || value === "yes") {
            return true;
        }
        if (value === "false" || value === "0" || value === "no") {
            return false;
        }
        return defaultValue;
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

/**
 * Loader function to ensure the SummarizeContentAction class is included in the bundle.
 */
export function LoadSummarizeContentAction() {
    // This function is a stub that is used to force the bundler to include the above class in the final bundle
}
