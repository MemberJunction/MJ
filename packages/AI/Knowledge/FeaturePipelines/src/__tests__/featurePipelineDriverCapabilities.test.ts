import { describe, it, expect } from 'vitest';
import {
  LLM_FEATURE_PIPELINE_CAPABILITIES,
  DECISION_FEATURE_PIPELINE_CAPABILITIES,
  GetFeaturePipelineCapabilities,
  GetOutputCapabilityIssues,
  ValidateOutputsAgainstCapabilities,
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
    expect(errors).toContain('Decision pipelines do not produce reasoning; remove CaptureReasoning or use an LLM pipeline.');
  });

  it('rejects unconstrained outputs when RequiresConstraint is true', () => {
    const spec: DataFeatureSpec = {
      Outputs: [unconstrainedOutput],
    };
    const errors = ValidateOutputsAgainstCapabilities(spec, DECISION_FEATURE_PIPELINE_CAPABILITIES);
    expect(errors).toContain("Output 'RawData' has no constraint; Decision pipelines require boolean, enum, or leveled numeric constraints.");
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
    expect(errorsEmpty).toContain("Enum output 'StatusOut' has no values defined.");

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
    expect(errorsMissing).toContain("Enum output 'StatusOut' values missing descriptions: Pending, Inactive. Decision models require a description for every choice option.");

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
    expect(errorsTooMany).toContain("Enum output 'HugeEnum' has 256 values; maximum supported for Decision is 255.");
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

  it('proves that a same-named field on another entity is not used by the scoped lookup', () => {
    const spec: DataFeatureSpec = {
      Outputs: [
        {
          Name: 'StatusOut',
          Target: { Mode: 'field', EntityFieldName: 'Status' },
          Constraint: { Type: 'enum' },
        },
      ],
    };

    // Pipeline entity is "Orders" which has no Status field, but another entity "Customers" has Status
    const pipelineEntityFields = new Map<string, Array<{ Value: string; Description?: string }>>([
      ['priority', [{ Value: 'High', Description: 'Urgent' }]],
    ]);
    const otherEntityFields = new Map<string, Array<{ Value: string; Description?: string }>>([
      ['status', [{ Value: 'Active', Description: 'Active' }]],
    ]);

    // Scoped lookup only consults the pipeline's entity fields
    const scopedLookup = (fieldName: string) => pipelineEntityFields.get(fieldName.toLowerCase());

    const errors = ValidateOutputsAgainstCapabilities(spec, DECISION_FEATURE_PIPELINE_CAPABILITIES, scopedLookup);
    expect(errors).toContain("Enum output 'StatusOut' has no values defined.");
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


