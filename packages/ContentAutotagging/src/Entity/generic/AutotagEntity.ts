import { RegisterClass } from "@memberjunction/global";
import { AutotagBase } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { UserInfo, Metadata, RunView, BaseEntity } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity, ContentFileTypeEntity } from "@memberjunction/core-entities";
import { ContentDiscoveryResult } from "../../Engine/generic/process.types";

@RegisterClass(AutotagBase, 'AutotagEntity')
export class AutotagEntity extends AutotagBase {
    private contextUser: UserInfo;
    protected contentSourceTypeID: string
    private EntityName: string
    private EntityFields: string[]

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
    }
    
    /**
     * Discovery phase: Find entity records that need processing
     * @param contentSources - Entity content sources to discover items from
     * @param contextUser - User context
     * @returns Array of entity records that need processing
     */
    public async DiscoverContentToProcess(
        contentSources: ContentSourceEntity[], 
        contextUser: UserInfo
    ): Promise<ContentDiscoveryResult[]> {
        const discoveries: ContentDiscoveryResult[] = [];
        this.contextUser = contextUser;

        for (const contentSource of contentSources) {
            try {
                // Load content source parameters to get EntityName and EntityFields
                const contentSourceParamsMap = await this.engine.getContentSourceParams(contentSource, contextUser);
                if (contentSourceParamsMap) {
                    contentSourceParamsMap.forEach((value, key) => {
                        if (key in this) {
                            (this as any)[key] = value;
                        }
                    });
                }

                if (!this.EntityName || !this.EntityFields) {
                    console.warn(`Entity content source ${contentSource.Name} missing EntityName or EntityFields parameters`);
                    continue;
                }

                const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSource.ID, contextUser);
                const lastRunDateISOString = lastRunDate.toISOString();
                
                const rv = new RunView();
                const results = await rv.RunView<BaseEntity>({
                    EntityName: this.EntityName,
                    Fields: this.EntityFields,
                    ExtraFilter: `__mj_UpdatedAt > '${lastRunDateISOString}'`,
                    ResultType: 'entity_object'
                }, contextUser);

                if (results.Success && results.Results && results.Results.length > 0) {
                    for (const entityRecord of results.Results) {
                        const recordID = entityRecord.Get('ID');
                        const updatedAt = entityRecord.Get('__mj_UpdatedAt');
                        
                        // Check if ContentItem already exists for this entity record
                        const existingContentItemId = await this.getExistingContentItemIdForEntity(recordID, contentSource.ID, contextUser);
                        
                        discoveries.push({
                            identifier: recordID, // Entity record ID
                            contentSourceId: contentSource.ID,
                            lastModified: updatedAt,
                            action: existingContentItemId ? 'update' : 'create',
                            sourceType: 'Entity',
                            metadata: {
                                entityName: this.EntityName,
                                entityFields: this.EntityFields,
                                existingContentItemId,
                                entityRecord: entityRecord.GetAll() // Store the entity data
                            }
                        });
                    }
                }
            } catch (error) {
                console.error(`Error processing entity content source ${contentSource.Name}:`, error.message);
                continue;
            }
        }

        console.log(`Discovered ${discoveries.length} entity records to process`);
        return discoveries;
    }
    
    /**
     * Creation phase: Create or update a single ContentItem from an entity record
     * @param discoveryItem - Discovery result identifying the entity record to process
     * @param contextUser - User context
     * @returns Created or updated ContentItem
     */
    public async SetSingleContentItem(
        discoveryItem: ContentDiscoveryResult, 
        contextUser: UserInfo
    ): Promise<ContentItemEntity> {
        const recordId = discoveryItem.identifier;
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
                contentItem.Name = `${discoveryItem.metadata.entityName} Record ${recordId}`;
                contentItem.URL = contentSource.URL; // Entity content sources use the same URL
                contentItem.Description = await this.engine.getContentItemDescription({
                    contentSourceID: discoveryItem.contentSourceId,
                    ContentTypeID: contentSource.ContentTypeID,
                    ContentSourceTypeID: contentSource.ContentSourceTypeID,
                    ContentFileTypeID: contentSource.ContentFileTypeID,
                    URL: contentSource.URL,
                    name: contentItem.Name
                }, contextUser);
            }

            // Generate text from entity record data
            const text = this.getTextFromEntityData(discoveryItem.metadata.entityRecord, discoveryItem.metadata.entityFields);
            contentItem.Text = text;
            contentItem.Checksum = await this.engine.getChecksumFromText(text);

            // Save the ContentItem
            const saveResult = await contentItem.Save();
            if (saveResult) {
                console.log(`Successfully ${discoveryItem.action}d content item for entity record: ${recordId}`);
                return contentItem;
            } else {
                throw new Error(`Failed to save content item for entity record ${recordId}`);
            }
        } catch (error) {
            console.error(`Failed to process entity record ${recordId}:`, error.message);
            throw error;
        }
    }
    
    // HELPER METHODS
    
    /**
     * Check if ContentItem already exists for this entity record
     */
    private async getExistingContentItemIdForEntity(recordId: string, contentSourceId: string, contextUser: UserInfo): Promise<string | null> {
        try {
            const rv = new RunView();
            const result = await rv.RunView<ContentItemEntity>({
                EntityName: 'Content Items',
                ExtraFilter: `ContentSourceID='${contentSourceId}' AND Name LIKE '%${recordId}%'`,
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
    
    /**
     * Generate text from entity record data
     */
    private getTextFromEntityData(entityData: any, entityFields: string[]): string {
        let text = '';
        for (const field of entityFields) {
            const fieldVal = entityData[field];
            text += `${field}: ${fieldVal}\n`;
        } 
        return text;
    }
    public async Autotag(contextUser: UserInfo): Promise<void> {
        try {
            this.contextUser = contextUser;
            this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Entity', this.contextUser);
            const contentSources: ContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
            
            console.log(`Found ${contentSources.length} Entity content sources to process`);
            
            const contentItemsToProcess: ContentItemEntity[] = await this.SetContentItemsToProcess(contentSources);
            
            console.log(`Processing ${contentItemsToProcess.length} content items from entities...`);
            
            await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
            
            console.log('✅ Entity autotagging process completed successfully!');
            console.log(`✅ Processed ${contentItemsToProcess.length} content items`);
            
        } catch (error) {
            console.error('❌ Entity autotagging process failed:', error.message);
            throw error;
        } finally {
            // Give a moment for any pending operations to complete, then exit
            setTimeout(() => {
                console.log('🔄 Shutting down Entity autotagging process...');
                process.exit(0);
            }, 2000);
        }
    }

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
            
            const contentItems: ContentItemEntity[] = await this.getNewOrModifiedContentItems(contentSourceParams, this.contextUser);
            if (contentItems && contentItems.length > 0) {
                contentItemsToProcess.push(...contentItems);
            }
            else {
                // No content items found to process
                console.log(`No content items found to process for content source: ${contentSource.Name}`);
            }
        }

        return contentItemsToProcess;
    }

    public async getNewOrModifiedContentItems(contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<ContentItemEntity[]> {
        const lastRunDate: Date = await this.engine.getContentSourceLastRunDate(contentSourceParams.contentSourceID, contextUser)
        const lastRunDateISOString: string = lastRunDate.toISOString();
        
        const rv = new RunView();

        // Get all entities that have been added/updated since the last run date
        const results = await rv.RunView<BaseEntity>({
            EntityName: this.EntityName,
            Fields: this.EntityFields,
            ExtraFilter: `__mj_UpdatedAt > '${lastRunDateISOString}'`,
            ResultType: 'entity_object'
        }, contextUser);

        const entityResults: BaseEntity[] = results.Results
        if (results.Results && results.Results.length > 0) {
            const contentItems: ContentItemEntity[] = await this.setContentItemsFromEntityResults(entityResults, contentSourceParams, lastRunDate);
            return contentItems;
        }
        else {
            return [];
        }
    }

    public async setContentItemsFromEntityResults(results: BaseEntity[], contentSourceParams: ContentSourceParams, lastRunDate: Date): Promise<ContentItemEntity[]> {
        const contentItems: ContentItemEntity[] = [];
        for (const result of results) {
            const lastUpdatedAt = result.Get('__mj_UpdatedAt');
            if (lastUpdatedAt > lastRunDate) {
                const contentItem = await this.setNewContentItem(result, contentSourceParams);
                if (contentItem){
                    contentItems.push(contentItem);
                }
            }
        }
    
        return contentItems;
    }

    public async setNewContentItem(item: BaseEntity, contentSourceParams: ContentSourceParams): Promise<ContentItemEntity> {
        const md = new Metadata();
        const text = this.getTextFromEntityResult(item);
        const contentItem = await md.GetEntityObject<ContentItemEntity>('Content Items', this.contextUser);
        contentItem.NewRecord();
        contentItem.ContentSourceID = contentSourceParams.contentSourceID;
        contentItem.Name = contentSourceParams.name
        contentItem.Description = await this.engine.getContentItemDescription(contentSourceParams, this.contextUser)
        contentItem.ContentTypeID = contentSourceParams.ContentTypeID
        contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID
        contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID
        contentItem.Text = text;
        contentItem.Checksum = await this.engine.getChecksumFromText(text);
        contentItem.URL = contentSourceParams.URL;

        if(await contentItem.Save()){
            return contentItem;
        }
        else {
            throw new Error('Failed to save content item');
        }
    }

    public getTextFromEntityResult(result: BaseEntity): string {
        let text = ''
        // For every field in the field list, add the field's name and value to the text in the format FieldName: FieldValue
        for (const field of this.EntityFields) {
            const fieldVal = result.Get(field)
            text += `${field}: ${fieldVal}\n`
        } 
        
        return text;
    }
}