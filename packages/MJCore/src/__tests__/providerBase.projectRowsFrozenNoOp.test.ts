/**
 * `ProjectRowsToFields`' full-coverage fast path vs the mutability contract for `Fields` callers
 * (PR #3425 final review).
 *
 * A `Fields` request is served by projecting the cached full-width superset down to the caller's
 * shape, and the guide states those projected rows "belong to the caller and stay mutable". The
 * function short-circuits when the requested list covers every stored key, since the projection
 * would copy each row unchanged — but on a cache HIT the input IS the shared frozen array, so the
 * short-circuit handed that caller immutable rows for the one field list that happens to be
 * exhaustive. Full coverage is not a weaker promise than partial coverage; it just projects to the
 * same shape.
 *
 * The fast path is preserved where it is free of consequence (unfrozen, DB-miss input).
 */

import { describe, it, expect } from 'vitest';
import { CanonicalFieldsKey, ProjectRowsToFields } from '../generic/providerBase';

function rows(): Record<string, unknown>[] {
    return [
        { ID: 'r-1', Name: 'First', Status: 'Active' },
        { ID: 'r-2', Name: 'Second', Status: 'Inactive' },
    ];
}

function frozenRows(): Record<string, unknown>[] {
    return Object.freeze(rows().map(r => Object.freeze(r))) as unknown as Record<string, unknown>[];
}

describe('ProjectRowsToFields — full-coverage fast path', () => {
    it('returns the SAME array for unfrozen input (fast path preserved)', () => {
        const input = rows();
        const out = ProjectRowsToFields(input, ['ID', 'Name', 'Status']);
        expect(out).toBe(input);
    });

    it('copies when the input is frozen, even though the field list covers everything', () => {
        const input = frozenRows();
        const out = ProjectRowsToFields(input, ['ID', 'Name', 'Status']);

        expect(out).not.toBe(input);
        expect(Object.isFrozen(out)).toBe(false);
        expect(Object.isFrozen(out[0])).toBe(false);
        // Same data, caller-owned.
        expect(out).toEqual([
            { ID: 'r-1', Name: 'First', Status: 'Active' },
            { ID: 'r-2', Name: 'Second', Status: 'Inactive' },
        ]);
    });

    it('the returned rows are actually writable', () => {
        const out = ProjectRowsToFields(frozenRows(), ['ID', 'Name', 'Status']);
        expect(() => { out[0].Name = 'Changed'; }).not.toThrow();
        expect(out[0].Name).toBe('Changed');
    });

    it('mutating the projection cannot reach the shared frozen source', () => {
        const input = frozenRows();
        const out = ProjectRowsToFields(input, ['ID', 'Name', 'Status']);
        out[0].Name = 'Changed';
        expect(input[0].Name).toBe('First');
    });

    it('is case-insensitive about coverage, on frozen input too', () => {
        const input = frozenRows();
        const out = ProjectRowsToFields(input, ['id', 'name', 'status']);
        expect(out).not.toBe(input);
        expect(out[0].ID).toBe('r-1');
    });

    it('still narrows correctly when the list does not cover everything', () => {
        const out = ProjectRowsToFields(frozenRows(), ['ID']);
        expect(out).toEqual([{ ID: 'r-1' }, { ID: 'r-2' }]);
        expect(Object.isFrozen(out[0])).toBe(false);
    });

    it('leaves the no-Fields and empty-rows cases untouched', () => {
        const input = frozenRows();
        expect(ProjectRowsToFields(input, null)).toBe(input);
        expect(ProjectRowsToFields(input, [])).toBe(input);
        const empty: Record<string, unknown>[] = [];
        expect(ProjectRowsToFields(empty, ['ID'])).toBe(empty);
    });
});

