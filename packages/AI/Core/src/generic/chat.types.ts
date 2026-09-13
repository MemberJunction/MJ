import { BaseParams, BaseResult, ModelUsage } from "./baseModel"



/**
 * The possible roles for a chat message.
 *
 * `tool` carries the RESULT of a native tool call back to the model and is only ever produced
 * alongside a preceding `assistant` turn whose {@link ChatMessage.toolCalls} it answers. Its
 * content is one or more `tool_result` {@link ChatMessageContentBlock}s. Drivers that do not
 * implement tools (`BaseLLM.SupportsTools === false`) map it to `user` like any other non-assistant
 * role, so an unsupported driver degrades to prose rather than erroring.
 */
export const ChatMessageRole = {
    system: 'system',
    user: 'user',
    assistant: 'assistant',
    tool: 'tool'
} as const;

export type ChatMessageRole = typeof ChatMessageRole[keyof typeof ChatMessageRole];


/**
 * Defines the shape of a content block in a chat message.
 * This can be used to represent different types of content in a message.
 */
export type ChatMessageContentBlock = {
    /**
     * The type of content block.
     * Can be 'text', 'image_url', 'video_url', 'audio_url', 'file_url', or 'tool_result'.
     */
    type: 'text' | 'image_url' | 'video_url' | 'audio_url' | 'file_url' | 'tool_result';
    /**
     * The content of the block.
     * This can be a string. In the case of 'image_url', 'video_url', 'audio_url', or 'file_url', it should be a URL to the resource, OR it can be a base64 encoded string.
     * representing the content of the item. For base64 images, use the data URL format: data:image/png;base64,<data>
     * For 'tool_result', this is the result payload the model should see — stringify non-text results.
     */
    content: string;
    /**
     * For 'tool_result' blocks: the {@link ChatToolCall.id} this block answers. Required on
     * 'tool_result'; providers use it to pair a result with the call that requested it.
     */
    toolCallId?: string;
    /**
     * For 'tool_result' blocks: the name of the tool that was called. Optional — carried for
     * providers (and logs) that key results by name rather than id.
     */
    toolName?: string;
    /**
     * For 'tool_result' blocks: whether the result represents a FAILED tool execution. Providers
     * that model this natively (Anthropic's `is_error`) get it mapped through; others receive the
     * error text as an ordinary result.
     */
    isError?: boolean;
    /**
     * Optional MIME type for media content (e.g., 'image/png', 'image/jpeg', 'audio/mp3').
     * When content is a data URL, this can be extracted from the URL. When content is raw base64, this field is required.
     */
    mimeType?: string;
    /**
     * Optional original filename if the content was uploaded from a file.
     */
    fileName?: string;
    /**
     * Optional file size in bytes.
     */
    fileSize?: number;
    /**
     * Optional width in pixels (for images and videos).
     */
    width?: number;
    /**
     * Optional height in pixels (for images and videos).
     */
    height?: number;
}

/**
 * Union type for the content of a chat message.
 */
export type ChatMessageContent = string | ChatMessageContentBlock[];

// =============================================================================
// Native Tool Calling — provider-neutral surface
// =============================================================================

/**
 * A single tool made available to the model for this request.
 *
 * Provider-neutral by design: every major vendor declares tool parameters as JSON Schema with
 * per-property `description` strings, so that is the interchange format here — `input_schema`
 * (Anthropic), `parameters` (OpenAI), `parameters` / `parametersJsonSchema` (Gemini).
 */
export interface ChatTool {
    /**
     * The tool's name, as the model will call it. Providers constrain this to `[a-zA-Z0-9_-]`,
     * 64 characters or fewer; callers building tools from names that can contain other characters
     * (MJ Action names, say) must sanitize deterministically and keep a reverse map.
     */
    name: string;
    /**
     * What the tool does and — more importantly for call accuracy — WHEN the model should call it.
     * Prescriptive phrasing ("Call this when…") measurably outperforms a bare description.
     */
    description?: string;
    /**
     * JSON Schema for the tool's input. Stick to the cross-provider common subset — `type`,
     * `description`, `enum`, `items`, `properties`, `required` — because Gemini's classic
     * function-declaration schema is an OpenAPI subset that rejects keywords like
     * `additionalProperties`. Drivers adapt anything beyond that subset.
     */
    inputSchema: Record<string, unknown>;
}

