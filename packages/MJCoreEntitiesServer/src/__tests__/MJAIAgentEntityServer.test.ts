/**
 * Unit tests for the PURE validation core behind `MJAIAgentEntityServer.ValidateAsync` —
 * the `TypeConfiguration ⊨ ConfigSchema` invariant. Follows the package's exported-pure-function
 * test style (entity instantiation needs live metadata, so the DB-coupled wrapper is thin and
 * the matrix lives here).
 */
import { describe, it, expect } from 'vitest';
import { ValidationErrorType } from '@memberjunction/core';
import { BuildTypeConfigurationValidationErrors } from '../custom/MJAIAgentEntityServer.server';

const SCHEMA = JSON.stringify({
    type: 'object',
    required: ['realtime'],
    properties: {
        realtime: {
            type: 'object',
            properties: {
                modelPreference: { type: 'string' },
                allowUserModelOverride: { type: 'boolean' },
                narration: { type: 'object', properties: { paceMs: { type: 'integer' } } },
            },
        },
    },
});

describe('BuildTypeConfigurationValidationErrors', () => {
    it('accepts a conforming configuration', () => {
        const config = JSON.stringify({ realtime: { modelPreference: 'GPT Realtime', narration: { paceMs: 5000 } } });
        expect(BuildTypeConfigurationValidationErrors(config, SCHEMA)).toEqual([]);
    });

    it('FAILS on unparseable TypeConfiguration JSON', () => {
        const errors = BuildTypeConfigurationValidationErrors('{broken', SCHEMA);
        expect(errors).toHaveLength(1);
        expect(errors[0].Source).toBe('TypeConfiguration');
        expect(errors[0].Type).toBe(ValidationErrorType.Failure);
        expect(errors[0].Message).toMatch(/not valid JSON/i);
    });

    it('FAILS on non-object TypeConfiguration (arrays and scalars)', () => {
        for (const payload of ['[1,2]', '"string"', '42', 'null']) {
            const errors = BuildTypeConfigurationValidationErrors(payload, SCHEMA);
            expect(errors).toHaveLength(1);
            expect(errors[0].Type).toBe(ValidationErrorType.Failure);
            expect(errors[0].Message).toMatch(/must be a JSON object/i);
        }
    });

    it('is freeform (no errors) when the type publishes NO schema', () => {
        const config = JSON.stringify({ anything: { goes: true } });
        expect(BuildTypeConfigurationValidationErrors(config, null)).toEqual([]);
        expect(BuildTypeConfigurationValidationErrors(config, '')).toEqual([]);
        expect(BuildTypeConfigurationValidationErrors(config, '   ')).toEqual([]);
    });

    it('still rejects non-object configuration even without a schema', () => {
        const errors = BuildTypeConfigurationValidationErrors('[1]', null);
        expect(errors).toHaveLength(1);
        expect(errors[0].Type).toBe(ValidationErrorType.Failure);
    });

    it('WARNS (does not fail) on an unparseable ConfigSchema — a metadata bug must not brick agent saves', () => {
        const config = JSON.stringify({ realtime: {} });
        for (const badSchema of ['{broken', '[1,2]', '"schema"']) {
            const errors = BuildTypeConfigurationValidationErrors(config, badSchema);
            expect(errors).toHaveLength(1);
            expect(errors[0].Type).toBe(ValidationErrorType.Warning);
            expect(errors[0].Message).toMatch(/ConfigSchema/);
        }
    });

    it('FAILS per schema violation with the JSON-path location', () => {
        const config = JSON.stringify({ realtime: { allowUserModelOverride: 'yes', narration: { paceMs: 'fast' } } });
        const errors = BuildTypeConfigurationValidationErrors(config, SCHEMA);
        expect(errors).toHaveLength(2);
        for (const error of errors) {
            expect(error.Source).toBe('TypeConfiguration');
            expect(error.Type).toBe(ValidationErrorType.Failure);
            expect(error.Message).toMatch(/does not conform/);
        }
        const combined = errors.map((e) => e.Message).join('\n');
        expect(combined).toContain('$.realtime.allowUserModelOverride');
        expect(combined).toContain('$.realtime.narration.paceMs');
    });

    it('FAILS on a missing required section', () => {
        const errors = BuildTypeConfigurationValidationErrors(JSON.stringify({ other: 1 }), SCHEMA);
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain("missing required property 'realtime'");
    });
});
