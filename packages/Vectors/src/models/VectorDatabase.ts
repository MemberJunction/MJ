import OpenAI, { Configuration, OpenAIApi } from "openai";
import { VectorDatabaseBase } from "../generic/VectorDatabaseBase";
import { openAIAPIKey } from "../config";
import { EmbeddingBase } from "../generic/EmbeddingBase";

export class VectorDatabase implements VectorDatabaseBase, EmbeddingBase {
    static _openAI: OpenAIApi;
    constructor(){
        if(!VectorDatabase._openAI){
            const config: OpenAI.Configuration = new Configuration({
                apiKey: openAIAPIKey
            });
            VectorDatabase._openAI = new OpenAIApi(config); 
        }
    }

    get openAI(): OpenAIApi { return VectorDatabase._openAI };

    public async createEmbedding(text: string): Promise<OpenAI.CreateEmbeddingResponse> {
        try{
            const request: OpenAI.CreateEmbeddingRequest = {
                model: EmbeddingModels.Ada002,
                input: text
            }

            const AxiosResponse = await this.openAI.createEmbedding(request);
            const data: OpenAI.CreateEmbeddingResponse = AxiosResponse.data;
            return data;
        }
        catch(error){
            console.log("error creating embedding:", error);
            return null;
        }
    }
}

export const EmbeddingModels = {
        Small: "text-embedding-3-small",
        Large: "text-embedding-3-large",
        Ada002: "text-embedding-ada-002"
}