import { RegisterClass } from "@memberjunction/global";
import fs from 'fs';
import { AutotagBase, AutotagProgressCallback } from "../../Core";
import { AutotagBaseEngine, ContentSourceParams } from "../../Engine";
import { FieldValueCollection, IMetadataProvider, UserInfo, Metadata, RunView } from "@memberjunction/core";
import { MJContentSourceEntity, MJContentItemEntity } from "@memberjunction/core-entities";
import { OpenAI } from "openai";
import path from 'path';
import {
    ConfidenceScale,
    DiscoverRequest,
    DiscoveredItem,
    LocatorFetchRequest,
    LocatorFetchResponse,
} from '@memberjunction/content-pipeline-base';
import dotenv from 'dotenv';
dotenv.config({ quiet: true })

@RegisterClass(AutotagBase, 'AutotagLocalFileSystem')
export class AutotagLocalFileSystem extends AutotagBase {
    public override readonly SupportsExhaustiveWalk = true;
    private contextUser: UserInfo;
    private engine: AutotagBaseEngine;
    protected contentSourceTypeID: string
    static _openAI: OpenAI;

    constructor() {
        super();
        this.engine = AutotagBaseEngine.Instance;
    }

    public GetContextUser(): UserInfo | null {
        return this.contextUser;
    }

    /** @deprecated Use {@link GetContextUser}. */
    public getContextUser(): UserInfo | null {
        return this.GetContextUser();
    }

