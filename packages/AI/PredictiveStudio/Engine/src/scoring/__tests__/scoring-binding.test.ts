import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, UserInfo, type AuthorizationInfo, type BaseEntity, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';

import { BindingNotAuthorizedError, BindingWithdrawnError, ScoringBindings, ViewAuthorizationNotLoadedError, type ScoringBindingInput, type ScoringBindingMode } from '../scoring-binding';
import type { IEntityFactory } from '../../training';
import type { RegistryContext } from '../../registry/registry-context';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { GateTestProvider, GateTestStore } from '../../__tests__/fakes/gate-test-store';

/**
 * Tests for the scoring binding helpers: {@link ScoringBindings.Upsert} writes a binding of a training pipeline
 * through an injected entity factory, and {@link ScoringBindings.Withdraw} withdraws one and clears only the column
 * values it copied. The binding and Feature Value rows live in the gate test store; the target entity is a fake.
 */

interface FakeSaveResult {
  CompleteMessage: string;
}

/** The binding columns the helper writes, as an in-memory double. */
class FakeBinding {
  public ID = 'binding-1';
  public MLTrainingPipelineID = '';
  public FeatureName = '';
  public ViewAuthorizationID: string | null = null;
  public RecordProcessID: string | null = null;
  public TargetEntityID: string | null = null;
  public TargetColumn: string | null = null;
  public TargetColumnSource: string | null = null;
  public RetentionDays: number | null = null;
  public Mode: ScoringBindingMode = 'OnDemand';
  public Status: MJMLModelScoringBindingEntity['Status'] = 'Active';
  public LatestResult: FakeSaveResult | null = null;
  public SaveCallCount = 0;
  public LoadedId: string | null = null;
  public NewRecordCalled = false;
  private saveOk = true;

  public failNextSaveWith(message: string): void {
    this.saveOk = false;
    this.LatestResult = { CompleteMessage: message };
  }

  public NewRecord(): boolean {
    this.NewRecordCalled = true;
    return true;
  }

  public async Load(id: string): Promise<boolean> {
    this.LoadedId = id;
    this.ID = id;
    return id !== 'missing';
  }

  public async Save(): Promise<boolean> {
    this.SaveCallCount++;
    return this.saveOk;
  }
}

class FakeEntityFactory implements IEntityFactory {
  public readonly Bindings: FakeBinding[] = [];
  constructor(private readonly factory: () => FakeBinding = () => new FakeBinding()) {}
  async getEntityObject<T extends BaseEntity>(entityName: string, _u?: UserInfo): Promise<T> {
    if (entityName !== 'MJ: ML Model Scoring Bindings') {
      throw new Error(`unexpected entity ${entityName}`);
    }
    const b = this.factory();
    this.Bindings.push(b);
    return b as unknown as T;
  }
}

const USER = new UserInfo(null, { ID: 'A0000000-0000-4000-8000-0000000000D1', Email: 'binding@example.com', Type: 'User', UserRoles: [] });

/** A create input of the C1 pipeline on Memberships. */
function input(over: Partial<ScoringBindingInput> = {}): ScoringBindingInput {
  return {
    mlTrainingPipelineId: 'pipe-1', featureName: 'Renewal risk', viewAuthorizationId: 'auth-1', targetEntityId: 'ent-members',
    recordProcessId: 'rp-1', mode: 'OnDemand', ...over,
  };
}

describe('ScoringBindings.Upsert — create', () => {
  it('creates an Active binding of the pipeline with its feature name and view authorization', async () => {
    const factory = new FakeEntityFactory();
    const binding = (await ScoringBindings.Upsert(input({ targetColumn: 'RenewalScore', targetColumnSource: '$.AdverseProbability', retentionDays: 30 }), factory, USER)) as unknown as FakeBinding;
    expect(binding).toMatchObject({
      MLTrainingPipelineID: 'pipe-1', FeatureName: 'Renewal risk', ViewAuthorizationID: 'auth-1', TargetEntityID: 'ent-members', RecordProcessID: 'rp-1',
      TargetColumn: 'RenewalScore', TargetColumnSource: '$.AdverseProbability', RetentionDays: 30, Mode: 'OnDemand', Status: 'Active',
      NewRecordCalled: true, LoadedId: null, SaveCallCount: 1,
    });
  });

  it('creates a binding with no column (generic output) and the Scheduled mode', async () => {
    const binding = (await ScoringBindings.Upsert(input({ mode: 'Scheduled' }), new FakeEntityFactory(), USER)) as unknown as FakeBinding;
    expect(binding).toMatchObject({ TargetColumn: null, TargetColumnSource: null, Mode: 'Scheduled' });
  });
});

