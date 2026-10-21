/**
 * fls-closeout.checks.ts — the 'fls-closeout' bundle (server transport): the field-level security
 * close-out fixes, proven end to end against a live database with the seeded principals.
 *
 * WHAT IT ADDS TO IT90. The `fls-enforcement` bundle proves the original enforcement points. This
 * bundle proves the rules the close-out settled, each at the place a real caller reaches it:
 *
 *   Object width follows its user (an entity object never holds a value its user is denied)
 *     CO1  RunView `entity_object`: no denied value by any accessor; the unrestricted user's objects are full width
 *     CO2  Load, then Save: still nothing denied after the save re-reads the row; the stored value is untouched
 *     CO3  LoadFromData with a full-width row: the object drops the denied value; the caller's row is not modified
 *   One field-security gate on every effective clause
 *     CO4  OverrideExcludeFilter naming a denied field is refused
 *     CO5  a view's stored WhereClause naming a denied field is refused (in-memory view, then saved and run by ViewID)
 *     CO6  a CustomWhereClause view run by ViewID is refused for the restricted user and runs for the unrestricted one
 *     CO7  whole-row constructs (CHECKSUM(*), alias.*, FOR JSON) are refused for a caller with denials only
 *     CO8  look-alike spellings of a denied column are refused; the column's name inside a string or comment is not
 *     CO9  an unknown column is refused with exactly the wording a denied one gets, only for a caller with denials
 *   Datasets
 *     CO10 item rows are projected for the reader, on the cold read and on the shared cache slot
 *     CO11 an ItemFilter on a denied field, or on an unknown one, is refused with the same wording
 *   Record Changes
 *     CO12 a ViewID-only read of the audit trail projects each row's payload for the reader
 *     CO19 a restricted user's own save stores a full-width payload; the saver's read of it is projected
 *   Configuration guards
 *     CO13 a lowercase 'deny' is stored as 'Deny' and enforced
 *     CO14 a lowercase 'deny' aimed at a role the system user holds is refused (mutation tier)
 *     CO15 re-pointing a permission row's RoleID off the system user's last Allow is refused (mutation tier)
 *     CO16 re-pointing a system-user role assignment to another user is refused when it carries the last Allow (mutation tier)
 *   Consumers that deliver to someone other than the loader
 *     CO17 an agent data source cached PerAgent is cached per user: the reader never gets the writer's rows,
 *          and an entity_object source hands the agent no denied value
 *     CO18 search results the reader may see have denied fields projected out of RawMetadata and the snippet
 *
 * TRANSPORT AND IDENTITY. Server transport, with the seeded principals as the acting user. Every
 * rule proven here is enforced inside the server (the provider's clause gate, entity hydration,
 * the dataset reader, the search permission pass, the entity save guards, the agent data preloader),
 * so a real restricted `UserInfo` reaches exactly the code a request does. The wire-only rules (client
 * input rejection, transport projection) are the `fls-closeout-client` bundle's.
 *
 * FIXTURE. The `fls-enforcement` fixture (FLS enabled on 'MJ: Employees' through the real entity
 * path, one fixture employee) plus three tightenings on non-system roles: Reader.Email Deny,
 * Denier.Title Deny, Denier.Phone Allow/Deny/Deny. Views, datasets and agent data sources a check
 * creates are tracked and deleted in teardown; every check restores what it edits in a `finally`,
 * so the bundle is repeat-safe on a persistent database. CO14–CO16 touch the system user's own rules
 * and assignments, so they carry RequiresMutation like IT91; the rest are deterministic.
 *
 * Skips loudly (never passes silently) when the seed is absent or the entity is already FLS-enabled;
 * a seed that is present but could not be provisioned fails every check.
 */
import { RunView, FieldSecurityDenialMessage, FieldSecurityWholeRowMessage, CompositeKey } from '@memberjunction/core';
import type { BaseEntity, DatasetResultType, IMetadataProvider, UserInfo, RunViewParams } from '@memberjunction/core';
import { UUIDsEqual, ordinalCompare } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext, FlsFixture } from '@memberjunction/testing-integration';
import {
    SEEDED_FLS_ENTITY, SEED_FIXTURES_COMMAND, FLS_DENY_READ_FIELD, FLS_READER_DENIED_FIELD
} from '@memberjunction/testing-integration';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    MJEmployeeEntity, MJEntityFieldPermissionEntity, MJUserRoleEntity, MJUserViewEntityExtended,
    MJDatasetEntity, MJDatasetItemEntity, MJAIAgentDataSourceEntity
} from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { AgentDataPreloader } from '@memberjunction/ai-agents';
import { SearchEngine } from '@memberjunction/search-engine';
import type { SearchResultItem } from '@memberjunction/search-engine';
import {
    Q, SchemaOf, FlsEntity, FieldOf, LoadEfpRow, SetRule,
    SetupFlsEnforcementFixture, TeardownFlsEnforcementFixture
} from './fls-enforcement.checks';
import {
    ApplyCloseoutTightenings, ReadCloseoutMarkers, ColdFilter, ErrorText, RunViewRefusal,
    AssertMatchesKeyedWording, AssertDeniedEqualsUnknown, AssertValuesWithheld, AssertValuePresent,
    AssertEntityObjectWithholds, UNKNOWN_FIELD
} from './fls-closeout-shared';
import type { CloseoutMarkers } from './fls-closeout-shared';

const BUNDLE = 'fls-closeout';
const RECORD_CHANGES_ENTITY = 'MJ: Record Changes';
const USER_VIEWS_ENTITY = 'MJ: User Views';
/** The seeded test-only agent the CO17 data sources are attached to for the length of the check. */
const DATA_SOURCE_AGENT_NAME = 'IT: Echo Agent';
/** Appended to every row this bundle creates, so a leftover is recognisable. */
const FIXTURE_TAG = '(mj-integration-test fls-closeout — safe to delete)';

/** What the lifecycle provisions beyond the shared FLS fixture, and what the checks create. */
interface CloseoutState {
    Markers?: CloseoutMarkers;
    ProvisionError?: string;
    CreatedViewIDs: string[];
    CreatedDatasetIDs: string[];
    CreatedDatasetItemIDs: string[];
    CreatedDataSourceIDs: string[];
    /** The fixture dataset CO10 creates and CO11 reuses. */
    DatasetName?: string;
}

const state: CloseoutState = { CreatedViewIDs: [], CreatedDatasetIDs: [], CreatedDatasetItemIDs: [], CreatedDataSourceIDs: [] };

// ─────────────────────────────────────────────────────────────────── fixture

/** The usable fixture and its markers, or undefined after a loud skip. A provisioned-but-broken fixture fails. */
function ready(ctx: IntegrationCheckContext, checkId: string): { Fx: FlsFixture; Markers: CloseoutMarkers } | undefined {
    const fx = ctx.FlsFixture;
    if (fx?.EnableError || state.ProvisionError) {
        Assert(false, `${checkId}: the FLS fixture could not be provisioned: ${fx?.EnableError ?? state.ProvisionError}`);
    }
    if (!fx || !fx.Usable || !state.Markers) {
        console.warn(`  ⚠ ${BUNDLE}.${checkId} SKIPPED — ${fx?.Reason ?? 'fixture not provisioned'}. Seed with \`${SEED_FIXTURES_COMMAND}\`.`);
        return undefined;
    }
    return { Fx: fx, Markers: state.Markers };
}

function skip(checkId: string, reason: string): void {
    console.warn(`  ⚠ ${BUNDLE}.${checkId} SKIPPED — ${reason}`);
}

async function setupCloseout(ctx: IntegrationCheckContext): Promise<void> {
    state.Markers = undefined;
    state.ProvisionError = undefined;
    state.DatasetName = undefined;
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
    } catch (e) {
        state.ProvisionError = ErrorText(e);
    }
}

