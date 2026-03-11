import { Metadata, RunView, UserInfo } from '@memberjunction/core'
import { RegisterClass, MJGlobal, UUIDsEqual } from '@memberjunction/global'
import { MJContentSourceEntity, MJContentItemEntity, MJContentFileTypeEntity, MJContentProcessRunEntity, MJContentTypeEntity, MJContentSourceTypeEntity, MJContentTypeAttributeEntity, MJContentSourceParamEntity } from '@memberjunction/core-entities'
import { ContentSourceParams, ContentSourceTypeParams } from './content.types'
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
import { MJContentItemAttributeEntity } from '@memberjunction/core-entities'

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
    public async ExtractTextAndProcessWithLLM(contentItems: MJContentItemEntity[], contextUser: UserInfo): Promise<void> {
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
     * Given processing parameters that include the text from our content item, process the text with the LLM and extract the 
     * information related to that content type.
     * @param params 
     * @returns 
     */
    public async ProcessContentItemText(params: ContentItemProcessParams, contextUser: UserInfo): Promise<void> {
        const LLMResults: JsonObject = await this.promptAndRetrieveResultsFromLLM(params, contextUser);
        await this.saveLLMResults(LLMResults, contextUser);
    }

    public async promptAndRetrieveResultsFromLLM(params: ContentItemProcessParams, contextUser: UserInfo) { 
        const model = AIEngine.Instance.Models.find(m => UUIDsEqual(m.ID, params.modelID))
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
        const JSONQueryResponse: JsonObject = JSON.parse(queryResponse);

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
        const contentItem: MJContentItemEntity = await md.GetEntityObject<any>('MJ: Content Items', contextUser)
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

            const contentItemTags = await md.GetEntityObject<any>('MJ: Content Item Tags', contextUser)
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
                const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser)
                await contentItem.Load(ID)
                contentItem.Name = LLMResults.title
                await contentItem.Save()
            }
            if(key === 'description') {
                const ID = LLMResults.contentItemID
                const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser)
                await contentItem.Load(ID)
                contentItem.Description = LLMResults.description
                await contentItem.Save()
            }
            if (key !== 'keywords' && key !== 'processStartTime' && key !== 'processEndTime' && key !== 'contentItemID' && key !== 'isValidContent') {
                const contentItemAttribute = await md.GetEntityObject<MJContentItemAttributeEntity>('MJ: Content Item Attributes', contextUser)
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
    public async getAllContentSources(contextUser: UserInfo, contentSourceTypeID: string): Promise<MJContentSourceEntity[]> {
        const rv = new RunView();
        
        const contentSourceResult = await rv.RunView<MJContentSourceEntity>({
            EntityName: 'MJ: Content Sources',
            ResultType: 'entity_object', 
            ExtraFilter: `ContentSourceTypeID='${contentSourceTypeID}'`
        }, contextUser);
        try {
        if (contentSourceResult.Success && contentSourceResult.Results.length) {
            const contentSources: MJContentSourceEntity[] = contentSourceResult.Results
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
        const results = await rv.RunView<MJContentSourceTypeEntity>({
            EntityName: 'MJ: Content Source Types',
            ExtraFilter: `Name='${subclass}'`,
            ResultType: 'entity_object'
        }, contextUser)
        if (results.Success && results.Results.length) {
            const contentSourceType: MJContentSourceTypeEntity = results.Results[0]
            return contentSourceType.ID
        }
        else {
            throw new Error(`Subclass with name ${subclass} not found`)
        }
    }

    public async getContentSourceParams(contentSource: MJContentSourceEntity, contextUser: UserInfo): Promise<any> {
        const contentSourceParams = new Map<string, any>()

        const rv = new RunView()
        const results = await rv.RunView<MJContentSourceParamEntity>({
            EntityName: 'MJ: Content Source Params', 
            ExtraFilter: `ContentSourceID='${contentSource.ID}'`,
            ResultType: 'entity_object'
        }, contextUser)

        if (results.Success && results.Results.length) {
            const contentSourceParamResults: MJContentSourceParamEntity[] = results.Results
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
        const results = await rv.RunView<MJContentSourceEntity>({
            EntityName: 'MJ: Content Source Type Params', 
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
        const results = await rv.RunView<MJContentProcessRunEntity>({
            EntityName: 'MJ: Content Process Runs', 
            ExtraFilter: `SourceID='${contentSourceID}'`,
            ResultType: 'entity_object', 
            OrderBy: 'EndTime DESC'
        }, contextUser)
        
        try{
            if (results.Success && results.Results.length) {
            const contentProcessRun: MJContentProcessRunEntity = results.Results[0]
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
        const results = await rv.RunView<MJContentTypeEntity>({
            EntityName: 'MJ: Content Types',
            ExtraFilter: `ID='${contentTypeID}'`,
            ResultType: 'entity_object',
        }, contextUser); 

        if (results.Success && results.Results.length) {
            const contentType: MJContentTypeEntity = results.Results[0];
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

        const contentFileTypeResult = await rv.RunView<MJContentSourceTypeEntity>({
            EntityName: 'MJ: Content Source Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID='${contentSourceTypeID}'`
        }, contextUser);
        try {
            if (contentFileTypeResult.Success && contentFileTypeResult.Results.length) {
                const contentSourceType: MJContentSourceTypeEntity = contentFileTypeResult.Results[0]
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

        const contentFileTypeResult = await rv.RunView<MJContentTypeEntity>({
            EntityName: 'MJ: Content Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID='${contentTypeID}'`
        }, contextUser);
        try {
            if (contentFileTypeResult.Success && contentFileTypeResult.Results.length) {
                const contentFileType: MJContentTypeEntity = contentFileTypeResult.Results[0]
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

        const contentFileTypeResult = await rv.RunView<MJContentFileTypeEntity>({
            EntityName: 'MJ: Content File Types',
            ResultType: 'entity_object',
            ExtraFilter: `ID='${contentFileTypeID}'`
        }, contextUser);
        try {
            if (contentFileTypeResult.Success && contentFileTypeResult.Results.length) {
                const contentFileType: MJContentFileTypeEntity = contentFileTypeResult.Results[0]
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
            const results = await rv.RunView<MJContentTypeAttributeEntity>({
                EntityName: 'MJ: Content Type Attributes', 
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
            const results = await rv.RunView<MJContentItemEntity>({
                EntityName: 'MJ: Content Items',
                ExtraFilter: `URL='${url}' AND ContentSourceID='${contentSourceParams.contentSourceID}'`,
                ResultType: 'entity_object'
            }, contextUser)

            if (results.Success && results.Results.length) {
                const contentItem: MJContentItemEntity = results.Results[0]
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
        const processRun = await md.GetEntityObject<any>('MJ: Content Process Runs', contextUser)
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
    * Given a buffer of data, this function extracts text from a DOCX file
    * @param dataBuffer: The buffer of data to extract text from
    * @returns The extracted text from the DOCX file
    */
    public async parseDOCX(dataBuffer: Buffer): Promise<string> {
        const dataDOCX = await officeparser.parseOffice(dataBuffer);
        return dataDOCX.toText()
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