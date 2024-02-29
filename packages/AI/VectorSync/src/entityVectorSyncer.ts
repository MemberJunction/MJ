import * as fs from 'fs';
import { EntitySyncConfig } from './models/entitySyncConfig';
import SQLConnectionPool from "./db/db";
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient } from "@memberjunction/sqlserver-dataprovider";
import AppDataSource from "./db/dbAI";
import { IMetadataProvider, RunView, RunViewParams, RunViewResult, UserInfo } from "@memberjunction/core";
import { currentUserEmail } from "./config";
import { PineconeDatabase } from '@memberjunction/ai-vectors-pinecone';
import { IProcedureResult, Request } from 'mssql';
import {BaseLLM, GetAIAPIKey} from '@memberjunction/ai';
import { MistralLLM } from '@memberjunction/ai-mistral';

export class EntityVectorSyncer {

    _provider: SQLServerDataProvider;
    _userInfo: UserInfo;
    _runView: RunView;

    _startTime: Date; 
    _endTime: Date;

    _pineconeDB: PineconeDatabase;
    _embedding: BaseLLM;

    public async syncEntityDocuments(): Promise<void> {
        this.start();
        await this.setupDBConnection();
        console.log("Connected to SQL Server");
        console.log("Syncing entities...");

        const pineconeAPIKey = GetAIAPIKey("PineconeDatabase");
        console.log("Pinecone API Key: ", pineconeAPIKey);

        const mistralAPIKey = GetAIAPIKey("MistralLLM");
        console.log("Mistral API Key: ", mistralAPIKey);
        return;

        this._pineconeDB = new PineconeDatabase(pineconeAPIKey);
        this._embedding = new MistralLLM(mistralAPIKey); 

        const entityConfigs: EntitySyncConfig[] = this.getJSONData();
        const activeCount: number = entityConfigs.filter((entity: EntitySyncConfig) => entity.IncludeInSync).length;
        console.log(`${entityConfigs.length} entity config(s) found, ${activeCount} marked active`);

        for(const entityConfig of entityConfigs){
            if(entityConfig.IncludeInSync){
                console.log(`Syncing entity document with ID ${entityConfig.EntityDocumentID}`);
                await this.syncEntityDocument(entityConfig);
                entityConfig.LastRunDate = new Date().toISOString();
            }
            else{
                console.log(`Skipping entity document with ID ${entityConfig.EntityDocumentID}`);
            }
        }
        this.saveJSONData(entityConfigs);
        this.end();
        console.log(`Sync completed in ${this.timeDiff()} seconds`);
    } 

    public getJSONData = (): EntitySyncConfig[] => { 
        const entities: EntitySyncConfig[] = JSON.parse(fs.readFileSync('./data/entitiesToSync.json', 'utf-8'));
        return entities;
    }

    public async setupDBConnection(): Promise<void> {
        await SQLConnectionPool.connect();
        this._provider = await this.setupAndGetSQLServerProvider();
        this._userInfo = this.getDefaultUser(this._provider);
        this._runView = new RunView();
    }

    public setupAndGetSQLServerProvider = async (): Promise<SQLServerDataProvider> => {
        const config = new SQLServerProviderConfigData(AppDataSource, currentUserEmail);
        return await setupSQLServerClient(config);
    }

    public getDefaultUser(provider: IMetadataProvider): UserInfo {
        return new UserInfo(provider, 
            { Email: currentUserEmail,
                UserRoles: [
                    { UserID: 24, RoleName: "Developer", CreatedAt: new Date(), UpdatedAt: new Date(), User: "Jonathan Stfelix" },
                    {UserID: 24, RoleName: "UI", CreatedAt: new Date(), UpdatedAt: new Date(), User: "Jonathan Stfelix" }
                ] 
            });
    }

    private async timer(ms: number): Promise<unknown> {
        return new Promise(res => setTimeout(res, ms));
    }

