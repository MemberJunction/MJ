import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';
import { Chat, ChatCompletion } from '@cerebras/cerebras_cloud_sdk/resources/chat';

/**
 * Cerebras implementation of the BaseLLM class
 */
@RegisterClass(BaseLLM, "CerebrasLLM")
export class CerebrasLLM extends BaseLLM {
    private _client: Cerebras;
    
    /**
     * Creates a new instance of the CerebrasLLM class
     * @param apiKey The Cerebras API key to use for authentication
     */
    constructor(apiKey: string) {
        super(apiKey);
        this._client = new Cerebras({ apiKey });
    }

    /**
     * Read only getter method to get the Cerebras client instance
     */
    public get CerebrasClient(): Cerebras {
        return this._client;
    }

    /**
     * Read only getter method to get the Cerebras client instance
     */
    public get client(): Cerebras {
        return this.CerebrasClient;
    }
    
    /**
     * Cerebras supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Check if the provider supports thinking models
     * Cerebras supports thinking models with <think> blocks
     */
    protected supportsThinkingModels(): boolean {
        return true;
    }

    /**
     * Set the reasoning_effort parameter for Cerebras models
     * Currently only supported for OpenAI GPT OSS models
     */
    protected setCerebrasParamsEffortLevel(cerebrasParams: Chat.ChatCompletionCreateParams, params: ChatParams): void {
        let convertedEffortLevel = params.effortLevel;
        if (convertedEffortLevel) {
            const isGptOSSModel = params.model.toLowerCase().includes("gpt-oss");
            const numericEffortLevel = Number.isNaN(params.effortLevel) ? null : Number.parseInt(params.effortLevel);
            
            if (isGptOSSModel) {
                // Map our effort levels as follows:
                // 0-33 = "low"
                // 34-66 = "medium"
                // 67-100 = "high"
                if (numericEffortLevel !== null) {
                    if (numericEffortLevel >= 0 && numericEffortLevel <= 33) {
                        convertedEffortLevel = "low";
                    } else if (numericEffortLevel > 33 && numericEffortLevel <= 66) {
                        convertedEffortLevel = "medium";
                    } else if (numericEffortLevel > 66 && numericEffortLevel <= 100) {
                        convertedEffortLevel = "high";
                    }
                }
                
                // Only set reasoning_effort for GPT OSS models
                cerebrasParams.reasoning_effort = convertedEffortLevel as "low" | "medium" | "high";
            }
        }
    }

