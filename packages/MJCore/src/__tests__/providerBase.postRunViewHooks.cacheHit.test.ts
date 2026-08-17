/**
 * PostRunView hooks on the cache-HIT paths (PR #3425 review, finding M5).
 *
 * `PostRunView` is the OUTPUT half of the data-hook enforcement seam — where middleware masks
 * or audits rows before they reach the caller. Hooks receive `contextUser`, so masking is
 * PER-USER, while a cache slot is shared across users. There is therefore no way to apply
 * masking once at write time on behalf of a reader who has not arrived yet: a result served
 * from cache must run the chain, or it returns rows the miss path would have masked.
 *
 * Three of the four server paths already did this — the miss path (`PostRunView`), the mixed
 * batch (`PostRunViews`, whose loop deliberately covers cached indices too), and the client
 * smart-cache path. The two that did not were the singular cache hit and the all-cached batch,
 * which returned early. That made masking depend on whether a SIBLING view in the same batch
 * happened to miss.
 *
 * It looked correct before freeze-on-write only by accident: `PostRunView` writes the cache
 * BEFORE running the hooks, so an in-place masking hook wrote through into the cached objects.
 * That both made later hits look masked and baked one user's masking decision into a shared
 * slot. The freeze removed the write-through, exposing the gap these tests pin.
 *
 * Each test warms the slot with NO hook registered, then registers the hook and reads again —
 * so the assertion can only pass if the hook ran on the HIT.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterDataHook, ClearAllDataHooks, PostRunViewHook } from '../generic/dataHooks';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { LocalCacheManager } from '../generic/localCacheManager';
import { ProviderBase } from '../generic/providerBase';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { GetGlobalObjectStore } from '@memberjunction/global';

const TEST_ROLE_ID = 'role-cachehit-test';

/** Server-style provider: RunView takes the direct Pre → Internal → Post pipeline. */
class ServerCacheHitProvider extends TestMetadataProvider {
    protected override get TrustLocalCacheCompletely(): boolean {
        return true;
    }
}

