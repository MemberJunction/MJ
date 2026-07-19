/**
 * permission-engine.checks.ts — the 'permission-engine' bundle (PE1–PE12): live proof of the
 * UNIFIED PERMISSIONS model described in guides/UNIFIED_PERMISSIONS_GUIDE.md.
 *
 * TRANSPORT: **CLIENT-FIRST**. Every check here runs over the real GraphQL wire via
 * `bootstrapIntegrationClient` — the PermissionEngine, the permission providers, the
 * AIEngineBase permission helpers, and `EntityInfo.GetUserPermisions` are all provider-agnostic
 * and are exactly what a browser executes. Nothing here needs a server-only surface.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THESE CHECKS AND NOT "CAN USER X READ Y?"
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Permission tests are the easiest place in the whole suite to write a check that CANNOT FAIL:
 * the harness's context user is typically a high-privilege Owner, so any "is this allowed?"
 * question trivially answers `true` and proves nothing. Every check below is therefore one of:
 *
 *   (a) a DENY assertion — something that must come back refused / empty / closed; or
 *   (b) a DIFFERENCE between two identities or two access paths; or
 *   (c) a SHAPE assertion about the model itself (fan-out integrity, vocabulary conformance,
 *       catalog↔class agreement) — observable, drift-sensitive, and independent of who is asking.
 *
 * The checks:
 *   PE1  — domain fan-out: every ACTIVE `MJ: Permission Domains` row ClassFactory-resolves a
 *          provider whose `DomainName` matches the catalog row (adding a domain is data + a class)
 *   PE2  — every resolved provider conforms to the normalized vocabulary (PermissionAction /
 *          GranteeType unions, non-empty metadata)
 *   PE3  — catalog↔class agreement: the row's declared SupportedActions / SupportedGranteeTypes
 *          match the provider class's readonly metadata (drift detector)
 *   PE3b — the SupportsDeny leg of that agreement, asserted ASYMMETRICALLY: over-advertising Deny
 *          is a hard failure (an operator's Deny would be silently ignored); under-advertising is
 *          a warning (fail-safe). See the check for the known `Entity Permissions` finding.
 *   PE4  — DENY: an unknown domain fails CLOSED (Allowed=false + self-explaining Reason; `[]` rows)
 *   PE5  — DENY: the AI Agent provider refuses a domain-wide (null-resource) check and denies a
 *          stranger resource id — through a real provider, not a mock
 *   PE6  ★ DIFFERENCE: the agent two-access-path contract — the cached runtime helper is
 *          OPEN-by-default (View+Run for a non-owner) while the unified provider is
 *          CLOSED-by-default (`[]`, Execute denied) over the SAME zero-grant agent. BY DESIGN.
 *   PE7  ★ DIFFERENCE: the identical contract for AI Skills (helper open / provider closed)
 *   PE8  ★ DENY: once ANY grant row exists for a skill, the open default switches OFF — a
 *          non-matching user gets NOTHING; plus the Delete⇒Edit⇒Run⇒View hierarchy collapse.
 *          Pure, in-memory, zero-mutation (synthetic unsaved rows through the exported pure core).
 *   PE9  ★ DIFFERENCE (two real identities): the seeded role-less user `it-nogrant@integration.test`
 *          has NO Read on the seeded RLS entity while the context user does — the Entity
 *          Permissions / RLS concern, distinct from the unified provider concern.
 *   PE10 ★ DENY (two real identities): a role-less user can execute ZERO Authorizations — the
 *          capability concern fails closed.
 *   PE11 — [mutation] a catalog row naming an UNREGISTERED provider class is CONTAINED: `Config()`
 *          survives, every real domain still resolves, and the bogus domain grants nothing.
 *   PE12 — [mutation] a provider that THROWS asynchronously does not crash the
 *          `GetAllUserPermissions` fan-out (`Promise.allSettled`), and contributes zero rows.
 *   PE13 — [mutation] ⚠ **EXPECTED RED — a real defect this bundle found.** An unresolvable
 *          ProviderClassName installs a method-less abstract-base stub (ClassFactory does not
 *          return null), and `GetAllUserPermissions`'s mapper then throws SYNCHRONOUSLY inside
 *          `.map()` — before `Promise.allSettled` can isolate it — so ONE bad catalog row rejects
 *          the entire unified aggregate for every user. Left failing deliberately; a product fix
 *          is a human decision. Mutation-tier, so the default CI gate is unaffected.
 *
 * DEGRADATION: PE6–PE10 depend on discoverable real-world shapes (a zero-grant non-owned agent /
 * skill, the seeded no-grant user, a non-empty Authorization catalog). When a piece is absent the
 * check SKIPS-AS-PASS with a loud warning rather than asserting something vacuous. The seeded
 * principals come from the sibling `metadata-optional/integration-test/` root — seed them with
 * `npx mj sync push --dir=metadata-optional/integration-test`.
 *
 * MUTATION: only PE11/PE12 write, and only when RUN_MUTATION_TESTS=1 (the lifecycle Setup itself
 * honors the gate, so the deterministic path creates nothing at all). Their fixtures are two
 * throwaway `MJ: Permission Domains` rows tagged `(mj-integration-test — safe to delete)`, removed
 * in a best-effort Teardown. No existing record — and no real user's permissions — is ever touched.
 */
import { RunView, UserInfo, UserRoleInfo, PermissionProviderBase, AuthorizationEvaluator } from '@memberjunction/core';
import type {
    IMetadataProvider,
    NormalizedPermission,
    PermissionAction,
    PermissionCheckResult,
    GranteeType,
    AuthorizationInfo
} from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { PermissionEngine } from '@memberjunction/core-entities';
import type { MJPermissionDomainEntity, MJAIAgentEntity, MJAISkillEntity, MJAISkillPermissionEntity } from '@memberjunction/core-entities';
import { AIEngineBase, AIAgentPermissionHelper, AISkillPermissionHelper } from '@memberjunction/ai-engine-base';
import { Assert, AssertEqual } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { IsTierEnabled } from '../tiers';
import { NamedCheck, IntegrationCheckContext, PermissionEngineFixture } from '../check';

/** Tag on every throwaway row this bundle creates, so a stranded fixture is identifiable. */
const TEST_TAG = '(mj-integration-test — safe to delete)';

/** ClassFactory key for a domain row deliberately pointing at a class that is NEVER registered. */
const UNREGISTERED_PROVIDER_CLASS = 'ITNeverRegisteredPermissionProvider';

/** ClassFactory key for the deliberately-throwing provider registered by the bundle lifecycle. */
const THROWING_PROVIDER_CLASS = 'ITThrowingPermissionProvider';

/**
 * Name prefix on every throwaway domain row this bundle creates. The shape checks (PE1–PE3b)
 * exclude it so a mutation-tier fixture can never make them fail, and PE11 uses it to separate
 * "real" domains from its own.
 */
const FIXTURE_DOMAIN_PREFIX = 'Integration Test Domain — ';

/**
 * The throwing fixture's domain Name. It MUST equal `ThrowingPermissionProvider.DomainName`,
 * because `PermissionEngine` keys its provider map on the catalog row Name while PE1 asserts the
 * two agree. Prefixed like every other fixture row so the shape checks skip it.
 */
const THROWING_DOMAIN_NAME = `${FIXTURE_DOMAIN_PREFIX}Throwing`;

/** The seeded role-less integration user (see rls-isolation.checks.ts — same principal). */
const SEEDED_NOGRANT_EMAIL = 'it-nogrant@integration.test';

