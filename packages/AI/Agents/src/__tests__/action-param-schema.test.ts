import { describe, it, expect, vi } from 'vitest';
import {
    CoerceValueToSchema, DescribeValueSchemaInline, GetStoredValueSchema, ResolveParamElementSchema, SanitizeValueSchema
} from '../native-tools/action-param-schema';
import { BuildToolFromAction, CoerceActionArguments } from '../native-tools/action-tool-builder';
import type { MJActionEntityExtended } from '@memberjunction/actions-base';
import type { MJActionParamEntity } from '@memberjunction/core-entities';

const action = (Name: string): MJActionEntityExtended => ({ ID: Name, Name, Description: null } as unknown as MJActionEntityExtended);

/** A literal stand-in; `ValueSchemaObject` is what the generated accessor returns for the stored text. */
const param = (over: Partial<MJActionParamEntity>): MJActionParamEntity => ({
    Name: 'p', Type: 'Input', ValueType: 'Other', IsArray: false, IsRequired: false,
    Description: null, DefaultValue: null, ValueSchemaObject: null, ...over
} as unknown as MJActionParamEntity);

const declared = (p: MJActionParamEntity): Record<string, unknown> =>
    (BuildToolFromAction(action('T'), [p]).inputSchema as { properties: Record<string, Record<string, unknown>> }).properties[p.Name];

describe('SanitizeValueSchema', () => {
    it('keeps the cross-provider subset, recursively', () => {
        const schema = {
            type: 'object',
            description: 'Template parameters',
            properties: { TopCount: { type: 'integer' }, Sort: { type: 'string', enum: ['asc', 'desc'] } },
            required: ['TopCount']
        };
        expect(SanitizeValueSchema(schema)).toEqual(schema);
    });

    it('drops keywords outside the subset, which a provider would reject the whole request over', () => {
        expect(SanitizeValueSchema({ type: 'string', format: 'uuid', oneOf: [], $ref: '#/x', additionalProperties: false }))
            .toEqual({ type: 'string' });
    });

    it('drops a type that names no JSON type, and a required name with no property behind it', () => {
        expect(SanitizeValueSchema({ type: 'text', properties: { a: { type: 'number' } }, required: ['a', 'b'] }))
            .toEqual({ properties: { a: { type: 'number' } }, required: ['a'] });
    });

    it('returns null for anything that is not an object', () => {
        expect(SanitizeValueSchema(null)).toBeNull();
        expect(SanitizeValueSchema('string')).toBeNull();
        expect(SanitizeValueSchema([{ type: 'string' }])).toBeNull();
    });
});

