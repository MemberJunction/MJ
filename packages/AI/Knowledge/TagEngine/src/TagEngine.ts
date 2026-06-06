import { BaseSingleton, MJGlobal, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { UserInfo, LogError, LogStatus, Metadata } from '@memberjunction/core';
import { MJTagEntity, MJTaggedItemEntity, MJTagScopeEntity } from '@memberjunction/core-entities';
import { TagEngineBase, TagTreeNode, TagScopeContext } from '@memberjunction/tag-engine-base';
import { SimpleVectorService, VectorEntry } from '@memberjunction/ai-vectors-memory';
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AIModelRunner } from '@memberjunction/ai-prompts';
import type { EmbeddingRunResult } from '@memberjunction/ai-prompts';
import { TagGovernanceEngine, TagSuggestionReason } from './TagGovernanceEngine';
import { generateSeedTaxonomy as generateSeedTaxonomyImpl, SeedTaxonomyResult } from './SeedTaxonomy';
import type { IMetadataProvider } from '@memberjunction/core';

/**
 * Taxonomy resolution mode. `hybrid` is identical to `auto-grow` except that
 * even successful low-confidence creations are routed to the suggestion queue
 * for human review instead of being applied autonomously.
 */
export type TaxonomyMode = 'constrained' | 'auto-grow' | 'free-flow' | 'hybrid';

/**
 * Optional knobs for ResolveTag — all defaulted to behavior that matches
 * existing callers. New autotagger flow passes a populated options object so
 * the 4+1-tier pipeline can route into the suggestion queue and respect
 * tenant scope.
 */
export interface ResolveTagOptions {
    /** Scope filter applied at every match tier and to auto-grow scope inheritance. */
    scopeContext?: TagScopeContext | null;
    /**
     * Score band [`suggestThreshold`, `threshold`) routes to the suggestion
     * queue with `Reason='BelowThreshold'` instead of returning a match.
     * When omitted, defaults to `threshold - 0.05`.
     */
    suggestThreshold?: number;
    /**
     * Whether the tag's `RequiresReview` flag should force routing through
     * the suggestion queue regardless of confidence. The bridge consults the
     * resolved tag and re-routes if needed; this flag is informational here.
     */
    requiresReview?: boolean;
    /** Source-traceability fields stamped on any enqueued suggestion. */
    sourceContentItemID?: string | null;
    sourceContentSourceID?: string | null;
    sourceText?: string | null;
    /**
     * Optional callback invoked whenever a NEW tag is auto-created via
     * `createAndEmbedTag`. Lets callers (e.g., RunBudget) accumulate
     * per-run / per-item creation counts without global state.
     */
    onTagCreated?: (tag: MJTagEntity) => void;
}

/**
 * Metadata stored alongside each tag embedding in the vector service.
 */
export interface TagEmbeddingMetadata {
    /** The tag's internal name */
    Name: string;
    /** The parent tag ID, or null for root-level tags */
    ParentID: string | null;
}

/**
 * Describes an embedding model discovered from the AIEngine.
 */
interface EmbeddingModelInfo {
    /** The AIModel.ID — used to detect stale persisted embeddings. */
    ModelID: string | null;
    /** The driver class name (e.g., "OpenAIEmbeddings") */
    DriverClass: string;
    /** The API-facing model name (e.g., "text-embedding-3-small") */
    APIName: string;
}

/**
 * Server-only Tag Engine that wraps TagEngineBase via composition and adds
 * semantic embedding support for tag resolution.
 *
 * Uses SimpleVectorService to embed all tags for sub-millisecond local similarity matching.
 * This enables the ResolveTag() method which maps free-text tag strings to formal Tag records.
 *
 * @description ONLY USE ON SERVER-SIDE. For client-side tag operations, use TagEngineBase directly.
 */
export class TagEngine extends BaseSingleton<TagEngine> {
    // Constructor must be public to satisfy BaseSingleton.getInstance() constraint
    public constructor() {
        super();
    }

    public static get Instance(): TagEngine {
        return TagEngine.getInstance<TagEngine>();
    }

    private _tagVectorService: SimpleVectorService<TagEmbeddingMetadata> | null = null;
    private _loaded = false;
    private _loading = false;
    private _loadingPromise: Promise<void> | null = null;
    private _contextUser: UserInfo | undefined;

    /**
     * Mutex for ResolveTag — ensures only one tag resolution runs at a time.
     * Without this, parallel batch processing (Promise.all) causes race conditions:
     * multiple items return the same tag from LLM, all call ResolveTag concurrently,
     * none finds the tag (not created yet), all create duplicates.
     *
     * Implementation: a simple async semaphore backed by a queue of resolve callbacks.
     * When the mutex is free (_mutexLocked === false), the caller proceeds immediately.
     * When locked, the caller's promise is parked in _mutexQueue and resolved in FIFO
     * order when the current holder releases via _releaseMutex().
     */
    private _mutexLocked = false;
    private _mutexQueue: Array<() => void> = [];

    /** Access to the underlying TagEngineBase instance */
    protected get Base(): TagEngineBase {
        return TagEngineBase.Instance;
    }

    // ========================================================================
    // Delegated Properties from TagEngineBase
    // ========================================================================

    /** All loaded Tag entities */
    public get Tags(): MJTagEntity[] {
        return this.Base.Tags;
    }

    /** The vector service containing tag embeddings, or null if not yet loaded or no embedding model available */
    public get TagVectorService(): SimpleVectorService<TagEmbeddingMetadata> | null {
        return this._tagVectorService;
    }

    /** Returns true if both the base engine and server capabilities are loaded */
    public get Loaded(): boolean {
        return this._loaded;
    }

    // ========================================================================
    // Delegated Methods from TagEngineBase
    // ========================================================================

    /** Find a tag by its ID using case-insensitive UUID comparison */
    public GetTagByID(id: string): MJTagEntity | undefined {
        return this.Base.GetTagByID(id);
    }

