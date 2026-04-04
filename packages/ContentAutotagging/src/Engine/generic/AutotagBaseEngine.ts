import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core'
import { MJGlobal, UUIDsEqual, NormalizeUUID, RegisterClass } from '@memberjunction/global'
import {
    MJContentSourceEntity, MJContentItemEntity, MJContentFileTypeEntity,
    MJContentProcessRunEntity, MJContentTypeEntity, MJContentSourceTypeEntity,
    MJContentTypeAttributeEntity, MJContentSourceParamEntity, MJContentItemTagEntity,
    MJContentItemAttributeEntity, MJContentSourceTypeParamEntity
} from '@memberjunction/core-entities'
import { ContentSourceParams, ContentSourceTypeParams, ContentSourceTypeParamValue } from './content.types'
import pdfParse from 'pdf-parse'
import officeparser from 'officeparser'
import * as fs from 'fs'
import { ProcessRunParams, JsonObject, ContentItemProcessParams } from './process.types'
import { toZonedTime } from 'date-fns-tz'
import axios from 'axios'
import * as cheerio from 'cheerio'
import crypto from 'crypto'
import { BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai'
import { AIEngine } from '@memberjunction/aiengine'
import { AIPromptRunner } from '@memberjunction/ai-prompts'
import { AIPromptParams } from '@memberjunction/ai-core-plus'
import type { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus'
import { TextChunker, ChunkTextParams } from '@memberjunction/ai-vectors'
import { VectorDBBase, VectorRecord, BaseResponse } from '@memberjunction/ai-vectordb'

/**
 * Resolved vector infrastructure for a specific (embeddingModel + vectorIndex) pair.
 * Items sharing the same pair are batched together for efficient processing.
 */
interface ResolvedVectorInfrastructure {
    embedding: BaseEmbeddings;
    vectorDB: VectorDBBase;
    indexName: string;
    embeddingModelName: string;
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

    // Cached metadata — loaded by BaseEngine.Config() via property configs
    private _ContentTypes: MJContentTypeEntity[] = [];
    private _ContentSourceTypes: MJContentSourceTypeEntity[] = [];
    private _ContentFileTypes: MJContentFileTypeEntity[] = [];
    private _ContentTypeAttributes: MJContentTypeAttributeEntity[] = [];
    private _ContentSourceTypeParams: MJContentSourceTypeParamEntity[] = [];

    /** All content types, cached at startup */
    public get ContentTypes(): MJContentTypeEntity[] { return this._ContentTypes; }
    /** All content source types, cached at startup */
    public get ContentSourceTypes(): MJContentSourceTypeEntity[] { return this._ContentSourceTypes; }
    /** All content file types, cached at startup */
    public get ContentFileTypes(): MJContentFileTypeEntity[] { return this._ContentFileTypes; }
    /** All content type attributes, cached at startup */
    public get ContentTypeAttributes(): MJContentTypeAttributeEntity[] { return this._ContentTypeAttributes; }
    /** All content source type params, cached at startup */
    public get ContentSourceTypeParams(): MJContentSourceTypeParamEntity[] { return this._ContentSourceTypeParams; }

    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<unknown> {
        const configs: Partial<BaseEnginePropertyConfig>[] = [
            {
                Type: 'entity',
                EntityName: 'MJ: Content Types',
                PropertyName: '_ContentTypes',
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Content Source Types',
                PropertyName: '_ContentSourceTypes',
            },
            {
                Type: 'entity',
                EntityName: 'MJ: Content File Types',
                PropertyName: '_ContentFileTypes',
            },
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
    public async ExtractTextAndProcessWithLLM(
        contentItems: MJContentItemEntity[],
        contextUser: UserInfo,
        batchSize: number = DEFAULT_VECTORIZE_BATCH_SIZE,
        onProgress?: (processed: number, total: number, currentItem?: string) => void
    ): Promise<void> {
        if (!contentItems || contentItems.length === 0) {
            LogStatus('No content items to process');
            return;
        }

        const processRunParams = new ProcessRunParams();
        processRunParams.sourceID = contentItems[0].ContentSourceID;
        processRunParams.startTime = new Date();
        processRunParams.numItemsProcessed = contentItems.length;
        let totalProcessed = 0;

        LogStatus(`ExtractTextAndProcessWithLLM: processing ${contentItems.length} items in batches of ${batchSize}`);
        let batchSuccesses = 0;
        let batchFailures = 0;
        for (let i = 0; i < contentItems.length; i += batchSize) {
            const batch = contentItems.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            let batchOk = 0, batchFail = 0;
            const batchPromises = batch.map(async (contentItem) => {
                try {
                    const processingParams = await this.buildProcessingParams(contentItem, contextUser);
                    await this.ProcessContentItemText(processingParams, contextUser);
                    totalProcessed++;
                    batchOk++;
                    onProgress?.(totalProcessed, contentItems.length, contentItem.Name);
                } catch (e) {
                    LogError(`Failed to process content item: ${contentItem.ID}`, undefined, e);
                    totalProcessed++;
                    batchFail++;
                    onProgress?.(totalProcessed, contentItems.length);
                }
            });
            await Promise.all(batchPromises);
            batchSuccesses += batchOk;
            batchFailures += batchFail;
            LogStatus(`Batch ${batchNum}: ${batchOk} succeeded, ${batchFail} failed (${totalProcessed}/${contentItems.length} total)`);
        }
        LogStatus(`ExtractTextAndProcessWithLLM complete: ${batchSuccesses} succeeded, ${batchFailures} failed out of ${contentItems.length}`);

        processRunParams.endTime = new Date();
        await this.saveProcessRun(processRunParams, contextUser);
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

        const { modelID, minTags, maxTags } = this.GetContentItemParams(processingParams.contentTypeID);
        processingParams.modelID = modelID;
        processingParams.minTags = minTags;
        processingParams.maxTags = maxTags;
        processingParams.contentItemID = contentItem.ID;

        return processingParams;
    }

    /**
     * Process a content item's text with the LLM and save results.
     */
    public async ProcessContentItemText(params: ContentItemProcessParams, contextUser: UserInfo): Promise<void> {
        const LLMResults: JsonObject = await this.promptAndRetrieveResultsFromLLM(params, contextUser);
        await this.saveLLMResults(LLMResults, contextUser);
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
     * Builds template data for the autotagging prompt from processing params and chunk context.
     */
    private buildPromptData(
        params: ContentItemProcessParams,
        chunk: string,
        previousResults: JsonObject
    ): Record<string, unknown> {
        const contentType = this.GetContentTypeName(params.contentTypeID);
        const contentSourceType = this.GetContentSourceTypeName(params.contentSourceTypeID);
        const additionalAttributePrompts = this.GetAdditionalContentTypePrompt(params.contentTypeID);
        const hasPreviousResults = Object.keys(previousResults).length > 0;

        return {
            contentType,
            contentSourceType,
            minTags: params.minTags,
            maxTags: params.maxTags,
            additionalAttributePrompts,
            existingTaxonomy: this.TaxonomyContext ?? undefined,
            contentText: chunk,
            previousResults: hasPreviousResults ? JSON.stringify(previousResults) : undefined,
        };
    }

    public async promptAndRetrieveResultsFromLLM(params: ContentItemProcessParams, contextUser: UserInfo): Promise<JsonObject> {
        await AIEngine.Instance.Config(false, contextUser);

        const prompt = this.getAutotagPrompt();

        // Determine token limit for chunking: use override model if set, else first prompt-model, else a default
        const tokenLimit = this.resolveTokenLimit(params.modelID);
        const chunks = this.chunkExtractedText(params.text, tokenLimit);

        let LLMResults: JsonObject = {};
        const startTime = new Date();

        for (const chunk of chunks) {
            LLMResults = await this.processChunkWithPromptRunner(prompt, params, chunk, LLMResults, contextUser);
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
        // Per-item logging removed for cleanliness — batch-level logging in ExtractTextAndProcessWithLLM
        const result = await runner.ExecutePrompt<JsonObject>(promptParams);

        if (!result.success) {
            LogError(`AIPromptRunner FAILED for content item ${params.contentItemID}: ${result.errorMessage ?? 'no error message'}`, undefined, result);
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

        return LLMResults;
    }

    public async saveLLMResults(LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        if (LLMResults.isValidContent === true) {
            await this.saveResultsToContentItemAttribute(LLMResults, contextUser);
            await this.saveContentItemTags(LLMResults.contentItemID as string, LLMResults, contextUser);
        } else {
            await this.deleteInvalidContentItem(LLMResults.contentItemID as string, contextUser);
        }
    }

    public async deleteInvalidContentItem(contentItemID: string, contextUser: UserInfo): Promise<void> {
        const md = new Metadata();
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
     * Saves keyword tags from LLM results as Content Item Tags.
     * Uses batched saves for better performance.
     * After each tag is saved, invokes the OnContentItemTagSaved callback (if set)
     * for taxonomy bridge processing.
     */
    public async saveContentItemTags(contentItemID: string, LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        const md = new Metadata();
        const keywords = LLMResults.keywords;
        if (!keywords || !Array.isArray(keywords)) return;

        // Normalize keywords — support both formats:
        //   Old: ["keyword1", "keyword2"]
        //   New: [{ tag: "keyword1", weight: 0.95 }, { tag: "keyword2", weight: 0.7 }]
        //   New with parentTag: [{ tag: "keyword1", weight: 0.95, parentTag: "parent" }]
        const normalizedTags: Array<{ tag: string; weight: number; parentTag: string | null }> = keywords.map((kw: unknown) => {
            if (typeof kw === 'string') {
                return { tag: kw, weight: 1.0, parentTag: null };
            }
            const obj = kw as { tag?: string; keyword?: string; weight?: number; parentTag?: string };
            return {
                tag: obj.tag || obj.keyword || String(kw),
                weight: typeof obj.weight === 'number' ? Math.max(0, Math.min(1, obj.weight)) : 0.5,
                parentTag: obj.parentTag ?? null,
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
                contentItemTag.Set('Weight', item.weight);
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
        const md = new Metadata();
        const contentItemID = LLMResults.contentItemID as string;
        const skipKeys = new Set(['keywords', 'processStartTime', 'processEndTime', 'contentItemID', 'isValidContent']);

        // Update title and description on the content item
        if (LLMResults.title || LLMResults.description) {
            const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
            await contentItem.Load(contentItemID);
            if (LLMResults.title) contentItem.Name = LLMResults.title as string;
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
    public async GetAllContentSourcesSafe(contextUser: UserInfo, contentSourceTypeID: string): Promise<MJContentSourceEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentSourceEntity>({
            EntityName: 'MJ: Content Sources',
            ResultType: 'entity_object',
            ExtraFilter: `ContentSourceTypeID='${contentSourceTypeID}'`
        }, contextUser);

        if (result.Success) {
            return result.Results;
        }
        return [];
    }

    public SetSubclassContentSourceType(subclass: string): string {
        const sourceType = this._ContentSourceTypes.find(st => st.Name === subclass);
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
        const results = await rv.RunView<MJContentProcessRunEntity>({
            EntityName: 'MJ: Content Process Runs',
            ExtraFilter: `SourceID='${contentSourceID}'`,
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
        const contentType = this._ContentTypes.find(ct => UUIDsEqual(ct.ID, contentTypeID));
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
        const sourceType = this._ContentSourceTypes.find(st => UUIDsEqual(st.ID, contentSourceTypeID));
        if (!sourceType) {
            throw new Error(`Content Source Type with ID ${contentSourceTypeID} not found in cached metadata`);
        }
        return sourceType.Name;
    }

    public GetContentTypeName(contentTypeID: string): string {
        const contentType = this._ContentTypes.find(ct => UUIDsEqual(ct.ID, contentTypeID));
        if (!contentType) {
            throw new Error(`Content Type with ID ${contentTypeID} not found in cached metadata`);
        }
        return contentType.Name;
    }

    public GetContentFileTypeName(contentFileTypeID: string): string {
        const fileType = this._ContentFileTypes.find(ft => UUIDsEqual(ft.ID, contentFileTypeID));
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
     * Saves process run metadata to the database.
     */
    public async saveProcessRun(processRunParams: ProcessRunParams, contextUser: UserInfo): Promise<void> {
        const md = new Metadata();
        const processRun = await md.GetEntityObject<MJContentProcessRunEntity>('MJ: Content Process Runs', contextUser);
        processRun.NewRecord();
        processRun.SourceID = processRunParams.sourceID;
        processRun.StartTime = processRunParams.startTime;
        processRun.EndTime = processRunParams.endTime;
        processRun.Status = 'Complete';
        processRun.ProcessedItems = processRunParams.numItemsProcessed;
        await processRun.Save();
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
     */
    public async VectorizeContentItems(
        items: MJContentItemEntity[],
        contextUser: UserInfo,
        onProgress?: (processed: number, total: number) => void,
        batchSize: number = DEFAULT_VECTORIZE_BATCH_SIZE
    ): Promise<{ vectorized: number; skipped: number }> {
        const eligible = items.filter(i => i.Text && i.Text.trim().length > 0);
        if (eligible.length === 0) {
            LogStatus('VectorizeContentItems: no items with text to vectorize');
            return { vectorized: 0, skipped: items.length };
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

        for (const [groupKey, groupItems] of groups) {
            const infra = await this.resolveGroupInfrastructure(groupKey, contextUser);
            const groupVectorized = await this.vectorizeGroup(groupItems, infra, tagMap, batchSize, (batchProcessed) => {
                processed += batchProcessed;
                onProgress?.(Math.min(processed, eligible.length), eligible.length);
            });
            vectorized += groupVectorized;
        }

        LogStatus(`VectorizeContentItems: ${vectorized} vectorized, ${items.length - eligible.length} skipped (empty text)`);
        return { vectorized, skipped: items.length - eligible.length };
    }

    /**
     * Process a single infrastructure group: embed texts in batches and upsert to vector DB.
     * Upserts within each batch run in parallel for throughput.
     */
    private async vectorizeGroup(
        items: MJContentItemEntity[],
        infra: ResolvedVectorInfrastructure,
        tagMap: Map<string, string[]>,
        batchSize: number,
        onBatchComplete: (count: number) => void
    ): Promise<number> {
        let vectorized = 0;

        for (let i = 0; i < items.length; i += batchSize) {
            const batch = items.slice(i, i + batchSize);
            const texts = batch.map(item => this.buildEmbeddingText(item));

            const embedResult = await infra.embedding.EmbedTexts({ texts, model: infra.embeddingModelName });
            if (!embedResult.vectors || embedResult.vectors.length !== batch.length) {
                LogError(`VectorizeContentItems: embedding returned ${embedResult.vectors?.length ?? 0} vectors for ${batch.length} texts`);
                onBatchComplete(batch.length);
                continue;
            }

            const records: VectorRecord[] = batch.map((item, idx) => ({
                id: this.contentItemVectorId(item.ID),
                values: embedResult.vectors[idx],
                metadata: this.buildVectorMetadata(item, tagMap.get(item.ID))
            }));

            // Upsert records in parallel sub-batches for throughput
            const UPSERT_CHUNK = 50;
            const upsertPromises: Promise<BaseResponse>[] = [];
            for (let j = 0; j < records.length; j += UPSERT_CHUNK) {
                const chunk = records.slice(j, j + UPSERT_CHUNK);
                upsertPromises.push(Promise.resolve(infra.vectorDB.CreateRecords(chunk, infra.indexName)));
            }
            const responses = await Promise.all(upsertPromises);
            let batchSuccess = true;
            for (const response of responses) {
                if (!response.success) {
                    LogError(`VectorizeContentItems: upsert failed: ${response.message}`);
                    batchSuccess = false;
                }
            }
            if (batchSuccess) {
                vectorized += batch.length;
            }

            onBatchComplete(batch.length);
        }

        return vectorized;
    }

    /**
     * Load content source and content type records for all unique source/type IDs
     * referenced by the given items. Returns maps keyed by normalized ID.
     */
    private async loadContentSourceAndTypeMaps(
        items: MJContentItemEntity[],
        contextUser: UserInfo
    ): Promise<{
        sourceMap: Map<string, Record<string, unknown>>;
        typeMap: Map<string, Record<string, unknown>>;
    }> {
        const sourceIds = [...new Set(items.map(i => i.ContentSourceID))];
        const typeIds = [...new Set(items.map(i => i.ContentTypeID))];

        const rv = new RunView();
        const [sourceResult, typeResult] = await rv.RunViews([
            {
                EntityName: 'MJ: Content Sources',
                ExtraFilter: `ID IN (${sourceIds.map(id => `'${id}'`).join(',')})`,
                ResultType: 'simple'
            },
            {
                EntityName: 'MJ: Content Types',
                ExtraFilter: `ID IN (${typeIds.map(id => `'${id}'`).join(',')})`,
                ResultType: 'simple'
            }
        ], contextUser);

        const sourceMap = new Map<string, Record<string, unknown>>();
        if (sourceResult.Success) {
            for (const row of sourceResult.Results) {
                const rec = row as Record<string, unknown>;
                sourceMap.set(NormalizeUUID(rec['ID'] as string), rec);
            }
        }

        const typeMap = new Map<string, Record<string, unknown>>();
        if (typeResult.Success) {
            for (const row of typeResult.Results) {
                const rec = row as Record<string, unknown>;
                typeMap.set(NormalizeUUID(rec['ID'] as string), rec);
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
        contextUser: UserInfo
    ): Promise<ResolvedVectorInfrastructure> {
        const rv = new RunView();

        const indexResult = await rv.RunView({
            EntityName: 'MJ: Vector Indexes',
            ExtraFilter: `ID='${vectorIndexID}'`,
            ResultType: 'simple',
            MaxRows: 1
        }, contextUser);
        if (!indexResult.Success || indexResult.Results.length === 0) {
            throw new Error(`Vector index ${vectorIndexID} not found`);
        }
        const vectorIndex = indexResult.Results[0] as Record<string, unknown>;

        return this.createInfrastructureFromIndex(vectorIndex, embeddingModelID, contextUser);
    }

    /**
     * Fallback: resolve infrastructure from the first active VectorIndex (original behavior).
     */
    private async getDefaultVectorInfrastructure(contextUser: UserInfo): Promise<ResolvedVectorInfrastructure> {
        const rv = new RunView();

        const indexResult = await rv.RunView({
            EntityName: 'MJ: Vector Indexes',
            ResultType: 'simple',
            MaxRows: 1
        }, contextUser);
        if (!indexResult.Success || indexResult.Results.length === 0) {
            throw new Error('No vector indexes found — create one in the Configuration tab first');
        }
        const vectorIndex = indexResult.Results[0] as Record<string, unknown>;
        const embeddingModelID = vectorIndex['EmbeddingModelID'] as string;

        return this.createInfrastructureFromIndex(vectorIndex, embeddingModelID, contextUser);
    }

    /**
     * Shared helper: given a vector index record and embedding model ID, resolve all
     * driver instances needed for embedding + upsert.
     */
    private async createInfrastructureFromIndex(
        vectorIndex: Record<string, unknown>,
        embeddingModelID: string,
        contextUser: UserInfo
    ): Promise<ResolvedVectorInfrastructure> {
        const indexName = vectorIndex['Name'] as string;
        const vectorDatabaseID = vectorIndex['VectorDatabaseID'] as string;

        const rv = new RunView();
        const dbResult = await rv.RunView({
            EntityName: 'MJ: Vector Databases',
            ExtraFilter: `ID='${vectorDatabaseID}'`,
            ResultType: 'simple',
            MaxRows: 1
        }, contextUser);
        if (!dbResult.Success || dbResult.Results.length === 0) {
            throw new Error(`Vector database ${vectorDatabaseID} not found`);
        }
        const vectorDBClassKey = (dbResult.Results[0] as Record<string, unknown>)['ClassKey'] as string;

        const aiModel = this.findEmbeddingModel(embeddingModelID);
        const driverClass = aiModel.DriverClass;
        const embeddingModelName = aiModel.APIName ?? aiModel.Name;

        LogStatus(`VectorizeContentItems: USING embedding model "${aiModel.Name}" (${driverClass}), vector DB "${vectorDBClassKey}", index "${indexName}"`);

        const embedding = this.createEmbeddingInstance(driverClass);
        const vectorDB = this.createVectorDBInstance(vectorDBClassKey);

        return { embedding, vectorDB, indexName, embeddingModelName };
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
    private buildEmbeddingText(item: MJContentItemEntity): string {
        const parts: string[] = [];
        if (item.Name) parts.push(item.Name);
        if (item.Description) parts.push(item.Description);
        if (item.Text) parts.push(item.Text);
        return parts.join('\n');
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
}
