/**
 * scope-enforcement.checks.ts — the 'scope-enforcement' bundle (SE1–SE5): live proof of API-KEY
 * SCOPE ENFORCEMENT (test-catalog Domain 3, SEC3/SEC4/SEC10 + the ScopeEvaluator two-level model).
 *
 * TRANSPORT: **SERVER**. Like the sibling `api-keys` bundle, these checks drive the server-only
 * `APIKeyEngine` (`@memberjunction/api-keys`, which needs Node `crypto`) plus the real
 * `ScopeEvaluator` against the live DB + the real `APIKeysEngineBase` cache. The context provider is
 * a `SQLServerDataProvider`, and `engine.Config(true, ctx.User)` reloads the scope cache in-process
 * after each fixture write — the same refresh the `api-keys.AK3` check relies on.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * WHY THESE CHECKS AND NOT "CAN THIS KEY DO X?"
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A scope test that only asserts an ALLOW proves nothing — the seeded ceilings are permissive and
 * a fresh key with a broad grant is trivially allowed. Every check below therefore pins a **DENY**
 * that must beat an ALLOW, or a **DIFFERENCE** between two real principals/keys:
 *
 *   SE1 ★ DENY-PRECEDENCE: an Allow and a Deny rule on the SAME scope at the SAME priority → Deny
 *          wins (the `Priority DESC, IsDeny DESC` sort, ScopeEvaluator.ts:183-188). A control key
 *          with only the Allow rule proves the fixture is not vacuously denying everything.
 *   SE2 ★ APP-CEILING CAPS THE KEY: a key that GRANTS `agent:execute` is still DENIED when its bound
 *          application's scope ceiling omits that scope (ScopeEvaluator.ts:89) — while `entity:read`,
 *          which the ceiling DOES allow, passes. The application ceiling is the hard cap.
 *   SE3 ★ APP-BINDING: a key bound to application X is refused (`not authorized for this application`)
 *          when presented against application Y, even for a scope both would allow — the binding gate
 *          runs BEFORE the ceiling (ScopeEvaluator.ts:74-86).
 *   SE4 ★ UNSCOPED-KEY DEFAULT: a key with NO rule for the requested scope resolves by the evaluator's
 *          `defaultBehaviorNoScopes` — `'allow'` opens it, `'deny'` closes it (ScopeEvaluator.ts:156-169).
 *          Asserting the DIFFERENCE across two evaluators over the identical key + cache is non-vacuous,
 *          and pins that `GetAPIKeyEngine()` defaults to `'deny'` (the safe default) even though the
 *          bare `ScopeEvaluator` constructor defaults to `'allow'`.
 *   SE5 ★ full_access IS AN ORDINARY SCOPE AT THE ENGINE: a key granted `full_access` is allowed for
 *          `full_access` but the engine does NOT implicitly grant an unrelated scope it has no rule
 *          for. The god-mode bypass is a RESOLVER concern (ResolverBase full_access fast-path), not an
 *          engine one — pinning that keeps the two layers honest.
 *
 * DEGRADATION: SE1/SE3/SE4 lean on the seeded `entity:read` scope + `MJAPI` application (both proven
 * present by `api-keys.AK1/AK2`); SE2 needs `agent:execute` too. When a required seed is absent a check
 * SKIPS-AS-PASS with a loud note rather than asserting something vacuous.
 *
 * MUTATION / CLEANUP: every check creates its OWN throwaway key / key-scope / application /
 * application-scope / key-application rows tagged `(mj-integration-test — safe to delete)` and deletes
 * them (children before parents, plus any usage-log rows) in its own `finally`. Following the `api-keys`
 * precedent, self-cleaning fixtures keep the bundle in the DETERMINISTIC tier (no RequiresMutation gate).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * DOCUMENTED OMISSIONS (the MJServer enforcement wiring — not reachable from a check file)
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The per-request enforcement that turns these engine decisions into HTTP 403s lives in
 * `@memberjunction/server`:
 *   • `ResolverBase.CheckAPIKeyScopeAuthorization` (the `full_access` fast-path + per-resolver
 *     `entity:create/update/delete`, `view:run` gates) and `context.ts` (`x-api-key` → UserInfo,
 *     `x-mj-api-key` → `isSystemUser`), and the `@RequireSystemUser` directive (SEC8).
 * These are NOT exercised here for two hard reasons:
 *   1. A NEW key's SCOPE rules are only honored over the wire after the SERVER process reloads its
 *      `APIKeysEngineBase` cache — a client cannot force that refresh, so a wire leg with a freshly
 *      minted key can't be made deterministic without a server restart (research-confirmed).
 *   2. `@memberjunction/server` VALIDATES DB config at MODULE LOAD and throws when it is absent —
 *      importing it from a check file would crash this package's own registry unit tests (which
 *      enumerate the barrel with no DB configured). So the real resolver/directive code cannot be
 *      imported headlessly. SE5 pins the engine-side complement (full_access is not an engine bypass);
 *      the resolver fast-path + `@RequireSystemUser` boundary are left as a live-wire omission.
 */