/** Deletes one tracked row through the entity path, best-effort. */
async function deleteTracked(ctx: IntegrationCheckContext, entityName: string, id: string): Promise<void> {
    try {
        const row = await ctx.Provider.GetEntityObject<BaseEntity>(entityName, ctx.User);
        if (await row.InnerLoad(CompositeKey.FromID(id))) {
            await row.Delete();
        }
    } catch { /* best-effort */ }
}

async function teardownCloseout(ctx: IntegrationCheckContext): Promise<void> {
    const createdDataSources = state.CreatedDataSourceIDs.length > 0;
    for (const id of state.CreatedDataSourceIDs.splice(0)) await deleteTracked(ctx, 'MJ: AI Agent Data Sources', id);
    if (createdDataSources) {
        // The AI engine cached the fixture data sources; reload it so no later run of the agent preloads them.
        await AIEngine.Instance.Config(true, ctx.User).catch(() => undefined);
    }
    for (const id of state.CreatedDatasetItemIDs.splice(0)) await deleteTracked(ctx, 'MJ: Dataset Items', id);
    for (const id of state.CreatedDatasetIDs.splice(0)) await deleteTracked(ctx, 'MJ: Datasets', id);
    for (const id of state.CreatedViewIDs.splice(0)) await deleteTracked(ctx, USER_VIEWS_ENTITY, id);
    AgentDataPreloader.Instance.ClearAgentCache();
    await TeardownFlsEnforcementFixture(ctx);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, { Setup: setupCloseout, Teardown: teardownCloseout });

// ─────────────────────────────────────────────────────────────────── helpers

/** One employees read as `user`, cold and simple; the fixture row is asserted present. */
async function fixtureRowAs(fx: FlsFixture, user: UserInfo, tag: string): Promise<Record<string, unknown>> {
    const res = await new RunView().RunView<Record<string, unknown>>(
        { EntityName: SEEDED_FLS_ENTITY, ExtraFilter: `ID = '${fx.FixtureEmployeeID}' AND ${ColdFilter(tag)}`, ResultType: 'simple' }, user);
    Assert(res.Success && res.Results.length === 1, `reading the fixture employee as ${user.Email} failed: ${res.ErrorMessage ?? `${res.Results.length} rows`}`);
    return res.Results[0];
}

/** Whether `user` holds entity read on `entityName`: a precondition some checks skip on. */
function canRead(ctx: IntegrationCheckContext, entityName: string, user: UserInfo): boolean {
    return ctx.Provider.EntityByName(entityName)?.GetUserPermisions(user)?.CanRead ?? false;
}

/** A saved view, created as the run's identity and tracked for teardown. */
async function saveFixtureView(ctx: IntegrationCheckContext, entityName: string, whereClause: string, custom: boolean): Promise<MJUserViewEntityExtended> {
    const entity = ctx.Provider.EntityByName(entityName);
    Assert(entity != null, `'${entityName}' not in metadata`);
    const view = await ctx.Provider.GetEntityObject<MJUserViewEntityExtended>(USER_VIEWS_ENTITY, ctx.User);
    view.NewRecord();
    view.Name = `it-fls-closeout ${Date.now().toString(36)} ${FIXTURE_TAG}`;
    view.EntityID = entity!.ID;
    view.UserID = ctx.User.ID;
    view.IsShared = true;
    view.CustomWhereClause = custom;
    view.WhereClause = whereClause;
    Assert(await view.Save(), `saving the fixture view failed: ${view.LatestResult?.CompleteMessage ?? ''}`);
    state.CreatedViewIDs.push(view.ID);
    return view;
}

/** The view's WhereClause as stored, read back by SQL: a save may regenerate it. */
async function storedWhereClause(ctx: IntegrationCheckContext, viewID: string): Promise<string> {
    const rows = await Q<{ WhereClause: string | null }>(ctx, `SELECT WhereClause FROM [${SchemaOf(ctx)}].UserView WHERE ID = '${viewID}'`);
    return rows[0]?.WhereClause ?? '';
}

/** The system user's role IDs, sorted so a choice among them is the same on every run. */
function systemRoleIDs(): { User: UserInfo; Roles: string[] } {
    const sysUser = UserCache.Instance.GetSystemUser();
    Assert(sysUser != null, 'the MJ system user must be resolvable from the user cache');
    return { User: sysUser!, Roles: sysUser!.UserRoles.map(r => r.RoleID).sort(ordinalCompare) };
}

/**
 * The system user's roles that hold an Allow read rule on `fieldID`, sorted: the roles whose rows
 * carry its access there. The first is the "keeper" the guard checks lean on.
 */
async function systemRolesAllowingRead(ctx: IntegrationCheckContext, fieldID: string): Promise<string[]> {
    const { Roles } = systemRoleIDs();
    const rules = Roles.length > 0 ? await rulesOnField(ctx, fieldID, Roles) : [];
    return rules.filter(rule => rule.ReadAccess.toLowerCase() === 'allow').map(rule => rule.RoleID).sort(ordinalCompare);
}

/** A stored permission row's three verbs. */
interface StoredRule { ID: string; RoleID: string; ReadAccess: string; UpdateAccess: string; CreateAccess: string }

async function rulesOnField(ctx: IntegrationCheckContext, fieldID: string, roleIDs: string[]): Promise<StoredRule[]> {
    const list = roleIDs.map(r => `'${r.toLowerCase()}'`).join(',');
    return Q<StoredRule>(ctx,
        `SELECT ID, RoleID, ReadAccess, UpdateAccess, CreateAccess FROM [${SchemaOf(ctx)}].EntityFieldPermission ` +
        `WHERE EntityFieldID = '${fieldID}' AND LOWER(CONVERT(NVARCHAR(36), RoleID)) IN (${list})`);
}

/**
 * Runs `body` with `keeper` as the only system-user role granting anything on `fieldID`: every
 * other system-user role's row there is narrowed to No Access by direct SQL, then restored from
 * the captured values in a `finally`, whatever `body` does.
 */
async function withKeeperCarryingLastAllow(
    ctx: IntegrationCheckContext, fieldID: string, keeper: string, roles: string[], body: () => Promise<void>
): Promise<void> {
    const others = roles.filter(r => !UUIDsEqual(r, keeper));
    const captured = others.length > 0 ? await rulesOnField(ctx, fieldID, others) : [];
    try {
        for (const rule of captured) {
            await Q(ctx, `UPDATE [${SchemaOf(ctx)}].EntityFieldPermission SET ReadAccess='No Access', UpdateAccess='No Access', CreateAccess='No Access' WHERE ID = '${rule.ID}'`);
        }
        await ctx.Provider.Refresh();
        await body();
    } finally {
        for (const rule of captured) {
            await Q(ctx,
                `UPDATE [${SchemaOf(ctx)}].EntityFieldPermission SET ReadAccess='${rule.ReadAccess}', ` +
                `UpdateAccess='${rule.UpdateAccess}', CreateAccess='${rule.CreateAccess}' WHERE ID = '${rule.ID}'`).catch(() => undefined);
        }
        await ctx.Provider.Refresh().catch(() => undefined);
    }
}

// ─────────────────────────────────────────────────────────────────── object width (Model A)

