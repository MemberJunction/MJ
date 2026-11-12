import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, toClassicChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ErrorAnalyzer, NormalizeFinishReason, CHAT_FINISH_REASON_STOP, CHAT_FINISH_REASON_LENGTH, CHAT_FINISH_REASON_TOOL_CALLS } from '@memberjunction/ai';
import { RegisterClass, ToJSONSafe } from '@memberjunction/global';
import { LMStudioClient, LLMPredictionFragment, LLMPredictionStats, LLMPredictionStopReason, OngoingPrediction } from '@lmstudio/sdk';

/**
 * The last item of a streamed prediction: LM Studio's stats for the finished prediction, read from
 * `prediction.result()` after the fragments end. The fragments themselves carry no stop reason or
 * token counts, so without this a stopped prediction looked like a short, complete answer (#5651).
 */
interface LMStudioPredictionEnd {
    readonly Kind: 'LMStudioPredictionEnd';
    readonly Stats: LLMPredictionStats;
}

/** LM Studio stop reasons that end a prediction normally, as MJ's normalized `finish_reason`. */
const LM_STUDIO_FINISH_REASONS: Readonly<Partial<Record<LLMPredictionStopReason, string>>> = {
    eosFound: CHAT_FINISH_REASON_STOP,
    stopStringFound: CHAT_FINISH_REASON_STOP,
    maxPredictedTokensReached: CHAT_FINISH_REASON_LENGTH,
    contextLengthReached: CHAT_FINISH_REASON_LENGTH,
    toolCalls: CHAT_FINISH_REASON_TOOL_CALLS
};

/** Stop reasons where LM Studio ended the prediction before the model did: the text is incomplete. */
const LM_STUDIO_INTERRUPTED: ReadonlySet<LLMPredictionStopReason> = new Set<LLMPredictionStopReason>(['userStopped', 'modelUnloaded']);

