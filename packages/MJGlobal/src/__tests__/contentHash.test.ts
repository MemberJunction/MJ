import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalize, computeContentHashAsync } from '../hashing';

describe('canonicalize and computeContentHashAsync', () => {
    it('canonicalizes object keys in sorted order recursively', () => {
        const obj1 = { b: 2, a: 1, c: { z: 26, y: 25 } };
        const obj2 = { c: { y: 25, z: 26 }, a: 1, b: 2 };
        expect(canonicalize(obj1)).toBe(canonicalize(obj2));
        expect(canonicalize(obj1)).toBe('{"a":1,"b":2,"c":{"y":25,"z":26}}');
    });

    it('preserves array order and maps undefined in array to null', () => {
        const arr = [3, 1, 2, undefined];
        expect(canonicalize(arr)).toBe('[3,1,2,null]');
    });

    it('omits undefined object properties', () => {
        const withUndef = { a: 1, b: undefined, c: 3 };
        const withoutUndef = { a: 1, c: 3 };
        expect(canonicalize(withUndef)).toBe(canonicalize(withoutUndef));
        expect(canonicalize(withUndef)).toBe('{"a":1,"c":3}');
    });

    it('formats Dates as ISO strings', () => {
        const d = new Date('2026-09-21T05:00:00.000Z');
        expect(canonicalize({ date: d })).toBe('{"date":"2026-09-21T05:00:00.000Z"}');
    });

    it('handles null and primitives', () => {
        expect(canonicalize(null)).toBe('null');
        expect(canonicalize(undefined)).toBe('null');
        expect(canonicalize(42)).toBe('42');
        expect(canonicalize('hello')).toBe('"hello"');
        expect(canonicalize(true)).toBe('true');
    });

    it('computeContentHashAsync matches node:crypto createHash byte-for-byte', async () => {
        const payload = {
            title: 'Senior Director, Marketing',
            company: 'Acme Corp',
            department: 'Growth',
            metrics: [100, 200, 300],
            tags: { lead: true, tier: 1 },
            createdAt: new Date('2026-01-01T00:00:00.000Z')
        };

        const canonical = canonicalize(payload);
        const expectedNodeHash = createHash('sha256').update(canonical).digest('hex');

        const asyncHash = await computeContentHashAsync(payload);
        expect(asyncHash).toBe(expectedNodeHash);
    });
});
