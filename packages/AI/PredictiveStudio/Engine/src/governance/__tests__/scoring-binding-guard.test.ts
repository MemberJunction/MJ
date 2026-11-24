/**
 * `PredictiveStudioScoringBindingGuard` (review question 4 of PR #6517): a binding's `Status` changes only through
 * `ScoringBindings.Withdraw` (a one-shot authorisation of `Active → Withdrawn`), and its `ViewAuthorizationID` only for a
 * caller who holds the stored authorization (D4-60).
 *
 * The hook is the one the Engine entry point registered; the binding is the real generated entity over a hand-built
 * EntityInfo, loaded as saved, and its stored row, the authorization and the held-authorization view are the gate test
 * store's in-memory rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityInfo, UserInfo, type PreSaveHook } from '@memberjunction/core';
import { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';

import {
  PredictiveStudioScoringBindingGuard, PreSaveHookRegistration, ScoringBindings, ScoringBindingStatusAuthorisations,
  ScoringBindingAuthorizationBackfills,
} from '../../index';
import { GateTestStore } from '../../__tests__/fakes/gate-test-store';
import { GuardTestProvider } from '../../__tests__/fakes/guard-test-world';

const BINDING_ENTITY_ID = 'E0000000-0000-4000-8000-0000000008B1';
const BINDING_ID = 'B0000000-0000-4000-8000-0000000008B1';
const HELD_AUTH = 'A0000000-0000-4000-8000-0000000008A1';
const OTHER_AUTH = 'A0000000-0000-4000-8000-0000000008A2';
const USER = new UserInfo(null, { ID: 'A0000000-0000-4000-8000-0000000008F1', Email: 'binder@example.com', Type: 'User', UserRoles: [] });
const STRANGER = new UserInfo(null, { ID: 'A0000000-0000-4000-8000-0000000008F2', Email: 'stranger@example.com', Type: 'User', UserRoles: [] });
const COLUMNS = ['MLTrainingPipelineID', 'FeatureName', 'TargetEntityID', 'ViewAuthorizationID', 'Status', 'Mode', 'TargetColumn', 'TargetColumnSource', 'RetentionDays', 'RecordProcessID'];

const bindingInfo = new EntityInfo({
  ID: BINDING_ENTITY_ID, Name: 'MJ: ML Model Scoring Bindings', SchemaName: '__mj', BaseTable: 'MLModelScoringBinding', BaseView: 'vwMLModelScoringBindings',
  Status: 'Active', IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, TrackRecordChanges: false, EnableFieldLevelSecurity: false,
  EntityFields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }, ...COLUMNS.map((Name) => ({ Name, Type: Name === 'RetentionDays' ? 'int' : 'nvarchar', IsPrimaryKey: false }))]
    .map((c, i) => ({ ID: `F0000000-0000-4000-8000-000000000${(800 + i).toString()}`, EntityID: BINDING_ENTITY_ID, Sequence: i + 1, Length: 0, Precision: 0, Scale: 0, AllowsNull: true, AllowUpdateAPI: true, ...c })),
});
const authorizationsInfo = new EntityInfo({ ID: 'E0000000-0000-4000-8000-0000000008A8', Name: 'MJ: Authorizations', SchemaName: '__mj', BaseTable: 'Authorization', BaseView: 'vwAuthorizations' });

/** The guard tests' provider, describing `MJ: Authorizations` too (the held-authorization check reads its schema). */
class BindingGuardProvider extends GuardTestProvider {
  public override EntityByName(entityName: string): EntityInfo | undefined {
    return entityName === 'MJ: Authorizations' ? authorizationsInfo : super.EntityByName(entityName);
  }
}

const Hook: PreSaveHook = (entity, user) => {
  const hook = PreSaveHookRegistration.HooksMarked(PredictiveStudioScoringBindingGuard.HookMark)[0];
  if (hook === undefined) throw new Error('the Engine entry point did not register the scoring binding guard');
  return hook(entity, user);
};

let store: GateTestStore;
let provider: BindingGuardProvider;

/** The stored binding as a real, saved entity of `user`. */
function LoadBinding(user: UserInfo): MJMLModelScoringBindingEntity {
  const b = new MJMLModelScoringBindingEntity(bindingInfo, provider);
  b.ContextCurrentUser = user;
  const row = store.Row('MJ: ML Model Scoring Bindings', BINDING_ID);
  if (!row) throw new Error('no stored binding');
  b.SetMany({ ...row }, false, true);
  return b;
}

beforeEach(() => {
  store = new GateTestStore();
  provider = new BindingGuardProvider(store);
  store.Insert('MJ: ML Model Scoring Bindings', {
    ID: BINDING_ID, MLTrainingPipelineID: 'B0000000-0000-4000-8000-0000000008C1', FeatureName: 'Renewal risk', TargetEntityID: 'E0000000-0000-4000-8000-0000000008D1',
    ViewAuthorizationID: HELD_AUTH, Status: 'Active', Mode: 'OnDemand', TargetColumn: null, TargetColumnSource: null, RetentionDays: null, RecordProcessID: null,
  });
  store.Insert('MJ: Authorizations', { ID: HELD_AUTH });
  store.Insert('MJ: Authorizations', { ID: OTHER_AUTH });
  store.Insert('vwUserHeldAuthorizations', { UserID: USER.ID, AuthorizationID: HELD_AUTH });
  store.Insert('vwUserHeldAuthorizations', { UserID: STRANGER.ID, AuthorizationID: OTHER_AUTH });
});

