/**
 * Date-cell helpers for values read from RunView `'simple'` results.
 *
 * Simple-read date columns are normalized by @memberjunction/core to real `Date` objects on
 * every tier; older cached rows and other sources may still hold ISO strings. These helpers
 * accept both shapes so call sites never string-manipulate a value that might be a `Date` —
 * the bug class that produced weekday-alphabetical "chronological" sorts and day-bucket
 * filters that silently never match.
 */

/** A date cell as it may arrive from a simple read or adjacent sources. */
export type DateCellValue = Date | string | number | null | undefined;

/**
 * Epoch milliseconds for a date cell, or null when the cell is empty or unparseable.
 */
export function DateCellTime(value: DateCellValue): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
}

/**
 * The UTC calendar-day key (`YYYY-MM-DD`) for a date cell, or null when empty/unparseable.
 * Use for day-bucket comparisons instead of `String(value).slice(0, 10)`, which reads
 * `"Mon Aug 10"` off a `Date` and never matches an ISO day string.
 */
export function DateCellDayKey(value: DateCellValue): string | null {
    const time = DateCellTime(value);
    return time === null ? null : new Date(time).toISOString().slice(0, 10);
}

/**
 * The full ISO-8601 string for a date cell, or the empty string when empty/unparseable.
 * Use for CSV/JSON export cells so the exported shape stays stable whether the source
 * held a `Date` or an ISO string.
 */
export function DateCellIso(value: DateCellValue): string {
    const time = DateCellTime(value);
    return time === null ? '' : new Date(time).toISOString();
}

/**
 * Chronological comparator for date cells (ascending). Empty/unparseable cells sort first.
 * Use instead of `localeCompare`, which orders `Date.toString()` output alphabetically by
 * weekday name.
 */
export function CompareDateCells(a: DateCellValue, b: DateCellValue): number {
    const aTime = DateCellTime(a);
    const bTime = DateCellTime(b);
    if (aTime === null && bTime === null) {
        return 0;
    }
    if (aTime === null) {
        return -1;
    }
    if (bTime === null) {
        return 1;
    }
    return aTime - bTime;
}