/** The entity the seeded scoped role grants Read on; the role-less user must NOT have it. */
const SEEDED_RLS_ENTITY = 'MJ: AI Agent Runs';

/** The command that seeds the integration principals — printed in every skip-as-pass warning. */
const SEED_FIXTURES_COMMAND = 'npx mj sync push --dir=metadata-optional/integration-test';

/** The canonical `PermissionAction` union, as data, for conformance assertions. */
const VALID_ACTIONS: readonly PermissionAction[] = ['Read', 'Create', 'Update', 'Delete', 'Share', 'Execute', 'Admin'];

/** The canonical `GranteeType` union, as data, for conformance assertions. */
const VALID_GRANTEE_TYPES: readonly GranteeType[] = ['User', 'Role', 'Everyone', 'Public'];

/** A GUID that will never be a real resource id — used to prove providers deny strangers. */
const STRANGER_RESOURCE_ID = '00000000-0000-4000-8000-0000000000FF';

// ─────────────────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────────────────

/** Ensure the unified engine is configured against THIS run's provider + user. */
async function configuredEngine(ctx: IntegrationCheckContext, force = false): Promise<PermissionEngine> {
    const engine = PermissionEngine.Instance;
    await engine.Config(force, ctx.User, ctx.Provider);
    return engine;
}

/** Ensure the AI metadata cache (agents/skills + their permission rows) is loaded. */
async function configuredAIEngine(ctx: IntegrationCheckContext): Promise<AIEngineBase> {
    const engine = AIEngineBase.Instance;
    await engine.Config(false, ctx.User, ctx.Provider);
    return engine;
}

/**
 * The REAL active domains — every active catalog row except the throwaway rows this bundle's
 * mutation checks create. The shape checks (PE1–PE3b) assert against product metadata only, so a
 * fixture can never make them fail (and so they still hard-fail on a genuine product regression).
 */
function realDomains(engine: PermissionEngine): MJPermissionDomainEntity[] {
    return engine.Domains.filter(d => !d.Name.startsWith(FIXTURE_DOMAIN_PREFIX));
}

