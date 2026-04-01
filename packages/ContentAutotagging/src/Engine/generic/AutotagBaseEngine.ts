import { BaseEngine, BaseEnginePropertyConfig, IMetadataProvider, Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core'
import { MJGlobal, UUIDsEqual, RegisterClass } from '@memberjunction/global'
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
import { BaseLLM, BaseEmbeddings, GetAIAPIKey } from '@memberjunction/ai'
import { AIEngine } from '@memberjunction/aiengine'
import { TextChunker, ChunkTextParams } from '@memberjunction/ai-vectors'
import { VectorDBBase, VectorRecord, BaseResponse } from '@memberjunction/ai-vectordb'

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
     */
    public async ExtractTextAndProcessWithLLM(contentItems: MJContentItemEntity[], contextUser: UserInfo): Promise<void> {
        if (!contentItems || contentItems.length === 0) {
            LogStatus('No content items to process');
            return;
        }

        const processRunParams = new ProcessRunParams();
        processRunParams.sourceID = contentItems[0].ContentSourceID;
        processRunParams.startTime = new Date();
        processRunParams.numItemsProcessed = contentItems.length;

        for (const contentItem of contentItems) {
            try {
                const processingParams = await this.buildProcessingParams(contentItem, contextUser);
                await this.ProcessContentItemText(processingParams, contextUser);
            } catch (e) {
                LogError(`Failed to process content item: ${contentItem.ID}`, undefined, e);
                throw e;
            }
        }

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

    public async promptAndRetrieveResultsFromLLM(params: ContentItemProcessParams, contextUser: UserInfo): Promise<JsonObject> {
        const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, params.modelID));
        if (!model) {
            throw new Error(`AI Model with ID ${params.modelID} not found`);
        }

        const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass));
        if (!llm) {
            throw new Error(`Failed to create LLM instance for driver ${model.DriverClass}`);
        }

        const chunks = this.chunkExtractedText(params.text, model.InputTokenLimit);
        let LLMResults: JsonObject = {};
        const startTime = new Date();

        for (const chunk of chunks) {
            const { systemPrompt, userPrompt } = await this.getLLMPrompts(params, chunk, LLMResults, contextUser);
            LLMResults = await this.processChunkWithLLM(llm, systemPrompt, userPrompt, LLMResults, model.APIName);
        }

        LLMResults.processStartTime = startTime;
        LLMResults.processEndTime = new Date();
        LLMResults.contentItemID = params.contentItemID;

        return LLMResults;
    }

    public async processChunkWithLLM(llm: BaseLLM, systemPrompt: string, userPrompt: string, LLMResults: JsonObject, modelAPIName: string): Promise<JsonObject> {
        const response = await llm.ChatCompletion({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            model: modelAPIName,
            temperature: 0.0,
        });

        const queryResponse = response.data.choices[0]?.message?.content?.trim() || '';

        let JSONQueryResponse: JsonObject;
        try {
            JSONQueryResponse = JSON.parse(queryResponse);
        } catch (parseError) {
            LogError('Failed to parse LLM response as JSON', undefined, queryResponse);
            return LLMResults;
        }

        for (const key in JSONQueryResponse) {
            const value = JSONQueryResponse[key];
            if (value !== null) {
                LLMResults[key] = value;
            }
        }

        return LLMResults;
    }

    public async getLLMPrompts(params: ContentItemProcessParams, chunk: string, LLMResults: JsonObject, contextUser: UserInfo): Promise<{ systemPrompt: string; userPrompt: string }> {
        const contentType = this.GetContentTypeName(params.contentTypeID);
        const contentSourceType = this.GetContentSourceTypeName(params.contentSourceTypeID);
        const additionalContentTypePrompts = this.GetAdditionalContentTypePrompt(params.contentTypeID);

        const systemPrompt = `You are a highly skilled text analysis assistant. You have decades of experience and pride yourself on your attention to detail and ability to capture both accurate information, as well as tone and subtext.
        Your task is to accurately extract key information from a provided piece of text based on a series of prompts. You are provided with text that should be a ${contentType}, that has been extracted from a ${contentSourceType}.
        The text MUST be of the type ${contentType} for the subsequent processing.`;

        const userPrompt = `
        If the provided text does not actually appear to be of the type ${contentType}, please disregard everything in the instructions after this and return this exact JSON response: { isValidContent: false (as a boolean) }.
        Assuming the type of the text is in fact from a ${contentType}, please extract the title of the provided text, a short summary of the provided documents, as well as between ${params.minTags} and ${params.maxTags} topical key words that are most relevant to the text.
        If there is no title explicitly provided in the text, please provide a title that you think best represents the text.
        Please provide the keywords in a list format.
        Make sure the response is just the json file without and formatting or code blocks, and strictly following the format below. Please don't include a greeting in the response, only output the json file:

        {
            "title": (title here),
            "description": (description here),
            "keywords": (list keywords here),
            "isValidContent": true (as a boolean)
        }

        ${additionalContentTypePrompts}

        Please make sure the response in is valid JSON format.

        You are also provided with the results so far as additional context, please use them to formulate the best results given the provided text: ${JSON.stringify(LLMResults)}
        The supplied text is: ${chunk}
        `;

        return { systemPrompt, userPrompt };
    }

    public async saveLLMResults(LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        if (LLMResults.isValidContent === true) {
            await this.saveResultsToContentItemAttribute(LLMResults, contextUser);
            await this.saveContentItemTags(LLMResults.contentItemID as string, LLMResults, contextUser);
            LogStatus(`Results for content item ${LLMResults.contentItemID} saved successfully`);
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
     * Saves keyword tags from LLM results as Content Item Tags.
     * Uses batched saves for better performance.
     */
    public async saveContentItemTags(contentItemID: string, LLMResults: JsonObject, contextUser: UserInfo): Promise<void> {
        const md = new Metadata();
        const keywords = LLMResults.keywords as string[];
        if (!keywords || !Array.isArray(keywords)) return;

        const BATCH_SIZE = 10;
        for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
            const batch = keywords.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (keyword: string) => {
                const contentItemTag: MJContentItemTagEntity = await md.GetEntityObject<MJContentItemTagEntity>('MJ: Content Item Tags', contextUser);
                contentItemTag.NewRecord();
                contentItemTag.ItemID = contentItemID;
                contentItemTag.Tag = keyword;
                await contentItemTag.Save();
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
     */
    public async getAllContentSources(contextUser: UserInfo, contentSourceTypeID: string): Promise<MJContentSourceEntity[]> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentSourceEntity>({
            EntityName: 'MJ: Content Sources',
            ResultType: 'entity_object',
            ExtraFilter: `ContentSourceTypeID='${contentSourceTypeID}'`
        }, contextUser);

        if (result.Success && result.Results.length) {
            return result.Results;
        }

        throw new Error(`No content sources found for content source type with ID '${contentSourceTypeID}'`);
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
     * Embeds content items directly and upserts them to the first active vector index.
     * Bypasses Entity Documents — content items already have unstructured text.
     * Uses deterministic IDs (SHA-1 of "content-item_" + ID) so re-runs update in place.
     */
    public async VectorizeContentItems(
        items: MJContentItemEntity[],
        contextUser: UserInfo,
        onProgress?: (processed: number, total: number) => void
    ): Promise<{ vectorized: number; skipped: number }> {
        const eligible = items.filter(i => i.Text && i.Text.trim().length > 0);
        if (eligible.length === 0) {
            LogStatus('VectorizeContentItems: no items with text to vectorize');
            return { vectorized: 0, skipped: items.length };
        }

        const { embedding, vectorDB, indexName, embeddingModelName } = await this.getVectorInfrastructure();

        // Load tags for all items in one query
        const tagMap = await this.loadTagsForItems(eligible, contextUser);

        const BATCH_SIZE = 50;
        let vectorized = 0;

        for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
            const batch = eligible.slice(i, i + BATCH_SIZE);
            const texts = batch.map(item => this.buildEmbeddingText(item));

            const embedResult = await embedding.EmbedTexts({ texts, model: embeddingModelName });
            if (!embedResult.vectors || embedResult.vectors.length !== batch.length) {
                LogError(`VectorizeContentItems: embedding returned ${embedResult.vectors?.length ?? 0} vectors for ${batch.length} texts`);
                continue;
            }

            const records: VectorRecord[] = batch.map((item, idx) => ({
                id: this.contentItemVectorId(item.ID),
                values: embedResult.vectors[idx],
                metadata: this.buildVectorMetadata(item, tagMap.get(item.ID))
            }));

            const response: BaseResponse = await vectorDB.CreateRecords(records, indexName);
            if (!response.success) {
                LogError(`VectorizeContentItems: upsert failed for batch starting at ${i}: ${response.message}`);
            } else {
                vectorized += batch.length;
            }

            onProgress?.(Math.min(i + BATCH_SIZE, eligible.length), eligible.length);
        }

        LogStatus(`VectorizeContentItems: ${vectorized} vectorized, ${items.length - eligible.length} skipped (empty text)`);
        return { vectorized, skipped: items.length - eligible.length };
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

    /** Resolve embedding model + vector DB + index name from the first active VectorIndex */
    private async getVectorInfrastructure(): Promise<{
        embedding: BaseEmbeddings;
        vectorDB: VectorDBBase;
        indexName: string;
        embeddingModelName: string;
    }> {
        const rv = new RunView();

        // Get the first active vector index
        const indexResult = await rv.RunView({
            EntityName: 'MJ: Vector Indexes',
            ResultType: 'simple',
            MaxRows: 1
        });
        if (!indexResult.Success || indexResult.Results.length === 0) {
            throw new Error('No vector indexes found — create one in the Configuration tab first');
        }
        const vectorIndex = indexResult.Results[0] as Record<string, unknown>;
        const indexName = vectorIndex['Name'] as string;
        const vectorDatabaseID = vectorIndex['VectorDatabaseID'] as string;

        // Get vector database
        const dbResult = await rv.RunView({
            EntityName: 'MJ: Vector Databases',
            ExtraFilter: `ID='${vectorDatabaseID}'`,
            ResultType: 'simple',
            MaxRows: 1
        });
        if (!dbResult.Success || dbResult.Results.length === 0) {
            throw new Error(`Vector database ${vectorDatabaseID} not found`);
        }
        const vectorDBRecord = dbResult.Results[0] as Record<string, unknown>;
        const vectorDBClassKey = vectorDBRecord['ClassKey'] as string;

        // Get embedding model — use text-embedding-3-small by convention
        const modelResult = await rv.RunView({
            EntityName: 'AI Models',
            ExtraFilter: `Name='text-embedding-3-small' AND IsActive=1`,
            ResultType: 'simple',
            MaxRows: 1
        });
        if (!modelResult.Success || modelResult.Results.length === 0) {
            throw new Error('Embedding model text-embedding-3-small not found or not active');
        }
        const modelRecord = modelResult.Results[0] as Record<string, unknown>;
        const driverClass = modelRecord['DriverClass'] as string;
        const embeddingModelName = (modelRecord['APIName'] as string) ?? 'text-embedding-3-small';

        const embeddingAPIKey = GetAIAPIKey(driverClass);
        const vectorDBAPIKey = GetAIAPIKey(vectorDBClassKey);

        const embedding = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(
            BaseEmbeddings, driverClass, embeddingAPIKey
        );
        if (!embedding) throw new Error(`Failed to create embedding instance for ${driverClass}`);

        const vectorDB = MJGlobal.Instance.ClassFactory.CreateInstance<VectorDBBase>(
            VectorDBBase, vectorDBClassKey, vectorDBAPIKey
        );
        if (!vectorDB) throw new Error(`Failed to create vector DB instance for ${vectorDBClassKey}`);

        return { embedding, vectorDB, indexName, embeddingModelName };
    }
}
