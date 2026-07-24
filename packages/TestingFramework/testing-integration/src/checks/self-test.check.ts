/**
 * self-test.check.ts — the ONE check registered by Phase 0.
 *
 * It is not part of any migrated suite; it exists solely to give Phase 0 a green,
 * end-to-end "the bootstrap installed an instrumented cache that actually sees
 * RunView traffic" proof — the exact failure mode the harness warns about (cache
 * installed AFTER provider setup is a silent no-op). Retain it as a permanent smoke
 * check or remove at the team's discretion.
 */
import { RunView } from '@memberjunction/core';
import { IntegrationCheckRegistry } from '../check-registry';
import { Assert } from '../test-runner';

IntegrationCheckRegistry.Instance.Register({
    Id: 'self-test.cache-warm',
    Name: 'Self-test: instrumented cache observes RunView traffic',
    Fn: async (ctx): Promise<void> => {
        ctx.Storage.ResetCounts();
        const rv = new RunView();
        // A cold, per-run-unique fingerprint forces a cache MISS (one RunViewCache write).
        // Column-AGNOSTIC always-true predicate — the rls-isolation bundle documented why:
        // UniqueFilter('ID', tag) feeds a non-GUID literal to the uniqueidentifier PK and
        // errors. A pure string-literal comparison is always true and valid for any entity;
        // the timestamp tag makes each run a distinct cold slot.
        const r = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Users',
            ExtraFilter: `'p0-selftest-${Date.now()}' <> 'zzz-cache-test-marker'`,
            Fields: ['ID'],
            ResultType: 'simple'
        }, ctx.User);
        const writes = ctx.Storage.SetCount('RunViewCache');
        Assert(r.Success, `RunView failed: ${r.ErrorMessage}`);
        Assert(writes >= 1, `Expected >=1 RunViewCache write on cold miss, saw ${writes}`);
    }
});
