import { GetAIAPIKey } from "@memberjunction/ai";
import { VectorSyncBase } from "./generic/vectorSyncBase";
import { MistralLLM } from "@memberjunction/ai-mistral";
import { PineconeDatabase } from "@memberjunction/ai-vectors-pinecone";
import { RunViewResult, PotentialDuplicate, PotentialDuplicateRequest, PotentialDuplicateResponse, PrimaryKeyValueBase, PrimaryKeyValue } from "@memberjunction/core";
import { EntityDocument } from "./generic/entity.types";

export class DuplicateRecordDetector extends VectorSyncBase {
    public async getDuplicateRecords(params: PotentialDuplicateRequest): Promise<PotentialDuplicateResponse> {
        this.start();

        console.log("Connected to SQL Server");
        console.log("Syncing entities...");

        const pineconeAPIKey = GetAIAPIKey("PineconeDatabase");

        //console.log("Pinecone API Key: ", pineconeAPIKey);

        const mistralAPIKey = GetAIAPIKey("MistralLLM");
        //console.log("Mistral API Key: ", mistralAPIKey);

        this._pineconeDB = new PineconeDatabase(pineconeAPIKey);
        this._embedding = new MistralLLM(mistralAPIKey); 
        this._languageModel = new MistralLLM(mistralAPIKey);
        
        const entitiyDocument: EntityDocument=  await this.getEntityDocumennt(params.EntityDocumentID);
        console.log("Entity Document: ", entitiyDocument);
        
        if(!entitiyDocument){
            console.log("Entity Document not found");
            return { EntityID: entitiyDocument.EntityID, Duplicates: [] };
        }

        console.log("Registering class", entitiyDocument.Type);

        const entityRecord = await this.getEntityRecord(entitiyDocument.Type, params.PrimaryKeyValues);
        console.log("Entity Record: ", entityRecord);

        if(!entityRecord){
            console.log("Entity Record not found");
            return { EntityID: entitiyDocument.EntityID, Duplicates: [] };
        }

        const template = super.parseStringTemplate(entitiyDocument.Template, entityRecord);
        const embedding = await this._languageModel.EmbedText({ text: template, model: "mistral-embed" });

        const vector: number[] = embedding.data;

        const topK = params.limit || 10;
        const queryResult = await this._pineconeDB.queryRecords({vector: vector, topK: topK, includeMetadata: true, includeValues: true });

        return this.processDuplicateRecords(queryResult.data.matches, entitiyDocument);
    }

    private async getEntityDocumennt(id: number): Promise<EntityDocument | null> {
        const rvResult: RunViewResult = await this._provider.RunView({
            EntityName: "Entity Documents",
            ExtraFilter: `ID = '${id}'`
        });

        if(!rvResult || rvResult.RowCount === 0){
            
            return null;
        }
        else{
            const vdResults = rvResult?.Results as any[];
            const entityDocument: EntityDocument = vdResults[0];
            return entityDocument;
        }
    }

    private async getEntityRecord(entityName: string, keyValues: PrimaryKeyValue[]): Promise<any> {
        const rvResult: RunViewResult = await this._provider.RunView({
            EntityName: entityName,
            ExtraFilter: this.buildExtraFilter(keyValues)
        });

        if(!rvResult || rvResult.RowCount === 0){
            
            return null;
        }
        else{
            const vdResults = rvResult?.Results as any[];
            const entityDocument: EntityDocument = vdResults[0];
            return entityDocument;
        }
    }

    private buildExtraFilter(keyValues: PrimaryKeyValue[]): string {
        return keyValues.map((keyValue, index) => {
            return keyValue.FieldName + " = " + keyValue.Value;
        }).join(" AND ");
    }

    //this is specific to pinecone, should be moved there
    private processDuplicateRecords(queryResult: any, entityDocument: EntityDocument): DuplicateRecordSearchResult {
        let results: DuplicateRecordSearchResult = {
            entityID: entityDocument.EntityID,
            duplicates: []
        };

        for(let duplicate of queryResult){

            if(duplicate.score > 1){
                //this is likely the record we wanted duplicates of
                continue;
            }

            results.duplicates.push({
                recordID: Number(duplicate.id),
                score: duplicate.score
            });

        }

        return results;
    }
}