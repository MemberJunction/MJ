import { describe, it, expect } from 'vitest';
import {
  DataFeatureSpec,
  validateSpec,
  resolveConstraint,
  renderConstraintBlock,
  EntityMetadataStub,
} from '../spec/data-feature-spec.js';
import { validateOutputValue } from '../validation/constraint-validator.js';

const sampleEntity: EntityMetadataStub = {
  Name: 'Contacts',
  Fields: [
    { Name: 'ID', TSType: 'string', IsVirtual: false },
    { Name: 'CurrentJobTitle', TSType: 'string', IsVirtual: true }, // virtual column
    {
      Name: 'SeniorityLevel',
      TSType: 'string',
      IsVirtual: false,
      EntityFieldValues: [
        { Value: 'IC' },
        { Value: 'Manager' },
        { Value: 'Director' },
        { Value: 'VP' },
        { Value: 'C-Level' },
      ],
    },
    { Name: 'SentimentScore', TSType: 'number', IsVirtual: false },
    { Name: 'IsVIP', TSType: 'boolean', IsVirtual: false },
    { Name: 'CompanyID', TSType: 'string', IsVirtual: false, RelatedEntity: 'Companies', RelatedEntityID: 'comp-uuid' },
  ],
};

describe('DataFeatureSpec — pure validator (P1-1)', () => {
  it('rejects a spec with empty outputs', () => {
    const spec: DataFeatureSpec = {
      Name: 'Empty Pipeline',
      Description: 'Has no outputs',
      Context: { Fields: ['CurrentJobTitle'] },
      PromptID: 'prompt-1',
      Outputs: [],
      Caching: { Cacheable: true },
    };
    const issues = validateSpec(spec, sampleEntity);
    expect(issues.some(i => i.Path === 'Outputs' && i.Severity === 'error')).toBe(true);
  });

  it('rejects an unknown target field', () => {
    const spec: DataFeatureSpec = {
      Name: 'Bad Field Pipeline',
      Description: 'Targets nonexistent column',
      Context: { Fields: ['CurrentJobTitle'] },
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.score',
          Name: 'Score',
          Target: { Mode: 'field', EntityFieldName: 'NonExistentColumn' },
        },
      ],
      Caching: { Cacheable: false },
    };
    const issues = validateSpec(spec, sampleEntity);
    const issue = issues.find(i => i.Field === 'NonExistentColumn');
    expect(issue).toBeDefined();
    expect(issue?.Message).toContain("Target field 'NonExistentColumn' does not exist");
    expect(issue?.FixRecommendation).toContain('Target an existing column');
  });

  it('rejects writing to a virtual / view column (C8 / D17)', () => {
    const spec: DataFeatureSpec = {
      Name: 'Write to View Column',
      Description: 'Attempts to write to CurrentJobTitle which is virtual',
      Context: { Fields: ['CurrentJobTitle'] },
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.title',
          Name: 'NormalizedTitle',
          Target: { Mode: 'field', EntityFieldName: 'CurrentJobTitle' },
        },
      ],
      Caching: { Cacheable: true },
    };
    const issues = validateSpec(spec, sampleEntity);
    const issue = issues.find(i => i.Field === 'CurrentJobTitle');
    expect(issue).toBeDefined();
    expect(issue?.Message).toContain('virtual/view column and cannot be written to');
    expect(issue?.FixRecommendation).toContain('Target a base-table column');
  });

  it('rejects type mismatch between constraint and column', () => {
    const spec: DataFeatureSpec = {
      Name: 'Type Mismatch',
      Description: 'Numeric constraint on string column',
      Context: { Fields: ['ID'] },
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.val',
          Name: 'Val',
          Constraint: { Type: 'numeric', Min: 0, Max: 100, OnViolation: 'fail' },
          Target: { Mode: 'field', EntityFieldName: 'SeniorityLevel' }, // string column
        },
      ],
      Caching: { Cacheable: false },
    };
    const issues = validateSpec(spec, sampleEntity);
    const issue = issues.find(i => i.Field === 'SeniorityLevel');
    expect(issue).toBeDefined();
    expect(issue?.Message).toContain("Numeric constraint applied to non-numeric column 'SeniorityLevel'");
  });

  it('rejects a tag target without RootTagID', () => {
    const spec: DataFeatureSpec = {
      Name: 'Missing Tag Root',
      Description: 'Tag output without root',
      Context: { Fields: ['ID'] },
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.tags',
          Name: 'Topics',
          Target: { Mode: 'tags', RootTagID: '' },
        },
      ],
      Caching: { Cacheable: false },
    };
    const issues = validateSpec(spec, sampleEntity);
    const issue = issues.find(i => i.Path.includes('RootTagID'));
    expect(issue).toBeDefined();
    expect(issue?.Message).toContain('requires a RootTagID');
  });

  it('rejects KeyFields naming a field that does not exist', () => {
    const spec: DataFeatureSpec = {
      Name: 'Bad Key Fields',
      Description: 'Caching key field does not exist',
      Context: { Fields: ['ID'] },
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.score',
          Name: 'Score',
          Target: { Mode: 'field', EntityFieldName: 'SentimentScore' },
        },
      ],
      Caching: { Cacheable: true, KeyFields: ['ID', 'GhostColumn'] },
    };
    const issues = validateSpec(spec, sampleEntity);
    const issue = issues.find(i => i.Field === 'GhostColumn');
    expect(issue).toBeDefined();
    expect(issue?.Message).toContain("Caching KeyField 'GhostColumn' does not exist");
  });

  it('validates a correct spec with multiple targets without errors', () => {
    const spec: DataFeatureSpec = {
      Name: 'Job Title Normalizer',
      Description: 'Derives seniority and job functions',
      Context: { Fields: ['CurrentJobTitle'] },
      PromptID: 'prompt-uuid-1',
      Outputs: [
        {
          Ref: '$.seniority',
          Name: 'SeniorityLevel',
          Constraint: { Type: 'enum', FromFieldMetadata: true, OnViolation: 'coerce-to-other' },
          Target: { Mode: 'field', EntityFieldName: 'SeniorityLevel' },
          FeatureKind: 'categorical',
        },
        {
          Ref: '$.functions',
          Name: 'JobFunctions',
          Target: {
            Mode: 'child',
            EntityName: 'PersonJobFunctions',
            ParentField: 'PersonID',
            Map: { JobFunctionID: '$.id', Sequence: '$.seq' },
            FanOutRef: '$.functions',
          },
        },
        {
          Ref: '$.tags',
          Name: 'TopicTags',
          Target: {
            Mode: 'tags',
            RootTagID: 'root-tag-uuid',
            Growth: 'constrained',
            MaxDepth: 2,
          },
        },
      ],
      Caching: { Cacheable: true, KeyFields: ['CurrentJobTitle'], Scope: 'pipeline' },
      CaptureReasoning: true,
    };
    const issues = validateSpec(spec, sampleEntity);
    expect(issues.filter(i => i.Severity === 'error')).toHaveLength(0);
  });
});

