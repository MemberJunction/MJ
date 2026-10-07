import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The cache-check transport's param forwarding, at the resolver.
 *
 * This map is the middle of three places a param has to be carried for the smart-cache-check
 * transport to behave like the ordinary one, and it is where three separate fields have now been
 * found missing: `Aggregates` (B40), `DataSource`, and `BypassCache`. Each omission was invisible
 * locally — the schema accepted the field, the provider could act on it, the response could carry
 * it, and only the request never asked. These pin the two that silently change what the database
 * is asked, so a fourth omission fails here rather than in a consumer's UI.
 */
const runViewsWithCacheCheck = vi.fn(async () => ({ success: true, errorMessage: null, results: [] }));

vi.mock('../util.js', () => ({
    GetReadOnlyProvider: () => ({ RunViewsWithCacheCheck: runViewsWithCacheCheck }),
    GetReadWriteProvider: () => ({ RunViewsWithCacheCheck: runViewsWithCacheCheck }),
}));

import { RunViewResolver } from '../generic/RunViewResolver.js';
import type { AppContext } from '../types.js';

/** Minimal context: the resolver only needs a provider (mocked above) and a user record. */
function context(): AppContext {
    return { providers: [], userPayload: { userRecord: { ID: 'u1', Name: 'Test' } } } as unknown as AppContext;
}

/** The params the resolver handed the provider for the single view in the batch. */
async function forwardedParams(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    runViewsWithCacheCheck.mockClear();
    const resolver = new RunViewResolver();
    await resolver.RunViewsWithCacheCheck([{ params } as never], context());
    expect(runViewsWithCacheCheck).toHaveBeenCalledTimes(1);
    const call = runViewsWithCacheCheck.mock.calls[0] as unknown as [Array<{ params: Record<string, unknown> }>];
    return call[0][0].params;
}

describe('RunViewsWithCacheCheck resolver — param forwarding', () => {
    beforeEach(() => {
        runViewsWithCacheCheck.mockClear();
    });

    it('forwards BypassCache, so a deliberate database read is not answered from the server cache', async () => {
        const forwarded = await forwardedParams({ EntityName: 'Customers', BypassCache: true });
        expect(forwarded.BypassCache).toBe(true);
    });

    it('leaves BypassCache undefined when the caller did not ask for it', async () => {
        const forwarded = await forwardedParams({ EntityName: 'Customers' });
        expect(forwarded.BypassCache).toBeUndefined();
    });

    it('still forwards DataSource and Aggregates — the two fields previously found missing here', async () => {
        const forwarded = await forwardedParams({
            EntityName: 'Customers',
            DataSource: 'Materialized',
            Aggregates: [{ expression: 'COUNT(*)', alias: 'total' }],
        });
        expect(forwarded.DataSource).toBe('Materialized');
        expect(forwarded.Aggregates).toEqual([{ expression: 'COUNT(*)', alias: 'total' }]);
    });
});
