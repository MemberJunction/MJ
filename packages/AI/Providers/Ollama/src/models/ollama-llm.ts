import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ChatMessage, ChatMessageContentBlock, parseBase64DataUrl } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { Ollama, ChatRequest, ChatResponse, GenerateRequest, GenerateResponse, Message } from 'ollama';

/**
 * Ollama implementation of the BaseLLM class for local LLM inference
 * Supports chat, generation, and streaming with various open-source models
 */
@RegisterClass(BaseLLM, "OllamaLLM")
export class OllamaLLM extends BaseLLM {
    private _client: Ollama;
    private _baseUrl: string = 'http://localhost:11434';
    private _keepAlive: string | number = '5m'; // Default keep model loaded for 5 minutes
    
    constructor(apiKey?: string) {
        super(apiKey || ''); // Ollama doesn't require API key for local usage
        this._client = new Ollama({ host: this._baseUrl });
    }

    /**
     * Read only getter method to get the Ollama client instance
     */
    public get OllamaClient(): Ollama {
        return this._client;
    }

    /**
     * Read only getter method to get the Ollama client instance
     */
    public get client(): Ollama {
        return this.OllamaClient;
    }
    
    /**
     * Ollama supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Check if the provider supports thinking models
     * Ollama can support thinking models depending on the loaded model
     */
    protected supportsThinkingModels(): boolean {
        return true;
    }

    /**
     * Override SetAdditionalSettings to handle Ollama specific settings
     */
    public override SetAdditionalSettings(settings: Record<string, any>): void {
        super.SetAdditionalSettings(settings);
        
        // Handle Ollama-specific settings
        if (settings.baseUrl || settings.host) {
            this._baseUrl = settings.baseUrl || settings.host;
            this._client = new Ollama({ host: this._baseUrl });
        }
        
        if (settings.keepAlive !== undefined) {
            this._keepAlive = settings.keepAlive;
        }
    }

    /**
     * Convert MJ messages to Ollama format with proper image handling
     * Ollama expects images in a separate 'images' array as base64 strings
     */
    private convertToOllamaMessages(messages: ChatMessage[]): Message[] {
        return messages.map(msg => {
            const role = msg.role as 'system' | 'user' | 'assistant';

            // Simple string content
            if (typeof msg.content === 'string') {
                return { role, content: msg.content };
            }

            // Array of content blocks - extract text and images separately
            const contentBlocks = msg.content as ChatMessageContentBlock[];
            const textParts: string[] = [];
            const images: string[] = [];

            for (const block of contentBlocks) {
                if (block.type === 'text') {
                    textParts.push(block.content);
                } else if (block.type === 'image_url') {
                    // Extract base64 image data for Ollama
                    const imageData = this.extractBase64ForOllama(block);
                    if (imageData) {
                        images.push(imageData);
                    }
                }
                // Note: audio_url, video_url, file_url not yet supported by Ollama
            }

            const result: Message = {
                role,
                content: textParts.join('\n')
            };

            // Add images array if we have any
            if (images.length > 0) {
                result.images = images;
            }

            return result;
        });
    }

    /**
     * Extract base64 image data for Ollama API
     * Ollama expects raw base64 strings (not data URLs)
     */
    private extractBase64ForOllama(block: ChatMessageContentBlock): string | null {
        const content = block.content;

        // Check if it's a data URL (data:image/png;base64,...)
        const parsed = parseBase64DataUrl(content);
        if (parsed) {
            return parsed.data; // Return just the base64 data, not the full data URL
        }

        // If it doesn't start with http, assume it's already base64
        if (!content.startsWith('http://') && !content.startsWith('https://')) {
            return content;
        }

        // Ollama doesn't support image URLs - only base64
        console.warn('Ollama does not support image URLs, only base64. Skipping image.');
        return null;
    }

