/**
 * A write made SERVER-side must drop the client's RunView dedup-linger entries.
 *
 * The linger cache replays an identical RunView answered in the last DedupLingerMs (5s). Only a
 * BaseEntity save/delete event raised in THIS process invalidated it, so a Remote Operation, an
 * Action or any other mutation that wrote on the server left the client serving pre-operation rows
 * for up to 5s (found by the BizApps Voting wire tests: a RunView right after a ballot-closing
 * operation returned the still-open ballot). ProviderBase.RouteOperation now invalidates after every
 * operation, and InvalidateRunViewDedupCache() is the public seam for every other server-side write
 * (the GraphQL client calls it after each mutation).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';

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
            ],
            EntityPermissions: [
                { EntityID: 'entity-orders', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
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

function makeUser(id = 'user-1'): UserInfo {
    const u = new UserInfo();
    u.ID = id;
    u.Name = 'Test User';
    u.Email = `${id}@test.com`;
    u.IsActive = true;
    const role = new UserRoleInfo({ UserID: id, RoleID: TEST_ROLE_ID, Role: 'TestRole' });
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [role];
    return u;
}


describe('ProviderBase dedup/linger invalidation for server-side writes', () => {
    let provider: TestMetadataProvider;
    let user: UserInfo;

    beforeEach(async () => {
        provider = new TestMetadataProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(MOCK_METADATA);
        const config = new ProviderConfigDataBase({}, '__mj', [], [], true);
        await provider.Config(config);
        user = makeUser();
    });

    function growingRows(): () => number {
        let call = 0;
        vi.spyOn(provider as never, 'InternalRunViews').mockImplementation((async () => {
            call++;
            return [makeRunViewResult(Array.from({ length: call }, (_, i) => ({ ID: String(i + 1), Name: `Row ${i + 1}` })))];
        }) as never);
        return () => call;
    }

    it('a Remote Operation drops the lingered entry — the next identical RunView sees post-operation rows', async () => {
        const calls = growingRows();
        vi.spyOn(provider as never, 'InternalRouteOperation').mockResolvedValue({ Success: true } as never);

        const before = await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(before[0].Results).toHaveLength(1);

        const op = await provider.RouteOperation('Ballots.Close', { BallotID: 'b-1' });
        expect(op.Success).toBe(true);

        const after = await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(calls()).toBe(2);
        expect(after[0].Results).toHaveLength(2);
    });

    it('a FAILED Remote Operation still invalidates (it may have written part-way)', async () => {
        const calls = growingRows();
        vi.spyOn(provider as never, 'InternalRouteOperation').mockRejectedValue(new Error('boom') as never);

        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        await expect(provider.RouteOperation('Ballots.Close', {})).rejects.toThrow('boom');
        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(calls()).toBe(2);
    });

    it('an invalid operation key is rejected before routing and leaves the cache alone', async () => {
        const calls = growingRows();
        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        const op = await provider.RouteOperation('   ', {});
        expect(op.ResultCode).toBe('INVALID_OPERATION_KEY');
        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(calls()).toBe(1);
    });

    it('InvalidateRunViewDedupCache(entityNames) drops only entries touching those entities (case-insensitive)', async () => {
        const spy = vi.spyOn(provider as never, 'InternalRunViews')
            .mockResolvedValue([makeRunViewResult([{ ID: '1', Name: 'A' }])] as never);

        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        await provider.RunViews([{ EntityName: 'Orders', ResultType: 'simple' }], user);
        expect(spy).toHaveBeenCalledTimes(2);

        provider.InvalidateRunViewDedupCache(['  ORDERS ']);
        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(spy).toHaveBeenCalledTimes(2); // Customers still lingering
        await provider.RunViews([{ EntityName: 'Orders', ResultType: 'simple' }], user);
        expect(spy).toHaveBeenCalledTimes(3); // Orders re-executed
    });

    it('InvalidateRunViewDedupCache() with no (or an empty list of) names drops every entry', async () => {
        const spy = vi.spyOn(provider as never, 'InternalRunViews')
            .mockResolvedValue([makeRunViewResult([{ ID: '1', Name: 'A' }])] as never);

        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        await provider.RunViews([{ EntityName: 'Orders', ResultType: 'simple' }], user);
        provider.InvalidateRunViewDedupCache([]);
        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        await provider.RunViews([{ EntityName: 'Orders', ResultType: 'simple' }], user);
        expect(spy).toHaveBeenCalledTimes(4);

        provider.InvalidateRunViewDedupCache();
        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(spy).toHaveBeenCalledTimes(5);
    });

    it('an in-flight RunView is not joined after an invalidation, but its original caller still gets its result', async () => {
        let release: (() => void) | undefined;
        let call = 0;
        vi.spyOn(provider as never, 'InternalRunViews').mockImplementation((async () => {
            call++;
            if (call === 1) {
                await new Promise<void>(resolve => { release = resolve; });
                return [makeRunViewResult([{ ID: '1', Name: 'pre-write' }])];
            }
            return [makeRunViewResult([{ ID: '1', Name: 'post-write' }])];
        }) as never);

        const first = provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        await vi.waitFor(() => expect(release).toBeDefined());
        provider.InvalidateRunViewDedupCache();
        const second = provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        release!();

        const [r1, r2] = await Promise.all([first, second]);
        expect(call).toBe(2);
        expect((r1[0].Results[0] as { Name: string }).Name).toBe('pre-write');
        expect((r2[0].Results[0] as { Name: string }).Name).toBe('post-write');

        // and the pre-write result did not linger: a third call gets post-write rows from the second run
        const r3 = await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect((r3[0].Results[0] as { Name: string }).Name).toBe('post-write');
    });
});