/**
 * Controls how the model may use the tools declared for this request.
 *
 * - `'auto'` — the model decides whether to call a tool. The default whenever tools are present.
 * - `'none'` — tools stay declared (and cached) but the model must not call one this turn. The
 *   way to force a prose/JSON answer without changing the cached tool block.
 * - `'required'` — the model must call some tool.
 * - `{ name }` — the model must call the named tool.
 *
 * Forcing a call typically SUPPRESSES text output, and Anthropic additionally disables extended
 * thinking under a forced tool choice — never assume text accompanies a forced call.
 */
export type ChatToolChoice = 'auto' | 'none' | 'required' | { name: string };

/**
 * One tool call the model asked for, normalized across providers.
 */
export interface ChatToolCall {
    /**
     * The provider's call id, echoed back on the matching `tool_result` block so the provider can
     * pair result to call. Drivers synthesize a stable id for providers that do not supply one
     * (Gemini names calls rather than identifying them).
     */
    id: string;
    /** The tool name the model called — matches a {@link ChatTool.name} that was declared. */
    name: string;
    /**
     * The call arguments, already PARSED. Providers that transmit arguments as a JSON string
     * (OpenAI) parse them in the driver, so consumers never see a string here.
     */
    arguments: Record<string, unknown>;
    /**
     * Opaque provider data that must travel with the call when it is replayed into history.
     * Gemini 3 attaches a `thoughtSignature` to each function-call part and rejects a replayed call
     * that lacks it (HTTP 400); the driver stores it here on the way in and
     * sends it back on the way out. Other providers leave this undefined. Never read by the loop.
     */
    providerMetadata?: Record<string, unknown>;
}

/**
 * The normalized `finish_reason` a driver reports when the model ended its turn by calling one or
 * more tools. Consumers branch on this rather than on any provider-specific stop reason.
 *
 * This is currently the ONLY normalized value: every other `finish_reason` is whatever the driver's
 * SDK returned (`'stop'`, `"completed"`, `"STOP"`, …). Normalizing the rest is tracked in
 * MemberJunction/MJ#4335, which must preserve unrecognized values rather than map onto a closed
 * union — a shipped action overloads the field as a channel selector.
 */
export const CHAT_FINISH_REASON_TOOL_CALLS = 'tool_calls';

/**
 * The normalized `finish_reason` a driver reports when the model tried to call a tool but the call
 * could not be read — Gemini's `MALFORMED_FUNCTION_CALL`, typically an oversized or syntactically
 * broken argument object. The turn then carries whatever text preceded the broken call and NO
 * `toolCalls`, so without this marker a consumer reads leftover narration as the model's answer.
 * The agent loop turns it into a corrective retry.
 */
export const CHAT_FINISH_REASON_MALFORMED_TOOL_CALL = 'malformed_tool_call';

/**
 * Defines the shape of an individual chat message.
 *
 * @template M - Optional metadata type. Use this to attach typed metadata to messages
 * without coupling the core ChatMessage type to specific implementations.
 */
export type ChatMessage<M = any> = {
    /**
     * Role of the message in the conversation.
     */
    role: ChatMessageRole;
    /**
     * Content of the message, can be any string or an array of content blocks.
     */
    content: ChatMessageContent;
    /**
     * Optional metadata for the message. The type can be specified via the generic parameter.
     * This allows different consumers to attach their own typed metadata without modifying
     * the core ChatMessage type.
     */
    metadata?: M;
    /**
     * For `assistant` turns that called tools: the calls the model made, so a prior tool-calling
     * turn round-trips back to the provider on the next request. Every provider requires the
     * assistant's own call turn to be present in history before the matching results.
     *
     * Set this from {@link ChatCompletionMessage.toolCalls} when appending the model's reply to
     * the conversation; the `tool` turn that answers it follows immediately.
     */
    toolCalls?: ChatToolCall[];
}

/**
 * Defines the shape of an individual message from the model in response to a chat completion request.
 */
export type ChatCompletionMessage = {
    /**
     * Role of the message in the conversation. For completions, this is always 'assistant'.
     */
    role: 'assistant';

    /**
     * Content of the message, can be any string 
     */
    content: string;

    /**
     * When using a reasoning model, this field can contain the reasoning behind the response.
     * Not all providers/models support this field.
     */
    thinking?: string | null;

    /**
     * Tool calls the model made on this turn, normalized across providers. Absent or empty when
     * the model did not call a tool.
     *
     * A turn can carry BOTH `content` and `toolCalls` — the tool-capable providers structurally
     * allow it (Anthropic `text` + `tool_use` blocks, OpenAI nullable `content` alongside
     * `tool_calls`, Gemini `text` + `functionCall` parts) — so this is never an either/or with
     * `content`. Equally, nothing downstream may assume `content` is non-empty on a tool-call
     * turn: a forced {@link ChatToolChoice} usually suppresses text entirely.
     */
    toolCalls?: ChatToolCall[];
}

