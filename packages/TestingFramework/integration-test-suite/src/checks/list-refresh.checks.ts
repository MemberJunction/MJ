/**
 * list-refresh.checks.ts — the 'list-refresh' bundle (LR1–LR7): live integration checks for refreshing
 * a list from its source, against the real database and the real server entity subclasses.
 *
 *   - LR1: saving a User View stamps its DefinitionFingerprint
 *   - LR2: linking a list to the view fills it straight away, takes the view's fingerprint, and audits the refresh
 *   - LR3: turning on Refresh automatically creates an active User Routine that runs the refresh action
 *   - LR4: after the view's filter changes, preview and refresh apply nothing and return SOURCE_CHANGED,
 *          and the routine is paused with a "List Source Changed" audit row
 *   - LR5: approving the change stores the new fingerprint, resumes the routine and refreshes in Sync mode
 *   - LR6: turning Refresh automatically off disables the routine but keeps it
 *   - LR7: deleting the list deletes its routine
 *
 * Deterministic (no model calls). The lifecycle creates one throwaway `MJ: User Views` row on `MJ: Roles`
 * and one `MJ: Lists` row (tagged "(mj-integration-test — safe to delete)"), and deletes them, with any
 * members and the routine, afterwards. The checks are ordered: each builds on the state the last left.
 *
 * Previews sign a delta token (refreshes don't). MJAPI reads its secret from MJ_LIST_DELTA_SECRET; when
 * this headless process has none, Setup installs a random one for the run and Teardown removes it.
 */
import { RunView } from '@memberjunction/core';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJListEntity, MJListDetailEntity, MJUserRoutineEntity, MJUserViewEntity } from '@memberjunction/core-entities';
import { randomBytes } from 'node:crypto';
import { ListOperations, SetDeltaTokenSecret } from '@memberjunction/lists';
import { Assert, AssertEqual } from '@memberjunction/testing-integration';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext, ListRefreshFixture } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';
const ALL_ROLES_FILTER = 'Name IS NOT NULL';
const NO_ROLES_FILTER = 'Name IS NOT NULL AND 1 = 0';

function fx(ctx: IntegrationCheckContext): ListRefreshFixture {
    Assert(ctx.ListRefreshFixture != null, 'list-refresh fixture missing (bundle Setup did not run)');
    return ctx.ListRefreshFixture!;
}

async function loadList(md: IMetadataProvider, user: UserInfo, id: string): Promise<MJListEntity> {
    const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', user);
    Assert(await list.Load(id), `list ${id} did not load`);
    return list;
}

async function loadView(md: IMetadataProvider, user: UserInfo, id: string): Promise<MJUserViewEntity> {
    const view = await md.GetEntityObject<MJUserViewEntity>('MJ: User Views', user);
    Assert(await view.Load(id), `view ${id} did not load`);
    return view;
}

async function loadRoutine(md: IMetadataProvider, user: UserInfo, id: string): Promise<MJUserRoutineEntity | null> {
    const routine = await md.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', user);
    return (await routine.Load(id)) ? routine : null;
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
        EntityName: 'MJ: Roles', ExtraFilter: ALL_ROLES_FILTER, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(result.Success, `role count failed: ${result.ErrorMessage}`);
    return result.Results.length;
}