function makeEntity(id: string, name: string, baseView: string, baseTable: string) {
    return {
        ID: id,
        Name: name,
        SchemaName: 'dbo',
        BaseView: baseView,
        BaseTable: baseTable,
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        AllowCaching: true,
        TrustServerCacheCompletely: true,
        EntityFields: [
            { ID: `${id}-f1`, EntityID: id, Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
            { ID: `${id}-f2`, EntityID: id, Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
        ],
        EntityPermissions: [
            { EntityID: id, RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
        ],
    };
}

/** Two cache-allowed entities so the batch path can run an all-cached batch of two views. */
const CACHE_HIT_METADATA = {
    Applications: [],
    Entities: [
        makeEntity('entity-hitcustomers', 'Hit Customers', 'vwHitCustomers', 'HitCustomers'),
        makeEntity('entity-hitorders', 'Hit Orders', 'vwHitOrders', 'HitOrders'),
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
    Roles: [{ ID: TEST_ROLE_ID, Name: 'CacheHitTestRole' }],
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

function makeRows(prefix: string): Record<string, unknown>[] {
    return [
        { ID: `${prefix}-1`, Name: 'Alice', __mj_UpdatedAt: '2026-01-01T00:00:00.000Z' },
        { ID: `${prefix}-2`, Name: 'Bob', __mj_UpdatedAt: '2026-01-02T00:00:00.000Z' },
    ];
}

function makeRunViewResult(rows: Record<string, unknown>[]): RunViewResult {
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

function makeUser(): UserInfo {
    const u = new UserInfo();
    u.ID = 'cachehit-user-1';
    u.Name = 'Cache Hit Test User';
    u.Email = 'cachehit-user-1@test.com';
    u.IsActive = true;
    const role = new UserRoleInfo({ UserID: u.ID, RoleID: TEST_ROLE_ID, Role: 'CacheHitTestRole' });
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [role];
    return u;
}

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

/** Masks Name onto COPIES — the pattern the frozen-row contract requires. */
const copyMaskingHook: PostRunViewHook = (_params, results) => ({
    ...results,
    Results: (results.Results as Record<string, unknown>[]).map(r => ({ ...r, Name: 'MASKED' })),
});

describe('PostRunView hooks run on cache-HIT paths', () => {
    let provider: ServerCacheHitProvider;
    let user: UserInfo;
    let originalLingerMs: number;

    beforeEach(async () => {
        ClearAllDataHooks();

        // Dedup lingers resolved results for 5s by default, which would serve the second read
        // from the linger window instead of exercising the cache-hit path under test.
        originalLingerMs = ProviderBase.DedupLingerMs;
        ProviderBase.DedupLingerMs = 0;

        // Real LocalCacheManager on reference-sharing storage — the freeze is armed.
        resetLocalCacheManager();
        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider(), {
            enabled: true,
            maxSizeBytes: 50 * 1024 * 1024,
            defaultTTLMs: 5 * 60 * 1000,
            evictionPolicy: 'lru',
        });

        provider = new ServerCacheHitProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(CACHE_HIT_METADATA);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));

        user = makeUser();
    });

    afterEach(() => {
        ClearAllDataHooks();
        ProviderBase.DedupLingerMs = originalLingerMs;
        vi.restoreAllMocks();
        resetLocalCacheManager();
    });

    describe('singular server path', () => {
        it('applies the hook chain to rows served from cache, not only from the database', async () => {
            const internalSpy = vi
                .spyOn(provider as never, 'InternalRunView')
                .mockResolvedValue(makeRunViewResult(makeRows('hc')) as never);

            // Warm the slot with no hooks registered.
            const warm = await provider.RunView({ EntityName: 'Hit Customers', ResultType: 'simple' }, user);
            expect(warm.Success).toBe(true);
            expect((warm.Results[0] as Record<string, unknown>)['Name']).toBe('Alice');
            expect(internalSpy).toHaveBeenCalledTimes(1);

            // Now register the hook — it can only affect the SECOND read, which is a cache hit.
            RegisterDataHook('PostRunView', copyMaskingHook);

            const hit = await provider.RunView({ EntityName: 'Hit Customers', ResultType: 'simple' }, user);
            expect(hit.Success).toBe(true);
            // No further DB round trip — this really was served from cache.
            expect(internalSpy).toHaveBeenCalledTimes(1);
            expect((hit.Results[0] as Record<string, unknown>)['Name']).toBe('MASKED');
            expect((hit.Results[1] as Record<string, unknown>)['Name']).toBe('MASKED');
        });

        it('does not write the hook output back into the shared cache slot', async () => {
            const internalSpy = vi
                .spyOn(provider as never, 'InternalRunView')
                .mockResolvedValue(makeRunViewResult(makeRows('hc')) as never);

            await provider.RunView({ EntityName: 'Hit Customers', ResultType: 'simple' }, user);
            RegisterDataHook('PostRunView', copyMaskingHook);
            const masked = await provider.RunView({ EntityName: 'Hit Customers', ResultType: 'simple' }, user);
            expect((masked.Results[0] as Record<string, unknown>)['Name']).toBe('MASKED');

            // The hook's replacement rows belong to this caller outright...
            expect(Object.isFrozen(masked.Results)).toBe(false);
            expect(Object.isFrozen(masked.Results[0])).toBe(false);

            // ...and the shared slot still holds the unmasked originals for the next reader.
            ClearAllDataHooks();
            const reread = await provider.RunView({ EntityName: 'Hit Customers', ResultType: 'simple' }, user);
            expect((reread.Results[0] as Record<string, unknown>)['Name']).toBe('Alice');
            expect(internalSpy).toHaveBeenCalledTimes(1);
        });

        it('passes the caller\'s contextUser to hooks on the hit path (masking is per-user)', async () => {
            vi.spyOn(provider as never, 'InternalRunView').mockResolvedValue(makeRunViewResult(makeRows('hc')) as never);
            await provider.RunView({ EntityName: 'Hit Customers', ResultType: 'simple' }, user);

            let seenUserID: string | undefined;
            RegisterDataHook('PostRunView', ((_p, results, ctxUser) => {
                seenUserID = ctxUser?.ID;
                return results;
            }) as PostRunViewHook);

            await provider.RunView({ EntityName: 'Hit Customers', ResultType: 'simple' }, user);
            expect(seenUserID).toBe('cachehit-user-1');
        });

        it('leaves cache-hit results untouched when no hooks are registered', async () => {
            const internalSpy = vi
                .spyOn(provider as never, 'InternalRunView')
                .mockResolvedValue(makeRunViewResult(makeRows('hc')) as never);

            await provider.RunView({ EntityName: 'Hit Customers', ResultType: 'simple' }, user);
            const hit = await provider.RunView({ EntityName: 'Hit Customers', ResultType: 'simple' }, user);

            expect(hit.Success).toBe(true);
            expect(hit.Results).toHaveLength(2);
            expect((hit.Results[0] as Record<string, unknown>)['Name']).toBe('Alice');
            expect(internalSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('batch path — every view served from cache', () => {
        it('applies the hook chain to every result in an all-cached batch', async () => {
            const batchParams = [
                { EntityName: 'Hit Customers', ResultType: 'simple' as const },
                { EntityName: 'Hit Orders', ResultType: 'simple' as const },
            ];
            const internalSpy = vi
                .spyOn(provider as never, 'InternalRunViews')
                .mockResolvedValue([
                    makeRunViewResult(makeRows('hc')),
                    makeRunViewResult(makeRows('ho')),
                ] as never);

            // Warm both slots with no hooks registered.
            const warm = await provider.RunViews(batchParams, user);
            expect(warm).toHaveLength(2);
            expect((warm[0].Results[0] as Record<string, unknown>)['Name']).toBe('Alice');
            expect(internalSpy).toHaveBeenCalledTimes(1);

            RegisterDataHook('PostRunView', copyMaskingHook);

            const hits = await provider.RunViews(batchParams, user);
            // All cached — no second DB round trip.
            expect(internalSpy).toHaveBeenCalledTimes(1);
            expect(hits).toHaveLength(2);
            expect((hits[0].Results[0] as Record<string, unknown>)['Name']).toBe('MASKED');
            expect((hits[1].Results[0] as Record<string, unknown>)['Name']).toBe('MASKED');
        });

        it('pairs each cached result with its own params — hooks can discriminate by entity', async () => {
            const batchParams = [
                { EntityName: 'Hit Customers', ResultType: 'simple' as const },
                { EntityName: 'Hit Orders', ResultType: 'simple' as const },
            ];
            vi.spyOn(provider as never, 'InternalRunViews').mockResolvedValue([
                makeRunViewResult(makeRows('hc')),
                makeRunViewResult(makeRows('ho')),
            ] as never);

            await provider.RunViews(batchParams, user);

            // Mask ONLY Hit Orders. If params/results were misaligned in the all-cached loop,
            // the mask would land on the wrong result and this would fail.
            RegisterDataHook('PostRunView', ((params, results) => {
                if (params.EntityName !== 'Hit Orders') {
                    return results;
                }
                return {
                    ...results,
                    Results: (results.Results as Record<string, unknown>[]).map(r => ({ ...r, Name: 'MASKED' })),
                };
            }) as PostRunViewHook);

            const hits = await provider.RunViews(batchParams, user);
            expect((hits[0].Results[0] as Record<string, unknown>)['Name']).toBe('Alice');
            expect((hits[1].Results[0] as Record<string, unknown>)['Name']).toBe('MASKED');
        });
    });
});
