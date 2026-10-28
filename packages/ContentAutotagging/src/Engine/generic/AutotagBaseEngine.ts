import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, IRunViewProvider, DatabaseProviderBase, Metadata, RunView, UserInfo, LogError, LogStatus, EntityInfo } from '@memberjunction/core'
import { UUIDsEqual, NormalizeUUID, RegisterClass, uuidv4 } from '@memberjunction/global'
import {
    MJContentSourceEntity, MJContentItemEntity, MJContentFileTypeEntity,
    MJContentProcessRunEntity, MJContentTypeEntity, MJContentSourceTypeEntity,
    MJContentTypeAttributeEntity, MJContentSourceParamEntity, MJContentItemTagEntity,
    MJContentItemAttributeEntity, MJContentSourceTypeParamEntity,
    MJContentProcessRunEntity_IContentProcessRunConfiguration,
    MJContentItemDuplicateEntity,
    MJEntityRecordDocumentEntity, MJContentItemChunkEntity
} from '@memberjunction/core-entities'
import {
    ContentVectorMetadataBuilder,
    ResolveContentVectorID,
    ResolveContentVectorStorageConfig,
    type ChunkTextStorage,
    type ResolvedVectorStorageConfig,
} from './ContentVectorMetadata'
import {
    BuildProviderDirectives,
    ContentVectorInfrastructure,
    EnsureContentMetadataCached,
    LoadContentItemTags,
    UpsertVectorRecords,
    type ResolvedVectorInfrastructure,
} from './ContentVectorInfrastructure'
import {
    BuildAttributePrompt,
    BuildContentAutotagPromptData,
    GetContentAutotagPrompt,
    NormalizeAutotagKeywords,
    ResolveItemClassificationContext,
    RunContentAutotagPrompt,
} from './ContentAutotagPrompt'
import { ContentSourceParams, ContentSourceTypeParams, ContentSourceTypeParamValue } from './content.types'
import { RateLimiter } from './RateLimiter'
import pdfParse from 'pdf-parse'
import officeparser from 'officeparser'
import * as fs from 'fs'
import { ProcessRunParams, JsonObject, ContentItemProcessParams } from './process.types'
import { toZonedTime } from 'date-fns-tz'
import { HttpGet } from '@memberjunction/network-utils'
import * as cheerio from 'cheerio'
import crypto from 'crypto'
import { AIEngine } from '@memberjunction/aiengine'
import { AIEmbeddingRunner } from '@memberjunction/ai-prompts'
import type { EmbeddingRunResult } from '@memberjunction/ai-prompts'
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus'
import { TextChunker, ChunkTextParams } from '@memberjunction/ai-vectors'
import {
    FIXED_WINDOW_SEGMENTER_KEY,
    FixedWindowSegmentationOptions,
    ResolveSegmenter,
} from '@memberjunction/ai-segmentation'
import { VectorRecord, BaseResponse } from '@memberjunction/ai-vectordb'
import { ContentItemTagBridge, TagEngine } from '@memberjunction/tag-engine'
import { TagEngineBase } from '@memberjunction/tag-engine-base'
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities'

// The vector-storage types, the storage-config cascade and the metadata builder live in
// ContentVectorMetadata; infrastructure resolution, directives, upsert and tag loading in
// ContentVectorInfrastructure; the tagging prompt in ContentAutotagPrompt. All are shared with the
// content pipeline and re-exported from this package's root.

/**
 * One embedding unit produced from a ContentItem: a slice of its text plus the id minted for the
 * chunk up front. `chunkID` becomes BOTH the ContentItemChunk row's PK and its vector-DB id (under
 * the 'recordId' strategy), so it is known at metadata-build time — which lets a chunk vector carry
 * its own identity ({@link buildVectorMetadata}) even though the chunk row is written later.
 */
export interface EmbeddingChunk {
    item: MJContentItemEntity;
    chunkIndex: number;
    text: string;
    chunkID: string;
}

/**
 * A chunk whose vector has been upserted and is ready to be written as a ContentItemChunk row.
 * `chunkID` becomes the row PK; `vectorRecordID` is the id the vector was actually stored under
 * (equal to chunkID under 'recordId', a hash under 'hash').
 */
export interface PersistedChunk {
    chunkIndex: number;
    text: string;
    vectorRecordID: string;
    chunkID: string;
}

/** Running tally for a PurgeDeletedChunks pass. */
export interface ChunkPurgeStats {
    /** Chunks whose vector was removed from the store and row flipped to 'Deleted'. */
    purged: number;
    /** Chunks that could not be purged this run (left 'Pending', retried next run). */
    failed: number;
    /** Chunks with no VectorRecordID — nothing to remove remotely, marked 'Deleted' directly. */
    skipped: number;
}

/** Running tally for an EmbedPendingChunks pass. */
export interface ChunkEmbedStats {
    /** Chunks whose text was embedded, upserted, and row flipped to EmbeddingStatus='Complete'. */
    embedded: number;
    /** Chunks that could not be embedded this run (left 'Pending', retried next run). */
    failed: number;
    /** Chunks with empty/missing text or a missing parent — nothing to embed, left untouched. */
    skipped: number;
}

/**
 * Result of a vectorization operation, including counts and AIPromptRun IDs
 * for linking to ContentProcessRunDetail records.
 */
export interface VectorizeResult {
    /** Number of items successfully vectorized */
    vectorized: number;
    /** Number of items skipped (e.g., empty text) */
    skipped: number;
    /** AIPromptRun IDs created during embedding, for junction table linking */
    promptRunIDs: string[];
}

/** Default batch size for vectorization processing */
const DEFAULT_VECTORIZE_BATCH_SIZE = 20;
/** Default cap on how many soft-deleted chunks a single PurgeDeletedChunks run processes. */
const DEFAULT_PURGE_BATCH_SIZE = 1000;
/** Vector-DB delete sub-batch size — bounds how many records hit a 3rd-party store per call. */
const PURGE_VECTORDB_SUBBATCH = 50;
/** Default cap on how many pending chunks a single EmbedPendingChunks run processes. */
const DEFAULT_CHUNK_EMBED_BATCH_SIZE = 1000;
/** Embed + upsert sub-batch size for pending-chunk embedding — bounds per-call load. */
const CHUNK_EMBED_SUBBATCH = 50;

/**
 * Legacy engine for content autotagging and vectorization.
 *
 * @deprecated Superseded by the Content Pipeline Framework (`@memberjunction/content-pipeline` —
 * `PipelineProcessor` and the `Content Pipeline — *` Record Processes). Shared helpers
 * (`ContentVectorInfrastructure`, `ContentVectorMetadataBuilder`, `ContentAutotagPrompt`, and the
 * `AutotagBase` source drivers implementing `Discover` / `Fetch`) remain active and are used by
 * the pipeline stages.
 */
@RegisterClass(BaseEngine, 'AutotagBaseEngine')
export class AutotagBaseEngine extends BaseEngine<AutotagBaseEngine> {
    public static get Instance(): AutotagBaseEngine {
        return super.getInstance<AutotagBaseEngine>();
    }

    /**
     * Internal LLMResults key under which the AIPromptRun ID that produced the
     * accumulated keyword set is stashed. Used to stamp ContentItemTag.AIPromptRunID
     * for tag→prompt-run lineage. Prefixed with `__` so it never collides with a
     * real LLM-produced field and is excluded by the attribute-save skip set.
     */
    private static readonly AI_PROMPT_RUN_ID_KEY = '__aiPromptRunID';

    // Cached metadata unique to this engine — loaded by BaseEngine.Config()
    private _contentTypeAttributes: MJContentTypeAttributeEntity[] = [];
    private _contentSourceTypeParams: MJContentSourceTypeParamEntity[] = [];

    /** Shortcut to KnowledgeHubMetadataEngine */
    private get khEngine(): KnowledgeHubMetadataEngine { return KnowledgeHubMetadataEngine.Instance; }

