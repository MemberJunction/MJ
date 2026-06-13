import { describe, it, expect } from 'vitest';
import { ValidateJsonAgainstSchemaLite } from '../custom/json-schema-lite';

describe('ValidateJsonAgainstSchemaLite', () => {
    describe('type keyword', () => {
        it('accepts matching primitive types', () => {
            expect(ValidateJsonAgainstSchemaLite('x', { type: 'string' })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite(1.5, { type: 'number' })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite(3, { type: 'integer' })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite(true, { type: 'boolean' })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite(null, { type: 'null' })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite({}, { type: 'object' })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite([], { type: 'array' })).toEqual([]);
        });

        it('treats integer as a number (integer ⊂ number) but not vice versa', () => {
            expect(ValidateJsonAgainstSchemaLite(3, { type: 'number' })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite(3.14, { type: 'integer' })).toHaveLength(1);
        });

        it('rejects mismatched types with a located message', () => {
            const errors = ValidateJsonAgainstSchemaLite('nope', { type: 'number' });
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain('$');
            expect(errors[0]).toContain('expected type number');
        });

        it('supports union types', () => {
            expect(ValidateJsonAgainstSchemaLite('x', { type: ['string', 'null'] })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite(null, { type: ['string', 'null'] })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite(7, { type: ['string', 'null'] })).toHaveLength(1);
        });
    });

    describe('enum keyword', () => {
        it('accepts listed values and rejects others', () => {
            expect(ValidateJsonAgainstSchemaLite('alloy', { enum: ['alloy', 'verse'] })).toEqual([]);
            const errors = ValidateJsonAgainstSchemaLite('robot', { enum: ['alloy', 'verse'] });
            expect(errors).toHaveLength(1);
            expect(errors[0]).toContain('"robot"');
        });
    });

    describe('object keywords', () => {
        const SCHEMA = {
            type: 'object',
            required: ['name'],
            properties: {
                name: { type: 'string' },
                count: { type: 'integer' },
                nested: { type: 'object', properties: { flag: { type: 'boolean' } } },
            },
        };

        it('accepts a conforming object (optional fields omitted)', () => {
            expect(ValidateJsonAgainstSchemaLite({ name: 'a' }, SCHEMA)).toEqual([]);
        });

        it('reports missing required properties', () => {
            const errors = ValidateJsonAgainstSchemaLite({}, SCHEMA);
            expect(errors).toEqual(["$: missing required property 'name'"]);
        });

        it('recurses into nested properties with dotted paths', () => {
            const errors = ValidateJsonAgainstSchemaLite({ name: 'a', nested: { flag: 'yes' } }, SCHEMA);
            expect(errors).toEqual(['$.nested.flag: expected type boolean, got string']);
        });

        it('ignores extra properties by default but rejects them under additionalProperties:false', () => {
            expect(ValidateJsonAgainstSchemaLite({ name: 'a', extra: 1 }, SCHEMA)).toEqual([]);
            const strict = { ...SCHEMA, additionalProperties: false };
            const errors = ValidateJsonAgainstSchemaLite({ name: 'a', extra: 1 }, strict);
            expect(errors).toEqual(["$: unexpected property 'extra' (additionalProperties is false)"]);
        });
    });

    describe('items keyword', () => {
        it('applies the items subschema to every element with indexed paths', () => {
            const schema = { type: 'array', items: { type: 'string' } };
            expect(ValidateJsonAgainstSchemaLite(['a', 'b'], schema)).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite(['a', 2], schema)).toEqual(['$[1]: expected type string, got integer']);
        });
    });

    describe('tolerance', () => {
        it('ignores unknown keywords and malformed schema nodes (never throws)', () => {
            expect(ValidateJsonAgainstSchemaLite('x', { format: 'email', pattern: '^a' })).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite('x', { type: 42 } as never)).toEqual([]);
            expect(ValidateJsonAgainstSchemaLite('x', null as never)).toEqual([]);
        });
    });

    it('validates the canonical realtime config shape against a realistic ConfigSchema', () => {
        const schema = {
            type: 'object',
            properties: {
                realtime: {
                    type: 'object',
                    properties: {
                        modelPreference: { type: 'string' },
                        allowUserModelOverride: { type: 'boolean' },
                        voice: {
                            type: 'object',
                            properties: {
                                default: {
                                    type: 'object',
                                    properties: { tone: { type: 'string' }, speakingStyle: { type: 'string' } },
                                },
                                providers: { type: 'object' },
                            },
                        },
                        narration: { type: 'object', properties: { paceMs: { type: 'integer' } } },
                    },
                },
            },
        };
        const good = {
            realtime: {
                modelPreference: 'GPT Realtime',
                allowUserModelOverride: true,
                voice: { default: { tone: 'warm' }, providers: { openai: { voice: 'alloy' } } },
                narration: { paceMs: 8000 },
            },
        };
        expect(ValidateJsonAgainstSchemaLite(good, schema)).toEqual([]);

        const bad = { realtime: { narration: { paceMs: 'fast' }, allowUserModelOverride: 'yes' } };
        const errors = ValidateJsonAgainstSchemaLite(bad, schema);
        expect(errors).toHaveLength(2);
        expect(errors.join('\n')).toContain('$.realtime.narration.paceMs');
        expect(errors.join('\n')).toContain('$.realtime.allowUserModelOverride');
    });
});
