/**
 * fls-lifecycle.checks.ts — the 'fls-lifecycle' bundle (server transport, MUTATION tier):
 * the Field-Level Security lifecycle and the system-user configuration guards, ported from
 * the live verification scripts that first proved them (tier2-lifecycle /
 * verify-system-user-guard / verify-role-removal-guard) so the evidence stops resting on
 * throwaway scratch files.
 *
 * Everything here mutates aggressively — direct-SQL resets, forced mid-write failures,
 * system-user role juggling — so the whole test is gated `mutation` (RUN_MUTATION_TESTS=1)
 * and every check additionally carries RequiresMutation. It shares the seeded FLS principals
 * and helper surface with fls-enforcement, but registers its own lifecycle: Setup captures
 * the system user's and the multi user's role sets so Teardown can restore them even after
 * a mid-check failure, then Teardown resets the entity to flag-off / zero rows.
 *
 * What it proves (test-plan references):
 *   LC1  2.4    the flag flip is ATOMIC — a forced mid-snapshot failure leaves flag 0, no rows
 *   LC2  2.10   reconciliation is idempotent — a non-dirty re-save writes nothing
 *   LC3  2.5/2.6 disable keeps rows and stops enforcement; re-enable does not clobber a tightening
 *   LC4  4.7a   turning every system-user role's rule to No Access: the LAST edit is refused
 *   LC5  4.7b   deleting every system-user Allow row: the LAST delete is refused
 *   LC6  4.7c   a Deny aimed at a system-user role is refused outright
 *   LC7  guards removing a system-user role: permitted while redundant, REFUSED when it carries
 *               the last Allow, permitted again for a role contributing nothing
 *   LC8  guards ordinary users' role removal is untouched by the system-user guard
 *   LC9  4.8    the startup sweep: clean DB → zero violations; a direct-SQL lockout (which no
 *               entity-layer guard ever saw) is detected; the check singleton reports the same
 */
import { DatabaseProviderBase } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext, FlsFixture } from '@memberjunction/testing-integration';
import {
    discoverFlsUsers, SEEDED_FLS_ENTITY,
    FLS_READER_ROLE, FLS_WRITER_ROLE, FLS_DENIER_ROLE, FLS_NEUTRAL_ROLE
} from '@memberjunction/testing-integration';
import {
    UserCache, SystemUserFieldAccessCheck, FindSystemUserFieldAccessViolations
} from '@memberjunction/generic-database-provider';
import { MJEntityEntity, MJEntityFieldPermissionEntity, MJUserRoleEntity } from '@memberjunction/core-entities';
import {
    q, schemaOf, flsEntity, fieldOf, restrictableFields, rolesWithRead, skipIfUnusable, loadEfpRow
} from './fls-enforcement.checks';

// Captured in Setup so Teardown can restore role membership even after a mid-check failure.
interface CapturedRoles {
    SystemUserID: string;
    SystemRoleIDs: string[];
    MultiUserID: string;
    MultiRoleIDs: string[];
}
let captured: CapturedRoles | null = null;

// ─────────────────────────────────────────────────────────────────── helpers

/** Direct-SQL reset: no permission rows, flag off, metadata refreshed. The known-clean baseline. */
async function resetFls(ctx: IntegrationCheckContext): Promise<void> {
    const schema = schemaOf(ctx);
    const entity = flsEntity(ctx);
    await q(ctx,
        `DELETE p FROM [${schema}].EntityFieldPermission p ` +
        `JOIN [${schema}].EntityField f ON f.ID = p.EntityFieldID WHERE f.EntityID = '${entity.ID}'`);
    await q(ctx, `UPDATE [${schema}].Entity SET EnableFieldLevelSecurity = 0 WHERE ID = '${entity.ID}'`);
    await ctx.Provider.Refresh();
}

