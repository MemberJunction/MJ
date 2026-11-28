import { SummarizeParams, SummarizeResult } from "./summarize.types";
import { BaseModel, ModelUsage } from "./baseModel";
import { ChatMessage, ChatMessageRole, ChatParams, ChatResult, ChatToolCall, StreamingChatCallbacks, ParallelChatCompletionsCallbacks, ChatCompletionMessage, ValidateToolConversation } from "./chat.types";
import { ClassifyParams, ClassifyResult } from "./classify.types";
import { ErrorAnalyzer } from "./errorAnalyzer";
import { BuildCancellationErrorInfo, DescribeCancellation, IsAbortError } from "./cancellation";
import {
    BuildOpenAICompatibleToolCalls,
    BuildOpenAICompatibleToolChoice,
    BuildOpenAICompatibleToolResults,
    BuildOpenAICompatibleTools,
    ReadOpenAICompatibleToolCalls,
    type OpenAICompatibleToolCall,
    type OpenAICompatibleToolCallReadout,
    type OpenAICompatibleToolChoice,
    type OpenAICompatibleToolDeclaration,
    type OpenAICompatibleToolResultMessage,
    type RawOpenAICompatibleToolCall,
} from "./openAICompatibleTools";
import { ThinkingStreamExtractor, type ThinkingTagFormat } from "./thinkingStreamExtractor";

/**
 * Input shape for {@link BaseLLM.BuildNormalizedModelUsage}, centralizing prompt-cache net-new
 * token normalization across all LLM drivers.
 */
export interface NormalizedModelUsageParams {
    /** Raw input/prompt token count reported by the provider. */
    rawPromptTokens: number;
    /** Output/completion token count reported by the provider. */
    completionTokens: number;
    /** Input tokens served from the provider's prompt cache (cache hits / reads). */
    cacheReadTokens?: number;
    /** Input tokens written to the provider's prompt cache (cache writes / creation). */
    cacheWriteTokens?: number;
    /** Optional authoritative execution cost reported directly by the provider/gateway. */
    cost?: number;
    /** Optional ISO 4217 currency code for {@link cost} (e.g., `'USD'`). */
    costCurrency?: string;
    /**
     * When `true` (e.g., Anthropic's `input_tokens`), `rawPromptTokens` already excludes cached
     * tokens and is mapped straight through. When `false`/omitted (OpenAI, Groq, Cerebras,
     * Fireworks, Gemini), `cacheReadTokens` is subtracted (clamped at 0) so `ModelUsage.promptTokens`
     * uniformly holds uncached/net-new input tokens only.
     */
    promptTokensAlreadyExcludesCache?: boolean;
}

/**
 * Type for thinking stream state management
 */
type ThinkingStreamState = {
    accumulatedThinking: string;
    inThinkingBlock: boolean;
    pendingContent: string;
    thinkingComplete: boolean;
};

/**
 * Describes the native file input capabilities of an LLM driver.
 * Returned by BaseLLM.GetFileCapabilities(). When null, the driver
 * does not support file input and artifact tools should be used instead.
 */
export interface FileCapabilities {
    /** MIME type patterns this driver can accept natively (e.g. 'application/pdf', 'image/*') */
    SupportedMimeTypes: string[];
    /** Maximum size in bytes for a single file attachment */
    MaxFileSize: number;
    /** Maximum number of file attachments per API request */
    MaxFilesPerRequest: number;
    /** Whether this driver has a separate file upload API (e.g. Gemini Files API) vs inline base64 */
    HasFileAPI: boolean;
}

/**
 * The one piece of message metadata the framework and the providers agree on: `volatileState` marks
 * a message the agent layer appended for THIS request only — per-iteration runtime state that is
 * rebuilt every call and never persisted. Providers use it to keep such a message OUT of their
 * cached prefix. The agent layer's fuller metadata type extends this shape; this is the narrow
 * structural contract a driver may rely on without depending on the agents package.
 */
export interface VolatileStateMessageMetadata {
    volatileState?: boolean;
}

/**
 * An outgoing message list split around its trailing volatile-state message: `head` is the stable,
 * cacheable history, `tail` is the volatile message and anything after it (an assistant prefill).
 */
export interface TrailingVolatileStateSplit {
    head: ChatMessage[];
    tail: ChatMessage[];
}

