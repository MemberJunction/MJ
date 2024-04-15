import { EmbedParams, EmbedResult, Embeddings, ModelUsage } from "@memberjunction/ai";
import { RegisterClass } from "@memberjunction/global";
import { OpenAI } from "openai";

@RegisterClass(Embeddings, 'OpenAIEmbedding')
export class OpenAIEmbedding extends Embeddings {
    static _openAI: OpenAI;

    constructor(apiKey: string) {
        super(apiKey);

        if (!OpenAIEmbedding._openAI){
            OpenAIEmbedding._openAI = new OpenAI({
                apiKey: apiKey,
            });
        }
    }

    public async EmbedText(params: EmbedParams): Promise<EmbedResult> {
        let body: OpenAI.Embeddings.EmbeddingCreateParams = {
            input: params.text,
            model: params.model
        }

        let response = await OpenAIEmbedding._openAI.embeddings.create(body);

        return {
            object: 'object',
            model: response.model,
            ModelUsage: new ModelUsage(response.usage.prompt_tokens, 0),
            data: response.data[0].embedding
        }
    }
}

export function LoadOpenAIEmbedding() {
    // this does nothing but prevents the class from being removed by the tree shaker
}