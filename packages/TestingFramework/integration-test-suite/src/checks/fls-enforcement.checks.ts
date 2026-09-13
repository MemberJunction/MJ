/**
 * fls-enforcement.checks.ts — the 'fls-enforcement' bundle (server transport): Field-Level
 * Security proven against a live database, end to end. Covers test-plan Tiers 3 (enforcement
 * as a restricted user, server side) and 4 (aggregation semantics), plus the snapshot-shape
 * halves of Tier 2 that fall out of the lifecycle for free (2.1/2.2/2.3).
 *
 * WHY THIS BUNDLE EXISTS: every significant FLS bug was found by running against a real
 * database while the unit tests stayed green — the snapshot/guard collision that made field
 * security unenableable, the CodeGen FK break, the No-Access lockout, and the metadata-lag
 * defeat of its first fix. Unit fixtures use invented roles and never touch the real user
 * cache or the real reconciler; this bundle runs the REAL paths.
 *
 * Fixture strategy (the scoping doc's §4 Phase 1 decision): the lifecycle Setup flips
 * `Entity.EnableFieldLevelSecurity` on 'MJ: Employees' through the REAL server entity path
 * (`MJEntityEntityServer.Save`), so snapshot initialization — the code that has actually
 * broken — gets live coverage on every run, instead of hand-seeding permission rows around
 * it. The seeded principals (metadata-optional/integration-test):
 *
 *   it-fls-reader  → ONLY 'Integration Test: FLS Reader'  (entity read only)
 *   it-fls-writer  → ONLY 'Integration Test: FLS Writer'  (read+create+update+delete)
 *   it-fls-multi   → Writer + Denier + Neutral             (cross-role aggregation)
 *
 * FLS3 then tightens specific rows through the real MJEntityFieldPermissionEntityServer path
 * (all on non-system roles, so every save must be permitted — which is itself test-plan 4.7d):
 *
 *   Denier.Title    → Deny/No Access/No Access   Deny beats Writer's Allow (4.1) AND the
 *                                                read-required clamp kills Writer's Update (4.3)
 *   Denier.Phone    → Allow/Deny/Deny            readable but update-denied (3.9) and
 *                                                create-denied → default applied (3.11)
 *   Neutral.LastName→ No Access ×3               neutral rows leave Writer's Allow standing (4.2)
 *   Reader.Email    → Deny/No Access/No Access   the read-stripping target (3.1–3.7)
 *   Reader.BCMID    → row DELETED                missing row on an enabled entity fails closed (4.4)
 *
 * Teardown restores the flag through the entity path and deletes every permission row the
 * snapshot wrote (fixture SQL via ctx.Pool), so the shared database is left exactly as found.
 * If the entity is ALREADY FLS-enabled (a real administrator configured it), the fixture
 * refuses to mutate and the bundle skips-as-pass with a loud note.
 */
import { RunView, EntityInfo, EntityPermissionType, FieldSecurityDenialMessage, FieldSecurityWriteDenialMessage } from '@memberjunction/core';
import type { UserInfo, IMetadataProvider, RunViewParams, EntityFieldInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext, FlsFixture } from '@memberjunction/testing-integration';
import {
    discoverFlsUsers, SEEDED_FLS_ENTITY, SEED_FIXTURES_COMMAND,
    SEEDED_FLS_READER_EMAIL, SEEDED_FLS_WRITER_EMAIL, SEEDED_FLS_MULTI_EMAIL,
    FLS_READER_ROLE, FLS_WRITER_ROLE, FLS_DENIER_ROLE, FLS_NEUTRAL_ROLE,
    FLS_DENY_READ_FIELD, FLS_UPDATE_DENY_FIELD, FLS_NEUTRAL_FIELD,
    FLS_READER_DENIED_FIELD, FLS_MISSING_ROW_FIELD
} from '@memberjunction/testing-integration';
import { UserCache } from '@memberjunction/generic-database-provider';
import { MJEntityEntity, MJEntityFieldPermissionEntity, MJEmployeeEntity } from '@memberjunction/core-entities';

// ─────────────────────────────────────────────────────────────────── helpers

/** The audit entity the payload-projection checks (FLS22/FLS23) read. */
const RECORD_CHANGES_ENTITY = 'MJ: Record Changes';

/** Always-true, column-agnostic, unique-per-tag predicate (same technique as the RLS bundle). */
function coldFilter(tag: string): string {
    return `'${tag}' <> 'zzz-cache-test-marker'`;
}

/** Fixture SQL runner (server transport only — ctx.Pool is always present there). Shared with fls-lifecycle. */
export async function q<T>(ctx: IntegrationCheckContext, sqlText: string): Promise<T[]> {
    if (!ctx.Pool) {
        throw new Error('fls-enforcement requires the server transport (no SQL pool on this context)');
    }
    const result = await ctx.Pool.request().query(sqlText);
    return result.recordset as T[];
}

export function schemaOf(ctx: IntegrationCheckContext): string {
    return ctx.Schema ?? '__mj';
}

/** The FLS entity's live EntityInfo — re-resolved every time because Refresh() rebuilds metadata objects. */
export function flsEntity(ctx: IntegrationCheckContext): EntityInfo {
    const entity = ctx.Provider.EntityByName(SEEDED_FLS_ENTITY);
    Assert(entity != null, `'${SEEDED_FLS_ENTITY}' not found in provider metadata`);
    return entity!;
}

export function fieldOf(entity: EntityInfo, name: string): EntityFieldInfo {
    const field = entity.Fields.find(f => f.Name.trim().toLowerCase() === name.trim().toLowerCase());
    Assert(field != null, `field '${name}' not found on '${entity.Name}'`);
    return field!;
}

/** Restrictable fields = everything except PKs, __mj_ columns, and unrestrictable entities. */
export function restrictableFields(entity: EntityInfo): EntityFieldInfo[] {
    return entity.Fields.filter(f => !f.IsUnrestrictableField && !f.IsOnUnrestrictableEntity);
}

/** Distinct role IDs holding entity-level Read — the roles snapshot initialization must cover. */
export function rolesWithRead(entity: EntityInfo): string[] {
    return [...new Set(entity.Permissions.filter(p => p.CanRead).map(p => p.RoleID.toLowerCase()))];
}

/**
 * Skip-as-pass gate. Unusable fixture (seed absent / entity pre-configured) ⇒ warn + skip.
 * `EnableError` also leaves Usable false, but FLS1 has already FAILED loudly on it by the time
 * later checks consult this — one real failure, nineteen quiet skips, no masking.
 */
export function skipIfUnusable(fx: FlsFixture | undefined, checkId: string): fx is FlsFixture {
    if (!fx || !fx.Usable) {
        console.warn(
            `  ⚠ ${checkId} SKIPPED — FLS fixture not usable ` +
            `(${fx?.EnableError ?? fx?.Reason ?? 'fixture not provisioned'}). ` +
            `Seed with \`${SEED_FIXTURES_COMMAND}\`.`
        );
        return false;
    }
    return true;
}

