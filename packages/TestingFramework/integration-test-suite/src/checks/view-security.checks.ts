/**
 * view-security.checks.ts — the 'view-security' bundle (VS1–VS4): the two-identity SECURITY
 * invariants of Domain 11 (catalog V14/V15/V16) plus the RLS leg of aggregates (RV17) — the
 * checks `view-execution` explicitly could NOT carry because a client GraphQLDataProvider is
 * bound to exactly one identity.
 *
 * TRANSPORT: SERVER (in-process). The seeded scoped principals (it-rls-a / it-nogrant, from the
 * rls-isolation fixture seed) exist as REAL users with RLS-scoped roles; running RunView AS each
 * of them in-process exercises the same GenericDatabaseProvider WHERE-assembly the wire path
 * uses (view WHERE → step 1, ExtraFilter → step 2, RLS → step 5, all AND-combined).
 *
 * The seeded 'Integration Test: RLS Scoped Reader' role carries a plain Read grant on
 * `MJ: User Views` (seeded alongside the RLS grant) — WITHOUT it, ViewID resolution
 * (GetEntityNameFromRunViewParams' inner User Views read AS the caller) fails before ownership
 * even enters the picture, which is itself the closed-by-default posture VS2 relies on for
 * users with no such grant.
 *
 *   VS1 (V14, P1): a saved view's WhereClause AND-combines with the running user's RLS clause —
 *        the scoped user gets exactly (view-filter ∩ their RLS scope): identical to the dynamic
 *        ExtraFilter run AS them, and a SUBSET of an unscoped admin's rows for the same filter.
 *   VS2 (V15, P1): a PRIVATE view owned by user A, executed by user B — either refused (ideal)
 *        or, if permitted, the rows are B's-RLS-scoped (no data leak THROUGH another user's
 *        view). If execution is permitted, that looseness is surfaced as a loud warning.
 *   VS3 (V16): a SHARED view (IsShared=1) owned by A IS executable by B — and B's rows are
 *        B's-RLS-scoped, not A's.
 *   VS4 (RV17): COUNT(*) aggregates with an ExtraFilter, run AS the scoped user, reflect the
 *        RLS-scoped row count — never the whole-table/admin count.
 *
 * All checks skip-as-pass LOUDLY when the seeded principals are absent or RLS-exempt (an
 * all-admin DB can't exercise the invariant — unexercised, not violated; same doctrine as
 * rls-isolation RLS8–RLS10). MUTATION tier: creates throwaway `MJ: User Views` rows owned by
 * the seeded user, deleted in teardown.
 */
import { RunView, EntityPermissionType } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import type { UserInfo } from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import {
    findUserByEmail,
    SEEDED_SCOPED_A_EMAIL, SEEDED_SCOPED_B_EMAIL,
    SEEDED_RLS_ENTITY, SEED_FIXTURES_COMMAND
} from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
/** A predicate that is view-shaped but broad, so scoping differences are observable. */
const VIEW_FILTER = `Status <> 'zzz-never-a-status'`;

/** Created view IDs, deleted (as the admin user) in Teardown. */
const createdViewIds: string[] = [];

interface ViewSecurityPrincipals {
    /** The RLS-scoped seeded user (owner of the fixture views). */
    ScopedA: UserInfo;
    /** The second seeded scoped user (same role — can read User Views, RLS-scoped on the data entity). */
    UserB: UserInfo;
    /** The admin driver user (unscoped positive control). */
    Admin: UserInfo;
}

/** Resolves the seeded principals; undefined (with a loud reason) when the seed is absent. */
function resolvePrincipals(ctx: IntegrationCheckContext, checkId: string): ViewSecurityPrincipals | undefined {
    const users = UserCache.Instance.Users;
    const scopedA = findUserByEmail(users, SEEDED_SCOPED_A_EMAIL);
    const userB = findUserByEmail(users, SEEDED_SCOPED_B_EMAIL);
    if (!scopedA || !userB) {
        console.warn(`  ⚠ ${checkId} SKIPPED — seeded principals (${SEEDED_SCOPED_A_EMAIL} / ${SEEDED_SCOPED_B_EMAIL}) not in the user cache; run \`${SEED_FIXTURES_COMMAND}\`.`);
        return undefined;
    }
    const entity = ctx.Provider.EntityByName(SEEDED_RLS_ENTITY);
    if (!entity) {
        console.warn(`  ⚠ ${checkId} SKIPPED — RLS entity '${SEEDED_RLS_ENTITY}' not in metadata.`);
        return undefined;
    }
    const clauseA = entity.GetUserRowLevelSecurityWhereClause(scopedA, EntityPermissionType.Read, '');
    if (!clauseA || clauseA.trim() === '') {
        console.warn(`  ⚠ ${checkId} SKIPPED — seeded user A is RLS-exempt on '${SEEDED_RLS_ENTITY}' (all-admin DB?); the invariant is unexercisable.`);
        return undefined;
    }
    return { ScopedA: scopedA, UserB: userB, Admin: ctx.User };
}

