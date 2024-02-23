import * as fs from 'fs';
import { EntitySyncConfig } from './models/entitySyncConfig';
import SQLConnectionPool from "./db/db";
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient } from "@memberjunction/sqlserver-dataprovider";
import AppDataSource from "./db/dbAI";
import { IMetadataProvider, RunView, RunViewParams, RunViewResult, UserInfo } from "@memberjunction/core";
import { currentUserEmail, mistralAPIKey, pineconeAPIKey } from "./config";
import { IEmbeddingBase, MistralAIEmbedding } from '@memberjunction/vectors';
import { PineconeDatabase } from '@memberjunction/vectors-pinecone';

export class EntityVectorSyncer {

    _provider: SQLServerDataProvider;
    _userInfo: UserInfo;
    _runView: RunView;

    _startTime: Date; 
    _endTime: Date;

    _embedding: IEmbeddingBase;
    _pineconeDB: PineconeDatabase;

    public async syncEntityDocuments(): Promise<void> {
        this.start();
        await this.setupDBConnection();
        console.log("Connected to SQL Server");
        console.log("Syncing entities...");

        this._embedding = new MistralAIEmbedding(mistralAPIKey);
        this._pineconeDB = new PineconeDatabase(pineconeAPIKey);

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
        let fetchNext: number = 5;
        let limit: number = 5
        let shouldContinue: boolean = true;

        while(shouldContinue){
            const rvParams: RunViewParams = {
                EntityName: entityDocument.Type,
                //get the records in batches
                OrderBy: `ID OFFSET ${offset} ROWS FETCH NEXT ${fetchNext} ROWS ONLY`,
                IgnoreMaxRows: true
            }

            let result: RunViewResult = await this._runView.RunView(rvParams, this._userInfo);
            console.log("processing embedding batch #", (offset/fetchNext) + 1);

            for(const record of result.Results){
                //the record needs to have an UpdatedAt column
                if(record.UpdatedAt && record.UpdatedAt <= lastRunDate){
                    continue;
                }

                //record has been updated since we last ran this, so create a new vector embedding
                //upload the embedding to the vector database
                //and update MJ with the new embedding
                const formattedTemplate: string = this.parseStringTemplate(entityDocument.Template, record);
                //console.log(formattedTemplate);
                //console.log(record);

                const embeddingRes: number[] = await this._embedding.createEmbedding(formattedTemplate);
                //await this.timer(100);
                const recordID: string = entityDocument.ID.toString();
                const existingRecord = await this._pineconeDB.getRecord(recordID);
                if(existingRecord){
                    await this._pineconeDB.updateRecord({
                        id: recordID,
                        values: embeddingRes,
                    });
                }
                else{
                    const pineconeRecord: any = {
                        id: recordID, 
                        values: embeddingRes,
                        metadata: {
                            Template: formattedTemplate
                        }
                    }

                    await this._pineconeDB.createRecord(pineconeRecord);
                }
            }

            if(result.RowCount === 0 || offset >= limit){
                shouldContinue = false;
            }
            else{
                offset += fetchNext; 
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
    Type: string
}