/** Load the single EntityFieldPermission row for (field, role) through the entity path. */
export async function loadEfpRow(
    ctx: IntegrationCheckContext, fieldId: string, roleId: string
): Promise<MJEntityFieldPermissionEntity> {
    const rows = await q<{ ID: string }>(ctx,
        `SELECT ID FROM [${schemaOf(ctx)}].EntityFieldPermission ` +
        `WHERE EntityFieldID='${fieldId}' AND RoleID='${roleId}'`);
    Assert(rows.length === 1, `expected exactly one permission row for field ${fieldId} / role ${roleId}, got ${rows.length}`);
    const efp = await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User);
    Assert(await efp.Load(rows[0].ID), `failed to load EntityFieldPermission ${rows[0].ID}`);
    return efp;
}

/** Rewrite one (field, role) rule through the real entity path; returns [ok, message]. */
async function setRule(
    ctx: IntegrationCheckContext, fieldId: string, roleId: string,
    read: MJEntityFieldPermissionEntity['ReadAccess'],
    update: MJEntityFieldPermissionEntity['UpdateAccess'],
    create: MJEntityFieldPermissionEntity['CreateAccess']
): Promise<[boolean, string]> {
    const efp = await loadEfpRow(ctx, fieldId, roleId);
    efp.ReadAccess = read;
    efp.UpdateAccess = update;
    efp.CreateAccess = create;
    const ok = await efp.Save();
    return [ok, ok ? '' : (efp.LatestResult?.CompleteMessage ?? 'save returned false')];
}

/**
 * Run a RunView expected to be REJECTED by predicate validation. The provider gate
 * (`AssertPredicatesRespectFieldSecurity`) throws before execution; depending on the call path
 * the rejection surfaces either as a thrown error or as `{Success:false, ErrorMessage}`.
 * Returns the rejection message; throws if the call unexpectedly SUCCEEDS.
 */
async function runViewExpectRejection(params: RunViewParams, user: UserInfo): Promise<string> {
    let succeeded = false;
    let message = '';
    try {
        const res = await new RunView().RunView(params, user);
        succeeded = res.Success;
        message = res.ErrorMessage ?? '';
    } catch (e) {
        message = e instanceof Error ? e.message : String(e);
    }
    Assert(!succeeded, 'the request must be rejected before execution, not answered');
    return message;
}

// ─────────────────────────────────────────────────────────────────── lifecycle

async function resolveFixtureUsers(fx: FlsFixture): Promise<boolean> {
    const users = discoverFlsUsers(UserCache.Instance.Users);
    fx.Reader = users.Reader;
    fx.Writer = users.Writer;
    fx.Multi = users.Multi;
    if (!users.Reader || !users.Writer || !users.Multi) {
        fx.Reason = `seeded FLS users (${SEEDED_FLS_READER_EMAIL} / ${SEEDED_FLS_WRITER_EMAIL} / ${SEEDED_FLS_MULTI_EMAIL}) not in the user cache`;
        return false;
    }
    return true;
}

function resolveFixtureRoles(ctx: IntegrationCheckContext, fx: FlsFixture): boolean {
    const byName = (name: string) => ctx.Provider.Roles.find(r => r.Name === name)?.ID;
    const reader = byName(FLS_READER_ROLE), writer = byName(FLS_WRITER_ROLE);
    const denier = byName(FLS_DENIER_ROLE), neutral = byName(FLS_NEUTRAL_ROLE);
    if (!reader || !writer || !denier || !neutral) {
        fx.Reason = 'seeded FLS roles not in provider metadata';
        return false;
    }
    fx.RoleIDs = { Reader: reader, Writer: writer, Denier: denier, Neutral: neutral };
    return true;
}

/** Enable field security on the target entity through the REAL server entity path (the snapshot). */
async function enableFieldSecurity(ctx: IntegrationCheckContext, fx: FlsFixture): Promise<void> {
    const entity = flsEntity(ctx);
    const ent = await ctx.Provider.GetEntityObject<MJEntityEntity>('MJ: Entities', ctx.User);
    Assert(await ent.Load(entity.ID), `failed to load '${SEEDED_FLS_ENTITY}' entity record`);
    ent.EnableFieldLevelSecurity = true;
    try {
        if (await ent.Save()) {
            fx.Usable = true;
        } else {
            fx.EnableError = ent.LatestResult?.CompleteMessage ?? 'Save() returned false with no message';
        }
    } catch (e) {
        fx.EnableError = e instanceof Error ? e.message : String(e);
    }
}

/** Seed one fixture Employee row (+ a Company when the table is empty) via fixture SQL. */
async function seedFixtureEmployee(ctx: IntegrationCheckContext, fx: FlsFixture): Promise<void> {
    const schema = schemaOf(ctx);
    const companies = await q<{ ID: string }>(ctx, `SELECT TOP 1 ID FROM [${schema}].Company`);
    if (companies.length > 0) {
        fx.CompanyID = companies[0].ID;
    } else {
        const inserted = await q<{ ID: string }>(ctx,
            `INSERT INTO [${schema}].Company (Name, Description) OUTPUT INSERTED.ID ` +
            `VALUES ('IT FLS Fixture Co', 'FLS integration-test fixture (mj-integration-test — safe to delete)')`);
        fx.CompanyID = inserted[0].ID;
    }
    const email = `it-fls-fixture-${Date.now()}@integration.test`;
    const emp = await q<{ ID: string }>(ctx,
        `INSERT INTO [${schema}].Employee (FirstName, LastName, CompanyID, Email, Title, Phone) OUTPUT INSERTED.ID ` +
        `VALUES ('Fixture', 'Employee (mj-integration-test)', '${fx.CompanyID}', '${email}', 'FLS Fixture Title', '555-0100')`);
    fx.FixtureEmployeeID = emp[0].ID;
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('fls-enforcement', {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx: FlsFixture = { Usable: false, EntityName: SEEDED_FLS_ENTITY, CreatedEmployeeIds: [] };
        ctx.FlsFixture = fx;

        const entity = ctx.Provider.EntityByName(SEEDED_FLS_ENTITY);
        if (!entity) {
            fx.Reason = `'${SEEDED_FLS_ENTITY}' not in provider metadata`;
            return;
        }
        if (entity.EnableFieldLevelSecurity) {
            fx.Reason = `'${SEEDED_FLS_ENTITY}' already has field security enabled — refusing to mutate a configured entity`;
            return;
        }
        if (!(await resolveFixtureUsers(fx)) || !resolveFixtureRoles(ctx, fx)) {
            return;
        }
        await enableFieldSecurity(ctx, fx);
        await ctx.Provider.Refresh();
        if (fx.Usable) {
            await seedFixtureEmployee(ctx, fx);
        }
    },

    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx = ctx.FlsFixture;
        if (!fx || (!fx.Usable && !fx.EnableError)) {
            return; // nothing was mutated
        }
        const schema = schemaOf(ctx);
        // Fixture + check-created Employee rows (fixture SQL, best-effort).
        const ids = [...fx.CreatedEmployeeIds, ...(fx.FixtureEmployeeID ? [fx.FixtureEmployeeID] : [])];
        if (ids.length > 0) {
            await q(ctx, `DELETE FROM [${schema}].Employee WHERE ID IN (${ids.map(id => `'${id}'`).join(',')})`)
                .catch(() => undefined);
        }
        await q(ctx, `DELETE FROM [${schema}].Company WHERE Name LIKE 'IT FLS Fixture Co%'`).catch(() => undefined);
        // Restore the flag through the entity path (disable is always permitted — 2.5).
        try {
            const entity = ctx.Provider.EntityByName(SEEDED_FLS_ENTITY);
            if (entity?.EnableFieldLevelSecurity) {
                const ent = await ctx.Provider.GetEntityObject<MJEntityEntity>('MJ: Entities', ctx.User);
                if (await ent.Load(entity.ID)) {
                    ent.EnableFieldLevelSecurity = false;
                    await ent.Save();
                }
            }
        } catch { /* best-effort — the SQL fallback below still runs */ }
        // Remove every permission row the snapshot wrote for this entity (flag is off, rows are inert).
        await q(ctx,
            `DELETE p FROM [${schema}].EntityFieldPermission p ` +
            `JOIN [${schema}].EntityField f ON f.ID = p.EntityFieldID ` +
            `JOIN [${schema}].Entity e ON e.ID = f.EntityID WHERE e.Name = '${SEEDED_FLS_ENTITY}'`
        ).catch(() => undefined);
        await q(ctx, `UPDATE [${schema}].Entity SET EnableFieldLevelSecurity = 0 WHERE Name = '${SEEDED_FLS_ENTITY}'`)
            .catch(() => undefined);
        await ctx.Provider.Refresh().catch(() => undefined);
    }
});

