import * as fs from 'fs';
import { EntitySyncConfig } from './models/entitySyncConfig';
import SQLConnectionPool from "./db/db";
import { SQLServerDataProvider, SQLServerProviderConfigData, setupSQLServerClient } from "@memberjunction/sqlserver-dataprovider";
import AppDataSource from "./db/dbAI";
import { IMetadataProvider, RunView, RunViewParams, RunViewResult, UserInfo } from "@memberjunction/core";
import { currentUserEmail, mistralAPIKey, pineconeAPIKey } from "./config";
import { IEmbedding, MistralAIEmbedding } from '@memberjunction/vectors';
import { PineconeDatabase } from '@memberjunction/vectors-pinecone';
import { IProcedureResult, Request } from 'mssql';
import { EntityDocument, EntitiyRecordDocument } from './generic/entity.types';
import { VectorSyncBase } from './generic/vectorSyncBase';

export class EntityVectorSyncer extends VectorSyncBase {

    _provider: SQLServerDataProvider;
    _userInfo: UserInfo;
    _runView: RunView;

    _startTime: Date; 
    _endTime: Date;

    _embedding: IEmbedding;
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

        console.log("Saving updated entity configs to file");
        this.saveJSONData(entityConfigs, './data/entitiesToSync.json');
        
        this.end();
        console.log(`Sync completed in ${this.timeDiff()} seconds`);
    } 

    private getJSONData = (): EntitySyncConfig[] => { 
        const entities: EntitySyncConfig[] = JSON.parse(fs.readFileSync('./data/entitiesToSync.json', 'utf-8'));
        return entities;
    }

    private async syncEntityDocument(config: EntitySyncConfig): Promise<any> {
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

            for(const record of result.Results){
                //the record needs to have an ID and UpdatedAt column
                if(!record.ID || !record.UpdatedAt || record.UpdatedAt <= lastRunDate){
                    continue;
                }

                //record has been updated since we last ran this, so create a new vector embedding
                //upload the embedding to the vector database
                //and update MJ with the new embedding
                const formattedTemplate: string = this.parseStringTemplate(entityDocument.Template, record);
                
                const embeddingRes: number[] = await this._embedding.createEmbedding(formattedTemplate);
                
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

                const existingRecord = await this._pineconeDB.getRecord(vectorRecordID);
                if(existingRecord){
                    await this._pineconeDB.updateRecord({
                        id: upsertResult.recordset[0].ID.toString(),
                        values: embeddingRes,
                    });
                }
                else{
                    console.log("creating new pinecone record for record", vectorRecordID);
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

    private async getEntityDocument(entityDocumentID: number): Promise<EntityDocument> {
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

    private async getRelatedEntityRecords(entityDocument: EntityDocument): Promise<any> {
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
        let params: any;
        if(sp === "admin.spCreateEntityRecordDocument"){
            params = {
                EntityID: document.EntityID,
                RecordID: document.RecordID,
                DocumentText: document.DocumentText,
                VectorIndexID: document.VectorIndexID,
                VectorID: document.VectorID,
                VectorJSON: document.VectorJSON,
                EntityRecordUpdatedAt: document.EntitiyRecordUpdatedAt
            };
        }
        else{
            params = {
                ID: document.ID,
                EntityID: document.EntityID,
                RecordID: document.RecordID,
                DocumentText: document.DocumentText,
                VectorIndexID: document.VectorIndexID,
                VectorID: document.VectorID,
                VectorJSON: document.VectorJSON,
                EntityRecordUpdatedAt: document.EntitiyRecordUpdatedAt
            };
        }
        const result = await this.executeStoredProcedure<EntitiyRecordDocument>(sp, params);
        return result;
    }
}