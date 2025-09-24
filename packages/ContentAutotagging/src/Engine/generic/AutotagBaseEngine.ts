import { Metadata, RunView, UserInfo } from '@memberjunction/core'
import { RegisterClass, MJGlobal } from '@memberjunction/global'
import { ContentSourceEntity, ContentItemEntity, ContentFileTypeEntity, ContentProcessRunEntity, ContentTypeEntity, ContentSourceTypeEntity, ContentTypeAttributeEntity, ContentSourceParamEntity } from '@memberjunction/core-entities'
import { ContentSourceParams, ContentSourceTypeParams } from './content.types'
import pdfParse from 'pdf-parse'
import pdf2pic from 'pdf2pic'
import * as officeparser from 'officeparser'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import { ProcessRunParams, JsonObject, ContentItemProcessParams, StructuredPDFContent, ContentItemProcessParamsExtended } from './process.types'
import { toZonedTime } from 'date-fns-tz'
import axios from 'axios'
import * as cheerio from 'cheerio'
import crypto from 'crypto'
import { BaseLLM, GetAIAPIKey, ChatMessage } from '@memberjunction/ai'
import { AIEngine } from '@memberjunction/aiengine'
import { LoadGeminiLLM } from '@memberjunction/ai-gemini'
import { ContentItemAttributeEntity } from '@memberjunction/core-entities'
import { AIEngineBase } from '@memberjunction/ai-engine-base'

@RegisterClass(AIEngine, 'AutotagBaseEngine')
export class AutotagBaseEngine extends AIEngine {
    constructor() {
        super();
        // Load Gemini provider to ensure it's registered
        LoadGeminiLLM();
    }

    public static get Instance(): AutotagBaseEngine {
        return super.getInstance<AutotagBaseEngine>();
    }

    /**
     * Given a list of content items, extract the text from each content item with the LLM and send off the required parameters to the LLM for tagging.
     * @param contentItems 
     * @returns 
     */
    public async ExtractTextAndProcessWithLLM(contentItems: ContentItemEntity[], contextUser: UserInfo): Promise<void> {
        if (!contentItems || contentItems.length === 0) {
            console.log('No content items to process');
            return;
        }

        const processRunParams = new ProcessRunParams();
        processRunParams.sourceID = contentItems[0].ContentSourceID
        processRunParams.startTime = new Date();
        processRunParams.numItemsProcessed = contentItems.length;

        for (const contentItem of contentItems) {
            try {
                const processingParams = new ContentItemProcessParams();
                
                // Parameters that depend on the content item
                processingParams.text = contentItem.Text;
                processingParams.name = contentItem.Name;
                processingParams.contentSourceTypeID = contentItem.ContentSourceTypeID;
                processingParams.contentFileTypeID = contentItem.ContentFileTypeID;
                processingParams.contentTypeID = contentItem.ContentTypeID;

                // Parameters that depend on the content type
                const { modelID, minTags, maxTags } = await this.getContentItemParams(processingParams.contentTypeID, contextUser) 
                processingParams.modelID = modelID;
                processingParams.minTags = minTags;
                processingParams.maxTags = maxTags;
                processingParams.contentItemID = contentItem.ID;

                await this.ProcessContentItemText(processingParams, contextUser);

            }

            catch (e) {
                console.error(`Failed to process content source item: ${contentItem.Get('contentItemID')}`);
                throw e;
            }
        }

        processRunParams.endTime = new Date();
        await this.saveProcessRun(processRunParams, contextUser);
    }

    /**
     * Enhanced version that can handle structured content for tabular data like salary schedules
     * @param contentItems 
     * @param contextUser 
     * @param structuredDataMap Optional map of contentItemID -> StructuredPDFContent for items that have structured data
     */
    public async ExtractTextAndProcessWithLLMEnhanced(
        contentItems: ContentItemEntity[], 
        contextUser: UserInfo,
        structuredDataMap?: Map<string, StructuredPDFContent>
    ): Promise<void> {
        if (!contentItems || contentItems.length === 0) {
            console.log('No content items to process');
            return;
        }

        const processRunParams = new ProcessRunParams();
        processRunParams.sourceID = contentItems[0].ContentSourceID
        processRunParams.startTime = new Date();
        processRunParams.numItemsProcessed = contentItems.length;

        for (const contentItem of contentItems) {
            try {
                const processingParams = new ContentItemProcessParamsExtended();
                
                // Parameters that depend on the content item
                processingParams.text = contentItem.Text;
                processingParams.contentSourceTypeID = contentItem.ContentSourceTypeID;
                processingParams.contentFileTypeID = contentItem.ContentFileTypeID;
                processingParams.contentTypeID = contentItem.ContentTypeID;

                // Check if we have structured data for this content item
                const structuredData = structuredDataMap?.get(contentItem.ID);
                if (structuredData && structuredData.hasTabularData) {
                    processingParams.structuredData = structuredData;
                    processingParams.preserveTableStructure = true;
                    processingParams.pdfBuffer = structuredData.pdfBuffer; // Pass PDF buffer for vision processing
                    console.log(`Using structured processing for content item: ${contentItem.Name}`);
                }

                // Parameters that depend on the content type
                const { modelID, minTags, maxTags } = await this.getContentItemParams(processingParams.contentTypeID, contextUser) 
                processingParams.modelID = modelID;
                processingParams.minTags = minTags;
                processingParams.maxTags = maxTags;
                processingParams.contentItemID = contentItem.ID;

                // Use enhanced processing method
                await this.ProcessContentItemTextEnhanced(processingParams, contextUser);

            }

            catch (e) {
                console.error(`Failed to process content source item: ${contentItem.Get('contentItemID')}`);
                throw e;
            }
        }

        processRunParams.endTime = new Date();
        await this.saveProcessRun(processRunParams, contextUser);
    }

    /**
     * Given processing parameters that include the text from our content item, process the text with the LLM and extract the 
     * information related to that content type.
     * @param params 
     * @returns 
     */
    public async ProcessContentItemText(params: ContentItemProcessParams, contextUser: UserInfo): Promise<void> {
        const LLMResults: JsonObject = await this.promptAndRetrieveResultsFromLLM(params, contextUser);
        await this.saveLLMResults(LLMResults, contextUser);
    }

