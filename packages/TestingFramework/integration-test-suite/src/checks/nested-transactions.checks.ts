/**
 * nested-transactions.checks.ts — IT87. Live-DB proof of ambient savepoints on
 * GenericDatabaseProvider. Server transport, mutation-gated. Sweep teardown
 * through a pool-scoped connectionSource so a poisoned handle cannot block it.
 */
import { MJActionCategoryEntity } from '@memberjunction/core-entities';
import type { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { DoomedTransactionError } from '@memberjunction/generic-database-provider';

const CATEGORY_ENTITY = 'MJ: Action Categories';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

interface NestedTxFixture {
    Prefix: string;
    Ids: string[];
}

let fixture: NestedTxFixture | undefined;

function providerOf(ctx: IntegrationCheckContext): GenericDatabaseProvider {
    return ctx.Provider as unknown as GenericDatabaseProvider;
}

function isPostgres(ctx: IntegrationCheckContext): boolean {
    return providerOf(ctx).PlatformKey === 'postgresql';
}

function poolSource(ctx: IntegrationCheckContext): unknown {
    const p = ctx.Provider as { DatabaseConnection?: unknown; Pool?: unknown };
    return p.DatabaseConnection ?? p.Pool ?? undefined;
}

async function namedExists(ctx: IntegrationCheckContext, label: string): Promise<boolean> {
    if (!fixture) return false;
    const table = isPostgres(ctx) ? '"__mj"."vwActionCategories"' : '[__mj].[vwActionCategories]';
    const col = isPostgres(ctx) ? '"Name"' : '[Name]';
    const name = `${fixture.Prefix}-${label}`.replace(/'/g, "''");
    const rows = await providerOf(ctx).ExecuteSQL(
        `SELECT COUNT(*) AS c FROM ${table} WHERE ${col} = '${name}'`,
        undefined,
        { connectionSource: poolSource(ctx) },
    ) as Array<Record<string, unknown>>;
    const n = rows?.[0] ? Object.values(rows[0])[0] : 0;
    return Number(n) === 1;
}

async function committed(ctx: IntegrationCheckContext, id: string): Promise<boolean> {
    const table = isPostgres(ctx) ? '"__mj"."vwActionCategories"' : '[__mj].[vwActionCategories]';
    const rows = await providerOf(ctx).ExecuteSQL(
        `SELECT COUNT(*) AS c FROM ${table} WHERE ID = '${id.replace(/'/g, "''")}'`,
        undefined,
        { connectionSource: poolSource(ctx) },
    ) as Array<Record<string, unknown>>;
    const n = rows?.[0] ? Object.values(rows[0])[0] : 0;
    return Number(n) === 1;
}

async function newCategory(ctx: IntegrationCheckContext, label: string): Promise<MJActionCategoryEntity> {
    const row = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
    row.NewRecord();
    row.Name = `${fixture!.Prefix}-${label}`;
    row.Description = FIXTURE_TAG;
    return row;
}

async function doomAmbient(ctx: IntegrationCheckContext): Promise<void> {
    if (isPostgres(ctx)) {
        await providerOf(ctx).ExecuteSQL(`DO $$ BEGIN RAISE EXCEPTION 'mj-it-doom'; END $$`);
        return;
    }
    await providerOf(ctx).ExecuteSQL(
        `EXEC sp_executesql N'SET XACT_ABORT ON; THROW 50000, N''mj-it-doom'', 1;'`,
    );
}

export const NestedTransactionChecks: NamedCheck[] = [
    {
        Id: 'nested-transactions.NT1',
        Name: 'NT1: BeginEntityTransaction joins an application TX as a savepoint; inner rollback keeps the outer row',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            await p.BeginTransaction();
            const header = await newCategory(ctx, 'nt1-outer');
            Assert(await header.Save(), `NT1: outer save failed — ${header.LatestResult?.CompleteMessage}`);
            fixture!.Ids.push(header.ID);

            const scope = await p.BeginEntityTransaction();
            Assert(scope.IsNested, 'NT1: inner scope must be nested');
            AssertEqual(p.TransactionDepth, 2, 'NT1: depth');
            const expectedSp = isPostgres(ctx) ? 'mj_sp_1' : 'SavePoint_1';
            Assert(p.SavepointStack?.includes(expectedSp) ?? false, `NT1: SavepointStack ${JSON.stringify(p.SavepointStack)}`);
            const inner = await newCategory(ctx, 'nt1-inner');
            Assert(await inner.Save(), `NT1: inner save failed — ${inner.LatestResult?.CompleteMessage}`);
            fixture!.Ids.push(inner.ID);
            await scope.Rollback();
            AssertEqual(p.TransactionDepth, 1, 'NT1: depth after inner rollback');
            await p.RollbackTransaction();
            Assert(!(await committed(ctx, header.ID)), 'NT1: outer rollback must drop the header');
            Assert(!(await committed(ctx, inner.ID)), 'NT1: inner row must not survive');
        },
    },
    {
        Id: 'nested-transactions.NT2',
        Name: 'NT2: inner commit is not physical — outer rollback discards both rows',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            await p.BeginTransaction();
            const a = await newCategory(ctx, 'nt2-a');
            Assert(await a.Save(), 'NT2: save A');
            fixture!.Ids.push(a.ID);
            const scope = await p.BeginEntityTransaction();
            const b = await newCategory(ctx, 'nt2-b');
            Assert(await b.Save(), 'NT2: save B');
            fixture!.Ids.push(b.ID);
            await scope.Commit();
            Assert(p.TransactionDepth === 1, 'NT2: still in the outer TX');
            await p.RollbackTransaction();
            Assert(!(await committed(ctx, a.ID)) && !(await committed(ctx, b.ID)), 'NT2: both rows discarded');
        },
    },
    {
        Id: 'nested-transactions.NT3',
        Name: 'NT3: three-deep LIFO — rollback 3 keeps A,B; rollback 2 keeps A; commit persists A',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            await p.BeginTransaction();
            const a = await newCategory(ctx, 'nt3-a');
            Assert(await a.Save(), 'NT3: A');
            fixture!.Ids.push(a.ID);
            await p.BeginTransaction();
            const b = await newCategory(ctx, 'nt3-b');
            Assert(await b.Save(), 'NT3: B');
            fixture!.Ids.push(b.ID);
            await p.BeginTransaction();
            const c = await newCategory(ctx, 'nt3-c');
            Assert(await c.Save(), 'NT3: C');
            fixture!.Ids.push(c.ID);
            await p.RollbackTransaction();
            await p.RollbackTransaction();
            await p.CommitTransaction();
            Assert(await committed(ctx, a.ID), 'NT3: A must persist');
            Assert(!(await committed(ctx, b.ID)), 'NT3: B rolled back');
            Assert(!(await committed(ctx, c.ID)), 'NT3: C rolled back');
        },
    },
    {
        Id: 'nested-transactions.NT4',
        Name: 'NT4: savepoint counter restarts across sequential outer transactions',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            await p.BeginTransaction();
            await p.BeginTransaction();
            const first = [...(p.SavepointStack ?? [])];
            await p.CommitTransaction();
            await p.CommitTransaction();
            await p.BeginTransaction();
            await p.BeginTransaction();
            const second = [...(p.SavepointStack ?? [])];
            await p.RollbackTransaction();
            await p.RollbackTransaction();
            AssertEqual(first[0], second[0], 'NT4: first savepoint name must restart');
        },
    },
    {
        Id: 'nested-transactions.NT5',
        Name: 'NT5: doomed ambient TX cannot commit inner work without the outer row (torn-write invariant)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            await p.BeginTransaction();
            const a = await newCategory(ctx, 'nt5-a');
            Assert(await a.Save(), 'NT5: save A');
            fixture!.Ids.push(a.ID);
            let doomThrew = false;
            try {
                await doomAmbient(ctx);
            } catch {
                doomThrew = true;
            }
            Assert(doomThrew, 'NT5: doom statement must throw');
            let innerThrew = false;
            const b = await newCategory(ctx, 'nt5-b');
            try {
                await p.BeginTransaction();
                Assert(await b.Save(), 'NT5: save B inside doomed TX');
                fixture!.Ids.push(b.ID);
                await p.CommitTransaction();
                await p.CommitTransaction();
            } catch (e) {
                innerThrew = true;
                Assert(
                    e instanceof DoomedTransactionError || /rolled back by the server|No active transaction|aborted|25P01|ENOTBEGUN/i.test(String(e)),
                    `NT5: unexpected error ${e}`,
                );
                await p.ResetTransactionState();
            }
            const aOn = await committed(ctx, a.ID);
            const bOn = b.IsSaved ? await committed(ctx, b.ID) : false;
            Assert(!(aOn === false && bOn === true), 'NT5: TORN WRITE — B committed without A');
            Assert(innerThrew || (aOn === bOn), 'NT5: loud failure or both-or-neither');
        },
    },
    {
        Id: 'nested-transactions.NT6',
        Name: 'NT6: after a doomed TX, RollbackTransaction leaves the provider usable via public API only',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            await p.BeginTransaction();
            const a = await newCategory(ctx, 'nt6-a');
            Assert(await a.Save(), 'NT6: save');
            fixture!.Ids.push(a.ID);
            try { await doomAmbient(ctx); } catch { /* expected */ }
            try {
                await p.RollbackTransaction();
            } catch {
                await p.ResetTransactionState();
            }
            AssertEqual(p.TransactionDepth, 0, 'NT6: depth 0');
            await p.BeginTransaction();
            AssertEqual(p.TransactionDepth, 1, 'NT6: fresh begin');
            const b = await newCategory(ctx, 'nt6-b');
            Assert(await b.Save(), 'NT6: save after recovery');
            fixture!.Ids.push(b.ID);
            await p.CommitTransaction();
            Assert(await committed(ctx, b.ID), 'NT6: recovered provider must commit');
        },
    },
    {
        Id: 'nested-transactions.NT7',
        Name: 'NT7: order-confirm shape — doom inside a nested scope, both rollbacks, header not committed',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            await p.BeginTransaction();
            const header = await newCategory(ctx, 'nt7-header');
            Assert(await header.Save(), 'NT7: header');
            fixture!.Ids.push(header.ID);
            const scope = await p.BeginEntityTransaction();
            try {
                await doomAmbient(ctx);
            } catch { /* expected */ }
            try { await scope.Rollback(); } catch { /* may reject */ }
            try { await p.RollbackTransaction(); } catch { await p.ResetTransactionState(); }
            Assert(!(await committed(ctx, header.ID)), 'NT7: header must not persist');
            AssertEqual(p.TransactionDepth, 0, 'NT7: depth 0');
            await p.BeginTransaction();
            await p.RollbackTransaction();
        },
    },
    {
        Id: 'nested-transactions.NT8',
        Name: 'NT8: serialized concurrent Begin/save/Commit units on one provider all commit',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            const ids: string[] = [];
            await Promise.all([1, 2, 3, 4].map(async (n) => {
                await p.BeginTransaction();
                const row = await newCategory(ctx, `nt8-${n}`);
                Assert(await row.Save(), `NT8: save ${n}`);
                ids.push(row.ID);
                fixture!.Ids.push(row.ID);
                await p.CommitTransaction();
            }));
            AssertEqual(p.TransactionDepth, 0, 'NT8: depth 0');
            AssertEqual(p.SavepointStack?.length ?? 0, 0, 'NT8: empty stack');
            for (const id of ids) {
                Assert(await committed(ctx, id), `NT8: ${id} must persist`);
            }
        },
    },
    {
        Id: 'nested-transactions.NT8b',
        Name: 'NT8b: concurrent nested units after a doomed first unit all reject; no sibling row commits',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            await p.BeginTransaction();
            const header = await newCategory(ctx, 'nt8b-header');
            Assert(await header.Save(), 'NT8b: header');
            fixture!.Ids.push(header.ID);
            const unit = async (label: string) => {
                await p.BeginTransaction();
                const row = await newCategory(ctx, label);
                const saved = await row.Save();
                if (saved) fixture!.Ids.push(row.ID);
                await p.CommitTransaction();
                return row.ID;
            };
            try { await doomAmbient(ctx); } catch { /* expected */ }
            const results = await Promise.allSettled([unit('nt8b-a'), unit('nt8b-b')]);
            Assert(results.every((r) => r.status === 'rejected'), 'NT8b: both nested units must reject');
            const outer = await p.CommitTransaction().then(() => 'fulfilled' as const, () => 'rejected' as const);
            AssertEqual(outer, 'rejected', 'NT8b: outer commit must reject');
            try { await p.ResetTransactionState(); } catch { /* already clear */ }
            Assert(!(await committed(ctx, header.ID)), 'NT8b: header must not persist');
            Assert(!(await namedExists(ctx, 'nt8b-a')), 'NT8b: sibling nt8b-a must not persist');
            Assert(!(await namedExists(ctx, 'nt8b-b')), 'NT8b: sibling nt8b-b must not persist');
        },
    },
    {
        Id: 'nested-transactions.NT9',
        Name: 'NT9: SQL Server transactionState$ is false at TransactionDepth 0 after commit',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            if (isPostgres(ctx)) {
                console.warn('NT9 skipped: transactionState$ is SQL Server-only');
                return;
            }
            const p = providerOf(ctx) as GenericDatabaseProvider & {
                transactionState$?: { subscribe: (fn: (v: boolean) => void) => { unsubscribe: () => void } };
                isTransactionActive?: boolean;
            };
            const seen: boolean[] = [];
            const sub = p.transactionState$?.subscribe((v) => seen.push(v));
            await p.BeginTransaction();
            await p.CommitTransaction();
            sub?.unsubscribe();
            AssertEqual(p.TransactionDepth, 0, 'NT9: depth 0');
            Assert(p.isTransactionActive === false, 'NT9: isTransactionActive false');
            Assert(seen.includes(false), 'NT9: observed false emission');
        },
    },
    {
        Id: 'nested-transactions.NT10',
        Name: 'NT10: plain Save() while doomed returns false and does not autocommit on the pool',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = providerOf(ctx);
            await p.BeginTransaction();
            const a = await newCategory(ctx, 'nt10-a');
            Assert(await a.Save(), 'NT10: header save');
            fixture!.Ids.push(a.ID);
            try { await doomAmbient(ctx); } catch { /* expected */ }
            try { await p.BeginTransaction(); } catch { /* doomed nested begin */ }
            const b = await newCategory(ctx, 'nt10-b');
            const saved = await b.Save();
            AssertEqual(saved, false, 'NT10: plain save while doomed must return false');
            Assert(
                /doomed|autocommit/i.test(b.LatestResult?.CompleteMessage ?? ''),
                `NT10: LatestResult must mention doomed, got ${b.LatestResult?.CompleteMessage}`,
            );
            if (b.ID) fixture!.Ids.push(b.ID);
            const outer = await p.CommitTransaction().then(() => 'fulfilled' as const, () => 'rejected' as const);
            AssertEqual(outer, 'rejected', 'NT10: outer commit must reject');
            try { await p.ResetTransactionState(); } catch { /* already clear */ }
            Assert(!(await committed(ctx, a.ID)), 'NT10: a must not persist');
            Assert(!(await namedExists(ctx, 'nt10-b')), 'NT10: b must not persist');
        },
    },
];

for (const check of NestedTransactionChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('nested-transactions', {
    Setup: async () => {
        fixture = { Prefix: `mj-nt-${Date.now()}`, Ids: [] };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        if (!fixture) return;
        const p = providerOf(ctx);
        try { await p.ResetTransactionState(); } catch { /* already clean */ }
        for (const id of [...fixture.Ids].reverse()) {
            try {
                const row = await p.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
                if (await row.Load(id)) {
                    await row.Delete();
                }
            } catch {
                /* sweep is best-effort; pool-scoped reads in committed() already used connectionSource */
            }
        }
        fixture = undefined;
    },
});