/** CO1 — RunView `entity_object`: the reader's objects hold no denied value by any accessor; the writer's are full width. */
export async function CheckCo1EntityObjectRunViewWidth(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO1');
    if (!r) return;
    const params = (tag: string): RunViewParams => ({
        EntityName: SEEDED_FLS_ENTITY, ExtraFilter: `ID = '${r.Fx.FixtureEmployeeID}' AND ${ColdFilter(tag)}`, ResultType: 'entity_object'
    });
    // The writer first, so a shared full-width cache slot exists for the reader's identical read to land on.
    const tag = `co1-${Date.now()}`;
    const asWriter = await new RunView().RunView<MJEmployeeEntity>(params(tag), r.Fx.Writer!);
    Assert(asWriter.Success && asWriter.Results.length === 1, `writer entity_object read failed: ${asWriter.ErrorMessage}`);
    AssertValuePresent(asWriter.Results[0].GetAll(), FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO1 writer object (control)');

    for (const t of [tag, `co1-cold-${Date.now()}`]) {
        const asReader = await new RunView().RunView<MJEmployeeEntity>(params(t), r.Fx.Reader!);
        Assert(asReader.Success && asReader.Results.length === 1, `reader entity_object read failed: ${asReader.ErrorMessage}`);
        await AssertEntityObjectWithholds(asReader.Results[0], FLS_READER_DENIED_FIELD, r.Markers.Email, `CO1 reader object (${t === tag ? 'shared slot' : 'cold'})`);
        AssertEqual(asReader.Results[0].FirstName, 'Fixture', 'CO1: allowed fields must still load for the reader');
    }
}

/** CO2 — Load then Save as the multi user: Title is never held, before or after the save re-reads the row. */
export async function CheckCo2LoadAndSaveWidth(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO2');
    if (!r) return;
    const emp = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, r.Fx.Multi!);
    Assert(await emp.Load(r.Fx.FixtureEmployeeID!), 'CO2: the multi user must be able to load the fixture employee');
    await AssertEntityObjectWithholds(emp, FLS_DENY_READ_FIELD, r.Markers.Title, 'CO2 after Load');
    try {
        emp.FirstName = 'CloseoutSave';
        Assert(await emp.Save(), `CO2: saving an allowed field must succeed: ${emp.LatestResult?.CompleteMessage ?? ''}`);
        await AssertEntityObjectWithholds(emp, FLS_DENY_READ_FIELD, r.Markers.Title, 'CO2 after Save');
        const db = await Q<{ Title: string; FirstName: string }>(ctx, `SELECT Title, FirstName FROM [${SchemaOf(ctx)}].Employee WHERE ID = '${r.Fx.FixtureEmployeeID}'`);
        AssertEqual(db[0].FirstName, 'CloseoutSave', 'CO2: the edited field must persist');
        AssertEqual(db[0].Title, r.Markers.Title, 'CO2: the withheld field must keep its stored value through the save');
    } finally {
        emp.FirstName = 'Fixture';
        await emp.Save().catch(() => false);
    }
    const asWriter = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, r.Fx.Writer!);
    Assert(await asWriter.Load(r.Fx.FixtureEmployeeID!), 'CO2: the writer must load the fixture employee');
    AssertValuePresent(asWriter.GetAll(), FLS_DENY_READ_FIELD, r.Markers.Title, 'CO2 writer object (control)');
}

/** CO3 — LoadFromData with a full-width row: the reader's object drops the denied value; the row it was given is untouched. */
export async function CheckCo3LoadFromDataWidth(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO3');
    if (!r) return;
    const fullRow = await fixtureRowAs(r.Fx, r.Fx.Writer!, `co3-${Date.now()}`);
    AssertValuePresent(fullRow, FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO3 source row (precondition)');

    const asReader = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, r.Fx.Reader!);
    Assert(await asReader.LoadFromData(fullRow), 'CO3: LoadFromData must succeed for the reader');
    await AssertEntityObjectWithholds(asReader, FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO3 reader object');
    AssertValuePresent(fullRow, FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO3: the caller\'s row must not be modified (shared cache rows are frozen)');

    const asWriter = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, r.Fx.Writer!);
    Assert(await asWriter.LoadFromData(fullRow), 'CO3: LoadFromData must succeed for the writer');
    AssertValuePresent(asWriter.GetAll(), FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO3 writer object (control)');
}

// ─────────────────────────────────────────────────────────────────── the clause gate

/** CO4 — OverrideExcludeFilter naming a denied field is refused with the ambiguous wording. */
export async function CheckCo4OverrideExcludeFilterRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO4');
    if (!r) return;
    const message = await RunViewRefusal({
        EntityName: SEEDED_FLS_ENTITY,
        OverrideExcludeFilter: `${FLS_READER_DENIED_FIELD} LIKE '%@%'`, ResultType: 'simple', BypassCache: true
    }, r.Fx.Reader!, 'CO4 OverrideExcludeFilter');
    Assert(message.includes(FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY)), `CO4: ambiguous wording expected, got '${message}'`);
}

/** CO5 — a view's stored WhereClause naming a denied field is refused: an in-memory view, then a saved one run by ViewID. */
export async function CheckCo5StoredWhereClauseRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO5');
    if (!r) return;
    const clause = `${FLS_READER_DENIED_FIELD} LIKE '%@%'`;
    const expected = FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY);

    const inMemory = await ctx.Provider.GetEntityObject<MJUserViewEntityExtended>(USER_VIEWS_ENTITY, ctx.User);
    inMemory.NewRecord();
    inMemory.Name = `it-fls-closeout in-memory ${FIXTURE_TAG}`;
    inMemory.EntityID = FlsEntity(ctx).ID;
    inMemory.UserID = ctx.User.ID;
    inMemory.CustomWhereClause = false;
    inMemory.WhereClause = clause;
    const viaEntity = await RunViewRefusal({ ViewEntity: inMemory, ResultType: 'simple', BypassCache: true }, r.Fx.Reader!, 'CO5 ViewEntity');
    Assert(viaEntity.includes(expected), `CO5 (ViewEntity): ambiguous wording expected, got '${viaEntity}'`);

    if (!canRead(ctx, USER_VIEWS_ENTITY, r.Fx.Reader!)) {
        skip('CO5 (ViewID leg)', `${r.Fx.Reader!.Email} lacks read on '${USER_VIEWS_ENTITY}' (older seed). Re-seed with \`${SEED_FIXTURES_COMMAND}\`.`);
        return;
    }
    const saved = await saveFixtureView(ctx, SEEDED_FLS_ENTITY, clause, false);
    if (!(await storedWhereClause(ctx, saved.ID)).includes(FLS_READER_DENIED_FIELD)) {
        skip('CO5 (ViewID leg)', 'saving the view regenerated its WhereClause without the denied column; the in-memory leg ran');
        return;
    }
    const viaID = await RunViewRefusal({ ViewID: saved.ID, ResultType: 'simple', BypassCache: true }, r.Fx.Reader!, 'CO5 ViewID');
    Assert(viaID.includes(expected), `CO5 (ViewID): ambiguous wording expected, got '${viaID}'`);
}

/** CO6 — a CustomWhereClause view run by ViewID is refused for the reader and runs for the writer. */
export async function CheckCo6CustomWhereClauseViewRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO6');
    if (!r) return;
    if (!canRead(ctx, USER_VIEWS_ENTITY, r.Fx.Reader!) || !canRead(ctx, USER_VIEWS_ENTITY, r.Fx.Writer!)) {
        skip('CO6', `the seeded FLS users lack read on '${USER_VIEWS_ENTITY}' (older seed). Re-seed with \`${SEED_FIXTURES_COMMAND}\`.`);
        return;
    }
    const view = await saveFixtureView(ctx, SEEDED_FLS_ENTITY, `${FLS_READER_DENIED_FIELD} = '${r.Markers.Email}'`, true);
    const message = await RunViewRefusal({ ViewID: view.ID, ResultType: 'simple', BypassCache: true }, r.Fx.Reader!, 'CO6 CustomWhereClause view');
    Assert(message.includes(FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY)), `CO6: ambiguous wording expected, got '${message}'`);

    const asWriter = await new RunView().RunView<{ ID: string }>({ ViewID: view.ID, ResultType: 'simple', BypassCache: true }, r.Fx.Writer!);
    Assert(asWriter.Success, `CO6: the unrestricted writer must run the same view: ${asWriter.ErrorMessage}`);
    Assert(asWriter.Results.some(row => UUIDsEqual(row.ID, r.Fx.FixtureEmployeeID!)), 'CO6: the writer\'s run must match the fixture employee');
}

