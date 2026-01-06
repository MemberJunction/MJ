import { Anthropic } from "@anthropic-ai/sdk";
import { MessageCreateParams, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { BaseLLM, ChatMessage, ChatMessageRole, ChatMessageContent, ChatMessageContentBlock, ChatParams, ChatResult, ClassifyParams, ClassifyResult,
    GetSystemPromptFromChatParams, GetUserMessageFromChatParams, SummarizeParams,
    SummarizeResult, ModelUsage, ErrorAnalyzer, parseBase64DataUrl } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";

@RegisterClass(BaseLLM, 'AnthropicLLM')
export class AnthropicLLM extends BaseLLM {
    private _anthropic: Anthropic;
    
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
        this._anthropic = new Anthropic({apiKey});
    }

    /**
     * Read only getter method to get the Anthropic client instance
     */
    public get AnthropicClient(): Anthropic {
        return this._anthropic;
    }
    
    /**
     * Anthropic supports streaming
     */
    public override get SupportsStreaming(): boolean {
        return true;
    }

    /**
     * Format message content for Anthropic API with optional caching.
     * Supports both text and image content blocks.
     * @param content The message content (string or content blocks)
     * @param enableCaching Whether to enable caching
     * @returns Array of formatted content blocks for Anthropic API
     */
    private formatContentWithCaching(content: ChatMessageContent, enableCaching: boolean = true): any[] {
        const formattedBlocks: any[] = [];

        if (typeof content === 'string') {
            // Simple string content - wrap in text block
            const textBlock: any = {
                type: "text",
                text: content
            };
            if (enableCaching) {
                textBlock.cache_control = { type: "ephemeral" };
            }
            formattedBlocks.push(textBlock);
        } else if (Array.isArray(content)) {
            // Process array of content blocks
            for (let i = 0; i < content.length; i++) {
                const block = content[i];
                const isLastBlock = i === content.length - 1;

                if (block.type === 'text') {
                    const textBlock: any = {
                        type: "text",
                        text: block.content
                    };
                    // Apply caching only to the last block
                    if (enableCaching && isLastBlock) {
                        textBlock.cache_control = { type: "ephemeral" };
                    }
                    formattedBlocks.push(textBlock);
                } else if (block.type === 'image_url') {
                    // Convert to Anthropic's image format
                    const imageBlock = this.formatImageBlock(block);
                    if (imageBlock) {
                        formattedBlocks.push(imageBlock);
                    }
                }
                // Other types (video_url, audio_url, file_url) are not yet supported by Anthropic
            }
        } else {
            // Fallback for any other type
            const textBlock: any = {
                type: "text",
                text: String(content)
            };
            if (enableCaching) {
                textBlock.cache_control = { type: "ephemeral" };
            }
            formattedBlocks.push(textBlock);
        }

        return formattedBlocks;
    }

    /**
     * Format an image content block for Anthropic's API.
     * Anthropic expects images in the format:
     * { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } }
     * @param block The image content block
     * @returns Formatted image block for Anthropic, or null if invalid
     */
    private formatImageBlock(block: ChatMessageContentBlock): any | null {
        const content = block.content;

        // Check if it's a data URL (data:image/png;base64,...)
        const parsed = parseBase64DataUrl(content);
        if (parsed) {
            return {
                type: "image",
                source: {
                    type: "base64",
                    media_type: parsed.mediaType,
                    data: parsed.data
                }
            };
        }

        // Check if it's raw base64 with mimeType provided
        if (block.mimeType && !content.startsWith('http')) {
            return {
                type: "image",
                source: {
                    type: "base64",
                    media_type: block.mimeType,
                    data: content
                }
            };
        }

        // Check if it's a URL
        if (content.startsWith('http://') || content.startsWith('https://')) {
            return {
                type: "image",
                source: {
                    type: "url",
                    url: content
                }
            };
        }

        // If we can't determine the format, try to use it as base64 with a default type
        console.warn('Image content block has unknown format, attempting to use as base64 JPEG');
        return {
            type: "image",
            source: {
                type: "base64",
                media_type: "image/jpeg",
                data: content
            }
        };
    }

    /**
     * Format messages for Anthropic API with caching support.
     * Handles both text and multi-modal content (images).
     * @param messages Messages to format
     * @param enableCaching Whether to enable caching
     * @returns Formatted messages
     */
    protected formatMessagesWithCaching(messages: ChatMessage[], enableCaching: boolean = true): any[] {
        const result: any[] = [];
        let lastRole = "assistant";

        for (let i = 0; i < messages.length; i++) {
            // If we have two messages with the same role back-to-back, insert an assistant message
            if (messages[i].role === lastRole) {
                result.push({
                    role: "assistant",
                    content: [{ type: "text", text: "OK" }]
                });
            }

            // Apply caching only to the last message
            const isLastMessage = i === (messages.length - 1);

            // Format the content - now returns an array of content blocks
            const contentBlocks = this.formatContentWithCaching(
                messages[i].content,
                enableCaching && isLastMessage
            );

            const formattedMsg: any = {
                role: this.ConvertMJToAnthropicRole(messages[i].role),
                content: contentBlocks
            };

            result.push(formattedMsg);
            lastRole = messages[i].role;
        }

        return result;
    }


    /**
     * Format system messages for Anthropic API with caching support.
     * System messages support multi-modal content (images).
     * @param messages Messages to format
     * @param enableCaching Whether to enable caching
     * @returns Flattened array of formatted content blocks
     */
    protected formatSystemMessagesWithCaching(messages: ChatMessage[], enableCaching: boolean = true): any[] {
        const result: any[] = [];

        for (let i = 0; i < messages.length; i++) {
            // Apply caching only to the last message
            const isLastMessage = i === (messages.length - 1);

            // Format the content - returns an array of content blocks
            const contentBlocks = this.formatContentWithCaching(
                messages[i].content,
                enableCaching && isLastMessage
            );

            // Spread the content blocks into the result array
            result.push(...contentBlocks);
        }

        return result;
    }

     
    /**
     * Utility method to map a MemberJunction role to OpenAI role
     *  - user maps to user
     *  - assistant maps to assistant
     *  - anything else maps to user
     * While the above is a direct 1:1 mapping, it is possible that OpenAI may have more roles in the future and this method will need to be updated for flexibility
     * @param role 
     * @returns 
     */
    public ConvertMJToAnthropicRole(role: ChatMessageRole): 'assistant' | 'user' { 
        switch (role) {
            case 'assistant':
                return 'assistant';
            default:
                return 'user'; // default is user
        }
    }

    /**
     * Non-streaming implementation for Anthropic
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        let result: any = null;
        try {
            // Find system message and non-system messages
            const systemMsgs = params.messages.filter(m => m.role === "system");
            const nonSystemMsgs = params.messages.filter(m => m.role !== "system");
            
            // Determine max_tokens and thinking budget
            // When thinking is enabled, max_tokens must be greater than budget_tokens
            let maxTokens = params.maxOutputTokens || 32000;
            let thinkingBudget: number | undefined = undefined;

            if (params.effortLevel && (params.reasoningBudgetTokens >= 1 || params.reasoningBudgetTokens === undefined || params.reasoningBudgetTokens === null)) {
                thinkingBudget = params.reasoningBudgetTokens || 31000;
                // Ensure max_tokens is greater than budget_tokens
                if (maxTokens <= thinkingBudget) {
                    maxTokens = thinkingBudget + 1000; // Add buffer to ensure max_tokens > budget_tokens
                }
            }

            // Create the request parameters
            const createParams: MessageCreateParams = {
                model: params.model,
                max_tokens: maxTokens,
                stream: true, // even for non-streaming, we set stream to true as Anthropic prefers it for any decent sized response
                messages: this.formatMessagesWithCaching(nonSystemMsgs, params.enableCaching || true)
            };

            // Add temperature if specified. Note that Claude 4.5 Opus doesn't support temperature changes when extended thinking is enabled.
            // Skip the temperature set in that case.
            if (params.temperature != null) {
                //2025-11-25: With thinking enabled on Claude 4.5 Opus, temperature must be 1.
                if (!(params.model.toLowerCase().startsWith('claude-opus-4-5') && thinkingBudget !== undefined)) {
                    createParams.temperature = params.temperature;
                }
            }

            // Add supported parameters.

            if (params.topP != null) {
                createParams.top_p = params.topP;
            }
            if (params.topK != null) {
                createParams.top_k = params.topK;
            }
            if (params.stopSequences != null && params.stopSequences.length > 0) {
                createParams.stop_sequences = params.stopSequences;
            }

            // Anthropic doesn't support these parameters - warn if provided
            if (params.frequencyPenalty != null) {
                console.warn('Anthropic provider does not support frequencyPenalty parameter, ignoring');
            }
            if (params.presencePenalty != null) {
                console.warn('Anthropic provider does not support presencePenalty parameter, ignoring');
            }
            if (params.minP != null) {
                console.warn('Anthropic provider does not support minP parameter, ignoring');
            }
            if (params.seed != null) {
                console.warn('Anthropic provider does not support seed parameter, ignoring');
            }

            // Add system message(s), if present
            if (systemMsgs) {
                createParams.system = this.formatSystemMessagesWithCaching(
                    systemMsgs,
                    params.enableCaching || true
                );
            }

            // Add thinking parameter if effort level is set
            if (thinkingBudget !== undefined) {
                createParams.thinking = {
                    type: "enabled" as const,
                    budget_tokens: thinkingBudget
                };
            }
            
            const stream = this.AnthropicClient.messages.stream(createParams).on('text', (chunk: any) => {
                // too noisy to log this -- console.log('stream chunk', chunk);
            });;
            result = await stream.finalMessage();
            const endTime = new Date();
            
            // Extract thinking and text content from response
            let content: string = '';
            let thinkingContent: string | undefined = undefined;

            // Process content blocks - can contain both thinking and text blocks
            for (const block of result.content) {
                if (block.type === 'thinking') {
                    thinkingContent = block.thinking;
                } else if (block.type === 'text') {
                    content += block.text;
                }
            }

            // Fallback: check for old-style thinking tags in content (for backward compatibility)
            if (!thinkingContent && content.startsWith('<thinking>') && content.includes('</thinking>')) {
                const thinkStart = content.indexOf('<thinking>') + '<thinking>'.length;
                const thinkEnd = content.indexOf('</thinking>');
                thinkingContent = content.substring(thinkStart, thinkEnd).trim();
                content = content.substring(0, content.indexOf('<thinking>')) +
                         content.substring(thinkEnd + '</thinking>'.length);
                content = content.trim();
            }
            
            // Create ModelUsage with cost information if available
            const usage = new ModelUsage(result.usage.input_tokens, result.usage.output_tokens);
            
            const chatResult: ChatResult = {
                data: {
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: content,
                                thinking: thinkingContent
                            },
                            finish_reason: "completed",
                            index: 0
                        }
                    ],
                    usage: usage
                },
                success: true,
                statusText: 'success',
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                errorMessage: '',
                exception: ''
            };
            
            // Add cache metadata if available
            if (result.usage.cached_tokens !== undefined) {
                chatResult.cacheInfo = {
                    cacheHit: result.usage.cached_tokens > 0,
                    cachedTokenCount: result.usage.cached_tokens
                };
            }
            
            // Add model-specific response details
            chatResult.modelSpecificResponseDetails = {
                provider: 'anthropic',
                model: result.model,
                id: result.id,
                type: result.type,
                role: result.role,
                stopReason: result.stop_reason,
                stopSequence: result.stop_sequence,
                usage: {
                    cached_tokens: result.usage.cached_tokens,
                    thinking_tokens: result.thinking_usage?.output_tokens,
                    thinking_budget_tokens: result.thinking_usage?.budget_tokens
                }
            };
            
            return chatResult;   
        }
        catch (e) {
            const endTime = new Date();
            return {
                data: {
                    choices: [],
                    usage: new ModelUsage(0, 0)
                },
                success: false,
                statusText: 'error',
                startTime: startTime,
                endTime: endTime,
                timeElapsed: endTime.getTime() - startTime.getTime(),
                errorMessage: e?.message,
                exception: {exception: e, llmResult: result},
                errorInfo: ErrorAnalyzer.analyzeError(e, 'Anthropic')
            };
        }
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
     * Create a streaming request for Anthropic
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Reset streaming state for new request
        this.resetStreamingState();
        // Find system message and non-system messages
        const systemMsg = params.messages.find(m => m.role === "system");
        const nonSystemMsgs = params.messages.filter(m => m.role !== "system");
        
        // Create the request parameters
        const createParams: any = {
            model: params.model,
            max_tokens: params.maxOutputTokens,
            stream: true as const
        };

        // Add temperature if specified
        if (params.temperature != null) {
            createParams.temperature = params.temperature;
        }

        // Add supported parameters
        if (params.topP != null) {
            createParams.top_p = params.topP;
        }
        if (params.topK != null) {
            createParams.top_k = params.topK;
        }
        if (params.stopSequences != null && params.stopSequences.length > 0) {
            createParams.stop_sequences = params.stopSequences;
        }

        // Log warnings for unsupported parameters (same as non-streaming)
        if (params.frequencyPenalty != null) {
            console.warn('Anthropic provider does not support frequencyPenalty parameter, ignoring');
        }
        if (params.presencePenalty != null) {
            console.warn('Anthropic provider does not support presencePenalty parameter, ignoring');
        }
        if (params.minP != null) {
            console.warn('Anthropic provider does not support minP parameter, ignoring');
        }
        if (params.seed != null) {
            console.warn('Anthropic provider does not support seed parameter, ignoring');
        }
        
        // Add system with caching if present
        if (systemMsg) {
            createParams.system = this.formatContentWithCaching(
                systemMsg.content, 
                params.enableCaching
            );
        }
        
        // Add messages with caching applied
        createParams.messages = this.formatMessagesWithCaching(
            nonSystemMsgs, 
            params.enableCaching
        );
        
        // Add thinking parameter if effort level is set
        // Note: Requires minimum 1024 tokens and must be less than max_tokens
        if (params.effortLevel && params.reasoningBudgetTokens >= 1024) {
            createParams.thinking = {
                type: "enabled" as const,
                budget_tokens: params.reasoningBudgetTokens
            };
        }
        
        return this.AnthropicClient.messages.create(createParams);
    }
    
    /**
     * Process a streaming chunk from Anthropic
     */
    protected processStreamingChunk(chunk: any): {
        content: string;
        finishReason?: string;
        usage?: any;
    } {
        let content = '';
        let finishReason = undefined;
        
        // Check for thinking_delta event (Anthropic specific)
        if (chunk && chunk.type === 'thinking_delta' && chunk.delta && 'text' in chunk.delta) {
            // Directly accumulate thinking content
            this._streamingState.accumulatedThinking += chunk.delta.text || '';
            // Don't emit any content for thinking deltas
            return {
                content: '',
                finishReason: undefined,
                usage: null
            };
        }
        
        // Process regular content deltas
        if (chunk && chunk.type === 'content_block_delta' && chunk.delta && 'text' in chunk.delta) {
            const rawContent = chunk.delta.text || '';
            
            // Add raw content to pending content for processing
            this._streamingState.pendingContent += rawContent;
            
            // Process the pending content to extract thinking
            content = this.processThinkingInStreamingContent();
        }
        
        // Check for message stop
        if (chunk && chunk.type === 'message_stop') {
            finishReason = 'stop';
        }
        
        // Anthropic doesn't provide usage info in the stream
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
     * Create the final response from streaming results for Anthropic
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
                finish_reason: 'stop',
                index: 0
            }],
            usage: new ModelUsage(promptTokens, completionTokens)
        };
        
        result.statusText = 'success';
        result.errorMessage = null;
        result.exception = null;
        
        // Add cache info if available
        if (usage?.cached_tokens !== undefined || lastChunk?.usage?.cached_tokens !== undefined) {
            const cachedTokens = usage?.cached_tokens || lastChunk?.usage?.cached_tokens || 0;
            result.cacheInfo = {
                cacheHit: cachedTokens > 0,
                cachedTokenCount: cachedTokens
            };
        }
        
        return result;
    }
 
    public async SummarizeText(params: SummarizeParams): Promise<SummarizeResult> {
        // Define constants here since they are no longer exported from the SDK
        const HUMAN_PROMPT = "\n\nHuman: ";
        const AI_PROMPT = "\n\nAssistant: ";
        
        const sPrompt: string = `${HUMAN_PROMPT} the following is a SYSTEM prompt that is important to comply with at all times 
${GetSystemPromptFromChatParams(params)}
${AI_PROMPT} OK
${HUMAN_PROMPT} the following is the user message to process
${GetUserMessageFromChatParams(params)}`
        
        const startTime = new Date();            
        const sample = await this.AnthropicClient.completions 
        .create({
          prompt: sPrompt,
          stop_sequences: [HUMAN_PROMPT],
          max_tokens_to_sample: 2000,
          temperature: params.temperature,
          model: params.model ? params.model : "claude-2.1",
        })        
        const endTime = new Date();

        const success: boolean = sample && sample.completion?.length > 0;
        let summaryText = null;
        if (success)
            summaryText = sample.completion;

        return new SummarizeResult(GetUserMessageFromChatParams(params), summaryText, success, startTime, endTime);
    }

    public async ClassifyText(params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error("Method not implemented.");
    }
}

export function LoadAnthropicLLM() {
    // this does nothing but prevents the class from being removed by the tree shaker
}