/** Split a comma-delimited catalog column into trimmed, non-empty tokens. */
function tokens(csv: string | null | undefined): string[] {
    return (csv ?? '').split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/** Loud, uniform skip-as-pass note. Returns false so callers can `if (!note(...)) return;`. */
function skipNote(checkId: string, reason: string): false {
    console.warn(`  ⚠ permission-engine.${checkId} SKIPPED — ${reason}`);
    return false;
}

/**
 * Load the seeded role-less user as a real `UserInfo` (with its UserRoles), CLIENT-SIDE.
 * The server bundles read `UserCache.Instance.Users`; a browser-faithful client has no such
 * cache, so we reconstruct the principal from the `Users` + `User Roles` entities over the wire.
 * Returns undefined when the seed has not been pushed.
 */
async function loadSeededNoGrantUser(ctx: IntegrationCheckContext): Promise<UserInfo | undefined> {
    if (noGrantUserMemo !== undefined) {
        return noGrantUserMemo.User;
    }
    const rv = new RunView();
    const userResult = await rv.RunView<{ ID: string; Name: string; Email: string; Type: string; IsActive: boolean }>({
        EntityName: 'MJ: Users',
        ExtraFilter: `Email='${SEEDED_NOGRANT_EMAIL}'`,
        Fields: ['ID', 'Name', 'Email', 'Type', 'IsActive'],
        ResultType: 'simple'
    }, ctx.User);
    if (!userResult.Success) {
        throw new Error(`Users RunView failed: ${userResult.ErrorMessage}`);
    }
    if (userResult.Results.length === 0) {
        noGrantUserMemo = { User: undefined };
        return undefined;
    }
    const row = userResult.Results[0];
    const roleResult = await rv.RunView<{ UserID: string; RoleID: string }>({
        EntityName: 'MJ: User Roles',
        ExtraFilter: `UserID='${row.ID}'`,
        Fields: ['UserID', 'RoleID'],
        ResultType: 'simple'
    }, ctx.User);
    if (!roleResult.Success) {
        throw new Error(`User Roles RunView failed: ${roleResult.ErrorMessage}`);
    }
    const roles: UserRoleInfo[] = roleResult.Results.map(r => new UserRoleInfo({ UserID: r.UserID, RoleID: r.RoleID }));
    const user = new UserInfo(ctx.Provider, { ...row, UserRoles: roles });
    noGrantUserMemo = { User: user };
    return user;
}

/**
 * Per-process memo for the seeded no-grant principal — several checks need it and the lookup is
 * two round-trips. `undefined` = not yet looked up; `{ User: undefined }` = looked up and absent.
 */
let noGrantUserMemo: { User: UserInfo | undefined } | undefined = undefined;

/**
 * The identity the dual-path checks (PE6/PE7/PE8) evaluate as.
 *
 * PREFERS the seeded role-less user: the runtime helpers short-circuit to "all permissions" for a
 * resource's OWNER, so evaluating as the harness's high-privilege context user can mask the
 * default policy entirely on a DB whose agents/skills were all created by that same admin (exactly
 * what happens on a freshly-seeded dev database). A genuinely low-privilege identity makes the
 * open-by-default half meaningful — the helper must grant View+Run to a user with NO roles at all.
 * Falls back to the context user when the seed is absent.
 */
async function nonOwnerIdentity(ctx: IntegrationCheckContext): Promise<{ User: UserInfo; Label: string; Seeded: boolean }> {
    const seeded = await loadSeededNoGrantUser(ctx);
    return seeded
        ? { User: seeded, Label: SEEDED_NOGRANT_EMAIL, Seeded: true }
        : { User: ctx.User, Label: `${ctx.User.Email ?? ctx.User.Name} (context user — seed absent)`, Seeded: false };
}

/**
 * Find an agent with ZERO rows in `MJ: AI Agent Permissions` that the given user does NOT own.
 * Both conditions matter: zero rows exercises the default policy, and non-ownership stops the
 * helper's owner short-circuit from masking it. Returns undefined when no such agent exists.
 */
function findZeroGrantNonOwnedAgent(engine: AIEngineBase, user: UserInfo): MJAIAgentEntity | undefined {
    const granted = new Set(engine.AgentPermissions.map(p => p.AgentID.toLowerCase()));
    return engine.Agents.find(a =>
        !granted.has(a.ID.toLowerCase()) && !UUIDsEqual(a.OwnerUserID, user.ID)
    );
}

/** Skill sibling of {@link findZeroGrantNonOwnedAgent} (owner column is `CreatedByUserID`). */
function findZeroGrantNonOwnedSkill(engine: AIEngineBase, user: UserInfo): MJAISkillEntity | undefined {
    const granted = new Set(engine.SkillPermissions.map(p => p.SkillID.toLowerCase()));
    return engine.Skills.find(s =>
        !granted.has(s.ID.toLowerCase()) && !UUIDsEqual(s.CreatedByUserID, user.ID)
    );
}

/**
 * Build an UNSAVED `MJ: AI Skill Permissions` row for the pure-hierarchy check (PE8). Never
 * saved — it exists only to feed `AISkillPermissionHelper.ComputeEffectivePermissions`, which is
 * a pure static over already-loaded arrays. Zero mutation.
 */
async function makeUnsavedSkillPermission(
    ctx: IntegrationCheckContext,
    skillId: string,
    grant: { userId?: string | null; roleId?: string | null; canView?: boolean; canRun?: boolean; canEdit?: boolean; canDelete?: boolean }
): Promise<MJAISkillPermissionEntity> {
    const p = await ctx.Provider.GetEntityObject<MJAISkillPermissionEntity>('MJ: AI Skill Permissions', ctx.User);
    p.NewRecord();
    p.SkillID = skillId;
    p.UserID = grant.userId ?? null;
    p.RoleID = grant.roleId ?? null;
    p.CanView = grant.canView === true;
    p.CanRun = grant.canRun === true;
    p.CanEdit = grant.canEdit === true;
    p.CanDelete = grant.canDelete === true;
    return p;
}

/** A provider whose every data method throws — PE12's proof that the fan-out is fault-isolated. */
class ThrowingPermissionProvider extends PermissionProviderBase {
    readonly DomainName = THROWING_DOMAIN_NAME;
    readonly Description = `Deliberately-throwing provider ${TEST_TAG}`;
    readonly SupportedGranteeTypes: GranteeType[] = ['User'];
    readonly SupportedActions: PermissionAction[] = ['Read'];
    readonly SupportsDeny = false;

    async CheckPermission(): Promise<PermissionCheckResult> {
        throw new Error('ITThrowingPermissionProvider.CheckPermission — deliberate integration-test failure');
    }
    async GetEffectivePermissions(): Promise<NormalizedPermission[]> {
        throw new Error('ITThrowingPermissionProvider.GetEffectivePermissions — deliberate integration-test failure');
    }
    async GetUserResources(): Promise<NormalizedPermission[]> {
        throw new Error('ITThrowingPermissionProvider.GetUserResources — deliberate integration-test failure');
    }
    async GetResourcePermissions(): Promise<NormalizedPermission[]> {
        throw new Error('ITThrowingPermissionProvider.GetResourcePermissions — deliberate integration-test failure');
    }
}

/** Create one throwaway `MJ: Permission Domains` row pointing at `providerClassName`. */
async function createDomainRow(
    provider: IMetadataProvider,
    user: UserInfo,
    name: string,
    providerClassName: string
): Promise<MJPermissionDomainEntity> {
    const row = await provider.GetEntityObject<MJPermissionDomainEntity>('MJ: Permission Domains', user);
    row.NewRecord();
    row.Name = name;
    row.Description = `Throwaway integration-test permission domain ${TEST_TAG}`;
    row.ProviderClassName = providerClassName;
    row.SupportedGranteeTypes = 'User';
    row.SupportedActions = 'Read';
    row.SupportsDeny = false;
    row.SupportsExpiration = false;
    row.SupportsHierarchyInheritance = false;
    row.IsActive = true;
    const saved = await row.Save();
    if (!saved) {
        throw new Error(`could not create permission domain '${name}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    }
    return row;
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// checks
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * PE1 — the domain fan-out. `PermissionEngine.Config()` loads the `MJ: Permission Domains`
 * catalog and ClassFactory-instantiates one provider per ACTIVE row. This is the check that
 * catches the classic failure: a domain row ships, but its provider class was tree-shaken away
 * or its `@RegisterClass` key drifted from `ProviderClassName` — the engine logs and skips it,
 * so the domain silently vanishes from the Sharing Center with no error anywhere.
 */
export async function CheckPe1_DomainFanOut(ctx: IntegrationCheckContext): Promise<void> {
    const engine = await configuredEngine(ctx);
    const domains = realDomains(engine);
    Assert(domains.length > 0, 'no ACTIVE MJ: Permission Domains rows loaded — the catalog is empty or unreadable');

    const unresolved: string[] = [];
    const mismatched: string[] = [];
    for (const domain of domains) {
        const provider = engine.GetProvider(domain.Name);
        if (!provider) {
            unresolved.push(`${domain.Name} → ${domain.ProviderClassName}`);
            continue;
        }
        if (provider.DomainName !== domain.Name) {
            mismatched.push(`catalog '${domain.Name}' resolved a provider reporting DomainName '${provider.DomainName}'`);
        }
    }
    Assert(unresolved.length === 0, `active domain(s) whose ProviderClassName did not ClassFactory-resolve: ${unresolved.join('; ')}`);
    Assert(mismatched.length === 0, `provider DomainName drift: ${mismatched.join('; ')}`);
    console.log(`      → ${domains.length} active domain(s), all ClassFactory-resolved with matching DomainName`);
}

/**
 * PE2 — normalized-vocabulary conformance. Every provider must describe itself using the shared
 * `PermissionAction` / `GranteeType` vocabulary, because that is precisely what lets a sharing UI
 * render a domain it has never heard of. A typo'd action in a new provider fails here rather than
 * producing an un-renderable row in production.
 */
export async function CheckPe2_VocabularyConformance(ctx: IntegrationCheckContext): Promise<void> {
    const engine = await configuredEngine(ctx);
    const domains = realDomains(engine);
    Assert(domains.length > 0, 'no active permission domains to validate');

    const problems: string[] = [];
    for (const domain of domains) {
        const provider = engine.GetProvider(domain.Name);
        if (!provider) {
            continue; // PE1 owns the unresolved case; don't double-report
        }
        if (!provider.Description || provider.Description.trim().length === 0) {
            problems.push(`${domain.Name}: empty Description`);
        }
        if (provider.SupportedActions.length === 0) {
            problems.push(`${domain.Name}: SupportedActions is empty`);
        }
        if (provider.SupportedGranteeTypes.length === 0) {
            problems.push(`${domain.Name}: SupportedGranteeTypes is empty`);
        }
        for (const action of provider.SupportedActions) {
            if (!VALID_ACTIONS.includes(action)) {
                problems.push(`${domain.Name}: '${action}' is not a PermissionAction`);
            }
        }
        for (const grantee of provider.SupportedGranteeTypes) {
            if (!VALID_GRANTEE_TYPES.includes(grantee)) {
                problems.push(`${domain.Name}: '${grantee}' is not a GranteeType`);
            }
        }
        if (typeof provider.SupportsDeny !== 'boolean') {
            problems.push(`${domain.Name}: SupportsDeny is not a boolean`);
        }
    }
    Assert(problems.length === 0, `normalized-vocabulary violations: ${problems.join('; ')}`);
    console.log(`      → ${domains.length} provider(s) conform to the PermissionAction / GranteeType vocabulary`);
}

/**
 * PE3 — catalog↔class agreement. The `MJ: Permission Domains` row DECLARES the domain's
 * capabilities (`SupportedActions`, `SupportedGranteeTypes`, `SupportsDeny`) and the provider
 * class RESTATES them as readonly members. Admin UIs read the row; runtime code reads the class.
 * When they disagree, the UI offers a grant the provider will never honor. Drift detector.
 */
export async function CheckPe3_CatalogMatchesClass(ctx: IntegrationCheckContext): Promise<void> {
    const engine = await configuredEngine(ctx);
    const domains = realDomains(engine);
    Assert(domains.length > 0, 'no active permission domains to validate');

    const drift: string[] = [];
    for (const domain of domains) {
        const provider = engine.GetProvider(domain.Name);
        if (!provider) {
            continue;
        }
        const rowActions = new Set(tokens(domain.SupportedActions));
        const classActions = new Set<string>(provider.SupportedActions);
        const rowGrantees = new Set(tokens(domain.SupportedGranteeTypes));
        const classGrantees = new Set<string>(provider.SupportedGranteeTypes);

        for (const a of classActions) {
            if (!rowActions.has(a)) {
                drift.push(`${domain.Name}: class supports action '${a}' the catalog row does not declare`);
            }
        }
        for (const a of rowActions) {
            if (!classActions.has(a)) {
                drift.push(`${domain.Name}: catalog row declares action '${a}' the class does not support`);
            }
        }
        for (const g of classGrantees) {
            if (!rowGrantees.has(g)) {
                drift.push(`${domain.Name}: class supports grantee '${g}' the catalog row does not declare`);
            }
        }
        for (const g of rowGrantees) {
            if (!classGrantees.has(g)) {
                drift.push(`${domain.Name}: catalog row declares grantee '${g}' the class does not support`);
            }
        }
    }
    Assert(drift.length === 0, `catalog↔class drift: ${drift.join('; ')}`);
    console.log(`      → ${domains.length} domain(s): catalog action/grantee declarations match provider class metadata`);
}

/**
 * PE3b — the SupportsDeny leg of catalog↔class agreement, asserted ASYMMETRICALLY because the two
 * directions have opposite safety properties:
 *
 *   - **Row says Deny, class says no** → a hard FAILURE. An admin UI reading the catalog would
 *     offer a Deny grant that the provider silently ignores when evaluating. That is a real
 *     security hole: an operator believes they revoked access and they did not.
 *   - **Class says Deny, row says no** → a WARNING. The capability is under-advertised, so the UI
 *     simply never offers Deny. Fail-safe, but still drift worth surfacing.
 *
 * KNOWN FINDING (as of this bundle landing): `Entity Permissions` is in the WARN direction —
 * `EntityPermissionProvider.SupportsDeny = true` (Phase 2b added the Allow/Deny `Type` column to
 * `MJ: Entity Permissions` and `GetUserPermisions` honors it), but every row in
 * `metadata/permission-domains/.permission-domains.json` still declares `SupportsDeny: false`.
 * Net effect: Deny rows ARE enforced at runtime but no admin surface offers to create them.
 * Fixing that is a product decision (update the metadata row + `mj sync push`), not a test change.
 */
export async function CheckPe3b_SupportsDenyAgreement(ctx: IntegrationCheckContext): Promise<void> {
    const engine = await configuredEngine(ctx);
    const domains = realDomains(engine);
    Assert(domains.length > 0, 'no active permission domains to validate');

    const unsafe: string[] = [];
    const underAdvertised: string[] = [];
    for (const domain of domains) {
        const provider = engine.GetProvider(domain.Name);
        if (!provider || domain.SupportsDeny === provider.SupportsDeny) {
            continue;
        }
        if (domain.SupportsDeny && !provider.SupportsDeny) {
            unsafe.push(domain.Name);
        } else {
            underAdvertised.push(domain.Name);
        }
    }
    for (const name of underAdvertised) {
        console.warn(`      ⚠ '${name}': provider HONORS Deny but the catalog row declares SupportsDeny=false ` +
            `— Deny is enforced at runtime yet no admin surface offers it (metadata drift, fail-safe direction)`);
    }
    Assert(
        unsafe.length === 0,
        `domain(s) ADVERTISING Deny support their provider does not implement — an operator's Deny grant ` +
        `would be silently ignored (SECURITY): ${unsafe.join(', ')}`
    );
    console.log(`      → no domain over-advertises Deny; ${underAdvertised.length} under-advertise(s) (warned)`);
}

/**
 * PE4 — DENY: an unknown domain fails CLOSED. Asking the aggregator about a domain that has no
 * catalog row (or whose provider failed to load) must return `Allowed: false` with a Reason that
 * names the domain, and `GetResourcePermissions` must return `[]`. The alternative — silently
 * treating "no provider" as "no restriction" — would be a security hole.
 */
export async function CheckPe4_UnknownDomainFailsClosed(ctx: IntegrationCheckContext): Promise<void> {
    const engine = await configuredEngine(ctx);
    const bogus = 'Integration Test Nonexistent Domain 0F0F';
    Assert(engine.GetProvider(bogus) === undefined, `'${bogus}' unexpectedly resolved a provider`);

    for (const action of VALID_ACTIONS) {
        const result = await engine.CheckPermission(ctx.User, bogus, 'Anything', STRANGER_RESOURCE_ID, action);
        AssertEqual(result.Allowed, false, `unknown domain allowed '${action}' — permission model failed OPEN`);
        AssertEqual(result.DomainName, bogus, 'result did not echo the queried domain name');
        Assert(
            typeof result.Reason === 'string' && result.Reason.includes(bogus),
            `Reason must be self-explaining and name the domain; got: '${result.Reason}'`
        );
    }
    const rows = await engine.GetResourcePermissions(bogus, 'Anything', STRANGER_RESOURCE_ID);
    AssertEqual(rows.length, 0, 'unknown domain returned permission rows');
    console.log(`      → unknown domain denied all ${VALID_ACTIONS.length} actions with a naming Reason; rows=[]`);
}

/**
 * PE5 — DENY through a REAL provider. The AI Agent provider must (a) refuse a domain-wide check
 * (`resourceId = null`) rather than answering for "all agents", and (b) deny every action on a
 * resource id that has no grant rows at all. This is the closed-by-default half of the two-path
 * contract, asserted directly on the provider rather than through the aggregator.
 */
export async function CheckPe5_AgentProviderDenies(ctx: IntegrationCheckContext): Promise<void> {
    const engine = await configuredEngine(ctx);
    const provider = engine.GetProvider('AI Agent Permissions');
    if (!provider) {
        skipNote('PE5', "the 'AI Agent Permissions' domain is not active in this deployment");
        return;
    }

    const nullResource = await provider.CheckPermission(ctx.User, 'AI Agents', null, 'Read');
    AssertEqual(nullResource.Allowed, false, 'a domain-wide (null resourceId) agent check was ALLOWED — must be refused');
    Assert(nullResource.Reason.length > 0, 'refusal carried no Reason');

    for (const action of ['Read', 'Execute', 'Update', 'Delete'] as const) {
        const result = await provider.CheckPermission(ctx.User, 'AI Agents', STRANGER_RESOURCE_ID, action);
        AssertEqual(result.Allowed, false, `stranger agent id was granted '${action}' by the unified provider`);
    }
    const rows = await provider.GetEffectivePermissions(ctx.User, 'AI Agents', STRANGER_RESOURCE_ID);
    AssertEqual(rows.length, 0, 'unified provider reported grants for an agent id that has none');
    console.log('      → unified agent provider: null-resource refused, stranger id denied on all 4 actions');
}

/**
 * PE6 ★ — the TWO-ACCESS-PATH contract for AI Agents, the headline asymmetry of this domain.
 *
 * Both paths read the SAME `MJ: AI Agent Permissions` table, and they DELIBERATELY disagree:
 *   - `AIAgentPermissionHelper` (cached, `@memberjunction/ai-engine-base`) is the hot runtime gate
 *     and is **OPEN by default**: with no grant rows, ANY user may View and Run; only the owner
 *     may Edit or Delete.
 *   - `AIAgentPermissionProvider` (per-query, `@memberjunction/core-entities`) is the audit /
 *     Sharing-Center view and is **CLOSED by default**: it reports only EXPLICIT grants, so the
 *     same agent yields `[]` and a denied Execute.
 *
 * This is by design (guides/UNIFIED_PERMISSIONS_GUIDE.md §3) and is pinned here so nobody
 * "fixes" one path into agreement with the other. The difference — not either result alone —
 * is the assertion, so a high-privilege context user cannot make this check vacuous.
 */
export async function CheckPe6_AgentDualPathDefault(ctx: IntegrationCheckContext): Promise<void> {
    const ai = await configuredAIEngine(ctx);
    Assert(ai.Agents.length > 0, 'no AI Agents in metadata — cannot exercise the agent permission paths');

    const identity = await nonOwnerIdentity(ctx);
    const agent = findZeroGrantNonOwnedAgent(ai, identity.User);
    if (!agent) {
        skipNote('PE6', `no agent with zero 'MJ: AI Agent Permissions' rows that '${identity.Label}' does not own ` +
            `(${ai.Agents.length} agents, ${ai.AgentPermissions.length} grant rows)` +
            (identity.Seeded ? '' : ` — seed a low-privilege identity with: ${SEED_FIXTURES_COMMAND}`));
        return;
    }

    // Path 1 — cached runtime helper: OPEN by default for a non-owner.
    const helper = await AIAgentPermissionHelper.GetEffectivePermissions(agent.ID, identity.User);
    AssertEqual(helper.isOwner, false, `fixture selection failed: helper reports '${identity.Label}' as the owner of '${agent.Name}'`);
    AssertEqual(helper.canView, true, `runtime helper denied View on zero-grant agent '${agent.Name}' — open-by-default broken`);
    AssertEqual(helper.canRun, true, `runtime helper denied Run on zero-grant agent '${agent.Name}' — open-by-default broken`);
    AssertEqual(helper.canEdit, false, `runtime helper granted Edit on '${agent.Name}' to a NON-OWNER — owner-only broken`);
    AssertEqual(helper.canDelete, false, `runtime helper granted Delete on '${agent.Name}' to a NON-OWNER — owner-only broken`);

    // Path 2 — unified provider over the SAME table: CLOSED by default.
    const engine = await configuredEngine(ctx);
    const provider = engine.GetProvider('AI Agent Permissions');
    if (!provider) {
        skipNote('PE6', "the 'AI Agent Permissions' domain is not active — only the helper half could be verified");
        return;
    }
    const explicit = await provider.GetEffectivePermissions(identity.User, 'AI Agents', agent.ID);
    AssertEqual(explicit.length, 0, `unified provider reported ${explicit.length} grant(s) on a zero-grant agent — closed-by-default broken`);
    const execCheck = await provider.CheckPermission(identity.User, 'AI Agents', agent.ID, 'Execute');
    AssertEqual(execCheck.Allowed, false, 'unified provider ALLOWED Execute on a zero-grant agent — closed-by-default broken');

    // The contract IS the divergence.
    Assert(
        helper.canRun !== execCheck.Allowed,
        'the two access paths agreed on a zero-grant agent — the documented open/closed asymmetry has collapsed'
    );
    console.log(`      → agent '${agent.Name}' as '${identity.Label}': helper=open(View+Run) provider=closed([]) — asymmetry intact`);
}

/**
 * PE7 ★ — the identical two-access-path contract for AI Skills. Skills mirror Agents exactly
 * (`AISkillPermissionHelper` open-by-default vs `AISkillPermissionProvider` closed-by-default over
 * `MJ: AI Skill Permissions`), and pinning both means a change to the shared pattern cannot land
 * silently on one resource type.
 */
export async function CheckPe7_SkillDualPathDefault(ctx: IntegrationCheckContext): Promise<void> {
    const ai = await configuredAIEngine(ctx);
    if (ai.Skills.length === 0) {
        skipNote('PE7', 'no AI Skills in metadata — the skill permission paths are unexercised');
        return;
    }

    const identity = await nonOwnerIdentity(ctx);
    const skill = findZeroGrantNonOwnedSkill(ai, identity.User);
    if (!skill) {
        skipNote('PE7', `no skill with zero 'MJ: AI Skill Permissions' rows that '${identity.Label}' does not own ` +
            `(${ai.Skills.length} skills, ${ai.SkillPermissions.length} grant rows)` +
            (identity.Seeded ? '' : ` — seed a low-privilege identity with: ${SEED_FIXTURES_COMMAND}`));
        return;
    }

    const helper = await AISkillPermissionHelper.GetEffectivePermissions(skill.ID, identity.User);
    AssertEqual(helper.isOwner, false, `fixture selection failed: helper reports '${identity.Label}' as the owner of skill '${skill.Name}'`);
    AssertEqual(helper.canView, true, `runtime helper denied View on zero-grant skill '${skill.Name}' — open-by-default broken`);
    AssertEqual(helper.canRun, true, `runtime helper denied Run on zero-grant skill '${skill.Name}' — open-by-default broken`);
    AssertEqual(helper.canEdit, false, `runtime helper granted Edit on '${skill.Name}' to a NON-OWNER — owner-only broken`);
    AssertEqual(helper.canDelete, false, `runtime helper granted Delete on '${skill.Name}' to a NON-OWNER — owner-only broken`);

    const engine = await configuredEngine(ctx);
    const provider = engine.GetProvider('AI Skill Permissions');
    if (!provider) {
        skipNote('PE7', "the 'AI Skill Permissions' domain is not active — only the helper half could be verified");
        return;
    }
    const explicit = await provider.GetEffectivePermissions(identity.User, 'AI Skills', skill.ID);
    AssertEqual(explicit.length, 0, `unified provider reported ${explicit.length} grant(s) on a zero-grant skill — closed-by-default broken`);
    const execCheck = await provider.CheckPermission(identity.User, 'AI Skills', skill.ID, 'Execute');
    AssertEqual(execCheck.Allowed, false, 'unified provider ALLOWED Execute on a zero-grant skill — closed-by-default broken');

    Assert(
        helper.canRun !== execCheck.Allowed,
        'the two skill access paths agreed on a zero-grant skill — the documented asymmetry has collapsed'
    );
    console.log(`      → skill '${skill.Name}' as '${identity.Label}': helper=open(View+Run) provider=closed([]) — asymmetry intact`);
}

/**
 * PE8 ★ — the open default SWITCHES OFF once any grant row exists, plus the hierarchy collapse.
 *
 * This is the deny half of the runtime helper's policy and the easiest place for a regression to
 * hide: "open by default" must mean "open ONLY while the grant list is empty". The moment a skill
 * has ANY row, a user who matches none of them must get NOTHING — not the open default.
 *
 * Exercised through `AISkillPermissionHelper.ComputeEffectivePermissions`, the exported PURE core
 * over already-loaded arrays, with UNSAVED synthetic rows. Zero mutation, fully deterministic,
 * and independent of which identity the harness happens to run as.
 */
export async function CheckPe8_SkillGrantsCloseTheDefault(ctx: IntegrationCheckContext): Promise<void> {
    const ai = await configuredAIEngine(ctx);
    const identity = await nonOwnerIdentity(ctx);
    const skill = ai.Skills.find(s => !UUIDsEqual(s.CreatedByUserID, identity.User.ID));
    if (!skill) {
        skipNote('PE8', `no AI Skill owned by someone other than '${identity.Label}' — the non-owner policy is unexercised` +
            (identity.Seeded ? '' : ` — seed a low-privilege identity with: ${SEED_FIXTURES_COMMAND}`));
        return;
    }
    const other = STRANGER_RESOURCE_ID; // a grantee id that is definitively not the evaluated user

    // 1. Empty grant list → OPEN (View + Run), owner-only Edit/Delete.
    const open = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [], identity.User);
    AssertEqual(open.canView, true, 'empty grant list did not yield the open View default');
    AssertEqual(open.canRun, true, 'empty grant list did not yield the open Run default');
    AssertEqual(open.canEdit, false, 'empty grant list granted Edit to a non-owner');

    // 2. A grant row exists but targets SOMEONE ELSE → the default is off; this user gets NOTHING.
    const foreign = await makeUnsavedSkillPermission(ctx, skill.ID, { userId: other, canView: true, canRun: true });
    const closed = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [foreign], identity.User);
    AssertEqual(closed.canView, false, 'a non-matching grant row still yielded View — the open default did not switch off (SECURITY)');
    AssertEqual(closed.canRun, false, 'a non-matching grant row still yielded Run — the open default did not switch off (SECURITY)');
    AssertEqual(closed.canEdit, false, 'a non-matching grant row yielded Edit');
    AssertEqual(closed.canDelete, false, 'a non-matching grant row yielded Delete');

    // 3. Hierarchy collapse: a Delete-only grant for THIS user implies Edit, Run and View.
    const deleteOnly = await makeUnsavedSkillPermission(ctx, skill.ID, { userId: identity.User.ID, canDelete: true });
    const collapsed = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [foreign, deleteOnly], identity.User);
    AssertEqual(collapsed.canDelete, true, 'Delete grant did not yield Delete');
    AssertEqual(collapsed.canEdit, true, 'Delete did not imply Edit (hierarchy collapse broken)');
    AssertEqual(collapsed.canRun, true, 'Delete did not imply Run (hierarchy collapse broken)');
    AssertEqual(collapsed.canView, true, 'Delete did not imply View (hierarchy collapse broken)');

    // 4. A Run-only grant must NOT climb upward to Edit/Delete.
    const runOnly = await makeUnsavedSkillPermission(ctx, skill.ID, { userId: identity.User.ID, canRun: true });
    const runResult = AISkillPermissionHelper.ComputeEffectivePermissions(skill, [runOnly], identity.User);
    AssertEqual(runResult.canRun, true, 'Run grant did not yield Run');
    AssertEqual(runResult.canView, true, 'Run did not imply View');
    AssertEqual(runResult.canEdit, false, 'Run ESCALATED to Edit — the hierarchy is one-directional (SECURITY)');
    AssertEqual(runResult.canDelete, false, 'Run ESCALATED to Delete — the hierarchy is one-directional (SECURITY)');

    console.log('      → grants close the open default for non-matching users; Delete⇒Edit⇒Run⇒View collapses downward only');
}

