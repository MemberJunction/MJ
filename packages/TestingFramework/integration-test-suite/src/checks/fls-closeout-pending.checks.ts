/**
 * fls-closeout-pending.checks.ts — the 'fls-closeout-pending' bundle (server transport): checks
 * written against DECIDED field-level security behaviour before its implementation landed. The
 * behaviour has landed and the bundle runs in the deterministic suite.
 *
 *   Server cache segmented by field-security fingerprint, as row-level security already is
 *     PC1  a restricted user's cold miss does not narrow the result an unrestricted user then gets
 *     PC2  a restricted user is never served a slot an unrestricted user warmed: the read writes its own slot,
 *          and carries no denied value
 *     PC3  search row sets are isolated: a UserSearchString that matches a row only through a column the
 *          reader is denied returns that row to the unrestricted user and not to the reader, even after
 *          the unrestricted user warmed the identical request
 *   Saved queries (RunQuery) enforce field-level security
 *     PQ1  a saved query SELECTING a denied column is refused for the restricted caller and runs for the unrestricted one
 *     PQ2  a saved query FILTERING on a denied column (selecting only allowed ones) is refused for the restricted caller
 *     PQ3  a saved query reading whole rows (SELECT *) of the entity is refused for the restricted caller (fail closed)
 *     PQ4  a query whose role list includes the restricted caller's role runs for that caller: the role-list
 *          grant bypasses field-level security by design
 *
 * `fls-enforcement` FLS11 asserts the same segmented behaviour from the ordinary-read side: the
 * reader's identical read after a writer warm-up writes its own segment.
 *
 * FIXTURE. The `fls-enforcement` fixture plus the close-out tightenings (Reader.Email Deny). The
 * saved queries are created in Setup under a throwaway category with the AI enrichment step skipped
 * (deterministic tier), and deleted with their permission rows in teardown.
 */
