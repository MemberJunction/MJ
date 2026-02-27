import { BaseLLM, ChatMessage, ChatMessageRole, ChatParams, ChatResult, ClassifyParams, ClassifyResult, GetUserMessageFromChatParams, ModelUsage, SummarizeParams, SummarizeResult, StreamingChatCallbacks, ErrorAnalyzer } from "@memberjunction/ai";
import { OpenAI } from "openai";
import { RegisterClass } from '@memberjunction/global';
import { ChatCompletionAssistantMessageParam, ChatCompletionContentPart, ChatCompletionMessageParam, ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam } from "openai/resources";

/**
 * OpenAI implementation of the BaseLLM class
 */
@RegisterClass(BaseLLM, 'OpenAILLM')
export class OpenAILLM extends BaseLLM {
    private _openAI: OpenAI;

    constructor(apiKey: string, baseURL?: string) {
        super(apiKey);

        // now create the OpenAI instance
        const params: Record<string, any> = {
            apiKey
        }
        if (baseURL && baseURL.length > 0) {
            params.baseURL = baseURL; // OpenAI base URL is optional, lots of sub-classes and users might use other providers that are Open AI compatible
        }
        this._openAI = new OpenAI(params);
    }

    /**
     * Read only getter method to get the OpenAI instance
     */
    public get OpenAI(): OpenAI {
        return this._openAI;
    }

    /**
     * OpenAI supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Check if the model supports reasoning via system prompt keywords
     * GPT-OSS models use "Reasoning: low/medium/high" in system prompt
     */
    private supportsReasoningViaSystemPrompt(modelName: string): boolean {
        const lowerModel = modelName.toLowerCase();
        return lowerModel.includes('gpt-oss') || lowerModel.includes('gptoss');
    }

    /**
     * Convert effort level to reasoning level string for system prompt
     */
    private getReasoningLevel(effortLevel: string): 'low' | 'medium' | 'high' {
        const numValue = Number.parseInt(effortLevel);
        if (isNaN(numValue)) {
            const level = effortLevel.trim().toLowerCase();
            if (level === 'low' || level === 'medium' || level === 'high') {
                return level as 'low' | 'medium' | 'high';
            }
            throw new Error(`Invalid effortLevel: ${effortLevel}`);
        }
        // Map numeric values to levels
        if (numValue <= 33) return 'low';
        if (numValue <= 66) return 'medium';
        return 'high';
    }

