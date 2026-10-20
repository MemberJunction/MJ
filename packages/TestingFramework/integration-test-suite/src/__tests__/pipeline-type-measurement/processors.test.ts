/**
 * processors.test.ts — each arm's processor: the LLM arm's prompt data carries the same value
 * descriptions the Decision arm gets as its Choice options, the Decision arm's prompt data is the
 * plain processor's, and neither records history.
 *
 * The prompt-data tests run the real `InferProcessor.buildPromptData` (through a subclass that exposes
 * it), on the spec `BuildMeasurementSpecs` builds, with a plain record: no database, no model.
 */
import { describe, expect, it } from 'vitest';
import { InferProcessor } from '@memberjunction/record-set-processor';
import type { RecordRef } from '@memberjunction/record-set-processor-base';
import {
    AddValueDescriptions, CreateMeasurementProcessor, DescribeConstraintBlock, OutputValueDescriptions, VALUE_DESCRIPTIONS_KEY, ValueDescribingInferProcessor,
} from '../../pipeline-type-measurement/processors';
import { BuildMeasurementSpecs } from '../../pipeline-type-measurement/spec';
import { MEASURED_PIPELINE_TYPES } from '../../pipeline-type-measurement/types';
import type { MeasurementOutput } from '../../pipeline-type-measurement/types';

const SPECS = BuildMeasurementSpecs({
    EntityName: 'MJ: Actions',
    LabelColumn: 'Category',
    TextFields: ['Name', 'Description'],
    Values: ['System', 'Data'],
    Descriptions: { System: 'DESC-SYSTEM-XYZ', Data: 'DESC-DATA-XYZ' },
    PromptIDs: { LLM: 'llm-prompt-id', Decision: 'decision-prompt-id' },
});

const RECORD: RecordRef = { EntityID: 'entity-id', RecordID: 'r1', Record: { ID: 'r1', Name: 'Save a file', Description: 'Writes bytes to storage' } };

/** The LLM arm's processor, with its prompt data exposed. */
class DescribingProbe extends ValueDescribingInferProcessor {
    public PromptData(record: RecordRef): Promise<Record<string, unknown>> {
        return this.buildPromptData(record);
    }
}

/** A plain processor (the Decision arm's), with its prompt data exposed. */
class PlainProbe extends InferProcessor {
    public PromptData(record: RecordRef): Promise<Record<string, unknown>> {
        return this.buildPromptData(record);
    }
}

function textOf(data: Record<string, unknown>, key: string): string {
    const value = data[key];
    if (typeof value !== 'string') {
        throw new Error(`prompt data has no '${key}' text`);
    }
    return value;
}

describe('the LLM arm\'s prompt data', () => {
    it('lists each allowed value with its description in the constraint block', async () => {
        const data = await new DescribingProbe(SPECS.LLM.PromptID, undefined, SPECS.LLM).PromptData(RECORD);
        for (const key of ['constraints', 'ConstraintBlock']) {
            const block = textOf(data, key);
            expect(block).toContain('- **Category** ($.Category):');
            expect(block).toContain('* "System": DESC-SYSTEM-XYZ');
            expect(block).toContain('* "Data": DESC-DATA-XYZ');
        }
    });

    it('holds the descriptions by output and value, and leaves the record as it was', async () => {
        const data = await new DescribingProbe(SPECS.LLM.PromptID, undefined, SPECS.LLM).PromptData(RECORD);
        expect(data[VALUE_DESCRIPTIONS_KEY]).toEqual({ Category: { System: 'DESC-SYSTEM-XYZ', Data: 'DESC-DATA-XYZ' } });
        expect(data.record).toEqual({ ID: 'r1', Name: 'Save a file', Description: 'Writes bytes to storage' });
    });

    it('is the plain prompt data plus the descriptions', async () => {
        const plain = await new PlainProbe(SPECS.LLM.PromptID, undefined, SPECS.LLM).PromptData(RECORD);
        const described = await new DescribingProbe(SPECS.LLM.PromptID, undefined, SPECS.LLM).PromptData(RECORD);
        expect(described).toEqual(AddValueDescriptions(plain, SPECS.LLM.Outputs));
    });
});

describe('the Decision arm\'s prompt data', () => {
    it('is the plain processor\'s, whose constraint block has no descriptions (Decision gets them as Choice options)', async () => {
        const data = await new PlainProbe(SPECS.Decision.PromptID, undefined, SPECS.Decision).PromptData(RECORD);
        expect(JSON.stringify(data)).not.toMatch(/DESC-/);
        expect(textOf(data, 'constraints')).toContain('* "System"');
        expect(data[VALUE_DESCRIPTIONS_KEY]).toBeUndefined();
    });
});

describe('CreateMeasurementProcessor', () => {
    it('gives the LLM arm the describing processor and the Decision arm a plain one', () => {
        expect(CreateMeasurementProcessor('LLM', SPECS.LLM)).toBeInstanceOf(ValueDescribingInferProcessor);
        const decision = CreateMeasurementProcessor('Decision', SPECS.Decision);
        expect(decision).toBeInstanceOf(InferProcessor);
        expect(decision).not.toBeInstanceOf(ValueDescribingInferProcessor);
    });

    it('turns history off for both arms, and runs each arm\'s own prompt and spec', () => {
        for (const type of MEASURED_PIPELINE_TYPES) {
            const processor = CreateMeasurementProcessor(type, SPECS[type]);
            expect(processor.WritesHistory).toBe(false);
            expect(processor.PromptID).toBe(SPECS[type].PromptID);
            expect(processor.Spec).toBe(SPECS[type]);
        }
    });
});

describe('DescribeConstraintBlock', () => {
    const outputs: MeasurementOutput[] = [
        { Name: 'Tier', Ref: '$.Tier', Constraint: { Type: 'enum', Values: ['High', 'Low'], ValueDescriptions: { High: 'Tier high', Low: '  ' }, OnViolation: 'fail' }, Target: { Mode: 'field', EntityFieldName: 'Tier' } },
        { Name: 'Risk', Ref: '$.Risk', Constraint: { Type: 'enum', Values: ['High'], ValueDescriptions: { High: 'Risk high' }, OnViolation: 'fail' }, Target: { Mode: 'field', EntityFieldName: 'Risk' } },
        { Name: 'Score', Ref: '$.Score', Constraint: { Type: 'numeric', Min: 0, Max: 1, OnViolation: 'fail' }, Target: { Mode: 'field', EntityFieldName: 'Score' } },
    ];
    const block = ['- **Tier** ($.Tier):', '  * "High"', '  * "Low"', '- **Risk** ($.Risk):', '  * "High"', '- **Score** ($.Score):', '  Numeric value.'].join('\n');

    it('describes each value within its own output\'s section, and skips a blank description', () => {
        expect(DescribeConstraintBlock(block, outputs).split('\n')).toEqual([
            '- **Tier** ($.Tier):', '  * "High": Tier high', '  * "Low"', '- **Risk** ($.Risk):', '  * "High": Risk high', '- **Score** ($.Score):', '  Numeric value.',
        ]);
    });

    it('collects the descriptions of enum outputs only', () => {
        expect(OutputValueDescriptions(outputs)).toEqual({ Tier: { High: 'Tier high' }, Risk: { High: 'Risk high' } });
    });

    it('leaves prompt data alone when no output has descriptions', () => {
        const data = { record: { ID: 'r1' }, constraints: block };
        expect(AddValueDescriptions(data, [outputs[2]])).toBe(data);
    });
});
