/**
 * @fileoverview An item's `EmbeddingStatus` follows its chunks.
 *
 * Embed runs over chunks, so without a rollup the item stays at the Pending that Extract left it at. These
 * tests cover the rule (what a set of chunk statuses comes to), the writer, the three places that use it
 * (after an Embed page, the Settle Item Embedding stage, and Segment ending an item without chunks), and what
 * must be left alone. Written against stand-in rows and a stand-in provider.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BasePipelineStage,
    Outcome,
    StageContext,
    StageOutcome,
    WorkingRecord,
    WorkingRecordEntity,
    WorkingRecordIdentity,
} from '@memberjunction/content-pipeline-base';
import { ItemEmbeddingRollup, RollUpItemEmbedding } from '../ItemEmbeddingRollup.js';
import { PipelineProcessor } from '../PipelineProcessor.js';
import { SettleItemEmbeddingStage } from '../stages/SettleItemEmbeddingStage.js';
import { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import type { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';

describe('what an item\'s chunks come to', () => {
    it('leaves the item alone while it has no chunks', () => {
        expect(RollUpItemEmbedding([])).toBeNull();
    });

    it('leaves the item alone while any chunk still has embedding work', () => {
        expect(RollUpItemEmbedding(['Complete', 'Pending'])).toBeNull();
        expect(RollUpItemEmbedding(['Complete', 'MetadataOnly'])).toBeNull();
        expect(RollUpItemEmbedding(['Complete', 'Processing'])).toBeNull();
        expect(RollUpItemEmbedding(['Complete', null])).toBeNull();
        expect(RollUpItemEmbedding(['Failed', 'Pending'])).toBeNull();
    });

    it('is Complete when every chunk is embedded', () => {
        expect(RollUpItemEmbedding(['Complete', 'Complete'])).toBe('Complete');
    });

    it('is Complete when the skipped chunks sit among embedded ones', () => {
        expect(RollUpItemEmbedding(['Complete', 'Skipped'])).toBe('Complete');
    });

    it('is Failed when any chunk failed', () => {
        expect(RollUpItemEmbedding(['Complete', 'Failed', 'Skipped'])).toBe('Failed');
    });

    it('is Skipped when every chunk was skipped: nothing of the item was embedded', () => {
        expect(RollUpItemEmbedding(['Skipped', 'Skipped'])).toBe('Skipped');
    });
});

/** A stored row behind an entity object, as the provider would hand it out. */
type Row = Record<string, unknown>;
interface Chunk {
    ID: string;
    ContentItemID: string;
    EmbeddingStatus: string | null;
}

/**
 * A provider over a few items and their live chunks. `RunView` answers the two reads the rollup makes:
 * a chunk's owner, and an item's chunk statuses. `saves` lists each item save.
 */
