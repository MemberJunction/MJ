/**
 * app-behavioral.checks.ts — the 'app-behavioral' bundle (AB1–AB3): Domain 12's S-series
 * behavioral invariants of `MJApplicationEntityServer` (catalog S4 / S6 / S8).
 *
 *   AB1 (S4): DefaultForNewUser fan-out — creating an app with DfNU=true creates an
 *        `MJ: User Applications` row for every active user, in ONE transaction; flipping an
 *        existing app false→true fires the same fan-out exactly once; a repeat save with
 *        DfNU already true does NOT duplicate.
 *   AB2 (S6): AutoUpdatePath slug collision — a second app whose Name slugs identically gets
 *        `-2` (the ensureUniqueSlug walk ESI6's read-only leg deferred here).
 *   AB3 (S8): Application Entities Sequence hygiene — per Active application, its
 *        `MJ: Application Entities` Sequences are duplicate-free (the #3027 collision class),
 *        with contiguity reported (not gated — gaps are legal after removals).
 *
 * Catalog dispositions: S3's new-user leg rides the AUTH-TIME path (MJServer newUsers.ts) — a
 * headless bundle cannot create a user through auth; the app-side half of the contract IS AB1.
 * S5 (InstallApplication idempotency + re-enable Sequence, #3027) needs a real OpenApp package
 * install — the open-app-teardown bundle owns that surface.
 *
 * TRANSPORT: SERVER (the Application server Save wraps fan-out in provider.BeginTransaction —
 * client GraphQL providers have no transaction surface; same gating as ESI9). MUTATION tier.
 * Fixtures: throwaway `MJ: Applications` (+ the fan-out's User Applications rows), FK-safe
 * teardown (user-app rows first, then apps).
 */
