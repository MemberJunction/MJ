import { Embeddings, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import { VectorBase } from '@memberjunction/ai-vectors';
import { BaseEntity, EntityField, LogError, LogStatus, Metadata, UserInfo } from '@memberjunction/core';
import { AIModelEntity, EntityDocumentEntity, EntityDocumentTypeEntity, TemplateContentEntity, TemplateEntity, VectorDatabaseEntity, VectorIndexEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { pipeline } from 'node:stream/promises';
import { RECORD_DUPLICATES_TYPE_ID } from '../constants';
import { EntityDocumentTemplateParser } from '../generic/EntityDocumentTemplateParser';
import { VectorSyncRequest } from '../generic/vectorSync.types';
import { BatchWorker } from './BatchWorker';
import { EntityDocumentCache } from './EntityDocumentCache';
import { PagedRecords } from './PagedRecords';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineServer } from '@memberjunction/templates';

LoadTemplateEntityExtended();

export type ArchiveWorkerContext = {
  executionId: number;
  entity: BaseEntity;
  entityDocument: EntityDocumentEntity;
};

export type AnnotateWorkerContext = {
  executionId: number;
  entity: BaseEntity;
  entityDocument: EntityDocumentEntity;
};

export class EntityVectorSyncer extends VectorBase {
  _startTime: Date;
  _endTime: Date;

  constructor() {
    super();
  }

  public async Config(contextUser?: UserInfo): Promise<void> {
    super.CurrentUser = contextUser;
    await EntityDocumentCache.Instance.Refresh(contextUser);
    await AIEngine.Instance.Config(false, contextUser);
    await TemplateEngineServer.Instance.Config(false, contextUser);
  }

  public async VectorizeEntity(request: VectorSyncRequest, contextUser?: UserInfo): Promise<any> {
    if (!contextUser) {
      throw new Error('ContextUser is required to vectorize the entity');
    }

    const startTime: number = new Date().getTime();
    super.CurrentUser = contextUser;
    const parser = EntityDocumentTemplateParser.CreateInstance();
    const entityDocument: EntityDocumentEntity = await this.GetEntityDocument(request.entityDocumentID);
    const vectorIndexEntity: VectorIndexEntity = await this.GetOrCreateVectorIndex(entityDocument);
    const obj = await this.GetVectorDatabaseAndEmbeddingClassByEntityDocumentID(request.entityDocumentID);

    const md = new Metadata();
    const entity = md.Entities.find((e) => e.ID === request.entityID);
    if (!entity) throw new Error(`Entity with ID ${request.entityID} not found.`);

    // this gets all the records, but we want to paginate
    // const allrecords: BaseEntity[] = await super.getRecordsByEntityID(request.entityID);

    //small number in the hopes we dont hit embedding token limits
    const pageSize: number = 2;

    const dataStream = new PagedRecords();
    const workerContext = { executionId: Date.now(), entity, entityDocument };
    const annotator = new BatchWorker({
      workerFile: resolve(__dirname, 'workers/annotationWorker.js'),
      batchSize: 3,
      concurrencyLimit: 2,
      workerContext,
    });
    const archiver = new BatchWorker({ workerFile: resolve(__dirname, 'workers/archiveWorker.js'), batchSize: 4, workerContext });

    const getData = async () => {
      let pageNumber = 0;
      let hasMore = true;
      while (hasMore) {
        const recordsPage: BaseEntity[] = await super.pageRecordsByEntityID<BaseEntity>(request.entityID, pageNumber, pageSize );
        const items: {}[] = recordsPage.map((e: BaseEntity) => e.GetAll());
        dataStream.addPage(items);
        if (recordsPage.length < pageSize) {
          hasMore = false;
          break;
        }
        // testing onlny
        if (pageNumber > 3) {
          hasMore = false;
          break;
        }
        pageNumber++;
      }
      dataStream.endStream();
    };

    // page data asynchrounously and add to the data stream
    getData();

    console.log('Starting pipeline');
    await pipeline(dataStream, annotator, archiver, new PassThrough({ objectMode: true }));

    // const chunks: BaseEntity[][] = this.chunkArray(allrecords, batchSize);
    // LogStatus(`Processing ${allrecords.length} records in ${chunks.length} chunks of ${batchSize} records each`);
    // LogStatus(`Processing page ${pageNumber} records of ${pageSize} records each`);

    // Now add the records to the vectorize queue
    // The vectorize queue consumer calls the embedding service to get the embeddings
    // Then adds vectors + record metadata to the storage queue
    // The storage queue consumer adds the vectors to the vector database

    // let count = 0;
    // for (const batch of chunks) {
    //   let templates: string[] = [];
    //   for (const record of batch) {
    //     let template: string = await parser.Parse(entityDocument.Template, request.entityID, record, contextUser);
    //     templates.push(template);
    //   }
    //   LogStatus(`parsing batch ${count}: done`);

    //   const embeddings: EmbedTextsResult = await obj.embedding.EmbedTexts({ texts: templates, model: null });
    //   LogStatus(`embedding batch ${count}: done`);

    //   const vectorRecords: VectorRecord[] = embeddings.vectors.map((vector: number[], index: number) => {
    //     const record: BaseEntity = batch[index];
    //     const recordID = record.PrimaryKey.Values('|');
    //     return {
    //       //The id breaks down to e.g. "Accounts_7_117"
    //       id: `${entityDocument.Entity}_${entityDocument.ID}_${recordID}`,
    //       values: vector,
    //       metadata: {
    //         EntityID: entityDocument.EntityID,
    //         EntityName: entityDocument.Entity,
    //         EntityDocumentID: entityDocument.ID,
    //         PrimaryKey: record.PrimaryKey.ToString(),
    //         Template: templates[index],
    //         Data: this.ConvertEntityFieldsToString(record),
    //       },
    //     };
    //   });

    //   const response: BaseResponse = await obj.vectorDB.createRecords(vectorRecords);
    //   if (response.success && vectorIndexEntity) {
    //     LogStatus('Successfully created vector records, creating associated Entity Record Documents...');
    //     for (const [index, vectorRecord] of vectorRecords.entries()) {
    //       try {
    //         let erdEntity: EntityRecordDocumentEntity = await super.Metadata.GetEntityObject('Entity Record Documents');
    //         erdEntity.NewRecord();
    //         erdEntity.EntityID = entityDocument.EntityID;
    //         erdEntity.RecordID = batch[index].PrimaryKey.ToString();
    //         erdEntity.DocumentText = templates[index];
    //         erdEntity.VectorID = vectorRecord.id;
    //         erdEntity.VectorJSON = JSON.stringify(vectorRecord.values);
    //         erdEntity.VectorIndexID = vectorIndexEntity.ID;
    //         erdEntity.EntityRecordUpdatedAt = new Date();
    //         erdEntity.EntityDocumentID = entityDocument.ID;
    //         let erdEntitySaveResult: boolean = await super.SaveEntity(erdEntity);
    //         if (!erdEntitySaveResult) {
    //           LogError('Error saving Entity Record Document Entity');
    //         }
    //       } catch (err) {
    //         LogError('Error saving Entity Record Document Entity');
    //         LogError(err);
    //       }
    //     }
    //   } else {
    //     LogError('Unable to successfully save records to vector database', undefined, response.message);
    //   }

    //   //add a delay to avoid rate limiting
    //   let delayRes = await this.delay(1000);
    //   count += 1;
    //   LogStatus(`Chunk ${count} of out ${chunks.length} processed`);
    // }

    const endTime: number = new Date().getTime();
    LogStatus(`Finished vectorizing ${entityDocument.Entity} entity in ${endTime - startTime} ms`);

    return null;
  }

  /**
   * This method will create a default Entity Document for the given entityID, vectorDatabase, and AIModel
   * @param entityID
   * @param vectorDatabase
   * @param AIModel
   * @returns
   */
  public async CreateDefaultEntityDocument(
    EntityID: string,
    VectorDatabase: VectorDatabaseEntity,
    AIModel: AIModelEntity
  ): Promise<EntityDocumentEntity> {
    const md = new Metadata();
    const entity = md.Entities.find((e) => e.ID === EntityID);
    if (!entity) throw new Error(`Entity with ID ${EntityID} not found.`);

    const EDTemplate: string = entity.Fields.map((ef) => {
      return `${ef.Name}: \$\{${ef.Name}\}`;
    }).join(' ');

    const entityDocument: EntityDocumentEntity = await md.GetEntityObject<EntityDocumentEntity>('Entity Documents');
    entityDocument.NewRecord();
    entityDocument.Name = `Default duplicate record Entity Document for the ${entity.Name} entity using vector database ${VectorDatabase.Name} and AI Model ${AIModel.Name}`;
    entityDocument.EntityID = EntityID;
    entityDocument.TypeID = RECORD_DUPLICATES_TYPE_ID;
    entityDocument.Status = 'Active';
    entityDocument.TemplateID = EDTemplate;
    entityDocument.VectorDatabaseID = VectorDatabase.ID;
    entityDocument.AIModelID = AIModel.ID;
    let saveResult = await this.SaveEntity(entityDocument);
    if (saveResult) {
      return entityDocument;
    } else {
      throw new Error(`Failed to save Entity Document for ${EntityID}`);
    }
  }

  protected async GetVectorDatabaseAndEmbeddingClassByEntityDocumentID(
    entityDocumentID: string,
    createDocumentIfNotFound: boolean = false
  ): Promise<{ embedding: Embeddings; vectorDB: VectorDBBase }> {
    let entityDocument: EntityDocumentEntity | null =
      (await this.GetEntityDocument(entityDocumentID)) || (await this.GetFirstActiveEntityDocumentForEntity(entityDocumentID));
    if (!entityDocument) {
      if (createDocumentIfNotFound) {
        if (!entityDocument) {
          LogStatus(`No active Entity Document found for entity ${entityDocumentID}, creating one`);
          const defaultVectorDB: VectorDatabaseEntity = this.getVectorDatabase();
          const defaultAIModel: AIModelEntity = this.getAIModel();
          entityDocument = await this.CreateDefaultEntityDocument(entityDocumentID, defaultVectorDB, defaultAIModel);
        }
      } else {
        throw new Error(`No Entity Document found for ID=${entityDocumentID}`);
      }
    }

    LogStatus(`Using vector database ${entityDocument.VectorDatabaseID} and AI Model ${entityDocument.AIModelID}`);

    const vectorDBEntity: VectorDatabaseEntity = this.getVectorDatabase(entityDocument.VectorDatabaseID);
    const aiModelEntity: AIModelEntity = this.getAIModel(entityDocument.AIModelID);

    const embeddingAPIKey: string = GetAIAPIKey(aiModelEntity.DriverClass);
    const vectorDBAPIKey: string = GetAIAPIKey(vectorDBEntity.ClassKey);

    if (!embeddingAPIKey) {
      throw Error(`No API Key found for AI Model ${aiModelEntity.DriverClass}`);
    }

    if (!vectorDBAPIKey) {
      throw Error(`No API Key found for Vector Database ${vectorDBEntity.ClassKey}`);
    }

    //LogStatus(`Embedding API Key: ${embeddingAPIKey} VectorDB API Key: ${vectorDBAPIKey}`);
    const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<Embeddings>(Embeddings, aiModelEntity.DriverClass, embeddingAPIKey);
    const vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, vectorDBEntity.ClassKey, vectorDBAPIKey);

    if (!embedding) {
      throw Error(`Failed to create Embeddings instance for AI Model ${aiModelEntity.DriverClass}`);
    }

    if (!vectorDB) {
      throw Error(`Failed to create Vector Database instance for ${vectorDBEntity.ClassKey}`);
    }

    return { embedding, vectorDB };
  }

  public async GetEntityDocument(EntityDocumentID: string): Promise<EntityDocumentEntity | null> {
    const cache = EntityDocumentCache.Instance;
    if (!cache.IsLoaded) {
      await cache.Refresh(super.CurrentUser);
    }
    return cache.GetDocument(EntityDocumentID);
  }

  public async GetEntityDocumentByName(EntityDocumentName: string, ContextUser?: UserInfo): Promise<EntityDocumentEntity | null> {
    const cache = EntityDocumentCache.Instance;
    if (!cache.IsLoaded) {
      await cache.Refresh(ContextUser);
    }
    return cache.GetDocumentByName(EntityDocumentName);
  }

  public async GetFirstActiveEntityDocumentForEntity(entityID: string): Promise<EntityDocumentEntity | null> {
    const entityDocumentTypeID: EntityDocumentTypeEntity | undefined = AIEngine.EntityDocumentTypes.find((documentType: EntityDocumentTypeEntity) => documentType.Name === 'Record Duplicate');

    if (!entityDocumentTypeID) {
      throw new Error('Entity Document Type not found');
    }

    const entityDocument: EntityDocumentEntity = await this.runViewForSingleValue<EntityDocumentEntity>(
      'Entity Documents',
      `EntityID = '${entityID}' AND TypeID = '${entityDocumentTypeID.ID}' AND Status = 'Active'`
    );
    if (!entityDocument) {
      LogError(`No active Entity Document with entityID=${entityID} found`);
      return null;
    }

    return entityDocument;
  }

  private async GetOrCreateVectorIndex(entityDocument: EntityDocumentEntity): Promise<VectorIndexEntity> {
    let vectorIndexEntity: VectorIndexEntity = await super.runViewForSingleValue(
      'Vector Indexes',
      `VectorDatabaseID = '${entityDocument.VectorDatabaseID}' AND EmbeddingModelID = '${entityDocument.AIModelID}'`
    );
    if (vectorIndexEntity) {
      return vectorIndexEntity;
    }

    LogStatus(`No Vector Index found for entityDocument ${entityDocument.ID}, creating one`);
    try {
      vectorIndexEntity = await super.Metadata.GetEntityObject<VectorIndexEntity>('Vector Indexes');
      vectorIndexEntity.NewRecord();
      vectorIndexEntity.VectorDatabaseID = entityDocument.VectorDatabaseID;
      vectorIndexEntity.EmbeddingModelID = entityDocument.AIModelID;
      vectorIndexEntity.Name = `Vector Index for entityDocument ${entityDocument.EntityID}`;
      vectorIndexEntity.Set('EntityRecordUpdatedAt', new Date());
      vectorIndexEntity.Set('EntityDocumentID', entityDocument.ID);
      //not a very descriptive description, but the view has the name of the vectorDB and embedding model used
      vectorIndexEntity.Description = `Vector Index that uses the Vector database ${entityDocument.VectorDatabaseID} and ${entityDocument.AIModelID} as the embedding model`;
      const saveResult = await super.SaveEntity(vectorIndexEntity);
      if (saveResult) {
        LogStatus(`Successfully created new Vector Index Entity`);
        return vectorIndexEntity;
      } else {
        LogError('Error saving Vector Index Entity');
        return null;
      }
    } catch (err) {
      console.error(JSON.stringify(err));
      LogError(err);
      return null;
    }
  }

  protected async CreateTemplateForEntityDocument(entityDocument: EntityDocumentEntity): Promise<TemplateEntity> {
    const templateEntity: TemplateEntity = await super.Metadata.GetEntityObject<TemplateEntity>('Templates');
    templateEntity.NewRecord();
    templateEntity.Name = `Template for EntityDocument ${entityDocument.EntityID}`;
    templateEntity.Description = `The template used by EntityDocument ${entityDocument.ID}`
    templateEntity.UserID = super.CurrentUser.ID;
    templateEntity.IsActive = true;
    templateEntity.CategoryID = null;

    const templateEntitySaveResult = await templateEntity.Save();
    if(!templateEntitySaveResult){
      LogError('Error saving Template Entity', undefined, templateEntity.LatestResult);
      throw new Error(templateEntity.LatestResult.Message);
    }

    TemplateEngineServer.Instance.AddTemplate(templateEntity);

    //next, create the template contents record
    const templateContentsEntity: TemplateContentEntity = await super.Metadata.GetEntityObject<TemplateContentEntity>('Template Contents');
    templateContentsEntity.NewRecord();
    templateContentsEntity.TemplateID = templateEntity.ID;


    
  }

  private chunkArray(array: any[], chunkSize: number): BaseEntity[][] {
    let arrayCopy = [...array];
    let result: BaseEntity[][] = [];
    while (arrayCopy.length) {
      result.push(arrayCopy.splice(0, chunkSize));
    }
    return result;
  }

  private convertPrimaryKeysToList(primaryKeys: EntityField[]): any {
    return primaryKeys.map((pk) => {
      return `${pk.Name}=${pk.Value}`;
    });
  }

  private ConvertEntityFieldsToString(entity: BaseEntity): string {
    let obj = {};
    for (const field of entity.Fields) {
      obj[field.Name] = field.Value;
    }

    return JSON.stringify(obj);
  }

  private delay = (delayInms) => {
    return new Promise((resolve) => setTimeout(resolve, delayInms));
  };
}
function LoadTemplateEntityExtended() {
  throw new Error('Function not implemented.');
}

