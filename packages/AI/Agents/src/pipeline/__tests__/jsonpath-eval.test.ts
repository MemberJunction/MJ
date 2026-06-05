import { describe, it, expect } from 'vitest';
import { parseJsonPath, evaluateJsonPath } from '../jsonpath-eval';

function query(doc: unknown, path: string): unknown[] {
    return evaluateJsonPath(parseJsonPath(path), doc);
}

describe('jsonpath-eval', () => {
    const doc = {
        store: {
            book: [
                { title: 'A', price: 10 },
                { title: 'B', price: 20 },
            ],
            bicycle: { color: 'red', price: 100 },
        },
    };

    it('returns the root for "$"', () => {
        expect(query(doc, '$')).toEqual([doc]);
    });
    it('member access', () => {
        expect(query(doc, '$.store.bicycle.color')).toEqual(['red']);
    });
    it('array index', () => {
        expect(query(doc, '$.store.book[1].title')).toEqual(['B']);
    });
    it('negative array index', () => {
        expect(query(doc, '$.store.book[-1].title')).toEqual(['B']);
    });
    it('wildcard over array', () => {
        expect(query(doc, '$.store.book[*].price')).toEqual([10, 20]);
    });
    it('wildcard over object values', () => {
        expect(query(doc, '$.store.*').length).toBe(2);
    });
    it('bracket-quoted member', () => {
        expect(query(doc, "$.store['bicycle'].price")).toEqual([100]);
    });
    it('recursive descent collects every matching key', () => {
        expect(query(doc, '$..price').sort((a, b) => (a as number) - (b as number))).toEqual([10, 20, 100]);
    });
    it('out-of-range index yields no match', () => {
        expect(query(doc, '$.store.book[9]')).toEqual([]);
    });

    it('rejects a path that does not start with $', () => {
        expect(() => parseJsonPath('store.book')).toThrow(/must start with/);
    });
    it('rejects filter expressions (no eval)', () => {
        expect(() => parseJsonPath('$.store.book[?(@.price>10)]')).toThrow(/not supported/);
    });
    it('rejects unsupported bracket selectors', () => {
        expect(() => parseJsonPath('$.store.book[1:2]')).toThrow(/Unsupported bracket/);
    });
});
