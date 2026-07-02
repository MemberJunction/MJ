/**
 * rls-isolation.checks.ts — the 'rls-isolation' bundle (RLS1/RLS2) and the
 * client-transport 'rls-isolation-client' bundle (RLS3). The #1 security deliverable
 * of the integration tier: prove that one user's Row-Level-Security-filtered cache
 * entry can NEVER serve a different user.
 *
 * The mechanism under test is already in the product: ProviderBase computes a per-user
 * RLS WHERE clause (EntityInfo.GetUserRowLevelSecurityWhereClause) and threads it as
 * the THIRD argument of LocalCacheManager.GenerateRunViewFingerprint — which appends an
 * `rls:<hash>` segment ONLY when the clause is non-empty. Two users with different
 * effective clauses therefore hash to different fingerprints and never collide on a
 * cache slot. The code comment at providerBase.ts:~1888 states the invariant verbatim:
 * "without including the RLS clause in the cache key, a scoped user could be served a
 * cached unscoped result set (a data leak)." These checks are the executable proof.
 *
 * Fixture: DISCOVERY, not provisioning (D6). `discoverRlsFixture` reads the provider's
 * RLS filters via the live user list and picks two distinct non-exempt users whose
 * effective Read clauses DIFFER. Nothing is created, so teardown is a no-op. When the
 * deployment has only RLS-exempt admins, the fixture is `Usable: false` and the checks
 * degrade gracefully (skip-as-pass with a prominent log) rather than failing.
 */
import { RunView, LocalCacheManager, EntityPermissionType } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider, RunViewParams } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext, RlsFixture } from '../check';

/** ProviderBase exposes the per-instance connection string used in the fingerprint. */
function connStrOf(provider: IMetadataProvider): string {
    return (provider as unknown as { InstanceConnectionString?: string }).InstanceConnectionString ?? '';
}

/**
 * Always-true, column-AGNOSTIC, unique-per-tag predicate. The RLS entity is discovered
 * so its column types are unknown — UniqueFilter('ID', tag) would feed a non-GUID literal
 * to a uniqueidentifier PK and error. A pure string-literal comparison is always true,
 * valid for any entity, and unique per tag (so each tag is a distinct cold cache slot).
 */
function coldFilter(tag: string): string {
    return `'${tag}' <> 'zzz-cache-test-marker'`;
}

/** A check on an unusable RLS fixture skip-passes (degrade gracefully) with a loud log. */
function skipIfUnusable(fx: RlsFixture | undefined, checkId: string): fx is RlsFixture {
    if (!fx || !fx.Usable) {
        console.warn(
            `  ⚠ ${checkId} SKIPPED — no two non-exempt users with distinct RLS clauses ` +
            `(${fx?.Reason ?? 'fixture not provisioned'}). RLS isolation not exercised on this DB.`
        );
        return false;
    }
    return true;
}

/**
 * Discover two distinct users with DIFFERENT effective Read RLS clauses for some entity.
 * Pure (no singletons) so it is unit-testable with a mocked provider + synthetic users.
 * Iterates entities, computes each user's clause once per entity (O(entities × users)),
 * and returns the first entity where two distinct users get different non-empty clauses.
 */
export function discoverRlsFixture(provider: IMetadataProvider, users: UserInfo[]): RlsFixture {
    const distinct = users.filter((u, i) => users.findIndex(o => UUIDsEqual(o.ID, u.ID)) === i);
    if (distinct.length < 2) {
        return { UserA: users[0], UserB: users[0], EntityName: '', Usable: false, Reason: 'fewer than two distinct users in the user cache' };
    }

    for (const entity of provider.Entities) {
        // Compute each user's effective Read clause once for this entity; keep non-empty ones.
        const withClause: { user: UserInfo; clause: string }[] = [];
        for (const u of distinct) {
            const clause = entity.GetUserRowLevelSecurityWhereClause(u, EntityPermissionType.Read, '');
            if (clause && clause.trim() !== '') {
                withClause.push({ user: u, clause });
            }
        }
        if (withClause.length < 2) {
            continue;
        }
        for (let i = 0; i < withClause.length; i++) {
            for (let j = i + 1; j < withClause.length; j++) {
                if (withClause[i].clause !== withClause[j].clause) {
                    return { UserA: withClause[i].user, UserB: withClause[j].user, EntityName: entity.Name, Usable: true };
                }
            }
        }
    }
    return { UserA: distinct[0], UserB: distinct[1], EntityName: '', Usable: false, Reason: 'only RLS-exempt users (no entity yields two distinct non-empty clauses)' };
}

