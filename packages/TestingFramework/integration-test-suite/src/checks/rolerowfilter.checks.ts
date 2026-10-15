/**
 * rolerowfilter.checks.ts — ROLE row-level-security filter EDIT checks (RF1–RF3), registered
 * into the 'rls-isolation' bundle after KF1–KF6.
 *
 * The mechanism under test is the save-time validation in MJRowLevelSecurityFilterEntityServer:
 * when a filter's FilterText changes, the new text is validated against every row that
 * references the filter. API-key row filters need the strict rules (plain columns of ONE entity,
 * no subqueries) because the key layer reasons about the filter per entity. Role filters do not,
 * and the canonical multi-tenant role filter is a membership SUBQUERY shared across every
 * tenant-scoped entity — so for a filter referenced ONLY by role permission rows, the new text
 * is instead compiled against each referencing entity's base view.
 *
 *   RF1 ★ A subquery role filter shared by two entities is EDITABLE through the entity layer, and
 *         it restricts reads for users whose ONLY role carries it — before and after the edit,
 *         on both entities, with the edited text in force afterwards.
 *   RF2 ★ A role filter edit that is genuinely broken is still REFUSED, for the right reason:
 *         a bad column inside the subquery is refused by the compile probe (the database's own
 *         "invalid column" error, naming the entity), and a system-catalog reference is refused
 *         by the shared SQL screen. The stored text is unchanged after both.
 *   RF3 ★ A filter that an API-key scope rule references keeps the STRICT rules even when a role
 *         permission row references it too: a bad column is refused by the plain-column check,
 *         and a subquery is refused by the subquery ban.
 *
 * FIXTURES: every check builds its own throwaway role, two users holding ONLY that role, a
 * subquery filter stamped as ReadRLSFilterID on two entities, and one data row per user per
 * entity; everything is removed in the check's own `finally`. Mutation-gated
 * (RUN_MUTATION_TESTS=1) because it writes security metadata and refreshes the provider.
 */
import { BaseEntity, DatabaseProviderBase, EntityPermissionType, RunView, UserInfo } from '@memberjunction/core';
import type { EntityInfo } from '@memberjunction/core';
import {
    MJAPIKeyEntity, MJAPIKeyScopeEntity, MJEntityPermissionEntity, MJQueryCategoryEntity, MJRoleEntity,
    MJRowLevelSecurityFilterEntity, MJUserEntity, MJUserRoleEntity, MJUserSettingEntity
} from '@memberjunction/core-entities';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

/** The two entities the shared filter is stamped on. Both carry a UserID column. */
const ENTITY_ONE = 'MJ: Query Categories';
const ENTITY_TWO = 'MJ: User Settings';
const SHARED_ENTITIES = [ENTITY_ONE, ENTITY_TWO];

/** Fixture SQL runner (server transport only — ctx.Pool is always present there). */
async function Q<T>(ctx: IntegrationCheckContext, sqlText: string): Promise<T[]> {
    if (!ctx.Pool) {
        throw new Error('rolerowfilter checks require the server transport (no SQL pool on this context)');
    }
    const result = await ctx.Pool.request().query(sqlText);
    return result.recordset as T[];
}

/** The core MJ schema name. */
function SchemaOf(ctx: IntegrationCheckContext): string {
    return ctx.Schema ?? '__mj';
}

/** A column that exists on no entity, for the negative legs. */
const BAD_COLUMN = 'NoSuchColumn5712';

/** One fixture data row: which entity it lives in and which user owns it. */
interface FixtureRow {
    EntityName: string;
    ID: string;
    OwnerID: string;
}

/** Everything a check created, so its `finally` can remove it. */
interface RoleFilterFixture {
    Tag: string;
    RoleID: string;
    FilterID: string;
    UserIDs: string[];
    PermissionIDs: string[];
    Rows: FixtureRow[];
    UserA: UserInfo | null;
    UserB: UserInfo | null;
}

