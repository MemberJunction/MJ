import { Embeddings, GetAIAPIKey } from "@memberjunction/ai";
import { RunViewResult, PotentialDuplicate, PotentialDuplicateRequest, PotentialDuplicateResponse, PrimaryKeyValue, Metadata, RunView, UserInfo, LogError } from "@memberjunction/core";
import { EntityDocument } from "./generic/entity.types";
import { LogStatus } from "@memberjunction/core";
import { VectorDBBase } from "@memberjunction/ai-vectordb";
import { MJGlobal } from "@memberjunction/global";
import { AIModelEntity, VectorDatabaseEntity } from "@memberjunction/core-entities";
import { AIEngine } from "@memberjunction/aiengine";

export class DuplicateRecordDetector {

    _contextUser: UserInfo;
    _runView: RunView;
    _vectorDB: VectorDBBase;
    _embedding: Embeddings

    /**
     * Default implementation simply grabs the first AI model that is of type 1 (Embeddings).
     * @returns 
     */
    protected GetAIModel(): AIModelEntity {
        const model = AIEngine.Models.find(m => m.AIModelTypeID === 3/*elim this hardcoding by adding virtual field for Type to AI Models entity*/)
        return model;
    }

    /**
     * Default implementation simply grabs the first vector database
     * @returns 
     */
    protected GetVectorDatabase(): VectorDatabaseEntity {
        if(AIEngine.VectorDatabases.length > 0){
            return AIEngine.VectorDatabases[0];
        }
        else{
            throw new Error("No Vector Databases found");
        }
    }

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

        const aiModel: AIModelEntity = this.GetAIModel();
        const vectorDB: VectorDatabaseEntity = this.GetVectorDatabase();
        const embeddingAPIKey: string = GetAIAPIKey(aiModel.DriverClass);
        const vectorDBAPIKey: string = GetAIAPIKey(vectorDB.ClassKey);

        LogStatus("Embedding API Key: ", embeddingAPIKey);
        LogStatus("Vector Database API Key: ", vectorDBAPIKey);

        this._embedding = MJGlobal.Instance.ClassFactory.CreateInstance<Embeddings>(Embeddings, aiModel.DriverClass, embeddingAPIKey)
        this._vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, vectorDB.ClassKey, vectorDBAPIKey);

        
        //first get the entity document
        const entityDocument: EntityDocument = await this.getEntityDocumennt(params.EntityDocumentID);
        LogStatus("Entity Document: " + entityDocument);
        
        if(!entityDocument){
            LogStatus("Entity Document not found");
            return { EntityID: params.EntityDocumentID, Duplicates: [] };
        }

        //then get the entity we are looking for duplicates of
        const entityRecord = await this.getEntityRecord(entityDocument.Type, params.PrimaryKeyValues);

        if(!entityRecord){
            LogStatus("Entity Record not found");
            return { EntityID: entityDocument.EntityID, Duplicates: [] };
        }

        //create an embedding of the record
        const template = this.parseStringTemplate(entityDocument.Template, entityRecord);
        const embedding = await this._embedding.EmbedText({ text: template, model: "mistral-embed" });

        const vector: number[] = embedding.data;

        //using the vector, get a list of up to 10 potential duplicates
        const topK: number = 10;
        const queryResult = await this._vectorDB.queryIndex({vector: vector, topK: topK, includeMetadata: true, includeValues: true });

        return this.processDuplicateRecords(queryResult.data.matches, entityDocument);
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

    protected parseStringTemplate(str: string, obj: any): string {
        //Split string into non-argument textual parts
        let parts = str.split(/\$\{(?!\d)[\wæøåÆØÅ]*\}/);
    
        //Split string into property names. Empty array if match fails.
        let args = str.match(/[^{\}]+(?=})/g) || [];
    
        //Map parameters from obj by property name. Solution is limited by shallow one level mapping. 
        //Undefined values are substituted with an empty string, but other falsy values are accepted.
        let parameters = args.map(argument => obj[argument] || (obj[argument] === undefined ? "" : obj[argument]));
        return String.raw({ raw: parts }, ...parameters);
    }
}