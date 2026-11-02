/**
 * query-refresh.checks.ts — the 'query-refresh' bundle (QR1–QR16), deterministic tier (IT139).
 *
 * Drives `QueryExtractionService` and `RebindQueriesForChangedEntities` against fixture queries
 * over a fixture table (`mjit_rebind.Item`) and the core view `__mj.vwCompanies`:
 *  - QR1: refreshing queries whose facts already match is `Unchanged` and writes nothing;
 *  - QR2: a bulk refresh refreshes a composed query before the queries that compose it;
 *  - QR3: a re-bind refreshes exactly the queries that read the changed entity;
 *  - QR4: a definer's-rights query (one with `MJ: Query Permissions` rows) that gains a column
 *    whose source field has field permissions is recorded as a `Warning` naming the column;
 *  - QR5: a caller without the refresh grants is refused with the not-found wording for an existing
 *    query, identical to a missing one's refusal, dry run included; a bulk run reports `NotPermitted`;
 *  - QR6–QR11 alter the table inside the checks: a dry run writes nothing; an added column reaches
 *    the `SELECT *` query only; a type change updates the field; dropping an unused column changes
 *    nothing; dropping or renaming a used column records `Error` with the server's message and
 *    leaves the SQL and the stored fields as they were;
 *  - QR12: queries whose stored dependency rows form a cycle are each refreshed once, and the
 *    cycle is reported once;
 *  - QR13: dropping the view a query reads records `Error` with the server's message, SQL and
 *    fields kept;
 *  - QR14: a column going NOT NULL with a type change updates `IsNullable` and the type and
 *    reports both (a stored NULL nullability is corrected too); PostgreSQL's describe reports no
 *    nullability, so there only the type change is asserted;
 *  - QR15: deleting the entity field a query field's `SourceEntityFieldID` points at nulls it (the
 *    foreign key is ON DELETE SET NULL), and a re-bind links it again. A disposable MJ: Entity
 *    Fields row stands in for the dropped column: a CodeGen column drop is not used, because it
 *    fails on the (EntityID, Sequence) unique index when it renumbers the remaining fields;
 *  - QR16: a caller who may read but not update MJ: Queries is refused exactly like one with no
 *    grant, single (dry run included) and bulk.
 *
 * The checks run in array order: the schema changes come last. For QR4 one MJ: Companies field
 * carries an all-Allow field permission row (field-level security stays off, so nothing is
 * enforced); the row is deleted in a `finally`, and again by Teardown if a check stopped early.
 * Teardown deletes the per-run `zzz-it139` category with its queries, the QR15 probe field if a
 * check stopped early, and drops `mjit_rebind`.
 */
import { randomUUID } from 'node:crypto';
import { UserInfo, UserRoleInfo } from '@memberjunction/core';
import type { DatabasePlatform, EntityInfo } from '@memberjunction/core';
import type { MJEntityFieldPermissionEntity, MJQueryCategoryEntity, MJQueryDependencyEntity, MJQueryPermissionEntity } from '@memberjunction/core-entities';
import {
    DefinerRightsDriftMessage, IsQueryRefreshProvider, QueryExtractionService, QueryRefreshUnavailableMessage, RebindQueriesForChangedEntities,
} from '@memberjunction/core-entities-server';
import type { MJQueryEntityServer, QueryRefreshContext, QueryRefreshReport } from '@memberjunction/core-entities-server';
import { UserCache } from '@memberjunction/generic-database-provider';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import {
    CanonicalRows, ColumnName, CreateFixtureCategory, CreateFixtureQuery, CreateSchemaStatement, DeleteFixtureCategory, DropSchemaStatements,
    FixtureCategoryPath, ForPlatform, ObjectName, PlatformOf, ReadQueryRows, ReloadQuery, RequireQueryDb, RunFixtureSQL, RunFixtureSQLQuietly,
    RunStamp, SnapshotDifference, SnapshotQueryRows,
} from './query-extraction-fixture';

const BUNDLE = 'query-refresh';
const PREFIX = 'zzz-it139';
const SCHEMA = 'mjit_rebind';
const TABLE = 'Item';
/** The fixture view QR13 creates over the table and then drops. */
const VIEW = 'vwItem';
/**
 * The disposable MJ: Entity Fields row QR15 adds to MJ: Companies and deletes again. It names no
 * real column, so no query binds to it; QR15 points one stored query field at it by hand.
 */
const PROBE_FIELD_ID = '7C1E2B9A-4F3D-4E61-9B8A-2D5C6E7F8A91';
const PROBE_FIELD_NAME = 'zzzIT139ProbeField';
const NOGRANT_EMAIL = 'it-nogrant@integration.test';
/** The core entity the re-bind checks change; no shipped query reads it. */
const REBIND_ENTITY = 'MJ: Companies';
/** The MJ: Companies column QR4 removes from the stored fields, so a refresh adds it back. */
const DRIFT_FIELD = 'Website';

/** The fixture queries, by role. */
type QueryKey = 'Star' | 'Named' | 'Renamed' | 'NoUse' | 'Join' | 'ChainA' | 'ChainB' | 'ChainC' | 'Drift';

interface RefreshFixture {
    Platform: DatabasePlatform;
    Category: MJQueryCategoryEntity;
    Queries: Map<QueryKey, MJQueryEntityServer>;
    /** MJ: Entity Field Permissions rows a check created, removed by the check and again by Teardown. */
    FieldRuleIDs: string[];
}

let fixture: RefreshFixture | undefined;

function requireFixture(): RefreshFixture {
    if (!fixture) throw new Error(`${BUNDLE}: Setup did not run (no fixture)`);
    return fixture;
}

function queryOf(key: QueryKey): MJQueryEntityServer {
    const query = requireFixture().Queries.get(key);
    if (!query) throw new Error(`${BUNDLE}: fixture query ${key} was not created`);
    return query;
}

// ─── Fixture ────────────────────────────────────────────────────────────────

function table(platform: DatabasePlatform): string {
    return ObjectName(platform, SCHEMA, TABLE);
}

function createTableStatements(platform: DatabasePlatform): string[] {
    const c = (name: string) => ColumnName(platform, name);
    const text = platform === 'postgresql' ? 'VARCHAR' : 'NVARCHAR';
    const decimal = platform === 'postgresql' ? 'NUMERIC' : 'DECIMAL';
    return [
        CreateSchemaStatement(platform, SCHEMA),
        `CREATE TABLE ${table(platform)} (${c('ID')} INTEGER NOT NULL PRIMARY KEY, ${c('Name')} ${text}(50) NOT NULL, ` +
            `${c('Code')} VARCHAR(20) NULL, ${c('Amount')} ${decimal}(10,2) NULL, ${c('Unused')} INTEGER NULL)`,
    ];
}