/** Flip the flag through the real server entity path. Returns [ok, message]. */
async function setFlag(ctx: IntegrationCheckContext, on: boolean): Promise<[boolean, string]> {
    const entity = flsEntity(ctx);
    const ent = await ctx.Provider.GetEntityObject<MJEntityEntity>('MJ: Entities', ctx.User);
    Assert(await ent.Load(entity.ID), `failed to load '${SEEDED_FLS_ENTITY}' entity record`);
    ent.EnableFieldLevelSecurity = on;
    try {
        const ok = await ent.Save();
        return [ok, ok ? '' : (ent.LatestResult?.CompleteMessage ?? '')];
    } catch (e) {
        return [false, e instanceof Error ? e.message : String(e)];
    }
}

/** Reset then enable through the entity path; throws if the enable fails (a real product bug). */
async function enableFresh(ctx: IntegrationCheckContext): Promise<void> {
    await resetFls(ctx);
    const [ok, msg] = await setFlag(ctx, true);
    Assert(ok, `enabling field security on '${SEEDED_FLS_ENTITY}' failed: ${msg}`);
    await ctx.Provider.Refresh();
}

/** The system user, or throw (the lifecycle bundle is meaningless without one). */
function systemUser(): UserInfo {
    const sysUser = UserCache.Instance.GetSystemUser();
    Assert(sysUser != null, 'the MJ system user must be resolvable from the user cache');
    return sysUser!;
}

/** IDs of the EntityFieldPermission rows for (fieldName × the given roles) on the FLS entity. */
async function efpRowsForRoles(
    ctx: IntegrationCheckContext, fieldName: string, roleIds: string[]
): Promise<Array<{ ID: string; RoleID: string }>> {
    const fieldId = fieldOf(flsEntity(ctx), fieldName).ID;
    const list = roleIds.map(r => `'${r.toLowerCase()}'`).join(',');
    return q<{ ID: string; RoleID: string }>(ctx,
        `SELECT ID, RoleID FROM [${schemaOf(ctx)}].EntityFieldPermission ` +
        `WHERE EntityFieldID = '${fieldId}' AND LOWER(CONVERT(NVARCHAR(36), RoleID)) IN (${list}) ORDER BY RoleID`);
}

/** Refresh the user cache from the live DB (role membership changed under it). */
async function refreshUsers(ctx: IntegrationCheckContext): Promise<void> {
    if (!(ctx.Provider instanceof DatabaseProviderBase)) {
        throw new Error('fls-lifecycle requires a database provider');
    }
    await UserCache.Instance.Refresh(ctx.Provider);
}

/** Load the UserRole row joining (user, role) through the entity path. */
async function loadUserRole(ctx: IntegrationCheckContext, userId: string, roleId: string): Promise<MJUserRoleEntity> {
    const rows = await q<{ ID: string }>(ctx,
        `SELECT ID FROM [${schemaOf(ctx)}].UserRole ` +
        `WHERE UserID = '${userId}' AND LOWER(CONVERT(NVARCHAR(36), RoleID)) = '${roleId.toLowerCase()}'`);
    Assert(rows.length === 1, `expected one UserRole row for user ${userId} / role ${roleId}, got ${rows.length}`);
    const ur = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
    Assert(await ur.Load(rows[0].ID), `failed to load UserRole ${rows[0].ID}`);
    return ur;
}

/** Re-insert a UserRole row by SQL (restoring state the checks removed) and refresh caches. */
async function restoreUserRole(ctx: IntegrationCheckContext, userId: string, roleId: string): Promise<void> {
    await q(ctx,
        `IF NOT EXISTS (SELECT 1 FROM [${schemaOf(ctx)}].UserRole WHERE UserID='${userId}' AND RoleID='${roleId}') ` +
        `INSERT INTO [${schemaOf(ctx)}].UserRole (UserID, RoleID) VALUES ('${userId}', '${roleId}')`);
    await refreshUsers(ctx);
    await ctx.Provider.Refresh();
}

