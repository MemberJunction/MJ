import { RegisterClass } from "@memberjunction/global";
import { AutotagBase } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { UserInfo, Metadata, RunView, BaseEntity } from "@memberjunction/core";
import { ContentSourceEntity, ContentItemEntity } from "@memberjunction/core-entities";

@RegisterClass(AutotagBase, 'AutotagEntity')
export class AutotagEntity extends AutotagBase {
    private contextUser: UserInfo;
    private engine: AutotagBaseEngine;
    protected contentSourceTypeID: string
    private EntityName: string
    private EntityFields: string[]

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
    }
    public async Autotag(contextUser: UserInfo): Promise<void> {
        this.contextUser = contextUser;
        this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Entity', this.contextUser);
        const contentSources: ContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
        const contentItemsToProcess: ContentItemEntity[] = await this.SetContentItemsToProcess(contentSources)
        await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
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
        const results = await rv.RunView<BaseEntity>({
            EntityName: this.EntityName,
            Fields: this.EntityFields,
            ExtraFilter: `__mj_UpdatedAt > '${lastRunDateISOString}'`,
            ResultType: 'entity_object'
        }, contextUser);

        const entityResults: BaseEntity[] = results.Results
        if (results.Results && results.Results.length > 0) {
            const contentItems: ContentItemEntity[] = await this.setContentItemsFromEntityResults(entityResults.splice(0,10), contentSourceParams, lastRunDate, contextUser);
            return contentItems;
        }
        else {
            return [];
        }
    }

    public async setContentItemsFromEntityResults(results: BaseEntity[], contentSourceParams: ContentSourceParams, lastRunDateISOString: Date, contextUser: UserInfo): Promise<ContentItemEntity[]> {
        const contentItems: ContentItemEntity[] = [];
        for (const result of results) {
            const lastUpdatedAt = result.Get('__mj_UpdatedAt');
            const lastCreatedAt = result.Get('__mj_CreatedAt');
            if (lastUpdatedAt > lastRunDateISOString) {
                const contentItem = await this.setNewContentItem(result, contentSourceParams, contextUser);
                if (contentItem){
                    contentItems.push(contentItem);
                }
            }
            else if (lastCreatedAt > lastRunDateISOString) {
                const contentItem = await this.updateModifiedContentItem(result, contentSourceParams, contextUser);
                if (contentItem) {
                    contentItems.push(contentItem);
                }
            }
        }
    
        return contentItems;
    }

    public async setNewContentItem(item: BaseEntity, contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<ContentItemEntity> {
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

    public async updateModifiedContentItem(item: BaseEntity, contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<ContentItemEntity> {
        throw new Error('Method not implemented.');
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