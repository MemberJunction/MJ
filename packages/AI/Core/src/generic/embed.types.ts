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
    /**
     * Optional signal for cancelling the request. Drivers whose SDK can abort a request forward it,
     * so an abort tears the request down; drivers that call an in-process model check it between
     * items and stop. A request that stops because the signal fired throws a cancellation error
     * (classified `Cancelled`, or a retriable `NetworkError` when the signal was aborted by a
     * timeout) rather than returning an empty result, and is never retried.
     */
    CancellationToken?: AbortSignal
}

export type EmbedTextsParams = BaseParams & {
    texts: string[]
    /**
     * Optional output dimension override. See `EmbedTextParams.dimensions`.
     */
    dimensions?: number
    /**
     * Optional signal for cancelling the request. See `EmbedTextParams.CancellationToken`. Once it
     * fires, no further text or batch is sent.
     */
    CancellationToken?: AbortSignal
}

export type EmbedContentParams = BaseParams & {
    content: ChatMessageContent
    /**
     * Optional output dimension override. See `EmbedTextParams.dimensions`.
     */
    dimensions?: number
    /**
     * Optional signal for cancelling the request. See `EmbedTextParams.CancellationToken`.
     */
    CancellationToken?: AbortSignal
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