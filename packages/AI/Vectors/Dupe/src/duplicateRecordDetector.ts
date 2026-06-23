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
} from "@memberjunction/core";
import { BaseResponse, VectorDBBase, VectorDatabaseConfiguration } from "@memberjunction/ai-vectordb";
import { MJGlobal, UUIDsEqual, NormalizeUUID } from "@memberjunction/global";
import {
    MJDuplicateRunDetailEntity,
    MJDuplicateRunDetailMatchEntity,
    MJDuplicateRunEntity,
    MJEntityDocumentEntity,
    MJListEntity,
    KnowledgeHubMetadataEngine,
} from "@memberjunction/core-entities";
import { VectorBase } from "@memberjunction/ai-vectors";
import { EntityDocumentTemplateParser, EntityVectorSyncer, VectorizeEntityParams } from "@memberjunction/ai-vector-sync";
import { TemplateEngineServer } from "@memberjunction/templates";
import type { MJTemplateEntityExtended, MJTemplateContentEntity } from "@memberjunction/core-entities";
import { DuplicateReasoningProvider } from "./reasoning/DuplicateReasoningProvider";
import {
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
    ReasoningCandidate,
    ReasoningFieldDelta,
} from "./reasoning/DuplicateReasoningTypes";
import { MatchedSetDeltaBuilder } from "./reasoning/MatchedSetDeltaBuilder";

/** Default number of nearest neighbors to retrieve per record */
const DEFAULT_TOP_K = 5;

/** Default concurrency limit for parallel vector queries */
const DEFAULT_QUERY_CONCURRENCY = 10;

/** Default batch size for loading records and parallel database saves */
const DEFAULT_BATCH_SIZE = 500;

/**
 * Maximum number of records to embed and query in a single vector similarity sub-batch.
 * Keeps memory and API payload sizes bounded within each outer processing batch.
 */
const VECTOR_QUERY_BATCH_SIZE = 100;

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
 * A matched set's reasoning verdict together with the detector-resolved literal survivor
 * field map. The provider returns the verdict (with per-field {@link DuplicateReasoningFieldChoice}
 * choices addressed by record id); the detector resolves those choices to literal
 * `{FieldName, Value}` entries (ready for {@link RecordMergeRequest.FieldMap}) by reading the
 * chosen record's value out of the matched-set deltas it already loaded for the prompt.
 */
interface SetReasoning {
    Output: DuplicateReasoningOutput;
    /** FieldChoices resolved to literal values; empty when the reasoner proposed none. */
    FieldMap: { FieldName: string; Value: unknown }[];
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
     * Tracks already-seen source↔match pairs across the entire run to suppress inverse duplicates.
     * If A→B is persisted, B→A is skipped. Key format: "smallerID::largerID" for consistent ordering.
     */
    private _seenPairs = new Set<string>();

