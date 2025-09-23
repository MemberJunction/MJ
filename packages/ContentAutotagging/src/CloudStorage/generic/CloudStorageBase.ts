import { AutotagBase } from "../../Core";
import { AutotagBaseEngine } from "../../Engine";
import { ContentSourceParams } from "../../Engine";
import { RunView, UserInfo, Metadata } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity, ContentFileTypeEntity } from "@memberjunction/core-entities";
import { ContentDiscoveryResult } from "../../Engine/generic/process.types";
import dotenv from 'dotenv';
dotenv.config()

export abstract class CloudStorageBase extends AutotagBase {
    protected contextUser: UserInfo;
    protected contentSourceTypeID: string

    constructor() {
        super();
    }

    // NEW CLOUD-FRIENDLY METHODS
    
    /**
     * Discovery phase: Find what items need processing without creating ContentItems yet
     * @param contentSources - Content sources to discover items from
     * @param contextUser - User context
     * @returns Array of items that need processing
     */
    public abstract DiscoverContentToProcess(
        contentSources: ContentSourceEntity[], 
        contextUser: UserInfo
    ): Promise<ContentDiscoveryResult[]>;
    
    /**
     * Creation phase: Create/update single ContentItem with parsed text (no LLM processing)
     * @param discoveryItem - Discovery result identifying what to process
     * @param contextUser - User context
     * @returns Created/updated ContentItem with parsed text
     */
    public abstract SetSingleContentItem(
        discoveryItem: ContentDiscoveryResult, 
        contextUser: UserInfo
    ): Promise<ContentItemEntity>;

    /**
     * Abstract method to be implemented in the subclass. This method authenticates the user to the cloud storage.
    */
    public abstract Authenticate(): Promise<void>;

    /**
     * Abstract method to be implemented in the subclass. Given a list of content sources, this method should return a list 
     * of content source items that have been modified or added after the most recent process run for that content source.
     * Each cloud storage provider has a different way of accessing files and checking for modified or added items.
     * @param contentSources - An array of content sources to check for modified or added content source items
     * @param lastRunDate - The date of the most recent process run for the content source
     * @param contextUser - The user context for the autotagging process
     * @returns - An array of content source items that have been modified or added after the most recent process run for that content source
    */
    public abstract SetNewAndModifiedContentItems(contentSourceParams: ContentSourceParams, lastRunDate: Date, contextUser: UserInfo): Promise<ContentItemEntity[]>;
    
    public async Autotag(contextUser: UserInfo): Promise<void> {
        try {
            this.contextUser = contextUser;
            this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Azure Blob Storage', this.contextUser);
            const contentSources: ContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
            
            console.log(`Found ${contentSources.length} Azure Blob content sources to process`);
            
            // const contentItemsToProcess: ContentItemEntity[] = await this.SetContentItemsToProcess(contentSources);

            const contentItemsToProcess: ContentItemEntity[] = await this.GetExistingContentItemsToProcess('8C25112A-AA94-F011-8E63-6045BD34224D', this.contextUser);
            
            console.log(`Processing ${contentItemsToProcess.length} content items from Azure Blob Storage...`);
            
            await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
            
            console.log('✅ Azure Blob autotagging process completed successfully!');
            console.log(`✅ Processed ${contentItemsToProcess.length} content items`);
            
        } catch (error) {
            console.error('❌ Azure Blob autotagging process failed:', error.message);
            throw error;
        } finally {
            // Give a moment for any pending operations to complete, then exit
            setTimeout(() => {
                console.log('🔄 Shutting down Azure Blob autotagging process...');
                process.exit(0);
            }, 2000);
        }
    }

    public async GetExistingContentItemsToProcess(ContentSourceID: string, contextUser: UserInfo): Promise<ContentItemEntity[]> {
        const rv = new RunView();
        const filter = `ContentSourceID ='${ContentSourceID}' AND Description Like 'MSTA Salary%'`;

        const results = await rv.RunView({
            EntityName: 'Content Items',
            ExtraFilter: filter, 
            ResultType: 'entity_object'
        }, contextUser);

        try {
            const contentItems: ContentItemEntity[] = results.Results;
            return contentItems;
        } catch (error) {
            console.error('Error fetching existing content items:', error);
            throw error;
        }
    }

    public async SetContentItemsToProcess(contentSources: ContentSourceEntity[]): Promise<ContentItemEntity[]> {
        const contentItemsToProcess: ContentItemEntity[] = []
        
        for (const contentSource of contentSources) {
            await this.Authenticate();

            const contentSourceParams: ContentSourceParams = {
                contentSourceID: contentSource.ID,
                name: contentSource.Name,
                ContentTypeID: contentSource.ContentTypeID,
                ContentSourceTypeID: contentSource.ContentSourceTypeID,
                ContentFileTypeID: contentSource.ContentFileTypeID,
                URL: contentSource.URL
            }

            const lastRunDate: Date = await this.engine.getContentSourceLastRunDate(contentSourceParams.contentSourceID, this.contextUser);

            if (lastRunDate) {
                const contentItems = await this.SetNewAndModifiedContentItems(contentSourceParams, lastRunDate, this.contextUser);
                contentItemsToProcess.push(...contentItems);
            }
        }

        return contentItemsToProcess;
    }
}