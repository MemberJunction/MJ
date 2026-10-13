import { BaseParams, ModelUsage } from "./baseModel";
import { ChatMessageContent } from "./chat.types";

/**
 * The retrieval role of a text. Asymmetric embedding models embed a search query differently from a
 * stored document. When it is omitted, catalog prefixes treat the text as a document and a driver
 * with a native parameter uses its own default.
 */
export type EmbeddingInputType = 'query' | 'document';

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
     * Optional cap on the input length, in tokens. Drivers that tokenize locally (e.g.
     * `LocalEmbedding`) truncate each text to it; hosted drivers ignore it. Callers pass the
     * catalog limit, `MJ: AI Model Vendors.MaxInputTokens`. When omitted, the tokenizer's own
     * limit applies, and some tokenizers declare none.
     */
    maxInputTokens?: number
    /**
     * Optional retrieval role of the text. Drivers with a native parameter (Cohere's `input_type`)
     * map it; other drivers ignore it. Instruction prefixes for prefix-trained models come from the
     * model's `ModelConfiguration.Embedding` section and are applied by the caller with
     * `ApplyEmbeddingInputPrefix`, not by the driver.
     */
    inputType?: EmbeddingInputType
}

export type EmbedTextsParams = BaseParams & {
    texts: string[]
    /**
     * Optional output dimension override. See `EmbedTextParams.dimensions`.
     */
    dimensions?: number
    /**
     * Optional input-length cap in tokens. See `EmbedTextParams.maxInputTokens`.
     */
    maxInputTokens?: number
    /**
     * Optional retrieval role of the texts. See `EmbedTextParams.inputType`.
     */
    inputType?: EmbeddingInputType
}

export type EmbedContentParams = BaseParams & {
    content: ChatMessageContent
    /**
     * Optional output dimension override. See `EmbedTextParams.dimensions`.
     */
    dimensions?: number
    /**
     * Optional retrieval role of the texts. See `EmbedTextParams.inputType`.
     */
    inputType?: EmbeddingInputType
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