describe('ProjectRowsToFields — PreserveFrozen (server wire / L1 CoW path)', () => {
    it('returns the exact frozen input array untouched on full-coverage Fields (0 clones)', () => {
        const input = frozenRows();
        const out = ProjectRowsToFields(input, ['ID', 'Name', 'Status'], { PreserveFrozen: true });
        expect(out).toBe(input);
        expect(Object.isFrozen(out[0])).toBe(true);
    });

    it('also returns frozen L1 CoW arrays untouched on case-insensitive full-coverage Fields', () => {
        // Simulates an L1 CoW delta-updated array: outer array frozen, element objects frozen.
        const cowArray = Object.freeze([
            Object.freeze({ ID: 'r-1', Name: 'First', Status: 'Active' }),
            Object.freeze({ ID: 'r-2', Name: 'Second', Status: 'Inactive' }),
        ]) as unknown as Record<string, unknown>[];
        const out = ProjectRowsToFields(cowArray, ['status', 'name', 'id'], { PreserveFrozen: true });
        expect(out).toBe(cowArray);
    });

    it('memoizes frozen subset-projected rows across equivalent field lists (any order/case/whitespace)', () => {
        const input = frozenRows();
        const first = ProjectRowsToFields(input, ['ID', 'Name'], { PreserveFrozen: true });
        const second = ProjectRowsToFields(input, [' name ', 'id', 'NAME'], { PreserveFrozen: true });

        expect(first).toEqual([{ ID: 'r-1', Name: 'First' }, { ID: 'r-2', Name: 'Second' }]);
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first[0])).toBe(true);
        expect(Object.isFrozen(first[1])).toBe(true);
        // Repeat call reuses the exact same frozen projected array & row references in O(1).
        expect(second).toBe(first);
        expect(second[0]).toBe(first[0]);
        expect(second[1]).toBe(first[1]);

        // Different field subset gets its own distinct memoized frozen row object.
        const third = ProjectRowsToFields(input, ['ID', 'Status'], { PreserveFrozen: true });
        expect(third).toEqual([{ ID: 'r-1', Status: 'Active' }, { ID: 'r-2', Status: 'Inactive' }]);
        expect(third[0]).not.toBe(first[0]);
        expect(Object.isFrozen(third[0])).toBe(true);
    });

    it('does not freeze unfrozen DB-miss rows even when PreserveFrozen is true', () => {
        const input = rows();
        const out = ProjectRowsToFields(input, ['ID', 'Name'], { PreserveFrozen: true });
        expect(out).toEqual([{ ID: 'r-1', Name: 'First' }, { ID: 'r-2', Name: 'Second' }]);
        expect(Object.isFrozen(out[0])).toBe(false);
    });

    it('CanonicalFieldsKey normalizes trim, casing, empty entries, duplicates, and order', () => {
        expect(CanonicalFieldsKey(null)).toBe('');
        expect(CanonicalFieldsKey([])).toBe('');
        expect(CanonicalFieldsKey(['  ', ''])).toBe('');
        expect(CanonicalFieldsKey(['  Name ', '', '   ', 'id', 'NAME', 'Id'])).toBe('id,name');
        expect(CanonicalFieldsKey(['ID', 'Name'])).toBe(CanonicalFieldsKey(['name', 'id']));
    });

    it('mutable default callers never pollute frozen wire arrays or memoized PreserveFrozen projections', () => {
        const input = frozenRows();
        const frozenWire = ProjectRowsToFields(input, ['ID', 'Name'], { PreserveFrozen: true });
        const mutableOut = ProjectRowsToFields(input, ['ID', 'Name']);

        expect(mutableOut).not.toBe(frozenWire);
        expect(mutableOut[0]).not.toBe(frozenWire[0]);
        expect(Object.isFrozen(mutableOut)).toBe(false);
        expect(Object.isFrozen(mutableOut[0])).toBe(false);

        mutableOut[0].Name = 'CallerMutated';
        mutableOut[0].InjectedProp = true;

        expect(input[0].Name).toBe('First');
        expect(frozenWire[0].Name).toBe('First');
        expect('InjectedProp' in frozenWire[0]).toBe(false);
        expect(Object.isFrozen(frozenWire[0])).toBe(true);

        // Subsequent PreserveFrozen lookup still yields clean frozen data.
        const frozenWireAgain = ProjectRowsToFields(input, ['name', 'id'], { PreserveFrozen: true });
        expect(frozenWireAgain).toBe(frozenWire);
        expect(frozenWireAgain[0].Name).toBe('First');
    });
});
