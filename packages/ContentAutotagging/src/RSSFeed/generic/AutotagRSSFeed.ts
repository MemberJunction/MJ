import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AutotagBase } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { MJContentSourceEntity, MJContentItemEntity } from '@memberjunction/core-entities';
import { RSSItem } from './RSS.types';
import axios from 'axios'
import crypto from 'crypto'
import Parser from 'rss-parser'
import dotenv from 'dotenv';
dotenv.config({ quiet: true })

@RegisterClass(AutotagBase, 'AutotagRSSFeed')
export class AutotagRSSFeed extends AutotagBase {
    private contextUser: UserInfo;
    private engine: AutotagBaseEngine;
    protected contentSourceTypeID: string

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
    }

    protected getContextUser(): UserInfo {
        return this.contextUser;
    }

    /**
     * Implemented abstract method from the AutotagBase class. that runs the entire autotagging process. This method is the entry point for the autotagging process.
     * It initializes the connection, retrieves the content sources corresponding to the content source type, sets the content items that we want to process, 
     * extracts and processes the text, and sets the results in the database.
     */
    public async Autotag(contextUser: UserInfo): Promise<void> {
        this.contextUser = contextUser;
        this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('RSS Feed', this.contextUser);
        const contentSources = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID);
        const contentItemsToProcess = await this.SetContentItemsToProcess(contentSources);
        await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
    }

    /**
     * Implemented abstract method from the AutotagBase class. Given a list of content sources, this method should return a list 
     * of content source items that have been modified or added after the most recent process run for that content source.
     * @param contentSources - An array of content sources to check for modified or added content source items
     * @returns - An array of content source items that have been modified or added after the most recent process run for that content source
     */
    public async SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]> {
        const contentItemsToProcess: MJContentItemEntity[] = []
        for (const contentSource of contentSources) {

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
                ContentFileTypeID: contentSource.ContentFileTypeID,
                ContentSourceTypeID: contentSource.ContentSourceTypeID,
                URL: contentSource.URL
            }
            
            const allRSSItems: RSSItem[] = await this.parseRSSFeed(contentSourceParams.URL);
            
            const contentItems: MJContentItemEntity[] = await this.SetNewAndModifiedContentItems(allRSSItems, contentSourceParams)
            
            if (contentItems && contentItems.length > 0) {
                contentItemsToProcess.push(...contentItems);
            }
            else {
                // No content items found to process
                console.log(`No content items found to process for content source: ${contentSource.Get('Name')}`);
            }
        }
        return contentItemsToProcess
    }

    public async SetNewAndModifiedContentItems(allRSSItems: RSSItem[], contentSourceParams: ContentSourceParams): Promise<MJContentItemEntity[]> {
        const contentItemsToProcess: MJContentItemEntity[] = [];
        for (const RSSContentItem of allRSSItems) {
            const rv = new RunView();
            const results = await rv.RunView({
                EntityName: 'MJ: Content Items', 
                ExtraFilter: `ContentSourceID = '${contentSourceParams.contentSourceID}' AND (URL = '${RSSContentItem.link}' OR Description = '${RSSContentItem.description}')`, // According to the RSS spec, all items must contain either a title or a description.
                ResultType: 'entity_object',
            }, this.contextUser)

            if (results.Success && results.Results.length) {
                const contentItemResult = <MJContentItemEntity> results.Results[0];
                // This content item already exists, check the last hash to see if it has been modified
                const lastStoredHash: string = contentItemResult.Checksum
                const newHash: string = await this.getChecksumFromRSSItem(RSSContentItem, this.contextUser)
            
                if (lastStoredHash !== newHash) {
                    // This content item has been modified
                    const md = new Metadata();
                    const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
                    contentItem.Load(contentItemResult.ID);
                    contentItem.Checksum = newHash
                    contentItem.Text = JSON.stringify(RSSContentItem)

                    await contentItem.Save();
                    contentItemsToProcess.push(contentItem); // Content item was modified, add to list
                }
            }
            else {
                // This content item does not exist, add it
                const md = new Metadata();
                const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
                contentItem.ContentSourceID = contentSourceParams.contentSourceID
                contentItem.Name = contentSourceParams.name
                contentItem.Description = RSSContentItem.description || await this.engine.getContentItemDescription(contentSourceParams, this.contextUser)
                contentItem.ContentTypeID = contentSourceParams.ContentTypeID
                contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID
                contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID
                contentItem.Checksum = await this.getChecksumFromRSSItem(RSSContentItem, this.contextUser)
                contentItem.URL = RSSContentItem.link || contentSourceParams.URL
                contentItem.Text = JSON.stringify(RSSContentItem)

                await contentItem.Save();
                contentItemsToProcess.push(contentItem); // Content item was added, add to list
                
            }
        }
        return contentItemsToProcess
    }

    public async parseRSSFeed(url: string): Promise<RSSItem[]> {
        try {
            if(await this.urlIsValid(url)) {
                const RSSItems: RSSItem[] = []
                const parser = new Parser();
                const feed = await parser.parseURL(url);
                const items = feed.items;
                
                // Map each item to an RSSItem object and add it to the RSSItems array
                items.forEach(async (item: any) => {
                    const rssItem = new RSSItem();
                    rssItem.title = item.title ?? '';
                    rssItem.link = item.link ?? '';
                    rssItem.description = item.description ?? '';
                    rssItem.pubDate = item.pubDate ?? '';
                    rssItem.guid = item.guid ?? '';
                    rssItem.category = item.category ?? '';
                    const content = item['content:encoded'] ?? item['content'] ?? '';
                    rssItem.content = await this.engine.parseHTML(content);
                    rssItem.author = item.author ?? '';
                    rssItem.comments = item.comments ?? '';
                    rssItem.source = item.source ?? '';
                    RSSItems.push(rssItem);
                });
                
                return RSSItems
            }
            else {
                throw new Error(`Invalid URL: ${url}`);
            }
        }  
        catch (error) {
            console.error('Error fetching RSS feed:', error);
            return [];
          }
    }

    protected async urlIsValid(url: string): Promise<boolean> {
        try { 
            const response = await axios.head(url);
            return response.status === 200;
        }
        catch (e) {
            console.error(`Invalid URL: ${url}`);
            return false;
        }
    }

    public async getChecksumFromRSSItem(RSSContentItem: RSSItem, contextUser: UserInfo): Promise<string> {
        const hash = crypto.createHash('sha256').update(JSON.stringify(RSSContentItem)).digest('hex')
        return hash
    }
}