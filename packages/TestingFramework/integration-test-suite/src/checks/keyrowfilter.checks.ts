/**
 * keyrowfilter.checks.ts — API-KEY ROW FILTER checks (KF1–KF6), registered into the existing
 * 'rls-isolation' bundle (plan §7.4 deliberately extends the existing suites rather than
 * minting a new Test record — the checks share the bundle's transport, fixture, and threat
 * model: one principal's rows must never reach another).
 *
 * The mechanism under test (plans/api-key-row-filters.md, WS3): API-key row-filter bindings
 * are stamped on the per-request UserInfo (`APIKeyRowFilters`, plain data — no APIKeys
 * package dependency), and EntityInfo.GetEffectiveRowFilterWhereClause AND-composes them
 * with role RLS, OUTSIDE the role-RLS exemption. These checks stamp bindings directly onto
 * cloned principals — the exact carrier the server stamps per request — so the enforcement
 * seam (effective-clause composition → cache fingerprint → WHERE assembly → Load/Save
 * checks) is exercised end-to-end without minting API keys or waiting on scope-cache TTLs,
 * which keeps the bundle deterministic.
 *
 *   KF1 ★ KEY-FILTER ISOLATION: two principals differing ONLY in APIKeyRowFilters get
 *         DIFFERENT effective clauses, and the key term is AND-composed with the role term
 *         (never OR — a key filter must narrow, not widen). Needs the seeded scoped user
 *         (non-empty role clause) + a metadata filter distinct from the role's.
 *   KF2 ★ EXEMPTION INDEPENDENCE [FO]: a principal EXEMPT from role RLS (holds a role with
 *         a filter-less permission row) but carrying a key binding gets a NON-EMPTY
 *         effective clause containing the key filter — the §5.5 fail-open regression
 *         (v1 folded the key filter inside the early-returning role method; a careless
 *         rewrite would reintroduce it and pass every narrow-role test).
 *   KF3 ★ INV-1 CACHE-SLOT SEPARATION [FO]: two principals differing only in the resolved
 *         key filter, issuing IDENTICAL RunViewParams against a small cacheable result set,
 *         land in SEPARATE cache slots (divergent fingerprints + each run is its own cold
 *         write, RLS4-style) and the bound principal's rows all satisfy its key filter.
 *   KF4 ★ INV-2/INV-3 FINGERPRINT/WHERE AGREEMENT [FO]: the clause the cache fingerprint
 *         uses (ComputeRunViewRLSWhereClause) is BYTE-IDENTICAL to the clause the WHERE
 *         assembly uses (GetEffectiveRowFilterWhereClause), stable across consecutive
 *         calls and across binding order, and computed for the PASSED principal (a
 *         different principal yields a different clause — INV-3).
 *   KF5 ★ POST-IMAGE UPDATE REJECTION E2E (WS1 × WS3): an update that would move a row
 *         OUTSIDE an Update-type key filter fails with the specific post-image message and
 *         writes nothing; an update keeping the row inside succeeds. Uses an Update-typed
 *         key binding as the Update filter — the seeded role fixtures are read-only by
 *         design, and the binding drives the same CheckUpdateRLSPostImage path via
 *         GetEffectiveRowFilterWhereClause(Update).
 *   KF6 ★ LOAD-BY-PK ENFORCEMENT: a principal with a Read key binding cannot Load() a row
 *         outside the filter by primary key (§5.5 site 4 — the path a PreRunViewHook
 *         implementation would have missed), while the same principal without the binding
 *         can (the binding is the discriminator, not permissions).
 *
 * FIXTURES: KF1/KF2/KF4 are pure clause computation (nothing touched). KF3 is read-only.
 * KF5/KF6 create ONE throwaway 'MJ: Query Categories' row each and delete it in their own
 * `finally` — the scope-enforcement precedent for self-cleaning fixtures in the
 * deterministic tier. Every check SKIPS-AS-PASS with a loud note when its prerequisites
 * are absent (no self-scoped filter in metadata, seed not pushed, single-user DB), exactly
 * as RLS8/RLS9/RLS10 do.
 *
 * The self-scoped filter (`UserID = '{{UserID}}'`) is discovered from live metadata — the
 * core migration seeds it as 'UI: Own AI Agent Runs' (V202604241700), so it is present on
 * any v5.30+ database independent of the integration-test seed.
 */
