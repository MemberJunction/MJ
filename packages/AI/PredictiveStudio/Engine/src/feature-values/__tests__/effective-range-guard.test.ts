/**
 * PR 5 milestone B1 — attacks 5 and 14, the guard half (D5-30). `FeatureValueEffectiveRangeGuard` refuses every create of
 * a `Pipeline`/`Human` Feature Value and every change of `EffectiveAsOf`, `EffectiveTo` or `SourceUserID` of one, unless
 * `FeatureValueWriteAuthorisations` carries an entry for that very instance (the service's save). The rows are the real
 * generated class over a hand-built EntityInfo, so `Save()` is BaseEntity's and runs the registered hook; the data
 * provider accepts every write, so a refusal can only come from the guard. The GraphQL, `Update Record` Action and
 * concurrent-MJAPI halves run against a live database and MJAPI in the TruthSuite DB file (D5-B1-1).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { EntityInfo, UserInfo, UserRoleInfo, type BaseEntity, type IEntityDataProvider, type RecordChange } from '@memberjunction/core';
import { MJFeatureValueEntity } from '@memberjunction/core-entities';
import { FeatureValueWriteAuthorisations } from '@memberjunction/feature-pipelines';

import { PreSaveHookRegistration } from '../../registry/pre-save-hook-registration';
import { FeatureValueEffectiveRangeGuard } from '../effective-range-guard';

const ENTITY_ID = 'E0000000-0000-4000-8000-0000000008B1';
const ROLE_ID = 'E1000000-0000-4000-8000-0000000008B1';
const DATE_COLUMNS = new Set(['ComputedAt', 'EffectiveAsOf', 'EffectiveTo', 'InputAsOf', 'ValueDate']);
const COLUMNS = [
  'RecordProcessID', 'MLModelScoringBindingID', 'EntityID', 'RecordID', 'FeatureName', 'Source', 'Role', 'ValueText', 'ValueNumeric',
  'ValueBoolean', 'ValueDate', 'ValueJSON', 'PipelineVersion', 'ValueKeyHash', 'ComputedAt', 'EffectiveAsOf', 'EffectiveTo', 'InputAsOf', 'SourceUserID',
];
const USER = new UserInfo(null, {
  ID: 'A0000000-0000-4000-8000-0000000008B1', Email: 'person@example.com', Type: 'User',
  UserRoles: [new UserRoleInfo({ UserID: 'A0000000-0000-4000-8000-0000000008B1', RoleID: ROLE_ID })],
});

/** `MJ: Feature Values` with the columns the guard reads, the API open, and one role (the user's) with every permission. */
function featureValueEntityInfo(name = 'MJ: Feature Values'): EntityInfo {
  const type = (c: string): string => (DATE_COLUMNS.has(c) ? 'datetimeoffset' : c === 'ValueNumeric' || c === 'PipelineVersion' ? 'int' : c === 'ValueBoolean' ? 'bit' : 'nvarchar');
  const fields = [{ Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true }, ...COLUMNS.map((Name) => ({ Name, Type: type(Name), AllowsNull: true, IsPrimaryKey: false }))];
  return new EntityInfo({
    ID: ENTITY_ID, Name: name, SchemaName: '__mj', BaseTable: 'FeatureValue', BaseView: 'vwFeatureValues',
    Status: 'Active', IncludeInAPI: true, AllowCreateAPI: true, AllowUpdateAPI: true, AllowDeleteAPI: true, TrackRecordChanges: false, EnableFieldLevelSecurity: false,
    EntityPermissions: [{ ID: 'P0000000-0000-4000-8000-0000000008B1', EntityID: ENTITY_ID, RoleID: ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true }],
    EntityFields: fields.map((c, i) => ({ ID: `F0000000-0000-4000-8000-000000000${(800 + i).toString()}`, EntityID: ENTITY_ID, Sequence: i + 1, Length: 0, Precision: 0, Scale: 0, AllowUpdateAPI: true, ...c })),
  });
}

/** A data provider that accepts every save; it counts the writes that reached it. */
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
    return { ...values, ID: values['ID'] || `C0000000-0000-4000-8000-${String(this.Writes).padStart(12, '0')}` };
  }
  public async Delete(): Promise<boolean> {
    return true;
  }
  public async GetRecordChanges(): Promise<RecordChange[]> {
    return [];
  }
}

/** A new Feature Value of `source`, filled as the service fills one, on `provider`. */
function NewValue(provider: IEntityDataProvider, source: MJFeatureValueEntity['Source'], name?: string): MJFeatureValueEntity {
  const v = new MJFeatureValueEntity(featureValueEntityInfo(name), provider);
  v.ContextCurrentUser = USER;
  v.NewRecord();
  v.Source = source;
  v.Role = 'Champion';
  v.RecordProcessID = 'D0000000-0000-4000-8000-0000000008B1';
  v.EntityID = 'D1000000-0000-4000-8000-0000000008B1';
  v.RecordID = 'r1';
  v.FeatureName = 'JobTitleLevel';
  v.ValueText = 'Director';
  v.ComputedAt = new Date();
  v.EffectiveAsOf = new Date('2025-01-01T00:00:00Z');
  return v;
}

/** A value saved through the service's authorisation. */
async function SavedValue(provider: IEntityDataProvider, source: MJFeatureValueEntity['Source']): Promise<MJFeatureValueEntity> {
  const v = NewValue(provider, source);
  if (!(await FeatureValueWriteAuthorisations.Save(v))) throw new Error(`the fixture did not save: ${v.LatestResult?.CompleteMessage}`);
  return v;
}