    /**
     * Implementation of non-streaming chat completion for OpenAI
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        let messages = params.messages;

        // Handle reasoning for GPT-OSS models via system prompt
        const supportsReasoningInSystemPrompt = this.supportsReasoningViaSystemPrompt(params.model);

        if (params.effortLevel && supportsReasoningInSystemPrompt) {
            const reasoningLevel = this.getReasoningLevel(params.effortLevel);
            // Add or append to system message
            const systemMsg = messages.find(m => m.role === 'system');
            if (systemMsg) {
                // Append to existing system message
                systemMsg.content = `${systemMsg.content}\n\nReasoning: ${reasoningLevel}`;
            } else {
                // Prepend new system message
                messages = [
                    { role: 'system', content: `Reasoning: ${reasoningLevel}` },
                    ...messages
                ];
            }
        }

        const formattedMessages = this.ConvertMJToOpenAIChatMessages(messages);

        const startTime = new Date();
        const openAIParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
            model: params.model,
            messages: formattedMessages,
            temperature: params.temperature,
            max_completion_tokens: params.maxOutputTokens,
            logprobs: params.includeLogProbs === true ? true : false,
            top_logprobs: params.includeLogProbs && params.topLogProbs ? params.topLogProbs : undefined,
        };

        //Reasoning effort level has been provided and it wasn't handled via system prompt
        if (params.effortLevel && !supportsReasoningInSystemPrompt) {
            const reasoningLevel = this.getReasoningLevel(params.effortLevel);
            openAIParams.reasoning_effort = reasoningLevel;
        }

        // Add sampling and generation parameters
        if (params.topP != null) {
            openAIParams.top_p = params.topP;
        }
        if (params.frequencyPenalty != null) {
            openAIParams.frequency_penalty = params.frequencyPenalty;
        }
        if (params.presencePenalty != null) {
            openAIParams.presence_penalty = params.presencePenalty;
        }
        if (params.seed != null) {
            openAIParams.seed = params.seed;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            openAIParams.stop = params.stopSequences;
        }

        // OpenAI doesn't support topK or minP - warn if provided
        if (params.topK != null) {
            console.warn('OpenAI provider does not support topK parameter, ignoring');
        }
        if (params.minP != null) {
            console.warn('OpenAI provider does not support minP parameter, ignoring');
        }

        switch (params.responseFormat) {
            case 'Any':
            case 'Text':
            case 'Markdown':
                break;
            case 'JSON':
                openAIParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                openAIParams.response_format = params.modelSpecificResponseFormat;
                break;
        }

        // GPT 5 doesn't support a temperature value other than 1.
        if ((openAIParams.model.toLowerCase() === 'gpt-5') && (openAIParams.temperature)) {
            if (openAIParams.temperature !== 1) {
                openAIParams.temperature = 1;
            }
        }

        const result = await this.OpenAI.chat.completions.create(openAIParams);
        const endTime = new Date();
        const timeElapsed = endTime.getTime() - startTime.getTime();

        // Create ModelUsage with any available timing data
        const usage = new ModelUsage(result.usage.prompt_tokens, result.usage.completion_tokens);
        
        // OpenAI doesn't provide the same timing metrics as Groq,
        // but we can check for any extended usage data
        const extendedUsage = result.usage as any;
        if (extendedUsage.prompt_tokens_details) {
            // Store prompt token details in usage if needed in future
        }
        if (extendedUsage.completion_tokens_details) {
            // Store completion token details in usage if needed in future
        }
        
        const chatResult: ChatResult = {
            data: {
                choices: result.choices.map((c: any) => {
                    // Extract thinking/reasoning content if present
                    let thinking: string | undefined = undefined;
                    let content = c.message.content;
                    
                    // For o1 models, OpenAI may include reasoning in a specific field or format
                    // Check if the message has any reasoning-related data
                    if (c.message.reasoning_content) {
                        thinking = c.message.reasoning_content;
                    } else if (c.message.reasoning) {
                        thinking = c.message.reasoning;
                    }
                    
                    // Some o1 models might include reasoning in the content with special markers
                    // Check for common reasoning patterns in the content itself
                    if (!thinking && content && typeof content === 'string') {
                        // Check for thinking tags similar to Anthropic's format
                        if (content.startsWith('<thinking>') && content.includes('</thinking>')) {
                            const thinkStart = content.indexOf('<thinking>') + '<thinking>'.length;
                            const thinkEnd = content.indexOf('</thinking>');
                            thinking = content.substring(thinkStart, thinkEnd).trim();
                            // Remove thinking content from main content
                            content = content.substring(thinkEnd + '</thinking>'.length).trim();
                        }
                    }
                    
                    return {
                        message: {
                            role: ChatMessageRole.assistant,
                            content: content,
                            thinking: thinking
                        },
                        finish_reason: c.finish_reason,
                        index: c.index,
                        logprobs: c.logprobs // Include logprobs if present
                    }
                }),
                usage: usage
            },
            success: !!result,
            statusText: 'success',
            startTime: startTime,
            endTime: endTime,
            timeElapsed: timeElapsed,
            errorMessage: null,
            exception: null
        } as ChatResult;
        
        // Add model-specific response details
        chatResult.modelSpecificResponseDetails = {
            provider: 'openai',
            model: result.model,
            systemFingerprint: result.system_fingerprint,
            created: result.created,
            id: result.id,
            object: result.object,
            service_tier: (result as any).service_tier,
            usage_details: {
                reasoning_tokens: extendedUsage.reasoning_tokens,
                cached_tokens: extendedUsage.cached_tokens,
                prompt_tokens_details: extendedUsage.prompt_tokens_details,
                completion_tokens_details: extendedUsage.completion_tokens_details
            }
        };
        
        return chatResult;
    }

    /**
     * Create a streaming request for OpenAI
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Reset streaming state for new request
        this.resetStreamingState();

        let messages = params.messages;

        // Handle reasoning for GPT-OSS models via system prompt
        if (params.effortLevel && this.supportsReasoningViaSystemPrompt(params.model)) {
            const reasoningLevel = this.getReasoningLevel(params.effortLevel);
            // Add or append to system message
            const systemMsg = messages.find(m => m.role === 'system');
            if (systemMsg) {
                // Append to existing system message
                systemMsg.content = `${systemMsg.content}\n\nReasoning: ${reasoningLevel}`;
            } else {
                // Prepend new system message
                messages = [
                    { role: 'system', content: `Reasoning: ${reasoningLevel}` },
                    ...messages
                ];
            }
        }

        const formattedMessages = this.ConvertMJToOpenAIChatMessages(messages);

        const openAIParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
            model: params.model,
            messages: formattedMessages,
            temperature: params.temperature,
            max_tokens: params.maxOutputTokens,
            stream: true,
            logprobs: params.includeLogProbs === true ? true : false,
            top_logprobs: params.includeLogProbs && params.topLogProbs ? params.topLogProbs : undefined,
        };

        if (params.effortLevel) {
            const reasoningLevel = this.getReasoningLevel(params.effortLevel);
            openAIParams.reasoning_effort = reasoningLevel;
        }

        // Add sampling and generation parameters
        if (params.topP != null) {
            openAIParams.top_p = params.topP;
        }
        if (params.frequencyPenalty != null) {
            openAIParams.frequency_penalty = params.frequencyPenalty;
        }
        if (params.presencePenalty != null) {
            openAIParams.presence_penalty = params.presencePenalty;
        }
        if (params.seed != null) {
            openAIParams.seed = params.seed;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            openAIParams.stop = params.stopSequences;
        }

        // OpenAI doesn't support topK or minP - warn if provided
        if (params.topK != null) {
            console.warn('OpenAI provider does not support topK parameter, ignoring');
        }
        if (params.minP != null) {
            console.warn('OpenAI provider does not support minP parameter, ignoring');
        }
        
        // Set response format if specified
        switch (params.responseFormat) {
            case 'JSON':
                openAIParams.response_format = { type: "json_object" };
                break;
            case 'ModelSpecific':
                openAIParams.response_format = params.modelSpecificResponseFormat;
                break;
        }
        
        return this.OpenAI.chat.completions.create(openAIParams);
    }
    
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
     * Process a streaming chunk from OpenAI
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        // Handle potential null/undefined values safely
        let content = '';
        const usage = chunk?.usage || null;
        
        // Check if chunk contains reasoning content (for o1 models)
        const delta = chunk?.choices?.[0]?.delta;
        if (delta) {
            // Check for reasoning fields specific to o1 models
            if (delta.reasoning_content) {
                this._streamingState.accumulatedThinking += delta.reasoning_content;
                // Don't emit reasoning as regular content
                return {
                    content: '',
                    finishReason: chunk?.choices?.[0]?.finish_reason,
                    usage: usage ? {
                        promptTokens: usage.prompt_tokens || 0,
                        completionTokens: usage.completion_tokens || 0,
                        totalTokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
                    } : null
                };
            } else if (delta.reasoning) {
                this._streamingState.accumulatedThinking += delta.reasoning;
                // Don't emit reasoning as regular content
                return {
                    content: '',
                    finishReason: chunk?.choices?.[0]?.finish_reason,
                    usage: usage ? {
                        promptTokens: usage.prompt_tokens || 0,
                        completionTokens: usage.completion_tokens || 0,
                        totalTokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
                    } : null
                };
            }
            
            // Process regular content
            const rawContent = delta.content || '';
            if (rawContent) {
                // Add raw content to pending content for processing
                this._streamingState.pendingContent += rawContent;
                
                // Process the pending content to extract thinking
                content = this.processThinkingInStreamingContent();
            }
        }
        
        return {
            content,
            finishReason: chunk?.choices?.[0]?.finish_reason,
            usage: usage ? {
                promptTokens: usage.prompt_tokens || 0,
                completionTokens: usage.completion_tokens || 0,
                totalTokens: (usage.prompt_tokens || 0) + (usage.completion_tokens || 0)
            } : null
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
            const endIndex = state.pendingContent.indexOf('</thinking>');
            
            if (endIndex !== -1) {
                // Found end of thinking block
                state.accumulatedThinking += state.pendingContent.substring(0, endIndex);
                state.inThinkingBlock = false;
                state.thinkingComplete = true;
                
                // Keep remaining content after </thinking> for output
                state.pendingContent = state.pendingContent.substring(endIndex + '</thinking>'.length);
                outputContent = state.pendingContent.trim();
                state.pendingContent = '';
            } else {
                // Still in thinking block, accumulate all content
                state.accumulatedThinking += state.pendingContent;
                state.pendingContent = '';
            }
        } else {
            // Not in thinking block, check if one is starting
            const startIndex = state.pendingContent.indexOf('<thinking>');
            
            if (startIndex !== -1) {
                // Found start of thinking block
                if (startIndex === 0) {
                    // Thinking starts at beginning
                    state.inThinkingBlock = true;
                    state.pendingContent = state.pendingContent.substring('<thinking>'.length);
                    
                    // Process again to check for end tag in same chunk
                    return this.processThinkingInStreamingContent();
                } else {
                    // There's content before thinking block - emit it first
                    outputContent = state.pendingContent.substring(0, startIndex);
                    state.pendingContent = state.pendingContent.substring(startIndex);
                    state.inThinkingBlock = true;
                    state.pendingContent = state.pendingContent.substring('<thinking>'.length);
                }
            } else {
                // No thinking block found
                // Check if we might be at the start of a partial tag
                if (state.pendingContent.endsWith('<') || 
                    state.pendingContent.endsWith('<t') ||
                    state.pendingContent.endsWith('<th') ||
                    state.pendingContent.endsWith('<thi') ||
                    state.pendingContent.endsWith('<thin') ||
                    state.pendingContent.endsWith('<think') ||
                    state.pendingContent.endsWith('<thinki') ||
                    state.pendingContent.endsWith('<thinkin')) {
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
     * Create the final response from streaming results for OpenAI
     */
    protected finalizeStreamingResponse(
        accumulatedContent: string | null | undefined,
        lastChunk: any | null | undefined,
        usage: any | null | undefined
    ): ChatResult {
        // Handle possible null/undefined values
        const content = accumulatedContent || '';
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
                    role: 'assistant',
                    content: content,
                    thinking: thinkingContent || undefined
                },
                finish_reason: lastChunk?.choices?.[0]?.finish_reason || 'stop',
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
        const messages = this.ConvertMJToOpenAIChatMessages(params.messages);