import { RunView, RunQuery } from '@memberjunction/core';
import type { RunViewParams, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { Assert, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext, FlsFixture } from '@memberjunction/testing-integration';
import { SEEDED_FLS_ENTITY, SEED_FIXTURES_COMMAND, FLS_READER_DENIED_FIELD } from '@memberjunction/testing-integration';
import { QueryEngine } from '@memberjunction/core-entities';
import type { MJEntityFieldEntity, MJQueryCategoryEntity, MJQueryEntity, MJQueryPermissionEntity } from '@memberjunction/core-entities';
import { SchemaOf, FlsEntity, SetupFlsEnforcementFixture, TeardownFlsEnforcementFixture } from './fls-enforcement.checks';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';
import {
    ApplyCloseoutTightenings, ReadCloseoutMarkers, ColdFilter, ErrorText,
    AssertValuesWithheld, AssertValuePresent
} from './fls-closeout-shared';
import type { CloseoutMarkers } from './fls-closeout-shared';

const BUNDLE = 'fls-closeout-pending';
const FIXTURE_TAG = '(mj-integration-test fls-closeout-pending — safe to delete)';

/** The saved queries Setup creates, one per PQ check. */
interface PendingQueries {
    SelectsDenied?: MJQueryEntity;
    FiltersOnDenied?: MJQueryEntity;
    SelectsStar?: MJQueryEntity;
    RoleListed?: MJQueryEntity;
}

interface PendingState {
    Markers?: CloseoutMarkers;
    ProvisionError?: string;
    Category?: MJQueryCategoryEntity;
    Queries: PendingQueries;
    PermissionIDs: string[];
}

const state: PendingState = { Queries: {}, PermissionIDs: [] };

/** The usable fixture and its markers; the check is SKIPPED (never scored as a pass) without one. A provisioned-but-broken fixture fails. */
function ready(ctx: IntegrationCheckContext, checkId: string): { Fx: FlsFixture; Markers: CloseoutMarkers } {
    const fx = ctx.FlsFixture;
    if (fx?.EnableError || state.ProvisionError) {
        Assert(false, `${checkId}: the fixture could not be provisioned: ${fx?.EnableError ?? state.ProvisionError}`);
    }
    if (!fx || !fx.Usable || !state.Markers) {
        const reason = `${fx?.Reason ?? 'fixture not provisioned'}. Seed with \`${SEED_FIXTURES_COMMAND}\`.`;
        console.warn(`  ⚠ ${BUNDLE}.${checkId} SKIPPED — ${reason}`);
        return SkipCheck(`${checkId}: ${reason}`);
    }
    return { Fx: fx, Markers: state.Markers };
}

// ─────────────────────────────────────────────────────────────────── fixture

/** One saved query in the fixture category, saved without the AI enrichment step. */
async function createQuery(ctx: IntegrationCheckContext, label: string, sql: string): Promise<MJQueryEntity> {
    const query = await ctx.Provider.GetEntityObject<MJQueryEntity>('MJ: Queries', ctx.User);
    query.NewRecord();
    query.Name = `IT FLS Closeout ${label} ${Date.now().toString(36)}`;
    query.CategoryID = state.Category!.ID;
    query.SQL = sql;
    query.Status = 'Approved';
    query.Description = FIXTURE_TAG;
    Assert(await query.Save(FixtureQuerySaveOptions()), `fixture query '${label}' save failed: ${query.LatestResult?.CompleteMessage ?? ''}`);
    return query;
}

/** Grants `roleID` the right to run `query` (a role-list entry). */
async function grantRole(ctx: IntegrationCheckContext, query: MJQueryEntity, roleID: string): Promise<void> {
    const permission = await ctx.Provider.GetEntityObject<MJQueryPermissionEntity>('MJ: Query Permissions', ctx.User);
    permission.NewRecord();
    permission.QueryID = query.ID;
    permission.RoleID = roleID;
    Assert(await permission.Save(), `granting the fixture query to role ${roleID} failed: ${permission.LatestResult?.CompleteMessage ?? ''}`);
    state.PermissionIDs.push(permission.ID);
}

async function createQueries(ctx: IntegrationCheckContext, fx: FlsFixture): Promise<void> {
    const category = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', ctx.User);
    category.NewRecord();
    category.Name = `IT FLS Closeout Queries ${Date.now().toString(36)}`;
    category.UserID = ctx.User.ID;
    Assert(await category.Save(), `fixture query category save failed: ${category.LatestResult?.CompleteMessage ?? ''}`);
    state.Category = category;

    const view = `[${SchemaOf(ctx)}].[${FlsEntity(ctx).BaseView}]`;
    const one = `WHERE ID = '${fx.FixtureEmployeeID}'`;
    state.Queries.SelectsDenied = await createQuery(ctx, 'SelectsDenied', `SELECT ID, FirstName, ${FLS_READER_DENIED_FIELD} FROM ${view} ${one}`);
    state.Queries.FiltersOnDenied = await createQuery(ctx, 'FiltersOnDenied', `SELECT ID, FirstName FROM ${view} ${one} AND ${FLS_READER_DENIED_FIELD} LIKE '%@%'`);
    state.Queries.SelectsStar = await createQuery(ctx, 'SelectsStar', `SELECT * FROM ${view} ${one}`);
    state.Queries.RoleListed = await createQuery(ctx, 'RoleListed', `SELECT ID, FirstName, ${FLS_READER_DENIED_FIELD} FROM ${view} ${one}`);
    await grantRole(ctx, state.Queries.RoleListed, fx.RoleIDs!.Reader);
    await grantRole(ctx, state.Queries.RoleListed, fx.RoleIDs!.Writer);
    await QueryEngine.Instance.Config(true, ctx.User);
}

async function setupPending(ctx: IntegrationCheckContext): Promise<void> {
    state.Markers = undefined;
    state.ProvisionError = undefined;
    state.Category = undefined;
    state.Queries = {};
    await SetupFlsEnforcementFixture(ctx);
    const fx = ctx.FlsFixture;
    if (!fx?.Usable || !fx.FixtureEmployeeID) {
        return;
    }
    try {
        const refused = await ApplyCloseoutTightenings(ctx, fx);
        if (refused) {
            state.ProvisionError = refused;
            return;
        }
        state.Markers = await ReadCloseoutMarkers(ctx, fx.FixtureEmployeeID);
        await createQueries(ctx, fx);
    } catch (e) {
        state.ProvisionError = ErrorText(e);
    }
}

async function teardownPending(ctx: IntegrationCheckContext): Promise<void> {
    for (const id of state.PermissionIDs.splice(0)) {
        try {
            const permission = await ctx.Provider.GetEntityObject<MJQueryPermissionEntity>('MJ: Query Permissions', ctx.User);
            if (await permission.Load(id)) await permission.Delete();
        } catch { /* best-effort */ }
    }
    for (const query of Object.values(state.Queries)) {
        await query?.Delete().catch(() => false);
    }
    await state.Category?.Delete().catch(() => false);
    state.Queries = {};
    state.Category = undefined;
    await QueryEngine.Instance.Config(true, ctx.User).catch(() => undefined);
    await TeardownFlsEnforcementFixture(ctx);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, { Setup: setupPending, Teardown: teardownPending });

// ─────────────────────────────────────────────────────────────────── cache segmentation

/** The fixture employee read as `user` against a slot keyed by `tag`; one row asserted. */
async function cachedFixtureRead(fx: FlsFixture, user: UserInfo, tag: string): Promise<Record<string, unknown>> {
    const params: RunViewParams = { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: `ID = '${fx.FixtureEmployeeID}' AND ${ColdFilter(tag)}`, ResultType: 'simple' };
    const res = await new RunView().RunView<Record<string, unknown>>(params, user);
    Assert(res.Success && res.Results.length === 1, `reading the fixture employee as ${user.Email} failed: ${res.ErrorMessage ?? `${res.Results.length} rows`}`);
    return res.Results[0];
}

/** PC1 — a restricted user's cold miss does not narrow the result an unrestricted user then gets for the same request. */
export async function CheckPc1RestrictedMissDoesNotNarrow(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'PC1');
    const tag = `pc1-${Date.now()}`;
    AssertValuesWithheld(await cachedFixtureRead(r.Fx, r.Fx.Reader!, tag), FLS_READER_DENIED_FIELD, r.Markers.Email, 'PC1 reader (cold miss)');
    AssertValuePresent(await cachedFixtureRead(r.Fx, r.Fx.Writer!, tag), FLS_READER_DENIED_FIELD, r.Markers.Email,
        'PC1 writer after the reader\'s cold miss (a narrowed shared slot would have dropped the column)');
}