beforeAll(() => {
  // $E/index.ts calls this at integration (handed to A2); the test registers it itself, as the entry point will.
  FeatureValueEffectiveRangeGuard.Register();
});

describe('FeatureValueEffectiveRangeGuard — registration (D5-30)', () => {
  it('registers one PreSave hook, idempotently', () => {
    FeatureValueEffectiveRangeGuard.Register();
    expect(PreSaveHookRegistration.HooksMarked(FeatureValueEffectiveRangeGuard.HookMark)).toHaveLength(1);
  });

  it('attack 14: Explorer\'s generated registrations import no hook-registering module of B1 (the guard is server-only)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const repo = resolve(here, '../../../../../../..');
    const bootstrap = readFileSync(resolve(repo, 'packages/Angular/Bootstrap/src/generated/mj-class-registrations.ts'), 'utf8');
    expect(bootstrap).not.toMatch(/['"]@memberjunction\/predictive-studio['"]/);
    const browserLoaded = ['effective-dating.ts', 'feature-value-write-authorisations.ts', 'feature-value-locks.ts', 'FeatureValueCacheService.ts']
      .map((f) => readFileSync(resolve(repo, 'packages/AI/Knowledge/FeaturePipelines/src/cache', f), 'utf8'));
    for (const source of browserLoaded) expect(source).not.toMatch(/RegisterDataHook|PreSaveHookRegistration/);
  });
});

describe('attack 5: every writer of the effective range other than the service is refused', () => {
  it('a create of a Pipeline row (EffectiveAsOf in the past) outside the service is refused; nothing reaches the database', async () => {
    const provider = new AcceptingProvider();
    const forged = NewValue(provider, 'Pipeline');
    expect(await forged.Save()).toBe(false);
    expect(forged.LatestResult?.CompleteMessage).toContain('effective range guard');
    expect(provider.Writes).toBe(0);
  });

  it('a create of a Human row outside the service is refused', async () => {
    const provider = new AcceptingProvider();
    const forged = NewValue(provider, 'Human');
    expect(await forged.Save()).toBe(false);
    expect(provider.Writes).toBe(0);
  });

  it('a change of EffectiveTo, EffectiveAsOf or SourceUserID of a saved Pipeline or Human row is refused', async () => {
    for (const source of ['Pipeline', 'Human'] as const) {
      const provider = new AcceptingProvider();
      const saved = await SavedValue(provider, source);
      saved.EffectiveTo = new Date('2025-06-01T00:00:00Z');
      expect(await saved.Save()).toBe(false);
      saved.EffectiveTo = null;
      saved.EffectiveAsOf = new Date('2020-01-01T00:00:00Z');
      expect(await saved.Save()).toBe(false);
      saved.EffectiveAsOf = new Date('2025-01-01T00:00:00Z');
      saved.SourceUserID = 'A0000000-0000-4000-8000-0000000008B1';
      expect(await saved.Save()).toBe(false);
      expect(provider.Writes).toBe(1);
    }
  });

  it('a change of Source of a saved row is refused', async () => {
    const provider = new AcceptingProvider();
    const saved = await SavedValue(provider, 'Pipeline');
    saved.Source = 'Model';
    expect(await saved.Save()).toBe(false);
  });

  it('the service\'s save of the instance it authorised passes, once: the entry does not outlive the save', async () => {
    const provider = new AcceptingProvider();
    const saved = await SavedValue(provider, 'Pipeline');
    expect(provider.Writes).toBe(1);
    expect(FeatureValueWriteAuthorisations.Instance.Take(saved)).toBe(false);
    saved.EffectiveTo = new Date();
    expect(await FeatureValueWriteAuthorisations.Save(saved)).toBe(true);
    expect(provider.Writes).toBe(2);
  });

  it('a Model row (PR 4\'s writer) and every other entity pass', async () => {
    const provider = new AcceptingProvider();
    const model = NewValue(provider, 'Model');
    expect(FeatureValueEffectiveRangeGuard.CheckSave(model)).toBe(true);
    const other = NewValue(provider, 'Pipeline', 'MJ: Some Other Entity');
    expect(FeatureValueEffectiveRangeGuard.CheckSave(other)).toBe(true);
  });
});

describe('attack 14: the authorisation is keyed by instance, not by process (F-018)', () => {
  it('a range change of another instance is refused while the service\'s save of one instance is in flight', async () => {
    const provider = new AcceptingProvider();
    const servicesRow = NewValue(provider, 'Pipeline');
    const forged = await SavedValue(provider, 'Pipeline');
    FeatureValueWriteAuthorisations.Instance.Authorise(servicesRow);
    try {
      forged.EffectiveTo = new Date();
      expect(await forged.Save()).toBe(false);
      expect(FeatureValueEffectiveRangeGuard.CheckSave(servicesRow)).toBe(true);
    } finally {
      FeatureValueWriteAuthorisations.Instance.Revoke(servicesRow);
    }
  });

  it('two concurrent saves: the authorised one passes, the unauthorised one is refused', async () => {
    const provider = new AcceptingProvider();
    const a = NewValue(provider, 'Pipeline');
    const b = NewValue(provider, 'Human');
    const [okA, okB] = await Promise.all([FeatureValueWriteAuthorisations.Save(a), b.Save()]);
    expect([okA, okB]).toEqual([true, false]);
  });
});