    /**
     * Implementation of non-streaming chat completion for Ollama
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();

        try {
            // Convert MJ messages to Ollama format with proper image handling
            const messages = this.convertToOllamaMessages(params.messages);

            // Create chat request parameters
            const chatRequest: ChatRequest & { stream?: false } = {
                model: params.model,
                messages: messages,
                stream: false,
                options: {
                    temperature: params.temperature
                },
                keep_alive: this._keepAlive
            };

            // Add optional parameters
            if (params.maxOutputTokens != null && params.maxOutputTokens > 0) {
                chatRequest.options = {
                    ...chatRequest.options,
                    num_predict: params.maxOutputTokens
                };
            }
            if (params.topP != null) {
                chatRequest.options = {
                    ...chatRequest.options,
                    top_p: params.topP
                };
            }
            if (params.topK != null) {
                chatRequest.options = {
                    ...chatRequest.options,
                    top_k: params.topK
                };
            }
            if (params.seed != null) {
                chatRequest.options = {
                    ...chatRequest.options,
                    seed: params.seed
                };
            }
            if (params.stopSequences != null && params.stopSequences.length > 0) {
                chatRequest.options = {
                    ...chatRequest.options,
                    stop: params.stopSequences
                };
            }
            if (params.frequencyPenalty != null) {
                chatRequest.options = {
                    ...chatRequest.options,
                    frequency_penalty: params.frequencyPenalty
                };
            }
            if (params.presencePenalty != null) {
                chatRequest.options = {
                    ...chatRequest.options,
                    presence_penalty: params.presencePenalty
                };
            }

            // Handle response format
            switch (params.responseFormat) {
                case 'JSON':
                    // Ollama supports JSON mode through format parameter
                    chatRequest.format = 'json';
                    break;
                case 'ModelSpecific':
                    if (params.modelSpecificResponseFormat) {
                        chatRequest.format = params.modelSpecificResponseFormat;
                    }
                    break;
            }

            // Make the chat completion request
            const response = await this.client.chat(chatRequest) as ChatResponse;
            const endTime = new Date();

            // Process thinking content if present (for models that support it)
            let content = response.message.content;
            let thinking: string | undefined = undefined;
            
            if (this.supportsThinkingModels() && content) {
                const extracted = this.extractThinkingFromContent(content);
                content = extracted.content;
                thinking = extracted.thinking;
            }

            const choices: ChatResultChoice[] = [{
                message: {
                    role: ChatMessageRole.assistant,
                    content: content,
                    thinking: thinking
                },
                finish_reason: response.done ? 'stop' : 'length',
                index: 0
            }];
            
            // Create ModelUsage from Ollama response
            const usage = new ModelUsage(
                response.prompt_eval_count || 0,
                response.eval_count || 0
            );
            
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
                provider: 'ollama',
                model: params.model,
                total_duration: response.total_duration,
                load_duration: response.load_duration,
                prompt_eval_duration: response.prompt_eval_duration,
                eval_duration: response.eval_duration
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
     * Create a streaming request for Ollama
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Initialize streaming state for thinking extraction if supported
        if (this.supportsThinkingModels()) {
            this.initializeThinkingStreamState();
        }

        // Convert MJ messages to Ollama format with proper image handling
        const messages = this.convertToOllamaMessages(params.messages);

        // Create streaming chat request parameters
        const chatRequest: ChatRequest = {
            model: params.model,
            messages: messages,
            stream: true,
            options: {
                temperature: params.temperature
            },
            keep_alive: this._keepAlive
        };

        // Add optional parameters
        if (params.maxOutputTokens != null && params.maxOutputTokens > 0) {
            chatRequest.options = {
                ...chatRequest.options,
                num_predict: params.maxOutputTokens
            };
        }
        if (params.topP != null) {
            chatRequest.options = {
                ...chatRequest.options,
                top_p: params.topP
            };
        }
        if (params.topK != null) {
            chatRequest.options = {
                ...chatRequest.options,
                top_k: params.topK
            };
        }
        if (params.seed != null) {
            chatRequest.options = {
                ...chatRequest.options,
                seed: params.seed
            };
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            chatRequest.options = {
                ...chatRequest.options,
                stop: params.stopSequences
            };
        }
        if (params.frequencyPenalty != null) {
            chatRequest.options = {
                ...chatRequest.options,
                frequency_penalty: params.frequencyPenalty
            };
        }
        if (params.presencePenalty != null) {
            chatRequest.options = {
                ...chatRequest.options,
                presence_penalty: params.presencePenalty
            };
        }

        // Handle response format
        switch (params.responseFormat) {
            case 'JSON':
                chatRequest.format = 'json';
                break;
            case 'ModelSpecific':
                if (params.modelSpecificResponseFormat) {
                    chatRequest.format = params.modelSpecificResponseFormat;
                }
                break;
        }
        
        // Return the streaming response
        // Cast stream to true for TypeScript overload resolution
        return this.client.chat({ ...chatRequest, stream: true } as ChatRequest & { stream: true });
    }
    
    /**
     * Process a streaming chunk from Ollama
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        let finishReason = undefined;
        let usage = undefined;
        
        // Ollama streaming chunks have a specific format
        if (chunk && typeof chunk === 'object') {
            if (chunk.message && chunk.message.content) {
                const rawContent = chunk.message.content;
                
                // Process the content with thinking extraction if supported
                content = this.supportsThinkingModels() 
                    ? this.processStreamChunkWithThinking(rawContent)
                    : rawContent;
            }
            
            // Check if this is the final chunk
            if (chunk.done === true) {
                finishReason = 'stop';
                
                // Extract usage information from final chunk
                if (chunk.prompt_eval_count || chunk.eval_count) {
                    usage = {
                        promptTokens: chunk.prompt_eval_count || 0,
                        completionTokens: chunk.eval_count || 0
                    };
                }
            }
        }
        
        return {
            content,
            finishReason,
            usage
        };
    }
    
    /**
     * Create the final response from streaming results for Ollama
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        // Extract finish reason from last chunk if available
        let finishReason = 'stop';
        if (lastChunk?.done === false) {
            finishReason = 'length';
        }
        
        // Extract usage metrics from accumulated usage or last chunk
        let promptTokens = 0;
        let completionTokens = 0;
        
        if (usage) {
            promptTokens = usage.promptTokens || 0;
            completionTokens = usage.completionTokens || 0;
        } else if (lastChunk) {
            promptTokens = lastChunk.prompt_eval_count || 0;
            completionTokens = lastChunk.eval_count || 0;
        }
        
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
        
        // Add Ollama-specific details if available
        if (lastChunk) {
            result.modelSpecificResponseDetails = {
                provider: 'ollama',
                model: lastChunk.model,
                total_duration: lastChunk.total_duration,
                load_duration: lastChunk.load_duration,
                prompt_eval_duration: lastChunk.prompt_eval_duration,
                eval_duration: lastChunk.eval_duration
            };
        }
        
        return result;
    }

    /**
     * Generate endpoint implementation for Ollama (alternative to chat)
     * This can be useful for simple completion tasks
     */
    public async generate(params: {
        model: string;
        prompt: string;
        temperature?: number;
        maxOutputTokens?: number;
        stream?: boolean;
    }): Promise<any> {
        const generateRequest: GenerateRequest = {
            model: params.model,
            prompt: params.prompt,
            stream: params.stream || false,
            options: {
                temperature: params.temperature
            },
            keep_alive: this._keepAlive
        };

        if (params.maxOutputTokens) {
            generateRequest.options = {
                ...generateRequest.options,
                num_predict: params.maxOutputTokens
            };
        }

        // Handle TypeScript overload by explicitly typing based on stream value
        if (params.stream) {
            return await this.client.generate({ ...generateRequest, stream: true } as GenerateRequest & { stream: true });
        } else {
            return await this.client.generate({ ...generateRequest, stream: false } as GenerateRequest & { stream: false });
        }
    }

    /**
     * List available models in Ollama
     */
    public async listModels(): Promise<any> {
        return await this.client.list();
    }

    /**
     * Pull a model from Ollama registry
     */
    public async pullModel(modelName: string): Promise<void> {
        await this.client.pull({ model: modelName, stream: false });
    }

    /**
     * Check if a model is available locally
     */
    public async isModelAvailable(modelName: string): Promise<boolean> {
        try {
            const models = await this.listModels();
            return models.models.some((m: any) => m.name === modelName || m.name.startsWith(modelName + ':'));
        } catch {
            return false;
        }
    }

    public async SummarizeText(_params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented. Use Chat with a summarization prompt instead.");
    }

    public async ClassifyText(_params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented. Use Chat with a classification prompt instead.");
    }
}