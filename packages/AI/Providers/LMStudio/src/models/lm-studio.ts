import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ErrorAnalyzer } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { LMStudioClient } from '@lmstudio/sdk';

/**
 * LM Studio implementation of the BaseLLM class
 */
@RegisterClass(BaseLLM, "LMStudioLLM")
export class LMStudioLLM extends BaseLLM {
    private _client: LMStudioClient;
    
    constructor(apiKey?: string) {
        super(apiKey || ''); // LM Studio doesn't require API key for local usage
        this._client = new LMStudioClient();
    }

    /**
     * Read only getter method to get the LM Studio client instance
     */
    public get LMStudioClient(): LMStudioClient {
        return this._client;
    }

    /**
     * Read only getter method to get the LM Studio client instance
     */
    public get client(): LMStudioClient {
        return this.LMStudioClient;
    }
    
    /**
     * LM Studio supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Check if the provider supports thinking models
     * LM Studio can support thinking models depending on the loaded model
     */
    protected supportsThinkingModels(): boolean {
        return true;
    }

    /**
     * Override SetAdditionalSettings to handle LM Studio specific settings
     */
    public override SetAdditionalSettings(settings: Record<string, any>): void {
        super.SetAdditionalSettings(settings);
        
        // Handle LM Studio-specific settings like base URL
        if (settings.baseUrl) {
            // LM Studio client can be configured with custom base URL
            this._client = new LMStudioClient({
                baseUrl: settings.baseUrl
            });
        }
    }