function isPredictionEnd(chunk: unknown): chunk is LMStudioPredictionEnd {
    return typeof chunk === 'object' && chunk !== null && (chunk as { Kind?: unknown }).Kind === 'LMStudioPredictionEnd';
}

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
    public get Client(): LMStudioClient {
        return this.LMStudioClient;
    }

    /** @deprecated Use {@link Client}. */
    public get client(): LMStudioClient {
        return this.Client;
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

    /** Whether LM Studio ended a prediction before the model finished it (stopped, or model unloaded). */
    private isInterrupted(stats: LLMPredictionStats | undefined): boolean {
        return stats?.stopReason != null && LM_STUDIO_INTERRUPTED.has(stats.stopReason);
    }

    /** A finished prediction's stop reason as MJ's normalized `finish_reason`. */
    private finishReasonFor(stats: LLMPredictionStats | undefined): string {
        const reason = stats?.stopReason;
        return reason ? (LM_STUDIO_FINISH_REASONS[reason] ?? NormalizeFinishReason(reason)) : CHAT_FINISH_REASON_STOP;
    }

    /**
     * The result of a prediction LM Studio stopped on its own (from its UI or the server), not because
     * the caller aborted it: a failure, and a retriable one, since another model or vendor can answer.
     */
    private stoppedByServerResult(startTime: Date, endTime: Date, stopReason: LLMPredictionStopReason = 'userStopped'): ChatResult {
        const result = new ChatResult(false, startTime, endTime);
        result.data = { choices: [], usage: new ModelUsage(0, 0) };
        result.statusText = 'error';
        result.errorMessage = stopReason === 'modelUnloaded'
            ? 'LM Studio unloaded the model before the prediction finished'
            : 'LM Studio stopped the prediction before it finished';
        result.errorInfo = { errorType: 'ServiceUnavailable', severity: 'Retriable', canFailover: true };
        return result;
    }

    /**
     * Exposes a prediction as a plain async-iterable of its fragments, followed by one
     * {@link LMStudioPredictionEnd} carrying the finished prediction's stats. An `OngoingPrediction` is
     * also a thenable, so returning it from an `async` method would await the whole prediction instead
     * of streaming it; this hands back an iterator. Each call reads its own prediction, so nothing is
     * kept on the shared driver instance.
     */
    private asFragmentStream(prediction: OngoingPrediction): AsyncIterable<LLMPredictionFragment | LMStudioPredictionEnd> {
        return {
            [Symbol.asyncIterator]: async function* (): AsyncGenerator<LLMPredictionFragment | LMStudioPredictionEnd> {
                for await (const fragment of prediction) {
                    yield fragment;
                }
                const finished = await prediction.result();
                yield { Kind: 'LMStudioPredictionEnd', Stats: finished.stats };
            }
        };
    }

    /**
     * Implementation of non-streaming chat completion for LM Studio
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();

        try {
            // Get the model instance — the signal also cancels a pending model load
            const model = await this.Client.llm.model(params.model, { signal: params.cancellationToken });

            // Convert MJ messages to LM Studio format
            const messages = params.messages.map(m => ({
                role: toClassicChatMessageRole(m.role),
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

            // LM Studio resolves (stop reason `userStopped`) rather than throwing when aborted, so the
            // truncated answer must not be reported as a success. Our own abort is a cancellation; a
            // stop that did not come from our signal (LM Studio's UI, the server) is a retriable failure.
            if (params.cancellationToken?.aborted) {
                return this.BuildCancelledChatResult(startTime, { signal: params.cancellationToken });
            }
            if (this.isInterrupted(response.stats)) {
                return this.stoppedByServerResult(startTime, endTime, response.stats.stopReason);
            }

            const choices: ChatResultChoice[] = [{
                message: {
                    role: ChatMessageRole.assistant,
                    content: response.nonReasoningContent,
                    thinking: response.reasoningContent  
                },
                finish_reason: this.finishReasonFor(response.stats),
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
            if (this.IsCancellationError(error, params.cancellationToken)) {
                return this.BuildCancelledChatResult(startTime, { error, signal: params.cancellationToken });
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
    protected async createStreamingRequest(params: ChatParams): Promise<AsyncIterable<LLMPredictionFragment | LMStudioPredictionEnd>> {
        // Initialize streaming state for thinking extraction if supported
        if (this.supportsThinkingModels()) {
            this.initializeThinkingStreamState();
        }

        // Get the model instance — the signal also cancels a pending model load
        const model = await this.Client.llm.model(params.model, { signal: params.cancellationToken });

        // Convert MJ messages to LM Studio format
        const messages = params.messages.map(m => ({
            role: toClassicChatMessageRole(m.role),
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
        
        // OngoingPrediction is an async-iterable of prediction fragments. On abort it ends without
        // throwing; BaseLLM reads the aborted signal and reports the request as cancelled.
        return this.asFragmentStream(model.respond(messages, respondOptions));
    }

    /**
     * Process a streaming chunk from LM Studio
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        if (isPredictionEnd(chunk)) {
            return { content: '', finishReason: this.finishReasonFor(chunk.Stats), usage: chunk.Stats };
        }

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
        // The stream ends with the prediction's stats (asFragmentStream). A prediction LM Studio
        // stopped or whose model it unloaded is incomplete: a retriable failure, never an answer. A
        // caller's own abort never reaches here; BaseLLM turns it into a cancelled result first.
        const stats = isPredictionEnd(lastChunk) ? lastChunk.Stats : undefined;
        const now = new Date();
        if (this.isInterrupted(stats)) {
            return this.stoppedByServerResult(now, now, stats?.stopReason);
        }
        const finishReason = this.finishReasonFor(stats);

        const promptTokens = stats?.promptTokensCount || usage?.promptTokensCount || 0;
        const completionTokens = stats?.predictedTokensCount || usage?.predictedTokensCount || 0;
        
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
