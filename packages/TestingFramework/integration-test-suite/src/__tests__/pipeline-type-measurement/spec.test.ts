/**
 * spec.test.ts — the two specs (identical except PipelineType and the prompt each runs), the value
 * descriptions with and without source text, the label column, and reading an answer back.
 */
import { describe, expect, it } from 'vitest';
import {
    AssertTextFieldsExcludeLabel, BuildMeasurementSpecs, BuildValueDescriptions, ReadPrediction, ResolveLabelColumn,
} from '../../pipeline-type-measurement/spec';
import type { LabelFieldStub, MeasurementSpecInput } from '../../pipeline-type-measurement/spec';
import type { MeasuredRecordResult, MeasurementSpec } from '../../pipeline-type-measurement/types';

const INPUT: MeasurementSpecInput = {
    EntityName: 'MJ: Actions',
    LabelColumn: 'Category',
    TextFields: ['Name', 'Description'],
    Values: ['System', 'Data'],
    Descriptions: { System: 'Core platform actions', Data: 'Data' },
    PromptIDs: { LLM: 'llm-prompt-id', Decision: 'decision-prompt-id' },
};

describe('BuildValueDescriptions', () => {
    it('uses each value\'s own description, matched case-insensitively', () => {
        expect(BuildValueDescriptions(['System', 'Data'], { system: ' Core platform actions ', DATA: 'Reads and writes data' })).toEqual({
            Descriptions: { System: 'Core platform actions', Data: 'Reads and writes data' },
            FallbackValues: [],
        });
    });

    it('falls back to the value, and lists it, when the source text is missing or blank', () => {
        expect(BuildValueDescriptions(['System', 'Data', 'Utilities'], { System: 'Core platform actions', Data: '   ', Utilities: null })).toEqual({
            Descriptions: { System: 'Core platform actions', Data: 'Data', Utilities: 'Utilities' },
            FallbackValues: ['Data', 'Utilities'],
        });
    });
});

describe('BuildMeasurementSpecs', () => {
    const specs = BuildMeasurementSpecs(INPUT);

    it('gives Decision its PipelineType and leaves LLM without one', () => {
        expect(specs.Decision.PipelineType).toBe('Decision');
        expect('PipelineType' in specs.LLM).toBe(false);
    });

    it('builds specs that differ only in PipelineType and the prompt each type runs', () => {
        const strip = (spec: MeasurementSpec): Omit<MeasurementSpec, 'PipelineType' | 'PromptID'> => {
            const { PipelineType: _type, PromptID: _prompt, ...rest } = spec;
            return rest;
        };
        expect(strip(specs.LLM)).toEqual(strip(specs.Decision));
        expect(specs.LLM.PromptID).toBe('llm-prompt-id');
        expect(specs.Decision.PromptID).toBe('decision-prompt-id');
    });

    it('has one enum output named for the label column, read at $.<Name>, targeting the label column', () => {
        expect(specs.LLM.Outputs).toEqual([{
            Name: 'Category',
            Ref: '$.Category',
            Description: 'The Category this MJ: Actions record belongs to.',
            Constraint: { Type: 'enum', Values: ['System', 'Data'], ValueDescriptions: { System: 'Core platform actions', Data: 'Data' }, OnViolation: 'fail' },
            Target: { Mode: 'field', EntityFieldName: 'Category' },
        }]);
    });

    it('does not cache, and gives the prompt only the text fields', () => {
        expect(specs.Decision.Caching).toEqual({ Cacheable: false });
        expect(specs.Decision.Context).toEqual({ Fields: ['Name', 'Description'] });
    });
});

describe('ResolveLabelColumn', () => {
    const fields: LabelFieldStub[] = [
        { Name: 'ID', RelatedEntity: null, RelatedEntityNameFieldMap: null },
        { Name: 'CategoryID', RelatedEntity: 'MJ: Action Categories', RelatedEntityNameFieldMap: 'Category' },
        { Name: 'Category', RelatedEntity: null, RelatedEntityNameFieldMap: null },
        { Name: 'Status', RelatedEntity: null, RelatedEntityNameFieldMap: null },
        { Name: 'ParentID', RelatedEntity: 'MJ: Actions', RelatedEntityNameFieldMap: null },
    ];
    const category = { LabelColumn: 'Category', KeyField: 'CategoryID', RelatedEntity: 'MJ: Action Categories' };

    it('resolves a foreign key\'s name column to itself, with the key behind it', () => {
        expect(ResolveLabelColumn(fields, 'category')).toEqual(category);
    });

    it('resolves a foreign key to its name column', () => {
        expect(ResolveLabelColumn(fields, 'CategoryID')).toEqual(category);
    });

    it('resolves any other field to itself', () => {
        expect(ResolveLabelColumn(fields, 'Status')).toEqual({ LabelColumn: 'Status', KeyField: null, RelatedEntity: null });
    });

    it('refuses an unknown field, and a foreign key with no name column', () => {
        expect(() => ResolveLabelColumn(fields, 'Nope')).toThrow(/not a field/);
        expect(() => ResolveLabelColumn(fields, 'ParentID')).toThrow(/no name column/);
    });

    it('refuses text fields that would show the prompt the label', () => {
        expect(() => AssertTextFieldsExcludeLabel(['Name', 'categoryid'], category)).toThrow(/categoryid/);
        expect(() => AssertTextFieldsExcludeLabel(['Name', 'Description'], category)).not.toThrow();
    });
});

describe('ReadPrediction', () => {
    it('reads the answer, its confidence and its prompt run', () => {
        const result: MeasuredRecordResult = { Status: 'Succeeded', ResultPayload: { Category: 'Data' }, Confidence: { Category: 0.82 }, AIPromptRunID: 'run-1' };
        expect(ReadPrediction(result, 'Category')).toEqual({ Succeeded: true, Predicted: 'Data', Confidence: 0.82, PromptRunID: 'run-1' });
    });

    it('has no answer for a failed record, but keeps its prompt run', () => {
        const result: MeasuredRecordResult = { Status: 'Failed', ErrorMessage: 'Constraint violation', AIPromptRunID: 'run-2' };
        expect(ReadPrediction(result, 'Category')).toEqual({ Succeeded: false, Predicted: null, Confidence: null, PromptRunID: 'run-2' });
    });

    it('has no answer when the payload is not an object or lacks the output, and no confidence when it is not a number', () => {
        expect(ReadPrediction({ Status: 'Succeeded', ResultPayload: 'Data' }, 'Category').Predicted).toBeNull();
        expect(ReadPrediction({ Status: 'Succeeded', ResultPayload: { Other: 'Data' } }, 'Category').Predicted).toBeNull();
        expect(ReadPrediction({ Status: 'Succeeded', ResultPayload: { Category: 'Data' }, Confidence: { Category: Number.NaN } }, 'Category').Confidence).toBeNull();
        expect(ReadPrediction(undefined, 'Category')).toEqual({ Succeeded: false, Predicted: null, Confidence: null, PromptRunID: null });
    });
});
