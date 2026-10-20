/**
 * Unit tests for the pure Process Run Detail parsing/display helpers the run-history audit view relies on.
 */
import { describe, it, expect } from 'vitest';
import { ParseAppliedRunDetailChanges, DisplayRunValue } from '../lib/run-detail';

describe('parseAppliedRunDetailChanges', () => {
    const payload = (changes: unknown[]) => JSON.stringify({ DryRun: false, Changes: changes, ChangedFields: [] });

    it('returns [] for null / empty / invalid JSON', () => {
        expect(ParseAppliedRunDetailChanges(null)).toEqual([]);
        expect(ParseAppliedRunDetailChanges(undefined)).toEqual([]);
        expect(ParseAppliedRunDetailChanges('')).toEqual([]);
        expect(ParseAppliedRunDetailChanges('{not json')).toEqual([]);
    });

    it('keeps only applied + changed + error-free changes', () => {
        const result = ParseAppliedRunDetailChanges(payload([
            { Field: 'A', OldValue: 1, NewValue: 2, Applied: true, Changed: true },               // keep
            { Field: 'B', OldValue: 'x', NewValue: 'x', Applied: true, Changed: false },           // drop: unchanged
            { Field: 'C', OldValue: null, NewValue: 'y', Applied: false, Changed: true },          // drop: not applied
            { Field: 'D', OldValue: 1, NewValue: 2, Applied: true, Changed: true, Error: 'boom' }, // drop: errored
        ]));
        expect(result.map((c) => c.Field)).toEqual(['A']);
        expect(result[0].NewValue).toBe(2);
    });

    it('tolerates a payload with no Changes array', () => {
        expect(ParseAppliedRunDetailChanges('{"DryRun":true}')).toEqual([]);
    });
});

describe('displayRunValue', () => {
    it('renders empties as (empty)', () => {
        expect(DisplayRunValue(null)).toBe('(empty)');
        expect(DisplayRunValue(undefined)).toBe('(empty)');
        expect(DisplayRunValue('')).toBe('(empty)');
    });
    it('stringifies primitives + objects', () => {
        expect(DisplayRunValue(0)).toBe('0');
        expect(DisplayRunValue(true)).toBe('true');
        expect(DisplayRunValue({ a: 1 })).toBe('{"a":1}');
    });
});
