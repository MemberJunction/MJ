/**
 * `PredictiveStudioPublishRecordGuard` (review item 1 of PR #6517): `MJ: ML Model Publish Records` rows are created only
 * by their writers (`SignOffService`, `PublishRecords`) under a one-shot `PublishRecordWriteAuthorisations` entry, and
 * the ledger is append-only: a saved row is never changed and never deleted.
 *
 * The entities are the real generated class over a hand-built EntityInfo, so `Save()` and `Delete()` are BaseEntity's
 * own and run the hooks the Engine entry point registered; the data provider accepts every write it is handed, so a
 * refusal can only come from the guard.
 */
import { describe, expect, it } from 'vitest';
import { EntityInfo, UserInfo, UserRoleInfo, type BaseEntity, type IEntityDataProvider, type RecordChange } from '@memberjunction/core';
import { MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';

import { PredictiveStudioPublishRecordGuard, PreSaveHookRegistration, PublishRecordWriteAuthorisations, type PublishRecordKind } from '../../index';

const ENTITY_ID = 'E0000000-0000-4000-8000-0000000007F1';
const ROLE_ID = 'E1000000-0000-4000-8000-0000000007F1';
const MODEL_ID = 'B0000000-0000-4000-8000-0000000007F1';
const COLUMNS = [
  'ModelID', 'TrainingRunID', 'Kind', 'Purpose', 'ApproverKind', 'UserID', 'Initiator', 'RecordedAt', 'Decision', 'Reason',
  'GateDecision', 'Evidence', 'EvidenceSha256', 'OverridesFlags', 'SignOffID', 'ReplacesModelID', 'Refusal', 'Transient',
];
const USER = new UserInfo(null, {
  ID: 'A0000000-0000-4000-8000-0000000007F1', Email: 'person@example.com', Type: 'User',
  UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-0000000007F1', RoleID: ROLE_ID })],
});

/** `MJ: ML Model Publish Records` with its columns, the API open, and one role (the user's) with every permission. */
function publishRecordEntityInfo(name = 'MJ: ML Model Publish Records'): EntityInfo {
  const fields = [{ Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true }, ...COLUMNS.map((Name) => ({
    Name, Type: Name === 'Transient' ? 'bit' : Name === 'RecordedAt' ? 'datetimeoffset' : 'nvarchar', AllowsNull: true, IsPrimaryKey: false,
  }))];
  return new EntityInfo({
    ID: ENTITY_ID, Name: name, SchemaName: '__mj', BaseTable: 'MLModelPublishRecord', BaseView: 'vwMLModelPublishRecords',
    Status: 'Active', IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, TrackRecordChanges: false, EnableFieldLevelSecurity: false,
    EntityPermissions: [{ ID: 'P0000000-0000-4000-8000-0000000007F1', EntityID: ENTITY_ID, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }],
    EntityFields: fields.map((c, i) => ({ ID: `F0000000-0000-4000-8000-000000000${(700 + i).toString()}`, EntityID: ENTITY_ID, Sequence: i + 1, Length: 0, Precision: 0, Scale: 0, AllowUpdateAPI: true, ...c })),
  });
}

/** A data provider that accepts every save and delete; it records how many writes reached it. */
class AcceptingProvider implements IEntityDataProvider {
  public Writes = 0;
  public async Config(): Promise<boolean> {
    return true;
  }
  public async Load(): Promise<{}> {
    throw new Error('AcceptingProvider: Load is not used by these tests');
  }
  public async Save(entity: BaseEntity): Promise<{}> {
    this.Writes++;
    const values = entity.GetAll();
    return { ...values, ID: values['ID'] || 'C0000000-0000-4000-8000-0000000007F1' };
  }
  public async Delete(): Promise<boolean> {
    this.Writes++;
    return true;
  }
  public async GetRecordChanges(): Promise<RecordChange[]> {
    return [];
  }
}

/** A new sign-off row, filled as SignOffService fills one, on `provider`. */
function NewSignOff(provider: IEntityDataProvider): MJMLModelPublishRecordEntity {
  const r = new MJMLModelPublishRecordEntity(publishRecordEntityInfo(), provider);
  r.ContextCurrentUser = USER;
  r.NewRecord();
  r.ModelID = MODEL_ID;
  r.Kind = 'sign-off';
  r.Purpose = 'publish';
  r.ApproverKind = 'user';
  r.UserID = USER.ID;
  r.Initiator = JSON.stringify({ kind: 'human', userId: USER.ID });
  r.Decision = 'approve';
  r.Reason = 'reviewed';
  r.Evidence = '{}';
  r.EvidenceSha256 = 'a'.repeat(64);
  r.OverridesFlags = '[]';
  return r;
}

/** A sign-off saved through its writer's authorisation, as SignOffService saves one. */
async function SavedSignOff(provider: IEntityDataProvider): Promise<MJMLModelPublishRecordEntity> {
  const r = NewSignOff(provider);
  if (!(await PublishRecordWriteAuthorisations.SaveNew(r))) throw new Error(`the fixture did not save: ${r.LatestResult?.CompleteMessage}`);
  return r;
}

describe('PredictiveStudioPublishRecordGuard — a publish record is created only by its writer', () => {
  it('the Engine entry point registers the PreSave and the PreDelete hook', () => {
    expect(PreSaveHookRegistration.HooksMarked(PredictiveStudioPublishRecordGuard.HookMark)).toHaveLength(1);
    expect(PreSaveHookRegistration.PreDeleteHooksMarked(PredictiveStudioPublishRecordGuard.DeleteHookMark)).toHaveLength(1);
  });

  it('(a) refuses a sign-off row saved any other way than through SignOffService — nothing reaches the database', async () => {
    const provider = new AcceptingProvider();
    const forged = NewSignOff(provider);
    expect(await forged.Save()).toBe(false);
    expect(forged.LatestResult?.CompleteMessage).toContain('publish record guard');
    expect(forged.LatestResult?.CompleteMessage).toContain('SignOffService');
    expect(provider.Writes).toBe(0);
  });

  it('refuses a publish or refusal row saved directly too', async () => {
    for (const kind of ['publish', 'refusal'] as const satisfies readonly PublishRecordKind[]) {
      const provider = new AcceptingProvider();
      const r = NewSignOff(provider);
      r.Kind = kind;
      expect(await r.Save()).toBe(false);
      expect(provider.Writes).toBe(0);
    }
  });

  it('saves a row its writer authorised, once: the authorisation does not outlive the save', async () => {
    const provider = new AcceptingProvider();
    const r = await SavedSignOff(provider);
    expect(provider.Writes).toBe(1);
    expect(PublishRecordWriteAuthorisations.Instance.TakeCreate(r)).toBeNull();
  });

  it('refuses a row whose writer authorised another kind', async () => {
    const provider = new AcceptingProvider();
    const r = NewSignOff(provider);
    PublishRecordWriteAuthorisations.Instance.AuthoriseCreate(r, 'refusal');
    expect(await r.Save()).toBe(false);
    expect(r.LatestResult?.CompleteMessage).toContain('authorised a refusal record, not a sign-off record');
    expect(provider.Writes).toBe(0);
  });
});

describe('PredictiveStudioPublishRecordGuard — the ledger is append-only', () => {
  it('(c) refuses an update of a saved record, authorised or not', async () => {
    const provider = new AcceptingProvider();
    const r = await SavedSignOff(provider);
    r.Decision = 'reject';
    expect(await r.Save()).toBe(false);
    PublishRecordWriteAuthorisations.Instance.AuthoriseCreate(r, 'sign-off');
    expect(await r.Save()).toBe(false);
    expect(r.LatestResult?.CompleteMessage).toContain('append-only');
    expect(provider.Writes).toBe(1);
  });

  it('(c) refuses a delete of a record', async () => {
    const provider = new AcceptingProvider();
    const r = await SavedSignOff(provider);
    expect(await r.Delete()).toBe(false);
    expect(r.LatestResult?.CompleteMessage).toContain('append-only');
    expect(provider.Writes).toBe(1);
  });

  it('allows one authorised delete (the harness cleanup of its own rows) and no second', async () => {
    const provider = new AcceptingProvider();
    const r = await SavedSignOff(provider);
    PublishRecordWriteAuthorisations.Instance.AuthoriseDelete(r);
    expect(PredictiveStudioPublishRecordGuard.CheckDelete(r)).toBe(true);
    expect(PredictiveStudioPublishRecordGuard.CheckDelete(r)).toContain('append-only');
  });

  it('passes every other entity', () => {
    const other = new MJMLModelPublishRecordEntity(publishRecordEntityInfo('MJ: Some Other Entity'), new AcceptingProvider());
    other.NewRecord();
    expect(PredictiveStudioPublishRecordGuard.CheckSave(other)).toBe(true);
    expect(PredictiveStudioPublishRecordGuard.CheckDelete(other)).toBe(true);
  });
});
