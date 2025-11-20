import { RegisterClass } from "@memberjunction/global";
import fs from 'fs';
import { AutotagBase } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { UserInfo, Metadata, RunView } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity, ContentFileTypeEntity } from "@memberjunction/core-entities";
import { ContentDiscoveryResult } from "../../Engine/generic/process.types";
import path from 'path';
import dotenv from 'dotenv';
dotenv.config()

@RegisterClass(AutotagBase, 'AutotagLocalFileSystem')
export class AutotagLocalFileSystem extends AutotagBase {
    private contextUser: UserInfo;
    protected contentSourceTypeID: string

    constructor() {
        super();
        // engine is inherited from AutotagBase
    }

    public getContextUser(): UserInfo | null {
        return this.contextUser;
    }

    /**
     * Discovery phase: Scan directories and identify files that need processing
     * @param contentSources - Array of local file system content sources
     * @param contextUser - User context
     * @returns Array of discovery results for files that need processing
     */
    public async DiscoverContentToProcess(
        contentSources: ContentSourceEntity[], 
        contextUser: UserInfo
    ): Promise<ContentDiscoveryResult[]> {
        const discoveries: ContentDiscoveryResult[] = [];
        this.contextUser = contextUser;

        for (const contentSource of contentSources) {
            try {
                if (!fs.existsSync(contentSource.URL)) {
                    console.log(`Directory does not exist: ${contentSource.URL}`);
                    continue;
                }

                const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSource.ID, contextUser);
                const files = await this.scanDirectoryRecursive(contentSource.URL);

                for (const filePath of files) {
                    try {
                        if (!this.isSupportedFileType(filePath)) {
                            continue;
                        }

                        const stat = await fs.promises.stat(filePath);
                        
                        // Determine if this is a new file or modified file
                        const existingContentItemId = await this.getExistingContentItemId(filePath, contentSource.ID, contextUser);
                        
                        if (!existingContentItemId && stat.birthtime > lastRunDate) {
                            // New file
                            discoveries.push({
                                identifier: filePath,
                                contentSourceId: contentSource.ID,
                                lastModified: stat.mtime,
                                action: 'create',
                                sourceType: 'LocalFileSystem',
                                metadata: {
                                    url: filePath,
                                    size: stat.size,
                                    extension: path.extname(filePath).toLowerCase()
                                }
                            });
                        } else if (existingContentItemId && stat.mtime > lastRunDate) {
                            // Modified file
                            discoveries.push({
                                identifier: filePath,
                                contentSourceId: contentSource.ID,
                                lastModified: stat.mtime,
                                action: 'update',
                                sourceType: 'LocalFileSystem',
                                metadata: {
                                    url: filePath,
                                    existingContentItemId,
                                    size: stat.size,
                                    extension: path.extname(filePath).toLowerCase()
                                }
                            });
                        }
                    } catch (fileError) {
                        console.warn(`Error processing file ${filePath}:`, fileError.message);
                        continue;
                    }
                }
            } catch (sourceError) {
                console.error(`Error processing content source ${contentSource.Name}:`, sourceError.message);
                continue;
            }
        }

