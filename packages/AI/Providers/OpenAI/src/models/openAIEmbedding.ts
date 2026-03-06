import { EmbedTextParams, EmbedTextsParams, EmbedTextResult, EmbedTextsResult, BaseEmbeddings, ModelUsage, ErrorAnalyzer } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { OpenAI } from "openai";

@RegisterClass(BaseEmbeddings, 'OpenAIEmbedding')
export class OpenAIEmbedding extends BaseEmbeddings {
    private _openAI: OpenAI;

    constructor(apiKey: string) {
        super(apiKey);

        this._openAI = new OpenAI({
            apiKey: apiKey,
        });
    }

    /**
     * Read only getter method to get the OpenAI instance
     */
    public get OpenAI(): OpenAI {
        return this._openAI;
    }

    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        let body: OpenAI.Embeddings.EmbeddingCreateParams = {
            input: params.text,
            model: params.model || "text-embedding-3-small"
        }

        try{
            let response = await this.OpenAI.embeddings.create(body);

            return {
                object: response.object,
                model: response.model,
                ModelUsage: new ModelUsage(response.usage.prompt_tokens, 0),
                vector: response.data[0].embedding
            }
        }
        catch(error){
            // Log error details for debugging
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'OpenAI');
            console.error('OpenAI embedding error:', errorInfo);
            
            // Return error result
            return {
                object: "object",
                model: params.model || "text-embedding-3-small",
                ModelUsage: new ModelUsage(0, 0),
                vector: []
            };
        }
    }

    public async EmbedTexts(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        let body: OpenAI.Embeddings.EmbeddingCreateParams = {
            input: params.texts,
            model: params.model || "text-embedding-3-small"
        }

        try{
            let response = await this.OpenAI.embeddings.create(body);

            return {
                object: response.object,
                model: response.model,
                ModelUsage: new ModelUsage(response.usage.prompt_tokens, 0),
                vectors: response.data.map((data) => data.embedding)
            }
        }
        catch(error){
            // Log error details for debugging
            const errorInfo = ErrorAnalyzer.analyzeError(error, 'OpenAI');
            console.error('OpenAI embedding error:', errorInfo);
            
            // Return error result
            return {
                object: "list",
                model: params.model || "text-embedding-3-small",
                ModelUsage: new ModelUsage(0, 0),
                vectors: []
            };
        }
    }

    //openAI doesnt have an endpoint we can call
    public async GetEmbeddingModels(): Promise<any> {
        return [
            {
                Model: 'text-embedding-3-large',
                Description: "Most capable embedding model for both english and non-english tasks",
                OutputDimension: 3072,
            },
            {
                Model: 'text-embedding-3-small',
                Description: "Increased performance over 2nd generation ada embedding model",
                OutputDimension: 1536,
            },
            {
                Model: 'text-embedding-ada-002',
                Description: "Most capable 2nd generation embedding model, replacing 16 first generation models",
                OutputDimension: 1536,
            }
        ]
    }
}