import { RunView, LocalCacheManager, EntityPermissionType, UserInfo } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams, RowLevelSecurityFilterInfo, EntityInfo, APIKeyRowFilterBinding } from '@memberjunction/core';
import type { MJQueryCategoryEntity } from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { SEEDED_SCOPED_A_EMAIL, SEEDED_RLS_ENTITY, SEED_FIXTURES_COMMAND } from '@memberjunction/testing-integration';

/** Small, cacheable, UserID-bearing entity for the live legs (same choice as server-cache). */
const SMALL_ENTITY = 'MJ: Query Categories';

/** ProviderBase exposes the per-instance connection string used in the fingerprint. */
function connStrOf(provider: IMetadataProvider): string {
    return (provider as unknown as { InstanceConnectionString?: string }).InstanceConnectionString ?? '';
}

/**
 * Always-true, column-agnostic, unique-per-tag predicate (same technique as RLS4): each tag
 * is a distinct cold cache slot, so no other check's warmed slot can be mistaken for a hit.
 */
function coldFilter(tag: string): string {
    return `'${tag}' <> 'zzz-cache-test-marker'`;
}

/**
 * Clone a UserInfo the way the server's per-request stamping path does: the spread captures
 * the enumerable `_`-prefixed backing fields (contexts survive), and UserRoles needs the
 * explicit dance because it is a prototype accessor the spread cannot see (CLAUDE §2.3 /
 * buildMagicLinkSessionUser). Bindings are then stamped ONLY on the clone — never on the
 * shared source instance, which other checks read concurrently.
 */
function cloneUser(source: UserInfo): UserInfo {
    return new UserInfo(undefined, { ...source, UserRoles: source.UserRoles });
}

/** One Read/Create/Update/Delete key binding for the given entity + filter. */
function keyBinding(entity: EntityInfo, type: APIKeyRowFilterBinding['PermissionType'], filter: RowLevelSecurityFilterInfo): APIKeyRowFilterBinding {
    return { EntityID: entity.ID, PermissionType: type, FilterID: filter.ID };
}

/**
 * The self-scoped filter (`UserID = '{{UserID}}'`) from live metadata. Matched on the exact
 * text (not a name) so any deployment carrying the shape qualifies; the core migration seeds
 * 'UI: Own AI Agent Runs' with exactly this text. Its SQL is valid on any entity with a
 * UserID column, which is what lets the live checks bind it to SMALL_ENTITY.
 */
function findSelfScopedFilter(provider: IMetadataProvider): RowLevelSecurityFilterInfo | undefined {
    return (provider.RowLevelSecurityFilters ?? []).find(f => /^\s*UserID\s*=\s*'\{\{UserID\}\}'\s*$/i.test(f.FilterText ?? ''));
}

