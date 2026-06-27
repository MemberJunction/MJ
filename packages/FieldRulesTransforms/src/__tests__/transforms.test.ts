import { describe, it, expect } from 'vitest';
import { FieldTransformEngine, GetFieldTransform, type TransformType } from '@memberjunction/global';
import { RegisterFieldRulesTransforms } from '../index';

RegisterFieldRulesTransforms();
const engine = new FieldTransformEngine();
const run = (value: unknown, type: TransformType, config: unknown): unknown =>
    engine.ExecutePipeline(value, {}, [{ Type: type, Config: config as never }]).Value;

describe('registration', () => {
    it('registers jsonpath + xpath into the global registry', () => {
        expect(GetFieldTransform('jsonpath')).toBeTypeOf('function');
        expect(GetFieldTransform('xpath')).toBeTypeOf('function');
    });
});

describe('jsonpath transform', () => {
    it('extracts the first match from a JSON string', () => {
        expect(run('{"store":{"book":[{"title":"A"},{"title":"B"}]}}', 'jsonpath', { Path: '$.store.book[0].title' })).toBe('A');
    });
    it('returns all matches with First:false', () => {
        expect(run('{"a":[1,2,3]}', 'jsonpath', { Path: '$.a[*]', First: false })).toEqual([1, 2, 3]);
    });
    it('works on an already-parsed object', () => {
        expect(run({ x: { y: 42 } }, 'jsonpath', { Path: '$.x.y' })).toBe(42);
    });
    it('returns null when nothing matches', () => {
        expect(run('{"a":1}', 'jsonpath', { Path: '$.nope' })).toBeNull();
    });
});

describe('xpath transform', () => {
    it('extracts element text', () => {
        expect(run('<catalog><book><title>Hello</title></book></catalog>', 'xpath', { Path: '/catalog/book/title/text()' })).toBe('Hello');
    });
    it('extracts an attribute value', () => {
        expect(run('<root><item id="42"/></root>', 'xpath', { Path: 'string(/root/item/@id)' })).toBe('42');
    });
    it('returns all matches with First:false', () => {
        expect(run('<r><i>a</i><i>b</i></r>', 'xpath', { Path: '//i/text()', First: false })).toEqual(['a', 'b']);
    });
});
