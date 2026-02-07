import { 
  BaseLLM, 
  ChatParams,
  ChatResult, 
  ChatResultChoice,
  ChatMessageRole,
  ChatMessageContent,
  ChatMessageContentBlock,
  ClassifyParams, 
  ClassifyResult,
  ClassifyTag,
  SummarizeParams, 
  SummarizeResult,
  GetUserMessageFromChatParams,
  ModelUsage,
  BaseResult,
  ErrorAnalyzer
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { AzureChatCompletionChoice, AzureChatCompletionChunk, AzureChatCompletionChunkChoice, AzureChatCompletionResponse } from '../generic/azure.types';
import { AzureAIConfig } from '../config';
import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { DefaultAzureCredential } from "@azure/identity";

// Using the imported SummarizeResult from @memberjunction/ai

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
            
            // Build request body with support for new parameters
            const requestBody: any = {
                messages: params.messages,
                model: params.model,
                max_tokens: params.maxOutputTokens,
                temperature: params.temperature,
                response_format: responseFormat
            };
            
            // Add sampling and generation parameters (Azure uses OpenAI's API)
            if (params.topP != null) {
                requestBody.top_p = params.topP;
            } else {
                // Use default top_p of 0.95 if not provided
                requestBody.top_p = 0.95;
            }
            
            if (params.frequencyPenalty != null) {
                requestBody.frequency_penalty = params.frequencyPenalty;
            }
            
            if (params.presencePenalty != null) {
                requestBody.presence_penalty = params.presencePenalty;
            }
            
            if (params.seed != null) {
                requestBody.seed = params.seed;
            }
            
            if (params.stopSequences != null && params.stopSequences.length > 0) {
                requestBody.stop = params.stopSequences;
            }
            
            // Azure (using OpenAI models) doesn't support topK or minP - warn if provided
            if (params.topK != null) {
                console.warn('Azure provider does not support topK parameter, ignoring');
            }
            if (params.minP != null) {
                console.warn('Azure provider does not support minP parameter, ignoring');
            }
            
            // Call Azure AI service
            const response = await this.Client.path("/chat/completions").post({
                body: requestBody
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
                    usage: new ModelUsage(chatResponse.usage.prompt_tokens, chatResponse.usage.completion_tokens)
                },
                errorMessage: "",
                exception: null,
            };
        } catch (error) {
            const endTime = new Date();
            const result = {
                success: false,
                statusText: "Error",
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                data: {
                    choices: [],
                    usage: new ModelUsage(0, 0)
                },
                errorMessage: error instanceof Error ? error.message : String(error),
                exception: error,
                errorInfo: ErrorAnalyzer.analyzeError(error, 'Azure')
            };
            return result;
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
        
        // Build request body with support for new parameters
        const requestBody: any = {
            messages: params.messages,
            model: params.model,
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature,
            response_format: responseFormat,
            stream: true
        };
        
        // Add sampling and generation parameters (Azure uses OpenAI's API)
        if (params.topP != null) {
            requestBody.top_p = params.topP;
        } else {
            // Use default top_p of 0.95 if not provided
            requestBody.top_p = 0.95;
        }
        
        if (params.frequencyPenalty != null) {
            requestBody.frequency_penalty = params.frequencyPenalty;
        }
        
        if (params.presencePenalty != null) {
            requestBody.presence_penalty = params.presencePenalty;
        }
        
        if (params.seed != null) {
            requestBody.seed = params.seed;
        }
        
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            requestBody.stop = params.stopSequences;
        }
        
        // Azure (using OpenAI models) doesn't support topK or minP - warn if provided
        if (params.topK != null) {
            console.warn('Azure provider does not support topK parameter, ignoring');
        }
        if (params.minP != null) {
            console.warn('Azure provider does not support minP parameter, ignoring');
        }
        
        // Create a streaming request to Azure AI
        const response = await this.Client.path("/chat/completions").post({
            body: requestBody
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
                usage = new ModelUsage(
                    chunkData.usage.prompt_tokens || 0,
                    chunkData.usage.completion_tokens || 0
                );
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
            usage: usage || new ModelUsage(0, 0)
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
    /**
     * Helper function to convert ChatMessageContent to string
     */
    private getStringFromChatMessageContent(content: any): string {
        if (typeof content === 'string') {
            return content;
        } else if (Array.isArray(content)) {
            return content
                .filter(block => block.type === 'text')
                .map(block => block.content)
                .join('\n\n');
        }
        return '';
    }

    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        // Ensure client is initialized
        if (!this._client) {
            throw new Error('Azure client not initialized. Call SetAdditionalSettings with an endpoint first.');
        }
        
        // Extract the text from the first user message using helper
        const userContent = GetUserMessageFromChatParams(params);
        
        if (!userContent) {
            throw new Error('No text to summarize found in messages');
        }
        
        // Convert to string for Azure API (for the messages array)
        const textToSummarizeStr = this.getStringFromChatMessageContent(userContent);
        
        // Create system message to instruct for summarization
        params.messages = [
            {
                role: ChatMessageRole.system,
                content: "You are a helpful AI assistant that summarizes text. Provide a concise summary of the following text."
            },
            {
                role: ChatMessageRole.user,
                content: textToSummarizeStr
            }
        ];
        
        const chatResult = await this.ChatCompletion(params);
        
        // Map chat result to summarize result
        const startTime = chatResult.startTime;
        const endTime = chatResult.endTime;
        
        const summaryText = chatResult.success ? chatResult.data.choices[0].message.content : "";
        
        // Force TypeScript to accept any type here using assertions
        // We're bypassing the type system for compatibility
        return new SummarizeResult(
            userContent as any,
            summaryText,
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
        
        // Extract the text from the first user message using helper
        const userContent = GetUserMessageFromChatParams(params);
        
        if (!userContent) {
            throw new Error('No text to classify found in messages');
        }
        
        // Convert to string for Azure API
        const textToClassify = this.getStringFromChatMessageContent(userContent);
        
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
            // Get the content as string
            const contentStr = typeof chatResult.data.choices[0].message.content === 'string'
                ? chatResult.data.choices[0].message.content
                : JSON.stringify(chatResult.data.choices[0].message.content);
                
            const category = contentStr.trim();
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