/**
 * PE9 ★ — the ENTITY PERMISSIONS / RLS concern, proven with TWO REAL IDENTITIES.
 *
 * Distinct from the unified provider concern: this is set-level CRUD gating driven by
 * `MJ: Entity Permissions` and surfaced by `EntityInfo.GetUserPermisions`. The seeded role-less
 * principal (`it-nogrant@integration.test`, zero UserRoles) must have NO Read on an entity the
 * context user CAN read. Asserting the DIFFERENCE — not the context user's allow — is what makes
 * this non-vacuous under a high-privilege harness identity.
 */
export async function CheckPe9_EntityPermissionsDenyRolelessUser(ctx: IntegrationCheckContext): Promise<void> {
    const noGrant = await loadSeededNoGrantUser(ctx);
    if (!noGrant) {
        skipNote('PE9', `seeded user '${SEEDED_NOGRANT_EMAIL}' not found — seed with: ${SEED_FIXTURES_COMMAND}`);
        return;
    }
    AssertEqual(noGrant.UserRoles.length, 0, `fixture invalid: '${SEEDED_NOGRANT_EMAIL}' has ${noGrant.UserRoles.length} role(s); it must have none`);

    const entity = ctx.Provider.EntityByName(SEEDED_RLS_ENTITY);
    if (!entity) {
        skipNote('PE9', `entity '${SEEDED_RLS_ENTITY}' not present in metadata`);
        return;
    }

    const mine = entity.GetUserPermisions(ctx.User);
    const theirs = entity.GetUserPermisions(noGrant);
    if (!mine.CanRead) {
        skipNote('PE9', `the context user cannot Read '${SEEDED_RLS_ENTITY}' either — no privilege DIFFERENCE to assert`);
        return;
    }
    AssertEqual(theirs.CanRead, false, `role-less user '${SEEDED_NOGRANT_EMAIL}' was granted Read on '${SEEDED_RLS_ENTITY}' (SECURITY)`);
    AssertEqual(theirs.CanCreate, false, `role-less user was granted Create on '${SEEDED_RLS_ENTITY}' (SECURITY)`);
    AssertEqual(theirs.CanUpdate, false, `role-less user was granted Update on '${SEEDED_RLS_ENTITY}' (SECURITY)`);
    AssertEqual(theirs.CanDelete, false, `role-less user was granted Delete on '${SEEDED_RLS_ENTITY}' (SECURITY)`);
    console.log(`      → '${SEEDED_RLS_ENTITY}': context user CanRead=true, role-less user CanRead=false (real identity difference)`);
}