/** PC2 — the restricted user's identical read after an unrestricted warm-up writes its own slot and carries no denied value. */
export async function CheckPc2RestrictedNeverServedWide(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'PC2');
    const tag = `pc2-${Date.now()}`;
    AssertValuePresent(await cachedFixtureRead(r.Fx, r.Fx.Writer!, tag), FLS_READER_DENIED_FIELD, r.Markers.Email, 'PC2 writer warm-up');
    ctx.Storage.ResetCounts();
    const asReader = await cachedFixtureRead(r.Fx, r.Fx.Reader!, tag);
    Assert(ctx.Storage.SetCount('RunViewCache') > 0,
        'PC2: the reader must be served from its OWN field-security segment (a new cache write), not from the writer-warmed slot');
    AssertValuesWithheld(asReader, FLS_READER_DENIED_FIELD, r.Markers.Email, 'PC2 reader after the writer warmed the request');
}

/**
 * Runs `fn` with the denied column in the entity's user-search field set. A default install
 * searches no column of the fixture entity, so the column is added through the entity path for
 * the duration of the check and its stored setting is restored afterwards.
 */
async function withDeniedColumnSearchable(ctx: IntegrationCheckContext, fn: () => Promise<void>): Promise<void> {
    const field = FlsEntity(ctx).Fields.find(f => f.Name === FLS_READER_DENIED_FIELD);
    Assert(field != null, `PC3: '${FLS_READER_DENIED_FIELD}' must be a field of '${SEEDED_FLS_ENTITY}'`);
    if (field!.IncludeInUserSearchAPI) {
        return fn();
    }
    const row = await ctx.Provider.GetEntityObject<MJEntityFieldEntity>('MJ: Entity Fields', ctx.User);
    Assert(await row.Load(field!.ID), `PC3: loading the '${FLS_READER_DENIED_FIELD}' field row failed`);
    const autoUpdate = row.AutoUpdateIncludeInUserSearchAPI;
    row.IncludeInUserSearchAPI = true;
    Assert(await row.Save(), `PC3: making '${FLS_READER_DENIED_FIELD}' searchable failed: ${row.LatestResult?.CompleteMessage ?? ''}`);
    try {
        await ctx.Provider.Refresh();
        await fn();
    } finally {
        row.IncludeInUserSearchAPI = false;
        row.AutoUpdateIncludeInUserSearchAPI = autoUpdate;
        await row.Save().catch(() => false);
        await ctx.Provider.Refresh().catch(() => undefined);
    }
}