/** The fixture queries in creation order (a composed query before the queries composing it). */
function querySQL(key: QueryKey, categoryPath: string): string {
    switch (key) {
        case 'Star': return 'SELECT * FROM mjit_rebind.[Item]';
        case 'Named': return 'SELECT i.[ID], i.[Name], i.[Code] FROM mjit_rebind.[Item] i';
        case 'Renamed': return 'SELECT i.[ID], i.[Amount] FROM mjit_rebind.[Item] i';
        case 'NoUse': return 'SELECT i.[ID], i.[Name] FROM mjit_rebind.[Item] i';
        case 'Join': return 'SELECT i.[ID], co.[Name] AS [CompanyName] FROM mjit_rebind.[Item] i CROSS JOIN __mj.[vwCompanies] co';
        case 'ChainA': return 'SELECT i.[ID], i.[Name] FROM mjit_rebind.[Item] i';
        case 'ChainB': return `SELECT a.[ID], a.[Name] FROM {{query:"${categoryPath}/${PREFIX} ChainA"}} a`;
        case 'ChainC': return `SELECT b.[ID] FROM {{query:"${categoryPath}/${PREFIX} ChainB"}} b`;
        case 'Drift': return 'SELECT * FROM __mj.[vwCompanies]';
    }
}

const QUERY_KEYS: readonly QueryKey[] = ['Star', 'Named', 'Renamed', 'NoUse', 'Join', 'ChainA', 'ChainB', 'ChainC', 'Drift'];

async function createQueries(ctx: IntegrationCheckContext, f: RefreshFixture): Promise<void> {
    for (const key of QUERY_KEYS) {
        // The category path is read after the first query exists, from the QueryEngine.
        const path = f.Queries.size > 0 ? FixtureCategoryPath(f.Category) : f.Category.Name;
        const query = await CreateFixtureQuery(ctx, f.Category.ID, {
            Name: `${PREFIX} ${key}`, SQL: ForPlatform(querySQL(key, path), f.Platform), Reusable: key === 'ChainA' || key === 'ChainB',
        });
        f.Queries.set(key, query);
    }
    await grantDefinerRights(ctx, queryOf('Drift'));
}

/** Gives the drift query a Query Permissions row, which makes it run with definer's rights. */
async function grantDefinerRights(ctx: IntegrationCheckContext, query: MJQueryEntityServer): Promise<void> {
    const role = ctx.Provider.Roles.find(r => r.Name === 'UI');
    if (!role) throw new Error(`${BUNDLE} Setup: the UI role is missing`);
    const permission = await ctx.Provider.GetEntityObject<MJQueryPermissionEntity>('MJ: Query Permissions', ctx.User);
    permission.NewRecord();
    permission.QueryID = query.ID;
    permission.RoleID = role.ID;
    if (!await permission.Save()) throw new Error(`${BUNDLE} Setup: the query permission save failed: ${permission.LatestResult?.CompleteMessage}`);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const platform = PlatformOf(ctx, BUNDLE);
        await RunFixtureSQL(ctx, BUNDLE, [...DropSchemaStatements(platform, SCHEMA, [VIEW], [TABLE]), ...createTableStatements(platform)]);
        const category = await CreateFixtureCategory(ctx, `${PREFIX} ${RunStamp()}`);
        fixture = { Platform: platform, Category: category, Queries: new Map(), FieldRuleIDs: [] };
        await createQueries(ctx, fixture);
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        await deleteFieldRules(ctx);
        await RunFixtureSQLQuietly(ctx, BUNDLE, [deleteProbeFieldStatement(ctx, PlatformOf(ctx, BUNDLE))]);
        await DeleteFixtureCategory(ctx, BUNDLE, fixture?.Category);
        await RunFixtureSQLQuietly(ctx, BUNDLE, DropSchemaStatements(PlatformOf(ctx, BUNDLE), SCHEMA, [VIEW], [TABLE]));
        fixture = undefined;
    },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function refreshContext(ctx: IntegrationCheckContext, user: UserInfo = ctx.User): QueryRefreshContext {
    const provider = RequireQueryDb(ctx.Provider, BUNDLE);
    if (!IsQueryRefreshProvider(provider)) throw new Error(`${BUNDLE}: the provider cannot run views`);
    return { Provider: provider, User: user };
}

function service(ctx: IntegrationCheckContext, user: UserInfo = ctx.User): QueryExtractionService {
    return new QueryExtractionService(refreshContext(ctx, user));
}

function ids(keys: readonly QueryKey[]): string[] {
    return keys.map(k => queryOf(k).ID);
}

function changeNames(report: QueryRefreshReport, action: 'Added' | 'Updated' | 'Removed'): string {
    return report[action].map(c => `${c.Collection}:${c.Name}`).join(',');
}

function describeReport(report: QueryRefreshReport): string {
    return `${report.Outcome} +[${changeNames(report, 'Added')}] ~[${changeNames(report, 'Updated')}] -[${changeNames(report, 'Removed')}] ` +
        `cols[${report.QueryColumns.join(',')}] diag[${report.Diagnostics.join(' / ')}]`;
}

async function alterTable(ctx: IntegrationCheckContext, statement: (platform: DatabasePlatform, t: string, c: (n: string) => string) => string): Promise<void> {
    const platform = requireFixture().Platform;
    await RunFixtureSQL(ctx, BUNDLE, [statement(platform, table(platform), (n: string) => ColumnName(platform, n))]);
}

function requireEntity(ctx: IntegrationCheckContext, name: string): EntityInfo {
    const entity = ctx.Provider.EntityByName(name);
    if (!entity) throw new Error(`${BUNDLE}: ${name} is not in the metadata`);
    return entity;
}

/** The stored field rows of one query, every column, as a canonical string. */
async function fieldRows(ctx: IntegrationCheckContext, queryID: string): Promise<string> {
    const rows = await ReadQueryRows(ctx, BUNDLE, queryID);
    return CanonicalRows(rows.Fields.map(f => f.GetAll()));
}

// ─── QR1–QR3: unchanged, dependency order, re-bind selection ────────────────