describe('ScoringBindings.Upsert — update', () => {
  it('loads the existing binding by id and keeps its status', async () => {
    const binding = (await ScoringBindings.Upsert(input({ bindingId: 'existing-7', recordProcessId: 'rp-2' }), new FakeEntityFactory(), USER)) as unknown as FakeBinding;
    expect(binding).toMatchObject({ LoadedId: 'existing-7', RecordProcessID: 'rp-2', Status: 'Active', NewRecordCalled: false });
  });

  it('refuses to update a Withdrawn binding with a structured error, never reactivating it', async () => {
    const factory = new FakeEntityFactory(() => Object.assign(new FakeBinding(), { Status: 'Withdrawn' as const, FeatureName: 'Renewal risk' }));
    const update = ScoringBindings.Upsert(input({ bindingId: 'existing-7' }), factory, USER);
    await expect(update).rejects.toBeInstanceOf(BindingWithdrawnError);
    await expect(update).rejects.toMatchObject({ BindingID: 'existing-7', FeatureName: 'Renewal risk' });
    expect(factory.Bindings[0]).toMatchObject({ Status: 'Withdrawn', SaveCallCount: 0 });
  });

  it('keeps the existing binding\'s custom view authorization when the update names none (R5: a re-run never widens who sees predictions)', async () => {
    const factory = new FakeEntityFactory(() => Object.assign(new FakeBinding(), { ViewAuthorizationID: 'auth-custom' }));
    const binding = (await ScoringBindings.Upsert(input({ bindingId: 'existing-7', viewAuthorizationId: undefined }), factory, USER)) as unknown as FakeBinding;
    expect(binding).toMatchObject({ ViewAuthorizationID: 'auth-custom', SaveCallCount: 1 });
  });

  it('sets the view authorization an update names explicitly', async () => {
    const factory = new FakeEntityFactory(() => Object.assign(new FakeBinding(), { ViewAuthorizationID: 'auth-custom' }));
    const binding = (await ScoringBindings.Upsert(input({ bindingId: 'existing-7', viewAuthorizationId: 'auth-2' }), factory, USER)) as unknown as FakeBinding;
    expect(binding.ViewAuthorizationID).toBe('auth-2');
  });

  it('refuses to create a binding with no view authorization, saving nothing', async () => {
    const factory = new FakeEntityFactory();
    await expect(ScoringBindings.Upsert(input({ viewAuthorizationId: undefined }), factory, USER)).rejects.toThrow(/needs a view authorization/);
    expect(factory.Bindings[0].SaveCallCount).toBe(0);
  });

  it('throws when the binding to update does not exist', async () => {
    await expect(ScoringBindings.Upsert(input({ bindingId: 'missing' }), new FakeEntityFactory(), USER)).rejects.toThrow(/scoring binding 'missing' not found/);
  });

  it('throws the CompleteMessage when Save fails', async () => {
    const errors = ConsoleCapture.Errors();
    const factory = new FakeEntityFactory(() => {
      const b = new FakeBinding();
      b.failNextSaveWith('FeatureName is already used');
      return b;
    });
    await expect(ScoringBindings.Upsert(input(), factory, USER)).rejects.toThrow(/FeatureName is already used/);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining(`ScoringBindings.Upsert: failed to save scoring binding "Renewal risk" of pipeline 'pipe-1': FeatureName is already used`)]);
  });
});

// ----- withdrawal --------------------------------------------------------------