    /**
     * Implementation of non-streaming chat completion for LM Studio
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();

        try {
            // Get the model instance
            const model = await this.client.llm.model(params.model);
            
            // Convert MJ messages to LM Studio format
            const messages = params.messages.map(m => ({
                role: m.role,
                content: Array.isArray(m.content) ? 
                    m.content.map(block => block.content).join('\n') : 
                    m.content
            }));

            // Create options for respond() method
            const respondOptions: any = {};

            // Add optional parameters with LM Studio naming conventions
            if (params.temperature != null) {
                respondOptions.temperature = params.temperature;
            }
            if (params.maxOutputTokens != null && params.maxOutputTokens > 0) {
                respondOptions.maxPredictedTokens = params.maxOutputTokens;
            }
            if (params.topP != null) {
                respondOptions.topP = params.topP;
            }
            if (params.seed != null) {
                respondOptions.seed = params.seed;
            }
            if (params.stopSequences != null && params.stopSequences.length > 0) {
                respondOptions.stopStrings = params.stopSequences;
            }
            if (params.frequencyPenalty != null) {
                respondOptions.frequencyPenalty = params.frequencyPenalty;
            }
            if (params.presencePenalty != null) {
                respondOptions.presencePenalty = params.presencePenalty;
            }

            // LM Studio doesn't support topK in the same way - warn if provided
            if (params.topK != null) {
                console.warn('LM Studio provider may not support topK parameter in the expected way, ignoring');
            }

            // Handle response format
            switch (params.responseFormat) {
                case 'JSON':
                    // LM Studio may support JSON mode depending on the model
                    respondOptions.responseFormat = { type: "json_object" };
                    break;
                case 'ModelSpecific':
                    respondOptions.responseFormat = params.modelSpecificResponseFormat;
                    break;
            }

            // Make the chat completion request using respond()
            const response = await model.respond(messages, respondOptions);
            const endTime = new Date();

            const choices: ChatResultChoice[] = [{
                message: {
                    role: ChatMessageRole.assistant,
                    content: response.nonReasoningContent,
                    thinking: response.reasoningContent  
                },
                finish_reason: 'stop', // LM Studio doesn't provide detailed finish reasons
                index: 0
            }];
            
            // Create ModelUsage - LM Studio may not provide token counts
            const usage = new ModelUsage(0, 0); // Will be updated if available
            
            // Try to extract usage information if available
            if (response.stats) {
                if (response.stats.promptTokensCount) {
                    usage.promptTokens = response.stats.promptTokensCount;
                }
                if (response.stats.predictedTokensCount) {
                    usage.completionTokens = response.stats.predictedTokensCount;
                }
                // Note: totalTokens is computed automatically by the getter
            }
            
            const result = {
                success: true,
                statusText: "OK",
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                data: {
                    choices: choices,
                    usage: usage
                },
                errorMessage: "",
                exception: null,
            } as ChatResult;
            
            // Add model-specific response details
            result.modelSpecificResponseDetails = {
                provider: 'lmstudio',
                model: params.model,
                stats: response.stats
            };
            
            return result;
        } catch (error) {
            const endTime = new Date();
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            
            return {
                success: false,
                statusText: "Error",
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                data: {
                    choices: [],
                    usage: new ModelUsage(0, 0)
                },
                errorMessage: errorMessage,
                exception: error,
            } as ChatResult;
        }
    }
    
    /**
     * Create a streaming request for LM Studio
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Initialize streaming state for thinking extraction if supported
        if (this.supportsThinkingModels()) {
            this.initializeThinkingStreamState();
        }

        // Get the model instance
        const model = await this.client.llm.model(params.model);
        
        // Convert MJ messages to LM Studio format
        const messages = params.messages.map(m => ({
            role: m.role,
            content: Array.isArray(m.content) ? 
                m.content.map(block => block.content).join('\n') : 
                m.content
        }));

        // Create options for respond() method with streaming
        const respondOptions: any = {
            stream: true
        };

        // Add optional parameters with LM Studio naming conventions
        if (params.temperature != null) {
            respondOptions.temperature = params.temperature;
        }
        if (params.maxOutputTokens != null && params.maxOutputTokens > 0) {
            respondOptions.maxPredictedTokens = params.maxOutputTokens;
        }
        if (params.topP != null) {
            respondOptions.topP = params.topP;
        }
        if (params.seed != null) {
            respondOptions.seed = params.seed;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            respondOptions.stopStrings = params.stopSequences;
        }
        if (params.frequencyPenalty != null) {
            respondOptions.frequencyPenalty = params.frequencyPenalty;
        }
        if (params.presencePenalty != null) {
            respondOptions.presencePenalty = params.presencePenalty;
        }

        // Handle response format
        switch (params.responseFormat) {
            case 'JSON':
                respondOptions.responseFormat = { type: "json_object" };
                break;
            case 'ModelSpecific':
                respondOptions.responseFormat = params.modelSpecificResponseFormat;
                break;
        }
        
        return model.respond(messages, respondOptions);
    }
    
    /**
     * Process a streaming chunk from LM Studio
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        let finishReason = undefined;
        
        // LM Studio streaming format may be different
        // This will need to be adjusted based on actual LM Studio streaming response format
        if (chunk && typeof chunk === 'string') {
            const rawContent = chunk;
            
            // Process the content with thinking extraction if supported
            content = this.supportsThinkingModels() 
                ? this.processStreamChunkWithThinking(rawContent)
                : rawContent;
        } else if (chunk?.content) {
            const rawContent = chunk.content;
            
            // Process the content with thinking extraction if supported
            content = this.supportsThinkingModels() 
                ? this.processStreamChunkWithThinking(rawContent)
                : rawContent;
        }
        
        // Check for finish reason
        if (chunk?.finished) {
            finishReason = 'stop';
        }
        
        return {
            content,
            finishReason,
            usage: chunk?.stats || null
        };
    }
    
    /**
     * Create the final response from streaming results for LM Studio
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        // Extract finish reason from last chunk if available
        let finishReason = 'stop';
        if (lastChunk?.finished) {
            finishReason = 'stop';
        }
        
        // For LM Studio, we may have usage metrics from the final chunk
        const promptTokens = usage?.promptTokensCount || lastChunk?.stats?.promptTokensCount || 0;
        const completionTokens = usage?.predictedTokensCount || lastChunk?.stats?.predictedTokensCount || 0;
        
        // Create dates (will be overridden by base class)
        const now = new Date();
        
        // Create a proper ChatResult instance with constructor params
        const result = new ChatResult(true, now, now);
        
        // Get thinking content from streaming state if available
        const thinkingContent = this.thinkingStreamState?.accumulatedThinking.trim();
        
        // Set all properties
        result.data = {
            choices: [{
                message: this.addThinkingToMessage({
                    role: ChatMessageRole.assistant,
                    content: accumulatedContent ? accumulatedContent : ''
                }, thinkingContent),
                finish_reason: finishReason,
                index: 0
            }],
            usage: new ModelUsage(promptTokens, completionTokens)
        };
        
        result.statusText = 'success';
        result.errorMessage = null;
        result.exception = null;
        
        return result;
    }

    public async SummarizeText(_params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }

    public async ClassifyText(_params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }
}
