import { describe, it, expect } from 'vitest';
import { EntityInfo, type IEntityDataProvider, type RecordChange } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { GetRecordProcessSpecProblems, MJRecordProcessEntityExtended, type RecordProcessSpecFields } from '../entities/MJRecordProcessEntityExtended.js';
import type { DataFeatureOutput, DataFeatureSpec } from '../spec/data-feature-spec.js';

/**
 * The `MJ: Record Processes` save check. A Record Process runs `Validate()` before every save, in the
 * browser and again on the server, so these drive a REAL entity instance: a real `EntityInfo` for the
 * row, and a data provider that resolves the pipeline's entity by ID, as every MJ provider does.
 */

const RECORD_PROCESS_ENTITY_ID = 'A0000000-0000-0000-0000-000000000001';
const CONTACTS_ENTITY_ID = 'B0000000-0000-0000-0000-000000000002';
const ACCOUNTS_ENTITY_ID = 'C0000000-0000-0000-0000-000000000003';

/** The Record Process columns the save check reads, plus the key. */
function recordProcessEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: RECORD_PROCESS_ENTITY_ID,
    Name: 'MJ: Record Processes',
    Status: 'Active',
    BaseTable: 'RecordProcess',
    BaseView: 'vwRecordProcesses',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 510, AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F3', Name: 'EntityID', Type: 'uniqueidentifier', AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F4', Name: 'Status', Type: 'nvarchar', Length: 40, AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F5', Name: 'WorkType', Type: 'nvarchar', Length: 40, AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F6', Name: 'PromptID', Type: 'uniqueidentifier', AllowsNull: true, AllowUpdateAPI: true },
      { ID: 'F7', Name: 'Configuration', Type: 'nvarchar', Length: -1, AllowsNull: true, AllowUpdateAPI: true },
    ],
  });
}

/** Contacts has a described value list on Seniority; Accounts has a Seniority column without one. */
const PIPELINE_ENTITIES = [
  new EntityInfo({
    ID: CONTACTS_ENTITY_ID,
    Name: 'Contacts',
    Fields: [
      {
        ID: 'C1',
        Name: 'Seniority',
        Type: 'nvarchar',
        EntityFieldValues: [
          { Value: 'Executive', Description: 'Runs a function' },
          { Value: 'Manager', Description: 'Leads a team' },
          { Value: 'Staff', Description: 'Individual contributor' },
        ],
      },
      { ID: 'C2', Name: 'Summary', Type: 'nvarchar' },
    ],
  }),
  new EntityInfo({
    ID: ACCOUNTS_ENTITY_ID,
    Name: 'Accounts',
    Fields: [{ ID: 'A1', Name: 'Seniority', Type: 'nvarchar' }],
  }),
];

/** A data provider that resolves entity metadata by ID and never touches a database. */
class EntityLookupDataProvider implements IEntityDataProvider {
  public EntityByID(entityID: string): EntityInfo | undefined {
    return PIPELINE_ENTITIES.find((e) => UUIDsEqual(e.ID, entityID));
  }
  public async Config(): Promise<boolean> {
    return true;
  }
  public async Load(): Promise<{}> {
    throw new Error('not used by the save check');
  }
  public async Save(): Promise<{}> {
    throw new Error('not used by the save check');
  }
  public async Delete(): Promise<boolean> {
    throw new Error('not used by the save check');
  }
  public async GetRecordChanges(): Promise<RecordChange[]> {
    return [];
  }
}

function spec(outputs: DataFeatureOutput[], extra: Partial<DataFeatureSpec> = {}): DataFeatureSpec {
  return {
    Name: 'Contact Seniority',
    Description: 'Classifies each contact',
    PromptID: 'D0000000-0000-0000-0000-000000000004',
    Context: { Fields: ['Title'] },
    Caching: { Cacheable: false },
    Outputs: outputs,
    ...extra,
  };
}

const FREETEXT_SUMMARY: DataFeatureOutput = {
  Name: 'Summary',
  Ref: '$.summary',
  Target: { Mode: 'field', EntityFieldName: 'Summary' },
  Constraint: { Type: 'freetext', MaxLength: 500 },
};

/** A Decision enum whose values come from the target field's value list. */
const SENIORITY_FROM_FIELD: DataFeatureOutput = {
  Name: 'Seniority',
  Ref: '$.seniority',
  Target: { Mode: 'field', EntityFieldName: 'Seniority' },
  Constraint: { Type: 'enum', FromFieldMetadata: true, OnViolation: 'fail' },
};

function recordProcess(fields: {
  EntityID?: string;
  Status?: 'Active' | 'Disabled' | 'Draft';
  WorkType?: 'Action' | 'Agent' | 'FieldRules' | 'Infer' | 'ML Model';
  Configuration: string | null;
}): MJRecordProcessEntityExtended {
  const record = new MJRecordProcessEntityExtended(recordProcessEntityInfo(), new EntityLookupDataProvider());
  record.ID = 'E0000000-0000-0000-0000-000000000005';
  record.Name = 'Contact Seniority';
  record.EntityID = fields.EntityID ?? CONTACTS_ENTITY_ID;
  record.Status = fields.Status ?? 'Active';
  record.WorkType = fields.WorkType ?? 'Infer';
  record.PromptID = 'D0000000-0000-0000-0000-000000000004';
  record.Configuration = fields.Configuration;
  return record;
}

