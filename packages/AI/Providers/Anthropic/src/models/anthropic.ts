import { Anthropic } from "@anthropic-ai/sdk";
import { MessageCreateParams, MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { BaseLLM, ChatMessage, ChatMessageRole, ChatMessageContent, ChatMessageContentBlock, ChatParams, ChatResult, ClassifyParams, ClassifyResult,
    GetSystemPromptFromChatParams, GetUserMessageFromChatParams, SummarizeParams,
    SummarizeResult, ModelUsage, ErrorAnalyzer, parseBase64DataUrl, FileCapabilities } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";

/**
 * Sentinel a prompt can embed to tell the Anthropic adapter WHERE the stable, cacheable prefix ends
 * and the volatile (per-turn) content begins. The adapter places an Anthropic `cache_control`
 * breakpoint at each marker (caching everything before it) and removes the marker from the text the
 * model sees. Without a marker the whole block is cached as before.
 *
 * Why it's needed: Anthropic only caches up to an explicit breakpoint and read-hits require the new
 * request to match a cached prefix AT a breakpoint. If volatile content (date/scratchpad/payload)
 * sits at the end of the system prompt and the only breakpoint is at the very end, the cached
 * segment includes the volatile bytes, so every turn misses and rewrites. Putting the marker between
 * the stable instructions and the volatile tail makes the stable prefix a reusable cache segment.
 *
 * Providers that cache the longest common prefix automatically (OpenAI, Gemini) don't need this;
 * they should strip the marker from outgoing content.
 */
export const ANTHROPIC_CACHE_BREAKPOINT = '<<<MJ_CACHE_BREAKPOINT>>>';

/** Anthropic allows at most 4 cache_control breakpoints per request. */
const MAX_CACHE_BREAKPOINTS = 4;

/** A minimal Anthropic text content block, optionally carrying an ephemeral cache breakpoint. */
type AnthropicTextBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } };

@RegisterClass(BaseLLM, 'AnthropicLLM')
export class AnthropicLLM extends BaseLLM {
    private _anthropic: Anthropic;
    