/** Membership-style subquery filter: the shape a multi-tenant role filter takes. */
function membershipFilterV1(schema: string): string {
    return `UserID IN (SELECT ur.UserID FROM ${schema}.vwUserRoles ur WHERE ur.UserID = '{{UserID}}')`;
}

/** A different but equivalent membership subquery: the edit RF1 makes. */
function membershipFilterV2(schema: string): string {
    return `UserID IN (SELECT u.ID FROM ${schema}.vwUsers u WHERE u.ID = '{{UserID}}' AND u.IsActive = 1)`;
}

/** Save, capturing the refusal message whether Save returns false or throws. */
async function attemptSave(entity: BaseEntity): Promise<{ Saved: boolean; Message: string }> {
    try {
        const saved = await entity.Save();
        return { Saved: saved, Message: saved ? '' : (entity.LatestResult?.CompleteMessage ?? '') };
    } catch (e) {
        return { Saved: false, Message: e instanceof Error ? e.message : String(e) };
    }
}

/** Save or fail the check with the refusal message. */
async function mustSave(entity: BaseEntity, what: string): Promise<void> {
    const result = await attemptSave(entity);
    Assert(result.Saved, `${what} failed: ${result.Message}`);
}

/** Creates the fixture role. */
async function createRole(ctx: IntegrationCheckContext, tag: string): Promise<string> {
    const role = await ctx.Provider.GetEntityObject<MJRoleEntity>('MJ: Roles', ctx.User);
    role.NewRecord();
    role.Name = tag;
    role.Description = 'Integration-test role for rolerowfilter.checks.ts (safe to delete).';
    await mustSave(role, 'creating the fixture role');
    return role.ID;
}

/** Creates a row-level-security filter with the given text. */
async function createFilter(ctx: IntegrationCheckContext, name: string, filterText: string): Promise<string> {
    const filter = await ctx.Provider.GetEntityObject<MJRowLevelSecurityFilterEntity>('MJ: Row Level Security Filters', ctx.User);
    filter.NewRecord();
    filter.Name = name;
    filter.Description = 'Integration-test filter for rolerowfilter.checks.ts (safe to delete).';
    filter.FilterText = filterText;
    await mustSave(filter, `creating filter '${name}'`);
    return filter.ID;
}

/** Grants the role read on an entity, scoped by the filter. */
async function createReadPermission(ctx: IntegrationCheckContext, entityName: string, roleId: string, filterId: string): Promise<string> {
    const entity = ctx.Provider.EntityByName(entityName);
    Assert(entity != null, `entity '${entityName}' not found in provider metadata`);
    const permission = await ctx.Provider.GetEntityObject<MJEntityPermissionEntity>('MJ: Entity Permissions', ctx.User);
    permission.NewRecord();
    permission.EntityID = entity!.ID;
    permission.RoleID = roleId;
    permission.CanRead = true;
    permission.CanCreate = false;
    permission.CanUpdate = false;
    permission.CanDelete = false;
    permission.ReadRLSFilterID = filterId;
    await mustSave(permission, `stamping the filter on '${entityName}'`);
    return permission.ID;
}

/** Creates a user whose ONLY role is the fixture role. */
async function createScopedUser(ctx: IntegrationCheckContext, tag: string, suffix: string, roleId: string): Promise<string> {
    const user = await ctx.Provider.GetEntityObject<MJUserEntity>('MJ: Users', ctx.User);
    user.NewRecord();
    user.Name = `${tag}-${suffix}`;
    user.FirstName = 'Integration Test';
    user.LastName = `Role Filter ${suffix.toUpperCase()}`;
    user.Email = `${tag}-${suffix}@integration.test`;
    user.Type = 'User';
    user.IsActive = true;
    user.LinkedRecordType = 'None';
    await mustSave(user, `creating fixture user ${suffix}`);

    const userRole = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
    userRole.NewRecord();
    userRole.UserID = user.ID;
    userRole.RoleID = roleId;
    await mustSave(userRole, `assigning the fixture role to user ${suffix}`);
    return user.ID;
}

