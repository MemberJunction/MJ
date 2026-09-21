import { describe, it, expect } from 'vitest';
import { ordinalCompare } from '../util';

describe('ordinalCompare', () => {
    it('sorts strings by UTF-16 code unit order', () => {
        expect(ordinalCompare('a', 'b')).toBe(-1);
        expect(ordinalCompare('b', 'a')).toBe(1);
        expect(ordinalCompare('a', 'a')).toBe(0);
    });

    it('differs from localeCompare on case and diacritics', () => {
        // In ASCII/code-unit order: uppercase 'B' (66) < lowercase 'a' (97)
        expect(ordinalCompare('B', 'a')).toBe(-1);
        expect(ordinalCompare('a', 'B')).toBe(1);

        // In ASCII/code-unit order: '_' (95) < 'a' (97)
        expect(ordinalCompare('_', 'a')).toBe(-1);
    });

    it('handles null and undefined gracefully', () => {
        expect(ordinalCompare(null, 'a')).toBe(-1);
        expect(ordinalCompare('a', null)).toBe(1);
        expect(ordinalCompare(undefined, undefined)).toBe(0);
        expect(ordinalCompare(null, undefined)).toBe(0);
    });
});