    // State tracking for streaming thinking extraction
    private _streamingState: {
        accumulatedThinking: string;
        inThinkingBlock: boolean;
        pendingContent: string;
        thinkingComplete: boolean;
        // Token usage accumulated across stream events. Anthropic reports input + cache tokens on
        // the `message_start` event and the (cumulative) output token count on `message_delta`, so
        // we accumulate here rather than relying on any single chunk carrying the full picture.
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
    } = {
        accumulatedThinking: '',
        inThinkingBlock: false,
        pendingContent: '',
        thinkingComplete: false,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0
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
     * Anthropic natively supports assistant prefill
     */
    public override get SupportsPrefill(): boolean {
        return true;
    }

    /**
     * Anthropic supports PDF and image file inputs natively.
     */
    public override GetFileCapabilities(): FileCapabilities | null {
        return {
            SupportedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            MaxFileSize: 32 * 1024 * 1024,
            MaxFilesPerRequest: 5,
            HasFileAPI: false,
        };
    }

    /**
     * Format message content for Anthropic API with optional caching.
     * Supports both text and image content blocks.
     * @param content The message content (string or content blocks)
     * @param enableCaching Whether to enable caching
     * @returns Array of formatted content blocks for Anthropic API
     */
    /**
     * Turn a text string into one or more Anthropic text blocks, honoring any
     * {@link ANTHROPIC_CACHE_BREAKPOINT} markers it contains.
     *
     * - No marker: a single text block, with `cache_control` iff `cacheLastSegment` is true
     *   (preserves the historical "cache the whole block" behavior).
     * - With marker(s): split on the marker into segments. Every segment BEFORE a marker gets a
     *   `cache_control` breakpoint (so the stable prefix is cached); the final segment is left
     *   uncached unless `cacheLastSegment` is true. The marker text itself is removed. Breakpoints
     *   are capped at {@link MAX_CACHE_BREAKPOINTS}.
     */
    private pushTextBlocks(out: AnthropicTextBlock[], text: string, enableCaching: boolean, cacheLastSegment: boolean): void {
        if (!text.includes(ANTHROPIC_CACHE_BREAKPOINT)) {
            const block: AnthropicTextBlock = { type: "text", text };
            if (enableCaching && cacheLastSegment) {
                block.cache_control = { type: "ephemeral" };
            }
            out.push(block);
            return;
        }

        // A marker explicitly defines the cacheable boundary: everything before each marker is the
        // stable prefix (gets a breakpoint), everything after the LAST marker is volatile and is
        // never cached — regardless of `cacheLastSegment`. (cacheLastSegment only governs the
        // no-marker case above.)
        const segments = text.split(ANTHROPIC_CACHE_BREAKPOINT);
        let breakpointsUsed = 0;
        for (let i = 0; i < segments.length; i++) {
            const isFinalSegment = i === segments.length - 1;
            const block: AnthropicTextBlock = { type: "text", text: segments[i] };
            if (enableCaching && !isFinalSegment && breakpointsUsed < MAX_CACHE_BREAKPOINTS) {
                block.cache_control = { type: "ephemeral" };
                breakpointsUsed++;
            }
            out.push(block);
        }
    }

    private formatContentWithCaching(content: ChatMessageContent, enableCaching: boolean = true): any[] {
        const formattedBlocks: any[] = [];

        if (typeof content === 'string') {
            // Simple string content - wrap in text block(s), honoring cache-breakpoint markers.
            this.pushTextBlocks(formattedBlocks, content, enableCaching, true);
        } else if (Array.isArray(content)) {
            // Process array of content blocks
            for (let i = 0; i < content.length; i++) {
                const block = content[i];
                const isLastBlock = i === content.length - 1;

                if (block.type === 'text') {
                    // Apply caching only to the last block (markers within the text add their own).
                    this.pushTextBlocks(formattedBlocks, block.content, enableCaching, isLastBlock);
                } else if (block.type === 'image_url') {
                    // Convert to Anthropic's image format
                    const imageBlock = this.formatImageBlock(block);
                    if (imageBlock) {
                        formattedBlocks.push(imageBlock);
                    }
                } else if (block.type === 'file_url') {
                    // Convert to Anthropic's document format
                    const docBlock = this.formatDocumentBlock(block);
                    if (docBlock) {
                        formattedBlocks.push(docBlock);
                    }
                }
                // Note: video_url, audio_url not yet supported by Anthropic
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
     * Format a file content block as an Anthropic document block.
     * Anthropic supports documents in the format:
     * { type: "document", source: { type: "base64", media_type: "application/pdf", data: "..." } }
     *
     * Supported MIME types: application/pdf, text/plain, text/csv, text/html,
     * application/vnd.openxmlformats-officedocument.wordprocessingml.document (docx),
     * application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (xlsx)
     */
    private formatDocumentBlock(block: ChatMessageContentBlock): any | null {
        const content = block.content;

        // Determine the MIME type
        const mimeType = block.mimeType || this.inferDocumentMimeType(block.fileName) || 'application/octet-stream';

        // Check if it's a data URL (data:application/pdf;base64,...)
        const parsed = parseBase64DataUrl(content);
        if (parsed) {
            return {
                type: "document",
                source: {
                    type: "base64",
                    media_type: parsed.mediaType,
                    data: parsed.data
                }
            };
        }

        // Raw base64 with mimeType — but guard against placeholder text that
        // isn't actually base64 (e.g. "[File: ... — accessible via artifact tools]")
        if (mimeType && !content.startsWith('http') && /^[A-Za-z0-9+/\r\n]+=*$/.test(content.substring(0, 100))) {
            return {
                type: "document",
                source: {
                    type: "base64",
                    media_type: mimeType,
                    data: content
                }
            };
        }

        // URL-based documents
        if (content.startsWith('http://') || content.startsWith('https://')) {
            return {
                type: "document",
                source: {
                    type: "url",
                    url: content
                }
            };
        }

        console.warn(`Document content block has unknown format (mime: ${mimeType}), skipping`);
        return null;
    }

    /** Infer MIME type from file extension when mimeType is not provided */
    private inferDocumentMimeType(fileName?: string): string | null {
        if (!fileName) return null;
        const ext = fileName.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'pdf': return 'application/pdf';
            case 'csv': return 'text/csv';
            case 'txt': return 'text/plain';
            case 'html': case 'htm': return 'text/html';
            case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            default: return null;
        }
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
     * Appends an assistant prefill message to the messages array if prefill text is provided.
     * This causes the model to continue generating from where the prefill ends.
     * @param messages The original messages array
     * @param prefill The prefill text, or undefined to skip
     * @returns A new messages array with the prefill appended, or the original if no prefill
     */
    private appendPrefillMessage(messages: ChatMessage[], prefill: string | undefined): ChatMessage[] {
        if (!prefill) {
            return messages;
        }
        return [
            ...messages,
            { role: ChatMessageRole.assistant, content: prefill }
        ];
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

            // Append assistant prefill message if specified
            const messagesForApi = this.appendPrefillMessage(nonSystemMsgs, params.assistantPrefill);

            // Create the request parameters
            const createParams: MessageCreateParams = {
                model: params.model,
                max_tokens: maxTokens,
                stream: true, // even for non-streaming, we set stream to true as Anthropic prefers it for any decent sized response
                messages: this.formatMessagesWithCaching(messagesForApi, params.enableCaching || true)
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
            
            // Create ModelUsage with prompt-cache token breakdown.
            // Anthropic's usage convention: `input_tokens` ALREADY EXCLUDES cached tokens, which are
            // reported separately as `cache_read_input_tokens` (cache hits) and
            // `cache_creation_input_tokens` (cache writes). So we map straight through with no
            // subtraction — promptTokens stays "uncached input only", cache buckets are disjoint.
            // (The previous code read a non-existent `cached_tokens` field, so cache usage was never
            // captured.)
            const cacheReadTokens = result.usage.cache_read_input_tokens ?? 0;
            const cacheWriteTokens = result.usage.cache_creation_input_tokens ?? 0;
            const usage = new ModelUsage(result.usage.input_tokens, result.usage.output_tokens);
            usage.cacheReadTokens = cacheReadTokens;
            usage.cacheWriteTokens = cacheWriteTokens;

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
            
            // Surface cache hit info (cacheHit is driven by cache READ tokens, not writes —
            // a write-only first turn is not a "hit").
            chatResult.cacheInfo = {
                cacheHit: cacheReadTokens > 0,
                cachedTokenCount: cacheReadTokens
            };

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
                    cache_read_input_tokens: cacheReadTokens,
                    cache_creation_input_tokens: cacheWriteTokens,
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
     * Reset streaming state for a new request. Overrides the base-class hook so
     * `BaseLLM.handleStreamingChatCompletion` calls this both at the start of a
     * request AND in its `finally` block — the latter releases accumulated
     * thinking buffers (which can grow to 100k+ chars on extended-thinking
     * outputs) and prevents state from a prior request bleeding into the next.
     * See audit R2-C5.
     */
    protected resetStreamingState(): void {
        this._streamingState = {
            accumulatedThinking: '',
            inThinkingBlock: false,
            pendingContent: '',
            thinkingComplete: false,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0
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
        
        // Append assistant prefill message if specified, then add messages with caching applied
        const messagesForApi = this.appendPrefillMessage(nonSystemMsgs, params.assistantPrefill);
        createParams.messages = this.formatMessagesWithCaching(
            messagesForApi,
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

        // Capture token usage from stream events. `message_start` carries input + cache token
        // counts; `message_delta` carries the cumulative output token count. We accumulate into
        // streaming state so the final result reflects the full breakdown regardless of which
        // chunk was last. (cache_read/cache_creation are disjoint from input_tokens, matching the
        // non-streaming path and the ModelUsage normalization contract.)
        if (chunk && chunk.type === 'message_start' && chunk.message?.usage) {
            const u = chunk.message.usage;
            this._streamingState.inputTokens = u.input_tokens ?? 0;
            this._streamingState.outputTokens = u.output_tokens ?? 0;
            this._streamingState.cacheReadTokens = u.cache_read_input_tokens ?? 0;
            this._streamingState.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
        }
        if (chunk && chunk.type === 'message_delta' && chunk.usage?.output_tokens != null) {
            this._streamingState.outputTokens = chunk.usage.output_tokens;
        }

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
        // Handle possible null/undefined values. Token usage is read from streaming state, which
        // accumulated input/output/cache counts across the message_start + message_delta events
        // (the `usage` param from the base loop only reflects the last chunk that carried usage and
        // is unreliable for the full breakdown).
        const content = accumulatedContent || '';
        const promptTokens = this._streamingState.inputTokens;
        const completionTokens = this._streamingState.outputTokens;
        const cacheReadTokens = this._streamingState.cacheReadTokens;
        const cacheWriteTokens = this._streamingState.cacheWriteTokens;

        // Create dates (will be overridden by base class)
        const now = new Date();

        // Create a proper ChatResult instance with constructor params
        const result = new ChatResult(true, now, now);

        // Get thinking content from streaming state
        const thinkingContent = this._streamingState.accumulatedThinking.trim();

        // promptTokens stays "uncached input only"; cache buckets are disjoint (see ModelUsage).
        const modelUsage = new ModelUsage(promptTokens, completionTokens);
        modelUsage.cacheReadTokens = cacheReadTokens;
        modelUsage.cacheWriteTokens = cacheWriteTokens;

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
            usage: modelUsage
        };

        result.statusText = 'success';
        result.errorMessage = null;
        result.exception = null;

        // Cache hit is driven by cache READ tokens (a write-only first turn is not a hit).
        result.cacheInfo = {
            cacheHit: cacheReadTokens > 0,
            cachedTokenCount: cacheReadTokens
        };
        
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