// ─────────────────────────────────────────────────────────────────── checks

/**
 * FLS1 — enabling field security through the real entity path succeeds, and the snapshot has
 * the right SHAPE: one row per (restrictable field × role holding entity read), none targeting
 * primary keys or __mj_ columns (test-plan 2.1). This is the check that catches the historical
 * "field security cannot be enabled on any entity" guard collision — so a fixture whose seed
 * is present but whose enable FAILED is a FAILURE here, never a skip.
 */
export async function CheckFls1_EnableSnapshotShape(ctx: IntegrationCheckContext): Promise<void> {
    const fx = ctx.FlsFixture;
    if (!fx || (!fx.Usable && !fx.EnableError)) {
        console.warn(`  ⚠ fls-enforcement.FLS1 SKIPPED — ${fx?.Reason ?? 'fixture not provisioned'}. Seed with \`${SEED_FIXTURES_COMMAND}\`.`);
        return;
    }
    Assert(!fx.EnableError, `enabling field security on '${SEEDED_FLS_ENTITY}' through the entity path FAILED: ${fx.EnableError}`);

    const schema = schemaOf(ctx);
    const entity = flsEntity(ctx);
    Assert(entity.EnableFieldLevelSecurity, 'EnableFieldLevelSecurity should be true in refreshed metadata');

    const expected = restrictableFields(entity).length * rolesWithRead(entity).length;
    const rows = await q<{ n: number }>(ctx,
        `SELECT COUNT(*) AS n FROM [${schema}].EntityFieldPermission p ` +
        `JOIN [${schema}].EntityField f ON f.ID = p.EntityFieldID WHERE f.EntityID = '${entity.ID}'`);
    AssertEqual(rows[0].n, expected,
        `snapshot rows: expected ${expected} (${restrictableFields(entity).length} restrictable fields × ${rolesWithRead(entity).length} read-holding roles)`);

    const badTargets = await q<{ n: number }>(ctx,
        `SELECT COUNT(*) AS n FROM [${schema}].EntityFieldPermission p ` +
        `JOIN [${schema}].EntityField f ON f.ID = p.EntityFieldID ` +
        `WHERE f.EntityID = '${entity.ID}' AND (f.IsPrimaryKey = 1 OR f.Name LIKE '__mj[_]%')`);
    AssertEqual(badTargets[0].n, 0, 'no snapshot row may target a primary key or __mj_ system column');
}

/**
 * FLS2 — snapshot DEFAULTS mirror entity-level permissions (2.2), and enabling changed no
 * behavior (2.3): the Writer role (read+create+update) gets Allow/Allow/Allow on every WRITABLE
 * field, the read-only Reader role gets Allow/No Access/No Access, and the reader user's visible
 * column set is still complete — a live RunView returns Email.
 *
 * The snapshot is uniform per (role x writability), NOT per role. A READ-ONLY field — a joined
 * foreign-key display column, a computed column — cannot be written through the API by anyone, so
 * reconciliation authors `No Access` on its two write verbs rather than an `Allow` that could
 * never decide anything. Asserting a single uniform shape per role would demand exactly the inert
 * grant the snapshot deliberately withholds, so the split is asserted here instead: it is the
 * stronger statement of the two.
 */
export async function CheckFls2_SnapshotDefaultsChangeNothing(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS2')) return;
    const fx = ctx.FlsFixture!;
    const schema = schemaOf(ctx);
    const entity = flsEntity(ctx);

    // Grouped by writability as well as by verb triple. Within the snapshot set (primary keys and
    // `__mj_` columns are already excluded from it), `AllowUpdateAPI = 0` IS the read-only test —
    // the same one `EntityFieldInfo.ReadOnly` reduces to there.
    const shapes = await q<{ RoleID: string; ReadAccess: string; UpdateAccess: string; CreateAccess: string; Writable: number; n: number }>(ctx,
        `SELECT p.RoleID, p.ReadAccess, p.UpdateAccess, p.CreateAccess, ` +
        `CAST(f.AllowUpdateAPI AS int) AS Writable, COUNT(*) AS n ` +
        `FROM [${schema}].EntityFieldPermission p JOIN [${schema}].EntityField f ON f.ID = p.EntityFieldID ` +
        `WHERE f.EntityID = '${entity.ID}' ` +
        `GROUP BY p.RoleID, p.ReadAccess, p.UpdateAccess, p.CreateAccess, CAST(f.AllowUpdateAPI AS int)`);
    const forRole = (roleId: string, writable: boolean) =>
        shapes.filter(s => UUIDsEqual(s.RoleID, roleId) && (s.Writable === 1) === writable);

    const writerWritable = forRole(fx.RoleIDs!.Writer, true);
    Assert(writerWritable.length === 1 && writerWritable[0].ReadAccess === 'Allow'
        && writerWritable[0].UpdateAccess === 'Allow' && writerWritable[0].CreateAccess === 'Allow',
        `read+update+create role must snapshot WRITABLE fields to Allow/Allow/Allow (got ${JSON.stringify(writerWritable)})`);

    // Read-only fields never receive an inert write grant, whatever the role holds at entity level.
    for (const roleId of [fx.RoleIDs!.Writer, fx.RoleIDs!.Reader]) {
        const readOnlyShapes = forRole(roleId, false);
        Assert(readOnlyShapes.every(s => s.ReadAccess === 'Allow' && s.UpdateAccess === 'No Access' && s.CreateAccess === 'No Access'),
            `READ-ONLY fields must snapshot to Allow/No Access/No Access — the write verbs decide ` +
            `nothing there (role ${roleId}, got ${JSON.stringify(readOnlyShapes)})`);
    }

    const reader = forRole(fx.RoleIDs!.Reader, true);
    Assert(reader.length === 1 && reader[0].ReadAccess === 'Allow' && reader[0].UpdateAccess === 'No Access' && reader[0].CreateAccess === 'No Access',
        `read-only role must snapshot to uniform Allow/No Access/No Access (got ${JSON.stringify(reader)})`);

    // 2.3 — enabling changes nothing until an admin tightens something.
    AssertEqual(entity.GetDeniedReadFields(fx.Reader!).size, 0, 'freshly enabled: the reader must be denied nothing');
    const res = await new RunView().RunView<{ ID: string; Email?: string }>(
        { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: coldFilter(`fls2-${Date.now()}`), ResultType: 'simple' }, fx.Reader!);
    Assert(res.Success, `reader RunView failed: ${res.ErrorMessage}`);
    const fixtureRow = res.Results.find(r => UUIDsEqual(r.ID, fx.FixtureEmployeeID!));
    Assert(fixtureRow != null, 'fixture employee visible to the reader');
    Assert('Email' in fixtureRow!, 'pre-tightening: Email still present for the reader (enabling changed nothing)');
}

