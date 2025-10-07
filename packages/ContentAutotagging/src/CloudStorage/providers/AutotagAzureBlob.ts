import { CloudStorageBase } from "../generic/CloudStorageBase";
import { UserInfo, RunView, Metadata } from "@memberjunction/core";
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import dotenv from 'dotenv';
import { ContentItemEntity, ContentFileTypeEntity, ContentSourceEntity } from "@memberjunction/core-entities";
import { ContentDiscoveryResult } from "../../Engine/generic/process.types";
import path from "path";
import * as fs from 'fs';
import * as os from 'os';
import { ContentSourceParams } from "../../Engine";
dotenv.config()

export class AutotagAzureBlob extends CloudStorageBase {
    private blobServiceClient: BlobServiceClient;
    private containerClient: ContainerClient;
    private connectionString: string;
    private containerName: string;

    constructor(connectionString: string, containerName: string) { 
        super();
        this.connectionString = connectionString
        this.containerName = containerName
    }
    

    /**
     * Implemented abstract method from the CloudStorageBase class for cloud storage authentication. This method authenticates the user to the Azure Blob Storage.
     * @returns void
    */
    public async Authenticate(): Promise<void> {
        try {
            this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
            this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
            
            // Test authentication by checking if container exists (requires less permissions)
            const exists = await this.containerClient.exists();
            if (!exists) {
                throw new Error(`Container '${this.containerName}' does not exist or is not accessible`);
            }
            
            console.log(`Successfully authenticated to Azure Blob Storage container: ${this.containerName}`);
        } catch (error) {
            console.error('Azure Blob Storage authentication error:', error.message);
            throw new Error(`Error authenticating to Azure Blob Storage: ${error.message}`)
        }
    }
    
    /**
     * Discovery phase: List Azure Blob Storage items and identify new/modified blobs
     * @param contentSources - Azure Blob content sources to discover items from
     * @param contextUser - User context
     * @returns Array of blobs that need processing
     */
    public async DiscoverContentToProcess(
        contentSources: ContentSourceEntity[], 
        contextUser: UserInfo
    ): Promise<ContentDiscoveryResult[]> {
        const discoveries: ContentDiscoveryResult[] = [];
        this.contextUser = contextUser;

        for (const contentSource of contentSources) {
            try {
                console.log(`Discovering blobs from Azure container: ${this.containerName}`);
                await this.Authenticate();
                
                const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSource.ID, contextUser);
                
                for await (const blob of this.containerClient.listBlobsFlat()) {
                    try {
                        if (!this.isSupportedFileType(blob.name)) {
                            continue;
                        }
                        
                        const blobPath = path.join(this.containerName, blob.name);
                        
                        // Check if blob already exists as ContentItem
                        const existingContentItemId = await this.getExistingContentItemIdForBlob(blobPath, contentSource.ID, contextUser);
                        
                        if (!existingContentItemId && blob.properties.createdOn && blob.properties.createdOn > lastRunDate) {
                            // New blob
                            discoveries.push({
                                identifier: blob.name, // Use blob name as identifier
                                contentSourceId: contentSource.ID,
                                lastModified: blob.properties.lastModified || blob.properties.createdOn,
                                action: 'create',
                                sourceType: 'AzureBlob',
                                metadata: {
                                    blobName: blob.name,
                                    blobPath: blobPath,
                                    containerName: this.containerName,
                                    connectionString: this.connectionString,
                                    size: blob.properties.contentLength,
                                    extension: path.extname(blob.name).toLowerCase()
                                }
                            });
                        } else if (existingContentItemId && blob.properties.lastModified && blob.properties.lastModified > lastRunDate) {
                            // Modified blob
                            discoveries.push({
                                identifier: blob.name,
                                contentSourceId: contentSource.ID,
                                lastModified: blob.properties.lastModified,
                                action: 'update',
                                sourceType: 'AzureBlob',
                                metadata: {
                                    blobName: blob.name,
                                    blobPath: blobPath,
                                    containerName: this.containerName,
                                    connectionString: this.connectionString,
                                    existingContentItemId,
                                    size: blob.properties.contentLength,
                                    extension: path.extname(blob.name).toLowerCase()
                                }
                            });
                        }
                    } catch (blobError) {
                        console.warn(`Error processing blob ${blob.name}:`, blobError.message);
                        continue;
                    }
                }
            } catch (sourceError) {
                console.error(`Error processing Azure Blob content source ${contentSource.Name}:`, sourceError.message);
                continue;
            }
        }

