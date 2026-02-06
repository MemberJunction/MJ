import { RegisterClass } from "@memberjunction/global";
import fs from 'fs';
import { AutotagBase } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { UserInfo, Metadata, RunView } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity } from "@memberjunction/core-entities";
import { OpenAI } from "openai";
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ quiet: true })

@RegisterClass(AutotagBase, 'AutotagLocalFileSystem')
export class AutotagLocalFileSystem extends AutotagBase {
    private contextUser: UserInfo;
    private engine: AutotagBaseEngine;
    protected contentSourceTypeID: string
    static _openAI: OpenAI;

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
        this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Local File System', this.contextUser);
        const contentSources: ContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
        const contentItemsToProcess: ContentItemEntity[] = await this.SetContentItemsToProcess(contentSources)
        await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
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
        const text = await this.engine.parseFileFromPath(filePath);
        const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', this.contextUser);
        contentItem.NewRecord();
        contentItem.ContentSourceID = contentSourceParams.contentSourceID
        contentItem.Name = contentSourceParams.name
        contentItem.Description = await this.engine.getContentItemDescription(contentSourceParams, this.contextUser)
        contentItem.ContentTypeID = contentSourceParams.ContentTypeID
        contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID
        contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID
        contentItem.Checksum = await this.engine.getChecksumFromText(text)
        contentItem.URL = contentSourceParams.URL
        contentItem.Text = text

        if(await contentItem.Save()){
            return contentItem;
        }
        else {
            throw new Error('Failed to save content item');
        }
    }

    public async setModifiedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<ContentItemEntity> {
        const md = new Metadata();
        const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', this.contextUser);
        const contentItemID: string = await this.engine.getContentItemIDFromURL(contentSourceParams, this.contextUser);
        await contentItem.Load(contentItemID);
        const text = await this.engine.parseFileFromPath(filePath);
        contentItem.Text = text
        contentItem.Checksum = await this.engine.getChecksumFromText(text)

        if(await contentItem.Save()){
            return contentItem;
        }
        else {
            throw new Error('Failed to save content item');
        }
    }
}