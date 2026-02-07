import { ActionResultSimple, RunActionParams, ActionParam, ActionEngineBase } from "@memberjunction/actions-base";
import { BaseAction, ActionEngineServer } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";
import { LogError, RunView } from "@memberjunction/core";
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { AIPromptEntityExtended } from '@memberjunction/ai-core-plus';

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
@RegisterClass(BaseAction, "SummarizeContentAction")
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
            // Load the Web Page Content action
            await ActionEngineBase.Instance.Config(false, params.ContextUser);
            const action = ActionEngineBase.Instance.Actions.find(a => a.Name === 'Web Page Content');
            if (!action) {
                return {
                    success: false,
                    error: "Action 'Web Page Content' not found"
                };
            }

            // Build action params
            const actionParams: ActionParam[] = [{
                Name: "url",
                Type: "Input",
                Value: url
            }];

            const runParams = new RunActionParams();
            runParams.Action = action;
            runParams.Params = actionParams;
            runParams.ContextUser = params.ContextUser;
            runParams.SkipActionLog = true;

            // Execute the action
            const engine = new ActionEngineServer();
            const result = await engine.RunAction(runParams);

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
     * Generate summary using AI Prompts package directly
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
    ): Promise<{ success: boolean; data?: SummaryOutput; error?: string }> {
        try {
            // Ensure AIEngine is initialized
            await AIEngine.Instance.Config(false, params.ContextUser);

            // Get the summarization prompt from AIEngine
            const prompt = this.getPromptByNameAndCategory('Summarize Content', 'MJ: System');
            if (!prompt) {
                return {
                    success: false,
                    error: "Prompt 'Summarize Content' not found. Ensure metadata has been synced."
                };
            }

            // Build prompt parameters with data context
            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.data = {
                content,
                sourceUrl,
                summaryWords: options.summaryWords,
                includeCitations: options.includeCitations,
                maxCitations: options.maxCitations,
                instructions: options.instructions,
                format: options.format
            };
            promptParams.contextUser = params.ContextUser;
            promptParams.cleanValidationSyntax = true;
            promptParams.attemptJSONRepair = true;

            // Execute the prompt
            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt<SummaryOutput>(promptParams);

            if (!result.success) {
                return {
                    success: false,
                    error: result.errorMessage || "Prompt execution failed"
                };
            }

            return {
                success: true,
                data: result.result
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    /**
     * Get prompt by name and category from AIEngine
     */
    private getPromptByNameAndCategory(name: string, category: string): AIPromptEntityExtended | undefined {
        return AIEngine.Instance.Prompts.find(p => p.Name.trim().toLowerCase() === name.trim().toLowerCase() && 
                                                   p.Category?.trim().toLowerCase() === category?.trim().toLowerCase());
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