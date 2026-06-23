/**
 * server-cache.checks.ts — the 'server-cache' bundle.
 *
 * PORTED VERBATIM from packages/MJServer/integration-test-scripts/server-cache-tests.ts:91-118.
 * The assertion bodies and the UniqueFilter tag ('s1') are unchanged — only the
 * surrounding suite.Test(...) registration is replaced by
 * IntegrationCheckRegistry.Instance.Register(...). Both the IntegrationTestDriver and
 * the transitional tsx script resolve these from the one registry (single source of truth).
 *
 * S1 (cache MISS) warms a cold fingerprint; S2 (cache HIT) asserts the same fingerprint
 * is served with identical shape and no rewrite. S2 only holds when S1 ran immediately
 * before, in the same process, against the same warm slot — so the driver MUST run them
 * in array order inside one Execute() against one shared IntegrationCheckContext.
 */
import { RunView } from '@memberjunction/core';
import { Assert, AssertEqual, AssertRowShape } from '../test-runner';
import { UniqueFilter } from '../instrumented-cache';
import { IntegrationCheckRegistry } from '../check-registry';

const ENTITY = 'MJ: Entities';

IntegrationCheckRegistry.Instance.Register({
    Id: 'server-cache.S1',
    Name: 'Server cache MISS — narrow Fields, cache write',
    Fn: async (ctx): Promise<void> => {
        ctx.Storage.ResetCounts();
        const rv = new RunView();
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's1'),
            Fields: ['Name', 'SchemaName'],
            ResultType: 'simple'
        }, ctx.User);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        Assert(result.Results.length > 100, `expected 100+ entities, got ${result.Results.length}`);
        AssertRowShape(result.Results[0], ['ID', 'Name', 'SchemaName'], 'miss-path row shape (requested fields + PK)');
        Assert(ctx.Storage.SetCount('RunViewCache') > 0, 'expected a RunViewCache write on miss (SetItem not called)');
    }
});

IntegrationCheckRegistry.Instance.Register({
    Id: 'server-cache.S2',
    Name: 'Server cache HIT — identical shape, no rewrite',
    Fn: async (ctx): Promise<void> => {
        const params = {
            EntityName: ENTITY,
            ExtraFilter: UniqueFilter('Name', 's1'), // SAME fingerprint as S1 — load-bearing
            Fields: ['Name', 'SchemaName'],
            ResultType: 'simple' as const
        };
        const setsBefore = ctx.Storage.SetCount('RunViewCache');
        const rv = new RunView();
        const result = await rv.RunView<Record<string, unknown>>(params, ctx.User);
        Assert(result.Success, `RunView failed: ${result.ErrorMessage}`);
        AssertRowShape(result.Results[0], ['ID', 'Name', 'SchemaName'], 'hit-path row shape (requested fields + PK)');
        AssertEqual(ctx.Storage.SetCount('RunViewCache'), setsBefore, 'hit must not rewrite the cache');
        AssertEqual(result.ExecutionTime, 0, 'cache-served results report ExecutionTime 0');
    }
});
