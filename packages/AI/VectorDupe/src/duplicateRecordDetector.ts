import { Embeddings, GetAIAPIKey } from "@memberjunction/ai";
import { PotentialDuplicateRequest, PotentialDuplicateResponse, PrimaryKeyValueBase, RunView, UserInfo, BaseEntity, PotentialDuplicateResult, Metadata } from "@memberjunction/core";
import { LogStatus } from "@memberjunction/core";
import { VectorDBBase } from "@memberjunction/ai-vectordb";
import { MJGlobal } from "@memberjunction/global";
import { AIModelEntity, DuplicateRunDetailEntity, DuplicateRunEntity, EntityDocumentEntity, EntityEntity, ListDetailEntity, ListEntity, VectorDatabaseEntity } from "@memberjunction/core-entities";
import { VectorBase } from "@memberjunction/ai-vectors";

export class DuplicateRecordDetector extends VectorBase {

    _vectorDB: VectorDBBase;
    _embedding: Embeddings;

    constructor(){
        super();
        this._runView = new RunView();
    }

    public async getDuplicateRecords(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {        
        super.CurrentUser = contextUser;
        params.EntityDocumentID = 12;

        let entityDocument: EntityDocumentEntity | null = null;
        if(params.EntityDocumentID){
            entityDocument = await this.getEntityDocument(params.EntityDocumentID);
        }
        else {
            entityDocument = await this.getFirstActiveEntityDocumentForEntity(params.EntityID);
            if(!entityDocument){
                LogStatus(`No active Entity Document found for entity ${params.EntityID}, creating one`);
                const defaultVectorDB: VectorDatabaseEntity = super.getVectorDatabase();
                const defaultAIModel: AIModelEntity = super.getAIModel();
                entityDocument = await this.createEntityDocumentForEntity(params.EntityID, defaultVectorDB, defaultAIModel);
            }
        }

        let response: PotentialDuplicateResponse = new PotentialDuplicateResponse();
        response.PotentialDuplicateResult = params.RecordIDs.map((recordID) => {
            let response: PotentialDuplicateResult = new PotentialDuplicateResult();
            response.EntityID = entityDocument.EntityID;
            response.Duplicates = [];
            response.RecordPrimaryKeys = recordID;
            return response;
        });

        if(!entityDocument){
            response.ErrorMessage = `No active Entity Document found for entity ${params.EntityID}`;
            response.Status = 'Error';
            return response;
        }

        const list: ListEntity = await this.createListForDupeRun(entityDocument);
        let duplicateRun: DuplicateRunEntity = await this.createDuplicateRunRecord(entityDocument, list.ID);
        await this.createDuplicateRunDetailRecords(params.RecordIDs, duplicateRun.ID);
        //await this.createListDetailsForDupeRun(params.RecordIDs, list.ID);

        LogStatus(`Using vector database ${entityDocument.VectorDatabaseID} and AI Model ${entityDocument.AIModelID}`);

        const vectorDB: VectorDatabaseEntity = this.getVectorDatabase(entityDocument.VectorDatabaseID);
        const aiModel: AIModelEntity = this.getAIModel(entityDocument.AIModelID);

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
        let results: PotentialDuplicateResult[] = [];
        for (const [index, vector] of embedTextsResult.vectors.entries()){
            let queryResult = await this._vectorDB.getVectorDuplicates({ vector: vector, topK: topK, includeMetadata: true, includeValues: false });
            if(queryResult.success){
                let result: PotentialDuplicateResult = queryResult.data as PotentialDuplicateResult;
                //const compositeKey: string = params.RecordIDs[index].GetCompositeKey();
                //LogStatus(`Query result for ${compositeKey} returned ${response.Duplicates.length} potential duplicates`);
                result.EntityID = entityDocument.EntityID;
                result.RecordPrimaryKeys = params.RecordIDs[index];
                results.push(result);
            }
        }

        response.PotentialDuplicateResult = results;
        response.Status = 'Success';
        return response;
    }

    private async GetRecordsByEntityID(entityID: number, recordIDs: PrimaryKeyValueBase[]): Promise<BaseEntity[]> {
        const rvResult = await this._runView.RunView({
            EntityName: "Entities",
            ExtraFilter: `ID = ${entityID}`
        }, super.CurrentUser);

        if(!rvResult.Success){
            throw new Error(rvResult.ErrorMessage);
        }

        const entity: EntityEntity = rvResult.Results[0] as EntityEntity;
        const rvResult2 = await this._runView.RunView({
            EntityName: entity.Name,
            ExtraFilter: this.buildExtraFilter(recordIDs),
            ResultType: 'entity_object'
        }, super.CurrentUser);

        if(!rvResult2.Success){
            throw new Error(rvResult2.ErrorMessage);
        }

        return rvResult2.Results;
    }

    private async createDuplicateRunRecord(entityDocument: EntityDocumentEntity, listID: number): Promise<DuplicateRunEntity> {
        const md: Metadata = new Metadata();
        let duplicateRun: DuplicateRunEntity = await md.GetEntityObject<DuplicateRunEntity>('Duplicate Runs');
        duplicateRun.NewRecord();
        duplicateRun.EntityID = entityDocument.EntityID;
        duplicateRun.StartedByUserID = super.CurrentUser.ID;
        duplicateRun.StartedAt = new Date();
        duplicateRun.ProcessingStatus = 'In Progress';
        duplicateRun.ApprovalStatus = 'Pending';
        duplicateRun.SourceListID = listID;
        
        const saveResult = await super.SaveEntity(duplicateRun);
        if(!saveResult){
            throw new Error(`Failed to save list for Potential Duplicate Run`);
        }

        return duplicateRun;
    }

    private async createDuplicateRunDetailRecords(recordIDs: PrimaryKeyValueBase[], duplicateRunID: number): Promise<void> {
        const md: Metadata = new Metadata();
        for(const recordID of recordIDs){
            let runDetail: DuplicateRunDetailEntity = await md.GetEntityObject<DuplicateRunDetailEntity>('Duplicate Run Details');
            runDetail.NewRecord();
            runDetail.DuplicateRunID = duplicateRunID;
            runDetail.RecordID = recordID.GetCompositeKeyAsSQLString();
            runDetail.MatchStatus = 'Pending';
            runDetail.MergeStatus = 'Pending';
            await super.SaveEntity(runDetail);
        }
    }

    private async createListForDupeRun(entityDocument: EntityDocumentEntity): Promise<ListEntity> {
        const md: Metadata = new Metadata();
        const list: ListEntity = await md.GetEntityObject<ListEntity>('Lists');
        list.NewRecord();
        list.Name = `Potential Duplicate Run`;
        list.Description = `Potential Duplicate Run for ${entityDocument.Entity} Entity`;
        list.EntityID = entityDocument.EntityID;
        list.UserID = super.CurrentUser.ID;

        const saveResult = await super.SaveEntity(list);
        if(!saveResult){
            throw new Error(`Failed to save list for Potential Duplicate Run`);
        }

        return list;
    }

    private async createListDetailsForDupeRun(recordIDs: PrimaryKeyValueBase[], listID: number): Promise<void> {
        const md: Metadata = new Metadata();

        for(const recordID of recordIDs){
            const listDetail: ListDetailEntity = await md.GetEntityObject<ListDetailEntity>('List Details');
            listDetail.NewRecord();
            listDetail.ListID = listID;
            listDetail.RecordID = recordID.GetCompositeKeyAsSQLString();
            listDetail.ContextCurrentUser = super.CurrentUser;
            await listDetail.Save();
        }
    }
}