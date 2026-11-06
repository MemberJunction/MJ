/**
 * query-security-fls.ts — QS9 and QS10 of the 'query-security' bundle: field-level security on
 * saved queries, on SQL Server and PostgreSQL.
 *
 * `fls-closeout-pending` (IT135) PQ1–PQ4 already assert, on SQL Server only (its shared fixture
 * needs the SQL Server pool): a query naming a denied column is refused with the not-found message
 * (by ID), a denied column used only in WHERE is refused, a plain `SELECT *` runs with the denied
 * column dropped, and a role-list grant bypasses field security. These checks add what that leaves
 * out, on both platforms:
 *  - QS9: a denied column used only in ORDER BY is refused; `alias.*` over a join drops the denied
 *    column; each whole-row construct (`SELECT DISTINCT *`, a set operation over `*`, `FOR JSON` on
 *    SQL Server, `row_to_json(t)` / `to_jsonb(t)` on PostgreSQL) is refused; a query reading only
 *    allowed columns runs (the control); the unrestricted caller gets the denied value back;
 *  - QS10: every refusal, by ID and by category path and name, reads exactly as the refusal of a
 *    query that does not exist, so a refusal reveals neither the query nor the column.
 *
 * FIXTURE. The restricted principal is an in-memory copy of the run's user holding one fixture
 * role that may read `MJ: Tags` and is denied `MJ: Tags.Description`. For the length of the check
 * field security is enabled on `MJ: Tags` (its snapshot allows every role holding read, so no other
 * user's access changes) and two tags carrying a marker in Description are stored. Everything is
 * restored in the check's `finally`, and again in the bundle's Teardown.
 */
import { UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { DatabasePlatform, EntityInfo } from '@memberjunction/core';
import type { MJEntityEntity, MJEntityFieldPermissionEntity, MJEntityPermissionEntity, MJRoleEntity } from '@memberjunction/core-entities';
import { Assert, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { ForPlatform, FixtureCategoryPath, NewFixtureQuery, RequireQueryDb, RunFixtureSQL, RunFixtureSQLQuietly, SaveFixtureQuery } from './query-extraction-fixture';
import {
    FailOnFindings, RefreshQueries, RequireSecurityFixture, RunSaved, RunSavedByName, SECURITY_BUNDLE, SECURITY_PREFIX, StoreBypassingSave,
} from './query-security-fixture';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';
import type { QueryOutcome } from './query-security-fixture';

const TAGS = 'MJ: Tags';
const DENIED = 'Description';
const TAG_IDS = ['C142F000-0000-4000-8000-000000000001', 'C142F000-0000-4000-8000-000000000002'];
const MARKER = 'zzz-it142-secret';
const WHERE_FIXTURE = `t.[ID] IN (${TAG_IDS.map(id => `'${id}'`).join(', ')})`;

/** What the FLS fixture changed, so it can be put back. */
interface FlsQueryState {
    Role: MJRoleEntity | null;
    Permission: MJEntityPermissionEntity | null;
    Enabled: boolean;
}

let state: FlsQueryState = { Role: null, Permission: null, Enabled: false };

function tagsEntity(ctx: IntegrationCheckContext): EntityInfo {
    const entity = ctx.Provider.EntityByName(TAGS);
    if (!entity) throw new Error(`${SECURITY_BUNDLE}: '${TAGS}' is not in the provider's metadata`);
    return entity;
}

function sqlFor(sql: string): string {
    return ForPlatform(sql, RequireSecurityFixture().Platform);
}

// ─── Fixture ────────────────────────────────────────────────────────────────

async function saveOrThrow(entity: MJRoleEntity | MJEntityPermissionEntity | MJEntityEntity | MJEntityFieldPermissionEntity, what: string): Promise<void> {
    if (!await entity.Save()) throw new Error(`${SECURITY_BUNDLE}: ${what} failed: ${entity.LatestResult?.CompleteMessage ?? 'no message'}`);
}

async function createRoleWithRead(ctx: IntegrationCheckContext, entity: EntityInfo): Promise<void> {
    const role = await ctx.Provider.GetEntityObject<MJRoleEntity>('MJ: Roles', ctx.User);
    role.NewRecord();
    role.Name = `${SECURITY_PREFIX} fls reader ${Date.now().toString(36)}`;
    role.Description = 'mj-integration-test query-security fixture — safe to delete';
    await saveOrThrow(role, 'creating the fixture role');
    state.Role = role;
    const permission = await ctx.Provider.GetEntityObject<MJEntityPermissionEntity>('MJ: Entity Permissions', ctx.User);
    permission.NewRecord();
    permission.EntityID = entity.ID;
    permission.RoleID = role.ID;
    permission.CanRead = true;
    await saveOrThrow(permission, `granting the fixture role read on ${TAGS}`);
    state.Permission = permission;
}

async function setFieldSecurity(ctx: IntegrationCheckContext, entity: EntityInfo, enabled: boolean): Promise<void> {
    const row = await ctx.Provider.GetEntityObject<MJEntityEntity>('MJ: Entities', ctx.User);
    Assert(await row.Load(entity.ID), `${SECURITY_BUNDLE}: loading the ${TAGS} entity row failed`);
    row.EnableFieldLevelSecurity = enabled;
    await saveOrThrow(row, `${enabled ? 'enabling' : 'disabling'} field security on ${TAGS}`);
    state.Enabled = enabled;
}

/**
 * The fixture role's rule row for the denied column: the one enabling field security wrote for it
 * (its snapshot covers every role holding read), or a new row when the snapshot wrote none.
 */
async function ruleRow(ctx: IntegrationCheckContext, fieldID: string, roleID: string): Promise<MJEntityFieldPermissionEntity> {
    const rows = await RequireQueryDb(ctx.Provider, SECURITY_BUNDLE).RunView<MJEntityFieldPermissionEntity>({
        EntityName: 'MJ: Entity Field Permissions', ExtraFilter: `EntityFieldID='${fieldID}' AND RoleID='${roleID}'`, ResultType: 'entity_object', BypassCache: true,
    }, ctx.User);
    Assert(rows.Success && rows.Results.length <= 1, `${SECURITY_BUNDLE}: reading the fixture role's ${DENIED} rule failed: ${rows.ErrorMessage ?? `${rows.Results.length} rows`}`);
    if (rows.Results.length === 1) return rows.Results[0];
    const rule = await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User);
    rule.NewRecord();
    rule.EntityFieldID = fieldID;
    rule.RoleID = roleID;
    return rule;
}

/** Denies the fixture role read of the denied column. */
async function denyColumn(ctx: IntegrationCheckContext, entity: EntityInfo, roleID: string): Promise<void> {
    const field = entity.Fields.find(f => f.Name === DENIED);
    Assert(field != null, `${SECURITY_BUNDLE}: ${TAGS} has no ${DENIED} field`);
    const rule = await ruleRow(ctx, field!.ID, roleID);
    rule.ReadAccess = 'Deny';
    rule.UpdateAccess = 'No Access';
    rule.CreateAccess = 'No Access';
    await saveOrThrow(rule, `denying ${TAGS}.${DENIED} to the fixture role`);
}

function tagStatements(): string[] {
    return TAG_IDS.map((id, i) =>
        `INSERT INTO __mj.[Tag] ([ID], [Name], [DisplayName], [Description]) VALUES ('${id}', 'zzz-it142-fls-${i}', 'zzz-it142 fls ${i}', '${MARKER}-${i}')`);
}

function removeStatements(platform: DatabasePlatform): string[] {
    const fields = `SELECT f.[ID] FROM __mj.[EntityField] f JOIN __mj.[Entity] e ON e.[ID] = f.[EntityID] WHERE e.[Name] = '${TAGS}'`;
    return [
        `DELETE FROM __mj.[EntityFieldPermission] WHERE [EntityFieldID] IN (${fields})`,
        `DELETE FROM __mj.[Tag] WHERE [ID] IN (${TAG_IDS.map(id => `'${id}'`).join(', ')})`,
    ].map(s => ForPlatform(s, platform));
}

/** Refuses to run when another session already configured field security on the fixture entity. */
async function assertEntityUnconfigured(ctx: IntegrationCheckContext, entity: EntityInfo): Promise<void> {
    const rows = await RequireQueryDb(ctx.Provider, SECURITY_BUNDLE).RunView({
        EntityName: 'MJ: Entity Field Permissions', ExtraFilter: `EntityFieldID IN (${entity.Fields.map(f => `'${f.ID}'`).join(', ')})`, ResultType: 'count_only', BypassCache: true,
    }, ctx.User);
    if (entity.EnableFieldLevelSecurity || rows.TotalRowCount > 0) {
        SkipCheck(`${TAGS} already has field security configured (${rows.TotalRowCount} rule rows); the check will not change a configured entity`);
    }
}

/** Builds the fixture and returns the restricted principal. */
async function setupFls(ctx: IntegrationCheckContext): Promise<UserInfo> {
    const entity = tagsEntity(ctx);
    await assertEntityUnconfigured(ctx, entity);
    await RunFixtureSQL(ctx, SECURITY_BUNDLE, removeStatements(RequireSecurityFixture().Platform).slice(1).concat(tagStatements().map(sqlFor)));
    await createRoleWithRead(ctx, entity);
    await ctx.Provider.Refresh();
    await setFieldSecurity(ctx, tagsEntity(ctx), true);
    await ctx.Provider.Refresh();
    await denyColumn(ctx, tagsEntity(ctx), state.Role!.ID);
    await ctx.Provider.Refresh();
    const role = new UserRoleInfo({ UserID: ctx.User.ID, RoleID: state.Role!.ID, Role: state.Role!.Name });
    return new UserInfo(undefined, { ...ctx.User, UserRoles: [role] });
}

/** Puts back everything {@link setupFls} changed; never throws. */
export async function TeardownFlsQueryFixture(ctx: IntegrationCheckContext): Promise<void> {
    const platform = RequireSecurityFixture().Platform;
    if (state.Role || state.Enabled) await RunFixtureSQLQuietly(ctx, SECURITY_BUNDLE, removeStatements(platform));
    else await RunFixtureSQLQuietly(ctx, SECURITY_BUNDLE, removeStatements(platform).slice(1));
    try {
        if (state.Enabled) await setFieldSecurity(ctx, tagsEntity(ctx), false);
    } catch (e) {
        console.error(`${SECURITY_BUNDLE} teardown warning (field security): ${e instanceof Error ? e.message : String(e)}`);
    }
    await state.Permission?.Delete().catch(() => false);
    await state.Role?.Delete().catch(() => false);
    state = { Role: null, Permission: null, Enabled: false };
    await ctx.Provider.Refresh().catch(() => undefined);
}

// ─── The queries ────────────────────────────────────────────────────────────

const FROM = `FROM __mj.[vwTags] t WHERE ${WHERE_FIXTURE}`;

/** [label, SQL, how the restricted principal must fare]: `refused`, `runs` (all columns) or `drops` (runs without the denied column). */
type FlsCase = [label: string, sql: string, outcome: 'refused' | 'runs' | 'drops'];

function flsCases(platform: DatabasePlatform): FlsCase[] {
    const cases: FlsCase[] = [
        ['allowed columns only (control)', `SELECT t.[ID], t.[Name] ${FROM}`, 'runs'],
        ['the denied column named', `SELECT t.[ID], t.[Name], t.[${DENIED}] ${FROM}`, 'refused'],
        ['the denied column only in ORDER BY', `SELECT t.[ID] ${FROM} ORDER BY t.[${DENIED}]`, 'refused'],
        ['the denied column only in GROUP BY', `SELECT COUNT(*) AS [N] ${FROM} GROUP BY t.[${DENIED}]`, 'refused'],
        ['SELECT *', `SELECT * ${FROM}`, 'drops'],
        ['alias.* over a join', `SELECT t.*, p.[Name] AS [ParentName] FROM __mj.[vwTags] t LEFT JOIN __mj.[vwTags] p ON p.[ID] = t.[ParentID] WHERE ${WHERE_FIXTURE}`, 'drops'],
        ['SELECT DISTINCT *', `SELECT DISTINCT t.* ${FROM}`, 'refused'],
        ['a set operation over *', `SELECT * ${FROM} UNION SELECT * ${FROM}`, 'refused'],
    ];
    const wholeRow: FlsCase[] = platform === 'postgresql'
        ? [['row_to_json(t)', `SELECT row_to_json(t) AS [J] ${FROM}`, 'refused'], ['to_jsonb(t)', `SELECT to_jsonb(t) AS [J] ${FROM}`, 'refused']]
        : [['FOR JSON over *', `SELECT * ${FROM} FOR JSON PATH`, 'refused'], ['FOR XML over *', `SELECT * ${FROM} FOR XML PATH`, 'refused']];
    return [...cases, ...wholeRow].map(([label, sql, outcome]) => [label, sqlFor(sql), outcome]);
}

/** The refusal of a query the caller may not run, worded as for one that does not exist. */
function unavailable(label: string): string {
    return `Query '${label}' does not exist or you do not have permission to run it.`;
}

/** Saves each case (extraction on; a construct the describe cannot read is stored without it). */
async function saveCases(ctx: IntegrationCheckContext, cases: readonly FlsCase[]): Promise<string[]> {
    const ids: string[] = [];
    for (const [index, [label, sql]] of cases.entries()) {
        const name = `${SECURITY_PREFIX} fls ${index + 1}`;
        const query = await NewFixtureQuery(ctx, RequireSecurityFixture().Category.ID, { Name: name, SQL: sql });
        const saved = await query.Save(FixtureQuerySaveOptions()).catch(() => false) ? query : await StoreBypassingSave(ctx, `fls ${index + 1} (${label})`, sql);
        ids.push(saved.ID);
    }
    await RefreshQueries(ctx);
    return ids;
}

function judgeRestricted(findings: string[], label: string, id: string, outcome: QueryOutcome, expected: FlsCase[2]): void {
    if (expected === 'refused') {
        if (outcome.Success) findings.push(`LEAK: ${label}: ran for the restricted caller (${outcome.Rows.length} rows)`);
        else if (outcome.Error !== unavailable(id)) findings.push(`${label}: refused with '${outcome.Error}', expected exactly '${unavailable(id)}'`);
    } else if (!outcome.Success || outcome.Rows.length !== TAG_IDS.length) {
        findings.push(`${label}: the restricted caller must run it (${TAG_IDS.length} rows): ${outcome.Error || `${outcome.Rows.length} rows`}`);
    }
    if (expected === 'drops' && outcome.Rows.some(r => DENIED in r)) findings.push(`LEAK: ${label}: the restricted caller's rows carry '${DENIED}'`);
    if (JSON.stringify(outcome).includes(MARKER)) findings.push(`LEAK: ${label}: the restricted caller's result carries the denied value`);
}

function judgeUnrestricted(findings: string[], label: string, outcome: QueryOutcome): void {
    if (!outcome.Success) findings.push(`${label}: the unrestricted caller must run it: ${outcome.Error}`);
}

async function checkQs9FieldSecurityOnQueries(ctx: IntegrationCheckContext): Promise<void> {
    try {
        const principal = await setupFls(ctx);
        const cases = flsCases(RequireSecurityFixture().Platform);
        const ids = await saveCases(ctx, cases);
        const findings: string[] = [];
        for (const [index, [label, , expected]] of cases.entries()) {
            judgeRestricted(findings, label, ids[index], await RunSaved(ids[index], principal), expected);
            judgeUnrestricted(findings, label, await RunSaved(ids[index], ctx.User));
        }
        const named = await RunSaved(ids[1], ctx.User);
        if (!JSON.stringify(named.Rows).includes(MARKER)) findings.push(`the unrestricted caller must receive the stored ${DENIED} values (control)`);
        FailOnFindings('QS9', findings, cases.length * 2 + 1);
    } finally {
        await TeardownFlsQueryFixture(ctx);
    }
}

/** QS10: refusals by ID and by name read exactly as for a query that does not exist. */
async function checkQs10RefusalReadsAsNotFound(ctx: IntegrationCheckContext): Promise<void> {
    try {
        const principal = await setupFls(ctx);
        const f = RequireSecurityFixture();
        const query = await SaveFixtureQuery(await NewFixtureQuery(ctx, f.Category.ID, { Name: `${SECURITY_PREFIX} fls named`, SQL: sqlFor(`SELECT t.[ID], t.[${DENIED}] ${FROM}`) }));
        await RefreshQueries(ctx);
        const path = FixtureCategoryPath(f.Category);
        const missingID = 'C142F000-0000-4000-8000-0000000000FF';
        const findings: string[] = [];
        const pairs: Array<[string, QueryOutcome, string]> = [
            ['denied, by ID', await RunSaved(query.ID, principal), unavailable(query.ID)],
            ['not found, by ID', await RunSaved(missingID, principal), unavailable(missingID)],
            ['denied, by name', await RunSavedByName(path, query.Name, principal), unavailable(`${path}/${query.Name}`)],
            ['not found, by name', await RunSavedByName(path, `${SECURITY_PREFIX} no such query`, principal), unavailable(`${path}/${SECURITY_PREFIX} no such query`)],
        ];
        for (const [label, outcome, expected] of pairs) {
            if (outcome.Success || outcome.Error !== expected) findings.push(`${label}: ${outcome.Success ? 'ran' : `'${outcome.Error}'`}, expected exactly '${expected}'`);
        }
        FailOnFindings('QS10', findings, pairs.length);
    } finally {
        await TeardownFlsQueryFixture(ctx);
    }
}

export const FlsQueryChecks: NamedCheck[] = [
    { Id: `${SECURITY_BUNDLE}.QS9`, Name: 'QS9: field security on saved queries — ORDER BY/GROUP BY use and whole-row constructs refused, alias.* drops the denied column, allowed reads run', Fn: checkQs9FieldSecurityOnQueries },
    { Id: `${SECURITY_BUNDLE}.QS10`, Name: 'QS10: a field-security refusal, by ID or by name, reads exactly as the refusal of a query that does not exist', Fn: checkQs10RefusalReadsAsNotFound },
];