/**
 * FLS3 — the bundle's tightenings all go through the REAL entity path and every one must be
 * PERMITTED (they aim only at non-system roles — test-plan 4.7d's "stays freely restrictable"
 * half), and after a metadata refresh the aggregation reflects them.
 */
export async function CheckFls3_TightenNonSystemRoles(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS3')) return;
    const fx = ctx.FlsFixture!;
    const entity = flsEntity(ctx);
    const roleIds = fx.RoleIDs!;

    const edits: Array<[string, string, MJEntityFieldPermissionEntity['ReadAccess'], MJEntityFieldPermissionEntity['UpdateAccess'], MJEntityFieldPermissionEntity['CreateAccess']]> = [
        [FLS_DENY_READ_FIELD, roleIds.Denier, 'Deny', 'No Access', 'No Access'],
        [FLS_UPDATE_DENY_FIELD, roleIds.Denier, 'Allow', 'Deny', 'Deny'],
        [FLS_NEUTRAL_FIELD, roleIds.Neutral, 'No Access', 'No Access', 'No Access'],
        [FLS_READER_DENIED_FIELD, roleIds.Reader, 'Deny', 'No Access', 'No Access'],
    ];
    for (const [fieldName, roleId, r, u, c] of edits) {
        const [ok, msg] = await setRule(ctx, fieldOf(entity, fieldName).ID, roleId, r, u, c);
        Assert(ok, `tightening ${fieldName} for a NON-system role must be permitted, was refused: ${msg}`);
    }

    // 4.4's precondition: remove the reader's row for one field entirely (missing row ⇒ fail closed).
    const missing = await loadEfpRow(ctx, fieldOf(entity, FLS_MISSING_ROW_FIELD).ID, roleIds.Reader);
    Assert(await missing.Delete(), `deleting a non-system-role permission row must be permitted: ${missing.LatestResult?.CompleteMessage ?? ''}`);

    await ctx.Provider.Refresh();
    Assert(flsEntity(ctx).GetDeniedReadFields(fx.Reader!).has(FLS_READER_DENIED_FIELD.toLowerCase()),
        `after refresh, the reader must be read-denied on ${FLS_READER_DENIED_FIELD}`);
}

/** FLS4 — Deny beats Allow across roles (4.1): multi holds Writer(Allow) + Denier(Deny) on Title ⇒ denied. */
export async function CheckFls4_DenyBeatsAllow(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS4')) return;
    const fx = ctx.FlsFixture!;
    Assert(flsEntity(ctx).GetDeniedReadFields(fx.Multi!).has(FLS_DENY_READ_FIELD.toLowerCase()),
        `Deny must beat Allow: multi (Writer=Allow + Denier=Deny) must be read-denied on ${FLS_DENY_READ_FIELD}`);
}

/** FLS5 — 'No Access' is neutral (4.2): multi holds Writer(Allow) + Neutral(No Access) on LastName ⇒ allowed. */
export async function CheckFls5_NoAccessIsNeutral(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS5')) return;
    const fx = ctx.FlsFixture!;
    Assert(!flsEntity(ctx).GetDeniedReadFields(fx.Multi!).has(FLS_NEUTRAL_FIELD.toLowerCase()),
        `'No Access' must be neutral: multi (Writer=Allow + Neutral=No Access) must keep read on ${FLS_NEUTRAL_FIELD}`);
}

/**
 * FLS6 — the cross-role read-required clamp (4.3): Writer grants Title Read+Update=Allow and
 * Denier denies Read. Each row is individually legal; only the post-aggregation clamp can
 * make the combination update-denied.
 */
export async function CheckFls6_ReadRequiredClamp(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS6')) return;
    const fx = ctx.FlsFixture!;
    const field = fieldOf(flsEntity(ctx), FLS_DENY_READ_FIELD);

    const writerPerms = field.GetUserFieldPermissions(fx.Writer!, true);
    Assert(writerPerms.CanRead && writerPerms.CanUpdate, `precondition: the Writer role alone allows read+update on ${FLS_DENY_READ_FIELD}`);

    const multiPerms = field.GetUserFieldPermissions(fx.Multi!, true);
    Assert(!multiPerms.CanRead, `multi must be read-denied on ${FLS_DENY_READ_FIELD}`);
    Assert(!multiPerms.CanUpdate && !multiPerms.CanCreate,
        `read-required clamp: read-denied must clamp update AND create to denied, despite Writer's Update=Allow ` +
        `(got Update=${multiPerms.CanUpdate}, Create=${multiPerms.CanCreate})`);
}

/** FLS7 — a MISSING row on an enabled entity fails CLOSED (4.4): the reader's BCMID row was deleted ⇒ denied. */
export async function CheckFls7_MissingRowFailsClosed(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS7')) return;
    const fx = ctx.FlsFixture!;
    Assert(flsEntity(ctx).GetDeniedReadFields(fx.Reader!).has(FLS_MISSING_ROW_FIELD.toLowerCase()),
        `fail closed: with its permission row deleted, the reader must be denied ${FLS_MISSING_ROW_FIELD}`);
}

/**
 * FLS8 — the system user is NOT exempt; its access is DATA (4.5). The aggregation has no
 * identity branch: the account reads every column of the restricted entity because snapshot
 * initialization wrote Allow rows for the standard roles it holds — so with the bundle's
 * tightenings in place (which never touch system-user roles) its denied set must be empty.
 */
export async function CheckFls8_SystemUserAccessIsData(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS8')) return;
    const sysUser = UserCache.Instance.GetSystemUser();
    Assert(sysUser != null, 'the MJ system user must be resolvable from the user cache');
    const denied = flsEntity(ctx).GetDeniedReadFields(sysUser!);
    AssertEqual(denied.size, 0,
        `the system user must be denied nothing — its access comes from ordinary Allow rows, not a bypass ` +
        `(denied: ${[...denied].join(', ') || 'none'})`);
}

