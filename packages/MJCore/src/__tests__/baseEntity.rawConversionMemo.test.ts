/**
 * `BaseEntity.Get()` must never write into the row it was loaded from
 * (PR #3425 review, blocker finding).
 *
 * The raw-mode fast path keeps the caller's row BY REFERENCE and, to avoid re-parsing on every
 * read, memoized converted values (a parsed `Date`, an rtrimmed fixed-width string) back INTO
 * that row. When the row is a shared cache object, that is a write to process-wide state from
 * inside a READ.
 *
 * The first mitigation sampled `Object.isFrozen(this._raw)` once at load and skipped the memo
 * when frozen. That is racy by construction: the cache freezes asynchronously relative to the
 * consumer (the smart-cache stale leg starts a cache write without awaiting it, then builds
 * entities from the same array), so a freeze landing after the sample leaves the record
 * believing its row is writable — and the next read of a date or `CHAR(n)` field throws
 * `TypeError` while trying to memoize. A read that throws is the worst possible shape for this
 * bug: nothing in the caller's code looks like a mutation.
 *
 * The fix removes the shared-state write entirely: conversions memoize into a per-instance side
 * table. That makes the freeze timing irrelevant, and it RESTORES the optimization for frozen
 * rows, which the isFrozen-guard version had given up (it re-parsed on every read).
 */

import { describe, it, expect } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo, EntityFieldTSType } from '../generic/entityInfo';

/** Minimal EntityInfo stand-in: only what the raw fast path consults. */
function makeEntityInfo(): EntityInfo {
    const fields = [
        { Name: 'ID', TSType: EntityFieldTSType.String, FixedWidthColumn: false, IsPrimaryKey: true, ReadOnly: false, IsActive: true },
        { Name: 'Name', TSType: EntityFieldTSType.String, FixedWidthColumn: false, IsPrimaryKey: false, ReadOnly: false, IsActive: true },
        { Name: 'Currency', TSType: EntityFieldTSType.String, FixedWidthColumn: true, IsPrimaryKey: false, ReadOnly: false, IsActive: true },
        { Name: 'StartedAt', TSType: EntityFieldTSType.Date, FixedWidthColumn: false, IsPrimaryKey: false, ReadOnly: false, IsActive: true },
    ];
    const byName = new Map(fields.map(f => [f.Name.toLowerCase(), f]));
    return {
        Name: 'Memo Test Entity',
        Fields: fields,
        PrimaryKeys: [fields[0]],
        HasInactiveFields: false,
        FieldByName: (n: string) => byName.get(n?.trim().toLowerCase()),
    } as unknown as EntityInfo;
}

class MemoTestEntity extends BaseEntity {
    constructor() {
        super(makeEntityInfo());
    }
}

/** A row exactly as the cache hands it out on a hit: deep-frozen. */
function frozenRow(): Record<string, unknown> {
    return Object.freeze({
        ID: 'r-1',
        Name: 'Widget',
        Currency: 'USD   ',                       // CHAR(6), space-padded
        StartedAt: '2026-01-02T03:04:05.000Z',    // string from the wire/cache
    }) as Record<string, unknown>;
}

describe('BaseEntity.Get() against frozen cache rows', () => {
    it('reads a Date field from a FROZEN row without throwing', () => {
        const e = new MemoTestEntity();
        e.LoadFromData(frozenRow());

        const first = e.Get('StartedAt');
        expect(first).toBeInstanceOf(Date);
        expect((first as Date).toISOString()).toBe('2026-01-02T03:04:05.000Z');
    });

    it('reads a fixed-width field from a FROZEN row and rtrims it', () => {
        const e = new MemoTestEntity();
        e.LoadFromData(frozenRow());

        expect(e.Get('Currency')).toBe('USD');
    });

    it('returns a STABLE Date instance across reads of a frozen row (the memo still works)', () => {
        // The isFrozen-guard version re-parsed on every read, returning a new Date each time —
        // losing the optimization exactly where it matters most (server cache hits) and making
        // identity comparisons silently false.
        const e = new MemoTestEntity();
        e.LoadFromData(frozenRow());

        const a = e.Get('StartedAt');
        const b = e.Get('StartedAt');
        expect(a).toBe(b);
    });

    it('never writes the conversion back into the source row', () => {
        // Unfrozen input, so this fails loudly if the memo ever returns to writing into _raw —
        // which is what made the frozen case throw in the first place.
        const row: Record<string, unknown> = {
            ID: 'r-1',
            Name: 'Widget',
            Currency: 'USD   ',
            StartedAt: '2026-01-02T03:04:05.000Z',
        };
        const e = new MemoTestEntity();
        e.LoadFromData(row);

        e.Get('StartedAt');
        e.Get('Currency');

        expect(row.StartedAt).toBe('2026-01-02T03:04:05.000Z');
        expect(row.Currency).toBe('USD   ');
    });

    it('survives a row that is frozen AFTER load (the race the isFrozen sample lost)', () => {
        // The cache write is not always awaited, so the freeze can land between LoadFromData and
        // the first field read. Sampling isFrozen once at load cannot see this.
        const row: Record<string, unknown> = {
            ID: 'r-1',
            Name: 'Widget',
            Currency: 'USD   ',
            StartedAt: '2026-01-02T03:04:05.000Z',
        };
        const e = new MemoTestEntity();
        e.LoadFromData(row);

        Object.freeze(row); // freeze-on-write lands here, after the entity sampled the row

        expect(() => e.Get('StartedAt')).not.toThrow();
        expect(e.Get('StartedAt')).toBeInstanceOf(Date);
        expect(e.Get('Currency')).toBe('USD');
    });

    it('non-converted fields still read straight through', () => {
        const e = new MemoTestEntity();
        e.LoadFromData(frozenRow());

        expect(e.Get('Name')).toBe('Widget');
        expect(e.Get('ID')).toBe('r-1');
        expect(e.Get('NoSuchField')).toBeNull();
    });

    it('a second LoadFromData does not serve the previous row\'s memoized values', () => {
        const e = new MemoTestEntity();
        e.LoadFromData(frozenRow());
        expect((e.Get('StartedAt') as Date).toISOString()).toBe('2026-01-02T03:04:05.000Z');

        e.LoadFromData(Object.freeze({
            ID: 'r-2',
            Name: 'Gadget',
            Currency: 'EUR   ',
            StartedAt: '2027-06-07T08:09:10.000Z',
        }) as Record<string, unknown>);

        expect((e.Get('StartedAt') as Date).toISOString()).toBe('2027-06-07T08:09:10.000Z');
        expect(e.Get('Currency')).toBe('EUR');
    });
});