/** The constructs CO7 sends, each refused as a whole-row read for a caller with denials. */
function wholeRowProbes(ctx: IntegrationCheckContext): Array<{ Sql: string; Construct: string }> {
    const view = `[${SchemaOf(ctx)}].[${FlsEntity(ctx).BaseView}]`;
    return [
        { Sql: `ID IN (SELECT e2.ID FROM ${view} e2 WHERE CHECKSUM(*) <> 0)`, Construct: 'CHECKSUM(*)' },
        { Sql: `EXISTS (SELECT e2.* FROM ${view} e2 WHERE e2.ID = ID)`, Construct: 'alias.*' },
        { Sql: `(SELECT TOP 1 e2.ID FROM ${view} e2 FOR JSON PATH) IS NOT NULL`, Construct: 'FOR JSON' },
    ];
}

/** CO7 — whole-row constructs are refused for the reader, and are not refused AS whole-row reads for the writer. */
export async function CheckCo7WholeRowConstructsRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO7');
    if (!r) return;
    for (const probe of wholeRowProbes(ctx)) {
        const message = await RunViewRefusal({ EntityName: SEEDED_FLS_ENTITY, ExtraFilter: probe.Sql, ResultType: 'simple', BypassCache: true },
            r.Fx.Reader!, `CO7 ${probe.Construct}`);
        Assert(message.includes(FieldSecurityWholeRowMessage(probe.Construct, SEEDED_FLS_ENTITY)),
            `CO7 ${probe.Construct}: expected "${FieldSecurityWholeRowMessage(probe.Construct, SEEDED_FLS_ENTITY)}", got '${message}'`);

        // Only callers denied something are refused: for the writer, whatever happens, it is not this refusal.
        let writerMessage = '';
        try {
            const res = await new RunView().RunView({ EntityName: SEEDED_FLS_ENTITY, ExtraFilter: probe.Sql, ResultType: 'simple', BypassCache: true }, r.Fx.Writer!);
            writerMessage = res.Success ? '' : (res.ErrorMessage ?? '');
        } catch (e) {
            writerMessage = ErrorText(e);
        }
        Assert(!writerMessage.includes('may not read whole rows'),
            `CO7 ${probe.Construct}: a caller denied nothing must not get the whole-row refusal, got '${writerMessage}'`);
    }
}

/** CO8 — look-alike spellings of the denied column are refused; its name inside a string literal or comment is not. */
export async function CheckCo8LookAlikeSpellings(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO8');
    if (!r) return;
    const view = FlsEntity(ctx).BaseView;
    const spellings = [`[EMAIL] LIKE '%@%'`, `[${view}].[eMaIl] IS NOT NULL`, `"Email" IS NOT NULL`, `ＥＭＡＩＬ IS NOT NULL`];
    for (const sql of spellings) {
        const message = await RunViewRefusal({ EntityName: SEEDED_FLS_ENTITY, ExtraFilter: sql, ResultType: 'simple', BypassCache: true }, r.Fx.Reader!, `CO8 ${sql}`);
        AssertMatchesKeyedWording(message, FieldSecurityDenialMessage, SEEDED_FLS_ENTITY, `CO8 ${sql}`);
    }
    // The column's name inside a string literal is data, not a reference: the gate resolves
    // identifiers from tokens, so this must run.
    const literal = `FirstName <> 'Email'`;
    const res = await new RunView().RunView({ EntityName: SEEDED_FLS_ENTITY, ExtraFilter: literal, ResultType: 'simple', BypassCache: true }, r.Fx.Reader!);
    Assert(res.Success, `CO8: the column's name inside a string literal is not a reference and must run (${literal}): ${res.ErrorMessage}`);
}

/** CO9 — an unknown column is refused with the denied wording, in ExtraFilter and OrderBy; only for a caller with denials. */
export async function CheckCo9UnknownEqualsDenied(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO9');
    if (!r) return;
    for (const slot of ['ExtraFilter', 'OrderBy'] as const) {
        const clause = (name: string) => slot === 'ExtraFilter' ? `${name} LIKE '%@%'` : `${name} DESC`;
        const params = (name: string): RunViewParams => ({ EntityName: SEEDED_FLS_ENTITY, [slot]: clause(name), ResultType: 'simple', BypassCache: true });
        const denied = await RunViewRefusal(params(FLS_READER_DENIED_FIELD), r.Fx.Reader!, `CO9 ${slot} denied`);
        const unknown = await RunViewRefusal(params(UNKNOWN_FIELD), r.Fx.Reader!, `CO9 ${slot} unknown`);
        AssertDeniedEqualsUnknown(denied, FLS_READER_DENIED_FIELD, unknown, UNKNOWN_FIELD, FieldSecurityDenialMessage, SEEDED_FLS_ENTITY, `CO9 ${slot}`);
    }
    // Precision: a caller denied nothing gets the database's own answer, not the field-security wording.
    let writerMessage = '';
    try {
        const res = await new RunView().RunView({ EntityName: SEEDED_FLS_ENTITY, ExtraFilter: `${UNKNOWN_FIELD} = 1`, ResultType: 'simple', BypassCache: true }, r.Fx.Writer!);
        writerMessage = res.Success ? '' : (res.ErrorMessage ?? '');
    } catch (e) {
        writerMessage = ErrorText(e);
    }
    Assert(writerMessage.length > 0, 'CO9: a filter on a column that does not exist must fail for the writer too');
    Assert(!writerMessage.includes(FieldSecurityDenialMessage(UNKNOWN_FIELD, SEEDED_FLS_ENTITY)),
        `CO9: a caller denied nothing must not get the field-security wording for an unknown column, got '${writerMessage}'`);
}

// ─────────────────────────────────────────────────────────────────── datasets

/** Creates (once per run) a dataset with one item over the FLS entity, filtered to the fixture employee. */
async function ensureFixtureDataset(ctx: IntegrationCheckContext, fx: FlsFixture): Promise<string> {
    if (state.DatasetName) return state.DatasetName;
    const name = `IT FLS Closeout ${Date.now().toString(36)}`;
    const dataset = await ctx.Provider.GetEntityObject<MJDatasetEntity>('MJ: Datasets', ctx.User);
    dataset.NewRecord();
    dataset.Name = name;
    dataset.Description = FIXTURE_TAG;
    Assert(await dataset.Save(), `creating the fixture dataset failed: ${dataset.LatestResult?.CompleteMessage ?? ''}`);
    state.CreatedDatasetIDs.push(dataset.ID);

    const item = await ctx.Provider.GetEntityObject<MJDatasetItemEntity>('MJ: Dataset Items', ctx.User);
    item.NewRecord();
    item.DatasetID = dataset.ID;
    item.Code = 'Employees';
    item.Sequence = 1;
    item.EntityID = FlsEntity(ctx).ID;
    item.WhereClause = `ID = '${fx.FixtureEmployeeID}'`;
    item.DateFieldToCheck = '__mj_UpdatedAt';
    item.Description = FIXTURE_TAG;
    Assert(await item.Save(), `creating the fixture dataset item failed: ${item.LatestResult?.CompleteMessage ?? ''}`);
    state.CreatedDatasetItemIDs.push(item.ID);
    state.DatasetName = name;
    return name;
}

/** The fixture item's rows from a dataset read, asserted successful. */
function datasetRows(result: DatasetResultType, what: string): Record<string, unknown>[] {
    Assert(result.Success, `${what}: the dataset read failed: ${result.Status}`);
    const item = result.Results.find(i => i.Code === 'Employees');
    Assert(item != null && item.Success !== false, `${what}: the Employees item failed: ${item?.Status ?? 'missing'}`);
    Assert(item!.Results.length === 1, `${what}: the Employees item must return the fixture row (got ${item!.Results.length})`);
    return item!.Results as Record<string, unknown>[];
}

