/**
 * @fileoverview The retry schedule the committer keeps on a record (`RetryCount`, `RetryAfter`).
 *
 * A Retry outcome leaves the record's status ready and sets a wait that doubles with each Retry in a
 * row; a commit that settles the record clears it. Written against the committer with a stand-in row,
 * the seam the schedule lives in.
 */
import { describe, expect, it } from 'vitest';
import { WorkingRecord, WorkingRecordIdentity } from '@memberjunction/content-pipeline-base';
import { WorkingRecordCommitter } from '../WorkingRecordCommitter.js';

const BACKOFF = { RetryBackoffBaseMs: 60_000, RetryBackoffMaxMs: 3_600_000 };
const ITEM_FIELDS = ['ID', 'URL', 'Text', 'Checksum', 'FieldConfidence', 'ExtractionStatus', 'TaggingStatus', 'SegmentationStatus', 'EmbeddingStatus', 'DeleteStatus', 'RetryCount', 'RetryAfter'];

/** A committer over one stored row, exposing only `fields` as the entity's columns. */
function committerOver(stored: Record<string, unknown>, fields: string[] = ITEM_FIELDS): WorkingRecordCommitter {
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
    return new WorkingRecordCommitter({ GetEntityObject: async () => entityRow } as never, {} as never);
}

function item(): WorkingRecord {
    return new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://x.test/a', 'I1'));
}

/** Milliseconds from now until `value`, a Date the committer wrote. */
function waitOf(value: unknown): number {
    expect(value).toBeInstanceOf(Date);
    return (value as Date).getTime() - Date.now();
}

describe('the retry schedule', () => {
    it('keeps the status ready after a Retry and sets the first wait', async () => {
        const stored: Record<string, unknown> = { ID: 'I1', ExtractionStatus: 'Pending', RetryCount: 0, RetryAfter: null };

        const result = await committerOver(stored).Commit(item(), 'ExtractionStatus', null, false, BACKOFF);

        expect(stored.ExtractionStatus).toBe('Pending');
        expect(stored.RetryCount).toBe(1);
        expect(waitOf(stored.RetryAfter)).toBeGreaterThan(55_000);
        expect(waitOf(stored.RetryAfter)).toBeLessThanOrEqual(60_000);
        expect(result.ColumnsWritten).toEqual(expect.arrayContaining(['RetryCount', 'RetryAfter']));
        expect(result.ColumnsWritten).not.toContain('ExtractionStatus');
    });

    it('doubles the wait for each Retry in a row', async () => {
        const stored: Record<string, unknown> = { ID: 'I1', EmbeddingStatus: 'Pending', RetryCount: 2, RetryAfter: new Date() };

        await committerOver(stored).Commit(item(), 'EmbeddingStatus', null, false, BACKOFF);

        expect(stored.RetryCount).toBe(3);
        expect(waitOf(stored.RetryAfter)).toBeGreaterThan(235_000); // 4 × the base
        expect(waitOf(stored.RetryAfter)).toBeLessThanOrEqual(240_000);
    });

    it('keeps a MetadataOnly embed a metadata refresh across a Retry', async () => {
        const stored: Record<string, unknown> = { ID: 'I1', EmbeddingStatus: 'MetadataOnly', RetryCount: 0, RetryAfter: null };

        await committerOver(stored).Commit(item(), 'EmbeddingStatus', null, false, BACKOFF);

        expect(stored.EmbeddingStatus).toBe('MetadataOnly');
        expect(stored.RetryCount).toBe(1);
    });

    it('clears the schedule once a stage settles the record', async () => {
        for (const status of ['Complete', 'Skipped', 'Failed']) {
            const stored: Record<string, unknown> = { ID: 'I1', ExtractionStatus: 'Pending', RetryCount: 3, RetryAfter: new Date() };

            await committerOver(stored).Commit(item(), 'ExtractionStatus', status, status === 'Complete');

            expect(stored.ExtractionStatus).toBe(status);
            expect(stored.RetryCount).toBe(0);
            expect(stored.RetryAfter).toBeNull();
        }
    });

    it('writes nothing to a schedule there is no need to clear', async () => {
        const stored: Record<string, unknown> = { ID: 'I1', ExtractionStatus: 'Pending', RetryCount: 0, RetryAfter: null };

        const result = await committerOver(stored).Commit(item(), 'ExtractionStatus', 'Complete', true);

        expect(result.ColumnsWritten).not.toContain('RetryCount');
        expect(result.ColumnsWritten).not.toContain('RetryAfter');
    });

    it('leaves an entity without the columns alone', async () => {
        const stored: Record<string, unknown> = { ID: 'S1' };
        const source = new WorkingRecord(new WorkingRecordIdentity('Content Source', 'source', 'S1'));

        const result = await committerOver(stored, ['ID']).Commit(source, null, null, false, BACKOFF);

        expect(stored.RetryCount).toBeUndefined();
        expect(result.ColumnsWritten).toEqual([]);
    });
});