/** The columns of a query row a refresh could change: its SQL and the extraction results. */
async function queryFacts(ctx: IntegrationCheckContext, queryIDs: readonly string[]): Promise<string> {
    const facts: string[] = [];
    for (const id of queryIDs) {
        const q = await ReloadQuery(ctx, id);
        facts.push(`${q.Name}|${q.SQL}|${String(q.UsesTemplate)}|${q.ExtractedSQLHash ?? ''}|${q.ExtractionStatus ?? ''}|${q.ExtractionMessage ?? ''}`);
    }
    return facts.join('\n');
}

/** Each query row's `__mj_UpdatedAt`, read from the database, as one string. */
async function queryStamps(ctx: IntegrationCheckContext, queryIDs: readonly string[]): Promise<string> {
    const stamps: string[] = [];
    for (const id of queryIDs) {
        const q = await ReloadQuery(ctx, id);
        stamps.push(`${q.Name}|${new Date(q.__mj_UpdatedAt).toISOString()}`);
    }
    return stamps.join('\n');
}

/**
 * A refresh that finds nothing to change writes nothing: every child row is compared in full, the
 * query rows' SQL and extraction columns are compared, and each query row's `__mj_UpdatedAt` must
 * not move (the query row is not saved).
 */
async function checkQr1UnchangedRefreshWritesNothing(ctx: IntegrationCheckContext): Promise<void> {
    const all = ids(QUERY_KEYS);
    const before = await SnapshotQueryRows(ctx, BUNDLE, all, true);
    const factsBefore = await queryFacts(ctx, all);
    const stampsBefore = await queryStamps(ctx, all);
    const run = await service(ctx).RefreshQueries({ QueryIDs: all });
    AssertEqual(run.Reports.length, all.length, 'QR1: one report per query');
    const changed = run.Reports.filter(r => r.Outcome !== 'Unchanged').map(r => `${r.QueryName}: ${describeReport(r)}`);
    AssertEqual(changed.join(' | '), '', 'QR1: a refresh right after the save finds nothing to change');
    const after = await SnapshotQueryRows(ctx, BUNDLE, all, true);
    Assert(before === after, `QR1: an unchanged refresh wrote child rows: ${SnapshotDifference(before, after)}`);
    AssertEqual(await queryFacts(ctx, all), factsBefore, 'QR1: an unchanged refresh changes no SQL or extraction column');
    AssertEqual(await queryStamps(ctx, all), stampsBefore, 'QR1: an unchanged refresh leaves the query rows untouched (__mj_UpdatedAt did not move)');
}

async function checkQr2DependenciesFirst(ctx: IntegrationCheckContext): Promise<void> {
    const run = await service(ctx).RefreshQueries({ QueryIDs: ids(['ChainC', 'ChainB', 'ChainA']) });
    AssertEqual(run.Reports.map(r => r.QueryName).join(' > '), `${PREFIX} ChainA > ${PREFIX} ChainB > ${PREFIX} ChainC`,
        'QR2: a composed query is refreshed before the queries composing it, whatever order they were asked for in');
    AssertEqual(run.Cycles.length, 0, 'QR2: the chain has no cycle');
    const stored = await ReadQueryRows(ctx, BUNDLE, queryOf('ChainC').ID);
    Assert(stored.Dependencies.length === 1 && UUIDsEqual(stored.Dependencies[0].DependsOnQueryID, queryOf('ChainB').ID),
        'QR2: ChainC records its dependency on ChainB');
}

async function checkQr3RebindSelectsReadersOfTheEntity(ctx: IntegrationCheckContext): Promise<void> {
    const companies = requireEntity(ctx, REBIND_ENTITY);
    const result = await RebindQueriesForChangedEntities(refreshContext(ctx), [companies.ID, companies.ID.toLowerCase()]);
    AssertEqual(result.EntityCount, 1, 'QR3: the entity is counted once, however its ID is spelled');
    const fixtureIDs = new Set(ids(QUERY_KEYS).map(NormalizeUUID));
    const refreshed = result.Run.Reports.filter(r => fixtureIDs.has(NormalizeUUID(r.QueryID))).map(r => r.QueryName).sort();
    AssertEqual(refreshed.join(','), `${PREFIX} Drift,${PREFIX} Join`, `QR3: exactly the fixture queries that read ${REBIND_ENTITY} are re-bound`);
    await assertAllReportsReadEntity(ctx, result.Run.Reports, companies.ID);
    AssertEqual(result.Run.Reports.filter(r => r.Outcome !== 'Unchanged').map(r => r.QueryName).join(','), '',
        'QR3: nothing about the entity changed, so every re-bound query is unchanged');
    AssertEqual(result.Drift.length, 0, 'QR3: no definer\'s-rights drift without a new column');
}

/** Every query a re-bind refreshed (fixture or not) reads the entity, by its Query Entities rows. */
async function assertAllReportsReadEntity(ctx: IntegrationCheckContext, reports: readonly QueryRefreshReport[], entityID: string): Promise<void> {
    const provider = RequireQueryDb(ctx.Provider, BUNDLE);
    const links = await provider.RunView<{ QueryID: string }>({
        EntityName: 'MJ: Query Entities', ExtraFilter: `EntityID='${entityID}'`, Fields: ['QueryID'], ResultType: 'simple', BypassCache: true,
    }, ctx.User);
    const readers = new Set(links.Results.map(l => NormalizeUUID(l.QueryID)));
    const strays = reports.filter(r => !readers.has(NormalizeUUID(r.QueryID))).map(r => r.QueryName);
    AssertEqual(strays.join(','), '', 'QR3: a re-bind refreshes only queries that read the changed entity');
}

// ─── QR4: definer's-rights drift ────────────────────────────────────────────

