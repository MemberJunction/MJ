/**
 * aggregates-cache.checks.ts — the 'aggregates-cache' bundle (AGG1/AGG2).
 *
 * Proves the two cache invariants for RunView aggregates:
 *   AGG1 — the Aggregates[] array participates in the cache fingerprint (the "aggHash"):
 *          adding aggregates, and changing them, must change the fingerprint, so two views
 *          identical except for their Aggregates never collide on one slot. Deterministic,
 *          no DB read — directly exercises LocalCacheManager.generateAggregateHash via
 *          GenerateRunViewFingerprint.
 *   AGG2 — aggregate results round-trip through the cache: a cold aggregate RunView writes a
 *          slot AND returns AggregateResults; the warm hit is served (zero new writes) and
 *          STILL returns AggregateResults (the cache must not drop them).
 *
 * Fixture: none — pure cold-slot reads via an always-true unique filter, no mutation. The
 * entity defaults to 'MJ: User Settings' (small, always present); override via selector
 * config `entityName`.
 */
import { RunView, LocalCacheManager } from '@memberjunction/core';
import type { RunViewParams, AggregateExpression, IMetadataProvider } from '@memberjunction/core';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const DEFAULT_AGG_ENTITY = 'MJ: User Settings';

/** The aggregate entity for this run: selector config `entityName`, else the default. */
function aggEntity(ctx: IntegrationCheckContext): string {
    const fromConfig = ctx.Config?.entityName;
    return typeof fromConfig === 'string' && fromConfig.length > 0 ? fromConfig : DEFAULT_AGG_ENTITY;
}

/** ProviderBase exposes the per-instance connection string used in the fingerprint. */
function connStrOf(provider: IMetadataProvider): string {
    return (provider as unknown as { InstanceConnectionString?: string }).InstanceConnectionString ?? '';
}

/**
 * `MAX(<last-updated column>)`, quoted for the running backend.
 *
 * An aggregate `expression` reaches the database verbatim, so a bare `__mj_UpdatedAt` is only
 * safe where identifiers fold case-insensitively. PostgreSQL folds unquoted identifiers to
 * lowercase and then rejects `column "__mj_updatedat" does not exist`. Quoting through the
 * provider keeps the check testing aggregate caching rather than identifier casing.
 */
function maxUpdatedAtExpr(provider: IMetadataProvider): string {
    const quote = (provider as unknown as { QuoteIdentifier?: (n: string) => string }).QuoteIdentifier;
    if (typeof quote !== 'function') {
        // FAIL, don't fall back. The bare form is exactly the bug this helper exists to avoid, so
        // substituting it turns a missing capability into a PostgreSQL-only
        // `column "__mj_updatedat" does not exist` several frames away — and on SQL Server, where
        // folding is case-insensitive, into a green run that proves nothing about the other
        // dialect. A provider that cannot quote an identifier cannot run this check honestly.
        throw new Error(
            'aggregates-cache checks need a provider exposing QuoteIdentifier; ' +
            `got ${provider?.constructor?.name ?? typeof provider} without one`
        );
    }
    return `MAX(${quote.call(provider, '__mj_UpdatedAt')})`;
}

/** Always-true, column-AGNOSTIC, unique-per-tag predicate → a deterministic cold slot. */
function coldFilter(tag: string): string {
    return `'${tag}' <> 'zzz-cache-test-marker'`;
}

/** AGG1: two views identical except for Aggregates[] must NOT collide on a cache slot. */
export async function CheckAgg1_FingerprintIncludesAggregates(ctx: IntegrationCheckContext): Promise<void> {
    const entityName = aggEntity(ctx);
    const connStr = connStrOf(ctx.Provider);
    const base: RunViewParams = { EntityName: entityName, ResultType: 'simple' };
    const withSum: RunViewParams = { ...base, Aggregates: [{ expression: 'COUNT(*)', alias: 'Cnt' }] };
    const withMax: RunViewParams = { ...base, Aggregates: [{ expression: maxUpdatedAtExpr(ctx.Provider), alias: 'MaxUpd' }] };

    const fpNone = LocalCacheManager.Instance.GenerateRunViewFingerprint(base, connStr);
    const fpSum = LocalCacheManager.Instance.GenerateRunViewFingerprint(withSum, connStr);
    const fpMax = LocalCacheManager.Instance.GenerateRunViewFingerprint(withMax, connStr);

    Assert(fpNone !== fpSum, 'aggHash: adding Aggregates must change the cache fingerprint');
    Assert(fpSum !== fpMax, 'aggHash: different Aggregates expressions must yield different fingerprints');
}

