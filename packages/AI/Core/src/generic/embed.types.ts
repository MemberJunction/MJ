import { BaseParams, ModelUsage } from "./baseModel";
import { ChatMessageContent } from "./chat.types";

export type EmbedTextParams = BaseParams & {
    text: string
}

export type EmbedTextsParams = BaseParams & {
    texts: string[]
}

export type EmbedContentParams = BaseParams & {
    content: ChatMessageContent
}

export type EmbedResult = {
    object: 'object' | 'list',
    model: string,
    ModelUsage: ModelUsage,
}

export type EmbedTextResult = EmbedResult & {
    vector: number[]
}

export type EmbedTextsResult = EmbedResult & {
    vectors: number[][]
}

export type EmbedContentResult = EmbedTextResult