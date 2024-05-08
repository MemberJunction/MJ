import { EntitySyncConfig } from '../generic/entitySyncConfig.types';
import { BaseEntity, EntityField, LogError, LogStatus, Metadata, PrimaryKeyValue, RunView, RunViewParams, RunViewResult, UserInfo,  } from "@memberjunction/core";
import { IProcedureResult, Request } from 'mssql';
import { EmbedTextsParams, EmbedTextsResult, Embeddings, GetAIAPIKey} from '@memberjunction/ai';
import { BaseResponse, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { MJGlobal } from '@memberjunction/global';
import { AIModelEntity, EntityDocumentEntity, EntityRecordDocumentEntity, VectorDatabaseEntity, VectorIndexEntity } from '@memberjunction/core-entities';
import { AIEngine } from "@memberjunction/aiengine";
import { vectorSyncRequest } from '../generic/vectorSync.types';
import { VectorBase } from '@memberjunction/ai-vectors'
import { EntityDocumentTemplateParser } from '../generic/EntityDocumentTemplateParser';
import { RECORD_DUPLICATES_TYPE_ID } from '../constants';


/**
 * Simple caching class to load all Entity Documents at once into memory
 */
export class EntityDocumentCache {
    private _loaded: boolean = false;
    private _cache: { [key: number]: EntityDocumentEntity } = {};
    protected Cache(): { [key: number]: EntityDocumentEntity } {
        return this._cache;
    }
    public GetDocument(EntityDocumentID: number): EntityDocumentEntity | null {
        return this._cache[EntityDocumentID] || null;
    }
    public GetDocumentByName(EntityDocumentName: string): EntityDocumentEntity | null {
        return Object.values(this._cache).find(ed => ed.Name.trim().toLowerCase() === EntityDocumentName.trim().toLowerCase()) || null;
    }   

    private static _instance: EntityDocumentCache;
    public static get Instance(): EntityDocumentCache {
        if(!EntityDocumentCache._instance){
            EntityDocumentCache._instance = new EntityDocumentCache();
        }
        return EntityDocumentCache._instance;
    }

    constructor() {
        // load up the cache
        this.Refresh();
    }

    public get IsLoaded(): boolean {
        return this._loaded;
    }

    public async Refresh() {
        this._cache = {};
        // now load up the cache with all the entity documents
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: "Entity Documents",
            ResultType: "entity_object"
        });
        if (result && result.Success) {
            for (const entityDocument of result.Results) {
                this._cache[entityDocument.ID] = entityDocument;
            }
        }
    }
}

export class EntityVectorSyncer extends VectorBase {
    _startTime: Date; 
    _endTime: Date;

    constructor(){
        super();
    }