import { RunView } from '@memberjunction/core';
import type { MJApplicationEntity, MJUserApplicationEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const createdAppIds: string[] = [];

function txCapable(app: MJApplicationEntity): boolean {
    return typeof (app.ProviderToUse as unknown as { BeginTransaction?: unknown }).BeginTransaction === 'function';
}

async function newApp(ctx: IntegrationCheckContext, name: string, dfnu: boolean, autoPath = false): Promise<MJApplicationEntity> {
    const app = await ctx.Provider.GetEntityObject<MJApplicationEntity>('MJ: Applications', ctx.User);
    app.NewRecord();
    app.Name = name;
    app.Description = FIXTURE_TAG;
    app.DefaultForNewUser = dfnu;
    if (autoPath) { app.AutoUpdatePath = true; }
    const saved = await app.Save();
    if (app.ID) { createdAppIds.push(app.ID); }
    Assert(saved, `fixture app '${name}' save failed: ${app.LatestResult?.CompleteMessage}`);
    return app;
}

async function userAppRows(ctx: IntegrationCheckContext, appId: string): Promise<Array<{ ID: string; UserID: string; Sequence: number | null }>> {
    const r = await new RunView().RunView<{ ID: string; UserID: string; Sequence: number | null }>({
        EntityName: 'MJ: User Applications',
        ExtraFilter: `ApplicationID='${appId}'`,
        Fields: ['ID', 'UserID', 'Sequence'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    Assert(r.Success, `User Applications read failed: ${r.ErrorMessage}`);
    return r.Results ?? [];
}

async function activeUserCount(ctx: IntegrationCheckContext): Promise<number> {
    const r = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: Users',
        ExtraFilter: `IsActive=1`,
        Fields: ['ID'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    Assert(r.Success, `Users read failed: ${r.ErrorMessage}`);
    return (r.Results ?? []).length;
}

export const AppBehavioralChecks: NamedCheck[] = [
    {
        Id: 'app-behavioral.AB1',
        Name: 'AB1 (S4): DefaultForNewUser fan-out — create-with-true and flip-false→true each create User Applications for all active users, exactly once',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const marker = Date.now().toString(36);
            const probe = await ctx.Provider.GetEntityObject<MJApplicationEntity>('MJ: Applications', ctx.User);
            if (!txCapable(probe)) {
                console.warn('  ⚠ AB1 SKIPPED — provider has no BeginTransaction (client transport); the fan-out save path requires the in-process server provider.');
                return;
            }
            const expected = await activeUserCount(ctx);
            Assert(expected > 0, 'AB1 would be vacuous with zero active users');

            // Leg 1: create WITH DfNU=true → immediate fan-out.
            const appA = await newApp(ctx, `IT AB1-A ${marker} ${FIXTURE_TAG}`, true);
            const rowsA = await userAppRows(ctx, appA.ID);
            AssertEqual(rowsA.length, expected, `AB1: create-with-true fan-out must cover every active user (${expected}), got ${rowsA.length}`);
            Assert(new Set(rowsA.map(r => r.UserID.toLowerCase())).size === rowsA.length, 'AB1: fan-out wrote a duplicate UserID row');

            // Repeat save (DfNU stays true) must NOT duplicate.
            appA.Description = `${FIXTURE_TAG} updated`;
            Assert(await appA.Save(), `AB1 repeat save failed: ${appA.LatestResult?.CompleteMessage}`);
            AssertEqual((await userAppRows(ctx, appA.ID)).length, expected, 'AB1: a repeat save with DfNU already true must not re-fan-out');

            // Leg 2: create with FALSE (no rows), then flip → fan-out fires on the transition.
            const appB = await newApp(ctx, `IT AB1-B ${marker} ${FIXTURE_TAG}`, false);
            AssertEqual((await userAppRows(ctx, appB.ID)).length, 0, 'AB1: DfNU=false creates NO user-app rows');
            appB.DefaultForNewUser = true;
            Assert(await appB.Save(), `AB1 flip save failed: ${appB.LatestResult?.CompleteMessage}`);
            AssertEqual((await userAppRows(ctx, appB.ID)).length, expected, `AB1: the false→true flip must fan out to every active user (${expected})`);
        }
    },
    {
        Id: 'app-behavioral.AB2',
        Name: "AB2 (S6): AutoUpdatePath slug collision — the second identically-named app gets '-2'",
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const probe = await ctx.Provider.GetEntityObject<MJApplicationEntity>('MJ: Applications', ctx.User);
            if (!txCapable(probe)) {
                console.warn('  ⚠ AB2 SKIPPED — provider has no BeginTransaction (client transport).');
                return;
            }
            // Application NAMES are unique (UQ_Application_Name) — the slug walk is triggered by
            // DIFFERENT names that slug IDENTICALLY (generateSlugFromName strips punctuation).
            const m = Date.now().toString(36);
            const first = await newApp(ctx, `IT AB2 Slug ${m}`, false, true);
            const expectedSlug = first.Path;
            Assert(!!expectedSlug && expectedSlug.length > 0, 'AB2: AutoUpdatePath must populate Path on save');

            const second = await newApp(ctx, `IT AB2, Slug ${m}`, false, true);   // comma stripped → same slug
            AssertEqual(second.Path, `${expectedSlug}-2`, `AB2: the slug-colliding app must get '${expectedSlug}-2', got '${second.Path}'`);
            const third = await newApp(ctx, `IT (AB2) Slug ${m}`, false, true);   // parens stripped → same slug
            AssertEqual(third.Path, `${expectedSlug}-3`, `AB2: the third collision walks to '-3', got '${third.Path}'`);
        }
    },
    {
        Id: 'app-behavioral.AB3',
        Name: 'AB3 (S8): per-application Application Entities Sequences are duplicate-free (contiguity reported, not gated)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const apps = await new RunView().RunView<{ ID: string; Name: string; Status: string }>({
                EntityName: 'MJ: Applications', Fields: ['ID', 'Name', 'Status'], ResultType: 'simple', BypassCache: true,
            }, ctx.User);
            Assert(apps.Success && (apps.Results ?? []).length > 0, 'AB3: no applications to sweep');
            const appEnts = await new RunView().RunView<{ ApplicationID: string; Sequence: number | null }>({
                EntityName: 'MJ: Application Entities', Fields: ['ApplicationID', 'Sequence'], ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true,
            }, ctx.User);
            Assert(appEnts.Success, `AB3: Application Entities read failed: ${appEnts.ErrorMessage}`);

            const byApp = new Map<string, number[]>();
            for (const row of appEnts.Results ?? []) {
                const key = row.ApplicationID.toLowerCase();
                if (!byApp.has(key)) { byApp.set(key, []); }
                if (row.Sequence != null) { byApp.get(key)!.push(row.Sequence); }
            }
            const dupOffenders: string[] = [];
            const inactiveDups: string[] = [];
            let gapped = 0;
            for (const app of apps.Results ?? []) {
                const seqs = byApp.get(app.ID.toLowerCase()) ?? [];
                if (seqs.length === 0) { continue; }
                if (new Set(seqs).size !== seqs.length) {
                    // The GATE covers ACTIVE apps only — retired/deprecated apps carry historical
                    // sequence debris (e.g. 'Admin (Deprecated)') that no runtime path orders by.
                    if (app.Status === 'Active') {
                        dupOffenders.push(`${app.Name} (${seqs.length - new Set(seqs).size} dup seq values)`);
                    } else {
                        inactiveDups.push(app.Name);
                    }
                }
                const sorted = [...seqs].sort((a, b) => a - b);
                if (sorted[0] !== 1 || sorted[sorted.length - 1] !== sorted.length) { gapped++; }
            }
            if (inactiveDups.length > 0) {
                console.warn(`  ⚠ AB3: ${inactiveDups.length} NON-Active application(s) carry duplicate sequences (historical debris, not gated): ${inactiveDups.join('; ')}`);
            }
            AssertEqual(dupOffenders.length, 0,
                `AB3: ${dupOffenders.length} ACTIVE application(s) have DUPLICATE Application Entities Sequences (the #3027 collision class): ${dupOffenders.slice(0, 5).join('; ')}`);
            if (gapped > 0) {
                console.log(`      → ${gapped} application(s) have non-contiguous sequences (legal after removals; reported only)`);
            }
        }
    }
];

for (const check of AppBehavioralChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('app-behavioral', {
    Setup: async () => { createdAppIds.length = 0; },
    Teardown: async (ctx: IntegrationCheckContext) => {
        for (const appId of createdAppIds) {
            try {
                // FK-safe: the fan-out's user-app rows first, then the app.
                const rows = await new RunView().RunView<{ ID: string }>({
                    EntityName: 'MJ: User Applications', ExtraFilter: `ApplicationID='${appId}'`,
                    Fields: ['ID'], ResultType: 'simple', BypassCache: true,
                }, ctx.User);
                for (const row of rows.Success ? rows.Results ?? [] : []) {
                    const ua = await ctx.Provider.GetEntityObject<MJUserApplicationEntity>('MJ: User Applications', ctx.User);
                    if (await ua.Load(row.ID)) { await ua.Delete(); }
                }
                const app = await ctx.Provider.GetEntityObject<MJApplicationEntity>('MJ: Applications', ctx.User);
                if (await app.Load(appId)) { await app.Delete(); }
            } catch { /* best effort — rows are tagged for manual sweep */ }
        }
        createdAppIds.length = 0;
    }
});