const BINDING_ID = 'B0000000-0000-4000-8000-0000000000D1';
const MEMBERSHIPS_ID = 'E0000000-0000-4000-8000-0000000000D2';
const membershipsInfo = new EntityInfo({
  ID: MEMBERSHIPS_ID, Name: 'Memberships', SchemaName: 'dbo', BaseTable: 'Membership', BaseView: 'vwMemberships',
  EntityFields: [
    { ID: 'F0000000-0000-4000-8000-0000000000D1', EntityID: MEMBERSHIPS_ID, Name: 'ID', Type: 'nvarchar', IsPrimaryKey: true, Sequence: 1 },
    { ID: 'F0000000-0000-4000-8000-0000000000D2', EntityID: MEMBERSHIPS_ID, Name: 'RenewalProbability', Type: 'decimal', Precision: 5, Scale: 4, Sequence: 2 },
  ],
});

const VIEW_AUTH_ID = 'A0000000-0000-4000-8000-0000000000A9';
const authorizationsInfo = new EntityInfo({ ID: 'E0000000-0000-4000-8000-0000000000A8', Name: 'MJ: Authorizations', SchemaName: '__mj', BaseTable: 'Authorization', BaseView: 'vwAuthorizations' });

/** One Memberships record: its column values and the saves of the cleared ones. */
class FakeMember {
  public LatestResult: FakeSaveResult | null = null;
  constructor(private readonly target: FakeTarget, private readonly values: Record<string, number | string | null>) {}
  public Get(field: string): number | string | null {
    return this.values[field] === undefined ? null : this.values[field];
  }
  public Set(field: string, value: number | string | null): void {
    this.values[field] = value;
  }
  public async Save(): Promise<boolean> {
    this.target.Saved.push(String(this.values['ID']));
    this.target.Rows.set(String(this.values['ID']), { ...this.values });
    return true;
  }
}

/** The fake target entity: its rows by ID, the records a read returns, and the IDs saved. */
class FakeTarget {
  public readonly Saved: string[] = [];
  constructor(public readonly Rows: Map<string, Record<string, number | string | null>>) {}
  /** The RenewalProbability of each record. */
  public Values(): Record<string, number | string | null> {
    return Object.fromEntries([...this.Rows].map(([id, row]) => [id, row['RenewalProbability']]));
  }
  /** A RunView of the target entity: the records whose ID the `ID IN (…)` filter names. */
  public View(params: RunViewParams): { Success: boolean; Results: object[]; TotalRowCount: number; ErrorMessage: string } {
    const ids = [...String(params.ExtraFilter).matchAll(/'([^']*)'/g)].map((m) => m[1]);
    const results = ids.filter((id) => this.Rows.has(id)).map((id) => new FakeMember(this, { ...this.Rows.get(id)! }));
    return { Success: true, Results: results, TotalRowCount: results.length, ErrorMessage: '' };
  }
}

/** The gate store's provider, describing and serving the fake Memberships entity too. */
class WithdrawProvider extends GateTestProvider {
  constructor(store: GateTestStore, target: FakeTarget) {
    super(store);
    this.RunView = vi.fn().mockImplementation(async (params: RunViewParams, user?: UserInfo) => (params.EntityName === 'Memberships' ? target.View(params) : store.RunViewRows(params, user)));
  }
  public override EntityByName(entityName: string): EntityInfo | undefined {
    if (entityName === 'MJ: Authorizations') return authorizationsInfo;
    return entityName === 'Memberships' ? membershipsInfo : super.EntityByName(entityName);
  }
}

/** A `Champion` `Model` row of the binding: the adverse probability as of `day`. */
function modelRow(recordId: string, adverse: number, day: string): Record<string, string | number | Date | null> {
  return {
    ID: `${recordId}-${day}`, MLModelScoringBindingID: BINDING_ID, Source: 'Model', Role: 'Champion', EntityID: MEMBERSHIPS_ID, FeatureName: 'Renewal risk',
    RecordID: recordId, ValueNumeric: adverse, ValueText: 'lapsed', ValueJSON: JSON.stringify({ Probabilities: { lapsed: adverse, renewed: 1 - adverse } }),
    EffectiveAsOf: new Date(`${day}T00:00:00Z`), ComputedAt: new Date(`${day}T03:00:00Z`),
  };
}

