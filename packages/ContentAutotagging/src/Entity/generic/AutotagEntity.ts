import { RegisterClass } from "@memberjunction/global";
import { AutotagBase } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams, ContentSourceTypeParamValue } from "../../Engine";
import { UserInfo, Metadata, RunView, BaseEntity, LogStatus } from "@memberjunction/core";
import { MJContentSourceEntity, MJContentItemEntity } from "@memberjunction/core-entities";

@RegisterClass(AutotagBase, 'AutotagEntity')
export class AutotagEntity extends AutotagBase {
    private contextUser: UserInfo;
    private engine: AutotagBaseEngine;
    protected contentSourceTypeID: string;
    private EntityName: string;
    private EntityFields: string[];

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
    }

    public async Autotag(contextUser: UserInfo): Promise<void> {
        this.contextUser = contextUser;
        this.contentSourceTypeID = this.engine.SetSubclassContentSourceType('Entity');
        const contentSources: MJContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
        const contentItemsToProcess: MJContentItemEntity[] = await this.SetContentItemsToProcess(contentSources);
        await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
    }

    public async SetContentItemsToProcess(contentSources: MJContentSourceEntity[]): Promise<MJContentItemEntity[]> {
        const contentItemsToProcess: MJContentItemEntity[] = [];

        for (const contentSource of contentSources) {
            const contentSourceParamsMap = await this.engine.getContentSourceParams(contentSource, this.contextUser);
            if (contentSourceParamsMap) {
                this.applyContentSourceParams(contentSourceParamsMap);
            }

            const contentSourceParams: ContentSourceParams = {
                contentSourceID: contentSource.ID,
                name: contentSource.Name,
                ContentTypeID: contentSource.ContentTypeID,
                ContentFileTypeID: contentSource.ContentFileTypeID,
                ContentSourceTypeID: contentSource.ContentSourceTypeID,
                URL: contentSource.URL
            };

            const contentItems = await this.getNewOrModifiedContentItems(contentSourceParams, this.contextUser);
            if (contentItems && contentItems.length > 0) {
                contentItemsToProcess.push(...contentItems);
            } else {
                LogStatus(`No content items found to process for content source: ${contentSource.Name}`);
            }
        }

        return contentItemsToProcess;
    }

    /**
     * Applies content source parameters to this instance's known configurable fields.
     */
    private applyContentSourceParams(params: Map<string, ContentSourceTypeParamValue>): void {
        const configurableKeys: Set<string> = new Set(['EntityName', 'EntityFields']);
        params.forEach((value, key) => {
            if (configurableKeys.has(key)) {
                if (key === 'EntityName' && typeof value === 'string') {
                    this.EntityName = value;
                } else if (key === 'EntityFields' && Array.isArray(value)) {
                    this.EntityFields = value;
                }
            }
        });
    }

    public async getNewOrModifiedContentItems(contentSourceParams: ContentSourceParams, contextUser: UserInfo): Promise<MJContentItemEntity[]> {
        const lastRunDate: Date = await this.engine.getContentSourceLastRunDate(contentSourceParams.contentSourceID, contextUser);
        const lastRunDateISOString: string = lastRunDate.toISOString();

        const rv = new RunView();
        const results = await rv.RunView<BaseEntity>({
            EntityName: this.EntityName,
            Fields: this.EntityFields,
            ExtraFilter: `__mj_UpdatedAt > '${lastRunDateISOString}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (results.Results && results.Results.length > 0) {
            return this.setContentItemsFromEntityResults(results.Results, contentSourceParams, lastRunDate);
        }

        return [];
    }

    public async setContentItemsFromEntityResults(results: BaseEntity[], contentSourceParams: ContentSourceParams, lastRunDate: Date): Promise<MJContentItemEntity[]> {
        const contentItems: MJContentItemEntity[] = [];
        for (const result of results) {
            const lastUpdatedAt = result.Get('__mj_UpdatedAt') as Date;
            if (lastUpdatedAt > lastRunDate) {
                const contentItem = await this.setNewContentItem(result, contentSourceParams);
                if (contentItem) {
                    contentItems.push(contentItem);
                }
            }
        }

        return contentItems;
    }

    public async setNewContentItem(item: BaseEntity, contentSourceParams: ContentSourceParams): Promise<MJContentItemEntity> {
        const md = new Metadata();
        const text = this.getTextFromEntityResult(item);
        const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
        contentItem.NewRecord();
        contentItem.ContentSourceID = contentSourceParams.contentSourceID;
        contentItem.Name = contentSourceParams.name;
        contentItem.Description = this.engine.GetContentItemDescription(contentSourceParams);
        contentItem.ContentTypeID = contentSourceParams.ContentTypeID;
        contentItem.ContentFileTypeID = contentSourceParams.ContentFileTypeID;
        contentItem.ContentSourceTypeID = contentSourceParams.ContentSourceTypeID;
        contentItem.Text = text;
        contentItem.Checksum = await this.engine.getChecksumFromText(text);
        contentItem.URL = contentSourceParams.URL;

        if (await contentItem.Save()) {
            return contentItem;
        }

        throw new Error('Failed to save content item');
    }

    /**
     * Concatenates entity field values into a text string for processing.
     * Uses typed property access via GetAll() since entity fields are dynamic.
     */
    public getTextFromEntityResult(result: BaseEntity): string {
        const allData = result.GetAll();
        return this.EntityFields
            .map(field => `${field}: ${allData[field] ?? ''}`)
            .join('\n');
    }
}