/** FLS9 — RunView as the reader OMITS the denied columns from every row (3.1), while keeping allowed ones. */
export async function CheckFls9_RunViewStripsDeniedColumns(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS9')) return;
    const fx = ctx.FlsFixture!;
    const res = await new RunView().RunView<Record<string, unknown>>(
        { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: coldFilter(`fls9-${Date.now()}`), ResultType: 'simple' }, fx.Reader!);
    Assert(res.Success, `reader RunView failed: ${res.ErrorMessage}`);
    Assert(res.Results.length > 0, 'the fixture employee guarantees at least one row');
    for (const row of res.Results) {
        Assert(!(FLS_READER_DENIED_FIELD in row), `denied column ${FLS_READER_DENIED_FIELD} leaked into a reader result row`);
        Assert(!(FLS_MISSING_ROW_FIELD in row), `fail-closed column ${FLS_MISSING_ROW_FIELD} leaked into a reader result row`);
    }
    const fixtureRow = res.Results.find(r => UUIDsEqual(String(r.ID), fx.FixtureEmployeeID!));
    Assert(fixtureRow != null && 'FirstName' in fixtureRow, 'allowed columns must survive the projection');
}

/** FLS10 — the same query as an UNRESTRICTED user still returns the column (3.2). */
export async function CheckFls10_UnrestrictedUserUnaffected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS10')) return;
    const fx = ctx.FlsFixture!;
    const res = await new RunView().RunView<Record<string, unknown>>(
        { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: coldFilter(`fls10-${Date.now()}`), ResultType: 'simple' }, fx.Writer!);
    Assert(res.Success, `writer RunView failed: ${res.ErrorMessage}`);
    const fixtureRow = res.Results.find(r => UUIDsEqual(String(r.ID), fx.FixtureEmployeeID!));
    Assert(fixtureRow != null, 'fixture employee visible to the writer');
    Assert(FLS_READER_DENIED_FIELD in fixtureRow!,
        `${FLS_READER_DENIED_FIELD} must still reach the unrestricted writer (only the reader is denied)`);
}

/**
 * FLS11 — the cache CANNOT leak across users (3.3), proven at the mechanism level. The
 * server's slots are full-width and SHARED (no FLS fingerprint segment); per-user narrowing
 * happens at read time on every hit and every miss. So: the writer's cold query writes a
 * slot; the reader's identical query is served WITHOUT a new slot write (shared slot — the
 * exact surface a leak would use) and STILL comes back without the denied column.
 */
export async function CheckFls11_SharedCacheSlotStillStrips(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS11')) return;
    const fx = ctx.FlsFixture!;
    const tag = `fls11-${Date.now()}`;
    const params = (): RunViewParams => ({ EntityName: SEEDED_FLS_ENTITY, ExtraFilter: coldFilter(tag), ResultType: 'simple' });

    ctx.Storage.ResetCounts();
    const warm = await new RunView().RunView<Record<string, unknown>>(params(), fx.Writer!);
    Assert(warm.Success, `writer warm-up failed: ${warm.ErrorMessage}`);
    Assert(ctx.Storage.SetCount('RunViewCache') > 0, 'the writer cold query must write a RunViewCache slot');
    const warmRow = warm.Results.find(r => UUIDsEqual(String(r.ID), fx.FixtureEmployeeID!));
    Assert(warmRow != null && FLS_READER_DENIED_FIELD in warmRow, 'the cached slot is full-width (writer sees the column)');

    ctx.Storage.ResetCounts();
    const read = await new RunView().RunView<Record<string, unknown>>(params(), fx.Reader!);
    Assert(read.Success, `reader read failed: ${read.ErrorMessage}`);
    AssertEqual(ctx.Storage.SetCount('RunViewCache'), 0,
        'the reader must be served from the SHARED slot (no new cache write) — the leak surface under test');
    for (const row of read.Results) {
        Assert(!(FLS_READER_DENIED_FIELD in row),
            `CACHE LEAK: ${FLS_READER_DENIED_FIELD} from the writer-warmed slot reached the reader`);
    }
}

/** FLS12 — ExtraFilter referencing a denied field is REJECTED with exactly the ambiguous message (3.4 + 3.12). */
export async function CheckFls12_ExtraFilterRejected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS12')) return;
    const fx = ctx.FlsFixture!;
    const message = await runViewExpectRejection(
        { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: `${FLS_READER_DENIED_FIELD} LIKE '%@%'`, ResultType: 'simple' }, fx.Reader!);
    const expected = FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY);
    Assert(message.includes(expected),
        `the rejection must use exactly the ambiguous wording and never name the reason ` +
        `(expected '${expected}', got '${message}')`);
}

/** FLS13 — OrderBy on a denied field is rejected (3.5): row ordering reconstructs values. */
export async function CheckFls13_OrderByRejected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS13')) return;
    const fx = ctx.FlsFixture!;
    const message = await runViewExpectRejection(
        { EntityName: SEEDED_FLS_ENTITY, OrderBy: `${FLS_READER_DENIED_FIELD} DESC`, ResultType: 'simple' }, fx.Reader!);
    Assert(message.includes(FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY)),
        `ambiguous denial wording expected, got '${message}'`);
}

/** FLS14 — an Aggregate expression on a denied field is rejected (3.6): MIN(x) returns exact values. */
export async function CheckFls14_AggregatesRejected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS14')) return;
    const fx = ctx.FlsFixture!;
    const message = await runViewExpectRejection(
        { EntityName: SEEDED_FLS_ENTITY, Aggregates: [{ expression: `MIN(${FLS_READER_DENIED_FIELD})`, alias: 'probe' }], ResultType: 'simple' }, fx.Reader!);
    Assert(message.includes(FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY)),
        `ambiguous denial wording expected, got '${message}'`);
}

/** FLS15 — UserSearchString is NOT rejected (3.7): denied fields are excluded from the searched set instead. */
export async function CheckFls15_UserSearchStringNotRejected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS15')) return;
    const fx = ctx.FlsFixture!;
    const res = await new RunView().RunView(
        { EntityName: SEEDED_FLS_ENTITY, UserSearchString: 'zzz-fls-search-probe', ResultType: 'simple' }, fx.Reader!);
    Assert(res.Success,
        `UserSearchString must NOT be rejected for a restricted user (the platform excludes denied fields from ` +
        `the searched set instead): ${res.ErrorMessage}`);
}

/**
 * FLS16 — a save that MODIFIES an update-denied field is rejected server-side (3.9) and the
 * stored value is untouched. Multi can read Phone (Allow) but its Denier role carries
 * Update=Deny.
 *
 * The refusal NAMES the missing permission rather than using the ambiguous "does not exist or
 * you do not have access" wording. That wording protects two facts — that the column exists, and
 * that it is restricted for this caller — and Multi already holds both: it can read Phone and see
 * its value. Telling someone a field they are looking at might not exist is misleading, not
 * discreet. The ambiguous wording stays where it earns its keep: READ denials, where a caller
 * probing a predicate must not learn which columns a deployment treats as sensitive.
 */
