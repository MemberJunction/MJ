/**
 * record-cloning.checks.ts — the 'record-cloning' bundle (RC1–RC12, IT95): entity record graph
 * cloning exercised CLIENT-FIRST, over the real GraphQL wire.
 *
 * WHY CLIENT TRANSPORT. Cloning is entity CRUD plus a permission gate, and both have a client
 * surface: a browser calls `RecordClone.Plan` / `RecordClone.Execute` exactly as these checks do
 * (`new RecordClone<Op>Operation().Execute(input, { provider })`), and the wire leg proves the
 * resolver dispatched to the server operation classes in `@memberjunction/record-cloning`, that
 * the engine re-planned server-side, and that everything it wrote (clone logs, `ClonedFrom` links,
 * `Source='Clone'` Record Changes) landed in the database a client can read back.
 *
 * THE TWO IDENTITIES. The process-global provider authenticates with the system API key; on a
 * default install that is the seeded System user (an Owner holding the Developer role, which holds
 * every `Clone Records*` authorization and `Record Changes: Annotate`). The denied identity RC4 and
 * RC9 need is a throwaway subject user with only the UI role, reached through a user API key on a
 * secondary GraphQL connection — the per-user API-key provider pattern from the FLS client bundle
 * (fls-client.checks.ts). A passed contextUser cannot change who the server thinks is calling, so
 * per-user authorization over the wire is only observable through per-user authentication.
 *
 * TIERS. RC3 and RC10–RC12 are read-only and run in every lane: a dry run or a Plan that writes is
 * itself the bug. RC11 creates a throwaway company integration only when the mutation tier is armed
 * and no scheduled job already has one; otherwise it runs its assertions on the jobs that exist and
 * says what it could not cover. Every other check writes and carries `RequiresMutation: true`.
 *
 * FIXTURES. Setup writes nothing. The mutating checks provision the subject user on first use and
 * append every row they (or a clone they executed) created to the module-scoped fixture; each row
 * is prefixed per run and tagged "(mj-integration-test — safe to delete)". Teardown sweeps FK-safe
 * in reverse: clone log items and logs, `ClonedFrom` links, created rows (retried until no pass
 * makes progress), then everything hanging off the throwaway users, then the users.
 *
 * @see plans/record-cloning/README.md §13.2
 */
import { CompositeKey, RunView } from '@memberjunction/core';
import type { EntityInfo, IEntityDataProvider, IMetadataProvider } from '@memberjunction/core';
import { ENCRYPTED_SENTINEL, GetGlobalObjectStore, UUIDsEqual } from '@memberjunction/global';
import {
    MJAPIKeyScopeEntity,
    MJCompanyEntity,
    MJCompanyIntegrationEntity,
    MJQueryCategoryEntity,
    MJRecordChangeEntity,
    MJUserApplicationEntity,
    MJUserEntity,
    MJUserRoleEntity,
    MJUserSettingEntity,
    RecordCloneDescribeOperation,
    RecordCloneExecuteOperation,
    RecordClonePlanOperation,
    type RecordCloneExecuteInput,
    type RecordCloneExecuteOutput,
    type RecordClonePlanDetails,
    type RecordClonePlanInput,
} from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { GetAPIKeyEngine } from '@memberjunction/api-keys';
import { Assert, AssertEqual, IntegrationCheckRegistry, IsTierEnabled, LoadClientConfig } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext, RecordCloningFixture } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

const USERS = 'MJ: Users';
const USER_ROLES = 'MJ: User Roles';
const USER_APPLICATIONS = 'MJ: User Applications';
const USER_SETTINGS = 'MJ: User Settings';
const AI_PROMPTS = 'MJ: AI Prompts';
const TEMPLATES = 'MJ: Templates';
const TEMPLATE_CONTENTS = 'MJ: Template Contents';
const AI_AGENTS = 'MJ: AI Agents';
const AI_AGENT_PROMPTS = 'MJ: AI Agent Prompts';
const ACTIONS = 'MJ: Actions';
const SCHEDULED_JOBS = 'MJ: Scheduled Jobs';
const COMPANY_INTEGRATIONS = 'MJ: Company Integrations';
const QUERY_CATEGORIES = 'MJ: Query Categories';
const RECORD_CHANGES = 'MJ: Record Changes';
const CLONE_LOGS = 'MJ: Record Clone Logs';
const CLONE_LOG_ITEMS = 'MJ: Record Clone Log Items';
const RECORD_LINKS = 'MJ: Record Links';

/** Settings the shipped `MJ: Users` configuration's `ExcludeRows` must never copy (plan §13.2, RC12). */
const EXCLUDED_SETTING_PREFIXES = ['mobile.', 'mj.chat.drafts', 'mj.realtimeVoice.recordingConsent'];

/** The three settings the subject user carries: one ordinary, two the configuration excludes. */
const SUBJECT_SETTINGS: Array<{ Setting: string; Value: string }> = [
    { Setting: 'it95.layout.width', Value: '320' },
    { Setting: 'mobile.it95.pushToken', Value: 'device-token' },
    { Setting: 'mj.chat.drafts.it95', Value: 'draft text' },
];

/** How long provisioning waits for MJAPI to honor a freshly minted key's scope rule (its scope cache has a staleness envelope). */
const KEY_PROPAGATION_TIMEOUT_MS = 90_000;

// ─────────────────────────────────────────────────────────────────── plumbing

/** Fetch the fixture (throws if the lifecycle Setup didn't run — a wiring bug, not a test failure). */
function fx(ctx: IntegrationCheckContext): RecordCloningFixture {
    Assert(ctx.RecordCloningFixture != null, 'record-cloning fixture missing (bundle Setup did not run)');
    return ctx.RecordCloningFixture!;
}

function idKey(id: string): { KeyValuePairs: Array<{ FieldName: string; Value: string }> } {
    return { KeyValuePairs: [{ FieldName: 'ID', Value: id }] };
}

/** A SQL string literal list for an IN (...) filter. Values are ids this bundle read or minted. */
function sqlList(values: string[]): string {
    return values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ');
}

async function readRows<T = Record<string, unknown>>(
    provider: IMetadataProvider,
    entityName: string,
    filter: string,
    extra: { Fields?: string[]; OrderBy?: string; MaxRows?: number } = {}
): Promise<T[]> {
    const res = await RunView.FromMetadataProvider(provider).RunView<T>({
        EntityName: entityName,
        ExtraFilter: filter,
        ResultType: 'simple',
        BypassCache: true,
        ...extra,
    });
    Assert(res.Success, `reading ${entityName} (${filter}) failed: ${res.ErrorMessage}`);
    return res.Results ?? [];
}

async function countRows(provider: IMetadataProvider, entityName: string, filter = ''): Promise<number> {
    const res = await RunView.FromMetadataProvider(provider).RunView({
        EntityName: entityName,
        ExtraFilter: filter,
        ResultType: 'count_only',
        BypassCache: true,
    });
    Assert(res.Success, `counting ${entityName} failed: ${res.ErrorMessage}`);
    return res.TotalRowCount;
}

/** Plans over the wire and returns the plan. The operation itself must succeed; the plan may still be blocked. */
async function planClone(provider: IMetadataProvider, input: RecordClonePlanInput, label: string): Promise<RecordClonePlanDetails> {
    const result = await new RecordClonePlanOperation().Execute(input, { provider });
    Assert(result.Success && result.Output?.Plan != null,
        `${label}: RecordClone.Plan failed over the wire — ${result.ResultCode}: ${result.ErrorMessage}`);
    return result.Output!.Plan;
}

/** Executes over the wire. The operation must reach the engine; the clone itself may still be refused. */
async function executeClone(provider: IMetadataProvider, input: RecordCloneExecuteInput, label: string): Promise<RecordCloneExecuteOutput> {
    const result = await new RecordCloneExecuteOperation().Execute(input, { provider });
    Assert(result.Success && result.Output != null,
        `${label}: RecordClone.Execute did not reach the engine — ${result.ResultCode}: ${result.ErrorMessage}`);
    return result.Output!;
}