/**
 * Base class for all LLM sub-class implementations. Not all sub-classes will support all methods.
 * If a method is not supported an exception will be thrown.
 */
export abstract class BaseLLM extends BaseModel {
    /**
     * Whether a reasoning block this driver replays is accepted only while everything before it
     * in the request is unchanged since the turn that produced it. When true, a caller that
     * replays reasoning must keep its history append-only: a message removed or rewritten between
     * requests invalidates every replayed block after it.
     */
    public static readonly ReplayedReasoningRequiresStablePrefix: boolean = false;

    /**
     * Process a chat completion request. If streaming is enabled and supported,
     * this will route to the streaming implementation.
     */
    public async ChatCompletion(params: ChatParams): Promise<ChatResult> {
        if (params.enableCaching === undefined) {
            params.enableCaching = true; // default to true            
        }

        // Catch an orphaned tool result here rather than letting the provider reject it with an
        // error that names only an opaque id. Scoped to tool-capable drivers because a driver that
        // ignores tools cannot be tripped by the mistake.
        if (this.SupportsTools) {
            ValidateToolConversation(params.messages);
        }

        // Native tool calling is non-streaming only: streaming tool-call delta assembly
        // differs substantially per provider and is deferred. When a caller asks for both, tools
        // win and we quietly take the non-streaming path — the same shape as the existing
        // "streaming unsupported -> non-streaming" fallback — recording it on the result so the
        // downgrade is visible rather than mysterious.
        const toolsRequested = this.SupportsTools && params.tools != null && params.tools.length > 0;
        const streamingSuppressedForTools = toolsRequested && params.streaming === true;

        // A request cancelled before it starts opens no socket, on every driver alike.
        const signal = params.cancellationToken;
        if (signal?.aborted) {
            return this.BuildCancelledChatResult(new Date(), { signal });
        }

        // Check if streaming is requested and if we support it
        if (params.streaming && params.streamingCallbacks && this.SupportsStreaming && !streamingSuppressedForTools) {
            return this.handleStreamingChatCompletion(params);
        }

        // Continue with normal non-streaming implementation
        const startTime = new Date();
        let result: ChatResult;
        try {
            result = await this.nonStreamingChatCompletion(params);
        } catch (error) {
            if (this.IsCancellationError(error, signal)) {
                return this.BuildCancelledChatResult(startTime, { error, signal });
            }
            throw error;
        }
        // A driver that caught the abort itself still reports it as a cancellation, whatever shape of
        // failure it built.
        if (!result.success && signal?.aborted) {
            return this.BuildCancelledChatResult(result.startTime ?? startTime, { error: result.exception, signal, message: result.errorMessage });
        }
        if (streamingSuppressedForTools) {
            result.modelSpecificResponseDetails = {
                ...result.modelSpecificResponseDetails,
                streamingSuppressedForTools: true
            };
        }
        return result;
    }
    
