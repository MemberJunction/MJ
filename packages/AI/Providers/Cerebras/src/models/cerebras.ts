import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, StreamingChatCallbacks } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { Cerebras } from '@cerebras/cerebras_cloud_sdk';
import { Chat } from '@cerebras/cerebras_cloud_sdk/resources/chat';

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
     * Implementation of non-streaming chat completion for Cerebras
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();

        const cerebrasParams: Chat.ChatCompletionCreateParams = {
            model: params.model,
            messages: params.messages,
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature
        };
        
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

        const choices: ChatResultChoice[] = (chatResponse.choices as any[]).map((choice: any) => {
            const res: ChatResultChoice = {
                message: {
                    role: 'assistant',
                    content: choice.message.content
                },
                finish_reason: choice.finish_reason,
                index: choice.index
            };
            return res;
        });
        
        const usage = chatResponse.usage as any;
        
        return {
            success: true,
            statusText: "OK",
            startTime: startTime,
            endTime: endTime,
            timeElapsed: endTime.getTime() - startTime.getTime(),
            data: {
                choices: choices,
                usage: {
                    totalTokens: usage.total_tokens,
                    promptTokens: usage.prompt_tokens,
                    completionTokens: usage.completion_tokens
                }
            },
            errorMessage: "",
            exception: null,
        };
    }
    
    /**
     * Create a streaming request for Cerebras
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        const cerebrasParams: Chat.ChatCompletionCreateParams = {
            model: params.model,
            messages: params.messages,
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature,
            stream: true
        };
        
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
                content = choice.delta.content;
            }
            
            if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
            }
        }
        
        // Cerebras sends usage metrics in the final chunk 
        if (chunk?.usage) {
            usage = {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens
            };
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
                message: {
                    role: 'assistant',
                    content: accumulatedContent ? accumulatedContent : ''
                },
                finish_reason: finishReason,
                index: 0
            }],
            usage: {
                promptTokens,
                completionTokens,
                totalTokens: promptTokens + completionTokens
            }
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
 
/**
 * Helper function that ensures the CerebrasLLM class is registered
 * Prevents tree-shaking from removing the class
 */
export function LoadCerebrasLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}