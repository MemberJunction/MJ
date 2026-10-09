import { EmbedTextParams, EmbedTextsParams, EmbedTextResult, EmbedTextsResult, BaseEmbeddings, ModelUsage, ErrorAnalyzer } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { OpenAI } from "openai";

/** An OpenAI embedding model, as {@link OpenAIEmbedding.GetEmbeddingModels} lists it. */
export interface OpenAIEmbeddingModelInfo {
    Model: string;
    Description: string;
    /** The width of the vectors the model produces when no `dimensions` is requested. */
    OutputDimension: number;
    /**
     * Whether the model accepts the `dimensions` request parameter. OpenAI's API reference: "Only
     * supported in `text-embedding-3` and later models." text-embedding-ada-002 has a fixed width of
     * 1536 and rejects the parameter, even when the requested width is its own.
     */
    AcceptsDimensions: boolean;
}

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

    public async EmbedText(params: EmbedTextParams): Promise<EmbedTextResult> {
        let body: OpenAI.Embeddings.EmbeddingCreateParams = {
            input: params.text,
            model: params.model || "text-embedding-3-small",
            ...this.DimensionsParam(params.model || "text-embedding-3-small", params.dimensions),
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

    protected override async embedBatch(params: EmbedTextsParams): Promise<EmbedTextsResult> {
        let body: OpenAI.Embeddings.EmbeddingCreateParams = {
            input: params.texts,
            model: params.model || "text-embedding-3-small",
            ...this.DimensionsParam(params.model || "text-embedding-3-small", params.dimensions),
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

    /**
     * The `dimensions` request parameter for a call, or none.
     *
     * Callers pass the vector index's `Dimensions` on every call, and MJ stamps one on every index it
     * creates, so a model with a single width is asked for it too. A model that rejects the parameter
     * is sent nothing when the requested width is its own, which is what it produces anyway. Any other
     * width is still sent: the model can't produce it, and the API's rejection is better than vectors
     * of the wrong width.
     */
    protected DimensionsParam(model: string, dimensions?: number): { dimensions?: number } {
        if (!dimensions) {
            return {};
        }
        const info = OPENAI_EMBEDDING_MODELS.find((m) => m.Model === model);
        if (info && !info.AcceptsDimensions && info.OutputDimension === dimensions) {
            return {};
        }
        return { dimensions };
    }

    //openAI doesnt have an endpoint we can call
    public async GetEmbeddingModels(): Promise<OpenAIEmbeddingModelInfo[]> {
        return OPENAI_EMBEDDING_MODELS.map((m) => ({ ...m }));
    }
}