function normId(id: string): string {
    return id.toLowerCase();
}

function idSet(rows: ReadonlyArray<{ ID: string }>): Set<string> {
    return new Set(rows.map((r) => normId(r.ID)));
}

/** Creates a throwaway saved view on the RLS entity, owned by `owner`. */
async function createFixtureView(ctx: IntegrationCheckContext, owner: UserInfo, shared: boolean): Promise<MJUserViewEntityExtended> {
    const entity = ctx.Provider.EntityByName(SEEDED_RLS_ENTITY);
    const view = await ctx.Provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', ctx.User);
    Assert(view.NewRecord(), 'could not initialize a new MJ: User Views object');
    view.Name = `it-vs-${shared ? 'shared' : 'private'} ${Date.now().toString(36)} ${FIXTURE_TAG}`;
    view.EntityID = entity!.ID;
    view.UserID = owner.ID;
    view.IsShared = shared;
    view.WhereClause = VIEW_FILTER;
    Assert(await view.Save(), `fixture view save failed: ${view.LatestResult?.CompleteMessage}`);
    createdViewIds.push(view.ID);
    return view;
}

async function runRows(params: { ViewID?: string; ExtraFilter?: string }, user: UserInfo): Promise<{ ok: boolean; error?: string; rows: Array<{ ID: string }> }> {
    const r = await new RunView().RunView<{ ID: string }>({
        EntityName: params.ViewID ? undefined : SEEDED_RLS_ENTITY,
        ViewID: params.ViewID,
        ExtraFilter: params.ExtraFilter,
        Fields: ['ID'],
        IgnoreMaxRows: true,
        ResultType: 'simple',
        BypassCache: true,
    }, user);
    return { ok: r.Success, error: r.ErrorMessage, rows: r.Success ? r.Results : [] };
}

