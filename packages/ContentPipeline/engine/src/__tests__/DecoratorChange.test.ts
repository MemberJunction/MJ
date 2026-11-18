/**
 * @fileoverview A changed decorator re-segments the item instead of refreshing vector metadata.
 *
 * Segment copies an item's `Decorator` onto every chunk and Embed embeds it in front of the chunk's
 * text, so the decorator is inside every chunk and every vector. A `MetadataOnly` refresh updates
 * neither: it would leave the old decorator in place while the item reports Complete. The committer
 * therefore sends an item whose decorator changed back to Segment (and Embed), and keeps the cheap
 * refresh for every other metadata change. Written against the committer with a stand-in row.
 */
import { describe, expect, it } from 'vitest';
import { WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';

const HASH = 'a'.repeat(64);
const ITEM_FIELDS = [
    'ID', 'URL', 'Name', 'Text', 'Decorator', 'Checksum', 'FieldConfidence',
    'ExtractionStatus', 'TaggingStatus', 'SegmentationStatus', 'EmbeddingStatus', 'DeleteStatus',
    'RetryCount', 'RetryAfter',
];

/** An item that went all the way through the pipeline. */
function settledItem(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ID: 'I1',
        URL: 'https://x.test/a',
        Name: 'Report',
        Text: 'same body',
        Decorator: 'Journal of X',
        Checksum: HASH,
        ExtractionStatus: 'Complete',
        TaggingStatus: 'Complete',
        SegmentationStatus: 'Complete',
        EmbeddingStatus: 'Complete',
        RetryCount: 0,
        RetryAfter: null,
        ...extra,
    };
}

/**
 * A committer over one stored row. `RunView` answers the child match (the row's ID) and the chunk
 * query a MetadataOnly promotion makes (`chunks`).
 */
function committerOver(stored: Record<string, unknown>, chunks: unknown[] = [], fields: string[] = ITEM_FIELDS): WorkingRecordCommitter {
    const target: Record<string, unknown> = {
        Fields: fields.map((Name) => ({ Name })),
        InnerLoad: async () => true,
        Save: async () => true,
        NewRecord: () => {},
    };
    const entityRow = new Proxy(target, {
        get: (t, prop: string) => (prop in t ? t[prop] : stored[prop]),
        set: (t, prop: string, value: unknown) => {
            if (prop in t) {
                t[prop] = value;
            } else {
                stored[prop] = value;
            }
            return true;
        },
    });
    const provider = {
        GetEntityObject: async () => entityRow,
        RunView: async (params: { EntityName: string }) =>
            params.EntityName === 'MJ: Content Item Chunks'
                ? { Success: true, Results: chunks }
                : { Success: true, Results: [{ ID: stored.ID }] },
    };
    return new WorkingRecordCommitter(provider as never, {} as never);
}

/** The item as Extract hands it back: the same body (same hash), plus whatever else it proposes. */
function extracted(proposals: Record<string, string>, checksum: string | null = HASH): WorkingRecord {
    const record = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
    record.Propose('Text', 'same body', 6, 'Extract');
    for (const [field, value] of Object.entries(proposals)) {
        record.Propose(field as 'Decorator', value, 6, 'Extract');
    }
    if (checksum) {
        record.SetExtension('Pipeline', 'checksum', checksum);
    }
    return record;
}

/** A chunk row a MetadataOnly promotion would mark. */
function embeddedChunk(): { stored: Record<string, unknown>; row: unknown } {
    const stored: Record<string, unknown> = { ID: 'C1', EmbeddingStatus: 'Complete' };
    const row = new Proxy({ Fields: [{ Name: 'ID' }, { Name: 'EmbeddingStatus' }], Save: async () => true } as Record<string, unknown>, {
        get: (t, prop: string) => (prop in t ? t[prop] : stored[prop]),
        set: (_t, prop: string, value: unknown) => {
            stored[prop] = value;
            return true;
        },
    });
    return { stored, row };
}

