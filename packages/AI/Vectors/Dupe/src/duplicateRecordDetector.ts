import { BaseEmbeddings, GetAIAPIKey } from "@memberjunction/ai";
import { PotentialDuplicateRequest, PotentialDuplicateResponse, CompositeKey, RunView, UserInfo, BaseEntity, PotentialDuplicateResult, Metadata, LogError, RecordMergeRequest, EntityInfo, PotentialDuplicate } from "@memberjunction/core";
import { LogStatus } from "@memberjunction/core";
import { BaseResponse, VectorDBBase } from "@memberjunction/ai-vectordb";
import { MJGlobal } from "@memberjunction/global";
import { MJAIModelEntity, MJDuplicateRunDetailEntity, MJDuplicateRunDetailMatchEntity, MJDuplicateRunEntity, MJEntityDocumentEntity, MJListDetailEntity, MJListEntity, MJVectorDatabaseEntity } from "@memberjunction/core-entities";
import { VectorBase } from "@memberjunction/ai-vectors";
import { EntityDocumentTemplateParser, EntityVectorSyncer, VectorizeEntityParams } from "@memberjunction/ai-vector-sync";

export class DuplicateRecordDetector extends VectorBase {

    _vectorDB: VectorDBBase;
    _embedding: BaseEmbeddings;

    constructor(){
        super();
        this._runView = new RunView();
    }

