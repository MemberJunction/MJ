/**
 * A server RunView after a save returns the saved rows (#3059).
 *
 * The server trusts its RunView cache completely, and the cache is maintained from BaseEntity
 * events after the save returns. A read that a save overtook used to store its pre-save rows,
 * which every later read then served as a hit. These tests run the real ProviderBase pipeline
 * (PreRunView → InternalRunView → PostRunView) over the real LocalCacheManager.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GetGlobalObjectStore, MJEventType, MJGlobal } from '@memberjunction/global';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { LocalCacheManager } from '../generic/localCacheManager';
import { ProviderBase } from '../generic/providerBase';
import { BaseEntity } from '../generic/baseEntity';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';

const TEST_ROLE_ID = 'role-read-after-write';
const ENTITY = 'Fence Customers';

/** Server-style provider: RunView takes the direct Pre → Internal → Post pipeline. */
class ServerProvider extends TestMetadataProvider {
    protected override get TrustLocalCacheCompletely(): boolean {
        return true;
    }
}

const METADATA = {
    Applications: [],
    Entities: [{
        ID: 'entity-fence-customers',
        Name: ENTITY,
        SchemaName: 'dbo',
        BaseView: 'vwFenceCustomers',
        BaseTable: 'FenceCustomers',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        AllowCaching: true,
        TrustServerCacheCompletely: true,
        EntityFields: [
            { ID: 'fc-1', EntityID: 'entity-fence-customers', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
            { ID: 'fc-2', EntityID: 'entity-fence-customers', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
            { ID: 'fc-3', EntityID: 'entity-fence-customers', Name: 'Status', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 3 },
        ],
        EntityPermissions: [
            { EntityID: 'entity-fence-customers', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
    }],
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
    Roles: [{ ID: TEST_ROLE_ID, Name: 'ReadAfterWriteRole' }],
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

type Row = { ID: string; Name: string; Status: string };

function result(rows: Row[]): RunViewResult {
    return { Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: '', UserViewRunID: '' };
}

function makeUser(): UserInfo {
    const u = new UserInfo();
    u.ID = 'read-after-write-user';
    u.Name = 'Read After Write User';
    u.Email = 'raw-user@test.com';
    u.IsActive = true;
    const role = new UserRoleInfo({ UserID: u.ID, RoleID: TEST_ROLE_ID, Role: 'ReadAfterWriteRole' });
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [role];
    return u;
}

/** Lets fire-and-forget event handlers finish. */
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

describe('ProviderBase server RunView reads its own writes (#3059)', () => {
    let provider: ServerProvider;
    let user: UserInfo;
    let originalLingerMs: number;
    /** What the database holds; the InternalRunView stand-in reads it. */
    let table: Row[];

    function raiseSave(row: Row): void {
        const entityInfo = provider.EntityByName(ENTITY);
        MJGlobal.Instance.RaiseEvent({
            event: MJEventType.ComponentEvent,
            eventCode: BaseEntity.BaseEventCode,
            component: null,
            args: { type: 'save', payload: null, baseEntity: { EntityInfo: entityInfo, ProviderToUse: provider, GetAll: () => ({ ...row }) } },
        });
    }

    /** A committed save: the row is in the table, then the event is raised. */
    function save(row: Row): void {
        table = [...table.filter(r => r.ID !== row.ID), row];
        raiseSave(row);
    }

    const activeView = { EntityName: ENTITY, ExtraFilter: "Status='Active'", ResultType: 'simple' as const, CacheLocal: true };

    function activeIds(rows: unknown[]): string[] {
        return (rows as Row[]).map(r => r.ID).sort();
    }

    beforeEach(async () => {
        originalLingerMs = ProviderBase.DedupLingerMs;
        ProviderBase.DedupLingerMs = 0;
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider());

        provider = new ServerProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(METADATA);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));
        user = makeUser();
        table = [{ ID: 'c1', Name: 'one', Status: 'Active' }];
    });

    afterEach(() => {
        ProviderBase.DedupLingerMs = originalLingerMs;
        vi.restoreAllMocks();
        delete GetGlobalObjectStore()['___SINGLETON__LocalCacheManager'];
    });

    it('a read overtaken by a save does not cache its pre-save rows', async () => {
        let overtaken = true;
        const internal = vi.spyOn(provider as never, 'InternalRunView').mockImplementation((async () => {
            const snapshot = table.filter(r => r.Status === 'Active');
            if (overtaken) {
                // The save commits while this read is in flight; the read returns what it saw.
                overtaken = false;
                save({ ID: 'c2', Name: 'two', Status: 'Active' });
                await settle();
            }
            return result(snapshot);
        }) as never);

        const first = await provider.RunView(activeView, user);
        expect(activeIds(first.Results)).toEqual(['c1']);

        const second = await provider.RunView(activeView, user);
        expect(internal).toHaveBeenCalledTimes(2);
        expect(activeIds(second.Results)).toEqual(['c1', 'c2']);

        // The second read began after the save, so its rows are cached and served.
        const third = await provider.RunView(activeView, user);
        expect(internal).toHaveBeenCalledTimes(2);
        expect(activeIds(third.Results)).toEqual(['c1', 'c2']);
    });

    it('after a burst of saves on a cached filtered view, a plain RunView returns the post-write set', async () => {
        vi.spyOn(provider as never, 'InternalRunView').mockImplementation((async () =>
            result(table.filter(r => r.Status === 'Active'))) as never);

        const warm = await provider.RunView(activeView, user);
        expect(activeIds(warm.Results)).toEqual(['c1']);

        // Rapid saves, each followed at once by a read — no waiting for the cache maintenance.
        const reads: Promise<RunViewResult>[] = [];
        for (let i = 2; i <= 6; i++) {
            save({ ID: `c${i}`, Name: `n${i}`, Status: 'Active' });
            reads.push(provider.RunView(activeView, user));
        }
        save({ ID: 'c1', Name: 'one', Status: 'Inactive' });
        await Promise.all(reads);

        const final = await provider.RunView(activeView, user);
        expect(activeIds(final.Results)).toEqual(['c2', 'c3', 'c4', 'c5', 'c6']);
        await settle();
        const again = await provider.RunView(activeView, user);
        expect(activeIds(again.Results)).toEqual(['c2', 'c3', 'c4', 'c5', 'c6']);
    });
});
