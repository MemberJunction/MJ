/**
 * rls-isolation.checks.ts — the UNIFIED RLS isolation suite: the 'rls-isolation'
 * bundle (RLS1–RLS6, server transport) and the client-transport 'rls-isolation-client'
 * bundle (RLS7). The #1 security deliverable of the integration tier: prove that one
 * user's Row-Level-Security-filtered cache entry can NEVER serve a different user, and
 * that the per-user RLS predicate is correctly substituted and enforced end-to-end.
 *
 * This is the superset of the two implementations that coexisted after the `next` merge
 * (the package fingerprint/cache-slot bundle + `next`'s inline rls-isolation-tests.ts):
 *   RLS1 — {{UserID}} token substitution embeds the user's own id (predicate markup works)
 *   RLS2 — two distinct users get DIFFERENT self-scoped predicate TEXT (segregation at the SQL level)
 *   RLS3 — two distinct effective clauses yield DIFFERENT cache FINGERPRINTS (no cross-user collision)
 *   RLS4 — server superset slot does not cross-serve: User B is a separate cold slot, no A-scoped rows leak
 *   RLS5 — a live RunView as a non-exempt user returns ONLY rows satisfying its RLS predicate (real scoping)
 *   RLS6 — empty effective clause shares the slot / non-empty diverges (always-runnable fingerprint invariant)
 *   RLS7 — client smart-cache validation does not cross-serve User A's slot to User B (client transport)
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
 * RLS filters + the live user list and surfaces three independent pieces, each guarding
 * its own checks so partial availability degrades gracefully (skip-as-pass with a note):
 *   - a two-user divergent-clause pair (UserA/UserB + Usable) for RLS3/RLS4/RLS7;
 *   - a `{{UserID}}`-scoped TokenFilter for RLS1/RLS2 (needs only the filter + 1–2 users);
 *   - a single non-exempt (user, entity) LivePair for RLS5 (needs only one scoped user).
 * Nothing is created, so teardown is a no-op. On an all-RLS-exempt-admins DB every piece is
 * absent and the whole suite skips-as-pass (correct — the invariant is unexercised, not violated).
 */
import { RunView, LocalCacheManager, EntityPermissionType } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider, RunViewParams, RowLevelSecurityFilterInfo } from '@memberjunction/core';
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

/** A check on an unusable two-user RLS fixture skip-passes (degrade gracefully) with a loud log. */
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
 * Emails of the purpose-built RLS test users seeded via version-controlled metadata. These
 * principals (users + the "Integration Test: RLS Scoped Reader" role + its entity-permission grant)
 * live in the SIBLING `metadata-integration-fixtures/` root — NOT the default-pushed `metadata/`
 * tree — so they never land in a production DB that only syncs `metadata/` (R2). A/B are each in
 * ONLY that role → genuinely scoped (non-exempt) on SEEDED_RLS_ENTITY; the no-grant user has no
 * roles. Kept in sync with the fixtures by convention (change both together).
 */
const SEEDED_SCOPED_A_EMAIL = 'it-rls-a@integration.test';
const SEEDED_SCOPED_B_EMAIL = 'it-rls-b@integration.test';
const SEEDED_NOGRANT_EMAIL = 'it-nogrant@integration.test';
/** The entity the seeded scoped role grants read on (with the `{{UserID}}` RLS filter). */
const SEEDED_RLS_ENTITY = 'MJ: AI Agent Runs';
/** The exact command that seeds the RLS principals — printed in every skip-as-pass warning below. */
const SEED_FIXTURES_COMMAND = 'npx mj sync push --dir=metadata-integration-fixtures';

/** Case-insensitive user-by-email lookup for the seeded fixtures. */
function findUserByEmail(users: UserInfo[], email: string): UserInfo | undefined {
    return users.find(u => u.Email?.toLowerCase() === email.toLowerCase());
}

/** Discover a `{{UserID}}`-scoped RLS filter from the provider (for the token-based checks). */
function discoverTokenFilter(provider: IMetadataProvider): RowLevelSecurityFilterInfo | undefined {
    const filters = provider.RowLevelSecurityFilters ?? [];
    return filters.find(f => f.FilterText?.includes('{{UserID}}'));
}

/** Discover the first non-exempt (user, entity) pair — a user with a non-empty Read clause. */
function discoverLivePair(provider: IMetadataProvider, users: UserInfo[]): { User: UserInfo; EntityName: string } | undefined {
    for (const u of users) {
        for (const e of provider.Entities) {
            const clause = e.GetUserRowLevelSecurityWhereClause(u, EntityPermissionType.Read, '');
            if (clause && clause.trim() !== '') {
                return { User: u, EntityName: e.Name };
            }
        }
    }
    return undefined;
}

