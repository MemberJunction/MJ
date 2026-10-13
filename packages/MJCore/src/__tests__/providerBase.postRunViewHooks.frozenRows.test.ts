/**
 * PostRunView hooks vs the freeze-on-write cache — the server miss path.
 *
 * On a server-side provider (`TrustLocalCacheCompletely`), `PostRunView` stores the result in
 * `LocalCacheManager` BEFORE running the registered PostRunView hooks — and the cache
 * deep-freezes the rows it stores on reference-sharing storage. So the rows a hook receives on
 * every cache miss ARE the frozen cache rows.
 *
 * That collides with the hook's own JSDoc ("Can modify the result (e.g., filtering or
 * augmenting data)"): the natural in-place implementation of a masking/augmenting hook now
 * throws. These tests pin the real contract for the fix (PR #3425 review, finding M4):
 *
 *   1. hooks receive frozen rows (the ordering + exposure, so a refactor can't silently move it),
 *   2. in-place ROW mutation inside a hook fails loudly rather than corrupting the cache,
 *   3. a hook that RETURNS a replacement result has it honored on the singular server path.
 *      The hook type is `(...) => RunViewResult | Promise<RunViewResult>`, and the client and
 *      server BATCH paths always honored it, but the singular path reassigned a local while
 *      `RunView` returned its own reference — so the replacement was silently dropped.
 *      Pre-freeze that was masked by hooks mutating rows in place; the freeze removed that
 *      workaround, leaving no way for a signature-conformant hook to modify singular server
 *      results. `PostRunView` now copies the replacement onto the result it was handed,
 *   4. reassigning `results.Results` ON the passed result object works today (the result object
 *      itself is not frozen) and never leaks into the cached slot — the one pattern that is safe
 *      on every path, before and after the propagation fix.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RegisterDataHook, ClearAllDataHooks, PostRunViewHook } from '../generic/dataHooks';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';
import { MockCacheStorageProvider } from './mocks/MockCacheStorageProvider';
import { LocalCacheManager } from '../generic/localCacheManager';
import { ProviderConfigDataBase, RunViewResult } from '../generic/interfaces';
import { UserInfo, UserRoleInfo } from '../generic/securityInfo';
import { GetGlobalObjectStore } from '@memberjunction/global';

const TEST_ROLE_ID = 'role-hook-test';

/**
 * Server-style provider: trusts its local cache completely, so RunView takes the direct
 * Pre → Internal → Post pipeline whose PostRunView writes to (and freezes via) the cache.
 */
class ServerHookTestProvider extends TestMetadataProvider {
    protected override get TrustLocalCacheCompletely(): boolean {
        return true;
    }
}

/**
 * Minimal metadata with ONE cache-allowed entity. `AllowCaching: true` and
 * `TrustServerCacheCompletely: true` are what make the RunView cache-eligible, which is the
 * whole point — without the cache write there is no freeze and these tests prove nothing.
 */
