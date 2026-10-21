import { describe, it, expect } from 'vitest';
import { AssertEqual, AssertLength, AssertMatch, ConformanceAssertionError, IsDeepEqual } from '../testing/assertions';

describe('conformance assertions', () => {
    it('compares values structurally', () => {
        expect(IsDeepEqual({ a: [1, { b: 'x' }], c: null }, { c: null, a: [1, { b: 'x' }] })).toBe(true);
        expect(IsDeepEqual([1, 2], [2, 1])).toBe(false);
        expect(IsDeepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
        expect(IsDeepEqual('1', 1)).toBe(false);
    });

    it('throws ConformanceAssertionError with both values in the message', () => {
        expect(() => AssertEqual(['2'], ['1'], 'numbers')).toThrow(ConformanceAssertionError);
        expect(() => AssertEqual(['2'], ['1'], 'numbers')).toThrow('numbers: expected ["1"] but got ["2"]');
        expect(() => AssertLength([1], 2, 'receive')).toThrow('receive: expected 2 items but got 1');
    });

    it('matches a subset of properties', () => {
        expect(() => AssertMatch({ Kind: 'Settled', Status: 'Completed', DeliveryID: 'd' }, { Kind: 'Settled', Status: 'Completed' }, 'settle')).not.toThrow();
        expect(() => AssertMatch({ Kind: 'LeaseLost' }, { Kind: 'Settled' }, 'settle')).toThrow('settle: expected Kind "Settled" but got "LeaseLost"');
        expect(() => AssertMatch(null, { Kind: 'Settled' }, 'settle')).toThrow('settle: expected an object');
    });
});