export async function CheckFls16_UpdateDeniedFieldRejected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS16')) return;
    const fx = ctx.FlsFixture!;
    const emp = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, fx.Multi!);
    Assert(await emp.Load(fx.FixtureEmployeeID!), 'multi must be able to load the fixture employee');
    emp.Phone = '555-9999';

    let saved = false;
    let message = '';
    try {
        saved = await emp.Save();
        message = emp.LatestResult?.CompleteMessage ?? '';
    } catch (e) {
        message = e instanceof Error ? e.message : String(e);
    }
    Assert(!saved, 'modifying an update-denied field must be rejected server-side');
    Assert(message.includes(FieldSecurityWriteDenialMessage(FLS_UPDATE_DENY_FIELD, SEEDED_FLS_ENTITY)),
        `write-denial wording naming the missing permission expected, got '${message}'`);
    // Pinned explicitly: a regression back to the ambiguous wording would still "reject", so
    // asserting only the rejection would not catch it.
    Assert(!message.includes(FieldSecurityDenialMessage(FLS_UPDATE_DENY_FIELD, SEEDED_FLS_ENTITY)),
        `a READABLE field's write refusal must not hide behind the ambiguous wording, got '${message}'`);

    const db = await q<{ Phone: string }>(ctx,
        `SELECT Phone FROM [${schemaOf(ctx)}].Employee WHERE ID = '${fx.FixtureEmployeeID}'`);
    AssertEqual(db[0].Phone, '555-0100', 'the stored Phone value must be untouched by the rejected save');
}

/**
 * FLS17 — round-trip safety (3.10): a restricted user edits an UNRELATED field and saves;
 * the fields they cannot read keep their stored values (framework-internal reads are exempt
 * from the accessor gate, which is what keeps the round trip lossless).
 */
export async function CheckFls17_RoundTripSafety(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS17')) return;
    const fx = ctx.FlsFixture!;
    const schema = schemaOf(ctx);
    const before = await q<{ Title: string; Email: string }>(ctx,
        `SELECT Title, Email FROM [${schema}].Employee WHERE ID = '${fx.FixtureEmployeeID}'`);

    const emp = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, fx.Multi!);
    Assert(await emp.Load(fx.FixtureEmployeeID!), 'multi must be able to load the fixture employee');
    emp.FirstName = 'RoundTrip';
    Assert(await emp.Save(), `editing an allowed field must save: ${emp.LatestResult?.CompleteMessage ?? ''}`);

    const after = await q<{ FirstName: string; Title: string; Email: string }>(ctx,
        `SELECT FirstName, Title, Email FROM [${schema}].Employee WHERE ID = '${fx.FixtureEmployeeID}'`);
    AssertEqual(after[0].FirstName, 'RoundTrip', 'the edited field must persist');
    AssertEqual(after[0].Title, before[0].Title, `read-denied ${FLS_DENY_READ_FIELD} must survive a restricted round trip unchanged`);
    AssertEqual(after[0].Email, before[0].Email, 'other untouched fields must survive unchanged');

    // Restore for later checks.
    emp.FirstName = 'Fixture';
    Assert(await emp.Save(), 'restoring the fixture employee must save');
}

/**
 * FLS18 — create suppression (3.11): a value supplied for a create-denied field is silently
 * DROPPED and the column takes its default; the insert itself succeeds. Rejecting would name
 * the field; defaulting gives the restricted user the same record shape as anyone who left it
 * blank.
 */
export async function CheckFls18_CreateSuppression(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS18')) return;
    const fx = ctx.FlsFixture!;
    const emp = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, fx.Multi!);
    emp.NewRecord();
    emp.FirstName = 'Created';
    emp.LastName = 'ByMulti (mj-integration-test)';
    emp.CompanyID = fx.CompanyID!;
    emp.Email = `it-fls-created-${Date.now()}@integration.test`;
    emp.Phone = '555-1234'; // create-denied via Denier (Allow/Deny/Deny) — must be dropped, not rejected

    Assert(await emp.Save(), `the create must SUCCEED (suppression, not rejection): ${emp.LatestResult?.CompleteMessage ?? ''}`);
    fx.CreatedEmployeeIds.push(emp.ID);

    const db = await q<{ Phone: string | null }>(ctx,
        `SELECT Phone FROM [${schemaOf(ctx)}].Employee WHERE ID = '${emp.ID}'`);
    Assert(db.length === 1, 'the created row must exist');
    Assert(db[0].Phone === null, `the create-denied ${FLS_UPDATE_DENY_FIELD} must take its default (NULL), got '${db[0].Phone}'`);
}

// ───────────────────────────────────────────── Record Changes payload security

/** A Record Change row as the wire returns it — only the columns these checks assert on. */
type RecordChangeRow = {
    ID: string;
    EntityID: string;
    RecordID: string;
    Type: string;
    ChangesJSON?: string;
    ChangesDescription?: string;
    FullRecordJSON?: string;
};

/**
 * Reads the audit rows for the fixture employee as a given user, through the ordinary RunView
 * path. `tag` makes the filter unique so the caller controls whether the read is a fresh query or
 * lands on a slot warmed by an earlier call in the same check.
 */
async function readFixtureRecordChanges(
    ctx: IntegrationCheckContext, user: UserInfo, employeeID: string, tag: string
): Promise<RecordChangeRow[]> {
    const employeesEntityID = flsEntity(ctx).ID;
    const res = await new RunView().RunView<RecordChangeRow>({
        EntityName: RECORD_CHANGES_ENTITY,
        ExtraFilter: `EntityID = '${employeesEntityID}' AND RecordID LIKE '%${employeeID}%' AND ${coldFilter(tag)}`,
        OrderBy: 'ChangedAt DESC',
        ResultType: 'simple',
    }, user);
    Assert(res.Success, `RunView on ${RECORD_CHANGES_ENTITY} failed for ${user.Email}: ${res.ErrorMessage}`);
    return res.Results;
}

/**
 * Skip-as-pass gate for the Record Changes checks specifically. Two preconditions the rest of the
 * bundle does not need: the audit entity must be readable by the seeded principals (a permission
 * the metadata-optional seed grants — an older seed will not have it), and the FLS entity must
 * actually be tracked, or no audit row exists to project.
 */
function recordChangeChecksUsable(ctx: IntegrationCheckContext, fx: FlsFixture, checkId: string): boolean {
    if (!flsEntity(ctx).TrackRecordChanges) {
        console.warn(`  ⚠ ${checkId} SKIPPED — '${SEEDED_FLS_ENTITY}' has TrackRecordChanges off, so no audit row exists to project.`);
        return false;
    }
    const rcEntity = ctx.Provider.EntityByName(RECORD_CHANGES_ENTITY);
    if (!rcEntity) {
        console.warn(`  ⚠ ${checkId} SKIPPED — '${RECORD_CHANGES_ENTITY}' not found in metadata.`);
        return false;
    }
    for (const user of [fx.Reader!, fx.Writer!]) {
        if (!(rcEntity.GetUserPermisions(user)?.CanRead ?? false)) {
            console.warn(
                `  ⚠ ${checkId} SKIPPED — ${user.Email} lacks entity read on '${RECORD_CHANGES_ENTITY}', which is the ` +
                `precondition the leak needs. Re-seed with \`${SEED_FIXTURES_COMMAND}\`.`
            );
            return false;
        }
    }
    return true;
}

/**
 * Writes one audit row whose payload provably carries the reader-denied column, runs `assertions`
 * against it, then restores the field. The marker value is what the assertions search for: an
 * absent `Email` key proves the key was dropped, and an absent marker proves nothing carried the
 * value under some other name.
 */
