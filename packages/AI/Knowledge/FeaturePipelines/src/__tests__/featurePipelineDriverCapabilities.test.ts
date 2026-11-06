import { describe, it, expect, vi } from 'vitest';
import {
  LLM_FEATURE_PIPELINE_CAPABILITIES,
  DECISION_FEATURE_PIPELINE_CAPABILITIES,
  BuildEntityFieldValueLookup,
  GetFeaturePipelineCapabilities,
  GetOutputCapabilityIssues,
  ResolveEnumChoices,
  ValidateOutputsAgainstCapabilities,
  type FeaturePipelineFieldValueLookup,
} from '../spec/feature-pipeline-driver-capabilities.js';
import type { DataFeatureOutput, DataFeatureSpec } from '../spec/data-feature-spec.js';

describe('LLM_FEATURE_PIPELINE_CAPABILITIES', () => {
  it('names every constraint type', () => {
    expect([...LLM_FEATURE_PIPELINE_CAPABILITIES.ConstraintTypes].sort()).toEqual(
      ['boolean', 'date', 'enum', 'freetext', 'lookup', 'money', 'numeric']
    );
  });

  it('names every target mode', () => {
    expect([...LLM_FEATURE_PIPELINE_CAPABILITIES.TargetModes].sort()).toEqual(['child', 'field', 'tags']);
  });

  it('produces reasoning but not confidence, with no output limit', () => {
    expect(LLM_FEATURE_PIPELINE_CAPABILITIES.ProducesReasoning).toBe(true);
    expect(LLM_FEATURE_PIPELINE_CAPABILITIES.ProducesConfidence).toBe(false);
    expect(LLM_FEATURE_PIPELINE_CAPABILITIES.MaxOutputs).toBeUndefined();
  });

  it('is frozen, so no caller can change the shared constant', () => {
    expect(Object.isFrozen(LLM_FEATURE_PIPELINE_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(LLM_FEATURE_PIPELINE_CAPABILITIES.ConstraintTypes)).toBe(true);
    expect(Object.isFrozen(LLM_FEATURE_PIPELINE_CAPABILITIES.TargetModes)).toBe(true);
  });
});

describe('DECISION_FEATURE_PIPELINE_CAPABILITIES', () => {
  it('names boolean, enum, and numeric constraint types', () => {
    expect([...DECISION_FEATURE_PIPELINE_CAPABILITIES.ConstraintTypes].sort()).toEqual(
      ['boolean', 'enum', 'numeric']
    );
  });

  it('names field target mode only', () => {
    expect([...DECISION_FEATURE_PIPELINE_CAPABILITIES.TargetModes]).toEqual(['field']);
  });

  it('produces confidence but not reasoning, with no output limit', () => {
    expect(DECISION_FEATURE_PIPELINE_CAPABILITIES.ProducesReasoning).toBe(false);
    expect(DECISION_FEATURE_PIPELINE_CAPABILITIES.ProducesConfidence).toBe(true);
    expect(DECISION_FEATURE_PIPELINE_CAPABILITIES.MaxOutputs).toBeUndefined();
  });

  it('declares constraint and enum/numeric requirements', () => {
    expect(DECISION_FEATURE_PIPELINE_CAPABILITIES.RequiresConstraint).toBe(true);
    expect(DECISION_FEATURE_PIPELINE_CAPABILITIES.RequiresNumericLevels).toBe(true);
    expect(DECISION_FEATURE_PIPELINE_CAPABILITIES.RequiresEnumValues).toBe(true);
    expect(DECISION_FEATURE_PIPELINE_CAPABILITIES.RequiresEnumValueDescriptions).toBe(true);
    expect(DECISION_FEATURE_PIPELINE_CAPABILITIES.MaxEnumValues).toBe(255);
  });

  it('is frozen, so no caller can change the shared constant', () => {
    expect(Object.isFrozen(DECISION_FEATURE_PIPELINE_CAPABILITIES)).toBe(true);
    expect(Object.isFrozen(DECISION_FEATURE_PIPELINE_CAPABILITIES.ConstraintTypes)).toBe(true);
    expect(Object.isFrozen(DECISION_FEATURE_PIPELINE_CAPABILITIES.TargetModes)).toBe(true);
  });
});

describe('GetFeaturePipelineCapabilities', () => {
  it('returns DECISION capabilities for Decision (case-insensitive, trimmed)', () => {
    expect(GetFeaturePipelineCapabilities('Decision')).toBe(DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(GetFeaturePipelineCapabilities('decision')).toBe(DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(GetFeaturePipelineCapabilities('  DECISION  ')).toBe(DECISION_FEATURE_PIPELINE_CAPABILITIES);
  });

  it('returns LLM capabilities for LLM, empty string, undefined, null, or unknown names', () => {
    expect(GetFeaturePipelineCapabilities('LLM')).toBe(LLM_FEATURE_PIPELINE_CAPABILITIES);
    expect(GetFeaturePipelineCapabilities('llm')).toBe(LLM_FEATURE_PIPELINE_CAPABILITIES);
    expect(GetFeaturePipelineCapabilities('')).toBe(LLM_FEATURE_PIPELINE_CAPABILITIES);
    expect(GetFeaturePipelineCapabilities(undefined)).toBe(LLM_FEATURE_PIPELINE_CAPABILITIES);
    expect(GetFeaturePipelineCapabilities(null)).toBe(LLM_FEATURE_PIPELINE_CAPABILITIES);
    expect(GetFeaturePipelineCapabilities('SomeCustomType')).toBe(LLM_FEATURE_PIPELINE_CAPABILITIES);
  });
});

describe('GetOutputCapabilityIssues and ValidateOutputsAgainstCapabilities', () => {
  const validDecisionOutput: DataFeatureOutput = {
    Name: 'RiskScore',
    Ref: 'score',
    Target: { Mode: 'field', EntityFieldName: 'Risk' },
    Constraint: { Type: 'numeric', Levels: ['Low', 'High'], OnViolation: 'fail' },
  };

  const childTargetOutput: DataFeatureOutput = {
    Name: 'Tags',
    Ref: 'tags',
    Target: { Mode: 'child', EntityName: 'Tags', ParentField: 'ID', Map: {} },
    Constraint: { Type: 'enum', Values: ['A', 'B'], ValueDescriptions: { A: 'Alpha', B: 'Beta' }, OnViolation: 'fail' },
  };

  const freetextOutput: DataFeatureOutput = {
    Name: 'Notes',
    Ref: 'notes',
    Target: { Mode: 'field', EntityFieldName: 'Notes' },
    Constraint: { Type: 'freetext', MaxLength: 100 },
  };

  const unconstrainedOutput: DataFeatureOutput = {
    Name: 'RawData',
    Ref: 'raw',
    Target: { Mode: 'field', EntityFieldName: 'Raw' },
  };

  it('returns empty array when output conforms to capabilities', () => {
    expect(GetOutputCapabilityIssues(validDecisionOutput, DECISION_FEATURE_PIPELINE_CAPABILITIES)).toEqual([]);
    expect(GetOutputCapabilityIssues(unconstrainedOutput, DECISION_FEATURE_PIPELINE_CAPABILITIES)).toEqual([]);
  });

  it('flags unsupported target mode and constraint type', () => {
    const issuesChild = GetOutputCapabilityIssues(childTargetOutput, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(issuesChild).toContain("has target mode 'child', which this pipeline type does not support");

    const issuesFreetext = GetOutputCapabilityIssues(freetextOutput, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(issuesFreetext).toContain("has constraint type 'freetext', which this pipeline type cannot produce");
  });

  it('rejects specs with CaptureReasoning: true for Decision', () => {
    const spec: DataFeatureSpec = {
      CaptureReasoning: true,
      Outputs: [validDecisionOutput],
    };
    const errors = ValidateOutputsAgainstCapabilities(spec, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(errors).toContain('This pipeline type does not produce reasoning; turn off CaptureReasoning or use an LLM pipeline.');
  });

  it('rejects unconstrained outputs when RequiresConstraint is true', () => {
    const spec: DataFeatureSpec = {
      Outputs: [unconstrainedOutput],
    };
    const errors = ValidateOutputsAgainstCapabilities(spec, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(errors).toContain("Output 'RawData' has no constraint; this pipeline type requires one of: boolean, enum, numeric.");
  });

  it('validates numeric outputs have between 2 and 10 levels when RequiresNumericLevels is true', () => {
    const specNoLevels: DataFeatureSpec = {
      Outputs: [
        {
          Name: 'ScoreOut',
          Target: { Mode: 'field', EntityFieldName: 'Score' },
          Constraint: { Type: 'numeric', Min: 0, Max: 100 },
        },
      ],
    };
    const errorsNoLevels = ValidateOutputsAgainstCapabilities(specNoLevels, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(errorsNoLevels).toContain("Numeric output 'ScoreOut' requires between 2 and 10 Level descriptions.");

    const specTooManyLevels: DataFeatureSpec = {
      Outputs: [
        {
          Name: 'ScoreOut',
          Target: { Mode: 'field', EntityFieldName: 'Score' },
          Constraint: {
            Type: 'numeric',
            Levels: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11'],
          },
        },
      ],
    };
    const errorsTooMany = ValidateOutputsAgainstCapabilities(specTooManyLevels, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(errorsTooMany).toContain("Numeric output 'ScoreOut' requires between 2 and 10 Level descriptions.");
  });

  it('validates enum outputs have <= 255 values, not empty, and all have descriptions', () => {
    const specEmpty: DataFeatureSpec = {
      Outputs: [
        {
          Name: 'StatusOut',
          Target: { Mode: 'field', EntityFieldName: 'Status' },
          Constraint: { Type: 'enum', Values: [] },
        },
      ],
    };
    const errorsEmpty = ValidateOutputsAgainstCapabilities(specEmpty, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(errorsEmpty).toContain(
      "Enum output 'StatusOut' has no values defined; list them in Values, or set FromFieldMetadata on a field that has a value list."
    );

    const specMissingDesc: DataFeatureSpec = {
      Outputs: [
        {
          Name: 'StatusOut',
          Target: { Mode: 'field', EntityFieldName: 'Status' },
          Constraint: {
            Type: 'enum',
            Values: ['Active', 'Pending', 'Inactive'],
            ValueDescriptions: { Active: 'Currently active customer' },
          },
        },
      ],
    };
    const errorsMissing = ValidateOutputsAgainstCapabilities(specMissingDesc, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(errorsMissing).toContain(
      "Enum output 'StatusOut' values missing descriptions: Pending, Inactive. This pipeline type requires a description for every value."
    );

    const specTooManyValues: DataFeatureSpec = {
      Outputs: [
        {
          Name: 'HugeEnum',
          Target: { Mode: 'field', EntityFieldName: 'Huge' },
          Constraint: {
            Type: 'enum',
            Values: Array.from({ length: 256 }, (_, i) => `val_${i}`),
            ValueDescriptions: Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`val_${i}`, `desc_${i}`])),
          },
        },
      ],
    };
    const errorsTooMany = ValidateOutputsAgainstCapabilities(specTooManyValues, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(errorsTooMany).toContain("Enum output 'HugeEnum' has 256 values; this pipeline type supports at most 255.");
  });

  it('populates missing enum values and descriptions from fieldValues lookup for field targets', () => {
    const spec: DataFeatureSpec = {
      Outputs: [
        {
          Name: 'StatusOut',
          Target: { Mode: 'field', EntityFieldName: 'Status' },
          Constraint: { Type: 'enum' },
        },
      ],
    };

    const mockLookup = (fieldName: string) => {
      if (fieldName.toLowerCase() === 'status') {
        return [
          { Value: 'Active', Description: 'Active customer' },
          { Value: 'Inactive', Description: 'Inactive customer' },
        ];
      }
      return undefined;
    };

    const errors = ValidateOutputsAgainstCapabilities(spec, DECISION_FEATURE_PIPELINE_CAPABILITIES, mockLookup);
    expect(errors).toEqual([]);
  });

  it('passes a fully valid Decision pipeline spec', () => {
    const spec: DataFeatureSpec = {
      Outputs: [
        validDecisionOutput,
        {
          Name: 'IsHighValue',
          Target: { Mode: 'field', EntityFieldName: 'IsHighValue' },
          Constraint: { Type: 'boolean' },
        },
        {
          Name: 'Tier',
          Target: { Mode: 'field', EntityFieldName: 'Tier' },
          Constraint: {
            Type: 'enum',
            Values: ['Bronze', 'Silver'],
            ValueDescriptions: { Bronze: 'Bronze level', Silver: 'Silver level' },
          },
        },
      ],
    };
    const errors = ValidateOutputsAgainstCapabilities(spec, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(errors).toEqual([]);
  });

  it('validates entire spec outputs against LLM capabilities with no restrictions', () => {
    const spec: DataFeatureSpec = {
      Name: 'TestSpec',
      TargetEntity: 'Accounts',
      Outputs: [validDecisionOutput, childTargetOutput, freetextOutput, unconstrainedOutput],
    };

    const llmMessages = ValidateOutputsAgainstCapabilities(spec, LLM_FEATURE_PIPELINE_CAPABILITIES);
    expect(llmMessages).toEqual([]);
  });
});



// ---------------------------------------------------------------------------------------------------
// Enum choices: field metadata is read only where the spec asks for it (FromFieldMetadata) or lists
// no values, as ResolveConstraint reads it
// ---------------------------------------------------------------------------------------------------

/** A complete spec around the given outputs. */
function specWith(outputs: DataFeatureOutput[], extra: Partial<DataFeatureSpec> = {}): DataFeatureSpec {
  return {
    Name: 'Spec',
    Description: 'A test spec',
    PromptID: 'PROMPT-1',
    Context: { Fields: ['Title'] },
    Caching: { Cacheable: false },
    Outputs: outputs,
    ...extra,
  };
}

/** A lookup that knows one field, 'Seniority', with described values. */
const SENIORITY_VALUES = [
  { Value: 'Executive', Description: 'Runs a function' },
  { Value: 'Manager', Description: 'Leads a team' },
  { Value: 'Staff', Description: 'Individual contributor' },
];
const seniorityLookup: FeaturePipelineFieldValueLookup = (fieldName) =>
  fieldName.toLowerCase() === 'seniority' ? SENIORITY_VALUES : undefined;

function seniorityOutput(constraint: DataFeatureOutput['Constraint'], target: DataFeatureOutput['Target'] = { Mode: 'field', EntityFieldName: 'Seniority' }): DataFeatureOutput {
  return { Name: 'Seniority', Ref: '$.seniority', Target: target, Constraint: constraint };
}

describe('ResolveEnumChoices', () => {
  it('replaces the spec Values with the field list when FromFieldMetadata is set, keeping the spec descriptions', () => {
    const output = seniorityOutput({
      Type: 'enum',
      Values: ['Old'],
      FromFieldMetadata: true,
      ValueDescriptions: { Manager: 'Spec wording wins' },
      OnViolation: 'fail',
    });
    expect(ResolveEnumChoices(output, seniorityLookup)).toEqual({
      Values: ['Executive', 'Manager', 'Staff'],
      Descriptions: { Executive: 'Runs a function', Manager: 'Spec wording wins', Staff: 'Individual contributor' },
    });
  });

  it('fills the values from the field when the spec lists none', () => {
    const output = seniorityOutput({ Type: 'enum', OnViolation: 'fail' });
    expect(ResolveEnumChoices(output, seniorityLookup)?.Values).toEqual(['Executive', 'Manager', 'Staff']);
  });

  it('does not read the field when the spec lists Values without FromFieldMetadata', () => {
    const lookup = vi.fn(seniorityLookup);
    const output = seniorityOutput({ Type: 'enum', Values: ['Executive', 'Staff'], OnViolation: 'fail' });
    expect(ResolveEnumChoices(output, lookup)).toEqual({ Values: ['Executive', 'Staff'], Descriptions: {} });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('keeps the spec Values when FromFieldMetadata is set but the field has no list', () => {
    const output = seniorityOutput(
      { Type: 'enum', Values: ['A'], FromFieldMetadata: true, OnViolation: 'fail' },
      { Mode: 'field', EntityFieldName: 'Title' }
    );
    expect(ResolveEnumChoices(output, seniorityLookup)?.Values).toEqual(['A']);
  });

  it('reads no field for a child target, and returns undefined for a constraint that is not enum', () => {
    const child = seniorityOutput(
      { Type: 'enum', FromFieldMetadata: true, OnViolation: 'fail' },
      { Mode: 'child', EntityName: 'Kinds', ParentField: 'ParentID', Map: { Kind: '$.kind' } }
    );
    expect(ResolveEnumChoices(child, seniorityLookup)).toEqual({ Values: [], Descriptions: {} });
    expect(ResolveEnumChoices(seniorityOutput({ Type: 'boolean', OnViolation: 'fail' }), seniorityLookup)).toBeUndefined();
  });
});

describe('ValidateOutputsAgainstCapabilities: enum values', () => {
  it('accepts an LLM child-target enum with FromFieldMetadata, as ValidateSpec does', () => {
    const spec = specWith([
      seniorityOutput(
        { Type: 'enum', FromFieldMetadata: true, OnViolation: 'fail' },
        { Mode: 'child', EntityName: 'Kinds', ParentField: 'ParentID', Map: { Kind: '$.kind' } }
      ),
    ]);
    expect(ValidateOutputsAgainstCapabilities(spec, LLM_FEATURE_PIPELINE_CAPABILITIES)).toEqual([]);
  });

  it('accepts an LLM field-target enum with FromFieldMetadata when the entity is unknown', () => {
    const spec = specWith([seniorityOutput({ Type: 'enum', FromFieldMetadata: true, OnViolation: 'fail' })]);
    expect(ValidateOutputsAgainstCapabilities(spec, LLM_FEATURE_PIPELINE_CAPABILITIES, undefined)).toEqual([]);
  });

  it('resolves a Decision enum with FromFieldMetadata from the field, and fails it when the field has no list', () => {
    const spec = specWith([seniorityOutput({ Type: 'enum', FromFieldMetadata: true, OnViolation: 'fail' })]);
    expect(ValidateOutputsAgainstCapabilities(spec, DECISION_FEATURE_PIPELINE_CAPABILITIES, seniorityLookup)).toEqual([]);
    expect(ValidateOutputsAgainstCapabilities(spec, DECISION_FEATURE_PIPELINE_CAPABILITIES, () => undefined)).toEqual([
      "Enum output 'Seniority' has no values defined; list them in Values, or set FromFieldMetadata on a field that has a value list.",
    ]);
  });

  it('does not take a Decision enum\'s descriptions from the field when the spec lists its own Values', () => {
    const spec = specWith([seniorityOutput({ Type: 'enum', Values: ['Executive', 'Staff'], OnViolation: 'fail' })]);
    expect(ValidateOutputsAgainstCapabilities(spec, DECISION_FEATURE_PIPELINE_CAPABILITIES, seniorityLookup)).toEqual([
      "Enum output 'Seniority' values missing descriptions: Executive, Staff. This pipeline type requires a description for every value.",
    ]);
  });
});

describe('BuildEntityFieldValueLookup', () => {
  const pipelineEntity = {
    Fields: [
      { Name: 'Seniority', EntityFieldValues: SENIORITY_VALUES },
      { Name: 'Title', EntityFieldValues: [] },
    ],
  };

  it('returns the named field\'s value list from this entity only, matching the name case-insensitively', () => {
    const lookup = BuildEntityFieldValueLookup(pipelineEntity);
    expect(lookup?.('seniority')).toBe(SENIORITY_VALUES);
    expect(lookup?.(' SENIORITY ')).toBe(SENIORITY_VALUES);
    expect(lookup?.('Status')).toBeUndefined();
  });

  it('returns undefined when the entity or its fields are unknown', () => {
    expect(BuildEntityFieldValueLookup(undefined)).toBeUndefined();
    expect(BuildEntityFieldValueLookup(null)).toBeUndefined();
    expect(BuildEntityFieldValueLookup({})).toBeUndefined();
  });
});