    public async VectorizeEntity(request: vectorSyncRequest, contextUser: UserInfo): Promise<any> {
        const parser = EntityDocumentTemplateParser.CreateInstance();

        super.CurrentUser = contextUser;
        const entityDocument: EntityDocumentEntity = await EntityVectorSyncer.GetEntityDocument(request.entityDocumentID);
        const vectorIndexEntity: VectorIndexEntity = await this.getOrCreateVectorIndex(entityDocument);
        const obj = await this.getVectorDatabaseAndEmbeddingClassByEntityDocumentID(request.entityDocumentID);
        const allrecords: BaseEntity[] = await super.getRecordsByEntityID(request.entityID);
        
        //small number in the hopes we dont hit embedding token limits
        const batchSize: number = 20;
        const chunks: BaseEntity[][] = this.chunkArray(allrecords, batchSize);
        LogStatus(`Processing ${allrecords.length} records in ${chunks.length} chunks of ${batchSize} records each`);

        let count = 0;
        for (const batch of chunks){
            const promises = [];
            for(const record of batch){
                // don't await here, fire off all the Parse requests within the batch at once in parallel, we will wait
                // below for all of them to complete
                const promise = parser.Parse(entityDocument.Template, request.entityID, record);
                promises.push(promise);
            }
            const templates: string[] = await Promise.all(promises);

            const embeddings: EmbedTextsResult = await obj.embedding.EmbedTexts({texts: templates, model: null});
            const vectorRecords: VectorRecord[] = embeddings.vectors.map((vector: number[], index: number) => {
                const recordID = batch[index].PrimaryKeys.map((pk) => `${pk.Name}=${pk.Value}`).join("_");
                return {
                    id: `${entityDocument.Entity}_${entityDocument.ID}_${recordID}`,
                    values: vector,
                    metadata: {
                        EntityID: entityDocument.EntityID,
                        PrimaryKeys: this.convertPrimaryKeysToList(batch[index].PrimaryKeys),
                        Template: templates[index]
                    }
                };
            });

            const response: BaseResponse = await obj.vectorDB.createRecords(vectorRecords);
            if(response.success && vectorIndexEntity){
                LogStatus("Successfully created vector records, creating associated Entity Record Documents...");
                for (const [index, vectorRecord] of vectorRecords.entries()){
                    try{
                        let erdEntity: EntityRecordDocumentEntity = await super.Metadata.GetEntityObject("Entity Record Documents");
                        erdEntity.NewRecord();
                        erdEntity.EntityID = entityDocument.EntityID;
                        erdEntity.RecordID = batch[index].PrimaryKey.Value;
                        erdEntity.DocumentText = templates[index];
                        erdEntity.VectorID = vectorRecord.id;
                        erdEntity.VectorJSON = JSON.stringify(vectorRecord.values);
                        erdEntity.VectorIndexID = vectorIndexEntity.ID;
                        erdEntity.EntityRecordUpdatedAt = new Date();
                        erdEntity.EntityDocumentID = entityDocument.ID;
                        let erdEntitySaveResult: boolean = await super.SaveEntity(erdEntity);
                        if(!erdEntitySaveResult){
                            LogError("Error saving Entity Record Document Entity");
                        }
                    }
                    catch(err){
                        LogError("Error saving Entity Record Document Entity");
                        LogError(err);
                    }
                }
            }
            else{
                LogError(response.message);
            }

            //add a delay to avoid rate limiting
            let delayRes = await this.delay(1000);
            count++;
            LogStatus(`Chunk ${count} of out ${chunks.length} processed`);
        }

        return null;
    }


    /**
     * This method will create a default Entity Document for the given entityID, vectorDatabase, and AIModel
     * @param entityID 
     * @param vectorDatabase 
     * @param AIModel 
     * @returns 
     */
    public async CreateDefaultEntityDocument(EntityID: number, VectorDatabase: VectorDatabaseEntity, AIModel: AIModelEntity): Promise<EntityDocumentEntity> {
        const md = new Metadata();
        const entity = md.Entities.find(e => e.ID === EntityID);
        if (!entity) 
            throw new Error(`Entity with ID ${EntityID} not found.`);

        const EDTemplate: string = entity.Fields.map(ef => {
            return `${ef.Name}: \$\{${ef.Name}\}`;
        }).join(" ");

        const entityDocument: EntityDocumentEntity = await md.GetEntityObject<EntityDocumentEntity>("Entity Documents");
        entityDocument.NewRecord();
        entityDocument.Name = `Default duplicate record Entity Document for the ${entity.Name} entity using vector database ${VectorDatabase.Name} and AI Model ${AIModel.Name}`;
        entityDocument.EntityID = EntityID;
        entityDocument.TypeID = RECORD_DUPLICATES_TYPE_ID;
        entityDocument.Status = "Active";
        entityDocument.Template = EDTemplate;
        entityDocument.VectorDatabaseID = VectorDatabase.ID;
        entityDocument.AIModelID = AIModel.ID;
        let saveResult = await this.SaveEntity(entityDocument);
        if(saveResult){
            return entityDocument;
        }
        else{
            throw new Error(`Failed to save Entity Document for ${EntityID}`);
        }
    }