function providerOver(items: Record<string, Row>, chunks: Chunk[]) {
    const saves: string[] = [];
    const quoted = (filter: string) => [...filter.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const provider = {
        RunView: async (params: { Fields: string[]; ExtraFilter: string }) => {
            const ids = quoted(params.ExtraFilter);
            const owners = !params.Fields.includes('EmbeddingStatus');
            return {
                Success: true,
                Results: chunks
                    .filter((c) => ids.includes(owners ? c.ID : c.ContentItemID))
                    .map((c) => (owners ? { ContentItemID: c.ContentItemID } : { ContentItemID: c.ContentItemID, EmbeddingStatus: c.EmbeddingStatus })),
            };
        },
        GetEntityObject: async () => {
            let stored: Row = {};
            const target: Row = {
                InnerLoad: async (key: { KeyValuePairs: { Value: string }[] }) => {
                    stored = items[key.KeyValuePairs[0].Value];
                    return !!stored;
                },
                Save: async () => {
                    saves.push(`${stored.ID}=${stored.EmbeddingStatus}`);
                    return true;
                },
            };
            return new Proxy(target, {
                get: (t, prop: string) => (prop in t ? t[prop] : stored[prop]),
                set: (_t, prop: string, value: unknown) => {
                    stored[prop] = value;
                    return true;
                },
            });
        },
    };
    return { provider, saves };
}

/** An item that was cut into chunks and is waiting for them to be embedded. */
function cutItem(id: string, extra: Row = {}): Row {
    return { ID: id, SegmentationStatus: 'Complete', EmbeddingStatus: 'Pending', DeleteStatus: null, LastEmbeddedAt: null, ...extra };
}

describe('settling items', () => {
    it('sets an item Complete, with the time, once all its chunks are embedded', async () => {
        const items = { I1: cutItem('I1') };
        const { provider, saves } = providerOver(items, [
            { ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Complete' },
            { ID: 'C2', ContentItemID: 'I1', EmbeddingStatus: 'Complete' },
        ]);

        const settled = await new ItemEmbeddingRollup(provider as never, {} as never).Settle(['I1']);

        expect(settled).toEqual([{ ItemID: 'I1', Status: 'Complete', Written: true }]);
        expect(items.I1.EmbeddingStatus).toBe('Complete');
        expect(items.I1.LastEmbeddedAt).toBeInstanceOf(Date);
        expect(saves).toEqual(['I1=Complete']);
    });

    it('settles each item on its own chunks: one done, one still embedding', async () => {
        const items = { I1: cutItem('I1'), I2: cutItem('I2') };
        const { provider } = providerOver(items, [
            { ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Complete' },
            { ID: 'C2', ContentItemID: 'I2', EmbeddingStatus: 'Complete' },
            { ID: 'C3', ContentItemID: 'I2', EmbeddingStatus: 'Pending' },
        ]);

        await new ItemEmbeddingRollup(provider as never, {} as never).Settle(['I1', 'I2', 'I1']);

        expect(items.I1.EmbeddingStatus).toBe('Complete');
        expect(items.I2.EmbeddingStatus).toBe('Pending');
    });

    it('finds the items from their chunks', async () => {
        const items = { I1: cutItem('I1') };
        const { provider } = providerOver(items, [{ ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Failed' }]);

        await new ItemEmbeddingRollup(provider as never, {} as never).SettleItemsOfChunks(['C1']);

        expect(items.I1.EmbeddingStatus).toBe('Failed');
        expect(items.I1.LastEmbeddedAt).toBeNull();
    });

    it('brings a metadata refresh back to Complete once the chunks are refreshed', async () => {
        const items = { I1: cutItem('I1', { EmbeddingStatus: 'MetadataOnly' }) };
        const { provider } = providerOver(items, [{ ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Complete' }]);

        await new ItemEmbeddingRollup(provider as never, {} as never).Settle(['I1']);

        expect(items.I1.EmbeddingStatus).toBe('Complete');
    });

    it('leaves an item Segment is due to cut again: its new chunks will settle it', async () => {
        const items = { I1: cutItem('I1', { SegmentationStatus: 'Pending' }) };
        const { provider, saves } = providerOver(items, [{ ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Complete' }]);

        const [settled] = await new ItemEmbeddingRollup(provider as never, {} as never).Settle(['I1']);

        expect(settled.Written).toBe(false);
        expect(items.I1.EmbeddingStatus).toBe('Pending');
        expect(saves).toEqual([]);
    });

    it('leaves an item that is being deleted', async () => {
        const items = { I1: cutItem('I1', { DeleteStatus: 'Pending' }) };
        const { provider, saves } = providerOver(items, [{ ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Complete' }]);

        await new ItemEmbeddingRollup(provider as never, {} as never).Settle(['I1']);

        expect(saves).toEqual([]);
    });

    it('writes nothing when the item already says so', async () => {
        const items = { I1: cutItem('I1', { EmbeddingStatus: 'Complete' }) };
        const { provider, saves } = providerOver(items, [{ ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Complete' }]);

        const [settled] = await new ItemEmbeddingRollup(provider as never, {} as never).Settle(['I1']);

        expect(settled).toEqual({ ItemID: 'I1', Status: 'Complete', Written: false });
        expect(saves).toEqual([]);
    });

    it('only reports when asked not to write', async () => {
        const items = { I1: cutItem('I1') };
        const { provider, saves } = providerOver(items, [{ ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Complete' }]);

        const [settled] = await new ItemEmbeddingRollup(provider as never, {} as never).Settle(['I1'], false);

        expect(settled).toEqual({ ItemID: 'I1', Status: 'Complete', Written: false });
        expect(saves).toEqual([]);
    });
});

/** Stands in for Embed: a chunk stage that embeds the whole page in its finalize. */
@RegisterClass(BasePipelineStage, 'RollupTestEmbed')
class RollupTestEmbedStage extends BasePipelineStage {
    public readonly Name = 'RollupTestEmbed';
    public readonly Entity: WorkingRecordEntity = 'Content Item Chunk';
    public readonly StatusField = 'EmbeddingStatus';
    public async Run(): Promise<StageOutcome> {
        return Outcome.Complete();
    }
    public override async Finalize(records: readonly WorkingRecord[]) {
        return records.map((r) => ({ Key: r.Identity.Key, Outcome: Outcome.Complete() }));
    }
}

/** Stands in for Tag: a chunk stage that is not Embed. */
@RegisterClass(BasePipelineStage, 'RollupTestTag')
class RollupTestTagStage extends BasePipelineStage {
    public readonly Name = 'RollupTestTag';
    public readonly Entity: WorkingRecordEntity = 'Content Item Chunk';
    public readonly StatusField = 'TaggingStatus';
    public async Run(): Promise<StageOutcome> {
        return Outcome.Complete();
    }
}

describe('after an Embed page', () => {
    let items: Record<string, Row>;
    let chunks: Chunk[];

    beforeEach(() => {
        items = { I1: cutItem('I1') };
        chunks = [
            { ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Pending' },
            { ID: 'C2', ContentItemID: 'I1', EmbeddingStatus: 'Pending' },
        ];
    });

    /** Runs a page over the chunks; committing a chunk sets its stored status. */
    async function runPage(stage: string, ids: string[], isTest = false) {
        const { provider } = providerOver(items, chunks);
        const storage = {
            Hydrator: () =>
                ({
                    Hydrate: async (_entity: WorkingRecordEntity, id: string) => {
                        const chunk = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', `u/${id}`, id));
                        chunk.SetExtension('Pipeline', 'contentItemID', chunks.find((c) => c.ID === id)!.ContentItemID);
                        return chunk;
                    },
                }) as unknown as WorkingRecordHydrator,
            Committer: () =>
                ({
                    Commit: async (record: WorkingRecord, field: string | null, status: string | null) => {
                        if (field === 'EmbeddingStatus') {
                            chunks.find((c) => c.ID === record.Identity.RecordID)!.EmbeddingStatus = status;
                        }
                        return { RecordID: record.Identity.RecordID, ColumnsWritten: [], Created: false };
                    },
                }) as unknown as WorkingRecordCommitter,
        };
        const processor = new PipelineProcessor({ Stages: [stage], IsTest: isTest, Configuration: {} }, storage);
        const refs = ids.map((RecordID) => ({ EntityID: 'E1', RecordID }) as never);
        await processor.ProcessBatch!(refs, { ContextUser: {}, Provider: provider } as never);
    }

    it('settles the item when the page embeds its last chunks', async () => {
        await runPage('RollupTestEmbed', ['C1', 'C2']);

        expect(items.I1.EmbeddingStatus).toBe('Complete');
    });

    it('leaves the item while a later page still holds some of its chunks, and that page settles it', async () => {
        await runPage('RollupTestEmbed', ['C1']);
        expect(items.I1.EmbeddingStatus).toBe('Pending');

        await runPage('RollupTestEmbed', ['C2']);
        expect(items.I1.EmbeddingStatus).toBe('Complete');
    });

    it('writes nothing in a test run', async () => {
        await runPage('RollupTestEmbed', ['C1', 'C2'], true);

        expect(items.I1.EmbeddingStatus).toBe('Pending');
    });

    it('is only done after Embed', async () => {
        chunks.forEach((c) => (c.EmbeddingStatus = 'Complete'));

        const { provider } = providerOver(items, chunks);
        const processor = new PipelineProcessor(
            { Stages: ['RollupTestTag'], IsTest: false, Configuration: {} },
            {
                Hydrator: () =>
                    ({
                        Hydrate: async (_e: WorkingRecordEntity, id: string) => {
                            const chunk = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', `u/${id}`, id));
                            chunk.SetExtension('Pipeline', 'contentItemID', 'I1');
                            return chunk;
                        },
                    }) as unknown as WorkingRecordHydrator,
                Committer: () => ({ Commit: async () => ({ RecordID: 'C1', ColumnsWritten: [], Created: false }) }) as unknown as WorkingRecordCommitter,
            },
        );
        await processor.ProcessRecord({ EntityID: 'E1', RecordID: 'C1' } as never, { ContextUser: {}, Provider: provider } as never);

        expect(items.I1.EmbeddingStatus).toBe('Pending');
    });
});

describe('the Settle Item Embedding stage', () => {
    function context(provider: unknown, isTest = false): StageContext {
        return { Provider: provider, ContextUser: {}, IsTest: isTest } as unknown as StageContext;
    }
    function item(id: string): WorkingRecord {
        return new WorkingRecord(new WorkingRecordIdentity('Content Item', `u/${id}`, id));
    }

    it('settles an item a page missed', async () => {
        const items = { I1: cutItem('I1') };
        const { provider } = providerOver(items, [{ ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Skipped' }]);

        const outcome = await new SettleItemEmbeddingStage().Run(item('I1'), context(provider));

        expect(outcome.Status).toBe('Complete');
        expect(items.I1.EmbeddingStatus).toBe('Skipped');
    });

    it('skips an item whose chunks are still embedding', async () => {
        const items = { I1: cutItem('I1') };
        const { provider } = providerOver(items, [{ ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Pending' }]);

        const outcome = await new SettleItemEmbeddingStage().Run(item('I1'), context(provider));

        expect(outcome.Status).toBe('Skipped');
        expect(items.I1.EmbeddingStatus).toBe('Pending');
    });

    it('only reports in a test run', async () => {
        const items = { I1: cutItem('I1') };
        const { provider, saves } = providerOver(items, [{ ID: 'C1', ContentItemID: 'I1', EmbeddingStatus: 'Complete' }]);

        const outcome = await new SettleItemEmbeddingStage().Run(item('I1'), context(provider, true));

        expect(outcome.Message).toContain('would be Complete');
        expect(saves).toEqual([]);
    });
});

describe('Segment ending an item without chunks', () => {
    const FIELDS = ['ID', 'Text', 'ExtractionStatus', 'TaggingStatus', 'SegmentationStatus', 'EmbeddingStatus', 'DeleteStatus', 'RetryCount', 'RetryAfter'];

    async function commitSegment(status: string | null, embeddingStatus = 'Pending'): Promise<Row> {
        const stored: Row = { ID: 'I1', SegmentationStatus: 'Pending', EmbeddingStatus: embeddingStatus, RetryCount: 0, RetryAfter: null };
        const target: Row = { Fields: FIELDS.map((Name) => ({ Name })), InnerLoad: async () => true, Save: async () => true, NewRecord: () => {} };
        const row = new Proxy(target, {
            get: (t, prop: string) => (prop in t ? t[prop] : stored[prop]),
            set: (_t, prop: string, value: unknown) => {
                stored[prop] = value;
                return true;
            },
        });
        const committer = new WorkingRecordCommitter({ GetEntityObject: async () => row } as never, {} as never);
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'u/I1', 'I1'));
        await committer.Commit(record, 'SegmentationStatus', status, status === 'Complete');
        return stored;
    }

    it('fails the item\'s embedding when Segment failed', async () => {
        expect((await commitSegment('Failed')).EmbeddingStatus).toBe('Failed');
    });

    it('skips the item\'s embedding when there was nothing to cut', async () => {
        expect((await commitSegment('Skipped')).EmbeddingStatus).toBe('Skipped');
    });

    it('leaves it Pending when Segment cut chunks: they settle it once embedded', async () => {
        expect((await commitSegment('Complete')).EmbeddingStatus).toBe('Pending');
    });

    it('leaves it Pending when Segment will retry', async () => {
        expect((await commitSegment(null)).EmbeddingStatus).toBe('Pending');
    });
});
