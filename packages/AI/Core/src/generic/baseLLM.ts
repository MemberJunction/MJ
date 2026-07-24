import { SummarizeParams, SummarizeResult } from "./summarize.types";
import { BaseModel, ModelUsage } from "./baseModel";
import { ChatParams, ChatResult, StreamingChatCallbacks, ParallelChatCompletionsCallbacks, ChatCompletionMessage } from "./chat.types";
import { ClassifyParams, ClassifyResult } from "./classify.types";
import { ErrorAnalyzer } from "./errorAnalyzer";

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
 * Base class for all LLM sub-class implementations. Not all sub-classes will support all methods.
 * If a method is not supported an exception will be thrown.
 */
export abstract class BaseLLM extends BaseModel {
    /**
     * Protected property to store additional provider-specific settings
     */
    protected _additionalSettings: Record<string, any> = {};
    
    /**
     * Get the current additional settings
     */
    public get AdditionalSettings(): Record<string, any> {
        return this._additionalSettings;
    }
    
    /**
     * Set additional provider-specific settings
     * Subclasses should override this method to validate required settings
     * 
     * @param settings Provider-specific settings
     */
    public SetAdditionalSettings(settings: Record<string, any>): void {
        this._additionalSettings = {...this._additionalSettings, ...settings};
    }

    /**
     * Clear all additional settings
     * This is useful for resetting the state of the provider
     * or when switching between different configurations.
     */
    public ClearAdditionalSettings(): void {
        this._additionalSettings = {};
    }

