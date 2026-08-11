/**
 * `date-cell` helpers — the safe way to consume date cells from RunView `'simple'` results.
 *
 * WHY THESE EXIST. Simple-read date columns are normalized by @memberjunction/core to real
 * `Date` objects on every tier; older cached rows and adjacent sources may still hold ISO
 * strings, and the singular GraphQL transport can deliver epoch-ms numbers. String-manipulating
 * such a cell (`String(st).slice(0, 10)`, `localeCompare` sorts) produced the bug class these
 * helpers replace: day-bucket filters that silently never match and "chronological" sorts
 * ordered alphabetically by weekday name.
 */
import { describe, it, expect } from 'vitest';
import { DateCellTime, DateCellDayKey, DateCellIso, CompareDateCells } from '../shared/date-cell';

const ISO = '2026-08-01T12:30:00.000Z';
const EPOCH = Date.UTC(2026, 7, 1, 12, 30);

describe('DateCellTime', () => {
    it('reads a Date instance', () => {
        expect(DateCellTime(new Date(ISO))).toBe(EPOCH);
    });

    it('reads an ISO string', () => {
        expect(DateCellTime(ISO)).toBe(EPOCH);
    });

    it('reads an epoch-milliseconds number', () => {
        expect(DateCellTime(EPOCH)).toBe(EPOCH);
    });

    it('returns null for null, undefined, and empty string', () => {
        expect(DateCellTime(null)).toBeNull();
        expect(DateCellTime(undefined)).toBeNull();
        expect(DateCellTime('')).toBeNull();
    });

    it('returns null for an unparseable string rather than NaN', () => {
        expect(DateCellTime('not a date')).toBeNull();
    });
});

describe('DateCellDayKey', () => {
    it('produces the same YYYY-MM-DD key for Date and string forms of one instant', () => {
        // The property the day-bucket filters rely on: the key must not depend on which
        // shape the transport happened to deliver.
        expect(DateCellDayKey(new Date(ISO))).toBe('2026-08-01');
        expect(DateCellDayKey(ISO)).toBe('2026-08-01');
        expect(DateCellDayKey(EPOCH)).toBe('2026-08-01');
    });

    it('never matches a real day key for empty or unparseable cells', () => {
        expect(DateCellDayKey(null)).toBeNull();
        expect(DateCellDayKey('nope')).toBeNull();
    });
});

describe('DateCellIso', () => {
    it('emits the identical ISO string whether the source held a Date or a string', () => {
        // CSV export shape stability: the exported cell must not change format with the
        // normalization rollout.
        expect(DateCellIso(new Date(ISO))).toBe(ISO);
        expect(DateCellIso(ISO)).toBe(ISO);
    });

    it('emits empty string for empty or unparseable cells', () => {
        expect(DateCellIso(null)).toBe('');
        expect(DateCellIso('nope')).toBe('');
    });
});

describe('CompareDateCells', () => {
    const earlier = new Date('2026-08-01T00:00:00.000Z');
    const later = new Date('2026-08-09T00:00:00.000Z');

    it('orders chronologically, not by weekday name', () => {
        // Sat Aug 01 vs Sun Aug 09: localeCompare on Date.toString() would put "Sat" before
        // "Sun" only by accident of spelling; these two are chosen so string order and
        // chronological order agree — the mixed pairs below are the discriminating cases.
        expect(CompareDateCells(earlier, later)).toBeLessThan(0);
        expect(CompareDateCells(later, earlier)).toBeGreaterThan(0);
        expect(CompareDateCells(earlier, new Date(earlier))).toBe(0);
    });

    it('compares mixed Date and string cells on the timeline', () => {
        expect(CompareDateCells('2026-08-01T00:00:00.000Z', later)).toBeLessThan(0);
        expect(CompareDateCells(later, '2026-08-01T00:00:00.000Z')).toBeGreaterThan(0);
    });

    it('is the discriminating case for the weekday-name bug', () => {
        // Fri Dec 04 vs Mon Jan 05 of the next year: alphabetically "Fri" < "Mon" agrees,
        // but Wed Dec 30 vs Thu Dec 31: "Wed" > "Thu" alphabetically while Dec 30 < Dec 31
        // chronologically — the exact inversion the old localeCompare sorts shipped.
        // Constructed in LOCAL time, not from a UTC instant. `String(date)` renders the weekday in
        // the runner's zone, so UTC midnight lands on the PREVIOUS day west of Greenwich (Tue/Wed
        // instead of Wed/Thu) — and "Tue" < "Wed" agrees with chronology, so the inversion this test
        // exists to demonstrate silently disappears. The local-date form is Wed/Thu in every zone.
        const dec30 = new Date(2026, 11, 30); // Wednesday
        const dec31 = new Date(2026, 11, 31); // Thursday
        expect(String(dec30).localeCompare(String(dec31))).toBeGreaterThan(0); // the bug
        expect(CompareDateCells(dec30, dec31)).toBeLessThan(0);                // the fix
    });

    it('sorts empty and unparseable cells first, and two absent cells as equal', () => {
        expect(CompareDateCells(null, earlier)).toBeLessThan(0);
        expect(CompareDateCells(earlier, undefined)).toBeGreaterThan(0);
        expect(CompareDateCells(null, undefined)).toBe(0); // sort-safe: never NaN
    });
});
