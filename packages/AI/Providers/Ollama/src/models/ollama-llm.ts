import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ChatMessage, ChatMessageContentBlock, parseBase64DataUrl, ErrorAnalyzer } from '@memberjunction/ai';
import { RegisterClass, ToJSONSafe } from '@memberjunction/global';
import { Ollama, ChatRequest, ChatResponse, GenerateRequest, GenerateResponse, Message, Fetch } from 'ollama';

/**
 * True when `error` represents a client-initiated cancellation rather than a genuine failure.
 * The `ollama` client has no typed cancellation error of its own — aborting the underlying `fetch`
 * surfaces Node's `AbortError` (or `TimeoutError` for an `AbortSignal.timeout()` source).
 */
function isOllamaCancellationError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const name = (error as { name?: string }).name;
    return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * Ollama implementation of the BaseLLM class for local LLM inference
 * Supports chat, generation, and streaming with various open-source models
 */
@RegisterClass(BaseLLM, "OllamaLLM")
export class OllamaLLM extends BaseLLM {
    private _client: Ollama;
    private _baseUrl: string = 'http://localhost:11434';
    private _keepAlive: string | number = '5m'; // Default keep model loaded for 5 minutes

    // Cancellation token for the in-flight STREAMING request. The base class's streaming loop
    // swallows mid-stream iteration errors, so finalizeStreamingResponse() consults this to detect
    // that the stream ended because the caller aborted rather than because the model finished.
    private _streamingCancellationToken: AbortSignal | null = null;

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
     * Ollama natively supports assistant prefill
     */
    public override get SupportsPrefill(): boolean {
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
     * Resolve the Ollama client to use for a single request.
     *
     * IMPORTANT: the `ollama` npm client exposes NO per-request cancellation hook — `chat()` takes
     * no options bag, and the instance-level `abort()` kills *every* in-flight streamed request on
     * that client, which is unusable for a shared singleton. The one supported seam is
     * `Config.fetch`, so when a cancellation token is supplied we build a short-lived client whose
     * `fetch` carries the caller's signal. Aborting it tears down the real HTTP socket (streaming
     * and non-streaming alike) instead of merely abandoning the promise. With no token we reuse the
     * shared client, so the default path is unchanged.
     */
    private clientForRequest(token: AbortSignal | undefined): Ollama {
        if (!token) {
            return this._client;
        }
        return new Ollama({ host: this._baseUrl, fetch: this.createCancellableFetch(token) });
    }

    /**
     * A `fetch` wrapper that layers the caller's cancellation token on top of whatever signal the
     * Ollama client already supplies (it creates its own AbortController for streamed requests, so
     * both signals must be honored — aborting on EITHER cancels the request).
     */
    private createCancellableFetch(token: AbortSignal): Fetch {
        return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
            return fetch(input, { ...init, signal: this.combineSignals(token, init?.signal) });
        };
    }

    /**
     * Combine two AbortSignals into one. Uses a plain AbortController rather than `AbortSignal.any`
     * so this works on every Node version MJ supports (`any` only landed in Node 20.3).
     */
    private combineSignals(token: AbortSignal, existing: AbortSignal | null | undefined): AbortSignal {
        if (!existing) {
            return token;
        }
        const controller = new AbortController();
        const abort = (source: AbortSignal) => controller.abort(source.reason);
        for (const signal of [token, existing]) {
            if (signal.aborted) {
                controller.abort(signal.reason);
                return controller.signal;
            }
            signal.addEventListener('abort', () => abort(signal), { once: true });
        }
        return controller.signal;
    }

    /** Throw immediately (before any socket is opened) when the caller has already cancelled. */
    private throwIfCancelled(token: AbortSignal | undefined): void {
        if (token?.aborted) {
            throw this.createCancellationError(token);
        }
    }

    /** The canonical abort error we raise for a pre-aborted request, shaped like fetch's own. */
    private createCancellationError(token: AbortSignal): Error {
        const error = new Error(this.describeCancellation(token));
        error.name = 'AbortError';
        return error;
    }

    /** True when this failure is the caller's cancellation rather than a provider/network fault. */
    private isCancelled(error: unknown, token: AbortSignal | undefined): boolean {
        return token?.aborted === true || isOllamaCancellationError(error);
    }

    /** Human-readable reason for a cancellation, preferring the signal's own reason when present. */
    private describeCancellation(token: AbortSignal | undefined): string {
        const reason: unknown = token?.reason;
        if (reason instanceof Error && reason.message) {
            return `Ollama request cancelled: ${reason.message}`;
        }
        if (typeof reason === 'string' && reason.length > 0) {
            return `Ollama request cancelled: ${reason}`;
        }
        return 'Ollama request cancelled by caller';
    }

    /**
     * Build the typed ChatResult for a cancelled request — a normal failed ChatResult, the same
     * shape every other Ollama error path produces, never an unhandled rejection.
     */
    private buildCancelledResult(startTime: Date, error: unknown, token: AbortSignal | undefined): ChatResult {
        const result = new ChatResult(false, startTime, new Date());
        result.statusText = 'Cancelled';
        result.errorMessage = this.describeCancellation(token);
        result.exception = error;
        result.errorInfo = ErrorAnalyzer.analyzeError(error, 'Ollama');
        result.data = {
            choices: [],
            usage: new ModelUsage(0, 0)
        };
        return result;
    }

    /**
     * Clear per-request streaming state. Called by the base class at the start of every streaming
     * request and again in its `finally`, so the cancellation token never leaks across requests.
     */
    protected override resetStreamingState(): void {
        super.resetStreamingState();
        this._streamingCancellationToken = null;
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
            // Fail fast if the caller already cancelled before we opened a socket.
            this.throwIfCancelled(params.cancellationToken);

            // Convert MJ messages to Ollama format with proper image handling
            const messages = this.convertToOllamaMessages(params.messages);

            // Append assistant prefill if specified — Ollama supports this natively
            if (params.assistantPrefill) {
                messages.push({ role: 'assistant', content: params.assistantPrefill });
            }

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

            // Make the chat completion request through a client carrying the cancellation token
            const client = this.clientForRequest(params.cancellationToken);
            const response = await client.chat(chatRequest) as ChatResponse;
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
                eval_duration: response.eval_duration,
                raw: ToJSONSafe(response)
            };
            
            return result;
        } catch (error) {
            if (this.isCancelled(error, params.cancellationToken)) {
                return this.buildCancelledResult(startTime, error, params.cancellationToken);
            }

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

        this.throwIfCancelled(params.cancellationToken);
        this._streamingCancellationToken = params.cancellationToken ?? null;

        // Convert MJ messages to Ollama format with proper image handling
        const messages = this.convertToOllamaMessages(params.messages);

        // Append assistant prefill if specified — Ollama supports this natively
        if (params.assistantPrefill) {
            messages.push({ role: 'assistant', content: params.assistantPrefill });
        }

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
        
        // Return the streaming response, from a client carrying the cancellation token so that an
        // abort closes the socket instead of leaving the stream running.
        // Cast stream to true for TypeScript overload resolution
        const client = this.clientForRequest(params.cancellationToken);
        return client.chat({ ...chatRequest, stream: true } as ChatRequest & { stream: true });
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
        // A mid-stream abort surfaces as an iteration error that the base class swallows, so the
        // token is the only reliable signal here. Report cancellation as a clean failure instead of
        // passing off a truncated stream as a successful completion.
        const cancellationToken = this._streamingCancellationToken;
        if (cancellationToken?.aborted) {
            return this.buildCancelledResult(new Date(), this.createCancellationError(cancellationToken), cancellationToken);
        }

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