/**
 * Interface for streaming chat completion callbacks
 */
export interface StreamingChatCallbacks {
    /**
     * Called when a new chunk of content is received
     * @param chunk The new content chunk
     * @param isComplete Whether this is the final chunk
     */
    OnContent?: (chunk: string, isComplete: boolean) => void;
    
    /**
     * Called when the stream is complete
     * @param finalResponse The complete ChatResult
     */
    OnComplete?: (finalResponse: ChatResult) => void;
    
    /**
     * Called when an error occurs during streaming
     * @param error The error that occurred
     */
    OnError?: (error: any) => void;
}

/**
 * Interface for callbacks used in parallel chat completions
 */
export interface ParallelChatCompletionsCallbacks {
    /**
     * Called when a single completion from the batch is completed
     * @param response The completed ChatResult
     * @param index The index of the completion in the original request array
     */
    OnCompletion?: (response: ChatResult, index: number) => void;
    
    /**
     * Called when any completion in the batch encounters an error
     * @param error The error that occurred
     * @param index The index of the completion that failed
     */
    OnError?: (error: any, index: number) => void;
    
    /**
     * Called when all completions in the batch are completed (successfully or with errors)
     * @param responses Array of all ChatResults in the same order as the request params
     */
    OnAllCompleted?: (responses: ChatResult[]) => void;
}

export class ChatParams extends BaseParams  {
    /**
     * Array of messages, allows full control over the order and content of the conversation.
     */
    messages: ChatMessage[] = [];

    /**
     * Optional text to prefill the assistant's response. When set, the model will behave as if
     * it has already started generating this text and will continue from where the prefill ends.
     *
     * This is useful for:
     * - Forcing structured output formats (e.g., prefill with "```json" to get raw JSON)
     * - Skipping preamble (e.g., prefill with "{" to get a JSON object directly)
     * - Guiding the model's response style or format
     *
     * Best used in combination with `stopSequences` — for example, prefill with "```json\n"
     * and set stopSequences to ["```"] to extract clean JSON without any markdown fencing.
     *
     * **Provider support:** Anthropic, Mistral, Groq, Bedrock (Claude models), Ollama, and
     * OpenRouter natively support prefill. For providers that don't support it, this parameter
     * is silently ignored.
     *
     * **Note:** The prefill text is NOT included in the response — the model's output begins
     * immediately after the prefill. If you need the prefill text in your final result,
     * prepend it yourself after receiving the response.
     */
    assistantPrefill?: string;

    /**
     * Whether to use streaming for this request.
     * If true and the provider supports streaming, responses will be streamed.
     * If true but the provider doesn't support streaming, the request will fall back to non-streaming.
     */
    streaming?: boolean = false;
    
    /**
     * Callbacks for streaming responses.
     * Only used when streaming is true.
     */
    streamingCallbacks?: StreamingChatCallbacks;

    /**
     * If the model supports effort levels, this parameter can be used to specify the effort level.
     */
    effortLevel?: string;
    
    /**
     * Whether to enable caching for this request.
     * Implementation depends on the specific provider (the below are examples, many other providers exist):
     * - For Anthropic: Uses Anthropic's ephemeral cache control to cache system prompt and last user message.
     * - For OpenAI: Uses automatic caching (provider handles it).
     * - For other providers: May be a no-op if caching isn't supported.
     * 
     * @default true - Caching is enabled by default for providers that support it.
     */
    enableCaching?: boolean = true;

    /**
     * Not all AI providers support this feature. When supported, this parameter indicates if logprobs are requested.
     * Logprobs provide information about the likelihood of each token in the response.
     * This can be useful for debugging or understanding the model's behavior.
     * When models support this and this property is set to true, the model will return logprobs for the tokens in the @see ChatResultData object within the array of @see ChatResultChoice objects.
     */
    includeLogProbs?: boolean = false;