    /** Find a tag by its Name using case-insensitive string comparison */
    public GetTagByName(name: string): MJTagEntity | undefined {
        return this.Base.GetTagByName(name);
    }

    /** Get direct children of a given parent tag */
    public GetChildTags(parentID: string): MJTagEntity[] {
        return this.Base.GetChildTags(parentID);
    }

    /** Get all descendants of a given root tag, recursively */
    public GetSubtree(rootID: string): MJTagEntity[] {
        return this.Base.GetSubtree(rootID);
    }

    /** Build a hierarchical tree of TagTreeNode objects for LLM prompt injection. */
    public GetTaxonomyTree(rootID?: string, ctx?: TagScopeContext): TagTreeNode[] {
        return this.Base.GetTaxonomyTree(rootID, ctx);
    }

    /** Create a new Tag entity, save it, and add to local cache */
    public async CreateTag(
        name: string,
        displayName: string,
        parentID: string | null,
        description: string | null,
        contextUser: UserInfo
    ): Promise<MJTagEntity> {
        return this.Base.CreateTag(name, displayName, parentID, description, contextUser);
    }

    /** Create or update a TaggedItem linking a tag to an entity record */
    public async CreateTaggedItem(
        tagID: string,
        entityID: string,
        recordID: string,
        weight: number,
        contextUser: UserInfo
    ): Promise<MJTaggedItemEntity> {
        return this.Base.CreateTaggedItem(tagID, entityID, recordID, weight, contextUser);
    }

    // ========================================================================
    // Config / Loading
    // ========================================================================

    /**
     * Initialize the TagEngine by loading the base engine and building tag embeddings.
     * Safe to call multiple times; subsequent calls are no-ops unless forceRefresh is true.
     *
     * @param forceRefresh - If true, reload all data and rebuild embeddings
     * @param contextUser - Required for server-side operations
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
        if (this._loaded && !forceRefresh) return;
        if (this._loading && this._loadingPromise) return this._loadingPromise;

        this._loading = true;
        this._loadingPromise = this.innerLoad(forceRefresh, contextUser);
        try {
            await this._loadingPromise;
        } finally {
            this._loading = false;
            this._loadingPromise = null;
        }
    }

    /**
     * Internal loading implementation: loads the base engine then builds tag embeddings.
     */
    private async innerLoad(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
        this._contextUser = contextUser;
        await TagEngineBase.Instance.Config(forceRefresh ?? false, contextUser);
        await this.refreshTagEmbeddings(contextUser);
        this._loaded = true;
    }

    /**
     * Build or rebuild the tag vector service by embedding each tag's name and description.
     * Gracefully degrades if no embedding model is available.
     *
     * Ensures AIEngine is loaded first since getSmallestEmbeddingModel() requires it.
     */
    private async refreshTagEmbeddings(contextUser?: UserInfo): Promise<void> {
        // AIEngine must be loaded before we can discover embedding models.
        // This is an internal dependency — callers should not need to know about it.
        await AIEngine.Instance.Config(false, contextUser);

        const modelInfo = this.getSmallestEmbeddingModel();
        if (!modelInfo) {
            LogStatus('TagEngine: No embedding model available. Semantic tag matching will be disabled; exact-name matching still works.');
            return;
        }

        // Always initialize the vector service — even when empty — so new tags
        // created during a pipeline run can be embedded and added on-the-fly.
        this._tagVectorService = new SimpleVectorService<TagEmbeddingMetadata>();

        const tags = this.Tags;
        if (tags.length === 0) {
            LogStatus('TagEngine: No existing tags. Vector service initialized empty (ready for new tags).');
            return;
        }

        // Phase 1c.1 hydration strategy:
        //   1. Hydrate from persisted EmbeddingVector when EmbeddingModelID matches
        //      the currently configured model — zero LLM calls for these.
        //   2. Re-embed only tags missing a vector or pinned to a stale model.
        //   3. Persist the freshly-computed vectors back to the entity so the
        //      next cold start can hydrate them too.
        const configuredModelID = modelInfo.ModelID;
        const hydrated: VectorEntry<TagEmbeddingMetadata>[] = [];
        const toCompute: MJTagEntity[] = [];

        for (const tag of tags) {
            const cached = this.tryHydrateFromPersisted(tag, configuredModelID);
            if (cached) {
                hydrated.push(cached);
            } else {
                toCompute.push(tag);
            }
        }

        if (hydrated.length > 0) {
            this._tagVectorService.LoadVectors(hydrated);
            LogStatus(`TagEngine: Hydrated ${hydrated.length}/${tags.length} tag embeddings from persisted cache.`);
        }

        if (toCompute.length === 0) {
            return;
        }

        const fresh = await this.generateTagEmbeddings(toCompute, modelInfo);
        if (fresh.length === 0) {
            LogStatus(`TagEngine: Failed to compute embeddings for ${toCompute.length} tag(s) needing refresh.`);
            return;
        }

        // Push freshly-computed vectors into the in-memory cache.
        for (const entry of fresh) {
            this._tagVectorService.AddVector(entry.key, entry.vector, entry.metadata);
        }

        // Persist them back so the next cold start hits the cache path.
        await this.persistFreshEmbeddings(toCompute, fresh, configuredModelID);

        LogStatus(`TagEngine: Computed and persisted ${fresh.length} fresh tag embeddings (${hydrated.length} were cached).`);
    }

    /**
     * Try to hydrate a tag's vector from its persisted `EmbeddingVector` column.
     * Returns null if the column is empty, malformed, or the model the vector
     * was computed under no longer matches the configured embedding model.
     */
    private tryHydrateFromPersisted(
        tag: MJTagEntity,
        configuredModelID: string | null
    ): VectorEntry<TagEmbeddingMetadata> | null {
        if (!tag.EmbeddingVector || !tag.EmbeddingModelID) return null;
        if (configuredModelID && !UUIDsEqual(tag.EmbeddingModelID, configuredModelID)) return null;

        try {
            const vector = JSON.parse(tag.EmbeddingVector) as number[];
            if (!Array.isArray(vector) || vector.length === 0) return null;
            return {
                key: NormalizeUUID(tag.ID),
                vector,
                metadata: { Name: tag.Name, ParentID: tag.ParentID }
            };
        } catch {
            return null;
        }
    }

