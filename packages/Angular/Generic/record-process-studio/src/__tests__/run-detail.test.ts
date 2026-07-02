/**
 * Unit tests for the pure Process Run Detail parsing/display helpers the run-history audit view relies on.
 */
import { describe, it, expect } from 'vitest';
import { parseAppliedRunDetailChanges, displayRunValue } from '../lib/run-detail';

describe('parseAppliedRunDetailChanges', () => {
    const payload = (changes: unknown[]) => JSON.stringify({ DryRun: false, Changes: changes, ChangedFields: [] });

    it('returns [] for null / empty / invalid JSON', () => {
        expect(parseAppliedRunDetailChanges(null)).toEqual([]);
        expect(parseAppliedRunDetailChanges(undefined)).toEqual([]);
        expect(parseAppliedRunDetailChanges('')).toEqual([]);
        expect(parseAppliedRunDetailChanges('{not json')).toEqual([]);
    });

    it('keeps only applied + changed + error-free changes', () => {
        const result = parseAppliedRunDetailChanges(payload([
            { Field: 'A', OldValue: 1, NewValue: 2, Applied: true, Changed: true },               // keep
            { Field: 'B', OldValue: 'x', NewValue: 'x', Applied: true, Changed: false },           // drop: unchanged
            { Field: 'C', OldValue: null, NewValue: 'y', Applied: false, Changed: true },          // drop: not applied
            { Field: 'D', OldValue: 1, NewValue: 2, Applied: true, Changed: true, Error: 'boom' }, // drop: errored
        ]));
        expect(result.map((c) => c.Field)).toEqual(['A']);
        expect(result[0].NewValue).toBe(2);
    });

    it('tolerates a payload with no Changes array', () => {
        expect(parseAppliedRunDetailChanges('{"DryRun":true}')).toEqual([]);
    });
});

describe('displayRunValue', () => {
    it('renders empties as (empty)', () => {
        expect(displayRunValue(null)).toBe('(empty)');
        expect(displayRunValue(undefined)).toBe('(empty)');
        expect(displayRunValue('')).toBe('(empty)');
    });
    it('stringifies primitives + objects', () => {
        expect(displayRunValue(0)).toBe('0');
        expect(displayRunValue(true)).toBe('true');
        expect(displayRunValue({ a: 1 })).toBe('{"a":1}');
    });
});
