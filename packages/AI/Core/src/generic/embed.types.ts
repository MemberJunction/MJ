import { BaseParams, ModelUsage } from "./baseModel";
import { ChatMessageContent } from "./chat.types";

export type EmbedTextParams = BaseParams & {
    text: string
    /**
     * Optional output dimension override. Only supported by models that accept a
     * `dimensions` parameter (e.g. OpenAI `text-embedding-3-*`). When omitted,
     * the model's native default dimension is used. The value stored in
     * `MJ: Vector Indexes.Dimensions` is the authoritative source — callers should
     * read it from there and pass it here.
     */
    dimensions?: number
}

export type EmbedTextsParams = BaseParams & {
    texts: string[]
    /**
     * Optional output dimension override. See `EmbedTextParams.dimensions`.
     */
    dimensions?: number
}

export type EmbedContentParams = BaseParams & {
    content: ChatMessageContent
    /**
     * Optional output dimension override. See `EmbedTextParams.dimensions`.
     */
    dimensions?: number
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