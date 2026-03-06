import { BaseLLM, ChatParams, ChatResult, ChatResultChoice, ChatMessageRole, ClassifyParams, ClassifyResult, SummarizeParams, SummarizeResult, ModelUsage, ChatMessage, ErrorAnalyzer } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { Mistral } from "@mistralai/mistralai";
import { ChatCompletionChoice, ResponseFormat, CompletionEvent, CompletionResponseStreamChoice, ChatCompletionStreamRequest } from '@mistralai/mistralai/models/components';

@RegisterClass(BaseLLM, "MistralLLM")
export class MistralLLM extends BaseLLM {
    private _client: Mistral;
    
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
        this._client = new Mistral({
            apiKey: apiKey
        });
    }

    public get Client(): Mistral {return this._client;}
    
    /**
     * Mistral supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Implementation of non-streaming chat completion for Mistral
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();

        let responseFormat: ResponseFormat | undefined = undefined;
        if (params.responseFormat) {
            if(params.responseFormat === 'JSON') {
                responseFormat = { type: "json_object" };
            }
        }

        // Convert messages to format expected by Mistral
        const messages = this.MapMJMessagesToMistral(params.messages);
        // Create params object
        const params_obj: any = {
            model: params.model,
            messages: messages, 
            maxTokens: params.maxOutputTokens,
            responseFormat: responseFormat
        };

        // Add temperature if specified
        if (params.temperature != null) {
            params_obj.temperature = params.temperature;
        }

        // Add supported parameters
        if (params.topP != null) {
            params_obj.topP = params.topP;
        }
        if (params.topK != null) {
            params_obj.topK = params.topK;
        }
        if (params.seed != null) {
            params_obj.randomSeed = params.seed; // Mistral uses randomSeed instead of seed
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            params_obj.stop = params.stopSequences;
        }

        // Mistral doesn't support these parameters - warn if provided
        if (params.frequencyPenalty != null) {
            console.warn('Mistral provider does not support frequencyPenalty parameter, ignoring');
        }
        if (params.presencePenalty != null) {
            console.warn('Mistral provider does not support presencePenalty parameter, ignoring');
        }
        if (params.minP != null) {
            console.warn('Mistral provider does not support minP parameter, ignoring');
        }
        
        // Note: Mistral doesn't have a direct equivalent to effortLevel/reasoning_effort as of current API version
        // If/when Mistral adds this functionality, it should be added here

        const chatResponse = await this.Client.chat.complete(params_obj);

        const endTime = new Date();

        let choices: ChatResultChoice[] = chatResponse.choices.map((choice: ChatCompletionChoice) => {
            let rawContent: string = "";

            if(choice.message.content && typeof choice.message.content === 'string') {
                rawContent = choice.message.content;
            }
            else if(choice.message.content && Array.isArray(choice.message.content)) {
                rawContent = choice.message.content.join(' ');
            }

            // Extract thinking content from Magistral models
            let content: string = rawContent.trim();
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
                finish_reason: choice.finishReason,
                index: choice.index
            };
            return res;
        });
        
        // Create ModelUsage
        const usage = new ModelUsage(chatResponse.usage.promptTokens, chatResponse.usage.completionTokens);
        
        const chatResult: ChatResult = {
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
        };
        
        // Add model-specific response details
        chatResult.modelSpecificResponseDetails = {
            provider: 'mistral',
            model: chatResponse.model,
            id: chatResponse.id,
            object: chatResponse.object,
            created: chatResponse.created
        };
        
        return chatResult;
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
     * Create a streaming request for Mistral
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Reset streaming state for new request
        this.resetStreamingState();
        let responseFormat: ResponseFormat | undefined = undefined;
        if (params.responseFormat === 'JSON') {
            responseFormat = { type: "json_object" };
        }
        
        // Convert messages to format expected by Mistral
        const messages = this.MapMJMessagesToMistral(params.messages);
        
        // Create params object
        const params_obj: ChatCompletionStreamRequest = {
            model: params.model,
            messages: messages,
            maxTokens: params.maxOutputTokens,
            responseFormat: responseFormat,
        };

        // Add temperature if specified
        if (params.temperature != null) {
            (params_obj as any).temperature = params.temperature;
        }

        // Add supported parameters
        if (params.topP != null) {
            (params_obj as any).topP = params.topP;
        }
        if (params.topK != null) {
            (params_obj as any).topK = params.topK;
        }
        if (params.seed != null) {
            (params_obj as any).randomSeed = params.seed; // Mistral uses randomSeed instead of seed
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            (params_obj as any).stop = params.stopSequences;
        }

        // Mistral doesn't support these parameters - warn if provided
        if (params.frequencyPenalty != null) {
            console.warn('Mistral provider does not support frequencyPenalty parameter, ignoring');
        }
        if (params.presencePenalty != null) {
            console.warn('Mistral provider does not support presencePenalty parameter, ignoring');
        }
        if (params.minP != null) {
            console.warn('Mistral provider does not support minP parameter, ignoring');
        }
        
        // Note: Mistral doesn't have a direct equivalent to effortLevel/reasoning_effort as of current API version
        // If/when Mistral adds this functionality, it should be added here
        
        return this.Client.chat.stream(params_obj);
    }
    
    /**
     * Process a streaming chunk from Mistral
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        let usage = null;
        let finishReason = undefined;
        
        if (chunk?.data?.choices && chunk.data.choices.length > 0) {
            const choice = chunk.data.choices[0];
            
            // Extract content from the choice delta
            if (choice?.delta?.content) {
                let rawContent = '';
                if (typeof choice.delta.content === 'string') {
                    rawContent = choice.delta.content;
                } else if (Array.isArray(choice.delta.content)) {
                    rawContent = choice.delta.content.join('');
                }
                
                // Add raw content to pending content for processing
                this._streamingState.pendingContent += rawContent;
                
                // Process the pending content to extract thinking
                content = this.processThinkingInStreamingContent();
            }
            
            if (choice?.finishReason) {
                finishReason = choice.finishReason;
            }
            
            // Save usage information if available
            if (chunk?.data?.usage) {
                usage = new ModelUsage(
                    chunk.data.usage.promptTokens || 0,
                    chunk.data.usage.completionTokens || 0
                );
            }
        }
        
        return {
            content,
            finishReason,
            usage
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
                    // with Mistral Magistral models, but handle it just in case
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
     * Create the final response from streaming results for Mistral
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
                finish_reason: lastChunk?.data?.choices?.[0]?.finishReason || 'stop',
                index: 0
            }],
            usage: usage || new ModelUsage(0, 0)
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

    protected MapMJMessagesToMistral(messages: ChatMessage[]): Array<any> {
        const returnMessages = messages.map(m => {
            if (typeof m.content === 'string') {
                return {
                    role: m.role,
                    content: m.content
                };
            } else {
                return { 
                    role: m.role,
                    content: m.content.map(block => {
                        let mistralType = undefined;
                        switch (block.type) {
                            case 'text':
                                mistralType = 'text';
                                break;
                            case 'image_url':
                                mistralType = 'image_url';
                                break;
                            case 'file_url':
                                mistralType = 'document_url';
                                break;
                            default:
                                console.warn(`${block.type} type is not supported in Mistral`);
                                break;
                        }
                        return {
                            type: block.type,
                            content: block.content
                        }
                    }).filter(block => block.type !== undefined)
                }
            }
        });
        
        // Mistral expects the last message to either be a user message or a tool message
        if (returnMessages.length > 0) {
            const lastMessage = returnMessages[returnMessages.length - 1];
            if (lastMessage.role !== 'user' /*&& lastMessage.role !== 'tool' -- in future if BaseLLM supports tool messages*/) {
                returnMessages.push({
                    role: 'user',
                    content: 'ok' // Placeholder message to satisfy Mistral's requirement
                })
            }
        }
        return returnMessages;
    }
}