import { BaseModel } from "./baseModel";
import { EmbedTextParams, EmbedTextResult, EmbedTextsParams, EmbedTextsResult } from "./embed.types";

export abstract class Embeddings extends BaseModel {
    public abstract EmbedText(params: EmbedTextParams): Promise<EmbedTextResult>
    public abstract EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult>
    public abstract GetEmbeddingModels(): Promise<any>
}