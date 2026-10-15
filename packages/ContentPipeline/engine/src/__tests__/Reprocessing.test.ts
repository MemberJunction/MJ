import { describe, expect, it } from 'vitest';
import { WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';

/** Reach the private reprocessing logic without standing up a database. */
function harness() {
    const committer = new WorkingRecordCommitter({} as never, {} as never);
    return committer as unknown as {
        contentChanged(child: WorkingRecord, entityObject: unknown): boolean;
        resetDownstream(child: WorkingRecord, entityObject: unknown, statusField: string): string[];
        matchFilter(child: WorkingRecord, parentDefaults: Record<string, unknown>): string | null;
    };
}

const item = (text?: string) => {
    const r = new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
    if (text !== undefined) r.Propose('Text', text, 6, 'Extract');
    return r;
};
const chunk = () => new WorkingRecord(new WorkingRecordIdentity('Content Item Chunk', 'https://x.test/a#0'));
const row = (stored: Record<string, unknown>, fields: string[]) => ({
    Get: (c: string) => stored[c],
    Set: (c: string, v: unknown) => {
        stored[c] = v;
    },
    Fields: fields.map((Name) => ({ Name })),
});

describe('change detection', () => {
    it('is a no-op when the text is identical', () => {
        expect(harness().contentChanged(item('same'), row({ Text: 'same' }, []))).toBe(false);
    });

    it('detects changed text', () => {
        expect(harness().contentChanged(item('new'), row({ Text: 'old' }, []))).toBe(true);
    });

    it('treats a record with neither checksum nor text as UNCHANGED — nothing says it moved', () => {
        // A crawl reports that a page exists, not what it holds. Calling that "changed" sent every
        // such item back through the whole pipeline on every walk.
        expect(harness().contentChanged(item(), row({ Text: 'old' }, []))).toBe(false);
    });
});

describe('flat downstream reset', () => {
    it('resets every stage AFTER the one that ran, and none before', () => {
        const stored: Record<string, unknown> = {};
        const fields = ['ExtractionStatus', 'TaggingStatus', 'SegmentationStatus', 'EmbeddingStatus'];
        const written = harness().resetDownstream(item('x'), row(stored, fields), 'ExtractionStatus');
        expect(written).toEqual(['TaggingStatus', 'SegmentationStatus', 'EmbeddingStatus']);
        expect(stored.ExtractionStatus).toBeUndefined();
        expect(stored.EmbeddingStatus).toBe('Pending');
    });

    it('writes every downstream field directly rather than relying on stages to propagate', () => {
        // The point of a flat reset: nothing guarantees the intermediate stages run.
        const stored: Record<string, unknown> = {};
        harness().resetDownstream(item('x'), row(stored, ['ExtractionStatus', 'TaggingStatus', 'SegmentationStatus', 'EmbeddingStatus']), 'TaggingStatus');
        expect(stored.SegmentationStatus).toBe('Pending');
        expect(stored.EmbeddingStatus).toBe('Pending');
    });

    it('resets nothing when the stage that ran is last', () => {
        expect(harness().resetDownstream(item('x'), row({}, ['EmbeddingStatus']), 'EmbeddingStatus')).toEqual([]);
    });

    it('skips a field the entity does not have', () => {
        expect(harness().resetDownstream(item('x'), row({}, ['ExtractionStatus']), 'ExtractionStatus')).toEqual([]);
    });
});

describe('how a produced record is recognized', () => {
    it('identifies an item by URL WITHIN its source, and only a LIVE one', () => {
        // A URL that comes back after its item was deleted must not bind to the tombstone.
        expect(harness().matchFilter(item(), { ContentSourceID: 'S1' })).toBe(
            "ContentSourceID='S1' AND URL='https://x.test/a' AND DeleteStatus IS NULL",
        );
    });

    it('escapes a quote in a URL rather than breaking the filter', () => {
        const odd = new WorkingRecord(new WorkingRecordIdentity('Content Item', "https://x.test/it's"));
        expect(harness().matchFilter(odd, { ContentSourceID: 'S1' })).toContain("it''s");
    });

    it('NEVER matches a chunk: re-segmenting mints new chunks and retires the old set', () => {
        // Overwriting chunk N kept its identity while changing what it said, so anything that had
        // recorded using it now pointed at text it never saw.
        const c = chunk();
        c.SetExtension('Pipeline', 'columns', { Sequence: 3 });
        expect(harness().matchFilter(c, { ContentItemID: 'I1' })).toBeNull();
    });

    it('declines to match when there is no scope to match within', () => {
        expect(harness().matchFilter(item(), {})).toBeNull();
    });
});