        console.log(`Discovered ${discoveries.length} items to process`);
        return discoveries;
    }

    /**
     * Creation phase: Create or update a single ContentItem with parsed text
     * @param discoveryItem - Discovery result identifying the file to process
     * @param contextUser - User context
     * @returns Created or updated ContentItem
     */
    public async SetSingleContentItem(
        discoveryItem: ContentDiscoveryResult, 
        contextUser: UserInfo
    ): Promise<ContentItemEntity> {
        const filePath = discoveryItem.identifier;
        const md = new Metadata();

        try {
            let contentItem: ContentItemEntity;

            if (discoveryItem.action === 'update' && discoveryItem.metadata?.existingContentItemId) {
                // Update existing ContentItem
                contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', contextUser);
                await contentItem.Load(discoveryItem.metadata.existingContentItemId);
            } else {
                // Create new ContentItem
                contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', contextUser);
                contentItem.NewRecord();
                contentItem.ContentSourceID = discoveryItem.contentSourceId;
                
                // Get content source info for other required fields
                const contentSource = await this.getContentSource(discoveryItem.contentSourceId, contextUser);
                contentItem.ContentTypeID = contentSource.ContentTypeID;
                contentItem.ContentSourceTypeID = contentSource.ContentSourceTypeID;
                contentItem.Name = path.basename(filePath);
                contentItem.URL = filePath;
                
                // Dynamic file type detection
                contentItem.ContentFileTypeID = await this.getContentFileTypeFromExtension(filePath, contextUser);
                contentItem.Description = await this.engine.getContentItemDescription({
                    contentSourceID: discoveryItem.contentSourceId,
                    ContentTypeID: contentSource.ContentTypeID,
                    ContentSourceTypeID: contentSource.ContentSourceTypeID,
                    ContentFileTypeID: contentItem.ContentFileTypeID,
                    URL: filePath,
                    name: contentItem.Name
                }, contextUser);
            }

            // Parse the content using the centralized method
            const parsedText = await this.engine.parseContentItem(contentItem, contextUser);
            contentItem.Text = parsedText;
            contentItem.Checksum = await this.engine.getChecksumFromText(parsedText);

            // Save the ContentItem
            const saveResult = await contentItem.Save();
            if (saveResult) {
                console.log(`Successfully ${discoveryItem.action}d content item: ${path.basename(filePath)}`);
                return contentItem;
            } else {
                throw new Error(`Failed to save content item for ${filePath}`);
            }
        } catch (error) {
            console.error(`Failed to process file ${filePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Recursively scan directory for files
     */
    private async scanDirectoryRecursive(dirPath: string): Promise<string[]> {
        const files: string[] = [];
        
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
        for (const item of items) {
            const fullPath = path.join(dirPath, item.name);
            
            if (item.isDirectory()) {
                const subFiles = await this.scanDirectoryRecursive(fullPath);
                files.push(...subFiles);
            } else if (item.isFile()) {
                files.push(fullPath);
            }
        }
        
        return files;
    }

    /**
     * Check if file type is supported
     */
    private isSupportedFileType(filePath: string): boolean {
        const extension = path.extname(filePath).toLowerCase();
        const supportedExtensions = ['.pdf', '.docx', '.xlsx'];
        return supportedExtensions.includes(extension);
    }

    /**
     * Check if ContentItem already exists for this file path
     */
    private async getExistingContentItemId(filePath: string, contentSourceId: string, contextUser: UserInfo): Promise<string | null> {
        try {
            const contentItemId = await this.engine.getContentItemIDFromURL({
                contentSourceID: contentSourceId,
                URL: filePath
            } as any, contextUser);
            return contentItemId;
        } catch {
            return null; // ContentItem doesn't exist
        }
    }

    /**
     * Get ContentSource entity by ID
     */
    private async getContentSource(contentSourceId: string, contextUser: UserInfo): Promise<ContentSourceEntity> {
        const rv = new RunView();
        const result = await rv.RunView<ContentSourceEntity>({
            EntityName: 'Content Sources',
            ExtraFilter: `ID='${contentSourceId}'`,
            ResultType: 'entity_object'
        }, contextUser);
        
        if (result.Success && result.Results.length > 0) {
            return result.Results[0];
        } else {
            throw new Error(`ContentSource with ID ${contentSourceId} not found`);
        }
    }

    /**
     * Get ContentFileType ID based on file extension (dynamic file type detection)
     */
    private async getContentFileTypeFromExtension(filePath: string, contextUser: UserInfo): Promise<string> {
        const extension = path.extname(filePath).toLowerCase();
        
        const rv = new RunView();
        const result = await rv.RunView<ContentFileTypeEntity>({
            EntityName: 'Content File Types',
            ExtraFilter: `FileExtension='${extension}'`,
            ResultType: 'entity_object'
        }, contextUser);
        
        if (result.Success && result.Results.length > 0) {
            console.log(`File ${path.basename(filePath)} detected as ${extension} -> ContentFileType: ${result.Results[0].Name}`);
            return result.Results[0].ID;
        } else {
            throw new Error(`Unknown file extension ${extension} for file ${filePath}`);
        }
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
        
        try {
            // 1. Create ContentItem with basic metadata (no Text or Checksum yet)
            const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', this.contextUser);
            contentItem.NewRecord();
            contentItem.ContentSourceID = contentSourceParams.contentSourceID;
            contentItem.Name = path.basename(filePath);
            contentItem.Description = await this.engine.getContentItemDescription(contentSourceParams, this.contextUser);
            contentItem.ContentTypeID = contentSourceParams.ContentTypeID;
            contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID;
            contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID;
            contentItem.URL = filePath;
            // Text and Checksum will be set after parsing
            
            // 2. Parse the content item using the new centralized method
            const parsedText = await this.engine.parseContentItem(contentItem, this.contextUser);
            
            // 3. Set parsed text and calculate checksum
            contentItem.Text = parsedText;
            contentItem.Checksum = await this.engine.getChecksumFromText(parsedText);
            
            // 4. Save the complete content item
            const saveResult = await contentItem.Save();
            if (saveResult) {
                console.log(`Successfully created content item for: ${filePath}`);
                return contentItem;
            } else {
                throw new Error('Failed to save content item');
            }
        } catch (error) {
            console.error(`Failed to create content item for ${filePath}:`, error.message);
            throw error;
        }
    }


    public async setModifiedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<ContentItemEntity> {
        try {
            const md = new Metadata();
            const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', this.contextUser);
            const contentItemID: string = await this.engine.getContentItemIDFromURL(contentSourceParams, this.contextUser);
            await contentItem.Load(contentItemID);
            
            // Re-parse the content using the centralized method
            const parsedText = await this.engine.parseContentItem(contentItem, this.contextUser);
            
            // Update text and checksum
            contentItem.Text = parsedText;
            contentItem.Checksum = await this.engine.getChecksumFromText(parsedText);

            const saveResult = await contentItem.Save();
            if (saveResult) {
                console.log(`Successfully updated content item for: ${filePath}`);
                return contentItem;
            } else {
                throw new Error('Failed to save updated content item');
            }
        } catch (error) {
            console.error(`Failed to update content item for ${filePath}:`, error.message);
            throw error;
        }
    }
}