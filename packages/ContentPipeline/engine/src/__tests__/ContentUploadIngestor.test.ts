import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentVectorInfrastructure } from '@memberjunction/content-autotagging';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { RecordProcessExecutor } from '@memberjunction/record-set-processor';
import { WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import {
    CONTENT_PIPELINE_DELETE_CHUNKS_PROCESS_ID,
    CONTENT_PIPELINE_DELETE_PROCESS_ID,
    CONTENT_PIPELINE_EMBED_PROCESS_ID,
    CONTENT_PIPELINE_EXTRACT_PROCESS_ID,
    CONTENT_PIPELINE_SEGMENT_PROCESS_ID,
    CONTENT_PIPELINE_TAG_PROCESS_ID,
    ContentUploadIngestor,
    IsUploadItemURL,
    UploadItemURL,
} from '../ContentUploadIngestor.js';
import { ContentPipelineStartup } from '../ContentPipelineStartup.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import type { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';
import '../stages/index.js';

interface SavedContentItem {
    ID: string;
    ContentSourceID: string;
    ContentTypeID: string;
    ContentSourceTypeID: string;
    ContentFileTypeID: string;
    FileID: string;
    URL: string;
    Name: string;
    Description: string | null;
    EntityRecordDocumentID: string | null;
    ParentID?: string | null;
    RootParentID?: string | null;
    ExtractionStatus: string;
    TaggingStatus: string;
    SegmentationStatus: string;
    EmbeddingStatus: string;
    DeleteStatus: string | null;
}

interface SavedERD {
    ID: string;
    EntityID: string;
    RecordID: string;
    EntityDocumentID: string;
    VectorIndexID: string;
    EntityRecordUpdatedAt: Date | null;
}

interface SavedChunk {
    ID: string;
    ContentItemID: string;
    EmbeddingStatus?: string | null;
    DeleteStatus: string | null;
}

function createFakeEnvironment() {
    const items: SavedContentItem[] = [];
    const erds: SavedERD[] = [];
    const chunks: SavedChunk[] = [];
    let itemSeq = 0;
    let erdSeq = 0;

    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentSourceByID').mockImplementation((id: string) => {
        if (id === 'SRC-UPLOAD-1') {
            return {
                ID: 'SRC-UPLOAD-1',
                ContentTypeID: 'CT-DOC',
                ContentSourceTypeID: 'CST-UPLOAD',
                ContentFileTypeID: 'CFT-PDF',
                EntityDocumentID: 'ED-SPACE-ITEM',
                VectorIndexID: 'VIDX-SOURCE',
            } as never;
        }
        if (id === 'SRC-RSS-1') {
            return {
                ID: 'SRC-RSS-1',
                ContentTypeID: 'CT-DOC',
                ContentSourceTypeID: 'CST-RSS',
                ContentFileTypeID: 'CFT-HTML',
                EntityDocumentID: null,
                VectorIndexID: null,
            } as never;
        }
        if (id === 'SRC-OTHER-ENTITY') {
            return {
                ID: 'SRC-OTHER-ENTITY',
                ContentTypeID: 'CT-DOC',
                ContentSourceTypeID: 'CST-UPLOAD',
                ContentFileTypeID: 'CFT-PDF',
                EntityDocumentID: 'ED-OTHER',
                VectorIndexID: 'VIDX-SOURCE',
            } as never;
        }
        return undefined;
    });
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetContentSourceTypeByID').mockImplementation((id: string) => {
        if (id === 'CST-UPLOAD') {
            return { ID: 'CST-UPLOAD', Name: 'Upload', DriverClass: 'AutotagUpload' } as never;
        }
        if (id === 'CST-RSS') {
            return { ID: 'CST-RSS', Name: 'RSS Feed', DriverClass: 'AutotagRSSFeed' } as never;
        }
        return undefined;
    });
    vi.spyOn(KnowledgeHubMetadataEngine.Instance, 'GetEntityDocumentByID').mockImplementation((id: string) => {
        if (id === 'ED-SPACE-ITEM') {
            return { ID: 'ED-SPACE-ITEM', EntityID: 'ENT-SPACE-ITEMS' } as never;
        }
        if (id === 'ED-OTHER') {
            return { ID: 'ED-OTHER', EntityID: 'ENT-OTHER' } as never;
        }
        return undefined;
    });
    vi.spyOn(ContentVectorInfrastructure.prototype, 'ResolveVectorIndexID').mockResolvedValue('VIDX-RESOLVED');

    const parseFilter = (extraFilter: string | undefined): Record<string, string | null> => {
        const out: Record<string, string | null> = {};
        if (!extraFilter) {
            return out;
        }
        for (const match of extraFilter.matchAll(/\[?(\w+)\]?\s*=\s*'([^']*)'/g)) {
            out[match[1]] = match[2];
        }
        for (const match of extraFilter.matchAll(/\[?(\w+)\]?\s+IS\s+NULL/gi)) {
            out[match[1]] = null;
        }
        return out;
    };

    const extractQuotedValuesForColumn = (extraFilter: string | undefined, column: string): string[] => {
        if (!extraFilter) {
            return [];
        }
        const values: string[] = [];
        const inMatch = extraFilter.match(new RegExp(`(?<![A-Za-z0-9_])\\[?${column}\\]?\\s+IN\\s*\\(([^)]*)\\)`, 'i'));
        if (inMatch) {
            for (const m of inMatch[1].matchAll(/'([^']*)'/g)) {
                values.push(m[1]);
            }
        }
        for (const eqMatch of extraFilter.matchAll(new RegExp(`(?<![A-Za-z0-9_])\\[?${column}\\]?\\s*=\\s*'([^']*)'`, 'gi'))) {
            values.push(eqMatch[1]);
        }
        return values;
    };

    const runView = vi.fn(async (params: { EntityName: string; ExtraFilter?: string }) => {
        const filter = parseFilter(params.ExtraFilter);
        const extra = params.ExtraFilter ?? '';

        if (params.EntityName === 'MJ: Content Items') {
            const rootOrParentValues = [
                ...extractQuotedValuesForColumn(extra, 'RootParentID'),
                ...extractQuotedValuesForColumn(extra, 'ParentID'),
            ];
            const idValues = extractQuotedValuesForColumn(extra, 'ID');
            const isTreeQuery = extra.includes('RootParentID') || extra.includes('ParentID');

            const matched = items.filter((item) => {
                if (isTreeQuery) {
                    const matchesId = idValues.includes(item.ID);
                    const matchesRoot = Boolean(item.RootParentID && rootOrParentValues.includes(item.RootParentID));
                    const matchesParent = Boolean(item.ParentID && rootOrParentValues.includes(item.ParentID));
                    if (!matchesId && !matchesRoot && !matchesParent) {
                        return false;
                    }
                } else if (idValues.length > 0 && !idValues.includes(item.ID)) {
                    return false;
                }
                if (filter.ContentSourceID !== undefined && item.ContentSourceID !== filter.ContentSourceID) {
                    return false;
                }
                if (filter.FileID !== undefined && item.FileID !== filter.FileID) {
                    return false;
                }
                if (extra.includes("DeleteStatus <> 'Deleted'")) {
                    if (item.DeleteStatus === 'Deleted') {
                        return false;
                    }
                } else if (filter.DeleteStatus === 'Pending') {
                    if (item.DeleteStatus !== 'Pending') {
                        return false;
                    }
                } else if (filter.DeleteStatus === null) {
                    if (item.DeleteStatus !== null) {
                        return false;
                    }
                }
                return true;
            });
            return { Success: true, Results: matched };
        }
        if (params.EntityName === 'MJ: Entity Record Documents') {
            const recordIDCandidates = extractQuotedValuesForColumn(extra, 'RecordID');
            const matched = erds.filter(
                (e) =>
                    e.EntityID === filter.EntityID &&
                    e.EntityDocumentID === filter.EntityDocumentID &&
                    recordIDCandidates.includes(e.RecordID),
            );
            return { Success: true, Results: matched };
        }
        if (params.EntityName === 'MJ: Content Item Chunks') {
            const itemIDCandidates = extractQuotedValuesForColumn(extra, 'ContentItemID');
            const wantsNotDeleted = extra.includes("DeleteStatus <> 'Deleted'");
            const wantsPending = !wantsNotDeleted && filter.DeleteStatus === 'Pending';
            const wantsNull = !wantsNotDeleted && filter.DeleteStatus === null;
            const matched = chunks.filter((c) => {
                if (itemIDCandidates.length > 0 && !itemIDCandidates.includes(c.ContentItemID)) {
                    return false;
                }
                if (wantsNotDeleted && c.DeleteStatus === 'Deleted') {
                    return false;
                }
                if (wantsPending && c.DeleteStatus !== 'Pending') {
                    return false;
                }
                if (wantsNull && c.DeleteStatus !== null) {
                    return false;
                }
                return true;
            });
            return { Success: true, Results: matched };
        }
        return { Success: true, Results: [] };
    });

    const provider = {
        EntityByName: (name: string) => {
            if (name === 'MJ: Collaboration Space Items') {
                return {
                    ID: 'ENT-SPACE-ITEMS',
                    Name: name,
                    PrimaryKeys: [{ Name: 'ID', NeedsQuotes: true }],
                    FirstPrimaryKey: { Name: 'ID', NeedsQuotes: true },
                };
            }
            return undefined;
        },
        RunView: runView,
        RunViews: vi.fn(async (views: { EntityName: string; ExtraFilter?: string }[]) => {
            return Promise.all(views.map((v) => runView(v)));
        }),
        GetEntityObject: vi.fn(async (entityName: string) => {
            if (entityName === 'MJ: Content Items') {
                let record: SavedContentItem = {
                    ID: '',
                    ContentSourceID: '',
                    ContentTypeID: '',
                    ContentSourceTypeID: '',
                    ContentFileTypeID: '',
                    FileID: '',
                    URL: '',
                    Name: '',
                    Description: null,
                    EntityRecordDocumentID: null,
                    ExtractionStatus: '',
                    TaggingStatus: '',
                    SegmentationStatus: '',
                    EmbeddingStatus: '',
                    DeleteStatus: null,
                };
                return {
                    get ID() {
                        return record.ID;
                    },
                    set ContentSourceID(v: string) {
                        record.ContentSourceID = v;
                    },
                    set ContentTypeID(v: string) {
                        record.ContentTypeID = v;
                    },
                    set ContentSourceTypeID(v: string) {
                        record.ContentSourceTypeID = v;
                    },
                    set ContentFileTypeID(v: string) {
                        record.ContentFileTypeID = v;
                    },
                    set FileID(v: string) {
                        record.FileID = v;
                    },
                    set URL(v: string) {
                        record.URL = v;
                    },
                    set Name(v: string) {
                        record.Name = v;
                    },
                    set Description(v: string | null) {
                        record.Description = v;
                    },
                    get EntityRecordDocumentID() {
                        return record.EntityRecordDocumentID;
                    },
                    set EntityRecordDocumentID(v: string | null) {
                        record.EntityRecordDocumentID = v;
                    },
                    get ExtractionStatus() {
                        return record.ExtractionStatus;
                    },
                    set ExtractionStatus(v: string) {
                        record.ExtractionStatus = v;
                    },
                    get TaggingStatus() {
                        return record.TaggingStatus;
                    },
                    set TaggingStatus(v: string) {
                        record.TaggingStatus = v;
                    },
                    get SegmentationStatus() {
                        return record.SegmentationStatus;
                    },
                    set SegmentationStatus(v: string) {
                        record.SegmentationStatus = v;
                    },
                    get EmbeddingStatus() {
                        return record.EmbeddingStatus;
                    },
                    set EmbeddingStatus(v: string) {
                        record.EmbeddingStatus = v;
                    },
                    get DeleteStatus() {
                        return record.DeleteStatus;
                    },
                    set DeleteStatus(v: string | null) {
                        record.DeleteStatus = v;
                    },
                    NewRecord: () => {
                        itemSeq += 1;
                        record.ID = `ITEM-UPLOAD-${itemSeq}`;
                    },
                    InnerLoad: async (ck: { KeyValuePairs: { Value: string }[] }) => {
                        const found = items.find((i) => i.ID === ck.KeyValuePairs[0].Value);
                        if (!found) {
                            return false;
                        }
                        record = found;
                        return true;
                    },
                    Set: (field: keyof SavedContentItem, value: never) => {
                        record[field] = value;
                    },
                    Save: async () => {
                        if (!items.some((i) => i.ID === record.ID)) {
                            items.push(record);
                        }
                        return true;
                    },
                };
            }
            if (entityName === 'MJ: Entity Record Documents') {
                const erd: SavedERD = {
                    ID: '',
                    EntityID: '',
                    RecordID: '',
                    EntityDocumentID: '',
                    VectorIndexID: '',
                    EntityRecordUpdatedAt: null,
                };
                return {
                    get ID() {
                        return erd.ID;
                    },
                    set EntityID(v: string) {
                        erd.EntityID = v;
                    },
                    set RecordID(v: string) {
                        erd.RecordID = v;
                    },
                    set EntityDocumentID(v: string) {
                        erd.EntityDocumentID = v;
                    },
                    set VectorIndexID(v: string) {
                        erd.VectorIndexID = v;
                    },
                    set EntityRecordUpdatedAt(v: Date | null) {
                        erd.EntityRecordUpdatedAt = v;
                    },
                    NewRecord: () => {
                        erdSeq += 1;
                        erd.ID = `ERD-UPLOAD-${erdSeq}`;
                    },
                    Save: async () => {
                        erds.push(erd);
                        return true;
                    },
                };
            }
            if (entityName === 'MJ: Content Item Chunks') {
                let targetChunk: SavedChunk | undefined;
                return {
                    InnerLoad: async (ck: { KeyValuePairs: { Value: string }[] }) => {
                        targetChunk = chunks.find((c) => c.ID === ck.KeyValuePairs[0].Value);
                        return Boolean(targetChunk);
                    },
                    get EmbeddingStatus() {
                        return targetChunk?.EmbeddingStatus ?? null;
                    },
                    set EmbeddingStatus(v: string | null) {
                        if (targetChunk) {
                            targetChunk.EmbeddingStatus = v;
                        }
                    },
                    get DeleteStatus() {
                        return targetChunk?.DeleteStatus ?? null;
                    },
                    set DeleteStatus(v: string | null) {
                        if (targetChunk) {
                            targetChunk.DeleteStatus = v;
                        }
                    },
                    Save: async () => true,
                };
            }
            throw new Error(`Unexpected entity requested in test: ${entityName}`);
        }),
    };

    return { items, erds, chunks, provider: provider as never, contextUser: { ID: 'USER-1' } as never };
}