/** A binding copying the adverse probability into RenewalProbability, three records scored, r1 twice. */
function withdrawWorld(): { readonly store: GateTestStore; readonly target: FakeTarget; readonly ctx: RegistryContext } {
  const store = new GateTestStore();
  store.Insert('MJ: ML Model Scoring Bindings', {
    ID: BINDING_ID, MLTrainingPipelineID: 'pipe-1', FeatureName: 'Renewal risk', TargetEntityID: MEMBERSHIPS_ID, TargetEntity: 'Memberships',
    TargetColumn: 'RenewalProbability', TargetColumnSource: '$.AdverseProbability', Status: 'Active', Mode: 'OnDemand', ViewAuthorizationID: VIEW_AUTH_ID,
  });
  store.Insert('MJ: Authorizations', { ID: VIEW_AUTH_ID });
  store.Insert('vwUserHeldAuthorizations', { UserID: USER.ID, AuthorizationID: VIEW_AUTH_ID });
  for (const row of [modelRow('r1', 0.31, '2026-10-01'), modelRow('r1', 0.7, '2026-11-01'), modelRow('r2', 0.55, '2026-11-01'), modelRow('r3', 0.61, '2026-11-01')]) {
    store.Insert('MJ: Feature Values', row);
  }
  const target = new FakeTarget(new Map([
    ['r1', { ID: 'r1', RenewalProbability: 0.7 }],
    ['r2', { ID: 'r2', RenewalProbability: 0.55 }],
    ['r3', { ID: 'r3', RenewalProbability: 0.42 }],   // a person entered 0.42 after the copy of 0.61
  ]));
  return { store, target, ctx: { ContextUser: USER, Provider: new WithdrawProvider(store, target) } };
}

describe('ScoringBindings.Withdraw', () => {
  it('withdrawal clears only the column values the binding copied, keeping a value a person entered since', async () => {
    const { store, target, ctx } = withdrawWorld();
    const out = await ScoringBindings.Withdraw(BINDING_ID, ctx);
    expect(out).toEqual({ Cleared: 2, KeptHuman: 1 });
    expect(target.Values()).toEqual({ r1: null, r2: null, r3: 0.42 });
    expect(store.Row('MJ: ML Model Scoring Bindings', BINDING_ID)?.['Status']).toBe('Withdrawn');
    expect(store.Transactions).toEqual(['begin', 'commit']);
  });

  it('keeps a copied value when the record holds a Human row of the feature', async () => {
    const { store, target, ctx } = withdrawWorld();
    store.Insert('MJ: Feature Values', { ID: 'h2', Source: 'Human', EntityID: MEMBERSHIPS_ID, FeatureName: 'Renewal risk', RecordID: 'r2', MLModelScoringBindingID: BINDING_ID });
    expect(await ScoringBindings.Withdraw(BINDING_ID, ctx)).toEqual({ Cleared: 1, KeptHuman: 2 });
    expect(target.Saved).toEqual(['r1']);
  });

  it('only withdraws a binding with no column copy, and rolls back when the binding is missing', async () => {
    const { store, ctx } = withdrawWorld();
    const row = store.Row('MJ: ML Model Scoring Bindings', BINDING_ID)!;
    row['TargetColumn'] = null;
    expect(await ScoringBindings.Withdraw(BINDING_ID, ctx)).toEqual({ Cleared: 0, KeptHuman: 0 });
    await expect(ScoringBindings.Withdraw('B0000000-0000-4000-8000-0000000000FF', ctx)).rejects.toThrow(/not found/);
    expect(store.Transactions).toEqual(['begin', 'commit', 'begin', 'rollback']);
  });

  it('refuses a caller who does not hold the binding\'s view authorization, before any Feature Value read, changing nothing', async () => {
    const { store, target, ctx } = withdrawWorld();
    const stranger = new UserInfo(null, { ID: 'A0000000-0000-4000-8000-0000000000D9', Email: 'stranger@example.com', Type: 'User', UserRoles: [] });
    await expect(ScoringBindings.Withdraw(BINDING_ID, { ...ctx, ContextUser: stranger })).rejects.toBeInstanceOf(BindingNotAuthorizedError);
    expect(store.Row('MJ: ML Model Scoring Bindings', BINDING_ID)?.['Status']).toBe('Active');
    expect(target.Values()).toEqual({ r1: 0.7, r2: 0.55, r3: 0.42 });
    expect(store.Reads.filter((r) => r.startsWith('view MJ: Feature Values'))).toEqual([]);
    expect(store.Transactions).toEqual(['begin', 'rollback']);
  });

  it('a column copy rounds to the column\'s scale, so a copy into a decimal(3,2) column is recognised', () => {
    const decimal32 = { Type: 'decimal', Scale: 2 };
    expect(ScoringBindings.ColumnValue(0.7123, decimal32)).toBe(0.71);
    expect(ScoringBindings.IsCopiedValue(0.71, ScoringBindings.ColumnValue(0.7123, decimal32))).toBe(true);
    expect(ScoringBindings.IsCopiedValue(0.71, 0.7123)).toBe(false);
    expect(ScoringBindings.ColumnValue(0.7123, { Type: 'float', Scale: 0 })).toBe(0.7123);
    expect(ScoringBindings.ColumnValue(2.6, { Type: 'int', Scale: 0 })).toBe(3);
    expect(ScoringBindings.ColumnValue('lapsed', decimal32)).toBe('lapsed');
  });

  it('reads a model row as the scored result its copy source resolves against', () => {
    const scored = ScoringBindings.ScoredValue({ ValueNumeric: 0.2, ValueText: 'lapsed', ValueJSON: JSON.stringify({ Probabilities: { lapsed: 0.2, renewed: 0.8 } }) });
    expect(ScoringBindings.ResolveCopySource('$.Probabilities.renewed', scored)).toBe(0.8);
    expect(ScoringBindings.ResolveCopySource('$.Class', scored)).toBe('lapsed');
    expect(ScoringBindings.ResolveCopySource('$.Value', ScoringBindings.ScoredValue({ ValueNumeric: 1234.5, ValueText: null, ValueJSON: null }))).toBe(1234.5);
  });
});