// ─────────────────────────────────────────────────────────────────── lifecycle

IntegrationCheckRegistry.Instance.RegisterLifecycle('fls-lifecycle', {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx: FlsFixture = { Usable: false, EntityName: SEEDED_FLS_ENTITY, CreatedEmployeeIds: [] };
        ctx.FlsFixture = fx;
        captured = null;

        const entity = ctx.Provider.EntityByName(SEEDED_FLS_ENTITY);
        if (!entity) {
            fx.Reason = `'${SEEDED_FLS_ENTITY}' not in provider metadata`;
            return;
        }
        if (entity.EnableFieldLevelSecurity) {
            fx.Reason = `'${SEEDED_FLS_ENTITY}' already has field security enabled — refusing to mutate a configured entity`;
            return;
        }
        const users = discoverFlsUsers(UserCache.Instance.Users);
        const sysUser = UserCache.Instance.GetSystemUser();
        if (!users.Reader || !users.Writer || !users.Multi || !sysUser) {
            fx.Reason = 'seeded FLS users (or the system user) not in the user cache';
            return;
        }
        fx.Reader = users.Reader;
        fx.Writer = users.Writer;
        fx.Multi = users.Multi;
        const byName = (name: string) => ctx.Provider.Roles.find(r => r.Name === name)?.ID;
        const reader = byName(FLS_READER_ROLE), writer = byName(FLS_WRITER_ROLE);
        const denier = byName(FLS_DENIER_ROLE), neutral = byName(FLS_NEUTRAL_ROLE);
        if (!reader || !writer || !denier || !neutral) {
            fx.Reason = 'seeded FLS roles not in provider metadata';
            return;
        }
        fx.RoleIDs = { Reader: reader, Writer: writer, Denier: denier, Neutral: neutral };
        captured = {
            SystemUserID: sysUser.ID,
            SystemRoleIDs: sysUser.UserRoles.map(r => r.RoleID),
            MultiUserID: users.Multi.ID,
            MultiRoleIDs: users.Multi.UserRoles.map(r => r.RoleID),
        };
        fx.Usable = true;
    },

    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        if (!ctx.FlsFixture?.Usable) {
            return; // nothing was mutated
        }
        // Restore role membership first (a failed check may have left a removal un-restored).
        if (captured) {
            for (const roleId of captured.SystemRoleIDs) {
                await restoreUserRole(ctx, captured.SystemUserID, roleId).catch(() => undefined);
            }
            for (const roleId of captured.MultiRoleIDs) {
                await restoreUserRole(ctx, captured.MultiUserID, roleId).catch(() => undefined);
            }
        }
        await resetFls(ctx).catch(() => undefined);
    }
});

// ─────────────────────────────────────────────────────────────────── checks

/**
 * LC1 — the flag flip is ATOMIC (2.4). A permission row planted by direct SQL (invisible to
 * the delta, which reads metadata) makes the snapshot collide with
 * UQ_EntityFieldPermission_Field_Role midway. The save must report failure, the flag must
 * roll back to 0, and no snapshot rows may survive — only the planted poison row.
 */