/**
 * Discover the RLS fixture: a two-user divergent-clause pair PLUS the two independent
 * single-user pieces (TokenFilter, LivePair). Pure (no singletons) so it is unit-testable
 * with a mocked provider + synthetic users. The two-user discovery iterates entities,
 * computes each user's clause once per entity (O(entities × users)), and returns the first
 * entity where two distinct users get different non-empty clauses. TokenFilter/LivePair are
 * attached to every returned fixture regardless of two-user usability, so the single-user
 * checks (RLS1/RLS5) run even when the DB lacks two divergent users.
 */
export function discoverRlsFixture(provider: IMetadataProvider, users: UserInfo[]): RlsFixture {
    const distinct = users.filter((u, i) => users.findIndex(o => UUIDsEqual(o.ID, u.ID)) === i);
    const tokenFilter = discoverTokenFilter(provider);
    const livePair = discoverLivePair(provider, distinct);
    const seededScopedA = findUserByEmail(users, SEEDED_SCOPED_A_EMAIL);
    const seededScopedB = findUserByEmail(users, SEEDED_SCOPED_B_EMAIL);
    const seededNoGrant = findUserByEmail(users, SEEDED_NOGRANT_EMAIL);
    const attach = (fx: Omit<RlsFixture, 'TokenFilter' | 'LivePair' | 'SeededScopedA' | 'SeededScopedB' | 'SeededNoGrant'>): RlsFixture =>
        ({ ...fx, TokenFilter: tokenFilter, LivePair: livePair, SeededScopedA: seededScopedA, SeededScopedB: seededScopedB, SeededNoGrant: seededNoGrant });

    if (distinct.length < 2) {
        return attach({ UserA: users[0], UserB: users[0], EntityName: '', Usable: false, Reason: 'fewer than two distinct users in the user cache' });
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
                    return attach({ UserA: withClause[i].user, UserB: withClause[j].user, EntityName: entity.Name, Usable: true });
                }
            }
        }
    }
    return attach({ UserA: distinct[0], UserB: distinct[1], EntityName: '', Usable: false, Reason: 'only RLS-exempt users (no entity yields two distinct non-empty clauses)' });
}

/**
 * RLS1 — {{UserID}} token substitution (deterministic, no DB read).
 * The per-user marked-up predicate MUST embed THAT user's id and leave no unsubstituted
 * token. This is the most basic guarantee the whole RLS mechanism rests on: if markup
 * failed, every scoped query would carry a broken predicate. Needs only a `{{UserID}}`
 * filter + the run's context user; skips-as-pass when no such filter exists.
 */
export async function CheckRls1_TokenSubstitution(ctx: IntegrationCheckContext): Promise<void> {
    const filter = ctx.RlsFixture?.TokenFilter;
    if (!filter) {
        console.warn('  ⚠ rls-isolation.RLS1 SKIPPED — no {{UserID}}-scoped RLS filter in metadata; token substitution not exercised.');
        return;
    }
    const markup = filter.MarkupFilterText(ctx.User);
    Assert(markup.includes(ctx.User.ID), `{{UserID}} not substituted to ${ctx.User.ID}: ${markup}`);
    Assert(!markup.includes('{{UserID}}'), `token left unsubstituted: ${markup}`);
}

/**
 * RLS2 — two users get DIFFERENT self-scoped predicate TEXT (deterministic, no DB read).
 * The SQL-level complement of the RLS3 fingerprint check: prove segregation at the predicate
 * itself (each marked-up filter embeds its own user's id, and the two texts differ). Needs a
 * `{{UserID}}` filter + two distinct users; skips-as-pass when either is unavailable.
 */
export async function CheckRls2_DistinctPredicateText(ctx: IntegrationCheckContext): Promise<void> {
    const fx = ctx.RlsFixture;
    const filter = fx?.TokenFilter;
    if (!filter) {
        console.warn('  ⚠ rls-isolation.RLS2 SKIPPED — no {{UserID}}-scoped RLS filter in metadata.');
        return;
    }
    if (!fx || UUIDsEqual(fx.UserA.ID, fx.UserB.ID)) {
        console.warn('  ⚠ rls-isolation.RLS2 SKIPPED — only one distinct user available; isolation not demonstrable (RLS1 proves the mechanism).');
        return;
    }
    const ma = filter.MarkupFilterText(fx.UserA);
    const mb = filter.MarkupFilterText(fx.UserB);
    Assert(ma !== mb, `two users produced identical RLS text — A's cache slot could serve B: ${ma}`);
    Assert(ma.includes(fx.UserA.ID) && mb.includes(fx.UserB.ID), 'each predicate is scoped to its own user');
}

