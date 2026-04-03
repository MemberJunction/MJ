/**
 * Hook error propagation tests.
 *
 * Verifies that errors thrown by hooks propagate correctly through
 * the ProviderBase.RunView and BaseEntity.Save pipelines.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterDataHook, ClearAllDataHooks, PreRunViewHook, PostRunViewHook, PreSaveHook } from '../generic/dataHooks';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { BaseEntity } from '../generic/baseEntity';
import { EntitySaveOptions } from '../generic/interfaces';

class TestEntity extends BaseEntity {}

const TEST_ROLE_ID = 'role-err-1';

const MOCK_METADATA = {
  Applications: [],
  Entities: [
    {
      ID: 'entity-err-test',
      Name: 'ErrorTest',
      SchemaName: 'dbo',
      BaseView: 'vwErrorTest',
      BaseTable: 'ErrorTest',
      IncludeInAPI: true,
      AllowCreateAPI: true,
      AllowUpdateAPI: true,
      AllowDeleteAPI: true,
      EntityFields: [
        { ID: 'f-err-1', EntityID: 'entity-err-test', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
        { ID: 'f-err-2', EntityID: 'entity-err-test', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
      ],
      EntityPermissions: [
        { EntityID: 'entity-err-test', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
      ],
    },
  ],
  get EntityFields() {
    return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityFields'] as unknown[]) || []);
  },
  get EntityPermissions() {
    return this.Entities.flatMap((e: Record<string, unknown>) => (e['EntityPermissions'] as unknown[]) || []);
  },
  EntityFieldValues: [],
  EntityRelationships: [],
  EntitySettings: [],
  ApplicationEntities: [],
  ApplicationSettings: [],
  Roles: [{ ID: TEST_ROLE_ID, Name: 'TestRole' }],
  RowLevelSecurityFilters: [],
  AuditLogTypes: [],
  Authorizations: [],
  QueryCategories: [],
  Queries: [],
  QueryFields: [],
  QueryPermissions: [],
  QueryEntities: [],
  QueryParameters: [],
  EntityDocumentTypes: [],
  Libraries: [],
  ExplorerNavigationItems: [],
};

function makeRunViewResult<T>(rows: T[]): RunViewResult<T> {
  return {
    Success: true,
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: rows.length,
    ExecutionTime: 1,
    ErrorMessage: '',
    UserViewRunID: '',
  };
}

function makeUser(id = 'err-user'): UserInfo {
  const u = new UserInfo();
  u.ID = id;
  u.Name = 'Error Test User';
  u.Email = `${id}@test.com`;
  u.IsActive = true;
  const role = new UserRoleInfo({ UserID: id, RoleID: TEST_ROLE_ID, Role: 'TestRole' });
  (u as unknown as Record<string, unknown>)['_UserRoles'] = [role];
  return u;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Hook Error Propagation', () => {
  let provider: TestMetadataProvider;

  beforeEach(async () => {
    ClearAllDataHooks();
    provider = new TestMetadataProvider();
    provider.setMockDelay(0);
    provider.setMockMetadata(MOCK_METADATA);
    const config = new ProviderConfigDataBase({}, '__mj', [], [], true);
    await provider.Config(config);
  });

  afterEach(() => {
    ClearAllDataHooks();
  });

  // ───────────────────────────────────────────────────────────────────────
  // PreRunView error propagation
  // ───────────────────────────────────────────────────────────────────────

  describe('PreRunView hook errors', () => {
    it('should propagate synchronous errors from PreRunView hook', async () => {
      RegisterDataHook('PreRunView', () => {
        throw new Error('PreRunView hook exploded');
      });

      vi.spyOn(provider as never, 'InternalRunViews')
        .mockResolvedValue([makeRunViewResult([])]);

      await expect(provider.RunView({ EntityName: 'ErrorTest' }))
        .rejects.toThrow('PreRunView hook exploded');
    });

    it('should propagate async rejection from PreRunView hook', async () => {
      const asyncHook: PreRunViewHook = async () => {
        throw new Error('Async PreRunView rejection');
      };
      RegisterDataHook('PreRunView', asyncHook);

      vi.spyOn(provider as never, 'InternalRunViews')
        .mockResolvedValue([makeRunViewResult([])]);

      await expect(provider.RunView({ EntityName: 'ErrorTest' }))
        .rejects.toThrow('Async PreRunView rejection');
    });

    it('should not call InternalRunView when PreRunView hook throws', async () => {
      RegisterDataHook('PreRunView', () => {
        throw new Error('Abort');
      });

      const spy = vi.spyOn(provider as never, 'InternalRunViews')
        .mockResolvedValue([makeRunViewResult([])]);

      try {
        await provider.RunView({ EntityName: 'ErrorTest' });
      } catch {
        // expected
      }

      expect(spy).not.toHaveBeenCalled();
    });

    it('should stop at first erroring hook (second hook never runs)', async () => {
      const hookA = vi.fn<PreRunViewHook>(() => {
        throw new Error('Hook A failed');
      });
      const hookB = vi.fn<PreRunViewHook>((params) => params);

      RegisterDataHook('PreRunView', hookA);
      RegisterDataHook('PreRunView', hookB);

      vi.spyOn(provider as never, 'InternalRunViews')
        .mockResolvedValue([makeRunViewResult([])]);

      try {
        await provider.RunView({ EntityName: 'ErrorTest' });
      } catch {
        // expected
      }

      expect(hookA).toHaveBeenCalledTimes(1);
      expect(hookB).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // PostRunView error propagation
  // ───────────────────────────────────────────────────────────────────────

  describe('PostRunView hook errors', () => {
    it('should propagate synchronous errors from PostRunView hook', async () => {
      vi.spyOn(provider as never, 'InternalRunViews')
        .mockResolvedValue([makeRunViewResult([{ id: 1 }])]);

      RegisterDataHook('PostRunView', () => {
        throw new Error('PostRunView hook exploded');
      });

      await expect(provider.RunView({ EntityName: 'ErrorTest' }))
        .rejects.toThrow('PostRunView hook exploded');
    });

    it('should propagate async rejection from PostRunView hook', async () => {
      vi.spyOn(provider as never, 'InternalRunViews')
        .mockResolvedValue([makeRunViewResult([{ id: 1 }])]);

      const asyncHook: PostRunViewHook = async () => {
        throw new Error('Async PostRunView rejection');
      };
      RegisterDataHook('PostRunView', asyncHook);

      await expect(provider.RunView({ EntityName: 'ErrorTest' }))
        .rejects.toThrow('Async PostRunView rejection');
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // PreSave error propagation
  // ───────────────────────────────────────────────────────────────────────

  describe('PreSave hook errors', () => {
    const saveOpts: EntitySaveOptions = Object.assign(
      new EntitySaveOptions(),
      { IgnoreDirtyState: true }
    );

    function createSaveableEntity(user?: UserInfo): BaseEntity {
      const entityInfo = provider.Entities.find(e => e.Name === 'ErrorTest')!;
      const contextUser = user ?? makeUser();
      const entity = new TestEntity(entityInfo);

      Object.defineProperty(entity, 'ActiveUser', { get: () => contextUser, configurable: true });
      Object.defineProperty(entity, 'IsSaved', { get: () => true, configurable: true });

      const mockSaveProvider = {
        Save: vi.fn().mockResolvedValue({ ID: '1', Name: 'saved' }),
      };
      Object.defineProperty(entity, 'ProviderToUse', { get: () => mockSaveProvider, configurable: true });
      vi.spyOn(entity, 'Validate').mockReturnValue({ Success: true, Errors: [] } as never);
      vi.spyOn(entity as never, 'RaiseEvent').mockImplementation(() => {});
      vi.spyOn(entity as never, 'finalizeSave').mockReturnValue(true);

      return entity;
    }

    it('should handle hook that throws an error (save fails gracefully)', async () => {
      RegisterDataHook('PreSave', () => {
        throw new Error('PreSave hook exploded');
      });

      const entity = createSaveableEntity();
      const result = await entity.Save(saveOpts);

      // The Save method catches errors and returns false
      expect(result).toBe(false);
      expect(entity.ProviderToUse.Save).not.toHaveBeenCalled();
    });

    it('should handle async hook that rejects (save fails gracefully)', async () => {
      const asyncHook: PreSaveHook = async () => {
        throw new Error('Async PreSave rejection');
      };
      RegisterDataHook('PreSave', asyncHook);

      const entity = createSaveableEntity();
      const result = await entity.Save(saveOpts);

      expect(result).toBe(false);
      expect(entity.ProviderToUse.Save).not.toHaveBeenCalled();
    });

    it('should record error message in ResultHistory when hook throws', async () => {
      RegisterDataHook('PreSave', () => {
        throw new Error('Custom hook error message');
      });

      const entity = createSaveableEntity();
      await entity.Save(saveOpts);

      const lastResult = entity.ResultHistory[entity.ResultHistory.length - 1];
      expect(lastResult).toBeDefined();
      expect(lastResult.Success).toBe(false);
    });

    it('should handle hook returning false (clean rejection, no exception)', async () => {
      const hookFn = vi.fn<PreSaveHook>().mockReturnValue(false);
      RegisterDataHook('PreSave', hookFn);

      const entity = createSaveableEntity();
      const result = await entity.Save(saveOpts);

      expect(result).toBe(false);
      expect(hookFn).toHaveBeenCalledTimes(1);
      expect(entity.ProviderToUse.Save).not.toHaveBeenCalled();
    });

    it('should handle hook returning error string (rejection with message)', async () => {
      RegisterDataHook('PreSave', () => 'Cross-tenant write not allowed');

      const entity = createSaveableEntity();
      const result = await entity.Save(saveOpts);

      expect(result).toBe(false);
      const lastResult = entity.ResultHistory[entity.ResultHistory.length - 1];
      expect(lastResult.Message).toContain('Cross-tenant write not allowed');
    });

    it('should handle hook returning unexpected type (treated as truthy = allow)', async () => {
      // A hook returning a number (truthy) should be treated as "allow"
      RegisterDataHook('PreSave', (() => 42) as unknown as PreSaveHook);

      const entity = createSaveableEntity();
      const result = await entity.Save(saveOpts);

      // 42 is truthy but not strictly true/string/false — implementation decides
      // Based on the code: string = reject with message, false = reject, else = allow
      expect(result).toBe(true);
    });
  });
});
