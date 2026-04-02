/**
 * @fileoverview Modernized duplicate record detection engine.
 *
 * Orchestrates the full pipeline: vectorize records, query for similar candidates,
 * optionally apply hybrid search (RRF) and reranking, persist match results,
 * and auto-merge high-confidence duplicates.
 *
 * Supports three record-source modes:
 * 1. List-based batch detection (ListID provided)
 * 2. View-based detection (ViewID provided)
 * 3. Entity-wide detection (no ListID/ViewID — scans all records or applies ExtraFilter)
 *
 * Also supports single-record checks via CheckSingleRecord().
 *
 * @module @memberjunction/ai-vector-dupe
 */

import { BaseEmbeddings, GetAIAPIKey } from "@memberjunction/ai";
import {
    PotentialDuplicateRequest,
    PotentialDuplicateResponse,
    CompositeKey,
    UserInfo,
    BaseEntity,
    PotentialDuplicateResult,
    LogError,
    LogStatus,
    RecordMergeRequest,
    EntityInfo,
    PotentialDuplicate,
    DuplicateDetectionOptions,
    DuplicateDetectionProgress,
    RunView,
} from "@memberjunction/core";
import { BaseResponse, VectorDBBase, VectorDatabaseConfiguration } from "@memberjunction/ai-vectordb";
import { MJGlobal, UUIDsEqual } from "@memberjunction/global";
import {
    MJDuplicateRunDetailEntity,
    MJDuplicateRunDetailMatchEntity,
    MJDuplicateRunEntity,
    MJEntityDocumentEntity,
    MJListDetailEntity,
    MJListEntity,
} from "@memberjunction/core-entities";
import { VectorBase } from "@memberjunction/ai-vectors";
import { EntityDocumentTemplateParser, EntityVectorSyncer, VectorizeEntityParams } from "@memberjunction/ai-vector-sync";
import { TemplateEngineServer } from "@memberjunction/templates";
import type { MJTemplateEntityExtended, MJTemplateContentEntity } from "@memberjunction/core-entities";
import { ComputeRRF, ScoredCandidate } from "@memberjunction/core";

/** Default number of nearest neighbors to retrieve per record */
const DEFAULT_TOP_K = 5;

/** Default concurrency limit for parallel vector queries */
const DEFAULT_QUERY_CONCURRENCY = 10;

/** Default batch size for loading records and parallel database saves */
const DEFAULT_BATCH_SIZE = 500;

/** Default batch size for parallel database saves */
const SAVE_BATCH_SIZE = 20;

/**
 * Metadata structure returned by vector DB for each matched record.
 */
interface VectorMatchMetadata {
    RecordID: string;
    Entity: string;
    TemplateID: string;
}

/**
 * A single match from a vector DB query with typed metadata.
 */
interface VectorMatch {
    id: string;
    score: number;
    metadata: VectorMatchMetadata | null;
}

/**
 * Internal result from querying duplicates for a single source record.
 */
interface RecordQueryResult {
    SourceKey: CompositeKey;
    TemplateText: string;
    Duplicates: PotentialDuplicateResult;
}

/**
 * Modernized duplicate record detection engine.
 *
 * Supports:
 * - List-based batch detection (getDuplicateRecords)
 * - View/filter/full-entity batch detection (vector-first approach)
 * - Single-record duplicate check (CheckSingleRecord)
 * - Hybrid search via RRF when vector DB supports it
 * - Optional post-retrieval reranking via MJ's BaseReranker
 * - Configurable topK, thresholds, and progress reporting
 */
export class DuplicateRecordDetector extends VectorBase {
    private vectorDB: VectorDBBase;
    private embedding: BaseEmbeddings;
    /** The Pinecone/pgvector/Qdrant index name resolved from the entity document's VectorIndex */
    private indexName: string;