export async function CheckLc1_FlagFlipIsAtomic(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-lifecycle.LC1')) return;
    const fx = ctx.FlsFixture!;
    await resetFls(ctx);
    const entity = flsEntity(ctx);
    const fields = restrictableFields(entity);
    const midField = fields[Math.floor(fields.length / 2)];
    await q(ctx,
        `INSERT INTO [${schemaOf(ctx)}].EntityFieldPermission (EntityFieldID, RoleID, ReadAccess, UpdateAccess, CreateAccess) ` +
        `VALUES ('${midField.ID}', '${fx.RoleIDs!.Reader}', 'Allow', 'No Access', 'No Access')`);

    const [ok, msg] = await setFlag(ctx, true);
    Assert(!ok, `the enable must FAIL on the planted unique-key collision (got success; poison on ${midField.Name})`);
    Assert(msg.length > 0, 'the failed save must carry an error message');

    const flag = await q<{ f: boolean }>(ctx,
        `SELECT EnableFieldLevelSecurity AS f FROM [${schemaOf(ctx)}].Entity WHERE ID = '${entity.ID}'`);
    AssertEqual(flag[0].f, false, 'the flag must roll back to 0 with the snapshot');
    const rows = await q<{ n: number }>(ctx,
        `SELECT COUNT(*) AS n FROM [${schemaOf(ctx)}].EntityFieldPermission p ` +
        `JOIN [${schemaOf(ctx)}].EntityField f ON f.ID = p.EntityFieldID WHERE f.EntityID = '${entity.ID}'`);
    AssertEqual(rows[0].n, 1, 'only the planted poison row may remain — a partial snapshot means the transaction tore');

    await resetFls(ctx); // remove the poison
}

/** LC2 — reconciliation is idempotent (2.10): a re-save with the flag already on (not dirty) writes nothing. */
export async function CheckLc2_ReconciliationIdempotent(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-lifecycle.LC2')) return;
    await enableFresh(ctx);
    const entity = flsEntity(ctx);
    const expected = restrictableFields(entity).length * rolesWithRead(entity).length;
    const count = async () => (await q<{ n: number }>(ctx,
        `SELECT COUNT(*) AS n FROM [${schemaOf(ctx)}].EntityFieldPermission p ` +
        `JOIN [${schemaOf(ctx)}].EntityField f ON f.ID = p.EntityFieldID WHERE f.EntityID = '${entity.ID}'`))[0].n;
    AssertEqual(await count(), expected, 'the fresh snapshot must cover (restrictable fields × read-holding roles)');

    const [okAgain, msgAgain] = await setFlag(ctx, true); // not dirty → no reconcile
    Assert(okAgain, `a non-dirty re-save must succeed: ${msgAgain}`);
    AssertEqual(await count(), expected, 'a non-dirty re-save must write NOTHING (idempotency)');
}

/**
 * LC3 — disable keeps rows and stops enforcement; re-enable does not clobber (2.5/2.6).
 * Tighten one rule, disable (rows survive, the Deny stops binding), re-enable (no rows added,
 * the Deny survived and binds again).
 */
export async function CheckLc3_DisableKeepsRowsReEnableKeepsTightening(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-lifecycle.LC3')) return;
    const fx = ctx.FlsFixture!;
    await enableFresh(ctx);
    const entity = flsEntity(ctx);
    const expected = restrictableFields(entity).length * rolesWithRead(entity).length;
    const emailField = fieldOf(entity, 'Email');

    const tighten = await loadEfpRow(ctx, emailField.ID, fx.RoleIDs!.Reader);
    tighten.ReadAccess = 'Deny';
    tighten.UpdateAccess = 'No Access';
    tighten.CreateAccess = 'No Access';
    Assert(await tighten.Save(), `tightening Email/Reader must save: ${tighten.LatestResult?.CompleteMessage ?? ''}`);
    await ctx.Provider.Refresh();
    Assert(flsEntity(ctx).GetDeniedReadFields(fx.Reader!).has('email'), 'the tightening must bind while enabled');

    const [okOff, msgOff] = await setFlag(ctx, false);
    Assert(okOff, `disable must save: ${msgOff}`);
    await ctx.Provider.Refresh();
    const rowsOff = await q<{ n: number }>(ctx,
        `SELECT COUNT(*) AS n FROM [${schemaOf(ctx)}].EntityFieldPermission p ` +
        `JOIN [${schemaOf(ctx)}].EntityField f ON f.ID = p.EntityFieldID WHERE f.EntityID = '${entity.ID}'`);
    AssertEqual(rowsOff[0].n, expected, 'disable must KEEP every row (2.5)');
    AssertEqual(flsEntity(ctx).GetDeniedReadFields(fx.Reader!).size, 0, 'with the flag off, enforcement must stop');

    const [okOn, msgOn] = await setFlag(ctx, true);
    Assert(okOn, `re-enable must save: ${msgOn}`);
    await ctx.Provider.Refresh();
    const rowsOn = await q<{ n: number }>(ctx,
        `SELECT COUNT(*) AS n FROM [${schemaOf(ctx)}].EntityFieldPermission p ` +
        `JOIN [${schemaOf(ctx)}].EntityField f ON f.ID = p.EntityFieldID WHERE f.EntityID = '${entity.ID}'`);
    AssertEqual(rowsOn[0].n, expected, 're-enable must add NOTHING (2.6 — no clobber)');
    Assert(flsEntity(ctx).GetDeniedReadFields(fx.Reader!).has('email'), 'the tightening must SURVIVE the disable/re-enable cycle');
}