import { RunView } from '@memberjunction/core';
import {
    MJAPIKeyEntity,
    MJAPIKeyScopeEntity,
    MJAPIApplicationEntity,
    MJAPIApplicationScopeEntity,
    MJAPIKeyApplicationEntity,
    MJAPIKeyUsageLogEntity
} from '@memberjunction/core-entities';
import { GetAPIKeyEngine, ScopeEvaluator } from '@memberjunction/api-keys';
import type { APIKeyEngine, AuthorizationRequest } from '@memberjunction/api-keys';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** Tag on every throwaway row this bundle creates, so a stranded fixture is identifiable. */
const TEST_TAG = '(mj-integration-test — safe to delete)';

/** Loud, uniform skip-as-pass note. Returns false so a caller can `if (!skip(...)) return;`. */
function skipNote(checkId: string, reason: string): false {
    console.warn(`  ⚠ scope-enforcement.${checkId} SKIPPED — ${reason}`);
    return false;
}

/** A reversible cleanup step (delete one fixture row). Run LIFO so children precede parents. */
type Cleanup = () => Promise<unknown>;

/**
 * Resolve a seeded API Scope ID by its FullPath from the loaded engine cache, or undefined when the
 * scope is not seeded in this deployment (→ the caller skips-as-pass rather than asserting vacuously).
 */
function scopeIdByPath(engine: APIKeyEngine, fullPath: string): string | undefined {
    return engine.Scopes.find(s => s.FullPath === fullPath)?.ID;
}

/**
 * Mint a real throwaway API key for `ctx.User` and register its deletion (including any usage-log
 * rows that `Authorize()` may write, which FK the key). Returns the key id + its SHA-256 hash.
 */
async function createKey(
    engine: APIKeyEngine,
    ctx: IntegrationCheckContext,
    cleanup: Cleanup[]
): Promise<{ apiKeyId: string; hash: string }> {
    const created = await engine.CreateAPIKey({ UserId: ctx.User.ID, Label: `scope-enf key ${TEST_TAG}` }, ctx.User);
    Assert(created.Success && !!created.RawKey && !!created.APIKeyId, `CreateAPIKey failed: ${created.Error}`);
    const apiKeyId = created.APIKeyId!;
    const hash = engine.HashAPIKey(created.RawKey!);
    // Delete the key LAST — its FK children (scopes, bindings, usage logs) are pushed after this,
    // and LIFO cleanup removes them first.
    cleanup.push(async () => {
        const key = await ctx.Provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', ctx.User);
        if (await key.Load(apiKeyId)) {
            await key.Delete().catch(() => undefined);
        }
    });
    cleanup.push(() => deleteUsageLogs(ctx, apiKeyId));
    return { apiKeyId, hash };
}