describe('ResolveParamElementSchema', () => {
    it('uses the stored ValueSchema when present', () => {
        expect(ResolveParamElementSchema(param({ ValueSchemaObject: { type: 'integer' } }))).toEqual({ type: 'integer' });
    });

    it('falls back to the ValueType mapping when there is none', () => {
        expect(ResolveParamElementSchema(param({ ValueType: 'Other' }))).toEqual({ type: 'string' });
        expect(ResolveParamElementSchema(param({ ValueType: 'Simple Object' }))).toEqual({ type: 'object' });
        expect(ResolveParamElementSchema(param({ ValueType: 'Scalar' }))).toEqual({ type: ['string', 'number', 'boolean'] });
    });

    it('falls back with a warning when the stored text is not valid JSON, instead of failing the agent', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const broken = param({ Name: 'Query', ValueType: 'Other' });
        Object.defineProperty(broken, 'ValueSchemaObject', { get: () => { throw new Error('Unexpected token'); } });
        expect(GetStoredValueSchema(broken)).toBeNull();
        expect(ResolveParamElementSchema(broken)).toEqual({ type: 'string' });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe('BuildToolFromAction with a ValueSchema', () => {
    it('declares the stored schema in place of the ValueType mapping', () => {
        // Test SQL Statement.Parameters is ValueType 'Other', which alone declares a string.
        const p = param({
            Name: 'Parameters',
            Description: 'Template parameters',
            ValueSchemaObject: { type: 'object', properties: { TopCount: { type: 'integer' } } }
        });
        expect(declared(p)).toEqual({
            type: 'object',
            properties: { TopCount: { type: 'integer' } },
            description: 'Template parameters'
        });
    });

    it("prefers the schema's own description, and still appends the default", () => {
        const p = param({ Description: 'From the param', DefaultValue: 'asc', ValueSchemaObject: { type: 'string', description: 'From the schema' } });
        expect(declared(p).description).toBe('From the schema Default: asc.');
    });

    it('wraps an IsArray param around the stored element schema, which keeps its own description', () => {
        const p = param({ IsArray: true, Description: 'IDs to load', ValueSchemaObject: { type: 'integer', description: 'One ID' } });
        expect(declared(p)).toEqual({ type: 'array', items: { type: 'integer', description: 'One ID' }, description: 'IDs to load' });
    });

    it('declares a sanitized copy, never the stored keywords a provider would reject', () => {
        const p = param({ ValueSchemaObject: { type: 'string', enum: ['a', 'b'], pattern: '^a$' } as never });
        expect(declared(p)).toEqual({ type: 'string', enum: ['a', 'b'] });
    });
});

describe('CoerceValueToSchema', () => {
    it('decodes an object or array sent as JSON text when the schema does not allow strings', () => {
        expect(CoerceValueToSchema('{"TopCount": 10}', { type: 'object' })).toEqual({ TopCount: 10 });
        expect(CoerceValueToSchema('[1,2]', { type: 'array' })).toEqual([1, 2]);
    });

    it('converts numeric and boolean text to the declared type', () => {
        expect(CoerceValueToSchema('10', { type: 'integer' })).toBe(10);
        expect(CoerceValueToSchema('2.5', { type: 'number' })).toBe(2.5);
        expect(CoerceValueToSchema('true', { type: 'boolean' })).toBe(true);
    });

    it('leaves text that does not fit unchanged, for the Action to reject', () => {
        expect(CoerceValueToSchema('2.5', { type: 'integer' })).toBe('2.5');
        expect(CoerceValueToSchema('ten', { type: 'number' })).toBe('ten');
        expect(CoerceValueToSchema('[1]', { type: 'object' })).toBe('[1]');
    });

    it('never decodes when strings are allowed, so string params keep JSON-looking text', () => {
        expect(CoerceValueToSchema('{"a":1}', { type: 'string' })).toBe('{"a":1}');
        expect(CoerceValueToSchema('10', { type: ['string', 'number'] })).toBe('10');
    });

    it('coerces nested properties and array items', () => {
        const schema = {
            type: 'object' as const,
            properties: { TopCount: { type: 'integer' as const }, Tags: { type: 'array' as const, items: { type: 'boolean' as const } } }
        };
        expect(CoerceValueToSchema('{"TopCount": "10", "Tags": ["true", false], "Extra": "x"}', schema))
            .toEqual({ TopCount: 10, Tags: [true, false], Extra: 'x' });
    });
});

describe('CoerceActionArguments with a ValueSchema', () => {
    it('coerces each argument against the same schema its declaration used', () => {
        const params = [
            param({ Name: 'Parameters', ValueSchemaObject: { type: 'object', properties: { TopCount: { type: 'integer' } } } }),
            param({ Name: 'Limit', ValueSchemaObject: { type: 'integer' } }),
            param({ Name: 'Query', ValueType: 'Other' })
        ];
        const args = { Parameters: '{"TopCount": "10"}', Limit: '5', Query: '{"looks":"like json"}' };
        expect(CoerceActionArguments(params, args)).toEqual({
            Parameters: { TopCount: 10 }, Limit: 5, Query: '{"looks":"like json"}'
        });
    });
});

describe('DescribeValueSchemaInline — the prose catalog', () => {
    it('renders types, enums, arrays and object shapes compactly', () => {
        expect(DescribeValueSchemaInline({ type: 'integer' })).toBe('integer');
        expect(DescribeValueSchemaInline({ type: 'string', enum: ['asc', 'desc'] })).toBe('"asc"|"desc"');
        expect(DescribeValueSchemaInline({ type: 'array', items: { type: 'string' } })).toBe('string[]');
        expect(DescribeValueSchemaInline({
            type: 'object', properties: { TopCount: { type: 'integer' }, Sort: { type: 'string' } }, required: ['TopCount']
        })).toBe('{TopCount: integer, Sort?: string}');
    });
});