export const ViewSecurityChecks: NamedCheck[] = [
    {
        Id: 'view-security.VS1',
        Name: "VS1 (V14): a saved view's WHERE AND-combines with the running user's RLS — scoped rows only, no leak, no over-restriction",
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = resolvePrincipals(ctx, 'view-security.VS1');
            if (!p) { return; }
            const view = await createFixtureView(ctx, p.ScopedA, false);

            const viaView = await runRows({ ViewID: view.ID }, p.ScopedA);
            Assert(viaView.ok, `VS1: scoped user could not run their own view: ${viaView.error}`);
            const viaDynamic = await runRows({ ExtraFilter: VIEW_FILTER }, p.ScopedA);
            Assert(viaDynamic.ok, `VS1: scoped dynamic control failed: ${viaDynamic.error}`);
            const admin = await runRows({ ExtraFilter: VIEW_FILTER }, p.Admin);
            Assert(admin.ok, `VS1: admin control failed: ${admin.error}`);

            // No over-restriction and no leak: the saved-view path ≡ the dynamic path (both AS the
            // scoped user, both carrying the same view filter — RLS applies identically).
            AssertEqual(idSet(viaView.rows).size, idSet(viaDynamic.rows).size,
                `VS1: saved-view rows (${viaView.rows.length}) must equal the scoped dynamic control (${viaDynamic.rows.length})`);
            for (const id of idSet(viaView.rows)) {
                Assert(idSet(viaDynamic.rows).has(id), `VS1: saved-view returned row ${id} outside the scoped dynamic set (RLS leak through the view path)`);
            }
            // Subset of admin (strictly smaller when the admin can see more — the scoping proof).
            const adminIds = idSet(admin.rows);
            for (const id of idSet(viaView.rows)) {
                Assert(adminIds.has(id), `VS1: scoped user saw row ${id} the admin does not — impossible unless the filter drifted`);
            }
            Assert(viaView.rows.length <= admin.rows.length, 'VS1: scoped count must be <= admin count');
            if (viaView.rows.length === admin.rows.length && admin.rows.length > 0) {
                console.warn(`  ⚠ VS1: scoped and admin counts are EQUAL (${admin.rows.length}) — RLS scope covers every matching row right now; the subset leg is degenerate this run (clause verified non-empty, so the combine IS applied).`);
            }
            console.log(`      → scoped ${viaView.rows.length} row(s) via view ≡ dynamic; admin sees ${admin.rows.length}`);
        }
    },
    {
        Id: 'view-security.VS2',
        Name: "VS2 (V15): user B running user A's PRIVATE view — refused, or (if permitted) rows are B-scoped with the looseness surfaced",
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = resolvePrincipals(ctx, 'view-security.VS2');
            if (!p) { return; }
            const view = await createFixtureView(ctx, p.ScopedA, false);

            const asB = await runRows({ ViewID: view.ID }, p.UserB);
            if (!asB.ok) {
                // Ideal outcome: private views are not executable by non-owners.
                console.log(`      → private view execution by a non-owner REFUSED (${(asB.error ?? '').slice(0, 80)})`);
                return;
            }
            // Permitted: the load-bearing invariant is that B gets B'S scope — a view is a lens,
            // never an authority. B's rows must equal B's own dynamic read with the same filter.
            console.warn('  ⚠ VS2: a non-owner CAN execute a private view by ViewID (no ownership gate on the RunView path) — surfaced for the bug register; asserting the no-leak invariant instead.');
            const bDynamic = await runRows({ ExtraFilter: VIEW_FILTER }, p.UserB);
            Assert(bDynamic.ok, `VS2: B's dynamic control failed: ${bDynamic.error}`);
            const bViaView = idSet(asB.rows);
            const bOwn = idSet(bDynamic.rows);
            AssertEqual(bViaView.size, bOwn.size, `VS2: B via A's view got ${bViaView.size} rows but B's own scope is ${bOwn.size} — the view path leaked or lost rows`);
            for (const id of bViaView) {
                Assert(bOwn.has(id), `VS2: row ${id} reached B through A's view but is OUTSIDE B's RLS scope — cross-user data leak`);
            }
        }
    },
    {
        Id: 'view-security.VS3',
        Name: "VS3 (V16): a SHARED view owned by A is executable by B — and returns B's RLS scope, not A's",
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = resolvePrincipals(ctx, 'view-security.VS3');
            if (!p) { return; }
            const view = await createFixtureView(ctx, p.ScopedA, true);

            const asB = await runRows({ ViewID: view.ID }, p.UserB);
            Assert(asB.ok, `VS3: shared view must be executable by a non-owner (got: ${asB.error})`);
            const bDynamic = await runRows({ ExtraFilter: VIEW_FILTER }, p.UserB);
            Assert(bDynamic.ok, `VS3: B's dynamic control failed: ${bDynamic.error}`);
            AssertEqual(idSet(asB.rows).size, idSet(bDynamic.rows).size,
                `VS3: B's rows through the shared view (${asB.rows.length}) must equal B's own scope (${bDynamic.rows.length})`);
            for (const id of idSet(asB.rows)) {
                Assert(idSet(bDynamic.rows).has(id), `VS3: row ${id} outside B's scope arrived through the shared view — the view must be a lens, not an authority`);
            }
            console.log(`      → shared view executed by B: ${asB.rows.length} row(s), all within B's own scope`);
        }
    },
    {
        Id: 'view-security.VS4',
        Name: 'VS4 (RV17): COUNT(*) aggregate with ExtraFilter, run AS the scoped user, reflects the RLS-scoped count — never the admin count',
        Fn: async (ctx: IntegrationCheckContext) => {
            const p = resolvePrincipals(ctx, 'view-security.VS4');
            if (!p) { return; }
            const agg = async (user: UserInfo): Promise<number> => {
                const r = await new RunView().RunView({
                    EntityName: SEEDED_RLS_ENTITY, ExtraFilter: VIEW_FILTER,
                    Aggregates: [{ expression: 'COUNT(*)', alias: 'Cnt' }],
                    MaxRows: 1, ResultType: 'simple', BypassCache: true,
                }, user);
                Assert(r.Success, `VS4 aggregate failed: ${r.ErrorMessage}`);
                const hit = (r.AggregateResults ?? []).find((a) => a.alias === 'Cnt');
                Assert(hit != null && !hit.error, `VS4: Cnt aggregate missing/errored: ${hit?.error}`);
                return Number(hit!.value);
            };
            const scopedRows = await runRows({ ExtraFilter: VIEW_FILTER }, p.ScopedA);
            Assert(scopedRows.ok, `VS4 scoped row control failed: ${scopedRows.error}`);
            const scopedCount = await agg(p.ScopedA);
            const adminCount = await agg(p.Admin);
            Assert(Number.isFinite(scopedCount) && Number.isFinite(adminCount), 'VS4: aggregate did not return a numeric Cnt');
            AssertEqual(scopedCount, scopedRows.rows.length,
                `VS4: the scoped aggregate (${scopedCount}) must equal the scoped row count (${scopedRows.rows.length}) — the WHERE+RLS combine must reach the aggregate query`);
            Assert(scopedCount <= adminCount, `VS4: scoped aggregate (${scopedCount}) exceeded the admin aggregate (${adminCount})`);
            console.log(`      → COUNT(*) as scoped user = ${scopedCount}; as admin = ${adminCount}`);
        }
    }
];

for (const check of ViewSecurityChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('view-security', {
    Setup: async () => { createdViewIds.length = 0; },
    Teardown: async (ctx: IntegrationCheckContext) => {
        for (const id of createdViewIds) {
            try {
                const view = await ctx.Provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', ctx.User);
                if (await view.Load(id)) { await view.Delete(); }
            } catch { /* best effort */ }
        }
        createdViewIds.length = 0;
    }
});
