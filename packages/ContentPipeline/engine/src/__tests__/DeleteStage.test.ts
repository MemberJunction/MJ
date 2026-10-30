/**
 * @fileoverview DeleteStage — what it removes, and when it refuses to say it did.
 *
 * Removal itself now goes through MJ's registered providers (`VectorDBBase` for the vector,
 * `FileStorageBase` for the kept bytes) rather than a pipeline-local writer contract, so what is
 * covered here is the decision the stage owns: telling "there was nothing to remove" apart from
 * "there was something and it could not be reached". Only the first may be marked Deleted — nothing
 * revisits a Deleted row, so marking the second strands the artifact permanently.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentVectorInfrastructure } from '@memberjunction/content-autotagging';
import { FileStorageEngine } from '@memberjunction/storage';
import { StageContext, WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { DeleteContentItemStage, DeleteStage } from '../stages/DeleteStage.js';
import { ContentSourceConfigurationResolver } from '../ContentSourceConfigurationResolver.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import type { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';
import '../stages/index.js';

function contextWith(configuration: Record<string, unknown> = {}): StageContext {
    return {
        ContextUser: {} as never,
        // No entity metadata: a chunk whose references cannot be checked is kept as a tombstone.
        Provider: { EntityByName: () => undefined } as never,
        Configuration: configuration,
        IsTest: false,
        Signal: new AbortController().signal,
        ReportProgress: () => {},
        Log: { Info: () => {}, Warning: () => {}, Error: () => {} },
        ResolveAccess: async () => null,
    };
}

const chunk = () => new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', 'u/C1', 'C1'));

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('nothing to remove', () => {
    it('completes for a record that was never embedded and never kept', async () => {
        const outcome = await new DeleteStage().Run(chunk(), contextWith());
        expect(outcome.Status).toBe('Complete');
        expect(outcome.Message).toContain('nothing to remove');
    });

    it('marks Deleted, because absent really is absent', () => {
        expect(new DeleteStage().CompleteStatus).toBe('Deleted');
    });
});

describe('something to remove that cannot be reached', () => {
    it('REFUSES to mark Deleted when a vector exists but its index cannot be resolved', async () => {
        // VectorRecordID says a vector is out there; no Content Source says which index holds it.
        // Marking this Deleted would leave it searchable forever with nothing left pointing at it.
        const record = chunk();
        record.SetExtension('Pipeline', 'vectorRecordID', 'vec-1');
        const outcome = await new DeleteStage().Run(record, contextWith());
        expect(outcome.Status).toBe('Skipped');
        expect(outcome.Message).toContain('vector');
        expect(record.GetExtension<string[]>('Delete', 'skipped')).toEqual(['vector']);
    });

    it('leaves the record pending rather than failing it, so a later run can finish the job', async () => {
        const record = chunk();
        record.SetExtension('Pipeline', 'vectorRecordID', 'vec-1');
        const outcome = await new DeleteStage().Run(record, contextWith());
        expect(outcome.Status).not.toBe('Failed');
    });
});

describe('every other stage skips a pending-delete record', () => {
    const storage = (record: WorkingRecord) => ({
        Hydrator: () => ({ Hydrate: async () => record }) as unknown as WorkingRecordHydrator,
        Committer: () =>
            ({ Commit: async () => ({ RecordID: 'C1', ColumnsWritten: [], Created: false }) }) as unknown as WorkingRecordCommitter,
    });
    const rsContext = { ContextUser: {}, Provider: { EntityByName: () => undefined } } as never;
    const ref = { EntityID: 'E1', RecordID: 'C1' } as never;

    it('skips a record marked pending delete', async () => {
        const record = chunk();
        record.SetExtension('Pipeline', 'deleteStatus', 'Pending');
        const processor = new PipelineProcessor(
            { Stages: ['NoOp'], IsTest: false, Configuration: {} },
            storage(record),
        );
        const result = await processor.ProcessRecord(ref, rsContext);
        expect(result.Status).toBe('Skipped');
    });

    it('does NOT skip for Delete itself, which would mean never removing it', async () => {
        const record = chunk();
        record.SetExtension('Pipeline', 'deleteStatus', 'Pending');
        const processor = new PipelineProcessor(
            { Stages: ['Delete'], IsTest: false, Configuration: {} },
            storage(record),
        );
        const result = await processor.ProcessRecord(ref, rsContext);
        expect(result.Status).toBe('Succeeded');
    });

    it('runs normally for a record not marked', async () => {
        const processor = new PipelineProcessor(
            { Stages: ['NoOp'], IsTest: false, Configuration: {} },
            storage(chunk()),
        );
        const result = await processor.ProcessRecord(ref, rsContext);
        expect(result.Status).toBe('Succeeded');
    });
});

describe('what is left behind once the vector is gone', () => {
    const referencedBy = (count: number | null) =>
        ({
            EntityByName: () => ({
                RelatedEntities: [{ RelatedEntity: 'Usage Log', RelatedEntityJoinField: 'ContentItemChunkID' }],
            }),
            RunView: async () => ({ Success: count !== null, Results: [], TotalRowCount: count ?? 0 }),
        }) as never;

    const internals = (stage: DeleteStage) =>
        stage as unknown as { isReferenced(id: string, context: StageContext): Promise<boolean> };

    it('keeps a chunk something references, so usage history still points at real text', async () => {
        const context = { ...contextWith(), Provider: referencedBy(2) };
        expect(await internals(new DeleteStage()).isReferenced('C1', context)).toBe(true);
    });

    it('lets an unreferenced chunk go', async () => {
        const context = { ...contextWith(), Provider: referencedBy(0) };
        expect(await internals(new DeleteStage()).isReferenced('C1', context)).toBe(false);
    });

    it('counts a failed check as referenced — losing history is worse than keeping a row', async () => {
        const context = { ...contextWith(), Provider: referencedBy(null) };
        expect(await internals(new DeleteStage()).isReferenced('C1', context)).toBe(true);
    });

    it("leaves a delete that could not finish Pending: neither Skipped nor Failed is in DeleteStatus's vocabulary", () => {
        expect(new DeleteStage().StatusForOutcome('Skipped')).toBeNull();
        expect(new DeleteStage().StatusForOutcome('Failed')).toBeNull();
    });
});

describe('DeleteContentItemStage — dependent marking and dry-run isolation', () => {
    it('fails transiently (leaving the item Pending) when any dependent Save returns false or throws, after attempting all dependents', async () => {
        const states: Record<string, string | null> = { C1: null, C2: null, K1: null };

        const makeProvider = (mode: 'all-false' | 'throws' | 'partial' | 'all-ok') => ({
            EntityByName: () => undefined,
            RunViews: async () => [
                { Success: true, Results: [{ ID: 'C1' }, { ID: 'C2' }] },
                { Success: true, Results: [{ ID: 'K1' }] },
            ],
            GetEntityObject: async (_entityName: string) => {
                let loadedId = '';
                const obj = {
                    DeleteStatus: null as string | null,
                    LatestResult: { CompleteMessage: 'save refused' },
                    InnerLoad: async (key: { KeyValuePairs: { Value: string }[] }) => {
                        loadedId = key.KeyValuePairs[0].Value;
                        return true;
                    },
                    Save: async () => {
                        if (mode === 'all-false') {
                            return false;
                        }
                        if (mode === 'throws') {
                            throw new Error('deadlock');
                        }
                        if (mode === 'partial' && loadedId === 'C2') {
                            return false;
                        }
                        states[loadedId] = obj.DeleteStatus;
                        return true;
                    },
                };
                return obj;
            },
        });

        const itemRecord = () => new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/item', 'ITEM-1'));

        await expect(
            new DeleteContentItemStage().Run(itemRecord(), { ...contextWith(), Provider: makeProvider('all-false') as never }),
        ).rejects.toThrow(/Could not mark 3 dependent\(s\)/);

        await expect(
            new DeleteContentItemStage().Run(itemRecord(), { ...contextWith(), Provider: makeProvider('throws') as never }),
        ).rejects.toThrow(/Could not mark 3 dependent\(s\)/);

        states.C1 = null;
        states.C2 = null;
        states.K1 = null;
        await expect(
            new DeleteContentItemStage().Run(itemRecord(), { ...contextWith(), Provider: makeProvider('partial') as never }),
        ).rejects.toThrow(/Could not mark 1 dependent\(s\)/);
        expect(states).toEqual({ C1: 'Pending', C2: null, K1: 'Pending' });

        states.C1 = null;
        states.C2 = null;
        states.K1 = null;
        const okOutcome = await new DeleteContentItemStage().Run(itemRecord(), {
            ...contextWith(),
            Provider: makeProvider('all-ok') as never,
        });
        expect(okOutcome.Status).toBe('Complete');
        expect(states).toEqual({ C1: 'Pending', C2: 'Pending', K1: 'Pending' });
    });

    it('resolves vector routes in dry-run mode (IsTest = true): reports Skipped when unroutable and skips DeleteRecords + dependent marking when routable', async () => {
        const deleteRecords = vi.fn(async () => ({ success: true, message: '', data: null }));
        const runViews = vi.fn();

        // 1. Unroutable record in IsTest = true still reports Skipped, matching live mode.
        const unroutable = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/unroutable', 'ITEM-UNROUTABLE'));
        unroutable.SetExtension('Pipeline', 'vectorRecordID', 'vec-unroutable');
        const unroutableOutcome = await new DeleteContentItemStage().Run(unroutable, {
            ...contextWith(),
            IsTest: true,
            Provider: {
                EntityByName: () => undefined,
                RunView: async () => ({ Success: true, Results: [] }),
                RunViews: runViews,
            } as never,
        });
        expect(unroutableOutcome.Status).toBe('Skipped');

        // 2. Routable record in IsTest = true completes without calling DeleteRecords or MarkDependentsOf.
        vi.spyOn(ContentVectorInfrastructure.prototype, 'GroupByInfrastructure').mockImplementation(async (items) => {
            return new Map([['m|idx', [...items]]]);
        });
        vi.spyOn(ContentVectorInfrastructure.prototype, 'Resolve').mockResolvedValue({
            indexName: 'idx',
            embeddingModelID: 'm',
            embeddingModelName: 'm',
            vectorDB: { IsReadOnly: false, DeleteRecords: deleteRecords },
        } as never);
        vi.spyOn(ContentVectorInfrastructure.prototype, 'BuildDirectives').mockResolvedValue({
            Directives: new Map(),
            Rejected: [],
        });

        const routable = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/item', 'ITEM-1'));
        routable.SetExtension('Pipeline', 'vectorRecordID', 'vec-test-1');
        const routableOutcome = await new DeleteContentItemStage().Run(routable, {
            ...contextWith(),
            IsTest: true,
            Provider: {
                EntityByName: () => undefined,
                RunView: async () => ({
                    Success: true,
                    Results: [{ ID: 'ITEM-1', ContentSourceID: 'S1', ContentTypeID: 'CT1', GetAll: () => ({}) }],
                }),
                RunViews: runViews,
            } as never,
        });
        expect(routableOutcome.Status).toBe('Complete');
        expect(deleteRecords).not.toHaveBeenCalled();
        expect(runViews).not.toHaveBeenCalled();
    });

    it('detaches FileID on the Content Item before deleting its MJ: Files row, and fails transiently if detach InnerLoad or Save returns false', async () => {
        const events: string[] = [];
        vi.spyOn(FileStorageEngine.Instance, 'ResolveFileObject').mockResolvedValue({
            ObjectKey: 'copies/item-1.pdf',
            Driver: {
                DeleteObject: async () => {
                    events.push('Driver.DeleteObject');
                },
            },
        } as never);

        const makeFileProvider = (itemLoadOk: boolean, itemSaveOk: boolean) => ({
            EntityByName: () => undefined,
            RunViews: async () => [
                { Success: true, Results: [] },
                { Success: true, Results: [] },
            ],
            GetEntityObject: async (entityName: string) => {
                if (entityName === 'MJ: Files') {
                    return {
                        ProviderID: 'P1',
                        LatestResult: { CompleteMessage: 'file delete error' },
                        InnerLoad: async () => true,
                        Delete: async () => {
                            events.push('file.Delete');
                            return true;
                        },
                    };
                }
                const itemObj = {
                    FileID: 'FILE-1' as string | null,
                    LatestResult: { CompleteMessage: 'item save refused' },
                    InnerLoad: async () => itemLoadOk,
                    Save: async () => {
                        events.push(`item.Save(FileID=${String(itemObj.FileID)})`);
                        return itemSaveOk;
                    },
                };
                return itemObj;
            },
        });

        const itemWithFile = () => {
            const r = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/item', 'ITEM-1'));
            r.SetExtension('Pipeline', 'fileID', 'FILE-1');
            return r;
        };

        // Happy path: clears FileID=null and saves BEFORE file.Delete()
        events.length = 0;
        const okOutcome = await new DeleteContentItemStage().Run(itemWithFile(), {
            ...contextWith(),
            Provider: makeFileProvider(true, true) as never,
        });
        expect(okOutcome.Status).toBe('Complete');
        expect(events).toEqual(['Driver.DeleteObject', 'item.Save(FileID=null)', 'file.Delete']);

        // InnerLoad failure throws TransientStageError before file.Delete
        events.length = 0;
        await expect(
            new DeleteContentItemStage().Run(itemWithFile(), {
                ...contextWith(),
                Provider: makeFileProvider(false, true) as never,
            }),
        ).rejects.toThrow(/could not load Content Item 'ITEM-1' to clear FileID/);
        expect(events).toEqual(['Driver.DeleteObject']);

        // Save() returning false throws TransientStageError before file.Delete
        events.length = 0;
        await expect(
            new DeleteContentItemStage().Run(itemWithFile(), {
                ...contextWith(),
                Provider: makeFileProvider(true, false) as never,
            }),
        ).rejects.toThrow(/could not clear FileID on Content Item 'ITEM-1': item save refused/);
        expect(events).toEqual(['Driver.DeleteObject', 'item.Save(FileID=null)']);
    });

    it('never deletes an uploaded file (MJ: Files row or storage object) that belongs to the caller rather than ExtractStage', async () => {
        const events: string[] = [];
        const resolveSpy = vi.spyOn(FileStorageEngine.Instance, 'ResolveFileObject').mockResolvedValue({
            ObjectKey: 'uploads/user-doc.pdf',
            Driver: {
                DeleteObject: async () => {
                    events.push('Driver.DeleteObject');
                },
            },
        } as never);

        const uploadedItem = new WorkingRecord(
            new WorkingRecordIdentity('Content Item', 'upload://file-user-1', 'ITEM-UPLOAD-1'),
        );
        uploadedItem.SetExtension('Pipeline', 'fileID', 'FILE-USER-1');

        const outcome = await new DeleteContentItemStage().Run(uploadedItem, {
            ...contextWith(),
            Provider: {
                EntityByName: () => undefined,
                RunViews: async () => [
                    { Success: true, Results: [] },
                    { Success: true, Results: [] },
                ],
                GetEntityObject: async () => {
                    events.push('GetEntityObject');
                    return {};
                },
            } as never,
        });

        expect(outcome.Status).toBe('Complete');
        expect(resolveSpy).not.toHaveBeenCalled();
        expect(events).toEqual([]);
    });

    it('leaves the MJ: Files row and storage object in place when ContentSourceConfigurationResolver fails or throws (U1-B1)', async () => {
        const events: string[] = [];
        const resolveFileSpy = vi.spyOn(FileStorageEngine.Instance, 'ResolveFileObject').mockResolvedValue({
            ObjectKey: 'uploads/user-doc.pdf',
            Driver: {
                DeleteObject: async () => {
                    events.push('Driver.DeleteObject');
                },
            },
        } as never);

        const makeItemWithSource = (id: string) => {
            const item = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/doc.pdf', id));
            item.SetExtension('Pipeline', 'fileID', 'FILE-USER-2');
            item.SetExtension('Pipeline', 'contentSourceID', 'SRC-BROKEN');
            return item;
        };

        const provider = {
            EntityByName: () => undefined,
            RunViews: async () => [
                { Success: true, Results: [] },
                { Success: true, Results: [] },
            ],
            GetEntityObject: async () => {
                events.push('GetEntityObject');
                return {};
            },
        } as never;

        // Case 1: Resolver returns IsValid: false
        vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValueOnce({
            ContentSourceID: 'SRC-BROKEN',
            URL: '',
            DriverClass: null,
            TypeConfiguration: {},
            Configuration: {},
            Settings: {},
            Parameters: {},
            Confidence: {},
            Problems: [{ Key: 'ContentSource', Message: 'Content Source row not found' }],
            IsValid: false,
        } as never);

        const invalidOutcome = await new DeleteContentItemStage().Run(makeItemWithSource('ITEM-B1-INVALID'), {
            ...contextWith(),
            Provider: provider,
        });
        expect(invalidOutcome.Status).toBe('Complete');
        expect(resolveFileSpy).not.toHaveBeenCalled();
        expect(events).toEqual([]);

        // Case 2: Resolver throws
        vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockRejectedValueOnce(
            new Error('metadata database unreachable'),
        );

        const thrownOutcome = await new DeleteContentItemStage().Run(makeItemWithSource('ITEM-B1-THROW'), {
            ...contextWith(),
            Provider: provider,
        });
        expect(thrownOutcome.Status).toBe('Complete');
        expect(resolveFileSpy).not.toHaveBeenCalled();
        expect(events).toEqual([]);
    });

    it('still deletes a durable copy on a non-push-only source that has no ObjectKeyTemplate (U1-B2)', async () => {
        const events: string[] = [];
        vi.spyOn(FileStorageEngine.Instance, 'ResolveFileObject').mockResolvedValue({
            ObjectKey: 'copies/website-item.pdf',
            Driver: {
                DeleteObject: async () => {
                    events.push('Driver.DeleteObject');
                },
            },
        } as never);

        vi.spyOn(ContentSourceConfigurationResolver.prototype, 'Resolve').mockResolvedValue({
            ContentSourceID: 'SRC-WEB',
            URL: 'https://x.test',
            DriverClass: 'AutotagWebsite',
            TypeConfiguration: {},
            Configuration: {},
            Settings: {},
            Parameters: {},
            Confidence: {},
            Problems: [],
            IsValid: true,
        } as never);

        const item = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/page.pdf', 'ITEM-WEB-1'));
        item.SetExtension('Pipeline', 'fileID', 'FILE-COPY-1');
        item.SetExtension('Pipeline', 'contentSourceID', 'SRC-WEB');

        const outcome = await new DeleteContentItemStage().Run(item, {
            ...contextWith(),
            Provider: {
                EntityByName: () => undefined,
                RunViews: async () => [
                    { Success: true, Results: [] },
                    { Success: true, Results: [] },
                ],
                GetEntityObject: async (entityName: string) => {
                    if (entityName === 'MJ: Files') {
                        return {
                            ProviderID: 'P1',
                            InnerLoad: async () => true,
                            Delete: async () => {
                                events.push('file.Delete');
                                return true;
                            },
                        };
                    }
                    const itemObj = {
                        FileID: 'FILE-COPY-1' as string | null,
                        InnerLoad: async () => true,
                        Save: async () => {
                            events.push(`item.Save(FileID=${String(itemObj.FileID)})`);
                            return true;
                        },
                    };
                    return itemObj;
                },
            } as never,
        });

        expect(outcome.Status).toBe('Complete');
        expect(events).toEqual(['Driver.DeleteObject', 'item.Save(FileID=null)', 'file.Delete']);
    });
});



