import { 
  BaseLLM, 
  ChatParams,
  ChatResult, 
  ChatResultChoice,
  ChatMessageRole,
  ClassifyParams, 
  ClassifyResult,
  ClassifyTag,
  SummarizeParams, 
  SummarizeResult 
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { AzureChatCompletionChoice, AzureChatCompletionChunk, AzureChatCompletionChunkChoice, AzureChatCompletionResponse } from '../generic/azure.types';
import { AzureAIConfig } from '../config';
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { DefaultAzureCredential } from "@azure/identity";

/**
 * Implementation of the Azure AI Large Language Model
 * @class AzureLLM
 * @extends BaseLLM
 */
@RegisterClass(BaseLLM, "AzureLLM")
export class AzureLLM extends BaseLLM {
    private _client: ReturnType<typeof ModelClient> | null = null;
    // We don't need to redefine _additionalSettings since it's inherited from BaseLLM
    
    /**
     * Constructor initializes with API key only
     * @param apiKey API key for Azure AI
     */
    constructor(apiKey: string) {
        super(apiKey);
        // Client initialization is deferred until SetAdditionalSettings is called
    }
    
    /**
     * Sets additional settings required for Azure AI
     * @param settings Azure-specific settings
     */
    public override SetAdditionalSettings(settings: Record<string, any>): void {
        // Call base implementation to store settings
        super.SetAdditionalSettings(settings);
        
        // Validate required settings
        if (!this.AdditionalSettings.endpoint) {
            throw new Error('Azure AI requires an endpoint URL in AdditionalSettings');
        }
        
        // Initialize client with settings
        if (this.AdditionalSettings.useAzureAD) {
            this._client = ModelClient(
                this.AdditionalSettings.endpoint,
                new DefaultAzureCredential()
            );
        } else {
            this._client = ModelClient(
                this.AdditionalSettings.endpoint,
                new AzureKeyCredential(this.apiKey)
            );
        }
    }
    
    /**
     * Clear all additional settings and reset the client
     */
    public override ClearAdditionalSettings(): void {
        super.ClearAdditionalSettings();
        this._client = null;
    }
    
    /**
     * Get the Azure endpoint URL from additional settings
     */
    public get Endpoint(): string {
        if (!this.AdditionalSettings.endpoint) {
            throw new Error('Azure endpoint URL not set. Call SetAdditionalSettings first.');
        }
        return this.AdditionalSettings.endpoint;
    }
    
    /**
     * Get the Azure AI client, initializing if necessary
     */
    protected get Client(): ReturnType<typeof ModelClient> {
        if (!this._client) {
            throw new Error('Azure client not initialized. Call SetAdditionalSettings with an endpoint first.');
        }
        return this._client;
    }
    
    /**
     * Azure AI supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Implementation of non-streaming chat completion for Azure AI
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        // Ensure client is initialized
        if (!this._client) {
            throw new Error('Azure client not initialized. Call SetAdditionalSettings with an endpoint first.');
        }
        
        const startTime = new Date();
        
        try {
            // Set up response format if specified
            let responseFormat: { type: "json_object" | "text" } | undefined = undefined;
            if (params.responseFormat) {
                if (params.responseFormat === 'JSON') {
                    responseFormat = { type: "json_object" };
                } else {
                    responseFormat = { type: "text" };
                }
            }
            
            // Call Azure AI service
            const response = await this.Client.path("/chat/completions").post({
                body: {
                    messages: params.messages,
                    model: params.model,
                    max_tokens: params.maxOutputTokens,
                    temperature: params.temperature,
                    // Use default top_p of 0.95 if not provided
                    top_p: 0.95,
                    response_format: responseFormat
                }
            });
            
            // Handle error responses
            if (!response.body) {
                throw new Error('No response body received from Azure AI');
            }
            
            // Parse the response
            const chatResponse = response.body as AzureChatCompletionResponse;
            const endTime = new Date();
            
            // Map Azure response to our format
            const choices: ChatResultChoice[] = chatResponse.choices.map((choice: AzureChatCompletionChoice) => {
                return {
                    message: {
                        role: 'assistant',
                        content: choice.message.content
                    },
                    finish_reason: choice.finish_reason,
                    index: choice.index
                };
            });
            
            // Return result
            return {
                success: true,
                statusText: "OK",
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                data: {
                    choices: choices,
                    usage: {
                        promptTokens: chatResponse.usage.prompt_tokens,
                        completionTokens: chatResponse.usage.completion_tokens,
                        totalTokens: chatResponse.usage.total_tokens
                    }
                },
                errorMessage: "",
                exception: null,
            };
        } catch (error) {
            const endTime = new Date();
            return {
                success: false,
                statusText: "Error",
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                data: {
                    choices: [],
                    usage: {
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0
                    }
                },
                errorMessage: error instanceof Error ? error.message : String(error),
                exception: error,
            };
        }
    }
    
    /**
     * Create a streaming request for Azure AI
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Ensure client is initialized
        if (!this._client) {
            throw new Error('Azure client not initialized. Call SetAdditionalSettings with an endpoint first.');
        }
        
        // Set up response format if specified
        let responseFormat: { type: "json_object" | "text" } | undefined = undefined;
        if (params.responseFormat) {
            if (params.responseFormat === 'JSON') {
                responseFormat = { type: "json_object" };
            } else {
                responseFormat = { type: "text" };
            }
        }
        
        // Create a streaming request to Azure AI
        const response = await this.Client.path("/chat/completions").post({
            body: {
                messages: params.messages,
                model: params.model,
                max_tokens: params.maxOutputTokens,
                temperature: params.temperature,
                // Use default top_p of 0.95 if not provided
                top_p: 0.95,
                response_format: responseFormat,
                stream: true
            }
        });
        
        // Return the response stream
        return response.body;
    }
    
    /**
     * Process a streaming chunk from Azure AI
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        // Extract chunk content if exists
        const chunkData = chunk as AzureChatCompletionChunk;
        let content = '';
        let usage = null;
        
        if (chunkData?.choices && chunkData.choices.length > 0) {
            const choice = chunkData.choices[0] as AzureChatCompletionChunkChoice;
            
            // Extract content from the choice delta
            if (choice?.delta?.content) {
                content = choice.delta.content;
            }
            
            // Save usage information if available
            if (chunkData?.usage) {
                usage = {
                    promptTokens: chunkData.usage.prompt_tokens || 0,
                    completionTokens: chunkData.usage.completion_tokens || 0,
                    totalTokens: chunkData.usage.total_tokens || 0
                };
            }
        }
        
        return {
            content,
            finishReason: chunkData?.choices?.[0]?.finish_reason || undefined,
            usage
        };
    }
    
    /**
     * Create the final response from streaming results for Azure AI
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
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
                finish_reason: lastChunk?.choices?.[0]?.finish_reason || 'stop',
                index: 0
            }],
            usage: usage || {
                promptTokens: 0,
                completionTokens: 0,
                totalTokens: 0
            }
        };
        
        result.statusText = 'success';
        result.errorMessage = '';
        result.exception = null;
        
        return result;
    }
    
    /**
     * Summarize text using Azure AI
     * @param params Summarization parameters
     * @returns Summarize result
     */
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        // Ensure client is initialized
        if (!this._client) {
            throw new Error('Azure client not initialized. Call SetAdditionalSettings with an endpoint first.');
        }
        
        // Extract the text from the first user message
        let textToSummarize = "";
        const userMessage = params.messages.find(m => m.role === ChatMessageRole.user);
        if (userMessage) {
            textToSummarize = userMessage.content;
        }
        
        if (!textToSummarize) {
            throw new Error('No text to summarize found in messages');
        }
        
        // Create system message to instruct for summarization
        params.messages = [
            {
                role: ChatMessageRole.system,
                content: "You are a helpful AI assistant that summarizes text. Provide a concise summary of the following text."
            },
            {
                role: ChatMessageRole.user,
                content: textToSummarize
            }
        ];
        
        const chatResult = await this.ChatCompletion(params);
        
        // Map chat result to summarize result
        const startTime = chatResult.startTime;
        const endTime = chatResult.endTime;
        
        return new SummarizeResult(
            textToSummarize,
            chatResult.success ? chatResult.data.choices[0].message.content : "",
            chatResult.success,
            startTime,
            endTime
        );
    }
    
    /**
     * Classify text using Azure AI
     * @param params Classification parameters
     * @returns Classification result
     */
    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        // Ensure client is initialized
        if (!this._client) {
            throw new Error('Azure client not initialized. Call SetAdditionalSettings with an endpoint first.');
        }
        
        // Extract the text from the first user message
        let textToClassify = "";
        const userMessage = params.messages.find(m => m.role === ChatMessageRole.user);
        if (userMessage) {
            textToClassify = userMessage.content;
        }
        
        if (!textToClassify) {
            throw new Error('No text to classify found in messages');
        }
        
        // Get possible classification tags from a system message
        let possibleTags: string[] = ["positive", "negative", "neutral"]; // Default tags
        
        // Create classification prompt
        params.messages = [
            {
                role: ChatMessageRole.system,
                content: `You are a helpful AI assistant that classifies text. Respond with ONLY the category name, nothing else.`
            },
            {
                role: ChatMessageRole.user,
                content: textToClassify
            }
        ];
        
        const chatResult = await this.ChatCompletion(params);
        
        // Map chat result to classify result
        const result = new ClassifyResult(chatResult.success, chatResult.startTime, chatResult.endTime);
        result.inputText = textToClassify;
        
        if (chatResult.success) {
            const category = chatResult.data.choices[0].message.content.trim();
            result.tags = [new ClassifyTag(category, 1.0)];
            result.statusMessage = "Classification successful";
        } else {
            result.tags = [];
            result.statusMessage = chatResult.errorMessage || "Classification failed";
        }
        
        result.errorMessage = chatResult.errorMessage || '';
        result.exception = chatResult.exception;
        
        return result;
    }
}

/**
 * Helper function to ensure the class is registered
 */
export function LoadAzureLLM() {
    // This does nothing but prevents the class from being removed by the tree shaker
}