/** Records an Execute's source and everything it created, so Teardown sweeps it even if a later assertion throws. */
function trackExecute(ctx: IntegrationCheckContext, sourceId: string, out: RecordCloneExecuteOutput | undefined): void {
    const f = fx(ctx);
    if (!f.SourceRecordIDs.some((id) => UUIDsEqual(id, sourceId))) {
        f.SourceRecordIDs.push(sourceId);
    }
    for (const created of out?.Created ?? []) {
        if (!created.TargetKey) continue;
        if (created.EntityName === USERS) {
            f.UserIDs.push(created.TargetKey);
        } else {
            f.CreatedRows.push({ entity: created.EntityName, id: created.TargetKey });
        }
    }
}

function rootTarget(out: RecordCloneExecuteOutput, label: string): string {
    const target = out.Roots?.[0]?.TargetKey;
    Assert(!!target, `${label}: a successful clone must report the root's new key`);
    return target!;
}

function describeFailure(out: RecordCloneExecuteOutput): string {
    const errors = (out.Warnings ?? []).filter((w) => w.Severity === 'Error').map((w) => `${w.Code}: ${w.Message}`);
    return `${out.ResultCode} — ${out.ErrorMessage ?? ''}${errors.length ? ` [${errors.join('; ')}]` : ''}`;
}

function nodesOf(plan: RecordClonePlanDetails, entityName: string): RecordClonePlanDetails['Nodes'] {
    return plan.Nodes.filter((n) => n.EntityName === entityName);
}

/** The key a plan node's SourceKey names, for a single-column `ID` key ('abc' or 'ID|abc'). */
function bareKey(key: string): string {
    return key.includes('|') ? key.slice(key.lastIndexOf('|') + 1) : key;
}

/** The value a plan's field-change chain leaves a field at (the last change wins). */
function finalValue(node: RecordClonePlanDetails['Nodes'][number], field: string): unknown {
    const changes = node.FieldChanges.filter((c) => c.Field === field);
    return changes.length > 0 ? changes[changes.length - 1].NewValue : undefined;
}

function promptedValuesFor(f: RecordCloningFixture, label: string): Record<string, string> {
    return { Email: `${f.Prefix}-${label}@integration.test`, FirstName: 'IT95', LastName: `${label} clone ${FIXTURE_TAG}` };
}

// ─────────────────────────────────────────────────────────────────── source records

/** A prompt with a template that has at least one content row — the RC2/RC3/RC4/RC6 source. */
async function findPromptWithTemplate(ctx: IntegrationCheckContext): Promise<{ ID: string; Name: string; TemplateID: string }> {
    const prompts = await readRows<{ ID: string; Name: string; TemplateID: string }>(
        ctx.Provider, AI_PROMPTS, 'TemplateID IS NOT NULL', { Fields: ['ID', 'Name', 'TemplateID'], OrderBy: 'Name ASC', MaxRows: 200 });
    Assert(prompts.length > 0, `no ${AI_PROMPTS} row with a template exists — the fixture data is not what this bundle assumes`);
    const contents = await readRows<{ TemplateID: string }>(
        ctx.Provider, TEMPLATE_CONTENTS, `TemplateID IN (${sqlList(prompts.map((p) => p.TemplateID))})`, { Fields: ['TemplateID'] });
    const withContent = prompts.find((p) => contents.some((c) => UUIDsEqual(c.TemplateID, p.TemplateID)));
    Assert(withContent != null, `no ${AI_PROMPTS} row has a template with content rows`);
    return withContent!;
}

// ─────────────────────────────────────────────────────────────────── the subject user and the denied identity

/**
 * GraphQLDataProvider's Global-Object-Store key. Its constructor returns the registered singleton
 * whenever one exists, so the slot is parked around construction to get a genuinely separate
 * connection (the same workaround as fls-client.checks.ts; see the note there).
 */
const GRAPHQL_PROVIDER_SINGLETON_KEY = '___SINGLETON__GraphQLDataProvider';

function newSecondaryGraphQLProvider(): GraphQLDataProvider {
    const store = GetGlobalObjectStore();
    const singleton = store?.[GRAPHQL_PROVIDER_SINGLETON_KEY];
    if (store) {
        delete store[GRAPHQL_PROVIDER_SINGLETON_KEY];
    }
    try {
        return new GraphQLDataProvider();
    } finally {
        if (store) {
            store[GRAPHQL_PROVIDER_SINGLETON_KEY] = singleton;
        }
    }
}

