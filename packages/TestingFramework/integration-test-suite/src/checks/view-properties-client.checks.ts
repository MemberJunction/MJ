/**
 * view-properties-client.checks.ts — the 'view-properties-client' bundle (VP1–VP5, client
 * transport, needs MJAPI): User View properties (`MJ: User Views.Properties`,
 * `RunViewParams.Properties`) proven over the GraphQL wire.
 *
 *   VP1: a view run by ViewID with a property value returns only the rows that value matches,
 *        and with no value (and no default) every row of the view.
 *   VP2: a client value for a property that does not allow override is refused, with an error
 *        naming the property, and no rows come back.
 *   VP3: with no value, the server works out a token default (Context.UserID) for the wire
 *        identity, so only that identity's rows come back.
 *   VP4: row-level security still applies on top: the seeded scoped user it-rls-a, run through
 *        its own API key, gets only its own rows from the same view and value.
 *   VP5: the server result cache keys on the property values: two cached runs of one view with
 *        different values each get their own rows.
 *
 * FIXTURE (self-cleaning, all over the wire as the system identity): four `MJ: AI Agent Runs`
 * rows on the first agent — two owned by it-rls-a (Completed, Failed), one by it-rls-b
 * (Completed), one by the wire identity's user (Completed) — and two shared views on that entity whose
 * WhereClause names exactly those four rows: an OPEN view (property `Status`, overridable) and a
 * LOCKED view (`Owner` on UserID, not overridable, defaulting to Context.UserID, plus `Status`).
 * The seeded RLS role reads `MJ: AI Agent Runs` scoped to the reader's own UserID, and can read
 * `MJ: User Views`, which is what VP4 needs. Teardown deletes the views, the runs and the minted
 * key. Checks skip loudly when MJAPI is unreachable or the seed is absent.
 */
import { LogError, RunView } from '@memberjunction/core';
import type { IMetadataProvider, RunViewResult, UserViewProperty, ViewPropertyValues } from '@memberjunction/core';
import type { MJAIAgentRunEntity, MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { UUIDSet } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, SEEDED_SCOPED_A_EMAIL, SEEDED_SCOPED_B_EMAIL, SEED_FIXTURES_COMMAND } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';
import { BuildUserKeyProviderWithRetry, DeleteMintedUserKeys, MintFullAccessUserKey, MintedUserKeyIds } from './fls-client.checks';

const BUNDLE = 'view-properties-client';
const RUNS_ENTITY = 'MJ: AI Agent Runs';

interface AgentRunRow {
    ID: string;
    UserID: string;
    Status: string;
}

interface ViewPropertiesFixture extends MintedUserKeyIds {
    Usable: boolean;
    Reason?: string;
    RunIDs: { ACompleted: string; AFailed: string; BCompleted: string; MeCompleted: string } | null;
    CreatedRunIDs: string[];
    CreatedViewIDs: string[];
    OpenViewID?: string;
    LockedViewID?: string;
    ScopedA?: IMetadataProvider;
}

let fixture: ViewPropertiesFixture | null = null;

const statusProperty: UserViewProperty = { Name: 'Status', Type: 'string', Target: { Field: 'Status', Operator: '=' } };
const ownerProperty: UserViewProperty = {
    Name: 'Owner', Type: 'uuid', AllowOverride: false, Default: { Token: 'Context.UserID' }, Target: { Field: 'UserID', Operator: '=' },
};

function usableFixture(checkId: string): ViewPropertiesFixture | null {
    if (!fixture?.Usable) {
        console.warn(`  ⚠ ${BUNDLE}.${checkId} SKIPPED — ${fixture?.Reason ?? 'fixture not provisioned'}. Seed with \`${SEED_FIXTURES_COMMAND}\` and start MJAPI.`);
        return null;
    }
    return fixture;
}

/** Runs a view by ID over the wire; the GraphQL client needs the entity name and a field list to build its query. */
async function runView(provider: IMetadataProvider, viewID: string, properties?: ViewPropertyValues, bypassCache = true): Promise<RunViewResult<AgentRunRow>> {
    return RunView.FromMetadataProvider(provider).RunView<AgentRunRow>({
        ViewID: viewID,
        EntityName: RUNS_ENTITY,
        Fields: ['ID', 'UserID', 'Status'],
        ResultType: 'simple',
        BypassCache: bypassCache,
        ...(properties !== undefined ? { Properties: properties } : {}),
    });
}

/** Asserts a run succeeded and returned exactly the expected rows, in any order. */
function assertRows(result: RunViewResult<AgentRunRow>, expected: string[], label: string): void {
    Assert(result.Success, `${label}: the run failed: ${result.ErrorMessage}`);
    const got = new UUIDSet(result.Results.map(r => r.ID));
    Assert(
        got.Size === expected.length && expected.every(id => got.Has(id)),
        `${label}: expected rows [${expected.join(', ')}], got [${result.Results.map(r => r.ID).join(', ')}]`,
    );
}

