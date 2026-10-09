// ResolverBase pulls in type-graphql decorators, which need the Reflect.metadata polyfill first.
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `RunViewsWithCacheCheck` is the transport `RunViews` switches to when any view in the batch is
 * `CacheLocal`, so it carries the same client-supplied clauses as `RunViews`. These tests pin that
 * it applies the same GraphQL-boundary protections before the provider is called: the base-view
 * AST screen on ExtraFilter / OrderBy / OverrideExcludeFilter, and the API-key scope check.
 *
 * Every payload here is harmless (stacked `SELECT`s); the point is only whether it reaches the
 * provider. The provider's own keyword denylist accepts the bracket-identifier payload, because a
 * quote inside `[a']` hides the rest of the text from its literal stripper.
 */

const { authorize } = vi.hoisted(() => ({ authorize: vi.fn() }));

vi.mock('@memberjunction/api-keys', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/api-keys')>();
    return { ...actual, GetAPIKeyEngine: () => ({ Authorize: authorize }) };
});

import type { DatabaseProviderBase, EntityInfo, RunViewWithCacheCheckParams, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { RunDynamicViewInput, RunViewResolver, RunViewWithCacheCheckInput } from '../generic/RunViewResolver.js';
import type { AppContext, UserPayload } from '../types.js';

/** A stacked statement hidden from the keyword denylist by a quote inside a bracket identifier. */
const BRACKET_STACKED =
    "1 = (SELECT 1 AS [a'])) ; SELECT 1 AS [x] ; SELECT * FROM __mj.vwUserViews WHERE (1 = (SELECT 1 AS [b'])";

const USER = { ID: 'user-1', Email: 'reader@example.com', Name: 'Reader' } as UserInfo;

function entity(name: string, schema: string, baseView: string): EntityInfo {
    return {
        Name: name,
        SchemaName: schema,
        BaseView: baseView,
        PrimaryKeys: [{ Name: 'ID' }],
        GetUserPermisions: () => ({ CanRead: true }),
    } as unknown as EntityInfo;
}

/** Provider double: the metadata the screen reads, and a cache-check method that records calls. */
function fakeProvider() {
    const calls: RunViewWithCacheCheckParams[][] = [];
    const entities = [
        entity('MJ: User Views', '__mj', 'vwUserViews'),
        entity('MJ: Users', '__mj', 'vwUsers'),
    ];
    const provider = {
        Entities: entities,
        EntityByName: (name: string) => entities.find((e) => e.Name === name),
        RunViewsWithCacheCheck: async (params: RunViewWithCacheCheckParams[]) => {
            calls.push(params);
            return { success: true, results: [] };
        },
    };
    return { provider: provider as unknown as DatabaseProviderBase, calls };
}

function context(provider: DatabaseProviderBase, payload: Partial<UserPayload> = {}): AppContext {
    const userPayload = { email: USER.Email, userRecord: USER, ...payload } as UserPayload;
    return { providers: [{ type: 'Read-Only', provider }], userPayload } as unknown as AppContext;
}

function cacheCheckInput(params: Partial<RunDynamicViewInput>): RunViewWithCacheCheckInput[] {
    const dynamic = Object.assign(new RunDynamicViewInput(), { EntityName: 'MJ: User Views', ...params });
    return [Object.assign(new RunViewWithCacheCheckInput(), { params: dynamic })];
}

describe('RunViewsWithCacheCheck — GraphQL-boundary clause screen', () => {
    it('refuses a stacked statement hidden behind a bracket identifier, before the provider runs', async () => {
        const { provider, calls } = fakeProvider();

        const result = await new RunViewResolver().RunViewsWithCacheCheck(
            cacheCheckInput({ ExtraFilter: BRACKET_STACKED }),
            context(provider),
        );

        expect(calls).toHaveLength(0);
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/Invalid ExtraFilter: multiple statements/);
    });

    it('refuses a subquery against a base table', async () => {
        const { provider, calls } = fakeProvider();

        const result = await new RunViewResolver().RunViewsWithCacheCheck(
            cacheCheckInput({ ExtraFilter: `EXISTS (SELECT 1 FROM __mj.[User] WHERE [Type] = 'Owner')` }),
            context(provider),
        );

        expect(calls).toHaveLength(0);
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/entity base view/);
    });

    it('screens OrderBy and OverrideExcludeFilter too', async () => {
        for (const params of [
            { OrderBy: "[a'] ; SELECT 1 AS [x] ; SELECT 1 AS [b']" },
            { OverrideExcludeFilter: BRACKET_STACKED },
        ]) {
            const { provider, calls } = fakeProvider();

            const result = await new RunViewResolver().RunViewsWithCacheCheck(cacheCheckInput(params), context(provider));

            expect(calls).toHaveLength(0);
            expect(result.success).toBe(false);
        }
    });

    it('passes a filter that only reads entity base views through to the provider', async () => {
        const { provider, calls } = fakeProvider();
        const filter = `UserID IN (SELECT ID FROM [__mj].[vwUsers] WHERE Email = 'o''brien@example.com')`;

        const result = await new RunViewResolver().RunViewsWithCacheCheck(
            cacheCheckInput({ ExtraFilter: filter, OrderBy: '[Name] DESC' }),
            context(provider),
        );

        expect(result.success).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0][0].params.ExtraFilter).toBe(filter);
    });
});

describe('RunViewsWithCacheCheck — API-key scope', () => {
    beforeEach(() => {
        authorize.mockReset();
        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue({ ID: 'system', Email: 'system@example.com' } as UserInfo);
    });

    it('refuses an API key without the batch view scope, before the provider runs', async () => {
        authorize.mockResolvedValue({ Allowed: false, Reason: 'scope not granted' });
        const { provider, calls } = fakeProvider();

        const result = await new RunViewResolver().RunViewsWithCacheCheck(
            cacheCheckInput({ ExtraFilter: `Name = 'x'` }),
            context(provider, { apiKeyHash: 'hash-of-a-narrow-key' }),
        );

        expect(calls).toHaveLength(0);
        expect(result.success).toBe(false);
        expect(result.errorMessage).toMatch(/'view:batch' scope/);
    });

    it('lets an API key holding the scope through', async () => {
        authorize.mockImplementation(async (_hash: string, _app: string, scope: string) => ({
            Allowed: scope === 'view:batch',
            Reason: scope === 'view:batch' ? 'granted' : 'not full access',
        }));
        const { provider, calls } = fakeProvider();

        const result = await new RunViewResolver().RunViewsWithCacheCheck(
            cacheCheckInput({ ExtraFilter: `Name = 'x'` }),
            context(provider, { apiKeyHash: 'hash-of-a-batch-key' }),
        );

        expect(result.success).toBe(true);
        expect(calls).toHaveLength(1);
    });
});
