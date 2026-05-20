import { createHash } from 'node:crypto';
import { BaseEmbeddings, EmbedTextsResult, GetAIAPIKey } from '@memberjunction/ai';
import { CredentialEngine } from '@memberjunction/credentials';
import { BaseResponse, VectorDBBase, VectorRecord } from '@memberjunction/ai-vectordb';
import { PageRecordsParams, VectorBase } from '@memberjunction/ai-vectors';
import { BaseEntity, CompositeKey, EntityField, EntityFieldInfo, EntityInfo, IMetadataProvider, LogError, LogStatus, Metadata, RunView, RunViewResult, UserInfo } from '@memberjunction/core';
import { MJAIModelEntity, MJEntityDocumentEntity, MJEntityDocumentTypeEntity, MJEntityRecordDocumentEntity, MJTemplateContentEntity,
  MJTemplateContentTypeEntity, MJTemplateEntity, MJTemplateEntityExtended, MJTemplateParamEntity, MJVectorDatabaseEntity, MJVectorIndexEntity } from '@memberjunction/core-entities';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { pipeline } from 'node:stream/promises';
import { EmbeddingData, TemplateParamData, VectorEmeddingData, VectorizeEntityParams, VectorizeEntityResponse, VectorizeProgressUpdate } from '../generic/vectorSync.types';
import { EntityDocumentConfiguration, EntityDocumentMetadataConfig, EntityDocumentFieldConfig } from '../generic/entityDocumentConfig.types';
import { EntityDocumentCache } from './EntityDocumentCache';
import { PagedRecords } from './PagedRecords';
import { AsyncBatchTransform } from './AsyncBatchTransform';
import { PassThrough, Transform, TransformCallback } from 'node:stream';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineServer } from '@memberjunction/templates';
import { TemplateRenderResult } from '@memberjunction/templates-base-types';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';

/**
 * Class that specializes in vectorizing entities using embedding models and upserting them into Vector Databases 
 */
export class EntityVectorSyncer extends VectorBase {
  _startTime: Date;
  _endTime: Date;
  /** Accumulates render errors across batches so they can be reported through the progress callback */
  private _renderErrors: { RecordID: string; Message: string }[] = [];

