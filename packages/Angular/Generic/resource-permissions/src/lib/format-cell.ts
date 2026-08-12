/**
 * Formats a raw cell value from a RunView `'simple'` row for grid display.
 *
 * Simple-read date columns carry real `Date` objects (normalized by @memberjunction/core);
 * rendered raw they print the verbose `Date.toString()` form, so dates are formatted to the
 * viewer's locale. Everything else passes through, with NULL/undefined as an empty string.
 */
export function FormatSimpleRowCell(value: unknown): unknown {
    if (value === null || value === undefined) {
        return '';
    }
    if (value instanceof Date) {
        return value.toLocaleDateString();
    }
    return value;
}