    /**
     * Optional cancellation token to abort the chat completion request.
     * When this signal is aborted, the provider should cancel the request
     * and return a cancelled result as gracefully as possible.
     */
    cancellationToken?: AbortSignal;

    // Core sampling controls

    /**
     * Top-p (nucleus) sampling parameter (0-1).
     * An alternative to temperature sampling that considers the smallest set of tokens
     * whose cumulative probability exceeds the probability p.
     * For example, 0.1 means only the tokens comprising the top 10% probability mass are considered.
     * Generally, use either temperature OR top-p, not both.
     */
    topP?: number;

    /**
     * Number between -2.0 and 2.0. Positive values penalize new tokens based on their
     * existing frequency in the text so far, decreasing the model's likelihood to
     * repeat the same line verbatim.
     */
    frequencyPenalty?: number;

    /**
     * Number between -2.0 and 2.0. Positive values penalize new tokens based on whether
     * they appear in the text so far, increasing the model's likelihood to talk about new topics.
     */
    presencePenalty?: number;

    // Advanced sampling controls

    /**
     * Top-k sampling parameter.
     * Limits the model to only sample from the top K most likely tokens at each step.
     * For example, k=50 means the model will only consider the 50 most likely next tokens.
     * Not supported by all providers (e.g., OpenAI doesn't support this).
     */
    topK?: number;

    /**
     * Minimum probability threshold for token sampling (0-1).
     * Tokens with probability below this threshold are filtered out before sampling.
     * This is a newer parameter not yet widely supported.
     */
    minP?: number;

    /**
     * Number of top log probabilities to return per token.
     * Only used when includeLogProbs is true.
     * Typically ranges from 2-20, depending on the provider.
     */
    topLogProbs?: number;

    // Native tool calling — ephemeral, per-call. Never persisted; the prompt runner fills these
    // from resolved metadata + caller-supplied tools, and drivers consume them verbatim.

    /**
     * Tool declarations for this request. When present and the driver reports
     * `SupportsTools === true`, these are passed to the provider's native tool-calling API.
     *
     * A driver with `SupportsTools === false` IGNORES this and notes the fact in
     * `modelSpecificResponseDetails` — the prompt runner's capability gate should mean that never
     * happens, but Layer 2 stays safe on its own.
     */
    tools?: ChatTool[];

    /**
     * How the model may use {@link ChatParams.tools}. Ignored when no tools are declared.
     * Defaults to the provider's own default (`'auto'`) when omitted.
     */
    toolChoice?: ChatToolChoice;

    /**
     * Whether the model may emit several tool calls in a single turn. Omit to accept the
     * provider's default (parallel calls allowed). Maps to OpenAI `parallel_tool_calls` and
     * Anthropic `tool_choice.disable_parallel_tool_use`.
     */
    parallelToolCalls?: boolean;
}
/**
 * Returns the first user message from the chat params
 * @param p 
 * @returns 
 */
export function GetUserMessageFromChatParams(p: ChatParams): ChatMessageContent | undefined {
    return p.messages.find(m => m.role === ChatMessageRole.user)?.content;
}
/**
 * Returns the first system message from the chat params
 * @param p 
 * @returns 
 */
export function GetSystemPromptFromChatParams(p: ChatParams): ChatMessageContent | undefined {
    return p.messages.find(m => m.role === ChatMessageRole.system)?.content;
}

/**
 * Single message content token with log probability information.
 */
export type ChatResultSingleLogProb = {
    /**
     * A list of integers representing the UTF-8 bytes representation of the token. 
     * Useful in instances where characters are represented by multiple tokens and their byte representations 
     * must be combined to generate the correct text representation. Can be null if there is no bytes representation for the token.
     */
    bytes: Array<number> | null;

    /**
     * The log probability of this token, if it is within the top 20 most likely tokens. Otherwise, the value -9999.0 is used to signify that the token is very unlikely.
     */
    logprob: number

    /**
     * The token itself, represented as a string. This is the actual text representation of the token.
     */
    token: string

    /**
     * List of the most likely tokens and their log probability, at this token position. In rare cases, there may be fewer than the number of requested top_logprobs returned.
     */
    top_logprobs: Array<{
        /**
         * The token
         */
        token: string
        /**
         * The log probability of this token, if it is within the top 20 most likely tokens. Otherwise, the value -9999.0 is used to signify that the token is very unlikely.
         */
        logprob: number
        /**
         * A list of integers representing the UTF-8 bytes representation of the token. 
         * Useful in instances where characters are represented by multiple tokens and their byte representations must be 
         * combined to generate the correct text representation. Can be null if there is no bytes representation for the token.
         */
        bytes: Array<number> | null;
    }> | null;
}

