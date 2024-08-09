import { BaseEngine, Metadata, RunView, UserInfo } from '@memberjunction/core'
import { ContentSourceEntity, ContentItemEntity, ContentItemTagEntity, ContentFileTypeEntity, ContentProcessRunEntity, ContentTypeEntity, ContentItemAttributeEntity, ContentSourceTypeEntity } from 'mj_generatedentities'
import { ContentSourceParams, ContentSourceTypeParams } from './content.types'
import pdfParse from 'pdf-parse'
import * as officeparser from 'officeparser'
import * as fs from 'fs'
import { ProcessRunParams, JsonObject } from './processRun.types'
import { ContentItemProcessParams } from '@memberjunction/content-autotagging-core'
import { OpenAI } from 'openai/index.mjs';
import moment from 'moment';
import { format } from 'date-fns'
import 'moment-timezone'
import axios from 'axios'
import * as cheerio from 'cheerio'
import crypto from 'crypto'
import { RegisterClass } from '@memberjunction/global'

@RegisterClass(BaseEngine, 'AutotagBaseEngine')
export class AutotagBaseEngine extends BaseEngine<AutotagBaseEngine> {
    public static get Instance(): AutotagBaseEngine {
        return super.getInstance<AutotagBaseEngine>();
    }
    
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo): Promise<void> {
        const config = [
            {
                EntityName: 'Content Sources',
            }, 
            {
                EntityName: 'Content Items'
            }, 
            {
                EntityName: 'Content Item Tags'
            }, 
            { 
                EntityName: 'Content File Types'
            }, 
            { 
                EntityName: 'Content Process Runs'
            },
            { 
                EntityName: 'Content Types'
            },
            {
                EntityName: 'Content Item Attributes'
            }
        ]

        return await this.Load(config, forceRefresh, contextUser)
    }

    /**
     * Given a list of content items, extract the text from each content item with the LLM and send off the required parameters to the LLM for tagging.
     * @param contentItems 
     * @returns 
     */
    public async ExtractTextAndProcessWithLLM(contentItems: ContentItemEntity[], openAIClient: any, contextUser: UserInfo): Promise<void> {
        if (!contentItems || contentItems.length === 0) {
            console.log('No content items to process');
            return;
        }

        const processRunParams = new ProcessRunParams();
        processRunParams.sourceID = contentItems[0].Get('ContentSourceID');
        processRunParams.startTime = new Date();
        processRunParams.numItemsProcessed = contentItems.length;

        for (const contentItem of contentItems) {
            try {
                const processingParams = new ContentItemProcessParams();
                
                // Parameters that depend on the content item
                processingParams.text = contentItem.Get('Text');
                processingParams.contentSourceTypeID = contentItem.Get('ContentSourceTypeID');
                processingParams.contentFileTypeID = contentItem.Get('ContentFileTypeID');
                processingParams.contentTypeID = contentItem.Get('ContentTypeID');

                // Parameters that depend on the content type
                const { modelID, minTags, maxTags } = await this.getContentItemParams(processingParams.contentTypeID, contextUser) 
                processingParams.modelID = modelID;
                processingParams.minTags = minTags;
                processingParams.maxTags = maxTags;
                processingParams.contentItemID = contentItem.Get('ID');

                this.ProcessContentItemText(processingParams, openAIClient, contextUser);

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
    public async ProcessContentItemText(params: ContentItemProcessParams, openAIClient: OpenAI, contextUser: UserInfo): Promise<void> {
        const LLMResults: JsonObject = await this.promptAndRetrieveResultsFromLLM(params, openAIClient, contextUser);
        await this.saveLLMResults(LLMResults, contextUser);
    }

    public async promptAndRetrieveResultsFromLLM(params: ContentItemProcessParams, openai: OpenAI, contextUser: UserInfo) { 
        const text = params.text
        const model = await this.getModelNameFromID(params.modelID, contextUser)
        const contentSourceType = await this.getContentSourceTypeName(params.contentSourceTypeID, contextUser)
        const contentFileType = await this.getContentFileTypeName(params.contentFileTypeID, contextUser)
        const additionalContentTypePrompts = await this.getAdditionalContentTypePrompt(params.contentTypeID, contextUser)
        const minTags = params.minTags
        const maxTags = params.maxTags
        const startTime = new Date()

        const prompt = `
        You are provided the text of a ${contentSourceType} extracted from a ${contentFileType} file. Please extract the title of the provided text and between ${minTags} and ${maxTags} topical key words that are most relevant to the text.
        Please provide the keywords in a list format.
        Make sure the response is just the json file with the format below, please don't include a greeting in the response, only output the json file:

        {
            title: (title here),
            keywords: (list keywords here)
        }

        ${additionalContentTypePrompts}

        The supplied text is: ${text}
        `;

        const response = await openai.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            model: model,
            temperature:0.0, 
            response_format: {"type":"json_object"}
        });

        const queryResponse = response.choices[0]?.message?.content?.trim() || '';
        const LLMResults: JsonObject = JSON.parse(queryResponse);
        const endTime = new Date();

        LLMResults.processStartTime = startTime
        LLMResults.processEndTime = endTime
        LLMResults.contentItemID = params.contentItemID

        return LLMResults
    }

    public async saveLLMResults(LLMResults: JsonObject, contextUser: UserInfo) {
        await this.saveResultsToContentItemAttribute(LLMResults, contextUser)
        await this.saveContentItemTags(LLMResults.contentItemID, LLMResults, contextUser)
        console.log(`Results for content item ${LLMResults.contentItemID} saved successfully`)
    }

    /**
     * Given the processing results from the LLM and the Content Element Item that was saved to the database, this function saves the tags as Content Element Tags in the database.
     * @param md: The metadata object to save the tags
     * @param contentElementItem: The content element item that was saved to the database
     * @param results: The results of the processing from the LLM
     * @param contextUser: The user context to save the tags
     * @returns
     */
    public async saveContentItemTags(contentItemID: number, LLMResults: JsonObject, contextUser: UserInfo) {
        const md = new Metadata()
        for (const keyword of LLMResults.keywords) {

            const contentItemTags = <ContentItemTagEntity> await md.GetEntityObject('Content Item Tags', contextUser)
            
            contentItemTags.NewRecord()
            contentItemTags.Set('ItemID', contentItemID)
            contentItemTags.Set('Tag', keyword)
            contentItemTags.Set('CreatedAt', LLMResults.processEndTime)
            contentItemTags.Set('UpdatedAt', LLMResults.processEndTime)

            await contentItemTags.Save()
        }
    }

    public async saveResultsToContentItemAttribute(LLMResults: JsonObject, contextUser: UserInfo) {
        const md = new Metadata()
        for (const key in LLMResults) {
            if (key !== 'keywords' && key !== 'processStartTime' && key !== 'processEndTime' && key !== 'contentItemID') {
                const contentItemAttributes = <ContentItemAttributeEntity> await md.GetEntityObject('Content Item Attributes', contextUser)
                
                //Value should be a string, if its a null or undefined value, set it to an empty string
                const value = LLMResults[key] || ''

                contentItemAttributes.NewRecord()
                contentItemAttributes.Set('ContentItemID', LLMResults.contentItemID)
                contentItemAttributes.Set('Name', key)
                contentItemAttributes.Set('Value', value)
                await contentItemAttributes.Save()
            }
            // Overwrite name of content item with title if it exists
            if (key === 'title') {
                const ID = LLMResults.contentItemID
                
                const rv = new RunView()
                const results = await rv.RunView<ContentItemEntity>({
                    EntityName: 'Content Items',
                    ExtraFilter: `ID=${ID}`,
                    ResultType: 'entity_object'
                }, contextUser)

                const contentItem = results.Results[0]
                contentItem.Set('Name', LLMResults.title)
                await contentItem.Save()
            }
        }
    }

    /*** 
    * Retrieves all of the content sources of a given content source type data from the database.
    * @param contextUser: The user context to retrieve the content source data
    * @returns A list of content sources
    */
    public async getAllContentSources(contextUser: UserInfo, contentSourceTypeID: number): Promise<ContentSourceEntity[]|undefined> {
        const rv = new RunView();
        
        const contentSourceResult = await rv.RunView<ContentSourceEntity>({
            EntityName: 'Content Sources',
            ResultType: 'entity_object', 
            ExtraFilter: `ContentSourceTypeID=${contentSourceTypeID}`
        }, contextUser);
        try {
        if (contentSourceResult.Success && contentSourceResult.Results.length) {
            return contentSourceResult.Results
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

    public async setSubclassContentSourceType(subclass: string, contextUser: UserInfo): Promise<number>{
        const rv = new RunView()
        const results = await rv.RunView<ContentSourceTypeEntity>({
            EntityName: 'Content Source Types',
            ExtraFilter: `Name='${subclass}'`,
            ResultType: 'entity_object'
        }, contextUser)
        if (results.Success && results.Results.length) {
            return results.Results[0].Get('ID')
        }
        else {
            throw new Error(`Subclass with name ${subclass} not found`)
        }
    }

    public async getContentSourceParams(contentSource: ContentSourceEntity, contextUser: UserInfo): Promise<any> {
        const contentSourceID: number = contentSource.Get('ID')
        const contentSourceParams = new Map<string, any>()

        const rv = new RunView()
        const results = await rv.RunView<ContentSourceEntity>({
            EntityName: 'Content Source Params', 
            ExtraFilter: `ContentSourceID=${contentSourceID}`,
            ResultType: 'entity_object'
        }, contextUser)

        if (results.Success && results.Results.length) {
            for (const result of results.Results) {
                const contentSourceTypeID = result.Get('ContentSourceTypeParamID')
                const params: ContentSourceTypeParams = await this.getDefaultContentSourceTypeParams(contentSourceTypeID, contextUser)
                params.contentSourceID = contentSourceID

                if (result.Get('Value')) {
                    // There is a provided value, so overwrite the default value
                    params.value = this.castValueAsCorrectType(result.Get('Value'), params.type)
                }
                contentSourceParams.set(params.name, params.value)
            }
            return contentSourceParams
        }
        else {
            console.log(`No content source params found for content source with ID ${contentSourceID}, using default values`)
        }
    }

    public async getDefaultContentSourceTypeParams(contentSourceTypeID: number, contextUser: UserInfo): Promise<ContentSourceTypeParams> {
        const rv = new RunView()
        const results = await rv.RunView<ContentSourceEntity>({
            EntityName: 'Content Source Type Params', 
            ExtraFilter: `ID=${contentSourceTypeID}`,
            ResultType: 'entity_object'
        }, contextUser)

        if (results.Success && results.Results.length) {
            const params = new ContentSourceTypeParams()
            
            params.name = results.Results[0].Get('Name')
            params.type = results.Results[0].Get('Type').toLowerCase()
            params.value = this.castValueAsCorrectType(results.Results[0].Get('Value'), params.type) // Default value in this case, can be null or overridden later
            return params
        }
        throw new Error(`Content Source Type with ID '${contentSourceTypeID}' not found`)
    }

    public castValueAsCorrectType(value: string, type: string): any {
        switch (type) {
            case 'number':
                return parseInt(value)
            case 'boolean':
                return this.stringToBoolean(value)
            case 'string':
                return value
            default:
                return value
        }
    }

    public stringToBoolean(string: string): boolean {
        return string === 'true'
    }

    /**
     * Given a model ID, this function retrieves the API model name from the database.
     * @param modelID 
     * @param contextUser 
     * @returns 
     */
    public async getModelNameFromID(modelID: string, contextUser: UserInfo): Promise<string|undefined> {
        const rv = new RunView()
        const results = await rv.RunView({
            EntityName: 'AI Models', 
            ExtraFilter: `ID='${modelID}'`,
            ResultType: 'entity_object'
        }, contextUser)

        if (results.Success && results.Results.length) {
            return results.Results[0].Get('APIName')
        }
        return undefined
    }

    /**
     * Given a run date, this function converts the run date to the user's timezone and formats it as a date object.
     * @param lastRunDate: The retrieved last run date from the database 
     * @returns The last run date converted to the user's timezone
     */
    public async convertLastRunDateToTimezone(lastRunDate: Date): Promise<Date> {
        const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const date = new Date(moment.utc(format(lastRunDate, 'yyyy-MM-dd HH:mm:ss')).tz(userTimeZone).format('YYYY-MM-DD HH:mm:ss.SSSZ'))
        return date
    }

    /**
     * Retrieves the last run date of the provided content source from the database. If no previous runs exist, the epoch date is returned.
     * @param contentSourceID: The ID of the content source to retrieve the last run date
     * @param contextUser: The user context to retrieve the last run date 
     * @returns 
     */
    public async getContentSourceLastRunDate(contentSourceID: number, contextUser: UserInfo): Promise<Date|void> {
        const rv = new RunView()
        const results = await rv.RunView({
            EntityName: 'Content Process Runs', 
            ExtraFilter: `SourceID=${contentSourceID}`,
            ResultType: 'entity_object', 
            OrderBy: 'EndTime DESC'
        }, contextUser)
        
        try{
            if (results.Success && results.Results.length) {
            const lastRunDate = results.Results[0].Get('EndTime')
            return this.convertLastRunDateToTimezone(lastRunDate)
            }
            else if (results.Success && !results.Results.length) {
                // Case where we do not have any previous runs for the content source, just return the epoch date
                return new Date(0)
            }
        }
        catch (e) {
            console.error(e);
            throw e;
        }
    }

    public async getContentItemHash(contentItemID: number, contextUser: UserInfo): Promise<string|void> {
        const rv = new RunView()
        const results = await rv.RunView({
            EntityName: 'Content Items', 
            ExtraFilter: `ID=${contentItemID}`,
            ResultType: 'entity_object'
        }, contextUser)

        try {
            if (results.Success && results.Results.length) {
                return results.Results[0].Get('Checksum')
            }
        }
        catch (e) {
            console.error(e);
            throw e;
        }
    }

    public async getContentItemParams(contentTypeID: number, contextUser: UserInfo): Promise<{ modelID: string; minTags: number; maxTags: number; }> {
        const rv = new RunView();
        const results = await rv.RunView({
            EntityName: 'Content Types',
            ExtraFilter: `ID = ${contentTypeID}`,
            ResultType: 'entity_object',
        }, contextUser); 

        if (results.Success && results.Results.length) {
            const contentType = results.Results[0];
            return {
                modelID: contentType.Get('AIModelID'),
                minTags: contentType.Get('MinTags'),
                maxTags: contentType.Get('MaxTags')
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
    public async getContentSourceTypeName(contentSourceTypeID: number, contextUser: UserInfo): Promise<string|void> {
        const rv = new RunView();

        const contentFileTypeResult = await rv.RunView<ContentFileTypeEntity>({
            EntityName: 'Content Source Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID = ${contentSourceTypeID}`
        }, contextUser);
        try {
            if (contentFileTypeResult.Success && contentFileTypeResult.Results.length) {
                return contentFileTypeResult.Results[0].Get('Name')
            }
        }

        catch (e) {
            console.error(e);
            throw e;
        }
    }

    /**
     * Given a content type ID, this function retrieves the content type name from the database.
     * @param contentTypeID 
     * @param contextUser 
     * @returns 
     */
    public async getContentTypeName(contentTypeID: number, contextUser: UserInfo): Promise<string|void> {
        const rv = new RunView();

        const contentFileTypeResult = await rv.RunView<ContentFileTypeEntity>({
            EntityName: 'Content Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID = ${contentTypeID}`
        }, contextUser);
        try {
            if (contentFileTypeResult.Success && contentFileTypeResult.Results.length) {
                return contentFileTypeResult.Results[0].Get('Name')
            }
        }

        catch (e) {
            console.error(e);
            throw e;
        }
    }

    /**
     * Given a content file type ID, this function retrieves the content file type name from the database.
     * @param contentFileTypeID 
     * @param contextUser 
     * @returns
     */
    public async getContentFileTypeName(contentFileTypeID: number, contextUser: UserInfo): Promise<string|void> {
        const rv = new RunView();

        const contentFileTypeResult = await rv.RunView<ContentFileTypeEntity>({
            EntityName: 'Content File Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID = ${contentFileTypeID}`
        }, contextUser);
        try {
            if (contentFileTypeResult.Success && contentFileTypeResult.Results.length) {
                return contentFileTypeResult.Results[0].Get('Name')
            }
        }

        catch (e) {
            console.error(e);
            throw e;
        }
    }

    public async getAdditionalContentTypePrompt(contentTypeID: number, contextUser: UserInfo): Promise<string> {
        const rv = new RunView()
        const results = await rv.RunView<ContentTypeEntity>({
            EntityName: 'Content Type Attributes', 
            ExtraFilter: `ContentTypeID=${contentTypeID}`,
            ResultType: 'entity_object'
        }, contextUser)

        if (results.Success && results.Results.length) {
            let prompt = ''
            for (const result of results.Results) {
                prompt += `${result.Get('Prompt')}\n`
            }

            return prompt
        }
        return ''
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

    /**
    * Given a file path, this function sets the content source item in preparation for processing with the LLM.
    * @param filePath: The path to the file to set as a content source item
    */
    public async setSingleContentItem(contentSourceParams: ContentSourceParams, filepath:string, contextUser:UserInfo): Promise<ContentItemEntity> {
        const md = new Metadata()
        const contentItem = <ContentItemEntity> await md.GetEntityObject('Content Items', contextUser)
        contentItem.NewRecord()
        contentItem.Set('ContentSourceID', contentSourceParams.contentSourceID)
        contentItem.Set('Description', await this.getContentItemDescription(contentSourceParams, contextUser)) // come back and generalize this, maybe with LLM?
        contentItem.Set('ContentTypeID', contentSourceParams.ContentTypeID)
        contentItem.Set('ContentSourceTypeID', contentSourceParams.ContentSourceTypeID)
        contentItem.Set('ContentFileTypeID', contentSourceParams.ContentFileTypeID)
        contentItem.Set('URL', filepath)
        contentItem.Set('CreatedAt', new Date())
        contentItem.Set('UpdatedAt', new Date())
        await contentItem.Save()
     
        return contentItem
    }

    public async updateSingleContentItem(contentSourceParams: ContentSourceParams, filepath:string, contextUser: UserInfo): Promise<void> {
        console.log('Will implement updating later')
    }

    public async getChecksumFromURL(url: string, contextUser: UserInfo): Promise<string> {
        const response = await axios.get(url)
        const content = response.data
        const hash = crypto.createHash('sha256').update(content).digest('hex')
        return hash
    }

    public async getChecksumFromText(text: string, contextUser: UserInfo): Promise<string> {
        const hash = crypto.createHash('sha256').update(text).digest('hex')
        return hash
    }

    public async getContentItemIDFromURL(contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<number> {
        const url = contentSourceParams.URL
        const rv = new RunView()
        try{
            const results = await rv.RunView<ContentItemEntity>({
                EntityName: 'Content Items',
                ExtraFilter: `URL='${url}' AND ContentSourceID=${contentSourceParams.contentSourceID}`,
                ResultType: 'entity_object'
            }, contextUser)

            if (results.Success && results.Results.length) {
                return results.Results[0].Get('ID')
            }
            else {
                throw new Error(`Content item with URL ${url} not found`)
            }
        }
        catch (e) {
            throw new Error(`Failed to retrieve content item ID from URL: ${url}`)
        }
    }

    public async getAllContentItems(contextUser: UserInfo, contentSourceTypeID: number): Promise<ContentItemEntity[]|void> {
        const rv = new RunView();

        const contentItemResult = await rv.RunView<ContentItemEntity>({
            EntityName: 'Content Items',
            ResultType: 'entity_object', 
            ExtraFilter: `ContentSourceTypeID=${contentSourceTypeID}` 
        }, contextUser);
        try {
            if (contentItemResult.Success && contentItemResult.Results.length) {
                return contentItemResult.Results
            }
        }

        catch (e) {
            console.error(e);
            throw e;
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
        const processRun = <ContentProcessRunEntity> await md.GetEntityObject('Content Process Runs', contextUser)
        processRun.NewRecord()
        processRun.Set('SourceID', processRunParams.sourceID)
        processRun.Set('StartTime', processRunParams.startTime)
        processRun.Set('EndTime', processRunParams.endTime)
        processRun.Set('Status', 'Complete')
        processRun.Set('ProcessedItems', processRunParams.numItemsProcessed)
        processRun.Set('CreatedAt', new Date())
        processRun.Set('UpdatedAt', new Date())
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
} 