/**
 * PE10 ★ — the AUTHORIZATION (capability) concern fails closed for a role-less identity.
 *
 * `AuthorizationEvaluator.UserCanExecuteWithAncestors` walks the authorization tree matching the
 * user's ROLES. A user with zero roles must therefore be able to execute NOTHING — every named
 * capability gate (`Can Share Skills`, `Schema Management`, …) must refuse. If the evaluator ever
 * failed open on an empty role list, every feature gate in the product would open at once.
 */
export async function CheckPe10_RolelessUserHasNoAuthorizations(ctx: IntegrationCheckContext): Promise<void> {
    const auths: AuthorizationInfo[] = ctx.Provider.Authorizations ?? [];
    if (auths.length === 0) {
        skipNote('PE10', 'no MJ: Authorizations defined in this deployment — the capability gate is unexercised');
        return;
    }
    const noGrant = await loadSeededNoGrantUser(ctx);
    if (!noGrant) {
        skipNote('PE10', `seeded user '${SEEDED_NOGRANT_EMAIL}' not found — seed with: ${SEED_FIXTURES_COMMAND}`);
        return;
    }
    AssertEqual(noGrant.UserRoles.length, 0, `fixture invalid: '${SEEDED_NOGRANT_EMAIL}' has roles; it must have none`);

    const evaluator = new AuthorizationEvaluator();
    const leaked = auths.filter(a => evaluator.UserCanExecuteWithAncestors(a, noGrant, auths)).map(a => a.Name);
    AssertEqual(
        leaked.length,
        0,
        `role-less user '${SEEDED_NOGRANT_EMAIL}' can execute ${leaked.length} authorization(s): ${leaked.join(', ')} (SECURITY — capability gate failed OPEN)`
    );
    console.log(`      → role-less user denied all ${auths.length} authorization(s)`);
}