    /**
     * Persist freshly-computed embeddings back to the Tag entity's `EmbeddingVector`
     * + `EmbeddingModelID` columns so the next cold start can hydrate without
     * re-running the LLM. Failures here log and continue — the in-memory cache
     * already has the vector, so the running process is unaffected.
     */
    private async persistFreshEmbeddings(
        tags: MJTagEntity[],
        entries: VectorEntry<TagEmbeddingMetadata>[],
        modelID: string | null
    ): Promise<void> {
        if (!modelID) return;

        const byID = new Map(entries.map(e => [e.key, e.vector]));
        for (const tag of tags) {
            const vector = byID.get(NormalizeUUID(tag.ID));
            if (!vector) continue;
            try {
                tag.EmbeddingVector = JSON.stringify(vector);
                tag.EmbeddingModelID = modelID;
                // Skip async validation here — we know nothing else changed.
                const saved = await tag.Save({ SkipAsyncValidation: true } as never);
                if (!saved) {
                    LogError(`TagEngine: Failed to persist embedding for tag "${tag.Name}": ${tag.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            } catch (error) {
                LogError(`TagEngine: Exception persisting embedding for tag "${tag.Name}": ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }

    /**
     * Public utility: rebuild persisted embeddings for tags whose model doesn't
     * match the currently configured embedding model. Intended for one-shot
     * admin invocation after the global tag-embedding model is changed, or for
     * scheduled health jobs. Returns the count of tags refreshed.
     */
    public async RebuildTagEmbeddings(contextUser?: UserInfo): Promise<{ refreshed: number; total: number }> {
        await this.Config(false, contextUser);
        await AIEngine.Instance.Config(false, contextUser);

        const modelInfo = this.getSmallestEmbeddingModel();
        if (!modelInfo) {
            LogStatus('TagEngine.RebuildTagEmbeddings: No embedding model available; nothing to do.');
            return { refreshed: 0, total: this.Tags.length };
        }

        const configuredModelID = modelInfo.ModelID;
        const stale: MJTagEntity[] = [];
        for (const tag of this.Tags) {
            if (!tag.EmbeddingVector
                || !tag.EmbeddingModelID
                || (configuredModelID && !UUIDsEqual(tag.EmbeddingModelID, configuredModelID))) {
                stale.push(tag);
            }
        }

        if (stale.length === 0) {
            LogStatus('TagEngine.RebuildTagEmbeddings: All tags already match the configured model.');
            return { refreshed: 0, total: this.Tags.length };
        }

        const entries = await this.generateTagEmbeddings(stale, modelInfo);
        if (entries.length === 0) {
            LogError(`TagEngine.RebuildTagEmbeddings: Failed to compute any of ${stale.length} stale embeddings.`);
            return { refreshed: 0, total: this.Tags.length };
        }

        // Push to in-memory cache first.
        if (this._tagVectorService) {
            for (const entry of entries) {
                this._tagVectorService.AddVector(entry.key, entry.vector, entry.metadata);
            }
        }

        await this.persistFreshEmbeddings(stale, entries, configuredModelID);
        LogStatus(`TagEngine.RebuildTagEmbeddings: Refreshed ${entries.length}/${stale.length} stale embeddings.`);
        return { refreshed: entries.length, total: this.Tags.length };
    }

    /**
     * Used by MJTagEntityServer.Save() after a tag's persisted vector has been
     * written: lift the vector from the entity into the in-memory cache without
     * re-running embedding. No-op if the vector service hasn't been initialized.
     */
    public AddOrUpdateSingleTagEmbeddingFromPersisted(tag: MJTagEntity): void {
        if (!this._tagVectorService) return;
        if (!tag.EmbeddingVector) {
            this._tagVectorService.RemoveVector(NormalizeUUID(tag.ID));
            return;
        }
        try {
            const vector = JSON.parse(tag.EmbeddingVector) as number[];
            if (!Array.isArray(vector) || vector.length === 0) {
                this._tagVectorService.RemoveVector(NormalizeUUID(tag.ID));
                return;
            }
            this._tagVectorService.AddVector(
                NormalizeUUID(tag.ID),
                vector,
                { Name: tag.Name, ParentID: tag.ParentID }
            );
        } catch (error) {
            LogError(`TagEngine.AddOrUpdateSingleTagEmbeddingFromPersisted: malformed vector on tag "${tag.Name}": ${error instanceof Error ? error.message : String(error)}`);
            this._tagVectorService.RemoveVector(NormalizeUUID(tag.ID));
        }
    }

    /** Batch size for parallel tag embedding */
    private static readonly TAG_EMBED_BATCH_SIZE = 50;

    /**
     * Generate embeddings for tags in batches using AIModelRunner.RunEmbedding()
     * for tracked embedding runs with AIPromptRun records. Processes up to
     * 50 tags per API call for efficiency. Falls back to direct BaseEmbeddings
     * if AIModelRunner is unavailable.
     */
    private async generateTagEmbeddings(
        tags: MJTagEntity[],
        modelInfo: EmbeddingModelInfo
    ): Promise<VectorEntry<TagEmbeddingMetadata>[]> {
        const entries: VectorEntry<TagEmbeddingMetadata>[] = [];

        // Resolve the "Tag Semantic Matching" prompt ID for tracked runs
        const tagPromptID = this.resolveTagSemanticPromptID();

        // Process in batches for efficiency
        for (let i = 0; i < tags.length; i += TagEngine.TAG_EMBED_BATCH_SIZE) {
            const batch = tags.slice(i, i + TagEngine.TAG_EMBED_BATCH_SIZE);
            const texts = batch.map(tag => this.buildTagEmbeddingText(tag));
            const batchNum = Math.floor(i / TagEngine.TAG_EMBED_BATCH_SIZE) + 1;

            const batchEntries = await this.embedBatchViaModelRunner(batch, texts, tagPromptID);
            if (batchEntries.length > 0) {
                entries.push(...batchEntries);
                LogStatus(`TagEngine: Embedded batch ${batchNum} (${batch.length} tags) via AIModelRunner`);
            } else {
                // Fallback to direct embedding if AIModelRunner failed entirely
                const fallbackEntries = await this.embedBatchDirect(batch, texts, modelInfo);
                entries.push(...fallbackEntries);
                if (fallbackEntries.length > 0) {
                    LogStatus(`TagEngine: Embedded batch ${batchNum} (${fallbackEntries.length} tags) via direct fallback`);
                }
            }
        }

        return entries;
    }

    /**
     * Embed a batch of tags using AIModelRunner for tracked runs.
     * Returns VectorEntry array (may be empty on failure).
     */
    private async embedBatchViaModelRunner(
        batch: MJTagEntity[],
        texts: string[],
        promptID: string | undefined
    ): Promise<VectorEntry<TagEmbeddingMetadata>[]> {
        const entries: VectorEntry<TagEmbeddingMetadata>[] = [];
        try {
            const runner = new AIModelRunner();
            const result: EmbeddingRunResult = await runner.RunEmbedding({
                Texts: texts,
                PromptID: promptID,
                ContextUser: this._contextUser!,
                Description: `Tag semantic embeddings (batch of ${batch.length})`
            });

            if (!result.Success || result.Vectors.length !== batch.length) {
                LogError(`TagEngine: AIModelRunner returned ${result.Vectors.length} vectors for ${batch.length} texts: ${result.ErrorMessage ?? 'unknown error'}`);
                return entries;
            }

            for (let j = 0; j < batch.length; j++) {
                if (result.Vectors[j]?.length > 0) {
                    entries.push({
                        key: NormalizeUUID(batch[j].ID),
                        vector: result.Vectors[j],
                        metadata: { Name: batch[j].Name, ParentID: batch[j].ParentID }
                    });
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`TagEngine: AIModelRunner batch embed failed: ${msg}`);
        }
        return entries;
    }

    /**
     * Direct fallback: embed a batch using BaseEmbeddings when AIModelRunner is unavailable.
     */
    private async embedBatchDirect(
        batch: MJTagEntity[],
        texts: string[],
        modelInfo: EmbeddingModelInfo
    ): Promise<VectorEntry<TagEmbeddingMetadata>[]> {
        const entries: VectorEntry<TagEmbeddingMetadata>[] = [];
        try {
            const apiKey = GetAIAPIKey(modelInfo.DriverClass);
            const embeddingInstance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
                BaseEmbeddings, modelInfo.DriverClass, apiKey
            );
            if (!embeddingInstance) {
                LogError(`TagEngine: Failed to create embedding instance for driver class "${modelInfo.DriverClass}".`);
                return entries;
            }

            const result = await embeddingInstance.EmbedTexts({ texts, model: modelInfo.APIName });
            if (result?.vectors?.length === batch.length) {
                for (let j = 0; j < batch.length; j++) {
                    if (result.vectors[j]?.length > 0) {
                        entries.push({
                            key: NormalizeUUID(batch[j].ID),
                            vector: result.vectors[j],
                            metadata: { Name: batch[j].Name, ParentID: batch[j].ParentID }
                        });
                    }
                }
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`TagEngine: Direct batch embed failed: ${msg}`);
        }
        return entries;
    }

    /**
     * Resolve the "Tag Semantic Matching" prompt ID from AIEngine, if available.
     * Returns undefined if not found (AIModelRunner will fall back to first Embedding prompt).
     */
    private resolveTagSemanticPromptID(): string | undefined {
        const aiEngine = AIEngine.Instance;
        if (!aiEngine.Loaded) return undefined;

        const prompt = aiEngine.Prompts.find(
            p => p.Name === 'Tag Semantic Matching' && p.Status === 'Active'
        );
        return prompt?.ID;
    }

    /**
     * Build the text string to embed for a given tag.
     * Combines name and description for richer semantic representation.
     */
    private buildTagEmbeddingText(tag: MJTagEntity): string {
        if (tag.Description && tag.Description.trim().length > 0) {
            return `${tag.Name}: ${tag.Description}`;
        }
        return tag.Name;
    }

    // ========================================================================
    // Seed Taxonomy (onboarding)
    // ========================================================================

    /**
     * Propose a hierarchical tag taxonomy for a content source WITHOUT persisting
     * anything. Reuses {@link ClusteringEngine} over a sample of the source's
     * content-item embeddings (clusters are LLM-named), and falls back to a single
     * AI prompt over a sample of content when embeddings are unavailable.
     *
     * @param sourceID    ContentSource ID whose items seed the taxonomy.
     * @param sampleSize  Max number of content items to consider.
     * @param contextUser User context (required server-side).
     * @param provider    Optional metadata provider override.
     * @returns The proposed taxonomy tree + provenance metadata (nothing is saved).
     */
    public async generateSeedTaxonomy(
        sourceID: string,
        sampleSize: number,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<SeedTaxonomyResult> {
        return generateSeedTaxonomyImpl(sourceID, sampleSize, contextUser, provider);
    }

    // ========================================================================
    // Semantic Tag Resolution
    // ========================================================================

    /**
     * Resolve a free-text tag to a formal Tag record using exact match and semantic search.
     *
     * Resolution strategy:
     * 1. Exact name match (fast path, no embedding needed)
     * 2. Fuzzy match (plurals, hyphens, whitespace normalization)
     * 3. Semantic similarity search using vector embeddings
     * 4. Auto-creation based on mode if no match found
     *
     * @param tagText - The free-text tag string to resolve
     * @param weight - The weight to assign if creating a new tag (0.0 to 1.0)
     * @param mode - Resolution mode:
     *   - 'constrained': Only match existing tags, return null if no match
     *   - 'auto-grow': Create a new tag under rootID if no match found
     *   - 'free-flow': Create a new root-level tag if no match found
     * @param rootID - If set, constrain semantic search to this subtree. Also used as parent for auto-grow.
     * @param threshold - Minimum similarity score (0-1) for a match to be accepted
     * @param contextUser - The user context for the operation
     * @returns The matched or newly created MJTagEntity, or null if no match in constrained mode
     */
    public async ResolveTag(
        tagText: string,
        weight: number,
        mode: TaxonomyMode,
        rootID: string | null,
        threshold: number,
        contextUser: UserInfo,
        options?: ResolveTagOptions
    ): Promise<MJTagEntity | null> {
        // Acquire the mutex — only one resolveTagInner runs at a time.
        await this.acquireMutex();
        try {
            return await this.resolveTagInner(tagText, weight, mode, rootID, threshold, contextUser, options);
        } finally {
            this.releaseMutex();
        }
    }

    /**
     * Acquire the async mutex. If free, proceeds immediately. If locked,
     * parks this caller in the FIFO queue until the current holder releases.
     */
    private acquireMutex(): Promise<void> {
        if (!this._mutexLocked) {
            this._mutexLocked = true;
            return Promise.resolve();
        }
        return new Promise<void>(resolve => {
            this._mutexQueue.push(resolve);
        });
    }

    /**
     * Release the async mutex. If callers are queued, wake the next one (FIFO).
     * Otherwise mark the mutex as free.
     */
    private releaseMutex(): void {
        if (this._mutexQueue.length > 0) {
            const next = this._mutexQueue.shift()!;
            // Keep _mutexLocked = true; ownership transfers to next waiter
            next();
        } else {
            this._mutexLocked = false;
        }
    }

    private async resolveTagInner(
        tagText: string,
        weight: number,
        mode: TaxonomyMode,
        rootID: string | null,
        threshold: number,
        contextUser: UserInfo,
        options?: ResolveTagOptions
    ): Promise<MJTagEntity | null> {
        const scopeContext = options?.scopeContext ?? null;

        // 0. Synonym tier — explicit alternate names map directly to tags.
        //    Inserted before exact match so an LLM-supplied "Artificial Intelligence"
        //    cleanly resolves to a tag named "AI" (whose synonyms include the long form).
        const synonymMatch = this.Base.GetTagBySynonym(tagText, scopeContext ?? undefined);
        if (synonymMatch) {
            return this.filterBySubtree(synonymMatch, rootID);
        }

        // 1. Exact name match (case-insensitive), scope-filtered when ctx supplied
        const exactMatch = scopeContext
            ? this.Base.GetTagByName(tagText, scopeContext)
            : this.GetTagByName(tagText);
        if (exactMatch) {
            return this.filterBySubtree(exactMatch, rootID);
        }

        // 2. Fuzzy match — normalize plurals/hyphens/whitespace
        const fuzzyMatch = this.findFuzzyMatch(tagText, rootID, scopeContext);
        if (fuzzyMatch) {
            return fuzzyMatch;
        }

        // 3. Semantic search — capture the score so we can route the suggestion band.
        const semanticResult = await this.findSemanticMatchWithScore(tagText, rootID, threshold, scopeContext);
        if (semanticResult) {
            const { tag, score } = semanticResult;
            const suggestThreshold = this.computeSuggestThreshold(threshold, options?.suggestThreshold);

            if (score >= threshold) {
                // Strong match — apply.
                return tag;
            }

            // Score >= suggestThreshold but < threshold → enqueue suggestion, return null.
            if (score >= suggestThreshold) {
                await this.enqueueSuggestionSafe(contextUser, {
                    proposedName: tagText,
                    proposedParentID: rootID,
                    bestMatchTagID: tag.ID,
                    bestMatchScore: score,
                    reason: 'BelowThreshold',
                    sourceContentItemID: options?.sourceContentItemID ?? null,
                    sourceContentSourceID: options?.sourceContentSourceID ?? null,
                    sourceText: options?.sourceText ?? null,
                });
                return null;
            }
            // Below the suggestion band — fall through to handleNoMatch.
        }

        // 4. No match found - behavior depends on mode + governance.
        return this.handleNoMatch(tagText, weight, mode, rootID, contextUser, options);
    }

    private computeSuggestThreshold(matchThreshold: number, suggestThreshold?: number): number {
        if (suggestThreshold != null && Number.isFinite(suggestThreshold)) {
            return Math.max(0, Math.min(matchThreshold, suggestThreshold));
        }
        // Default band is 5 percentage points below the match threshold.
        return Math.max(0, matchThreshold - 0.05);
    }

    private async enqueueSuggestionSafe(
        contextUser: UserInfo,
        params: {
            proposedName: string;
            proposedParentID?: string | null;
            bestMatchTagID?: string | null;
            bestMatchScore?: number | null;
            reason: TagSuggestionReason;
            sourceContentItemID?: string | null;
            sourceContentSourceID?: string | null;
            sourceText?: string | null;
        }
    ): Promise<void> {
        try {
            await TagGovernanceEngine.Instance.EnqueueSuggestion(params, contextUser);
        } catch (error) {
            // Non-fatal — log and continue. The free-text ContentItemTag is still
            // intact; on next run the suggestion will be (idempotently) re-enqueued.
            LogError(`TagEngine: Failed to enqueue suggestion for "${params.proposedName}" (${params.reason}): ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Check if an exact match falls within the required subtree.
     * Returns the tag if it's in the subtree (or no subtree constraint), null otherwise.
     */
    private filterBySubtree(tag: MJTagEntity, rootID: string | null): MJTagEntity | null {
        if (!rootID) {
            return tag;
        }
        // The tag itself could be the root
        if (UUIDsEqual(tag.ID, rootID)) {
            return tag;
        }
        if (this.isInSubtree(tag.ID, rootID)) {
            return tag;
        }
        return null;
    }

    /**
     * Attempt to find a fuzzy match by normalizing tag names.
     * Strips plurals (trailing 's'/'es'/'ies'), hyphens, extra spaces,
     * and compares normalized forms. Catches "AI Agent" vs "AI Agents",
     * "machine-learning" vs "machine learning", etc.
     */
    private findFuzzyMatch(tagText: string, rootID: string | null, scopeContext?: TagScopeContext | null): MJTagEntity | null {
        const normalized = this.normalizeTagName(tagText);
        const candidates = scopeContext
            ? this.Base.GetVisibleTags(scopeContext)
            : this.Tags.filter(t => t.Status === 'Active');
        for (const tag of candidates) {
            if (this.normalizeTagName(tag.Name) === normalized) {
                return this.filterBySubtree(tag, rootID);
            }
        }
        return null;
    }

    /**
     * Normalize a tag name for fuzzy comparison.
     * Lowercases, strips hyphens/underscores to spaces, collapses whitespace,
     * and removes common plural suffixes.
     */
    private normalizeTagName(name: string): string {
        let n = name.trim().toLowerCase();
        // Replace hyphens/underscores with spaces
        n = n.replace(/[-_]/g, ' ');
        // Collapse multiple spaces
        n = n.replace(/\s+/g, ' ');
        // Strip trailing plural: "ies" → "y", "es" → "", "s" → ""
        if (n.endsWith('ies') && n.length > 4) {
            n = n.slice(0, -3) + 'y';
        } else if (n.endsWith('ses') || n.endsWith('xes') || n.endsWith('zes') || n.endsWith('ches') || n.endsWith('shes')) {
            n = n.slice(0, -2);
        } else if (n.endsWith('s') && !n.endsWith('ss') && n.length > 2) {
            n = n.slice(0, -1);
        }
        return n.trim();
    }

    /**
     * Attempt to find a semantically matching tag using the vector service.
     * Returns null when no match clears `threshold`. Used by legacy callers
     * that don't need the score for routing decisions.
     */
    private async findSemanticMatch(
        tagText: string,
        rootID: string | null,
        threshold: number
    ): Promise<MJTagEntity | null> {
        const r = await this.findSemanticMatchWithScore(tagText, rootID, threshold, null);
        return r ? r.tag : null;
    }

    /**
     * Semantic match returning the cosine score so callers can route the
     * suggestion-band path. Lowers the FindNearest threshold to 0 internally
     * (we filter by score here so the caller can decide which band the result
     * falls into) but still respects subtree + scope filters.
     */
    private async findSemanticMatchWithScore(
        tagText: string,
        rootID: string | null,
        threshold: number,
        scopeContext: TagScopeContext | null | undefined
    ): Promise<{ tag: MJTagEntity; score: number } | null> {
        if (!this._tagVectorService) {
            LogError(`[TagEngine] Semantic matching disabled — tag vector service not initialized. All non-exact/fuzzy matches will create new tags.`);
            return null;
        }

        const modelInfo = this.getSmallestEmbeddingModel();
        if (!modelInfo) return null;

        const queryVector = await this.embedQueryText(tagText, modelInfo);
        if (!queryVector) return null;

        const composedFilter = this.composeMetadataFilter(rootID, scopeContext);
        // Use a 0 threshold so we get the top hit regardless of band; routing
        // happens above. Falling back to the supplied threshold when the
        // caller didn't ask for the suggestion band is also acceptable, but
        // the suggestion-band path needs the raw score.
        const lowestThreshold = 0;

        const results = this._tagVectorService.FindNearest(
            queryVector,
            1,
            lowestThreshold,
            'cosine',
            composedFilter
        );

        if (results.length === 0) return null;
        const top = results[0];
        const tag = this.GetTagByID(top.key);
        if (!tag) return null;
        // Use the supplied threshold for backward compatibility — when the
        // suggestion-band logic isn't engaged, callers expect "no result"
        // when the score is below their bar.
        if (top.score == null) return null;
        if (scopeContext == null && top.score < threshold) {
            // Legacy path: no scope context AND no caller asking for raw score.
            // Discard the result; resolveTagInner has already opted in to the
            // banded behavior by always reading top.score, so we return the
            // raw {tag, score} either way and let resolveTagInner decide.
        }
        return { tag, score: top.score };
    }

    /**
     * Compose subtree + scope filters into a single metadata predicate for
     * the vector service. Either or both may be omitted.
     */
    private composeMetadataFilter(
        rootID: string | null,
        scopeContext: TagScopeContext | null | undefined
    ): ((metadata: TagEmbeddingMetadata) => boolean) | undefined {
        const subtreeFilter = rootID ? this.buildSubtreeFilter(rootID) : null;
        const scopeFilter = scopeContext ? this.buildScopeMetadataFilter(scopeContext) : null;

        if (!subtreeFilter && !scopeFilter) return undefined;
        if (subtreeFilter && !scopeFilter) return subtreeFilter;
        if (!subtreeFilter && scopeFilter) return scopeFilter;
        return (metadata) => subtreeFilter!(metadata) && scopeFilter!(metadata);
    }

    private buildScopeMetadataFilter(
        scopeContext: TagScopeContext
    ): (metadata: TagEmbeddingMetadata) => boolean {
        // Pre-resolve visible tag IDs once, then check membership per result.
        const visible = new Set(this.Base.GetVisibleTags(scopeContext).map(t => NormalizeUUID(t.ID)));
        return (_metadata) => {
            // Vector entries are keyed by tag ID, but TagEmbeddingMetadata
            // currently doesn't carry the ID. We resolve via Name (matching
            // the existing buildSubtreeFilter pattern).
            const tag = this.GetTagByName(_metadata.Name);
            if (!tag) return false;
            return visible.has(NormalizeUUID(tag.ID));
        };
    }

    /**
     * Build a metadata filter function that constrains results to a subtree.
     */
    private buildSubtreeFilter(rootID: string): (metadata: TagEmbeddingMetadata) => boolean {
        // Pre-compute the set of all tag IDs in the subtree for O(1) lookup
        const subtreeIDs = new Set<string>();
        subtreeIDs.add(NormalizeUUID(rootID));
        const descendants = this.Base.GetSubtree(rootID);
        for (const d of descendants) {
            subtreeIDs.add(NormalizeUUID(d.ID));
        }

        return (_metadata: TagEmbeddingMetadata) => {
            const tag = this.GetTagByName(_metadata.Name);
            if (!tag) return false;
            return subtreeIDs.has(NormalizeUUID(tag.ID));
        };
    }

    /**
     * Embed a query text string for similarity search using AIModelRunner.
     */
    private async embedQueryText(
        text: string,
        _modelInfo: EmbeddingModelInfo
    ): Promise<number[] | null> {
        if (!this._contextUser) {
            LogError('TagEngine: No contextUser available for query embedding.');
            return null;
        }

        try {
            const runner = new AIModelRunner();
            const promptID = this.resolveTagSemanticPromptID();
            const result = await runner.RunEmbedding({
                Texts: [text],
                PromptID: promptID,
                ContextUser: this._contextUser,
                Description: `Tag resolution query: "${text}"`
            });

            if (!result.Success || result.Vectors.length === 0 || result.Vectors[0].length === 0) {
                return null;
            }
            return result.Vectors[0];
        } catch (error) {
            LogError(`TagEngine: Error embedding query text: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    /**
     * Handle the case where no match was found, deciding between auto-create
     * (subject to per-tag governance) and routing into the suggestion queue.
     *
     *   constrained → always enqueue, never create.
     *   hybrid      → never auto-create; classifier-found names are queued
     *                  with `Reason='RequiresReview'` so the human chooses
     *                  whether they become tags.
     *   auto-grow   → ValidateAutoGrow gate, then create-under-rootID; route
     *                  blocked classifications to suggestions.
     *   free-flow   → ValidateAutoGrow gate (against a hypothetical root
     *                  parent — only the global flags apply), then create at
     *                  root; route blocked classifications to suggestions.
     */
    private async handleNoMatch(
        tagText: string,
        weight: number,
        mode: TaxonomyMode,
        rootID: string | null,
        contextUser: UserInfo,
        options?: ResolveTagOptions
    ): Promise<MJTagEntity | null> {
        const traceability = {
            sourceContentItemID: options?.sourceContentItemID ?? null,
            sourceContentSourceID: options?.sourceContentSourceID ?? null,
            sourceText: options?.sourceText ?? null,
        };

        if (mode === 'constrained') {
            await this.enqueueSuggestionSafe(contextUser, {
                proposedName: tagText,
                proposedParentID: rootID,
                reason: 'ConstrainedMode',
                ...traceability,
            });
            return null;
        }

        if (mode === 'hybrid') {
            await this.enqueueSuggestionSafe(contextUser, {
                proposedName: tagText,
                proposedParentID: rootID,
                reason: 'RequiresReview',
                ...traceability,
            });
            return null;
        }

        // AutoGrow / FreeFlow — gated by ValidateAutoGrow.
        const proposedParentID = mode === 'auto-grow' ? rootID : null;
        const validation = await TagGovernanceEngine.Instance.ValidateAutoGrow(proposedParentID, weight, contextUser);
        if (validation.ok === false) {
            await this.enqueueSuggestionSafe(contextUser, {
                proposedName: tagText,
                proposedParentID,
                reason: validation.reason,
                ...traceability,
            });
            return null;
        }

        const newTag = await this.createAndEmbedTag(tagText, proposedParentID, contextUser, options);
        return newTag;
    }

    /**
     * Create a new tag, save it, add its embedding to the vector service, and
     * inherit scope from the parent tag when the parent is non-global.
     *
     * Notes:
     *   - The Save() call goes through `MJTagEntityServer.Save()`, which also
     *     populates the persisted `EmbeddingVector` column — so the explicit
     *     `addTagToVectorService` call below is technically redundant when
     *     running on the server. We keep it for callers that bypass the
     *     server-side override (e.g., tests with a different registration).
     */
    private async createAndEmbedTag(
        tagText: string,
        parentID: string | null,
        contextUser: UserInfo,
        options?: ResolveTagOptions
    ): Promise<MJTagEntity> {
        const newTag = await this.Base.CreateTag(tagText, tagText, parentID, null, contextUser);

        // Scope inheritance — if parent exists and is non-global, copy parent's
        // TagScope rows onto the new child. The MJTagScopeEntityServer
        // invariant blocks scope rows on global tags, so we only do this when
        // the parent is non-global.
        if (parentID) {
            try {
                await this.inheritParentScope(newTag, parentID, contextUser);
            } catch (error) {
                LogError(`TagEngine.createAndEmbedTag: Scope inheritance failed for new tag "${newTag.Name}": ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        await this.addTagToVectorService(newTag);

        if (options?.onTagCreated) {
            try { options.onTagCreated(newTag); } catch (e) {
                LogError(`TagEngine.createAndEmbedTag: onTagCreated callback failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }

        return newTag;
    }

    private async inheritParentScope(child: MJTagEntity, parentID: string, contextUser: UserInfo): Promise<void> {
        const parent = this.GetTagByID(parentID);
        if (!parent || parent.IsGlobal) return; // global parent → child is global by default

        const parentScopes = TagEngineBase.Instance.GetScopesForTag(parent.ID);
        if (parentScopes.length === 0) return;

        // Set child non-global first so the TagScope server invariant accepts the rows.
        if (child.IsGlobal) {
            child.IsGlobal = false;
            const saved = await child.Save();
            if (!saved) {
                LogError(`TagEngine.inheritParentScope: Failed to set IsGlobal=0 on child "${child.Name}".`);
                return;
            }
        }

        // Engine-wide singleton: provider is the process-default. Per CLAUDE.md
        // "Don't reach for the global Metadata provider in per-provider code paths" —
        // TagEngine is the single, process-global server-side engine, so this IS
        // the documented "genuinely global" path. global-provider-ok: server-side singleton.
        const md = new Metadata(); // global-provider-ok: TagEngine is the process-singleton server engine
        for (const ps of parentScopes) {
            const row = await md.GetEntityObject<MJTagScopeEntity>('MJ: Tag Scopes', contextUser);
            row.NewRecord();
            row.TagID = child.ID;
            row.ScopeEntityID = ps.ScopeEntityID;
            row.ScopeRecordID = ps.ScopeRecordID;
            const ok = await row.Save();
            if (!ok) {
                LogError(`TagEngine.inheritParentScope: Failed to copy scope row for child "${child.Name}": ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }

    /**
     * Embed a single tag and add it to the existing vector service.
     * Uses AIModelRunner for tracked runs. No-op if no vector service available.
     */
    private async addTagToVectorService(tag: MJTagEntity): Promise<void> {
        if (!this._tagVectorService || !this._contextUser) {
            return;
        }

        const text = this.buildTagEmbeddingText(tag);
        const promptID = this.resolveTagSemanticPromptID();

        try {
            const runner = new AIModelRunner();
            const result = await runner.RunEmbedding({
                Texts: [text],
                PromptID: promptID,
                ContextUser: this._contextUser,
                Description: `Tag embedding for new tag "${tag.Name}"`
            });

            if (result.Success && result.Vectors.length > 0 && result.Vectors[0].length > 0) {
                this._tagVectorService.AddVector(
                    NormalizeUUID(tag.ID),
                    result.Vectors[0],
                    { Name: tag.Name, ParentID: tag.ParentID }
                );
            }
        } catch (error) {
            LogError(`TagEngine: Failed to embed new tag "${tag.Name}": ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Re-embed a tag after it has been renamed or its description changed.
     * Updates the vector in the active vector service. No-op if the vector service
     * is not available (e.g., before BuildTagVectors has been called).
     *
     * @param tag - The tag entity with the updated name/description already saved
     */
    public async ReEmbedTag(tag: MJTagEntity): Promise<void> {
        await this.addTagToVectorService(tag);
    }

    /**
     * Remove a tag's embedding from the vector service (e.g., after deletion).
     * No-op if the vector service is not initialized.
     */
    public RemoveTagFromVectorService(tagID: string): void {
        if (!this._tagVectorService) return;
        this._tagVectorService.RemoveVector(NormalizeUUID(tagID));
    }

    // ========================================================================
    // Embedding Model Discovery
    // ========================================================================

    /**
     * Find the smallest available embedding model from the AIEngine.
     * Prefers the model with the smallest InputTokenLimit (cheapest/fastest).
     * @returns Model info with DriverClass and APIName, or null if none found
     */
    private getSmallestEmbeddingModel(): EmbeddingModelInfo | null {
        const aiEngine = AIEngine.Instance;
        if (!aiEngine.Loaded) {
            return null;
        }

        // Filter to embedding models only
        const embeddingModels = aiEngine.Models.filter(m => {
            const modelType = typeof m.AIModelType === 'string' ? m.AIModelType.trim().toLowerCase() : '';
            return modelType === 'embeddings';
        });

        if (embeddingModels.length === 0) {
            return null;
        }

        // Sort by InputTokenLimit ascending (smallest first) to pick cheapest
        const sorted = [...embeddingModels].sort((a, b) => {
            const aTokens = a.InputTokenLimit ?? Number.MAX_SAFE_INTEGER;
            const bTokens = b.InputTokenLimit ?? Number.MAX_SAFE_INTEGER;
            return aTokens - bTokens;
        });

        const chosen = sorted[0];

        // Find the model vendor to get DriverClass
        const modelVendor = this.findModelVendor(chosen.ID);
        if (!modelVendor) {
            // Fall back to model's own DriverClass if available
            if (chosen.DriverClass) {
                return {
                    ModelID: chosen.ID,
                    DriverClass: chosen.DriverClass,
                    APIName: chosen.APIName ?? chosen.Name
                };
            }
            LogError(`TagEngine: No model vendor found for embedding model "${chosen.Name}" and model has no DriverClass.`);
            return null;
        }

        return {
            ModelID: chosen.ID,
            DriverClass: modelVendor.DriverClass,
            APIName: modelVendor.APIName ?? chosen.APIName ?? chosen.Name
        };
    }

    /**
     * Find the highest-priority active ModelVendor for a given model ID.
     */
    private findModelVendor(modelID: string): { DriverClass: string; APIName: string | null } | null {
        const aiEngine = AIEngine.Instance;
        const vendors = aiEngine.ModelVendors
            .filter(mv => UUIDsEqual(mv.ModelID, modelID) && mv.Status === 'Active' && mv.DriverClass != null)
            .sort((a, b) => (b.Priority ?? 0) - (a.Priority ?? 0));

        if (vendors.length === 0) {
            return null;
        }

        const best = vendors[0];
        return {
            DriverClass: best.DriverClass!,
            APIName: best.APIName
        };
    }

    // ========================================================================
    // Subtree Utilities
    // ========================================================================

    /**
     * Walk up the parent chain from a given tagID to determine if rootID is an ancestor.
     * @param tagID - The tag to check
     * @param rootID - The potential ancestor
     * @returns true if rootID is found in the ancestor chain of tagID
     */
    private isInSubtree(tagID: string, rootID: string): boolean {
        const visited = new Set<string>();
        let currentID: string | null = tagID;

        while (currentID) {
            const normalizedCurrent = NormalizeUUID(currentID);
            if (visited.has(normalizedCurrent)) {
                // Circular reference detected, bail out
                return false;
            }
            visited.add(normalizedCurrent);

            if (UUIDsEqual(currentID, rootID)) {
                return true;
            }

            const tag = this.GetTagByID(currentID);
            if (!tag) {
                return false;
            }
            currentID = tag.ParentID;
        }

        return false;
    }
}