/** CO10 — dataset item rows are projected for the reader, cold and on the slot the writer warmed. */
export async function CheckCo10DatasetRowsProjected(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO10');
    if (!r) return;
    const name = await ensureFixtureDataset(ctx, r.Fx);
    const coldReader = datasetRows(await ctx.Provider.GetDatasetByName(name, undefined, r.Fx.Reader!), 'CO10 reader (cold)');
    AssertValuesWithheld(coldReader[0], FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO10 reader row (cold)');

    const writer = datasetRows(await ctx.Provider.GetDatasetByName(name, undefined, r.Fx.Writer!), 'CO10 writer');
    AssertValuePresent(writer[0], FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO10 writer row (control)');

    const warmReader = datasetRows(await ctx.Provider.GetDatasetByName(name, undefined, r.Fx.Reader!), 'CO10 reader (after the writer)');
    AssertValuesWithheld(warmReader[0], FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO10 reader row (after the writer warmed the slot)');
    AssertValuePresent(writer[0], FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO10: projecting the reader\'s rows must not narrow the writer\'s');
}

/** The refusal text of a dataset read: the overall status and every failed item's. */
function datasetRefusalText(result: DatasetResultType): { Refused: boolean; Text: string } {
    const failed = result.Results.filter(i => i.Success === false);
    return { Refused: !result.Success || failed.length > 0, Text: [result.Status, ...failed.map(i => i.Status ?? '')].join(' | ') };
}

/** CO11 — an ItemFilter on a denied field, or on an unknown one, is refused with the same wording. */
export async function CheckCo11DatasetItemFilterRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO11');
    if (!r) return;
    const name = await ensureFixtureDataset(ctx, r.Fx);
    const read = async (column: string) => datasetRefusalText(
        await ctx.Provider.GetDatasetByName(name, [{ ItemCode: 'Employees', Filter: `${column} LIKE '%@%'` }], r.Fx.Reader!));
    const denied = await read(FLS_READER_DENIED_FIELD);
    const unknown = await read(UNKNOWN_FIELD);
    Assert(denied.Refused, 'CO11: an ItemFilter on a denied field must be refused');
    Assert(unknown.Refused, 'CO11: an ItemFilter on an unknown field must be refused');
    Assert(denied.Text.includes(FieldSecurityDenialMessage(FLS_READER_DENIED_FIELD, SEEDED_FLS_ENTITY)), `CO11: ambiguous wording expected for the denied field, got '${denied.Text}'`);
    Assert(unknown.Text.includes(FieldSecurityDenialMessage(UNKNOWN_FIELD, SEEDED_FLS_ENTITY)),
        `CO11: an unknown field must get the denied field's wording, got '${unknown.Text}'`);
}

// ─────────────────────────────────────────────────────────────────── Record Changes

/** One audit row's payload columns. */
interface AuditRow { ID: string; ChangesJSON?: string; ChangesDescription?: string; FullRecordJSON?: string }

/** The audit row columns CO12 reads. */
const AUDIT_PAYLOAD_FIELDS = ['ID', 'ChangesJSON', 'ChangesDescription', 'FullRecordJSON'] as const;

/** CO12 — a ViewID-only read of the audit trail projects each row's payload against the entity it is about. */
export async function CheckCo12RecordChangesViewIDProjected(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO12');
    if (!r) return;
    if (!FlsEntity(ctx).TrackRecordChanges) return skip('CO12', `'${SEEDED_FLS_ENTITY}' has TrackRecordChanges off, so no audit row exists`);
    for (const user of [r.Fx.Reader!, r.Fx.Writer!]) {
        if (!canRead(ctx, RECORD_CHANGES_ENTITY, user) || !canRead(ctx, USER_VIEWS_ENTITY, user)) {
            return skip('CO12', `${user.Email} lacks read on '${RECORD_CHANGES_ENTITY}' or '${USER_VIEWS_ENTITY}'. Re-seed with \`${SEED_FIXTURES_COMMAND}\`.`);
        }
    }
    const marker = `it-fls-co12-${Date.now()}@integration.test`;
    const emp = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, r.Fx.Writer!);
    Assert(await emp.Load(r.Fx.FixtureEmployeeID!), 'CO12: the writer must load the fixture employee');
    emp.Email = marker;
    Assert(await emp.Save(), `CO12: the writer's edit must save: ${emp.LatestResult?.CompleteMessage ?? ''}`);
    try {
        const view = await saveFixtureView(ctx, RECORD_CHANGES_ENTITY,
            `EntityID = '${FlsEntity(ctx).ID}' AND RecordID LIKE '%${r.Fx.FixtureEmployeeID}%'`, true);
        const read = async (user: UserInfo) => {
            // A fixture view has no saved columns, so a ViewID read would select only the key;
            // name the payload columns explicitly (still a ViewID-only request, no EntityName).
            const res = await new RunView().RunView<AuditRow>(
                { ViewID: view.ID, Fields: [...AUDIT_PAYLOAD_FIELDS], ResultType: 'simple', BypassCache: true }, user);
            Assert(res.Success, `CO12: the ViewID read as ${user.Email} failed: ${res.ErrorMessage}`);
            return res.Results;
        };
        const readerRows = await read(r.Fx.Reader!);
        Assert(readerRows.length > 0, 'CO12: the reader must still see the audit rows (payloads are narrowed, rows are not hidden)');
        for (const row of readerRows) {
            const payload = `${row.ChangesJSON ?? ''}${row.FullRecordJSON ?? ''}${row.ChangesDescription ?? ''}`;
            Assert(!payload.includes(marker), `LEAK: CO12: the denied value reached the reader through audit row ${row.ID} on a ViewID-only read`);
            Assert(!payload.includes(r.Markers.Email), `LEAK: CO12: the original denied value reached the reader through audit row ${row.ID}`);
        }
        const writerRows = await read(r.Fx.Writer!);
        Assert(writerRows.some(row => (row.ChangesJSON ?? '').includes(marker)), 'CO12: the unrestricted writer must still receive the full payload (control)');
    } finally {
        emp.Email = r.Markers.Email;
        await emp.Save().catch(() => false);
    }
}

/** The newest Update audit row on the fixture employee whose ChangesJSON carries `marker`, read as `user`. */
async function auditRowCarrying(ctx: IntegrationCheckContext, fx: FlsFixture, marker: string, user: UserInfo): Promise<AuditRow | undefined> {
    const res = await new RunView().RunView<AuditRow>({
        EntityName: RECORD_CHANGES_ENTITY,
        ExtraFilter: `EntityID = '${FlsEntity(ctx).ID}' AND RecordID LIKE '%${fx.FixtureEmployeeID}%' AND Type = 'Update' AND ChangesJSON LIKE '%${marker}%'`,
        // EntityID is selected so the projection can resolve the row's subject; without it the payload fails closed.
        Fields: [...AUDIT_PAYLOAD_FIELDS, 'EntityID'], OrderBy: 'ChangedAt DESC', ResultType: 'simple', BypassCache: true,
    }, user);
    Assert(res.Success, `CO19: reading the audit trail as ${user.Email} failed: ${res.ErrorMessage}`);
    return res.Results[0];
}

/**
 * CO19 — a restricted user's own save stores a full-width Record Change: the unrestricted writer
 * reads the denied column's stored value in FullRecordJSON, ChangesJSON names only the edited field,
 * and the restricted saver's read of the same row is projected.
 */
export async function CheckCo19RestrictedSaveStoresFullSnapshot(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO19');
    if (!r) return;
    if (!FlsEntity(ctx).TrackRecordChanges) return skip('CO19', `'${SEEDED_FLS_ENTITY}' has TrackRecordChanges off, so no audit row exists`);
    for (const user of [r.Fx.Multi!, r.Fx.Writer!]) {
        if (!canRead(ctx, RECORD_CHANGES_ENTITY, user)) {
            return skip('CO19', `${user.Email} lacks read on '${RECORD_CHANGES_ENTITY}'. Re-seed with \`${SEED_FIXTURES_COMMAND}\`.`);
        }
    }
    const marker = `CO19-${Date.now()}`;
    const emp = await ctx.Provider.GetEntityObject<MJEmployeeEntity>(SEEDED_FLS_ENTITY, r.Fx.Multi!);
    Assert(await emp.Load(r.Fx.FixtureEmployeeID!), 'CO19: the multi user must be able to load the fixture employee');
    Assert(emp.GetFieldByName(FLS_DENY_READ_FIELD)?.NotLoaded === true, `CO19: precondition — the multi user's object must not hold ${FLS_DENY_READ_FIELD}`);
    emp.FirstName = marker;
    Assert(await emp.Save(), `CO19: the multi user's edit of an allowed field must save: ${emp.LatestResult?.CompleteMessage ?? ''}`);
    try {
        const asWriter = await auditRowCarrying(ctx, r.Fx, marker, r.Fx.Writer!);
        Assert(!!asWriter, 'CO19: the restricted save must write an audit row the writer can read');
        const full = JSON.parse(asWriter!.FullRecordJSON ?? '{}') as Record<string, unknown>;
        AssertEqual(full[FLS_DENY_READ_FIELD], r.Markers.Title,
            `CO19: the audit snapshot of a restricted user's save must carry the stored ${FLS_DENY_READ_FIELD} (the payload is stored full width)`);
        AssertEqual(full.FirstName, marker, 'CO19: the snapshot must carry the saved change');
        const changed = Object.keys(JSON.parse(asWriter!.ChangesJSON ?? '{}') as Record<string, unknown>);
        AssertEqual(changed.join(','), 'FirstName', 'CO19: ChangesJSON must list only the field the save changed');

        const asSaver = await auditRowCarrying(ctx, r.Fx, marker, r.Fx.Multi!);
        Assert(!!asSaver, 'CO19: the saver must still see the audit row (payloads are narrowed, rows are not hidden)');
        Assert(UUIDsEqual(asSaver!.ID, asWriter!.ID), 'CO19: both reads must reach the same audit row');
        const saverPayload = `${asSaver!.ChangesJSON ?? ''}${asSaver!.FullRecordJSON ?? ''}${asSaver!.ChangesDescription ?? ''}`;
        Assert(!saverPayload.includes(r.Markers.Title), `LEAK: CO19: the denied ${FLS_DENY_READ_FIELD} reached the restricted saver through audit row ${asSaver!.ID}`);
        Assert(saverPayload.includes(marker), 'CO19: the saver must still see the fields they may read in the audit row');
    } finally {
        emp.FirstName = 'Fixture';
        await emp.Save().catch(() => false);
    }
}

// ─────────────────────────────────────────────────────────────────── configuration guards

/** Saves `efp` with client-supplied verb spellings, as a transport would apply them; returns [saved, message]. */
async function saveWithSpellings(efp: MJEntityFieldPermissionEntity, spellings: Record<string, string>): Promise<[boolean, string]> {
    efp.SetMany(spellings);
    try {
        const ok = await efp.Save();
        return [ok, efp.LatestResult?.CompleteMessage ?? ''];
    } catch (e) {
        return [false, ErrorText(e)];
    }
}

/** CO13 — a lowercase 'deny' on a non-system role is stored as 'Deny' and enforced. */
export async function CheckCo13LowercaseDenyNormalized(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO13');
    if (!r) return;
    const field = FieldOf(FlsEntity(ctx), FLS_DENY_READ_FIELD);
    const efp = await LoadEfpRow(ctx, field.ID, r.Fx.RoleIDs!.Reader);
    try {
        const [ok, message] = await saveWithSpellings(efp, { ReadAccess: 'deny', UpdateAccess: 'No Access', CreateAccess: 'No Access' });
        Assert(ok, `CO13: a lowercase 'deny' on a non-system role must save: ${message}`);
        const stored = await Q<{ ReadAccess: string }>(ctx, `SELECT ReadAccess FROM [${SchemaOf(ctx)}].EntityFieldPermission WHERE ID = '${efp.ID}'`);
        AssertEqual(stored[0].ReadAccess, 'Deny', 'CO13: the stored spelling must be normalized to the canonical value');
        await ctx.Provider.Refresh();
        Assert(FlsEntity(ctx).GetDeniedReadFields(r.Fx.Reader!).has(FLS_DENY_READ_FIELD.toLowerCase()), 'CO13: the normalized Deny must be enforced');
    } finally {
        await SetRule(ctx, field.ID, r.Fx.RoleIDs!.Reader, 'Allow', 'No Access', 'No Access');
        await ctx.Provider.Refresh().catch(() => undefined);
    }
}

/** CO14 — a lowercase 'deny' aimed at a role the system user holds is refused, and the stored rule is unchanged. */
export async function CheckCo14LowercaseDenyOnSystemRoleRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO14');
    if (!r) return;
    const field = FieldOf(FlsEntity(ctx), 'FirstName');
    const [role] = await systemRolesAllowingRead(ctx, field.ID);
    if (!role) return skip('CO14', 'no role the system user holds carries a rule on the field (none holds entity read)');
    const [before] = await rulesOnField(ctx, field.ID, [role]);
    const efp = await LoadEfpRow(ctx, field.ID, role);
    const [ok, message] = await saveWithSpellings(efp, { ReadAccess: 'deny', UpdateAccess: 'No Access', CreateAccess: 'No Access' });
    if (ok) {
        // The guard regressed: put the system user's rule back exactly as it was before failing.
        await Q(ctx, `UPDATE [${SchemaOf(ctx)}].EntityFieldPermission SET ReadAccess='${before.ReadAccess}', UpdateAccess='${before.UpdateAccess}', ` +
            `CreateAccess='${before.CreateAccess}' WHERE ID = '${before.ID}'`).catch(() => undefined);
        await ctx.Provider.Refresh().catch(() => undefined);
    }
    Assert(!ok, `CO14: a lowercase 'deny' on a system-user role must be refused like 'Deny' is (it SAVED: ${message})`);
    Assert(message.toLowerCase().includes('system user'), `CO14: the refusal must come from the system-user guard, got '${message}'`);
    const [after] = await rulesOnField(ctx, field.ID, [role]);
    AssertEqual(after.ReadAccess, before.ReadAccess, 'CO14: the refused edit must leave the stored rule unchanged');
}

