import { BaseParams, BaseResult, ModelUsage } from "./baseModel"

export type ChatMessage = {
    role: string
    content: string
}

export class ChatParams extends BaseParams  {
    messages: ChatMessage[]
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
    status: string
    statusText: string
}

export interface IChat {
    ChatCompletion(params: ChatParams): Promise<ChatResult> 
}