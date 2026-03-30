import { BaseEmbeddings, EmbedTextsResult, GetAIAPIKey } from '@memberjunction/ai';
import { BaseResponse, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { PageRecordsParams, VectorBase } from '@memberjunction/ai-vectors';
import { BaseEntity, EntityField, EntityInfo, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo, ValidationResult } from '@memberjunction/core';
import { MJAIModelEntity, MJEntityDocumentEntity, MJEntityDocumentTypeEntity, MJEntityRecordDocumentEntity, MJTemplateContentEntity,
  MJTemplateContentTypeEntity, MJTemplateEntity, MJTemplateEntityExtended, MJTemplateParamEntity, MJVectorDatabaseEntity, MJVectorIndexEntity } from '@memberjunction/core-entities';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { pipeline } from 'node:stream/promises';
import { EmbeddingData, TemplateParamData, VectorEmeddingData, VectorizeEntityParams, VectorizeEntityResponse } from '../generic/vectorSync.types';
import { EntityDocumentCache } from './EntityDocumentCache';
import { PagedRecords } from './PagedRecords';
import { AsyncBatchTransform } from './AsyncBatchTransform';
import { PassThrough } from 'node:stream';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateRenderResult } from '@memberjunction/templates-base-types';

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

    const entityDocument: MJEntityDocumentEntity = await this.GetEntityDocument(params.entityDocumentID);
    const vectorIndexEntity: MJVectorIndexEntity = await this.GetOrCreateVectorIndex(entityDocument);
    const obj: VectorEmeddingData = await this.GetVectorDatabaseAndEmbeddingClassByEntityDocumentID(params.entityDocumentID);

    const md = new Metadata();
    const entity: EntityInfo | undefined = md.Entities.find((e) => UUIDsEqual(e.ID, params.entityID));
    if (!entity) {
      throw new Error(`Entity with ID ${params.entityID} not found.`);
    }

    LogStatus(`Vectorizing entity ${entity.Name} using Entity Document ${entityDocument.Name}`);

    const template: MJTemplateEntityExtended | undefined = TemplateEngineServer.Instance.Templates.find((t: MJTemplateEntityExtended) => UUIDsEqual(t.ID, entityDocument.TemplateID));
    if(!template){
      throw new Error(`Template not found with ID ${entityDocument.TemplateID}`);
    }

    if(template.Content.length === 0){
      throw new Error(`Template ${template.ID} does not have an associated Template Content record`);
    }

    if(template.Content.length > 1){
      throw new Error('Templates used by Entity Documents should only have one associated Template Content record.');
    }

    this.ValidateTemplateContextParamAlignment(template);

    const pageSize: number = params.listBatchCount || 50;
    const dataStream = new PagedRecords();
    const templateContent = template.Content[0];

    const vectorCreator = this.createVectorCreator(
      template, templateContent, obj.embedding, delayTimeMS, params.VectorizeBatchCount
    );

    const vectorUpserter = this.createVectorUpserter(
      entityDocument, templateContent, obj.vectorDB, delayTimeMS, params.UpsertBatchCount
    );

    const erdUpserter = new AsyncBatchTransform<EmbeddingData, undefined, EmbeddingData>({
      batchSize: 10,
      concurrencyLimit: 2,
      processBatch: async (batch: EmbeddingData[]): Promise<EmbeddingData[]> => {
        await Promise.all(batch.map(item => this.UpsertEntityRecordDocumentRecords(item, super.CurrentUser)));
        return batch;
      },
    });

    this.startDataPaging(dataStream, params, md, entity, template, vectorIndexEntity, entityDocument, pageSize);

    LogStatus('Starting pipeline');
    await pipeline(dataStream, vectorCreator, vectorUpserter, erdUpserter, new PassThrough({ objectMode: true }));

    const elapsedSeconds: number = (new Date().getTime() - startTime) / 1000;
    LogStatus(`Finished vectorizing ${entityDocument.Entity} entity in ${elapsedSeconds} seconds (${(elapsedSeconds / 60).toFixed(1)} minutes)`);

    return { success: true, status: 'Complete', errorMessage: '' };
  }

  /**
   * Creates an AsyncBatchTransform that renders templates and generates embeddings
   * in the main thread. This replaces the worker_threads-based VectorizeTemplates
   * worker, which couldn't access ClassFactory registrations in its isolated V8 context.
   */
  private createVectorCreator(
    template: MJTemplateEntityExtended,
    templateContent: MJTemplateContentEntity,
    embedding: BaseEmbeddings,
    delayTimeMS: number,
    batchSize?: number
  ): AsyncBatchTransform<Record<string, unknown>, undefined, EmbeddingData> {
    return new AsyncBatchTransform<Record<string, unknown>, undefined, EmbeddingData>({
      batchSize: batchSize || 50,
      concurrencyLimit: 2,
      processBatch: (batch: Record<string, unknown>[]): Promise<EmbeddingData[]> =>
        this.renderAndEmbedBatch(batch, template, templateContent, embedding, delayTimeMS),
    });
  }

  /**
   * Creates an AsyncBatchTransform that upserts vectors to the vector database
   * in the main thread. This replaces the worker_threads-based UpsertVectors
   * worker for the same ClassFactory reasons.
   */
  private createVectorUpserter(
    entityDocument: MJEntityDocumentEntity,
    templateContent: MJTemplateContentEntity,
    vectorDB: VectorDBBase,
    delayTimeMS: number,
    batchSize?: number
  ): AsyncBatchTransform<EmbeddingData, undefined, EmbeddingData> {
    return new AsyncBatchTransform<EmbeddingData, undefined, EmbeddingData>({
      batchSize: batchSize || 50,
      concurrencyLimit: 2,
      processBatch: (batch: EmbeddingData[]): Promise<EmbeddingData[]> =>
        this.upsertBatchToVectorDB(batch, entityDocument, templateContent, vectorDB, delayTimeMS),
    });
  }

  /**
   * Renders templates for a batch of entity records and generates embeddings for the rendered text.
   */
  private async renderAndEmbedBatch(
    batch: Record<string, unknown>[],
    template: MJTemplateEntityExtended,
    templateContent: MJTemplateContentEntity,
    embedding: BaseEmbeddings,
    delayTimeMS: number
  ): Promise<EmbeddingData[]> {
    TemplateEngineServer.Instance.SetupNunjucks();
    const validEntries: { text: string; record: Record<string, unknown> }[] = [];

    for (const entityData of batch) {
      const validationResult = this.validateTemplateInput(template, entityData);
      if (!validationResult.Success) {
        LogError(`Validation error for record`, undefined, validationResult.Errors.map(e => e.Message).join('\n'));
        continue;
      }

      const result: TemplateRenderResult = await TemplateEngineServer.Instance.RenderTemplate(template, templateContent, entityData, true);
      if (result.Success) {
        validEntries.push({ text: result.Output, record: entityData });
      } else {
        LogError(`Error rendering template`, undefined, result.Message);
      }
    }

    if (validEntries.length === 0) {
      return [];
    }

    const embeddings: EmbedTextsResult = await embedding.EmbedTexts({ texts: validEntries.map(e => e.text), model: null });
    await new Promise<void>((resolve) => setTimeout(resolve, delayTimeMS));

    return embeddings.vectors.map((vector: number[], index: number) => ({
      ID: index,
      Vector: vector,
      EntityData: validEntries[index].record,
      __mj_recordID: String(validEntries[index].record.__mj_recordID),
      __mj_compositeKey: String(validEntries[index].record.__mj_compositeKey ?? ''),
      EntityDocument: validEntries[index].record.__mj_entityDocument as Record<string, unknown>,
      VectorID: String(validEntries[index].record.VectorID ?? ''),
      VectorIndexID: String(validEntries[index].record.VectorIndexID ?? ''),
      TemplateContent: templateContent.TemplateText,
    }));
  }

  /**
   * Upserts a batch of embedding data as vector records into the vector database.
   */
  private async upsertBatchToVectorDB(
    batch: EmbeddingData[],
    entityDocument: MJEntityDocumentEntity,
    templateContent: MJTemplateContentEntity,
    vectorDB: VectorDBBase,
    delayTimeMS: number
  ): Promise<EmbeddingData[]> {
    const vectorRecords: VectorRecord[] = batch.map((embeddingItem: EmbeddingData) => {
      const guid: string = crypto.randomUUID();
      embeddingItem.VectorID = guid;
      return {
        id: guid,
        values: embeddingItem.Vector,
        metadata: {
          RecordID: String(embeddingItem.__mj_compositeKey ?? ''),
          Entity: entityDocument.Entity,
          TemplateID: templateContent.ID,
        }
      };
    });

    const response: BaseResponse = await vectorDB.createRecords(vectorRecords);
    if (!response.success) {
      LogError('Unable to save records to vector database', undefined, response.message);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, delayTimeMS));
    return batch;
  }

  /**
   * Validates template input data against template parameter definitions
   */
  private validateTemplateInput(template: MJTemplateEntityExtended, data: Record<string, unknown>): ValidationResult {
    const result = new ValidationResult();
    const params = template.Params;

    if (!params) {
      result.Errors.push({ Source: '', Message: 'Params property not found on the template.', Value: '', Type: 'Failure' });
    }

    params?.forEach((p) => {
      if (p.IsRequired) {
        // For Record type params, fields are spread to root level (flat convention)
        // so check that data has any keys, not a specific key matching the param name
        if (p.Type === 'Record') {
          if (Object.keys(data).length === 0) {
            result.Errors.push({ Source: p.Name, Message: `Parameter ${p.Name} is required.`, Value: undefined, Type: 'Failure' });
          }
          return;
        }
        const val = data[p.Name];
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
          result.Errors.push({ Source: p.Name, Message: `Parameter ${p.Name} is required.`, Value: val, Type: 'Failure' });
        }
      }
    });

    result.Success = !result.Errors.some(e => e.Type === 'Failure');
    return result;
  }

  /**
   * Starts the async data paging loop that feeds records into the stream pipeline.
   */
  private startDataPaging(
    dataStream: PagedRecords,
    params: VectorizeEntityParams,
    md: Metadata,
    entity: EntityInfo,
    template: MJTemplateEntityExtended,
    vectorIndexEntity: MJVectorIndexEntity,
    entityDocument: MJEntityDocumentEntity,
    pageSize: number
  ): void {
    const getData = async (): Promise<void> => {
      let pageNumber = 0;

      if (params.StartingOffset) {
        pageNumber = params.StartingOffset * pageSize;
        LogStatus(`Starting at offset ${params.StartingOffset} (skipping first ${pageNumber} records)`);
      }

      let hasMore = true;
      while (hasMore) {
        const pageRecordRequest: PageRecordsParams = {
          EntityID: params.entityID,
          PageNumber: pageNumber,
          PageSize: pageSize,
          ResultType: 'simple',
        };

        if (params.listID) {
          const coreSchema: string = md.ConfigData.MJCoreSchemaName;
          pageRecordRequest.Filter = this.buildListFilter(entity, coreSchema, params.listID);
        }

        const recordsPage: unknown[] = await super.PageRecordsByEntityID<unknown>(pageRecordRequest);
        const relatedData: TemplateParamData[] = await this.GetRelatedTemplateDataForBatch(entity, recordsPage, template);
        const items: Record<string, unknown>[] = [];

        LogStatus(`Fetched page ${pageNumber + 1} with ${recordsPage.length} records to process`);

        for (const record of recordsPage) {
          const typedRecord = record as Record<string, unknown>;
          const templateData: Record<string, unknown> = await this.GetTemplateData(entity, typedRecord, template, relatedData);
          templateData.__mj_recordID = typedRecord[entity.FirstPrimaryKey.Name];
          templateData.__mj_compositeKey = entity.PrimaryKeys.map((key) => `${key.Name}|${typedRecord[key.Name]}`).join('||');
          templateData.VectorIndexID = vectorIndexEntity.ID;
          templateData.TemplateContent = template.Content[0].TemplateText;
          templateData.__mj_entityDocument = { ID: entityDocument.ID, EntityID: entityDocument.EntityID, Name: entityDocument.Name };
          items.push(templateData);
        }

        dataStream.addPage(items);
        if (recordsPage.length < pageSize) {
          hasMore = false;
          break;
        }

        pageNumber++;
      }

      dataStream.endStream();
    };

    getData().catch((error) => {
      LogError('Error during data paging', undefined, error);
      dataStream.endStream();
    });
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
    VectorDatabase: MJVectorDatabaseEntity,
    AIModel: MJAIModelEntity
  ): Promise<MJEntityDocumentEntity> {
    const md = new Metadata();
    const entity = md.Entities.find((e) => UUIDsEqual(e.ID, EntityID));
    if (!entity) throw new Error(`Entity with ID ${EntityID} not found.`);

    const EDTemplate: string = entity.Fields.map((ef) => {
      return `${ef.Name}: {{${ef.Name}}}`;
    }).join(' ');

    const rv: RunView = new RunView();
    const rvResult: RunViewResult<MJEntityDocumentTypeEntity> = await rv.RunView<MJEntityDocumentTypeEntity>({
      EntityName: 'MJ: Entity Document Types',
      ExtraFilter: `Name = 'Record Duplicate'`,
    }, super.CurrentUser);

    if (!rvResult.Success) {
      throw new Error(`Unable to fetch Entity Document Type: ${rvResult.ErrorMessage}`);
    }

    if(rvResult.Results.length === 0){
      throw new Error('Record Duplicate Entity Document Type not found');
    }

    const entityDocumentType: MJEntityDocumentTypeEntity = rvResult.Results[0];

    const entityDocument: MJEntityDocumentEntity = await md.GetEntityObject<MJEntityDocumentEntity>('MJ: Entity Documents');
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
    let entityDocument: MJEntityDocumentEntity | null = EntityDocumentCache.Instance.GetDocument(entityDocumentID);
    if (!entityDocument) {
      if (createDocumentIfNotFound) {
          LogStatus(`No active Entity Document found for entity ${entityDocumentID}, creating one`);
          const defaultVectorDB: MJVectorDatabaseEntity = this.GetVectorDatabase();
          const defaultAIModel: MJAIModelEntity = this.GetAIModel();
          entityDocument = await this.CreateDefaultEntityDocument(entityDocumentID, defaultVectorDB, defaultAIModel);
      } 
      else {
        throw new Error(`No Entity Document found for ID=${entityDocumentID}`);
      }
    }

    const vectorDBEntity: MJVectorDatabaseEntity = this.GetVectorDatabase(entityDocument.VectorDatabaseID);
    const aiModelEntity: MJAIModelEntity = this.GetAIModel(entityDocument.AIModelID);

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

  public async GetEntityDocument(EntityDocumentID: string): Promise<MJEntityDocumentEntity | null> {
    const cache = EntityDocumentCache.Instance;
    if (!cache.IsLoaded) {
      await cache.Refresh(false, super.CurrentUser);
    }
    return cache.GetDocument(EntityDocumentID);
  }

  public async GetEntityDocumentByName(EntityDocumentName: string, ContextUser?: UserInfo): Promise<MJEntityDocumentEntity | null> {
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
  public async GetActiveEntityDocuments(entityNames?: string[]): Promise<MJEntityDocumentEntity[]> {
    await EntityDocumentCache.Instance.Refresh(false, super.CurrentUser);
    const entityDocumentType: MJEntityDocumentTypeEntity | undefined = EntityDocumentCache.Instance.GetDocumentTypeByName('Record Duplicate');
    if (!entityDocumentType) {
      throw new Error('Entity Document Type not found');
    }

    let filter = `TypeID = '${entityDocumentType.ID}' AND Status = 'Active' `;
    if (entityNames && entityNames.length > 0) {
      filter += ` AND Entity IN (${entityNames.map((entityName: string) => `'${entityName}'`).join(',')})`;
    }

    const runViewResult: RunViewResult<MJEntityDocumentEntity> = await super.RunView.RunView<MJEntityDocumentEntity>({
      EntityName: 'MJ: Entity Documents',
      ExtraFilter: filter,
      ResultType: 'entity_object',
    }, super.CurrentUser);

    if(!runViewResult.Success){
      throw new Error(runViewResult.ErrorMessage);
    }

    let entityDocuments: MJEntityDocumentEntity[] = [];
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

  private async GetOrCreateVectorIndex(entityDocument: MJEntityDocumentEntity): Promise<MJVectorIndexEntity> {
    let vectorIndexEntity: MJVectorIndexEntity = await super.RunViewForSingleValue(
      'MJ: Vector Indexes',
      `VectorDatabaseID = '${entityDocument.VectorDatabaseID}' AND EmbeddingModelID = '${entityDocument.AIModelID}'`
    );

    if (vectorIndexEntity) {
      return vectorIndexEntity;
    }

    LogStatus(`No Vector Index found for entityDocument ${entityDocument.ID}, creating one`);
    try {
      vectorIndexEntity = await super.Metadata.GetEntityObject<MJVectorIndexEntity>('MJ: Vector Indexes');
      vectorIndexEntity.NewRecord();
      vectorIndexEntity.VectorDatabaseID = entityDocument.VectorDatabaseID;
      vectorIndexEntity.EmbeddingModelID = entityDocument.AIModelID;
      vectorIndexEntity.Name = `Vector Index for entityDocument ${entityDocument.EntityID}`;
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

  protected async CreateTemplateForEntityDocument(entityDocument: MJEntityDocumentEntity): Promise<MJTemplateEntity> {
    const templateEntity: MJTemplateEntityExtended = await super.Metadata.GetEntityObject<MJTemplateEntityExtended>('MJ: Templates');
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
    const textContentType: MJTemplateContentTypeEntity = TemplateEngineServer.Instance.TemplateContentTypes.find((type: MJTemplateContentTypeEntity) => type.Name === 'Text');
    if(!textContentType){
      throw new Error('Text template content type not found');
    }

    const entityFields: EntityField[] = await this.GetEntityFieldsForSimilaritySearch(entityDocument.EntityID);

    const templateContentsEntity: MJTemplateContentEntity = await super.Metadata.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents');
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
    const templateParamsEntity: MJTemplateParamEntity = await super.Metadata.GetEntityObject<MJTemplateParamEntity>('MJ: Template Params');
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
      return `{{${field.Name}}}`;
    }).join(' ');
  }

  protected async GetEntityFieldsForSimilaritySearch(entityID: string): Promise<EntityField[]> {
    //We only want fields that can potentially be the same across records
    //which means things such as IDs, timestamps, etc. are not useful
    //as they're likely to be unique or not that helpful in determining similarity
    const runViewResult: RunViewResult<EntityField> = await super.RunView.RunView<EntityField>({
      EntityName: 'MJ: Entity Fields',
      ExtraFilter: `EntityID = '${entityID}' AND IsPrimaryKey = 0 AND IsUnique = 0 AND AutoIncrement = 0 and Type NOT IN ('datetimeoffset', 'datetime')`,
      ResultType: 'entity_object',
    }, super.CurrentUser);

    if (!runViewResult.Success) {
      throw new Error(runViewResult.ErrorMessage);
    }

    return runViewResult.Results;
  }

  protected async GetTemplateData(entity: EntityInfo, record: Record<string, unknown>, template: MJTemplateEntityExtended, relatedData: TemplateParamData[]): Promise<Record<string, unknown>> {
    const templateData: Record<string, unknown> = {};
    for (const param of template.Params) {
      switch (param.Type) {
        case 'Record':
          // NEW convention: main entity fields are TOP-LEVEL variables (no Entity. prefix).
          // Spread record fields directly into the root context so templates use {{FieldName}}.
          Object.assign(templateData, record);
          break;
        case 'Entity': {
          if (templateData[param.Name]) {
            continue;
          }
          const paramData: TemplateParamData | undefined = relatedData.find((rd: TemplateParamData) => rd.ParamName === param.Name);
          if (!paramData) {
            LogError(`No related data found for param ${param.Name} in template ${template.ID}`);
            break;
          }
          // Related entities use their relationship name as prefix: {{RelationshipName.FieldName}}
          const pkValue = record[entity.FirstPrimaryKey.Name];
          templateData[param.Name] = paramData.Data.filter((rdfr: unknown) => {
            const typedRdfr = rdfr as Record<string, unknown>;
            return typedRdfr[param.LinkedParameterField] === pkValue;
          });
          break;
        }
        case 'Scalar':
          // Flat convention: entity fields are top-level, so pull directly from record
          templateData[param.Name] = record[param.Name] ?? '';
          break;
        case 'Array':
        case 'Object':
          LogError(`Unsupported parameter type ${param.Type} for parameter ${param.Name} in template ${template.ID}`);
          break;
      }
    }
    return templateData;
  }

  protected async GetRelatedTemplateDataForBatch(entity: EntityInfo, records: unknown[], template: MJTemplateEntityExtended): Promise<TemplateParamData[]> {
    const relatedData: TemplateParamData[] = [];

    for (const templateParam of template.Params) {
      if (templateParam.Type !== 'Entity') {
        continue;
      }

      const relatedEntity = templateParam.Entity;
      const relatedField = templateParam.LinkedParameterField;
      const quotes = entity.FirstPrimaryKey.NeedsQuotes ? "'" : '';
      const pkName = entity.FirstPrimaryKey.Name;
      const filter = `${relatedField} in (${records.map((record: unknown) => {
        const typedRecord = record as Record<string, unknown>;
        return `${quotes}${typedRecord[pkName]}${quotes}`;
      }).join(',')})`;
      const finalFilter = templateParam.ExtraFilter ? `(${filter}) AND (${templateParam.ExtraFilter})` : filter;

      const result = await super.RunView.RunView<Record<string, unknown>>({
        EntityName: relatedEntity,
        ExtraFilter: finalFilter,
        ResultType: 'simple'
      }, super.CurrentUser);

      if (result && result.Success) {
        relatedData.push({ ParamName: templateParam.Name, Data: result.Results });
      } else {
        LogError(`Error getting related data for entity ${relatedEntity} with filter ${finalFilter}`, undefined, result.ErrorMessage);
      }
    }

    return relatedData;
  }

  /**
   * Creates or updates an Entity Record Document record linking a source record to its vector embedding.
   */
  protected async UpsertEntityRecordDocumentRecords(embeddingData: EmbeddingData, contextUser: UserInfo): Promise<void> {
    const md: Metadata = super.Metadata;
    const rv: RunView = super.RunView;

    const vectorIndexID: string = String(embeddingData.VectorIndexID);
    const vectorIndex: MJVectorIndexEntity = await md.GetEntityObject<MJVectorIndexEntity>('MJ: Vector Indexes', contextUser);
    const loadResult = await vectorIndex.Load(vectorIndexID);
    if (!loadResult) {
      LogError(`Vector Index with ID ${vectorIndexID} not found`);
      return;
    }

    const entityDocument: Record<string, unknown> = embeddingData.EntityDocument;
    const entityID: string = String(entityDocument.EntityID);
    const recordID: string = String(embeddingData.__mj_recordID);
    const entityDocumentID: string = String(entityDocument.ID);

    const runViewResult: RunViewResult<MJEntityRecordDocumentEntity> = await rv.RunView<MJEntityRecordDocumentEntity>({
      EntityName: 'MJ: Entity Record Documents',
      ExtraFilter: `EntityID = '${entityID}' AND EntityDocumentID = '${entityDocumentID}' AND RecordID in ('${recordID}')`,
      ResultType: 'entity_object'
    }, contextUser);

    let existingRecords: MJEntityRecordDocumentEntity[] = [];
    if (runViewResult.Success) {
      existingRecords = runViewResult.Results;
    } else {
      LogError('Error getting existing Entity Record Documents', undefined, runViewResult.ErrorMessage);
    }

    let erdEntity: MJEntityRecordDocumentEntity | undefined = existingRecords.find(
      (er: MJEntityRecordDocumentEntity) => er.RecordID === recordID
    );

    if (!erdEntity) {
      erdEntity = await md.GetEntityObject<MJEntityRecordDocumentEntity>('MJ: Entity Record Documents', contextUser);
      erdEntity.NewRecord();
    }

    erdEntity.EntityID = entityID;
    erdEntity.RecordID = recordID;
    erdEntity.DocumentText = embeddingData.TemplateContent ?? null;
    erdEntity.VectorID = embeddingData.VectorID != null ? String(embeddingData.VectorID) : null;
    erdEntity.VectorJSON = JSON.stringify(embeddingData.Vector);
    erdEntity.VectorIndexID = vectorIndexID;
    erdEntity.EntityRecordUpdatedAt = new Date();
    erdEntity.EntityDocumentID = entityDocumentID;
    erdEntity.ContextCurrentUser = contextUser;

    const erdEntitySaveResult: boolean = await erdEntity.Save();
    if (!erdEntitySaveResult) {
      LogError('Error saving Entity Record Document Entity', undefined, erdEntity.LatestResult);
    } else {
      LogStatus('Upserting Entity Record Documents: Complete');
    }
  }

  /**
   * This method is resposnible for determining if the template(s) given have aligned parameters, meaning they don't have overlapping parameter names that have
   * different meanings. It is okay for scenarios where there are > 1 template in use for a message to have different parameter names, but if they have the SAME parameter names
   * they must not have different settings.
   */
  protected ValidateTemplateContextParamAlignment(template: MJTemplateEntityExtended): boolean {
    // the params are defined in each template they will be in the Params property of the template
    const seenParams: {[key: string]: MJTemplateParamEntity } = {};
    for (const templateParam of template.Params) {
      const param: MJTemplateParamEntity | undefined = seenParams[templateParam.Name];
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

  /**
   * Build the SQL filter to select records that are in the given list.
   * For single PK entities, uses a simple IN clause.
   * For composite PK entities, uses an EXISTS clause that concatenates PK columns to match the RecordID format.
   */
  protected buildListFilter(entity: EntityInfo, listDetailsSchema: string, listId: string): string {
    const primaryKeys = entity.PrimaryKeys;

    if (primaryKeys.length === 1) {
      // Simple case: single primary key
      // Use a simple IN clause matching the first PK field
      const pkField = primaryKeys[0].Name;
      return `${pkField} IN (SELECT RecordID FROM ${listDetailsSchema}.vwListDetails WHERE ListID = '${listId}')`;
    } else {
      // Composite key case: need to match concatenated key format
      // RecordID format is "Field1|Value1||Field2|Value2" (using CompositeKey delimiters)
      // Build SQL expression that concatenates the PK fields in the same format
      // Format: 'Field1|' + CAST(Value1 AS NVARCHAR(MAX)) + '||' + 'Field2|' + CAST(Value2 AS NVARCHAR(MAX))
      const concatParts = primaryKeys.map((pk, index) => {
        const fieldNameLiteral = `'${pk.Name}|'`;
        const fieldValue = `CAST([${pk.Name}] AS NVARCHAR(MAX))`;
        if (index === 0) {
          return `${fieldNameLiteral} + ${fieldValue}`;
        } else {
          return `'||' + ${fieldNameLiteral} + ${fieldValue}`;
        }
      });
      const compositeKeyExpr = concatParts.join(' + ');

      // Use EXISTS with a subquery that matches the concatenated key against RecordID
      return `EXISTS (
        SELECT 1 FROM ${listDetailsSchema}.vwListDetails ld
        WHERE ld.ListID = '${listId}'
        AND ld.RecordID = (${compositeKeyExpr})
      )`;
    }
  }
}