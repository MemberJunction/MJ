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
import { ProjectRowsToFields } from '../generic/providerBase';

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
