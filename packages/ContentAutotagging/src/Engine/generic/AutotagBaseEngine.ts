import { Metadata, RunView, UserInfo, LogError, LogStatus } from '@memberjunction/core'
import { BaseSingleton, MJGlobal, UUIDsEqual } from '@memberjunction/global'
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
import { BaseLLM, GetAIAPIKey } from '@memberjunction/ai'
import { AIEngine } from '@memberjunction/aiengine'
import { TextChunker, ChunkTextParams } from '@memberjunction/ai-vectors'

/**
 * Core engine for content autotagging. Uses AIEngine via composition (not inheritance)
 * to access AI model configuration, then delegates to LLM for text analysis and tagging.
 */
export class AutotagBaseEngine extends BaseSingleton<AutotagBaseEngine> {
    public constructor() {
        super();
    }

    public static get Instance(): AutotagBaseEngine {
        return AutotagBaseEngine.getInstance<AutotagBaseEngine>();
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

        const { modelID, minTags, maxTags } = await this.getContentItemParams(processingParams.contentTypeID, contextUser);
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
        const contentType = await this.getContentTypeName(params.contentTypeID, contextUser);
        const contentSourceType = await this.getContentSourceTypeName(params.contentSourceTypeID, contextUser);
        const additionalContentTypePrompts = await this.getAdditionalContentTypePrompt(params.contentTypeID, contextUser);

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

    public async setSubclassContentSourceType(subclass: string, contextUser: UserInfo): Promise<string> {
        const rv = new RunView();
        const results = await rv.RunView<MJContentSourceTypeEntity>({
            EntityName: 'MJ: Content Source Types',
            ExtraFilter: `Name='${subclass}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (results.Success && results.Results.length) {
            return results.Results[0].ID;
        }

        throw new Error(`Subclass with name ${subclass} not found`);
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
                const params: ContentSourceTypeParams = await this.getDefaultContentSourceTypeParams(contentSourceParam.ContentSourceTypeParamID, contextUser);
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

    public async getDefaultContentSourceTypeParams(contentSourceTypeParamID: string, contextUser: UserInfo): Promise<ContentSourceTypeParams> {
        const rv = new RunView();
        const results = await rv.RunView<MJContentSourceTypeParamEntity>({
            EntityName: 'MJ: Content Source Type Params',
            ExtraFilter: `ID='${contentSourceTypeParamID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (results.Success && results.Results.length) {
            const result = results.Results[0];
            const params = new ContentSourceTypeParams();
            params.name = result.Name;
            params.type = result.Type.toLowerCase();
            params.value = this.castValueAsCorrectType(result.DefaultValue ?? '', params.type);
            return params;
        }

        throw new Error(`Content Source Type Param with ID '${contentSourceTypeParamID}' not found`);
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

    public async getContentItemParams(contentTypeID: string, contextUser: UserInfo): Promise<{ modelID: string; minTags: number; maxTags: number }> {
        const rv = new RunView();
        const results = await rv.RunView<MJContentTypeEntity>({
            EntityName: 'MJ: Content Types',
            ExtraFilter: `ID='${contentTypeID}'`,
            ResultType: 'entity_object',
        }, contextUser);

        if (results.Success && results.Results.length) {
            const contentType = results.Results[0];
            return {
                modelID: contentType.AIModelID,
                minTags: contentType.MinTags,
                maxTags: contentType.MaxTags
            };
        }

        throw new Error(`Content Type with ID ${contentTypeID} not found`);
    }

    public async getContentSourceTypeName(contentSourceTypeID: string, contextUser: UserInfo): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentSourceTypeEntity>({
            EntityName: 'MJ: Content Source Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID='${contentSourceTypeID}'`
        }, contextUser);

        if (result.Success && result.Results.length) {
            return result.Results[0].Name;
        }

        throw new Error(`Content Source Type with ID ${contentSourceTypeID} not found`);
    }

    public async getContentTypeName(contentTypeID: string, contextUser: UserInfo): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentTypeEntity>({
            EntityName: 'MJ: Content Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID='${contentTypeID}'`
        }, contextUser);

        if (result.Success && result.Results.length) {
            return result.Results[0].Name;
        }

        throw new Error(`Content Type with ID ${contentTypeID} not found`);
    }

    public async getContentFileTypeName(contentFileTypeID: string, contextUser: UserInfo): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView<MJContentFileTypeEntity>({
            EntityName: 'MJ: Content File Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID='${contentFileTypeID}'`
        }, contextUser);

        if (result.Success && result.Results.length) {
            return result.Results[0].Name;
        }

        throw new Error(`Content File Type with ID ${contentFileTypeID} not found`);
    }

    public async getAdditionalContentTypePrompt(contentTypeID: string, contextUser: UserInfo): Promise<string> {
        const rv = new RunView();
        const results = await rv.RunView<MJContentTypeAttributeEntity>({
            EntityName: 'MJ: Content Type Attributes',
            ExtraFilter: `ContentTypeID='${contentTypeID}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (results.Success && results.Results.length) {
            return results.Results.map(attr =>
                `${attr.Prompt}. The data must be included in the above described JSON file in this key-value format:     { "${attr.Name}": (value of ${attr.Name} here)}`
            ).join('\n');
        }

        return '';
    }

    public async getContentItemDescription(contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<string> {
        const [contentTypeName, fileTypeName, sourceTypeName] = await Promise.all([
            this.getContentTypeName(contentSourceParams.ContentTypeID, contextUser),
            this.getContentFileTypeName(contentSourceParams.ContentFileTypeID, contextUser),
            this.getContentSourceTypeName(contentSourceParams.ContentSourceTypeID, contextUser)
        ]);

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
}