    /**
     * Process multiple chat completion requests in parallel. This is useful for:
     * - Generating multiple variations with different parameters (temperature, etc.)
     * - Getting multiple responses to compare or select from
     * - Improving reliability by sending the same request multiple times
     * 
     * @param paramsArray Array of chat completion parameter objects
     * @param callbacks Optional callbacks for progress and individual completions
     * @returns Promise resolving to an array of ChatResults in the same order as the input params
     */
    public async ChatCompletions(
        paramsArray: ChatParams[],
        callbacks?: ParallelChatCompletionsCallbacks
    ): Promise<ChatResult[]> {
        if (!paramsArray || paramsArray.length === 0) {
            return [];
        }
        
        // Create promises for each completion
        const promises = paramsArray.map((params, index) => 
            this.ChatCompletion(params)
                .then(response => {
                    // Call the OnCompletion callback if provided
                    if (callbacks?.OnCompletion) {
                        callbacks.OnCompletion(response, index);
                    }
                    return response;
                })
                .catch(error => {
                    // Call the OnError callback if provided
                    if (callbacks?.OnError) {
                        callbacks.OnError(error, index);
                    }
                    throw error; // Re-throw to be caught by Promise.allSettled
                })
        );
        
        // Use Promise.allSettled to get results even if some fail
        const results = await Promise.allSettled(promises);
        
        // Convert the settled results to an array of ChatResults
        // For rejected promises, create error ChatResults
        const chatResults = results.map((result) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return this.BuildErrorChatResult(new Date(), result.reason);
            }
        });
        
        // Call the OnAllCompleted callback if provided
        if (callbacks?.OnAllCompleted) {
            callbacks.OnAllCompleted(chatResults);
        }
        
        return chatResults;
    }
    
    /**
     * Implementation for non-streaming chat completion
     */
    protected abstract nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult>;
    
    /**
     * @deprecated Classification through a driver method is deprecated along with the legacy AI
     * Actions system, its only caller, and will be removed in the next major version. Most drivers
     * do not implement it. Run an AI Prompt through `AIPromptRunner` (`@memberjunction/ai-prompts`)
     * instead, which adds model selection, failover and cost tracking.
     */
    public abstract ClassifyText(params: ClassifyParams): Promise<ClassifyResult>;
    /**
     * @deprecated Summarization through a driver method is deprecated along with the legacy AI
     * Actions system, its only caller, and will be removed in the next major version. Run a
     * summarization AI Prompt through `AIPromptRunner` (`@memberjunction/ai-prompts`) instead,
     * which adds model selection, failover and cost tracking.
     */
    public abstract SummarizeText(params: SummarizeParams): Promise<SummarizeResult>;
    
    /**
     * Check if this provider supports streaming
     * @returns true if streaming is supported, false otherwise
     */
    public get SupportsStreaming(): boolean {
        // Default to false, providers that support streaming should override
        return false;
    }

    /**
     * Whether this driver implements native tool/function calling — i.e. whether it maps
     * `ChatParams.tools` onto its SDK and normalizes tool calls back into
     * `ChatCompletionMessage.toolCalls`.
     *
     * This is a CODE-level capability ("has the mapping been written for this driver?"), distinct
     * from the METADATA-level capability `ModelConfiguration.LLM.SupportsNativeToolCalling`
     * ("does this model, on this vendor, support tools at all?"). Both must hold for native mode.
     *
     * A driver returning false ignores any `tools` passed to it and records the fact in the
     * result's `modelSpecificResponseDetails` — the prompt runner's gate should keep that from
     * happening, but the layer is safe standalone.
     */
    public get SupportsTools(): boolean {
        // Default to false; drivers that implement the tool mapping override this.
        return false;
    }

    /**
     * Whether this LLM provider supports assistant prefill (pre-seeding the start of the model's response).
     * Providers that support prefill should override this to return true.
     * This is used as a code-level default when database metadata (AIModelType/AIModel/AIModelVendor.SupportsPrefill)
     * is null. Database values of true/false override this getter.
     */
    public get SupportsPrefill(): boolean {
        return false;
    }

    /**
     * Whether a message is framework-authored volatile state for this request only: the loop agent's
     * trailing runtime-state fragment (date/time, scratchpad, payload, a relocated specialization),
     * which is rebuilt every iteration and must never sit inside a provider's cached prefix.
     *
     * The base test is the {@link VolatileStateMessageMetadata.volatileState} flag the agent layer
     * sets. A driver may override to recognise the message by other means (Anthropic also accepts
     * the fragment's tag literal for callers that pass plain text), but should call `super` first.
     */
    protected isVolatileStateMessage(message: ChatMessage | undefined): boolean {
        const metadata = message?.metadata as VolatileStateMessageMetadata | undefined;
        return metadata?.volatileState === true;
    }

    /**
     * Index of the trailing volatile-state message in an outgoing request, or -1 when there is none.
     * The fragment is the LAST message, or the one before it when an assistant prefill has been
     * appended after it. -1 is also returned when nothing precedes the fragment, because then there
     * is no stable history for a provider to cache ahead of it.
     */
    protected trailingVolatileStateIndex(messages: ChatMessage[]): number {
        const last = messages.length - 1;
        if (last >= 1 && this.isVolatileStateMessage(messages[last])) {
            return last;
        }
        if (last >= 2 && messages[last].role === ChatMessageRole.assistant && this.isVolatileStateMessage(messages[last - 1])) {
            return last - 1;
        }
        return -1;
    }

    /**
     * Splits an outgoing request around its trailing volatile-state message, so a driver can place
     * its cache boundary on the last message of `head` and send `tail` uncached. Returns null when the
     * request has no trailing volatile state, in which case the driver formats the whole list as usual.
     * Neither array is a copy of the input's messages; only the list is new.
     */
    protected splitTrailingVolatileState(messages: ChatMessage[]): TrailingVolatileStateSplit | null {
        const index = this.trailingVolatileStateIndex(messages);
        if (index < 1) {
            return null;
        }
        return { head: messages.slice(0, index), tail: messages.slice(index) };
    }

    /**
     * Returns the native file input capabilities of this LLM driver, or null if
     * the driver does not support file attachments. Subclasses that accept files
     * (PDFs, images, etc.) should override this method.
     */
    public GetFileCapabilities(): FileCapabilities | null {
        return null;
    }

    /**
     * Template method for handling streaming chat completion
     * This implements the common pattern across providers while delegating
     * provider-specific logic to abstract methods.
     */
    protected async handleStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        // Always reset streaming state at the START of each request — this is the
        // primary defense. Provider singletons reuse the same instance across
        // requests, so any state from a prior request would otherwise bleed
        // through. We also call resetStreamingState() in `finally` below to
        // release accumulated buffers (e.g., extended-thinking output that can
        // grow to 100k+ chars) once the response is finalized. See audit R2-C5.
        this.resetStreamingState();

        return new Promise<ChatResult>((resolve, reject) => {
            (async () => {
                try {
                    // Get provider-specific stream
                    const stream = await this.createStreamingRequest(params);
                    
                    // Track accumulated response for final result
                    let accumulatedContent = '';
                    let lastChunk: any = null;
                    let usage = {
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0
                    };
                    
                    // Guard against null or undefined stream
                    if (!stream) {
                        throw new Error("Stream is null or undefined");
                    }
                    
                    // Process each chunk using provider-specific implementation
                    try {
                        for await (const chunk of stream) {
                            if (chunk) {
                                const processed = this.processStreamingChunk(chunk);
                                
                                if (processed?.content) {
                                    accumulatedContent += processed.content;
                                    
                                    if (params.streamingCallbacks?.OnContent) {
                                        params.streamingCallbacks.OnContent(processed.content, false);
                                    }
                                }
                                
                                lastChunk = chunk;
                                
                                // Update usage if available
                                if (processed?.usage) {
                                    usage = processed.usage;
                                }
                            }
                        }
                    } catch (streamError) {
                        // A failure part-way through the stream means the content we accumulated is
                        // TRUNCATED. Historically this was logged and swallowed, and the response was
                        // then finalized as a SUCCESS — so a dropped connection, a provider fault, or
                        // an abort mid-response silently produced a partial answer that the caller was
                        // told was complete. That is data corruption, and it affected every provider.
                        //
                        // Cancellation is the one case let through: the signal check below turns it
                        // into a cancelled result. Everything else is a genuine failure.
                        if (!params.cancellationToken?.aborted) {
                            throw streamError;
                        }
                    }

                    // An aborted stream is cancelled whether the SDK threw or simply ended iteration
                    // (Anthropic's stream returns silently). The content so far is partial and is
                    // never finalized as an answer. The signal is this request's own, so no driver
                    // has to keep cancellation state on a shared instance.
                    if (params.cancellationToken?.aborted) {
                        this.settleCancelledStream(params, this.BuildCancelledChatResult(startTime, { signal: params.cancellationToken }), resolve);
                        return;
                    }

                    // Flush any content the thinking-tag stripper was holding back waiting for more
                    // chunks. A trailing fragment that looks like the START of a thinking tag (e.g. a
                    // response literally ending in "<") is held back mid-stream so it can't leak as a
                    // partial "<think>"; if the stream then ends, that fragment is real content and
                    // must be emitted rather than silently dropped (bug A5 tail). Only visible content
                    // is flushed — an unterminated thinking block stays held back.
                    const thinkingRemainder = this.flushThinkingStreamRemainder();
                    if (thinkingRemainder) {
                        accumulatedContent += thinkingRemainder;
                        if (params.streamingCallbacks?.OnContent) {
                            params.streamingCallbacks.OnContent(thinkingRemainder, false);
                        }
                    }

                    // Stream complete, call OnContent one last time with isComplete=true
                    if (params.streamingCallbacks?.OnContent) {
                        params.streamingCallbacks.OnContent('', true);
                    }

                    // Create final result object using provider-specific implementation
                    const endTime = new Date();
                    const result = this.finalizeStreamingResponse(
                        accumulatedContent,
                        lastChunk,
                        usage
                    );
                    
                    // Guard against null result
                    if (!result) {
                        throw new Error("Failed to create result");
                    }
                    
                    // Override timestamps - the provider implementation is responsible for 
                    // properly constructing ChatResult with the required constructor arguments
                    result.startTime = startTime;
                    result.endTime = endTime;
                    // timeElapsed is a getter that computes based on startTime and endTime
                    
                    // Call OnComplete with final result
                    if (params.streamingCallbacks?.OnComplete) {
                        params.streamingCallbacks.OnComplete(result);
                    }

                    resolve(result);
                } catch (error) {
                    // An abort raised while opening the stream is a cancellation, not an error.
                    if (this.IsCancellationError(error, params.cancellationToken)) {
                        this.settleCancelledStream(params, this.BuildCancelledChatResult(startTime, { error, signal: params.cancellationToken }), resolve);
                        return;
                    }

                    if (params.streamingCallbacks?.OnError) {
                        params.streamingCallbacks.OnError(error);
                    }

                    reject(this.BuildErrorChatResult(startTime, error));
                } finally {
                    // Release any accumulated streaming buffers (thinking-block
                    // accumulators, pending content, etc.) so they don't pin
                    // memory on the singleton until the next request arrives.
                    try {
                        this.resetStreamingState();
                    } catch {
                        // Defensive — must not interfere with the resolved/rejected result.
                    }
                }
            })();
        });
    }

    /**
     * Hook invoked at the start AND end (in `finally`) of every streaming chat
     * completion to reset per-request streaming state. Default is a no-op;
     * providers that maintain instance-level streaming state (e.g., Anthropic /
     * OpenAI thinking-block accumulators) MUST override this. See audit R2-C5
     * for context — without this, state from a prior request bleeds into the
     * next one and accumulated buffers grow unbounded across the singleton's
     * lifetime.
     */
    protected resetStreamingState(): void {
        this.resetThinkingStreamState();
    }

    /**
     * Settles a cancelled stream: resolves the request first, then tells `OnComplete`. A callback that
     * throws is logged, never allowed to leave the request unsettled.
     */
    private settleCancelledStream(params: ChatParams, cancelled: ChatResult, resolve: (result: ChatResult) => void): void {
        resolve(cancelled);
        try {
            params.streamingCallbacks?.OnComplete?.(cancelled);
        } catch (callbackError) {
            console.error('OnComplete threw for a cancelled stream:', callbackError);
        }
    }

    /**
     * Whether a request ended because it was aborted: its signal is aborted, the error is an abort by
     * name (`AbortError`, `APIUserAbortError`, `RequestAbortedError`), or {@link IsProviderAbortError}
     * recognizes it.
     */
    protected IsCancellationError(error: unknown, signal?: AbortSignal | null): boolean {
        return signal?.aborted === true || IsAbortError(error) || this.IsProviderAbortError(error);
    }

    /**
     * Recognizes an abort error the shared names miss. A driver whose SDK raises its own class for an
     * aborted request overrides this. Default: false.
     */
    protected IsProviderAbortError(_error: unknown): boolean {
        return false;
    }

    /**
     * The result of a cancelled request, the same for every driver: a failed result with no choices,
     * `statusText` `'cancelled'`, and an `errorInfo` that says `Cancelled` (Fatal, never failed over) —
     * or, when the signal was aborted by a timeout, a retriable `NetworkError`.
     *
     * @param options.error The error the abort raised, kept on `exception`.
     * @param options.signal The request's abort signal, read for why it was aborted.
     * @param options.message The message to report; defaults to one naming the signal's reason.
     */
    protected BuildCancelledChatResult(startTime: Date, options: { error?: unknown; signal?: AbortSignal | null; message?: string } = {}): ChatResult {
        const result = new ChatResult(false, startTime, new Date());
        result.data = {
            choices: [],
            usage: new ModelUsage(0, 0)
        };
        result.statusText = 'cancelled';
        result.errorMessage = options.message || DescribeCancellation(options.signal);
        result.exception = options.error;
        result.errorInfo = BuildCancellationErrorInfo({ error: options.error, signal: options.signal, provider: this.constructor.name });
        return result;
    }

    /**
     * Builds a normalized {@link ModelUsage} conforming to MemberJunction's uniform cache contract:
     * `promptTokens` holds UNCACHED/net-new input tokens only, disjoint from `cacheReadTokens` and
     * `cacheWriteTokens`. Providers whose raw prompt count includes cached tokens (OpenAI, Groq,
     * Cerebras, Fireworks, Gemini) pass `promptTokensAlreadyExcludesCache: false` (the default) so
     * `cacheReadTokens` is subtracted (clamped at 0); providers like Anthropic whose `input_tokens`
     * already excludes cached tokens pass `promptTokensAlreadyExcludesCache: true`.
     */
    protected BuildNormalizedModelUsage(params: NormalizedModelUsageParams): ModelUsage {
        const cacheReadTokens = Math.max(0, params.cacheReadTokens ?? 0);
        const cacheWriteTokens = Math.max(0, params.cacheWriteTokens ?? 0);
        const rawPrompt = Math.max(0, params.rawPromptTokens ?? 0);
        const completionTokens = Math.max(0, params.completionTokens ?? 0);
        const netPromptTokens = params.promptTokensAlreadyExcludesCache
            ? rawPrompt
            : Math.max(0, rawPrompt - cacheReadTokens);

        const usage = new ModelUsage(netPromptTokens, completionTokens, params.cost, params.costCurrency);
        usage.cacheReadTokens = cacheReadTokens;
        usage.cacheWriteTokens = cacheWriteTokens;
        return usage;
    }

    /**
     * Builds a standardized error {@link ChatResult} with zeroed {@link ModelUsage} and structured
     * {@link ErrorAnalyzer.analyzeError} classification.
     */
    protected BuildErrorChatResult(
        startTime: Date,
        error: unknown,
        statusText: string = 'error',
        providerName?: string
    ): ChatResult {
        const errorResult = new ChatResult(false, startTime, new Date());
        errorResult.data = {
            choices: [],
            usage: new ModelUsage(0, 0)
        };
        errorResult.statusText = statusText;
        const message = error instanceof Error
            ? error.message
            : (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string')
                ? (error as { message: string }).message
                : 'Unknown error';
        errorResult.errorMessage = message || 'Unknown error';
        errorResult.exception = { exception: error };
        errorResult.errorInfo = ErrorAnalyzer.analyzeError(error, providerName ?? this.constructor.name);
        return errorResult;
    }

    // ============ OpenAI-Compatible Native Tool Calling Helpers ============

    /**
     * Formats {@link ChatParams.tools} into OpenAI-compatible function tool declarations, or
     * returns `undefined` when no tools were declared on `params`.
     */
    protected FormatOpenAICompatibleTools(params: ChatParams): OpenAICompatibleToolDeclaration[] | undefined {
        if (!params.tools || params.tools.length === 0) {
            return undefined;
        }
        return BuildOpenAICompatibleTools(params.tools);
    }

    /**
     * Formats {@link ChatParams.toolChoice} into OpenAI-compatible `tool_choice`, or returns
     * `undefined` when not specified on `params`.
     */
    protected FormatOpenAICompatibleToolChoice(params: ChatParams): OpenAICompatibleToolChoice | undefined {
        if (params.toolChoice === undefined) {
            return undefined;
        }
        return BuildOpenAICompatibleToolChoice(params.toolChoice);
    }

    /**
     * Formats normalized prior assistant {@link ChatToolCall}s back onto the OpenAI-compatible wire shape.
     */
    protected FormatOpenAICompatibleToolCalls(toolCalls: ChatToolCall[]): OpenAICompatibleToolCall[] {
        return BuildOpenAICompatibleToolCalls(toolCalls);
    }

    /**
     * Expands one MJ `tool`-role {@link ChatMessage} into OpenAI-compatible per-result `tool` messages.
     */
    protected FormatOpenAICompatibleToolResults(
        message: ChatMessage,
        providerName?: string
    ): OpenAICompatibleToolResultMessage[] {
        return BuildOpenAICompatibleToolResults(message, providerName ?? this.constructor.name);
    }

    /**
     * Parses raw OpenAI-compatible response `tool_calls`, reporting malformed JSON arguments cleanly
     * via {@link OpenAICompatibleToolCallReadout.Malformed}.
     */
    protected ParseOpenAICompatibleToolCalls(
        rawCalls: RawOpenAICompatibleToolCall[] | undefined | null,
        providerName?: string
    ): OpenAICompatibleToolCallReadout {
        return ReadOpenAICompatibleToolCalls(rawCalls, providerName ?? this.constructor.name);
    }
    
    /**
     * Create a provider-specific streaming request
     * @param params Chat parameters
     * @returns A stream object that can be iterated with for await
     */
    protected abstract createStreamingRequest(params: ChatParams): Promise<any>;
    
    /**
     * Process a streaming chunk from the provider
     * @param chunk The raw chunk from the provider
     * @returns Processed content and metadata
     */
    protected abstract processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string | undefined;
        usage?: any | null;
    };
    
    /**
     * Create the final response object from streaming results
     * @param accumulatedContent The complete content accumulated from all chunks
     * @param lastChunk The last chunk received from the stream
     * @param usage The usage information (tokens, etc.)
     * @returns A complete ChatResult object
     */
    protected abstract finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult;

    // ============ Thinking Model Support Helper Methods ============

    /**
     * Reusable streaming thinking-tag extractor backing {@link processStreamChunkWithThinking} and
     * {@link flushThinkingStreamRemainder}. Created on demand via {@link CreateThinkingStreamExtractor}
     * and cleared on {@link resetStreamingState}.
     */
    protected _thinkingExtractor: ThinkingStreamExtractor | null = null;

    /**
     * Factory creating a fresh {@link ThinkingStreamExtractor} configured with the provider's
     * thinking tag pair (defaults to {@link getThinkingTagFormat}).
     */
    protected CreateThinkingStreamExtractor(tags?: ThinkingTagFormat): ThinkingStreamExtractor {
        return new ThinkingStreamExtractor(tags ?? this.getThinkingTagFormat());
    }

    /**
     * Backwards-compatible state view over {@link _thinkingExtractor} for subclasses reading
     * `this.thinkingStreamState?.accumulatedThinking`.
     */
    protected get thinkingStreamState(): ThinkingStreamState | null {
        if (!this._thinkingExtractor) {
            return null;
        }
        return {
            accumulatedThinking: this._thinkingExtractor.AccumulatedThinking,
            inThinkingBlock: this._thinkingExtractor.InThinkingBlock,
            pendingContent: this._thinkingExtractor.PendingContent,
            thinkingComplete: this._thinkingExtractor.ThinkingComplete,
        };
    }

    /**
     * Check if the provider supports thinking models
     * Providers should override this to return true if they support thinking extraction
     */
    protected supportsThinkingModels(): boolean {
        return false;
    }

    /**
     * Get the thinking tag format for this provider
     * Providers can override this to customize the thinking tag format
     */
    protected getThinkingTagFormat(): ThinkingTagFormat {
        return { open: '<think>', close: '</think>' };
    }

    /**
     * Extract thinking content from non-streaming content
     * This method handles case-insensitive extraction of thinking blocks
     */
    protected extractThinkingFromContent(content: string): {
        content: string;
        thinking?: string;
    } {
        if (!content)
            return {
                content,
                thinking: undefined
            };

        let processedContent = content.trim();
        let thinkingContent: string | undefined = undefined;
        
        const tags = this.getThinkingTagFormat();
        const openTagLower = tags.open.toLowerCase();
        const closeTagLower = tags.close.toLowerCase();
        const contentLower = processedContent.toLowerCase();
        
        // Check if content starts with thinking tag (case-insensitive)
        if (contentLower.startsWith(openTagLower) && contentLower.includes(closeTagLower)) {
            // Find the actual positions in the original content
            const thinkStart = tags.open.length;
            const thinkEndIndex = contentLower.indexOf(closeTagLower);
            
            if (thinkEndIndex !== -1) {
                thinkingContent = processedContent.substring(thinkStart, thinkEndIndex).trim();
                processedContent = processedContent.substring(thinkEndIndex + tags.close.length).trim();
            }
        }
        
        return { content: processedContent, thinking: thinkingContent };
    }

    /**
     * Initialize thinking stream state for streaming extraction
     */
    protected initializeThinkingStreamState(): void {
        this._thinkingExtractor = this.CreateThinkingStreamExtractor();
    }

    /**
     * Reset thinking stream state
     */
    protected resetThinkingStreamState(): void {
        if (this._thinkingExtractor) {
            this._thinkingExtractor.Reset();
        }
        this._thinkingExtractor = null;
    }

    /**
     * Returns (and clears) any user-visible content the thinking-tag stripper is still holding back at
     * the end of a stream. Delegates to {@link ThinkingStreamExtractor.Flush}.
     */
    protected flushThinkingStreamRemainder(): string {
        return this._thinkingExtractor ? this._thinkingExtractor.Flush() : '';
    }

    /**
     * Process streaming chunk with thinking extraction.
     * Delegates to {@link ThinkingStreamExtractor.ProcessChunk}.
     */
    protected processStreamChunkWithThinking(rawContent: string): string {
        if (!this._thinkingExtractor) {
            return rawContent;
        }
        return this._thinkingExtractor.ProcessChunk(rawContent).contentDelta;
    }

    /**
     * Add thinking content to a chat completion message
     */
    protected addThinkingToMessage(
        message: ChatCompletionMessage,
        thinkingContent?: string
    ): ChatCompletionMessage {
        if (thinkingContent) {
            message.thinking = thinkingContent;
        }
        return message;
    }
}

