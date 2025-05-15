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
     * representing the content of the item.
     */
    content: string;
}

/**
 * Union type for the content of a chat message.
 */
export type ChatMessageContent = string | ChatMessageContentBlock[];

/**
 * Defines the shape of an individual chat message.
 */
export type ChatMessage = {
    /**
     * Role of the message in the conversation.
     */
    role: ChatMessageRole;
    /**
     * Content of the message, can be any string or an array of content blocks.
     */
    content: ChatMessageContent;
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

export type ChatResultChoice = {
    message: ChatMessage
    finish_reason: string
    index: number
}

export type ChatResultData = {
    choices: ChatResultChoice[]
    usage: ModelUsage
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
}
 