/**
 * LC4 — the No-Access lockout vector (4.7a). Setting every system-user role's rule on a field
 * to No Access one at a time writes no Deny anywhere, yet would end in a lockout — the guard
 * must refuse at least the LAST edit (judged by the projected aggregate, from the DATABASE,
 * because metadata lags the writes), and the system user must still read the field.
 */
export async function CheckLc4_NoAccessLockoutRefused(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-lifecycle.LC4')) return;
    await enableFresh(ctx);
    const sysUser = systemUser();
    const rows = await efpRowsForRoles(ctx, 'Email', sysUser.UserRoles.map(r => r.RoleID));
    Assert(rows.length > 0, 'the snapshot must have written rows for the system-user roles');

    const outcomes: boolean[] = [];
    for (const row of rows) {
        const efp = await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User);
        Assert(await efp.Load(row.ID), `failed to load permission row ${row.ID}`);
        efp.ReadAccess = 'No Access';
        efp.UpdateAccess = 'No Access';
        efp.CreateAccess = 'No Access';
        outcomes.push(await efp.Save());
    }
    Assert(outcomes.some(ok => !ok),
        `at least one No-Access edit must be refused (${outcomes.filter(ok => !ok).length} of ${outcomes.length} were) — ` +
        `all permitted means the lockout hole is back`);
    await ctx.Provider.Refresh();
    Assert(!flsEntity(ctx).GetDeniedReadFields(sysUser).has('email'), 'the system user must still read Email');
}

/** LC5 — the delete lockout vector (4.7b): deleting the system user's Allow rows one at a time, the LAST is refused. */
export async function CheckLc5_DeleteLockoutRefused(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-lifecycle.LC5')) return;
    await enableFresh(ctx);
    const sysUser = systemUser();
    const rows = await efpRowsForRoles(ctx, 'Phone', sysUser.UserRoles.map(r => r.RoleID));
    Assert(rows.length > 0, 'the snapshot must have written rows for the system-user roles');

    const outcomes: boolean[] = [];
    for (const row of rows) {
        const efp = await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User);
        Assert(await efp.Load(row.ID), `failed to load permission row ${row.ID}`);
        outcomes.push(await efp.Delete());
    }
    Assert(outcomes.some(ok => !ok),
        `at least one delete must be refused (${outcomes.filter(ok => !ok).length} of ${outcomes.length} were)`);
    await ctx.Provider.Refresh();
    Assert(!flsEntity(ctx).GetDeniedReadFields(sysUser).has('phone'), 'the system user must still read Phone');
}

/** LC6 — a Deny aimed at a system-user role is refused outright (4.7c). */
export async function CheckLc6_DenyOnSystemRoleRefused(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-lifecycle.LC6')) return;
    await enableFresh(ctx);
    const sysUser = systemUser();
    const rows = await efpRowsForRoles(ctx, 'Title', sysUser.UserRoles.map(r => r.RoleID));
    Assert(rows.length > 0, 'the snapshot must have written rows for the system-user roles');

    const efp = await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User);
    Assert(await efp.Load(rows[0].ID), `failed to load permission row ${rows[0].ID}`);
    efp.ReadAccess = 'Deny';
    efp.UpdateAccess = 'No Access';
    efp.CreateAccess = 'No Access';
    const ok = await efp.Save();
    Assert(!ok, `a Deny on a system-user role must be refused outright ` +
        `(${efp.LatestResult?.CompleteMessage?.slice(0, 100) ?? 'SAVED — the guard did not fire'})`);
}

