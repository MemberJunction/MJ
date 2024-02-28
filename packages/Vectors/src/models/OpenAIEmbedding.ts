import OpenAI, { Configuration, OpenAIApi } from "openai";
import { IEmbedding } from "../generic/IEmbedding";
import { RegisterClass } from '@memberjunction/global'

@RegisterClass(OpenAIEmbedding)
export class OpenAIEmbedding implements IEmbedding {
    static _openAI: OpenAIApi;

    constructor(openAIAPIKey: string){
        if(!OpenAIEmbedding._openAI){
            const config: OpenAI.Configuration = new Configuration({
                apiKey: openAIAPIKey
            });
            OpenAIEmbedding._openAI = new OpenAIApi(config); 
        }
    }

    private get openAI(): OpenAIApi { return OpenAIEmbedding._openAI };

    createBatchEmbedding(text: string[], options?: any) {
        throw new Error("Method not implemented.");
    }

    public async createEmbedding(text: string, options?: any): Promise<OpenAI.CreateEmbeddingResponse> {
        try{
            const request: OpenAI.CreateEmbeddingRequest = {
                model: options?.model || EmbeddingModels.Ada002,
                input: text
            }

            const AxiosResponse = await this.openAI.createEmbedding(request);
            const data: OpenAI.CreateEmbeddingResponse = AxiosResponse.data;
            return data;
        }
        catch(error){
            console.log("error creating embedding:", error.response.data);
            return null;
        }
    }
}

export const EmbeddingModels = {
        Small: "text-embedding-3-small",
        Large: "text-embedding-3-large",
        Ada002: "text-embedding-ada-002"
}