/** One data row per shared entity, owned by the given user (`label` keeps names within column limits). */
async function createOwnedRows(ctx: IntegrationCheckContext, tag: string, label: string, ownerId: string): Promise<FixtureRow[]> {
    const category = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>(ENTITY_ONE, ctx.User);
    category.NewRecord();
    category.Name = `${tag}-${label}`;
    category.UserID = ownerId;
    await mustSave(category, `creating a '${ENTITY_ONE}' row`);

    const setting = await ctx.Provider.GetEntityObject<MJUserSettingEntity>(ENTITY_TWO, ctx.User);
    setting.NewRecord();
    setting.UserID = ownerId;
    setting.Setting = tag;
    setting.Value = ownerId;
    await mustSave(setting, `creating a '${ENTITY_TWO}' row`);

    return [
        { EntityName: ENTITY_ONE, ID: category.ID, OwnerID: ownerId },
        { EntityName: ENTITY_TWO, ID: setting.ID, OwnerID: ownerId }
    ];
}

/** Reloads metadata (permissions, filter text) and the user cache (new users and roles). */
async function refreshSecurity(ctx: IntegrationCheckContext): Promise<void> {
    await ctx.Provider.Refresh();
    Assert(ctx.Provider instanceof DatabaseProviderBase, 'rolerowfilter checks require a database provider');
    await UserCache.Instance.Refresh(ctx.Provider as DatabaseProviderBase);
}

/** A fixture user from the refreshed user cache. */
function cachedUser(userId: string): UserInfo {
    const user = (UserCache.Instance.Users ?? []).find(u => UUIDsEqual(u.ID, userId));
    Assert(user != null, `fixture user ${userId} not in the refreshed user cache`);
    return user!;
}

/** Builds the full fixture: role, shared subquery filter on two entities, two scoped users, their rows. */
async function buildFixture(ctx: IntegrationCheckContext, fx: RoleFilterFixture): Promise<void> {
    fx.RoleID = await createRole(ctx, fx.Tag);
    fx.FilterID = await createFilter(ctx, fx.Tag, membershipFilterV1(SchemaOf(ctx)));
    for (const entityName of SHARED_ENTITIES) {
        fx.PermissionIDs.push(await createReadPermission(ctx, entityName, fx.RoleID, fx.FilterID));
    }
    for (const suffix of ['a', 'b']) {
        const userId = await createScopedUser(ctx, fx.Tag, suffix, fx.RoleID);
        fx.UserIDs.push(userId);
        fx.Rows.push(...await createOwnedRows(ctx, fx.Tag, suffix, userId));
    }
    await refreshSecurity(ctx);
    fx.UserA = cachedUser(fx.UserIDs[0]);
    fx.UserB = cachedUser(fx.UserIDs[1]);
}