describe('PredictiveStudioScoringBindingGuard — Status changes only through ScoringBindings.Withdraw', () => {
  it('refuses a plain save that withdraws a binding (its column copies would stay)', async () => {
    const b = LoadBinding(USER);
    b.Status = 'Withdrawn';
    expect(await Hook(b, USER)).toContain('changed only by ScoringBindings.Withdraw');
  });
  it('refuses a plain save that reactivates a withdrawn binding, even with OldValue reset', async () => {
    store.Row('MJ: ML Model Scoring Bindings', BINDING_ID)!['Status'] = 'Withdrawn';
    const b = LoadBinding(USER);
    b.SetMany({ Status: 'Active' }, false, true);   // replaceOldValues: the guard reads the stored row, not OldValue
    expect(await Hook(b, USER)).toContain('Status Withdrawn → Active');
  });
  it('allows the authorised Active → Withdrawn once, and refuses a mismatched authorisation', async () => {
    const b = LoadBinding(USER);
    b.Status = 'Withdrawn';
    ScoringBindingStatusAuthorisations.Instance.Authorise(b, { From: 'Active', To: 'Withdrawn' });
    expect(await Hook(b, USER)).toBe(true);
    expect(await Hook(b, USER)).toContain('changed only by ScoringBindings.Withdraw');
    ScoringBindingStatusAuthorisations.Instance.Authorise(b, { From: 'Withdrawn', To: 'Active' });
    expect(await Hook(b, USER)).toContain('changed only by ScoringBindings.Withdraw');
  });
  it('allows a save that changes neither column, and a create', async () => {
    const b = LoadBinding(USER);
    b.RetentionDays = 90;
    expect(await Hook(b, USER)).toBe(true);
    const fresh = new MJMLModelScoringBindingEntity(bindingInfo, provider);
    fresh.NewRecord();
    fresh.Status = 'Withdrawn';
    expect(await Hook(fresh, USER)).toBe(true);
  });
  it('fails closed when the stored row is gone', async () => {
    const b = LoadBinding(USER);
    store.Tables['MJ: ML Model Scoring Bindings'] = [];
    b.Status = 'Withdrawn';
    expect(await Hook(b, USER)).toContain('fail closed');
  });
});

describe('PredictiveStudioScoringBindingGuard — ViewAuthorizationID changes only for a caller holding the stored one', () => {
  it('refuses a caller who does not hold the binding\'s authorization re-pointing it to one they hold', async () => {
    const b = LoadBinding(STRANGER);
    b.ViewAuthorizationID = OTHER_AUTH;
    expect(await Hook(b, STRANGER)).toContain('holds the binding\'s current view authorization');
  });
  it('allows a caller who holds it to change it (the binding editor\'s plain save)', async () => {
    const b = LoadBinding(USER);
    b.ViewAuthorizationID = OTHER_AUTH;
    expect(await Hook(b, USER)).toBe(true);
  });
});

describe('PredictiveStudioScoringBindingGuard — the retention job\'s backfill assigns a missing view authorization (D4-28)', () => {
  /** The stored binding without a view authorization (a pre-D4-28 binding the daily backfill assigns). */
  function UnauthorizedBinding(user: UserInfo): MJMLModelScoringBindingEntity {
    const row = store.Row('MJ: ML Model Scoring Bindings', BINDING_ID);
    if (!row) throw new Error('no stored binding');
    row['ViewAuthorizationID'] = null;
    return LoadBinding(user);
  }

  it('allows the backfill-authorised assignment once, to exactly the authorised authorization', async () => {
    const b = UnauthorizedBinding(STRANGER);
    b.ViewAuthorizationID = HELD_AUTH;
    ScoringBindingAuthorizationBackfills.Instance.Authorise(b, HELD_AUTH);
    expect(await Hook(b, STRANGER)).toBe(true);
    expect(await Hook(b, STRANGER)).toContain('holds the binding\'s current view authorization');
  });

  it('refuses an unauthorised assignment, and an authorisation naming another authorization', async () => {
    const b = UnauthorizedBinding(STRANGER);
    b.ViewAuthorizationID = HELD_AUTH;
    expect(await Hook(b, STRANGER)).toContain('holds the binding\'s current view authorization');
    ScoringBindingAuthorizationBackfills.Instance.Authorise(b, OTHER_AUTH);
    expect(await Hook(b, STRANGER)).toContain('holds the binding\'s current view authorization');
  });

  it('never lets a backfill authorisation replace an authorization the binding already has', async () => {
    const b = LoadBinding(STRANGER);
    b.ViewAuthorizationID = OTHER_AUTH;
    ScoringBindingAuthorizationBackfills.Instance.Authorise(b, OTHER_AUTH);
    expect(await Hook(b, STRANGER)).toContain('holds the binding\'s current view authorization');
  });
});

describe('ScoringBindings.Withdraw — the one writer of a binding\'s Status', () => {
  it('authorises exactly Active → Withdrawn for the binding it saves, and leaves no authorisation behind', async () => {
    const authorise = vi.spyOn(ScoringBindingStatusAuthorisations.Instance, 'Authorise');
    try {
      expect(await ScoringBindings.Withdraw(BINDING_ID, { ContextUser: USER, Provider: provider })).toEqual({ Cleared: 0, KeptHuman: 0 });
      expect(authorise.mock.calls.map(([, change]) => change)).toEqual([{ From: 'Active', To: 'Withdrawn' }]);
      const [[saved]] = authorise.mock.calls;
      expect(ScoringBindingStatusAuthorisations.Instance.Take(saved)).toBeNull();
      expect(store.Row('MJ: ML Model Scoring Bindings', BINDING_ID)?.['Status']).toBe('Withdrawn');
    } finally {
      authorise.mockRestore();
    }
  });
});