/**
 * Run `body` with exactly ONE throwaway domain row present, then remove it and restore the engine.
 *
 * Each mutation check owns its row for the duration of its own assertions (rather than the whole
 * bundle sharing one catalog mutation) so the checks cannot contaminate each other — PE13's
 * defective stub provider would otherwise poison PE12's fan-out and vice-versa. The row id is also
 * recorded on the fixture so the lifecycle Teardown can sweep it if this check dies mid-flight.
 */
async function withDomainRow(
    ctx: IntegrationCheckContext,
    fx: PermissionEngineFixture,
    name: string,
    providerClassName: string,
    body: (engine: PermissionEngine) => Promise<void>
): Promise<void> {
    const row = await createDomainRow(ctx.Provider, ctx.User, name, providerClassName);
    // Capture the id BEFORE Delete() — BaseEntity.Delete() resets the record, so `row.ID` is no
    // longer usable for bookkeeping afterwards (which would leave the id stranded on the fixture
    // and make Teardown re-attempt a Load on an already-deleted row).
    const rowId = row.ID;
    fx.CreatedDomainIds.push(rowId);
    fx.CreatedDomainNames.push(name);
    try {
        await body(await configuredEngine(ctx, true));
    } finally {
        let deleted = false;
        try {
            deleted = await row.Delete();
        } catch {
            /* best effort — the lifecycle Teardown sweeps stragglers */
        }
        if (!deleted) {
            console.warn(`  ⚠ permission-engine: could not delete throwaway domain '${name}' (${rowId}); Teardown will retry`);
        }
        fx.CreatedDomainIds = fx.CreatedDomainIds.filter(id => !UUIDsEqual(id, rowId));
        fx.CreatedDomainNames = fx.CreatedDomainNames.filter(n => n !== name);
        try {
            await PermissionEngine.Instance.Config(true, ctx.User, ctx.Provider);
        } catch {
            /* best effort */
        }
    }
}