describe('resolveConstraint & renderConstraintBlock (P1-1)', () => {
  const sampleField = {
    Name: 'SeniorityLevel',
    TSType: 'string',
    EntityFieldValues: [
      { Value: 'IC' },
      { Value: 'Manager' },
      { Value: 'Director' },
      { Value: 'VP' },
      { Value: 'C-Level' },
    ],
  };

  it('materializes FromFieldMetadata into a concrete allowed set', () => {
    const resolved = resolveConstraint(
      {
        Ref: '$.seniority',
        Name: 'SeniorityLevel',
        Constraint: { Type: 'enum', FromFieldMetadata: true, OnViolation: 'coerce-to-other' },
        Target: { Mode: 'field', EntityFieldName: 'SeniorityLevel' },
      },
      sampleField
    );

    expect(resolved).not.toBeNull();
    expect(resolved?.Type).toBe('enum');
    expect(resolved?.AllowedValues).toEqual(['IC', 'Manager', 'Director', 'VP', 'C-Level']);
    expect(resolved?.OnViolation).toBe('coerce-to-other');
  });

  it('renders allowed values into the prompt constraint block automatically', () => {
    const outputs = [
      {
        Ref: '$.seniority',
        Name: 'SeniorityLevel',
        Constraint: { Type: 'enum', Values: ['IC', 'Manager', 'Director', 'VP', 'C-Level'], OnViolation: 'fail' as const },
        Target: { Mode: 'field' as const, EntityFieldName: 'SeniorityLevel' },
      },
      {
        Ref: '$.sentiment',
        Name: 'Sentiment',
        Constraint: { Type: 'numeric' as const, Min: -1, Max: 1, OnViolation: 'fail' as const },
        Target: { Mode: 'field' as const, EntityFieldName: 'SentimentScore' },
      },
    ];

    const block = renderConstraintBlock(outputs);
    expect(block).toContain('OUTPUT CONSTRAINTS & FORMATTING INSTRUCTIONS');
    expect(block).toContain('SeniorityLevel');
    expect(block).toContain('* "IC"');
    expect(block).toContain('* "Director"');
    expect(block).toContain('Sentiment');
    expect(block).toContain('between -1 and 1');
  });
});