async function findUserId(ctx: IntegrationCheckContext, email: string): Promise<string | undefined> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Users', ExtraFilter: `Email = '${email}'`, Fields: ['ID'], ResultType: 'simple' }, ctx.User);
    return res.Success && res.Results.length === 1 ? res.Results[0].ID : undefined;
}

async function firstAgentId(ctx: IntegrationCheckContext): Promise<string | undefined> {
    const res = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: AI Agents', Fields: ['ID'], MaxRows: 1, ResultType: 'simple' }, ctx.User);
    return res.Success && res.Results.length > 0 ? res.Results[0].ID : undefined;
}

async function createRun(ctx: IntegrationCheckContext, fx: ViewPropertiesFixture, agentId: string, userId: string, status: 'Completed' | 'Failed'): Promise<string> {
    const run = await ctx.Provider.GetEntityObject<MJAIAgentRunEntity>(RUNS_ENTITY, ctx.User);
    run.NewRecord();
    run.AgentID = agentId;
    run.UserID = userId;
    run.Status = status;
    run.StartedAt = new Date();
    if (!(await run.Save())) {
        throw new Error(`creating a fixture agent run failed: ${run.LatestResult?.CompleteMessage ?? ''}`);
    }
    fx.CreatedRunIDs.push(run.ID);
    return run.ID;
}

async function createView(ctx: IntegrationCheckContext, fx: ViewPropertiesFixture, name: string, properties: UserViewProperty[]): Promise<string> {
    const entity = ctx.Provider.EntityByName(RUNS_ENTITY);
    if (!entity) {
        throw new Error(`'${RUNS_ENTITY}' not in client metadata`);
    }
    const view = await ctx.Provider.GetEntityObject<MJUserViewEntityExtended>('MJ: User Views', ctx.User);
    view.NewRecord();
    view.Name = `${name} (mj-integration-test — safe to delete)`;
    view.EntityID = entity.ID;
    view.IsShared = true;
    view.SmartFilterEnabled = false;
    view.WhereClause = `ID IN (${fx.CreatedRunIDs.map(id => `'${id}'`).join(', ')})`;
    view.PropertiesObject = properties;
    if (!(await view.Save())) {
        throw new Error(`creating the '${name}' view failed: ${view.LatestResult?.CompleteMessage ?? ''}`);
    }
    fx.CreatedViewIDs.push(view.ID);
    return view.ID;
}

async function setUp(ctx: IntegrationCheckContext, fx: ViewPropertiesFixture): Promise<void> {
    const [aId, bId, agentId] = await Promise.all([findUserId(ctx, SEEDED_SCOPED_A_EMAIL), findUserId(ctx, SEEDED_SCOPED_B_EMAIL), firstAgentId(ctx)]);
    if (!aId || !bId || !agentId) {
        fx.Reason = !agentId ? 'no AI agent to own the fixture runs' : `seeded scoped users ${SEEDED_SCOPED_A_EMAIL} / ${SEEDED_SCOPED_B_EMAIL} not found`;
        return;
    }
    fx.RunIDs = {
        ACompleted: await createRun(ctx, fx, agentId, aId, 'Completed'),
        AFailed: await createRun(ctx, fx, agentId, aId, 'Failed'),
        BCompleted: await createRun(ctx, fx, agentId, bId, 'Completed'),
        // The wire identity's user (what the server's Context.UserID resolves to), not the CLI's context user.
        MeCompleted: await createRun(ctx, fx, agentId, ctx.Provider.CurrentUser?.ID ?? ctx.User.ID, 'Completed'),
    };
    fx.OpenViewID = await createView(ctx, fx, 'IT View Properties Open', [statusProperty]);
    fx.LockedViewID = await createView(ctx, fx, 'IT View Properties Locked', [ownerProperty, statusProperty]);
    const rawKey = await MintFullAccessUserKey(ctx, fx, aId, 'IT view-properties scoped reader (mj-integration-test — safe to delete)');
    fx.ScopedA = await BuildUserKeyProviderWithRetry(rawKey);
    fx.Usable = true;
}