/** A role holding no rule on `fieldID` and not held by the system user: a re-point target that collides with nothing. */
async function roleWithoutRule(ctx: IntegrationCheckContext, fieldID: string, exclude: string[]): Promise<string | undefined> {
    const list = exclude.map(id => `'${id.toLowerCase()}'`).join(',');
    const rows = await Q<{ ID: string }>(ctx,
        `SELECT TOP 1 r.ID FROM [${SchemaOf(ctx)}].Role r WHERE LOWER(CONVERT(NVARCHAR(36), r.ID)) NOT IN (${list}) ` +
        `AND NOT EXISTS (SELECT 1 FROM [${SchemaOf(ctx)}].EntityFieldPermission p WHERE p.EntityFieldID = '${fieldID}' AND p.RoleID = r.ID) ORDER BY r.ID`);
    return rows[0]?.ID;
}

/** CO15 — re-pointing the RoleID of the rule carrying the system user's last Allow is refused; the row does not move. */
export async function CheckCo15RuleRePointRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO15');
    if (!r) return;
    const { Roles } = systemRoleIDs();
    const field = FieldOf(FlsEntity(ctx), 'LastName');
    const allowing = await systemRolesAllowingRead(ctx, field.ID);
    if (allowing.length === 0) return skip('CO15', 'no role the system user holds carries an Allow on the field');
    const target = await roleWithoutRule(ctx, field.ID, Roles);
    if (!target) return skip('CO15', 'no role exists without a rule on the field, so a re-point target cannot be chosen without a collision');
    const keeper = allowing[0];
    await withKeeperCarryingLastAllow(ctx, field.ID, keeper, allowing, async () => {
        const efp = await LoadEfpRow(ctx, field.ID, keeper);
        efp.RoleID = target;
        let ok = false;
        let message = '';
        try {
            ok = await efp.Save();
            message = efp.LatestResult?.CompleteMessage ?? '';
        } catch (e) {
            message = ErrorText(e);
        }
        if (ok) {
            await Q(ctx, `UPDATE [${SchemaOf(ctx)}].EntityFieldPermission SET RoleID = '${keeper}' WHERE ID = '${efp.ID}'`).catch(() => undefined);
        }
        Assert(!ok, 'CO15: moving the system user\'s last Allow to another role must be refused (it SAVED)');
        Assert(message.toLowerCase().includes('system user'), `CO15: the refusal must come from the system-user guard, got '${message}'`);
        const stored = await Q<{ RoleID: string }>(ctx, `SELECT RoleID FROM [${SchemaOf(ctx)}].EntityFieldPermission WHERE ID = '${efp.ID}'`);
        Assert(UUIDsEqual(stored[0].RoleID, keeper), 'CO15: the refused re-point must leave the rule on its role');
    });
}

