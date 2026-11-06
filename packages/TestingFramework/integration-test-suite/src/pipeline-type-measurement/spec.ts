/**
 * spec.ts — the two in-memory Feature Pipeline specs the measurement runs, and reading a record's answer
 * back out of what `InferProcessor` returns.
 *
 * The two specs are identical except for `PipelineType` (absent for LLM, `'Decision'` for Decision)
 * and, necessarily, the `PromptID` each type runs. Both have one enum output whose target is the label
 * column, because a Decision pipeline supports only field targets. Nothing writes that target: the rig
 * calls `InferProcessor.ProcessBatch` directly, and write-back lives in the `WriteBackProcessor`
 * wrapper, which the rig never builds.
 */
import type { MeasuredPipelineType, MeasuredRecordResult, MeasurementOutput, MeasurementSpec, RecordPrediction, ValueDescriptionSet } from './types';

/** How a label field resolves to the view column holding its display value. */
export interface LabelColumnResolution {
    /** The view column whose value is the label (for a foreign key, its name column). */
    LabelColumn: string;
    /** The foreign key behind the label column, when there is one. */
    KeyField: string | null;
    /** The entity the foreign key points at, whose rows describe the values. */
    RelatedEntity: string | null;
}

/** The field metadata {@link ResolveLabelColumn} reads, projected from `EntityFieldInfo`. */
export interface LabelFieldStub {
    Name: string;
    RelatedEntity: string | null;
    RelatedEntityNameFieldMap: string | null;
}

/** What {@link BuildMeasurementSpecs} needs. */
export interface MeasurementSpecInput {
    EntityName: string;
    LabelColumn: string;
    TextFields: readonly string[];
    Values: readonly string[];
    Descriptions: Record<string, string>;
    PromptIDs: Record<MeasuredPipelineType, string>;
}

/**
 * Resolves the label field to the column holding its display value. A foreign key (`CategoryID`)
 * resolves to its name column (`Category`); a name column resolves to itself, with the foreign key
 * behind it; any other field is its own label.
 * @throws Error when the field is unknown, or is a foreign key with no name column in the view.
 */
export function ResolveLabelColumn(fields: readonly LabelFieldStub[], labelField: string): LabelColumnResolution {
    const lower = labelField.trim().toLowerCase();
    const field = fields.find((f) => f.Name.toLowerCase() === lower);
    if (!field) {
        throw new Error(`Label field '${labelField}' is not a field of the entity.`);
    }
    if (field.RelatedEntity) {
        if (!field.RelatedEntityNameFieldMap) {
            throw new Error(`Label field '${field.Name}' is a foreign key with no name column in the view, so it has no display value to label with.`);
        }
        return { LabelColumn: field.RelatedEntityNameFieldMap, KeyField: field.Name, RelatedEntity: field.RelatedEntity };
    }
    const key = fields.find((f) => f.RelatedEntity && f.RelatedEntityNameFieldMap?.toLowerCase() === field.Name.toLowerCase());
    return key
        ? { LabelColumn: field.Name, KeyField: key.Name, RelatedEntity: key.RelatedEntity }
        : { LabelColumn: field.Name, KeyField: null, RelatedEntity: null };
}

/** Refuses text fields that would show the prompt the answer: the label column or the key behind it. */
export function AssertTextFieldsExcludeLabel(textFields: readonly string[], resolution: LabelColumnResolution): void {
    const forbidden = [resolution.LabelColumn, resolution.KeyField].filter((f): f is string => !!f).map((f) => f.toLowerCase());
    const leaking = textFields.filter((f) => forbidden.includes(f.toLowerCase()));
    if (leaking.length > 0) {
        throw new Error(`--text-fields must not include ${leaking.join(', ')}: the prompt would see the label.`);
    }
}

/**
 * One description per value, both pipeline types see the same ones. A value's own description is used
 * when the source has a non-empty one (matched case-insensitively); otherwise the value itself is, and
 * the value is listed in `FallbackValues` for the report, because Decision needs a description per value.
 */
export function BuildValueDescriptions(values: readonly string[], source: Readonly<Record<string, string | null | undefined>>): ValueDescriptionSet {
    const byLowerValue = new Map(Object.entries(source).map(([value, text]) => [value.toLowerCase(), text?.trim() ?? '']));
    const descriptions: Record<string, string> = {};
    const fallbackValues: string[] = [];
    for (const value of values) {
        const text = byLowerValue.get(value.toLowerCase());
        if (text) {
            descriptions[value] = text;
        } else {
            descriptions[value] = value;
            fallbackValues.push(value);
        }
    }
    return { Descriptions: descriptions, FallbackValues: fallbackValues };
}

/** The enum output both specs share: named for the label column, answered at `$.<Name>`, targeting the label column. */
export function BuildEnumOutput(input: MeasurementSpecInput): MeasurementOutput {
    return {
        Name: input.LabelColumn,
        Ref: `$.${input.LabelColumn}`,
        Description: `The ${input.LabelColumn} this ${input.EntityName} record belongs to.`,
        Constraint: { Type: 'enum', Values: [...input.Values], ValueDescriptions: { ...input.Descriptions }, OnViolation: 'fail' },
        Target: { Mode: 'field', EntityFieldName: input.LabelColumn },
    };
}

/** The LLM and Decision specs: no caching, the text fields as context, and one enum output. */
export function BuildMeasurementSpecs(input: MeasurementSpecInput): Record<MeasuredPipelineType, MeasurementSpec> {
    const build = (type: MeasuredPipelineType): MeasurementSpec => ({
        Name: `Pipeline type measurement: ${input.EntityName}.${input.LabelColumn}`,
        Description: `Measures a pipeline type on ${input.EntityName}.${input.LabelColumn}. In memory only; never saved.`,
        Context: { Fields: [...input.TextFields] },
        PromptID: input.PromptIDs[type],
        Outputs: [BuildEnumOutput(input)],
        Caching: { Cacheable: false },
        ...(type === 'Decision' ? { PipelineType: 'Decision' } : {}),
    });
    return { LLM: build('LLM'), Decision: build('Decision') };
}

/**
 * Reads one record's answer from `ProcessBatch`'s result: the output's value (at `$.<outputName>`),
 * its confidence when the driver gave one, and the prompt run. A missing or failed result has no answer.
 */
export function ReadPrediction(
    result: MeasuredRecordResult | undefined,
    outputName: string
): Pick<RecordPrediction, 'Succeeded' | 'Predicted' | 'Confidence' | 'PromptRunID'> {
    const succeeded = result?.Status === 'Succeeded';
    const payload = succeeded ? result?.ResultPayload : undefined;
    const value = isPlainRecord(payload) ? payload[outputName] : undefined;
    const confidence = result?.Confidence?.[outputName];
    return {
        Succeeded: succeeded,
        Predicted: typeof value === 'string' ? value : null,
        Confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? confidence : null,
        PromptRunID: result?.AIPromptRunID ?? null,
    };
}

/** Whether a value is a plain JSON object (not null, not an array). */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