    /**
     * Run duplicate detection for records identified by ListID, ViewID, ExtraFilter,
     * or all records in the entity (vector-first approach).
     *
     * **Batching strategy:**
     * - Records are loaded as lightweight IDs first, then processed in outer batches of
     *   {@link DEFAULT_BATCH_SIZE} (500) records.
     * - Within each outer batch, embedding and vector similarity queries are further
     *   sub-batched into chunks of {@link VECTOR_QUERY_BATCH_SIZE} (100) records to keep
     *   API payloads and memory bounded.
     * - Vector queries within each sub-batch run with configurable concurrency
     *   (default {@link DEFAULT_QUERY_CONCURRENCY} = 10).
     *
     * **Resume support:**
     * - {@link MJDuplicateRunEntity.ProcessedItemCount} and
     *   {@link MJDuplicateRunEntity.LastProcessedOffset} are persisted after each outer batch.
     * - On restart, processing resumes from {@link MJDuplicateRunEntity.LastProcessedOffset}.
     *
     * **Cancellation:**
     * - {@link MJDuplicateRunEntity.CancellationRequested} is re-loaded from the database
     *   between outer batches. If set to `true`, processing stops and the run can be resumed later.
     *
     * @param params - The detection request specifying entity, document, list/view/filter, and options
     * @param contextUser - The user context for entity operations and security
     * @returns A response containing all potential duplicate results and an overall status
     */
    public async GetDuplicateRecords(params: PotentialDuplicateRequest, contextUser?: UserInfo): Promise<PotentialDuplicateResponse> {
        this.CurrentUser = contextUser;
        this._seenPairs.clear(); // Reset for each new run
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

        // Step 6: Process in batches with resume support
        const batchSize = DEFAULT_BATCH_SIZE;
        const concurrency = this.GetQueryConcurrency(entityDocument);
        const topK = options.TopK ?? DEFAULT_TOP_K;
        const templateParser = EntityDocumentTemplateParser.CreateInstance();
        let totalMatchesFound = 0;

        // Update run with total count for progress tracking
        duplicateRun.TotalItemCount = recordIDs.length;
        duplicateRun.BatchSize = batchSize;
        await this.SaveEntity(duplicateRun);

        // Resume from last processed offset if available
        const resumeOffset = duplicateRun.LastProcessedOffset ?? 0;
        if (resumeOffset > 0) {
            LogStatus(`Duplicate detection: resuming from offset ${resumeOffset}`);
        }

        for (let offset = resumeOffset; offset < recordIDs.length; offset += batchSize) {
            // Check for cancellation between batches
            await duplicateRun.Load(duplicateRun.ID);
            if (duplicateRun.CancellationRequested) {
                LogStatus(`Duplicate detection: cancellation requested at offset ${offset}`);
                duplicateRun.ProcessingStatus = 'In Progress'; // Will be resumed later
                duplicateRun.EndedAt = new Date();
                await this.SaveEntity(duplicateRun);
                response.Status = 'Success'; // Partial success — can be resumed
                return response;
            }

            const batchIDs = recordIDs.slice(offset, offset + batchSize);
            const batchResults = await this.ProcessBatch(
                batchIDs, entityInfo, entityDocument, templateParser, duplicateRun.ID,
                topK, concurrency, options, startTime, recordIDs.length, offset, totalMatchesFound, contextUser
            );
            response.PotentialDuplicateResult.push(...batchResults.Results);
            totalMatchesFound += batchResults.MatchesFound;

            // Update cursor for resume support
            duplicateRun.ProcessedItemCount = offset + batchIDs.length;
            duplicateRun.LastProcessedOffset = offset + batchSize;
            await this.SaveEntity(duplicateRun);
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
        await this.ProcessAutoMerges(response, entityDocument, options);

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

        if (queryResults.length === 0) {
            return new PotentialDuplicateResult();
        }

        // Annotate the (non-persisted) single-record result with LLM reasoning when the entity
        // has it enabled and the set clears the gate — same gate as the batch path. There are no
        // match rows to stamp run ids onto here; the verdict rides on the returned result so a
        // real-time "is this a duplicate?" caller gets recommendation + resolved field map too.
        const single = queryResults[0];
        const reasoning = await this.RunReasoningForSet(single, entityInfo, entityDocument, ContextUser);
        if (reasoning) {
            this.applyReasoningToResult(single.Duplicates, reasoning.Output, reasoning.FieldMap);
        }
        return single.Duplicates;
    }

    // ─────────────────────────────────────────────
    // Batch Processing
    // ─────────────────────────────────────────────

    /**
     * Process a single outer batch of record IDs through the full duplicate detection pipeline.
     *
     * Steps:
     * 1. Load full record data for template rendering
     * 2. Build source metadata for rich UI display
     * 3. Create DuplicateRunDetail records
     * 4. Sub-batch records into chunks of {@link VECTOR_QUERY_BATCH_SIZE} (default 100)
     *    for embedding + vector similarity querying, keeping memory and API payloads bounded
     * 5. Persist match results and update run details
     *
     * @param batchIDs - Primary key values for records in this batch
     * @param entityInfo - Entity metadata
     * @param entityDocument - The entity document driving vectorization
     * @param templateParser - Reusable template parser instance
     * @param duplicateRunID - ID of the parent DuplicateRun record
     * @param topK - Number of nearest neighbors to retrieve per record
     * @param concurrency - Max parallel vector queries within each sub-batch
     * @param options - Detection options (thresholds, callbacks, etc.)
     * @param startTime - Epoch ms for elapsed-time progress reporting
     * @param totalRecords - Total records across all batches (for progress reporting)
     * @param processedSoFar - Records processed before this batch (for progress reporting)
     * @param matchesSoFar - Matches found before this batch (for progress reporting)
     * @param contextUser - The user context for entity operations
     * @returns Combined results and match count for this batch
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

        // 6b: Build source record metadata map for rich UI display
        const sourceMetadataMap = this.buildSourceMetadataMap(records, entityInfo);

        // 6c: Create DuplicateRunDetail records for this batch
        const duplicateRunDetails = await this.CreateRunDetailRecords(batchIDs, duplicateRunID, entityInfo, sourceMetadataMap);

        // 6d: Sub-batch embedding + vector queries in chunks of VECTOR_QUERY_BATCH_SIZE
        //     to keep API payload sizes and memory bounded
        const allQueryResults: RecordQueryResult[] = [];
        const subBatches = chunkArray(records, VECTOR_QUERY_BATCH_SIZE);

        for (let i = 0; i < subBatches.length; i++) {
            const subRecords = subBatches[i];

            // Embed this sub-batch
            this.reportProgress(options, 'Embedding', totalRecords, processedSoFar, matchesSoFar, startTime);
            const subTemplateTexts = await this.GenerateTemplateTexts(templateParser, entityDocument, subRecords, contextUser);
            const subEmbedResult = await this.embedding.EmbedTexts({ texts: subTemplateTexts, model: null });

            // Query vector DB for each record in the sub-batch with concurrency control
            this.reportProgress(options, 'Querying', totalRecords, processedSoFar, matchesSoFar, startTime);
            const subQueryResults = await this.QueryDuplicatesForRecords(
                subRecords, subEmbedResult.vectors, subTemplateTexts, entityDocument, topK, options, concurrency
            );
            allQueryResults.push(...subQueryResults);
        }

        // 6d.5: Drop matches that point to records which no longer exist in the source
        //       entity (stale "ghost" vectors left behind when records are deleted or
        //       re-seeded with new IDs). See FilterNonExistentMatches() for the why.
        await this.FilterNonExistentMatches(allQueryResults, entityInfo);

        // 6e: Persist match results and update run details
        this.reportProgress(options, 'Matching', totalRecords, processedSoFar + records.length, matchesSoFar, startTime);
        const results = await this.PersistMatchResults(
            allQueryResults, duplicateRunDetails, entityInfo, entityDocument, options, startTime, contextUser
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
    /**
     * Validates that an entity document exists and is usable. Uses the
     * KnowledgeHubMetadataEngine cache for instant lookups without database queries.
     */
    protected async ValidateEntityDocument(entityDocumentID: string): Promise<MJEntityDocumentEntity | null> {
        // Ensure KH engine is initialized (no-op if already loaded)
        await KnowledgeHubMetadataEngine.Instance.Config(false, this.CurrentUser);
        const doc = KnowledgeHubMetadataEngine.Instance.GetEntityDocumentById(entityDocumentID);
        return doc ?? null;
    }

    /**
     * Initializes embedding model, vector DB, and index name providers.
     * Called once per detection run rather than per-record. Uses AIEngine
     * and KnowledgeHubMetadataEngine caches to avoid redundant database queries.
     */
    protected async InitializeProviders(entityDocument: MJEntityDocumentEntity): Promise<void> {
        // Skip re-initialization if providers are already set for this entity document
        if (this.embedding && this.vectorDB && this.indexName) {
            return;
        }

        const aiModel = this.GetAIModel(entityDocument.AIModelID);
        const vectorDB = this.GetVectorDatabase(entityDocument.VectorDatabaseID);

        // Resolve API keys. Empty/null is legitimate for local providers — local
        // embeddings (ONNX runtime) and the in-process SimpleVectorServiceProvider need
        // no remote credential — so we don't pre-throw on a missing key. Whether the vector
        // DB genuinely needs one is decided AFTER instantiation via VectorDBBase.RequiresAPIKey;
        // a cloud provider that truly needs a key will otherwise fail at the inference call
        // with a more actionable provider-level error. Mirrors EntityVectorSyncer.
        const embeddingAPIKey = GetAIAPIKey(aiModel.DriverClass) || '';
        const vectorDBAPIKey = GetAIAPIKey(vectorDB.ClassKey) || '';

        this.embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
            BaseEmbeddings, aiModel.DriverClass, embeddingAPIKey
        );
        // Sentinel when keyless so the base ctor's non-empty requirement is satisfied for
        // local providers (which authenticate via the host process, not a key).
        this.vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, vectorDB.ClassKey, vectorDBAPIKey || 'colocated'
        );

