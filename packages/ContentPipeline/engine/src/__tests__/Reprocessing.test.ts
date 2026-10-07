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

    it('treats a record with no text yet as changed, so it proceeds', () => {
        expect(harness().contentChanged(item(), row({ Text: 'old' }, []))).toBe(true);
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
    it('identifies an item by URL WITHIN its source', () => {
        expect(harness().matchFilter(item(), { ContentSourceID: 'S1' })).toBe(
            "ContentSourceID='S1' AND URL='https://x.test/a'",
        );
    });

    it('escapes a quote in a URL rather than breaking the filter', () => {
        const odd = new WorkingRecord(new WorkingRecordIdentity('Content Item', "https://x.test/it's"));
        expect(harness().matchFilter(odd, { ContentSourceID: 'S1' })).toContain("it''s");
    });

    it('identifies a chunk by its SEQUENCE within its item — chunks have no URL', () => {
        const c = chunk();
        c.SetExtension('Pipeline', 'columns', { Sequence: 3 });
        expect(harness().matchFilter(c, { ContentItemID: 'I1' })).toBe("ContentItemID='I1' AND Sequence=3");
    });

    it('declines to match a chunk with no sequence rather than guessing', () => {
        expect(harness().matchFilter(chunk(), { ContentItemID: 'I1' })).toBeNull();
    });

    it('declines to match when there is no scope to match within', () => {
        expect(harness().matchFilter(item(), {})).toBeNull();
    });
});
