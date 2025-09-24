import { UserInfo } from '@memberjunction/core';
import { ContentSourceEntity, ContentItemEntity } from '@memberjunction/core-entities';
import { ContentSourceParams, ContentSourceTypeParams } from './content.types';
import { ProcessRunParams, JsonObject, ContentItemProcessParams, StructuredPDFContent, ContentItemProcessParamsExtended } from './process.types';
import { BaseLLM } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
export declare class AutotagBaseEngine extends AIEngine {
    constructor();
    static get Instance(): AutotagBaseEngine;
    /**
     * Given a list of content items, extract the text from each content item with the LLM and send off the required parameters to the LLM for tagging.
     * @param contentItems
     * @returns
     */
    ExtractTextAndProcessWithLLM(contentItems: ContentItemEntity[], contextUser: UserInfo): Promise<void>;
    /**
     * Enhanced version that can handle structured content for tabular data like salary schedules
     * @param contentItems
     * @param contextUser
     * @param structuredDataMap Optional map of contentItemID -> StructuredPDFContent for items that have structured data
     */
    ExtractTextAndProcessWithLLMEnhanced(contentItems: ContentItemEntity[], contextUser: UserInfo, structuredDataMap?: Map<string, StructuredPDFContent>): Promise<void>;
    /**
     * Given processing parameters that include the text from our content item, process the text with the LLM and extract the
     * information related to that content type.
     * @param params
     * @returns
     */
    ProcessContentItemText(params: ContentItemProcessParams, contextUser: UserInfo): Promise<void>;
    /**
     * Enhanced content processing that handles vision model processing for tabular PDFs
     * @param params Enhanced processing parameters that may include structured data
     * @param contextUser User context
     */
    ProcessContentItemTextEnhanced(params: ContentItemProcessParamsExtended, contextUser: UserInfo): Promise<void>;
    promptAndRetrieveResultsFromLLM(params: ContentItemProcessParams, contextUser: UserInfo): Promise<JsonObject>;
    processChunkWithLLM(llm: BaseLLM, systemPrompt: string, userPrompt: string, LLMResults: JsonObject, modelAPIName: string): Promise<JsonObject>;
    getLLMPrompts(params: ContentItemProcessParams, chunk: string, LLMResults: JsonObject, contextUser: UserInfo): Promise<{
        systemPrompt: string;
        userPrompt: string;
    }>;
    saveLLMResults(LLMResults: JsonObject, contextUser: UserInfo): Promise<void>;
    deleteInvalidContentItem(contentItemID: string, contextUser: UserInfo): Promise<void>;
    chunkExtractedText(text: string, tokenLimit: number): string[];
    /**
     * Given the processing results from the LLM and the Content Element Item that was saved to the database, this function saves the tags as Content Element Tags in the database.
     * @param md: The metadata object to save the tags
     * @param contentElementItem: The content element item that was saved to the database
     * @param results: The results of the processing from the LLM
     * @param contextUser: The user context to save the tags
     * @returns
     */
    saveContentItemTags(contentItemID: string, LLMResults: JsonObject, contextUser: UserInfo): Promise<void>;
    /**
     * Helper method to get existing tags for a ContentItem
     * @param contentItemID - The ContentItem ID
     * @param contextUser - User context
     * @returns Array of existing ContentItemTag entities
     */
    private getExistingContentItemTags;
    saveResultsToContentItemAttribute(LLMResults: JsonObject, contextUser: UserInfo): Promise<void>;
    /**
     * Helper method to check if a ContentItemAttribute already exists
     * @param contentItemID - The ContentItem ID
     * @param attributeName - The attribute name
     * @param contextUser - User context
     * @returns Existing ContentItemAttribute or null if not found
     */
    private getExistingContentItemAttribute;
    /***
    * Retrieves all of the content sources of a given content source type data from the database.
    * @param contextUser: The user context to retrieve the content source data
    * @returns A list of content sources
    */
    getAllContentSources(contextUser: UserInfo, contentSourceTypeID: string): Promise<ContentSourceEntity[]>;
    setSubclassContentSourceType(subclass: string, contextUser: UserInfo): Promise<string>;
    getContentSourceParams(contentSource: ContentSourceEntity, contextUser: UserInfo): Promise<any>;
    getDefaultContentSourceTypeParams(contentSourceTypeParamID: string, contextUser: UserInfo): Promise<ContentSourceTypeParams>;
    castValueAsCorrectType(value: string, type: string): any;
    stringToBoolean(string: string): boolean;
    parseStringArray(value: string): string[];
    /**
     * Given a run date, this function converts the run date to the user's timezone and formats it as a date object.
     * @param lastRunDate: The retrieved last run date from the database
     * @returns The last run date converted to the user's timezone
     */
    convertLastRunDateToTimezone(lastRunDate: Date): Promise<Date>;
    /**
     * Retrieves the last run date of the provided content source from the database. If no previous runs exist, the epoch date is returned.
     * @param contentSourceID: The ID of the content source to retrieve the last run date
     * @param contextUser: The user context to retrieve the last run date
     * @returns
     */
    getContentSourceLastRunDate(contentSourceID: string, contextUser: UserInfo): Promise<Date>;
    getContentItemParams(contentTypeID: string, contextUser: UserInfo): Promise<{
        modelID: string;
        minTags: number;
        maxTags: number;
    }>;
    /**
     * Given a content source type ID, this function retrieves the content source type name from the database.
     * @param contentSourceTypeID
     * @param contextUser
     * @returns
     */
    getContentSourceTypeName(contentSourceTypeID: string, contextUser: UserInfo): Promise<string>;
    /**
     * Given a content type ID, this function retrieves the content type name from the database.
     * @param contentTypeID
     * @param contextUser
     * @returns
     */
    getContentTypeName(contentTypeID: string, contextUser: UserInfo): Promise<string>;
    /**
     * Given a content file type ID, this function retrieves the content file type name from the database.
     * @param contentFileTypeID
     * @param contextUser
     * @returns
     */
    getContentFileTypeName(contentFileTypeID: string, contextUser: UserInfo): Promise<string>;
    getAdditionalContentTypePrompt(contentTypeID: string, contextUser: UserInfo): Promise<string>;
    /**
    * Given the content source parameters, this function creates a description of the content source item.
    * @param contentSourceParams: The parameters of the content source item
    * @returns The description of the content source item
    */
    getContentItemDescription(contentSourceParams: ContentSourceParams, contextUser: any): Promise<string>;
    getChecksumFromURL(url: string): Promise<string>;
    getChecksumFromText(text: string): Promise<string>;
    getContentItemIDFromURL(contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<string>;
    /**
     * Given the results of the processing from the LLM, this function saves the details of the process run in the database.
     * @param processRunParams: The parameters holding the details of the process run
     * @param contextUser: The user context to save the process run
     * @returns
     */
    saveProcessRun(processRunParams: ProcessRunParams, contextUser: UserInfo): Promise<void>;
    /**
     * Parse content from a ContentItem entity with full context and parameter support
     * @param contentItem - The ContentItem entity containing metadata and file path
     * @param contextUser - User context for database operations
     * @returns Parsed text from the content item
     */
    parseContentItem(contentItem: ContentItemEntity, contextUser: UserInfo): Promise<string>;
    /**
     * Parse Excel files with intelligent sheet selection based on content source parameters
     * @param dataBuffer - Excel file buffer
     * @param sourceParams - Content source parameters
     * @returns Parsed text from selected sheet
     */
    private parseXLSXWithContext;
    /**
     * Use LLM to select the most relevant sheet from a multi-sheet Excel file
     * @param workbook - Parsed Excel workbook
     * @param customPrompt - Custom prompt for sheet selection
     * @returns Name of selected sheet
     */
    private selectSheetWithLLM;
    /**
     * Get ContentSource entity by ID
     */
    private getContentSourceEntity;
    /**
     * Get ContentFileType entity by ID
     */
    private getContentFileTypeEntity;
    /**
    * Given a buffer of data, this function extracts text from a PDF file
    * @param dataBuffer: The buffer of data to extract text from
    * @returns The extracted text from the PDF file
    */
    parsePDF(dataBuffer: Buffer): Promise<string>;
    /**
     * Enhanced PDF parsing that can include PDF buffer for vision model processing
     * @param dataBuffer: The buffer of data to extract structured content from
     * @param assumeTabularContent: If true, assumes content has tables (for vision model processing)
     * @returns StructuredPDFContent with raw text and PDF buffer for vision processing
     */
    parsePDFWithStructure(dataBuffer: Buffer, assumeTabularContent?: boolean): Promise<StructuredPDFContent>;
    /**
     * Convert PDF to high-resolution images for vision model processing
     * @param pdfBuffer The PDF file as a buffer
     * @returns Array of base64-encoded images (one per page)
     */
    convertPDFToImages(pdfBuffer: Buffer): Promise<string[]>;
    /**
     * Process PDF using vision model with existing MJ prompt system
     * @param pdfBuffer The PDF file buffer
     * @param params Processing parameters that include prompts from database
     * @param contextUser User context
     * @returns Vision processing results as JSON
     */
    processWithVisionModel(pdfBuffer: Buffer, params: ContentItemProcessParams, contextUser: UserInfo): Promise<JsonObject>;
    /**
    * Given a buffer of data, this function extracts text from a DOCX file
    * @param dataBuffer: The buffer of data to extract text from
    * @returns The extracted text from the DOCX file
    */
    parseDOCX(dataBuffer: Buffer): Promise<string>;
    /**
     * Parse Excel file (basic method - use parseContentItem for full functionality)
     * @param dataBuffer - Excel file buffer
     * @returns Parsed text from first sheet
     */
    parseXLSX(dataBuffer: Buffer): Promise<string>;
    parseHTML(data: string): Promise<string>;
}
//# sourceMappingURL=AutotagBaseEngine.d.ts.map