/** A secondary GraphQL provider authenticated by a user API key, retried while MJAPI's scope cache catches up. */
async function buildUserKeyProvider(rawKey: string): Promise<IMetadataProvider> {
    const deadline = Date.now() + KEY_PROPAGATION_TIMEOUT_MS;
    for (;;) {
        try {
            const client = LoadClientConfig();
            const provider = newSecondaryGraphQLProvider();
            const config = new GraphQLProviderConfigData(
                '', client.Url, '', async () => '', undefined, undefined, undefined, undefined, rawKey);
            if (!(await provider.Config(config, undefined, true /* separateConnection */))) {
                throw new Error('secondary GraphQLDataProvider Config() returned false');
            }
            return provider as unknown as IMetadataProvider;
        } catch (e) {
            if (Date.now() > deadline) {
                throw e;
            }
            await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
    }
}

async function saveOrThrow(entity: { Save(): Promise<boolean>; LatestResult?: { CompleteMessage?: string } | null }, what: string): Promise<void> {
    if (!(await entity.Save())) {
        throw new Error(`creating ${what} over the wire failed: ${entity.LatestResult?.CompleteMessage ?? 'Save() returned false'}`);
    }
}

/**
 * The throwaway subject user, provisioned on first use by a mutating check: UI role only (so it
 * holds no clone authorization), one application, the three {@link SUBJECT_SETTINGS}, one query
 * category, and a user API key whose connection is the denied identity.
 */
async function ensureSubject(ctx: IntegrationCheckContext): Promise<{ UserID: string; Denied: IMetadataProvider }> {
    const f = fx(ctx);
    if (f.ProvisionError) {
        throw new Error(`the subject user could not be provisioned earlier: ${f.ProvisionError}`);
    }
    if (f.SubjectUserID && f.DeniedProvider) {
        return { UserID: f.SubjectUserID, Denied: f.DeniedProvider };
    }
    try {
        const md = ctx.Provider;
        const user = await md.GetEntityObject<MJUserEntity>(USERS, ctx.User);
        user.NewRecord();
        user.Name = `${f.Prefix}-subject`;
        user.Email = `${f.Prefix}-subject@integration.test`;
        user.FirstName = 'IT95';
        user.LastName = `Subject ${FIXTURE_TAG}`;
        user.Title = FIXTURE_TAG;
        user.Type = 'User';
        user.IsActive = true;
        await saveOrThrow(user, 'the subject user');
        f.UserIDs.push(user.ID);
        f.SubjectUserID = user.ID;

        const uiRole = md.Roles.find((r) => r.Name === 'UI');
        if (!uiRole) {
            throw new Error("the seeded 'UI' role was not found");
        }
        const existingRoles = await readRows<{ RoleID: string }>(md, USER_ROLES, `UserID = '${user.ID}'`, { Fields: ['RoleID'] });
        if (!existingRoles.some((r) => UUIDsEqual(r.RoleID, uiRole.ID))) {
            const role = await md.GetEntityObject<MJUserRoleEntity>(USER_ROLES, ctx.User);
            role.NewRecord();
            role.UserID = user.ID;
            role.RoleID = uiRole.ID;
            await saveOrThrow(role, 'the subject UI role');
        }

        const existingApps = await readRows<{ ApplicationID: string }>(md, USER_APPLICATIONS, `UserID = '${user.ID}'`, { Fields: ['ApplicationID'] });
        if (existingApps.length === 0) {
            const apps = await readRows<{ ID: string }>(md, 'MJ: Applications', '', { Fields: ['ID'], OrderBy: 'Name ASC', MaxRows: 1 });
            if (apps.length === 0) {
                throw new Error('no MJ: Applications row to enroll the subject in');
            }
            const app = await md.GetEntityObject<MJUserApplicationEntity>(USER_APPLICATIONS, ctx.User);
            app.NewRecord();
            app.UserID = user.ID;
            app.ApplicationID = apps[0].ID;
            app.Sequence = 0;
            app.IsActive = true;
            await saveOrThrow(app, 'the subject application');
        }

        for (const s of SUBJECT_SETTINGS) {
            const setting = await md.GetEntityObject<MJUserSettingEntity>(USER_SETTINGS, ctx.User);
            setting.NewRecord();
            setting.UserID = user.ID;
            setting.Setting = s.Setting;
            setting.Value = s.Value;
            await saveOrThrow(setting, `the subject setting '${s.Setting}'`);
        }

        const category = await md.GetEntityObject<MJQueryCategoryEntity>(QUERY_CATEGORIES, ctx.User);
        category.NewRecord();
        category.Name = `${f.Prefix}-qc`;
        category.Description = FIXTURE_TAG;
        category.UserID = user.ID;
        await saveOrThrow(category, 'the subject query category');
        f.CreatedRows.push({ entity: QUERY_CATEGORIES, id: category.ID });
        f.SubjectQueryCategoryID = category.ID;

        // The denied identity: a user API key granted full_access, so the only thing that can stop
        // the subject is the clone authorization itself (scope enforcement fails closed otherwise).
        const engine = GetAPIKeyEngine();
        const created = await engine.CreateAPIKey({ UserId: user.ID, Label: `IT95 record-cloning subject ${FIXTURE_TAG}` }, ctx.User);
        if (!created.Success || !created.RawKey || !created.APIKeyId) {
            throw new Error(`CreateAPIKey failed: ${created.Error ?? 'no raw key returned'}`);
        }
        f.ApiKeyIDs.push(created.APIKeyId);
        const fullAccess = engine.Scopes.find((s) => s.FullPath === 'full_access');
        if (!fullAccess) {
            throw new Error("the seeded 'full_access' API scope was not found");
        }
        const rule = await md.GetEntityObject<MJAPIKeyScopeEntity>('MJ: API Key Scopes', ctx.User);
        rule.NewRecord();
        rule.APIKeyID = created.APIKeyId;
        rule.ScopeID = fullAccess.ID;
        rule.ResourcePattern = '*';
        rule.PatternType = 'Include';
        rule.IsDeny = false;
        rule.Priority = 0;
        await saveOrThrow(rule, 'the full_access scope rule');
        f.ApiKeyScopeIDs.push(rule.ID);

        f.DeniedProvider = await buildUserKeyProvider(created.RawKey);
        return { UserID: user.ID, Denied: f.DeniedProvider };
    } catch (e) {
        f.ProvisionError = e instanceof Error ? e.message : String(e);
        throw e;
    }
}

// ─────────────────────────────────────────────────────────────────── checks

export const RecordCloningChecks: NamedCheck[] = [
    {
        Id: 'record-cloning.RC1',
        Name: 'RC1: cloning a user carries roles, applications and settings; the source keeps its rows; the clone is inactive and not an Owner',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const { UserID: subjectId } = await ensureSubject(ctx);
            const md = ctx.Provider;
            const srcRoles = await readRows<{ RoleID: string }>(md, USER_ROLES, `UserID = '${subjectId}'`, { Fields: ['RoleID'] });
            const srcApps = await readRows<{ ApplicationID: string }>(md, USER_APPLICATIONS, `UserID = '${subjectId}'`, { Fields: ['ApplicationID'] });
            const srcSettings = await readRows<{ Setting: string }>(md, USER_SETTINGS, `UserID = '${subjectId}'`, { Fields: ['Setting'] });
            Assert(srcRoles.length > 0 && srcApps.length > 0 && srcSettings.length === SUBJECT_SETTINGS.length,
                `RC1: the subject should carry roles, applications and ${SUBJECT_SETTINGS.length} settings (got ${srcRoles.length}/${srcApps.length}/${srcSettings.length})`);

            const prompted = promptedValuesFor(f, 'rc1');
            const out = await executeClone(md, {
                EntityName: USERS,
                SourceRecordKey: idKey(subjectId),
                Options: { Preset: 'with-settings', PromptedValues: prompted, Reason: `IT95 RC1 ${FIXTURE_TAG}` },
            }, 'RC1');
            trackExecute(ctx, subjectId, out);
            Assert(out.Success && out.ResultCode === 'SUCCESS', `RC1: the user clone failed — ${describeFailure(out)}`);
            const cloneId = rootTarget(out, 'RC1');
            Assert(!UUIDsEqual(cloneId, subjectId), 'RC1: the clone must be a new user');

            const clone = (await readRows<{ Email: string; IsActive: boolean; Type: string }>(md, USERS, `ID = '${cloneId}'`, { Fields: ['Email', 'IsActive', 'Type'] }))[0];
            Assert(clone != null, `RC1: the cloned user ${cloneId} is not readable`);
            AssertEqual(clone.Email, prompted.Email, 'RC1: the clone must take the prompted Email');
            AssertEqual(clone.IsActive, false, 'RC1: a cloned user must start inactive');
            AssertEqual(String(clone.Type).trim(), 'User', 'RC1: a cloned user must never be an Owner');

            const expectedSettings = srcSettings.map((s) => s.Setting)
                .filter((s) => !EXCLUDED_SETTING_PREFIXES.some((p) => s.startsWith(p))).sort().join(',');
            const cloneSettings = await readRows<{ Setting: string }>(md, USER_SETTINGS, `UserID = '${cloneId}'`, { Fields: ['Setting'] });
            AssertEqual(cloneSettings.map((s) => s.Setting).sort().join(','), expectedSettings,
                'RC1: with-settings must copy the ordinary settings and leave out device tokens and chat drafts');

            // Copy, not move: the source still owns every row it had.
            AssertEqual(await countRows(md, USER_ROLES, `UserID = '${subjectId}'`), srcRoles.length, 'RC1: the source lost roles');
            AssertEqual(await countRows(md, USER_APPLICATIONS, `UserID = '${subjectId}'`), srcApps.length, 'RC1: the source lost applications');
            AssertEqual(await countRows(md, USER_SETTINGS, `UserID = '${subjectId}'`), srcSettings.length, 'RC1: the source lost settings');

            // The subject is not an Owner, so the reset above proves only IsActive. Plan (writes
            // nothing) a clone of the acting Owner and confirm the configured Type reset applies.
            if (String(ctx.User.Type ?? '').trim() === 'Owner') {
                const ownerPlan = await planClone(md, {
                    EntityName: USERS,
                    SourceRecordKey: idKey(ctx.User.ID),
                    Options: { PromptedValues: promptedValuesFor(f, 'rc1-owner') },
                }, 'RC1 owner plan');
                const root = ownerPlan.Nodes.find((n) => n.Depth === 0 && n.EntityName === USERS);
                Assert(root != null, 'RC1: the owner plan has no root node');
                AssertEqual(finalValue(root!, 'Type'), 'User', 'RC1: a clone of an Owner must be planned as a plain User');
            }

            // Roles and applications last, so a failure here still reports everything above.
            const sortIds = (ids: string[]) => ids.map((i) => i.toLowerCase()).sort().join(',');
            const cloneRoles = await readRows<{ RoleID: string }>(md, USER_ROLES, `UserID = '${cloneId}'`, { Fields: ['RoleID'] });
            AssertEqual(sortIds(cloneRoles.map((r) => r.RoleID)), sortIds(srcRoles.map((r) => r.RoleID)),
                `RC1: the clone must carry the source's roles (MJ: User Roles is Deep and Locked in the MJ: Users configuration)`);
            const cloneApps = await readRows<{ ApplicationID: string }>(md, USER_APPLICATIONS, `UserID = '${cloneId}'`, { Fields: ['ApplicationID'] });
            AssertEqual(sortIds(cloneApps.map((a) => a.ApplicationID)), sortIds(srcApps.map((a) => a.ApplicationID)),
                'RC1: the clone must carry the source\'s application entries');
        },
    },
    {
        Id: 'record-cloning.RC2',
        Name: 'RC2: cloning an AI prompt deep-clones its template and template contents instead of aliasing the original',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const md = ctx.Provider;
            const source = await findPromptWithTemplate(ctx);
            const srcContents = await readRows<{ ID: string; TemplateText: string | null }>(
                md, TEMPLATE_CONTENTS, `TemplateID = '${source.TemplateID}'`, { Fields: ['ID', 'TemplateText'] });

            const out = await executeClone(md, { EntityName: AI_PROMPTS, SourceRecordKey: idKey(source.ID) }, 'RC2');
            trackExecute(ctx, source.ID, out);
            Assert(out.Success && out.ResultCode === 'SUCCESS', `RC2: the prompt clone failed — ${describeFailure(out)}`);
            const cloneId = rootTarget(out, 'RC2');

            const clone = (await readRows<{ TemplateID: string | null }>(md, AI_PROMPTS, `ID = '${cloneId}'`, { Fields: ['TemplateID'] }))[0];
            Assert(clone?.TemplateID != null, 'RC2: the cloned prompt must have a template');
            Assert(!UUIDsEqual(clone.TemplateID!, source.TemplateID),
                'RC2: the cloned prompt points at the ORIGINAL template — it was aliased, not deep-cloned');
            AssertEqual(await countRows(md, TEMPLATES, `ID = '${clone.TemplateID}'`), 1, 'RC2: the cloned template row must exist');

            const cloneContents = await readRows<{ ID: string; TemplateText: string | null }>(
                md, TEMPLATE_CONTENTS, `TemplateID = '${clone.TemplateID}'`, { Fields: ['ID', 'TemplateText'] });
            AssertEqual(cloneContents.length, srcContents.length,
                `RC2: the cloned template must carry its own copy of each of the source's ${srcContents.length} content row(s)`);
            Assert(cloneContents.every((c) => !srcContents.some((s) => UUIDsEqual(s.ID, c.ID))),
                'RC2: a cloned content row reuses a source row id');
            AssertEqual(cloneContents.map((c) => c.TemplateText ?? '').sort().join('\u0000'),
                srcContents.map((c) => c.TemplateText ?? '').sort().join('\u0000'),
                'RC2: the cloned contents must carry the same template text');
            AssertEqual(await countRows(md, TEMPLATE_CONTENTS, `TemplateID = '${source.TemplateID}'`), srcContents.length,
                'RC2: the source template\'s contents changed');
        },
    },
    {
        Id: 'record-cloning.RC3',
        Name: 'RC3: a dry run computes a non-empty plan and writes nothing in any entity of the graph',
        Fn: async (ctx: IntegrationCheckContext) => {
            const md = ctx.Provider;
            const source = await findPromptWithTemplate(ctx);
            const input: RecordClonePlanInput = { EntityName: AI_PROMPTS, SourceRecordKey: idKey(source.ID) };

            const first = await planClone(md, input, 'RC3');
            Assert(!first.Blocked, `RC3: the plan is blocked — ${first.Warnings.filter((w) => w.Severity === 'Error').map((w) => w.Message).join('; ')}`);
            Assert(first.Nodes.length > 0 && first.Counts.Create > 0, 'RC3: the plan must be non-empty and create at least one row');

            const watched = [...new Set([...first.Nodes.map((n) => n.EntityName), CLONE_LOGS, CLONE_LOG_ITEMS, RECORD_LINKS, RECORD_CHANGES])];
            const before = new Map<string, number>();
            for (const e of watched) before.set(e, await countRows(md, e));

            const dry = await executeClone(md, { ...input, Options: { DryRun: true } }, 'RC3');
            Assert(dry.Success && dry.ResultCode === 'SUCCESS', `RC3: the dry run failed — ${describeFailure(dry)}`);
            AssertEqual(dry.CloneLogID, null, 'RC3: a dry run must not write a clone log');
            AssertEqual(dry.Created.length, 0, 'RC3: a dry run must report nothing created');
            Assert(dry.Plan != null && dry.Plan.Nodes.length > 0, 'RC3: a dry run must return the plan it computed');
            await planClone(md, input, 'RC3 second plan');

            for (const e of watched) {
                AssertEqual(await countRows(md, e), before.get(e), `RC3: the dry run wrote to ${e}`);
            }
        },
    },
    {
        Id: 'record-cloning.RC4',
        Name: 'RC4: an unauthorized caller is refused with an authorization-citing message; the same call as an authorized caller succeeds',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const md = ctx.Provider;
            const { Denied: denied } = await ensureSubject(ctx);
            const source = await findPromptWithTemplate(ctx);
            const input: RecordCloneExecuteInput = { EntityName: AI_PROMPTS, SourceRecordKey: idKey(source.ID) };

            const describe = await new RecordCloneDescribeOperation().Execute({ EntityName: AI_PROMPTS }, { provider: denied });
            Assert(describe.Success && describe.Output != null, `RC4: Describe as the denied identity failed — ${describe.ErrorMessage}`);
            AssertEqual(describe.Output!.CanClone, false, 'RC4: Describe must tell the denied identity it cannot clone');
            AssertEqual(describe.Output!.Authorization?.Granted, false, 'RC4: Describe must report the authorization as not granted');

            const promptsBefore = await countRows(md, AI_PROMPTS);
            const templatesBefore = await countRows(md, TEMPLATES);
            const refused = await executeClone(denied, input, 'RC4 denied');
            trackExecute(ctx, source.ID, refused);
            Assert(!refused.Success, 'RC4: a caller without the clone authorization was allowed to clone');
            AssertEqual(refused.ResultCode, 'FORBIDDEN', `RC4: the refusal must be FORBIDDEN (got ${describeFailure(refused)})`);
            Assert(/authorization/i.test(refused.ErrorMessage ?? '') && /Clone Records/.test(refused.ErrorMessage ?? ''),
                `RC4: the refusal must name the missing authorization, got: ${refused.ErrorMessage}`);
            AssertEqual(refused.Created.length, 0, 'RC4: a refused clone must create nothing');
            AssertEqual(await countRows(md, AI_PROMPTS), promptsBefore, 'RC4: a refused clone wrote an AI prompt');
            AssertEqual(await countRows(md, TEMPLATES), templatesBefore, 'RC4: a refused clone wrote a template');

            // Positive control: the identical call from an identity holding the authorization.
            const allowed = await executeClone(md, input, 'RC4 authorized');
            trackExecute(ctx, source.ID, allowed);
            Assert(allowed.Success && allowed.ResultCode === 'SUCCESS',
                `RC4: the same call as an authorized caller must succeed — ${describeFailure(allowed)}`);
        },
    },
    {
        Id: 'record-cloning.RC5',
        Name: 'RC5: a child failure rolls the whole clone back — no parent, no partial children, source untouched, clone log Error',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const md = ctx.Provider;
            const { UserID: subjectId } = await ensureSubject(ctx);

            // The injected failure: the subject's query category is widened to Deep (the acting user
            // holds Clone Records: Override Scope). Its copy keeps the same Name with a NULL ParentID,
            // which UX_QueryCategory_Name_NullParent rejects on insert — after the root user row was
            // already written inside the transaction.
            const relationship = md.EntityByName(USERS)?.RelatedEntities
                .find((r) => r.RelatedEntity === QUERY_CATEGORIES && r.RelatedEntityJoinField === 'UserID');
            Assert(relationship != null, `RC5: no ${USERS} → ${QUERY_CATEGORIES} relationship in metadata`);
            const categoryName = `${f.Prefix}-qc`;
            const prompted = promptedValuesFor(f, 'rc5');
            const input: RecordCloneExecuteInput = {
                EntityName: USERS,
                SourceRecordKey: idKey(subjectId),
                Options: { PromptedValues: prompted },
                EdgeOverrides: [{ RelationshipID: relationship!.ID, Policy: 'Deep' }],
            };

            const plan = await planClone(md, input, 'RC5');
            Assert(!plan.Blocked, `RC5: the plan is blocked — ${plan.Warnings.filter((w) => w.Severity === 'Error').map((w) => w.Message).join('; ')}`);
            Assert(nodesOf(plan, QUERY_CATEGORIES).some((n) => n.Action === 'Create'),
                'RC5: the Deep override on the query category edge did not take, so the injected child failure would never run');

            const subjectBefore = (await readRows<Record<string, unknown>>(md, USERS, `ID = '${subjectId}'`, { Fields: ['Email', 'Name', 'IsActive', 'Title'] }))[0];
            const settingsBefore = await countRows(md, USER_SETTINGS, `UserID = '${subjectId}'`);
            const startedAt = new Date(Date.now() - 5_000);

            const out = await executeClone(md, input, 'RC5');
            trackExecute(ctx, subjectId, out);
            Assert(!out.Success, 'RC5: the clone reported success although its query category copy cannot be inserted');
            AssertEqual(out.ResultCode, 'EXECUTION_ERROR', `RC5: a failed child must surface as EXECUTION_ERROR (got ${describeFailure(out)})`);

            AssertEqual(await countRows(md, USERS, `Email = '${prompted.Email}'`), 0, 'RC5: the parent user row survived the rollback');
            AssertEqual(await countRows(md, QUERY_CATEGORIES, `Name = '${categoryName}'`), 1, 'RC5: a partial child survived the rollback');
            const subjectAfter = (await readRows<Record<string, unknown>>(md, USERS, `ID = '${subjectId}'`, { Fields: ['Email', 'Name', 'IsActive', 'Title'] }))[0];
            AssertEqual(JSON.stringify(subjectAfter), JSON.stringify(subjectBefore), 'RC5: the source user changed');
            AssertEqual(await countRows(md, USER_SETTINGS, `UserID = '${subjectId}'`), settingsBefore, 'RC5: the source user\'s settings changed');

            const logs = await readRows<{ Status: string; ErrorMessage: string | null }>(md, CLONE_LOGS,
                `RootSourceRecordID = '${subjectId}' AND StartedAt >= '${startedAt.toISOString()}'`, { Fields: ['Status', 'ErrorMessage'] });
            Assert(logs.some((l) => l.Status === 'Error'),
                `RC5: a failed clone must leave a clone log with Status 'Error' (found: ${logs.map((l) => l.Status).join(', ') || 'none'})`);
        },
    },
    {
        Id: 'record-cloning.RC6',
        Name: "RC6: a successful clone writes Source='Clone' Record Changes naming the source, ClonedFrom links, and a Complete clone log with matching counts",
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const md = ctx.Provider;
            const source = await findPromptWithTemplate(ctx);
            const out = await executeClone(md, { EntityName: AI_PROMPTS, SourceRecordKey: idKey(source.ID) }, 'RC6');
            trackExecute(ctx, source.ID, out);
            Assert(out.Success && out.ResultCode === 'SUCCESS', `RC6: the clone failed — ${describeFailure(out)}`);
            Assert(!!out.CloneLogID, 'RC6: a successful clone must return its clone log id');
            Assert(out.Created.length > 0, 'RC6: a successful clone must report what it created');

            for (const created of out.Created) {
                const entity: EntityInfo | undefined = md.EntityByName(created.EntityName);
                Assert(entity != null, `RC6: unknown entity ${created.EntityName}`);
                if (entity!.TrackRecordChanges) {
                    const changes = await readRows<{ Source: string; Type: string; ChangeContext: string | null }>(md, RECORD_CHANGES,
                        `EntityID = '${entity!.ID}' AND RecordID IN (${sqlList([`ID|${created.TargetKey}`, created.TargetKey])})`,
                        { Fields: ['Source', 'Type', 'ChangeContext'] });
                    const create = changes.find((c) => c.Type === 'Create');
                    Assert(create != null, `RC6: no Create record change for the cloned ${created.EntityName} ${created.TargetKey}`);
                    AssertEqual(create!.Source, 'Clone', `RC6: the ${created.EntityName} create must be recorded with Source='Clone'`);
                    // ChangeContext is the versioned envelope { Version, Kind: 'Clone', Clone: CloneContext }.
                    let context: { SourceRecordID?: string; CloneLogID?: string } = {};
                    try {
                        const parsed = JSON.parse(create!.ChangeContext ?? '{}') as { Kind?: string; Clone?: typeof context };
                        AssertEqual(parsed.Kind, 'Clone', `RC6: the ${created.EntityName} ChangeContext must be a Clone context`);
                        context = parsed.Clone ?? {};
                    } catch (e) {
                        Assert(false, `RC6: ChangeContext is not a clone context: ${create!.ChangeContext} (${e})`);
                    }
                    Assert(!!context.SourceRecordID && UUIDsEqual(bareKey(context.SourceRecordID), bareKey(created.SourceKey)),
                        `RC6: the ${created.EntityName} ChangeContext must name its source ${created.SourceKey} (got ${context.SourceRecordID})`);
                    Assert(!!context.CloneLogID && UUIDsEqual(context.CloneLogID, out.CloneLogID!),
                        `RC6: the ${created.EntityName} ChangeContext must name the clone log`);
                }

                const links = await readRows<{ TargetRecordID: string; Metadata: string | null }>(md, RECORD_LINKS,
                    `LinkType = 'ClonedFrom' AND SourceEntityID = '${entity!.ID}' AND SourceRecordID = '${created.TargetKey}'`,
                    { Fields: ['TargetRecordID', 'Metadata'] });
                AssertEqual(links.length, 1, `RC6: the cloned ${created.EntityName} ${created.TargetKey} must have exactly one ClonedFrom link`);
                Assert(UUIDsEqual(bareKey(links[0].TargetRecordID), bareKey(created.SourceKey)),
                    `RC6: the ClonedFrom link of ${created.EntityName} must point at its source`);
                Assert((links[0].Metadata ?? '').toLowerCase().includes(out.CloneLogID!.toLowerCase()),
                    'RC6: the ClonedFrom link must carry the clone log id');
            }

            const log = (await readRows<{ Status: string; CreatedCount: number }>(md, CLONE_LOGS, `ID = '${out.CloneLogID}'`, { Fields: ['Status', 'CreatedCount'] }))[0];
            Assert(log != null, `RC6: clone log ${out.CloneLogID} not found`);
            AssertEqual(log.Status, 'Complete', 'RC6: the clone log must be Complete');
            AssertEqual(log.CreatedCount, out.Created.length, 'RC6: the clone log CreatedCount must match the rows created');
            const items = await readRows<{ Status: string }>(md, CLONE_LOG_ITEMS, `RecordCloneLogID = '${out.CloneLogID}'`, { Fields: ['Status'] });
            AssertEqual(items.filter((i) => i.Status === 'Created').length, out.Created.length, 'RC6: one Created log item per created row');
            AssertEqual(items.length, out.Counts.Total, 'RC6: one log item per planned row');
        },
    },
    {
        Id: 'record-cloning.RC7',
        Name: 'RC7: executing with a stale plan hash after the source changed returns PLAN_CHANGED with a fresh plan and writes nothing',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const md = ctx.Provider;
            const { UserID: subjectId } = await ensureSubject(ctx);
            const prompted = promptedValuesFor(f, 'rc7');
            const input: RecordCloneExecuteInput = { EntityName: USERS, SourceRecordKey: idKey(subjectId), Options: { PromptedValues: prompted } };

            // Without this the stale-hash assertion below is vacuous: a hash that changes on every
            // plan would make every Execute return PLAN_CHANGED.
            const reviewed = await planClone(md, input, 'RC7');
            const again = await planClone(md, input, 'RC7 replan');
            AssertEqual(again.Hash, reviewed.Hash, 'RC7: re-planning an unchanged user gave a different hash');

            const subject = await md.GetEntityObject<MJUserEntity>(USERS, ctx.User);
            Assert(await subject.Load(subjectId), 'RC7: could not load the subject user');
            subject.Title = `IT95 RC7 changed ${Date.now()}`; // Title is nvarchar(50)
            Assert(await subject.Save(), `RC7: changing the source failed — ${subject.LatestResult?.CompleteMessage}`);

            const logsBefore = await countRows(md, CLONE_LOGS, `RootSourceRecordID = '${subjectId}' AND Status = 'Cancelled'`);
            const stale = await executeClone(md, { ...input, ExpectedPlanHash: reviewed.Hash }, 'RC7 stale');
            trackExecute(ctx, subjectId, stale);
            AssertEqual(stale.ResultCode, 'PLAN_CHANGED', `RC7: a stale plan hash must be refused with PLAN_CHANGED (got ${describeFailure(stale)})`);
            Assert(!stale.Success, 'RC7: a PLAN_CHANGED refusal must not report success');
            Assert(stale.Plan != null && stale.Plan.Hash !== reviewed.Hash, 'RC7: PLAN_CHANGED must return the fresh plan with its new hash');
            AssertEqual(stale.Created.length, 0, 'RC7: a PLAN_CHANGED refusal must create nothing');
            AssertEqual(await countRows(md, USERS, `Email = '${prompted.Email}'`), 0, 'RC7: a PLAN_CHANGED refusal wrote a user');
            AssertEqual(await countRows(md, CLONE_LOGS, `RootSourceRecordID = '${subjectId}' AND Status = 'Cancelled'`), logsBefore + 1,
                'RC7: a PLAN_CHANGED refusal must leave one Cancelled clone log');

            // Positive control: the fresh hash is accepted.
            const fresh = await executeClone(md, { ...input, ExpectedPlanHash: stale.Plan!.Hash }, 'RC7 fresh');
            trackExecute(ctx, subjectId, fresh);
            Assert(fresh.Success && fresh.ResultCode === 'SUCCESS', `RC7: executing with the fresh plan's hash must succeed — ${describeFailure(fresh)}`);

            // The same guarantee for a graph with children: the reviewed hash must survive a re-plan
            // when nothing changed, or every clone of such a graph from the UI is refused.
            const promptSource = await findPromptWithTemplate(ctx);
            const promptInput: RecordClonePlanInput = { EntityName: AI_PROMPTS, SourceRecordKey: idKey(promptSource.ID) };
            const p1 = await planClone(md, promptInput, 'RC7 prompt plan');
            const p2 = await planClone(md, promptInput, 'RC7 prompt replan');
            AssertEqual(p2.Hash, p1.Hash,
                'RC7: re-planning an unchanged AI prompt graph gave a different hash, so Execute with the reviewed hash would always return PLAN_CHANGED');
        },
    },
    {
        Id: 'record-cloning.RC8',
        Name: 'RC8: cloning a Generated action with code does not regenerate code and does not duplicate params, result codes or libraries',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const md = ctx.Provider;
            const generated = await readRows<{ ID: string; Name: string; Code: string; ParentID: string | null }>(md, ACTIONS,
                `Type = 'Generated' AND Code IS NOT NULL`, { Fields: ['ID', 'Name', 'Code', 'ParentID'], OrderBy: 'Name ASC' });
            Assert(generated.length > 0, `RC8: no Generated ${ACTIONS} row with code exists — the fixture data is not what this bundle assumes`);
            // A top-level action keeps the graph to the action and its own children; a child action
            // is only used when no top-level one exists.
            const topLevel = generated.filter((a) => a.ParentID == null);
            const actions = topLevel.length > 0 ? topLevel : generated;
            const counts = async (actionId: string) => ({
                Params: await countRows(md, 'MJ: Action Params', `ActionID = '${actionId}'`),
                ResultCodes: await countRows(md, 'MJ: Action Result Codes', `ActionID = '${actionId}'`),
                Libraries: await countRows(md, 'MJ: Action Libraries', `ActionID = '${actionId}'`),
            });
            // The action with the most children makes a duplication easiest to see.
            let source = actions[0];
            let srcCounts = await counts(source.ID);
            for (const a of actions.slice(1)) {
                const c = await counts(a.ID);
                if (c.Params + c.ResultCodes + c.Libraries > srcCounts.Params + srcCounts.ResultCodes + srcCounts.Libraries) {
                    source = a;
                    srcCounts = c;
                }
            }

            // A child action is cloned as a new child of the SAME parent: the parent is referenced,
            // never copied, and its other children (the source's siblings) are not part of the graph.
            const plan = await planClone(md, { EntityName: ACTIONS, SourceRecordKey: idKey(source.ID) }, 'RC8');
            const actionNodes = nodesOf(plan, ACTIONS);
            AssertEqual(actionNodes.filter((n) => n.Action === 'Create').map((n) => bareKey(n.SourceKey).toLowerCase()).join(','),
                source.ID.toLowerCase(), 'RC8: the plan must create exactly one action, the source itself');
            if (source.ParentID) {
                Assert(actionNodes.some((n) => n.Action === 'Reference' && UUIDsEqual(bareKey(n.SourceKey), source.ParentID!)),
                    'RC8: the parent action must appear as a Reference, not be copied');
            }

            const out = await executeClone(md, { EntityName: ACTIONS, SourceRecordKey: idKey(source.ID) }, 'RC8');
            trackExecute(ctx, source.ID, out);
            Assert(out.Success && out.ResultCode === 'SUCCESS', `RC8: the action clone failed — ${describeFailure(out)}`);
            const cloneId = rootTarget(out, 'RC8');
            AssertEqual(out.Created.filter((c) => c.EntityName === ACTIONS).length, 1, 'RC8: the clone must create exactly one action');

            const clone = (await readRows<{ Code: string | null; ForceCodeGeneration: boolean; ParentID: string | null }>(md, ACTIONS, `ID = '${cloneId}'`,
                { Fields: ['Code', 'ForceCodeGeneration', 'ParentID'] }))[0];
            Assert(clone != null, `RC8: the cloned action ${cloneId} is not readable`);
            Assert(source.ParentID == null ? clone.ParentID == null : (clone.ParentID != null && UUIDsEqual(clone.ParentID, source.ParentID)),
                'RC8: the cloned action must keep the source\'s parent');
            AssertEqual(clone.Code, source.Code, 'RC8: the cloned action\'s code differs from the source — it was regenerated');
            AssertEqual(clone.ForceCodeGeneration, false, 'RC8: a cloned action must not be flagged for code generation');
            const cloneCounts = await counts(cloneId);
            AssertEqual(JSON.stringify(cloneCounts), JSON.stringify(srcCounts),
                'RC8: the clone must carry exactly one copy of each param, result code and library (a server hook duplicated or dropped some)');
            AssertEqual(JSON.stringify(await counts(source.ID)), JSON.stringify(srcCounts), 'RC8: the source action\'s children changed');
        },
    },
    {
        Id: 'record-cloning.RC9',
        Name: 'RC9: a Comments-only update on a Record Change succeeds for an Annotate holder; another column is refused; an unauthorized user is refused',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const md = ctx.Provider;
            const { UserID: subjectId, Denied: denied } = await ensureSubject(ctx);
            const users = md.EntityByName(USERS)!;
            const changes = await readRows<{ ID: string; ChangesDescription: string | null; Comments: string | null }>(md, RECORD_CHANGES,
                `EntityID = '${users.ID}' AND RecordID IN (${sqlList([`ID|${subjectId}`, subjectId])}) AND Type = 'Create'`,
                { Fields: ['ID', 'ChangesDescription', 'Comments'] });
            Assert(changes.length > 0, `RC9: the subject user's creation left no ${RECORD_CHANGES} row to annotate`);
            const changeId = changes[0].ID;

            // The generated base class, constructed directly: in this hybrid process ClassFactory would
            // hand back the SERVER subclass, whose rule would then refuse locally before any request
            // went out. A browser only has the base class, so the refusals below must come from MJAPI.
            const info = md.EntityByName(RECORD_CHANGES)!;
            const load = async (provider: IMetadataProvider | null): Promise<MJRecordChangeEntity> => {
                const rc = new MJRecordChangeEntity(provider ? provider.EntityByName(RECORD_CHANGES)! : info,
                    provider ? (provider as unknown as IEntityDataProvider) : null);
                Assert(await rc.Load(changeId), `RC9: loading record change ${changeId} failed`);
                return rc;
            };
            const readBack = async () => (await readRows<{ ChangesDescription: string | null; Comments: string | null }>(md, RECORD_CHANGES,
                `ID = '${changeId}'`, { Fields: ['ChangesDescription', 'Comments'] }))[0];

            const note = `${f.Prefix} RC9 annotation ${FIXTURE_TAG}`;
            const holder = await load(null);
            holder.Comments = note;
            Assert(await holder.Save(), `RC9: an Annotate holder's Comments-only update was refused — ${holder.LatestResult?.CompleteMessage}`);
            AssertEqual((await readBack()).Comments, note, 'RC9: the annotation did not persist');

            const originalDescription = (await readBack()).ChangesDescription;
            const tamper = await load(null);
            tamper.ChangesDescription = `${f.Prefix} RC9 tampered`;
            Assert(!(await tamper.Save()), 'RC9: an update touching a column other than Comments was allowed on an audit row');
            AssertEqual((await readBack()).ChangesDescription, originalDescription, 'RC9: the refused update changed the row anyway');

            const deniedNote = `${f.Prefix} RC9 denied ${FIXTURE_TAG}`;
            let deniedSaved = false;
            try {
                const outsider = await load(denied);
                outsider.Comments = deniedNote;
                deniedSaved = await outsider.Save();
            } catch (e) {
                // Refused before the update could be sent (e.g. no read access) — still a refusal.
                console.log(`      → the denied identity was refused before the update: ${e instanceof Error ? e.message : String(e)}`);
            }
            Assert(!deniedSaved, 'RC9: a user without Record Changes: Annotate annotated a record change');
            AssertEqual((await readBack()).Comments, note, 'RC9: the refused annotation changed the row anyway');
        },
    },
    {
        Id: 'record-cloning.RC10',
        Name: 'RC10: a plan of an AI prompt that an agent references through AI Agent Prompts contains no AI Agent Prompts or AI Agents nodes',
        Fn: async (ctx: IntegrationCheckContext) => {
            const md = ctx.Provider;
            const links = await readRows<{ PromptID: string; AgentID: string }>(md, AI_AGENT_PROMPTS, '', { Fields: ['PromptID', 'AgentID'], OrderBy: 'PromptID ASC', MaxRows: 1 });
            if (links.length === 0) {
                console.warn(`  ⚠ record-cloning.RC10 SKIPPED — no ${AI_AGENT_PROMPTS} row references a prompt in this database`);
                return;
            }
            const plan = await planClone(md, { EntityName: AI_PROMPTS, SourceRecordKey: idKey(links[0].PromptID) }, 'RC10');
            Assert(!plan.Blocked, `RC10: the plan is blocked — ${plan.Warnings.filter((w) => w.Severity === 'Error').map((w) => w.Message).join('; ')}`);
            Assert(nodesOf(plan, AI_PROMPTS).some((n) => n.Depth === 0), 'RC10: the plan must contain the prompt itself');
            const leaked = plan.Nodes.filter((n) => n.EntityName === AI_AGENT_PROMPTS || n.EntityName === AI_AGENTS);
            AssertEqual(leaked.length, 0,
                `RC10: a prompt plan reached into the agents that use it (${leaked.map((n) => `${n.EntityName}:${n.Action}`).join(', ')}) — unlisted relationships must default to Skip`);
            for (const edge of plan.Edges.filter((e) => e.RelatedEntityName === AI_AGENT_PROMPTS)) {
                AssertEqual(edge.Policy, 'Skip', `RC10: the ${AI_AGENT_PROMPTS} edge resolved to ${edge.Policy} (${edge.PolicySource})`);
            }
        },
    },
    {
        Id: 'record-cloning.RC11',
        Name: 'RC11: a Scheduled Job plan never includes Company Integrations and no FieldChange carries a decrypted encrypted value',
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const md = ctx.Provider;
            const integrations = md.EntityByName(COMPANY_INTEGRATIONS);
            Assert(integrations != null, `RC11: ${COMPANY_INTEGRATIONS} is not in metadata`);

            let jobIds = (await readRows<{ ScheduledJobID: string }>(md, COMPANY_INTEGRATIONS, 'ScheduledJobID IS NOT NULL',
                { Fields: ['ScheduledJobID'], MaxRows: 5 })).map((r) => r.ScheduledJobID);
            let secret: string | undefined;
            if (jobIds.length === 0) {
                if (IsTierEnabled('mutation')) {
                    const provisioned = await provisionCompanyIntegration(ctx);
                    if (provisioned) {
                        jobIds = [provisioned.JobID];
                        secret = provisioned.Secret;
                    }
                } else {
                    console.warn('  ⚠ record-cloning.RC11 — no scheduled job has a company integration, and the mutation tier is off, ' +
                        'so the Company Integrations exclusion is only checked on jobs without one. Set RUN_MUTATION_TESTS=1 to cover it.');
                }
            }
            if (jobIds.length === 0) {
                jobIds = (await readRows<{ ID: string }>(md, SCHEDULED_JOBS, '', { Fields: ['ID'], OrderBy: 'Name ASC', MaxRows: 1 })).map((r) => r.ID);
            }
            if (jobIds.length === 0) {
                console.warn(`  ⚠ record-cloning.RC11 SKIPPED — no ${SCHEDULED_JOBS} rows exist`);
                return;
            }

            for (const jobId of [...new Set(jobIds.map((j) => j.toLowerCase()))]) {
                const plan = await planClone(md, { EntityName: SCHEDULED_JOBS, SourceRecordKey: idKey(jobId) }, 'RC11');
                Assert(nodesOf(plan, SCHEDULED_JOBS).some((n) => n.Depth === 0), 'RC11: the plan must contain the job itself');
                const leaked = nodesOf(plan, COMPANY_INTEGRATIONS);
                AssertEqual(leaked.length, 0,
                    `RC11: a scheduled job plan included ${leaked.length} company integration node(s) (${leaked.map((n) => n.Action).join(', ')})`);

                for (const node of plan.Nodes) {
                    const entity = md.EntityByName(node.EntityName);
                    for (const change of node.FieldChanges) {
                        const field = entity?.Fields.find((x) => x.Name === change.Field);
                        if (!field?.Encrypt) continue;
                        for (const value of [change.OldValue, change.NewValue]) {
                            Assert(value === null || value === ENCRYPTED_SENTINEL,
                                `RC11: ${node.EntityName}.${change.Field} (${change.Kind}) carries an unmasked encrypted value in the Plan output`);
                        }
                    }
                }
                if (secret) {
                    Assert(!JSON.stringify(plan).includes(secret), 'RC11: the company integration\'s decrypted secret appears in the Plan output');
                }
            }
            console.log(`      → planned ${jobIds.length} scheduled job(s)${secret ? ' including a throwaway company integration' : ''} (${f.Prefix})`);
        },
    },
    {
        Id: 'record-cloning.RC12',
        Name: "RC12: a user plan includes roles and applications, no settings by default, and 'with-settings' leaves out device and draft settings",
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = fx(ctx);
            const md = ctx.Provider;
            const users = (await readRows<{ ID: string; Email: string }>(md, USERS, `Email NOT LIKE 'mj-it95-%'`, { Fields: ['ID', 'Email'], OrderBy: 'Email ASC' }));
            const ids = users.map((u) => u.ID);
            Assert(ids.length > 0, `RC12: no ${USERS} rows`);
            const roles = await readRows<{ UserID: string }>(md, USER_ROLES, `UserID IN (${sqlList(ids)})`, { Fields: ['UserID'] });
            const apps = await readRows<{ UserID: string }>(md, USER_APPLICATIONS, `UserID IN (${sqlList(ids)})`, { Fields: ['UserID'] });
            const settings = await readRows<{ ID: string; UserID: string; Setting: string }>(md, USER_SETTINGS, `UserID IN (${sqlList(ids)})`,
                { Fields: ['ID', 'UserID', 'Setting'] });
            const countFor = (rows: Array<{ UserID: string }>, id: string) => rows.filter((r) => UUIDsEqual(r.UserID, id)).length;

            const withChildren = users.find((u) => countFor(roles, u.ID) > 0 && countFor(apps, u.ID) > 0);
            Assert(withChildren != null, 'RC12: no user has both roles and application entries to plan');
            const options = { PromptedValues: promptedValuesFor(f, 'rc12') };
            const plan = await planClone(md, { EntityName: USERS, SourceRecordKey: idKey(withChildren!.ID), Options: options }, 'RC12');
            Assert(!plan.Blocked, `RC12: the plan is blocked — ${plan.Warnings.filter((w) => w.Severity === 'Error').map((w) => w.Message).join('; ')}`);
            AssertEqual(nodesOf(plan, USER_SETTINGS).length, 0, `RC12: ${USER_SETTINGS} must not be copied unless the with-settings preset is chosen`);

            // with-settings: the user with the most settings, so the exclusion has the most to act on.
            const bySettings = [...users].sort((a, b) => countFor(settings, b.ID) - countFor(settings, a.ID))[0];
            if (countFor(settings, bySettings.ID) === 0) {
                console.warn('  ⚠ record-cloning.RC12 — no user has settings, so the with-settings exclusion was not exercised');
            } else {
                await assertWithSettingsPlan(md, bySettings.ID, settings.filter((s) => UUIDsEqual(s.UserID, bySettings.ID)), options);
            }

            // Roles and applications last, so a failure here still reports the settings legs above.
            AssertEqual(nodesOf(plan, USER_ROLES).filter((n) => n.Action === 'Create').length, countFor(roles, withChildren!.ID),
                `RC12: the plan must copy each of the user's ${USER_ROLES}`);
            AssertEqual(nodesOf(plan, USER_APPLICATIONS).filter((n) => n.Action === 'Create').length, countFor(apps, withChildren!.ID),
                `RC12: the plan must copy each of the user's ${USER_APPLICATIONS}`);
        },
    },
];

