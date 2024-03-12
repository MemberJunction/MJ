import { ModelUsage } from "./baseModel";

export type EmbedParams = {
    text: string,
    model: string
}

export type EmbedResult = {
    object: 'object',
    model: string,
    ModelUsage: ModelUsage,
    data: number[]
}