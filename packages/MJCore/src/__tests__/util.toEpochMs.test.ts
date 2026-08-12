import { describe, it, expect } from 'vitest';
import { ToEpochMs } from '../generic/util';

/**
 * `ToEpochMs` is the shared guard behind every agent-context date comparator, so its contract
 * is pinned directly here rather than only through those call sites.
 *
 * The contract that matters to a comparator: ALWAYS return a finite number. A comparator that
 * can return `NaN` is incoherent — `sort` gets inconsistent orderings from it — which is the
 * subtle half of the bug the old `?? 0` / `|| 0` patterns left open.
 */
describe('ToEpochMs', () => {
    const ISO = '2026-08-01T00:00:00.000Z';
    const EPOCH = Date.UTC(2026, 7, 1);

    it('returns getTime() for a Date', () => {
        expect(ToEpochMs(new Date(ISO))).toBe(EPOCH);
    });

    it('parses an ISO string — the poisoned-cache shape that used to throw', () => {
        expect(ToEpochMs(ISO)).toBe(EPOCH);
    });

    it('accepts a numeric timestamp', () => {
        expect(ToEpochMs(EPOCH)).toBe(EPOCH);
    });

    it('returns 0 for null and undefined', () => {
        expect(ToEpochMs(null)).toBe(0);
        expect(ToEpochMs(undefined)).toBe(0);
    });

    it('returns 0 for an unparseable string rather than NaN', () => {
        expect(ToEpochMs('not-a-date')).toBe(0);
    });

    it('returns 0 for an Invalid Date rather than NaN', () => {
        // The case `?? 0` could not catch: Invalid Date's getTime() is NaN, and NaN is not
        // nullish, so the old form propagated NaN straight into the comparator.
        expect(ToEpochMs(new Date('garbage'))).toBe(0);
    });

    it('returns 0 for an empty string', () => {
        expect(ToEpochMs('')).toBe(0);
    });

    it('never returns NaN for any of the above', () => {
        const inputs: Array<Date | string | number | null | undefined> = [
            new Date(ISO), ISO, EPOCH, null, undefined, 'not-a-date', new Date('garbage'), '', 0,
        ];
        for (const input of inputs) {
            expect(Number.isNaN(ToEpochMs(input))).toBe(false);
        }
    });

    it('orders correctly when used as a descending comparator over mixed shapes', () => {
        const rows = [
            { id: 'missing', at: null },
            { id: 'old', at: '2026-08-01T00:00:00.000Z' },
            { id: 'new', at: new Date('2026-08-03T00:00:00.000Z') },
            { id: 'mid', at: Date.UTC(2026, 7, 2) },
        ];
        const sorted = [...rows].sort((a, b) => ToEpochMs(b.at) - ToEpochMs(a.at));
        expect(sorted.map((r) => r.id)).toEqual(['new', 'mid', 'old', 'missing']);
    });
});