describe('MJRecordProcessEntityExtended.Validate (the Feature Pipeline save check)', () => {
  it('refuses to save a Decision pipeline with a freetext output, naming the output on Configuration', () => {
    const record = recordProcess({ Configuration: JSON.stringify(spec([FREETEXT_SUMMARY], { PipelineType: 'Decision' })) });

    const result = record.Validate();

    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => e.Source)).toEqual(['Configuration']);
    expect(result.Errors[0].Message).toBe("Output 'Summary' has constraint type 'freetext', which this pipeline type cannot produce.");
  });

  it('saves the same freetext output on an LLM pipeline', () => {
    const record = recordProcess({ Configuration: JSON.stringify(spec([FREETEXT_SUMMARY])) });
    expect(record.Validate().Success).toBe(true);
  });

  it('resolves a Decision enum from the value list of the pipeline\'s own entity', () => {
    const record = recordProcess({ Configuration: JSON.stringify(spec([SENIORITY_FROM_FIELD], { PipelineType: 'Decision' })) });
    expect(record.Validate().Success).toBe(true);
  });

  it('refuses the same enum on an entity whose same-named field has no value list', () => {
    const record = recordProcess({
      EntityID: ACCOUNTS_ENTITY_ID,
      Configuration: JSON.stringify(spec([SENIORITY_FROM_FIELD], { PipelineType: 'Decision' })),
    });

    const result = record.Validate();

    expect(result.Success).toBe(false);
    expect(result.Errors[0].Message).toContain("Enum output 'Seniority' has no values defined");
  });

  it('refuses a Decision pipeline that captures reasoning', () => {
    const record = recordProcess({
      Configuration: JSON.stringify(spec([SENIORITY_FROM_FIELD], { PipelineType: 'Decision', CaptureReasoning: true })),
    });
    expect(record.Validate().Errors.map((e) => e.Message)).toEqual([
      'This pipeline type does not produce reasoning; turn off CaptureReasoning or use an LLM pipeline.',
    ]);
  });

  it('refuses a spec ValidateSpec rejects, as the processor would before running it', () => {
    const record = recordProcess({ Configuration: JSON.stringify(spec([])) });
    expect(record.Validate().Errors.map((e) => e.Message)).toEqual([
      'DataFeatureSpec Outputs must contain at least one output definition.',
    ]);
  });

  it('refuses a Configuration that is not a JSON object', () => {
    expect(recordProcess({ Configuration: '{not json' }).Validate().Errors.map((e) => e.Message)).toEqual([
      'Configuration is not a DataFeatureSpec: it must be a JSON object.',
    ]);
    expect(recordProcess({ Configuration: '[1, 2]' }).Validate().Success).toBe(false);
  });

  it('does not check a Disabled pipeline, so a broken one can still be turned off', () => {
    const record = recordProcess({
      Status: 'Disabled',
      Configuration: JSON.stringify(spec([FREETEXT_SUMMARY], { PipelineType: 'Decision' })),
    });
    expect(record.Validate().Success).toBe(true);
  });

  it('does not check a process that is not Infer, or an Infer process without a Configuration', () => {
    expect(recordProcess({ WorkType: 'FieldRules', Configuration: '{"Rules": []}' }).Validate().Success).toBe(true);
    expect(recordProcess({ Configuration: null }).Validate().Success).toBe(true);
    expect(recordProcess({ Configuration: '   ' }).Validate().Success).toBe(true);
  });
});

describe('GetRecordProcessSpecProblems', () => {
  const decisionRow = (outputs: DataFeatureOutput[]): RecordProcessSpecFields => ({
    WorkType: 'Infer',
    Status: 'Draft',
    Configuration: JSON.stringify(spec(outputs, { PipelineType: 'Decision' })),
  });

  it('checks a Draft pipeline, reporting each problem once', () => {
    const problems = GetRecordProcessSpecProblems(decisionRow([FREETEXT_SUMMARY, { ...FREETEXT_SUMMARY, Name: 'Summary2' }]));
    expect(problems).toEqual([
      "Output 'Summary' has constraint type 'freetext', which this pipeline type cannot produce.",
      "Output 'Summary2' has constraint type 'freetext', which this pipeline type cannot produce.",
    ]);
  });

  it('reads field values only through the lookup it is given', () => {
    expect(GetRecordProcessSpecProblems(decisionRow([SENIORITY_FROM_FIELD]))).toEqual([
      "Enum output 'Seniority' has no values defined; list them in Values, or set FromFieldMetadata on a field that has a value list.",
    ]);
    const lookup = (fieldName: string) => (fieldName === 'Seniority' ? [{ Value: 'Staff', Description: 'Individual contributor' }] : undefined);
    expect(GetRecordProcessSpecProblems(decisionRow([SENIORITY_FROM_FIELD]), lookup)).toEqual([]);
  });

  it('reports a spec too malformed to check instead of throwing', () => {
    const row: RecordProcessSpecFields = { WorkType: 'Infer', Status: 'Active', Configuration: '{"Name":"x","PromptID":"p","Outputs":[null]}' };
    const problems = GetRecordProcessSpecProblems(row);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^Configuration is not a valid DataFeatureSpec: /);
  });
});
