import { describe, it, expect } from 'vitest';
import { CatalogIdentityKey, DecideRekeyed, IdentityKeyFields } from '../integration/EntityMapLifecycle.js';

/**
 * A connector upgrade can change what identifies a row. PheedLoop 1.4.6 makes Attendees
 * `code + eventCode`, because the object is fetched once per event and an attendee at two events
 * comes back twice carrying the same `code`.
 *
 * `ToExternalRecord` joins every IsPrimaryKey field with '|' in Sequence order, so both the
 * MEMBERS and the ORDER are part of identity. These pin the two pure decisions that drive the
 * evolution's clear-and-rebuild.
 */
const f = (Name: string, IsPrimaryKey: boolean | null, Sequence: number | null) =>
    ({ Name, IsPrimaryKey, Sequence });

describe('IdentityKeyFields', () => {
    it('takes only key fields, in Sequence order — not declaration order', () => {
        expect(IdentityKeyFields([
            f('eventCode', true, 2),
            f('is_checked_in', false, 3),
            f('code', true, 1),
        ])).toEqual(['code', 'eventCode']);
    });

    it('is empty when nothing is flagged', () => {
        expect(IdentityKeyFields([f('a', false, 1), f('b', null, 2)])).toEqual([]);
    });

    it('treats a missing Sequence as 0 rather than dropping the field', () => {
        expect(IdentityKeyFields([f('b', true, null), f('a', true, 1)])).toEqual(['b', 'a']);
    });

    it('does not mutate the caller array', () => {
        const input = [f('z', true, 9), f('a', true, 1)];
        IdentityKeyFields(input);
        expect(input[0].Name).toBe('z');
    });
});

describe('DecideRekeyed', () => {
    it('a column joining the key is a re-key — the PheedLoop case', () => {
        expect(DecideRekeyed(['code'], ['code', 'eventCode'])).toBe(true);
    });

    it('a column leaving the key is a re-key', () => {
        expect(DecideRekeyed(['code', 'eventCode'], ['code'])).toBe(true);
    });

    it('the same columns in a different ORDER is a re-key — the identity string differs', () => {
        expect(DecideRekeyed(['code', 'eventCode'], ['eventCode', 'code'])).toBe(true);
    });

    it('an unchanged key is not', () => {
        expect(DecideRekeyed(['code', 'eventCode'], ['code', 'eventCode'])).toBe(false);
    });

    it('matches case-insensitively, as every catalog-to-map reconciliation does', () => {
        expect(DecideRekeyed(['Code'], ['code'])).toBe(false);
    });

    // The guard that stops this from clearing the fleet. An empty BUILT key means the entity's
    // fields could not be read, not that the table never had a key — and treating unknown as
    // empty would re-key (and therefore WIPE) every table on a workspace whose metadata failed
    // to load.
    it('an unreadable built key is never a re-key, however different the catalog looks', () => {
        expect(DecideRekeyed([], ['code', 'eventCode'])).toBe(false);
        expect(DecideRekeyed([], [])).toBe(false);
    });

    it('a catalog that reports no key against a real built key IS a re-key', () => {
        expect(DecideRekeyed(['code'], [])).toBe(true);
    });

    // The same guard on the catalog side. A refresh reading a per-connection object whose fields
    // were never warmed got `[]`, and "no key" against a real built key cleared the object's
    // record maps and rows on every refresh.
    it('an unread catalog key is never a re-key', () => {
        expect(DecideRekeyed(['code'], null)).toBe(false);
        expect(DecideRekeyed(['code', 'eventCode'], CatalogIdentityKey([]))).toBe(false);
    });
});

describe('CatalogIdentityKey', () => {
    const row = (Name: string, IsPrimaryKey: boolean, Sequence: number, Status = 'Active') =>
        ({ Name, IsPrimaryKey, Sequence, Status });

    it('is null when no field row was read — a cold per-connection object answers []', () => {
        expect(CatalogIdentityKey([])).toBeNull();
    });

    it('is null when no row is Active — nothing describes the object', () => {
        expect(CatalogIdentityKey([row('code', true, 1, 'Inactive')])).toBeNull();
    });

    it('is the Active key fields in Sequence order', () => {
        expect(CatalogIdentityKey([
            row('eventCode', true, 2),
            row('old_key', true, 0, 'Inactive'),
            row('code', true, 1),
            row('name', false, 3),
        ])).toEqual(['code', 'eventCode']);
    });

    it('is [] when Active rows declare no key — read, and keyless, so still a re-key', () => {
        const key = CatalogIdentityKey([row('name', false, 1)]);
        expect(key).toEqual([]);
        expect(DecideRekeyed(['code'], key)).toBe(true);
    });
});
