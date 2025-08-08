import { RegisterClass } from "@memberjunction/global";
import fs from 'fs';
import { AutotagBase } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { UserInfo, Metadata, RunView } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity, ContentTypeEntity } from "@memberjunction/core-entities";
import { StructuredPDFContent, ContentItemProcessParamsExtended } from "../../Engine/generic/process.types";
import { OpenAI } from "openai";
import path from 'path';
import dotenv from 'dotenv';
dotenv.config()

@RegisterClass(AutotagBase, 'AutotagLocalFileSystem')
export class AutotagLocalFileSystem extends AutotagBase {
    private contextUser: UserInfo;
    private engine: AutotagBaseEngine;
    protected contentSourceTypeID: string
    static _openAI: OpenAI;
    private structuredDataMap: Map<string, StructuredPDFContent> = new Map();
    private pendingStructuredData: Map<string, StructuredPDFContent> = new Map(); // URL -> StructuredData

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
    }

    public getContextUser(): UserInfo | null {
        return this.contextUser;
    }

    /**
     * Implemented abstract method from the AutotagBase class. that runs the entire autotagging process. This method is the entry point for the autotagging process.
     * It initializes the connection, retrieves the content sources corresponding to the content source type, sets the content items that we want to process, 
     * extracts and processes the text, and sets the results in the database.
     */
    public async Autotag(contextUser: UserInfo): Promise<void> {
        this.contextUser = contextUser;
        this.structuredDataMap.clear(); // Reset for new run
        this.pendingStructuredData.clear(); // Reset pending data
        
        this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Local File System', this.contextUser);
        const contentSources: ContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
        const contentItemsToProcess: ContentItemEntity[] = await this.SetContentItemsToProcess(contentSources);
        
        // After ContentItems are created with IDs, map the structured data
        this.mapPendingStructuredDataToContentItems(contentItemsToProcess);
        
        // Use enhanced processing if we have structured data
        if (this.structuredDataMap.size > 0) {
            console.log(`Using enhanced processing for ${this.structuredDataMap.size} items with structured table data`);
            await this.engine.ExtractTextAndProcessWithLLMEnhanced(contentItemsToProcess, this.contextUser, this.structuredDataMap);
        } else {
            console.log('No structured table data found, using regular text processing');
            await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
        }
    }

    /**
    * Implemented abstract method from the AutotagBase class. Given a list of content sources, this method should return a list 
    * of content source items that have been modified or added after the most recent process run for that content source.
    * @param contentSources - An array of content sources to check for modified or added content source items
    * @returns - An array of content source items that have been modified or added after the most recent process run for that content source
    */
    public async SetContentItemsToProcess(contentSources: ContentSourceEntity[]): Promise<ContentItemEntity[]> {
        const contentItemsToProcess: ContentItemEntity[] = []

        for (const contentSource of contentSources) {
            // First check that the directory exists
            if (fs.existsSync(contentSource.URL)) {
                const contentSourceParams = await this.setContentSourceParams(contentSource);
                const lastRunDate: Date = await this.engine.getContentSourceLastRunDate(contentSourceParams.contentSourceID, this.contextUser)

                // Traverse through all the files in the directory
                if (lastRunDate) {
                const contentItems = await this.SetNewAndModifiedContentItems(contentSourceParams, lastRunDate, this.contextUser);
                    if (contentItems && contentItems.length > 0) {
                        contentItemsToProcess.push(...contentItems);
                    }
                    else {
                        // No content items found to process
                        console.log(`No content items found to process for content source: ${contentSource.Get('Name')}`);
                    }
                } 
                else {
                throw new Error('Invalid last run date');
                }
            } else {
                console.log(`Invalid Content Source ${contentSource.Name}`);
            }
        }

        return contentItemsToProcess;
    }

    public async setContentSourceParams(contentSource: ContentSourceEntity) { 
        // If content source parameters were provided, set them. Otherwise, use the default values.
        const contentSourceParamsMap = await this.engine.getContentSourceParams(contentSource, this.contextUser);
        if (contentSourceParamsMap) {
            // Override defaults with content source specific params
            contentSourceParamsMap.forEach((value, key) => {
                if (key in this) {
                    (this as any)[key] = value;
                }
            })
        }

        const contentSourceParams: ContentSourceParams = {
            contentSourceID: contentSource.ID,
            name: contentSource.Name,
            ContentTypeID: contentSource.ContentTypeID,
            ContentSourceTypeID: contentSource.ContentSourceTypeID,
            ContentFileTypeID: contentSource.ContentFileTypeID,
            URL: contentSource.URL
        }

        return contentSourceParams;
    }

    /**
     * Given a content source and last run date, recursively traverse through the directory and return a 
     * list of content source items that have been modified or added after the last run date.
     * @param contentSource 
     * @param lastRunDate 
     * @param contextUser 
     * @returns 
     */
    public async SetNewAndModifiedContentItems(contentSourceParams: ContentSourceParams, lastRunDate: Date, contextUser: UserInfo): Promise<ContentItemEntity[]> {
        const contentItems: ContentItemEntity[] = []
        let contentSourcePath = contentSourceParams.URL
        const filesAndDirs = fs.readdirSync(contentSourcePath)

        for (const file of filesAndDirs) {
            const filePath = path.join(contentSourcePath, file)
            const stats = fs.statSync(filePath)
            if (stats.isDirectory()) {
                contentSourceParams.URL = filePath
                await this.SetNewAndModifiedContentItems(contentSourceParams, lastRunDate, contextUser)
            }

            else if (stats.isFile()) {
                const modifiedDate = new Date(stats.mtime.toUTCString())
                const changedDate = new Date(stats.ctime.toUTCString())
                if (changedDate > lastRunDate) {
                    // The file has been added, create a new record for this file
                    const contentItem = await this.setAddedContentItem(filePath, contentSourceParams);
                    contentItems.push(contentItem); // Content item was added, add to list
                }
                else if (modifiedDate > lastRunDate) {
                    // The file's contents has been, update the record for this file 
                    const contentItem = await this.setModifiedContentItem(filePath, contentSourceParams);
                    contentItems.push(contentItem);
                }
            }
        }
        return contentItems;
    }

    public async setAddedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<ContentItemEntity> { 
        const md = new Metadata();
        
        // Check if this content type should use structured parsing
        const shouldPreserveStructure = await this.shouldUseStructuredParsing(contentSourceParams.ContentTypeID);
        console.log(`Content type ${contentSourceParams.ContentTypeID} should use structured parsing: ${shouldPreserveStructure}`);
        
        let text: string;
        let structuredData: StructuredPDFContent | null = null;
        
        let pdfBuffer: Buffer | null = null;
        
        if (shouldPreserveStructure && filePath.toLowerCase().endsWith('.pdf')) {
            console.log(`Using structured parsing for PDF: ${filePath}`);
            
            // Read PDF buffer for potential vision processing
            pdfBuffer = await fs.promises.readFile(filePath);
            
            const parsedContent = await this.engine.parseFileFromPathWithStructure(filePath, shouldPreserveStructure);
            if (typeof parsedContent === 'string') {
                text = parsedContent;
                console.log(`Structured parsing returned text only for: ${filePath}`);
            } else {
                structuredData = parsedContent;
                text = structuredData.rawText; // Store raw text in the database
                console.log(`Extracted ${structuredData.tables.length} tables from PDF: ${filePath}`);
                console.log(`Content type detected as: ${structuredData.contentType}`);
            }
        } else {
            console.log(`Using regular text parsing for: ${filePath} (shouldPreserveStructure: ${shouldPreserveStructure})`);
            text = await this.engine.parseFileFromPath(filePath);
        }
        
        const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', this.contextUser);
        contentItem.NewRecord();
        contentItem.ContentSourceID = contentSourceParams.contentSourceID
        contentItem.Name = contentSourceParams.name
        contentItem.Description = await this.engine.getContentItemDescription(contentSourceParams, this.contextUser)
        contentItem.ContentTypeID = contentSourceParams.ContentTypeID
        contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID
        contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID
        contentItem.Checksum = await this.engine.getChecksumFromText(text)
        contentItem.URL = filePath
        contentItem.Text = text

        if(await contentItem.Save()){
            // Store structured data temporarily by file path (which is now the ContentItem URL)
            if (structuredData && structuredData.hasTabularData) {
                console.log(`Storing structured data for file path: ${filePath} with ${structuredData.tables.length} tables`);
                // Add PDF buffer to structured data for vision processing
                structuredData.pdfBuffer = pdfBuffer;
                this.pendingStructuredData.set(filePath, structuredData);
            }
            return contentItem;
        }
        else {
            throw new Error('Failed to save content item');
        }
    }

    /**
     * Determine if a content type should use structured parsing based on its name or attributes
     * @param contentTypeID The content type ID to check
     * @returns True if structured parsing should be used
     */
    private async shouldUseStructuredParsing(contentTypeID: string): Promise<boolean> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<ContentTypeEntity>({
                EntityName: 'Content Types',
                ExtraFilter: `ID='${contentTypeID}'`,
                ResultType: 'entity_object'
            }, this.contextUser);

            if (result.Success && result.Results.length > 0) {
                const contentType = result.Results[0];
                const contentTypeName = contentType.Name?.toLowerCase() || '';
                console.log(`Checking content type name: "${contentType.Name}" (lowercase: "${contentTypeName}")`);
                
                // Keywords that indicate tabular/structured content
                const structuredKeywords = [
                    'salary schedule', 'salary', 'schedule', 'pay scale', 'pay grade',
                    'table', 'tabular', 'spreadsheet', 'financial', 'budget',
                    'pricing', 'rate sheet', 'compensation'
                ];
                
                const matchedKeywords = structuredKeywords.filter(keyword => contentTypeName.includes(keyword));
                console.log(`Matched keywords: ${matchedKeywords.join(', ')}`);
                
                // For now, assume these content types always have tabular data
                const alwaysTabularTypes = ['msta salary schedule'];
                const isAlwaysTabular = alwaysTabularTypes.some(type => contentTypeName.includes(type));
                
                if (isAlwaysTabular) {
                    console.log(`ContentType "${contentType.Name}" is configured to always use tabular processing`);
                    return true;
                }
                
                return matchedKeywords.length > 0;
            }
        } catch (error) {
            console.warn('Error checking content type for structured parsing:', error.message);
        }
        
        return false;
    }

    /**
     * Maps pending structured data (stored by URL) to ContentItem IDs after they're saved
     * @param contentItems The saved ContentItem entities with their database IDs
     */
    private mapPendingStructuredDataToContentItems(contentItems: ContentItemEntity[]): void {
        console.log(`\n=== MAPPING STRUCTURED DATA ===`);
        console.log(`Pending structured data keys: [${Array.from(this.pendingStructuredData.keys()).join(', ')}]`);
        console.log(`ContentItem URLs: [${contentItems.map(ci => ci.URL).join(', ')}]`);
        
        for (const contentItem of contentItems) {
            const structuredData = this.pendingStructuredData.get(contentItem.URL);
            if (structuredData) {
                console.log(`✅ Mapping structured data from URL ${contentItem.URL} to ContentItem ID ${contentItem.ID}`);
                this.structuredDataMap.set(contentItem.ID, structuredData);
            } else {
                console.log(`❌ No structured data found for URL: ${contentItem.URL}`);
            }
        }
        
        console.log(`Final structured data map size: ${this.structuredDataMap.size} items`);
        if (this.structuredDataMap.size > 0) {
            console.log(`ContentItem IDs with structured data: ${Array.from(this.structuredDataMap.keys()).join(', ')}`);
        }
        console.log(`=== END MAPPING ===\n`);
    }

    public async setModifiedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<ContentItemEntity> {
        const md = new Metadata();
        const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', this.contextUser);
        const contentItemID: string = await this.engine.getContentItemIDFromURL(contentSourceParams, this.contextUser);
        await contentItem.Load(contentItemID);
        
        // Check if this content type should use structured parsing
        const shouldPreserveStructure = await this.shouldUseStructuredParsing(contentSourceParams.ContentTypeID);
        
        let text: string;
        let structuredData: StructuredPDFContent | null = null;
        let pdfBuffer: Buffer | null = null;
        
        if (shouldPreserveStructure && filePath.toLowerCase().endsWith('.pdf')) {
            console.log(`Using structured parsing for updated PDF: ${filePath}`);
            
            // Read PDF buffer for potential vision processing
            pdfBuffer = await fs.promises.readFile(filePath);
            
            const parsedContent = await this.engine.parseFileFromPathWithStructure(filePath, shouldPreserveStructure);
            if (typeof parsedContent === 'string') {
                text = parsedContent;
                console.log(`Structured parsing returned text only for updated: ${filePath}`);
            } else {
                structuredData = parsedContent;
                text = structuredData.rawText; // Store raw text in the database
                console.log(`Extracted ${structuredData.tables.length} tables from updated PDF: ${filePath}`);
                console.log(`Content type detected as: ${structuredData.contentType}`);
            }
        } else {
            console.log(`Using regular text parsing for updated: ${filePath} (shouldPreserveStructure: ${shouldPreserveStructure})`);
            text = await this.engine.parseFileFromPath(filePath);
        }
        
        contentItem.Text = text;
        contentItem.Checksum = await this.engine.getChecksumFromText(text);

        if(await contentItem.Save()){
            // Store structured data temporarily by file path (which is now the ContentItem URL)
            if (structuredData && structuredData.hasTabularData) {
                console.log(`Storing structured data for file path: ${filePath} with ${structuredData.tables.length} tables`);
                // Add PDF buffer to structured data for vision processing
                structuredData.pdfBuffer = pdfBuffer;
                this.pendingStructuredData.set(filePath, structuredData);
            }
            return contentItem;
        }
        else {
            throw new Error('Failed to save content item');
        }
    }
}