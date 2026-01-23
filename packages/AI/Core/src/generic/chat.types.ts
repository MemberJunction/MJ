import { BaseParams, BaseResult, ModelUsage } from "./baseModel"



/**
 * The possible roles for a chat message.
 */
export const ChatMessageRole = {
    system: 'system',
    user: 'user',
    assistant: 'assistant'
} as const;

export type ChatMessageRole = typeof ChatMessageRole[keyof typeof ChatMessageRole];


/**
 * Defines the shape of a content block in a chat message.
 * This can be used to represent different types of content in a message.
 */
export type ChatMessageContentBlock = {
    /**
     * The type of content block.
     * Can be 'text', 'image_url', 'video_url', 'audio_url', or 'file_url'.
     */
    type: 'text' | 'image_url' | 'video_url' | 'audio_url' | 'file_url';
    /**
     * The content of the block.
     * This can be a string. In the case of 'image_url', 'video_url', 'audio_url', or 'file_url', it should be a URL to the resource, OR it can be a base64 encoded string.
     * representing the content of the item. For base64 images, use the data URL format: data:image/png;base64,<data>
     */
    content: string;
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
 