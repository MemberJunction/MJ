/**
 * Tests for BaseAgent.getCollectionFromPayload — the ForEach collection resolver used by Flow agents.
 *
 * Exercises the REAL private method on a real BaseAgent instance (no reimplementation), covering:
 *   - the new `static:[...]` literal-collection support (iterate a fixed list/range with no prior
 *     step building the array in the payload), and
 *   - the existing `payload.path` / bare-path resolution, to lock in that the new branch is additive.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';

describe('BaseAgent.getCollectionFromPayload — ForEach collection resolution', () => {
    const agent = new BaseAgent();
    const getCollection = (payload: unknown, path: string): unknown[] | null =>
        (agent as unknown as Record<string, (p: unknown, path: string) => unknown[] | null>)['getCollectionFromPayload'](payload, path);

    describe('static: literal collections (new)', () => {
        it('parses a static numeric array', () => {
            expect(getCollection({}, 'static:[1,2,3,4,5]')).toEqual([1, 2, 3, 4, 5]);
        });

        it('parses a static string array', () => {
            expect(getCollection({}, 'static:["a","b","c"]')).toEqual(['a', 'b', 'c']);
        });

        it('accepts an empty static array', () => {
            expect(getCollection({}, 'static:[]')).toEqual([]);
        });

        it('trims whitespace around the literal', () => {
            expect(getCollection({}, 'static: [1, 2, 3] ')).toEqual([1, 2, 3]);
        });

        it('is case-insensitive on the static: prefix', () => {
            expect(getCollection({}, 'STATIC:[1,2]')).toEqual([1, 2]);
        });

        it('returns null for invalid JSON', () => {
            expect(getCollection({}, 'static:not-json')).toBeNull();
        });

        it('returns null when the literal is an object, not an array', () => {
            expect(getCollection({}, 'static:{"a":1}')).toBeNull();
        });

        it('returns null when the literal is a scalar, not an array', () => {
            expect(getCollection({}, 'static:42')).toBeNull();
        });

        it('ignores the payload entirely for static collections', () => {
            expect(getCollection({ anything: [0] }, 'static:[9,9]')).toEqual([9, 9]);
        });
    });

    describe('payload-path collections (existing behavior preserved)', () => {
        it('resolves an array at a payload. path', () => {
            expect(getCollection({ items: [10, 20] }, 'payload.items')).toEqual([10, 20]);
        });

        it('resolves an array at a bare path (no prefix)', () => {
            expect(getCollection({ items: [1] }, 'items')).toEqual([1]);
        });

        it('resolves a nested payload path', () => {
            expect(getCollection({ a: { b: [7] } }, 'payload.a.b')).toEqual([7]);
        });

        it('returns null when the path value is not an array', () => {
            expect(getCollection({ items: 'nope' }, 'payload.items')).toBeNull();
        });

        it('returns null when the path is missing', () => {
            expect(getCollection({}, 'payload.missing')).toBeNull();
        });
    });
});
