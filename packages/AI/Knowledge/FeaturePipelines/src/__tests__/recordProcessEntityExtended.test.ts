import { describe, it, expect } from 'vitest';
import {
  BaseEntity,
  EntityInfo,
  ProviderType,
  UserInfo,
  type IEntityDataProvider,
  type RecordChange,
  type RunViewParams,
  type RunViewResult,
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import type { MJAIPromptEntity, MJTemplateContentEntity } from '@memberjunction/core-entities';
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

/** The role whose members may save Record Processes, as a metadata push's user may. */
const PUSH_ROLE_ID = 'A1000000-0000-0000-0000-000000000008';

/** The Record Process columns the save check reads, plus the key. */
function recordProcessEntityInfo(): EntityInfo {
  return new EntityInfo({
    ID: RECORD_PROCESS_ENTITY_ID,
    Name: 'MJ: Record Processes',
    Status: 'Active',
    BaseTable: 'RecordProcess',
    BaseView: 'vwRecordProcesses',
    AllowCreateAPI: true,
    AllowUpdateAPI: true,
    Permissions: [{ ID: 'PERM-1', RoleID: PUSH_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true }],
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
  public async Save(_entity: BaseEntity): Promise<{}> {
    throw new Error('not used by the save check');
  }
  public async Delete(): Promise<boolean> {
    throw new Error('not used by the save check');
  }
  public async GetRecordChanges(): Promise<RecordChange[]> {
    return [];
  }
}

type PromptRow = Pick<MJAIPromptEntity, 'ID' | 'Name' | 'TemplateID'>;
type TemplateContentRow = Pick<MJTemplateContentEntity, 'ID' | 'TemplateID' | 'Type' | 'Priority' | '__mj_CreatedAt' | 'TemplateText'>;

/**
 * A server-tier provider over in-memory AI Prompt and Template Content rows, modelling the two layers a server view
 * read passes through. The server cache answers with committed rows; while a transaction holds a pending write to an
 * entity, that entity's reads skip the cache and the database answers on the transaction's connection, including the
 * uncommitted rows (as `LocalCacheManager`'s pending-batch miss and `SQLServerDataProvider`'s transaction binding do).
 * It saves a record by echoing its fields, so a test can drive a real `Save()` through validation.
 */
class TransactionScopedDatabaseProvider extends EntityLookupDataProvider {
  public readonly Prompts: PromptRow[] = [];
  public readonly Contents: TemplateContentRow[] = [];
  /** Every view the provider ran, in order. */
  public readonly Views: RunViewParams[] = [];
  /** Template text written in the open transaction, by content ID; null when no transaction is open. */
  private uncommittedText: Map<string, string> | null = null;
  /** Entities with a write pending in the open transaction's cache batch: their reads miss the server cache. */
  private readonly pendingInBatch = new Set<string>();
  /** Fails every view read with this message, when set. */
  public ReadFailure: string | null = null;
  /** Fails the Template Content reads only with this message, when set. */
  public ContentReadFailure: string | null = null;

  public get ProviderType(): ProviderType {
    return ProviderType.Database;
  }

  public BeginTransaction(): void {
    this.uncommittedText = new Map();
  }

  /** Writes a content row's text: inside the transaction when one is open. */
  public WriteTemplateText(contentID: string, text: string): void {
    if (this.uncommittedText) {
      this.uncommittedText.set(contentID, text);
      this.pendingInBatch.add('MJ: Template Contents');
      return;
    }
    const row = this.Contents.find((c) => c.ID === contentID);
    if (row) {
      row.TemplateText = text;
    }
  }

  public async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
    this.Views.push(params);
    if (this.ReadFailure) {
      return this.result<T>([], this.ReadFailure);
    }
    const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
    const id = /'([^']+)'/.exec(filter)?.[1] || '';
    if (params.EntityName === 'MJ: AI Prompts') {
      return this.result<T>(this.Prompts.filter((p) => p.ID === id));
    }
    if (params.EntityName === 'MJ: Template Contents') {
      if (this.ContentReadFailure) {
        return this.result<T>([], this.ContentReadFailure);
      }
      const committed = this.Contents.filter((c) => c.TemplateID === id);
      if (!this.pendingInBatch.has(params.EntityName)) {
        return this.result<T>(committed); // the server cache: committed rows only
      }
      // `??`: an empty text written in the transaction is a real write, not a missing one
      return this.result<T>(committed.map((c) => ({ ...c, TemplateText: this.uncommittedText?.get(c.ID) ?? c.TemplateText })));
    }
    throw new Error(`no fixture for ${params.EntityName}`);
  }

  public override async Save(entity: BaseEntity): Promise<{}> {
    return entity.GetAll();
  }

  /** Test double: the fixture rows stand in for the view's row type, so one widening cast. */
  private result<T>(rows: object[], error?: string): RunViewResult<T> {
    return { Success: !error, Results: rows as T[], RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: error || '' };
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
  Provider?: IEntityDataProvider;
}): MJRecordProcessEntityExtended {
  const record = new MJRecordProcessEntityExtended(recordProcessEntityInfo(), fields.Provider || new EntityLookupDataProvider());
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

describe('MJRecordProcessEntityExtended.ValidateAsync (the prompt template must render the constraint block)', () => {
  const PROMPT_ID = 'D0000000-0000-0000-0000-000000000004';
  const TEMPLATE_ID = 'F0000000-0000-0000-0000-000000000006';
  const NO_BLOCK = 'Title: {{ record.Title }}';
  const WITH_BLOCK = 'Title: {{ record.Title }}\n{{ ConstraintBlock }}';

  /** A server provider holding the pipeline's prompt and its template's one content row. */
  function serverWith(templateText: string): TransactionScopedDatabaseProvider {
    const provider = new TransactionScopedDatabaseProvider();
    provider.Prompts.push({ ID: PROMPT_ID, Name: 'Contact Seniority', TemplateID: TEMPLATE_ID });
    provider.Contents.push({ ID: 'C-1', TemplateID: TEMPLATE_ID, Type: 'Text', Priority: 1, __mj_CreatedAt: new Date('2026-01-01'), TemplateText: templateText });
    return provider;
  }
  const PUSHER = new UserInfo(undefined, {
    ID: 'B1000000-0000-0000-0000-000000000007',
    Name: 'Metadata Push',
    Email: 'push@example.com',
    UserRoles: [{ UserID: 'B1000000-0000-0000-0000-000000000007', RoleID: PUSH_ROLE_ID, Role: 'Pushers' }],
  });
  const constrainedLLM = (provider: IEntityDataProvider, outputs: DataFeatureOutput[] = [SENIORITY_FROM_FIELD], extra: Partial<DataFeatureSpec> = {}) => {
    const record = recordProcess({ Configuration: JSON.stringify(spec(outputs, extra)), Provider: provider });
    record.ContextCurrentUser = PUSHER;
    return record;
  };
  const MISSING_BLOCK =
    "Feature Pipeline prompt 'Contact Seniority' does not render its output constraints. " +
    "Add {{ ConstraintBlock }} to the prompt template, or remove the constraints from the pipeline's outputs.";

  it('refuses to save a constrained LLM pipeline whose template drops the block, naming the prompt on PromptID', async () => {
    const result = await constrainedLLM(serverWith(NO_BLOCK)).ValidateAsync();

    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => e.Source)).toEqual(['PromptID']);
    expect(result.Errors[0].Message).toBe(MISSING_BLOCK);
  });

  it('saves when the template renders the block', async () => {
    expect((await constrainedLLM(serverWith(WITH_BLOCK)).ValidateAsync()).Success).toBe(true);
  });

  it('accepts a pipeline saved after its template was fixed earlier in the same transaction, as one metadata push does', async () => {
    const provider = serverWith(NO_BLOCK);
    provider.BeginTransaction();
    provider.WriteTemplateText('C-1', WITH_BLOCK);
    const record = constrainedLLM(provider);

    expect(await record.Save()).toBe(true);
    // read on the transaction's own provider, not from an engine cache that reloads only after commit
    expect(provider.Views.map((v) => v.EntityName)).toEqual(['MJ: AI Prompts', 'MJ: Template Contents']);
    // the same read a Feature Pipeline run makes (PromptTemplateContent.ReadCurrent): past every cache
    expect(provider.Views[1].BypassCache).toBe(true);
  });

  it('refuses, through Save(), a pipeline whose template lost the block earlier in the same transaction', async () => {
    const provider = serverWith(WITH_BLOCK);
    provider.BeginTransaction();
    provider.WriteTemplateText('C-1', NO_BLOCK);
    const record = constrainedLLM(provider);

    expect(await record.Save()).toBe(false);
    expect(record.LatestResult?.CompleteMessage).toContain(MISSING_BLOCK);
  });

  it('reads the template the prompt renders: the highest-priority content row', async () => {
    const provider = serverWith(NO_BLOCK);
    provider.Contents.push({ ID: 'C-0', TemplateID: TEMPLATE_ID, Type: 'Text', Priority: 0, __mj_CreatedAt: new Date('2026-02-01'), TemplateText: WITH_BLOCK });
    expect((await constrainedLLM(provider).ValidateAsync()).Success).toBe(true);
  });

  it('refuses a prompt that cannot be found, a prompt without template content, and a read that fails, naming each', async () => {
    const noPrompt = serverWith(WITH_BLOCK);
    noPrompt.Prompts.length = 0;
    expect((await constrainedLLM(noPrompt).ValidateAsync()).Errors.map((e) => e.Message)).toEqual([
      `AI Prompt '${PROMPT_ID}' was not found, so its template cannot render the pipeline's output constraints.`,
    ]);

    const noContent = serverWith(WITH_BLOCK);
    noContent.Contents.length = 0;
    expect((await constrainedLLM(noContent).ValidateAsync()).Errors.map((e) => e.Message)).toEqual([
      "Feature Pipeline prompt 'Contact Seniority' has no template content, so it cannot render its output constraints. " +
        "Give the prompt a template that renders {{ ConstraintBlock }}, or remove the constraints from the pipeline's outputs.",
    ]);

    const noTemplate = serverWith(WITH_BLOCK);
    noTemplate.Prompts[0].TemplateID = ''; // the column is NOT NULL; an empty ID is the no-template case a read can still return
    expect((await constrainedLLM(noTemplate).ValidateAsync()).Success).toBe(false);

    const failing = serverWith(WITH_BLOCK);
    failing.ReadFailure = 'connection lost';
    expect((await constrainedLLM(failing).ValidateAsync()).Errors.map((e) => e.Message)).toEqual([
      `AI Prompt '${PROMPT_ID}' could not be read to check that its template renders the output constraints: connection lost`,
    ]);
  });

  it('refuses when the prompt is read but its template content cannot be', async () => {
    const provider = serverWith(WITH_BLOCK);
    provider.ContentReadFailure = 'timeout';
    expect((await constrainedLLM(provider).ValidateAsync()).Errors.map((e) => e.Message)).toEqual([
      `The template of Feature Pipeline prompt 'Contact Seniority' could not be read to check that it renders the output constraints: ` +
        `The content of template '${TEMPLATE_ID}' could not be read: timeout`,
    ]);
  });

  it('leaves the check to the server: a browser-side save reads nothing', async () => {
    const browser = new EntityLookupDataProvider();
    expect((await constrainedLLM(browser).ValidateAsync()).Success).toBe(true);
  });

  it('does not check a Disabled pipeline, a Decision pipeline, or outputs without constraints', async () => {
    const provider = serverWith(NO_BLOCK);
    const unconstrained: DataFeatureOutput = { ...SENIORITY_FROM_FIELD, Constraint: undefined };

    expect((await recordProcess({ Status: 'Disabled', Configuration: JSON.stringify(spec([SENIORITY_FROM_FIELD])), Provider: provider }).ValidateAsync()).Success).toBe(true);
    expect((await constrainedLLM(provider, [SENIORITY_FROM_FIELD], { PipelineType: 'Decision' }).ValidateAsync()).Success).toBe(true);
    expect((await constrainedLLM(provider, [unconstrained]).ValidateAsync()).Success).toBe(true);
    expect(provider.Views).toEqual([]);
  });
});