/** CO16 — re-pointing a system-user role assignment to another user is refused when that role carries the last Allow. */
export async function CheckCo16UserRoleRePointRefused(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO16');
    if (!r) return;
    const { User: sysUser } = systemRoleIDs();
    const field = FieldOf(FlsEntity(ctx), 'LastName');
    const allowing = await systemRolesAllowingRead(ctx, field.ID);
    // A second role keeps the system user's entity-level read once the keeper leaves; without one,
    // re-pointing the keeper costs no FIELD access the guard protects (the entity read goes with it).
    if (allowing.length < 2) return skip('CO16', `the system user must hold at least two roles reading '${SEEDED_FLS_ENTITY}' (holds ${allowing.length})`);
    const keeper = allowing[0];
    await withKeeperCarryingLastAllow(ctx, field.ID, keeper, allowing, async () => {
        const rows = await Q<{ ID: string }>(ctx,
            `SELECT ID FROM [${SchemaOf(ctx)}].UserRole WHERE UserID = '${sysUser.ID}' AND LOWER(CONVERT(NVARCHAR(36), RoleID)) = '${keeper.toLowerCase()}'`);
        Assert(rows.length === 1, `CO16: expected one assignment of role ${keeper} to the system user, got ${rows.length}`);
        const assignment = await ctx.Provider.GetEntityObject<MJUserRoleEntity>('MJ: User Roles', ctx.User);
        Assert(await assignment.Load(rows[0].ID), 'CO16: loading the system user\'s role assignment failed');
        assignment.UserID = r.Fx.Reader!.ID;
        let ok = false;
        let message = '';
        try {
            ok = await assignment.Save();
            message = assignment.LatestResult?.CompleteMessage ?? '';
        } catch (e) {
            message = ErrorText(e);
        }
        if (ok) {
            await Q(ctx, `UPDATE [${SchemaOf(ctx)}].UserRole SET UserID = '${sysUser.ID}' WHERE ID = '${rows[0].ID}'`).catch(() => undefined);
        }
        Assert(!ok, 'CO16: moving the system user\'s role assignment to another user must be refused when it carries the last Allow (it SAVED)');
        Assert(message.toLowerCase().includes('system user'), `CO16: the refusal must come from the system-user guard, got '${message}'`);
        const stored = await Q<{ UserID: string }>(ctx, `SELECT UserID FROM [${SchemaOf(ctx)}].UserRole WHERE ID = '${rows[0].ID}'`);
        Assert(UUIDsEqual(stored[0].UserID, sysUser.ID), 'CO16: the refused re-point must leave the assignment on the system user');
    });
}

// ─────────────────────────────────────────────────────────────────── consumers

/** Creates one agent data source over the fixture employee and tracks it for teardown. */
async function createDataSource(
    ctx: IntegrationCheckContext, agentID: string, fx: FlsFixture, path: string,
    resultType: MJAIAgentDataSourceEntity['ResultType'], cachePolicy: MJAIAgentDataSourceEntity['CachePolicy'], order: number
): Promise<void> {
    const source = await ctx.Provider.GetEntityObject<MJAIAgentDataSourceEntity>('MJ: AI Agent Data Sources', ctx.User);
    source.NewRecord();
    source.AgentID = agentID;
    source.Name = `${path} ${FIXTURE_TAG}`;
    source.SourceType = 'RunView';
    source.EntityName = SEEDED_FLS_ENTITY;
    source.ExtraFilter = `ID = '${fx.FixtureEmployeeID}'`;
    source.ResultType = resultType;
    source.CachePolicy = cachePolicy;
    source.CacheTimeoutSeconds = 600;
    source.DestinationType = 'Data';
    source.DestinationPath = path;
    source.ExecutionOrder = order;
    source.Status = 'Active';
    Assert(await source.Save(), `creating the agent data source '${path}' failed: ${source.LatestResult?.CompleteMessage ?? ''}`);
    state.CreatedDataSourceIDs.push(source.ID);
}

/** One preload's data as `user`, asserted to have loaded both fixture sources. */
async function preloadAs(agentID: string, user: UserInfo): Promise<Record<string, unknown>> {
    const result = await AgentDataPreloader.Instance.PreloadAgentData(agentID, user);
    Assert(result.failedSources.length === 0, `CO17: preloading as ${user.Email} failed: ${result.failedSources.map(f => `${f.name}: ${f.errorMessage}`).join('; ')}`);
    return result.data;
}

