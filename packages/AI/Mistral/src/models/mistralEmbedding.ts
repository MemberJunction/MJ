import { EmbedParams, EmbedResult, Embeddings, ModelUsage } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { MistralClient } from './mistralClient';
import { EmbeddingResponse } from "../generic/mistral.types";


@RegisterClass(Embeddings, 'MistralEmbedding')
export class MistralEmbedding extends Embeddings {
    static _client: MistralClient;

    constructor(apiKey: string) {
        super(apiKey);
        if (!MistralEmbedding._client){
            MistralEmbedding._client = new MistralClient({ apiKey });
        }
    }

    public async EmbedText(params: EmbedParams): Promise<EmbedResult> {
        const response: EmbeddingResponse = await MistralEmbedding._client.embeddings(params.model, params.text);
        return {
            object: 'object',
            model: params.model || "mistral-embed", //hard coded for now as theres only one available embedding model
            ModelUsage: new ModelUsage(response.usage.prompt_tokens, response.usage.completion_tokens),
            data: response.data[0].embedding
        }
    }
}