async function checkQr4DefinerRightsDrift(ctx: IntegrationCheckContext): Promise<void> {
    const companies = requireEntity(ctx, REBIND_ENTITY);
    const drift = queryOf('Drift');
    await deleteStoredField(ctx, drift.ID, DRIFT_FIELD);
    const result = await withFieldPermission(ctx, companies, DRIFT_FIELD,
        () => RebindQueriesForChangedEntities(refreshContext(ctx), [companies.ID]));
    const report = result.Run.Reports.find(r => UUIDsEqual(r.QueryID, drift.ID));
    Assert(report !== undefined, 'QR4: the drift query was not re-bound');
    AssertEqual(changeNames(report!, 'Added'), `Fields:${DRIFT_FIELD}`, `QR4: the refresh adds the missing column back (${describeReport(report!)})`);
    const found = result.Drift.find(d => UUIDsEqual(d.QueryID, drift.ID));
    AssertEqual(found?.Fields.join(',') ?? '(no drift)', DRIFT_FIELD, 'QR4: the gained column with field permissions is reported as drift');
    AssertEqual(result.Drift.filter(d => !UUIDsEqual(d.QueryID, drift.ID)).map(d => d.QueryName).join(','), '',
        'QR4: a query without Query Permissions rows is never drift');
    const stored = await ReloadQuery(ctx, drift.ID);
    AssertEqual(stored.ExtractionStatus, 'Warning', 'QR4: the drift is recorded on the query as a Warning');
    Assert((stored.ExtractionMessage ?? '').includes(DefinerRightsDriftMessage([DRIFT_FIELD])),
        `QR4: the message names "${DRIFT_FIELD}", got: ${stored.ExtractionMessage ?? '(none)'}`);
}

/**
 * Runs `work` while one field of `entity` carries an MJ: Entity Field Permissions row (an
 * all-Allow rule for the UI role), with the entity's field-level security left off so nothing is
 * enforced. The row is deleted and the metadata reloaded afterwards, whatever `work` does.
 */
async function withFieldPermission<T>(ctx: IntegrationCheckContext, entity: EntityInfo, fieldName: string, work: () => Promise<T>): Promise<T> {
    const field = entity.Fields.find(f => f.Name === fieldName);
    const role = ctx.Provider.Roles.find(r => r.Name === 'UI');
    if (!field || !role) SkipCheck(`${entity.Name}.${fieldName} or the UI role is missing`);
    Assert(!entity.EnableFieldLevelSecurity, `QR4: ${entity.Name} must have field-level security off, so the rule enforces nothing`);
    const rule = await ctx.Provider.GetEntityObject<MJEntityFieldPermissionEntity>('MJ: Entity Field Permissions', ctx.User);
    rule.NewRecord();
    rule.EntityFieldID = field.ID;
    rule.RoleID = role.ID;
    rule.ReadAccess = 'Allow';
    rule.UpdateAccess = 'Allow';
    rule.CreateAccess = 'Allow';
    if (!await rule.Save()) throw new Error(`QR4: the field permission save failed: ${rule.LatestResult?.CompleteMessage}`);
    requireFixture().FieldRuleIDs.push(rule.ID);
    try {
        await ctx.Provider.Refresh();
        Assert(requireEntity(ctx, entity.Name).Fields.find(f => f.Name === fieldName)?.HasFieldPermissions === true,
            `QR4: ${entity.Name}.${fieldName} must carry field permissions after the metadata reload`);
        return await work();
    } finally {
        await deleteFieldRules(ctx);
    }
}

/**
 * Deletes the field permission rows the bundle created, then reloads the metadata. Never throws.
 * The rows go through fixture SQL: the entity path refuses to delete a field's last Allow rule for
 * a role the system user holds, which is exactly the row this bundle adds.
 */
async function deleteFieldRules(ctx: IntegrationCheckContext): Promise<void> {
    const f = fixture;
    if (!f || f.FieldRuleIDs.length === 0) return;
    try {
        const table = ObjectName(f.Platform, RequireQueryDb(ctx.Provider, BUNDLE).MJCoreSchemaName, 'EntityFieldPermission');
        const list = f.FieldRuleIDs.splice(0).map(id => `'${id}'`).join(',');
        await RunFixtureSQL(ctx, BUNDLE, [`DELETE FROM ${table} WHERE ${ColumnName(f.Platform, 'ID')} IN (${list})`]);
        await ctx.Provider.Refresh();
    } catch (e) {
        console.error(`${BUNDLE}: field permission cleanup warning: ${e instanceof Error ? e.message : String(e)}`);
    }
}

async function deleteStoredField(ctx: IntegrationCheckContext, queryID: string, name: string): Promise<void> {
    const rows = await ReadQueryRows(ctx, BUNDLE, queryID);
    const field = rows.Fields.find(f => f.Name === name);
    if (!field) throw new Error(`QR4: the drift query has no stored ${name} field to remove (fields: ${rows.Fields.map(f => f.Name).join(',')})`);
    if (!await field.Delete()) throw new Error(`QR4: deleting the stored ${name} field failed: ${field.LatestResult?.CompleteMessage}`);
}

// ─── QR5: authorization ─────────────────────────────────────────────────────

function noGrantUser(): UserInfo {
    const user = UserCache.Instance.Users.find(u => u.Email?.toLowerCase() === NOGRANT_EMAIL);
    if (!user) SkipCheck(`the seeded ${NOGRANT_EMAIL} user is not in this database (push metadata-optional/integration-test)`);
    if (user.UserRoles.length > 0) SkipCheck(`${NOGRANT_EMAIL} holds roles here, so it is not a no-grant caller`);
    return user;
}

/** A reader that may read queries but not change them: the no-grant user's identity with only the UI role, in memory. */
function readOnlyUser(ctx: IntegrationCheckContext, base: UserInfo): UserInfo {
    const role = ctx.Provider.Roles.find(r => r.Name === 'UI');
    if (!role) SkipCheck('the UI role is missing, so there is no read-only role to test the bulk refusal with');
    return new UserInfo(ctx.Provider, {
        ID: base.ID, Name: base.Name, Email: base.Email, Type: base.Type, IsActive: true,
        UserRoles: [new UserRoleInfo({ UserID: base.ID, RoleID: role.ID })],
    });
}

/** A report as text with its echoed identifier replaced, so two refusals can be compared. */
function refusalTemplate(report: QueryRefreshReport, label: string): string {
    return JSON.stringify(report).split(label).join('<id>');
}

