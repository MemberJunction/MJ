import { EmbedTextParams, EmbedTextsParams, Embeddings, ModelUsage, EmbedTextResult, EmbedTextsResult } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { MistralClient } from './mistralClient';
import { EmbeddingResponse } from "../generic/mistral.types";


@RegisterClass(Embeddings, 'MistralEmbedding', 1)
export class MistralEmbedding extends Embeddings {
    static _client: MistralClient;

    constructor(apiKey: string) {
        super(apiKey);
        if (!MistralEmbedding._client){
            MistralEmbedding._client = new MistralClient({ apiKey });
        }
    }

    public get Client(): MistralClient { return MistralEmbedding._client; }

    /**
     * Mistral AI embedding endpoint outputs vectors in 1024 dimensions
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        params.model = params.model || "mistral-embed";
        const response: EmbeddingResponse = await MistralEmbedding._client.embeddings(params.model, [params.text]);
        let vector: number[] = [];
        if (response.data.length > 0){
            vector = response.data[0].embedding;
        }
        return {
            object: response.object,
            model: response.model,
            ModelUsage: new ModelUsage(response.usage.prompt_tokens, response.usage.completion_tokens),
            vector: vector
        };
    }

    /**
     * Mistral AI embedding endpoint outputs vectors in 1024 dimensions
     */
    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        params.model = params.model || "mistral-embed";
        const response: EmbeddingResponse = await MistralEmbedding._client.embeddings(params.model, params.texts);
        return {
            object: response.object,
            model: response.model,
            ModelUsage: new ModelUsage(response.usage.prompt_tokens, response.usage.completion_tokens),
            vectors: response.data.map((data) => data.embedding)
        }
    }

    public async GetEmbeddingModels(): Promise<any> {
        let allModels = await this.Client.listModels();
        allModels.data = allModels.data.filter((model) => model.id.toLowerCase().includes('embed'));
        return allModels;
    }
}

export function LoadMistralEmbedding() {
    // this does nothing but prevents the class from being removed by the tree shaker
}