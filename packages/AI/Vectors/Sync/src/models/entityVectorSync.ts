import { Embeddings, EmbedTextsResult, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { VectorBase } from '@memberjunction/ai-vectors';
import { BaseEntity, EntityField, EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { AIModelEntity, EntityDocumentEntity, EntityDocumentTypeEntity, EntityRecordDocumentEntity, TemplateContentEntity, TemplateContentTypeEntity, TemplateEntity, TemplateParamEntity, VectorDatabaseEntity, VectorIndexEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { pipeline } from 'node:stream/promises';
import { RECORD_DUPLICATES_TYPE_ID } from '../constants';
import { EmbeddingData, VectorSyncRequest } from '../generic/vectorSync.types';
import { BatchWorker } from './BatchWorker';
import { EntityDocumentCache } from './EntityDocumentCache';
import { PagedRecords } from './PagedRecords';
import { resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateEntityExtended } from '@memberjunction/templates-base-types';
import { EntityRecordDocumentWorker } from './EntityRecordDocumentWorker';

export type AnnotateWorkerContext = {
  executionId: number;
  entity: BaseEntity;
  entityDocument: Record<string, unknown>;
  template: TemplateEntityExtended;
  templateContent: TemplateContentEntity;
  embeddingDriverClass: string;
  embeddingAPIKey: string;
};

export type ArchiveWorkerContext = {
  executionId: number;
  entity: BaseEntity;
  entityDocument: EntityDocumentEntity;
  vectorDBClassKey: string;
  vectorDBAPIKey: string;
  embeddings: EmbedTextsResult;
};

export type TemplateParamData = {
  ParamName: string;
  Data: BaseEntity[];
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
    await TemplateEngineServer.Instance.Config(false, contextUser);
    //const parser = EntityDocumentTemplateParser.CreateInstance();
    const entityDocument: EntityDocumentEntity = await this.GetEntityDocument(request.entityDocumentID);
    const vectorIndexEntity: VectorIndexEntity = await this.GetOrCreateVectorIndex(entityDocument);
    const obj = await this.GetVectorDatabaseAndEmbeddingClassByEntityDocumentID(request.entityDocumentID);

    const md = new Metadata();
    const entity = md.Entities.find((e) => e.ID === request.entityID);
    if (!entity) throw new Error(`Entity with ID ${request.entityID} not found.`);


    const template: TemplateEntityExtended | undefined = TemplateEngineServer.Instance.Templates.find((t: TemplateEntityExtended) => t.ID === entityDocument.TemplateID);
    if(!template){
      throw new Error(`Template not found with ID ${entityDocument.TemplateID}`);
    }

    if(template.Content.length === 0){
      throw new Error(`Template ${template.ID} does not have an associated Template Content record`);
    }

    if(template.Content.length > 1){
      throw new Error('Templates used by Entity Documents should only have one associated Template Content record.');
    }

    const validTemplate: boolean = this.ValidateTemplateContextParamAlignment(template);

    // this gets all the records, but we want to paginate
    // const allrecords: BaseEntity[] = await super.getRecordsByEntityID(request.entityID);

    //small number in the hopes we dont hit embedding token limits
    const pageSize: number = 15;
    const dataStream = new PagedRecords();
    
    let templateObj: {} = {
      ...template.GetAll(),
      Params: template.Params.map((p) => p.GetAll())
    }; 

    const workerContext = { 
      executionId: Date.now(), 
      entity, 
      entityDocument: entityDocument.GetAll(),
      template: templateObj,
      templateContent: template.Content[0].GetAll(),
      vectorDBClassKey: obj.vectorDBClassKey,
      vectorDBAPIKey: obj.vectorDBAPIKey,
      embeddingDriverClass: obj.embeddingDriverClass,
      embeddingAPIKey: obj.embeddingAPIKey
    };

    //annotator worker handles vectorizing the records 
    const annotator = new BatchWorker({
      workerFile: resolve(__dirname, 'workers/annotationWorker.js'),
      batchSize: 3,
      concurrencyLimit: 2,
      contextUser: super.CurrentUser,
      workerContext,
    });

    //archiver worker handles upserting the vectors into the vector database
    const archiver = new BatchWorker({ 
      workerFile: resolve(__dirname, 'workers/archiveWorker.js'), 
      batchSize: 4,
      contextUser: super.CurrentUser, 
      workerContext
    });

    const upserter = new EntityRecordDocumentWorker({
      workerFile: resolve(__dirname, 'workers/upserter.js'),
      batchSize: 4,
      contextUser: super.CurrentUser,
      workerContext
    });

    upserter.SetUpsertEntityRecordDocumentCallback(this.UpsertEntityRecordDocumentRecords);

    const getData = async (): Promise<void> => {
      let pageNumber = 0;
      let hasMore = true;

      while (hasMore) {
        const recordsPage: BaseEntity[] = await super.pageRecordsByEntityID<BaseEntity>(request.entityID, pageNumber, pageSize);
        const relatedData: TemplateParamData[] = await this.GetRelatedTemplateDataForBatch(entity, recordsPage, template);
        const items: {}[] = [];
        
        for(const record of recordsPage){
          const templateData: { [key: string]: unknown } = await this.GetTemplateData(entity, record, template, relatedData);
          //we need a reference to this record's ID for the upsert worker
          templateData.__mj_recordID = record.FirstPrimaryKey.Value;
          //we also need a reference to the vector index's ID
          templateData.VectorIndexID = vectorIndexEntity.ID;
          templateData.TemplateContent = template.Content[0].TemplateText;
          items.push(templateData);
        }

        dataStream.addPage(items);
        if(recordsPage.length < pageSize) {
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
    await pipeline(dataStream, annotator, archiver, upserter, new PassThrough({ objectMode: true }));

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
  ): Promise<{ embedding: Embeddings; vectorDB: VectorDBBase, vectorDBClassKey: string, vectorDBAPIKey: string, embeddingDriverClass: string, embeddingAPIKey: string }> {
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

    LogStatus(`Using vector database ${vectorDBEntity.Name} and AI Model ${aiModelEntity.Name}`);

    const obj = { 
      embedding, 
      vectorDB, 
      vectorDBClassKey: vectorDBEntity.ClassKey, 
      vectorDBAPIKey: vectorDBAPIKey,
      embeddingDriverClass: aiModelEntity.DriverClass,
      embeddingAPIKey: embeddingAPIKey
    };

    return obj;
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
    const templateEntity: TemplateEntityExtended = await super.Metadata.GetEntityObject<TemplateEntityExtended>('Templates');
    templateEntity.NewRecord();
    templateEntity.Name = `Template for EntityDocument ${entityDocument.EntityID}`;
    templateEntity.Description = `The template used by EntityDocument ${entityDocument.ID}`
    templateEntity.UserID = super.CurrentUser.ID;
    templateEntity.IsActive = true;
    templateEntity.CategoryID = null;

    const templateEntitySaveResult = await super.SaveEntity(templateEntity);
    if(!templateEntitySaveResult){
      LogError('Error saving Template Entity', undefined, templateEntity.LatestResult);
      throw new Error(templateEntity.LatestResult.Message);
    }
    LogStatus(`Successfully created new Template Entity ${templateEntity.ID}`);

    //next, create the template contents record
    await TemplateEngineServer.Instance.Config(false, super.CurrentUser);
    const textContentType: TemplateContentTypeEntity = TemplateEngineServer.Instance.TemplateContentTypes.find((type: TemplateContentTypeEntity) => type.Name === 'Text');
    if(!textContentType){
      throw new Error('Text template content type not found');
    }

    const entityFields: EntityField[] = await this.GetEntityFieldsForSimilaritySearch(entityDocument.EntityID);

    const templateContentsEntity: TemplateContentEntity = await super.Metadata.GetEntityObject<TemplateContentEntity>('Template Contents');
    templateContentsEntity.NewRecord();
    templateContentsEntity.TemplateID = templateEntity.ID;
    templateContentsEntity.TypeID = textContentType.ID;
    templateContentsEntity.Priority = 1;
    templateContentsEntity.IsActive = true;
    templateContentsEntity.TemplateText = this.BuildTemplateContent(entityFields);

    const templateContentsEntitySaveResult = await super.SaveEntity(templateContentsEntity);
    if(!templateContentsEntitySaveResult){
      LogError('Error saving Template Entity', undefined, templateContentsEntity.LatestResult);
      throw new Error(templateContentsEntity.LatestResult.Message);
    }
    LogStatus(`Successfully created new Template Content Entity ${templateContentsEntity.ID}`);

    //next, create the template params record
    const templateParamsEntity: TemplateParamEntity = await super.Metadata.GetEntityObject<TemplateParamEntity>('Template Params');
    templateParamsEntity.NewRecord();
    templateParamsEntity.TemplateID = templateEntity.ID;
    templateParamsEntity.Name = 'Entity';
    templateParamsEntity.Description = 'The entity object to be used in the template';
    templateParamsEntity.Type = 'Record';
    templateParamsEntity.DefaultValue = null;
    templateParamsEntity.IsRequired = true;
    templateParamsEntity.LinkedParameterName = null;
    templateParamsEntity.LinkedParameterField = null;
    templateParamsEntity.ExtraFilter = null;
    templateParamsEntity.EntityID = entityDocument.EntityID;
    templateParamsEntity.RecordID = null;

    const templateParamsEntitySaveResult = await super.SaveEntity(templateParamsEntity);
    if(!templateParamsEntitySaveResult){
      LogError('Error saving Template Entity', undefined, templateParamsEntity.LatestResult);
      throw new Error(templateParamsEntity.LatestResult.Message);
    }
    LogStatus(`Successfully created new Template Param Entity ${templateParamsEntity.ID}`);
    
    templateEntity.Content.push(templateContentsEntity);
    templateEntity.Params.push(templateParamsEntity);
    TemplateEngineServer.Instance.AddTemplate(templateEntity);

    return templateEntity;
  }

  protected BuildTemplateContent(entityFields: EntityField[]): string {
    return entityFields.map((field: EntityField) => {
      return `{{Entity.${field.Name}}}`;
    }).join(' ');
  }

  protected async GetEntityFieldsForSimilaritySearch(entityID: string): Promise<EntityField[]> {
    //We only want fields that can potentially be the same across records
    //which means things such as IDs, timestamps, etc. are not useful
    //as they're likely to be unique or not that helpful in determining similarity
    const runViewResult: RunViewResult<EntityField> = await super.RunView.RunView<EntityField>({
      EntityName: 'Entity Fields',
      ExtraFilter: `EntityID = '${entityID}' AND IsPrimaryKey = 0 AND IsUnique = 0 AND AutoIncrement = 0 and Type NOT IN ('datetimeoffset', 'datetime')`,
      ResultType: 'entity_object',
    }, super.CurrentUser);

    if (!runViewResult.Success) {
      throw new Error(runViewResult.ErrorMessage);
    }

    return runViewResult.Results;
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

  private delay = (delayInms: number) => {
    return new Promise((resolve) => setTimeout(resolve, delayInms));
  };

  protected async GetTemplateData(entity: EntityInfo, record: BaseEntity, template: TemplateEntityExtended, relatedData: TemplateParamData[]): Promise<{ [key: string]: any }> {
    const templateData: { [key: string]: any } = {};
    for(const param of template.Params){
      if(templateData[param.Name]){
        continue;
      }

      switch(param.Type){
        case 'Record':
          // this one is simple, we create a property by the provided name, and set the value to the record we are currently processing
          templateData[param.Name] = record.GetAll();
          break;
        case 'Entity':
          // here we need to grab the related data from another entity and filter it down for the record we are current processing so it only shows the related data
          // the metadata in the param tells us what we need to know
          const paramData: TemplateParamData | undefined = relatedData.find((rd: TemplateParamData) => rd.ParamName === param.Name);
          if(!paramData){
            LogError(`No related data found for param ${param.Name} in template ${template.ID}`);
            break;
          }

          // now filter down the data in d to just this record and set the value of the context data to the filtered data
          const relatedDataForRecord = paramData.Data.filter((rdfr: BaseEntity) => rdfr.Get(param.LinkedParameterField) === record.Get(entity.FirstPrimaryKey.Name));
          templateData[param.Name] = relatedDataForRecord.map((rdfr: BaseEntity) => rdfr.GetAll());
          break;
          case "Array":
          case "Scalar":
          case "Object":
              // do nothing here, as we don't directly support these param types
              LogError(`Unsupported parameter type ${param.Type} for parameter ${param.Name} in template ${template.ID}`);
              break;
      }
    }
    return templateData;
  }

  protected async GetRelatedTemplateData(entity: EntityInfo, record: BaseEntity, templateParam: TemplateParamEntity): Promise<TemplateParamData | null> {
    const relatedEntity = templateParam.Entity;
    const relatedField = templateParam.LinkedParameterField;

    // construct a filter for the related field so that we constrain the results to just the set of records linked to our recipients
    const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : "";
    const filter = `${relatedField} = ${quotes}${record[entity.FirstPrimaryKey.Name]}${quotes}`;
    const finalFilter = templateParam.ExtraFilter ? `(${filter}) AND (${templateParam.ExtraFilter})` : filter;

    const result = await super.RunView.RunView({
        EntityName: relatedEntity,
        ExtraFilter: finalFilter,
        ResultType: 'entity_object'
    }, super.CurrentUser);

    if (result && result.Success) {
      const relatedData: TemplateParamData = { ParamName: '', Data: [] };
      relatedData.ParamName = templateParam.Name,
      relatedData.Data = result.Results;
      return relatedData;
    }
    
    LogError(`Error getting related data for entity ${relatedEntity} with filter ${finalFilter}`, undefined, result.ErrorMessage);
    return null;
  }

  protected async GetRelatedTemplateDataForBatch(entity: EntityInfo, records: BaseEntity[], template: TemplateEntityExtended): Promise<TemplateParamData[]> {
    const relatedData: TemplateParamData[] = [];

    for(const templateParam of template.Params){
      if(templateParam.Type !== 'Entity'){
        continue;
      }

      const relatedEntity = templateParam.Entity;
      const relatedField = templateParam.LinkedParameterField;

      // construct a filter for the related field so that we constrain the results to just the set of records linked to our recipients
      const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : "";
      const filter = `${relatedField} in (${records.map((record: BaseEntity) => `${quotes}${record[entity.FirstPrimaryKey.Name]}${quotes}`).join(',')})`;
      const finalFilter = templateParam.ExtraFilter ? `(${filter}) AND (${templateParam.ExtraFilter})` : filter;

      const result = await super.RunView.RunView({
          EntityName: relatedEntity,
          ExtraFilter: finalFilter,
          ResultType: 'entity_object'
      }, super.CurrentUser);

      if (result && result.Success) {
        const data: TemplateParamData = { ParamName: '', Data: [] };
        data.ParamName = templateParam.Name,
        data.Data = result.Results;
        relatedData.push(data);
      }
      else {
        LogError(`Error getting related data for entity ${relatedEntity} with filter ${finalFilter}`, undefined, result.ErrorMessage);
      }
    }

    return relatedData;
  }

  // Rather than having this logic inside the EntityRecordDocumentWorker class, it's placed here instead
  //so that the logic behind vectorizing entities isnt spread out across so many files
  protected async UpsertEntityRecordDocumentRecords(embeddingData: EmbeddingData[], contextUser: UserInfo): Promise<void> {
    if(embeddingData.length === 0){
      return;
    }

    let md: Metadata = new Metadata();
    let rv: RunView = new RunView();
    let sampleRecord: EmbeddingData = embeddingData[0];

    let vectorIndex: VectorIndexEntity = await md.GetEntityObject('Vector Indexes', contextUser);
    let loadResult = await vectorIndex.Load(sampleRecord.VectorIndexID.toString());
    if(!loadResult){
      LogError(`Vector Index with ID ${sampleRecord.VectorIndexID} not found`);
      return;
    }

    let entityDocument: Record<string, unknown> = sampleRecord.EntityDocument;
    let entityID: unknown = entityDocument.EntityID;

    let existingRecords: EntityRecordDocumentEntity[] = [];
    const runViewResult: RunViewResult<EntityRecordDocumentEntity> = await rv.RunView<EntityRecordDocumentEntity>({
      EntityName: 'Entity Record Documents',
      ExtraFilter: `EntityID = '${entityID}' AND EntityDocumentID = '${entityDocument.ID}' AND RecordID in (${embeddingData.map((data) => data.__mj_recordID).join(',')})`,
      ResultType: 'entity_object'
    }, contextUser);
    
    if(runViewResult.Success){
      existingRecords = runViewResult.Results;
    }
    else{
      LogError(`Error getting existing Entity Record Documents`, undefined, runViewResult.ErrorMessage);
    }

    for(const data of embeddingData){
      let erdEntity: EntityRecordDocumentEntity | undefined = existingRecords.find((er: EntityRecordDocumentEntity) => er.RecordID.toString() === data.__mj_recordID.toString());
      if(!erdEntity){
        erdEntity = await md.GetEntityObject('Entity Record Documents', contextUser);
        erdEntity.NewRecord();
      }

      erdEntity.EntityID = entityID.toString();
      erdEntity.RecordID = data.__mj_recordID.toString();
      erdEntity.DocumentText = data.TemplateContent;
      erdEntity.VectorID = data.VectorID.toString();
      erdEntity.VectorJSON = JSON.stringify(data.Vector);
      erdEntity.VectorIndexID = data.VectorIndexID.toString();
      erdEntity.EntityRecordUpdatedAt = new Date();
      erdEntity.EntityDocumentID = data.EntityDocument.ID.toString();
      erdEntity.ContextCurrentUser = contextUser;
      let erdEntitySaveResult: boolean = await erdEntity.Save();
      if(!erdEntitySaveResult){
        LogError('Error saving Entity Record Document Entity', undefined, erdEntity.LatestResult);
      }
    }

    LogStatus("Upserting Entity Record Documents: Complete");
  }

  /**
   * This method is resposnible for determining if the template(s) given have aligned parameters, meaning they don't have overlapping parameter names that have 
   * different meanings. It is okay for scenarios where there are > 1 template in use for a message to have different parameter names, but if they have the SAME parameter names
   * they must not have different settings.
   */
  protected ValidateTemplateContextParamAlignment(template: TemplateEntityExtended): boolean {
    // the params are defined in each template they will be in the Params property of the template
    const seenParams: {[key: string]: TemplateParamEntity } = {};
    for (const templateParam of template.Params) {
      const param: TemplateParamEntity | undefined = seenParams[templateParam.Name];
      // we have a duplicate parameter name, now we need to check if the definitions are the same
      if(param && param.Type !== templateParam.Type){
        throw new Error(`Parameter ${param.Name} has different types in different templates`);
      }
      else {
        seenParams[templateParam.Name] = templateParam;
      }
    }

    // if we get here, we are good, otherwise we will have thrown an exception
    return true;
}
}