async function checkQr5UnauthorizedCallerIsRefused(ctx: IntegrationCheckContext): Promise<void> {
    const nogrant = noGrantUser();
    const star = queryOf('Star');
    const missingID = randomUUID().toUpperCase();
    const before = await SnapshotQueryRows(ctx, BUNDLE, [star.ID]);
    for (const dryRun of [false, true]) {
        const existing = await service(ctx, nogrant).RefreshQuery(star.ID, { DryRun: dryRun });
        const missing = await service(ctx, nogrant).RefreshQuery(missingID, { DryRun: dryRun });
        const label = `QR5${dryRun ? ' (dry run)' : ''}`;
        AssertEqual(existing.Outcome, 'Unavailable', `${label}: outcome for an existing query`);
        AssertEqual(existing.Diagnostics.join(' / '), QueryRefreshUnavailableMessage(star.ID), `${label}: the refusal is the not-found wording`);
        AssertEqual(existing.QueryName, '', `${label}: the refusal does not echo the query's name`);
        AssertEqual(refusalTemplate(existing, star.ID), refusalTemplate(missing, missingID),
            `${label}: an existing query's refusal must read exactly like a missing query's`);
    }
    const reader = readOnlyUser(ctx, nogrant);
    const bulk = await service(ctx, reader).RefreshQueries({ QueryIDs: [star.ID] });
    AssertEqual(bulk.Reports.map(r => `${r.QueryName}:${r.Outcome}:${r.Diagnostics.join('/')}`).join(','),
        `${star.Name}:NotPermitted:Skipped: not permitted.`, 'QR5: a bulk refresh skips the query as NotPermitted, with no reason');
    const after = await SnapshotQueryRows(ctx, BUNDLE, [star.ID]);
    Assert(before === after, `QR5: a refused refresh wrote rows: ${SnapshotDifference(before, after)}`);
}

// ─── QR6–QR11: schema changes ───────────────────────────────────────────────

function textType(platform: DatabasePlatform, length: number): string {
    return platform === 'postgresql' ? `character varying(${length})` : `nvarchar(${length})`;
}

async function checkQr6DryRunWritesNothing(ctx: IntegrationCheckContext): Promise<void> {
    await alterTable(ctx, (p, t, c) => `ALTER TABLE ${t} ADD ${c('Extra')} ${p === 'postgresql' ? 'VARCHAR' : 'NVARCHAR'}(30) NULL`);
    const watched = ids(['Star', 'NoUse']);
    const before = await SnapshotQueryRows(ctx, BUNDLE, watched);
    const report = await service(ctx).RefreshQuery(queryOf('Star').ID, { DryRun: true });
    AssertEqual(`${report.Outcome}:${report.DryRun}`, 'Refreshed:true', `QR6: the dry run reports the change (${describeReport(report)})`);
    AssertEqual(changeNames(report, 'Added'), 'Fields:Extra', 'QR6: the dry run reports the new column');
    const after = await SnapshotQueryRows(ctx, BUNDLE, watched);
    Assert(before === after, `QR6: a dry run wrote rows: ${SnapshotDifference(before, after)}`);
}

async function checkQr7AddedColumnReachesStarQuery(ctx: IntegrationCheckContext): Promise<void> {
    const { Platform: platform } = requireFixture();
    const report = await service(ctx).RefreshQuery(queryOf('Star').ID);
    AssertEqual(`${report.Outcome}:${changeNames(report, 'Added')}`, 'Refreshed:Fields:Extra', `QR7: the * query gains the column (${describeReport(report)})`);
    const rows = await ReadQueryRows(ctx, BUNDLE, queryOf('Star').ID);
    AssertEqual(rows.Fields.map(f => `${f.Sequence}:${f.Name}`).join(','), '1:ID,2:Name,3:Code,4:Amount,5:Unused,6:Extra', 'QR7: the new field is last');
    AssertEqual(rows.Fields[5].SQLFullType, textType(platform, 30), 'QR7: the new field\'s type');
    const unaffected = await service(ctx).RefreshQuery(queryOf('NoUse').ID);
    AssertEqual(unaffected.Outcome, 'Unchanged', `QR7: a query naming its columns does not gain it (${describeReport(unaffected)})`);
}

async function checkQr8TypeChangeUpdatesField(ctx: IntegrationCheckContext): Promise<void> {
    const { Platform: platform } = requireFixture();
    await alterTable(ctx, (p, t, c) => p === 'postgresql'
        ? `ALTER TABLE ${t} ALTER COLUMN ${c('Extra')} TYPE VARCHAR(60)`
        : `ALTER TABLE ${t} ALTER COLUMN ${c('Extra')} NVARCHAR(60) NULL`);
    const report = await service(ctx).RefreshQuery(queryOf('Star').ID);
    const update = report.Updated.find(u => u.Collection === 'Fields' && u.Name === 'Extra');
    Assert(update !== undefined && update.ChangedColumns.includes('SQLFullType'), `QR8: the Extra field's type is updated (${describeReport(report)})`);
    const rows = await ReadQueryRows(ctx, BUNDLE, queryOf('Star').ID);
    AssertEqual(rows.Fields.find(f => f.Name === 'Extra')?.SQLFullType ?? null, textType(platform, 60), 'QR8: the stored type follows the column');
}

async function checkQr9DroppingUnusedColumnChangesNothing(ctx: IntegrationCheckContext): Promise<void> {
    await alterTable(ctx, (_p, t, c) => `ALTER TABLE ${t} DROP COLUMN ${c('Unused')}`);
    const named = await service(ctx).RefreshQuery(queryOf('Named').ID);
    AssertEqual(named.Outcome, 'Unchanged', `QR9: a query that does not use the dropped column is unchanged (${describeReport(named)})`);
    const star = await service(ctx).RefreshQuery(queryOf('Star').ID);
    AssertEqual(changeNames(star, 'Removed'), 'Fields:Unused', `QR9: the * query loses the dropped column (${describeReport(star)})`);
}

async function checkQr10DroppingUsedColumnRecordsError(ctx: IntegrationCheckContext): Promise<void> {
    await assertBreakingChangeRecorded(ctx, queryOf('Named'), 'Code', (_p, t, c) => `ALTER TABLE ${t} DROP COLUMN ${c('Code')}`, 'QR10');
}

async function checkQr11RenamingUsedColumnRecordsError(ctx: IntegrationCheckContext): Promise<void> {
    await assertBreakingChangeRecorded(ctx, queryOf('Renamed'), 'Amount', (p, t, c) => p === 'postgresql'
        ? `ALTER TABLE ${t} RENAME COLUMN ${c('Amount')} TO ${c('Total')}`
        : `EXEC sp_rename '${SCHEMA}.${TABLE}.Amount', 'Total', 'COLUMN'`, 'QR11');
}

/**
 * Applies a schema change that breaks a query's SQL, refreshes it, and asserts the refresh
 * recorded `Error` with the server's message naming the column (or object), kept the SQL, and
 * kept the fields.
 */
