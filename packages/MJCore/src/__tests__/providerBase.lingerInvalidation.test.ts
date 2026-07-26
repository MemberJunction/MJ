/**
 * Tests write-invalidation of the RunView dedup/linger cache.
 *
 * A resolved RunViews result lingers for DedupLingerMs (5s) so identical calls
 * can share it. Without invalidation, a caller re-running the identical view
 * within the window AFTER a save receives PRE-save rows. Observed live: an
 * engine's debounced post-save refreshes for multiple sequential saves — the
 * second refresh linger-hit the first refresh's result, so only the first
 * save's data ever reached the UI (Home dashboard showed the 1st added app
 * but none beyond it).
 *
 * The fix: entries record the entity names their params touch; BaseEntity
 * save/delete/remote-invalidate events drop matching entries (lingered AND
 * in-flight).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MJGlobal, MJEventType } from '@memberjunction/global';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { BaseEntity } from '../generic/baseEntity';

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

/** Raises a BaseEntity-style event on the MJGlobal bus, the way BaseEntity.RaiseEvent does. */
function raiseEntityEvent(type: 'save' | 'delete' | 'remote-invalidate', entityName: string): void {
    const args = type === 'remote-invalidate'
        ? { type, entityName, payload: {} }
        : { type, baseEntity: { EntityInfo: { Name: entityName } }, payload: {} };
    MJGlobal.Instance.RaiseEvent({
        event: MJEventType.ComponentEvent,
        eventCode: BaseEntity.BaseEventCode,
        component: null,
        args,
    });
}

describe('ProviderBase dedup/linger write-invalidation', () => {
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

    it('baseline: identical sequential calls within the window share the lingered result (single execution)', async () => {
        const spy = vi.spyOn(provider as never, 'InternalRunViews')
            .mockResolvedValue([makeRunViewResult([{ ID: '1', Name: 'A' }])] as never);

        const r1 = await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        const r2 = await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);

        expect(spy).toHaveBeenCalledTimes(1);
        expect(r1[0].Results).toHaveLength(1);
        expect(r2[0].Results).toHaveLength(1);
    });

    it('a save event for the entity drops the lingered entry — the next identical call re-executes and sees post-save data', async () => {
        let call = 0;
        vi.spyOn(provider as never, 'InternalRunViews').mockImplementation((async () => {
            call++;
            return call === 1
                ? [makeRunViewResult([{ ID: '1', Name: 'A' }])]
                : [makeRunViewResult([{ ID: '1', Name: 'A' }, { ID: '2', Name: 'B' }])];
        }) as never);

        const r1 = await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(r1[0].Results).toHaveLength(1);

        raiseEntityEvent('save', 'Customers'); // e.g. the 2nd of two sequential row creates

        const r2 = await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(call).toBe(2); // fresh execution, no stale linger hit
        expect(r2[0].Results).toHaveLength(2); // post-save rows arrived
    });

    it('a save event for an UNRELATED entity leaves the lingered entry intact', async () => {
        const spy = vi.spyOn(provider as never, 'InternalRunViews')
            .mockResolvedValue([makeRunViewResult([{ ID: '1', Name: 'A' }])] as never);

        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        raiseEntityEvent('save', 'Orders');
        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);

        expect(spy).toHaveBeenCalledTimes(1); // linger still valid for Customers
    });

    it('delete and remote-invalidate events also drop matching entries', async () => {
        const spy = vi.spyOn(provider as never, 'InternalRunViews')
            .mockResolvedValue([makeRunViewResult([{ ID: '1', Name: 'A' }])] as never);

        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        raiseEntityEvent('delete', 'Customers');
        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(spy).toHaveBeenCalledTimes(2);

        raiseEntityEvent('remote-invalidate', 'Customers');
        await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        expect(spy).toHaveBeenCalledTimes(3);
    });

    it('entity-name matching is case-insensitive (events carry registered casing, params may differ)', async () => {
        const spy = vi.spyOn(provider as never, 'InternalRunViews')
            .mockResolvedValue([makeRunViewResult([{ ID: '1', Name: 'A' }])] as never);

        await provider.RunViews([{ EntityName: 'customers', ResultType: 'simple' }], user);
        raiseEntityEvent('save', 'CUSTOMERS');
        await provider.RunViews([{ EntityName: 'customers', ResultType: 'simple' }], user);

        expect(spy).toHaveBeenCalledTimes(2);
    });

    it('a save event while a request is IN FLIGHT prevents later callers from sharing the pre-commit read', async () => {
        let call = 0;
        let releaseFirst!: () => void;
        const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

        vi.spyOn(provider as never, 'InternalRunViews').mockImplementation((async () => {
            call++;
            if (call === 1) {
                await firstGate; // hold the first execution open
                return [makeRunViewResult([{ ID: '1', Name: 'A' }])];
            }
            return [makeRunViewResult([{ ID: '1', Name: 'A' }, { ID: '2', Name: 'B' }])];
        }) as never);

        const p1 = provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        await new Promise(r => setTimeout(r, 30)); // let call 1 pass the coalesce window and start executing

        raiseEntityEvent('save', 'Customers'); // write commits while the read is in flight

        const p2 = provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        await new Promise(r => setTimeout(r, 30)); // let call 2 flush its own coalesce window
        releaseFirst();

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(call).toBe(2); // p2 forked a fresh execution instead of sharing p1's pre-commit read
        expect(r1[0].Results).toHaveLength(1);
        expect(r2[0].Results).toHaveLength(2);
    });
});