        if (!this.embedding) {
            throw new Error(`Failed to create Embeddings instance for ${aiModel.DriverClass}`);
        }
        if (!this.vectorDB) {
            throw new Error(`Failed to create VectorDB instance for ${vectorDB.ClassKey}`);
        }
        if (!this.vectorDB.SupportsColocatedQuery && this.vectorDB.RequiresAPIKey && !vectorDBAPIKey) {
            throw new Error(`No API Key found for Vector Database ${vectorDB.ClassKey}`);
        }

        // Resolve the vector index name from the entity document's VectorIndexID
        // Uses KnowledgeHubMetadataEngine cache instead of a RunView query
        if (entityDocument.VectorIndexID) {
            const vectorIndex = KnowledgeHubMetadataEngine.Instance.GetVectorIndexById(entityDocument.VectorIndexID);
            if (vectorIndex) {
                this.indexName = vectorIndex.Name;
            }
        }
        if (!this.indexName) {
            throw new Error(
                `No vector index found for entity document "${entityDocument.Name}" (ID: ${entityDocument.ID}). ` +
                `Ensure VectorIndexID is set on the entity document. You can create and assign a Vector Index ` +
                `in the Knowledge Hub > Vector Indexes section.`
            );
        }

        LogStatus(`Providers initialized: AI Model=${aiModel.DriverClass}, VectorDB=${vectorDB.ClassKey}, Index=${this.indexName}`);
    }

    /**
     * Run vectorization for the entity document's records.
     */
    protected async VectorizeSourceRecords(entityDocument: MJEntityDocumentEntity, contextUser: UserInfo): Promise<void> {
        // Thread this detector's provider (request-scoped on the server) down into the
        // syncer so vectorization rides the same connection instead of the global default
        const vectorizer = new EntityVectorSyncer(this._provider);
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
     *
     * Creates one async task per record, then executes them via {@link RunWithConcurrency}
     * with the specified concurrency limit. Each task embeds and queries a single record
     * against the vector index.
     *
     * Supports hybrid search (vector + keyword) with RRF fusion when the vector DB provider
     * supports it (checked via `SupportsHybridSearch`).
     *
     * Post-query, results are:
     * 1. Parsed from raw vector matches into typed {@link PotentialDuplicate} objects
     * 2. Filtered to remove self-matches (same record as source)
     * 3. Filtered by the potential match threshold (from options or entity document)
     *
     * @param records - The source records to find duplicates for
     * @param vectors - Pre-computed embedding vectors, one per record (same index order)
     * @param templateTexts - Rendered template texts for hybrid keyword search
     * @param entityDocument - The entity document providing thresholds and configuration
     * @param topK - Number of nearest neighbors to retrieve per record
     * @param options - Detection options including threshold overrides
     * @param concurrency - Max parallel vector queries
     * @returns One {@link RecordQueryResult} per input record
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
            const potentialThreshold = options.PotentialMatchThreshold ?? entityDocument.PotentialMatchThreshold;
            dupeResult.Duplicates = dupeResult.Duplicates.filter(
                (d) => d.ProbabilityScore >= potentialThreshold
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
            // Capture the full vector metadata for rich UI display
            duplicate.VectorMetadata = { ...match.metadata } as Record<string, string>;
            result.Duplicates.push(duplicate);
        }

        return result;
    }

    /**
     * Filter out self-matches where the candidate is the same record as the source.
     */
    /**
     * Build a map of recordID → JSON metadata string from loaded BaseEntity records.
     * Extracts the entity's name field and a few key display fields for rich UI rendering.
     */
    protected buildSourceMetadataMap(records: BaseEntity[], entityInfo: EntityInfo): Map<string, string> {
        const metadataMap = new Map<string, string>();

        // Combine all IsNameField fields in Sequence order for the display name
        const nameFields = entityInfo.Fields
            .filter(f => f.IsNameField)
            .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));

        // Fall back to singular NameField if no IsNameField flags
        if (nameFields.length === 0 && entityInfo.NameField) {
            nameFields.push(entityInfo.NameField);
        }

        // Use DefaultInView fields for display, plus IsNameField fields
        const internalNames = new Set(['ID', '__mj_CreatedAt', '__mj_UpdatedAt']);
        const displayFields = entityInfo.Fields
            .filter(f => f.DefaultInView && !f.IsPrimaryKey && !internalNames.has(f.Name))
            .sort((a, b) => (a.Sequence ?? 9999) - (b.Sequence ?? 9999));

        for (const record of records) {
            const pk = record.PrimaryKey;
            const id = pk.KeyValuePairs.length === 1 ? String(pk.KeyValuePairs[0].Value) : pk.Values();
            const meta: Record<string, string> = {
                Entity: entityInfo.Name,
            };
            if (entityInfo.Icon) {
                meta['EntityIcon'] = entityInfo.Icon;
            }

            // Store combined name from all IsNameField fields
            const nameParts = nameFields
                .map(f => record.Get(f.Name))
                .filter(v => v != null && String(v).trim() !== '')
                .map(v => String(v));
            if (nameParts.length > 0) {
                meta['Name'] = nameParts.join(' ');
            }

            // Store all IsNameField values individually for downstream resolution
            for (const nf of nameFields) {
                const val = record.Get(nf.Name);
                if (val != null) meta[nf.Name] = String(val);
            }

            // Store DefaultInView fields for rich display
            for (const field of displayFields) {
                if (!meta[field.Name]) { // Don't overwrite name fields
                    const val = record.Get(field.Name);
                    if (val != null) {
                        const str = String(val);
                        meta[field.Name] = str.length > 200 ? str.substring(0, 197) + '...' : str;
                    }
                }
            }

            metadataMap.set(id, JSON.stringify(meta));
        }
        return metadataMap;
    }

    protected FilterSelfMatches(duplicates: PotentialDuplicate[], sourceKey: CompositeKey): PotentialDuplicate[] {
        // Use CompositeKey.Equals (case-insensitive for UUID values) rather than a raw
        // ToString() string comparison. The vector metadata RecordID and the loaded
        // record's PrimaryKey can differ in UUID casing across platforms (SQL Server
        // uppercase vs. PostgreSQL lowercase), which would let a true self-match slip
        // past a case-sensitive string compare.
        return duplicates.filter((d) => !d.Equals(sourceKey));
    }

    /**
     * Remove matches whose target record no longer exists in the source entity.
     *
     * Vector indexes (e.g. Pinecone) retain embeddings keyed by each record's composite
     * key via a deterministic vector ID. When records are deleted — or re-seeded with new
     * primary keys — their old vectors linger as "ghosts". A nearest-neighbour query then
     * happily returns those ghosts, often the record's OWN former vector (identical name,
     * ~0.98 score), which to a user looks exactly like a record matching itself. The
     * per-record self-match filter can't catch these because the ghost carries the OLD id.
     *
     * We verify every distinct match key for the batch against the live table in a single
     * batched query and drop any that don't resolve. Single-column primary keys only — the
     * same assumption the rest of this engine makes.
     *
     * Mutates `queryResults` in place.
     */
    protected async FilterNonExistentMatches(queryResults: RecordQueryResult[], entityInfo: EntityInfo): Promise<void> {
        const pkField = entityInfo.FirstPrimaryKey.Name;

        // Collect every distinct match key value across the batch.
        const matchIds = new Set<string>();
        for (const qr of queryResults) {
            for (const dupe of qr.Duplicates.Duplicates) {
                const id = dupe.Values();
                if (id) {
                    matchIds.add(id);
                }
            }
        }
        if (matchIds.size === 0) {
            return;
        }

        const existing = await this.LoadExistingRecordIDs(entityInfo, pkField, [...matchIds]);

        // Drop ghost (non-existent) matches in place.
        for (const qr of queryResults) {
            const before = qr.Duplicates.Duplicates.length;
            qr.Duplicates.Duplicates = qr.Duplicates.Duplicates.filter(
                (d) => existing.has(NormalizeUUID(d.Values()))
            );
            const removed = before - qr.Duplicates.Duplicates.length;
            if (removed > 0) {
                LogStatus(`Duplicate detection: dropped ${removed} stale match(es) for source ${qr.SourceKey.ToString()} (records no longer exist — likely orphaned vectors)`);
            }
        }
    }

    /**
     * Return the set of primary key values (normalized for case-insensitive UUID
     * comparison) that actually exist in the entity, for the given candidate IDs.
     * Batches the IN-list to stay within reasonable query sizes.
     */
    protected async LoadExistingRecordIDs(entityInfo: EntityInfo, pkField: string, ids: string[]): Promise<Set<string>> {
        const existing = new Set<string>();
        for (const chunk of chunkArray(ids, DEFAULT_BATCH_SIZE)) {
            const inList = chunk.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',');
            const rv = await this.RunView.RunView<Record<string, string>>({
                EntityName: entityInfo.Name,
                ExtraFilter: `${pkField} IN (${inList})`,
                Fields: [pkField],
                ResultType: 'simple',
            }, this.CurrentUser);

            if (rv.Success) {
                for (const r of rv.Results) {
                    existing.add(NormalizeUUID(String(r[pkField])));
                }
            } else {
                // Fail open: if we can't verify existence, don't silently delete every match.
                LogError(`FilterNonExistentMatches: failed to verify record existence for ${entityInfo.Name}: ${rv.ErrorMessage}`);
                for (const id of chunk) {
                    existing.add(NormalizeUUID(id));
                }
            }
        }
        return existing;
    }

    // ─────────────────────────────────────────────
    // Run Detail & Match Persistence (Batched)
    // ─────────────────────────────────────────────

    /**
     * Create DuplicateRunDetail records for a batch of record IDs.
     */
    protected async CreateRunDetailRecords(
        recordIDs: string[],
        duplicateRunID: string,
        entityInfo: EntityInfo,
        metadataMap?: Map<string, string>
    ): Promise<MJDuplicateRunDetailEntity[]> {
        const results: MJDuplicateRunDetailEntity[] = [];
        const pkFieldName = entityInfo.FirstPrimaryKey.Name;

        for (const batch of chunkArray(recordIDs, SAVE_BATCH_SIZE)) {
            const batchResults = await Promise.all(
                batch.map(async (recordID) => {
                    const runDetail = await this.Metadata.GetEntityObject<MJDuplicateRunDetailEntity>('MJ: Duplicate Run Details', this.CurrentUser);
                    runDetail.NewRecord();
                    runDetail.DuplicateRunID = duplicateRunID;
                    // Store RecordID in standard MJ URL segment format (e.g., "ID|uuid")
                    runDetail.RecordID = `${pkFieldName}|${recordID}`;
                    runDetail.MatchStatus = 'Pending';
                    runDetail.MergeStatus = 'Pending';
                    runDetail.RecordMetadata = metadataMap?.get(recordID) ?? null;
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
     *
     * When LLM reasoning is enabled on the entity document AND a matched set clears the
     * reasoning gate (top vector score >= ReasoningThreshold), reasoning runs ONCE for the
     * whole set; the verdict is written onto every match row's LLM* columns and carried on
     * the result for the auto-merge step. When reasoning is disabled the loop is unchanged.
     */
    protected async PersistMatchResults(
        queryResults: RecordQueryResult[],
        duplicateRunDetails: MJDuplicateRunDetailEntity[],
        entityInfo: EntityInfo,
        entityDocument: MJEntityDocumentEntity,
        options: DuplicateDetectionOptions,
        startTime: number,
        contextUser?: UserInfo
    ): Promise<PotentialDuplicateResult[]> {
        const results: PotentialDuplicateResult[] = [];
        let matchesFound = 0;

        for (const qr of queryResults) {
            this.suppressInverseDuplicates(qr);

            results.push(qr.Duplicates);
            matchesFound += qr.Duplicates.Duplicates.length;

            // Reasoning gate: runs once per set, only when enabled + above threshold.
            // Returns undefined (and is byte-for-byte inert) when reasoning is disabled.
            const reasoning = await this.RunReasoningForSet(qr, entityInfo, entityDocument, contextUser);
            if (reasoning) {
                this.applyReasoningToResult(qr.Duplicates, reasoning.Output, reasoning.FieldMap);
            }

            await this.persistDetailMatches(qr, duplicateRunDetails, reasoning?.Output);

            this.reportProgress(options, 'Matching', queryResults.length, results.length, matchesFound, startTime);
        }

        return results;
    }

    /**
     * Drop inverse duplicates in place: if A→B was already persisted this run, skip B→A.
     */
    protected suppressInverseDuplicates(qr: RecordQueryResult): void {
        const sourceId = qr.SourceKey.Values();
        qr.Duplicates.Duplicates = qr.Duplicates.Duplicates.filter(dupe => {
            const matchId = dupe.Values();
            const pairKey = sourceId < matchId ? `${sourceId}::${matchId}` : `${matchId}::${sourceId}`;
            if (this._seenPairs.has(pairKey)) {
                return false; // Inverse already recorded
            }
            this._seenPairs.add(pairKey);
            return true;
        });
    }

    /**
     * Locate the matching run-detail row, create the per-candidate match records (carrying
     * the set's LLM verdict when present), mark the detail complete, and stamp the created
     * match-record IDs back onto the result (kept in lockstep with Duplicates for auto-merge).
     */
    protected async persistDetailMatches(
        qr: RecordQueryResult,
        duplicateRunDetails: MJDuplicateRunDetailEntity[],
        reasoning?: DuplicateReasoningOutput
    ): Promise<void> {
        const sourceKey = qr.SourceKey;
        const detail = duplicateRunDetails.find((d) => {
            const detailKey = new CompositeKey();
            detailKey.LoadFromConcatenatedString(d.RecordID);
            return detailKey.Equals(sourceKey);
        });

        if (!detail) {
            LogError(`No Duplicate Run Detail found for ${qr.SourceKey.ToString()}`);
            return;
        }

        const matchRecords = await this.CreateMatchRecordsForDetail(detail.ID, qr.Duplicates, reasoning);
        qr.Duplicates.DuplicateRunDetailMatchRecordIDs = matchRecords.map((m) => m.ID);
        detail.MatchStatus = 'Complete';
        const success = await this.SaveEntity(detail);
        if (!success) {
            LogError(`Failed to update Duplicate Run Detail record ${detail.ID}`);
        }
    }

    /**
     * Create match records for a single run detail, saving in parallel batches.
     *
     * When a per-set {@link DuplicateReasoningOutput} is supplied, its set-level verdict
     * (recommendation / confidence / reasoning / proposed survivor / proposed field map)
     * and run id are written onto every match row in the set.
     */
    protected async CreateMatchRecordsForDetail(
        duplicateRunDetailID: string,
        duplicateResult: PotentialDuplicateResult,
        reasoning?: DuplicateReasoningOutput
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
                    match.MatchRecordID = dupe.ToURLSegment();
                    match.MatchProbability = dupe.ProbabilityScore;
                    match.MatchedAt = new Date();
                    match.Action = '';
                    match.ApprovalStatus = 'Pending';
                    match.MergeStatus = 'Pending';
                    match.RecordMetadata = dupe.VectorMetadata ? JSON.stringify(dupe.VectorMetadata) : null;
                    if (reasoning && reasoning.Success) {
                        this.applyReasoningToMatch(match, reasoning);
                    }
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

    /**
     * Write the set-level LLM verdict + run id onto a single match row's generated columns.
     */
    protected applyReasoningToMatch(
        match: MJDuplicateRunDetailMatchEntity,
        reasoning: DuplicateReasoningOutput
    ): void {
        match.LLMRecommendation = reasoning.Recommendation;
        match.LLMConfidence = reasoning.Confidence;
        match.LLMReasoning = reasoning.Reasoning || null;
        match.LLMProposedSurvivorRecordID = reasoning.SurvivorRecordID;
        match.LLMProposedFieldMap = reasoning.FieldChoices.length > 0
            ? JSON.stringify(reasoning.FieldChoices)
            : null;
        match.AIPromptRunID = reasoning.AIPromptRunID ?? null;
        match.AIAgentRunID = reasoning.AIAgentRunID ?? null;
    }

    // ─────────────────────────────────────────────
    // LLM Reasoning (gated, per matched set)
    // ─────────────────────────────────────────────

    /**
     * Run LLM reasoning for one source record's matched set, ONCE, only when:
     *   1. the entity document has EnableLLMReasoning = true, AND
     *   2. the set is non-empty, AND
     *   3. the set's top MatchProbability >= the (non-null) ReasoningThreshold.
     *
     * Returns `undefined` in every other case — including when reasoning is disabled — so
     * the surrounding persist/merge path stays byte-for-byte identical to the vector-only
     * behavior. A failed reasoning call returns an output with Success = false (never throws),
     * so one bad set never aborts the run.
     */
    protected async RunReasoningForSet(
        qr: RecordQueryResult,
        entityInfo: EntityInfo,
        entityDocument: MJEntityDocumentEntity,
        contextUser?: UserInfo
    ): Promise<SetReasoning | undefined> {
        if (!this.IsReasoningGateOpen(qr, entityDocument)) {
            return undefined;
        }

        const provider = this.ResolveReasoningProvider(entityDocument);
        if (!provider) {
            return undefined;
        }

        const input = await this.BuildReasoningInput(qr, entityInfo, entityDocument, contextUser);
        const output = await provider.Reason(input, { Provider: this._provider, ContextUser: contextUser });
        if (!output.Success) {
            LogError(`Reasoning failed for set ${qr.SourceKey.ToString()}: ${output.ErrorMessage ?? 'unknown error'}`);
            return { Output: output, FieldMap: [] };
        }
        // Resolve the reasoner's per-field choices to literal survivor values now, while the
        // matched-set deltas (loaded for the prompt) are in hand.
        const fieldMap = this.resolveReasoningFieldMap(output, input.FieldDeltas);
        return { Output: output, FieldMap: fieldMap };
    }

    /**
     * Resolve the reasoner's per-field survivor choices ({FieldName, SourceRecordID}) into
     * literal `{FieldName, Value}` entries for {@link RecordMergeRequest.FieldMap}, by reading
     * the chosen record's value out of the matched-set deltas. Choices whose field or record
     * can't be located in the deltas are skipped (the survivor's existing value then stands),
     * so a partial/garbled choice can never inject an undefined override into the merge.
     */
    protected resolveReasoningFieldMap(
        output: DuplicateReasoningOutput,
        fieldDeltas: ReasoningFieldDelta[]
    ): { FieldName: string; Value: unknown }[] {
        const resolved: { FieldName: string; Value: unknown }[] = [];
        for (const choice of output.FieldChoices ?? []) {
            const delta = fieldDeltas.find(d => d.FieldName === choice.FieldName);
            const cell = delta?.Values.find(v => this.recordIdMatches(v.RecordID, choice.SourceRecordID));
            if (cell) {
                resolved.push({ FieldName: choice.FieldName, Value: cell.Value });
            }
        }
        return resolved;
    }

    /** Case-insensitive, trimmed equality of two record-id (URL-segment) strings. */
    protected recordIdMatches(a: string, b: string): boolean {
        return a.trim().toLowerCase() === b.trim().toLowerCase();
    }

    /**
     * Gate predicate: reasoning enabled + non-empty set + top score clears the threshold.
     * A null ReasoningThreshold means "no gate" — reasoning runs for any non-empty set.
     */
    protected IsReasoningGateOpen(qr: RecordQueryResult, entityDocument: MJEntityDocumentEntity): boolean {
        if (!entityDocument.EnableLLMReasoning) {
            return false;
        }
        const dupes = qr.Duplicates.Duplicates;
        if (dupes.length === 0) {
            return false;
        }
        const threshold = entityDocument.ReasoningThreshold;
        if (threshold == null) {
            return true;
        }
        const topScore = Math.max(...dupes.map(d => d.ProbabilityScore));
        return topScore >= threshold;
    }

    /**
     * Resolve the reasoning provider for this entity document's ReasoningMode via the
     * ClassFactory. Returns null when ClassFactory falls back to the abstract base (no
     * implementation registered for the mode) so the caller can skip gracefully.
     */
    protected ResolveReasoningProvider(entityDocument: MJEntityDocumentEntity): DuplicateReasoningProvider | null {
        const provider = MJGlobal.Instance.ClassFactory.CreateInstance<DuplicateReasoningProvider>(
            DuplicateReasoningProvider, entityDocument.ReasoningMode
        );
        // A bare abstract-base instance means no concrete provider was registered for the
        // mode (CreateInstance falls back to the base class). Its Reason() is abstract, so
        // treat it as "no provider" rather than calling and throwing.
        if (!provider || provider.constructor === DuplicateReasoningProvider) {
            LogError(`No DuplicateReasoningProvider registered for ReasoningMode '${entityDocument.ReasoningMode}'`);
            return null;
        }
        return provider;
    }

    /**
     * Assemble the reasoning input for a matched set: source description, candidate
     * descriptions, and the differing-field deltas loaded for the whole set.
     */
    protected async BuildReasoningInput(
        qr: RecordQueryResult,
        entityInfo: EntityInfo,
        entityDocument: MJEntityDocumentEntity,
        contextUser?: UserInfo
    ): Promise<DuplicateReasoningInput> {
        const candidates: ReasoningCandidate[] = qr.Duplicates.Duplicates.map(d => ({
            RecordID: d.Values(),
            Label: this.reasoningLabel(d.VectorMetadata) ?? d.Values(),
            VectorScore: d.ProbabilityScore,
            Provenance: 'Local',
            DependentCount: entityInfo.RelatedEntities.length,
        }));

        const deltaBuilder = new MatchedSetDeltaBuilder(this.RunView);
        const allKeys = [qr.SourceKey, ...qr.Duplicates.Duplicates];
        const fieldDeltas = await deltaBuilder.Build(entityInfo, allKeys, contextUser);

        return {
            EntityName: entityInfo.Name,
            EntityDescription: entityInfo.Description ?? null,
            EntityDocument: entityDocument,
            SourceRecord: {
                RecordID: qr.SourceKey.Values(),
                Label: qr.SourceKey.Values(),
                Provenance: 'Local',
                DependentCount: entityInfo.RelatedEntities.length,
            },
            Candidates: candidates,
            FieldDeltas: fieldDeltas,
        };
    }

    /** Extract a display label from a candidate's vector metadata snapshot, if present. */
    protected reasoningLabel(metadata?: Record<string, string>): string | null {
        if (metadata && typeof metadata['Name'] === 'string' && metadata['Name'].trim().length > 0) {
            return metadata['Name'];
        }
        return null;
    }

    /**
     * Carry the set-level verdict + resolved survivor field map onto the result so the
     * auto-merge step (AutoMergeAboveAbsolute) can consult the recommendation and apply the
     * literal {FieldName, Value} overrides via {@link RecordMergeRequest.FieldMap}. The UI
     * still reads the persisted per-row {@link MJDuplicateRunDetailMatchEntity.LLMProposedFieldMap}
     * (the raw choices) and lets the reviewer override before a manual merge.
     */
    protected applyReasoningToResult(
        result: PotentialDuplicateResult,
        output: DuplicateReasoningOutput,
        fieldMap: { FieldName: string; Value: unknown }[]
    ): void {
        if (!output.Success) {
            return;
        }
        result.ReasoningRecommendation = output.Recommendation;
        result.ReasoningFieldMap = fieldMap.length > 0 ? fieldMap : undefined;
    }

    // ─────────────────────────────────────────────
    // Auto-Merge
    // ─────────────────────────────────────────────

    /**
     * Automatically merge records that meet the absolute match threshold.
     */
    protected async ProcessAutoMerges(
        response: PotentialDuplicateResponse,
        entityDocument: MJEntityDocumentEntity,
        options: DuplicateDetectionOptions = {}
    ): Promise<void> {
        // Respect the entity's merge policy. MergeRecords() throws when an entity has
        // AllowRecordMerge = false, so attempting auto-merge on such an entity would not
        // just fail to merge — it would abort the whole detection run. For these entities
        // the matches are still persisted for manual review; we simply skip auto-merge.
        const entityInfo = this.Metadata.EntityByName(entityDocument.Entity);
        if (entityInfo && !entityInfo.AllowRecordMerge) {
            LogStatus(`Auto-merge skipped for "${entityDocument.Entity}": entity does not allow record merging — matches recorded for manual review only.`);
            return;
        }

        const absoluteThreshold = options.AbsoluteMatchThreshold ?? entityDocument.AbsoluteMatchThreshold;
        for (const dupeResult of response.PotentialDuplicateResult) {
            for (const [index, dupe] of dupeResult.Duplicates.entries()) {
                if (!this.IsAutoMergeEligible(dupe, dupeResult, entityDocument, absoluteThreshold)) {
                    continue;
                }
                await this.executeAutoMerge(dupe, dupeResult, entityDocument, index);
            }
        }
    }

    /**
     * Decide whether a single candidate is eligible for automatic merge.
     *
     * Back-compat path (EnableLLMReasoning = false): eligible iff the vector score meets the
     * absolute threshold — byte-for-byte the original behavior. `AutomationLevel` is ignored.
     *
     * Reasoning path (EnableLLMReasoning = true): `AutomationLevel` governs.
     *   - ReviewAll / LLMGated → never auto-merge (everything goes to human review).
     *   - AutoMergeAboveAbsolute → at/above the absolute threshold AND the set's LLM
     *     recommendation is 'Merge'.
     */
    protected IsAutoMergeEligible(
        dupe: PotentialDuplicate,
        dupeResult: PotentialDuplicateResult,
        entityDocument: MJEntityDocumentEntity,
        absoluteThreshold: number
    ): boolean {
        const aboveAbsolute = dupe.ProbabilityScore >= absoluteThreshold;
        if (!entityDocument.EnableLLMReasoning) {
            return aboveAbsolute;
        }
        if (entityDocument.AutomationLevel !== 'AutoMergeAboveAbsolute') {
            return false;
        }
        return aboveAbsolute && dupeResult.ReasoningRecommendation === 'Merge';
    }

    /**
     * Execute one guarded auto-merge for an eligible candidate, applying the LLM's resolved
     * field map when present, and stamp the match record on success.
     */
    protected async executeAutoMerge(
        dupe: PotentialDuplicate,
        dupeResult: PotentialDuplicateResult,
        entityDocument: MJEntityDocumentEntity,
        index: number
    ): Promise<void> {
        const mergeParams = new RecordMergeRequest();
        mergeParams.EntityName = entityDocument.Entity;
        mergeParams.SurvivingRecordCompositeKey = dupeResult.RecordCompositeKey;
        mergeParams.RecordsToMerge = [dupe];
        if (dupeResult.ReasoningFieldMap && dupeResult.ReasoningFieldMap.length > 0) {
            mergeParams.FieldMap = dupeResult.ReasoningFieldMap;
        }

        // Guard each merge so a single failure (e.g. a permission or FK issue on
        // one pair) is logged and skipped rather than aborting the entire run.
        try {
            const mergeResult = await this.Metadata.MergeRecords(mergeParams, this.CurrentUser);
            if (mergeResult.Success) {
                await this.updateMatchRecordAfterMerge(dupeResult.DuplicateRunDetailMatchRecordIDs[index]);
            } else {
                LogError(`Failed to merge ${dupeResult.RecordCompositeKey.ToString()} and ${dupe.ToString()}: ${mergeResult.OverallStatus ?? 'unknown error'}`);
            }
        } catch (err) {
            LogError(`Auto-merge threw for ${dupeResult.RecordCompositeKey.ToString()} and ${dupe.ToString()}`, undefined, err);
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