async function assertBreakingChangeRecorded(ctx: IntegrationCheckContext, query: MJQueryEntityServer, columnName: string,
    change: (platform: DatabasePlatform, t: string, c: (n: string) => string) => string, label: string): Promise<void> {
    const sqlBefore = (await ReloadQuery(ctx, query.ID)).SQL;
    const fieldsBefore = await fieldRows(ctx, query.ID);
    await alterTable(ctx, change);
    const report = await service(ctx).RefreshQuery(query.ID);
    AssertEqual(report.ExtractionStatus, 'Error', `${label}: the refresh reports Error (${describeReport(report)})`);
    const stored = await ReloadQuery(ctx, query.ID);
    const message = stored.ExtractionMessage ?? '';
    AssertEqual(stored.ExtractionStatus, 'Error', `${label}: the query records Error`);
    Assert(message.includes('The database server could not describe the query:') && message.includes(columnName),
        `${label}: the message carries the server's reason naming ${columnName}, got: ${message}`);
    Assert(message.includes('The stored fields were left as they are.'), `${label}: the message says the fields were kept, got: ${message}`);
    AssertEqual(stored.SQL, sqlBefore, `${label}: the SQL is never edited`);
    const fieldsAfter = await fieldRows(ctx, query.ID);
    Assert(fieldsBefore === fieldsAfter, `${label}: the stored fields are kept: ${SnapshotDifference(fieldsBefore, fieldsAfter)}`);
}

// ─── QR12: a stored composition cycle ───────────────────────────────────────

/**
 * Two queries whose stored dependency rows point at each other (a cycle a save would refuse, as
 * rows written before that rule existed could hold) are each refreshed once, and the cycle is
 * reported once. Their SQL composes nothing, so the refresh removes the stale rows.
 */
async function checkQr12CycleReportedOnce(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const sql = ForPlatform('SELECT i.[ID] FROM mjit_rebind.[Item] i', f.Platform);
    const x = await CreateFixtureQuery(ctx, f.Category.ID, { Name: `${PREFIX} CycleX`, SQL: sql, Reusable: true });
    const y = await CreateFixtureQuery(ctx, f.Category.ID, { Name: `${PREFIX} CycleY`, SQL: sql, Reusable: true });
    const links = [await storeDependency(ctx, x.ID, y.ID), await storeDependency(ctx, y.ID, x.ID)];
    try {
        const run = await service(ctx).RefreshQueries({ QueryIDs: [x.ID, y.ID] });
        AssertEqual(run.Reports.map(r => r.QueryName).sort().join(','), `${x.Name},${y.Name}`, 'QR12: each query in the cycle is refreshed exactly once');
        AssertEqual(run.Cycles.map(c => [...c].sort().join('+')).join(' | '), `${x.Name}+${y.Name}`, 'QR12: the cycle is reported once, naming both queries');
        for (const report of run.Reports) {
            AssertEqual(changeNames(report, 'Removed'), 'Dependencies:legacy-cycle', `QR12: ${report.QueryName} drops the stale dependency row`);
        }
    } finally {
        for (const link of links) await link.Delete().catch(() => false);
    }
}

async function storeDependency(ctx: IntegrationCheckContext, queryID: string, dependsOnID: string): Promise<MJQueryDependencyEntity> {
    const row = await ctx.Provider.GetEntityObject<MJQueryDependencyEntity>('MJ: Query Dependencies', ctx.User);
    row.NewRecord();
    row.QueryID = queryID;
    row.DependsOnQueryID = dependsOnID;
    row.ReferencePath = 'legacy-cycle';
    row.DetectionMethod = 'Manual';
    if (!await row.Save()) throw new Error(`QR12: the stored dependency row was refused: ${row.LatestResult?.CompleteMessage}`);
    return row;
}

// ─── QR13–QR14: a dropped view, a nullability change ────────────────────────

/** A view over the table is dropped: the query over it records Error with the server's message; SQL and fields are kept. */
async function checkQr13DroppedViewRecordsError(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const view = ObjectName(f.Platform, SCHEMA, VIEW);
    const c = (n: string) => ColumnName(f.Platform, n);
    await RunFixtureSQL(ctx, BUNDLE, [`CREATE VIEW ${view} AS SELECT ${c('ID')}, ${c('Name')} FROM ${table(f.Platform)}`]);
    const query = await CreateFixtureQuery(ctx, f.Category.ID, {
        Name: `${PREFIX} OverView`, SQL: ForPlatform(`SELECT v.[ID], v.[Name] FROM mjit_rebind.[${VIEW}] v`, f.Platform),
    });
    AssertEqual((await ReadQueryRows(ctx, BUNDLE, query.ID)).Fields.map(x => x.Name).join(','), 'ID,Name', 'QR13: the query over the view is described');
    await assertBreakingChangeRecorded(ctx, query, VIEW, () => `DROP VIEW ${view}`, 'QR13');
}

/** `ChangedColumns` of the one update a report holds for field `name`, sorted, or why there is none. */
function fieldUpdateColumns(report: QueryRefreshReport, name: string): string {
    const updates = report.Updated.filter(u => u.Collection === 'Fields' && u.Name === name);
    if (updates.length !== 1) return `(${updates.length} updates of ${name}: ${describeReport(report)})`;
    return [...updates[0].ChangedColumns].sort().join(',');
}

/**
 * A column goes from NULL to NOT NULL and changes type: the refresh updates the field's
 * IsNullable and SQLFullType and reports both. Then, on SQL Server, a stored IsNullable of NULL
 * (as written on a platform whose describe does not report nullability) is corrected to `false`
 * and reported, although the entity's dirty check reads NULL and `false` alike. PostgreSQL's
 * statement describe reports no nullability (IsNullable stays NULL there), so on PostgreSQL only
 * the type change is asserted.
 */