/**
 * RLS3 — fingerprint divergence (the core cache proof; deterministic, no DB read).
 * Two users with different effective RLS clauses MUST produce different cache
 * fingerprints for the SAME params. Directly exercises the third arg of
 * GenerateRunViewFingerprint (the `rls:<hash>` segment).
 */
export async function CheckRls3_FingerprintDiverges(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.RlsFixture, 'rls-isolation.RLS3')) {
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
 * RLS4 — server superset slot cannot cross-serve (live, mutation-free).
 * Warm the cache as User A, then read the SAME params as User B. User B's different RLS
 * fingerprint must be a cold MISS (a fresh RunViewCache write), NOT a hit served off A's
 * slot — and no A-scoped rows may leak into B's result. Counters are scoped to
 * 'RunViewCache' (the registry index lives in another category).
 */
export async function CheckRls4_ServerSupersetNoCrossServe(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.RlsFixture, 'rls-isolation.RLS4')) {
        return;
    }
    const fx = ctx.RlsFixture;
    const rv = new RunView();
    const params = (): RunViewParams => ({ EntityName: fx.EntityName, ExtraFilter: coldFilter('rls4'), ResultType: 'simple' });

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
 * RLS5 — live RunView as a non-exempt user returns ONLY rows satisfying its RLS predicate.
 * The end-to-end proof (not just the fingerprint / predicate text): run a real, cache-bypassing
 * RunView as a discovered non-exempt user and assert no row carries another user's UserID.
 * Needs the single-user LivePair; skips-as-pass when every available user is RLS-exempt (admins).
 */
export async function CheckRls5_LiveRunViewScoping(ctx: IntegrationCheckContext): Promise<void> {
    const pair = ctx.RlsFixture?.LivePair;
    if (!pair) {
        console.warn('  ⚠ rls-isolation.RLS5 SKIPPED — all available users are RLS-exempt (admins); live scoping not observable here (RLS1/RLS3 prove the mechanism).');
        return;
    }
    const entity = ctx.Provider.EntityByName(pair.EntityName);
    Assert(entity != null, `live-pair entity '${pair.EntityName}' not found in provider metadata`);

    const result = await new RunView().RunView<{ UserID?: string }>(
        { EntityName: pair.EntityName, ResultType: 'simple', MaxRows: 50, BypassCache: true }, pair.User
    );
    Assert(result.Success, `RunView on '${pair.EntityName}' as ${pair.User.Email} failed: ${result.ErrorMessage}`);
    if (entity!.Fields.some(f => f.Name === 'UserID')) {
        const leaks = result.Results.filter(r => r.UserID && !UUIDsEqual(r.UserID, pair.User.ID));
        Assert(leaks.length === 0, `RLS LEAK on '${pair.EntityName}': ${leaks.length} row(s) with another user's UserID reached ${pair.User.Email}`);
    }
}

/**
 * RLS6 — the COMPLEMENT of RLS3, and always-runnable (no two-user discovery needed).
 * RLS3/RLS4 SKIP whenever the DB has no two users with distinct RLS clauses (the common
 * case on dev/admin databases), so the RLS invariant goes completely unexercised there.
 * RLS6 fills that gap using only the run's own context user + a real entity's live
 * metadata, asserting the two halves of the fingerprint contract:
 *   - an EMPTY effective clause must NOT alter the fingerprint (RLS-exempt users keep
 *     SHARING cache slots — the correctness half that prevents needless cache fragmentation);
 *   - a NON-EMPTY clause MUST alter it (the isolation half RLS3 proves for two users).
 * Exactly one branch runs per deployment, but the check always executes and always asserts.
 */
