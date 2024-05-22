import { BaseParams, ModelUsage } from "./baseModel";

export type EmbedTextParams = BaseParams & {
    text: string
}

export type EmbedTextsParams = BaseParams & {
    texts: string[]
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