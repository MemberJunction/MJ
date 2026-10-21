import { describe, it, expect } from 'vitest';
import { ValuesEqual } from '../util';

describe('ValuesEqual', () => {
    const ISO = '2026-08-01T12:34:56.789Z';
    const EPOCH = new Date(ISO).getTime();

    it('returns true for strictly equal primitives and references', () => {
        expect(ValuesEqual(42, 42)).toBe(true);
        expect(ValuesEqual('abc', 'abc')).toBe(true);
        expect(ValuesEqual(true, true)).toBe(true);
        expect(ValuesEqual(null, null)).toBe(true);
        expect(ValuesEqual(undefined, undefined)).toBe(true);
        const ref = { a: 1 };
        expect(ValuesEqual(ref, ref)).toBe(true);
    });

    it('returns false for differing primitives or null vs undefined', () => {
        expect(ValuesEqual(42, 43)).toBe(false);
        expect(ValuesEqual('abc', 'def')).toBe(false);
        expect(ValuesEqual(null, undefined)).toBe(false);
        expect(ValuesEqual(0, false)).toBe(false);
    });

    it('compares two Date instances by epoch milliseconds', () => {
        expect(ValuesEqual(new Date(ISO), new Date(ISO))).toBe(true);
        expect(ValuesEqual(new Date(ISO), new Date(EPOCH + 1))).toBe(false);
    });

    it('compares a Date instance against an ISO string or numeric timestamp', () => {
        expect(ValuesEqual(new Date(ISO), ISO)).toBe(true);
        expect(ValuesEqual(ISO, new Date(ISO))).toBe(true);
        expect(ValuesEqual(new Date(ISO), EPOCH)).toBe(true);
        expect(ValuesEqual(EPOCH, new Date(ISO))).toBe(true);
        expect(ValuesEqual(new Date(ISO), '2026-08-01T12:34:56.000Z')).toBe(false);
        expect(ValuesEqual(new Date(ISO), 'not-a-date')).toBe(false);
    });

    it('returns false when comparing Invalid Date instances', () => {
        expect(ValuesEqual(new Date('invalid'), new Date('invalid'))).toBe(false);
    });
});