async function withAuditedDeniedFieldChange(
    ctx: IntegrationCheckContext, fx: FlsFixture, marker: string,
    assertions: () => Promise<void>
): Promise<void> {
    const emp = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, fx.Writer!);
    Assert(await emp.Load(fx.FixtureEmployeeID!), 'the writer must be able to load the fixture employee');
    const originalEmail = emp.Email;
    emp.Email = marker;
    Assert(await emp.Save(), `the writer's edit of ${FLS_READER_DENIED_FIELD} must save: ${emp.LatestResult?.CompleteMessage ?? ''}`);
    try {
        await assertions();
    } finally {
        emp.Email = originalEmail;
        await emp.Save();
    }
}

/** Every payload column of a row must be free of the denied field, by key AND by value. */
function assertPayloadIsClean(row: RecordChangeRow, marker: string, context: string): void {
    Assert(!('ChangesDescription' in row),
        `${context}: ChangesDescription must be WITHHELD entirely — it is prose and cannot be safely redacted`);
    for (const column of ['ChangesJSON', 'FullRecordJSON'] as const) {
        const raw = row[column];
        if (raw === undefined) {
            continue; // withheld outright (fail-closed) — also acceptable
        }
        Assert(!raw.includes(marker),
            `LEAK: ${context}: the denied ${FLS_READER_DENIED_FIELD} value reached the reader through ${column}`);
        if (raw.trim().length > 0) {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            Assert(!(FLS_READER_DENIED_FIELD in parsed),
                `LEAK: ${context}: ${column} still carries a '${FLS_READER_DENIED_FIELD}' key`);
        }
    }
}

/**
 * FLS22 — the audit trail is FLS-projected against the entity each row is ABOUT.
 *
 * This is the leak the guide previously documented as a trust boundary administrators had to
 * configure around: `MJ: Record Changes` has field security switched OFF (it is not the entity
 * being secured), so every other enforcement point short-circuits and the row's payload carries
 * the old and new values of a denied column in plain text. Anyone with entity read on the audit
 * trail could read a denied `Email` straight out of it.
 *
 * The reader is denied `Email` on `MJ: Employees` (FLS3), and holds entity read on Record Changes
 * (seeded). The writer is denied nothing, and is the control: the same rows must reach it whole,
 * so this proves projection rather than blanket suppression.
 */
export async function CheckFls22_RecordChangePayloadProjected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS22')) return;
    const fx = ctx.FlsFixture!;
    if (!recordChangeChecksUsable(ctx, fx, 'fls-enforcement.FLS22')) return;

    const marker = `it-fls-rc-${Date.now()}@integration.test`;
    await withAuditedDeniedFieldChange(ctx, fx, marker, async () => {
        const readerRows = await readFixtureRecordChanges(ctx, fx.Reader!, fx.FixtureEmployeeID!, `fls22-reader-${Date.now()}`);
        Assert(readerRows.length > 0, 'the reader must still SEE the audit rows — this narrows payloads, it does not hide rows');
        for (const row of readerRows) {
            assertPayloadIsClean(row, marker, `reader row ${row.ID}`);
        }
        // The projection must be surgical, not a blanket wipe: an allowed field's change survives.
        const withAllowedChange = readerRows.find(r => (r.FullRecordJSON ?? '').includes('FirstName'));
        Assert(withAllowedChange != null,
            'allowed columns must survive in FullRecordJSON — the payload is narrowed, not emptied');

        const writerRows = await readFixtureRecordChanges(ctx, fx.Writer!, fx.FixtureEmployeeID!, `fls22-writer-${Date.now()}`);
        const markerRow = writerRows.find(r => (r.ChangesJSON ?? '').includes(marker));
        Assert(markerRow != null,
            `the unrestricted writer must still receive the full payload — no ${FLS_READER_DENIED_FIELD} change found`);
        Assert(typeof markerRow!.ChangesDescription === 'string' && markerRow!.ChangesDescription.length > 0,
            'ChangesDescription must reach a caller who is denied nothing on the target entity');
    });
}

/**
 * FLS23 — the audit projection holds on the SHARED cache slot, the same mechanism-level proof
 * FLS11 gives for ordinary reads.
 *
 * The server's RunView slots are full-width and shared across users; per-request narrowing runs at
 * read time on every hit and every miss. So the writer's cold query warms a slot carrying the
 * denied value, the reader's identical query is served from that same slot WITHOUT a new cache
 * write, and the payload must still come back narrowed. This is the exact path the original
 * cross-user leak ran through.
 */
export async function CheckFls23_RecordChangeCacheSlotStillProjects(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS23')) return;
    const fx = ctx.FlsFixture!;
    if (!recordChangeChecksUsable(ctx, fx, 'fls-enforcement.FLS23')) return;

    const marker = `it-fls-rc-cache-${Date.now()}@integration.test`;
    await withAuditedDeniedFieldChange(ctx, fx, marker, async () => {
        const tag = `fls23-${Date.now()}`;

        ctx.Storage.ResetCounts();
        const warm = await readFixtureRecordChanges(ctx, fx.Writer!, fx.FixtureEmployeeID!, tag);
        Assert(warm.some(r => (r.ChangesJSON ?? '').includes(marker)),
            'the writer warm-up must see the denied value — otherwise the slot under test is not full-width');

        const wroteSlot = ctx.Storage.SetCount('RunViewCache') > 0;
        ctx.Storage.ResetCounts();
        const read = await readFixtureRecordChanges(ctx, fx.Reader!, fx.FixtureEmployeeID!, tag);
        if (wroteSlot) {
            AssertEqual(ctx.Storage.SetCount('RunViewCache'), 0,
                'the reader must be served from the SHARED slot (no new cache write) — the leak surface under test');
        }
        Assert(read.length > 0, 'the reader must still see the audit rows on the cache path');
        for (const row of read) {
            assertPayloadIsClean(row, marker, `reader cache-path row ${row.ID}`);
        }
    });
}

/** FLS19 — rows targeting unrestrictable fields (primary keys) are rejected at save time (4.6). */
export async function CheckFls19_UnrestrictableTargetRejected(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS19')) return;
    const fx = ctx.FlsFixture!;
    const entity = flsEntity(ctx);
    const pk = entity.Fields.find(f => f.IsPrimaryKey);
    Assert(pk != null, 'the FLS entity must have a primary key field');

    const efp = await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User);
    efp.NewRecord();
    efp.EntityFieldID = pk!.ID;
    efp.RoleID = fx.RoleIDs!.Reader;
    efp.ReadAccess = 'Allow';
    efp.UpdateAccess = 'No Access';
    efp.CreateAccess = 'No Access';
    let saved = false;
    try {
        saved = await efp.Save();
    } catch {
        saved = false;
    }
    Assert(!saved, 'a permission row targeting a primary key must be rejected at save time');
    if (saved) {
        await efp.Delete().catch(() => undefined); // defensive cleanup if the guard regressed
    }
}

/**
 * FLS20 — the typed-accessor gate: reading a read-denied field BY NAME throws the ambiguous
 * message (a restricted field surfaces as a clear failure, not a silent blank), while allowed
 * fields read normally.
 */
