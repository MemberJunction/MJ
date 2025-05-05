import { EmbedTextParams, EmbedTextsParams, BaseEmbeddings, ModelUsage, EmbedTextResult, EmbedTextsResult } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { Mistral } from "@mistralai/mistralai";
import { EmbeddingRequest, EmbeddingResponse } from "@mistralai/mistralai/models/components";


@RegisterClass(BaseEmbeddings, 'MistralEmbedding')
export class MistralEmbedding extends BaseEmbeddings {
    private _client: Mistral;
    
        constructor(apiKey: string) {
            super(apiKey);
            this._client = new Mistral({
                apiKey: apiKey
            });
        }
    
        public get Client(): Mistral {return this._client;}

    /**
     * Mistral AI embedding endpoint outputs vectors in 1024 dimensions
     */
    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        const request: EmbeddingRequest = {
            inputs: params.text,
            model: params.model || "mistral-embed",
        };

        params.model = params.model || "mistral-embed";
        const response: EmbeddingResponse = await this.Client.embeddings.create(request);
        let vector: number[] = [];
        if (response.data.length > 0){
            vector = response.data[0].embedding;
        }
        return {
            object: response.object as "object" | "list",
            model: response.model,
            ModelUsage: new ModelUsage(response.usage.promptTokens, response.usage.completionTokens),
            vector: vector
        };
    }

    /**
     * Mistral AI embedding endpoint outputs vectors in 1024 dimensions
     */
    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        
        const request: EmbeddingRequest = {
            inputs: params.texts,
            model: params.model || "mistral-embed",
        };

        params.model = params.model || "mistral-embed";
        const response: EmbeddingResponse = await this.Client.embeddings.create(request);
        return {
            object: response.object as "object" | "list",
            model: response.model,
            ModelUsage: new ModelUsage(response.usage.promptTokens, response.usage.completionTokens),
            vectors: response.data.map((data) => data.embedding)
        }
    }

    public async GetEmbeddingModels(): Promise<any> {
        let allModels = await this.Client.models.list();
        return allModels;
    }
}

export function LoadMistralEmbedding() {
    // this does nothing but prevents the class from being removed by the tree shaker
}