import { GetAIAPIKey } from "@memberjunction/ai";
import { VectorSyncBase } from "./generic/vectorSyncBase";
import { MistralLLM } from "@memberjunction/ai-mistral";
import { PineconeDatabase } from "@memberjunction/ai-vectors-pinecone";
import { RunViewResult, PotentialDuplicate, PotentialDuplicateRequest, PotentialDuplicateResponse, PrimaryKeyValueBase, PrimaryKeyValue, Metadata, RunView, UserInfo, LogError } from "@memberjunction/core";
import { EntityDocument } from "./generic/entity.types";
import { LogStatus } from "@memberjunction/core";

export class DuplicateRecordDetector extends VectorSyncBase {
    public async getDuplicateRecords(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {        

        this._contextUser = contextUser;

        if(!this._contextUser){
            LogError("Context User not found, using default");
            const md = new Metadata();
            this._contextUser = md.CurrentUser;
        }
        
        if(!this._runView){
            this._runView = new RunView();
        }

        const pineconeAPIKey = GetAIAPIKey("PineconeDatabase");

        //LogStatus("Pinecone API Key: ", pineconeAPIKey);

        const mistralAPIKey = GetAIAPIKey("MistralLLM");
        //LogStatus("Mistral API Key: ", mistralAPIKey);

        this._pineconeDB = new PineconeDatabase(pineconeAPIKey);
        this._embedding = new MistralLLM(mistralAPIKey); 
        this._languageModel = new MistralLLM(mistralAPIKey);
        
        //first get the entity document
        const entitiyDocument: EntityDocument = await this.getEntityDocumennt(params.EntityDocumentID);
        LogStatus("Entity Document: " + entitiyDocument);
        
        if(!entitiyDocument){
            LogStatus("Entity Document not found");
            return { EntityID: params.EntityDocumentID, Duplicates: [] };
        }

        LogStatus("Registering class", entitiyDocument.Type);

        //then get the entity we are looking for duplicates of
        const entityRecord = await this.getEntityRecord(entitiyDocument.Type, params.PrimaryKeyValues);
        LogStatus("Entity Record: ", entityRecord);

        if(!entityRecord){
            LogStatus("Entity Record not found");
            return { EntityID: entitiyDocument.EntityID, Duplicates: [] };
        }

        //create an embedding of the record
        const template = super.parseStringTemplate(entitiyDocument.Template, entityRecord);
        const embedding = await this._languageModel.EmbedText({ text: template, model: "mistral-embed" });

        const vector: number[] = embedding.data;

        //using the vector, get a list of up to 10 potential duplicates
        const topK: number = 10;
        const queryResult = await this._pineconeDB.queryIndex({vector: vector, topK: topK, includeMetadata: true, includeValues: true });

        return this.processDuplicateRecords(queryResult.data.matches, entitiyDocument);
    }

    private async getEntityDocumennt(id: number): Promise<EntityDocument | null> {
        const rvResult: RunViewResult = await this._runView.RunView({
            EntityName: "Entity Documents",
            ExtraFilter: `ID = '${id}'`
        },this._contextUser);

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
        const rvResult: RunViewResult = await this._runView.RunView({
            EntityName: entityName,
            ExtraFilter: this.buildExtraFilter(keyValues)
        }, this._contextUser);

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
    private processDuplicateRecords(queryResult: any, entityDocument: EntityDocument): PotentialDuplicateResponse {
        let results: PotentialDuplicateResponse = {
            EntityID: entityDocument.EntityID,
            Duplicates: []
        };

        for(let duplicate of queryResult){

            LogError(JSON.stringify(duplicate));
            if(duplicate.score > 1){
                //this is likely the record we wanted duplicates of
                continue;
            }

            let potentialDuplicate: PotentialDuplicate = new PotentialDuplicate();
            potentialDuplicate.PrimaryKeyValues = [];
            potentialDuplicate.PrimaryKeyValues.push({
                FieldName: "ID",
                Value: duplicate.id
            });
            potentialDuplicate.ProbabilityScore = duplicate.score;
            results.Duplicates.push(potentialDuplicate);
        }

        return results;
    }
}