export async function CheckFls20_AccessorGateThrows(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS20')) return;
    const fx = ctx.FlsFixture!;
    const emp = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, fx.Reader!);
    Assert(await emp.Load(fx.FixtureEmployeeID!), 'the reader must be able to load the fixture employee');
    AssertEqual(emp.FirstName, 'Fixture', 'allowed fields must read normally through the typed accessor');

    let threw = '';
    try {
        void emp.Email;
    } catch (e) {
        threw = e instanceof Error ? e.message : String(e);
    }
    Assert(threw !== '', `reading read-denied ${FLS_READER_DENIED_FIELD} by name must THROW, not return a blank`);
    AssertEqual(threw, FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY),
        'the accessor gate must use exactly the ambiguous wording');
}

/**
 * FLS21 — the COST of permission-change propagation, measured. Every write to a metadata member
 * entity (an Entity Field Permission row included) schedules one debounced full metadata refresh
 * on the server — a complete MJ_Metadata reload from SQL plus the in-memory graph rebuild. This
 * check times two back-to-back hard refreshes (the exact operation the event-driven mechanism
 * runs) so the duration is recorded on every CI run and a regression shows up as a trend, not a
 * surprise. N writes inside one 500ms debounce window still cost ONE of these (the burst
 * coalescing is unit-tested in providerBase.metadataMemberRefresh.test.ts); only writes spaced
 * wider than the window pay it again. Deliberately NO wall-clock assertion beyond a generous
 * sanity ceiling — machine speed varies and this check exists for visibility, not gating.
 */
export async function CheckFls21_RefreshCostVisibility(ctx: IntegrationCheckContext): Promise<void> {
    if (!skipIfUnusable(ctx.FlsFixture, 'fls-enforcement.FLS21')) return;

    const t1 = performance.now();
    Assert(await ctx.Provider.Refresh(), 'the first hard metadata refresh must succeed');
    const first = performance.now() - t1;

    const t2 = performance.now();
    Assert(await ctx.Provider.Refresh(), 'the second hard metadata refresh must succeed');
    const second = performance.now() - t2;

    console.log(`      → full metadata refresh (the per-debounced-burst cost of a permission change): ${first.toFixed(0)}ms, then ${second.toFixed(0)}ms`);
    Assert(second < 60_000, `a full metadata refresh took ${second.toFixed(0)}ms — over the 60s sanity ceiling, something is structurally wrong`);
}

/** The 'fls-enforcement' bundle (server transport). Order is load-bearing: FLS3 applies the tightenings. */
export const FlsEnforcementChecks: NamedCheck[] = [
    { Id: 'fls-enforcement.FLS1', Name: 'FLS1: enabling field security via the real entity path succeeds; the snapshot covers (restrictable fields × read-holding roles) and never targets PKs or __mj_ columns', Fn: CheckFls1_EnableSnapshotShape },
    { Id: 'fls-enforcement.FLS2', Name: 'FLS2: snapshot defaults mirror entity permissions (Allow/Allow/Allow vs Allow/No Access/No Access) and enabling changes NOTHING until tightened', Fn: CheckFls2_SnapshotDefaultsChangeNothing },
    { Id: 'fls-enforcement.FLS3', Name: 'FLS3: non-system roles are freely restrictable — every tightening through the real entity path is permitted and takes effect after refresh', Fn: CheckFls3_TightenNonSystemRoles },
    { Id: 'fls-enforcement.FLS4', Name: 'FLS4: Deny beats Allow across roles', Fn: CheckFls4_DenyBeatsAllow },
    { Id: 'fls-enforcement.FLS5', Name: 'FLS5: No Access is neutral across roles', Fn: CheckFls5_NoAccessIsNeutral },
    { Id: 'fls-enforcement.FLS6', Name: 'FLS6: the cross-role read-required clamp — read-denied forces update/create denied despite another role\'s Update=Allow', Fn: CheckFls6_ReadRequiredClamp },
    { Id: 'fls-enforcement.FLS7', Name: 'FLS7: a missing permission row on an enabled entity fails CLOSED', Fn: CheckFls7_MissingRowFailsClosed },
    { Id: 'fls-enforcement.FLS8', Name: 'FLS8: the system user is NOT exempt — its full access aggregates from ordinary Allow rows', Fn: CheckFls8_SystemUserAccessIsData },
    { Id: 'fls-enforcement.FLS9', Name: 'FLS9: RunView as the restricted user omits denied columns from every row', Fn: CheckFls9_RunViewStripsDeniedColumns },
    { Id: 'fls-enforcement.FLS10', Name: 'FLS10: the same query as an unrestricted user still returns the column', Fn: CheckFls10_UnrestrictedUserUnaffected },
    { Id: 'fls-enforcement.FLS11', Name: 'FLS11: the shared full-width cache slot cannot cross-serve — reader is served from the writer-warmed slot WITHOUT the denied column', Fn: CheckFls11_SharedCacheSlotStillStrips },
    { Id: 'fls-enforcement.FLS12', Name: 'FLS12: ExtraFilter on a denied field is rejected with exactly the ambiguous message', Fn: CheckFls12_ExtraFilterRejected },
    { Id: 'fls-enforcement.FLS13', Name: 'FLS13: OrderBy on a denied field is rejected', Fn: CheckFls13_OrderByRejected },
    { Id: 'fls-enforcement.FLS14', Name: 'FLS14: an Aggregate expression on a denied field is rejected (value-reconstruction hole)', Fn: CheckFls14_AggregatesRejected },
    { Id: 'fls-enforcement.FLS15', Name: 'FLS15: UserSearchString is NOT rejected — denied fields are excluded from the searched set', Fn: CheckFls15_UserSearchStringNotRejected },
    { Id: 'fls-enforcement.FLS16', Name: 'FLS16: a save modifying an update-denied field is rejected server-side and the stored value is untouched', Fn: CheckFls16_UpdateDeniedFieldRejected },
    { Id: 'fls-enforcement.FLS17', Name: 'FLS17: round-trip safety — a restricted user\'s save of an unrelated field leaves denied columns\' stored values intact', Fn: CheckFls17_RoundTripSafety },
    { Id: 'fls-enforcement.FLS18', Name: 'FLS18: create suppression — a supplied create-denied value is dropped and the column takes its default; the insert succeeds', Fn: CheckFls18_CreateSuppression },
    { Id: 'fls-enforcement.FLS19', Name: 'FLS19: a permission row targeting a primary key is rejected at save time', Fn: CheckFls19_UnrestrictableTargetRejected },
    { Id: 'fls-enforcement.FLS20', Name: 'FLS20: the typed-accessor gate throws the ambiguous message on a read-denied field', Fn: CheckFls20_AccessorGateThrows },
    { Id: 'fls-enforcement.FLS22', Name: 'FLS22: the Record Changes payload is projected against the entity each row is ABOUT — denied keys dropped from ChangesJSON/FullRecordJSON, ChangesDescription withheld, and an unrestricted caller still gets everything', Fn: CheckFls22_RecordChangePayloadProjected },
    { Id: 'fls-enforcement.FLS23', Name: 'FLS23: the Record Changes projection holds on the SHARED cache slot — the reader is served from the writer-warmed slot and still gets a narrowed payload', Fn: CheckFls23_RecordChangeCacheSlotStillProjects },
    { Id: 'fls-enforcement.FLS21', Name: 'FLS21: full-metadata-refresh cost is measured and recorded (the per-debounced-burst price of a permission change)', Fn: CheckFls21_RefreshCostVisibility }
];

for (const check of FlsEnforcementChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
