/**
 * `MJMLModelScoringBindingEntityServer`: a scoring binding names its pipeline, feature name, target entity and view
 * authorization; its target entity is the entity its pipeline's models score (D4-168); its feature name is free on the target entity; a target column has a copy source the pipeline's
 * Published model can give; and a binding is deleted only once withdrawn with no Feature Value naming it.
 *
 * The entity is the real class over hand-built EntityInfo, so dirty tracking, `ValidateAsync()`, `Save()` and
 * `Delete()` are BaseEntity's own; the provider records writes and answers every read from memory.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  EntityInfo, UserInfo, UserRoleInfo, type BaseEntity, type IEntityDataProvider, type RecordChange, type RunViewParams, type RunViewResult,
} from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: object) => target };
});

import { ProtocolRows, type UnitDraft } from '@memberjunction/predictive-studio-core';
import { MJMLModelScoringBindingEntityServer } from '../custom/MJMLModelScoringBindingEntityServer.server';

const BINDING_ENTITY_ID = 'E0000000-0000-4000-8000-0000000000C1';
const TARGET_ENTITY_ID = 'E0000000-0000-4000-8000-0000000000C2';
const CHILD_ENTITY_ID = 'E0000000-0000-4000-8000-0000000000C3';
const UNIT_ID = 'B0000000-0000-4000-8000-0000000000C4';
const ROLE_ID = 'E1000000-0000-4000-8000-0000000000C1';
const PIPELINE_ID = 'B0000000-0000-4000-8000-0000000000C1';
const MODEL_ID = 'B0000000-0000-4000-8000-0000000000C2';
const AUTHORIZATION_ID = 'B0000000-0000-4000-8000-0000000000C3';
const EXISTING_ID = 'C0000000-0000-4000-8000-0000000000C1';
const pipelineOutputName = 'Seniority';

/** One row a fake read returns. */
type Row = Record<string, string | number | null>;

/** A column of a hand-built EntityInfo. */
interface Column { readonly Name: string; readonly Type: string; readonly AllowsNull: boolean; readonly IsPrimaryKey?: boolean; readonly AllowUpdateAPI?: boolean }

/** An EntityInfo with the given columns, the API open and one role with every permission. */
function entityInfo(id: string, name: string, columns: readonly Column[]): EntityInfo {
  return new EntityInfo({
    ID: id, Name: name, SchemaName: '__mj', BaseTable: name.replace(/\W/g, ''), BaseView: `vw${name.replace(/\W/g, '')}`,
    Status: 'Active', IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, TrackRecordChanges: false, EnableFieldLevelSecurity: false,
    EntityPermissions: [{ ID: `P${id.substring(1)}`, EntityID: id, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }],
    EntityFields: columns.map((c, i) => ({ ID: `F${id.substring(1, 30)}${(10 + i).toString()}`, EntityID: id, Sequence: i + 1, Length: 0, Precision: 0, Scale: 0, AllowUpdateAPI: true, ...c })),
  });
}

