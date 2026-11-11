/**
 * Unit tests for `SafeDeepMerge` (`util.ts`) — the shared config-cascade deep merge.
 *
 * The prototype-pollution cases are the contract: layers can be client-supplied JSON, and
 * `JSON.parse` turns a `"__proto__"` key into an own property that a naive merge follows into
 * `Object.prototype` (CodeQL #169, #553 on issue #5569).
 */
import { afterEach, describe, it, expect } from 'vitest';
import { SafeDeepMerge } from '../util';

type Polluted = { polluted?: unknown };

function cleanPrototype(): void {
    delete (Object.prototype as Polluted).polluted;
}

describe('SafeDeepMerge — merge semantics', () => {
    it('returns an empty object when no layer contributes', () => {
        expect(SafeDeepMerge()).toEqual({});
        expect(SafeDeepMerge(null, undefined, [1, 2], 'x', 3)).toEqual({});
    });

    it('deep-merges plain objects, later layers winning per key', () => {
        expect(
            SafeDeepMerge({ a: { x: 1, y: 2 }, keep: true }, { a: { y: 3, z: 4 } }, { a: { z: 5 } })
        ).toEqual({ a: { x: 1, y: 3, z: 5 }, keep: true });
    });

    it('replaces arrays with a copy rather than merging or aliasing them', () => {
        const source = { list: [9] };
        const merged = SafeDeepMerge({ list: [1, 2, 3] }, source);
        expect(merged).toEqual({ list: [9] });
        expect(merged['list']).not.toBe(source.list);
    });

    it('replaces across shape changes and treats null as a value', () => {
        expect(SafeDeepMerge({ a: { b: 1 } }, { a: 'flat' })).toEqual({ a: 'flat' });
        expect(SafeDeepMerge({ a: 'flat' }, { a: { b: 1 } })).toEqual({ a: { b: 1 } });
        expect(SafeDeepMerge({ a: { b: 1 } }, { a: null })).toEqual({ a: null });
    });

    it('skips undefined incoming values', () => {
        expect(SafeDeepMerge({ a: 1 }, { a: undefined })).toEqual({ a: 1 });
    });

    it('never mutates its inputs', () => {
        const base = { a: { x: 1 } };
        const overlay = { a: { y: 2 } };
        const merged = SafeDeepMerge(base, overlay);
        expect(base).toEqual({ a: { x: 1 } });
        expect(overlay).toEqual({ a: { y: 2 } });
        expect(merged['a']).not.toBe(base.a);
        expect(merged['a']).not.toBe(overlay.a);
    });
});

describe('SafeDeepMerge — prototype pollution', () => {
    afterEach(cleanPrototype);

    it('ignores a top-level __proto__ key from parsed JSON', () => {
        const merged = SafeDeepMerge({ a: 1 }, JSON.parse('{"__proto__":{"polluted":1}}'));
        expect(({} as Polluted).polluted).toBeUndefined();
        expect(merged).toEqual({ a: 1 });
        expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
    });

    it('ignores a nested __proto__ key, whether or not the parent already exists', () => {
        const r1 = SafeDeepMerge({ a: { b: 1 } }, JSON.parse('{"a":{"__proto__":{"polluted":1}}}'));
        const r2 = SafeDeepMerge(JSON.parse('{"a":{"__proto__":{"polluted":1}}}'));
        expect(({} as Polluted).polluted).toBeUndefined();
        expect(r1).toEqual({ a: { b: 1 } });
        expect(r2).toEqual({ a: {} });
    });

    it('ignores constructor and prototype keys at every depth', () => {
        const merged = SafeDeepMerge(
            JSON.parse('{"constructor":{"prototype":{"polluted":1}},"a":{"constructor":{"prototype":{"polluted":1}},"prototype":{"polluted":1},"ok":true}}')
        );
        expect(({} as Polluted).polluted).toBeUndefined();
        expect(merged).toEqual({ a: { ok: true } });
    });
});