/** Loud, uniform skip-as-pass note (mirrors the RLS8/9/10 style). */
function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ rls-isolation.${checkId} SKIPPED — ${reason}`);
}

/**
 * KF1 — key-filter isolation (deterministic, no DB read).
 * Two clones of the SEEDED scoped user — identical roles, identical everything — differ ONLY
 * in APIKeyRowFilters. Their effective clauses MUST differ, and the bound clone's clause must
 * carry the key term AND-composed with the role term: AND is what makes "a key can be LESS
 * than its owner" true — OR-composition would let the key layer WIDEN role RLS.
 * Skips-as-pass when the seed is absent or metadata lacks a usable distinct filter.
 */
export async function CheckKf1_KeyFilterIsolation(ctx: IntegrationCheckContext): Promise<void> {
    const seeded = ctx.RlsFixture?.SeededScopedA;
    if (!seeded) {
        skipNote('KF1', `seeded scoped user ${SEEDED_SCOPED_A_EMAIL} not in the user cache; run \`${SEED_FIXTURES_COMMAND}\` to enable.`);
        return;
    }
    const entity = ctx.Provider.EntityByName(SEEDED_RLS_ENTITY);
    Assert(entity != null, `seeded RLS entity '${SEEDED_RLS_ENTITY}' not found in provider metadata`);

    const withoutKey = cloneUser(seeded);
    const roleClause = entity!.GetUserRowLevelSecurityWhereClause(withoutKey, EntityPermissionType.Read, '');
    Assert(roleClause.trim() !== '', `seeded user is unexpectedly role-exempt on '${SEEDED_RLS_ENTITY}' (is it ONLY in the scoped role?)`);

    // Pick a filter whose marked-up term is DISTINCT from the role clause, so "the key term
    // appears" is a real assertion, not satisfied by the role layer's own text. Any filter
    // qualifies — no SQL executes here — and one always exists on real DBs (the core
    // migration seeds three UI filters with different texts).
    const withKey = cloneUser(seeded);
    const keyFilter = (ctx.Provider.RowLevelSecurityFilters ?? []).find(f => {
        if (!f.FilterText || f.FilterText.trim() === '') {
            return false;
        }
        const term = f.MarkupFilterText(withKey, { unresolvedBehavior: 'match-nothing' });
        return term.trim() !== '' && !roleClause.includes(term);
    });
    if (!keyFilter) {
        skipNote('KF1', 'no RLS filter in metadata with markup text distinct from the role clause; key-vs-role composition not demonstrable here.');
        return;
    }
    withKey.APIKeyRowFilters = [keyBinding(entity!, 'Read', keyFilter)];

    const effWith = entity!.GetEffectiveRowFilterWhereClause(withKey, EntityPermissionType.Read, '');
    const effWithout = entity!.GetEffectiveRowFilterWhereClause(withoutKey, EntityPermissionType.Read, '');
    Assert(effWith !== effWithout,
        `KEY FILTER DROPPED: two principals differing ONLY in APIKeyRowFilters produced IDENTICAL effective clauses ('${effWith}') — the key layer is silently absent`);

    const keyTerm = keyFilter.MarkupFilterText(withKey, { unresolvedBehavior: 'match-nothing' });
    Assert(effWith.includes(keyTerm), `bound principal's clause must contain the key term '${keyTerm}', got: '${effWith}'`);
    Assert(!effWithout.includes(keyTerm), `unbound principal's clause must NOT contain the key term, got: '${effWithout}'`);
    Assert(effWith.includes(roleClause), `bound principal's clause must still contain the role term '${roleClause}', got: '${effWith}'`);
    Assert(effWith.includes(') AND ('),
        `key term must be AND-composed with the role term (a key filter narrows, never widens): '${effWith}'`);
    Assert(!effWithout.includes(') AND ('), `unbound principal's single-layer clause must have no cross-layer AND: '${effWithout}'`);
}

/**
 * KF2 — exemption independence [FO] (deterministic, no DB read).
 * THE §5.5 regression, pinned live: a principal EXEMPT from role RLS (the run's context user
 * holds a role with a filter-less permission row on the entity — precisely the service-
 * account/admin shape that holds real API keys) with a key binding must get a NON-EMPTY
 * effective clause containing the key filter. v1's design folded the key filter into the
 * role method AFTER its exemption early-return, which drops it for exactly these principals
 * while passing every narrow-role test — this check is the one that would have caught it.
 */
