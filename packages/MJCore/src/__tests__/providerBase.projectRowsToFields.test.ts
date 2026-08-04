import { describe, it, expect } from 'vitest';
import { ProjectRowsToFields } from '../generic/providerBase';

/**
 * ProjectRowsToFields is the single projection primitive used by the RunView
 * caching pipeline. When a query is cacheable, the provider widens params.Fields
 * to ALL entity fields so the cache entry is a universal superset; this function
 * restores the caller's originally requested column shape on BOTH cache hits
 * (filtering the cached superset) and cache misses (filtering the widened DB
 * result). These tests pin down the contract both paths rely on.
 */
describe('ProjectRowsToFields', () => {
    const rows = [
        { ID: '1', Name: 'Alpha', Description: 'First', SchemaName: '__mj', RowCount: 10 },
        { ID: '2', Name: 'Beta', Description: 'Second', SchemaName: 'dbo', RowCount: 20 }
    ];

    describe('projection behavior', () => {
        it('should keep only the requested fields', () => {
            const result = ProjectRowsToFields(rows, ['name', 'description']);
            expect(result).toEqual([
                { Name: 'Alpha', Description: 'First' },
                { Name: 'Beta', Description: 'Second' }
            ]);
        });

        it('should match field names case-insensitively', () => {
            const result = ProjectRowsToFields(rows, ['NAME', 'schemaname']);
            expect(result).toEqual([
                { Name: 'Alpha', SchemaName: '__mj' },
                { Name: 'Beta', SchemaName: 'dbo' }
            ]);
        });

        it('should trim whitespace from requested field names', () => {
            const result = ProjectRowsToFields(rows, ['  Name  ', ' ID']);
            expect(result).toEqual([
                { ID: '1', Name: 'Alpha' },
                { ID: '2', Name: 'Beta' }
            ]);
        });

        it('should preserve the original key casing from the rows', () => {
            const result = ProjectRowsToFields(rows, ['name']);
            expect(Object.keys(result[0])).toEqual(['Name']);
        });

        it('should ignore requested fields that do not exist on the rows', () => {
            const result = ProjectRowsToFields(rows, ['Name', 'NoSuchColumn']);
            expect(result).toEqual([{ Name: 'Alpha' }, { Name: 'Beta' }]);
        });

        it('should produce empty objects when no requested field matches', () => {
            const result = ProjectRowsToFields(rows, ['NoSuchColumn']);
            expect(result).toEqual([{}, {}]);
        });

        it('should preserve falsy and null values in kept fields', () => {
            const sparse = [{ A: 0, B: null, C: '', D: false, E: 'drop me' }];
            const result = ProjectRowsToFields(sparse, ['A', 'B', 'C', 'D']);
            expect(result).toEqual([{ A: 0, B: null, C: '', D: false }]);
        });

        it('should handle rows with heterogeneous key sets', () => {
            const ragged = [
                { ID: '1', Name: 'Alpha' },
                { ID: '2', Extra: 'only here' }
            ];
            const result = ProjectRowsToFields(ragged, ['ID', 'Extra']);
            expect(result).toEqual([{ ID: '1' }, { ID: '2', Extra: 'only here' }]);
        });
    });

    describe('pass-through behavior (no projection requested)', () => {
        it('should return the same array instance when requestedFields is null', () => {
            expect(ProjectRowsToFields(rows, null)).toBe(rows);
        });

        it('should return the same array instance when requestedFields is undefined', () => {
            expect(ProjectRowsToFields(rows, undefined)).toBe(rows);
        });

        it('should return the same array instance when requestedFields is empty', () => {
            expect(ProjectRowsToFields(rows, [])).toBe(rows);
        });

        it('should return the same array instance when rows is empty', () => {
            const empty: Record<string, unknown>[] = [];
            expect(ProjectRowsToFields(empty, ['Name'])).toBe(empty);
        });
    });

    describe('immutability', () => {
        it('should not mutate the input rows', () => {
            const original = [{ ID: '1', Name: 'Alpha', Secret: 'keep' }];
            const snapshot = JSON.parse(JSON.stringify(original));
            ProjectRowsToFields(original, ['Name']);
            expect(original).toEqual(snapshot);
        });

        it('should return the ORIGINAL array when the request covers every column (no-op probe)', () => {
            // Full-coverage projection is detected via the first row and short-circuits —
            // no per-row rebuild, the original array is returned untouched.
            const result = ProjectRowsToFields(rows, ['ID', 'Name', 'Description', 'SchemaName', 'RowCount']);
            expect(result).toBe(rows);
        });

        it('should return new row objects when projection actually narrows', () => {
            const result = ProjectRowsToFields(rows, ['ID', 'Name']);
            expect(result[0]).not.toBe(rows[0]);
            expect(result[0]).toEqual({ ID: '1', Name: 'Alpha' });
        });
    });

    describe('cache hit/miss shape symmetry (regression)', () => {
        it('should produce identical shapes when applied to a full superset (miss) and to itself (hit re-projection)', () => {
            // Miss path: DB returned ALL fields because PreRunView widened params.Fields
            const missProjected = ProjectRowsToFields(rows, ['Name', 'Description']);
            // Hit path: cache stored the superset; the same projection runs on read
            const hitProjected = ProjectRowsToFields(rows, ['Name', 'Description']);
            expect(missProjected).toEqual(hitProjected);
            // And re-projecting an already-projected set is a stable no-op shape-wise
            expect(ProjectRowsToFields(missProjected, ['Name', 'Description'])).toEqual(missProjected);
        });
    });
});
