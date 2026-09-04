/**
 * UserViewResolver.updateWhereClause.test.ts — the `UpdateWhereClause` query.
 *
 * The endpoint exists so a dev can FORCE a view's WhereClause to be regenerated. Three things
 * have to hold for it to actually do that:
 *   1. it must use the READ-WRITE provider (it calls Save(); on a read-replica deployment the
 *      read-only provider would route the write to the replica);
 *   2. it must AWAIT the forced `UpdateWhereClause(true)` before saving — the un-awaited call it
 *      used to make raced `Save()`, and `Save()` itself will not trigger a second pass because no
 *      filter field is dirty;
 *   3. it must fail clearly when the view cannot be loaded instead of saving a blank record.
 */
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { DatabaseProviderBase } from '@memberjunction/core';

// The resolver's import chain reaches the 88k-line generated GraphQL schema (which loads server
// config at import time) and the type-graphql decorators. None of that is under test here — the
// provider selection (`../util.js`) and the resolver body are — so neutralize the chain.
vi.mock('@memberjunction/server', () => {
    const noopDecorator = () => () => undefined;
    return { Arg: noopDecorator, Ctx: noopDecorator, Query: noopDecorator, Resolver: noopDecorator, Int: {} };
});
vi.mock('../generated/generated.js', () => ({
    MJUserView_: class {},
    // Only the one ResolverBase member the query uses.
    MJUserViewResolverBase: class {
        protected GetUserFromPayload(userPayload: { userRecord?: unknown } | undefined) {
            return userPayload?.userRecord;
        }
    },
}));
vi.mock('../resolvers/UserResolver.js', () => ({ UserResolver: class {} }));

import { UserViewResolver } from '../resolvers/UserViewResolver.js';
import type { AppContext, ProviderInfo, UserPayload } from '../types.js';

const VIEW_ID = '0F8FAD5B-D9CB-469F-A165-70867728950E';
const USER = { ID: 'user-1', Email: 'dev@example.com' } as unknown as UserInfo;

interface FakeView {
    Load: ReturnType<typeof vi.fn>;
    UpdateWhereClause: ReturnType<typeof vi.fn>;
    Save: ReturnType<typeof vi.fn>;
    GetAll: ReturnType<typeof vi.fn>;
}

function makeView(opts: { loadOk: boolean; saveOk?: boolean }): { view: FakeView; order: string[] } {
    const order: string[] = [];
    const view: FakeView = {
        Load: vi.fn(async () => { order.push('load'); return opts.loadOk; }),
        // Resolve on a later tick so an un-awaited call would let Save() run first.
        UpdateWhereClause: vi.fn(() => new Promise<void>(resolve => setTimeout(() => { order.push('update'); resolve(); }, 5))),
        Save: vi.fn(async () => { order.push('save'); return opts.saveOk ?? true; }),
        GetAll: vi.fn(() => ({ ID: VIEW_ID, WhereClause: '[IsActive] = 1' })),
    };
    return { view, order };
}

function makeProvider(view: FakeView): DatabaseProviderBase & { GetEntityObject: ReturnType<typeof vi.fn> } {
    return { GetEntityObject: vi.fn(async () => view) } as unknown as DatabaseProviderBase & { GetEntityObject: ReturnType<typeof vi.fn> };
}

function makeContext(providers: ProviderInfo[]): AppContext {
    return {
        providers,
        userPayload: { userRecord: USER } as unknown as UserPayload,
    } as unknown as AppContext;
}

describe('UserViewResolver.UpdateWhereClause', () => {
    it('uses the READ-WRITE provider, awaits the forced regeneration, then saves and returns the record', async () => {
        const { view, order } = makeView({ loadOk: true });
        const readOnly = makeProvider(makeView({ loadOk: true }).view);
        const readWrite = makeProvider(view);
        const ctx = makeContext([
            { provider: readOnly, type: 'Read-Only' },
            { provider: readWrite, type: 'Read-Write' },
        ]);

        const result = await new UserViewResolver().UpdateWhereClause(VIEW_ID, ctx);

        expect(readWrite.GetEntityObject).toHaveBeenCalledWith('MJ: User Views', USER);
        expect(readOnly.GetEntityObject).not.toHaveBeenCalled();
        expect(view.Load).toHaveBeenCalledWith(VIEW_ID);
        expect(view.UpdateWhereClause).toHaveBeenCalledWith(true);
        // The regeneration must complete BEFORE Save() runs.
        expect(order).toEqual(['load', 'update', 'save']);
        expect(result).toEqual({ ID: VIEW_ID, WhereClause: '[IsActive] = 1' });
    });

    it('falls back to the only provider available when no read-write provider is registered', async () => {
        const { view } = makeView({ loadOk: true });
        const only = makeProvider(view);
        await new UserViewResolver().UpdateWhereClause(VIEW_ID, makeContext([{ provider: only, type: 'Read-Only' }]));
        expect(only.GetEntityObject).toHaveBeenCalledTimes(1);
        expect(view.Save).toHaveBeenCalledTimes(1);
    });

    it('throws and never regenerates or saves when the view cannot be loaded', async () => {
        const { view } = makeView({ loadOk: false });
        const ctx = makeContext([{ provider: makeProvider(view), type: 'Read-Write' }]);
        await expect(new UserViewResolver().UpdateWhereClause(VIEW_ID, ctx)).rejects.toThrow(/not found or access denied/);
        expect(view.UpdateWhereClause).not.toHaveBeenCalled();
        expect(view.Save).not.toHaveBeenCalled();
    });

    it('throws when Save() reports failure', async () => {
        const { view } = makeView({ loadOk: true, saveOk: false });
        const ctx = makeContext([{ provider: makeProvider(view), type: 'Read-Write' }]);
        await expect(new UserViewResolver().UpdateWhereClause(VIEW_ID, ctx)).rejects.toThrow(/Failed to update where clause/);
    });
});
