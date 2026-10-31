/**
 * @fileoverview {@link ContentUploadIngestor} — server-side entry point for pushing an uploaded
 * `MJ: Files` record into an `Upload` content source (`MJ: Content Items`), optionally linking an
 * origin entity record via `MJ: Entity Record Documents` and running the pipeline stages for that
 * single item on demand.
 *
 * @module @memberjunction/content-pipeline
 */

import { CompositeKey, EntityInfo, IMetadataProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    KnowledgeHubMetadataEngine,
    MJContentItemChunkEntity,
    MJContentItemEntity,
    MJContentSourceEntity,
    MJEntityDocumentEntity,
    MJEntityRecordDocumentEntity,
} from '@memberjunction/core-entities';
import { ConfidenceScale, FieldConfidenceMap } from '@memberjunction/content-pipeline-base';
import { ContentVectorInfrastructure } from '@memberjunction/content-autotagging';
import { UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
import { ContentPipelineDeleteMarker } from './ContentPipelineDeleteMarker.js';
import { ContentSourceConfigurationResolver } from './ContentSourceConfigurationResolver.js';
import { WhereAnyOf, WhereEqual } from './Filters.js';
import { IsCallerOwnedUploadURL, IsUploadItemURL, UPLOAD_URL_PREFIX, UploadItemURL } from './UploadLocator.js';
import { ResolveSourceDriver } from './stages/DiscoverStage.js';

export { IsCallerOwnedUploadURL, IsUploadItemURL, UPLOAD_URL_PREFIX, UploadItemURL } from './UploadLocator.js';

/** Shipped Record Process ID for `Content Pipeline — Extract`. */
export const CONTENT_PIPELINE_EXTRACT_PROCESS_ID = '95A91363-74BB-4532-A109-4E6F45EEC100';
/** Shipped Record Process ID for `Content Pipeline — Tag`. */
export const CONTENT_PIPELINE_TAG_PROCESS_ID = '60BE8612-B278-4C06-A06C-CF9365D9C1B2';
/** Shipped Record Process ID for `Content Pipeline — Segment`. */
export const CONTENT_PIPELINE_SEGMENT_PROCESS_ID = '88F8296E-6300-4938-817C-E3FF2D85DE4E';
/** Shipped Record Process ID for `Content Pipeline — Embed`. */
export const CONTENT_PIPELINE_EMBED_PROCESS_ID = '9A90F785-8D21-403E-9810-6FFEB75FEFBD';
/** Shipped Record Process ID for `Content Pipeline — Delete` (`DeleteContentItem`). */
export const CONTENT_PIPELINE_DELETE_PROCESS_ID = '13FF9508-4BDB-4BF3-A938-AA36EDD2ED46';
/** Shipped Record Process ID for `Content Pipeline — Delete Chunks` (`Delete`). */
export const CONTENT_PIPELINE_DELETE_CHUNKS_PROCESS_ID = '3A7E3C40-89A1-4D0D-8FF1-EF7C53EAE00E';

/** Optional origin record to link an uploaded Content Item to via `MJ: Entity Record Documents`. */
export interface ContentUploadOrigin {
    /** MJ Entity name (for example `'MJ: Collaboration Space Items'`). */
    EntityName: string;
    /** Primary key value or `Field|Value` segment of the origin entity record. */
    RecordID: string;
}

/** Parameters for {@link ContentUploadIngestor.Ingest}. */
export interface ContentUploadIngestRequest {
    /** Target `MJ: Content Sources` record ID (must use a push-only driver). */
    ContentSourceID: string;
    /** Uploaded `MJ: Files` record ID. */
    FileID: string;
    /** Display name / filename for the `MJ: Content Items` row. */
    Name: string;
    /** Optional description for the `MJ: Content Items` row. */
    Description?: string | null;
    /**
     * Optional origin entity record. When provided, resolves or creates the `MJ: Entity Record Documents`
     * row using `CompositeKey.ToCompactURLSegment()` (matching `AutotagEntity`) so `SearchEngine` promotes
     * search hits and enforces row-level permissions on the origin entity. When omitted, `EntityRecordDocumentID`
     * is `null`.
     */
    Origin?: ContentUploadOrigin | null;
    /**
     * When true, runs `Extract`, `Segment`, `Tag`, and `Embed` immediately for this item through
     * `RecordProcessExecutor` with a `records` scope.
     * Stage failures are logged and leave the item `Failed` without throwing past the caller.
     */
    RunNow?: boolean;
    /** Server-side user context. */
    ContextUser: UserInfo;
    /** Optional metadata provider override; defaults to `Metadata.Provider`. */
    Provider?: IMetadataProvider;
}

/** Result returned by {@link ContentUploadIngestor.Ingest}. */
export interface ContentUploadIngestResult {
    /** The new or existing `MJ: Content Items` record ID. */
    ContentItemID: string;
    /** True when a new `MJ: Content Items` row was created; false when an existing row was reused or revived. */
    Created: boolean;
    /** Linked `MJ: Entity Record Documents` record ID when `Origin` was provided, else `null`. */
    EntityRecordDocumentID: string | null;
}

/** Parameters for {@link ContentUploadIngestor.Remove}. At least one of `ContentItemID` or `FileID` is required. */
export interface ContentUploadRemoveRequest {
    /** Specific `MJ: Content Items` record ID to remove. */
    ContentItemID?: string;
    /** Uploaded `MJ: Files` record ID whose `MJ: Content Items` row(s) should be removed. */
    FileID?: string;
    /** Optional `MJ: Content Sources` filter when removing by `FileID` or `ContentItemID`. */
    ContentSourceID?: string;
    /**
     * When true, runs `Content Pipeline — Delete` (`DeleteContentItem`) and `Content Pipeline — Delete Chunks`
     * (`Delete`) immediately for the marked item(s), all their descendants, and all their chunks.
     * Never deletes the caller's `MJ: Files` row or storage object.
     */
    RunNow?: boolean;
    /** Server-side user context. */
    ContextUser: UserInfo;
    /** Optional metadata provider override; defaults to `Metadata.Provider`. */
    Provider?: IMetadataProvider;
}

/** Result returned by {@link ContentUploadIngestor.Remove}. */
export interface ContentUploadRemoveResult {
    /** `MJ: Content Items` record IDs marked for deletion (root items and any descendants). */
    ContentItemIDs: string[];
    /** Number of dependent chunks and descendant items marked for deletion. */
    DependentsMarked: number;
    /** `MJ: Content Items` record IDs that were not removed when `RunNow` failed. */
    FailedItemIDs?: string[];
    /** `MJ: Content Item Chunks` record IDs that were not removed when `RunNow` failed. */
    FailedChunkIDs?: string[];
}

interface ContentSourceSummary {
    ID: string;
    ContentTypeID: string;
    ContentSourceTypeID: string;
    ContentFileTypeID: string;
    EntityDocumentID: string | null;
    VectorIndexID: string | null;
}

interface ExistingContentItemSummary {
    ID: string;
    EntityRecordDocumentID: string | null;
    DeleteStatus: MJContentItemEntity['DeleteStatus'];
}

interface RemoveTargetRoot {
    ID: string;
    URL: string | null;
    FileID: string | null;
}

interface ContentItemStageRow {
    ID: string;
    ExtractionStatus: MJContentItemEntity['ExtractionStatus'];
    SegmentationStatus: MJContentItemEntity['SegmentationStatus'];
    TaggingStatus: MJContentItemEntity['TaggingStatus'];
    EmbeddingStatus?: MJContentItemEntity['EmbeddingStatus'];
    DeleteStatus: MJContentItemEntity['DeleteStatus'];
}

interface ChunkStageRow {
    ID: string;
    ContentItemID: string;
    EmbeddingStatus?: MJContentItemChunkEntity['EmbeddingStatus'];
    DeleteStatus: MJContentItemChunkEntity['DeleteStatus'];
}

type ItemFailureStatusField = 'ExtractionStatus' | 'TaggingStatus' | 'SegmentationStatus';

/**
 * Ingests and removes uploaded files in the Content Pipeline.
 */
export class ContentUploadIngestor {
    constructor(
        private readonly provider?: IMetadataProvider,
        private readonly contextUser?: UserInfo,
    ) {}

    /** Convenience static entry point for {@link Ingest}. */
    public static async Ingest(request: ContentUploadIngestRequest): Promise<ContentUploadIngestResult> {
        return new ContentUploadIngestor(request.Provider, request.ContextUser).Ingest(request);
    }

    /** Convenience static entry point for {@link Remove}. */
    public static async Remove(request: ContentUploadRemoveRequest): Promise<ContentUploadRemoveResult> {
        return new ContentUploadIngestor(request.Provider, request.ContextUser).Remove(request);
    }

    /**
     * Create (or return/revive existing) `MJ: Content Items` row for `FileID` under `ContentSourceID`.
     * Refuses sources whose driver is not push-only (`IsPushOnly !== true`).
     */
    public async Ingest(request: ContentUploadIngestRequest): Promise<ContentUploadIngestResult> {
        const provider = request.Provider ?? this.provider ?? Metadata.Provider;
        const contextUser = request.ContextUser ?? this.contextUser;
        if (!contextUser) {
            throw new Error('ContentUploadIngestor.Ingest requires a ContextUser');
        }

        const source = await this.loadAndValidatePushOnlySource(request.ContentSourceID, provider, contextUser);
        const existing = await this.findExistingContentItem(source.ID, request.FileID, provider, contextUser);
        if (existing) {
            return this.handleExistingContentItem(existing, source, request, provider, contextUser);
        }

        const entityRecordDocumentID = request.Origin
            ? await this.findOrCreateEntityRecordDocument(source, request.Origin, provider, contextUser)
            : null;

        const item = await this.createPendingContentItem(source, request, entityRecordDocumentID, provider, contextUser);
        if (request.RunNow) {
            await this.runStagesNow(item.ID, contextUser, provider);
        }

        return {
            ContentItemID: item.ID,
            Created: true,
            EntityRecordDocumentID: entityRecordDocumentID,
        };
    }

    /**
     * Mark an uploaded `MJ: Content Items` row, all its descendants, and all their chunks for deletion,
     * detaching the caller's `FileID` on each root `upload://<FileID>` item immediately and optionally
     * running `DeleteContentItem` and `Delete` right away.
     */
    public async Remove(request: ContentUploadRemoveRequest): Promise<ContentUploadRemoveResult> {
        const provider = request.Provider ?? this.provider ?? Metadata.Provider;
        const contextUser = request.ContextUser ?? this.contextUser;
        if (!contextUser) {
            throw new Error('ContentUploadIngestor.Remove requires a ContextUser');
        }
        if (!request.ContentItemID && !request.FileID) {
            throw new Error('ContentUploadIngestor.Remove requires either ContentItemID or FileID');
        }

        const rootTargets = await this.resolveRemoveTargetIDs(request, provider, contextUser);
        if (rootTargets.length === 0) {
            return { ContentItemIDs: [], DependentsMarked: 0 };
        }

        const rootItemIDs = rootTargets.map((r) => r.ID);
        const descendantIDs = await this.collectDescendantItemIDs(rootItemIDs, provider, contextUser);
        const allItemIDs = this.deduplicateIDs([...rootItemIDs, ...descendantIDs]);
        const dependentsMarked = await this.markItemsAndChunksForDeletion(
            rootTargets,
            descendantIDs,
            allItemIDs,
            provider,
            contextUser,
        );

        const result: ContentUploadRemoveResult = {
            ContentItemIDs: allItemIDs,
            DependentsMarked: dependentsMarked,
        };
        if (request.RunNow) {
            const failures = await this.runDeleteNow(allItemIDs, contextUser, provider);
            if (failures.FailedItemIDs.length > 0) {
                result.FailedItemIDs = failures.FailedItemIDs;
            }
            if (failures.FailedChunkIDs.length > 0) {
                result.FailedChunkIDs = failures.FailedChunkIDs;
            }
        }
        return result;
    }

    private async handleExistingContentItem(
        existing: ExistingContentItemSummary,
        source: ContentSourceSummary,
        request: ContentUploadIngestRequest,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<ContentUploadIngestResult> {
        const desiredERD = request.Origin
            ? await this.findOrCreateEntityRecordDocument(source, request.Origin, provider, contextUser)
            : request.Origin === null
              ? null
              : (existing.EntityRecordDocumentID ?? null);
        const wasPendingDelete = existing.DeleteStatus === 'Pending';
        const originChanged = !UUIDsEqual(existing.EntityRecordDocumentID, desiredERD);

        if (wasPendingDelete || originChanged) {
            await this.updateExistingContentItem(
                existing.ID,
                request,
                wasPendingDelete,
                originChanged,
                desiredERD,
                provider,
                contextUser,
            );
        }
        if (request.RunNow) {
            await this.prepareExistingTreeForRetry(existing.ID, provider, contextUser);
            await this.runStagesNow(existing.ID, contextUser, provider);
        }
        return {
            ContentItemID: existing.ID,
            Created: false,
            EntityRecordDocumentID: desiredERD,
        };
    }

    private async updateExistingContentItem(
        itemID: string,
        request: ContentUploadIngestRequest,
        reviveFromPendingDelete: boolean,
        updateOrigin: boolean,
        entityRecordDocumentID: string | null,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<void> {
        const item = await provider.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
        if (!(await item.InnerLoad(CompositeKey.FromID(itemID)))) { // first-pk-ok: MJ core content entity, single-column ID
            throw new Error(`Could not load existing Content Item '${itemID}'`);
        }
        if (reviveFromPendingDelete) {
            // ponytail: a Delete run that hydrated this item before the revive commits 'Deleted' over it afterwards
            // (WorkingRecordCommitter.Commit does not re-read); a re-read or concurrency check in Commit closes it.
            item.DeleteStatus = null;
            item.FileID = request.FileID;
            item.Name = request.Name;
            if (request.Description !== undefined) {
                item.Description = request.Description;
            }
            item.ExtractionStatus = 'Pending';
            item.SegmentationStatus = 'Pending';
            item.TaggingStatus = 'Pending';
            item.EmbeddingStatus = 'Pending';
            item.FieldConfidence = this.callerTitleFieldConfidence();
        }
        if (updateOrigin) {
            item.EntityRecordDocumentID = entityRecordDocumentID;
        }
        if (!(await item.Save())) {
            throw new Error(
                `Failed to update existing Content Item '${itemID}': ${item.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    private async createPendingContentItem(
        source: ContentSourceSummary,
        request: ContentUploadIngestRequest,
        entityRecordDocumentID: string | null,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<MJContentItemEntity> {
        const item = await provider.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
        item.NewRecord();
        item.ContentSourceID = source.ID;
        item.ContentTypeID = source.ContentTypeID;
        item.ContentSourceTypeID = source.ContentSourceTypeID;
        item.ContentFileTypeID = source.ContentFileTypeID;
        item.FileID = request.FileID;
        item.URL = UploadItemURL(request.FileID);
        item.Name = request.Name;
        if (request.Description !== undefined) {
            item.Description = request.Description;
        }
        item.FieldConfidence = this.callerTitleFieldConfidence();
        item.EntityRecordDocumentID = entityRecordDocumentID;
        item.ExtractionStatus = 'Pending';
        item.TaggingStatus = 'Pending';
        item.SegmentationStatus = 'Pending';
        item.EmbeddingStatus = 'Pending';

        if (!(await item.Save())) {
            throw new Error(
                `Failed to save Content Item for FileID '${request.FileID}' under ContentSource '${request.ContentSourceID}': ${item.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return item;
    }

    private callerTitleFieldConfidence(): string {
        const confidence: FieldConfidenceMap = {
            Title: { Score: ConfidenceScale.CallerTitle, SetBy: 'Upload' },
        };
        return JSON.stringify(confidence);
    }

    /**
     * Match an existing Content Item for `(ContentSourceID, URL = UploadItemURL(FileID))`: first live
     * (`DeleteStatus IS NULL`), then pending deletion (`DeleteStatus = 'Pending'`, so an item re-ingested
     * before Delete runs is revived rather than duplicated), matching `WorkingRecordCommitter.matchExisting`.
     */
    // ponytail: no unique constraint backs (ContentSourceID, URL), so two concurrent first Ingests of the same file can both insert.
    private async findExistingContentItem(
        contentSourceID: string,
        fileID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<ExistingContentItemSummary | null> {
        const live = await this.queryExistingContentItem(contentSourceID, fileID, null, provider, contextUser);
        if (live) {
            return live;
        }
        return this.queryExistingContentItem(contentSourceID, fileID, 'Pending', provider, contextUser);
    }

    private async queryExistingContentItem(
        contentSourceID: string,
        fileID: string,
        deleteStatus: MJContentItemEntity['DeleteStatus'],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<ExistingContentItemSummary | null> {
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<ExistingContentItemSummary>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: WhereEqual({
                    ContentSourceID: contentSourceID,
                    URL: UploadItemURL(fileID),
                    DeleteStatus: deleteStatus,
                }),
                Fields: ['ID', 'EntityRecordDocumentID', 'DeleteStatus'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser,
        );
        if (!result.Success) {
            throw new Error(`Could not query existing Content Items for FileID '${fileID}': ${result.ErrorMessage}`);
        }
        return result.Results[0] ?? null;
    }

    private async loadAndValidatePushOnlySource(
        contentSourceID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<ContentSourceSummary> {
        const source = await this.loadContentSource(contentSourceID, provider, contextUser);
        const resolved = await new ContentSourceConfigurationResolver(provider, contextUser).Resolve(contentSourceID, contextUser);
        if (!resolved.DriverClass) {
            throw new Error(
                `Content Source '${contentSourceID}' has no DriverClass configured on Content Source Type '${source.ContentSourceTypeID}'; ContentUploadIngestor.Ingest requires a push-only source`,
            );
        }
        const driver = ResolveSourceDriver(resolved.DriverClass);
        if (!driver || driver.IsPushOnly !== true) {
            throw new Error(
                `Content Source '${contentSourceID}' uses driver '${resolved.DriverClass}', which is not push-only; ContentUploadIngestor.Ingest only accepts push-only upload sources`,
            );
        }
        return source;
    }

    private async loadContentSource(
        contentSourceID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<ContentSourceSummary> {
        const kh = KnowledgeHubMetadataEngine.Instance;
        await kh.Config(false, contextUser, provider);
        const cached = kh.GetContentSourceByID(contentSourceID);
        if (cached) {
            return {
                ID: cached.ID,
                ContentTypeID: cached.ContentTypeID,
                ContentSourceTypeID: cached.ContentSourceTypeID,
                ContentFileTypeID: cached.ContentFileTypeID,
                EntityDocumentID: cached.EntityDocumentID ?? null,
                VectorIndexID: cached.VectorIndexID ?? null,
            };
        }

        const source = await provider.GetEntityObject<MJContentSourceEntity>('MJ: Content Sources', contextUser);
        if (!(await source.InnerLoad(CompositeKey.FromID(contentSourceID)))) { // first-pk-ok: MJ core content entity, single-column ID
            throw new Error(`Content Source '${contentSourceID}' could not be found`);
        }
        return {
            ID: source.ID,
            ContentTypeID: source.ContentTypeID,
            ContentSourceTypeID: source.ContentSourceTypeID,
            ContentFileTypeID: source.ContentFileTypeID,
            EntityDocumentID: source.EntityDocumentID ?? null,
            VectorIndexID: source.VectorIndexID ?? null,
        };
    }

    private async findOrCreateEntityRecordDocument(
        source: ContentSourceSummary,
        origin: ContentUploadOrigin,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<string> {
        const entityInfo = provider.EntityByName(origin.EntityName);
        if (!entityInfo) {
            throw new Error(`Origin entity '${origin.EntityName}' was not found in metadata`);
        }
        if (!source.EntityDocumentID) {
            throw new Error(`Content Source '${source.ID}' has no EntityDocumentID configured; cannot link Origin '${origin.EntityName}'`);
        }
        await this.validateEntityDocumentMatchesOrigin(source, entityInfo, origin, provider, contextUser);

        const ck = CompositeKey.FromURLSegment(entityInfo, origin.RecordID);
        const compactRecordID = ck.ToCompactURLSegment();
        const fullRecordID = ck.ToRecordID();
        const candidateRecordIDs = compactRecordID === fullRecordID ? [compactRecordID] : [compactRecordID, fullRecordID];

        const existingID = await this.findExistingEntityRecordDocumentID(
            entityInfo.ID,
            source.EntityDocumentID,
            candidateRecordIDs,
            provider,
            contextUser,
        );
        if (existingID) {
            return existingID;
        }

        return this.createEntityRecordDocument(source, entityInfo, origin, compactRecordID, provider, contextUser);
    }

    private async validateEntityDocumentMatchesOrigin(
        source: ContentSourceSummary,
        entityInfo: EntityInfo,
        origin: ContentUploadOrigin,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<void> {
        if (!source.EntityDocumentID) {
            return;
        }
        const kh = KnowledgeHubMetadataEngine.Instance;
        const cachedDoc = kh.GetEntityDocumentByID(source.EntityDocumentID);
        let docEntityID: string | null = cachedDoc?.EntityID ?? null;
        if (!docEntityID) {
            const entityDoc = await provider.GetEntityObject<MJEntityDocumentEntity>('MJ: Entity Documents', contextUser);
            if (await entityDoc.InnerLoad(CompositeKey.FromID(source.EntityDocumentID))) { // first-pk-ok: single PK ID
                docEntityID = entityDoc.EntityID;
            }
        }
        // Fails closed: an origin link is only written when the Entity Document is known to be for the origin's entity.
        if (!docEntityID) {
            throw new Error(
                `Content Source '${source.ID}' names EntityDocumentID '${source.EntityDocumentID}', which could not be loaded; cannot link Origin '${origin.EntityName}'`,
            );
        }
        if (!UUIDsEqual(docEntityID, entityInfo.ID)) {
            throw new Error(
                `Content Source '${source.ID}' has EntityDocumentID '${source.EntityDocumentID}' for EntityID '${docEntityID}', which does not match Origin entity '${origin.EntityName}' ('${entityInfo.ID}')`,
            );
        }
    }

    private async findExistingEntityRecordDocumentID(
        entityID: string,
        entityDocumentID: string,
        candidateRecordIDs: readonly string[],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<string | null> {
        const rv = RunView.FromMetadataProvider(provider);
        const existing = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Entity Record Documents',
                ExtraFilter: `(${WhereEqual({ EntityID: entityID, EntityDocumentID: entityDocumentID })}) AND (${WhereAnyOf('RecordID', candidateRecordIDs)})`,
                Fields: ['ID'],
                MaxRows: 1,
                ResultType: 'simple',
                BypassCache: true,
            },
            contextUser,
        );
        if (!existing.Success) {
            throw new Error(`Could not query MJ: Entity Record Documents for '${candidateRecordIDs[0]}': ${existing.ErrorMessage}`);
        }
        return existing.Results[0]?.ID ?? null;
    }

    private async createEntityRecordDocument(
        source: ContentSourceSummary,
        entityInfo: EntityInfo,
        origin: ContentUploadOrigin,
        compactRecordID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<string> {
        const vectorIndexID = await new ContentVectorInfrastructure(provider, contextUser).ResolveVectorIndexID(source);
        if (!vectorIndexID) {
            throw new Error(
                `Cannot create MJ: Entity Record Documents for Content Source '${source.ID}' because no VectorIndexID could be resolved. Configure VectorIndexID on the Content Source or its Content Type, or set ContentPipeline.DefaultVectorIndexID in mj.config.cjs.`,
            );
        }
        const erd = await provider.GetEntityObject<MJEntityRecordDocumentEntity>('MJ: Entity Record Documents', contextUser);
        erd.NewRecord();
        erd.EntityID = entityInfo.ID;
        erd.RecordID = compactRecordID;
        erd.EntityDocumentID = source.EntityDocumentID!;
        erd.VectorIndexID = vectorIndexID;
        erd.EntityRecordUpdatedAt = new Date();
        if (!(await erd.Save())) {
            throw new Error(
                `Failed to save MJ: Entity Record Documents row for '${origin.EntityName}' (${compactRecordID}): ${erd.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
        return erd.ID;
    }

    /**
     * Reset any failed stage status on an existing item tree and its chunks back to `'Pending'`
     * so `RunNow` retries any stage that has not reached `'Complete'`.
     */
    private async prepareExistingTreeForRetry(
        rootItemID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<void> {
        const treeItems = await this.collectLiveTreeItems(rootItemID, provider, contextUser);
        for (const row of treeItems) {
            await this.resetIncompleteItemStages(row, provider, contextUser);
        }
        const itemIDs = treeItems.map((r) => r.ID);
        if (itemIDs.length === 0) {
            return;
        }
        const chunks = await this.collectLiveChunks(itemIDs, provider, contextUser);
        for (const chunk of chunks) {
            if (chunk.EmbeddingStatus === 'Failed') {
                const chunkEntity = await provider.GetEntityObject<MJContentItemChunkEntity>('MJ: Content Item Chunks', contextUser);
                if (await chunkEntity.InnerLoad(CompositeKey.FromID(chunk.ID))) { // first-pk-ok: single PK ID
                    chunkEntity.EmbeddingStatus = 'Pending';
                    if (!(await chunkEntity.Save())) {
                        throw new Error(
                            `Failed to reset chunk '${chunk.ID}' EmbeddingStatus to Pending: ${chunkEntity.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                        );
                    }
                }
            }
        }
    }

    private async resetIncompleteItemStages(
        row: ContentItemStageRow,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<void> {
        const needsExtract = this.isRetryableStatus(row.ExtractionStatus);
        const needsSegment = this.isRetryableStatus(row.SegmentationStatus);
        const needsTag = this.isRetryableStatus(row.TaggingStatus);
        const needsEmbed = this.isRetryableStatus(row.EmbeddingStatus ?? null);
        if (!needsExtract && !needsSegment && !needsTag && !needsEmbed) {
            return;
        }
        const item = await provider.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
        if (!(await item.InnerLoad(CompositeKey.FromID(row.ID)))) { // first-pk-ok: single PK ID
            return;
        }
        if (needsExtract) {
            item.ExtractionStatus = 'Pending';
        }
        if (needsSegment) {
            item.SegmentationStatus = 'Pending';
        }
        if (needsTag) {
            item.TaggingStatus = 'Pending';
        }
        if (needsEmbed) {
            item.EmbeddingStatus = 'Pending';
        }
        if (!(await item.Save())) {
            throw new Error(
                `Failed to reset incomplete stages on Content Item '${row.ID}': ${item.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    private isRetryableStatus(status: string | null | undefined): boolean {
        // Only 'Failed': resetting 'Processing' could start a second run beside one still in flight.
        return status === 'Failed';
    }

    private isStagePending(status: string | null | undefined): boolean {
        return status === null || status === undefined || status === 'Pending';
    }

    /** Extract → Segment → Tag → Embed over the root's live tree; a stage failure stops only what depends on it. */
    private async runStagesNow(
        rootItemID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        const extractedItems = await this.runExtractNow(rootItemID, contextUser, provider);
        if (extractedItems.length === 0) {
            return;
        }
        const { segmentIDs, segmentBatchSucceeded } = await this.runSegmentAndTagNow(extractedItems, contextUser, provider);
        const completedSegmentItems = await this.resolveCompletedSegmentItems(
            rootItemID,
            extractedItems,
            segmentIDs,
            segmentBatchSucceeded,
            contextUser,
            provider,
        );
        if (completedSegmentItems.length === 0) {
            return;
        }

        await this.runEmbedStage(
            completedSegmentItems.map((i) => i.ID),
            contextUser,
            provider,
        );
    }

    /** Runs Extract on the tree's Pending items and returns the items whose extraction completed. */
    private async runExtractNow(
        rootItemID: string,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<ContentItemStageRow[]> {
        const preExtractItems = await this.collectLiveTreeItems(rootItemID, provider, contextUser);
        const extractIDs = preExtractItems.filter((i) => this.isStagePending(i.ExtractionStatus)).map((i) => i.ID);
        let extractBatchSucceeded = false;
        if (extractIDs.length > 0) {
            extractBatchSucceeded = await this.executeProcessStage(
                CONTENT_PIPELINE_EXTRACT_PROCESS_ID,
                'Extract',
                extractIDs,
                'ExtractionStatus',
                contextUser,
                provider,
            );
        }
        const postExtractItems = await this.collectLiveTreeItems(rootItemID, provider, contextUser);
        return this.filterCompletedExtractItems(postExtractItems, extractBatchSucceeded);
    }

    /** Runs Segment, then Tag (before Embed, so the vectors carry the tags), on the extracted items. */
    private async runSegmentAndTagNow(
        extractedItems: readonly ContentItemStageRow[],
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<{ segmentIDs: string[]; segmentBatchSucceeded: boolean }> {
        const segmentIDs = extractedItems.filter((i) => this.isStagePending(i.SegmentationStatus)).map((i) => i.ID);
        let segmentBatchSucceeded = false;
        if (segmentIDs.length > 0) {
            segmentBatchSucceeded = await this.executeProcessStage(
                CONTENT_PIPELINE_SEGMENT_PROCESS_ID,
                'Segment',
                segmentIDs,
                'SegmentationStatus',
                contextUser,
                provider,
            );
        }
        const tagIDs = extractedItems.filter((i) => this.isStagePending(i.TaggingStatus)).map((i) => i.ID);
        if (tagIDs.length > 0) {
            await this.executeProcessStage(
                CONTENT_PIPELINE_TAG_PROCESS_ID,
                'Tag',
                tagIDs,
                'TaggingStatus',
                contextUser,
                provider,
            );
        }
        return { segmentIDs, segmentBatchSucceeded };
    }

    private filterCompletedExtractItems(
        items: readonly ContentItemStageRow[],
        extractBatchSucceeded: boolean,
    ): ContentItemStageRow[] {
        return items.filter((item) => {
            if (item.ExtractionStatus === 'Complete') {
                return true;
            }
            if (item.ExtractionStatus === 'Failed' || item.ExtractionStatus === 'Skipped') {
                return false;
            }
            return extractBatchSucceeded;
        });
    }

    private async resolveCompletedSegmentItems(
        rootItemID: string,
        extractedItems: readonly ContentItemStageRow[],
        segmentIDs: readonly string[],
        segmentBatchSucceeded: boolean,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<ContentItemStageRow[]> {
        const postSegmentItems = await this.collectLiveTreeItems(rootItemID, provider, contextUser);
        const extractedSet = new UUIDSet(extractedItems.map((i) => i.ID));
        const segmentBatchSet = new UUIDSet(segmentIDs);
        return postSegmentItems.filter((item) => {
            if (!extractedSet.Has(item.ID)) {
                return false;
            }
            if (item.SegmentationStatus === 'Complete') {
                return true;
            }
            if (item.SegmentationStatus === 'Failed' || item.SegmentationStatus === 'Skipped') {
                return false;
            }
            return segmentBatchSet.Has(item.ID) && segmentBatchSucceeded;
        });
    }

    private async runEmbedStage(
        completedSegmentItemIDs: readonly string[],
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<void> {
        const chunkIDs = await this.collectPendingEmbedChunkIDs(completedSegmentItemIDs, provider, contextUser);
        if (chunkIDs.length === 0) {
            return;
        }
        await this.executeProcessStage(
            CONTENT_PIPELINE_EMBED_PROCESS_ID,
            'Embed',
            chunkIDs,
            null,
            contextUser,
            provider,
        );
    }

    /**
     * Run one shipped Record Process over an explicit `records` scope. Returns `true` when the batch
     * completed with zero failed records; logs and returns `false` on any failed records or thrown error.
     */
    private async executeProcessStage(
        processID: string,
        stageName: string,
        recordIDs: readonly string[],
        itemStatusFieldOnThrow: ItemFailureStatusField | null,
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<boolean> {
        if (recordIDs.length === 0) {
            return true;
        }
        try {
            const runResult = await new RecordProcessExecutor().RunByID(processID, {
                ContextUser: contextUser,
                Provider: provider,
                Scope: {
                    Kind: 'records',
                    RecordIDs: [...recordIDs],
                },
                TriggeredBy: 'OnDemand',
            });
            if (runResult.Status === 'Failed' || runResult.Error > 0) {
                LogError(
                    `ContentUploadIngestor: ${stageName} failed for record(s) [${recordIDs.join(', ')}] (ProcessRunID=${runResult.ProcessRunID ?? ''}, Failed=${runResult.Error})`,
                );
                return false;
            }
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`ContentUploadIngestor: ${stageName} threw for record(s) [${recordIDs.join(', ')}]: ${message}`);
            if (itemStatusFieldOnThrow) {
                await this.markItemsFailed(recordIDs, itemStatusFieldOnThrow, provider, contextUser);
            }
            return false;
        }
    }

    private async markItemsFailed(
        itemIDs: readonly string[],
        statusField: ItemFailureStatusField,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<void> {
        for (const itemID of itemIDs) {
            const item = await provider.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
            if (await item.InnerLoad(CompositeKey.FromID(itemID))) { // first-pk-ok: MJ core content entity, single-column ID
                this.setItemFailedStatus(item, statusField);
                if (!(await item.Save())) {
                    throw new Error(
                        `Failed to mark Content Item '${itemID}' ${statusField} as Failed: ${item.LatestResult?.CompleteMessage ?? 'unknown error'}`,
                    );
                }
            }
        }
    }

    private setItemFailedStatus(item: MJContentItemEntity, statusField: ItemFailureStatusField): void {
        switch (statusField) {
            case 'ExtractionStatus':
                item.ExtractionStatus = 'Failed';
                break;
            case 'TaggingStatus':
                item.TaggingStatus = 'Failed';
                break;
            case 'SegmentationStatus':
                item.SegmentationStatus = 'Failed';
                break;
        }
    }

    /**
     * Collect the root item and every live descendant item at any depth (`RootParentID = rootItemID`
     * or `ParentID = rootItemID`).
     */
    private async collectLiveTreeItems(
        rootItemID: string,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<ContentItemStageRow[]> {
        // Throws rather than guessing statuses: an invented Pending row would re-run Extract on a Complete or Processing item.
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<ContentItemStageRow>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: `((${WhereEqual({ ID: rootItemID })}) OR (${WhereEqual({ RootParentID: rootItemID })}) OR (${WhereEqual({ ParentID: rootItemID })})) AND (${WhereEqual({ DeleteStatus: null })})`,
                Fields: ['ID', 'ExtractionStatus', 'SegmentationStatus', 'TaggingStatus', 'EmbeddingStatus', 'DeleteStatus'],
                ResultType: 'simple',
                IgnoreMaxRows: true,
            },
            contextUser,
        );
        if (!result.Success) {
            throw new Error(
                `Could not read the Content Item tree for '${rootItemID}' (the item is saved; the scheduled pipeline will process it): ${result.ErrorMessage}`,
            );
        }
        return result.Results;
    }

    private async collectLiveChunks(
        itemIDs: readonly string[],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<ChunkStageRow[]> {
        const rv = RunView.FromMetadataProvider(provider);
        const chunks = await rv.RunView<ChunkStageRow>(
            {
                EntityName: 'MJ: Content Item Chunks',
                ExtraFilter: `(${WhereAnyOf('ContentItemID', itemIDs)}) AND (${WhereEqual({ DeleteStatus: null })})`,
                Fields: ['ID', 'ContentItemID', 'EmbeddingStatus', 'DeleteStatus'],
                ResultType: 'simple',
                IgnoreMaxRows: true,
            },
            contextUser,
        );
        // Throws like collectLiveTreeItems: returning [] would silently skip Embed and the Failed-chunk reset.
        if (!chunks.Success) {
            throw new Error(`Could not read the chunks of Content Item(s) [${itemIDs.join(', ')}]: ${chunks.ErrorMessage}`);
        }
        return chunks.Results;
    }

    private async collectPendingEmbedChunkIDs(
        itemIDs: readonly string[],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<string[]> {
        const chunks = await this.collectLiveChunks(itemIDs, provider, contextUser);
        return chunks
            .filter(
                (c) =>
                    c.EmbeddingStatus === undefined ||
                    c.EmbeddingStatus === null ||
                    c.EmbeddingStatus === 'Pending' ||
                    c.EmbeddingStatus === 'MetadataOnly',
            )
            .map((c) => c.ID);
    }

    private async resolveRemoveTargetIDs(
        request: ContentUploadRemoveRequest,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<RemoveTargetRoot[]> {
        if (request.ContentItemID) {
            const item = await provider.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
            if (!(await item.InnerLoad(CompositeKey.FromID(request.ContentItemID)))) { // first-pk-ok: MJ core content entity, single-column ID
                throw new Error(`Content Item '${request.ContentItemID}' could not be found`);
            }
            if (!IsUploadItemURL(item.URL)) {
                throw new Error(
                    `Content Item '${request.ContentItemID}' has URL '${item.URL ?? ''}', which is not an upload locator (${UPLOAD_URL_PREFIX}*)`,
                );
            }
            if (item.DeleteStatus === 'Deleted') {
                throw new Error(`Content Item '${request.ContentItemID}' is already Deleted`);
            }
            if (request.ContentSourceID && !UUIDsEqual(item.ContentSourceID, request.ContentSourceID)) {
                throw new Error(
                    `Content Item '${request.ContentItemID}' belongs to Content Source '${item.ContentSourceID}', not '${request.ContentSourceID}'`,
                );
            }
            return [
                {
                    ID: item.ID,
                    URL: item.URL,
                    FileID: item.FileID ?? null,
                },
            ];
        }
        const rv = RunView.FromMetadataProvider(provider);
        const filter: Record<string, unknown> = { URL: UploadItemURL(request.FileID!) };
        if (request.ContentSourceID) {
            filter.ContentSourceID = request.ContentSourceID;
        }
        const result = await rv.RunView<{ ID: string; URL?: string | null; FileID?: string | null }>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: `(${WhereEqual(filter)}) AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
                Fields: ['ID', 'URL', 'FileID'],
                ResultType: 'simple',
                IgnoreMaxRows: true,
            },
            contextUser,
        );
        if (!result.Success) {
            throw new Error(`Could not query Content Items to remove for FileID '${request.FileID}': ${result.ErrorMessage}`);
        }
        return result.Results.map((r) => ({
            ID: r.ID,
            URL: r.URL ?? UploadItemURL(request.FileID!),
            FileID: r.FileID !== undefined ? r.FileID : request.FileID!,
        }));
    }

    private async collectDescendantItemIDs(
        rootItemIDs: readonly string[],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<string[]> {
        if (rootItemIDs.length === 0) {
            return [];
        }
        // Throws rather than returning [] so a failed lookup never leaves descendants live and searchable.
        const rv = RunView.FromMetadataProvider(provider);
        const result = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Content Items',
                ExtraFilter: `((${WhereAnyOf('RootParentID', rootItemIDs)}) OR (${WhereAnyOf('ParentID', rootItemIDs)})) AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
                Fields: ['ID'],
                ResultType: 'simple',
                IgnoreMaxRows: true,
            },
            contextUser,
        );
        if (!result.Success) {
            throw new Error(`Could not query descendants of Content Item(s) [${rootItemIDs.join(', ')}]: ${result.ErrorMessage}`);
        }
        const rootSet = new UUIDSet(rootItemIDs);
        return result.Results.map((r) => r.ID).filter((id) => !rootSet.Has(id));
    }

    private async markItemsAndChunksForDeletion(
        rootTargets: readonly RemoveTargetRoot[],
        descendantIDs: readonly string[],
        allItemIDs: readonly string[],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<number> {
        const marker = new ContentPipelineDeleteMarker(provider, contextUser);
        let dependentsMarked = 0;
        for (const root of rootTargets) {
            // Mark first: a failed mark leaves the item live WITH its file. If the detach then fails,
            // DeleteStage still only detaches (never deletes) a caller-owned file.
            if (!(await marker.MarkForDeletion('MJ: Content Items', root.ID))) {
                throw new Error(`Failed to mark Content Item '${root.ID}' for deletion`);
            }
            await this.detachCallerOwnedFileOnRoot(root, provider, contextUser);
        }
        for (const descID of descendantIDs) {
            if (await marker.MarkForDeletion('MJ: Content Items', descID)) {
                dependentsMarked += 1;
            }
        }
        const chunkIDs = await this.collectNonDeletedChunkIDs(allItemIDs, provider, contextUser);
        for (const chunkID of chunkIDs) {
            if (await marker.MarkForDeletion('MJ: Content Item Chunks', chunkID)) {
                dependentsMarked += 1;
            }
        }
        return dependentsMarked;
    }

    private async detachCallerOwnedFileOnRoot(
        root: RemoveTargetRoot,
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<void> {
        if (!root.FileID || !IsCallerOwnedUploadURL(root.URL, root.FileID)) {
            return;
        }
        const item = await provider.GetEntityObject<MJContentItemEntity>('MJ: Content Items', contextUser);
        if (!(await item.InnerLoad(CompositeKey.FromID(root.ID)))) { // first-pk-ok: MJ core content entity, single-column ID
            throw new Error(`Could not load Content Item '${root.ID}' to detach FileID`);
        }
        item.FileID = null;
        if (!(await item.Save())) {
            throw new Error(
                `Failed to clear FileID on Content Item '${root.ID}': ${item.LatestResult?.CompleteMessage ?? 'unknown error'}`,
            );
        }
    }

    private async collectNonDeletedChunkIDs(
        itemIDs: readonly string[],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<string[]> {
        const rv = RunView.FromMetadataProvider(provider);
        const chunks = await rv.RunView<{ ID: string }>(
            {
                EntityName: 'MJ: Content Item Chunks',
                ExtraFilter: `(${WhereAnyOf('ContentItemID', itemIDs)}) AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
                Fields: ['ID'],
                ResultType: 'simple',
                IgnoreMaxRows: true,
            },
            contextUser,
        );
        if (!chunks.Success) {
            throw new Error(`Could not query chunks of Content Item(s) [${itemIDs.join(', ')}]: ${chunks.ErrorMessage}`);
        }
        return chunks.Results.map((c) => c.ID);
    }

    private async runDeleteNow(
        allItemIDs: readonly string[],
        contextUser: UserInfo,
        provider: IMetadataProvider,
    ): Promise<{ FailedItemIDs: string[]; FailedChunkIDs: string[] }> {
        const preDeleteChunkIDs = (await this.collectPendingChunkIDs(allItemIDs, provider, contextUser)) ?? [];
        const itemsOk = await this.executeProcessStage(
            CONTENT_PIPELINE_DELETE_PROCESS_ID,
            'DeleteContentItem',
            [...allItemIDs],
            null,
            contextUser,
            provider,
        );
        const failedItemIDs = itemsOk ? [] : await this.resolveUnremovedItemIDs(allItemIDs, provider, contextUser);

        const postDeleteChunkIDs = (await this.collectPendingChunkIDs(allItemIDs, provider, contextUser)) ?? [];
        const allChunkIDs = this.deduplicateIDs([...preDeleteChunkIDs, ...postDeleteChunkIDs]);
        if (allChunkIDs.length === 0) {
            return { FailedItemIDs: failedItemIDs, FailedChunkIDs: [] };
        }

        const chunksOk = await this.executeProcessStage(
            CONTENT_PIPELINE_DELETE_CHUNKS_PROCESS_ID,
            'Delete Chunks',
            allChunkIDs,
            null,
            contextUser,
            provider,
        );
        const failedChunkIDs = chunksOk ? [] : await this.resolveUnremovedChunkIDs(allItemIDs, allChunkIDs, provider, contextUser);
        return { FailedItemIDs: failedItemIDs, FailedChunkIDs: failedChunkIDs };
    }

    private async resolveUnremovedItemIDs(
        allItemIDs: readonly string[],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<string[]> {
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const remaining = await rv.RunView<{ ID: string; DeleteStatus: string | null }>(
                {
                    EntityName: 'MJ: Content Items',
                    ExtraFilter: `(${WhereAnyOf('ID', allItemIDs)}) AND (DeleteStatus IS NULL OR DeleteStatus <> 'Deleted')`,
                    Fields: ['ID', 'DeleteStatus'],
                    ResultType: 'simple',
                    IgnoreMaxRows: true,
                },
                contextUser,
            );
            if (remaining.Success) {
                return remaining.Results.map((r) => r.ID);
            }
        } catch {
            // Fall through to returning all attempted item IDs.
        }
        return [...allItemIDs];
    }

    private async resolveUnremovedChunkIDs(
        allItemIDs: readonly string[],
        attemptedChunkIDs: readonly string[],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<string[]> {
        const stillPending = await this.collectPendingChunkIDs(allItemIDs, provider, contextUser);
        return stillPending ?? [...attemptedChunkIDs];
    }

    private async collectPendingChunkIDs(
        itemIDs: readonly string[],
        provider: IMetadataProvider,
        contextUser: UserInfo,
    ): Promise<string[] | null> {
        try {
            const rv = RunView.FromMetadataProvider(provider);
            const chunks = await rv.RunView<{ ID: string }>(
                {
                    EntityName: 'MJ: Content Item Chunks',
                    ExtraFilter: `(${WhereAnyOf('ContentItemID', itemIDs)}) AND (${WhereEqual({ DeleteStatus: 'Pending' })})`,
                    Fields: ['ID'],
                    ResultType: 'simple',
                    IgnoreMaxRows: true,
                },
                contextUser,
            );
            return chunks.Success ? chunks.Results.map((c) => c.ID) : null;
        } catch {
            return null;
        }
    }

    private deduplicateIDs(ids: readonly string[]): string[] {
        const seen = new UUIDSet();
        const out: string[] = [];
        for (const id of ids) {
            if (!seen.Has(id)) {
                seen.Add(id);
                out.push(id);
            }
        }
        return out;
    }
}