/**
 * RLS1 — fingerprint divergence (the core proof; deterministic, no DB read).
 * Two users with different effective RLS clauses MUST produce different cache
 * fingerprints for the SAME params. Directly exercises the third arg of
 * GenerateRunViewFingerprint (the `rls:<hash>` segment).
 */
export async function CheckRls1_FingerprintDiverges(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.RlsFixture, 'rls-isolation.RLS1')) {
        return;
    }
    const fx = ctx.RlsFixture;
    const entity = ctx.Provider.EntityByName(fx.EntityName);
    Assert(entity != null, `RLS entity '${fx.EntityName}' not found in provider metadata`);

    const clauseA = entity!.GetUserRowLevelSecurityWhereClause(fx.UserA, EntityPermissionType.Read, '');
    const clauseB = entity!.GetUserRowLevelSecurityWhereClause(fx.UserB, EntityPermissionType.Read, '');
    Assert(clauseA !== clauseB, 'precondition: the two fixture users must have different RLS clauses');

    const params: RunViewParams = { EntityName: fx.EntityName, ResultType: 'simple' };
    const connStr = connStrOf(ctx.Provider);
    const fpA = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, connStr, clauseA);
    const fpB = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, connStr, clauseB);

    Assert(fpA !== fpB,
        `RLS LEAK RISK: identical cache fingerprint for two different RLS predicates (A=${fpA}, B=${fpB}). ` +
        `User B could be served User A's cached rows.`);
}

/**
 * RLS2 — server superset slot cannot cross-serve (live, mutation-free).
 * Warm the cache as User A, then read the SAME params as User B. User B's different RLS
 * fingerprint must be a cold MISS (a fresh RunViewCache write), NOT a hit served off A's
 * slot — and no A-scoped rows may leak into B's result. Counters are scoped to
 * 'RunViewCache' (the registry index lives in another category).
 */
export async function CheckRls2_ServerSupersetNoCrossServe(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.RlsFixture, 'rls-isolation.RLS2')) {
        return;
    }
    const fx = ctx.RlsFixture;
    const rv = new RunView();
    const params = (): RunViewParams => ({ EntityName: fx.EntityName, ExtraFilter: coldFilter('rls2'), ResultType: 'simple' });

    // 1) Warm as User A — a cold miss writes a RunViewCache slot under A's RLS fingerprint.
    ctx.Storage.ResetCounts();
    const aRes = await rv.RunView<{ ID: string; UserID?: string }>(params(), fx.UserA);
    Assert(aRes.Success, `User A RunView failed: ${aRes.ErrorMessage}`);
    Assert(ctx.Storage.SetCount('RunViewCache') > 0, 'User A RunView should write a RunViewCache slot (cold miss)');

    // 2) Read the SAME params as User B — a DIFFERENT RLS fingerprint ⇒ another cold MISS
    //    (another write), NOT a hit served from A's slot.
    ctx.Storage.ResetCounts();
    const bRes = await rv.RunView<{ ID: string; UserID?: string }>(params(), fx.UserB);
    Assert(bRes.Success, `User B RunView failed: ${bRes.ErrorMessage}`);
    Assert(ctx.Storage.SetCount('RunViewCache') > 0,
        'RLS LEAK: User B served from cache (zero RunViewCache writes) — must be a separate cold slot, not a hit on User A\'s slot');

    // 3) Belt-and-suspenders: no row visible to B is scoped exclusively to A (only when the
    //    discovered entity carries a UserID column — UserID = '{{UserID}}' is the common filter).
    if (bRes.Results.length > 0 && 'UserID' in bRes.Results[0]) {
        const aIds = new Set(aRes.Results.map(r => r.ID));
        const leaked = bRes.Results.filter(r => r.UserID && UUIDsEqual(r.UserID, fx.UserA.ID) && !aIds.has(r.ID));
        Assert(leaked.length === 0, `RLS LEAK: ${leaked.length} User-A-scoped rows visible to User B`);
    }
}

/**
 * RLS3 — client smart-cache validation cannot cross-serve (client transport, needs MJAPI).
 * On the client (GraphQLDataProvider, TrustLocalCacheCompletely = false ⇒ opt-in
 * CacheLocal: true) the smart-cache validation flow incorporates the RLS clause in the
 * fingerprint too, so User B's request is a distinct slot that revalidates under B's own
 * RLS rather than being served `current` off A's slot. Runs only on the client transport
 * (the 'rls-isolation-client' bundle), like the client-cache suite — parked until MJAPI
 * is provisioned, exactly as IT03 is.
 */