export async function CheckKf2_ExemptionIndependence(ctx: IntegrationCheckContext): Promise<void> {
    const filter = findSelfScopedFilter(ctx.Provider);
    if (!filter) {
        skipNote('KF2', "no self-scoped RLS filter (UserID = '{{UserID}}') in metadata; key binding not constructible.");
        return;
    }
    // Find an entity where the context user is role-EXEMPT (empty role clause). Admin/context
    // users are exempt nearly everywhere; probe a few known-cacheable candidates.
    const candidates = [SMALL_ENTITY, 'MJ: User Settings', 'MJ: User Views'];
    let entity: EntityInfo | undefined;
    for (const name of candidates) {
        const e = ctx.Provider.EntityByName(name);
        if (e && e.GetUserRowLevelSecurityWhereClause(ctx.User, EntityPermissionType.Read, '') === '') {
            entity = e;
            break;
        }
    }
    if (!entity) {
        skipNote('KF2', `context user ${ctx.User.Email} is not role-exempt on any candidate entity (${candidates.join(', ')}); exemption independence not demonstrable here.`);
        return;
    }

    const bound = cloneUser(ctx.User);
    bound.APIKeyRowFilters = [keyBinding(entity, 'Read', filter)];
    // Precondition: the ROLE layer alone still yields '' for the clone (it is genuinely exempt).
    AssertEqual(entity.GetUserRowLevelSecurityWhereClause(bound, EntityPermissionType.Read, ''), '',
        'precondition: the bound clone must remain role-exempt (the role layer must contribute nothing)');

    const effective = entity.GetEffectiveRowFilterWhereClause(bound, EntityPermissionType.Read, '');
    Assert(effective.trim() !== '',
        `FAIL-OPEN (§5.5): role-exempt principal with a key binding on '${entity.Name}' got an EMPTY effective clause — ` +
        `the key filter is silently absent for exactly the principals it exists to constrain`);
    const keyTerm = filter.MarkupFilterText(bound, { unresolvedBehavior: 'match-nothing' });
    Assert(effective.includes(keyTerm), `effective clause must contain the key term '${keyTerm}', got: '${effective}'`);
}

/**
 * KF3 — INV-1 cache-slot separation [FO] (live, read-only).
 * Two principals whose ONLY difference is the resolved key filter issue IDENTICAL
 * RunViewParams against a small cacheable result set. INV-1 demands the key filter be
 * emitted by ComputeRunViewRLSWhereClause (inside the fingerprint) — appended later in the
 * WHERE assembly would produce two principals sharing one slot with different effective
 * filters. Proven both ways, RLS3/RLS4-style: divergent fingerprints for the same params,
 * AND each principal's live run is its own cold WRITE (never a hit off the other's slot),
 * AND the bound principal's rows all satisfy its key filter (end-to-end enforcement, not
 * just fingerprint hygiene).
 */
