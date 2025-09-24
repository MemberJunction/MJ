import { AutotagBase } from "../../Core";
import { RunView } from "@memberjunction/core";
import dotenv from 'dotenv';
dotenv.config();
export class CloudStorageBase extends AutotagBase {
    contextUser;
    contentSourceTypeID;
    constructor() {
        super();
    }
    async Autotag(contextUser) {
        try {
            this.contextUser = contextUser;
            this.contentSourceTypeID = await this.engine.setSubclassContentSourceType('Azure Blob Storage', this.contextUser);
            const contentSources = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
            console.log(`Found ${contentSources.length} Azure Blob content sources to process`);
            // const contentItemsToProcess: ContentItemEntity[] = await this.SetContentItemsToProcess(contentSources);
            const contentItemsToProcess = await this.GetExistingContentItemsToProcess('8C25112A-AA94-F011-8E63-6045BD34224D', this.contextUser);
            console.log(`Processing ${contentItemsToProcess.length} content items from Azure Blob Storage...`);
            await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser);
            console.log('✅ Azure Blob autotagging process completed successfully!');
            console.log(`✅ Processed ${contentItemsToProcess.length} content items`);
        }
        catch (error) {
            console.error('❌ Azure Blob autotagging process failed:', error.message);
            throw error;
        }
        finally {
            // Give a moment for any pending operations to complete, then exit
            setTimeout(() => {
                console.log('🔄 Shutting down Azure Blob autotagging process...');
                process.exit(0);
            }, 2000);
        }
    }
    async GetExistingContentItemsToProcess(ContentSourceID, contextUser) {
        const rv = new RunView();
        const filter = `ContentSourceID ='${ContentSourceID}' AND Description Like 'MSTA Salary%'`;
        const results = await rv.RunView({
            EntityName: 'Content Items',
            ExtraFilter: filter,
            ResultType: 'entity_object'
        }, contextUser);
        try {
            const contentItems = results.Results;
            return contentItems;
        }
        catch (error) {
            console.error('Error fetching existing content items:', error);
            throw error;
        }
    }
    async SetContentItemsToProcess(contentSources) {
        const contentItemsToProcess = [];
        for (const contentSource of contentSources) {
            await this.Authenticate();
            const contentSourceParams = {
                contentSourceID: contentSource.ID,
                name: contentSource.Name,
                ContentTypeID: contentSource.ContentTypeID,
                ContentSourceTypeID: contentSource.ContentSourceTypeID,
                ContentFileTypeID: contentSource.ContentFileTypeID,
                URL: contentSource.URL
            };
            const lastRunDate = await this.engine.getContentSourceLastRunDate(contentSourceParams.contentSourceID, this.contextUser);
            if (lastRunDate) {
                const contentItems = await this.SetNewAndModifiedContentItems(contentSourceParams, lastRunDate, this.contextUser);
                contentItemsToProcess.push(...contentItems);
            }
        }
        return contentItemsToProcess;
    }
}
//# sourceMappingURL=CloudStorageBase.js.map