export async function CheckRls6_EmptyClauseSharesSlot(ctx: IntegrationCheckContext): Promise<void> {
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

/**
 * RLS8 — DETERMINISTIC divergence on the seeded scoped users (no discovery guesswork).
 * The two purpose-built users (it-rls-a / it-rls-b), each in ONLY the scoped role, MUST get
 * DIFFERENT non-empty effective clauses on the seeded entity AND therefore different cache
 * fingerprints. This is RLS3's guarantee pinned to a known, version-controlled two-user scenario
 * so it runs on any DB the seed metadata was pushed to. Skips-as-pass when the seed is absent.
 */
export async function CheckRls8_SeededScopedDivergence(ctx: IntegrationCheckContext): Promise<void> {
    const a = ctx.RlsFixture?.SeededScopedA;
    const b = ctx.RlsFixture?.SeededScopedB;
    if (!a || !b) {
        console.warn(`  ⚠ rls-isolation.RLS8 SKIPPED — seeded scoped users (${SEEDED_SCOPED_A_EMAIL} / ${SEEDED_SCOPED_B_EMAIL}) not in the user cache; run \`${SEED_FIXTURES_COMMAND}\` to enable.`);
        return;
    }
    const entity = ctx.Provider.EntityByName(SEEDED_RLS_ENTITY);
    Assert(entity != null, `seeded RLS entity '${SEEDED_RLS_ENTITY}' not found in provider metadata`);

    const clauseA = entity!.GetUserRowLevelSecurityWhereClause(a, EntityPermissionType.Read, '');
    const clauseB = entity!.GetUserRowLevelSecurityWhereClause(b, EntityPermissionType.Read, '');
    Assert(clauseA.trim() !== '', `seeded user A is unexpectedly RLS-exempt on '${SEEDED_RLS_ENTITY}' (is it ONLY in the scoped role?)`);
    Assert(clauseB.trim() !== '', `seeded user B is unexpectedly RLS-exempt on '${SEEDED_RLS_ENTITY}'`);
    Assert(clauseA !== clauseB, `seeded users must get DIFFERENT scoped clauses (A='${clauseA}', B='${clauseB}')`);
    // Case-insensitive substring: a clause is scoped to a user iff it embeds that user's id. UUID casing
    // differs across SQL Server (upper) / PostgreSQL (lower), so compare case-folded (see UUID_COMPARISON_GUIDE).
    const clauseEmbedsId = (clause: string, id: string): boolean => clause.toLowerCase().includes(id.toLowerCase());
    Assert(clauseEmbedsId(clauseA, a.ID) && clauseEmbedsId(clauseB, b.ID), 'each seeded clause embeds its own UserID');

    const params: RunViewParams = { EntityName: SEEDED_RLS_ENTITY, ResultType: 'simple' };
    const connStr = connStrOf(ctx.Provider);
    const fpA = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, connStr, clauseA);
    const fpB = LocalCacheManager.Instance.GenerateRunViewFingerprint(params, connStr, clauseB);
    Assert(fpA !== fpB, `RLS LEAK RISK: seeded users A/B collide on one cache fingerprint (${fpA})`);
}

/**
 * RLS9 — DETERMINISTIC live no-leak on a seeded scoped user.
 * A real cache-bypassing RunView on the seeded entity as user A returns ONLY rows whose UserID is A's
 * (0 rows is a valid pass — a fresh test user owns none — and still proves nothing else leaks through).
 * Skips-as-pass when the seed is absent.
 */
export async function CheckRls9_SeededLiveNoLeak(ctx: IntegrationCheckContext): Promise<void> {
    const a = ctx.RlsFixture?.SeededScopedA;
    if (!a) {
        console.warn(`  ⚠ rls-isolation.RLS9 SKIPPED — seeded scoped user ${SEEDED_SCOPED_A_EMAIL} not in the user cache; run \`${SEED_FIXTURES_COMMAND}\` to enable.`);
        return;
    }
    const result = await new RunView().RunView<{ UserID?: string }>(
        { EntityName: SEEDED_RLS_ENTITY, ResultType: 'simple', MaxRows: 50, BypassCache: true }, a
    );
    Assert(result.Success, `RunView on '${SEEDED_RLS_ENTITY}' as ${a.Email} failed: ${result.ErrorMessage}`);
    const leaks = result.Results.filter(r => r.UserID && !UUIDsEqual(r.UserID, a.ID));
    Assert(leaks.length === 0, `RLS LEAK on '${SEEDED_RLS_ENTITY}': ${leaks.length} row(s) with another user's UserID reached ${a.Email}`);
}

/**
 * RLS10 — DETERMINISTIC negative case: a user with NO read grant is served NO rows.
 * The seeded no-grant user (it-nogrant, no roles) has no permission on the seeded entity, so a live
 * RunView must return zero rows (fail-closed) — never leak the set to an unauthorized caller. This is
 * the deterministic replacement for the old incidental reliance on anonymous@magic-link.local.
 * Skips-as-pass when the seed is absent.
 */
