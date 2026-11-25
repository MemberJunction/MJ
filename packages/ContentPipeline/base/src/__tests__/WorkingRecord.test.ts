import { describe, expect, it } from 'vitest';
import { WorkingRecord } from '../WorkingRecord.js';
import { WorkingRecordIdentity } from '../WorkingRecord.types.js';

function newRecord(): WorkingRecord {
    return new WorkingRecord(new WorkingRecordIdentity('Content Item', 'https://example.com/a'));
}

describe('WorkingRecordIdentity', () => {
    it('is not persisted until it has a real primary key, and keys by URL until then', () => {
        const identity = new WorkingRecordIdentity('Content Item', 'https://example.com/a');
        expect(identity.IsPersisted).toBe(false);
        expect(identity.Key).toBe('https://example.com/a');
    });

    it('keys by the primary key once persisted, keeping the URL for later reconciliation', () => {
        const identity = new WorkingRecordIdentity('Content Item', 'https://example.com/a', 'ABC-123');
        expect(identity.IsPersisted).toBe(true);
        expect(identity.Key).toBe('ABC-123');
        expect(identity.EphemeralID).toBe('https://example.com/a');
    });
});

describe('WorkingRecord.Propose — confidence resolution', () => {
    it('takes a proposal when the field is empty', () => {
        const record = newRecord();
        expect(record.Propose('Title', 'From listing', 2, 'Discover.RSS')).toBe(true);
        expect(record.Get('Title')).toBe('From listing');
    });

    it('takes a strictly higher proposal', () => {
        const record = newRecord();
        record.Propose('Title', 'From listing', 2, 'Discover.RSS');
        expect(record.Propose('Title', 'From the document', 6, 'Extract.Html')).toBe(true);
        expect(record.Get('Title')).toBe('From the document');
        expect(record.GetField('Title')?.SetBy).toBe('Extract.Html');
    });

    it('rejects a lower proposal, leaving the better value in place', () => {
        const record = newRecord();
        record.Propose('Title', 'From the document', 6, 'Extract.Html');
        expect(record.Propose('Title', 'From listing', 2, 'Discover.RSS')).toBe(false);
        expect(record.Get('Title')).toBe('From the document');
    });

    it('rejects an EQUAL proposal — first writer wins at the same confidence', () => {
        const record = newRecord();
        record.Propose('Title', 'First', 4, 'Discover.RSS');
        expect(record.Propose('Title', 'Second', 4, 'Extract.Html')).toBe(false);
        expect(record.Get('Title')).toBe('First');
        expect(record.GetField('Title')?.SetBy).toBe('Discover.RSS');
    });

    it('resolves correctly regardless of the order two stages run in', () => {
        const discoverFirst = newRecord();
        discoverFirst.Propose('Title', 'listing', 2, 'Discover.RSS');
        discoverFirst.Propose('Title', 'document', 6, 'Extract.Html');

        const extractFirst = newRecord();
        extractFirst.Propose('Title', 'document', 6, 'Extract.Html');
        extractFirst.Propose('Title', 'listing', 2, 'Discover.RSS');

        expect(discoverFirst.Get('Title')).toBe(extractFirst.Get('Title'));
        expect(extractFirst.Get('Title')).toBe('document');
    });

    it('reports zero confidence for a field nothing has set', () => {
        expect(newRecord().GetConfidence('Title')).toBe(0);
    });
});

describe('WorkingRecord.Restore — the hydrator path', () => {
    it('overwrites regardless of confidence, because it is restoring rather than competing', () => {
        const record = newRecord();
        record.Propose('Title', 'high', 9, 'Extract.Html');
        record.Restore('Title', 'stored', 1, 'Discover.RSS');
        expect(record.Get('Title')).toBe('stored');
    });

    it('does not mark the field changed, so hydration alone commits nothing', () => {
        const record = newRecord();
        record.Restore('Title', 'stored', 1, 'Discover.RSS');
        expect(record.ChangedFields).toEqual([]);
    });
});

describe('WorkingRecord change tracking', () => {
    it('tracks only fields an accepted proposal changed', () => {
        const record = newRecord();
        record.Propose('Title', 'a', 5, 'Extract');
        record.Propose('Text', 'body', 5, 'Extract');
        record.Propose('Title', 'ignored', 1, 'Discover');
        expect([...record.ChangedFields].sort()).toEqual(['Text', 'Title']);
    });

    it('clears after the committer has written them', () => {
        const record = newRecord();
        record.Propose('Title', 'a', 5, 'Extract');
        record.ClearChanged();
        expect(record.ChangedFields).toEqual([]);
    });
});

describe('WorkingRecord extension space', () => {
    it('namespaces keys so two stages cannot collide', () => {
        const record = newRecord();
        record.SetExtension('Extract.Html', 'depth', 2);
        record.SetExtension('Discover.RSS', 'depth', 99);
        expect(record.GetExtension<number>('Extract.Html', 'depth')).toBe(2);
        expect(record.GetExtension<number>('Discover.RSS', 'depth')).toBe(99);
    });

    it('returns undefined for a key no stage wrote', () => {
        expect(newRecord().GetExtension('Nobody', 'nothing')).toBeUndefined();
    });
});

describe('WorkingRecord completion signal', () => {
    it('is off until a stage raises it', () => {
        const record = newRecord();
        expect(record.IsComplete).toBe(false);
        record.MarkComplete();
        expect(record.IsComplete).toBe(true);
    });
});

describe('WorkingRecord.ToFieldConfidence', () => {
    it('emits the persisted shape, one entry per set field', () => {
        const record = newRecord();
        record.Propose('Title', 'a', 4, 'Discover.RSS');
        record.Propose('Text', 'b', 7, 'Extract.Pdf');
        expect(record.ToFieldConfidence()).toEqual({
            Text: { Score: 7, SetBy: 'Extract.Pdf' },
            Title: { Score: 4, SetBy: 'Discover.RSS' },
        });
    });

    it('omits fields nothing has set', () => {
        const record = newRecord();
        record.Propose('Title', 'a', 4, 'Discover.RSS');
        expect(Object.keys(record.ToFieldConfidence())).toEqual(['Title']);
    });

    it('omits zero-confidence fields rather than inventing provenance for them', () => {
        const record = newRecord();
        record.Restore('Text', 'from a pre-pipeline row', 0, 'Hydrate');
        record.Propose('Title', 'a', 4, 'Discover.RSS');
        expect(Object.keys(record.ToFieldConfidence())).toEqual(['Title']);
    });
});