describe('a changed decorator re-segments', () => {
    it('sends the item back to Segment and Embed when Extract brings a new decorator', async () => {
        const stored = settledItem();
        const chunk = embeddedChunk();

        const result = await committerOver(stored, [chunk.row]).Commit(
            extracted({ Decorator: 'Journal of X · Vol 12' }),
            'ExtractionStatus',
            'Complete',
        );

        expect(stored.Decorator).toBe('Journal of X · Vol 12');
        expect(stored.SegmentationStatus).toBe('Pending');
        expect(stored.EmbeddingStatus).toBe('Pending');
        // The text did not change: extraction and tagging stand, and so does the content hash.
        expect(stored.ExtractionStatus).toBe('Complete');
        expect(stored.TaggingStatus).toBe('Complete');
        expect(stored.Checksum).toBe(HASH);
        // The old chunks are retired by the re-segment, not refreshed in place.
        expect(chunk.stored.EmbeddingStatus).toBe('Complete');
        expect(result.ColumnsWritten).toEqual(expect.arrayContaining(['Decorator', 'SegmentationStatus', 'EmbeddingStatus']));
    });

    it('re-segments an item whose chunks were cut but not yet embedded', async () => {
        const stored = settledItem({ EmbeddingStatus: 'Pending' });

        await committerOver(stored).Commit(extracted({ Decorator: 'Journal of Y' }), 'ExtractionStatus', 'Complete');

        expect(stored.SegmentationStatus).toBe('Pending');
        expect(stored.EmbeddingStatus).toBe('Pending');
    });

    it('re-segments when Extract brings a new decorator without a content hash', async () => {
        const stored = settledItem();

        await committerOver(stored).Commit(extracted({ Decorator: 'Journal of Y' }, null), 'ExtractionStatus', 'Complete');

        expect(stored.SegmentationStatus).toBe('Pending');
        expect(stored.EmbeddingStatus).toBe('Pending');
    });

    it('clears a wait an earlier Retry left: the item has new work', async () => {
        const stored = settledItem({ RetryCount: 3, RetryAfter: new Date() });

        await committerOver(stored).Commit(extracted({ Decorator: 'Journal of Y' }), 'ExtractionStatus', 'Complete');

        expect(stored.RetryCount).toBe(0);
        expect(stored.RetryAfter).toBeNull();
    });

    it('re-segments an existing item Discover finds again with a new decorator', async () => {
        const stored = settledItem();
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a'));
        child.Propose('Decorator', 'Journal of X · Vol 12', 4, 'Discover');
        child.SetExtension('Pipeline', 'syncWalk', true);

        await committerOver(stored).CommitChild(child, { ContentSourceID: 'S1' }, 'ExtractionStatus', 'Pending');

        expect(stored.Decorator).toBe('Journal of X · Vol 12');
        expect(stored.SegmentationStatus).toBe('Pending');
        expect(stored.EmbeddingStatus).toBe('Pending');
        expect(stored.ExtractionStatus).toBe('Complete');
    });

    it('re-segments an existing item delivered with unchanged content and a new decorator', async () => {
        const stored = settledItem();
        const child = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a'));
        child.Propose('Text', 'same body', 6, 'Extract');
        child.Propose('Decorator', 'Archive · member 1', 6, 'Extract');
        child.SetExtension('Pipeline', 'checksum', HASH);

        await committerOver(stored).CommitChild(child, { ContentSourceID: 'S1' }, 'ExtractionStatus', 'Complete');

        expect(stored.SegmentationStatus).toBe('Pending');
        expect(stored.EmbeddingStatus).toBe('Pending');
    });
});

describe('other metadata still only refreshes the vectors', () => {
    it('promotes to MetadataOnly when only the title changed', async () => {
        const stored = settledItem();
        const chunk = embeddedChunk();

        await committerOver(stored, [chunk.row]).Commit(extracted({ Title: 'Annual Report' }), 'ExtractionStatus', 'Complete');

        expect(stored.Name).toBe('Annual Report');
        expect(stored.SegmentationStatus).toBe('Complete');
        expect(stored.EmbeddingStatus).toBe('MetadataOnly');
        expect(chunk.stored.EmbeddingStatus).toBe('MetadataOnly');
    });

    it('does nothing when the decorator comes back the same', async () => {
        const stored = settledItem();

        const result = await committerOver(stored).Commit(extracted({ Decorator: 'Journal of X' }), 'ExtractionStatus', 'Complete');

        expect(stored.SegmentationStatus).toBe('Complete');
        expect(stored.EmbeddingStatus).toBe('Complete');
        expect(result.ColumnsWritten).not.toContain('Decorator');
    });

});

describe('a chunk whose own decorator changed', () => {
    it('is embedded again in full: it has no Segment stage, and its vector holds the decorator', async () => {
        const stored: Record<string, unknown> = { ID: 'C1', Text: 'slice', Decorator: 'old', EmbeddingStatus: 'Complete' };
        const chunk = new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', 'https://x.test/a#segment-1', 'C1'));
        chunk.Propose('Decorator', 'new', 6, 'Segment');
        chunk.SetExtension('Pipeline', 'request', 'MetadataChanged');

        await committerOver(stored, [], ['ID', 'Text', 'Decorator', 'EmbeddingStatus', 'TaggingStatus']).Commit(chunk, 'TaggingStatus', 'Complete');

        expect(stored.Decorator).toBe('new');
        expect(stored.EmbeddingStatus).toBe('Pending');
    });
});