const bindingInfo = entityInfo(BINDING_ENTITY_ID, 'MJ: ML Model Scoring Bindings', [
  { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
  { Name: 'MLTrainingPipelineID', Type: 'uniqueidentifier', AllowsNull: true },
  { Name: 'FeatureName', Type: 'nvarchar', AllowsNull: true },
  { Name: 'TargetEntityID', Type: 'uniqueidentifier', AllowsNull: true },
  { Name: 'ViewAuthorizationID', Type: 'uniqueidentifier', AllowsNull: true },
  { Name: 'RecordProcessID', Type: 'uniqueidentifier', AllowsNull: true },
  { Name: 'TargetColumn', Type: 'nvarchar', AllowsNull: true },
  { Name: 'TargetColumnSource', Type: 'nvarchar', AllowsNull: true },
  { Name: 'Mode', Type: 'nvarchar', AllowsNull: false },
  { Name: 'Status', Type: 'nvarchar', AllowsNull: false },
]);
const targetInfo = entityInfo(TARGET_ENTITY_ID, 'Memberships', [
  { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
  { Name: 'RenewalProbability', Type: 'decimal', AllowsNull: true },
]);

const childInfo = entityInfo(CHILD_ENTITY_ID, 'Dues Periods', [
  { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
  { Name: 'MembershipID', Type: 'uniqueidentifier', AllowsNull: false },
]);

const USER = new UserInfo(null, { ID: 'A0000000-0000-4000-8000-0000000000C1', Email: 'binding@example.com', Type: 'User', UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-0000000000C1', RoleID: ROLE_ID })] });

/** The C1 classification model: binary, classes in artifact order, the first class adverse. */
const c1Model: Row = { ID: MODEL_ID, PipelineID: PIPELINE_ID, Status: 'Published', ProblemType: 'classification', OutputSemantics: JSON.stringify({ task: { kind: 'binary', classOrder: ['churned', 'renewed'], adverseIndex: 0 } }) };
const existing: Row = { ID: EXISTING_ID, TargetEntityID: TARGET_ENTITY_ID, FeatureName: 'Renewal risk' };
const featurePipeline: Row = { ID: 'D0000000-0000-4000-8000-0000000000C1', Name: 'Member seniority', EntityID: TARGET_ENTITY_ID, WorkType: 'Infer', Configuration: JSON.stringify({ Outputs: [{ Ref: '$.level', Name: pipelineOutputName }] }) };

/** The default pipeline: no Prediction Unit, its target entity the bindings' (Memberships). */
const unitlessPipeline: Row = { ID: PIPELINE_ID, Name: 'C1 renewal', ProblemType: 'classification', TargetEntityID: TARGET_ENTITY_ID, PredictionUnitID: null };

/** A unit version's columns: rows of `rows`, the rest a valid binary unit. */
function unitRow(rows: UnitDraft['UnitRows']): Row {
  const columns = ProtocolRows.UnitDraftColumns({
    Name: 'renewal unit', Description: null, UnitRows: rows, LabelRule: { kind: 'column', column: 'Renewed' }, LabelWindowDays: 31, LabelGapDays: 0,
    TaskType: { kind: 'binary', classOrder: ['0', '1'], adverseIndex: 0 }, Censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2020-12-31' } },
    ChangeHistoryPolicy: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, GroupKey: null, TemporalSpec: null,
    DecisionSpec: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'year' }, IncumbentHeuristic: { kind: 'none' },
  });
  return { ...columns, ID: UNIT_ID, LineageRootID: UNIT_ID, Version: 1, LabelVersion: 1, AuthoredBy: JSON.stringify({ kind: 'human', userId: USER.ID }) };
}
/** A grain unit over Memberships: its rows are Memberships. */
const grainUnit = unitRow({ kind: 'grain', grainEntity: 'Memberships', decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] });
/** A grain-x-periods unit over Memberships' Dues Periods: its rows are Dues Periods. */
const childUnit = unitRow({ kind: 'grain-x-periods', grainEntity: 'Memberships', childEntity: 'Dues Periods', foreignKey: 'MembershipID', periodDate: 'PeriodDate', filter: [] });

/** The value of `column = '…'` in a filter, or null. */
function filterValue(filter: string, column: string): string | null {
  return new RegExp(`(?:^|\\W)${column}='([^']*)'`).exec(filter)?.[1] || null;
}

/** A data and metadata provider that records writes and serves the scoring binding's reads from memory. */
class BindingProvider implements IEntityDataProvider {
  public readonly Entities: EntityInfo[] = [bindingInfo, targetInfo, childInfo];
  public readonly Deletes: string[] = [];
  public FeatureValues: Row[] = [];
  constructor(
    private readonly bindings: Row[] = [existing], private readonly models: Row[] = [c1Model],
    private readonly pipeline: Row = unitlessPipeline, private readonly units: Row[] = [],
  ) {}
  public EntityByName(name: string): EntityInfo | undefined {
    return this.Entities.find((e) => e.Name === name);
  }
  public async RunView(params: RunViewParams): Promise<RunViewResult<Row>> {
    const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
    const rows = this.rowsFor(params.EntityName || '', filter);
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: '', UserViewRunID: '' };
  }
  public async Config(): Promise<boolean> {
    return true;
  }
  public async Load(): Promise<{}> {
    throw new Error('BindingProvider: Load is not used by these tests');
  }
  public async Save(entity: BaseEntity): Promise<{}> {
    return { ...entity.GetAll(), ID: entity.IsSaved ? entity.GetAll()['ID'] : 'C0000000-0000-4000-8000-0000000000C9' };
  }
  public async Delete(entity: BaseEntity): Promise<boolean> {
    this.Deletes.push(entity.EntityInfo.Name);
    return true;
  }
  public async GetRecordChanges(): Promise<RecordChange[]> {
    return [];
  }
  private rowsFor(entityName: string, filter: string): Row[] {
    switch (entityName) {
      case 'MJ: ML Model Scoring Bindings': {
        const self = /ID<>'([^']*)'/.exec(filter)?.[1] || '';
        return this.bindings.filter((b) => b.FeatureName === filterValue(filter, 'FeatureName') && String(b.ID).toLowerCase() !== self.toLowerCase());
      }
      case 'MJ: Record Processes': return filterValue(filter, 'EntityID') === TARGET_ENTITY_ID ? [featurePipeline] : [];
      case 'MJ: ML Models': return this.models.filter((m) => m.PipelineID === filterValue(filter, 'PipelineID') && m.Status === 'Published');
      case 'MJ: ML Training Pipelines': return filterValue(filter, 'ID') === PIPELINE_ID ? [this.pipeline] : [];
      case 'MJ: ML Prediction Units': return this.units.filter((u) => u.ID === filterValue(filter, 'ID'));
      case 'MJ: Feature Values': return this.FeatureValues.filter((v) => v.MLModelScoringBindingID === filterValue(filter, 'MLModelScoringBindingID'));
      default: throw new Error(`BindingProvider: unexpected read of ${entityName}`);
    }
  }
}