export async function CheckKf3_CacheSlotSeparation(ctx: IntegrationCheckContext): Promise<void> {
    const filter = findSelfScopedFilter(ctx.Provider);
    if (!filter) {
        skipNote('KF3', "no self-scoped RLS filter (UserID = '{{UserID}}') in metadata; key binding not constructible.");
        return;
    }
    const entity = ctx.Provider.EntityByName(SMALL_ENTITY);
    Assert(entity != null, `${SMALL_ENTITY} must exist in provider metadata`);
    if (!entity!.Fields.some(f => f.Name === 'UserID')) {
        skipNote('KF3', `'${SMALL_ENTITY}' has no UserID column here; the self-scoped filter is not valid SQL against it.`);
        return;
    }
    if (!entity!.AllowCaching || entity!.TrustServerCacheCompletely === false) {
        skipNote('KF3', `'${SMALL_ENTITY}' is not server-cacheable here (AllowCaching=${entity!.AllowCaching}, Trust=${entity!.TrustServerCacheCompletely}); slot separation not observable.`);
        return;
    }

    const bound = cloneUser(ctx.User);
    bound.APIKeyRowFilters = [keyBinding(entity!, 'Read', filter)];
    const unbound = cloneUser(ctx.User); // identical principal, no binding — the ONLY difference

    // Mechanism leg: divergent effective clauses ⇒ divergent fingerprints for the SAME params.
    const clauseBound = entity!.GetEffectiveRowFilterWhereClause(bound, EntityPermissionType.Read, '');
    const clauseUnbound = entity!.GetEffectiveRowFilterWhereClause(unbound, EntityPermissionType.Read, '');
    Assert(clauseBound !== clauseUnbound, 'precondition: the key binding must change the effective clause');
    const makeParams = (): RunViewParams => ({ EntityName: SMALL_ENTITY, ExtraFilter: coldFilter('kf3'), ResultType: 'simple' });
    const connStr = connStrOf(ctx.Provider);
    const fpBound = LocalCacheManager.Instance.GenerateRunViewFingerprint(makeParams(), connStr, clauseBound);
    const fpUnbound = LocalCacheManager.Instance.GenerateRunViewFingerprint(makeParams(), connStr, clauseUnbound);
    Assert(fpBound !== fpUnbound,
        `INV-1 VIOLATION: identical cache fingerprint (${fpBound}) for two principals differing only in the key filter — ` +
        `the unbound principal could be served the filtered principal's rows, or worse, vice versa`);

    // Live leg 1: the BOUND principal's run is a cold write, and every row satisfies its filter.
    const rv = new RunView();
    ctx.Storage.ResetCounts();
    const boundRes = await rv.RunView<{ ID: string; UserID?: string }>(makeParams(), bound);
    Assert(boundRes.Success, `bound principal RunView failed: ${boundRes.ErrorMessage}`);
    Assert(ctx.Storage.SetCount('RunViewCache') > 0, 'bound principal must write its own RunViewCache slot (cold miss)');
    const leaks = boundRes.Results.filter(r => r.UserID && !UUIDsEqual(r.UserID, bound.ID));
    Assert(leaks.length === 0,
        `KEY FILTER LEAK on '${SMALL_ENTITY}': ${leaks.length} row(s) outside the key filter reached the bound principal`);

    // Live leg 2: the UNBOUND principal, IDENTICAL params — must be its own cold write,
    // never a hit served off the bound principal's (narrower) slot.
    ctx.Storage.ResetCounts();
    const unboundRes = await rv.RunView<{ ID: string; UserID?: string }>(makeParams(), unbound);
    Assert(unboundRes.Success, `unbound principal RunView failed: ${unboundRes.ErrorMessage}`);
    Assert(ctx.Storage.SetCount('RunViewCache') > 0,
        'INV-1 VIOLATION: unbound principal served from cache (zero RunViewCache writes) — it must get a SEPARATE cold slot, not the bound principal\'s');
    Assert(unboundRes.Results.length >= boundRes.Results.length,
        `unbound principal must see a superset (${unboundRes.Results.length} rows) of the filtered principal's rows (${boundRes.Results.length})`);
}

/**
 * KF4 — INV-2 / INV-3 fingerprint↔WHERE agreement [FO] (deterministic, no DB read).
 * The cache fingerprint's clause (ComputeRunViewRLSWhereClause) and the WHERE assembly's
 * clause (GetEffectiveRowFilterWhereClause) MUST be byte-identical (INV-2 — any
 * nondeterminism silently splits or merges cache slots), stable across consecutive calls
 * and across binding order, and computed for the PASSED principal (INV-3 — once the clause
 * is per-key, fingerprinting for one principal while filling the slot with another's rows
 * is a leak). Uses real metadata filters (no SQL executes) so the composed clause is
 * multi-layered when the DB carries 2+ filters.
 */