/** Deletes one fixture row; a failed delete is logged so a leaked row is visible, not silent. */
async function deleteFixture(ctx: IntegrationCheckContext, entityName: string, id: string): Promise<void> {
    try {
        const row = await ctx.Provider.GetEntityObject<MJUserViewEntityExtended | MJAIAgentRunEntity>(entityName, ctx.User);
        if (await row.Load(id) && !(await row.Delete())) {
            LogError(`IT121 teardown: could not delete ${entityName} ${id}: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    } catch (err) {
        LogError(`IT121 teardown: could not delete ${entityName} ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

async function tearDown(ctx: IntegrationCheckContext, fx: ViewPropertiesFixture): Promise<void> {
    for (const id of fx.CreatedViewIDs) await deleteFixture(ctx, 'MJ: User Views', id);
    for (const id of fx.CreatedRunIDs) await deleteFixture(ctx, RUNS_ENTITY, id);
    await DeleteMintedUserKeys(ctx, fx).catch(err => LogError(`IT121 teardown: could not delete the minted API keys: ${err instanceof Error ? err.message : String(err)}`));
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext): Promise<void> => {
        const fx: ViewPropertiesFixture = { Usable: false, RunIDs: null, CreatedRunIDs: [], CreatedViewIDs: [], CreatedKeyIds: [], CreatedScopeRuleIds: [] };
        fixture = fx;
        try {
            await setUp(ctx, fx);
        } catch (e) {
            fx.Usable = false;
            fx.Reason = `provisioning failed: ${e instanceof Error ? e.message : String(e)}`;
        }
    },
    Teardown: async (ctx: IntegrationCheckContext): Promise<void> => {
        if (fixture) {
            await tearDown(ctx, fixture);
        }
        fixture = null;
    },
});

export const ViewPropertiesClientChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.VP1`,
        Name: 'VP1: a view run by ViewID with a property value over GraphQL returns only the matching rows',
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('VP1');
            if (!fx?.RunIDs) return;
            const r = fx.RunIDs;
            assertRows(await runView(ctx.Provider, fx.OpenViewID!, { Status: 'Completed' }), [r.ACompleted, r.BCompleted, r.MeCompleted], 'VP1 Completed');
            assertRows(await runView(ctx.Provider, fx.OpenViewID!, { Status: 'Failed' }), [r.AFailed], 'VP1 Failed');
            assertRows(await runView(ctx.Provider, fx.OpenViewID!, {}), [r.ACompleted, r.AFailed, r.BCompleted, r.MeCompleted], 'VP1 no value');
        },
    },
    {
        Id: `${BUNDLE}.VP2`,
        Name: 'VP2: a client value for a property that does not allow override is refused, naming the property',
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('VP2');
            if (!fx?.RunIDs) return;
            const result = await runView(ctx.Provider, fx.LockedViewID!, { Owner: fx.RunIDs.BCompleted });
            Assert(!result.Success, 'VP2: a client value for the locked Owner property was ACCEPTED');
            Assert((result.ErrorMessage ?? '').includes('View property "Owner"'), `VP2: the refusal does not name the property: ${result.ErrorMessage}`);
            AssertEqual(result.Results?.length ?? 0, 0, 'VP2: a refused run returned rows');
        },
    },
    {
        Id: `${BUNDLE}.VP3`,
        Name: 'VP3: with no value, the server applies the Context.UserID token default for the wire identity',
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('VP3');
            if (!fx?.RunIDs) return;
            assertRows(await runView(ctx.Provider, fx.LockedViewID!, {}), [fx.RunIDs.MeCompleted], 'VP3 token default');
            assertRows(await runView(ctx.Provider, fx.LockedViewID!, { Status: 'Failed' }), [], 'VP3 token default and a client Status');
        },
    },
    {
        Id: `${BUNDLE}.VP4`,
        Name: 'VP4: row-level security still applies on top: the scoped reader gets only its own rows',
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('VP4');
            if (!fx?.RunIDs || !fx.ScopedA) return;
            const r = fx.RunIDs;
            assertRows(await runView(fx.ScopedA, fx.OpenViewID!, { Status: 'Completed' }), [r.ACompleted], 'VP4 scoped reader, Completed');
            assertRows(await runView(fx.ScopedA, fx.OpenViewID!, {}), [r.ACompleted, r.AFailed], 'VP4 scoped reader, no value');
            assertRows(await runView(fx.ScopedA, fx.LockedViewID!, {}), [r.ACompleted, r.AFailed], 'VP4 scoped reader, token default');
        },
    },
    {
        Id: `${BUNDLE}.VP5`,
        Name: 'VP5: the server result cache keys on property values: each value gets its own rows from a cached run',
        Fn: async (ctx: IntegrationCheckContext) => {
            const fx = usableFixture('VP5');
            if (!fx?.RunIDs) return;
            const r = fx.RunIDs;
            for (let pass = 0; pass < 2; pass++) {
                assertRows(await runView(ctx.Provider, fx.OpenViewID!, { Status: 'Completed' }, false), [r.ACompleted, r.BCompleted, r.MeCompleted], `VP5 Completed (pass ${pass + 1})`);
                assertRows(await runView(ctx.Provider, fx.OpenViewID!, { Status: 'Failed' }, false), [r.AFailed], `VP5 Failed (pass ${pass + 1})`);
            }
        },
    },
];

for (const check of ViewPropertiesClientChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
