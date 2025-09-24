import { AutotagBase } from "../../Core";
import { ContentSourceParams } from "../../Engine";
import { UserInfo } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity } from "@memberjunction/core-entities";
import { ContentDiscoveryResult } from "../../Engine/generic/process.types";
export declare class AutotagLocalFileSystem extends AutotagBase {
    private contextUser;
    protected contentSourceTypeID: string;
    constructor();
    getContextUser(): UserInfo | null;
    /**
     * Discovery phase: Scan directories and identify files that need processing
     * @param contentSources - Array of local file system content sources
     * @param contextUser - User context
     * @returns Array of discovery results for files that need processing
     */
    DiscoverContentToProcess(contentSources: ContentSourceEntity[], contextUser: UserInfo): Promise<ContentDiscoveryResult[]>;
    /**
     * Creation phase: Create or update a single ContentItem with parsed text
     * @param discoveryItem - Discovery result identifying the file to process
     * @param contextUser - User context
     * @returns Created or updated ContentItem
     */
    SetSingleContentItem(discoveryItem: ContentDiscoveryResult, contextUser: UserInfo): Promise<ContentItemEntity>;
    /**
     * Recursively scan directory for files
     */
    private scanDirectoryRecursive;
    /**
     * Check if file type is supported
     */
    private isSupportedFileType;
    /**
     * Check if ContentItem already exists for this file path
     */
    private getExistingContentItemId;
    /**
     * Get ContentSource entity by ID
     */
    private getContentSource;
    /**
     * Get ContentFileType ID based on file extension (dynamic file type detection)
     */
    private getContentFileTypeFromExtension;
    /**
     * Implemented abstract method from the AutotagBase class. that runs the entire autotagging process. This method is the entry point for the autotagging process.
     * It initializes the connection, retrieves the content sources corresponding to the content source type, sets the content items that we want to process,
     * extracts and processes the text, and sets the results in the database.
     */
    Autotag(contextUser: UserInfo): Promise<void>;
    /**
    * Implemented abstract method from the AutotagBase class. Given a list of content sources, this method should return a list
    * of content source items that have been modified or added after the most recent process run for that content source.
    * @param contentSources - An array of content sources to check for modified or added content source items
    * @returns - An array of content source items that have been modified or added after the most recent process run for that content source
    */
    SetContentItemsToProcess(contentSources: ContentSourceEntity[]): Promise<ContentItemEntity[]>;
    setContentSourceParams(contentSource: ContentSourceEntity): Promise<ContentSourceParams>;
    /**
     * Given a content source and last run date, recursively traverse through the directory and return a
     * list of content source items that have been modified or added after the last run date.
     * @param contentSource
     * @param lastRunDate
     * @param contextUser
     * @returns
     */
    SetNewAndModifiedContentItems(contentSourceParams: ContentSourceParams, lastRunDate: Date, contextUser: UserInfo): Promise<ContentItemEntity[]>;
    setAddedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<ContentItemEntity>;
    setModifiedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<ContentItemEntity>;
}
//# sourceMappingURL=AutotagLocalFileSystem.d.ts.map