    protected async getVectorDatabaseAndEmbeddingClassByEntityDocumentID(entityDocumentID: number, createDocumentIfNotFound: boolean = true): Promise<{embedding: Embeddings, vectorDB: VectorDBBase}> {
        let entityDocument: EntityDocumentEntity | null = await EntityVectorSyncer.GetEntityDocument(entityDocumentID) || await this.getFirstActiveEntityDocumentForEntity(entityDocumentID);
        if(!entityDocument){
            if(createDocumentIfNotFound){
                if(!entityDocument){
                    LogStatus(`No active Entity Document found for entity ${entityDocumentID}, creating one`);
                    const defaultVectorDB: VectorDatabaseEntity = this.getVectorDatabase();
                    const defaultAIModel: AIModelEntity = this.getAIModel();
                    entityDocument = await this.CreateDefaultEntityDocument(entityDocumentID, defaultVectorDB, defaultAIModel);
                }
            }
            else{
                throw new Error(`No Entity Document found for ID=${entityDocumentID}`);
            }
        }

        LogStatus(`Using vector database ${entityDocument.VectorDatabaseID} and AI Model ${entityDocument.AIModelID}`);

        const vectorDBEntity: VectorDatabaseEntity = this.getVectorDatabase(entityDocument.VectorDatabaseID);
        const aiModelEntity: AIModelEntity = this.getAIModel(entityDocument.AIModelID);

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

    public static async GetEntityDocument(EntityDocumentID: number): Promise<EntityDocumentEntity | null> {
        const cache = EntityDocumentCache.Instance;
        if (!cache.IsLoaded) {
            await cache.Refresh();
        }
        return cache.GetDocument(EntityDocumentID);
    }
    public static async GetEntityDocumentByName(EntityDocumentName: string): Promise<EntityDocumentEntity | null> {
        const cache = EntityDocumentCache.Instance;
        if (!cache.IsLoaded) {
            await cache.Refresh();
        }
        return cache.GetDocumentByName(EntityDocumentName);
    }

    protected async getFirstActiveEntityDocumentForEntity(entityID: number): Promise<EntityDocumentEntity | null> {
        const entityDocument: EntityDocumentEntity = await this.runViewForSingleValue<EntityDocumentEntity>("Entity Documents", `EntityID = ${entityID} AND TypeID = 9 AND Status = 'Active'`);
        if(!entityDocument){
            LogError(`No active Entity Document with entityID=${entityID} found`);
            return null;
        }

        return entityDocument;
    }
     

    private async getOrCreateVectorIndex(entityDocument: EntityDocumentEntity): Promise<VectorIndexEntity> {
        let vectorIndexEntity: VectorIndexEntity = await super.runViewForSingleValue("Vector Indexes", `VectorDatabaseID = ${entityDocument.VectorDatabaseID} AND EmbeddingModelID = ${entityDocument.AIModelID}`);
        if(vectorIndexEntity){
            return vectorIndexEntity;
        }

        try{
            vectorIndexEntity = await super.Metadata.GetEntityObject<VectorIndexEntity>("Vector Indexes");
            vectorIndexEntity.NewRecord();
            vectorIndexEntity.VectorDatabaseID = entityDocument.VectorDatabaseID;
            vectorIndexEntity.EmbeddingModelID = entityDocument.AIModelID;
            vectorIndexEntity.Set("EntityRecordUpdatedAt", new Date());
            vectorIndexEntity.Set("EntityDocumentID", entityDocument.ID);
            //not a very descriptive description, but the view has the name of the vectorDB and embedding model used
            vectorIndexEntity.Description = `Vector Index that uses the Vector database ${entityDocument.VectorDatabaseID} and ${entityDocument.AIModelID} as the embedding model`;
            const saveResult = await super.SaveEntity(vectorIndexEntity);
            if(saveResult){
                LogStatus(`Successfully created new Vector Index Entity`);
                return vectorIndexEntity;
            }
            else{
                LogError("Error saving Vector Index Entity");
                return null;
            }
        }
        catch(err){
            LogError(err);
            return null;
        }
    }

    private chunkArray(array: any[], chunkSize: number): BaseEntity[][] {
        let arrayCopy = [...array];
        let result: BaseEntity[][] = [];
        while(arrayCopy.length){
            result.push(arrayCopy.splice(0, chunkSize));
        }
        return result;
    }

    private convertPrimaryKeysToList(primaryKeys: EntityField[]): any {
        return primaryKeys.map((pk) => {
            return `${pk.Name}=${pk.Value}`;
        });
    }

    private delay = (delayInms) => {
        return new Promise(resolve => setTimeout(resolve, delayInms));
    };
}