    /**
     * Implemented abstract method from the AutotagBase class. that runs the entire autotagging process. This method is the entry point for the autotagging process.
     * It initializes the connection, retrieves the content sources corresponding to the content source type, sets the content items that we want to process, 
     * extracts and processes the text, and sets the results in the database.
     */
    public async Autotag(contextUser: UserInfo, onProgress?: AutotagProgressCallback, contentSourceIDs?: string[], provider?: IMetadataProvider): Promise<number> {
        if (provider) this._provider = provider;
        this.contextUser = contextUser;
        this.contentSourceTypeID = this.engine.SetSubclassContentSourceType('Local File System');
        const contentSources: MJContentSourceEntity[] = await this.engine.getAllContentSources(this.contextUser, this.contentSourceTypeID) || [];
        const contentItemsToProcess: MJContentItemEntity[] = await this.SetContentItemsToProcess(contentSources)
        await this.engine.ExtractTextAndProcessWithLLM(contentItemsToProcess, this.contextUser, undefined, undefined, onProgress);
        return contentItemsToProcess.length;
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
            // First check that the directory exists
            if (fs.existsSync(contentSource.URL)) {
                const contentSourceParams = await this.SetContentSourceParams(contentSource);
                const lastRunDate: Date = await this.engine.getContentSourceLastRunDate(contentSourceParams.contentSourceID, this.contextUser)

                // Traverse through all the files in the directory
                if (lastRunDate) {
                const contentItems = await this.SetNewAndModifiedContentItems(contentSourceParams, lastRunDate, this.contextUser);
                    if (contentItems && contentItems.length > 0) {
                        contentItemsToProcess.push(...contentItems);
                    }
                    else {
                        // No content items found to process
                        console.log(`No content items found to process for content source: ${contentSource.Name}`);
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

    public async SetContentSourceParams(contentSource: MJContentSourceEntity) { 
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

    /** @deprecated Use {@link SetContentSourceParams}. */
    public async setContentSourceParams(contentSource: MJContentSourceEntity) {
        return this.SetContentSourceParams(contentSource);
    }

    /**
     * Given a content source and last run date, recursively traverse through the directory and return a 
     * list of content source items that have been modified or added after the last run date.
     * @param contentSource 
     * @param lastRunDate 
     * @param contextUser 
     * @returns 
     */
    public async SetNewAndModifiedContentItems(contentSourceParams: ContentSourceParams, lastRunDate: Date, contextUser: UserInfo): Promise<MJContentItemEntity[]> {
        const contentItems: MJContentItemEntity[] = []

        for await (const { Path: filePath, Stats: stats } of this.walk(contentSourceParams.URL)) {
            // Each file is its own content item, so the params carry that file's path, not the directory's.
            const params: ContentSourceParams = { ...contentSourceParams, URL: filePath };
            const touched = [stats.ctime, stats.mtime].some((d) => new Date(d.toUTCString()) > lastRunDate);
            if (!touched) {
                continue;
            }
            // Added-vs-modified by whether the row exists: ctime moves on every write, so it cannot say.
            if (await this.hasContentItem(params, contextUser)) {
                contentItems.push(await this.SetModifiedContentItem(filePath, params));
            } else {
                contentItems.push(await this.SetAddedContentItem(filePath, params));
            }
        }
        return contentItems;
    }

    /** Walk the directory for the pipeline, skipping files older than `request.Since` when provided. */
    public async *Discover(request: DiscoverRequest): AsyncIterable<DiscoveredItem> {
        if (!request.URL || !fs.existsSync(request.URL)) {
            throw new Error(`Local File System source path '${request.URL}' does not exist`);
        }
        for await (const { Path: filePath, Stats: stats } of this.walk(request.URL, request.Signal)) {
            if (request.Since && stats.mtime <= request.Since && stats.ctime <= request.Since) {
                continue;
            }
            const extension = path.extname(filePath).slice(1).toLowerCase();
            yield {
                URL: filePath,
                Fields: [
                    { Field: 'Title', Value: path.basename(filePath), Confidence: ConfidenceScale.DiscoveredTitle },
                    { Field: 'Date', Value: stats.mtime, Confidence: ConfidenceScale.DiscoveredDate },
                    ...(extension ? [{ Field: 'FileType' as const, Value: extension, Confidence: ConfidenceScale.DiscoveredFileType }] : []),
                ],
            };
        }
    }

    /** Read a walked file. Confined to the source root: a locator is a row anyone with edit rights can change. */
    public async Fetch(request: LocatorFetchRequest): Promise<LocatorFetchResponse> {
        if (!request.SourceURL) {
            throw new Error('This Local File System source has no root path, so no file can be read from it');
        }
        const root = await fs.promises.realpath(request.SourceURL);
        const target = await fs.promises.realpath(path.resolve(root, request.URL));
        const relative = path.relative(root, target);
        if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
            throw new Error(`'${request.URL}' is outside the source's root '${request.SourceURL}'`);
        }
        return { Content: new Uint8Array(await fs.promises.readFile(target)), ResolvedURL: target };
    }

    /** Every regular file under a directory, recursively, skipping symlinks and stopping when the signal fires. */
    private async *walk(directory: string, signal?: AbortSignal): AsyncIterable<{ Path: string; Stats: fs.Stats }> {
        for (const entry of fs.readdirSync(directory)) {
            if (signal?.aborted) {
                return;
            }
            const full = path.join(directory, entry);
            const stats = fs.lstatSync(full);
            if (stats.isDirectory()) {
                yield* this.walk(full, signal);
            } else if (stats.isFile()) {
                yield { Path: full, Stats: stats };
            }
        }
    }

    /** Whether this source already has a content item for this file. */
    private async hasContentItem(params: ContentSourceParams, contextUser: UserInfo): Promise<boolean> {
        const result = await RunView.FromMetadataProvider(this.ProviderToUse).RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: FieldValueCollection.FromObject({
                    ContentSourceID: params.contentSourceID,
                    URL: params.URL,
                }).ToWhereClause(),
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser,
        );
        return result.Success && result.Results.length > 0;
    }

    public async SetAddedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<MJContentItemEntity> { 
        const md = this.ProviderToUse;
        const text = await this.engine.parseFileFromPath(filePath);
        const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
        contentItem.NewRecord();
        contentItem.ContentSourceID = contentSourceParams.contentSourceID
        contentItem.Name = contentSourceParams.name
        contentItem.Description = this.engine.GetContentItemDescription(contentSourceParams)
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

    /** @deprecated Use {@link SetAddedContentItem}. */
    public async setAddedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<MJContentItemEntity> {
        return this.SetAddedContentItem(filePath, contentSourceParams);
    }

    public async SetModifiedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<MJContentItemEntity> {
        const md = this.ProviderToUse;
        const contentItem = await md.GetEntityObject<MJContentItemEntity>('MJ: Content Items', this.contextUser);
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

    /** @deprecated Use {@link SetModifiedContentItem}. */
    public async setModifiedContentItem(filePath: string, contentSourceParams: ContentSourceParams): Promise<MJContentItemEntity> {
        return this.SetModifiedContentItem(filePath, contentSourceParams);
    }
}