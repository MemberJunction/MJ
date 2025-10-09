import { Metadata, RunView, UserInfo } from '@memberjunction/core'
import { RegisterClass, MJGlobal } from '@memberjunction/global'
import { ContentSourceEntity, ContentItemEntity, ContentFileTypeEntity, ContentProcessRunEntity, ContentTypeEntity, ContentSourceTypeEntity, ContentTypeAttributeEntity, ContentSourceParamEntity } from '@memberjunction/core-entities'
import { ContentSourceParams, ContentSourceTypeParams } from './content.types'
import pdfParse from 'pdf-parse'
import pdf2pic from 'pdf2pic'
import { PDFDocument, degrees } from 'pdf-lib'
import * as im from 'imagemagick'
import * as officeparser from 'officeparser'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
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

/**
 * AutotagBaseEngine - Main engine for content processing with vision model support
 * 
 * FORCE VISION PROCESSING OPTIONS:
 * 
 * 1. Environment Variable (Global):
 *    Set FORCE_VISION_PROCESSING=true to force all PDFs to use vision models
 *    Example: FORCE_VISION_PROCESSING=true npm start
 * 
 * 2. Content Source Parameter (Per-Source):
 *    Add 'forceVisionProcessing': true to content source parameters
 * 
 * 3. Method Parameter (Per-Call):
 *    Pass forceVisionProcessing: true to processing methods
 *    Example: await engine.ExtractTextAndProcessWithLLM(items, user, [], true);
 *            await autotag.TagSingleContentItem(item, user, [], true);
 * 
 * Priority: Method Parameter > Environment Variable > Content Source Parameter
 * 
 * ORIENTATION DETECTION:
 * - Uses IMAGE-BASED analysis with vision models (more reliable than text analysis)
 * - Tests all 4 orientations and picks the one that looks most correct
 * - Optimized: skips orientation detection when vision processing is globally forced
 * - Prioritizes accuracy over speed for critical document processing
 */
