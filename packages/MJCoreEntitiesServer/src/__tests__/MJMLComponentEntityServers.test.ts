/**
 * Unit tests for the PURE validation cores behind the two ML component entity servers —
 * `Spec ⊨ SpecSchema` and the nullable-JSON-column check. Follows the package's
 * exported-pure-function style (entity instantiation needs live metadata, so the DB-coupled
 * wrappers stay thin and the matrix lives here).
 */
import { describe, it, expect } from 'vitest';
import { ValidationErrorType } from '@memberjunction/core';
import { BuildComponentSpecValidationErrors } from '../custom/MJMLComponentEntityServer.server';
import { validateJsonColumn } from '../custom/MJMLComponentTypeEntityServer.server';

/** The Glass-Box Rubric spec schema, shaped like the real seeded one. */
const RUBRIC_SCHEMA = JSON.stringify({
    type: 'object',
    required: ['weights'],
    properties: {
        weights: { type: 'object' },
        scaleMin: { type: 'number' },
        scaleMax: { type: 'number' },
        missingDataPolicy: { type: 'string', enum: ['Zero', 'NeutralMidpoint', 'Exclude'] },
    },
});

describe('validateJsonColumn', () => {
    it('treats absence as legitimate — null, undefined and blank are all fine', () => {
        expect(validateJsonColumn('Spec', null)).toEqual([]);
        expect(validateJsonColumn('Spec', undefined)).toEqual([]);
        expect(validateJsonColumn('Spec', '   ')).toEqual([]);
    });

    it('accepts any valid JSON, including arrays and scalars', () => {
        expect(validateJsonColumn('Spec', '{"a":1}')).toEqual([]);
        expect(validateJsonColumn('Spec', '[1,2]')).toEqual([]);
        expect(validateJsonColumn('Spec', '42')).toEqual([]);
    });

    it('fails a column it cannot parse, naming the column', () => {
        const errors = validateJsonColumn('FittedState', '{not json');
        expect(errors).toHaveLength(1);
        expect(errors[0].Source).toBe('FittedState');
        expect(errors[0].Type).toBe(ValidationErrorType.Failure);
        expect(errors[0].Message).toContain('not valid JSON');
    });
});

describe('BuildComponentSpecValidationErrors', () => {
    it('accepts a conforming spec', () => {
        const spec = JSON.stringify({ weights: { tenure: 0.6, recency: 0.4 }, scaleMin: 0, scaleMax: 100 });
        expect(BuildComponentSpecValidationErrors(spec, RUBRIC_SCHEMA, 'Glass-Box Rubric')).toEqual([]);
    });

    it('leaves the spec alone when the component has none', () => {
        expect(BuildComponentSpecValidationErrors(null, RUBRIC_SCHEMA, 'Glass-Box Rubric')).toEqual([]);
        expect(BuildComponentSpecValidationErrors('  ', RUBRIC_SCHEMA, 'Glass-Box Rubric')).toEqual([]);
    });

    it('leaves the spec freeform when the type publishes no schema', () => {
        const spec = JSON.stringify({ anything: true });
        expect(BuildComponentSpecValidationErrors(spec, null, 'Impute')).toEqual([]);
        expect(BuildComponentSpecValidationErrors(spec, '   ', 'Impute')).toEqual([]);
    });

    it('fails an unparseable spec', () => {
        const errors = BuildComponentSpecValidationErrors('{oops', RUBRIC_SCHEMA, 'Glass-Box Rubric');
        expect(errors).toHaveLength(1);
        expect(errors[0].Type).toBe(ValidationErrorType.Failure);
        expect(errors[0].Message).toContain('not valid JSON');
    });

    it('fails a spec that is an array or a scalar — a spec is keyed configuration', () => {
        for (const bad of ['[1,2]', '"a string"', 'null']) {
            const errors = BuildComponentSpecValidationErrors(bad, RUBRIC_SCHEMA, 'Glass-Box Rubric');
            expect(errors, bad).toHaveLength(1);
            expect(errors[0].Message).toContain('must be a JSON object');
        }
    });

    it('fails each schema violation, naming the type and the location', () => {
        const spec = JSON.stringify({ scaleMin: 0 }); // missing the required `weights`
        const errors = BuildComponentSpecValidationErrors(spec, RUBRIC_SCHEMA, 'Glass-Box Rubric');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.every((e) => e.Type === ValidationErrorType.Failure)).toBe(true);
        expect(errors[0].Message).toContain("'Glass-Box Rubric' component type's SpecSchema");
        expect(errors[0].Message).toContain('weights');
    });

    it('fails an out-of-enum value', () => {
        const spec = JSON.stringify({ weights: {}, missingDataPolicy: 'Ignore' });
        const errors = BuildComponentSpecValidationErrors(spec, RUBRIC_SCHEMA, 'Glass-Box Rubric');
        expect(errors.some((e) => e.Message.includes('missingDataPolicy'))).toBe(true);
    });

    it('WARNS (never blocks) when the TYPE publishes a malformed schema', () => {
        // A metadata bug on the type row must not brick every instance of that type.
        for (const badSchema of ['{not json', '[1,2]', '"scalar"']) {
            const errors = BuildComponentSpecValidationErrors('{"weights":{}}', badSchema, 'Glass-Box Rubric');
            expect(errors, badSchema).toHaveLength(1);
            expect(errors[0].Type).toBe(ValidationErrorType.Warning);
            expect(errors[0].Message).toContain('fix the SpecSchema on the component type');
        }
    });
});
