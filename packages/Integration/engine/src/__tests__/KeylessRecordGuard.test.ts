/**
 * Contract tests for the soft-primary-key guard.
 *
 * A soft PK is inferred, not generated: DDLGenerator gives it a NON-UNIQUE index and no PRIMARY KEY
 * constraint, so the database will happily accept a row with a NULL key. Such a row can never be
 * matched again — the next sync's existence check misses it and inserts another copy, and so does
 * the one after that. Every business column is populated, so nothing looks wrong. A production
 * incident of this exact shape produced ~1.9M unmatchable rows across 39 tables in one day.
 *
 * The engine can't repair the record, but refusing to write it converts a silent, compounding
 * data-integrity failure into a loud per-record skip that names the field map to fix.
 */
import { describe, it, expect } from 'vitest';
import { DecideKeylessRefusal, DescribeKeylessRefusal, type KeyFieldLike } from '../KeylessRecordGuard';

const softKey = (name: string): KeyFieldLike => ({ Name: name, IsSoftPrimaryKey: true });
const generatedKey = (name: string): KeyFieldLike => ({ Name: name, IsSoftPrimaryKey: false });

describe('DecideKeylessRefusal', () => {
    it('REFUSES a record with no key for a soft-PK table', () => {
        const r = DecideKeylessRefusal(null, [softKey('Id')]);
        expect(r.Refuse).toBe(true);
        expect(r.KeyNames).toBe('Id');
    });

    it('names every soft-key column on a composite key', () => {
        const r = DecideKeylessRefusal(null, [softKey('id'), softKey('courseid')]);
        expect(r.Refuse).toBe(true);
        expect(r.KeyNames).toBe('id, courseid');
    });

    it('ALLOWS a missing key when the destination generates its own', () => {
        // Identity / server-assigned UUID keys are matched by record map, not by key value.
        // Refusing these would break ordinary syncs, which is why the guard is scoped to soft keys.
        expect(DecideKeylessRefusal(null, [generatedKey('ID')]).Refuse).toBe(false);
        expect(DecideKeylessRefusal(null, [{ Name: 'ID' }]).Refuse).toBe(false);
    });

    it('ALLOWS any record that actually carries its key', () => {
        expect(DecideKeylessRefusal('abc', [softKey('Id')]).Refuse).toBe(false);
        // Composite keys arrive pre-joined by extractMappedPrimaryKey.
        expect(DecideKeylessRefusal('7|22', [softKey('id'), softKey('courseid')]).Refuse).toBe(false);
    });

    it('treats undefined like null — both mean "no key was extracted"', () => {
        expect(DecideKeylessRefusal(undefined, [softKey('Id')]).Refuse).toBe(true);
    });

    it('does not refuse when the entity has no primary key at all', () => {
        // Nothing to enforce, and refusing would block a legitimately keyless destination.
        expect(DecideKeylessRefusal(null, []).Refuse).toBe(false);
    });

    it('refuses on a MIXED key that includes a soft column', () => {
        // extractMappedPrimaryKey returns null if ANY key part is empty, so a partially-populated
        // composite key lands here too — and a partial key is just as unmatchable as no key.
        const r = DecideKeylessRefusal(null, [generatedKey('ID'), softKey('ExternalId')]);
        expect(r.Refuse).toBe(true);
        expect(r.KeyNames).toBe('ExternalId');
    });
});

describe('DescribeKeylessRefusal', () => {
    it('names the entity, the key, and both places the cause lives', () => {
        const msg = DescribeKeylessRefusal('Attendees', 'Id');
        expect(msg).toContain('Attendees');
        expect(msg).toContain('Id');
        // An operator reading this in a run log needs to know where to look.
        expect(msg).toContain('field map');
        expect(msg).toContain('discovery');
        // And why the engine didn't just write it anyway.
        expect(msg).toContain('re-inserted on every subsequent sync');
    });
});
