import { describe, it, expect } from 'vitest';
import { OrdinalCompare } from '../util';

describe('ordinalCompare', () => {
    it('sorts strings by UTF-16 code unit order', () => {
        expect(OrdinalCompare('a', 'b')).toBe(-1);
        expect(OrdinalCompare('b', 'a')).toBe(1);
        expect(OrdinalCompare('a', 'a')).toBe(0);
    });

    it('differs from localeCompare on case and diacritics', () => {
        // In ASCII/code-unit order: uppercase 'B' (66) < lowercase 'a' (97)
        expect(OrdinalCompare('B', 'a')).toBe(-1);
        expect(OrdinalCompare('a', 'B')).toBe(1);

        // In ASCII/code-unit order: '_' (95) < 'a' (97)
        expect(OrdinalCompare('_', 'a')).toBe(-1);
    });

    it('handles null and undefined gracefully', () => {
        expect(OrdinalCompare(null, 'a')).toBe(-1);
        expect(OrdinalCompare('a', null)).toBe(1);
        expect(OrdinalCompare(undefined, undefined)).toBe(0);
        expect(OrdinalCompare(null, undefined)).toBe(0);
    });
});
