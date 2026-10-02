import { describe, it, expect } from 'vitest';
import { ValidateJsonAgainstSchemaSubset } from '../json-schema-subset';

describe('ValidateJsonAgainstSchemaSubset', () => {
    it('accepts a value that satisfies the schema', () => {
        const schema = {
            type: 'object',
            required: ['x', 'label'],
            properties: { x: { type: 'number' }, label: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
        };
        expect(ValidateJsonAgainstSchemaSubset({ x: 0.5, label: 'a', tags: ['t'] }, schema)).toEqual([]);
    });

    it('reports a missing required property with its path', () => {
        const errors = ValidateJsonAgainstSchemaSubset({ x: 1 }, { type: 'object', required: ['x', 'y'], properties: {} });
        expect(errors).toEqual(["$: missing required property 'y'"]);
    });

    it('reports wrong types with a path into nested objects and arrays', () => {
        const schema = {
            type: 'object',
            properties: { cell: { type: 'object', properties: { row: { type: 'integer' } } }, list: { type: 'array', items: { type: 'string' } } },
        };
        const errors = ValidateJsonAgainstSchemaSubset({ cell: { row: 1.5 }, list: ['ok', 3] }, schema);
        expect(errors).toEqual(['$.cell.row: expected type integer, got number', '$.list[1]: expected type string, got integer']);
    });

    it('treats integer as a subset of number and supports type unions', () => {
        expect(ValidateJsonAgainstSchemaSubset(3, { type: 'number' })).toEqual([]);
        expect(ValidateJsonAgainstSchemaSubset(null, { type: ['string', 'null'] })).toEqual([]);
        expect(ValidateJsonAgainstSchemaSubset(true, { type: ['string', 'null'] })).toEqual(['$: expected type string | null, got boolean']);
    });

    it('enforces enum with strict equality', () => {
        const schema = { enum: ['image', 'video'] };
        expect(ValidateJsonAgainstSchemaSubset('image', schema)).toEqual([]);
        expect(ValidateJsonAgainstSchemaSubset('pdf', schema)[0]).toContain('is not one of the allowed values');
    });

    it('enforces additionalProperties: false only when properties are declared', () => {
        const strict = { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false };
        expect(ValidateJsonAgainstSchemaSubset({ a: 'x', b: 1 }, strict)).toEqual(["$: unexpected property 'b' (additionalProperties is false)"]);
        expect(ValidateJsonAgainstSchemaSubset({ b: 1 }, { type: 'object', additionalProperties: false })).toEqual([]);
    });

    it('enforces numeric, string and array bounds', () => {
        expect(ValidateJsonAgainstSchemaSubset(2, { type: 'number', minimum: 0, maximum: 1 })).toEqual(['$: 2 is above the maximum of 1']);
        expect(ValidateJsonAgainstSchemaSubset(-1, { type: 'number', minimum: 0 })).toEqual(['$: -1 is below the minimum of 0']);
        expect(ValidateJsonAgainstSchemaSubset('', { type: 'string', minLength: 1 })).toEqual(['$: string is shorter than the minimum length of 1']);
        expect(ValidateJsonAgainstSchemaSubset('abc', { type: 'string', maxLength: 2 })).toEqual(['$: string is longer than the maximum length of 2']);
        expect(ValidateJsonAgainstSchemaSubset([], { type: 'array', minItems: 1 })).toEqual(['$: array has fewer than the minimum of 1 item(s)']);
        expect(ValidateJsonAgainstSchemaSubset([1, 2], { type: 'array', maxItems: 1 })).toEqual(['$: array has more than the maximum of 1 item(s)']);
    });

    it('ignores unknown keywords and malformed schema nodes (forward-compatible, never throws)', () => {
        expect(ValidateJsonAgainstSchemaSubset('anything', { oneOf: [{ type: 'number' }], pattern: '^x$' })).toEqual([]);
        expect(ValidateJsonAgainstSchemaSubset(1, { type: 7 })).toEqual([]);
        expect(ValidateJsonAgainstSchemaSubset(1, 'not a schema' as unknown as Record<string, unknown>)).toEqual([]);
    });

    it('reports every violation, not just the first', () => {
        const errors = ValidateJsonAgainstSchemaSubset({}, { type: 'object', required: ['a', 'b'] });
        expect(errors).toHaveLength(2);
    });
});