/**
 * Log probability information for a given ChatResultChoice.
 */
export type ChatResultLogProbs = {
    /**
     * A list of message content tokens with log probability information.
     */
    content: Array<ChatResultSingleLogProb> | null;
    /**
     * A list of message refusal tokens with log probability information.
     */
    refusal: Array<ChatResultSingleLogProb> | null;
}

/**
 * A single choice in the chat completion result.
 */
export type ChatResultChoice = {
    message: ChatCompletionMessage
    finish_reason: string
    index: number
    logprobs?: ChatResultLogProbs | null
}

/**
 * A response returned from a chat model for a given chat completion request.
 */
export type ChatResultData = {
    /**
     * A list of chat completion choices. Can be more than one if n is greater than 1.
     */
    choices: ChatResultChoice[]
    /**
     * The API name of the model used to generate the response. Some AI providers may return this as undefined.
     */
    model?: string
    /**
     * The number of tokens used in the request and response. Some AI providers may return this as undefined.
     */
    usage?: ModelUsage
}

/**
 * Cache metadata returned from the provider
 */
export interface CacheMetadata {
    /**
     * Whether the request had a cache hit
     */
    cacheHit?: boolean;
    
    /**
     * The number of tokens retrieved from cache
     */
    cachedTokenCount?: number;
}

export class ChatResult extends BaseResult {
    data: ChatResultData;
    success: boolean;
    statusText: string;

    /**
     * Cache-related metadata if available from the provider
     */
    cacheInfo?: CacheMetadata;

    /**
     * Optional provider-specific response metadata and details not captured in standard fields.
     * This is a flexible field that can contain any additional information the AI provider returns.
     * Structure varies by AI provider.
     */
    modelSpecificResponseDetails?: Record<string, any>;
}

// =============================================================================
// Content Serialization Utilities
// =============================================================================

/**
 * Prefix marker used to identify serialized content blocks in storage.
 * When a message starts with this prefix, it indicates the content is a JSON array of ChatMessageContentBlock.
 */
export const CONTENT_BLOCKS_PREFIX = '$$CONTENT_BLOCKS$$';

/**
 * Serializes ChatMessageContent for storage in a database text field.
 * - Plain strings are stored as-is for backward compatibility
 * - Content block arrays are serialized as JSON with a prefix marker
 *
 * @param content The content to serialize
 * @returns A string suitable for database storage
 */
export function serializeMessageContent(content: ChatMessageContent): string {
    if (typeof content === 'string') {
        return content;
    }
    return CONTENT_BLOCKS_PREFIX + JSON.stringify(content);
}

/**
 * Deserializes a stored message back to ChatMessageContent.
 * - Messages with the content blocks prefix are parsed as JSON arrays
 * - Other messages are returned as plain strings
 *
 * @param message The stored message string
 * @returns The deserialized ChatMessageContent
 */
export function deserializeMessageContent(message: string): ChatMessageContent {
    if (!message) {
        return '';
    }
    if (message.startsWith(CONTENT_BLOCKS_PREFIX)) {
        try {
            return JSON.parse(message.substring(CONTENT_BLOCKS_PREFIX.length)) as ChatMessageContentBlock[];
        } catch {
            // If parsing fails, return the original message minus the prefix
            return message.substring(CONTENT_BLOCKS_PREFIX.length);
        }
    }
    return message;
}

/**
 * Checks if the content contains any image blocks.
 *
 * @param content The message content to check
 * @returns True if the content contains at least one image_url block
 */
export function hasImageContent(content: ChatMessageContent): boolean {
    if (typeof content === 'string') {
        return false;
    }
    return content.some(block => block.type === 'image_url');
}

/**
 * Extracts just the text content from a ChatMessageContent, ignoring media blocks.
 * Useful for display or logging purposes.
 *
 * @param content The message content
 * @returns A plain text string with all text blocks joined
 */
export function getTextFromContent(content: ChatMessageContent): string {
    if (typeof content === 'string') {
        return content;
    }
    return content
        .filter(block => block.type === 'text')
        .map(block => block.content)
        .join('\n');
}

