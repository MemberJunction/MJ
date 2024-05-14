import { Embeddings, GetAIAPIKey } from "@memberjunction/ai";
import { PotentialDuplicateRequest, PotentialDuplicateResponse, CompositeKey, RunView, UserInfo, BaseEntity, PotentialDuplicateResult, Metadata, LogError, EntityField, RecordMergeRequest } from "@memberjunction/core";
import { LogStatus } from "@memberjunction/core";
import { VectorDBBase } from "@memberjunction/ai-vectordb";
import { MJGlobal } from "@memberjunction/global";
import { AIModelEntity, DuplicateRunDetailEntity, DuplicateRunDetailMatchEntity, DuplicateRunEntity, EntityDocumentEntity, EntityEntity, ListDetailEntity, ListEntity, VectorDatabaseEntity } from "@memberjunction/core-entities";
import { VectorBase } from "@memberjunction/ai-vectors";
import { EntityDocumentTemplateParser, EntityDocumentTemplateParserBase, EntityVectorSyncer, vectorSyncRequest } from "@memberjunction/ai-vector-sync";

export class DuplicateRecordDetector extends VectorBase {

    _vectorDB: VectorDBBase;
    _embedding: Embeddings;

    constructor(){
        super();
        this._runView = new RunView();
    }

    public async getDuplicateRecords(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {        
        super.CurrentUser = contextUser;
        
        params.EntityID = 25050001;
        params.EntityDocumentID = 17;

        let vectorizer = new EntityVectorSyncer();
        vectorizer.CurrentUser = super.CurrentUser;

        let entityDocument: EntityDocumentEntity | null = null;
        if(params.EntityDocumentID){
            entityDocument = await vectorizer.GetEntityDocument(params.EntityDocumentID);
        }
        else {
            entityDocument = await vectorizer.GetFirstActiveEntityDocumentForEntity(params.EntityID);
            if(!entityDocument){
                throw Error(`No active Entity Document found for entity ${params.EntityID}`);
                //Update: No longer creating an entity docuement if one is not found
                //If an entitiy document is not found, that is our indicator that the 
                //underlying entity's records have not been vectorized yet
                //const defaultVectorDB: VectorDatabaseEntity = super.getVectorDatabase();
                //const defaultAIModel: AIModelEntity = super.getAIModel();
                //entityDocument = await this.createEntityDocumentForEntity(params.EntityID, defaultVectorDB, defaultAIModel);
            }
        }

        let response: PotentialDuplicateResponse = new PotentialDuplicateResponse();
        response.PotentialDuplicateResult = [];

        if(!entityDocument){
            response.ErrorMessage = `No active Entity Document found for entity ${params.EntityID}`;
            response.Status = 'Error';
            return response;
        }

        const request: vectorSyncRequest = {
            entityID: entityDocument.EntityID,
            entityDocumentID: entityDocument.ID,
            batchCount: 20,
            options: {}
        }

        //await vectorizer.VectorizeEntity(request, super.CurrentUser);

        const list: ListEntity = await this.getListEntity(params.ListID);
        let duplicateRun: DuplicateRunEntity = params.Options?.DuplicateRunID ? await this.getDuplicateRunEntity(params.Options?.DuplicateRunID) : await this.getDuplicateRunEntityByListID(list.ID);
        //let duplicateRun: DuplicateRunEntity = await this.createDuplicateRunRecord(entityDocument, list.ID);
        const duplicateRunDetails: DuplicateRunDetailEntity[] = await this.createDuplicateRunDetailRecordsByListID(list.ID, duplicateRun.ID);
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

        let records = await this.GetRecordsByListID(list.ID, entityDocument.EntityID);

        LogStatus("Vectorizing " + records.length + " records");
        const templateParser: EntityDocumentTemplateParserBase = EntityDocumentTemplateParser.CreateInstance();
        const recordTemplates: string[] = [];
        //Relationship(entityID: number, entityRecord: any, relationshipName: string, maxRows: number, entityDocumentName: string)
        let sampleTemplate: string = entityDocument.Template;
        //sampleTemplate += " ${Relationship('Deals', 5, 'Sample Relationship Document for crm.Deals Entity')} ${Relationship('Deals', 5, 'Second Sample Relationship Document for crm.Deals Entity')}";
        for(const record of records){
            const template = await templateParser.Parse(sampleTemplate, entityDocument.EntityID, record, contextUser);
            recordTemplates.push(template);
        }

        let embedTextsResult = await this._embedding.EmbedTexts({ texts: recordTemplates, model: null });        
        const topK: number = 5;
        let results: PotentialDuplicateResult[] = [];
        for (const [index, vector] of embedTextsResult.vectors.entries()){
            const recordID: CompositeKey = this.convertPrimaryKeysIntoCompositeKey(records[index].PrimaryKeys);
            let queryResult = await this._vectorDB.getVectorDuplicates({ vector: vector, topK: topK, includeMetadata: true, includeValues: false });
            if(queryResult.success){
                queryResult.data.Duplicates = queryResult.data.Duplicates.filter((dupe) => {
                    return dupe.ProbabilityScore >= entityDocument.PotentialMatchThreshold;
                });
                let result: PotentialDuplicateResult = queryResult.data as PotentialDuplicateResult;
                
                result.EntityID = entityDocument.EntityID;
                result.RecordPrimaryKeys = recordID;
                results.push(result);
                
                //now update all of the dupe run detail records
                let dupeRunDetail: DuplicateRunDetailEntity = duplicateRunDetails.find((detail) => detail.RecordID === recordID.ToString());
                if(dupeRunDetail){
                    const matchRecords = await this.createDuplicateRunDetailMatchesForRecord(dupeRunDetail.ID, result);
                    result.DuplicateRunDetailMatchRecordIDs = matchRecords.map((match) => match.ID);    
                    dupeRunDetail.MatchStatus = 'Complete';
                    let success = await super.SaveEntity(dupeRunDetail);
                    if(!success){
                        LogStatus(`Failed to update Duplicate Run Detail record ${dupeRunDetail.ID}`);
                    }
                }
                else{
                    LogError(`Failed to find Duplicate Run Detail record for ${recordID.ToString()}`);
                }
            }
        }

        //almost done
        duplicateRun.ProcessingStatus = 'Complete';
        duplicateRun.EndedAt = new Date();
        let success = await super.SaveEntity(duplicateRun);
        if(!success){
            throw new Error(`Failed to update Duplicate Run record ${duplicateRun.ID}`);
        }

        await this.mergeRecords(response, entityDocument);

        response.PotentialDuplicateResult = results;
        response.Status = 'Success';

        LogStatus("Dupe Run complete. Response:");
        LogStatus(JSON.stringify(response, null, "\t"));

        return response;
    }

    private async GetRecordsByEntityID(entityID: number, recordIDs: CompositeKey[]): Promise<BaseEntity[]> {
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

    private async GetRecordsByListID(listID: number, entityID: number): Promise<BaseEntity[]> {
        const entity = await super.runViewForSingleValue<EntityEntity>("Entities", `ID = ${entityID}`);
        if(!entity){
            throw new Error(`Failed to load Entity record ${entityID}`);
        }

        const rvResult = await super.RunView.RunView({
            EntityName: entity.Name,
            ExtraFilter: `ID IN (SELECT RecordID FROM __mj.vwListDetails WHERE ListID = ${listID})`,
            ResultType: 'entity_object'
        }, super.CurrentUser);

        if(!rvResult.Success){
            throw new Error(rvResult.ErrorMessage);
        }

        const records: BaseEntity[] = rvResult.Results as BaseEntity[];
        return records;
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

    private async createDuplicateRunDetailRecords(recordIDs: CompositeKey[], duplicateRunID: number): Promise<DuplicateRunDetailEntity[]> {
        let results: DuplicateRunDetailEntity[] = [];
        const md: Metadata = new Metadata();
        for(const recordID of recordIDs){
            let runDetail: DuplicateRunDetailEntity = await md.GetEntityObject<DuplicateRunDetailEntity>('Duplicate Run Details');
            runDetail.NewRecord();
            runDetail.DuplicateRunID = duplicateRunID;
            runDetail.RecordID = recordID.ToString();
            runDetail.MatchStatus = 'Pending';
            runDetail.MergeStatus = 'Pending';
            const success = await super.SaveEntity(runDetail);
            if(success){
                results.push(runDetail);
            }
        }

        return results;
    }

    private async createDuplicateRunDetailRecordsByListID(listID: number, duplicateRunID: number): Promise<DuplicateRunDetailEntity[]> {
        let results: DuplicateRunDetailEntity[] = [];
        const viewResults = await super.RunView.RunView({ 
            EntityName: 'List Details', 
            ExtraFilter: `ListID = ${listID}`,
            ResultType: 'entity_object'}, super.CurrentUser);

        if(!viewResults.Success){
            throw new Error(viewResults.ErrorMessage);
        }


        const md: Metadata = new Metadata();
        const listDetails: ListDetailEntity[] = viewResults.Results as ListDetailEntity[];
        for(const listDetail of listDetails){
            let runDetail: DuplicateRunDetailEntity = await md.GetEntityObject<DuplicateRunDetailEntity>('Duplicate Run Details');
            runDetail.NewRecord();
            runDetail.DuplicateRunID = duplicateRunID;
            runDetail.RecordID = `ID = ${listDetail.RecordID}`;
            runDetail.MatchStatus = 'Pending';
            runDetail.MergeStatus = 'Pending';
            const success = await super.SaveEntity(runDetail);
            if(success){
                results.push(runDetail);
            }
        }

        return results;
    }

    private async getListEntity(listID: number): Promise<ListEntity> {
        const md: Metadata = new Metadata();
        let list: ListEntity = await md.GetEntityObject<ListEntity>('Lists');
        list.ContextCurrentUser = super.CurrentUser;
        const success = await list.Load(listID);
        if(!success){
            throw new Error(`Failed to load List record ${listID}`);
        }

        return list;
    }

    private async getDuplicateRunEntity(DupeRunID: number): Promise<DuplicateRunEntity> {
        const md: Metadata = new Metadata();
        let dupeRun: DuplicateRunEntity = await md.GetEntityObject<DuplicateRunEntity>('Duplicate Runs');
        dupeRun.ContextCurrentUser = super.CurrentUser;
        const success = await dupeRun.Load(DupeRunID);
        if(!success){
            throw new Error(`Failed to load Duplicate Run record ${DupeRunID}`);
        }

        return dupeRun;
    }

    private async getDuplicateRunEntityByListID(listID: number): Promise<DuplicateRunEntity> {
        const entity = await super.runViewForSingleValue<DuplicateRunEntity>('Duplicate Runs', `SourceListID = ${listID}`);
        if(!entity){
            throw new Error(`Failed to load Duplicate Run record for List ${listID}`);
        }

        return entity;
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

    private async createListDetailsForDupeRun(recordIDs: CompositeKey[], listID: number): Promise<void> {
        const md: Metadata = new Metadata();

        for(const recordID of recordIDs){
            const listDetail: ListDetailEntity = await md.GetEntityObject<ListDetailEntity>('List Details');
            listDetail.NewRecord();
            listDetail.ListID = listID;
            listDetail.RecordID = recordID.ToString();
            listDetail.ContextCurrentUser = super.CurrentUser;
            await listDetail.Save();
        }
    }

    private async createDuplicateRunDetailMatchesForRecord(DuplicateRunDetailID: number, duplicateResult: PotentialDuplicateResult): Promise<DuplicateRunDetailMatchEntity[]> {
        const md: Metadata = new Metadata();
        let matchRecords: DuplicateRunDetailMatchEntity[] = [];
        for(const dupe of duplicateResult.Duplicates){
            const match: DuplicateRunDetailMatchEntity = await md.GetEntityObject<DuplicateRunDetailMatchEntity>('Duplicate Run Detail Matches');
            match.NewRecord();
            match.DuplicateRunDetailID = DuplicateRunDetailID;
            match.MatchRecordID = dupe.ToString();
            match.MatchProbability = dupe.ProbabilityScore;
            match.MatchedAt = new Date();
            match.MergedAt = new Date();
            match.Action = '';
            match.ApprovalStatus = 'Pending';
            match.MergeStatus = 'Pending';
            let success = await super.SaveEntity(match);
            if(success){
                matchRecords.push(match);
            }
        }

        return matchRecords;
    }

    private convertPrimaryKeysIntoCompositeKey(pkv: EntityField[]): CompositeKey {
        const pk: CompositeKey = new CompositeKey();
        pk.KeyValuePairs = pkv.map((pk) => {
            return { FieldName: pk.Name, Value: pk.Value };
        });
        return pk;
    }

    private async mergeRecords(dupeResponse: PotentialDuplicateResponse, entityDocument: EntityDocumentEntity): Promise<void> {
        const md: Metadata = new Metadata();
        for(const dupeResult of dupeResponse.PotentialDuplicateResult){
            for(const [index, dupe] of dupeResult.Duplicates.entries()){
                if(dupe.ToString() === dupeResult.RecordPrimaryKeys.ToString()){
                    continue;
                }

                if(dupe.ProbabilityScore >= entityDocument.AbsoluteMatchThreshold){
                    //merge
                    let mergeParams: RecordMergeRequest = new RecordMergeRequest();
                    mergeParams.EntityName = entityDocument.Entity;
                    mergeParams.SurvivingRecordKeyValuePairs = dupeResult.RecordPrimaryKeys.KeyValuePairs;
                    mergeParams.RecordsToMerge = [dupe.KeyValuePairs];
                    let result = await md.MergeRecords(mergeParams, super.CurrentUser);
                    if(result.Success){
                        let dupeRunMatchRecord: DuplicateRunDetailMatchEntity = await md.GetEntityObject<DuplicateRunDetailMatchEntity>('Duplicate Run Detail Matches', super.CurrentUser);
                        let loadResult = await dupeRunMatchRecord.Load(dupeResult.DuplicateRunDetailMatchRecordIDs[index]);
                        if(!loadResult){
                            LogError(`Failed to load Duplicate Run Match record ${dupeResult.DuplicateRunDetailMatchRecordIDs[index]}`);
                            continue;
                        }

                        dupeRunMatchRecord.MergeStatus = 'Complete';
                        dupeRunMatchRecord.Action = 'Merged';
                        dupeRunMatchRecord.MergedAt = new Date();

                        let saveResult = await dupeRunMatchRecord.Save();
                        if(!saveResult){
                            LogError(`Failed to update Duplicate Run Match record ${dupeRunMatchRecord.ID}`);
                        }
                    }
                    else{
                        LogError(`Failed to merge records ${dupeResult.RecordPrimaryKeys.ToString()} and ${dupe.ToString()}`);
                    }
                }
            }
        }
    }
}