/** PC3 — a search that matches a row only through a denied column returns it to the unrestricted user and never to the reader. */
export async function CheckPc3SearchRowSetIsolated(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'PC3');
    await withDeniedColumnSearchable(ctx, async () => {
        const tag = `pc3-${Date.now()}`;
        const search = (user: UserInfo) => new RunView().RunView<{ ID: string }>(
            { EntityName: SEEDED_FLS_ENTITY, UserSearchString: r.Markers.Email, ExtraFilter: ColdFilter(tag), Fields: ['ID'], ResultType: 'simple' }, user);
        const asWriter = await search(r.Fx.Writer!);
        Assert(asWriter.Success && asWriter.Results.some(row => UUIDsEqual(row.ID, r.Fx.FixtureEmployeeID!)),
            `PC3 precondition: the writer's search on the fixture's ${FLS_READER_DENIED_FIELD} must find it: ${asWriter.ErrorMessage}`);
        const asReader = await search(r.Fx.Reader!);
        Assert(asReader.Success, `PC3: the reader's search must run: ${asReader.ErrorMessage}`);
        Assert(!asReader.Results.some(row => UUIDsEqual(row.ID, r.Fx.FixtureEmployeeID!)),
            'LEAK: PC3: the reader received a row that matched only through a column they are denied (the row set reveals the value)');
    });
}

// ─────────────────────────────────────────────────────────────────── RunQuery

/** What a saved-query run gave the caller: a thrown refusal and a reported one look the same here. */
interface QueryOutcome {
    Success: boolean;
    Results: Record<string, unknown>[];
    ErrorMessage: string;
}

async function runQueryAs(query: MJQueryEntity, user: UserInfo): Promise<QueryOutcome> {
    try {
        const result = await new RunQuery().RunQuery({ QueryID: query.ID }, user);
        return { Success: result.Success, Results: (result.Results ?? []) as Record<string, unknown>[], ErrorMessage: result.ErrorMessage ?? '' };
    } catch (e) {
        return { Success: false, Results: [], ErrorMessage: ErrorText(e) };
    }
}

/** Asserts a saved query was refused for `user`, returned no rows, and that its refusal does not carry the denied value. */
function assertQueryRefused(result: QueryOutcome, marker: string, what: string): void {
    Assert(!result.Success, `${what}: the query must be refused for the restricted caller, but it ran (${result.Results.length} rows)`);
    Assert(result.Results.length === 0, `${what}: a refused query must return no rows`);
    Assert(!result.ErrorMessage.includes(marker), `${what}: the refusal must not carry the denied value`);
}