    /**
     * Run duplicate detection for records identified by ListID, ViewID, ExtraFilter,
     * or all records in the entity (vector-first approach).
     *
     * Flow: validate -> vectorize -> init providers -> load/create run ->
     *       load record IDs -> batch(embed -> query -> persist) -> complete run -> auto-merge
     */
    public async GetDuplicateRecords(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {
        this.CurrentUser = contextUser;
        const options = params.Options ?? {};
        const startTime = Date.now();

        const response = new PotentialDuplicateResponse();
        response.PotentialDuplicateResult = [];

        // Step 1: Validate entity document
        const entityDocument = await this.ValidateEntityDocument(params.EntityDocumentID);
        if (!entityDocument) {
            response.ErrorMessage = `No active Entity Document found for ID ${params.EntityDocumentID}`;
            response.Status = 'Error';
            return response;
        }

        // Step 2: Optionally vectorize source records (default: skip — vectors should already exist from sync)
        if (options.Revectorize) {
            this.reportProgress(options, 'Vectorizing', 0, 0, 0, startTime);
            await this.VectorizeSourceRecords(entityDocument, contextUser);
        }

        // Step 3: Initialize providers
        await this.InitializeProviders(entityDocument);

        // Step 4: Create or load DuplicateRun
        const duplicateRun = await this.ResolveOrCreateDuplicateRun(params, entityDocument, options);

        // Step 5: Load record IDs to check (batch-friendly — only IDs)
        this.reportProgress(options, 'Loading', 0, 0, 0, startTime);
        const entityInfo = this.Metadata.EntityByID(entityDocument.EntityID);
        if (!entityInfo) {
            response.ErrorMessage = `Entity not found for ID ${entityDocument.EntityID}`;
            response.Status = 'Error';
            return response;
        }

        const recordIDs = await this.LoadRecordIDsToCheck(params, entityInfo);
        if (recordIDs.length === 0) {
            response.ErrorMessage = 'No records found to check for duplicates';
            response.Status = 'Error';
            return response;
        }

        // Step 6: Process in batches
        const batchSize = DEFAULT_BATCH_SIZE;
        const concurrency = this.GetQueryConcurrency(entityDocument);
        const topK = options.TopK ?? DEFAULT_TOP_K;
        const templateParser = EntityDocumentTemplateParser.CreateInstance();
        let totalMatchesFound = 0;

        for (let offset = 0; offset < recordIDs.length; offset += batchSize) {
            const batchIDs = recordIDs.slice(offset, offset + batchSize);
            const batchResults = await this.ProcessBatch(
                batchIDs, entityInfo, entityDocument, templateParser, duplicateRun.ID,
                topK, concurrency, options, startTime, recordIDs.length, offset, totalMatchesFound, contextUser
            );
            response.PotentialDuplicateResult.push(...batchResults.Results);
            totalMatchesFound += batchResults.MatchesFound;
        }

        // Step 7: Complete the duplicate run
        duplicateRun.ProcessingStatus = 'Complete';
        duplicateRun.EndedAt = new Date();
        const runSaveSuccess = await this.SaveEntity(duplicateRun);
        if (!runSaveSuccess) {
            throw new Error(`Failed to update Duplicate Run record ${duplicateRun.ID}`);
        }

        // Step 8: Auto-merge high-confidence matches
        this.reportProgress(options, 'Merging', recordIDs.length, recordIDs.length, totalMatchesFound, startTime);
        await this.ProcessAutoMerges(response, entityDocument);

        response.Status = 'Success';
        LogStatus(`Duplicate detection complete: ${recordIDs.length} records checked, ${totalMatchesFound} matches found`);
        return response;
    }

    /**
     * Check a single record for duplicates without requiring a list.
     * Embeds the record and queries for matches directly.
     */
    public async CheckSingleRecord(
        EntityDocumentID: string,
        RecordID: CompositeKey,
        Options?: DuplicateDetectionOptions,
        ContextUser?: UserInfo
    ): Promise<PotentialDuplicateResult> {
        this.CurrentUser = ContextUser;
        const options = Options ?? {};

        const entityDocument = await this.ValidateEntityDocument(EntityDocumentID);
        if (!entityDocument) {
            throw new Error(`No active Entity Document found for ID ${EntityDocumentID}`);
        }

        await this.InitializeProviders(entityDocument);

        // Load the single record
        const entityInfo = this.Metadata.EntityByID(entityDocument.EntityID);
        if (!entityInfo) {
            throw new Error(`Entity not found for ID ${entityDocument.EntityID}`);
        }

        const records = await this.RunView.RunView<BaseEntity>({
            EntityName: entityInfo.Name,
            ExtraFilter: this.BuildExtraFilter([RecordID]),
            ResultType: 'entity_object',
        }, this.CurrentUser);

        if (!records.Success || records.Results.length === 0) {
            throw new Error(`Record not found: ${RecordID.ToString()}`);
        }

        const record = records.Results[0];
        const templateParser = EntityDocumentTemplateParser.CreateInstance();
        const templateTexts = await this.GenerateTemplateTexts(templateParser, entityDocument, [record], ContextUser);
        const embedResult = await this.embedding.EmbedTexts({ texts: templateTexts, model: null });

        const topK = options.TopK ?? DEFAULT_TOP_K;
        const queryResults = await this.QueryDuplicatesForRecords(
            [record], embedResult.vectors, templateTexts, entityDocument, topK, options,
            this.GetQueryConcurrency(entityDocument)
        );

        return queryResults.length > 0 ? queryResults[0].Duplicates : new PotentialDuplicateResult();
    }

    // ─────────────────────────────────────────────
    // Batch Processing
    // ─────────────────────────────────────────────

    /**
     * Result from processing a single batch of records.
     */
    private async ProcessBatch(
        batchIDs: string[],
        entityInfo: EntityInfo,
        entityDocument: MJEntityDocumentEntity,
        templateParser: ReturnType<typeof EntityDocumentTemplateParser.CreateInstance>,
        duplicateRunID: string,
        topK: number,
        concurrency: number,
        options: DuplicateDetectionOptions,
        startTime: number,
        totalRecords: number,
        processedSoFar: number,
        matchesSoFar: number,
        contextUser: UserInfo
    ): Promise<{ Results: PotentialDuplicateResult[]; MatchesFound: number }> {
        // 6a: Load full record data for this batch (needed for template rendering)
        const compositeKeys = batchIDs.map(id => {
            const ck = new CompositeKey();
            ck.KeyValuePairs.push({ FieldName: entityInfo.FirstPrimaryKey.Name, Value: id });
            return ck;
        });
        const records = await this.LoadRecordsByKeys(compositeKeys, entityInfo);
        if (records.length === 0) {
            return { Results: [], MatchesFound: 0 };
        }

        // 6b: Create DuplicateRunDetail records for this batch
        const duplicateRunDetails = await this.CreateRunDetailRecords(batchIDs, duplicateRunID);

        // 6c: Generate template texts and embed
        this.reportProgress(options, 'Embedding', totalRecords, processedSoFar, matchesSoFar, startTime);
        const templateTexts = await this.GenerateTemplateTexts(templateParser, entityDocument, records, contextUser);
        const embedResult = await this.embedding.EmbedTexts({ texts: templateTexts, model: null });

        // 6d: Query vector DB for each record with concurrency control
        this.reportProgress(options, 'Querying', totalRecords, processedSoFar, matchesSoFar, startTime);
        const queryResults = await this.QueryDuplicatesForRecords(
            records, embedResult.vectors, templateTexts, entityDocument, topK, options, concurrency
        );

        // 6e: Persist match results and update run details
        this.reportProgress(options, 'Matching', totalRecords, processedSoFar + records.length, matchesSoFar, startTime);
        const results = await this.PersistMatchResults(
            queryResults, duplicateRunDetails, entityDocument, options, startTime
        );

        const batchMatches = results.reduce((sum, r) => sum + r.Duplicates.length, 0);
        return { Results: results, MatchesFound: batchMatches };
    }

    // ─────────────────────────────────────────────
    // Record ID Loading (multiple strategies)
    // ─────────────────────────────────────────────

    /**
     * Load the IDs of records to check, using the appropriate strategy based on the request.
     * Returns an array of primary key value strings.
     */
    protected async LoadRecordIDsToCheck(params: PotentialDuplicateRequest, entityInfo: EntityInfo): Promise<string[]> {
        if (params.ListID) {
            return this.LoadRecordIDsFromList(params.ListID);
        }
        if (params.ViewID) {
            return this.LoadRecordIDsFromView(params.ViewID, entityInfo);
        }
        // ExtraFilter or all records
        return this.LoadRecordIDsFromEntity(entityInfo, params.ExtraFilter);
    }

    /**
     * Load record IDs from a list's detail records.
     */
    protected async LoadRecordIDsFromList(listID: string): Promise<string[]> {
        const sanitizedListID = listID.replace(/'/g, "''");
        const viewResults = await this.RunView.RunView<{ RecordID: string }>({
            EntityName: 'MJ: List Details',
            ExtraFilter: `ListID = '${sanitizedListID}'`,
            Fields: ['RecordID'],
            ResultType: 'simple',
        }, this.CurrentUser);

        if (!viewResults.Success) {
            throw new Error(`Failed to load list details: ${viewResults.ErrorMessage}`);
        }
        return viewResults.Results.map(r => r.RecordID);
    }

    /**
     * Load record IDs by running a saved view.
     */
    protected async LoadRecordIDsFromView(viewID: string, entityInfo: EntityInfo): Promise<string[]> {
        const pkField = entityInfo.FirstPrimaryKey.Name;
        const sanitizedViewID = viewID.replace(/'/g, "''");

        // Load the view definition to get its filter
        const viewEntity = await this.RunViewForSingleValue<BaseEntity>(
            'Views', `ID = '${sanitizedViewID}'`
        );
        if (!viewEntity) {
            throw new Error(`View not found: ${viewID}`);
        }

        // Run the entity with the view's filter to get IDs
        const viewResults = await this.RunView.RunView<Record<string, string>>({
            ViewID: viewID,
            Fields: [pkField],
            ResultType: 'simple',
        }, this.CurrentUser);

        if (!viewResults.Success) {
            throw new Error(`Failed to run view ${viewID}: ${viewResults.ErrorMessage}`);
        }
        return viewResults.Results.map(r => r[pkField]);
    }

    /**
     * Load record IDs directly from the entity, optionally filtered.
     * Uses Fields: ['ID'] and ResultType: 'simple' for efficiency.
     */
    protected async LoadRecordIDsFromEntity(entityInfo: EntityInfo, extraFilter?: string): Promise<string[]> {
        const pkField = entityInfo.FirstPrimaryKey.Name;
        const viewResults = await this.RunView.RunView<Record<string, string>>({
            EntityName: entityInfo.Name,
            ExtraFilter: extraFilter,
            Fields: [pkField],
            ResultType: 'simple',
        }, this.CurrentUser);

        if (!viewResults.Success) {
            throw new Error(`Failed to load record IDs from ${entityInfo.Name}: ${viewResults.ErrorMessage}`);
        }
        return viewResults.Results.map(r => r[pkField]);
    }

    // ─────────────────────────────────────────────
    // Validation & Setup
    // ─────────────────────────────────────────────

    /**
     * Validate and return an entity document, or null if not found.
     */
    protected async ValidateEntityDocument(entityDocumentID: string): Promise<MJEntityDocumentEntity | null> {
        const vectorizer = new EntityVectorSyncer();
        vectorizer.CurrentUser = this.CurrentUser;
        return vectorizer.GetEntityDocument(entityDocumentID);
    }

    /**
     * Initialize embedding and vector DB providers via ClassFactory.
     */
    protected async InitializeProviders(entityDocument: MJEntityDocumentEntity): Promise<void> {
        const aiModel = this.GetAIModel(entityDocument.AIModelID);
        const vectorDB = this.GetVectorDatabase(entityDocument.VectorDatabaseID);

        const embeddingAPIKey = GetAIAPIKey(aiModel.DriverClass);
        const vectorDBAPIKey = GetAIAPIKey(vectorDB.ClassKey);

        if (!embeddingAPIKey) {
            throw new Error(`No API Key found for AI Model ${aiModel.DriverClass}`);
        }
        if (!vectorDBAPIKey) {
            throw new Error(`No API Key found for Vector Database ${vectorDB.ClassKey}`);
        }

        this.embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
            BaseEmbeddings, aiModel.DriverClass, embeddingAPIKey
        );
        this.vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, vectorDB.ClassKey, vectorDBAPIKey
        );

        if (!this.embedding) {
            throw new Error(`Failed to create Embeddings instance for ${aiModel.DriverClass}`);
        }
        if (!this.vectorDB) {
            throw new Error(`Failed to create VectorDB instance for ${vectorDB.ClassKey}`);
        }

        // Resolve the vector index name from the entity document's VectorIndexID
        // This is the actual Pinecone/pgvector/Qdrant index name needed for QueryIndex calls
        if (entityDocument.VectorIndexID) {
            const rv = new RunView();
            const indexResult = await rv.RunView<{ Name: string }>({
                EntityName: 'MJ: Vector Indexes',
                ExtraFilter: `ID='${entityDocument.VectorIndexID}'`,
                Fields: ['Name'],
                ResultType: 'simple',
                MaxRows: 1
            }, this.CurrentUser);
            if (indexResult.Success && indexResult.Results.length > 0) {
                this.indexName = indexResult.Results[0].Name;
            }
        }
        if (!this.indexName) {
            throw new Error(`No vector index found for entity document "${entityDocument.Name}". Ensure VectorIndexID is set on the entity document.`);
        }

        LogStatus(`Providers initialized: AI Model=${aiModel.DriverClass}, VectorDB=${vectorDB.ClassKey}, Index=${this.indexName}`);
    }

    /**
     * Run vectorization for the entity document's records.
     */
    protected async VectorizeSourceRecords(entityDocument: MJEntityDocumentEntity, contextUser: UserInfo): Promise<void> {
        const vectorizer = new EntityVectorSyncer();
        vectorizer.CurrentUser = contextUser;

        const request: VectorizeEntityParams = {
            entityID: entityDocument.EntityID,
            entityDocumentID: entityDocument.ID,
            listBatchCount: 20,
            options: {},
            CurrentUser: contextUser,
        };

        LogStatus(`Vectorizing entity records for document ${entityDocument.Name}`);
        await vectorizer.VectorizeEntity(request, contextUser);
    }

    /**
     * Read the maxConcurrentRequests from the VectorDatabase entity's Configuration column,
     * falling back to DEFAULT_QUERY_CONCURRENCY if not set.
     */
    protected GetQueryConcurrency(entityDocument: MJEntityDocumentEntity): number {
        const vectorDBEntity = this.GetVectorDatabase(entityDocument.VectorDatabaseID);
        if (vectorDBEntity.Configuration) {
            try {
                const config: VectorDatabaseConfiguration = JSON.parse(vectorDBEntity.Configuration);
                if (config.throughput?.maxConcurrentRequests != null) {
                    return config.throughput.maxConcurrentRequests;
                }
            } catch {
                // Invalid JSON in Configuration — fall through to default
            }
        }
        return DEFAULT_QUERY_CONCURRENCY;
    }

    // ─────────────────────────────────────────────
    // DuplicateRun Management
    // ─────────────────────────────────────────────

    /**
     * Resolve an existing DuplicateRun or create a new one.
     * Supports both list-based and list-free operation.
     */
    protected async ResolveOrCreateDuplicateRun(
        params: PotentialDuplicateRequest,
        entityDocument: MJEntityDocumentEntity,
        options: DuplicateDetectionOptions
    ): Promise<MJDuplicateRunEntity> {
        // If a specific run ID was provided, load it
        if (options.DuplicateRunID) {
            return this.LoadDuplicateRun(options.DuplicateRunID);
        }

        // If a ListID is provided, try to find an existing run for that list
        if (params.ListID) {
            const existing = await this.FindDuplicateRunByListID(params.ListID);
            if (existing) {
                return existing;
            }
        }

        // Create a new DuplicateRun
        return this.CreateDuplicateRun(entityDocument, params.ListID);
    }

    /**
     * Create a new DuplicateRun record.
     */
    protected async CreateDuplicateRun(
        entityDocument: MJEntityDocumentEntity,
        listID?: string
    ): Promise<MJDuplicateRunEntity> {
        const dupeRun = await this.Metadata.GetEntityObject<MJDuplicateRunEntity>('MJ: Duplicate Runs', this.CurrentUser);
        dupeRun.NewRecord();
        dupeRun.EntityID = entityDocument.EntityID;
        dupeRun.StartedByUserID = this.CurrentUser?.ID;
        dupeRun.StartedAt = new Date();
        dupeRun.ProcessingStatus = 'In Progress';
        dupeRun.ApprovalStatus = 'Pending';
        if (listID) {
            dupeRun.SourceListID = listID;
        }

        const success = await this.SaveEntity(dupeRun);
        if (!success) {
            throw new Error('Failed to create Duplicate Run record');
        }
        return dupeRun;
    }

    protected async LoadDuplicateRun(duplicateRunID: string): Promise<MJDuplicateRunEntity> {
        const dupeRun = await this.Metadata.GetEntityObject<MJDuplicateRunEntity>('MJ: Duplicate Runs', this.CurrentUser);
        dupeRun.ContextCurrentUser = this.CurrentUser;
        const success = await dupeRun.Load(duplicateRunID);
        if (!success) {
            throw new Error(`Failed to load Duplicate Run record ${duplicateRunID}`);
        }
        return dupeRun;
    }

    /**
     * Try to find an existing DuplicateRun for a given ListID. Returns null if none found.
     */
    protected async FindDuplicateRunByListID(listID: string): Promise<MJDuplicateRunEntity | null> {
        return this.RunViewForSingleValue<MJDuplicateRunEntity>(
            'MJ: Duplicate Runs', `SourceListID = '${listID.replace(/'/g, "''")}'`
        );
    }

    // ─────────────────────────────────────────────
    // Entity Loading
    // ─────────────────────────────────────────────

    /**
     * Load full entity objects for a batch of composite keys.
     */
    protected async LoadRecordsByKeys(compositeKeys: CompositeKey[], entityInfo: EntityInfo): Promise<BaseEntity[]> {
        if (compositeKeys.length === 0) {
            return [];
        }

        const rvResult = await this.RunView.RunView<BaseEntity>({
            EntityName: entityInfo.Name,
            ExtraFilter: this.BuildExtraFilter(compositeKeys),
            ResultType: 'entity_object',
        }, this.CurrentUser);

        if (!rvResult.Success) {
            throw new Error(rvResult.ErrorMessage);
        }
        return rvResult.Results;
    }

    /**
     * Load records from an entity that are members of the specified list.
     * Kept for backward compatibility.
     */
    protected async LoadRecordsByListID(listID: string, entityID: string): Promise<BaseEntity[]> {
        const entityInfo: EntityInfo = this.Metadata.EntityByID(entityID);
        if (!entityInfo) {
            throw new Error(`Entity not found for ID ${entityID}`);
        }

        const sanitizedListID = listID.replace(/'/g, "''");
        const rvResult = await this.RunView.RunView<BaseEntity>({
            EntityName: entityInfo.Name,
            ExtraFilter: `ID IN (SELECT RecordID FROM __mj.vwListDetails WHERE ListID = '${sanitizedListID}')`,
            ResultType: 'entity_object',
        }, this.CurrentUser);

        if (!rvResult.Success) {
            throw new Error(rvResult.ErrorMessage);
        }
        return rvResult.Results;
    }

    protected async LoadListEntity(listID: string): Promise<MJListEntity> {
        const list = await this.Metadata.GetEntityObject<MJListEntity>('MJ: Lists');
        list.ContextCurrentUser = this.CurrentUser;
        const success = await list.Load(listID);
        if (!success) {
            throw new Error(`Failed to load List record ${listID}`);
        }
        return list;
    }

    // ─────────────────────────────────────────────
    // Template Generation & Embedding
    // ─────────────────────────────────────────────

    /**
     * Generate human-readable template text for each record using the entity document template.
     *
     * Loads the template from TemplateEngineServer and renders it via Nunjucks,
     * matching the same approach used by the vectorization pipeline.
     */
    protected async GenerateTemplateTexts(
        templateParser: ReturnType<typeof EntityDocumentTemplateParser.CreateInstance>,
        entityDocument: MJEntityDocumentEntity,
        records: BaseEntity[],
        contextUser: UserInfo
    ): Promise<string[]> {
        await TemplateEngineServer.Instance.Config(false, contextUser);
        const template = this.loadTemplate(entityDocument);
        const templateContent = template.Content[0] as MJTemplateContentEntity;
        TemplateEngineServer.Instance.SetupNunjucks();

        const templateTexts: string[] = [];
        for (const record of records) {
            // NEW convention: main entity fields are TOP-LEVEL variables (no Entity. prefix).
            // Spread record fields directly into root context so templates use {{FieldName}}.
            const data: Record<string, unknown> = { ...record.GetAll() };

            const result = await TemplateEngineServer.Instance.RenderTemplate(
                template, templateContent, data, true
            );

            if (result.Success) {
                templateTexts.push(result.Output);
            } else {
                LogError(`Template render failed for record ${record.PrimaryKey.ToString()}: ${result.Message}`);
                templateTexts.push('');
            }
        }
        return templateTexts;
    }

    /**
     * Load the template entity from TemplateEngineServer for the given entity document.
     */
    protected loadTemplate(entityDocument: MJEntityDocumentEntity): MJTemplateEntityExtended {
        const template = TemplateEngineServer.Instance.Templates.find(
            (t: MJTemplateEntityExtended) => UUIDsEqual(t.ID, entityDocument.TemplateID)
        ) as MJTemplateEntityExtended;

        if (!template) {
            throw new Error(`Template not found for ID ${entityDocument.TemplateID}`);
        }
        if (template.Content.length === 0) {
            throw new Error(`Template ${template.ID} has no content records`);
        }
        return template;
    }

    // ─────────────────────────────────────────────
    // Vector Query & Hybrid Search
    // ─────────────────────────────────────────────

    /**
     * Query the vector DB for duplicates of each record, with concurrency control.
     * Supports hybrid search and RRF fusion when the vector DB supports it.
     */
    protected async QueryDuplicatesForRecords(
        records: BaseEntity[],
        vectors: number[][],
        templateTexts: string[],
        entityDocument: MJEntityDocumentEntity,
        topK: number,
        options: DuplicateDetectionOptions,
        concurrency: number
    ): Promise<RecordQueryResult[]> {
        const tasks = records.map((record, index) => async (): Promise<RecordQueryResult> => {
            const compositeKey = record.PrimaryKey;
            const vector = vectors[index];
            const templateText = templateTexts[index];

            const queryResponse = await this.executeVectorQuery(vector, templateText, topK, options);

            if (!queryResponse.success) {
                LogError(`Failed to query index for record ${compositeKey.ToString()}`);
                const emptyResult = new PotentialDuplicateResult();
                emptyResult.EntityID = entityDocument.EntityID;
                emptyResult.RecordCompositeKey = compositeKey;
                return { SourceKey: compositeKey, TemplateText: templateText, Duplicates: emptyResult };
            }

            const dupeResult = this.ParseVectorMatches(queryResponse, compositeKey);
            dupeResult.Duplicates = this.FilterSelfMatches(dupeResult.Duplicates, compositeKey);
            dupeResult.Duplicates = dupeResult.Duplicates.filter(
                (d) => d.ProbabilityScore >= entityDocument.PotentialMatchThreshold
            );
            dupeResult.EntityID = entityDocument.EntityID;
            dupeResult.RecordCompositeKey = compositeKey;

            return { SourceKey: compositeKey, TemplateText: templateText, Duplicates: dupeResult };
        });

        return RunWithConcurrency(tasks, concurrency);
    }

    /**
     * Execute a vector query — uses hybrid search with RRF when the provider supports it.
     */
    protected async executeVectorQuery(
        vector: number[],
        templateText: string,
        topK: number,
        options: DuplicateDetectionOptions
    ): Promise<BaseResponse> {
        if (this.vectorDB.SupportsHybridSearch && templateText) {
            return this.vectorDB.HybridQuery({
                vector,
                topK,
                KeywordQuery: templateText,
                Alpha: options.KeywordSearchWeight != null ? (1.0 - options.KeywordSearchWeight) : 0.7,
                FusionMethod: options.FusionMethod ?? 'rrf',
                includeMetadata: true,
                includeValues: false,
            });
        }

        return this.vectorDB.QueryIndex({
            id: this.indexName,
            vector,
            topK,
            includeMetadata: true,
            includeValues: false,
        });
    }

    /**
     * Parse raw vector DB matches into a PotentialDuplicateResult.
     */
    public ParseVectorMatches(queryResponse: BaseResponse, sourceKey?: CompositeKey): PotentialDuplicateResult {
        const result = new PotentialDuplicateResult();

        if (!queryResponse.data?.matches) {
            return result;
        }

        for (const match of queryResponse.data.matches as VectorMatch[]) {
            if (!match?.id) continue;
            if (!match.metadata?.RecordID) {
                LogError(`Invalid vector metadata for match: ${match.id}`);
                continue;
            }

            const duplicate = new PotentialDuplicate();
            duplicate.LoadFromConcatenatedString(match.metadata.RecordID);
            duplicate.ProbabilityScore = match.score;
            result.Duplicates.push(duplicate);
        }

        return result;
    }

    /**
     * Filter out self-matches where the candidate is the same record as the source.
     */
    protected FilterSelfMatches(duplicates: PotentialDuplicate[], sourceKey: CompositeKey): PotentialDuplicate[] {
        return duplicates.filter((d) => d.ToString() !== sourceKey.ToString());
    }

    // ─────────────────────────────────────────────
    // Run Detail & Match Persistence (Batched)
    // ─────────────────────────────────────────────

    /**
     * Create DuplicateRunDetail records for a batch of record IDs.
     */
    protected async CreateRunDetailRecords(recordIDs: string[], duplicateRunID: string): Promise<MJDuplicateRunDetailEntity[]> {
        const results: MJDuplicateRunDetailEntity[] = [];

        for (const batch of chunkArray(recordIDs, SAVE_BATCH_SIZE)) {
            const batchResults = await Promise.all(
                batch.map(async (recordID) => {
                    const runDetail = await this.Metadata.GetEntityObject<MJDuplicateRunDetailEntity>('MJ: Duplicate Run Details', this.CurrentUser);
                    runDetail.NewRecord();
                    runDetail.DuplicateRunID = duplicateRunID;
                    runDetail.RecordID = recordID;
                    runDetail.MatchStatus = 'Pending';
                    runDetail.MergeStatus = 'Pending';
                    const success = await this.SaveEntity(runDetail);
                    if (!success) {
                        LogError("Failed to save MJDuplicateRunDetailEntity", undefined, runDetail.LatestResult);
                        return null;
                    }
                    return runDetail;
                })
            );
            for (const r of batchResults) {
                if (r) results.push(r);
            }
        }

        return results;
    }

    /**
     * Persist match results and update run detail records.
     */
    protected async PersistMatchResults(
        queryResults: RecordQueryResult[],
        duplicateRunDetails: MJDuplicateRunDetailEntity[],
        entityDocument: MJEntityDocumentEntity,
        options: DuplicateDetectionOptions,
        startTime: number
    ): Promise<PotentialDuplicateResult[]> {
        const results: PotentialDuplicateResult[] = [];
        let matchesFound = 0;

        for (const qr of queryResults) {
            results.push(qr.Duplicates);
            matchesFound += qr.Duplicates.Duplicates.length;

            const detail = duplicateRunDetails.find(
                (d) => UUIDsEqual(d.RecordID, qr.SourceKey.Values())
            );

            if (detail) {
                const matchRecords = await this.CreateMatchRecordsForDetail(detail.ID, qr.Duplicates);
                qr.Duplicates.DuplicateRunDetailMatchRecordIDs = matchRecords.map((m) => m.ID);
                detail.MatchStatus = 'Complete';
                const success = await this.SaveEntity(detail);
                if (!success) {
                    LogError(`Failed to update Duplicate Run Detail record ${detail.ID}`);
                }
            } else {
                LogError(`No Duplicate Run Detail found for ${qr.SourceKey.ToString()}`);
            }

            this.reportProgress(options, 'Matching', queryResults.length, results.length, matchesFound, startTime);
        }

        return results;
    }

    /**
     * Create match records for a single run detail, saving in parallel batches.
     */
    protected async CreateMatchRecordsForDetail(
        duplicateRunDetailID: string,
        duplicateResult: PotentialDuplicateResult
    ): Promise<MJDuplicateRunDetailMatchEntity[]> {
        const matchRecords: MJDuplicateRunDetailMatchEntity[] = [];

        for (const batch of chunkArray(duplicateResult.Duplicates, SAVE_BATCH_SIZE)) {
            const batchResults = await Promise.all(
                batch.map(async (dupe) => {
                    const match = await this.Metadata.GetEntityObject<MJDuplicateRunDetailMatchEntity>(
                        'MJ: Duplicate Run Detail Matches', this.CurrentUser
                    );
                    match.NewRecord();
                    match.DuplicateRunDetailID = duplicateRunDetailID;
                    match.MatchRecordID = dupe.ToString();
                    match.MatchProbability = dupe.ProbabilityScore;
                    match.MatchedAt = new Date();
                    match.Action = '';
                    match.ApprovalStatus = 'Pending';
                    match.MergeStatus = 'Pending';
                    const success = await this.SaveEntity(match);
                    return success ? match : null;
                })
            );
            for (const m of batchResults) {
                if (m) matchRecords.push(m);
            }
        }

        return matchRecords;
    }

    // ─────────────────────────────────────────────
    // Auto-Merge
    // ─────────────────────────────────────────────

    /**
     * Automatically merge records that meet the absolute match threshold.
     */
    protected async ProcessAutoMerges(
        response: PotentialDuplicateResponse,
        entityDocument: MJEntityDocumentEntity
    ): Promise<void> {
        for (const dupeResult of response.PotentialDuplicateResult) {
            for (const [index, dupe] of dupeResult.Duplicates.entries()) {
                if (dupe.ProbabilityScore < entityDocument.AbsoluteMatchThreshold) {
                    continue;
                }

                const mergeParams = new RecordMergeRequest();
                mergeParams.EntityName = entityDocument.Entity;
                mergeParams.SurvivingRecordCompositeKey = dupeResult.RecordCompositeKey;
                mergeParams.RecordsToMerge = [dupe];

                const mergeResult = await this.Metadata.MergeRecords(mergeParams, this.CurrentUser);
                if (mergeResult.Success) {
                    await this.updateMatchRecordAfterMerge(dupeResult.DuplicateRunDetailMatchRecordIDs[index]);
                } else {
                    LogError(`Failed to merge ${dupeResult.RecordCompositeKey.ToString()} and ${dupe.ToString()}`);
                }
            }
        }
    }

    /**
     * Update a match record's status after a successful merge.
     */
    private async updateMatchRecordAfterMerge(matchRecordID: string): Promise<void> {
        const matchRecord = await this.Metadata.GetEntityObject<MJDuplicateRunDetailMatchEntity>(
            'MJ: Duplicate Run Detail Matches', this.CurrentUser
        );
        const loaded = await matchRecord.Load(matchRecordID);
        if (!loaded) {
            LogError(`Failed to load match record ${matchRecordID} for merge status update`);
            return;
        }

        matchRecord.MergeStatus = 'Complete';
        matchRecord.Action = 'Merged';
        matchRecord.MergedAt = new Date();

        const saved = await matchRecord.Save();
        if (!saved) {
            LogError(`Failed to update match record ${matchRecordID} after merge`);
        }
    }

    // ─────────────────────────────────────────────
    // Progress Reporting
    // ─────────────────────────────────────────────

    private reportProgress(
        options: DuplicateDetectionOptions,
        phase: DuplicateDetectionProgress['Phase'],
        totalRecords: number,
        processedRecords: number,
        matchesFound: number,
        startTime: number,
        currentRecordID?: string
    ): void {
        if (options.OnProgress) {
            options.OnProgress({
                Phase: phase,
                TotalRecords: totalRecords,
                ProcessedRecords: processedRecords,
                MatchesFound: matchesFound,
                CurrentRecordID: currentRecordID,
                ElapsedMs: Date.now() - startTime,
            });
        }
    }
}

// ─────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────

/**
 * Split an array into chunks of a given size.
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
}

/**
 * Run async tasks with a concurrency limit.
 * Executes up to `limit` tasks in parallel, queuing the rest.
 */
async function RunWithConcurrency<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
    const results: T[] = [];
    let index = 0;

    async function runNext(): Promise<void> {
        while (index < tasks.length) {
            const currentIndex = index++;
            results[currentIndex] = await tasks[currentIndex]();
        }
    }

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
    await Promise.all(workers);
    return results;
}