/**
 * PE11 — [mutation] a catalog row naming an UNREGISTERED provider class must not compromise the
 * REST of the permission subsystem, and must never grant anything.
 *
 * ── CHARACTERIZATION NOTE (behavior found, not the behavior the code intends) ──
 * `PermissionEngine.instantiateProviders()` is written as
 * `const instance = ClassFactory.CreateInstance(...); if (instance) { register } else { LogError }`
 * — i.e. the author intended an unresolvable ProviderClassName to be SKIPPED. That `else` branch
 * is DEAD CODE: `ClassFactory.CreateInstance` does not return null for an unknown key, it falls
 * back to instantiating the ABSTRACT BASE (`PermissionProviderBase`). The engine therefore
 * installs a method-less stub as a live provider. This check asserts the properties that are
 * safety-relevant and true (no crash at Config time, real domains unaffected, nothing granted);
 * PE13 pins the consequence that is NOT safe.
 */
export async function CheckPe11_UnresolvableProviderIsContained(ctx: IntegrationCheckContext): Promise<void> {
    const fx = ctx.PermissionEngineFixture;
    if (!fx) {
        skipNote('PE11', 'mutation fixture not provisioned (RUN_MUTATION_TESTS is not 1)');
        return;
    }
    const name = `${FIXTURE_DOMAIN_PREFIX}Unresolvable ${Date.now()}`;
    await withDomainRow(ctx, fx, name, UNREGISTERED_PROVIDER_CLASS, async (engine) => {
        // Config() survived a catalog row whose provider class does not exist.
        AssertEqual(engine.Domains.some(d => d.Name === name), true, 'the throwaway unresolvable domain row was not loaded into the catalog');

        // Every REAL domain still resolved — one bad row did not cascade.
        const realDomains = engine.Domains.filter(d => !d.Name.startsWith(FIXTURE_DOMAIN_PREFIX));
        Assert(realDomains.length > 0, 'no real domains remained in the catalog to verify against');
        const broken = realDomains.filter(d => !engine.GetProvider(d.Name)).map(d => d.Name);
        AssertEqual(broken.length, 0, `one bad catalog row broke real domain(s): ${broken.join(', ')}`);

        // The bogus domain never ALLOWS anything (throwing is acceptable here; allowing is not).
        for (const action of VALID_ACTIONS) {
            let allowed = false;
            try {
                allowed = (await engine.CheckPermission(ctx.User, name, 'Anything', STRANGER_RESOURCE_ID, action)).Allowed;
            } catch {
                allowed = false; // a throw is a denial — unhelpful, but not an access grant
            }
            AssertEqual(allowed, false, `a domain with no loadable provider ALLOWED '${action}' (SECURITY)`);
        }

        const resolved = engine.GetProvider(name);
        if (resolved) {
            console.warn(
                `      ⚠ '${name}': ClassFactory returned an instance for the NEVER-REGISTERED class ` +
                `'${UNREGISTERED_PROVIDER_CLASS}' (got '${resolved.constructor?.name}', DomainName='${resolved.DomainName}'). ` +
                `PermissionEngine.instantiateProviders()'s "else LogError + skip" branch is therefore DEAD CODE — ` +
                `see PE13 for the consequence.`
            );
        }
        console.log(`      → unresolvable domain contained: ${realDomains.length} real domain(s) intact, nothing granted`);
    });
}

/**
 * PE12 — [mutation] a provider that THROWS (asynchronously, the normal failure mode) must not
 * crash the aggregate. `GetAllUserPermissions` fans out with `Promise.allSettled`, so one broken
 * domain degrades to "contributes nothing" rather than rejecting the whole call — which would
 * black-hole the Sharing Center and the audit surface for every user.
 */
export async function CheckPe12_ThrowingProviderDoesNotCrashFanOut(ctx: IntegrationCheckContext): Promise<void> {
    const fx = ctx.PermissionEngineFixture;
    if (!fx) {
        skipNote('PE12', 'mutation fixture not provisioned (RUN_MUTATION_TESTS is not 1)');
        return;
    }
    // The domain row's Name must equal the provider class's DomainName for the engine map to agree.
    await withDomainRow(ctx, fx, THROWING_DOMAIN_NAME, THROWING_PROVIDER_CLASS, async (engine) => {
        const throwing = engine.GetProvider(THROWING_DOMAIN_NAME);
        Assert(!!throwing, `the throwing provider '${THROWING_PROVIDER_CLASS}' did not resolve — fault isolation is unexercised`);
        Assert(
            typeof throwing!.GetUserResources === 'function',
            'the resolved provider is not the registered fixture class — the check would prove nothing'
        );

        let threw = false;
        try {
            await throwing!.GetUserResources(ctx.User);
        } catch {
            threw = true;
        }
        AssertEqual(threw, true, 'the fixture provider did not throw — it cannot prove fault isolation');

        const all: NormalizedPermission[] = await engine.GetAllUserPermissions(ctx.User);
        const fromThrower = all.filter(p => p.DomainName === THROWING_DOMAIN_NAME);
        AssertEqual(fromThrower.length, 0, 'the throwing provider somehow contributed rows');
        const healthy = new Set(all.map(p => p.DomainName));
        console.log(`      → fan-out survived an async-throwing provider: ${all.length} row(s) from ${healthy.size} healthy domain(s)`);
    });
}

/**
 * PE13 — [mutation] ⚠ EXPECTED RED: a single unresolvable ProviderClassName takes down the ENTIRE
 * unified-permission aggregate for every user.
 *
 * THE DEFECT (found by this bundle, deliberately left failing — a product fix is a human decision):
 *   1. `ClassFactory.CreateInstance(PermissionProviderBase, '<unknown key>')` returns an instance of
 *      the ABSTRACT BASE rather than null, so `PermissionEngine.instantiateProviders()`'s intended
 *      "skip unresolvable domains" branch never runs (see PE11) and a method-less stub is installed
 *      as a live provider.
 *   2. `GetAllUserPermissions` does `Promise.allSettled(providers.map(p => p.GetUserResources(user)))`.
 *      `allSettled` isolates *rejections*, but the stub's `GetUserResources` is `undefined`, so the
 *      mapper throws SYNCHRONOUSLY — inside `.map()`, BEFORE `allSettled` ever sees a promise. The
 *      whole call rejects with `p.GetUserResources is not a function`.
 *
 * IMPACT: one bad or tree-shaken provider class (exactly the failure `LoadPermissionProviders()`
 * exists to prevent, and exactly what PE1 detects) turns the Sharing Center, the "what has been
 * shared with me" inbox, and every `GetAllUserPermissions`-backed audit view into a hard error for
 * ALL users — not a degraded view. Fail-loud, not fail-closed.
 *
 * SUGGESTED FIX (product decision, NOT made here): wrap the mapper —
 * `providers.map(p => Promise.resolve().then(() => p.GetUserResources(user)))` — and/or have
 * `instantiateProviders()` reject an instance whose constructor is the abstract base.
 *
 * This check is MUTATION-TIER (RUN_MUTATION_TESTS=1), so it does not block the default CI gate.
 * It turns GREEN the moment either fix lands.
 */
