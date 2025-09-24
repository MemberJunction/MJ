import { AutotagBase } from "../../Core";
import { ContentSourceParams } from "../../Engine";
import { UserInfo } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity } from "@memberjunction/core-entities";
import { ContentDiscoveryResult } from "../../Engine/generic/process.types";
export declare abstract class CloudStorageBase extends AutotagBase {
    protected contextUser: UserInfo;
    protected contentSourceTypeID: string;
    constructor();
    /**
     * Discovery phase: Find what items need processing without creating ContentItems yet
     * @param contentSources - Content sources to discover items from
     * @param contextUser - User context
     * @returns Array of items that need processing
     */
    abstract DiscoverContentToProcess(contentSources: ContentSourceEntity[], contextUser: UserInfo): Promise<ContentDiscoveryResult[]>;
    /**
     * Creation phase: Create/update single ContentItem with parsed text (no LLM processing)
     * @param discoveryItem - Discovery result identifying what to process
     * @param contextUser - User context
     * @returns Created/updated ContentItem with parsed text
     */
    abstract SetSingleContentItem(discoveryItem: ContentDiscoveryResult, contextUser: UserInfo): Promise<ContentItemEntity>;
    /**
     * Abstract method to be implemented in the subclass. This method authenticates the user to the cloud storage.
    */
    abstract Authenticate(): Promise<void>;
    /**
     * Abstract method to be implemented in the subclass. Given a list of content sources, this method should return a list
     * of content source items that have been modified or added after the most recent process run for that content source.
     * Each cloud storage provider has a different way of accessing files and checking for modified or added items.
     * @param contentSources - An array of content sources to check for modified or added content source items
     * @param lastRunDate - The date of the most recent process run for the content source
     * @param contextUser - The user context for the autotagging process
     * @returns - An array of content source items that have been modified or added after the most recent process run for that content source
    */
    abstract SetNewAndModifiedContentItems(contentSourceParams: ContentSourceParams, lastRunDate: Date, contextUser: UserInfo): Promise<ContentItemEntity[]>;
    Autotag(contextUser: UserInfo): Promise<void>;
    GetExistingContentItemsToProcess(ContentSourceID: string, contextUser: UserInfo): Promise<ContentItemEntity[]>;
    SetContentItemsToProcess(contentSources: ContentSourceEntity[]): Promise<ContentItemEntity[]>;
}
//# sourceMappingURL=CloudStorageBase.d.ts.map