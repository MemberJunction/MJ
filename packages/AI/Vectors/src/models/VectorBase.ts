import { Embeddings, GetAIAPIKey } from "@memberjunction/ai";
import { VectorDBBase } from "@memberjunction/ai-vectordb";
import { AIEngine } from "@memberjunction/aiengine";
import { BaseEntity, LogError, LogStatus, Metadata, PrimaryKeyValue, PrimaryKeyValueBase, RunView, UserInfo } from "@memberjunction/core";
import { AIModelEntity, AIModelEntityExtended, EntityDocumentEntity, EntityEntity, VectorDatabaseEntity } from "@memberjunction/core-entities";
import { MJGlobal } from "@memberjunction/global";

export class VectorBase {
    _runView: RunView;
    _metadata: Metadata;
    _currentUser: UserInfo;

    constructor() {
        this._runView = new RunView();
        this._metadata = new Metadata();
        this._currentUser = this._metadata.CurrentUser;
    }

    public get Metadata(): Metadata { return this._metadata; }
    public get RunView(): RunView { return this._runView; }
    public get CurrentUser(): UserInfo { return this._currentUser; }
    public set CurrentUser(user: UserInfo) { this._currentUser = user; }

    protected async getVectorDatabaseAndEmbeddingClassByEntityDocumentID(entityDocumentID: number, createDocumentIfNotFound: boolean = true): Promise<{embedding: Embeddings, vectorDB: VectorDBBase}> {
        let entityDocument: EntityDocumentEntity | null = await this.getEntityDocument(entityDocumentID) || await this.getFirstActiveEntityDocumentForEntity(entityDocumentID);
        if(!entityDocument){
            if(createDocumentIfNotFound){
                if(!entityDocument){
                    LogStatus(`No active Entity Document found for entity ${entityDocumentID}, creating one`);
                    const defaultVectorDB: VectorDatabaseEntity = this.getVectorDatabase();
                    const defaultAIModel: AIModelEntity = this.getAIModel();
                    entityDocument = await this.createEntityDocumentForEntity(entityDocumentID, defaultVectorDB, defaultAIModel);
                }
            }
            else{
                throw new Error(`No Entity Document found for ID=${entityDocumentID}`);
            }
        }

        LogStatus(`Using vector database ${entityDocument.VectorDatabaseID} and AI Model ${entityDocument.AIModelID}`);

        const vectorDBEntity: VectorDatabaseEntity = this.getVectorDatabase(entityDocument.VectorDatabaseID);
        const aiModelEntity: AIModelEntity = this.getAIModel(entityDocument.AIModelID);

        LogStatus(`AIModel driver class: ${aiModelEntity.DriverClass}`);
        LogStatus(`VectorDB class key: ${vectorDBEntity.ClassKey}`);

        const embeddingAPIKey: string = GetAIAPIKey(aiModelEntity.DriverClass);
        const vectorDBAPIKey: string = GetAIAPIKey(vectorDBEntity.ClassKey);

        if(!embeddingAPIKey){
            throw Error(`No API Key found for AI Model ${aiModelEntity.DriverClass}`);
        }

        if(!vectorDBAPIKey){
            throw Error(`No API Key found for Vector Database ${vectorDBEntity.ClassKey}`);
        }

        //LogStatus(`Embedding API Key: ${embeddingAPIKey} VectorDB API Key: ${vectorDBAPIKey}`);
        const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<Embeddings>(Embeddings, aiModelEntity.DriverClass, embeddingAPIKey)
        const vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, vectorDBEntity.ClassKey, vectorDBAPIKey);

        if(!embedding){
            throw Error(`Failed to create Embeddings instance for AI Model ${aiModelEntity.DriverClass}`);
        }

        if(!vectorDB){
            throw Error(`Failed to create Vector Database instance for ${vectorDBEntity.ClassKey}`);
        }

