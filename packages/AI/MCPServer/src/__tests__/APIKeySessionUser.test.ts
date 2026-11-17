/**
 * An MCP session authenticated with an MJ API key must carry the same per-key restrictions MJAPI
 * stamps on a GraphQL request (packages/MJServer/src/context.ts): the key's row-filter bindings and
 * its server-derived acting context, on a CLONE of the cached user — never on the shared instance.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage } from 'http';
import type { APIKeyActingContext, UserInfo } from '@memberjunction/core';
import { BuildAPIKeySessionUser, SystemKeyMatches } from '../auth/APIKeySessionUser.js';
import type { APIKeySessionUserDeps } from '../auth/APIKeySessionUser.js';

type RowFilters = UserInfo['APIKeyRowFilters'];

const cached = { ID: 'u1', Email: 'u1@example.test' } as unknown as UserInfo;
const request = { headers: {} } as IncomingMessage;
const bindings = [{ EntityID: 'e1', FilterText: 'OwnerID = 1' }] as unknown as RowFilters;
const acting = { ActingUserID: 'a1' } as unknown as APIKeyActingContext;

function deps(overrides: Partial<APIKeySessionUserDeps> = {}): APIKeySessionUserDeps {
    return {
        CloneUser: (u: UserInfo) => ({ ...u }) as UserInfo,
        GetRowFilterBindingsForKey: vi.fn(() => bindings),
        ActingContextResolver: undefined,
        ...overrides,
    };
}

describe('BuildAPIKeySessionUser', () => {
    it('stamps the key\'s row-filter bindings on a clone, leaving the cached user untouched', async () => {
        const d = deps();
        const user = await BuildAPIKeySessionUser(cached, 'key-1', request, d);

        expect(user).not.toBe(cached);
        expect(user.APIKeyRowFilters).toBe(bindings);
        expect(cached.APIKeyRowFilters).toBeUndefined();
        expect(d.GetRowFilterBindingsForKey).toHaveBeenCalledWith('key-1');
    });

    it('stamps the acting context the deployment resolver derives, passing it the clone', async () => {
        const resolver = vi.fn(async () => acting);
        const user = await BuildAPIKeySessionUser(cached, 'key-1', request, deps({ ActingContextResolver: resolver }));

        expect(user.APIKeyActingContext).toBe(acting);
        expect(resolver).toHaveBeenCalledWith(request, user, 'key-1');
    });

    it('leaves the acting context unset when no resolver is registered (filters needing it fail closed)', async () => {
        const user = await BuildAPIKeySessionUser(cached, 'key-1', request, deps());
        expect(user.APIKeyActingContext).toBeUndefined();
    });

    it('fails closed when the row-filter bindings cannot be read', async () => {
        const d = deps({ GetRowFilterBindingsForKey: () => { throw new Error('API key cache not loaded'); } });
        await expect(BuildAPIKeySessionUser(cached, 'key-1', request, d)).rejects.toThrow('API key cache not loaded');
    });
});

describe('SystemKeyMatches', () => {
    it('matches only the exact configured key', () => {
        expect(SystemKeyMatches('s3cret-value', 's3cret-value')).toBe(true);
        expect(SystemKeyMatches('s3cret-valuf', 's3cret-value')).toBe(false);
        expect(SystemKeyMatches('s3cret', 's3cret-value')).toBe(false);
    });

    it('never matches when no system key is configured', () => {
        expect(SystemKeyMatches('', undefined)).toBe(false);
        expect(SystemKeyMatches('anything', undefined)).toBe(false);
        expect(SystemKeyMatches('', '')).toBe(false);
    });
});
