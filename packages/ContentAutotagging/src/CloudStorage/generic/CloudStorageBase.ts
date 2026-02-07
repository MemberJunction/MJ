import { AutotagBase } from "../../Core";
import { AutotagBaseEngine } from "../../Engine";
import { ContentSourceParams } from "../../Engine";
import { UserInfo } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity } from "@memberjunction/core-entities";
import dotenv from 'dotenv';
dotenv.config({ quiet: true })

export abstract class CloudStorageBase extends AutotagBase {
    protected contextUser: UserInfo;
    protected engine: AutotagBaseEngine;
    protected contentSourceTypeID: string

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
    }

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
        this.contextUser = contextUser;
        this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Cloud Storage', this.contextUser);
        const contentSources: ContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
        const contentItemsToProcess: ContentItemEntity[] = await this.SetContentItemsToProcess(contentSources)
        await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
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