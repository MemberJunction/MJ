/**
 * list-from-query.checks.ts — the 'list-from-query' bundle (LQ1–LQ5): live integration checks for
 * making a list from SQL written in a conversation, against the real database and the real server
 * entity subclasses. This is the work the Create List From Query action delegates to.
 *
 *   - LQ1: the SQL is saved as a Pending query in the user's own subcategory of "User Lists"
 *   - LQ2: saving again under the same name picks an unused one in the same category
 *   - LQ3: making a list from the saved query links the list to it, fills it and takes its fingerprint
 *   - LQ4: the list refreshes from the query while the query is still Pending
 *   - LQ5: editing the query's SQL stops the refresh with SOURCE_CHANGED and applies nothing
 *
 * The action's own checks on caller SQL (the host's ad-hoc SQL authorizer and the read-only login)
 * need MJServer, which this headless process doesn't start; they are the shared Run Ad-hoc Query
 * checks and are covered by unit tests.
 *
 * Deterministic (no model calls). The lifecycle saves two `MJ: Queries` rows on `MJ: Roles` and one
 * `MJ: Lists` row, and deletes them afterwards, with the user's User Lists category if this run created
 * it. The checks are ordered: each builds on the state the last left.
 */
import { DatabaseProviderBase, RunView } from '@memberjunction/core';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJListDetailEntity, MJListEntity, MJQueryCategoryEntity, MJQueryEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { ListOperations, USER_LISTS_QUERY_CATEGORY_ID, UserListQueries } from '@memberjunction/lists';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, ListFromQueryFixture } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const QUERY_NAME = `Roles for a list ${FIXTURE_TAG}`;

function fx(ctx: IntegrationCheckContext): ListFromQueryFixture {
    Assert(ctx.ListFromQueryFixture != null, 'list-from-query fixture missing (bundle Setup did not run)');
    return ctx.ListFromQueryFixture!;
}

function rolesEntity(md: IMetadataProvider): EntityInfo {
    const roles = md.EntityByName('MJ: Roles');
    Assert(roles != null, "entity 'MJ: Roles' not found");
    return roles!;
}

/**
 * Every role's ID, read from the entity's base view: what a conversation's SQL would return.
 * Quoted by the provider so the same fixture runs on SQL Server and PostgreSQL.
 */
function rolesSQL(md: IMetadataProvider, where = ''): string {
    Assert(md instanceof DatabaseProviderBase, 'list-from-query runs on the server transport and needs the database provider');
    const db = md as DatabaseProviderBase;
    const roles = rolesEntity(md);
    return `SELECT ${db.QuoteIdentifier('ID')} FROM ${db.QuoteSchemaAndView(roles.SchemaName, roles.BaseView)}${where}`;
}

async function loadQuery(md: IMetadataProvider, user: UserInfo, id: string): Promise<MJQueryEntity> {
    const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
    Assert(await query.Load(id), `query ${id} did not load`);
    return query;
}

async function loadList(md: IMetadataProvider, user: UserInfo, id: string): Promise<MJListEntity> {
    const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', user);
    Assert(await list.Load(id), `list ${id} did not load`);
    return list;
}

async function userCategoryID(user: UserInfo): Promise<string | null> {
    const result = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: Query Categories',
        ExtraFilter: `ParentID='${USER_LISTS_QUERY_CATEGORY_ID}' AND UserID='${user.ID}'`,
        Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(result.Success, `category lookup failed: ${result.ErrorMessage}`);
    return result.Results[0]?.ID ?? null;
}