beforeEach(async () => {
    vi.restoreAllMocks();
    await ContentPipelineStartup.Instance.HandleStartup();
});

describe('ContentUploadIngestor', () => {
    it('creates a Pending Content Item with FileID, UploadItemURL, and no EntityRecordDocument when Origin is omitted', async () => {
        const { items, erds, provider, contextUser } = createFakeEnvironment();

        const result = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-100',
            Name: 'quarterly-report.pdf',
            Description: 'Q3 financial summary',
            ContextUser: contextUser,
            Provider: provider,
        });

        expect(result).toEqual({
            ContentItemID: 'ITEM-UPLOAD-1',
            Created: true,
            EntityRecordDocumentID: null,
        });
        expect(erds).toHaveLength(0);
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            ID: 'ITEM-UPLOAD-1',
            ContentSourceID: 'SRC-UPLOAD-1',
            ContentTypeID: 'CT-DOC',
            ContentSourceTypeID: 'CST-UPLOAD',
            ContentFileTypeID: 'CFT-PDF',
            FileID: 'FILE-100',
            URL: UploadItemURL('FILE-100'),
            Name: 'quarterly-report.pdf',
            Description: 'Q3 financial summary',
            EntityRecordDocumentID: null,
            ExtractionStatus: 'Pending',
            TaggingStatus: 'Pending',
            SegmentationStatus: 'Pending',
            EmbeddingStatus: 'Pending',
        });
        expect(IsUploadItemURL(items[0].URL)).toBe(true);
    });

    it('writes Entity Record Documents RecordID using CompositeKey.ToCompactURLSegment(), finds existing rows in either compact or KeyValuePair form, and refuses a mismatched EntityDocument entity', async () => {
        const { items, erds, provider, contextUser } = createFakeEnvironment();

        const first = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-201',
            Name: 'agenda.pdf',
            Origin: {
                EntityName: 'MJ: Collaboration Space Items',
                RecordID: 'SPACE-ITEM-42',
            },
            ContextUser: contextUser,
            Provider: provider,
        });

        expect(first).toEqual({
            ContentItemID: 'ITEM-UPLOAD-1',
            Created: true,
            EntityRecordDocumentID: 'ERD-UPLOAD-1',
        });
        expect(erds).toHaveLength(1);
        // CompositeKey.ToCompactURLSegment() writes the bare value for a single-PK entity, matching AutotagEntity.
        expect(erds[0]).toMatchObject({
            ID: 'ERD-UPLOAD-1',
            EntityID: 'ENT-SPACE-ITEMS',
            RecordID: 'SPACE-ITEM-42',
            EntityDocumentID: 'ED-SPACE-ITEM',
            VectorIndexID: 'VIDX-RESOLVED',
        });
        expect(items[0].EntityRecordDocumentID).toBe('ERD-UPLOAD-1');

        // A second upload linked to the same origin record (even if passed as 'ID|SPACE-ITEM-42') reuses the same ERD.
        const second = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-202',
            Name: 'minutes.pdf',
            Origin: {
                EntityName: 'MJ: Collaboration Space Items',
                RecordID: 'ID|SPACE-ITEM-42',
            },
            ContextUser: contextUser,
            Provider: provider,
        });
        expect(second.EntityRecordDocumentID).toBe('ERD-UPLOAD-1');
        expect(erds).toHaveLength(1);

        // Pre-existing ERD saved in legacy 'ID|<id>' form is also found without creating a duplicate.
        erds.push({
            ID: 'ERD-LEGACY-77',
            EntityID: 'ENT-SPACE-ITEMS',
            RecordID: 'ID|SPACE-ITEM-77',
            EntityDocumentID: 'ED-SPACE-ITEM',
            VectorIndexID: 'VIDX-RESOLVED',
            EntityRecordUpdatedAt: new Date(),
        });
        const third = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-203',
            Name: 'notes.pdf',
            Origin: {
                EntityName: 'MJ: Collaboration Space Items',
                RecordID: 'SPACE-ITEM-77',
            },
            ContextUser: contextUser,
            Provider: provider,
        });
        expect(third.EntityRecordDocumentID).toBe('ERD-LEGACY-77');
        expect(erds).toHaveLength(2);

        // Refuses a ContentSource whose EntityDocumentID belongs to a different entity than Origin.
        await expect(
            ContentUploadIngestor.Ingest({
                ContentSourceID: 'SRC-OTHER-ENTITY',
                FileID: 'FILE-204',
                Name: 'wrong-source.pdf',
                Origin: {
                    EntityName: 'MJ: Collaboration Space Items',
                    RecordID: 'SPACE-ITEM-42',
                },
                ContextUser: contextUser,
                Provider: provider,
            }),
        ).rejects.toThrow(/EntityDocumentID 'ED-OTHER'.*does not match Origin entity 'MJ: Collaboration Space Items'/);
    });

    it('refuses a ContentSourceID whose driver is not push-only with a clear error', async () => {
        const { provider, contextUser } = createFakeEnvironment();

        await expect(
            ContentUploadIngestor.Ingest({
                ContentSourceID: 'SRC-RSS-1',
                FileID: 'FILE-250',
                Name: 'not-an-upload-source.pdf',
                ContextUser: contextUser,
                Provider: provider,
            }),
        ).rejects.toThrow(/Content Source 'SRC-RSS-1' uses driver 'AutotagRSSFeed', which is not push-only/);
    });

    it('re-links EntityRecordDocumentID when Origin differs on an existing item, and honors RunNow for incomplete stages so a failed item can be retried', async () => {
        const { items, provider, contextUser } = createFakeEnvironment();

        const first = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-300',
            Name: 'spec.docx',
            ContextUser: contextUser,
            Provider: provider,
        });
        expect(first.Created).toBe(true);
        expect(first.EntityRecordDocumentID).toBeNull();

        // Simulate a prior run where Extract succeeded, Segment failed, and Tagging is still Pending.
        items[0].ExtractionStatus = 'Complete';
        items[0].SegmentationStatus = 'Failed';
        items[0].TaggingStatus = 'Pending';

        const processCalls: { processID: string; recordIDs: string[] }[] = [];
        vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockImplementation(async (processID, options) => {
            const scope = options.Scope as { Kind: string; RecordIDs: string[] };
            processCalls.push({ processID, recordIDs: scope.RecordIDs });
            return {
                Status: 'Completed',
                Processed: scope.RecordIDs.length,
                Success: scope.RecordIDs.length,
                Error: 0,
                Skipped: 0,
                ProcessRunID: 'RUN-RETRY',
            } as never;
        });

        const retried = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-300',
            Name: 'spec.docx',
            Origin: { EntityName: 'MJ: Collaboration Space Items', RecordID: 'SPACE-ITEM-99' },
            RunNow: true,
            ContextUser: contextUser,
            Provider: provider,
        });

        expect(retried).toEqual({
            ContentItemID: first.ContentItemID,
            Created: false,
            EntityRecordDocumentID: 'ERD-UPLOAD-1',
        });
        expect(items).toHaveLength(1);
        expect(items[0].EntityRecordDocumentID).toBe('ERD-UPLOAD-1');
        // Extract was already Complete, so RunNow only runs Segment (reset from Failed to Pending) and Tag.
        expect(processCalls).toEqual([
            { processID: CONTENT_PIPELINE_SEGMENT_PROCESS_ID, recordIDs: ['ITEM-UPLOAD-1'] },
            { processID: CONTENT_PIPELINE_TAG_PROCESS_ID, recordIDs: ['ITEM-UPLOAD-1'] },
        ]);
    });

    it('revives an existing Content Item still pending deletion (clears DeleteStatus) instead of creating a second one', async () => {
        const { items, chunks, provider, contextUser } = createFakeEnvironment();

        const created = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-350',
            Name: 'revive-me.pdf',
            ContextUser: contextUser,
            Provider: provider,
        });
        chunks.push({ ID: 'CHK-350', ContentItemID: created.ContentItemID, DeleteStatus: 'Pending' });
        items[0].DeleteStatus = 'Pending';

        const revived = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-350',
            Name: 'revive-me.pdf',
            ContextUser: contextUser,
            Provider: provider,
        });

        expect(revived).toEqual({
            ContentItemID: created.ContentItemID,
            Created: false,
            EntityRecordDocumentID: null,
        });
        expect(items).toHaveLength(1);
        expect(items[0].DeleteStatus).toBeNull();
        expect(chunks[0].DeleteStatus).toBeNull();
    });

    it('runs Extract, Segment, Embed, and Tag in order with a records scope when RunNow is true, and never throws when a stage fails', async () => {
        const { items, chunks, provider, contextUser } = createFakeEnvironment();
        const processCalls: { processID: string; recordIDs: string[] }[] = [];

        vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockImplementation(async (processID, options) => {
            const scope = options.Scope as { Kind: string; RecordIDs: string[] };
            processCalls.push({ processID, recordIDs: scope.RecordIDs });
            if (processID === CONTENT_PIPELINE_SEGMENT_PROCESS_ID) {
                chunks.push(
                    { ID: 'CHK-1', ContentItemID: scope.RecordIDs[0], EmbeddingStatus: 'Pending', DeleteStatus: null },
                    { ID: 'CHK-2', ContentItemID: scope.RecordIDs[0], EmbeddingStatus: 'Pending', DeleteStatus: null },
                );
            }
            return {
                Status: 'Completed',
                Processed: scope.RecordIDs.length,
                Success: scope.RecordIDs.length,
                Error: 0,
                Skipped: 0,
                ProcessRunID: 'RUN-1',
            } as never;
        });

        const result = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-400',
            Name: 'handbook.pdf',
            RunNow: true,
            ContextUser: contextUser,
            Provider: provider,
        });

        expect(result.ContentItemID).toBe('ITEM-UPLOAD-1');
        expect(processCalls).toEqual([
            { processID: CONTENT_PIPELINE_EXTRACT_PROCESS_ID, recordIDs: ['ITEM-UPLOAD-1'] },
            { processID: CONTENT_PIPELINE_SEGMENT_PROCESS_ID, recordIDs: ['ITEM-UPLOAD-1'] },
            { processID: CONTENT_PIPELINE_EMBED_PROCESS_ID, recordIDs: ['CHK-1', 'CHK-2'] },
            { processID: CONTENT_PIPELINE_TAG_PROCESS_ID, recordIDs: ['ITEM-UPLOAD-1'] },
        ]);

        // If a stage throws unexpectedly, Ingest logs, marks the item status Failed, and does not throw past the caller.
        vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockRejectedValueOnce(new Error('extractor boom'));
        const failedResult = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-401',
            Name: 'corrupt.pdf',
            RunNow: true,
            ContextUser: contextUser,
            Provider: provider,
        });
        expect(failedResult.Created).toBe(true);
        expect(items.find((i) => i.ID === failedResult.ContentItemID)?.ExtractionStatus).toBe('Failed');
    });

    it('collects descendants at any depth via RootParentID and continues later stages for items that succeeded when a sibling fails', async () => {
        const { items, chunks, provider, contextUser } = createFakeEnvironment();
        const processCalls: { processID: string; recordIDs: string[] }[] = [];

        vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockImplementation(async (processID, options) => {
            const scope = options.Scope as { Kind: string; RecordIDs: string[] };
            processCalls.push({ processID, recordIDs: scope.RecordIDs });

            if (processID === CONTENT_PIPELINE_EXTRACT_PROCESS_ID) {
                items[0].ExtractionStatus = 'Complete';
                // Simulate an archive root that expanded into a child and a nested grandchild (depth 2 via RootParentID),
                // plus one corrupt member that failed extraction.
                items.push(
                    {
                        ID: 'ITEM-CHILD-1',
                        ContentSourceID: 'SRC-UPLOAD-1',
                        ContentTypeID: 'CT-DOC',
                        ContentSourceTypeID: 'CST-UPLOAD',
                        ContentFileTypeID: 'CFT-PDF',
                        FileID: 'FILE-CHILD-1',
                        URL: `${UploadItemURL('FILE-450')}#inner.zip`,
                        Name: 'inner.zip',
                        Description: null,
                        EntityRecordDocumentID: null,
                        ParentID: 'ITEM-UPLOAD-1',
                        RootParentID: 'ITEM-UPLOAD-1',
                        ExtractionStatus: 'Complete',
                        TaggingStatus: 'Pending',
                        SegmentationStatus: 'Pending',
                        EmbeddingStatus: 'Pending',
                        DeleteStatus: null,
                    },
                    {
                        ID: 'ITEM-GRANDCHILD-1',
                        ContentSourceID: 'SRC-UPLOAD-1',
                        ContentTypeID: 'CT-DOC',
                        ContentSourceTypeID: 'CST-UPLOAD',
                        ContentFileTypeID: 'CFT-PDF',
                        FileID: 'FILE-GC-1',
                        URL: `${UploadItemURL('FILE-450')}#inner.zip#deep.pdf`,
                        Name: 'deep.pdf',
                        Description: null,
                        EntityRecordDocumentID: null,
                        ParentID: 'ITEM-CHILD-1',
                        RootParentID: 'ITEM-UPLOAD-1',
                        ExtractionStatus: 'Complete',
                        TaggingStatus: 'Pending',
                        SegmentationStatus: 'Pending',
                        EmbeddingStatus: 'Pending',
                        DeleteStatus: null,
                    },
                    {
                        ID: 'ITEM-CHILD-BAD',
                        ContentSourceID: 'SRC-UPLOAD-1',
                        ContentTypeID: 'CT-DOC',
                        ContentSourceTypeID: 'CST-UPLOAD',
                        ContentFileTypeID: 'CFT-PDF',
                        FileID: 'FILE-BAD',
                        URL: `${UploadItemURL('FILE-450')}#corrupt.pdf`,
                        Name: 'corrupt.pdf',
                        Description: null,
                        EntityRecordDocumentID: null,
                        ParentID: 'ITEM-UPLOAD-1',
                        RootParentID: 'ITEM-UPLOAD-1',
                        ExtractionStatus: 'Failed',
                        TaggingStatus: 'Pending',
                        SegmentationStatus: 'Pending',
                        EmbeddingStatus: 'Pending',
                        DeleteStatus: null,
                    },
                );
                return { Status: 'Completed', Processed: 1, Success: 1, Error: 0, Skipped: 0, ProcessRunID: 'R-EX' } as never;
            }

            if (processID === CONTENT_PIPELINE_SEGMENT_PROCESS_ID) {
                // Simulate ITEM-CHILD-1 failing Segment while root and grandchild succeed.
                for (const id of scope.RecordIDs) {
                    const row = items.find((i) => i.ID === id)!;
                    if (id === 'ITEM-CHILD-1') {
                        row.SegmentationStatus = 'Failed';
                    } else {
                        row.SegmentationStatus = 'Complete';
                        chunks.push({
                            ID: `CHK-${id}`,
                            ContentItemID: id,
                            EmbeddingStatus: 'Pending',
                            DeleteStatus: null,
                        });
                    }
                }
                return { Status: 'Completed', Processed: 3, Success: 2, Error: 1, Skipped: 0, ProcessRunID: 'R-SEG' } as never;
            }

            return {
                Status: 'Completed',
                Processed: scope.RecordIDs.length,
                Success: scope.RecordIDs.length,
                Error: 0,
                Skipped: 0,
                ProcessRunID: 'R-OTHER',
            } as never;
        });

        await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-450',
            Name: 'bundle.zip',
            RunNow: true,
            ContextUser: contextUser,
            Provider: provider,
        });

        expect(processCalls).toEqual([
            { processID: CONTENT_PIPELINE_EXTRACT_PROCESS_ID, recordIDs: ['ITEM-UPLOAD-1'] },
            // ITEM-CHILD-BAD failed Extract, so only the 3 completed items advance to Segment (including depth-2 grandchild).
            {
                processID: CONTENT_PIPELINE_SEGMENT_PROCESS_ID,
                recordIDs: ['ITEM-UPLOAD-1', 'ITEM-CHILD-1', 'ITEM-GRANDCHILD-1'],
            },
            // ITEM-CHILD-1 failed Segment, so Embed and Tag still run for the 2 items that completed Segment.
            {
                processID: CONTENT_PIPELINE_EMBED_PROCESS_ID,
                recordIDs: ['CHK-ITEM-UPLOAD-1', 'CHK-ITEM-GRANDCHILD-1'],
            },
            {
                processID: CONTENT_PIPELINE_TAG_PROCESS_ID,
                recordIDs: ['ITEM-UPLOAD-1', 'ITEM-GRANDCHILD-1'],
            },
        ]);
    });

    it('Remove marks the root and every descendant at any depth and all their chunks as Pending delete, checks receipts, and reports unremoved IDs when RunNow fails', async () => {
        const { items, chunks, provider, contextUser } = createFakeEnvironment();

        await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-500',
            Name: 'retire-me.zip',
            ContextUser: contextUser,
            Provider: provider,
        });
        items.push(
            {
                ID: 'ITEM-DESC-1',
                ContentSourceID: 'SRC-UPLOAD-1',
                ContentTypeID: 'CT-DOC',
                ContentSourceTypeID: 'CST-UPLOAD',
                ContentFileTypeID: 'CFT-PDF',
                FileID: 'FILE-DESC-1',
                URL: `${UploadItemURL('FILE-500')}#nested.zip`,
                Name: 'nested.zip',
                Description: null,
                EntityRecordDocumentID: null,
                ParentID: 'ITEM-UPLOAD-1',
                RootParentID: 'ITEM-UPLOAD-1',
                ExtractionStatus: 'Complete',
                TaggingStatus: 'Complete',
                SegmentationStatus: 'Complete',
                EmbeddingStatus: 'Complete',
                DeleteStatus: null,
            },
            {
                ID: 'ITEM-DESC-2',
                ContentSourceID: 'SRC-UPLOAD-1',
                ContentTypeID: 'CT-DOC',
                ContentSourceTypeID: 'CST-UPLOAD',
                ContentFileTypeID: 'CFT-PDF',
                FileID: 'FILE-DESC-2',
                URL: `${UploadItemURL('FILE-500')}#nested.zip#leaf.pdf`,
                Name: 'leaf.pdf',
                Description: null,
                EntityRecordDocumentID: null,
                ParentID: 'ITEM-DESC-1',
                RootParentID: 'ITEM-UPLOAD-1',
                ExtractionStatus: 'Complete',
                TaggingStatus: 'Complete',
                SegmentationStatus: 'Complete',
                EmbeddingStatus: 'Complete',
                DeleteStatus: null,
            },
        );
        chunks.push(
            { ID: 'CHK-ROOT', ContentItemID: 'ITEM-UPLOAD-1', DeleteStatus: null },
            { ID: 'CHK-DESC-2', ContentItemID: 'ITEM-DESC-2', DeleteStatus: null },
        );

        const deleteCalls: { processID: string; recordIDs: string[] }[] = [];
        vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockImplementation(async (processID, options) => {
            const scope = options.Scope as { Kind: string; RecordIDs: string[] };
            deleteCalls.push({ processID, recordIDs: scope.RecordIDs });
            if (processID === CONTENT_PIPELINE_DELETE_PROCESS_ID) {
                for (const item of items) {
                    item.DeleteStatus = 'Deleted';
                }
                return {
                    Status: 'Completed',
                    Processed: scope.RecordIDs.length,
                    Success: scope.RecordIDs.length,
                    Error: 0,
                    Skipped: 0,
                    ProcessRunID: 'RUN-DEL-ITEMS',
                } as never;
            }
            // Simulate CHK-ROOT being deleted while CHK-DESC-2 fails vector removal and stays Pending.
            chunks[0].DeleteStatus = 'Deleted';
            return {
                Status: 'Completed',
                Processed: 2,
                Success: 1,
                Error: 1,
                Skipped: 0,
                ProcessRunID: 'RUN-DEL-CHUNKS',
            } as never;
        });

        const removed = await ContentUploadIngestor.Remove({
            FileID: 'FILE-500',
            ContentSourceID: 'SRC-UPLOAD-1',
            RunNow: true,
            ContextUser: contextUser,
            Provider: provider,
        });

        expect(removed).toEqual({
            ContentItemIDs: ['ITEM-UPLOAD-1', 'ITEM-DESC-1', 'ITEM-DESC-2'],
            DependentsMarked: 4, // 2 descendants + 2 chunks
            FailedChunkIDs: ['CHK-DESC-2'],
        });
        expect(deleteCalls).toEqual([
            {
                processID: CONTENT_PIPELINE_DELETE_PROCESS_ID,
                recordIDs: ['ITEM-UPLOAD-1', 'ITEM-DESC-1', 'ITEM-DESC-2'],
            },
            {
                processID: CONTENT_PIPELINE_DELETE_CHUNKS_PROCESS_ID,
                recordIDs: ['CHK-ROOT', 'CHK-DESC-2'],
            },
        ]);
    });

    it('Sync and Discover over an Upload source return Skipped, mark zero existing uploaded items for deletion, and stamp LastDiscoveredAt / LastSyncedAt', async () => {
        vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
            ContentSourceID: 'SRC-UPLOAD-1',
            URL: '',
            Settings: {},
            DriverClass: 'AutotagUpload',
            Parameters: {},
            Configuration: {},
            TypeConfiguration: {},
            Problems: [],
            IsValid: true,
        } as never);

        const markedForDelete: string[] = [];
        let hydratedSyncRecord: WorkingRecord | undefined;
        let hydratedDiscoverRecord: WorkingRecord | undefined;
        const commit = vi.fn(async () => ({ RecordID: 'SRC-UPLOAD-1', ColumnsWritten: [], Created: false }));

        const syncProcessor = new PipelineProcessor(
            { Stages: ['Discover'], IsTest: false, Configuration: { Mode: 'Sync' } },
            {
                Hydrator: () =>
                    ({
                        Hydrate: async () => {
                            hydratedSyncRecord = new WorkingRecord(
                                new WorkingRecordIdentity('Content Source', '', 'SRC-UPLOAD-1'),
                            );
                            return hydratedSyncRecord;
                        },
                    }) as unknown as WorkingRecordHydrator,
                Committer: () => ({ Commit: commit }) as unknown as WorkingRecordCommitter,
            },
        );

        const syncResult = await syncProcessor.ProcessRecord(
            { EntityID: 'E-SOURCE', RecordID: 'SRC-UPLOAD-1' } as never,
            {
                ContextUser: {} as never,
                Provider: {
                    EntityByName: () => ({ ID: 'E-ITEM' }),
                    RunView: async () => ({
                        Success: true,
                        Results: [
                            { ID: 'ITEM-UPLOAD-1', URL: UploadItemURL('FILE-1'), __mj_CreatedAt: new Date('2026-10-01T00:00:00Z') },
                        ],
                    }),
                    GetEntityObject: async () => ({
                        InnerLoad: async (ck: { KeyValuePairs: { Value: string }[] }) => {
                            markedForDelete.push(ck.KeyValuePairs[0].Value);
                            return true;
                        },
                        Set: () => {},
                        Save: async () => true,
                    }),
                } as never,
            } as never,
        );

        expect(syncResult.Status).toBe('Skipped');
        expect(markedForDelete).toEqual([]);
        const syncColumns = hydratedSyncRecord?.GetExtension<Record<string, unknown>>('Pipeline', 'columns');
        expect(syncColumns?.LastDiscoveredAt).toBeInstanceOf(Date);
        expect(syncColumns?.LastSyncedAt).toBeInstanceOf(Date);

        const discoverProcessor = new PipelineProcessor(
            { Stages: ['Discover'], IsTest: false, Configuration: {} },
            {
                Hydrator: () =>
                    ({
                        Hydrate: async () => {
                            hydratedDiscoverRecord = new WorkingRecord(
                                new WorkingRecordIdentity('Content Source', '', 'SRC-UPLOAD-1'),
                            );
                            return hydratedDiscoverRecord;
                        },
                    }) as unknown as WorkingRecordHydrator,
                Committer: () => ({ Commit: commit }) as unknown as WorkingRecordCommitter,
            },
        );

        const discoverResult = await discoverProcessor.ProcessRecord(
            { EntityID: 'E-SOURCE', RecordID: 'SRC-UPLOAD-1' } as never,
            { ContextUser: {} as never, Provider: {} as never } as never,
        );

        expect(discoverResult.Status).toBe('Skipped');
        const discoverColumns = hydratedDiscoverRecord?.GetExtension<Record<string, unknown>>('Pipeline', 'columns');
        expect(discoverColumns?.ForceDiscovery).toBe(false);
        expect(discoverColumns?.LastDiscoveredAt).toBeInstanceOf(Date);
    });
});