    /**
     * Process a chat completion request. If streaming is enabled and supported,
     * this will route to the streaming implementation.
     */
    public async ChatCompletion(params: ChatParams): Promise<ChatResult> {
        if (params.enableCaching === undefined) {
            params.enableCaching = true; // default to true            
        }

        // Check if streaming is requested and if we support it
        if (params.streaming && params.streamingCallbacks && this.SupportsStreaming) {
            return this.handleStreamingChatCompletion(params);
        }
        
        // Continue with normal non-streaming implementation
        return this.nonStreamingChatCompletion(params);
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
        const chatResults = results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                // Create an error result
                const startTime = new Date();
                const endTime = new Date();
                const errorResult = new ChatResult(false, startTime, endTime);
                errorResult.data = {
                    choices: [],
                    usage: new ModelUsage(0, 0)
                };
                errorResult.statusText = 'error';
                errorResult.errorMessage = result.reason?.message || 'Unknown error';
                errorResult.exception = {exception: result.reason};
                errorResult.errorInfo = ErrorAnalyzer.analyzeError(result.reason, this.constructor.name);
                return errorResult;
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
    
    public abstract ClassifyText(params: ClassifyParams): Promise<ClassifyResult>;
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
     * Whether this LLM provider supports assistant prefill (pre-seeding the start of the model's response).
     * Providers that support prefill should override this to return true.
     * This is used as a code-level default when database metadata (AIModelType/AIModel/AIModelVendor.SupportsPrefill)
     * is null. Database values of true/false override this getter.
     */
    public get SupportsPrefill(): boolean {
        return false;
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
                        // Cancellation is the one case we deliberately let through to
                        // finalizeStreamingResponse: providers differ on whether an abort throws here
                        // or simply ends iteration (Anthropic's stream returns silently), so they own
                        // that decision and return a cancelled result of their own shape. Everything
                        // else is a genuine failure and must surface as one.
                        if (!params.cancellationToken?.aborted) {
                            throw streamError;
                        }
                        console.error("Stream aborted while processing chunks:", streamError);
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
                    if (params.streamingCallbacks?.OnError) {
                        params.streamingCallbacks.OnError(error);
                    }

                    const endTime = new Date();

                    // Create a proper ChatResult by extending BaseResult
                    const errorResult = new ChatResult(false, startTime, endTime);
                    errorResult.data = {
                        choices: [],
                        usage: new ModelUsage(0, 0)
                    };
                    errorResult.statusText = 'error';
                    errorResult.errorMessage = error?.message || 'Unknown error';
                    errorResult.exception = {exception: error};
                    errorResult.errorInfo = ErrorAnalyzer.analyzeError(error, this.constructor.name);

                    reject(errorResult);
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
        // Default no-op. Providers override.
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
     * State tracking for streaming thinking extraction
     * Providers should initialize this if they support thinking models
     */
    protected thinkingStreamState: ThinkingStreamState | null = null;

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
    protected getThinkingTagFormat(): { open: string; close: string } {
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
        this.thinkingStreamState = {
            accumulatedThinking: '',
            inThinkingBlock: false,
            pendingContent: '',
            thinkingComplete: false
        };
    }

    /**
     * Reset thinking stream state
     */
    protected resetThinkingStreamState(): void {
        this.thinkingStreamState = null;
    }

    /**
     * Returns (and clears) any user-visible content the thinking-tag stripper is still holding back at
     * the end of a stream. Mid-stream, {@link processStreamChunkWithThinking} holds back a trailing
     * fragment that could be the start of a `<think>`/`</think>` tag so a split tag never leaks as
     * partial text; once the stream ends, such a fragment is real content and must be emitted (bug A5).
     *
     * Only flushes when NOT inside a thinking block: an unterminated `<think>` block's buffered text is
     * reasoning, not answer, and is left held back (never surfaced as visible content). Returns `''`
     * when thinking extraction isn't active (no state) or there's nothing to flush.
     */
    protected flushThinkingStreamRemainder(): string {
        const state = this.thinkingStreamState;
        if (!state || state.inThinkingBlock) {
            return '';
        }
        const remainder = state.pendingContent;
        state.pendingContent = '';
        return remainder;
    }

    /**
     * Process streaming chunk with thinking extraction
     * This method handles case-insensitive extraction across chunk boundaries
     */
    protected processStreamChunkWithThinking(rawContent: string): string {
        if (!this.thinkingStreamState) {
            // If thinking extraction is not enabled, return content as-is
            return rawContent;
        }
        
        let contentToEmit = '';
        this.thinkingStreamState.pendingContent += rawContent;
        
        // If thinking is already complete, just return the pending content
        if (this.thinkingStreamState.thinkingComplete) {
            contentToEmit = this.thinkingStreamState.pendingContent;
            this.thinkingStreamState.pendingContent = '';
            return contentToEmit;
        }
        
        const tags = this.getThinkingTagFormat();
        const pending = this.thinkingStreamState.pendingContent;
        const pendingLower = pending.toLowerCase();
        
        // Check if we're starting a thinking block (case-insensitive)
        if (!this.thinkingStreamState.inThinkingBlock && pendingLower.includes(tags.open.toLowerCase())) {
            const thinkStartIndex = pendingLower.indexOf(tags.open.toLowerCase());
            
            // If <think> is not at the start, emit content before it
            if (thinkStartIndex > 0) {
                contentToEmit = pending.substring(0, thinkStartIndex);
                this.thinkingStreamState.pendingContent = pending.substring(thinkStartIndex);
                return contentToEmit;
            }
            
            // We're now in a thinking block
            this.thinkingStreamState.inThinkingBlock = true;
            
            // Remove the opening tag
            this.thinkingStreamState.pendingContent = pending.substring(tags.open.length);
        }
        
        // If we're in a thinking block, look for the end (case-insensitive)
        if (this.thinkingStreamState.inThinkingBlock) {
            const pendingInBlockLower = this.thinkingStreamState.pendingContent.toLowerCase();
            const thinkEndIndex = pendingInBlockLower.indexOf(tags.close.toLowerCase());
            
            if (thinkEndIndex !== -1) {
                // Found the end of thinking block
                this.thinkingStreamState.accumulatedThinking += this.thinkingStreamState.pendingContent.substring(0, thinkEndIndex);
                this.thinkingStreamState.pendingContent = this.thinkingStreamState.pendingContent.substring(thinkEndIndex + tags.close.length);
                this.thinkingStreamState.inThinkingBlock = false;
                this.thinkingStreamState.thinkingComplete = true;
                
                // Process any remaining content recursively
                return this.processStreamChunkWithThinking('');
            } else {
                // Still accumulating thinking content. The close tag can be split across chunk
                // boundaries (e.g. pending ends with "</thi"); if we consumed that fragment into
                // the thinking text we would never recognize the completed "</think>" and would
                // swallow the rest of the response as thinking forever. Hold back any suffix that
                // could be the start of the close tag.
                const closeHoldBack = this.partialTagSuffixLength(this.thinkingStreamState.pendingContent, tags.close);
                const closeCut = this.thinkingStreamState.pendingContent.length - closeHoldBack;
                this.thinkingStreamState.accumulatedThinking += this.thinkingStreamState.pendingContent.substring(0, closeCut);
                this.thinkingStreamState.pendingContent = this.thinkingStreamState.pendingContent.substring(closeCut);
                return '';
            }
        }

        // Not in a thinking block and no complete open tag found. A partial open tag can be split
        // across streaming chunk boundaries (e.g. pending ends with "<thi"); emitting that fragment
        // leaks a literal "<thi" into user-visible text and it becomes "<think>" once the next chunk
        // arrives (bug A5). Hold back any suffix that could be the start of the open tag, and avoid
        // cutting in the middle of a UTF-16 surrogate pair.
        const openHoldBack = this.partialTagSuffixLength(this.thinkingStreamState.pendingContent, tags.open);
        let emitEnd = this.avoidSurrogateSplit(
            this.thinkingStreamState.pendingContent,
            this.thinkingStreamState.pendingContent.length - openHoldBack
        );
        contentToEmit = this.thinkingStreamState.pendingContent.substring(0, emitEnd);
        this.thinkingStreamState.pendingContent = this.thinkingStreamState.pendingContent.substring(emitEnd);
        return contentToEmit;
    }

    /**
     * Returns the length of the longest suffix of `text` that is a non-empty prefix of `tag`
     * (case-insensitive). Used to detect a tag that may be split across streaming chunk
     * boundaries so the caller can hold that partial fragment back instead of emitting it.
     * Returns 0 when no suffix of `text` is a prefix of `tag`.
     */
    private partialTagSuffixLength(text: string, tag: string): number {
        if (!text || !tag) {
            return 0;
        }
        const t = text.toLowerCase();
        const g = tag.toLowerCase();
        // A held-back fragment is at most tag.length - 1 chars (a full tag is handled elsewhere).
        const max = Math.min(t.length, g.length - 1);
        for (let len = max; len > 0; len--) {
            if (t.endsWith(g.substring(0, len))) {
                return len;
            }
        }
        return 0;
    }

    /**
     * Defensive guard for the tag hold-back: if the emit/hold boundary would fall *between* the two
     * halves of a UTF-16 surrogate pair (which renders as U+FFFD), move the cut back by one so the
     * full pair stays together in the held-back remainder. In the common case the held-back fragment
     * is an ASCII tag prefix (e.g. "<thi"), so `cut` lands on an ASCII boundary and this is a no-op;
     * it only bites when a hold-back boundary happens to land mid-pair. Note it does NOT hold back a
     * lone trailing high surrogate when nothing else is being held back (holdBack === 0) — a pair
     * split exactly at a streaming chunk boundary is left to render and is corrected by the next chunk.
     */
    private avoidSurrogateSplit(text: string, cut: number): number {
        if (cut > 0 && cut < text.length) {
            const code = text.charCodeAt(cut - 1);
            if (code >= 0xD800 && code <= 0xDBFF) {
                return cut - 1;
            }
        }
        return cut;
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