    public async syncEntityDocument(config: EntitySyncConfig): Promise<any> {
        const entityDocument: EntityDocument = await this.getEntityDocument(config.EntityDocumentID);
        if(!entityDocument){
            console.log(`Error: no entity document with ID ${config.EntityDocumentID} found`);
            return;
        }

        if(entityDocument.Status !== "Active"){
            console.log(`Entity document with ID ${config.EntityDocumentID} is not set to Active. Is: ${entityDocument.Status}`);
            return;
        }

        const lastRunDate: Date = new Date(config.LastRunDate);
        console.log(`Last run date for entity document ${entityDocument.ID}: ${lastRunDate}`);

        let offset: number = 0;
        let fetchNext: number = 50;
        let limit: number = 100
        let shouldContinue: boolean = true;

        while(shouldContinue){
            const rvParams: RunViewParams = {
                EntityName: entityDocument.Type,
                //get the records in batches
                OrderBy: `ID OFFSET ${offset} ROWS FETCH NEXT ${fetchNext} ROWS ONLY`,
                IgnoreMaxRows: true
            }

            let result: RunViewResult = await this._runView.RunView(rvParams, this._userInfo);
            console.log("processing embedding batch #", (offset/fetchNext) + 1, `of ${entityDocument.Type}-${entityDocument.Name} records`);

            for(const record of result.Results as any[]){
                //the record needs to have an ID and UpdatedAt column
                if(!record.ID || !record.UpdatedAt || record.UpdatedAt <= lastRunDate){
                    continue;
                }

                //record has been updated since we last ran this, so create a new vector embedding
                //upload the embedding to the vector database
                //and update MJ with the new embedding
                const formattedTemplate: string = this.parseStringTemplate(entityDocument.Template, record);
                
                const embedResponse = this._embedding.EmbedText({text: formattedTemplate, model: null});
                const embeddingRes: number[] = (await embedResponse).data;
                
                //add a delay to avoid rate limiting
                await this.timer(100);

                const recordID: number = record.ID;

                //verify the entity record document record exists by querying DB
                //rather than basing its existence on if there's an
                //associated record in the vector database
                const entityRecordDocument = await this.getEntityRecordDocument(entityDocument.EntityID, recordID, config.VectorIndexID, config.VectorID);
                const erdID: number = entityRecordDocument ? entityRecordDocument.ID : -1;
                
                //console.log("upserting entity record document", erdID);
                let upsertResult: IProcedureResult<EntitiyRecordDocument> = await this.upsertEntityRecordDocument({
                    ID: erdID,
                    EntityID: entityDocument.EntityID,
                    RecordID: recordID,
                    DocumentText: formattedTemplate,
                    VectorIndexID: config.VectorIndexID,
                    VectorID: config.VectorID,
                    VectorJSON: JSON.stringify(embeddingRes), 
                    EntitiyRecordUpdatedAt: record.UpdatedAt 
                });
                
                let vectorRecordID: string = upsertResult?.recordset[0].ID?.toString();
                if(!vectorRecordID){
                    vectorRecordID = `${entityDocument.Type}${entityDocument.Name}${recordID}`
                }

                const existingRecord = (await this._pineconeDB.getRecord({id: vectorRecordID})).data;
                if(existingRecord){
                    await this._pineconeDB.updateRecord({
                        id: null,
                        data: {
                            id: vectorRecordID,
                            values: embeddingRes
                        }
                    });
                }
                else{
                    const pineconeRecord: any = {
                        id: vectorRecordID, 
                        values: embeddingRes,
                        metadata: {
                            Template: formattedTemplate
                        }
                    }

                    await this._pineconeDB.createRecord(pineconeRecord);
                }
            }

            offset += fetchNext; 
            if(result.RowCount === 0 || offset >= limit){
                shouldContinue = false;
            }
        }
    }

    public async getEntityDocument(entityDocumentID: number): Promise<EntityDocument> {
        const rvResult: RunViewResult = await this._runView.RunView({
            EntityName: "Entity Documents",
            ExtraFilter: `ID = '${entityDocumentID}'`
        }, this._userInfo);

        if(!rvResult || rvResult.RowCount === 0){
            
            return null;
        }
        else{
            const vdResults = rvResult?.Results as any[];
            const entityDocument: EntityDocument = vdResults[0];
            return entityDocument;
        }
    }

    public async getRelatedEntityRecords(entityDocument: EntityDocument): Promise<any> {
        const rvResult: RunViewResult = await this._runView.RunView({
            EntityName: "Entity Documents",
            ExtraFilter: `ID = '${entityDocument.ID}'`
        }, this._userInfo);

        if(!rvResult || rvResult.RowCount === 0){
            
            return null;
        }
        else{
            const vdResults = rvResult?.Results as any[];
            const entityDocument: EntityDocument = vdResults[0];
            return entityDocument;
        }
    }