    /**
     * Implementation of non-streaming chat completion for Cerebras
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();

        // Convert messages to format expected by Cerebras
        const messages = params.messages.map(m => {
            if (typeof m.content === 'string') {
                return {
                    role: m.role,
                    content: m.content
                };
            } else {
                // Multimodal content not fully supported yet
                // Convert to string by joining text content
                const contentStr = m.content
                    .filter(block => block.type === 'text')
                    .map(block => block.content)
                    .join('\n\n');
                return {
                    role: m.role,
                    content: contentStr
                };
            }
        })  
        
        const cerebrasParams: Chat.ChatCompletionCreateParams = {
            model: params.model,
            messages: messages,
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature
        };
        
        // Add reasoning_effort if supported by the model
        this.setCerebrasParamsEffortLevel(cerebrasParams, params);
        
        // Handle response format if specified
        switch (params.responseFormat) {
            case 'Any':
            case 'Text':
            case 'Markdown':
                break;
            case 'JSON':
                cerebrasParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                cerebrasParams.response_format = params.modelSpecificResponseFormat;
                break;
        }

        const chatResponse = await this.client.chat.completions.create(cerebrasParams);
        const endTime = new Date();

        // Cast to any to extract the choices
        const choices: ChatResultChoice[] = (chatResponse.choices as Array<ChatCompletion.ChatCompletionResponse.Choice>).map((choice: any) => {
            const rawMessage = choice.message.content;
            // in some cases, Cerebras models do thinking and return that as the first part 
            // of the message the very first characters will be <think> and it ends with
            // </think> so we need to remove that and put that into a new thinking response element
            // Extract thinking content if present using base class helper
            const extracted = this.extractThinkingFromContent(rawMessage);

            const res: ChatResultChoice = {
                message: {
                    role: ChatMessageRole.assistant,
                    content: extracted.content,
                    thinking: extracted.thinking || choice.message.reasoning // Include reasoning field if present
                },
                finish_reason: choice.finish_reason,
                index: choice.index
            };
            return res;
        });
         
         
        const usage = chatResponse.usage as ChatCompletion.ChatCompletionResponse.Usage
        return {
            success: true,
            statusText: "OK",
            startTime: startTime,
            endTime: endTime,
            timeElapsed: endTime.getTime() - startTime.getTime(),
            data: {
                choices: choices,
                usage: new ModelUsage(usage.prompt_tokens, usage.completion_tokens)
            },
            errorMessage: "",
            exception: null,
        };
    }
    
    /**
     * Create a streaming request for Cerebras
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Initialize streaming state for thinking extraction if supported
        if (this.supportsThinkingModels()) {
            this.initializeThinkingStreamState();
        }
        // Convert messages to format expected by Cerebras
        const messages = params.messages.map(m => {
            if (typeof m.content === 'string') {
                return {
                    role: m.role,
                    content: m.content
                };
            } else {
                // Multimodal content not fully supported yet
                // Convert to string by joining text content
                const contentStr = m.content
                    .filter(block => block.type === 'text')
                    .map(block => block.content)
                    .join('\n\n');
                return {
                    role: m.role,
                    content: contentStr
                };
            }
        })  
        
        const cerebrasParams: Chat.ChatCompletionCreateParams = {
            model: params.model,
            messages: messages,
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature,
            stream: true
        };
        
        // Add reasoning_effort if supported by the model
        this.setCerebrasParamsEffortLevel(cerebrasParams, params);
        
        // Set response format if specified
        switch (params.responseFormat) {
            case 'JSON':
                cerebrasParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                cerebrasParams.response_format = params.modelSpecificResponseFormat;
                break;
        }
        
        return this.client.chat.completions.create(cerebrasParams);
    }
    
    /**
     * Process a streaming chunk from Cerebras
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        let finishReason = undefined;
        let usage = undefined;
        
        if (chunk?.choices && chunk.choices.length > 0) {
            const choice = chunk.choices[0];
            
            if (choice?.delta?.content) {
                const rawContent = choice.delta.content;
                
                // Process the content with thinking extraction if supported
                content = this.supportsThinkingModels() 
                    ? this.processStreamChunkWithThinking(rawContent)
                    : rawContent;
            }
            
            if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
            }
        }
        
        // Cerebras sends usage metrics in the final chunk 
        if (chunk?.usage) {
            usage = new ModelUsage(
                chunk.usage.prompt_tokens,
                chunk.usage.completion_tokens
            );
        }
        
        return {
            content,
            finishReason,
            usage
        };
    }
    
    /**
     * Create the final response from streaming results for Cerebras
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        // Extract finish reason from last chunk if available
        let finishReason = 'stop';
        if (lastChunk?.choices && lastChunk.choices.length > 0 && lastChunk.choices[0].finish_reason) {
            finishReason = lastChunk.choices[0].finish_reason;
        }
        
        // Get thinking content from streaming state if available
        const thinkingContent = this.thinkingStreamState?.accumulatedThinking.trim();
        
        // For Cerebras, usage metrics come in the final chunk
        const promptTokens = usage?.promptTokens || 0;
        const completionTokens = usage?.completionTokens || 0;
        
        // Create dates (will be overridden by base class)
        const now = new Date();
        
        // Create a proper ChatResult instance with constructor params
        const result = new ChatResult(true, now, now);
        
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
 
    /**
     * Summarizes text using Cerebras LLM capabilities
     * @param params Parameters for the summarization
     * @returns A summary result
     */
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }

    /**
     * Classifies text into categories using Cerebras LLM capabilities
     * @param params Parameters for classification
     * @returns A classification result
     */
    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }
}
 