/**
 * LC7 — the role-REMOVAL half of the guard. Removing a system-user role is permitted while
 * the other roles still duplicate its Allows; refused when it carries the LAST Allow; and a
 * role contributing no Allow can still be removed.
 */
export async function CheckLc7_SystemRoleRemovalGuard(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-lifecycle.LC7')) return;
    await enableFresh(ctx);
    const sysUser = systemUser();
    const roles = sysUser.UserRoles.map(r => r.RoleID);
    Assert(roles.length >= 2, `the system user must hold at least two roles for this check (holds ${roles.length})`);
    const [keeper, spare] = roles;

    // 1) every role still duplicates the others' Allows → removal permitted.
    const first = await loadUserRole(ctx, sysUser.ID, keeper);
    Assert(await first.Delete(), `removing a redundant system-user role must be permitted: ${first.LatestResult?.CompleteMessage ?? ''}`);
    await restoreUserRole(ctx, sysUser.ID, keeper);

    // 2) narrow every OTHER role to No Access by direct SQL, so `keeper` carries the only Allows.
    const entity = flsEntity(ctx);
    const others = roles.filter(r => r !== keeper).map(r => `'${r.toLowerCase()}'`).join(',');
    await q(ctx,
        `UPDATE p SET p.ReadAccess='No Access', p.UpdateAccess='No Access', p.CreateAccess='No Access' ` +
        `FROM [${schemaOf(ctx)}].EntityFieldPermission p JOIN [${schemaOf(ctx)}].EntityField f ON f.ID = p.EntityFieldID ` +
        `WHERE f.EntityID = '${entity.ID}' AND LOWER(CONVERT(NVARCHAR(36), p.RoleID)) IN (${others})`);
    await ctx.Provider.Refresh();
    const lastCarrier = await loadUserRole(ctx, sysUser.ID, keeper);
    const okLast = await lastCarrier.Delete();
    Assert(!okLast, `removing the role carrying the system user's LAST Allow must be refused ` +
        `(${lastCarrier.LatestResult?.CompleteMessage?.slice(0, 100) ?? 'DELETED — the guard did not fire'})`);

    // 3) a role contributing no Allow can still be removed.
    const redundant = await loadUserRole(ctx, sysUser.ID, spare);
    Assert(await redundant.Delete(), `removing a no-Allow system-user role must still be permitted: ${redundant.LatestResult?.CompleteMessage ?? ''}`);
    await restoreUserRole(ctx, sysUser.ID, spare);
}

/** LC8 — ordinary users are untouched by the role-removal guard. */
export async function CheckLc8_OrdinaryUserRoleRemovalUnaffected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-lifecycle.LC8')) return;
    const fx = ctx.FlsFixture!;
    await enableFresh(ctx);
    const roleId = fx.RoleIDs!.Neutral; // one of multi's three roles
    const ur = await loadUserRole(ctx, fx.Multi!.ID, roleId);
    Assert(await ur.Delete(), `removing a role from an ordinary user must be permitted: ${ur.LatestResult?.CompleteMessage ?? ''}`);
    await restoreUserRole(ctx, fx.Multi!.ID, roleId);
}

/**
 * LC9 — the startup sweep (4.8): zero violations on a clean database; a lockout written by
 * DIRECT SQL — which no entity-layer guard ever saw — is detected; and the check singleton
 * reports the same count.
 */