/**
 * Result of ResolveFileInputStrategy — tells the caller whether to attach
 * a file natively or fall back to artifact-tool exploration.
 */
export interface FileInputStrategy {
    UseNativeFileInput: boolean;
    UseFileAPI: boolean;
    Reason: string;
}

/**
 * Determines whether to use native file input or artifact tools for a given file,
 * based on LLM driver capabilities and an optional prompt-level override.
 *
 * Resolution order:
 * 1. Prompt-level forceNativeFileInput override (if non-null, returns immediately)
 * 2. Driver capabilities null-check (null = no file support)
 * 3. MIME type, size, and count constraints checked against driver capabilities
 * 4. Falls back to artifact tools when any constraint is violated
 */
export function ResolveFileInputStrategy(
    mimeType: string,
    fileSizeBytes: number,
    capabilities: FileCapabilities | null,
    forceNativeFileInput: boolean | null,
    currentFileCount: number,
): FileInputStrategy {
    if (forceNativeFileInput !== null) {
        return {
            UseNativeFileInput: forceNativeFileInput,
            UseFileAPI: forceNativeFileInput && capabilities !== null ? capabilities.HasFileAPI : false,
            Reason: forceNativeFileInput
                ? 'Prompt override: native file input forced on'
                : 'Prompt override: native file input forced off',
        };
    }

    if (capabilities === null) {
        return {
            UseNativeFileInput: false,
            UseFileAPI: false,
            Reason: 'Driver does not support file input',
        };
    }

    const lower = mimeType.toLowerCase();
    const matches = capabilities.SupportedMimeTypes.some((pattern) => {
        const p = pattern.toLowerCase();
        // Wildcard on EITHER side matches (a requested 'image/*' modality probe must
        // match a driver declaring any concrete 'image/<x>' type, and vice-versa).
        if (p.endsWith('/*')) {
            return lower.startsWith(p.slice(0, -1));
        }
        if (lower.endsWith('/*')) {
            return p.startsWith(lower.slice(0, -1));
        }
        return lower === p;
    });

    if (!matches) {
        return {
            UseNativeFileInput: false,
            UseFileAPI: false,
            Reason: `MIME type '${mimeType}' not in supported types: ${capabilities.SupportedMimeTypes.join(', ')}`,
        };
    }

    if (fileSizeBytes > capabilities.MaxFileSize) {
        return {
            UseNativeFileInput: false,
            UseFileAPI: false,
            Reason: `File size ${fileSizeBytes} exceeds max file size ${capabilities.MaxFileSize}`,
        };
    }

    if (currentFileCount >= capabilities.MaxFilesPerRequest) {
        return {
            UseNativeFileInput: false,
            UseFileAPI: false,
            Reason: `File count ${currentFileCount} already at or above max ${capabilities.MaxFilesPerRequest}`,
        };
    }

    return {
        UseNativeFileInput: true,
        UseFileAPI: capabilities.HasFileAPI,
        Reason: 'All file input constraints satisfied',
    };
}