const HOOK_TEST_METADATA = {
    Applications: [],
    Entities: [
        {
            ID: 'entity-hookcustomers',
            Name: 'Hook Customers',
            SchemaName: 'dbo',
            BaseView: 'vwHookCustomers',
            BaseTable: 'HookCustomers',
            IncludeInAPI: true,
            AllowCreateAPI: true,
            AllowUpdateAPI: true,
            AllowDeleteAPI: true,
            AllowCaching: true,
            TrustServerCacheCompletely: true,
            EntityFields: [
                { ID: 'f-hc-1', EntityID: 'entity-hookcustomers', Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
                { ID: 'f-hc-2', EntityID: 'entity-hookcustomers', Name: 'Name', Type: 'nvarchar', IsPrimaryKey: false, Sequence: 2 },
            ],
            EntityPermissions: [
                { EntityID: 'entity-hookcustomers', RoleID: TEST_ROLE_ID, CanCreate: true, CanRead: true, CanUpdate: true, CanDelete: true },
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
    Roles: [{ ID: TEST_ROLE_ID, Name: 'HookTestRole' }],
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

function makeRows(): Record<string, unknown>[] {
    return [
        { ID: 'hc-1', Name: 'Alice', __mj_UpdatedAt: '2026-01-01T00:00:00.000Z' },
        { ID: 'hc-2', Name: 'Bob', __mj_UpdatedAt: '2026-01-02T00:00:00.000Z' },
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
    u.ID = 'hook-user-1';
    u.Name = 'Hook Test User';
    u.Email = 'hook-user-1@test.com';
    u.IsActive = true;
    const role = new UserRoleInfo({ UserID: u.ID, RoleID: TEST_ROLE_ID, Role: 'HookTestRole' });
    (u as unknown as Record<string, unknown>)['_UserRoles'] = [role];
    return u;
}

function resetLocalCacheManager() {
    const g = GetGlobalObjectStore();
    delete g['___SINGLETON__LocalCacheManager'];
}

describe('PostRunView hooks receive frozen cache rows (server miss path)', () => {
    let provider: ServerHookTestProvider;
    let user: UserInfo;

    beforeEach(async () => {
        ClearAllDataHooks();

        // Real LocalCacheManager on reference-sharing storage — the freeze is armed.
        resetLocalCacheManager();
        await LocalCacheManager.Instance.Initialize(new MockCacheStorageProvider(), {
            enabled: true,
            maxSizeBytes: 50 * 1024 * 1024,
            defaultTTLMs: 5 * 60 * 1000,
            evictionPolicy: 'lru',
        });

        provider = new ServerHookTestProvider();
        provider.setMockDelay(0);
        provider.setMockMetadata(HOOK_TEST_METADATA);
        await provider.Config(new ProviderConfigDataBase({}, '__mj', [], [], true));

        user = makeUser();
    });

    afterEach(() => {
        ClearAllDataHooks();
        vi.restoreAllMocks();
        resetLocalCacheManager();
    });

    it('hands hooks the frozen cache rows on a cache miss (the write precedes the hooks)', async () => {
        vi.spyOn(provider as never, 'InternalRunView').mockResolvedValue(makeRunViewResult(makeRows()) as never);

        let sawFrozenArray = false;
        let sawFrozenRow = false;
        const hook: PostRunViewHook = (_params, results) => {
            sawFrozenArray = Object.isFrozen(results.Results);
            sawFrozenRow = Object.isFrozen(results.Results[0]);
            return results;
        };
        RegisterDataHook('PostRunView', hook);

        const result = await provider.RunView({ EntityName: 'Hook Customers', ResultType: 'simple' }, user);

        expect(result.Success).toBe(true);
        expect(result.Results).toHaveLength(2);
        // If either flag is false, the cache write no longer precedes the hooks (or the freeze
        // is disarmed) and the doc'd hook contract below rests on nothing.
        expect(sawFrozenArray).toBe(true);
        expect(sawFrozenRow).toBe(true);
    });

    it('a hook that mutates rows in place fails loudly instead of corrupting the cache', async () => {
        vi.spyOn(provider as never, 'InternalRunView').mockResolvedValue(makeRunViewResult(makeRows()) as never);

        // The documented-but-unsafe reading of "can modify the result": write onto the rows.
        const inPlaceMaskingHook: PostRunViewHook = (_params, results) => {
            for (const r of results.Results as Record<string, unknown>[]) {
                r['Name'] = 'MASKED';
            }
            return results;
        };
        RegisterDataHook('PostRunView', inPlaceMaskingHook);

        await expect(
            provider.RunView({ EntityName: 'Hook Customers', ResultType: 'simple' }, user)
        ).rejects.toThrow(TypeError);

        // The loud failure is the point: the cached slot survived the attempt untouched.
        ClearAllDataHooks();
        const reread = await provider.RunView({ EntityName: 'Hook Customers', ResultType: 'simple' }, user);
        expect(reread.Success).toBe(true);
        expect((reread.Results[0] as Record<string, unknown>)['Name']).toBe('Alice');
    });

    it('honors a hook that RETURNS a replacement result, like the client and batch paths do', async () => {
        // Encodes the hook signature's contract: `PostRunViewHook` returns a RunViewResult and
        // the pipeline must use it. Fails today because PostRunView reassigns its local
        // parameter (providerBase.ts ~2972) and RunView returns its own reference — the
        // replacement is dropped. hooks.integration.test.ts proves the CLIENT path honors the
        // same hook; PostRunViews (batch) honors it via `results[i] = ...`.
        vi.spyOn(provider as never, 'InternalRunView').mockResolvedValue(makeRunViewResult(makeRows()) as never);

        const copyMaskingHook: PostRunViewHook = (_params, results) => ({
            ...results,
            Results: (results.Results as Record<string, unknown>[]).map(r => ({ ...r, Name: 'MASKED' })),
        });
        RegisterDataHook('PostRunView', copyMaskingHook);

        const masked = await provider.RunView({ EntityName: 'Hook Customers', ResultType: 'simple' }, user);
        expect(masked.Success).toBe(true);
        expect((masked.Results[0] as Record<string, unknown>)['Name']).toBe('MASKED');
        // The caller owns the hook's copies outright.
        expect(Object.isFrozen(masked.Results)).toBe(false);
        expect(Object.isFrozen(masked.Results[0])).toBe(false);

        // And the shared cached slot still serves the original shape.
        ClearAllDataHooks();
        const reread = await provider.RunView({ EntityName: 'Hook Customers', ResultType: 'simple' }, user);
        expect(reread.Success).toBe(true);
        expect((reread.Results[0] as Record<string, unknown>)['Name']).toBe('Alice');
    });

    it('a hook that reassigns results.Results onto the PASSED result object works today and never leaks into the cache', async () => {
        // The one pattern safe on every path, before and after the propagation fix: the
        // RunViewResult OBJECT is not frozen (only the cached array and rows are), so replacing
        // its Results property with mapped copies both takes effect and leaves the shared slot
        // alone. This is what the M4 doc fix should recommend.
        vi.spyOn(provider as never, 'InternalRunView').mockResolvedValue(makeRunViewResult(makeRows()) as never);

        const reassignMaskingHook: PostRunViewHook = (_params, results) => {
            results.Results = (results.Results as Record<string, unknown>[]).map(r => ({ ...r, Name: 'MASKED' }));
            return results;
        };
        RegisterDataHook('PostRunView', reassignMaskingHook);

        const masked = await provider.RunView({ EntityName: 'Hook Customers', ResultType: 'simple' }, user);
        expect(masked.Success).toBe(true);
        expect((masked.Results[0] as Record<string, unknown>)['Name']).toBe('MASKED');
        expect(Object.isFrozen(masked.Results)).toBe(false);
        expect(Object.isFrozen(masked.Results[0])).toBe(false);

        ClearAllDataHooks();
        const reread = await provider.RunView({ EntityName: 'Hook Customers', ResultType: 'simple' }, user);
        expect(reread.Success).toBe(true);
        expect((reread.Results[0] as Record<string, unknown>)['Name']).toBe('Alice');
    });
});
