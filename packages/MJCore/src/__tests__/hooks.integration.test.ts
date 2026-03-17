/**
 * Integration tests for PreRunView, PostRunView, and PreSave hooks.
 *
 * These tests exercise the real ProviderBase.RunView / RunViews and
 * BaseEntity.Save call chains using the mock TestMetadataProvider so
 * no database connection is required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterDataHook, ClearAllDataHooks, PreRunViewHook, PostRunViewHook, PreSaveHook } from '../generic/dataHooks';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { RunViewParams } from '../views/runView';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { BaseEntity } from '../generic/baseEntity';
import { EntitySaveOptions } from '../generic/interfaces';

/** Concrete subclass so we can instantiate BaseEntity (which is abstract). */
class TestEntity extends BaseEntity {}

// ---------------------------------------------------------------------------
// Shared mock metadata with entity names matching test usage
// ---------------------------------------------------------------------------
const TEST_ROLE_ID = 'role-test-1';

const MOCK_METADATA = {
    Applications: [],
    Entities: [
        {
            ID: 'entity-customers',
            Name: 'Customers',
            SchemaName: 'dbo',
            BaseView: 'vwCustomers',
            BaseTable: 'Customers',
            IncludeInAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            EntityFields: [
                { ID: 'f-cust-1', EntityID: 'entity-customers', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f-cust-2', EntityID: 'entity-customers', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
            ],
            EntityPermissions: [
                { EntityID: 'entity-customers', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
        {
            ID: 'entity-orders',
            Name: 'Orders',
            SchemaName: 'dbo',
            BaseView: 'vwOrders',
            BaseTable: 'Orders',
            IncludeInAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            EntityFields: [
                { ID: 'f-ord-1', EntityID: 'entity-orders', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f-ord-2', EntityID: 'entity-orders', Name: 'Total', Type: 'decimal', IsPrimaryKey: false, Sequence: 2 },
            ],
            EntityPermissions: [
                { EntityID: 'entity-orders', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
        {
            ID: 'entity-products',
            Name: 'Products',
            SchemaName: 'dbo',
            BaseView: 'vwProducts',
            BaseTable: 'Products',
            IncludeInAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            EntityFields: [
                { ID: 'f-prod-1', EntityID: 'entity-products', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f-prod-2', EntityID: 'entity-products', Name: 'SKU', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
            ],
            EntityPermissions: [
                { EntityID: 'entity-products', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
            ],
        },
    ],
    // Flatten entity fields for the dataset
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeUser(id = 'user-1', name = 'Test User'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = name;
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    // Give the user a role that matches the entity permissions
    const role = new UserRoleInfo({ UserID: id, RoleID: TEST_ROLE_ID, Role: 'TestRole' });
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [role];
    return u;
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

describe('Hook Integration Tests', () => {
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

    // ===================================================================
    // Group 1 — PreRunView hooks in RunView flow
    // ===================================================================
    describe('PreRunView hooks in RunView flow', () => {
        it('should mutate ExtraFilter before InternalRunView executes', async () => {
            const spy = vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([])]);

            const hook: PreRunViewHook = (params) => {
                return { ...params, ExtraFilter: `${params.ExtraFilter || ''} AND TenantID='t1'`.trim() };
            };
            RegisterDataHook('PreRunView', hook);

            await provider.RunView({ EntityName: 'Customers', ExtraFilter: "Status='Active'" });

            const calledParams = (spy.mock.calls[0][0] as RunViewParams[])[0];
            expect(calledParams.ExtraFilter).toContain("TenantID='t1'");
            expect(calledParams.ExtraFilter).toContain("Status='Active'");
        });

        it('should chain multiple hooks in registration order', async () => {
            const spy = vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([])]);

            const hookA: PreRunViewHook = (params) => {
                return { ...params, ExtraFilter: `${params.ExtraFilter || ''} AND A=1`.trim() };
            };
            const hookB: PreRunViewHook = (params) => {
                return { ...params, ExtraFilter: `${params.ExtraFilter || ''} AND B=2`.trim() };
            };
            RegisterDataHook('PreRunView', hookA);
            RegisterDataHook('PreRunView', hookB);

            await provider.RunView({ EntityName: 'Customers' });

            const calledParams = (spy.mock.calls[0][0] as RunViewParams[])[0];
            const filter = calledParams.ExtraFilter as string;
            expect(filter).toContain('A=1');
            expect(filter).toContain('B=2');
            expect(filter.indexOf('A=1')).toBeLessThan(filter.indexOf('B=2'));
        });

        it('should pass contextUser to hook', async () => {
            vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([])]);

            let capturedUser: UserInfo | undefined;
            const hook: PreRunViewHook = (params, user) => {
                capturedUser = user;
                return params;
            };
            RegisterDataHook('PreRunView', hook);

            const user = makeUser('ctx-user');
            await provider.RunView({ EntityName: 'Customers' }, user);

            expect(capturedUser).toBeDefined();
            expect(capturedUser!.ID).toBe('ctx-user');
        });

        it('should pass params through unmodified when no hooks registered', async () => {
            const spy = vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([])]);

            const originalFilter = "Status='Active'";
            await provider.RunView({ EntityName: 'Customers', ExtraFilter: originalFilter });

            const calledParams = (spy.mock.calls[0][0] as RunViewParams[])[0];
            expect(calledParams.ExtraFilter).toBe(originalFilter);
        });

        it('should support async hooks with delay', async () => {
            const spy = vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([])]);

            const hook: PreRunViewHook = async (params) => {
                await new Promise(resolve => setTimeout(resolve, 5));
                return { ...params, ExtraFilter: 'Injected=1' };
            };
            RegisterDataHook('PreRunView', hook);

            await provider.RunView({ EntityName: 'Customers' });

            const calledParams = (spy.mock.calls[0][0] as RunViewParams[])[0];
            expect(calledParams.ExtraFilter).toBe('Injected=1');
        });
    });

    // ===================================================================
    // Group 2 — PostRunView hooks in RunView flow
    // ===================================================================
    describe('PostRunView hooks in RunView flow', () => {
        it('should allow hook to mutate results', async () => {
            vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }])]);

            const hook: PostRunViewHook = (_params, result) => {
                return {
                    ...result,
                    Results: result.Results.filter((r: Record<string, unknown>) => r['name'] !== 'Bob'),
                    RowCount: 1,
                    TotalRowCount: 1,
                };
            };
            RegisterDataHook('PostRunView', hook);

            const result = await provider.RunView({ EntityName: 'Customers' });

            expect(result.Results).toHaveLength(1);
            expect((result.Results[0] as Record<string, unknown>)['name']).toBe('Alice');
        });

        it('should pass params, results, and contextUser to hook', async () => {
            vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([{ id: 1 }])]);

            let capturedParams: RunViewParams | undefined;
            let capturedResults: RunViewResult | undefined;
            let capturedUser: UserInfo | undefined;

            const hook: PostRunViewHook = (params, results, user) => {
                capturedParams = params;
                capturedResults = results;
                capturedUser = user;
                return results;
            };
            RegisterDataHook('PostRunView', hook);

            const user = makeUser('post-user');
            await provider.RunView({ EntityName: 'Orders' }, user);

            expect(capturedParams!.EntityName).toBe('Orders');
            expect(capturedResults!.Results).toHaveLength(1);
            expect(capturedUser!.ID).toBe('post-user');
        });

        it('should chain multiple post-hooks', async () => {
            vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([{ val: 1 }])]);

            const hookA: PostRunViewHook = (_params, result) => {
                return {
                    ...result,
                    Results: result.Results.map((r: Record<string, number>) => ({ ...r, val: r['val'] * 2 })),
                };
            };
            const hookB: PostRunViewHook = (_params, result) => {
                return {
                    ...result,
                    Results: result.Results.map((r: Record<string, number>) => ({ ...r, val: r['val'] + 10 })),
                };
            };
            RegisterDataHook('PostRunView', hookA);
            RegisterDataHook('PostRunView', hookB);

            const result = await provider.RunView({ EntityName: 'Customers' });

            // hookA: 1 → 2, hookB: 2 → 12
            expect((result.Results[0] as Record<string, number>)['val']).toBe(12);
        });

        it('should pass results through unmodified when no hooks registered', async () => {
            vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([{ id: 1, name: 'Alice' }])]);

            const result = await provider.RunView({ EntityName: 'Customers' });

            expect(result.Results).toHaveLength(1);
            expect((result.Results[0] as Record<string, unknown>)['name']).toBe('Alice');
        });
    });

    // ===================================================================
    // Group 3 — RunViews (batch) hook integration
    // ===================================================================
    describe('RunViews (batch) hook integration', () => {
        it('should run PreRunView hook once per param in batch', async () => {
            vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([
                    makeRunViewResult([]),
                    makeRunViewResult([]),
                    makeRunViewResult([]),
                ]);

            let callCount = 0;
            const hook: PreRunViewHook = (params) => {
                callCount++;
                return params;
            };
            RegisterDataHook('PreRunView', hook);

            await provider.RunViews([
                { EntityName: 'Customers' },
                { EntityName: 'Orders' },
                { EntityName: 'Products' },
            ]);

            expect(callCount).toBe(3);
        });

        it('should run PostRunView hook once per result in batch', async () => {
            vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([
                    makeRunViewResult([{ id: 1 }]),
                    makeRunViewResult([{ id: 2 }]),
                ]);

            const capturedEntityNames: string[] = [];
            const hook: PostRunViewHook = (params, result) => {
                capturedEntityNames.push(params.EntityName!);
                return result;
            };
            RegisterDataHook('PostRunView', hook);

            await provider.RunViews([
                { EntityName: 'Orders' },
                { EntityName: 'Customers' },
            ]);

            expect(capturedEntityNames).toEqual(['Orders', 'Customers']);
        });

        it('should allow hooks to mutate each param independently', async () => {
            const spy = vi.spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([makeRunViewResult([]), makeRunViewResult([])]);

            const hook: PreRunViewHook = (params) => {
                return { ...params, ExtraFilter: `Entity='${params.EntityName}'` };
            };
            RegisterDataHook('PreRunView', hook);

            await provider.RunViews([
                { EntityName: 'Orders' },
                { EntityName: 'Products' },
            ]);

            const calledParams = spy.mock.calls[0][0] as RunViewParams[];
            expect(calledParams[0].ExtraFilter).toBe("Entity='Orders'");
            expect(calledParams[1].ExtraFilter).toBe("Entity='Products'");
        });
    });

    // ===================================================================
    // Group 4 — PreSave hooks in BaseEntity.Save flow
    // ===================================================================
    describe('PreSave hooks in BaseEntity.Save flow', () => {
        /**
         * Creates a BaseEntity instance with enough infrastructure to reach
         * RunPreSaveHooks() in _InnerSave(). Uses the real EntityInfo from
         * the test provider's metadata so permissions/validation work properly.
         */
        function createSaveableEntity(user?: UserInfo): BaseEntity {
            // Grab the real EntityInfo from the initialized provider
            const entityInfo = provider.Entities.find(e => e.Name === 'Customers')!;
            expect(entityInfo).toBeDefined();

            // Create entity with proper EntityInfo
            const contextUser = user ?? makeUser();
            const entity = new TestEntity(entityInfo);

            // Set context user
            Object.defineProperty(entity, 'ActiveUser', { get: () => contextUser, configurable: true });

            // Mark as "saved" (existing record) so it takes the update path.
            // We'll pass IgnoreDirtyState: true to Save() to bypass dirty checks.
            Object.defineProperty(entity, 'IsSaved', { get: () => true, configurable: true });

            // Mock the IEntityDataProvider.Save to succeed
            const mockSaveProvider = {
                Save: vi.fn().mockResolvedValue({ ID: '1', Name: 'changed-value' }),
            };
            Object.defineProperty(entity, 'ProviderToUse', { get: () => mockSaveProvider, configurable: true });

            // Stub Validate to succeed (we're testing hooks, not validation)
            vi.spyOn(entity, 'Validate').mockReturnValue({ Success: true, Errors: [] } as never);

            // Stub event raising and finalizeSave
            vi.spyOn(entity as never, 'RaiseEvent').mockImplementation(() => {});
            vi.spyOn(entity as never, 'finalizeSave').mockReturnValue(true);

            return entity;
        }

        /** Save options that bypass the dirty check so we don't need to simulate field mutations. */
        const saveOpts: EntitySaveOptions = Object.assign(new EntitySaveOptions(), { IgnoreDirtyState: true });

        it('should allow save when hook returns true', async () => {
            const hookFn = vi.fn<PreSaveHook>().mockReturnValue(true);
            RegisterDataHook('PreSave', hookFn);

            const entity = createSaveableEntity();
            const result = await entity.Save(saveOpts);

            expect(result).toBe(true);
            expect(hookFn).toHaveBeenCalledTimes(1);
            expect(entity.ProviderToUse.Save).toHaveBeenCalled();
        });

        it('should block save when hook returns false', async () => {
            const hookFn = vi.fn<PreSaveHook>().mockReturnValue(false);
            RegisterDataHook('PreSave', hookFn);

            const entity = createSaveableEntity();
            const result = await entity.Save(saveOpts);

            expect(result).toBe(false);
            expect(entity.ProviderToUse.Save).not.toHaveBeenCalled();
        });

        it('should block save when hook returns error string', async () => {
            const hookFn = vi.fn<PreSaveHook>()
                .mockReturnValue('Tenant mismatch: record belongs to another tenant');
            RegisterDataHook('PreSave', hookFn);

            const entity = createSaveableEntity();
            const result = await entity.Save(saveOpts);

            expect(result).toBe(false);
            const lastResult = entity.ResultHistory[entity.ResultHistory.length - 1];
            expect(lastResult.Message).toContain('Tenant mismatch');
            expect(entity.ProviderToUse.Save).not.toHaveBeenCalled();
        });

        it('should pass entity instance and contextUser to hook', async () => {
            let capturedEntity: BaseEntity | undefined;
            let capturedUser: UserInfo | undefined;

            const hookFn: PreSaveHook = (ent, user) => {
                capturedEntity = ent;
                capturedUser = user;
                return true;
            };
            RegisterDataHook('PreSave', hookFn);

            const user = makeUser('save-user');
            const entity = createSaveableEntity(user);
            await entity.Save(saveOpts);

            expect(capturedEntity).toBe(entity);
            expect(capturedUser!.ID).toBe('save-user');
        });

        it('should stop at first rejecting hook when multiple are registered', async () => {
            const hookAllow = vi.fn<PreSaveHook>().mockReturnValue(true);
            const hookReject = vi.fn<PreSaveHook>().mockReturnValue(false);
            const hookNeverCalled = vi.fn<PreSaveHook>().mockReturnValue(true);

            RegisterDataHook('PreSave', hookAllow);
            RegisterDataHook('PreSave', hookReject);
            RegisterDataHook('PreSave', hookNeverCalled);

            const entity = createSaveableEntity();
            const result = await entity.Save(saveOpts);

            expect(result).toBe(false);
            expect(hookAllow).toHaveBeenCalledTimes(1);
            expect(hookReject).toHaveBeenCalledTimes(1);
            expect(hookNeverCalled).not.toHaveBeenCalled();
            expect(entity.ProviderToUse.Save).not.toHaveBeenCalled();
        });
    });
});
