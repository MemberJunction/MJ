import { RegisterClass } from "@memberjunction/global";
import fs from 'fs';
import { AutotagBase } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { UserInfo, Metadata, RunView } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity } from "@memberjunction/core-entities";
import { OpenAI } from "openai";
import path from 'path';
import dotenv from 'dotenv';
dotenv.config()

@RegisterClass(AutotagBase, 'AutotagLocalFileSystem')
export class AutotagLocalFileSystem extends AutotagBase {
    private contextUser: UserInfo;
    private engine: AutotagBaseEngine;
    private apiKey: string;
    protected contentSourceTypeID: number
    static _openAI: OpenAI;

    constructor() {
        super();
        this.apiKey = process.env['AI_VENDOR_API_KEY__OpenAILLM'] || '';
        this.engine = AutotagBaseEngine.Instance;
        if(!AutotagLocalFileSystem._openAI){
            AutotagLocalFileSystem._openAI = new OpenAI({apiKey: this.apiKey});
        }
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
        await AutotagBaseEngine.Instance.Config(false, this.contextUser);
        this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Local Filesystem', this.contextUser);
        const contentSources: ContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
        const contentItemsToProcess: ContentItemEntity[] = await this.SetContentItemsToProcess(contentSources)
        await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, AutotagLocalFileSystem._openAI, this.contextUser);
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
            if (fs.existsSync(contentSource.Get('URL'))) {
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
                    contentSourceID: contentSource.Get('ID'),
                    name: contentSource.Get('Name'),
                    ContentTypeID: contentSource.Get('ContentTypeID'),
                    ContentSourceTypeID: contentSource.Get('ContentSourceTypeID'),
                    ContentFileTypeID: contentSource.Get('ContentFileTypeID'),
                    URL: contentSource.Get('URL')
                }
                
                const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSourceParams.contentSourceID, this.contextUser)

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
                console.log(`Invalid Content Source ${contentSource.Get('Name')}`);
            }
        }

        return contentItemsToProcess;
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

        const rv = new RunView()
        const results = await rv.RunView({
            EntityName: 'Content Items',
            ResultType: 'entity_object'
        }, this.contextUser)

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
                    const md = new Metadata();
                    const text = await this.engine.parseFileFromPath(filePath);
                    const contentItem = <ContentItemEntity> await md.GetEntityObject('Content Items', this.contextUser);
                    contentItem.NewRecord();
                    contentItem.Set('ContentSourceID', contentSourceParams.contentSourceID);
                    contentItem.Set('Name', contentSourceParams.name);
                    contentItem.Set('Description', await this.engine.getContentItemDescription(contentSourceParams, this.contextUser));
                    contentItem.Set('ContentTypeID', contentSourceParams.ContentTypeID);
                    contentItem.Set('ContentFileTypeID', contentSourceParams.ContentFileTypeID);
                    contentItem.Set('ContentSourceTypeID', contentSourceParams.ContentSourceTypeID);
                    contentItem.Set('Checksum', await this.engine.getChecksumFromText(text));
                    contentItem.Set('URL', contentSourceParams.URL);
                    contentItem.Set('Text', text);
                    contentItem.Set('CreatedAt', new Date());
                    contentItem.Set('UpdatedAt', new Date());

                    await contentItem.Save();
                    contentItems.push(contentItem); // Content item was added, add to list
                }
                else if (modifiedDate > lastRunDate) {
                    // The file's contents has been, update the record for this file 
                    const md = new Metadata();
                    const contentItem = <ContentItemEntity> await md.GetEntityObject('Content Items', this.contextUser);
                    const contentItemID = await this.engine.getContentItemIDFromURL(contentSourceParams, this.contextUser);
                    await contentItem.Load(contentItemID);
                    contentItem.Set('Text', await this.engine.parseFileFromPath(filePath));
                    contentItem.Set('UpdatedAt', new Date());
                    contentItem.Save();
                }
            }
        }
        return contentItems;
    }
}