    /** All content types — delegated to KnowledgeHubMetadataEngine */
    public get ContentTypes(): MJContentTypeEntity[] { return this.khEngine.ContentTypes; }
    /** All content source types — delegated to KnowledgeHubMetadataEngine */
    public get ContentSourceTypes(): MJContentSourceTypeEntity[] { return this.khEngine.ContentSourceTypes; }
    /** All content file types — delegated to KnowledgeHubMetadataEngine */
    public get ContentFileTypes(): MJContentFileTypeEntity[] { return this.khEngine.ContentFileTypes; }
    /** All content type attributes — delegated to KnowledgeHubMetadataEngine (with local fallback for unit tests) */
    public get ContentTypeAttributes(): MJContentTypeAttributeEntity[] {
        return this._contentTypeAttributes.length > 0 ? this._contentTypeAttributes : this.khEngine.ContentTypeAttributes;
    }
    /** All content source type params, cached at startup */
    public get ContentSourceTypeParams(): MJContentSourceTypeParamEntity[] { return this._contentSourceTypeParams; }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
        // Content Types, Content Source Types, Content File Types, and Content Type Attributes are delegated to
        // KnowledgeHubMetadataEngine (avoid redundant loading). Only cache entities unique to this engine.
        await KnowledgeHubMetadataEngine.Instance.Config(forceRefresh, contextUser, provider);

        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Content Source Type Params',
                PropertyName: '_contentSourceTypeParams',
            },
        ];
        await this.Load(configs, provider, forceRefresh, contextUser);
        return this;
    }

    /**
     * Given a list of content items, extract the text from each and process with LLM for tagging.
     * Items are processed in configurable batches with controlled concurrency within each batch.
     */
    /**
     * Process content items through the LLM tagging pipeline with production-grade
     * batch management: cursor-based resume, pause/cancel support, rate limiting,
     * and circuit breaker. Each batch checkpoints progress so interrupted runs
     * can be resumed from where they left off.
     *
     * @param contentItems - items to process
     * @param contextUser - current user for permissions/audit
     * @param processRun - optional ContentProcessRun entity for checkpoint tracking
     * @param config - optional pipeline configuration for rate limits, thresholds
     * @param onProgress - optional callback for UI progress updates
     */
    public async ExtractTextAndProcessWithLLM(
        contentItems: MJContentItemEntity[] | AsyncIterable<MJContentItemEntity>,
        contextUser: UserInfo,
        processRun?: MJContentProcessRunEntity,
        config?: MJContentProcessRunEntity_IContentProcessRunConfiguration,
        onProgress?: (processed: number, total: number, currentItem?: string) => void
    ): Promise<void> {
        // Accept either a materialized array (backwards-compatible) or an
        // AsyncIterable that yields items as they're discovered. The stream
        // form lets the crawl and LLM phases overlap — items pipeline through
        // as soon as change-detection clears them, instead of waiting for all
        // sources to finish crawling first.
        const isArray = Array.isArray(contentItems);

        if (isArray && (contentItems as MJContentItemEntity[]).length === 0) {
            LogStatus('[Autotag] No content items to process');
            return;
        }

        const batchSize = config?.Pipeline?.BatchSize ?? DEFAULT_VECTORIZE_BATCH_SIZE;
        const errorThreshold = config?.Pipeline?.ErrorThresholdPercent ?? 20;
        const delayMs = config?.Pipeline?.DelayBetweenBatchesMs ?? 0;

        // Resume from cursor if available. For arrays we slice; for streams we
        // drain the first N items as they yield.
        const resumeOffset = processRun?.LastProcessedOffset ?? 0;

        // When the source is an array we know the total upfront. For streams
        // we don't — `totalKnown` becomes null and progress reports use the
        // running processed count as both numerator and denominator until the
        // stream closes (UI sees an indeterminate-progress shape).
        const totalKnown: number | null = isArray ? (contentItems as MJContentItemEntity[]).length : null;

        if (resumeOffset > 0) {
            if (totalKnown != null) {
                const remaining = Math.max(0, totalKnown - resumeOffset);
                LogStatus(`[Autotag] Resuming from offset ${resumeOffset} (${remaining} remaining of ${totalKnown})`);
            } else {
                LogStatus(`[Autotag] Resuming from offset ${resumeOffset} (stream — total unknown)`);
            }
        }

        LogStatus(`[Autotag] Processing items in batches of ${batchSize}${totalKnown != null ? ` (~${totalKnown} expected)` : ' (streaming — total unknown)'}`);

        let totalSuccesses = 0;
        let totalFailures = 0;
        let totalProcessed = resumeOffset;
        let batchNum = 0;
        let firstSourceID: string | null = null;
        let anyItemsProcessed = false;

        // Normalize both forms to a single async iterator so the inner loop
        // has one shape. For arrays, wrap in a generator that yields items.
        const iterator = isArray
            ? (async function*() {
                for (const item of contentItems as MJContentItemEntity[]) yield item;
            })()
            : (contentItems as AsyncIterable<MJContentItemEntity>)[Symbol.asyncIterator]();

        let skipsRemaining = resumeOffset;
        let buffer: MJContentItemEntity[] = [];
        let streamDone = false;

        while (!streamDone || buffer.length > 0) {
            // Fill the buffer to batchSize (or until the stream closes).
            while (buffer.length < batchSize && !streamDone) {
                const { value, done } = await iterator.next();
                if (done) { streamDone = true; break; }
                if (!value) continue;
                if (skipsRemaining > 0) { skipsRemaining--; continue; }
                if (!firstSourceID) firstSourceID = value.ContentSourceID;
                buffer.push(value);
            }

            if (buffer.length === 0) break;

            const batch = buffer;
            buffer = [];
            batchNum++;
            anyItemsProcessed = true;

            // The source's classification config and the type's model / tag limits are read from the
            // KnowledgeHub cache per item; catch a source or type created after it loaded.
            await EnsureContentMetadataCached(batch, contextUser, this.ProviderToUse);

            // Rate limit before each batch of parallel LLM calls.
            await this.LLMRateLimiter.Acquire();

            let batchOk = 0;
            let batchFail = 0;
            const batchPromises = batch.map(async (contentItem) => {
                try {
                    const processingParams = await this.buildProcessingParams(contentItem, contextUser);
                    await this.ProcessContentItemText(processingParams, contextUser);
                    batchOk++;
                } catch (e) {
                    LogError(`[Autotag] Failed to process item ${contentItem.ID}: ${e instanceof Error ? e.message : String(e)}`);
                    batchFail++;
                }
            });
            await Promise.all(batchPromises);

            totalSuccesses += batchOk;
            totalFailures += batchFail;
            totalProcessed += batch.length;

            // For streams we don't know the total — report processed as both
            // values so UIs that compute `processed/total` show 100% (which
            // is at least non-misleading; arrays still get a real total).
            const progressTotal = totalKnown ?? totalProcessed;
            onProgress?.(totalProcessed, progressTotal);
            LogStatus(`[Autotag] Batch ${batchNum}: ${batchOk}/${batch.length} ok (${totalProcessed}${totalKnown != null ? `/${totalKnown}` : ''} total, ${totalFailures} errors)`);

            // Checkpoint: update cursor and check for cancellation.
            if (processRun) {
                const shouldContinue = await this.UpdateBatchCursor(processRun, totalProcessed, totalFailures);
                if (!shouldContinue) {
                    LogStatus(`[Autotag] Pipeline paused/cancelled at offset ${totalProcessed}`);
                    return;
                }
            }

            // Per-batch budget gate — subclasses (e.g., AutotagEntity) inspect
            // their per-source RunBudget instances and can request a pause.
            if (this.OnAfterBatch) {
                try {
                    const verdict = await this.OnAfterBatch(batch, totalProcessed);
                    if (verdict && !verdict.continue) {
                        LogStatus(`[Autotag] Pipeline paused by budget gate: ${verdict.reason ?? 'unspecified'} at offset ${totalProcessed}`);
                        if (processRun) {
                            processRun.ErrorMessage = `Auto-paused: ${verdict.reason ?? 'budget exceeded'}`;
                            processRun.CancellationRequested = true;
                            await processRun.Save();
                        }
                        return;
                    }
                } catch (e) {
                    LogError(`[Autotag] OnAfterBatch hook threw: ${e instanceof Error ? e.message : String(e)}`);
                }
            }

            // Circuit breaker: halt if error rate exceeds threshold.
            if (totalProcessed > 0 && totalFailures > 0) {
                const errorRate = (totalFailures / totalProcessed) * 100;
                if (errorRate > errorThreshold) {
                    LogError(`[Autotag] Circuit breaker triggered: error rate ${errorRate.toFixed(1)}% exceeds threshold ${errorThreshold}%`);
                    if (processRun) {
                        processRun.ErrorMessage = `Auto-paused: error rate ${errorRate.toFixed(1)}% exceeded ${errorThreshold}% threshold`;
                        await this.CompleteBatchedProcessRun(processRun, 'Failed', processRun.ErrorMessage);
                    }
                    return;
                }
            }

            // Optional delay between batches (throttling). Only sleep if there
            // is more work coming — don't add latency to the final flush.
            if (delayMs > 0 && (!streamDone || buffer.length > 0)) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        if (!anyItemsProcessed) {
            LogStatus('[Autotag] No content items were processed (stream produced no items past resume offset)');
            return;
        }

        LogStatus(`[Autotag] LLM tagging complete: ${totalSuccesses} succeeded, ${totalFailures} failed${totalKnown != null ? ` of ${totalKnown}` : ''}`);

        // Post-pipeline hook: recompute tag co-occurrence if TagCoOccurrenceEngine is available
        await this.recomputeCoOccurrenceIfAvailable(contextUser);

        // Only create a legacy process run record if no external run tracking is active.
        // When the pipeline is invoked via RunAutotagPipeline, the resolver creates and
        // manages the ContentProcessRun record — creating another one here would be a duplicate.
        if (!processRun && !this.ExternalRunTrackingActive && firstSourceID) {
            const processRunParams = new ProcessRunParams();
            processRunParams.sourceID = firstSourceID;
            processRunParams.startTime = new Date();
            processRunParams.endTime = new Date();
            processRunParams.numItemsProcessed = totalProcessed - resumeOffset;
            await this.SaveProcessRun(processRunParams, contextUser);
        }
    }

    /**
     * Builds processing parameters for a single content item
     */
    private async buildProcessingParams(contentItem: MJContentItemEntity, contextUser: UserInfo): Promise<ContentItemProcessParams> {
        const processingParams = new ContentItemProcessParams();
        processingParams.text = contentItem.Text;
        processingParams.contentSourceTypeID = contentItem.ContentSourceTypeID;
        processingParams.contentFileTypeID = contentItem.ContentFileTypeID;
        processingParams.contentTypeID = contentItem.ContentTypeID;
        processingParams.contentSourceID = contentItem.ContentSourceID;

        const { modelID, minTags, maxTags } = this.GetContentItemParams(processingParams.contentTypeID);
        processingParams.modelID = modelID;
        processingParams.minTags = minTags;
        processingParams.maxTags = maxTags;
        processingParams.contentItemID = contentItem.ID;

        LogStatus(`[Autotag] Built params for "${contentItem.Name}" — text length: ${processingParams.text?.length ?? 0}, modelID: ${modelID || 'default'}, tags: ${minTags}-${maxTags}`);
        return processingParams;
    }

    /**
     * Process a content item's text with the LLM and save results.
     */
    public async ProcessContentItemText(params: ContentItemProcessParams, contextUser: UserInfo): Promise<void> {
        // A8: Update tagging status to Processing
        await this.updateContentItemTaggingStatus(params.contentItemID, 'Processing', contextUser);

        try {
            const LLMResults: JsonObject = await this.PromptAndRetrieveResultsFromLLM(params, contextUser);
            await this.SaveLLMResults(LLMResults, contextUser);
            // A8: Update tagging status to Complete
            await this.updateContentItemTaggingStatus(params.contentItemID, 'Complete', contextUser);
        } catch (e) {
            await this.updateContentItemTaggingStatus(params.contentItemID, 'Failed', contextUser);
            throw e;
        }
    }

    /** Update embedding status for a batch of content items */
    private async updateEmbeddingStatusBatch(
        items: MJContentItemEntity[],
        status: 'Processing' | 'Complete' | 'Failed',
        contextUser: UserInfo,
        embeddingModelID?: string
    ): Promise<void> {
        for (const item of items) {
            item.EmbeddingStatus = status;
            if (status === 'Complete') {
                item.LastEmbeddedAt = new Date();
                if (embeddingModelID) item.EmbeddingModelID = embeddingModelID;
            }
            // Status updates are best-effort relative to the vectorization itself: the vectors
            // are already (or are about to be) in the vector DB, so a status-save failure on a
            // single row must not abort the rest of the pipeline. We log on both logical failure
            // (Save returns false) and infrastructure failure (Save throws) so the gap is visible.
            try {
                const saved = await item.Save();
                if (!saved) {
                    LogError(`updateEmbeddingStatusBatch: Save returned false for item ${item.ID} (status='${status}'): ${item.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`updateEmbeddingStatusBatch: infrastructure error saving item ${item.ID} (status='${status}'): ${msg}`);
            }
        }
    }

    /** Update a content item's TaggingStatus and LastTaggedAt */
    private async updateContentItemTaggingStatus(
        contentItemID: string,
        status: 'Pending' | 'Processing' | 'Complete' | 'Failed' | 'Skipped',
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const md = this.ProviderToUse;
            const item = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
            await item.Load(contentItemID);
            item.TaggingStatus = status;
            if (status === 'Complete') {
                item.LastTaggedAt = new Date();
            }
            // When tagging STARTS, the item is being (re)processed because its content is new or
            // changed (the provider's checksum comparison already filtered out unchanged items).
            // Reset its embedding state to 'Pending' so the vectorization phase re-embeds it — the
            // tagging and embedding "needs work" signals are otherwise independent, and a changed
            // item that was previously 'Complete' would never get re-embedded.
            if (status === 'Processing') {
                item.EmbeddingStatus = 'Pending';
            }
            await item.Save();
        } catch {
            // Non-critical — don't fail the pipeline for a status update
        }
    }

    /**
     * Optional taxonomy JSON string to inject into the autotagging prompt.
     * Set by the caller (e.g., AutotagEntity) before calling ExtractTextAndProcessWithLLM.
     * When set, the prompt template receives an `existingTaxonomy` variable containing
     * the JSON tree of existing tags so the LLM can prefer existing tags.
     */
    public TaxonomyContext: string | null = null;

    /**
     * When true, skip checksum comparison and reprocess all content items
     * even if their content hasn't changed. Useful when changing embedding models,
     * LLM models, or vector databases.
     */
    public ForceReprocess = false;

    /**
     * When true, suppresses the legacy saveProcessRun() call at the end of
     * ExtractTextAndProcessWithLLM. Set by the action when the resolver is
     * managing the ContentProcessRun record externally.
     */
    public ExternalRunTrackingActive = false;

    /** Rate limiter for LLM (tagging) API calls */
    public LLMRateLimiter = new RateLimiter({ RequestsPerMinute: 60, TokensPerMinute: 100000, Name: 'LLM' });
    /** Rate limiter for embedding API calls */
    public EmbeddingRateLimiter = new RateLimiter({ RequestsPerMinute: 300, TokensPerMinute: 500000, Name: 'Embedding' });
    /** Rate limiter for vector DB API calls */
    public VectorDBRateLimiter = new RateLimiter({ RequestsPerMinute: 200, Name: 'VectorDB' });

    /**
     * Initialize the taxonomy bridge so ALL content source types (RSS, Entity, Website, etc.)
     * automatically create formal Tag + TaggedItem records from LLM-generated ContentItemTags.
     *
     * This sets up:
     * 1. TagEngine with semantic embeddings for tag matching
     * 2. TaxonomyContext for prompt injection (tells LLM about existing tags)
     * 3. OnContentItemTagSaved callback that bridges ContentItemTag → Tag + TaggedItem
     *
     * Call this ONCE before running any providers. The bridge stays active until
     * CleanupTaxonomyBridge() is called.
     */
    public async InitializeTaxonomyBridge(contextUser: UserInfo): Promise<void> {
        try {
            // TagEngine internally ensures AIEngine is loaded before building embeddings.
            await TagEngine.Instance.Config(false, contextUser);
            LogStatus(`[TaxonomyBridge] TagEngine initialized with ${TagEngine.Instance.Tags.length} existing tags`);

            // Inject taxonomy into prompt context as markdown hierarchy
            // Format: "# RootTag\n## ChildTag\n### GrandChild"
            // LLM returns paths like "RootTag / ChildTag / GrandChild" for unambiguous matching
            if (TagEngine.Instance.Tags.length > 0) {
                this.TaxonomyContext = TagEngine.Instance.GetTaxonomyMarkdown();
                LogStatus(`[TaxonomyBridge] Taxonomy context injected as markdown (${TagEngine.Instance.Tags.length} total tags)`);
            }

            // Set up the bridge callback — fires after each ContentItemTag is saved
            this.OnContentItemTagSaved = async (
                contentItemTag: MJContentItemTagEntity,
                parentTagName: string | null,
                ctxUser: UserInfo
            ) => {
                await this.bridgeContentItemTagToTaxonomy(contentItemTag, parentTagName, ctxUser);
            };
            LogStatus(`[TaxonomyBridge] Bridge callback installed`);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[TaxonomyBridge] Initialization failed, taxonomy features disabled: ${msg}`);
        }
    }

    /**
     * Clean up the taxonomy bridge after all providers have finished.
     */
    public CleanupTaxonomyBridge(): void {
        this.TaxonomyContext = null;
        this.OnContentItemTagSaved = null;
    }

    /**
     * Bridge a ContentItemTag to the formal MJ Tag taxonomy.
     *
     * Delegates to {@link ContentItemTagBridge} in the tag engine, which the content pipeline's Tag
     * stage calls too — one set of governance rules for both.
     */
    private async bridgeContentItemTagToTaxonomy(
        contentItemTag: MJContentItemTagEntity,
        parentTagName: string | null,
        contextUser: UserInfo
    ): Promise<void> {
        await new ContentItemTagBridge(this.ProviderToUse).Bridge(contentItemTag, parentTagName, contextUser);
    }

    /** Template data for the autotagging prompt, for one chunk of an item. */
    private buildPromptData(
        params: ContentItemProcessParams,
        chunk: string,
        previousResults: JsonObject
    ): Record<string, unknown> {
        return BuildContentAutotagPromptData({
            ContentSourceTypeID: params.contentSourceTypeID,
            ContentTypeID: params.contentTypeID,
            MinTags: params.minTags,
            MaxTags: params.maxTags,
            AttributePrompt: this.GetAdditionalContentTypePrompt(params.contentTypeID),
            ClassificationContext: params.classificationContext,
            ContentText: chunk,
            PreviousResults: previousResults,
        });
    }

    public async PromptAndRetrieveResultsFromLLM(params: ContentItemProcessParams, contextUser: UserInfo): Promise<JsonObject> {
        await AIEngine.Instance.Config(false, contextUser);

        // Resolve the effective classification context once per item (async lookup);
        // buildPromptData reads it from params for each chunk.
        params.classificationContext = await ResolveItemClassificationContext(params.contentSourceID, params.contentTypeID, contextUser, this.ProviderToUse);

        const prompt = GetContentAutotagPrompt();
        const tokenLimit = this.resolveTokenLimit(params.modelID);
        const chunks = await this.ChunkExtractedText(params.text, tokenLimit);

        if (chunks.length === 0 || (chunks.length === 1 && (!chunks[0] || chunks[0].trim().length === 0))) {
            LogError(`[Autotag] No text to process for item ${params.contentItemID}`);
            return {};
        }

        let LLMResults: JsonObject = {};
        const startTime = new Date();

        for (let ci = 0; ci < chunks.length; ci++) {
            try {
                LLMResults = await this.ProcessChunkWithPromptRunner(prompt, params, chunks[ci], LLMResults, contextUser);
            } catch (chunkError) {
                LogError(`[Autotag] Chunk ${ci + 1}/${chunks.length} failed for item ${params.contentItemID}: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`);
            }
        }

        LLMResults.processStartTime = startTime;
        LLMResults.processEndTime = new Date();
        LLMResults.contentItemID = params.contentItemID;
        return LLMResults;
    }

    /** @deprecated Use {@link PromptAndRetrieveResultsFromLLM}. */
    public async promptAndRetrieveResultsFromLLM(params: ContentItemProcessParams, contextUser: UserInfo): Promise<JsonObject> {
        return this.PromptAndRetrieveResultsFromLLM(params, contextUser);
    }

    /**
     * Resolves the input token limit for chunking. Uses the model specified by modelID if available,
     * otherwise falls back to a conservative default.
     */
    private resolveTokenLimit(modelID: string): number {
        const DEFAULT_TOKEN_LIMIT = 100000;
        if (modelID) {
            const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, modelID));
            if (model) {
                return model.InputTokenLimit;
            }
        }
        return DEFAULT_TOKEN_LIMIT;
    }

    /**
     * Processes a single text chunk using AIPromptRunner and merges results.
     * Uses the prompt's configured model by default. If ContentType.AIModelID is set,
     * it is passed as a runtime model override via AIPromptParams.override.
     */
    public async ProcessChunkWithPromptRunner(
        prompt: MJAIPromptEntityExtended,
        params: ContentItemProcessParams,
        chunk: string,
        LLMResults: JsonObject,
        contextUser: UserInfo
    ): Promise<JsonObject> {
        // ContentType.AIModelID, when set, overrides the prompt's own model.
        const result = await RunContentAutotagPrompt<JsonObject>(prompt, this.buildPromptData(params, chunk, LLMResults), contextUser, params.modelID);

        if (!result.success) {
            LogError(`[Autotag] LLM failed for item ${params.contentItemID}: ${result.errorMessage ?? 'unknown error'}`);
            return LLMResults;
        }


        // Parse the result — AIPromptRunner may return a raw JSON string or a parsed object
        let chunkResult: JsonObject | null = null;
        if (typeof result.result === 'string') {
            try {
                chunkResult = JSON.parse(result.result as string) as JsonObject;
            } catch {
                LogError(`Failed to parse LLM result as JSON for item ${params.contentItemID}: ${String(result.result).substring(0, 200)}`);
                return LLMResults;
            }
        } else {
            chunkResult = result.result as JsonObject;
        }

        // Merge results from this chunk into the accumulated results
        if (chunkResult) {
            for (const key in chunkResult) {
                const value = chunkResult[key];
                if (value !== null) {
                    LLMResults[key] = value;
                }
            }
        }

        // Capture the AIPromptRun ID that produced this chunk's tags so the
        // tag-persistence path can stamp ContentItemTag.AIPromptRunID for lineage.
        // Tags are merged across chunks; the last successful chunk's run is the
        // one whose keyword set is persisted, so the last-write-wins value here
        // matches the keywords actually saved.
        if (result.promptRun?.ID) {
            LLMResults[AutotagBaseEngine.AI_PROMPT_RUN_ID_KEY] = result.promptRun.ID;
        }

        return LLMResults;
    }

    /** @deprecated Use {@link ProcessChunkWithPromptRunner}. */
    public async processChunkWithPromptRunner(
        prompt: MJAIPromptEntityExtended,
        params: ContentItemProcessParams,
        chunk: string,
        LLMResults: JsonObject,
        contextUser: UserInfo
    ): Promise<JsonObject> {
        return this.ProcessChunkWithPromptRunner(prompt, params, chunk, LLMResults, contextUser);
    }

    public async SaveLLMResults(LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        if (LLMResults.isValidContent === true) {
            await this.SaveResultsToContentItemAttribute(LLMResults, contextUser);
            await this.SaveContentItemTags(LLMResults.contentItemID as string, LLMResults, contextUser);
        } else if (LLMResults.isValidContent === false) {
            LogStatus(`[Autotag] LLM judged content item ${LLMResults.contentItemID} INVALID — deleting it. Title: ${String(LLMResults.title ?? '')} | Reason/description: ${String(LLMResults.description ?? LLMResults.reason ?? '')}`.slice(0, 600));
            await this.DeleteInvalidContentItem(LLMResults.contentItemID as string, contextUser);
        } else {
            LogError(`[Autotag] Unexpected LLM format for item ${LLMResults.contentItemID} — isValidContent missing. Keys: ${Object.keys(LLMResults).join(', ')}`);
        }
    }

    /** @deprecated Use {@link SaveLLMResults}. */
    public async saveLLMResults(LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        return this.SaveLLMResults(LLMResults, contextUser);
    }

    public async DeleteInvalidContentItem(contentItemID: string, contextUser: UserInfo): Promise<void> {
        const md = this.ProviderToUse;
        const contentItem: MJContentItemEntity = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
        await contentItem.Load(contentItemID);
        await contentItem.Delete();
    }

    /** @deprecated Use {@link DeleteInvalidContentItem}. */
    public async deleteInvalidContentItem(contentItemID: string, contextUser: UserInfo): Promise<void> {
        return this.DeleteInvalidContentItem(contentItemID, contextUser);
    }

    /**
     * Registration key of the segmentation strategy this engine uses.
     *
     * Defaults to `FixedWindow`, which reproduces the engine's historical token-window
     * behavior exactly — routing through the strategy layer is a refactor, not a behavior
     * change. Override in a subclass (or, once the config field lands, resolve it from the
     * Content Source / Content Type `Configuration`) to opt into structure-aware
     * (`StructuralText`), topic-aware (`SemanticText`), or transcript-based (`Transcript`)
     * segmentation.
     *
     * @see [Content Segmentation Guide](../../../../../guides/CONTENT_SEGMENTATION_GUIDE.md)
     */
    protected resolveSegmenterKey(): string {
        return FIXED_WINDOW_SEGMENTER_KEY;
    }

    /**
     * Run the resolved segmentation strategy over `text` and return its text payloads.
     *
     * Returns null when segmentation fails, so callers can apply their own fallback rather
     * than silently embedding nothing.
     */
    protected async segmentTextForChunking(
        text: string,
        options: FixedWindowSegmentationOptions
    ): Promise<string[] | null> {
        const segmenter = ResolveSegmenter(this.resolveSegmenterKey(), FIXED_WINDOW_SEGMENTER_KEY);
        const result = await segmenter.Segment({ Text: text, Options: options });
        if (!result.Success) {
            LogError(`[Autotag] Segmentation failed (${result.SegmenterKey}): ${result.ErrorMessage ?? 'unknown error'}`);
            return null;
        }
        const texts = result.Segments.map(s => s.Text ?? '').filter(t => t.trim().length > 0);
        return texts.length > 0 ? texts : null;
    }

    /**
     * Chunks text for the LLM tagging pass, sized to the *tagging model's* context window.
     *
     * Note the budget here is deliberately independent of the embedding budget
     * ({@link MAX_EMBEDDING_TOKENS}) — these two chunk sites feed different consumers and
     * must not be collapsed into one call. Tagging chunks are transient and never persisted.
     */
    public async ChunkExtractedText(text: string, tokenLimit: number): Promise<string[]> {
        try {
            const maxChunkTokens = Math.ceil(tokenLimit / 1.5);

            // Short-circuit: text that already fits is passed through verbatim, preserving its
            // original whitespace (a segmenter would return a normalized reflow of the same text).
            if (text.length <= maxChunkTokens * 4) {
                return [text];
            }

            const segments = await this.segmentTextForChunking(text, {
                MaxSegmentTokens: maxChunkTokens,
                OverlapTokens: Math.ceil(maxChunkTokens * 0.1),
                TextStrategy: 'sentence',
            });
            return segments ?? this.fallbackChunkText(text, maxChunkTokens);
        } catch {
            LogError('Could not chunk the text');
            return [text];
        }
    }

    /** @deprecated Use {@link ChunkExtractedText}. */
    public async chunkExtractedText(text: string, tokenLimit: number): Promise<string[]> {
        return this.ChunkExtractedText(text, tokenLimit);
    }

    /**
     * Simple character-based chunking as fallback
     */
    private fallbackChunkText(text: string, textLimit: number): string[] {
        const numChunks = Math.ceil(text.length / textLimit);
        const chunkSize = Math.ceil(text.length / numChunks);
        const chunks: string[] = [];
        for (let i = 0; i < numChunks; i++) {
            const start = i * chunkSize;
            const end = (i + 1) * chunkSize;
            chunks.push(text.slice(start, end));
        }
        return chunks;
    }

    /**
     * Optional callback invoked after each ContentItemTag is saved, enabling the
     * tag taxonomy bridge (ContentItemTag → Tag + TaggedItem). Set by providers
     * like AutotagEntity that want to link free-text tags to formal taxonomy entries.
     *
     * Parameters: (contentItemTag: MJContentItemTagEntity, parentTag: string | null, contextUser: UserInfo)
     */
    public OnContentItemTagSaved: ((tag: MJContentItemTagEntity, parentTag: string | null, contextUser: UserInfo) => Promise<void>) | null = null;

    /**
     * Optional after-batch hook used to enforce per-run budgets. Subclasses
     * (e.g., AutotagEntity) check their RunBudget instances and may return
     * `{ continue: false }` to gracefully pause the run via the existing
     * CancellationRequested machinery.
     */
    public OnAfterBatch: ((batch: MJContentItemEntity[], totalProcessed: number) => Promise<{ continue: boolean; reason?: string } | null>) | null = null;

    /**
     * Saves keyword tags from LLM results as Content Item Tags.
     * Uses batched saves for better performance.
     * After each tag is saved, invokes the OnContentItemTagSaved callback (if set)
     * for taxonomy bridge processing.
     */
    public async SaveContentItemTags(contentItemID: string, LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        const md = this.ProviderToUse;

        // AIPromptRun lineage: the run that produced this keyword set was stashed on
        // LLMResults during chunk processing. Stamped on each ContentItemTag for audit.
        const rawPromptRunID = LLMResults[AutotagBaseEngine.AI_PROMPT_RUN_ID_KEY];
        const aiPromptRunID: string | null = typeof rawPromptRunID === 'string' && rawPromptRunID.length > 0
            ? rawPromptRunID
            : null;

        const normalizedTags = NormalizeAutotagKeywords(LLMResults.keywords);

        const BATCH_SIZE = 10;
        for (let i = 0; i < normalizedTags.length; i += BATCH_SIZE) {
            const batch = normalizedTags.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (item) => {
                const contentItemTag: MJContentItemTagEntity = await md.GetEntityObject<MJContentItemTagEntity>('MJ: Content Item Tags', contextUser);
                contentItemTag.NewRecord();
                contentItemTag.ItemID = contentItemID;
                contentItemTag.Tag = item.Tag;
                contentItemTag.Weight = item.Weight;
                // Phase 4 lineage/audit — only set when available, both columns nullable.
                if (aiPromptRunID) {
                    contentItemTag.AIPromptRunID = aiPromptRunID;
                }
                if (item.Reasoning) {
                    contentItemTag.Reasoning = item.Reasoning;
                }
                const saved = await contentItemTag.Save();

                // Invoke taxonomy bridge callback if set
                if (saved && this.OnContentItemTagSaved) {
                    try {
                        await this.OnContentItemTagSaved(contentItemTag, item.ParentTag, contextUser);
                    } catch (bridgeError) {
                        const msg = bridgeError instanceof Error ? bridgeError.message : String(bridgeError);
                        LogError(`Tag taxonomy bridge failed for tag "${item.Tag}": ${msg}`);
                    }
                }
            }));
        }
    }

    /** @deprecated Use {@link SaveContentItemTags}. */
    public async saveContentItemTags(contentItemID: string, LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        return this.SaveContentItemTags(contentItemID, LLMResults, contextUser);
    }

    /**
     * Saves LLM-extracted attributes to the database.
     * Updates content item name/description, then creates attribute records for other fields.
     */
    public async SaveResultsToContentItemAttribute(LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        const md = this.ProviderToUse;
        const contentItemID = LLMResults.contentItemID as string;
        const skipKeys = new Set(['keywords', 'processStartTime', 'processEndTime', 'contentItemID', 'isValidContent', AutotagBaseEngine.AI_PROMPT_RUN_ID_KEY]);

        // Update title and description on the content item.
        // For entity-sourced items (EntityRecordDocumentID is set), preserve the
        // original entity record name — it's more meaningful to users than the
        // AI-generated title. Only update description.
        if (LLMResults.title || LLMResults.description) {
            const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
            await contentItem.Load(contentItemID);
            const isEntitySourced = contentItem.EntityRecordDocumentID != null;
            if (LLMResults.title && !isEntitySourced) {
                contentItem.Name = LLMResults.title as string;
            }
            if (LLMResults.description) contentItem.Description = LLMResults.description as string;
            await contentItem.Save();
        }

        // Create attribute records for remaining fields
        const attributeEntries = Object.entries(LLMResults).filter(([key]) => !skipKeys.has(key) && key !== 'title' && key !== 'description');

        const BATCH_SIZE = 10;
        for (let i = 0; i < attributeEntries.length; i += BATCH_SIZE) {
            const batch = attributeEntries.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async ([key, value]) => {
                const contentItemAttribute = await md.GetEntityObject<MJContentItemAttributeEntity>('MJ: Content Item Attributes', contextUser);
                contentItemAttribute.NewRecord();
                contentItemAttribute.ContentItemID = contentItemID;
                contentItemAttribute.Name = key;
                contentItemAttribute.Value = value != null ? String(value) : '';
                await contentItemAttribute.Save();
            }));
        }
    }

    /** @deprecated Use {@link SaveResultsToContentItemAttribute}. */
    public async saveResultsToContentItemAttribute(LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        return this.SaveResultsToContentItemAttribute(LLMResults, contextUser);
    }

    /**
     * Retrieves all content sources for a given content source type.
     * Throws if no sources are found.
     */
    public async GetAllContentSources(contextUser: UserInfo, contentSourceTypeID: string): Promise<MJContentSourceEntity[]> {
        const sources = await this.GetAllContentSourcesSafe(contextUser, contentSourceTypeID);
        if (sources.length === 0) {
            throw new Error(`No content sources found for content source type with ID '${contentSourceTypeID}'`);
        }
        return sources;
    }

    /** @deprecated Use {@link GetAllContentSources}. */
    public async getAllContentSources(contextUser: UserInfo, contentSourceTypeID: string): Promise<MJContentSourceEntity[]> {
        return this.GetAllContentSources(contextUser, contentSourceTypeID);
    }

    /**
     * Retrieves all content sources for a given content source type.
     * Returns an empty array (instead of throwing) when no sources are configured.
     */
    public async GetAllContentSourcesSafe(_contextUser: UserInfo, contentSourceTypeID: string): Promise<MJContentSourceEntity[]> {
        return this.khEngine.ContentSources.filter(s => UUIDsEqual(s.ContentSourceTypeID, contentSourceTypeID));
    }

    public SetSubclassContentSourceType(subclass: string): string {
        const sourceType = this.ContentSourceTypes.find(st => st.Name === subclass);
        if (!sourceType) {
            throw new Error(`Content Source Type with name '${subclass}' not found in cached metadata`);
        }
        return sourceType.ID;
    }

    public async GetContentSourceParams(contentSource: MJContentSourceEntity, contextUser: UserInfo): Promise<Map<string, ContentSourceTypeParamValue>> {
        const contentSourceParams = new Map<string, ContentSourceTypeParamValue>();

        const rv = new RunView();
        const results = await rv.RunView<MJContentSourceParamEntity>({
            EntityName: 'MJ: Content Source Params',
            ExtraFilter: `ContentSourceID='${contentSource.ID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (results.Success && results.Results.length) {
            for (const contentSourceParam of results.Results) {
                const params: ContentSourceTypeParams = this.GetDefaultContentSourceTypeParams(contentSourceParam.ContentSourceTypeParamID);
                params.contentSourceID = contentSource.ID;

                if (contentSourceParam.Value) {
                    params.value = this.CastValueAsCorrectType(contentSourceParam.Value, params.type);
                }
                contentSourceParams.set(params.name, params.value);
            }
        } else {
            LogStatus(`No content source params found for content source with ID ${contentSource.ID}, using default values`);
        }

        return contentSourceParams;
    }

    /** @deprecated Use {@link GetContentSourceParams}. */
    public async getContentSourceParams(contentSource: MJContentSourceEntity, contextUser: UserInfo): Promise<Map<string, ContentSourceTypeParamValue>> {
        return this.GetContentSourceParams(contentSource, contextUser);
    }

    public GetDefaultContentSourceTypeParams(contentSourceTypeParamID: string): ContentSourceTypeParams {
        const result = this._contentSourceTypeParams.find(p => UUIDsEqual(p.ID, contentSourceTypeParamID));
        if (!result) {
            throw new Error(`Content Source Type Param with ID '${contentSourceTypeParamID}' not found in cached metadata`);
        }

        const params = new ContentSourceTypeParams();
        params.name = result.Name;
        params.type = result.Type.toLowerCase();
        params.value = this.CastValueAsCorrectType(result.DefaultValue ?? '', params.type);
        return params;
    }

    public CastValueAsCorrectType(value: string, type: string): ContentSourceTypeParamValue {
        switch (type) {
            case 'number':
                return parseInt(value, 10);
            case 'boolean':
                return this.StringToBoolean(value);
            case 'string':
                return value;
            case 'string[]':
                return this.ParseStringArray(value);
            case 'regexp':
                return new RegExp(value.replace(/\\\\/g, '\\'));
            default:
                return value;
        }
    }

    /** @deprecated Use {@link CastValueAsCorrectType}. */
    public castValueAsCorrectType(value: string, type: string): ContentSourceTypeParamValue {
        return this.CastValueAsCorrectType(value, type);
    }

    public StringToBoolean(str: string): boolean {
        return str === 'true';
    }

    /** @deprecated Use {@link StringToBoolean}. */
    public stringToBoolean(str: string): boolean {
        return this.StringToBoolean(str);
    }

    public ParseStringArray(value: string): string[] {
        return JSON.parse(value) as string[];
    }

    /** @deprecated Use {@link ParseStringArray}. */
    public parseStringArray(value: string): string[] {
        return this.ParseStringArray(value);
    }

    /**
     * Converts a run date to the user's local timezone.
     */
    public async ConvertLastRunDateToTimezone(lastRunDate: Date): Promise<Date> {
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return toZonedTime(lastRunDate, userTimeZone);
    }

    /** @deprecated Use {@link ConvertLastRunDateToTimezone}. */
    public async convertLastRunDateToTimezone(lastRunDate: Date): Promise<Date> {
        return this.ConvertLastRunDateToTimezone(lastRunDate);
    }

    /**
     * Retrieves the last run date for a content source. Returns epoch date if no runs exist.
     */
    public async GetContentSourceLastRunDate(contentSourceID: string, contextUser: UserInfo): Promise<Date> {
        const rv = new RunView();
        // Exclude 'Running' status to avoid using the current in-progress run's
        // start time as the cutoff — that would cause the provider to skip all records.
        const results = await rv.RunView<MJContentProcessRunEntity>({
            EntityName: 'MJ: Content Process Runs',
            ExtraFilter: `SourceID='${contentSourceID}' AND Status <> 'Running'`,
            ResultType: 'entity_object',
            OrderBy: 'EndTime DESC'
        }, contextUser);

        if (results.Success && results.Results.length) {
            const lastRunDate = results.Results[0].__mj_CreatedAt;
            return this.ConvertLastRunDateToTimezone(lastRunDate);
        }

        if (results.Success) {
            return new Date(0);
        }

        throw new Error(`Failed to retrieve last run date for content source with ID ${contentSourceID}`);
    }

    /** @deprecated Use {@link GetContentSourceLastRunDate}. */
    public async getContentSourceLastRunDate(contentSourceID: string, contextUser: UserInfo): Promise<Date> {
        return this.GetContentSourceLastRunDate(contentSourceID, contextUser);
    }

    public GetContentItemParams(contentTypeID: string): { modelID: string; minTags: number; maxTags: number } {
        const contentType = this.khEngine.GetContentTypeByID(contentTypeID);
        if (!contentType) {
            throw new Error(`Content Type with ID ${contentTypeID} not found in cached metadata`);
        }
        return {
            modelID: contentType.AIModelID,
            minTags: contentType.MinTags,
            maxTags: contentType.MaxTags
        };
    }

    public GetContentSourceTypeName(contentSourceTypeID: string): string {
        const sourceType = this.khEngine.GetContentSourceTypeByID(contentSourceTypeID);
        if (!sourceType) {
            throw new Error(`Content Source Type with ID ${contentSourceTypeID} not found in cached metadata`);
        }
        return sourceType.Name;
    }

    public GetContentTypeName(contentTypeID: string): string {
        const contentType = this.khEngine.GetContentTypeByID(contentTypeID);
        if (!contentType) {
            throw new Error(`Content Type with ID ${contentTypeID} not found in cached metadata`);
        }
        return contentType.Name;
    }

    public GetContentFileTypeName(contentFileTypeID: string): string {
        const fileType = this.ContentFileTypes.find(ft => UUIDsEqual(ft.ID, contentFileTypeID));
        if (!fileType) {
            throw new Error(`Content File Type with ID ${contentFileTypeID} not found in cached metadata`);
        }
        return fileType.Name;
    }

    public GetAdditionalContentTypePrompt(contentTypeID: string): string {
        return BuildAttributePrompt(this.ContentTypeAttributes.filter(a => UUIDsEqual(a.ContentTypeID, contentTypeID)));
    }

    public GetContentItemDescription(contentSourceParams: ContentSourceParams): string {
        const contentTypeName = this.GetContentTypeName(contentSourceParams.ContentTypeID);
        const fileTypeName = this.GetContentFileTypeName(contentSourceParams.ContentFileTypeID);
        const sourceTypeName = this.GetContentSourceTypeName(contentSourceParams.ContentSourceTypeID);
        return `${contentTypeName} in ${fileTypeName} format obtained from a ${sourceTypeName} source`;
    }

    public async GetChecksumFromURL(url: string): Promise<string> {
        const response = await HttpGet<string>(url, { ResponseType: 'text' });
        const content = String(response.Data);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /** @deprecated Use {@link GetChecksumFromURL}. */
    public async getChecksumFromURL(url: string): Promise<string> {
        return this.GetChecksumFromURL(url);
    }

    public async GetChecksumFromText(text: string): Promise<string> {
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    /** @deprecated Use {@link GetChecksumFromText}. */
    public async getChecksumFromText(text: string): Promise<string> {
        return this.GetChecksumFromText(text);
    }

    public async GetContentItemIDFromURL(contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<string> {
        const url = contentSourceParams.URL;
        const rv = new RunView();
        const results = await rv.RunView<MJContentItemEntity>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `URL='${url}' AND ContentSourceID='${contentSourceParams.contentSourceID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (results.Success && results.Results.length) {
            return results.Results[0].ID;
        }

        throw new Error(`Content item with URL ${url} not found`);
    }

    /** @deprecated Use {@link GetContentItemIDFromURL}. */
    public async getContentItemIDFromURL(contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<string> {
        return this.GetContentItemIDFromURL(contentSourceParams, contextUser);
    }

    /**
     * Saves process run metadata to the database (backward-compatible simple version).
     */
    public async SaveProcessRun(processRunParams: ProcessRunParams, contextUser: UserInfo): Promise<void> {
        const md = this.ProviderToUse;
        const processRun = await md.GetEntityObject<MJContentProcessRunEntity>('MJ: Content Process Runs', contextUser);
        processRun.NewRecord();
        processRun.SourceID = processRunParams.sourceID;
        processRun.StartTime = processRunParams.startTime;
        processRun.EndTime = processRunParams.endTime;
        processRun.Status = 'Completed';
        processRun.ProcessedItems = processRunParams.numItemsProcessed;
        processRun.StartedByUserID = contextUser.ID;
        await processRun.Save();
    }

    /** @deprecated Use {@link SaveProcessRun}. */
    public async saveProcessRun(processRunParams: ProcessRunParams, contextUser: UserInfo): Promise<void> {
        return this.SaveProcessRun(processRunParams, contextUser);
    }

    /**
     * Create a new ContentProcessRun record for batched pipeline execution.
     * Returns the entity so the caller can update cursor/status as batches complete.
     * Uses the JSONType ConfigurationObject for strongly-typed configuration.
     */
    public async CreateBatchedProcessRun(
        sourceID: string,
        totalItemCount: number,
        batchSize: number,
        contextUser: UserInfo,
        config?: MJContentProcessRunEntity_IContentProcessRunConfiguration
    ): Promise<MJContentProcessRunEntity> {
        const md = this.ProviderToUse;
        const processRun = await md.GetEntityObject<MJContentProcessRunEntity>('MJ: Content Process Runs', contextUser);
        processRun.NewRecord();
        processRun.SourceID = sourceID;
        processRun.StartTime = new Date();
        processRun.Status = 'Running';
        processRun.ProcessedItems = 0;
        processRun.TotalItemCount = totalItemCount;
        processRun.BatchSize = batchSize;
        processRun.LastProcessedOffset = 0;
        processRun.ErrorCount = 0;
        processRun.CancellationRequested = false;
        processRun.StartedByUserID = contextUser.ID;

        if (config) {
            processRun.ConfigurationObject = config;
        }

        const saved = await processRun.Save();
        if (!saved) {
            throw new Error('Failed to create ContentProcessRun record');
        }
        return processRun;
    }

    /**
     * Update a batched process run's cursor position after a batch completes.
     * Checks CancellationRequested to support pause/cancel.
     * @returns true if processing should continue, false if cancelled/paused
     */
    public async UpdateBatchCursor(
        processRun: MJContentProcessRunEntity,
        processedCount: number,
        errorCount: number
    ): Promise<boolean> {
        processRun.ProcessedItems = processedCount;
        processRun.LastProcessedOffset = processedCount;
        processRun.ErrorCount = errorCount;
        await processRun.Save();

        // Reload to check if cancellation was requested externally
        await processRun.Load(processRun.ID);
        if (processRun.CancellationRequested) {
            processRun.Status = 'Paused';
            processRun.EndTime = new Date();
            await processRun.Save();
            LogStatus(`[Pipeline] Cancellation requested — pausing at offset ${processedCount}`);
            return false;
        }

        return true;
    }

    /**
     * Complete a batched process run (success or failure).
     */
    public async CompleteBatchedProcessRun(
        processRun: MJContentProcessRunEntity,
        status: 'Completed' | 'Failed' | 'Cancelled',
        errorMessage?: string
    ): Promise<void> {
        processRun.Status = status;
        processRun.EndTime = new Date();
        if (errorMessage) {
            processRun.ErrorMessage = errorMessage;
        }
        await processRun.Save();
    }

    /**
     * Create rate limiters from the pipeline configuration.
     */
    public CreateRateLimiters(
        config?: MJContentProcessRunEntity_IContentProcessRunConfiguration
    ): { llm: RateLimiter; embedding: RateLimiter; vectorDB: RateLimiter } {
        return {
            llm: new RateLimiter({
                RequestsPerMinute: config?.RateLimits?.LLM?.RequestsPerMinute ?? 60,
                TokensPerMinute: config?.RateLimits?.LLM?.TokensPerMinute ?? 1000000,
                Name: 'LLM',
            }),
            embedding: new RateLimiter({
                RequestsPerMinute: config?.RateLimits?.Embedding?.RequestsPerMinute ?? 300,
                TokensPerMinute: config?.RateLimits?.Embedding?.TokensPerMinute ?? 1000000,
                Name: 'Embedding',
            }),
            vectorDB: new RateLimiter({
                RequestsPerMinute: config?.RateLimits?.VectorDB?.RequestsPerMinute ?? 200,
                Name: 'VectorDB',
            }),
        };
    }

    public async ParsePDF(dataBuffer: Buffer): Promise<string> {
        const dataPDF = await pdfParse(dataBuffer);
        return dataPDF.text;
    }

    /** @deprecated Use {@link ParsePDF}. */
    public async parsePDF(dataBuffer: Buffer): Promise<string> {
        return this.ParsePDF(dataBuffer);
    }

    public async ParseDOCX(dataBuffer: Buffer): Promise<string> {
        const dataDOCX = await officeparser.parseOffice(dataBuffer);
        return dataDOCX.toText();
    }

    /** @deprecated Use {@link ParseDOCX}. */
    public async parseDOCX(dataBuffer: Buffer): Promise<string> {
        return this.ParseDOCX(dataBuffer);
    }

    public async ParseHTML(data: string): Promise<string> {
        try {
            const $ = cheerio.load(data);
            $('script, style, nav, footer, header, .hidden').remove();
            return $('body').text().replace(/\s\s+/g, ' ').trim();
        } catch (e) {
            LogError('Error parsing HTML', undefined, e);
            throw e;
        }
    }

    /** @deprecated Use {@link ParseHTML}. */
    public async parseHTML(data: string): Promise<string> {
        return this.ParseHTML(data);
    }

    public async ParseFileFromPath(filePath: string): Promise<string> {
        const dataBuffer = await fs.promises.readFile(filePath);
        const fileExtension = filePath.split('.').pop()?.toLowerCase();
        switch (fileExtension) {
            case 'pdf':
                return this.ParsePDF(dataBuffer);
            case 'docx':
                return this.ParseDOCX(dataBuffer);
            default:
                throw new Error(`File type '${fileExtension}' not supported`);
        }
    }

    /** @deprecated Use {@link ParseFileFromPath}. */
    public async parseFileFromPath(filePath: string): Promise<string> {
        return this.ParseFileFromPath(filePath);
    }

    // ---- Direct Vectorization ----

    /**
     * Embeds content items and upserts them to the appropriate vector index.
     * Items are grouped by their resolved (embeddingModel + vectorIndex) pair — derived
     * from per-ContentSource overrides, per-ContentType defaults, or the global fallback
     * (first active VectorIndex). Each group is processed in configurable batches with
     * parallel upserts within each batch.
     *
     * Uses AIEmbeddingRunner to create AIPromptRun records for each embedding batch,
     * enabling token/cost tracking and linking to ContentProcessRunDetail records.
     *
     * @param items - content items to vectorize
     * @param contextUser - current user for permissions/audit
     * @param onProgress - optional callback for progress updates
     * @param batchSize - number of items per embedding batch
     * @returns counts of vectorized/skipped items and collected AIPromptRun IDs
     */
    public async VectorizeContentItems(
        items: MJContentItemEntity[],
        contextUser: UserInfo,
        onProgress?: (processed: number, total: number) => void,
        batchSize: number = DEFAULT_VECTORIZE_BATCH_SIZE
    ): Promise<VectorizeResult> {
        const eligible = items.filter(i => i.Text && i.Text.trim().length > 0);
        if (eligible.length === 0) {
            LogStatus('VectorizeContentItems: no items with text to vectorize');
            return { vectorized: 0, skipped: items.length, promptRunIDs: [] };
        }

        // Ensure AIEngine is loaded so we can resolve the embedding model
        await AIEngine.Instance.Config(false, contextUser);

        // Group items by their resolved (embeddingModelID + vectorIndexID) pair
        const infrastructure = new ContentVectorInfrastructure(this.ProviderToUse, contextUser, { AllowFirstIndexFallback: true });
        const groups = await infrastructure.GroupByInfrastructure(eligible);

        // Load tags for all items in one query
        const tagMap = await LoadContentItemTags(eligible.map(i => i.ID), this.ProviderToUse, contextUser);

        let vectorized = 0;
        let processed = 0;
        const allPromptRunIDs: string[] = [];

        for (const [groupKey, groupItems] of groups) {
            const infra = await infrastructure.Resolve(groupKey);
            const groupResult = await this.vectorizeGroup(groupItems, infra, tagMap, batchSize, contextUser, infrastructure, (batchProcessed) => {
                processed += batchProcessed;
                onProgress?.(Math.min(processed, eligible.length), eligible.length);
            });
            vectorized += groupResult.vectorized;
            allPromptRunIDs.push(...groupResult.promptRunIDs);
        }

        LogStatus(`VectorizeContentItems: ${vectorized} vectorized, ${items.length - eligible.length} skipped (empty text), ${allPromptRunIDs.length} prompt runs created`);
        return { vectorized, skipped: items.length - eligible.length, promptRunIDs: allPromptRunIDs };
    }

    /**
     * Process a single infrastructure group: embed texts in batches and upsert to vector DB.
     * Uses AIEmbeddingRunner for each embedding batch to create AIPromptRun records with
     * token/cost tracking. Upserts within each batch run in parallel for throughput.
     *
     * @param items - content items in this infrastructure group
     * @param infra - resolved embedding + vector DB infrastructure
     * @param tagMap - pre-loaded tags for metadata enrichment
     * @param batchSize - number of items per embedding batch
     * @param contextUser - current user for AIEmbeddingRunner tracking
     * @param onBatchComplete - callback invoked after each batch with item count
     * @returns count of vectorized items and collected AIPromptRun IDs
     */
    private async vectorizeGroup(
        items: MJContentItemEntity[],
        infra: ResolvedVectorInfrastructure,
        tagMap: Map<string, string[]>,
        batchSize: number,
        contextUser: UserInfo,
        infrastructure: ContentVectorInfrastructure,
        onBatchComplete: (count: number) => void
    ): Promise<{ vectorized: number; promptRunIDs: string[] }> {
        let vectorized = 0;
        const promptRunIDs: string[] = [];
        const embeddingRunner = new AIEmbeddingRunner();

        // Provider directives are built for every item BEFORE any embedding spend. A driver may
        // reject a record from BuildProviderDirectives (e.g. a mandatory routing value its config
        // requires — such as a tenant-isolation field — is missing); rejected items are marked
        // Failed individually and excluded so they never poison the rest of the group. Recovery
        // after fixing the data: reset the item to Pending or use ForceReprocess.
        const { Directives: directives, Rejected } = await infrastructure.BuildDirectives(items, infra);
        const rejected = Rejected.map(r => r.Item);
        if (rejected.length > 0) {
            LogError(`VectorizeContentItems: ${rejected.length} item(s) rejected by the vector provider's directive policy — marked Failed, remaining items proceed`);
            await this.updateEmbeddingStatusBatch(rejected, 'Failed', contextUser);
            onBatchComplete(rejected.length);
            const rejectedIDs = new Set(rejected.map(i => NormalizeUUID(i.ID)));
            items = items.filter(i => !rejectedIDs.has(NormalizeUUID(i.ID)));
        }
        if (items.length === 0) {
            return { vectorized, promptRunIDs };
        }

        // Mark every item in this infra group as Processing up front so dashboards
        // reflect in-flight state. Each batch will transition its items to Complete
        // or Failed as outcomes are known.
        await this.updateEmbeddingStatusBatch(items, 'Processing', contextUser);

        // Resolve the "Content Embedding" prompt ID for tracking
        const embeddingPromptID = this.resolveEmbeddingPromptID();

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);

            // Build chunks for each item — items with long text produce multiple chunks
            const allChunks = await this.buildChunksForBatch(batch);

            const texts = allChunks.map(c => c.text);
            // Rate limit embedding API call
            await this.EmbeddingRateLimiter.Acquire(texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0));

            // Use AIEmbeddingRunner to embed texts with AIPromptRun tracking
            const runResult = await embeddingRunner.RunEmbedding({
                Texts: texts,
                ModelID: infra.embeddingModelID,
                PromptID: embeddingPromptID,
                ContextUser: contextUser,
                Description: `Content vectorization batch: ${batch.length} items, ${allChunks.length} chunks`,
                Dimensions: infra.dimensions,
            });

            if (!runResult.Success || runResult.Vectors.length !== allChunks.length) {
                LogError(`VectorizeContentItems: embedding returned ${runResult.Vectors.length} vectors for ${allChunks.length} texts — ${runResult.ErrorMessage ?? 'unknown error'}`);
                await this.updateEmbeddingStatusBatch(batch, 'Failed', contextUser);
                onBatchComplete(batch.length);
                continue;
            }

            // Track the AIPromptRun ID for junction table linking
            if (runResult.PromptRunID) {
                promptRunIDs.push(runResult.PromptRunID);
            }

            const records = this.buildVectorRecords(allChunks, runResult.Vectors, tagMap, infra, directives);

            const batchSuccess = (await UpsertVectorRecords(records, infra, this.VectorDBRateLimiter)).success;
            if (batchSuccess) {
                vectorized += batch.length;
                // Persist the vector-DB record identifiers back into MJ before the status save,
                // so single-chunk items carry their VectorRecordID in the same 'Complete' write.
                await this.persistVectorReferences(batch, allChunks, records, contextUser);
                await this.updateEmbeddingStatusBatch(batch, 'Complete', contextUser, infra.embeddingModelID);
            } else {
                await this.updateEmbeddingStatusBatch(batch, 'Failed', contextUser);
            }

            onBatchComplete(batch.length);
        }

        return { vectorized, promptRunIDs };
    }

    /**
     * Resolve the "Content Embedding" prompt ID from AIEngine for AIEmbeddingRunner tracking.
     * Returns undefined if the prompt is not found (AIEmbeddingRunner then uses the first
     * active Embedding-type prompt).
     */
    private resolveEmbeddingPromptID(): string | undefined {
        const prompt = AIEngine.Instance.Prompts.find(
            p => p.Name === 'Content Embedding' && p.Status === 'Active'
        );
        if (prompt) {
            return prompt.ID;
        }
        // Fall back: let AIEmbeddingRunner find the first active Embedding prompt
        LogStatus('[Autotag] "Content Embedding" prompt not found — AIEmbeddingRunner will use default embedding prompt');
        return undefined;
    }

    /**
     * Build text chunks for a batch of content items. Items with long text
     * produce multiple chunks via TextChunker.
     */
    private async buildChunksForBatch(
        batch: MJContentItemEntity[]
    ): Promise<EmbeddingChunk[]> {
        const allChunks: EmbeddingChunk[] = [];
        for (const item of batch) {
            const chunks = await this.buildEmbeddingChunks(item);
            for (let ci = 0; ci < chunks.length; ci++) {
                // Mint a stable per-chunk id up front. This becomes BOTH the ContentItemChunk row's
                // PK and (under the 'recordId' strategy) its vector-DB id, so a re-chunk produces
                // NEW rows with NEW ids — old (soft-deleted) and new chunks never collide on a
                // vector id, which is what makes the purge safe.
                allChunks.push({ item, chunkIndex: ci, text: chunks[ci], chunkID: uuidv4() });
            }
        }
        return allChunks;
    }

    /**
     * Build VectorRecord objects from embedding chunks and their corresponding vectors. Resolves
     * each item's storage config once and shares the item-level-vs-chunk decision between the
     * vector id and the metadata so the two always agree.
     */
    protected buildVectorRecords(
        allChunks: EmbeddingChunk[],
        vectors: number[][],
        tagMap: Map<string, string[]>,
        infra: ResolvedVectorInfrastructure,
        directivesByItem?: Map<string, Record<string, unknown> | undefined>
    ): VectorRecord[] {
        const countByItem = new Map<string, number>();
        for (const c of allChunks) {
            countByItem.set(c.item.ID, (countByItem.get(c.item.ID) ?? 0) + 1);
        }
        // The ContentItem entity metadata drives config-selected display fields (types, MaxLength,
        // eligibility). Resolved once per batch — every chunk shares the same source entity.
        const contentItemEntity = this.ProviderToUse.EntityByName('MJ: Content Items');
        return allChunks.map((chunk, idx) =>
            this.buildVectorRecord(chunk, vectors[idx], countByItem.get(chunk.item.ID) ?? 1, tagMap.get(NormalizeUUID(chunk.item.ID)), contentItemEntity, infra, directivesByItem)
        );
    }

    /**
     * Build the single {@link VectorRecord} for one embedding chunk. Resolves the item's storage
     * config, decides item-level-vs-chunk once, and shares that decision between the vector id and
     * the metadata so the two always agree. `protected` so subclasses can override per-record
     * shaping (id, metadata, or provider directives) without reimplementing the batch loop in
     * {@link buildVectorRecords}.
     *
     * @param chunk              The embedding unit (item slice + minted chunk id).
     * @param vector             The embedding produced for `chunk`.
     * @param chunkCountForItem  Total chunks produced for `chunk.item` this batch — drives the
     *                           item-level-vs-chunk decision ({@link isItemLevelVector}).
     * @param tags               Resolved tag names for `chunk.item`, if any.
     * @param contentItemEntity  The 'MJ: Content Items' entity metadata, for display-field resolution.
     * @param infra              Resolved vector infrastructure (source of provider directives).
     * @param directivesByItem   Directives precomputed per item ({@link ContentVectorInfrastructure.BuildDirectives});
     *                           when absent, directives are built inline (and a driver rejection throws).
     */
    protected buildVectorRecord(
        chunk: EmbeddingChunk,
        vector: number[],
        chunkCountForItem: number,
        tags: string[] | undefined,
        contentItemEntity: EntityInfo | undefined,
        infra: ResolvedVectorInfrastructure,
        directivesByItem?: Map<string, Record<string, unknown> | undefined>
    ): VectorRecord {
        const config = this.resolveItemVectorStorageConfig(chunk.item);
        const itemLevel = this.isItemLevelVector(config, chunkCountForItem);
        const record: VectorRecord = {
            id: this.resolveChunkVectorID(chunk, config, itemLevel),
            values: vector,
            metadata: this.buildVectorMetadata(chunk, itemLevel, tags, config, contentItemEntity)
        };
        const directives = directivesByItem
            ? directivesByItem.get(NormalizeUUID(chunk.item.ID))
            : BuildProviderDirectives(chunk.item, infra);
        if (directives) {
            record.providerTemporaryDirectives = directives;
        }
        return record;
    }

    /**
     * Choose the vector-DB record id for one chunk based on the item's resolved config.
     * - 'recordId' (default): the chunk's own id (chunkID), which is also the ContentItemChunk PK.
     *   Purge-safe — a re-chunk mints fresh ids, so a superseded chunk and its replacement never
     *   collide.
     * - 'hash': deterministic. An item-level single vector uses the bare item hash; every other
     *   case uses a per-(item, chunkIndex) hash. Deterministic ⇒ unsafe with re-chunk + purge
     *   (documented on the config), but preserves 5.49 EntityDocument parity when opted into.
     */
    protected resolveChunkVectorID(
        chunk: EmbeddingChunk,
        config: ResolvedVectorStorageConfig,
        isItemLevel: boolean
    ): string {
        return ResolveContentVectorID(config, chunk.item.ID, isItemLevel, chunk.chunkIndex, chunk.chunkID);
    }

    /**
     * Persist the vector-database record identifiers produced during this batch back into MJ.
     *
     * Where the id lands is governed by the item's resolved {@link ChunkTextStorage}:
     * - 'mixed' + single chunk: the item embeds as one vector, so its record id is stored directly
     *   on ContentItem.VectorRecordID (set in-memory here; persisted by the subsequent 'Complete'
     *   status Save so no extra write is needed).
     * - 'alwaysChunk' (any chunk count) or 'mixed' multi-chunk: per-chunk provenance is recorded in
     *   ContentItemChunk rows (ContentItemID, Sequence, Text, VectorRecordID) and
     *   ContentItem.VectorRecordID is left null (the chunk table is the source of truth).
     *
     * `allChunks` and `records` are parallel arrays (buildVectorRecords maps 1:1), so
     * records[i].id is the vector-DB id for allChunks[i]. Best-effort: a persistence failure
     * for one item is logged but does not abort the batch — the vectors are already upserted.
     */
    private async persistVectorReferences(
        batch: MJContentItemEntity[],
        allChunks: EmbeddingChunk[],
        records: VectorRecord[],
        contextUser: UserInfo
    ): Promise<void> {
        // Group the persisted-chunk specs by content item, preserving order.
        const byItem = new Map<string, PersistedChunk[]>();
        for (let idx = 0; idx < allChunks.length; idx++) {
            const c = allChunks[idx];
            const key = NormalizeUUID(c.item.ID);
            const list = byItem.get(key) ?? [];
            list.push({ chunkIndex: c.chunkIndex, text: c.text, vectorRecordID: String(records[idx].id), chunkID: c.chunkID });
            byItem.set(key, list);
        }

        for (const item of batch) {
            const chunks = byItem.get(NormalizeUUID(item.ID));
            if (!chunks || chunks.length === 0) continue;
            const config = this.resolveItemVectorStorageConfig(item);
            try {
                if (this.isItemLevelVector(config, chunks.length)) {
                    // 'mixed' + single chunk — the record id lives on the content item itself.
                    item.VectorRecordID = chunks[0].vectorRecordID;
                } else {
                    // 'alwaysChunk', or multiple vectors — record per-chunk provenance in
                    // ContentItemChunk rows; the item-level id is left null (chunk table is truth).
                    item.VectorRecordID = null;
                    await this.replaceContentItemChunks(item.ID, chunks, contextUser);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                LogError(`persistVectorReferences: failed to persist chunk references for item ${item.ID}: ${msg}`);
            }
        }
    }

    /**
     * Supersede a content item's current (live) chunks with a freshly-embedded set: the live
     * chunks are SOFT-deleted (DeleteStatus='Pending', rows kept) and the new chunks appended,
     * atomically. A later PurgeDeletedChunks removes the superseded chunks' vectors from the
     * 3rd-party store and flips them to 'Deleted'. Either the swap commits or it rolls back;
     * on failure this throws and the caller (persistVectorReferences) logs it and moves on.
     *
     * Provider discipline (server, multi-user): the RunView read, the entity objects, and the
     * transaction ALL go through `this.ProviderToUse` — the connection allocated to this request.
     * A bare `new RunView()` would run on the process-global provider/connection, outside this
     * transaction and under the wrong user's context.
     */
    private async replaceContentItemChunks(
        contentItemID: string,
        chunks: PersistedChunk[],
        contextUser: UserInfo
    ): Promise<void> {
        const rv = this.ProviderToUse as unknown as IRunViewProvider;

        // Load only the LIVE chunks (not already soft-deleted) — those are the ones being
        // superseded by this re-vectorization. Chunks already marked for deletion are left alone.
        const existing = await rv.RunView<MJContentItemChunkEntity>({
            EntityName: 'MJ: Content Item Chunks',
            ExtraFilter: `ContentItemID='${contentItemID}' AND DeleteStatus IS NULL`,
            ResultType: 'entity_object'
        }, contextUser);
        if (!existing.Success) {
            throw new Error(`failed to load existing chunks for item ${contentItemID}: ${existing.ErrorMessage}`);
        }

        const newRows = await this.buildChunkRows(contentItemID, chunks, contextUser);
        await this.commitChunkReplacement(contentItemID, existing.Results, newRows);
    }

    /**
     * Build (in-memory only — no DB access) the replacement ContentItemChunk rows for an item.
     * These rows are created only after the chunk's vector has been successfully embedded and
     * upserted (see persistVectorReferences), so each row is stamped EmbeddingStatus='Complete'
     * with LastEmbeddedAt=now — mirroring how the parent ContentItem is stamped on a successful
     * embed. TaggingStatus is left at its 'Pending' default (chunks are not tagged individually;
     * tagging happens at the Content Item level) and DeleteStatus is left null (not slated for
     * deletion).
     */
    private async buildChunkRows(
        contentItemID: string,
        chunks: PersistedChunk[],
        contextUser: UserInfo
    ): Promise<MJContentItemChunkEntity[]> {
        const md = this.ProviderToUse;
        const now = new Date();
        const rows: MJContentItemChunkEntity[] = [];
        for (const chunk of chunks) {
            const row = await md.GetEntityObject<MJContentItemChunkEntity>('MJ: Content Item Chunks', contextUser);
            row.NewRecord();
            // Pin the row PK to the id minted up front (chunkID) so the chunk's identity is stable
            // and known before it is written — it is the same value put in the vector metadata's
            // RecordID (Chunk-Identity Contract), so a search hit resolves to this row by id.
            // NewRecord() applies an explicit PK last, so this overrides the auto-generated uuid.
            row.ID = chunk.chunkID;
            // VectorRecordID is the id the vector was actually upserted under (equal to chunkID
            // under 'recordId', a hash under 'hash'). A re-chunk mints fresh ids for its new rows,
            // so a superseded (soft-deleted) chunk and its replacement never share one — which is
            // what makes PurgeDeletedChunks safe.
            row.ContentItemID = contentItemID;
            row.Sequence = chunk.chunkIndex;
            row.Text = chunk.text;
            row.VectorRecordID = chunk.vectorRecordID;
            row.EmbeddingStatus = 'Complete';
            row.LastEmbeddedAt = now;
            rows.push(row);
        }
        return rows;
    }

    /**
     * In one server-side transaction (SQL-only — no third-party calls): SOFT-delete the superseded
     * live chunks (set DeleteStatus='Pending', keeping the rows) and insert the new chunks. Either
     * the whole swap commits or it rolls back.
     *
     * The superseded chunks' vectors are removed from the vector database out-of-band by
     * PurgeDeletedChunks, which batches the remote deletes to each provider's limits — a
     * cross-system delete can't live inside this SQL transaction (it can't be rolled back if the
     * remote store already applied it). Keeping the rows (soft delete) also preserves history and
     * lets the vector purge be retried. There is no unique constraint on (ContentItemID, Sequence),
     * so a superseded chunk and its replacement may share a Sequence until the old one is purged.
     */
    private async commitChunkReplacement(
        contentItemID: string,
        supersededRows: MJContentItemChunkEntity[],
        newRows: MJContentItemChunkEntity[]
    ): Promise<void> {
        const provider = this.ProviderToUse as unknown as DatabaseProviderBase;
        await provider.BeginTransaction();
        let committed = false;
        try {
            // Soft-delete the superseded live chunks, then insert the new ones. Both phases fire
            // in parallel (Promise.all) — this is SQL-only inside the transaction (no third-party
            // call), and MJ's provider serializes transaction queries onto the single connection,
            // so parallel dispatch is safe.
            supersededRows.forEach(row => { row.DeleteStatus = 'Pending'; });
            const softDeleteResults = await Promise.all(supersededRows.map(row => row.Save()));
            const failedSoftDelete = supersededRows.find((_row, i) => !softDeleteResults[i]);
            if (failedSoftDelete) {
                throw new Error(`failed to soft-delete chunk ${failedSoftDelete.ID}: ${failedSoftDelete.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }

            const saveResults = await Promise.all(newRows.map(row => row.Save()));
            const failedSave = newRows.find((_row, i) => !saveResults[i]);
            if (failedSave) {
                throw new Error(`failed to save chunk ${failedSave.Sequence}: ${failedSave.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }

            await provider.CommitTransaction();
            committed = true;
        } catch (e) {
            // Guard the rollback so it can never mask the original error: a commit that throws has
            // already self-rolled-back inside the provider (nulling its transaction, so a second
            // rollback here throws "no active transaction"), and a rollback can fail on its own. The
            // provider clears its transaction state on every path, so this never leaves one open.
            if (!committed) {
                try {
                    await provider.RollbackTransaction();
                } catch (rollbackErr) {
                    const rbMsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
                    LogError(`commitChunkReplacement: rollback failed for item ${contentItemID}: ${rbMsg}`);
                }
            }
            throw e;
        }
    }

    /**
     * Actually remove chunks that have been soft-deleted (DeleteStatus='Pending'): delete their
     * vectors from whatever 3rd-party vector store holds them, then flip the row to 'Deleted' with
     * LastDeletedAt (the SQL row is kept as a tombstone). Bounded per run (maxItems) and per remote
     * call (PURGE_VECTORDB_SUBBATCH) + rate-limited, so a large backlog or a single big re-chunk
     * can't hammer the DB or the vector provider. Meant to run out-of-band from vectorization
     * (on demand or scheduled).
     *
     * Ordering is delete-vector-first, then mark 'Deleted': if the run dies mid-way the chunk stays
     * 'Pending' and is retried next run (at worst a redundant remote delete, which is idempotent for
     * the vector stores we target).
     *
     * @returns counts of chunks purged (vector removed + marked Deleted), failed, and skipped
     *          (no VectorRecordID — marked Deleted directly, nothing to remove remotely).
     */
    public async PurgeDeletedChunks(
        contextUser: UserInfo,
        options?: { maxItems?: number }
    ): Promise<ChunkPurgeStats> {
        await AIEngine.Instance.Config(false, contextUser);
        const maxItems = options?.maxItems && options.maxItems > 0 ? options.maxItems : DEFAULT_PURGE_BATCH_SIZE;
        const stats: ChunkPurgeStats = { purged: 0, failed: 0, skipped: 0 };

        const chunks = await this.loadPendingChunks(contextUser, maxItems);
        if (chunks.length === 0) return stats;

        // Chunks with no vector id have nothing to remove remotely — mark Deleted directly.
        for (const c of chunks.filter(x => !x.VectorRecordID)) {
            if (await this.markChunkDeleted(c)) stats.skipped++; else stats.failed++;
        }

        // Remove the rest from the vector DB (grouped by infrastructure), then mark Deleted.
        const toPurge = chunks.filter(c => !!c.VectorRecordID);
        if (toPurge.length > 0) {
            await this.purgeChunksByInfrastructure(toPurge, contextUser, stats);
        }

        LogStatus(`PurgeDeletedChunks: ${stats.purged} purged, ${stats.skipped} skipped (no vector), ${stats.failed} failed`);
        return stats;
    }

    /** Load soft-deleted chunks awaiting purge (bounded, oldest first). Returns [] on failure. */
    private async loadPendingChunks(contextUser: UserInfo, maxItems: number): Promise<MJContentItemChunkEntity[]> {
        const rv = this.ProviderToUse as unknown as IRunViewProvider;
        const result = await rv.RunView<MJContentItemChunkEntity>({
            EntityName: 'MJ: Content Item Chunks',
            ExtraFilter: `DeleteStatus = 'Pending'`,
            OrderBy: '__mj_CreatedAt ASC',
            MaxRows: maxItems,
            ResultType: 'entity_object'
        }, contextUser);
        if (!result.Success) {
            LogError(`PurgeDeletedChunks: failed to load pending chunks: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results;
    }

    /** Load the parent Content Items for a set of chunks (needed for infra resolution). null on failure. */
    private async loadChunkParentItems(
        chunks: MJContentItemChunkEntity[],
        contextUser: UserInfo
    ): Promise<MJContentItemEntity[] | null> {
        const rv = this.ProviderToUse as unknown as IRunViewProvider;
        const itemIDs = [...new Set(chunks.map(c => NormalizeUUID(c.ContentItemID)))];
        const result = await rv.RunView<MJContentItemEntity>({
            EntityName: 'MJ: Content Items',
            ExtraFilter: `ID IN (${itemIDs.map(id => `'${id}'`).join(',')})`,
            ResultType: 'entity_object'
        }, contextUser);
        if (!result.Success) {
            LogError(`loadChunkParentItems: failed to load parent items for chunks: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results;
    }

    /** Group chunks by their parent item's vector infrastructure and purge each group's vectors. */
    private async purgeChunksByInfrastructure(
        toPurge: MJContentItemChunkEntity[],
        contextUser: UserInfo,
        stats: ChunkPurgeStats
    ): Promise<void> {
        const items = await this.loadChunkParentItems(toPurge, contextUser);
        if (!items) { stats.failed += toPurge.length; return; }

        const itemById = new Map(items.map(i => [NormalizeUUID(i.ID), i]));
        const infrastructure = new ContentVectorInfrastructure(this.ProviderToUse, contextUser, { AllowFirstIndexFallback: true });
        const itemGroups = await infrastructure.GroupByInfrastructure(items);

        for (const [groupKey, groupItems] of itemGroups) {
            const groupItemIDs = new Set(groupItems.map(i => NormalizeUUID(i.ID)));
            let groupChunks = toPurge.filter(c => groupItemIDs.has(NormalizeUUID(c.ContentItemID)));
            if (groupChunks.length === 0) continue;

            let infra: ResolvedVectorInfrastructure;
            try {
                infra = await infrastructure.Resolve(groupKey);
            } catch (e) {
                LogError(`PurgeDeletedChunks: infrastructure resolve failed for group ${groupKey}: ${e instanceof Error ? e.message : String(e)}`);
                stats.failed += groupChunks.length;
                continue;
            }

            // Deletes carry the same per-record directives as the original upsert so drivers can
            // route each removal correctly. Chunks whose parent the driver rejects can't have
            // their vectors targeted — they are left 'Pending' (counted failed) and retried after
            // the data is fixed; the rest of the group proceeds.
            const { Directives: directives, Rejected: rejected } = await infrastructure.BuildDirectives(groupItems, infra);
            if (rejected.length > 0) {
                const rejectedIDs = new Set(rejected.map(r => NormalizeUUID(r.Item.ID)));
                const blocked = groupChunks.filter(c => rejectedIDs.has(NormalizeUUID(c.ContentItemID)));
                LogError(`PurgeDeletedChunks: ${blocked.length} chunk(s) rejected by the vector provider's directive policy — cannot target their vectors, left Pending`);
                stats.failed += blocked.length;
                groupChunks = groupChunks.filter(c => !rejectedIDs.has(NormalizeUUID(c.ContentItemID)));
                if (groupChunks.length === 0) continue;
            }

            await this.purgeChunkGroup(groupChunks, infra, stats, itemById, directives);
        }
    }

    /** Delete one infra group's chunk vectors in bounded sub-batches, then mark the rows Deleted. */
    private async purgeChunkGroup(
        groupChunks: MJContentItemChunkEntity[],
        infra: ResolvedVectorInfrastructure,
        stats: ChunkPurgeStats,
        itemById: Map<string, MJContentItemEntity>,
        directivesByItem?: Map<string, Record<string, unknown> | undefined>
    ): Promise<void> {
        for (let i = 0; i < groupChunks.length; i += PURGE_VECTORDB_SUBBATCH) {
            const batch = groupChunks.slice(i, i + PURGE_VECTORDB_SUBBATCH);
            if (await this.deleteChunkVectors(batch, infra, itemById, directivesByItem)) {
                for (const c of batch) {
                    if (await this.markChunkDeleted(c)) stats.purged++; else stats.failed++;
                }
            } else {
                stats.failed += batch.length; // left 'Pending' → retried on the next run
            }
        }
    }

    /** Remove a batch of chunk vectors from the vector DB (rate-limited). Returns whether it succeeded. */
    private async deleteChunkVectors(
        batch: MJContentItemChunkEntity[],
        infra: ResolvedVectorInfrastructure,
        itemById: Map<string, MJContentItemEntity>,
        directivesByItem?: Map<string, Record<string, unknown> | undefined>
    ): Promise<boolean> {
        // Deletes carry the same per-record provider directives as the original upsert so
        // drivers can route each removal correctly (e.g. to the partition the vector lives in).
        const records: VectorRecord[] = batch.map(c => {
            const record: VectorRecord = { id: c.VectorRecordID as string, values: [], metadata: {} };
            const item = itemById.get(NormalizeUUID(c.ContentItemID));
            const directives = directivesByItem
                ? directivesByItem.get(NormalizeUUID(c.ContentItemID))
                : (item ? BuildProviderDirectives(item, infra) : undefined);
            if (directives) {
                record.providerTemporaryDirectives = directives;
            }
            return record;
        });
        await this.VectorDBRateLimiter.Acquire();
        try {
            const resp = await infra.vectorDB.DeleteRecords(records, infra.indexName, infra.providerConfig);
            if (!resp.success) LogError(`PurgeDeletedChunks: DeleteRecords failed for index ${infra.indexName}: ${resp.message}`);
            return resp.success;
        } catch (e) {
            LogError(`PurgeDeletedChunks: DeleteRecords threw for index ${infra.indexName}: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }

    /** Mark a soft-deleted chunk as fully Deleted (its vector already removed). Best-effort save. */
    private async markChunkDeleted(chunk: MJContentItemChunkEntity): Promise<boolean> {
        chunk.DeleteStatus = 'Deleted';
        chunk.LastDeletedAt = new Date();
        const saved = await chunk.Save();
        if (!saved) {
            LogError(`PurgeDeletedChunks: failed to mark chunk ${chunk.ID} Deleted: ${chunk.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return saved;
    }

    /**
     * (Re)embed persisted ContentItemChunk rows that are awaiting embedding
     * (EmbeddingStatus='Pending' AND DeleteStatus IS NULL): embed each chunk's stored `.Text`,
     * upsert the vector under the chunk's identity (see the Chunk-Identity Contract), then stamp
     * the row EmbeddingStatus='Complete' with its VectorRecordID + LastEmbeddedAt. This is the
     * migration path (backfill vectors for chunk rows created without them) and the recovery path
     * (a chunk whose embed previously failed stays 'Pending' and is retried).
     *
     * Bounded per run by `maxItems` and per embed/upsert call by CHUNK_EMBED_SUBBATCH + rate-limited,
     * so a large backlog drains over several runs rather than hammering the API or vector store.
     * Meant to run out-of-band from live vectorization (on demand or scheduled). Best-effort per
     * chunk — a transient failure leaves the row 'Pending' (retried next run) and never aborts the
     * pass. Exception: a chunk whose record the vector driver REJECTS (a throw from
     * `BuildProviderDirectives`, e.g. a mandatory routing value is missing) is marked 'Failed'
     * (see {@link markChunkEmbedFailed}) so it cannot starve the oldest-first pending queue.
     *
     * @returns counts of chunks embedded, failed, and skipped (empty text / missing parent).
     */
    public async EmbedPendingChunks(
        contextUser: UserInfo,
        options?: { maxItems?: number }
    ): Promise<ChunkEmbedStats> {
        await AIEngine.Instance.Config(false, contextUser);
        const maxItems = options?.maxItems && options.maxItems > 0 ? options.maxItems : DEFAULT_CHUNK_EMBED_BATCH_SIZE;
        const stats: ChunkEmbedStats = { embedded: 0, failed: 0, skipped: 0 };

        const chunks = await this.loadPendingEmbeddingChunks(contextUser, maxItems);
        if (chunks.length === 0) return stats;

        await this.embedChunksByInfrastructure(chunks, contextUser, stats);

        LogStatus(`EmbedPendingChunks: ${stats.embedded} embedded, ${stats.skipped} skipped (empty text/no parent), ${stats.failed} failed`);
        return stats;
    }

    /** Load chunks awaiting embedding (bounded, oldest first). Returns [] on failure. */
    private async loadPendingEmbeddingChunks(contextUser: UserInfo, maxItems: number): Promise<MJContentItemChunkEntity[]> {
        const rv = this.ProviderToUse as unknown as IRunViewProvider;
        const result = await rv.RunView<MJContentItemChunkEntity>({
            EntityName: 'MJ: Content Item Chunks',
            ExtraFilter: `EmbeddingStatus = 'Pending' AND DeleteStatus IS NULL`,
            OrderBy: '__mj_CreatedAt ASC',
            MaxRows: maxItems,
            ResultType: 'entity_object'
        }, contextUser);
        if (!result.Success) {
            LogError(`EmbedPendingChunks: failed to load pending chunks: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results;
    }

    /**
     * Group pending chunks by their parent item's vector infrastructure (embedding model + index)
     * and embed each group. Mirrors purgeChunksByInfrastructure so the two share the same
     * chunk → parent-item → infrastructure resolution.
     */
    private async embedChunksByInfrastructure(
        chunks: MJContentItemChunkEntity[],
        contextUser: UserInfo,
        stats: ChunkEmbedStats
    ): Promise<void> {
        const items = await this.loadChunkParentItems(chunks, contextUser);
        if (!items) { stats.failed += chunks.length; return; }

        const itemById = new Map(items.map(i => [NormalizeUUID(i.ID), i]));
        const infrastructure = new ContentVectorInfrastructure(this.ProviderToUse, contextUser, { AllowFirstIndexFallback: true });
        const itemGroups = await infrastructure.GroupByInfrastructure(items);
        const tagMap = await LoadContentItemTags(items.map(i => i.ID), this.ProviderToUse, contextUser);

        for (const [groupKey, groupItems] of itemGroups) {
            const groupItemIDs = new Set(groupItems.map(i => NormalizeUUID(i.ID)));
            let groupChunks = chunks.filter(c => groupItemIDs.has(NormalizeUUID(c.ContentItemID)));
            if (groupChunks.length === 0) continue;

            let infra: ResolvedVectorInfrastructure;
            try {
                infra = await infrastructure.Resolve(groupKey);
            } catch (e) {
                LogError(`EmbedPendingChunks: infrastructure resolve failed for group ${groupKey}: ${e instanceof Error ? e.message : String(e)}`);
                stats.failed += groupChunks.length;
                continue;
            }

            // Provider directives are built per parent item BEFORE any embedding spend. Chunks
            // whose parent the driver rejects (see ContentVectorInfrastructure.BuildDirectives) are marked Failed
            // individually; the rest of the group proceeds. Recovery: fix the data, reset the
            // rows to Pending.
            const { Directives: directives, Rejected: rejected } = await infrastructure.BuildDirectives(groupItems, infra);
            if (rejected.length > 0) {
                const rejectedIDs = new Set(rejected.map(r => NormalizeUUID(r.Item.ID)));
                const blocked = groupChunks.filter(c => rejectedIDs.has(NormalizeUUID(c.ContentItemID)));
                LogError(`EmbedPendingChunks: ${blocked.length} chunk(s) rejected by the vector provider's directive policy — marked Failed, remaining chunks proceed`);
                for (const c of blocked) {
                    await this.markChunkEmbedFailed(c);
                    stats.failed++;
                }
                groupChunks = groupChunks.filter(c => !rejectedIDs.has(NormalizeUUID(c.ContentItemID)));
                if (groupChunks.length === 0) continue;
            }

            await this.embedChunkGroup(groupChunks, itemById, infra, tagMap, contextUser, stats, directives);
        }
    }

    /**
     * Mark a pending chunk's embed as Failed — used when the vector provider rejects the record's
     * directives. Deliberately NOT left 'Pending': the pending queue drains oldest-first, so rows
     * that can never succeed without a data fix would permanently occupy the front of every future
     * run's MaxItems window and starve resolvable chunks behind them. Best-effort save.
     */
    private async markChunkEmbedFailed(chunk: MJContentItemChunkEntity): Promise<boolean> {
        chunk.EmbeddingStatus = 'Failed';
        const saved = await chunk.Save();
        if (!saved) {
            LogError(`EmbedPendingChunks: failed to mark chunk ${chunk.ID} Failed: ${chunk.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return saved;
    }

    /** Embed + upsert one infra group's chunks in bounded sub-batches, then stamp each row Complete. */
    private async embedChunkGroup(
        groupChunks: MJContentItemChunkEntity[],
        itemById: Map<string, MJContentItemEntity>,
        infra: ResolvedVectorInfrastructure,
        tagMap: Map<string, string[]>,
        contextUser: UserInfo,
        stats: ChunkEmbedStats,
        directivesByItem?: Map<string, Record<string, unknown> | undefined>
    ): Promise<void> {
        for (let i = 0; i < groupChunks.length; i += CHUNK_EMBED_SUBBATCH) {
            const batch = groupChunks.slice(i, i + CHUNK_EMBED_SUBBATCH);
            const embeddable = this.toEmbeddableChunks(batch, itemById, stats);
            if (embeddable.length === 0) continue;
            await this.embedAndPersistChunkBatch(embeddable, infra, tagMap, contextUser, stats, directivesByItem);
        }
    }

    /**
     * Pair each persisted chunk with its parent item as an {@link EmbeddingChunk} (chunkID = the
     * chunk's existing PK, so the vector id + metadata identity match the live write path). Chunks
     * with empty text or a missing parent are counted as skipped and dropped.
     */
    private toEmbeddableChunks(
        batch: MJContentItemChunkEntity[],
        itemById: Map<string, MJContentItemEntity>,
        stats: ChunkEmbedStats
    ): { row: MJContentItemChunkEntity; chunk: EmbeddingChunk }[] {
        const embeddable: { row: MJContentItemChunkEntity; chunk: EmbeddingChunk }[] = [];
        for (const row of batch) {
            const item = itemById.get(NormalizeUUID(row.ContentItemID));
            const text = row.Text ?? '';
            if (!item || text.trim().length === 0) {
                stats.skipped++;
                continue;
            }
            embeddable.push({ row, chunk: { item, chunkIndex: row.Sequence, text, chunkID: row.ID } });
        }
        return embeddable;
    }

    /** Embed one sub-batch's texts, upsert the vectors, and stamp each surviving chunk row Complete. */
    private async embedAndPersistChunkBatch(
        embeddable: { row: MJContentItemChunkEntity; chunk: EmbeddingChunk }[],
        infra: ResolvedVectorInfrastructure,
        tagMap: Map<string, string[]>,
        contextUser: UserInfo,
        stats: ChunkEmbedStats,
        directivesByItem?: Map<string, Record<string, unknown> | undefined>
    ): Promise<void> {
        const texts = embeddable.map(e => e.chunk.text);
        await this.EmbeddingRateLimiter.Acquire(texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0));

        const runResult = await new AIEmbeddingRunner().RunEmbedding({
            Texts: texts,
            ModelID: infra.embeddingModelID,
            PromptID: this.resolveEmbeddingPromptID(),
            ContextUser: contextUser,
            Description: `Pending content-chunk embedding: ${embeddable.length} chunks`,
            Dimensions: infra.dimensions,
        });
        if (!runResult.Success || runResult.Vectors.length !== embeddable.length) {
            LogError(`EmbedPendingChunks: embedding returned ${runResult.Vectors.length} vectors for ${embeddable.length} chunks — ${runResult.ErrorMessage ?? 'unknown error'}`);
            stats.failed += embeddable.length;
            return;
        }

        const contentItemEntity = this.ProviderToUse.EntityByName('MJ: Content Items');
        const records: VectorRecord[] = embeddable.map((e, idx) => {
            const config = this.resolveItemVectorStorageConfig(e.chunk.item);
            const record: VectorRecord = {
                id: this.resolveChunkVectorID(e.chunk, config, false),
                values: runResult.Vectors[idx],
                metadata: this.buildVectorMetadata(e.chunk, false, tagMap.get(NormalizeUUID(e.chunk.item.ID)), config, contentItemEntity),
            };
            const directives = directivesByItem
                ? directivesByItem.get(NormalizeUUID(e.chunk.item.ID))
                : BuildProviderDirectives(e.chunk.item, infra);
            if (directives) {
                record.providerTemporaryDirectives = directives;
            }
            return record;
        });

        if (!(await UpsertVectorRecords(records, infra, this.VectorDBRateLimiter)).success) {
            stats.failed += embeddable.length; // left 'Pending' → retried on the next run
            return;
        }

        for (let idx = 0; idx < embeddable.length; idx++) {
            if (await this.markChunkEmbedded(embeddable[idx].row, String(records[idx].id))) stats.embedded++; else stats.failed++;
        }
    }

    /** Stamp a chunk row as embedded: record its vector id, flip to Complete, timestamp. Best-effort. */
    private async markChunkEmbedded(chunk: MJContentItemChunkEntity, vectorRecordID: string): Promise<boolean> {
        chunk.VectorRecordID = vectorRecordID;
        chunk.EmbeddingStatus = 'Complete';
        chunk.LastEmbeddedAt = new Date();
        const saved = await chunk.Save();
        if (!saved) {
            LogError(`EmbedPendingChunks: failed to mark chunk ${chunk.ID} embedded: ${chunk.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return saved;
    }

    /**
     * Resolve the vector-storage behavior for a content item using the cascade:
     * ContentSource override -> ContentType default -> hardcoded default. Reads the strongly-typed
     * ConfigurationObject accessors emitted by CodeGen for each entity's Configuration JSONType.
     */
    protected resolveItemVectorStorageConfig(item: MJContentItemEntity): ResolvedVectorStorageConfig {
        return ResolveContentVectorStorageConfig(
            this.khEngine.GetContentSourceByID(item.ContentSourceID),
            this.khEngine.GetContentTypeByID(item.ContentTypeID),
        );
    }

    /**
     * True when this item's single embedding vector is stored at the ContentItem level (on
     * ContentItem.VectorRecordID) rather than in a ContentItemChunk row. Only the 'mixed'
     * storage mode does this, and only when the item produced exactly one chunk; 'alwaysChunk'
     * always writes a chunk row (item-level id stays null). buildVectorRecords and
     * persistVectorReferences share this predicate so the vector id and its persistence agree.
     */
    protected isItemLevelVector(config: ResolvedVectorStorageConfig, chunkCount: number): boolean {
        return config.chunkTextStorage === 'mixed' && chunkCount === 1;
    }

    /** Build the text that gets embedded: Title + Description + full Text */
    /**
     * Max tokens per embedding chunk. text-embedding-3-small supports 8,191 tokens.
     * We use a conservative limit to avoid hitting the boundary.
     */
    private static readonly MAX_EMBEDDING_TOKENS = 7500;

    /**
     * Build the text to embed for a content item, and chunk it if it exceeds
     * the embedding model's token limit. Returns one or more text chunks.
     */
    private async buildEmbeddingChunks(item: MJContentItemEntity): Promise<string[]> {
        const parts: string[] = [];
        if (item.Name) parts.push(item.Name);
        if (item.Description) parts.push(item.Description);
        if (item.Text) parts.push(item.Text);
        const full = parts.join('\n');

        // Rough char estimate: 1 token ≈ 4 chars
        const charLimit = AutotagBaseEngine.MAX_EMBEDDING_TOKENS * 4;

        if (full.length <= charLimit) {
            return [full];
        }

        LogStatus(`[Autotag] Chunking embedding text for "${item.Name}" (${full.length} chars, ~${Math.ceil(full.length / 4)} tokens)`);
        const segments = await this.segmentTextForChunking(full, {
            MaxSegmentTokens: AutotagBaseEngine.MAX_EMBEDDING_TOKENS,
            OverlapTokens: 100,
            TextStrategy: 'sentence',
        });
        if (segments) {
            LogStatus(`[Autotag] Split into ${segments.length} chunks for embedding`);
            return segments;
        }

        // Fallback: simple character-based splitting
        const result: string[] = [];
        for (let i = 0; i < full.length; i += charLimit) {
            result.push(full.substring(i, i + charLimit));
        }
        return result;
    }

    /**
     * Build the metadata object stored alongside the vector. Mirrors the entity-vectorization
     * pipeline's decomposed shape ({@link addContentSystemMetadata}/{@link addCuratedMetadata}/
     * {@link addStrategyDisplayFields}/{@link addEntityIconMetadata}/{@link addUpdatedAtMetadata}/
     * {@link addTagsMetadata}) so each concern can be overridden independently.
     *
     * `VectorMetadata.FieldStrategy` selects the field set:
     * - unset ⇒ the curated content default (source ids + Title / Description / URL), preserving
     *   historical behavior.
     * - 'all' / 'include' / 'exclude' / 'explicit' ⇒ ContentItem fields resolved by
     *   {@link getContentDisplayFields}, with per-field StoreAs coercion + truncation.
     *
     * The identity keys are chunk-aware (see the Chunk-Identity Contract); under 'explicit' only
     * `Entity` is kept so content search results stay labeled (record id is recovered from the
     * vector id under the default 'recordId' strategy) — unless the source declares its vector entity,
     * in which case `Entity` gives way to `ContentSourceID` and search resolves the name from the
     * declaration. See {@link canOmitEntityMetadataKey} for the conditions and why each one exists.
     */
    protected buildVectorMetadata(
        chunk: EmbeddingChunk,
        isItemLevel: boolean,
        tags: string[] | undefined,
        config: ResolvedVectorStorageConfig,
        contentItemEntity: EntityInfo | undefined
    ): Record<string, string | number | boolean | string[]> {
        return this.vectorMetadataBuilder.Build(
            { Item: chunk.item, IsItemLevel: isItemLevel, ChunkID: chunk.chunkID, ChunkIndex: chunk.chunkIndex, Text: chunk.text },
            tags,
            config,
            contentItemEntity,
        );
    }

    /**
     * The shared builder, one per engine so a refused vector-entity declaration is reported once
     * rather than per vector. Bound to this engine's provider.
     */
    private get vectorMetadataBuilder(): ContentVectorMetadataBuilder {
        this._vectorMetadataBuilder ??= new ContentVectorMetadataBuilder(this.ProviderToUse);
        return this._vectorMetadataBuilder;
    }
    private _vectorMetadataBuilder?: ContentVectorMetadataBuilder;

    // ---- Content Deduplication ----

    /**
     * Attempts to recompute tag co-occurrence data after the LLM tagging pipeline completes.
     * Uses dynamic import to avoid a hard dependency on the tag-engine package.
     * If TagCoOccurrenceEngine is not available or fails, it logs a warning and continues.
     */
    private async recomputeCoOccurrenceIfAvailable(contextUser: UserInfo): Promise<void> {
        try {
            // Dynamic check: TagCoOccurrenceEngine is registered via class factory.
            // The dynamic import here is the established pattern for the tag-engine
            // bridge — see CLAUDE.md §"acceptable reasons for dynamic import" #5.
            const tagEngineModule = await import('@memberjunction/tag-engine');
            const { TagCoOccurrenceEngine, TagHealthJob, DEFAULT_TAG_HEALTH_THRESHOLDS } = tagEngineModule;
            const engine = TagCoOccurrenceEngine.Instance;
            if (engine && typeof engine.RecomputeCoOccurrence === 'function') {
                LogStatus('[Autotag] Recomputing tag co-occurrence after pipeline completion...');
                const result = await engine.RecomputeCoOccurrence(contextUser);
                LogStatus(`[Autotag] Co-occurrence recompute complete: ${result.PairsUpdated} pairs updated, ${result.PairsDeleted} deleted`);
            }

            // Tag Health emitters — gated by env flag so deployments can opt in.
            // Set MJ_AUTOTAG_RUN_TAG_HEALTH=1 to enable.
            if (process.env.MJ_AUTOTAG_RUN_TAG_HEALTH === '1' && TagHealthJob && DEFAULT_TAG_HEALTH_THRESHOLDS) {
                LogStatus('[Autotag] Running Tag Health emitters (MJ_AUTOTAG_RUN_TAG_HEALTH=1)...');
                const summary = await TagHealthJob.Instance.Run(DEFAULT_TAG_HEALTH_THRESHOLDS, contextUser);
                LogStatus(`[Autotag] Tag Health: ${summary.mergeCount} merge / ${summary.lowUsageCount} low-usage / ${summary.wideNodeCount} wide-node suggestions in ${summary.durationMs}ms.`);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogStatus(`[Autotag] Co-occurrence / health recompute skipped: ${msg}`);
        }
    }

    /**
     * Detects duplicate content items by matching the given item's checksum against
     * other content items from **different** content sources. When an exact checksum
     * match is found, a {@link MJContentItemDuplicateEntity} record is created with
     * `DetectionMethod = 'Checksum'` and `SimilarityScore = 1.0`.
     *
     * Duplicate pairs are stored in canonical order (lower ID = ContentItemAID) to
     * prevent mirror duplicates. If a duplicate pair already exists for the same
     * detection method, no new record is created.
     *
     * @param contentItem - The content item whose checksum should be checked for duplicates.
     *                      Must already be saved (i.e., have a valid ID and Checksum).
     * @param contextUser - The authenticated user context for data access and audit.
     * @returns A promise that resolves when detection is complete. Does not throw on
     *          failure — errors are logged and swallowed to avoid disrupting the pipeline.
     */
    public async DetectChecksumDuplicates(contentItem: MJContentItemEntity, contextUser: UserInfo): Promise<void> {
        if (!contentItem.Checksum) {
            return; // No checksum to compare
        }

        try {
            const matches = await this.findItemsByChecksum(contentItem.Checksum, contentItem.ContentSourceID, contentItem.ID, contextUser);
            for (const match of matches) {
                await this.createDuplicateRecordIfNotExists(contentItem.ID, match.ID, 1.0, 'Checksum', contextUser);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[Dedup] Checksum detection failed for item ${contentItem.ID}: ${msg}`);
        }
    }

    /**
     * Detects duplicate content items by matching the given item's title (Name field)
     * against other content items from **different** content sources. When an exact
     * title match is found, a {@link MJContentItemDuplicateEntity} record is created
     * with `DetectionMethod = 'Title'` and `SimilarityScore = 1.0`.
     *
     * Duplicate pairs are stored in canonical order (lower ID = ContentItemAID) to
     * prevent mirror duplicates. If a duplicate pair already exists for the same
     * detection method, no new record is created.
     *
     * @param contentItem - The content item whose title should be checked for duplicates.
     *                      Must already be saved (i.e., have a valid ID and Name).
     * @param contextUser - The authenticated user context for data access and audit.
     * @returns A promise that resolves when detection is complete. Does not throw on
     *          failure — errors are logged and swallowed to avoid disrupting the pipeline.
     */
    public async DetectTitleDuplicates(contentItem: MJContentItemEntity, contextUser: UserInfo): Promise<void> {
        if (!contentItem.Name || contentItem.Name.trim().length === 0) {
            return; // No title to compare
        }

        try {
            const matches = await this.findItemsByTitle(contentItem.Name, contentItem.ContentSourceID, contentItem.ID, contextUser);
            for (const match of matches) {
                await this.createDuplicateRecordIfNotExists(contentItem.ID, match.ID, 1.0, 'Title', contextUser);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[Dedup] Title detection failed for item ${contentItem.ID}: ${msg}`);
        }
    }

    /**
     * Runs all non-vector deduplication checks (checksum and title) for a content item.
     * This is a convenience method intended to be called after saving/updating a content item.
     *
     * @param contentItem - The saved content item to check for duplicates.
     * @param contextUser - The authenticated user context for data access and audit.
     */
    public async DetectDuplicates(contentItem: MJContentItemEntity, contextUser: UserInfo): Promise<void> {
        await Promise.all([
            this.DetectChecksumDuplicates(contentItem, contextUser),
            this.DetectTitleDuplicates(contentItem, contextUser),
        ]);
    }

    /**
     * Detects near-duplicate content items by querying the vector index for items
     * with high cosine similarity (> 0.95 threshold). Only creates duplicate records
     * for matches from DIFFERENT content sources to avoid self-matches.
     *
     * This is expensive so it only checks the top 3 most similar results.
     * Controlled by the `enableVectorDedup` flag.
     *
     * @param contentItem - The content item to check (must have text and be vectorized).
     * @param contextUser - The authenticated user context for data access and audit.
     * @param enableVectorDedup - Whether to run vector-based dedup (default false).
     */
    public async DetectVectorDuplicates(
        contentItem: MJContentItemEntity,
        contextUser: UserInfo,
        enableVectorDedup = false
    ): Promise<void> {
        if (!enableVectorDedup) return;
        if (!contentItem.Text || contentItem.Text.trim().length === 0) return;

        try {
            await this.performVectorDedupCheck(contentItem, contextUser);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[Dedup] Vector detection failed for item ${contentItem.ID}: ${msg}`);
        }
    }

    /**
     * Internal implementation of vector-based dedup. Resolves the vector infrastructure
     * for the item, embeds its text, queries for similar vectors, and creates duplicate
     * records for high-similarity matches from different sources.
     */
    private async performVectorDedupCheck(
        contentItem: MJContentItemEntity,
        contextUser: UserInfo
    ): Promise<void> {
        // Need AIEngine loaded to resolve embedding model
        await AIEngine.Instance.Config(false, contextUser);

        // Resolve infrastructure for this item
        const infrastructure = new ContentVectorInfrastructure(this.ProviderToUse, contextUser, { AllowFirstIndexFallback: true });
        const groups = await infrastructure.GroupByInfrastructure([contentItem]);
        if (groups.size === 0) {
            LogStatus(`[Dedup] No vector infrastructure found for item ${contentItem.ID}, skipping vector dedup`);
            return;
        }

        const [groupKey] = groups.entries().next().value as [string, MJContentItemEntity[]];
        const infra = await infrastructure.Resolve(groupKey);

        // Embed the item's text
        const text = contentItem.Text.trim();
        const truncated = text.length > 8000 ? text.substring(0, 8000) : text;

        await this.EmbeddingRateLimiter.Acquire(Math.ceil(truncated.length / 4));

        const embeddingRunner = new AIEmbeddingRunner();
        const embeddingPromptID = this.resolveEmbeddingPromptID();
        const runResult = await embeddingRunner.RunEmbedding({
            ModelID: infra.embeddingModelID,
            Texts: [truncated],
            PromptID: embeddingPromptID ?? undefined,
            ContextUser: contextUser,
            // Must match the index's dimensions so the query vector is comparable to stored vectors.
            Dimensions: infra.dimensions,
        });

        if (!runResult?.Vectors || runResult.Vectors.length === 0) {
            LogStatus(`[Dedup] Embedding failed for item ${contentItem.ID}, skipping vector dedup`);
            return;
        }

        const queryVector = runResult.Vectors[0];

        // Query vector DB for top 4 most similar (top 3 useful + 1 for self-match)
        const queryResponse = await infra.vectorDB.QueryIndex({
            vector: queryVector,
            topK: 4,
            includeMetadata: true,
        });

        const responseData = queryResponse as BaseResponse;
        if (!responseData.success || !responseData.data) return;

        // The data property contains matches (QueryResponse shape)
        const matches = (responseData.data as { matches?: Array<{ id?: string; score?: number; metadata?: Record<string, unknown> }> }).matches;
        if (!matches || matches.length === 0) return;

        // Filter: different source, similarity > 0.95, not self
        const VECTOR_DEDUP_THRESHOLD = 0.95;
        let matchCount = 0;

        for (const match of matches) {
            if (matchCount >= 3) break; // Only check top 3

            const matchScore = match.score ?? 0;
            if (matchScore < VECTOR_DEDUP_THRESHOLD) continue;

            // Extract content item ID from vector metadata
            const matchItemID = match.metadata?.['contentItemID'] as string | undefined;
            if (!matchItemID || UUIDsEqual(matchItemID, contentItem.ID)) continue;

            // Check if the match is from a different source
            const isDifferentSource = await this.isFromDifferentSource(matchItemID, contentItem.ContentSourceID, contextUser);
            if (!isDifferentSource) continue;

            await this.createDuplicateRecordIfNotExists(contentItem.ID, matchItemID, matchScore, 'Vector', contextUser);
            matchCount++;
        }

        if (matchCount > 0) {
            LogStatus(`[Dedup] Vector dedup found ${matchCount} near-duplicate(s) for item ${contentItem.ID}`);
        }
    }

    /**
     * Check if a content item belongs to a different source than the given sourceID.
     */
    private async isFromDifferentSource(itemID: string, excludeSourceID: string, contextUser: UserInfo): Promise<boolean> {
        const rv = new RunView();
        const result = await rv.RunView<{ ContentSourceID: string }>({
            EntityName: 'MJ: Content Items',
            Fields: ['ContentSourceID'],
            ExtraFilter: `ID = '${itemID}'`,
            ResultType: 'simple',
            MaxRows: 1,
        }, contextUser);

        if (!result.Success || result.Results.length === 0) return false;
        return result.Results[0].ContentSourceID !== excludeSourceID;
    }

    /**
     * Resolves a duplicate record by updating its Status and Resolution fields.
     *
     * @param duplicateID - The ID of the ContentItemDuplicate record.
     * @param resolution - The resolution choice: 'KeepA', 'KeepB', 'NotDuplicate'.
     * @param contextUser - The authenticated user context.
     */
    public async ResolveContentDuplicate(
        duplicateID: string,
        resolution: 'KeepA' | 'KeepB' | 'NotDuplicate',
        contextUser: UserInfo
    ): Promise<boolean> {
        try {
            const md = this.ProviderToUse;
            const duplicate = await md.GetEntityObject<MJContentItemDuplicateEntity>('MJ: Content Item Duplicates', contextUser);
            const loaded = await duplicate.Load(duplicateID);
            if (!loaded) {
                LogError(`[Dedup] Could not load duplicate record ${duplicateID} for resolution`);
                return false;
            }

            this.applyDuplicateResolution(duplicate, resolution);

            const saved = await duplicate.Save();
            if (!saved) {
                LogError(`[Dedup] Failed to save resolution for duplicate ${duplicateID}: ${duplicate.LatestResult?.Message ?? 'Unknown error'}`);
                return false;
            }

            LogStatus(`[Dedup] Resolved duplicate ${duplicateID}: ${resolution}`);
            return true;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[Dedup] Error resolving duplicate ${duplicateID}: ${msg}`);
            return false;
        }
    }

    /**
     * Applies the resolution to a duplicate record by setting the Status and Resolution fields.
     */
    private applyDuplicateResolution(
        duplicate: MJContentItemDuplicateEntity,
        resolution: 'KeepA' | 'KeepB' | 'NotDuplicate'
    ): void {
        if (resolution === 'NotDuplicate') {
            duplicate.Status = 'Dismissed';
            duplicate.Resolution = 'NotDuplicate';
        } else {
            // KeepA or KeepB — mark as Merged
            duplicate.Status = 'Merged';
            duplicate.Resolution = resolution;
        }
    }

    /**
     * Finds content items with the same checksum from different content sources.
     *
     * @param checksum - The SHA-256 checksum to search for.
     * @param excludeSourceID - The content source ID to exclude (the item's own source).
     * @param excludeItemID - The content item ID to exclude (the item itself).
     * @param contextUser - The authenticated user context.
     * @returns An array of matching content items (simple objects with ID field).
     */
    private async findItemsByChecksum(
        checksum: string,
        excludeSourceID: string,
        excludeItemID: string,
        contextUser: UserInfo
    ): Promise<{ ID: string }[]> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Content Items',
            Fields: ['ID'],
            ExtraFilter: `Checksum = '${checksum.replace(/'/g, "''")}' AND ContentSourceID <> '${excludeSourceID}' AND ID <> '${excludeItemID}'`,
            ResultType: 'simple'
        }, contextUser);

        if (!result.Success) {
            LogError(`[Dedup] RunView failed for checksum lookup: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results;
    }

    /**
     * Finds content items with the same title (Name) from different content sources.
     *
     * @param title - The title to search for (exact match).
     * @param excludeSourceID - The content source ID to exclude (the item's own source).
     * @param excludeItemID - The content item ID to exclude (the item itself).
     * @param contextUser - The authenticated user context.
     * @returns An array of matching content items (simple objects with ID field).
     */
    private async findItemsByTitle(
        title: string,
        excludeSourceID: string,
        excludeItemID: string,
        contextUser: UserInfo
    ): Promise<{ ID: string }[]> {
        const rv = new RunView();
        const escapedTitle = title.replace(/'/g, "''");
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Content Items',
            Fields: ['ID'],
            ExtraFilter: `Name = '${escapedTitle}' AND ContentSourceID <> '${excludeSourceID}' AND ID <> '${excludeItemID}'`,
            ResultType: 'simple'
        }, contextUser);

        if (!result.Success) {
            LogError(`[Dedup] RunView failed for title lookup: ${result.ErrorMessage}`);
            return [];
        }
        return result.Results;
    }

    /**
     * Creates a {@link MJContentItemDuplicateEntity} record for a detected duplicate pair,
     * but only if one does not already exist for the same pair and detection method.
     *
     * IDs are stored in canonical order: the lexicographically smaller ID is always
     * ContentItemAID to prevent mirror duplicates (A,B) vs (B,A).
     *
     * @param itemAID - One of the duplicate item IDs.
     * @param itemBID - The other duplicate item ID.
     * @param similarityScore - The similarity score (0.0 to 1.0).
     * @param detectionMethod - How the duplicate was detected.
     * @param contextUser - The authenticated user context.
     */
    private async createDuplicateRecordIfNotExists(
        itemAID: string,
        itemBID: string,
        similarityScore: number,
        detectionMethod: 'Checksum' | 'Title' | 'URL' | 'Vector',
        contextUser: UserInfo
    ): Promise<void> {
        // Canonical ordering: lower normalized ID = A
        const normalizedA = NormalizeUUID(itemAID);
        const normalizedB = NormalizeUUID(itemBID);
        const [canonicalAID, canonicalBID] = normalizedA < normalizedB
            ? [itemAID, itemBID]
            : [itemBID, itemAID];

        // Check if this pair already exists for the same detection method
        const exists = await this.duplicatePairExists(canonicalAID, canonicalBID, detectionMethod, contextUser);
        if (exists) {
            return;
        }

        const md = this.ProviderToUse;
        const duplicate = await md.GetEntityObject<MJContentItemDuplicateEntity>('MJ: Content Item Duplicates', contextUser);
        duplicate.NewRecord();
        duplicate.ContentItemAID = canonicalAID;
        duplicate.ContentItemBID = canonicalBID;
        duplicate.SimilarityScore = similarityScore;
        duplicate.DetectionMethod = detectionMethod;
        duplicate.Status = 'Pending';

        const saved = await duplicate.Save();
        if (!saved) {
            LogError(`[Dedup] Failed to save duplicate record for pair (${canonicalAID}, ${canonicalBID}) method=${detectionMethod}`);
        } else {
            LogStatus(`[Dedup] Detected ${detectionMethod} duplicate: (${canonicalAID}, ${canonicalBID}) score=${similarityScore}`);
        }
    }

    /**
     * Checks whether a duplicate record already exists for the given pair and detection method.
     *
     * @param canonicalAID - The canonical (ordered) ContentItemAID.
     * @param canonicalBID - The canonical (ordered) ContentItemBID.
     * @param detectionMethod - The detection method to check.
     * @param contextUser - The authenticated user context.
     * @returns True if a record already exists.
     */
    private async duplicatePairExists(
        canonicalAID: string,
        canonicalBID: string,
        detectionMethod: 'Checksum' | 'Title' | 'URL' | 'Vector',
        contextUser: UserInfo
    ): Promise<boolean> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Content Item Duplicates',
            Fields: ['ID'],
            ExtraFilter: `ContentItemAID = '${canonicalAID}' AND ContentItemBID = '${canonicalBID}' AND DetectionMethod = '${detectionMethod}'`,
            ResultType: 'simple'
        }, contextUser);

        return result.Success && result.Results.length > 0;
    }
}
