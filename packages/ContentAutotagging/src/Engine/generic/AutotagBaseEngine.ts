import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core'
import { MJGlobal, UUIDsEqual, NormalizeUUID, RegisterClass } from '@memberjunction/global'
import {
    MJContentSourceEntity, MJContentItemEntity, MJContentFileTypeEntity,
    MJContentProcessRunEntity, MJContentTypeEntity, MJContentSourceTypeEntity,
    MJContentTypeAttributeEntity, MJContentSourceParamEntity, MJContentItemTagEntity,
    MJContentItemAttributeEntity, MJContentSourceTypeParamEntity,
    MJContentProcessRunEntity_IContentProcessRunConfiguration,
    MJContentItemDuplicateEntity, MJTaggedItemEntity,
    MJEntityRecordDocumentEntity
} from '@memberjunction/core-entities'
import { ContentSourceParams, ContentSourceTypeParams, ContentSourceTypeParamValue } from './content.types'
import { RateLimiter } from './RateLimiter'
import pdfParse from 'pdf-parse'
import officeparser from 'officeparser'
import * as fs from 'fs'
import { ProcessRunParams, JsonObject, ContentItemProcessParams } from './process.types'
import { ClassificationContextResolver, IContentSourceClassificationConfiguration } from './ClassificationContextResolver'
import { toZonedTime } from 'date-fns-tz'
import axios from 'axios'
import * as cheerio from 'cheerio'
import crypto from 'crypto'
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai'
import { AIEngine } from '@memberjunction/aiengine'
import { AIPromptRunner, AIModelRunner } from '@memberjunction/ai-prompts'
import type { EmbeddingRunResult } from '@memberjunction/ai-prompts'
import { AIPromptParams } from '@memberjunction/ai-core-plus'
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus'
import { TextChunker, ChunkTextParams } from '@memberjunction/ai-vectors'
import { VectorDBBase, VectorRecord, BaseResponse } from '@memberjunction/ai-vectordb'
import { TagEngine } from '@memberjunction/tag-engine'
import { TagEngineBase } from '@memberjunction/tag-engine-base'
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities'

/**
 * Resolved vector infrastructure for a specific (embeddingModel + vectorIndex) pair.
 * Items sharing the same pair are batched together for efficient processing.
 */
interface ResolvedVectorInfrastructure {
    embedding: BaseEmbeddings;
    vectorDB: VectorDBBase;
    indexName: string;
    embeddingModelName: string;
    /** The AI model ID for the embedding model (UUID), used by AIModelRunner for tracking */
    embeddingModelID: string;
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

/**
 * Core engine for content autotagging. Extends BaseEngine to cache content metadata
 * (types, source types, file types, attributes) at startup. Uses AIEngine via composition
 * for AI model access, then delegates to LLM for text analysis and tagging.
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
    private _ContentTypeAttributes: MJContentTypeAttributeEntity[] = [];
    private _ContentSourceTypeParams: MJContentSourceTypeParamEntity[] = [];

    /** Shortcut to KnowledgeHubMetadataEngine */
    private get khEngine(): KnowledgeHubMetadataEngine { return KnowledgeHubMetadataEngine.Instance; }

