import { CloudStorageBase } from "../generic/CloudStorageBase";
import { UserInfo } from "@memberjunction/core";
import { ContentItemEntity, ContentSourceEntity } from "@memberjunction/core-entities";
import { ContentDiscoveryResult } from "../../Engine/generic/process.types";
import { ContentSourceParams } from "../../Engine";
export declare class AutotagAzureBlob extends CloudStorageBase {
    private blobServiceClient;
    private containerClient;
    private connectionString;
    private containerName;
    constructor(connectionString: string, containerName: string);
    /**
     * Implemented abstract method from the CloudStorageBase class for cloud storage authentication. This method authenticates the user to the Azure Blob Storage.
     * @returns void
    */
    Authenticate(): Promise<void>;
    /**
     * Discovery phase: List Azure Blob Storage items and identify new/modified blobs
     * @param contentSources - Azure Blob content sources to discover items from
     * @param contextUser - User context
     * @returns Array of blobs that need processing
     */
    DiscoverContentToProcess(contentSources: ContentSourceEntity[], contextUser: UserInfo): Promise<ContentDiscoveryResult[]>;
    /**
     * Creation phase: Create or update a single ContentItem from an Azure blob
     * @param discoveryItem - Discovery result identifying the blob to process
     * @param contextUser - User context
     * @returns Created or updated ContentItem
     */
    SetSingleContentItem(discoveryItem: ContentDiscoveryResult, contextUser: UserInfo): Promise<ContentItemEntity>;
    /**
     * Check if file type is supported
     */
    private isSupportedFileType;
    /**
     * Check if ContentItem already exists for this blob
     */
    private getExistingContentItemIdForBlob;
    /**
     * Get ContentSource entity by ID
     */
    private getContentSource;
    SetNewAndModifiedContentItems(contentSourceParams: ContentSourceParams, lastRunDate: Date, contextUser: UserInfo, prefix?: string): Promise<ContentItemEntity[]>;
    private setAddedContentItem;
    private setModifiedContentItem;
    /**
     * Download blob content to a Buffer
     */
    private downloadBlobToBuffer;
    /**
     * Create temporary file for parsing (parseContentItem expects file paths)
     */
    private createTempFile;
    /**
     * Clean up temporary file after processing
     */
    private cleanupTempFile;
    /**
     * Get ContentFileType ID based on actual file extension
     */
    private getContentFileTypeFromExtension;
    /**
     * Convert readable stream to Buffer
     */
    private streamToBuffer;
}
//# sourceMappingURL=AutotagAzureBlob.d.ts.map