export async function CheckKf4_FingerprintWhereAgreement(ctx: IntegrationCheckContext): Promise<void> {
    const filters = (ctx.Provider.RowLevelSecurityFilters ?? []).filter(f => !!f.FilterText && f.FilterText.trim() !== '');
    if (filters.length === 0) {
        skipNote('KF4', 'no RLS filters in metadata; a key-filtered clause is not constructible.');
        return;
    }
    const entity = ctx.Provider.EntityByName(SMALL_ENTITY);
    Assert(entity != null, `${SMALL_ENTITY} must exist in provider metadata`);

    const bindings = filters.slice(0, 2).map(f => keyBinding(entity!, 'Read' as const, f));
    const principal = cloneUser(ctx.User);
    principal.APIKeyRowFilters = bindings;
    const params: RunViewParams = { EntityName: SMALL_ENTITY, ResultType: 'simple' };

    // ComputeRunViewRLSWhereClause is the provider's protected fingerprint-side seam;
    // structural cast for test access (same technique as connStrOf / RLS7).
    const providerSeam = ctx.Provider as unknown as {
        ComputeRunViewRLSWhereClause(p: RunViewParams, contextUser?: UserInfo): string;
    };

    // Same principal REFERENCE threaded to both computations — the INV-3 contract.
    const fp1 = providerSeam.ComputeRunViewRLSWhereClause(params, principal);
    const where1 = entity!.GetEffectiveRowFilterWhereClause(principal, EntityPermissionType.Read, '');
    const fp2 = providerSeam.ComputeRunViewRLSWhereClause(params, principal);
    const where2 = entity!.GetEffectiveRowFilterWhereClause(principal, EntityPermissionType.Read, '');

    Assert(fp1.trim() !== '', 'the bound principal carries a key binding, so the fingerprint clause must be non-empty');
    AssertEqual(fp1, where1,
        'INV-2 VIOLATION: the fingerprint clause and the WHERE-assembly clause differ — the slot is keyed on one filter and filled under another');
    AssertEqual(fp1, fp2, 'INV-2: the fingerprint clause must be byte-stable across consecutive calls (ordering stability)');
    AssertEqual(where1, where2, 'INV-2: the WHERE clause must be byte-stable across consecutive calls (ordering stability)');

    if (bindings.length >= 2) {
        // Binding ORDER must not change the clause bytes — the rendered clause sorts by
        // FilterID, so the same binding SET always produces the same slot.
        const reversed = cloneUser(ctx.User);
        reversed.APIKeyRowFilters = [bindings[1], bindings[0]];
        AssertEqual(entity!.GetEffectiveRowFilterWhereClause(reversed, EntityPermissionType.Read, ''), where1,
            'INV-2 VIOLATION: reversing binding order changed the clause bytes — the same binding set would split into two cache slots');
    } else {
        console.log('      (KF4: only one RLS filter in metadata — binding-order stability leg not exercised; byte-identity legs asserted)');
    }

    // INV-3: the clause must be computed for the PASSED principal, not a provider-cached one.
    const other = cloneUser(ctx.User); // no bindings
    const fpOther = providerSeam.ComputeRunViewRLSWhereClause(params, other);
    Assert(fpOther !== fp1,
        'INV-3 VIOLATION: a different principal produced the SAME fingerprint clause — the fingerprint is not computed from the passed principal');
}

/**
 * KF5 — post-image update rejection, end to end (live, self-cleaning fixture).
 * The WS1 × WS3 seam: an Update-typed key binding drives CheckUpdateRLSPostImage through
 * GetEffectiveRowFilterWhereClause(Update). An update that would move a fixture row OUTSIDE
 * the filter (reassign its owner) must fail with the specific post-image message and write
 * NOTHING; an update keeping the row inside must pass. The seeded role fixtures are
 * deliberately read-only (CanUpdate=false), so the Update filter comes from a key binding —
 * the same enforcement path, no metadata mutation, no cache refresh.
 */