async function auditTypes(user: UserInfo, listID: string): Promise<string[]> {
    const result = await new RunView().RunView<{ AuditLogType: string }>({
        EntityName: 'MJ: Audit Logs', ExtraFilter: `RecordID='${listID}'`, Fields: ['AuditLogType'],
        OrderBy: '__mj_CreatedAt', ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(result.Success, `audit lookup failed: ${result.ErrorMessage}`);
    return result.Results.map((r) => r.AuditLogType);
}

async function saveView(view: MJUserViewEntity, whereClause: string): Promise<void> {
    view.WhereClause = whereClause;
    Assert(await view.Save(), `view save failed: ${view.LatestResult?.CompleteMessage ?? 'unknown error'}`);
}

export const ListRefreshChecks: NamedCheck[] = [
    {
        Id: 'list-refresh.LR1',
        Name: 'LR1: saving a User View stamps its DefinitionFingerprint',
        Fn: async (ctx: IntegrationCheckContext) => {
            const view = await loadView(ctx.Provider, ctx.User, fx(ctx).ViewID);
            Assert(!!view.DefinitionFingerprint && view.DefinitionFingerprint.length >= 16, 'view has no DefinitionFingerprint after save');
        },
    },
    {
        Id: 'list-refresh.LR2',
        Name: 'LR2: linking a source fills the list, takes the fingerprint and audits the refresh',
        Fn: async (ctx: IntegrationCheckContext) => {
            const { ListID, ViewID } = fx(ctx);
            const list = await loadList(ctx.Provider, ctx.User, ListID);
            list.SourceViewID = ViewID;
            Assert(await list.Save(), `linking the view failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            AssertEqual(await memberCount(ctx.User, ListID), await roleCount(ctx.User), 'members after linking');
            const view = await loadView(ctx.Provider, ctx.User, ViewID);
            const reloaded = await loadList(ctx.Provider, ctx.User, ListID);
            AssertEqual(reloaded.SourceFingerprint, view.DefinitionFingerprint, 'list fingerprint after its first refresh');
            Assert((await auditTypes(ctx.User, ListID)).includes('List Refreshed'), 'no List Refreshed audit row');
        },
    },
    {
        Id: 'list-refresh.LR3',
        Name: 'LR3: Refresh automatically creates an active routine that runs the refresh action',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const list = await loadList(ctx.Provider, ctx.User, f.ListID);
            list.AutoRefresh = true;
            list.RefreshMode = 'Sync';
            Assert(await list.Save(), `turning on Refresh automatically failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);

            const reloaded = await loadList(ctx.Provider, ctx.User, f.ListID);
            Assert(!!reloaded.RefreshRoutineID, 'no RefreshRoutineID after turning on Refresh automatically');
            f.RoutineID = reloaded.RefreshRoutineID;
            const routine = await loadRoutine(ctx.Provider, ctx.User, f.RoutineID!);
            Assert(routine != null, 'routine did not load');
            AssertEqual(routine!.Status, 'Active', 'routine status');
            AssertEqual(routine!.TargetType, 'Action', 'routine target type');
            AssertEqual(JSON.parse(routine!.StartingPayload ?? '{}').ListID, f.ListID, 'routine payload ListID');
        },
    },
    {
        Id: 'list-refresh.LR4',
        Name: 'LR4: a changed source stops preview and refresh and pauses the routine',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const view = await loadView(ctx.Provider, ctx.User, f.ViewID);
            const before = view.DefinitionFingerprint;
            await saveView(view, NO_ROLES_FILTER);
            Assert((await loadView(ctx.Provider, ctx.User, f.ViewID)).DefinitionFingerprint !== before, 'fingerprint did not change with the filter');

            const membersBefore = await memberCount(ctx.User, f.ListID);
            const ops = new ListOperations(ctx.User, ctx.Provider);
            AssertEqual((await ops.PreviewRefreshFromSource(f.ListID)).ResultCode, 'SOURCE_CHANGED', 'preview result');
            AssertEqual((await loadRoutine(ctx.Provider, ctx.User, f.RoutineID!))?.Status, 'Active', 'a preview must not pause the routine');

            const result = await ops.RefreshFromSource(f.ListID, undefined, { ConfirmDrops: true });
            AssertEqual(result.ResultCode, 'SOURCE_CHANGED', 'refresh result');
            AssertEqual(await memberCount(ctx.User, f.ListID), membersBefore, 'members after a stopped refresh');
            AssertEqual((await loadRoutine(ctx.Provider, ctx.User, f.RoutineID!))?.Status, 'Paused', 'routine after the source changed');
            Assert((await auditTypes(ctx.User, f.ListID)).includes('List Source Changed'), 'no List Source Changed audit row');
        },
    },
    {
        Id: 'list-refresh.LR5',
        Name: 'LR5: approving the change stores the new fingerprint, resumes the routine and refreshes',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const result = await new ListOperations(ctx.User, ctx.Provider).ApproveListSource(f.ListID, { ConfirmDrops: true });
            Assert(result.Success, `approval failed: ${result.ResultCode} ${result.Message}`);

            const view = await loadView(ctx.Provider, ctx.User, f.ViewID);
            AssertEqual((await loadList(ctx.Provider, ctx.User, f.ListID)).SourceFingerprint, view.DefinitionFingerprint, 'fingerprint after approval');
            AssertEqual((await loadRoutine(ctx.Provider, ctx.User, f.RoutineID!))?.Status, 'Active', 'routine after approval');
            AssertEqual(await memberCount(ctx.User, f.ListID), 0, 'members after a Sync refresh from a view that matches nothing');
            Assert((await auditTypes(ctx.User, f.ListID)).includes('List Source Approved'), 'no List Source Approved audit row');
        },
    },
    {
        Id: 'list-refresh.LR6',
        Name: 'LR6: turning Refresh automatically off disables the routine but keeps it',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const list = await loadList(ctx.Provider, ctx.User, f.ListID);
            list.AutoRefresh = false;
            Assert(await list.Save(), `turning off Refresh automatically failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            AssertEqual((await loadRoutine(ctx.Provider, ctx.User, f.RoutineID!))?.Status, 'Disabled', 'routine after turning it off');
        },
    },
    {
        Id: 'list-refresh.LR7',
        Name: 'LR7: deleting the list deletes its routine',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const list = await loadList(ctx.Provider, ctx.User, f.ListID);
            Assert(await list.Delete(), `list delete failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            Assert((await loadRoutine(ctx.Provider, ctx.User, f.RoutineID!)) == null, 'the routine outlived its list');
        },
    },
];