@RegisterClass(AIEngine, 'AutotagBaseEngine')
export class AutotagBaseEngine extends AIEngine {
    private currentOrientationTest?: number | 'final'; // Track current rotation being tested for debug filenames
    
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
     * @param contextUser 
     * @param protectedFields 
     * @param forceVisionProcessing - Optional flag to force vision processing for all PDF items
     * @returns 
     */
    public async ExtractTextAndProcessWithLLM(contentItems: ContentItemEntity[], contextUser: UserInfo, protectedFields?: string[], forceVisionProcessing?: boolean): Promise<void> {
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

                await this.ProcessContentItemText(processingParams, contextUser, protectedFields);

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
        structuredDataMap?: Map<string, StructuredPDFContent>,
        protectedFields?: string[]
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
                await this.ProcessContentItemTextEnhanced(processingParams, contextUser, protectedFields);

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
    public async ProcessContentItemText(params: ContentItemProcessParams, contextUser: UserInfo, protectedFields?: string[]): Promise<void> {
        // Check if vision processing with base64 images was requested
        if (params.text && params.text.startsWith('VISION_IMAGES:')) {
            console.log('🔄 Processing vision images from base64 strings');
            const base64Images = params.text.substring('VISION_IMAGES:'.length).split('|');
            console.log(`📸 Found ${base64Images.length} base64 images to process`);
            
            // Process with vision model using base64 images directly
            const LLMResults: JsonObject = await this.processWithVisionModelFromBase64(base64Images, params, contextUser);
            await this.saveLLMResults(LLMResults, contextUser, protectedFields);
            return;
        }
        
        // Check if vision processing was requested via the special token (legacy support)
        if (params.text === 'VISION_PROCESSING_REQUESTED' || params.text === 'VISION_PROCESSING_REQUESTED_NO_FILE') {
            console.log('🔄 Switching to vision processing due to force flag');
            console.log(`🔍 DEBUG: correctedPdfBuffer available: ${!!params.correctedPdfBuffer}`);
            console.log(`🔍 DEBUG: correctedPdfBuffer size: ${params.correctedPdfBuffer?.length || 0} bytes`);
            
            let correctedPdfBuffer: Buffer;
            
            // Use cached corrected buffer if available, otherwise re-read and correct
            if (params.correctedPdfBuffer && params.correctedPdfBuffer.length > 0) {
                console.log('✅ Using cached corrected PDF buffer');
                correctedPdfBuffer = params.correctedPdfBuffer;
            } else {
                console.log('⚠️ No cached buffer available, re-reading and correcting PDF...');
                console.log(`🔍 DEBUG: ContentItemID: ${params.contentItemID}`);
                // Fallback: re-read and correct (shouldn't happen with new flow)
                const contentItem = await this.getContentItemEntity(params.contentItemID, contextUser);
                console.log(`🔍 DEBUG: ContentItem URL: ${contentItem.URL}`);
                const filePath = contentItem.URL;
                const dataBuffer = await fs.promises.readFile(filePath);
                correctedPdfBuffer = await this.preprocessPDFOrientation(dataBuffer);
            }
            
            // Process with vision model using corrected buffer
            const LLMResults: JsonObject = await this.processWithVisionModel(correctedPdfBuffer, params, contextUser);
            await this.saveLLMResults(LLMResults, contextUser, protectedFields);
            return;
        }
        
        // Regular text processing
        const LLMResults: JsonObject = await this.promptAndRetrieveResultsFromLLM(params, contextUser);
        await this.saveLLMResults(LLMResults, contextUser, protectedFields);
    }

    /**
     * Enhanced content processing that handles vision model processing for tabular PDFs
     * @param params Enhanced processing parameters that may include structured data
     * @param contextUser User context
     */
    public async ProcessContentItemTextEnhanced(params: ContentItemProcessParamsExtended, contextUser: UserInfo, protectedFields?: string[]): Promise<void> {
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

        await this.saveLLMResults(LLMResults, contextUser, protectedFields);
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

    public async saveLLMResults(LLMResults: JsonObject, contextUser: UserInfo, protectedFields?: string[]) {
        if (LLMResults.isValidContent === true) {   
            // Only save results if the content is of the type that we expected. 
            await this.saveResultsToContentItemAttribute(LLMResults, contextUser, protectedFields)
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

    public async saveResultsToContentItemAttribute(LLMResults: JsonObject, contextUser: UserInfo, protectedFields?: string[]) {
        const md = new Metadata()
        const protectedFieldsSet = new Set(protectedFields || []);
        
        for (const key in LLMResults) {
            if (key === 'title') {
                const ID = LLMResults.contentItemID
                const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', contextUser)
                await contentItem.Load(ID)
                contentItem.Name = LLMResults.title
                await contentItem.Save()
                console.log(`Updated ContentItem Name from 'title' for ContentItem ${ID}`);
            }
            else if(key === 'description') {
                const ID = LLMResults.contentItemID
                const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', contextUser)
                await contentItem.Load(ID)
                contentItem.Description = LLMResults.description
                await contentItem.Save()
                console.log(`Updated ContentItem Description from 'description' for ContentItem ${ID}`);
            }
            // Handle custom ContentItemAttribute updates with protection
            else if (key !== 'keywords' && key !== 'processStartTime' && key !== 'processEndTime' && key !== 'contentItemID' && key !== 'isValidContent') {
                if (!protectedFieldsSet.has(key)) {
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
                } else {
                    console.log(`Skipped updating ContentItemAttribute '${key}' (protected field) for ContentItem ${LLMResults.contentItemID}`);
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
     * @param forceVisionProcessing - Optional flag to force vision model processing for PDFs
     * @returns Parsed text from the content item
     */
    public async parseContentItem(contentItem: ContentItemEntity, contextUser: UserInfo, forceVisionProcessing?: boolean): Promise<string> {
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
            
            // 4. Check for vision processing flags
            const shouldUseVision = this.shouldForceVisionProcessing(forceVisionProcessing, sourceParams);
            
            // 5. Parse based on file type with full context
            switch (fileExtension) {
                case '.pdf':
                    // Preprocess PDF for orientation correction
                    const correctedPdfBuffer = await this.preprocessPDFOrientation(dataBuffer);
                    
                    if (shouldUseVision) {
                        console.log('🔄 FORCING VISION PROCESSING for PDF - converting to images');
                        console.log('📋 Using corrected PDF buffer (post-orientation detection)');
                        
                        // Set flag to identify final processing images in debug output
                        this.currentOrientationTest = 'final';
                        
                        try {
                            // Convert corrected PDF to high-quality B&W images using ImageMagick
                            const images = await this.convertPDFToImages(correctedPdfBuffer);
                            console.log(`✅ Generated ${images.length} FINAL high-contrast B&W images for vision processing`);
                            console.log('🎨 Images should be pure black/white with ImageMagick optimizations');
                            
                            // Return images as concatenated base64 string with special prefix
                            return 'VISION_IMAGES:' + images.join('|');
                        } finally {
                            // Clear the debug flag
                            this.currentOrientationTest = undefined;
                        }
                    }
                    
                    return await this.parsePDF(correctedPdfBuffer);
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
     * Enhanced parseContentItem that returns both text and corrected PDF buffer
     * @param contentItem - The ContentItem entity
     * @param contextUser - User context
     * @param forceVisionProcessing - Vision processing flag
     * @returns Object containing text and corrected PDF buffer
     */
    public async parseContentItemWithBuffer(
        contentItem: ContentItemEntity, 
        contextUser: UserInfo, 
        forceVisionProcessing?: boolean
    ): Promise<{ text: string; correctedPdfBuffer?: Buffer }> {
        try {
            // 1. Load content source and parameters
            const contentSource = await this.getContentSourceEntity(contentItem.ContentSourceID, contextUser);
            const sourceParams = await this.getContentSourceParams(contentSource, contextUser);
            
            // 2. Get content file type information
            const contentFileType = await this.getContentFileTypeEntity(contentItem.ContentFileTypeID, contextUser);
            const fileExtension = contentFileType.FileExtension.toLowerCase();
            
            // 3. Check for vision processing flags BEFORE trying to read file
            const shouldUseVision = this.shouldForceVisionProcessing(forceVisionProcessing, sourceParams);
            
            // 4. If forcing vision processing and file doesn't exist locally, return token without file processing
            if (shouldUseVision && fileExtension === '.pdf') {
                const filePath = contentItem.URL;
                console.log(`🔍 Checking file existence: ${filePath}`);
                
                try {
                    // Try to check if file exists before reading
                    await fs.promises.access(filePath);
                    console.log('✅ File exists locally, proceeding with orientation correction...');
                } catch (accessError) {
                    console.log('⚠️ File not accessible locally, will use existing ContentItem text for vision processing');
                    console.log(`🔍 File path: ${filePath}`);
                    console.log(`🔍 Access error: ${accessError.message}`);
                    
                    // Return vision token without file processing - the vision model will handle the existing text
                    return { 
                        text: 'VISION_PROCESSING_REQUESTED_NO_FILE'  // Special token indicating no file access
                    };
                }
            }
            
            // 5. Read file data (only if we reach here)
            const filePath = contentItem.URL;
            const dataBuffer = await fs.promises.readFile(filePath);
            
            // 6. Parse based on file type with full context
            switch (fileExtension) {
                case '.pdf':
                    // Preprocess PDF for orientation correction
                    const correctedPdfBuffer = await this.preprocessPDFOrientation(dataBuffer);
                    
                    if (shouldUseVision) {
                        console.log('🔄 FORCING VISION PROCESSING for PDF (flag enabled)');
                        return { 
                            text: 'VISION_PROCESSING_REQUESTED', 
                            correctedPdfBuffer // Return the corrected buffer
                        };
                    }
                    
                    const text = await this.parsePDF(correctedPdfBuffer);
                    return { text, correctedPdfBuffer };
                    
                case '.docx':
                    const docxText = await this.parseDOCX(dataBuffer);
                    return { text: docxText };
                    
                case '.xlsx':
                    const xlsxText = await this.parseXLSXWithContext(dataBuffer, sourceParams);
                    return { text: xlsxText };
                    
                default:
                    throw new Error(`Unsupported file type: ${fileExtension}`);
            }
        } catch (error) {
            console.error(`Failed to parse content item ${contentItem.ID}:`, error.message);
            throw new Error(`Content parsing failed: ${error.message}`);
        }
    }

    /**
     * Determines whether to force vision processing based on multiple flag sources
     * @param forceVisionProcessing - Method-level override flag
     * @param sourceParams - Content source parameters that may contain vision flag
     * @returns true if vision processing should be forced
     */
    private shouldForceVisionProcessing(forceVisionProcessing?: boolean, sourceParams?: Map<string, any>): boolean {
        // 1. Check method-level override (highest priority)
        if (forceVisionProcessing === true) {
            console.log('🎯 Vision processing forced via method parameter');
            return true;
        }
        
        // 2. Check environment variable (global setting)
        const envForceVision = process.env.FORCE_VISION_PROCESSING;
        if (envForceVision && (envForceVision.toLowerCase() === 'true' || envForceVision === '1')) {
            console.log('🌍 Vision processing forced via environment variable FORCE_VISION_PROCESSING');
            return true;
        }
        
        // 3. Check content source parameter (per-source setting)
        if (sourceParams?.has('forceVisionProcessing')) {
            const sourceVisionFlag = sourceParams.get('forceVisionProcessing');
            if (sourceVisionFlag === true || sourceVisionFlag === 'true' || sourceVisionFlag === '1') {
                console.log('📋 Vision processing forced via content source parameter');
                return true;
            }
        }
        
        return false;
    }

    /**
     * Helper method to get ContentItem entity by ID
     * @param contentItemID - ID of the content item
     * @param contextUser - User context
     * @returns ContentItem entity
     */
    private async getContentItemEntity(contentItemID: string, contextUser: UserInfo): Promise<ContentItemEntity> {
        const md = new Metadata();
        const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', contextUser);
        await contentItem.Load(contentItemID);
        return contentItem;
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
    /**
     * Preprocesses PDF by detecting and correcting orientation using IMAGE-BASED analysis
     * 
     * APPROACH: Uses vision models to analyze actual page images at different rotations
     * - More reliable than text-based detection (handles scanned docs, garbled OCR)
     * - Tests all 4 orientations (0°, 90°, 180°, 270°) 
     * - Vision model determines which looks most correctly oriented
     * - Prioritizes accuracy over speed for critical document processing
     * 
     * @param dataBuffer - Original PDF buffer
     * @returns Orientation-corrected PDF buffer
     */
    public async preprocessPDFOrientation(dataBuffer: Buffer, skipIfVisionForced: boolean = false): Promise<Buffer> {
        try {
            // Check if we should skip orientation correction when vision processing is forced
            // (since vision models can handle rotated content well)
            const envForceVision = process.env.FORCE_VISION_PROCESSING;
            if (skipIfVisionForced && envForceVision && (envForceVision.toLowerCase() === 'true' || envForceVision === '1')) {
                console.log('⚡ Skipping orientation detection - vision processing forced globally');
                return dataBuffer;
            }
            
            const requiredRotation = await this.detectPDFOrientation(dataBuffer);
            
            if (requiredRotation === 0) {
                console.log('✅ PDF is already correctly oriented');
                return dataBuffer; // No rotation needed
            }
            
            console.log(`🔄 PDF requires ${requiredRotation}° rotation for correct orientation`);
            return await this.correctPDFOrientation(dataBuffer, requiredRotation);
            
        } catch (error) {
            console.warn('❌ PDF orientation correction failed, using original:', error.message);
            return dataBuffer; // Fall back to original if correction fails
        }
    }

    /**
     * Detects PDF orientation using IMAGE-BASED analysis by testing different rotations
     * More reliable than text-based analysis, especially for scanned documents
     * @param dataBuffer - PDF buffer to analyze
     * @returns Required rotation in degrees (0, 90, 180, or 270)
     */
    private async detectPDFOrientation(dataBuffer: Buffer): Promise<number> {
        try {
            console.log('🔍 Starting IMAGE-BASED orientation detection...');
            
            // Test each possible orientation using image analysis
            const orientationScores: { [key: number]: number } = {};
            const rotations = [0, 90, 180, 270];
            
            for (const rotation of rotations) {
                try {
                    console.log(`📸 Testing ${rotation}° rotation with image analysis...`);
                    
                    // Track current test for debug filenames
                    this.currentOrientationTest = rotation;
                    
                    let testBuffer = dataBuffer;
                    
                    // Apply rotation if not 0
                    if (rotation !== 0) {
                        testBuffer = await this.correctPDFOrientation(dataBuffer, rotation);
                    }
                    
                    // Convert PDF to image for visual analysis
                    const images = await this.convertPDFToImages(testBuffer);
                    
                    if (!images || images.length === 0) {
                        console.warn(`No images generated for ${rotation}° rotation`);
                        orientationScores[rotation] = 0;
                        continue;
                    }
                    
                    // Analyze the first page (most representative)
                    const imageBuffer = Buffer.from(images[0], 'base64');
                    const visualScore = await this.calculateImageOrientationScore(imageBuffer, rotation);
                    
                    orientationScores[rotation] = visualScore;
                    console.log(`📊 Orientation ${rotation}°: visual score = ${visualScore.toFixed(3)}`);
                    
                } catch (rotationError) {
                    console.warn(`❌ Failed to test ${rotation}° rotation:`, rotationError.message);
                    orientationScores[rotation] = 0;
                }
            }
            
            // Clear orientation test tracking
            this.currentOrientationTest = undefined;
            
            // Find the best orientation
            const bestRotation = Object.keys(orientationScores).reduce((best, rotation) => 
                orientationScores[parseInt(rotation)] > orientationScores[parseInt(best)] ? rotation : best
            );
            
            const bestScore = orientationScores[parseInt(bestRotation)];
            const confidence = bestScore;
            
            console.log(`🎯 Best visual orientation: ${bestRotation}° (confidence: ${confidence.toFixed(3)})`);
            
            // More lenient thresholds for image-based detection since it's more reliable
            if (confidence > 0.4 && parseInt(bestRotation) !== 0) {
                console.log(`✅ Image-based detection: rotating ${bestRotation}°`);
                return parseInt(bestRotation);
            } else if (parseInt(bestRotation) === 0 && confidence > 0.3) {
                console.log('✅ Image-based detection: original orientation is best');
                return 0;
            } else {
                console.log('⚠️ Image-based orientation detection inconclusive, assuming correct orientation');
                return 0; // Low confidence, don't rotate
            }
            
        } catch (error) {
            console.warn('❌ Image-based orientation detection failed:', error.message);
            return 0; // Fall back to no rotation
        }
    }

    /**
     * Calculates orientation score based on visual image analysis
     * Uses multiple image analysis techniques to determine if orientation looks correct
     * @param imageBuffer - PNG image buffer to analyze
     * @param rotation - Current rotation being tested (for logging)
     * @returns Score from 0.0 to 1.0 (higher = better orientation)
     */
    private async calculateImageOrientationScore(imageBuffer: Buffer, rotation: number): Promise<number> {
        try {
            // For now, use a vision model to analyze the image directly
            // This is more accurate than trying to implement custom image analysis
            return await this.analyzeImageWithVisionModel(imageBuffer, rotation);
            
        } catch (error) {
            console.warn(`Image analysis failed for ${rotation}° rotation:`, error.message);
            return 0.0;
        }
    }

    /**
     * Uses vision model to determine if an image appears to be correctly oriented
     * @param imageBuffer - Image buffer to analyze
     * @param rotation - Current rotation being tested
     * @returns Score from 0.0 to 1.0 indicating orientation correctness
     */
    private async analyzeImageWithVisionModel(imageBuffer: Buffer, rotation: number): Promise<number> {
        try {
            // Get a vision-capable model
            const visionModel = AIEngineBase.Instance.Models.find(m => m.ID === '9604B1A4-3A21-F011-8B3D-7C1E5249773E'); // Let's try with OpenAI
            
            if (!visionModel) {
                console.warn('No vision model available for orientation detection');
                return 0.5; // Neutral score if no vision model
            }
            
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
                BaseLLM, visionModel.DriverClass, GetAIAPIKey(visionModel.DriverClass)
            );
            
            const base64Image = imageBuffer.toString('base64');
            
            // Simple, focused prompt for orientation detection
            const orientationPrompt = `Look at this document image and determine if the text appears to be correctly oriented (readable/upright). This is 
            and extremely important part of our preprocessing, and the rest of the process is highly dependent on this being accurate. We need to know
            if the document you are analyzing is in the optimal orientation for processing with OCR and text extraction. We want the tables to be oriented
            properly with the text to be upright and easy to read. The text should NOT be sideways or upside down. It is of the upmost importance that a 
            human could read the text easily without having to turn their head at all. I can not stress enough how important this is.

                Respond with a JSON object containing:
                - "isCorrectlyOriented": true/false - whether text appears upright, with text being read left to right WITHOUT turning your head. 
                - "confidence": number from 0.0 to 1.0 - how confident you are in this assessment
                - "reasoning": brief explanation of what you observe

                Focus on:
                - Text orientation and readability
                - Overall document layout correctness
                - Any tables or structured content alignment

                {
                    "isCorrectlyOriented": true/false,
                    "confidence": 0.0-1.0,
                    "reasoning": "brief explanation"
                }`;

            const messages = [
                {
                    role: 'user' as const,
                    content: [
                        { 
                            type: 'text' as const, 
                            content: orientationPrompt 
                        },
                        {
                            type: 'image_url' as const,
                            content: `data:image/png;base64,${base64Image}`
                        }
                    ]
                }
            ];

            console.log(`🤖 Analyzing ${rotation}° rotation with vision model: ${visionModel.APIName}`);
            
            const response = await llm.ChatCompletion({
                messages,
                model: visionModel.APIName,
            });

            const visionResponse = response.data.choices[0]?.message?.content?.trim() || '';
            
            // Parse the JSON response
            let analysisResult;
            try {
                // Clean response to extract JSON
                let cleanedResponse = visionResponse.trim();
                if (cleanedResponse.startsWith('```json')) {
                    cleanedResponse = cleanedResponse.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
                }
                if (cleanedResponse.startsWith('```')) {
                    cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
                }
                
                analysisResult = JSON.parse(cleanedResponse);
                
                const isCorrect = analysisResult.isCorrectlyOriented === true;
                const confidence = Math.max(0, Math.min(1, parseFloat(analysisResult.confidence) || 0));
                
                console.log(`🔍 ${rotation}° analysis: ${isCorrect ? 'CORRECT' : 'INCORRECT'} (confidence: ${confidence.toFixed(2)}) - ${analysisResult.reasoning}`);
                
                // Return higher score for correctly oriented images
                return isCorrect ? confidence : (1.0 - confidence);
                
            } catch (parseError) {
                console.warn(`Failed to parse vision model orientation response: ${parseError.message}`);
                console.warn(`Raw response: ${visionResponse.substring(0, 200)}`);
                
                // Fallback: simple text analysis of response
                const response_lower = visionResponse.toLowerCase();
                if (response_lower.includes('correctly oriented') || response_lower.includes('upright') || response_lower.includes('readable')) {
                    return 0.7;
                } else if (response_lower.includes('rotated') || response_lower.includes('sideways') || response_lower.includes('upside')) {
                    return 0.3;
                }
                
                return 0.5; // Neutral if can't parse
            }
            
        } catch (error) {
            console.warn(`Vision model orientation analysis failed: ${error.message}`);
            return 0.5; // Neutral score on error
        }
    }

    /**
     * Calculates a comprehensive readability score combining multiple heuristics
     * NOTE: This is now legacy - kept for potential fallback use
     */
    private calculateComprehensiveReadabilityScore(text: string): number {
        const readabilityScore = this.calculateTextReadability(text);
        const lineStructure = this.analyzeLineStructure(text);
        const documentPatterns = this.analyzeDocumentPatterns(text);
        
        // Weight the different components
        let totalScore = readabilityScore * 0.4;
        
        // Line structure scoring
        const structureScore = this.scoreLineStructure(lineStructure);
        totalScore += structureScore * 0.3;
        
        // Document pattern scoring
        const patternScore = this.scoreDocumentPatterns(documentPatterns);
        totalScore += patternScore * 0.3;
        
        return Math.min(totalScore, 1.0);
    }

    /**
     * Scores line structure quality
     */
    private scoreLineStructure(structure: { avgLineLength: number; lineCount: number; emptyLineRatio: number }): number {
        let score = 0;
        
        // Prefer reasonable line lengths (20-120 characters)
        if (structure.avgLineLength >= 20 && structure.avgLineLength <= 120) {
            score += 0.4;
        } else if (structure.avgLineLength >= 10 && structure.avgLineLength <= 200) {
            score += 0.2;
        }
        
        // Prefer documents with reasonable number of lines
        if (structure.lineCount >= 10) {
            score += 0.3;
        } else if (structure.lineCount >= 5) {
            score += 0.1;
        }
        
        // Prefer reasonable empty line ratio (some whitespace, but not too much)
        if (structure.emptyLineRatio >= 0.1 && structure.emptyLineRatio <= 0.5) {
            score += 0.3;
        } else if (structure.emptyLineRatio <= 0.7) {
            score += 0.1;
        }
        
        return score;
    }

    /**
     * Scores document pattern quality
     */
    private scoreDocumentPatterns(patterns: { hasHeaders: boolean; hasNumbers: boolean; hasTablePatterns: boolean }): number {
        let score = 0;
        
        if (patterns.hasHeaders) score += 0.4;
        if (patterns.hasNumbers) score += 0.3;
        if (patterns.hasTablePatterns) score += 0.3;
        
        return score;
    }

    /**
     * Calculates text readability score based on various heuristics
     */
    private calculateTextReadability(text: string): number {
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        
        // Heuristic 1: Reasonable line lengths (not too short, not extremely long)
        const avgLineLength = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;
        const lineLengthScore = this.normalizeScore(avgLineLength, 20, 150); // Optimal range 20-150 chars
        
        // Heuristic 2: Proper word spacing (not too many single characters)
        const words = text.split(/\\s+/).filter(word => word.length > 0);
        const longWords = words.filter(word => word.length > 2).length;
        const wordLengthScore = longWords / Math.max(words.length, 1);
        
        // Heuristic 3: Reasonable character distribution
        const alphanumericRatio = (text.match(/[a-zA-Z0-9]/g) || []).length / text.length;
        
        // Heuristic 4: Common English word patterns
        const commonWords = ['the', 'and', 'to', 'of', 'a', 'in', 'is', 'it', 'for', 'with'];
        const foundCommonWords = commonWords.filter(word => 
            text.toLowerCase().includes(' ' + word + ' ')
        ).length;
        const commonWordScore = foundCommonWords / commonWords.length;
        
        return (lineLengthScore * 0.3 + wordLengthScore * 0.3 + alphanumericRatio * 0.2 + commonWordScore * 0.2);
    }

    /**
     * Analyzes line structure patterns
     */
    private analyzeLineStructure(text: string): { avgLineLength: number; lineCount: number; emptyLineRatio: number } {
        const allLines = text.split('\n');
        const nonEmptyLines = allLines.filter(line => line.trim().length > 0);
        
        return {
            avgLineLength: nonEmptyLines.reduce((sum, line) => sum + line.length, 0) / Math.max(nonEmptyLines.length, 1),
            lineCount: nonEmptyLines.length,
            emptyLineRatio: (allLines.length - nonEmptyLines.length) / allLines.length
        };
    }

    /**
     * Looks for common document patterns that indicate proper orientation
     */
    private analyzeDocumentPatterns(text: string): { hasHeaders: boolean; hasNumbers: boolean; hasTablePatterns: boolean } {
        const lowerText = text.toLowerCase();
        
        // Look for header-like patterns
        const hasHeaders = /^[A-Z][^\\n]*$/m.test(text) || 
                          lowerText.includes('salary') || 
                          lowerText.includes('schedule') ||
                          lowerText.includes('district') ||
                          lowerText.includes('employee');
        
        // Look for numeric patterns (common in salary schedules)
        const hasNumbers = /\\d{1,3}(,\\d{3})*(\\.\\d{2})?/.test(text); // Currency-like patterns
        
        // Look for table-like patterns
        const hasTablePatterns = text.includes('\\t') || // Tab characters
                                 /\\s{2,}\\d+\\s{2,}/.test(text) || // Spaced numbers
                                 /\\|.*\\|/.test(text); // Pipe characters
        
        return { hasHeaders, hasNumbers, hasTablePatterns };
    }

    /**
     * Calculates overall orientation confidence and recommended rotation
     */
    private calculateOrientationScore(
        readabilityScore: number, 
        lineStructure: { avgLineLength: number; lineCount: number; emptyLineRatio: number },
        patterns: { hasHeaders: boolean; hasNumbers: boolean; hasTablePatterns: boolean }
    ): { rotation: number; confidence: number } {
        
        // For now, we'll implement a simple heuristic
        // In a more sophisticated implementation, you could:
        // 1. Try parsing the PDF at different rotations
        // 2. Compare readability scores across rotations
        // 3. Use machine learning models trained on document orientation
        
        let confidence = readabilityScore;
        
        // Boost confidence if we find expected patterns
        if (patterns.hasHeaders) confidence += 0.1;
        if (patterns.hasNumbers) confidence += 0.1;
        if (patterns.hasTablePatterns) confidence += 0.1;
        
        // Adjust based on line structure
        if (lineStructure.avgLineLength > 10 && lineStructure.avgLineLength < 200) {
            confidence += 0.1;
        }
        
        // For this initial implementation, if confidence is high, assume no rotation needed
        // Later, we could enhance this to actually test different rotations
        return {
            rotation: 0, // For now, always assume correct orientation if confident
            confidence: Math.min(confidence, 1.0)
        };
    }

    /**
     * Normalizes a score to 0-1 range based on optimal range
     */
    private normalizeScore(value: number, minOptimal: number, maxOptimal: number): number {
        if (value >= minOptimal && value <= maxOptimal) {
            return 1.0;
        } else if (value < minOptimal) {
            return Math.max(0, value / minOptimal);
        } else {
            return Math.max(0, 1 - ((value - maxOptimal) / maxOptimal));
        }
    }

    /**
     * Corrects PDF orientation by rotating pages
     * @param dataBuffer - Original PDF buffer
     * @param rotationDegrees - Degrees to rotate (90, 180, or 270)
     * @returns Corrected PDF buffer
     */
    private async correctPDFOrientation(dataBuffer: Buffer, rotationDegrees: number): Promise<Buffer> {
        try {
            const pdfDoc = await PDFDocument.load(dataBuffer);
            const pages = pdfDoc.getPages();
            
            console.log(`Rotating ${pages.length} pages by ${rotationDegrees}°`);
            
            pages.forEach(page => {
                page.setRotation(degrees(rotationDegrees));
            });
            
            const correctedPdfBytes = await pdfDoc.save();
            return Buffer.from(correctedPdfBytes);
            
        } catch (error) {
            console.error('Failed to rotate PDF:', error.message);
            throw error;
        }
    }

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
            // Preprocess PDF for orientation correction
            const correctedPdfBuffer = await this.preprocessPDFOrientation(dataBuffer);
            
            // Get raw text using standard pdf-parse
            const dataPDF = await pdfParse(correctedPdfBuffer);
            const rawText = dataPDF.text;

            return {
                rawText,
                tables: [], // No longer using table detection - vision model handles structure
                hasTabularData: assumeTabularContent,
                contentType: assumeTabularContent ? 'tabular' : 'text',
                pdfBuffer: correctedPdfBuffer // Include corrected PDF buffer for vision model processing
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
     * Convert PDF to high-resolution, high-contrast PNG images optimized for OCR and vision model processing
     * 
     * OCR OPTIMIZATIONS APPLIED:
     * - PNG format (lossless compression preserves text clarity)
     * - 300 DPI resolution for crisp text
     * - Grayscale conversion (removes color distractions) 
     * - High contrast enhancement (2.0x contrast boost)
     * - Threshold conversion to pure black/white text
     * - Noise removal and edge sharpening
     * - Histogram normalization for consistent brightness
     * 
     * @param pdfBuffer The PDF file as a buffer
     * @returns Array of base64-encoded PNG images (one per page)
     */
    public async convertPDFToImages(pdfBuffer: Buffer): Promise<string[]> {
        console.log(`🖼️ Converting PDF to high-quality grayscale PNG images using ImageMagick...`);
        
        // First, get the total number of pages using pdf-parse
        const pdfInfo = await pdfParse(pdfBuffer);
        const totalPages = pdfInfo.numpages;
        console.log(`📄 PDF has ${totalPages} pages - applying simplified ImageMagick processing`);
        
        return new Promise((resolve, reject) => {
            console.log('🔧 Setting up ImageMagick conversion...');
            console.log(`   📐 Density: 300 DPI for high resolution`);
            console.log(`   🎨 Format: Grayscale PNG with gentle contrast enhancement`);
            
            // Create a temporary file for the PDF since ImageMagick needs file input
            const tempDir = os.tmpdir();
            const tempPdfPath = path.join(tempDir, `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.pdf`);
            
            console.log(`📁 Creating temporary PDF file: ${tempPdfPath}`);
            
            // Write PDF buffer to temporary file
            fs.writeFile(tempPdfPath, pdfBuffer, async (writeErr) => {
                if (writeErr) {
                    console.error('❌ Failed to write temporary PDF:', writeErr.message);
                    return this.convertPDFToImagesWithPdf2pic(pdfBuffer).then(resolve).catch(reject);
                }
                
                console.log('✅ Temporary PDF file created, starting ImageMagick conversion...');
                
                // SIMPLIFIED ImageMagick arguments - just high-quality grayscale with good contrast
                const magickArgs = [
                    '-density', '300',               // 300 DPI for high resolution
                    tempPdfPath,                     // Input PDF file
                    '-colorspace', 'Gray',           // Convert to grayscale
                    '-contrast-stretch', '0.2%x0.2%', // Contrast enhancement
                    '-quality', '100',               // Maximum PNG quality
                    'png:-'                          // Output PNG to stdout
                ];
                
                console.log(`⚙️  ImageMagick command: magick ${magickArgs.join(' ')}`);
                
                // Use Node.js child_process to call ImageMagick directly
                const magickProcess = spawn('magick', magickArgs, {
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                
                let outputBuffer = Buffer.alloc(0);
                let errorOutput = '';
                
                magickProcess.stdout.on('data', (data) => {
                    outputBuffer = Buffer.concat([outputBuffer, data]);
                });
                
                magickProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                });
                
                magickProcess.on('close', async (code) => {
                    // Clean up temporary file
                    try {
                        await fs.promises.unlink(tempPdfPath);
                        console.log('🧹 Temporary PDF file cleaned up');
                    } catch (cleanupErr) {
                        console.warn('⚠️ Failed to cleanup temporary PDF:', cleanupErr.message);
                    }
                    
                    if (code !== 0) {
                        console.error('❌ ImageMagick process failed with code:', code);
                        console.error('🔍 stderr:', errorOutput);
                        
                        // Fallback to pdf2pic
                        console.log('🔄 Falling back to pdf2pic conversion...');
                        return this.convertPDFToImagesWithPdf2pic(pdfBuffer).then(resolve).catch(reject);
                    }
                    
                    try {
                        console.log('✅ ImageMagick conversion completed successfully');
                        console.log(`📊 Output buffer size: ${outputBuffer.length} bytes`);
                        
                        if (outputBuffer.length === 0) {
                            throw new Error('ImageMagick returned empty output');
                        }
                        
                        // Convert buffer to base64
                        const base64String = outputBuffer.toString('base64');
                        console.log(`📄 Converted to base64 (${base64String.length} chars)`);
                        
                        // Save debug image
                        await this.saveDebugImage(outputBuffer, 1);
                        
                        console.log(`🎉 Successfully converted 1 page to high-quality grayscale PNG`);
                        resolve([base64String]);
                        
                    } catch (processingError) {
                        console.error('❌ Post-processing failed:', processingError.message);
                        
                        // Fallback to pdf2pic
                        console.log('🔄 Falling back to pdf2pic conversion...');
                        this.convertPDFToImagesWithPdf2pic(pdfBuffer).then(resolve).catch(reject);
                    }
                });
                
                magickProcess.on('error', (processError) => {
                    console.error('❌ Failed to spawn ImageMagick process:', processError.message);
                    
                    // Clean up temporary file
                    fs.unlink(tempPdfPath, () => {});
                    
                    // Fallback to pdf2pic
                    console.log('🔄 Falling back to pdf2pic conversion...');
                    this.convertPDFToImagesWithPdf2pic(pdfBuffer).then(resolve).catch(reject);
                });
            });
        });
    }

    /**
     * Fallback PDF to image conversion using pdf2pic (legacy method)
     */
    private async convertPDFToImagesWithPdf2pic(pdfBuffer: Buffer): Promise<string[]> {
        console.log('🔄 Using pdf2pic fallback conversion...');
        
        const pdfInfo = await pdfParse(pdfBuffer);
        const totalPages = pdfInfo.numpages;
        
        const convert = pdf2pic.fromBuffer(pdfBuffer, {
            density: 300,
            format: "png",
            width: 2400,
            height: 3200
        });
        
        const images: string[] = [];
        
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            try {
                const result = await convert(pageNum, { responseType: 'buffer' });
                
                if (result && 'buffer' in result && result.buffer && 
                    Buffer.isBuffer(result.buffer) && result.buffer.length > 0) {
                    
                    const base64String = result.buffer.toString('base64');
                    images.push(base64String);
                    
                    // Save debug image
                    await this.saveDebugImage(result.buffer, pageNum);
                }
            } catch (pageError) {
                console.warn(`❌ pdf2pic failed for page ${pageNum}:`, pageError.message);
            }
        }
        
        return images;
    }

    /**
     * Save debug images to disk for inspection
     */
    private async saveDebugImage(imageBuffer: Buffer, pageNum: number): Promise<void> {
        const rotationSuffix = this.currentOrientationTest !== undefined ? `_${this.currentOrientationTest}deg` : '';
        const processingType = this.currentOrientationTest === 'final' ? '_FINAL' : rotationSuffix;
        
        try {
            const debugImagePath = `/tmp/pdf_debug_page_${pageNum}${processingType}.png`;
            await fs.promises.writeFile(debugImagePath, imageBuffer);
            console.log(`🔍 Grayscale PNG debug image saved to: ${debugImagePath}`);
        } catch (debugError) {
            // Try Windows temp path if /tmp doesn't exist
            try {
                const windowsDebugPath = `C:\\temp\\pdf_debug_page_${pageNum}${processingType}.png`;
                await fs.promises.writeFile(windowsDebugPath, imageBuffer);
                console.log(`🔍 B&W PNG debug image saved to: ${windowsDebugPath}`);
            } catch (windowsError) {
                // Finally try current directory
                try {
                    const localDebugPath = `./pdf_debug_page_${pageNum}${processingType}.png`;
                    await fs.promises.writeFile(localDebugPath, imageBuffer);
                    console.log(`🔍 B&W PNG debug image saved to: ${localDebugPath}`);
                } catch (localError) {
                    console.warn(`⚠️ Could not save debug image: ${localError.message}`);
                }
            }
        }
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
     * Process content using vision model with pre-generated base64 images
     * This method is optimized for the new workflow where images are generated during PDF parsing
     * and stored as base64 strings in ContentItem.Text field
     */
    public async processWithVisionModelFromBase64(
        base64Images: string[],
        params: ContentItemProcessParams,
        contextUser: UserInfo
    ): Promise<JsonObject> {
        try {
            console.log(`Starting vision model processing with ${base64Images.length} base64 images...`);
            
            // Get AI model and create LLM instance (same as regular processing)
            const model = AIEngine.Instance.Models.find(m => m.ID === params.modelID);
            if (!model) {
                throw new Error(`AI Model with ID ${params.modelID} not found`);
            }
            
            const llm = MJGlobal.Instance.ClassFactory.CreateInstance<BaseLLM>(
                BaseLLM, model.DriverClass, GetAIAPIKey(model.DriverClass)
            );

            // Use existing prompt system (same as text processing)
            const { systemPrompt, userPrompt } = await this.getLLMPrompts(params, '', {}, contextUser);
            
            console.log('\n=== VISION MODEL (BASE64) DEBUGGING ===');
            console.log('📝 System Prompt:');
            console.log(systemPrompt.substring(0, 500) + '...');
            console.log('\n📝 User Prompt:');
            console.log(userPrompt.substring(0, 500) + '...');
            console.log('\n🖼️ Base64 images being processed:', base64Images.length);
            console.log('📏 Base64 image sizes:', base64Images.map((img, i) => `Page ${i+1}: ${img.length} chars`));
            
            // Create multimodal messages with base64 images
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
                        ...base64Images.map(imageData => ({
                            type: 'image_url' as const,
                            content: imageData
                        }))
                    ]
                }
            ];

            console.log(`\n🤖 Sending ${base64Images.length} base64 images to vision model: ${model.APIName}`);
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
            
            // Parse the vision model response (same logic as processWithVisionModel)
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
                visionResults.processedFromBase64 = true; // Flag to indicate this was processed from stored base64
                visionResults.totalPages = base64Images.length;
                visionResults.contentItemID = params.contentItemID;
                
                console.log(`✅ Vision processing successful - processed data from ${base64Images.length} base64 images`);
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
                        visionResults.processedFromBase64 = true;
                        visionResults.totalPages = base64Images.length;
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
            console.error('Vision model processing (base64) failed:', error.message);
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