async function checkQr14NullabilityChange(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const sqlServer = f.Platform !== 'postgresql';
    const query = await CreateFixtureQuery(ctx, f.Category.ID, { Name: `${PREFIX} Nullability`, SQL: ForPlatform('SELECT i.[ID], i.[Extra] FROM mjit_rebind.[Item] i', f.Platform) });
    AssertEqual(await extraFacts(ctx, query.ID), `${textType(f.Platform, 60)}:${sqlServer ? 'true' : 'null'}`, 'QR14: Extra before the change');
    await alterTable(ctx, (p, t, c) => p === 'postgresql'
        ? `ALTER TABLE ${t} ALTER COLUMN ${c('Extra')} TYPE VARCHAR(80), ALTER COLUMN ${c('Extra')} SET NOT NULL`
        : `ALTER TABLE ${t} ALTER COLUMN ${c('Extra')} NVARCHAR(80) NOT NULL`);
    const report = await service(ctx).RefreshQuery(query.ID);
    AssertEqual(fieldUpdateColumns(report, 'Extra'), sqlServer ? 'IsNullable,SQLFullType' : 'SQLFullType', 'QR14: the report names the changed columns');
    AssertEqual(await extraFacts(ctx, query.ID), `${textType(f.Platform, 80)}:${sqlServer ? 'false' : 'null'}`, 'QR14: Extra after the change');
    if (!sqlServer) return;
    const field = (await ReadQueryRows(ctx, BUNDLE, query.ID)).Fields.find(x => x.Name === 'Extra');
    await RunFixtureSQL(ctx, BUNDLE, [`UPDATE ${ObjectName(f.Platform, coreSchema(ctx), 'QueryField')} SET IsNullable = NULL WHERE ID = '${field?.ID ?? ''}'`]);
    const corrected = await service(ctx).RefreshQuery(query.ID);
    AssertEqual(fieldUpdateColumns(corrected, 'Extra'), 'IsNullable', 'QR14: a stored NULL nullability is corrected to false and reported');
    AssertEqual(await extraFacts(ctx, query.ID), `${textType(f.Platform, 80)}:false`, 'QR14: Extra after the correction');
}

/** `SQLFullType:IsNullable` of the stored Extra field. */
async function extraFacts(ctx: IntegrationCheckContext, queryID: string): Promise<string> {
    const extra = (await ReadQueryRows(ctx, BUNDLE, queryID)).Fields.find(x => x.Name === 'Extra');
    return extra ? `${extra.SQLFullType}:${String(extra.IsNullable)}` : '(no Extra field)';
}

function coreSchema(ctx: IntegrationCheckContext): string {
    return RequireQueryDb(ctx.Provider, BUNDLE).MJCoreSchemaName;
}

// ─── QR15: a deleted entity field ───────────────────────────────────────────

function deleteProbeFieldStatement(ctx: IntegrationCheckContext, platform: DatabasePlatform): string {
    return `DELETE FROM ${ObjectName(platform, coreSchema(ctx), 'EntityField')} WHERE ${ColumnName(platform, 'ID')} = '${PROBE_FIELD_ID}'`;
}

/** Adds the probe field to `entityID`, at the next free Sequence (computed when the row is written). */
function insertProbeFieldStatement(ctx: IntegrationCheckContext, platform: DatabasePlatform, entityID: string): string {
    const t = ObjectName(platform, coreSchema(ctx), 'EntityField');
    const c = (n: string) => ColumnName(platform, n);
    return `INSERT INTO ${t} (${c('ID')}, ${c('EntityID')}, ${c('Name')}, ${c('Type')}, ${c('Sequence')}) ` +
        `SELECT '${PROBE_FIELD_ID}', '${entityID}', '${PROBE_FIELD_NAME}', 'nvarchar', COALESCE(MAX(${c('Sequence')}), 0) + 1 FROM ${t} WHERE ${c('EntityID')} = '${entityID}'`;
}

/** The delete rule of QueryField's SourceEntityFieldID foreign key, from the catalog: `SET NULL` or what it is. */
async function sourceFieldDeleteRule(ctx: IntegrationCheckContext, platform: DatabasePlatform): Promise<string> {
    const sql = platform === 'postgresql'
        ? `SELECT CASE confdeltype WHEN 'n' THEN 'SET NULL' ELSE confdeltype::text END AS "Rule" FROM pg_constraint WHERE conname = 'FK_QueryField_SourceEntityField'`
        : `SELECT CASE delete_referential_action WHEN 2 THEN 'SET NULL' ELSE delete_referential_action_desc END AS [Rule] FROM sys.foreign_keys WHERE name = 'FK_QueryField_SourceEntityField'`;
    const rows = await RequireQueryDb(ctx.Provider, BUNDLE).ExecuteSQL<{ Rule: string }>(sql, undefined, { description: `${BUNDLE} catalog` }, ctx.User);
    return rows.map(r => r.Rule).join(',');
}

/**
 * Deleting the entity field a query field's SourceEntityFieldID points at clears the link (the
 * foreign key is ON DELETE SET NULL, read from the catalog and seen to act), and a re-bind of the
 * entity links the field to its source again. A disposable MJ: Entity Fields row stands in for the
 * dropped column, removed in a `finally` (and by Teardown), so no real metadata changes; the delete
 * runs as fixture SQL because a CodeGen column drop cannot be used here (it fails on the
 * (EntityID, Sequence) unique index when it renumbers the remaining fields).
 */
async function checkQr15DeletedEntityFieldIsCleared(ctx: IntegrationCheckContext): Promise<void> {
    const f = requireFixture();
    const companies = requireEntity(ctx, REBIND_ENTITY);
    const nameField = companies.Fields.find(x => x.Name === 'Name');
    Assert(nameField !== undefined, `QR15: ${REBIND_ENTITY}.Name is missing`);
    AssertEqual(await sourceFieldDeleteRule(ctx, f.Platform), 'SET NULL', 'QR15: FK_QueryField_SourceEntityField is ON DELETE SET NULL');
    const join = queryOf('Join');
    const before = (await ReadQueryRows(ctx, BUNDLE, join.ID)).Fields.find(x => x.Name === 'CompanyName');
    Assert(before !== undefined && UUIDsEqual(before.SourceEntityFieldID, nameField!.ID), 'QR15: CompanyName is bound to MJ: Companies.Name before the change');
    const queryField = ObjectName(f.Platform, coreSchema(ctx), 'QueryField');
    const c = (n: string) => ColumnName(f.Platform, n);
    try {
        await RunFixtureSQL(ctx, BUNDLE, [insertProbeFieldStatement(ctx, f.Platform, companies.ID),
            `UPDATE ${queryField} SET ${c('SourceEntityFieldID')} = '${PROBE_FIELD_ID}' WHERE ${c('ID')} = '${before!.ID}'`,
            deleteProbeFieldStatement(ctx, f.Platform)]);
    } finally {
        await RunFixtureSQLQuietly(ctx, BUNDLE, [deleteProbeFieldStatement(ctx, f.Platform)]);
    }
    const cleared = (await ReadQueryRows(ctx, BUNDLE, join.ID)).Fields.find(x => x.Name === 'CompanyName');
    AssertEqual(`${cleared?.SourceEntityFieldID ?? 'null'}:${NormalizeUUID(cleared?.SourceEntityID ?? '')}`, `null:${NormalizeUUID(companies.ID)}`,
        'QR15: deleting the entity field nulled SourceEntityFieldID and nothing else');
    const result = await RebindQueriesForChangedEntities(refreshContext(ctx), [companies.ID]);
    const report = result.Run.Reports.find(r => UUIDsEqual(r.QueryID, join.ID));
    Assert(report !== undefined, 'QR15: the re-bind did not refresh the Join query');
    AssertEqual(fieldUpdateColumns(report!, 'CompanyName'), 'SourceEntityFieldID', 'QR15: the re-bind reports the re-linked source');
    const relinked = (await ReadQueryRows(ctx, BUNDLE, join.ID)).Fields.find(x => x.Name === 'CompanyName');
    Assert(relinked !== undefined && UUIDsEqual(relinked.SourceEntityFieldID, nameField!.ID), 'QR15: CompanyName is bound to MJ: Companies.Name again');
}