        const startTime = new Date();
        const result = await this.OpenAI.chat.completions.create({
            model: params.model,
            messages: messages
        });
        const endTime = new Date();

        const success = result && result.choices && result.choices.length > 0;
        let summaryText = null;
        if (success)
            summaryText = result.choices[0].message.content;

        return new SummarizeResult(GetUserMessageFromChatParams(params), summaryText, success, startTime, endTime);
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }

    public ConvertMJToOpenAIChatMessages(messages: ChatMessage[]): ChatCompletionMessageParam[] {
        return messages.map(m => {
            const role = this.ConvertMJToOpenAIRole(m.role);
            let content: unknown = m.content;
            
            // Process content if it's an array
            if (Array.isArray(content)) {
                // Filter out unsupported types and convert to OpenAI's expected format
                const contentParts = content
                    .map(c => {
                        // For text type
                        if (c.type === 'text') {
                            return {
                                type: 'text' as const,
                                text: c.content
                            };
                        } 
                        // For image_url type
                        else if (c.type === 'image_url') {
                            return {
                                type: 'image_url' as const,
                                image_url: { url: c.content }
                            };
                        }
                        // Warn about unsupported types
                        else {
                            console.warn(`Unsupported content type for OpenAI API: ${c.type}. This content will be skipped.`);
                            return null;
                        }
                    })
                    .filter(part => part !== null);
                
                content = contentParts;
            }
            
            // Create the appropriate message type based on role
            switch (role) {
                case 'system':
                    return { 
                        role: 'system' as const, 
                        content 
                    } as ChatCompletionSystemMessageParam;
                
                case 'user':
                    return { 
                        role: 'user' as const, 
                        content 
                    } as ChatCompletionUserMessageParam;
                
                case 'assistant':
                    return { 
                        role: 'assistant' as const, 
                        content 
                    } as ChatCompletionAssistantMessageParam;
                
                default:
                    throw new Error(`Unknown role ${m.role}`);
            }
        });
    }    


    /**
     * Utility method to map a MemberJunction role to OpenAI role
     *  - system maps to system
     *  - user maps to user
     *  - assistant maps to assistant
     *  - anything else throws an error
     * While the above is a direct 1:1 mapping, it is possible that OpenAI may have more roles in the future and this method will need to be updated for flexibility
     * @param role 
     * @returns 
     */
    public ConvertMJToOpenAIRole(role: string): 'system' | 'user' | 'assistant' {
        switch (role.trim().toLowerCase()) {
            case 'system':
                return 'system';
            case 'user':
                return 'user';
            case 'assistant':
                return 'assistant';
            default:
                throw new Error(`Unknown role ${role}`)
        }
    }
}