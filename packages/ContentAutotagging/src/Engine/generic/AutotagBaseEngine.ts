import { Metadata, RunView, UserInfo } from '@memberjunction/core'
import { RegisterClass, MJGlobal } from '@memberjunction/global'
import { ContentSourceEntity, ContentItemEntity, ContentFileTypeEntity, ContentProcessRunEntity, ContentTypeEntity, ContentSourceTypeEntity, ContentTypeAttributeEntity, ContentSourceParamEntity } from '@memberjunction/core-entities'
import { ContentSourceParams, ContentSourceTypeParams } from './content.types'
import pdfParse from 'pdf-parse'
import pdf2pic from 'pdf2pic'
import * as officeparser from 'officeparser'
import * as fs from 'fs'
import { ProcessRunParams, JsonObject, ContentItemProcessParams, StructuredPDFContent, TableStructure, TableColumn, ContentItemProcessParamsExtended } from './process.types'
import { toZonedTime } from 'date-fns-tz'
import axios from 'axios'
import * as cheerio from 'cheerio'
import crypto from 'crypto'
import { BaseLLM, GetAIAPIKey, ChatMessage } from '@memberjunction/ai'
import { AIEngine } from '@memberjunction/aiengine'
import { ContentItemAttributeEntity } from '@memberjunction/core-entities'

@RegisterClass(AIEngine, 'AutotagBaseEngine')
export class AutotagBaseEngine extends AIEngine {
    constructor() {
        super();

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
     * Enhanced content processing that handles both structured and unstructured content
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
                minTags: params.minTags,
                maxTags: params.maxTags,
                contentItemID: params.contentItemID,
                contentTypeID: params.contentTypeID,
                contentFileTypeID: params.contentFileTypeID,
                contentSourceTypeID: params.contentSourceTypeID
            };
            