describe('ScoringBindings.ResolveViewAuthorizationID', () => {
  /** A provider whose metadata cache holds `authorizations`. */
  const withAuthorizations = (authorizations: ReadonlyArray<Pick<AuthorizationInfo, 'ID' | 'Name'>>): IMetadataProvider =>
    ({ Authorizations: authorizations }) as unknown as IMetadataProvider;

  it('keeps an explicit authorization and otherwise defaults to the seeded one, matched by name', () => {
    const provider = withAuthorizations([{ ID: 'auth-other', Name: 'Other' }, { ID: 'auth-seeded', Name: ' view model predictions ' }]);
    expect(ScoringBindings.ResolveViewAuthorizationID('auth-explicit', provider)).toBe('auth-explicit');
    expect(ScoringBindings.ResolveViewAuthorizationID(undefined, provider)).toBe('auth-seeded');
    expect(ScoringBindings.ResolveViewAuthorizationID('  ', provider)).toBe('auth-seeded');
  });

  it('ViewAuthorizationForUpsert: an explicit one always; none for an update (keep the stored one); the seeded one for a create', () => {
    const provider = withAuthorizations([{ ID: 'auth-seeded', Name: 'View Model Predictions' }]);
    expect(ScoringBindings.ViewAuthorizationForUpsert(' auth-explicit ', 'existing-7', provider)).toBe('auth-explicit');
    expect(ScoringBindings.ViewAuthorizationForUpsert(null, 'existing-7', provider)).toBeUndefined();
    expect(ScoringBindings.ViewAuthorizationForUpsert(undefined, undefined, provider)).toBe('auth-seeded');
  });

  it('refuses with a typed error naming the authorization when it is not loaded (never a silent null)', () => {
    const resolve = (): string => ScoringBindings.ResolveViewAuthorizationID(null, withAuthorizations([]));
    expect(resolve).toThrow(ViewAuthorizationNotLoadedError);
    expect(resolve).toThrow(/'View Model Predictions' authorization is not in the metadata/);
  });
});