async function memberCount(user: UserInfo, listID: string): Promise<number> {
    const result = await new RunView().RunView({
        EntityName: 'MJ: List Details', ExtraFilter: `ListID='${listID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(result.Success, `member count failed: ${result.ErrorMessage}`);
    return result.Results.length;
}

async function roleCount(user: UserInfo): Promise<number> {
    const result = await new RunView().RunView({
        EntityName: 'MJ: Roles', Fields: ['ID'], ResultType: 'simple', BypassCache: true, IgnoreMaxRows: true,
    }, user);
    Assert(result.Success, `role count failed: ${result.ErrorMessage}`);
    return result.Results.length;
}

export const ListFromQueryChecks: NamedCheck[] = [
    {
        Id: 'list-from-query.LQ1',
        Name: "LQ1: conversation SQL is saved as a Pending query in the user's User Lists category",
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const saved = await new UserListQueries(ctx.User, ctx.Provider).SaveAsync({
                Name: QUERY_NAME, SQL: rolesSQL(ctx.Provider), Description: 'Fixture for the list-from-query bundle — safe to delete',
            });
            Assert('QueryID' in saved, `the query was not saved: ${'Reason' in saved ? saved.Reason : ''}`);
            if (!('QueryID' in saved)) return;
            f.QueryIDs.push(saved.QueryID);
            AssertEqual(saved.QueryName, QUERY_NAME, 'saved query name');

            const query = await loadQuery(ctx.Provider, ctx.User, saved.QueryID);
            AssertEqual(query.Status, 'Pending', 'saved query status');
            f.CategoryID = await userCategoryID(ctx.User);
            Assert(f.CategoryID != null, "no User Lists category for the user after saving");
            Assert(UUIDsEqual(query.CategoryID, f.CategoryID), "the query is not in the user's User Lists category");
            const category = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', ctx.User);
            Assert(await category.Load(f.CategoryID!), 'category did not load');
            Assert(UUIDsEqual(category.UserID, ctx.User.ID), 'the category is not owned by the user');
        },
    },
    {
        Id: 'list-from-query.LQ2',
        Name: 'LQ2: saving under a name already used picks an unused one in the same category',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const saved = await new UserListQueries(ctx.User, ctx.Provider).SaveAsync({ Name: QUERY_NAME, SQL: rolesSQL(ctx.Provider) });
            Assert('QueryID' in saved, `the second query was not saved: ${'Reason' in saved ? saved.Reason : ''}`);
            if (!('QueryID' in saved)) return;
            f.QueryIDs.push(saved.QueryID);
            AssertEqual(saved.QueryName, `${QUERY_NAME} (2)`, 'second query name');
            Assert(UUIDsEqual((await loadQuery(ctx.Provider, ctx.User, saved.QueryID)).CategoryID, f.CategoryID), 'the second query is in another category');
        },
    },
    {
        Id: 'list-from-query.LQ3',
        Name: 'LQ3: a list made from the saved query is linked to it, filled, and takes its fingerprint',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const result = await new ListOperations(ctx.User, ctx.Provider).MaterializeFromQuery(f.QueryIDs[0], {
                ListName: `List from query ${FIXTURE_TAG}`, EntityName: 'MJ: Roles', KeyField: 'ID', RefreshMode: 'Sync',
            });
            Assert(result.Success, `making the list failed: ${result.ResultCode} ${result.Message}`);
            f.ListID = result.CreatedListId ?? null;
            Assert(f.ListID != null, 'no CreatedListId');

            const list = await loadList(ctx.Provider, ctx.User, f.ListID!);
            Assert(UUIDsEqual(list.SourceQueryID, f.QueryIDs[0]), 'the list is not linked to the saved query');
            AssertEqual(list.SourceQueryKeyField, 'ID', 'list SourceQueryKeyField');
            AssertEqual(list.RefreshMode, 'Sync', 'list RefreshMode');
            Assert(!!list.SourceFingerprint && list.SourceFingerprint.length >= 16, 'the list took no fingerprint');
            Assert(list.LastRefreshedAt != null, 'LastRefreshedAt not set by the first fill');
            AssertEqual(await memberCount(ctx.User, f.ListID!), await roleCount(ctx.User), 'members after making the list');
        },
    },
    {
        Id: 'list-from-query.LQ4',
        Name: 'LQ4: the list refreshes from its query while the query is still Pending',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            AssertEqual((await loadQuery(ctx.Provider, ctx.User, f.QueryIDs[0])).Status, 'Pending', 'query status before the refresh');
            const result = await new ListOperations(ctx.User, ctx.Provider).RefreshFromSource(f.ListID!, undefined, { ConfirmDrops: true });
            Assert(result.Success, `refresh failed: ${result.ResultCode} ${result.Message}`);
            AssertEqual(await memberCount(ctx.User, f.ListID!), await roleCount(ctx.User), 'members after the refresh');
            // A refresh runs a draft without approving it; requiring Approved would break every chat-made list.
            AssertEqual((await loadQuery(ctx.Provider, ctx.User, f.QueryIDs[0])).Status, 'Pending', 'query status after the refresh');
        },
    },
    {
        Id: 'list-from-query.LQ5',
        Name: "LQ5: editing the query's SQL stops the refresh with SOURCE_CHANGED",
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const query = await loadQuery(ctx.Provider, ctx.User, f.QueryIDs[0]);
            query.SQL = rolesSQL(ctx.Provider, ' WHERE 1 = 0');
            Assert(await query.Save(), `query edit failed: ${query.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            const membersBefore = await memberCount(ctx.User, f.ListID!);
            const result = await new ListOperations(ctx.User, ctx.Provider).RefreshFromSource(f.ListID!, undefined, { ConfirmDrops: true });
            AssertEqual(result.ResultCode, 'SOURCE_CHANGED', 'refresh result after the edit');
            AssertEqual(result.SourceChange?.SourceKind, 'query', 'changed source kind');
            AssertEqual(await memberCount(ctx.User, f.ListID!), membersBefore, 'members after a stopped refresh');
        },
    },
];

for (const check of ListFromQueryChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

async function deleteListAndMembers(md: IMetadataProvider, user: UserInfo, listID: string): Promise<void> {
    const details = await new RunView().RunView<{ ID: string }>({
        EntityName: 'MJ: List Details', ExtraFilter: `ListID='${listID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, user);
    for (const row of details.Results ?? []) {
        const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', user);
        if (await detail.Load(row.ID)) await detail.Delete().catch(() => undefined);
    }
    const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', user);
    if (await list.Load(listID)) await list.Delete().catch(() => undefined);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('list-from-query', {
    Setup: async (ctx: IntegrationCheckContext) => {
        const existing = await userCategoryID(ctx.User);
        ctx.ListFromQueryFixture = { QueryIDs: [], ListID: null, CategoryID: existing, CreatedCategory: existing == null };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.ListFromQueryFixture;
        if (!f) return;
        const md = ctx.Provider;
        const user = ctx.User;
        if (f.ListID) await deleteListAndMembers(md, user, f.ListID);
        for (const id of f.QueryIDs) {
            const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', user);
            if (await query.Load(id)) await query.Delete().catch(() => undefined);
        }
        if (f.CreatedCategory && f.CategoryID) {
            const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', user);
            if (await category.Load(f.CategoryID)) await category.Delete().catch(() => undefined);
        }
        ctx.ListFromQueryFixture = undefined;
    },
});
