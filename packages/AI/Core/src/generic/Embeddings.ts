import { BaseModel } from "./baseModel";
import { EmbedParams, EmbedResult } from "./embed.types";

export abstract class Embeddings extends BaseModel {
    public abstract EmbedText(params: EmbedParams): Promise<EmbedResult>
}