    /**
     * Enhanced content processing that handles vision model processing for tabular PDFs
     * @param params Enhanced processing parameters that may include structured data
     * @param contextUser User context
     */
    public async ProcessContentItemTextEnhanced(params: ContentItemProcessParamsExtended, contextUser: UserInfo): Promise<void> {
        let LLMResults: JsonObject;

        // Check if we should use vision processing for tabular content
        if (params.structuredData && params.preserveTableStructure && params.structuredData.hasTabularData && params.pdfBuffer) {
            console.log('Using VISION MODEL processing for tabular PDF content');
            
            // Create processing params for vision model
            const processParams: ContentItemProcessParams = {
                text: params.text, // Still include text for fallback
                modelID: params.modelID,
                name: params.name,
                minTags: params.minTags,
                maxTags: params.maxTags,
                contentItemID: params.contentItemID,
                contentTypeID: params.contentTypeID,
                contentFileTypeID: params.contentFileTypeID,
                contentSourceTypeID: params.contentSourceTypeID
            };
            
            // Process with vision model instead of text
            LLMResults = await this.processWithVisionModel(params.pdfBuffer, processParams, contextUser);
            
        } else {
            console.log('Using regular text processing');
            
            // Use regular text processing
            const processParams: ContentItemProcessParams = {
                ...params,
                text: params.text
            };
            
            LLMResults = await this.promptAndRetrieveResultsFromLLM(processParams, contextUser);
        }

        await this.saveLLMResults(LLMResults, contextUser);
    }