/** RC12's with-settings leg: every planned setting is the source's own, and none matches an excluded prefix. */
async function assertWithSettingsPlan(
    md: IMetadataProvider,
    userId: string,
    sourceSettings: Array<{ ID: string; Setting: string }>,
    options: { PromptedValues: Record<string, string> }
): Promise<void> {
    const withSettings = await planClone(md, {
        EntityName: USERS, SourceRecordKey: idKey(userId), Options: { ...options, Preset: 'with-settings' },
    }, 'RC12 with-settings');
    Assert(!withSettings.Blocked, 'RC12: the with-settings plan is blocked');
    const planned = nodesOf(withSettings, USER_SETTINGS).map((n) => sourceSettings.find((s) => UUIDsEqual(s.ID, bareKey(n.SourceKey))));
    Assert(planned.every((s) => s != null), 'RC12: the with-settings plan copies a setting the source user does not have');
    const leaked = planned.filter((s) => EXCLUDED_SETTING_PREFIXES.some((p) => s!.Setting.startsWith(p)));
    AssertEqual(leaked.length, 0, `RC12: with-settings copied excluded settings: ${leaked.map((s) => s!.Setting).join(', ')}`);
    const copyable = sourceSettings.filter((s) => !EXCLUDED_SETTING_PREFIXES.some((p) => s.Setting.startsWith(p)));
    Assert(copyable.length === 0 || planned.length > 0, 'RC12: with-settings copied none of the source user\'s ordinary settings');
    const excludedCount = sourceSettings.length - copyable.length;
    console.log(`      → with-settings planned ${planned.length} of ${sourceSettings.length} settings (${excludedCount} matched an excluded prefix)`);
}