    private async getEntityRecordDocument(entityID: number, recordID: number, VectorIndexID: number, VectorID): Promise<EntitiyRecordDocument> {
        const rvResult: RunViewResult = await this._runView.RunView({
            EntityName: "Entity Record Documents",
            ExtraFilter: `EntityID = ${entityID} AND RecordID = ${recordID} AND VectorIndexID = ${VectorIndexID} AND VectorID = ${VectorID}`,
            OrderBy: 'ID'
        }, this._userInfo);

        if(!rvResult || rvResult.RowCount === 0){
            return null;
        }
        else{
            //ideally there should only be one result
            const vdResults = rvResult?.Results as any[];
            const entityDocument: EntitiyRecordDocument = vdResults[0];
            return entityDocument;
        }
    }

    private async upsertEntityRecordDocument(document: EntitiyRecordDocument): Promise<IProcedureResult<EntitiyRecordDocument>> {
        const sp: string = document.ID <= -1 ? "admin.spCreateEntityRecordDocument" : "admin.spUpdateEntityRecordDocument";
        let params = {
            ID: document.ID,
            EntityID: document.EntityID,
            RecordID: document.RecordID,
            DocumentText: document.DocumentText,
            VectorIndexID: document.VectorIndexID,
            VectorID: document.VectorID,
            VectorJSON: document.VectorJSON,
            EntityRecordUpdatedAt: document.EntitiyRecordUpdatedAt
        };

        if(sp === "admin.spCreateEntityRecordDocument"){
            delete params.ID;
        }

        const result = await this.executeStoredProcedure<EntitiyRecordDocument>(sp, params);
        return result;
    }

    private async executeStoredProcedure<T>(storedProcedure: string, params: any): Promise<IProcedureResult<T>> {
        try {
            const request = SQLConnectionPool.request();
            this.mapObjectPropertiesToRequest(params, request);
            return request.execute<T>(storedProcedure);
        }
        catch(error){
            console.log(error);
            return null;
        }
    }

    /**
    * Collect Data for Procedure
    * @param obj
    * @param r
    * @returns data
    */
    mapObjectPropertiesToRequest = (obj: any, r: Request) => {
        // Generic iteration over object properties and map to input() of request
        // Doing this generically makes it way simpler over time to handle new
        // properties that are added to various types
        Object.keys(obj).map((key: string) => {
        r.input(key, obj[key]);
        });
    };

    private parseStringTemplate(str: string, obj: any): string {
        //Split string into non-argument textual parts
        let parts = str.split(/\$\{(?!\d)[\wæøåÆØÅ]*\}/);
    
        //Split string into property names. Empty array if match fails.
        let args = str.match(/[^{\}]+(?=})/g) || [];
    
        //Map parameters from obj by property name. Solution is limited by shallow one level mapping. 
        //Undefined values are substituted with an empty string, but other falsy values are accepted.
        let parameters = args.map(argument => obj[argument] || (obj[argument] === undefined ? "" : obj[argument]));
        return String.raw({ raw: parts }, ...parameters);
    }

    private start(): void {
        this._startTime = new Date();
    }

    private end(): void {
        this._endTime = new Date();
    }

    private timeDiff(): number {
        let timeDiff = this._endTime.valueOf() - this._startTime.valueOf(); //in ms
        // strip the ms
        timeDiff /= 1000;
      
        // get seconds 
        var seconds = Math.round(timeDiff);
        return seconds;
    }

    private saveJSONData(data: EntitySyncConfig[]): void {
        fs.writeFileSync('./data/entitiesToSync.json', JSON.stringify(data, null, 2));
    }
}

type EntityDocument = {
    ID: number,
    Name: string,
    EntityID: number,
    TypeID: number,
    Status: string,
    Template: string,
    CreatedAt: Date,
    UpdatedAt: Date,
    Type: string,
    VectorIndexID: number,
    VectorID: number
}

type EntitiyRecordDocument = {
    ID: number,
    EntityID: number,
    RecordID: number,
    DocumentText: string,
    VectorIndexID: number,
    VectorID: number,
    VectorJSON: string,
    EntitiyRecordUpdatedAt: Date
}