/**
 * `FormatSimpleRowCell` — grid-cell rendering of RunView `'simple'` row values.
 *
 * Simple-read date columns carry real `Date` objects (normalized by @memberjunction/core).
 * The available-resources grid renders host-configured extra columns straight off the raw row,
 * so a date cell must format to the locale instead of falling through to `Date.toString()`
 * ("Sun Aug 10 2026 00:00:00 GMT+0000 (…)") in the cell.
 */
import { describe, it, expect } from 'vitest';
import { FormatSimpleRowCell } from '../lib/format-cell';

describe('FormatSimpleRowCell', () => {
    it('formats a Date to the locale date, not Date.toString()', () => {
        const date = new Date('2026-08-01T00:00:00.000Z');
        const formatted = FormatSimpleRowCell(date);

        expect(formatted).toBe(date.toLocaleDateString());
        expect(String(formatted)).not.toContain('GMT');
    });

    it('passes strings through unchanged, including pre-normalization ISO strings', () => {
        expect(FormatSimpleRowCell('2026-08-01T00:00:00.000Z')).toBe('2026-08-01T00:00:00.000Z');
        expect(FormatSimpleRowCell('Widget A')).toBe('Widget A');
    });

    it('passes numbers and booleans through unchanged', () => {
        expect(FormatSimpleRowCell(42)).toBe(42);
        expect(FormatSimpleRowCell(false)).toBe(false);
    });

    it('renders NULL and undefined as empty string', () => {
        expect(FormatSimpleRowCell(null)).toBe('');
        expect(FormatSimpleRowCell(undefined)).toBe('');
    });
});