        console.log(`Discovered ${discoveries.length} Azure Blob items to process`);
        return discoveries;
    }
    
    /**
     * Creation phase: Create or update a single ContentItem from an Azure blob
     * @param discoveryItem - Discovery result identifying the blob to process
     * @param contextUser - User context
     * @returns Created or updated ContentItem
     */
    public async SetSingleContentItem(
        discoveryItem: ContentDiscoveryResult, 
        contextUser: UserInfo
    ): Promise<ContentItemEntity> {
        const blobName = discoveryItem.identifier;
        const blobPath = discoveryItem.metadata.blobPath;
        const md = new Metadata();

        try {
            // Ensure authentication
            if (!this.containerClient) {
                await this.Authenticate();
            }
            
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
                contentItem.Name = blobName;
                contentItem.URL = blobPath;
                
                // Dynamic file type detection
                contentItem.ContentFileTypeID = await this.getContentFileTypeFromExtension(blobName, {
                    contentSourceID: discoveryItem.contentSourceId,
                    name: contentSource.Name,
                    ContentTypeID: contentSource.ContentTypeID,
                    ContentSourceTypeID: contentSource.ContentSourceTypeID,
                    ContentFileTypeID: contentSource.ContentFileTypeID,
                    URL: contentSource.URL
                }, contextUser);
                
                contentItem.Description = await this.engine.getContentItemDescription({
                    contentSourceID: discoveryItem.contentSourceId,
                    ContentTypeID: contentSource.ContentTypeID,
                    ContentSourceTypeID: contentSource.ContentSourceTypeID,
                    ContentFileTypeID: contentItem.ContentFileTypeID,
                    URL: blobPath,
                    name: blobName
                }, contextUser);
            }

            // Download blob and parse content
            const tempBuffer = await this.downloadBlobToBuffer(blobName);
            const tempFilePath = await this.createTempFile(blobName, tempBuffer);
            const originalURL = contentItem.URL;
            contentItem.URL = tempFilePath; // Temporarily point to temp file for parsing
            
            try {
                // Parse using centralized method
                const parsedText = await this.engine.parseContentItem(contentItem, contextUser, true);
                contentItem.Text = parsedText;
                contentItem.Checksum = await this.engine.getChecksumFromText(parsedText);
                contentItem.URL = originalURL; // Restore original blob path

                // Save the ContentItem
                const saveResult = await contentItem.Save();
                if (saveResult) {
                    console.log(`Successfully ${discoveryItem.action}d content item for blob: ${blobName}`);
                    return contentItem;
                } else {
                    throw new Error(`Failed to save content item for blob ${blobName}`);
                }
            } finally {
                // Clean up temp file
                await this.cleanupTempFile(tempFilePath);
            }
        } catch (error) {
            console.error(`Failed to process blob ${blobName}:`, error.message);
            throw error;
        }
    }
    
    // HELPER METHODS
    
    /**
     * Check if file type is supported
     */
    private isSupportedFileType(blobName: string): boolean {
        const extension = path.extname(blobName).toLowerCase();
        const supportedExtensions = ['.pdf', '.docx', '.xlsx'];
        return supportedExtensions.includes(extension);
    }
    
    /**
     * Check if ContentItem already exists for this blob
     */
    private async getExistingContentItemIdForBlob(blobPath: string, contentSourceId: string, contextUser: UserInfo): Promise<string | null> {
        try {
            const rv = new RunView();
            const extraFilter = `ContentSourceID='${contentSourceId}' AND URL='${blobPath}'`;
            const result = await rv.RunView<ContentItemEntity>({
                EntityName: 'Content Items',
                ExtraFilter: extraFilter,
                ResultType: 'entity_object'
            }, contextUser);
            
            if (result.Success && result.Results.length > 0) {
                return result.Results[0].ID;
            }
            return null;
        } catch {
            return null;
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

    // LEGACY METHODS (for backward compatibility)

    public async SetNewAndModifiedContentItems(contentSourceParams: ContentSourceParams, lastRunDate: Date, contextUser: UserInfo, prefix=''): Promise<ContentItemEntity[]> {
        const contentItemsToProcess: ContentItemEntity[] = []

        for await (const blob of this.containerClient.listBlobsFlat()) {
            try {
                const filePath = path.join(this.containerName, blob.name)
                
                if (blob.properties.createdOn && blob.properties.createdOn > lastRunDate) {
                    // The file has been created, add a new record for this file
                    const contentItem = await this.setAddedContentItem(blob.name, filePath, contentSourceParams, contextUser);
                    contentItemsToProcess.push(contentItem);
                }
                else if (blob.properties.lastModified && blob.properties.lastModified > lastRunDate) {
                    // The file has been modified, update the record for this file
                    const contentItem = await this.setModifiedContentItem(blob.name, filePath, contentSourceParams, contextUser);
                    contentItemsToProcess.push(contentItem);
                }
            } catch (error) {
                console.error(`Failed to process blob ${blob.name}:`, error.message);
                // Continue processing other files instead of failing entirely
                continue;
            }
        }

        return contentItemsToProcess
    }

    private async setAddedContentItem(blobName: string, filePath: string, contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<ContentItemEntity> {
        try {
            const md = new Metadata();
            
            // 1. Create ContentItem with basic metadata (no Text or Checksum yet)
            const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', contextUser);
            contentItem.NewRecord();
            contentItem.ContentSourceID = contentSourceParams.contentSourceID;
            contentItem.Name = blobName;
            contentItem.Description = await this.engine.getContentItemDescription(contentSourceParams, contextUser);
            contentItem.ContentTypeID = contentSourceParams.ContentTypeID;
            // Dynamic file type detection based on actual file extension
            contentItem.ContentFileTypeID = await this.getContentFileTypeFromExtension(blobName, contentSourceParams, contextUser);
            contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID;
            contentItem.URL = filePath;
            // Text and Checksum will be set after parsing
            
            // 2. Download blob content to temp location for parsing
            const tempBuffer = await this.downloadBlobToBuffer(blobName);
            
            // 3. Create temp file for parseContentItem (it expects file path)
            const tempFilePath = await this.createTempFile(blobName, tempBuffer);
            contentItem.URL = tempFilePath; // Temporarily point to temp file for parsing
            
            try {
                // 4. Parse using new centralized method with parameter support
                const parsedText = await this.engine.parseContentItem(contentItem, contextUser);
                
                // 5. Set parsed text and calculate checksum
                contentItem.Text = parsedText;
                contentItem.Checksum = await this.engine.getChecksumFromText(parsedText);
                
                // 6. Restore original URL and save
                contentItem.URL = filePath; // Restore original blob path
                
                const saveResult = await contentItem.Save();
                if (saveResult) {
                    console.log(`Successfully created content item for blob: ${blobName}`);
                    return contentItem;
                } else {
                    throw new Error('Failed to save content item');
                }
            } finally {
                // Clean up temp file
                await this.cleanupTempFile(tempFilePath);
            }
        } catch (error) {
            console.error(`Failed to create content item for blob ${blobName}:`, error.message);
            throw error;
        }
    }

    private async setModifiedContentItem(blobName: string, filePath: string, contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<ContentItemEntity> {
        try {
            const md = new Metadata();
            const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', contextUser);
            const contentItemID = await this.engine.getContentItemIDFromURL(contentSourceParams, contextUser);
            await contentItem.Load(contentItemID);
            
            // Download updated blob content
            const tempBuffer = await this.downloadBlobToBuffer(blobName);
            const tempFilePath = await this.createTempFile(blobName, tempBuffer);
            const originalURL = contentItem.URL;
            contentItem.URL = tempFilePath; // Temporarily point to temp file for parsing
            
            try {
                // Re-parse using centralized method
                const parsedText = await this.engine.parseContentItem(contentItem, contextUser);
                
                // Update text and checksum
                contentItem.Text = parsedText;
                contentItem.Checksum = await this.engine.getChecksumFromText(parsedText);
                contentItem.URL = originalURL; // Restore original URL
                
                const saveResult = await contentItem.Save();
                if (saveResult) {
                    console.log(`Successfully updated content item for blob: ${blobName}`);
                    return contentItem;
                } else {
                    throw new Error('Failed to save updated content item');
                }
            } finally {
                // Clean up temp file
                await this.cleanupTempFile(tempFilePath);
            }
        } catch (error) {
            console.error(`Failed to update content item for blob ${blobName}:`, error.message);
            throw error;
        }
    }

    /**
     * Download blob content to a Buffer
     */
    private async downloadBlobToBuffer(blobName: string): Promise<Buffer> {
        const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
        const downloadBlockBlobResponse = await blockBlobClient.download();
        return await this.streamToBuffer(downloadBlockBlobResponse.readableStreamBody);
    }

    /**
     * Create temporary file for parsing (parseContentItem expects file paths)
     */
    private async createTempFile(blobName: string, buffer: Buffer): Promise<string> {
        const tempDir = os.tmpdir();
        const tempFileName = `autotag_${Date.now()}_${path.basename(blobName)}`;
        const tempFilePath = path.join(tempDir, tempFileName);
        
        await fs.promises.writeFile(tempFilePath, buffer);
        return tempFilePath;
    }

    /**
     * Clean up temporary file after processing
     */
    private async cleanupTempFile(tempFilePath: string): Promise<void> {
        try {
            await fs.promises.unlink(tempFilePath);
        } catch (error) {
            console.warn(`Failed to cleanup temp file ${tempFilePath}:`, error.message);
            // Don't throw - cleanup failure shouldn't break processing
        }
    }

    /**
     * Get ContentFileType ID based on actual file extension
     */
    private async getContentFileTypeFromExtension(fileName: string, contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<string> {
        const extension = path.extname(fileName).toLowerCase();
        
        const rv = new RunView();
        const result = await rv.RunView<ContentFileTypeEntity>({
            EntityName: 'Content File Types',
            ExtraFilter: `FileExtension='${extension}'`,
            ResultType: 'entity_object'
        }, contextUser);
        
        if (result.Success && result.Results.length > 0) {
            console.log(`File ${fileName} detected as ${extension} -> ContentFileType: ${result.Results[0].Name}`);
            return result.Results[0].ID;
        } else {
            console.warn(`Unknown file extension ${extension} for file ${fileName}, using ContentSource default`);
            return contentSourceParams.ContentFileTypeID; // Fallback to source default
        }
    }

    /**
     * Convert readable stream to Buffer
     */
    private async streamToBuffer(readableStream: NodeJS.ReadableStream): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            readableStream.on("data", (data) => {
                chunks.push(data instanceof Buffer ? data : Buffer.from(data));
            });
            readableStream.on("end", () => {
                resolve(Buffer.concat(chunks));
            });
            readableStream.on("error", reject);
        });
    }
}