import { EmbedTextParams, EmbedTextsParams, BaseEmbeddings, ModelUsage, EmbedTextResult, EmbedTextsResult, ErrorAnalyzer } from "@memberjunction/ai";
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
        try {
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
        } catch (error) {
            // Log error details for debugging
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'Mistral');
            console.error('Mistral embedding error:', errorInfo);
            
            // Return error result
            return {
                object: "object",
                model: params.model || "mistral-embed",
                ModelUsage: new ModelUsage(0, 0),
                vector: []
            };
        }
    }

    /**
     * Mistral AI embedding endpoint outputs vectors in 1024 dimensions
     */
    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        try {
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
        } catch (error) {
            // Log error details for debugging
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'Mistral');
            console.error('Mistral embedding error:', errorInfo);
            
            // Return error result
            return {
                object: "list",
                model: params.model || "mistral-embed",
                ModelUsage: new ModelUsage(0, 0),
                vectors: []
            };
        }
    }

    public async GetEmbeddingModels(): Promise<any> {
        try {
            let allModels = await this.Client.models.list();
            return allModels;
        } catch (error) {
            console.error('Error listing Mistral embedding models:', ErrorAnalyzer.analyzeError(error, 'Mistral'));
            return [];
        }
    }
}