/** Add one key-scope rule (allow or deny) to a key and register its deletion. */
async function addKeyScope(
    ctx: IntegrationCheckContext,
    cleanup: Cleanup[],
    apiKeyId: string,
    scopeID: string,
    opts: { isDeny: boolean; priority: number; pattern?: string; patternType?: 'Include' | 'Exclude' }
): Promise<void> {
    const rule = await ctx.Provider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', ctx.User);
    rule.NewRecord();
    rule.APIKeyID = apiKeyId;
    rule.ScopeID = scopeID;
    rule.ResourcePattern = opts.pattern ?? '*';
    rule.PatternType = opts.patternType ?? 'Include';
    rule.IsDeny = opts.isDeny;
    rule.Priority = opts.priority;
    Assert(await rule.Save(), `saving key scope failed: ${rule.LatestResult?.CompleteMessage}`);
    cleanup.push(() => rule.Delete());
}

/** Create a throwaway (active) Application and register its deletion. Returns the app id + name. */
async function createApplication(
    ctx: IntegrationCheckContext,
    cleanup: Cleanup[],
    nameSuffix: string
): Promise<{ appId: string; appName: string }> {
    const appName = `it-scope-enf-${nameSuffix}-${Date.now()}`;
    const app = await ctx.Provider.GetEntityObject<MJAPIApplicationEntity>('MJ: API Applications', ctx.User);
    app.NewRecord();
    app.Name = appName;
    app.Description = `Throwaway integration-test application ${TEST_TAG}`;
    app.IsActive = true;
    Assert(await app.Save(), `saving application failed: ${app.LatestResult?.CompleteMessage}`);
    const appId = app.ID;
    cleanup.push(() => app.Delete());
    return { appId, appName };
}

/** Add one application-scope ceiling rule and register its deletion. */
async function addApplicationScope(
    ctx: IntegrationCheckContext,
    cleanup: Cleanup[],
    appId: string,
    scopeID: string,
    opts?: { isDeny?: boolean; priority?: number; pattern?: string; patternType?: 'Include' | 'Exclude' }
): Promise<void> {
    const rule = await ctx.Provider.GetEntityObject<MJAPIApplicationScopeEntity>('MJ: API Application Scopes', ctx.User);
    rule.NewRecord();
    rule.ApplicationID = appId;
    rule.ScopeID = scopeID;
    rule.ResourcePattern = opts?.pattern ?? '*';
    rule.PatternType = opts?.patternType ?? 'Include';
    rule.IsDeny = opts?.isDeny ?? false;
    rule.Priority = opts?.priority ?? 0;
    Assert(await rule.Save(), `saving application scope failed: ${rule.LatestResult?.CompleteMessage}`);
    cleanup.push(() => rule.Delete());
}

/** Bind a key to an application (MJ: API Key Applications) and register its deletion. */
async function bindKeyToApplication(
    ctx: IntegrationCheckContext,
    cleanup: Cleanup[],
    apiKeyId: string,
    appId: string
): Promise<void> {
    const binding = await ctx.Provider.GetEntityObject<MJAPIKeyApplicationEntity>('MJ: API Key Applications', ctx.User);
    binding.NewRecord();
    binding.APIKeyID = apiKeyId;
    binding.ApplicationID = appId;
    Assert(await binding.Save(), `saving key-application binding failed: ${binding.LatestResult?.CompleteMessage}`);
    cleanup.push(() => binding.Delete());
}

/** Remove every usage-log row for a key (FK on APIKeyID) — Authorize() may have written some. */
async function deleteUsageLogs(ctx: IntegrationCheckContext, apiKeyId: string): Promise<void> {
    const logs = await new RunView().RunView<MJAPIKeyUsageLogEntity>(
        { EntityName: 'MJ: API Key Usage Logs', ExtraFilter: `APIKeyID='${apiKeyId}'`, ResultType: 'entity_object' },
        ctx.User
    );
    for (const log of logs.Results ?? []) {
        await log.Delete().catch(() => undefined);
    }
}

