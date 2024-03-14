import { BaseParams, ModelUsage } from "./baseModel";

export type EmbedParams = BaseParams & {
    text: string
}

export type EmbedResult = {
    object: 'object',
    model: string,
    ModelUsage: ModelUsage,
    data: number[]
}