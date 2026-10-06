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

const row = (stored: Record<string, unknown>, fields: string[] = []) => ({
    Get: (c: string) => stored[c],
    Set: (c: string, v: unknown) => {
        stored[c] = v;
    },
    Fields: fields.map((Name) => ({ Name })),
});

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
});