  /**
   * Returns the active metadata provider — explicit override (via `this.Provider = ...`)
   * if set, otherwise the global default. Provided as `ProviderToUse` for backward
   * compatibility with code paths that referenced this name before the base class
   * standardized on the `Provider` getter/setter.
   */
  protected get ProviderToUse(): IMetadataProvider {
    return this.Provider;
  }

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
    await KnowledgeHubMetadataEngine.Instance.Config(forceRefresh, contextUser);
    await TemplateEngineServer.Instance.Config(forceRefresh, contextUser);
  }

  public async VectorizeEntity(params: VectorizeEntityParams, contextUser?: UserInfo): Promise<VectorizeEntityResponse> {
    if (!contextUser) {
      throw new Error('ContextUser is required to vectorize the entity');
    }

    const startTime: number = new Date().getTime();
    super.CurrentUser = contextUser;
    this._renderErrors = []; // reset for each vectorization run
    await TemplateEngineServer.Instance.Config(false, contextUser);

    const entityDocument: MJEntityDocumentEntity = await this.GetEntityDocument(params.entityDocumentID);
    const vectorIndexEntity: MJVectorIndexEntity = this.GetVectorIndexForEntityDocument(entityDocument);
    const obj: VectorEmeddingData = await this.GetVectorDatabaseAndEmbeddingClassByEntityDocumentID(params.entityDocumentID);

    // Parse configuration for pipeline tuning
    const docConfig = this.parseDocumentConfig(entityDocument);
    const pipelineConfig = docConfig.pipeline;
    const delayTimeMS: number = pipelineConfig?.delayBetweenCallsMs ?? 250;

    const md = this.ProviderToUse;
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

    // Pipeline tuning: explicit params override config, config overrides defaults
    const pageSize: number = params.listBatchCount || pipelineConfig?.fetchBatchSize || 50;
    const dataStream = new PagedRecords();
    const templateContent = template.Content[0];

    const vectorCreator = this.createVectorCreator(
      template, templateContent, obj.embedding, delayTimeMS,
      params.VectorizeBatchCount || pipelineConfig?.vectorizeBatchSize,
      pipelineConfig?.maxConcurrentEmbeddings
    );

    const vectorUpserter = this.createVectorUpserter(
      entityDocument, templateContent, obj.vectorDB, vectorIndexEntity.Name, delayTimeMS,
      params.UpsertBatchCount || pipelineConfig?.upsertBatchSize
    );

    const erdUpserter = new AsyncBatchTransform<EmbeddingData, undefined, EmbeddingData>({
      batchSize: 10,
      concurrencyLimit: 2,
      processBatch: async (batch: EmbeddingData[]): Promise<EmbeddingData[]> => {
        await Promise.all(batch.map(item => this.UpsertEntityRecordDocumentRecords(item, super.CurrentUser)));
        return batch;
      },
    });

    // Track progress: count records fed into the paging stream and records that exit the pipeline
    let totalRecordsFed = 0;
    let processedRecords = 0;
    const onProgress = params.OnProgress;

    // Wrap addPage to track total records fed into the stream
    const originalAddPage = dataStream.addPage.bind(dataStream);
    dataStream.addPage = (items: Record<string, unknown>[]) => {
      totalRecordsFed += items.length;
      originalAddPage(items);
    };

    // Progress tracker sits at the end of the pipeline and emits updates.
    // Throttled to emit only when the percentage changes to avoid flooding PubSub.
    let lastEmittedPct = -1;
    let dataStreamEnded = false;
    const renderErrors = this._renderErrors; // capture reference for use in Transform closure
    const progressTracker = new Transform({
      objectMode: true,
      transform(chunk: EmbeddingData, _encoding: BufferEncoding, callback: TransformCallback) {
        processedRecords++;
        if (onProgress) {
          const elapsed = new Date().getTime() - startTime;
          const pct = totalRecordsFed > 0 ? Math.min(Math.round((processedRecords / totalRecordsFed) * 100), 99) : 0;

          // Detect when all records have been processed and data stream is done
          if (dataStreamEnded && processedRecords >= totalRecordsFed) {
            onProgress({
              TotalRecords: totalRecordsFed,
              ProcessedRecords: processedRecords,
              Stage: 'complete',
              PercentComplete: 100,
              ElapsedMs: elapsed,
              Errors: renderErrors.length > 0 ? renderErrors : undefined,
            });
          } else {
            // Throttle: only emit on 5% boundaries to avoid flooding PubSub/WebSocket
            const bucket = Math.floor(pct / 5) * 5;
            if (bucket !== lastEmittedPct) {
              lastEmittedPct = bucket;
              onProgress({
                TotalRecords: totalRecordsFed,
                ProcessedRecords: processedRecords,
                Stage: 'upserting',
                PercentComplete: pct,
                ElapsedMs: elapsed,
              });
            }
          }
        }
        callback(null, chunk);
      }
    });

    // Track when the data stream finishes feeding records
    const originalEndStream = dataStream.endStream.bind(dataStream);
    dataStream.endStream = () => {
      dataStreamEnded = true;
      originalEndStream();
    };

    this.startDataPaging(dataStream, params, md, entity, template, vectorIndexEntity, entityDocument, pageSize);

    LogStatus('Starting pipeline');
    await pipeline(dataStream, vectorCreator, vectorUpserter, erdUpserter, progressTracker, new PassThrough({ objectMode: true }));

    const elapsedMs: number = new Date().getTime() - startTime;
    const elapsedSeconds = elapsedMs / 1000;
    LogStatus(`Finished vectorizing ${entityDocument.Entity} entity in ${elapsedSeconds} seconds (${(elapsedSeconds / 60).toFixed(1)} minutes)`);

    // Emit final 100% completion with any accumulated render errors
    if (onProgress) {
      onProgress({
        TotalRecords: totalRecordsFed,
        ProcessedRecords: processedRecords,
        Stage: 'complete',
        PercentComplete: 100,
        ElapsedMs: elapsedMs,
        Errors: this._renderErrors.length > 0 ? this._renderErrors : undefined,
      });
    }

    const errorSummary = this._renderErrors.length > 0
      ? `${this._renderErrors.length} record(s) failed template rendering`
      : '';
    return { success: true, status: 'Complete', errorMessage: errorSummary };
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
    batchSize?: number,
    concurrencyLimit?: number
  ): AsyncBatchTransform<Record<string, unknown>, undefined, EmbeddingData> {
    return new AsyncBatchTransform<Record<string, unknown>, undefined, EmbeddingData>({
      batchSize: batchSize || 50,
      concurrencyLimit: concurrencyLimit ?? 2,
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
    indexName: string,
    delayTimeMS: number,
    batchSize?: number
  ): AsyncBatchTransform<EmbeddingData, undefined, EmbeddingData> {
    return new AsyncBatchTransform<EmbeddingData, undefined, EmbeddingData>({
      batchSize: batchSize || 50,
      concurrencyLimit: 2,
      processBatch: (batch: EmbeddingData[]): Promise<EmbeddingData[]> =>
        this.upsertBatchToVectorDB(batch, entityDocument, templateContent, vectorDB, indexName, delayTimeMS),
    });
  }

  /**
   * Renders templates for a batch of entity records and generates embeddings for the rendered text.
   * Tracks render failures and attaches error info to the returned EmbeddingData array so the
   * caller can surface them through the progress callback.
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
      // No pre-validation — entity records commonly have null fields (e.g. Bio, State)
      // and the Nunjucks templates handle missing data gracefully via {% if Field %} conditionals.
      // Pass SuppressWarnings=true since entity doc vectorization doesn't need warnings for missing fields.
      const result: TemplateRenderResult = await TemplateEngineServer.Instance.RenderTemplate(template, templateContent, entityData, true, true);
      if (result.Success) {
        validEntries.push({ text: result.Output, record: entityData });
      } else {
        const recordID = String(entityData.__mj_recordID ?? entityData.ID ?? 'unknown');
        LogError(`Error rendering template for record ${recordID}`, undefined, result.Message);
        this._renderErrors.push({ RecordID: recordID, Message: result.Message });
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
  /** Default max chars for large text fields (nvarchar(MAX) or MaxLength > 5000) in vector metadata */
  private static readonly DEFAULT_LARGE_FIELD_TRUNCATION = 1000;

  /**
   * Parse the EntityDocumentConfiguration JSON from an entity document.
   * Returns an empty object if the Configuration column is null or invalid JSON.
   */
  private parseDocumentConfig(entityDocument: MJEntityDocumentEntity): EntityDocumentConfiguration {
    const raw = entityDocument.Configuration;
    if (!raw) return {};
    try {
      return JSON.parse(raw) as EntityDocumentConfiguration;
    } catch {
      LogError(`Invalid JSON in EntityDocument.Configuration for "${entityDocument.Name}", using defaults`);
      return {};
    }
  }

  /**
   * Get fields to include in vector metadata for display in search results.
   * Respects EntityDocumentConfiguration.metadata.fieldStrategy and per-field overrides.
   *
   * Default behavior (no config or fieldStrategy = "all"):
   *   Include all fields except PKs, binary types, and system (__mj_*) fields.
   *
   * "include" strategy: only fields explicitly listed in config.metadata.fields with included=true.
   * "exclude" strategy: all eligible fields except those listed with included=false.
   */
  private getDisplayFields(entityInfo: EntityInfo | undefined, metadataConfig?: EntityDocumentMetadataConfig): EntityFieldInfo[] {
    if (!entityInfo) return [];

    const skipTypes = new Set(['uniqueidentifier', 'varbinary', 'image', 'binary', 'timestamp', 'rowversion']);
    const allEligible = entityInfo.Fields.filter(f =>
      !f.IsPrimaryKey &&
      !f.Name.startsWith('__mj_') &&
      !skipTypes.has(f.Type.toLowerCase())
    );

    const strategy = metadataConfig?.fieldStrategy ?? 'all';
    const fieldOverrides: Record<string, EntityDocumentFieldConfig> = metadataConfig?.fields ?? {};

    switch (strategy) {
      case 'include':
        // Only include fields explicitly marked as included
        return allEligible.filter(f => fieldOverrides[f.Name]?.included === true);

      case 'exclude':
        // Include all except those explicitly excluded
        return allEligible.filter(f => fieldOverrides[f.Name]?.included !== false);

      case 'all':
      default:
        // Include everything, but respect individual field exclusions
        return allEligible.filter(f => fieldOverrides[f.Name]?.included !== false);
    }
  }

  /**
   * Get the truncation limit for a field based on its MaxLength and
   * optional per-field or global overrides from EntityDocumentConfiguration.
   */
  private getFieldTruncationLimit(field: EntityFieldInfo, metadataConfig?: EntityDocumentMetadataConfig): number {
    // Check for per-field override first
    const fieldConfig = metadataConfig?.fields?.[field.Name];
    if (fieldConfig?.truncationLimit != null && fieldConfig.truncationLimit > 0) {
      return fieldConfig.truncationLimit;
    }

    // For small fields, use the field's own MaxLength
    if (field.MaxLength && field.MaxLength > 0 && field.MaxLength <= 5000) {
      return field.MaxLength;
    }

    // Large field — use global override or default
    return metadataConfig?.defaultTruncationLimit ?? EntityVectorSyncer.DEFAULT_LARGE_FIELD_TRUNCATION;
  }

  private async upsertBatchToVectorDB(
    batch: EmbeddingData[],
    entityDocument: MJEntityDocumentEntity,
    templateContent: MJTemplateContentEntity,
    vectorDB: VectorDBBase,
    indexName: string,
    delayTimeMS: number
  ): Promise<EmbeddingData[]> {
    // Parse entity document configuration for metadata enrichment settings
    const docConfig = this.parseDocumentConfig(entityDocument);
    const metadataConfig = docConfig.metadata;

    // Get entity metadata for enriching vector metadata with display fields
    const md = this.ProviderToUse;
    const entityInfo = md.Entities.find(e => UUIDsEqual(e.ID, entityDocument.EntityID));
    const displayFields = this.getDisplayFields(entityInfo, metadataConfig);

    const vectorRecords: VectorRecord[] = batch.map((embeddingItem: EmbeddingData) => {
      // Deterministic vector ID: SHA-1 hash of entityDocumentID + compositeKey
      // ensures re-syncing upserts in place (no duplicates) and stays under
      // Pinecone's 512-byte ID limit (hash is 40 chars)
      const raw = `${entityDocument.ID}_${embeddingItem.__mj_compositeKey}`;
      const hash = createHash('sha1').update(raw).digest('hex');
      const vectorId: string = hash;
      embeddingItem.VectorID = vectorId;

      // Build enriched metadata with display fields from the record
      const metadata: Record<string, string> = {
        RecordID: String(embeddingItem.__mj_compositeKey ?? ''),
        Entity: entityDocument.Entity,
        TemplateID: templateContent.ID,
      };

      // Add entity icon if available (respects includeEntityIcon config, default true)
      if (entityInfo?.Icon && (metadataConfig?.includeEntityIcon !== false)) {
        metadata['EntityIcon'] = entityInfo.Icon;
      }

      // Add __mj_UpdatedAt for recency sorting (respects includeUpdatedAt config, default true)
      const record = embeddingItem.EntityData as Record<string, unknown>;
      if (record['__mj_UpdatedAt'] && (metadataConfig?.includeUpdatedAt !== false)) {
        metadata['__mj_UpdatedAt'] = String(record['__mj_UpdatedAt']);
      }

      // Add display fields with appropriate truncation (respects config overrides)
      for (const field of displayFields) {
        const val = record[field.Name];
        if (val != null) {
          const strVal = String(val);
          const limit = this.getFieldTruncationLimit(field, metadataConfig);
          metadata[field.Name] = strVal.length > limit ? strVal.substring(0, limit) : strVal;
        }
      }

      return {
        id: vectorId,
        values: embeddingItem.Vector,
        metadata
      };
    });

    const response: BaseResponse = await vectorDB.CreateRecords(vectorRecords, indexName);
    if (!response.success) {
      LogError('Unable to save records to vector database', undefined, response.message);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, delayTimeMS));
    return batch;
  }

  /**
   * Starts the async data paging loop that feeds records into the stream pipeline.
   */
  private startDataPaging(
    dataStream: PagedRecords,
    params: VectorizeEntityParams,
    md: IMetadataProvider,
    entity: EntityInfo,
    template: MJTemplateEntityExtended,
    vectorIndexEntity: MJVectorIndexEntity,
    entityDocument: MJEntityDocumentEntity,
    pageSize: number
  ): void {
    const getData = async (): Promise<void> => {
      // Prefer keyset (seek) pagination for entities with a single-column orderable PK.
      // Keyset stays O(log N) per page regardless of depth, which matters for the
      // millions-of-records entities that vectorization sometimes ingests.
      // Falls back to OFFSET-based PageNumber when the entity has a composite PK
      // (correct but progressively slower on deep pages).
      const canUseKeyset = this.CanUseKeysetPagination(params.entityID);
      const pkField = entity.FirstPrimaryKey;
      let pageNumber = 0;
      let lastSeenKey: CompositeKey | undefined;

      if (params.StartingOffset) {
        if (canUseKeyset) {
          // Keyset can't "skip ahead" without knowing the PK at that offset. If callers
          // pass StartingOffset (rare), we fall back to OFFSET mode for this run.
          LogStatus(`StartingOffset=${params.StartingOffset} is set — using OFFSET-based pagination for this run (keyset unavailable when skipping ahead).`);
        } else {
          pageNumber = params.StartingOffset * pageSize;
          LogStatus(`Starting at offset ${params.StartingOffset} (skipping first ${pageNumber} records)`);
        }
      }

      const useKeysetForThisRun = canUseKeyset && !params.StartingOffset;
      let pageIndex = 0;

      let hasMore = true;
      while (hasMore) {
        const pageRecordRequest: PageRecordsParams = {
          EntityID: params.entityID,
          PageNumber: useKeysetForThisRun ? 0 : pageNumber,
          PageSize: pageSize,
          ResultType: 'simple',
          AfterKey: useKeysetForThisRun ? lastSeenKey : undefined,
        };

        if (params.listID) {
          const coreSchema: string = md.ConfigData.MJCoreSchemaName;
          pageRecordRequest.Filter = this.BuildListFilter(entity, coreSchema, params.listID);
        }

        const recordsPage: unknown[] = await super.PageRecordsByEntityID<unknown>(pageRecordRequest);
        const relatedData: TemplateParamData[] = await this.GetRelatedTemplateDataForBatch(entity, recordsPage, template);
        const items: Record<string, unknown>[] = [];

        LogStatus(`Fetched page ${pageIndex + 1} with ${recordsPage.length} records to process`);

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

        if (useKeysetForThisRun && pkField) {
          // Advance the keyset cursor to the last record's PK value
          const lastRecord = recordsPage[recordsPage.length - 1] as Record<string, unknown>;
          const lastValue = lastRecord[pkField.Name];
          if (lastValue == null) {
            // Defensive: PK should never be null. If it is, we can't keyset-advance, so stop.
            LogError(`Keyset pagination: last record on page ${pageIndex + 1} has null PK; halting iteration.`);
            break;
          }
          // Safety net: the cursor must strictly advance each page. If it doesn't, the seek
          // window is repeating (e.g. the query isn't ordered by the PK, or a caching layer
          // is returning a stale page) and we'd loop forever. Bail with a clear diagnostic.
          const prevKeyValue = lastSeenKey?.KeyValuePairs?.[0]?.Value;
          if (prevKeyValue != null && String(prevKeyValue) === String(lastValue)) {
            LogError(`Keyset cursor did not advance (stuck at ${pkField.Name}=${lastValue}); halting to avoid an infinite loop. ` +
              `The seek page is repeating — check that the query is ordered by ${pkField.Name} and not served from a stale cache.`);
            break;
          }
          lastSeenKey = CompositeKey.FromKeyValuePair(pkField.Name, lastValue);
        } else {
          pageNumber++;
        }
        pageIndex++;
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
    const md = this.ProviderToUse;
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
    const vectorDBAPIKey: string = await this.ResolveVectorDBAPIKey(vectorDBEntity);

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

  /**
   * Resolves the API key for a vector database provider. Checks the Credential Engine
   * first (if VectorDatabase.CredentialID is set), then falls back to the legacy
   * environment variable AI_VENDOR_API_KEY__<ClassKey>.
   */
  protected async ResolveVectorDBAPIKey(vectorDBEntity: MJVectorDatabaseEntity): Promise<string> {
    if (vectorDBEntity.CredentialID) {
      try {
        await CredentialEngine.Instance.Config(false, super.CurrentUser);
        const credentialEntity = CredentialEngine.Instance.getCredentialById(vectorDBEntity.CredentialID);
        if (credentialEntity) {
          const resolved = await CredentialEngine.Instance.getCredential(credentialEntity.Name, {
            credentialId: vectorDBEntity.CredentialID,
            contextUser: super.CurrentUser,
            subsystem: 'VectorSync',
          });
          // The credential Values JSON may store the key as "apiKey" or as a raw string
          const apiKey = resolved.values.apiKey ?? resolved.values.api_key;
          if (apiKey) {
            LogStatus(`Using Credential Engine API key for vector DB "${vectorDBEntity.Name}"`);
            return apiKey;
          }
          LogError(`Credential "${credentialEntity.Name}" for vector DB "${vectorDBEntity.Name}" has no apiKey field, falling back to environment variable`);
        } else {
          LogError(`Credential ID ${vectorDBEntity.CredentialID} not found for vector DB "${vectorDBEntity.Name}", falling back to environment variable`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        LogError(`Failed to resolve credential for vector DB "${vectorDBEntity.Name}": ${msg}, falling back to environment variable`);
      }
    }
    // Fallback to legacy environment variable
    return GetAIAPIKey(vectorDBEntity.ClassKey);
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

  /**
   * Resolves the VectorIndex for the given EntityDocument by looking up its VectorIndexID
   * using the cached KnowledgeHubMetadataEngine. If VectorIndexID is not set on the
   * EntityDocument, throws a descriptive error instructing the user to configure it.
   */
  private GetVectorIndexForEntityDocument(entityDocument: MJEntityDocumentEntity): MJVectorIndexEntity {
    if (!entityDocument.VectorIndexID) {
      throw new Error(
        `Entity Document "${entityDocument.Name}" (ID: ${entityDocument.ID}) does not have a VectorIndexID configured. ` +
        `Please edit the Entity Document and select a Vector Index before running vectorization. ` +
        `You can create a Vector Index in the Knowledge Hub > Vector Indexes section.`
      );
    }

    const vectorIndex = KnowledgeHubMetadataEngine.Instance.GetVectorIndexById(entityDocument.VectorIndexID);
    if (!vectorIndex) {
      throw new Error(
        `Vector Index with ID "${entityDocument.VectorIndexID}" not found for Entity Document "${entityDocument.Name}". ` +
        `The configured VectorIndexID may refer to a deleted index. Please update the Entity Document's Vector Index setting.`
      );
    }

    return vectorIndex;
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
    const vectorIndex = KnowledgeHubMetadataEngine.Instance.GetVectorIndexById(vectorIndexID);
    if (!vectorIndex) {
      LogError(`Vector Index with ID ${vectorIndexID} not found in KnowledgeHubMetadataEngine cache`);
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
  protected BuildListFilter(entity: EntityInfo, listDetailsSchema: string, listId: string): string {
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