for (const check of RecordCloningChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

/**
 * RC11's throwaway fixture: a company (when none exists) and a company integration on the first
 * scheduled job, with a unique marker in an encrypted column. The job itself is not modified.
 * Returns undefined, with the reason logged, when the database cannot hold one (for example no
 * Integration rows, or no encryption key configured for encrypted columns).
 */
async function provisionCompanyIntegration(ctx: IntegrationCheckContext): Promise<{ JobID: string; Secret: string } | undefined> {
    const f = fx(ctx);
    const md = ctx.Provider;
    const jobs = await readRows<{ ID: string }>(md, SCHEDULED_JOBS, '', { Fields: ['ID'], OrderBy: 'Name ASC', MaxRows: 1 });
    const integrationRows = await readRows<{ ID: string }>(md, 'MJ: Integrations', '', { Fields: ['ID'], OrderBy: 'Name ASC', MaxRows: 1 });
    if (jobs.length === 0 || integrationRows.length === 0) {
        console.warn('  ⚠ record-cloning.RC11 — no scheduled job or no integration to build a company integration fixture from');
        return undefined;
    }
    let companyId = (await readRows<{ ID: string }>(md, 'MJ: Companies', '', { Fields: ['ID'], MaxRows: 1 }))[0]?.ID;
    if (!companyId) {
        const company = await md.GetEntityObject<MJCompanyEntity>('MJ: Companies', ctx.User);
        company.NewRecord();
        company.Name = `${f.Prefix}-company`;
        company.Description = FIXTURE_TAG;
        await saveOrThrow(company, 'the RC11 company');
        f.CreatedRows.push({ entity: 'MJ: Companies', id: company.ID });
        companyId = company.ID;
    }
    const secret = `${f.Prefix}-secret-${Math.random().toString(36).slice(2)}`;
    const ci = await md.GetEntityObject<MJCompanyIntegrationEntity>(COMPANY_INTEGRATIONS, ctx.User);
    ci.NewRecord();
    ci.Name = `${f.Prefix}-integration ${FIXTURE_TAG}`;
    ci.CompanyID = companyId;
    ci.IntegrationID = integrationRows[0].ID;
    ci.ScheduledJobID = jobs[0].ID;
    ci.IsActive = false;
    ci.APIKey = secret;
    if (!(await ci.Save())) {
        console.warn(`  ⚠ record-cloning.RC11 — could not create the company integration fixture: ${ci.LatestResult?.CompleteMessage}`);
        return undefined;
    }
    f.CreatedRows.push({ entity: COMPANY_INTEGRATIONS, id: ci.ID });
    return { JobID: jobs[0].ID, Secret: secret };
}

// ─────────────────────────────────────────────────────────────────── teardown

/** Deletes one row by id through the wire; false when it is already gone or the delete was refused. */
async function deleteRow(ctx: IntegrationCheckContext, entityName: string, id: string): Promise<boolean> {
    try {
        const row = await ctx.Provider.GetEntityObject(entityName, ctx.User);
        if (!(await row.InnerLoad(CompositeKey.FromID(id)).catch(() => false))) {
            return true; // already gone
        }
        return await row.Delete();
    } catch {
        return false;
    }
}

/** Deletes every row of `entityName` matching `filter`. */
async function deleteWhere(ctx: IntegrationCheckContext, entityName: string, filter: string): Promise<void> {
    const res = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: entityName, ExtraFilter: filter, Fields: ['ID'], ResultType: 'simple', BypassCache: true,
    }).catch(() => undefined);
    for (const row of res?.Success ? res.Results : []) {
        await deleteRow(ctx, entityName, row.ID);
    }
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('record-cloning', {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Nothing is written here, so a deterministic-only run writes nothing (RC11 aside, and only
        // when the mutation tier is armed). Mutating checks provision on first use.
        ctx.RecordCloningFixture = {
            Prefix: `mj-it95-${Date.now()}`,
            StartedAt: new Date(Date.now() - 60_000),
            CreatedRows: [],
            UserIDs: [],
            SourceRecordIDs: [],
            ApiKeyIDs: [],
            ApiKeyScopeIDs: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = ctx.RecordCloningFixture;
        if (!f) {
            return;
        }
        const since = f.StartedAt.toISOString();

        // 1. Clone logs (and their items) the bundle's Executes wrote, including refusals.
        const logFilters: string[] = [];
        if (f.SourceRecordIDs.length > 0) logFilters.push(`RootSourceRecordID IN (${sqlList(f.SourceRecordIDs)})`);
        if (f.UserIDs.length > 0) logFilters.push(`InitiatedByUserID IN (${sqlList(f.UserIDs)})`);
        if (logFilters.length > 0) {
            const logs = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
                EntityName: CLONE_LOGS, ExtraFilter: `(${logFilters.join(' OR ')}) AND StartedAt >= '${since}'`,
                Fields: ['ID'], ResultType: 'simple', BypassCache: true,
            }).catch(() => undefined);
            for (const log of logs?.Success ? logs.Results : []) {
                await deleteWhere(ctx, CLONE_LOG_ITEMS, `RecordCloneLogID = '${log.ID}'`);
                await deleteRow(ctx, CLONE_LOGS, log.ID);
            }
        }

        // 2. ClonedFrom links whose Source is a row a clone created.
        const createdIds = [...f.CreatedRows.map((r) => r.id), ...f.UserIDs];
        if (createdIds.length > 0) {
            await deleteWhere(ctx, RECORD_LINKS, `LinkType = 'ClonedFrom' AND SourceRecordID IN (${sqlList(createdIds)})`);
        }

        // 3. Created rows, newest first, retried while a pass makes progress (a template can only go
        //    after the prompt that points at it, whatever order the clone reported them in).
        let pending = [...f.CreatedRows].reverse();
        for (let pass = 0; pass < 6 && pending.length > 0; pass++) {
            const failed: typeof pending = [];
            for (const row of pending) {
                if (!(await deleteRow(ctx, row.entity, row.id))) failed.push(row);
            }
            if (failed.length === pending.length) break;
            pending = failed;
        }

        // 4. Throwaway users (the subject and every cloned user) and everything that hangs off them.
        for (const scopeId of f.ApiKeyScopeIDs) await deleteRow(ctx, 'MJ: API Key Scopes', scopeId);
        for (const keyId of f.ApiKeyIDs) {
            await deleteWhere(ctx, 'MJ: API Key Usage Logs', `APIKeyID = '${keyId}'`);
            await deleteRow(ctx, 'MJ: API Keys', keyId);
        }
        if (f.UserIDs.length > 0) {
            const inUsers = `UserID IN (${sqlList(f.UserIDs)})`;
            for (const entity of [USER_SETTINGS, USER_APPLICATIONS, USER_ROLES, 'MJ: User Notification Preferences', 'MJ: Audit Logs', QUERY_CATEGORIES]) {
                await deleteWhere(ctx, entity, inUsers);
            }
            for (const userId of [...f.UserIDs].reverse()) {
                await deleteRow(ctx, USERS, userId);
            }
        }
        ctx.RecordCloningFixture = undefined;
    },
});
