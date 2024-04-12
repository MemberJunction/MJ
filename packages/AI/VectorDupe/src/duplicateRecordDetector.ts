import { Embeddings, GetAIAPIKey } from "@memberjunction/ai";
import { RunViewResult, PotentialDuplicate, PotentialDuplicateRequest, PotentialDuplicateResponse, PrimaryKeyValueBase, PrimaryKeyValue, Metadata, RunView, UserInfo, LogError } from "@memberjunction/core";
import { EntityDocument } from "./generic/entity.types";
import { LogStatus } from "@memberjunction/core";
import { VectorDBBase } from "@memberjunction/ai-vectordb";
import { MJGlobal } from "@memberjunction/global";
import { AIModelEntity, AIModelEntityExtended, EntityDocumentEntity, EntityEntity, EntityFieldEntity, VectorDatabaseEntity } from "@memberjunction/core-entities";
import { AIEngine } from "@memberjunction/aiengine";

export class DuplicateRecordDetector {

    _contextUser: UserInfo;
    _runView: RunView;
    _vectorDB: VectorDBBase;
    _embedding: Embeddings

    public async getDuplicateRecords(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {        
        const md = new Metadata();
        if(!this._contextUser){
            this._contextUser = contextUser || md.CurrentUser;
        }

        if(!this._runView){
            this._runView = new RunView();
        }

        const vectorDB: VectorDatabaseEntity = this.GetVectorDatabase();
        const aiModel: AIModelEntity = this.GetAIModel();

        let entityDocument: EntityDocumentEntity | null = null;
        if(params.EntityDocumentID){
            entityDocument = await this.getEntityDocument(params.EntityDocumentID);
        }
        else {
            entityDocument = await this.getFirstActiveEntityDocumentForEntity(params.EntityID);
            if(!entityDocument){
                LogStatus(`No active Entity Document found for entity ${params.EntityID}, creating one`);
                entityDocument = await this.createEntityDocumentForEntity(params.EntityID, vectorDB.ID, aiModel.ID);
            }
        }

        let results: PotentialDuplicateResponse = {
            EntityID: entityDocument.EntityID,
            Duplicates: []
        };

        return results;

        /*
        if(!entityDocument){
            let results: PotentialDuplicateResponse = {
                EntityID: entityDocument.EntityID,
                Duplicates: []
            };

            return results;
        }

        const aiModel: AIModelEntity = this.GetAIModel();
        const vectorDB: VectorDatabaseEntity = this.GetVectorDatabase();
        const embeddingAPIKey: string = GetAIAPIKey(aiModel.DriverClass);
        const vectorDBAPIKey: string = GetAIAPIKey(vectorDB.ClassKey);

        LogStatus("Embedding API Key: ", embeddingAPIKey);
        LogStatus("Vector Database API Key: ", vectorDBAPIKey);

        this._embedding = MJGlobal.Instance.ClassFactory.CreateInstance<Embeddings>(Embeddings, aiModel.DriverClass, embeddingAPIKey)
        this._vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, vectorDB.ClassKey, vectorDBAPIKey);

        if(!entityDocument){
            LogStatus("Entity Document not found");
            return { EntityID: params.EntityDocumentID, Duplicates: [] };
        }

        //then get the entity we are looking for duplicates of
        const entityRecord = await this.getEntityRecord(entityDocument.Type, params.RecordIDs);

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
        */
    }

    private async getEntityDocument(id: number): Promise<EntityDocumentEntity | null> {
        const entityDocument: EntityDocument = await this.runViewForSingleValue<EntityDocument>("Entity Documents", `ID = ${id}`);
        if(!entityDocument){
            LogError(`Entity Document with ID ${id} not found`);
            return null;
        }

        const md: Metadata = new Metadata();
        let EDEntity: EntityDocumentEntity = await md.GetEntityObject<EntityDocumentEntity>("Entity Documents");
        for(const [key, value] of Object.entries(entityDocument)){
            EDEntity.Set(key, value);
        }

        return EDEntity;
    }

    private async getFirstActiveEntityDocumentForEntity(entityID: number): Promise<EntityDocumentEntity | null> {
        const entityDocument: EntityDocument = await this.runViewForSingleValue<EntityDocument>("Entity Documents", `EntityID = ${entityID} AND TypeID = 9 AND Status = 'Active'`);
        if(!entityDocument){
            LogError(`No active Entity Document with entityID ${entityID} found`);
            return null;
        }

        const md: Metadata = new Metadata();
        let EDEntity: EntityDocumentEntity = await md.GetEntityObject<EntityDocumentEntity>("Entity Documents");
        EDEntity.SetMany(entityDocument);
        return EDEntity;
    }

    private async createEntityDocumentForEntity(entityID: number, vectorDatabaseID: number, AIModelID: number): Promise<EntityDocumentEntity | null> {

        const entity: EntityEntity = await this.runViewForSingleValue<EntityEntity>("Entities", `ID = ${entityID}`);
        if(!entity){
            LogError(`Entity with ID ${entityID} not found`);
            return null;
        }

        const rvResult = await this._runView.RunView({
            EntityName: "Entity Fields", 
            ExtraFilter: `EntityID = ${entityID} AND AutoIncrement = 0 AND DefaultInView = 1`
        }, this._contextUser);

        if(!rvResult.Success){
            LogError(rvResult.ErrorMessage);
            return null;
        }
        else if(rvResult.RowCount === 0){
            LogError(`No fields found for entity ${entity.Name}`);
            return null;
        }

        const entityFields = rvResult.Results as EntityFieldEntity[];
        const EDTemplate: string = entityFields.map(entityField => {
            return `${entityField.Name}: \$\{${entityField.Name}\}`;
        }).join(" ");

        const md: Metadata = new Metadata();
        const entityDocument: EntityDocumentEntity = await md.GetEntityObject<EntityDocumentEntity>("Entity Documents");
        entityDocument.NewRecord();
        entityDocument.Set("Name", `Duplicate Record Entity Document for ${entity.Name}`);
        entityDocument.Set("EntityID", entityID);
        entityDocument.Set("TypeID", 9); //hardcoded, but we know that 9 is the ID for Record Duplicates
        entityDocument.Set("Status", "Active");
        entityDocument.Set("Template", EDTemplate);
        entityDocument.Set("VectorDatabaseID", vectorDatabaseID);
        entityDocument.Set("AIModelID", AIModelID);
        LogStatus(`${AIModelID}`);
        entityDocument.ContextCurrentUser = this._contextUser;
        let saveResult = await entityDocument.Save();
        if(saveResult){
            return entityDocument;
        }
        else{
            LogError(`Failed to save Entity Document for ${entityID}`);
            return null;
        }
    }

    private async getEntityRecord(entityName: string, keyValues: PrimaryKeyValueBase[]): Promise<any> {
        if(!keyValues || keyValues.length === 0){
            return null;
        }

        const rvResult: RunViewResult = await this._runView.RunView({
            EntityName: entityName,
            ExtraFilter: this.buildExtraFilter(keyValues[0].PrimaryKeyValues)
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

    /**
     * Brabs the first AI model that is of type 3 (Embeddings). 
     */
    protected GetAIModel(): AIModelEntityExtended {
        /*elim this hardcoding by adding virtual field for Type to AI Models entity*/
        const model: AIModelEntityExtended = AIEngine.Models.find(m => m.AIModelTypeID === 1);
        if(!model){
            throw new Error("No AI Model found");
        }
        return model;
    }

    /**
     * Grabs the first vector database
     */
    protected GetVectorDatabase(): VectorDatabaseEntity {
        if(AIEngine.VectorDatabases.length > 0){
            return AIEngine.VectorDatabases[0];
        }
        else{
            throw new Error("No Vector Databases found");
        }
    }

    private async runViewForSingleValue<T>(entityName: string, extraFilter: string): Promise<T | null> {
        const rvResult = await this._runView.RunView({
            EntityName: entityName,
            ExtraFilter: extraFilter
        }, this._contextUser);

        if(rvResult.Success){
            return rvResult.RowCount > 0 ? <T>rvResult.Results[0] : null;
        }
        else{
            LogError(rvResult.ErrorMessage);
            return null;
        }
    }
}