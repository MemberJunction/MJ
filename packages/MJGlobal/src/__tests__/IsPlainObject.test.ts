/**
 * Unit tests for the shared `IsPlainObject` type guard (`util.ts`).
 *
 * This predicate gates recursion in every deep-merge / tolerant-parse / config-cascade routine that
 * adopts it, so the negative cases are the contract: anything that is NOT a non-null, non-array
 * object must be treated as a replaceable leaf rather than something to walk into.
 */
import { describe, it, expect } from 'vitest';
import { IsPlainObject } from '../util';

describe('IsPlainObject', () => {
    it('accepts object literals, including empty ones', () => {
        expect(IsPlainObject({})).toBe(true);
        expect(IsPlainObject({ a: 1 })).toBe(true);
        expect(IsPlainObject({ nested: { deep: true } })).toBe(true);
        expect(IsPlainObject(Object.create(null))).toBe(true);
    });

    it('rejects null and undefined', () => {
        // `typeof null === 'object'` is the classic trap this guard exists to close.
        expect(IsPlainObject(null)).toBe(false);
        expect(IsPlainObject(undefined)).toBe(false);
    });

    it('rejects arrays — they REPLACE wholesale, they are never merged element-wise', () => {
        expect(IsPlainObject([])).toBe(false);
        expect(IsPlainObject([1, 2, 3])).toBe(false);
        expect(IsPlainObject([{ a: 1 }])).toBe(false);
    });

    it('rejects primitives', () => {
        expect(IsPlainObject('string')).toBe(false);
        expect(IsPlainObject('')).toBe(false);
        expect(IsPlainObject(42)).toBe(false);
        expect(IsPlainObject(0)).toBe(false);
        expect(IsPlainObject(Number.NaN)).toBe(false);
        expect(IsPlainObject(true)).toBe(false);
        expect(IsPlainObject(false)).toBe(false);
        expect(IsPlainObject(Symbol('s'))).toBe(false);
        expect(IsPlainObject(10n)).toBe(false);
    });

    it('rejects functions', () => {
        expect(IsPlainObject(() => undefined)).toBe(false);
        expect(IsPlainObject(function named() { /* no-op */ })).toBe(false);
        expect(IsPlainObject(class Foo {})).toBe(false);
    });

    it('accepts class instances and built-ins — it is structural, not strict', () => {
        // Documented behavior: callers walking JSON-shaped data either never see these, or want
        // them treated as opaque objects. Exclude a specific case at the call site if you need to.
        class Thing { public a = 1; }
        expect(IsPlainObject(new Thing())).toBe(true);
        expect(IsPlainObject(new Date())).toBe(true);
        expect(IsPlainObject(new Map())).toBe(true);
        expect(IsPlainObject(new Error('boom'))).toBe(true);
    });

    it('narrows the type for property access', () => {
        const value: unknown = { key: 'v' };
        if (IsPlainObject(value)) {
            // Compiles only because the guard narrowed `unknown` to an indexable object.
            expect(value['key']).toBe('v');
        } else {
            throw new Error('expected the guard to narrow');
        }
    });
});
