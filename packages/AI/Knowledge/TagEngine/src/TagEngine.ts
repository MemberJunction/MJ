import { BaseSingleton, MJGlobal, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { MJTagEntity, MJTaggedItemEntity } from '@memberjunction/core-entities';
import { TagEngineBase, TagTreeNode } from '@memberjunction/tag-engine-base';
import { SimpleVectorService, VectorEntry } from '@memberjunction/ai-vectors-memory';
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { AIModelRunner } from '@memberjunction/ai-prompts';
import type { EmbeddingRunResult } from '@memberjunction/ai-prompts';

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
     */
    private _resolveTagQueue: Promise<MJTagEntity | null> = Promise.resolve(null);

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

    /** All loaded TaggedItem entities */
    public get TaggedItems(): MJTaggedItemEntity[] {
        return this.Base.TaggedItems;
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

    /** Get all tagged items associated with a specific entity record */
    public GetTaggedItemsForRecord(entityID: string, recordID: string): MJTaggedItemEntity[] {
        return this.Base.GetTaggedItemsForRecord(entityID, recordID);
    }

    /** Build a hierarchical tree of TagTreeNode objects for LLM prompt injection */
    public GetTaxonomyTree(rootID?: string): TagTreeNode[] {
        return this.Base.GetTaxonomyTree(rootID);
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

        const entries = await this.generateTagEmbeddings(tags, modelInfo);
        if (entries.length === 0) {
            LogStatus('TagEngine: Failed to generate any tag embeddings.');
            return;
        }

        this._tagVectorService.LoadVectors(entries);
        LogStatus(`TagEngine: Loaded ${entries.length} tag embeddings into vector service.`);
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
    public ResolveTag(
        tagText: string,
        weight: number,
        mode: 'constrained' | 'auto-grow' | 'free-flow',
        rootID: string | null,
        threshold: number,
        contextUser: UserInfo
    ): Promise<MJTagEntity | null> {
        // Serialize all tag resolutions through a queue to prevent race conditions.
        // Without this, parallel Promise.all batches cause duplicate tag creation
        // when multiple items return the same tag name from the LLM.
        this._resolveTagQueue = this._resolveTagQueue.then(
            () => this.resolveTagInner(tagText, weight, mode, rootID, threshold, contextUser),
            () => this.resolveTagInner(tagText, weight, mode, rootID, threshold, contextUser)
        );
        return this._resolveTagQueue;
    }

    private async resolveTagInner(
        tagText: string,
        weight: number,
        mode: 'constrained' | 'auto-grow' | 'free-flow',
        rootID: string | null,
        threshold: number,
        contextUser: UserInfo
    ): Promise<MJTagEntity | null> {
        // 1. Fast path: exact name match (case-insensitive)
        const exactMatch = this.GetTagByName(tagText);
        if (exactMatch) {
            return this.filterBySubtree(exactMatch, rootID);
        }

        // 2. Fuzzy match: normalize by stripping plurals, hyphens, extra spaces
        const fuzzyMatch = this.findFuzzyMatch(tagText, rootID);
        if (fuzzyMatch) {
            return fuzzyMatch;
        }

        // 3. Semantic search if vector service is available
        const semanticMatch = await this.findSemanticMatch(tagText, rootID, threshold);
        if (semanticMatch) {
            return semanticMatch;
        }

        // 4. No match found - behavior depends on mode
        return this.handleNoMatch(tagText, mode, rootID, contextUser);
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
    private findFuzzyMatch(tagText: string, rootID: string | null): MJTagEntity | null {
        const normalized = this.normalizeTagName(tagText);
        for (const tag of this.Tags) {
            if (tag.Status !== 'Active') continue;
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
     */
    private async findSemanticMatch(
        tagText: string,
        rootID: string | null,
        threshold: number
    ): Promise<MJTagEntity | null> {
        if (!this._tagVectorService) {
            LogError(`[TagEngine] Semantic matching disabled — tag vector service not initialized. All non-exact/fuzzy matches will create new tags.`);
            return null;
        }

        const modelInfo = this.getSmallestEmbeddingModel();
        if (!modelInfo) {
            return null;
        }

        const queryVector = await this.embedQueryText(tagText, modelInfo);
        if (!queryVector) {
            return null;
        }

        // Build optional subtree filter
        const subtreeFilter = rootID ? this.buildSubtreeFilter(rootID) : undefined;

        const results = this._tagVectorService.FindNearest(
            queryVector,
            1,
            threshold,
            'cosine',
            subtreeFilter
        );

        if (results.length === 0) {
            return null;
        }

        return this.GetTagByID(results[0].key) ?? null;
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
     * Handle the case where no match was found, creating a new tag based on mode.
     */
    private async handleNoMatch(
        tagText: string,
        mode: 'constrained' | 'auto-grow' | 'free-flow',
        rootID: string | null,
        contextUser: UserInfo
    ): Promise<MJTagEntity | null> {
        switch (mode) {
            case 'constrained':
                return null;

            case 'auto-grow':
                return this.createAndEmbedTag(tagText, rootID, contextUser);

            case 'free-flow':
                return this.createAndEmbedTag(tagText, null, contextUser);

            default:
                return null;
        }
    }

    /**
     * Create a new tag, save it, and add its embedding to the vector service.
     */
    private async createAndEmbedTag(
        tagText: string,
        parentID: string | null,
        contextUser: UserInfo
    ): Promise<MJTagEntity> {
        const newTag = await this.Base.CreateTag(tagText, tagText, parentID, null, contextUser);

        // If we have an active vector service, embed the new tag and add it
        await this.addTagToVectorService(newTag);

        return newTag;
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
                    DriverClass: chosen.DriverClass,
                    APIName: chosen.APIName ?? chosen.Name
                };
            }
            LogError(`TagEngine: No model vendor found for embedding model "${chosen.Name}" and model has no DriverClass.`);
            return null;
        }

        return {
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