    /** All content types — delegated to KnowledgeHubMetadataEngine */
    public get ContentTypes(): MJContentTypeEntity[] { return this.khEngine.ContentTypes; }
    /** All content source types — delegated to KnowledgeHubMetadataEngine */
    public get ContentSourceTypes(): MJContentSourceTypeEntity[] { return this.khEngine.ContentSourceTypes; }
    /** All content file types — delegated to KnowledgeHubMetadataEngine */
    public get ContentFileTypes(): MJContentFileTypeEntity[] { return this.khEngine.ContentFileTypes; }
    /** All content type attributes, cached at startup */
    public get ContentTypeAttributes(): MJContentTypeAttributeEntity[] { return this._ContentTypeAttributes; }
    /** All content source type params, cached at startup */
    public get ContentSourceTypeParams(): MJContentSourceTypeParamEntity[] { return this._ContentSourceTypeParams; }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
        // Content Types, Content Source Types, and Content File Types are delegated to
        // KnowledgeHubMetadataEngine (avoid redundant loading). Only cache entities unique to this engine.
        await KnowledgeHubMetadataEngine.Instance.Config(forceRefresh, contextUser);

        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Content Type Attributes',
                PropertyName: '_ContentTypeAttributes',
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Content Source Type Params',
                PropertyName: '_ContentSourceTypeParams',
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
            await this.saveProcessRun(processRunParams, contextUser);
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
            const LLMResults: JsonObject = await this.promptAndRetrieveResultsFromLLM(params, contextUser);
            await this.saveLLMResults(LLMResults, contextUser);
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
            await item.Save();
        } catch {
            // Non-critical — don't fail the pipeline for a status update
        }
    }

    /**
     * Resolves the "Content Autotagging" prompt from the AIEngine cache.
     * Throws if the prompt is not found or not active.
     */
    private getAutotagPrompt(): MJAIPromptEntityExtended {
        const prompt = AIEngine.Instance.Prompts.find(p => p.Name === 'Content Autotagging');
        if (!prompt) {
            throw new Error('AI Prompt "Content Autotagging" not found. Ensure the prompt metadata has been synced to the database.');
        }
        if (prompt.Status !== 'Active') {
            throw new Error(`AI Prompt "Content Autotagging" is not active (Status: ${prompt.Status})`);
        }
        return prompt;
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
                const tree = TagEngine.Instance.GetTaxonomyTree();
                this.TaxonomyContext = this.buildTaxonomyMarkdown(tree);
                LogStatus(`[TaxonomyBridge] Taxonomy context injected as markdown (${tree.length} root nodes, ${TagEngine.Instance.Tags.length} total tags)`);
            }

            // Set up the bridge callback — fires after each ContentItemTag is saved
            this.OnContentItemTagSaved = async (
                contentItemTag: MJContentItemTagEntity,
                parentTagName: string | null,
                ctxUser: UserInfo
            ) => {
                await this.BridgeContentItemTagToTaxonomy(contentItemTag, parentTagName, ctxUser);
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
     * Build a markdown-formatted taxonomy for LLM prompt injection.
     * Uses heading levels for hierarchy depth (# for root, ## for child, etc.)
     * so the LLM can return tag paths like "Root / Child / Grandchild".
     */
    private buildTaxonomyMarkdown(tree: Array<{ Name: string; Children: Array<unknown> }>): string {
        const lines: string[] = [];
        const renderNode = (node: { Name: string; Children: Array<unknown> }, depth: number, path: string): void => {
            const prefix = '#'.repeat(Math.min(depth + 1, 6)); // Max 6 heading levels
            const fullPath = path ? `${path} / ${node.Name}` : node.Name;
            lines.push(`${prefix} ${node.Name}`);
            if (node.Children && node.Children.length > 0) {
                for (const child of node.Children) {
                    renderNode(child as { Name: string; Children: Array<unknown> }, depth + 1, fullPath);
                }
            }
        };
        for (const root of tree) {
            renderNode(root, 0, '');
        }
        return lines.join('\n');
    }

    /**
     * Build the existing-taxonomy markdown from the LIVE TagEngine cache at the
     * moment a prompt is constructed — NOT a once-per-run snapshot.
     *
     * TagEngine wraps the process-global TagEngineBase cache, which stays current
     * as tags are created during the run (each tag Save fires BaseEntity events
     * that update the shared cache). Reading it per item means every item sees the
     * tags created by earlier items and can reuse / nest into them, so a real
     * hierarchy emerges instead of a flat list of near-duplicates. (The old
     * `TaxonomyContext` snapshot was built once and, on a from-empty run, never —
     * leaving the LLM blind for the whole run.)
     */
    private getLiveTaxonomyMarkdown(): string | undefined {
        const tags = TagEngine.Instance.Tags;
        if (!tags || tags.length === 0) return undefined;
        return this.buildTaxonomyMarkdown(TagEngine.Instance.GetTaxonomyTree());
    }

    /**
     * Bridge a ContentItemTag to the formal MJ Tag taxonomy.
     * Uses TagEngine.ResolveTag() in auto-grow mode by default.
     *
     * After resolving/creating the formal Tag, also creates a TaggedItem record:
     * - For Entity sources: tags the original entity record (e.g., Products row)
     * - For non-Entity sources (RSS, Website, etc.): tags the ContentItem itself
     */
    private async BridgeContentItemTagToTaxonomy(
        contentItemTag: MJContentItemTagEntity,
        parentTagName: string | null,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            // If the LLM suggested a parent tag, resolve it first (through the same
            // mutex, to prevent duplicate parents under concurrent batch processing)
            // and CAPTURE its ID so a NEWLY-created child can be nested under it.
            // Previously the parent's ID was discarded and children were always
            // created flat — which is why the generated taxonomy came out as one big
            // flat list with no parent/child nesting.
            let parentTagID: string | null = null;
            if (parentTagName) {
                const parentTag = await TagEngine.Instance.ResolveTag(
                    parentTagName, 0, 'auto-grow', null, 0.80, contextUser
                );
                parentTagID = parentTag?.ID ?? null;
            }

            // Resolve the tag with rootID=null so matching searches the WHOLE
            // taxonomy (reusing an existing tag wherever possible — passing the
            // parent as rootID would scope the search to that subtree and spawn
            // duplicates of existing root-level tags). parentIDForNew nests a
            // freshly-created tag under the LLM-suggested parent and runs it
            // through ValidateAutoGrow governance (MaxChildren / depth), so nesting
            // is deterministically rule-compliant. Existing tags keep their place.
            const formalTag = await TagEngine.Instance.ResolveTag(
                contentItemTag.Tag,
                contentItemTag.Weight,
                'auto-grow',
                null,   // global search — reuse existing tags, avoid duplicates
                0.80,   // similarity threshold — lower to catch plurals/variants like "AI Agent" vs "AI Agents"
                contextUser,
                parentTagID ? { parentIDForNew: parentTagID } : undefined
            );

            if (formalTag) {
                // Link ContentItemTag to formal Tag
                contentItemTag.TagID = formalTag.ID;
                await contentItemTag.Save();

                // Create TaggedItem linking the formal Tag to the appropriate entity record
                await this.createTaggedItemFromContentItemTag(
                    contentItemTag, formalTag.ID, contextUser
                );
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[TaxonomyBridge] Failed for tag "${contentItemTag.Tag}": ${msg}`);
        }
    }

    /**
     * Creates a TaggedItem record linking a formal Tag to the appropriate entity record.
     *
     * For Entity-sourced content items: resolves the EntityRecordDocument to find the
     * original entity (e.g., Products) and record ID, then tags that entity record.
     *
     * For non-Entity-sourced content items (RSS, Website, Cloud Storage): tags the
     * ContentItem itself (EntityID = "MJ: Content Items" entity, RecordID = content item ID).
     */
    private async createTaggedItemFromContentItemTag(
        contentItemTag: MJContentItemTagEntity,
        tagID: string,
        contextUser: UserInfo
    ): Promise<void> {
        try {
            const md = this.ProviderToUse;
            let entityID: string;
            let recordID: string;

            // Load the content item to determine source type
            const rv = new RunView();
            const ciResult = await rv.RunView<{
                ID: string;
                EntityRecordDocumentID: string | null;
                ContentSourceID: string;
            }>({
                EntityName: 'MJ: Content Items',
                ExtraFilter: `ID='${contentItemTag.ItemID}'`,
                ResultType: 'simple',
                Fields: ['ID', 'EntityRecordDocumentID', 'ContentSourceID'],
                MaxRows: 1,
            }, contextUser);

            if (!ciResult.Success || ciResult.Results.length === 0) return;
            const ci = ciResult.Results[0];

            if (ci.EntityRecordDocumentID) {
                // Entity source — resolve to the original entity record
                const erdResult = await rv.RunView<{
                    EntityID: string;
                    RecordID: string;
                }>({
                    EntityName: 'MJ: Entity Record Documents',
                    ExtraFilter: `ID='${ci.EntityRecordDocumentID}'`,
                    ResultType: 'simple',
                    Fields: ['EntityID', 'RecordID'],
                    MaxRows: 1,
                }, contextUser);

                if (!erdResult.Success || erdResult.Results.length === 0) return;
                entityID = erdResult.Results[0].EntityID;
                recordID = erdResult.Results[0].RecordID;
            } else {
                // Non-entity source — tag the ContentItem itself
                const contentItemsEntity = md.EntityByName('MJ: Content Items');
                if (!contentItemsEntity) return;
                entityID = contentItemsEntity.ID;
                recordID = contentItemTag.ItemID;
            }

            // Check if this TaggedItem already exists (avoid duplicates)
            const existingResult = await rv.RunView<{ ID: string }>({
                EntityName: 'MJ: Tagged Items',
                ExtraFilter: `TagID='${tagID}' AND EntityID='${entityID}' AND RecordID='${recordID}'`,
                ResultType: 'simple',
                Fields: ['ID'],
                MaxRows: 1,
            }, contextUser);

            if (existingResult.Success && existingResult.Results.length > 0) return; // Already exists

            // Create the TaggedItem
            const taggedItem = await md.GetEntityObject<MJTaggedItemEntity>('MJ: Tagged Items', contextUser);
            taggedItem.NewRecord();
            taggedItem.TagID = tagID;
            taggedItem.EntityID = entityID;
            taggedItem.RecordID = recordID;
            taggedItem.Weight = contentItemTag.Weight;
            await taggedItem.Save();
        } catch (e) {
            // Non-critical — the ContentItemTag is already saved, TaggedItem is supplemental
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`[TaxonomyBridge] Failed to create TaggedItem for tag "${contentItemTag.Tag}": ${msg}`);
        }
    }

    /**
     * Builds template data for the autotagging prompt from processing params and chunk context.
     */
    private buildPromptData(
        params: ContentItemProcessParams,
        chunk: string,
        previousResults: JsonObject
    ): Record<string, unknown> {
        const contentSourceType = this.GetContentSourceTypeName(params.contentSourceTypeID);
        const additionalAttributePrompts = this.GetAdditionalContentTypePrompt(params.contentTypeID);
        const hasPreviousResults = Object.keys(previousResults).length > 0;

        // Check if this source type requires content type validation in the prompt
        const sourceType = this.ContentSourceTypes.find(st => UUIDsEqual(st.ID, params.contentSourceTypeID));
        const sourceConfig = sourceType?.ConfigurationObject;
        const requiresContentType = sourceConfig?.RequiresContentType !== false;

        return {
            contentType: requiresContentType ? this.GetContentTypeName(params.contentTypeID) : undefined,
            contentSourceType,
            minTags: params.minTags,
            maxTags: params.maxTags,
            additionalAttributePrompts,
            existingTaxonomy: this.getLiveTaxonomyMarkdown(),
            classificationContext: params.classificationContext ?? undefined,
            contentText: chunk,
            previousResults: hasPreviousResults ? JSON.stringify(previousResults) : undefined,
        };
    }

    /**
     * Resolve the effective classification context for a content item by combining
     * the org / content-type / source scopes via {@link ClassificationContextResolver}.
     * Returns undefined when no scope supplies context. Best-effort: any failure is
     * logged and treated as "no context" so the autotag run is never blocked.
     */
    private async resolveClassificationContext(
        params: ContentItemProcessParams,
        contextUser: UserInfo,
    ): Promise<string | undefined> {
        try {
            const sourceConfig = this.getSourceClassificationConfig(params.contentSourceID);
            return await ClassificationContextResolver.ResolveEffectiveContext(
                sourceConfig,
                params.contentTypeID,
                this.ContentTypes,
                contextUser,
                this.ProviderToUse,
            );
        } catch (e) {
            LogError(`[Autotag] Failed to resolve classification context for item ${params.contentItemID}: ${e instanceof Error ? e.message : String(e)}`);
            return undefined;
        }
    }

    /**
     * Look up the parsed ContentSource configuration (with the classification-context
     * extension keys) for a given source ID from the cached KnowledgeHub sources.
     */
    private getSourceClassificationConfig(
        contentSourceID: string | undefined,
    ): IContentSourceClassificationConfiguration | null {
        if (!contentSourceID) {
            return null;
        }
        const source = this.khEngine.ContentSources.find(s => UUIDsEqual(s.ID, contentSourceID));
        if (!source) {
            return null;
        }
        // ConfigurationObject is the CodeGen-generated typed accessor; the classification
        // extension keys ride along in the same JSON and are surfaced via the extended interface.
        return (source.ConfigurationObject as IContentSourceClassificationConfiguration | null) ?? null;
    }

    public async promptAndRetrieveResultsFromLLM(params: ContentItemProcessParams, contextUser: UserInfo): Promise<JsonObject> {
        await AIEngine.Instance.Config(false, contextUser);

        // Resolve the effective classification context once per item (async lookup);
        // buildPromptData reads it from params for each chunk.
        params.classificationContext = await this.resolveClassificationContext(params, contextUser);

        const prompt = this.getAutotagPrompt();
        const tokenLimit = this.resolveTokenLimit(params.modelID);
        const chunks = this.chunkExtractedText(params.text, tokenLimit);

        if (chunks.length === 0 || (chunks.length === 1 && (!chunks[0] || chunks[0].trim().length === 0))) {
            LogError(`[Autotag] No text to process for item ${params.contentItemID}`);
            return {};
        }

        let LLMResults: JsonObject = {};
        const startTime = new Date();

        for (let ci = 0; ci < chunks.length; ci++) {
            try {
                LLMResults = await this.processChunkWithPromptRunner(prompt, params, chunks[ci], LLMResults, contextUser);
            } catch (chunkError) {
                LogError(`[Autotag] Chunk ${ci + 1}/${chunks.length} failed for item ${params.contentItemID}: ${chunkError instanceof Error ? chunkError.message : String(chunkError)}`);
            }
        }

        LLMResults.processStartTime = startTime;
        LLMResults.processEndTime = new Date();
        LLMResults.contentItemID = params.contentItemID;
        return LLMResults;
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
    public async processChunkWithPromptRunner(
        prompt: MJAIPromptEntityExtended,
        params: ContentItemProcessParams,
        chunk: string,
        LLMResults: JsonObject,
        contextUser: UserInfo
    ): Promise<JsonObject> {
        const promptParams = new AIPromptParams();
        promptParams.prompt = prompt;
        promptParams.contextUser = contextUser;
        promptParams.data = this.buildPromptData(params, chunk, LLMResults);
        promptParams.skipValidation = false;
        promptParams.attemptJSONRepair = true;
        promptParams.additionalParameters = { temperature: 0.0 };

        // If the ContentType specifies a preferred AI model, use it as a runtime override
        if (params.modelID) {
            promptParams.override = { modelId: params.modelID };
        }

        const runner = new AIPromptRunner();
        const result = await runner.ExecutePrompt<JsonObject>(promptParams);

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

    public async saveLLMResults(LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        if (LLMResults.isValidContent === true) {
            await this.saveResultsToContentItemAttribute(LLMResults, contextUser);
            await this.saveContentItemTags(LLMResults.contentItemID as string, LLMResults, contextUser);
        } else if (LLMResults.isValidContent === false) {
            await this.deleteInvalidContentItem(LLMResults.contentItemID as string, contextUser);
        } else {
            LogError(`[Autotag] Unexpected LLM format for item ${LLMResults.contentItemID} — isValidContent missing. Keys: ${Object.keys(LLMResults).join(', ')}`);
        }
    }

    public async deleteInvalidContentItem(contentItemID: string, contextUser: UserInfo): Promise<void> {
        const md = this.ProviderToUse;
        const contentItem: MJContentItemEntity = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
        await contentItem.Load(contentItemID);
        await contentItem.Delete();
    }

    /**
     * Chunks text using the shared TextChunker utility for token-aware splitting.
     * Falls back to simple character-based splitting when TextChunker is not available.
     */
    public chunkExtractedText(text: string, tokenLimit: number): string[] {
        try {
            const maxChunkTokens = Math.ceil(tokenLimit / 1.5);

            if (text.length <= maxChunkTokens * 4) {
                return [text];
            }

            try {
                const chunkParams: ChunkTextParams = {
                    Text: text,
                    MaxChunkTokens: maxChunkTokens,
                    OverlapTokens: Math.ceil(maxChunkTokens * 0.1),
                    Strategy: 'sentence',
                };
                const chunks = TextChunker.ChunkText(chunkParams);
                return chunks.map(c => c.Text);
            } catch {
                return this.fallbackChunkText(text, maxChunkTokens);
            }
        } catch {
            LogError('Could not chunk the text');
            return [text];
        }
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
    public async saveContentItemTags(contentItemID: string, LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        const md = this.ProviderToUse;
        const keywords = LLMResults.keywords;
        if (!keywords || !Array.isArray(keywords)) return;

        // AIPromptRun lineage: the run that produced this keyword set was stashed on
        // LLMResults during chunk processing. Stamped on each ContentItemTag for audit.
        const rawPromptRunID = LLMResults[AutotagBaseEngine.AI_PROMPT_RUN_ID_KEY];
        const aiPromptRunID: string | null = typeof rawPromptRunID === 'string' && rawPromptRunID.length > 0
            ? rawPromptRunID
            : null;

        // Normalize keywords — support both formats:
        //   Old: ["keyword1", "keyword2"]
        //   New: [{ tag: "keyword1", weight: 0.95 }, { tag: "keyword2", weight: 0.7 }]
        //   New with parentTag: [{ tag: "keyword1", weight: 0.95, parentTag: "parent" }]
        //   New with reasoning: [{ tag: "keyword1", weight: 0.95, reasoning: "why..." }]
        const normalizedTags: Array<{ tag: string; weight: number; parentTag: string | null; reasoning: string | null }> = keywords.map((kw: unknown) => {
            if (typeof kw === 'string') {
                return { tag: kw, weight: 1.0, parentTag: null, reasoning: null };
            }
            const obj = kw as { tag?: string; keyword?: string; weight?: number; parentTag?: string; reasoning?: string; rationale?: string };
            const rawReasoning = obj.reasoning ?? obj.rationale;
            return {
                tag: obj.tag || obj.keyword || String(kw),
                weight: typeof obj.weight === 'number' ? Math.max(0, Math.min(1, obj.weight)) : 0.5,
                parentTag: obj.parentTag ?? null,
                reasoning: typeof rawReasoning === 'string' && rawReasoning.trim().length > 0 ? rawReasoning.trim() : null,
            };
        });

        const BATCH_SIZE = 10;
        for (let i = 0; i < normalizedTags.length; i += BATCH_SIZE) {
            const batch = normalizedTags.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (item) => {
                const contentItemTag: MJContentItemTagEntity = await md.GetEntityObject<MJContentItemTagEntity>('MJ: Content Item Tags', contextUser);
                contentItemTag.NewRecord();
                contentItemTag.ItemID = contentItemID;
                contentItemTag.Tag = item.tag;
                contentItemTag.Weight = item.weight;
                // Phase 4 lineage/audit — only set when available, both columns nullable.
                if (aiPromptRunID) {
                    contentItemTag.AIPromptRunID = aiPromptRunID;
                }
                if (item.reasoning) {
                    contentItemTag.Reasoning = item.reasoning;
                }
                const saved = await contentItemTag.Save();

                // Invoke taxonomy bridge callback if set
                if (saved && this.OnContentItemTagSaved) {
                    try {
                        await this.OnContentItemTagSaved(contentItemTag, item.parentTag, contextUser);
                    } catch (bridgeError) {
                        const msg = bridgeError instanceof Error ? bridgeError.message : String(bridgeError);
                        LogError(`Tag taxonomy bridge failed for tag "${item.tag}": ${msg}`);
                    }
                }
            }));
        }
    }

    /**
     * Saves LLM-extracted attributes to the database.
     * Updates content item name/description, then creates attribute records for other fields.
     */
    public async saveResultsToContentItemAttribute(LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
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

    /**
     * Retrieves all content sources for a given content source type.
     * Throws if no sources are found.
     */
    public async getAllContentSources(contextUser: UserInfo, contentSourceTypeID: string): Promise<MJContentSourceEntity[]> {
        const sources = await this.GetAllContentSourcesSafe(contextUser, contentSourceTypeID);
        if (sources.length === 0) {
            throw new Error(`No content sources found for content source type with ID '${contentSourceTypeID}'`);
        }
        return sources;
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

    public async getContentSourceParams(contentSource: MJContentSourceEntity, contextUser: UserInfo): Promise<Map<string, ContentSourceTypeParamValue>> {
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
                    params.value = this.castValueAsCorrectType(contentSourceParam.Value, params.type);
                }
                contentSourceParams.set(params.name, params.value);
            }
        } else {
            LogStatus(`No content source params found for content source with ID ${contentSource.ID}, using default values`);
        }

        return contentSourceParams;
    }

    public GetDefaultContentSourceTypeParams(contentSourceTypeParamID: string): ContentSourceTypeParams {
        const result = this._ContentSourceTypeParams.find(p => UUIDsEqual(p.ID, contentSourceTypeParamID));
        if (!result) {
            throw new Error(`Content Source Type Param with ID '${contentSourceTypeParamID}' not found in cached metadata`);
        }

        const params = new ContentSourceTypeParams();
        params.name = result.Name;
        params.type = result.Type.toLowerCase();
        params.value = this.castValueAsCorrectType(result.DefaultValue ?? '', params.type);
        return params;
    }

    public castValueAsCorrectType(value: string, type: string): ContentSourceTypeParamValue {
        switch (type) {
            case 'number':
                return parseInt(value, 10);
            case 'boolean':
                return this.stringToBoolean(value);
            case 'string':
                return value;
            case 'string[]':
                return this.parseStringArray(value);
            case 'regexp':
                return new RegExp(value.replace(/\\\\/g, '\\'));
            default:
                return value;
        }
    }

    public stringToBoolean(str: string): boolean {
        return str === 'true';
    }

    public parseStringArray(value: string): string[] {
        return JSON.parse(value) as string[];
    }

    /**
     * Converts a run date to the user's local timezone.
     */
    public async convertLastRunDateToTimezone(lastRunDate: Date): Promise<Date> {
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return toZonedTime(lastRunDate, userTimeZone);
    }

    /**
     * Retrieves the last run date for a content source. Returns epoch date if no runs exist.
     */
    public async getContentSourceLastRunDate(contentSourceID: string, contextUser: UserInfo): Promise<Date> {
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
            return this.convertLastRunDateToTimezone(lastRunDate);
        }

        if (results.Success) {
            return new Date(0);
        }

        throw new Error(`Failed to retrieve last run date for content source with ID ${contentSourceID}`);
    }

    public GetContentItemParams(contentTypeID: string): { modelID: string; minTags: number; maxTags: number } {
        const contentType = this.ContentTypes.find(ct => UUIDsEqual(ct.ID, contentTypeID));
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
        const sourceType = this.ContentSourceTypes.find(st => UUIDsEqual(st.ID, contentSourceTypeID));
        if (!sourceType) {
            throw new Error(`Content Source Type with ID ${contentSourceTypeID} not found in cached metadata`);
        }
        return sourceType.Name;
    }

    public GetContentTypeName(contentTypeID: string): string {
        const contentType = this.ContentTypes.find(ct => UUIDsEqual(ct.ID, contentTypeID));
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
        const attrs = this._ContentTypeAttributes.filter(a => UUIDsEqual(a.ContentTypeID, contentTypeID));
        if (attrs.length === 0) return '';

        return attrs.map(attr =>
            `${attr.Prompt}. The data must be included in the above described JSON file in this key-value format:     { "${attr.Name}": (value of ${attr.Name} here)}`
        ).join('\n');
    }

    public GetContentItemDescription(contentSourceParams: ContentSourceParams): string {
        const contentTypeName = this.GetContentTypeName(contentSourceParams.ContentTypeID);
        const fileTypeName = this.GetContentFileTypeName(contentSourceParams.ContentFileTypeID);
        const sourceTypeName = this.GetContentSourceTypeName(contentSourceParams.ContentSourceTypeID);
        return `${contentTypeName} in ${fileTypeName} format obtained from a ${sourceTypeName} source`;
    }

    public async getChecksumFromURL(url: string): Promise<string> {
        const response = await axios.get(url);
        const content = String(response.data);
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    public async getChecksumFromText(text: string): Promise<string> {
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    public async getContentItemIDFromURL(contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<string> {
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

    /**
     * Saves process run metadata to the database (backward-compatible simple version).
     */
    public async saveProcessRun(processRunParams: ProcessRunParams, contextUser: UserInfo): Promise<void> {
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

    public async parsePDF(dataBuffer: Buffer): Promise<string> {
        const dataPDF = await pdfParse(dataBuffer);
        return dataPDF.text;
    }

    public async parseDOCX(dataBuffer: Buffer): Promise<string> {
        const dataDOCX = await officeparser.parseOffice(dataBuffer);
        return dataDOCX.toText();
    }

    public async parseHTML(data: string): Promise<string> {
        try {
            const $ = cheerio.load(data);
            $('script, style, nav, footer, header, .hidden').remove();
            return $('body').text().replace(/\s\s+/g, ' ').trim();
        } catch (e) {
            LogError('Error parsing HTML', undefined, e);
            throw e;
        }
    }

    public async parseFileFromPath(filePath: string): Promise<string> {
        const dataBuffer = await fs.promises.readFile(filePath);
        const fileExtension = filePath.split('.').pop()?.toLowerCase();
        switch (fileExtension) {
            case 'pdf':
                return this.parsePDF(dataBuffer);
            case 'docx':
                return this.parseDOCX(dataBuffer);
            default:
                throw new Error(`File type '${fileExtension}' not supported`);
        }
    }

    // ---- Direct Vectorization ----

    /**
     * Embeds content items and upserts them to the appropriate vector index.
     * Items are grouped by their resolved (embeddingModel + vectorIndex) pair — derived
     * from per-ContentSource overrides, per-ContentType defaults, or the global fallback
     * (first active VectorIndex). Each group is processed in configurable batches with
     * parallel upserts within each batch.
     *
     * Uses AIModelRunner to create AIPromptRun records for each embedding batch,
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

        // Load content sources + types for per-item infrastructure resolution
        const { sourceMap, typeMap } = await this.loadContentSourceAndTypeMaps(eligible, contextUser);

        // Group items by their resolved (embeddingModelID + vectorIndexID) pair
        const groups = this.groupItemsByInfrastructure(eligible, sourceMap, typeMap);

        // Load tags for all items in one query
        const tagMap = await this.loadTagsForItems(eligible, contextUser);

        let vectorized = 0;
        let processed = 0;
        const allPromptRunIDs: string[] = [];

        for (const [groupKey, groupItems] of groups) {
            const infra = await this.resolveGroupInfrastructure(groupKey, contextUser);
            const groupResult = await this.vectorizeGroup(groupItems, infra, tagMap, batchSize, contextUser, (batchProcessed) => {
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
     * Uses AIModelRunner for each embedding batch to create AIPromptRun records with
     * token/cost tracking. Upserts within each batch run in parallel for throughput.
     *
     * @param items - content items in this infrastructure group
     * @param infra - resolved embedding + vector DB infrastructure
     * @param tagMap - pre-loaded tags for metadata enrichment
     * @param batchSize - number of items per embedding batch
     * @param contextUser - current user for AIModelRunner tracking
     * @param onBatchComplete - callback invoked after each batch with item count
     * @returns count of vectorized items and collected AIPromptRun IDs
     */
    private async vectorizeGroup(
        items: MJContentItemEntity[],
        infra: ResolvedVectorInfrastructure,
        tagMap: Map<string, string[]>,
        batchSize: number,
        contextUser: UserInfo,
        onBatchComplete: (count: number) => void
    ): Promise<{ vectorized: number; promptRunIDs: string[] }> {
        let vectorized = 0;
        const promptRunIDs: string[] = [];
        const modelRunner = new AIModelRunner();

        // Mark every item in this infra group as Processing up front so dashboards
        // reflect in-flight state. Each batch will transition its items to Complete
        // or Failed as outcomes are known.
        await this.updateEmbeddingStatusBatch(items, 'Processing', contextUser);

        // Resolve the "Content Embedding" prompt ID for tracking
        const embeddingPromptID = this.resolveEmbeddingPromptID();

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);

            // Build chunks for each item — items with long text produce multiple chunks
            const allChunks = this.buildChunksForBatch(batch);

            const texts = allChunks.map(c => c.text);
            // Rate limit embedding API call
            await this.EmbeddingRateLimiter.Acquire(texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0));

            // Use AIModelRunner to embed texts with AIPromptRun tracking
            const runResult = await modelRunner.RunEmbedding({
                Texts: texts,
                ModelID: infra.embeddingModelID,
                PromptID: embeddingPromptID,
                ContextUser: contextUser,
                Description: `Content vectorization batch: ${batch.length} items, ${allChunks.length} chunks`,
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

            const records = this.buildVectorRecords(allChunks, runResult.Vectors, tagMap);

            const batchSuccess = await this.upsertVectorRecords(records, infra);
            if (batchSuccess) {
                vectorized += batch.length;
                await this.updateEmbeddingStatusBatch(batch, 'Complete', contextUser, infra.embeddingModelID);
            } else {
                await this.updateEmbeddingStatusBatch(batch, 'Failed', contextUser);
            }

            onBatchComplete(batch.length);
        }

        return { vectorized, promptRunIDs };
    }

    /**
     * Resolve the "Content Embedding" prompt ID from AIEngine for AIModelRunner tracking.
     * Returns undefined if the prompt is not found (AIModelRunner will fall back to
     * the first active Embedding-type prompt).
     */
    private resolveEmbeddingPromptID(): string | undefined {
        const prompt = AIEngine.Instance.Prompts.find(
            p => p.Name === 'Content Embedding' && p.Status === 'Active'
        );
        if (prompt) {
            return prompt.ID;
        }
        // Fall back: let AIModelRunner find the first active Embedding prompt
        LogStatus('[Autotag] "Content Embedding" prompt not found — AIModelRunner will use default embedding prompt');
        return undefined;
    }

    /**
     * Build text chunks for a batch of content items. Items with long text
     * produce multiple chunks via TextChunker.
     */
    private buildChunksForBatch(
        batch: MJContentItemEntity[]
    ): { item: MJContentItemEntity; chunkIndex: number; text: string }[] {
        const allChunks: { item: MJContentItemEntity; chunkIndex: number; text: string }[] = [];
        for (const item of batch) {
            const chunks = this.buildEmbeddingChunks(item);
            for (let ci = 0; ci < chunks.length; ci++) {
                allChunks.push({ item, chunkIndex: ci, text: chunks[ci] });
            }
        }
        return allChunks;
    }

    /**
     * Build VectorRecord objects from embedding chunks and their corresponding vectors.
     */
    private buildVectorRecords(
        allChunks: { item: MJContentItemEntity; chunkIndex: number; text: string }[],
        vectors: number[][],
        tagMap: Map<string, string[]>
    ): VectorRecord[] {
        return allChunks.map((chunk, idx) => ({
            id: chunk.chunkIndex === 0
                ? this.contentItemVectorId(chunk.item.ID)
                : this.contentItemVectorId(chunk.item.ID) + `_chunk${chunk.chunkIndex}`,
            values: vectors[idx],
            metadata: this.buildVectorMetadata(chunk.item, tagMap.get(chunk.item.ID))
        }));
    }

    /**
     * Upsert vector records to the vector database in sub-batches with rate limiting.
     * Returns true if all sub-batches succeeded.
     */
    private async upsertVectorRecords(
        records: VectorRecord[],
        infra: ResolvedVectorInfrastructure
    ): Promise<boolean> {
        const UPSERT_CHUNK = 50;
        const upsertPromises: Promise<BaseResponse>[] = [];
        for (let j = 0; j < records.length; j += UPSERT_CHUNK) {
            const chunk = records.slice(j, j + UPSERT_CHUNK);
            await this.VectorDBRateLimiter.Acquire();
            upsertPromises.push(Promise.resolve(infra.vectorDB.CreateRecords(chunk, infra.indexName)));
        }
        const responses = await Promise.all(upsertPromises);
        let allSuccess = true;
        for (const response of responses) {
            if (!response.success) {
                LogError(`VectorizeContentItems: upsert failed: ${response.message}`);
                allSuccess = false;
            }
        }
        return allSuccess;
    }

    /**
     * Load content source and content type records for all unique source/type IDs
     * referenced by the given items. Returns maps keyed by normalized ID.
     */
    private async loadContentSourceAndTypeMaps(
        items: MJContentItemEntity[],
        _contextUser: UserInfo
    ): Promise<{
        sourceMap: Map<string, Record<string, unknown>>;
        typeMap: Map<string, Record<string, unknown>>;
    }> {
        const sourceIdSet = new Set(items.map(i => NormalizeUUID(i.ContentSourceID)));
        const typeIdSet = new Set(items.map(i => NormalizeUUID(i.ContentTypeID)));

        // Use KH engine cached data instead of RunView calls
        const sourceMap = new Map<string, Record<string, unknown>>();
        for (const src of this.khEngine.ContentSources) {
            if (sourceIdSet.has(NormalizeUUID(src.ID))) {
                sourceMap.set(NormalizeUUID(src.ID), src.GetAll());
            }
        }

        const typeMap = new Map<string, Record<string, unknown>>();
        for (const ct of this.ContentTypes) {
            if (typeIdSet.has(NormalizeUUID(ct.ID))) {
                typeMap.set(NormalizeUUID(ct.ID), ct.GetAll());
            }
        }

        return { sourceMap, typeMap };
    }

    /**
     * Resolve the (embeddingModelID, vectorIndexID) pair for a content item using
     * the cascade: ContentSource override -> ContentType default -> null (global fallback).
     */
    private resolveItemInfrastructureIds(
        item: MJContentItemEntity,
        sourceMap: Map<string, Record<string, unknown>>,
        typeMap: Map<string, Record<string, unknown>>
    ): { embeddingModelID: string | null; vectorIndexID: string | null } {
        const source = sourceMap.get(NormalizeUUID(item.ContentSourceID));
        if (source) {
            const srcEmbedding = source['EmbeddingModelID'] as string | null;
            const srcVector = source['VectorIndexID'] as string | null;
            if (srcEmbedding && srcVector) {
                return { embeddingModelID: srcEmbedding, vectorIndexID: srcVector };
            }
        }

        const contentType = typeMap.get(NormalizeUUID(item.ContentTypeID));
        if (contentType) {
            const typeEmbedding = contentType['EmbeddingModelID'] as string | null;
            const typeVector = contentType['VectorIndexID'] as string | null;
            if (typeEmbedding && typeVector) {
                return { embeddingModelID: typeEmbedding, vectorIndexID: typeVector };
            }
        }

        // Global fallback — will be resolved in resolveGroupInfrastructure
        return { embeddingModelID: null, vectorIndexID: null };
    }

    /**
     * Group items by their resolved (embeddingModelID + vectorIndexID) key.
     * Items with the same pair share infrastructure and can be batched together.
     */
    private groupItemsByInfrastructure(
        items: MJContentItemEntity[],
        sourceMap: Map<string, Record<string, unknown>>,
        typeMap: Map<string, Record<string, unknown>>
    ): Map<string, MJContentItemEntity[]> {
        const groups = new Map<string, MJContentItemEntity[]>();

        for (const item of items) {
            const { embeddingModelID, vectorIndexID } = this.resolveItemInfrastructureIds(item, sourceMap, typeMap);
            const key = this.infraGroupKey(embeddingModelID, vectorIndexID);
            const group = groups.get(key) ?? [];
            group.push(item);
            groups.set(key, group);
        }

        return groups;
    }

    /** Create a stable cache key for an (embeddingModelID, vectorIndexID) pair */
    private infraGroupKey(embeddingModelID: string | null, vectorIndexID: string | null): string {
        const e = embeddingModelID ? NormalizeUUID(embeddingModelID) : 'default';
        const v = vectorIndexID ? NormalizeUUID(vectorIndexID) : 'default';
        return `${e}|${v}`;
    }

    /**
     * Resolve a group key into concrete infrastructure instances. For the 'default|default'
     * key, falls back to the first active VectorIndex (original behavior).
     */
    private async resolveGroupInfrastructure(
        groupKey: string,
        contextUser: UserInfo
    ): Promise<ResolvedVectorInfrastructure> {
        const [embeddingPart, vectorPart] = groupKey.split('|');
        const isDefault = embeddingPart === 'default' || vectorPart === 'default';

        if (isDefault) {
            return this.getDefaultVectorInfrastructure(contextUser);
        }

        return this.buildVectorInfrastructure(embeddingPart, vectorPart, contextUser);
    }

    /**
     * Build infrastructure from explicit embeddingModelID and vectorIndexID.
     * Looks up the vector index by ID and the embedding model from AIEngine.
     */
    private async buildVectorInfrastructure(
        embeddingModelID: string,
        vectorIndexID: string,
        _contextUser: UserInfo
    ): Promise<ResolvedVectorInfrastructure> {
        const vectorIndex = this.khEngine.GetVectorIndexById(vectorIndexID);
        if (!vectorIndex) {
            throw new Error(`Vector index ${vectorIndexID} not found in KnowledgeHubMetadataEngine cache`);
        }

        return this.createInfrastructureFromIndex(vectorIndex.Name, vectorIndex.VectorDatabaseID, embeddingModelID);
    }

    /**
     * Fallback: resolve infrastructure from the first available VectorIndex (original behavior).
     */
    private async getDefaultVectorInfrastructure(_contextUser: UserInfo): Promise<ResolvedVectorInfrastructure> {
        const vectorIndexes = this.khEngine.VectorIndexes;
        if (vectorIndexes.length === 0) {
            throw new Error('No vector indexes found — create one in the Configuration tab first');
        }
        const vectorIndex = vectorIndexes[0];
        return this.createInfrastructureFromIndex(vectorIndex.Name, vectorIndex.VectorDatabaseID, vectorIndex.EmbeddingModelID);
    }

    /**
     * Shared helper: given vector index details and embedding model ID, resolve all
     * driver instances needed for embedding + upsert. Uses AIEngine for Vector Databases.
     */
    private async createInfrastructureFromIndex(
        indexName: string,
        vectorDatabaseID: string,
        embeddingModelID: string,
    ): Promise<ResolvedVectorInfrastructure> {
        const vectorDBEntity = AIEngine.Instance.VectorDatabases.find(db => UUIDsEqual(db.ID, vectorDatabaseID));
        if (!vectorDBEntity || !vectorDBEntity.ClassKey) {
            throw new Error(`Vector database ${vectorDatabaseID} not found in AIEngine cache`);
        }
        const vectorDBClassKey = vectorDBEntity.ClassKey;

        const aiModel = this.findEmbeddingModel(embeddingModelID);
        const driverClass = aiModel.DriverClass;
        const embeddingModelName = aiModel.APIName ?? aiModel.Name;

        LogStatus(`VectorizeContentItems: USING embedding model "${aiModel.Name}" (${driverClass}), vector DB "${vectorDBClassKey}", index "${indexName}"`);

        const embedding = this.createEmbeddingInstance(driverClass);
        const vectorDB = this.createVectorDBInstance(vectorDBClassKey);

        return { embedding, vectorDB, indexName, embeddingModelName, embeddingModelID };
    }

    /** Find an embedding model by ID in AIEngine, with helpful error reporting */
    private findEmbeddingModel(embeddingModelID: string): { DriverClass: string; APIName: string; Name: string } {
        const aiModel = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, embeddingModelID));
        if (!aiModel) {
            const embModels = AIEngine.Instance.Models.filter(m => m.DriverClass?.includes('Embed') || m.Name?.includes('embed'));
            LogError(`VectorizeContentItems: embeddingModelID ${embeddingModelID} NOT FOUND. Available: ${JSON.stringify(embModels.map(m => ({ id: m.ID, name: m.Name, driver: m.DriverClass })))}`);
            throw new Error(`Embedding model ${embeddingModelID} not found in AIEngine — ensure AIEngine is configured`);
        }
        return aiModel;
    }

    /** Create a BaseEmbeddings instance for a given driver class */
    private createEmbeddingInstance(driverClass: string): BaseEmbeddings {
        const apiKey = GetAIAPIKey(driverClass);
        if (!apiKey) {
            throw new Error(`No API key found for embedding driver ${driverClass} — set AI_VENDOR_API_KEY__${driverClass} in .env`);
        }
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(BaseEmbeddings, driverClass, apiKey);
        if (!instance) throw new Error(`Failed to create embedding instance for ${driverClass}`);
        return instance;
    }

    /** Create a VectorDBBase instance for a given class key */
    private createVectorDBInstance(classKey: string): VectorDBBase {
        const apiKey = GetAIAPIKey(classKey);
        if (!apiKey) {
            throw new Error(`No API key found for vector DB ${classKey} — set AI_VENDOR_API_KEY__${classKey} in .env`);
        }
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(VectorDBBase, classKey, apiKey);
        if (!instance) throw new Error(`Failed to create vector DB instance for ${classKey}`);
        return instance;
    }

    /** SHA-1 deterministic vector ID for a content item */
    private contentItemVectorId(contentItemId: string): string {
        return crypto.createHash('sha1').update(`content-item_${contentItemId}`).digest('hex');
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
    private buildEmbeddingChunks(item: MJContentItemEntity): string[] {
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

        // Chunk using TextChunker for token-aware splitting
        LogStatus(`[Autotag] Chunking embedding text for "${item.Name}" (${full.length} chars, ~${Math.ceil(full.length / 4)} tokens)`);
        try {
            const chunkParams: ChunkTextParams = {
                Text: full,
                MaxChunkTokens: AutotagBaseEngine.MAX_EMBEDDING_TOKENS,
                OverlapTokens: 100,
            };
            const chunks = TextChunker.ChunkText(chunkParams);
            LogStatus(`[Autotag] Split into ${chunks.length} chunks for embedding`);
            return chunks.map(c => c.Text);
        } catch {
            // Fallback: simple character-based splitting
            const result: string[] = [];
            for (let i = 0; i < full.length; i += charLimit) {
                result.push(full.substring(i, i + charLimit));
            }
            return result;
        }
    }

    /** Build metadata stored alongside the vector — truncate large text fields */
    private buildVectorMetadata(
        item: MJContentItemEntity,
        tags: string[] | undefined
    ): Record<string, string | number | boolean | string[]> {
        const META_TEXT_LIMIT = 1000;
        const meta: Record<string, string | number | boolean | string[]> = {
            RecordID: item.ID,
            Entity: 'MJ: Content Items',
            ContentSourceID: item.ContentSourceID,
            ContentSourceTypeID: item.ContentSourceTypeID,
        };
        if (item.Name) meta['Title'] = item.Name.substring(0, META_TEXT_LIMIT);
        if (item.Description) meta['Description'] = item.Description.substring(0, META_TEXT_LIMIT);
        if (item.URL) meta['URL'] = item.URL;
        if (tags && tags.length > 0) meta['Tags'] = tags;
        return meta;
    }

    /** Load all tags for the given items in a single RunView call */
    private async loadTagsForItems(
        items: MJContentItemEntity[],
        contextUser: UserInfo
    ): Promise<Map<string, string[]>> {
        const tagMap = new Map<string, string[]>();
        const rv = new RunView();
        const ids = items.map(i => `'${i.ID}'`).join(',');
        const result = await rv.RunView<MJContentItemTagEntity>({
            EntityName: 'MJ: Content Item Tags',
            ExtraFilter: `ItemID IN (${ids})`,
            ResultType: 'entity_object'
        }, contextUser);

        if (result.Success) {
            for (const tag of result.Results) {
                const existing = tagMap.get(tag.ItemID) ?? [];
                existing.push(tag.Tag);
                tagMap.set(tag.ItemID, existing);
            }
        }
        return tagMap;
    }

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

        // Load the content source + type maps for this single item
        const { sourceMap, typeMap } = await this.loadContentSourceAndTypeMaps([contentItem], contextUser);

        // Resolve infrastructure for this item
        const groups = this.groupItemsByInfrastructure([contentItem], sourceMap, typeMap);
        if (groups.size === 0) {
            LogStatus(`[Dedup] No vector infrastructure found for item ${contentItem.ID}, skipping vector dedup`);
            return;
        }

        const [groupKey] = groups.entries().next().value as [string, MJContentItemEntity[]];
        const infra = await this.resolveGroupInfrastructure(groupKey, contextUser);

        // Embed the item's text
        const text = contentItem.Text.trim();
        const truncated = text.length > 8000 ? text.substring(0, 8000) : text;

        await this.EmbeddingRateLimiter.Acquire(Math.ceil(truncated.length / 4));

        const modelRunner = new AIModelRunner();
        const embeddingPromptID = this.resolveEmbeddingPromptID();
        const runResult = await modelRunner.RunEmbedding({
            ModelID: infra.embeddingModelID,
            Texts: [truncated],
            PromptID: embeddingPromptID ?? undefined,
            ContextUser: contextUser,
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
