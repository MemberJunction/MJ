/**
 * @fileoverview Regression cover for the defects found in review of the pipeline's first PR.
 *
 * Each of these passed its unit tests before, because the tests mocked the piece that was broken.
 * They are written against the seam the defect actually lived in.
 */
import { describe, expect, it } from 'vitest';
import { WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';
import { WorkingRecordHydrator } from '../WorkingRecordHydrator.js';
import { DeleteContentItemStage, DeleteStage } from '../stages/DeleteStage.js';

function committer() {
    const c = new WorkingRecordCommitter({} as never, {} as never);
    return c as unknown as {
        contentChanged(child: WorkingRecord, entityObject: unknown): boolean;
        applyConfidence(r: WorkingRecord, e: unknown, written: string[], reset?: boolean): void;
    };
}

const row = (stored: Record<string, unknown>, fields: string[] = []) =>
    new Proxy(
        {
            Fields: fields.map((Name) => ({ Name })),
        } as Record<string, unknown>,
        {
            get: (target, prop: string) => (prop in target ? target[prop] : stored[prop]),
            set: (target, prop: string, value: unknown) => {
                if (prop in target) {
                    target[prop] = value;
                } else {
                    stored[prop] = value;
                }
                return true;
            },
        },
    );

function discovered(checksum: string): WorkingRecord {
    const r = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
    r.SetExtension('Pipeline', 'columns', { Checksum: checksum });
    return r;
}

describe('re-discovery uses the checksum, not the text', () => {
    it('is a no-op when the checksum is unchanged, even though Discover produces no text', () => {
        // The defect: Discover never sets Text, so comparing text made EVERY re-walk look changed
        // and reset every item through the whole pipeline.
        expect(committer().contentChanged(discovered('abc'), row({ Checksum: 'abc', Text: 'stored' }))).toBe(false);
    });

    it('detects a changed checksum', () => {
        expect(committer().contentChanged(discovered('def'), row({ Checksum: 'abc', Text: 'stored' }))).toBe(true);
    });

    it('treats a row that has never been checksummed as changed', () => {
        expect(committer().contentChanged(discovered('abc'), row({ Text: 'stored' }))).toBe(true);
    });

    it('still falls back to text for records produced without a checksum', () => {
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/b'));
        child.Propose('Text', 'same', 6, 'Extract');
        expect(committer().contentChanged(child, row({ Text: 'same' }))).toBe(false);
    });
});

describe('changed content clears the confidence it was earned against', () => {
    it('writes null, so a re-extraction is not fighting its own previous score', () => {
        // Without this, hydrate restores Text at 6, Extract re-proposes at 6, the tie keeps the OLD
        // value, and the record is marked Complete holding stale text.
        const stored: Record<string, unknown> = {};
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.Propose('Text', 'fresh', 6, 'Extract');
        committer().applyConfidence(record, row(stored, ['FieldConfidence']), [], true);
        expect(stored.FieldConfidence).toBeNull();
    });

    it('keeps the normal map when the content did not change', () => {
        const stored: Record<string, unknown> = {};
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.Propose('Text', 'fresh', 6, 'Extract');
        committer().applyConfidence(record, row(stored, ['FieldConfidence']), [], false);
        expect(typeof stored.FieldConfidence).toBe('string');
        expect(stored.FieldConfidence).toContain('Extract');
    });
});

describe('the delete stages speak their status column’s vocabulary', () => {
    it("says 'Deleted', because DeleteStatus has no 'Complete'", () => {
        // CK_ContentItem_DeleteStatus allows only Pending and Deleted; committing 'Complete'
        // violated the constraint and the stage could never finish.
        expect(new DeleteContentItemStage().CompleteStatus).toBe('Deleted');
        expect(new DeleteStage().CompleteStatus).toBe('Deleted');
    });

    it('still writes DeleteStatus as its status field', () => {
        expect(new DeleteContentItemStage().StatusField).toBe('DeleteStatus');
    });
});

describe('the hydrator publishes the statuses the gates read', () => {
    const hydrator = () =>
        new WorkingRecordHydrator({} as never, {} as never) as unknown as {
            FromEntity(entity: 'Content Item', entityObject: unknown): WorkingRecord;
        };

    it('carries DeleteStatus through, so the pending-delete skip fires on a real row', () => {
        const record = hydrator().FromEntity(
            'Content Item',
            row({ ID: 'I1', URL: 'https://x.test/a', DeleteStatus: 'Pending' }, ['URL', 'DeleteStatus']),
        );
        expect(record.GetExtension<string>('Pipeline', 'deleteStatus')).toBe('Pending');
    });

    it('carries EmbeddingStatus through, so the metadata-only embed path fires', () => {
        const record = hydrator().FromEntity(
            'Content Item',
            row({ ID: 'I1', URL: 'https://x.test/a', EmbeddingStatus: 'MetadataOnly' }, ['URL', 'EmbeddingStatus']),
        );
        expect(record.GetExtension<string>('Pipeline', 'embeddingStatus')).toBe('MetadataOnly');
    });

    it('leaves them unset when the row has no value, rather than inventing one', () => {
        const record = hydrator().FromEntity(
            'Content Item',
            row({ ID: 'I1', URL: 'https://x.test/a' }, ['URL', 'DeleteStatus']),
        );
        expect(record.GetExtension<string>('Pipeline', 'deleteStatus')).toBeUndefined();
    });

    it('hydrates LastDiscoveredAt and LastSyncedAt watermarks onto Content Source records', () => {
        const discoveredAt = new Date('2026-10-15T10:00:00Z');
        const syncedAt = new Date('2026-10-15T12:00:00Z');
        const sourceHydrator = new WorkingRecordHydrator({} as never, {} as never) as unknown as {
            FromEntity(entity: 'Content Source', entityObject: unknown): WorkingRecord;
        };
        const record = sourceHydrator.FromEntity(
            'Content Source',
            row(
                { ID: 'S1', URL: 'https://x.test', LastDiscoveredAt: discoveredAt, LastSyncedAt: syncedAt },
                ['URL', 'LastDiscoveredAt', 'LastSyncedAt'],
            ),
        );
        expect(record.GetExtension<Date>('Pipeline', 'lastDiscoveredAt')?.toISOString()).toBe(discoveredAt.toISOString());
        expect(record.GetExtension<Date>('Pipeline', 'lastSyncedAt')?.toISOString()).toBe(syncedAt.toISOString());
    });
});

describe('Extract SHA-256 checksum comparison and custom Columns / Request escape hatches', () => {
    const HASH_A = 'a'.repeat(64);
    const HASH_B = 'b'.repeat(64);
    const ITEM_FIELDS = [
        'ID',
        'URL',
        'Name',
        'Text',
        'Description',
        'Checksum',
        'FieldConfidence',
        'ExtractionStatus',
        'TaggingStatus',
        'SegmentationStatus',
        'EmbeddingStatus',
        'DeleteStatus',
    ];

    function buildCommitterWithRow(stored: Record<string, unknown>, fields: string[] = ITEM_FIELDS) {
        stored.InnerLoad = async () => true;
        stored.Save = async () => true;
        stored.NewRecord = () => {};
        const entityRow = row(stored, fields);
        const provider = {
            GetEntityObject: async () => entityRow,
        };
        return new WorkingRecordCommitter(provider as never, {} as never);
    }

    it('leaves TaggingStatus and SegmentationStatus untouched when re-extracted SHA-256 checksum is unchanged', async () => {
        const stored: Record<string, unknown> = {
            ID: 'I1',
            Checksum: HASH_A,
            Text: 'same body',
            ExtractionStatus: 'Pending',
            TaggingStatus: 'Complete',
            SegmentationStatus: 'Complete',
            EmbeddingStatus: 'Complete',
        };
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.Propose('Text', 'same body', 6, 'Extract');
        record.SetExtension('Pipeline', 'checksum', HASH_A);

        await buildCommitterWithRow(stored).Commit(record, 'ExtractionStatus', 'Complete', true);

        expect(stored.ExtractionStatus).toBe('Complete');
        expect(stored.TaggingStatus).toBe('Complete');
        expect(stored.SegmentationStatus).toBe('Complete');
        expect(stored.EmbeddingStatus).toBe('Complete');
    });

    it('promotes EmbeddingStatus to MetadataOnly when checksum is unchanged but a custom column or field changed', async () => {
        const stored: Record<string, unknown> = {
            ID: 'I1',
            Checksum: HASH_A,
            Text: 'same body',
            Description: 'old summary',
            ExtractionStatus: 'Pending',
            TaggingStatus: 'Complete',
            SegmentationStatus: 'Complete',
            EmbeddingStatus: 'Complete',
        };
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.Propose('Text', 'same body', 6, 'Extract');
        record.SetExtension('Pipeline', 'checksum', HASH_A);
        record.SetExtension('Pipeline', 'customColumns', { Description: 'new summary' });

        await buildCommitterWithRow(stored).Commit(record, 'ExtractionStatus', 'Complete', true);

        expect(stored.Description).toBe('new summary');
        expect(stored.TaggingStatus).toBe('Complete');
        expect(stored.SegmentationStatus).toBe('Complete');
        expect(stored.EmbeddingStatus).toBe('MetadataOnly');
    });

    it('writes the new Checksum and resets downstream stages when the extracted SHA-256 hash changes', async () => {
        const stored: Record<string, unknown> = {
            ID: 'I1',
            Checksum: HASH_A,
            Text: 'old body',
            ExtractionStatus: 'Pending',
            TaggingStatus: 'Complete',
            SegmentationStatus: 'Complete',
            EmbeddingStatus: 'Complete',
        };
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.Propose('Text', 'new body', 6, 'Extract');
        record.SetExtension('Pipeline', 'checksum', HASH_B);

        await buildCommitterWithRow(stored).Commit(record, 'ExtractionStatus', 'Complete', true);

        expect(stored.Checksum).toBe(HASH_B);
        expect(stored.TaggingStatus).toBe('Pending');
        expect(stored.SegmentationStatus).toBe('Pending');
        expect(stored.EmbeddingStatus).toBe('Pending');
        expect(stored.FieldConfidence).toBeNull();
    });

    it('honors Request = Reprocess even when the extracted SHA-256 hash is unchanged', async () => {
        const stored: Record<string, unknown> = {
            ID: 'I1',
            Checksum: HASH_A,
            Text: 'same body',
            ExtractionStatus: 'Pending',
            TaggingStatus: 'Complete',
            SegmentationStatus: 'Complete',
            EmbeddingStatus: 'Complete',
        };
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.Propose('Text', 'same body', 6, 'Extract');
        record.SetExtension('Pipeline', 'checksum', HASH_A);
        record.SetExtension('Pipeline', 'request', 'Reprocess');

        await buildCommitterWithRow(stored).Commit(record, 'ExtractionStatus', 'Complete', true);

        expect(stored.TaggingStatus).toBe('Pending');
        expect(stored.SegmentationStatus).toBe('Pending');
        expect(stored.EmbeddingStatus).toBe('Pending');
    });

    it('rejects framework-owned columns passed through Columns', async () => {
        const stored: Record<string, unknown> = { ID: 'I1', ExtractionStatus: 'Pending' };
        const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
        record.SetExtension('Pipeline', 'customColumns', { Checksum: 'illegal-override' });

        await expect(buildCommitterWithRow(stored).Commit(record, 'ExtractionStatus', 'Complete', true)).rejects.toThrow(
            /owned by the pipeline framework/,
        );
    });

    it('revives an item marked DeleteStatus = Pending and resets downstream stages so deleted chunks are recreated', async () => {
        const stored: Record<string, unknown> = {
            ID: 'I1',
            URL: 'https://x.test/a',
            Checksum: HASH_A,
            DeleteStatus: 'Pending',
            ExtractionStatus: 'Complete',
            TaggingStatus: 'Complete',
            SegmentationStatus: 'Complete',
            EmbeddingStatus: 'Complete',
            InnerLoad: async () => true,
            Save: async () => true,
            NewRecord: () => {},
        };
        const entityRow = row(stored, ITEM_FIELDS);
        const provider = {
            RunView: async (params: { ExtraFilter: string }) => {
                if (params.ExtraFilter.includes("DeleteStatus='Pending'")) {
                    return { Success: true, Results: [{ ID: 'I1' }] };
                }
                return { Success: true, Results: [] };
            },
            GetEntityObject: async () => entityRow,
        };
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a'));
        await new WorkingRecordCommitter(provider as never, {} as never).CommitChild(
            child,
            { ContentSourceID: 'S1' },
            'ExtractionStatus',
            'Pending',
        );

        expect(stored.DeleteStatus).toBeNull();
        expect(stored.Checksum).toBeNull();
        expect(stored.ExtractionStatus).toBe('Pending');
        expect(stored.TaggingStatus).toBe('Pending');
        expect(stored.SegmentationStatus).toBe('Pending');
        expect(stored.EmbeddingStatus).toBe('Pending');
    });

    it('preserves higher-confidence Extract fields and does not trigger false Sync updates when Discover proposes a lower-confidence Title', async () => {
        const stored: Record<string, unknown> = {
            ID: 'I1',
            URL: 'https://x.test/doc.pdf',
            Name: 'Q3 Financial Report',
            ExtractionStatus: 'Complete',
            EmbeddingStatus: 'Complete',
            FieldConfidence: JSON.stringify({
                Title: { Score: 6, SetBy: 'Extract' },
                Text: { Score: 6, SetBy: 'Extract' },
            }),
            InnerLoad: async () => true,
            Save: async () => true,
            NewRecord: () => {},
        };
        const entityRow = row(stored, ITEM_FIELDS);
        const provider = {
            RunView: async () => ({ Success: true, Results: [{ ID: 'I1' }] }),
            GetEntityObject: async () => entityRow,
        };
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/doc.pdf'));
        child.Propose('Title', 'doc.pdf', 4, 'Discover');
        child.SetExtension('Pipeline', 'syncWalk', true);

        const result = await new WorkingRecordCommitter(provider as never, {} as never).CommitChild(
            child,
            { ContentSourceID: 'S1' },
            'ExtractionStatus',
            'Pending',
        );

        expect(result.ColumnsWritten).toEqual([]);
        expect(stored.Name).toBe('Q3 Financial Report');
        expect(stored.ExtractionStatus).toBe('Complete');
        expect(stored.EmbeddingStatus).toBe('Complete');
    });

    it('promotes live embedded chunks to MetadataOnly when Discover updates custom columns on an existing item', async () => {
        const chunkStored: Record<string, unknown> = {
            ID: 'C1',
            EmbeddingStatus: 'Complete',
            Save: async () => true,
        };
        const chunkRow = row(chunkStored, ['ID', 'EmbeddingStatus']);
        const stored: Record<string, unknown> = {
            ID: 'I1',
            URL: 'https://x.test/a',
            Description: 'old summary',
            ExtractionStatus: 'Complete',
            EmbeddingStatus: 'Pending',
            InnerLoad: async () => true,
            Save: async () => true,
            NewRecord: () => {},
        };
        const entityRow = row(stored, ITEM_FIELDS);
        const provider = {
            RunView: async (params: { EntityName: string }) => {
                if (params.EntityName === 'MJ: Content Item Chunks') {
                    return { Success: true, Results: [chunkRow] };
                }
                return { Success: true, Results: [{ ID: 'I1' }] };
            },
            GetEntityObject: async () => entityRow,
        };
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a'));
        child.SetExtension('Pipeline', 'customColumns', { Description: 'new summary' });

        await new WorkingRecordCommitter(provider as never, {} as never).CommitChild(
            child,
            { ContentSourceID: 'S1' },
            'ExtractionStatus',
            'Pending',
        );

        expect(stored.Description).toBe('new summary');
        expect(stored.ExtractionStatus).toBe('Pending');
        expect(chunkStored.EmbeddingStatus).toBe('MetadataOnly');
    });
});