for (const check of ListRefreshChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('list-refresh', {
    Setup: async (ctx: IntegrationCheckContext) => {
        if (!process.env.MJ_LIST_DELTA_SECRET) SetDeltaTokenSecret(randomBytes(32).toString('hex'));
        const md = ctx.Provider;
        const user = ctx.User;
        const roles = md.EntityByName('MJ: Roles');
        Assert(roles != null, "entity 'MJ: Roles' not found");

        const view = await md.GetEntityObject<MJUserViewEntity>('MJ: User Views', user);
        view.NewRecord();
        view.Name = `List refresh source ${FIXTURE_TAG}`;
        view.EntityID = roles!.ID;
        view.UserID = user.ID;
        view.CustomWhereClause = true;
        view.WhereClause = ALL_ROLES_FILTER;
        Assert(await view.Save(), `view fixture save failed: ${view.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        ctx.ListRefreshFixture = { ViewID: view.ID, ListID: '', RoutineID: null };

        const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', user);
        list.NewRecord();
        list.Name = `List refresh suite ${FIXTURE_TAG}`;
        list.Description = 'Fixture for the list-refresh bundle — safe to delete';
        list.EntityID = roles!.ID;
        list.UserID = user.ID;
        Assert(await list.Save(), `list fixture save failed: ${list.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        ctx.ListRefreshFixture.ListID = list.ID;
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.ListRefreshFixture;
        if (!f) return;
        const md = ctx.Provider;
        const user = ctx.User;
        if (f.ListID) {
            const details = await new RunView().RunView<{ ID: string }>({
                EntityName: 'MJ: List Details', ExtraFilter: `ListID='${f.ListID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
            }, user);
            for (const row of details.Results ?? []) {
                const detail = await md.GetEntityObject<MJListDetailEntity>('MJ: List Details', user);
                if (await detail.Load(row.ID)) await detail.Delete().catch(() => undefined);
            }
            const list = await md.GetEntityObject<MJListEntity>('MJ: Lists', user);
            if (await list.Load(f.ListID)) await list.Delete().catch(() => undefined);
        }
        if (f.RoutineID) {
            const routine = await loadRoutine(md, user, f.RoutineID);
            if (routine) await routine.Delete().catch(() => undefined);
        }
        const view = await md.GetEntityObject<MJUserViewEntity>('MJ: User Views', user);
        if (await view.Load(f.ViewID)) await view.Delete().catch(() => undefined);
        ctx.ListRefreshFixture = undefined;
        SetDeltaTokenSecret(undefined);
    },
});