/** The binding fields a test overrides. */
type BindingFields = Partial<Record<'MLTrainingPipelineID' | 'FeatureName' | 'TargetEntityID' | 'ViewAuthorizationID' | 'TargetColumn' | 'TargetColumnSource', string | null>>;

/** A new, valid binding of the C1 pipeline on Memberships, with `fields` applied. */
async function NewBinding(provider: BindingProvider, fields: BindingFields = {}): Promise<MJMLModelScoringBindingEntityServer> {
  const row = new MJMLModelScoringBindingEntityServer(bindingInfo, provider);
  row.ContextCurrentUser = USER;
  row.NewRecord();
  row.MLTrainingPipelineID = PIPELINE_ID;
  row.FeatureName = 'Churn risk';
  row.TargetEntityID = TARGET_ENTITY_ID;
  row.ViewAuthorizationID = AUTHORIZATION_ID;
  row.Mode = 'OnDemand';
  row.Status = 'Active';
  // The overrides set nulls the generated setters' non-null types refuse, which is the case under test.
  for (const [name, value] of Object.entries(fields)) row.Set(name, value);
  return row;
}

/** A new binding saved through `provider`, withdrawn when `status` says so. */
async function SavedBinding(provider: BindingProvider, status: 'Active' | 'Withdrawn'): Promise<MJMLModelScoringBindingEntityServer> {
  const row = await NewBinding(provider);
  row.Status = status;
  if (!(await row.Save())) throw new Error(`the fixture binding did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

/** A withdrawn, saved binding that no Feature Value names. */
async function WithdrawnWithoutRows(provider: BindingProvider): Promise<MJMLModelScoringBindingEntityServer> {
  return SavedBinding(provider, 'Withdrawn');
}

describe('MJMLModelScoringBindingEntityServer — a binding defines one prediction feature', () => {
  it('requires the pipeline, feature name, target entity and view authorization', async () => {
    const b = await NewBinding(new BindingProvider(), { MLTrainingPipelineID: null, ViewAuthorizationID: null });
    const v = await b.ValidateAsync();
    expect(v.Errors.map((e) => e.Source)).toEqual(expect.arrayContaining(['MLTrainingPipelineID', 'ViewAuthorizationID']));
  });
  it('refuses a feature name used by another binding or by a Feature Pipeline output on the same entity', async () => {
    const provider = new BindingProvider();
    for (const name of [String(existing.FeatureName), pipelineOutputName]) {
      expect((await (await NewBinding(provider, { FeatureName: name })).ValidateAsync()).Success).toBe(false);
    }
    expect((await (await NewBinding(provider)).ValidateAsync()).Success).toBe(true);
  });
  it('refuses a TargetColumn without a source, and a source the model\'s semantics cannot give', async () => {
    const provider = new BindingProvider();
    expect((await (await NewBinding(provider, { TargetColumn: 'RenewalProbability', TargetColumnSource: null })).ValidateAsync()).Success).toBe(false);
    expect((await (await NewBinding(provider, { TargetColumn: 'RenewalProbability', TargetColumnSource: '$.Value' })).ValidateAsync()).Success).toBe(false); // classification model
    expect((await (await NewBinding(provider, { TargetColumn: 'RenewalProbability', TargetColumnSource: '$.Probabilities.lapsed' })).ValidateAsync()).Success).toBe(false); // not a class of the Published model
    expect((await (await NewBinding(provider, { TargetColumn: 'RenewalProbability', TargetColumnSource: '$.Probabilities.renewed' })).ValidateAsync()).Success).toBe(true);
  });
  it('refuses a TargetColumn that is not an updatable field of the target entity', async () => {
    const v = await (await NewBinding(new BindingProvider(), { TargetColumn: 'NoSuchColumn', TargetColumnSource: '$.AdverseProbability' })).ValidateAsync();
    expect(v.Errors.map((e) => [e.Source, e.Message])).toEqual([['TargetColumn', 'Target column "NoSuchColumn" is not a field of Memberships']]);
  });
  it('refuses delete of an active binding and points to withdrawal; a withdrawn binding with no rows deletes', async () => {
    const provider = new BindingProvider();
    const saved = await SavedBinding(provider, 'Active');
    expect(await saved.Delete()).toBe(false);
    expect(saved.LatestResult?.CompleteMessage).toContain('Withdraw the binding first');
    expect(await (await WithdrawnWithoutRows(provider)).Delete()).toBe(true);
    expect(provider.Deletes).toEqual(['MJ: ML Model Scoring Bindings']);
  });
  it('refuses delete of a withdrawn binding that Feature Values still name', async () => {
    const provider = new BindingProvider();
    const withdrawn = await WithdrawnWithoutRows(provider);
    provider.FeatureValues = [{ ID: 'F1', MLModelScoringBindingID: withdrawn.ID }];
    expect(await withdrawn.Delete()).toBe(false);
    expect(withdrawn.LatestResult?.CompleteMessage).toContain('Feature Value rows still name this binding');
  });
});

describe('MJMLModelScoringBindingEntityServer — the target entity is the entity its pipeline\'s models score (D4-168)', () => {
  /** Whether a binding on `entityId` saves for `provider`'s pipeline, and the TargetEntityID errors it gets. */
  async function verdict(provider: BindingProvider, entityId: string): Promise<[boolean, string[]]> {
    const v = await (await NewBinding(provider, { TargetEntityID: entityId })).ValidateAsync();
    return [v.Success, v.Errors.filter((e) => e.Source === 'TargetEntityID').map((e) => e.Message)];
  }
  const mismatch = (target: string, scoring: string): string =>
    `${target} is not the entity pipeline C1 renewal (${PIPELINE_ID})'s models score (${scoring}): every scoring run of this binding would be refused scope-entity-mismatch`;

  it('a grain-unit pipeline accepts its unit\'s grain entity and refuses another', async () => {
    const provider = new BindingProvider([existing], [c1Model], { ...unitlessPipeline, TargetEntityID: CHILD_ENTITY_ID, PredictionUnitID: UNIT_ID }, [grainUnit]);
    expect(await verdict(provider, TARGET_ENTITY_ID)).toEqual([true, []]);
    expect(await verdict(provider, CHILD_ENTITY_ID)).toEqual([false, [mismatch('Dues Periods', 'Memberships')]]);
  });
  it('a child-row unit pipeline accepts its unit\'s child entity and refuses its grain', async () => {
    const provider = new BindingProvider([existing], [c1Model], { ...unitlessPipeline, PredictionUnitID: UNIT_ID }, [childUnit]);
    expect(await verdict(provider, CHILD_ENTITY_ID)).toEqual([true, []]);
    expect(await verdict(provider, TARGET_ENTITY_ID)).toEqual([false, [mismatch('Memberships', 'Dues Periods')]]);
  });
  it('a unitless pipeline accepts its target entity and refuses another', async () => {
    const provider = new BindingProvider();
    expect(await verdict(provider, TARGET_ENTITY_ID)).toEqual([true, []]);
    expect(await verdict(provider, CHILD_ENTITY_ID)).toEqual([false, [mismatch('Dues Periods', 'Memberships')]]);
  });
  it('refuses a binding whose pipeline\'s unit does not parse, naming its errors', async () => {
    const provider = new BindingProvider([existing], [c1Model], { ...unitlessPipeline, PredictionUnitID: UNIT_ID }, [{ ...grainUnit, UnitRows: '{"kind":"nope"}' }]);
    const v = await (await NewBinding(provider)).ValidateAsync();
    const errors = v.Errors.map((e) => [e.Source, e.Message.startsWith(`Prediction Unit ${UNIT_ID} of pipeline C1 renewal (${PIPELINE_ID}) does not parse:`)]);
    expect([v.Success, errors]).toEqual([false, [['MLTrainingPipelineID', true]]]);
  });
});

describe('MJMLModelScoringBindingEntityServer.ParseCopySource', () => {
  it('reads each member of the scored result a TargetColumnSource may name, and nothing else', () => {
    const parsed = ['$.Value', ' $.Class ', '$.AdverseProbability', '$.Probabilities.Yes', '$.Probabilities.', '$.Score', 'Value']
      .map((t) => MJMLModelScoringBindingEntityServer.ParseCopySource(t));
    expect(parsed).toEqual([
      { Member: 'Value' }, { Member: 'Class' }, { Member: 'AdverseProbability' }, { Member: 'Probabilities', ClassName: 'Yes' }, null, null, null,
    ]);
  });
});