export async function CheckLc9_StartupSweepCatchesDirectSql(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-lifecycle.LC9')) return;
    await enableFresh(ctx);
    const provider: IMetadataProvider = ctx.Provider;
    const clean = FindSystemUserFieldAccessViolations(provider);
    AssertEqual(clean.length, 0, `a clean database must report zero violations (got ${clean.map(v => `${v.FieldName}/${v.Verb}`).join(', ')})`);

    const sysUser = systemUser();
    const entity = flsEntity(ctx);
    const sysList = sysUser.UserRoles.map(r => `'${r.RoleID.toLowerCase()}'`).join(',');
    await q(ctx,
        `UPDATE p SET p.ReadAccess='No Access', p.UpdateAccess='No Access', p.CreateAccess='No Access' ` +
        `FROM [${schemaOf(ctx)}].EntityFieldPermission p JOIN [${schemaOf(ctx)}].EntityField f ON f.ID = p.EntityFieldID ` +
        `WHERE f.EntityID = '${entity.ID}' AND f.Name = 'LastName' AND LOWER(CONVERT(NVARCHAR(36), p.RoleID)) IN (${sysList})`);
    await ctx.Provider.Refresh();

    const dirty = FindSystemUserFieldAccessViolations(provider);
    Assert(dirty.length > 0, 'a direct-SQL lockout (no entity-layer guard ever saw it) must be detected by the sweep');
    const reported = SystemUserFieldAccessCheck.Instance.Run(provider);
    AssertEqual(reported, dirty.length, 'the startup check singleton must report the same violation count');

    await resetFls(ctx); // leave the entity clean for teardown symmetry
}

/** The 'fls-lifecycle' bundle (server transport, mutation tier). Order is load-bearing. */
export const FlsLifecycleChecks: NamedCheck[] = [
    { Id: 'fls-lifecycle.LC1', Name: 'LC1: the flag flip is atomic — a forced mid-snapshot failure leaves flag 0 and no snapshot rows', Fn: CheckLc1_FlagFlipIsAtomic, RequiresMutation: true },
    { Id: 'fls-lifecycle.LC2', Name: 'LC2: reconciliation is idempotent — a non-dirty re-save writes nothing', Fn: CheckLc2_ReconciliationIdempotent, RequiresMutation: true },
    { Id: 'fls-lifecycle.LC3', Name: 'LC3: disable keeps rows and stops enforcement; re-enable adds nothing and the tightening survives', Fn: CheckLc3_DisableKeepsRowsReEnableKeepsTightening, RequiresMutation: true },
    { Id: 'fls-lifecycle.LC4', Name: 'LC4: turning every system-user role to No Access — the last edit is refused (the lockout hole stays closed)', Fn: CheckLc4_NoAccessLockoutRefused, RequiresMutation: true },
    { Id: 'fls-lifecycle.LC5', Name: 'LC5: deleting every system-user Allow row — the last delete is refused', Fn: CheckLc5_DeleteLockoutRefused, RequiresMutation: true },
    { Id: 'fls-lifecycle.LC6', Name: 'LC6: a Deny aimed at a system-user role is refused outright', Fn: CheckLc6_DenyOnSystemRoleRefused, RequiresMutation: true },
    { Id: 'fls-lifecycle.LC7', Name: 'LC7: removing a system-user role — permitted while redundant, refused when it carries the last Allow', Fn: CheckLc7_SystemRoleRemovalGuard, RequiresMutation: true },
    { Id: 'fls-lifecycle.LC8', Name: 'LC8: ordinary users\' role removal is untouched by the system-user guard', Fn: CheckLc8_OrdinaryUserRoleRemovalUnaffected, RequiresMutation: true },
    { Id: 'fls-lifecycle.LC9', Name: 'LC9: the startup sweep reports zero on clean state and catches a direct-SQL lockout', Fn: CheckLc9_StartupSweepCatchesDirectSql, RequiresMutation: true }
];

for (const check of FlsLifecycleChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