export async function CheckPe13_UnresolvableProviderPoisonsFanOut(ctx: IntegrationCheckContext): Promise<void> {
    const fx = ctx.PermissionEngineFixture;
    if (!fx) {
        skipNote('PE13', 'mutation fixture not provisioned (RUN_MUTATION_TESTS is not 1)');
        return;
    }
    const name = `${FIXTURE_DOMAIN_PREFIX}Poison ${Date.now()}`;
    await withDomainRow(ctx, fx, name, UNREGISTERED_PROVIDER_CLASS, async (engine) => {
        let error: string | undefined;
        let rowCount = -1;
        try {
            const all = await engine.GetAllUserPermissions(ctx.User);
            rowCount = all.length;
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
        Assert(
            error === undefined,
            `GetAllUserPermissions REJECTED because one domain had an unresolvable provider class: "${error}". ` +
            `One bad catalog row disables the unified permission aggregate for every user (see this check's ` +
            `doc comment for the mechanism and the suggested fix).`
        );
        console.log(`      → fan-out survived an unresolvable provider: ${rowCount} row(s) returned`);
    });
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// registration
// ─────────────────────────────────────────────────────────────────────────────────────────

export const PermissionEngineChecks: NamedCheck[] = [
    { Id: 'permission-engine.PE1', Name: 'PE1: every active Permission Domain ClassFactory-resolves a matching provider (fan-out)', Fn: CheckPe1_DomainFanOut },
    { Id: 'permission-engine.PE2', Name: 'PE2: every provider conforms to the normalized PermissionAction / GranteeType vocabulary', Fn: CheckPe2_VocabularyConformance },
    { Id: 'permission-engine.PE3', Name: 'PE3: catalog row actions/grantees match the provider class metadata (drift detector)', Fn: CheckPe3_CatalogMatchesClass },
    { Id: 'permission-engine.PE3b', Name: 'PE3b: no domain ADVERTISES Deny support its provider does not implement', Fn: CheckPe3b_SupportsDenyAgreement },
    { Id: 'permission-engine.PE4', Name: 'PE4: an unknown permission domain fails CLOSED with a self-explaining Reason', Fn: CheckPe4_UnknownDomainFailsClosed },
    { Id: 'permission-engine.PE5', Name: 'PE5: the unified agent provider refuses a null resource and denies a stranger id', Fn: CheckPe5_AgentProviderDenies },
    { Id: 'permission-engine.PE6', Name: 'PE6: agent dual-path default — cached helper OPEN vs unified provider CLOSED (by design)', Fn: CheckPe6_AgentDualPathDefault },
    { Id: 'permission-engine.PE7', Name: 'PE7: skill dual-path default — cached helper OPEN vs unified provider CLOSED (by design)', Fn: CheckPe7_SkillDualPathDefault },
    { Id: 'permission-engine.PE8', Name: 'PE8: any grant row closes the open default for non-matching users; hierarchy collapses downward only', Fn: CheckPe8_SkillGrantsCloseTheDefault },
    { Id: 'permission-engine.PE9', Name: 'PE9: a role-less user has NO entity CRUD permission where the context user does', Fn: CheckPe9_EntityPermissionsDenyRolelessUser },
    { Id: 'permission-engine.PE10', Name: 'PE10: a role-less user can execute ZERO Authorizations (capability gate fails closed)', Fn: CheckPe10_RolelessUserHasNoAuthorizations },
    { Id: 'permission-engine.PE11', Name: 'PE11: a domain naming an unregistered provider class is contained (real domains intact, nothing granted)', Fn: CheckPe11_UnresolvableProviderIsContained, RequiresMutation: true },
    { Id: 'permission-engine.PE12', Name: 'PE12: an async-throwing provider does not crash the GetAllUserPermissions fan-out', Fn: CheckPe12_ThrowingProviderDoesNotCrashFanOut, RequiresMutation: true },
    { Id: 'permission-engine.PE13', Name: 'PE13: ⚠ KNOWN-RED — an unresolvable provider class must not poison the GetAllUserPermissions fan-out', Fn: CheckPe13_UnresolvableProviderPoisonsFanOut, RequiresMutation: true }
];

for (const check of PermissionEngineChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/**
 * Bundle lifecycle. Setup is GATED on the mutation tier: on the deterministic path it creates
 * NOTHING and leaves the fixture undefined (so PE1–PE10 run fully read-only and PE11–PE13
 * skip-as-pass). When RUN_MUTATION_TESTS=1 it only registers the throwing provider class on the
 * ClassFactory — each mutation check creates and deletes its OWN catalog row inside its own
 * try/finally (see `withDomainRow`), so no two checks ever share a mutated catalog. Teardown is a
 * best-effort sweep for rows stranded by a check that died mid-flight, plus a re-Config so a later
 * bundle in the same process sees the real catalog.
 */
IntegrationCheckRegistry.Instance.RegisterLifecycle('permission-engine', {
    async Setup(ctx: IntegrationCheckContext): Promise<void> {
        if (!IsTierEnabled('mutation')) {
            console.log('      (permission-engine: mutation tier disabled — PE11–PE13 fixtures not created)');
            return;
        }
        MJGlobal.Instance.ClassFactory.Register(PermissionProviderBase, ThrowingPermissionProvider, THROWING_PROVIDER_CLASS);
        ctx.PermissionEngineFixture = {
            UnresolvableDomainName: `${FIXTURE_DOMAIN_PREFIX}Unresolvable`,
            ThrowingDomainName: THROWING_DOMAIN_NAME,
            CreatedDomainNames: [],
            CreatedDomainIds: []
        };
    },

    async Teardown(ctx: IntegrationCheckContext): Promise<void> {
        const fx = ctx.PermissionEngineFixture;
        if (!fx) {
            return;
        }
        for (const id of fx.CreatedDomainIds) {
            try {
                const row = await ctx.Provider.GetEntityObject<MJPermissionDomainEntity>('MJ: Permission Domains', ctx.User);
                if (await row.Load(id)) {
                    const deleted = await row.Delete();
                    if (!deleted) {
                        console.warn(`  ⚠ permission-engine teardown: could not delete domain ${id}: ${row.LatestResult?.CompleteMessage ?? 'unknown'}`);
                    }
                }
            } catch (e) {
                console.warn(`  ⚠ permission-engine teardown: error deleting domain ${id}: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        ctx.PermissionEngineFixture = undefined;
        // Re-configure so the engine's provider map reflects the real catalog again.
        try {
            await PermissionEngine.Instance.Config(true, ctx.User, ctx.Provider);
        } catch (e) {
            console.warn(`  ⚠ permission-engine teardown: re-Config failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
});