// ─── QR16: partial CRUD is refused like no grant ────────────────────────────

/**
 * A caller who may read MJ: Queries but not update it (the UI role) is refused exactly like a
 * caller with no grant: a single refresh, dry run included, reads like a missing query's refusal;
 * a bulk run reports the query NotPermitted and a missing ID Unavailable. Nothing is written.
 */
async function checkQr16ReadOnlyCallerIsRefused(ctx: IntegrationCheckContext): Promise<void> {
    const reader = readOnlyUser(ctx, noGrantUser());
    const queries = requireEntity(ctx, 'MJ: Queries').GetUserPermisions(reader);
    AssertEqual(`${String(queries?.CanRead)}:${String(queries?.CanUpdate)}`, 'true:false', 'QR16: the reader may read MJ: Queries but not update it');
    const star = queryOf('Star');
    const missingID = randomUUID().toUpperCase();
    const before = await SnapshotQueryRows(ctx, BUNDLE, [star.ID]);
    for (const dryRun of [false, true]) {
        const label = `QR16${dryRun ? ' (dry run)' : ''}`;
        const existing = await service(ctx, reader).RefreshQuery(star.ID, { DryRun: dryRun });
        const missing = await service(ctx, reader).RefreshQuery(missingID, { DryRun: dryRun });
        AssertEqual(`${existing.Outcome}:${existing.QueryName}:${existing.Diagnostics.join(' / ')}`, `Unavailable::${QueryRefreshUnavailableMessage(star.ID)}`,
            `${label}: the refusal is the not-found wording`);
        AssertEqual(refusalTemplate(existing, star.ID), refusalTemplate(missing, missingID), `${label}: an existing query's refusal must read exactly like a missing query's`);
    }
    const bulk = await service(ctx, reader).RefreshQueries({ QueryIDs: [star.ID, missingID] });
    AssertEqual(bulk.Reports.map(r => `${r.QueryName}:${r.Outcome}:${r.Diagnostics.join('/')}`).sort().join(' | '),
        [`:Unavailable:${QueryRefreshUnavailableMessage(missingID)}`, `${star.Name}:NotPermitted:Skipped: not permitted.`].sort().join(' | '),
        'QR16: in bulk the readable query is NotPermitted with no reason, and the missing ID is Unavailable');
    const after = await SnapshotQueryRows(ctx, BUNDLE, [star.ID]);
    Assert(before === after, `QR16: a refused refresh wrote rows: ${SnapshotDifference(before, after)}`);
}

export const QueryRefreshChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.QR1`, Name: 'QR1: refreshing queries whose facts match is Unchanged and writes no row', Fn: checkQr1UnchangedRefreshWritesNothing },
    { Id: `${BUNDLE}.QR2`, Name: 'QR2: a bulk refresh refreshes a composed query before the queries composing it', Fn: checkQr2DependenciesFirst },
    { Id: `${BUNDLE}.QR3`, Name: 'QR3: a re-bind refreshes exactly the queries that read the changed entity', Fn: checkQr3RebindSelectsReadersOfTheEntity },
    { Id: `${BUNDLE}.QR4`, Name: "QR4: a definer's-rights query that gains a column with field permissions is recorded as a Warning naming it", Fn: checkQr4DefinerRightsDrift },
    { Id: `${BUNDLE}.QR5`, Name: 'QR5: a caller without the refresh grants gets the not-found refusal for an existing query, and NotPermitted in bulk', Fn: checkQr5UnauthorizedCallerIsRefused },
    { Id: `${BUNDLE}.QR6`, Name: 'QR6: a dry run reports an added column and writes nothing', Fn: checkQr6DryRunWritesNothing },
    { Id: `${BUNDLE}.QR7`, Name: 'QR7: an added column reaches the SELECT * query and no other', Fn: checkQr7AddedColumnReachesStarQuery },
    { Id: `${BUNDLE}.QR8`, Name: 'QR8: a column type change updates the field type', Fn: checkQr8TypeChangeUpdatesField },
    { Id: `${BUNDLE}.QR9`, Name: 'QR9: dropping a column a query does not use leaves it unchanged', Fn: checkQr9DroppingUnusedColumnChangesNothing },
    { Id: `${BUNDLE}.QR10`, Name: "QR10: dropping a used column records Error with the server's message and keeps the SQL and fields", Fn: checkQr10DroppingUsedColumnRecordsError },
    { Id: `${BUNDLE}.QR11`, Name: "QR11: renaming a used column records Error with the server's message and keeps the SQL and fields", Fn: checkQr11RenamingUsedColumnRecordsError },
    { Id: `${BUNDLE}.QR12`, Name: 'QR12: queries whose stored dependencies form a cycle are each refreshed once, and the cycle is reported once', Fn: checkQr12CycleReportedOnce },
    { Id: `${BUNDLE}.QR13`, Name: "QR13: dropping the view a query reads records Error with the server's message and keeps the SQL and fields", Fn: checkQr13DroppedViewRecordsError },
    { Id: `${BUNDLE}.QR14`, Name: 'QR14: a column going NOT NULL with a type change updates IsNullable and the type, and reports both', Fn: checkQr14NullabilityChange },
    { Id: `${BUNDLE}.QR15`, Name: 'QR15: deleting the entity field a query field points at nulls the link (ON DELETE SET NULL); a re-bind re-links it', Fn: checkQr15DeletedEntityFieldIsCleared },
    { Id: `${BUNDLE}.QR16`, Name: 'QR16: a caller who may read but not update MJ: Queries is refused like a caller with no grant, single and bulk', Fn: checkQr16ReadOnlyCallerIsRefused },
];

for (const check of QueryRefreshChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
