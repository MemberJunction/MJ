import { Anthropic, APIUserAbortError } from "@anthropic-ai/sdk";
import { ContentBlock, MessageCreateParams, MessageParam, Tool, ToolChoice } from "@anthropic-ai/sdk/resources/messages";
import { BaseLLM, ChatMessage, ChatMessageRole, ChatMessageContent, ChatMessageContentBlock, ChatParams, ChatResult, ClassifyParams, ClassifyResult,
    GetSystemPromptFromChatParams, GetUserMessageFromChatParams, SummarizeParams,
    SummarizeResult, ModelUsage, ErrorAnalyzer, parseBase64DataUrl, FileCapabilities,
    ChatToolCall, CHAT_FINISH_REASON_TOOL_CALLS } from "@memberjunction/ai";
import { RegisterClass, ToJSONSafe } from "@memberjunction/global";
import { BuildAnthropicThinking, UsesAdaptiveThinking } from "./thinking-config";

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
        // Cancellation token for the in-flight streaming request. The Anthropic SDK's raw `Stream`
        // exits *silently* when its underlying request is aborted (it swallows the AbortError rather
        // than throwing), so the base-class chunk loop simply ends. We keep the signal here so
        // finalizeStreamingResponse() can tell "the model finished" from "we cancelled it" and
        // report a failed/cancelled result instead of a truncated success.
        cancellationToken?: AbortSignal;
    } = {
        accumulatedThinking: '',
        inThinkingBlock: false,
        pendingContent: '',
        thinkingComplete: false,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        cancellationToken: undefined
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
     * Anthropic natively supports tool calling (`tool_use` / `tool_result` content blocks).
     */
    public override get SupportsTools(): boolean {
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
                } else if (block.type === 'tool_result') {
                    // Anthropic carries tool results as `tool_result` blocks inside a USER turn,
                    // paired to the originating call by `tool_use_id`. Never cache-marked: results
                    // are the volatile tail of the conversation by definition.
                    formattedBlocks.push({
                        type: 'tool_result',
                        tool_use_id: block.toolCallId,
                        content: block.content,
                        ...(block.isError ? { is_error: true } : {})
                    });
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
    /**
     * Checks if a message represents a trailing volatile runtime-state or agent-specialization fragment.
     */
    protected isTrailingStateFragment(message?: ChatMessage): boolean {
        if (!message) {
            return false;
        }
        if ((message as any).metadata?.volatileState === true) {
            return true;
        }
        if (typeof message.content === 'string') {
            return /^<mj-(runtime-state|agent-specialization)>/.test(message.content.trimStart());
        }
        return false;
    }

    /**
     * Format messages for Anthropic API with caching support
     * @param messages Messages to format
     * @param enableCaching Whether to enable caching
     * @returns Formatted messages
     */
    protected formatMessagesWithCaching(messages: ChatMessage[], enableCaching: boolean = true): any[] {
        // When the final message is a trailing runtime state fragment, place the ephemeral
        // cache breakpoint on the last real history message instead, so the next iteration's
        // prefix still ends at a cached boundary.
        if (enableCaching && messages.length >= 2 && this.isTrailingStateFragment(messages[messages.length - 1])) {
            const head = this.formatMessagesWithCaching(messages.slice(0, -1), true);
            const tail = this.formatMessagesWithCaching(messages.slice(-1), false);
            if (head[head.length - 1]?.role === 'user' && tail[0]?.role === 'user') {
                head.push({
                    role: 'assistant',
                    content: [{ type: 'text', text: 'OK' }]
                });
            }
            return [...head, ...tail];
        }

        const result: any[] = [];
        // Compare ANTHROPIC roles, not MJ roles: `tool` and `user` both become `user` here, and it
        // is the wire role that has to alternate. For conversations without tool turns the two are
        // identical (user->user, assistant->assistant), so this is unchanged behavior.
        let lastRole: 'assistant' | 'user' = 'assistant';

        const coalesced = this.coalesceToolMessages(messages);

        for (let i = 0; i < coalesced.length; i++) {
            const role = this.ConvertMJToAnthropicRole(coalesced[i].role);

            // If we have two messages with the same role back-to-back, insert an assistant message
            if (role === lastRole) {
                result.push({
                    role: "assistant",
                    content: [{ type: "text", text: "OK" }]
                });
            }

            // Apply caching only to the last message
            const isLastMessage = i === (coalesced.length - 1);

            // Format the content - now returns an array of content blocks
            const contentBlocks = this.formatContentWithCaching(
                coalesced[i].content,
                enableCaching && isLastMessage
            );

            // An assistant turn that called tools must replay those calls as `tool_use` blocks, or
            // Anthropic rejects the `tool_result` blocks that answer them as orphaned.
            for (const call of coalesced[i].toolCalls ?? []) {
                contentBlocks.push({
                    type: 'tool_use',
                    id: call.id,
                    name: call.name,
                    input: call.arguments ?? {}
                });
            }

            const formattedMsg: any = {
                role,
                // Anthropic rejects empty text blocks. A tool-call turn commonly has no prose at
                // all, so drop empty text once something else is carrying the turn.
                content: contentBlocks.length > 1
                    ? contentBlocks.filter(b => b.type !== 'text' || (b.text ?? '').length > 0)
                    : contentBlocks
            };

            result.push(formattedMsg);
            lastRole = role;
        }

        return result;
    }

    /**
     * Merges runs of consecutive `tool` messages into one.
     *
     * Anthropic requires EVERY `tool_result` answering a given assistant turn to travel in the
     * single user turn immediately after it. Left as separate messages they would be split across
     * turns — and the alternation filler above would push an assistant "OK" between them, orphaning
     * every result after the first.
     *
     * @param messages The caller's messages
     * @returns The same messages with consecutive tool turns merged; the input is not mutated
     */
    private coalesceToolMessages(messages: ChatMessage[]): ChatMessage[] {
        if (!messages.some(m => m.role === ChatMessageRole.tool)) {
            return messages;
        }

        const out: ChatMessage[] = [];
        for (const message of messages) {
            const previous = out[out.length - 1];
            if (message.role === ChatMessageRole.tool && previous?.role === ChatMessageRole.tool) {
                out[out.length - 1] = {
                    ...previous,
                    content: [...this.asContentBlocks(previous.content), ...this.asContentBlocks(message.content)]
                };
            } else {
                out.push(message);
            }
        }
        return out;
    }

    /** Normalizes message content to a block array so two tool turns can be concatenated. */
    private asContentBlocks(content: ChatMessageContent): ChatMessageContentBlock[] {
        return typeof content === 'string' ? [{ type: 'text', content }] : content;
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
     * Maps the neutral {@link ChatParams.tools} onto Anthropic's `tools` array.
     * JSON Schema passes through untouched — Anthropic's `input_schema` IS JSON Schema.
     *
     * @param params The chat params for this request
     * @returns The Anthropic tool declarations, or undefined when no tools were declared
     */
    private buildAnthropicTools(params: ChatParams): Tool[] | undefined {
        if (!params.tools || params.tools.length === 0) {
            return undefined;
        }
        return params.tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema as Tool.InputSchema
        }));
    }

    /**
     * Maps the neutral {@link ChatParams.toolChoice} onto Anthropic's `tool_choice`.
     *
     * Anthropic spells "the model must call something" as `any` (not `required`), and expresses
     * "one call at a time" as `disable_parallel_tool_use` on the choice object rather than as a
     * top-level request field.
     *
     * @param params The chat params for this request
     * @returns The Anthropic tool_choice object, or undefined to accept the provider default
     */
    private buildAnthropicToolChoice(params: ChatParams): ToolChoice | undefined {
        const choice = params.toolChoice;
        // `parallelToolCalls === false` still needs a choice object to hang the flag on; Anthropic's
        // own default is `auto`, so that is the one we synthesize.
        if (choice === undefined && params.parallelToolCalls !== false) {
            return undefined;
        }

        let mapped: ToolChoice;
        if (choice === undefined || choice === 'auto') {
            mapped = { type: 'auto' };
        } else if (choice === 'none') {
            mapped = { type: 'none' };
        } else if (choice === 'required') {
            mapped = { type: 'any' };
        } else {
            mapped = { type: 'tool', name: choice.name };
        }

        // `none` takes no parallelism flag — there will be no calls to serialize.
        if (params.parallelToolCalls === false && mapped.type !== 'none') {
            mapped.disable_parallel_tool_use = true;
        }
        return mapped;
    }

    /**
     * Pulls the `tool_use` blocks out of an Anthropic response and normalizes them.
     *
     * @param content The response's content blocks
     * @returns The normalized calls, or undefined when the model called nothing
     */
    private extractToolCalls(content: ContentBlock[]): ChatToolCall[] | undefined {
        const calls: ChatToolCall[] = [];
        for (const block of content ?? []) {
            if (block?.type === 'tool_use') {
                calls.push({
                    id: block.id,
                    name: block.name,
                    // Anthropic already delivers parsed input; guard anyway so a malformed block
                    // yields an empty argument set rather than a non-object.
                    arguments: (block.input && typeof block.input === 'object') ? block.input as Record<string, unknown> : {}
                });
            }
        }
        return calls.length > 0 ? calls : undefined;
    }

    /**
     * Was this error produced by the caller aborting the request?
     *
     * The Anthropic SDK raises {@link APIUserAbortError} when the `signal` we hand it fires (and it
     * does NOT retry an aborted request — `makeRequest` throws the abort before any retry decision).
     * We also treat "the token is aborted" as cancellation, which covers the raw `Stream` path where
     * the SDK swallows the abort instead of surfacing an error.
     */
    private isCancellation(error: unknown, token?: AbortSignal): boolean {
        if (token?.aborted) {
            return true;
        }
        if (error instanceof APIUserAbortError) {
            return true;
        }
        return error instanceof Error && error.name === 'AbortError';
    }

    /**
     * Build the failed ChatResult returned when a request is cancelled (caller abort or the
     * timeout composed into `cancellationToken` by AIPromptRunner). Shaped like every other
     * failure this driver reports, so callers keep using `success === false` + `errorMessage`.
     */
    private buildCancelledResult(startTime: Date, endTime: Date): ChatResult {
        const message = 'Anthropic request was cancelled';
        return {
            data: {
                choices: [],
                usage: new ModelUsage(0, 0)
            },
            success: false,
            statusText: 'cancelled',
            startTime,
            endTime,
            timeElapsed: endTime.getTime() - startTime.getTime(),
            errorMessage: message,
            exception: new APIUserAbortError(),
            errorInfo: ErrorAnalyzer.analyzeError(new Error(message), 'Anthropic')
        };
    }

    /**
     * Non-streaming implementation for Anthropic
     */
    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        let result: any = null;
        if (params.cancellationToken?.aborted) {
            // Already cancelled before we opened a socket — don't bother the API.
            return this.buildCancelledResult(startTime, new Date());
        }
        try {
            // Find system message and non-system messages
            const systemMsgs = params.messages.filter(m => m.role === "system");
            const nonSystemMsgs = params.messages.filter(m => m.role !== "system");
            
            // Determine max_tokens and thinking budget
            // When BUDGET-form thinking is enabled, max_tokens must be greater than budget_tokens.
            // Adaptive-thinking models (Claude 4.6+, all of Claude 5) have no budget: they take
            // `thinking.type = 'adaptive'` + `output_config.effort` and reject the budget form with
            // HTTP 400 (observed on claude-sonnet-5) — see `UsesAdaptiveThinking`.
            let maxTokens = params.maxOutputTokens || 32000;
            let thinkingBudget: number | undefined = undefined;

            if (!UsesAdaptiveThinking(params.model) && params.effortLevel && (params.reasoningBudgetTokens >= 1 || params.reasoningBudgetTokens === undefined || params.reasoningBudgetTokens === null)) {
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

            // Add thinking, in whichever form the model accepts, if an effort level is set
            const thinking = BuildAnthropicThinking({ model: params.model, effortLevel: params.effortLevel, budgetTokens: thinkingBudget });
            if (thinking.thinking) {
                createParams.thinking = thinking.thinking;
            }
            if (thinking.output_config) {
                createParams.output_config = thinking.output_config;
            }

            // Native tool calling (§5.1). Declarations and choice are ephemeral per-call params —
            // the prompt runner decides whether they are present; the driver just maps them.
            const anthropicTools = this.buildAnthropicTools(params);
            if (anthropicTools) {
                createParams.tools = anthropicTools;
                const toolChoice = this.buildAnthropicToolChoice(params);
                if (toolChoice) {
                    createParams.tool_choice = toolChoice;
                }
            }

            switch (params.responseFormat) {
                case 'JSON':
                    console.warn(`Anthropic provider: responseFormat='JSON' has no native equivalent. Use ResponseFormat='ModelSpecific' with a tool definition for structured output, or set assistantPrefill to '{' to coax JSON.`);
                    break;
                case 'ModelSpecific':
                    if (params.modelSpecificResponseFormat) {
                        Object.assign(createParams, params.modelSpecificResponseFormat);
                    }
                    break;
            }

            // Forward the caller's cancellation token as the SDK request option `signal`. MessageStream
            // wires it to its own AbortController, so an abort tears down the HTTP socket rather than
            // leaving it streaming into an abandoned promise; `finalMessage()` then rejects with
            // APIUserAbortError.
            const stream = this.AnthropicClient.messages
                .stream(createParams, { signal: params.cancellationToken })
                .on('text', (chunk: any) => {
                    // too noisy to log this -- console.log('stream chunk', chunk);
                });
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

            // Normalize any native tool calls the model made. A turn can carry BOTH text and tool
            // calls, so this never displaces `content`.
            const toolCalls = this.extractToolCalls(result.content);

            const chatResult: ChatResult = {
                data: {
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: content,
                                thinking: thinkingContent,
                                toolCalls: toolCalls
                            },
                            // Only the tool-call case gets a normalized reason; everything else keeps
                            // this driver's long-standing "completed" so existing consumers are
                            // untouched.
                            finish_reason: toolCalls ? CHAT_FINISH_REASON_TOOL_CALLS : "completed",
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
                },
                // Full native Anthropic response (circular-safe) for review/audit.
                raw: ToJSONSafe(result)
            };
            
            return chatResult;   
        }
        catch (e) {
            const endTime = new Date();
            if (this.isCancellation(e, params.cancellationToken)) {
                return this.buildCancelledResult(startTime, endTime);
            }
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
            cacheWriteTokens: 0,
            cancellationToken: undefined
        };
    }

    /**
     * Create a streaming request for Anthropic
     */
    protected async createStreamingRequest(params: ChatParams): Promise<any> {
        // Reset streaming state for new request
        this.resetStreamingState();
        // Remember the caller's cancellation token so finalizeStreamingResponse() can distinguish
        // a cancelled stream from a completed one (the SDK's Stream ends silently on abort).
        this._streamingState.cancellationToken = params.cancellationToken;
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
        
        // Add thinking, in whichever form the model accepts, if an effort level is set. The budget
        // form needs a caller-supplied budget of at least 1024 tokens (and below max_tokens); the
        // adaptive form (Claude 4.6+, all of Claude 5) has no budget at all.
        const streamingThinking = BuildAnthropicThinking({
            model: params.model,
            effortLevel: params.effortLevel,
            budgetTokens: params.reasoningBudgetTokens >= 1024 ? params.reasoningBudgetTokens : undefined
        });
        if (streamingThinking.thinking) {
            createParams.thinking = streamingThinking.thinking;
        }
        if (streamingThinking.output_config) {
            createParams.output_config = streamingThinking.output_config;
        }

        switch (params.responseFormat) {
            case 'JSON':
                console.warn(`Anthropic provider: responseFormat='JSON' has no native equivalent. Use ResponseFormat='ModelSpecific' with a tool definition for structured output, or set assistantPrefill to '{' to coax JSON.`);
                break;
            case 'ModelSpecific':
                if (params.modelSpecificResponseFormat) {
                    Object.assign(createParams, params.modelSpecificResponseFormat);
                }
                break;
        }

        // Pass the cancellation token as the SDK request option `signal` so an abort cancels the
        // underlying HTTP request instead of letting it keep streaming into a dropped promise.
        return this.AnthropicClient.messages.create(createParams, { signal: params.cancellationToken });
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
        // A cancelled stream ends silently (the SDK's Stream swallows the abort), so the base-class
        // chunk loop would otherwise hand us a truncated response and we'd report it as a success.
        // Detect it here and report the same cancelled failure the non-streaming path returns.
        if (this._streamingState.cancellationToken?.aborted) {
            const now = new Date();
            return this.buildCancelledResult(now, now);
        }

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