        return {embedding, vectorDB};
    }

    protected async getEntityDocument(id: number): Promise<EntityDocumentEntity | null> {
        const entityDocument: EntityDocumentEntity = await this.runViewForSingleValue<EntityDocumentEntity>("Entity Documents", `ID = ${id}`);
        if(!entityDocument){
            LogError(`Entity Document with ID=${id} not found`);
            return null;
        }

        return entityDocument;
    }

    protected async getFirstActiveEntityDocumentForEntity(entityID: number): Promise<EntityDocumentEntity | null> {
        const entityDocument: EntityDocumentEntity = await this.runViewForSingleValue<EntityDocumentEntity>("Entity Documents", `EntityID = ${entityID} AND TypeID = 9 AND Status = 'Active'`);
        if(!entityDocument){
            LogError(`No active Entity Document with entityID=${entityID} found`);
            return null;
        }

        return entityDocument;
    }

    protected async getRecordsByEntityID(entityID: number, recordIDs?: PrimaryKeyValueBase[]): Promise<BaseEntity[]> {
        const rvResult = await this._runView.RunView({
            EntityName: "Entities",
            ExtraFilter: `ID = ${entityID}`,
            ResultType: 'entity_object'
        }, this.CurrentUser);

        if(!rvResult.Success){
            throw new Error(rvResult.ErrorMessage);
        }
        else if(rvResult.RowCount === 0){
            throw new Error(`No Entity with ID=${entityID} not found`);
        }

        const entity: EntityEntity = rvResult.Results[0] as EntityEntity;
        const rvResult2 = await this._runView.RunView({
            EntityName: entity.Name,
            ExtraFilter: recordIDs ? this.buildExtraFilter(recordIDs): undefined,
            ResultType: 'entity_object'
        }, this.CurrentUser);

        if(!rvResult2.Success){
            throw new Error(rvResult2.ErrorMessage);
        }

        return rvResult2.Results;
    }

    protected buildExtraFilter(keyValues: PrimaryKeyValueBase[]): string {
        return keyValues.map((keyValue) => {
            return keyValue.PrimaryKeyValues.map((keys: PrimaryKeyValue) => {
                return `${keys.FieldName} = '${keys.Value}'`;
            }).join(" AND ");
        }).join("\n OR ");
    }

    protected async createEntityDocumentForEntity(entityID: number, vectorDatabase: VectorDatabaseEntity, AIModel: AIModelEntity): Promise<EntityDocumentEntity> {
        const entity: EntityEntity = await this.runViewForSingleValue<EntityEntity>("Entities", `ID = ${entityID}`);
        if(!entity){
            LogError(`Entity with ID ${entityID} not found`);
            return null;
        }

        const rvResult = await this._runView.RunView({
            EntityName: "Entity Fields", 
            ExtraFilter: `EntityID = ${entityID}`
        }, this.CurrentUser);

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
        entityDocument.ContextCurrentUser = this._metadata.CurrentUser;
        let saveResult = await entityDocument.Save();
        if(saveResult){
            return entityDocument;
        }
        else{
            throw new Error(`Failed to save Entity Document for ${entityID}`);
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

    protected getAIModel(id?: number): AIModelEntityExtended {
        /*elim this hardcoding by adding virtual field for Type to AI Models entity*/
        let model: AIModelEntityExtended;
        if(id){
            model = AIEngine.Models.find(m => m.AIModelTypeID === 3 && m.ID === id);
        }
        else{
            model = AIEngine.Models.find(m => m.AIModelTypeID === 3);
        }

        if(!model){
            throw new Error("No AI Model Entity found");
        }
        return model;
    }

    protected getVectorDatabase(id?: number): VectorDatabaseEntity {
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

        throw new Error("No Vector Database Entity found");
    }

    protected async runViewForSingleValue<T extends BaseEntity>(entityName: string, extraFilter: string): Promise<T | null> {
        const rvResult = await this._runView.RunView({
            EntityName: entityName,
            ExtraFilter: extraFilter,
            ResultType: 'entity_object'
        }, this.CurrentUser);

        if(rvResult.Success){
            return rvResult.RowCount > 0 ? rvResult.Results[0] as T: null;
        }
        else{
            LogError(rvResult.ErrorMessage);
            return null;
        }
    }

    /**
     * Saving an Entity in any vector related package needs the CurrentUser property to be set on the entity
     * So this is a simple wrapper to set it before saving
     **/
    protected async SaveEntity(entity: BaseEntity): Promise<boolean> {
        entity.ContextCurrentUser = this.CurrentUser;
        return await entity.Save();
    }
}