export async function CheckKf5_PostImageUpdateRejection(ctx: IntegrationCheckContext): Promise<void> {
    const filter = findSelfScopedFilter(ctx.Provider);
    if (!filter) {
        skipNote('KF5', "no self-scoped RLS filter (UserID = '{{UserID}}') in metadata; an Update key binding is not constructible.");
        return;
    }
    const entity = ctx.Provider.EntityByName(SMALL_ENTITY);
    Assert(entity != null, `${SMALL_ENTITY} must exist in provider metadata`);
    if (!entity!.Fields.some(f => f.Name === 'UserID')) {
        skipNote('KF5', `'${SMALL_ENTITY}' has no UserID column here; the self-scoped filter is not valid SQL against it.`);
        return;
    }
    const otherUser = (UserCache.Instance.Users ?? []).find(u => !UUIDsEqual(u.ID, ctx.User.ID));
    if (!otherUser) {
        skipNote('KF5', 'only one user in the user cache; "move the row outside the filter" needs a second owner to move it to.');
        return;
    }

    const bound = cloneUser(ctx.User);
    bound.APIKeyRowFilters = [keyBinding(entity!, 'Update', filter)];

    // Fixture row owned by the context user (INSIDE the bound principal's Update filter),
    // created and deleted under the plain (unbound) context user.
    const row = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>(SMALL_ENTITY, ctx.User);
    row.NewRecord();
    row.Name = `zzz-it-kf5-${Date.now()}`;
    row.UserID = ctx.User.ID;
    Assert(await row.Save(), `KF5 fixture save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);

    try {
        const handle = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>(SMALL_ENTITY, bound);
        // Read is unfiltered for this principal (the binding is Update-typed), so the load
        // succeeds — which also pins that bindings apply per PERMISSION TYPE, not key-wide.
        Assert(await handle.Load(row.ID), 'fixture row must load for the bound principal (its binding is Update-typed, Read is unconstrained)');

        // ESCAPE ATTEMPT: reassign the owner — pre-image passes (row is currently the
        // principal's own), post-image must fail. Accept a false return OR a throw as the
        // rejection (Save returns false for logical failures; belt-and-suspenders per S31b).
        handle.UserID = otherUser.ID;
        let escaped: boolean;
        let message: string;
        try {
            escaped = await handle.Save();
            message = handle.LatestResult?.CompleteMessage ?? '';
        } catch (e) {
            escaped = false;
            message = e instanceof Error ? e.message : String(e);
        }
        Assert(!escaped,
            `POST-IMAGE ESCAPE (WS1): an update moving the row OUTSIDE the Update key filter was ACCEPTED — ` +
            `a caller can reassign a row they own to a scope they cannot see (privilege escalation)`);
        Assert(/outside your permitted row scope/i.test(message),
            `post-image rejection must carry its specific message ("...outside your permitted row scope"), got: '${message}'`);

        // Ground truth: the rejected update wrote NOTHING.
        const truth = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>(SMALL_ENTITY, ctx.User);
        Assert(await truth.Load(row.ID), 'ground-truth reload of the fixture row failed');
        Assert(UUIDsEqual(truth.UserID, ctx.User.ID),
            `rejected update MUST NOT write: fixture row's UserID changed to '${truth.UserID}'`);

        // INSIDE update: revert the owner, change a non-filter column — the post-image
        // check runs (the composed clause never fully decomposes for the skip-optimizer)
        // and passes, so the save succeeds.
        handle.UserID = ctx.User.ID;
        handle.Name = `zzz-it-kf5b-${Date.now()}`;
        Assert(await handle.Save(),
            `an update KEEPING the row inside the Update key filter must pass, got: ${handle.LatestResult?.CompleteMessage ?? 'unknown'}`);
    } finally {
        await row.Delete().catch(() => undefined);
    }
}

/**
 * KF6 — Load-by-PK enforcement (live, self-cleaning fixture).
 * §5.5 site 4 — the concrete path a PreRunViewHook implementation would have missed:
 * BaseEntity.Load() by primary key. A principal with a Read key binding must NOT be able to
 * load a row outside its filter, while the SAME principal without the binding loads it fine
 * (the binding — not permissions — is the discriminator).
 */