export async function CheckRls10_NoGrantUserDenied(ctx: IntegrationCheckContext): Promise<void> {
    const nogrant = ctx.RlsFixture?.SeededNoGrant;
    if (!nogrant) {
        console.warn(`  ⚠ rls-isolation.RLS10 SKIPPED — seeded no-grant user ${SEEDED_NOGRANT_EMAIL} not in the user cache; run \`${SEED_FIXTURES_COMMAND}\` to enable.`);
        return;
    }
    const result = await new RunView().RunView<{ UserID?: string }>(
        { EntityName: SEEDED_RLS_ENTITY, ResultType: 'simple', MaxRows: 50, BypassCache: true }, nogrant
    );
    // A user with no read permission must be served nothing — the query may fail-closed or return empty;
    // either way, ZERO rows must reach them.
    const rows = result.Success ? result.Results.length : 0;
    Assert(rows === 0, `RLS LEAK: no-grant user ${nogrant.Email} was served ${rows} row(s) of '${SEEDED_RLS_ENTITY}' (must be denied all)`);
}

/**
 * RLS7 — client smart-cache validation cannot cross-serve (client transport, needs MJAPI).
 * On the client (GraphQLDataProvider, TrustLocalCacheCompletely = false ⇒ opt-in
 * CacheLocal: true) the smart-cache validation flow incorporates the RLS clause in the
 * fingerprint too, so User B's request is a distinct slot that revalidates under B's own
 * RLS rather than being served `current` off A's slot. Runs only on the client transport
 * (the 'rls-isolation-client' bundle), like the client-cache suite — parked until MJAPI
 * is provisioned, exactly as IT03 is.
 */
export async function CheckRls7_ClientSmartCacheNoCrossServe(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.RlsFixture, 'rls-isolation-client.RLS7')) {
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

/** The 'rls-isolation' bundle (server transport): RLS1–RLS6 (discovery) + RLS8–RLS10 (seeded, deterministic). */
export const RlsIsolationChecks: NamedCheck[] = [
    {
        Id: 'rls-isolation.RLS1',
        Name: 'RLS1: the marked-up predicate embeds the user\'s own UserID (token substitution)',
        Fn: CheckRls1_TokenSubstitution
    },
    {
        Id: 'rls-isolation.RLS2',
        Name: 'RLS2: two different users get DIFFERENT self-scoped predicate text (SQL-level segregation)',
        Fn: CheckRls2_DistinctPredicateText
    },
    {
        Id: 'rls-isolation.RLS3',
        Name: 'RLS3: two distinct RLS clauses yield distinct cache fingerprints (no cross-user collision)',
        Fn: CheckRls3_FingerprintDiverges
    },
    {
        Id: 'rls-isolation.RLS4',
        Name: 'RLS4: server superset slot does not cross-serve — User B is a separate cold slot, no A-scoped rows leak',
        Fn: CheckRls4_ServerSupersetNoCrossServe
    },
    {
        Id: 'rls-isolation.RLS5',
        Name: 'RLS5: a live RunView as a non-exempt user returns ONLY rows satisfying its RLS predicate',
        Fn: CheckRls5_LiveRunViewScoping
    },
    {
        Id: 'rls-isolation.RLS6',
        Name: 'RLS6: empty RLS clause shares the slot / non-empty diverges (always-runnable fingerprint invariant)',
        Fn: CheckRls6_EmptyClauseSharesSlot
    },
    {
        Id: 'rls-isolation.RLS8',
        Name: 'RLS8: two SEEDED scoped users get distinct non-empty clauses + distinct fingerprints (deterministic)',
        Fn: CheckRls8_SeededScopedDivergence
    },
    {
        Id: 'rls-isolation.RLS9',
        Name: 'RLS9: a live RunView as a SEEDED scoped user returns ONLY its own rows (deterministic no-leak)',
        Fn: CheckRls9_SeededLiveNoLeak
    },
    {
        Id: 'rls-isolation.RLS10',
        Name: 'RLS10: a SEEDED no-grant user is served ZERO rows (deterministic negative — no unauthorized set)',
        Fn: CheckRls10_NoGrantUserDenied
    }
];

/** The 'rls-isolation-client' bundle (client transport, needs MJAPI): RLS7. */
export const RlsIsolationClientChecks: NamedCheck[] = [
    {
        Id: 'rls-isolation-client.RLS7',
        Name: 'RLS7: client smart-cache validation does not cross-serve User A\'s slot to User B',
        Fn: CheckRls7_ClientSmartCacheNoCrossServe
    }
];

for (const check of [...RlsIsolationChecks, ...RlsIsolationClientChecks]) {
    IntegrationCheckRegistry.Instance.Register(check);
}
