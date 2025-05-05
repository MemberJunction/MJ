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
 * Defines the shape of an individual chat message.
 */
export type ChatMessage = {
    /**
     * Role of the message in the conversation.
     */
    role: ChatMessageRole;
    /**
     * Content of the message, can be any string.
     */
    content: string;
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
}
/**
 * Returns the first user message from the chat params
 * @param p 
 * @returns 
 */
export function GetUserMessageFromChatParams(p: ChatParams): string | undefined {
    return p.messages.find(m => m.role === ChatMessageRole.user)?.content;
}
/**
 * Returns the first system message from the chat params
 * @param p 
 * @returns 
 */
export function GetSystemPromptFromChatParams(p: ChatParams): string | undefined {
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

export class ChatResult extends BaseResult {
    data: ChatResultData;
    success: boolean;
    statusText: string
}
 