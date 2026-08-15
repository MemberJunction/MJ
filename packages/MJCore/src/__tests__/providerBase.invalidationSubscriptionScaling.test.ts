/**
 * Regression test for a Critical memory leak: `ProviderBase.ensureInflightViewInvalidation()`
 * used to call `MJGlobal.Instance.GetEventListener(false).subscribe(...)` once PER PROVIDER
 * INSTANCE and never stored/unsubscribed the returned `Subscription`. `MJGlobal`'s event bus is
 * a process-lifetime `Subject` that retains every subscriber forever unless it explicitly
 * unsubscribes.
 *
 * MJServer mints a brand-new `DatabaseProviderBase` on EVERY GraphQL request
 * (`createPerRequestProviders` in `packages/MJServer/src/context.ts`) and the durable
 * task-graph dispatcher mints one per task execution (`TaskGraphProviderFactory`). Because the
 * first `RunView`/`RunViews` call on a fresh provider always wired the subscription, this pinned
 * one full provider object graph (connection pool reference, entity metadata, `_inflightViews`)
 * per request/task, forever, with no upper bound — unbounded, load-proportional heap growth.
 *
 * The fix subscribes to the event bus exactly ONCE per process and fans events out to every
 * still-live provider via `WeakRef`, so creating more provider instances never adds more
 * subscribers to the shared bus.
 */
import { describe, it, expect, vi } from 'vitest';
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

/** Builds a configured provider and fires one RunViews call so it wires write-invalidation. */
async function makeAndTouchProvider(user: UserInfo): Promise<TestMetadataProvider> {
    const provider = new TestMetadataProvider();
    provider.setMockDelay(0);
    provider.setMockMetadata(MOCK_METADATA);
    await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
    vi.spyOn(provider as never, 'InternalRunViews').mockResolvedValue([makeRunViewResult([])] as never);
    await provider.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
    return provider;
}

describe('ProviderBase write-invalidation event-bus subscription scaling', () => {
    it('creating many provider instances never adds more than one subscriber to the process-wide event bus', async () => {
        const user = makeUser();
        const events$ = MJGlobal.Instance.GetEventListener(false);
        const subscribeSpy = vi.spyOn(events$, 'subscribe');

        await makeAndTouchProvider(user);
        const callsAfterFirst = subscribeSpy.mock.calls.length;

        // Simulates 20 more per-request/per-task providers, the exact shape of
        // MJServer's createPerRequestProviders() and TaskGraphProviderFactory.
        for (let i = 0; i < 20; i++) {
            await makeAndTouchProvider(user);
        }
        const callsAfterMany = subscribeSpy.mock.calls.length;

        // Prior behavior: each provider's first RunViews call added its own subscription to the
        // process-wide Subject, which never releases subscribers — 20 more providers would have
        // meant 20 more permanent subscribers. Fixed behavior: the bus is subscribed at most once
        // per process, so creating more providers must not add more subscribers.
        expect(callsAfterMany).toBe(callsAfterFirst);
    });

    it('still fans out entity-invalidation events to every live provider instance (no functional regression)', async () => {
        const user = makeUser();
        const providers = await Promise.all([makeAndTouchProvider(user), makeAndTouchProvider(user), makeAndTouchProvider(user)]);

        let refetchCount = 0;
        for (const p of providers) {
            vi.spyOn(p as never, 'InternalRunViews').mockImplementation((async () => {
                refetchCount++;
                return [makeRunViewResult([{ ID: '1', Name: 'A' }])];
            }) as never);
            // Prime each provider's linger cache with an entry for Customers.
            await p.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        }
        refetchCount = 0;

        raiseEntityEvent('save', 'Customers');

        for (const p of providers) {
            await p.RunViews([{ EntityName: 'Customers', ResultType: 'simple' }], user);
        }

        // Every provider's lingered entry was dropped by the single fan-out subscription,
        // so all three re-executed instead of replaying a stale lingered result.
        expect(refetchCount).toBe(3);
    });
});
