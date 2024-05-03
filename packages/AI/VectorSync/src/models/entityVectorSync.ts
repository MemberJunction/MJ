import { EntitySyncConfig } from '../generic/entitySyncConfig.types';
import { BaseEntity, EntityField, LogError, LogStatus, PrimaryKeyValue, RunViewParams, RunViewResult, UserInfo,  } from "@memberjunction/core";
import { IProcedureResult, Request } from 'mssql';
import { EmbedTextsParams, EmbedTextsResult, Embeddings, GetAIAPIKey} from '@memberjunction/ai';
import { BaseResponse, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { MJGlobal } from '@memberjunction/global';
import { AIModelEntity, EntityDocumentEntity, EntityRecordDocumentEntity, VectorDatabaseEntity, VectorIndexEntity } from '@memberjunction/core-entities';
import { AIEngine } from "@memberjunction/aiengine";
import { vectorSyncRequest } from '../generic/vectorSync.types';
import { VectorBase } from '@memberjunction/ai-vectors'

export class EntityVectorSyncer extends VectorBase {
    _startTime: Date; 
    _endTime: Date;

    constructor(){
        super();
    }

    public async vectorizeEntity(request: vectorSyncRequest, contextUser: UserInfo): Promise<any> {
        super.CurrentUser = contextUser;
        const entityDocument: EntityDocumentEntity = await super.getEntityDocument(request.entityDocumentID);
        const vectorIndexEntity: VectorIndexEntity = await this.getOrCreateVecotrIndex(entityDocument);
        const obj = await super.getVectorDatabaseAndEmbeddingClassByEntityDocumentID(request.entityDocumentID);
        const allrecords: BaseEntity[] = await super.getRecordsByEntityID(request.entityID);
        
        //small number in the hopes we dont hit embedding token limits
        const batchSize: number = 20;
        const chunks: BaseEntity[][] = this.chunkArray(allrecords, batchSize);
        LogStatus(`Processing ${allrecords.length} records in ${chunks.length} chunks of ${batchSize} records each`);

        for (const batch of chunks){
            let templates: string[] = [];
            for(const record of batch){
                templates.push(super.parseStringTemplate(entityDocument.Template, record));
            }

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
                        erdEntity.ContextCurrentUser = contextUser;
                        let erdEntitySaveResult: boolean = await erdEntity.Save();
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
        }

        return null;
    }

    private async getOrCreateVecotrIndex(entityDocument: EntityDocumentEntity): Promise<VectorIndexEntity> {
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
            vectorIndexEntity.ContextCurrentUser = super.CurrentUser;
            const saveResult = await vectorIndexEntity.Save();
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
}