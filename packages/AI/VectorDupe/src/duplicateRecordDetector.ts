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

        let entityDocument: EntityDocumentEntity | null = null;
        if(params.EntityDocumentID){
            entityDocument = await this.getEntityDocument(params.EntityDocumentID);
        }
        else {
            entityDocument = await this.getFirstActiveEntityDocumentForEntity(params.EntityID);
            if(!entityDocument){
                LogStatus(`No active Entity Document found for entity ${params.EntityID}, creating one`);
                const defaultVectorDB: VectorDatabaseEntity = this.GetVectorDatabase();
                const defaultAIModel: AIModelEntity = this.GetAIModel();
                entityDocument = await this.createEntityDocumentForEntity(params.EntityID, defaultVectorDB, defaultAIModel);
            }
        }

        if(!entityDocument){
            let results: PotentialDuplicateResponse = {
                EntityID: entityDocument.EntityID,
                Duplicates: []
            };

            return results;
        }

        LogStatus(`Using vector database ${entityDocument.VectorDatabaseID} and AI Model ${entityDocument.AIModelID}`);

        const vectorDB: VectorDatabaseEntity = this.GetVectorDatabase(entityDocument.VectorDatabaseID);
        const aiModel: AIModelEntity = this.GetAIModel(entityDocument.AIModelID);

        LogStatus(`AIModel driver class: ${aiModel.DriverClass}`);
        LogStatus(`VectorDB class key: ${vectorDB.ClassKey}`);

        const embeddingAPIKey: string = GetAIAPIKey(aiModel.DriverClass);
        const vectorDBAPIKey: string = GetAIAPIKey(vectorDB.ClassKey);

        if(!embeddingAPIKey){
            throw Error(`No API Key found for AI Model ${aiModel.DriverClass}`);
        }

        if(!vectorDBAPIKey){
            throw Error(`No API Key found for Vector Database ${vectorDB.ClassKey}`);
        }

        LogStatus(`Embedding API Key: ${embeddingAPIKey} VectorDB API Key: ${vectorDBAPIKey}`);

        let reg = MJGlobal.Instance.ClassFactory.GetAllRegistrations(Embeddings);
        LogStatus(JSON.stringify(reg));
        
        let dbreg = MJGlobal.Instance.ClassFactory.GetAllRegistrations(VectorDBBase);
        LogStatus(JSON.stringify(dbreg));

        this._embedding = MJGlobal.Instance.ClassFactory.CreateInstance<Embeddings>(Embeddings, aiModel.DriverClass, embeddingAPIKey)
        this._vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, vectorDB.ClassKey, vectorDBAPIKey);

        LogStatus(typeof this._embedding);
        LogStatus(typeof this._vectorDB);

        let test = await this._embedding.EmbedText({ text: "test", model: "test" });
        LogStatus(test);

        let results: PotentialDuplicateResponse = {
            EntityID: entityDocument.EntityID,
            Duplicates: []
        };

        return results;

        /*
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

    private async createEntityDocumentForEntity(entityID: number, vectorDatabase: VectorDatabaseEntity, AIModel: AIModelEntity): Promise<EntityDocumentEntity | null> {

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
        entityDocument.Set("Name", `Duplicate Record Entity Document for the ${entity.Name} entity using vector database ${vectorDatabase.Name} and AI Model ${AIModel.Name}`);
        entityDocument.Set("EntityID", entityID);
        entityDocument.Set("TypeID", 9); //hardcoded, but we know that 9 is the ID for Record Duplicates
        entityDocument.Set("Status", "Active");
        entityDocument.Set("Template", EDTemplate);
        entityDocument.Set("VectorDatabaseID", vectorDatabase.ID);
        entityDocument.Set("AIModelID", AIModel.ID);
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

    protected GetAIModel(id?: number): AIModelEntityExtended {
        /*elim this hardcoding by adding virtual field for Type to AI Models entity*/
        let model: AIModelEntityExtended;
        if(id){
            model = AIEngine.Models.find(m => m.AIModelTypeID === 3 && m.ID === id);
        }
        else{
            model = AIEngine.Models.find(m => m.AIModelTypeID === 3);
        }

        if(!model){
            throw new Error("No AI Model found");
        }
        return model;
    }

    protected GetVectorDatabase(id?: number): VectorDatabaseEntity {
        if(AIEngine.VectorDatabases.length > 0){
            if(id){
                let vectorDB = AIEngine.VectorDatabases.find(vd => vd.ID === id);
                if(vectorDB){
                    return vectorDB;
                }
            }
            else{
                return AIEngine.VectorDatabases[0];
            }
        }

        throw new Error("No Vector Databases found");
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