    public async promptAndRetrieveResultsFromLLM(params: ContentItemProcessParams, contextUser: UserInfo) { 
        const model = AIEngineBase.Instance.Models.find(m => m.ID === params.modelID)
        const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass))
        const text = this.chunkExtractedText(params.text, model.InputTokenLimit)
        let LLMResults: JsonObject = {}
        const startTime = new Date()

        for (const chunk of text) {
            const { systemPrompt, userPrompt } = await this.getLLMPrompts(params, chunk, LLMResults, contextUser)
            LLMResults = await this.processChunkWithLLM(llm, systemPrompt, userPrompt, LLMResults, model.APIName)
        }   
        
        const endTime = new Date();
        LLMResults.processStartTime = startTime
        LLMResults.processEndTime = endTime
        LLMResults.contentItemID = params.contentItemID

        return LLMResults
    }

    public async processChunkWithLLM(llm: BaseLLM, systemPrompt: string, userPrompt: string, LLMResults:JsonObject, modelAPIName: string): Promise<JsonObject> {

        const response = await llm.ChatCompletion({
            messages: [
                {
                    role: 'system',
                    content: systemPrompt,
                },
                {
                    role: 'user',
                    content: userPrompt,
                }
            ],
            model: modelAPIName,
            temperature:0.0,
        });

        const queryResponse = response.data.choices[0]?.message?.content?.trim() || '';
        console.log('Raw LLM Response:');
        console.log('='.repeat(80));
        console.log(queryResponse);
        console.log('='.repeat(80));
        
        let JSONQueryResponse: JsonObject;
        try {
            JSONQueryResponse = JSON.parse(queryResponse);
        } catch (parseError) {
            console.error('JSON Parse Error:', parseError.message);
            console.error('Response length:', queryResponse.length);
            console.error('Response at error position (±50 chars):');
            
            const errorMatch = parseError.message.match(/at position (\d+)/);
            if (errorMatch) {
                const position = parseInt(errorMatch[1]);
                const start = Math.max(0, position - 50);
                const end = Math.min(queryResponse.length, position + 50);
                console.error(queryResponse.substring(start, end));
                console.error(' '.repeat(Math.min(50, position - start)) + '^-- ERROR HERE');
            }
            
            // Try to extract JSON from the response if it's wrapped in text
            const jsonMatch = queryResponse.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                console.log('Attempting to parse extracted JSON block...');
                try {
                    JSONQueryResponse = JSON.parse(jsonMatch[0]);
                    console.log('Successfully parsed extracted JSON');
                } catch (secondParseError) {
                    console.error('Second parse attempt also failed:', secondParseError.message);
                    throw new Error(`LLM response is not valid JSON: ${parseError.message}`);
                }
            } else {
                throw new Error(`LLM response contains no valid JSON: ${parseError.message}`);
            }
        }

        // check if the response has info to add to LLMResults
        for (const key in JSONQueryResponse) {
            const value = JSONQueryResponse[key]
            if (value !== null) { 
                LLMResults[key] = value
            }
        }

        return LLMResults
    }

    public async getLLMPrompts(params: ContentItemProcessParams, chunk: string, LLMResults: JsonObject, contextUser: UserInfo): Promise<{ systemPrompt: string, userPrompt: string }> {
        const contentType = await this.getContentTypeName(params.contentTypeID, contextUser)
        const contentSourceType = await this.getContentSourceTypeName(params.contentSourceTypeID, contextUser)
        const additionalContentTypePrompts = await this.getAdditionalContentTypePrompt(params.contentTypeID, contextUser)
        
        const systemPrompt = `You are a highly skilled text analysis assistant. You have decades of experience and pride yourself on your attention to detail and ability to capture both accurate information, as well as tone and subtext. 
        Your task is to accurately extract key information from a provided piece of text based on a series of prompts. You are provided with text that should be a ${contentType}, that has been extracted from a ${contentSourceType}. 
        The text MUST be of the type ${contentType} for the subsequent processing.`
        const userPrompt = `
        If the provided text does not actually appear to be of the type ${contentType}, please disregard everything in the instructions after this and return this exact JSON response: { isValidContent: false (as a boolean) }. 
        The item you have been given is called '${params.name}'. Assuming the type of the text is in fact from a ${contentType}, please extract the title of the provided text, a short summary of the provided documents, as well as between ${params.minTags} and ${params.maxTags} topical key words that are most relevant to the text.
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

        return { systemPrompt, userPrompt }
    }

    public async saveLLMResults(LLMResults: JsonObject, contextUser: UserInfo) {
        if (LLMResults.isValidContent === true) {   
            // Only save results if the content is of the type that we expected. 
            await this.saveResultsToContentItemAttribute(LLMResults, contextUser)
            await this.saveContentItemTags(LLMResults.contentItemID, LLMResults, contextUser)
            console.log(`Results for content item ${LLMResults.contentItemID} saved successfully`)
        }
        else {
            await this.deleteInvalidContentItem(LLMResults.contentItemID, contextUser)
        }
    }

    public async deleteInvalidContentItem(contentItemID: string, contextUser: UserInfo) {
        const md = new Metadata()
        const contentItem: ContentItemEntity = await md.GetEntityObject<any>('Content Items', contextUser)
        await contentItem.Load(contentItemID)
        await contentItem.Delete()
    }

    public chunkExtractedText(text: string, tokenLimit: number): string[]{
        try {
            const textLimit = Math.ceil(tokenLimit / 1.5 ) // bit of a conservatice estimate to ensure there is room for the additional prompts
            
            if (text.length <= textLimit) {
                // No need to chunk the text
                return [text]
            }

            const numChunks = Math.ceil(text.length / textLimit)
            const chunkSize = Math.ceil(text.length / numChunks)
            const chunks = []
            for (let i = 0; i < numChunks; i++) {
                const start = i * chunkSize
                const end = (i + 1) * chunkSize
                chunks.push(text.slice(start, end))
            }
            return chunks
        } catch (e) {
            console.log('Could not chunk the text')
            return [text]
        }
    }

    /**
     * Given the processing results from the LLM and the Content Element Item that was saved to the database, this function saves the tags as Content Element Tags in the database.
     * @param md: The metadata object to save the tags
     * @param contentElementItem: The content element item that was saved to the database
     * @param results: The results of the processing from the LLM
     * @param contextUser: The user context to save the tags
     * @returns
     */
    public async saveContentItemTags(contentItemID: string, LLMResults: JsonObject, contextUser: UserInfo) {
        const md = new Metadata()
        
        // First, get existing tags for this content item
        const existingTags = await this.getExistingContentItemTags(contentItemID, contextUser);
        const existingTagTexts = new Set(existingTags.map(tag => tag.Tag));
        
        // Process new keywords
        for (const keyword of LLMResults.keywords) {
            if (!existingTagTexts.has(keyword)) {
                // Only create tag if it doesn't already exist
                const contentItemTags = await md.GetEntityObject<any>('Content Item Tags', contextUser)
                contentItemTags.NewRecord()
                
                contentItemTags.ItemID = contentItemID
                contentItemTags.Tag = keyword
                await contentItemTags.Save()
                console.log(`Added new tag '${keyword}' for ContentItem ${contentItemID}`);
            } else {
                console.log(`Tag '${keyword}' already exists for ContentItem ${contentItemID}, skipping`);
            }
        }
    }

    /**
     * Helper method to get existing tags for a ContentItem
     * @param contentItemID - The ContentItem ID
     * @param contextUser - User context
     * @returns Array of existing ContentItemTag entities
     */
    private async getExistingContentItemTags(contentItemID: string, contextUser: UserInfo): Promise<any[]> {
        try {
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: 'Content Item Tags',
                ExtraFilter: `ItemID='${contentItemID}'`,
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success) {
                return result.Results || [];
            }
            return [];
        } catch (error) {
            console.error(`Error getting existing tags for ContentItem ${contentItemID}:`, error.message);
            return [];
        }
    }

    public async saveResultsToContentItemAttribute(LLMResults: JsonObject, contextUser: UserInfo) {
        const md = new Metadata()
        for (const key in LLMResults) {
            // Overwrite name of content item with title if it exists
            if (key === 'title') {
                const ID = LLMResults.contentItemID
                const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', contextUser)
                await contentItem.Load(ID)
                contentItem.Name = LLMResults.title
                await contentItem.Save()
            }
            if(key === 'description') {
                const ID = LLMResults.contentItemID
                const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', contextUser)
                await contentItem.Load(ID)
                contentItem.Description = LLMResults.description
                await contentItem.Save()
            }
            if (key !== 'keywords' && key !== 'processStartTime' && key !== 'processEndTime' && key !== 'contentItemID' && key !== 'isValidContent') {
                //Value should be a string, if its a null or undefined value, set it to an empty string
                const value = LLMResults[key] || ''

                // Check if attribute already exists for this ContentItem and Name
                const existingAttribute = await this.getExistingContentItemAttribute(LLMResults.contentItemID, key, contextUser);
                
                if (existingAttribute) {
                    // Update existing attribute
                    existingAttribute.Value = value;
                    await existingAttribute.Save();
                    console.log(`Updated existing attribute '${key}' for ContentItem ${LLMResults.contentItemID}`);
                } else {
                    // Create new attribute
                    const contentItemAttribute = await md.GetEntityObject<ContentItemAttributeEntity>('Content Item Attributes', contextUser)
                    contentItemAttribute.NewRecord()
                    contentItemAttribute.ContentItemID = LLMResults.contentItemID
                    contentItemAttribute.Name = key
                    contentItemAttribute.Value = value
                    await contentItemAttribute.Save()
                    console.log(`Created new attribute '${key}' for ContentItem ${LLMResults.contentItemID}`);
                }
            }
        }
    }

    /**
     * Helper method to check if a ContentItemAttribute already exists
     * @param contentItemID - The ContentItem ID
     * @param attributeName - The attribute name
     * @param contextUser - User context
     * @returns Existing ContentItemAttribute or null if not found
     */
    private async getExistingContentItemAttribute(contentItemID: string, attributeName: string, contextUser: UserInfo): Promise<ContentItemAttributeEntity | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<ContentItemAttributeEntity>({
                EntityName: 'Content Item Attributes',
                ExtraFilter: `ContentItemID='${contentItemID}' AND Name='${attributeName}'`,
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success && result.Results.length > 0) {
                return result.Results[0];
            }
            return null;
        } catch (error) {
            console.error(`Error checking for existing attribute ${attributeName}:`, error.message);
            return null;
        }
    }

    /*** 
    * Retrieves all of the content sources of a given content source type data from the database.
    * @param contextUser: The user context to retrieve the content source data
    * @returns A list of content sources
    */
    public async getAllContentSources(contextUser: UserInfo, contentSourceTypeID: string): Promise<ContentSourceEntity[]> {
        const rv = new RunView();
        
        const contentSourceResult = await rv.RunView<ContentSourceEntity>({
            EntityName: 'Content Sources',
            ResultType: 'entity_object', 
            ExtraFilter: `ContentSourceTypeID='${contentSourceTypeID}'`
        }, contextUser);
        try {
        if (contentSourceResult.Success && contentSourceResult.Results.length) {
            const contentSources: ContentSourceEntity[] = contentSourceResult.Results
            return contentSources
        }
        else {
            throw new Error(`No content sources found for content source type with ID '${contentSourceTypeID}'`)
        }
        }
    
        catch (e) {
            console.error(e);
            throw e;
            }
    }

    public async setSubclassContentSourceType(subclass: string, contextUser: UserInfo): Promise<string>{
        const rv = new RunView()
        const results = await rv.RunView<ContentSourceTypeEntity>({
            EntityName: 'Content Source Types',
            ExtraFilter: `Name='${subclass}'`,
            ResultType: 'entity_object'
        }, contextUser)
        if (results.Success && results.Results.length) {
            const contentSourceType: ContentSourceTypeEntity = results.Results[0]
            return contentSourceType.ID
        }
        else {
            throw new Error(`Subclass with name ${subclass} not found`)
        }
    }

    public async getContentSourceParams(contentSource: ContentSourceEntity, contextUser: UserInfo): Promise<any> {
        const contentSourceParams = new Map<string, any>()

        const rv = new RunView()
        const results = await rv.RunView<ContentSourceParamEntity>({
            EntityName: 'Content Source Params', 
            ExtraFilter: `ContentSourceID='${contentSource.ID}'`,
            ResultType: 'entity_object'
        }, contextUser)

        if (results.Success && results.Results.length) {
            const contentSourceParamResults: ContentSourceParamEntity[] = results.Results
            for (const contentSourceParam of contentSourceParamResults) {
                const params: ContentSourceTypeParams = await this.getDefaultContentSourceTypeParams(contentSourceParam.ContentSourceTypeParamID, contextUser)
                params.contentSourceID = contentSource.ID

                if (contentSourceParam.Value) {
                    // There is a provided value, so overwrite the default value
                    params.value = this.castValueAsCorrectType(contentSourceParam.Value, params.type)
                }
                contentSourceParams.set(params.name, params.value)
            }
            return contentSourceParams
        }
        else {
            console.log(`No content source params found for content source with ID ${contentSource.ID}, using default values`)
        }
    }

    public async getDefaultContentSourceTypeParams(contentSourceTypeParamID: string, contextUser: UserInfo): Promise<ContentSourceTypeParams> {
        const rv = new RunView()
        const results = await rv.RunView<ContentSourceEntity>({
            EntityName: 'Content Source Type Params', 
            ExtraFilter: `ID='${contentSourceTypeParamID}'`,
            ResultType: 'entity_object'
        }, contextUser)

        if (results.Success && results.Results.length) {
            const params = new ContentSourceTypeParams()
            
            params.name = results.Results[0].Get('Name')
            params.type = results.Results[0].Get('Type').toLowerCase()
            params.value = this.castValueAsCorrectType(results.Results[0].Get('DefaultValue'), params.type) // Default value in this case, can be null or overridden later
            return params
        }
        throw new Error(`Content Source Type with ID '${contentSourceTypeParamID}' not found`)
    }

    public castValueAsCorrectType(value: string, type: string): any {
        switch (type) {
            case 'number':
                return parseInt(value)
            case 'boolean':
                return this.stringToBoolean(value)
            case 'string':
                return value
            case 'string[]':
                return this.parseStringArray(value)
            case 'regexp':
                return new RegExp(value.replace(/\\\\/g, '\\'))
            default:
                return value
        }
    }

    public stringToBoolean(string: string): boolean {
        return string === 'true'
    }

    public parseStringArray(value: string): string[] {
        const stringArray = JSON.parse(value)
        return stringArray
    }

    /**
     * Given a run date, this function converts the run date to the user's timezone and formats it as a date object.
     * @param lastRunDate: The retrieved last run date from the database 
     * @returns The last run date converted to the user's timezone
     */
    public async convertLastRunDateToTimezone(lastRunDate: Date): Promise<Date> {
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const date = toZonedTime(lastRunDate, userTimeZone)
        return date
    }

    /**
     * Retrieves the last run date of the provided content source from the database. If no previous runs exist, the epoch date is returned.
     * @param contentSourceID: The ID of the content source to retrieve the last run date
     * @param contextUser: The user context to retrieve the last run date 
     * @returns 
     */
    public async getContentSourceLastRunDate(contentSourceID: string, contextUser: UserInfo): Promise<Date> {
        const rv = new RunView()
        const results = await rv.RunView<ContentProcessRunEntity>({
            EntityName: 'Content Process Runs', 
            ExtraFilter: `SourceID='${contentSourceID}'`,
            ResultType: 'entity_object', 
            OrderBy: 'EndTime DESC'
        }, contextUser)
        
        try{
            if (results.Success && results.Results.length) {
            const contentProcessRun: ContentProcessRunEntity = results.Results[0]
            const lastRunDate = contentProcessRun.Get('__mj_CreatedAt')
            return this.convertLastRunDateToTimezone(lastRunDate)
            }
            else if (results.Success && !results.Results.length) {
                // Case where we do not have any previous runs for the content source, just return the epoch date
                return new Date(0)
            }
            else {
                throw new Error(`Failed to retrieve last run date for content source with ID ${contentSourceID}`)
            }
        }
        catch (e) {
            console.error(e);
            throw e;
        }
    }

    public async getContentItemParams(contentTypeID: string, contextUser: UserInfo): Promise<{ modelID: string; minTags: number; maxTags: number; }> {
        const rv = new RunView();
        const results = await rv.RunView<ContentTypeEntity>({
            EntityName: 'Content Types',
            ExtraFilter: `ID='${contentTypeID}'`,
            ResultType: 'entity_object',
        }, contextUser); 

        if (results.Success && results.Results.length) {
            const contentType: ContentTypeEntity = results.Results[0];
            return {
                modelID: contentType.AIModelID,
                minTags: contentType.MinTags,
                maxTags: contentType.MaxTags
            }
        }
        else {
            throw new Error(`Content Type with ID ${contentTypeID} not found`);
        }
    }

    /**
     * Given a content source type ID, this function retrieves the content source type name from the database.
     * @param contentSourceTypeID 
     * @param contextUser 
     * @returns 
     */
    public async getContentSourceTypeName(contentSourceTypeID: string, contextUser: UserInfo): Promise<string> {
        const rv = new RunView();

        const contentFileTypeResult = await rv.RunView<ContentSourceTypeEntity>({
            EntityName: 'Content Source Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID='${contentSourceTypeID}'`
        }, contextUser);
        try {
            if (contentFileTypeResult.Success && contentFileTypeResult.Results.length) {
                const contentSourceType: ContentSourceTypeEntity = contentFileTypeResult.Results[0]
                return contentSourceType.Name
            }
        } catch (e) {
            console.error(e);
            throw e;
        }

        throw new Error(`Content Source Type with ID ${contentSourceTypeID} not found`);
    }

    /**
     * Given a content type ID, this function retrieves the content type name from the database.
     * @param contentTypeID 
     * @param contextUser 
     * @returns 
     */
    public async getContentTypeName(contentTypeID: string, contextUser: UserInfo): Promise<string> {
        const rv = new RunView();

        const contentFileTypeResult = await rv.RunView<ContentTypeEntity>({
            EntityName: 'Content Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID='${contentTypeID}'`
        }, contextUser);
        try {
            if (contentFileTypeResult.Success && contentFileTypeResult.Results.length) {
                const contentFileType: ContentTypeEntity = contentFileTypeResult.Results[0]
                return contentFileType.Name
            }
        } catch (e) {
            console.error(e);
            throw e;
        }

        throw new Error(`Content Type with ID ${contentTypeID} not found`);
    }

    /**
     * Given a content file type ID, this function retrieves the content file type name from the database.
     * @param contentFileTypeID 
     * @param contextUser 
     * @returns
     */
    public async getContentFileTypeName(contentFileTypeID: string, contextUser: UserInfo): Promise<string> {
        const rv = new RunView();

        const contentFileTypeResult = await rv.RunView<ContentFileTypeEntity>({
            EntityName: 'Content File Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID='${contentFileTypeID}'`
        }, contextUser);
        try {
            if (contentFileTypeResult.Success && contentFileTypeResult.Results.length) {
                const contentFileType: ContentFileTypeEntity = contentFileTypeResult.Results[0]
                return contentFileType.Name
            }
        } catch (e) {
            console.error(e);
            throw e;
        }

        throw new Error(`Content File Type with ID ${contentFileTypeID} not found`);
    }

    public async getAdditionalContentTypePrompt(contentTypeID: string, contextUser: UserInfo): Promise<string> {
        try { 
            const rv = new RunView()
            const results = await rv.RunView<ContentTypeAttributeEntity>({
                EntityName: 'Content Type Attributes', 
                ExtraFilter: `ContentTypeID='${contentTypeID}'`,
                ResultType: 'entity_object'
            }, contextUser)

            if (results.Success && results.Results.length) {
                let prompt = ''
                for (const contentTypeAttribute of results.Results) {
                    prompt += `${contentTypeAttribute.Prompt}. The data must be included in the above described JSON file in this key-value format:     { "${contentTypeAttribute.Name}": (value of ${contentTypeAttribute.Name} here)}\n`
                }

                return prompt
            }
            return ''
        } catch (e) {
            console.error(e)
            throw e
        }
    }
    
    /**
    * Given the content source parameters, this function creates a description of the content source item.
    * @param contentSourceParams: The parameters of the content source item
    * @returns The description of the content source item
    */
    public async getContentItemDescription(contentSourceParams: ContentSourceParams, contextUser): Promise<string> {
        const description = `${await this.getContentTypeName(contentSourceParams.ContentTypeID, contextUser)} in ${await this.getContentFileTypeName(contentSourceParams.ContentFileTypeID, contextUser)} format obtained from a ${await this.getContentSourceTypeName(contentSourceParams.ContentSourceTypeID, contextUser)} source`
        
        return description
    }

    public async getChecksumFromURL(url: string): Promise<string> {
        const response = await axios.get(url)
        const content = response.data
        const hash = crypto.createHash('sha256').update(content).digest('hex')
        return hash
    }

    public async getChecksumFromText(text: string): Promise<string> {
        const hash = crypto.createHash('sha256').update(text).digest('hex')
        return hash
    }

    public async getContentItemIDFromURL(contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<string> {
        const url: string = contentSourceParams.URL
        const rv = new RunView()
        try{
            const results = await rv.RunView<ContentItemEntity>({
                EntityName: 'Content Items',
                ExtraFilter: `URL='${url}' AND ContentSourceID='${contentSourceParams.contentSourceID}'`,
                ResultType: 'entity_object'
            }, contextUser)

            if (results.Success && results.Results.length) {
                const contentItem: ContentItemEntity = results.Results[0]
                return contentItem.ID
            }
            else {
                throw new Error(`Content item with URL ${url} not found`)
            }
        }
        catch (e) {
            throw new Error(`Failed to retrieve content item ID from URL: ${url}`)
        }
    }

    /**
     * Given the results of the processing from the LLM, this function saves the details of the process run in the database.
     * @param processRunParams: The parameters holding the details of the process run
     * @param contextUser: The user context to save the process run
     * @returns
     */
    public async saveProcessRun(processRunParams: ProcessRunParams, contextUser: UserInfo){
        const md = new Metadata()
        const processRun = await md.GetEntityObject<any>('Content Process Runs', contextUser)
        processRun.NewRecord()
        processRun.SourceID = processRunParams.sourceID
        processRun.StartTime = processRunParams.startTime
        processRun.EndTime = processRunParams.endTime
        processRun.Status = 'Complete'
        processRun.ProcessedItems = processRunParams.numItemsProcessed
        await processRun.Save()
    }

    /**
     * Parse content from a ContentItem entity with full context and parameter support
     * @param contentItem - The ContentItem entity containing metadata and file path
     * @param contextUser - User context for database operations
     * @returns Parsed text from the content item
     */
    public async parseContentItem(contentItem: ContentItemEntity, contextUser: UserInfo): Promise<string> {
        try {
            // 1. Load content source and parameters
            const contentSource = await this.getContentSourceEntity(contentItem.ContentSourceID, contextUser);
            const sourceParams = await this.getContentSourceParams(contentSource, contextUser);
            
            // 2. Get content file type information
            const contentFileType = await this.getContentFileTypeEntity(contentItem.ContentFileTypeID, contextUser);
            const fileExtension = contentFileType.FileExtension.toLowerCase();
            
            // 3. Read file data
            const filePath = contentItem.URL; // Assuming URL contains file path for local files
            const dataBuffer = await fs.promises.readFile(filePath);
            
            // 4. Parse based on file type with full context
            switch (fileExtension) {
                case '.pdf':
                    return await this.parsePDF(dataBuffer);
                case '.docx':
                    return await this.parseDOCX(dataBuffer);
                case '.xlsx':
                    return await this.parseXLSXWithContext(dataBuffer, sourceParams);
                default:
                    throw new Error(`Unsupported file type: ${fileExtension}`);
            }
        } catch (error) {
            console.error(`Failed to parse content item ${contentItem.ID}:`, error.message);
            throw new Error(`Content parsing failed: ${error.message}`);
        }
    }

    /**
     * Parse Excel files with intelligent sheet selection based on content source parameters
     * @param dataBuffer - Excel file buffer
     * @param sourceParams - Content source parameters
     * @returns Parsed text from selected sheet
     */
    private async parseXLSXWithContext(dataBuffer: Buffer, sourceParams: Map<string, any>): Promise<string> {
        const workbook = XLSX.read(dataBuffer, { type: 'buffer' });
        
        // Single sheet? Direct processing
        if (workbook.SheetNames.length === 1) {
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            return XLSX.utils.sheet_to_csv(firstSheet);
        }
        
        // Multi-sheet processing with LLM sheet selection
        const sheetSelectionPrompt = sourceParams.get('SheetSelectionPrompt');
        if (sheetSelectionPrompt) {
            console.log('Using LLM for multi-sheet Excel processing');
            const selectedSheetName = await this.selectSheetWithLLM(workbook, sheetSelectionPrompt);
            const selectedSheet = workbook.Sheets[selectedSheetName];
            return XLSX.utils.sheet_to_csv(selectedSheet);
        }
        
        // Fallback: use first sheet
        console.log('No sheet selection prompt configured, using first sheet');
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_csv(firstSheet);
    }

    /**
     * Use LLM to select the most relevant sheet from a multi-sheet Excel file
     * @param workbook - Parsed Excel workbook
     * @param customPrompt - Custom prompt for sheet selection
     * @returns Name of selected sheet
     */
    private async selectSheetWithLLM(workbook: any, customPrompt: string): Promise<string> {
        try {
            // Format all sheet contents for LLM analysis
            const sheetContents = workbook.SheetNames.map(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                const content = XLSX.utils.sheet_to_csv(sheet);
                return `SHEET "${sheetName}":\n${content}`;
            }).join('\n\n---\n\n');

            // Find model
            const model = AIEngineBase.Instance.Models.find(m => m.Name === 'Gemini 2.5 Pro');
            
            if (!model) {
                console.warn('Model not found for sheet selection, using first sheet');
                return workbook.SheetNames[0];
            }

            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
                BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass)
            );

            const userPrompt = `${customPrompt}

                Here are all the sheets in this Excel file:

                ${sheetContents}

                Respond with ONLY the sheet name that contains the relevant data:`;

            const response = await llm.ChatCompletion({
                messages: [
                    { role: 'user', content: userPrompt }
                ],
                model: model.APIName,
                temperature: 0.0
            });

            const selectedSheet = response.data.choices[0]?.message?.content?.trim();
            
            if (selectedSheet && workbook.SheetNames.includes(selectedSheet)) {
                console.log(`LLM selected sheet: "${selectedSheet}"`);
                return selectedSheet;
            } else {
                console.warn(`LLM returned invalid sheet name: "${selectedSheet}", using first sheet`);
                return workbook.SheetNames[0];
            }
            
        } catch (error) {
            console.error('LLM sheet selection failed:', error.message);
            return workbook.SheetNames[0];
        }
    }

    /**
     * Get ContentSource entity by ID
     */
    private async getContentSourceEntity(contentSourceID: string, contextUser: UserInfo): Promise<ContentSourceEntity> {
        const rv = new RunView();
        const result = await rv.RunView<ContentSourceEntity>({
            EntityName: 'Content Sources',
            ExtraFilter: `ID='${contentSourceID}'`,
            ResultType: 'entity_object'
        }, contextUser);
        
        if (result.Success && result.Results.length > 0) {
            return result.Results[0];
        } else {
            throw new Error(`ContentSource with ID ${contentSourceID} not found`);
        }
    }

    /**
     * Get ContentFileType entity by ID
     */
    private async getContentFileTypeEntity(contentFileTypeID: string, contextUser: UserInfo): Promise<ContentFileTypeEntity> {
        const rv = new RunView();
        const result = await rv.RunView<ContentFileTypeEntity>({
            EntityName: 'Content File Types',
            ExtraFilter: `ID='${contentFileTypeID}'`,
            ResultType: 'entity_object'
        }, contextUser);
        
        if (result.Success && result.Results.length > 0) {
            return result.Results[0];
        } else {
            throw new Error(`ContentFileType with ID ${contentFileTypeID} not found`);
        }
    }

    /**
    * Given a buffer of data, this function extracts text from a PDF file
    * @param dataBuffer: The buffer of data to extract text from
    * @returns The extracted text from the PDF file
    */
    public async parsePDF(dataBuffer: Buffer): Promise<string> {
        const dataPDF = await pdfParse(dataBuffer);
        return dataPDF.text
    }

    /**
     * Enhanced PDF parsing that can include PDF buffer for vision model processing
     * @param dataBuffer: The buffer of data to extract structured content from
     * @param assumeTabularContent: If true, assumes content has tables (for vision model processing)
     * @returns StructuredPDFContent with raw text and PDF buffer for vision processing
     */
    public async parsePDFWithStructure(dataBuffer: Buffer, assumeTabularContent: boolean = false): Promise<StructuredPDFContent> {
        try {
            // Get raw text using standard pdf-parse
            const dataPDF = await pdfParse(dataBuffer);
            const rawText = dataPDF.text;

            return {
                rawText,
                tables: [], // No longer using table detection - vision model handles structure
                hasTabularData: assumeTabularContent,
                contentType: assumeTabularContent ? 'tabular' : 'text',
                pdfBuffer: dataBuffer // Include PDF buffer for vision model processing
            };

        } catch (error) {
            console.warn('Structured PDF parsing failed, falling back to text-only:', error.message);
            // Fallback to regular text extraction
            const dataPDF = await pdfParse(dataBuffer);
            return {
                rawText: dataPDF.text,
                tables: [],
                hasTabularData: false,
                contentType: 'text'
            };
        }
    }





    /**
     * Convert PDF to high-resolution images for vision model processing
     * @param pdfBuffer The PDF file as a buffer
     * @returns Array of base64-encoded images (one per page)
     */
    public async convertPDFToImages(pdfBuffer: Buffer): Promise<string[]> {
        console.log(`Converting PDF to images for vision processing...`);
        
        // First, get the total number of pages using pdf-parse
        const pdfInfo = await pdfParse(pdfBuffer);
        const totalPages = pdfInfo.numpages;
        console.log(`PDF has ${totalPages} pages`);
        
        // Try multiple approaches for PDF to image conversion
        const approaches = [
            {
                name: 'High Quality (300 DPI)',
                options: {
                    density: 300,
                    format: "jpeg",
                    width: 2000,
                    height: 2800,
                    quality: 95
                }
            },
            {
                name: 'Standard Quality (200 DPI)',
                options: {
                    density: 200,
                    format: "jpeg",
                    width: 1600,
                    height: 2200,
                    quality: 90
                }
            },
            {
                name: 'Low Quality (150 DPI)',
                options: {
                    density: 150,
                    format: "png",
                    quality: 85
                }
            },
            {
                name: 'Basic (defaults)',
                options: {}
            }
        ];
        
        for (const approach of approaches) {
            try {
                console.log(`Trying ${approach.name} approach...`);
                
                const convert = pdf2pic.fromBuffer(pdfBuffer, approach.options);
                const images: string[] = [];
                
                for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                    try {
                        console.log(`Converting page ${pageNum} with ${approach.name}...`);
                        
                        const result = await convert(pageNum, { responseType: 'buffer' });
                        
                        if (result && 'buffer' in result && result.buffer && 
                            Buffer.isBuffer(result.buffer) && result.buffer.length > 0) {
                            
                            const base64String = result.buffer.toString('base64');
                            // For vision models, send just the raw base64 (no data URL prefix)
                            images.push(base64String);
                            console.log(`✅ Page ${pageNum} converted (${result.buffer.length} bytes)`);
                            
                            // Save image to disk for debugging
                            try {
                                const debugImagePath = `/tmp/pdf_debug_page_${pageNum}.jpg`;
                                await fs.promises.writeFile(debugImagePath, result.buffer);
                                console.log(`🔍 Debug image saved to: ${debugImagePath}`);
                            } catch (debugError) {
                                // Try Windows temp path if /tmp doesn't exist
                                try {
                                    const windowsDebugPath = `C:\\temp\\pdf_debug_page_${pageNum}.jpg`;
                                    await fs.promises.writeFile(windowsDebugPath, result.buffer);
                                    console.log(`🔍 Debug image saved to: ${windowsDebugPath}`);
                                } catch (windowsError) {
                                    // Finally try current directory
                                    try {
                                        const localDebugPath = `./pdf_debug_page_${pageNum}.jpg`;
                                        await fs.promises.writeFile(localDebugPath, result.buffer);
                                        console.log(`🔍 Debug image saved to: ${localDebugPath}`);
                                    } catch (localError) {
                                        console.warn(`⚠️ Could not save debug image: ${localError.message}`);
                                    }
                                }
                            }
                        } else {
                            console.warn(`⚠️ Page ${pageNum} returned empty buffer with ${approach.name}`);
                            break; // Try next approach
                        }
                        
                    } catch (pageError) {
                        console.error(`❌ Page ${pageNum} failed with ${approach.name}:`, pageError.message);
                        break; // Try next approach
                    }
                }
                
                if (images.length > 0) {
                    console.log(`🎉 Success with ${approach.name}! Converted ${images.length} pages`);
                    return images;
                }
                
            } catch (approachError) {
                console.warn(`❌ ${approach.name} approach failed:`, approachError.message);
                // Continue to next approach
            }
        }
        
        // All approaches failed - provide helpful error message
        console.error('🚨 All PDF conversion approaches failed!');
        console.error('This usually indicates missing dependencies:');
        console.error('- ImageMagick (https://imagemagick.org/script/download.php)');
        console.error('- GraphicsMagick (http://www.graphicsmagick.org/download.html)');
        console.error('- Poppler utils (for some systems)');
        
        throw new Error(
            'PDF to image conversion failed with all approaches. ' +
            'Please ensure ImageMagick or GraphicsMagick is installed and available in PATH. ' +
            'Visit https://imagemagick.org/script/download.php for installation instructions.'
        );
    }

    /**
     * Process PDF using vision model with existing MJ prompt system
     * @param pdfBuffer The PDF file buffer
     * @param params Processing parameters that include prompts from database
     * @param contextUser User context
     * @returns Vision processing results as JSON
     */
    public async processWithVisionModel(
        pdfBuffer: Buffer,
        params: ContentItemProcessParams,
        contextUser: UserInfo
    ): Promise<JsonObject> {
        try {
            console.log(`Starting vision model processing...`);
            
            // Convert PDF to images
            const images = await this.convertPDFToImages(pdfBuffer);
            
            // Get AI model and create LLM instance (same as text processing)
            const model = AIEngine.Instance.Models.find(m => m.ID === params.modelID);
            if (!model) {
                throw new Error(`AI Model with ID ${params.modelID} not found`);
            }
            
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
                BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass)
            );

            // Use existing prompt system (same as text processing)
            const { systemPrompt, userPrompt } = await this.getLLMPrompts(params, '', {}, contextUser);
            
            console.log('\n=== VISION MODEL DEBUGGING ===');
            console.log('📝 System Prompt:');
            console.log(systemPrompt.substring(0, 500) + '...');
            console.log('\n📝 User Prompt:');
            console.log(userPrompt.substring(0, 500) + '...');
            console.log('\n🖼️ Images being sent:', images.length);
            console.log('📏 Image sizes:', images.map((img, i) => `Page ${i+1}: ${img.length} chars`));
            
            // Create multimodal messages with all PDF pages as images
            const messages: ChatMessage[] = [
                {
                    role: 'system' as const,
                    content: systemPrompt
                },
                {
                    role: 'user' as const,
                    content: [
                        {
                            type: 'text',
                            content: userPrompt
                        },
                        ...images.map(imageData => ({
                            type: 'image_url' as const,
                            content: imageData
                        }))
                    ]
                }
            ];

            console.log(`\n🤖 Sending ${images.length} images to vision model: ${model.APIName}`);
            console.log('⏳ Processing with vision model...');
            
            // Process with vision model
            const response = await llm.ChatCompletion({
                messages,
                model: model.APIName,
                temperature: 0.0
            });

            const visionResponse = response.data.choices[0]?.message?.content?.trim() || '';
            console.log('\n📤 Vision Model Raw Response:');
            console.log('='.repeat(80));
            console.log(visionResponse);
            console.log('='.repeat(80));
            console.log('📊 Response length:', visionResponse.length, 'characters');
            console.log('🔧 Parsing JSON response...');
            
            // Parse the vision model response (handle both plain JSON and markdown-wrapped JSON)
            let visionResults: JsonObject;
            try {
                // Clean the response to extract JSON from markdown code blocks
                let cleanedResponse = visionResponse.trim();
                
                // Remove markdown code blocks if present
                if (cleanedResponse.startsWith('```json')) {
                    cleanedResponse = cleanedResponse.replace(/^```json\s*/i, '');
                }
                if (cleanedResponse.startsWith('```')) {
                    cleanedResponse = cleanedResponse.replace(/^```\s*/, '');
                }
                if (cleanedResponse.endsWith('```')) {
                    cleanedResponse = cleanedResponse.replace(/\s*```$/, '');
                }
                
                // Remove numeric separators (same as text processing)
                cleanedResponse = cleanedResponse.replace(/(\d+)_(\d+)/g, '$1$2');
                
                // Additional cleaning for common vision model formatting issues
                cleanedResponse = cleanedResponse.trim();
                
                console.log('🧹 Cleaned response (first 300 chars):', cleanedResponse.substring(0, 300) + '...');
                
                visionResults = JSON.parse(cleanedResponse);
                visionResults.processedWithVision = true;
                visionResults.totalPages = images.length;
                visionResults.contentItemID = params.contentItemID;
                
                console.log(`✅ Vision processing successful - extracted data from ${images.length} pages`);
                console.log('📊 Extracted fields:', Object.keys(visionResults).join(', '));
                return visionResults;
                
            } catch (parseError) {
                console.error('❌ Vision model JSON parse error:', parseError.message);
                console.error('🔍 Raw vision response:', visionResponse.substring(0, 500));
                
                // Try to find where JSON might actually start
                const jsonStartPattern = /\{[\s\S]*\}/;
                const jsonMatch = visionResponse.match(jsonStartPattern);
                if (jsonMatch) {
                    try {
                        console.log('🔧 Attempting to parse extracted JSON...');
                        const extractedJson = jsonMatch[0].replace(/(\d+)_(\d+)/g, '$1$2');
                        visionResults = JSON.parse(extractedJson);
                        visionResults.processedWithVision = true;
                        visionResults.totalPages = images.length;
                        visionResults.contentItemID = params.contentItemID;
                        console.log('🎯 Successfully parsed extracted JSON!');
                        return visionResults;
                    } catch (secondParseError) {
                        console.error('❌ Second parse attempt failed:', secondParseError.message);
                    }
                }
                
                throw new Error(`Vision model response is not valid JSON: ${parseError.message}`);
            }
            
        } catch (error) {
            console.error('Vision model processing failed:', error.message);
            throw error;
        }
    }

    /**
    * Given a buffer of data, this function extracts text from a DOCX file
    * @param dataBuffer: The buffer of data to extract text from
    * @returns The extracted text from the DOCX file
    */
    public async parseDOCX(dataBuffer: Buffer): Promise<string> {
        const dataDOCX = await officeparser.parseOfficeAsync(dataBuffer);
        return dataDOCX
    }

    /**
     * Parse Excel file (basic method - use parseContentItem for full functionality)
     * @param dataBuffer - Excel file buffer
     * @returns Parsed text from first sheet
     */
    public async parseXLSX(dataBuffer: Buffer): Promise<string> {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(dataBuffer, { type: 'buffer' });
        
        // Always use first sheet for basic parsing
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_csv(firstSheet);
    }

    public async parseHTML(data: string): Promise<string> {
        try {
            let $: cheerio.CheerioAPI;
            try {
                $ = cheerio.load(data);
            } catch (loadError) {
                console.error('Error loading data with cheerio:', loadError);
                return undefined;
            }
            
            $('script, style, nav, footer, header, .hidden').remove();
            const text = $('body').text().replace(/\s\s+/g, ' ').trim();
            return text;
        } catch (e) {
            console.error(e);
            throw e;
        }
    }


} 