/** Run every cleanup step LIFO, best-effort (never throws). */
async function runCleanup(cleanup: Cleanup[]): Promise<void> {
    for (const del of cleanup.reverse()) {
        await del().catch(() => undefined);
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// checks
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * SE1 ★ — deny-precedence. Two rules on `entity:read`, same priority, one Allow + one Deny → Deny
 * wins (ScopeEvaluator sorts `IsDeny DESC` at equal priority, so the deny rule is evaluated first and
 * short-circuits). A control key carrying ONLY the Allow rule proves the seeded `MJAPI` ceiling admits
 * `entity:read`, so the deny in the first key is genuinely the thing flipping the decision.
 */
export async function CheckSe1_DenyPrecedence(ctx: IntegrationCheckContext): Promise<void> {
    const engine = GetAPIKeyEngine();
    await engine.Config(true, ctx.User);
    const readScopeId = scopeIdByPath(engine, 'entity:read');
    if (!readScopeId) {
        skipNote('SE1', "seeded scope 'entity:read' not present");
        return;
    }
    const cleanup: Cleanup[] = [];
    try {
        // Key A: Allow + Deny on entity:read at equal priority.
        const keyA = await createKey(engine, ctx, cleanup);
        // UQ_APIKeyScope is (APIKeyID, ScopeID, ResourcePattern) — the Allow and Deny rows
        // must differ by pattern. Deny targets the exact evaluated resource ('Users'); Allow
        // is the wildcard. At equal priority the evaluator sorts IsDeny DESC, so the matching
        // Deny short-circuits — the same precedence proof, schema-correct.
        await addKeyScope(ctx, cleanup, keyA.apiKeyId, readScopeId, { isDeny: false, priority: 0, pattern: '*' });
        await addKeyScope(ctx, cleanup, keyA.apiKeyId, readScopeId, { isDeny: true, priority: 0, pattern: 'Users' });
        // Key B (control): Allow only.
        const keyB = await createKey(engine, ctx, cleanup);
        await addKeyScope(ctx, cleanup, keyB.apiKeyId, readScopeId, { isDeny: false, priority: 0 });

        await engine.Config(true, ctx.User); // reload cache so both keys + their rules are visible

        const denied = await engine.Authorize(keyA.hash, 'MJAPI', 'entity:read', 'Users', ctx.User, undefined, { skipLogging: true });
        AssertEqual(denied.Allowed, false, `equal-priority Deny did NOT beat Allow (SECURITY): ${denied.Reason}`);

        const allowed = await engine.Authorize(keyB.hash, 'MJAPI', 'entity:read', 'Users', ctx.User, undefined, { skipLogging: true });
        Assert(allowed.Allowed, `control (Allow-only) key was denied — fixture invalid, not a real deny-precedence proof: ${allowed.Reason}`);

        console.log('      → entity:read: Allow+Deny(equal priority) → DENIED; Allow-only control → ALLOWED (deny wins)');
    } finally {
        await runCleanup(cleanup);
    }
}

/**
 * SE2 ★ — the application ceiling caps the key. A key granting BOTH `entity:read` and `agent:execute`
 * is bound to a throwaway application whose ceiling admits ONLY `entity:read`. The `agent:execute`
 * request is denied at the APPLICATION level even though the key grants it; the `entity:read` request
 * passes both levels. Proves the ceiling is a hard cap, not merely advisory.
 */
export async function CheckSe2_AppCeilingCapsKey(ctx: IntegrationCheckContext): Promise<void> {
    const engine = GetAPIKeyEngine();
    await engine.Config(true, ctx.User);
    const readScopeId = scopeIdByPath(engine, 'entity:read');
    const execScopeId = scopeIdByPath(engine, 'agent:execute');
    if (!readScopeId || !execScopeId) {
        skipNote('SE2', "seeded scopes 'entity:read' and/or 'agent:execute' not present");
        return;
    }
    const cleanup: Cleanup[] = [];
    try {
        const { appId, appName } = await createApplication(ctx, cleanup, 'ceiling');
        // Ceiling admits entity:read only (NO rule for agent:execute → ceiling denies it).
        await addApplicationScope(ctx, cleanup, appId, readScopeId, { patternType: 'Include' });

        const key = await createKey(engine, ctx, cleanup);
        await addKeyScope(ctx, cleanup, key.apiKeyId, readScopeId, { isDeny: false, priority: 0 });
        await addKeyScope(ctx, cleanup, key.apiKeyId, execScopeId, { isDeny: false, priority: 0 });
        // Bind the key to the throwaway app so Authorize(appName) evaluates THIS ceiling.
        await bindKeyToApplication(ctx, cleanup, key.apiKeyId, appId);

        await engine.Config(true, ctx.User);

        const capped = await engine.Authorize(key.hash, appName, 'agent:execute', 'SomeAgent', ctx.User, undefined, { skipLogging: true });
        AssertEqual(capped.Allowed, false, `key GRANTED agent:execute but the app ceiling should cap it (SECURITY): ${capped.Reason}`);

        const withinCeiling = await engine.Authorize(key.hash, appName, 'entity:read', 'Users', ctx.User, undefined, { skipLogging: true });
        Assert(withinCeiling.Allowed, `entity:read is inside the ceiling and granted by the key but was denied — fixture invalid: ${withinCeiling.Reason}`);

        console.log('      → app ceiling admits entity:read only: key.agent:execute DENIED at app level, entity:read ALLOWED');
    } finally {
        await runCleanup(cleanup);
    }
}

/**
 * SE3 ★ — application binding. A key bound to application X is refused when presented against a
 * different application (`MJAPI`), even for `entity:read` which both would admit. The binding gate
 * (`API key not authorized for this application`) runs BEFORE the ceiling, so a key cannot reach
 * app Y's surface at all. The positive control (same key against X) proves the binding, not a bad
 * scope, is what refuses Y.
 */
export async function CheckSe3_AppBinding(ctx: IntegrationCheckContext): Promise<void> {
    const engine = GetAPIKeyEngine();
    await engine.Config(true, ctx.User);
    const readScopeId = scopeIdByPath(engine, 'entity:read');
    if (!readScopeId) {
        skipNote('SE3', "seeded scope 'entity:read' not present");
        return;
    }
    if (!engine.Applications.some(a => a.Name.toLowerCase() === 'mjapi')) {
        skipNote('SE3', "seeded application 'MJAPI' not present (needed as the foreign application)");
        return;
    }
    const cleanup: Cleanup[] = [];
    try {
        const { appId, appName } = await createApplication(ctx, cleanup, 'bound');
        await addApplicationScope(ctx, cleanup, appId, readScopeId, { patternType: 'Include' });

        const key = await createKey(engine, ctx, cleanup);
        await addKeyScope(ctx, cleanup, key.apiKeyId, readScopeId, { isDeny: false, priority: 0 });
        await bindKeyToApplication(ctx, cleanup, key.apiKeyId, appId); // bound to X only

        await engine.Config(true, ctx.User);

        const ownApp = await engine.Authorize(key.hash, appName, 'entity:read', 'Users', ctx.User, undefined, { skipLogging: true });
        Assert(ownApp.Allowed, `key bound to its OWN app X was denied entity:read — fixture invalid: ${ownApp.Reason}`);

        const foreignApp = await engine.Authorize(key.hash, 'MJAPI', 'entity:read', 'Users', ctx.User, undefined, { skipLogging: true });
        AssertEqual(foreignApp.Allowed, false, `key bound to app X reached foreign app MJAPI (SECURITY): ${foreignApp.Reason}`);
        Assert(
            /not authorized for this application/i.test(foreignApp.Reason),
            `foreign-app refusal should cite the binding gate, got: '${foreignApp.Reason}'`
        );

        console.log('      → key bound to app X: ALLOWED against X, refused ("not authorized for this application") against MJAPI');
    } finally {
        await runCleanup(cleanup);
    }
}

/**
 * SE4 ★ — the unscoped-key default. A key with NO rule for `entity:read` (but an application ceiling
 * that DOES admit it) resolves by the evaluator's `defaultBehaviorNoScopes`. Driving the REAL
 * `ScopeEvaluator` twice over the identical key + cache — once `'allow'`, once `'deny'` — proves the
 * branch flips the decision. Then the shared `GetAPIKeyEngine()` (which the server actually uses) is
 * asserted to deny, pinning that the production default is the SAFE one (`'deny'`), even though a bare
 * `new ScopeEvaluator()` defaults to `'allow'`.
 */
export async function CheckSe4_UnscopedKeyDefault(ctx: IntegrationCheckContext): Promise<void> {
    const engine = GetAPIKeyEngine();
    await engine.Config(true, ctx.User);
    const readScopeId = scopeIdByPath(engine, 'entity:read');
    const mjapi = engine.Applications.find(a => a.Name.toLowerCase() === 'mjapi');
    if (!readScopeId || !mjapi) {
        skipNote('SE4', "seeded scope 'entity:read' and/or application 'MJAPI' not present");
        return;
    }
    const cleanup: Cleanup[] = [];
    try {
        // A key with an app binding to NONE (works with all apps) and ZERO key-scope rules.
        const key = await createKey(engine, ctx, cleanup);
        await engine.Config(true, ctx.User);

        // Confirm the ceiling admits entity:read for MJAPI (so only the KEY-level default varies).
        const ceilingProbe = new ScopeEvaluator('allow');
        const request: AuthorizationRequest = {
            APIKeyId: key.apiKeyId,
            UserId: ctx.User.ID,
            ApplicationId: mjapi.ID,
            ScopePath: 'entity:read',
            Resource: 'Users'
        };
        const openResult = await ceilingProbe.EvaluateAccess(request, ctx.User);
        if (!openResult.Allowed) {
            skipNote('SE4', `MJAPI ceiling does not admit entity:read here (reason: '${openResult.Reason}') — cannot isolate the key-level default`);
            return;
        }

        // Same key + cache, deny default → the unscoped key is CLOSED.
        const denyEval = new ScopeEvaluator('deny');
        const closedResult = await denyEval.EvaluateAccess(request, ctx.User);
        AssertEqual(closedResult.Allowed, false, `'deny' default admitted an unscoped key (SECURITY): ${closedResult.Reason}`);

        Assert(
            openResult.Allowed !== closedResult.Allowed,
            'the allow/deny defaults agreed on an unscoped key — the default-behavior branch is dead'
        );

        // The SHARED engine the server uses defaults to 'deny' → an unscoped key is denied through it.
        const engineResult = await engine.Authorize(key.hash, 'MJAPI', 'entity:read', 'Users', ctx.User, undefined, { skipLogging: true });
        AssertEqual(engineResult.Allowed, false, `GetAPIKeyEngine() default admitted an unscoped key — production default is not the safe 'deny' (SECURITY): ${engineResult.Reason}`);

        console.log("      → unscoped key: ScopeEvaluator('allow')=ALLOWED vs ('deny')=DENIED; GetAPIKeyEngine() default=DENIED (safe)");
    } finally {
        await runCleanup(cleanup);
    }
}

/**
 * SE5 ★ — `full_access` is an ORDINARY scope at the engine boundary. A key granted `full_access` is
 * allowed for `full_access` but the engine does NOT implicitly grant an unrelated scope the key has no
 * rule for. The god-mode bypass ("if full_access is allowed, permit everything") is implemented in the
 * RESOLVER (`ResolverBase.CheckAPIKeyScopeAuthorization`), NOT the engine — so at the engine layer a
 * full_access grant confers exactly `full_access`. Pinning this keeps the bypass a single, auditable
 * resolver seam and prevents it from silently migrating into the engine.
 */
export async function CheckSe5_FullAccessIsOrdinaryAtEngine(ctx: IntegrationCheckContext): Promise<void> {
    const engine = GetAPIKeyEngine();
    await engine.Config(true, ctx.User);
    const fullAccessId = scopeIdByPath(engine, 'full_access');
    const readScopeId = scopeIdByPath(engine, 'entity:read');
    if (!fullAccessId || !readScopeId) {
        skipNote('SE5', "seeded scopes 'full_access' and/or 'entity:read' not present");
        return;
    }
    const cleanup: Cleanup[] = [];
    try {
        // Key granting full_access ONLY (no entity:read rule).
        const key = await createKey(engine, ctx, cleanup);
        await addKeyScope(ctx, cleanup, key.apiKeyId, fullAccessId, { isDeny: false, priority: 0 });
        await engine.Config(true, ctx.User);

        const fa = await engine.Authorize(key.hash, 'MJAPI', 'full_access', '*', ctx.User, undefined, { skipLogging: true });
        Assert(fa.Allowed, `a full_access grant was denied for the full_access scope — fixture invalid: ${fa.Reason}`);

        // The engine must NOT treat full_access as an implicit grant for a DIFFERENT scope with no rule.
        const other = await engine.Authorize(key.hash, 'MJAPI', 'entity:read', 'Users', ctx.User, undefined, { skipLogging: true });
        AssertEqual(
            other.Allowed,
            false,
            `the ENGINE treated full_access as a blanket bypass for entity:read — the god-mode bypass must live ONLY in ` +
            `ResolverBase.CheckAPIKeyScopeAuthorization, never the engine (SECURITY): ${other.Reason}`
        );

        console.log('      → full_access grant: ALLOWED for full_access, DENIED for unrelated entity:read (bypass is a resolver-only concern)');
    } finally {
        await runCleanup(cleanup);
    }
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// registration
// ─────────────────────────────────────────────────────────────────────────────────────────

export const ScopeEnforcementChecks: NamedCheck[] = [
    { Id: 'scope-enforcement.SE1', Name: 'SE1: an equal-priority Deny rule beats an Allow rule (deny-precedence)', Fn: CheckSe1_DenyPrecedence },
    { Id: 'scope-enforcement.SE2', Name: 'SE2: the application scope ceiling caps a key that grants a scope the ceiling omits', Fn: CheckSe2_AppCeilingCapsKey },
    { Id: 'scope-enforcement.SE3', Name: 'SE3: a key bound to app X is refused against app Y (binding runs before the ceiling)', Fn: CheckSe3_AppBinding },
    { Id: 'scope-enforcement.SE4', Name: 'SE4: an unscoped key resolves by defaultBehaviorNoScopes; the shared engine defaults to deny', Fn: CheckSe4_UnscopedKeyDefault },
    { Id: 'scope-enforcement.SE5', Name: 'SE5: full_access is an ordinary scope at the engine (the bypass is a resolver-only concern)', Fn: CheckSe5_FullAccessIsOrdinaryAtEngine }
];

for (const check of ScopeEnforcementChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/**
 * Bundle lifecycle. Setup pre-warms the engine cache once (so a check's first `scopeIdByPath` is a
 * cache hit); each check self-cleans its own fixtures, so Teardown is a no-op.
 */
IntegrationCheckRegistry.Instance.RegisterLifecycle('scope-enforcement', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await GetAPIKeyEngine().Config(true, ctx.User);
    },
    Teardown: async (_ctx: IntegrationCheckContext) => {
        // No-op: every check self-cleans its own key/scope/application/binding/usage-log fixtures.
    }
});
