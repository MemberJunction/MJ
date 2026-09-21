import { describe, it, expect } from 'vitest';
import {
  type DataFeatureSpec,
  validateMaterializationTargets,
  type TargetValidationMetadataProvider,
  type EntityInfoLike,
} from '../index.js';

describe('validateMaterializationTargets (P1-4)', () => {
  // Test fixture setup
  const customerEntity: EntityInfoLike = {
    ID: 'cust-entity-uuid',
    Name: 'Customers',
    Fields: [
      { Name: 'ID', TSType: 'string', IsPrimaryKey: true, IsVirtual: false },
      { Name: 'Name', TSType: 'string', Length: 100, IsVirtual: false },
      { Name: 'VirtualNotes', TSType: 'string', IsVirtual: true },
      // Downstream 3-column scoring shape:
      {
        Name: 'ChurnProbability',
        Type: 'decimal',
        Precision: 5,
        Scale: 4,
        TSType: 'number',
        IsVirtual: false,
      },
      {
        Name: 'ChurnRiskBand',
        Type: 'nvarchar',
        Length: 20,
        TSType: 'string',
        IsVirtual: false,
        EntityFieldValues: [
          { Value: 'Low' },
          { Value: 'Medium' },
          { Value: 'High' },
        ],
      },
      {
        Name: 'ScoredAt',
        Type: 'datetimeoffset',
        TSType: 'Date',
        IsVirtual: false,
      },
      // Foreign key field
      {
        Name: 'AccountManagerID',
        Type: 'uniqueidentifier',
        TSType: 'string',
        IsVirtual: false,
        RelatedEntity: 'Employees',
        RelatedEntityID: 'emp-entity-uuid',
      },
      // Integer fields
      {
        Name: 'PriorityLevel',
        Type: 'tinyint',
        TSType: 'number',
        IsVirtual: false,
      },
    ],
  };

  const employeeEntity: EntityInfoLike = {
    ID: 'emp-entity-uuid',
    Name: 'Employees',
    Fields: [
      { Name: 'ID', TSType: 'string', IsPrimaryKey: true, IsVirtual: false },
      { Name: 'FullName', TSType: 'string', Length: 100, IsVirtual: false },
      { Name: 'VirtualDisplayName', TSType: 'string', Length: 100, IsVirtual: true },
    ],
  };

  const customerChurnAlertEntity: EntityInfoLike = {
    ID: 'alert-entity-uuid',
    Name: 'CustomerChurnAlerts',
    Fields: [
      { Name: 'ID', TSType: 'string', IsPrimaryKey: true, IsVirtual: false },
      { Name: 'CustomerID', TSType: 'string', IsVirtual: false },
      { Name: 'Severity', TSType: 'string', Length: 20, IsVirtual: false },
      { Name: 'CalculatedScore', TSType: 'number', IsVirtual: true },
    ],
  };

  const entitiesByName = new Map<string, EntityInfoLike>([
    ['customers', customerEntity],
    ['employees', employeeEntity],
    ['customerchurnalerts', customerChurnAlertEntity],
  ]);

  const entitiesByID = new Map<string, EntityInfoLike>([
    ['cust-entity-uuid', customerEntity],
    ['emp-entity-uuid', employeeEntity],
    ['alert-entity-uuid', customerChurnAlertEntity],
  ]);

  const mockProvider: TargetValidationMetadataProvider = {
    EntityByID: (id: string) => entitiesByID.get(id),
    EntityByName: (name: string) => entitiesByName.get(name.toLowerCase()),
    Entities: [customerEntity, employeeEntity, customerChurnAlertEntity],
  };

  it('validates the standard 3-column scoring shape fixture cleanly', () => {
    const spec: DataFeatureSpec = {
      Name: 'Customer Churn Predictor',
      Description: 'Populates ChurnProbability, ChurnRiskBand, and ScoredAt',
      Context: { Fields: ['Name'] },
      PromptID: 'prompt-churn-1',
      Outputs: [
        {
          Ref: '$.churnProbability',
          Name: 'ChurnProbability',
          Target: { Mode: 'field', EntityFieldName: 'ChurnProbability' },
          Constraint: { Type: 'numeric', Min: 0, Max: 1, OnViolation: 'fail' },
        },
        {
          Ref: '$.churnRiskBand',
          Name: 'ChurnRiskBand',
          Target: { Mode: 'field', EntityFieldName: 'ChurnRiskBand' },
          Constraint: {
            Type: 'enum',
            Values: ['Low', 'Medium', 'High'],
            OnViolation: 'fail',
          },
        },
        {
          Ref: '$.scoredAt',
          Name: 'ScoredAt',
          Target: { Mode: 'field', EntityFieldName: 'ScoredAt' },
          Constraint: { Type: 'date', OnViolation: 'fail' },
        },
      ],
      Caching: { Cacheable: true },
    };

    const issues = validateMaterializationTargets(spec, mockProvider, 'cust-entity-uuid');
    const errors = issues.filter((i) => i.Severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('rejects a nonexistent target column with a precise message', () => {
    const spec: DataFeatureSpec = {
      Name: 'Nonexistent Column Pipeline',
      Description: 'Points to column that does not exist',
      Context: { Fields: ['Name'] },
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.val',
          Name: 'BogusField',
          Target: { Mode: 'field', EntityFieldName: 'TotallyBogusField' },
        },
      ],
      Caching: { Cacheable: false },
    };

    const issues = validateMaterializationTargets(spec, mockProvider, 'Customers');
    const error = issues.find((i) => i.Field === 'TotallyBogusField');
    expect(error).toBeDefined();
    expect(error?.Message).toContain("Target field 'TotallyBogusField' does not exist on entity 'Customers'");
    expect(error?.FixRecommendation).toContain('Target an existing column on the entity or create a migration');
  });

  it('rejects writing to a virtual column (C8 / D17)', () => {
    const spec: DataFeatureSpec = {
      Name: 'Virtual Column Pipeline',
      Description: 'Attempts to write to a view-calculated column',
      Context: { Fields: ['Name'] },
      PromptID: 'prompt-1',
      Outputs: [
        {
          Ref: '$.notes',
          Name: 'VirtualNotes',
          Target: { Mode: 'field', EntityFieldName: 'VirtualNotes' },
        },
      ],
      Caching: { Cacheable: false },
    };

    const issues = validateMaterializationTargets(spec, mockProvider, 'Customers');
    const error = issues.find((i) => i.Field === 'VirtualNotes');
    expect(error).toBeDefined();
    expect(error?.Message).toContain('is a virtual/view column and cannot be written to');
    expect(error?.FixRecommendation).toContain('Target a base-table column on this entity');
  });

  it('validates DECIMAL(5,4) with Min: 0, Max: 1, but rejects Max: 100 with overflow reason', () => {
    const validSpec: DataFeatureSpec = {
      Name: 'Valid Probability',
      Description: 'Max 1 fits in DECIMAL(5,4)',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.prob',
          Name: 'Prob',
          Target: { Mode: 'field', EntityFieldName: 'ChurnProbability' },
          Constraint: { Type: 'numeric', Min: 0, Max: 1, OnViolation: 'fail' },
        },
      ],
      Caching: { Cacheable: false },
    };

    const validIssues = validateMaterializationTargets(validSpec, mockProvider, 'Customers');
    expect(validIssues.filter((i) => i.Severity === 'error')).toHaveLength(0);

    const invalidSpec: DataFeatureSpec = {
      Name: 'Overflow Probability',
      Description: 'Max 100 exceeds DECIMAL(5,4) max of 9.9999',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.prob',
          Name: 'Prob',
          Target: { Mode: 'field', EntityFieldName: 'ChurnProbability' },
          Constraint: { Type: 'numeric', Min: 0, Max: 100, OnViolation: 'fail' },
        },
      ],
      Caching: { Cacheable: false },
    };

    const invalidIssues = validateMaterializationTargets(invalidSpec, mockProvider, 'Customers');
    const overflowError = invalidIssues.find((i) => i.Path.includes('Constraint.Max'));
    expect(overflowError).toBeDefined();
    expect(overflowError?.Message).toContain("Target column 'ChurnProbability' has type decimal(5,4)");
    expect(overflowError?.Message).toContain('maximum representable value 9.9999');
    expect(overflowError?.Message).toContain('constraint Max is 100');
    expect(overflowError?.Message).toContain('arithmetic overflow');
  });

  it('rejects constraint enum values that disagree with the column CHECK value list', () => {
    const spec: DataFeatureSpec = {
      Name: 'Enum Disagreement',
      Description: 'Spec declares an enum value not in the database CHECK constraint',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.band',
          Name: 'Band',
          Target: { Mode: 'field', EntityFieldName: 'ChurnRiskBand' },
          Constraint: {
            Type: 'enum',
            Values: ['Low', 'Extreme'], // 'Extreme' is not in ['Low', 'Medium', 'High']
            OnViolation: 'fail',
          },
        },
      ],
      Caching: { Cacheable: false },
    };

    const issues = validateMaterializationTargets(spec, mockProvider, 'Customers');
    const error = issues.find((i) => i.Path.includes('Constraint.Values'));
    expect(error).toBeDefined();
    expect(error?.Message).toContain("['Extreme'] not permitted by the database CHECK constraint on column 'ChurnRiskBand'");
    expect(error?.Message).toContain("allowed: ['Low', 'Medium', 'High']");
    expect(error?.FixRecommendation).toContain('Update constraint values to match the database CHECK constraint');
  });

  it('accepts enum constraint when FromFieldMetadata is true against CHECK constraint', () => {
    const spec: DataFeatureSpec = {
      Name: 'From Metadata Enum',
      Description: 'Uses column metadata for enum values',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.band',
          Name: 'Band',
          Target: { Mode: 'field', EntityFieldName: 'ChurnRiskBand' },
          Constraint: {
            Type: 'enum',
            FromFieldMetadata: true,
            OnViolation: 'fail',
          },
        },
      ],
      Caching: { Cacheable: false },
    };

    const issues = validateMaterializationTargets(spec, mockProvider, 'Customers');
    expect(issues.filter((i) => i.Severity === 'error')).toHaveLength(0);
  });

  it('rejects enum value exceeding column character length', () => {
    const spec: DataFeatureSpec = {
      Name: 'Oversized Enum Value',
      Description: 'Enum value exceeds 20 characters of ChurnRiskBand',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.band',
          Name: 'Band',
          Target: { Mode: 'field', EntityFieldName: 'ChurnRiskBand' },
          Constraint: {
            Type: 'enum',
            Values: ['ThisValueHasMoreThanTwentyCharacters'],
            OnViolation: 'fail',
          },
        },
      ],
      Caching: { Cacheable: false },
    };

    const issues = validateMaterializationTargets(spec, mockProvider, 'Customers');
    const error = issues.find((i) => i.Message.includes('exceeds maximum length 20'));
    expect(error).toBeDefined();
  });

  it('validates integer range constraints (tinyint)', () => {
    const spec: DataFeatureSpec = {
      Name: 'Tinyint Overflow',
      Description: 'Max 300 exceeds tinyint range (0-255)',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.priority',
          Name: 'PriorityLevel',
          Target: { Mode: 'field', EntityFieldName: 'PriorityLevel' },
          Constraint: { Type: 'numeric', Min: 0, Max: 300, OnViolation: 'fail' },
        },
      ],
      Caching: { Cacheable: false },
    };

    const issues = validateMaterializationTargets(spec, mockProvider, 'Customers');
    const error = issues.find((i) => i.Message.includes('tinyint (max: 255)'));
    expect(error).toBeDefined();
  });

  it('validates foreign key targets and rejects virtual or missing LookupMatchField', () => {
    // 1. Missing match field
    const missingFieldSpec: DataFeatureSpec = {
      Name: 'Bad FK Match Field',
      Description: 'LookupMatchField does not exist on Employees',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.manager',
          Name: 'Manager',
          Target: {
            Mode: 'field',
            EntityFieldName: 'AccountManagerID',
            LookupMatchField: 'GhostField',
          },
        },
      ],
      Caching: { Cacheable: false },
    };

    const issues1 = validateMaterializationTargets(missingFieldSpec, mockProvider, 'Customers');
    const err1 = issues1.find((i) => i.Message.includes("'GhostField' does not exist on related entity 'Employees'"));
    expect(err1).toBeDefined();

    // 2. Virtual match field
    const virtualFieldSpec: DataFeatureSpec = {
      Name: 'Virtual FK Match Field',
      Description: 'LookupMatchField is virtual on Employees',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.manager',
          Name: 'Manager',
          Target: {
            Mode: 'field',
            EntityFieldName: 'AccountManagerID',
            LookupMatchField: 'VirtualDisplayName',
          },
        },
      ],
      Caching: { Cacheable: false },
    };

    const issues2 = validateMaterializationTargets(virtualFieldSpec, mockProvider, 'Customers');
    const err2 = issues2.find((i) => i.Message.includes("is virtual and cannot be used for direct lookup matching"));
    expect(err2).toBeDefined();

    // 3. Valid match field
    const validFKSpec: DataFeatureSpec = {
      Name: 'Valid FK Target',
      Description: 'LookupMatchField is physical FullName on Employees',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.manager',
          Name: 'Manager',
          Target: {
            Mode: 'field',
            EntityFieldName: 'AccountManagerID',
            LookupMatchField: 'FullName',
          },
        },
      ],
      Caching: { Cacheable: false },
    };

    const issues3 = validateMaterializationTargets(validFKSpec, mockProvider, 'Customers');
    expect(issues3.filter((i) => i.Severity === 'error')).toHaveLength(0);
  });

  it('validates child entity targets and checks ParentField and mapped fields', () => {
    // 1. Missing child entity
    const badChildSpec: DataFeatureSpec = {
      Name: 'Bad Child Entity',
      Description: 'References nonexistent child entity',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.alert',
          Name: 'Alert',
          Target: {
            Mode: 'child',
            EntityName: 'NonExistentChildEntity',
            ParentField: 'CustomerID',
            Map: { Severity: '$.sev' },
          },
        },
      ],
      Caching: { Cacheable: false },
    };
    const issues1 = validateMaterializationTargets(badChildSpec, mockProvider, 'Customers');
    expect(issues1.some((i) => i.Message.includes("references entity 'NonExistentChildEntity', which does not exist"))).toBe(true);

    // 2. Virtual mapped field on child
    const virtualMapSpec: DataFeatureSpec = {
      Name: 'Virtual Mapped Field',
      Description: 'Maps to CalculatedScore which is virtual on CustomerChurnAlerts',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.alert',
          Name: 'Alert',
          Target: {
            Mode: 'child',
            EntityName: 'CustomerChurnAlerts',
            ParentField: 'CustomerID',
            Map: { CalculatedScore: '$.score' },
          },
        },
      ],
      Caching: { Cacheable: false },
    };
    const issues2 = validateMaterializationTargets(virtualMapSpec, mockProvider, 'Customers');
    expect(issues2.some((i) => i.Message.includes("Mapped child field 'CalculatedScore' on child entity 'CustomerChurnAlerts' is virtual"))).toBe(true);

    // 3. Valid child target
    const validChildSpec: DataFeatureSpec = {
      Name: 'Valid Child Target',
      Description: 'Physical ParentField and physical mapped fields',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.alert',
          Name: 'Alert',
          Target: {
            Mode: 'child',
            EntityName: 'CustomerChurnAlerts',
            ParentField: 'CustomerID',
            Map: { Severity: '$.severity' },
          },
        },
      ],
      Caching: { Cacheable: false },
    };
    const issues3 = validateMaterializationTargets(validChildSpec, mockProvider, 'Customers');
    expect(issues3.filter((i) => i.Severity === 'error')).toHaveLength(0);
  });

  it('validates tag target parameters (UUID, MaxDepth, Growth, MatchThreshold)', () => {
    // 1. Invalid UUID
    const badUUIDSpec: DataFeatureSpec = {
      Name: 'Bad Tag UUID',
      Description: 'RootTagID is not a UUID',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.tag',
          Name: 'Tag',
          Target: {
            Mode: 'tags',
            RootTagID: 'not-a-uuid',
          },
        },
      ],
      Caching: { Cacheable: false },
    };
    const issues1 = validateMaterializationTargets(badUUIDSpec, mockProvider, 'Customers');
    expect(issues1.some((i) => i.Message.includes("must be a valid UUID"))).toBe(true);

    // 2. Invalid MaxDepth and MatchThreshold
    const badParamsSpec: DataFeatureSpec = {
      Name: 'Bad Tag Params',
      Description: 'Invalid MaxDepth and MatchThreshold',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.tag',
          Name: 'Tag',
          Target: {
            Mode: 'tags',
            RootTagID: '12345678-1234-1234-1234-123456789abc',
            MaxDepth: 0,
            MatchThreshold: 1.5,
          },
        },
      ],
      Caching: { Cacheable: false },
    };
    const issues2 = validateMaterializationTargets(badParamsSpec, mockProvider, 'Customers');
    expect(issues2.some((i) => i.Message.includes("MaxDepth (0) must be a positive integer >= 1"))).toBe(true);
    expect(issues2.some((i) => i.Message.includes("MatchThreshold (1.5) must be between 0.0 and 1.0"))).toBe(true);

    // 3. Valid tag target
    const validTagSpec: DataFeatureSpec = {
      Name: 'Valid Tag Target',
      Description: 'Proper UUID, depth, growth, threshold',
      Context: { Fields: ['Name'] },
      PromptID: 'p1',
      Outputs: [
        {
          Ref: '$.tag',
          Name: 'Tag',
          Target: {
            Mode: 'tags',
            RootTagID: '12345678-1234-1234-1234-123456789abc',
            MaxDepth: 2,
            Growth: 'constrained',
            MatchThreshold: 0.85,
          },
        },
      ],
      Caching: { Cacheable: false },
    };
    const issues3 = validateMaterializationTargets(validTagSpec, mockProvider, 'Customers');
    expect(issues3.filter((i) => i.Severity === 'error')).toHaveLength(0);
  });
});
