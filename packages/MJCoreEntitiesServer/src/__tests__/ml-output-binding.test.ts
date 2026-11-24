/**
 * `MJMLOutputBindingEntityServer` (PR 4 §5.1, Task M4.2): a save of an output binding whose surface's fields break the
 * model's `OutputSemantics` is refused, each mismatch on the field at fault; the model's semantics are read through the
 * entity's own provider.
 *
 * The entity is the real class over a hand-built EntityInfo, so dirty tracking, `ValidateAsync()` and `Save()` are
 * BaseEntity's own; the provider records saves instead of writing them and answers the model read from memory.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  EntityInfo, UserInfo, UserRoleInfo, type BaseEntity, type IEntityDataProvider, type RecordChange, type RunViewParams, type RunViewResult,
} from '@memberjunction/core';
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import type { OutputSemantics } from '@memberjunction/predictive-studio-core';

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: object) => target };
});

import { MJMLOutputBindingEntityServer } from '../custom/MJMLOutputBindingEntityServer.server';

const ENTITY_ID = 'E0000000-0000-4000-8000-0000000000B1';
const ROLE_ID = 'E1000000-0000-4000-8000-0000000000B1';
const MODEL_ID = 'B0000000-0000-4000-8000-0000000000B1';
const COLUMNS = ['ModelID', 'Surface', 'SortsBy', 'DriverDirectionRelativeTo', 'Label'];

const c3: OutputSemantics = { task: { kind: 'multiclass', classOrder: ['Bronze', 'Silver', 'Gold'], adverseIndices: [0] } };
/** The C3 model row the provider serves: its ID and its semantics. */
const c3Model: Pick<MJMLModelEntity, 'ID' | 'OutputSemantics'> = { ID: MODEL_ID, OutputSemantics: JSON.stringify(c3) };

/** `MJ: ML Output Bindings` as the tests need it: its columns, the API open, one role with every permission. */
function bindingEntityInfo(): EntityInfo {
  const fields = [{ Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true }, ...COLUMNS.map((Name) => ({ Name, Type: 'nvarchar', AllowsNull: false }))];
  return new EntityInfo({
    ID: ENTITY_ID, Name: 'MJ: ML Output Bindings', SchemaName: '__mj', BaseTable: 'MLOutputBinding', BaseView: 'vwMLOutputBindings',
    Status: 'Active', IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, TrackRecordChanges: false, EnableFieldLevelSecurity: false,
    EntityPermissions: [{ ID: 'P0000000-0000-4000-8000-0000000000B1', EntityID: ENTITY_ID, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }],
    EntityFields: fields.map((c, i) => ({ ID: `F0000000-0000-4000-8000-0000000000${(10 + i).toString()}`, EntityID: ENTITY_ID, Sequence: i + 1, Length: 0, Precision: 0, Scale: 0, AllowUpdateAPI: true, ...c })),
  });
}

const USER = new UserInfo(null, { ID: 'A0000000-0000-4000-8000-0000000000B1', Email: 'gate@example.com', Type: 'User', UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-0000000000B1', RoleID: ROLE_ID })] });

/** A row of the model read the subclass makes. */
type ModelRow = Pick<MJMLModelEntity, 'ID' | 'OutputSemantics'>;

/**
 * A data provider that accepts every save (recording it) and is a metadata provider whose `RunView` serves the given
 * models; the members the tests do not reach throw.
 */
class RecordingProvider implements IEntityDataProvider {
  public readonly Saves: string[] = [];
  public readonly Reads: RunViewParams[] = [];
  public readonly Entities: EntityInfo[] = [];
  constructor(private readonly models: readonly ModelRow[], private readonly failReads = false) {}
  public EntityByName(): EntityInfo | undefined {
    return undefined;
  }
  public async RunView(params: RunViewParams): Promise<RunViewResult<ModelRow>> {
    this.Reads.push(params);
    const id = /ID='([^']*)'/.exec(typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '')?.[1] || '';
    const rows = this.failReads ? [] : this.models.filter((m) => m.ID.toLowerCase() === id.toLowerCase());
    return { Success: !this.failReads, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 0, ErrorMessage: this.failReads ? 'connection lost' : '', UserViewRunID: '' };
  }
  public async Config(): Promise<boolean> {
    return true;
  }
  public async Load(): Promise<{}> {
    throw new Error('RecordingProvider: Load is not used by these tests');
  }
  public async Save(entity: BaseEntity): Promise<{}> {
    this.Saves.push(entity.EntityInfo.Name);
    return { ...entity.GetAll(), ID: 'C0000000-0000-4000-8000-0000000000B1' };
  }
  public async Delete(): Promise<boolean> {
    throw new Error('RecordingProvider: Delete is not used by these tests');
  }
  public async GetRecordChanges(): Promise<RecordChange[]> {
    return [];
  }
}

/** A data provider that is not a metadata provider. */
class DataOnlyProvider implements IEntityDataProvider {
  public async Config(): Promise<boolean> {
    return true;
  }
  public async Load(): Promise<{}> {
    throw new Error('DataOnlyProvider: Load is not used');
  }
  public async Save(entity: BaseEntity): Promise<{}> {
    return { ...entity.GetAll(), ID: 'C0000000-0000-4000-8000-0000000000B2' };
  }
  public async Delete(): Promise<boolean> {
    throw new Error('DataOnlyProvider: Delete is not used');
  }
  public async GetRecordChanges(): Promise<RecordChange[]> {
    return [];
  }
}

