import { RegisterClass } from "@memberjunction/global";
import { IEmbeddingBase } from "../generic/IEmbeddingBase";
import { MistralAIEmbeddings } from "@langchain/mistralai";

@RegisterClass(MistralAIEmbedding)
export class MistralAIEmbedding implements IEmbeddingBase {
    private static _mistralClient: MistralAIEmbeddings;

    public constructor(apiKey: string) {
        if(!MistralAIEmbedding._mistralClient){
            MistralAIEmbedding._mistralClient = new MistralAIEmbeddings({
                apiKey: apiKey,
            });
        }
    }

    public get mistralClient(): MistralAIEmbeddings { return MistralAIEmbedding._mistralClient };

    public async createEmbedding(text: string, options?: any): Promise<number[]> {
        try{
            const embeddingRes: number[] = await this.mistralClient.embedQuery(text);
            return embeddingRes;
        }
        catch(error){
            console.log("error creating embedding:", error);
            return null;
        }
    }

    public async createBatchEmbedding(text: string[], options?: any): Promise<number[][]> {
        try{
            const embeddingRes: number[][] = await this.mistralClient.embedDocuments(text);
            return embeddingRes;
        }
        catch(error){
            console.log("error creating embedding:", error);
            return null;
        }
    }
}