/** AGG2: aggregate results round-trip through the cache (warm hit still returns AggregateResults). */
export async function CheckAgg2_AggregateResultsRoundTrip(ctx: IntegrationCheckContext): Promise<void> {
    const entityName = aggEntity(ctx);
    const rv = new RunView();
    const aggs: AggregateExpression[] = [{ expression: 'COUNT(*)', alias: 'Cnt' }];
    const params: RunViewParams = { EntityName: entityName, ExtraFilter: coldFilter('agg2'), Aggregates: aggs, ResultType: 'simple' };

    ctx.Storage.ResetCounts();
    const cold = await rv.RunView(params, ctx.User);
    Assert(cold.Success, `cold aggregate RunView failed: ${cold.ErrorMessage}`);
    Assert(cold.AggregateResults != null && cold.AggregateResults.length === 1, 'cold run must return one AggregateResults entry');
    Assert(ctx.Storage.SetCount('RunViewCache') > 0, 'cold aggregate run must write a RunViewCache slot');

    ctx.Storage.ResetCounts();
    const warm = await rv.RunView(params, ctx.User);
    Assert(warm.Success, `warm aggregate RunView failed: ${warm.ErrorMessage}`);
    Assert(warm.AggregateResults != null && warm.AggregateResults.length === 1,
        'CACHE BUG: warm hit dropped AggregateResults — aggregates must round-trip through the cache');
    AssertEqual(ctx.Storage.SetCount('RunViewCache'), 0, 'warm aggregate run must be served (zero writes)');
}

/**
 * AGG3: AggregateResults are returned in the caller's requested order — the contract
 * documented on RunViewResult.AggregateResults ("in same order as input Aggregates array") —
 * including when a semantically-equivalent view with a different Aggregates[] order was cached
 * first. Warm the slot with [A,B], read the same entity+filter with [B,A], and assert each
 * result slot matches the second caller's own input order.
 */
export async function CheckAgg3_ResultOrderSurvivesCache(ctx: IntegrationCheckContext): Promise<void> {
    const entityName = aggEntity(ctx);
    const rv = new RunView();
    const A: AggregateExpression = { expression: 'COUNT(*)', alias: 'Cnt' };
    const B: AggregateExpression = { expression: maxUpdatedAtExpr(ctx.Provider), alias: 'MaxUpd' };
    const filter = coldFilter('agg3');

    // Warm the slot with [A, B].
    const warm = await rv.RunView({ EntityName: entityName, ExtraFilter: filter, Aggregates: [A, B], ResultType: 'simple' }, ctx.User);
    Assert(warm.Success, `warm aggregate RunView failed: ${warm.ErrorMessage}`);

    // Read the SAME entity+filter with the aggregates REVERSED. Because the aggHash is
    // order-insensitive, this is served from the [A,B] slot (a cache hit, ExecutionTime 0).
    const reversed = await rv.RunView({ EntityName: entityName, ExtraFilter: filter, Aggregates: [B, A], ResultType: 'simple' }, ctx.User);
    Assert(reversed.Success, `reversed aggregate RunView failed: ${reversed.ErrorMessage}`);
    Assert(reversed.AggregateResults != null && reversed.AggregateResults.length === 2,
        'reversed run must return two AggregateResults entries');

    // The contract: AggregateResults[i] corresponds to the CALLER's Aggregates[i].
    AssertEqual(reversed.AggregateResults![0].alias, B.alias!,
        'ORDER CONTRACT: AggregateResults[0] must be the caller\'s FIRST requested aggregate (reordered request must not inherit the warming caller\'s order)');
    AssertEqual(reversed.AggregateResults![1].alias, A.alias!,
        'ORDER CONTRACT: AggregateResults[1] must be the caller\'s SECOND requested aggregate');
}

/** The ordered 'aggregates-cache' bundle. */
export const AggregatesCacheChecks: NamedCheck[] = [
    {
        Id: 'aggregates-cache.AGG1',
        Name: 'AGG1: Aggregates[] participates in the cache fingerprint (aggHash) — no cross-aggregate collision',
        Fn: CheckAgg1_FingerprintIncludesAggregates
    },
    {
        Id: 'aggregates-cache.AGG2',
        Name: 'AGG2: AggregateResults round-trips through the cache (warm hit still returns aggregates)',
        Fn: CheckAgg2_AggregateResultsRoundTrip
    },
    {
        Id: 'aggregates-cache.AGG3',
        Name: 'AGG3: AggregateResults ORDER survives the cache — reordered Aggregates[] must not inherit the warming caller\'s order',
        Fn: CheckAgg3_ResultOrderSurvivesCache
    }
];

for (const check of AggregatesCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