            // Process with vision model instead of text
            LLMResults = await this.processWithVisionModel(params.pdfBuffer, processParams, contextUser);
            
        } else if (params.structuredData && params.preserveTableStructure && params.structuredData.hasTabularData) {
            console.log('Using structured table format for LLM processing');
            
            // Format structured data for text-based LLM
            const textForProcessing = this.formatStructuredContentForLLM(params.structuredData);
            const processParams: ContentItemProcessParams = {
                ...params,
                text: textForProcessing
            };
            
            LLMResults = await this.promptAndRetrieveResultsFromLLM(processParams, contextUser);
            
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
        const model = AIEngine.Instance.Models.find(m => m.ID === params.modelID)
        const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass))
        const tokenLimit = model.InputTokenLimit
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
        for (const keyword of LLMResults.keywords) {

            const contentItemTags = await md.GetEntityObject<any>('Content Item Tags', contextUser)
            contentItemTags.NewRecord()
            
            contentItemTags.ItemID = contentItemID
            contentItemTags.Tag = keyword
            await contentItemTags.Save()
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
                const contentItemAttribute = await md.GetEntityObject<ContentItemAttributeEntity>('Content Item Attributes', contextUser)
                contentItemAttribute.NewRecord()
                
                //Value should be a string, if its a null or undefined value, set it to an empty string
                const value = LLMResults[key] || ''

                contentItemAttribute.ContentItemID = LLMResults.contentItemID
                contentItemAttribute.Name = key
                contentItemAttribute.Value = value
                await contentItemAttribute.Save()
            }
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
    * Given a buffer of data, this function extracts text from a PDF file
    * @param dataBuffer: The buffer of data to extract text from
    * @returns The extracted text from the PDF file
    */
    public async parsePDF(dataBuffer: Buffer): Promise<string> {
        const dataPDF = await pdfParse(dataBuffer);
        return dataPDF.text
    }

    /**
     * Enhanced PDF parsing that preserves table structure for salary schedules and similar tabular data
     * @param dataBuffer: The buffer of data to extract structured content from
     * @param assumeTabularContent: If true, assumes content has tables without detection
     * @returns StructuredPDFContent with tables and raw text
     */
    public async parsePDFWithStructure(dataBuffer: Buffer, assumeTabularContent: boolean = false): Promise<StructuredPDFContent> {
        try {
            // Get raw text using standard pdf-parse
            const dataPDF = await pdfParse(dataBuffer);
            const rawText = dataPDF.text;

            let tables: TableStructure[] = [];
            let hasTabularData = false;
            let contentType: 'tabular' | 'text' | 'mixed' = 'text';

            if (assumeTabularContent) {
                // Skip complex detection - we know this has tabular data
                console.log('Assuming tabular content - skipping table detection');
                hasTabularData = true;
                contentType = 'tabular';
                
                // Create a simple table structure from the text for better LLM formatting
                tables = this.createAssumedTableStructure(rawText);
            } else {
                // Use complex detection logic
                tables = this.detectTablesInText(rawText);
                hasTabularData = tables && tables.length > 0;
                contentType = hasTabularData ? 
                    (tables.some(t => t.rows.length > 5) ? 'tabular' : 'mixed') : 'text';
            }

            return {
                rawText,
                tables: tables || [],
                hasTabularData,
                contentType
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
     * Detect and extract table structures from raw PDF text using intelligent text analysis
     * @param rawText The raw text extracted from the PDF
     * @returns Array of TableStructure objects
     */
    private detectTablesInText(rawText: string): TableStructure[] {
        try {
            const tables: TableStructure[] = [];
            const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            
            // Look for tabular patterns in the text
            let currentTable: {
                startIndex: number;
                lines: string[];
                headers?: string[];
            } | null = null;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // Table detection logic
                
                // Detect potential table headers (contains common salary schedule terms)
                if (this.isTableHeaderLine(line)) {
                    // If we have a current table, finish it
                    if (currentTable) {
                        const table = this.parseTableFromLines(currentTable.lines, currentTable.headers);
                        if (table) {
                            tables.push(table);
                        }
                    }
                    
                    // Start new table
                    currentTable = {
                        startIndex: i,
                        lines: [line],
                        headers: this.extractHeadersFromLine(line)
                    };
                } else if (currentTable && this.isTableDataLine(line, currentTable.headers)) {
                    // Add line to current table
                    currentTable.lines.push(line);
                } else if (currentTable) {
                    // End current table if we hit non-tabular content
                    const table = this.parseTableFromLines(currentTable.lines, currentTable.headers);
                    if (table) {
                        tables.push(table);
                    }
                    currentTable = null;
                }
            }
            
            // Handle any remaining table
            if (currentTable) {
                const table = this.parseTableFromLines(currentTable.lines, currentTable.headers);
                if (table) {
                    tables.push(table);
                }
            }
            
            // Table detection complete
            
            return tables;
        } catch (error) {
            console.warn('Table detection failed:', error.message);
            return [];
        }
    }

    /**
     * Check if a line appears to be a table header
     */
    private isTableHeaderLine(line: string): boolean {
        const headerKeywords = [
            'step', 'grade', 'level', 'range', 'classification', 'position',
            'salary', 'annual', 'monthly', 'hourly', 'rate', 'pay',
            'minimum', 'maximum', 'min', 'max', 'start', 'end'
        ];
        
        const lowercaseLine = line.toLowerCase();
        const matchedKeywords = headerKeywords.filter(keyword => lowercaseLine.includes(keyword));
        const hasStructure = this.hasTabularStructure(line);
        
        const isHeader = matchedKeywords.length >= 2 && hasStructure;
        
        // Header detection complete
        
        return isHeader;
    }

    /**
     * Check if a line has tabular structure (multiple separated values)
     */
    private hasTabularStructure(line: string): boolean {
        // Look for patterns that suggest columnar data
        const patterns = [
            /\s{3,}/, // Multiple spaces (common column separator in extracted PDF text)
            /\t/, // Tab characters
            /\$[\d,]+/, // Currency values
            /\b\d+\.\d+\b/, // Decimal numbers
            /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // Dates
        ];
        
        const separatorCount = (line.match(/\s{3,}/g) || []).length;
        const patternMatches = patterns.filter(pattern => pattern.test(line)).length;
        
        return separatorCount >= 2 || patternMatches >= 2;
    }

    /**
     * Extract potential column headers from a header line
     */
    private extractHeadersFromLine(line: string): string[] {
        // Split on multiple spaces (common in PDF text extraction)
        return line.split(/\s{3,}/)
                  .map(header => header.trim())
                  .filter(header => header.length > 0);
    }

    /**
     * Check if a line appears to be table data
     */
    private isTableDataLine(line: string, headers?: string[]): boolean {
        if (!headers || headers.length === 0) {
            return this.hasTabularStructure(line);
        }
        
        // Count columns by splitting on multiple spaces
        const columns = line.split(/\s{3,}/).filter(col => col.trim().length > 0);
        
        // Should have similar number of columns as headers (allow some variance)
        return Math.abs(columns.length - headers.length) <= 1 && columns.length >= 2;
    }

    /**
     * Parse a complete table from collected lines
     */
    private parseTableFromLines(lines: string[], headers?: string[]): TableStructure | null {
        if (lines.length < 2) {
            return null;
        }
        
        const [headerLine, ...dataLines] = lines;
        const finalHeaders = headers || this.extractHeadersFromLine(headerLine);
        
        if (finalHeaders.length < 2) {
            return null;
        }
        
        // Parse data rows
        const rows: string[][] = [];
        const dataLinesToProcess = headers ? lines : dataLines;
        
        for (const dataLine of dataLinesToProcess) {
            const columns = dataLine.split(/\s{3,}/)
                                   .map(col => col.trim())
                                   .filter(col => col.length > 0);
            
            if (columns.length >= 2) {
                // Pad or truncate to match header count
                while (columns.length < finalHeaders.length) {
                    columns.push('');
                }
                if (columns.length > finalHeaders.length) {
                    columns.splice(finalHeaders.length);
                }
                rows.push(columns);
            }
        }
        
        if (rows.length === 0) {
            return null;
        }
        
        // Build column structures
        const columns: TableColumn[] = finalHeaders.map((header, colIndex) => {
            const values = rows.map(row => row[colIndex] || '');
            const dataType = this.detectColumnDataType(values);
            
            return {
                name: header,
                values,
                dataType
            };
        });
        
        // Analyze for salary schedule patterns
        const metadata = this.analyzeSalaryScheduleMetadata(finalHeaders, rows, columns);
        
        return {
            title: 'Detected_Table',
            headers: finalHeaders,
            rows,
            columns,
            metadata: {
                totalRows: rows.length,
                totalColumns: finalHeaders.length,
                ...metadata
            }
        };
    }

    /**
     * Detect the data type of a column based on its values
     * @param values Array of string values from the column
     * @returns Detected data type
     */
    private detectColumnDataType(values: string[]): 'number' | 'currency' | 'text' | 'date' {
        const nonEmptyValues = values.filter(v => v && v.trim());
        if (nonEmptyValues.length === 0) return 'text';

        // Check for currency (dollar signs, commas, decimal points)
        const currencyPattern = /^\$?[\d,]+\.?\d*$/;
        const currencyCount = nonEmptyValues.filter(v => currencyPattern.test(v.replace(/,/g, ''))).length;
        if (currencyCount / nonEmptyValues.length > 0.7) return 'currency';

        // Check for pure numbers
        const numberPattern = /^\d+\.?\d*$/;
        const numberCount = nonEmptyValues.filter(v => numberPattern.test(v)).length;
        if (numberCount / nonEmptyValues.length > 0.7) return 'number';

        // Check for dates
        const datePattern = /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/;
        const dateCount = nonEmptyValues.filter(v => datePattern.test(v)).length;
        if (dateCount / nonEmptyValues.length > 0.7) return 'date';

        return 'text';
    }

    /**
     * Analyze table structure for salary schedule specific metadata
     * @param headers Column headers
     * @param rows Table rows
     * @param columns Column structures
     * @returns Metadata specific to salary schedules
     */
    private analyzeSalaryScheduleMetadata(headers: string[], rows: any[][], columns: TableColumn[]) {
        const metadata: any = {};

        // Look for step columns (common in salary schedules)
        const stepColumnKeywords = ['step', 'grade', 'level', 'range'];
        const stepColumnIndex = headers.findIndex(header => 
            stepColumnKeywords.some(keyword => 
                header.toLowerCase().includes(keyword)
            )
        );

        if (stepColumnIndex >= 0) {
            metadata.hasSteps = true;
            metadata.stepColumn = headers[stepColumnIndex];
        }

        // Identify salary/pay columns (currency data types)
        const salaryColumns = columns
            .filter(col => col.dataType === 'currency')
            .map(col => col.name);
        
        if (salaryColumns.length > 0) {
            metadata.salaryColumns = salaryColumns;
        }

        return metadata;
    }

    /**
     * Format structured PDF content for LLM processing, preserving table relationships
     * @param structuredContent The structured PDF content
     * @returns Formatted text that preserves table structure
     */
    public formatStructuredContentForLLM(structuredContent: StructuredPDFContent): string {
        if (!structuredContent.hasTabularData) {
            return structuredContent.rawText;
        }

        let formattedContent = '=== STRUCTURED DOCUMENT CONTENT ===\n\n';

        // Add tables in a structured format
        structuredContent.tables.forEach((table, index) => {
            formattedContent += `## Table ${index + 1}${table.title ? `: ${table.title}` : ''}\n\n`;
            
            // Add metadata about the table
            if (table.metadata) {
                formattedContent += `**Table Info:** ${table.metadata.totalRows} rows × ${table.metadata.totalColumns} columns\n`;
                if (table.metadata.hasSteps) {
                    formattedContent += `**Step Column:** ${table.metadata.stepColumn}\n`;
                }
                if (table.metadata.salaryColumns) {
                    formattedContent += `**Salary Columns:** ${table.metadata.salaryColumns.join(', ')}\n`;
                }
                formattedContent += '\n';
            }

            // Format as markdown table for better LLM understanding
            if (table.headers.length > 0 && table.rows.length > 0) {
                // Headers
                formattedContent += '| ' + table.headers.join(' | ') + ' |\n';
                formattedContent += '| ' + table.headers.map(() => '---').join(' | ') + ' |\n';
                
                // Rows (limit to reasonable number for LLM)
                const maxRows = Math.min(table.rows.length, 50);
                for (let i = 0; i < maxRows; i++) {
                    const row = table.rows[i];
                    formattedContent += '| ' + row.join(' | ') + ' |\n';
                }
                
                if (table.rows.length > maxRows) {
                    formattedContent += `... (${table.rows.length - maxRows} more rows) ...\n`;
                }
            }
            
            // Add column analysis
            formattedContent += '\n**Column Analysis:**\n';
            table.columns.forEach(col => {
                const min = col.dataType === 'currency' || col.dataType === 'number' ? 
                    this.getColumnMinValue(col.values) : null;
                const max = col.dataType === 'currency' || col.dataType === 'number' ? 
                    this.getColumnMaxValue(col.values) : null;
                
                formattedContent += `- **${col.name}** (${col.dataType}): ${col.values.length} values`;
                if (min !== null && max !== null) {
                    formattedContent += `, Range: ${min} to ${max}`;
                }
                formattedContent += '\n';
            });
            
            formattedContent += '\n---\n\n';
        });

        // Add raw text at the end for context
        formattedContent += '## Raw Text Content\n\n';
        formattedContent += structuredContent.rawText;

        return formattedContent;
    }

    /**
     * Get minimum numeric value from a column
     */
    private getColumnMinValue(values: string[]): number | null {
        const numericValues = values
            .map(v => parseFloat(v.replace(/[$,]/g, '')))
            .filter(v => !isNaN(v));
        
        return numericValues.length > 0 ? Math.min(...numericValues) : null;
    }

    /**
     * Get maximum numeric value from a column  
     */
    private getColumnMaxValue(values: string[]): number | null {
        const numericValues = values
            .map(v => parseFloat(v.replace(/[$,]/g, '')))
            .filter(v => !isNaN(v));
        
        return numericValues.length > 0 ? Math.max(...numericValues) : null;
    }

    /**
     * Create a simple table structure when we assume content has tabular data
     * This is used when we know a document type has tables but don't want complex detection
     * @param rawText The raw text from the PDF
     * @returns Array of TableStructure objects
     */
    private createAssumedTableStructure(rawText: string): TableStructure[] {
        console.log('Creating assumed table structure for better LLM formatting');
        
        // For assumed tabular content, we create a single "table" that represents
        // the structured formatting of the document for the LLM
        const table: TableStructure = {
            title: 'Document_Content',
            headers: ['Content'], // Simple single column
            rows: [], // We'll populate this
            columns: [{
                name: 'Content',
                values: [],
                dataType: 'text'
            }],
            metadata: {
                totalRows: 0,
                totalColumns: 1,
                hasSteps: false, // We'll detect this
                salaryColumns: [] // We'll detect this
            }
        };

        // Split content into logical sections for better LLM processing
        const lines = rawText.split('\n').filter(line => line.trim().length > 0);
        
        // Look for numeric patterns that suggest salary data
        const hasNumericData = lines.some(line => 
            /\$[\d,]+/.test(line) || // Currency
            /\b\d{4,}\b/.test(line)   // Large numbers (likely salaries)
        );
        
        // Look for step patterns
        const hasStepData = lines.some(line => 
            /\bstep\s*\d+/i.test(line) || // "Step 1", "Step 2" etc
            /\b\d+\s*-\s*\d+\b/.test(line) // Ranges like "1-25"
        );

        // Set metadata based on content analysis
        table.metadata.hasSteps = hasStepData;
        if (hasNumericData) {
            table.metadata.salaryColumns = ['Salary Data'];
        }

        console.log(`Assumed table structure - hasSteps: ${hasStepData}, hasNumericData: ${hasNumericData}`);
        
        return [table];
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
                            const base64Image = `data:image/jpeg;base64,${base64String}`;
                            images.push(base64Image);
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
            
            // Parse the vision model response (same error handling as text processing)
            let visionResults: JsonObject;
            try {
                // Clean the response before parsing (same as text processing)
                const cleanedResponse = visionResponse.replace(/(\d+)_(\d+)/g, '$1$2'); // Remove numeric separators
                visionResults = JSON.parse(cleanedResponse);
                visionResults.processedWithVision = true;
                visionResults.totalPages = images.length;
                visionResults.contentItemID = params.contentItemID;
                
                console.log(`Vision processing successful - extracted data from ${images.length} pages`);
                return visionResults;
                
            } catch (parseError) {
                console.error('Vision model JSON parse error:', parseError.message);
                console.error('Raw vision response:', visionResponse.substring(0, 500));
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

    /**
    * Given a file path, as along as its one of the supported file types, this function choses the correct parser
    * and returns the extracted text. 
    * @param filePath - The path to the file to extract text from
    * @returns - The extracted text from the file
    */
    public async parseFileFromPath(filePath: string): Promise<string> {
        const dataBuffer = await fs.promises.readFile(filePath)
        const fileExtension = filePath.split('.').pop();
        switch (fileExtension) {
            case 'pdf':
                return await this.parsePDF(dataBuffer)
            case 'docx':
                return await this.parseDOCX(dataBuffer)
            default:
                throw new Error('File type not supported');
        }
    }

    /**
     * Enhanced file parsing that supports structured content extraction
     * @param filePath - The path to the file to extract content from
     * @param assumeTabularContent - Whether to assume content has tabular structure (for PDFs)
     * @returns - Either plain text or structured content based on assumeTabularContent flag
     */
    public async parseFileFromPathWithStructure(filePath: string, assumeTabularContent: boolean = false): Promise<string | StructuredPDFContent> {
        const dataBuffer = await fs.promises.readFile(filePath);
        const fileExtension = filePath.split('.').pop();
        
        switch (fileExtension) {
            case 'pdf':
                if (assumeTabularContent) {
                    return await this.parsePDFWithStructure(dataBuffer, assumeTabularContent);
                } else {
                    return await this.parsePDF(dataBuffer);
                }
            case 'docx':
                return await this.parseDOCX(dataBuffer);
            default:
                throw new Error('File type not supported');
        }
    }
} 