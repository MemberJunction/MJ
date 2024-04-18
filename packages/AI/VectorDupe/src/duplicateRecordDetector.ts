import { Embeddings, GetAIAPIKey } from "@memberjunction/ai";
import { PotentialDuplicateRequest, PotentialDuplicateResponse, PrimaryKeyValueBase, PrimaryKeyValue, Metadata, RunView, UserInfo, LogError, BaseEntity } from "@memberjunction/core";
import { EntityDocument } from "./generic/entity.types";
import { LogStatus } from "@memberjunction/core";
import { VectorDBBase } from "@memberjunction/ai-vectordb";
import { MJGlobal } from "@memberjunction/global";
import { AIModelEntity, AIModelEntityExtended, EntityDocumentEntity, EntityEntity, VectorDatabaseEntity } from "@memberjunction/core-entities";
import { AIEngine } from "@memberjunction/aiengine";

export class DuplicateRecordDetector {

    _contextUser: UserInfo;
    _runView: RunView;
    _vectorDB: VectorDBBase;
    _embedding: Embeddings;

    public async getDuplicateRecords(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse[]> {        
        this._contextUser = contextUser;
        if(!this._runView){
            this._runView = new RunView();
        }

        params.EntityDocumentID = 12;

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

        let results: PotentialDuplicateResponse[] = params.RecordIDs.map((recordID) => {
            let response: PotentialDuplicateResponse = new PotentialDuplicateResponse();
            response.EntityID = entityDocument.EntityID;
            response.Duplicates = [];
            response.RecordPrimaryKeys = recordID;
            return response;
        });

        if(!entityDocument){
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

        //LogStatus(`Embedding API Key: ${embeddingAPIKey} VectorDB API Key: ${vectorDBAPIKey}`);
        this._embedding = MJGlobal.Instance.ClassFactory.CreateInstance<Embeddings>(Embeddings, aiModel.DriverClass, embeddingAPIKey)
        this._vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, vectorDB.ClassKey, vectorDBAPIKey);

        if(!this._embedding){
            throw Error(`Failed to create Embeddings instance for AI Model ${aiModel.DriverClass}`);
        }

        if(!this._vectorDB){
            throw Error(`Failed to create Vector Database instance for ${vectorDB.ClassKey}`);
        }

        let records = await this.GetRecordsByEntityID(params.EntityID, params.RecordIDs);

        const recordTemplates: string[] = records.map((record: BaseEntity) => {
            return this.parseStringTemplate(entityDocument.Template, record);
        });

        let embedTextsResult = await this._embedding.EmbedTexts({ texts: recordTemplates, model: null });        

        const topK: number = 5;
        results = [];
        for (const [index, vector] of embedTextsResult.vectors.entries()){
            let queryResult = await this._vectorDB.getVectorDuplicates({ vector: vector, topK: topK, includeMetadata: true, includeValues: false });
            if(queryResult.success){
                let response: PotentialDuplicateResponse = queryResult.data as PotentialDuplicateResponse;
                //const compositeKey: string = params.RecordIDs[index].GetCompositeKey();
                //LogStatus(`Query result for ${compositeKey} returned ${response.Duplicates.length} potential duplicates`);
                response.EntityID = entityDocument.EntityID;
                response.RecordPrimaryKeys = params.RecordIDs[index];
                results.push(response);
            }
        }

        return results;
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

    private async GetRecordsByEntityID(entityID: number, recordIDs: PrimaryKeyValueBase[]): Promise<BaseEntity[]> {
        const rvResult = await this._runView.RunView({
            EntityName: "Entities",
            ExtraFilter: `ID = ${entityID}`
        }, this._contextUser);

        if(!rvResult.Success){
            throw new Error(rvResult.ErrorMessage);
        }

        const entity: EntityEntity = rvResult.Results[0] as EntityEntity;
        const rvResult2 = await this._runView.RunView({
            EntityName: entity.Name,
            ExtraFilter: this.buildExtraFilter(recordIDs),
            ResultType: 'entity_object'
        }, this._contextUser);

        if(!rvResult2.Success){
            throw new Error(rvResult2.ErrorMessage);
        }

        return rvResult2.Results;
    }

    private buildExtraFilter(keyValues: PrimaryKeyValueBase[]): string {
        return keyValues.map((keyValue) => {
            return keyValue.PrimaryKeyValues.map((keys: PrimaryKeyValue) => {
                return `${keys.FieldName} = '${keys.Value}'`;
            }).join(" AND ");
        }).join("\n OR ");
    }

    private async createEntityDocumentForEntity(entityID: number, vectorDatabase: VectorDatabaseEntity, AIModel: AIModelEntity): Promise<EntityDocumentEntity | null> {

        const entity: EntityEntity = await this.runViewForSingleValue<EntityEntity>("Entities", `ID = ${entityID}`);
        if(!entity){
            LogError(`Entity with ID ${entityID} not found`);
            return null;
        }

        const rvResult = await this._runView.RunView({
            EntityName: "Entity Fields", 
            ExtraFilter: `EntityID = ${entityID}`
        }, this._contextUser);

        if(!rvResult.Success){
            LogError(rvResult.ErrorMessage);
            return null;
        }
        else if(rvResult.RowCount === 0){
            LogError(`No fields found for entity ${entity.Name}`);
            return null;
        }

        const entityFields = rvResult.Results;
        const EDTemplate: string = entityFields.map(entityField => {
            return `${entityField.Name}: \$\{${entityField.Name}\}`;
        }).join(" ");

        const md: Metadata = new Metadata();
        const entityDocument: EntityDocumentEntity = await md.GetEntityObject<EntityDocumentEntity>("Entity Documents");
        entityDocument.NewRecord();
        entityDocument.Set("Name", `Default duplicate record Entity Document for the ${entity.Name} entity using vector database ${vectorDatabase.Name} and AI Model ${AIModel.Name}`);
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