    public async getDuplicateRecords(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {
        super.CurrentUser = contextUser;

        //for testing
        //params.EntityID = 25050001;
        //params.EntityDocumentID = 17;

        let vectorizer = new EntityVectorSyncer();
        vectorizer.CurrentUser = super.CurrentUser;

        let entityDocument: MJEntityDocumentEntity | null = await vectorizer.GetEntityDocument(params.EntityDocumentID);
        if(!entityDocument){
            throw Error(`No Entity Document found with ID ${params.EntityDocumentID}`);
            //Update: No longer creating an entity docuement if one is not found
            //If an entitiy document is not found, that is our indicator that the
            //underlying entity's records have not been vectorized yet
            //const defaultVectorDB: MJVectorDatabaseEntity = super.getVectorDatabase();
            //const defaultAIModel: MJAIModelEntity = super.getAIModel();
            //entityDocument = await this.createEntityDocumentForEntity(params.EntityID, defaultVectorDB, defaultAIModel);
        }

        let response: PotentialDuplicateResponse = new PotentialDuplicateResponse();
        response.PotentialDuplicateResult = [];

        if(!entityDocument){
            response.ErrorMessage = `No active Entity Document found for entity ${params.EntityID}`;
            response.Status = 'Error';
            return response;
        }

        //for testing
        const request: VectorizeEntityParams = {
            entityID: entityDocument.EntityID,
            entityDocumentID: entityDocument.ID,
            listBatchCount: 20,
            options: {},
            CurrentUser: contextUser
        }

        console.log("vectorizing entity...");
        const templateParser = EntityDocumentTemplateParser.CreateInstance();
        await vectorizer.VectorizeEntity(request, super.CurrentUser);

        const list: MJListEntity = await this.getListEntity(params.ListID);
        let duplicateRun: MJDuplicateRunEntity = params.Options?.DuplicateRunID ? await this.getDuplicateRunEntity(params.Options?.DuplicateRunID) : await this.getDuplicateRunEntityByListID(list.ID);
        //let duplicateRun: MJDuplicateRunEntity = await this.createDuplicateRunRecord(entityDocument, list.ID);
        const duplicateRunDetails: MJDuplicateRunDetailEntity[] = await this.createDuplicateRunDetailRecordsByListID(list.ID, duplicateRun.ID);
        //await this.createListDetailsForDupeRun(params.RecordIDs, list.ID);

        LogStatus(`Using vector database ${entityDocument.VectorDatabaseID} and AI Model ${entityDocument.AIModelID}`);

        const vectorDB: MJVectorDatabaseEntity = super.GetVectorDatabase(entityDocument.VectorDatabaseID);
        const aiModel: MJAIModelEntity = super.GetAIModel(entityDocument.AIModelID);

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
        this._embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(BaseEmbeddings, aiModel.DriverClass, embeddingAPIKey)
        this._vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, vectorDB.ClassKey, vectorDBAPIKey);

        if(!this._embedding){
            throw Error(`Failed to create Embeddings instance for AI Model ${aiModel.DriverClass}`);
        }

        if(!this._vectorDB){
            throw Error(`Failed to create Vector Database instance for ${vectorDB.ClassKey}`);
        }

        let records = await this.GetRecordsByListID(list.ID, entityDocument.EntityID);
        if(records.length === 0){
            LogError(`No records found in list ${list.Name}, with listID ${list.ID} and EntityID ${entityDocument.EntityID} exiting early`);
            response.ErrorMessage = `No records found in list ${list.Name}`;
            response.Status = 'Error';
            return response;

        }

        LogStatus("Vectorizing " + records.length + " records");

        const recordTemplates: string[] = [];
        //Relationship(entityID: number, entityRecord: any, relationshipName: string, maxRows: number, entityDocumentName: string)
        let sampleTemplate: string = (entityDocument as any).Template;
        //sampleTemplate += " ${Relationship('Deals', 5, 'Sample Relationship Document for crm.Deals Entity')} ${Relationship('Deals', 5, 'Second Sample Relationship Document for crm.Deals Entity')}";
        for(const record of records){
            const template = await templateParser.Parse(sampleTemplate, entityDocument.EntityID, record, contextUser);
            recordTemplates.push(template);
        }

        let embedTextsResult = await this._embedding.EmbedTexts({ texts: recordTemplates, model: null });
        const topK: number = 5;
        let results: PotentialDuplicateResult[] = [];
        for (const [index, vector] of embedTextsResult.vectors.entries()){
            const compositeKey: CompositeKey = records[index].PrimaryKey;
            let filterResult: BaseResponse = await this._vectorDB.queryIndex({ vector: vector, topK: topK, includeMetadata: true, includeValues: false });
            if(!filterResult.success){
                LogError(`Failed to query index for record ${compositeKey.ToString()}`);
                continue;
            }
            
            let queryResult: PotentialDuplicateResult = await this.getVectorDuplicates(filterResult);
            queryResult.Duplicates = queryResult.Duplicates.filter((dupe) => {
                return dupe.ProbabilityScore >= entityDocument.PotentialMatchThreshold;
            });

            queryResult.EntityID = entityDocument.EntityID;
            queryResult.RecordCompositeKey = compositeKey;
            results.push(queryResult);

            //now update all of the dupe run detail records
            let dupeRunDetail: MJDuplicateRunDetailEntity = duplicateRunDetails.find((detail: MJDuplicateRunDetailEntity) => detail.RecordID === compositeKey.Values());
            if(dupeRunDetail){
                const matchRecords = await this.createDuplicateRunDetailMatchesForRecord(dupeRunDetail.ID, queryResult);
                queryResult.DuplicateRunDetailMatchRecordIDs = matchRecords.map((match) => match.ID);
                dupeRunDetail.MatchStatus = 'Complete';
                let success = await super.SaveEntity(dupeRunDetail);
                if(!success){
                    LogStatus(`Failed to update Duplicate Run Detail record ${dupeRunDetail.ID}`);
                }
            }
            else{
                LogError(`Failed to find Duplicate Run Detail record for ${compositeKey.ToString()}`);
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

    private async GetRecordsByListID(listID: string, entityID: string): Promise<BaseEntity[]> {
        const entityInfo: EntityInfo = super.Metadata.EntityByID(entityID);
        if(!entityInfo){
            throw new Error(`Failed to load Entity Info with ID ${entityID}`);
        }

        const rvResult = await super.RunView.RunView<BaseEntity>({
            EntityName: entityInfo.Name,
            ExtraFilter: `ID IN (SELECT RecordID FROM __mj.vwListDetails WHERE ListID = '${listID}')`,
            ResultType: 'entity_object'
        }, super.CurrentUser);

        if(!rvResult.Success){
            throw new Error(rvResult.ErrorMessage);
        }

        return rvResult.Results;
    }

    private async createDuplicateRunRecord(entityDocument: MJEntityDocumentEntity, listID: string): Promise<MJDuplicateRunEntity> {
        const md: Metadata = new Metadata();
        let duplicateRun: MJDuplicateRunEntity = await md.GetEntityObject<MJDuplicateRunEntity>('MJ: Duplicate Runs');
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

    private async createDuplicateRunDetailRecords(recordIDs: CompositeKey[], duplicateRunID: string): Promise<MJDuplicateRunDetailEntity[]> {
        let results: MJDuplicateRunDetailEntity[] = [];
        const md: Metadata = new Metadata();
        for(const recordID of recordIDs){
            let runDetail: MJDuplicateRunDetailEntity = await md.GetEntityObject<MJDuplicateRunDetailEntity>('MJ: Duplicate Run Details');
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

    private async createDuplicateRunDetailRecordsByListID(listID: string, duplicateRunID: string): Promise<MJDuplicateRunDetailEntity[]> {
        let results: MJDuplicateRunDetailEntity[] = [];
        const viewResults = await super.RunView.RunView({
            EntityName: 'MJ: List Details',
            ExtraFilter: `ListID = '${listID}'`,
            ResultType: 'entity_object'},
            super.CurrentUser);

        if(!viewResults.Success){
            throw new Error(viewResults.ErrorMessage);
        }


        const md: Metadata = new Metadata();
        const listDetails: MJListDetailEntity[] = viewResults.Results as MJListDetailEntity[];
        for(const listDetail of listDetails){
            let runDetail: MJDuplicateRunDetailEntity = await md.GetEntityObject<MJDuplicateRunDetailEntity>('MJ: Duplicate Run Details');
            runDetail.NewRecord();
            runDetail.DuplicateRunID = duplicateRunID;
            runDetail.RecordID = listDetail.RecordID;
            runDetail.MatchStatus = 'Pending';
            runDetail.MergeStatus = 'Pending';
            const success = await super.SaveEntity(runDetail);
            if(success){
                results.push(runDetail);
            }
            else{
                LogError("Failed to save MJDuplicateRunDetailEntity", undefined, runDetail.LatestResult);
            }
        }

        return results;
    }

    private async getListEntity(listID: string): Promise<MJListEntity> {
        const md: Metadata = new Metadata();
        let list: MJListEntity = await md.GetEntityObject<MJListEntity>('MJ: Lists');
        list.ContextCurrentUser = super.CurrentUser;
        const success = await list.Load(listID);
        if(!success){
            throw new Error(`Failed to load List record ${listID}`);
        }

        return list;
    }

    private async getDuplicateRunEntity(DupeRunID: string): Promise<MJDuplicateRunEntity> {
        const md: Metadata = new Metadata();
        let dupeRun: MJDuplicateRunEntity = await md.GetEntityObject<MJDuplicateRunEntity>('MJ: Duplicate Runs');
        dupeRun.ContextCurrentUser = super.CurrentUser;
        const success = await dupeRun.Load(DupeRunID);
        if(!success){
            throw new Error(`Failed to load Duplicate Run record ${DupeRunID}`);
        }

        return dupeRun;
    }

    private async getDuplicateRunEntityByListID(listID: string): Promise<MJDuplicateRunEntity> {
        const entity = await super.RunViewForSingleValue<MJDuplicateRunEntity>('MJ: Duplicate Runs', `SourceListID = '${listID}'`);
        if(!entity){
            throw new Error(`Failed to load Duplicate Run record for List ${listID}`);
        }

        return entity;
    }

    private async createListForDupeRun(entityDocument: MJEntityDocumentEntity): Promise<MJListEntity> {
        const md: Metadata = new Metadata();
        const list: MJListEntity = await md.GetEntityObject<MJListEntity>('MJ: Lists');
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

    private async createDuplicateRunDetailMatchesForRecord(DuplicateRunDetailID: string, duplicateResult: PotentialDuplicateResult): Promise<MJDuplicateRunDetailMatchEntity[]> {
        const md: Metadata = new Metadata();
        let matchRecords: MJDuplicateRunDetailMatchEntity[] = [];
        for(const dupe of duplicateResult.Duplicates){
            const match: MJDuplicateRunDetailMatchEntity = await md.GetEntityObject<MJDuplicateRunDetailMatchEntity>('MJ: Duplicate Run Detail Matches');
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

    private async mergeRecords(dupeResponse: PotentialDuplicateResponse, entityDocument: MJEntityDocumentEntity): Promise<void> {
        const md: Metadata = new Metadata();
        for(const dupeResult of dupeResponse.PotentialDuplicateResult){
            for(const [index, dupe] of dupeResult.Duplicates.entries()){
                if(dupe.ToString() === dupeResult.RecordCompositeKey.ToString()){
                    //same record, skip
                    continue;
                }

                if(dupe.ProbabilityScore >= entityDocument.AbsoluteMatchThreshold){
                    //merge
                    let mergeParams: RecordMergeRequest = new RecordMergeRequest();
                    mergeParams.EntityName = entityDocument.Entity;
                    mergeParams.SurvivingRecordCompositeKey = dupeResult.RecordCompositeKey;
                    mergeParams.RecordsToMerge = [dupe];
                    let result = await md.MergeRecords(mergeParams, super.CurrentUser);
                    if(result.Success){
                        let dupeRunMatchRecord: MJDuplicateRunDetailMatchEntity = await md.GetEntityObject<MJDuplicateRunDetailMatchEntity>('MJ: Duplicate Run Detail Matches', super.CurrentUser);
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
                        LogError(`Failed to merge records ${dupeResult.RecordCompositeKey.ToString()} and ${dupe.ToString()}`);
                    }
                }
            }
        }
    }

    public async getVectorDuplicates(queryResponse: BaseResponse): Promise<PotentialDuplicateResult> {
        let response: PotentialDuplicateResult = new PotentialDuplicateResult();

        for(const match of queryResponse.data.matches){
            const record: {id: string, score: number, metadata: { RecordID: string, Entity: string, TemplateID: string}} = match;
            if(!record || !record.id){
                continue;
            }

            if(!record.metadata || !record.metadata.RecordID){
                LogError(`Invalid vector metadata: ${record.id}`);
                continue;
            }

            let duplicate: PotentialDuplicate = new PotentialDuplicate();
            duplicate.LoadFromConcatenatedString(record.metadata.RecordID);
            duplicate.ProbabilityScore = record.score;
            response.Duplicates.push(duplicate);
        }

        return response;
    }
}
