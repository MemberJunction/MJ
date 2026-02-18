import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { RunView } from "@memberjunction/core";
import { AIPromptEntityExtended } from "@memberjunction/ai-core-plus";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams} from "@memberjunction/ai-core-plus";

/**
 * Action that executes MemberJunction AI prompts
 * 
 * @example
 * ```typescript
 * // Execute a simple prompt
 * await runAction({
 *   ActionName: 'Execute AI Prompt',
 *   Params: [{
 *     Name: 'PromptName',
 *     Value: 'Summarize Text'
 *   }, {
 *     Name: 'Variables',
 *     Value: {
 *       text: 'Long article text here...',
 *       maxLength: 200
 *     }
 *   }]
 * });
 * 
 * // Execute with model override
 * await runAction({
 *   ActionName: 'Execute AI Prompt',
 *   Params: [{
 *     Name: 'PromptName',
 *     Value: 'Generate Code'
 *   }, {
 *     Name: 'Variables',
 *     Value: {
 *       language: 'TypeScript',
 *       description: 'Function to calculate fibonacci'
 *     }
 *   }, {
 *     Name: 'ModelOverride',
 *     Value: 'gpt-4'
 *   }, {
 *     Name: 'TemperatureOverride',
 *     Value: 0.7
 *   }]
 * });
 * 
 * // Execute with streaming
 * await runAction({
 *   ActionName: 'Execute AI Prompt',
 *   Params: [{
 *     Name: 'PromptName',
 *     Value: 'Creative Writing'
 *   }, {
 *     Name: 'Variables',
 *     Value: { topic: 'space exploration' }
 *   }, {
 *     Name: 'Stream',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "Execute AI Prompt")
export class ExecuteAIPromptAction extends BaseAction {
    
    /**
     * Executes a MemberJunction AI prompt
     * 
     * @param params - The action parameters containing:
     *   - PromptName: Name of the AI prompt to execute (required)
     *   - Variables: Object with variables for the prompt (optional)
     *   - ModelOverride: Override the default model (optional)
     *   - TemperatureOverride: Override temperature setting (optional)
     *   - MaxTokensOverride: Override max tokens (optional)
     *   - Stream: Boolean - stream responses (default: false)
     *   - SystemPromptOverride: Override system prompt (optional)
     *   - IncludeMetadata: Include prompt metadata in response (default: false)
     * 
     * @returns AI prompt response
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const promptName = this.getParamValue(params, 'promptname');
            const variables = this.getParamValue(params, 'variables') || {};
            const modelOverride = this.getParamValue(params, 'modeloverride');
            const temperatureOverride = this.getParamValue(params, 'temperatureoverride');
            const maxTokensOverride = this.getParamValue(params, 'maxtokensoverride');
            const stream = this.getBooleanParam(params, 'stream', false);
            const systemPromptOverride = this.getParamValue(params, 'systempromptoverride');
            const includeMetadata = this.getBooleanParam(params, 'includemetadata', false);

            // Validate prompt name
            if (!promptName) {
                return {
                    Success: false,
                    Message: "PromptName parameter is required",
                    ResultCode: "MISSING_PROMPT_NAME"
                };
            }

            // Load the prompt
            const prompt = await this.loadPrompt(promptName, params.ContextUser);
            if (!prompt) {
                return {
                    Success: false,
                    Message: `AI Prompt '${promptName}' not found`,
                    ResultCode: "PROMPT_NOT_FOUND"
                };
            }

            // Check if prompt is active
            if (prompt.Status !== 'Active') {
                return {
                    Success: false,
                    Message: `AI Prompt '${promptName}' is not active (status: ${prompt.Status})`,
                    ResultCode: "PROMPT_NOT_ACTIVE"
                };
            }

            // Prepare prompt configuration
            const promptParams = new AIPromptParams();
            promptParams.prompt = prompt;
            promptParams.data = variables;
            promptParams.contextUser = params.ContextUser;

            // Apply overrides if provided
            if (modelOverride) {
                // We'll need to handle model override through additionalParameters
                promptParams.additionalParameters = promptParams.additionalParameters || {};
                promptParams.additionalParameters.model = modelOverride;
            }

            if (temperatureOverride !== undefined && temperatureOverride !== null) {
                promptParams.additionalParameters = promptParams.additionalParameters || {};
                promptParams.additionalParameters.temperature = temperatureOverride;
            }

            if (maxTokensOverride) {
                promptParams.additionalParameters = promptParams.additionalParameters || {};
                promptParams.additionalParameters.max_tokens = maxTokensOverride;
            }

            if (systemPromptOverride) {
                promptParams.additionalParameters = promptParams.additionalParameters || {};
                promptParams.additionalParameters.system = systemPromptOverride;
            }

            // Execute the prompt
            try {
                const runner = new AIPromptRunner();
                const result = await runner.ExecutePrompt(promptParams);

                if (!result.success) {
                    return {
                        Success: false,
                        Message: `Prompt execution failed: ${result.errorMessage || 'Unknown error'}`,
                        ResultCode: "PROMPT_EXECUTION_FAILED"
                    };
                }

                // Add output parameters
                params.Params.push({
                    Name: 'Response',
                    Type: 'Output',
                    Value: result.rawResult || result.result
                });

                params.Params.push({
                    Name: 'Model',
                    Type: 'Output',
                    Value: result.modelInfo?.modelName || result.chatResult?.data?.model || modelOverride || prompt.AIModelType
                });

                params.Params.push({
                    Name: 'TokensUsed',
                    Type: 'Output',
                    Value: (result.promptTokens || 0) + (result.completionTokens || 0)
                });

                if (includeMetadata) {
                    params.Params.push({
                        Name: 'PromptMetadata',
                        Type: 'Output',
                        Value: {
                            promptId: prompt.ID,
                            promptName: prompt.Name,
                            promptType: prompt.Type,
                            model: result.modelInfo?.modelName || result.chatResult?.data?.model || modelOverride || prompt.AIModelType,
                            temperature: temperatureOverride !== undefined ? temperatureOverride : prompt.Temperature,
                            maxTokens: maxTokensOverride || null
                        }
                    });
                }

                // Build response message
                const responseData: any = {
                    message: "AI prompt executed successfully",
                    promptName: promptName,
                    model: result.modelInfo?.modelName || result.chatResult?.data?.model || modelOverride || prompt.AIModelType,
                    tokensUsed: (result.promptTokens || 0) + (result.completionTokens || 0),
                    response: result.rawResult || result.result
                };

                if (includeMetadata) {
                    responseData.metadata = {
                        promptId: prompt.ID,
                        promptType: prompt.Type,
                        temperature: temperatureOverride !== undefined ? temperatureOverride : prompt.Temperature,
                        maxTokens: maxTokensOverride || null,
                        streaming: stream
                    };
                }

                return {
                    Success: true,
                    ResultCode: "PROMPT_EXECUTED",
                    Message: JSON.stringify(responseData, null, 2)
                };

            } catch (error) {
                return {
                    Success: false,
                    Message: `Failed to execute prompt: ${error instanceof Error ? error.message : String(error)}`,
                    ResultCode: "EXECUTION_ERROR"
                };
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Execute AI prompt failed: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "ACTION_FAILED"
            };
        }
    }

    /**
     * Load AI prompt by name
     */
    private async loadPrompt(promptName: string, contextUser?: any): Promise<AIPromptEntityExtended | null> {
        const rv = new RunView();
        const result = await rv.RunView<AIPromptEntityExtended>({
            EntityName: 'MJ: AI Prompts',
            ExtraFilter: `Name = '${promptName.replace(/'/g, "''")}'`,
            MaxRows: 1,
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success && result.Results && result.Results.length > 0) {
            return result.Results[0];
        }

        return null;
    }

    /**
     * Get boolean parameter with default
     */
    private getBooleanParam(params: RunActionParams, name: string, defaultValue: boolean): boolean {
        const value = this.getParamValue(params, name);
        if (value === undefined || value === null) return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            return value.toLowerCase() === 'true';
        }
        return defaultValue;
    }

    /**
     * Get parameter value by name (case-insensitive)
     */
    private getParamValue(params: RunActionParams, name: string): any {
        const param = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }
}