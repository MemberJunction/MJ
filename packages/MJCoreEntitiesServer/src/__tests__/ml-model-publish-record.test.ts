/**
 * `MJMLModelPublishRecordEntityServer` (PR 4 §5.1, Task M3.2): publish records are an immutable ledger, so `Validate()`
 * refuses any update of a saved row, while a new row and a saved row with no change pass.
 *
 * The entity is the real class over a hand-built EntityInfo, so dirty tracking and `Save()` are BaseEntity's own; the
 * data provider records saves instead of writing them.
 */
import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, UserInfo, UserRoleInfo, type BaseEntity, type IEntityDataProvider, type RecordChange } from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: object) => target };
});

import { MJMLModelPublishRecordEntityServer } from '../custom/MJMLModelPublishRecordEntityServer.server';

const ENTITY_ID = 'E0000000-0000-4000-8000-0000000000F1';
const ROLE_ID = 'E1000000-0000-4000-8000-0000000000F1';
const COLUMNS = [
  'ModelID', 'TrainingRunID', 'Kind', 'Purpose', 'ApproverKind', 'UserID', 'Initiator', 'RecordedAt', 'Decision', 'Reason',
  'GateDecision', 'Evidence', 'EvidenceSha256', 'OverridesFlags', 'SignOffID', 'ReplacesModelID', 'Refusal', 'Transient',
];

/** `MJ: ML Model Publish Records` as the tests need it: the columns the gate writes, the API open, one role with every permission. */
function publishRecordEntityInfo(): EntityInfo {
  const fields = [{ Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true }, ...COLUMNS.map((Name) => ({
    Name, Type: Name === 'Transient' ? 'bit' : Name === 'RecordedAt' ? 'datetimeoffset' : 'nvarchar', AllowsNull: true,
  }))];
  return new EntityInfo({
    ID: ENTITY_ID, Name: 'MJ: ML Model Publish Records', SchemaName: '__mj', BaseTable: 'MLModelPublishRecord', BaseView: 'vwMLModelPublishRecords',
    Status: 'Active', IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, TrackRecordChanges: false, EnableFieldLevelSecurity: false,
    EntityPermissions: [{ ID: 'P0000000-0000-4000-8000-0000000000F1', EntityID: ENTITY_ID, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }],
    EntityFields: fields.map((c, i) => ({ ID: `F0000000-0000-4000-8000-0000000000${(10 + i).toString()}`, EntityID: ENTITY_ID, Sequence: i + 1, Length: 0, Precision: 0, Scale: 0, AllowUpdateAPI: true, ...c })),
  });
}

const USER = new UserInfo(null, { ID: 'A0000000-0000-4000-8000-0000000000F1', Email: 'gate@example.com', Type: 'User', UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-0000000000F1', RoleID: ROLE_ID })] });

/** A data provider that accepts every save, giving a new row its ID; the members the tests do not reach throw. */
class AcceptingProvider implements IEntityDataProvider {
  public async Config(): Promise<boolean> {
    return true;
  }
  public async Load(): Promise<{}> {
    throw new Error('AcceptingProvider: Load is not used by these tests');
  }
  public async Save(entity: BaseEntity): Promise<{}> {
    return { ...entity.GetAll(), ID: 'C0000000-0000-4000-8000-0000000000F1' };
  }
  public async Delete(): Promise<boolean> {
    throw new Error('AcceptingProvider: Delete is not used by these tests');
  }
  public async GetRecordChanges(): Promise<RecordChange[]> {
    return [];
  }
}

function acceptingProvider(): IEntityDataProvider {
  return new AcceptingProvider();
}

/** A refusal record saved through `provider`, as the lifecycle gate writes one. */
async function SavedPublishRecord(provider: IEntityDataProvider): Promise<MJMLModelPublishRecordEntityServer> {
  const r = new MJMLModelPublishRecordEntityServer(publishRecordEntityInfo(), provider);
  r.ContextCurrentUser = USER;
  r.NewRecord();
  r.ModelID = 'B0000000-0000-4000-8000-0000000000F1';
  r.Kind = 'refusal';
  r.Purpose = 'publish';
  r.ApproverKind = 'automated-gate';
  r.Initiator = JSON.stringify({ kind: 'agent', agentRunId: 'D0000000-0000-4000-8000-0000000000F1' });
  r.Reason = 'The protocol requires an approving human sign-off for this publish, and none was found.';
  r.Refusal = JSON.stringify({ kind: 'no-sign-off' });
  r.OverridesFlags = '[]';
  r.Transient = false;
  if (!(await r.Save())) throw new Error(`the fixture row did not save: ${r.LatestResult?.CompleteMessage}`);
  return r;
}

describe('MJMLModelPublishRecordEntityServer — publish records are immutable', () => {
  it('refuses an update of a saved publish record', async () => {
    const r = await SavedPublishRecord(acceptingProvider());
    r.Reason = 'rewritten';
    expect(r.Validate().Success).toBe(false);
    expect(r.Validate().Errors[0].Message).toContain('publish records are immutable');
  });
  it('names every changed field and refuses the save itself', async () => {
    const r = await SavedPublishRecord(acceptingProvider());
    r.Reason = 'rewritten';
    r.Transient = true;
    expect(r.Validate().Errors.map((e) => e.Message)).toEqual([
      'MJ: ML Model Publish Records rows are immutable once saved (publish records are immutable): Reason, Transient cannot be changed. Write a new record instead.',
    ]);
    expect(await r.Save()).toBe(false);
  });
  it('passes a new row and a saved row with no change', async () => {
    const r = await SavedPublishRecord(acceptingProvider());
    expect(r.Validate().Success).toBe(true);
    const fresh = new MJMLModelPublishRecordEntityServer(publishRecordEntityInfo(), acceptingProvider());
    fresh.NewRecord();
    fresh.Reason = 'new';
    expect(fresh.Validate().Success).toBe(true);
  });
});