/** CO17 — a PerAgent-cached data source is cached per user, and an entity_object source hands the agent no denied value. */
export async function CheckCo17AgentDataSourcePerUser(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO17');
    if (!r) return;
    const agents = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: AI Agents', ExtraFilter: `Name = '${DATA_SOURCE_AGENT_NAME}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true }, ctx.User);
    if (!agents.Success || agents.Results.length !== 1) return skip('CO17', `the seeded '${DATA_SOURCE_AGENT_NAME}' agent is not present. Seed with \`${SEED_FIXTURES_COMMAND}\`.`);
    const agentID = agents.Results[0].ID;
    await createDataSource(ctx, agentID, r.Fx, 'closeoutCached', 'simple', 'PerAgent', 900);
    await createDataSource(ctx, agentID, r.Fx, 'closeoutObjects', 'entity_object', 'None', 901);
    await AIEngine.Instance.Config(true, ctx.User);
    AgentDataPreloader.Instance.ClearAgentCache();

    const asWriter = await preloadAs(agentID, r.Fx.Writer!);
    const writerRows = asWriter['closeoutCached'] as Record<string, unknown>[];
    AssertValuePresent(writerRows?.[0], FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO17 writer cached row (control)');

    const asReader = await preloadAs(agentID, r.Fx.Reader!);
    const readerRows = asReader['closeoutCached'] as Record<string, unknown>[];
    Assert(readerRows?.length === 1, 'CO17: the reader must get the fixture row from the cached source');
    AssertValuesWithheld(readerRows[0], FLS_READER_DENIED_FIELD, r.Markers.Email,
        'CO17 reader cached row (a PerAgent cache shared across users would have served the writer\'s row)');
    const readerObjects = asReader['closeoutObjects'] as BaseEntity[];
    Assert(readerObjects?.length === 1, 'CO17: the reader must get the fixture object from the entity_object source');
    await AssertEntityObjectWithholds(readerObjects[0], FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO17 reader entity_object source');
}

/** SearchEngine with its permission pass exposed, reading metadata through the run's provider. */
class FlsCloseoutSearchProbe extends SearchEngine {
    private probeProvider: IMetadataProvider | undefined;

    public static For(provider: IMetadataProvider): FlsCloseoutSearchProbe {
        const probe = FlsCloseoutSearchProbe.getInstance<FlsCloseoutSearchProbe>();
        probe.probeProvider = provider;
        return probe;
    }

    protected override get ProviderToUse(): IMetadataProvider {
        if (!this.probeProvider) {
            throw new Error('FlsCloseoutSearchProbe used before For(provider)');
        }
        return this.probeProvider;
    }

    public async FilterByPermissions(results: SearchResultItem[], contextUser: UserInfo): Promise<SearchResultItem[]> {
        return this.filterByPermissions(results, contextUser);
    }
}

/** A vector hit for the fixture employee whose metadata and snippet carry the denied value, as an index built by an admin holds it. */
function indexedHit(fx: FlsFixture, markers: CloseoutMarkers): SearchResultItem {
    return {
        ID: `co18-${fx.FixtureEmployeeID}`,
        EntityName: SEEDED_FLS_ENTITY,
        RecordID: fx.FixtureEmployeeID!,
        SourceType: 'vector',
        ResultType: 'entity-record',
        Title: `${SEEDED_FLS_ENTITY} Record`,
        Snippet: `Fixture Employee — contact ${markers.Email}`,
        RawMetadata: JSON.stringify({ Entity: SEEDED_FLS_ENTITY, FirstName: 'Fixture', [FLS_READER_DENIED_FIELD]: markers.Email }),
        Score: 0.9,
        ScoreBreakdown: { Vector: 0.9 },
        Tags: [],
        MatchedAt: new Date(),
    };
}

/** CO18 — search results the reader may see have the denied field projected out of RawMetadata and the snippet. */
export async function CheckCo18SearchResultsProjected(ctx: IntegrationCheckContext): Promise<void> {
    const r = ready(ctx, 'CO18');
    if (!r) return;
    const probe = FlsCloseoutSearchProbe.For(ctx.Provider);
    const forReader = await probe.FilterByPermissions([indexedHit(r.Fx, r.Markers)], r.Fx.Reader!);
    Assert(forReader.length === 1, `CO18: the reader may read the row, so the hit must survive (got ${forReader.length})`);
    const metadata = JSON.parse(forReader[0].RawMetadata ?? '{}') as Record<string, unknown>;
    AssertValuesWithheld(metadata, FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO18 reader RawMetadata');
    AssertEqual(metadata['FirstName'], 'Fixture', 'CO18: readable metadata must survive the projection');
    Assert(!forReader[0].Snippet.includes(r.Markers.Email), 'LEAK: CO18: the denied value reached the reader through the snippet');
    Assert(!forReader[0].Title.includes(r.Markers.Email), 'LEAK: CO18: the denied value reached the reader through the title');

    const forWriter = await probe.FilterByPermissions([indexedHit(r.Fx, r.Markers)], r.Fx.Writer!);
    Assert(forWriter.length === 1, 'CO18: the writer\'s hit must survive');
    AssertValuePresent(JSON.parse(forWriter[0].RawMetadata ?? '{}') as Record<string, unknown>, FLS_READER_DENIED_FIELD, r.Markers.Email, 'CO18 writer RawMetadata (control)');
    Assert(forWriter[0].Snippet.includes(r.Markers.Email), 'CO18: the writer\'s snippet must be untouched (control)');
}

/** The 'fls-closeout' bundle (server transport). Order is not load-bearing beyond CO10 creating the dataset CO11 reuses. */
export const FlsCloseoutChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.CO1`, Name: 'CO1: RunView entity_object objects hold no denied value by any accessor for the restricted user, on a cold read and on a slot an unrestricted user warmed; the unrestricted user\'s objects are full width', Fn: CheckCo1EntityObjectRunViewWidth },
    { Id: `${BUNDLE}.CO2`, Name: 'CO2: an object loaded by a restricted user still holds no denied value after Save re-reads the row, and the withheld column keeps its stored value', Fn: CheckCo2LoadAndSaveWidth },
    { Id: `${BUNDLE}.CO3`, Name: 'CO3: LoadFromData with a full-width row leaves the restricted user\'s object without the denied value and does not modify the row', Fn: CheckCo3LoadFromDataWidth },
    { Id: `${BUNDLE}.CO4`, Name: 'CO4: OverrideExcludeFilter naming a denied field is refused with the ambiguous wording', Fn: CheckCo4OverrideExcludeFilterRefused },
    { Id: `${BUNDLE}.CO5`, Name: 'CO5: a view\'s stored WhereClause naming a denied field is refused, for an in-memory view and a saved view run by ViewID', Fn: CheckCo5StoredWhereClauseRefused },
    { Id: `${BUNDLE}.CO6`, Name: 'CO6: a CustomWhereClause view run by ViewID is refused for the restricted user and runs for the unrestricted one', Fn: CheckCo6CustomWhereClauseViewRefused },
    { Id: `${BUNDLE}.CO7`, Name: 'CO7: whole-row constructs (CHECKSUM(*), alias.*, FOR JSON) are refused for a caller with denials, and never as whole-row reads for a caller denied nothing', Fn: CheckCo7WholeRowConstructsRefused },
    { Id: `${BUNDLE}.CO8`, Name: 'CO8: bracketed, quoted, qualified, mixed-case and compatibility-folded spellings of a denied column are refused; its name inside a string or comment is not', Fn: CheckCo8LookAlikeSpellings },
    { Id: `${BUNDLE}.CO9`, Name: 'CO9: an unknown column in ExtraFilter or OrderBy is refused with exactly the denied column\'s wording, and only for a caller with denials', Fn: CheckCo9UnknownEqualsDenied },
    { Id: `${BUNDLE}.CO10`, Name: 'CO10: dataset item rows are projected for the restricted user, cold and on the slot an unrestricted user warmed', Fn: CheckCo10DatasetRowsProjected },
    { Id: `${BUNDLE}.CO11`, Name: 'CO11: a dataset ItemFilter on a denied field, or an unknown one, is refused with the same wording', Fn: CheckCo11DatasetItemFilterRefused },
    { Id: `${BUNDLE}.CO12`, Name: 'CO12: a ViewID-only read of Record Changes projects each audit row\'s payload against the entity it is about', Fn: CheckCo12RecordChangesViewIDProjected },
    { Id: `${BUNDLE}.CO13`, Name: 'CO13: a lowercase \'deny\' on a non-system role is stored as \'Deny\' and enforced', Fn: CheckCo13LowercaseDenyNormalized },
    { Id: `${BUNDLE}.CO14`, Name: 'CO14: a lowercase \'deny\' aimed at a role the system user holds is refused by the system-user guard', Fn: CheckCo14LowercaseDenyOnSystemRoleRefused, RequiresMutation: true },
    { Id: `${BUNDLE}.CO15`, Name: 'CO15: re-pointing the RoleID of the rule carrying the system user\'s last Allow is refused, and the rule stays on its role', Fn: CheckCo15RuleRePointRefused, RequiresMutation: true },
    { Id: `${BUNDLE}.CO16`, Name: 'CO16: re-pointing a system-user role assignment to another user is refused when the role carries the system user\'s last Allow', Fn: CheckCo16UserRoleRePointRefused, RequiresMutation: true },
    { Id: `${BUNDLE}.CO17`, Name: 'CO17: an agent data source cached PerAgent is cached per user (the restricted user never gets the unrestricted user\'s rows), and an entity_object source hands the agent no denied value', Fn: CheckCo17AgentDataSourcePerUser },
    { Id: `${BUNDLE}.CO18`, Name: 'CO18: search results the restricted user may see have the denied field projected out of RawMetadata and the snippet; the unrestricted user\'s are untouched', Fn: CheckCo18SearchResultsProjected },
    { Id: `${BUNDLE}.CO19`, Name: 'CO19: a restricted user\'s own save stores a full-width Record Change — the unrestricted writer sees the denied field\'s stored value and only the edited field as changed, while the saver\'s read of the same row is projected', Fn: CheckCo19RestrictedSaveStoresFullSnapshot },
];

for (const check of FlsCloseoutChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