/** A new binding of `surface` for `model`, filled with the C3 default for that surface. */
function NewBinding(provider: IEntityDataProvider, model: ModelRow, surface: MJMLOutputBindingEntityServer['Surface']): MJMLOutputBindingEntityServer {
  const row = new MJMLOutputBindingEntityServer(bindingEntityInfo(), provider);
  row.ContextCurrentUser = USER;
  row.NewRecord();
  row.ModelID = model.ID;
  row.Surface = surface;
  row.SortsBy = surface === 'at-risk-list' || surface === 'predictions-grid' ? 'adverse-probability-desc' : 'none';
  row.DriverDirectionRelativeTo = 'adverse-class';
  row.Label = 'Bronze risk';
  return row;
}

/** The default `surface` binding of the C3 model, saved through `provider`. */
async function SavedBinding(provider: IEntityDataProvider, model: ModelRow, surface: MJMLOutputBindingEntityServer['Surface']): Promise<MJMLOutputBindingEntityServer> {
  const row = NewBinding(provider, model, surface);
  if (!(await row.Save())) throw new Error(`the fixture binding did not save: ${row.LatestResult?.CompleteMessage}`);
  return row;
}

describe('MJMLOutputBindingEntityServer — a binding must agree with its model’s semantics', () => {
  it('Validate() refuses an edited row whose sort breaks the semantics', async () => {
    const provider = new RecordingProvider([c3Model]);
    const row = await SavedBinding(provider, c3Model, 'at-risk-list');
    row.SortsBy = 'score-asc';
    expect((await row.ValidateAsync()).Success).toBe(false);
  });
  it('names the field at fault in the rule’s words, and refuses the save itself', async () => {
    const provider = new RecordingProvider([c3Model]);
    const row = await SavedBinding(provider, c3Model, 'at-risk-list');
    row.SortsBy = 'score-asc';
    row.Label = 'Gold risk';
    const result = await row.ValidateAsync();
    expect(result.Errors.map((e) => [e.Source, e.Message])).toEqual([
      ['SortsBy', 'at-risk-list: SortsBy is score-asc, the semantics require adverse-probability-desc'],
      ['Label', 'at-risk-list: Label is "Gold risk", the semantics require a label naming Bronze and no other class'],
    ]);
    expect(await row.Save()).toBe(false);
    expect(row.LatestResult?.CompleteMessage).toContain('at-risk-list: SortsBy is score-asc');
    expect(provider.Saves).toEqual(['MJ: ML Output Bindings']);
  });
  it("saves the default rows and an edit that keeps the semantics, reading the model through the entity's provider", async () => {
    const provider = new RecordingProvider([c3Model]);
    for (const surface of ['at-risk-list', 'why-badge', 'predictions-grid', 'record-panel'] as const) await SavedBinding(provider, c3Model, surface);
    const row = await SavedBinding(provider, c3Model, 'why-badge');
    row.Label = 'Why this one may end up Bronze';
    expect(await row.Save()).toBe(true);
    expect(provider.Saves).toHaveLength(6);
    expect(provider.Reads[0]).toMatchObject({ EntityName: 'MJ: ML Models', Fields: ['ID', 'OutputSemantics'], ResultType: 'simple' });
  });
  it('checks only its own surface: a lone row passes though the other three surfaces have none', async () => {
    const row = NewBinding(new RecordingProvider([c3Model]), c3Model, 'record-panel');
    expect((await row.ValidateAsync()).Success).toBe(true);
  });
  it('refuses on ModelID when the model is missing, its read fails or its semantics do not parse', async () => {
    const messages = async (provider: IEntityDataProvider) => (await NewBinding(provider, c3Model, 'record-panel').ValidateAsync()).Errors.map((e) => [e.Source, e.Message]);
    expect(await messages(new RecordingProvider([]))).toEqual([['ModelID', `ML Model ${MODEL_ID} does not exist, so the binding cannot be checked against its semantics`]]);
    expect(await messages(new RecordingProvider([c3Model], true))).toEqual([['ModelID', `Reading ML Model ${MODEL_ID} failed: connection lost`]]);
    expect(await messages(new RecordingProvider([{ ID: MODEL_ID, OutputSemantics: '{"task":{"kind":"sideways"}}' }]))).toEqual([
      ['ModelID', `ML Model ${MODEL_ID}'s OutputSemantics does not parse: TaskType kind "sideways" is not one of binary, multiclass, continuous, count, non-negative, forecast`],
    ]);
  });
  it('refuses on a provider that is not a metadata provider, never reaching for the global one', async () => {
    const result = await NewBinding(new DataOnlyProvider(), c3Model, 'record-panel').ValidateAsync();
    expect(result.Errors.map((e) => [e.Source, e.Message])).toEqual([
      ['ModelID', "the entity's provider is not a metadata provider, so ML Model's OutputSemantics cannot be read to check the binding"],
    ]);
  });
});
