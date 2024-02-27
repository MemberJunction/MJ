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

export class ChatParams extends BaseParams  {
    /**
     * Array of messages, allows full control over the order and content of the conversation.
     */
    messages: ChatMessage[] = [];

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
 