/** PQ1 — a saved query selecting a denied column: refused for the reader, runs for the writer with the value. */
export async function CheckPq1QuerySelectingDeniedRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'PQ1');
    assertQueryRefused(await runQueryAs(state.Queries.SelectsDenied!, r.Fx.Reader!), r.Markers.Email, 'PQ1 reader');
    const asWriter = await runQueryAs(state.Queries.SelectsDenied!, r.Fx.Writer!);
    Assert(asWriter.Success && asWriter.Results.length === 1, `PQ1: the writer must run the query: ${asWriter.ErrorMessage}`);
    AssertValuePresent(asWriter.Results[0], FLS_READER_DENIED_FIELD, r.Markers.Email, 'PQ1 writer (control)');
}

/** PQ2 — a saved query filtering on a denied column is refused for the reader even though it selects only allowed ones. */
export async function CheckPq2QueryFilteringOnDeniedRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'PQ2');
    assertQueryRefused(await runQueryAs(state.Queries.FiltersOnDenied!, r.Fx.Reader!), r.Markers.Email, 'PQ2 reader');
    const asWriter = await runQueryAs(state.Queries.FiltersOnDenied!, r.Fx.Writer!);
    Assert(asWriter.Success, `PQ2: the writer must run the query: ${asWriter.ErrorMessage}`);
}

/** PQ3 — a saved query reading whole rows of the entity fails closed for the reader. */
export async function CheckPq3QueryWholeRowRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'PQ3');
    assertQueryRefused(await runQueryAs(state.Queries.SelectsStar!, r.Fx.Reader!), r.Markers.Email, 'PQ3 reader');
    const asWriter = await runQueryAs(state.Queries.SelectsStar!, r.Fx.Writer!);
    Assert(asWriter.Success && asWriter.Results.length === 1, `PQ3: the writer must run the query: ${asWriter.ErrorMessage}`);
}

/** PQ4 — a query whose role list includes the reader's role runs for the reader: the role-list grant bypasses FLS by design. */
export async function CheckPq4RoleListGrantBypasses(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'PQ4');
    const asReader = await runQueryAs(state.Queries.RoleListed!, r.Fx.Reader!);
    Assert(asReader.Success && asReader.Results.length === 1,
        `PQ4: a query granted to the reader's role must run for the reader (role-list grants bypass field-level security): ${asReader.ErrorMessage}`);
}

/** The 'fls-closeout-pending' bundle (server transport; cache segmentation and saved-query field security). */
export const FlsCloseoutPendingChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.PC1`, Name: 'PC1 (cache segmentation): a restricted user\'s cold miss does not narrow the result an unrestricted user then gets', Fn: CheckPc1RestrictedMissDoesNotNarrow },
    { Id: `${BUNDLE}.PC2`, Name: 'PC2 (cache segmentation): a restricted user is never served an unrestricted user\'s slot — the read writes its own segment and carries no denied value', Fn: CheckPc2RestrictedNeverServedWide },
    { Id: `${BUNDLE}.PC3`, Name: 'PC3 (cache segmentation): a search matching a row only through a denied column returns it to the unrestricted user and never to the restricted one', Fn: CheckPc3SearchRowSetIsolated },
    { Id: `${BUNDLE}.PQ1`, Name: 'PQ1 (RunQuery FLS): a saved query selecting a denied column is refused for the restricted caller and runs for the unrestricted one', Fn: CheckPq1QuerySelectingDeniedRefused },
    { Id: `${BUNDLE}.PQ2`, Name: 'PQ2 (RunQuery FLS): a saved query filtering on a denied column is refused for the restricted caller', Fn: CheckPq2QueryFilteringOnDeniedRefused },
    { Id: `${BUNDLE}.PQ3`, Name: 'PQ3 (RunQuery FLS): a saved query reading whole rows (SELECT *) fails closed for the restricted caller', Fn: CheckPq3QueryWholeRowRefused },
    { Id: `${BUNDLE}.PQ4`, Name: 'PQ4 (RunQuery FLS): a role-list grant that includes the restricted caller\'s role lets the query run (role-list grants bypass FLS by design)', Fn: CheckPq4RoleListGrantBypasses },
];

for (const check of FlsCloseoutPendingChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
