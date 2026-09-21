import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { Canonicalize, ComputeContentHashAsync, canonicalize, computeContentHashAsync } from '../hashing';

describe('Canonicalize and ComputeContentHashAsync', () => {
    it('canonicalizes object keys in sorted order recursively', () => {
        const obj1 = { b: 2, a: 1, c: { z: 26, y: 25 } };
        const obj2 = { c: { y: 25, z: 26 }, a: 1, b: 2 };
        expect(Canonicalize(obj1)).toBe(Canonicalize(obj2));
        expect(Canonicalize(obj1)).toBe('{"a":1,"b":2,"c":{"y":25,"z":26}}');
        // Backwards compatibility alias
        expect(canonicalize(obj1)).toBe(Canonicalize(obj1));
    });

    it('preserves array order and maps undefined in array to null', () => {
        const arr = [3, 1, 2, undefined];
        expect(Canonicalize(arr)).toBe('[3,1,2,null]');
    });

    it('omits undefined object properties', () => {
        const withUndef = { a: 1, b: undefined, c: 3 };
        const withoutUndef = { a: 1, c: 3 };
        expect(Canonicalize(withUndef)).toBe(Canonicalize(withoutUndef));
        expect(Canonicalize(withUndef)).toBe('{"a":1,"c":3}');
    });

    it('formats Dates as ISO strings', () => {
        const d = new Date('2026-09-21T05:00:00.000Z');
        expect(Canonicalize({ date: d })).toBe('{"date":"2026-09-21T05:00:00.000Z"}');
    });

    it('handles null and primitives', () => {
        expect(Canonicalize(null)).toBe('null');
        expect(Canonicalize(undefined)).toBe('null');
        expect(Canonicalize(42)).toBe('42');
        expect(Canonicalize('hello')).toBe('"hello"');
        expect(Canonicalize(true)).toBe('true');
    });

    it('ComputeContentHashAsync matches node:crypto createHash byte-for-byte', async () => {
        const payload = {
            title: 'Senior Director, Marketing',
            company: 'Acme Corp',
            department: 'Growth',
            metrics: [100, 200, 300],
            tags: { lead: true, tier: 1 },
            createdAt: new Date('2026-01-01T00:00:00.000Z')
        };

        const canonical = Canonicalize(payload);
        const expectedNodeHash = createHash('sha256').update(canonical).digest('hex');

        const asyncHash = await ComputeContentHashAsync(payload);
        expect(asyncHash).toBe(expectedNodeHash);

        // Backwards compatibility alias
        const aliasHash = await computeContentHashAsync(payload);
        expect(aliasHash).toBe(asyncHash);
    });
});
