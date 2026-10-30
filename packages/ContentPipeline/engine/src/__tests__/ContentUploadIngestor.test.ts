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

function createFakeEnvironment() {
    const items: SavedContentItem[] = [];
    const erds: SavedERD[] = [];
    const chunks: { ID: string; ContentItemID: string; DeleteStatus: string | null }[] = [];
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

    const runView = vi.fn(async (params: { EntityName: string; ExtraFilter?: string }) => {
        const filter = parseFilter(params.ExtraFilter);
        if (params.EntityName === 'MJ: Content Items') {
            if (filter.ParentID !== undefined) {
                return { Success: true, Results: [] };
            }
            const matched = items.filter((item) => {
                if (filter.ContentSourceID !== undefined && item.ContentSourceID !== filter.ContentSourceID) {
                    return false;
                }
                if (filter.FileID !== undefined && item.FileID !== filter.FileID) {
                    return false;
                }
                if (filter.DeleteStatus === null && item.DeleteStatus !== null) {
                    return false;
                }
                if (params.ExtraFilter?.includes("DeleteStatus <> 'Deleted'") && item.DeleteStatus === 'Deleted') {
                    return false;
                }
                return true;
            });
            return { Success: true, Results: matched };
        }
        if (params.EntityName === 'MJ: Entity Record Documents') {
            const matched = erds.filter(
                (e) =>
                    e.EntityID === filter.EntityID &&
                    e.RecordID === filter.RecordID &&
                    e.EntityDocumentID === filter.EntityDocumentID,
            );
            return { Success: true, Results: matched };
        }
        if (params.EntityName === 'MJ: Content Item Chunks') {
            const wantsPending = filter.DeleteStatus === 'Pending';
            const wantsNull = filter.DeleteStatus === null;
            const matched = chunks.filter((c) => {
                if (wantsPending && c.DeleteStatus !== 'Pending') {
                    return false;
                }
                if (wantsNull && c.DeleteStatus !== null) {
                    return false;
                }
                return params.ExtraFilter?.includes(`'${c.ContentItemID}'`) ?? true;
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
            return Promise.all(
                views.map(async (v) => {
                    if (v.EntityName === 'MJ: Content Item Chunks') {
                        const matched = chunks.filter(
                            (c) => v.ExtraFilter?.includes(`'${c.ContentItemID}'`) && c.DeleteStatus === null,
                        );
                        return { Success: true, Results: matched };
                    }
                    return { Success: true, Results: [] };
                }),
            );
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
                    set EntityRecordDocumentID(v: string | null) {
                        record.EntityRecordDocumentID = v;
                    },
                    set ExtractionStatus(v: string) {
                        record.ExtractionStatus = v;
                    },
                    set TaggingStatus(v: string) {
                        record.TaggingStatus = v;
                    },
                    set SegmentationStatus(v: string) {
                        record.SegmentationStatus = v;
                    },
                    set EmbeddingStatus(v: string) {
                        record.EmbeddingStatus = v;
                    },
                    set DeleteStatus(v: string | null) {
                        record.DeleteStatus = v;
                    },
                    get DeleteStatus() {
                        return record.DeleteStatus;
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
                let targetChunk: { ID: string; ContentItemID: string; DeleteStatus: string | null } | undefined;
                return {
                    InnerLoad: async (ck: { KeyValuePairs: { Value: string }[] }) => {
                        targetChunk = chunks.find((c) => c.ID === ck.KeyValuePairs[0].Value);
                        return Boolean(targetChunk);
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

beforeEach(() => {
    vi.restoreAllMocks();
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

    it('creates exactly one Entity Record Document in ID|<id> form when Origin is provided and reuses it across uploads for the same origin', async () => {
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
        expect(erds[0]).toMatchObject({
            ID: 'ERD-UPLOAD-1',
            EntityID: 'ENT-SPACE-ITEMS',
            RecordID: 'ID|SPACE-ITEM-42',
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
    });

    it('is an idempotent no-op when Ingest is called a second time for the same file under the same source', async () => {
        const { items, provider, contextUser } = createFakeEnvironment();

        const first = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-300',
            Name: 'spec.docx',
            Origin: { EntityName: 'MJ: Collaboration Space Items', RecordID: 'SPACE-ITEM-99' },
            ContextUser: contextUser,
            Provider: provider,
        });

        const second = await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-300',
            Name: 'spec.docx',
            Origin: { EntityName: 'MJ: Collaboration Space Items', RecordID: 'SPACE-ITEM-99' },
            ContextUser: contextUser,
            Provider: provider,
        });

        expect(first.Created).toBe(true);
        expect(second).toEqual({
            ContentItemID: first.ContentItemID,
            Created: false,
            EntityRecordDocumentID: first.EntityRecordDocumentID,
        });
        expect(items).toHaveLength(1);
    });

    it('runs Extract, Tag, Segment, and Embed in order with a records scope when RunNow is true, and never throws when a stage fails', async () => {
        const { items, chunks, provider, contextUser } = createFakeEnvironment();
        const processCalls: { processID: string; recordIDs: string[] }[] = [];

        vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockImplementation(async (processID, options) => {
            const scope = options.Scope as { Kind: string; RecordIDs: string[] };
            processCalls.push({ processID, recordIDs: scope.RecordIDs });
            if (processID === CONTENT_PIPELINE_SEGMENT_PROCESS_ID) {
                chunks.push(
                    { ID: 'CHK-1', ContentItemID: scope.RecordIDs[0], DeleteStatus: null },
                    { ID: 'CHK-2', ContentItemID: scope.RecordIDs[0], DeleteStatus: null },
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
            { processID: CONTENT_PIPELINE_TAG_PROCESS_ID, recordIDs: ['ITEM-UPLOAD-1'] },
            { processID: CONTENT_PIPELINE_SEGMENT_PROCESS_ID, recordIDs: ['ITEM-UPLOAD-1'] },
            { processID: CONTENT_PIPELINE_EMBED_PROCESS_ID, recordIDs: ['CHK-1', 'CHK-2'] },
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

    it('Remove marks the Content Item and its chunks as Pending delete and runs Delete processes when RunNow is true', async () => {
        const { items, chunks, provider, contextUser } = createFakeEnvironment();

        await ContentUploadIngestor.Ingest({
            ContentSourceID: 'SRC-UPLOAD-1',
            FileID: 'FILE-500',
            Name: 'retire-me.pdf',
            ContextUser: contextUser,
            Provider: provider,
        });
        chunks.push(
            { ID: 'CHK-501', ContentItemID: 'ITEM-UPLOAD-1', DeleteStatus: null },
            { ID: 'CHK-502', ContentItemID: 'ITEM-UPLOAD-1', DeleteStatus: null },
        );

        const deleteCalls: { processID: string; recordIDs: string[] }[] = [];
        vi.spyOn(RecordProcessExecutor.prototype, 'RunByID').mockImplementation(async (processID, options) => {
            const scope = options.Scope as { Kind: string; RecordIDs: string[] };
            deleteCalls.push({ processID, recordIDs: scope.RecordIDs });
            return {
                Status: 'Completed',
                Processed: scope.RecordIDs.length,
                Success: scope.RecordIDs.length,
                Error: 0,
                Skipped: 0,
                ProcessRunID: 'RUN-DEL',
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
            ContentItemIDs: ['ITEM-UPLOAD-1'],
            DependentsMarked: 2,
        });
        expect(items[0].DeleteStatus).toBe('Pending');
        expect(chunks.map((c) => c.DeleteStatus)).toEqual(['Pending', 'Pending']);
        expect(deleteCalls).toEqual([
            { processID: CONTENT_PIPELINE_DELETE_PROCESS_ID, recordIDs: ['ITEM-UPLOAD-1'] },
            { processID: CONTENT_PIPELINE_DELETE_CHUNKS_PROCESS_ID, recordIDs: ['CHK-501', 'CHK-502'] },
        ]);
    });

    it('Sync over an Upload source returns Skipped and marks zero existing uploaded items for deletion', async () => {
        vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
            ContentSourceID: 'SRC-UPLOAD-1',
            URL: '',
            Settings: {},
            DriverClass: 'AutotagUpload',
            Parameters: {},
            Configuration: { IsPushOnly: true },
            TypeConfiguration: { IsPushOnly: true },
            Problems: [],
            IsValid: true,
        } as never);

        const markedForDelete: string[] = [];
        const commit = vi.fn(async () => ({ RecordID: 'SRC-UPLOAD-1', ColumnsWritten: [], Created: false }));
        const processor = new PipelineProcessor(
            { Stages: ['Discover'], IsTest: false, Configuration: { Mode: 'Sync' } },
            {
                Hydrator: () =>
                    ({
                        Hydrate: async () =>
                            new WorkingRecord(new WorkingRecordIdentity('Content Source', '', 'SRC-UPLOAD-1')),
                    }) as unknown as WorkingRecordHydrator,
                Committer: () => ({ Commit: commit }) as unknown as WorkingRecordCommitter,
            },
        );

        const result = await processor.ProcessRecord(
            { EntityID: 'E-SOURCE', RecordID: 'SRC-UPLOAD-1' } as never,
            {
                ContextUser: {} as never,
                Provider: {
                    EntityByName: () => ({ ID: 'E-ITEM' }),
                    RunView: async () => ({
                        Success: true,
                        Results: [
                            { ID: 'ITEM-UPLOAD-1', URL: UploadItemURL('FILE-1'), __mj_CreatedAt: new Date('2026-10-01T00:00:00Z') },
                            { ID: 'ITEM-UPLOAD-2', URL: UploadItemURL('FILE-2'), __mj_CreatedAt: new Date('2026-10-01T00:00:00Z') },
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

        expect(result.Status).toBe('Skipped');
        expect(markedForDelete).toEqual([]);
    });
});
