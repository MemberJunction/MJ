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
                    usage: {
                        promptTokens: 0,
                        completionTokens: 0,
                        totalTokens: 0
                    }
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
     * Template method for handling streaming chat completion
     * This implements the common pattern across providers while delegating
     * provider-specific logic to abstract methods.
     */
    protected async handleStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        
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
                        // If there's an error in the for-await loop, log and continue
                        console.error("Error processing stream chunks:", streamError);
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
                        usage: {
                            promptTokens: 0,
                            completionTokens: 0,
                            totalTokens: 0
                        }
                    };
                    errorResult.statusText = 'error';
                    errorResult.errorMessage = error?.message || 'Unknown error';
                    errorResult.exception = {exception: error};
                    errorResult.errorInfo = ErrorAnalyzer.analyzeError(error, this.constructor.name);
                    
                    reject(errorResult);
                }
            })();
        });
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
                // Still accumulating thinking content
                this.thinkingStreamState.accumulatedThinking += this.thinkingStreamState.pendingContent;
                this.thinkingStreamState.pendingContent = '';
                return '';
            }
        }
        
        // Not in thinking block and no thinking tags found
        contentToEmit = this.thinkingStreamState.pendingContent;
        this.thinkingStreamState.pendingContent = '';
        return contentToEmit;
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