/**
 * Validates that every tool result in a conversation answers a tool call the model actually made.
 *
 * The contract providers enforce: a `tool_result` is only meaningful next to the assistant turn
 * whose `tool_use` / `tool_calls` it answers. The easy way to break it is to append the model's
 * reply to the conversation WITHOUT copying {@link ChatCompletionMessage.toolCalls} onto the
 * assistant {@link ChatMessage}, then append the results — the calls vanish and the results are
 * orphaned. Anthropic rejects that outright, and the provider's own error names an opaque id rather
 * than the mistake, so this catches it at the MJ boundary with a message that says what to fix.
 *
 * Only runs where it can find a problem: conversations with no tool turns are untouched.
 *
 * @param messages The conversation to check
 * @throws Error naming the unmatched tool-call ids and how to fix the history
 */
export function validateToolConversation(messages: ChatMessage[]): void {
    const declaredCallIds = new Set<string>();
    const orphaned: string[] = [];

    for (const message of messages) {
        // Assistant turns declare ids; results may only reference ids declared BEFORE them, so the
        // two are collected in a single forward pass.
        if (message.role === ChatMessageRole.assistant) {
            for (const call of message.toolCalls ?? []) {
                declaredCallIds.add(call.id);
            }
            continue;
        }

        for (const block of getToolResultBlocks(message.content)) {
            if (!block.toolCallId || !declaredCallIds.has(block.toolCallId)) {
                orphaned.push(block.toolCallId ?? '(missing toolCallId)');
            }
        }
    }

    if (orphaned.length > 0) {
        throw new Error(
            `Tool result(s) with no matching tool call in the conversation: ${orphaned.join(', ')}. ` +
            `Every tool_result must answer a call declared by an EARLIER assistant message — set ` +
            `ChatMessage.toolCalls from the model's ChatCompletionMessage.toolCalls when you append ` +
            `its reply, before appending the results.`
        );
    }
}

/**
 * Collapses an MJ role onto the three roles every chat API understands.
 *
 * `tool` becomes `user`, which is how a tool result reads to a provider with no tool support — the
 * user handing the model some text. Drivers that DO implement tools must not use this for `tool`
 * turns; they map those onto their SDK's own tool-result shape.
 *
 * @param role The MJ message role
 * @returns The equivalent classic role
 */
export function toClassicChatMessageRole(role: ChatMessageRole): 'system' | 'user' | 'assistant' {
    return role === ChatMessageRole.tool ? ChatMessageRole.user : role;
}

/**
 * Extracts the `tool_result` blocks from a message's content, ignoring everything else.
 * Returns an empty array for plain-string content.
 *
 * @param content The message content to inspect
 * @returns The tool-result blocks, in order
 */
export function getToolResultBlocks(content: ChatMessageContent): ChatMessageContentBlock[] {
    if (typeof content === 'string') {
        return [];
    }
    return content.filter(block => block.type === 'tool_result');
}

/**
 * Builds the `tool` turn that answers one or more tool calls.
 *
 * Providers require the results for a given assistant turn's calls to arrive TOGETHER, in the
 * single turn that immediately follows it — so pass every result for that turn in one call rather
 * than appending a message per result.
 *
 * @param results One entry per tool call being answered
 * @returns A `tool`-role message whose content is the corresponding `tool_result` blocks
 */
export function createToolResultMessage(
    results: Array<{ toolCallId: string; toolName?: string; content: string; isError?: boolean }>
): ChatMessage {
    return {
        role: ChatMessageRole.tool,
        content: results.map(r => ({
            type: 'tool_result' as const,
            content: r.content,
            toolCallId: r.toolCallId,
            toolName: r.toolName,
            isError: r.isError
        }))
    };
}

/**
 * Parses a base64 data URL into its components.
 *
 * @param dataUrl A data URL (e.g., "data:image/png;base64,iVBORw...")
 * @returns An object with mediaType and data, or null if not a valid data URL
 */
export function parseBase64DataUrl(dataUrl: string): { mediaType: string; data: string } | null {
    if (!dataUrl.startsWith('data:')) {
        return null;
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
        return { mediaType: match[1], data: match[2] };
    }
    return null;
}

/**
 * Creates a data URL from raw base64 data and a MIME type.
 *
 * @param base64Data The raw base64 encoded data (without the data: prefix)
 * @param mimeType The MIME type (e.g., 'image/png')
 * @returns A complete data URL
 */
export function createBase64DataUrl(base64Data: string, mimeType: string): string {
    return `data:${mimeType};base64,${base64Data}`;
}
 