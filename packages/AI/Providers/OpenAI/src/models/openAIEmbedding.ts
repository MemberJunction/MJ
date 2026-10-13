import { EmbedTextParams, EmbedTextsParams, EmbedTextResult, EmbedTextsResult, BaseEmbeddings, EmbeddingModelInfo, ModelUsage, ErrorAnalyzer } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { OpenAI } from "openai";

/**
 * An OpenAI embedding model, as {@link OpenAIEmbedding.GetEmbeddingModels} lists it. OpenAI's API
 * reference on `dimensions`: "Only supported in `text-embedding-3` and later models."
 */
export type OpenAIEmbeddingModelInfo = EmbeddingModelInfo;

const OPENAI_EMBEDDING_MODELS: readonly OpenAIEmbeddingModelInfo[] = [
    {
        Model: 'text-embedding-3-large',
        Description: "Most capable embedding model for both english and non-english tasks",
        OutputDimension: 3072,
        AcceptsDimensions: true,
    },
    {
        Model: 'text-embedding-3-small',
        Description: "Increased performance over 2nd generation ada embedding model",
        OutputDimension: 1536,
        AcceptsDimensions: true,
    },
    {
        Model: 'text-embedding-ada-002',
        Description: "Most capable 2nd generation embedding model, replacing 16 first generation models",
        OutputDimension: 1536,
        AcceptsDimensions: false,
    },
];

const DEFAULT_MODEL = 'text-embedding-3-small';

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

    /** Native batch endpoint: OpenAI embeds an array of inputs in one request. */
    public override get SupportsBatchEmbeddings(): boolean {
        return true;
    }

    protected override get EmbeddingModels(): readonly OpenAIEmbeddingModelInfo[] {
        return OPENAI_EMBEDDING_MODELS;
    }

    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        const model = params.model || DEFAULT_MODEL;
        let body: OpenAI.Embeddings.EmbeddingCreateParams = {
            input: params.text,
            model,
            ...this.DimensionsParam(model, params.dimensions),
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
                model,
                ModelUsage: new ModelUsage(0, 0),
                vector: []
            };
        }
    }

    protected override async embedBatch(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        const model = params.model || DEFAULT_MODEL;
        let body: OpenAI.Embeddings.EmbeddingCreateParams = {
            input: params.texts,
            model,
            ...this.DimensionsParam(model, params.dimensions),
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
                model,
                ModelUsage: new ModelUsage(0, 0),
                vectors: []
            };
        }
    }

    //openAI doesnt have an endpoint we can call
    public async GetEmbeddingModels(): Promise<OpenAIEmbeddingModelInfo[]> {
        return OPENAI_EMBEDDING_MODELS.map((m) => ({ ...m }));
    }
}