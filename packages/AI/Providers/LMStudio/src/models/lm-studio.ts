import { AIErrorInfo, BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ErrorAnalyzer } from '@memberjunction/ai';
import { RegisterClass, ToJSONSafe } from '@memberjunction/global';
import { LMStudioClient, LLMPredictionFragment } from '@lmstudio/sdk';

/**
 * LM Studio implementation of the BaseLLM class
 */
@RegisterClass(BaseLLM, "LMStudioLLM")
export class LMStudioLLM extends BaseLLM {
    private _client: LMStudioClient;
    /**
     * Set when the in-flight streaming request was cancelled via ChatParams.cancellationToken.
     * Reset at the start and end of every streaming request by resetStreamingState().
     */
    private streamCancelled: boolean = false;

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
     * Determines whether an error (or the current state of the signal) represents a caller-initiated
     * cancellation rather than a genuine failure. Note that the LM Studio SDK does NOT reject when a
     * prediction is aborted — it stops the prediction with stop reason `userStopped` — so the aborted
     * state of the signal is the primary indicator here.
     */
    private isCancellation(error: unknown, signal?: AbortSignal): boolean {
        if (signal?.aborted) {
            return true;
        }
        return error instanceof Error && error.name === 'AbortError';
    }

    /**
     * Builds the ChatResult returned when a request is cancelled through ChatParams.cancellationToken
     * (caller abort or AIPromptRunner timeout). Marked Fatal / non-failover so no layer retries a request
     * the caller explicitly gave up on.
     */
    private buildCancelledResult(startTime: Date): ChatResult {
        const errorInfo: AIErrorInfo = {
            errorType: 'Unknown',
            severity: 'Fatal',
            canFailover: false,
            providerErrorCode: 'request_cancelled',
            context: { provider: 'lmstudio', cancelled: true }
        };

        const result = new ChatResult(false, startTime, new Date());
        result.statusText = 'cancelled';
        result.errorMessage = 'Request cancelled via cancellationToken';
        result.exception = null;
        result.errorInfo = errorInfo;
        result.data = {
            choices: [],
            usage: new ModelUsage(0, 0)
        };
        return result;
    }

    /**
     * Wraps the LM Studio prediction stream so that an abort ends iteration cleanly (flagging the
     * cancellation for finalizeStreamingResponse) instead of being reported as a truncated success.
     */
    private async *iterateWithCancellation(
        stream: AsyncIterable<LLMPredictionFragment>,
        signal?: AbortSignal
    ): AsyncGenerator<LLMPredictionFragment> {
        try {
            for await (const chunk of stream) {
                if (signal?.aborted) {
                    this.streamCancelled = true;
                    return;
                }
                yield chunk;
            }
            // LM Studio ends the prediction (stop reason `userStopped`) rather than throwing on abort,
            // so re-check the signal once the stream is exhausted.
            if (signal?.aborted) {
                this.streamCancelled = true;
            }
        } catch (error) {
            if (this.isCancellation(error, signal)) {
                this.streamCancelled = true;
                return;
            }
            throw error;
        }
    }

    /**
     * An already-exhausted stream, used when the request was cancelled before it was sent.
     */
    private async *emptyStream(): AsyncGenerator<LLMPredictionFragment> {
        // intentionally yields nothing
    }

    /**
     * Clear per-request streaming state. Invoked by the base class at the start and end of every
     * streaming request.
     */
    protected override resetStreamingState(): void {
        super.resetStreamingState();
        this.streamCancelled = false;
    }

    /**
     * Implementation of non-streaming chat completion for LM Studio
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();

        // Already cancelled before we even dial out
        if (params.cancellationToken?.aborted) {
            return this.buildCancelledResult(startTime);
        }

        try {
            // Get the model instance — the signal also cancels a pending model load
            const model = await this.client.llm.model(params.model, { signal: params.cancellationToken });

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

            // Forward the cancellation token: the SDK aborts the prediction (and its socket) on abort
            respondOptions.signal = params.cancellationToken;

            // Make the chat completion request using respond()
            const response = await model.respond(messages, respondOptions);
            const endTime = new Date();

            // LM Studio resolves (stop reason `userStopped`) rather than throwing when aborted, so we
            // must check the token ourselves to avoid presenting a truncated answer as a success.
            if (params.cancellationToken?.aborted) {
                return this.buildCancelledResult(startTime);
            }

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
                stats: response.stats,
                raw: ToJSONSafe(response)
            };
            
            return result;
        } catch (error) {
            if (this.isCancellation(error, params.cancellationToken)) {
                return this.buildCancelledResult(startTime);
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
     * Create a streaming request for LM Studio
     */
    protected async createStreamingRequest(params: ChatParams): Promise<AsyncIterable<LLMPredictionFragment>> {
        // Initialize streaming state for thinking extraction if supported
        if (this.supportsThinkingModels()) {
            this.initializeThinkingStreamState();
        }

        // Already cancelled before we dial out — hand back an empty stream; finalizeStreamingResponse
        // will report the cancellation.
        if (params.cancellationToken?.aborted) {
            this.streamCancelled = true;
            return this.emptyStream();
        }

        // Get the model instance — the signal also cancels a pending model load
        const model = await this.client.llm.model(params.model, { signal: params.cancellationToken });

        // Convert MJ messages to LM Studio format
        const messages = params.messages.map(m => ({
            role: m.role,
            content: Array.isArray(m.content) ? 
                m.content.map(block => block.content).join('\n') : 
                m.content
        }));

        // Create options for respond() method with streaming. The cancellation token is forwarded to the
        // SDK so an abort cancels the prediction and tears down its socket.
        const respondOptions: any = {
            stream: true,
            signal: params.cancellationToken
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
        
        // OngoingPrediction is an async-iterable of prediction fragments; wrap it so an abort is
        // reported as a cancellation rather than a truncated success.
        return this.iterateWithCancellation(model.respond(messages, respondOptions), params.cancellationToken);
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
        // If the prediction was aborted via the cancellation token, report a cancellation instead of
        // presenting whatever partial content we managed to accumulate as a successful response.
        if (this.streamCancelled) {
            return this.buildCancelledResult(new Date());
        }

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