export async function CheckKf6_LoadByPkEnforcement(ctx: IntegrationCheckContext): Promise<void> {
    const filter = findSelfScopedFilter(ctx.Provider);
    if (!filter) {
        skipNote('KF6', "no self-scoped RLS filter (UserID = '{{UserID}}') in metadata; a Read key binding is not constructible.");
        return;
    }
    const entity = ctx.Provider.EntityByName(SMALL_ENTITY);
    Assert(entity != null, `${SMALL_ENTITY} must exist in provider metadata`);
    if (!entity!.Fields.some(f => f.Name === 'UserID')) {
        skipNote('KF6', `'${SMALL_ENTITY}' has no UserID column here; the self-scoped filter is not valid SQL against it.`);
        return;
    }
    const otherUser = (UserCache.Instance.Users ?? []).find(u => !UUIDsEqual(u.ID, ctx.User.ID));
    if (!otherUser) {
        skipNote('KF6', 'only one user in the user cache; a row OUTSIDE the self-scoped filter needs a different owner.');
        return;
    }

    // Fixture row owned by the OTHER user — outside the bound principal's self-scoped filter.
    const row = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>(SMALL_ENTITY, ctx.User);
    row.NewRecord();
    row.Name = `zzz-it-kf6-${Date.now()}`;
    row.UserID = otherUser.ID;
    Assert(await row.Save(), `KF6 fixture save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);

    try {
        const bound = cloneUser(ctx.User);
        bound.APIKeyRowFilters = [keyBinding(entity!, 'Read', filter)];
        const denied = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>(SMALL_ENTITY, bound);
        // A refused load may return false OR throw while resolving — both are denials (S31b precedent).
        let loaded: boolean;
        try {
            loaded = await denied.Load(row.ID);
        } catch {
            loaded = false;
        }
        Assert(!loaded,
            `LOAD-BY-PK BYPASS (§5.5 site 4): a principal with a Read key filter loaded a row OUTSIDE its filter by primary key — ` +
            `the exact path a hook-based implementation would miss`);

        // Control: the SAME principal WITHOUT the binding loads the row — proving the deny
        // above comes from the key filter, not from permissions or a bad fixture.
        const control = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>(SMALL_ENTITY, cloneUser(ctx.User));
        Assert(await control.Load(row.ID),
            `control load (no key binding) failed — fixture invalid, the KF6 deny above proves nothing: ${control.LatestResult?.CompleteMessage ?? 'unknown'}`);
    } finally {
        await row.Delete().catch(() => undefined);
    }
}

/**
 * The KF members of the 'rls-isolation' bundle (server transport). Registered after
 * RLS1–RLS10 (index.ts export order) so the bundle runs RLS* then KF*.
 */
export const KeyRowFilterChecks: NamedCheck[] = [
    {
        Id: 'rls-isolation.KF1',
        Name: 'KF1: two principals differing ONLY in API-key row-filter bindings get different clauses; key term is AND-composed with the role term',
        Fn: CheckKf1_KeyFilterIsolation
    },
    {
        Id: 'rls-isolation.KF2',
        Name: 'KF2: a role-RLS-EXEMPT principal with a key binding still gets a non-empty effective clause (the §5.5 fail-open regression)',
        Fn: CheckKf2_ExemptionIndependence
    },
    {
        Id: 'rls-isolation.KF3',
        Name: 'KF3: INV-1 — key-filtered and unfiltered principals with identical RunViewParams never share a cache slot',
        Fn: CheckKf3_CacheSlotSeparation
    },
    {
        Id: 'rls-isolation.KF4',
        Name: 'KF4: INV-2/INV-3 — fingerprint clause and WHERE clause are byte-identical, order-stable, and computed for the passed principal',
        Fn: CheckKf4_FingerprintWhereAgreement
    },
    {
        Id: 'rls-isolation.KF5',
        Name: 'KF5: an update moving a row OUTSIDE an Update key filter is rejected post-image (specific message, nothing written); inside-filter update passes',
        Fn: CheckKf5_PostImageUpdateRejection
    },
    {
        Id: 'rls-isolation.KF6',
        Name: 'KF6: Load-by-PK of a row outside a Read key filter fails for the bound principal and succeeds without the binding',
        Fn: CheckKf6_LoadByPkEnforcement
    }
];

for (const check of KeyRowFilterChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
