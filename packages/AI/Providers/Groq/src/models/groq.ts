import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import Groq from 'groq-sdk';
import { ChatCompletionCreateParamsNonStreaming, ChatCompletionCreateParamsStreaming, ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';

/**
 * Groq implementation of the BaseLLM class
 */
@RegisterClass(BaseLLM, "GroqLLM")
export class GroqLLM extends BaseLLM {
    private _client: Groq;
    
    // State tracking for streaming thinking extraction
    private _streamingState: {
        accumulatedThinking: string;
        inThinkingBlock: boolean;
        pendingContent: string;
        thinkingComplete: boolean;
    } = {
        accumulatedThinking: '',
        inThinkingBlock: false,
        pendingContent: '',
        thinkingComplete: false
    };
    
    constructor(apiKey: string) {
        super(apiKey);
        this._client = new Groq({ apiKey: apiKey });
    }

    /**
     * Read only getter method to get the Groq client instance
     */
    public get GroqClient(): Groq {
        return this._client;
    }

    /**
     * Read only getter method to get the Groq client instance
     */
    public get client(): Groq {
        return this.GroqClient;
    }
    
    /**
     * Groq supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Implementation of non-streaming chat completion for Groq
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();

        // Need to convert to Groq-compatible message format
        const messages = params.messages.map(m => ({
            role: m.role,
            content: m.content,
        }))  

        // Groq requires the last message to be a user message
        if (messages.length > 0 && messages[messages.length - 1].role !== 'user') {
            messages.push({
                role: 'user',
                content: 'OK' // Dummy message to satisfy Groq's requirement
            });
        }

        const groqParams: ChatCompletionCreateParamsNonStreaming = {
            model: params.model,
            messages: messages.map(m => {
                return {
                    role: m.role,
                    content: Array.isArray(m.content) ? m.content.map(block => {
                        return {
                            content: block.content,
                            type: block.type,
                        }
                    }) : m.content,
                };
            }) as Array<ChatCompletionMessageParam>, 
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature
        };
        
        // Add sampling and generation parameters
        if (params.topP != null) {
            groqParams.top_p = params.topP;
        }
        if (params.seed != null) {
            groqParams.seed = params.seed;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            groqParams.stop = params.stopSequences;
        }
        if (params.frequencyPenalty != null) {
            groqParams.frequency_penalty = params.frequencyPenalty;
        }
        if (params.presencePenalty != null) {
            groqParams.presence_penalty = params.presencePenalty;
        }
        
        // Groq doesn't support topK - warn if provided
        if (params.topK != null) {
            console.warn('Groq provider does not support topK parameter, ignoring');
        }
         
        switch (params.responseFormat) {
            case 'Any':
            case 'Text':
            case 'Markdown':
                break;
            case 'JSON':
                groqParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                groqParams.response_format = params.modelSpecificResponseFormat;
                break;
        }

        const chatResponse = await this.client.chat.completions.create(groqParams);
        const endTime = new Date();

        let choices: ChatResultChoice[] = chatResponse.choices.map((choice: any) => {
            const rawMessage = choice.message.content;
            // in some cases, Groq models do thinking and return that as the first part 
            // of the message the very first characters will be <think> and it ends with
            // </think> so we need to remove that and put that into a new thinking response element
            let content: string = rawMessage.trim();
            let thinkingContent: string | undefined = undefined;
            if (content.startsWith('<think>') && content.includes('</think>')) {
                // extract thinking content
                const thinkStart = content.indexOf('<think>') + '<think>'.length;
                const thinkEnd = content.indexOf('</think>');
                thinkingContent = content.substring(thinkStart, thinkEnd).trim();
                // remove thinking content from main content
                content = content.substring(thinkEnd + '</think>'.length).trim();
            }

            const res: ChatResultChoice = {
                message: {
                    role: ChatMessageRole.assistant,
                    content: content,
                    thinking: thinkingContent || undefined                
                },
                finish_reason: choice.finish_reason,
                index: choice.index
            };
            return res;
        });
        
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
    }
    
    /**
     * Reset streaming state for a new request
     */
    private resetStreamingState(): void {
        this._streamingState = {
            accumulatedThinking: '',
            inThinkingBlock: false,
            pendingContent: '',
            thinkingComplete: false
        };
    }
    
    /**
     * Create a streaming request for Groq
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Reset streaming state for new request
        this.resetStreamingState();
        // Need to convert to Groq-compatible message format
        const messages = params.messages.map(m => ({
            role: m.role,
            content: m.content,
        })) as any; // Use any to bypass type checking

        const groqParams: ChatCompletionCreateParamsStreaming = {
            model: params.model,
            messages: messages,
            max_tokens: params.maxOutputTokens,
            temperature: params.temperature,
            stream: true
        };
        
        // Add reasoning_effort if supported by the model
        if (params.effortLevel) {
            // Note: This is still experimental in Groq, so we add it only if explicitly requested
            (groqParams as any).reasoning_effort = params.effortLevel;
        }
        
        // Add sampling and generation parameters
        if (params.topP != null) {
            groqParams.top_p = params.topP;
        }
        if (params.seed != null) {
            groqParams.seed = params.seed;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            groqParams.stop = params.stopSequences;
        }
        if (params.frequencyPenalty != null) {
            groqParams.frequency_penalty = params.frequencyPenalty;
        }
        if (params.presencePenalty != null) {
            groqParams.presence_penalty = params.presencePenalty;
        }
        
        // Groq doesn't support topK - warn if provided
        if (params.topK != null) {
            console.warn('Groq provider does not support topK parameter, ignoring');
        }
        
        // Set response format if specified
        switch (params.responseFormat) {
            case 'JSON':
                groqParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                groqParams.response_format = params.modelSpecificResponseFormat;
                break;
        }
        
        return this.client.chat.completions.create(groqParams);
    }
    
    /**
     * Process a streaming chunk from Groq
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        let finishReason = undefined;
        
        if (chunk?.choices && chunk.choices.length > 0) {
            const choice = chunk.choices[0];
            
            if (choice?.delta?.content) {
                const rawContent = choice.delta.content;
                
                // Add raw content to pending content for processing
                this._streamingState.pendingContent += rawContent;
                
                // Process the pending content to extract thinking
                content = this.processThinkingInStreamingContent();
            }
            
            if (choice?.finish_reason) {
                finishReason = choice.finish_reason;
            }
        }
        
        // Groq doesn't provide usage in streaming chunks
        return {
            content,
            finishReason,
            usage: null
        };
    }
    
    /**
     * Process pending content to extract thinking blocks
     * Returns content that should be emitted to the user
     */
    private processThinkingInStreamingContent(): string {
        const state = this._streamingState;
        let outputContent = '';
        
        // If thinking is already complete, just pass through content
        if (state.thinkingComplete) {
            outputContent = state.pendingContent;
            state.pendingContent = '';
            return outputContent;
        }
        
        // Check if we're currently in a thinking block
        if (state.inThinkingBlock) {
            // Look for end of thinking block
            const endIndex = state.pendingContent.indexOf('</think>');
            
            if (endIndex !== -1) {
                // Found end of thinking block
                state.accumulatedThinking += state.pendingContent.substring(0, endIndex);
                state.inThinkingBlock = false;
                state.thinkingComplete = true;
                
                // Keep remaining content after </think> for output
                state.pendingContent = state.pendingContent.substring(endIndex + '</think>'.length);
                outputContent = state.pendingContent.trim();
                state.pendingContent = '';
            } else {
                // Still in thinking block, accumulate all content
                state.accumulatedThinking += state.pendingContent;
                state.pendingContent = '';
            }
        } else {
            // Not in thinking block, check if one is starting
            const startIndex = state.pendingContent.indexOf('<think>');
            
            if (startIndex !== -1) {
                // Found start of thinking block
                if (startIndex === 0) {
                    // Thinking starts at beginning
                    state.inThinkingBlock = true;
                    state.pendingContent = state.pendingContent.substring('<think>'.length);
                    
                    // Process again to check for end tag in same chunk
                    return this.processThinkingInStreamingContent();
                } else {
                    // There's content before thinking block - this shouldn't happen
                    // with Groq models, but handle it just in case
                    outputContent = state.pendingContent.substring(0, startIndex);
                    state.pendingContent = state.pendingContent.substring(startIndex);
                    state.inThinkingBlock = true;
                    state.pendingContent = state.pendingContent.substring('<think>'.length);
                }
            } else {
                // No thinking block found
                // Check if we might be at the start of a partial tag
                if (state.pendingContent.endsWith('<') || 
                    state.pendingContent.endsWith('<t') ||
                    state.pendingContent.endsWith('<th') ||
                    state.pendingContent.endsWith('<thi') ||
                    state.pendingContent.endsWith('<thin')) {
                    // Hold back content that might be start of tag
                    const lastOpenBracket = state.pendingContent.lastIndexOf('<');
                    outputContent = state.pendingContent.substring(0, lastOpenBracket);
                    state.pendingContent = state.pendingContent.substring(lastOpenBracket);
                } else {
                    // No thinking block and no partial tag, output all content
                    outputContent = state.pendingContent;
                    state.pendingContent = '';
                }
            }
        }
        
        return outputContent;
    }
    
    /**
     * Create the final response from streaming results for Groq
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
        
        // For Groq, we don't have precise usage metrics from streaming
        // We'll use the accumulated ones or defaults
        const promptTokens = usage?.promptTokens || 0;
        const completionTokens = usage?.completionTokens || 0;
        
        // Create dates (will be overridden by base class)
        const now = new Date();
        
        // Create a proper ChatResult instance with constructor params
        const result = new ChatResult(true, now, now);
        
        // Get thinking content from streaming state
        const thinkingContent = this._streamingState.accumulatedThinking.trim();
        
        // Set all properties
        result.data = {
            choices: [{
                message: {
                    role: ChatMessageRole.assistant,
                    content: accumulatedContent ? accumulatedContent : '',
                    thinking: thinkingContent || undefined
                },
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
 
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error("Method not implemented.");
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }
}
 
export function LoadGroqLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}