/** Best-effort removal of one table's fixture rows; never throws, so teardown always finishes. */
async function deleteWhere(ctx: IntegrationCheckContext, table: string, where: string): Promise<void> {
    try {
        await Q(ctx, `DELETE FROM [${SchemaOf(ctx)}].[${table}] WHERE ${where}`);
    } catch (e) {
        console.warn(`      ⚠ rolerowfilter teardown: deleting from ${table} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** Quoted, comma-separated id list for an IN (...) clause. */
function idList(ids: string[]): string {
    return ids.length > 0 ? ids.map(id => `'${id}'`).join(',') : `'00000000-0000-0000-0000-000000000000'`;
}

/** Removes everything the fixture created, in foreign-key order, then refreshes caches. */
async function teardownFixture(ctx: IntegrationCheckContext, fx: RoleFilterFixture): Promise<void> {
    const users = idList(fx.UserIDs);
    await deleteWhere(ctx, 'UserSetting', `UserID IN (${users})`);
    await deleteWhere(ctx, 'QueryCategory', `UserID IN (${users})`);
    await deleteWhere(ctx, 'EntityPermission', `RoleID IN (${idList(fx.RoleID ? [fx.RoleID] : [])})`);
    await deleteWhere(ctx, 'RowLevelSecurityFilter', `Name LIKE '${fx.Tag}%'`);
    await deleteWhere(ctx, 'UserRole', `UserID IN (${users})`);
    await deleteWhere(ctx, 'UserApplicationEntity', `UserApplicationID IN (SELECT ID FROM [${SchemaOf(ctx)}].[UserApplication] WHERE UserID IN (${users}))`);
    await deleteWhere(ctx, 'UserApplication', `UserID IN (${users})`);
    await deleteWhere(ctx, 'User', `ID IN (${users})`);
    await deleteWhere(ctx, 'Role', `ID IN (${idList(fx.RoleID ? [fx.RoleID] : [])})`);
    await refreshSecurity(ctx).catch(() => undefined);
}

/** Runs a check body against a fresh fixture, always tearing it down. */
async function withFixture(ctx: IntegrationCheckContext, checkId: string, body: (fx: RoleFilterFixture) => Promise<void>): Promise<void> {
    const fx: RoleFilterFixture = {
        Tag: `zzz-it-${checkId.toLowerCase()}-${Date.now()}`,
        RoleID: '', FilterID: '', UserIDs: [], PermissionIDs: [], Rows: [], UserA: null, UserB: null
    };
    try {
        await buildFixture(ctx, fx);
        await body(fx);
    } finally {
        await teardownFixture(ctx, fx);
    }
}

/** Live EntityInfo, re-resolved because Refresh() rebuilds metadata objects. */
function entityOf(ctx: IntegrationCheckContext, entityName: string): EntityInfo {
    const entity = ctx.Provider.EntityByName(entityName);
    Assert(entity != null, `entity '${entityName}' not found in provider metadata`);
    return entity!;
}

/**
 * Proves a fixture user is genuinely RLS-scoped: their only role is the fixture role, and on
 * every shared entity their effective read clause is non-empty (not exempt).
 */
function assertGenuinelyScoped(ctx: IntegrationCheckContext, fx: RoleFilterFixture, user: UserInfo): void {
    const roles = user.UserRoles ?? [];
    AssertEqual(roles.length, 1, `fixture user ${user.Email} must hold exactly one role, holds ${roles.length}`);
    Assert(UUIDsEqual(roles[0].RoleID, fx.RoleID), `fixture user ${user.Email} must hold ONLY the fixture role`);
    for (const entityName of SHARED_ENTITIES) {
        const clause = entityOf(ctx, entityName).GetEffectiveRowFilterWhereClause(user, EntityPermissionType.Read, '');
        Assert(clause.trim() !== '', `fixture user ${user.Email} is RLS-exempt on '${entityName}' — the read proof would mean nothing`);
    }
}

/** Reads the fixture rows of one entity as the given user, bypassing every cache. */
async function readFixtureRows(ctx: IntegrationCheckContext, fx: RoleFilterFixture, entityName: string, user: UserInfo): Promise<{ ID: string; UserID: string }[]> {
    const ids = fx.Rows.filter(r => r.EntityName === entityName).map(r => r.ID);
    const result = await new RunView().RunView<{ ID: string; UserID: string }>({
        EntityName: entityName,
        ExtraFilter: `ID IN (${idList(ids)})`,
        Fields: ['ID', 'UserID'],
        ResultType: 'simple',
        BypassCache: true
    }, user);
    Assert(result.Success, `reading '${entityName}' as ${user.Email} failed: ${result.ErrorMessage}`);
    return result.Results;
}

/**
 * Each scoped user sees exactly their own row on both entities, while the run's (exempt) user
 * sees both rows, so the restriction comes from the filter and not from missing data.
 */
async function assertScopedReads(ctx: IntegrationCheckContext, fx: RoleFilterFixture, phase: string): Promise<void> {
    for (const entityName of SHARED_ENTITIES) {
        const control = await readFixtureRows(ctx, fx, entityName, ctx.User);
        AssertEqual(control.length, 2, `${phase}: the unrestricted control read of '${entityName}' must see both fixture rows`);
        for (const user of [fx.UserA!, fx.UserB!]) {
            const rows = await readFixtureRows(ctx, fx, entityName, user);
            AssertEqual(rows.length, 1, `${phase}: ${user.Email} must see exactly its own '${entityName}' row, saw ${rows.length}`);
            Assert(UUIDsEqual(rows[0].UserID, user.ID), `${phase}: RLS LEAK on '${entityName}' — ${user.Email} saw a row owned by ${rows[0].UserID}`);
        }
    }
}

/** Loads the fixture filter fresh through the entity layer. */
async function loadFilter(ctx: IntegrationCheckContext, filterId: string): Promise<MJRowLevelSecurityFilterEntity> {
    const filter = await ctx.Provider.GetEntityObject<MJRowLevelSecurityFilterEntity>('MJ: Row Level Security Filters', ctx.User);
    Assert(await filter.Load(filterId), `loading filter ${filterId} failed`);
    return filter;
}

/** Attempts a FilterText edit and returns the outcome; the stored text is re-read afterwards. */
async function attemptEdit(ctx: IntegrationCheckContext, filterId: string, newText: string): Promise<{ Saved: boolean; Message: string; StoredText: string }> {
    const filter = await loadFilter(ctx, filterId);
    filter.FilterText = newText;
    filter.Description = `Edited at ${new Date().toISOString()}`;
    const outcome = await attemptSave(filter);
    const stored = await loadFilter(ctx, filterId);
    return { ...outcome, StoredText: stored.FilterText ?? '' };
}

/**
 * RF1 — the issue scenario. A membership subquery filter stamped on two entities is edited
 * through the entity layer; the edit must succeed, and reads must stay restricted for users
 * whose only role carries the filter, before and after, with the new text in force.
 */
export async function CheckRf1SharedSubqueryRoleFilterEditable(ctx: IntegrationCheckContext): Promise<void> {
    await withFixture(ctx, 'RF1', async fx => {
        for (const user of [fx.UserA!, fx.UserB!]) {
            assertGenuinelyScoped(ctx, fx, user);
        }
        await assertScopedReads(ctx, fx, 'before the edit');

        const newText = membershipFilterV2(SchemaOf(ctx));
        const edit = await attemptEdit(ctx, fx.FilterID, newText);
        Assert(edit.Saved, `editing a shared subquery ROLE filter was refused (issue #5712): ${edit.Message}`);
        AssertEqual(edit.StoredText, newText, 'the edited FilterText must be what the database now holds');

        await refreshSecurity(ctx);
        const userA = cachedUser(fx.UserIDs[0]);
        const clause = entityOf(ctx, ENTITY_ONE).GetEffectiveRowFilterWhereClause(userA, EntityPermissionType.Read, '');
        Assert(clause.includes('vwUsers u') && clause.includes(userA.ID),
            `after the edit, the runtime clause must be the NEW text marked up for the user, got: '${clause}'`);
        fx.UserA = userA;
        fx.UserB = cachedUser(fx.UserIDs[1]);
        await assertScopedReads(ctx, fx, 'after the edit');
    });
}

/** Asserts a refused edit left the stored text alone. */
function assertRefusedUnchanged(edit: { Saved: boolean; Message: string; StoredText: string }, originalText: string, what: string): void {
    Assert(!edit.Saved, `${what} was ACCEPTED — a broken filter would now fail every read of the entities it scopes`);
    AssertEqual(edit.StoredText, originalText, `${what} was refused but the stored FilterText changed anyway`);
}

/**
 * RF2 — broken role filters are still refused, for the right reason. A bad column inside the
 * subquery is the case a word scanner cannot tell from a table alias; the compile probe must
 * refuse it with the database's own invalid-column error, naming the entity. A system-catalog
 * reference must be refused by the shared SQL screen before anything reaches the database.
 */
export async function CheckRf2BrokenRoleFilterEditRefused(ctx: IntegrationCheckContext): Promise<void> {
    await withFixture(ctx, 'RF2', async fx => {
        const schema = SchemaOf(ctx);
        const original = membershipFilterV1(schema);

        const badColumnText = `UserID IN (SELECT ur.UserID FROM ${schema}.vwUserRoles ur WHERE ur.${BAD_COLUMN} = '{{UserID}}')`;
        const badColumn = await attemptEdit(ctx, fx.FilterID, badColumnText);
        assertRefusedUnchanged(badColumn, original, 'a role filter edit referencing a nonexistent column');
        Assert(new RegExp(`invalid column name '${BAD_COLUMN}'|column \\S*${BAD_COLUMN.toLowerCase()} does not exist`, 'i').test(badColumn.Message),
            `the bad-column refusal must be the database's invalid-column error for '${BAD_COLUMN}', got: '${badColumn.Message}'`);
        Assert(badColumn.Message.includes(ENTITY_ONE) || badColumn.Message.includes(ENTITY_TWO),
            `the bad-column refusal must name the entity it failed against, got: '${badColumn.Message}'`);

        const catalogText = `UserID IN (SELECT principal_id FROM sys.database_principals)`;
        const catalog = await attemptEdit(ctx, fx.FilterID, catalogText);
        assertRefusedUnchanged(catalog, original, 'a role filter edit reading a system catalog');
        Assert(/system catalogs/i.test(catalog.Message),
            `the system-catalog refusal must come from the SQL screen, got: '${catalog.Message}'`);
    });
}

/** Creates an API key owned by the run's user; returns its id. */
async function createApiKey(ctx: IntegrationCheckContext, tag: string): Promise<string> {
    const created = await GetAPIKeyEngine().CreateAPIKey({ UserId: ctx.User.ID, Label: `${tag} (safe to delete)` }, ctx.User);
    Assert(created.Success && !!created.APIKeyId, `CreateAPIKey failed: ${created.Error}`);
    return created.APIKeyId!;
}

/** Attaches the filter to an API key as an entity:read row filter on the given entity. */
async function createKeyScopeRule(ctx: IntegrationCheckContext, apiKeyId: string, entityName: string, filterId: string): Promise<void> {
    const readScope = GetAPIKeyEngine().Scopes.find(s => s.FullPath === 'entity:read');
    Assert(readScope != null, "seeded scope 'entity:read' not loaded");
    const rule = await ctx.Provider.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', ctx.User);
    rule.NewRecord();
    rule.APIKeyID = apiKeyId;
    rule.ScopeID = readScope!.ID;
    rule.ResourcePattern = entityName;
    rule.PatternType = 'Include';
    rule.IsDeny = false;
    rule.Priority = 0;
    rule.RowFilterID = filterId;
    await mustSave(rule, 'attaching the filter to an API key scope rule');
}

/** Removes the API key and its scope rules and usage logs. */
async function deleteApiKey(ctx: IntegrationCheckContext, apiKeyId: string): Promise<void> {
    await deleteWhere(ctx, 'APIKeyScope', `APIKeyID = '${apiKeyId}'`);
    await deleteWhere(ctx, 'APIKeyUsageLog', `APIKeyID = '${apiKeyId}'`);
    const key = await ctx.Provider.GetEntityObject<MJAPIKeyEntity>('MJ: API Keys', ctx.User);
    if (await key.Load(apiKeyId)) {
        await key.Delete().catch(() => undefined);
    }
}

/** Also stamps the key filter on the fixture role's permission row, so it has a ROLE referrer too. */
async function stampAsUpdateFilter(ctx: IntegrationCheckContext, permissionId: string, filterId: string): Promise<void> {
    const permission = await ctx.Provider.GetEntityObject<MJEntityPermissionEntity>('MJ: Entity Permissions', ctx.User);
    Assert(await permission.Load(permissionId), `loading permission ${permissionId} failed`);
    permission.UpdateRLSFilterID = filterId;
    await mustSave(permission, 'stamping the key filter on a role permission row');
}

/**
 * RF3 — API-key row filters keep the strict rules. The filter is referenced by an API-key scope
 * rule AND a role permission row on the same entity; a bad column must be refused by the
 * plain-column check and a subquery by the subquery ban — the role path must not loosen either.
 */
export async function CheckRf3ApiKeyFilterStaysStrict(ctx: IntegrationCheckContext): Promise<void> {
    await withFixture(ctx, 'RF3', async fx => {
        await GetAPIKeyEngine().Config(true, ctx.User);
        const keyFilterText = `UserID = '{{UserID}}'`;
        const keyFilterId = await createFilter(ctx, `${fx.Tag}-key`, keyFilterText);
        const apiKeyId = await createApiKey(ctx, fx.Tag);
        try {
            await createKeyScopeRule(ctx, apiKeyId, ENTITY_ONE, keyFilterId);
            await stampAsUpdateFilter(ctx, fx.PermissionIDs[0], keyFilterId);

            const badColumn = await attemptEdit(ctx, keyFilterId, `${BAD_COLUMN} = '{{UserID}}'`);
            assertRefusedUnchanged(badColumn, keyFilterText, 'an API-key filter edit referencing a nonexistent column');
            Assert(badColumn.Message.includes(`Column '${BAD_COLUMN}' does not resolve to a real non-virtual field on entity '${ENTITY_ONE}'`),
                `the API-key bad-column refusal must come from the strict plain-column check, got: '${badColumn.Message}'`);

            const subquery = await attemptEdit(ctx, keyFilterId, membershipFilterV1(SchemaOf(ctx)));
            assertRefusedUnchanged(subquery, keyFilterText, 'an API-key filter edit introducing a subquery');
            Assert(/Dangerous SQL keyword detected: SELECT/.test(subquery.Message),
                `the API-key subquery refusal must come from the subquery ban, got: '${subquery.Message}'`);
        } finally {
            await deleteWhere(ctx, 'EntityPermission', `ID = '${fx.PermissionIDs[0]}'`);
            await deleteApiKey(ctx, apiKeyId);
        }
    });
}

/**
 * The RF members of the 'rls-isolation' bundle (server transport). Registered after KF1–KF6
 * (index.ts export order). Mutation-gated: they write security metadata.
 */
export const RoleRowFilterChecks: NamedCheck[] = [
    {
        Id: 'rls-isolation.RF1',
        Name: 'RF1: a subquery ROLE filter shared by two entities is editable, and restricts reads for its only-role users before and after the edit',
        Fn: CheckRf1SharedSubqueryRoleFilterEditable,
        RequiresMutation: true
    },
    {
        Id: 'rls-isolation.RF2',
        Name: 'RF2: a ROLE filter edit with a nonexistent column or a system-catalog reference is still refused, for that reason',
        Fn: CheckRf2BrokenRoleFilterEditRefused,
        RequiresMutation: true
    },
    {
        Id: 'rls-isolation.RF3',
        Name: 'RF3: a filter referenced by an API-key scope rule keeps the strict rules (bad column and subquery both refused) even with a role referrer',
        Fn: CheckRf3ApiKeyFilterStaysStrict,
        RequiresMutation: true
    }
];

for (const check of RoleRowFilterChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