export async function CheckRls3_ClientSmartCacheNoCrossServe(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.RlsFixture, 'rls-isolation-client.RLS3')) {
        return;
    }
    const fx = ctx.RlsFixture;
    const rv = new RunView();
    const params = (): RunViewParams => ({ EntityName: fx.EntityName, CacheLocal: true, ResultType: 'simple' });

    // Warm as A — CacheLocal: true writes a client RunViewCache slot under A's RLS fingerprint.
    ctx.Storage.ResetCounts();
    const aRes = await rv.RunView(params(), fx.UserA);
    Assert(aRes.Success, `User A client RunView failed: ${aRes.ErrorMessage}`);
    Assert(ctx.Storage.SetCount('RunViewCache') > 0, 'User A CacheLocal view should write a client RunViewCache slot');

    // As B — a different RLS fingerprint ⇒ no hit on A's slot; B revalidates under its own RLS.
    ctx.Storage.ResetCounts();
    const bRes = await rv.RunView(params(), fx.UserB);
    Assert(bRes.Success, `User B client RunView failed: ${bRes.ErrorMessage}`);
    Assert(ctx.Storage.GetCount('RunViewCache') === 0 || ctx.Storage.SetCount('RunViewCache') > 0,
        'RLS LEAK: User B smart-cache served from User A slot — the client fingerprint must include the RLS clause');
}

/**
 * RLS4 — the COMPLEMENT of RLS1, and always-runnable (no two-user discovery needed).
 * RLS1/RLS2 SKIP whenever the DB has no two users with distinct RLS clauses (the common
 * case on dev/admin databases), so the RLS invariant goes completely unexercised there.
 * RLS4 fills that gap using only the run's own context user + a real entity's live
 * metadata, asserting the two halves of the fingerprint contract:
 *   - an EMPTY effective clause must NOT alter the fingerprint (RLS-exempt users keep
 *     SHARING cache slots — the correctness half that prevents needless cache fragmentation);
 *   - a NON-EMPTY clause MUST alter it (the isolation half RLS1 proves for two users).
 * Exactly one branch runs per deployment, but the check always executes and always asserts.
 */
export async function CheckRls4_EmptyClauseSharesSlot(ctx: IntegrationCheckContext): Promise<void> {
    const entityName = 'MJ: User Settings';
    const entity = ctx.Provider.EntityByName(entityName);
    Assert(entity != null, `${entityName} must exist in provider metadata`);

    const clause = entity!.GetUserRowLevelSecurityWhereClause(ctx.User, EntityPermissionType.Read, '');
    const params: RunViewParams = { EntityName: entityName, ResultType: 'simple' };
    const connStr = connStrOf(ctx.Provider);
    const fpNoArg = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, connStr);
    const fpWithClause = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, connStr, clause);

    if (!clause || clause.trim() === '') {
        AssertEqual(fpWithClause, fpNoArg,
            'an EMPTY RLS clause must not change the fingerprint — RLS-exempt users must keep sharing cache slots');
    } else {
        Assert(fpWithClause !== fpNoArg,
            'a NON-EMPTY RLS clause must change the fingerprint — a scoped user must get its own slot (no cross-serve)');
    }
}

/** The 'rls-isolation' bundle (server transport): RLS1 + RLS2 + RLS4. */
export const RlsIsolationChecks: NamedCheck[] = [
    {
        Id: 'rls-isolation.RLS1',
        Name: 'RLS1: two distinct RLS clauses yield distinct cache fingerprints (no cross-user collision)',
        Fn: CheckRls1_FingerprintDiverges
    },
    {
        Id: 'rls-isolation.RLS2',
        Name: 'RLS2: server superset slot does not cross-serve — User B is a separate cold slot, no A-scoped rows leak',
        Fn: CheckRls2_ServerSupersetNoCrossServe
    },
    {
        Id: 'rls-isolation.RLS4',
        Name: 'RLS4: empty RLS clause shares the slot / non-empty diverges (always-runnable fingerprint invariant)',
        Fn: CheckRls4_EmptyClauseSharesSlot
    }
];

/** The 'rls-isolation-client' bundle (client transport, needs MJAPI): RLS3. */
export const RlsIsolationClientChecks: NamedCheck[] = [
    {
        Id: 'rls-isolation-client.RLS3',
        Name: 'RLS3: client smart-cache validation does not cross-serve User A\'s slot to User B',
        Fn: CheckRls3_ClientSmartCacheNoCrossServe
    }
];

for (const check of [...RlsIsolationChecks, ...RlsIsolationClientChecks]) {
    IntegrationCheckRegistry.Instance.Register(check);
}
