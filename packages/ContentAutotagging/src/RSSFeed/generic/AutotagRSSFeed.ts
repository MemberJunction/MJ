import { UserInfo, Metadata, RunView } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { AutotagBase } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { ContentSourceEntity, ContentItemEntity, ContentFileTypeEntity } from '@memberjunction/core-entities';
import { ContentDiscoveryResult } from '../../Engine/generic/process.types';
import { RSSItem } from './RSS.types';
import axios from 'axios'
import crypto from 'crypto'
import Parser from 'rss-parser'
import dotenv from 'dotenv';
dotenv.config()

@RegisterClass(AutotagBase, 'AutotagRSSFeed')
export class AutotagRSSFeed extends AutotagBase {
    private contextUser: UserInfo;
    protected contentSourceTypeID: string

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
    }

    protected getContextUser(): UserInfo {
        return this.contextUser;
    }
    
    // NEW CLOUD-FRIENDLY METHODS
    
    /**
     * Discovery phase: Parse RSS feeds and identify new/modified items
     * @param contentSources - RSS feed content sources to discover items from
     * @param contextUser - User context
     * @returns Array of RSS items that need processing
     */
    public async DiscoverContentToProcess(
        contentSources: ContentSourceEntity[], 
        contextUser: UserInfo
    ): Promise<ContentDiscoveryResult[]> {
        const discoveries: ContentDiscoveryResult[] = [];
        this.contextUser = contextUser;

        for (const contentSource of contentSources) {
            try {
                console.log(`Discovering RSS items from: ${contentSource.URL}`);
                const allRSSItems: RSSItem[] = await this.parseRSSFeed(contentSource.URL);
                
                if (!allRSSItems || allRSSItems.length === 0) {
                    console.log(`No RSS items found for content source: ${contentSource.Name}`);
                    continue;
                }

                for (const rssItem of allRSSItems) {
                    try {
                        // Check if this RSS item already exists as a ContentItem
                        const existingContentItemId = await this.getExistingContentItemIdForRSS(rssItem, contentSource.ID, contextUser);
                        
                        if (existingContentItemId) {
                            // Check if the item has been modified
                            const newHash = await this.getChecksumFromRSSItem(rssItem, contextUser);
                            const existingHash = await this.getExistingContentItemHash(existingContentItemId, contextUser);
                            
                            if (newHash !== existingHash) {
                                discoveries.push({
                                    identifier: rssItem.link || rssItem.guid, 
                                    contentSourceId: contentSource.ID,
                                    lastModified: new Date(rssItem.pubDate || Date.now()),
                                    action: 'update',
                                    sourceType: 'RSSFeed',
                                    metadata: {
                                        rssItem: rssItem,
                                        existingContentItemId,
                                        newHash
                                    }
                                });
                            }
                        } else {
                            // New RSS item
                            discoveries.push({
                                identifier: rssItem.link || rssItem.guid,
                                contentSourceId: contentSource.ID,
                                lastModified: new Date(rssItem.pubDate || Date.now()),
                                action: 'create',
                                sourceType: 'RSSFeed',
                                metadata: {
                                    rssItem: rssItem
                                }
                            });
                        }
                    } catch (itemError) {
                        console.warn(`Error processing RSS item ${rssItem.title}:`, itemError.message);
                        continue;
                    }
                }
            } catch (sourceError) {
                console.error(`Error processing RSS content source ${contentSource.Name}:`, sourceError.message);
                continue;
            }
        }

        console.log(`Discovered ${discoveries.length} RSS items to process`);
        return discoveries;
    }
    
    /**
     * Creation phase: Create or update a single ContentItem from an RSS item
     * @param discoveryItem - Discovery result identifying the RSS item to process
     * @param contextUser - User context
     * @returns Created or updated ContentItem
     */
    public async SetSingleContentItem(
        discoveryItem: ContentDiscoveryResult, 
        contextUser: UserInfo
    ): Promise<ContentItemEntity> {
        const rssItem: RSSItem = discoveryItem.metadata.rssItem;
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
                contentItem.ContentFileTypeID = contentSource.ContentFileTypeID;
                contentItem.Name = rssItem.title || contentSource.Name;
                contentItem.URL = rssItem.link || contentSource.URL;
                contentItem.Description = rssItem.description || await this.engine.getContentItemDescription({
                    contentSourceID: discoveryItem.contentSourceId,
                    ContentTypeID: contentSource.ContentTypeID,
                    ContentSourceTypeID: contentSource.ContentSourceTypeID,
                    ContentFileTypeID: contentSource.ContentFileTypeID,
                    URL: rssItem.link || contentSource.URL,
                    name: contentItem.Name
                }, contextUser);
            }

            // Set RSS item data as JSON text
            contentItem.Text = JSON.stringify(rssItem);
            contentItem.Checksum = discoveryItem.metadata.newHash || await this.getChecksumFromRSSItem(rssItem, contextUser);

            // Save the ContentItem
            const saveResult = await contentItem.Save();
            if (saveResult) {
                console.log(`Successfully ${discoveryItem.action}d content item for RSS item: ${rssItem.title}`);
                return contentItem;
            } else {
                throw new Error(`Failed to save content item for RSS item ${rssItem.title}`);
            }
        } catch (error) {
            console.error(`Failed to process RSS item ${rssItem.title}:`, error.message);
            throw error;
        }
    }
    
    // HELPER METHODS
    
    /**
     * Check if ContentItem already exists for this RSS item
     */
    private async getExistingContentItemIdForRSS(rssItem: RSSItem, contentSourceId: string, contextUser: UserInfo): Promise<string | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<ContentItemEntity>({
                EntityName: 'Content Items',
                ExtraFilter: `ContentSourceID='${contentSourceId}' AND (URL='${rssItem.link}' OR Description='${rssItem.description}')`,
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
     * Get existing ContentItem hash for comparison
     */
    private async getExistingContentItemHash(contentItemId: string, contextUser: UserInfo): Promise<string> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<ContentItemEntity>({
                EntityName: 'Content Items',
                ExtraFilter: `ID='${contentItemId}'`,
                ResultType: 'entity_object'
            }, contextUser);
            
            if (result.Success && result.Results.length > 0) {
                return result.Results[0].Checksum || '';
            }
            return '';
        } catch {
            return '';
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
     * Implemented abstract method from the AutotagBase class. that runs the entire autotagging process. This method is the entry point for the autotagging process.
     * It initializes the connection, retrieves the content sources corresponding to the content source type, sets the content items that we want to process, 
     * extracts and processes the text, and sets the results in the database.
     */
    public async Autotag(contextUser: UserInfo): Promise<void> {
        try {
            this.contextUser = contextUser;
            this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('RSS Feed', this.contextUser);
            const contentSources = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID);
            
            console.log(`Found ${contentSources?.length || 0} RSS Feed content sources to process`);
            
            const contentItemsToProcess = await this.SetContentItemsToProcess(contentSources);
            
            console.log(`Processing ${contentItemsToProcess.length} content items from RSS feeds...`);
            
            await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
            
            console.log('✅ RSS Feed autotagging process completed successfully!');
            console.log(`✅ Processed ${contentItemsToProcess.length} content items`);
            
        } catch (error) {
            console.error('❌ RSS Feed autotagging process failed:', error.message);
            throw error;
        } finally {
            // Give a moment for any pending operations to complete, then exit
            setTimeout(() => {
                console.log('🔄 Shutting down RSS Feed autotagging process...');
                process.exit(0);
            }, 2000);
        }
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
            
            const contentItems: ContentItemEntity[] = await this.SetNewAndModifiedContentItems(allRSSItems, contentSourceParams)
            
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

    public async SetNewAndModifiedContentItems(allRSSItems: RSSItem[], contentSourceParams: ContentSourceParams): Promise<ContentItemEntity[]> {
        const contentItemsToProcess: ContentItemEntity[] = [];
        for (const RSSContentItem of allRSSItems) {
            const rv = new RunView();
            const results = await rv.RunView({
                EntityName: 'Content Items', 
                ExtraFilter: `ContentSourceID = '${contentSourceParams.contentSourceID}' AND (URL = '${RSSContentItem.link}' OR Description = '${RSSContentItem.description}')`, // According to the RSS spec, all items must contain either a title or a description.
                ResultType: 'entity_object',
            }, this.contextUser)

            if (results.Success && results.Results.length) {
                const contentItemResult = <ContentItemEntity> results.Results[0];
                // This content item already exists, check the last hash to see if it has been modified
                const lastStoredHash: string = contentItemResult.Checksum
                const newHash: string = await this.getChecksumFromRSSItem(RSSContentItem, this.contextUser)
            
                if (lastStoredHash !== newHash) {
                    // This content item has been modified
                    const md = new Metadata();
                    const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', this.contextUser);
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
                const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', this.contextUser);
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