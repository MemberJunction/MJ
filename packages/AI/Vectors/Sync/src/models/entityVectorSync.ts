import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { VectorDBBase } from '@memberjunction/ai-vectordb';
import { PageRecordsParams, VectorBase } from '@memberjunction/ai-vectors';
import { BaseEntity, EntityField, EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { AIModelEntity, EntityDocumentEntity, EntityDocumentTypeEntity, TemplateContentEntity,
  TemplateContentTypeEntity, TemplateEntity, TemplateEntityExtended, TemplateParamEntity, VectorDatabaseEntity, VectorIndexEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { pipeline } from 'node:stream/promises';
import { EmbeddingData, TemplateParamData, VectorEmeddingData, VectorizeEntityParams, VectorizeEntityResponse } from '../generic/vectorSync.types';
import { BatchWorker } from './BatchWorker';
import { EntityDocumentCache } from './EntityDocumentCache';
import { PagedRecords } from './PagedRecords';
import { resolve } from 'node:path';
import { PassThrough, Transform } from 'node:stream';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineServer } from '@memberjunction/templates';

/**
 * Class that specializes in vectorizing entities using embedding models and upserting them into Vector Databases 
 */
export class EntityVectorSyncer extends VectorBase {
  _startTime: Date;
  _endTime: Date;

  constructor() {
    super();
  }

  /**
   * Refreshes the EntityDocumentCache and configures the AIEngine and TemplateEngineServer
   * @param forceRefresh If true, the cache and enginges will be refreshed even if it is already loaded
   * @param contextUser The context user to use to refresh the cache and configure the engines
   */
  public async Config(forceRefresh: boolean, contextUser?: UserInfo): Promise<void> {
    super.CurrentUser;
    await EntityDocumentCache.Instance.Refresh(forceRefresh, contextUser);
    await AIEngine.Instance.Config(forceRefresh, contextUser);
    await TemplateEngineServer.Instance.Config(forceRefresh, contextUser);
  }

  public async VectorizeEntity(params: VectorizeEntityParams, contextUser?: UserInfo): Promise<VectorizeEntityResponse> {
    if (!contextUser) {
      throw new Error('ContextUser is required to vectorize the entity');
    }

    const delayTimeMS: number = 250;
    const startTime: number = new Date().getTime();
    super.CurrentUser = contextUser;
    await TemplateEngineServer.Instance.Config(false, contextUser);
    
    const entityDocument: EntityDocumentEntity = await this.GetEntityDocument(params.entityDocumentID);
    const vectorIndexEntity: VectorIndexEntity = await this.GetOrCreateVectorIndex(entityDocument);
    const obj: VectorEmeddingData = await this.GetVectorDatabaseAndEmbeddingClassByEntityDocumentID(params.entityDocumentID);

    const md = new Metadata();
    const entity: EntityInfo | undefined = md.Entities.find((e) => e.ID === params.entityID);
    if (!entity) {
      throw new Error(`Entity with ID ${params.entityID} not found.`);
    }

    LogStatus(`Vectorizing entity ${entity.Name} using Entity Document ${entityDocument.Name}`);

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

    //If this function doesnt throw an error, then the template is valid
    const validTemplate: boolean = this.ValidateTemplateContextParamAlignment(template);

    const pageSize: number = params.listBatchCount || 50;
    const dataStream = new PagedRecords();
    
    let templateObj: {} = {
      ...template.GetAll(),
      Params: template.Params.map((p) => p.To())
    }; 

    const workerContext = { 
      executionId: Date.now(), 
      entity, 
      entityDocument: entityDocument.To(),
      template: templateObj,
      templateContent: template.Content[0].To(),
      vectorDBClassKey: obj.vectorDBClassKey,
      vectorDBAPIKey: obj.vectorDBAPIKey,
      embeddingDriverClass: obj.embeddingDriverClass,
      embeddingAPIKey: obj.embeddingAPIKey,
      delayTimeMS
    };

    //Handles vectorizing the records 
    const VectorCreator = new BatchWorker({
      workerFile: resolve(__dirname, 'workers/VectorizeTemplates.js'),
      batchSize: params.VectorizeBatchCount || 50,
      concurrencyLimit: 2,
      contextUser: super.CurrentUser,
      workerContext,
    });

    VectorCreator.on('error', (err) => {      
      LogError('Error in VectorCreator worker', null, err);    
    });

    //Handles upserting the vectors into the vector database
    const VectorUpserter = new BatchWorker({ 
      workerFile: resolve(__dirname, 'workers/UpsertVectors.js'), 
      batchSize: params.UpsertBatchCount || 50,
      contextUser: super.CurrentUser, 
      workerContext
    });

    VectorUpserter.on('error', (err) => {      
      LogError('Error in VectorUpserter worker', null, err);    
    });

    //short for entity record document upserter
    // handles upserting entity record document records
    const ERCUpserter = new Transform({objectMode: true, transform: (chunk, encoding, callback) => {
      this.UpsertEntityRecordDocumentRecords(chunk as EmbeddingData, super.CurrentUser).then(() => callback(null)).catch(callback);
    }});

    const getData = async (): Promise<void> => {
      let pageNumber =  0;

      if(params.StartingOffset){
        pageNumber = params.StartingOffset * pageSize;
        LogStatus(`Starting at offset ${params.StartingOffset} (skipping first ${pageNumber} records)`);
      }

      let hasMore = true;
      while (hasMore) {
        let pageRecordRequest: PageRecordsParams = {
          EntityID: params.entityID,
          PageNumber: pageNumber,
          PageSize: pageSize,
          ResultType: 'simple',
        };

        if(params.listID){
          const coreSchema: string = md.ConfigData.MJCoreSchemaName;
          pageRecordRequest.Filter = `${entity.FirstPrimaryKey.Name} IN (SELECT RecordID FROM ${coreSchema}.vwListDetails WHERE ListID = '${params.listID}')`;
        }

        const recordsPage: unknown[] = await super.PageRecordsByEntityID<unknown>(pageRecordRequest);
        const relatedData: TemplateParamData[] = await this.GetRelatedTemplateDataForBatch(entity, recordsPage, template);
        const items: Record<string, any>[] = [];

        LogStatus(`Fetched page ${pageNumber + 1} with ${recordsPage.length} records to process`);
        
        for(const record of recordsPage){
          const templateData: { [key: string]: unknown } = await this.GetTemplateData(entity, record, template, relatedData);
          //we need a reference to this record's ID for the upsert worker
          templateData.__mj_recordID = record[entity.FirstPrimaryKey.Name];
          templateData.__mj_compositeKey = entity.PrimaryKeys.map((key) => `${key.Name}|${record[key.Name]}`).join("||");
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

    LogStatus('Starting pipeline');
    await pipeline(dataStream, VectorCreator, VectorUpserter, ERCUpserter, new PassThrough({ objectMode: true }));

    const endTime: number = new Date().getTime();

    //convert ms to seconds
    const elapsedSeconds: number = (endTime - startTime) / 1000;
    const elapsedMinutes: number = elapsedSeconds / 60;

    LogStatus(`Finished vectorizing ${entityDocument.Entity} entity in ${elapsedSeconds} seconds (${elapsedMinutes} minutes)`);
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

    const rv: RunView = new RunView();
    const rvResult: RunViewResult<EntityDocumentTypeEntity> = await rv.RunView<EntityDocumentTypeEntity>({
      EntityName: 'Entity Document Types',
      ExtraFilter: `Name = 'Record Duplicate'`,
    }, super.CurrentUser);

    if (!rvResult.Success) {
      throw new Error(`Unable to fetch Entity Document Type: ${rvResult.ErrorMessage}`);
    }

    if(rvResult.Results.length === 0){
      throw new Error('Record Duplicate Entity Document Type not found');
    }

    const entityDocumentType: EntityDocumentTypeEntity = rvResult.Results[0];

    const entityDocument: EntityDocumentEntity = await md.GetEntityObject<EntityDocumentEntity>('Entity Documents');
    entityDocument.NewRecord();
    entityDocument.Name = `Default duplicate record Entity Document for the ${entity.Name} entity using vector database ${VectorDatabase.Name} and AI Model ${AIModel.Name}`;
    entityDocument.EntityID = EntityID;
    entityDocument.TypeID = entityDocumentType.ID;
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

  protected async GetVectorDatabaseAndEmbeddingClassByEntityDocumentID( entityDocumentID: string, createDocumentIfNotFound?: boolean ): Promise<VectorEmeddingData> {
    let entityDocument: EntityDocumentEntity | null = EntityDocumentCache.Instance.GetDocument(entityDocumentID);
    if (!entityDocument) {
      if (createDocumentIfNotFound) {
          LogStatus(`No active Entity Document found for entity ${entityDocumentID}, creating one`);
          const defaultVectorDB: VectorDatabaseEntity = this.GetVectorDatabase();
          const defaultAIModel: AIModelEntity = this.GetAIModel();
          entityDocument = await this.CreateDefaultEntityDocument(entityDocumentID, defaultVectorDB, defaultAIModel);
      } 
      else {
        throw new Error(`No Entity Document found for ID=${entityDocumentID}`);
      }
    }

    const vectorDBEntity: VectorDatabaseEntity = this.GetVectorDatabase(entityDocument.VectorDatabaseID);
    const aiModelEntity: AIModelEntity = this.GetAIModel(entityDocument.AIModelID);

    const embeddingAPIKey: string = GetAIAPIKey(aiModelEntity.DriverClass);
    const vectorDBAPIKey: string = GetAIAPIKey(vectorDBEntity.ClassKey);

    if (!embeddingAPIKey) {
      throw Error(`No API Key found for AI Model ${aiModelEntity.DriverClass}`);
    }

    if (!vectorDBAPIKey) {
      throw Error(`No API Key found for Vector Database ${vectorDBEntity.ClassKey}`);
    }

    //LogStatus(`Embedding API Key: ${embeddingAPIKey} VectorDB API Key: ${vectorDBAPIKey}`);
    const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(BaseEmbeddings, aiModelEntity.DriverClass, embeddingAPIKey);
    const vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, vectorDBEntity.ClassKey, vectorDBAPIKey);

    if (!embedding) {
      throw Error(`Failed to create Embeddings instance for AI Model ${aiModelEntity.DriverClass}`);
    }

    if (!vectorDB) {
      throw Error(`Failed to create Vector Database instance for ${vectorDBEntity.ClassKey}`);
    }

    LogStatus(`Using vector database ${vectorDBEntity.Name} and AI Model ${aiModelEntity.Name}`);

    const obj: VectorEmeddingData = { 
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
      await cache.Refresh(false, super.CurrentUser);
    }
    return cache.GetDocument(EntityDocumentID);
  }

  public async GetEntityDocumentByName(EntityDocumentName: string, ContextUser?: UserInfo): Promise<EntityDocumentEntity | null> {
    const cache = EntityDocumentCache.Instance;
    if (!cache.IsLoaded) {
      await cache.Refresh(false, ContextUser);
    }
    return cache.GetDocumentByName(EntityDocumentName);
  }

  /**
   * Returns all active Entity Documents of the 'Record Duplicate' type.
   * Note that this only returns the first active Entity Document. Meaning if there are multiple Entity Documents for the same entity, 
   * only the oldest one will be returned.
   * @param entityIDs If provided, only Entity Documents for the specified entities will be returned.
   */
  public async GetActiveEntityDocuments(entityNames?: string[]): Promise<EntityDocumentEntity[]> {
    await EntityDocumentCache.Instance.Refresh(false, super.CurrentUser);
    const entityDocumentType: EntityDocumentTypeEntity | undefined = EntityDocumentCache.Instance.GetDocumentTypeByName('Record Duplicate');
    if (!entityDocumentType) {
      throw new Error('Entity Document Type not found');
    }

    let filter = `TypeID = '${entityDocumentType.ID}' AND Status = 'Active' `;
    if (entityNames && entityNames.length > 0) {
      filter += ` AND Entity IN (${entityNames.map((entityName: string) => `'${entityName}'`).join(',')})`;
    }

    const runViewResult: RunViewResult<EntityDocumentEntity> = await super.RunView.RunView<EntityDocumentEntity>({
      EntityName: 'Entity Documents',
      ExtraFilter: filter,
      ResultType: 'entity_object',
    }, super.CurrentUser);

    if(!runViewResult.Success){
      throw new Error(runViewResult.ErrorMessage);
    }

    let entityDocuments: EntityDocumentEntity[] = [];
    let seenEntities: string[] = [];

    //we only want one entity document per entity
    for(const entityDocument of runViewResult.Results){
      if(seenEntities.includes(entityDocument.EntityID)){
        continue;
      }
      
      entityDocuments.push(entityDocument);
      seenEntities.push(entityDocument.EntityID);
    }

    return entityDocuments;
  }

  private async GetOrCreateVectorIndex(entityDocument: EntityDocumentEntity): Promise<VectorIndexEntity> {
    let vectorIndexEntity: VectorIndexEntity = await super.RunViewForSingleValue(
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
      throw new Error(templateEntity.LatestResult.CompleteMessage);
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
      throw new Error(templateContentsEntity.LatestResult.CompleteMessage);
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
      throw new Error(templateParamsEntity.LatestResult.CompleteMessage);
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

  protected async GetTemplateData(entity: EntityInfo, record: unknown, template: TemplateEntityExtended, relatedData: TemplateParamData[]): Promise<{ [key: string]: any }> {
    const templateData: { [key: string]: unknown } = {};
    for(const param of template.Params){
      if(templateData[param.Name]){
        continue;
      }

      switch(param.Type){
        case 'Record':
          // this one is simple, we create a property by the provided name, and set the value to the record we are currently processing
          templateData[param.Name] = record;
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
          templateData[param.Name] = paramData.Data.filter((rdfr: BaseEntity) => rdfr[param.LinkedParameterField] === record[entity.FirstPrimaryKey.Name]);
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

  protected async GetRelatedTemplateDataForBatch(entity: EntityInfo, records: unknown[], template: TemplateEntityExtended): Promise<TemplateParamData[]> {
    const relatedData: TemplateParamData[] = [];

    for(const templateParam of template.Params){
      if(templateParam.Type !== 'Entity'){
        continue;
      }

      const relatedEntity = templateParam.Entity;
      const relatedField = templateParam.LinkedParameterField;

      // construct a filter for the related field so that we constrain the results to just the set of records linked to our recipients
      const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : "";
      const filter = `${relatedField} in (${records.map((record: unknown) => `${quotes}${record[entity.FirstPrimaryKey.Name]}${quotes}`).join(',')})`;
      const finalFilter = templateParam.ExtraFilter ? `(${filter}) AND (${templateParam.ExtraFilter})` : filter;

      const result = await super.RunView.RunView<unknown>({
          EntityName: relatedEntity,
          ExtraFilter: finalFilter,
          ResultType: 'simple'
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
  protected async UpsertEntityRecordDocumentRecords(embeddingData: EmbeddingData, contextUser: UserInfo): Promise<void> {
    let md: Metadata = super.Metadata;
    let rv: RunView = super.RunView;

    let vectorIndex: VectorIndexEntity = await md.GetEntityObject<VectorIndexEntity>('Vector Indexes', contextUser);
    let vectorIndexID: string = embeddingData.VectorIndexID.toString();
    let loadResult = await vectorIndex.Load(vectorIndexID);
    if(!loadResult){
      LogError(`Vector Index with ID ${embeddingData.VectorIndexID} not found`);
      return;
    }

    let entityDocument: Record<string, unknown> = embeddingData.EntityDocument;
    let entityID: unknown = entityDocument.EntityID;

    let existingRecords: BaseEntity[] = [];
    const runViewResult: RunViewResult<BaseEntity> = await rv.RunView<BaseEntity>({
      EntityName: 'Entity Record Documents',
      ExtraFilter: `EntityID = '${entityID}' AND EntityDocumentID = '${entityDocument.ID}' AND RecordID in ('${embeddingData.__mj_recordID}')`,
      ResultType: 'entity_object'
    }, contextUser);
    
    if(runViewResult.Success){
      existingRecords = runViewResult.Results;
    }
    else {
      LogError(`Error getting existing Entity Record Documents`, undefined, runViewResult.ErrorMessage);
    }

    let erdEntity: BaseEntity | undefined = existingRecords.find((er: BaseEntity) => er.Get("RecordID").toString() === embeddingData.__mj_recordID.toString());
    if(!erdEntity){
      erdEntity = await md.GetEntityObject<BaseEntity>('Entity Record Documents', contextUser);
      erdEntity.NewRecord();
    }

    erdEntity.Set("EntityID", entityID.toString());
    erdEntity.Set("RecordID", embeddingData.__mj_recordID.toString());
    erdEntity.Set("DocumentText", embeddingData.TemplateContent);
    erdEntity.Set("VectorID", embeddingData.VectorID.toString());
    erdEntity.Set("VectorJSON", JSON.stringify(embeddingData.Vector));
    erdEntity.Set("VectorIndexID", embeddingData.VectorIndexID.toString());
    erdEntity.Set("EntityRecordUpdatedAt", new Date());
    erdEntity.Set("EntityDocumentID", embeddingData.EntityDocument.ID.toString());
    erdEntity.ContextCurrentUser = contextUser;
    
    let erdEntitySaveResult: boolean = await erdEntity.Save();
    if(!erdEntitySaveResult){
      LogError('Error saving Entity Record Document Entity', undefined, erdEntity.LatestResult);
    }
    else{
      LogStatus("Upserting Entity Record Documents: Complete");
    }
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