describe('validateOutputValue — runtime enforcement (P1-2)', () => {
  it('handles enum match case-insensitively and returns canonical casing', () => {
    const constraint = {
      Type: 'enum' as const,
      Values: ['IC', 'Manager', 'Director', 'VP', 'C-Level'],
      OnViolation: 'fail' as const,
    };
    const res = validateOutputValue('director', constraint);
    expect(res.valid).toBe(true);
    expect(res.value).toBe('Director');
    expect(res.coerced).toBe(true);
  });

  it('handles enum out-of-vocabulary in all 3 OnViolation modes', () => {
    const allowed = ['IC', 'Manager', 'Director'];

    // 1. fail
    const failRes = validateOutputValue('Astronaut', { Type: 'enum', Values: allowed, OnViolation: 'fail' });
    expect(failRes.valid).toBe(false);
    expect(failRes.violationPolicyApplied).toBe('fail');
    expect(failRes.violationMessage).toContain("Value 'Astronaut' is not in the allowed vocabulary");

    // 2. null
    const nullRes = validateOutputValue('Astronaut', { Type: 'enum', Values: allowed, OnViolation: 'null' });
    expect(nullRes.valid).toBe(true);
    expect(nullRes.value).toBeNull();
    expect(nullRes.coerced).toBe(true);
    expect(nullRes.violationPolicyApplied).toBe('null');

    // 3. coerce-to-other
    const otherRes = validateOutputValue('Astronaut', { Type: 'enum', Values: allowed, OnViolation: 'coerce-to-other' });
    expect(otherRes.valid).toBe(true);
    expect(otherRes.value).toBe('Other');
    expect(otherRes.coerced).toBe(true);
    expect(otherRes.violationPolicyApplied).toBe('coerce-to-other');
  });

  it('rejects a numeric string wrapped in quotes unless target column TSType says numeric', () => {
    const numConstraint = { Type: 'numeric' as const, Min: 0, Max: 100, OnViolation: 'fail' as const };

    // Strict reject when column is not typed numeric
    const strictRes = validateOutputValue('42', numConstraint, { targetFieldTSType: 'string' });
    expect(strictRes.valid).toBe(false);
    expect(strictRes.violationMessage).toContain('rejected quoted string value');

    // Coerces when column is typed numeric
    const coerceRes = validateOutputValue('42', numConstraint, { targetFieldTSType: 'number' });
    expect(coerceRes.valid).toBe(true);
    expect(coerceRes.value).toBe(42);
    expect(coerceRes.coerced).toBe(true);
  });

  it('enforces numeric bounds and integer constraint', () => {
    const intConstraint = { Type: 'numeric' as const, Min: 1, Max: 10, Integer: true, OnViolation: 'fail' as const };

    expect(validateOutputValue(1, intConstraint).valid).toBe(true);
    expect(validateOutputValue(5, intConstraint).valid).toBe(true);
    expect(validateOutputValue(10, intConstraint).valid).toBe(true);
    expect(validateOutputValue(5.5, intConstraint).valid).toBe(false);
    expect(validateOutputValue(0, intConstraint).valid).toBe(false);
    expect(validateOutputValue(11, intConstraint).valid).toBe(false);
  });

  it('handles enum constraint with empty allowed values gracefully', () => {
    const emptyEnum = { Type: 'enum' as const, Values: [], OnViolation: 'fail' as const };
    const res = validateOutputValue('IC', emptyEnum);
    expect(res.valid).toBe(false);
    expect(res.violationMessage).toContain('no allowed values configured');
  });

  it('degrades coerce-to-other to null on non-enum constraint violations', () => {
    const numConstraint = { Type: 'numeric' as const, Min: 0, Max: 100, OnViolation: 'coerce-to-other' as const };
    const res = validateOutputValue(150, numConstraint);
    expect(res.valid).toBe(true);
    expect(res.value).toBeNull();
    expect(res.coerced).toBe(true);
    expect(res.violationPolicyApplied).toBe('coerce-to-other');
  });

  it('rejects coerce-to-other on non-enum constraints during spec validation', () => {
    const spec: DataFeatureSpec = {
      Name: 'Invalid Coerce Spec',
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.score',
          Name: 'Score',
          Target: { Mode: 'field', EntityFieldName: 'SentimentScore' },
          Constraint: { Type: 'numeric', Min: 0, Max: 100, OnViolation: 'coerce-to-other' },
        },
      ],
    };
    const issues = validateSpec(spec, sampleEntity);
    expect(issues.some(i => i.Path?.includes('Constraint.OnViolation') && i.Severity === 'error')).toBe(true);
  });

  it('rejects prototype pollution property names in output Ref (R15)', () => {
    const maliciousPaths = [
      '$.__proto__.polluted',
      '$.constructor.prototype.isAdmin',
      '$.items[0].prototype.leak',
      '$.nested.__proto__',
    ];

    for (const ref of maliciousPaths) {
      const spec: DataFeatureSpec = {
        Name: 'Malicious Ref Spec',
        PromptID: 'prompt-1',
        Outputs: [
          {
            Ref: ref,
            Name: 'Injected',
            Target: { Mode: 'field', EntityFieldName: 'SentimentScore' },
          },
        ],
      };
      const issues = validateSpec(spec, sampleEntity);
      const pollutionIssue = issues.find(i => i.Path === 'Outputs[0].Ref');
      expect(pollutionIssue).toBeDefined();
      expect(pollutionIssue?.Severity).toBe('error');
      expect(pollutionIssue?.Message).toContain('prototype pollution property names');
    }

    // Valid paths should not be flagged for prototype pollution
    const validSpec: DataFeatureSpec = {
      Name: 'Valid Spec',
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.analysis.score',
          Name: 'Valid',
          Target: { Mode: 'field', EntityFieldName: 'SentimentScore' },
        },
      ],
    };
    const validIssues = validateSpec(validSpec, sampleEntity);
    expect(validIssues.some(i => i.Message.includes('prototype pollution'))).toBe(false);
  });

  it('rejects an output whose target has an invalid or missing Mode (Round 29 finding)', () => {
    interface MalformedTarget {
      TargetType: string;
      Field: string;
    }
    interface MalformedSpec {
      Name: string;
      PromptID: string;
      Outputs: Array<{
        Ref: string;
        Name: string;
        Target: MalformedTarget;
      }>;
    }

    const malformedSpec: MalformedSpec = {
      Name: 'Malformed Target Spec',
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.score',
          Name: 'Score',
          Target: {
            TargetType: 'field',
            Field: 'SentimentScore',
          },
        },
      ],
    };

    const issues = validateSpec(malformedSpec as DataFeatureSpec, sampleEntity);
    const modeIssue = issues.find(i => i.Path === 'Outputs[0].Target.Mode');
    expect(modeIssue).toBeDefined();
    expect(modeIssue?.Severity).toBe('error');
    expect(modeIssue?.Message).toContain('invalid or missing target Mode');
    expect(modeIssue?.FixRecommendation).toContain('Configure Target.Mode as "field", "child", or "tags"');
  });

  it('rejects child target missing required Map, ParentField, or EntityName', () => {
    const spec: DataFeatureSpec = {
      Name: 'Incomplete Child Spec',
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.items',
          Name: 'Items',
          Target: {
            Mode: 'child',
            EntityName: '',
            ParentField: '',
            Map: {},
          },
        },
      ],
    };

    const issues = validateSpec(spec, sampleEntity);
    expect(issues.some(i => i.Path === 'Outputs[0].Target.EntityName' && i.Severity === 'error')).toBe(true);
    expect(issues.some(i => i.Path === 'Outputs[0].Target.ParentField' && i.Severity === 'error')).toBe(true);
    expect(issues.some(i => i.Path === 'Outputs[0].Target.Map' && i.Severity === 'error')).toBe(true);
  });
});



