import { GetAIAPIKey } from "@memberjunction/ai";
import { DuplicateRecordSearchParams, DuplicateRecordSearchResult } from "./generic/duplicateRecords.type";
import { VectorSyncBase } from "./generic/vectorSyncBase";
import { MistralLLM } from "@memberjunction/ai-mistral";
import { PineconeDatabase } from "@memberjunction/ai-vectors-pinecone";
import { RunViewResult } from "@memberjunction/core";
import { EntityDocument } from "./generic/entity.types";

export class DuplicateRecordDetector extends VectorSyncBase {
    public async getDuplicateRecords(params: DuplicateRecordSearchParams): Promise<DuplicateRecordSearchResult> {
        this.start();
        await this.setupDBConnection();

        console.log("Connected to SQL Server");
        console.log("Syncing entities...");

        const pineconeAPIKey = GetAIAPIKey("PineconeDatabase");

        //console.log("Pinecone API Key: ", pineconeAPIKey);

        const mistralAPIKey = GetAIAPIKey("MistralLLM");
        //console.log("Mistral API Key: ", mistralAPIKey);

        this._pineconeDB = new PineconeDatabase(pineconeAPIKey);
        this._embedding = new MistralLLM(mistralAPIKey); 
        this._languageModel = new MistralLLM(mistralAPIKey);
        
        const entitiyDocument: EntityDocument=  await this.getEntityDocumennt(params.entitiyDocumentID);
        console.log("Entity Document: ", entitiyDocument);
        
        if(!entitiyDocument){
            console.log("Entity Document not found");
            return { entityID: entitiyDocument.EntityID, duplicates: [] };
        }

        console.log("Registering class", entitiyDocument.Type);

        const entityRecord = await this.getEntityRecord({ entityName: entitiyDocument.Type, recordID: params.recordID });
        console.log("Entity Record: ", entityRecord);

        if(!entityRecord){
            console.log("Entity Record not found");
            return { entityID: entitiyDocument.EntityID, duplicates: [] };
        }

        const template = super.parseStringTemplate(entitiyDocument.Template, entityRecord);
        const embedding = await this._languageModel.EmbedText({ text: template, model: "mistral-embed" });

        const vector: number[] = embedding.data;

        const topK = params.limit || 10;
        const queryResult = await this._pineconeDB.queryRecords({vector: vector, topK: topK, includeMetadata: true, includeValues: true });

        return this.processDuplicateRecords(queryResult.data.matches, entitiyDocument);
    }

    private async getEntityDocumennt(id: number): Promise<EntityDocument | null> {
        const rvResult: RunViewResult = await this._runView.RunView({
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

    private async getEntityRecord(params: {entityName: string, recordID: number}): Promise<any> {
        const rvResult: RunViewResult = await this._runView.RunView({
            EntityName: params.entityName,
            ExtraFilter: `ID = '${params.recordID}'`
        }, this._userInfo);

        if(!rvResult || rvResult.RowCount === 0){
            
            return null;
        }
        else{
            const vdResults = rvResult?.Results as any[];
            const entityDocument: EntityDocument = vdResults[0];
            return entityDocument;
        }
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