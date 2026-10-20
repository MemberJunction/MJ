/**
 * args.test.ts — the rig's command line: defaults, required flags, and the refusals that stop a
 * measurement from quietly running the wrong thing.
 */
import { describe, expect, it } from 'vitest';
import { ParseMeasurementArgs } from '../../pipeline-type-measurement/args';

const REQUIRED = [
    '--entity', 'MJ: Actions', '--text-fields', 'Name,Description', '--label-field', 'Category',
    '--values', 'System,Data,Utilities,File Storage', '--llm-prompt', 'Decision Eval - Action Category (LLM)', '--out', '/tmp/measure',
];

describe('ParseMeasurementArgs', () => {
    it('parses the required flags and applies the defaults', () => {
        expect(ParseMeasurementArgs(REQUIRED)).toEqual({
            EntityName: 'MJ: Actions', TextFields: ['Name', 'Description'], LabelField: 'Category',
            Values: ['System', 'Data', 'Utilities', 'File Storage'], SampleSize: 200, Reps: 2, Seed: 7, BatchSize: 100,
            LLMPromptName: 'Decision Eval - Action Category (LLM)', DecisionPromptName: 'Default Decision',
            LLMModelName: null, DecisionModelName: null, RequireModel: false, AllowDatabase: null, OutDir: '/tmp/measure', DryRun: false,
        });
    });

    it('reads the optional flags', () => {
        const parsed = ParseMeasurementArgs([...REQUIRED, '--sample', '40', '--reps', '3', '--seed', '0', '--batch-size', '10', '--decision-prompt', 'Other', '--dry-run']);
        expect(parsed).toMatchObject({ SampleSize: 40, Reps: 3, Seed: 0, BatchSize: 10, DecisionPromptName: 'Other', DryRun: true });
    });

    it('reads the model each arm must be answered by, and --require-model', () => {
        const parsed = ParseMeasurementArgs([...REQUIRED, '--llm-model', ' Gemini 3.1 Flash-Lite ', '--decision-model', 'Jev', '--require-model']);
        expect(parsed).toMatchObject({ LLMModelName: 'Gemini 3.1 Flash-Lite', DecisionModelName: 'Jev', RequireModel: true });
        expect(() => ParseMeasurementArgs([...REQUIRED, '--decision-model', ' '])).toThrow(/--decision-model needs a value/);
    });

    it('reads the database --allow-db allows', () => {
        expect(ParseMeasurementArgs([...REQUIRED, '--allow-db', 'CustomerCopy']).AllowDatabase).toBe('CustomerCopy');
        expect(() => ParseMeasurementArgs([...REQUIRED, '--allow-db'])).toThrow(/--allow-db needs a value/);
    });

    it('requires --out and the other required flags', () => {
        expect(() => ParseMeasurementArgs(REQUIRED.slice(0, -2))).toThrow(/--out is required/);
        expect(() => ParseMeasurementArgs(REQUIRED.slice(2))).toThrow(/--entity is required/);
    });

    it('refuses an unknown flag, a bad number, and a flag with no value', () => {
        expect(() => ParseMeasurementArgs([...REQUIRED, '--sampel', '50'])).toThrow(/Unknown flag\(s\): --sampel/);
        expect(() => ParseMeasurementArgs([...REQUIRED, '--reps', '0'])).toThrow(/--reps must be an integer of at least 1/);
        expect(() => ParseMeasurementArgs([...REQUIRED, '--sample', '2.5'])).toThrow(/--sample must be an integer/);
        expect(() => ParseMeasurementArgs([...REQUIRED, '--seed'])).toThrow(/--seed needs a value/);
    });

    it('refuses fewer than two distinct values, and the label among the text fields', () => {
        const withValues = (values: string): string[] => REQUIRED.map((arg, i) => (REQUIRED[i - 1] === '--values' ? values : arg));
        expect(() => ParseMeasurementArgs(withValues('System'))).toThrow(/at least two distinct values/);
        expect(() => ParseMeasurementArgs(withValues('System,system'))).toThrow(/at least two distinct values/);
        const leaking = REQUIRED.map((arg, i) => (REQUIRED[i - 1] === '--text-fields' ? 'Name,Category' : arg));
        expect(() => ParseMeasurementArgs(leaking)).toThrow(/must not include the label field/);
    });
});
